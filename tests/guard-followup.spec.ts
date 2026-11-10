/**
 * The follow-up recorder (src/guard/followup.ts, m4-gate G2, design §3.3):
 * every denial leaves the agent's next model-issued call to settle it — the
 * rule's right path, a verbatim retry, something else, or no next call when
 * the turn or the session ended first. A `DeferredToolCall` wrapper settles
 * by the target it unwraps to and marks both ids settled; a call in the same
 * turn and step as the denial does not settle; a call without a `tool/call`
 * event never settles. The gate settles through its journal, so the record
 * lands in the violation journal like a denial, the metric follows it
 * (design §3.11), and the outermost gate settles whichever row refuses next.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { unwrapDeferredCall } from '../src/shared/deferred-call.ts'
import { followupOf, hookJournal, noteDenial, observe, type PendingDenial } from '../src/guard/followup.ts'
import { installRuleGate, type RuleGateOptions } from '../src/guard/gate.ts'
import { METRICS_SERVICE, type MetricsService, type QueuedEvent } from '../src/shared/metrics.ts'
import { metricEventOf } from '../src/guard/metrics.ts'
import { keyOf, type FollowupRecord, type GuardRecord } from '../src/guard/records.ts'
import { provideRowHealth, type RowHealth } from '../src/shared/health.ts'
import { NATIVE_FACE, fileToolsOnly, type Correction, type GuardRule, type ToolCall } from '../src/guard/rules.ts'
import { graphFilesOnly } from '../src/guard/graph-files.ts'
import type { AgentLike } from '../src/shared/dsh-min.ts'
import { fakeRuntime } from './fake-rc3.ts'

const CORRECTION = (text: string): Correction => ({ fact: text, violation: 'no', rightPath: 'yes', exception: 'none' })

/** Denies the calls `denyFor` names, optionally with a right path for the settlement to look for. */
const denyRule = (id: string, denyFor: (call: ToolCall) => boolean = call => call.name === 'write', rightPath?: GuardRule['rightPath']): GuardRule => ({
  id,
  detect: call => denyFor(call) ? { kind: 'deny', rule: id, correction: CORRECTION(`${id} says no to ${call.name}`) } : { kind: 'allow' },
  ...(rightPath === undefined ? {} : { rightPath }),
})

/** An in-memory violations journal: the lines in order. */
function memoryJournal() {
  const lines: GuardRecord[] = []
  return { lines, journal: (record: GuardRecord): Promise<'written'> => { lines.push(record); return Promise.resolve('written') } }
}

let counter = 0

/** A runtime with one gate installed over the memory journal, an agent whose session is unique to this harness, and the metrics sink. */
function harness(rules: readonly GuardRule[], options: { prepend?: boolean, journalFails?: boolean, health?: RowHealth } = {}) {
  const rt = fakeRuntime()
  const { lines, journal } = memoryJournal()
  const events: Array<{ event: QueuedEvent, sessionId: string | undefined, dir: string | undefined }> = []
  const metrics: MetricsService = {
    emit: (event, where) => { events.push({ event, sessionId: where.sessionId, dir: where.dir }) },
  }
  const id = `agent-${++counter}`
  const agent: AgentLike = { id, ctx: rt.ctx, session: { id, header: { id }, deriveMessages: () => [], requestHeader: () => ({ config: { provider: 'glm-zcode', model: 'glm-5.3' } }) } }
  const gateOptions: RuleGateOptions = {
    row: 'guard',
    prepend: options.prepend ?? false,
    rules: () => ({ rules, face: NATIVE_FACE, origin: { scope: 'dialect' } }),
    // The row's journal choke point rides the metric on every write (§3.11); the same ride, over the memory journal.
    journal: options.journalFails === true
      ? () => Promise.resolve('failed' as const)
      : (record: GuardRecord) => {
        const event = metricEventOf(record)
        if (event !== undefined) {
          const sessionId = 'sessionId' in record && typeof record.sessionId === 'string' ? record.sessionId : undefined
          metrics.emit(event, { ...(sessionId === undefined ? {} : { sessionId }) })
        }
        return journal(record)
      },
    ...(options.health === undefined ? {} : { health: options.health }),
  }
  installRuleGate(rt.ctx as never, gateOptions)
  rt.ctx.provide(METRICS_SERVICE, metrics)
  // Each call is the model's next step, as the agent loop advances the turn's step counter (N16 compares
  // steps); the call ids are unique per harness, since the recorder's settled ring is module-wide.
  let callNo = 0
  const exec = (name: string, args: unknown, sameStep = false): Promise<unknown> => {
    if (!sameStep) rt.progress.step += 1
    return rt.ctx.tools.execute({ callId: `${id}-call-${++callNo}`, name, arguments: args, agent, signal: new AbortController().signal })
  }
  const followups = (): FollowupRecord[] => lines.filter((record): record is FollowupRecord => 'kind' in record && record.kind === 'followup')
  const denials = (): GuardRecord[] => lines.filter(record => !('kind' in record))
  return { rt, agent, exec, lines, followups, denials, events }
}

const WRITE = { file_path: 'C:\\elsewhere\\a.ts', content: 'x' }
const READ = { file_path: 'C:\\ws\\a.ts' }

// --------------------------------------------------------------- pure pieces

test('unwrapDeferredCall: the target of a wrapper, and the shapes that are not one', () => {
  assert.deepEqual(unwrapDeferredCall('DeferredToolCall', { name: 'request_exception', input: { ref: 'r-1' } }), { name: 'request_exception', arguments: { ref: 'r-1' } })
  assert.equal(unwrapDeferredCall('write', { file_path: 'x' }), undefined, 'another tool is never a wrapper')
  assert.equal(unwrapDeferredCall('DeferredToolCall', { name: 'request_exception' }), undefined, 'missing input')
  assert.equal(unwrapDeferredCall('DeferredToolCall', { input: {} }), undefined, 'missing name')
  assert.equal(unwrapDeferredCall('DeferredToolCall', { name: 'request_exception', input: {}, extra: 1 }), undefined, 'an extra field is not the schema')
  assert.equal(unwrapDeferredCall('DeferredToolCall', { name: '', input: {} }), undefined, 'an empty name is not a name')
  assert.equal(unwrapDeferredCall('DeferredToolCall', { name: 'request_exception', input: 'no' }), undefined, 'input must be an object')
  assert.equal(unwrapDeferredCall('DeferredToolCall', 'no'), undefined)
})

test('followupOf: a verbatim retry, the rule\'s right path, and everything else', () => {
  const denied: ToolCall = { name: 'write', arguments: { file_path: 'C:\\x', content: 'a' } }
  assert.equal(followupOf(denied, denied), 'repeat')
  assert.equal(followupOf(denied, { name: 'write', arguments: { content: 'a', file_path: 'C:\\x' } }), 'repeat', 'the arguments compare by their keys, not their spelling order')
  assert.equal(followupOf(denied, { name: 'write', arguments: { file_path: 'C:\\x', content: 'b' } }), 'other', 'different arguments are not a retry')
  const rightPath = (next: ToolCall): boolean => next.name === 'read'
  assert.equal(followupOf(denied, { name: 'read', arguments: { file_path: 'C:\\x' } }, rightPath), 'right-path')
  assert.equal(followupOf(denied, { name: 'grep', arguments: {} }, rightPath), 'other')
  assert.equal(followupOf(denied, denied, rightPath), 'repeat', 'the verbatim retry is decided before the right path (design §3.3)')
})

// ------------------------------------------------------- through the gate

test('a denial settles on the agent\'s next model-issued call, exactly once', async () => {
  const h = harness([denyRule('one')])
  await h.exec('write', WRITE)
  await h.exec('read', READ)
  const records = h.followups()
  assert.equal(records.length, 1)
  const record = records[0]
  assert.deepEqual([record.rule, record.tool, record.agentId, record.sessionId, record.scope, record.outcome], ['one', 'read', h.agent.id, h.agent.id, 'dialect', 'other'])
  assert.equal(record.denial, keyOf(h.denials()[0] as unknown as object), 'the record cites the denial\'s journal key')
  await h.exec('read', { file_path: 'C:\\ws\\b.ts' })
  assert.equal(h.followups().length, 1, 'the settled denial does not settle again')
})

test('a verbatim retry of the denied call records repeat', async () => {
  const h = harness([denyRule('one')])
  await h.exec('write', WRITE)
  await h.exec('write', WRITE)
  assert.deepEqual(h.followups().map(record => record.outcome), ['repeat'])
  assert.equal(h.followups()[0].tool, 'write')
})

test('a call in the same turn and step as the denial does not settle; the next step\'s first call does', async () => {
  const h = harness([denyRule('one')])
  await h.exec('write', WRITE)
  await h.exec('read', READ, true) // issued in the same step: the model had not read the denial
  assert.deepEqual(h.followups(), [])
  await h.exec('read', { file_path: 'C:\\ws\\b.ts' })
  assert.deepEqual(h.followups().map(record => record.outcome), ['other'])
})

test('a turn that ends with no next call records none, and a later call settles nothing', async () => {
  const h = harness([denyRule('one')])
  await h.exec('write', WRITE)
  h.rt.sessionEvent(h.agent.session!, 'turn/end', { turn: h.rt.progress.turn, reason: 'stop' })
  assert.deepEqual(h.followups().map(record => record.outcome), ['none'])
  assert.equal(h.followups()[0].tool, 'write', 'a none record names the denied call\'s tool')
  await h.exec('read', READ)
  assert.equal(h.followups().length, 1, 'the settled denial is gone')
})

test('a disposed session records none and stops tracking the session', async () => {
  const h = harness([denyRule('one')])
  await h.exec('write', WRITE)
  h.rt.disposeSession(h.agent.session!)
  assert.deepEqual(h.followups().map(record => record.outcome), ['none'])
  await h.exec('read', READ)
  assert.equal(h.followups().length, 1)
})

test('a call the loop did not log never settles: only model-issued calls count', () => {
  const rt = fakeRuntime()
  const { lines } = memoryJournal()
  installRuleGate(rt.ctx as never, {
    row: 'guard',
    prepend: false,
    rules: () => ({ rules: [denyRule('one')], face: NATIVE_FACE, origin: { scope: 'dialect' } }),
    journal: (record: GuardRecord) => { lines.push(record); return Promise.resolve('written' as const) },
  })
  const agent = rt.agent
  // A denial of a call the loop did not log (a plugin issued it): noted without a turn or step, and no
  // call settles it — a call without a tool/call event is not model-issued, so the turn's end does.
  hookJournal(agent.session!.id, record => { lines.push(record) })
  const denial: PendingDenial = { rule: 'one', call: { name: 'write', arguments: {} }, key: 'k', origin: { scope: 'dialect' } }
  noteDenial(agent, 'call-x', denial)
  observe(agent, { name: 'read', arguments: {} }, 'call-y')
  assert.deepEqual(lines, [])
  rt.sessionEvent(agent.session!, 'turn/end', { turn: 1 })
  assert.equal(lines.length, 1)
  assert.equal((lines[0] as FollowupRecord).outcome, 'none')
})

test('a DeferredToolCall wrapper settles by the target it unwraps to, once, and a wrapped retry records repeat', async () => {
  const h = harness([denyRule('one')])
  // The model called the wrapper in turn 2, step 5; its target runs as call-w:deferred and is denied.
  h.rt.sessionEvent(h.agent.session!, 'tool/call', { turn: 2, step: 5, callId: 'call-w', name: 'DeferredToolCall', arguments: { name: 'write', input: WRITE } })
  h.rt.progress.turn = 2
  h.rt.progress.step = 5
  await h.rt.ctx.tools.execute({ callId: 'call-w:deferred', name: 'write', arguments: WRITE, agent: h.agent, signal: new AbortController().signal })
  assert.equal(h.denials().length, 1, 'the inner call is denied and journaled')
  assert.deepEqual(h.followups(), [], 'nothing settles before the model\'s next call')
  // The model's next call is the same target through the wrapper, one step later: the wrapper settles, the target never does.
  await h.exec('DeferredToolCall', { name: 'write', input: WRITE })
  assert.deepEqual(h.followups().map(record => record.outcome), ['repeat'])
  assert.equal(h.followups()[0].tool, 'write', 'the record names the unwrapped target')
  assert.equal(h.followups()[0].denial, keyOf(h.denials()[0] as unknown as object))
})

test('a wrapped call on the rule\'s right path settles right-path', async () => {
  const h = harness([denyRule('one', call => call.name === 'write', next => next.name === 'read')])
  h.rt.sessionEvent(h.agent.session!, 'tool/call', { turn: 1, step: 1, callId: 'call-d', name: 'DeferredToolCall', arguments: { name: 'write', input: WRITE } })
  await h.rt.ctx.tools.execute({ callId: 'call-d:deferred', name: 'write', arguments: WRITE, agent: h.agent, signal: new AbortController().signal })
  await h.exec('DeferredToolCall', { name: 'read', input: READ })
  assert.deepEqual(h.followups().map(record => record.outcome), ['right-path'])
})

test('the shipped rules carry the design\'s right paths: a file-tool write after a shell denial, a graph write tool after a graph denial (design §3.3)', async () => {
  const h = harness([fileToolsOnly])
  await h.exec('pwsh', { command: `Set-Content -Path 'C:\\elsewhere\\a.ts' -Value x` })
  await h.exec('write', WRITE)
  assert.deepEqual(h.followups().map(record => record.outcome), ['right-path'])
  const g = harness([graphFilesOnly('C:\\proj\\docs\\graph', 'C:\\ws')])
  await g.exec('write', { file_path: 'C:\\proj\\docs\\graph\\nodes\\n.json', content: '{}' })
  await g.exec('graph_show', { id: 'n' })
  assert.deepEqual(g.followups().map(record => record.outcome), ['other'], 'a graph read is not the right path')
  await g.exec('write', { file_path: 'C:\\proj\\docs\\graph\\nodes\\n.json', content: '{}' })
  await g.exec('graph_edit', { id: 'n', set: { title: 't' } })
  assert.deepEqual(g.followups().map(record => record.outcome), ['other', 'right-path'])
})

test('the outermost gate settles the follow-up, and an inner gate\'s observe of the same call does nothing (F5)', async () => {
  const rt = fakeRuntime()
  // Both gates write the same project journal, as rows of one composition do.
  const shared = memoryJournal()
  const id = `agent-${++counter}`
  const agent: AgentLike = { id, ctx: rt.ctx, session: { id, header: { id }, deriveMessages: () => [], requestHeader: () => undefined } }
  installRuleGate(rt.ctx as never, {
    row: 'outer',
    prepend: true,
    rules: () => ({ rules: [denyRule('outer-write', call => call.name === 'write')], face: NATIVE_FACE, origin: { scope: 'dialect' } }),
    journal: shared.journal,
  })
  installRuleGate(rt.ctx as never, {
    row: 'inner',
    prepend: false,
    rules: () => ({ rules: [denyRule('inner-edit', call => call.name === 'edit')], face: NATIVE_FACE, origin: { scope: 'dialect' } }),
    journal: shared.journal,
  })
  let callNo = 0
  const exec = (name: string, args: unknown): Promise<unknown> => {
    rt.progress.step += 1
    return rt.ctx.tools.execute({ callId: `cross-${id}-call-${++callNo}`, name, arguments: args, agent, signal: new AbortController().signal })
  }
  await exec('edit', { file_path: 'C:\\x' }) // the inner gate denies; the outer let it through to there
  assert.deepEqual(shared.lines.map(record => 'kind' in record ? record.kind : record.rule), ['inner-edit'])
  await exec('read', READ) // denied by neither; the outer gate's observe settles, the inner's does nothing
  const settled = shared.lines.filter((record): record is FollowupRecord => 'kind' in record && record.kind === 'followup')
  assert.deepEqual(settled.map(record => record.outcome), ['other'])
  assert.deepEqual(settled.map(record => record.rule), ['inner-edit'], 'exactly one follow-up record for the denial the model answered')
})

test('the metric follows the denial and the follow-up, with the outcome and the origin (design §3.11)', async () => {
  const h = harness([denyRule('one')])
  await h.exec('write', WRITE)
  await h.exec('read', READ)
  const denial = h.denials()[0]
  assert.ok(denial !== undefined)
  assert.deepEqual(h.events.map(entry => [entry.event.k, (entry.event.body as { rule?: string, outcome?: string }).rule, (entry.event.body as { outcome?: string }).outcome]), [['rule', 'one', undefined], ['followup', 'one', 'other']])
  assert.equal((h.events[0]?.event.body as { effect?: string }).effect, 'deny')
  assert.equal((h.events[0]?.event.body as { ref?: string }).ref, keyOf(denial), 'the rule event names the denial line it came from')
  assert.equal((h.events[1]?.event.body as { denial?: string }).denial, keyOf(denial))
  assert.equal(h.events[0]?.sessionId, h.agent.id)
})

test('a follow-up the journal could not write counts against the session like a lost record', async () => {
  const health = provideRowHealth({ get: () => undefined } as never, 'guard', 'active', 'loaded')
  const h = harness([denyRule('one')], { journalFails: true, health })
  await h.exec('write', WRITE)
  await h.exec('read', READ)
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(health.session(h.agent.id)?.reason.includes('2 条违规没有落盘'), health.session(h.agent.id)?.reason)
})
