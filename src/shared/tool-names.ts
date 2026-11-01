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

/** The memory row's tools. */
export const MEMORY_TOOL_NAMES: readonly string[] = ['memory_store', 'memory_query', 'memory_forget']

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
])
