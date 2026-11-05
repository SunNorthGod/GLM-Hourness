/**
 * The dispatch status notice (M7 design 0.6 §3.5.4, E8 D4, D12): when it is
 * shown, the parts it lists, the batch split of §3.9.7, the model catalog,
 * and the digest rule of src/graph/digest-notice.ts (added once, again after
 * a compaction, not again while the stable text holds).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { pinsOf, renderPins } from '../src/graph/pins.ts'
import type { LoadedGraph } from '../src/graph/parse.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import { renderDispatchComment, type Attempt } from '../src/execute/attempts.ts'
import { sha256Hex } from '../src/execute/digest.ts'
import { dispatchNotice, installDispatchNotice, statusText, type StatusInput } from '../src/execute/notice.ts'
import type { PendingRequest } from '../src/execute/requests.ts'
import type { DerivedMessage, UserNotice } from '../src/shared/dsh-min.ts'
import { at, comment, graphOf, node, stageEdit } from './execute-helpers.ts'

const GRAPH_DIR = '/proj/docs/graph'
const START = comment(1, '自动推进已开始 · 放行 2026-10-30T08:00:00.000Z · goal goal-1 · 会话 main-1 · 主干 main')

type Status = StatusInput['drive']
const idle: Status = { returns: [], lost: [], counters: { idle: 0, peak: 0 } }

/** An unsplit goal at release with one ready task: derived stage execute. */
function released(extra: readonly GraphNode[] = [], goalHistory: GraphNode['history'] = [START]): LoadedGraph {
  return graphOf([
    node({ id: 'goal-1', type: 'goal', stage: 'release', acceptance: ['works'] }, 0, 'human', [stageEdit(0, 'design', 'release'), ...goalHistory]),
    node({ id: 'task-1', type: 'task', parent: 'goal-1', kind: 'implement', acceptance: ['done'], writeScope: ['src/'], worktree: true }, 2),
    ...extra,
  ])
}

function input(graph: LoadedGraph, over: Partial<StatusInput> = {}): StatusInput {
  return { graph, focus: 'task-1', session: 'main-1', drive: idle, running: [], requests: [], now: new Date(at(600)), ...over }
}

function textOf(value: StatusInput): string {
  const status = statusText(value)
  assert.ok(status !== undefined, 'a notice was expected')
  return status.text
}

/** task-1 doing, dispatched at second 60 with the given pins line. */
function dispatched(graph: LoadedGraph, pins?: string): LoadedGraph {
  const task = graph.nodes.get('task-1')!
  const line = pins ?? renderPins(pinsOf(graph, task, sha256Hex))
  const text = renderDispatchComment({ attempt: 1, childId: 'hz-task-1-a1-aaaaaa', provider: 'probe', model: 'probe-model', why: 'small', brief: 'b'.repeat(12), pins: line })
  const doing: GraphNode = { ...task, status: 'doing', history: [...task.history, comment(60, text)] }
  return graphOf([...graph.nodes.values()].map(entry => entry.id === 'task-1' ? doing : entry))
}

const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  childId: 'hz-task-1-a1-aaaaaa', role: 'worker', node: 'task-1', attempt: 1, graphDir: GRAPH_DIR, provider: 'probe', model: 'probe-model', why: 'small', plan: 'none', pins: '', parentSession: 'main-1', ...over,
})

const request = (id: string, sinceSecond: number, question?: string): PendingRequest => ({
  request: { id, kind: question === undefined ? 'plan' : 'question', childId: 'hz-task-1-a1-aaaaaa', task: 'task-1', attempt: 1, graphDir: GRAPH_DIR, ...(question === undefined ? {} : { question }) },
  since: Date.parse(at(sinceSecond)),
})

const asMessage = (notice: UserNotice): DerivedMessage => ({ role: 'user', content: notice.content, source: notice.source })
const reasonOf = (notice: UserNotice | undefined): unknown => (notice?.source.hournessExecute as { reason?: string } | undefined)?.reason

test('no notice before the stage qualifies: a goal in design, a released split goal with no module released, no goal in focus', () => {
  const design = graphOf([node({ id: 'goal-1', type: 'goal', stage: 'design' }, 0, 'human'), node({ id: 'task-1', type: 'task', parent: 'goal-1' }, 1)])
  assert.equal(statusText(input(design)), undefined)
  const split = graphOf([
    node({ id: 'goal-1', type: 'goal', stage: 'release' }, 0, 'human'),
    node({ id: 'module-a', type: 'feature', parent: 'goal-1', stage: 'design' }, 1),
    node({ id: 'task-1', type: 'task', parent: 'module-a' }, 2),
  ])
  assert.equal(statusText(input(split, { focus: 'goal-1' })), undefined, 'the split goal derives to release')
  assert.equal(statusText(input(released(), { focus: undefined })), undefined)
  assert.ok(textOf(input(released())).startsWith('Dispatch status of goal goal-1 (stage execute):'))
})

test('the running, waiting, stale and lost lines; a worker of a previous holder carries §3.4.3\'s sentence; no free-slot line (D4)', () => {
  const graph = dispatched(released(), 'pins: task-1@000000000000')
  const text = textOf(input(graph, {
    running: [attempt(), attempt({ childId: 'hz-task-2-a1-bbbbbb', node: 'task-2', parentSession: 'main-0' })],
    requests: [request('R-000002', 500, 'which file?'), request('R-000001', 300)],
    drive: { ...idle, lost: [{ task: 'task-3', attempt: 2, childId: 'hz-task-3-a2-cccccc' }], state: 'The person paused the drive; it resumes when they press resume on the goal bar or run /goal resume.' },
  }))
  assert.ok(text.includes('- task-1 attempt 1 (worker, hz-task-1-a1-aaaaaa, model probe-model, 9 min); latest request: plan R-000001'), text)
  assert.ok(text.includes('- task-2 attempt 1 (worker, hz-task-2-a1-bbbbbb, model probe-model); started by the previous main agent: you can answer its requests; to change its direction, let it hand back and dispatch again, or ask the person to stop it from the panel'), text)
  const waiting = text.split('\n').filter(line => line.startsWith('- R-'))
  assert.deepEqual(waiting, ['- R-000001 plan of task-1 attempt 1, 5 min', '- R-000002 question of task-1 attempt 1, 1 min: which file?'], 'longest waiting first')
  assert.ok(text.includes('Stale dispatches, the graph changed after they were dispatched: task-1 attempt 1 (task-1 changed)'), text)
  assert.ok(text.includes('Lost when the app restarted: task-3 attempt 2 (hz-task-3-a2-cccccc).'), text)
  assert.ok(text.includes('The person paused the drive;'), 'the drive state line')
  assert.ok(!/Free slots/.test(text) && !/ready tasks/i.test(text), 'no free-slot line or ready list')
  const fresh = textOf(input(dispatched(released())))
  assert.ok(!fresh.includes('Stale dispatches'), 'fresh pins are not stale')
})

test('the sent-back line with its stale workers, and a module back in design qualifies a goal whose own stage does not', () => {
  const graph = graphOf([
    node({ id: 'goal-1', type: 'goal', stage: 'release' }, 0, 'human', [START]),
    node({ id: 'module-a', type: 'feature', parent: 'goal-1', stage: 'release' }, 1, 'llm', [stageEdit(5, 'design', 'release')]),
    node({ id: 'module-b', type: 'feature', parent: 'goal-1', stage: 'design' }, 1, 'llm', [stageEdit(5, 'design', 'release'), stageEdit(20, 'release', 'design')]),
    node({ id: 'task-1', type: 'task', parent: 'module-b', kind: 'implement', acceptance: ['x'] }, 2),
  ])
  const drive: Status = { ...idle, returns: [{ node: 'module-b', tier: 2, at: at(20), running: [{ task: 'task-1', childId: 'hz-task-1-a1-aaaaaa' }] }] }
  const text = textOf(input(graph, { focus: 'task-1', drive }))
  assert.ok(text.includes('Sent back to design: module module-b (running: task-1 hz-task-1-a1-aaaaaa). They are stale: interrupt them with interrupt_agent; dispatch again after the person releases the design.'), text)
  assert.ok(text.includes('Put these to the person now (at most three): the release page of module module-b "module-b"; later: none.'), text)
  assert.ok(textOf(input(graph, { focus: 'task-1' })).includes('module module-b'), 'the graph alone qualifies it')
})

test('the decided-by-you line counts from the drive start or the latest batch, at most five named, and the batch tell', () => {
  const decided = Array.from({ length: 6 }, (_, index): GraphNode => node({ id: `question-${index + 1}`, type: 'question', parent: 'goal-1', status: 'done', decider: 'agent', title: `q${index + 1}` }, 3, 'llm', [{ at: at(10 + index), actor: 'llm', op: 'decide', reason: 'mine' }]))
  const early = node({ id: 'question-0', type: 'question', parent: 'goal-1', status: 'done', decider: 'agent' }, 0, 'llm', [{ at: at(0), actor: 'llm', op: 'decide', reason: 'before the start' }])
  const text = textOf(input(released([...decided, early]), { drive: { ...idle, batchTell: 'Say in one line each, in this same reply, what you decided yourself since the last batch: question-9 q9.' } }))
  assert.ok(text.includes('Decided by you since your last batch to the person: question-1 q1, question-2 q2, question-3 q3, question-4 q4, question-5 q5 (6)'), text)
  assert.ok(text.includes('Say in one line each, in this same reply, what you decided yourself since the last batch: question-9 q9.'))
  const batched = textOf(input(released(decided, [START, comment(13, '批次 1 · 交给你 1 件 · 告知 agent 自己定的 3 件 · call-1')])))
  assert.ok(batched.includes('Decided by you since your last batch to the person: question-5 q5, question-6 q6 (2)'), batched)
})

test('batchOf\'s now and later split in the text: a module release page first, then the stops by id', () => {
  const stops = ['task-a', 'task-b', 'task-c', 'task-d'].map((id, index) => node({ id, type: 'task', parent: 'goal-1', status: 'doing' }, 2, 'llm', [comment(50 + index, '检查第 3 次没过：$ npm test exit 1 · log · 停下')]))
  const answered = node({ id: 'task-e', type: 'task', parent: 'goal-1', status: 'doing' }, 2, 'llm', [comment(30, '检查第 3 次没过：$ npm test exit 1 · log · 停下'), { at: at(40), actor: 'human', op: 'comment', text: '继续' }])
  const text = textOf(input(released([...stops, answered])))
  assert.ok(text.includes('Put these to the person now (at most three): what stopped on task-a "task-a"; what stopped on task-b "task-b"; what stopped on task-c "task-c"; later: what stopped on task-d "task-d".'), text)
  assert.ok(!text.includes('task-e'), 'a stop the person answered is not batched')
})

test('the model catalog once per provider in the process, and again after it changes', () => {
  const status = statusText(input(released()))!
  const catalog = { provider: 'catalog-spec', ids: ['glm-4.6', 'glm-4.5-air'] }
  const first = dispatchNotice([], [], status, catalog)
  assert.equal(reasonOf(first), 'first')
  assert.ok(first!.content[0].text.includes('Model catalog of provider catalog-spec: glm-4.6, glm-4.5-air.'))
  const history = [asMessage(first!)]
  assert.equal(dispatchNotice(history, [], status, catalog), undefined, 'the same catalog is not shown again')
  const changed = dispatchNotice(history, [], status, { provider: 'catalog-spec', ids: ['glm-4.6', 'glm-5'] })
  assert.equal(reasonOf(changed), 'catalog')
  assert.ok(changed!.content[0].text.includes('glm-5'))
  const later = dispatchNotice([asMessage(changed!)], [], statusText(input(released(), { running: [attempt()] }))!, { provider: 'catalog-spec', ids: ['glm-4.6', 'glm-5'] })
  assert.equal(reasonOf(later), 'changed')
  assert.ok(!later!.content[0].text.includes('Model catalog'), 'a known catalog does not ride a changed status')
})

test('not added again while the digest holds (the minutes do not count); added after a compaction and at a goal round', () => {
  const running = { running: [attempt()] }
  const graph = dispatched(released())
  const first = dispatchNotice([], [], statusText(input(graph, running))!, undefined)
  assert.equal(reasonOf(first), 'first')
  assert.equal((first!.source.hournessExecute as { event?: string }).event, 'drive')
  assert.equal(first!.source.kind, 'glm-hourness-execute')
  const history = [asMessage(first!)]
  const later = statusText(input(graph, { ...running, now: new Date(at(1800)) }))!
  assert.notEqual(later.text, statusText(input(graph, running))!.text, 'the minutes moved')
  assert.equal(dispatchNotice(history, [], later, undefined), undefined)
  const compacted = [...history, { role: 'user', source: { kind: 'compact-checkpoint', compactionId: 'c-1' } }]
  const again = dispatchNotice(compacted, [], later, undefined)
  assert.equal(reasonOf(again), 'compaction')
  assert.equal((again!.source.hournessExecute as { anchor?: string }).anchor, 'c-1')
  assert.equal(dispatchNotice([...compacted, asMessage(again!)], [], later, undefined), undefined)
  assert.equal(reasonOf(dispatchNotice(history, [{ role: 'user', source: { kind: 'goal' } }], later, undefined)), 'goal-round')
})

test('installed on an agent: only the holder\'s steps carry it, after the step\'s messages', async () => {
  const graph = released()
  let listener: ((payload: unknown, next: () => Promise<unknown>) => Promise<unknown>) | undefined
  let main = false
  const agent = {
    id: 'main-1',
    ctx: { on: (_event: string, run: typeof listener) => { listener = run; return () => {} } } as never,
    session: { id: 'main-1', header: { id: 'main-1', cwd: '/proj' }, deriveMessages: () => [] },
  }
  const reports: string[] = []
  const uninstall = installDispatchNotice(agent, {
    lookup: { get: (name: string) => name === 'glmHournessGraph' ? { dirFor: () => GRAPH_DIR, focusOf: () => 'task-1' } : undefined },
    cache: { load: () => Promise.resolve(graph), get: () => graph },
    graphDirOf: () => GRAPH_DIR,
    isMain: () => main,
    drive: () => idle,
    report: (_session, _state, reason) => { reports.push(reason) },
  })
  assert.ok(uninstall !== undefined && listener !== undefined)
  const step = (): Promise<unknown> => listener!({ messages: [], signal: new AbortController().signal, step: 1 }, () => Promise.resolve({ kind: 'enter', messages: [{ role: 'user', content: [] }] }))
  assert.equal(((await step()) as { messages: unknown[] }).messages.length, 1, 'not the holder: nothing added')
  main = true
  const messages = ((await step()) as { messages: UserNotice[] }).messages
  assert.equal(messages.length, 2)
  assert.equal(messages[1].source.kind, 'glm-hourness-execute')
  assert.deepEqual(reports, [])
})
