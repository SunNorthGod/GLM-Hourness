/**
 * ZCode local tool search on one agent (docs/DESIGN.md §5.7, §5.10): part of
 * the dialect. Installation registers LocalToolSearch and DeferredToolCall in
 * the agent scope and one `agent/pre-step` listener, which computes the
 * step's exposure state itself: the pre-exposure wire face of the agent's
 * registry view (src/glm-llm/face-wire.ts `wireFaceProjection`) — the
 * assemble waterfall no longer carries a tool face on the installed runtime,
 * so the state no longer rides on the glm-prompt row's rewrite. A GLM step
 * (the payload's model selection) builds the exposure: its deferred names
 * leave the request face and the control tools stay; a non-GLM step has no
 * exposure and no announcement. The listener appends the ZCode announcement
 * of added, re-added and removed deferred names as a `<system-reminder>`
 * notice whose delta persists in the notice source, so later steps, resumed
 * sessions and compacted histories re-derive what the model has been told.
 *
 * The registry view has no step admission; this package registers no
 * conditional tools, so the view and the request face differ only on the
 * host's own `when` tools (face-migration design 0.1 §4.4, recorded).
 *
 * DeferredToolCall runs its target through `ctx.tools.execute` without a
 * parent token: ZCode resolves the wrapper before dispatch, so the target is
 * the call every pre/post-execute listener (guard, journal, checkpoints)
 * should see under its own name.
 */
import { createUserNotice, type AgentLike, type DerivedMessage, type ToolDefinitionLike, type ToolExecutionContext } from '../shared/dsh-min.ts'
import type { FacePolicyRegistry } from '../shared/face-policy.ts'
import { isGlmModel } from '../shared/route.ts'
import { wireFaceProjection } from '../glm-llm/face-wire.ts'
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
 * Install tool search on one agent. `policy` reads the face-policy registry
 * per step (the role layer of the projection). Returns undefined, leaving
 * the face untouched, when the agent has no session history to derive state
 * from.
 */
export function installToolSearch(agent: AgentLike, options: { readonly policy?: () => FacePolicyRegistry | undefined } = {}): ToolSearchHandle | undefined {
  const session = agent.session
  if (typeof session?.deriveMessages !== 'function') {
    console.warn(`dsh-glm-hourness/glm-prompt: tool search not installed for agent ${agent.id}: no session history`)
    return undefined
  }
  const history = (): readonly DerivedMessage[] => session.deriveMessages() as readonly DerivedMessage[]
  // The exposure state of the latest step; tool calls of a step always follow
  // its pre-step, which computes it before the step is admitted.
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
      // The target runs as a one-call batch (rc.1 dsh-tools `execute` takes
      // `{calls, agent, signal}`; the 0.2.1-rc.3 service took the single
      // same-process call, docs/DESIGN.md §2.4a): no `log`, so the batch logs
      // no session events of its own, and no `toolSet`, so the target
      // resolves against the registry view. The listeners see it under its
      // own name, as ZCode's wrapper resolution does.
      const batch = await agent.ctx.tools.execute({
        calls: [{ type: 'tool-call', id: `${call.callId}:deferred`, name, arguments: input.input }],
        agent,
        signal: call.signal,
      })
      const result = batch.results[0]?.result
      if (result === undefined) throw new Error(deferredToolNotAvailable(name))
      for (const context of batch.additionalContexts ?? []) call.deferContext(context)
      if (batch.concluded === true) call.concludeTurn()
      if (result.isError) throw new Error(result.error?.message ?? result.content.map(block => block.text ?? '').join('\n'))
      const value: DeferredValue = { name, content: result.content }
      return value
    },
  }

  const disposers = [agent.ctx.tools.register(localToolSearch), agent.ctx.tools.register(deferredToolCall)]

  // Announcement (ZCode attachment collection): the step's exposure state is
  // computed before the step is admitted — the pre-exposure wire face of the
  // registry view, GLM by the payload's model selection (the same selection
  // the assemble waterfall's variables carry) — then the delta of that state
  // against the persisted announcements rides on the admitted decision.
  // Mirrors installModelSelection's guard so an empty decision never turns
  // into a step.
  disposers.push(agent.ctx.on('agent/pre-step', async ({ messages, modelSelection, signal, step }, next) => {
    const glm = isGlmModel(modelSelection?.model)
    current = glm
      ? buildToolExposure(wireFaceProjection(agent.ctx.tools.schemas(agent), { glm: true, sessionId: session.id, policy: options.policy?.() }))
      : undefined
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
    dispose() {
      for (const dispose of disposers.splice(0)) dispose()
    },
  }
}
