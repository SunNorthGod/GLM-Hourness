/**
 * Compact-engine row entry: mounts the GLM mirror compaction engine over the
 * live `BasicCompactionEngine`. The base class resolves from the DSH install
 * via createRequire; when absent the row degrades to the profile's existing
 * compaction (fail-open, like every other row).
 */
import { createRequire } from 'node:module'
import { makeGlmCompactionEngineClass, type BaseEngine } from './compact-engine.ts'

const BASIC_PACKAGE = '@deepseek-ai/dsh-compaction-basic'

export interface CompactionPluginContext {
  plugin(engineClass: new (ctx: unknown, config?: unknown) => unknown, config?: unknown): Promise<void> | void
}

export function resolveBasicEngine(): BaseEngine {
  const nodeRequire = createRequire(import.meta.url)
  const module = nodeRequire(BASIC_PACKAGE) as { default?: unknown }
  const base = module.default
  if (typeof base !== 'function') {
    throw new Error(`dsh-glm-prompt/compact: ${BASIC_PACKAGE} did not export its engine class`)
  }
  return base as BaseEngine
}

export function applyCompact(ctx: CompactionPluginContext, config: Record<string, unknown> = {}): Promise<void> | void {
  let engineClass: new (ctx: unknown, config?: unknown) => unknown
  try {
    engineClass = makeGlmCompactionEngineClass(resolveBasicEngine()) as unknown as new (ctx: unknown, config?: unknown) => unknown
  }
  catch (error) {
    // Fail-open: without the base engine there is nothing to mirror; the
    // profile's compaction rows keep working untouched.
    console.warn(`dsh-glm-prompt/compact: mirror engine not mounted (${error instanceof Error ? error.message : String(error)})`)
    return
  }
  return ctx.plugin(engineClass, config)
}

/** Loader-facing alias (cordis function plugins name their entry `apply`). */
export const apply = applyCompact
