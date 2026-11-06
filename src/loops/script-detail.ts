/**
 * The original text of a script as the human reads it before agreeing to it
 * (loop board design 0.6 §6.6, §7.1; rules board design 0.11 §9.3): one
 * paragraph saying what the code block is, the script in a fenced block that
 * shows every character of it, and one paragraph of cautions. The two boards
 * build the text of a script proposal with this one function, so the human
 * sees the same shape from either; M3's `propose_to_human` puts it after the
 * question and `record_human_answer` checks the main agent showed it whole
 * (`mustShow`). Pure, with no Node built-in, so it sits beside the executor
 * and not in it: the executor (script.ts) is the one file that starts a process.
 */
import { findSecret } from '../data/secret-shape.ts'
import type { ScriptLang } from './trigger.ts'

/** The longest script a person is asked to read, in code points. */
const SCRIPT_MAX_CODE_POINTS = 4000
/** The longest script a person is asked to read, in lines. */
const SCRIPT_MAX_LINES = 100

/** The text a proposal puts in front of the human: shown whole, then the pieces the main agent must have shown. */
export interface ScriptDetail {
  readonly markdown: string
  readonly mustShow: readonly string[]
}

/** The info string of the code fence for each language. */
const FENCE_INFO: Readonly<Record<ScriptLang, string>> = { pwsh: 'powershell', node: 'js', python: 'python', bash: 'bash' }

/** Why a script is not one a person is asked to read, or undefined: empty, longer than the human reads, or a text that looks like a secret. */
export function scriptTextProblem(text: unknown): string | undefined {
  if (typeof text !== 'string' || text.trim().length === 0) return 'the script text must be a non-empty string'
  if ([...text].length > SCRIPT_MAX_CODE_POINTS || text.split('\n').length > SCRIPT_MAX_LINES) {
    return `the script is too long for the human to read in the chat (more than ${SCRIPT_MAX_CODE_POINTS} characters or ${SCRIPT_MAX_LINES} lines): split it into several entries, or put the detail in a file of the project and let this one call it`
  }
  const found = findSecret(text)
  return found === undefined ? undefined : `the script contains something that looks like a secret: ${found.message}`
}

/** A fence of backticks one longer than the longest run in the text, at least three: backticks in the script show as they are (CommonMark). */
function fenceOf(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map(run => run.length))
  return '`'.repeat(Math.max(3, longest + 1))
}

/**
 * The detail of a script proposal. `cautions` are whole sentences, written by
 * the board that proposes; the human must see each of them as well as the
 * script. The caller has checked the text with `scriptTextProblem`.
 */
export function scriptDetail(input: { readonly lang: ScriptLang, readonly text: string, readonly cautions: readonly string[] }): ScriptDetail {
  const fence = fenceOf(input.text)
  const markdown = [
    `脚本原文（${input.lang}，在项目目录里跑，每次照这样跑）：`,
    `${fence}${FENCE_INFO[input.lang]}\n${input.text}\n${fence}`,
    `注意：${input.cautions.join('；')}`,
  ].join('\n')
  return { markdown, mustShow: [input.text, ...input.cautions] }
}
