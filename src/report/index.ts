/**
 * dsh-hourness row: the `/hourness` human command renders the audit journal —
 * morning report (exceptions → decision curve → usage) plus the usage panel
 * — from the project directory (decisions, violations) and the user-level
 * directory (usage, docs/DESIGN.md §2.4). Pure data plane from
 * src/report/panel.ts and src/workflow/morning-report.ts; no separate
 * bookkeeping. The panel prices calls through the pricing service the GLM
 * channel package's glm-login row provides (src/shared/pricing.ts), read per
 * invocation; without it the panel lists calls and tokens. Registers through
 * the DSH commands seam (command-compact is the reference shape); the
 * directories are resolved per invocation, and a missing one is named in the
 * output. The row also registers `/hourness-status`, the row health table of
 * both packages, so it can be read without the GLM channel package.
 */
import { readFile } from 'node:fs/promises'
import { auditPaths } from '../memory/audit.ts'
import { reportFromFiles } from '../workflow/morning-report.ts'
import { usagePanel, usagePanelLines } from './panel.ts'
import { dataHomes, type DataHomes } from '../shared/data-home.ts'
import { collectHealth, provideRowHealth, renderHealthTable, sessionIdOf, type HealthState } from '../shared/health.ts'
import { pricingService, type UsagePricing } from '../shared/pricing.ts'
import type { CommandDefinitionLike, CommandsHost, ProvideHost, ServiceLookup } from '../shared/dsh-min.ts'

export interface HournessConfig {
  /** The project directory (workspace `.llm`); decisions and violations live under `<home>/audit`. Defaults to the data service's. */
  readonly home?: string
}

export interface RenderOptions {
  /** The pricing service; without it the panel lists calls and tokens. */
  readonly pricing?: UsagePricing | undefined
  /** Hears about a pricing service that throws. */
  readonly problem?: ((message: string) => void) | undefined
  /** Injected fs for tests. */
  readonly fs?: { readFile(path: string): Promise<string> }
  readonly now?: Date
}

/** Render the report text for the resolved directories. */
export async function renderHourness(homes: DataHomes, options: RenderOptions = {}): Promise<string> {
  const fs = options.fs ?? { readFile: (path: string) => readFile(path, 'utf8') }
  const now = options.now ?? new Date()
  // The period is the local calendar day; the report covers that day only.
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const period = `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, '0')}-${String(dayStart.getDate()).padStart(2, '0')}`
  const report = await reportFromFiles(fs, homes, period, dayStart.toISOString())
  const missing = [
    ...(homes.projectHome === undefined ? ['- 项目目录未配置（行配置 home 或数据目录行的 projectHome），决策与违规流水读不到'] : []),
    ...(homes.userHome === undefined ? ['- 用户级目录不可用（数据目录行 glm-hourness/data 未启用），用量流水读不到'] : []),
  ]
  const notice = missing.length === 0 ? '' : ['', '## 数据目录', ...missing].join('\n')
  const usagePath = auditPaths(homes).usage
  const usageRaw = usagePath === undefined ? '' : await fs.readFile(usagePath).catch(() => '')
  if (usageRaw.length === 0) return report + notice
  const summary = ['', '## 面板', ...usagePanelLines(usagePanel(usageRaw, options.pricing, options.problem))].join('\n')
  return report + summary + notice
}

/** cordis plugin identity: needs the commands service (/hourness). */
export const name = 'dsh-glm-hourness/hourness'
export const inject = ['commands']

/**
 * The row's status for one invocation's session (row health): which
 * journals the report can read, and whether the panel has a pricing
 * service. A missing pricing service does not lower the status.
 */
export function hournessHealth(homes: DataHomes, priced: boolean): [HealthState, string] {
  const missing = [
    ...(homes.projectHome === undefined ? ['项目目录未配置，决策与违规读不到'] : []),
    ...(homes.userHome === undefined ? ['用户级目录不可用，用量读不到'] : []),
  ]
  const pricing = priced ? '积分口径：已提供' : '积分口径：未提供，按 token 列'
  if (missing.length === 0) return ['active', `报告读取项目目录与用户级目录；${pricing}`]
  return [missing.length === 2 ? 'inactive' : 'degraded', [...missing, pricing].join('；')]
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
      health.report(sessionIdOf(invocation.agent), ...hournessHealth(homes, pricing !== undefined))
      try {
        return { kind: 'success', text: await renderHourness(homes, { pricing, problem }) }
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
    health.dispose()
  }
}
