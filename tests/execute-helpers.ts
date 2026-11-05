/**
 * Graph fixtures of the M7 execution specs: nodes built straight into a
 * loaded graph (the engine is not needed for pure functions), the two-module
 * goal the module cases run on, and a gate context that is free by default.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openEngine } from '../src/graph/engine.ts'
import { claimHolder, holderFileOf, type HolderRecord } from '../src/graph/main-agent-holder.ts'
import { MODULE_READERS, releaseOf, type ModuleReaders } from '../src/graph/execute-stage.ts'
import type { LoadedGraph } from '../src/graph/parse.ts'
import type { Actor, GraphNode, HistoryEntry, Stage, Status } from '../src/graph/schema.ts'
import type { BriefContext, GateResult } from '../src/execute/brief.ts'
import type { GraphCache } from '../src/execute/dispatch.ts'
import { createLoopLink, stopDraftAction, type LoopEmit } from '../src/execute/loop-link.ts'
import type { ServiceLookup, UserNotice } from '../src/shared/dsh-min.ts'

export type Fields = Omit<Partial<GraphNode>, 'history'> & Pick<GraphNode, 'id' | 'type'>

/** A throwaway git repository with README.md committed, the way the tool specs seed one. */
export function gitSeed(root: string): void {
  const inRoot = (args: readonly string[]): boolean => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8' }).status === 0
  writeFileSync(join(root, 'README.md'), 'probe workspace\n')
  if (!inRoot(['init', '-q', '-b', 'main']) || !inRoot(['add', 'README.md']) || !inRoot(['commit', '-q', '-m', 'seed'])) throw new Error('git seed failed')
}

/** Seed a released goal over one task, the way the execution specs start; `task` carries the task's own fields. */
export async function seedGoalTask(graphDir: string, task: Record<string, unknown>): Promise<void> {
  const engine = openEngine(graphDir)
  for (const seed of [
    { type: 'goal', id: 'goal-1', title: 'Static blog', stage: 'release', acceptance: ['the blog builds'] },
    { type: 'task', id: 'task-1', parent: 'goal-1', kind: 'implement', ...task },
  ]) {
    const seeded = await engine.apply('human', { op: 'propose', reason: 'test seed', node: seed })
    if (!seeded.ok) throw new Error(`seeding ${String(seed.id)} failed: ${JSON.stringify(seeded.error)}`)
  }
}

/** The holder record and the agent registry the notices go through; sent notices are captured. `extra` adds services by name. */
export function noticeHost(project: { readonly root: string, readonly graphDir: string }, extra: Record<string, unknown> = {}): { readonly lookup: ServiceLookup, readonly sent: UserNotice[] } {
  const home = join(project.root, 'dsh-home')
  mkdirSync(home, { recursive: true })
  const record: HolderRecord = { version: 1, sessionId: 'main-1', graphDir: project.graphDir, since: '2026-11-04T08:00:00.000Z', commandId: 'cmd-1' }
  claimHolder(holderFileOf(home, project.graphDir), record)
  const sent: UserNotice[] = []
  const deliver = (notice: UserNotice): void => { sent.push(notice) }
  const mainAgent = { id: 'main-1', status: 'idle', followup: deliver, steer: deliver }
  const agents = { get: (id: string): unknown => id === 'main-1' ? mainAgent : undefined }
  const lookup: ServiceLookup = {
    get: (name: string) => name === 'agents' ? agents : name === 'glmHournessData' ? { userHome: home } : extra[name],
  }
  return { lookup, sent }
}

/**
 * The row's loop seam without a board, so its entries run in the fallback
 * executor, with the `execute.stop-draft` action: the stop notice reaches
 * the holder the way it does in the row. Every event handed over is kept in
 * `emitted`; only `hourness.stopped` goes on, so the tell-main notices of
 * the other events do not land between the facts a spec reads.
 */
export function stopSeam(lookup: ServiceLookup, cache: GraphCache, graphDir: string): { readonly emit: (project: string, sessionId: string | undefined, event: LoopEmit) => void, readonly emitted: LoopEmit[] } {
  const link = createLoopLink({
    lookup,
    execDir: root => join(root, '.llm', 'execute'),
    graphDirOfRoot: () => graphDir,
    cache,
    report: () => {},
    actions: { 'execute.stop-draft': stopDraftAction(cache, () => graphDir) },
    notesChanged: () => {},
  })
  const emitted: LoopEmit[] = []
  return {
    emitted,
    emit: (project, sessionId, event) => {
      emitted.push(event)
      if (event.event === 'hourness.stopped') link.emit(project, sessionId, event)
    },
  }
}

/** A history time: second `n` after 2026-10-30T08:00:00Z. */
export function at(n: number): string {
  return new Date(Date.UTC(2026, 9, 30, 8, 0, n)).toISOString()
}

function propose(actor: Actor, n: number, to: Status): HistoryEntry {
  return { at: at(n), actor, op: 'propose', reason: '测试', to }
}

/** A stage edit: the write that moves a module or goal between stages. */
export function stageEdit(n: number, from: Stage | null, to: Stage, extra: Partial<HistoryEntry> = {}): HistoryEntry {
  return { at: at(n), actor: 'llm', op: 'edit', reason: '测试', changes: { stage: { from, to } }, ...extra }
}

export function comment(n: number, text: string, actor: Actor = 'harness'): HistoryEntry {
  return { at: at(n), actor, op: 'comment', text }
}

/** A node proposed by `actor` at second `n`; `extra` history entries follow the propose. */
export function node(fields: Fields, n = 0, actor: Actor = 'llm', extra: readonly HistoryEntry[] = []): GraphNode {
  const status = fields.status ?? 'approved'
  return { title: fields.id, ...fields, status, history: [propose(actor, n, status), ...extra] }
}

export function graphOf(nodes: readonly GraphNode[], revision = 'rev0'): LoadedGraph {
  return { nodes: new Map(nodes.map(entry => [entry.id, entry])), revisions: new Map(nodes.map(entry => [entry.id, 'r'])), revision, issues: [] }
}

/** Replace a node of a graph, or add it when the graph has none of that id (new graph, same revision). */
export function withNode(graph: LoadedGraph, entry: GraphNode): LoadedGraph {
  const nodes = [...graph.nodes.values()]
  return graphOf(nodes.some(existing => existing.id === entry.id) ? nodes.map(existing => existing.id === entry.id ? entry : existing) : [...nodes, entry], graph.revision)
}

export const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')

/** Readers whose module lookup throws, the way a changed export would (R5-F3). */
export const throwingReaders: ModuleReaders = {
  ...MODULE_READERS,
  moduleOf: () => { throw new TypeError('moduleOf is not a function') },
}

/**
 * A goal split into modules A and B. A was released at second 10, B is still
 * in design. Tasks: `task-a1` (A), `task-b1` (B, approved so the release
 * row, not the status row, is what stops it), `task-top` (under the goal, no
 * module). B has a design decision `decision-b`; the framework has
 * `decision-fw`; the direction list exists.
 */
export function splitGraph(): LoadedGraph {
  const writeable = { kind: 'implement' as const, acceptance: ['it works'], worktree: true }
  return graphOf([
    node({ id: 'goal-1', type: 'goal', stage: 'release', acceptance: ['the goal'], nonGoals: ['no goal extras'] }, 0, 'human', [stageEdit(5, 'design', 'release')]),
    node({ id: 'decision-fw', type: 'decision', parent: 'goal-1', verification: 'unverified' }),
    node({ id: 'norm-directions', type: 'norm', parent: 'goal-1', acceptance: ['direction one', 'direction two'] }),
    node({ id: 'module-a', type: 'feature', parent: 'goal-1', stage: 'release', acceptance: ['module a works'] }, 1, 'llm', [stageEdit(10, 'design', 'release')]),
    node({ id: 'module-b', type: 'feature', parent: 'goal-1', stage: 'design', acceptance: ['module b works'] }, 2),
    node({ id: 'task-a1', type: 'task', parent: 'module-a', writeScope: ['src/a/'], ...writeable }, 3),
    node({ id: 'task-b1', type: 'task', parent: 'module-b', writeScope: ['src/b/'], ...writeable }, 4),
    node({ id: 'task-top', type: 'task', parent: 'goal-1', writeScope: ['src/top/'], ...writeable }, 6),
    node({ id: 'decision-b', type: 'decision', parent: 'module-b', verification: 'unverified' }, 7),
  ])
}

/** The design-review task the harness proposes under module B (§3.7.5). */
export function designReviewTask(overrides: Partial<GraphNode> = {}): GraphNode {
  return node({
    id: 'review-b', type: 'task', parent: 'module-b', kind: 'review', writeScope: [],
    acceptance: ['verdict APPROVED against every item of norm-directions and every acceptance item of the module'],
    edges: [{ type: 'source', to: 'decision-b' }], status: 'proposed', ...overrides,
  }, 8, 'harness')
}

/** A context in which nothing blocks: nothing running, three slots, released, no cap. */
export function freeContext(graph: LoadedGraph, target: GraphNode, args: Record<string, unknown> = {}, readers?: ModuleReaders): BriefContext {
  return {
    args: { id: target.id, model: 'example-model-large', why: 'touches one directory and has a check that can be run', ...args },
    running: [],
    slots: 3,
    release: releaseOf(graph, target, readers),
    stopped: false,
    outputSchemaOk: true,
    ...(readers === undefined ? {} : { readers }),
  }
}

/** The value, or a failure that names the missing piece of the fixture. */
export function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('the fixture has no such value')
  return value
}

/** A node of the graph by id. */
export function getNode(graph: LoadedGraph, id: string): GraphNode {
  return must(graph.nodes.get(id))
}

/** The refusal of a gate result that must be one. */
export function refusalOf(result: GateResult): { code: string, message: string, hint: string } {
  if (result.ok) throw new Error(`expected a refusal, the gate passed: ${JSON.stringify(result)}`)
  return result
}