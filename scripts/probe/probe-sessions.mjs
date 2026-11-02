/**
 * Probe sessions (the loops-peak scenarios): an overlay-only row that
 * provides the `sessionController` dependency the headless runtime mounts no
 * service for, so the loop board's running half (the service, the projects,
 * the beats) activates the way it does in the desktop host. Its
 * `resolveAgent` answers the way the host's own does: the agent of the
 * session when it is open in this process, `session/not-found` when it is
 * not. Not part of the bundle and no product feature: loaded only through
 * the overlay that scripts/probe/run-probe.mjs generates.
 */
export const name = 'glm-hourness-probe/sessions'
export const inject = ['agents']

export function apply(ctx) {
  const controller = {
    resolveAgent: async id => {
      const found = ctx.get?.('agents')?.get?.(id)
      return found === undefined ? { error: { code: 'session/not-found' } } : { agent: found.agent ?? found }
    },
  }
  let withdraw
  try {
    withdraw = ctx.inject(['agents'], sub => typeof sub.provide === 'function' ? sub.provide('sessionController', controller) : undefined)
  }
  catch (error) {
    console.warn(`probe sessions: no sessionController provided: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
  return () => {
    if (typeof withdraw === 'function') withdraw()
  }
}
