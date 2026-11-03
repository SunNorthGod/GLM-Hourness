/**
 * The learning signals and the digest (M5 design §3.6, acceptance m5-4 items
 * 1 and 2, the pure part): the corrections found in a graph history that the
 * real engine wrote, the groups, the landings read back from real journals,
 * the digest, and the rule of when the reminder is due.
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { JournalRecord } from '../src/data/journal.ts'
import { readJournal } from '../src/data/journal.ts'
import { realLockEnvironment } from '../src/data/lock.ts'
import { openEngine, type GraphEngine } from '../src/graph/engine.ts'
import type { Actor } from '../src/graph/schema.ts'
import { loadGraph } from '../src/graph/store.ts'
import { journalFile as lessonsFile } from '../src/lessons/storage.ts'
import { buildDigest, depthWritesOf, eventsFrom, LEARNING_NOTICE, lessonLandings, LESSONS_COLLECTED, MEMORY_COLLECTED, memoryLandings, meaningOf, noteLandings, noticeDue, noticeKeys, sameKeys, windowOf, type LearningDigest } from '../src/memory/learning.ts'
import { applyRecord, emptyMemory, NOTICE_KEYS_MAX } from '../src/memory/model.ts'
import { correctionSignals, groupEvents, recurrences, weeklyCounts, type DepthWrite, type SignalEvent } from '../src/memory/signals.ts'
import { journalFile } from '../src/memory/storage.ts'
import { ANSWER_MARKS, answerKindOf } from '../src/shared/answer-marks.ts'
import { lessonsFixture, LESSON } from './lessons-helpers.ts'
import { memoryFixture } from './memory-helpers.ts'

const MINUTE = 60_000
const DAY = 86_400_000
const BASE = Date.UTC(2026, 9, 20)
const iso = (ms: number): string => new Date(ms).toISOString()

interface World {
  readonly dir: string
  readonly engine: GraphEngine
  /** Propose, or apply a mutation to an existing node with its current revision filled in; the write must succeed. */
  run(actor: Actor, mutation: Record<string, unknown>): Promise<string>
}

/** A graph directory written by the real engine with a clock that ticks a minute per write. */
async function world(): Promise<World> {
  const dir = await mkdtemp(join(tmpdir(), 'memory-signals-'))
  let tick = 0
  const engine = openEngine(dir, { now: () => new Date(BASE + tick++ * MINUTE) })
  return {
    dir,
    engine,
    async run(actor, mutation) {
      const rev = typeof mutation.id === 'string' && mutation.op !== 'comment' ? (await loadGraph(dir)).revisions.get(mutation.id) : undefined
      const result = await engine.apply(actor, rev === undefined ? mutation : { ...mutation, rev })
      assert.ok(result.ok, JSON.stringify(result))
      return result.id
    },
  }
}

const task = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({ type: 'task', title: 'a task', parent: 'feature-1', acceptance: ['first version'], ...extra })
const DONE = { kind: 'commit', ref: 'abc1234' }
const AGREE = `${ANSWER_MARKS.agree}（record_human_answer call-1）`

/**
 * The corrections of one project, written in an order the expected events
 * below follow: five agent-written nodes the person (or the agent quoting
 * the person) changes, rejects or reopens, and five writes that are not
 * corrections.
 */
async function corrected(): Promise<World> {
  const w = await world()
  await w.run('human', { op: 'propose', reason: 'goal', node: { type: 'goal', title: 'the project', stage: 'design', acceptance: ['it works'] } })
  await w.run('human', { op: 'propose', reason: 'split', node: { type: 'feature', title: 'the feature', parent: 'goal-1' } })
  for (const node of [task(), task(), task({ body: 'first draft' }), task()]) await w.run('llm', { op: 'propose', reason: 'plan', node })
  await w.run('human', { op: 'propose', reason: 'the person wrote this one', node: task() })
  for (const title of ['one more branch', 'and another']) await w.run('llm', { op: 'propose', reason: 'new branch', node: { type: 'feature', title, parent: 'goal-1' } })
  for (const title of ['a', 'b', 'c']) await w.run('llm', { op: 'propose', reason: 'plan', node: task({ title }) })
  // Corrections of fields the agent wrote.
  await w.run('human', { op: 'edit', id: 'task-1', reason: 'tighter', set: { acceptance: ['the person\'s version'] } })
  await w.run('llm', { op: 'edit', id: 'task-2', reason: 'tighter', relay: 'make it stricter', set: { acceptance: ['stricter version'] } })
  // Not corrections: the agent's own edit, an agreed edit, the person editing what the person wrote or what nobody wrote.
  await w.run('llm', { op: 'edit', id: 'task-3', reason: 'reword', set: { body: 'second draft' } })
  await w.run('llm', { op: 'edit', id: 'task-4', reason: AGREE, relay: 'yes, do that', set: { acceptance: ['agreed version'] } })
  await w.run('human', { op: 'edit', id: 'task-1', reason: 'again', set: { acceptance: ['the person\'s second version'] } })
  await w.run('human', { op: 'edit', id: 'task-1', reason: 'a body nobody wrote', set: { body: 'added by the person' } })
  await w.run('human', { op: 'edit', id: 'task-5', reason: 'own node', set: { acceptance: ['edited by its author'] } })
  // Rejected proposals, by the person and by the agent quoting the person.
  await w.run('human', { op: 'reject', id: 'feature-2', reason: 'no' })
  await w.run('llm', { op: 'reject', id: 'feature-3', reason: 'the person said no', relay: 'not this one' })
  // Replies in the chat; the engine drops a relay from a comment.
  await w.run('llm', { op: 'comment', id: 'goal-1', text: `${ANSWER_MARKS.reject}this is wrong（record_human_answer call-2）` })
  await w.run('llm', { op: 'comment', id: 'goal-1', text: `${ANSWER_MARKS.add}also this one（record_human_answer call-3）` })
  await w.run('llm', { op: 'comment', id: 'goal-1', text: 'a note of the agent' })
  // Reopened work: by the person, by the agent quoting the person, and by the agent alone.
  for (const [id, reopen] of [['task-6', { actor: 'human' }], ['task-7', { actor: 'llm', relay: 'it is not done' }], ['task-8', { actor: 'llm' }]] as const) {
    await w.run('llm', { op: 'status', id, to: 'done', reason: 'finished', evidence: [DONE] })
    await w.run(reopen.actor, { op: 'status', id, to: 'doing', reason: 'not finished', ...'relay' in reopen ? { relay: reopen.relay } : {} })
  }
  return w
}

async function withWorld(body: (w: World) => Promise<void>): Promise<void> {
  const w = await corrected()
  try {
    await body(w)
  }
  finally {
    await rm(w.dir, { recursive: true, force: true })
  }
}

const WINDOW = { since: iso(BASE - DAY), until: iso(BASE + DAY) }

test('the corrections are found in a history the real engine wrote: the person\'s edits of agent fields, rejections, replies in the chat and reopenings', async () => {
  await withWorld(async (w) => {
    const { nodes } = await loadGraph(w.dir)
    const { events, groups } = correctionSignals({ nodes: nodes.values(), depthWrites: [], ...WINDOW })
    assert.deepEqual(events.map(event => [event.key, event.ref]), [
      ['edit:task.acceptance', 'task-1#1'],
      ['edit:task.acceptance', 'task-2#1'],
      ['reject:feature', 'feature-2#1'],
      ['reject:feature', 'feature-3#1'],
      ['chat:reject', 'goal-1#1'],
      ['chat:add', 'goal-1#2'],
      ['reopen:task', 'task-6#2'],
      ['reopen:task', 'task-7#2'],
    ])
    assert.deepEqual(groups.map(group => [group.key, group.count]), [['edit:task.acceptance', 2], ['reject:feature', 2], ['reopen:task', 2], ['chat:add', 1], ['chat:reject', 1]])
    assert.deepEqual(groups[0]?.refs, ['task-1#1', 'task-2#1'])
    assert.ok(events.every(event => Number.isFinite(Date.parse(event.at))))
  })
})

test('what the engine wrote is what the signals read: a comment has no relay, a relayed write has the words, an agreed edit opens with the words of agreement', async () => {
  await withWorld(async (w) => {
    const { nodes } = await loadGraph(w.dir)
    const goal = nodes.get('goal-1')!
    assert.deepEqual(goal.history.slice(1).map(entry => [entry.op, entry.actor, entry.relay, answerKindOf(entry)]), [
      ['comment', 'llm', undefined, 'reject'],
      ['comment', 'llm', undefined, 'add'],
      ['comment', 'llm', undefined, undefined],
    ])
    assert.equal(nodes.get('task-2')!.history[1]?.relay, 'make it stricter')
    const agreed = nodes.get('task-4')!.history[1]
    assert.deepEqual([agreed.relay, answerKindOf(agreed)], ['yes, do that', 'agree'])
    assert.equal(nodes.get('task-1')!.history[1]?.actor, 'human')
  })
})

test('the same input gives the same output, whatever the order of the nodes', async () => {
  await withWorld(async (w) => {
    const { nodes } = await loadGraph(w.dir)
    const forward = correctionSignals({ nodes: [...nodes.values()], depthWrites: [], ...WINDOW })
    const backward = correctionSignals({ nodes: [...nodes.values()].reverse(), depthWrites: [], ...WINDOW })
    assert.deepEqual(backward, forward)
  })
})

test('the window starts at since (included) and ends before until: a correction at the very end is in the next window', async () => {
  await withWorld(async (w) => {
    const { nodes } = await loadGraph(w.dir)
    const all = correctionSignals({ nodes: nodes.values(), depthWrites: [], ...WINDOW }).events
    const [first, second, third, fourth] = all
    assert.deepEqual(correctionSignals({ nodes: nodes.values(), depthWrites: [], since: second.at, until: fourth.at }).events.map(event => event.ref), [second.ref, third.ref])
    assert.deepEqual(correctionSignals({ nodes: nodes.values(), depthWrites: [], since: first.at, until: first.at }).events, [])
    assert.deepEqual(correctionSignals({ nodes: nodes.values(), depthWrites: [], since: iso(BASE + DAY), until: iso(BASE + 2 * DAY) }).events, [])
  })
})

test('a step of the reporting depth is a signal, the first write and a repeated value are not, and the order is the order of the journal', () => {
  const write = (seq: number, value: DepthWrite['value']): DepthWrite => ({ at: iso(BASE + seq * MINUTE), seq, value })
  const events = (writes: DepthWrite[]) => correctionSignals({ nodes: [], depthWrites: writes, ...WINDOW }).events.map(event => [event.key, event.ref])
  assert.deepEqual(events([write(1, 'concise')]), [])
  assert.deepEqual(events([write(1, 'concise'), write(2, 'concise')]), [])
  assert.deepEqual(events([write(1, 'concise'), write(2, 'detailed'), write(3, 'balanced'), write(4, 'balanced'), write(5, 'concise')]), [['depth:up', 'memory:2'], ['depth:down', 'memory:3'], ['depth:down', 'memory:5']])
  assert.deepEqual(events([write(3, 'detailed'), write(1, 'concise')]), [['depth:up', 'memory:3']], 'the writes are put in order of seq first')
})

test('answerKindOf reads the words of a reply: a comment opens with add or reject, anything else with agree', () => {
  assert.equal(answerKindOf({ op: 'comment', text: `${ANSWER_MARKS.add}x` }), 'add')
  assert.equal(answerKindOf({ op: 'comment', text: `${ANSWER_MARKS.reject}x` }), 'reject')
  assert.equal(answerKindOf({ op: 'comment', text: `${ANSWER_MARKS.agree}x` }), undefined)
  assert.equal(answerKindOf({ op: 'edit', reason: `${ANSWER_MARKS.agree}x` }), 'agree')
  assert.equal(answerKindOf({ op: 'edit', reason: `${ANSWER_MARKS.add}x` }), undefined)
  assert.equal(answerKindOf({ op: 'edit' }), undefined)
})

const event = (key: string, days: number, ref = `${key}@${days}`): SignalEvent => ({ at: iso(BASE + days * DAY), key, ref })

test('recurrences count the events after the earliest landing of a key; an event at the moment of the landing, and a key with no landing, are not counted', () => {
  const events = [event('a', 1), event('a', 3), event('a', 5), event('b', 5), event('c', 6)]
  const found = recurrences(events, [{ key: 'a', at: iso(BASE + 3 * DAY) }, { key: 'a', at: iso(BASE + 4 * DAY) }, { key: 'b', at: iso(BASE + 9 * DAY) }])
  assert.deepEqual([...found], [['a', 1], ['b', 0]])
})

test('the weekly counts put an event in the week it falls in, the oldest week first, and leave out what is older than four weeks or not before until', () => {
  const until = iso(BASE + 30 * DAY)
  const at = (before: number): SignalEvent => ({ at: iso(BASE + 30 * DAY - before), key: 'k', ref: String(before) })
  const events = [at(1), at(7 * DAY), at(7 * DAY + 1), at(14 * DAY), at(21 * DAY + 1), at(28 * DAY), at(28 * DAY + 1), at(0), { ...at(DAY), key: 'other' }]
  assert.deepEqual(weeklyCounts(events, 'k', until), [2, 0, 2, 2], 'ages up to 7 days are the latest week, 7 days exactly still in it; 28 days exactly is the oldest week')
})

test('the groups of events are the largest first and the ties in key order', () => {
  assert.deepEqual(groupEvents([event('b', 1), event('a', 2), event('b', 3), event('c', 4)]).map(group => [group.key, group.count, group.refs]), [['b', 2, ['b@1', 'b@3']], ['a', 1, ['a@2']], ['c', 1, ['c@4']]])
})

test('the digest lists the groups with enough events, each with its meaning, its newest three examples, how many things settle it, how often it came back and the four weeks', () => {
  const until = iso(BASE + 30 * DAY)
  const events = [event('edit:task.acceptance', 20), event('edit:task.acceptance', 24), event('edit:task.acceptance', 26), event('edit:task.acceptance', 28), event('chat:add', 25), event('reject:feature', 27), event('reject:feature', 29), event('depth:up', 1)]
  const settled = [{ key: 'edit:task.acceptance', at: iso(BASE + 25 * DAY) }, { key: 'edit:task.acceptance', at: iso(BASE + 22 * DAY) }]
  const digest = buildDigest({ events, landings: settled, since: iso(BASE + 5 * DAY), until, minCount: 2, graph: 'ok' })
  assert.deepEqual(digest.groups.map(group => [group.key, group.count, group.learned, group.recurrences]), [['edit:task.acceptance', 4, 2, 3], ['reject:feature', 2, 0, 0]])
  const first = digest.groups[0]
  assert.equal(first.meaning, 'the person changed the acceptance the agent had set on a task')
  assert.deepEqual(first.examples.map(example => example.ref), ['edit:task.acceptance@28', 'edit:task.acceptance@26', 'edit:task.acceptance@24'])
  assert.deepEqual(first.weekly, [0, 0, 1, 3], 'the weekly counts read all events given, the oldest week first')
  assert.deepEqual([digest.since, digest.until, digest.graph, 'notes' in digest], [iso(BASE + 5 * DAY), until, 'ok', false])
  assert.deepEqual(buildDigest({ events, landings: [], since: iso(BASE + 5 * DAY), until, minCount: 1, graph: 'unavailable' }).groups.map(group => group.key), ['edit:task.acceptance', 'reject:feature', 'chat:add'])
})

test('the meaning of a key is one sentence for the model, and a key it does not know is named', () => {
  assert.equal(meaningOf('edit:goal.stage'), 'the person changed the stage the agent had set on a goal')
  assert.equal(meaningOf('reject:feature'), 'the person rejected a feature the agent proposed')
  assert.equal(meaningOf('reopen:task'), 'the person reopened a task the agent had marked done')
  assert.equal(meaningOf('chat:reject'), 'the person said no to a proposal in the conversation')
  assert.equal(meaningOf('chat:add'), 'the person added something to a proposal in the conversation')
  assert.equal(meaningOf('depth:up'), 'the person asked for longer reports')
  assert.equal(meaningOf('depth:down'), 'the person asked for shorter reports')
  assert.equal(meaningOf('commit:src'), 'a correction of kind commit:src')
})

test('the window is 28 days up to now unless named, and the events are read from four weeks back at least', () => {
  const now = new Date(BASE + 40 * DAY)
  assert.deepEqual(windowOf({}, now), { since: iso(BASE + 12 * DAY), until: iso(BASE + 40 * DAY), minCount: 2 })
  assert.deepEqual(windowOf({ since: iso(BASE), until: iso(BASE + 10 * DAY), minCount: 3 }, now), { since: iso(BASE), until: iso(BASE + 10 * DAY), minCount: 3 })
  assert.equal(eventsFrom(iso(BASE + 35 * DAY), iso(BASE + 40 * DAY)), iso(BASE + 12 * DAY))
  assert.equal(eventsFrom(iso(BASE), iso(BASE + 40 * DAY)), iso(BASE))
})

test('a comment `学自：<key>` settles the key; several keys in one comment, punctuation after a key, and comments that do not say it', async () => {
  await withWorld(async (w) => {
    await w.run('llm', { op: 'comment', id: 'feature-2', text: '学自：edit:task.acceptance' })
    await w.run('llm', { op: 'comment', id: 'task-1', text: '规则提议。学自：reject:feature，学自：chat:add。' })
    await w.run('llm', { op: 'comment', id: 'task-1', text: 'learned from nothing' })
    const landings = noteLandings((await loadGraph(w.dir)).nodes.values())
    assert.deepEqual(landings.map(landing => landing.key).sort(), ['chat:add', 'edit:task.acceptance', 'reject:feature'])
    assert.ok(landings.every(landing => Date.parse(landing.at) >= BASE))
  })
})

test('the landings of memory: the time is that of the first record that named the key, a forgotten entry settles nothing, and the depth writes come out in journal order', async () => {
  let clock = new Date(BASE)
  const memory = memoryFixture({ known: ['docs/DESIGN.md'], append: { lock: { ...realLockEnvironment, now: () => clock.getTime() } } })
  try {
    const preference = (name: string, description: string, extra: Record<string, unknown> = {}) => ({ name, type: 'feedback', scope: 'all', description, body: 'Do it this way.\n**Why:** the person said so.\n**How to apply:** always.', relay: 'Do it this way.', ...extra })
    await memory.call('memory_store', preference('lead-with-the-answer', 'Start every reply with the answer', { learnedFrom: ['edit:task.acceptance'] }))
    await memory.call('memory_store', preference('keep-diffs-small', 'Keep each change small and reviewable'))
    clock = new Date(BASE + 2 * DAY)
    await memory.call('memory_store', preference('keep-diffs-small', 'Keep each change small and reviewable', { learnedFrom: ['chat:add'] }))
    await memory.call('memory_store', { name: 'signing-rules-differ', type: 'project', description: 'coding-plan and start-plan sign requests differently', body: 'They sign differently.\n**Why:** a request signed the wrong way is refused.', source: ['docs/DESIGN.md'], learnedFrom: ['reject:feature'] })
    clock = new Date(BASE + 3 * DAY)
    await memory.call('memory_forget', { name: 'signing-rules-differ', reason: 'no longer true' })
    const depth = (value: string, relay: string) => memory.call('memory_store', { name: 'reporting-depth', type: 'user', description: 'Report length', body: 'Reports.\n**Why:** the person said so.', value, relay })
    clock = new Date(BASE + 4 * DAY)
    await depth('concise', 'Shorter, please.')
    clock = new Date(BASE + 5 * DAY)
    await depth('detailed', 'Longer, please.')

    const user = (await readJournal(journalFile(memory.places.user!), MEMORY_COLLECTED.all)).state
    const project = (await readJournal(journalFile(memory.places.project!), MEMORY_COLLECTED.project)).state
    assert.deepEqual(memoryLandings(user), [{ key: 'edit:task.acceptance', at: iso(BASE) }, { key: 'chat:add', at: iso(BASE + 2 * DAY) }])
    assert.deepEqual(memoryLandings(project), [], 'the fact was forgotten')
    assert.deepEqual(depthWritesOf(user).map(write => [write.value, write.at]), [['concise', iso(BASE + 4 * DAY)], ['detailed', iso(BASE + 5 * DAY)]])
    assert.deepEqual(user.picked.map(record => record.id), ['all:lead-with-the-answer', 'all:keep-diffs-small', 'all:reporting-depth', 'all:reporting-depth'], 'the store of keep-diffs-small without a key was not picked, the one with a key was')
  }
  finally {
    memory.dispose()
  }
})

test('the landings of lessons: a lesson settles the keys it was written or revised with, at the time of that record; a retired lesson settles nothing', async () => {
  const f = lessonsFixture()
  try {
    f.setNow(new Date(BASE))
    await f.call('lessons_merge', { ...LESSON, learnedFrom: ['reopen:task'] })
    f.setNow(new Date(BASE + DAY))
    await f.call('lessons_merge', { ...LESSON, situation: { files: ['src/other/**'], commands: ['npm test'], errors: ['something else failed here'] }, pitfall: 'Another pitfall that is not the first.', fix: 'A different fix entirely.', learnedFrom: ['depth:down'] })
    f.setNow(new Date(BASE + 2 * DAY))
    await f.call('lessons_merge', { action: 'revise', lesson: 'L-100000', reason: 'also this', learnedFrom: ['chat:reject'] })
    await f.call('lessons_merge', { action: 'retire', lesson: 'L-100001', reason: 'obsolete' })
    const read = (await readJournal(lessonsFile(f.dir), LESSONS_COLLECTED)).state
    assert.deepEqual(lessonLandings(read), [{ key: 'reopen:task', at: iso(BASE) }, { key: 'chat:reject', at: iso(BASE + 2 * DAY) }])
  }
  finally {
    f.dispose()
  }
})

const record = (extra: Partial<JournalRecord>): JournalRecord => ({ v: 1, seq: 1, at: iso(BASE), actor: 'harness', op: 'learn-notified', id: '*', data: { keys: ['edit:task.acceptance'] }, ...extra })

test('a learn-notified record is the harness\'s, in the project journal, about the file, with group keys: it sets the last notice and nothing else', () => {
  const project = emptyMemory('project')
  const step = applyRecord(project, record({}))
  assert.ok('state' in step)
  assert.deepEqual(step.state.learnNotice, { at: iso(BASE), keys: ['edit:task.acceptance'] })
  assert.equal(step.state.entries.size, 0)
  const later = applyRecord(step.state, record({ seq: 2, at: iso(BASE + DAY), data: { keys: ['a', 'b'] } }))
  assert.ok('state' in later)
  assert.deepEqual(later.state.learnNotice, { at: iso(BASE + DAY), keys: ['a', 'b'] })
  const bad: Array<[string, ReturnType<typeof applyRecord>]> = [
    ['the person\'s journal', applyRecord(emptyMemory('all'), record({}))],
    ['an agent', applyRecord(project, record({ actor: 'llm' }))],
    ['an id that is a name', applyRecord(project, record({ id: 'project:x' }))],
    ['no keys', applyRecord(project, record({ data: { keys: [] } }))],
    ['too many keys', applyRecord(project, record({ data: { keys: Array.from({ length: NOTICE_KEYS_MAX + 1 }, (_, index) => `edit:task.field${index}`) } }))],
    ['a key with a line break', applyRecord(project, record({ data: { keys: ['a\nb'] } }))],
    ['no data', applyRecord(project, (({ data: _data, ...rest }) => rest)(record({})))],
  ]
  for (const [what, result] of bad) assert.ok('bad' in result, what)
})

test('the reminder is due seven days after the last one, or when there was none', () => {
  const last = { at: iso(BASE), keys: ['a'] }
  assert.equal(noticeDue(undefined, iso(BASE)), true)
  assert.equal(noticeDue(last, iso(BASE + 7 * DAY - 1)), false)
  assert.equal(noticeDue(last, iso(BASE + 7 * DAY)), true)
})

test('the reminder names the groups with no landing and those that came back, sorted by key and at most fifty; the same keys are the same digest', () => {
  const group = (key: string, learned: number, again: number) => ({ key, meaning: '', count: 3, examples: [], learned, recurrences: again, weekly: [0, 0, 0, 0] })
  const digest = (groups: ReturnType<typeof group>[]): LearningDigest => ({ since: '', until: '', groups, graph: 'ok' })
  assert.deepEqual(noticeKeys(digest([group('b', 0, 0), group('a', 1, 0), group('c', 2, 1), group('d', 1, 0)])), ['b', 'c'])
  assert.deepEqual(noticeKeys(digest([group('a', 1, 0)])), [])
  const many = Array.from({ length: NOTICE_KEYS_MAX + 5 }, (_, index) => group(`edit:task.f${String(index).padStart(3, '0')}`, 0, 0))
  assert.equal(noticeKeys(digest(many)).length, NOTICE_KEYS_MAX)
  assert.equal(sameKeys(['a', 'b'], ['a', 'b']), true)
  assert.equal(sameKeys(['a', 'b'], ['a']), false)
  assert.equal(sameKeys(['a', 'b'], ['a', 'c']), false)
})

test('the text of the reminder points to learning_signals and to the places a group is settled, and does not mention what is not built yet', () => {
  assert.ok(LEARNING_NOTICE.startsWith('Learning digest (hourness)'))
  for (const part of ['learning_signals', 'learnedFrom', '学自：<key>', 'propose_to_human', 'advice, not a rule']) assert.ok(LEARNING_NOTICE.includes(part), part)
  assert.ok(!LEARNING_NOTICE.includes('memory_habit'))
})
