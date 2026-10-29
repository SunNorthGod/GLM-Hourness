import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, DECLARATION_SECTION, guardHealth, type GuardRecord, type ViolationRecord } from '../src/guard/index.ts'
import { apply as glmPromptApply, dialectServiceFor } from '../src/glm-prompt/index.ts'
import type { ShadowRecord } from '../src/guard/shadow.ts'
import type { AgentLike, PreExecuteDecision, SessionEventLike, SessionLike, ToolExecutionPayload, WorkspaceChangesSummary } from '../src/shared/dsh-min.ts'
import { GRAPH_FILES_DECLARATION, GRAPH_SERVICE } from '../src/graph/service.ts'
import { DIALECT_SERVICE } from '../src/shared/dialect.ts'
import { fakeRuntime } from './fake-rc3.ts'

/**
 * The calling agent as an rc.3 execution carries it (dsh-tools createExecution:
 * no agentId or sessionId fields): its id, its session's id and working
 * directory, and the session's request-header fold naming the model of the
 * current step (dsh-session `requestHeader`; GLM unless a test says otherwise).
 */
function agentAt(cwd: string | undefined, id = 'a1', sessionId = id, route: { provider: string, model: string } = { provider: 'glm-zcode', model: 'glm-5.3' }): AgentLike {
  return { id, ctx: {} as AgentLike['ctx'], session: { id: sessionId, header: { id: sessionId, ...(cwd === undefined ? {} : { cwd }) }, deriveMessages: () => [], requestHeader: () => ({ config: route }) } }
}

const DEEPSEEK = { provider: 'deepseek-account', model: 'deepseek-flash' }

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
  await h.run({ name: 'Bash', arguments: { command: 'echo hi > C:/ws/out.txt' }, agent: agentAt(undefined) })
  assert.equal(h.violations()[0]!.rule, 'file-tools-only')
  assert.ok(h.violations()[0]!.correction.includes('(redirection > C:/ws/out.txt)'))
})

test('allowed calls are neither denied nor audited', async () => {
  const h = harness(['C:\\ws'])
  await h.run({ name: 'Read', arguments: { file_path: 'C:\\ws\\a.ts' }, agent: agentAt(undefined) })
  await h.run({ name: 'Bash', arguments: { command: 'git commit -m "map => reduce, a -> b, x >>> 1"' }, agent: agentAt(undefined) })
  assert.deepEqual(h.decisions.map(decision => decision.kind), ['allow', 'allow'])
  assert.equal(h.records().length, 0)
})

test('terminal_send text is read like shell text (dsh-tool-terminal names the field text)', async () => {
  const h = harness(['C:\\ws'])
  await h.run({ name: 'terminal_send', arguments: { sessionId: 't1', text: 'Set-Content f.txt hi' }, agent: agentAt(undefined) })
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
  await h.run({ name: 'Bash', arguments: { command: 'Set-Content f.txt hi' }, agent: agentAt(undefined) })
  assert.deepEqual([...h.files.keys()], [VIOLATIONS])
})

test('without any directory the call is still denied and the lost record is reported once', async () => {
  const warnings: string[] = []
  const warn = console.warn
  console.warn = (message: string) => { warnings.push(message) }
  try {
    const h = harness(['C:\\ws'], {})
    await h.run({ name: 'Bash', arguments: { command: 'Set-Content f.txt hi' }, agent: agentAt(undefined) })
    await h.run({ name: 'Bash', arguments: { command: 'Out-File f.txt' }, agent: agentAt(undefined) })
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
  await h.run({ name: 'Write', arguments: { file_path: 'C:\\anywhere\\a.ts' }, agent: agentAt(undefined) })
  assert.equal(h.decisions[0]!.kind, 'allow') // no provable root: containment cannot judge
  await h.run({ name: 'Bash', arguments: { command: 'echo x > a.txt' }, agent: agentAt(undefined) })
  assert.equal(h.decisions[1]!.kind, 'deny') // the shell-write rule does not need a root
})

// Relative targets (L4 2026-10-28: `.llm/l4-dsh/calc.mjs` was denied as
// outside the workspace) and `..` segments resolve like the file tools do.

test('a relative target resolves against the session directory; `..` cannot climb out of the root', async () => {
  const h = harness(undefined)
  const agent = agentAt('C:\\ws')
  await h.run({ name: 'Write', arguments: { file_path: '.llm/l4-dsh/calc.mjs' }, agent })
  await h.run({ name: 'Write', arguments: { file_path: 'src\\..\\docs\\a.md' }, agent })
  await h.run({ name: 'Write', arguments: { file_path: '..\\elsewhere\\a.ts' }, agent })
  await h.run({ name: 'Edit', arguments: { file_path: 'C:\\ws\\..\\elsewhere\\a.ts' }, agent }) // absolute, spelled through the root
  await h.run({ name: 'Write', arguments: { file_path: 'C:\\wsx\\a.ts' }, agent }) // a sibling sharing the prefix
  assert.deepEqual(h.decisions.map(decision => decision.kind), ['allow', 'allow', 'deny', 'deny', 'deny'])
  const denied = h.violations().map(record => record.correction.split('\n')[0])
  assert.equal(denied[0], 'You tried to write "..\\elsewhere\\a.ts" (resolves to "C:\\elsewhere\\a.ts").')
  assert.equal(denied[2], 'You tried to write "C:\\wsx\\a.ts".')
})

test('a relative target follows the session working directory (rc.3 workingDirectory.get) when the service is there', async () => {
  const h = harness(undefined)
  h.services.set('workingDirectory', { get: () => 'C:\\ws\\pkg\\sub' })
  const agent = agentAt('C:\\ws')
  await h.run({ name: 'Write', arguments: { file_path: '..\\a.ts' }, agent }) // C:\ws\pkg\a.ts
  await h.run({ name: 'Write', arguments: { file_path: '..\\..\\..\\a.ts' }, agent }) // C:\a.ts
  assert.deepEqual(h.decisions.map(decision => decision.kind), ['allow', 'deny'])
  h.services.set('workingDirectory', { get: () => { throw new Error('no projection') } })
  await h.run({ name: 'Write', arguments: { file_path: 'a.ts' }, agent }) // falls back to the session directory
  assert.equal(h.decisions[2]?.kind, 'allow')
})

// Scope (docs/ORCHESTRATION.md §6.2, question-14 G3): every route and model;
// the route only names the tools in corrections and tags the record.

test('non-GLM calls are judged like GLM ones: denied, corrected in native names, journaled as other with the route', async () => {
  const h = harness(['C:\\ws'])
  const deepseek = agentAt('C:\\ws', 'd1', 'd1', DEEPSEEK)
  await h.run({ name: 'write', arguments: { file_path: 'C:\\Windows\\x.dll' }, agent: deepseek })
  await h.run({ name: 'pwsh', arguments: { command: 'Set-Content f.txt hi' }, agent: deepseek })
  await h.run({ name: 'write', arguments: { file_path: 'C:\\ws\\a.ts' }, agent: deepseek })
  assert.deepEqual(h.decisions.map(decision => decision.kind), ['deny', 'deny', 'allow'])
  assert.deepEqual(h.violations().map(record => [record.rule, record.tool, record.scope, record.route]), [
    ['workspace-containment', 'write', 'other', DEEPSEEK],
    ['file-tools-only', 'pwsh', 'other', DEEPSEEK],
  ])
  assert.ok(h.violations()[1].correction.includes('Right path: Read the target with read, then apply the change with write or edit.'))
})

test('calls without an agent, or before the session logged a request header, are judged too; their records carry no route', async () => {
  const h = harness(['C:\\ws'])
  await h.run({ name: 'pwsh', arguments: { command: 'Set-Content f.txt hi' } })
  const unlogged = agentAt('C:\\ws', 'u1')
  ;(unlogged.session as { requestHeader?: unknown }).requestHeader = () => undefined // before the first request header
  await h.run({ name: 'pwsh', arguments: { command: 'Set-Content f.txt hi' }, agent: unlogged })
  assert.deepEqual(h.decisions.map(decision => decision.kind), ['deny', 'deny'])
  assert.deepEqual(h.violations().map(record => [record.scope, 'route' in record]), [['other', false], ['other', false]])
})

test('the route is read per call: a session switched from DeepSeek to GLM is tagged per step, in the dialect\'s names once it claims the agent', async () => {
  const h = harness(['C:\\ws'])
  let route = DEEPSEEK
  const agent = agentAt('C:\\ws', 'm1')
  ;(agent.session as { requestHeader?: unknown }).requestHeader = () => ({ config: route })
  h.services.set(DIALECT_SERVICE, dialectServiceFor(new WeakSet([agent])))
  await h.run({ name: 'pwsh', arguments: { command: 'Set-Content f.txt hi' }, agent })
  route = { provider: 'glm-zcode', model: 'glm-5.3-flash' }
  await h.run({ name: 'Bash', arguments: { command: 'Set-Content f.txt hi' }, agent })
  assert.deepEqual(h.decisions.map(decision => decision.kind), ['deny', 'deny'])
  assert.deepEqual(h.violations().map(record => [record.scope, record.route?.model]), [['other', 'deepseek-flash'], ['dialect', 'glm-5.3-flash']])
  assert.ok(h.violations()[0].correction.includes('apply the change with write or edit'))
  assert.ok(h.violations()[1].correction.includes('apply the change with Write or Edit'))
})

test('shadow: a non-GLM turn is noted too; its record is tagged other with the route', async () => {
  const h = harness(['C:\\ws'])
  const announce = changes(h)
  const agent = agentAt('C:\\ws', 'd1', 'd1', DEEPSEEK)
  h.event(agent.session!, { type: 'turn/start', seq: 0, data: { turn: 1 } })
  await h.run({ name: 'pwsh', arguments: { command: DOTNET_WRITE }, agent })
  announce(agent.session!, 3, changed(1, 'gen.txt'))
  await settle()
  assert.deepEqual(h.records().map(record => ['mode' in record ? record.mode : 'denial', record.scope, record.route]), [['shadow', 'other', DEEPSEEK]])
})

test('shadow: one shell call where the dialect claims the agent makes the turn dialect; the route is the last shell call\'s', async () => {
  const h = harness(['C:\\ws'])
  const announce = changes(h)
  let route: { provider: string, model: string } = { provider: 'glm-zcode', model: 'glm-5.3' }
  const agent = agentAt('C:\\ws', 'a1', 's1')
  ;(agent.session as { requestHeader?: unknown }).requestHeader = () => ({ config: route })
  h.services.set(DIALECT_SERVICE, dialectServiceFor(new WeakSet([agent])))
  h.event(agent.session!, { type: 'turn/start', seq: 0, data: { turn: 1 } })
  await h.run({ name: 'Bash', arguments: { command: DOTNET_WRITE }, agent })
  route = DEEPSEEK
  await h.run({ name: 'pwsh', arguments: { command: 'npm test' }, agent })
  announce(agent.session!, 4, changed(1, 'gen.txt'))
  await settle()
  assert.deepEqual(h.records().map(record => [record.scope, record.route]), [['dialect', DEEPSEEK]])
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
  // No dialect service here: Write and Edit count as file tools through the
  // static alias table, and the GLM route is not claimed (scope other).
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
    scope: 'other',
    route: { provider: 'glm-zcode', model: 'glm-5.3' },
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

test('shadow: with the graph row active, graph tool writes are a known source; without a graph tool call the graph files count', async () => {
  const h = harness(['C:\\ws'])
  const announce = changes(h)
  h.services.set(GRAPH_SERVICE, { dirFor: (cwd: string | undefined) => cwd === undefined ? undefined : `${cwd}\\docs\\graph`, isGraphTool: (name: string) => name.startsWith('graph_') })
  const agent = agentAt('C:\\ws', 'a1', 's1')
  h.event(agent.session!, { type: 'turn/start', seq: 0, data: { turn: 1 } })
  await h.run({ name: 'Bash', arguments: { command: DOTNET_WRITE }, agent })
  await h.run({ name: 'graph_comment', arguments: { id: 'goal-1', text: 'x' }, agent })
  announce(agent.session!, 5, changed(1, 'gen.txt', 'docs\\graph\\nodes\\goal-1.json', 'docs\\graphs\\x.md'))
  h.event(agent.session!, { type: 'turn/start', seq: 6, data: { turn: 2 } })
  await h.run({ name: 'Bash', arguments: { command: DOTNET_WRITE }, agent }) // no graph tool in turn 2
  announce(agent.session!, 9, changed(2, 'docs\\graph\\nodes\\goal-1.json'))
  await settle()
  assert.deepEqual(h.records().map(record => (record as ShadowRecord).paths), [['gen.txt', 'docs/graphs/x.md'], ['docs/graph/nodes/goal-1.json']])
  assert.deepEqual((h.records()[0] as ShadowRecord).calls, [{ tool: 'Bash', command: DOTNET_WRITE }], 'the graph tool is not a shell call')
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

// Tool names (docs/ORCHESTRATION.md §6.1): rules judge DSH natives; a call
// name maps through the dialect service, else the static alias table, and
// corrections name tools as the model sees them.

/** The file-tools-only declaration line and right path as GLM read them before split step 2, word for word. */
const FILE_TOOLS_LINE_ZCODE = 'Modify files and code only with the dedicated Write/Edit tools. The shell is for execution (tests, builds, git), not for writing files: a redirection into a file (`>`, `>>`) or a file-changing command (Set-Content, Add-Content, Clear-Content, Out-File, Tee-Object, New-Item, Copy-Item, Move-Item, Remove-Item, rm, rmdir, mv, cp, dd, touch, truncate, tee, sed -i) is denied.'
const RIGHT_PATH_ZCODE = 'Right path: Read the target with Read, then apply the change with Write or Edit.'
const RIGHT_PATH_NATIVE = 'Right path: Read the target with read, then apply the change with write or edit.'

test('a GLM call the dialect claims is corrected in its names, word for word as before; the record keeps the called name', async () => {
  const h = harness(['C:\\ws'])
  const agent = agentAt('C:\\ws', 'a1', 's1')
  h.services.set(DIALECT_SERVICE, dialectServiceFor(new WeakSet([agent])))
  await h.run({ name: 'Bash', arguments: { command: 'Set-Content f.txt hi' }, agent })
  await h.run({ name: 'Write', arguments: { file_path: 'C:\\elsewhere\\a.ts' }, agent })
  assert.deepEqual(h.violations().map(record => [record.rule, record.tool, record.scope]), [['file-tools-only', 'Bash', 'dialect'], ['workspace-containment', 'Write', 'dialect']])
  assert.equal(h.violations()[0].correction.split('\n')[2], RIGHT_PATH_ZCODE)
})

test('without a dialect service a GLM Write and Bash are judged the same (static alias table), corrected in native names', async () => {
  const h = harness(['C:\\ws'])
  const agent = agentAt('C:\\ws', 'a1', 's1')
  await h.run({ name: 'Write', arguments: { file_path: 'C:\\elsewhere\\a.ts' }, agent })
  await h.run({ name: 'Bash', arguments: { command: 'Set-Content f.txt hi' }, agent })
  await h.run({ name: 'Edit', arguments: { file_path: 'C:\\ws\\a.ts' }, agent })
  assert.deepEqual(h.decisions.map(decision => decision.kind), ['deny', 'deny', 'allow'])
  assert.deepEqual(h.violations().map(record => [record.rule, record.tool]), [['workspace-containment', 'Write'], ['file-tools-only', 'Bash']])
  assert.equal(h.violations()[1].correction.split('\n')[2], RIGHT_PATH_NATIVE)
  // An agent the dialect did not install on is not claimed either: native names.
  h.services.set(DIALECT_SERVICE, dialectServiceFor(new WeakSet()))
  await h.run({ name: 'Bash', arguments: { command: 'Out-File f.txt' }, agent })
  assert.equal(h.violations()[2].correction.split('\n')[2], RIGHT_PATH_NATIVE)
})

test('a malformed dialect service counts as absent: still denied, warned once, and the guard health says so', async () => {
  const warnings: string[] = []
  const warn = console.warn
  console.warn = (message: string) => { warnings.push(message) }
  try {
    const h = harness(['C:\\ws'])
    h.services.set(DIALECT_SERVICE, { claims: () => true })
    const agent = agentAt('C:\\ws', 'a1', 's1')
    await h.run({ name: 'Bash', arguments: { command: 'Set-Content f.txt hi' }, agent })
    await h.run({ name: 'Bash', arguments: { command: 'Out-File f.txt' }, agent })
    assert.deepEqual(h.decisions.map(decision => decision.kind), ['deny', 'deny'])
    assert.equal(h.violations()[0].correction.split('\n')[2], RIGHT_PATH_NATIVE)
    assert.equal(warnings.filter(message => message.includes(DIALECT_SERVICE)).length, 1)
  }
  finally {
    console.warn = warn
  }
  assert.deepEqual(guardHealth(['C:\\ws'], 'C:/ws/.llm', false, true), ['degraded', '门禁生效（file-tools-only，圈禁根 C:\\ws）；方言服务不可用：工具名按静态别名表换算，纠偏用原生名；影子兜底未启用（组合里没有 workspace-changes）'])
})

// Declaration (docs/ORCHESTRATION.md §6.1): every route's system prompt carries the active rules.

test('every request carries the rule declarations as the last system prompt section: the dialect\'s names on GLM, native names elsewhere', async () => {
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
  assert.ok(section.text.split('\n').includes(`- ${FILE_TOOLS_LINE_ZCODE}`), 'the dialect claims the agent: the line is word for word as before')
  assert.equal(glm.sections.filter(entry => entry.name === DECLARATION_SECTION).length, 1)
  assert.equal(glm.sections[0]!.name, 'glm:cli-prefix') // the dialect rewrite still leads
  const plain = await rt.assemble({ provider: 'deepseek', model: 'deepseek-flash' })
  const plainSection = plain.sections.at(-1)!
  assert.equal(plainSection.name, DECLARATION_SECTION)
  assert.equal(plainSection.interpolate, false)
  assert.equal(plain.sections.filter(entry => entry.name === DECLARATION_SECTION).length, 1)
  // The same rules; only the file tools are named as the DeepSeek face has them.
  assert.equal(plainSection.text, section.text.replace('the dedicated Write/Edit tools', 'the dedicated write/edit tools'))
  assert.notEqual(plainSection.text, section.text)
})

test('without a session directory the declaration lists file-tools-only alone, as the gate enforces', async () => {
  const rt = fakeRuntime() // the fake agent's session has no cwd
  apply(rt.ctx as never, { home: 'C:/ws/.llm', fs: memoryFs().fs })
  await rt.create()
  const section = (await rt.assemble({ model: 'glm-5.3' })).sections.at(-1)!
  assert.equal(section.name, DECLARATION_SECTION)
  assert.equal(section.text.split('\n').filter(line => line.startsWith('- ')).length, 1)
  assert.ok(!section.text.includes('inside the user\'s workspace'))
  // No dialect row: the GLM request sees the native tools, and the declaration names them.
  assert.ok(section.text.includes('\n- Modify files and code only with the dedicated write/edit tools.'))
})

test('with the graph row active the GLM declaration also lists graph-files-only, last; it leaves with the row', async () => {
  const rt = fakeRuntime()
  apply(rt.ctx as never, { workspaceRoots: ['C:\\ws'], home: 'C:/ws/.llm', fs: memoryFs().fs })
  await rt.create()
  const before = (await rt.assemble({ provider: 'glm-zcode', model: 'glm-5.3' })).sections.at(-1)!
  assert.ok(!before.text.includes(GRAPH_FILES_DECLARATION))
  const withdraw = rt.ctx.provide(GRAPH_SERVICE, { dirFor: () => undefined, isGraphTool: () => false })
  const rules = (await rt.assemble({ provider: 'glm-zcode', model: 'glm-5.3' })).sections.at(-1)!.text.split('\n').filter(line => line.startsWith('- '))
  assert.deepEqual(rules.at(-1), `- ${GRAPH_FILES_DECLARATION}`)
  assert.equal(rules.length, 3)
  withdraw()
  assert.ok(!(await rt.assemble({ provider: 'glm-zcode', model: 'glm-5.3' })).sections.at(-1)!.text.includes(GRAPH_FILES_DECLARATION))
})
