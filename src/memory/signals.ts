/**
 * The learning signals (M5 design §3.6 step 1): what the harness can see of
 * the person correcting the agent, as events under group keys. Pure: it
 * reads the node histories the graph engine wrote and the writes of the
 * `reporting-depth` memory, and nothing else (no clock, no files, no git).
 *
 * | event | key |
 * | --- | --- |
 * | the person changed a field the agent had written | `edit:<node type>.<field>` |
 * | the person rejected a proposal | `reject:<node type>` |
 * | the person said no to, or added to, a proposal in the chat | `chat:reject`, `chat:add` |
 * | the person reopened a finished node | `reopen:<node type>` |
 * | the reporting depth moved | `depth:up`, `depth:down` |
 *
 * Which entries count as the person's: the history writes `human`, and
 * those of `llm` that carry `relay`, the person's words relayed by the main
 * agent (the engine gives such a write the person's authority). A comment
 * carries no `relay` (the engine drops it), so a reply in the chat is
 * recognised by the words it opens with (src/shared/answer-marks.ts). An
 * entry whose reason opens with the words of agreement is the person saying
 * yes to a proposal, not correcting one, and counts for nothing.
 *
 * The sixth signal of the design, commits outside the gate that touch what
 * an agent just merged, needs the task trailers M7 will write; no caller can
 * give them yet, so it is not here.
 */
import type { GraphNode, HistoryEntry } from '../graph/schema.ts'
import { answerKindOf } from '../shared/answer-marks.ts'
import type { ReportingDepth } from '../shared/memory-service.ts'

const WEEK_MS = 7 * 86_400_000

/** How many weeks `weekly` counts. */
const WEEKLY_WEEKS = 4

/** One correction: when it was made, the group it belongs to, and where it can be looked up (`<node>#<history index>` or `memory:<seq>`). */
export interface SignalEvent {
  readonly at: string
  readonly key: string
  readonly ref: string
}

export interface SignalGroup {
  readonly key: string
  readonly count: number
  /** The refs of the events, in time order. */
  readonly refs: readonly string[]
}

/** One write of the `reporting-depth` memory. */
export interface DepthWrite {
  readonly at: string
  readonly seq: number
  readonly value: ReportingDepth
}

/** A place a group was settled: the entry, lesson, note or habit question that names its key, and when it first did. `until` bounds the landing: a habit question lands only while the question is fresh or the person's no still blocks (§3.8.4). */
export interface Landing {
  readonly key: string
  readonly at: string
  readonly until?: string
}

interface SignalInput {
  readonly nodes: Iterable<GraphNode>
  readonly depthWrites: readonly DepthWrite[]
  /** Events from this moment on (included). */
  readonly since: string
  /** Events before this moment (the moment itself is not included). */
  readonly until: string
}

const DEPTH_RANK: Readonly<Record<ReportingDepth, number>> = { concise: 0, balanced: 1, detailed: 2 }

/** Written by the person: by `human`, or by `llm` quoting the person's words. */
const byPerson = (entry: HistoryEntry): boolean => entry.actor === 'human' || (entry.actor === 'llm' && entry.relay !== undefined)

/**
 * The history entry that last wrote `field` before the entry at `index`: the
 * latest earlier edit that changed it, else the proposal that created the
 * node when the field had a value (`from` is not null) and no edit touched
 * it since. Undefined when the field had no value and nobody wrote it.
 */
function writerBefore(node: GraphNode, index: number, field: string, from: unknown): HistoryEntry | undefined {
  const earlier = node.history.slice(0, index)
  for (const entry of earlier.reverse()) {
    if (entry.changes !== undefined && Object.hasOwn(entry.changes, field)) return entry
  }
  return from === null ? undefined : node.history.find(entry => entry.op === 'propose')
}

/** Whether the agent wrote what the entry at `index` changed in `field`: its last writer was `llm` or `harness` and quoted nobody. */
function agentWrote(node: GraphNode, index: number, field: string, from: unknown): boolean {
  const writer = writerBefore(node, index, field, from)
  return writer !== undefined && (writer.actor === 'llm' || writer.actor === 'harness') && writer.relay === undefined
}

function eventsOfNode(node: GraphNode): SignalEvent[] {
  const events: SignalEvent[] = []
  for (const [index, entry] of node.history.entries()) {
    const ref = `${node.id}#${index}`
    const answer = answerKindOf(entry)
    if (entry.op === 'comment') {
      if (entry.actor === 'llm' && answer !== undefined) events.push({ at: entry.at, key: `chat:${answer}`, ref })
      continue
    }
    if (!byPerson(entry) || answer === 'agree') continue
    if (entry.op === 'reject') events.push({ at: entry.at, key: `reject:${node.type}`, ref })
    else if (entry.op === 'status' && entry.from === 'done' && entry.to === 'doing') events.push({ at: entry.at, key: `reopen:${node.type}`, ref })
    else if (entry.op === 'edit') {
      for (const [field, change] of Object.entries(entry.changes ?? {})) {
        if (change !== undefined && agentWrote(node, index, field, change.from)) events.push({ at: entry.at, key: `edit:${node.type}.${field}`, ref })
      }
    }
  }
  return events
}

/** A step of the reporting depth is a signal: the value of one write against the write before it. */
function eventsOfDepth(writes: readonly DepthWrite[]): SignalEvent[] {
  const ordered = [...writes].sort((a, b) => a.seq - b.seq)
  return ordered.flatMap((write, index) => {
    const before = index === 0 ? undefined : ordered[index - 1]
    if (before === undefined || before.value === write.value) return []
    return [{ at: write.at, key: DEPTH_RANK[write.value] > DEPTH_RANK[before.value] ? 'depth:up' : 'depth:down', ref: `memory:${write.seq}` }]
  })
}

const inWindow = (at: string, since: string, until: string): boolean => Date.parse(at) >= Date.parse(since) && Date.parse(at) < Date.parse(until)

/** Code unit order, the same in every locale. */
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0

/** The events of a window grouped by key: the largest group first, ties by key. */
export function groupEvents(events: readonly SignalEvent[]): SignalGroup[] {
  const refs = new Map<string, string[]>()
  for (const event of events) refs.set(event.key, [...refs.get(event.key) ?? [], event.ref])
  return [...refs.entries()]
    .map(([key, list]) => ({ key, count: list.length, refs: list }))
    .sort((a, b) => b.count - a.count || compare(a.key, b.key))
}

/**
 * The corrections between `since` and `until`, in time order, and their
 * groups. The same input gives the same output.
 */
export function correctionSignals(input: SignalInput): { readonly events: readonly SignalEvent[], readonly groups: readonly SignalGroup[] } {
  const all = [...input.nodes].flatMap(eventsOfNode).concat(eventsOfDepth(input.depthWrites))
  const events = all
    .filter(event => inWindow(event.at, input.since, input.until))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || compare(a.ref, b.ref) || compare(a.key, b.key))
  return { events, groups: groupEvents(events) }
}

/** For each key that has a landing: the events after its earliest landing (an event at the moment of the landing is before it). */
export function recurrences(events: readonly SignalEvent[], landings: readonly Landing[]): ReadonlyMap<string, number> {
  const earliest = new Map<string, number>()
  for (const landing of landings) earliest.set(landing.key, Math.min(earliest.get(landing.key) ?? Infinity, Date.parse(landing.at)))
  const counts = new Map<string, number>([...earliest.keys()].map(key => [key, 0]))
  for (const event of events) {
    const landed = earliest.get(event.key)
    if (landed !== undefined && Date.parse(event.at) > landed) counts.set(event.key, (counts.get(event.key) ?? 0) + 1)
  }
  return counts
}

/** The events of `key` in each of the last four weeks before `until`, the oldest week first (only the direction of travel is read, docs/CHARTER.md §8). */
export function weeklyCounts(events: readonly SignalEvent[], key: string, until: string): number[] {
  const counts = new Array<number>(WEEKLY_WEEKS).fill(0)
  for (const event of events) {
    const age = Date.parse(until) - Date.parse(event.at)
    if (event.key === key && age > 0 && age <= WEEKLY_WEEKS * WEEK_MS) counts[WEEKLY_WEEKS - Math.ceil(age / WEEK_MS)] += 1
  }
  return counts
}
