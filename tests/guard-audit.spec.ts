import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, type ViolationRecord } from '../src/guard/index.ts'
import type { AgentLike, PreExecuteDecision, PreExecuteHost, ServiceLookup, ToolExecutionPayload } from '../src/shared/dsh-min.ts'

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
    lines: (path: string) => (files.get(path) ?? '').split('\n').filter(line => line.length > 0).map(line => JSON.parse(line) as ViolationRecord),
  }
}

/** Let the fire-and-forget journal write settle. */
const settle = () => new Promise(resolve => setImmediate(resolve))

const VIOLATIONS = 'C:/ws/.llm/audit/violations.jsonl'

function harness(roots: readonly string[], options: { home?: string, service?: unknown } = { home: 'C:/ws/.llm' }): { decisions: PreExecuteDecision[]; violations: () => ViolationRecord[]; files: Map<string, string>; run: (payload: ToolExecutionPayload) => Promise<void> } {
  const decisions: PreExecuteDecision[] = []
  const store = memoryFs()
  const ctx: PreExecuteHost & ServiceLookup = {
    on: (_event, listener) => {
      run = payload => listener(payload, async () => ({ kind: 'allow' })).then(decision => { decisions.push(decision) }).then(settle)
      return () => {}
    },
    get: name => name === 'glmHournessData' ? options.service : undefined,
  }
  let run: (payload: ToolExecutionPayload) => Promise<void> = () => Promise.resolve()
  apply(ctx, { workspaceRoots: roots, fs: store.fs, ...(options.home === undefined ? {} : { home: options.home }) })
  return { decisions, violations: () => store.lines(VIOLATIONS), files: store.files, run }
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
})

test('allowed calls are neither denied nor audited', async () => {
  const h = harness(['C:\\ws'])
  await h.run({ name: 'Read', arguments: { file_path: 'C:\\ws\\a.ts' } })
  assert.equal(decisionOf(h)!.kind, 'allow')
  assert.equal(h.violations().length, 0)
})

test('terminal_send write commands are denied like shell writes', async () => {
  const h = harness(['C:\\ws'])
  await h.run({ name: 'terminal_send', arguments: { command: 'Set-Content f.txt hi' } })
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
  const decisions: PreExecuteDecision[] = []
  let run: (payload: ToolExecutionPayload) => Promise<void> = () => Promise.resolve()
  const ctx: PreExecuteHost = {
    on: (_event, listener) => {
      run = payload => listener(payload, async () => ({ kind: 'allow' })).then(decision => { decisions.push(decision) })
      return () => {}
    },
  }
  apply(ctx, { home: 'C:/ws/.llm', fs: memoryFs().fs }) // no containment roots configured
  await run({ name: 'Write', arguments: { file_path: 'C:\\ws\\src\\a.ts' }, agent: agentAt('C:\\ws') })
  assert.equal(decisions[0]!.kind, 'allow') // inside the agent session directory
  await run({ name: 'Write', arguments: { file_path: 'C:\\elsewhere\\a.ts' }, agent: agentAt('C:\\ws') })
  assert.equal(decisions[1]!.kind, 'deny') // outside it
})

test('a call without config or agent directory keeps file-tools-only but skips containment', async () => {
  const decisions: PreExecuteDecision[] = []
  let run: (payload: ToolExecutionPayload) => Promise<void> = () => Promise.resolve()
  const ctx: PreExecuteHost = {
    on: (_event, listener) => {
      run = payload => listener(payload, async () => ({ kind: 'allow' })).then(decision => { decisions.push(decision) })
      return () => {}
    },
  }
  apply(ctx, { home: 'C:/ws/.llm', fs: memoryFs().fs }) // no containment roots configured
  await run({ name: 'Write', arguments: { file_path: 'C:\\anywhere\\a.ts' } })
  assert.equal(decisions[0]!.kind, 'allow') // no provable root: containment cannot judge
  await run({ name: 'Bash', arguments: { command: 'echo x > a.txt' } })
  assert.equal(decisions[1]!.kind, 'deny') // the shell-write rule does not need a root
})
