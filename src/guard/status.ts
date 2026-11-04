/**
 * The guard row's status entries (status hub design 0.3 §3.1, §4.2, §12 M4
 * row): the per-rule denial counts and the lift status of the project's
 * violation journal, the facts the morning report's 例外 section words —
 * ruleLines and liftLines moved here, because these are the words the guard
 * module owns and the entry function must not import the report that imports
 * the guard. One computation: the report builds its lines from these same
 * functions, the entries carry their output verbatim.
 *
 * The entries read the WHOLE journal, the way the usage entry is the whole
 * usage journal (the design's §10): a denial count is the journal's account,
 * and a lift is the project's decision whose day does not matter (M4 design
 * §3.10, review finish2 round 2 F16) — the report keeps its period slices
 * until its hub adoption. The entry words carry the lift route and the
 * human's words verbatim (the design's liftHow), so `fields` stay empty.
 * The uncommitted-file note of the report is not here: it needs a git call
 * and the status view is synchronous; the report keeps computing it.
 */
import type { StatusItem } from '../shared/status.ts'
import { liftStatesOf } from './lift.ts'
import { ruleStats } from './measure.ts'
import type { GuardRecord, LiftRecord } from './records.ts'

/** What the lift side of the entries and the report read (M4 design §3.10): the whole journal's lift records, the journal's earliest instant (gap records count their `since`), and the record file's text or read error. */
export interface LiftsInput {
  /** Every `kind: 'lift'` line of the whole violations journal. */
  readonly records: readonly LiftRecord[]
  /** The earliest instant any journal record (any class) carries; a gap record counts its `since`. Absent when the journal is empty. */
  readonly earliest?: string | undefined
  /** The record file's text, when the project root is known; absent without a root, and the lines derive the lifts from the journal alone. */
  readonly file?: { readonly text: string } | { readonly error: string }
  /** Whether git sees uncommitted changes to the record file (the caller ran `git status`, 5 seconds, failure absent). */
  readonly uncommitted?: boolean | undefined
}

/** A journal timestamp as the report and the entries write clock times: `MM-DD HH:mm` in the display zone. */
export function renderStamp(at: number, offsetMinutes: number): string {
  const shifted = new Date(at + offsetMinutes * 60_000)
  const month = `${shifted.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${shifted.getUTCDate()}`.padStart(2, '0')
  const hour = `${shifted.getUTCHours()}`.padStart(2, '0')
  const minute = `${shifted.getUTCMinutes()}`.padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

/**
 * One line per rule the journal denied in the period, and the right-path
 * summary (m4-gate G2, design §3.10), over the same statistics reader the
 * command line and the rules page use. The denominator of a ratio holds
 * right-path, verbatim retries and everything else; the follow-ups that
 * settled as no next call are counted apart, because stopping for the human
 * is the right path for several corrections (design §3.3). A rule whose
 * denials all sit outside the period has no line of its own; a rule the
 * journal only holds follow-ups for still enters the summary.
 */
export function ruleLines(records: readonly GuardRecord[], offsetMinutes: number): string[] {
  const stats = ruleStats(records, {})
  const lines: string[] = []
  const ratios: string[] = []
  let stopped = 0
  for (const [rule, stat] of stats.rules) {
    // The stops count for every rule the journal holds, also for one whose denials sit outside the period.
    stopped += stat.followups.none
    const denominator = stat.followups['right-path'] + stat.followups.repeat + stat.followups.other
    if (denominator > 0) ratios.push(`${rule} ${stat.followups['right-path']}/${denominator}`)
    const denials = stat.denials.dialect + stat.denials.other
    if (denials === 0) continue
    const last = stat.last
    const at = last === undefined || Number.isNaN(Date.parse(last.at)) ? '' : ` · ${renderStamp(Date.parse(last.at), offsetMinutes)}`
    const look = last === undefined ? '' : `（最近一次：${last.tool}${last.subject === undefined ? '' : ` ${last.subject}`}${at}）`
    lines.push(`- 拦下 ${rule} × ${denials}${look}${denominator > 0 ? ` · 拦截后下一步走对 ${stat.followups['right-path']}/${denominator}` : ''}${stat.followups.repeat > 0 ? ` · 原样重试 ${stat.followups.repeat} 次` : ''}`)
  }
  if (ratios.length === 0 && stopped === 0) return lines
  const pairs = ratios.length === 0 ? '无' : ratios.join('，')
  lines.push(`- 拦截后下一步走对：${pairs}${stopped > 0 ? `（另有 ${stopped} 次停下来交给人或上级）` : ''}`)
  return lines
}

/**
 * The lift lines (m4-gate G3, design §3.10): which rules stand lifted right
 * now, and whether the record file and the journal agree. The input is not
 * period-bounded — a lift is a decision of the project, its day does not
 * matter (review finish2 round 2 F16). Without a record file the lines
 * derive the lifted rules from the journal alone and reconcile nothing; an
 * unreadable file says so and reconciles nothing. A mismatch never changes a
 * rule's state (the gate reads the file), the lines only name it.
 */
export function liftLines(lifts: LiftsInput, offsetMinutes: number): string[] {
  const lines: string[] = []
  const journalOf = (rule: string): LiftRecord | undefined =>
    [...lifts.records].filter(record => record.rule === rule).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1)
  const journalStateOf = (rule: string): 'lift' | 'restore' | undefined => {
    const last = journalOf(rule)
    return last === undefined ? undefined : last.action
  }
  const file = lifts.file
  const fileStates = file !== undefined && 'text' in file ? liftStatesOf(file.text) : undefined
  const liftedRules = fileStates !== undefined
    ? [...fileStates.states].filter(([, action]) => action === 'lift').map(([rule]) => rule)
    : [...new Set(lifts.records.filter(record => record.action === 'lift').map(record => record.rule))].filter(rule => journalStateOf(rule) === 'lift')
  // - 撤下的规则：one line, every rule now lifted, with the last lift record's moment and words (design §3.10).
  if (liftedRules.length > 0) {
    const parts = liftedRules.map((rule) => {
      const last = journalOf(rule)
      if (last === undefined) return rule
      const at = Number.isNaN(Date.parse(last.at)) ? '' : `${renderStamp(Date.parse(last.at), offsetMinutes)}，`
      const via = last.via === 'chat' ? `经对话，原话「${last.words}」` : `经规则板，写命令原文「${last.words}」`
      return `${rule}（${at}${via}）`
    })
    lines.push(`- 撤下的规则：${parts.join('、')}`)
  }
  if (file !== undefined && 'error' in file) {
    lines.push(`- lifts.jsonl 读不出（${file.error}），这一次没有对账`)
    return lines
  }
  if (fileStates === undefined) return lines
  // The reconciliation (review finish2 round F15): terminal state per rule,
  // then the lines each side holds and the other lacks, keyed at+rule+action.
  const earliestMs = lifts.earliest === undefined || Number.isNaN(Date.parse(lifts.earliest)) ? undefined : Date.parse(lifts.earliest)
  const journalKeys = new Set(lifts.records.map(record => `${record.at}|${record.rule}|${record.action}`))
  const preJournal = (at: string): boolean => earliestMs !== undefined && !Number.isNaN(Date.parse(at)) && Date.parse(at) < earliestMs
  const say = (state: 'lift' | 'restore' | undefined, side: '文件' | '流水'): string =>
    state === undefined ? (side === '文件' ? '文件里没有这条规则的行' : '流水里没有这条规则的记录') : `${side === '文件' ? '文件里最后一行是' : '流水里最后一条是'}${state === 'lift' ? '撤下' : '恢复'}`
  const mismatched = new Set<string>()
  const carried = new Set<string>()
  for (const rule of [...new Set([...fileStates.states.keys(), ...lifts.records.map(record => record.rule)])]) {
    const fileLines = fileStates.lines.filter(line => line.rule === rule)
    const freshFileLines = fileLines.filter(line => !preJournal(line.at))
    const journalRecords = lifts.records.filter(record => record.rule === rule)
    // A rule the file lifts only before the journal's first record, with no
    // journal record of its own, belongs to the new-machine row: its lines
    // cannot be repopulated, so per-rule rows would never clear (review
    // finish2 round 2 N29).
    if (freshFileLines.length === 0 && journalRecords.length === 0) {
      if (fileLines.length > 0) carried.add(rule)
      continue
    }
    const fileState = fileStates.states.get(rule)
    const journalState = journalStateOf(rule)
    if (fileState !== journalState) {
      mismatched.add(rule)
      lines.push(`- lifts.jsonl 与流水对不上：${rule}，${say(fileState, '文件')}，${say(journalState, '流水')}`)
      continue
    }
    const extraFile = freshFileLines.filter(line => !journalKeys.has(`${line.at}|${line.rule}|${line.action}`)).length
    const extraJournal = journalRecords.filter(record => !fileStates.lines.some(line => line.at === record.at && line.action === record.action)).length
    if (extraFile > 0 || extraJournal > 0) {
      mismatched.add(rule)
      lines.push(`- lifts.jsonl 与流水对不上：${rule}，文件里有 ${extraFile} 行流水没有的，流水里有 ${extraJournal} 条文件没有的`)
    }
  }
  if (carried.size > 0) {
    const names = [...carried].slice(0, 5).join('、')
    lines.push(`- 流水里没有这些撤下记录（换了电脑？）：lifts.jsonl 里有 ${carried.size} 条规则的撤下或恢复早于本机流水：${names}${carried.size > 5 ? '等' : ''}`)
  }
  if (lifts.uncommitted === true) lines.push('- lifts.jsonl 有未提交的撤下，随下一次提交带上')
  return lines
}

/** What one project's guard facts the entries carry: the whole journal, the lift side over it, and the two sources. */
export interface GuardStatusInput {
  /** Every record of the project's violation journal, oldest first as the file holds them. */
  readonly violations: readonly GuardRecord[]
  /** The lift side over the same journal: the whole-journal lift records, the journal's earliest, the record file. */
  readonly lifts: LiftsInput
  /** The violation journal's path, the denials entry's source. */
  readonly source: string
  /** The lift record file's path, the lifts entry's source. */
  readonly liftsSource: string
}

/** The display zone the report words its times in (morning-report's default); the entries write the same stamps. */
const GUARD_STATUS_OFFSET_MINUTES = 480

/**
 * The guard module's two entries, computed once for every display (status
 * hub design 0.3 §3.1): `rules/denials`, whose text is the first per-rule
 * line and whose detail the rest (the summary included), and `rules/lifts`,
 * whose text is the `- 撤下的规则：` line when a rule stands lifted and
 * `撤下的规则：无` when none does, with the reconciliation lines as the
 * detail. No denials entry when the journal holds no denied rule and no
 * follow-up; the lifts entry stands whenever the project is known, because
 * "no rule lifted" is the standing answer. `asOf` of the lifts entry is the
 * latest lift record's moment, the read moment before the first one.
 */
export function guardStatusItems(input: GuardStatusInput, nowMs: number, offsetMinutes: number = GUARD_STATUS_OFFSET_MINUTES): StatusItem[] {
  const items: StatusItem[] = []
  const denials = ruleLines(input.violations, offsetMinutes)
  if (denials.length > 0) {
    items.push({
      id: 'rules/denials',
      owner: 'rules',
      audience: 'agent',
      asOf: new Date(nowMs).toISOString(),
      source: input.source,
      text: denials[0],
      ...(denials.length > 1 ? { detail: denials.slice(1) } : {}),
    })
  }
  const lines = liftLines(input.lifts, offsetMinutes)
  const [first] = lines
  const liftedLine = first !== undefined && first.startsWith('- 撤下的规则：') ? first : undefined
  const latestLift = [...input.lifts.records].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1)
  items.push({
    id: 'rules/lifts',
    owner: 'rules',
    audience: 'agent',
    asOf: latestLift === undefined ? new Date(nowMs).toISOString() : latestLift.at,
    source: input.liftsSource,
    text: liftedLine ?? '- 撤下的规则：无',
    ...(liftedLine === undefined && lines.length > 0 ? { detail: lines } : liftedLine !== undefined && lines.length > 1 ? { detail: lines.slice(1) } : {}),
  })
  return items
}
