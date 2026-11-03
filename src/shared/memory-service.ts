/**
 * The memory contract between the two packages (M5 design §3.7, §8.6): what
 * the GLM dialect learns about the memory row without importing it. The row
 * provides the service `glmHournessMemory`; the dialect reads the person's
 * standing reporting depth through it when a session starts.
 *
 * Only types, constants and pure functions live here (the shared library
 * holds no state across rows). The row's own members beyond `depth` (the
 * statistics and hygiene findings for the weekly report) are declared in
 * src/memory/service.ts, which the dialect does not import.
 */
import type { ServiceLookup } from './dsh-min.ts'

/** The cordis service name the memory row provides. */
export const MEMORY_SERVICE = 'glmHournessMemory'

export type ReportingDepth = 'concise' | 'balanced' | 'detailed'

export interface MemoryService {
  /**
   * The standing reporting depth for one session: the value stored when the
   * session first asked, the same one for the rest of the session, so the
   * system prompt does not change mid-session. Undefined when the person has
   * not set one or the memory cannot be read.
   */
  depth(sessionId: string): ReportingDepth | undefined
}

/** Read the service; undefined while the memory row is not active, or when `depth` is not a function (the problem callback hears why). */
export function memoryService(ctx: ServiceLookup, problem?: (message: string) => void): MemoryService | undefined {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get(MEMORY_SERVICE) : undefined
  if (value === undefined || value === null) return undefined
  if (typeof (value as Partial<Record<keyof MemoryService, unknown>>).depth === 'function') return value as MemoryService
  problem?.(`${MEMORY_SERVICE} has the wrong shape; the reporting depth comes from the row configuration`)
  return undefined
}
