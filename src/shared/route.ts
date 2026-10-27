/**
 * Route determination shared by every row (docs/DESIGN.md §3).
 *
 * The dialect follows the model family: training distribution is a property
 * of the model, so any route serving a GLM model gets the ZCode face. The
 * channel identity is a transport concern owned by the glm-llm adapter and
 * needs no detection here.
 *
 * The only route signal the rc.3 runtime exposes to plugins is the
 * agent-scoped `system-prompt/assemble` result: the model-selection listener
 * writes `variables.provider` / `variables.model` after its `next()`, and the
 * runtime assembles before `agent/pre-step` and before any tool runs in that
 * step (DESIGN.md §2.4a). A row reads the route in its own prepend listener
 * and carries what it decided to later hooks of the same step.
 */

export interface Route {
  readonly provider?: string
  readonly model?: string
}

/** Whether a model id belongs to the GLM family. */
export function isGlmModel(model: unknown): boolean {
  return typeof model === 'string' && model.toLowerCase().startsWith('glm')
}

/** The route an assembly carries once the model-selection listener has run. */
export function assemblyRoute(assembly: { readonly variables: Record<string, unknown> }): Route {
  const { provider, model } = assembly.variables
  return {
    ...(typeof provider === 'string' ? { provider } : {}),
    ...(typeof model === 'string' ? { model } : {}),
  }
}
