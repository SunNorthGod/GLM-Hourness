/**
 * Per-request assembly rewrite for the ZCode dialect.
 *
 * In the agent-scoped `system-prompt/assemble` waterfall — which runs every
 * step before `agent/pre-step` — the rendered prompt comes from the returned
 * `sections`. The payload carries no tool face (the installed 0.2.2-rc.1
 * runtime appends its collected face after the waterfall,
 * docs/DESIGN.md §2.4a): the request's face is the wire face the channel
 * adapter composes (src/glm-llm/face-wire.ts). A prepend-registered listener
 * sees the route the model-selection listener injected after its own
 * `next()` and rewrites the sections for that request alone.
 */
import type { AssembledSection, AssemblePayload } from '../shared/dsh-min.ts'
import { OUTPUT_STYLE_SECTION } from '../shared/output-style.ts'
import { assemblyRoute, isGlmModel } from '../shared/route.ts'

/** The dialect section that tells GLM how its context is managed; the person's persona goes in front of it. */
export const CONTEXT_MANAGEMENT_SECTION = 'glm:context-management'

/** Whether the assembly's resolved route serves a GLM model (dialect follows the model family). */
export function isGlmAssembly(assembly: AssemblePayload): boolean {
  return isGlmModel(assemblyRoute(assembly).model)
}

/** Whether the assembly carries the persona section of the main agent (src/shared/output-style.ts): then the identity opening is the one of an active output style. */
export function hasOutputStyle(assembly: AssemblePayload): boolean {
  return assembly.sections.some(section => section.name === OUTPUT_STYLE_SECTION)
}

/**
 * Rewrite one GLM assembly's sections: the harness identity section is
 * replaced with the ZCode mirror, the CLI prefix is prepended, and the
 * remaining dialect sections follow the identity in their declared order.
 * The persona section of the main agent (`OUTPUT_STYLE_SECTION`), if the
 * assembly has one, is taken out of its place and set among the dialect
 * sections, ahead of `glm:context-management`, or after the last dialect
 * section when the tier has none; it stays as it is, text and
 * `interpolate: false` included.
 * @param assembly - the post-waterfall assembly.
 * @param wanted - the dialect sections (`dialectSections()` output).
 */
export function rewriteDialectSections<T extends AssemblePayload>(assembly: T, wanted: readonly { name: string, text: string }[]): T {
  const replacement = new Map(wanted.map(section => [section.name, section]))
  const identity = replacement.get('harness:identity')
  const cliPrefix = replacement.get('glm:cli-prefix')
  const out: AssembledSection[] = []
  let style: AssembledSection | undefined
  if (cliPrefix !== undefined) out.push({ name: cliPrefix.name, text: cliPrefix.text })
  let identityIndex = -1
  for (const section of assembly.sections) {
    if (section.name === 'harness:identity') {
      if (identity !== undefined) {
        out.push({ name: identity.name, text: identity.text })
        identityIndex = out.length - 1
      }
      continue
    }
    if (section.name === OUTPUT_STYLE_SECTION) {
      style = section
      continue
    }
    out.push(section)
  }
  if (identityIndex < 0 && identity !== undefined) {
    out.push({ name: identity.name, text: identity.text })
    identityIndex = out.length - 1
  }
  // The remaining dialect sections render as one block after the identity
  // block: ZCode's own layout keeps them after the opening identity, and the
  // trailing DSH sections (tool guidance, persona suffix) stay last.
  const extras: AssembledSection[] = wanted
    .filter(section => section.name !== 'harness:identity' && section.name !== 'glm:cli-prefix')
    .map(section => ({ name: section.name, text: section.text }))
  if (style !== undefined) {
    const contextManagement = extras.findIndex(section => section.name === CONTEXT_MANAGEMENT_SECTION)
    extras.splice(contextManagement < 0 ? extras.length : contextManagement, 0, style)
  }
  out.splice(identityIndex + 1, 0, ...extras)
  return { ...assembly, sections: out }
}
