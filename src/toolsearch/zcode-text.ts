/**
 * ZCode 3.17.1 local tool-search texts, mirrored from the release bundle
 * (reference/zcode-3.17.1/zcode.cjs); bundle names in the comments are the
 * 3.16.3 ones where the text did not change. Verbatim mirror file: every
 * string and template-literal chunk below must occur in the reference, which
 * scripts/check-verbatim.mjs enforces chunk by chunk. Templates keep the
 * bundle's interpolation points and joins.
 *
 * The 3.16.2 source tree (reference/ZCode, core/src/tool/search/) has the
 * same structure; 3.16.3 differs in that the local-mode search tool is
 * exposed as LocalToolSearch (toolSearchNameForMode), the description gains
 * the "Regular expressions are not supported" paragraph and a new select
 * example, the no-match text is longer, and the loaded reminder names
 * LocalToolSearch. Keep this file free of regex literals and division: the
 * gate's scanner does not parse them. The DeferredToolCall name and the
 * <system-reminder> wrapping are shared with the orchestration rows and live
 * in the shared mirror file src/shared/zcode-notice.ts.
 */
import { DEFERRED_TOOL_CALL_NAME, wrapSystemReminder } from '../shared/zcode-notice.ts'

export const TOOL_SEARCH_NAME = 'ToolSearch'
export const LOCAL_TOOL_SEARCH_NAME = 'LocalToolSearch'
export const TOOL_SEARCH_DEFAULT_RESULTS = 5

/** Shared description template (bundle `Ngo`). */
function description(opening: string, callingConvention: string, resultNote: string): string {
  return `${opening}

Deferred tools appear by name in <system-reminder> messages. Until fetched, only the name is known \u2014 there is no parameter schema, so the tool cannot be invoked. This tool takes a query, matches it against the deferred tool list, and returns the matched tools' complete JSONSchema definitions inside a <functions> block. ${callingConvention}

Result format: each matched tool appears as one <function>{"description": "...", "name": "...", "parameters": {...}}</function> line inside the <functions> block${resultNote}

Query forms:
Regular expressions are not supported. Use space-separated keywords for broad searches, or "select:<name>[,<name>...]" for exact tool names. Characters such as "|" and ".*" are treated literally. For example, use "shell terminal execute command".

- "select:TodoWrite,mcp__byob__browser_navigate" \u2014 fetch these exact deferred tools by name
- "notebook jupyter" \u2014 keyword search, up to max_results best matches
- "+slack send" \u2014 require "slack" in the name, rank by remaining terms`
}

/** LocalToolSearch description (bundle `Fgo`). */
export const LOCAL_TOOL_SEARCH_DESCRIPTION = `${description(
  'Fetches full schema definitions for deferred tools so they can be called using DeferredToolCall.',
  'Call deferred tools through DeferredToolCall with {name, input}. Call resident tools directly using their normal tool calls, even if their definitions were returned by direct selection.',
  '. For deferred tools, parameters describes the input object passed to DeferredToolCall.',
)}

Example (TodoWrite is deferred and already loaded):
<example>
DeferredToolCall({"name":"TodoWrite","input":{"todos":[{"content":"Inspect the implementation","status":"in_progress","priority":"high"}]}})
</example>`

/**
 * LocalToolSearch input schema: zod-to-json-schema output of the ToolSearch
 * input object (`max_results` keeps its default), with `required` overridden
 * to both fields (bundle `hOr`). The tool contract passes it to the model
 * unchanged.
 */
export const LOCAL_TOOL_SEARCH_PARAMETERS = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'Query to find deferred tools. Use "select:<tool_name>" for direct selection, or keywords to search. Regular expressions are not supported.',
    },
    max_results: {
      type: 'number',
      default: TOOL_SEARCH_DEFAULT_RESULTS,
      description: 'Maximum number of results to return (default: 5)',
    },
  },
  required: ['query', 'max_results'],
  additionalProperties: false,
  $schema: 'http://json-schema.org/draft-07/schema#',
}

/** DeferredToolCall description (bundle tool entry metadata). */
export const DEFERRED_TOOL_CALL_DESCRIPTION
  = 'Immediately call one deferred tool and return its result. Use LocalToolSearch to load its complete definition, then pass its exact name and input object. Only deferred tools can be called here; call resident tools directly using their normal tool calls.'

/** DeferredToolCall input schema: zod-to-json-schema output of the strict `{ name, input }` object. */
export const DEFERRED_TOOL_CALL_PARAMETERS = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    input: { type: 'object', additionalProperties: {} },
  },
  required: ['name', 'input'],
  additionalProperties: false,
  $schema: 'http://json-schema.org/draft-07/schema#',
}

/** Search result text when nothing matches (bundle `Eha`). */
export const NO_MATCHING_DEFERRED_TOOLS
  = 'No matching deferred tools found. Loaded tools are not searchable here and need no loading. Check your loaded tool list and query; try corrected spelling, alternative names, or broader keywords before concluding a tool is missing.'

/** Projection text when every returned reference left the catalog. */
export const TOOL_REFERENCES_REMOVED = '[Tool references removed - tools no longer available]'

/** Search handler rejection outside an enabled request. */
export const TOOL_SEARCH_NOT_ENABLED = 'ToolSearch is not enabled for this request.'

/** DeferredToolCall rejections (bundle `resolveDeferredToolCall`). */
export const DEFERRED_TOOL_CALL_UNAVAILABLE = 'DeferredToolCall is not available for this request.'
export const DEFERRED_TOOL_CALL_INVALID = 'Invalid DeferredToolCall input.'
export function deferredToolNotAvailable(name: string): string {
  return `Tool not available in this request: ${name}`
}
export function deferredToolResident(name: string): string {
  return `Call ${name} directly using its normal tool call; DeferredToolCall only accepts deferred tools.`
}

/** Local-mode added-tools notice (bundle `Lla`). */
const LOCAL_ADDED_TOOLS_NOTICE = `The following deferred tools are available via ${LOCAL_TOOL_SEARCH_NAME}. Use query "select:<name>[,<name>...]" to load their complete schemas, then call them through ${DEFERRED_TOOL_CALL_NAME} with {name, input}. Call resident tools directly:`
const MAX_REMOVED_NAME_LINES = 30
const AMBIENT_CONTEXT_NOTICE
  = 'This is ambient context \u2014 do not narrate it to the user unless they ask or it is directly relevant to their request.'
/** Where re-added names come from (3.17.1 bundle `__a` for MCP names, `y_a` for the session's own). */
const MCP_RECONNECTED = '(MCP server reconnected \u2014 names announced earlier in this conversation)'
const SESSION_ANNOUNCED_EARLIER = 'in this session (announced earlier in this conversation)'
/** The clause every removal paragraph ends with (3.17.1 `G_t` local `c`). */
const DO_NOT_SEARCH = `Do not search for them \u2014 ${LOCAL_TOOL_SEARCH_NAME} will return no match`

/** An MCP tool name (bundle `eZ`). */
function isMcpName(name: string): boolean {
  return name.startsWith('mcp__')
}

/** Announcement delta persisted with the notice (bundle `toolSearchAnnouncement` metadata). */
export interface ToolSearchAnnouncement {
  readonly addedNames: readonly string[]
  readonly removedNames: readonly string[]
  readonly readdedNames: readonly string[]
}

/** Group MCP names per server for the model-visible text (bundle `oIn`). */
export function summarizeToolNames(names: readonly string[]): string {
  const counts = new Map<string, number>()
  for (const name of names) {
    const group = isMcpName(name) ? `${name.split('__', 2).join('__')}__*` : name
    counts.set(group, (counts.get(group) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => (count > 1 ? `${name} (${count})` : name))
    .join(', ')
}

/**
 * Local-mode announcement body (3.17.1 `G_t` with mode "local"). Re-added
 * names split into MCP names (their server reconnected) and the session's
 * own; removed names into those still registered but hidden from this
 * request (`hiddenNames`, 3.17.1 `toolSearchHiddenNames`), MCP names whose
 * server disconnected, and the session's own. Paragraphs join with one
 * newline.
 */
export function renderToolSearchAnnouncement({ addedNames, removedNames, readdedNames }: ToolSearchAnnouncement, hiddenNames: readonly string[] = []): string {
  const readded = new Set(readdedNames)
  const listedNames = addedNames.filter(name => !readded.has(name))
  const paragraphs: string[] = []
  if (listedNames.length) paragraphs.push(`${LOCAL_ADDED_TOOLS_NOTICE}
${listedNames.join(`
`)}`)
  const availableAgain = (count: number, origin: string, names: string): string => `${count} deferred tool${count === 1 ? ' is' : 's are'} available again ${origin}: ${names}. Load via ${LOCAL_TOOL_SEARCH_NAME} as before.`
  const mcpReadded = readdedNames.filter(isMcpName)
  const sessionReadded = readdedNames.filter(name => !isMcpName(name))
  if (mcpReadded.length) paragraphs.push(availableAgain(mcpReadded.length, MCP_RECONNECTED, summarizeToolNames(mcpReadded)))
  if (sessionReadded.length) paragraphs.push(availableAgain(sessionReadded.length, SESSION_ANNOUNCED_EARLIER, sessionReadded.join(', ')))
  if (removedNames.length) {
    const hidden = new Set(hiddenNames)
    const hiddenRemoved = removedNames.filter(name => hidden.has(name))
    const gone = removedNames.filter(name => !hidden.has(name))
    const mcpGone = gone.filter(isMcpName)
    const sessionGone = gone.filter(name => !isMcpName(name))
    if (mcpGone.length) {
      paragraphs.push(mcpGone.length > MAX_REMOVED_NAME_LINES
        ? `${mcpGone.length} deferred tools are no longer available (MCP server disconnected): ${summarizeToolNames(mcpGone)}. ${DO_NOT_SEARCH}.`
        : `The following deferred tools are no longer available (their MCP server disconnected). ${DO_NOT_SEARCH}:
${mcpGone.join(`
`)}`)
    }
    if (sessionGone.length) {
      paragraphs.push(`The following deferred tools are no longer available in this session. ${DO_NOT_SEARCH}:
${sessionGone.join(`
`)}`)
    }
    if (hiddenRemoved.length) {
      paragraphs.push(hiddenRemoved.length > MAX_REMOVED_NAME_LINES
        ? `${hiddenRemoved.length} deferred tools are no longer available: ${summarizeToolNames(hiddenRemoved)}. ${DO_NOT_SEARCH}.`
        : `The following deferred tools are no longer available. ${DO_NOT_SEARCH}:
${hiddenRemoved.join(`
`)}`)
    }
    paragraphs.push(AMBIENT_CONTEXT_NOTICE)
  }
  return paragraphs.join(`
`)
}

/** Reminder after a search loaded deferred definitions (bundle `Ugo`). */
export function localToolsLoadedReminder(names: readonly string[]): string {
  const action = names.length === 1 ? 'Call it now' : 'Call them now'
  return wrapSystemReminder(`Loaded: ${names.join(', ')}. ${action} with ${DEFERRED_TOOL_CALL_NAME} {"name":"<tool name>","input":{...}}, using the exact tool name and filling input according to its schema above. No additional LocalToolSearch is needed before calling these tools.`)
}

/** Reminder when a search returns definitions the model already has (bundle `Bgo`). */
export function localToolsAlreadyLoadedReminder(names: readonly string[]): string {
  return wrapSystemReminder(`Tool definitions already available in this conversation: ${names.join(', ')}. Use ${DEFERRED_TOOL_CALL_NAME} with {name, input} to execute these tools. Searching again does not execute them.`)
}

/** One definition line (bundle `jgo`). */
export function renderLocalDefinition(tool: { readonly name: string, readonly description?: string, readonly parameters: unknown }): string {
  return `<function>${JSON.stringify({ description: tool.description ?? '', name: tool.name, parameters: tool.parameters })}</function>`
}

/** Definitions block (bundle `$go`). */
export function localDefinitionsBlock(definitions: readonly string[]): string {
  return `<functions>
${definitions.join(`
`)}
</functions>`
}
