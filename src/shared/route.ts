/**
 * Route determination shared by every row (docs/DESIGN.md §3).
 *
 * The dialect follows the model family: training distribution is a property
 * of the model, so any route serving a GLM model gets the ZCode face. The
 * channel identity is a transport concern owned by the glm-llm adapter and
 * needs no detection here.
 *
 * The rc.3 runtime exposes the route to plugins in two places
 * (DESIGN.md §2.4a):
 *
 * - The agent-scoped `system-prompt/assemble` result: the model-selection
 *   listener writes `variables.provider` / `variables.model` after its
 *   `next()`, and the runtime assembles before `agent/pre-step` and before
 *   any tool runs in that step. A row reads it in its own prepend listener.
 * - The session's request header: the agent loop logs the header of each
 *   step before it calls the model (dsh-agent-loop lib/index.js:1226, only
 *   when it changed), and `Session.requestHeader()` folds those events
 *   (dsh-session lib/index.js:1612). While the step's tool calls run, the
 *   fold names the model that issued them; hooks without an assembly (tool
 *   execution) read it there.
 */
import type { SessionLike } from './dsh-min.ts'

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

/** The route of the session's latest logged request; undefined before the first request or without the fold. */
export function sessionRoute(session: SessionLike | undefined): Route | undefined {
  if (typeof session?.requestHeader !== 'function') return undefined
  const config = session.requestHeader()?.config
  if (config === undefined) return undefined
  return {
    ...(typeof config.provider === 'string' ? { provider: config.provider } : {}),
    ...(typeof config.model === 'string' ? { model: config.model } : {}),
  }
}
