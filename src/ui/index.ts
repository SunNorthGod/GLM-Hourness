/**
 * dsh-hourness row: the `/hourness` human command renders the audit journal —
 * morning report (exceptions → decision curve → usage) plus the current
 * usage-panel summary — straight from `.llm/audit/`. Pure data plane from
 * src/ui/panel.ts and src/workflow/morning-report.ts; no separate
 * bookkeeping. Registers through the DSH commands seam (command-compact is
 * the reference shape); a row without a usable home degrades to a no-op.
 */
import { readFile } from 'node:fs/promises'
import { requireHome } from '../memory/index.ts'
import { reportFromFiles } from '../workflow/morning-report.ts'
import { offPeakBadge, usagePanel } from './panel.ts'

export interface HournessConfig {
  /** The agent home directory (`.llm`); the audit journal lives under `<home>/audit`. Required: the row cannot infer the workspace at activation. */
  readonly home?: string
}

export interface CommandInvocationLike {
  readonly rawInput: string
}

export interface CommandResultLike {
  readonly kind: 'success' | 'error'
  readonly text: string
}

export interface CommandsContext {
  effect?: never
  commands: {
    register(definition: { definitionId: string, name: string, description: string, handler: (invocation: CommandInvocationLike) => Promise<CommandResultLike> }): () => void
  }
}

/** Render the report text for one resolved home (injected fs for tests). */
export async function renderHourness(config: { home: string }, fs: { readFile(path: string): Promise<string> } = { readFile: path => readFile(path, 'utf8') }, now: Date = new Date()): Promise<string> {
  const home = requireHome(config.home).replace(/[\\/]+$/, '')
  // The period is the local calendar day; the report covers that day only.
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const period = `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, '0')}-${String(dayStart.getDate()).padStart(2, '0')}`
  const report = await reportFromFiles(fs, home, period, dayStart.toISOString())
  const usageRaw = await fs.readFile(`${home}/audit/usage.jsonl`).catch(() => '')
  if (usageRaw.length === 0) return report
  const panel = usagePanel(usageRaw)
  const summary = [
    '',
    '## 面板',
    `- 调用 ${panel.totals.calls} · in ${panel.totals.inputTokens} / out ${panel.totals.outputTokens} / total ${panel.totals.totalTokens}`,
    `- 谷时占比 ${offPeakBadge(panel.offPeakShare)}`,
  ].join('\n')
  return report + summary
}

/** cordis plugin identity: needs the commands service (/hourness). */
export const name = 'dsh-glm-hourness/hourness'
export const inject = ['commands']

/** cordis plugin entry: register `/hourness`. */
export function apply(ctx: CommandsContext, config: HournessConfig = {}): () => void {
  if (config.home === undefined || config.home.length === 0) {
    console.warn('dsh-glm-hourness/hourness: home is not configured; /hourness stays off (set config.home)')
    return () => {}
  }
  const home = requireHome(config.home)
  return ctx.commands.register({
    definitionId: 'dsh-glm-hourness/hourness',
    name: 'hourness',
    description: 'Morning report and usage panel from the .llm audit journal',
    handler: async invocation => {
      if (invocation.rawInput.trim().length > 0) {
        return { kind: 'error', text: 'Usage: /hourness (no arguments)' }
      }
      try {
        return { kind: 'success', text: await renderHourness({ home }) }
      }
      catch (error) {
        return { kind: 'error', text: `hourness report failed: ${(error as Error).message}` }
      }
    },
  })
}
