/**
 * dsh-guard — rule framework (S1 subset): each discipline is data
 * { declare, detect, correct, apply }, enforced hard at the execution
 * boundary with a four-part corrective message (fact / violation / right
 * path / exception). No soft-allow tier: a denied action never executes.
 */
import type { JsonValue } from '../glm-prompt/json.ts'

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

export interface GuardRule {
  readonly id: string
  /** Verbatim declaration injected into the dialect's guard notice section. */
  readonly declare: string
  /** Decide for one tool call; throwing counts as allow (fail-open). */
  detect(call: ToolCall): RuleVerdict
}

const APPLICATION_PROTOCOL
  = 'To operate outside the workspace, file a request stating: target path or command, purpose, reversibility and blast-radius self-check, and alternatives you considered. A human approves each request individually; no grant outlives the call it approved.'

/** Normalize a path for containment checks (case-insensitive Windows file systems). */
function normalizePath(path: string): string {
  return path.replaceAll('/', '\\').replaceAll('\\\\', '\\').toLowerCase().replaceAll('\\', '/')
}

/** Rule 1: writes stay inside the workspace roots. */
export function workspaceContainment(roots: readonly string[]): GuardRule {
  const normalizedRoots = roots.map(normalizePath)
  const inside = (target: string): boolean => {
    const p = normalizePath(target)
    return normalizedRoots.some(root => p === root || p.startsWith(`${root}/`))
  }
  return {
    id: 'workspace-containment',
    declare: 'You may only create and modify files inside the user\'s workspace. Writes anywhere else are rejected.',
    detect(call) {
      if (call.name !== 'Write' && call.name !== 'Edit' && call.name !== 'write' && call.name !== 'edit') {
        return { kind: 'allow' }
      }
      const target = typeof call.arguments === 'object' && call.arguments !== null && !Array.isArray(call.arguments)
        ? (call.arguments as Record<string, JsonValue>).file_path
        : undefined
      if (typeof target !== 'string' || inside(target)) return { kind: 'allow' }
      return {
        kind: 'deny',
        rule: 'workspace-containment',
        correction: {
          fact: `You tried to write "${target}".`,
          violation: 'That path is outside the workspace; writes are confined to the workspace.',
          rightPath: 'Recreate this change under the workspace root (project files in place, agent-private artifacts under .llm/).',
          exception: APPLICATION_PROTOCOL,
        },
      }
    },
  }
}

/**
 * Rule 2: file modification goes through the dedicated tools. Shell commands
 * that rewrite files are denied even inside the workspace — a successful
 * shell write would reinforce the habit this rule exists to break.
 */
const SHELL_WRITE_PATTERNS: readonly RegExp[] = [
  // POSIX write-shaped commands (rename/copy/delete/truncate/create)
  /\b(mv|cp|rm|rmdir|dd|touch|truncate)\b/i,
  /\bsed\s+(-\S+\s+)*-i\b/i,
  // PowerShell write-shaped cmdlets
  /\bset-content\b/i,
  /\badd-content\b/i,
  /\bclear-content\b/i,
  /\bout-file\b/i,
  /\btee\b/i,
  /\bmove-item\b/i,
  /\bcopy-item\b/i,
  /\bremove-item\b/i,
  /\bnew-item\b/i,
  // Redirection into a file (single or appending). The lookbehind keeps
  // stderr/stdout stream numbers (2>, 2>&1) out — those are not file writes.
  /(?<![\w$])>{1,2}\s*\S/,
]

export const fileToolsOnly: GuardRule = {
  id: 'file-tools-only',
  declare: 'Modify files and code only with the dedicated Write/Edit tools. The shell is for execution (tests, builds, git), not for writing files.',
  detect(call) {
    // `terminal_send` carries raw shell text too: the same write-shaped
    // command patterns apply wherever a shell executes.
    if (call.name !== 'Bash' && call.name !== 'bash' && call.name !== 'pwsh' && call.name !== 'terminal_send') return { kind: 'allow' }
    const command = typeof call.arguments === 'object' && call.arguments !== null && !Array.isArray(call.arguments)
      ? (call.arguments as Record<string, JsonValue>).command
      : undefined
    if (typeof command !== 'string' || !SHELL_WRITE_PATTERNS.some(pattern => pattern.test(command))) {
      return { kind: 'allow' }
    }
    return {
      kind: 'deny',
      rule: 'file-tools-only',
      correction: {
        fact: `You tried to modify files through the shell: "${command}".`,
        violation: 'Shell file writes are not permitted; file changes go through the dedicated tools.',
        rightPath: 'Read the target with Read, then apply the change with Write or Edit.',
        exception: 'If a task genuinely requires shell-side file generation (e.g. a build tool), follow the application protocol. ' + APPLICATION_PROTOCOL,
      },
    }
  },
}

/** Compose rules: first deny wins; a throwing detector fails open. */
export function evaluate(rules: readonly GuardRule[], call: ToolCall): RuleVerdict {
  for (const rule of rules) {
    try {
      const verdict = rule.detect(call)
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
