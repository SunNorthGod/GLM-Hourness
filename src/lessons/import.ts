/**
 * Importing the candidates M7 wrote as notes on the graph (M5 design §4.2
 * step 2). When the lessons service is missing or answers with an error,
 * M7's handback processing writes each candidate as a comment on the task,
 * `[候选经验] <problem> … {json}`, by the harness. The lessons row reads those
 * comments once and keeps each as a candidate, so they get to the main agent
 * without waiting for a restart.
 *
 * Every comment is tried once: whatever becomes of it (kept as a candidate,
 * the same as a candidate that is open already, refused) is one `import`
 * record named after the comment, `<node>@<time>`. The candidate goes through
 * the checks of `propose`, secrets included, so a token that slipped into the
 * graph does not get into the lessons. The comment itself stays on the graph.
 *
 * When to look: the first time in a process for a project, then at most once
 * in 60 seconds, and then only if the graph's revision is not the one looked
 * at last; after a `propose` of this process failed, at once (the revision
 * still has to differ).
 */
import type { NewRecord } from '../data/journal.ts'
import { parseRef } from '../data/evidence.ts'
import { isObject } from '../data/refusal.ts'
import { graphService } from '../graph/service.ts'
import { loadGraph } from '../graph/store.ts'
import type { GraphNode } from '../graph/schema.ts'
import type { ServiceLookup, SessionLike } from '../shared/dsh-min.ts'
import { newId, openCandidates, proposeRecords, signature, type LessonsState } from './model.ts'
import { acceptCandidate } from './service.ts'
import { foldNew, noteWrite, readLessons, writeLessons, type LessonsEnv } from './storage.ts'

const PREFIX = '[候选经验]'
/** What M7 puts in place of a field that looked like a secret. */
const OMITTED = '（像密钥，已略去）'
const RECHECK_MS = 60_000
const MAX_PITFALL = 300

export interface Annotation {
  /** `<node>@<time>`: the name of the `import` record. */
  readonly key: string
  readonly node: string
  readonly at: string
  readonly text: string
}

/** The `[候选经验]` comments the harness wrote on the nodes of a graph. */
export function annotationsOf(nodes: ReadonlyMap<string, GraphNode>): Annotation[] {
  return [...nodes.values()].flatMap(node => node.history.flatMap(entry => (
    entry.op === 'comment' && entry.actor === 'harness' && entry.text?.startsWith(PREFIX) === true ? [{ key: `${node.id}@${entry.at}`, node: node.id, at: entry.at, text: entry.text }] : []
  )))
}

const withoutOmitted = (value: unknown): unknown => {
  if (value === OMITTED) return ''
  return Array.isArray(value) ? (value as unknown[]).filter(item => item !== OMITTED) : value
}

/**
 * The candidate a comment carries: the JSON object at its end, field by field
 * (M7's omitted fields count as empty); without one the whole sentence is the
 * pitfall, the fix points back at the comment, and the situation is empty, so
 * the candidate is refused as `invalid` like any other that names no situation.
 */
export function candidateOf(annotation: Annotation): Record<string, unknown> {
  const body = annotation.text.slice(PREFIX.length).trim()
  for (let start = body.indexOf('{'); start >= 0; start = body.indexOf('{', start + 1)) {
    try {
      const parsed: unknown = JSON.parse(body.slice(start))
      if (isObject(parsed)) return Object.fromEntries(Object.entries(parsed).map(([field, value]) => [field, withoutOmitted(value)]))
    }
    catch {
      // Not the JSON of the candidate; a later brace may start it.
    }
  }
  return { problem: body.length > MAX_PITFALL ? `${body.slice(0, MAX_PITFALL - 1)}…` : body, fix: `see the annotation on ${annotation.node}`, files: [], commands: [], tools: [], errors: [] }
}

/** The evidence of an imported candidate: the task, and the comment itself (the moment without fractions of a second). */
const evidenceOf = (annotation: Annotation): string[] => [`task:${annotation.node}`, `node:${annotation.node}@${annotation.at.replace(/\.\d+Z$/, 'Z')}`]
  .filter(item => !('invalid' in parseRef(item)))

/** The `import` record of a comment: what became of it. */
const importOf = (annotation: Annotation, by: NewRecord['by'], data: NonNullable<NewRecord['data']>): NewRecord => ({ actor: 'harness', ...(by === undefined ? {} : { by }), op: 'import', id: annotation.key, data })

/** The records one comment makes: a `propose` (and what follows from it) and the `import`, or the `import` of its refusal. */
function recordsOf(state: LessonsState, annotation: Annotation, env: LessonsEnv, by: NewRecord['by']): NewRecord[] {
  const accepted = acceptCandidate(candidateOf(annotation), tool => env.native(tool))
  if ('rejected' in accepted) {
    env.counters.rejected.set(accepted.rejected.code, (env.counters.rejected.get(accepted.rejected.code) ?? 0) + 1)
    return [importOf(annotation, by, { rejected: accepted.rejected.code })]
  }
  const wanted = signature(accepted.fields.situation, accepted.fields.pitfall)
  const open = openCandidates(state).find(candidate => candidate.signature === wanted)
  if (open !== undefined) return [importOf(annotation, by, { duplicateOf: open.id })]
  const id = newId('C', state, env.random)
  if (id === undefined) return [importOf(annotation, by, { rejected: 'invalid' })]
  return [...proposeRecords(state, accepted.fields, evidenceOf(annotation), by, id).records, importOf(annotation, by, { candidate: id })]
}

/** The records that import the comments `state` has not imported yet, one comment after the other. */
function importRecords(state: LessonsState, annotations: readonly Annotation[], env: LessonsEnv, at: string, session: string | undefined): NewRecord[] {
  const by = { ...(session === undefined ? {} : { session }), tool: 'import' }
  const records: NewRecord[] = []
  let current = state
  for (const annotation of annotations) {
    if (current.imports.has(annotation.key)) continue
    let kept = recordsOf(current, annotation, env, by)
    let next = foldNew(current, kept, at)
    if ('code' in next) {
      // A candidate that does not hold in the state: the comment is refused, so it is not tried again.
      kept = [importOf(annotation, by, { rejected: 'invalid' })]
      next = foldNew(current, kept, at)
    }
    if ('code' in next) continue
    records.push(...kept)
    current = next
  }
  return records
}
/** Looks at the graph for comments to import when it is time (see the top of the file). */
export interface Importer {
  run(session: SessionLike, dir: string): Promise<void>
}

export function createImporter(ctx: ServiceLookup, env: LessonsEnv): Importer {
  const looked = new Map<string, { readonly at: number, readonly revision: string | undefined }>()
  return {
    async run(session, dir) {
      const graphDir = graphService(ctx)?.dirFor(session.header.cwd)
      if (graphDir === undefined) return
      const now = env.now().getTime()
      const last = looked.get(dir)
      const failedBefore = env.counters.failed.delete(dir)
      if (last !== undefined && !failedBefore && now - last.at <= RECHECK_MS) return
      let graph
      try {
        graph = await loadGraph(graphDir)
      }
      catch (error) {
        looked.set(dir, { at: now, revision: last?.revision })
        env.note(session.id, 'import', `读不出项目图，没能导入图上的候选经验：${error instanceof Error ? error.message : String(error)}`)
        return
      }
      looked.set(dir, { at: now, revision: graph.revision })
      if (last?.revision === graph.revision) return
      const annotations = annotationsOf(graph.nodes)
      const read = await readLessons(dir)
      if (!read.ok) {
        env.note(session.id, 'import', `经验读不出，没能导入图上的候选经验：${read.reason}`)
        return
      }
      if (annotations.every(annotation => read.reading.state.imports.has(annotation.key))) {
        env.note(session.id, 'import', undefined)
        return
      }
      const written = await writeLessons<never>(dir, state => ({ records: importRecords(state, annotations, env, env.now().toISOString(), session.id) }), env.append)
      noteWrite(env, session.id, written)
      env.note(session.id, 'import', written.status === 'ok' ? undefined : '图上的候选经验没能导入，下一次再试')
      if (written.status !== 'ok') looked.set(dir, { at: now, revision: last?.revision })
    },
  }
}
