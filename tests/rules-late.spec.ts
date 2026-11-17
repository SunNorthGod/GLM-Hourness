/**
 * The late verdicts of gating scripts (src/rules/late.ts; docs/ORCHESTRATION.md
 * §16.16; design §6.7 「超时之后」, §6.4): an exit of 2 that lands after the
 * call ran is a journal line with `mode: 'late'` and the main agent told on
 * the spot; a run ended at the cap is told the same way as not finished; any
 * other later end, and every late word of a call that did not run, is only a
 * `rules.late-verdict` event; an agent that cannot be reached leaves the words
 * in the board's `notices`. A late block or a capped run degrades the row's
 * health once. The recipient is the root of the calling session's dispatch
 * chain.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import type { UserNotice } from '../src/shared/dsh-min.ts'
import type { RowHealth } from '../src/shared/health.ts'
import { METRICS_SERVICE, type EmittedEvent } from '../src/shared/metrics.ts'
import type { LateScriptResult } from '../src/loops/script.ts'
import { handleLateVerdicts, lateBlockText, scriptCappedText, type LateCall, type LateDeps, type LateScript } from '../src/rules/late.ts'
import { loadState } from '../src/rules/store.ts'
import { signatureOf } from '../src/rules/tickets.ts'
import { projectTest } from './rules-helpers.ts'

/** A live agent the fake registry hands out, with the notices it was put. */
interface FakeAgent {
  readonly id: string
  readonly status: 'idle' | 'running'
  readonly session: { readonly id: string, readonly header: { readonly cwd: string, readonly origin?: 'subagent', readonly parentSession?: string } }
  readonly told: Array<{ readonly how: string, readonly kind: string, readonly text: string }>
}

function harness() {
  const agents = new Map<string, FakeAgent>()
  const metrics: EmittedEvent[] = []
  const records: Array<Record<string, unknown>> = []
  const health: Array<{ readonly sessionId: string | undefined, readonly state: string, readonly reason: string }> = []
  const deps: LateDeps = {
    ctx: {
      get: (name: string) => name === 'agents'
        ? { get: (id: string): unknown => agents.get(id) }
        : name === METRICS_SERVICE
          ? { emit: (event: EmittedEvent) => { metrics.push(event) } }
          : undefined,
    },
    rulesDir: 'docs/rules',
    now: () => Date.parse('2026-11-17T05:00:00.000Z'),
    journal: {
      violation: (record) => { records.push(record); return Promise.resolve() },
    },
    health: {
      report: (sessionId: string | undefined, state: string, reason: string) => { health.push({ sessionId, state, reason }) },
    } as unknown as RowHealth,
    warn: () => undefined,
  }
  const add = (agent: FakeAgent): void => { agents.set(agent.id, agent) }
  const told = (): Array<{ readonly agent: string, readonly how: string, readonly text: string }> => [...agents.values()].flatMap(agent => agent.told.map(entry => ({ agent: agent.id, how: entry.how, text: entry.text })))
  return { deps, metrics, records, health, add, told }
}

const liveAgent = (id: string, over: Partial<Pick<FakeAgent['session']['header'], 'origin' | 'parentSession'>> = {}): FakeAgent => {
  const told: FakeAgent['told'] = []
  return {
    id,
    status: 'idle',
    session: { id, header: { cwd: process.cwd(), origin: over.origin, parentSession: over.parentSession } },
    told,
    ...({ steer: (n: UserNotice) => { told.push({ how: 'steer', kind: String(n.source.kind), text: n.content.map(part => part.text).join('') }) } }),
    ...({ inject: (n: UserNotice) => { told.push({ how: 'inject', kind: String(n.source.kind), text: n.content.map(part => part.text).join('') }) } }),
    ...({ followup: (n: UserNotice) => { told.push({ how: 'followup', kind: String(n.source.kind), text: n.content.map(part => part.text).join('') }) } }),
  } as unknown as FakeAgent
}

const call = (root: string, over: Partial<LateCall> = {}): LateCall => ({
  root,
  cwd: root,
  at: '2026-11-17T04:59:50.000Z',
  tool: 'pwsh',
  args: { command: 'npm run deploy' },
  described: { command: 'npm run deploy', attempt: 'You tried to run "npm run deploy".' },
  sessionId: 'agent-1',
  agentId: 'agent-1',
  origin: undefined,
  ran: true,
  ...over,
})

const script = (result: LateScriptResult, over: Partial<LateScript> = {}): LateScript => ({
  rule: 'r-late',
  outcome: { rule: 'r-late', file: 'docs/rules/scripts/r-late.mjs', outcome: 'timeout', ms: 200, late: Promise.resolve(result) },
  sha256: 'a'.repeat(64),
  timeoutSeconds: 1,
  signals: { 'glm-peak': false },
  ...over,
})

const lateVerdicts = (metrics: EmittedEvent[]): EmittedEvent[] => metrics.filter(event => event.k === 'rules.late-verdict')

projectTest('a late exit 2 of a call that ran: the journal has mode late with the script, the main agent is told on the spot, the metric says told', async (project) => {
  const parts = harness()
  parts.add(liveAgent('agent-1'))
  await handleLateVerdicts(parts.deps, call(project.root), [script({ kind: 'exited', exitCode: 2, stdout: '', stderr: 'staging is read-only', durationMs: 1_400, truncated: false })])
  assert.equal(parts.records.length, 1, 'one journal line')
  const record = parts.records[0]
  assert.deepEqual(
    [record.rule, record.mode, record.effect, record.tool, record.agentId, record.sessionId, record.signals],
    ['rules:r-late', 'late', 'block', 'pwsh', 'agent-1', 'agent-1', { 'glm-peak': false }],
  )
  assert.deepEqual(record.script, { path: 'docs/rules/scripts/r-late.mjs', sha256: 'a'.repeat(64), outcome: 'exited', ms: 1_400 })
  assert.equal(record.correction, 'staging is read-only')
  const told = parts.told()
  assert.equal(told.length, 1, 'the words went to the agent')
  assert.match(told[0].text, /^\[rules board\] Late block: rule r-late's script docs\/rules\/scripts\/r-late\.mjs did not answer within 1 s on pwsh "npm run deploy" \(the main agent, \d\d:\d\d\), so the call was allowed by the rule's timeout setting\. The script finished at \d\d:\d\d and would have blocked it: "staging is read-only"\. Check what the call did; fix or revert it, and tell the human\.$/)
  const events = lateVerdicts(parts.metrics)
  assert.equal(events.length, 1, 'one late-verdict event')
  assert.deepEqual(events[0].body, { rule: 'r-late', sig: signatureOf('pwsh', { command: 'npm run deploy' }), result: 'exited', afterMs: 400, told: true })
  assert.equal(parts.health.length, 1, 'the row degraded once')
  assert.equal(parts.health[0].state, 'degraded')
})

projectTest('the main agent not on this host: the words wait as a notice in the board, the metric says not told', async (project) => {
  const parts = harness()
  await handleLateVerdicts(parts.deps, call(project.root), [script({ kind: 'exited', exitCode: 2, stdout: '', stderr: 'the word', durationMs: 1_100, truncated: false })])
  assert.equal(parts.told().length, 0, 'nobody to tell here')
  const { state } = loadState({ ...(project.board as unknown as { paths: import('../src/rules/store.ts').RulesPaths }).paths })
  const notices = Object.values(state.notices ?? {})
  assert.equal(notices.length, 1, 'the notice waits in the board')
  assert.deepEqual([notices[0]?.kind, notices[0]?.rule], ['late-block', 'r-late'])
  assert.match(notices[0]?.text ?? '', /^\[rules board\] Late block: rule r-late's script/)
  assert.deepEqual(lateVerdicts(parts.metrics)[0]?.body, { rule: 'r-late', sig: signatureOf('pwsh', { command: 'npm run deploy' }), result: 'exited', afterMs: 100, told: false })
  assert.equal(parts.health.length, 1, 'degraded once, delivered or not')
})

projectTest('a run ended at the cap: script-capped words, a capped metric, the same telling', async (project) => {
  const parts = harness()
  parts.add(liveAgent('agent-1'))
  await handleLateVerdicts(parts.deps, call(project.root), [script({ kind: 'capped', durationMs: 610_000 })])
  assert.equal(parts.records.length, 0, 'no journal line: it did not say block')
  const told = parts.told()
  assert.equal(told.length, 1)
  assert.match(told[0].text, /^\[rules board\] Rule r-late's script did not finish within 10 minutes on pwsh "npm run deploy" \(the main agent, \d\d:\d\d\) and was stopped; the call had been allowed by the rule's timeout setting\. If this keeps happening, tell the human the script needs fixing\.$/)
  assert.deepEqual(lateVerdicts(parts.metrics)[0]?.body, { rule: 'r-late', sig: signatureOf('pwsh', { command: 'npm run deploy' }), result: 'capped', afterMs: 609_000, told: true })
  assert.equal(parts.health.length, 1)
})

projectTest('a late exit 0, another exit code, or a crash is only a metric: no line, no words', async (project) => {
  for (const result of [
    { kind: 'exited', exitCode: 0, stdout: '', stderr: '', durationMs: 1_100, truncated: false },
    { kind: 'exited', exitCode: 3, stdout: '', stderr: 'wait', durationMs: 1_100, truncated: false },
    { kind: 'crashed', reason: 'signal', message: 'gone', durationMs: 1_100 },
  ] as LateScriptResult[]) {
    const parts = harness()
    parts.add(liveAgent('agent-1'))
    await handleLateVerdicts(parts.deps, call(project.root), [script(result)])
    assert.equal(parts.records.length, 0, 'no journal line')
    assert.equal(parts.told().length, 0, 'no message')
    assert.equal(parts.health.length, 0, 'no degradation')
    assert.deepEqual(lateVerdicts(parts.metrics)[0]?.body, { rule: 'r-late', sig: signatureOf('pwsh', { command: 'npm run deploy' }), result: result.kind, afterMs: 100, told: false })
  }
})

projectTest('a call that did not run (the verdict was a block or a deferral): every late word is only a metric', async (project) => {
  const parts = harness()
  parts.add(liveAgent('agent-1'))
  await handleLateVerdicts(parts.deps, call(project.root, { ran: false }), [script({ kind: 'exited', exitCode: 2, stdout: '', stderr: 'would have blocked', durationMs: 1_100, truncated: false })])
  assert.equal(parts.records.length, 0, 'no journal line')
  assert.equal(parts.told().length, 0, 'no message')
  assert.equal(parts.health.length, 0, 'no degradation')
  assert.deepEqual(lateVerdicts(parts.metrics)[0]?.body, { rule: 'r-late', sig: signatureOf('pwsh', { command: 'npm run deploy' }), result: 'exited', afterMs: 100, told: false })
})

projectTest("a subagent's late block goes to the root of its dispatch chain", async (project) => {
  const parts = harness()
  parts.add(liveAgent('agent-root'))
  parts.add(liveAgent('agent-mid', { origin: 'subagent', parentSession: 'agent-root' }))
  parts.add(liveAgent('agent-child', { origin: 'subagent', parentSession: 'agent-mid' }))
  await handleLateVerdicts(parts.deps, call(project.root, { sessionId: 'agent-child', agentId: 'agent-child', origin: 'subagent', parentSession: 'agent-mid' }), [script({ kind: 'exited', exitCode: 2, stdout: '', stderr: 'the reason', durationMs: 1_100, truncated: false })])
  const told = parts.told()
  assert.deepEqual(told.map(word => word.agent), ['agent-root'], 'the root gets the words')
  assert.match(told[0].text, /\(subagent "agent-child", \d\d:\d\d\)/)
})

test('the two texts the design spells (§6.4) come from the handler\'s builders', () => {
  const words = lateBlockText(call('/p'), script({ kind: 'exited', exitCode: 2, stdout: '', stderr: '', durationMs: 1_000, truncated: false }), 'the reason', '2026-11-17T05:01:00.000Z')
  assert.match(words, /The script finished at \d\d:\d\d and would have blocked it: "the reason"\./)
  const capped = scriptCappedText(call('/p'), script({ kind: 'capped', durationMs: 600_000 }))
  assert.match(capped, /^\[rules board\] Rule r-late's script did not finish within 10 minutes/)
})
