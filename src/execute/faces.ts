/**
 * The tool faces of the dispatch chain (M7 design 0.6 §2.3.2): the execute
 * row gives every agent an agent-scoped `system-prompt/assemble` listener
 * without `prepend` — inside the dialect and tool-search listeners, which
 * already see the filtered face — that removes, after `next()`, the tools
 * that agent has no business seeing. The tools stay registered globally, so
 * a call by name still executes and each tool body checks its caller; the
 * graph row's nine write tools are what `worker-graph-readonly` catches by
 * name (§3.2.3).
 *
 * Who loses what: an agent that is not the main agent loses the execute
 * row's and the operate row's tools; an agent that is no registered worker
 * or reviewer loses the worker tools; a reviewer also loses `submit_plan`.
 * Every agent of a chain rooted in the main agent — a registered worker or
 * reviewer, and the read-only subagents they start — loses the nine graph
 * write tools and keeps `graph_show`, `graph_open`, `graph_focus` and
 * `graph_comment`. A session already open when the row activates gets the
 * listener at its first step (the host-level `agent/pre-step` backstop).
 */
import type { AgentsService, AssembledTool, LiveAgentLike, SessionLike } from '../shared/dsh-min.ts'
import { dispatchRoot } from '../guard/design-release.ts'
import { EXECUTE_TOOL_NAMES, GRAPH_TOOL_NAMES, OPERATE_TOOL_NAMES, WORKER_TOOL_NAMES } from '../shared/tool-names.ts'
import type { Attempt } from './attempts.ts'

/** The graph write tools a dispatched chain does not see; the four read-and-annotate tools stay. */
export const GRAPH_WRITE_TOOLS: readonly string[] = GRAPH_TOOL_NAMES.filter(name => !['graph_show', 'graph_open', 'graph_focus', 'graph_comment'].includes(name))

/** What the filter knows about one agent. */
export interface FaceRole {
  /** The session is its project's main agent. */
  readonly main: boolean
  /** The register entry of the agent id, when this process started it and it is still alive. */
  readonly attempt?: Attempt | undefined
  /** The agent is inside a chain rooted in the main agent (its own chain when it is the main agent itself counts as outside). */
  readonly dispatched: boolean
}

/** The tools an agent of that role keeps, in the assembled order. Pure. */
export function faceOfRole(tools: readonly AssembledTool[], role: FaceRole): readonly AssembledTool[] {
  const reviewer = role.attempt !== undefined && (role.attempt.role === 'review' || role.attempt.role === 'acceptance-review')
  const worker = role.attempt !== undefined && role.attempt.role === 'worker'
  const removed = new Set<string>([
    ...(role.main ? [] : [...EXECUTE_TOOL_NAMES, ...OPERATE_TOOL_NAMES]),
    ...(!worker && !reviewer ? WORKER_TOOL_NAMES : []),
    ...(reviewer ? ['submit_plan'] : []),
    ...(role.dispatched ? GRAPH_WRITE_TOOLS : []),
  ])
  if (removed.size === 0) return tools
  return tools.filter(tool => !removed.has(tool.name))
}

/** What the filter asks of the host. */
export interface FaceDeps {
  /** Whether the session is its project's main agent now; may throw (the agent then counts as not the main agent, the health says so). */
  readonly isMainAgent: (agent: { readonly id: string, readonly session?: SessionLike }) => boolean
  /** The register entry of an agent id, when this process started it. */
  readonly register: (agentId: string) => Attempt | undefined
  /** The live-agent registry, to follow the dispatch chain; undefined reads as outside every chain. */
  readonly agents: () => Pick<AgentsService, 'get'> | undefined
  readonly report: (agentId: string | undefined, state: 'degraded', reason: string) => void
}

/** The role of one agent, read at assembly time; never throws. */
export function roleOfAgent(deps: FaceDeps, agent: { readonly id: string, readonly session?: SessionLike | undefined }): FaceRole {
  const session = agent.session
  let main = false
  if (session !== undefined) {
    try {
      main = deps.isMainAgent({ id: agent.id, session })
    }
    catch (error) {
      deps.report(agent.id, 'degraded', `读不到主 Agent 的状态（${error instanceof Error ? error.message : String(error)}），工具面按不是主 Agent 过滤`)
    }
  }
  const attempt = deps.register(agent.id)
  let dispatched = false
  if (!main && session !== undefined) {
    const agents = deps.agents()
    if (agents !== undefined) {
      if (session.header.origin === 'subagent') {
        const root = dispatchRoot(agents, { id: agent.id, session })
        dispatched = root.kind === 'self' || (root.kind === 'root' && readMain(deps, root.root))
        // A chain that cannot be followed is filtered the strict way: the tools stay callable by name, so nothing stops.
        dispatched = dispatched || root.kind === 'unknown'
      }
    }
  }
  return { main, ...(attempt === undefined ? {} : { attempt }), dispatched }
}

function readMain(deps: FaceDeps, root: LiveAgentLike): boolean {
  try {
    return deps.isMainAgent(root)
  }
  catch {
    return false
  }
}
