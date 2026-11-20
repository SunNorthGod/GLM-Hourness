/**
 * Project-level dispatch mode preference (`eco` / `adaptive` / `burn`) and
 * cache-stable Start-Plan-first GLM routing status lines for the execute row.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { StartPlanSnapshot } from '../shared/start-plan-status.ts'
import { CODING_PLAN_PROVIDER, START_PLAN_PROVIDER } from '../shared/route.ts'
import { ensureExecDir } from './gate-lock.ts'
import { writeTmpRename } from './live-board.ts'

const DISPATCH_MODES = ['eco', 'adaptive', 'burn'] as const
export type DispatchMode = typeof DISPATCH_MODES[number]

const DISPATCH_MODE_FILE = 'dispatch-mode.json'

const MODE_ALIASES: Readonly<Record<string, DispatchMode>> = {
  eco: 'eco',
  省额度: 'eco',
  adaptive: 'adaptive',
  自适应: 'adaptive',
  burn: 'burn',
  燃烧: 'burn',
}

/** Parse a CLI or UI dispatch mode token (`eco` / `adaptive` / `burn` or Chinese aliases). */
export function parseDispatchMode(raw: string): DispatchMode | undefined {
  return MODE_ALIASES[raw.trim().toLowerCase()]
}

/** Read `<execDir>/dispatch-mode.json` synchronously; fail-open returning undefined when absent or malformed. */
export function readProjectDispatchMode(execDir: string): DispatchMode | undefined {
  try {
    const raw = readFileSync(join(execDir, DISPATCH_MODE_FILE), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    const mode = (parsed as { readonly mode?: unknown }).mode
    if (typeof mode !== 'string') return undefined
    return (DISPATCH_MODES as readonly string[]).includes(mode) ? (mode as DispatchMode) : undefined
  }
  catch {
    return undefined
  }
}

/** Persist `<execDir>/dispatch-mode.json` atomically after ensuring `.llm/execute` and its `.gitignore`. */
export async function writeProjectDispatchMode(execDir: string, mode: DispatchMode): Promise<void> {
  await ensureExecDir(execDir)
  const payload = `${JSON.stringify({ mode, updatedAt: Date.now() })}\n`
  await writeTmpRename(join(execDir, DISPATCH_MODE_FILE), payload)
}

/** Concise, model-agnostic, cache-stable 1-line dispatch mode guidance for the holder's step notice. */
export function dispatchModeNoticeLine(mode: DispatchMode): string {
  switch (mode) {
    case 'eco':
      return 'Dispatch mode preference: eco (save quota) — batch related edits where safe, choose lighter/faster models for routine tasks and narrow reviews, and avoid redundant re-dispatches.'
    case 'adaptive':
      return 'Dispatch mode preference: adaptive (balanced) — match model tier and review depth to task complexity; reserve flagship models for complex synthesis and critical reviews.'
    case 'burn':
      return 'Dispatch mode preference: burn (speed/quality first) — prefer stronger models, full review depth, and parallel worker dispatches within slot limits for independent work.'
  }
}

/**
 * Coarse, cache-stable 1-line Start Plan routing status for the holder's step notice.
 * Never embeds timestamps, epoch ms, or countdowns.
 */
export function planRoutingNoticeLine(startPlan: StartPlanSnapshot | undefined, dualGlmAvailable: boolean): string | undefined {
  if (!dualGlmAvailable && startPlan === undefined) return undefined
  if (startPlan === undefined || startPlan.available) {
    return `GLM dispatch routing: free Start Plan (${START_PLAN_PROVIDER}) is preferred first with automatic failover to Coding Plan (${CODING_PLAN_PROVIDER}); leave \`provider\` unset on GLM dispatches so auto-routing applies.`
  }
  return `GLM dispatch routing: free Start Plan unavailable (${startPlan.reason}), failing over automatically to Coding Plan (${CODING_PLAN_PROVIDER}); leave \`provider\` unset on GLM dispatches so auto-routing applies.`
}
