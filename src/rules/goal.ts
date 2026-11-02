/**
 * The goals the stop level pauses and resumes (docs/ORCHESTRATION.md §16.13;
 * design §6.3): when the board holds a GLM subagent for a peak, a goal of
 * that subagent that is active would start a round after round, each spending
 * a step to be refused. The board pauses it when the ticket is opened and
 * resumes it when the ticket ends.
 *
 * Only the goal of a subagent session is ever touched here: the main agent
 * and every other session keep their goals whatever the level is. The pause is
 * made from inside the tool call of the agent itself, where the goal round
 * driver does not cancel the running step (goal-round-driver:246, the
 * initiator is the agent). A goal service that is absent means there is no
 * goal to act on. Every host call is wrapped: a throw is an outcome, the
 * first 80 characters of its message, never an exception.
 */
import type { GoalRef, GoalsService, GoalView, MessageableAgentLike, ServiceLookup } from '../shared/dsh-min.ts'

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 80)

/** The goal service, when the host has one with the three members the board uses. */
function goalsOf(ctx: ServiceLookup): GoalsService | undefined {
  const goals: unknown = typeof ctx.get === 'function' ? ctx.get('goals') : undefined
  const service = goals as Partial<Record<keyof GoalsService, unknown>> | undefined
  return typeof service?.get === 'function' && typeof service.pause === 'function' && typeof service.resume === 'function' ? goals as GoalsService : undefined
}

/** Nothing to do: no goal service, no goal of the kind, or not a subagent. */
const NONE = { kind: 'none' } as const
/** The host refused: why, in the first 80 characters of what it said. */
interface Refused {
  readonly kind: 'failed'
  readonly why: string
}

/** Read the subagent's goal and act on it. A refusal of the host is the outcome, never a throw. */
function onGoal<Outcome>(ctx: ServiceLookup, agent: MessageableAgentLike | undefined, act: (goals: GoalsService, agent: MessageableAgentLike, goal: GoalView | undefined) => Outcome): Outcome | typeof NONE | Refused {
  if (agent?.session.header.origin !== 'subagent') return NONE
  const goals = goalsOf(ctx)
  if (goals === undefined) return NONE
  try {
    return act(goals, agent, goals.get(agent))
  }
  catch (error) {
    return { kind: 'failed', why: message(error) }
  }
}

/** What became of the attempt to pause: the goal and the revision the pause made, a refusal with its reason, or nothing to pause (no goal service, no goal, a goal that is not active, not a subagent). */
export type Pause = { readonly kind: 'paused', readonly goal: GoalRef } | Refused | typeof NONE

/** Pause the active goal of a subagent. Never throws. */
export function pauseGoal(ctx: ServiceLookup, agent: MessageableAgentLike): Pause {
  return onGoal<Pause>(ctx, agent, (goals, live, goal) => {
    if (goal?.phase !== 'active') return NONE
    const paused = goals.pause(live, { id: goal.id, revision: goal.revision })
    return { kind: 'paused', goal: { id: paused.id, revision: paused.revision } }
  })
}

/** What became of the attempt to resume: resumed; the goal is no longer the one the board paused (the person resumed or changed it), so it was left alone; a refusal with its reason; or nothing to do (the agent is not live, no goal service, not a subagent). */
export type Resume = { readonly kind: 'resumed' | 'changed' } | Refused | typeof NONE

/** Resume the goal the board paused, if it is still as the board left it. Never throws. */
export function resumeGoal(ctx: ServiceLookup, agent: MessageableAgentLike | undefined, paused: GoalRef): Resume {
  return onGoal<Resume>(ctx, agent, (goals, live, goal) => {
    if (goal?.phase !== 'paused' || goal.id !== paused.id || goal.revision !== paused.revision) return { kind: 'changed' }
    goals.resume(live, { id: paused.id, revision: paused.revision })
    return { kind: 'resumed' }
  })
}
