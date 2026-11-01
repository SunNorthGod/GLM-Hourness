/**
 * The main agent's tool face (docs/ORCHESTRATION.md §3.1, decision
 * question-26 C): the main agent has no tool that writes files and no
 * question card tool. Taking a tool off the face is not the boundary (the
 * runtime executes by name; the guard rules deny a call by name), it spares
 * the model a tool it cannot use. Native names are compared, so a dialect
 * alias of the same tool goes too.
 */
import type { AssembledTool } from '../shared/dsh-min.ts'
import { DESIGN_TOOL_NAMES } from '../shared/tool-names.ts'
import { HIDDEN_FROM_MAIN_AGENT } from './talk.ts'

/** DSH natives that write files. */
export const WRITE_NATIVES: readonly string[] = ['write', 'edit']

const STR_REPLACE_EDITOR = 'str_replace_editor'

export const STR_REPLACE_EDITOR_UNKNOWN = 'str_replace_editor 的参数形状不认识，主 Agent 的工具面里去掉了它'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The tool with its `command` choices cut to `view`; undefined when the schema is not `properties.command.enum`. */
function viewOnly(tool: AssembledTool): AssembledTool | undefined {
  const properties = tool.parameters.properties
  if (!isRecord(properties)) return undefined
  const command = properties.command
  if (!isRecord(command) || !Array.isArray(command.enum)) return undefined
  return { ...tool, parameters: { ...tool.parameters, properties: { ...properties, command: { ...command, enum: ['view'] } } } }
}

/**
 * The tools of the face of a session that is not the main agent: the tools of
 * the design row (propose_to_human, record_human_answer) are for the main
 * agent only, so they are taken off every other session's face. The same
 * array when it has none of them.
 */
export function ordinaryFace(tools: readonly AssembledTool[], native: (name: string) => string): readonly AssembledTool[] {
  const kept = tools.filter(tool => !DESIGN_TOOL_NAMES.includes(native(tool.name)))
  return kept.length === tools.length ? tools : kept
}

/**
 * The tools of an ordinary session's face as the main agent sees them.
 * `native` maps a tool name to its DSH native. `problems` lists what could
 * not be done as written (a tool dropped for a schema this code does not know).
 */
export function mainAgentFace(tools: readonly AssembledTool[], native: (name: string) => string): { readonly tools: AssembledTool[], readonly problems: string[] } {
  const kept: AssembledTool[] = []
  const problems: string[] = []
  for (const tool of tools) {
    const own = native(tool.name)
    if (WRITE_NATIVES.includes(own) || HIDDEN_FROM_MAIN_AGENT.includes(own)) continue
    if (own === STR_REPLACE_EDITOR) {
      const narrowed = viewOnly(tool)
      if (narrowed === undefined) problems.push(STR_REPLACE_EDITOR_UNKNOWN)
      else kept.push(narrowed)
      continue
    }
    kept.push(tool)
  }
  return { tools: kept, problems }
}
