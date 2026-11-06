/**
 * The journal's record format (metrics design §4): the pinned kind lists of
 * every namespace against src/metrics/kinds/<namespace>.ts (acceptance 5),
 * the validator as the only gate (unknown keys, wrong types, oversized
 * arrays and maps, lines above 4096 bytes reject the whole event), the
 * deterministic serialization and the recomputable chain, and the two
 * shared helpers the step owns (text-units §4.3, build-info §4.1).
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { METRICS_KINDS } from '../src/metrics/kinds/index.ts'
import { BOOTSTRAP_KINDS as BOOTSTRAP_TABLES } from '../src/metrics/kinds/bootstrap.ts'
import { DESIGN_KINDS } from '../src/metrics/kinds/design.ts'
import { EXECUTE_KINDS } from '../src/metrics/kinds/execute.ts'
import { GLM_KINDS } from '../src/metrics/kinds/glm.ts'
import { HOST_KINDS } from '../src/metrics/kinds/host.ts'
import { LOOP_KINDS } from '../src/metrics/kinds/loops.ts'
import { OPERATE_KINDS } from '../src/metrics/kinds/operate.ts'
import { PROGRESS_KINDS } from '../src/metrics/kinds/progress.ts'
import { RULES_KINDS } from '../src/metrics/kinds/rules.ts'
import { TIMEOUT_KINDS } from '../src/metrics/kinds/timeout.ts'
import { AT_PATTERN, CHAIN_PATTERN, ID_PATTERN, MAX_ENTRIES, METRICS_BY, WRITER_ID_PATTERN, checkEvent, serializeEvent, type KindTable, type MetricsEvent } from '../src/metrics/schema.ts'
import { nodeMetricsFs, openWriter } from '../src/metrics/writer.ts'
import type { QueuedEvent } from '../src/shared/metrics.ts'
import { readLog } from '../src/metrics/read.ts'
import { buildStamp, readBuildInfo } from '../src/shared/build-info.ts'
import { METRICS_SERVICE, emitMetric, metricsOf, type MetricsService } from '../src/shared/metrics.ts'
import { textUnits } from '../src/shared/text-units.ts'

test('every namespace holds exactly the kinds its design section lists', () => {
  // §4.2 first table: this design's own kinds, `graph` and `graph-fail` counted as two.
  const host = ['start', 'stop', 'gap', 'reject', 'prune', 'session', 'turn', 'llm', 'tool', 'rule', 'followup', 'request', 'lift', 'approval', 'command', 'ask', 'answer', 'said', 'graph', 'graph-fail', 'report', 'count']
  // §4.2 second table: the 2026-10-31 decisions.
  const timeout = ['timeout.set', 'timeout.hit']
  const progress = ['progress.due', 'progress.handover']
  // rules board 0.10 §10.5: 15 kinds.
  const rules = ['rules.judged', 'rules.session-summary', 'rules.ticket', 'rules.wake', 'rules.write', 'rules.proposal', 'rules.peak-mode', 'rules.recovery', 'rules.detector-run', 'rules.check', 'rules.health', 'rules.script', 'rules.late-verdict', 'rules.repo', 'rules.stale']
  // loop board 0.6 §6.10: 11 kinds.
  const loops = ['loop-fired', 'loop-done', 'loop-entry', 'loop-drift', 'loop-note', 'loop-read', 'loop-contribution', 'loop-duplicate', 'loop-holder', 'loop-handover', 'loop-task-delete']
  // M7 0.6 §3.16: 21 execute.* and 2 operate.*.
  const execute = ['execute.dispatch', 'execute.dispatch-refused', 'execute.plan', 'execute.ask', 'execute.handback', 'execute.review-depth', 'execute.review', 'execute.stop', 'execute.check', 'execute.advance', 'execute.advance-refused', 'execute.unchecked-advance', 'execute.goal', 'execute.tier', 'execute.completion-gate', 'execute.acceptance-review', 'execute.reconcile', 'execute.loop-entry', 'execute.loop-fallback', 'execute.loop-contribute', 'execute.peak-cap']
  const operate = ['operate.report', 'operate.patrol']
  // M6 0.6 §14.2: 4 kinds.
  const glm = ['glm.quota-read', 'glm.upstream-limit', 'glm.login-rejected', 'glm.peak-reminder']
  // M3 addendum 0.6 §3.12: 8 design.* plus 2 git.*.
  const design = ['design.proposal-shown', 'design.answer-recorded', 'design.delegation', 'design.proposal-refused', 'design.answer-refused', 'design.holder-moved', 'design.rule-denied', 'design.bypass-refused', 'git.snapshot', 'git.snapshot-refused']
  // takeover 0.6: 1 kind.
  const bootstrap = ['bootstrap.trial']
  const pinned: ReadonlyArray<readonly [string, readonly string[], readonly KindTable[]]> = [
    ['host', host, HOST_KINDS], ['timeout', timeout, TIMEOUT_KINDS], ['progress', progress, PROGRESS_KINDS],
    ['rules', rules, RULES_KINDS], ['loops', loops, LOOP_KINDS], ['execute', execute, EXECUTE_KINDS],
    ['operate', operate, OPERATE_KINDS], ['glm', glm, GLM_KINDS], ['design', design, DESIGN_KINDS],
    ['bootstrap', bootstrap, BOOTSTRAP_TABLES],
  ]
  for (const [namespace, expected, tables] of pinned) assert.deepEqual(tables.map(table => table.name), expected, namespace)
  assert.equal(METRICS_KINDS.size, host.length + timeout.length + progress.length + rules.length + loops.length + execute.length + operate.length + glm.length + design.length + bootstrap.length)
})

/** A typical body for one field table, generated from the closed grammar itself. */
function typicalBody(fields: readonly { readonly name: string, readonly type: unknown, readonly optional?: true }[]): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const field of fields) {
    const type = field.type
    if (Array.isArray(type)) body[field.name] = type[0]
    else if (typeof type === 'object' && type !== null && 'rec' in type) {
      const members: Record<string, unknown> = {}
      for (const member of (type as { readonly rec: readonly { readonly name: string, readonly type: unknown }[] }).rec) {
        members[member.name] = Array.isArray(member.type) ? (member.type as readonly string[])[0] : member.type === 'int' ? 1 : 'x'
      }
      body[field.name] = members
    }
    else if (type === 'int' || type === 'num') body[field.name] = 1
    else if (type === 'bool') body[field.name] = true
    else if (type === 'id[]') body[field.name] = ['x']
    else if (type === 'int[]') body[field.name] = [1]
    else if (type === 'map') body[field.name] = { x: 1 }
    else body[field.name] = 'x'
  }
  return body
}

const AT = '2026-11-04T12:00:00.000Z'

test('a typical event of every kind passes the validator and round-trips through the writer and the reader', async () => {
  const root = mkdtempSync(join(tmpdir(), 'metrics-schema-'))
  try {
    const writer = openWriter({ host: 'cli', fs: nodeMetricsFs, now: () => Date.parse(AT) })
    const sent: string[] = []
    for (const [kind, table] of METRICS_KINDS) {
      sent.push(kind)
      const event = { k: kind, by: 'host', at: AT, body: typicalBody(table.fields) }
      writer.record(root, event as unknown as QueuedEvent)
    }
    await writer.flush()
    const reading = await readLog(root)
    assert.deepEqual(reading.problems, [])
    const written = reading.events.filter(event => event.n > 1) // n 1 is the writer's own start line
    assert.equal(written.length, sent.length)
    const seen = new Set(written.map(event => event.k))
    for (const kind of sent) assert.ok(seen.has(kind), kind)
    for (const event of written) {
      const table = METRICS_KINDS.get(event.k)
      assert.ok(table !== undefined, event.k)
      for (const field of table.fields) assert.ok(event.body[field.name] !== undefined, `${event.k}.${field.name}`)
      assert.equal(event.at, AT)
      assert.match(String(event.h), CHAIN_PATTERN)
    }
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

function envelope(): Record<string, unknown> {
  return { s: 1, k: 'said', at: AT, w: '0123abcd', n: 3, h: 'a'.repeat(12), v: '0.3.0+abc1234', by: 'host', body: { units: 5, attachments: 0, source: 'user' } }
}

const bodyOf = (candidate: Record<string, unknown>): Record<string, unknown> => candidate.body as Record<string, unknown>

test('the validator rejects unknown keys, wrong types, oversized arrays and maps, and bad envelope shapes', () => {
  const rejects: ReadonlyArray<readonly [unknown, string]> = [
    [{ ...envelope(), extra: 1 }, 'other'],
    [{ ...envelope(), body: { ...bodyOf(envelope()), extra: 1 } }, 'other'],
    [{ ...envelope(), body: {} }, 'units'],
    [{ ...envelope(), body: { ...bodyOf(envelope()), units: 'many' } }, 'units'],
    [{ ...envelope(), body: { ...bodyOf(envelope()), attachments: -1 } }, 'attachments'],
    [{ ...envelope(), body: { ...bodyOf(envelope()), source: 'has space' } }, 'source'],
    [{ ...envelope(), w: 'ZZZZZZZZ' }, 'w'],
    [{ ...envelope(), w: 'bf-nothex' }, 'w'],
    [{ ...envelope(), h: 'short' }, 'h'],
    [{ ...envelope(), n: 0 }, 'n'],
    [{ ...envelope(), n: 1.5 }, 'n'],
    [{ ...envelope(), s: 2 }, 's'],
    [{ ...envelope(), at: '2026-11-04 12:00' }, 'at'],
    [{ ...envelope(), by: 'nobody' }, 'by'],
    [{ ...envelope(), v: '0.3.0 abc' }, 'v'],
    [{ ...envelope(), sid: '' }, 'sid'],
    [{ ...envelope(), k: 'no-such-kind' }, 'k'],
    ['a line', 'other'],
  ]
  for (const [candidate, field] of rejects) {
    const check = checkEvent(candidate, METRICS_KINDS)
    assert.equal(check.ok, false, JSON.stringify(candidate))
    assert.ok(!check.ok && check.field === field, `${JSON.stringify(candidate)} -> ${!check.ok ? check.field : 'ok'}`)
  }
  assert.ok(checkEvent(envelope(), METRICS_KINDS).ok)
})

test('arrays and maps beyond 32 entries are rejected, at the limit they pass', () => {
  const full = { s: 1, k: 'execute.check', at: AT, w: '0123abcd', n: 1, h: 'a'.repeat(12), v: '0.3.0+abc1234', by: 'host', body: { commit: 'abc1234', ok: true, kind: 'gate', cmds: Array.from({ length: MAX_ENTRIES }, (_, i) => i), exits: Array.from({ length: MAX_ENTRIES }, () => 0), ms: Array.from({ length: MAX_ENTRIES }, () => 1), setup: false, lockMs: 0 } }
  assert.ok(checkEvent(full, METRICS_KINDS).ok)
  const check = checkEvent({ ...full, body: { ...(full.body as Record<string, unknown>), cmds: Array.from({ length: MAX_ENTRIES + 1 }, (_, i) => i), exits: Array.from({ length: MAX_ENTRIES + 1 }, () => 0), ms: Array.from({ length: MAX_ENTRIES + 1 }, () => 1) } }, METRICS_KINDS)
  assert.ok(!check.ok && check.field === 'cmds')
  const judged = { s: 1, k: 'rules.judged', at: AT, w: '0123abcd', n: 1, h: 'a'.repeat(12), v: '0.3.0+abc1234', by: 'rules', body: { rule: 'r', how: 'enforce', tool: 'pwsh', sub: false, ms: 1, signals: Object.fromEntries(Array.from({ length: MAX_ENTRIES }, (_, i) => [`s${i}`, i])) } }
  assert.ok(checkEvent(judged, METRICS_KINDS).ok)
  const checkOver = checkEvent({ ...judged, body: { ...(judged.body as Record<string, unknown>), signals: { ...((judged.body as Record<string, unknown>).signals as Record<string, number>), extra: 1 } } }, METRICS_KINDS)
  assert.ok(!checkOver.ok && checkOver.field === 'signals')
})

test('serialization is field-table order and the chain recomputes from the previous digest', () => {
  const table = METRICS_KINDS.get('llm')!
  const event: MetricsEvent = { s: 1, k: 'llm', at: AT, w: '0123abcd', n: 7, h: 'b'.repeat(12), v: '0.3.0+abc1234', by: 'host', body: { provider: 'glm-zcode', model: 'glm-5.3-flash', ms: 900, fin: 'stop', calls: 1, text: 12 } }
  const text = serializeEvent(event, table)
  const expected = JSON.stringify({
    s: 1, k: 'llm', at: AT, w: '0123abcd', n: 7, v: '0.3.0+abc1234', by: 'host',
    body: { provider: 'glm-zcode', model: 'glm-5.3-flash', ms: 900, fin: 'stop', calls: 1, text: 12 }, h: 'b'.repeat(12),
  })
  assert.equal(text, expected, 'envelope first, body in its layer in table order, the digest last')
  assert.equal(serializeEvent(event, table), text, 'the same event serializes to the same text')
  const core = serializeEvent(event, table, { chain: true })
  assert.ok(core.endsWith('}'))
  assert.ok(!core.includes('"h"'))
  const digest = createHash('sha256').update(`${'a'.repeat(12)}${core}`, 'utf8').digest('hex').slice(0, 12)
  assert.match(digest, CHAIN_PATTERN)
})

test('at is an ISO UTC instant with milliseconds', () => {
  assert.ok(AT_PATTERN.test('2026-11-04T12:00:00.000Z'))
  assert.ok(!AT_PATTERN.test('2026-11-04T12:00:00Z'))
  assert.ok(!AT_PATTERN.test('2026-11-04T12:00:00.000+08:00'))
})

test('textUnits counts Han, kana, Hangul and fullwidth characters, one per ASCII word run', () => {
  assert.equal(textUnits('指标'), 2)
  assert.equal(textUnits('metrics design'), 2)
  assert.equal(textUnits('记 metrics 流水'), 4)
  assert.equal(textUnits('„quotes“ and — dashes;'), 3)
  assert.equal(textUnits('全角，字符！'), 6)
  assert.equal(textUnits('カタカナと한글'), 7)
  assert.equal(textUnits('a1b2 c3'), 2)
  assert.equal(textUnits(''), 0)
})

test('the submitter list and the id shapes hold', () => {
  assert.deepEqual([...METRICS_BY], ['host', 'graph', 'guard', 'rules', 'loops', 'execute', 'operate', 'glm', 'design', 'bootstrap', 'env', 'memory'])
  assert.ok(WRITER_ID_PATTERN.test('0123abcd'))
  assert.ok(WRITER_ID_PATTERN.test('bf-0123abc'))
  assert.ok(!WRITER_ID_PATTERN.test('0123abc'))
  assert.ok(ID_PATTERN.test('0123abcd'))
  assert.ok(!ID_PATTERN.test('x'.repeat(121)))
})

test('without the metrics row, metricsOf is undefined and emitMetric is a no-op', () => {
  const service: MetricsService | undefined = metricsOf({})
  assert.equal(service, undefined)
  assert.doesNotThrow(() => emitMetric({ get: () => undefined }, { k: 'said', by: 'host', body: { units: 1, attachments: 0, source: 'user' } }, {}))
  assert.equal(typeof METRICS_SERVICE, 'string')
})

test('buildStamp reads the nearest build-info.json and says unknown without one', () => {
  const root = mkdtempSync(join(tmpdir(), 'metrics-build-'))
  try {
    assert.equal(buildStamp(root), 'unknown')
    assert.equal(readBuildInfo(root), undefined)
    const pkg = join(root, 'pkg', 'dist', 'shared')
    mkdirSync(pkg, { recursive: true })
    writeFileSync(join(pkg, '..', '..', 'build-info.json'), JSON.stringify({ version: '0.3.0', commit: 'abc1234', dirty: true }))
    assert.deepEqual(readBuildInfo(pkg), { version: '0.3.0', commit: 'abc1234', dirty: true })
    assert.equal(buildStamp(pkg), '0.3.0+abc1234.dirty')
    writeFileSync(join(pkg, '..', '..', 'build-info.json'), JSON.stringify({ version: '0.3.0', commit: 'nogit', dirty: false }))
    assert.equal(buildStamp(pkg), '0.3.0+nogit')
    writeFileSync(join(pkg, '..', '..', 'build-info.json'), 'not json')
    assert.equal(buildStamp(pkg), 'unknown')
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})
