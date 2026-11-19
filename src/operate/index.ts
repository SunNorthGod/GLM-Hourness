/**
 * glm-hourness/operate row (M7 design 0.6 §3.10, §3.11.1, §3.11.2): the
 * reports row. It registers `hourness_report` for the main agent — kind
 * `morning` renders the four-answers report (src/report/four-answers.ts),
 * kind `weekly` the weekly one (src/report/weekly.ts), kind `patrol` the
 * nightly patrol (src/operate/patrol.ts) — and hands the three time entries
 * (src/operate/entries.ts) to the loop board (`glmHournessLoops`), whose DSH
 * timers deliver their tell to the holder session; the row runs nothing
 * itself.
 *
 * The reports read the status hub's agent entries through the collector
 * (src/report/status.ts) — the rows other modules own are never recomputed
 * here — and the project's own records from the graph (`glmHournessGraph`,
 * the asks) and `<proj>/.llm/execute/` (the checks, the advances, the
 * drive). The tool result goes to the model, so the collector runs at the
 * `agent` audience only; every call emits `operate.report` for the project
 * it was made for. The caller must be the main agent: the face filter keeps
 * the tool from the dispatched chain already (src/execute/faces.ts), and the
 * body checks the caller again. Activation never throws: a missing service
 * warns and says why in the row health. Ships disabled
 * (packages/hourness/cordis.patch.yml).
 */
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { projectOf } from '../data/project-root.ts'
import { isMainAgentFor } from '../data/main-agent.ts'
import { readAdvances, readChecks, runLine } from '../execute/check.ts'
import { createGit, type Git } from '../execute/git.ts'
import { readDrive } from '../execute/drive-log.ts'
import { graphService } from '../graph/service.ts'
import { loadGraph } from '../graph/store.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import { journalRecords, type GuardRecord } from '../guard/records.ts'
import { auditPaths } from '../memory/audit.ts'
import { LOOPS_SERVICE, loopsService, type Contribution, type LoopsService } from '../loops/service.ts'
import { metricsOf } from '../shared/metrics.ts'
import { provideRowHealth, sessionIdOf } from '../shared/health.ts'
import { disposerList } from '../shared/row-support.ts'
import { dataHomes } from '../shared/data-home.ts'
import type { AgentLike, InjectHost, ProvideHost, ServiceLookup, ToolDefinitionLike, ToolExecutionContext } from '../shared/dsh-min.ts'
import type { StatusItem } from '../shared/status.ts'
import { errorText, isRecord, mainAgentCall, refuse, toolShell } from '../design/tool-support.ts'
import { collectStatus, statusPlaceholders } from '../report/status.ts'
import { fourAnswers } from '../report/four-answers.ts'
import { dora, doraBody } from '../report/metrics.ts'
import { weeklyReport } from '../report/weekly.ts'
import { askSummary, localDay, readEffects } from '../report/morning-report.ts'
import { patrolRun } from './patrol.ts'
import { OPERATE_ENTRIES, OPERATE_ROW_SOURCE } from './entries.ts'

/** cordis plugin identity. */
export const name = 'dsh-glm-hourness/operate'

/** The row's context: service lookup, provision, injection, and the agent lifecycle when the host has it. */
export interface OperateContext extends ServiceLookup, Partial<InjectHost>, Partial<ProvideHost> {
  on?(event: 'agent/created', listener: (payload: { agent: AgentLike }) => Promise<void> | void): () => void
}

const DESCRIPTION = 'The scheduled reports (hourness): kind "morning" is the four-answers morning report, kind "weekly" the weekly one, kind "patrol" the nightly patrol. Reply with the returned text unchanged.'

const PARAMETERS = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['morning', 'weekly', 'patrol'], description: 'morning: the four-answers morning report. weekly: the weekly report. patrol: the nightly patrol.' },
  },
  required: ['kind'],
}

const OUTPUT = {
  type: 'object',
  properties: { text: { type: 'string', description: 'The report, in plain words for the person.' } },
  required: ['text'],
}

/** The result is the report text itself: the model relays it verbatim, so no JSON wrapper stands between. */
const render: ToolDefinitionLike['output']['render'] = (_args, value) => [{ type: 'text', text: (value as { text: string }).text }]

/** What the tool reads through: injectable for the L2 specs, wired from the context in `apply`. The git and command layers feed the patrol. */
export interface OperateDeps {
  readonly lookup: ServiceLookup
  readonly isMain: (agent: AgentLike) => boolean
  readonly graphDirOf: (cwd: string | undefined) => string | undefined
  readonly now?: () => number
  readonly git?: Git
  readonly runLine?: (command: string, cwd: string, logFile: string, timeoutMs: number, signal: AbortSignal) => Promise<{ readonly exit: number, readonly ms: number, readonly problem?: string }>
}

/** The patrol's deps from the tool's: the git and command layers default to the real ones. */
function patrolDepsFrom(deps: OperateDeps): Parameters<typeof patrolRun>[0] {
  const now = deps.now
  return {
    lookup: deps.lookup,
    graphDirOf: deps.graphDirOf,
    git: deps.git ?? createGit(),
    runLine: deps.runLine ?? runLine,
    ...(now === undefined ? {} : { now: (): Date => new Date(now()) }),
  }
}

/** The project graph, or why it could not be read — the wording the reports carry. */
async function readGraph(dir: string | undefined): Promise<LoadedGraph | { readonly unreadable: string }> {
  if (dir === undefined) return { unreadable: '项目图行 glm-hourness/graph 没有启用，或这个会话没有工作目录' }
  if (!await stat(dir).then(info => info.isDirectory(), () => false)) return { unreadable: `项目图目录 ${dir} 不存在` }
  try {
    return await loadGraph(dir)
  }
  catch (error) {
    return { unreadable: `读图出错：${errorText(error)}` }
  }
}

const WEEK_MS = 7 * 86_400_000

/**
 * The project's violation journal, the ladder proposals' counts
 * (§3.12.2): the records under the project directory's audit path. A
 * missing or unreadable journal is no journal — the weekly report makes no
 * ladder proposal, and nothing throws.
 */
async function readViolations(lookup: ServiceLookup): Promise<readonly GuardRecord[] | undefined> {
  const path = auditPaths(dataHomes(lookup, undefined)).violations
  if (path === undefined) return undefined
  try {
    return journalRecords(await readFile(path, 'utf8'))
  }
  catch {
    return undefined
  }
}

/**
 * `hourness_report {kind}` (M7 design 0.6 §3.10, §3.11.2, §3.12.4): the main
 * agent's report tool. The status hub's agent entries come through the
 * collector at the `agent` audience; the graph, the checks, the advances and
 * the drive are the project's own records. The morning report covers the
 * local calendar day, the weekly one the trailing seven days — the same
 * windows the /hourness report and the metrics board's relayed group use.
 * The patrol kind runs the nightly patrol (src/operate/patrol.ts).
 */
export function hournessReportTool(deps: OperateDeps): ToolDefinitionLike {
  return {
    ...toolShell('hourness_report', DESCRIPTION, PARAMETERS, OUTPUT),
    output: { schema: OUTPUT, render },
    async execute(args: unknown, exec: ToolExecutionContext): Promise<{ text: string }> {
      const { agent } = mainAgentCall(deps.isMain, exec, { message: 'only the main agent reads the reports', hint: 'the reports are yours to relay: pass kind "morning", "weekly" or "patrol"' })
      const kind = isRecord(args) && (args.kind === 'morning' || args.kind === 'weekly' || args.kind === 'patrol') ? args.kind : undefined
      if (kind === undefined) refuse('invalid', 'kind must be "morning", "weekly" or "patrol"', 'pass kind "morning" for the four-answers morning report, "weekly" for the weekly report, "patrol" for the nightly patrol')
      if (kind === 'patrol') return patrolRun(patrolDepsFrom(deps), agent)
      const cwd = agent.session?.header.cwd
      const sessionId = sessionIdOf(agent)
      const nowMs = (deps.now ?? Date.now)()
      const dayStart = new Date(nowMs)
      dayStart.setHours(0, 0, 0, 0)
      const period = localDay(new Date(nowMs))
      const since = kind === 'weekly' ? new Date(nowMs - WEEK_MS).toISOString() : dayStart.toISOString()
      const collected = collectStatus(deps.lookup, sessionId, 'agent', nowMs)
      const status: readonly StatusItem[] = collected.items
      const placeholders = statusPlaceholders(collected.rows)
      const graph = await readGraph(deps.graphDirOf(typeof cwd === 'string' ? cwd : undefined))
      const root = typeof cwd === 'string' && cwd.length > 0 ? projectOf(cwd)?.root : undefined
      const execDir = root === undefined ? undefined : join(root, '.llm', 'execute')
      const [checks, advances, drive] = execDir === undefined
        ? [[] as const, [] as const, [] as const]
        : await Promise.all([
            readChecks(execDir).catch(() => [] as const),
            readAdvances(execDir).catch(() => [] as const),
            readDrive(execDir).catch(() => [] as const),
          ])
      const where = { ...(sessionId === undefined ? {} : { sessionId }), ...(typeof cwd === 'string' && cwd.length > 0 ? { dir: cwd } : {}) }
      const metrics = root === undefined
        ? { reason: '这个会话没有可归的项目' }
        : { root }
      const effects = 'nodes' in graph ? await readEffects(graph, metrics, nowMs) : []
      // The violation journal rides the weekly call only (§3.12.2): the ladder proposals' counts read it.
      const violations = kind === 'weekly' ? await readViolations(deps.lookup) : undefined
      const text = kind === 'morning'
        ? fourAnswers({
            period,
            nowMs,
            since,
            status,
            graph,
            ...('nodes' in graph ? { asks: askSummary(graph, since) } : {}),
            checks,
            advances,
            drive,
            effects,
            ...(placeholders.length > 0 ? { placeholders } : {}),
          })
        : weeklyReport({
            period,
            nowMs,
            since,
            status,
            graph,
            ...(violations === undefined ? {} : { violations }),
            ...(placeholders.length > 0 ? { placeholders } : {}),
          })
      metricsOf(deps.lookup)?.emit({ k: 'operate.report', by: 'operate', body: { kind, lines: text.split('\n').length, units: [...text].length } }, where)
      // The four delivery numbers ride the weekly call (M7 design 0.6 §3.13, m7-9): computed from the
      // same records the report read, emitted into the metrics journal, never into the report text
      // (`d-metrics-ratios-person-only` — ratios stay off the model context).
      if (kind === 'weekly') {
        const numbers = dora({ nowMs, sinceMs: Date.parse(since), advances, checks, graph: 'nodes' in graph ? graph : undefined })
        metricsOf(deps.lookup)?.emit({ k: 'operate.dora', by: 'operate', body: doraBody(numbers) }, where)
      }
      return { text }
    },
  }
}

/** cordis plugin entry: register the tool and hand the time entries to the loop board. */
export function apply(ctx: OperateContext, _config = {}): () => void {
  const { list: disposers, drain: dispose } = disposerList()
  const health = provideRowHealth(ctx, 'operate', 'active', '已加载；hourness_report 在本行，晨报、周报与巡检三条时间条目交给循环板')
  disposers.push(() => { health.dispose() })
  let toolsNote: string | undefined = '报告行的工具要工具服务（tools）'
  let boardNote: string | undefined = '循环板不在：晨报、周报与巡检不会到点出现'
  const reactivate = (): void => {
    const notes = [toolsNote, boardNote].filter(note => note !== undefined)
    health.reactivate(notes.length > 0 ? 'degraded' : 'active', notes.length > 0 ? notes.join('；') : '已加载；hourness_report 在本行，晨报、周报与巡检三条时间条目交给循环板')
  }
  const isMain = (agent: AgentLike): boolean => {
    // The main flag alone: a read that came back with a note still names the
    // reader (a project without the design row has no holder record, and
    // there every root agent counts — M5 design §4.2.1's same fallback). The
    // execute row is stricter because its gate dispatches work; the reports
    // only read.
    return isMainAgentFor(ctx, agent).main
  }
  const graphDirOf = (cwd: string | undefined): string | undefined => graphService(ctx)?.dirFor(cwd)

  if (typeof ctx.inject === 'function') {
    try {
      ctx.inject(['tools'], toolsCtx => {
        let undo: () => void
        try {
          undo = toolsCtx.tools.register(hournessReportTool({ lookup: ctx, isMain, graphDirOf }))
        }
        catch (error) {
          const reason = errorText(error)
          console.warn(`${name}: registering hourness_report failed: ${reason}`)
          toolsNote = `报告行的工具没注册上：${reason}`
          reactivate()
          return undefined
        }
        toolsNote = undefined
        reactivate()
        return () => {
          undo()
          toolsNote = '报告行的工具要工具服务（tools）'
          reactivate()
        }
      })
    }
    catch (error) {
      const reason = errorText(error)
      console.warn(`${name}: registering hourness_report failed: ${reason}`)
      toolsNote = `报告行的工具没注册上：${reason}`
    }
  }
  else toolsNote = '宿主没有 inject，报告行的工具拿不到工具服务'

  /** Hand the two time entries over; `problem` names a service whose shape is wrong. The same source replaces its own hand-over whole. */
  const handOver = (found: LoopsService | undefined, problem?: string): void => {
    if (found === undefined) {
      boardNote = problem === undefined ? '循环板不在：晨报、周报与巡检不会到点出现' : `循环板接口与报告行不符：${problem}`
      reactivate()
      return
    }
    const contribution: Contribution = { entries: [...OPERATE_ENTRIES] }
    try {
      const result = found.contribute(OPERATE_ROW_SOURCE, contribution)
      boardNote = result.ok ? undefined : `循环板没收下报告行的时间条目：${result.reason}`
    }
    catch (error) {
      boardNote = `循环板没收下报告行的时间条目：${error instanceof Error ? error.message : String(error)}`
    }
    reactivate()
  }
  if (typeof ctx.inject === 'function') {
    // InjectableServices lists only the host's own services, so the board's name goes in as a string (the metrics row does the same).
    const wait = ctx.inject as (names: readonly string[], run: (sub: ServiceLookup) => (() => void) | void) => unknown
    try {
      wait([LOOPS_SERVICE], (sub) => {
        let problem: string | undefined
        handOver(loopsService(sub, (message) => { problem = message }), problem)
        return undefined
      })
    }
    catch (error) {
      boardNote = `循环板没有等到：晨报、周报与巡检不会到点出现（${error instanceof Error ? error.message : String(error)}）`
    }
  }
  else boardNote = '宿主没有 inject，报告行的时间条目交不到循环板'
  if (ctx.on !== undefined) {
    try {
      // Where inject does not reach a service of this package (V12), the hand-over rides agent creation; the same service keeps the standing one.
      disposers.push(ctx.on('agent/created', () => {
        let problem: string | undefined
        const loops = loopsService(ctx, (message) => { problem = message })
        if (loops !== undefined || problem !== undefined) handOver(loops, problem)
      }))
    }
    catch (error) {
      console.warn(`${name}: agent/created is not listened to; the time entries follow the board's arrivals only: ${errorText(error)}`)
    }
  }
  reactivate()
  return dispose
}
