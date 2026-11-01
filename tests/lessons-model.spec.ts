/**
 * The lessons model (M5 design §4.1, §4.2, §5.2, §7.5): the field checks a
 * lesson or candidate goes through, the signature and the similarity of two
 * lessons, who may delete or restore, the fold of a lessons journal for each
 * of its fourteen operations (and the refusal code behind each bad line),
 * what a proposed candidate becomes, the evidence composed from a handback's
 * context, the id that does not collide, and the fold running behind the
 * real journal. Secret-shaped samples are assembled from parts so that no
 * line of this file is a token for the repository's secret scan.
 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { foldRecords, type Folded } from './fold-helpers.ts'
import { appendJournal, readJournal, type Actor, type JournalRecord, type JsonValue, type NewRecord } from '../src/data/journal.ts'
import {
  applyRecord, candidateEvidence, checkCandidateFields, checkLessonFields, checkSituation, emptyLessons, judgeRecord, lessonsFold, newId,
  proposeRecords, signature, similar, userOnly, type Candidate, type CandidateFields, type Lesson, type LessonsState, type Refusal, type Situation,
} from '../src/lessons/model.ts'

const GHP = ['ghp', '_'].join('') + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'
const SHA40 = 'cae6ddf1a2b3c4d5e6f708192a3b4c5d6e7f8091'

const T0 = '2026-11-01T08:00:00.000Z'
const day = (from: string, days: number): string => new Date(Date.parse(from) + days * 86_400_000).toISOString()

interface Fields {
  readonly situation: Partial<Situation>
  readonly pitfall: string
  readonly fix: string
  readonly evidence: readonly string[]
}

/** The example of design §4.2.2, the one `lessons_merge`'s description carries. */
const RESIZE: Fields = {
  situation: { files: ['tools/resize/**'], commands: ['resize-batch'], errors: ['EMFILE: too many open files'] },
  pitfall: 'resize-batch opens every source image at once and fails with EMFILE when the folder holds more than about 1000 files.',
  fix: 'Run it with --chunk 200, or split the folder first. The exit code is 0 even when files were skipped, so count the outputs.',
  evidence: ['commit:3fa9c21d7be0'],
}

const ENCODING: Fields = {
  situation: { files: ['tests/fixtures/**'], commands: ['Get-Content'] },
  pitfall: 'Get-Content without -Encoding garbled the Chinese text in a fixture',
  fix: 'Pass -Encoding utf8 when reading fixtures with Windows PowerShell 5.1.',
  evidence: ['docs/DEVELOPMENT.md §7'],
}

const without = <Fields extends { readonly evidence: unknown }>({ evidence: _evidence, ...rest }: Fields) => rest

const refusal = (raw: Readonly<Record<string, unknown>>): Refusal => {
  const result = checkLessonFields(raw)
  assert.ok('code' in result, 'expected a refusal')
  return result
}

const situation = (parts: Partial<Situation>): Situation => ({ files: [], tools: [], commands: [], errors: [], ...parts })

// --- Records and folding -----------------------------------------------------

let seq = 0
interface Extra {
  readonly data?: JsonValue
  readonly evidence?: readonly string[]
  readonly relay?: string
  readonly reason?: string
  readonly by?: JournalRecord['by']
}
const rec = (actor: Actor, op: string, id: string, extra: Extra = {}, time: string = T0): JournalRecord => ({ v: 1, seq: ++seq, at: time, actor, op, id, ...extra })

const SESSION_A = { session: 'session-a', agent: 'agent-1' }

const CAND = 'C-1a2b3c'
const CAND2 = 'C-77e0d1'
const LESSON = 'L-0f12aa'
const LESSON2 = 'L-3f9a2c'

const proposeRec = (id: string, fields: object = without(RESIZE), evidence: readonly string[] = ['task:task-3', 'session:child-1', `commit:${SHA40}`], time: string = T0): JournalRecord =>
  rec('harness', 'propose', id, { data: fields as unknown as JsonValue, evidence, by: { session: 'session-main' } }, time)
const newRec = (id: string, fields: Fields = RESIZE, extra: Partial<Extra> & { readonly actor?: Actor, readonly candidate?: string } = {}, time: string = T0): JournalRecord =>
  rec(extra.actor ?? 'llm', 'new', id, {
    data: { ...without(fields), ...(extra.candidate === undefined ? {} : { candidate: extra.candidate }) } as unknown as JsonValue,
    evidence: fields.evidence,
    by: SESSION_A,
    ...(extra.relay === undefined ? {} : { relay: extra.relay }),
  }, time)

/** The records a plan hands over, as the journal would write them. */
const journalOf = (records: readonly NewRecord[], time: string = T0): JournalRecord[] => records.map(record => ({ v: 1, seq: ++seq, at: time, ...record }))

/** The fields of a candidate from the fields of a lesson. */
const candidateFields = (fields: Fields): CandidateFields => ({ situation: situation(fields.situation), pitfall: fields.pitfall, fix: fields.fix })

const foldAll = (records: readonly JournalRecord[], from: LessonsState = emptyLessons()): Folded<LessonsState> => foldRecords(applyRecord, records, from)

const lessonOf = (state: LessonsState, id: string): Lesson => {
  const lesson = state.lessons.get(id)
  assert.ok(lesson !== undefined, `no lesson ${id}`)
  return lesson
}
const candidateOf = (state: LessonsState, id: string): Candidate => {
  const candidate = state.candidates.get(id)
  assert.ok(candidate !== undefined, `no candidate ${id}`)
  return candidate
}
const codeOf = (state: LessonsState, record: JournalRecord): string => {
  const result = judgeRecord(state, record)
  return 'code' in result ? result.code : 'ok'
}
const ok = (records: readonly JournalRecord[], from?: LessonsState): LessonsState => {
  const { state, bad } = foldAll(records, from)
  assert.deepEqual(bad, [])
  return state
}

// --- Field checks ---------------------------------------------------------------

test('the design example is taken; the situation lists default to empty and the evidence is kept as written', () => {
  const taken = checkLessonFields(RESIZE)
  assert.ok(!('code' in taken))
  assert.deepEqual(taken.situation, { files: ['tools/resize/**'], tools: [], commands: ['resize-batch'], errors: ['EMFILE: too many open files'] })
  assert.deepEqual(taken.evidence, ['commit:3fa9c21d7be0'])
  assert.equal(taken.learnedFrom, undefined)
  const candidate = checkCandidateFields(without(RESIZE))
  assert.ok(!('code' in candidate))
  assert.equal(candidate.pitfall, RESIZE.pitfall)
})

test('each field rule refuses with its code and field', () => {
  const cases: ReadonlyArray<readonly [string, Record<string, unknown>, string, string]> = [
    ['no situation', { ...RESIZE, situation: undefined }, 'invalid', 'situation'],
    ['a situation that is a list', { ...RESIZE, situation: ['a.ts'] }, 'invalid', 'situation'],
    ['an empty situation', { ...RESIZE, situation: { files: [], errors: [] } }, 'invalid', 'situation'],
    ['an unknown situation key', { ...RESIZE, situation: { ...RESIZE.situation, colour: ['red'] } }, 'invalid', 'situation.colour'],
    ['a prototype key in the situation', { ...RESIZE, situation: { ...RESIZE.situation, toString: ['x'] } }, 'invalid', 'situation.toString'],
    ['21 files', { ...RESIZE, situation: { files: Array.from({ length: 21 }, (_, index) => `src/${index}.ts`) } }, 'invalid', 'situation.files'],
    ['11 tools', { ...RESIZE, situation: { tools: Array.from({ length: 11 }, (_, index) => `tool${index}`) } }, 'invalid', 'situation.tools'],
    ['11 commands', { ...RESIZE, situation: { commands: Array.from({ length: 11 }, (_, index) => `cmd${index}`) } }, 'invalid', 'situation.commands'],
    ['6 error fragments', { ...RESIZE, situation: { errors: Array.from({ length: 6 }, (_, index) => `error fragment ${index}`) } }, 'invalid', 'situation.errors'],
    ['an error fragment of 7 characters', { ...RESIZE, situation: { errors: ['EMFILE:'] } }, 'invalid', 'situation.errors'],
    ['an error fragment of 301 characters', { ...RESIZE, situation: { errors: ['e'.repeat(301)] } }, 'invalid', 'situation.errors'],
    ['an error fragment of two lines', { ...RESIZE, situation: { errors: ['first line here\nsecond line'] } }, 'invalid', 'situation.errors'],
    ['a file that is not text', { ...RESIZE, situation: { files: [7] } }, 'invalid', 'situation.files'],
    ['an absolute file path', { ...RESIZE, situation: { files: ['/etc/hosts'] } }, 'invalid', 'situation.files'],
    ['a drive path', { ...RESIZE, situation: { files: ['C:/work/x.ts'] } }, 'invalid', 'situation.files'],
    ['a path that climbs out of the repo', { ...RESIZE, situation: { files: ['../outside/x.ts'] } }, 'invalid', 'situation.files'],
    ['a tool name with a space', { ...RESIZE, situation: { tools: ['my tool'] } }, 'invalid', 'situation.tools'],
    ['a command of 101 characters', { ...RESIZE, situation: { commands: ['c'.repeat(101)] } }, 'invalid', 'situation.commands'],
    ['a command of two lines', { ...RESIZE, situation: { commands: ['a\nb'] } }, 'invalid', 'situation.commands'],
    ['no pitfall', { ...RESIZE, pitfall: undefined }, 'invalid', 'pitfall'],
    ['a blank pitfall', { ...RESIZE, pitfall: '   ' }, 'invalid', 'pitfall'],
    ['a pitfall of 301 characters', { ...RESIZE, pitfall: 'p'.repeat(301) }, 'invalid', 'pitfall'],
    ['a pitfall of two lines', { ...RESIZE, pitfall: 'one\ntwo' }, 'invalid', 'pitfall'],
    ['a fix of 601 characters', { ...RESIZE, fix: 'f'.repeat(601) }, 'invalid', 'fix'],
    ['no fix', { ...RESIZE, fix: '' }, 'invalid', 'fix'],
    ['no evidence', { ...RESIZE, evidence: undefined }, 'invalid', 'evidence'],
    ['an empty evidence list', { ...RESIZE, evidence: [] }, 'invalid', 'evidence'],
    ['nine evidence items', { ...RESIZE, evidence: Array.from({ length: 9 }, (_, index) => `docs/${index}.md`) }, 'invalid', 'evidence'],
    ['evidence that is not text', { ...RESIZE, evidence: [3] }, 'invalid', 'evidence'],
    ['a commit that is not hex', { ...RESIZE, evidence: ['commit:xyz1234'] }, 'invalid', 'evidence'],
    ['a node id with capitals', { ...RESIZE, evidence: ['node:Recommend_Last'] }, 'invalid', 'evidence'],
    ['six learned-from keys', { ...RESIZE, learnedFrom: ['a', 'b', 'c', 'd', 'e', 'f'] }, 'invalid', 'learnedFrom'],
    ['a learned-from key with a space at the end', { ...RESIZE, learnedFrom: ['edit:goal.stage '] }, 'invalid', 'learnedFrom'],
  ]
  for (const [what, raw, code, field] of cases) {
    const refused = refusal(raw)
    assert.equal(refused.code, code, what)
    assert.equal(refused.field, field, what)
    assert.ok(refused.message.length > 0, what)
  }
  assert.match(refusal({ ...RESIZE, evidence: ['commit:xyz1234'] }).message, /evidence\[0\]/)
  assert.ok(!('code' in checkLessonFields({ ...RESIZE, learnedFrom: ['edit:goal.stage', 'edit:task.acceptance'] })))
})

test('a full 40-digit commit id is evidence, in both forms; a hash-shaped pitfall is not a secret', () => {
  assert.ok(!('code' in checkLessonFields({ ...RESIZE, evidence: [`commit:${SHA40}`, SHA40.slice(0, 7)] })))
  assert.ok(!('code' in checkLessonFields({ ...RESIZE, pitfall: 'The build writes reference/ZCode/apps/zcode-cli/packages/core/src/context/sections/memory.ts twice' })))
})

test('text that looks like a secret is refused as secret_like, naming the field and not echoing the text', () => {
  const cases: ReadonlyArray<readonly [string, Record<string, unknown>, string]> = [
    ['the pitfall', { ...RESIZE, pitfall: `The deploy script prints ${GHP} into its log` }, 'pitfall'],
    ['the fix', { ...RESIZE, fix: `Export GH_TOKEN=${GHP} before running it` }, 'fix'],
    ['an error fragment', { ...RESIZE, situation: { errors: [`auth failed for ${GHP} on the remote`] } }, 'situation.errors'],
    ['a command', { ...RESIZE, situation: { commands: [`curl -H "Authorization: Bearer ${'A'.repeat(24)}"`] } }, 'situation.commands'],
    ['a file pattern', { ...RESIZE, situation: { files: [`secrets/${GHP}.txt`] } }, 'situation.files'],
    ['the evidence', { ...RESIZE, evidence: [`call:${GHP}`] }, 'evidence'],
    ['a url in the evidence', { ...RESIZE, evidence: [`https://example.org/?token=${GHP}`] }, 'evidence'],
  ]
  for (const [what, raw, field] of cases) {
    const refused = refusal(raw)
    assert.equal(refused.code, 'secret_like', what)
    assert.equal(refused.field, field, what)
    assert.ok(!refused.message.includes(GHP), what)
  }
  const candidate = checkCandidateFields({ ...without(RESIZE), pitfall: `It leaks ${GHP}` })
  assert.ok('code' in candidate && candidate.code === 'secret_like')
})

test('the situation is stored normalised: forward slashes, no leading ./, one space between command words, repeats dropped', () => {
  const placed = checkSituation({ files: ['.\\docs\\graph\\**', './docs/graph/**', ' src/a.ts '], commands: ['npm   run \t probe', 'npm run probe'], tools: [' pwsh '], errors: ['  EMFILE: too many open files  '] })
  assert.ok(!('code' in placed))
  assert.deepEqual(placed, { files: ['docs/graph/**', 'src/a.ts'], tools: ['pwsh'], commands: ['npm run probe'], errors: ['EMFILE: too many open files'] })
})

// --- Signature and similarity -------------------------------------------------

test('the signature of a lesson with error fragments is the normalised fragments, sorted; the pitfall does not matter', () => {
  const one = signature(situation({ errors: ['EMFILE: too many open files', 'Cannot find module'] }), 'first wording')
  const other = signature(situation({ errors: ['  cannot find module!', 'emfile:   too many open files.'] }), 'a completely different wording')
  assert.equal(one, other)
  assert.notEqual(one, signature(situation({ errors: ['EMFILE: too many open files'] }), 'first wording'))
})

test('without error fragments the signature is the start of the pitfall and the commands, sorted and normalised', () => {
  const pitfall = 'Get-Content without -Encoding garbled the Chinese text in a fixture, and nobody noticed for a week because the diff looked fine'
  const a = signature(situation({ commands: ['Get-Content', 'Set-Content'] }), pitfall)
  assert.equal(a, signature(situation({ commands: ['set-content', 'GET-CONTENT'], files: ['elsewhere/**'] }), `  ${pitfall.toUpperCase()}`))
  assert.equal(signature(situation({ files: ['a/**'] }), pitfall), signature(situation({ files: ['b/**'] }), pitfall), 'files do not count')
  assert.notEqual(a, signature(situation({ commands: ['Get-Content'] }), pitfall))
  assert.equal(signature(situation({ commands: ['x'] }), `${'a'.repeat(80)}b`), signature(situation({ commands: ['x'] }), `${'a'.repeat(80)}c`), 'only the first 80 characters count')
  assert.notEqual(signature(situation({ commands: ['x'] }), 'start A'), signature(situation({ commands: ['x'] }), 'start B'))
})

test('two lessons are similar when pitfall and fix share half their words, or an error fragment, or a file and a command', () => {
  const base = { situation: situation({ files: ['src/a/**'], commands: ['npm test'] }), pitfall: 'npm test fails while a calibration run holds the sandbox', fix: 'Wait for the calibration run to finish before running npm test' }
  assert.ok(similar(base, { ...base, pitfall: 'npm test fails while a calibration run holds the sandbox open', situation: situation({ files: ['x/**'] }) }))
  assert.ok(!similar(base, { situation: situation({ files: ['x/**'] }), pitfall: 'The resize tool opens too many files', fix: 'Use chunks of 200' }))
  const withError = (fragment: string) => ({ situation: situation({ errors: [fragment] }), pitfall: 'something unrelated entirely', fix: 'do other things' })
  assert.ok(similar({ ...withError('EMFILE: too many open files'), pitfall: 'alpha beta gamma', fix: 'delta' }, { ...withError('emfile: too  many open files'), pitfall: 'one two three', fix: 'four' }))
  const sharedFile = { pitfall: 'alpha beta gamma', fix: 'delta epsilon' }
  assert.ok(similar({ ...sharedFile, situation: situation({ files: ['docs/graph/**'], commands: ['git'] }) }, { pitfall: 'one two three', fix: 'four five', situation: situation({ files: ['DOCS/graph/**'], commands: ['Git'] }) }))
  assert.ok(!similar({ ...sharedFile, situation: situation({ files: ['docs/graph/**'] }) }, { pitfall: 'one two three', fix: 'four five', situation: situation({ files: ['docs/graph/**'], commands: ['git'] }) }), 'a file alone is not enough')
  assert.ok(similar({ situation: situation({ commands: ['x'] }), pitfall: '先备份再迁移记忆文件', fix: '迁移之前复制整个目录' }, { situation: situation({ commands: ['y'] }), pitfall: '先备份再迁移记忆文件', fix: '迁移之前复制整个目录' }), 'Chinese text is compared by pairs of characters')
})

// --- Who may delete or restore ------------------------------------------------------

test('only the person deletes or restores a lesson: a human writer, or an agent that quotes the words', () => {
  for (const op of ['delete', 'restore', 'reopen'] as const) {
    assert.equal(userOnly(op, { actor: 'human' }), undefined, `${op} by a human`)
    assert.equal(userOnly(op, { actor: 'llm', relay: 'delete that one' }), undefined, `${op} with the words`)
    for (const relay of [undefined, '', '   ']) {
      const refused = userOnly(op, { actor: 'llm', ...(relay === undefined ? {} : { relay }) })
      assert.equal(refused?.code, 'user_only', `${op} without words (${JSON.stringify(relay)})`)
      assert.match(refused?.hint ?? '', /relay/)
    }
  }
  assert.match(userOnly('delete', { actor: 'llm' })?.hint ?? '', /^only the user deletes a lesson: quote their words in relay$/)
  assert.match(userOnly('reopen', { actor: 'llm' })?.hint ?? '', /the user restores it: quote their words in relay and use action restore/)
})

// --- The fold ---------------------------------------------------------------------------

test('a propose makes an open candidate that carries the harness evidence, its time and its signature', () => {
  const state = ok([proposeRec(CAND)])
  const candidate = candidateOf(state, CAND)
  assert.deepEqual([candidate.status, candidate.at, candidate.evidence], ['open', T0, ['task:task-3', 'session:child-1', `commit:${SHA40}`]])
  assert.equal(candidate.signature, signature(candidate.situation, candidate.pitfall))
  assert.deepEqual(candidate.situation, { files: ['tools/resize/**'], tools: [], commands: ['resize-batch'], errors: ['EMFILE: too many open files'] })
})

test('a new lesson is active with one confirmation, created and last confirmed now, origin from the record', () => {
  const state = ok([newRec(LESSON, RESIZE, { relay: 'note that down' })])
  const lesson = lessonOf(state, LESSON)
  assert.deepEqual([lesson.status, lesson.confirmations, lesson.created, lesson.lastConfirmed, lesson.mergedFrom], ['active', 1, T0, T0, []])
  assert.deepEqual(lesson.origin, { actor: 'llm', session: 'session-a', agent: 'agent-1', relay: 'note that down' })
  assert.deepEqual(lesson.evidence, ['commit:3fa9c21d7be0'])
  assert.equal(lesson.deletedAt, undefined)
})

test('a new lesson written from a candidate turns the candidate merged and remembers it', () => {
  const state = ok([proposeRec(CAND), newRec(LESSON, RESIZE, { candidate: CAND })])
  assert.equal(candidateOf(state, CAND).status, 'merged')
  assert.deepEqual(lessonOf(state, LESSON).mergedFrom, [CAND])
  assert.equal(codeOf(state, newRec(LESSON2, ENCODING, { candidate: CAND })), 'stale', 'the candidate is merged now')
  assert.equal(codeOf(state, newRec(LESSON2, ENCODING, { candidate: 'C-ffffff' })), 'not_found')
})

test('a new lesson with the signature of an active lesson is a duplicate that names it; a retired one does not count', () => {
  const state = ok([newRec(LESSON)])
  const same = judgeRecord(state, newRec(LESSON2, { ...RESIZE, pitfall: 'worded differently but the same error' }))
  assert.ok('code' in same)
  assert.deepEqual([same.code, same.hint], ['duplicate', `use action into with lesson ${LESSON}`])
  const retired = ok([rec('llm', 'retire', LESSON, { reason: 'obsolete' })], state)
  assert.equal(codeOf(retired, newRec(LESSON2, RESIZE)), 'ok')
  assert.equal(codeOf(state, newRec(LESSON, ENCODING)), 'duplicate', 'the id is taken')
})

test('the id, the fields and the evidence of a new lesson are checked when a journal is folded', () => {
  const base = newRec(LESSON)
  const cases: ReadonlyArray<readonly [string, JournalRecord]> = [
    ['a lesson id that is a candidate id', newRec(CAND)],
    ['an id with capitals', newRec('L-0F12AA')],
    ['data that is not an object', { ...base, data: 'text' }],
    ['an unknown data field', { ...base, data: { ...(base.data as object), colour: 'red' } }],
    ['no evidence', (({ evidence: _evidence, ...rest }) => rest)(base)],
    ['an empty situation', { ...base, data: { ...(base.data as object), situation: {} } }],
    ['a pitfall of two lines', { ...base, data: { ...(base.data as object), pitfall: 'a\nb' } }],
    ['a learned-from list of six', { ...base, data: { ...(base.data as object), learnedFrom: ['a', 'b', 'c', 'd', 'e', 'f'] } }],
  ]
  for (const [what, record] of cases) assert.ok('bad' in applyRecord(emptyLessons(), record), what)
})

test('an into joins a candidate to a lesson: situation united within the caps, evidence added, one more confirmation, a touch', () => {
  const candidate = {
    situation: { files: ['tools/resize/**', 'tools/crop/**'], commands: ['resize-batch', 'crop-batch'], tools: ['pwsh'], errors: ['EMFILE: too many open files', 'ENOSPC: no space left on device'] },
    pitfall: 'resize-batch exhausts handles', fix: 'chunk it',
  }
  const state = ok([
    newRec(LESSON),
    proposeRec(CAND, candidate, ['task:task-9', 'session:child-2']),
    rec('llm', 'into', LESSON, { data: { candidate: CAND }, by: { session: 'session-b' } }, day(T0, 2)),
  ])
  const lesson = lessonOf(state, LESSON)
  assert.deepEqual(lesson.situation, {
    files: ['tools/resize/**', 'tools/crop/**'],
    tools: ['pwsh'],
    commands: ['resize-batch', 'crop-batch'],
    errors: ['EMFILE: too many open files', 'ENOSPC: no space left on device'],
  })
  assert.deepEqual(lesson.evidence, ['commit:3fa9c21d7be0', 'task:task-9', 'session:child-2'])
  assert.deepEqual([lesson.confirmations, lesson.lastConfirmed, lesson.mergedFrom, lesson.created], [2, day(T0, 2), [CAND], T0])
  assert.equal(candidateOf(state, CAND).status, 'merged')
  assert.deepEqual(state.touches.get(LESSON), [{ at: day(T0, 2), session: 'session-b', kind: 'into' }])
})

test('an into keeps at most 20 files and 5 error fragments, and at most 8 evidence items: the earliest three and the newest five', () => {
  const files = Array.from({ length: 20 }, (_, index) => `src/a${index}/**`)
  const lesson = { situation: { files, errors: ['first fragment here'] }, pitfall: 'p', fix: 'f', evidence: ['docs/a.md', 'docs/b.md', 'docs/c.md', 'docs/d.md', 'docs/e.md', 'docs/f.md'] }
  const more = { situation: { files: ['src/extra/**'], errors: ['second fragment', 'third fragment', 'fourth fragment', 'fifth fragment', 'sixth fragment'] }, pitfall: 'q', fix: 'g' }
  const state = ok([
    rec('llm', 'new', LESSON, { data: without(lesson) as unknown as JsonValue, evidence: lesson.evidence }),
    proposeRec(CAND, more, ['docs/g.md', 'docs/h.md', 'docs/i.md', 'docs/j.md']),
    rec('llm', 'into', LESSON, { data: { candidate: CAND } }),
  ])
  const merged = lessonOf(state, LESSON)
  assert.equal(merged.situation.files.length, 20)
  assert.ok(!merged.situation.files.includes('src/extra/**'))
  assert.deepEqual(merged.situation.errors, ['first fragment here', 'second fragment', 'third fragment', 'fourth fragment', 'fifth fragment'])
  assert.deepEqual(merged.evidence, ['docs/a.md', 'docs/b.md', 'docs/c.md', 'docs/f.md', 'docs/g.md', 'docs/h.md', 'docs/i.md', 'docs/j.md'])
})

test('an into without a session leaves no touch; a stale or missing candidate or lesson is refused with its code', () => {
  const state = ok([newRec(LESSON), proposeRec(CAND), proposeRec(CAND2), rec('harness', 'into', LESSON, { data: { candidate: CAND } })])
  assert.equal(state.touches.get(LESSON), undefined)
  assert.equal(codeOf(state, rec('llm', 'into', LESSON, { data: { candidate: CAND } })), 'stale', 'the candidate was merged already')
  assert.equal(codeOf(state, rec('llm', 'into', LESSON, { data: { candidate: 'C-ffffff' } })), 'not_found')
  assert.equal(codeOf(state, rec('llm', 'into', 'L-ffffff', { data: { candidate: CAND2 } })), 'not_found')
  const retired = ok([rec('llm', 'retire', LESSON)], state)
  assert.equal(codeOf(retired, rec('llm', 'into', LESSON, { data: { candidate: CAND2 } })), 'stale')
  const deleted = ok([rec('human', 'delete', LESSON)], state)
  assert.equal(codeOf(deleted, rec('llm', 'into', LESSON, { data: { candidate: CAND2 } })), 'not_found')
  assert.equal(codeOf(state, rec('llm', 'into', LESSON, {})), 'invalid', 'an into names its candidate')
})

test('a revise changes the fields it names and leaves the rest; evidence replaces the list; group keys join', () => {
  const start = ok([rec('llm', 'new', LESSON, { data: { ...without(RESIZE), learnedFrom: ['edit:goal.stage'] } as unknown as JsonValue, evidence: RESIZE.evidence })])
  const state = ok([
    rec('llm', 'revise', LESSON, { data: { fix: 'Use --chunk 100.', learnedFrom: ['edit:task.acceptance', 'edit:goal.stage'] }, evidence: ['docs/new.md'], reason: 'better number' }, day(T0, 1)),
  ], start)
  const lesson = lessonOf(state, LESSON)
  assert.deepEqual([lesson.fix, lesson.pitfall, lesson.evidence, lesson.learnedFrom], ['Use --chunk 100.', RESIZE.pitfall, ['docs/new.md'], ['edit:goal.stage', 'edit:task.acceptance']])
  assert.deepEqual([lesson.confirmations, lesson.lastConfirmed], [1, T0], 'a revision is not a confirmation')
  const situationChanged = ok([rec('llm', 'revise', LESSON, { data: { situation: { commands: ['resize-batch2'] } } })], start)
  assert.deepEqual(lessonOf(situationChanged, LESSON).situation, { files: [], tools: [], commands: ['resize-batch2'], errors: [] })
  assert.equal(codeOf(start, rec('llm', 'revise', LESSON, {})), 'invalid', 'a revise changes something')
  assert.equal(codeOf(start, rec('llm', 'revise', LESSON, { data: { pitfall: '' } })), 'invalid')
  assert.equal(codeOf(start, rec('llm', 'revise', LESSON, { data: { situation: {} } })), 'invalid')
  assert.equal(codeOf(start, rec('llm', 'revise', LESSON, { data: { colour: 'red' } })), 'invalid')
  assert.equal(codeOf(start, rec('llm', 'revise', 'L-ffffff', { data: { fix: 'x' } })), 'not_found')
  const retired = ok([rec('llm', 'retire', LESSON), rec('llm', 'revise', LESSON, { data: { fix: 'Still useful.' } })], start)
  assert.deepEqual([lessonOf(retired, LESSON).status, lessonOf(retired, LESSON).fix], ['retired', 'Still useful.'])
  const deleted = ok([rec('human', 'delete', LESSON)], start)
  assert.equal(codeOf(deleted, rec('llm', 'revise', LESSON, { data: { fix: 'x' } })), 'not_found')
})

test('a confirm adds its evidence and one confirmation and moves the last confirmation; it needs evidence', () => {
  const start = ok([newRec(LESSON)])
  const state = ok([rec('llm', 'confirm', LESSON, { evidence: ['task:task-5'], reason: 'hit it again' }, day(T0, 3))], start)
  const lesson = lessonOf(state, LESSON)
  assert.deepEqual([lesson.confirmations, lesson.lastConfirmed, lesson.evidence], [2, day(T0, 3), ['commit:3fa9c21d7be0', 'task:task-5']])
  assert.equal(codeOf(start, rec('llm', 'confirm', LESSON, {})), 'invalid')
  assert.equal(codeOf(start, rec('llm', 'confirm', 'L-ffffff', { evidence: ['task:task-5'] })), 'not_found')
})

test('retire puts an active lesson away and reopen brings it back; each says stale when it does not apply', () => {
  const start = ok([newRec(LESSON)])
  const retired = ok([rec('llm', 'retire', LESSON, { reason: 'fixed upstream' })], start)
  assert.equal(lessonOf(retired, LESSON).status, 'retired')
  assert.equal(codeOf(retired, rec('llm', 'retire', LESSON)), 'stale')
  assert.equal(codeOf(start, rec('llm', 'reopen', LESSON)), 'stale')
  assert.equal(lessonOf(ok([rec('llm', 'reopen', LESSON)], retired), LESSON).status, 'active')
  assert.equal(codeOf(start, rec('llm', 'retire', 'L-ffffff')), 'not_found')
  assert.equal(codeOf(start, rec('llm', 'reopen', 'L-ffffff')), 'not_found')
})

test('a candidate is dropped, expires, and comes back with reopen; only an open candidate can leave', () => {
  const start = ok([proposeRec(CAND), proposeRec(CAND2)])
  const dropped = ok([rec('llm', 'drop', CAND, { reason: 'not general' })], start)
  assert.equal(candidateOf(dropped, CAND).status, 'dropped')
  const expired = ok([rec('harness', 'expire', CAND2, { reason: 'open for 30 days' })], dropped)
  assert.equal(candidateOf(expired, CAND2).status, 'expired')
  assert.equal(codeOf(expired, rec('llm', 'drop', CAND)), 'stale')
  assert.equal(codeOf(expired, rec('harness', 'expire', CAND2)), 'stale')
  assert.equal(codeOf(start, rec('llm', 'drop', 'C-ffffff')), 'not_found')
  const reopened = ok([rec('llm', 'reopen', CAND), rec('llm', 'reopen', CAND2)], expired)
  assert.deepEqual([candidateOf(reopened, CAND).status, candidateOf(reopened, CAND2).status], ['open', 'open'])
  assert.equal(codeOf(start, rec('llm', 'reopen', CAND)), 'stale', 'an open candidate is not reopened')
  const merged = ok([rec('llm', 'into', LESSON, { data: { candidate: CAND } })], ok([newRec(LESSON)], start))
  assert.equal(codeOf(merged, rec('llm', 'reopen', CAND)), 'stale', 'a merged candidate stays merged')
  assert.equal(codeOf(start, rec('llm', 'drop', CAND, { data: { matches: LESSON } })), 'invalid', 'matches is for the harness')
  assert.equal(codeOf(start, rec('harness', 'drop', CAND, { data: { matches: LESSON } })), 'invalid', 'and for a lesson the user deleted')
})

test('delete and restore are the person\'s: an llm needs the words, a human does not; a deleted lesson is a tombstone', () => {
  const start = ok([newRec(LESSON)])
  assert.equal(codeOf(start, rec('llm', 'delete', LESSON)), 'user_only')
  assert.equal(codeOf(start, rec('llm', 'delete', LESSON, { relay: '  ' })), 'user_only')
  assert.equal(codeOf(start, rec('llm', 'restore', LESSON)), 'user_only')
  assert.equal(codeOf(start, rec('llm', 'delete', 'L-ffffff', { relay: 'delete it' })), 'not_found')
  const asked = ok([rec('llm', 'delete', LESSON, { relay: 'delete that lesson', reason: 'the user said so', data: JSON.parse(JSON.stringify(lessonOf(start, LESSON))) as JsonValue })], start)
  assert.deepEqual([lessonOf(asked, LESSON).status, lessonOf(asked, LESSON).deletedAt], ['deleted', T0])
  assert.equal(codeOf(asked, rec('human', 'delete', LESSON)), 'not_found', 'a deleted lesson is not deleted again')
  assert.equal(codeOf(start, rec('human', 'restore', LESSON)), 'stale', 'only a deleted lesson is restored')
  assert.equal(codeOf(asked, rec('llm', 'restore', LESSON)), 'user_only')
  const restored = ok([rec('llm', 'restore', LESSON, { relay: 'bring it back' }, day(T0, 4))], asked)
  assert.deepEqual([lessonOf(restored, LESSON).status, 'deletedAt' in lessonOf(restored, LESSON)], ['active', false])
  assert.equal(lessonOf(ok([rec('human', 'delete', LESSON), rec('human', 'restore', LESSON)], start), LESSON).status, 'active')
  assert.equal(codeOf(asked, rec('llm', 'reopen', LESSON)), 'user_only', 'reopen does not undo a deletion')
  assert.equal(codeOf(asked, rec('human', 'retire', LESSON)), 'not_found')
})

test('what a proposed candidate becomes: a candidate, a merge into an active lesson, or a drop for matching a lesson the user deleted', () => {
  const evidence = ['task:task-3', 'session:child-1']
  const by = { session: 'session-main', agent: 'agent-0' }
  const fresh = proposeRecords(emptyLessons(), candidateFields(RESIZE), evidence, by, CAND)
  assert.deepEqual([fresh.status, fresh.id, fresh.lesson, fresh.records.map(record => record.op)], ['candidate', CAND, undefined, ['propose']])
  assert.equal(ok(journalOf(fresh.records)).candidates.size, 1)

  const lessons = ok([newRec(LESSON)])
  const same = proposeRecords(lessons, { ...candidateFields(RESIZE), pitfall: 'worded another way' }, evidence, by, CAND)
  assert.deepEqual([same.status, same.id, same.lesson, same.records.map(record => record.op)], ['merged', CAND, LESSON, ['propose', 'into']])
  assert.equal(same.records[1]?.reason, `same signature as ${LESSON}`)
  assert.ok(same.records.every(record => record.actor === 'harness' && record.by?.session === 'session-main'))
  const merged = ok(journalOf(same.records, day(T0, 1)), lessons)
  assert.deepEqual([lessonOf(merged, LESSON).confirmations, candidateOf(merged, CAND).status], [2, 'merged'])
  assert.deepEqual(merged.touches.get(LESSON)?.map(touch => touch.session), ['session-main'])

  const deleted = ok([rec('human', 'delete', LESSON)], lessons)
  const gone = proposeRecords(deleted, candidateFields(RESIZE), evidence, by, CAND)
  assert.deepEqual([gone.status, gone.lesson, gone.records.map(record => record.op)], ['dropped', LESSON, ['propose', 'drop']])
  assert.equal(gone.records[1]?.reason, `matches ${LESSON} the user deleted on 2026-11-01`)
  const afterDrop = ok(journalOf(gone.records), deleted)
  assert.deepEqual([candidateOf(afterDrop, CAND).status, candidateOf(afterDrop, CAND).deletedMatch], ['dropped', LESSON])

  const other: Fields = { ...RESIZE, situation: { errors: ['ENOSPC: no space left on device'] } }
  const both = ok([newRec(LESSON2, other)], deleted)
  assert.equal(proposeRecords(both, candidateFields(other), evidence, by, CAND).status, 'merged', 'an active lesson wins over a deleted one')
  assert.equal(proposeRecords(both, candidateFields(RESIZE), evidence, undefined, CAND).records[0]?.by, undefined)
})

test('a candidate dropped for matching a deleted lesson comes back only by the person\'s word', () => {
  const lessons = ok([newRec(LESSON), rec('human', 'delete', LESSON)])
  const state = ok(journalOf(proposeRecords(lessons, candidateFields(RESIZE), ['session:child-1'], undefined, CAND).records), lessons)
  assert.equal(codeOf(state, rec('llm', 'reopen', CAND)), 'user_only')
  assert.equal(candidateOf(ok([rec('llm', 'reopen', CAND, { relay: 'take that one back' })], state), CAND).status, 'open')
  const reopened = candidateOf(ok([rec('human', 'reopen', CAND)], state), CAND)
  assert.deepEqual([reopened.status, reopened.deletedMatch], ['open', undefined])
})
test('a hit counts the session it happened in; a recurrence reminder is recorded per lesson', () => {
  const start = ok([newRec(LESSON)])
  const state = ok([
    rec('harness', 'hit', LESSON, { by: { session: 'session-b', tool: 'pwsh', callId: 'call-1' } }, day(T0, 1)),
    rec('harness', 'hit', LESSON, { by: { session: 'session-c' } }, day(T0, 2)),
    rec('harness', 'recur-notified', LESSON, {}, day(T0, 3)),
    rec('harness', 'recur-notified', LESSON, {}, day(T0, 9)),
  ], start)
  assert.deepEqual(state.touches.get(LESSON)?.map(touch => [touch.session, touch.kind]), [['session-b', 'hit'], ['session-c', 'hit']])
  assert.deepEqual(state.recurrences.get(LESSON), [day(T0, 3), day(T0, 9)])
  assert.equal(codeOf(start, rec('harness', 'hit', LESSON, {})), 'invalid', 'a hit names its session')
  assert.equal(codeOf(start, rec('harness', 'hit', 'L-ffffff', { by: { session: 'session-b' } })), 'not_found')
  assert.equal(codeOf(start, rec('harness', 'recur-notified', 'L-ffffff')), 'not_found')
  const retired = ok([rec('llm', 'retire', LESSON), rec('harness', 'hit', LESSON, { by: { session: 'session-d' } })], start)
  assert.equal(retired.touches.get(LESSON)?.length, 1, 'a hit that was recorded as the lesson was put away still counts')
})

test('an import records what became of an annotation, once', () => {
  const start = ok([proposeRec(CAND)])
  const key = 'task-3@2026-10-30T09:15:00.000Z'
  const imported = ok([
    rec('harness', 'import', key, { data: { candidate: CAND } }),
    rec('harness', 'import', 'task-4@2026-10-30T09:16', { data: { rejected: 'secret_like' } }),
    rec('harness', 'import', 'task-5@2026-10-30T09:17', { data: { duplicateOf: CAND } }),
  ], start)
  assert.deepEqual([...imported.imports], [[key, { candidate: CAND }], ['task-4@2026-10-30T09:16', { rejected: 'secret_like' }], ['task-5@2026-10-30T09:17', { duplicateOf: CAND }]])
  assert.equal(codeOf(imported, rec('harness', 'import', key, { data: { rejected: 'invalid' } })), 'duplicate', 'each annotation is tried once')
  const cases: ReadonlyArray<readonly [string, string, JsonValue | undefined]> = [
    ['an id that is not an annotation', 'task-3', { candidate: CAND }],
    ['no data', 'task-6@2026-10-30T09:18', undefined],
    ['two outcomes', 'task-6@2026-10-30T09:18', { candidate: CAND, rejected: 'invalid' }],
    ['a rejection code that does not exist', 'task-6@2026-10-30T09:18', { rejected: 'busy' }],
    ['a candidate that does not exist', 'task-6@2026-10-30T09:18', { candidate: 'C-ffffff' }],
  ]
  for (const [what, id, data] of cases) assert.notEqual(codeOf(start, rec('harness', 'import', id, data === undefined ? {} : { data })), 'ok', what)
})

test('every operation has its writers: the harness cannot write a lesson, an agent cannot write a hit', () => {
  const start = ok([newRec(LESSON), proposeRec(CAND)])
  const refused: ReadonlyArray<readonly [Actor, string, string]> = [
    ['harness', 'new', LESSON2], ['harness', 'revise', LESSON], ['harness', 'confirm', LESSON], ['harness', 'retire', LESSON], ['harness', 'reopen', LESSON],
    ['harness', 'delete', LESSON], ['harness', 'restore', LESSON],
    ['llm', 'propose', 'C-ffffff'], ['llm', 'import', 'task-3@2026-10-30T09:15'], ['llm', 'expire', CAND], ['llm', 'hit', LESSON], ['llm', 'recur-notified', LESSON],
    ['human', 'propose', 'C-ffffff'], ['human', 'hit', LESSON],
  ]
  for (const [actor, op, id] of refused) assert.equal(codeOf(start, rec(actor, op, id, { by: SESSION_A })), 'invalid', `${actor} ${op}`)
  assert.equal(codeOf(start, rec('llm', 'sparkle', LESSON)), 'invalid', 'an operation nobody knows')
  const bad = applyRecord(start, rec('llm', 'sparkle', LESSON))
  assert.ok('bad' in bad && /^invalid: unknown operation sparkle$/.test(bad.bad))
})

test('folding does not change the state it started from', () => {
  const start = ok([newRec(LESSON), proposeRec(CAND)])
  const before = JSON.stringify([...start.lessons])
  const lessonsMap = start.lessons
  ok([rec('llm', 'into', LESSON, { data: { candidate: CAND }, by: SESSION_A }), rec('human', 'delete', LESSON)], start)
  assert.equal(start.lessons, lessonsMap)
  assert.equal(JSON.stringify([...start.lessons]), before)
  assert.equal(candidateOf(start, CAND).status, 'open')
  assert.equal(start.touches.size, 0)
})

// --- Evidence, ids -----------------------------------------------------------------------

test('the evidence of a candidate is the task, the worker\'s session and the full commit id', () => {
  const full = candidateEvidence({ session: 'session-main', task: 'task-3', childId: 'child-1', commit: SHA40 })
  assert.deepEqual(full.evidence, ['task:task-3', 'session:child-1', `commit:${SHA40}`])
  assert.deepEqual(full.notes, [])
  const upper = candidateEvidence({ session: 'session-main', commit: SHA40.toUpperCase() })
  assert.deepEqual(upper.evidence, ['session:session-main', `commit:${SHA40}`], 'a commit id is stored in lower case; without a child the dispatching session stands')
})

test('a context value that is not in the form of the evidence is left out and named; the candidate keeps its session', () => {
  const bad = candidateEvidence({ session: 'session-main', task: 'Task Three', childId: 'child one', commit: 'xyz' })
  assert.deepEqual(bad.evidence, ['session:session-main'])
  assert.equal(bad.notes.length, 3)
  assert.match(bad.notes.join('\n'), /context\.task/)
  assert.match(bad.notes.join('\n'), /context\.childId/)
  assert.match(bad.notes.join('\n'), /context\.commit: it is not 7 to 40 hex digits/)
  assert.deepEqual(candidateEvidence({ session: 'session-main', commit: 'abc1234' }).evidence, ['session:session-main', 'commit:abc1234'], 'seven digits are enough')
  assert.deepEqual(candidateEvidence({ session: 'session main' }).evidence, [], 'a session id the host would not give is left out too')
})

test('a new id is six hex digits that no lesson or candidate has; it is drawn again on a collision and given up after five', () => {
  const state = ok([newRec(LESSON), proposeRec(CAND)])
  assert.equal(newId('L', state, () => 0x3f9a2c), 'L-3f9a2c')
  assert.equal(newId('C', emptyLessons(), () => 0xabc), 'C-000abc')
  const draws = [0x0f12aa, 0x0f12aa, 0x3f9a2c]
  assert.equal(newId('L', state, () => draws.shift() ?? 0), 'L-3f9a2c', 'the first two draws are taken')
  assert.equal(newId('C', state, () => 0x1a2b3c), undefined, 'always the id of the candidate')
  let drawn = 0
  newId('C', state, () => {
    drawn += 1
    return 0x1a2b3c
  })
  assert.equal(drawn, 5)
  assert.equal(newId('L', state, () => 0x1000000 + 0x3f9a2c), 'L-3f9a2c', 'the number is taken modulo 2^24')
})

// --- Behind the real journal -----------------------------------------------------------------

test('behind the real journal: a proposal appended through the lock folds into a merged candidate, and the example passes the same checks', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'lessons-model-'))
  const file = join(directory, 'lessons.jsonl')
  const options = { directory: 'user', row: 'lessons-test' } as const

  const example = checkLessonFields(RESIZE)
  assert.ok(!('code' in example))
  const created = await appendJournal(file, lessonsFold, reading => ({
    records: [{ actor: 'llm', op: 'new', id: newId('L', reading.state, () => 0x0f12aa) ?? 'none', evidence: example.evidence, data: { situation: example.situation, pitfall: example.pitfall, fix: example.fix } as unknown as JsonValue, by: SESSION_A }],
  }), options)
  assert.equal(created.status, 'ok')

  const proposed = await appendJournal(file, lessonsFold, (reading) => {
    const fields = checkCandidateFields({ ...without(RESIZE), pitfall: 'resize-batch fails with EMFILE on big folders' })
    assert.ok(!('code' in fields))
    const proposal = proposeRecords(reading.state, fields, ['task:task-3', 'session:child-1'], { session: 'session-main' }, newId('C', reading.state, () => 0x1a2b3c) ?? 'none')
    assert.equal(proposal.status, 'merged')
    return { records: proposal.records }
  }, options)
  assert.equal(proposed.status, 'ok')
  assert.deepEqual(proposed.status === 'ok' ? proposed.records.map(record => record.seq) : [], [2, 3])

  const reading = await readJournal(file, lessonsFold)
  assert.deepEqual(reading.bad, [])
  assert.equal(reading.lastSeq, 3)
  assert.deepEqual([lessonOf(reading.state, LESSON).confirmations, candidateOf(reading.state, CAND).status], [2, 'merged'])
  assert.deepEqual(reading.state.touches.get(LESSON)?.map(touch => touch.session), ['session-main'])
})
