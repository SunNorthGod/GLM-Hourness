import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, type GuardContext, type PreExecuteDecision, type PreExecutePayload, type ViolationRecord } from '../src/guard/index.ts'

function harness(roots: readonly string[]): { decisions: PreExecuteDecision[]; violations: ViolationRecord[]; run: (payload: PreExecutePayload) => Promise<void> } {
  const decisions: PreExecuteDecision[] = []
  const violations: ViolationRecord[] = []
  const ctx: GuardContext = {
    on: (_event, listener) => {
      run = payload => listener(payload, async () => ({ kind: 'allow' })).then(decision => { decisions.push(decision) })
      return () => {}
    },
  }
  let run: (payload: PreExecutePayload) => Promise<void> = () => Promise.resolve()
  apply(ctx, { workspaceRoots: roots, onViolation: record => violations.push(record) })
  return { decisions, violations, run }
}

const decisionOf = (h: { decisions: PreExecuteDecision[] }) => h.decisions[0]

test('out-of-workspace write is denied and audited with rule id and correction', async () => {
  const h = harness(['C:\\ws'])
  await h.run({ name: 'Write', arguments: { file_path: 'C:\\Windows\\x.dll' }, agentId: 'a1', sessionId: 's1' })
  assert.equal(decisionOf(h)!.kind, 'deny')
  assert.equal(h.violations.length, 1)
  const record = h.violations[0]!
  assert.equal(record.rule, 'workspace-containment')
  assert.equal(record.tool, 'Write')
  assert.equal(record.agentId, 'a1')
  assert.ok(record.correction.includes('Right path:'))
  assert.ok(!Number.isNaN(Date.parse(record.at)))
})

test('shell write inside the workspace is still denied by file-tools-only', async () => {
  const h = harness(['C:\\ws'])
  await h.run({ name: 'Bash', arguments: { command: 'echo hi > C:/ws/out.txt' } })
  assert.equal(h.violations[0]!.rule, 'file-tools-only')
})

test('allowed calls are neither denied nor audited', async () => {
  const h = harness(['C:\\ws'])
  await h.run({ name: 'Read', arguments: { file_path: 'C:\\ws\\a.ts' } })
  assert.equal(decisionOf(h)!.kind, 'allow')
  assert.equal(h.violations.length, 0)
})

test('terminal_send write commands are denied like shell writes', async () => {
  const h = harness(['C:\\ws'])
  await h.run({ name: 'terminal_send', arguments: { command: 'Set-Content f.txt hi' } })
  assert.equal(h.violations[0]!.rule, 'file-tools-only')
})

test('roots default to the calling agent session directory', async () => {
  const decisions: PreExecuteDecision[] = []
  let run: (payload: PreExecutePayload) => Promise<void> = () => Promise.resolve()
  const ctx: GuardContext = {
    on: (_event, listener) => {
      run = payload => listener(payload, async () => ({ kind: 'allow' })).then(decision => { decisions.push(decision) })
      return () => {}
    },
  }
  apply(ctx, {})
  await run({ name: 'Write', arguments: { file_path: 'C:\\ws\\src\\a.ts' }, agent: { session: { header: { cwd: 'C:\\ws' } } } })
  assert.equal(decisions[0]!.kind, 'allow') // inside the agent session directory
  await run({ name: 'Write', arguments: { file_path: 'C:\\elsewhere\\a.ts' }, agent: { session: { header: { cwd: 'C:\\ws' } } } })
  assert.equal(decisions[1]!.kind, 'deny') // outside it
})

test('a call without config or agent directory keeps file-tools-only but skips containment', async () => {
  const decisions: PreExecuteDecision[] = []
  let run: (payload: PreExecutePayload) => Promise<void> = () => Promise.resolve()
  const ctx: GuardContext = {
    on: (_event, listener) => {
      run = payload => listener(payload, async () => ({ kind: 'allow' })).then(decision => { decisions.push(decision) })
      return () => {}
    },
  }
  apply(ctx, {})
  await run({ name: 'Write', arguments: { file_path: 'C:\\anywhere\\a.ts' } })
  assert.equal(decisions[0]!.kind, 'allow') // no provable root: containment cannot judge
  await run({ name: 'Bash', arguments: { command: 'echo x > a.txt' } })
  assert.equal(decisions[1]!.kind, 'deny') // the shell-write rule does not need a root
})
