/**
 * The quota reader of the GLM channel and the login state (docs/DESIGN.md
 * §4): the request it makes, how often, what it shows when the server
 * answers badly, the journal it writes and reads back, the projection built
 * from the journal, the state of the login, and the status command's section.
 * The transport is an injected fetch, the clock is injected, the journal and
 * the credential store are files in a temporary directory; no DSH contract is
 * replaced. Parsing, naming and the projection arithmetic are tested in
 * tests/quota.spec.ts, the adapter's 429 record in tests/glm-zcode.spec.ts.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveCredential, updateStoredCredential, type StoreFs } from '../src/glm-llm/auth/store.ts'
import type { Credential } from '../src/glm-llm/auth/types.ts'
import { GLM_LOOP_DEFAULTS } from '../src/glm-llm/loop-defaults.ts'
import { apply as loginApply, Config, type LoginConfig } from '../src/glm-llm/login-row.ts'
import { createQuotaReader, QUOTA_TIMEOUT_MS, QUOTA_URL, quotaHealthText, type QuotaHealth } from '../src/glm-llm/quota.ts'
import { loginFingerprintOf, nodeQuotaFs, QuotaJournal, quotaJournalPath, type QuotaRecord } from '../src/glm-llm/quota-journal.ts'
import { ZcodeAdapter, logout } from '../src/glm-llm/zcode.ts'
import { creditPricing } from '../src/glm-llm/credits.ts'
import { healthServiceName, type RowHealthView } from '../src/shared/health.ts'
import { PRICING_SERVICE, pricingService, quotaOf } from '../src/shared/pricing.ts'
import { quotaLines } from '../src/shared/quota.ts'
import type { CommandDefinitionLike } from '../src/shared/dsh-min.ts'
import { fakeProjectToken, PAT_KEY_ID, patPlane, zcodeDataDir } from './glm-fixtures.ts'
import { serviceStore } from './fake-rc3.ts'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
// 2026-10-28 is a Wednesday; 17:02 UTC+8 is inside the plan's peak hours (14:00-18:00).
const START = Date.parse('2026-10-28T17:02:00+08:00')
const ZONE = { offsetMinutes: 480 }
// Obvious fakes only: no real token appears in a spec. The OAuth token is the login, the first
// project token is what the PAT-plane double mints, and neither may ever be found in an output.
const OAUTH = 'oauth-secret-token-1'
const FIRST_PAT = fakeProjectToken(PAT_KEY_ID, 1)
const LOGIN: Credential = { version: 2, provider: 'bigmodel', oauthAccessToken: OAUTH, userId: 'user-1' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const homes: string[] = []
process.on('exit', () => { for (const dir of homes) rmSync(dir, { recursive: true, force: true }) })
const newHome = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'glmh-quota-'))
  homes.push(dir)
  return dir
}

const diskStore: StoreFs = { readFile: path => readFile(path, 'utf8'), writeFile: (path, data) => writeFile(path, data), rename, stat: path => nodeQuotaFs.stat(path) }
const credentialPath = (home: string): string => join(home, 'credentials.json')
const signIn = (home: string, stored: Credential = LOGIN): Promise<void> => saveCredential(diskStore, credentialPath(home), stored)

/** The three rows of the reading zcode-api recorded on 2026-10-12, with the reset times moved to `at`: five hours to 21:30, a week to Sunday, the MCP window to Monday. */
function quotaBody(at: number, percentages: readonly [number, number, number] = [41, 4, 63]): string {
  return JSON.stringify({
    code: 200,
    success: true,
    data: {
      level: 'max',
      limits: [
        { type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: percentages[0], nextResetTime: at + 4 * HOUR_MS + 28 * MINUTE_MS },
        { type: 'TIME_LIMIT', unit: 5, number: 1, usage: 1000, currentValue: 40, remaining: 3836, percentage: percentages[1], nextResetTime: at + 5 * DAY_MS },
        { type: 'TOKENS_LIMIT', unit: 6, number: 1, percentage: percentages[2], nextResetTime: at + 4 * DAY_MS },
      ],
    },
  })
}
const json = (body: string, status = 200): Response => new Response(body, { status, headers: { 'content-type': 'application/json' } })
const modelRejection = (): Response => json(JSON.stringify({ error: { type: 'authentication_error', message: 'token expired' } }), 401)

interface QuotaCall {
  readonly url: string
  readonly init: RequestInit
  readonly headers: Record<string, string>
}
type Responder = (call: QuotaCall) => Response | Promise<Response>

interface Harness {
  readonly home: string
  readonly now: () => number
  advance(ms: number): void
  readonly pat: ReturnType<typeof patPlane>
  /** Every request, in order, as `METHOD url`. */
  readonly wire: string[]
  readonly quotaCalls: QuotaCall[]
  readonly adapter: ZcodeAdapter
  readonly journal: QuotaJournal
  readonly reader: ReturnType<typeof createQuotaReader>
  /** The records in the journal file. */
  records(): QuotaRecord[]
  respond: Responder
}

interface HarnessOptions {
  readonly login?: Credential | false
  readonly plan?: 'start-plan'
  readonly pat?: ReturnType<typeof patPlane>
  readonly timeoutMs?: number
  readonly respond?: Responder
  readonly storeFs?: StoreFs
}

/** A quota reader on a temporary home, wired to a fetch double that answers the PAT plane, the quota URL (`respond`) and the model route. */
async function harness(options: HarnessOptions = {}): Promise<Harness> {
  const home = newHome()
  if (options.login !== false) await signIn(home, options.login)
  let clock = START
  const pat = options.pat ?? patPlane()
  const wire: string[] = []
  const quotaCalls: QuotaCall[] = []
  const state = { respond: options.respond ?? ((): Response => json(quotaBody(START))) }
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    wire.push(`${init?.method ?? 'GET'} ${url}`)
    if (url === QUOTA_URL) {
      const call: QuotaCall = { url, init: init ?? {}, headers: { ...(init?.headers as Record<string, string> | undefined) } }
      quotaCalls.push(call)
      return Promise.resolve(state.respond(call))
    }
    const plane = pat.answer(url, init)
    if (plane !== undefined) return Promise.resolve(plane)
    return Promise.resolve(url.endsWith('/v1/messages') ? modelRejection() : json('{}', 404))
  }) as typeof fetch
  const journal = new QuotaJournal({ home })
  const adapter = new ZcodeAdapter({ home, journal, now: () => clock, fetchImpl, env: zcodeDataDir().env, ...(options.plan === undefined ? {} : { plan: options.plan }), ...(options.storeFs === undefined ? {} : { storeFs: options.storeFs }) })
  const reader = createQuotaReader({ adapter, journal, fetchImpl, now: () => clock, zone: ZONE, ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }) })
  return {
    home,
    now: () => clock,
    advance: ms => { clock += ms },
    pat,
    wire,
    quotaCalls,
    adapter,
    journal,
    reader,
    records: () => (existsSync(quotaJournalPath(home)) ? readFileSync(quotaJournalPath(home), 'utf8').split('\n').filter(line => line.length > 0).map(line => JSON.parse(line) as QuotaRecord) : []),
    set respond(next: Responder) { state.respond = next },
    get respond() { return state.respond },
  }
}

/** What `run` returns, and the console warnings made while it ran, in order. */
async function withWarnings<T>(run: () => Promise<T>): Promise<{ value: T, messages: string[] }> {
  const original = console.warn
  const messages: string[] = []
  console.warn = (...args: unknown[]) => { messages.push(args.map(String).join(' ')) }
  try {
    return { value: await run(), messages }
  }
  finally {
    console.warn = original
  }
}

/** The console warnings made while `run` runs, in order. */
async function warned(run: () => Promise<unknown>): Promise<string[]> {
  return (await withWarnings(run)).messages
}

/** The model request the adapter makes: two rejections in a row end the stream with an error. */
async function streamOnce(adapter: ZcodeAdapter): Promise<unknown> {
  const failure = await (async () => {
    for await (const chunk of adapter.stream({ provider: 'glm-zcode', model: 'glm-5.3', sessionId: 's1', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], system: 'be brief' } as never)) void chunk
  })().then(() => undefined, (error: unknown) => error)
  assert.ok(failure instanceof Error, 'the stream ends with an error')
  return failure
}

const iso = (ms: number): string => new Date(ms).toISOString()
const kinds = (records: readonly QuotaRecord[], kind: QuotaRecord['kind']): QuotaRecord[] => records.filter(record => record.kind === kind)

// --- the request (acceptance 5) ---------------------------------------------------------------

test('a read is one GET to the monitor URL with exactly two headers: the project token as it is and a new request id each time', async () => {
  const h = await harness()
  const view = await h.reader.view({ waitMs: 1000 })
  assert.equal(h.quotaCalls.length, 1)
  const [call] = h.quotaCalls
  assert.equal(call?.url, 'https://bigmodel.cn/api/monitor/usage/quota/limit')
  assert.equal(call?.init.method, 'GET')
  assert.equal(call?.init.body, undefined)
  assert.deepEqual(Object.keys(call?.init ?? {}).sort(), ['headers', 'method', 'signal'], 'no option beyond the default ones')
  assert.equal(Object.getPrototypeOf(call?.init.headers), Object.prototype, 'a plain object of headers')
  assert.deepEqual(Object.keys(call?.headers ?? {}).sort(), ['authorization', 'x-request-id'])
  assert.equal(call?.headers.authorization, FIRST_PAT, 'the token itself, without Bearer')
  assert.match(call?.headers['x-request-id'] ?? '', UUID)
  assert.ok(call?.init.signal instanceof AbortSignal)
  assert.deepEqual(view.reading?.windows.map(window => [window.name, window.usedPercent]), [['five-hour', 41], ['mcp', 4], ['weekly', 63]])
  h.advance(61_000)
  await h.reader.view({ waitMs: 1000 })
  assert.equal(h.quotaCalls.length, 2)
  assert.notEqual(h.quotaCalls[1]?.headers['x-request-id'], call?.headers['x-request-id'])
  assert.equal(h.quotaCalls[1]?.headers.authorization, FIRST_PAT, 'the same cached project token')
  assert.equal(h.pat.mints(), 1)
  assert.deepEqual(h.wire.filter(entry => !entry.includes('/api/monitor/')).map(entry => entry.split('/').at(-1)), ['getCustomerInfo', 'api_keys', 'access_tokens'], 'one location lookup and one mint for both reads')
})

test('the deadline of a read is 15 seconds', async () => {
  assert.equal(QUOTA_TIMEOUT_MS, 15_000)
  const delays: number[] = []
  const original = globalThis.setTimeout
  globalThis.setTimeout = ((handler: () => void, delay?: number, ...rest: unknown[]) => {
    if (delay !== undefined) delays.push(delay)
    return original(handler, delay, ...rest)
  }) as typeof setTimeout
  try {
    const h = await harness()
    await h.reader.view({ waitMs: 1000 })
  }
  finally {
    globalThis.setTimeout = original
  }
  assert.ok(delays.includes(15_000), `timers set: ${delays.join(', ')}`)
})

test('without a login nothing is sent and the line says so; with start-plan nothing is sent at all, not even the token mint, and nothing is journalled', async () => {
  const out = await harness({ login: false })
  const { value: view, messages } = await withWarnings(() => out.reader.view({ waitMs: 1000 }))
  assert.deepEqual(messages, [], 'a logged-out install is a state, not a failure: no console warning')
  assert.deepEqual(out.wire, [])
  assert.equal(view.failure?.reason, 'not-logged-in')
  assert.deepEqual(quotaLines(view, out.now(), ZONE), ['额度：未登录 GLM（/glm-login）'])
  assert.deepEqual(out.records().map(record => record.kind === 'failure' ? record.reason : record.kind), ['not-logged-in'])

  const start = await harness({ plan: 'start-plan', login: { ...LOGIN, jwt: 'plan.jwt.fake' } })
  const startView = await start.reader.view({ waitMs: 1000 })
  assert.deepEqual(start.wire, [])
  assert.equal(startView.failure?.reason, 'start-plan')
  assert.deepEqual(quotaLines(startView, start.now(), ZONE), ['额度：体验套餐没有 5 小时与周额度'])
  assert.equal(existsSync(quotaJournalPath(start.home)), false, 'the experience plan is not a failure and writes no record')
})

test('the Config of the row keeps both keys, home and plan, and defaults the plan to coding-plan', () => {
  assert.deepEqual({ ...Config({ home: 'D:/glm', plan: 'start-plan' }) }, { home: 'D:/glm', plan: 'start-plan' })
  assert.equal(Config({ home: 'D:/glm' }).plan, 'coding-plan')
  assert.equal(Config({}).plan, 'coding-plan')
  const text = JSON.stringify(Config)
  assert.ok(text.includes('start-plan') && text.includes('<DSH home>/glm-hourness'))
})

// --- how often (acceptance 6) -----------------------------------------------------------------

test('a read is not started again within 60 seconds, by a command or by a caller that does not wait; callers that overlap share one request', async () => {
  const h = await harness()
  await h.reader.view({ waitMs: 1000 })
  await h.reader.view({ waitMs: 0 })
  await h.reader.view({ waitMs: 1000 })
  h.advance(59_000)
  await h.reader.view({ waitMs: 1000 })
  assert.equal(h.quotaCalls.length, 1)
  h.advance(1_000)
  await h.reader.view({ waitMs: 1000 })
  assert.equal(h.quotaCalls.length, 2)

  const gate: { release?: () => void } = {}
  h.advance(61_000)
  h.respond = () => new Promise<Response>(resolve => { gate.release = () => { resolve(json(quotaBody(h.now()))) } })
  const first = h.reader.view({ waitMs: 2000 })
  const second = h.reader.view({ waitMs: 2000 })
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal(h.quotaCalls.length, 3, 'one request for two callers')
  gate.release?.()
  const [one, two] = await Promise.all([first, second])
  assert.equal(h.quotaCalls.length, 3)
  assert.equal(one.pending, false)
  assert.equal(two.reading?.at, h.now())
})

test('a record that the quota is spent, newer than the last read, makes the next call read at once; an older one does not', async () => {
  const h = await harness()
  await h.reader.view({ waitMs: 1000 })
  h.advance(10_000)
  await h.journal.append({ at: iso(h.now() - 5_000), kind: 'upstream-limit', code: '1308' })
  await h.reader.view({ waitMs: 1000 })
  assert.equal(h.quotaCalls.length, 2, 'the record came after the last read started')
  h.advance(10_000)
  await h.reader.view({ waitMs: 1000 })
  assert.equal(h.quotaCalls.length, 2, 'the record is older than the second read now')
})

test('read: false starts nothing and gives the last reading of the journal and the login state; after a restart the history is still there', async () => {
  const first = await harness()
  await first.reader.view({ waitMs: 1000 })
  first.advance(40 * MINUTE_MS)
  first.respond = () => json(quotaBody(START, [50, 4, 64]))
  await first.reader.view({ waitMs: 1000 })
  assert.equal(first.quotaCalls.length, 2)

  // A new process: a reader on the same home with nothing in memory.
  const wire: string[] = []
  const journal = new QuotaJournal({ home: first.home })
  const adapter = new ZcodeAdapter({ home: first.home, journal, now: first.now, fetchImpl: () => { wire.push('request'); return Promise.reject(new Error('no request expected')) }, env: zcodeDataDir().env })
  const view = await createQuotaReader({ adapter, journal, now: first.now, zone: ZONE }).view({ read: false })
  assert.deepEqual(wire, [], 'read: false sends nothing')
  assert.equal(view.pending, false)
  assert.equal(view.login.state, 'ok')
  const five = view.reading?.windows.find(window => window.name === 'five-hour')
  assert.equal(view.reading?.at, first.now())
  assert.equal(five?.usedPercent, 50)
  const basis = five?.projection.kind === 'exhausts' || five?.projection.kind === 'at-reset' ? five.projection.basis : undefined
  assert.deepEqual(basis, { kind: 'recent', from: START, to: START + 40 * MINUTE_MS }, 'the two readings of the journal are the basis')
})

test('nothing runs on a timer: an hour of the clock with no caller sends no request', async () => {
  const h = await harness()
  await h.reader.view({ waitMs: 1000 })
  h.advance(HOUR_MS)
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal(h.quotaCalls.length, 1)
})

// --- the command is not slowed (acceptance 7) -------------------------------------------------

test('a request that does not answer returns the call within the wait with a pending line; the answer is shown by the next call', async () => {
  const h = await harness()
  const gate: { release?: () => void } = {}
  h.respond = () => new Promise<Response>(resolve => { gate.release = () => { resolve(json(quotaBody(h.now()))) } })
  const started = Date.now()
  const view = await h.reader.view({ waitMs: 3000 })
  assert.ok(Date.now() - started < 3500, `returned after ${Date.now() - started} ms`)
  assert.equal(view.pending, true)
  assert.equal(view.reading, undefined)
  assert.ok(quotaLines(view, h.now(), ZONE).includes('额度：正在读取，稍后再看'))
  h.advance(5_000)
  gate.release?.()
  const next = await h.reader.view({ waitMs: 1000 })
  assert.equal(next.pending, false)
  assert.equal(next.reading?.windows.length, 3)
  assert.equal(h.quotaCalls.length, 1, 'the call that came after joined the same request')
})

// --- failures are said (acceptance 8) ---------------------------------------------------------

const FAILURES: ReadonlyArray<readonly [string, string, Responder]> = [
  ['network', '额度：读不到（网络错误）', () => { throw new TypeError('fetch failed') }],
  ['http-500', '额度：读不到（服务端返回 500）', () => json('oops', 500)],
  ['http-429', '额度：读不到（服务端返回 429）', () => json('slow down', 429)],
  ['http-401', '额度：令牌被拒（401）；令牌到期换新后再读，或运行 /glm-login', () => json('{}', 401)],
  ['too-large', '额度：读不到（响应过大）', () => json('x'.repeat(256 * 1024 + 1))],
  ['envelope:not-json', '额度：服务端拒绝（not-json）', () => json('<html>bad gateway</html>')],
  ['envelope:1001', '额度：服务端拒绝（1001 login required）', () => json(JSON.stringify({ code: 1001, success: false, msg: 'login required' }))],
  ['no-windows', '额度：服务端没有返回可识别的窗口', () => json(JSON.stringify({ code: 200, data: { limits: [{ type: 'X' }] } }))],
]

for (const [reason, words, respond] of FAILURES) {
  test(`a read that fails with ${reason} shows one line, does not throw, warns once, and is recorded once in ten minutes`, async () => {
    const h = await harness({ respond })
    const { value: first, messages } = await withWarnings(async () => {
      const view = await h.reader.view({ waitMs: 1000 })
      h.advance(61_000)
      await h.reader.view({ waitMs: 1000 })
      h.advance(61_000)
      await h.reader.view({ waitMs: 1000 })
      return view
    })
    assert.equal(h.quotaCalls.length, 3)
    assert.equal(first.failure?.reason, reason)
    assert.deepEqual(quotaLines(first, h.now(), ZONE), [words])
    assert.equal(messages.length, 1, messages.join('\n'))
    assert.ok(messages[0]?.includes(reason))
    assert.deepEqual(kinds(h.records(), 'failure').map(record => (record as { reason: string }).reason), [reason])
    h.advance(11 * MINUTE_MS)
    await warned(async () => { await h.reader.view({ waitMs: 1000 }) })
    assert.equal(kinds(h.records(), 'failure').length, 2, 'ten minutes later the same reason is recorded again')
  })
}

test('a read that does not answer in time is a timeout; the line keeps the last reading with the time it was read', async () => {
  const h = await harness({ timeoutMs: 40 })
  await h.reader.view({ waitMs: 1000 })
  h.advance(61_000)
  h.respond = () => new Promise<Response>(() => { /* never answers */ })
  const { value: view } = await withWarnings(() => h.reader.view({ waitMs: 1000 }))
  assert.equal(view.failure?.reason, 'timeout')
  assert.deepEqual(quotaLines(view, h.now(), ZONE).slice(0, 2), ['额度：读不到（15 秒没有响应）', '额度（服务端读数，含 ZCode 等其他客户端，读于 17:02）：max'])
})

test('a project token that cannot be minted is a line with its code, and no quota request is made', async () => {
  const h = await harness({ pat: patPlane({ mintStatus: 500 }) })
  const { value: view } = await withWarnings(() => h.reader.view({ waitMs: 1000 }))
  assert.equal(h.quotaCalls.length, 0)
  assert.equal(view.failure?.reason, 'credential:project_token_http_500')
  assert.deepEqual(quotaLines(view, h.now(), ZONE), ['额度：项目令牌拿不到（project_token_http_500），运行 /glm-login'])
})

test('a 401 on the quota path is not retried in the same read and does not mint again: the next read sends the same token', async () => {
  const h = await harness({ respond: () => json('{}', 401) })
  await warned(async () => { await h.reader.view({ waitMs: 1000 }) })
  assert.equal(h.quotaCalls.length, 1, 'no retry')
  assert.equal(h.pat.mints(), 1)
  h.advance(61_000)
  await warned(async () => { await h.reader.view({ waitMs: 1000 }) })
  assert.equal(h.quotaCalls.length, 2)
  assert.equal(h.pat.mints(), 1, 'no new token')
  assert.equal(h.wire.filter(entry => entry.startsWith('POST') && entry.endsWith('/access_tokens')).length, 1, 'the one mint of the first read')
  assert.equal(h.quotaCalls[1]?.headers.authorization, h.quotaCalls[0]?.headers.authorization)
  assert.equal((await h.reader.view({ read: false })).login.state, 'ok', 'a 401 of the quota path is not a refused login')
})

test('a reading that follows a failure shows no failure; the reading and the failure of earlier reads are all in the journal', async () => {
  const h = await harness({ respond: () => json('oops', 500) })
  await warned(async () => { await h.reader.view({ waitMs: 1000 }) })
  h.advance(61_000)
  h.respond = () => json(quotaBody(h.now()))
  const view = await h.reader.view({ waitMs: 1000 })
  assert.equal(view.failure, undefined)
  assert.deepEqual(h.records().map(record => record.kind), ['failure', 'reading'])
})

test('the journal keeps the parsed rows of a reading and what was dropped: the rows past 32 and the names of the keys of rows without numbers', async () => {
  const rows = Array.from({ length: 34 }, (_, index) => ({ type: `LIMIT_${index}`, percentage: index }))
  const h = await harness({ respond: () => json(JSON.stringify({ code: 200, data: { level: 'pro', limits: [...rows, { type: 'NO_NUMBERS', label: 'x' }] } })) })
  const view = await h.reader.view({ waitMs: 1000 })
  assert.equal(view.reading?.windows.length, 32)
  const [record] = kinds(h.records(), 'reading')
  assert.ok(record?.kind === 'reading')
  assert.equal(record.limits.length, 32)
  assert.equal(record.dropped, 3)
  assert.deepEqual(record.keys, ['type', 'percentage', 'label'])
  assert.equal(record.level, 'pro')
})

// --- the projection from the journal (acceptance 10, the wiring) ------------------------------

test('two readings 30 minutes apart in the journal are the basis of the projection, with the half-price hours after 18:00', async () => {
  const h = await harness({ login: false })
  const reading = (at: number, percentage: number): QuotaRecord => ({ at: iso(at), kind: 'reading', level: 'pro', limits: [{ type: 'TOKENS_LIMIT', percentage, nextResetTime: Date.parse('2026-10-28T21:30:00+08:00') }], dropped: 0 })
  await h.journal.append(reading(Date.parse('2026-10-28T17:00:00+08:00'), 20))
  await h.journal.append(reading(Date.parse('2026-10-28T17:30:00+08:00'), 30))
  const view = await h.reader.view({ read: false })
  assert.deepEqual(view.reading?.windows[0]?.projection, { kind: 'at-reset', percent: 75, basis: { kind: 'recent', from: Date.parse('2026-10-28T17:00:00+08:00'), to: Date.parse('2026-10-28T17:30:00+08:00') } })
  assert.equal(quotaLines(view, Date.parse('2026-10-28T17:31:00+08:00'), ZONE)[1], '- 5 小时：已用 30% · 21:30 重置 · 到重置时约 75%，按 17:00–17:30 两次读数的速度')
})

test('lines of the journal that are not records are skipped and counted, and the records around them are read', async () => {
  const h = await harness({ login: false })
  await h.journal.append({ at: iso(START), kind: 'failure', reason: 'timeout' })
  const path = quotaJournalPath(h.home)
  writeFileSync(path, `${readFileSync(path, 'utf8')}not json\n{"at":"nope","kind":"reading"}\n{"at":"${iso(START + 1)}","kind":"login-rejected","path":"model","status":500}\n`)
  await h.journal.append({ at: iso(START + 2), kind: 'failure', reason: 'network' })
  const view = await h.reader.view({ read: false })
  assert.equal(view.failure?.reason, 'network')
  assert.equal(h.reader.health().skippedLines, 3)
  assert.ok(quotaHealthText(h.reader.health(), START, ZONE).includes('额度流水有 3 行读不懂'))
})

// --- the upstream limit (acceptance 11, the view) ---------------------------------------------

test('a 429 of the model route that says the quota is spent is shown as spent, with the recovery time when the message has one', async () => {
  const h = await harness()
  await h.reader.view({ waitMs: 1000 })
  h.advance(10 * MINUTE_MS)
  const limitBody = JSON.stringify({ error: { code: '1308', message: '已达到使用上限，将于 2026-10-28 21:30:00 恢复' } })
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    return Promise.resolve(url.endsWith('/v1/messages') ? json(limitBody, 429) : h.pat.answer(url, init) ?? json('{}', 404))
  }) as typeof fetch
  const model = new ZcodeAdapter({ home: h.home, journal: h.journal, now: h.now, fetchImpl, env: zcodeDataDir().env })
  const failure = await streamOnce(model)
  assert.match((failure as Error).message, /^glm-zcode 429: /)
  const view = await h.reader.view({ read: false })
  assert.deepEqual(view.limited, { at: h.now(), code: '1308', until: Date.parse('2026-10-28T21:30:00+08:00') })
  assert.equal(quotaLines(view, h.now(), ZONE)[0], '额度已用完（服务端 1308），预计 21:30 恢复')
})

// --- the state of the login (acceptance 20) ---------------------------------------------------

test('no credential file, an emptied one (after /glm-logout) and one that cannot be read are an absent login; a login without a rejection is ok', async () => {
  const none = await harness({ login: false })
  assert.equal((await none.reader.view({ read: false })).login.state, 'absent')
  const h = await harness()
  assert.deepEqual((await h.reader.view({ read: false })).login, { state: 'ok' })
  await logout(h.home)
  assert.deepEqual((await h.reader.view({ read: false })).login, { state: 'absent' })
  assert.equal(h.reader.health().credentialUnreadable, false)
  writeFileSync(credentialPath(h.home), 'this is not a credential')
  assert.deepEqual((await h.reader.view({ read: false })).login, { state: 'absent' })
  assert.equal(h.reader.health().credentialUnreadable, true)
  assert.ok(quotaHealthText(h.reader.health(), START, ZONE).includes('凭证文件读不出，运行 /glm-login'))
})

test('a model request that is refused again after a new token is a refused login, recorded once with the fingerprint of the login token and never the token', async () => {
  const h = await harness()
  const failure = await streamOnce(h.adapter)
  assert.match((failure as Error).message, /^glm-zcode 401: /)
  assert.equal(h.pat.mints(), 2, 'the token was minted again before the retry')
  const [record] = kinds(h.records(), 'login-rejected')
  assert.deepEqual(record, { at: iso(START), kind: 'login-rejected', path: 'model', status: 401, login: loginFingerprintOf(OAUTH) })
  assert.match((record as { login: string }).login, /^[0-9a-f]{16}$/)
  assert.notEqual((record as { login: string }).login, OAUTH)
  const view = await h.reader.view({ read: false })
  assert.deepEqual(view.login, { state: 'rejected', since: START, path: 'model' })
  assert.equal(h.quotaCalls.length, 0)
  // The same path again within ten minutes is not recorded again; after ten minutes it is.
  h.advance(9 * MINUTE_MS)
  await streamOnce(h.adapter)
  assert.equal(kinds(h.records(), 'login-rejected').length, 1)
  h.advance(2 * MINUTE_MS)
  await streamOnce(h.adapter)
  assert.equal(kinds(h.records(), 'login-rejected').length, 2)
})

for (const status of [401, 403]) {
  test(`a token mint that the server answers with ${status} is a refused login on the mint path; the error is the one ZCode gives`, async () => {
    const h = await harness({ pat: patPlane({ mintStatus: status }) })
    const failure = await streamOnce(h.adapter)
    assert.match((failure as Error).message, new RegExp(`project access token unavailable \\(project_token_http_${status}\\)`))
    const [record] = kinds(h.records(), 'login-rejected')
    assert.deepEqual(record, { at: iso(START), kind: 'login-rejected', path: 'mint', status, login: loginFingerprintOf(OAUTH) })
    assert.deepEqual(await h.reader.view({ read: false }).then(view => view.login), { state: 'rejected', since: START, path: 'mint' })
    // The quota read meets the same refusal, shows it as a token it cannot get, and the record is not written twice.
    await warned(async () => { await h.reader.view({ waitMs: 1000 }) })
    assert.equal(kinds(h.records(), 'login-rejected').length, 1)
  })
}

for (const [label, pat] of [['429', patPlane({ mintStatus: 429 })], ['503', patPlane({ mintStatus: 503 })]] as const) {
  test(`a token mint that fails for a moment (${label}) is not a refused login`, async () => {
    const h = await harness({ pat })
    await streamOnce(h.adapter)
    assert.deepEqual(kinds(h.records(), 'login-rejected'), [])
    assert.equal((await h.reader.view({ read: false })).login.state, 'ok')
  })
}

test('a network failure of the token mint is not a refused login', async () => {
  const h = await harness()
  const adapter = new ZcodeAdapter({ home: h.home, journal: h.journal, now: h.now, fetchImpl: () => Promise.reject(new TypeError('fetch failed')), env: zcodeDataDir().env })
  const failure = await streamOnce(adapter)
  assert.match((failure as Error).message, /project_token_network_error/)
  assert.deepEqual(kinds(h.records(), 'login-rejected'), [])
})

test('a rejection stays while the project key location is written back to the file; a new login, a logout and a good reading end it', async () => {
  const h = await harness()
  await streamOnce(h.adapter)
  assert.equal((await h.reader.view({ read: false })).login.state, 'rejected')
  // The located key is written into the same file: its size and modification time change, the login does not.
  await updateStoredCredential(diskStore, credentialPath(h.home), stored => ({ ...stored, location: { key: 'project-key-location:v1:x', value: '{"apiKeyId":"key-1"}' } }))
  assert.equal((await h.reader.view({ read: false })).login.state, 'rejected')
  // A good reading is later than the refusal.
  h.advance(MINUTE_MS)
  const view = await h.reader.view({ waitMs: 1000 })
  assert.equal(view.reading !== undefined, true)
  assert.equal(view.login.state, 'ok')
  // The refusal of another login does not touch this one, and a new login is another fingerprint.
  const again = await harness()
  await streamOnce(again.adapter)
  await signIn(again.home, { ...LOGIN, oauthAccessToken: 'oauth-secret-token-2' })
  assert.equal((await again.reader.view({ read: false })).login.state, 'ok', 're-login')
  await signIn(again.home)
  assert.equal((await again.reader.view({ read: false })).login.state, 'rejected', 'the refused login is back')
  await logout(again.home)
  assert.equal((await again.reader.view({ read: false })).login.state, 'absent', 'logout')
})

test('60 calls that ask for the state while the credential file does not change decrypt it once', async () => {
  let reads = 0
  const counting: StoreFs = { ...diskStore, readFile: path => { reads += 1; return diskStore.readFile(path) } }
  const h = await harness({ storeFs: counting })
  for (let call = 0; call < 60; call++) assert.equal((await h.reader.view({ read: false })).login.state, 'ok')
  assert.equal(reads, 1)
  await signIn(h.home, { ...LOGIN, oauthAccessToken: 'oauth-secret-token-2' })
  await h.reader.view({ read: false })
  assert.equal(reads, 2, 'a changed file is decrypted again')
})

test('the mint of the quota token records a refused login once for the read and for the stream together', async () => {
  const h = await harness({ pat: patPlane({ mintStatus: 401 }) })
  await warned(async () => { await Promise.all([h.reader.view({ waitMs: 1000 }), streamOnce(h.adapter)]) })
  assert.equal(kinds(h.records(), 'login-rejected').length, 1)
})

// --- no credential in any output (acceptance 12) ----------------------------------------------

test('neither the login token nor the project token is in the journal, in the lines, in the views or on the console', async () => {
  const h = await harness()
  const seen: string[] = []
  const messages = await warned(async () => {
    seen.push(JSON.stringify(await h.reader.view({ waitMs: 1000 })))
    await streamOnce(h.adapter)
    h.advance(61_000)
    h.respond = () => json('{}', 401)
    const failed = await h.reader.view({ waitMs: 1000 })
    seen.push(JSON.stringify(failed), ...quotaLines(failed, h.now(), ZONE))
    seen.push(quotaHealthText(h.reader.health(), h.now(), ZONE))
  })
  const journal = readFileSync(quotaJournalPath(h.home), 'utf8')
  for (const output of [...seen, ...messages, journal]) {
    assert.ok(!output.includes(OAUTH) && !output.includes(FIRST_PAT) && !output.includes('Bearer'), output.slice(0, 120))
  }
  assert.ok(journal.includes(loginFingerprintOf(OAUTH)), 'the fingerprint is there')
})

// --- the row (acceptance 5, 7, 18; the status command) ----------------------------------------

type Handler = CommandDefinitionLike['handler']

function loginRow(config: LoginConfig) {
  const store = serviceStore()
  const commands = new Map<string, Handler>()
  const dispose = loginApply({ commands: { register: definition => { commands.set(definition.name, invocation => definition.handler(invocation)); return () => {} } }, ...store }, { now: () => START, offsetMinutes: 480, ...config })
  const run = async (name: string): Promise<string> => {
    const result = await commands.get(name)?.({ agent: { id: 's1', session: { id: 's1' } }, rawInput: '' })
    return (result as { text: string }).text
  }
  const health = (): { state: string, reason: string } => (({ state, reason }) => ({ state, reason }))((store.get(healthServiceName('glm-login')) as RowHealthView).activation())
  return { store, run, health, dispose }
}

/** A fetch double for the row: the PAT plane, the quota URL (`respond`), everything else not found. */
function rowFetch(respond: () => Response | Promise<Response>): { fetchImpl: typeof fetch, calls: string[] } {
  const pat = patPlane()
  const calls: string[] = []
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    return Promise.resolve(url === QUOTA_URL ? respond() : pat.answer(url, init) ?? json('{}', 404))
  }) as typeof fetch
  return { fetchImpl, calls }
}

test('/glm-status: the credential line, then the peak line and the quota section, then the health table', async () => {
  const home = newHome()
  await signIn(home)
  const { fetchImpl, calls } = rowFetch(() => json(quotaBody(START)))
  const row = loginRow({ home, fetchImpl })
  const text = await row.run('glm-status')
  const table = text.indexOf('## 行健康（会话 s1）')
  assert.ok(table > 0)
  const [credential, ...section] = text.slice(0, table).trimEnd().split('\n')
  assert.equal(credential, 'glm-zcode：已登录（套餐 coding-plan，Key unresolved，账号 user-1）', 'the first line stays the one the settings page reads')
  assert.equal(section[0], '', 'a blank line between')
  assert.equal(section[1], '高峰：高峰中，到 18:00（GLM 积分套餐）')
  assert.equal(section[2], '额度（服务端读数，含 ZCode 等其他客户端，读于 17:02）：max')
  assert.ok(section[3]?.startsWith('- 5 小时：已用 41% · 21:30 重置 · '), section[3])
  assert.ok(section[4]?.startsWith('- MCP 工具调用：已用 4% · 周一 17:02 重置'), section[4])
  assert.ok(section[5]?.startsWith('- 每周：已用 63% · 周日 17:02 重置 · '), section[5])
  assert.equal(section.length, 6)
  assert.equal(text.slice(table - 2, table), '\n\n', 'a blank line before the health table')
  assert.equal(calls.filter(call => call.includes('/api/monitor/')).length, 1)
  assert.deepEqual(row.health(), { state: 'active', reason: '/glm-login、/glm-status、/glm-logout 已注册；额度：读于 17:02' })
  const again = await row.run('glm-status')
  assert.equal(calls.filter(call => call.includes('/api/monitor/')).length, 1, 'a second status inside 60 seconds reads nothing')
  assert.ok(again.startsWith('glm-zcode：已登录（套餐 coding-plan，Key key-1…，账号 user-1）'), 'the located key shows after the first read')
})

test('/glm-status with no login says so on the quota line and sends nothing', async () => {
  const { fetchImpl, calls } = rowFetch(() => json(quotaBody(START)))
  const row = loginRow({ home: newHome(), fetchImpl })
  const { value: text, messages } = await withWarnings(() => row.run('glm-status'))
  assert.deepEqual(messages, [])
  assert.ok(text.includes('\n\n高峰：高峰中，到 18:00（GLM 积分套餐）\n额度：未登录 GLM（/glm-login）\n\n## 行健康'), text)
  assert.deepEqual(calls, [])
  assert.equal(row.health().reason, '/glm-login、/glm-status、/glm-logout 已注册；额度：读不到（not-logged-in）')
})

test('/glm-status of a row set to start-plan names the plan on the credential line and sends no request at all', async () => {
  const home = newHome()
  await signIn(home, { ...LOGIN, jwt: 'plan.jwt.fake' })
  const { fetchImpl, calls } = rowFetch(() => json(quotaBody(START)))
  const row = loginRow({ home, plan: 'start-plan', fetchImpl })
  const text = await row.run('glm-status')
  assert.ok(text.startsWith('glm-zcode：已登录（套餐 start-plan，'), text.split('\n')[0])
  assert.ok(text.includes('\n额度：体验套餐没有 5 小时与周额度\n\n'))
  assert.deepEqual(calls, [])
  assert.equal(row.health().reason, '/glm-login、/glm-status、/glm-logout 已注册；额度：体验套餐没有 5 小时与周额度')
})

test('/glm-status returns within 3.5 seconds when the quota request does not answer, and says the read is still running', async () => {
  const home = newHome()
  await signIn(home)
  const gate: { release?: () => void } = {}
  const { fetchImpl } = rowFetch(() => new Promise<Response>(resolve => { gate.release = () => { resolve(json(quotaBody(START))) } }))
  const row = loginRow({ home, fetchImpl })
  const started = Date.now()
  const text = await row.run('glm-status')
  assert.ok(Date.now() - started < 3500, `returned after ${Date.now() - started} ms`)
  assert.ok(text.includes('高峰：高峰中，到 18:00（GLM 积分套餐）\n额度：正在读取，稍后再看\n\n## 行健康'), text)
  gate.release?.()
  const next = await row.run('glm-status')
  assert.ok(next.includes('额度（服务端读数，含 ZCode 等其他客户端，读于 17:02）：max'), next)
})

test('the row health says the last reading, the reason of a failed read, and a refused login; the state stays as the row had it', async () => {
  const home = newHome()
  await signIn(home)
  const answers = [json('oops', 500)]
  let clock = START
  const { fetchImpl } = rowFetch(() => answers.shift() ?? json(quotaBody(clock)))
  const row = loginRow({ home, fetchImpl, now: () => clock })
  await warned(async () => { await row.run('glm-status') })
  assert.deepEqual(row.health(), { state: 'active', reason: '/glm-login、/glm-status、/glm-logout 已注册；额度：读不到（http-500）' })
  clock += 61_000
  await row.run('glm-status')
  assert.equal(row.health().reason, '/glm-login、/glm-status、/glm-logout 已注册；额度：读于 17:03')
  // A refused login adds its words.
  const journal = new QuotaJournal({ home })
  clock += 30_000
  await journal.append({ at: iso(clock), kind: 'login-rejected', path: 'mint', status: 401, login: loginFingerprintOf(OAUTH) })
  const view = await quotaOf(pricingService(row.store) as never)?.({ read: false })
  assert.equal(view?.login.state, 'rejected')
  assert.equal(row.health().reason, '/glm-login、/glm-status、/glm-logout 已注册；额度：读于 17:03；登录被拒')
  assert.ok((await row.run('glm-status')).includes('登录：被拒（17:03，取令牌时被拒），运行 /glm-login'))
})

test('the pricing service the row provides carries the plan, the quota reader and the four entries; the constant of the plan stays what it was', async () => {
  const home = newHome()
  await signIn(home)
  const { fetchImpl } = rowFetch(() => json(quotaBody(START)))
  const row = loginRow({ home, fetchImpl })
  const service = pricingService(row.store)
  assert.ok(service !== undefined)
  assert.notEqual(service, creditPricing)
  assert.ok(Object.isFrozen(service))
  assert.equal(service.basis, creditPricing.basis)
  assert.equal(service.plan, creditPricing.plan)
  assert.equal(service.peakHours, creditPricing.peakHours)
  assert.equal(service.loopDefaults, GLM_LOOP_DEFAULTS)
  assert.equal(service.peak(START), true)
  const read = quotaOf(service)
  assert.ok(read !== undefined)
  const view = await read({ waitMs: 1000 })
  assert.equal(view.reading?.windows.length, 3)
  assert.equal(row.store.get(PRICING_SERVICE), service)
  row.dispose()
  assert.equal(row.store.get(PRICING_SERVICE), undefined)
})

test('the row adds no listener on tools/pre-execute or agent/pre-step: at activation it touches the commands and provide only', () => {
  const used = new Set<string>()
  const store = serviceStore()
  const host = new Proxy({ commands: { register: () => () => {} }, ...store }, {
    get(target, property, receiver) {
      if (typeof property === 'string') used.add(property)
      return Reflect.get(target, property, receiver) as unknown
    },
  })
  const home = newHome()
  const dispose = loginApply(host, { home, now: () => START })
  dispose()
  assert.deepEqual([...used].sort(), ['commands', 'provide'])
})

test('quotaHealthText: the last reading, the reason of a failure, a refused login and what is wrong with the files', () => {
  const clean: QuotaHealth = { loginRejected: false, credentialUnreadable: false, skippedLines: 0, journalBytes: 0 }
  const text = (health: Partial<QuotaHealth>): string => quotaHealthText({ ...clean, ...health }, START, ZONE)
  assert.equal(text({}), '')
  assert.equal(text({ readAt: START }), '额度：读于 17:02')
  assert.equal(text({ readAt: START, failure: 'timeout' }), '额度：读不到（timeout）')
  assert.equal(text({ failure: 'start-plan' }), '额度：体验套餐没有 5 小时与周额度')
  assert.equal(text({ readAt: START, loginRejected: true }), '额度：读于 17:02；登录被拒')
  assert.equal(text({ credentialStatError: 'EPERM' }), '凭证文件状态读不出（EPERM）')
  assert.equal(text({ journalBytes: 8 * 1024 * 1024 - 1 }), '')
  assert.equal(text({ journalBytes: 8 * 1024 * 1024 }), '额度流水已到 8 MiB，轮换要另行设计')
})
