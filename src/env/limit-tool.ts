/**
 * The main agent's ceiling for one check (M4 design §6.3.1 「调高上限」,
 * decision d-timeout-measured): when three times a check's run time is over
 * its ceiling the harness keeps the ceiling and tells the main agent alone
 * (the environment notice's held-at-its-ceiling line, `heldAtCeiling` and
 * `heldSentence`); raising that ceiling is the main agent's decision and
 * needs no approval from the human, so the tool `check_limit` sets it, and
 * `reset` takes it back. Making the check cheaper or narrower changes its
 * check line, a tool-node change the human approves; the line says so.
 *
 * The setting is `<project directory>/env-checks/limits.jsonl` (append-only,
 * not in git): one line per raise or reset, and a check's setting is its
 * last line there (a reset, or no line, is the default ceiling). Bad lines
 * are skipped and counted; a file that cannot be read is no setting. The
 * runner takes the setting as the check's ceiling (timeout.ts `nextValue`),
 * and the loop board's details and the morning report say a raised ceiling
 * from this file, never from a value line's `cap`. A raise needs the check
 * held at the ceiling in force: its latest value line was held there, or it
 * was stopped there within the last seven days, both counted after its last
 * line in this file, so a raise or a reset must be earned again.
 */
import { readFileSync } from 'node:fs'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { PLAIN_WORDS, plainWordsIn } from '../graph/plain-question.ts'
import type { AgentLike } from '../shared/dsh-min.ts'
import { times } from './check-notice.ts'
import {
  CHECK_TIMEOUT_CAP_MS, CHECK_TIMEOUT_FACTOR, CHECK_TIMEOUT_RAISED_MAX_MS, capMsOf, checkTimeout, readTiming, recentRuns, secondsText,
  type CapSetting, type TimingBook, type TimingLine,
} from './timeout.ts'

/** A check stopped at its ceiling this recently may still be raised. */
export const CHECK_LIMIT_HELD_MS = 7 * 24 * 3600 * 1000
/** The reason is at most this many characters. */
const REASON_LIMIT = 300

/** One line of limits.jsonl. A reset's `capS` is the default ceiling and its reason may be empty. */
export interface LimitLine {
  readonly at: string
  readonly check: string
  readonly action: 'raise' | 'reset'
  readonly capS: number
  readonly previousCapS: number
  readonly reason: string
  readonly session?: string
}

/** The readable lines of limits.jsonl in order, and how many were not. */
export interface LimitBook {
  readonly lines: readonly LimitLine[]
  readonly bad: number
}

const EMPTY: LimitBook = { lines: [], bad: 0 }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function isLimitLine(value: unknown): value is LimitLine {
  return isRecord(value) && typeof value.at === 'string' && typeof value.check === 'string' && (value.action === 'raise' || value.action === 'reset')
    && typeof value.capS === 'number' && Number.isFinite(value.capS) && typeof value.previousCapS === 'number' && typeof value.reason === 'string'
}

/** The lines of a limits.jsonl text; a line that is not JSON or not a limit line is counted and skipped. Pure. */
export function parseLimits(text: string): LimitBook {
  const lines: LimitLine[] = []
  let bad = 0
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue
    try {
      const line: unknown = JSON.parse(raw)
      if (isLimitLine(line)) lines.push(line)
      else bad++
    }
    catch {
      bad++
    }
  }
  return { lines, bad }
}

/** The limits file of a project directory, beside the timing journal. */
export function limitsFile(home: string): string {
  return join(home, 'env-checks', 'limits.jsonl')
}

const codeOf = (error: unknown): string => (error as NodeJS.ErrnoException).code ?? (error instanceof Error ? error.message : String(error))

/** Read a project's limits.jsonl: no file is no setting; any other failure is its error code (the caller then goes on with no setting). */
export async function readLimits(home: string): Promise<LimitBook | { readonly error: string }> {
  try {
    return parseLimits(await readFile(limitsFile(home), 'utf8'))
  }
  catch (error) {
    return codeOf(error) === 'ENOENT' ? EMPTY : { error: codeOf(error) }
  }
}

/** The same read, synchronous, for the loop board's details; a failure is no setting. */
export function readLimitsSync(home: string): LimitBook {
  try {
    return parseLimits(readFileSync(limitsFile(home), 'utf8'))
  }
  catch {
    return EMPTY
  }
}

/** Append one line to `<home>/env-checks/limits.jsonl`, creating the directory. Rejects on a write failure. */
async function appendLimit(home: string, line: LimitLine): Promise<void> {
  const file = limitsFile(home)
  await mkdir(dirname(file), { recursive: true })
  await appendFile(file, `${JSON.stringify(line)}\n`, 'utf8')
}

/** The last item of `list` that `test` holds for. */
function lastOf<T>(list: readonly T[], test: (item: T) => boolean): T | undefined {
  for (let index = list.length - 1; index >= 0; index--) if (test(list[index])) return list[index]
  return undefined
}

/** The last line of one check, whatever its action. */
function lastLimitLine(book: LimitBook, check: string): LimitLine | undefined {
  return lastOf(book.lines, line => line.check === check)
}

/** The setting of one check: its last line when that line is a raise, else none (the default ceiling). */
export function limitSetting(book: LimitBook, check: string): CapSetting | undefined {
  const last = lastLimitLine(book, check)
  return last?.action === 'raise' ? { capS: last.capS, at: last.at, reason: last.reason } : undefined
}

/** The journal lines of one check written after its last line in limits.jsonl (all of them without one). */
function sinceSetting(timing: readonly TimingLine[], limits: LimitBook, check: string): readonly TimingLine[] {
  const last = lastLimitLine(limits, check)
  const from = last === undefined ? undefined : Date.parse(last.at)
  return timing.filter(line => line.check === check && (from === undefined || Number.isNaN(from) || Date.parse(line.at) > from))
}

/** The latest stop at the ceiling in force within the last seven days, among `lines`. */
function stopAtCeiling(lines: readonly TimingLine[], capMs: number, nowMs: number): TimingLine | undefined {
  return lastOf(lines, line => line.kind === 'timeout' && line.limitMs === capMs && nowMs - Date.parse(line.at) <= CHECK_LIMIT_HELD_MS && Date.parse(line.at) <= nowMs)
}

/** The latest value line among `lines`. */
function lastValue(lines: readonly TimingLine[]): Extract<TimingLine, { kind: 'value' }> | undefined {
  const found = lastOf(lines, line => line.kind === 'value')
  return found?.kind === 'value' ? found : undefined
}

/**
 * Whether check_limit may raise a check now (design §6.3.1 「检查顺序」 4):
 * after the check's last line in limits.jsonl, its latest value line was
 * held at the ceiling, or it was stopped at the ceiling in force within the
 * last seven days. Pure.
 */
export function heldForRaise(timing: readonly TimingLine[], limits: LimitBook, check: string, nowMs: number): boolean {
  const lines = sinceSetting(timing, limits, check)
  if (lastValue(lines)?.capped !== undefined) return true
  return stopAtCeiling(lines, capMsOf(limitSetting(limits, check)), nowMs) !== undefined
}

/** A check held at its ceiling, as the main agent's environment notice says it. */
interface HeldCheck {
  readonly key: string
  readonly name: string
  readonly capMs: number
  readonly wantedMs: number
  /** What three times was taken of: the line's estimate, or the slowest recent run. */
  readonly from: { readonly by: 'estimate', readonly s: number } | { readonly by: 'runs', readonly ms: number }
}

/**
 * Whether one check is held at its ceiling now (design §6.3.1 item 6), for
 * the main agent's environment notice: after its last line in limits.jsonl,
 * its latest value line was held at the ceiling, or a stop at the ceiling in
 * force within seven days is not older than that value line. The words come
 * from the limit the journal gives the next run when that is still held,
 * else from the held value line. Pure.
 */
export function heldAtCeiling(timing: readonly TimingLine[], limits: LimitBook, check: { readonly key: string, readonly name: string, readonly argv: string, readonly estimateS?: number | undefined }, nowMs: number): HeldCheck | undefined {
  const lines = sinceSetting(timing, limits, check.key)
  const capMs = capMsOf(limitSetting(limits, check.key))
  const value = lastValue(lines)
  const stop = stopAtCeiling(lines, capMs, nowMs)
  const stopped = stop !== undefined && (value === undefined || Date.parse(stop.at) >= Date.parse(value.at))
  if (!stopped && value?.capped === undefined) return undefined
  const recent = recentRuns({ lines: timing, bad: 0 }, check.key, check.argv)
  const next = checkTimeout({ estimateS: check.estimateS, recentMs: recent, capMs })
  if (next.capped !== undefined) {
    const from = next.basis === 'runs' ? { by: 'runs' as const, ms: Math.max(...recent) } : { by: 'estimate' as const, s: check.estimateS ?? 0 }
    return { key: check.key, name: check.name, capMs, wantedMs: next.capped.wantedMs, from }
  }
  if (value?.capped === undefined) return undefined
  const source = value.source
  if (source.by === 'ceiling') return undefined
  const from = source.by === 'harness' ? { by: 'runs' as const, ms: Math.max(...source.runs) } : { by: 'estimate' as const, s: source.estimateS }
  return { key: check.key, name: check.name, capMs: value.limitMs, wantedMs: value.capped.wantedMs, from }
}

/** The lowest seconds a raise may set over a ceiling. */
const lowestRaise = (capMs: number): number => Math.max(capMs, CHECK_TIMEOUT_CAP_MS) / 1000 + 1

/**
 * The environment notice's line for a check held at its ceiling (design
 * §6.3.1 item 6, word for word): raising the ceiling is the main agent's own
 * decision with check_limit and the full key; narrowing the check is a
 * change of its check line, which the human approves. Pure.
 */
export function heldSentence(held: HeldCheck): string {
  const base = held.from.by === 'estimate' ? `your estimate (${held.from.s} s)` : `its slowest recent run (${secondsText(held.from.ms)} s)`
  return [
    `Check ${held.name} is held at its ceiling of ${secondsText(held.capMs)} s: ${times(CHECK_TIMEOUT_FACTOR)} ${base} would be ${secondsText(held.wantedMs)} s.`,
    `Raising this check's ceiling is your decision and needs no approval from the human: call check_limit with check ${JSON.stringify(held.key)}, seconds (${lowestRaise(held.capMs)} to ${CHECK_TIMEOUT_RAISED_MAX_MS / 1000}) and a reason.`,
    'Making the check cheaper or narrower means changing its check line, which is a tool-node change and needs the human\'s approval as usual.',
  ].join(' ')
}

/** The example of the tool's description (d-agent-examples): an ESLint check, the reason in the human's words. */
export const CHECK_LIMIT_EXAMPLE = { check: 'tool-3/eslint', seconds: 120, reason: '整个项目跑带类型信息的规则，在这台机器上要 40 秒左右' } as const

const exampleText = `check_limit {${Object.entries(CHECK_LIMIT_EXAMPLE).map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(', ')}}`

/** The description the model reads for check_limit (design §6.3.1, word for word; the numbers and the example from the constants). */
export const CHECK_LIMIT_DESCRIPTION = `Raise or reset the time limit of one check that runs after your edits, when that check is held at its ceiling (the environment notice tells you when). Pass the check as <tool node id>/<check name>, the new limit in seconds (${lowestRaise(CHECK_TIMEOUT_CAP_MS)} to ${CHECK_TIMEOUT_RAISED_MAX_MS / 1000}) and why. The reason is shown to the human on the loop board and in the morning report, so write it in the human's language and in plain words. It works only on a check that is held at its current ceiling now, or was stopped at it within the last ${CHECK_LIMIT_HELD_MS / 86_400_000} days. A subagent cannot call it. To undo it, call it again with action "reset". Example: ${exampleText}`

/** The parameters of check_limit (design §6.3.1's table): no other field. */
export const CHECK_LIMIT_PARAMETERS = {
  type: 'object',
  properties: {
    check: { type: 'string', description: 'The check as <tool node id>/<check name>, as the environment notice writes it.' },
    seconds: { type: 'integer', description: `The new ceiling in seconds, ${lowestRaise(CHECK_TIMEOUT_CAP_MS)} to ${CHECK_TIMEOUT_RAISED_MAX_MS / 1000} and above the one in force now. Needed for raise.` },
    reason: { type: 'string', description: `Why this check needs longer, 1 to ${REASON_LIMIT} characters, in the human's language and plain words: the human reads it. Needed for raise.` },
    action: { type: 'string', enum: ['raise', 'reset'], description: 'raise (the default), or reset to the default ceiling.' },
  },
  required: ['check'],
  additionalProperties: false,
} as const

/** What check_limit returns on success. */
interface CheckLimitResult {
  readonly outcome: 'raised' | 'reset' | 'noop'
  readonly check: string
  readonly capS: number
  readonly previousCapS: number
  readonly message: string
}

export interface CheckLimitDeps {
  readonly agent: AgentLike | undefined
  /** The project directory of the caller's session; undefined without one. */
  readonly home: string | undefined
  /** The keys of the readable check lines with `when` of the approved tool nodes of the caller's project; undefined when its graph cannot be read. */
  readonly checks: () => Promise<readonly string[] | undefined>
  readonly now: () => Date
}

type LimitCode = 'forbidden' | 'invalid' | 'unknown_check' | 'not_held' | 'unavailable'

function refuse(code: LimitCode, message: string, hint: string): never {
  throw new Error(JSON.stringify({ code, message, hint }))
}

/** A reason the human can read, or the refusal: 1 to 300 characters, none of the plain-words list. */
function checkReason(reason: unknown): string {
  if (typeof reason !== 'string' || reason.trim() === '' || [...reason].length > REASON_LIMIT) {
    refuse('invalid', 'reason does not fit', `reason is 1 to ${REASON_LIMIT} characters: why this check needs longer, in the human's language`)
  }
  const words = plainWordsIn(reason)
  if (words.length > 0) {
    const instead = words.map(word => `say "${PLAIN_WORDS.find(entry => entry.avoid.includes(word))?.say ?? 'a plainer word'}" instead of "${word}"`)
    refuse('invalid', `reason uses words the human has not learned: ${words.join(', ')}`, instead.join('; '))
  }
  return reason
}

const s = (ms: number): number => ms / 1000

/**
 * The check_limit body (design §6.3.1 「检查顺序」): the caller is the root
 * agent; the arguments fit; the check is a readable approved check line of
 * the project; a raise needs the check held at its ceiling; the line goes
 * into limits.jsonl. A reset without a setting is a noop and writes
 * nothing. Refusals throw the `{code, message, hint}` JSON, as guard_lift.
 */
export async function checkLimit(args: unknown, deps: CheckLimitDeps): Promise<CheckLimitResult> {
  // 1. Only the root agent.
  if (deps.agent?.session?.header.origin === 'subagent') {
    refuse('forbidden', 'a subagent cannot change check limits', 'a subagent cannot change check limits: report to the main agent')
  }
  // 2. The arguments: the table's four fields, the seconds against the ceiling in force.
  const fields = isRecord(args) ? args : {}
  const extra = Object.keys(fields).find(key => !['check', 'seconds', 'reason', 'action'].includes(key))
  if (extra !== undefined) refuse('invalid', `check_limit has no field ${extra}`, 'pass check, and for a raise seconds and reason; action is "raise" (the default) or "reset"')
  const { check, seconds, reason, action } = fields
  if (typeof check !== 'string' || check.trim() === '') refuse('invalid', 'check is missing', 'pass the check as <tool node id>/<check name>, as the environment notice writes it')
  if (action !== undefined && action !== 'raise' && action !== 'reset') refuse('invalid', 'action does not fit', 'action is "raise" (the default) or "reset"')
  const raise = action !== 'reset'
  const read = deps.home === undefined ? EMPTY : await readLimits(deps.home)
  const limits = 'error' in read ? EMPTY : read
  const setting = limitSetting(limits, check)
  const capMs = capMsOf(setting)
  if (raise && (typeof seconds !== 'number' || !Number.isInteger(seconds) || seconds < lowestRaise(capMs) || seconds * 1000 > CHECK_TIMEOUT_RAISED_MAX_MS)) {
    refuse('invalid', 'seconds does not fit', `seconds is a whole number from ${lowestRaise(capMs)} to ${s(CHECK_TIMEOUT_RAISED_MAX_MS)}, above the ceiling in force now (${s(capMs)} s)`)
  }
  const said = raise || reason !== undefined ? checkReason(reason) : ''
  // 3. A readable approved check line of the project.
  const known = await deps.checks()
  if (known === undefined || !known.includes(check)) {
    refuse('unknown_check', `no approved check line ${check} runs after edits in this project`, known === undefined || known.length === 0 ? 'this project has no approved check line that runs after edits' : `the checks: ${known.join(', ')}`)
  }
  const now = deps.now()
  // 4. A raise needs the check held at the ceiling in force; a reset without a setting writes nothing.
  if (raise) {
    const timing = deps.home === undefined ? undefined : await readTiming(deps.home)
    const book: TimingBook = timing === undefined || 'error' in timing ? { lines: [], bad: 0 } : timing
    if (!heldForRaise(book.lines, limits, check, now.getTime())) {
      refuse('not_held', `check ${check} is not held at its ceiling of ${s(capMs)} s`, `raise a check only while the environment notice says it is held at its ceiling, or within ${CHECK_LIMIT_HELD_MS / 86_400_000} days after it was stopped there`)
    }
  }
  else if (setting === undefined) {
    return { outcome: 'noop', check, capS: s(capMs), previousCapS: s(capMs), message: `Check ${check} has no raised ceiling; nothing was written.` }
  }
  // 5. The line into limits.jsonl.
  const capS = raise ? seconds as number : s(CHECK_TIMEOUT_CAP_MS)
  const session = deps.agent?.session?.id
  const line: LimitLine = { at: now.toISOString(), check, action: raise ? 'raise' : 'reset', capS, previousCapS: s(capMs), reason: said, ...(session === undefined ? {} : { session }) }
  if (deps.home === undefined) refuse('unavailable', 'the project has no directory for limits.jsonl', 'tell the human the limit could not be changed (no project directory); you can try again or narrow the check')
  try {
    await appendLimit(deps.home, line)
  }
  catch (error) {
    refuse('unavailable', `limits.jsonl could not be written (${codeOf(error)})`, `tell the human the limit could not be changed (${codeOf(error)}); you can try again or narrow the check`)
  }
  const message = raise
    ? `The ceiling of check ${check} is now ${capS} s (it was ${s(capMs)} s); its next run takes its limit under it. The human sees the raise and your reason on the loop board and in the morning report: mention it in your reply. To undo it, call check_limit with action "reset".`
    : `The ceiling of check ${check} is back to ${capS} s (it was ${s(capMs)} s). Mention it in your reply.`
  return { outcome: raise ? 'raised' : 'reset', check, capS, previousCapS: s(capMs), message }
}
