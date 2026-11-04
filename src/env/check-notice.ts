/**
 * The words of the checks notice (M4 design §6.5, §6.6, §6.3.1 「优雅失败」):
 * what the agent that changed files reads before its next step, and the
 * words of the runs the loop board lists. Pure: the runner (runner.ts)
 * decides what ran and hands the results here.
 *
 *   Checks after your edits: eslint 2 findings, tsc 0.
 *   src/a.ts:41:7 eslint no-unused-vars 'x' is assigned a value but never used. [changed]
 *   Full output: .llm/env-checks/541bab35/20261029T125501-tool-3-eslint.log
 *   Fix the findings on changed lines before you finish; new warnings fail the merge gate.
 *
 * At most 5 findings, those on changed lines first; each line at most 200
 * characters, the results part at most 1200. A check that did not run, did
 * not finish, waits for a slot or was dropped from the queue has a line of
 * its own; the lines about languages no check covers come last.
 */
import { extname } from 'node:path'
import { CHECK_LINE_EXAMPLE, parseCheckLine } from './check-entry.ts'
import type { Finding } from './parsers.ts'
import { CHECK_TIMEOUT_CAP_MS, CHECK_TIMEOUT_FACTOR, secondsText, type CheckTimeout } from './timeout.ts'

/** Source kind of the checks notice; its `source.checks` holds `lastCall` (the last tool call it covered) and `counts` (findings by check key). */
export const CHECKS_NOTICE_SOURCE = 'hourness-checks'

/** The line for a session whose project has no loop board: the checks are not run (design §6.1.2, §6.6), once per session. */
export const NO_BOARD_CHECKS_LINE = 'No checks run in this project: the loop board is not enabled.'

const FINDINGS_SHOWN = 5
const LINE_LIMIT = 200
const RESULTS_LIMIT = 1200

/** One finding with the file as the notice names it and whether it sits on a changed line. */
export interface MarkedFinding extends Finding {
  readonly changed: boolean
}

/** What one check gave for one delivery. `log` is the log path as the agent reads it; absent, the run had no project directory to write one. */
export type CheckResult =
  | { readonly kind: 'findings', readonly name: string, readonly key: string, readonly findings: readonly MarkedFinding[], readonly log?: string }
  | { readonly kind: 'failed', readonly name: string, readonly key: string, readonly reason: string, readonly log?: string }
  | { readonly kind: 'timeout', readonly name: string, readonly key: string, readonly elapsedMs: number, readonly limitMs: number, readonly basis: string, readonly nextLimitMs: number, readonly log?: string }
  | { readonly kind: 'dropped', readonly name: string, readonly key: string, readonly waitedMs: number, readonly running: number }
  | { readonly kind: 'skipped', readonly name: string, readonly key: string, readonly failures: number, readonly log?: string }

const NUMBER_WORDS: Readonly<Record<number, string>> = { 2: 'two', 3: 'three', 4: 'four', 5: 'five' }
const times = (factor: number): string => `${NUMBER_WORDS[factor] ?? String(factor)} times`

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

const cut = (text: string, limit = LINE_LIMIT): string => text.length <= limit ? text : `${text.slice(0, limit - 1)}…`

const logText = (log: string | undefined): string => log === undefined ? 'no log: no project directory' : `log ${log}`

/**
 * How a limit came about, for the timeout sentence: the estimate or the
 * slowest recent run times the factor, raised to the floor or held at the
 * ceiling, or the ceiling for a line without an estimate. Pure.
 */
export function limitBasis(timeout: CheckTimeout, estimateS: number | undefined, recentMs: readonly number[]): string {
  if (timeout.basis === 'ceiling') return 'its ceiling: the check line has no estimate'
  const from = timeout.basis === 'runs' ? `its slowest recent run of ${secondsText(Math.max(...recentMs))} s` : `its estimate of ${String(estimateS)} s`
  if (timeout.capped !== undefined) return `its ceiling: ${times(CHECK_TIMEOUT_FACTOR)} ${from} would be ${secondsText(timeout.capped.wantedMs)} s`
  const wanted = CHECK_TIMEOUT_FACTOR * (timeout.basis === 'runs' ? Math.max(...recentMs) : (estimateS ?? 0) * 1000)
  if (wanted < timeout.limitMs) return `the floor: ${times(CHECK_TIMEOUT_FACTOR)} ${from} is less`
  return `${times(CHECK_TIMEOUT_FACTOR)} ${from}`
}

/** The sentence of a check stopped at its limit (design §6.3.1): name, limit, time taken, log, and what happens next. */
export function timeoutSentence(result: Extract<CheckResult, { kind: 'timeout' }>): string {
  const next = result.nextLimitMs >= CHECK_TIMEOUT_CAP_MS
    ? `It is at its ceiling of ${secondsText(CHECK_TIMEOUT_CAP_MS)} s; the main agent has been told.`
    : `It runs again after your next edit, with a limit of ${secondsText(result.nextLimitMs)} s.`
  return `${result.name} did not finish: stopped after ${(result.elapsedMs / 1000).toFixed(1)} s (limit ${secondsText(result.limitMs)} s, ${result.basis}; ${logText(result.log)}). ${next}`
}

/** The line of a check that waits for a process slot (design §6.3 rule 2): not a failure, its result comes later. */
export function queuedSentence(name: string, running: number): string {
  return `${name} has not started: it is queued behind ${plural(running, 'running check')}. Its result arrives in a later step.`
}

/** The line of every result but findings. */
function resultSentence(result: Exclude<CheckResult, { kind: 'findings' }>): string {
  if (result.kind === 'timeout') return timeoutSentence(result)
  if (result.kind === 'dropped') return `${result.name} did not run: it waited ${Math.round(result.waitedMs / 1000)} s behind ${plural(result.running, 'running check')} and was dropped. It runs again after your next edit.`
  if (result.kind === 'skipped') return `${result.name} skipped for this session after ${result.failures} failures (${logText(result.log)})`
  return `${result.name} did not run: ${result.reason.split(/\r?\n/)[0] ?? ''} (${logText(result.log)})`
}

/** One finding as one line: `file:line[:column] <check> [rule] message [changed]`, at most 200 characters. */
function findingLine(name: string, finding: MarkedFinding): string {
  const place = `${finding.file}:${finding.line}${finding.column === undefined ? '' : `:${finding.column}`}`
  const mark = finding.changed ? '[changed]' : '[elsewhere in file]'
  const text = `${place} ${name} ${finding.rule === undefined || finding.rule === '' ? '' : `${finding.rule} `}${finding.message}`.replace(/\s+/g, ' ').trim()
  return text.length + mark.length + 1 <= LINE_LIMIT ? `${text} ${mark}` : `${text.slice(0, LINE_LIMIT - mark.length - 2)}… ${mark}`
}

/**
 * The body of one checks notice: the results part (at most 1200
 * characters: finding lines go first when it does not fit), then `tail`
 * (the lines about languages no check covers), which the cap leaves alone.
 * `notes` are the lines about files a run left out. Pure.
 */
export function checkNoticeBody(results: readonly CheckResult[], queued: readonly string[], notes: readonly string[], tail: readonly string[]): string {
  const counted = results.filter((result): result is Extract<CheckResult, { kind: 'findings' }> => result.kind === 'findings')
  const findings = counted.flatMap(result => result.findings.map(finding => ({ name: result.name, finding })))
    .sort((a, b) => Number(b.finding.changed) - Number(a.finding.changed) || a.finding.file.localeCompare(b.finding.file) || a.finding.line - b.finding.line)
  const head = counted.length === 0 ? [] : [`Checks after your edits: ${counted.map(result => result.findings.length === 0 ? `${result.name} 0` : `${result.name} ${plural(result.findings.length, 'finding')}`).join(', ')}.`]
  const found = counted.filter(result => result.findings.length > 0)
  const logs = found.map(result => cut(found.length === 1 ? `Full output: ${result.log ?? 'no log (no project directory)'}` : `Full output of ${result.name}: ${result.log ?? 'no log (no project directory)'}`))
  const fix = findings.length > 0 ? ['Fix the findings on changed lines before you finish; new warnings fail the merge gate.'] : []
  const others = [
    ...results.filter((result): result is Exclude<CheckResult, { kind: 'findings' }> => result.kind !== 'findings').map(result => cut(resultSentence(result), 400)),
    ...queued.map(line => cut(line)),
    ...notes.map(line => cut(line)),
  ]
  let shown = Math.min(FINDINGS_SHOWN, findings.length)
  const part = (): string[] => [...head, ...findings.slice(0, shown).map(({ name, finding }) => findingLine(name, finding)), ...logs, ...fix, ...others]
  while (shown > 0 && part().join('\n').length > RESULTS_LIMIT) shown--
  let lines = part()
  while (lines.length > 1 && lines.join('\n').length > RESULTS_LIMIT) lines = lines.slice(0, -1)
  return [...lines, ...tail].join('\n')
}

/** What the community uses for one language (docs/ORCHESTRATION.md §7.5's table), by file extension. */
const LANGUAGES: Readonly<Record<string, { readonly language: string, readonly checker: string }>> = {
  '.py': { language: 'Python', checker: 'ruff' },
  '.go': { language: 'Go', checker: 'go vet' },
  '.rs': { language: 'Rust', checker: 'clippy with --message-format short' },
  '.sh': { language: 'Shell', checker: 'shellcheck with -f gcc' },
  '.c': { language: 'C', checker: 'clang-tidy' },
  '.h': { language: 'C', checker: 'clang-tidy' },
  '.cpp': { language: 'C++', checker: 'clang-tidy' },
  '.cc': { language: 'C++', checker: 'clang-tidy' },
  '.hpp': { language: 'C++', checker: 'clang-tidy' },
  '.ts': { language: 'TypeScript', checker: 'tsc and ESLint' },
  '.tsx': { language: 'TypeScript', checker: 'tsc and ESLint' },
  '.mts': { language: 'TypeScript', checker: 'tsc and ESLint' },
  '.cts': { language: 'TypeScript', checker: 'tsc and ESLint' },
  '.js': { language: 'JavaScript', checker: 'ESLint' },
  '.jsx': { language: 'JavaScript', checker: 'ESLint' },
  '.mjs': { language: 'JavaScript', checker: 'ESLint' },
  '.cjs': { language: 'JavaScript', checker: 'ESLint' },
}

/** The extension of a file of a language the table knows (lower case, with the dot), or undefined: other files ask for no check. */
export function languageOf(file: string): string | undefined {
  const extension = extname(file).toLowerCase()
  return Object.hasOwn(LANGUAGES, extension) ? extension : undefined
}

const EXAMPLE_ESTIMATE = parseCheckLine(CHECK_LINE_EXAMPLE)?.estimateSeconds

const joinOr = (items: readonly string[]): string => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items.at(-1) ?? ''}`

/**
 * The line about edited languages no check covers (design §6.6): for the
 * main agent how to propose a tool node with a check line, with the example
 * line and the community default of each language; for a subagent to pass
 * it on. One line for all the extensions of one step. Pure.
 */
export function missingCheckLine(extensions: readonly string[], subagent: boolean): string {
  const which = `No check covers ${joinOr(extensions)} files in this project`
  if (subagent) return `${which}; mention it in your final result so the main agent can propose one.`
  const languages = new Map<string, string>()
  for (const extension of extensions) {
    const known = LANGUAGES[extension]
    if (known !== undefined && !languages.has(known.language)) languages.set(known.language, known.checker)
  }
  const defaults = [...languages].map(([language, checker], index) => index === 0 ? `The community default for ${language} is ${checker}` : `for ${language}, ${checker}`)
  return [
    `${which}. Propose a tool node under the env branch with graph_propose and put the check line in its acceptance conditions, for example: ${CHECK_LINE_EXAMPLE}.`,
    `The ${String(EXAMPLE_ESTIMATE)}s is your estimate of one run; the time limit is ${NUMBER_WORDS[CHECK_TIMEOUT_FACTOR] ?? String(CHECK_TIMEOUT_FACTOR)} times it, and the human sees that limit and the estimate it came from next to the command when approving the node (graph_propose returns the sentence: put it in your plan).`,
    'After real runs the harness sets the limit from the measured times.',
    ...(defaults.length === 0 ? [] : [`${defaults.join('; ')}.`]),
    'The check runs after your edits once the human approves the node.',
    'If you want a check to run another way (on a different trigger, with its result sent to the main agent), propose a loop board entry that points at the line with loop_propose.',
  ].join(' ')
}
