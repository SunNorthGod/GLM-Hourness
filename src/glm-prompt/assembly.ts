/**
 * Post-waterfall prompt assembly rewrite for the ZCode dialect.
 *
 * rc.3 harness builds resolve the model route inside the
 * `system-prompt/assemble` waterfall (the model-selection listener injects
 * `variables.provider`/`variables.model` after its `next()`), and the final
 * prompt renders only after the waterfall completes. A prepend-registered
 * listener therefore sees the route-bearing variables in its own post-`next()`
 * assembly and can rewrite `sections` before rendering — the one seam that
 * works across both the rc desktop and the reference builds, where
 * `agent.model.current()` and `agent/pre-step` payloads carry no route.
 */

/** One assembled prompt section as the assemble waterfall carries it. */
export interface AssemblySection {
  readonly name: string
  readonly text: string
  readonly interpolate?: boolean
}

/** The assembly object passed through the `system-prompt/assemble` waterfall. */
export interface PromptAssembly {
  readonly sections: readonly AssemblySection[]
  readonly contexts: readonly unknown[]
  readonly tools: readonly unknown[]
  readonly variables: Record<string, unknown>
}

/** Provider id the dialect activates on. */
export const GLM_PROVIDER = 'glm'

/** Whether the assembly's resolved variables route the request to glm. */
export function isGlmAssembly(assembly: PromptAssembly): boolean {
  const provider = assembly.variables.provider
  const model = assembly.variables.model
  return provider === GLM_PROVIDER || (typeof model === 'string' && model.startsWith('glm'))
}

/**
 * Rewrite one assembly's sections for the dialect: the harness identity
 * section is replaced with the ZCode mirror, the CLI prefix is prepended, and
 * the remaining dialect sections are inserted after the identity in their
 * declared order. A non-glm assembly returns unchanged.
 * @param assembly - the post-waterfall assembly with route-bearing variables.
 * @param wanted - the dialect sections (`dialectSections()` output).
 */
export function rewriteDialectAssembly<T extends PromptAssembly>(assembly: T, wanted: readonly { name: string, text: string }[]): T {
  if (!isGlmAssembly(assembly)) return assembly
  const replacement = new Map(wanted.map(section => [section.name, section]))
  const identity = replacement.get('harness:identity')
  const cliPrefix = replacement.get('glm:cli-prefix')
  const out: AssemblySection[] = []
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
