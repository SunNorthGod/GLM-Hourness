/**
 * dsh-hourness row: the `/hourness` human command renders the audit journal
 * and the project graph — morning report (exceptions → what waits for the
 * person → usage), the usage panel and the quota section — from the project
 * directory (dispatch calls, violations), the project graph of the calling
 * session (the asks) and the user-level directory (usage and its gap file,
 * docs/DESIGN.md §2.4). Pure data plane from src/report/panel.ts and
 * src/workflow/morning-report.ts; no separate bookkeeping. The panel prices
 * calls through the pricing service the GLM channel package's glm-login row
 * provides (src/shared/pricing.ts), read per invocation; without it the
 * panel lists calls and tokens. The same service gives the peak line and,
 * with its `quota` member, the quota section; the orchestration package
 * holds none of the plan's words. Registers through the DSH commands seam
 * (command-compact is the reference shape); the directories are resolved per
 * invocation, and a missing one is named in the output. The row also
 * registers `/hourness-status`, the row health table of both packages, so it
 * can be read without the GLM channel package. Its status view
 * `glmHournessStatus/hourness` (src/shared/status-host.ts) submits the peak
 * line, the usage list and the quota section as the status hub's entries
 * `rules/peak`, `glm/usage` and `glm/quota` (src/report/panel.ts
 * `peakStatusItems`, `usageStatusItems`, `quotaStatusItems`), and the 面板
 * and 额度 sections read them back through the collector
 * (src/report/status.ts) instead of recomputing them. The quota read is
 * asynchronous, so the command reads once per invocation (the reading moment
 * M6 fixed) and the view serves that reading.
 */
import { readFileSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { graphService } from '../graph/service.ts'
import { loadGraph } from '../graph/store.ts'
import { auditPaths } from '../memory/audit.ts'
import { localDay, reportFromFiles, type GraphReader, type ReportOptions } from '../workflow/morning-report.ts'
import { gapLines, NO_PRICING_LINE, parseGaps, peakStatusItems, quotaSection, quotaStatusItems, rangeLine, usagePanel, usageStatusItems } from './panel.ts'
import { collectStatus, statusPlaceholders } from './status.ts'
import { dataHomes, type DataHomes } from '../shared/data-home.ts'
import { collectHealth, provideRowHealth, renderHealthTable, sessionIdOf, type HealthState } from '../shared/health.ts'
import { provideRowStatus } from '../shared/status-host.ts'
import { pricingService, quotaOf, type UsagePricing } from '../shared/pricing.ts'
import type { MomentZone } from '../shared/quota.ts'
import type { StatusItem } from '../shared/status.ts'
import type { CommandDefinitionLike, CommandsHost, ProvideHost, ServiceLookup } from '../shared/dsh-min.ts'

export interface HournessConfig {
  /** The project directory (workspace `.llm`); decisions and violations live under `<home>/audit`. Defaults to the data service's. */
  readonly home?: string
  /** Reads one file's text for the usage item's journal (the status view is synchronous); tests inject it, the host reads from disk. */
  readonly readFile?: (path: string) => string
  /** The clock the entries' asOf are stamped with and the quota is worded against; default the wall clock. */
  readonly now?: () => Date
  /** The display zone, minutes east of UTC, for the entries' times; tests set it, the host's offset otherwise. The peak hours do not follow it. */
  readonly offsetMinutes?: number
}

export interface RenderOptions {
  /** The pricing service; without it the panel lists calls and tokens. */
  readonly pricing?: UsagePricing | undefined
  /** Hears about a pricing service that throws. */
  readonly problem?: ((message: string) => void) | undefined
  /** Injected fs for tests. */
  readonly fs?: { readFile(path: string): Promise<string> }
  readonly now?: Date
  /** The display zone, minutes east of UTC; tests set it, the host's offset otherwise. The peak hours do not follow it. */
  readonly offsetMinutes?: number
  /** Reads the project graph of the calling session; without it the report says the graph has no place. */
  readonly graph?: GraphReader | undefined
  /** Reads the status services of the invoking session; without it the report has no 面板 section (nothing computes the usage entry). */
  readonly status?: { readonly lookup: ServiceLookup, readonly sessionId: string | undefined }
}

/** Render the report text for the resolved directories. */
export async function renderHourness(homes: DataHomes, options: RenderOptions = {}): Promise<string> {
  const fs = options.fs ?? { readFile: (path: string) => readFile(path, 'utf8') }
  const now = options.now ?? new Date()
  const nowMs = now.getTime()
  // The period is the local calendar day; the report covers that day only.
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const zone: MomentZone = options.offsetMinutes === undefined ? {} : { offsetMinutes: options.offsetMinutes }
  const graph = options.graph ?? (() => Promise.reject(new Error('这次调用没有给出项目图的位置')))
  const reportOptions: ReportOptions = { pricing: options.pricing, problem: options.problem, now: nowMs, offsetMinutes: options.offsetMinutes }
  const report = await reportFromFiles(fs, homes, localDay(dayStart), graph, dayStart.toISOString(), reportOptions)
  const missing = [
    ...(homes.projectHome === undefined ? ['- 项目目录未配置（行配置 home 或数据目录行的 projectHome），决策与违规流水读不到'] : []),
    ...(homes.userHome === undefined ? ['- 用户级目录不可用（数据目录行 glm-hourness/data 未启用），用量流水读不到'] : []),
  ]
  const notice = missing.length === 0 ? '' : ['', '## 数据目录', ...missing].join('\n')
  const paths = auditPaths(homes)
  // The 面板 and 额度 sections are the hub's entries (status hub design 0.3 §10), read once through
  // the collector: `rules/peak` is the peak line, `glm/usage` the list with its basis and scope around
  // it, `glm/quota` the server's reading. The section lays them out; the entries carry the words.
  const collected = options.status === undefined ? undefined : collectStatus(options.status.lookup, options.status.sessionId, 'agent', nowMs)
  const usage = collected?.items.find(item => item.id === 'glm/usage')
  const peak = collected?.items.find(item => item.id === 'rules/peak')
  const quota = collected?.items.find(item => item.id === 'glm/quota')
  let summary = ''
  if (usage !== undefined) {
    const gapRaw = paths.gaps === undefined ? '' : await fs.readFile(paths.gaps).catch(() => '')
    const scope = [rangeLine(coverageOf(usage), nowMs, zone), ...gapLines(parseGaps(gapRaw), nowMs, zone)]
    const basis = options.pricing === undefined ? NO_PRICING_LINE : `- ${options.pricing.basis}`
    summary = ['', '## 面板', ...(peak === undefined ? [] : [peak.text]), basis, ...scope, usage.text, ...(usage.detail ?? [])].join('\n')
  }
  else if (collected !== undefined) {
    const placeholders = statusPlaceholders(collected.rows)
    if (placeholders.length > 0) summary = ['', '## 面板', ...placeholders].join('\n')
  }
  const quotaText = quota === undefined ? '' : ['', '## 额度', quota.text, ...(quota.detail ?? [])].join('\n')
  return report + summary + quotaText + notice
}

/** The records coverage the 范围 line states, as the usage entry's fields carry it. */
function coverageOf(item: StatusItem): { records: number, earliest?: number } {
  const fields = item.fields ?? {}
  const earliest = fields.earliest
  return { records: typeof fields.records === 'number' ? fields.records : 0, ...(typeof earliest === 'number' ? { earliest } : {}) }
}

/**
 * The way to read the project graph of the session that ran `/hourness`: the
 * graph row says where it is (`glmHournessGraph`, read at the call), the
 * session's working directory picks it. The reader rejects with the reason, in
 * the words the report shows, when the row is off, the session has no
 * working directory, the directory is not there or the graph cannot be read.
 */
function graphReader(ctx: ServiceLookup, cwd: string | undefined): GraphReader {
  return async () => {
    const graph = graphService(ctx)
    if (graph === undefined) throw new Error('项目图行 glm-hourness/graph 没有启用')
    const dir = graph.dirFor(cwd)
    if (dir === undefined) throw new Error('这个会话没有工作目录，找不到项目图')
    if (!await stat(dir).then(info => info.isDirectory(), () => false)) throw new Error(`项目图目录 ${dir} 不存在`)
    try {
      return await loadGraph(dir)
    }
    catch (error) {
      throw new Error(`读图出错：${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
  }
}

/** cordis plugin identity: needs the commands service (/hourness). */
export const name = 'dsh-glm-hourness/hourness'
export const inject = ['commands']

/**
 * The row's status for one invocation's session (row health): which
 * journals the report can read, whether the panel has a pricing service and
 * whether that service reads the quota. A missing pricing service or quota
 * does not lower the status.
 */
export function hournessHealth(homes: DataHomes, priced: boolean, quota: boolean): [HealthState, string] {
  const missing = [
    ...(homes.projectHome === undefined ? ['项目目录未配置，决策与违规读不到'] : []),
    ...(homes.userHome === undefined ? ['用户级目录不可用，用量读不到'] : []),
  ]
  const pricing = priced ? '积分口径：已提供' : '积分口径：未提供，按 token 列'
  const quotaNote = quota ? '额度：已提供' : '额度：未提供'
  if (missing.length === 0) return ['active', `报告读取项目目录与用户级目录；${pricing}；${quotaNote}`]
  return [missing.length === 2 ? 'inactive' : 'degraded', [...missing, pricing, quotaNote].join('；')]
}

/**
 * `/hourness-status`: the row health table of both packages for the
 * invoking session, the one `/glm-status` prints after its credential line
 * (src/shared/health.ts). It reads the views only; the hourness row does not
 * report for it.
 */
function statusCommand(ctx: ServiceLookup): CommandDefinitionLike {
  return {
    definitionId: 'dsh-glm-hourness/hourness-status',
    name: 'hourness-status',
    description: '查看两个包各行的健康',
    handler: (invocation) => {
      if (invocation.rawInput.trim().length > 0) return Promise.resolve({ kind: 'error', text: '用法：/hourness-status（无需参数）' })
      const sessionId = sessionIdOf(invocation.agent)
      return Promise.resolve({ kind: 'success', text: renderHealthTable(collectHealth(ctx, sessionId), sessionId) })
    },
  }
}

/** cordis plugin entry: register `/hourness` and `/hourness-status`. */
export function apply(ctx: CommandsHost & ServiceLookup & Partial<ProvideHost>, config: HournessConfig = {}): () => void {
  const health = provideRowHealth(ctx, 'hourness', 'active', '/hourness、/hourness-status 已注册')
  // A malformed or throwing pricing service is warned about once per row.
  let warned = false
  const problem = (message: string): void => {
    if (!warned) console.warn(`dsh-glm-hourness/hourness: ${message}`)
    warned = true
  }
  // The row's status view (status hub design 0.3 §3.2, §10): the peak line, the usage list and the
  // quota section as the entries `rules/peak`, `glm/usage` and `glm/quota`, computed when the
  // collector asks. The journals are the account of the whole user-level directory, so the session id
  // does not change them. A journal that is not there yet is no entry, not an error; one that cannot
  // be read is, and the collector takes the placeholder. The quota read is asynchronous (at most
  // three seconds) while the view is synchronous, so the row reads when the human runs /hourness (the
  // reading moment M6 fixed) and the view serves that reading until the next one.
  const readFile = config.readFile ?? ((path: string) => readFileSync(path, 'utf8'))
  const clock = config.now ?? (() => new Date())
  const zone = config.offsetMinutes === undefined ? undefined : { offsetMinutes: config.offsetMinutes }
  let quotaCache: { readonly at: number, readonly lines: readonly string[] } | undefined
  const refreshQuota = async (pricing: UsagePricing): Promise<void> => {
    const at = clock().getTime()
    quotaCache = { at, lines: await quotaSection(pricing, at, zone, problem) }
  }
  const status = provideRowStatus(ctx, 'hourness', () => {
    const items: StatusItem[] = []
    const pricing = pricingService(ctx, problem)
    if (pricing !== undefined) {
      items.push(...peakStatusItems(pricing, clock().getTime(), zone, problem))
      // The cached reading belongs to the service: with it gone (the GLM package unloaded), no entry.
      if (quotaCache !== undefined) items.push(...quotaStatusItems(quotaCache.lines, quotaCache.at))
    }
    const path = auditPaths(dataHomes(ctx, config.home)).usage
    if (path !== undefined) {
      let raw: string
      try {
        raw = readFile(path)
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return items
        throw error
      }
      if (raw.length > 0) items.push(...usageStatusItems(usagePanel(raw, pricing, problem), path, clock().getTime()))
    }
    return items
  })
  const unregister = ctx.commands.register({
    definitionId: 'dsh-glm-hourness/hourness',
    name: 'hourness',
    description: '晨报与积分用量（读审计流水）',
    handler: async invocation => {
      if (invocation.rawInput.trim().length > 0) {
        return { kind: 'error', text: '用法：/hourness（无需参数）' }
      }
      const homes = dataHomes(ctx, config.home)
      const pricing = pricingService(ctx, problem)
      // The quota member is judged again where it is read, which reports a wrong shape; the status only says whether it is there.
      health.report(sessionIdOf(invocation.agent), ...hournessHealth(homes, pricing !== undefined, pricing !== undefined && quotaOf(pricing) !== undefined))
      if (pricing !== undefined) await refreshQuota(pricing)
      try {
        return { kind: 'success', text: await renderHourness(homes, { pricing, problem, graph: graphReader(ctx, invocation.agent?.session?.header?.cwd), ...(config.offsetMinutes === undefined ? {} : { offsetMinutes: config.offsetMinutes }), status: { lookup: ctx, sessionId: sessionIdOf(invocation.agent) } }) }
      }
      catch (error) {
        return { kind: 'error', text: `晨报生成失败：${(error as Error).message}` }
      }
    },
  })
  const unregisterStatus = ctx.commands.register(statusCommand(ctx))
  return () => {
    unregisterStatus()
    unregister()
    status.dispose()
    health.dispose()
  }
}
