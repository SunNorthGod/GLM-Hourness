import assert from 'node:assert/strict'
import test from 'node:test'
import { creditPricing } from '../src/glm-llm/credits.ts'
import { collectStatus, STATUS_ROWS, statusPlaceholders } from '../src/report/status.ts'
import { NO_PRICING_LINE, PEAK_SOURCE, peakStatusItems, QUOTA_SOURCE, quotaStatusItems, usagePanel, usagePanelLines, usagePanelOf, usageStatusItems, usageTotals } from '../src/report/panel.ts'
import type { ServiceLookup } from '../src/shared/dsh-min.ts'
import { HEALTH_ROWS } from '../src/shared/health.ts'
import { provideRowStatus, statusServiceName, type RowStatusView } from '../src/shared/status-host.ts'
import { formatMoment, type MomentZone } from '../src/shared/quota.ts'
import type { UsagePricing } from '../src/shared/pricing.ts'
import { isStale, STATUS_TEXT_MAX, validateStatusItem, type StatusAudience, type StatusItem } from '../src/shared/status.ts'
import { serviceStore } from './fake-rc3.ts'

/** The display zone the specs run in, the one the renderHourness calls pass. */
const ZONE: MomentZone = { offsetMinutes: 480 }

// The status hub's L2 (status hub design 0.3 §11): the entry contract and its
// validation, the host-side registration, the collector's audience filter,
// error isolation and stale marking, and the usage list as the one glm/usage
// entry — its lines pinned verbatim to the panel's list.

/** Silence `run`'s warnings and return them, until it (or its promise) settles. */
function quietly<T>(run: () => T): { result: T, warnings: string[] } {
  const warnings: string[] = []
  const warn = console.warn
  console.warn = (message: string) => { warnings.push(message) }
  try {
    return { result: run(), warnings }
  }
  finally {
    console.warn = warn
  }
}

/** A valid entry with the parts a test changes. */
function entry(id: string, owner: string, audience: StatusAudience, extra?: {
  asOf?: string
  source?: string
  text?: string
  fields?: Record<string, string | number | boolean>
  detail?: string[]
  staleAfterMs?: number
}): StatusItem {
  return {
    id,
    owner,
    audience,
    asOf: extra?.asOf ?? '2026-10-31T12:00:00Z',
    source: extra?.source ?? 'test/fixture',
    text: extra?.text ?? '一行',
    ...(extra?.fields === undefined ? {} : { fields: extra.fields }),
    ...(extra?.detail === undefined ? {} : { detail: extra.detail }),
    ...(extra?.staleAfterMs === undefined ? {} : { staleAfterMs: extra.staleAfterMs }),
  }
}

test('STATUS_ROWS: HEALTH_ROWS today, the superset seam as owner packages merge', () => {
  assert.deepEqual([...STATUS_ROWS], [...HEALTH_ROWS])
})

test('validateStatusItem keeps a well-formed entry whole', () => {
  const checked = validateStatusItem(entry('glm/usage', 'glm', 'agent', { fields: { calls: 6, plan: 'coding-plan', billed: true }, detail: ['一行明细'], staleAfterMs: 60_000 }))
  assert.deepEqual(checked, {
    ok: true,
    item: {
      id: 'glm/usage',
      owner: 'glm',
      audience: 'agent',
      asOf: '2026-10-31T12:00:00Z',
      source: 'test/fixture',
      text: '一行',
      fields: { calls: 6, plan: 'coding-plan', billed: true },
      detail: ['一行明细'],
      staleAfterMs: 60_000,
    },
    warnings: [],
  })
})

test('validateStatusItem drops the entry over a required field, and a wrong audience never defaults', () => {
  const drops: Array<[string, unknown]> = [
    ['不是对象', 'text'],
    ['id 形状', { ...entry('glm/usage', 'glm', 'agent'), id: '' }],
    ['id 形状', { ...entry('glm/usage', 'glm', 'agent'), id: 'usage' }],
    ['id 形状', { ...entry('glm/usage', 'glm', 'agent'), id: 'glm/usage/extra' }],
    ['owner 为空', { ...entry('glm/usage', 'glm', 'agent'), owner: ' ' }],
    ['audience', { ...entry('glm/usage', 'glm', 'agent'), audience: 'human' }],
    ['audience', { ...entry('glm/usage', 'glm', 'agent'), audience: 'Person' }],
    ['audience', { ...entry('glm/usage', 'glm', 'agent'), audience: undefined }],
    ['asOf', { ...entry('glm/usage', 'glm', 'agent'), asOf: 'not a time' }],
    ['asOf', { ...entry('glm/usage', 'glm', 'agent'), asOf: 7 }],
    ['source 为空', { ...entry('glm/usage', 'glm', 'agent'), source: '' }],
    ['text', { ...entry('glm/usage', 'glm', 'agent'), text: '' }],
    ['text', { ...entry('glm/usage', 'glm', 'agent'), text: ' \t ' }],
    ['text', { ...entry('glm/usage', 'glm', 'agent'), text: '两行\n不止' }],
    ['text', { ...entry('glm/usage', 'glm', 'agent'), text: '长'.repeat(STATUS_TEXT_MAX + 1) }],
  ]
  for (const [why, value] of drops) {
    const checked = validateStatusItem(value)
    assert.equal(checked.ok, false, why)
    assert.ok(!checked.ok && checked.reason.length > 0, why)
  }
  // A text of exactly the limit passes, counted in code points: an astral character is one.
  assert.equal(validateStatusItem({ ...entry('glm/usage', 'glm', 'agent'), text: '长'.repeat(STATUS_TEXT_MAX) }).ok, true)
  const astral = validateStatusItem({ ...entry('glm/usage', 'glm', 'agent'), text: '🦄'.repeat(STATUS_TEXT_MAX) })
  assert.equal(astral.ok, true)
  assert.equal(validateStatusItem({ ...entry('glm/usage', 'glm', 'agent'), text: `${'🦄'.repeat(STATUS_TEXT_MAX)}x` }).ok, false)
})

test('validateStatusItem cleans the optional fields instead of dropping the entry, and says what it cleaned', () => {
  const bent = validateStatusItem({
    ...entry('glm/usage', 'glm', 'agent'),
    fields: { calls: 6, bent: { nested: true } },
    detail: ['短的一行', 'x'.repeat(STATUS_TEXT_MAX + 1)],
    staleAfterMs: -1,
  })
  assert.ok(bent.ok)
  if (!bent.ok) return
  assert.deepEqual(bent.item.fields, { calls: 6 })
  assert.deepEqual(bent.item.detail, ['短的一行', 'x'.repeat(STATUS_TEXT_MAX)])
  assert.equal(bent.item.staleAfterMs, undefined)
  assert.deepEqual(bent.warnings, [
    'glm/usage 的 fields.bent 不是 string/number/boolean，已丢弃',
    `glm/usage 的一条明细超过 ${STATUS_TEXT_MAX} 个码点，已截断`,
    'glm/usage 的 staleAfterMs 不是正有限数，当作不陈旧',
  ])
  const odd = validateStatusItem({ ...entry('glm/usage', 'glm', 'agent'), fields: 5, detail: 'not a list' })
  assert.ok(odd.ok)
  if (!odd.ok) return
  assert.equal(odd.item.fields, undefined)
  assert.equal(odd.item.detail, undefined)
  assert.deepEqual(odd.warnings, ['glm/usage 的 fields 不是对象，当作没有', 'glm/usage 的 detail 不是字符串数组，当作没有'])
})

test('isStale: never without staleAfterMs, past the window with it, an unreadable asOf is not stale', () => {
  const now = Date.parse('2026-10-31T12:00:00Z')
  assert.equal(isStale(entry('glm/usage', 'glm', 'agent'), now), false)
  assert.equal(isStale(entry('glm/usage', 'glm', 'agent', { staleAfterMs: 60_000 }), now + 59_999), false)
  assert.equal(isStale(entry('glm/usage', 'glm', 'agent', { staleAfterMs: 60_000 }), now + 60_000), false)
  assert.equal(isStale(entry('glm/usage', 'glm', 'agent', { staleAfterMs: 60_000 }), now + 60_001), true)
  assert.equal(isStale({ ...entry('glm/usage', 'glm', 'agent', { staleAfterMs: 60_000 }), asOf: 'not a time' }, now), false)
})

test('provideRowStatus provides glmHournessStatus/<row>, withdraws on dispose, and a second instance or a bare context never throws', () => {
  const store = serviceStore()
  const view: RowStatusView = { row: 'hourness', items: () => [] }
  const first = provideRowStatus(store, 'hourness', view.items)
  assert.deepEqual([...store.services.keys()], [statusServiceName('hourness')])
  const provided = store.services.get(statusServiceName('hourness')) as RowStatusView
  assert.equal(provided.items, view.items)
  assert.equal(provided.row, 'hourness')
  const { result: second, warnings } = quietly(() => provideRowStatus(store, 'hourness', () => []))
  assert.equal(warnings.length, 1)
  assert.ok(warnings[0]?.startsWith('dsh-glm-hourness/hourness: row status not provided'), warnings[0])
  second.dispose()
  assert.equal(store.services.get(statusServiceName('hourness')), provided) // the first view stays
  first.dispose()
  assert.equal(store.services.size, 0)
  const bare = provideRowStatus({}, 'guard', () => [])
  bare.dispose() // no provide: the items stay local, the disposer is nothing
})

/** A lookup with two rows' views: `hourness` provides `items` of its own, `guard` throws or provides `guardItems`. */
function storeWith(hourness: () => readonly StatusItem[], guard: () => readonly StatusItem[] = () => [entry('guard/one', 'guard', 'agent')]): ServiceLookup {
  const store = serviceStore()
  store.provide(statusServiceName('hourness'), { row: 'hourness', items: hourness })
  store.provide(statusServiceName('guard'), { row: 'guard', items: guard })
  return store
}

test('collectStatus: agent keeps only agent entries, all keeps both, and the absent rows are skipped without a word', () => {
  const lookup = storeWith(() => [entry('glm/usage', 'glm', 'agent'), entry('panel/note', 'panel', 'person')])
  const agent = collectStatus(lookup, 's1', 'agent', 0)
  assert.deepEqual(agent.items.map(item => item.id), ['glm/usage', 'guard/one'])
  assert.deepEqual(agent.rows, [
    { row: 'glm-llm', outcome: 'absent' },
    { row: 'glm-login', outcome: 'absent' },
    { row: 'glm-prompt', outcome: 'absent' },
    { row: 'glm-compact', outcome: 'absent' },
    { row: 'data', outcome: 'absent' },
    { row: 'guard', outcome: 'ok' },
    { row: 'memory', outcome: 'absent' },
    { row: 'lessons', outcome: 'absent' },
    { row: 'workflow', outcome: 'absent' },
    { row: 'hourness', outcome: 'ok' },
    { row: 'graph', outcome: 'absent' },
    { row: 'graph-panel', outcome: 'absent' },
    { row: 'rules', outcome: 'absent' },
    { row: 'design', outcome: 'absent' },
    { row: 'execute', outcome: 'absent' },
    { row: 'loops', outcome: 'absent' },
    { row: 'metrics', outcome: 'absent' },
    { row: 'env', outcome: 'absent' },
    { row: 'transcript', outcome: 'absent' },
    { row: 'bootstrap', outcome: 'absent' },
  ])
  const all = collectStatus(lookup, 's1', 'all', 0)
  assert.deepEqual(all.items.map(item => item.id), ['glm/usage', 'guard/one', 'panel/note']) // sorted by owner and id
})

test('collectStatus sorts by owner and then id, whatever order the rows provided', () => {
  const lookup = storeWith(() => [entry('glm/usage', 'glm', 'agent'), entry('glm/quota', 'glm', 'agent'), entry('rules/peak', 'rules', 'agent')])
  assert.deepEqual(collectStatus(lookup, 's1', 'agent', 0).items.map(item => item.id), ['glm/quota', 'glm/usage', 'guard/one', 'rules/peak'])
})

test('collectStatus: a row whose items throw takes the placeholder and one warning, and the other rows go on', () => {
  const { result, warnings } = quietly(() => collectStatus(storeWith(() => { throw new Error('boom\nsecond line') }), 's1', 'agent', 0))
  assert.deepEqual(result.items.map(item => item.id), ['guard/one'])
  assert.deepEqual(result.rows.find(row => row.row === 'hourness'), { row: 'hourness', outcome: 'error', reason: 'boom second line' })
  assert.ok(warnings.includes('dsh-glm-hourness/hourness: 状态读取失败：boom second line'), warnings)
  assert.deepEqual(statusPlaceholders(result.rows), ['hourness 行的状态暂时读不到：boom second line'])
  assert.deepEqual(statusPlaceholders(result.rows.filter(row => row.row !== 'hourness')), [])
  const long = quietly(() => collectStatus(storeWith(() => { throw new Error('x'.repeat(200)) }), 's1', 'agent', 0))
  assert.ok(long.result.rows.find(row => row.row === 'hourness')?.reason?.length === 80)
})

test('collectStatus drops a malformed entry with one warning per row and reason, and a cleaned one with its own', () => {
  const bad = { ...entry('glm/usage', 'glm', 'agent'), audience: 'human' }
  const lookup = storeWith(() => [bad, { ...bad, text: '另一条' }, { ...entry('glm/usage', 'glm', 'agent'), text: '' }, entry('glm/quota', 'glm', 'agent', { fields: { bent: [] } })])
  const { result, warnings } = quietly(() => collectStatus(lookup, 's1', 'agent', 0))
  assert.deepEqual(result.items.map(item => item.id), ['glm/quota', 'guard/one'])
  const fromRow = warnings.filter(message => message.startsWith('dsh-glm-hourness/hourness: '))
  assert.deepEqual(fromRow, [
    'dsh-glm-hourness/hourness: 状态条目被丢弃（audience 不是 person 或 agent：glm/usage）', // two entries of one reason, one warning
    'dsh-glm-hourness/hourness: 状态条目被丢弃（text 为空、跨行或超过 200 个码点：glm/usage）',
    'dsh-glm-hourness/hourness: glm/quota 的 fields.bent 不是 string/number/boolean，已丢弃',
  ])
})

test('collectStatus marks a stale entry with the time it is from, and leaves a fresh one word for word', () => {
  const now = Date.parse('2026-10-31T12:00:00Z')
  const fresh = collectStatus(storeWith(() => [entry('glm/usage', 'glm', 'agent', { text: '额度还有', staleAfterMs: 60_000, asOf: '2026-10-31T11:59:30Z' })]), 's1', 'agent', now)
  assert.equal(fresh.items[0]?.text, '额度还有')
  const stale = collectStatus(storeWith(() => [entry('glm/usage', 'glm', 'agent', { text: '额度还有', staleAfterMs: 60_000, asOf: '2026-10-31T11:58:00Z' })]), 's1', 'agent', now)
  // The moment is worded by the host's zone, the same formatMoment the panel's times use.
  assert.equal(stale.items[0]?.text, `额度还有（截至 ${formatMoment(Date.parse('2026-10-31T11:58:00Z'), now)}）`)
})

test('a foreign value where the view should be reads as absent, and a lookup without get reads every row absent', () => {
  const store = serviceStore()
  store.provide(statusServiceName('hourness'), { unrelated: true })
  assert.deepEqual(collectStatus(store, 's1', 'agent', 0).rows.find(row => row.row === 'hourness'), { row: 'hourness', outcome: 'absent' })
  assert.deepEqual(collectStatus({}, 's1', 'agent', 0).rows, STATUS_ROWS.map(row => ({ row, outcome: 'absent' })))
})

// --- the usage list as the one glm/usage entry (status hub design 0.3 §10) ---

const journalRecords = [
  { at: '2026-11-04T15:00:00+08:00', provider: 'glm-zcode', model: 'glm-5.3', usage: { inputTokens: 500, cacheReadTokens: 1500, outputTokens: 250, totalTokens: 2250 } }, // Thursday peak
  { at: '2026-11-07T09:00:00+08:00', provider: 'glm', model: 'glm-5.3-flash', usage: { inputTokens: 800, outputTokens: 400, totalTokens: 1200 } }, // Saturday off-peak
  { provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 10, outputTokens: 10 } }, // unreadable: no time
]
const journal = journalRecords.map(record => JSON.stringify(record)).join('\n')
const SOURCE = 'C:/u/glm-hourness/audit/usage.jsonl'

test('the glm/usage entry is the list of the panel: text is the totals line, detail the rest after it, word for word', () => {
  const panel = usagePanel(journal, creditPricing)
  const [item] = usageStatusItems(panel, SOURCE, Date.parse('2026-10-31T20:00:00+08:00'))
  assert.ok(item !== undefined)
  // The verbatim pin: the entry's lines equal the panel list without its basis line.
  assert.deepEqual([item.text, ...(item.detail ?? [])], usagePanelLines(panel, { basis: false }))
  assert.equal(item.text, '- 合计：积分 1.45 · 高峰 83% · 缓存命中 54%')
  assert.deepEqual(item.detail, [
    '- glm-5.3：1 次 · 积分 1.20 · 高峰 100% · 缓存命中 75%',
    '- glm-5.3-flash：1 次 · 积分 0.25 · 高峰 0% · 缓存命中 0%',
    '- 无法读取的记录 1 条，未计入',
  ])
  const totals = usageTotals(panel)
  assert.deepEqual(item, {
    id: 'glm/usage',
    owner: 'glm',
    audience: 'agent',
    asOf: '2026-10-31T12:00:00.000Z',
    source: SOURCE,
    text: item.text,
    detail: item.detail,
    fields: { records: 2, calls: 2, inputTokens: 1300, cacheReadTokens: 1500, cacheWriteTokens: 0, outputTokens: 650, earliest: panel.earliest, credits: totals.credits, peakCredits: totals.peakCredits },
  })
  assert.equal(item.fields?.earliest, Date.parse('2026-11-04T15:00:00+08:00'))
})

test('without the pricing service the lines of the entry are the panel list without the note, and the fields carry the token totals', () => {
  const panel = usagePanel(journal)
  const [item] = usageStatusItems(panel, SOURCE, Date.parse('2026-10-31T20:00:00+08:00'))
  assert.ok(item !== undefined)
  assert.deepEqual([item.text, ...(item.detail ?? [])], usagePanelLines(panel, { basis: false }).slice(1))
  assert.equal(usagePanelLines(panel, { basis: false })[0], NO_PRICING_LINE)
  assert.equal(item.text, '- 合计：2 次 · 未命中输入 1300 · 缓存读 1500 · 缓存写 0 · 输出 650 · 缓存命中 54%')
  assert.equal(item.fields?.credits, undefined)
  const totals = usageTotals(panel)
  assert.deepEqual(item.fields, { records: 2, calls: totals.calls, inputTokens: totals.inputTokens, cacheReadTokens: totals.cacheReadTokens, cacheWriteTokens: totals.cacheWriteTokens, outputTokens: totals.outputTokens, earliest: panel.earliest })
})

test('the entry is computed once for whatever records it is given: the period slice of the morning report uses the same function', () => {
  // The same records through usagePanelOf (what reportFromFiles parses) and through usagePanel (what
  // the row reads from text) give the same entry; the record without a time is unreadable in both.
  const parsed = usagePanelOf(journalRecords, creditPricing)
  const [fromRecords] = usageStatusItems(parsed, SOURCE, 0)
  const [fromText] = usageStatusItems(usagePanel(journal, creditPricing), SOURCE, 0)
  assert.deepEqual(fromRecords, fromText)
  // An empty journal still makes the zero entry; the row decides whether a journal exists at all.
  const [zero] = usageStatusItems(usagePanel('', creditPricing), SOURCE, Date.parse('2026-10-31T20:00:00+08:00'))
  assert.equal(zero?.text, '- 合计：积分 0.00')
  assert.equal(zero?.fields?.records, 0)
  assert.equal(zero?.fields?.earliest, undefined)
})

// --- the peak line and the quota section as entries (status hub design 0.3 §10) ---

test('the rules/peak entry is the line the panel shows, worded for the display zone it is given', () => {
  const [peak] = peakStatusItems(creditPricing, Date.parse('2026-10-28T15:00:00+08:00'), ZONE)
  assert.deepEqual(peak, { id: 'rules/peak', owner: 'rules', audience: 'agent', asOf: '2026-10-28T07:00:00.000Z', source: PEAK_SOURCE, text: '- 高峰：高峰中，到 18:00（GLM 积分套餐）' })
  const [off] = peakStatusItems(creditPricing, Date.parse('2026-10-28T18:00:00+08:00'), ZONE)
  assert.equal(off?.text, '- 高峰：不是高峰；下一个高峰 明天 14:00（GLM 积分套餐）')
  const bent = { ...creditPricing, peak: () => { throw new Error('clock gone') } } as UsagePricing
  const problems: string[] = []
  assert.deepEqual(peakStatusItems(bent, 0, undefined, message => { problems.push(message) }), [])
  assert.equal(problems.length, 1)
})

test('the glm/quota entry mirrors the section\'s lines: the first is the text, the rest the detail', () => {
  const [item] = quotaStatusItems(['额度（服务端读数，含 ZCode 等其他客户端，读于 19:40）：max', '- 5 小时：已用 41% · 21:30 重置 · 不预估：读数不足'], Date.parse('2026-10-31T20:00:00+08:00'))
  assert.deepEqual(item, {
    id: 'glm/quota',
    owner: 'glm',
    audience: 'agent',
    asOf: '2026-10-31T12:00:00.000Z',
    source: QUOTA_SOURCE,
    text: '额度（服务端读数，含 ZCode 等其他客户端，读于 19:40）：max',
    detail: ['- 5 小时：已用 41% · 21:30 重置 · 不预估：读数不足'],
  })
  const [one] = quotaStatusItems(['额度：正在读取，稍后再看'], 0)
  assert.equal(one?.detail, undefined)
  assert.deepEqual(quotaStatusItems([], 0), [])
})
