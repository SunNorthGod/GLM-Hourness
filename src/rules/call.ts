/**
 * What a rules judgement reads out of a tool call (docs/ORCHESTRATION.md
 * §16.10; design §6.2 step 4): the shell text, the files it writes, and the
 * first sentence of a refusal. One function, so that `checkCall` and the
 * tool-call gate take the same fields from the same call and cannot judge
 * the same call differently.
 *
 * Writes are the targets a file tool names (`write`, `edit`, and every
 * `str_replace_editor` command but `view`) and the targets of the redirections
 * the guard's quote-aware reading of a shell command finds. A shell command
 * that writes without a visible target (`Set-Content` and the like) has no
 * target here, so a rule on `writes` does not see it.
 */
import { shellCommandOf } from '../guard/rules.ts'
import { shellWrites } from '../guard/shell.ts'
import type { JsonValue } from '../shared/json.ts'

export interface DescribedCall {
  /** The shell text of a shell call. */
  readonly command?: string
  /** What the call writes, as the call spells it. */
  readonly writes?: readonly string[]
  /** The first sentence of a refusal: what the agent tried. */
  readonly attempt: string
}

/** How much of a command a refusal quotes. */
const COMMAND_SHOWN = 300

function fileTarget(tool: string, args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return undefined
  const fields = args as Record<string, unknown>
  switch (tool) {
    case 'write': case 'edit':
      return typeof fields.file_path === 'string' ? fields.file_path : undefined
    case 'str_replace_editor':
      return fields.command !== 'view' && typeof fields.path === 'string' ? fields.path : undefined
    default:
      return undefined
  }
}

/** The fields of a call (`tool` is the DSH native name) that rules read, and the sentence a refusal opens with. */
export function describeCall(tool: string, args: unknown): DescribedCall {
  const shell = shellCommandOf({ name: tool, arguments: args as JsonValue })
  if (shell !== undefined) {
    const targets = new Set(shell.dialects.flatMap(dialect => shellWrites(shell.command, dialect)).flatMap(write => write.kind === 'redirect' ? [write.target] : []))
    const shown = shell.command.length > COMMAND_SHOWN ? `${shell.command.slice(0, COMMAND_SHOWN)}...` : shell.command
    return { command: shell.command, ...(targets.size === 0 ? {} : { writes: [...targets] }), attempt: `You tried to run "${shown}".` }
  }
  const target = fileTarget(tool, args)
  if (target !== undefined) return { writes: [target], attempt: `You tried to write "${target}".` }
  return { attempt: `You tried to call ${tool}.` }
}
