/**
 * ZCode local tool search on one agent (docs/DESIGN.md §5.7, §5.10): part of
 * the dialect, driven by the glm-prompt row's per-request rewrite.
 *
 * Installation registers LocalToolSearch and DeferredToolCall in the agent
 * scope and one `agent/pre-step` listener. For each GLM request the dialect
 * hands its rewritten face to `expose()`: deferred tools leave the face and
 * the control tools stay. Non-GLM requests go through `hide()`, which only
 * removes the control tools. The pre-step listener appends the ZCode
 * announcement of added, re-added and removed deferred names as a
 * `<system-reminder>` notice whose delta persists in the notice source, so
 * later steps, resumed sessions and compacted histories re-derive what the
 * model has been told.
 *
 * DeferredToolCall runs its target through `ctx.tools.execute` without a
 * parent token: ZCode resolves the wrapper before dispatch, so the target is
 * the call every pre/post-execute listener (guard, journal, checkpoints)
 * should see under its own name.
 */
import { createUserNotice, type AgentLike, type AssembledTool, type DerivedMessage, type ToolDefinitionLike, type ToolExecutionContext } from '../shared/dsh-min.ts'
import { searchTools } from './search.ts'
import {
  ANNOUNCEMENT_SOURCE,
  announcementDelta,
  announcementHistory,
  buildToolExposure,
  loadedDefinitions,
  projectSearchResult,
  type ToolSearchExposure,
} from './exposure.ts'
import { DEFERRED_TOOL_CALL_NAME, wrapSystemReminder } from '../shared/zcode-notice.ts'
import {
  DEFERRED_TOOL_CALL_DESCRIPTION,
  DEFERRED_TOOL_CALL_INVALID,
  DEFERRED_TOOL_CALL_PARAMETERS,
  DEFERRED_TOOL_CALL_UNAVAILABLE,
  LOCAL_TOOL_SEARCH_DESCRIPTION,
  LOCAL_TOOL_SEARCH_NAME,
  LOCAL_TOOL_SEARCH_PARAMETERS,
  TOOL_SEARCH_DEFAULT_RESULTS,
  TOOL_SEARCH_NAME,
  TOOL_SEARCH_NOT_ENABLED,
  deferredToolNotAvailable,
  deferredToolResident,
  renderToolSearchAnnouncement,
} from './zcode-text.ts'

/** The dialect's handle on one agent's tool search. */
export interface ToolSearchHandle {
  /** Rewrite one GLM request's face (the dialect's alias face). */
  expose(face: readonly AssembledTool[]): readonly AssembledTool[]
  /** Rewrite one non-GLM request's face: the control tools leave it. */
  hide(face: readonly AssembledTool[]): readonly AssembledTool[]
  dispose(): void
}

interface SearchValue {
  readonly query: string
  readonly matches: readonly string[]
  readonly total_deferred_tools: number
  /** Model-visible text blocks, projected at execution time. */
  readonly content: readonly string[]
}

const SEARCH_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    matches: { type: 'array', items: { type: 'string' } },
    total_deferred_tools: { type: 'number' },
    content: { type: 'array', items: { type: 'string' } },
  },
  required: ['query', 'matches', 'total_deferred_tools', 'content'],
  additionalProperties: false,
}

interface DeferredValue {
  readonly name: string
  /** The target's rendered content, passed through unchanged. */
  readonly content: ReadonlyArray<{ readonly type: string, readonly text?: string }>
}

const DEFERRED_OUTPUT_SCHEMA = {
  type: 'object',
  properties: { name: { type: 'string' }, content: { type: 'array' } },
  required: ['name', 'content'],
  additionalProperties: false,
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** ZCode `ToolSearchInputSchema.parse`: `query` string, optional numeric `max_results` (default 5, not clamped). */
function parseSearchInput(args: unknown): { query: string, maxResults: number } | undefined {
  if (!isRecord(args) || typeof args.query !== 'string') return undefined
  const max = args.max_results
  if (max === undefined) return { query: args.query, maxResults: TOOL_SEARCH_DEFAULT_RESULTS }
  return typeof max === 'number' && Number.isFinite(max) ? { query: args.query, maxResults: max } : undefined
}

/** ZCode `DeferredToolCallInputSchema` (strict): exactly a non-empty `name` and an object `input`. */
function parseDeferredInput(args: unknown): { name: string, input: Record<string, unknown> } | undefined {
  if (!isRecord(args) || Object.keys(args).some(key => key !== 'name' && key !== 'input')) return undefined
  const { name, input } = args
  return typeof name === 'string' && name.length > 0 && isRecord(input) ? { name, input } : undefined
}

/**
 * Install tool search on one agent. Returns undefined, leaving the face
 * untouched, when the agent has no session history to derive state from.
 */
export function installToolSearch(agent: AgentLike): ToolSearchHandle | undefined {
  const session = agent.session
  if (typeof session?.deriveMessages !== 'function') {
    console.warn(`dsh-glm-hourness/glm-prompt: tool search not installed for agent ${agent.id}: no session history`)
    return undefined
  }
  const history = (): readonly DerivedMessage[] => session.deriveMessages() as readonly DerivedMessage[]
  // The latest assembled GLM request; tool calls and the pre-step of a step
  // always follow that step's assembly.
  let current: ToolSearchExposure | undefined

  const localToolSearch: ToolDefinitionLike = {
    name: LOCAL_TOOL_SEARCH_NAME,
    description: LOCAL_TOOL_SEARCH_DESCRIPTION,
    parameters: LOCAL_TOOL_SEARCH_PARAMETERS,
    output: {
      schema: SEARCH_OUTPUT_SCHEMA,
      render: (_args, value) => (value as SearchValue).content.map(text => ({ type: 'text', text })),
    },
    async execute(args) {
      const exposure = current
      if (exposure?.enabled !== true) throw new Error(TOOL_SEARCH_NOT_ENABLED)
      const input = parseSearchInput(args)
      if (input === undefined) throw new Error(`Invalid ${LOCAL_TOOL_SEARCH_NAME} input: query must be a string and max_results a number.`)
      const matches = searchTools(input.query, exposure.catalog, input.maxResults)
      const value: SearchValue = {
        query: input.query,
        matches,
        total_deferred_tools: exposure.catalog.filter(tool => tool.deferred).length,
        content: projectSearchResult(matches, exposure, loadedDefinitions(history())),
      }
      return value
    },
  }

  const deferredToolCall: ToolDefinitionLike = {
    name: DEFERRED_TOOL_CALL_NAME,
    description: DEFERRED_TOOL_CALL_DESCRIPTION,
    parameters: DEFERRED_TOOL_CALL_PARAMETERS,
    output: {
      schema: DEFERRED_OUTPUT_SCHEMA,
      render: (_args, value) => [...(value as DeferredValue).content] as Array<{ type: string, text?: string }>,
    },
    async execute(args, exec) {
      const exposure = current
      if (exposure?.enabled !== true || !exposure.catalog.some(tool => tool.name === DEFERRED_TOOL_CALL_NAME)) throw new Error(DEFERRED_TOOL_CALL_UNAVAILABLE)
      const input = parseDeferredInput(args)
      if (input === undefined) throw new Error(DEFERRED_TOOL_CALL_INVALID)
      const { name } = input
      const candidate = exposure.catalog.find(tool => tool.name === name)
      // The catalog names the search tool ToolSearch; DSH registers it as LocalToolSearch.
      const entry = agent.ctx.tools.get(name === TOOL_SEARCH_NAME ? LOCAL_TOOL_SEARCH_NAME : name, agent)
      if (candidate === undefined || entry === undefined) throw new Error(deferredToolNotAvailable(name))
      if (name === TOOL_SEARCH_NAME || name === DEFERRED_TOOL_CALL_NAME || !candidate.deferred) throw new Error(deferredToolResident(name))
      const call = exec as ToolExecutionContext
      const result = await agent.ctx.tools.execute({
        callId: `${call.callId}:deferred`,
        rootCallId: call.rootCallId ?? call.callId,
        name,
        arguments: input.input,
        agent,
        signal: call.signal,
      })
      for (const context of result.additionalContexts ?? []) call.deferContext(context)
      if (result.concludesTurn === true) call.concludeTurn()
      if (result.isError) throw new Error(result.error?.message ?? result.content.map(block => block.text ?? '').join('\n'))
      const value: DeferredValue = { name, content: result.content }
      return value
    },
  }

  const disposers = [agent.ctx.tools.register(localToolSearch), agent.ctx.tools.register(deferredToolCall)]

  // Announcement (ZCode attachment collection): after the step's input is
  // admitted, before the request. Mirrors installModelSelection's guard so
  // an empty decision never turns into a step.
  disposers.push(agent.ctx.on('agent/pre-step', async ({ messages, signal, step }, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision
    if (decision.messages.length === 0 && (step === 1 || messages.length > 0)) return decision
    const exposure = current
    if (exposure === undefined) return decision
    const delta = announcementDelta(announcementHistory(history()), exposure)
    if (delta === undefined) return decision
    // 3.17.1 `toolSearchHiddenNames`: removed names the registry still holds,
    // hidden from this request rather than gone from the session.
    const hiddenNames = delta.removedNames.filter(name => agent.ctx.tools.get(name, agent) !== undefined)
    const summary = `deferred tools: ${delta.addedNames.length} added, ${delta.removedNames.length} removed`
    const notice = createUserNotice(ANNOUNCEMENT_SOURCE, summary, wrapSystemReminder(renderToolSearchAnnouncement(delta, hiddenNames)), {
      toolSearchAnnouncement: delta,
      ...(hiddenNames.length > 0 ? { toolSearchHiddenNames: hiddenNames } : {}),
    })
    return { ...decision, messages: [...decision.messages, notice] }
  }))

  return {
    expose(face) {
      current = buildToolExposure(face)
      return current.tools
    },
    hide(face) {
      current = undefined
      return face.filter(tool => tool.name !== LOCAL_TOOL_SEARCH_NAME && tool.name !== DEFERRED_TOOL_CALL_NAME)
    },
    dispose() {
      for (const dispose of disposers.splice(0)) dispose()
    },
  }
}
