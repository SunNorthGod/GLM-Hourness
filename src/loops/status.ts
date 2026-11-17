/**
 * The loop board's two weekly lists (docs/ORCHESTRATION.md §18.4; loop board
 * design 0.6 §3.1, §6.11): which of the board's entries are stale — a
 * person's, four weeks old, no run with a result in four weeks — and which
 * time out again and again — three unfinished runs in seven days. The
 * selection is pure: the run facts come from the metrics journal
 * (records.ts `runEvents`, metrics F33) and an entry's age from the change
 * record's earliest add, the board computes the lists beside its view
 * (boards.ts) and holds them for the service's readers (index.ts), and the
 * status hub's `loops/*` entries word the same lists (this file's worders,
 * status hub design 0.3 §4.2, §12 loops row). The filter 「已在一条 open 的
 * 删除提议里的不列」 reads the open proposals the store holds (boards.ts
 * feeds the set in).
 */
import type { EntryRunEvent } from './records.ts'
import type { StaleEntry, TimeoutEntry } from './service.ts'
import { momentText } from './view.ts'
import { STATUS_TEXT_MAX, type StatusItem } from '../shared/status.ts'

/** The outcomes that count as a result (design §6.11): the run did what it was for, or told the main agent it did. */
const RESULT_OUTCOMES: ReadonlySet<string> = new Set(['delivered', 'ran', 'reported'])

/** The most entries either list names (design §6.11). */
export const LIST_CAP = 3

/** How long without a result makes a person's entry stale (design §6.11: four weeks). */
const STALE_AGE_MS = 28 * 86_400_000

/** How far back a run with a result keeps an entry off the first list (design §6.11: the same four weeks). */
const STALE_WINDOW_MS = 28 * 86_400_000

/** How far back timeouts count (design §6.11, `d-script-timeout`: seven days). */
const TIMEOUT_WINDOW_MS = 7 * 86_400_000

/** How many unfinished runs in the window put an entry on the second list (design §6.11: three). */
export const TIMEOUT_FLOOR = 3

/** A person's entry as the first list's candidate: the board's read gives id and title, its age comes from the change record. */
export interface StaleCandidate {
  readonly id: string
  readonly title: string
  /** The change record's earliest add, ISO; an entry without one cannot prove its age and is not listed. */
  readonly addedAt: string | undefined
}

/**
 * The first list (design §6.11, acceptance 34): the candidates four weeks
 * old or older whose window holds no run that reached a result, at most
 * `LIST_CAP`, the stalest first — no result ever first, then by the last
 * result, and equals by the day they were added. An entry an open `delete`
 * proposal already names is not listed: the human has not decided it, and
 * the report would ask twice for the same removal.
 */
export function staleEntriesOf(input: {
  readonly entries: readonly StaleCandidate[]
  readonly runs: ReadonlyMap<string, readonly EntryRunEvent[]>
  readonly nowMs: number
  /** The person's entry ids an open `delete` proposal names (boards.ts, from the store's proposals). */
  readonly proposedDelete?: ReadonlySet<string>
}): readonly StaleEntry[] {
  const windowMs = input.nowMs - STALE_WINDOW_MS
  const found = input.entries.flatMap((entry): StaleEntry[] => {
    if (entry.addedAt === undefined || input.proposedDelete?.has(entry.id) === true) return []
    const added = Date.parse(entry.addedAt)
    if (!Number.isFinite(added) || added + STALE_AGE_MS > input.nowMs) return []
    let runs28d = 0
    let resultInWindow = false
    let lastResultAt: string | undefined
    for (const run of input.runs.get(entry.id) ?? []) {
      const at = Date.parse(run.at)
      if (run.kind === 'fired') {
        if (at >= windowMs) runs28d += 1
        continue
      }
      if (run.outcome === undefined || !RESULT_OUTCOMES.has(run.outcome)) continue
      // The journal is in instant order, so the last result seen is the latest.
      lastResultAt = run.at
      if (at >= windowMs) resultInWindow = true
    }
    if (resultInWindow) return []
    return [{
      id: entry.id,
      title: entry.title,
      addedAt: entry.addedAt,
      runs28d,
      why: runs28d === 0 ? 'never-triggered' : 'no-result',
      ...(lastResultAt === undefined ? {} : { lastResultAt }),
    }]
  })
  return found.sort((a, b) => {
    const aAt = a.lastResultAt === undefined ? Number.NEGATIVE_INFINITY : Date.parse(a.lastResultAt)
    const bAt = b.lastResultAt === undefined ? Number.NEGATIVE_INFINITY : Date.parse(b.lastResultAt)
    if (aAt !== bAt) return aAt < bAt ? -1 : 1
    return Date.parse(a.addedAt) <= Date.parse(b.addedAt) ? -1 : 1
  }).slice(0, LIST_CAP)
}

/** An entry as the second list's candidate: a person's and a plugin's alike, id and title only. */
export interface TimeoutCandidate {
  readonly id: string
  readonly title: string
}

/**
 * The second list (design §6.11, `d-script-timeout`): the candidates with
 * `TIMEOUT_FLOOR` or more `unfinished` runs in the last seven days, at most
 * `LIST_CAP`, the most timeouts first, equals by the earliest last timeout.
 */
export function timeoutEntriesOf(input: {
  readonly entries: readonly TimeoutCandidate[]
  readonly runs: ReadonlyMap<string, readonly EntryRunEvent[]>
  readonly nowMs: number
}): readonly TimeoutEntry[] {
  const windowMs = input.nowMs - TIMEOUT_WINDOW_MS
  const found = input.entries.flatMap((entry): TimeoutEntry[] => {
    let timeouts7d = 0
    let lastTimeoutAt: string | undefined
    for (const run of input.runs.get(entry.id) ?? []) {
      if (run.kind !== 'done' || run.outcome !== 'unfinished' || Date.parse(run.at) < windowMs) continue
      timeouts7d += 1
      lastTimeoutAt = run.at
    }
    if (timeouts7d < TIMEOUT_FLOOR || lastTimeoutAt === undefined) return []
    return [{ id: entry.id, title: entry.title, timeouts7d, lastTimeoutAt }]
  })
  return found.sort((a, b) => a.timeouts7d !== b.timeouts7d
    ? b.timeouts7d - a.timeouts7d
    : Date.parse(a.lastTimeoutAt) - Date.parse(b.lastTimeoutAt),
  ).slice(0, LIST_CAP)
}

// ------------------------------------------------------------------ the hub entries

/** One line of at most STATUS_TEXT_MAX code points: a line break becomes a space, a longer line ends in an ellipsis. */
function oneLine(line: string, max: number): string {
  const points = [...line.replace(/[\r\n]+/g, ' ')]
  return points.length <= max ? points.join('') : `${points.slice(0, max - 1).join('')}…`
}

/** The id grammar of a person's entry (journal.ts PERSON_ID): the one tell between the person's entries and a plugin's. */
const PERSON_ID = /^u-[0-9a-f]{8}$/

/**
 * The weekly report's first list as the hub's `loops/stale` entry (status hub
 * design 0.3 §12 loops row; the section title of loops §17 M7 item 8): the
 * headline as the text, one line per entry as the detail, and the one line
 * that says how to propose the removal (design §17 M7 item 8). No entry when
 * the list is empty, so the report omits the section.
 */
export function staleItems(entries: readonly StaleEntry[], source: string, nowMs: number): readonly StatusItem[] {
  if (entries.length === 0) return []
  const detail = entries.map((entry) => {
    const runs = entry.why === 'never-triggered'
      ? '最近 28 天一次都没触发过'
      : `最近 28 天跑过 ${entry.runs28d} 次，都没有结果`
    const last = entry.lastResultAt === undefined ? '' : `；上一次有结果是 ${momentText(entry.lastResultAt)}`
    return oneLine(`- 「${entry.title}」：${momentText(entry.addedAt)} 加的，${runs}${last}`, STATUS_TEXT_MAX)
  })
  detail.push(`Propose removing them in one proposal: loop_propose {kind: "delete", entries: [${entries.map(entry => `"${entry.id}"`).join(', ')}]}, then propose_to_human.`)
  return [{
    id: 'loops/stale',
    owner: 'loops',
    audience: 'agent',
    asOf: new Date(nowMs).toISOString(),
    source,
    text: `4 周没跑出过结果的、你加的循环板条目 ${entries.length} 件`,
    detail,
    fields: { entries: entries.length },
  }]
}

/**
 * The weekly report's second list as the hub's `loops/timeouts` entry: a
 * plugin's entry says who is to fix it; a person's entry rides the section's
 * one line that says how to propose the fix (design §17 M7 item 8).
 */
export function timeoutItems(entries: readonly TimeoutEntry[], source: string, nowMs: number): readonly StatusItem[] {
  if (entries.length === 0) return []
  const detail = entries.map((entry) => {
    const who = PERSON_ID.test(entry.id) ? '' : '；请插件的作者修'
    return oneLine(`- 「${entry.title}」：最近 7 天没跑完 ${entry.timeouts7d} 次，最近一次 ${momentText(entry.lastTimeoutAt)}${who}`, STATUS_TEXT_MAX)
  })
  if (entries.some(entry => PERSON_ID.test(entry.id))) {
    detail.push('Propose fixing the script (dispatch a subagent, then loop_propose kind "edit").')
  }
  return [{
    id: 'loops/timeouts',
    owner: 'loops',
    audience: 'agent',
    asOf: new Date(nowMs).toISOString(),
    source,
    text: `最近 7 天反复超时的循环板条目 ${entries.length} 件`,
    detail,
    fields: { entries: entries.length, timeouts: entries.reduce((sum, entry) => sum + entry.timeouts7d, 0) },
  }]
}
