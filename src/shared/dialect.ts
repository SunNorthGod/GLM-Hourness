/**
 * The dialect contract (docs/DESIGN.md §5.4, docs/ORCHESTRATION.md §6.1):
 * what the orchestration rows learn about the GLM dialect's tool names
 * without importing it.
 *
 * ZCODE_ALIAS_NATIVES is a ZCode fact both packages carry, like
 * DEFERRED_TOOL_CALL_NAME: each ZCode 3.16.3 alias the GLM dialect
 * registers and the DSH native it delegates to. The guard rules know DSH
 * native names only; a call name maps to its native through the dialect
 * service when there is one, else through this table, so the guard denies
 * the same calls with or without the service. The service, which the
 * glm-prompt row provides, adds what only the dialect knows: whether it
 * rewrites one agent's requests on a route (`claims`), and the name it gives
 * a native there (`faceName`), which the guard's corrections and rule
 * declaration use. tests/contracts.spec.ts pins the table to the dialect's
 * own alias definitions.
 *
 * Readers read the service per call, so neither load order nor agent
 * creation order matters. A malformed value counts as absent, and a method
 * that throws counts as absent for that one call; both are reported to the
 * reader's `problem` callback (dialectWarner warns once per reading row).
 */
import type { AgentLike, ServiceLookup } from './dsh-min.ts'
import type { Route } from './route.ts'

/** The cordis service name the glm-prompt row provides. */
export const DIALECT_SERVICE = 'glmHournessDialect'

/** ZCode 3.16.3 alias → the DSH native it delegates to (the GLM dialect's aliasSpecs, plus Read and TodoWrite). */
export const ZCODE_ALIAS_NATIVES: ReadonlyMap<string, string> = new Map([
  ['Write', 'write'], ['Edit', 'edit'], ['Glob', 'glob'], ['Grep', 'grep'],
  ['Bash', 'pwsh'], ['Read', 'read'], ['TodoWrite', 'todo_write'],
])

export interface DialectService {
  /** Whether the dialect rewrites this agent's requests on `route`: installed on the agent, and the route serves its model family. */
  claims(agent: AgentLike, route: Route | undefined): boolean
  /** The DSH native a dialect alias delegates to; undefined for a name that is no alias. */
  nativeOf(tool: string): string | undefined
  /** The dialect's name for a native on the routes it claims; the native name itself when it has no alias. */
  faceName(native: string): string
}

/** How a reader hears that the service is unusable: a malformed value, or a method that threw. */
export type DialectProblem = (message: string) => void

/** A problem callback that warns once for the reading row (`dsh-glm-hourness/<row>`); every reading row keeps its own. */
export function dialectWarner(row: string): DialectProblem {
  let warned = false
  return (message) => {
    if (warned) return
    warned = true
    console.warn(`dsh-glm-hourness/${row}: ${message}`)
  }
}

const reason = (error: unknown): string => error instanceof Error ? error.message : String(error)

/** Read the service; undefined while the glm-prompt row is not active, or when the three members are not functions. */
export function dialectService(ctx: ServiceLookup, problem?: DialectProblem): DialectService | undefined {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get(DIALECT_SERVICE) : undefined
  if (value === undefined || value === null) return undefined
  const service = value as Partial<Record<keyof DialectService, unknown>>
  if (typeof service.claims === 'function' && typeof service.nativeOf === 'function' && typeof service.faceName === 'function') return value as DialectService
  problem?.(`${DIALECT_SERVICE} has the wrong shape; tool names map through the static alias table and corrections use native names`)
  return undefined
}

/** A call name as the DSH native it runs: the service's nativeOf, else ZCODE_ALIAS_NATIVES, else the name itself. */
export function toNativeTool(dialect: DialectService | undefined, name: string, problem?: DialectProblem): string {
  if (dialect !== undefined) {
    try {
      const native = dialect.nativeOf(name)
      if (typeof native === 'string') return native
    }
    catch (error) {
      problem?.(`${DIALECT_SERVICE}.nativeOf threw (${reason(error)}); this call maps through the static alias table`)
    }
  }
  return ZCODE_ALIAS_NATIVES.get(name) ?? name
}

/**
 * The names a model sees for natives on this agent and route: the
 * dialect's when it claims them, else undefined (the natives' own names).
 * A throwing claims counts as not claimed, a throwing faceName as no alias.
 */
export function dialectNames(dialect: DialectService | undefined, agent: AgentLike | undefined, route: Route | undefined, problem?: DialectProblem): ((native: string) => string) | undefined {
  if (dialect === undefined || agent === undefined) return undefined
  try {
    if (!dialect.claims(agent, route)) return undefined
  }
  catch (error) {
    problem?.(`${DIALECT_SERVICE}.claims threw (${reason(error)}); corrections use native names for this call`)
    return undefined
  }
  return (native) => {
    try {
      const face = dialect.faceName(native)
      return typeof face === 'string' ? face : native
    }
    catch (error) {
      problem?.(`${DIALECT_SERVICE}.faceName threw (${reason(error)}); ${native} keeps its native name`)
      return native
    }
  }
}
