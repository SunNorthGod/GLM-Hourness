/**
 * The trial run (takeover design 0.6 §1.4 bootstrap-trial #1–#4, #6, #7 at
 * L2; §15.1): the whitelist environment, which commands may run before the
 * human agrees, the order of a round, the classification of a settled run,
 * the environment key, the time and timeout wording, and real subprocesses
 * in a real copy of HEAD under a fake `confine` that hands the argv back as
 * it is (the shape of rc.3's ConfinedArgv, H13). What the sandbox itself
 * blocks on disk is L3's (`bootstrap-trial`, U1, U2, U4, U7–U9).
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { DEFAULTS_VERSION } from '../src/bootstrap/defaults.ts'
import { afterTrialText, classTimeout, durationText, executorTimeout, timeoutPart } from '../src/bootstrap/present.ts'
import { scanWorkspace } from '../src/bootstrap/scan.ts'
import { trialEnv, TRIAL_ENV_VERSION } from '../src/bootstrap/trial-env.ts'
import { classify, defaultTexts, eligibility, envKeyOf, probesOf, shellArgv, trialCommands, type ConfinedFacts, type TrialCommand } from '../src/bootstrap/trial-plan.ts'
import { readTrialFile, runTrial, sweepTrialDirs, TRIAL_PREFIX, type TrialFile, type TrialResult } from '../src/bootstrap/trial.ts'
import { finishedNotice, isCheckerCommand, maybeStartRound, redCheckers, trialStatusLines } from '../src/bootstrap/trial-round.ts'
import { reminderText, type ReminderFacts } from '../src/bootstrap/notice.ts'
import type { EmittedEvent } from '../src/shared/metrics.ts'
import type { UserNotice } from '../src/shared/dsh-min.ts'
import { checkTimeout } from '../src/env/timeout.ts'
import { openEngine } from '../src/graph/engine.ts'
import { loadGraph } from '../src/graph/store.ts'
import type { SandboxLike } from '../src/shared/dsh-min.ts'
import { openTakeover } from '../src/bootstrap/takeover.ts'
import { git, scanFixture } from './bootstrap-host.ts'

const WINDOWS_ACL: ConfinedFacts = {
  enforcement: 'partial',
  denialSignatures: ['access is denied', 'access to the path', 'permission denied', 'operation not permitted'],
  runnerFailureRules: [{ allowedExitCodes: [127], fatalSignatures: ['windows-acl-run: '] }],
}

/** A fake sandbox: the argv comes back as it is, with the facts of the Windows rung (H13). */
const passThrough = (calls: string[][] = []): SandboxLike => ({
  confine: (argv) => {
    calls.push([...argv])
    return Promise.resolve({ argv: [...argv], ...WINDOWS_ACL })
  },
})

/** A committed project with a few scripts the trial runs by path (no quotes: they pass through `cmd.exe /d /s /c` as written). */
function fixture(): { readonly root: string, readonly head: string } {
  const root = mkdtempSync(join(tmpdir(), 'bootstrap-trial-'))
  const files: Record<string, string> = {
    'package.json': `${JSON.stringify({ name: 'demo', scripts: { test: 'node --test', deploy: 'node scripts/deploy.js' } }, null, 2)}\n`,
    'package-lock.json': '{}\n',
    'scripts/pass.js': 'console.log("ok")\n',
    'scripts/fail.js': 'console.error("assertion failed: Access is denied in the fixture text"); process.exit(1)\n',
    'scripts/sleep.js': 'setTimeout(() => {}, 60000)\n',
    'scripts/env.js': 'const names = ["GITHUB_TOKEN", "GIT_CONFIG_COUNT", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "GIT_CONFIG_NOSYSTEM"]; console.log(JSON.stringify(Object.fromEntries(names.map(n => [n, process.env[n] ?? null]))))\n',
    'scripts/shape.js': 'const fs = require("fs"); console.log(JSON.stringify({ untracked: fs.existsSync("untracked.txt"), hooks: fs.existsSync(".git/hooks") ? fs.readdirSync(".git/hooks").length : 0, alternates: fs.existsSync(".git/objects/info/alternates"), remotes: require("child_process").execFileSync("git", ["remote"], { encoding: "utf8" }).trim() }))\n',
    'src/a.js': 'export const a = 1\n',
    'src/b.js': 'export const b = 1\n',
    'src/c.js': 'export const c = 1\n',
    'src/d.js': 'export const d = 1\n',
  }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, ...path.split('/').slice(0, -1)), { recursive: true })
    writeFileSync(join(root, ...path.split('/')), text)
  }
  git(root, 'init', '-q')
  git(root, 'add', '.')
  git(root, 'commit', '-q', '-m', 'first')
  git(root, 'remote', 'add', 'origin', 'https://example.invalid/demo.git')
  writeFileSync(join(root, 'untracked.txt'), 'not in the copy\n')
  return { root, head: git(root, 'rev-parse', 'HEAD').trim() }
}

const command = (text: string, rest: Partial<TrialCommand> = {}): TrialCommand => ({ id: text.replace(/[^a-z0-9]+/gi, '-').slice(0, 12), text, kind: 'gate', cls: 'gate', node: 'norm-merge-gate', origin: 'scan', ...rest })

test('the environment of a trial command: the whitelist, home and caches in the trial directory, git without its configuration, no token (§6.2 item 3, bootstrap-trial #2)', () => {
  const env = trialEnv({
    env: { Path: 'C:\\bin', ComSpec: 'C:\\Windows\\system32\\cmd.exe', GITHUB_TOKEN: 'ghp_x', NPM_TOKEN: 'n', AWS_SECRET_ACCESS_KEY: 'a', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'k', DSH_HOME: 'd', GLM_HOURNESS_CREDENTIAL_SECRET: 's', USERPROFILE: 'C:\\Users\\me', APPDATA: 'C:\\Users\\me\\AppData\\Roaming', GOROOT: 'C:\\go' },
    dir: 'C:\\t\\hourness-trial-x', realHome: 'C:\\Users\\me', platform: 'win32', exists: path => path === join('C:\\Users\\me', '.rustup'),
  })
  for (const name of ['GITHUB_TOKEN', 'NPM_TOKEN', 'AWS_SECRET_ACCESS_KEY', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'DSH_HOME', 'GLM_HOURNESS_CREDENTIAL_SECRET']) assert.equal(env[name], undefined, name)
  assert.equal(env.Path, 'C:\\bin', 'PATH passes under the spelling the host has')
  assert.equal(env.GOROOT, 'C:\\go')
  assert.equal(env.RUSTUP_HOME, join('C:\\Users\\me', '.rustup'), 'a tool chain in its default place is set by its real path')
  assert.equal(env.HOME, join('C:\\t\\hourness-trial-x', 'home'))
  assert.equal(env.USERPROFILE, join('C:\\t\\hourness-trial-x', 'home'))
  assert.equal(env.APPDATA, join('C:\\t\\hourness-trial-x', 'home', 'AppData', 'Roaming'))
  assert.equal(env.LOCALAPPDATA, join('C:\\t\\hourness-trial-x', 'home', 'AppData', 'Local'))
  assert.equal(env.npm_config_cache, join('C:\\t\\hourness-trial-x', 'cache', 'npm'))
  assert.equal(env.GIT_CONFIG_NOSYSTEM, '1')
  assert.equal(env.GIT_CONFIG_GLOBAL, join('C:\\t\\hourness-trial-x', 'home', '.gitconfig'))
  assert.equal(env.GIT_TERMINAL_PROMPT, '0')
  assert.match(env.GIT_SSH_COMMAND ?? '', /BatchMode=yes/)
})

test('only commands word for word from a HEAD candidate or the default table run before the human agrees; publishing, long-running and multi-line ones do not (§6.1 conditions 1–4, bootstrap-trial #1)', async () => {
  const { root } = fixture()
  const { scan, files } = await scanWorkspace(root, { graphDir: join(root, 'docs', 'graph') })
  const sources = { scan, defaults: defaultTexts(scan, files, 'win32', false) }
  assert.deepEqual(eligibility('npm test', sources, 'norm-merge-gate'), { origin: 'scan' })
  assert.deepEqual(eligibility('  npm test  ', sources, 'norm-merge-gate'), { origin: 'scan' }, 'surrounding blanks are not part of the text')
  assert.deepEqual(eligibility('npm ci', sources, 'norm-merge-gate'), { origin: 'default' })
  assert.deepEqual(eligibility('npm test -- --watch=false', sources, 'norm-merge-gate'), { origin: 'agent', refused: '没试跑：命令是 agent 写的（来自 norm-merge-gate）' })
  assert.match(eligibility('npm run deploy', sources, 'x').refused ?? '', /^没试跑：看起来会对外发布或部署（deploy）$/)
  const extra = { ...scan, candidates: [...scan.candidates, { ...scan.candidates[0], id: 'w', text: 'npm run watch', name: 'watch', danger: null, longRunning: true }, { ...scan.candidates[0], id: 'm', text: 'npm run build', name: 'build', danger: null, longRunning: false, multiline: true }] }
  assert.equal(eligibility('npm run watch', { ...sources, scan: extra }, 'x').refused, '没试跑：会一直跑下去')
  assert.equal(eligibility('npm run build', { ...sources, scan: extra }, 'x').refused, '没试跑：CI 里的多行脚本')
  // Without commits the candidates come from the working tree: none of them counts (`npm test` is also a default, so the defaults are left out here).
  assert.equal(eligibility('npm test', { scan: { ...scan, sources: { ...scan.sources, from: 'worktree' } }, defaults: new Set() }, 'x').origin, 'agent')
})

test('a round runs the gate\'s setup, plain, when and check lines, then patrol; a check line fills {files} with at most three tracked files by path (§6.3 order)', async () => {
  const { root } = fixture()
  const { scan, files } = await scanWorkspace(root, { graphDir: join(root, 'docs', 'graph') })
  const dir = join(root, 'docs', 'graph')
  const engine = openEngine(dir)
  assert.ok((await engine.apply('human', { op: 'propose', reason: '种子', node: { type: 'goal', title: '目标' } })).ok)
  assert.ok((await engine.apply('human', { op: 'propose', reason: '种子', node: { type: 'norm', id: 'norm-merge-gate', title: '合入前的检查', parent: 'goal-1', acceptance: ['`patrol $ npm audit`', '`$ node scripts/pass.js when src/`', '`$ npm test`', '`setup $ npm ci`', '`$ npm run deploy`', '每次合入前跑', '`push`'] } })).ok)
  assert.ok((await engine.apply('human', { op: 'propose', reason: '种子', node: { type: 'feature', id: 'env', title: '环境', parent: 'goal-1' } })).ok)
  const tool = await engine.apply('human', { op: 'propose', reason: '种子', node: { type: 'tool', title: 'ESLint', parent: 'env', acceptance: ['`check eslint eslint-json 8s $ node node_modules/eslint/bin/eslint.js --format json {files}` when *.js'] } })
  assert.ok(tool.ok)
  const graph = await loadGraph(dir)
  const commands = trialCommands(graph.nodes.get('norm-merge-gate'), [...graph.nodes.values()], files, { scan, defaults: defaultTexts(scan, files, 'win32', false) })
  assert.deepEqual(commands.map(item => [item.kind, item.text, item.refused ?? '']), [
    ['setup', 'npm ci', ''],
    ['gate', 'npm test', ''],
    ['gate', 'npm run deploy', '没试跑：看起来会对外发布或部署（deploy）'],
    ['when', 'node scripts/pass.js', '没试跑：命令是 agent 写的（来自 norm-merge-gate）'],
    ['check', 'node node_modules/eslint/bin/eslint.js --format json {files}', ''],
    ['patrol', 'npm audit', '没试跑：命令是 agent 写的（来自 norm-merge-gate）'],
  ])
  const check = commands.find(item => item.kind === 'check')
  assert.deepEqual(check?.argv?.slice(-3), ['scripts/env.js', 'scripts/fail.js', 'scripts/pass.js'], 'the first three tracked *.js by path')
  assert.equal(check?.estimateSec, 8)
  assert.equal(check?.cls, 'check')
  assert.deepEqual(commands.map(item => item.cls), ['gate', 'gate', 'gate', 'gate', 'check', 'patrol'])
})

test('a settled run reads as sandbox-broken, confinement-limited with the matched line, denied, passed or failed (§6.2 item 5, bootstrap-trial #5, #7)', () => {
  assert.deepEqual(classify(127, 'windows-acl-run: missing --workspace', WINDOWS_ACL, 'win32'), { outcome: 'sandbox-broken', matchedLine: 'windows-acl-run: missing --workspace' })
  assert.deepEqual(classify(1, 'windows-acl-run: something', WINDOWS_ACL, 'win32').outcome, 'failed', 'the runner rule is gated on exit 127')
  assert.deepEqual(classify(1, 'npm ERR!\nError: spawn EPERM\n    at x', WINDOWS_ACL, 'win32'), { outcome: 'confinement-limited', matchedLine: 'Error: spawn EPERM' })
  // A test that fails on its own, with the words in its output, lands there too; the line lets the human tell.
  assert.deepEqual(classify(1, 'not ok 1 - expected "Access is denied" to be shown', WINDOWS_ACL, 'win32'), { outcome: 'confinement-limited', matchedLine: 'not ok 1 - expected "Access is denied" to be shown' })
  assert.equal(classify(1, 'x'.repeat(300) + ' EPERM', WINDOWS_ACL, 'win32').matchedLine?.length, 200)
  const bwrap: ConfinedFacts = { enforcement: 'full', denialSignatures: ['read-only file system'], runnerFailureRules: [{ fatalSignatures: ['bwrap: '] }] }
  assert.deepEqual(classify(1, "touch: cannot touch '/home/me/x': Read-only file system", bwrap, 'linux'), { outcome: 'denied', matchedLine: "touch: cannot touch '/home/me/x': Read-only file system", target: '/home/me/x' })
  assert.equal(classify(1, 'bwrap: Can\'t mount proc', bwrap, 'linux').outcome, 'sandbox-broken')
  assert.equal(classify(0, 'EPERM', WINDOWS_ACL, 'win32').outcome, 'passed')
  assert.equal(classify(2, 'boom', WINDOWS_ACL, 'win32').outcome, 'failed')
  assert.equal(classify(null, 'EPERM', WINDOWS_ACL, 'win32').outcome, 'failed', 'a signal death is no confinement verdict')
})

test('the environment key changes with the probes\' output, the enforcement and the platform; the probes are the recognised rows\' (§6.3)', () => {
  const key = envKeyOf('win32', 'partial', ['node --version\nv22.20.0'])
  assert.match(key, /^[0-9a-f]{12}$/)
  assert.equal(envKeyOf('win32', 'partial', ['node --version\nv22.20.0']), key)
  assert.notEqual(envKeyOf('win32', 'partial', ['node --version\nv24.0.0']), key)
  assert.notEqual(envKeyOf('win32', 'full', ['node --version\nv22.20.0']), key)
  assert.notEqual(envKeyOf('linux', 'partial', ['node --version\nv22.20.0']), key)
  assert.ok(TRIAL_ENV_VERSION.length > 0 && DEFAULTS_VERSION.length > 0)
  assert.deepEqual(probesOf(scanFixture({ stacks: ['node-npm'] }), false), ['node --version', 'npm --version'])
  assert.ok(probesOf(scanFixture({}), true).includes('cargo clippy --version'), 'a new project probes every row')
  assert.deepEqual(shellArgv('npm test', 'win32', 'C:\\Windows\\system32\\cmd.exe'), ['C:\\Windows\\system32\\cmd.exe', '/d', '/s', '/c', 'npm test'])
  assert.deepEqual(shellArgv('npm test', 'linux', undefined), ['/bin/sh', '-c', 'npm test'])
})

test('times and timeouts are written one way: durationText, executorTimeout over M4\'s checkTimeout, afterTrialText per class (§7.3 items 1, 2; U13)', () => {
  assert.deepEqual([45, 89, 90, 133, 150, 1800].map(sec => durationText(sec, 'gate')), ['45 秒', '89 秒', '2 分', '2 分', '3 分', '30 分'])
  assert.deepEqual([90, 24].map(sec => durationText(sec, 'check')), ['90 秒', '24 秒'])
  for (const estimate of [1, 8, 20, 25, 90]) assert.equal(executorTimeout('check', estimate).timeoutSec * 1000, checkTimeout({ estimateS: estimate, recentMs: [] }).limitMs, String(estimate))
  assert.deepEqual(executorTimeout('check', 1), { timeoutSec: 5, source: 'estimate', estimateReaches: true, clamp: 'floor' })
  assert.deepEqual(executorTimeout('check', 30), { timeoutSec: 60, source: 'estimate', estimateReaches: true, clamp: 'ceiling' })
  assert.deepEqual(executorTimeout('check'), { timeoutSec: 60, source: 'default', estimateReaches: false })
  assert.deepEqual(executorTimeout('gate', 45), { timeoutSec: 1800, source: 'default', estimateReaches: false }, 'the estimate does not reach the merge gate yet')
  assert.equal(timeoutPart('check', executorTimeout('check', 8)), '超时 24 秒')
  assert.equal(timeoutPart('check', executorTimeout('check', 30)), '超时 60 秒（到上限）')
  assert.equal(afterTrialText('gate', classTimeout('gate')), '同意之后由合入前的检查第一次跑它，超时 30 分（默认）')
  assert.equal(afterTrialText('check', classTimeout('check')), '同意之后由改完文件就跑的检查在改了文件之后第一次跑它，超时 60 秒（默认）')
  assert.equal(afterTrialText('patrol', classTimeout('patrol')), '同意之后由夜里的巡检第一次跑它，超时 30 分（默认）')
  assert.equal(afterTrialText('check', classTimeout('check'), 600), '同意之后由改完文件就跑的检查在改了文件之后第一次跑它，超时 60 秒（默认）；试跑里它没跑完，这里的上限更短，那一次多半也跑不完，结局是『没跑完』，下一次改动照常再跑')
  assert.equal(afterTrialText('gate', classTimeout('gate'), 600), '同意之后由合入前的检查第一次跑它，超时 30 分（默认）', '600 seconds are under the gate\'s 30 minutes')
  assert.equal(afterTrialText('patrol', classTimeout('patrol'), 1800), '同意之后由夜里的巡检第一次跑它，超时 30 分（默认）；试跑里它没跑完，这里的上限更短，那一次多半也跑不完')
  // The 「超时 …」 of the sentence is word for word the list column's.
  assert.ok(afterTrialText('check', classTimeout('check', 8)).endsWith(timeoutPart('check', classTimeout('check', 8))))
})

test('without a sandbox nothing runs and every command says so (§6.1 condition 5, bootstrap-trial #3)', async () => {
  const { root, head } = fixture()
  const tmp = mkdtempSync(join(tmpdir(), 'trial-tmp-'))
  const file = await runTrial({ root, takeoverId: 'tk-nosandbx', head, round: 1, commands: [command('node scripts/pass.js'), command('npm run deploy', { refused: '没试跑：看起来会对外发布或部署（deploy）' })], probes: [], sandbox: undefined, totalMs: 60_000, tmp })
  assert.equal(file.done, true)
  assert.equal(file.reason, '这台机器上 DSH 的沙盒不可用：没有试跑')
  assert.deepEqual(file.results.map(result => [result.outcome, result.reason]), [['not-run', '这台机器上 DSH 的沙盒不可用：没有试跑'], ['not-run', '没试跑：看起来会对外发布或部署（deploy）']])
  assert.deepEqual(readdirSync(tmp), [], 'no trial directory was made')
  assert.deepEqual(readTrialFile(root, 'tk-nosandbx')?.results.length, 2)
  // A sandbox that refuses (SANDBOX_UNAVAILABLE) runs nothing either.
  const refusing: SandboxLike = { confine: () => Promise.reject(Object.assign(new Error('sandbox mode "workspace-write" is requested but no sandbox backend is usable on this host'), { code: 'SANDBOX_UNAVAILABLE' })) }
  const refused = await runTrial({ root, takeoverId: 'tk-refused1', head, round: 1, commands: [command('node scripts/pass.js')], probes: [], sandbox: refusing, totalMs: 60_000, tmp })
  assert.match(refused.reason ?? '', /^这台机器上 DSH 的沙盒不可用：没有试跑（sandbox mode/)
  assert.deepEqual(refused.results.map(result => result.outcome), ['not-run'])
  assert.deepEqual(readdirSync(tmp), [], 'the trial directory is removed')
})

test('a round in a copy of HEAD: passed, failed, timed out with the tree ended and the rest still run, the whitelist seen by the child, no remote, no hooks, no untracked file, logs kept, the directory removed (§6.2, §6.3, bootstrap-trial #2, #4)', async () => {
  const { root, head } = fixture()
  const tmp = mkdtempSync(join(tmpdir(), 'trial-tmp-'))
  const calls: string[][] = []
  const settled: TrialResult[] = []
  const commands = [
    command('node scripts/shape.js', { kind: 'setup' }),
    command('node scripts/pass.js'),
    command('node scripts/fail.js'),
    command('node scripts/sleep.js'),
    command('node scripts/env.js'),
    command('git push origin HEAD'),
    command('node node_modules/eslint/bin/eslint.js {files}', { kind: 'check', cls: 'check', node: 'tool-1', argv: ['node', 'scripts/pass.js', 'src/a.js'], estimateSec: 8 }),
  ]
  const file = await runTrial({
    root, takeoverId: 'tk-roundone', head, round: 1, commands, probes: ['node --version'], sandbox: passThrough(calls), totalMs: 120_000, commandMs: 3_000, tmp,
    env: { ...process.env, GITHUB_TOKEN: 'ghp_secret', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.x', GIT_CONFIG_VALUE_0: 'y' },
    settled: (result) => { settled.push(result) },
  })
  assert.equal(file.done, true)
  const by = new Map(file.results.map(result => [result.text, result]))
  assert.equal(by.get('node scripts/pass.js')?.outcome, 'passed')
  assert.equal(by.get('node scripts/pass.js')?.exit, 0)
  // The fixture's failure prints "Access is denied": on Windows under partial enforcement that reads as not conclusive, with the line (#7).
  const failed = by.get('node scripts/fail.js')
  assert.equal(failed?.outcome, process.platform === 'win32' ? 'confinement-limited' : 'failed')
  if (process.platform === 'win32') assert.equal(failed?.matchedLine, 'assertion failed: Access is denied in the fixture text')
  const slept = by.get('node scripts/sleep.js')
  assert.equal(slept?.outcome, 'timed-out')
  assert.equal(slept?.limitMs, 3_000)
  assert.equal(slept?.limitSource, 'ceiling')
  assert.ok((slept?.ms ?? 0) >= 3_000, `ran ${String(slept?.ms)} ms`)
  assert.equal(by.get('node scripts/env.js')?.outcome, 'passed', 'the commands after the timeout still ran')
  assert.notEqual(by.get('git push origin HEAD')?.outcome, 'passed', 'no remote in the copy: the push fails')
  assert.equal(by.get('node node_modules/eslint/bin/eslint.js {files}')?.outcome, 'passed', 'a check line runs its own argument vector')
  assert.deepEqual(calls.at(-1), ['node', 'scripts/pass.js', 'src/a.js'], 'a check line is confined as its argv, without a shell')
  assert.equal(calls[0]?.at(-1), process.platform === 'win32' ? 'ver' : 'true', 'the warm-up is the first wrap')
  assert.deepEqual(settled.map(result => result.text), commands.map(item => item.text), 'one settled call per command, in order')
  const logOf = (text: string): string => readFileSync(join(root, ...(by.get(text)?.log ?? '').split('/')), 'utf8')
  const shape = JSON.parse(logOf('node scripts/shape.js').trim().split('\n').at(-1) ?? '{}') as Record<string, unknown>
  assert.deepEqual(shape, { untracked: false, hooks: 0, alternates: true, remotes: '' }, 'a shared clone without remote, hooks or untracked files')
  const seen = JSON.parse(logOf('node scripts/env.js').trim().split('\n').at(-1) ?? '{}') as Record<string, string | null>
  assert.equal(seen.GITHUB_TOKEN, null)
  assert.equal(seen.GIT_CONFIG_COUNT, null)
  assert.equal(seen.GIT_CONFIG_NOSYSTEM, '1')
  for (const name of ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) assert.ok(String(seen[name]).includes(TRIAL_PREFIX), `${name} is in the trial directory: ${String(seen[name])}`)
  assert.match(logOf('node scripts/pass.js'), /^command: node scripts\/pass\.js\n/)
  assert.doesNotMatch(logOf('node scripts/env.js'), /ghp_secret/, 'the log names variables, never values')
  assert.match(file.envKey, /^[0-9a-f]{12}$/)
  assert.deepEqual(readdirSync(tmp), [], 'the trial directory is removed after the round')
  assert.equal(readTrialFile(root, 'tk-roundone')?.results.length, commands.length)
  // The next round reuses what ran on the same head, text and environment key.
  const again = await runTrial({ root, takeoverId: 'tk-roundone', head, round: 2, commands: commands.slice(1, 2), probes: ['node --version'], sandbox: passThrough(), totalMs: 120_000, tmp, previous: file })
  assert.equal(again.results[0]?.outcome, 'passed')
  assert.equal(again.results[0]?.log, by.get('node scripts/pass.js')?.log, 'the earlier run\'s log, not a new one')
})

test('a round out of total time lists the rest as not run with the total and the time used (§6.1 condition 6)', async () => {
  const { root, head } = fixture()
  const tmp = mkdtempSync(join(tmpdir(), 'trial-tmp-'))
  let clock = 0
  const sandbox: SandboxLike = { confine: (argv) => { clock += 30 * 60_000; return Promise.resolve({ argv: [...argv], ...WINDOWS_ACL }) } }
  const file = await runTrial({ root, takeoverId: 'tk-outoftim', head, round: 1, commands: [command('node scripts/pass.js'), command('node scripts/env.js')], probes: [], sandbox, totalMs: 45 * 60_000, tmp, now: () => clock })
  assert.equal(file.results[0]?.outcome, 'passed')
  assert.deepEqual([file.results[1]?.outcome, file.results[1]?.reason], ['not-run', '没试跑：试跑时间用完了（合计上限 45 分钟，已用 60 分钟）'])
})

test('the residue of a host that died: a live command process is ended only when its command line names the directory; then the directory goes (§6.3, bootstrap-trial #6)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'trial-tmp-'))
  const sleeper = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' })
  try {
    const pid = sleeper.pid ?? 0
    const dead = 2 ** 22 + 12345
    const make = (name: string, marker: Record<string, unknown>): string => {
      const dir = join(tmp, `${TRIAL_PREFIX}${name}`)
      mkdirSync(join(dir, 'repo'), { recursive: true })
      writeFileSync(join(dir, '.hourness-trial'), JSON.stringify({ dir, ...marker }))
      return dir
    }
    const named = make('named', { hostPid: dead, commandPid: pid })
    const other = make('other', { hostPid: dead, commandPid: pid })
    const live = make('live', { hostPid: pid })
    const own = make('own', { hostPid: process.pid })
    mkdirSync(join(tmp, `${TRIAL_PREFIX}unmarked`))
    mkdirSync(join(tmp, 'unrelated'))
    const killed: number[] = []
    const lines = new Map([[named, `node runner.js --workspace ${named} -- cmd.exe /d /s /c npm test`], [other, 'node something-else.js']])
    let asked = 0
    const outcome = await sweepTrialDirs({
      tmp, self: process.pid, kill: (target) => { killed.push(target) },
      readCommandLine: () => { asked += 1; return Promise.resolve(asked === 1 ? lines.get(named) : lines.get(other)) },
    })
    assert.deepEqual(killed, [pid], 'ended once: for the directory its command line names')
    // A marker naming this process with no round of it running is a dead host whose pid was reused: it goes.
    assert.deepEqual([...outcome.removed].sort(), [named, other, own].sort())
    assert.deepEqual([...outcome.skipped], [live], 'a live host\'s directory stays')
    assert.ok(existsSync(join(tmp, `${TRIAL_PREFIX}unmarked`)), 'a directory without the marker is never removed')
    assert.ok(existsSync(join(tmp, 'unrelated')))
  }
  finally {
    sleeper.kill()
  }
})

test('a round starts once the takeover\'s own merge gate is on the graph, writes a journal trial record and a bootstrap.trial event per command, notifies at the end, and runs the same plan once (§6.3, bootstrap-trial #4)', async () => {
  const { root } = fixture()
  const tmp = mkdtempSync(join(tmpdir(), 'trial-tmp-'))
  const dir = join(root, 'docs', 'graph')
  const opened = await openTakeover(root, { path: 'existing', because: 'test', trigger: 'init', projectRoot: root, graphDir: dir })
  assert.equal(opened.kind, 'opened')
  const takeover = opened.kind === 'opened' ? opened.takeover : undefined
  assert.ok(takeover !== undefined)
  const { scan, files } = await scanWorkspace(root, { graphDir: dir })
  const engine = openEngine(dir)
  assert.ok((await engine.apply('llm', { op: 'propose', reason: '接管', node: { type: 'goal', title: '目标' } })).ok)
  const events: EmittedEvent[] = []
  const notices: UserNotice[] = []
  const deps = { sandbox: () => passThrough(), emit: (event: EmittedEvent) => { events.push(event) }, notify: (notice: UserNotice) => { notices.push(notice) }, trialMinutes: 45, runOptions: { tmp, commandMs: 3_000 } }
  assert.equal(maybeStartRound({ root, takeover, graph: await loadGraph(dir), scan, files }, deps), undefined, 'no merge gate yet: no round')
  assert.ok((await engine.apply('llm', { op: 'propose', reason: '接管', node: { type: 'norm', id: 'norm-merge-gate', title: '合入前的检查', parent: 'goal-1', acceptance: ['`$ npm test`', '`$ npm run deploy`'] } })).ok)
  const graph = await loadGraph(dir)
  const running = maybeStartRound({ root, takeover, graph, scan, files }, deps)
  assert.ok(running !== undefined)
  assert.equal(maybeStartRound({ root, takeover, graph, scan, files }, deps), undefined, 'one round at a time per project')
  const file = await running
  assert.equal(file.done, true)
  assert.deepEqual(file.results.map(result => result.text), ['npm test', 'npm run deploy'])
  assert.equal(file.results[1]?.outcome, 'not-run')
  const records = readFileSync(join(root, '.llm', 'bootstrap', 'journal.jsonl'), 'utf8').split('\n').filter(line => line !== '').map(line => JSON.parse(line) as { op: string, data: Record<string, unknown> })
  const trials = records.filter(record => record.op === 'trial')
  assert.equal(trials.length, 2)
  assert.deepEqual(Object.keys(trials[0]?.data ?? {}).filter(key => ['round', 'commandId', 'outcome', 'limitMs', 'limitSource', 'envKey'].includes(key)).sort(), ['commandId', 'envKey', 'limitMs', 'limitSource', 'outcome', 'round'])
  assert.deepEqual(events.map(event => [event.k, event.by]), [['bootstrap.trial', 'bootstrap'], ['bootstrap.trial', 'bootstrap']])
  assert.equal(notices.length, 1)
  assert.match(String(notices[0]?.content[0]?.text), /trial finished: \d+ passed, \d+ failed, \d+ not conclusive in isolation, 1 not run/)
  assert.equal(maybeStartRound({ root, takeover, graph, scan, files }, deps), undefined, 'the same plan is not run twice')
  // A host that died mid-round left the same plan unfinished: the round is picked up, the settled half reused, the rest run, then the notice (§9.2, review B6 F2).
  assert.ok(!['not-run', 'running', 'sandbox-broken'].includes(file.results[0]?.outcome ?? 'not-run'), `the first command settled: ${String(file.results[0]?.outcome)}`)
  writeFileSync(join(root, '.llm', 'bootstrap', takeover.id, 'trial.json'), `${JSON.stringify({ ...file, done: false, results: file.results.slice(0, 1) }, null, 2)}\n`)
  const resumed = maybeStartRound({ root, takeover, graph, scan, files }, deps)
  assert.ok(resumed !== undefined, 'an unfinished round of the same plan starts again')
  const finished = await resumed
  assert.equal(finished.done, true)
  assert.equal(finished.round, file.round, 'the same round, finished')
  assert.deepEqual(finished.results.map(result => [result.text, result.reused === true]), [['npm test', true], ['npm run deploy', false]])
  assert.equal(notices.length, 2, 'the finished notice is sent for the picked-up round')
  assert.equal(readTrialFile(root, takeover.id)?.done, true)
})

test('a reused setup result that did not pass marks the commands run after it with afterSetupFailure (§6.3, review B6 F1)', async () => {
  const { root, head } = fixture()
  const tmp = mkdtempSync(join(tmpdir(), 'trial-tmp-'))
  const setup = command('node scripts/shape.js', { kind: 'setup' })
  const gate = command('node scripts/pass.js')
  const first = await runTrial({ root, takeoverId: 'tk-setupreu', head, round: 1, commands: [gate], probes: ['node --version'], sandbox: passThrough(), totalMs: 120_000, commandMs: 3_000, tmp })
  const failedSetup: TrialResult = { commandId: setup.id, text: setup.text, kind: 'setup', cls: setup.cls, node: setup.node, origin: setup.origin, outcome: 'failed', exit: 1, limitMs: 3_000, limitSource: 'ceiling', head, envKey: first.envKey, coldCache: true }
  const previous: TrialFile = { ...first, results: [failedSetup] }
  const file = await runTrial({ root, takeoverId: 'tk-setupreu', head, round: 2, commands: [setup, gate], probes: ['node --version'], sandbox: passThrough(), totalMs: 120_000, commandMs: 3_000, tmp, previous })
  assert.deepEqual([file.results[0]?.outcome, file.results[0]?.reused], ['failed', true], 'the failed setup is reused')
  assert.equal(file.results[1]?.outcome, 'passed', 'the gate command ran')
  assert.equal(file.results[1]?.afterSetupFailure, true, 'and carries afterSetupFailure')
})

test('status lines, the finished notice and the red checkers of a round (§3.2, §5.6 items 4 and 5, paths #4)', () => {
  assert.deepEqual(trialStatusLines(undefined), ['试跑：还没开始（项目图上有了合入前的检查才开始）。'])
  const result = (text: string, outcome: TrialResult['outcome'], rest: Partial<TrialResult> = {}): TrialResult => ({ commandId: 'c', text, kind: 'gate', cls: 'gate', node: 'norm-merge-gate', origin: 'scan', outcome, limitMs: 600_000, limitSource: 'ceiling', head: 'h', envKey: 'e', coldCache: true, ...rest })
  const file: TrialFile = {
    round: 2, head: 'h', envKey: 'e', startedAt: '2026-11-06T00:00:00.000Z', done: true, limitMs: 45 * 60_000, usedMs: 1,
    results: [
      result('npm test', 'failed'), result('npm run lint', 'failed'), result('npx tsc --noEmit', 'confinement-limited'),
      result('node node_modules/eslint/bin/eslint.js {files}', 'timed-out', { kind: 'check', cls: 'check', node: 'tool-1', ms: 600_000 }),
      result('npm run build', 'passed'),
    ],
  }
  const lines = trialStatusLines(file)
  assert.equal(lines[0], '试跑第 2 轮跑完：1 条过了，2 条没过，2 条在隔离里没跑出结论，0 条没试跑。')
  assert.equal(lines[1], '试跑：`node node_modules/eslint/bin/eslint.js {files}` 超过上限 10 分（已跑 10 分），整棵进程树已结束；同意之后由改完文件就跑的检查在改了文件之后第一次跑它，超时 60 秒（默认）；试跑里它没跑完，这里的上限更短，那一次多半也跑不完，结局是『没跑完』，下一次改动照常再跑。晨报里还没有。')
  assert.match(String(finishedNotice('tk-abcdefgh', file).content[0]?.text), /trial finished: 1 passed, 2 failed, 2 not conclusive in isolation, 0 not run/)
  assert.ok(isCheckerCommand('npm run lint') && isCheckerCommand('npx knip') && !isCheckerCommand('npm test') && !isCheckerCommand('npm run build'))
  assert.deepEqual(redCheckers(file), { failed: ['npm run lint'], limited: ['npx tsc --noEmit'] }, 'a red test stays in the gate (d-tests-required-gate)')
  const facts: ReminderFacts = { takeover: { id: 'tk-abcdefgh', path: 'existing' }, history: 1, anchor: 'goal-1', proposed: { total: 0, byType: {} }, missing: [], unchecked: [], things: {}, touchInside: [], rulesWhole: false, testsMissing: false, red: redCheckers(file) }
  const text = reminderText(facts)
  assert.match(text, /red on the current code: `npm run lint`\. Take them out of norm-merge-gate/)
  assert.match(text, /no result in the trial's isolation: `npx tsc --noEmit`/)
  assert.doesNotMatch(reminderText({ ...facts, red: { failed: [], limited: [] } }), /red on the current code/)
})
