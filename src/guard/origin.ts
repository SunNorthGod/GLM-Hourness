/**
 * Where a guarded call ran, as the violation journal records it
 * (docs/ORCHESTRATION.md §6.2). The guard judges every route the same; the
 * origin only says whether the GLM dialect claimed the calling agent on the
 * route of the call (`dialect`, the C class of the split design) or not
 * (`other`: a GLM route without the dialect, or any other model), and which
 * route that was. The morning report counts `other` records apart, so the
 * rules' misfires on models they were not tuned on stay visible. Records
 * written before split step 7 carry neither field and count as `dialect`:
 * only GLM routes were judged then.
 */
import type { Route } from '../shared/route.ts'

/** Whether the GLM dialect claimed the calling agent on the call's route. */
export type RouteScope = 'dialect' | 'other'

export interface CallOrigin {
  readonly scope: RouteScope
  /** The route of the step that issued the call; absent when the session has no request header yet. */
  readonly route?: Route | undefined
}

/** The origin of one call: `claimed` is whether the dialect service claimed the agent on `route`. */
export function originOf(claimed: boolean, route: Route | undefined): CallOrigin {
  return { scope: claimed ? 'dialect' : 'other', ...(route === undefined ? {} : { route }) }
}
