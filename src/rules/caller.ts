/**
 * Who is calling (docs/ORCHESTRATION.md §16.11; design §2.3, §6.2 step 4): the
 * role, the model and the session of the agent a tool call or a `rules_show`
 * comes from, read from the host the way the design says, and the directory
 * relative paths of the call resolve against. The tool-call gate and the tool
 * that shows the rules read the caller here, so a rule is judged and listed for
 * the same caller.
 *
 * A field that cannot be told is left out, with the reason: a rule that asks
 * about it does not apply (design §2.3), and the listing says so. Nothing here
 * throws.
 */
import { MAIN_AGENT_KEY, mainAgentActive } from '../graph/main-agent.ts'
import { baseFor } from '../guard/index.ts'
import type { AgentLike, ServiceLookup, SessionLike } from '../shared/dsh-min.ts'
import { sessionRoute } from '../shared/route.ts'
import { modelId } from './events.ts'

type CallerRole = 'main-agent' | 'root' | 'subagent'

export interface Caller {
  readonly sessionId?: string
  /** The directory the session was started in. */
  readonly cwd?: string
  /** The directory relative paths resolve against: the session's effective working directory, else `cwd`. */
  readonly workspace?: string
  readonly role?: CallerRole
  /** `provider/model` of the session's latest request. */
  readonly model?: string
  /** Why a field is not known. */
  readonly unknown: Readonly<Partial<Record<'role' | 'model' | 'session', string>>>
}

const NO_SESSION = 'the call has no session'

/** The role of a session: a delegated child is a subagent; the main agent is the session the main-agent projection says is active; every other is a root. The projection is read the way the graph panel reads it, and a missing or malformed value reads as not the main agent. */
function roleOf(ctx: ServiceLookup, session: SessionLike): { readonly role: CallerRole } | { readonly unknown: string } {
  if (session.header.origin === 'subagent') return { role: 'subagent' }
  const projections: unknown = typeof ctx.get === 'function' ? ctx.get('sessionProjections') : undefined
  const stateOf = (projections as { stateOf?: unknown } | undefined)?.stateOf
  if (typeof stateOf !== 'function') return { role: 'root' }
  try {
    const state: unknown = (stateOf as (session: SessionLike, key: string) => unknown).call(projections, session, MAIN_AGENT_KEY)
    return { role: mainAgentActive({ [MAIN_AGENT_KEY]: state }) ? 'main-agent' : 'root' }
  }
  catch (error) {
    return { unknown: `the main-agent projection could not be read: ${(error instanceof Error ? error.message : String(error)).slice(0, 80)}` }
  }
}

/** The caller of a tool call or a tool; `agent` is the agent of the execution, absent outside the agent runtime. */
export function callerOf(ctx: ServiceLookup, agent: AgentLike | undefined): Caller {
  const session = agent?.session
  if (agent === undefined || session === undefined) return { unknown: { role: NO_SESSION, model: NO_SESSION, session: NO_SESSION } }
  const role = roleOf(ctx, session)
  const route = sessionRoute(session)
  const model = route === undefined ? undefined : modelId(route)
  const cwd = session.header.cwd
  const workspace = baseFor(ctx, agent)
  return {
    sessionId: session.id,
    ...(typeof cwd === 'string' && cwd.length > 0 ? { cwd } : {}),
    ...(workspace === undefined ? {} : { workspace }),
    ...('role' in role ? { role: role.role } : {}),
    ...(model === undefined ? {} : { model }),
    unknown: {
      ...('unknown' in role ? { role: role.unknown } : {}),
      ...(model === undefined ? { model: 'the session has no request header yet' } : {}),
    },
  }
}
