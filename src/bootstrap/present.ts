/**
 * What the takeover writes for the human to read (takeover design 0.6
 * §7.3). Pure. This batch has the draft of the two things only the human
 * can say (§5.4, `questionsDraft`), written to `questions.md`; the list
 * round's texts (`listAsk`, `listFull`, `statusText`…) join with
 * bootstrap_review (plan B7).
 *
 * Each thing is one confirming question (`form: 'recommend'`): the
 * recommendation and its reason before the question mark, the cost after it.
 * Its words go through M3's checks (`askTextRefusal`, `proposalTitleRefusal`,
 * `proposalRecordRefusal`, `textCoversRecord`, `plainWordsIn`); a candidate
 * whose words fail them goes to the remarks, and with no candidate left the
 * thing is a guess asked in the chat (`d-ask-three-gates`, the third way).
 * Names taken from the repository (script names, directories, file paths)
 * enter the draft only when they are at most 40 characters of
 * `[A-Za-z0-9._:/@-]` (§8, §12): repository text is data, and a name that
 * could carry a sentence for the model or the human is not listed at all.
 * A variable starting or ending with Latin letters, digits or ASCII marks
 * next to Han characters gets a space between them, in the text and in the
 * record fields alike, so the record stays word for word in the text.
 */
import { CHECK_TIMEOUT_CAP_MS, CHECK_TIMEOUT_FACTOR, CHECK_TIMEOUT_FLOOR_MS, checkTimeout } from '../env/timeout.ts'
import { plainWordsIn } from '../graph/plain-question.ts'
import { askOf, askTextRefusal, proposalRecordRefusal, proposalTitleRefusal, textCoversRecord } from '../graph/proposal.ts'
import { looksCostly } from './defaults.ts'
import type { ScanResult } from './scan.ts'

// ------------------------------------------------- timeouts and durations (§7.3)

/**
 * M7's default limit of one merge-gate command (M7 §3.8.1, the default
 * configuration; M7 names no constant and has no read-only member that
 * hands its configured value yet, F49): until it does, every gate-class
 * timeout is this default and says so.
 */
const GATE_DEFAULT_SEC = 1800

/** Who first runs a command after the human agrees: the merge gate (`setup $`, `$`, `when`), the checker after edits, the nightly patrol. */
export type CommandClass = 'gate' | 'check' | 'patrol'

/** What `executorTimeout` hands back (§7.3): the timeout the executor uses on its first real run. */
export interface ExecutorTimeout {
  readonly timeoutSec: number
  readonly source: 'estimate' | 'default'
  /** Whether the estimate reaches the executor (today only a check line's `<预计>`). */
  readonly estimateReaches: boolean
  readonly clamp?: 'floor' | 'ceiling'
}

/**
 * The one place the takeover reads timeouts (§7.3, U13): a check line's
 * first limit is M4's `checkTimeout` over its estimate (three times, at
 * least the floor, at most the ceiling; the ceiling without one); a gate
 * or patrol command gets M7's default whatever the estimate, until the
 * estimate reaches the merge gate (§25.4).
 */
export function executorTimeout(kind: 'check' | 'gate', estimateSec?: number): ExecutorTimeout {
  if (kind === 'gate') return { timeoutSec: GATE_DEFAULT_SEC, source: 'default', estimateReaches: false }
  if (estimateSec === undefined) return { timeoutSec: CHECK_TIMEOUT_CAP_MS / 1000, source: 'default', estimateReaches: false }
  const timeout = checkTimeout({ estimateS: estimateSec, recentMs: [] })
  const clamp = timeout.capped !== undefined ? 'ceiling' as const : CHECK_TIMEOUT_FACTOR * estimateSec * 1000 < CHECK_TIMEOUT_FLOOR_MS ? 'floor' as const : undefined
  return { timeoutSec: timeout.limitMs / 1000, source: 'estimate', estimateReaches: true, ...clamp === undefined ? {} : { clamp } }
}

/**
 * The one way a time is written (§7.3 item 1): `check` in whole seconds;
 * `gate` (and patrol, trial times) in seconds below 90, else in whole
 * minutes, half a minute rounding up.
 */
export function durationText(sec: number, kind: 'check' | 'gate'): string {
  const whole = Math.ceil(sec)
  if (kind === 'check' || whole < 90) return `${whole} 秒`
  return `${Math.floor(whole / 60 + 0.5)} 分`
}

const executorKind = (cls: CommandClass): 'check' | 'gate' => cls === 'check' ? 'check' : 'gate'

/** The 「超时 …」 part, word for word the same in the list's column and in afterTrialText. */
export function timeoutPart(cls: CommandClass, timeout: ExecutorTimeout): string {
  const mark = timeout.source === 'default' ? '（默认）' : timeout.clamp === 'ceiling' ? '（到上限）' : ''
  return `超时 ${durationText(timeout.timeoutSec, executorKind(cls))}${mark}`
}

const FIRST_RUN: Readonly<Record<CommandClass, string>> = {
  gate: '同意之后由合入前的检查第一次跑它',
  check: '同意之后由改完文件就跑的检查在改了文件之后第一次跑它',
  patrol: '同意之后由夜里的巡检第一次跑它',
}

const LATE_END: Readonly<Record<CommandClass, string>> = {
  gate: '，结局是『没过』，主干不前进',
  check: '，结局是『没跑完』，下一次改动照常再跑',
  // M7 does not say how a patrol command that runs out ends; not written for it.
  patrol: '',
}

/**
 * What happens next to a command the trial gave no result for (§7.3 item
 * 2): timed out, out of total time, or not conclusive in isolation. With
 * `ranSec` (timed out only) at or over the executor's timeout, the sentence
 * says that run will most likely not finish either.
 */
export function afterTrialText(cls: CommandClass, timeout: ExecutorTimeout, ranSec?: number): string {
  const head = `${FIRST_RUN[cls]}，${timeoutPart(cls, timeout)}`
  return ranSec !== undefined && ranSec >= timeout.timeoutSec ? `${head}；试跑里它没跑完，这里的上限更短，那一次多半也跑不完${LATE_END[cls]}` : head
}

/** The executor timeout of a command of a class (a check line with its estimate). */
export const classTimeout = (cls: CommandClass, estimateSec?: number): ExecutorTimeout => executorTimeout(executorKind(cls), cls === 'check' ? estimateSec : undefined)

/** The two things, by the label their answer goes into: 花钱或独占 (norm-verify-tiers) and 不许碰 (norm-decision-tiers). */
export type Thing = 'cost' | 'touch'

/** One question as propose_to_human takes it (kind question, form recommend). */
interface AskDraft {
  readonly title: string
  readonly text: string
  readonly proposal: string
  readonly reason: string
  readonly cost: string
}

export interface ThingDraft {
  readonly which: Thing
  /** The question, when there is a candidate; otherwise the guess to ask in the chat. */
  readonly ask?: AskDraft
  readonly guess?: string
  /** Candidates the question names, and the ones it leaves for the main agent to add. */
  readonly shown: readonly string[]
  readonly more: readonly string[]
}

/** Top-level directories that look like other people's code or build output (§5.4). */
const FOREIGN_TOP = ['vendor/', 'third_party/', 'reference/', 'external/', 'generated/', 'dist/', 'build/']
/** Tracked file names that look like they hold secrets: not to be changed; reading them is free (`d-credentials-readable`). */
const SECRET_NAME = /^(?:\.env.*|.+\.pem|.+\.key)$/i

const COMMAND_LIMIT = 16
const PATH_LIMIT = 12
const SHOWN_LIMIT = 2
/** A name from the repository that may enter the drafts (§8, §12): at most 40 characters, only these; any other is not listed. */
const DRAFT_NAME = /^[A-Za-z0-9._:/@-]{1,40}$/

/** A variable as the human reads it: no `*`, cut to `limit` code points with 「…」. */
function variable(text: string, limit: number): string {
  const bare = text.replaceAll('*', '').trim()
  const points = [...bare]
  return points.length > limit ? `${points.slice(0, limit - 1).join('')}…` : bare
}

/** A space between Han characters and Latin letters, digits, ASCII marks or 「…」 next to them. */
function spaced(text: string): string {
  return text.replace(/(\p{Script=Han})([!-~…])/gu, '$1 $2').replace(/([!-~…])(\p{Script=Han})/gu, '$1 $2')
}

/** Why a question's words do not pass M3's checks, or undefined. */
export function askRefusal(ask: AskDraft): string | undefined {
  const record = { title: ask.title, ask: askOf(ask.text), form: 'recommend' as const, proposal: ask.proposal, reason: ask.reason, cost: ask.cost }
  const refused = askTextRefusal('recommend', ask.text) ?? proposalTitleRefusal(ask.title) ?? proposalRecordRefusal(record)
  if (refused !== undefined) return refused.message
  const uncovered = textCoversRecord(ask.text, record, 'recommend')
  if (uncovered !== undefined) return `${uncovered.field} is not in the ${uncovered.within}`
  const plain = plainWordsIn(`${ask.title}\n${ask.text}`)
  return plain.length > 0 ? `words the human does not use: ${plain.join(', ')}` : undefined
}

interface Template {
  readonly title: string
  readonly tail: (one: boolean) => string
  readonly reason: (one: boolean) => string
  readonly cost: (one: boolean) => string
}

const them = (one: boolean): string => one ? '它' : '它们'

const COST_TEMPLATE: Template = {
  title: '哪些检查花钱或要独占机器',
  tail: () => '攒到一批再跑、不放进每次合入前的检查',
  reason: one => `${them(one)}像是要花钱或独占机器的检查`,
  cost: one => `每次合入前少了${one ? '这一道' : '这几道'}检查`,
}

function touchTemplate(kinds: { readonly foreign: boolean, readonly secret: boolean }, rulesWhole: boolean): Template {
  const what = kinds.foreign && kinds.secret ? '别人的代码、生成的文件或放密钥的文件' : kinds.secret ? '放密钥的文件' : '别人的代码或生成的文件'
  return {
    title: '哪些地方不许碰',
    // Without the rules board's way of agreeing, nothing can block the paths: the answer only goes into the norm (§5.4, last part).
    tail: one => rulesWhole ? `记成不许碰、另提一条规则拦住改${them(one)}` : '记成不许碰、写进规范',
    reason: one => `${them(one)}像是${what}`,
    cost: one => rulesWhole ? `以后要改${them(one)}得先撤下这条规则` : '系统不会拦，只靠主 Agent 改之前先问你',
  }
}

function askOfItems(template: Template, items: readonly string[]): AskDraft {
  const one = items.length === 1
  const proposal = spaced(`${items.join('和')}${template.tail(one)}`)
  const reason = spaced(template.reason(one))
  const cost = spaced(template.cost(one))
  return { title: template.title, text: spaced(`我建议${proposal}，因为${reason}，可以吗？代价是${cost}。`), proposal, reason, cost }
}

/** The question over as many of the candidates as pass the checks (two at most); the rest are remarks. */
function thingOf(which: Thing, candidates: readonly string[], template: Template, guess: string): ThingDraft {
  const usable = candidates.filter(candidate => askRefusal(askOfItems(template, [candidate])) === undefined)
  const left = candidates.filter(candidate => !usable.includes(candidate))
  for (let count = Math.min(SHOWN_LIMIT, usable.length); count > 0; count--) {
    const shown = usable.slice(0, count)
    const ask = askOfItems(template, shown)
    if (askRefusal(ask) === undefined) return { which, ask, shown, more: [...usable.slice(count), ...left] }
  }
  return { which, guess, shown: [], more: left }
}

/** The commands that look like they cost money or hold the machine, as the human reads them; a script name outside DRAFT_NAME is not listed. */
function costCandidates(scan: ScanResult): string[] {
  const texts = scan.candidates
    .filter(candidate => candidate.danger === null && looksCostly(candidate) && DRAFT_NAME.test(candidate.name ?? candidate.text))
    .map(candidate => variable(candidate.text, COMMAND_LIMIT))
  return [...new Set(texts)]
}

/** Top directories of other people's code or build output, and tracked file names that look like secrets; a path outside DRAFT_NAME is not listed. */
function touchCandidates(scan: ScanResult, files: readonly string[]): { readonly paths: string[], readonly foreign: boolean, readonly secret: boolean } {
  const foreign = scan.files.topDirs.filter(dir => FOREIGN_TOP.includes(dir.toLowerCase()) && DRAFT_NAME.test(dir))
  const secret = files.filter(file => SECRET_NAME.test(file.slice(file.lastIndexOf('/') + 1)) && DRAFT_NAME.test(file))
  const paths = [...new Set([...foreign, ...secret].map(path => variable(path, PATH_LIMIT)))]
  return { paths, foreign: foreign.length > 0, secret: secret.length > 0 }
}

/** The guess when neither thing has a candidate: one sentence for both (§5.4). */
export const BOTH_GUESS = '我猜这个项目里没有花钱或要独占机器的检查，也没有不许碰的地方，对吗？'
const COST_GUESS = '我猜这个项目里没有花钱或要独占机器的检查，对吗？'
const TOUCH_GUESS = '我猜这个项目里没有不许碰的地方，对吗？'

/**
 * The draft of the two things (§5.4) for one scan and its tracked files.
 * `rulesWhole`: the rules board can take a rule through the human's
 * agreement (rules_propose and the attach path); without it the touch
 * question says the answer only goes into the norm. `which`: the things
 * this takeover asks (a gaps takeover asks only the thing of a norm it
 * fills, §5.8).
 */
export function questionsDraft(scan: ScanResult, files: readonly string[], rulesWhole: boolean, which: readonly Thing[] = ['cost', 'touch']): readonly ThingDraft[] {
  const touch = touchCandidates(scan, files)
  const cost = thingOf('cost', costCandidates(scan), COST_TEMPLATE, COST_GUESS)
  const touched = thingOf('touch', touch.paths, touchTemplate(touch, rulesWhole), TOUCH_GUESS)
  const both = which.includes('cost') && which.includes('touch')
  const drafts = both && cost.ask === undefined && touched.ask === undefined ? [{ ...cost, guess: BOTH_GUESS }, { ...touched, guess: BOTH_GUESS }] : [cost, touched]
  return drafts.filter(thing => which.includes(thing.which))
}

const LABEL: Readonly<Record<Thing, string>> = { cost: '花钱或独占 (norm-verify-tiers)', touch: '不许碰 (norm-decision-tiers)' }

/** `questions.md`: the arguments of propose_to_human for each thing, or the guess to ask in the chat, and the remarks. */
export function questionsMarkdown(draft: readonly ThingDraft[], takeoverId: string): string {
  const guesses = [...new Set(draft.filter(thing => thing.ask === undefined).map(thing => thing.guess ?? ''))]
  return [
    '# The two things only the human can say',
    '',
    'Put the questions in one reply, after your report, last. Say in the report in one sentence where they come from (the harness read them off the scan). Adapt the words to what you read; propose_to_human checks them again.',
    '',
    ...draft.flatMap(thing => thing.ask === undefined ? [] : [
      `## ${LABEL[thing.which]}`,
      '',
      'propose_to_human arguments (parent: the anchor goal):',
      '',
      JSON.stringify({ kind: 'question', form: 'recommend', parent: '<anchor id>', ...thing.ask, attach: `bootstrap:${takeoverId}:${thing.which}` }, null, 2),
      '',
      ...thing.more.length === 0 ? [] : [`Also found, not in the question (add them if they belong): ${thing.more.join(', ')}`, ''],
    ]),
    ...guesses.flatMap(guess => [
      `## No candidate: ${draft.filter(thing => thing.ask === undefined && thing.guess === guess).map(thing => LABEL[thing.which]).join(' and ')}`,
      '',
      `Ask in the chat, not with propose_to_human: ${guess}`,
      ...draft.filter(thing => thing.ask === undefined && thing.guess === guess).flatMap(thing => thing.more.length === 0 ? [] : [`Also found, kept out of the question because of their words (say them in yours if they belong): ${thing.more.join(', ')}`]),
      `When the human answers, write their answer as a question like the ones above (attach bootstrap:${takeoverId}:cost or :touch) and put it to them with propose_to_human; when they agree, record it.`,
      '',
    ]),
    `After each agreement, write the answer into the label (${draft.map(thing => LABEL[thing.which]).join(', ')}) with graph_edit, their words as relay; when they say there is none, write 无.`,
    '',
  ].join('\n')
}
