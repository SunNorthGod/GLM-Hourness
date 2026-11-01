/**
 * The rules row's tool-call gate and `rules_show` on the fake rc.3 host
 * (docs/ORCHESTRATION.md §16.11; design §6.2, §6.4, §10.5, §15 R4 up to the
 * waiting tickets): the listener is outermost and judges only what the inner
 * gates let through; `rules:files-only` guards the rules directories for
 * direct calls and for the calls of a `run_code` program; block rules refuse
 * with the four-part text, record rules let the call run and leave a line in
 * the violation journal, inform rules never change a verdict; the events a
 * call pushes; the role, the model and the session come from the host; a
 * fault in the board lets the call through and says so in the row's health.
 * Rules reach a project through the rules file in its repository, as they do
 * for a clone; the gate reads the same state `checkCall` reads.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { creditPricing } from '../src/glm-llm/credits.ts'
import { worktreesOf } from '../src/data/project-root.ts'
import { MAIN_AGENT_KEY } from '../src/graph/main-agent.ts'
import { checkCall } from '../src/rules/check.ts'
import { RULES_FILES_ONLY } from '../src/rules/gate.ts'
import type { RepoRules } from '../src/rules/model.ts'
import { rulesPaths } from '../src/rules/store.ts'
import { ruleOf } from './rules-fixtures.ts'
import { injectRecord } from './rules-helpers.ts'
import { health, PEAK_NOW, rowTest, subagentOf, textOf, type Fixture } from './rules-host.ts'

const GLM_ROUTE = { provider: 'zai', model: 'glm-4.6' }
const OTHER_ROUTE = { provider: 'deepseek', model: 'deepseek-chat' }
const NATIVES = ['pwsh', 'write', 'edit', 'read', 'str_replace_editor', 'subagent', 'subagent_fork'] as const
const OFF_PEAK = Date.parse('2026-10-28T20:00:00+08:00')

/** Blocks a command that names the probe word. */
const BLOCK_PROBE = ruleOf({ id: 'r-no-probe', title: 'No probe word', filter: { command: { matches: 'rules-probe-blocked' } }, reason: 'The probe word is not allowed.' })
const RECORD_NPM = ruleOf({ id: 'r-note-npm', title: 'Note npm runs', filter: { command: { matches: '^npm\\b' } }, action: { kind: 'record' } })
const INFORM_FRIDAY = ruleOf({ id: 'r-friday', title: 'No release on Fridays', when: { kind: 'event', events: ['rules.step'] }, action: { kind: 'inform' } })
const PEAK_DEPLOY = ruleOf({ id: 'r-peak-block', title: 'No deploy in the peak', filter: { command: { matches: 'deploy' } }, condition: { signal: 'glm-peak', is: true } })
const file = (rules: readonly ReturnType<typeof ruleOf>[], more: Partial<RepoRules> = {}): RepoRules => ({ version: 2, rules: Object.fromEntries(rules.map(rule => [rule.id, rule])), ...more })

const shell = (command: string): unknown => ({ command })

/** The text a refusal puts in the error result, without the host's `Error: ` prefix. */
const reasonOf = (result: Parameters<typeof textOf>[0]): string => textOf(result).replace(/^Error: /, '')

/** `HH:MM` on the wall clock of this machine, by another route than the code takes (the Swedish format is year-first and 24-hour). */
const clockHm = (iso: string): string => new Date(iso).toLocaleString('sv-SE').slice(11, 16)
const PEAK_END = '2026-10-28T10:00:00.000Z'

// ---------------------------------------------------------------- the order

rowTest('the gate runs next() first and returns a refusal from inside unchanged: the rules of the board are not asked, nothing is journaled', async ({ runtime, exec, violations }) => {
  runtime.ctx.on('tools/pre-execute', () => Promise.resolve({ kind: 'deny' as const, reason: 'inner gate says no' }))
  const result = await exec('pwsh', shell('echo rules-probe-blocked'))
  assert.equal(result.isError, true)
  assert.equal(reasonOf(result), 'inner gate says no')
  assert.deepEqual(await violations(), [])
}, { rules: file([BLOCK_PROBE]) })

rowTest('a call no rule matches runs', async ({ exec, calls }) => {
  const result = await exec('pwsh', shell('echo fine'))
  assert.equal(result.isError, false)
  assert.deepEqual(calls.map(call => call.name), ['pwsh'])
}, { rules: file([BLOCK_PROBE]) })

// --------------------------------------------------------------------- block

rowTest('a block rule refuses the call with the four-part text, the call never runs, and the denial is journaled as rules:<id> with the route of the step', async ({ exec, calls, violations }) => {
  const result = await exec('pwsh', shell('echo rules-probe-blocked'))
  assert.equal(result.isError, true)
  assert.deepEqual(calls, [], 'the call never ran')
  const reason = reasonOf(result)
  assert.match(reason, /^You tried to run "echo rules-probe-blocked"\.\nBoundary: Rule r-no-probe "No probe word" \(set by the human at \d{4}-\d\d-\d\d \d\d:\d\d, until lifted\) blocks it now\.\nRight path: .+\nException: .+/)
  const [record, ...rest] = await violations(1)
  assert.equal(rest.length, 0)
  assert.deepEqual(
    [record?.rule, record?.mode, record?.effect, record?.tool, record?.agentId, record?.sessionId, record?.scope, record?.correction],
    ['rules:r-no-probe', 'enforce', 'block', 'pwsh', 'agent-1', 'agent-1', 'other', reason],
  )
  assert.deepEqual(record?.route, GLM_ROUTE)
  assert.deepEqual(record?.signals, {})
  assert.match(String(record?.at), /^\d{4}-\d\d-\d\dT/)
}, { rules: file([BLOCK_PROBE]), route: GLM_ROUTE })

rowTest('the gate and checkCall give the same refusal for the same rules and signals', async ({ root, exec }) => {
  const call = { tool: 'pwsh', args: { command: 'npm run deploy' } }
  const gate = reasonOf(await exec(call.tool, call.args))
  const library = await checkCall(call, { project: root, now: PEAK_NOW, signals: { 'glm-peak': true } })
  assert.equal(library.exitCode, 4)
  assert.equal(gate, library.text)
  assert.match(gate, /blocks it now: glm-peak is on\./)
}, { rules: file([PEAK_DEPLOY]) })

rowTest('a rule whose condition does not hold lets the call run', async ({ exec }) => {
  assert.equal((await exec('pwsh', shell('npm run deploy'))).isError, false, 'outside the peak the condition does not hold')
}, { now: OFF_PEAK, rules: file([PEAK_DEPLOY]) })

rowTest('without a pricing service glm-peak cannot be read: a rule that says onUnknown apply holds, one that does not is off', async ({ exec }) => {
  assert.equal((await exec('pwsh', shell('npm run deploy'))).isError, true, 'the rule that says apply blocks')
  assert.equal((await exec('pwsh', shell('npm run build'))).isError, false, 'the rule that says nothing is off')
}, {
  pricing: 'none',
  rules: file([
    ruleOf({ id: 'r-strict', title: 'Strict while the peak is unknown', filter: { command: { matches: 'deploy' } }, condition: { signal: 'glm-peak', is: false }, onUnknown: 'apply' }),
    ruleOf({ id: 'r-lenient', title: 'Lenient', filter: { command: { matches: 'build' } }, condition: { signal: 'glm-peak', is: true } }),
  ]),
})

// ------------------------------------------------------------ record, inform

rowTest('a record rule lets the call run and leaves a mode record line; an inform rule never changes a verdict and leaves nothing', async ({ exec, calls, violations }) => {
  const ran = await exec('pwsh', shell('npm test'))
  assert.equal(ran.isError, false)
  assert.deepEqual(calls.map(call => call.name), ['pwsh'])
  const [record, ...rest] = await violations(1)
  assert.equal(rest.length, 0)
  assert.deepEqual([record?.rule, record?.mode, record?.effect, record?.tool, record?.sessionId], ['rules:r-note-npm', 'record', 'record', 'pwsh', 'agent-1'])
  assert.equal(record?.correction, undefined, 'a call that ran has no correction')
  assert.equal((await exec('pwsh', shell('echo other'))).isError, false)
  assert.equal((await violations()).length, 1, 'a call no record rule names leaves no line')
}, { rules: file([RECORD_NPM, INFORM_FRIDAY]) })

// -------------------------------------------------------------------- events

rowTest('gate.dispatch is pushed for the native dispatch tools, gate.tool-call for every call, and gate.trunk-advance is declared but never pushed', async ({ exec, calls, violations }) => {
  const spawned = await exec('subagent', { prompt: 'do it' })
  assert.equal(spawned.isError, true)
  assert.match(reasonOf(spawned), /Rule r-dispatch "No dispatch"/)
  assert.equal((await exec('subagent_fork', { prompt: 'do it' })).isError, true)
  assert.equal((await exec('pwsh', shell('echo hi'))).isError, true, 'every call is a gate.tool-call')
  assert.equal((await exec('read', { file_path: 'a.txt' })).isError, false, 'a rule on gate.tool-call for pwsh does not touch a read')
  assert.equal((await exec('write', { file_path: 'a.txt', content: 'x' })).isError, false, 'nor does a trunk-advance rule touch a write')
  assert.deepEqual(calls.map(call => call.name), ['read', 'write'])
  assert.deepEqual((await violations(3)).map(record => `${String(record.rule)} ${String(record.tool)}`).sort(), ['rules:r-dispatch subagent', 'rules:r-dispatch subagent_fork', 'rules:r-every-pwsh pwsh'])
}, {
  natives: NATIVES,
  rules: file([
    ruleOf({ id: 'r-dispatch', title: 'No dispatch', when: { kind: 'event', events: ['gate.dispatch'] } }),
    ruleOf({ id: 'r-every-pwsh', title: 'No shell', filter: { tool: { in: ['pwsh'] } } }),
    ruleOf({ id: 'r-trunk', title: 'No trunk advance', when: { kind: 'event', events: ['gate.trunk-advance'] } }),
  ]),
})

rowTest('the target model of a dispatch is the provider and model the call names, and unreadable when it names none', async ({ exec, violations }) => {
  assert.equal((await exec('subagent', { prompt: 'x', provider: 'zai', model: 'glm-4.6' })).isError, true, 'a GLM route named')
  assert.equal((await exec('subagent', { prompt: 'x', provider: 'deepseek', model: 'deepseek-chat' })).isError, false, 'another route named')
  assert.equal((await exec('subagent', { prompt: 'x' })).isError, false, 'no model named: the filter cannot tell, so the rule does not apply')
  assert.equal((await violations(1)).length, 1)
}, {
  natives: NATIVES,
  rules: file([ruleOf({ id: 'r-glm-dispatch', title: 'No GLM subagents', when: { kind: 'event', events: ['gate.dispatch'] }, filter: { targetModel: { matches: '^[^/]*/glm' } } })]),
})

rowTest('the paths a rule on writes sees are relative to the session workspace', async ({ root, exec }) => {
  assert.equal((await exec('write', { file_path: join(root, 'src', 'payments', 'a.ts'), content: 'x' })).isError, true, 'an absolute target under the workspace')
  assert.equal((await exec('write', { file_path: 'src/payments/b.ts', content: 'x' })).isError, true, 'a relative target')
  assert.equal((await exec('write', { file_path: join(root, 'src', 'other', 'c.ts'), content: 'x' })).isError, false)
}, { natives: NATIVES, rules: file([ruleOf({ id: 'r-payments', title: 'Payments are frozen', filter: { writes: { paths: ['src/payments/**'] } } })]) })

rowTest('a queue rule defers the call: it does not run, a ticket is opened, the refusal is journaled as a queue line, and rules_show lists the rule and the ticket', async ({ exec, calls, violations }) => {
  const result = await exec('pwsh', shell('npm run deploy'))
  assert.equal(result.isError, true)
  assert.deepEqual(calls, [])
  assert.match(reasonOf(result), /Deferred as ticket q-1\./)
  const [record, ...rest] = await violations(1)
  assert.equal(rest.length, 0)
  assert.deepEqual([record?.rule, record?.mode, record?.effect, record?.ticket], ['rules:r-hold', 'enforce', 'queue', 'q-1'])
  const shown = (await exec('rules_show', {})).value as { text: string }
  assert.match(shown.text, /- \[queue\] r-hold: Hold deploys \(set by the human at .+, until lifted\)\./)
  assert.doesNotMatch(shown.text.split('\n').find(line => line.includes('r-hold:')) ?? '', /Not enforced yet/, 'a rule of the person is carried out')
  assert.match(shown.text, /- q-1: pwsh "npm run deploy" is deferred since/)
  assert.equal((await exec('pwsh', shell('echo other'))).isError, false, 'a call the rule does not name runs')
}, { rules: file([ruleOf({ id: 'r-hold', title: 'Hold deploys', filter: { command: { matches: 'deploy' } }, action: { kind: 'queue' } })]) })

rowTest('the entries of the code that queue are carried out like the rules of the person: listed with no note that they are not, and a call they do not name runs', async ({ exec, calls, run }) => {
  await run('peak 不做')
  const shown = (await exec('rules_show', {})).value as { text: string }
  assert.match(shown.text, /- \[queue\] builtin:glm-peak-stop-dispatch: /)
  assert.doesNotMatch(shown.text, /Not enforced yet/)
  assert.equal((await exec('pwsh', shell('npm run deploy'))).isError, false, 'the main agent\'s call is not named')
  assert.deepEqual(calls.map(call => call.name), ['pwsh'])
}, { route: GLM_ROUTE })

// -------------------------------------------------------------------- caller

rowTest('the model is the one in the latest request header of the session', async ({ exec, runtime }) => {
  assert.equal((await exec('pwsh', shell('echo hi'))).isError, true, 'a GLM route')
  await runtime.assemble(OTHER_ROUTE)
  assert.equal((await exec('pwsh', shell('echo hi'))).isError, false, 'the next step ran on another model')
}, { route: GLM_ROUTE, rules: file([ruleOf({ id: 'r-glm-only', title: 'GLM sessions', filter: { model: { matches: '^[^/]*/glm' } } })]) })

rowTest('a session with no request header yet is not matched by a rule that asks about the model', async ({ exec, violations }) => {
  assert.equal((await exec('pwsh', shell('echo hi'))).isError, false)
  assert.deepEqual(await violations(), [])
}, { rules: file([ruleOf({ id: 'r-glm-only', title: 'GLM sessions', filter: { model: { matches: '^[^/]*/glm' } } })]) })

rowTest('the role is subagent for a session whose header says so, and root for the others', async ({ runtime, exec }) => {
  assert.equal((await exec('pwsh', shell('a'), { agent: subagentOf(runtime.agent) })).isError, true, 'subagent rule, subagent session')
  assert.equal((await exec('pwsh', shell('a'))).isError, false, 'the root session is not a subagent')
}, { rules: file([ruleOf({ id: 'r-subagents', title: 'Subagents', filter: { role: { in: ['subagent'] } } })]) })

rowTest('the main agent is the session the main-agent projection says is active; a subagent never is', async ({ exec, runtime }) => {
  assert.equal((await exec('pwsh', shell('a'))).isError, true)
  assert.equal((await exec('pwsh', shell('a'), { agent: subagentOf(runtime.agent) })).isError, false, 'a subagent is not the main agent, whatever the projection says')
}, {
  services: { sessionProjections: { stateOf: (_session: unknown, key: string) => (key === MAIN_AGENT_KEY ? { active: true } : undefined) } },
  rules: file([ruleOf({ id: 'r-main', title: 'Main agent', filter: { role: { in: ['main-agent'] } } })]),
})

rowTest('a session the projection says nothing about is root, not the main agent', async ({ exec }) => {
  assert.equal((await exec('pwsh', shell('a'))).isError, false, 'the main-agent rule does not apply')
  assert.equal((await exec('pwsh', shell('b'))).isError, false)
}, { rules: file([ruleOf({ id: 'r-main', title: 'Main agent', filter: { role: { in: ['main-agent'] } } })]) })

rowTest('a projection that cannot be read leaves the role unknown: a rule that asks about it does not apply, one that does not ask does', async ({ exec }) => {
  const reason = reasonOf(await exec('pwsh', shell('a')))
  assert.match(reason, /Rule r-any "Any call"/)
  assert.doesNotMatch(reason, /r-root/)
}, {
  services: { sessionProjections: { stateOf: () => { throw new Error('projection gone') } } },
  rules: file([ruleOf({ id: 'r-any', title: 'Any call' }), ruleOf({ id: 'r-root', title: 'Roots', filter: { role: { in: ['root'] } } })]),
})

rowTest('a session rule applies to its own session only', async ({ root, runtime, exec }) => {
  await injectRecord(rulesPaths(root), [{
    path: ['rules', 'r-mine'],
    value: ruleOf({ id: 'r-mine', title: 'Only this session', scope: 'session', sessionId: 'agent-1', lifetime: { kind: 'session' } }),
  }], '2026-10-28T06:00:00.000Z')
  assert.equal((await exec('pwsh', shell('a'))).isError, true, 'its session')
  assert.equal((await exec('pwsh', shell('a'), { agent: subagentOf(runtime.agent) })).isError, false, 'another session')
})

// ------------------------------------------------------------ rules:files-only

/** Where the board keeps its files, as an agent may spell them. */
const TARGETS = (root: string): string[] => [
  join(root, 'docs', 'rules', 'rules.json'),
  join(root, 'docs', 'rules', 'scripts', 'r-x.mjs'),
  join(root, '.llm', 'rules', 'journal.jsonl'),
  'docs/rules/rules.json',
  ...(process.platform === 'win32' ? ['docs\\rules\\rules.json'] : []),
]

rowTest('rules:files-only denies file-tool writes into the rules directories, for direct calls and for the calls of a run_code program, and lets reads and other writes through', async ({ root, exec, calls, violations }) => {
  const targets = TARGETS(root)
  for (const target of targets) {
    for (const [tool, args] of [
      ['write', { file_path: target, content: 'x' }],
      ['edit', { file_path: target, old_string: 'a', new_string: 'b' }],
      ['str_replace_editor', { command: 'create', path: target, file_text: 'x' }],
    ] as const) {
      const direct = await exec(tool, args)
      assert.equal(direct.isError, true, `${tool} ${target}`)
      assert.match(reasonOf(direct), /^You tried to write "/)
      assert.match(reasonOf(direct), /Rule rules:files-only/)
      assert.equal((await exec(tool, args, { parent: {} })).isError, true, `${tool} ${target}, from a run_code program`)
    }
    assert.equal((await exec('read', { file_path: target })).isError, false, `read ${target}`)
    assert.equal((await exec('str_replace_editor', { command: 'view', path: target })).isError, false, `view ${target}`)
  }
  assert.equal((await exec('write', { file_path: join(root, 'docs', 'rules.md'), content: 'x' })).isError, false, 'a neighbour of the directory')
  assert.equal((await exec('write', { file_path: join(root, 'docs', 'rules-notes', 'a.md'), content: 'x' })).isError, false, 'a directory that only starts with the name')
  assert.deepEqual(new Set(calls.map(call => call.name)), new Set(['read', 'str_replace_editor', 'write']))
  const records = await violations(targets.length * 6)
  assert.equal(records.length, targets.length * 6)
  assert.ok(records.every(record => record.rule === RULES_FILES_ONLY && record.mode === 'enforce' && record.effect === 'block'))
}, { natives: NATIVES })

rowTest('the denial of rules:files-only is four parts, names the rule and who can change the files, and is journaled with the name the model called', async ({ root, exec, violations }) => {
  const result = await exec('Write', { file_path: join(root, 'docs', 'rules', 'rules.json'), content: 'x' })
  const reason = reasonOf(result)
  assert.equal(reason.split('\n').length, 4, reason)
  assert.match(reason, /^You tried to write ".*rules\.json"\.\nBoundary: Rule rules:files-only blocks writes under the rules board's files \(docs\/rules\/ in the repository and \.llm\/rules\/\); only the rules board writes there\.\nRight path: /)
  assert.match(reason, /\nException: Only the human can change rules, with \/rules\.$/)
  const shellDenied = await exec('Bash', shell('Set-Content docs/rules/rules.json x'))
  assert.equal(shellDenied.isError, true, 'a GLM Bash call is judged as the shell')
  const records = await violations(2)
  assert.deepEqual(records.map(record => `${String(record.rule)} ${String(record.tool)}`).sort(), [`${RULES_FILES_ONLY} Bash`, `${RULES_FILES_ONLY} Write`])
  assert.equal(records.find(record => record.tool === 'Write')?.correction, reason)
})

rowTest('rules:files-only judges shell commands that file-tools-only counts as writes and that name a rules directory', async ({ root, exec, calls }) => {
  const writes = [
    `Set-Content -Path '${join(root, 'docs', 'rules', 'rules.json')}' -Value x`,
    'Set-Content docs/rules/rules.json x',
    'echo x > docs/rules/rules.json',
    `Add-Content '${join(root, '.llm', 'rules', 'journal.jsonl')}' x`,
  ]
  for (const command of writes) {
    assert.equal((await exec('pwsh', shell(command))).isError, true, command)
    assert.equal((await exec('pwsh', shell(command), { parent: {} })).isError, true, `${command}, from a run_code program`)
  }
  for (const command of ['Get-Content docs/rules/rules.json', 'Set-Content other.txt x', 'echo hi']) {
    assert.equal((await exec('pwsh', shell(command))).isError, false, command)
  }
  assert.equal(calls.length, 3)
}, { natives: NATIVES })

/** A work tree of the repository at `<root>/.worktrees/<name>`, laid out as `git worktree add` does. */
async function addWorkTree(root: string, name: string, fully = true): Promise<string> {
  const tree = join(root, '.worktrees', name)
  const git = join(root, '.git', 'worktrees', name)
  await mkdir(git, { recursive: true })
  await writeFile(join(git, 'gitdir'), `${join(tree, '.git')}\n`)
  await mkdir(tree, { recursive: true })
  if (fully) {
    await writeFile(join(git, 'commondir'), '../..\n')
    await writeFile(join(tree, '.git'), `gitdir: ${git}\n`)
  }
  return tree
}

rowTest('rules:files-only guards the same relative path in every work tree of the repository, from a session at the root and from a session in a work tree', async ({ root, runtime, exec }) => {
  const tree = await addWorkTree(root, 'wt-1')
  assert.equal((await exec('write', { file_path: join(tree, 'docs', 'rules', 'rules.json'), content: 'x' })).isError, true, 'from the root')
  assert.equal((await exec('write', { file_path: join(tree, 'docs', 'readme.md'), content: 'x' })).isError, false)
  const inTree = { ...runtime.agent, session: { ...runtime.agent.session!, header: { ...runtime.agent.session!.header, cwd: tree } } }
  assert.equal((await exec('write', { file_path: 'docs/rules/rules.json', content: 'x' }, { agent: inTree })).isError, true, 'a relative target from a session in the work tree')
  assert.equal((await exec('pwsh', shell('Set-Content docs/rules/rules.json x'), { agent: inTree })).isError, true, 'a shell write from a session in the work tree')
  assert.equal((await exec('write', { file_path: join(root, '.llm', 'rules', 'state.json'), content: 'x' }, { agent: inTree })).isError, true, 'the runtime directory of the project')
  assert.equal((await exec('write', { file_path: 'docs/readme.md', content: 'x' }, { agent: inTree })).isError, false)
}, { natives: NATIVES })

const clock = { now: PEAK_NOW }

rowTest('the work trees are listed once a minute: one added since is seen after 60 seconds', async ({ root, exec }) => {
  clock.now = PEAK_NOW
  await addWorkTree(root, 'wt-1', false)
  assert.equal((await exec('write', { file_path: join(root, 'x.md'), content: 'x' })).isError, false, 'this call reads the list')
  const later = await addWorkTree(root, 'wt-2', false)
  const target = { file_path: join(later, 'docs', 'rules', 'a.json'), content: 'x' }
  assert.equal((await exec('write', target)).isError, false, 'the list kept from the call before does not have it yet')
  clock.now += 61_000
  assert.equal((await exec('write', target)).isError, true, 'a minute on it does')
}, { natives: NATIVES, config: { now: () => clock.now } })

test('worktreesOf lists the main checkout and the work trees the git directory names, as git worktree list does, and nothing outside a repository', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rules-trees-'))
  try {
    assert.deepEqual(worktreesOf(root), [], 'not a repository')
    await mkdir(join(root, '.git'))
    assert.deepEqual(worktreesOf(root), [root])
    const tree = await addWorkTree(root, 'wt-1')
    const outside = join(root, 'elsewhere', 'wt-2')
    await mkdir(join(root, '.git', 'worktrees', 'wt-2'), { recursive: true })
    await writeFile(join(root, '.git', 'worktrees', 'wt-2', 'gitdir'), `${join(outside, '.git')}\n`)
    await mkdir(join(root, '.git', 'worktrees', 'wt-3'), { recursive: true })
    await writeFile(join(root, '.git', 'worktrees', 'wt-3', 'gitdir'), '\n')
    await mkdir(join(root, '.git', 'worktrees', 'wt-4'), { recursive: true })
    assert.deepEqual(worktreesOf(root), [root, tree, outside], 'an entry with no readable gitdir is not a work tree')
    assert.deepEqual(worktreesOf(tree), [], 'the argument is a project root: a work tree is not one')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

rowTest('the rules directory of the row configuration is the one that is guarded, and the runtime directory always is', async ({ root, exec }) => {
  assert.equal((await exec('write', { file_path: join(root, 'policy', 'rules', 'rules.json'), content: 'x' })).isError, true)
  assert.equal((await exec('write', { file_path: join(root, 'docs', 'rules', 'rules.json'), content: 'x' })).isError, false, 'the default directory is no longer the board\'s')
  assert.equal((await exec('write', { file_path: join(root, '.llm', 'rules', 'state.json'), content: 'x' })).isError, true)
}, { natives: NATIVES, config: { dir: 'policy/rules' } })

rowTest('rules:files-only holds when the state of the project cannot be read', async ({ root, exec }) => {
  await mkdir(join(root, '.llm', 'rules', 'journal.jsonl'), { recursive: true })
  assert.equal((await exec('write', { file_path: join(root, 'docs', 'rules', 'rules.json'), content: 'x' })).isError, true)
}, { natives: NATIVES })

rowTest('a session without a working directory is not judged: there is no rules directory to guard', async ({ exec }) => {
  assert.equal((await exec('write', { file_path: 'docs/rules/rules.json', content: 'x' })).isError, false)
}, { natives: NATIVES, cwd: null })

// ------------------------------------------------------------------- faults

rowTest('a state that cannot be read lets the call run and degrades the row\'s health with the reason; the next call that can read it clears the report', async ({ root, runtime, exec, calls }) => {
  const journal = join(root, '.llm', 'rules', 'journal.jsonl')
  await mkdir(journal, { recursive: true })
  const result = await exec('pwsh', shell('echo rules-probe-blocked'))
  assert.equal(result.isError, false, 'the call ran')
  assert.deepEqual(calls.map(call => call.name), ['pwsh'])
  assert.equal(health(runtime).status, 'degraded')
  assert.match(health(runtime).reason, /^读规则板的状态失败：.+，这次调用放行/)
  await rm(journal, { recursive: true })
  assert.equal((await exec('pwsh', shell('echo rules-probe-blocked'))).isError, true, 'readable again')
  assert.equal(health(runtime).status, 'active')
}, { rules: file([BLOCK_PROBE]) })

rowTest('a fault anywhere in the judgement lets the call run, says why in the row\'s health, and the listener does not throw', async ({ runtime, exec, calls }) => {
  const broken = { ...runtime.agent, session: { ...runtime.agent.session!, get header(): never { throw new Error('header gone') } } }
  const result = await exec('pwsh', shell('echo rules-probe-blocked'), { agent: broken })
  assert.equal(result.isError, false)
  assert.deepEqual(calls.map(call => call.name), ['pwsh'])
  assert.equal(health(runtime).status, 'degraded')
  assert.match(health(runtime).reason, /^规则板判定出错：header gone，这次调用放行/)
}, { rules: file([BLOCK_PROBE]) })

rowTest('a journal that cannot be reached never turns a refusal into a call that runs', async ({ exec, calls }) => {
  const result = await exec('pwsh', shell('echo rules-probe-blocked'))
  assert.equal(result.isError, true)
  assert.deepEqual(calls, [])
}, { rules: file([BLOCK_PROBE]), services: { glmHournessData: { get userHome(): never { throw new Error('data service gone') } } } })

rowTest('a call of an agent with no session runs', async ({ runtime, exec }) => {
  const bare = { id: 'x', ctx: runtime.ctx }
  assert.equal((await exec('pwsh', shell('echo rules-probe-blocked'), { agent: bare })).isError, false)
}, { rules: file([BLOCK_PROBE]) })

// ------------------------------------------------------------ pricing readings

const PRICE_CASES: ReadonlyArray<readonly [string, unknown, RegExp, boolean]> = [
  ['absent', 'none', /GLM peak: unknown \(没有计价服务（GLM 通道包未装，或它的 glm-login 行未启用）\)\./, false],
  ['of the wrong shape', { basis: 'x', plan: 'y' }, /GLM peak: unknown \(计价服务的形状不对\)\./, false],
  ['one whose peak throws', { basis: 'x', plan: 'y', charged: () => 1, peak: () => { throw new Error('rate table gone') } }, /GLM peak: unknown \(计价服务的 peak 出错：rate table gone\)\./, true],
]
for (const [title, pricing, expected, listsRule] of PRICE_CASES) {
  rowTest(`rules_show reads the GLM peak as unknown when the pricing service is ${title}, with its own reason, and the row stays in effect`, async ({ runtime, exec }) => {
    const shown = (await exec('rules_show', {})).value as { text: string }
    assert.match(shown.text, expected)
    assert.equal(shown.text.includes('builtin:glm-peak-pricing'), listsRule, 'the default rule is listed only where there is a pricing service')
    assert.equal(health(runtime).status, 'active')
    assert.match(health(runtime).reason, /读不出是不是高峰/)
  }, { pricing })
}

let asked = 0
rowTest('the clock of the GLM plan is read once a minute, not once a call', async ({ exec }) => {
  await exec('pwsh', shell('a'))
  const first = asked
  assert.ok(first > 0)
  await exec('pwsh', shell('b'))
  await exec('pwsh', shell('c'))
  assert.equal(asked, first, 'two more calls in the same minute asked nothing')
}, { pricing: { ...creditPricing, peak: (atMs: number) => { asked += 1; return creditPricing.peak(atMs) } } })

// ------------------------------------------------------------------- rules_show

const SHOW_RULES = file([
  ruleOf({ id: 'r-all', title: 'Everybody', filter: { command: { matches: 'rm -rf' } } }),
  ruleOf({ id: 'r-sub', title: 'Subagents only', filter: { role: { in: ['subagent'] }, command: { matches: 'rm -rf' } } }),
  ruleOf({ id: 'r-glm', title: 'GLM only', filter: { model: { matches: '^[^/]*/glm' }, command: { matches: 'rm -rf' } } }),
  ruleOf({ id: 'r-note', title: 'Note npm', filter: { command: { matches: '^npm' } }, action: { kind: 'record' } }),
  INFORM_FRIDAY,
], { signals: { 'code-freeze': { type: { kind: 'boolean' }, manual: { value: true, at: '2026-10-30T02:00:00.000Z' } } } })

async function shownTo(fixture: Fixture, over?: Parameters<Fixture['exec']>[2]): Promise<string> {
  const result = await fixture.exec('rules_show', {}, over)
  assert.equal(result.isError, false, textOf(result))
  const value = result.value as { ok: boolean, text: string }
  assert.equal(value.ok, true)
  assert.equal(textOf(result), value.text, 'the rendered text is the text')
  return value.text
}

rowTest('rules_show lists the rules in force for the caller, with how each acts, and leaves out the rules that are about other callers', async (fixture) => {
  const text = await shownTo(fixture)
  assert.match(text, /^Rules board of rules-row-\w+\./)
  for (const id of ['r-all', 'r-note', 'r-friday']) assert.ok(text.includes(`] ${id}:`), `${id} in\n${text}`)
  for (const id of ['r-sub', 'r-glm']) assert.ok(!text.includes(`] ${id}:`), `${id} out`)
  assert.match(text, /- \[block\] r-all: Everybody \(set by the human at /)
  assert.match(text, /- \[record\] r-note: /)
  assert.match(text, /- \[inform\] r-friday: /)
  const sub = await shownTo(fixture, { agent: subagentOf(fixture.runtime.agent) })
  assert.ok(sub.includes('] r-sub:') && sub.includes('] r-all:'))
  await fixture.runtime.assemble(GLM_ROUTE)
  assert.ok((await shownTo(fixture)).includes('] r-glm:'), 'the model of the latest request is the caller\'s model')
}, { rules: SHOW_RULES, route: OTHER_ROUTE })

rowTest('rules_show says which rules it cannot place because a field they ask about is not known for the caller', async (fixture) => {
  const text = await shownTo(fixture)
  assert.ok(!text.includes('] r-glm:'))
  assert.match(text, /r-glm asks about your model, which is not known/)
}, { rules: SHOW_RULES })

rowTest('rules_show lists the signals with their source and the peak mode', async (fixture) => {
  const text = await shownTo(fixture)
  assert.match(text, /- code-freeze: on \(source manual\)/)
  assert.match(text, /Peak mode: reduce \(the default; the human can change it\)\./)
}, { rules: SHOW_RULES })

rowTest('rules_show lists every rule, however many there are', async (fixture) => {
  const text = await shownTo(fixture)
  assert.equal(text.split('\n').filter(line => /^- \[block\] r-many-/.test(line)).length, 60)
  assert.ok(text.length > 8_000)
}, { rules: file(Array.from({ length: 60 }, (_, index) => ruleOf({ id: `r-many-${String(index).padStart(2, '0')}`, title: `Rule number ${index} with a title long enough to push the text past any cap a careless tool might apply`, filter: { command: { matches: `word${index}` } } }))) })

rowTest('rules_show in a GLM peak lists the default rule with when the peak ends', async (fixture) => {
  const text = await shownTo(fixture)
  assert.ok(text.includes(`- [inform] builtin:glm-peak-pricing: GLM peak hours until ${clockHm(PEAK_END)}: GLM usage is charged at the full credit rate, half outside peak. The GLM package's peak reminder tells you this.`), text)
  assert.ok(text.includes(`GLM peak: now, until ${clockHm(PEAK_END)}.`), text)
})

rowTest('outside a GLM peak rules_show lists the default rule with the plain statement of the prices', async (fixture) => {
  const text = await shownTo(fixture)
  assert.ok(text.includes('- [inform] builtin:glm-peak-pricing: GLM usage is charged at the full credit rate in peak hours and half outside them. The GLM package\'s peak reminder tells you this.'), text)
  assert.match(text, /GLM peak: not now/)
}, { now: OFF_PEAK })

rowTest('rules_show lists the entries the peak mode enables for the caller and says which package brings the entries of the code', async (fixture) => {
  assert.equal((await fixture.run('peak 不做')).kind, 'success')
  const root = await shownTo(fixture)
  assert.ok(root.includes('] builtin:glm-peak-stop-dispatch:') && root.includes('] builtin:glm-peak-stop-scripts:'), 'entries with no subject filter apply to everyone')
  assert.ok(!root.includes('] builtin:glm-peak-stop:'), 'the one for GLM subagents does not apply to a root session')
  const subagent = await shownTo(fixture, { agent: subagentOf(fixture.runtime.agent) })
  assert.ok(subagent.includes('] builtin:glm-peak-stop:'), subagent)
  assert.ok(subagent.includes('Entries named builtin: come with the package 项目编排 (dsh-hourness) and cannot be changed by you; the human changes the peak mode with /rules peak.'), subagent)
}, { route: GLM_ROUTE })

rowTest('rules_show in a session without a working directory says that only the rules of the code apply', async (fixture) => {
  const text = await shownTo(fixture)
  assert.match(text, /no working directory/)
}, { cwd: null })

rowTest('rules_show lists the open waiting calls of the caller\'s session and no others', async (fixture) => {
  const ticket = (id: string, sessionId: string): unknown => ({
    id, state: 'deferred', rules: ['r-hold'], sessionId, agentLabel: 'main', host: { pid: 1, startedAt: 1 }, signature: id, tool: 'pwsh', summary: `run ${id}`, since: '2026-10-28T06:50:00.000Z',
  })
  await injectRecord(rulesPaths(fixture.root), [
    { path: ['tickets', 'q-1'], value: ticket('q-1', 'agent-1') },
    { path: ['tickets', 'q-2'], value: ticket('q-2', 'someone-else') },
    { path: ['nextTicket'], value: 3 },
  ], '2026-10-28T06:50:00.000Z')
  const text = await shownTo(fixture)
  assert.ok(text.includes('- q-1: pwsh "run q-1" is deferred since '), text)
  assert.ok(!text.includes('q-2'), text)
})
