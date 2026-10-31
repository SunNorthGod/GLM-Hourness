/**
 * The shared half of the quota contract (docs/ORCHESTRATION.md §11.3, §11.4):
 * the moment words, the peak line, the quota section, the low-quota test,
 * the login line, and the readers of the three optional members of the
 * pricing service. Pure functions; the channel package's reader of the
 * server is tested in tests/glm-quota.spec.ts.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { creditPricing } from '../src/glm-llm/credits.ts'
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
