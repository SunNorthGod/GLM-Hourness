/**
 * Tool names of the orchestration rows that the GLM dialect needs without
 * importing them (docs/DESIGN.md §5.7, §5.3): the graph row's tools
 * (src/graph/tools.ts graphTools), the memory row's (src/memory/tools.ts
 * memoryTools), and those GLM tool search keeps resident. They are
 * strings, which no import rule sees, so tests/contracts.spec.ts pins them
 * to the registrations: a tool added without its name here fails there.
 */

/** The graph row's tools, in registration order. */
export const GRAPH_TOOL_NAMES: readonly string[] = [
  'graph_show', 'graph_open', 'graph_focus', 'graph_propose', 'graph_status', 'graph_edit', 'graph_link',
  'graph_unlink', 'graph_comment', 'graph_verify', 'graph_decide', 'graph_approve', 'graph_reject',
]

/**
 * The rules row's tools, in registration order. An agent that the rules board
 * holds back can still call them, because it has to be able to read the rules
 * that hold it (src/rules/judge.ts leaves them out of what a
 * one-ticket-per-session entry queues). tests/contracts.spec.ts pins the
 * registration of src/rules/index.ts to this list.
 */
export const RULES_TOOL_NAMES: readonly string[] = ['rules_show']

/**
 * The DSH native tools that dispatch a subagent. A call to one of them is a
 * `gate.dispatch` event of the rules board besides the `gate.tool-call` every
 * call is (src/rules/events.ts). The dispatch tool of the orchestration
 * package adds its own name when it exists. tests/contracts.spec.ts pins the
 * names to the dispatch tools the workflow row recognises, which the L3 probe
 * checks against the runtime's tool list.
 */
export const DISPATCH_TOOL_NAMES: readonly string[] = ['subagent', 'subagent_fork']

/**
 * The guard row's tools (m4-gate, design §2.2): not resident — an
 * orchestration tool without a ZCode counterpart is deferred on the GLM
 * route like any DSH tool, and the guard declaration names the lookup for
 * guard_lift. tests/contracts.spec.ts pins the registration to this list.
 */
export const GUARD_TOOL_NAMES: readonly string[] = ['guard_lift']

/**
 * The design row's tools (src/design/propose.ts, src/design/record.ts), only
 * for the main agent: they put a matter to the human and record the human's
 * reply. Exported one by one because the graph panel's live projection
 * cannot import the design row.
 */
export const PROPOSE_TO_HUMAN = 'propose_to_human'
export const RECORD_HUMAN_ANSWER = 'record_human_answer'
export const DESIGN_TOOL_NAMES: readonly string[] = [PROPOSE_TO_HUMAN, RECORD_HUMAN_ANSWER]

/** What propose_to_human reports when it put a matter to the human (its output, `shownProposalOf`). */
export interface ShownProposal {
  readonly tool: typeof PROPOSE_TO_HUMAN
  readonly kind: 'question' | 'confirm' | 'release'
  readonly form?: 'recommend' | 'choose' | 'want' | 'look'
  readonly goal?: string
  readonly module?: string
  readonly question?: string
  readonly number: 1 | 2 | 3
  readonly text: string
  readonly releaseSet?: ReadonlyArray<{ readonly id: string, readonly rev: string }>
}

/**
 * The result of a propose_to_human call that put a matter to the human, read
 * from the text of its tool result; undefined for an error, for another
 * tool's result and for text that is not the tool's output. The one place
 * that knows the shape: the session projection hournessTalk and the panel's
 * live view both read it here.
 */
export function shownProposalOf(isError: boolean, text: string): ShownProposal | undefined {
  if (isError) return undefined
  let value: unknown
  try {
    value = JSON.parse(text)
  }
  catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null) return undefined
  const result = value as Record<string, unknown>
  if (result.tool !== PROPOSE_TO_HUMAN || typeof result.text !== 'string') return undefined
  if (result.kind !== 'question' && result.kind !== 'confirm' && result.kind !== 'release') return undefined
  if (result.number !== 1 && result.number !== 2 && result.number !== 3) return undefined
  if (result.form !== undefined && !(['recommend', 'choose', 'want', 'look'] as readonly unknown[]).includes(result.form)) return undefined
  return result as unknown as ShownProposal
}

/** The memory row's tools. */
export const MEMORY_TOOL_NAMES: readonly string[] = ['memory_store', 'memory_query', 'memory_forget']

/**
 * The memory row's read-only tool for the learning digest: the main agent's,
 * deferred on the GLM route (the digest reminder names it). Kept apart from
 * MEMORY_TOOL_NAMES because the GLM Memory section is for the three tools
 * that save and recall; the row registers both lists and hides both from a
 * delegated child.
 */
export const LEARNING_TOOL_NAMES: readonly string[] = ['learning_signals']

/**
 * The lessons row's lookup tool. The GLM Memory section says where pitfalls
 * go and how to look them up only in a request that has it (src/glm-prompt/index.ts).
 */
export const LESSONS_QUERY_TOOL = 'lessons_query'

/** The lessons row's merge tool: the main agent's only. */
export const LESSONS_MERGE_TOOL = 'lessons_merge'

/** The lessons row's tools, in registration order. */
export const LESSONS_TOOL_NAMES: readonly string[] = [LESSONS_QUERY_TOOL, LESSONS_MERGE_TOOL]

/**
 * Orchestration tools GLM tool search keeps resident (project decisions,
 * docs/ORCHESTRATION.md §8 for memory, §2.8 and §2.10 for the graph). Named
 * one by one: an orchestration tool added later is deferred like any DSH
 * tool without a ZCode counterpart until its name is added here.
 */
export const ORCHESTRATION_RESIDENT_TOOLS: ReadonlySet<string> = new Set([
  // memory
  'memory_store', 'memory_query', 'memory_forget',
  // lessons: the lookup every agent has; the merge tool is the main agent's and stays deferred
  LESSONS_QUERY_TOOL,
  // project graph
  'graph_show', 'graph_open', 'graph_focus', 'graph_propose', 'graph_status', 'graph_edit',
  'graph_link', 'graph_unlink', 'graph_comment', 'graph_verify', 'graph_decide', 'graph_approve', 'graph_reject',
  // design row (main agent)
  ...DESIGN_TOOL_NAMES,
])
