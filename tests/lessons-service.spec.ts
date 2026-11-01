/**
 * The service of the lessons row and what feeds it (M5 design §4.2, §4.3,
 * §4.9, §8.1; acceptance lessons-1 items 1, 2, 4, 7): how a worker's
 * candidate is taken, merged, dropped or refused, the lessons a brief gets,
 * the statistics and the hygiene findings, and the candidates that M7 left as
 * notes on the graph. The journal, the lock and the graph are real files in
 * temporary directories; the graph is written by the real engine.
 */
import assert from 'node:assert/strict'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { openEngine } from '../src/graph/engine.ts'
import { annotationsOf, candidateOf, createImporter } from '../src/lessons/import.ts'
import { acceptCandidate } from '../src/lessons/service.ts'
import { journalFile } from '../src/lessons/storage.ts'
import type { ServiceLookup } from '../src/shared/dsh-min.ts'
import { CANDIDATE, LESSON, MAIN_SESSION, NOW, withFixture, type LessonsFixture } from './lessons-helpers.ts'

const native = (tool: string): string => tool === 'Bash' ? 'pwsh' : tool
/** A secret-shaped token, built so that this file holds none. */
const TOKEN = ['ghp', 'x'.repeat(36)].join('_')
const SECOND = 1000


test('a candidate input becomes the fields of the model: native tool names, short error pieces left out and said, scope read and not used', () => {
  const accepted = acceptCandidate({ ...CANDIDATE, errors: ['garbled Chinese text', 'short'], scope: 'all' }, native)
  assert.ok('fields' in accepted)
  assert.deepEqual(accepted.fields.situation, { files: ['tests/fixtures/**'], tools: ['pwsh'], commands: ['Get-Content'], errors: ['garbled Chinese text'] })
  assert.equal(accepted.fields.pitfall, CANDIDATE.problem)
  assert.equal(accepted.notes.length, 2)
  assert.ok(accepted.notes[0]?.includes('left out 1 error piece'), accepted.notes[0])
  assert.ok(accepted.notes[1]?.includes('stored in this project'), accepted.notes[1])
  const inProject = acceptCandidate({ ...CANDIDATE, scope: 'project' }, native)
  assert.ok('fields' in inProject && inProject.notes.length === 0, 'scope project says nothing')
})

test('a candidate input that does not hold is refused with the field in the handback\'s words, and a secret is refused as one', () => {
  const refusal = (input: unknown): unknown => (acceptCandidate(input, native) as { rejected: unknown }).rejected
  assert.deepEqual(refusal({ ...CANDIDATE, problem: '' }), { code: 'invalid', message: 'pitfall must be one line of 1 to 300 characters', field: 'problem' })
  assert.deepEqual(refusal({ ...CANDIDATE, scope: 'world' }), { code: 'invalid', message: 'scope must be "project" or "all"', field: 'scope' })
  assert.deepEqual(refusal({ ...CANDIDATE, files: 'tests' }), { code: 'invalid', message: 'files must be a list of text', field: 'files' })
  assert.equal((refusal({ ...CANDIDATE, fix: `Use ${TOKEN} to log in.` }) as { code: string, field: string }).code, 'secret_like')
  assert.equal((refusal({ ...CANDIDATE, fix: `Use ${TOKEN} to log in.` }) as { field: string }).field, 'fix')
  assert.equal((refusal({ ...CANDIDATE, files: [], commands: [], tools: [], errors: ['tiny'] }) as { field: string }).field, 'situation')
  assert.equal((refusal(null) as { code: string }).code, 'invalid')
})

test('propose keeps a candidate with the evidence the harness composes, and says what it left out', async () => {
  await withFixture(async (f) => {
    const commit = 'a'.repeat(40)
    const result = await f.service.propose({ ...CANDIDATE, scope: 'all' }, { session: MAIN_SESSION, task: 'task-3', childId: 'session-abc', commit })
    assert.deepEqual(result, { status: 'candidate', id: 'C-100000', notes: ['scope "all" is not used: lessons belong to the project, so this one is stored in this project'] })
    const [record, ...more] = f.journal()
    assert.equal(more.length, 0)
    assert.deepEqual([record?.op, record?.actor, record?.id], ['propose', 'harness', 'C-100000'])
    assert.deepEqual(record?.evidence, ['task:task-3', 'session:session-abc', `commit:${commit}`])
    assert.deepEqual(record?.by, { session: 'main-session', tool: 'propose' })
    assert.deepEqual((record?.data as { situation: { tools: string[] } }).situation.tools, ['pwsh'])
  })
})

test('propose leaves out a context value that is not an id and keeps the candidate: the commit, and the child session that stands for the dispatching one', async () => {
  await withFixture(async (f) => {
    const result = await f.service.propose(CANDIDATE, { session: MAIN_SESSION, task: 'Task 3', childId: 'a child', commit: 'xyz' })
    assert.equal('id' in result, true)
    assert.deepEqual('notes' in result ? result.notes : [], [
      'ignored context.task: it is not a task id',
      'ignored context.childId: it is not a session id; the dispatching session stands for the worker',
      'ignored context.commit: it is not 7 to 40 hex digits',
    ])
    assert.deepEqual(f.journal()[0]?.evidence, ['session:main-session'])
  })
})

test('propose merges a candidate with the signature of a lesson into it, and drops one that matches a lesson the person deleted', async () => {
  await withFixture(async (f) => {
    await f.call('lessons_merge', LESSON)
    const same = { problem: 'A worker committed a graph comment on main.', fix: 'Hand it back.', files: [], commands: [], tools: [], errors: ['graph write refused here'] }
    assert.deepEqual(await f.service.propose(same, { session: MAIN_SESSION, task: 'task-4' }), { status: 'merged', id: 'C-100001' })
    assert.deepEqual(f.journal().map(record => record.op), ['new', 'propose', 'into'])
    assert.equal(((await f.call('lessons_query', { text: 'worker graph' })).lessons as Array<{ id: string }>).length, 1)
    await f.call('lessons_merge', { action: 'delete', lesson: 'L-100000', reason: 'the person asked', relay: 'Delete that lesson.' })
    assert.deepEqual(await f.service.propose(same, { session: MAIN_SESSION, task: 'task-5' }), { status: 'dropped', id: 'C-100002' })
    const last = f.journal().at(-1)
    assert.deepEqual([last?.op, last?.actor, last?.reason?.startsWith('matches L-100000 the user deleted on 2026-11-01')], ['drop', 'harness', true])
  })
})

test('propose refuses a candidate that does not hold or looks like a secret: nothing is written and the refusal is counted', async () => {
  await withFixture(async (f) => {
    const secret = await f.service.propose({ ...CANDIDATE, fix: `Use ${TOKEN} to log in.` }, { session: MAIN_SESSION })
    assert.deepEqual(secret, { status: 'rejected', code: 'secret_like', field: 'fix' })
    const empty = await f.service.propose({ ...CANDIDATE, files: [], commands: [], tools: [], errors: [] }, { session: MAIN_SESSION })
    assert.deepEqual(empty, { status: 'rejected', code: 'invalid', field: 'situation' })
    assert.deepEqual(f.journal(), [])
    assert.deepEqual([...f.env.counters.rejected], [['secret_like', 1], ['invalid', 1]])
    assert.equal(f.env.counters.failed.size, 0, 'a refusal is not a failure of the service')
  })
})

test('propose reports a service failure as an error and never rejects: no project, a directory that cannot be made, garbage in', async () => {
  await withFixture(async (f) => {
    const none = await f.service.propose(CANDIDATE, { session: MAIN_SESSION })
    assert.equal('error' in none && none.error, 'no_project')
  }, { dirOf: () => undefined })
  await withFixture(async (f) => {
    writeFileSync(join(f.root, 'blocked'), 'a file where a folder should be')
    const failed = await f.service.propose(CANDIDATE, { session: MAIN_SESSION })
    assert.equal('error' in failed && failed.error, 'io')
    assert.ok('message' in failed && failed.message.includes('directory'), JSON.stringify(failed))
    assert.deepEqual([...f.env.counters.failed], [join(f.root, 'blocked', 'lessons')])
    assert.equal(f.notes.at(-1)?.key, 'directory')
  }, { dirOf: root => join(root, 'blocked', 'lessons') })
  await withFixture(async (f) => {
    assert.deepEqual(await f.service.propose(null as never, undefined as never), { status: 'rejected', code: 'invalid' })
    assert.equal('error' in await f.service.propose(CANDIDATE, undefined as never) && true, true)
  })
})

test('relevant gives the brief the lessons that score two or more, in the project of the session, and nothing for a tool alone', async () => {
  await withFixture(async (f) => {
    await f.call('lessons_merge', { ...LESSON, situation: { ...LESSON.situation, tools: ['Bash'] } })
    await f.call('lessons_merge', { action: 'new', reason: 'a second one', situation: { tools: ['pwsh'] }, pitfall: 'A pwsh call hangs when stdin is a terminal.', fix: 'Pass -NonInteractive.', evidence: ['docs/HANDOFF.md'] })
    const asked = (paths: string[], tools: string[], commands: string[], limit?: number) => f.service.relevant({ session: MAIN_SESSION, paths, tools, commands, ...(limit === undefined ? {} : { limit }) })
    const found = await asked(['docs/graph/nodes/x.json'], [], [])
    assert.deepEqual(found.map(entry => entry.id), ['L-100000'])
    assert.equal(found[0]?.line.startsWith('L-100000: when files docs/graph/**'), true, found[0]?.line)
    assert.deepEqual(Object.keys(found[0] ?? {}).sort(), ['fix', 'id', 'line', 'problem', 'when'])
    assert.deepEqual(await asked([], ['Bash'], []), [], 'a tool alone is one point: noise in a brief')
    assert.deepEqual((await asked([], ['Bash'], ['git commit -m x'])).map(entry => entry.id), ['L-100000'], 'a command and the tool: three points')
    assert.deepEqual(await asked(['docs/graph/**', 'docs/other'], ['Bash'], ['git commit'], 0), [await asked(['docs/graph/**'], ['Bash'], ['git commit'])].flat().slice(0, 1), 'a limit below 1 is 1')
    assert.deepEqual(await f.service.relevant(null as never), [], 'garbage in gives no lessons')
    assert.deepEqual(await f.service.relevant({ session: MAIN_SESSION, paths: 'docs' as never, tools: [1] as never, commands: [] }), [])
  })
  await withFixture(async (f) => {
    assert.deepEqual(await f.service.relevant({ session: MAIN_SESSION, paths: ['x'], tools: [], commands: [] }), [], 'no project, no lessons')
  }, { dirOf: () => undefined })
})

test('relevant answers with nothing when the journal cannot be read, and the health hears why', async () => {
  await withFixture(async (f) => {
    mkdirSync(journalFile(f.dir), { recursive: true })
    assert.deepEqual(await f.service.relevant({ session: MAIN_SESSION, paths: ['x'], tools: [], commands: ['x'] }), [])
    assert.equal(f.notes.at(-1)?.key, 'read')
    assert.ok(f.notes.at(-1)?.text?.includes('经验读不出'), f.notes.at(-1)?.text)
    const stats = await f.service.stats(MAIN_SESSION, '2026-10-01T00:00:00Z', '2026-12-01T00:00:00Z')
    assert.deepEqual([stats.added, stats.openCandidates], [0, 0])
    assert.ok(f.notes.at(-1)?.text?.includes('统计给了零'), f.notes.at(-1)?.text)
    assert.deepEqual((await f.service.hygiene(MAIN_SESSION, '2026-11-01T00:00:00Z')).map(finding => finding.kind), ['bad-lines'])
  })
})

test('stats count what the period did, the candidates still open and the sessions each lesson touched; hygiene lists what to look at', async () => {
  await withFixture(async (f) => {
    const at = (iso: string): void => { f.setNow(new Date(iso)) }
    at('2026-10-20T10:00:00Z')
    await f.service.propose({ ...CANDIDATE, errors: ['an old error piece'] }, { session: MAIN_SESSION, task: 'task-1' })
    at('2026-10-25T10:00:00Z')
    await f.call('lessons_merge', { action: 'new', reason: 'worth keeping', candidate: 'C-100000' })
    await f.call('lessons_merge', { ...LESSON, reason: 'another' })
    at('2026-10-26T10:00:00Z')
    await f.call('lessons_merge', { action: 'delete', lesson: 'L-100001', reason: 'asked', relay: 'Delete it.' })
    at('2026-10-27T10:00:00Z')
    await f.call('lessons_merge', { action: 'restore', lesson: 'L-100001', reason: 'asked', relay: 'Bring it back.' })
    await f.service.propose({ problem: 'Another worker met the same thing.', fix: 'Hand it back.', files: [], commands: [], tools: [], errors: ['graph write refused here'] }, { session: { ...MAIN_SESSION, id: 'session-worker-2' }, task: 'task-2' })
    at('2026-10-28T10:00:00Z')
    await f.service.propose({ problem: 'A new thing.', fix: 'Do it differently.', files: ['src/**'], commands: [], tools: [], errors: [] }, { session: MAIN_SESSION, task: 'task-3' })
    const stats = await f.service.stats(MAIN_SESSION, '2026-10-24T00:00:00Z', '2026-10-30T00:00:00Z')
    assert.deepEqual({ ...stats, rejected: undefined }, {
      added: 2, merged: 1, dropped: 0, expired: 0, deleted: 1, restored: 1, recurredAfterDeletion: 0,
      openCandidates: 1, oldestCandidateDays: 0,
      sessions: [{ lesson: 'L-100002', sessions: 1 }],
      rejected: undefined,
    })
    assert.deepEqual(await f.service.stats(MAIN_SESSION, '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z'), { added: 0, merged: 0, dropped: 0, expired: 0, deleted: 0, restored: 0, recurredAfterDeletion: 0, openCandidates: 1, oldestCandidateDays: 0, sessions: [], rejected: {} })

    at('2026-11-05T10:00:00Z')
    await f.call('lessons_merge', { ...LESSON, reason: 'told another way', situation: { files: ['docs/other/**'] } })
    appendFileSync(journalFile(f.dir), 'not a record\n')
    const kinds = (await f.service.hygiene(MAIN_SESSION, '2027-06-01T00:00:00Z')).map(finding => `${finding.kind}:${finding.id ?? ''}`).sort()
    assert.deepEqual(kinds, ['bad-lines:', 'old-candidate:C-100004', 'similar:L-100002', 'unconfirmed:L-100001', 'unconfirmed:L-100002', 'unconfirmed:L-100005'])
  })
})

// --- Candidates left as notes on the graph --------------------------------------

const TASK_NOTE = (json: object, text = 'Pitfall found while testing the fixtures'): string => `[候选经验] ${text} ${JSON.stringify(json)}`
const NOTE_JSON = { problem: CANDIDATE.problem, fix: CANDIDATE.fix, files: CANDIDATE.files, commands: CANDIDATE.commands, tools: CANDIDATE.tools, errors: CANDIDATE.errors, scope: 'all' }

/** A graph with one goal in a temporary folder, and the importer that reads it for the lessons of `f`. */
async function graphOf(f: LessonsFixture): Promise<{ readonly engine: ReturnType<typeof openEngine>, readonly importer: ReturnType<typeof createImporter> }> {
  const graphDir = join(f.root, 'graph')
  let ticks = 0
  const engine = openEngine(graphDir, { now: () => new Date(f.env.now().getTime() - 3_600_000 + (ticks++) * SECOND) })
  assert.ok((await engine.apply('human', { op: 'propose', reason: 'seed', node: { type: 'goal', title: '目标' } })).ok)
  const ctx: ServiceLookup = { get: name => name === 'glmHournessGraph' ? { dirFor: () => graphDir, isGraphTool: () => false } : undefined }
  return { engine, importer: createImporter(ctx, f.env) }
}

const note = async (engine: ReturnType<typeof openEngine>, text: string, actor: 'harness' | 'llm' = 'harness'): Promise<void> => {
  assert.ok((await engine.apply(actor, { op: 'comment', id: 'goal-1', text })).ok)
}

test('a note of the harness that starts with [候选经验] is read: the JSON at its end is the candidate, the omitted fields are empty, a sentence alone is not enough', () => {
  const annotation = (text: string) => ({ key: 'goal-1@2026-11-01T12:00:00.000Z', node: 'goal-1', at: '2026-11-01T12:00:00.000Z', text })
  assert.deepEqual(candidateOf(annotation(TASK_NOTE(NOTE_JSON))), NOTE_JSON)
  assert.deepEqual(candidateOf(annotation(TASK_NOTE({ problem: '（像密钥，已略去）', files: ['a/**', '（像密钥，已略去）'] }, 'text with a { brace'))), { problem: '', files: ['a/**'] })
  assert.deepEqual(candidateOf(annotation('[候选经验] A sentence only')), { problem: 'A sentence only', fix: 'see the annotation on goal-1', files: [], commands: [], tools: [], errors: [] })
  assert.equal((candidateOf(annotation(`[候选经验] ${'x'.repeat(400)}`)).problem as string).length, 300)
  const nodes = new Map([['goal-1', { id: 'goal-1', history: [
    { at: '2026-11-01T12:00:00.000Z', actor: 'harness', op: 'comment', text: '[候选经验] one' },
    { at: '2026-11-01T12:01:00.000Z', actor: 'llm', op: 'comment', text: '[候选经验] by an agent: not the harness' },
    { at: '2026-11-01T12:02:00.000Z', actor: 'harness', op: 'comment', text: 'another note' },
    { at: '2026-11-01T12:03:00.000Z', actor: 'harness', op: 'status', text: '[候选经验] not a comment' },
  ] }]]) as never
  assert.deepEqual(annotationsOf(nodes).map(item => item.key), ['goal-1@2026-11-01T12:00:00.000Z'])
})

test('the importer keeps a note as a candidate once, refuses one that is a secret or names no situation, and keeps a repeat out', async () => {
  await withFixture(async (f) => {
    const { engine, importer } = await graphOf(f)
    await note(engine, TASK_NOTE(NOTE_JSON))
    await note(engine, TASK_NOTE({ ...NOTE_JSON, fix: `Use ${TOKEN} to log in.` }))
    await note(engine, TASK_NOTE({ ...NOTE_JSON, problem: 'The same pitfall, told again.' }))
    await note(engine, '[候选经验] A sentence without a situation')
    await note(engine, 'A note that is not a candidate')
    await importer.run(MAIN_SESSION, f.dir)
    const records = f.journal()
    assert.deepEqual(records.map(record => `${record.op}:${record.id.startsWith('goal-1@') ? 'goal-1@' : record.id}`), ['propose:C-100000', 'import:goal-1@', 'import:goal-1@', 'import:goal-1@', 'import:goal-1@'])
    assert.deepEqual(records.map(record => JSON.stringify(record.data).slice(0, 40)).slice(1), ['{"candidate":"C-100000"}', '{"rejected":"secret_like"}', '{"duplicateOf":"C-100000"}', '{"rejected":"invalid"}'])
    assert.deepEqual(records[0]?.evidence?.map(item => item.split('@')[0]), ['task:goal-1', 'node:goal-1'])
    assert.ok(records[0]?.evidence?.[1]?.endsWith('Z') && !records[0].evidence[1].includes('.'), records[0]?.evidence?.[1])
    assert.deepEqual(records[0]?.by, { session: 'main-session', tool: 'import' })
    assert.deepEqual([...f.env.counters.rejected], [['secret_like', 1], ['invalid', 1]])
    // A new importer (a new process) looks at the whole graph again and tries nothing it tried before.
    const again = createImporter({ get: name => name === 'glmHournessGraph' ? { dirFor: () => join(f.root, 'graph'), isGraphTool: () => false } : undefined }, f.env)
    await again.run(MAIN_SESSION, f.dir)
    assert.equal(f.journal().length, 5)
    assert.ok(!JSON.stringify(f.journal()).includes(TOKEN), 'the token did not get into the journal')
  })
})

test('the importer looks again only when a minute has passed and the graph has changed, or at once after a propose failed', async () => {
  await withFixture(async (f) => {
    const { engine, importer } = await graphOf(f)
    await importer.run(MAIN_SESSION, f.dir)
    assert.deepEqual(f.journal(), [], 'nothing to import: nothing written')
    await note(engine, TASK_NOTE(NOTE_JSON))
    f.setNow(new Date(NOW.getTime() + 30 * SECOND))
    await importer.run(MAIN_SESSION, f.dir)
    assert.deepEqual(f.journal(), [], 'half a minute is too soon')
    f.setNow(new Date(NOW.getTime() + 61 * SECOND))
    await importer.run(MAIN_SESSION, f.dir)
    assert.deepEqual(f.journal().map(record => record.op), ['propose', 'import'])
    await note(engine, TASK_NOTE({ ...NOTE_JSON, problem: 'A different pitfall.', errors: ['another error piece'] }))
    f.setNow(new Date(NOW.getTime() + 90 * SECOND))
    await importer.run(MAIN_SESSION, f.dir)
    assert.equal(f.journal().length, 2, 'the new note waits for the minute')
    f.env.counters.failed.add(f.dir)
    await importer.run(MAIN_SESSION, f.dir)
    assert.deepEqual(f.journal().map(record => record.op), ['propose', 'import', 'propose', 'import'], 'after a failure the check does not wait')
    assert.equal(f.env.counters.failed.size, 0)
    f.setNow(new Date(NOW.getTime() + 200 * SECOND))
    await importer.run(MAIN_SESSION, f.dir)
    assert.equal(f.journal().length, 4, 'the graph did not change: nothing to look at')
  })
})

test('the importer does nothing without the graph row, and a graph folder that is not there is an empty graph', async () => {
  await withFixture(async (f) => {
    await createImporter({ get: () => undefined }, f.env).run(MAIN_SESSION, f.dir)
    assert.deepEqual([f.journal(), f.notes], [[], []])
    const broken = join(f.root, 'not-a-graph')
    writeFileSync(broken, 'a file where the graph folder should be')
    const importer = createImporter({ get: name => name === 'glmHournessGraph' ? { dirFor: () => join(broken, 'docs', 'graph'), isGraphTool: () => false } : undefined }, f.env)
    await importer.run(MAIN_SESSION, f.dir)
    assert.deepEqual(f.journal(), [])
  })
})
