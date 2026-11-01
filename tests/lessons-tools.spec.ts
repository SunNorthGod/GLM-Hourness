/**
 * The two lessons tools (M5 design §4.2.2, §4.5; acceptance lessons-1 items
 * 3, 5, 6): the nine actions of lessons_merge with the permission of each
 * (only the person deletes or restores, an agent quotes their words), the
 * checks of a request, and lessons_query. The journal and the lock are real
 * files in a temporary directory.
 */
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import test from 'node:test'
import { journalFile } from '../src/lessons/storage.ts'
import { CANDIDATE, CHILD, LESSON, MAIN_SESSION, withFixture, type LessonsFixture } from './lessons-helpers.ts'
import { refusalOf } from './memory-helpers.ts'

const TOKEN = ['ghp', 'x'.repeat(36)].join('_')
const SHA = 'c'.repeat(40)

const merge = (f: LessonsFixture, args: unknown) => f.call('lessons_merge', args)
const statusOf = async (f: LessonsFixture, query: object = { text: 'worker graph' }): Promise<string[]> => ((await f.call('lessons_query', query)).lessons as Array<{ id: string, status: string }>).map(entry => `${entry.id}:${entry.status}`)
const propose = (f: LessonsFixture, candidate: object = CANDIDATE, context: object = {}) => f.service.propose(candidate as never, { session: MAIN_SESSION, task: 'task-3', ...context })

test('new writes a lesson as the agent, with the ids of the call, and lists the lessons that read like it', async () => {
  await withFixture(async (f) => {
    assert.deepEqual(await merge(f, LESSON), { action: 'new', lesson: 'L-100000', status: 'active' })
    const [record] = f.journal()
    assert.deepEqual([record?.op, record?.actor, record?.id, record?.reason], ['new', 'llm', 'L-100000', 'seed for the spec'])
    assert.deepEqual(record?.by, { session: 'main-session', agent: 'main-session', tool: 'lessons_merge', callId: 'call-1' })
    assert.deepEqual(record?.evidence, ['commit:cae6ddf'])
    assert.deepEqual(record?.data, { situation: { files: ['docs/graph/**'], tools: [], commands: ['git commit'], errors: ['graph write refused here'] }, pitfall: LESSON.pitfall, fix: LESSON.fix })
    assert.deepEqual(await merge(f, { ...LESSON, situation: { files: ['docs/other/**'] } }), { action: 'new', lesson: 'L-100001', status: 'active', similar: ['L-100000'] })
  })
})

test('new with the signature of an active lesson is a duplicate that points to into', async () => {
  await withFixture(async (f) => {
    await merge(f, LESSON)
    const refusal = await refusalOf(merge(f, { ...LESSON, pitfall: 'Told another way.', reason: 'again' }))
    assert.deepEqual([refusal.code, refusal.hint], ['duplicate', 'use action into with lesson L-100000'])
    assert.equal(f.journal().length, 1)
  })
})

test('a candidate becomes a lesson with new, can be merged into one with into, thrown away with drop; each says stale once it is not open', async () => {
  await withFixture(async (f) => {
    const commit = 'a'.repeat(40)
    await propose(f, CANDIDATE, { childId: 'session-abc', commit })
    await propose(f, { ...CANDIDATE, problem: 'Another.', errors: ['another error piece'] })
    await propose(f, { ...CANDIDATE, problem: 'A third.', errors: ['a third error piece'] })
    assert.deepEqual(await merge(f, { action: 'new', reason: 'worth keeping', candidate: 'C-100000', fix: 'A better fix, written by the main agent.' }), { action: 'new', lesson: 'L-100003', candidate: 'C-100000', status: 'active' })
    const created = f.journal().at(-1)
    assert.deepEqual(created?.evidence, ['task:task-3', 'session:session-abc', `commit:${commit}`], 'the evidence of the candidate, a full commit id included')
    assert.equal((created?.data as { fix: string }).fix, 'A better fix, written by the main agent.')
    assert.deepEqual(await merge(f, { action: 'into', reason: 'same thing', candidate: 'C-100001', lesson: 'L-100003' }), { action: 'into', lesson: 'L-100003', candidate: 'C-100001', status: 'active', confirmations: 2 })
    assert.equal((await refusalOf(merge(f, { action: 'into', reason: 'again', candidate: 'C-100001', lesson: 'L-100003' }))).code, 'stale')
    assert.equal((await refusalOf(merge(f, { action: 'new', reason: 'again', candidate: 'C-100000' }))).code, 'stale')
    assert.deepEqual(await merge(f, { action: 'drop', reason: 'not a lesson', candidate: 'C-100002' }), { action: 'drop', candidate: 'C-100002', status: 'dropped' })
    assert.equal((await refusalOf(merge(f, { action: 'drop', reason: 'again', candidate: 'C-100002' }))).code, 'stale')
    assert.equal((await refusalOf(merge(f, { action: 'drop', reason: 'no such', candidate: 'C-ffffff' }))).code, 'not_found')
    assert.deepEqual(await merge(f, { action: 'reopen', reason: 'it was a lesson after all', candidate: 'C-100002' }), { action: 'reopen', candidate: 'C-100002', status: 'open' })
  })
})

test('a candidate that came with a full commit id merges both ways', async () => {
  await withFixture(async (f) => {
    const first = await propose(f, CANDIDATE, { commit: SHA })
    assert.equal('id' in first && first.id, 'C-100000')
    assert.ok(f.journal()[0]?.evidence?.includes(`commit:${SHA}`))
    const made = await merge(f, { action: 'new', reason: 'seed', candidate: 'C-100000' })
    assert.equal(made.status, 'active')
    const second = await propose(f, { ...CANDIDATE, problem: 'Told another way.', errors: ['a different error piece'] }, { commit: SHA })
    const into = await merge(f, { action: 'into', reason: 'same', candidate: 'id' in second ? second.id : '', lesson: 'L-100001' })
    assert.equal(into.confirmations, 2)
    const lesson = ((await f.call('lessons_query', { text: 'garbled' })).lessons as Array<{ evidence: string[] }>)[0]
    assert.ok(lesson?.evidence.includes(`commit:${SHA}`), JSON.stringify(lesson))
  })
})

test('revise changes what is named, confirm adds fresh evidence, retire puts a lesson away and reopen brings it back', async () => {
  await withFixture(async (f) => {
    await merge(f, LESSON)
    assert.deepEqual(await merge(f, { action: 'revise', lesson: 'L-100000', reason: 'sharper', pitfall: 'A worker committed a graph comment on main.', learnedFrom: ['edit:task.acceptance'], evidence: ['commit:cae6ddf', 'docs/HANDOFF.md §6'] }), { action: 'revise', lesson: 'L-100000', status: 'active' })
    const revise = f.journal().at(-1)
    assert.deepEqual(revise?.data, { pitfall: 'A worker committed a graph comment on main.', learnedFrom: ['edit:task.acceptance'] })
    assert.deepEqual(revise?.evidence, ['commit:cae6ddf', 'docs/HANDOFF.md §6'])
    assert.deepEqual(await merge(f, { action: 'confirm', lesson: 'L-100000', reason: 'happened again', evidence: ['task:task-9'] }), { action: 'confirm', lesson: 'L-100000', status: 'active' })
    assert.equal((await refusalOf(merge(f, { action: 'confirm', lesson: 'L-100000', reason: 'no evidence' }))).code, 'invalid')
    assert.deepEqual(await statusOf(f, { text: 'worker comment' }), ['L-100000:active'])
    assert.deepEqual(await merge(f, { action: 'retire', lesson: 'L-100000', reason: 'fixed in the harness' }), { action: 'retire', lesson: 'L-100000', status: 'retired' })
    assert.deepEqual(await statusOf(f, { text: 'worker comment' }), [], 'a retired lesson is not found')
    assert.equal((await refusalOf(merge(f, { action: 'retire', lesson: 'L-100000', reason: 'twice' }))).code, 'stale')
    assert.deepEqual(await merge(f, { action: 'reopen', lesson: 'L-100000', reason: 'it came back' }), { action: 'reopen', lesson: 'L-100000', status: 'active' })
    assert.deepEqual(await statusOf(f, { text: 'worker comment' }), ['L-100000:active'])
  })
})

test('only the person deletes or restores a lesson: the agent quotes their words, and a deletion is a tombstone with a snapshot that nothing but the person undoes', async () => {
  await withFixture(async (f) => {
    await merge(f, LESSON)
    const refusal = await refusalOf(merge(f, { action: 'delete', lesson: 'L-100000', reason: 'noise' }))
    assert.deepEqual([refusal.code, refusal.hint], ['user_only', 'only the user deletes a lesson: quote their words in relay'])
    assert.deepEqual(await merge(f, { action: 'delete', lesson: 'L-100000', reason: 'the person asked', relay: 'Delete that lesson.' }), { action: 'delete', lesson: 'L-100000', status: 'deleted' })
    const deleted = f.journal().at(-1)
    assert.deepEqual([deleted?.op, deleted?.actor, deleted?.relay, (deleted?.data as { id: string, status: string }).id, (deleted?.data as { status: string }).status], ['delete', 'llm', 'Delete that lesson.', 'L-100000', 'active'], 'the snapshot is the lesson as it was')
    assert.deepEqual(await statusOf(f), [])
    assert.equal((await refusalOf(merge(f, { action: 'delete', lesson: 'L-100000', reason: 'twice', relay: 'Delete it.' }))).code, 'not_found')
    assert.equal((await refusalOf(merge(f, { action: 'reopen', lesson: 'L-100000', reason: 'I want it' }))).code, 'user_only')
    assert.equal((await refusalOf(merge(f, { action: 'restore', lesson: 'L-100000', reason: 'I want it' }))).code, 'user_only')
    assert.deepEqual(await merge(f, { action: 'restore', lesson: 'L-100000', reason: 'the person asked', relay: 'Bring it back.' }), { action: 'restore', lesson: 'L-100000', status: 'active' })
    assert.deepEqual(await statusOf(f), ['L-100000:active'])
    assert.equal((await refusalOf(merge(f, { action: 'restore', lesson: 'L-100000', reason: 'twice', relay: 'Bring it back.' }))).code, 'stale')
  })
})

test('a delegated child is refused with the way to hand back; it may query', async () => {
  await withFixture(async (f) => {
    const refusal = await refusalOf(f.call('lessons_merge', LESSON, CHILD))
    assert.equal(refusal.code, 'role')
    assert.ok(refusal.hint?.includes('handback'), refusal.hint)
    assert.deepEqual(f.journal(), [])
    await merge(f, LESSON)
    assert.deepEqual(((await f.call('lessons_query', { file: 'docs/graph/nodes/x.json' }, CHILD)).lessons as unknown[]).length, 1)
  })
})

test('a request that is not one is refused before anything is read: unknown fields, fields the action does not use, missing ones, secrets, bad evidence', async () => {
  await withFixture(async (f) => {
    const cases: ReadonlyArray<readonly [unknown, string, string | undefined]> = [
      ['text', 'invalid', undefined],
      [{ action: 'sort', reason: 'x' }, 'invalid', 'action'],
      [{ ...LESSON, scope: 'all' }, 'invalid', 'scope'],
      [{ action: 'retire', lesson: 'L-100000', reason: 'x', pitfall: 'not used here' }, 'invalid', 'pitfall'],
      [{ action: 'retire', lesson: 'L-100000', reason: 'x', candidate: 'C-100000' }, 'invalid', 'candidate'],
      [{ action: 'retire', reason: 'x' }, 'invalid', 'lesson'],
      [{ action: 'retire', lesson: 'nonsense', reason: 'x' }, 'invalid', 'lesson'],
      [{ action: 'into', lesson: 'L-100000', reason: 'x' }, 'invalid', 'candidate'],
      [{ action: 'reopen', reason: 'x' }, 'invalid', undefined],
      [{ action: 'reopen', reason: 'x', lesson: 'L-100000', candidate: 'C-100000' }, 'invalid', undefined],
      [{ action: 'revise', lesson: 'L-100000', reason: 'x' }, 'invalid', undefined],
      [{ action: 'new', reason: '' }, 'invalid', 'reason'],
      [{ action: 'new', reason: 'x'.repeat(301) }, 'invalid', 'reason'],
      [{ action: 'delete', lesson: 'L-100000', reason: 'x', relay: ' ' }, 'invalid', 'relay'],
      [{ ...LESSON, reason: `see ${TOKEN}` }, 'secret_like', 'reason'],
      [{ ...LESSON, pitfall: `A pitfall with ${TOKEN} in it.` }, 'secret_like', 'pitfall'],
      [{ ...LESSON, evidence: ['commit:xyz1234'] }, 'invalid', 'evidence'],
      [{ ...LESSON, evidence: [] }, 'invalid', 'evidence'],
      [{ ...LESSON, evidence: [`call:${TOKEN}`] }, 'secret_like', 'evidence'],
      [{ ...LESSON, situation: {} }, 'invalid', 'situation'],
      [{ ...LESSON, situation: { errors: ['short'] } }, 'invalid', 'situation.errors'],
      [{ ...LESSON, learnedFrom: ['not a key\nat all'] }, 'invalid', 'learnedFrom'],
      [{ ...LESSON, pitfall: 'x\ny' }, 'invalid', 'pitfall'],
    ]
    for (const [args, code, field] of cases) {
      const refusal = await refusalOf(merge(f, args))
      assert.deepEqual([refusal.code, refusal.field], [code, field], JSON.stringify(args))
    }
    assert.deepEqual(f.journal(), [])
  })
})

test('a session without a project cannot merge, and a journal that cannot be read or written is io; nothing is invented', async () => {
  await withFixture(async (f) => {
    assert.equal((await refusalOf(merge(f, LESSON))).code, 'no_project')
    assert.deepEqual(await f.call('lessons_query', { text: 'anything' }), { lessons: [], more: 0, notes: ['this session has no project, so there are no lessons to search'] })
  }, { dirOf: () => undefined })
  await withFixture(async (f) => {
    mkdirSync(journalFile(f.dir), { recursive: true }) // a directory where the journal should be
    assert.equal((await refusalOf(merge(f, LESSON))).code, 'io')
    assert.equal((await refusalOf(f.call('lessons_query', { text: 'anything' }))).code, 'io')
  })
})

test('lessons_query takes at least one condition, ranks the active lessons, lists open candidates after them as unreviewed, and says how many it left out', async () => {
  await withFixture(async (f) => {
    for (const bad of [{}, { limit: 3 }, { text: ' ' }, { text: 'x', limit: 0 }, { text: 'x', limit: 11 }, { text: 'x', includeCandidates: 'yes' }, { text: 'x', unknown: 1 }, 'text', { error: 'x'.repeat(6001) }]) {
      assert.equal((await refusalOf(f.call('lessons_query', bad))).code, 'invalid', JSON.stringify(bad))
    }
    await merge(f, LESSON)
    await merge(f, { ...LESSON, reason: 'second', situation: { files: ['docs/graph/**'], errors: ['another graph error piece'] }, pitfall: 'A second pitfall about the worker and the graph.', fix: 'Fix two.' })
    await merge(f, { ...LESSON, reason: 'third', situation: { files: ['docs/graph/**'], errors: ['a third graph error piece'] }, pitfall: 'A third pitfall about the worker and the graph.', fix: 'Fix three.' })
    await propose(f, { ...CANDIDATE, problem: 'A candidate about the worker and the graph.', errors: ['candidate graph error piece'] })
    await propose(f, { ...CANDIDATE, problem: 'A second candidate about the worker.', errors: ['second candidate error piece'] })
    await propose(f, { ...CANDIDATE, problem: 'A third candidate about the worker.', errors: ['third candidate error piece'] })
    const found = await f.call('lessons_query', { text: 'worker graph', limit: 2 })
    const entries = found.lessons as Array<{ id: string, status: string, unreviewed?: boolean, when: string }>
    assert.deepEqual(entries.map(entry => entry.status), ['active', 'active', 'candidate', 'candidate'])
    assert.deepEqual(entries.filter(entry => entry.status === 'candidate').map(entry => entry.unreviewed), [true, true])
    assert.equal(entries[0]?.when.startsWith('files docs/graph/**'), true, entries[0]?.when)
    assert.equal(found.more, 2, 'one lesson and one candidate left out')
    assert.deepEqual(Object.keys(entries[0] ?? {}).sort(), ['evidence', 'fix', 'id', 'lastConfirmed', 'pitfall', 'score', 'status', 'when'])
    assert.deepEqual(((await f.call('lessons_query', { text: 'worker graph', includeCandidates: false })).lessons as Array<{ status: string }>).map(entry => entry.status), ['active', 'active', 'active'])
    assert.deepEqual(((await f.call('lessons_query', { error: 'error: graph write refused here, exit 1' })).lessons as Array<{ id: string }>)[0]?.id, 'L-100000')
    assert.deepEqual(((await f.call('lessons_query', { file: 'docs/graph/nodes/x.json', command: 'git commit -m x' })).lessons as Array<{ id: string }>)[0]?.id, 'L-100000')
  })
})
