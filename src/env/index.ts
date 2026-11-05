/**
 * glm-hourness/env row entry (M4 design §7; docs/ORCHESTRATION.md §7.1,
 * §7.4, §7.6): at agent creation installs the environment notice
 * (notice.ts) — the project's tools from the graph's `env` branch, the
 * checks that run after edits, and the scratch area — at the session's
 * first step and whenever the branch changes; before the first notice for a
 * repository makes the project's `.llm/` git-ignored
 * (src/data/llm-ignore.ts), so the harness's runtime records never show up
 * in git; and once per repository and day counts the repository's
 * suppression comments into the project's `.llm/audit/
 * suppressions.jsonl` (suppressions.ts, m4-suppressions).
 *
 * For the loop board (m4-checks, design §6.1.2, §6.2, §6.8) it provides the
 * service `glmHournessEnv` (env-service.ts: the command of one approved
 * check line, which the board's check entries run), hands the board the event
 * `env.files-edited` and the entry `env.checks-after-edit` (loop-entry.ts),
 * and at each step of every agent emits that event for the files the agent
 * changed (edited.ts) when an entry of the board hears it. With the board on,
 * the same step runs M4's own checks (runner.ts: the check lines with `when`
 * of the approved tool nodes) and hands the agent the checks notice; each
 * delivery of results is one run of the board's entry. It registers the tool
 * check_limit (limit-tool.ts, every route, the root agent's only): the main
 * agent raises or resets the ceiling of one check held at it, which the
 * root agent's environment notice says. Ships enabled since m4-checks B6.
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { installStepNotice } from '../shared/step-notice.ts'
import { ensureLlmIgnored } from '../data/llm-ignore.ts'
import { projectHomeFor } from '../data/project-home.ts'
import { projectOf } from '../data/project-root.ts'
import { dataService } from '../shared/data-home.ts'
import { provideRowHealth, sessionIdOf, type HealthState, type RowHealth } from '../shared/health.ts'
import { provideRowStatus } from '../shared/status-host.ts'
import type { AgentLike, ProvideHost, ServiceLookup, SessionLike, ToolExecutionContext, ToolsLike } from '../shared/dsh-min.ts'
import { graphService } from '../graph/service.ts'
import { installContribution, loopsService } from '../loops/service.ts'
import { installFilesEdited } from './edited.ts'
import { createEnvService, ENV_SERVICE } from './env-service.ts'
import { CHECK_LIMIT_DESCRIPTION, CHECK_LIMIT_PARAMETERS, checkLimit, limitsFile, parseLimits } from './limit-tool.ts'
import { CHECKS_ENTRY_ID, envContribution, ENV_ROW_SOURCE } from './loop-entry.ts'
import { envNotice } from './notice.ts'
import { createChecker, readOwnChecks } from './runner.ts'
import { emitSuppressionCount } from './metrics.ts'
import { dailySuppressions, type SuppressionRecord } from './suppressions.ts'
import { checkTimeouts, envStatusItems, envTimeoutItems } from './status.ts'
import { parseTiming, timingFile } from './timeout.ts'

/** The row's context: the agent lifecycle event, service lookup and provision, the tools service, and cordis inject when the host has it. */
export interface EnvContext extends ServiceLookup, Partial<ProvideHost> {
  /** The tools service, for check_limit's registration (the row injects it; a host without it registers nothing). */
  readonly tools?: ToolsLike
  /** cordis inject: the loop board's service is package-provided, so the row reaches it by name (design §6.8). */
  inject?(names: readonly string[], callback: (sub: ServiceLookup) => (() => void) | void): unknown
  /** Awaited serially before agent creation resolves; the first step sees the effects. */
  on(event: 'agent/created', listener: (payload: { agent: AgentLike }) => Promise<void> | void): () => void
}

/** Row settings: the status view's injected read (tests); nothing else reads it. */
export interface EnvConfig {
  /** Reads one file's text for the status entry's journal (the status view is synchronous); tests inject it, the host reads from disk. */
  readonly readFile?: ((path: string) => string) | undefined
}

/** cordis plugin identity: the tools service, for check_limit's registration. */
export const name = 'dsh-glm-hourness/env'
export const inject = ['tools']

/** Row health for one session: where the notice read its branch, and the state of the `.llm/` ignore. */
export function envHealth(graph: string | undefined, ignore: { readonly kind: 'ignored', readonly appended: boolean } | { readonly kind: 'no-git' } | { readonly kind: 'unwritable' | 'visible', readonly reason: string } | undefined): [HealthState, string] {
  const parts = [
    ...(graph === undefined ? ['环境提醒无项目图，只带草稿区一行'] : [`环境提醒读图 ${graph}`]),
    ...(ignore === undefined ? [] : ignore.kind === 'ignored' && ignore.appended ? ['已把 .llm/ 写进 .git/info/exclude'] : ignore.kind === 'visible' ? [`项目的 .llm/ 没有被 git 忽略：${ignore.reason}`] : ignore.kind === 'unwritable' ? [`.llm/ 的忽略行写不进：${ignore.reason}`] : []),
  ]
  const degraded = ignore?.kind === 'visible' || ignore?.kind === 'unwritable'
  return degraded ? ['degraded', parts.join('；')] : ['active', parts.join('；')]
}

/** Install the environment notice on one agent, and settle the repository work (ignore, daily count) once. */
export function installEnvNotice(ctx: EnvContext, agent: AgentLike, health: RowHealth): (() => void) | undefined {
  const session = agent.session
  if (session === undefined) {
    console.warn(`${name}: environment notice not installed for agent ${agent.id}: no session`)
    return undefined
  }
  const sessionId = sessionIdOf(agent)
  const settled = installWork(ctx, session, health, sessionId)
  const uninstall = installStepNotice(agent, 'environment notice', () => true, async (history, { session: stepSession }) => {
    await settled
    return await envNotice(ctx, history, stepSession)
  }, 'env')
  return uninstall ?? undefined
}

/**
 * The first-install work for one session's repository, in order: the
 * `.llm/` ignore (its outcome goes to the row health), then the daily
 * suppression count in the background. The count is fire-and-forget: a
 * failure reaches the row health, never a step. The journal is in the data
 * service's project directory of the session (`<root>/.llm`, or the
 * override a probe, calibration or test sets, so a run from a work tree of
 * this repository never writes the main checkout's `.llm/`), else
 * `<root>/.llm`.
 */
function installWork(ctx: EnvContext, session: SessionLike, health: RowHealth, sessionId: string | undefined): Promise<void> {
  return (async () => {
    const cwd = session.header.cwd
    const root = typeof cwd === 'string' ? projectOf(cwd)?.root : undefined
    const outcome = root === undefined ? undefined : await ensureLlmIgnored(root)
    if (sessionId !== undefined) health.report(sessionId, ...envHealth(graphService(ctx)?.dirFor(cwd), outcome))
    if (root === undefined) return
    const home = dataService(ctx)?.projectDirOf?.(cwd) ?? join(root, '.llm')
    void dailySuppressions(root, record => appendSuppression(home, record).then(() => emitSuppressionCount(ctx, record)), {
      lastRecord: () => lastSuppression(home),
      problem: (message) => {
        if (sessionId !== undefined) health.report(sessionId, 'degraded', `压制注释计数失败：${message}`)
        console.warn(`${name}: suppression count failed: ${message}`)
      },
    }).catch(() => {})
  })()
}

/** The suppression journal under the project directory `home`: the one file the daily count appends to and the status entry reads. */
const suppressionsPath = (home: string): string => join(home, 'audit', 'suppressions.jsonl')

/** The last record of the suppression journal under the project directory `home`, undefined when there is none. */
async function lastSuppression(home: string): Promise<SuppressionRecord | undefined> {
  try {
    const lines = (await readFile(suppressionsPath(home), 'utf8')).split('\n').filter(line => line.trim() !== '')
    return lines.at(-1) === undefined ? undefined : JSON.parse(lines.at(-1)!) as SuppressionRecord
  }
  catch {
    return undefined
  }
}

/** Append one count record to `<home>/audit/suppressions.jsonl` (home: the project directory). */
async function appendSuppression(home: string, record: SuppressionRecord): Promise<void> {
  const file = suppressionsPath(home)
  await mkdir(dirname(file), { recursive: true })
  await appendFile(file, `${JSON.stringify(record)}\n`)
}

/** Provide `glmHournessEnv`; the disposer withdraws it. A host without provide, or a failing one, is the reason returned instead. */
function provideEnvService(ctx: EnvContext): (() => void) | string {
  if (typeof ctx.provide !== 'function') return '宿主没有 provide：循环板读不到检查命令，它的 check 条目一律 check-missing'
  try {
    return ctx.provide(ENV_SERVICE, createEnvService(ctx))
  }
  catch (error) {
    return `${ENV_SERVICE} 没提供上（${error instanceof Error ? error.message : String(error)}）：循环板的 check 条目一律 check-missing`
  }
}

/** cordis plugin entry. */
export function apply(ctx: EnvContext, config: EnvConfig = {}): () => void {
  const provided = provideEnvService(ctx)
  const notProvided = typeof provided === 'string' ? provided : undefined
  if (notProvided !== undefined) console.warn(`${name}: ${notProvided}`)
  const loaded = '已加载；环境提醒在会话第一步与环境分支变化后的下一步注入'
  const health = provideRowHealth(ctx, 'env', notProvided === undefined ? 'active' : 'degraded', notProvided === undefined ? loaded : `${loaded}；${notProvided}`)
  const disposers: Array<() => void> = [() => { health.dispose() }]
  if (typeof provided === 'function') disposers.push(provided)
  const checker = createChecker({
    ctx,
    note: (sessionId, key, text, degrades) => { health.note(sessionId, key, text, degrades) },
    recordRun: (run) => { loopsService(ctx)?.recordRun({ ...run, entry: CHECKS_ENTRY_ID }) },
  })
  const installed = new WeakSet<AgentLike>()
  // The row's status view (status hub design 0.3 §3.2, §12 M4 row): the `env/suppressions` entry,
  // the latest daily count, and the `env/timeouts` entry, the checks' timeouts out of the timing
  // journal and limits.jsonl the runner writes (the same project directory, projectHomeFor),
  // computed when the collector asks. The session's repository is the working directory seen at
  // agent creation; a session the row does not know, or one outside a project, has no entry. A
  // journal that is not there yet is no entry, not an error; one that cannot be read is, and the
  // collector takes the placeholder.
  const readFile = config.readFile ?? ((path: string) => readFileSync(path, 'utf8'))
  /** A journal's text; a journal that is not there yet is empty, any other failure throws for the collector. */
  const readJournal = (file: string): string => {
    try {
      return readFile(file)
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
      throw error
    }
  }
  const sessions = new Map<string, string>()
  const status = provideRowStatus(ctx, 'env', (sessionId) => {
    const cwd = sessionId === undefined ? undefined : sessions.get(sessionId)
    const root = typeof cwd === 'string' && cwd.length > 0 ? projectOf(cwd)?.root : undefined
    if (root === undefined) return []
    const file = suppressionsPath(dataService(ctx)?.projectDirOf?.(cwd) ?? join(root, '.llm'))
    // The checks' journals are where the runner writes them (runner.ts: projectHomeFor with no row home).
    const home = projectHomeFor(ctx, undefined, cwd)
    const nowMs = Date.now()
    const timeouts = home === undefined
      ? []
      : envTimeoutItems(checkTimeouts(parseTiming(readJournal(timingFile(home))).lines, parseLimits(readJournal(limitsFile(home))).lines, nowMs), timingFile(home), nowMs)
    const raw = readJournal(file)
    const records = raw.split('\n').filter(line => line.trim().length > 0).flatMap(line => {
      try {
        const parsed: unknown = JSON.parse(line)
        if (typeof parsed !== 'object' || parsed === null) return []
        const record = parsed as Partial<SuppressionRecord>
        return typeof record.at === 'string' && typeof record.total === 'number' ? [parsed as SuppressionRecord] : []
      }
      catch {
        return []
      }
    })
    return [...envStatusItems(records, file), ...timeouts]
  })
  disposers.push(() => { status.dispose() })
  disposers.push(ctx.on('agent/created', ({ agent }) => {
    if (installed.has(agent)) return
    installed.add(agent)
    // The status view resolves the session's repository through the directory seen here (the view is synchronous; the notice's install work cannot serve it).
    const seenSession = sessionIdOf(agent)
    const seenCwd = agent.session?.header.cwd
    if (seenSession !== undefined && typeof seenCwd === 'string' && seenCwd.length > 0) sessions.set(seenSession, seenCwd)
    try {
      const notice = installEnvNotice(ctx, agent, health)
      if (notice !== undefined) disposers.push(notice)
      const edited = installFilesEdited(ctx, agent, (sessionId, problem) => { health.note(sessionId, 'files-edited', problem) }, step => checker.step(step))
      if (edited !== undefined) disposers.push(edited)
    }
    catch (error) {
      // One agent's notice must never break agent creation.
      console.warn(`${name}: environment notice not installed for agent ${agent.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }))
  // The main agent's ceiling of one check (design §6.3.1): every route; the body refuses a subagent.
  if (ctx.tools !== undefined) {
    disposers.push(ctx.tools.register({
      name: 'check_limit',
      description: CHECK_LIMIT_DESCRIPTION,
      parameters: CHECK_LIMIT_PARAMETERS,
      output: { schema: { type: 'object', properties: { outcome: { type: 'string' }, check: { type: 'string' }, capS: { type: 'number' }, previousCapS: { type: 'number' }, message: { type: 'string' } } }, render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] },
      execute: (args, exec) => {
        const { agent } = (exec ?? {}) as ToolExecutionContext
        const cwd = typeof agent?.session?.header.cwd === 'string' && agent.session.header.cwd.length > 0 ? agent.session.header.cwd : undefined
        return checkLimit(args, {
          agent,
          home: projectHomeFor(ctx, undefined, cwd),
          checks: async () => cwd === undefined ? undefined : (await readOwnChecks(ctx, cwd))?.checks.map(check => check.key),
          now: () => new Date(),
        })
      },
    }))
  }
  // The event of changed files and the checker's entry on the loop board (design §6.8): warned once and kept on the activation line when refused.
  disposers.push(installContribution(ctx, ENV_ROW_SOURCE, () => envContribution(project => checker.details(project)), CHECKS_ENTRY_ID, (message) => {
    console.warn(`${name}: ${message}`)
    health.reactivate('degraded', message)
  }))
  return () => {
    for (const disposer of disposers.splice(0).reverse()) disposer()
  }
}
