/**
 * Local tool-search exposure over the GLM request face, ported from ZCode
 * 3.16.3 (bundle `resolveToolSearchCatalog`, `buildToolExposure`,
 * `buildToolSearchAnnouncement`, `projectToolReferences`).
 *
 * Classification (docs/DESIGN.md §5.10): ZCode defers tools that declare
 * `shouldDefer` and MCP tools; a DSH tool with a ZCode counterpart follows
 * the counterpart, and a DSH tool without one follows the MCP rule (deferred).
 * Memory tools stay resident by project decision (ORCHESTRATION.md §8).
 *
 * ZCode recomputes history projections on every request; DSH persists each
 * tool result once. So the projection runs when LocalToolSearch executes,
 * and the history facts it needs (announced names, definitions the model
 * already holds) are re-derived from the session's model-visible history,
 * which also follows compaction and resume. Not ported: the post-compaction
 * promotion of loaded tools to resident (ZCode `preCompactDiscoveredTools`);
 * after a DSH compaction, loaded tools are announced and searched again.
 */
import type { AssembledTool, DerivedMessage } from '../shared/dsh-min.ts'
import { mcpPresentation, type ToolSearchCandidate } from './search.ts'
import {
  DEFERRED_TOOL_CALL_NAME,
  LOCAL_TOOL_SEARCH_NAME,
  NO_MATCHING_DEFERRED_TOOLS,
  TOOL_REFERENCES_REMOVED,
  TOOL_SEARCH_NAME,
  localDefinitionsBlock,
  localToolsAlreadyLoadedReminder,
  localToolsLoadedReminder,
  renderLocalDefinition,
  type ToolSearchAnnouncement,
} from './zcode-text.ts'

/** Tools that stay in the request face. Everything else in a GLM face is deferred. */
export const RESIDENT_TOOLS: ReadonlySet<string> = new Set([
  // ZCode 3.16.3 tools without shouldDefer (core/src/tool/handlers/).
  'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'ApplyPatch', 'Agent', 'Skill', 'Workflow', 'GoalRead', 'AskUserQuestion',
  // DSH tools whose ZCode counterpart is resident.
  'read_image', // Read handles images
  'bash', // Bash, on hosts where the dialect shims pwsh only
  'str_replace_editor', // Edit
  'subagent', 'subagent_fork', // Agent
  'skill', 'workflow', 'get_goal', 'ask_user_question',
  // Project decision: memory stays at hand (ORCHESTRATION.md §8).
  'memory_store', 'memory_query', 'memory_forget',
])

/** Whether a face tool is deferred by configuration (ZCode `isDeferredTool`). */
export function isConfiguredDeferred(name: string): boolean {
  return name !== LOCAL_TOOL_SEARCH_NAME && name !== DEFERRED_TOOL_CALL_NAME && !RESIDENT_TOOLS.has(name)
}

/** One GLM request's tool-search state. */
export interface ToolSearchExposure {
  /** Deferred tools exist and both control tools are registered. */
  readonly enabled: boolean
  /** The face the request carries. */
  readonly tools: readonly AssembledTool[]
  /** Every face tool, under ZCode's catalog names (the search tool appears as ToolSearch). */
  readonly catalog: readonly ToolSearchCandidate[]
  readonly deferred: ReadonlySet<string>
  /** Catalog names of every face tool, for removal announcements. */
  readonly available: ReadonlySet<string>
  /** Definitions a search result renders, by catalog name. */
  readonly definitions: ReadonlyMap<string, AssembledTool>
}

/** The model-facing contract fields; ZCode drops `deferLoading` outside native mode. */
function contract(tool: AssembledTool): AssembledTool {
  return { name: tool.name, description: tool.description, parameters: tool.parameters }
}

function candidate(tool: AssembledTool): ToolSearchCandidate {
  const isSearch = tool.name === LOCAL_TOOL_SEARCH_NAME
  const name = isSearch ? TOOL_SEARCH_NAME : tool.name
  const mcp = mcpPresentation(name)
  return {
    name,
    ...(isSearch ? { aliases: [LOCAL_TOOL_SEARCH_NAME] } : {}),
    ...(mcp === undefined ? {} : { mcp }),
    description: tool.description,
    deferred: isConfiguredDeferred(tool.name),
  }
}

/** Resolve one GLM request's face: deferred tools leave it while the control tools can serve them. */
export function buildToolExposure(face: readonly AssembledTool[]): ToolSearchExposure {
  const contracts = face.map(contract)
  const catalog = contracts.map(candidate)
  const deferred = new Set(catalog.filter(tool => tool.deferred).map(tool => tool.name))
  const names = new Set(contracts.map(tool => tool.name))
  const enabled = deferred.size > 0 && names.has(LOCAL_TOOL_SEARCH_NAME) && names.has(DEFERRED_TOOL_CALL_NAME)
  const tools = enabled
    ? contracts.filter(tool => !deferred.has(tool.name))
    : contracts.filter(tool => tool.name !== LOCAL_TOOL_SEARCH_NAME && tool.name !== DEFERRED_TOOL_CALL_NAME)
  const definitions = new Map(contracts.map(tool => [tool.name, tool]))
  const search = definitions.get(LOCAL_TOOL_SEARCH_NAME)
  if (search !== undefined) definitions.set(TOOL_SEARCH_NAME, search)
  return { enabled, tools, catalog, deferred, available: new Set(catalog.map(tool => tool.name)), definitions }
}

/** The announcement delta this request needs, given the deltas already in history. */
export function announcementDelta(history: readonly ToolSearchAnnouncement[], exposure: ToolSearchExposure): ToolSearchAnnouncement | undefined {
  if (!exposure.enabled) return undefined
  const announced = new Set<string>()
  const listed = new Set<string>()
  for (const delta of history) {
    const readded = new Set(delta.readdedNames)
    for (const name of delta.addedNames) {
      announced.add(name)
      if (!readded.has(name)) listed.add(name)
    }
    for (const name of delta.removedNames) announced.delete(name)
  }
  const names = [...exposure.deferred].sort()
  const addedNames = names.filter(name => !announced.has(name) || !listed.has(name))
  const readdedNames = names.filter(name => !announced.has(name) && listed.has(name))
  const removedNames = [...announced].filter(name => !exposure.available.has(name)).sort()
  if (addedNames.length === 0 && removedNames.length === 0) return undefined
  return { addedNames, removedNames, readdedNames }
}

/**
 * Model-visible content of one successful search: matched definitions in a
 * `<functions>` block, then the loaded and already-loaded reminders.
 * @param loaded - deferred definitions the model already received before the latest assistant message.
 */
export function projectSearchResult(matches: readonly string[], exposure: ToolSearchExposure, loaded: ReadonlySet<string>): string[] {
  if (matches.length === 0) return [NO_MATCHING_DEFERRED_TOOLS]
  const definitions: string[] = []
  const newlyLoaded: string[] = []
  const alreadyLoaded: string[] = []
  for (const match of matches) {
    const tool = exposure.definitions.get(match)
    if (tool === undefined) continue
    if (exposure.deferred.has(tool.name) && loaded.has(tool.name)) {
      alreadyLoaded.push(tool.name)
      continue
    }
    definitions.push(renderLocalDefinition(tool))
    // Resident tools stay directly callable; only deferred ones get the DeferredToolCall guidance.
    if (exposure.deferred.has(tool.name)) newlyLoaded.push(tool.name)
  }
  const blocks: string[] = []
  if (definitions.length > 0) blocks.push(localDefinitionsBlock(definitions))
  if (newlyLoaded.length > 0) blocks.push(localToolsLoadedReminder(newlyLoaded))
  if (alreadyLoaded.length > 0) blocks.push(localToolsAlreadyLoadedReminder(alreadyLoaded))
  return blocks.length > 0 ? blocks : [TOOL_REFERENCES_REMOVED]
}

/** Source kind of the persisted announcement notice. */
export const ANNOUNCEMENT_SOURCE = 'glm-tool-search'

const isNameList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(name => typeof name === 'string' && name.length > 0)

/** Announcement deltas persisted with the notices still in the visible history, oldest first. */
export function announcementHistory(messages: readonly DerivedMessage[]): ToolSearchAnnouncement[] {
  const deltas: ToolSearchAnnouncement[] = []
  for (const message of messages) {
    if (message.role !== 'user' || message.source?.kind !== ANNOUNCEMENT_SOURCE) continue
    const facts = message.source.toolSearchAnnouncement as Record<string, unknown> | undefined
    if (typeof facts !== 'object' || facts === null) continue
    const { addedNames, removedNames, readdedNames } = facts
    if (!isNameList(addedNames) || !isNameList(removedNames) || !isNameList(readdedNames)) continue
    // ZCode's schema refinement: re-added names are a subset of added names.
    if (!readdedNames.every(name => addedNames.includes(name))) continue
    deltas.push({ addedNames, removedNames, readdedNames })
  }
  return deltas
}

const FUNCTION_OPEN = '<function>'
const FUNCTION_CLOSE = '</function>'

/** Names whose definitions successful LocalToolSearch results delivered before the latest assistant message. */
export function loadedDefinitions(messages: readonly DerivedMessage[]): Set<string> {
  let latestAssistant = -1
  messages.forEach((message, index) => { if (message.role === 'assistant') latestAssistant = index })
  const searchCalls = new Set<string>()
  const loaded = new Set<string>()
  for (const message of messages.slice(0, Math.max(latestAssistant, 0))) {
    if (message.role === 'assistant') {
      for (const block of message.content ?? []) {
        if (block.type === 'tool-call' && block.name === LOCAL_TOOL_SEARCH_NAME && typeof block.id === 'string') searchCalls.add(block.id)
      }
      continue
    }
    if (message.role !== 'tool' || message.isError === true || message.toolCallId === undefined || !searchCalls.has(message.toolCallId)) continue
    for (const block of message.content ?? []) {
      for (const line of (block.type === 'text' ? block.text ?? '' : '').split('\n')) {
        if (!line.startsWith(FUNCTION_OPEN) || !line.endsWith(FUNCTION_CLOSE)) continue
        try {
          const definition = JSON.parse(line.slice(FUNCTION_OPEN.length, -FUNCTION_CLOSE.length)) as { name?: unknown }
          if (typeof definition.name === 'string') loaded.add(definition.name)
        }
        catch {
          // Not a definition line this module rendered.
        }
      }
    }
  }
  return loaded
}
