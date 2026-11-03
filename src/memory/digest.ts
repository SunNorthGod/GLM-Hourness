/**
 * Reading what the learning digest is made of (M5 design §3.6): the project
 * graph, the two memory journals and the project's lessons journal. A source
 * that cannot be read leaves its part out and is named in `notes` and in the
 * row health of the session (a graph that cannot be read also reads as
 * `graph: 'unavailable'`, as does a session that has none); nothing here
 * writes. The turning of what is read into groups is src/memory/learning.ts
 * and src/memory/signals.ts.
 */
import { readJournal, type Fold } from '../data/journal.ts'
import { journalFile as lessonsFile } from '../lessons/storage.ts'
import { habitLandings, habitMarkers } from './habit.ts'
import { buildDigest, depthWritesOf, eventsFrom, lessonLandings, LESSONS_COLLECTED, MEMORY_COLLECTED, memoryLandings, noteLandings, windowOf, type Collected, type DigestOptions, type LearningDigest } from './learning.ts'
import { correctionSignals } from './signals.ts'
import { journalFile, type MemoryEnv } from './storage.ts'
import type { SessionLike } from '../shared/dsh-min.ts'

async function collected<State>(path: string | undefined, fold: Fold<Collected<State>>, label: string, notes: string[]): Promise<Collected<State> | undefined> {
  if (path === undefined) return undefined
  try {
    return (await readJournal(path, fold)).state
  }
  catch (error) {
    notes.push(`the ${label} could not be read, so what it settles is not counted: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

/** The digest of a session's project: the groups of corrections in the window and where each is settled. */
export async function readDigest(env: MemoryEnv, session: SessionLike | undefined, options: DigestOptions = {}): Promise<LearningDigest> {
  const places = env.places(session)
  const { since, until, minCount } = windowOf(options, env.now())
  const notes: string[] = []
  const graph = await env.graph(session)
  if (!graph.ok && graph.failure !== undefined) notes.push(`the project graph could not be read, so the corrections made on it are not counted: ${graph.failure}`)
  const [project, user, lessons] = [
    await collected(places.project === undefined ? undefined : journalFile(places.project), MEMORY_COLLECTED.project, 'project memory journal', notes),
    await collected(places.user === undefined ? undefined : journalFile(places.user), MEMORY_COLLECTED.all, 'user-level memory journal', notes),
    await collected(places.project === undefined ? undefined : lessonsFile(places.project), LESSONS_COLLECTED, 'lessons journal', notes),
  ]
  const { events } = correctionSignals({
    nodes: graph.ok ? graph.nodes.values() : [],
    depthWrites: user === undefined ? [] : depthWritesOf(user),
    since: eventsFrom(since, until),
    until,
  })
  const landings = [
    ...project === undefined ? [] : memoryLandings(project),
    ...user === undefined ? [] : memoryLandings(user),
    ...project === undefined ? [] : habitLandings(project.state),
    ...user === undefined ? [] : habitLandings(user.state),
    ...lessons === undefined ? [] : lessonLandings(lessons),
    ...graph.ok ? noteLandings(graph.nodes.values()) : [],
  ]
  const habits = [
    ...project === undefined ? [] : habitMarkers(project.state),
    ...user === undefined ? [] : habitMarkers(user.state),
  ]
  const digest = buildDigest({ events, landings, habits, since, until, minCount, graph: graph.ok ? 'ok' : 'unavailable' })
  env.note(session?.id, 'learning', notes.length === 0 ? undefined : `学习摘要的来源没读全：${notes.join('；')}`)
  return notes.length === 0 ? digest : { ...digest, notes }
}
