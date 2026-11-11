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
export function askRefusal(ask: AskDraft | ListAsk): string | undefined {
  const cost: string | undefined = ask.cost
  const notTaken: string | undefined = 'notTaken' in ask ? ask.notTaken : undefined
  const record = { title: ask.title, ask: askOf(ask.text), form: 'recommend' as const, proposal: ask.proposal, reason: ask.reason, ...(cost === undefined ? {} : { cost }), ...(notTaken === undefined ? {} : { notTaken }) }
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

// ------------------------------------------------- the list round (§7.3)

/** One command that will run once the human agrees, as one line of the list's detail. */
export interface DetailCommand {
  readonly cls: CommandClass
  /** The command as written (a gate line's command, or a check line's with `{files}`). */
  readonly text: string
  /** A check line's `<预计>`, when it has one (§7.2 item 10 checked it against the trial). */
  readonly estimateSec?: number
  /** The usable trial run of this very text (§6.3 reuse): a gate-class line's measured seconds. */
  readonly ranSec?: number
  /** A `when` line's paths, or `夜里` for a patrol line: written next to the class. */
  readonly scope?: readonly string[]
}

/** What the list round's texts are built from; review.ts computes it from the round's snapshot. */
export interface ListView {
  readonly takeover: { readonly id: string, readonly path: 'new' | 'existing' | 'gaps' }
  readonly anchor: string
  /** The anchor's title, as the human reads it (no `*`, at most 16 code points). */
  readonly anchorTitle: string
  /** The list round number (1 for the first). */
  readonly round: number
  readonly goals: number
  readonly tasks: number
  /** The tasks of the set that carry 完成证据. */
  readonly done: number
  /** The gaps of a gaps takeover, by id. */
  readonly missing: readonly string[]
  /** The commands of the detail, in run order. */
  readonly commands: readonly DetailCommand[]
  /** The change lines in the gate (§5.6): their count is the not-taken fact. */
  readonly changed: number
  /** The facts each cost candidate reads. */
  readonly costs: {
    /** A gate checker that failed in the trial (its command). */
    readonly gateFailed?: string
    /** Whether the gate has at least one command. */
    readonly hasGateCommand: boolean
    readonly testsMissing: boolean
    /** Commands that gave no result in isolation (their count, and the one when it is a single gate command). */
    readonly limitedCount: number
    readonly limitedSingle?: string
    /** Commands still running, and the minutes they still need (rounded). */
    readonly runningCount: number
    readonly runningEtaMin?: number
    /** A 不许碰 path whose rule question is still waiting. */
    readonly rulePending?: string
    /** A repository path no rule question names. */
    readonly uncoveredPath?: string
    /** Commands read from documents, never run. */
    readonly untriedCount: number
    /** The title proposed twice. */
    readonly duplicateTitle?: string
  }
  readonly notTaken: {
    readonly changed: number
    /** A checker left out of the gate because it is red on the code as it is. */
    readonly leftOutChecker?: string
    /** A candidate left out with its reason. */
    readonly leftOut?: { readonly text: string, readonly why: '像在发布' | '会一直跑' | '多行脚本' }
    /** The pending tasks a plain takeover leaves for the person's word. */
    readonly pending: number
  }
}

/** The fields of the list question, as propose_to_human takes them. */
export interface ListAsk {
  readonly title: string
  readonly text: string
  readonly proposal: string
  readonly reason: string
  readonly cost?: string
  readonly notTaken?: string
}

/** A record field or question text as the human reads it: no `*`, at most `limit` code points. */
const readerVariable = (text: string, limit: number): string => variable(text, limit)

const GAPS_TAIL: Readonly<Record<'existing' | 'gaps', { readonly head: (view: ListView) => string, readonly proposal: (view: ListView) => string, readonly reason: (view: ListView) => string }>> = {
  existing: {
    head: view => `照这份清单接管「${view.anchorTitle}」：读出 ${view.goals} 个目标、${view.tasks} 件活`,
    proposal: view => view.done > 0 ? spaced(`同意后把 ${view.done} 件已做完的标成完成、其余等你说再动`) : '同意后摆上项目图、还要做的等你说再动',
    reason: view => view.done > 0 ? spaced(`这 ${view.done} 件都带提交号`) : '接管只把读出的现状摆上图',
  },
  gaps: {
    head: view => `给「${view.anchorTitle}」补上 ${view.missing.length} 样缺的：${view.missing.slice(0, 3).join('、')}`,
    proposal: () => '同意后补上这几样、已有的一样不改',
    reason: () => '已有的节点都是你同意过的',
  },
}

/** The first cost candidate that holds (§7.3's order), or undefined: a plain question then. */
function costOf(view: ListView): string | undefined {
  const { costs } = view
  const candidates: readonly string[] = [
    ...costs.gateFailed === undefined ? [] : [spaced(`${readerVariable(costs.gateFailed, COMMAND_LIMIT)} 在副本里没过，合入前会一直挡着`)],
    ...costs.hasGateCommand ? [] : ['项目里没有一条检查命令，合入会被拒到补上为止'],
    ...costs.testsMissing ? ['项目里没找到测试，合入会被挡到补上为止'] : [],
    ...costs.limitedSingle !== undefined && costs.limitedCount === 1 ? [spaced(`${readerVariable(costs.limitedSingle, COMMAND_LIMIT)} 在副本里没跑通，合入前才知道结果`)] : [],
    ...costs.limitedCount > 0 ? [`${costs.limitedCount} 条在隔离里没跑出结论，第一次真跑才知道`] : [],
    ...costs.runningCount > 0 ? [`还有 ${costs.runningCount} 条在试跑，约 ${costs.runningEtaMin ?? 1} 分钟后有结果`] : [],
    ...costs.rulePending === undefined ? [] : [spaced(`拦 ${readerVariable(costs.rulePending, PATH_LIMIT)} 的规则还在等你回话`)],
    ...costs.uncoveredPath === undefined ? [] : [spaced(`${readerVariable(costs.uncoveredPath, PATH_LIMIT)} 写进了不许碰，没有规则拦它`)],
    ...costs.untriedCount > 0 ? [`${costs.untriedCount} 条命令读自文档，没在副本里跑过`] : [],
    ...costs.duplicateTitle === undefined ? [] : [spaced(`${readerVariable(costs.duplicateTitle, COMMAND_LIMIT)} 提了两次，同意时去掉后一个`)],
  ]
  return candidates[0]
}

/** The first not-taken fact that holds (§7.3), or undefined. */
function notTakenOf(view: ListView): string | undefined {
  const { notTaken } = view
  const candidates: readonly string[] = [
    ...notTaken.changed > 0 ? [`没让现在的 ${notTaken.changed} 条旧告警挡合入，只挡新出的`] : [],
    ...notTaken.leftOutChecker === undefined ? [] : [spaced(`没把 ${readerVariable(notTaken.leftOutChecker, COMMAND_LIMIT)} 放进合入前的检查，它现在就不过`)],
    ...notTaken.leftOut === undefined ? [] : [spaced(`没把 ${readerVariable(notTaken.leftOut.text, COMMAND_LIMIT)} 放进检查：${notTaken.leftOut.why}`)],
    ...view.takeover.path === 'gaps' ? ['没改已有的节点，只补缺的'] : [spaced(`没自动开工，还要做的 ${notTaken.pending} 件等你说`)],
  ]
  return candidates[0]
}

/** The list question over one round (§7.3), or the fallback template with `fallback: true` when no wording passes M3's checks. */
export function listAsk(view: ListView): ListAsk & { readonly fallback?: true } {
  const tail = GAPS_TAIL[view.takeover.path === 'gaps' ? 'gaps' : 'existing']
  const cost = costOf(view)
  const notTaken = notTakenOf(view)
  const build = (head: string, proposal: string, reason: string, withCost: boolean): ListAsk => {
    const text = withCost && cost !== undefined ? spaced(`${head}，我建议${proposal}，因为${reason}，可以吗？代价是${cost}。`) : spaced(`${head}，我建议${proposal}，因为${reason}，可以吗？`)
    const ask: ListAsk = { title: view.takeover.path === 'gaps' ? spaced(`给「${view.anchorTitle}」补上缺的几样`) : spaced(`照这份清单接管「${view.anchorTitle}」`), text, proposal, reason, ...withCost && cost !== undefined ? { cost } : {}, ...notTaken === undefined ? {} : { notTaken } }
    return ask
  }
  const head = tail.head(view)
  const full = build(head, tail.proposal(view), tail.reason(view), true)
  if (askRefusal(full) === undefined) return full
  const plain = build(head, tail.proposal(view), tail.reason(view), false)
  if (askRefusal(plain) === undefined) return { ...plain, fallback: true }
  return {
    title: '照这份清单接管',
    text: '我建议照这份清单写进图、还要做的等你说再动，因为清单里的都读自项目文件，可以吗？',
    proposal: '照这份清单写进图、还要做的等你说再动',
    reason: '清单里的都读自项目文件',
    fallback: true,
  }
}

/** The sentence a command line of the detail carries between the class and the command (§7.3 item 3 of the column). */
function estimatePart(command: DetailCommand): string {
  const timeout = classTimeout(command.cls, command.estimateSec)
  const tail = timeoutPart(command.cls, timeout)
  if (command.cls === 'check') {
    if (command.estimateSec === undefined) return `没预计，${tail}`
    if (command.estimateSec > timeout.timeoutSec) return `约 ${command.estimateSec} 秒，超过上限 ${timeout.timeoutSec} 秒，超时 ${timeout.timeoutSec} 秒`
    return `约 ${command.estimateSec} 秒，${tail}`
  }
  if (command.ranSec !== undefined) return `试跑约 ${durationText(command.ranSec, 'gate')}；${tail}`
  return `没预计，${tail}`
}

const kindLabel = (cls: CommandClass): string => cls === 'check' ? '改完文件就跑' : '合入前'

/** One line of the detail's code block: the class, the estimate and the command text, joined by U+3000. */
const detailLine = (command: DetailCommand): string =>
  [kindLabel(command.cls) + (command.scope === undefined ? '' : `（${command.cls === 'patrol' ? '夜里' : `when ${command.scope.join(', ')}`}）`), estimatePart(command), command.text].join('　')

/** The notes line: the fixed sentences, then the change-lines and isolation ones that hold (§7.3). */
function notesLine(view: ListView): string {
  const gateTimeout = classTimeout('gate')
  const checkTimeout0 = classTimeout('check')
  const sentences = [
    '合入前的检查每次合入都在你电脑上真实环境里跑',
    '没过时主干不前进',
    `每条合入前的检查最多跑 ${gateTimeout.timeoutSec / 60} 分钟${gateTimeout.source === 'default' ? '（默认）' : ''}，超时算没过`,
    '改完文件就跑的检查在改了文件的那个 agent 的下一步之前跑',
    `改完文件就跑的检查每项最多跑 ${checkTimeout0.timeoutSec} 秒${checkTimeout0.source === 'default' ? '（默认）' : ''}，超时算没跑完`,
    '这些检查调用的程序和配置文件不在这次同意里',
    ...view.changed > 0 ? ['旧告警不挡合入，只挡新出的'] : [],
    ...view.costs.limitedCount > 0 ? [`有 ${view.costs.limitedCount} 条在副本里没跑通，第一次真跑才知道`] : [],
  ]
  return `注意：${sentences.join('；')}`
}

/** The detail M3 shows after the list question (§7.3): the command lines in a fence, then the notes; `mustShow` is the block's pieces plus the notes. */
export function commandsDetail(view: ListView): { readonly markdown: string, readonly mustShow: readonly string[] } {
  const lines = view.commands.map(detailLine)
  const block = lines.join('\n')
  const notes = notesLine(view)
  const pieces: string[] = []
  let current: string[] = []
  let size = 0
  for (const line of lines) {
    const lineSize = [...line].length
    if (size > 0 && size + lineSize + 1 > 4000) {
      pieces.push(current.join('\n'))
      current = []
      size = 0
    }
    current.push(line)
    size += lineSize + 1
  }
  if (current.length > 0) pieces.push(current.join('\n'))
  const fence = `${'`'.repeat(Math.max(3, Math.max(0, ...(block.match(/`+/g) ?? []).map(run => run.length)) + 1))}`
  const markdown = [`同意之后会跑的命令（原文，在项目目录里，每次照这样跑）：`, '', `${fence}\n${block}\n${fence}`, '', notes].join('\n')
  return { markdown, mustShow: [...pieces.slice(0, 2), notes] }
}

/** What listFull, statusText and releaseNote add to the list view: the round's nodes, the trial facts of every command, and what the takeover saw. */
export interface FullView extends ListView {
  /** The main agent's reading, with the open forks it left out (§7.2). */
  readonly summary?: string
  readonly nodes: readonly { readonly id: string, readonly title: string, readonly type: string, readonly parent?: string, readonly source?: string, readonly acceptance?: readonly string[], readonly duplicate?: boolean }[]
  /** The commands with their trial facts; a line without a usable run names why none. */
  readonly runs: Readonly<Record<string, { readonly outcome?: string, readonly ms?: number, readonly log?: string, readonly notRun?: string, readonly matchedLine?: string, readonly timedOutSec?: number }>>
  /** Where the two things and the rule stand (§7.7), one line each. */
  readonly statuses: readonly string[]
  /** Other undecided questions of the anchor subtree, counted. */
  readonly othersPending: number
  /** The path decision's basis (§3.4), one sentence. */
  readonly pathBasis: string
  /** What the round saw that the question does not carry. */
  readonly warnings: readonly string[]
  /** Whether the graph directory is under git already (§7.6). */
  readonly graphTracked?: boolean
}

/** `review-<n>.md` (§7.3): everything the round saw, for 说「讲细点」. */
export function listFull(view: FullView): string {
  return [
    `# List round ${view.round} (.llm/bootstrap/${view.takeover.id}/review-${view.round}.md)`,
    '',
    'The harness wrote this file; the question the main agent puts to the human is word for word what bootstrap_review returned.',
    '',
    '## What the main agent read',
    '',
    view.summary ?? '(no summary)',
    '',
    '## Nodes of this round',
    '',
    ...view.nodes.map((node) => {
      const head = `- ${node.id} (${node.type}${node.parent === undefined ? '' : `, under ${node.parent}`})${node.duplicate === true ? ' [duplicate: on agreement the later one is rejected]' : ''}: ${node.title}`
      const source = node.source === undefined ? '' : ` — ${node.source}`
      const acceptance = node.acceptance === undefined || node.acceptance.length === 0 ? '' : ` | acceptance: ${node.acceptance.join(' | ')}`
      return `${head}${source}${acceptance}`
    }),
    '',
    '## Commands',
    '',
    ...view.commands.map((command) => {
      const run = view.runs[command.text]
      const base = `- ${detailLine(command)}`
      if (run === undefined) return base
      if (run.notRun !== undefined) return `${base} — 没试跑：${run.notRun}`
      if (run.outcome === undefined) return base
      const time = run.ms === undefined ? '' : `，${durationText(run.ms / 1000, 'gate')}`
      const tail = run.timedOutSec !== undefined ? `；${afterTrialText(command.cls, classTimeout(command.cls, command.estimateSec), run.timedOutSec)}` : ''
      const matched = run.matchedLine === undefined ? '' : `；stderr：${run.matchedLine}`
      return `${base} — ${run.outcome}${time}${run.log === undefined ? '' : `；日志 ${run.log}`}${tail}${matched}`
    }),
    '',
    '## Cautions and what was left out',
    '',
    notesLine(view),
    ...view.notTaken.changed > 0 ? [`- 没让现在的 ${view.notTaken.changed} 条旧告警挡合入，只挡新出的（${view.changed} 条 \`changed\` 行）。`] : [],
    ...view.notTaken.leftOutChecker === undefined ? [] : [`- 没把 ${view.notTaken.leftOutChecker} 放进合入前的检查，它现在就不过。`],
    ...view.statuses,
    ...view.othersPending > 0 ? [`另有 ${view.othersPending} 件要你定的，在『需要你』里。`] : [],
    '- 默认规则：高峰定价的规则写在产品里（builtin:glm-peak-pricing），接管不加任何规则。',
    `- 判路依据：${view.pathBasis}`,
    ...view.warnings.map(line => `- ${line}`),
    '',
  ].join('\n')
}

/** What the takeover writes into the graph when the human agrees (§7.4), as the result reports it. */
export interface AppliedCounts {
  readonly approved: number
  readonly skipped: number
  readonly rejected: number
  readonly done: number
}

/** The message M3 puts into record_human_answer's result (§7.4's table). Pure. */
export function resultMessage(outcome: string, takeoverId: string, round: number, parts: {
  readonly counts?: AppliedCounts
  readonly rules?: readonly string[]
  readonly rulesLive?: boolean
  readonly wish?: string
  readonly graphDir?: string
  readonly why?: string
  readonly differing?: string
  readonly round_current?: number
}): string {
  switch (outcome) {
    case 'applied': {
      const { counts, rules, rulesLive, wish, graphDir } = parts
      const c = counts ?? { approved: 0, skipped: 0, rejected: 0, done: 0 }
      return [
        `Takeover ${takeoverId} written: approved ${c.approved}, skipped ${c.skipped}, rejected ${c.rejected} duplicates, closed ${c.done} done tasks (details in review-${round}.md).`,
        ` Rules: ${rules === undefined || rules.length === 0 ? 'none were proposed.' : rules.join(' ')}`,
        rulesLive === true ? ' Commit docs/rules/ with git when you next commit; that commit goes through the normal merge checks.' : '',
        wish === undefined ? '' : ` The human's wish from the start of the takeover: ${wish}. After you report, propose its goal as in interview step 1; if a goal for it already exists, skip.`,
        graphDir === undefined ? '' : ` Next: commit the project graph once, then tell the human the result in a few lines. Call 1 (one call): git add -- ${graphDir}. Call 2 (another call): git commit -m "Add the project graph (hourness bootstrap ${takeoverId})" -- ${graphDir}. If call 2 is refused by the trunk gate, the staging from call 1 stands: build the commit off the trunk (a worktree, or git write-tree and git commit-tree), run check_commit <commit>, then git merge --ff-only <commit>. Before you tell the human the graph is in git, verify it: git ls-files -- ${graphDir}/nodes must list the node files (or git show --stat <commit> shows them). A denial refuses the whole call, so nothing in it ran. Until the files are tracked the harness keeps checking the graph and reports it in /glm-status; do not claim the commit before the verification shows it.`,
      ].join('')
    }
    case 'noted-list': return `Takeover ${takeoverId} was already written for round ${round}; nothing more to do.`
    case 'missing': return 'No open takeover matches this question; nothing was written. /hourness-init status shows the takeover.'
    case 'stale': return `Round ${round} is not the current list (${parts.round_current ?? round}); nothing was written. Call bootstrap_review and put the new round to the human as a new question.`
    case 'changed': return `The question differs from round ${round} (${parts.differing ?? 'its words'}); nothing was written. Put a new round to the human exactly as bootstrap_review returns it, and record with recordedAs exactly as given.`
    case 'forbidden': return 'This decision does not carry the human\'s words; nothing was written. Ask the human and record their words with record_human_answer.'
    case 'unseen': return 'The agreement carries no mark that the human saw the exact commands; nothing was written. Show the text from propose_to_human again, verbatim, and ask again; then call record_human_answer.'
    case 'busy': return 'The takeover is being written by another call; it finishes from the graph before your next step.'
    case 'io': return `The takeover journal could not be written (${parts.why ?? 'unknown reason'}); nothing was written. Tell the human; /hourness-init status shows it.`
    default: return `Takeover ${takeoverId}: nothing was written (${outcome}).`
  }
}

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
