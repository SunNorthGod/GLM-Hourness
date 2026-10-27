import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, DECLARATION_SECTION, guardHealth, type GuardRecord, type ViolationRecord } from '../src/guard/index.ts'
import { apply as glmPromptApply } from '../src/glm-prompt/index.ts'
import type { ShadowRecord } from '../src/guard/shadow.ts'
import type { AgentLike, PreExecuteDecision, SessionEventLike, SessionLike, ToolExecutionPayload, WorkspaceChangesSummary } from '../src/shared/dsh-min.ts'
import { fakeRuntime } from './fake-rc3.ts'

/**
 * The calling agent as an rc.3 execution carries it (dsh-tools createExecution:
 * no agentId or sessionId fields): its id, its session's id and working directory.
 */
function agentAt(cwd: string | undefined, id = 'a1', sessionId = id): AgentLike {
  return { id, ctx: {} as AgentLike['ctx'], session: { id: sessionId, header: { id: sessionId, ...(cwd === undefined ? {} : { cwd }) }, deriveMessages: () => [] } }
}

/** An in-memory filesystem for the journal appender (mkdir + appendFile). */
function memoryFs() {
  const files = new Map<string, string>()
  return {
    files,
    fs: {
      mkdir: async () => undefined,
      appendFile: async (path: string, data: string) => { files.set(path, (files.get(path) ?? '') + data) },
    },
    lines: (path: string) => (files.get(path) ?? '').split('\n').filter(line => line.length > 0).map(line => JSON.parse(line) as GuardRecord),
  }
}

/** Let the fire-and-forget journal write settle. */
const settle = () => new Promise(resolve => setImmediate(resolve))

const VIOLATIONS = 'C:/ws/.llm/audit/violations.jsonl'

type Listener = (...args: never[]) => unknown

/**
 * A host for the guard row: listeners by event (the pre-execute waterfall
 * ends in the runtime's default `allow`, or in `inner` when given), the
 * session observers, and cordis `get` with the data service and any extra
 * service (workspaceChanges).
 */
function harness(roots: readonly string[] | undefined, options: { home?: string, service?: unknown, inner?: PreExecuteDecision } = { home: 'C:/ws/.llm' }) {
  const decisions: PreExecuteDecision[] = []
  const store = memoryFs()
  const services = new Map<string, unknown>()
  const listeners = new Map<string, Listener>()
  const ctx = {
    on: (event: string, listener: Listener) => {
      listeners.set(event, listener)
      return () => {}
    },
    get: (name: string) => name === 'glmHournessData' ? options.service : services.get(name),
  }
  apply(ctx as never, { ...(roots === undefined ? {} : { workspaceRoots: roots }), fs: store.fs, ...(options.home === undefined ? {} : { home: options.home }) })
  const preExecute = listeners.get('tools/pre-execute') as unknown as (payload: ToolExecutionPayload, next: () => Promise<PreExecuteDecision>) => Promise<PreExecuteDecision>
  return {
    decisions,
    services,
    files: store.files,
    records: () => store.lines(VIOLATIONS),
    violations: () => store.lines(VIOLATIONS) as ViolationRecord[],
    run: (payload: ToolExecutionPayload) => preExecute(payload, async () => options.inner ?? { kind: 'allow' }).then(decision => { decisions.push(decision) }).then(settle),
    event: (session: SessionLike, event: SessionEventLike) => (listeners.get('session/event') as unknown as (s: SessionLike, e: SessionEventLike) => void)(session, event),
    disposed: (session: SessionLike) => (listeners.get('session/disposed') as unknown as (s: SessionLike) => void)(session),
  }
}

const decisionOf = (h: { decisions: PreExecuteDecision[] }) => h.decisions[0]

test('out-of-workspace write is denied and journaled under <home>/audit with rule id, correction and the calling agent ids', async () => {
  const h = harness(['C:\\ws'])
  await h.run({ name: 'Write', arguments: { file_path: 'C:\\Windows\\x.dll' }, agent: agentAt(undefined, 'a1', 's1') })
  assert.equal(decisionOf(h)!.kind, 'deny')
  assert.equal(h.violations().length, 1)
  const record = h.violations()[0]!
  assert.equal(record.rule, 'workspace-containment')
  assert.equal(record.tool, 'Write')
  assert.equal(record.agentId, 'a1')
  assert.equal(record.sessionId, 's1')
  assert.ok(record.correction.includes('Right path:'))
  assert.ok(!Number.isNaN(Date.parse(record.at)))
})

test('shell write inside the workspace is still denied by file-tools-only', async () => {
  const h = harness(['C:\\ws'])
  await h.run({ name: 'Bash', arguments: { command: 'echo hi > C:/ws/out.txt' } })
  assert.equal(h.violations()[0]!.rule, 'file-tools-only')
  assert.ok(h.violations()[0]!.correction.includes('(redirection > C:/ws/out.txt)'))
})

test('allowed calls are neither denied nor audited', async () => {
  const h = harness(['C:\\ws'])
  await h.run({ name: 'Read', arguments: { file_path: 'C:\\ws\\a.ts' } })
  await h.run({ name: 'Bash', arguments: { command: 'git commit -m "map => reduce, a -> b, x >>> 1"' } })
  assert.deepEqual(h.decisions.map(decision => decision.kind), ['allow', 'allow'])
  assert.equal(h.records().length, 0)
})

test('terminal_send text is read like shell text (dsh-tool-terminal names the field text)', async () => {
  const h = harness(['C:\\ws'])
  await h.run({ name: 'terminal_send', arguments: { sessionId: 't1', text: 'Set-Content f.txt hi' } })
  assert.equal(h.violations()[0]!.rule, 'file-tools-only')
})

test('without a row home the violation goes to the data service project directory', async () => {
  const h = harness(['C:\\ws'], { service: { userHome: 'C:/users/me/.dsh/glm-hourness', projectHome: 'C:/ws/.llm' } })
  await h.run({ name: 'Bash', arguments: { command: 'Set-Content f.txt hi' }, agent: agentAt('C:\\ws', 'a2', 's2') })
  assert.equal(decisionOf(h)!.kind, 'deny')
  assert.deepEqual(h.violations().map(record => [record.rule, record.tool, record.agentId, record.sessionId]), [['file-tools-only', 'Bash', 'a2', 's2']])
  assert.deepEqual([...h.files.keys()], [VIOLATIONS]) // nothing written to the user-level directory
})

test('a row home wins over the data service project directory', async () => {
  const h = harness(['C:\\ws'], { home: 'C:/ws/.llm', service: { userHome: 'C:/u/glm-hourness', projectHome: 'C:/other/.llm' } })
  await h.run({ name: 'Bash', arguments: { command: 'Set-Content f.txt hi' } })
  assert.deepEqual([...h.files.keys()], [VIOLATIONS])
})

test('without any directory the call is still denied and the lost record is reported once', async () => {
  const warnings: string[] = []
  const warn = console.warn
  console.warn = (message: string) => { warnings.push(message) }
  try {
    const h = harness(['C:\\ws'], {})
    await h.run({ name: 'Bash', arguments: { command: 'Set-Content f.txt hi' } })
    await h.run({ name: 'Bash', arguments: { command: 'Out-File f.txt' } })
    assert.deepEqual(h.decisions.map(decision => decision.kind), ['deny', 'deny'])
    assert.equal(h.files.size, 0)
    assert.equal(warnings.length, 1)
    assert.ok(warnings[0]!.includes('violations journal write failed: no project directory'))
  }
  finally {
    console.warn = warn
  }
})

test('roots default to the calling agent session directory', async () => {
  const h = harness(undefined) // no containment roots configured
  await h.run({ name: 'Write', arguments: { file_path: 'C:\\ws\\src\\a.ts' }, agent: agentAt('C:\\ws') })
  assert.equal(h.decisions[0]!.kind, 'allow') // inside the agent session directory
  await h.run({ name: 'Write', arguments: { file_path: 'C:\\elsewhere\\a.ts' }, agent: agentAt('C:\\ws') })
  assert.equal(h.decisions[1]!.kind, 'deny') // outside it
})

test('a call without config or agent directory keeps file-tools-only but skips containment', async () => {
  const h = harness(undefined)
  await h.run({ name: 'Write', arguments: { file_path: 'C:\\anywhere\\a.ts' } })
  assert.equal(h.decisions[0]!.kind, 'allow') // no provable root: containment cannot judge
  await h.run({ name: 'Bash', arguments: { command: 'echo x > a.txt' } })
  assert.equal(h.decisions[1]!.kind, 'deny') // the shell-write rule does not need a root
})

// Workspace-change fallback, shadow mode (docs/ORCHESTRATION.md §6.5): the
// turn's workspace-changes summary against the turn's file-tool targets.

/** A workspaceChanges service whose summaries are stored after the event, as TurnRecorder.record does. */
function changes(h: ReturnType<typeof harness>) {
  const summaries = new Map<string, WorkspaceChangesSummary>()
  h.services.set('workspaceChanges', { summary: (sessionId: string, seq: number) => summaries.get(`${sessionId}#${seq}`) })
  return (session: SessionLike, seq: number, summary: WorkspaceChangesSummary) => {
    h.event(session, { type: 'workspace/changes', seq, data: { turn: summary.turn } })
    summaries.set(`${session.id}#${seq}`, summary)
  }
}

const changed = (turn: number, ...paths: string[]): WorkspaceChangesSummary => ({ turn, cwd: 'C:\\ws', files: paths.map(path => ({ path, display: path.replaceAll('\\', '/') })), total: paths.length })
const DOTNET_WRITE = '[IO.File]::WriteAllText(\'C:/ws/gen.txt\', \'x\')' // a shell write the reader does not see

test('shadow: a turn whose shell calls changed files no file tool targeted leaves one record and blocks nothing', async () => {
  const h = harness(['C:\\ws'])
  const announce = changes(h)
  const agent = agentAt('C:\\ws', 'a1', 's1')
  h.event(agent.session!, { type: 'turn/start', seq: 0, data: { turn: 1 } })
  await h.run({ name: 'Bash', arguments: { command: DOTNET_WRITE }, agent })
  await h.run({ name: 'Write', arguments: { file_path: 'C:\\ws\\tool.txt', content: 'y' }, agent })
  await h.run({ name: 'Edit', arguments: { file_path: 'C:/WS/src/a.ts', old_string: 'a', new_string: 'b' }, agent })
  assert.deepEqual(h.decisions.map(decision => decision.kind), ['allow', 'allow', 'allow'])
  announce(agent.session!, 7, changed(1, 'gen.txt', 'tool.txt', 'src\\a.ts'))
  await settle()
  assert.deepEqual(h.records(), [{
    at: (h.records()[0] as ShadowRecord).at,
    rule: 'file-tools-only',
    mode: 'shadow',
    sessionId: 's1',
    agentId: 'a1',
    turn: 1,
    paths: ['gen.txt'],
    calls: [{ tool: 'Bash', command: DOTNET_WRITE }],
  }])
})

test('shadow: no record without an allowed shell call, when file tools cover every change, or without the service', async () => {
  const h = harness(['C:\\ws'])
  const announce = changes(h)
  const s1 = agentAt('C:\\ws', 'a1', 's1')
  h.event(s1.session!, { type: 'turn/start', seq: 0, data: { turn: 1 } })
  await h.run({ name: 'Write', arguments: { file_path: 'C:\\ws\\tool.txt' }, agent: s1 })
  announce(s1.session!, 3, changed(1, 'tool.txt', 'user-edit.txt')) // no shell call: the user or a file tool
  const s2 = agentAt('C:\\ws', 'a2', 's2')
  h.event(s2.session!, { type: 'turn/start', seq: 0, data: { turn: 1 } })
  await h.run({ name: 'Bash', arguments: { command: 'npm test' }, agent: s2 })
  await h.run({ name: 'Write', arguments: { file_path: 'C:\\ws\\tool.txt' }, agent: s2 })
  announce(s2.session!, 4, changed(1, 'tool.txt')) // every change was a file-tool target
  const s3 = agentAt('C:\\ws', 'a3', 's3')
  h.event(s3.session!, { type: 'turn/start', seq: 0, data: { turn: 1 } })
  await h.run({ name: 'Bash', arguments: { command: 'Set-Content gen.txt x' }, agent: s3 }) // denied: never ran
  announce(s3.session!, 5, changed(1, 'gen.txt'))
  await settle()
  assert.deepEqual(h.records().map(record => 'mode' in record ? 'shadow' : record.rule), ['file-tools-only']) // only s3's denial

  const bare = harness(['C:\\ws'])
  bare.event(s1.session!, { type: 'turn/start', seq: 0, data: { turn: 1 } })
  await bare.run({ name: 'Bash', arguments: { command: DOTNET_WRITE }, agent: s1 })
  bare.event(s1.session!, { type: 'workspace/changes', seq: 2, data: { turn: 1 } }) // composition without workspace-changes
  await settle()
  assert.equal(bare.records().length, 0)
  assert.equal(guardHealth(['C:\\ws'], 'C:/ws/.llm', false)[1], '门禁生效（file-tools-only，圈禁根 C:\\ws）；违规记入 C:/ws/.llm；影子兜底未启用（组合里没有 workspace-changes）')
})

test('shadow: a call another listener denied is not counted; a summary after the next turn started still matches its turn', async () => {
  const denied = harness(['C:\\ws'], { home: 'C:/ws/.llm', inner: { kind: 'deny', reason: 'user declined' } })
  const announceDenied = changes(denied)
  const agent = agentAt('C:\\ws', 'a1', 's1')
  denied.event(agent.session!, { type: 'turn/start', seq: 0, data: { turn: 1 } })
  await denied.run({ name: 'Bash', arguments: { command: DOTNET_WRITE }, agent })
  announceDenied(agent.session!, 4, changed(1, 'gen.txt'))
  await settle()
  assert.equal(denied.records().length, 0)

  const h = harness(['C:\\ws'])
  const announce = changes(h)
  h.event(agent.session!, { type: 'turn/start', seq: 0, data: { turn: 1 } })
  await h.run({ name: 'Bash', arguments: { command: DOTNET_WRITE }, agent })
  h.event(agent.session!, { type: 'turn/start', seq: 5, data: { turn: 2 } })
  await h.run({ name: 'Write', arguments: { file_path: 'C:\\ws\\gen.txt' }, agent }) // turn 2's target does not excuse turn 1
  announce(agent.session!, 6, changed(1, 'gen.txt'))
  await settle()
  assert.deepEqual(h.records().map(record => (record as ShadowRecord).turn), [1])
  h.disposed(agent.session!)
  announce(agent.session!, 8, changed(2, 'gen.txt')) // forgotten with the session
  await settle()
  assert.equal(h.records().length, 1)
})

// Declaration (docs/ORCHESTRATION.md §6.1): GLM system prompts carry the active rules.

test('a GLM request carries the rule declarations as the last system prompt section; other routes do not', async () => {
  const rt = fakeRuntime()
  glmPromptApply(rt.ctx)
  apply(rt.ctx as never, { workspaceRoots: ['C:\\ws'], home: 'C:/ws/.llm', fs: memoryFs().fs })
  await rt.create()
  await rt.create() // installs once per agent
  assert.equal(rt.listeners.filter(entry => entry.event === 'system-prompt/assemble').length, 2) // dialect and guard
  const glm = await rt.assemble({ provider: 'glm-zcode', model: 'glm-5.3' })
  const section = glm.sections.at(-1)!
  assert.equal(section.name, DECLARATION_SECTION)
  assert.equal(section.interpolate, false)
  assert.ok(section.text.startsWith('# Workspace rules\n'))
  assert.ok(section.text.includes('\n- You may only create and modify files inside the user\'s workspace.'))
  assert.ok(section.text.includes('\n- Modify files and code only with the dedicated Write/Edit tools.'))
  assert.equal(glm.sections.filter(entry => entry.name === DECLARATION_SECTION).length, 1)
  assert.equal(glm.sections[0]!.name, 'glm:cli-prefix') // the dialect rewrite still leads
  const plain = await rt.assemble({ provider: 'deepseek', model: 'deepseek-flash' })
  assert.ok(!plain.sections.some(entry => entry.name === DECLARATION_SECTION))
})

test('without a session directory the declaration lists file-tools-only alone, as the gate enforces', async () => {
  const rt = fakeRuntime() // the fake agent's session has no cwd
  apply(rt.ctx as never, { home: 'C:/ws/.llm', fs: memoryFs().fs })
  await rt.create()
  const section = (await rt.assemble({ model: 'glm-5.3' })).sections.at(-1)!
  assert.equal(section.name, DECLARATION_SECTION)
  assert.equal(section.text.split('\n').filter(line => line.startsWith('- ')).length, 1)
  assert.ok(!section.text.includes('inside the user\'s workspace'))
})
