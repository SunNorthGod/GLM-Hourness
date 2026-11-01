/**
 * The service the memory row provides (`glmHournessMemory`, M5 design §3.7,
 * §4.9, §8.6): `depth` for the GLM dialect (its contract is
 * src/shared/memory-service.ts), and `stats` and `hygiene` for the weekly
 * report and the inspection, which read the journals only.
 *
 * `depth` is synchronous because the dialect asks while it assembles the
 * system prompt. The first time a session asks it reads the user-level
 * journal synchronously (a `stat`, and a whole read only when the file
 * changed) and keeps the answer for the rest of the session, so the system
 * prompt of a session does not change when the person later says how long
 * reports should be. The cache holds 500 sessions, the oldest leaving first.
 */
import { parseRef } from '../data/evidence.ts'
import { readJournal, readJournalSync, type Fold } from '../data/journal.ts'
import type { SessionLike } from '../shared/dsh-min.ts'
import type { MemoryService, ReportingDepth } from '../shared/memory-service.ts'
import { applyRecord, emptyMemory, memoryFold, strength, type MemoryState, type Scope } from './model.ts'
import { journalFile, readBoth, type MemoryEnv } from './storage.ts'

const DEPTH_ENTRY = 'reporting-depth'
const SESSIONS_KEPT = 500
const DAY_MS = 86_400_000

/** What a period added to the memory and took out of it, both scopes together. */
interface MemoryStats {
  readonly preferencesAdded: number
  readonly factsAdded: number
  readonly forgotten: number
  readonly reportingDepthChanges: number
}

/** One thing the inspection should look at. */
interface HygieneFinding {
  readonly kind: 'bad-lines' | 'legacy' | 'faded' | 'source-missing' | 'source-dead'
  readonly name?: string
  readonly detail: string
}

export interface MemoryRowService extends MemoryService {
  /** What was written between `since` (included) and `until` (not included), ISO moments. */
  stats(session: SessionLike | undefined, since: string, until: string): Promise<MemoryStats>
  /** What the inspection should look at, at `now` (ISO). */
  hygiene(session: SessionLike | undefined, now: string): Promise<readonly HygieneFinding[]>
}

interface Counting {
  readonly memory: MemoryState
  readonly counts: MemoryStats
}

const NO_COUNTS: MemoryStats = { preferencesAdded: 0, factsAdded: 0, forgotten: 0, reportingDepthChanges: 0 }

/** The memory fold that also counts what the records inside a period did. */
function countingFold(scope: Scope, since: number, until: number): Fold<Counting> {
  return {
    empty: () => ({ memory: emptyMemory(scope), counts: NO_COUNTS }),
    apply(state, record) {
      const step = applyRecord(state.memory, record)
      if ('bad' in step) return step
      const at = Date.parse(record.at)
      if (at < since || at >= until || (record.op !== 'store' && record.op !== 'forget')) return { state: { memory: step.state, counts: state.counts } }
      const name = record.id.slice(scope.length + 1)
      const before = state.memory.entries.get(name)
      const after = step.state.entries.get(name)
      const { counts } = state
      if (record.op === 'forget') return { state: { memory: step.state, counts: { ...counts, forgotten: counts.forgotten + 1 } } }
      const fresh = before?.status !== 'active'
      return {
        state: {
          memory: step.state,
          counts: {
            ...counts,
            preferencesAdded: counts.preferencesAdded + (fresh && after?.kind === 'preference' ? 1 : 0),
            factsAdded: counts.factsAdded + (fresh && after?.kind === 'fact' ? 1 : 0),
            reportingDepthChanges: counts.reportingDepthChanges + (name === DEPTH_ENTRY ? 1 : 0),
          },
        },
      }
    },
  }
}

/**
 * The service over the row's environment; `problem` hears a failure to read
 * the reporting depth (the console), and the row health of the session that
 * asked says it too (the session keeps the configured depth).
 */
export function memoryRowService(env: MemoryEnv, problem: (message: string) => void): MemoryRowService {
  const depths = new Map<string, ReportingDepth | undefined>()

  function readDepth(sessionId: string): ReportingDepth | undefined {
    const dir = env.places(undefined).user
    if (dir === undefined) return undefined
    try {
      const entry = readJournalSync(journalFile(dir), memoryFold('all')).state.entries.get(DEPTH_ENTRY)
      return entry?.status === 'active' ? entry.value : undefined
    }
    catch (error) {
      const text = `读不出汇报细度（${error instanceof Error ? error.message : String(error)}），这个会话用配置的默认档`
      problem(text)
      env.note(sessionId, 'depth', text)
      return undefined
    }
  }

  return {
    depth(sessionId) {
      if (depths.has(sessionId)) return depths.get(sessionId)
      const value = readDepth(sessionId)
      depths.set(sessionId, value)
      if (depths.size > SESSIONS_KEPT) depths.delete(depths.keys().next().value as string)
      return value
    },

    async stats(session, since, until) {
      const places = env.places(session)
      const from = Date.parse(since)
      const to = Date.parse(until)
      const read = async (scope: Scope, dir: string | undefined): Promise<MemoryStats> => {
        if (dir === undefined) return NO_COUNTS
        try {
          return (await readJournal(journalFile(dir), countingFold(scope, from, to))).state.counts
        }
        catch {
          return NO_COUNTS
        }
      }
      const [project, user] = [await read('project', places.project), await read('all', places.user)]
      return {
        preferencesAdded: project.preferencesAdded + user.preferencesAdded,
        factsAdded: project.factsAdded + user.factsAdded,
        forgotten: project.forgotten + user.forgotten,
        reportingDepthChanges: project.reportingDepthChanges + user.reportingDepthChanges,
      }
    },

    async hygiene(session, now) {
      const places = env.places(session)
      const both = await readBoth(places)
      const findings: HygieneFinding[] = []
      for (const [label, outcome] of [['project', both.project], ['user-level', both.user]] as const) {
        if (outcome?.ok === true && outcome.read.bad > 0) findings.push({ kind: 'bad-lines', detail: `${outcome.read.bad} line(s) of the ${label} memory journal cannot be read` })
      }
      if (both.project?.ok !== true) return findings
      const check = await env.sources(session)
      for (const entry of both.project.read.state.entries.values()) {
        if (entry.status !== 'active') continue
        if (entry.legacy === true) findings.push({ kind: 'legacy', name: entry.name, detail: 'migrated from the old memory.json and has no source' })
        if (entry.kind === 'fact' && strength(entry, now) < 0.1 && Date.parse(now) - Date.parse(entry.lastReviewed) > 30 * DAY_MS) {
          findings.push({ kind: 'faded', name: entry.name, detail: 'a fact that has faded below 0.1 for more than 30 days' })
        }
        if (entry.type !== 'project') continue
        const states = entry.source.map((source) => {
          const ref = parseRef(source)
          return 'invalid' in ref ? 'ok' : check.inspect(ref)
        })
        if (states.includes('missing')) findings.push({ kind: 'source-missing', name: entry.name, detail: `a source is not there any more: ${entry.source.join('; ')}` })
        else if (states.includes('dead')) findings.push({ kind: 'source-dead', name: entry.name, detail: `a source node was dropped or superseded: ${entry.source.join('; ')}` })
      }
      return findings
    },
  }
}
