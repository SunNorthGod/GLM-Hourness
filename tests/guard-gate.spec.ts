/**
 * The one installation function (src/guard/gate.ts, m4-gate G1): a row hands
 * it its rules and its journal, and every root call is judged once — every
 * denial a rule raises is kept (not only the first), each one is a line of
 * the journal, the first denial's correction is what the model reads, rules
 * a person lifted do not judge, a throwing detector fails open with the rule
 * named on the row health, and a journal write that failed counts against
 * the session instead of vanishing (design §3.1, §3.2, §3.5).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installRuleGate, isGateListener, type RuleGateOptions } from '../src/guard/gate.ts'
import { judge, NATIVE_FACE, renderCorrection, type Correction, type GuardRule, type ToolCall } from '../src/guard/rules.ts'
import type { ViolationRecord } from '../src/guard/records.ts'
import { provideRowHealth, sessionIdOf, type RowHealth } from '../src/shared/health.ts'
import type { PreExecuteDecision, ToolExecutionPayload } from '../src/shared/dsh-min.ts'

const CORRECTION = (text: string): Correction => ({ fact: text, violation: 'no', rightPath: 'yes', exception: 'none' })

const rule = (id: string, denyFor: (call: ToolCall) => boolean = call => call.name === 'write'): GuardRule => ({
  id,
  declare: id,
  detect(call) {
    if (denyFor(call)) return { kind: 'deny', rule: id, correction: CORRECTION(`${id} says no to ${call.name}`) }
    return { kind: 'allow' }
  },
})

const BROKEN: GuardRule = {
  id: 'broken-rule',
  declare: 'broken-rule',
  detect() { throw new Error('detector gone') },
}

/** An agent with a session, as rc.3 executions carry it. */
const agentAt = (id = 'a1', cwd?: string) => ({ id, ctx: {} as never, session: { id, header: { id, ...(cwd === undefined ? {} : { cwd }) }, deriveMessages: () => [], requestHeader: () => ({ config: { provider: 'glm-zcode', model: 'glm-5.3' } }) } })

/** An in-memory filesystem for the journal appender. */
function memoryFs(fail?: (path: string, data: string) => boolean) {
  const files = new Map<string, string>()
  return {
    files,
    fs: {
      mkdir: () => Promise.resolve(undefined),
      appendFile: (path: string, data: string) => {
        if (fail?.(path, data) === true) {
          const error = new Error('EACCES: permission denied') as NodeJS.ErrnoException
          error.code = 'EACCES'
          return Promise.reject(error)
        }
        files.set(path, (files.get(path) ?? '') + data)
        return Promise.resolve()
      },
    },
    lines: (path: string) => (files.get(path) ?? '').split('\n').filter(line => line.length > 0).map(line => JSON.parse(line) as Record<string, unknown>),
  }
}

type Listener = (payload: ToolExecutionPayload, next: () => Promise<PreExecuteDecision>) => Promise<PreExecuteDecision>

/** A host for installRuleGate: the pre-execute listener, the session observers, and the journal store. */
function harness(options: { fail?: (path: string, data: string) => boolean } = {}) {
  const store = memoryFs(options.fail)
  const listeners: Array<{ event: string, listener: Listener, prepend?: boolean }> = []
  const health: RowHealth = provideRowHealth({ get: () => undefined } as never, 'guard', 'active', 'loaded')
  const decisions: PreExecuteDecision[] = []
  let inner: PreExecuteDecision = { kind: 'allow' }
  const ctx = {
    on: (event: string, listener: never, opts?: { prepend?: boolean }) => {
      listeners.push({ event, listener: listener, ...(opts === undefined ? {} : { prepend: opts.prepend }) })
      return () => {}
    },
    get: () => undefined,
  }
  const journal: NonNullable<RuleGateOptions['journal']> = (record) => { void store.fs.appendFile('C:/ws/.llm/audit/violations.jsonl', `${JSON.stringify(record)}\n`) }
  const violations = (): ViolationRecord[] => store.lines('C:/ws/.llm/audit/violations.jsonl') as unknown as ViolationRecord[]
  const gateOf = (gateOptions: Partial<RuleGateOptions> & Pick<RuleGateOptions, 'rules'>): (() => void) => installRuleGate(ctx, {
    row: 'guard',
    prepend: false,
    journal,
    ...gateOptions,
  })
  const run = async (payload: ToolExecutionPayload): Promise<PreExecuteDecision> => {
    const entry = listeners.find(candidate => candidate.event === 'tools/pre-execute')
    assert.ok(entry !== undefined, 'the gate did not install a tools/pre-execute listener')
    const decision = await entry.listener(payload, () => Promise.resolve(inner))
    decisions.push(decision)
    return decision
  }
  return { store, health, decisions, innerOf: () => inner, setInner: (decision: PreExecuteDecision) => { inner = decision }, violations, gateOf, run, listeners }
}

const write = (agent?: ReturnType<typeof agentAt>): ToolExecutionPayload => ({ name: 'write', arguments: { file_path: 'C:\\elsewhere\\a.ts' }, ...(agent === undefined ? {} : { agent }) })

test('judge keeps every denial in rule order and names the rules whose detector threw', () => {
  const verdict = judge([rule('one'), rule('two'), BROKEN, rule('three')], { name: 'write', arguments: {} }, NATIVE_FACE)
  assert.deepEqual(verdict.denies.map(deny => deny.rule), ['one', 'two', 'three'])
  assert.deepEqual(verdict.errors, ['broken-rule'])
  assert.equal(renderCorrection(verdict.denies[0].correction).split('\n')[0], 'one says no to write')
  const quiet = judge([rule('one')], { name: 'read', arguments: {} }, NATIVE_FACE)
  assert.deepEqual([quiet.denies, quiet.errors], [[], []])
})

test('the gate denies with the first correction and journals every denial of the call', async () => {
  const h = harness()
  const agent = agentAt('a1', 'C:\\ws')
  h.gateOf({ rules: () => ({ rules: [rule('one'), rule('two')], face: NATIVE_FACE, origin: { scope: 'dialect' } }) })
  const decision = await h.run(write(agent))
  assert.equal(decision.kind, 'deny')
  assert.equal(decision.kind === 'deny' && decision.reason, renderCorrection(CORRECTION('one says no to write')))
  assert.deepEqual(h.violations().map(record => record.rule), ['one', 'two'])
  const record = h.violations()[0]
  assert.deepEqual([record.tool, record.agentId, record.sessionId, record.scope], ['write', 'a1', 'a1', 'dialect'])
  assert.deepEqual(record.call, { tool: 'write', target: 'C:\\elsewhere\\a.ts' })
  assert.ok(typeof record.at === 'string' && !Number.isNaN(Date.parse(String(record.at))))
  assert.deepEqual(h.decisions.map(entry => entry.kind), ['deny'])
})

test('a row with nothing to judge passes the call through; a child call never reaches the rules', async () => {
  const h = harness()
  let asked = 0
  h.gateOf({ rules: () => { asked += 1; return undefined } })
  assert.equal((await h.run(write())).kind, 'allow')
  assert.equal(asked, 1)
  assert.equal(h.violations().length, 0)
  const agent = agentAt()
  const child = { ...write(agent), parent: { token: 'run_code' } }
  asked = 0
  assert.equal((await h.run(child)).kind, 'allow')
  assert.equal(asked, 0, 'the transport sub-call passes without judging')
})

test('allowed hears the calls that ran, with the origin, and not the ones an inner listener refused', async () => {
  const h = harness()
  const seen: Array<{ name: string, scope: string }> = []
  h.gateOf({ rules: () => ({ rules: [rule('one', () => false)], face: NATIVE_FACE, origin: { scope: 'other' } }), allowed: (payload, origin) => { seen.push({ name: payload.name, scope: origin.scope }) } })
  h.setInner({ kind: 'allow' })
  await h.run(write(agentAt()))
  h.setInner({ kind: 'deny', reason: 'user declined' })
  await h.run(write(agentAt()))
  assert.deepEqual(seen, [{ name: 'write', scope: 'other' }])
})

test('a lifted rule does not judge, and comes back after the restore line', async () => {
  const root = join(tmpdir(), 'guard-gate-lift-', String(Date.now()))
  mkdirSync(join(root, '.llm'), { recursive: true })
  mkdirSync(join(root, 'docs', 'guard'), { recursive: true })
  try {
    const h = harness()
    h.gateOf({ rules: () => ({ rules: [rule('scratch-rule')], face: NATIVE_FACE, origin: { scope: 'dialect' } }) })
    const agent = agentAt('a1', root)
    assert.equal((await h.run(write(agent))).kind, 'deny')
    writeFileSync(join(root, 'docs', 'guard', 'lifts.jsonl'), `${JSON.stringify({ at: '2026-11-01T09:00:00Z', rule: 'scratch-rule', action: 'lift', via: 'chat', words: '先别拦了' })}\n`)
    assert.equal((await h.run(write(agent))).kind, 'allow')
    writeFileSync(join(root, 'docs', 'guard', 'lifts.jsonl'), `${JSON.stringify({ at: '2026-11-01T09:00:00Z', rule: 'scratch-rule', action: 'lift', via: 'chat', words: '先别拦了' })}\n${JSON.stringify({ at: '2026-11-01T10:00:00Z', rule: 'scratch-rule', action: 'restore', via: 'chat', words: '拦回来' })}\n`)
    assert.equal((await h.run(write(agent))).kind, 'deny')
    assert.deepEqual(h.violations().map(record => record.rule), ['scratch-rule', 'scratch-rule'])
  }
  finally {
    rmSyncForce(root)
  }
})

test('a rule the journal cannot name (a lift for another project) still judges', async () => {
  const mine = join(tmpdir(), 'guard-gate-lift-mine-', String(Date.now()))
  const other = join(tmpdir(), 'guard-gate-lift-other-', String(Date.now()))
  mkdirSync(join(mine, '.llm'), { recursive: true })
  mkdirSync(join(other, 'docs', 'guard'), { recursive: true })
  try {
    writeFileSync(join(other, 'docs', 'guard', 'lifts.jsonl'), `${JSON.stringify({ at: '2026-11-01T09:00:00Z', rule: 'scratch-rule', action: 'lift', via: 'board', words: '/rules lift guard:scratch-rule' })}\n`)
    const h = harness()
    h.gateOf({ rules: () => ({ rules: [rule('scratch-rule')], face: NATIVE_FACE, origin: { scope: 'dialect' } }) })
    assert.equal((await h.run(write(agentAt('a1', mine)))).kind, 'deny')
  }
  finally {
    rmSyncForce(mine)
    rmSyncForce(other)
  }
})

const rmSyncForce = (root: string): void => { rmSync(root, { recursive: true, force: true }) }

test('a throwing detector fails open: the rule does not deny, the health note names it, the console warns once per rule and session', async () => {
  const warnings: string[] = []
  const warn = console.warn
  console.warn = (message: string) => { warnings.push(message) }
  try {
    const h = harness()
    h.gateOf({ rules: () => ({ rules: [BROKEN, rule('one')], face: NATIVE_FACE, origin: { scope: 'dialect' } }), health: h.health })
    const agent = agentAt('a1')
    assert.equal((await h.run(write(agent))).kind, 'deny', 'only the broken rule fails open; the healthy rule still judges (design §3.1)')
    assert.equal((await h.run(write(agent))).kind, 'deny', 'a second call fails the broken rule open the same way')
    assert.equal(warnings.filter(message => message.includes('broken-rule')).length, 1, 'one console warning per rule and session')
    const report = h.health.session(sessionIdOf(agent))
    assert.ok(report !== undefined)
    assert.equal(report.state, 'degraded')
    assert.ok(report.reason.includes('规则 broken-rule 判定出错'), report.reason)
  }
  finally {
    console.warn = warn
  }
})

test('the rule-errors note names at most three rules and says 等 for the rest', async () => {
  const h = harness()
  const broken = (id: string): GuardRule => ({ id, declare: id, detect() { throw new Error('no') } })
  h.gateOf({ rules: () => ({ rules: [broken('a'), broken('b'), broken('c'), broken('d')], face: NATIVE_FACE, origin: { scope: 'dialect' } }), health: h.health })
  const agent = agentAt('a1')
  assert.equal((await h.run(write(agent))).kind, 'allow')
  const reason = h.health.session('a1')?.reason ?? ''
  assert.ok(reason.includes('规则 a、b、c 等 判定出错'), reason)
})

test('a failed journal write counts against the session and the note outlives the row health reports', async () => {
  const h = harness({ fail: () => true })
  h.gateOf({ rules: () => ({ rules: [rule('one')], face: NATIVE_FACE, origin: { scope: 'dialect' } }), health: h.health, journal: (record) => h.store.fs.appendFile('C:/ws/.llm/audit/violations.jsonl', `${JSON.stringify(record)}\n`) })
  const agent = agentAt('a1')
  assert.equal((await h.run(write(agent))).kind, 'deny', 'the call is denied whether or not the record landed')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.violations().length, 0)
  assert.equal(h.health.session('a1')?.reason.includes('1 条违规没有落盘'), true, h.health.session('a1')?.reason)
  // The plain report does not wipe the note.
  h.health.report('a1', 'active', '门禁生效')
  assert.equal(h.health.session('a1')?.reason.includes('1 条违规没有落盘'), true)
})

test('session end calls the row journal flush, so a pending gap record is written even without a next call', async () => {
  const listeners: Array<{ event: string, listener: (session: never) => void }> = []
  const ctx = {
    on: (event: string, listener: never) => {
      listeners.push({ event, listener: listener })
      return () => {}
    },
    get: () => undefined,
  }
  let flushed = 0
  installRuleGate(ctx, {
    row: 'guard',
    prepend: false,
    rules: () => ({ rules: [rule('one')], face: NATIVE_FACE, origin: { scope: 'dialect' } }),
    journal: () => {},
    flush: () => { flushed += 1 },
  })
  const dispose = listeners.find(entry => entry.event === 'session/disposed')
  assert.ok(dispose !== undefined, 'the gate subscribes to session/disposed')
  dispose.listener(undefined as never)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(flushed, 1)
})

test('isGateListener marks the listeners the gate installs, and nothing else', () => {
  const h = harness()
  const stop = h.gateOf({ rules: () => undefined })
  const pre = h.listeners.find(entry => entry.event === 'tools/pre-execute')
  assert.ok(pre !== undefined)
  assert.equal(isGateListener(pre.listener), true)
  assert.equal(isGateListener(() => Promise.resolve({ kind: 'allow' as const })), false)
  stop()
})
