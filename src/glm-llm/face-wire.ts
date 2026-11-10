/**
 * The GLM wire face (face-migration design 0.1 §2, §4): the tool face the
 * GLM channel sends upstream, computed from the runtime's collected face in
 * one pure composition. The installed 0.2.2-rc.1 runtime appends its
 * collected face to the request after the `system-prompt/assemble` waterfall
 * and overwrites anything the waterfall wrote back ("tool declarations
 * remain provider-owned", docs/DESIGN.md §2.4a), so the per-request rewrites
 * the rows used to make in the waterfall moved here, to the adapter's
 * `stream` — the one seam a request's face still passes through. On rc.3 the
 * adapter received the listeners' rewritten face as `options.tools`; applying
 * the same composition to the collected face restores the byte-level parity
 * of the upstream body.
 *
 * Composition order is the old listener nesting, role layer inside and
 * dialect outside (§4.2):
 *
 * 1. role layer — every registered face-policy source's removals for the
 *    session (native names) and its parameter narrowings (§4.1); face tools
 *    match by their native name, so an alias dies with the native it stands
 *    in for (the old GLM_CUT/PLAIN_CUT behavior);
 * 2. dialect layer — GLM route: an alias on the face takes the native it
 *    covers off it (the guard: without the dialect row the face is all
 *    native and nothing is removed), then the ZCode tool-search split of
 *    `buildToolExposure`; non-GLM route: the aliases and the search controls
 *    leave the face.
 *
 * `wireFace` is the request face the adapters send. `wireFaceProjection` is
 * the same composition without the tool-search split — the pre-exposure face
 * the section judgments and the todo eligibility read (§4.5) and the face
 * the tool-search exposure state is built from (§4.4, whose catalog must
 * still hold the deferred names). The role layer runs only when the
 * glmHournessFaces service is present; a source absent leaves its part out,
 * and the row that owns it says so in its health (§4.6).
 */
import { ZCODE_ALIAS_NATIVES } from '../shared/dialect.ts'
import { READ_IMAGE_NATIVE, READ_NAME } from '../glm-prompt/read-alias.ts'
import { buildToolExposure } from '../toolsearch/exposure.ts'
import { DEFERRED_TOOL_CALL_NAME } from '../shared/zcode-notice.ts'
import { LOCAL_TOOL_SEARCH_NAME } from '../toolsearch/zcode-text.ts'
import type { AssembledTool } from '../shared/dsh-min.ts'
import type { FacePolicyRegistry, FacePolicySource, ToolNarrowing } from '../shared/face-policy.ts'

/** Native → the ZCode-facing alias that covers it on a GLM face: the dialect's alias table plus read_image, which Read covers too. */
const DIALECT_FACES: ReadonlyMap<string, string> = new Map([...[...ZCODE_ALIAS_NATIVES].map(([alias, native]) => [native, alias] as const), [READ_IMAGE_NATIVE, READ_NAME]])

/**
 * The face-policy registry the glm-llm row provides as `glmHournessFaces`:
 * sources register and unregister with their rows; the wire layer reads the
 * registration order.
 */
export function facePolicyRegistry(): FacePolicyRegistry {
  const sources: FacePolicySource[] = []
  return {
    registerSource(source) {
      sources.push(source)
      return () => {
        const at = sources.indexOf(source)
        if (at >= 0) sources.splice(at, 1)
      }
    },
    sources: () => [...sources],
  }
}

/** The session facts the wire face is computed from (§4.2). */
export interface WireSession {
  /** The request serves a GLM model family route. */
  readonly glm: boolean
  readonly sessionId: string
  /** The glmHournessFaces service; undefined reads as no role layer. */
  readonly policy: FacePolicyRegistry | undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The DSH native a face tool name stands for (an alias maps through the shared table; anything else is its own name). */
function nativeOf(name: string): string {
  return ZCODE_ALIAS_NATIVES.get(name) ?? name
}

/** The tool with its `<parameter>` choices cut to `values`; undefined when the schema is not `properties.<parameter>.enum`. */
function narrowed(tool: AssembledTool, parameter: string, values: readonly string[]): AssembledTool | undefined {
  const properties = tool.parameters.properties
  if (!isRecord(properties)) return undefined
  const target = properties[parameter]
  if (!isRecord(target) || !Array.isArray(target.enum)) return undefined
  return { ...tool, parameters: { ...tool.parameters, properties: { ...properties, [parameter]: { ...target, enum: [...values] } } } }
}

/** The role layer: every source's removals for the session, and its narrowings, applied by native name. */
function applyPolicy(tools: readonly AssembledTool[], session: WireSession): readonly AssembledTool[] {
  const policy = session.policy
  if (policy === undefined) return tools
  const removals = new Set<string>()
  const narrowings: Array<ToolNarrowing & { readonly source: FacePolicySource }> = []
  for (const source of policy.sources()) {
    for (const name of source.removals(session.sessionId)) removals.add(name)
    if (source.narrowing === undefined) continue
    for (const narrowing of source.narrowing(session.sessionId)) narrowings.push({ ...narrowing, source })
  }
  if (removals.size === 0 && narrowings.length === 0) return tools
  const unknown: Array<{ readonly tool: string, readonly source: FacePolicySource }> = []
  const face: AssembledTool[] = []
  for (const tool of tools) {
    const native = nativeOf(tool.name)
    if (removals.has(native)) continue
    const narrowing = narrowings.find(candidate => candidate.tool === native)
    if (narrowing === undefined) {
      face.push(tool)
      continue
    }
    const cut = narrowed(tool, narrowing.parameter, narrowing.values)
    if (cut === undefined) unknown.push({ tool: tool.name, source: narrowing.source })
    else face.push(cut)
  }
  for (const { tool, source } of unknown) source.onUnknownShape?.(session.sessionId, tool)
  return face
}

/**
 * The pre-exposure wire face: the role layer and the dialect's alias layer,
 * without the tool-search split. The face the section judgments and the todo
 * eligibility project (§4.5) and the face the tool-search exposure state is
 * built from (§4.4).
 */
export function wireFaceProjection(tools: readonly AssembledTool[], session: WireSession): readonly AssembledTool[] {
  let face = applyPolicy(tools, session)
  if (session.glm) {
    // An alias on the face takes the native it covers off it. A native whose
    // alias is absent stays: the dialect row was not installed over it (or not
    // at all), and the face is then the natives.
    const present = new Set(face.map(tool => tool.name))
    face = face.filter(tool => {
      const alias = DIALECT_FACES.get(tool.name)
      return alias === undefined || !present.has(alias)
    })
  }
  else {
    // The aliases leave a non-GLM face; the natives they cover stay.
    face = face.filter(tool => !ZCODE_ALIAS_NATIVES.has(tool.name))
  }
  return face
}

/**
 * The wire face the request carries: the projection plus the tool-search
 * split. GLM route: the exposure's enabled branch (deferred tools behind the
 * search controls, controls on the face) when deferred tools exist and both
 * controls are there, else the disabled branch (the controls leave the face).
 * Non-GLM route: the controls leave the face. Both branches are
 * `buildToolExposure`'s, as the old per-request `expose`/`hide` ran them.
 */
export function wireFace(tools: readonly AssembledTool[], session: WireSession): readonly AssembledTool[] {
  const projected = wireFaceProjection(tools, session)
  if (!session.glm) return projected.filter(tool => tool.name !== LOCAL_TOOL_SEARCH_NAME && tool.name !== DEFERRED_TOOL_CALL_NAME)
  return buildToolExposure(projected).tools
}
