/**
 * The GLM channel's four metric events (M6 design §14.2; node
 * m6-metrics-events): each quota read, each upstream-limit record, each
 * refused-login record and each peak reminder hands one event to the
 * metrics service, filed under the session or project it belongs to; the
 * events carry codes, counts and window names, never a token or a header;
 * without the metrics service nothing is handed and nothing is said. The
 * transport is an injected fetch, the credential store and the quota journal
 * are files in a temporary directory, and the metrics service is the cordis
 * service the metrics row provides, recorded; no DSH contract is replaced.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveCredential, type StoreFs } from '../src/glm-llm/auth/store.ts'
import type { Credential } from '../src/glm-llm/auth/types.ts'
import { apply as loginApply } from '../src/glm-llm/login-row.ts'
import { glmMetricSink, metricsWhere, quotaReadBody, reasonId, windowShares } from '../src/glm-llm/metrics.ts'
import { createQuotaReader, QUOTA_URL } from '../src/glm-llm/quota.ts'
import { loginFingerprintOf, nodeQuotaFs, QuotaJournal } from '../src/glm-llm/quota-journal.ts'
import type { QuotaLimitRow } from '../src/glm-llm/quota-parse.ts'
import { ZcodeAdapter } from '../src/glm-llm/zcode.ts'
import { apply as promptApply } from '../src/glm-prompt/index.ts'
import { PEAK_REMINDER_SOURCE } from '../src/glm-prompt/peak-reminder.ts'
import { apply as hournessApply } from '../src/report/index.ts'
import type { CommandDefinitionLike, UserNotice } from '../src/shared/dsh-min.ts'
import { METRICS_SERVICE, type MetricsWhere, type QueuedEvent } from '../src/shared/metrics.ts'
import { PEAK_MODE_SERVICE, peakModeState, type PeakModeService } from '../src/shared/peak-mode.ts'
import { pricingService } from '../src/shared/pricing.ts'
import type { QuotaRequest } from '../src/shared/quota.ts'
import { fakeProjectToken, modelRequest, PAT_KEY_ID, patPlane, zcodeDataDir } from './glm-fixtures.ts'
import { fakeRuntime, serviceStore } from './fake-rc3.ts'
import { journalTakes } from './loops-helpers.ts'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
// 2026-10-28 is a Wednesday; 15:00 UTC+8 is inside the plan's peak hours.
const START = Date.parse('2026-10-28T15:00:00+08:00')
// Obvious fakes only; neither may appear in any event.
const OAUTH = 'oauth-metrics-fake-1'
const FIRST_PAT = fakeProjectToken(PAT_KEY_ID, 1)
const LOGIN: Credential = { version: 2, provider: 'bigmodel', oauthAccessToken: OAUTH, userId: 'user-1' }

const homes: string[] = []
process.on('exit', () => { for (const dir of homes) rmSync(dir, { recursive: true, force: true }) })

const store: StoreFs = { readFile: path => readFile(path, 'utf8'), writeFile: (path, data) => writeFile(path, data), rename, stat: path => nodeQuotaFs.stat(path) }

/** A temporary credential home, signed in with `login` unless it is false. */
async function homeWith(login: Credential | false = LOGIN): Promise<string> {
  const home = mkdtempSync(join(tmpdir(), 'glmh-metrics-'))
  homes.push(home)
  if (login !== false) await saveCredential(store, join(home, 'credentials.json'), login)
  return home
}

interface Handed {
  readonly event: QueuedEvent
  readonly where: MetricsWhere
}

/** A cordis service store with the metrics row's service in it, recording what it is handed. */
function metricsHost(): { readonly host: ReturnType<typeof serviceStore>, readonly handed: Handed[] } {
  const host = serviceStore()
  const handed: Handed[] = []
  host.provide(METRICS_SERVICE, { emit: (event: QueuedEvent, where: MetricsWhere): void => { handed.push({ event, where }) } })
  return { host, handed }
}

/** The bodies handed for one kind, in order. */
const bodiesOf = (handed: readonly Handed[], kind: string): Array<Readonly<Record<string, unknown>>> =>
  handed.filter(entry => entry.event.k === kind).map(entry => entry.event.body as Readonly<Record<string, unknown>>)

const answer = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** A reading with a five-hour, an MCP and a weekly row as of `at`. */
const reading = (at: number): unknown => ({
  code: 200,
  data: {
    level: 'pro',
    limits: [
      { type: 'TOKENS_LIMIT', percentage: 40.6, nextResetTime: at + 4 * HOUR_MS },
      { type: 'TIME_LIMIT', percentage: 4, remaining: 3836, nextResetTime: at + 120 * HOUR_MS },
      { type: 'TOKENS_LIMIT', percentage: 63, nextResetTime: at + 96 * HOUR_MS },
    ],
  },
})

interface Channel {
  readonly adapter: ZcodeAdapter
  readonly reader: ReturnType<typeof createQuotaReader>
  readonly handed: Handed[]
  advance(ms: number): void
  /** The next answer of the quota URL. */
  quota: () => Response | Promise<Response>
}

/**
 * The adapter and the quota reader of one home, as the glm-login row builds
 * them, on the real sink over a store with the metrics service; the model
 * route answers `model` (a token rejection unless given).
 */
async function channel(options: { readonly login?: Credential | false, readonly plan?: 'start-plan', readonly mintStatus?: number, readonly model?: () => Response } = {}): Promise<Channel> {
  const home = await homeWith(options.login)
  const pat = patPlane(options.mintStatus === undefined ? {} : { mintStatus: options.mintStatus })
  const { host, handed } = metricsHost()
  const metric = glmMetricSink(host)
  let clock = START
  const state: { quota: () => Response | Promise<Response> } = { quota: () => answer(reading(clock)) }
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url === QUOTA_URL) return Promise.resolve(state.quota())
    const plane = pat.answer(url, init)
    if (plane !== undefined) return Promise.resolve(plane)
    if (url.endsWith('/v1/messages')) return Promise.resolve(options.model?.() ?? answer({ error: { type: 'authentication_error', message: 'token expired' } }, 401))
    return Promise.resolve(answer({}, 404))
  }) as typeof fetch
  const journal = new QuotaJournal({ home })
  const now = (): number => clock
  const adapter = new ZcodeAdapter({ home, journal, metric, now, fetchImpl, env: zcodeDataDir().env, ...(options.plan === undefined ? {} : { plan: options.plan }) })
  const reader = createQuotaReader({ adapter, journal, fetchImpl, now, metric })
  return {
    adapter,
    reader,
    handed,
    advance: ms => { clock += ms },
    get quota() { return state.quota },
    set quota(next) { state.quota = next },
  }
}

/** The console warnings made while `run` runs. */
async function warningsOf(run: () => Promise<unknown>): Promise<string[]> {
  const original = console.warn
  const messages: string[] = []
  console.warn = (...args: unknown[]) => { messages.push(args.map(String).join(' ')) }
  try {
    await run()
  }
  finally {
    console.warn = original
  }
  return messages
}

/** No token, no login fingerprint and no header word in anything handed. */
function assertNoCredential(handed: readonly Handed[]): void {
  const text = JSON.stringify(handed)
  for (const secret of [OAUTH, FIRST_PAT, loginFingerprintOf(OAUTH), 'Bearer', 'authorization', 'x-request-id']) assert.ok(!text.includes(secret), `${secret} in ${text.slice(0, 200)}`)
}

// --- the pure mapping ------------------------------------------------------------------------

test('reasonId keeps an id-shaped reason code and turns the rest into its prefix with :other', () => {
  for (const code of ['network', 'timeout', 'http-500', 'envelope:1001', 'no-windows', 'credential:project_token_http_401']) assert.equal(reasonId(code), code)
  assert.equal(reasonId('credential:Account request credential is unavailable: bigmodel'), 'credential:other')
  assert.equal(reasonId('额度'), 'other')
  assert.equal(reasonId(''), 'other')
  assert.equal(reasonId(`credential:${'x'.repeat(130)}`), 'credential:other')
})

test('windowShares names each window, rounds its share, numbers a name that comes again and leaves out a row without a share', () => {
  const rows: QuotaLimitRow[] = [
    { type: 'TOKENS_LIMIT', percentage: 40.6, nextResetTime: START + 4 * HOUR_MS },
    { type: 'TIME_LIMIT', percentage: 4, nextResetTime: START + 120 * HOUR_MS },
    { type: 'TIME_LIMIT', percentage: 9.4, nextResetTime: START + 100 * HOUR_MS },
    { type: 'TOKENS_LIMIT', percentage: 63, nextResetTime: START + 96 * HOUR_MS },
    { type: 'SOMETHING_NEW', remaining: 5 },
  ]
  assert.deepEqual(windowShares(rows, START), { 'five-hour': 41, mcp: 4, 'mcp-2': 9, weekly: 63 })
})

test('quotaReadBody: a reading has its windows and dropped rows, a failure its reason and no windows; the duration is a whole non-negative number', () => {
  const rows: QuotaLimitRow[] = [{ type: 'TOKENS_LIMIT', percentage: 12, nextResetTime: START + HOUR_MS }]
  assert.deepEqual(quotaReadBody({ ok: true, at: START, limits: rows, dropped: 2 }, 12.6, 'command'), { ok: true, ms: 13, by: 'command', windows: { 'five-hour': 12 }, dropped: 2 })
  assert.deepEqual(quotaReadBody({ ok: false, reason: 'http-500' }, -5, 'service'), { ok: false, why: 'http-500', ms: 0, by: 'service', windows: {}, dropped: 0 })
  assert.equal(quotaReadBody({ ok: false, reason: 'timeout' }, Number.NaN, 'service').ms, 0)
})

test('metricsWhere names only what is there', () => {
  assert.deepEqual(metricsWhere('s1', 'C:/work/alpha'), { sessionId: 's1', dir: 'C:/work/alpha' })
  assert.deepEqual(metricsWhere('', ''), {})
  assert.deepEqual(metricsWhere(undefined), {})
})

// --- glm.quota-read ----------------------------------------------------------------------------

test('a read hands one glm.quota-read by glm for the asker, with the windows; the journal takes it', async () => {
  const c = await channel()
  await c.reader.view({ waitMs: 1000, asker: { kind: 'command', sessionId: 's1' } })
  assert.equal(c.handed.length, 1)
  const [one] = c.handed
  assert.equal(one?.event.k, 'glm.quota-read')
  assert.equal(one?.event.by, 'glm')
  assert.deepEqual(one?.where, { sessionId: 's1' })
  assert.deepEqual(one?.event.body, { ok: true, ms: 0, by: 'command', windows: { 'five-hour': 41, mcp: 4, weekly: 63 }, dropped: 0 })
  assert.ok(one !== undefined && journalTakes(one.event), 'the field table takes the event')
  assertNoCredential(c.handed)
})

test('a read for a project by a service files under the directory; an asker the reader does not know is a service with nowhere', async () => {
  const board = await channel()
  await board.reader.view({ waitMs: 1000, asker: { kind: 'service', dir: 'C:/work/alpha' } })
  assert.deepEqual(board.handed.map(entry => [entry.where, bodiesOf([entry], 'glm.quota-read')[0]?.by]), [[{ dir: 'C:/work/alpha' }, 'service']])
  const odd = await channel()
  await odd.reader.view({ waitMs: 1000, asker: { kind: 'robot', sessionId: 5 } as unknown as QuotaRequest['asker'] })
  assert.deepEqual(odd.handed.map(entry => [entry.where, bodiesOf([entry], 'glm.quota-read')[0]?.by]), [[{}, 'service']])
  const bare = await channel()
  await bare.reader.view({ waitMs: 1000 })
  assert.deepEqual(bare.handed.map(entry => entry.where), [{}], 'without an asker the read is a service\'s, only counted')
})

test('one event per read started: a call within 60 seconds, a call that does not read and a call that joins hand none; the joined read keeps its starter', async () => {
  const c = await channel()
  const gate: { release?: () => void } = {}
  c.quota = () => new Promise<Response>(resolve => { gate.release = () => { resolve(answer(reading(START))) } })
  const first = c.reader.view({ waitMs: 2000, asker: { kind: 'command', sessionId: 'starter' } })
  const second = c.reader.view({ waitMs: 2000, asker: { kind: 'service', dir: 'C:/work/beta' } })
  for (let waited = 0; gate.release === undefined && waited < 2000; waited += 5) await new Promise(resolve => setTimeout(resolve, 5))
  gate.release?.()
  await Promise.all([first, second])
  assert.deepEqual(c.handed.map(entry => entry.where), [{ sessionId: 'starter' }])
  c.quota = () => answer(reading(START))
  await c.reader.view({ waitMs: 1000, asker: { kind: 'command', sessionId: 'again' } })
  await c.reader.view({ read: false })
  assert.equal(c.handed.length, 1)
  c.advance(61_000)
  await c.reader.view({ waitMs: 1000, asker: { kind: 'command', sessionId: 'later' } })
  assert.deepEqual(c.handed.map(entry => entry.where), [{ sessionId: 'starter' }, { sessionId: 'later' }])
})

test('a failed read hands its reason; a credential message becomes credential:other; not logged in is a read; the experience plan sends nothing and hands nothing', async () => {
  const broken = await channel()
  broken.quota = () => answer({ error: 'down' }, 500)
  await warningsOf(() => broken.reader.view({ waitMs: 1000, asker: { kind: 'command', sessionId: 's1' } }))
  assert.deepEqual(bodiesOf(broken.handed, 'glm.quota-read'), [{ ok: false, why: 'http-500', ms: 0, by: 'command', windows: {}, dropped: 0 }])
  assert.ok(broken.handed[0] !== undefined && journalTakes(broken.handed[0].event))
  const partial = await channel({ login: { version: 2, provider: 'bigmodel', oauthAccessToken: OAUTH } })
  await warningsOf(() => partial.reader.view({ waitMs: 1000 }))
  assert.deepEqual(bodiesOf(partial.handed, 'glm.quota-read').map(body => body.why), ['credential:other'])
  assert.ok(partial.handed[0] !== undefined && journalTakes(partial.handed[0].event), 'the 3.16.3 message with its spaces does not reach the id field')
  const out = await channel({ login: false })
  await out.reader.view({ waitMs: 1000 })
  assert.deepEqual(bodiesOf(out.handed, 'glm.quota-read').map(body => body.why), ['not-logged-in'])
  const start = await channel({ plan: 'start-plan', login: { ...LOGIN, jwt: 'plan.jwt.fake' } })
  await start.reader.view({ waitMs: 1000, asker: { kind: 'command', sessionId: 's1' } })
  assert.deepEqual(start.handed, [])
})

// --- glm.upstream-limit and glm.login-rejected --------------------------------------------------

test('a 429 that says the quota is spent hands one glm.upstream-limit for the request\'s session, with whether a reset time was given; any other 429 hands none', async () => {
  const bodies = [
    { error: { code: '1308', message: '已达到使用上限，将于 2026-10-28 21:30:00 恢复' } },
    { error: { code: 1310, message: 'weekly limit' } },
    { error: { code: '1113', message: 'balance' } },
  ]
  const c = await channel({ model: () => answer(bodies.shift(), 429) })
  for (const session of ['s1', 's2', 's3']) assert.match(String(await modelRequest(c.adapter, session)), /glm-zcode 429: /)
  const limits = c.handed.filter(entry => entry.event.k === 'glm.upstream-limit')
  assert.deepEqual(limits.map(entry => [entry.where, entry.event.body]), [[{ sessionId: 's1' }, { code: '1308', hasReset: true }], [{ sessionId: 's2' }, { code: '1310', hasReset: false }]])
  assert.ok(limits.every(entry => journalTakes(entry.event)))
})

test('a refused login hands one glm.login-rejected per record: the path and the status, for the session, without the fingerprint; ten minutes of refusals are one', async () => {
  const c = await channel()
  await modelRequest(c.adapter, 's1')
  c.advance(9 * MINUTE_MS)
  await modelRequest(c.adapter, 's1')
  const refused = c.handed.filter(entry => entry.event.k === 'glm.login-rejected')
  assert.deepEqual(refused.map(entry => [entry.where, entry.event.body]), [[{ sessionId: 's1' }, { path: 'model', status: 401 }]])
  assert.ok(refused.every(entry => journalTakes(entry.event)))
  c.advance(2 * MINUTE_MS)
  await modelRequest(c.adapter, 's2')
  assert.equal(c.handed.filter(entry => entry.event.k === 'glm.login-rejected').length, 2)
  assertNoCredential(c.handed)
})

test('a mint refused for a quota read is filed under the read\'s asker, with the read\'s own event', async () => {
  const c = await channel({ mintStatus: 403 })
  await warningsOf(() => c.reader.view({ waitMs: 1000, asker: { kind: 'command', sessionId: 's9' } }))
  assert.deepEqual(c.handed.map(entry => [entry.event.k, entry.where]), [['glm.login-rejected', { sessionId: 's9' }], ['glm.quota-read', { sessionId: 's9' }]])
  assert.deepEqual(bodiesOf(c.handed, 'glm.login-rejected'), [{ path: 'mint', status: 403 }])
  assert.deepEqual(bodiesOf(c.handed, 'glm.quota-read').map(body => body.why), ['credential:project_token_http_403'])
  assertNoCredential(c.handed)
})

// --- glm.peak-reminder -------------------------------------------------------------------------

const userInput = { id: 'u1', role: 'user', content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } }

/** The dialect row on a GLM session at `clock`: the first step's peak notices, the second step's, and what the metrics service was handed. */
async function peakSteps(options: { readonly metrics: boolean, readonly peakMode?: PeakModeService, readonly cwd?: string, readonly clock?: number }): Promise<{ readonly first: number, readonly second: number, readonly handed: Handed[] }> {
  const rt = fakeRuntime(options.cwd === undefined ? {} : { cwd: options.cwd })
  const handed: Handed[] = []
  if (options.metrics) rt.services.set(METRICS_SERVICE, { emit: (event: QueuedEvent, where: MetricsWhere): void => { handed.push({ event, where }) } })
  if (options.peakMode !== undefined) rt.services.set(PEAK_MODE_SERVICE, options.peakMode)
  promptApply(rt.ctx, { toolSearchMode: 'off' }, () => options.clock ?? START)
  await rt.create()
  const notices = async (step: number, messages: readonly unknown[]): Promise<number> => {
    await rt.assemble({ model: 'glm-5.3' })
    const decision = await rt.preStep({ step, messages })
    if (decision.kind !== 'enter') return 0
    rt.history.push(...decision.messages)
    return decision.messages.filter(message => (message as UserNotice).source?.kind === PEAK_REMINDER_SOURCE).length
  }
  const first = await notices(1, [userInput])
  const second = await notices(2, [])
  return { first, second, handed }
}

test('each peak reminder sent hands one glm.peak-reminder for the agent\'s session and working directory; the next step in the window hands none', async () => {
  const { first, second, handed } = await peakSteps({ metrics: true, cwd: 'C:/work/alpha' })
  assert.deepEqual([first, second], [1, 0])
  assert.deepEqual(handed.map(entry => [entry.event.k, entry.event.by, entry.where, entry.event.body]), [['glm.peak-reminder', 'glm', { sessionId: 'agent-1', dir: 'C:/work/alpha' }, { window: '2026-10-28', mode: 'none', note: 'no-service' }]])
  assert.ok(handed[0] !== undefined && journalTakes(handed[0].event))
})

test('the peak reminder\'s event carries the level and the cap the text wrote; off-peak there is no reminder and no event', async () => {
  const reduce: PeakModeService = {
    stateFor: () => peakModeState({ level: 'reduce', origin: 'default', peak: true, until: '2026-10-28T10:00:00.000Z' }),
    stateForProject: () => undefined,
    peakHoldFor: () => undefined,
  }
  const { handed } = await peakSteps({ metrics: true, peakMode: reduce })
  assert.deepEqual(bodiesOf(handed, 'glm.peak-reminder'), [{ window: '2026-10-28', mode: 'reduce', cap: 1 }])
  const offPeak = await peakSteps({ metrics: true, clock: Date.parse('2026-10-28T10:00:00+08:00') })
  assert.deepEqual([offPeak.first, offPeak.handed], [0, []])
})

// --- the rows, and no metrics service -----------------------------------------------------------

type Handler = CommandDefinitionLike['handler']
const invocation = { agent: { id: 's1', session: { id: 's1' } }, rawInput: '' }

/** The glm-login row on a signed-in home, on `host`; `run` types one command of the row (or of the hourness row on the same host). */
async function rows(host: ReturnType<typeof serviceStore>, clock: { at: number }): Promise<{ readonly run: (name: string) => Promise<string>, readonly dispose: () => void }> {
  const home = await homeWith()
  const pat = patPlane()
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    return Promise.resolve(url === QUOTA_URL ? answer(reading(clock.at)) : pat.answer(url, init) ?? answer({}, 404))
  }) as typeof fetch
  const commands = new Map<string, Handler>()
  const register = { register: (definition: CommandDefinitionLike): (() => void) => { commands.set(definition.name, invocation => definition.handler(invocation)); return () => {} } }
  const login = loginApply({ commands: register, ...host }, { home, fetchImpl, now: () => clock.at, offsetMinutes: 480 })
  const hourness = hournessApply({ commands: register, ...host }, { now: () => new Date(clock.at), offsetMinutes: 480 })
  return {
    run: async name => {
      const handler = commands.get(name)
      assert.ok(handler !== undefined, name)
      return (await handler(invocation)).text ?? ''
    },
    dispose: () => { login(); hourness() },
  }
}

test('/glm-status and /hourness each start a read that is the command\'s, in the session it ran in', async () => {
  const { host, handed } = metricsHost()
  const clock = { at: START }
  const row = await rows(host, clock)
  try {
    assert.ok(pricingService(host) !== undefined)
    await row.run('glm-status')
    clock.at += 61_000
    await row.run('hourness')
    const reads = handed.filter(entry => entry.event.k === 'glm.quota-read')
    assert.deepEqual(reads.map(entry => [entry.where, bodiesOf([entry], 'glm.quota-read')[0]?.by, bodiesOf([entry], 'glm.quota-read')[0]?.ok]), [[{ sessionId: 's1' }, 'command', true], [{ sessionId: 's1' }, 'command', true]])
    assert.ok(reads.every(entry => typeof entry.event.v === 'string' && journalTakes(entry.event)), 'emitMetric adds the build stamp')
    assertNoCredential(handed)
  }
  finally {
    row.dispose()
  }
})

test('without the metrics service the rows read, remind and refuse as before, hand nothing and say nothing', async () => {
  const host = serviceStore()
  const clock = { at: START }
  const row = await rows(host, clock)
  try {
    const messages = await warningsOf(async () => {
      assert.ok((await row.run('glm-status')).includes('额度（服务端读数'))
    })
    assert.deepEqual(messages, [])
  }
  finally {
    row.dispose()
  }
  const peak = await peakSteps({ metrics: false })
  assert.equal(peak.first, 1, 'the reminder still goes out')
  const sink = glmMetricSink(serviceStore())
  assert.deepEqual(await warningsOf(() => Promise.resolve(sink({ k: 'glm.upstream-limit', body: { code: '1308', hasReset: false } }, { sessionId: 's1' }))), [])
})

test('a metrics service that throws or has no emit changes no read, no request and no reminder', async () => {
  for (const service of [{ emit: (): never => { throw new Error('metrics row broke') } }, { emit: 'not a function' }]) {
    const host = serviceStore()
    host.provide(METRICS_SERVICE, service)
    const sink = glmMetricSink(host)
    assert.doesNotThrow(() => { sink({ k: 'glm.upstream-limit', body: { code: '1308', hasReset: false } }, {}) })
    const home = await homeWith()
    const pat = patPlane()
    const fetchImpl = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      return Promise.resolve(url === QUOTA_URL ? answer(reading(START)) : pat.answer(url, init) ?? answer({ error: { code: '1308', message: 'spent' } }, 429))
    }) as typeof fetch
    const journal = new QuotaJournal({ home })
    const adapter = new ZcodeAdapter({ home, journal, metric: sink, now: () => START, fetchImpl, env: zcodeDataDir().env })
    const view = await createQuotaReader({ adapter, journal, fetchImpl, now: () => START, metric: sink }).view({ waitMs: 1000, asker: { kind: 'command', sessionId: 's1' } })
    assert.equal(view.reading?.windows.length, 3)
    assert.match(String(await modelRequest(adapter, 's1')), /^Error: glm-zcode 429: /, 'the error the stream ends with is unchanged')
  }
})
