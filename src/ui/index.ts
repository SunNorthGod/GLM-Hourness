/**
 * dsh-hourness row: the `/hourness` human command renders the audit journal —
 * morning report (exceptions → decision curve → usage) plus the usage panel
 * on the credit basis — from the project directory (decisions, violations)
 * and the user-level directory (usage, docs/DESIGN.md §2.4). Pure data plane
 * from src/ui/panel.ts and src/workflow/morning-report.ts; no separate
 * bookkeeping. Registers through the DSH commands seam (command-compact is
 * the reference shape); the directories are resolved per invocation, and a
 * missing one is named in the output.
 */
import { readFile } from 'node:fs/promises'
import { auditPaths } from '../memory/audit.ts'
import { reportFromFiles } from '../workflow/morning-report.ts'
import { usagePanel, usagePanelLines } from './panel.ts'
import { dataHomes, type DataHomes } from '../shared/data-home.ts'
import { provideRowHealth, sessionIdOf, type HealthState } from '../shared/health.ts'
import type { CommandsHost, ProvideHost, ServiceLookup } from '../shared/dsh-min.ts'

export interface HournessConfig {
  /** The project directory (workspace `.llm`); decisions and violations live under `<home>/audit`. Defaults to the data service's. */
  readonly home?: string
}

/** Render the report text for the resolved directories (injected fs for tests). */
export async function renderHourness(homes: DataHomes, fs: { readFile(path: string): Promise<string> } = { readFile: path => readFile(path, 'utf8') }, now: Date = new Date()): Promise<string> {
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
  const summary = ['', '## 面板', ...usagePanelLines(usagePanel(usageRaw))].join('\n')
  return report + summary + notice
}

/** cordis plugin identity: needs the commands service (/hourness). */
export const name = 'dsh-glm-hourness/hourness'
export const inject = ['commands']

/** The row's status for one invocation's session (row health): which journals the report can read. */
export function hournessHealth(homes: DataHomes): [HealthState, string] {
  const missing = [
    ...(homes.projectHome === undefined ? ['项目目录未配置，决策与违规读不到'] : []),
    ...(homes.userHome === undefined ? ['用户级目录不可用，用量读不到'] : []),
  ]
  if (missing.length === 0) return ['active', '报告读取项目目录与用户级目录']
  return [missing.length === 2 ? 'inactive' : 'degraded', missing.join('；')]
}

/** cordis plugin entry: register `/hourness`. */
export function apply(ctx: CommandsHost & ServiceLookup & Partial<ProvideHost>, config: HournessConfig = {}): () => void {
  const health = provideRowHealth(ctx, 'hourness', 'active', '/hourness 已注册')
  const unregister = ctx.commands.register({
    definitionId: 'dsh-glm-hourness/hourness',
    name: 'hourness',
    description: '晨报与积分用量（读审计流水）',
    handler: async invocation => {
      if (invocation.rawInput.trim().length > 0) {
        return { kind: 'error', text: '用法：/hourness（无需参数）' }
      }
      const homes = dataHomes(ctx, config.home)
      health.report(sessionIdOf(invocation.agent), ...hournessHealth(homes))
      try {
        return { kind: 'success', text: await renderHourness(homes) }
      }
      catch (error) {
        return { kind: 'error', text: `晨报生成失败：${(error as Error).message}` }
      }
    },
  })
  return () => {
    unregister()
    health.dispose()
  }
}
