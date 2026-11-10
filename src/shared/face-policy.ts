/**
 * The face-policy service contract (face-migration design 0.1 §4.1): the
 * bridge over the bundle boundary for the role layer of the wire face. The
 * wire layer lives in the GLM channel bundle (src/glm-llm/face-wire.ts,
 * applied by the ZcodeAdapter and the probe adapter); the role judgments
 * (main agent, worker register, takeover, subagent) live in the orchestration
 * rows. A row registers one source through this service inside a child fiber;
 * a source that is absent (the row disabled, or the service not arrived)
 * leaves its part of the rewrite out and the row health says so — the same
 * degrade the 0.2.2-rc.1 protective commit modeled for the missing payload
 * face.
 *
 * The types are structural and compile into both bundles, so no module
 * identity crosses the boundary; the service resolves by name through cordis.
 */
import type { ServiceLookup } from './cordis-min.ts'

/** The cordis service name the glm-llm row provides. */
export const FACES_SERVICE = 'glmHournessFaces'

/**
 * One parameter-enum narrowing of a face tool (the main agent's
 * str_replace_editor `command` → `view`). The wire layer applies it when the
 * tool's schema is `properties.<parameter>.enum`; a tool of an unknown shape
 * leaves the face whole-tool and the declaring source hears so.
 */
export interface ToolNarrowing {
  /** The registration (native) name of the tool to narrow. */
  readonly tool: string
  readonly parameter: string
  readonly values: readonly string[]
}

/**
 * One row's face-policy source: which registered (native) names the row takes
 * off the session's wire face, and which parameter enums it narrows. A native
 * whose name a dialect alias stands in for dies with it (the wire layer
 * matches face tools by their native name), so a removal names native names
 * only. The methods read the session state live; a read that cannot be made
 * counts as no removal, and the row reports it in its own health.
 */
export interface FacePolicySource {
  removals(sessionId: string): ReadonlySet<string>
  narrowing?(sessionId: string): ReadonlyArray<ToolNarrowing>
  /** The wire layer dropped `tool` because its narrowing shape was unknown; the source reports it (row health). */
  onUnknownShape?(sessionId: string, tool: string): void
}

/** The registry the wire layer reads and the orchestration rows write. */
export interface FacePolicyRegistry {
  registerSource(source: FacePolicySource): () => void
  /** The registered sources, in registration order (the wire layer's read side). */
  sources(): readonly FacePolicySource[]
}

/**
 * The service as a reader takes it (the dialect-service pattern): undefined
 * while the glm-llm row is not active, or when the value has the wrong shape
 * — said to `problem`, which a reading row warns once per row.
 */
export function facePolicyOf(ctx: ServiceLookup, problem?: (message: string) => void): FacePolicyRegistry | undefined {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get(FACES_SERVICE) : undefined
  if (value === undefined || value === null) return undefined
  const service = value as Partial<Record<'registerSource' | 'sources', unknown>>
  if (typeof service.registerSource === 'function' && typeof service.sources === 'function') return value as FacePolicyRegistry
  problem?.(`${FACES_SERVICE} has the wrong shape; the role layer of the wire face stays out for this read`)
  return undefined
}
