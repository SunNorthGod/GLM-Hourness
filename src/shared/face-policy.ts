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

/** The rows' health note while the registry has not arrived (face-migration design 0.1 §4.6); information only, it does not degrade — an install without the GLM channel row has no wire layer at all. */
export const FACES_NOTE = '角色面改写要面注册表服务（glmHournessFaces）'

/** The removals of a session whose face the row leaves whole. */
const NO_REMOVALS: ReadonlySet<string> = new Set()

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

/**
 * The live session of `sessionId` in the host's `agents` service, or
 * undefined: what a face-policy source's `removals` resolves the session
 * through, so a session the host does not have counts as no removal. `T` is
 * the session-bearing shape the caller reads (the host's live agent).
 */
export function liveSessionOf<T extends { readonly session?: { readonly header: { readonly origin?: string } } | undefined } = { readonly session: { readonly header: { readonly origin?: string } } }>(ctx: ServiceLookup, sessionId: string): T | undefined {
  const agents: { readonly get?: (id: string) => T | undefined } | undefined = typeof ctx.get === 'function' ? ctx.get('agents') as { readonly get?: (id: string) => T | undefined } | undefined : undefined
  return agents?.get?.(sessionId)
}

/**
 * A delegated child's face removals registered for an orchestration row whose
 * only face judgment is the session's origin (face-migration design 0.1
 * §6 D): a session the host has as a subagent loses `removals`, every other
 * session keeps its face whole. Returns the row's health note to read in its
 * activation (§4.6): undefined once the registry arrived, the note said while
 * it has not. `warn` says a registration that failed; `reactivate` re-renders
 * the row health after each move.
 */
export function registerSubagentRemovals(ctx: ServiceLookup & {
  readonly inject?: (names: readonly ('glmHournessFaces')[], callback: (facesCtx: { readonly glmHournessFaces: FacePolicyRegistry }) => (() => void) | void) => unknown
}, hooks: {
  readonly warn: (key: string, text: string) => void
  readonly reactivate: () => void
}, removals: ReadonlySet<string>): () => string | undefined {
  let note: string | undefined = FACES_NOTE
  registerFaceSource(ctx, {
    warn: text => hooks.warn('faces', text),
    reactivate: hooks.reactivate,
    setNote: value => { note = value },
  }, {
    removals: sessionId => liveSessionOf(ctx, sessionId)?.session?.header.origin === 'subagent' ? removals : NO_REMOVALS,
  })
  return () => note
}

/**
 * Register `source` on the glmHournessFaces registry once it arrives —
 * through inject, so the registry coming with the glm-llm row is waited for
 * whichever row activates first — and move the row's health note along:
 * `setNote(undefined)` on registration, the note back when the registry goes,
 * said while it has not. `warn` says a registration that failed (the host
 * without inject stays quiet: the note is already said). `reactivate`
 * re-renders the row health after each move.
 */
export function registerFaceSource(ctx: ServiceLookup & {
  /** The cordis inject, as the rows' contexts carry it (`Partial<InjectHost>`); a host without one keeps the note said. */
  readonly inject?: (names: readonly ('glmHournessFaces')[], callback: (facesCtx: { readonly glmHournessFaces: FacePolicyRegistry }) => (() => void) | void) => unknown
}, hooks: {
  readonly warn: (text: string) => void
  readonly reactivate: () => void
  readonly setNote: (note: string | undefined) => void
}, source: FacePolicySource): void {
  if (typeof ctx.inject !== 'function') return
  try {
    ctx.inject([FACES_SERVICE], facesCtx => {
      try {
        const withdraw = facesCtx.glmHournessFaces.registerSource(source)
        hooks.setNote(undefined)
        hooks.reactivate()
        return () => {
          withdraw()
          hooks.setNote(FACES_NOTE)
          hooks.reactivate()
        }
      }
      catch (error) {
        hooks.warn(`the face policy could not be registered, the wire face keeps every tool: ${error instanceof Error ? error.message : String(error)}`)
        hooks.reactivate()
        return undefined
      }
    })
  }
  catch (error) {
    hooks.warn(`the face policy is not registered: ${error instanceof Error ? error.message : String(error)}`)
  }
}
