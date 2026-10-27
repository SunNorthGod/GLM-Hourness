/**
 * Per-request assembly rewrite for the ZCode dialect.
 *
 * In the rc.3 runtime the agent-scoped `system-prompt/assemble` waterfall
 * runs every step before `agent/pre-step`, the rendered prompt comes from the
 * returned `sections`, and the request carries exactly the returned `tools`
 * (docs/DESIGN.md §2.4a). A prepend-registered listener sees the route the
 * model-selection listener injected after its own `next()` and rewrites both
 * for that request alone.
 */
import type { AssembledSection, AssembledTool, AssemblePayload } from '../shared/dsh-min.ts'
import { assemblyRoute, isGlmModel } from '../shared/route.ts'

/** Whether the assembly's resolved route serves a GLM model (dialect follows the model family). */
export function isGlmAssembly(assembly: AssemblePayload): boolean {
  return isGlmModel(assemblyRoute(assembly).model)
}

/**
 * Rewrite one GLM assembly's sections: the harness identity section is
 * replaced with the ZCode mirror, the CLI prefix is prepended, and the
 * remaining dialect sections follow the identity in their declared order.
 * @param assembly - the post-waterfall assembly.
 * @param wanted - the dialect sections (`dialectSections()` output).
 */
export function rewriteDialectSections<T extends AssemblePayload>(assembly: T, wanted: readonly { name: string, text: string }[]): T {
  const replacement = new Map(wanted.map(section => [section.name, section]))
  const identity = replacement.get('harness:identity')
  const cliPrefix = replacement.get('glm:cli-prefix')
  const out: AssembledSection[] = []
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
    out.push(section)
  }
  if (identityIndex < 0 && identity !== undefined) {
    out.push({ name: identity.name, text: identity.text })
    identityIndex = out.length - 1
  }
  // The remaining dialect sections render as one block after the identity
  // block: ZCode's own layout keeps them after the opening identity, and the
  // trailing DSH sections (tool guidance, persona suffix) stay last.
  const extras = wanted
    .filter(section => section.name !== 'harness:identity' && section.name !== 'glm:cli-prefix')
    .map(section => ({ name: section.name, text: section.text }))
  out.splice(identityIndex + 1, 0, ...extras)
  return { ...assembly, sections: out }
}

/**
 * Rewrite one request's tool face. A GLM request sees the ZCode-facing
 * aliases and not the natives they cover; any other request sees the natives
 * and not the aliases. Both sets stay registered, so the switch costs nothing
 * and follows a mid-session route change on the next step.
 * @param tools - the assembled tool schemas.
 * @param glm - whether the request serves a GLM model.
 * @param aliasNames - ZCode-facing names this row registered.
 * @param coveredNatives - native names those aliases stand in for.
 */
export function rewriteToolFace(tools: readonly AssembledTool[], glm: boolean, aliasNames: ReadonlySet<string>, coveredNatives: ReadonlySet<string>): readonly AssembledTool[] {
  const hidden = glm ? coveredNatives : aliasNames
  return tools.filter(tool => !hidden.has(tool.name))
}
