/**
 * The board's own clock (docs/ORCHESTRATION.md §18.9; loop board design 0.6
 * §6.2, §6.8): the time entries that run something — a script, a check or a
 * harness action at a time — have no DSH reminder (bind.ts makes those only
 * for `tell-main`, design §6.2's table); this clock times them. Every beat
 * the runner arms what it has not armed yet from now, fires what is due
 * through the same execution the inbox starts, and re-arms from now. A due
 * the host missed while it was down fires once, `late`, with the moment it
 * should have happened in the record (design §6.8: only one catch-up, then
 * the next one counts from now).
 *
 * The state remembers one due per entry with the digest of the trigger it was
 * armed from: an entry whose trigger changed re-arms from now, because the
 * old due was the old trigger's, not this one's. An entry that no longer
 * runs on the clock (deleted, unadopted, its trigger now an event) has its
 * due dropped. Nothing here throws; a due that cannot be read is re-armed.
 */
import { createHash } from 'node:crypto'
import type { RunnableEntry } from './inbox.ts'
import { canonicalJson } from '../rules/model.ts'
import { nextOccurrence, type Trigger } from './trigger.ts'

/** The time triggers the clock reads; cron is the schedule service's, event and command are the inbox's (design §6.2). */
const CLOCK_KINDS: ReadonlySet<Trigger['kind']> = new Set(['once', 'every', 'daily', 'weekly'])

/** The actions the board executes itself (design §6.2 table): a `tell-main` time entry is DSH's, a `self` one runs where it happens. */
const CLOCK_ACTIONS: ReadonlySet<string> = new Set(['script', 'check', 'harness'])

/** The entries the clock fires: a time trigger and an action the board runs (design §6.2). */
export function clockEntries(entries: readonly RunnableEntry[]): readonly RunnableEntry[] {
  return entries.filter(item => CLOCK_KINDS.has(item.entry.when.kind) && CLOCK_ACTIONS.has(item.entry.action.kind))
}

/** The digest of one trigger, so a changed trigger re-arms instead of firing on the old moment. */
export function whenDigest(when: Trigger): string {
  return createHash('sha256').update(canonicalJson(when)).digest('hex').slice(0, 12)
}

/** One armed due of one entry (design §6.8 `nextDue`), in the runtime state. */
export interface ArmedDue {
  /** ISO 8601: when the entry runs next. */
  readonly at: string
  /** The digest of the trigger this was armed from (whenDigest). */
  readonly digest: string
}

/** One due moment this beat fires. */
export interface ClockFire {
  readonly item: RunnableEntry
  /** ISO 8601: when this run should have happened (the envelope's and the record's `occurrenceAt`). */
  readonly occurrenceAt: string
  /** The host was down at the moment (design §6.8): one catch-up, marked late. */
  readonly late: boolean
}

/**
 * Arm what is not armed yet, drop what the clock no longer runs, and return
 * the dues that have come due. `due` is the state's map and is changed in
 * place (the state file writes the live object). A due the trigger has left
 * behind re-arms from now instead of firing. Firing and re-arming again are
 * the runner's: a fire it holds back (its previous run still going) keeps
 * its past due and is returned again next beat.
 */
export function armAndPick(
  due: Record<string, ArmedDue>,
  items: readonly RunnableEntry[],
  nowMs: number,
  zone: string,
  startedAtMs: number,
): readonly ClockFire[] {
  const onClock = new Set(items.map(item => item.entry.id))
  for (const id of Object.keys(due)) {
    if (!onClock.has(id)) delete due[id]
  }
  const fires: ClockFire[] = []
  for (const item of items) {
    const id = item.entry.id
    const digest = whenDigest(item.entry.when)
    const armed = due[id]
    if (armed === undefined || armed.digest !== digest || !Number.isFinite(Date.parse(armed.at))) {
      const moment = nextOccurrence(item.entry.when, new Date(nowMs), zone)
      if (moment === undefined) delete due[id]
      else due[id] = { at: moment.toISOString(), digest }
      continue
    }
    const dueMs = Date.parse(armed.at)
    if (dueMs > nowMs) continue
    fires.push({ item, occurrenceAt: armed.at, late: dueMs < startedAtMs })
  }
  return fires
}

/** Re-arm one fired entry from now (design §6.8: after a catch-up, the next one counts from now); a trigger with no next loses its due. */
export function rearm(due: Record<string, ArmedDue>, item: RunnableEntry, nowMs: number, zone: string): void {
  const digest = whenDigest(item.entry.when)
  const moment = nextOccurrence(item.entry.when, new Date(nowMs), zone)
  if (moment === undefined) delete due[item.entry.id]
  else due[item.entry.id] = { at: moment.toISOString(), digest }
}
