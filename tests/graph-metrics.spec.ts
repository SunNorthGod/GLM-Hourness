/**
 * The graph engine's observer and its metric events (metrics design §6.3,
 * acceptance 3, §11 item 14): every successful `apply` appends one `graph`
 * event per changed node's history entry — node, type, op, history index,
 * revision, actor, relay, the statuses before and after — and every failed
 * one exactly one `graph-fail` with the code, one per failure code. The
 * notes map through `engineEventsOf`; the row and the command line record
 * them for the project the graph directory belongs to. A throwing observer
 * never takes a write down, and the observer set is one per module.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { readLog } from '../src/metrics/read.ts'
import { setEngineObserver, type EngineNote } from '../src/graph/engine.ts'
import { engineEventsOf } from '../src/graph/metrics-events.ts'
import { loadGraph } from '../src/graph/store.ts'
import type { EmittedEvent, HostBodies } from '../src/shared/metrics.ts'
import { engineFixture, fixtureTest, type EngineFixture } from './graph-helpers.ts'
import { scratchGitProject } from './metrics-helpers.ts'
import { runCli } from '../src/graph/cli.ts'
import { rmSync } from 'node:fs'

type GraphEvent = HostBodies['graph']

/** Subscribe a recorder for the duration of `body`; the notes as they came, and their mapped events. */
async function recorded<T>(body: (events: readonly EmittedEvent[], notes: readonly EngineNote[]) => Promise<T>): Promise<T> {
  const events: EmittedEvent[] = []
  const notes: EngineNote[] = []
  const stop = setEngineObserver(note => {
    notes.push(note)
    events.push(...engineEventsOf(note))
  })
  try {
    return await body(events, notes)
  }
  finally {
    stop()
  }
}

const seedGoal = async ({ run, node }: EngineFixture): Promise<void> => {
  await run('human', { op: 'propose', reason: 'seed', node: { type: 'goal', title: '探针目标' } })
  if ((await node('goal-1')).status === 'proposed') await run('human', { op: 'status', id: 'goal-1', to: 'approved', reason: 'seed' })
}

const graphEvents = (events: readonly EmittedEvent[]): readonly GraphEvent[] => events.filter((event): event is { k: 'graph', by: 'graph', body: GraphEvent } => event.k === 'graph').map(event => event.body)

const withGraph = fixtureTest(() => engineFixture('glm-graph-metrics-', 4, async () => {}))

withGraph('one comment is exactly one graph event, with the entry its node last appended (acceptance 3)', async g => {
  await seedGoal(g)
  const history = (await g.node('goal-1')).history.length
  const events = await recorded(async events => {
    await g.run('human', { op: 'comment', id: 'goal-1', text: '看一眼' })
    return events
  })
  const graphs = graphEvents(events)
  assert.equal(graphs.length, 1)
  const body = graphs[0]
  assert.deepEqual(
    { node: body.node, type: body.type, op: body.op, actor: body.actor, relay: body.relay, src: (body as GraphEvent & { src?: string }).src },
    { node: 'goal-1', type: 'goal', op: 'comment', actor: 'human', relay: undefined, src: undefined },
  )
  assert.equal(body.hi, history, 'the history index the entry took')
  assert.equal(body.rev, (await loadGraph(g.dir)).revisions.get('goal-1')!, 'the node revision after the write')
})

withGraph('a write that changes several nodes hands one event per node, each with that node\'s entry (acceptance 3)', async g => {
  await seedGoal(g)
  await g.run('human', { op: 'propose', reason: 'v2', node: { type: 'goal', title: 'v2' } })
  const events = await recorded(async events => {
    await g.act('human', { op: 'supersede', id: 'goal-1', by: 'goal-2', reason: 'v2' })
    return events
  })
  const graphs = graphEvents(events)
  assert.deepEqual(graphs.map(body => body.node).sort(), ['goal-1', 'goal-2'])
  for (const body of graphs) {
    const history = (await g.node(body.node)).history
    assert.equal(body.op, history.at(-1)?.op)
    assert.equal(body.hi, history.length - 1)
  }
})

withGraph('an llm write with the human\'s words marks the graph event relayed', async g => {
  await seedGoal(g)
  const events = await recorded(async events => {
    await g.act('llm', { op: 'edit', id: 'goal-1', set: { title: '改名' }, relay: '帮我看一眼', reason: '照人的话改' })
    return events
  })
  const graphs = graphEvents(events)
  assert.equal(graphs.length, 1)
  assert.equal(graphs[0]?.relay, true)
  assert.equal(graphs[0]?.actor, 'llm')
})

withGraph('each failure code is exactly one graph-fail (acceptance 3, F23)', async g => {
  await seedGoal(g)
  await g.run('human', { op: 'propose', reason: 'seed', node: { type: 'task', parent: 'goal-1', title: '任务' } })
  await g.act('human', { op: 'status', id: 'task-1', to: 'doing', reason: 'start' })

  const cases: readonly { readonly code: string, readonly apply: (g: EngineFixture) => Promise<unknown> }[] = [
    { code: 'invalid', apply: g => g.engine.apply('human', { op: 'edit', id: 'goal-1', reason: 'x', set: { nope: 1 } }) },
    { code: 'forbidden', apply: g => g.engine.apply('llm', { op: 'approve', id: 'goal-1', rev: '000000000000', reason: 'x' }) },
    { code: 'not_found', apply: g => g.engine.apply('human', { op: 'edit', id: 'missing', rev: '000000000000', reason: 'x', set: { title: 'x' } }) },
    { code: 'bad_transition', apply: g => g.act('human', { op: 'status', id: 'task-1', to: 'approved', reason: 'x' }) },
    { code: 'stale_revision', apply: g => g.engine.apply('human', { op: 'edit', id: 'goal-1', rev: '000000000000', reason: 'x', set: { title: 'x' } }) },
    { code: 'conflict', apply: g => g.engine.apply('human', { op: 'propose', node: { type: 'goal', id: 'goal-1', title: 'dup' }, reason: 'x' }) },
    { code: 'evidence_required', apply: g => g.act('human', { op: 'status', id: 'task-1', to: 'done', reason: 'x' }) },
  ]
  const seen: string[] = []
  for (const { code, apply } of cases) {
    const events = await recorded(async events => {
      const result = await apply(g)
      assert.equal(result.ok, false, `${code} refuses`)
      return events
    })
    const fails = events.filter(event => event.k === 'graph-fail')
    assert.equal(fails.length, 1, `${code} is one graph-fail`)
    assert.equal((fails[0]?.body as { err?: string }).err, code)
    seen.push(code)
  }
  // graph_invalid last: the broken node file stays broken.
  const events = await recorded(async events => {
    await writeFile(join(g.dir, 'nodes', 'goal-1.json'), '{"id":"goal-1"}', 'utf8')
    const result = await g.engine.apply('human', { op: 'comment', id: 'goal-1', text: 'x' })
    assert.equal(result.ok, false)
    return events
  })
  const fails = events.filter(event => event.k === 'graph-fail')
  assert.equal(fails.length, 1)
  assert.equal((fails[0]?.body as { err?: string }).err, 'graph_invalid')
  assert.deepEqual([...seen, 'graph_invalid'].sort(), ['bad_transition', 'conflict', 'evidence_required', 'forbidden', 'graph_invalid', 'invalid', 'not_found', 'stale_revision'])
})

withGraph('a failed apply names the op and node the request carried, and the field the error is about', async g => {
  await seedGoal(g)
  const events = await recorded(async events => {
    const result = await g.engine.apply('human', { op: 'edit', id: 'missing', rev: '000000000000', reason: 'x', set: { title: 'x' } })
    assert.equal(result.ok, false)
    return events
  })
  const fail = events.find(event => event.k === 'graph-fail')
  assert.deepEqual(fail?.body, { actor: 'human', err: 'not_found', op: 'edit', node: 'missing', field: 'id' })
})

withGraph('an observer that throws never takes a write down (§6.3)', async g => {
  await seedGoal(g)
  const seen: EngineNote[] = []
  const stopThrown = setEngineObserver(() => { throw new Error('observer bug') })
  const stopSeen = setEngineObserver(note => { seen.push(note) })
  try {
    const result = await g.run('human', { op: 'comment', id: 'goal-1', text: 'x' })
    assert.equal(result.ok, true)
    assert.equal(seen.length, 1)
  }
  finally {
    stopThrown()
    stopSeen()
  }
})

test('the observer set is one per module (§11 item 14)', async () => {
  const second = await import('../src/graph/engine.ts')
  assert.equal(second.setEngineObserver, setEngineObserver, 'the same module instance, so the same set')
})

test('the mapping carries only the fields the note holds', () => {
  assert.deepEqual(engineEventsOf({ kind: 'failed', dir: 'C:/ws/docs/graph', actor: 'llm', err: 'forbidden' }), [
    { k: 'graph-fail', by: 'graph', body: { actor: 'llm', err: 'forbidden' } },
  ])
  assert.deepEqual(engineEventsOf({ kind: 'failed', dir: 'C:/ws/docs/graph', actor: 'human', err: 'invalid', op: 'comment', node: 'goal-1', field: 'text' }), [
    { k: 'graph-fail', by: 'graph', body: { actor: 'human', err: 'invalid', op: 'comment', node: 'goal-1', field: 'text' } },
  ])
})

test('writeNodes is called only in the engine\'s commit, immediately followed by the notify (acceptance 3)', () => {
  const engine = readFileSync(join(import.meta.dirname, '..', 'src', 'graph', 'engine.ts'), 'utf8')
  const store = readFileSync(join(import.meta.dirname, '..', 'src', 'graph', 'store.ts'), 'utf8')
  assert.match(store, /export async function writeNodes/, 'the store owns the write')
  assert.ok(!store.includes('notify('), 'the store knows no observers')
  const calls = [...engine.matchAll(/writeNodes\(/g)]
  assert.equal(calls.length, 1, 'the one call in commit')
  const call = calls[0]
  assert.ok(engine.slice(call.index ?? 0, (call.index ?? 0) + 1200).includes('notify({'), 'the observer hears every successful write')
})

withGraph('the command line keeps its own writer: the graph event lands in the project journal (§6.3)', async g => {
  await seedGoal(g)
  const root = scratchGitProject('graph-metrics-cli-')
  try {
    // The fixture's graph is inside a plain temp dir; copy it into the git project so `projectOf` resolves it.
    const { cpSync } = await import('node:fs')
    const graphDir = join(root, 'docs', 'graph')
    cpSync(g.dir, graphDir, { recursive: true })
    const result = await runCli(['comment', JSON.stringify({ op: 'comment', id: 'goal-1', text: 'x' })], { dir: graphDir, stdin: () => Promise.resolve('') })
    assert.equal(result.exitCode, 0, result.text)
    const { events } = await readLog(root)
    const graphs = events.filter(event => event.k === 'graph')
    assert.equal(graphs.length, 1)
    assert.equal(graphs[0]?.body.op, 'comment')
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})
