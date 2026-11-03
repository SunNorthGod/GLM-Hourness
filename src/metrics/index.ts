/**
 * The metrics row (metrics design §6.1, §6.4, §9): it provides the service
 * `glmHournessMetrics` that other rows hand their events to, installs its own
 * observers on the rc.3 seams, resolves the project of every event from the
 * session's working directory (§3.3) and writes each project's journal with
 * the one writer (src/metrics/writer.ts). After activation and a first
 * successful write it checks yesterday's and today's files of every written
 * project in the background (§6.4), and while the loop board's service is
 * there it hands the board one daily self-check entry whose harness action
 * runs the same check (§6.4). The row reports its health at activation, for
 * every session a model call or a session event happens in, and after a
 * self-check (§9.6). Activation never throws: a missing part degrades the
 * row and says which (§9.1), and the observation never changes the host's
 * behavior (§9.5).
 */
import { randomBytes } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureIgnored, projectOf } from '../data/project-root.ts'
import { LOOPS_SERVICE, loopsService, type Contribution, type HarnessResult, type LoopEventRecord, type LoopsService } from '../loops/service.ts'
import type { AgentsService, AgentLike, InjectHost, LlmStreamListener, ProvideHost, ServiceLookup, SessionEventLike, SessionLike, UserQuestionsListener } from '../shared/dsh-min.ts'
import { provideRowHealth, type HealthState, type RowHealth } from '../shared/health.ts'
import { pricingService, type UsagePricing } from '../shared/pricing.ts'
import { METRICS_SERVICE, type MetricsService, type QueuedEvent } from '../shared/metrics.ts'
import { warnOnceFor } from '../shared/row-support.ts'
import { checkLog, type LogFindings } from './read.ts'
import { ID_PATTERN } from './schema.ts'
import { createObserve, type MetricsObserver, type ObservedWhere, type ObservedSink } from './observe.ts'
import { nodeMetricsFs, openWriter, type MetricsFs } from './writer.ts'

/** cordis plugin identity: a host row without injected requirements; everything it reads is optional and read per event. */
export const name = 'dsh-glm-hourness/metrics'

/** The context the row reads: the seams it installs, the services it reads per event, and `provide` for its own. */
export interface MetricsContext extends ServiceLookup, Partial<ProvideHost> {
  readonly on?: {
    (event: 'agent/created', listener: (payload: { agent: AgentLike }) => Promise<void> | void): () => void
    (event: 'llm/stream', listener: LlmStreamListener, options?: { global?: boolean, prepend?: boolean }): () => void
    (event: 'session/event', listener: (session: SessionLike, event: SessionEventLike) => void): () => void
    (event: 'session/disposed', listener: (session: SessionLike) => void): () => void
    (event: 'user-questions/request', listener: UserQuestionsListener, options?: { prepend?: boolean }): () => void
  }
  readonly inject?: InjectHost['inject']
}

/** What tests replace; everything defaults to the real thing (§5.1's injectable `MetricsFs`, the repository's `projectOf`). */
export interface MetricsConfig {
  /** The writer's filesystem, the key file's reads and writes; default `nodeMetricsFs`. */
  readonly fs?: MetricsFs
  /** The writer's clock and the durations of the row's own reads; default `Date.now`. */
  readonly now?: () => number
  /** The writer id source; default 8 hex digits from `randomBytes`. */
  readonly randomId?: () => string
  /** The `.llm` ignore line; default the repository's `ensureIgnored`. Tests fail it like a real `.git/info/exclude` would. */
  readonly ensureIgnored?: (root: string, directory: string) => Promise<void>
  /** The self-check's reading of a journal; default `checkLog` over yesterday and today (§6.4). */
  readonly selfcheck?: (root: string) => Promise<LogFindings>
  /** The delay before the first background self-check, in milliseconds; default 30 000. Tests use 0. */
  readonly checkDelay?: number
  /** The one-shot timer of the background self-check; default `setTimeout`, unref'd. */
  readonly timer?: (body: () => void, ms: number) => () => void
  /** Which kind of process this is (`start.host`, §4.2); default `headless` outside the desktop runtime, `desktop` in it. */
  readonly host?: 'desktop' | 'headless' | 'cli'
}

/** The `metrics` namespace's own self-check entry and action (§6.4), the first time-triggered factory `harness` entry. */
export const METRICS_SELF_CHECK_ENTRY = {
  id: 'metrics.selfcheck',
  title: '检查指标记录',
  why: '每天查一遍指标记录有没有缺行、链断或被删，有就告诉主 Agent',
  when: { kind: 'daily', time: '10:00' },
  action: { kind: 'harness', action: 'metrics.selfcheck', tell: { text: 'The metrics log self-check found something; see the coverage line of /hourness.', wake: false } },
  basis: '依据指标记录的链式摘要与文件清单',
} as const

/** The default one-shot timer: `setTimeout`, which never holds the host process open. */
const realTimer = (body: () => void, ms: number): (() => void) => {
  const handle = setTimeout(body, ms)
  handle.unref()
  return () => { clearTimeout(handle) }
}

const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

/** The UTC day strings the self-check window covers: yesterday and today, as `[from, to)` (§6.4). */
function selfcheckWindow(now: () => number): { readonly from: string, readonly to: string } {
  const at = now()
  const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10)
  return { from: day(at - 86_400_000), to: day(at + 86_400_000) }
}

/** The findings of a self-check, as the health names them (§9.6: 没有正常退出、缺行、链断、文件丢失); `undefined` when it came out clean. */
function findingsOf(found: LogFindings): string | undefined {
  const parts = [
    found.noStop.length > 0 ? `${found.noStop.length} 个进程没有正常退出` : undefined,
    found.missing.length > 0 ? `缺 ${found.missing.reduce((sum, range) => sum + range.to - range.from + 1, 0)} 行` : undefined,
    found.chainBreaks.length > 0 ? `链断 ${found.chainBreaks.length} 处` : undefined,
    found.lostFiles.length > 0 ? `文件丢失 ${found.lostFiles.length} 个` : undefined,
    found.unreadable.length > 0 ? `${found.unreadable.length} 行读不出` : undefined,
  ].filter(part => part !== undefined)
  return parts.length === 0 ? undefined : parts.join('，')
}

/**
 * cordis plugin entry: provide the service, install the seams one by one,
 * resolve the project of every event, write it, check the journals in the
 * background and report the row's health. Activation never throws (§9.1).
 */
export function apply(ctx: MetricsContext, config: MetricsConfig = {}): () => void {
  const io = config.fs ?? nodeMetricsFs
  const now = config.now ?? ((): number => Date.now())
  const warn = warnOnceFor(name)
  /** What is wrong, for the health's degraded state (§9.6). */
  const problems: string[] = []
  /** What this process does not do or cannot price; not a fault (§9.1, §9.2). */
  const notes: string[] = []
  /** The seams that are not installed, by name (§9.1). */
  const missing: string[] = []
  /** Events with no project, by kind, in first-seen order (§3.5). */
  const noProject = new Map<string, number>()
  let internalErrors = 0
  /** Today's enqueued events per project, with the day they belong to (§9.6's 今天 N 条). */
  const today = new Map<string, { readonly day: string, count: number }>()
  /** The self-check's findings per project, after it ran (§6.4). */
  const checked = new Map<string, LogFindings>()
  /** Projects a self-check has been scheduled for, once each (§6.4: after activation and the first successful write). */
  const scheduled = new Set<string>()
  /** The sessions each project's report went to, so a later self-check refreshes them (§9.6's 后台自查完成). */
  const reported = new Map<string, Set<string>>()
  const disposers: Array<() => void> = []

  const health: RowHealth = provideRowHealth(ctx, 'metrics', 'inactive', '指标行还在起')

  const activation = (): [HealthState, string] => [
    problems.length === 0 ? 'active' : 'degraded',
    [
      ...notes,
      ...(missing.length > 0 ? [`接缝没装上：${missing.join('、')}`] : []),
      ...problems,
    ].join('；'),
  ]

  const say = (text: string, fault: boolean): void => {
    const lines = fault ? problems : notes
    if (!lines.includes(text)) lines.push(text)
    health.reactivate(...activation())
  }

  const problem = (text: string): void => {
    internalErrors += 1
    warn(text, text)
    say(`内部错误 ${internalErrors} 次（最近：${text}）`, true)
  }

  const noProjectLine = (): string =>
    `无项目的事件 ${[...noProject.values()].reduce((sum, count) => sum + count, 0)} 条（${[...noProject.keys()].slice(0, 8).join('、')}）`

  // The one writer of the process (§3.4): every project's journal goes through it.
  // `now` is always the wrapper (line 110), never a captured `Date.now`
  // reference: a runtime that moves its clock (the probe clock row patches
  // `Date.now` after the rows apply) must move the journal's stamped `at`
  // and its date file with it.
  const writers = openWriter({
    host: config.host ?? (process.versions.electron === undefined ? 'headless' : 'desktop'),
    fs: io,
    now,
    ...(config.randomId === undefined ? {} : { randomId: config.randomId }),
    ...(config.ensureIgnored === undefined ? {} : { ensureIgnored: config.ensureIgnored }),
  })
  const ensureIgnoredOf = config.ensureIgnored ?? ensureIgnored

  /** The path-hash keys per project (§4.3), settled by the async loads; `keyOf` reads settled values only. */
  const keys = new Map<string, string | undefined>()
  const keyLoads = new Map<string, Promise<void>>()

  function loadKey(root: string): Promise<void> {
    const inflight = keyLoads.get(root)
    if (inflight !== undefined) return inflight
    const load = (async (): Promise<void> => {
      const file = join(root, '.llm', 'metrics-key')
      try {
        await mkdir(join(root, '.llm'), { recursive: true })
        await ensureIgnoredOf(root, '.llm')
      }
      catch (error) {
        keys.set(root, undefined)
        say(`路径散列的密钥没建上：${message(error)}`, true)
        return
      }
      try {
        keys.set(root, await readKey(file))
      }
      catch (error) {
        keys.set(root, undefined)
        problem(`路径散列的密钥读不出：${message(error)}`)
      }
    })()
    keyLoads.set(root, load)
    return load
  }

  /** The project's key: read it, or create it once (`wx`) when no file is there (§4.3). */
  async function readKey(file: string): Promise<string> {
    try {
      return (await io.readFile(file)).trim()
    }
    catch (error) {
      if ((error as { readonly code?: unknown }).code !== 'ENOENT') throw error
      const key = randomBytes(32).toString('hex')
      try {
        await io.writeFileExclusive(file, `${key}\n`)
      }
      catch (writeError) {
        if ((writeError as { readonly code?: unknown }).code !== 'EEXIST') throw writeError
      }
      return (await io.readFile(file)).trim()
    }
  }

  /** The `agents` registry, read per event (§6.1); a host without it leaves `llm` and `said` to the counter (§9.1). */
  const agents = (): AgentsService | undefined => {
    const value: unknown = typeof ctx.get === 'function' ? ctx.get('agents') : undefined
    return typeof (value as AgentsService | undefined)?.get === 'function' ? value as AgentsService : undefined
  }

  /** The project of an event's `where` (§3.3): `dir` first, then the session's working directory. */
  function projectOfWhere(where: { readonly sessionId?: string, readonly dir?: string }): string | undefined {
    if (where.dir !== undefined && where.dir !== '') {
      const found = projectOf(where.dir)
      if (found !== undefined) return found.root
    }
    const id = where.sessionId
    if (id === undefined || id === '') return undefined
    const cwd = agents()?.get(id)?.session?.header?.cwd
    return cwd === undefined ? undefined : projectOf(cwd)?.root
  }

  /** One project's report (§9.6): the state, then the active line, the notes and everything wrong with the row or the project. */
  function reportOf(root: string): { readonly state: HealthState, readonly text: string } {
    const found = checked.get(root)
    const findings = found === undefined ? undefined : findingsOf(found)
    const counted = today.get(root)
    const todayLine = counted?.day === new Date(now()).toISOString().slice(0, 10) ? counted.count : 0
    const status = writers.status().get(root)
    const destProblems = [
      ...(status?.error !== undefined ? [`写入失败（${status.error}${status.queued > 0 ? `，排队 ${status.queued} 条` : ''}${status.dropped > 0 ? `，丢 ${status.dropped} 条` : ''}）`] : []),
      ...(status !== undefined && status.rejected > 0 ? [`拒收 ${status.rejected} 条`] : []),
      ...(noProject.size > 0 ? [noProjectLine()] : []),
      ...(internalErrors > 0 ? [`内部错误 ${internalErrors} 次`] : []),
    ]
    return {
      state: problems.length + destProblems.length === 0 ? 'active' : 'degraded',
      text: [
        `指标记入 ${join(root, '.llm', 'metrics')}，今天 ${todayLine} 条；上次自查${findings === undefined ? (found === undefined ? '还没跑' : '干净') : `有发现：${findings}`}`,
        ...notes,
        ...(missing.length > 0 ? [`接缝没装上：${missing.join('、')}`] : []),
        ...destProblems,
        ...problems,
      ].join('；'),
    }
  }

  function reportSession(sessionId: string | undefined, root: string | undefined): void {
    if (sessionId === undefined) return
    if (root === undefined) {
      const text = [...notes, ...problems, ...(noProject.size > 0 ? [noProjectLine()] : [])].join('；')
      health.report(sessionId, problems.length === 0 && noProject.size === 0 ? 'active' : 'degraded', text === '' ? '这个会话的事件没有可归的项目' : text)
      return
    }
    const report = reportOf(root)
    health.report(sessionId, report.state, report.text)
    const seen = reported.get(root) ?? new Set<string>()
    seen.add(sessionId)
    reported.set(root, seen)
  }

  /** The envelope's `sid` is the sink's business (§4): the `where` a caller carries decides, when it holds a well-formed id. */
  const stampSid = (event: QueuedEvent, sessionId: string | undefined): QueuedEvent =>
    sessionId === undefined || !ID_PATTERN.test(sessionId) ? event : { ...event, sid: sessionId }

  /** The sink the observers and the service share (§3.5): an event with no project only counts. */
  const sink: ObservedSink = (event: QueuedEvent, where: ObservedWhere): void => {
    const root = projectOfWhere(where)
    if (root === undefined) {
      noProject.set(event.k, (noProject.get(event.k) ?? 0) + 1)
      say(noProjectLine(), true)
      reportSession(where.sessionId, undefined)
      return
    }
    void loadKey(root)
    const before = writers.status().get(root)
    writers.record(root, stampSid(event, where.sessionId))
    const after = writers.status().get(root)
    if ((after?.rejected ?? 0) !== (before?.rejected ?? 0)) say(`拒收 ${after?.rejected ?? 0} 条`, true)
    const day = new Date(now()).toISOString().slice(0, 10)
    const counted = today.get(root)
    today.set(root, counted?.day === day ? { day, count: counted.count + 1 } : { day, count: 1 })
    if (!scheduled.has(root)) {
      scheduled.add(root)
      scheduleSelfcheck(root)
    }
    reportSession(where.sessionId, root)
  }

  const service: MetricsService = { emit: sink }

  // A provide failure leaves the seams working but nothing handed in (§9.1).
  if (typeof ctx.provide === 'function') {
    try {
      disposers.push(ctx.provide(METRICS_SERVICE, service))
    }
    catch (error) {
      say(`服务 ${METRICS_SERVICE} 提供失败：${message(error)}`, true)
      warn(`${METRICS_SERVICE} not provided`, `${METRICS_SERVICE} not provided: ${message(error)}`)
    }
  }
  else {
    say(`宿主没有 provide，服务 ${METRICS_SERVICE} 提供不了`, true)
  }

  const observe: MetricsObserver = createObserve({
    record: sink,
    problem,
    now,
    pricing: (): UsagePricing | undefined => pricingService(ctx, text => say(text, true)),
    rootOf: cwd => projectOf(cwd)?.root,
    keyOf: root => keys.get(root),
  })

  /** The seams, each one its own guard (§9.1): one that throws is skipped and the health names it. */
  const seam = (what: string, installable: (() => () => void) | undefined): void => {
    if (installable === undefined) {
      missing.push(what)
      return
    }
    try {
      disposers.push(installable())
    }
    catch (error) {
      missing.push(what)
      warn(`${what} seam`, `the ${what} seam is off: ${message(error)}`)
    }
  }

  const on = typeof ctx.on === 'function' ? ctx.on : undefined
  seam('agent/created', on === undefined ? undefined : () => on('agent/created', ({ agent }) => {
    try {
      const session = agent.session
      const cwd = session?.header.cwd
      const root = cwd === undefined ? undefined : projectOf(cwd)?.root
      if (session !== undefined && root !== undefined) {
        const header = session.header
        sink(
          { k: 'session', by: 'host', body: { ...(header.parentSession === undefined ? {} : { parent: header.parentSession }), ...(header.origin === undefined ? {} : { origin: header.origin }) } },
          { sessionId: session.id, ...(cwd === undefined ? {} : { dir: cwd }) },
        )
      }
    }
    catch (error) {
      problem(`the record of a session failed: ${message(error)}`)
    }
    seam('agent/request', () => observe.trackRequests(agent))
    seam('agent/request-error', () => observe.trackRetries(agent))
    health.reactivate(...activation())
  }))
  seam('llm/stream', on === undefined ? undefined : () => on('llm/stream', (options, next) => observe.onStream(options, next)))
  seam('session/event', on === undefined ? undefined : () => on('session/event', (session, event) => observe.onEvent(session, event)))
  seam('session/disposed', on === undefined ? undefined : () => on('session/disposed', (session) => {
    observe.onDisposed(session)
    observe.forget(session.id)
  }))
  seam('user-questions/request', on === undefined ? undefined : () => on('user-questions/request', (request, next) => observe.onQuestions(request, next), { prepend: true }))

  // The loop board's daily self-check entry (§6.4); without the board the background check below still runs, and the health says so without degrading (§9.1).
  const handSelfcheck = (loops: LoopsService): void => {
    const run = async (action: string, event: LoopEventRecord): Promise<HarnessResult> => {
      if (action !== 'metrics.selfcheck') return { outcome: 'failed', reason: `指标行没有动作 ${action}` }
      try {
        const found = await (config.selfcheck ?? defaultSelfcheck)(event.project)
        const findings = findingsOf(found)
        checked.set(event.project, found)
        return findings === undefined ? { outcome: 'skipped', reason: 'clean' } : { outcome: 'done' }
      }
      catch (error) {
        return { outcome: 'skipped', reason: message(error).slice(0, 120) }
      }
    }
    const contribution: Contribution = {
      entries: [METRICS_SELF_CHECK_ENTRY],
      actions: [{ id: 'metrics.selfcheck', title: '检查指标记录' }],
      run,
    }
    try {
      const result = loops.contribute({ plugin: 'dsh-hourness', row: 'glm-hourness/metrics' }, contribution)
      say(result.ok
        ? result.accepted.includes('metrics.selfcheck')
          ? '自查条目已交给循环板'
          : `自查条目没有交上：${result.dropped.map(drop => `${drop.id}（${drop.reason}）`).join('、')}`
        : `自查条目没有交上：${result.reason}`, false)
    }
    catch (error) {
      say(`自查条目没有交上：${message(error)}`, false)
    }
    health.reactivate(...activation())
  }

  if (typeof ctx.inject === 'function') {
    // The board's service is cordis' too; `InjectableServices` lists only the host's own, so the waiting takes the name as a string.
    const injectLoops = ctx.inject as unknown as ((names: readonly string[], callback: (services: { readonly glmHournessLoops?: unknown }) => (() => void) | void) => unknown) | undefined
    try {
      injectLoops?.([LOOPS_SERVICE], (services) => {
        const value = services.glmHournessLoops ?? (typeof (services as ServiceLookup).get === 'function' ? (services as ServiceLookup).get?.(LOOPS_SERVICE) : undefined)
        const loops = value === undefined ? undefined : loopsService({ get: () => value }, text => say(text, false))
        if (loops !== undefined) handSelfcheck(loops)
        return () => { say('循环板不在，每天一次的自查条目没有交，后台自查照跑', false) }
      })
    }
    catch (error) {
      say(`循环板的接不上：${message(error)}`, false)
    }
  }
  if (agents() === undefined) say('没有 agents 服务，模型调用与问人的事件只计数', true)
  if (pricingService(ctx) === undefined) say('积分口径：未提供', false)
  health.reactivate(...activation())

  /** The self-check the row runs itself (§6.4): yesterday and today, read-only, judged by the row's own clock. */
  async function defaultSelfcheck(root: string): Promise<LogFindings> {
    const window = selfcheckWindow(now)
    return checkLog(root, { from: window.from, to: window.to, now })
  }

  /** The one background self-check of a project (§6.4): after the first write succeeded; a write that has not landed yet tries again shortly. */
  function scheduleSelfcheck(root: string, attempt = 0): void {
    const timer = config.timer ?? realTimer
    timer(() => {
      void (async () => {
        if ((writers.status().get(root)?.written ?? 0) === 0 && attempt < 3) {
          scheduleSelfcheck(root, attempt + 1)
          return
        }
        try {
          const found = await (config.selfcheck ?? defaultSelfcheck)(root)
          checked.set(root, found)
          const findings = findingsOf(found)
          if (findings !== undefined) say(`自查有发现：${findings}`, true)
          health.reactivate(...activation())
          for (const sessionId of reported.get(root) ?? []) reportSession(sessionId, root)
        }
        catch (error) {
          problem(`the self-check of ${root} failed: ${message(error)}`)
        }
      })()
    }, attempt === 0 ? config.checkDelay ?? 30_000 : 250)
  }

  return () => {
    for (const dispose of disposers.splice(0).reverse()) dispose()
    void writers.close()
  }
}
