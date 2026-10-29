/**
 * dsh-guard — rule framework (S1 subset): each discipline is data
 * { declare, detect, correct, apply }, enforced hard at the execution
 * boundary with a four-part corrective message (fact / violation / right
 * path / exception). No soft-allow tier: a denied action never executes.
 */
import { resolve } from 'node:path'
import type { JsonValue } from '../shared/json.ts'
import { describeWrite, shellWrites, type ShellDialect } from './shell.ts'

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
  | { readonly kind: 'deny', readonly rule: string, readonly correction: Correction }

/** DSH native tool name → the name the model sees for it on the route of this call or assembly. */
export type ToolFace = (native: string) => string

/** The names where no dialect claims the route: the natives' own. */
export const NATIVE_FACE: ToolFace = native => native

export interface GuardRule {
  readonly id: string
  /** The rule as the model is told it: one line of the guard section in every route's system prompt (src/guard/index.ts); the function form names tools through the face. */
  readonly declare: string | ((face: ToolFace) => string)
  /**
   * Decide for one tool call. `call.name` is already the DSH native the
   * call runs (src/shared/dialect.ts toNativeTool); tool names in the
   * correction come from `face`. Throwing counts as allow (fail-open).
   */
  detect(call: ToolCall, face: ToolFace): RuleVerdict
}

/** A rule's declaration line: a string as it is, the function form rendered with `face`. */
export function declarationOf(rule: GuardRule, face: ToolFace): string {
  return typeof rule.declare === 'string' ? rule.declare : rule.declare(face)
}

const APPLICATION_PROTOCOL
  = 'To operate outside the workspace, file a request stating: target path or command, purpose, reversibility and blast-radius self-check, and alternatives you considered. A human approves each request individually; no grant outlives the call it approved.'

/** Normalize a path for containment checks and path comparison (case-insensitive Windows file systems). */
export function normalizePath(path: string): string {
  return path.replaceAll('/', '\\').replaceAll('\\\\', '\\').toLowerCase().replaceAll('\\', '/')
}

/**
 * Rule 1: writes stay inside the workspace roots. A relative target resolves
 * against `base` (the session's working directory; default the first root),
 * as the rc.3 file tools resolve it (dsh-fs-local `localDisplayPath`:
 * `resolve(cwd, path)` on win32); resolving also folds `..` segments, so a
 * target cannot climb out of a root by spelling.
 */
export function workspaceContainment(roots: readonly string[], base: string | undefined = roots[0]): GuardRule {
  const normalizedRoots = roots.map(root => normalizePath(resolve(root)).replace(/\/+$/, ''))
  const inside = (absolute: string): boolean => {
    const p = normalizePath(absolute)
    return normalizedRoots.some(root => p === root || p.startsWith(`${root}/`))
  }
  return {
    id: 'workspace-containment',
    declare: 'You may only create and modify files inside the user\'s workspace. Writes anywhere else are rejected.',
    detect(call) {
      if (call.name !== 'write' && call.name !== 'edit') return { kind: 'allow' }
      const target = typeof call.arguments === 'object' && call.arguments !== null && !Array.isArray(call.arguments)
        ? (call.arguments as Record<string, JsonValue>).file_path
        : undefined
      if (typeof target !== 'string') return { kind: 'allow' }
      const absolute = base === undefined ? resolve(target) : resolve(base, target)
      if (inside(absolute)) return { kind: 'allow' }
      return {
        kind: 'deny',
        rule: 'workspace-containment',
        correction: {
          fact: normalizePath(absolute) === normalizePath(target) ? `You tried to write "${target}".` : `You tried to write "${target}" (resolves to "${absolute}").`,
          violation: 'That path is outside the workspace; writes are confined to the workspace.',
          rightPath: 'Recreate this change under the workspace root (project files in place, agent-private artifacts under .llm/).',
          exception: APPLICATION_PROTOCOL,
        },
      }
    },
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
  detect(call, face) {
    const shell = shellCommandOf(call)
    const write = shell?.dialects.flatMap(dialect => shellWrites(shell.command, dialect))[0]
    if (shell === undefined || write === undefined) return { kind: 'allow' }
    return {
      kind: 'deny',
      rule: 'file-tools-only',
      correction: {
        fact: `You tried to modify files through the shell: "${shell.command}" (${describeWrite(write)}).`,
        violation: 'Shell file writes are not permitted; file changes go through the dedicated tools.',
        rightPath: `Read the target with ${face('read')}, then apply the change with ${face('write')} or ${face('edit')}.`,
        exception: 'If a task genuinely requires shell-side file generation (e.g. a build tool), follow the application protocol. ' + APPLICATION_PROTOCOL,
      },
    }
  },
}

/** Compose rules: first deny wins; a throwing detector fails open. `face` names tools in corrections (default: native names). */
export function evaluate(rules: readonly GuardRule[], call: ToolCall, face: ToolFace = NATIVE_FACE): RuleVerdict {
  for (const rule of rules) {
    try {
      const verdict = rule.detect(call, face)
      if (verdict.kind === 'deny') return verdict
    } catch {
      // fail-open: a broken detector must not break the session
    }
  }
  return { kind: 'allow' }
}
/** Render a four-part correction as the model-facing denial text. */
export function renderCorrection(correction: Correction): string {
  return [correction.fact, `Boundary: ${correction.violation}`, `Right path: ${correction.rightPath}`, `Exception: ${correction.exception}`].join('\n')
}
