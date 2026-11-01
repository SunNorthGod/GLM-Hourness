/**
 * The shared half of the quota contract (docs/ORCHESTRATION.md §11.3, §11.4):
 * the moment words, the peak line, the quota section, the low-quota test,
 * the login line, and the readers of the three optional members of the
 * pricing service. Pure functions; the channel package's reader of the
 * server is tested in tests/glm-quota.spec.ts.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { mintRejectionOf, upstreamLimitOf } from '../src/glm-llm/account-signals.ts'
import { creditPricing, rateShareAt } from '../src/glm-llm/credits.ts'
import { GLM_LOOP_DEFAULTS } from '../src/glm-llm/loop-defaults.ts'
import { nameWindows, parseQuotaBody, type QuotaLimitRow } from '../src/glm-llm/quota-parse.ts'
import { projectWindow, samePeriod, type WindowPoint, type WindowState } from '../src/glm-llm/quota-projection.ts'
import { loopDefaultsOf, type ChannelLoopDefault, type ChannelTrigger } from '../src/shared/channel-loop.ts'
import { peakHoursOf, quotaOf, type UsagePricing } from '../src/shared/pricing.ts'
import {
  formatMoment, loginLine, peakLine, quotaLines, quotaLowLine, quotaLowOf,
  type LoginView, type MomentZone, type QuotaBasis, type QuotaLowRule, type QuotaProjection, type QuotaReading, type QuotaRequest, type QuotaView, type QuotaWindowName, type QuotaWindowView,
} from '../src/shared/quota.ts'

const at = (iso: string): number => Date.parse(iso)
const ZONE: MomentZone = { offsetMinutes: 480 }
const MINUTE_MS = 60_000

// 2026-10-28 is a Wednesday; the GLM credit plan's peak is 14:00-18:00 UTC+8 on weekdays.
const NOW = at('2026-10-28T17:02:00+08:00')
const RESET = at('2026-10-28T21:30:00+08:00')
const RECENT: QuotaBasis = { kind: 'recent', from: at('2026-10-28T16:35:00+08:00'), to: NOW }
const SINCE_MONDAY: QuotaBasis = { kind: 'window', since: at('2026-10-26T10:00:00+08:00'), includesNights: true }

test('formatMoment: the same day is a clock, the next day says tomorrow, two to six days ahead name the weekday, the rest is a date', () => {
  const now = NOW
  const words = (iso: string): string => formatMoment(at(iso), now, ZONE)
  assert.equal(words('2026-10-28T21:30:00+08:00'), '21:30')
  assert.equal(words('2026-10-28T09:05:00+08:00'), '09:05', 'earlier today is still the same day')
  assert.equal(words('2026-10-29T08:00:00+08:00'), '明天 08:00')
  assert.equal(words('2026-10-30T10:00:00+08:00'), '周五 10:00', 'two days ahead')
  assert.equal(words('2026-11-02T10:00:00+08:00'), '周一 10:00', 'five days ahead')
  assert.equal(words('2026-11-03T10:00:00+08:00'), '周二 10:00', 'six days ahead')
  assert.equal(words('2026-11-01T10:00:00+08:00'), '周日 10:00')
  assert.equal(words('2026-11-04T10:00:00+08:00'), '11-04 10:00', 'seven days ahead is a date')
  assert.equal(words('2026-10-27T17:30:00+08:00'), '10-27 17:30', 'yesterday is a date')
  assert.equal(words('2026-01-05T08:09:00+08:00'), '01-05 08:09', 'month and day are padded')
  assert.equal(formatMoment(at('2026-10-29T00:10:00+08:00'), at('2026-10-28T23:30:00+08:00'), ZONE), '明天 00:10', 'midnight moves the day')
})

test('formatMoment: "tomorrow" is counted in the display zone, not in the zone of the machine', () => {
  const now = at('2026-10-28T23:30:00+08:00') // 10:30 on 10-28 at UTC-5
  const target = at('2026-10-29T02:00:00+08:00') // 13:00 on 10-28 at UTC-5
  assert.equal(formatMoment(target, now, { offsetMinutes: 480 }), '明天 02:00')
  assert.equal(formatMoment(target, now, { offsetMinutes: -300 }), '13:00')
})

test('formatMoment: without an offset it uses the host offset at that instant', () => {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const target = new Date(NOW)
  assert.equal(formatMoment(NOW, NOW), `${pad(target.getHours())}:${pad(target.getMinutes())}`)
  assert.equal(formatMoment(NOW, NOW, {}), `${pad(target.getHours())}:${pad(target.getMinutes())}`)
})

test('peakLine: the six moments of the peak line, built on the GLM plan and nextPeakChange', () => {
  const plan = creditPricing.plan
  const line = (iso: string): string => peakLine(plan, atMs => creditPricing.peak(atMs), at(iso), ZONE)
  assert.equal(line('2026-10-28T13:59:00+08:00'), '高峰：不是高峰；下一个高峰 14:00（GLM 积分套餐）')
  assert.equal(line('2026-10-28T14:00:00+08:00'), '高峰：高峰中，到 18:00（GLM 积分套餐）')
  assert.equal(line('2026-10-28T17:59:00+08:00'), '高峰：高峰中，到 18:00（GLM 积分套餐）')
  assert.equal(line('2026-10-28T18:00:00+08:00'), '高峰：不是高峰；下一个高峰 明天 14:00（GLM 积分套餐）')
  assert.equal(line('2026-10-30T18:00:00+08:00'), '高峰：不是高峰；下一个高峰 周一 14:00（GLM 积分套餐）', 'Friday evening')
  assert.equal(line('2026-10-31T15:00:00+08:00'), '高峰：不是高峰；下一个高峰 周一 14:00（GLM 积分套餐）', 'Saturday')
})

test('peakLine: a plan without a change within the horizon names only the state; the plan words come from the service', () => {
  assert.equal(peakLine('某套餐', () => true, NOW, ZONE), '高峰：高峰中（某套餐）')
  assert.equal(peakLine('某套餐', () => false, NOW, ZONE), '高峰：不是高峰（某套餐）')
})

const windowOf = (name: QuotaWindowName, label: string, usedPercent: number | undefined, resetAt: number | undefined, projection: QuotaProjection): QuotaWindowView => ({
  name,
  label,
  ...(usedPercent === undefined ? {} : { usedPercent }),
  ...(resetAt === undefined ? {} : { resetAt }),
  projection,
})
const fiveHour = (usedPercent: number | undefined, projection: QuotaProjection): QuotaWindowView => windowOf('five-hour', '5 小时', usedPercent, RESET, projection)
const weekly = (usedPercent: number | undefined, projection: QuotaProjection): QuotaWindowView => windowOf('weekly', '每周', usedPercent, at('2026-11-02T10:00:00+08:00'), projection)
const NO_ESTIMATE: QuotaProjection = { kind: 'none', reason: '' }
const OK: LoginView = { state: 'ok' }
/** A pricing service without any of the three members of the quota contract. */
const PLAIN: UsagePricing = { basis: '口径', plan: '套餐', charged: () => 1, peak: () => false }

const readingOf = (windows: readonly QuotaWindowView[]): QuotaReading => ({ at: NOW, level: 'pro', windows })

function viewOf(windows: readonly QuotaWindowView[], rest: Partial<QuotaView> = {}): QuotaView {
  return { reading: readingOf(windows), login: OK, pending: false, ...rest }
}

test('quotaLines: the section of the status command for a normal reading', () => {
  const view = viewOf([
    fiveHour(41, { kind: 'at-reset', percent: 75, basis: RECENT }),
    weekly(63, { kind: 'at-reset', percent: 97, basis: SINCE_MONDAY }),
    windowOf('mcp', 'MCP 工具调用', 4, at('2026-11-02T08:00:00+08:00'), NO_ESTIMATE),
  ])
  assert.deepEqual(quotaLines(view, NOW, ZONE), [
    '额度（服务端读数，含 ZCode 等其他客户端，读于 17:02）：pro',
    '- 5 小时：已用 41% · 21:30 重置 · 到重置时约 75%，按 16:35–17:02 两次读数的速度',
    '- 每周：已用 63% · 周一 10:00 重置 · 到重置时约 97%，按本窗口 10-26 10:00 以来的平均速度（含夜间，偏低）',
    '- MCP 工具调用：已用 4% · 周一 08:00 重置',
  ])
})

test('quotaLines: each projection has its words, the basis on the same line, and a window without a level or reset still reads', () => {
  const lines = quotaLines({ reading: { at: NOW, windows: [
    fiveHour(85, { kind: 'exhausts', at: at('2026-10-28T20:40:00+08:00'), basis: RECENT }),
    fiveHour(100, { kind: 'spent' }),
    fiveHour(41, { kind: 'idle', basis: RECENT }),
    windowOf('window', '额度窗口', 10, undefined, { kind: 'none', reason: '没有重置时刻' }),
    windowOf('other', 'SOME_LIMIT', undefined, undefined, NO_ESTIMATE),
    weekly(30, { kind: 'at-reset', percent: 59.6, basis: { kind: 'window', since: at('2026-10-26T10:00:00+08:00'), includesNights: false } }),
  ] }, login: OK, pending: false }, NOW, ZONE)
  assert.deepEqual(lines, [
    '额度（服务端读数，含 ZCode 等其他客户端，读于 17:02）',
    '- 5 小时：已用 85% · 21:30 重置 · 预计 20:40 用完，按 16:35–17:02 两次读数的速度',
    '- 5 小时：已用完 · 21:30 重置',
    '- 5 小时：已用 41% · 21:30 重置 · 最近没有消耗，按 16:35–17:02 两次读数的速度',
    '- 额度窗口：已用 10% · 不预估：没有重置时刻',
    '- SOME_LIMIT：已用比例未知',
    '- 每周：已用 30% · 周一 10:00 重置 · 到重置时约 60%，按本窗口 10-26 10:00 以来的平均速度',
  ])
})

test('quotaLines: a share of 100 or more reads as spent whatever the projection says', () => {
  const lines = quotaLines(viewOf([windowOf('mcp', 'MCP 工具调用', 100, at('2026-11-02T08:00:00+08:00'), NO_ESTIMATE)]), NOW, ZONE)
  assert.equal(lines[1], '- MCP 工具调用：已用完 · 周一 08:00 重置')
})

test('quotaLines: no reading, a failure, a pending read and an upstream limit each say so; nothing else is added', () => {
  const none: QuotaView = { login: OK, pending: false }
  assert.deepEqual(quotaLines(none, NOW, ZONE), ['额度：还没有读数'])
  assert.deepEqual(quotaLines({ ...none, pending: true }, NOW, ZONE), ['额度：正在读取，稍后再看'])
  const failure = { at: at('2026-10-28T17:01:00+08:00'), reason: 'network', text: '额度：读不到（网络错误）' }
  assert.deepEqual(quotaLines({ ...none, failure }, NOW, ZONE), ['额度：读不到（网络错误）'])
  const withReading = quotaLines(viewOf([fiveHour(41, NO_ESTIMATE)], { failure, pending: true }), NOW, ZONE)
  assert.deepEqual(withReading, [
    '额度：读不到（网络错误）',
    '额度（服务端读数，含 ZCode 等其他客户端，读于 17:02）：pro',
    '- 5 小时：已用 41% · 21:30 重置',
    '额度：正在读取，稍后再看',
  ], 'the last reading stays, with the time it was read')
  assert.deepEqual(quotaLines({ ...none, limited: { at: NOW, code: '1308', until: RESET } }, NOW, ZONE), ['额度已用完（服务端 1308），预计 21:30 恢复'])
  assert.deepEqual(quotaLines({ ...none, limited: { at: NOW, code: '1308' } }, NOW, ZONE), ['额度已用完（服务端 1308）'])
})

test('quotaLines: a rejected login is the first line, with the path it was rejected on; ok and absent add nothing', () => {
  const base = viewOf([fiveHour(41, NO_ESTIMATE)])
  const since = at('2026-10-28T17:40:00+08:00')
  const first = (login: LoginView): string | undefined => quotaLines({ ...base, login }, NOW, ZONE)[0]
  assert.equal(first({ state: 'rejected', since, path: 'model' }), '登录：被拒（17:40，模型请求在重新取令牌之后仍被拒），运行 /glm-login')
  assert.equal(first({ state: 'rejected', since, path: 'mint' }), '登录：被拒（17:40，取令牌时被拒），运行 /glm-login')
  assert.equal(first({ state: 'rejected', since }), '登录：被拒（17:40），运行 /glm-login')
  assert.equal(first({ state: 'rejected' }), '登录：被拒，运行 /glm-login')
  assert.equal(first({ state: 'absent' }), quotaLines(base, NOW, ZONE)[0])
  assert.equal(first(OK), quotaLines(base, NOW, ZONE)[0])
  assert.equal(quotaLines({ ...base, login: { state: 'rejected', since } }, NOW, ZONE).length, quotaLines(base, NOW, ZONE).length + 1)
})

test('loginLine: the line the loop board hands to the main agent', () => {
  const since = at('2026-10-28T17:40:00+08:00')
  assert.equal(loginLine({ state: 'rejected', since, path: 'model' }, NOW, ZONE), 'GLM 登录在 17:40 被服务端拒绝，GLM 的请求会失败；运行 /glm-login 重新登录')
  assert.equal(loginLine({ state: 'rejected' }, NOW, ZONE), 'GLM 登录被服务端拒绝，GLM 的请求会失败；运行 /glm-login 重新登录')
  assert.equal(loginLine({ state: 'absent' }, NOW, ZONE), 'GLM 未登录；运行 /glm-login 登录')
  assert.equal(loginLine(OK, NOW, ZONE), 'GLM 登录正常')
})

const RULE: QuotaLowRule = { usedPercent: 80, exhaustsWithinMinutes: 60 }
const exhaustsIn = (minutes: number): QuotaProjection => ({ kind: 'exhausts', at: NOW + minutes * MINUTE_MS, basis: RECENT })

test('quotaLowOf: the five-hour window by share, by projection, and not at the edges', () => {
  const low = (...windows: QuotaWindowView[]): QuotaWindowView | undefined => quotaLowOf(viewOf(windows), RULE, NOW)
  assert.equal(low(fiveHour(79, NO_ESTIMATE)), undefined, '79% without a projection')
  const eighty = fiveHour(80, NO_ESTIMATE)
  assert.equal(low(eighty), eighty, '80%')
  const soon = fiveHour(79, exhaustsIn(50))
  assert.equal(low(soon), soon, '79% that runs out in 50 minutes')
  const edge = fiveHour(10, exhaustsIn(60))
  assert.equal(low(edge), edge, 'exactly at the limit counts')
  assert.equal(low(fiveHour(79, exhaustsIn(70))), undefined, '79% that runs out in 70 minutes')
  assert.equal(low(fiveHour(79, { kind: 'at-reset', percent: 99, basis: RECENT })), undefined, 'a projection that reaches the reset does not count')
  const spent = fiveHour(undefined, { kind: 'spent' })
  assert.equal(low(spent), spent, 'spent counts')
})

test('quotaLowOf: the MCP window and unnamed windows never count; the higher share of two wins, the first on a tie; no reading is none', () => {
  const low = (...windows: QuotaWindowView[]): QuotaWindowView | undefined => quotaLowOf(viewOf(windows), RULE, NOW)
  assert.equal(low(windowOf('mcp', 'MCP 工具调用', 95, RESET, NO_ESTIMATE)), undefined)
  assert.equal(low(windowOf('window', '额度窗口', 99, RESET, NO_ESTIMATE), windowOf('other', 'X', 99, RESET, NO_ESTIMATE)), undefined)
  const week = weekly(90, NO_ESTIMATE)
  assert.equal(low(fiveHour(85, NO_ESTIMATE), week), week)
  const five = fiveHour(85, NO_ESTIMATE)
  assert.equal(low(five, weekly(85, NO_ESTIMATE)), five, 'a tie goes to the first')
  const weekSoon = weekly(79, exhaustsIn(10))
  const fiveEighty = fiveHour(80, NO_ESTIMATE)
  assert.equal(low(fiveEighty, weekSoon), fiveEighty, 'a window that qualifies by projection counts with its used share')
  const spentWeek = weekly(undefined, { kind: 'spent' })
  assert.equal(low(fiveHour(85, NO_ESTIMATE), spentWeek), spentWeek, 'a spent window has the highest share')
  assert.equal(quotaLowOf({ login: OK, pending: false }, RULE, NOW), undefined)
})

test('quotaLowLine: the line the loop board hands to the main agent', () => {
  const line = (window: QuotaWindowView): string => quotaLowLine(window, NOW, ZONE)
  assert.equal(line(fiveHour(85, exhaustsIn(98))), '5 小时额度已用 85%，21:30 重置，预计 18:40 用完')
  assert.equal(line(fiveHour(80, NO_ESTIMATE)), '5 小时额度已用 80%，21:30 重置')
  assert.equal(line(fiveHour(100, { kind: 'spent' })), '5 小时额度已用完，21:30 重置')
  assert.equal(line(weekly(90, { kind: 'at-reset', percent: 99, basis: SINCE_MONDAY })), '每周额度已用 90%，周一 10:00 重置')
  assert.equal(line(windowOf('five-hour', '5 小时', 79, undefined, exhaustsIn(50))), '5 小时额度已用 79%，预计 17:52 用完')
  assert.equal(line(windowOf('five-hour', '5 小时', undefined, RESET, exhaustsIn(50))), '5 小时额度，21:30 重置，预计 17:52 用完')
})

test('peakHoursOf: two single-line strings of 1 to 80 characters read; anything else reads as none, and only a wrong type is reported', () => {
  const problems: string[] = []
  const problem = (message: string): void => { problems.push(message) }
  const read = (peakHours: unknown): ReturnType<typeof peakHoursOf> => peakHoursOf({ ...PLAIN, peakHours } as unknown as UsagePricing, problem)
  assert.deepEqual(read({ en: 'weekdays 14:00-18:00 UTC+8', zh: '工作日 14:00–18:00（UTC+8）' }), { en: 'weekdays 14:00-18:00 UTC+8', zh: '工作日 14:00–18:00（UTC+8）' })
  assert.deepEqual(read({ en: 'a', zh: 'b'.repeat(80), extra: 1 }), { en: 'a', zh: 'b'.repeat(80) }, 'the bounds are inclusive and other members are dropped')
  assert.equal(peakHoursOf(PLAIN, problem), undefined, 'a plan without the member')
  assert.equal(read(undefined), undefined)
  assert.deepEqual(problems, [], 'a missing member reports nothing')
  for (const bad of [{ en: '', zh: 'x' }, { en: 'x', zh: '' }, { en: 'x'.repeat(81), zh: 'x' }, { en: 'x', zh: 'x'.repeat(81) }, { en: 'a\nb', zh: 'x' }, { en: 'x', zh: 'a\rb' }]) assert.equal(read(bad), undefined, JSON.stringify(bad).slice(0, 40))
  assert.deepEqual(problems, [], 'too short, too long and several lines read as none without a report')
  for (const [index, wrong] of [null, 'weekdays', 5, [], { en: 'x' }, { en: 'x', zh: 5 }, { en: 1, zh: 'x' }].entries()) {
    assert.equal(read(wrong), undefined)
    assert.equal(problems.length, index + 1, `wrong type ${JSON.stringify(wrong)} is reported once`)
  }
  assert.match(problems[0] ?? '', /^glmHournessPricing peakHours has the wrong shape/)
})

test('quotaOf: a function reads and is called on the service; absent reads as none; another type reads as none and is reported once', async () => {
  const problems: string[] = []
  const problem = (message: string): void => { problems.push(message) }
  const seen: Array<{ self: unknown, request: QuotaRequest | undefined }> = []
  const view: QuotaView = { login: OK, pending: false }
  const service: UsagePricing = {
    ...PLAIN,
    quota(request?: QuotaRequest): Promise<QuotaView> {
      seen.push({ self: this, request })
      return Promise.resolve(view)
    },
  }
  const read = quotaOf(service, problem)
  assert.ok(read !== undefined)
  assert.equal(await read({ waitMs: 3000 }), view)
  assert.equal(await read(), view)
  assert.deepEqual(seen, [{ self: service, request: { waitMs: 3000 } }, { self: service, request: undefined }])
  assert.equal(quotaOf(PLAIN, problem), undefined)
  assert.deepEqual(problems, [])
  assert.equal(quotaOf({ ...PLAIN, quota: 'later' } as unknown as UsagePricing, problem), undefined)
  assert.equal(problems.length, 1)
  assert.match(problems[0] ?? '', /^glmHournessPricing quota is not a function/)
})

const entry = (id: string, rest: Partial<ChannelLoopDefault> = {}): ChannelLoopDefault => ({ id, title: '标题', why: '原因', when: { kind: 'peak-start' }, runBy: 'channel', ...rest })
const QUOTA_LOW: ChannelTrigger = { kind: 'quota-low', usedPercent: 80, exhaustsWithinMinutes: 60, afterUsageMinutes: 15 }
const VALID: readonly ChannelLoopDefault[] = [
  entry('glm:peak-reminder'),
  entry('glm:quota-on-command', { when: { kind: 'command', names: ['glm-status', 'hourness'] } }),
  entry('glm:quota-low', { when: QUOTA_LOW, runBy: 'loop-board', tell: 'Tell the human: "{line}".' }),
  entry('glm:login-rejected', { when: { kind: 'login-rejected' }, runBy: 'loop-board', tell: 'Tell the human: "{line}".' }),
]

function readLoopDefaults(loopDefaults: unknown): { entries: readonly ChannelLoopDefault[], problems: string[] } {
  const problems: string[] = []
  const entries = loopDefaultsOf({ ...PLAIN, loopDefaults } as unknown as UsagePricing, message => { problems.push(message) })
  return { entries, problems }
}

test('loopDefaultsOf: valid entries read in order; a plan without the member reads as none without a report; a channel entry keeps no notice text', () => {
  assert.deepEqual(readLoopDefaults(VALID), { entries: VALID, problems: [] })
  assert.deepEqual(readLoopDefaults(undefined), { entries: [], problems: [] })
  assert.deepEqual(loopDefaultsOf(PLAIN), [])
  const stray = readLoopDefaults([{ ...entry('glm:a'), tell: 'ignored', extra: 1 }])
  assert.deepEqual(stray, { entries: [entry('glm:a')], problems: [] })
  assert.equal('tell' in (stray.entries[0] ?? {}), false)
})

test('loopDefaultsOf: a value that is not an array reads as none and is reported once', () => {
  for (const wrong of [null, 'glm:a', { length: 1 }, 5]) {
    const { entries, problems } = readLoopDefaults(wrong)
    assert.deepEqual(entries, [])
    assert.equal(problems.length, 1, JSON.stringify(wrong))
    assert.match(problems[0] ?? '', /^glmHournessPricing loopDefaults is not an array/)
  }
})

test('loopDefaultsOf: an entry that breaks a rule is dropped and reported once by its id; the others read', () => {
  const trigger = QUOTA_LOW
  const code = (count: number): string => '🙂'.repeat(count)
  const broken: Array<[string, unknown]> = [
    ['Bad Id', entry('Bad Id')],
    ['nochannel', entry('nochannel')],
    ['glm:UPPER', entry('glm:UPPER')],
    ['aaaaaaaaaaaaaaaaa:x', entry('aaaaaaaaaaaaaaaaa:x')],
    ['glm:no-tell', entry('glm:no-tell', { runBy: 'loop-board' })],
    ['glm:empty-tell', entry('glm:empty-tell', { runBy: 'loop-board', tell: '' })],
    ['glm:long-tell', entry('glm:long-tell', { runBy: 'loop-board', tell: 'x'.repeat(401) })],
    ['glm:long-title', entry('glm:long-title', { title: code(61) })],
    ['glm:empty-title', entry('glm:empty-title', { title: '' })],
    ['glm:long-why', entry('glm:long-why', { why: code(151) })],
    ['glm:empty-why', entry('glm:empty-why', { why: '' })],
    ['glm:bad-runby', { ...entry('glm:bad-runby'), runBy: 'someone' }],
    ['glm:bad-kind', { ...entry('glm:bad-kind'), when: { kind: 'peak-end' } }],
    ['glm:no-when', { ...entry('glm:no-when'), when: undefined }],
    ['glm:names-empty', entry('glm:names-empty', { when: { kind: 'command', names: [] } })],
    ['glm:names-many', entry('glm:names-many', { when: { kind: 'command', names: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] } })],
    ['glm:names-type', { ...entry('glm:names-type'), when: { kind: 'command', names: [1] } }],
    ['glm:used-0', { ...entry('glm:used-0'), when: { ...trigger, usedPercent: 0 } }],
    ['glm:used-101', { ...entry('glm:used-101'), when: { ...trigger, usedPercent: 101 } }],
    ['glm:within-0', { ...entry('glm:within-0'), when: { ...trigger, exhaustsWithinMinutes: 0 } }],
    ['glm:within-1441', { ...entry('glm:within-1441'), when: { ...trigger, exhaustsWithinMinutes: 1441 } }],
    ['glm:after-0', { ...entry('glm:after-0'), when: { ...trigger, afterUsageMinutes: 0 } }],
    ['glm:after-1441', { ...entry('glm:after-1441'), when: { ...trigger, afterUsageMinutes: 1441 } }],
    ['glm:after-nan', { ...entry('glm:after-nan'), when: { ...trigger, afterUsageMinutes: Number.NaN } }],
    ['glm:used-missing', { ...entry('glm:used-missing'), when: { kind: 'quota-low', exhaustsWithinMinutes: 60, afterUsageMinutes: 15 } }],
  ]
  for (const [id, bad] of broken) {
    const { entries, problems } = readLoopDefaults([VALID[0], bad, VALID[1]])
    assert.deepEqual(entries, [VALID[0], VALID[1]], id)
    assert.equal(problems.length, 1, id)
    assert.ok((problems[0] ?? '').includes(`"${id}"`), `${id}: ${problems[0] ?? ''}`)
  }
  // The limits themselves are inclusive, and the title and the reason count code points.
  const edges = [
    entry('glm:edge-title', { title: code(60), why: code(150) }),
    entry('glm:edge-quota', { when: { kind: 'quota-low', usedPercent: 100, exhaustsWithinMinutes: 1440, afterUsageMinutes: 1 }, runBy: 'loop-board', tell: 'x'.repeat(400) }),
    entry('glm:edge-low', { when: { kind: 'quota-low', usedPercent: 1, exhaustsWithinMinutes: 1, afterUsageMinutes: 1440 } }),
    entry('glm:edge-names', { when: { kind: 'command', names: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] } }),
    entry('a'.repeat(16) + ':' + 'b'.repeat(48)),
  ]
  assert.deepEqual(readLoopDefaults(edges), { entries: edges, problems: [] })
})

test('loopDefaultsOf: an entry that is not an object is reported by its place; a repeated id keeps the first; entries past the sixteenth are dropped with one report', () => {
  const place = readLoopDefaults([VALID[0], null, 'glm:a', [], VALID[1]])
  assert.deepEqual(place.entries, [VALID[0], VALID[1]])
  assert.equal(place.problems.length, 3)
  for (const [index, problem] of place.problems.entries()) assert.ok(problem.includes(`#${index + 2}`), `entry ${index + 2}: ${problem}`)

  const first = entry('glm:same', { title: '第一条' })
  const repeated = readLoopDefaults([first, entry('glm:same', { title: '第二条' }), VALID[0]])
  assert.deepEqual(repeated.entries, [first, VALID[0]])
  assert.equal(repeated.problems.length, 1)
  assert.ok((repeated.problems[0] ?? '').includes('"glm:same"'))

  const kept = readLoopDefaults([entry('glm:same', { title: '' }), entry('glm:same', { title: '好' })])
  assert.deepEqual(kept.entries, [entry('glm:same', { title: '好' })], 'a dropped entry does not take its id')

  const many = Array.from({ length: 17 }, (_, index) => entry(`glm:e${index}`))
  const capped = readLoopDefaults(many)
  assert.deepEqual(capped.entries, many.slice(0, 16))
  assert.equal(capped.problems.length, 1)
  assert.match(capped.problems[0] ?? '', /17 entries/)
  assert.deepEqual(readLoopDefaults(many.slice(0, 16)), { entries: many.slice(0, 16), problems: [] })
})

// The channel half of the quota contract, the pure part: the response text as rows,
// the names of the windows, and the projection (docs/DESIGN.md §4.3, §4.7). The
// reader that fetches and journals them is tested in tests/glm-quota.spec.ts.

const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const READ_AT = at('2026-10-28T17:02:00+08:00')
const bodyOf = (limits: unknown[], rest: Record<string, unknown> = {}): string => JSON.stringify({ code: 200, success: true, data: { level: 'max', limits }, ...rest })
const rowsOf = (text: string): readonly QuotaLimitRow[] => {
  const parsed = parseQuotaBody(text, READ_AT)
  assert.ok(parsed.ok, JSON.stringify(parsed))
  return parsed.limits
}
const refusalOf = (text: string): { reason: string, text: string } => {
  const parsed = parseQuotaBody(text, READ_AT)
  assert.ok(!parsed.ok, 'the response is not read as rows')
  return { reason: parsed.reason, text: parsed.text }
}

/** The three rows of the real reading zcode-api recorded on 2026-10-12 (max plan), with reset times moved to be ahead of READ_AT. */
const REAL_ROWS = [
  { type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 41, nextResetTime: READ_AT + 3 * HOUR_MS },
  { type: 'TIME_LIMIT', unit: 5, number: 1, usage: 1000, currentValue: 40, remaining: 3836, percentage: 4, nextResetTime: READ_AT + 5 * DAY_MS, usageDetails: [{ modelCode: 'search-prime', usage: 3 }] },
  { type: 'TOKENS_LIMIT', unit: 6, number: 1, percentage: 63, nextResetTime: READ_AT + 4 * DAY_MS },
]

test('parseQuotaBody: the three-row reading of zcode-api reads in full; unit, number-as-total and usageDetails are not kept; the windows are named by how long they run', () => {
  const parsed = parseQuotaBody(bodyOf(REAL_ROWS), READ_AT)
  assert.ok(parsed.ok)
  assert.equal(parsed.level, 'max')
  assert.equal(parsed.dropped, 0)
  assert.deepEqual(parsed.limits[1], { type: 'TIME_LIMIT', number: 1, usage: 1000, currentValue: 40, remaining: 3836, percentage: 4, nextResetTime: READ_AT + 5 * DAY_MS })
  assert.ok(parsed.limits.every(row => !('unit' in row) && !('usageDetails' in row)))
  assert.deepEqual(nameWindows(parsed.limits, READ_AT, ZONE).map(({ name, label }) => [name, label]), [['five-hour', '5 小时'], ['mcp', 'MCP 工具调用'], ['weekly', '每周']])
})

test('parseQuotaBody: a reset time in seconds is read as seconds, one in milliseconds as it is, and one far outside the week of the reading is dropped', () => {
  const reset = READ_AT + 2 * HOUR_MS
  const read = (nextResetTime: number): QuotaLimitRow | undefined => rowsOf(bodyOf([{ type: 'TOKENS_LIMIT', percentage: 10, nextResetTime }]))[0]
  assert.equal(read(reset / 1000)?.nextResetTime, reset)
  assert.equal(read(reset)?.nextResetTime, reset)
  assert.equal(read(READ_AT - DAY_MS - 1000)?.nextResetTime, undefined, 'more than a day back')
  assert.equal(read(READ_AT + 46 * DAY_MS)?.nextResetTime, undefined, 'more than 45 days ahead')
  assert.equal(read(READ_AT + 44 * DAY_MS)?.nextResetTime, READ_AT + 44 * DAY_MS)
  assert.equal(read(READ_AT - 1000)?.nextResetTime, READ_AT - 1000, 'just passed is kept')
  assert.equal(read(READ_AT + 46 * DAY_MS)?.percentage, 10, 'a dropped time keeps the row')
})

test('parseQuotaBody: a share above 100 is kept as 100, a negative one and one that is not a finite number are dropped from the row; a row left with neither share nor remainder is dropped', () => {
  const read = (extra: Record<string, unknown>): QuotaLimitRow | undefined => rowsOf(bodyOf([{ type: 'TOKENS_LIMIT', remaining: 7, ...extra }, { type: 'TIME_LIMIT', percentage: 1 }]))[0]
  assert.equal(read({ percentage: 130 })?.percentage, 100)
  assert.equal(read({ percentage: 100 })?.percentage, 100)
  assert.equal(read({ percentage: 0 })?.percentage, 0)
  assert.equal(read({ percentage: -5 })?.percentage, undefined)
  assert.equal(read({ percentage: Number.NaN })?.percentage, undefined, 'NaN is null on the wire')
  assert.equal(read({ percentage: '50' })?.percentage, undefined)
  assert.equal(read({ percentage: -5 })?.remaining, 7, 'the row stays for its remainder')
  const only = parseQuotaBody(bodyOf([{ type: 'TOKENS_LIMIT', percentage: -5 }]), READ_AT)
  assert.deepEqual(only, { ok: false, reason: 'no-windows', text: '额度：服务端没有返回可识别的窗口', keys: ['type', 'percentage'] })
})

test('parseQuotaBody: an unknown type is kept under its own name; a row without a usable type or without numbers is dropped and counted, with the names of its keys', () => {
  const parsed = parseQuotaBody(bodyOf([
    { type: 'WEEKLY_PROMPTS', percentage: 12 },
    { type: '', percentage: 1 },
    { type: 7, percentage: 1 },
    { type: 'x'.repeat(65), percentage: 1 },
    { type: 'NO_NUMBERS', label: 'text only' },
    'a string',
    null,
    { type: 'TOKENS_LIMIT', percentage: 5 },
  ]), READ_AT)
  assert.ok(parsed.ok)
  assert.deepEqual(parsed.limits.map(row => row.type), ['WEEKLY_PROMPTS', 'TOKENS_LIMIT'])
  assert.equal(parsed.dropped, 6)
  assert.deepEqual(parsed.keys, ['type', 'percentage', 'label'])
  assert.deepEqual(nameWindows(parsed.limits, READ_AT).map(({ name, label }) => [name, label]), [['other', 'WEEKLY_PROMPTS'], ['window', '额度窗口']])
})

test('parseQuotaBody: at most 32 rows are read; the rest are counted as dropped', () => {
  const rows = Array.from({ length: 40 }, (_, index) => ({ type: `T${index}`, percentage: index }))
  const parsed = parseQuotaBody(bodyOf(rows), READ_AT)
  assert.ok(parsed.ok)
  assert.equal(parsed.limits.length, 32)
  assert.equal(parsed.limits.at(-1)?.type, 'T31')
  assert.equal(parsed.dropped, 8)
})

test('parseQuotaBody: the level is kept trimmed, one to 32 characters', () => {
  const level = (value: unknown): string | undefined => {
    const parsed = parseQuotaBody(JSON.stringify({ code: 200, data: { level: value, limits: [{ type: 'TOKENS_LIMIT', percentage: 1 }] } }), READ_AT)
    return parsed.ok ? parsed.level : 'unread'
  }
  assert.equal(level('  pro '), 'pro')
  assert.equal(level('x'.repeat(32)), 'x'.repeat(32))
  assert.equal(level('x'.repeat(33)), undefined)
  assert.equal(level('   '), undefined)
  assert.equal(level(5), undefined)
})

test('parseQuotaBody: the envelope succeeds without a code, with 0 or 200 (as a number or a numeric string) unless success is false; anything else is a refusal named by its code', () => {
  const limits = [{ type: 'TOKENS_LIMIT', percentage: 1 }]
  const succeeds = (envelope: Record<string, unknown>): boolean => parseQuotaBody(JSON.stringify({ data: { limits }, ...envelope }), READ_AT).ok
  assert.ok(succeeds({}))
  assert.ok(succeeds({ code: null }))
  assert.ok(succeeds({ code: 0 }))
  assert.ok(succeeds({ code: 200, success: true }))
  assert.ok(succeeds({ code: '200' }))
  assert.ok(!succeeds({ code: 200, success: false }))
  assert.ok(!succeeds({ code: 1001 }))
  assert.ok(!succeeds({ code: 500 }))
  assert.ok(!succeeds({ code: {} }))
  assert.deepEqual(refusalOf(JSON.stringify({ code: 1001, msg: 'token\nexpired\u0007 ' })), { reason: 'envelope:1001', text: '额度：服务端拒绝（1001 token expired）' })
  assert.deepEqual(refusalOf(JSON.stringify({ code: '401', message: 'm'.repeat(200) })), { reason: 'envelope:401', text: `额度：服务端拒绝（401 ${'m'.repeat(80)}）` })
  assert.deepEqual(refusalOf(JSON.stringify({ success: false })), { reason: 'envelope:unsuccessful', text: '额度：服务端拒绝（unsuccessful）' })
  assert.deepEqual(refusalOf(JSON.stringify({ code: {}, msg: 'x' })), { reason: 'envelope:invalid', text: '额度：服务端拒绝（invalid x）' })
})

test('parseQuotaBody: text that is not a JSON object is a refusal; a successful envelope whose data has no rows is no-windows', () => {
  assert.deepEqual(refusalOf('<html>bad gateway</html>'), { reason: 'envelope:not-json', text: '额度：服务端拒绝（not-json）' })
  assert.deepEqual(refusalOf(''), { reason: 'envelope:not-json', text: '额度：服务端拒绝（not-json）' })
  assert.deepEqual(refusalOf('[1,2]'), { reason: 'envelope:not-json', text: '额度：服务端拒绝（not-json）' })
  assert.deepEqual(refusalOf('7'), { reason: 'envelope:not-json', text: '额度：服务端拒绝（not-json）' })
  for (const data of [undefined, null, 'x', [], {}, { limits: 'x' }, { limits: [] }, { limits: {} }]) {
    assert.equal(refusalOf(JSON.stringify({ code: 200, data })).reason, 'no-windows', JSON.stringify(data))
  }
})

test('nameWindows: one row of each class is named by its time to the reset, the five-hour edge is two minutes past five hours', () => {
  const name = (...resets: Array<number | undefined>): string[] => nameWindows(resets.map(nextResetTime => ({ type: 'TOKENS_LIMIT', percentage: 1, ...(nextResetTime === undefined ? {} : { nextResetTime }) })), READ_AT, ZONE).map(window => window.name)
  assert.deepEqual(name(READ_AT + HOUR_MS, READ_AT + 3 * DAY_MS), ['five-hour', 'weekly'])
  assert.deepEqual(name(READ_AT + 3 * DAY_MS, READ_AT + HOUR_MS), ['weekly', 'five-hour'], 'by the time to the reset, not by the order of the rows')
  assert.deepEqual(name(READ_AT + HOUR_MS), ['five-hour'])
  assert.deepEqual(name(READ_AT + 3 * DAY_MS), ['weekly'])
  assert.deepEqual(name(READ_AT + 5 * HOUR_MS + 2 * MINUTE_MS), ['five-hour'])
  assert.deepEqual(name(READ_AT + 5 * HOUR_MS + 2 * MINUTE_MS + 1), ['weekly'])
  assert.deepEqual(name(READ_AT - HOUR_MS), ['five-hour'], 'a reset just passed is still the near window')
})

test('nameWindows: two rows that both reset within five hours, both after, or three rows are not guessed: each is an unnamed window with its reset clock', () => {
  const windows = (...resets: number[]): Array<[string, string]> => nameWindows(resets.map(nextResetTime => ({ type: 'TOKENS_LIMIT', percentage: 1, nextResetTime })), READ_AT, ZONE).map(window => [window.name, window.label])
  const soon = at('2026-10-28T21:30:00+08:00')
  assert.deepEqual(windows(soon, READ_AT + HOUR_MS), [['window', '额度窗口（21:30 重置）'], ['window', '额度窗口（18:02 重置）']])
  assert.deepEqual(windows(READ_AT + 2 * DAY_MS, READ_AT + 3 * DAY_MS).map(([name]) => name), ['window', 'window'])
  assert.deepEqual(windows(READ_AT + HOUR_MS, READ_AT + 2 * HOUR_MS, READ_AT + 3 * DAY_MS).map(([name]) => name), ['window', 'window', 'window'])
  assert.deepEqual(windows(READ_AT + HOUR_MS, READ_AT + 2 * DAY_MS, READ_AT + 3 * DAY_MS).map(([name]) => name), ['window', 'window', 'window'])
})

test('nameWindows: a TIME_LIMIT row is the MCP window, a TOKENS_LIMIT row without a reset time is an unnamed window, another type keeps its own name; none of them takes the place of a named window', () => {
  const rows: QuotaLimitRow[] = [
    { type: 'TIME_LIMIT', percentage: 4 },
    { type: 'TOKENS_LIMIT', percentage: 1 },
    { type: 'TOKENS_LIMIT', percentage: 2, nextResetTime: READ_AT + HOUR_MS },
    { type: 'TOKENS_LIMIT', percentage: 3, nextResetTime: READ_AT + 3 * DAY_MS },
    { type: 'PROMPT_LIMIT', percentage: 5 },
  ]
  assert.deepEqual(nameWindows(rows, READ_AT).map(({ name, label }) => [name, label]), [['mcp', 'MCP 工具调用'], ['window', '额度窗口'], ['five-hour', '5 小时'], ['weekly', '每周'], ['other', 'PROMPT_LIMIT']])
})

test('nameWindows: a CREDIT_LIMIT row is a token window like a TOKENS_LIMIT row; the real read of 2026-11-01 (an idle five-hour row without a reset time, a weekly row resetting in three days) names the weekly one and leaves the idle one unnamed', () => {
  // The fields and the types of the answer of bigmodel.cn to a credit plan (docs/FACTS.md §2.4); the numbers are made up.
  const creditRow = (unit: number, extra: Record<string, number>): Record<string, unknown> => ({ type: 'CREDIT_LIMIT', unit, number: unit === 3 ? 5 : 1, usage: 12000, currentValue: 3000, remaining: 9000, percentage: 25, ...extra })
  const idle = parseQuotaBody(bodyOf([creditRow(3, { percentage: 0 }), creditRow(6, { nextResetTime: READ_AT + 3 * DAY_MS })]), READ_AT)
  assert.ok(idle.ok)
  assert.deepEqual(nameWindows(idle.limits, READ_AT, ZONE).map(({ name, label }) => [name, label]), [['window', '额度窗口'], ['weekly', '每周']])
  const active = parseQuotaBody(bodyOf([creditRow(3, { nextResetTime: READ_AT + 2 * HOUR_MS }), creditRow(6, { nextResetTime: READ_AT + 3 * DAY_MS })]), READ_AT)
  assert.ok(active.ok)
  assert.deepEqual(nameWindows(active.limits, READ_AT, ZONE).map(({ name, label }) => [name, label]), [['five-hour', '5 小时'], ['weekly', '每周']])
  const mixed: QuotaLimitRow[] = [{ type: 'CREDIT_LIMIT', percentage: 1, nextResetTime: READ_AT + HOUR_MS }, { type: 'TOKENS_LIMIT', percentage: 2, nextResetTime: READ_AT + 3 * DAY_MS }]
  assert.deepEqual(nameWindows(mixed, READ_AT, ZONE).map(window => window.name), ['five-hour', 'weekly'])
})

// 2026-10-28 is a Wednesday: the plan's peak is 14:00-18:00 UTC+8, the rest of the day half price.
const wed = (clock: string): number => at(`2026-10-28T${clock}:00+08:00`)
const point = (clock: string, usedPercent: number): WindowPoint => ({ at: wed(clock), usedPercent })
const FIVE_HOUR_STATE = (usedPercent: number | undefined, resetAt: number | undefined): WindowState => ({ name: 'five-hour', ...(usedPercent === undefined ? {} : { usedPercent }), ...(resetAt === undefined ? {} : { resetAt }) })
const project = (state: WindowState, clock: string, earlier: readonly WindowPoint[]): QuotaProjection => projectWindow(state, wed(clock), earlier, rateShareAt)
const between = (from: string, to: string): QuotaBasis => ({ kind: 'recent', from: wed(from), to: wed(to) })

test('projectWindow: the worked example crosses 18:00 and is half price after it: 20% at 17:00 and 30% at 17:30 reach about 75% at the 21:30 reset', () => {
  assert.deepEqual(project(FIVE_HOUR_STATE(30, wed('21:30')), '17:30', [point('17:00', 20)]), { kind: 'at-reset', percent: 75, basis: between('17:00', '17:30') })
})

test('projectWindow: the share reaches 100 before the reset, at the minute it does; the speed is per full-price hour, so off-peak minutes count half', () => {
  // 30 points in half an hour at peak is 60 per hour: 80 at 18:00, then 30 per hour: 20 more takes 40 minutes.
  assert.deepEqual(project(FIVE_HOUR_STATE(50, wed('21:30')), '17:30', [point('17:00', 20)]), { kind: 'exhausts', at: wed('18:40'), basis: between('17:00', '17:30') })
  // 35 points in half an hour: 70 per hour, 90 at 18:00, 35 per hour after: 10 more takes 17 minutes and a bit, rounded down to the minute.
  assert.deepEqual(project(FIVE_HOUR_STATE(55, wed('21:30')), '17:30', [point('17:00', 20)]), { kind: 'exhausts', at: wed('18:17'), basis: between('17:00', '17:30') })
  // Reaching 100 exactly at 18:00 is 18:00, not a minute before.
  assert.deepEqual(project(FIVE_HOUR_STATE(60, wed('21:30')), '17:30', [point('17:00', 20)]), { kind: 'exhausts', at: wed('18:00'), basis: between('17:00', '17:30') })
})

test('projectWindow: a window already at 100 is spent, a window that did not move between the readings is idle, and a reset that has passed is about to reset', () => {
  assert.deepEqual(project(FIVE_HOUR_STATE(100, wed('21:30')), '17:30', [point('17:00', 90)]), { kind: 'spent' })
  assert.deepEqual(project(FIVE_HOUR_STATE(100, undefined), '17:30', []), { kind: 'spent' })
  assert.deepEqual(project(FIVE_HOUR_STATE(30, wed('21:30')), '17:30', [point('17:00', 30)]), { kind: 'idle', basis: between('17:00', '17:30') })
  assert.deepEqual(project(FIVE_HOUR_STATE(30, wed('17:29')), '17:30', [point('17:00', 20)]), { kind: 'none', reason: '即将重置' })
  assert.deepEqual(project(FIVE_HOUR_STATE(30, wed('17:30')), '17:30', [point('17:00', 20)]), { kind: 'none', reason: '即将重置' })
})

test('projectWindow: the speed comes from the earliest earlier reading 10 to 90 minutes back; closer or older readings are not used', () => {
  const late = FIVE_HOUR_STATE(50, wed('23:30'))
  // 40 points in the 90 minutes from 16:00, all at peak (1.5 full-price hours): 26.67 per hour, 63.33 at 18:00, then 13.33 per hour: 100 at 20:45.
  assert.deepEqual(project(late, '17:30', [point('16:00', 10), point('17:00', 40), point('17:20', 45)]), { kind: 'exhausts', at: wed('20:45'), basis: between('16:00', '17:30') }, 'the earliest in range, 90 minutes back')
  // 10 points in half an hour: 20 per hour, 60 at 18:00, then 10 per hour: 100 at 22:00.
  assert.deepEqual(project(late, '17:30', [point('17:00', 40), point('17:20', 45)]), { kind: 'exhausts', at: wed('22:00'), basis: between('17:00', '17:30') })
  // Readings 91 and 9 minutes back are out of range: the average since the window began at 16:30 (50 points in one peak hour), 75 at 18:00, then 25 per hour: 100 at 19:00.
  const reset = FIVE_HOUR_STATE(50, wed('21:30'))
  assert.deepEqual(project(reset, '17:30', [point('15:59', 10), point('17:21', 45)]), { kind: 'exhausts', at: wed('19:00'), basis: { kind: 'window', since: wed('16:30'), includesNights: false } })
})

test('projectWindow: a share that fell between the readings means the window was reset; the speed is then the average since the window began', () => {
  // The reading 30 minutes back was 60%, now 20%: five-hour window with a reset at 21:30 began at 16:30.
  const dropped = project(FIVE_HOUR_STATE(20, wed('21:30')), '17:30', [point('17:00', 60)])
  // 20 points in the one peak hour since 16:30 is 20 per full-price hour: +10 to 18:00, then 3.5 half-price hours (1.75 full-price) +35: 65 at the reset.
  assert.deepEqual(dropped, { kind: 'at-reset', percent: 65, basis: { kind: 'window', since: wed('16:30'), includesNights: false } })
})

test('projectWindow: the weekly window averages over seven days and says it includes the nights; the five-hour window does not', () => {
  const resetAt = at('2026-11-02T10:00:00+08:00')
  const week = projectWindow({ name: 'weekly', usedPercent: 30, resetAt }, wed('12:00'), [], rateShareAt)
  assert.equal(week.kind, 'at-reset')
  assert.deepEqual((week as { basis: QuotaBasis }).basis, { kind: 'window', since: at('2026-10-26T10:00:00+08:00'), includesNights: true })
})

test('projectWindow: without a second reading and a window to average, there is no estimate and the reason says why', () => {
  const none = (state: WindowState, earlier: readonly WindowPoint[] = []): QuotaProjection => project(state, '17:30', earlier)
  assert.deepEqual(none(FIVE_HOUR_STATE(0, wed('21:30'))), { kind: 'none', reason: '本窗口还没有消耗' })
  assert.deepEqual(none({ name: 'window', usedPercent: 10 }), { kind: 'none', reason: '没有重置时刻' })
  assert.deepEqual(none({ name: 'window', usedPercent: 10, resetAt: wed('21:30') }), { kind: 'none', reason: '读数不足' }, 'an unnamed window is never averaged')
  assert.deepEqual(none({ name: 'weekly', usedPercent: 10, resetAt: wed('17:00') }), { kind: 'none', reason: '即将重置' })
  assert.deepEqual(none({ name: 'weekly', usedPercent: 10, resetAt: wed('17:30') + 8 * DAY_MS }), { kind: 'none', reason: '读数不足' }, 'the window began after the reading')
  assert.deepEqual(none({ name: 'five-hour', resetAt: wed('21:30') }), { kind: 'none', reason: '没有已用比例' })
  assert.deepEqual(none({ name: 'mcp', usedPercent: 50, resetAt: wed('21:30') }, [point('17:00', 10)]), { kind: 'none', reason: '' })
  assert.deepEqual(none({ name: 'other', usedPercent: 50 }, [point('17:00', 10)]), { kind: 'none', reason: '' })
})

test('projectWindow: a window without a reset time is searched for seven days only: it runs out inside them, or it is reported as lasting longer', () => {
  const unnamed = (earlierPercent: number): QuotaProjection => project({ name: 'window', usedPercent: 30 }, '17:30', [point('17:00', earlierPercent)])
  // 10 points in half an hour at peak: 20 per full-price hour, 40 at 18:00, then 10 per hour: the 60 left take 6 hours, to midnight.
  assert.deepEqual(unnamed(20), { kind: 'exhausts', at: at('2026-10-29T00:00:00+08:00'), basis: between('17:00', '17:30') })
  // 0.1 points in half an hour: 350 full-price hours are more than seven days.
  assert.deepEqual(unnamed(29.9), { kind: 'none', reason: '7 天内用不完' })
})

test('samePeriod: the name and the reset time agree within two minutes; an unnamed window needs a reset time to be told from the others', () => {
  const reset = wed('21:30')
  const five = (resetAt?: number): WindowState => ({ name: 'five-hour', ...(resetAt === undefined ? {} : { resetAt }) })
  assert.ok(samePeriod(five(reset), five(reset + 120_000)))
  assert.ok(!samePeriod(five(reset), five(reset + 120_001)))
  assert.ok(!samePeriod(five(reset), { name: 'weekly', resetAt: reset }))
  assert.ok(samePeriod(five(), five()), 'a named window without a reset time on both sides')
  assert.ok(!samePeriod(five(reset), five()))
  assert.ok(!samePeriod({ name: 'window' }, { name: 'window' }))
  assert.ok(!samePeriod({ name: 'other' }, { name: 'other' }))
  assert.ok(samePeriod({ name: 'window', resetAt: reset }, { name: 'window', resetAt: reset }))
})

test('upstreamLimitOf: a body with one of the limit codes, as a string or a number, is a limit; the recovery time in the message is read as UTC+8 and must be within eight days', () => {
  const now = at('2026-10-28T12:00:00Z')
  const body = (code: unknown, message: unknown): string => JSON.stringify({ error: { code, message } })
  for (const code of ['1308', 1308, '1310', '1316', '1317', '1318', '1319', '1320', 1321]) assert.equal(upstreamLimitOf(body(code, 'x'), now)?.code, String(code), String(code))
  for (const code of ['1302', 1313, '1311', '1315', '1322', 'RATE', undefined, null, {}]) assert.equal(upstreamLimitOf(body(code, 'x'), now), undefined, `${JSON.stringify(code)}`)
  assert.deepEqual(upstreamLimitOf(body('1308', '已达到使用上限，将于 2026-10-28 21:30:00 恢复'), now), { code: '1308', until: at('2026-10-28T21:30:00+08:00') })
  assert.deepEqual(upstreamLimitOf(body('1308', 'resets at 2026-10-29T08:05'), now), { code: '1308', until: at('2026-10-29T08:05:00+08:00') })
  assert.deepEqual(upstreamLimitOf(body('1308', 'in the past 2026-10-28 08:00:00'), now), { code: '1308' }, 'before now')
  assert.deepEqual(upstreamLimitOf(body('1308', 'too far 2026-11-07 08:00:00'), now), { code: '1308' }, 'more than eight days ahead')
  assert.deepEqual(upstreamLimitOf(body('1308', 'not a date 2026-13-45 99:99:99'), now), { code: '1308' })
  assert.deepEqual(upstreamLimitOf(body('1308', 'no time here'), now), { code: '1308' })
  assert.deepEqual(upstreamLimitOf(body('1308', 5), now), { code: '1308' })
  assert.equal(upstreamLimitOf('not json', now), undefined)
  assert.equal(upstreamLimitOf('{"error":"1308"}', now), undefined)
  assert.equal(upstreamLimitOf('[]', now), undefined)
  assert.equal(upstreamLimitOf(body('1308', 'x'.repeat(70_000)), now), undefined, 'a body over 64 KiB is not parsed')
})

test('mintRejectionOf: only a 401 or 403 of the token mint and an empty login token mean the login was refused', () => {
  assert.deepEqual(mintRejectionOf('project_token_http_401'), { status: 401 })
  assert.deepEqual(mintRejectionOf('project_token_http_403'), { status: 403 })
  assert.deepEqual(mintRejectionOf('project_token_login_required'), { code: 'project_token_login_required' })
  for (const code of ['project_token_network_error', 'project_token_timeout', 'project_token_http_429', 'project_token_http_500', 'project_token_http_503', 'project_token_http_404', 'project_token_disabled', 'project_token_project_unavailable', 'project_token_invalid_response', 'project_token_scope_invalidated', 'project_token_request_failed', 'Account request credential is unavailable: bigmodel', '']) {
    assert.equal(mintRejectionOf(code), undefined, code)
  }
})

test('GLM_LOOP_DEFAULTS: the four entries of the design, frozen, read as valid by the loop board reader, a notice only on the two the loop board runs', () => {
  assert.deepEqual(GLM_LOOP_DEFAULTS.map(entry => entry.id), ['glm:peak-reminder', 'glm:quota-on-command', 'glm:quota-low', 'glm:login-rejected'])
  const expected = (id: string, title: string, why: string, when: ChannelTrigger, runBy: ChannelLoopDefault['runBy'], tell?: string): ChannelLoopDefault => ({ id, title, why, when, runBy, ...(tell === undefined ? {} : { tell }) })
  assert.deepEqual(GLM_LOOP_DEFAULTS, [
    expected('glm:peak-reminder', 'GLM 高峰开始时提醒模型', '高峰时段里 GLM 按全价算积分，其余时段半价。每段高峰里，GLM 会话的第一步会收到一句提醒，说法跟着你选的高峰档位走。这一条由 GLM 通道包自己做，不装编排层也照常。', { kind: 'peak-start' }, 'channel'),
    expected('glm:quota-on-command', '看状态时读一次 GLM 额度', '你敲 /glm-status 或 /hourness 时，向服务端读一次额度，60 秒内不重复读。这一条由 GLM 通道包自己做。', { kind: 'command', names: ['glm-status', 'hourness'] }, 'channel'),
    expected('glm:quota-low', 'GLM 额度快用完时告诉你', '5 小时或每周额度用到 80%，或照现在的速度一小时内会用完时，主 Agent 在下一次回话里告诉你一句。每个额度周期只说一次。只在 GLM 有新用量、上次读数满 15 分钟时才去读额度。', QUOTA_LOW, 'loop-board', '[GLM] Quota running low. Tell the human this line in your next reply: "{line}". Do not switch models or plans because of it unless the human asks.'),
    expected('glm:login-rejected', 'GLM 登录失效时提醒你重新登录', 'GLM 的登录被服务端拒绝后，GLM 的请求都会失败。主 Agent 在下一次回话里告诉你运行 /glm-login。', { kind: 'login-rejected' }, 'loop-board', '[GLM] The GLM login was rejected; GLM requests fail until the human signs in again. Tell the human this line in your next reply: "{line}".'),
  ])
  assert.deepEqual(GLM_LOOP_DEFAULTS.map(entry => 'tell' in entry), [false, false, true, true])
  assert.ok(Object.isFrozen(GLM_LOOP_DEFAULTS) && GLM_LOOP_DEFAULTS.every(entry => Object.isFrozen(entry) && Object.isFrozen(entry.when)))
  const names = GLM_LOOP_DEFAULTS[1]?.when
  assert.ok(names?.kind === 'command' && Object.isFrozen(names.names))
  const problems: string[] = []
  assert.deepEqual(loopDefaultsOf({ ...creditPricing, loopDefaults: GLM_LOOP_DEFAULTS }, message => { problems.push(message) }), GLM_LOOP_DEFAULTS)
  assert.deepEqual(problems, [])
})
