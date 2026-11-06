/**
 * The command line of a script or a check as the person reads it, the
 * timeout a work script gets when its entry names none, and the most of a
 * script that is read (loop board design 0.6 §6.6). Pure, with no Node
 * built-in, so the executor (script.ts), the view (view.ts) and the panel's
 * page write the same line and the same numbers; script.ts re-exports the
 * first two for the callers it already had.
 */
import type { ScriptLang, ScriptRef } from './trigger.ts'

/** The timeout a work script gets when its entry names none (design §6.6). */
export const WORK_TIMEOUT_MS = 60_000
/** A script longer than this is not read at all: the executor refuses it (`too-large`), the page does not show it (design §6.6, rules design 0.10 §9.1). */
export const SCRIPT_MAX_BYTES = 65_536

/** The interpreter of each language, without a shell (design §6.6). */
export const INTERPRETERS: Readonly<Record<ScriptLang, { readonly program: string, readonly before: readonly string[] }>> = {
  pwsh: { program: 'pwsh', before: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass'] },
  node: { program: 'node', before: [] },
  python: { program: 'python', before: [] },
  bash: { program: 'bash', before: [] },
}

/** One item of a command line, quoted by the Windows rules: quotes around whitespace, doubled backslashes before a quote and at the end. */
function quoted(item: string): string {
  if (item.length > 0 && !/[\s"]/.test(item)) return item
  return `"${item.replace(/(\\*)(")/g, (_, back: string) => `${back}${back}\\"`).replace(/\\+$/, found => `${found}${found}`)}"`
}

/**
 * The command line a person reads (design §6.6): the interpreter's line for a
 * script — with the path in the repository, not the private copy — or the
 * argument vector of a check. The log's first line and the rules board's
 * `checkCall` command both take it; it goes to no shell.
 */
export function commandText(target: ScriptRef | readonly string[]): string {
  if (!('lang' in target)) return target.map(quoted).join(' ')
  const spec = INTERPRETERS[target.lang]
  return [spec.program, ...spec.before, target.file].map(quoted).join(' ')
}
