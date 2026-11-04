/**
 * The metrics row's code rule (src/metrics/rules.ts; metrics design §3.4,
 * §15.32, §15.42): `isPruneCall` recognizes the metrics command line's
 * `prune` across the shell spellings the design lists and stays quiet on the
 * commands it lists as passing; `metricsFilesOnly` denies a file tool or a
 * shell command that writes, deletes or moves into the journal's files
 * (what `cmd /c` or `cmd /k` runs included, quoted whole or not), denies the
 * prune, and lets every read and every other command through; neither of its
 * corrections points the model at the summary. On the fake rc.3 host with the
 * guard row (acceptance 22, the M4 half): every denial through the gate, a
 * `run_code` program's call among them, is one violation line and one `rule`
 * event whose `ref` is that line's key; a session with no project meets no
 * rule; and after `guard_lift` the same calls no longer meet the rule while
 * the lift is one `lift` event.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { isGateListener } from '../src/guard/gate.ts'
import { apply as guardApply } from '../src/guard/index.ts'
import { keyOf } from '../src/guard/records.ts'
import { apply as metricsApply } from '../src/metrics/index.ts'
import { readLog } from '../src/metrics/read.ts'
import { installMetricsFileGuard, isPruneCall, metricsFilesOnly, METRICS_DECLARATION, METRICS_FILES_ONLY } from '../src/metrics/rules.ts'
import { NATIVE_FACE, renderCorrection, type RuleVerdict, type ToolCall } from '../src/guard/rules.ts'
import type { ToolFinalResult } from '../src/shared/dsh-min.ts'
import { METRICS_SERVICE, type MetricsService } from '../src/shared/metrics.ts'
import { execTool, fakeRuntime, readViolations } from './fake-rc3.ts'

const ROOT = 'C:/work/app'
/** The rule from a session in a subdirectory, and from one at the root (relative paths then name the journal directly). */
const RULE = metricsFilesOnly(ROOT, join(ROOT, 'ws'))
const AT_ROOT = metricsFilesOnly(ROOT, ROOT)

const fileWrite = (path: string): ToolCall => ({ name: 'write', arguments: { file_path: path } })
const shell = (command: string): ToolCall => ({ name: 'pwsh', arguments: { command } })
const read = (path: string): ToolCall => ({ name: 'read', arguments: { file_path: path } })
const verdictOf = (call: ToolCall, rule = RULE): RuleVerdict => rule.detect(call, NATIVE_FACE)

test('isPruneCall recognizes the prune spellings the design lists (§15.32)', () => {
  const blocked = [
    'npm run metrics -- prune',
    'node scripts/metrics/cli.ts prune',
    'npx tsx scripts/metrics/cli.ts prune',
    'npm run build && npm run metrics -- prune --before 2026-01-01',
    '& npm run metrics -- prune',
    'cmd /c npm run metrics -- prune',
    'env CI=1 npm run metrics -- prune',
    'git status & npm run metrics -- prune',
    'npm.EXE run metrics -- prune',
    'call npm run metrics -- prune',
    'npm --silent run metrics -- prune',
    // A NAME=value prefix whose value holds a path is still a prefix; quotes around a word do not hide it.
    'PATH=/usr/bin npm run metrics -- prune',
    'DSH_HOME=C:\\tmp npm run metrics -- prune',
    'npm run metrics -- \'prune\'',
    'npm run metrics -- "prune"',
  ]
  for (const command of blocked) assert.equal(isPruneCall(command), true, command)
})

test('isPruneCall stays quiet on the spellings the design lists as passing (§15.32)', () => {
  const allowed = [
    'git commit -m "doc: npm run metrics -- prune 只给人用"',
    'npm run metrics -- summary',
    'npm run metrics -- summary; echo prune',
    'npm run metrics -- verify',
    'pnpm run metrics -- prune',
    'npm run build',
    'echo metrics prune',
    'pwsh -c "npm run metrics -- prune"',
  ]
  for (const command of allowed) assert.equal(isPruneCall(command), false, command)
})

test('a file tool writing into the journal, the manifest or the key is denied; a read passes', () => {
  for (const path of [
    join(ROOT, '.llm', 'metrics', 'events-2026-11-04.jsonl'),
    join(ROOT, '.llm', 'metrics', 'view.json'),
    join(ROOT, '.llm', 'metrics-manifest.jsonl'),
    join(ROOT, '.llm', 'metrics-key'),
  ]) {
    const verdict = verdictOf(fileWrite(path))
    assert.equal(verdict.kind, 'deny', path)
    assert.equal(verdict.kind === 'deny' && verdict.rule, METRICS_FILES_ONLY, path)
    assert.match(verdict.kind === 'deny' ? verdict.correction.violation : '', /only the harness writes there/)
  }
  assert.equal(METRICS_FILES_ONLY, 'metrics-files-only', 'the id guard_lift takes, so the rule and lift events share it')
  assert.equal(verdictOf(read(join(ROOT, '.llm', 'metrics', 'events-2026-11-04.jsonl'))).kind, 'allow', 'reads pass (§15.42)')
  assert.equal(verdictOf(fileWrite(join(ROOT, 'docs', 'notes.md'))).kind, 'allow', 'a write outside the journal passes')
})

test('a shell command that mentions the journal and deletes, moves or writes is denied; the prune is denied by its own reading', () => {
  for (const command of [
    'rm -rf .llm/metrics',
    'Remove-Item .llm/metrics-manifest.jsonl',
    'mv .llm/metrics .llm/metrics-old',
    'cmd /c del .llm\\metrics\\view.json',
    // cmd takes its command line quoted whole as one word; what follows the switch is read again.
    'cmd /c "del .llm\\metrics\\view.json"',
    'cmd /c "del /q .llm\\metrics\\*"',
    'cmd /c "rd /s /q .llm\\metrics"',
    'cmd /k "rmdir /s /q .llm\\metrics"',
    'cmd.exe /c "move .llm\\metrics\\view.json x.json"',
    'cmd /c "echo x > .llm\\metrics\\view.json"',
    'bash -c "rm -rf .llm/metrics"',
    'Get-ChildItem .llm/metrics | Remove-Item',
    // Writes by cmd and PowerShell aliases file-tools-only does not name, and find's own delete.
    'copy NUL .llm\\metrics\\view.json',
    'xcopy x.json .llm\\metrics\\',
    'cpi x .llm/metrics/view.json',
    'ni -Force .llm/metrics/view.json',
    'clc .llm/metrics/view.json',
    'find .llm/metrics -name "*.jsonl" -delete',
    // git clean that deletes ignored files is a delete (§5.3).
    'git clean -fdX .llm/metrics',
    'git -C . clean -x -f .llm/metrics',
    'npm run metrics -- prune',
    'git status & npm run metrics -- prune',
  ]) {
    for (const rule of [RULE, AT_ROOT]) {
      const verdict = verdictOf(shell(command), rule)
      assert.equal(verdict.kind, 'deny', command)
      assert.equal(verdict.kind === 'deny' && verdict.rule, METRICS_FILES_ONLY, command)
    }
  }
  const prune = verdictOf(shell('npm run metrics -- prune'))
  assert.match(prune.kind === 'deny' ? prune.correction.violation : '', /the human's own command/)
})

test('neither correction points the model at the summary or at reading the journal (§15.42, §7.6.4)', () => {
  for (const call of [fileWrite(join(ROOT, '.llm', 'metrics', 'view.json')), shell('Remove-Item .llm/metrics/view.json'), shell('npm run metrics -- prune')]) {
    const verdict = verdictOf(call)
    assert.equal(verdict.kind, 'deny', JSON.stringify(call))
    const text = verdict.kind === 'deny' ? renderCorrection(verdict.correction) : ''
    assert.doesNotMatch(text, /summary/i, text)
    assert.doesNotMatch(text, /\bread/i, text)
  }
})

test('a shell command that only reads or only mentions the journal passes, whatever words its arguments hold (§15.42)', () => {
  for (const command of [
    'npm run metrics -- summary',
    'Get-Content .llm/metrics/events-2026-11-04.jsonl',
    'echo the journal lives in .llm/metrics',
    'echo "rm .llm/metrics"',
    'Select-String -Path .llm/metrics/events-2026-11-04.jsonl -Pattern \'remove\'',
    'rg -n "del" .llm/metrics',
    'cmd /c "type .llm\\metrics\\view.json"',
    'find .llm/metrics -name "*.jsonl"',
    'git clean -n -X .llm/metrics',
    'git clean --dry-run -fdX .llm/metrics',
    'npm run build',
  ]) {
    for (const rule of [RULE, AT_ROOT]) assert.equal(verdictOf(shell(command), rule).kind, 'allow', command)
  }
})

test('the rule declares itself once, and the gate it installs is a gate listener over the metrics row', () => {
  assert.equal(typeof METRICS_DECLARATION, 'string')
  assert.ok(METRICS_DECLARATION.length > 0 && METRICS_DECLARATION.length <= 200)
  const installed: Array<{ event: string, listener: unknown }> = []
  const ctx = { on: (event: string, listener: unknown) => { installed.push({ event, listener }); return () => {} }, get: () => undefined }
  const uninstall = installMetricsFileGuard({ ctx, journal: () => {} })
  assert.equal(installed.filter(entry => entry.event === 'tools/pre-execute').length, 1)
  assert.ok(installed.every(entry => isGateListener(entry.listener)))
  uninstall()
  uninstall()
})

// ------------------------------------------------------------- through the gate

/** The human's message the lift quotes: a whole message with a lift word nothing negates. */
const LIFT_SAID = '指标那条先别拦了'

const textOf = (result: ToolFinalResult): string => (result.content ?? []).map(block => (block as { text?: string }).text ?? '').join('\n')

/** The journal's events once `count` of them match, or what is there after three seconds. */
async function eventsUntil(root: string, match: (event: Record<string, unknown>) => boolean, count: number): Promise<Array<Record<string, unknown>>> {
  const matching = async (): Promise<Array<Record<string, unknown>>> =>
    ((await readLog(root)).events as unknown as Array<Record<string, unknown>>).filter(match)
  for (let waited = 0; waited < 3_000 && (await matching()).length < count; waited += 25) await new Promise(resolve => setTimeout(resolve, 25))
  return matching()
}

const isDenial = (line: Record<string, unknown>): boolean => line.rule === METRICS_FILES_ONLY && line.kind === undefined

/** The rule's denial lines of the project's violation journal once `count` are there (follow-up lines land between them). */
async function denialsUntil(root: string, count: number): Promise<Array<Record<string, unknown>>> {
  const read = readViolations(root)
  let lines = (await read()).filter(isDenial)
  // Each read waits 40 ms: about three seconds in all.
  for (let tries = 0; tries < 75 && lines.length < count; tries += 1) lines = (await read()).filter(isDenial)
  return lines
}

test('through the gate each denial, a run_code program\'s call among them, is one violation line and one rule event that points at it; a session with no project meets no rule; after guard_lift the rule judges nothing and the lift is one lift event (acceptance 22)', async () => {
  const base = mkdtempSync(join(tmpdir(), 'metrics-rules-'))
  const root = join(base, 'ws')
  mkdirSync(root, { recursive: true })
  assert.equal(spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: root }).status, 0)
  const rt = fakeRuntime({ cwd: root })
  rt.services.set('agents', { get: (id: string) => id === rt.agent.id ? { id: rt.agent.id, session: rt.agent.session } : undefined })
  // The guard row (guard_lift) first; the metrics row's gate is prepended after it, so it is the outermost, as in the bundle.
  // The no-op timer keeps the background self-check and the board's view out of the run.
  const stops = [
    guardApply(rt.ctx as never, { workspaceRoots: [root] }),
    metricsApply(rt.ctx as never, { timer: () => () => {} }),
  ]
  const exec = execTool(rt)
  const pwsh = (command: string): Promise<ToolFinalResult> => exec('pwsh', { command })
  const denied: ReadonlyArray<readonly [string, () => Promise<ToolFinalResult>]> = [
    ['write', () => exec('write', { file_path: join(root, '.llm', 'metrics', 'x'), content: 'x\n' })],
    ['Remove-Item', () => pwsh('Remove-Item .llm/metrics/x')],
    ['npm prune', () => pwsh('npm run metrics -- prune')],
    ['node prune', () => pwsh('node scripts/metrics/cli.ts prune')],
    ['&& prune', () => pwsh('npm run build && npm run metrics -- prune --before 2026-01-01')],
    ['& prune', () => pwsh('& npm run metrics -- prune')],
    ['cmd /c prune', () => pwsh('cmd /c npm run metrics -- prune')],
    // A run_code program's call carries parent; the gate judges it like a direct one (judgeChildren).
    ['run_code write', () => exec('write', { file_path: join(root, '.llm', 'metrics', 'y'), content: 'y\n' }, { parent: { callId: 'outer' } })],
  ]
  // A session with no project (outside git, no .llm) has no journal to guard.
  const elsewhere = join(base, 'none')
  mkdirSync(elsewhere)
  const noProject = { ...rt.agent, session: { ...rt.agent.session!, header: { ...rt.agent.session!.header, cwd: elsewhere } } }
  const isRuleEvent = (event: Record<string, unknown>): boolean => event.k === 'rule' && (event.body as { rule?: unknown }).rule === METRICS_FILES_ONLY
  try {
    for (const [what, call] of denied) {
      const result = await call()
      assert.ok(result.isError === true && textOf(result).includes(`Rule ${METRICS_FILES_ONLY} blocks`), `${what}: ${textOf(result)}`)
    }
    for (const command of ['npm run metrics -- summary', 'git commit -m "doc: npm run metrics -- prune 只给人用"', 'npm run metrics -- summary; echo prune']) {
      const result = await pwsh(command)
      assert.equal(result.isError, false, `${command}: ${textOf(result)}`)
    }
    const outside = await exec('pwsh', { command: 'npm run metrics -- prune' }, { agent: noProject })
    assert.equal(outside.isError, false, `no project: ${textOf(outside)}`)
    const lines = await denialsUntil(root, denied.length)
    assert.equal(lines.length, denied.length, 'one violation line per denial')
    const rules = await eventsUntil(root, isRuleEvent, denied.length)
    assert.equal(rules.length, denied.length, 'one rule event per denial')
    assert.ok(rules.every(event => event.by === 'guard' && (event.body as { effect?: unknown }).effect === 'deny'))
    assert.deepEqual(new Set(rules.map(event => (event.body as { ref?: unknown }).ref)), new Set(lines.map(line => keyOf(line))), 'each rule event names the violation line it rode on')

    rt.history.push({ role: 'user', content: [{ type: 'text', text: LIFT_SAID }], source: { kind: 'user', rpcId: 'rpc-lift' } })
    const lifted = await exec('guard_lift', { rule: METRICS_FILES_ONLY, words: LIFT_SAID })
    assert.equal(lifted.isError, false, textOf(lifted))
    const lifts = await eventsUntil(root, event => event.k === 'lift', 1)
    assert.deepEqual(lifts.map(event => [event.by, event.body]), [['guard', { rule: METRICS_FILES_ONLY, action: 'lift', via: 'chat', units: [...LIFT_SAID].length }]])

    for (const [what, call] of denied) {
      const result = await call()
      assert.ok(!textOf(result).includes(`Rule ${METRICS_FILES_ONLY}`), `${what} no longer meets the rule: ${textOf(result)}`)
      // The shell delete still meets the guard row's own file-tools-only; the others run.
      if (what !== 'Remove-Item') assert.equal(result.isError, false, `${what}: ${textOf(result)}`)
    }
    // A marker through the service: the writer keeps order, so once it is in the journal everything before it is too.
    ;(rt.ctx.get(METRICS_SERVICE) as MetricsService).emit({ k: 'count', by: 'guard', body: { what: 'marker', value: 1 } }, { dir: root })
    await eventsUntil(root, event => event.k === 'count', 1)
    assert.equal((await eventsUntil(root, isRuleEvent, 0)).length, denied.length, 'no rule event after the lift')
    assert.equal((await denialsUntil(root, 0)).length, denied.length, 'no violation line after the lift')
  }
  finally {
    for (const stop of stops.reverse()) stop()
    // The writer's last line lands after the dispose; the directory goes only then.
    await eventsUntil(root, event => event.k === 'stop', 1)
    rmSync(base, { recursive: true, force: true })
  }
})
