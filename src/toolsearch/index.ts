/**
 * dsh-toolsearch — lazy-loading row: for glm agents, every native tool
 * outside the resident eight-pack face leaves the first request and enters
 * the deferred catalog. The ToolSearch alias (verbatim 3.16.3 schema) searches
 * that catalog and activates matches by registering a scoped same-name
 * wrapper — restrictions do not affect scoped registrations (dsh-tools
 * contracts), so activation re-exposes the native from the next request on.
 * DSH itself emits the tool-addition developer notice when the resolved face
 * grows (integration-probe evidence), matching ZCode's reminder flow.
 */
import type { AgentLike, ModelSelection, PluginContext, ToolDefinitionLike } from '../shared/dsh-min.ts'
import { renderFunctionsBlock, searchTools, type DeferredToolEntry } from './search.ts'

const GLM_PROVIDER = 'glm'

/** ToolSearch description, verbatim from the 3.16.3 capture (docs/reference/zcode-tool-schemas.md §8). */
export const TOOLSEARCH_DESCRIPTION
  = 'Fetches full schema definitions for deferred tools so they can be called. Deferred tools appear by name in <system-reminder> messages. Until fetched, only the name is known — there is no parameter schema, so the tool cannot be invoked. This tool takes a query, matches it against the deferred tool list, and returns the matched tools\' complete JSONSchema definitions inside a <functions> block. Result format: each matched tool appears as one `<function>{"description": "...", "name": "...", "parameters": {...}}</function>` line. Use "select:<tool_name>" for direct selection.'

const TOOLSEARCH_PARAMETERS = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'Query to find deferred tools. Use "select:<tool_name>" for direct selection, or keywords to search. Regular expressions are not supported.' },
    max_results: { type: 'number', description: 'Maximum number of results to return (default: 5)' },
  },
  required: ['query', 'max_results'],
} as const

interface AgentState {
  catalog: DeferredToolEntry[]
  activated: Set<string>
  natives: Map<string, ToolDefinitionLike>
  disposers: Array<() => void>
}

/** Resident face: the eight-pack aliases cover these natives; everything else defers. */
const RESIDENT_NATIVES = new Set(['read', 'write', 'edit', 'glob', 'grep', 'pwsh', 'todo_write'])

/** Compute the deferred catalog from the native tools visible at agent creation. */
export function buildCatalog(agent: AgentLike): { catalog: DeferredToolEntry[], natives: Map<string, ToolDefinitionLike> } {
  const catalog: DeferredToolEntry[] = []
  const natives = new Map<string, ToolDefinitionLike>()
  for (const tool of agent.ctx.tools.schemas(agent)) {
    if (RESIDENT_NATIVES.has(tool.name)) continue
    const native = agent.ctx.tools.executable(tool.name)
    if (native === undefined) continue
    natives.set(tool.name, native)
    catalog.push({ name: tool.name, description: native.description, parameters: native.parameters })
  }
  return { catalog, natives }
}

/** Activate one deferred tool: scoped same-name wrapper with deferLoading. */
export function activateTool(agent: AgentLike, state: AgentState, name: string): void {
  if (state.activated.has(name)) return
  const native = state.natives.get(name)
  if (native === undefined) return
  state.activated.add(name)
  const wrapper: ToolDefinitionLike = {
    name: native.name,
    description: native.description,
    parameters: native.parameters,
    output: native.output,
    deferLoading: true,
    async execute(args, exec) {
      return native.execute(args, exec) as Promise<unknown>
    },
  }
  state.disposers.push(agent.ctx.tools.register(wrapper))
}

/** cordis plugin identity. */
export const name = 'dsh-glm-hourness/toolsearch'

/** cordis plugin entry; the returned disposer undoes every agent's registrations. */
export function apply(ctx: PluginContext): () => void {
  const states = new WeakMap<AgentLike, AgentState>()
  const tracked: AgentState[] = []
  const disposeWatch = ctx.on('agent/created', ({ agent }) => {
    const provider = agent.model?.current()?.provider
    if (provider !== GLM_PROVIDER) return
    const { catalog, natives } = buildCatalog(agent)
    const state: AgentState = { catalog, natives, activated: new Set(), disposers: [] }
    states.set(agent, state)
    tracked.push(state)
    // Restrictions intersect with the dialect row's: every deferred native
    // leaves the model-visible face until ToolSearch activates it.
    if (catalog.length > 0) {
      state.disposers.push(agent.ctx.tools.restrict({ deny: catalog.map(entry => entry.name) }))
    }

    const toolSearch: ToolDefinitionLike = {
      name: 'ToolSearch',
      description: TOOLSEARCH_DESCRIPTION,
      parameters: TOOLSEARCH_PARAMETERS as unknown as Record<string, unknown>,
      output: {
        schema: { type: 'object', properties: { matches: { type: 'array', items: { type: 'string' } }, query: { type: 'string' }, total_deferred_tools: { type: 'number' } } },
        render: (_args, value) => [{ type: 'text', text: typeof (value as { block?: unknown }).block === 'string' ? (value as { block: string }).block : 'no matching deferred tools found' }],
      },
      async execute(args, exec) {
        const target = (exec as { agent?: AgentLike } | undefined)?.agent ?? agent
        const current = states.get(target)
        if (current === undefined) return { matches: [], query: String((args as { query?: unknown }).query ?? ''), total_deferred_tools: 0 }
        const outcome = searchTools(current.catalog, args as { query: string, max_results?: number })
        for (const match of outcome.matches) activateTool(target, current, match.name)
        return {
          matches: outcome.matches.map(match => match.name),
          query: (args as { query: string }).query,
          total_deferred_tools: outcome.total,
          block: renderFunctionsBlock(outcome.matches),
        }
      },
    }
    state.disposers.push(agent.ctx.tools.register(toolSearch, {
      when: ({ modelSelection }: { modelSelection?: ModelSelection }) => modelSelection?.provider === GLM_PROVIDER,
    }))
  })
  return () => {
    disposeWatch()
    for (const state of tracked) {
      for (const dispose of state.disposers.splice(0)) dispose()
    }
    tracked.length = 0
  }
}
