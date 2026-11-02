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

/** The memory row's tools. */
export const MEMORY_TOOL_NAMES: readonly string[] = ['memory_store', 'memory_query', 'memory_forget']

/**
 * Orchestration tools GLM tool search keeps resident (project decisions,
 * docs/ORCHESTRATION.md §8 for memory, §2.8 and §2.10 for the graph). Named
 * one by one: an orchestration tool added later is deferred like any DSH
 * tool without a ZCode counterpart until its name is added here.
 */
export const ORCHESTRATION_RESIDENT_TOOLS: ReadonlySet<string> = new Set([
  // memory
  'memory_store', 'memory_query', 'memory_forget',
  // project graph
  'graph_show', 'graph_open', 'graph_focus', 'graph_propose', 'graph_status', 'graph_edit',
  'graph_link', 'graph_unlink', 'graph_comment', 'graph_verify', 'graph_decide', 'graph_approve', 'graph_reject',
])
