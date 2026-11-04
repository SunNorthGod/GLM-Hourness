/**
 * dsh-guard — rule framework (S1 subset): each discipline is data
 * { declare, detect, correct, apply }, enforced hard at the execution
 * boundary with a four-part corrective message (fact / violation / right
 * path / exception). No soft-allow tier: a denied action never executes.
 */
import { resolve } from 'node:path'
import type { JsonValue } from '../shared/json.ts'
import { describeWrite, shellWrites, type ShellDialect, type ShellWrite } from './shell.ts'

/** Four-part corrective message parts. */
export interface Correction {
  readonly fact: string
  readonly violation: string
  readonly rightPath: string
  readonly exception: string
}

export interface ToolCall {
  readonly name: string
  readonly arguments: JsonValue
}

export type RuleVerdict =
  | { readonly kind: 'allow' }
  | { readonly kind: 'deny', readonly rule: string, readonly correction: Correction, readonly ref?: string }

/** DSH native tool name → the name the model sees for it on the route of this call or assembly. */
export type ToolFace = (native: string) => string

/** The names where no dialect claims the route: the natives' own. */
export const NATIVE_FACE: ToolFace = native => native

export interface GuardRule {
  readonly id: string
  /** The rule as the model is told it: one line of the guard section in every route's system prompt (src/guard/index.ts); the function form names tools through the face. */
  readonly declare: string | ((face: ToolFace) => string)
  /**
   * Decide for one tool call. `call.name` is the DSH native the call runs
   * (src/shared/dialect.ts toNativeTool); tool names in the correction come
   * from `face` (default: the natives' own). Throwing counts as allow
   * (fail-open).
   */
  detect(call: ToolCall, face: ToolFace): RuleVerdict
  /** Whether `next` took this rule's right path after `denied` was denied (design §3.3); absent: never counted as right. A rule object carries no `this`. */
  rightPath?(this: void, next: ToolCall, denied: ToolCall): boolean
}

/** A rule's declaration line: a string as it is, the function form rendered with `face`. */
export function declarationOf(rule: GuardRule, face: ToolFace): string {
  return typeof rule.declare === 'string' ? rule.declare : rule.declare(face)
}

/**
 * The exception part of both corrections. No tool or channel takes a filed
 * request until the M4 decision card exists, so the model is sent to the
 * human, the only one who can allow the action.
 */
const ASK_THE_HUMAN = 'tell the human what you need, where and why; only the human can allow it.'

/** Normalize a path for containment checks and path comparison (case-insensitive Windows file systems). */
export function normalizePath(path: string): string {
  return path.replaceAll('/', '\\').replaceAll('\\\\', '\\').toLowerCase().replaceAll('\\', '/')
}

/**
 * The path a file tool writes (`call.name` is the DSH native the call runs;
 * the gate maps the model's spelling there): `write` and `edit` take
 * `file_path`; `str_replace_editor` writes on every command but `view`,
 * which reads, and takes `path`. Undefined for a call that writes no file.
 */
export function fileToolTargetOf(call: ToolCall): string | undefined {
  if (call.name !== 'write' && call.name !== 'edit' && call.name !== 'str_replace_editor') return undefined
  const args = typeof call.arguments === 'object' && call.arguments !== null && !Array.isArray(call.arguments) ? call.arguments as Record<string, JsonValue> : undefined
  if (call.name === 'str_replace_editor') return args?.command !== 'view' && typeof args?.path === 'string' ? args.path : undefined
  return typeof args?.file_path === 'string' ? args.file_path : undefined
}

/**
 * Rule 1: writes stay inside the workspace roots. A relative target resolves
 * against `base` (the session's working directory; default the first root),
 * as the rc.3 file tools resolve it (dsh-fs-local `localDisplayPath`:
 * `resolve(cwd, path)` on win32); resolving also folds `..` segments, so a
 * target cannot climb out of a root by spelling. The roots themselves do not
 * move with `cd`: the base only decides what a relative spelling names.
 *
 * `exception` and `ref` come from the guard row per call (design §5.2): the
 * caller-appropriate request-channel sentence replaces the default one, and
 * the pre-generated ref rides on the denial (the gate registers the refusal
 * only when this rule denied). With them, the follow-up's right path is the
 * request tool; without them the rule is not requestable and has none.
 */
export function workspaceContainment(roots: readonly string[], base: string | undefined = roots[0], exception?: string, ref?: string): GuardRule {
  const normalizedRoots = roots.map(root => normalizePath(resolve(root)).replace(/\/+$/, ''))
  const inside = (absolute: string): boolean => {
    const p = normalizePath(absolute)
    return normalizedRoots.some(root => p === root || p.startsWith(`${root}/`))
  }
  return {
    id: 'workspace-containment',
    declare: 'You may only create and modify files inside the user\'s workspace. Writes anywhere else are rejected.',
    detect(call) {
      const target = fileToolTargetOf(call)
      if (target === undefined) return { kind: 'allow' }
      const absolute = base === undefined ? resolve(target) : resolve(base, target)
      if (inside(absolute)) return { kind: 'allow' }
      return {
        kind: 'deny',
        rule: 'workspace-containment',
        correction: {
          fact: normalizePath(absolute) === normalizePath(target) ? `You tried to write "${target}".` : `You tried to write "${target}" (resolves to "${absolute}").`,
          violation: 'That path is outside the workspace; writes are confined to the workspace.',
          rightPath: 'Recreate this change under the workspace root (project files in place, agent-private artifacts under .llm/).',
          exception: exception ?? `If the task really needs to write outside the workspace, ${ASK_THE_HUMAN}`,
        },
        ...(ref === undefined ? {} : { ref }),
      }
    },
    ...(ref === undefined ? {} : { rightPath(next: ToolCall): boolean { return next.name === 'request_exception' } }),
  }
}

/**
 * Shell tools by DSH native name, the argument that carries their command
 * text, and the dialects it is read in: `pwsh` (which the ZCode Bash alias
 * runs over), `bash` is POSIX, and `terminal_send` writes `text` to a
 * terminal whose backend runs bash or pwsh (dsh-terminal-bash
 * `shellDialect`), so both dialects apply.
 */
const SHELL_TOOLS: ReadonlyMap<string, { readonly field: 'command' | 'text', readonly dialects: readonly ShellDialect[] }> = new Map([
  ['pwsh', { field: 'command', dialects: ['pwsh'] }],
  ['bash', { field: 'command', dialects: ['posix'] }],
  ['terminal_send', { field: 'text', dialects: ['pwsh', 'posix'] }],
])

/** The shell text one call runs, if it is a shell call (`call.name` is the DSH native). */
export function shellCommandOf(call: ToolCall): { readonly command: string, readonly dialects: readonly ShellDialect[] } | undefined {
  const tool = SHELL_TOOLS.get(call.name)
  if (tool === undefined || typeof call.arguments !== 'object' || call.arguments === null || Array.isArray(call.arguments)) return undefined
  const command = (call.arguments as Record<string, JsonValue>)[tool.field]
  return typeof command === 'string' ? { command, dialects: tool.dialects } : undefined
}

/** The first file write the shell text of a call performs, with that text; undefined when the call is not a shell call or writes nothing (`call.name` is the DSH native). */
export function shellWriteOf(call: ToolCall): { readonly command: string, readonly write: ShellWrite } | undefined {
  const shell = shellCommandOf(call)
  const write = shell?.dialects.flatMap(dialect => shellWrites(shell.command, dialect))[0]
  return shell === undefined || write === undefined ? undefined : { command: shell.command, write }
}

function argsOf(call: ToolCall): Record<string, JsonValue> | undefined {
  return typeof call.arguments === 'object' && call.arguments !== null && !Array.isArray(call.arguments) ? call.arguments : undefined
}

/** Whether a call is one of the file tools that write (`call.name` is the DSH native): write and edit always; str_replace_editor on every command but view. */
export function isFileWrite(call: ToolCall): boolean {
  return call.name === 'write' || call.name === 'edit' || (call.name === 'str_replace_editor' && argsOf(call)?.command !== 'view')
}

/**
 * Rule 2: file modification goes through the dedicated tools. Shell commands
 * that write files are denied even inside the workspace — a successful
 * shell write would reinforce the habit this rule exists to break. The
 * command text is read quote-aware (src/guard/shell.ts): only command
 * positions and real redirections count, so arrows and operators inside
 * quoted text are not writes and git subcommands are never write commands.
 */
export const fileToolsOnly: GuardRule = {
  id: 'file-tools-only',
  declare: face => `Modify files and code only with the dedicated ${face('write')}/${face('edit')} tools. The shell is for execution (tests, builds, git), not for writing files: a redirection into a file (\`>\`, \`>>\`) or a file-changing command (Set-Content, Add-Content, Clear-Content, Out-File, Tee-Object, New-Item, Copy-Item, Move-Item, Remove-Item, rm, rmdir, mv, cp, dd, touch, truncate, tee, sed -i) is denied.`,
  detect(call, face = NATIVE_FACE) {
    const shell = shellWriteOf(call)
    if (shell === undefined) return { kind: 'allow' }
    const write = shell.write
    return {
      kind: 'deny',
      rule: 'file-tools-only',
      correction: {
        fact: `You tried to modify files through the shell: "${shell.command}" (${describeWrite(write)}).`,
        violation: 'Shell file writes are not permitted; file changes go through the dedicated tools.',
        rightPath: `Read the target with ${face('read')}, then apply the change with ${face('write')} or ${face('edit')}.`,
        exception: 'Build, test and git commands that write files as a side effect are allowed; only redirections and file-changing commands are denied. If this command writes no file, say so in your reply: the denial is recorded for review.',
      },
    }
  },
  // The follow-up recorder's right path (m4-gate G2, design §3.3): the next call writes through a file tool.
  rightPath(next) {
    return fileToolTargetOf(next) !== undefined
  },
}

/** One rule's denial, as the gate keeps it: the request ref arrives with the requestable rules (m4-request-card). */
export interface RuleDeny {
  readonly rule: string
  readonly correction: Correction
  readonly ref?: string
}

/** What one call's judgement came to: every rule that denies, in rule order, and the rules whose detector threw (fail-open). */
export interface Judgement {
  readonly denies: readonly RuleDeny[]
  readonly errors: readonly string[]
}

/** Judge one call against every rule: all denials are kept, not only the first. `face` names tools in corrections (default: native names). */
export function judge(rules: readonly GuardRule[], call: ToolCall, face: ToolFace = NATIVE_FACE): Judgement {
  const denies: RuleDeny[] = []
  const errors: string[] = []
  for (const rule of rules) {
    try {
      const verdict = rule.detect(call, face)
      if (verdict.kind === 'deny') denies.push({ rule: verdict.rule, correction: verdict.correction, ...(verdict.ref === undefined ? {} : { ref: verdict.ref }) })
    } catch {
      errors.push(rule.id)
    }
  }
  return { denies, errors }
}

/** Render a four-part correction as the model-facing denial text. */
export function renderCorrection(correction: Correction): string {
  return [correction.fact, `Boundary: ${correction.violation}`, `Right path: ${correction.rightPath}`, `Exception: ${correction.exception}`].join('\n')
}
