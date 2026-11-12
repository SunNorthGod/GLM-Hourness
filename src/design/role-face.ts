/**
 * The design row's face-policy source (face-migration design 0.1 §4.1, §6 B):
 * which registered (native) tool names leave the wire face of whom. The main
 * agent has no tool that writes files and no question card tool, and its
 * str_replace_editor is narrowed to `command: view`; every other session, a
 * delegated child included, has no tool of this row (propose_to_human,
 * record_human_answer). Taking a tool off the face is not the boundary (the
 * runtime executes by name; the guard rules deny a call by name), it spares
 * the model a tool it cannot use. Removals name DSH natives: a dialect alias
 * of the same tool dies with it, matched through the static alias table the
 * wire layer reads (src/glm-llm/face-wire.ts).
 *
 * The source is registered on the `glmHournessFaces` registry (glm-llm row)
 * and read per request at the wire layer; a session whose role cannot be
 * resolved counts as no removal.
 */
import type { FacePolicySource, ToolNarrowing } from '../shared/face-policy.ts'
import { DESIGN_TOOL_NAMES } from '../shared/tool-names.ts'
import { HIDDEN_FROM_MAIN_AGENT } from './talk.ts'

/** DSH natives that write files. */
export const WRITE_NATIVES: readonly string[] = ['write', 'edit']

const STR_REPLACE_EDITOR = 'str_replace_editor'

export const STR_REPLACE_EDITOR_UNKNOWN = 'str_replace_editor 的参数形状不认识，主 Agent 的工具面里去掉了它'

/** The removals of a main agent's face: the writing natives and the question card. */
const MAIN_AGENT_REMOVALS: ReadonlySet<string> = new Set([...WRITE_NATIVES, ...HIDDEN_FROM_MAIN_AGENT])

/** The removals of every session that is not the main agent: the two tools of this row. */
const ORDINARY_REMOVALS: ReadonlySet<string> = new Set(DESIGN_TOOL_NAMES)

const NO_REMOVALS: ReadonlySet<string> = new Set()

const VIEW_ONLY: ReadonlyArray<ToolNarrowing> = [{ tool: STR_REPLACE_EDITOR, parameter: 'command', values: ['view'] }]

/** The session facts the source reads, resolved by the row. */
export interface DesignFaceDeps {
  /** Whether the session is its project's main agent; undefined when the session cannot be resolved (no removal). */
  readonly isMain: (sessionId: string) => boolean | undefined
  /** The session's row health, for the unknown narrowing shape the wire layer reports. */
  readonly report: (sessionId: string, text: string) => void
}

/** The design row's face-policy source: registered once at activation, read live per request. */
export function designFaceSource(deps: DesignFaceDeps): FacePolicySource {
  const isMain = (sessionId: string): boolean | undefined => {
    try {
      return deps.isMain(sessionId)
    }
    catch {
      return undefined
    }
  }
  return {
    removals(sessionId) {
      const who = isMain(sessionId)
      return who === true ? MAIN_AGENT_REMOVALS : who === false ? ORDINARY_REMOVALS : NO_REMOVALS
    },
    narrowing(sessionId) {
      return isMain(sessionId) === true ? VIEW_ONLY : []
    },
    onUnknownShape(sessionId) {
      deps.report(sessionId, STR_REPLACE_EDITOR_UNKNOWN)
    },
  }
}
