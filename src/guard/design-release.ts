/**
 * design-before-release (docs/ORCHESTRATION.md §3.1, §6.1, §4.9; decisions
 * d-dispatch and d-design-onepage): the subagents a main agent dispatches,
 * and the ones they dispatch in turn, only read until what the main agent
 * works on is released. The goal is released once, by the human, in the
 * design loop; a goal split into modules is released once for its framework
 * and once more for each module. The judge reads the main agent that roots
 * the dispatch chain, its focus on the graph and the stage of the goal (and
 * of the module) the focus is in, so a deeper `maxDepth` setting changes
 * nothing: a grandchild is judged like a child.
 *
 * This file holds the judgment (a pure function of the graph and the focus)
 * and the walk up the dispatch chain; the `tools/pre-execute` listener that
 * asks for them is src/guard/main-agent.ts. Failures to judge (no agents
 * service, a chain that cannot be followed, a graph that cannot be read)
 * let the call through and say why: refusing would stop work that has
 * nothing to do with the design loop. A state that is judged is never let
 * through for lack of a focus: a main agent with no open goal in focus has
 * released nothing.
 */
import { isReleased, moduleOf } from '../graph/modules.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import type { GraphFocusService } from '../graph/service.ts'
import { effectiveStage, goalOf, isClosed } from '../graph/stage.ts'
import { loadGraph } from '../graph/store.ts'
import type { AgentsService, LiveAgentLike, SessionLike } from '../shared/dsh-min.ts'
import type { Correction } from './rules.ts'

/** Where a dispatched call's chain ends. */
export type RootLookup =
  | { readonly kind: 'self' }
  | { readonly kind: 'root', readonly root: LiveAgentLike }
  | { readonly kind: 'unknown', readonly why: string }

/**
 * The agent that roots the dispatch chain of a caller. A session header
 * without `origin: 'subagent'` is a root itself (a user fork carries
 * `parentSession` only, so the walk stops at it). Every hop goes to a
 * different live agent, so the walk ends in at most as many hops as there
 * are agents; a chain that loops, loses its `parentSession` or reaches an
 * agent that is gone is `unknown`. The execute row's face filter walks the
 * same chain (M7 design 0.6 §2.3.2), so the walk is shared here.
 */
export function dispatchRoot(agents: Pick<AgentsService, 'get'>, caller: { readonly id: string, readonly session: SessionLike }): RootLookup {
  if (caller.session.header.origin !== 'subagent') return { kind: 'self' }
  const seen = new Set<string>([caller.id])
  let header = caller.session.header
  for (;;) {
    const up = header.parentSession
    if (up === undefined) return { kind: 'unknown', why: 'the delegated session header has no parentSession' }
    if (seen.has(up)) return { kind: 'unknown', why: `the dispatch chain loops back to ${up}` }
    const root = agents.get(up)
    if (root === undefined) return { kind: 'unknown', why: `${up} on the dispatch chain is not a live agent` }
    seen.add(up)
    if (root.session.header.origin !== 'subagent') return { kind: 'root', root }
    header = root.session.header
  }
}

/** What the judge decided about a write by a dispatched agent. */
export type ReleaseVerdict =
  | { readonly kind: 'allow' }
  | { readonly kind: 'deny', readonly violation: string, readonly moduleId?: string }

const DISPATCHED = 'You were dispatched (directly or through other subagents) by the main agent'

/**
 * Judge a write by an agent dispatched from a main agent whose focus is
 * `focus`. Denied: no open goal in focus (no focus, a focus that is not in
 * the graph, no goal above it, a closed goal); a goal in wish, interview or
 * design, which includes a proposed goal whatever stage it names and a goal
 * sent back to design for its framework; a goal at release or later whose
 * focus is in a module that is not released (a module in design, or a
 * candidate). Allowed: a released goal outside every unreleased module, and
 * an approved goal that names no stage (the human did not put it through the
 * design loop). The focus at the goal level of a split goal, or at a node
 * that is in no module, is allowed once the goal is released; that is a
 * known remainder (§4.9): the rule reads where the focus is and does not
 * guess which module the work belongs to.
 */
export function releaseVerdict(graph: LoadedGraph, focus: string | undefined): ReleaseVerdict {
  const node = focus === undefined ? undefined : graph.nodes.get(focus)
  const goal = node === undefined ? undefined : goalOf(graph, node.id)
  if (node === undefined || goal === undefined || isClosed(goal)) {
    return { kind: 'deny', violation: `${DISPATCHED}, and it has no open goal in focus, so nothing it plans is released yet.` }
  }
  const stage = effectiveStage(goal)
  if (stage === 'wish' || stage === 'interview' || stage === 'design') {
    return { kind: 'deny', violation: `${DISPATCHED} of a design loop at stage ${stage} (goal ${goal.id}): nothing is built before the human releases the design.` }
  }
  if (stage === null) return { kind: 'allow' }
  const module = moduleOf(graph, node)
  if (module !== undefined && !isReleased(module)) {
    return { kind: 'deny', moduleId: module.id, violation: `${DISPATCHED}, whose focus is in module ${module.id} (${module.title}) of goal ${goal.id}, and the human has not released that module yet: nothing in a module is built before its release.` }
  }
  return { kind: 'allow' }
}

const RIGHT_PATH = 'Read, search and report back; do not hand the write to another subagent, the same rule covers every agent the main agent\'s dispatch chain reaches. The main agent puts the design to the human with propose_to_human; once what it works on (the goal, or its module) is released, the work can be dispatched again. If the main agent has no goal in focus, it focuses the goal or task this work belongs to first.'

const EXCEPTION = 'If a write is needed to answer a design question (a spike), report back and let the main agent put the question to the human.'

/** The four-part correction for a denied write: `fact` says what the call tried. */
export function releaseCorrection(fact: string, verdict: Extract<ReleaseVerdict, { kind: 'deny' }>): Correction {
  const module = verdict.moduleId === undefined ? '' : ` The main agent puts the module to the human with propose_to_human (kind release, module ${verdict.moduleId}); once the module is released, the work can be dispatched again.`
  return { fact, violation: verdict.violation, rightPath: `${RIGHT_PATH}${module}`, exception: EXCEPTION }
}

/** The rule id the execute row's dispatch-chain-readonly gate is journaled under (M7 design 0.6 §3.2.2, §12.1). */
export const DISPATCH_CHAIN_RULE = 'dispatch-chain-readonly'

const DISPATCH_CHAIN_FACT = 'In a main-agent session only dispatched task workers write; you were started with the plain subagent tool.'
const DISPATCH_CHAIN_RIGHT = 'Read, search and report back; the main agent dispatches writing work with dispatch_task.'

/** The four-part correction for a write by an agent of the main agent's chain that no dispatch carries (§3.2.2): `fact` says what the call tried. */
export function dispatchChainCorrection(fact: string): Correction {
  return { fact, violation: DISPATCH_CHAIN_FACT, rightPath: DISPATCH_CHAIN_RIGHT, exception: EXCEPTION }
}

/** What the judge needs from the design row; every member may throw, and the call then passes. */
export interface ReleaseDeps {
  readonly agents: () => Pick<AgentsService, 'get'> | undefined
  /** Whether the agent is its project's main agent now. */
  readonly isMainAgent: (agent: LiveAgentLike) => boolean
  readonly graph: () => GraphFocusService | undefined
  /**
   * The execute row's register check (§3.2.2): `true` for a registered
   * worker or reviewer (its writes are the execute row's rules' business,
   * the release state among them — it passes here), `false` for an agent the
   * row is on for but no dispatch carries, `undefined` when the row cannot
   * say. Never throws.
   */
  readonly isWorker?: (agentId: string) => boolean | undefined
  /** Whether the execute row is on now; the released stage passes only while it is off. */
  readonly executeOn?: () => boolean
}

/** The outcome for one write by a dispatched agent: denied with the verdict, denied as a plain subagent of a main agent, or let through, with why it could not be judged and the main agent it would have been judged against. */
export type ReleaseOutcome =
  | { readonly kind: 'deny', readonly verdict: Extract<ReleaseVerdict, { kind: 'deny' }> }
  | { readonly kind: 'readonly' }
  | { readonly kind: 'allow', readonly unjudged?: string, readonly root?: LiveAgentLike }

/**
 * Judge a write by a dispatched agent: follow the chain to its root, and if
 * the root is a main agent, judge the write by its focus, with the execute
 * row's answer where the row is on. Never throws.
 */
export async function judgeDispatchedWrite(deps: ReleaseDeps, caller: { readonly id: string, readonly session: SessionLike }): Promise<ReleaseOutcome> {
  let root: LiveAgentLike | undefined
  try {
    const agents = deps.agents()
    if (agents === undefined) return { kind: 'allow', unjudged: 'the agents service is not there to follow the dispatch chain' }
    const lookup = dispatchRoot(agents, caller)
    if (lookup.kind === 'unknown') return { kind: 'allow', unjudged: lookup.why }
    if (lookup.kind === 'self') return { kind: 'allow' }
    root = lookup.root
    if (!deps.isMainAgent(root)) return { kind: 'allow' }
    if (deps.isWorker?.(caller.id) === true) return { kind: 'allow' }
    const graph = deps.graph()
    const dir = graph?.dirFor(root.session.header.cwd)
    if (graph === undefined || dir === undefined) return { kind: 'allow', root, unjudged: 'the graph row does not say where the project graph is or what the main agent has in focus' }
    const verdict = releaseVerdict(await loadGraph(dir), graph.focusOf(root.session))
    if (verdict.kind === 'deny') return { kind: 'deny', verdict }
    return deps.executeOn?.() === true ? { kind: 'readonly' } : { kind: 'allow' }
  }
  catch (error) {
    return { kind: 'allow', ...root === undefined ? {} : { root }, unjudged: error instanceof Error ? error.message : String(error) }
  }
}
