/**
 * The memory model (M5 design §3.1, §3.2, §3.4, §5.2, §5.4): the two classes
 * and the strength of an entry, the field checks every write goes through,
 * the similar-entry judgement, the fold of a memory journal (new entry, the
 * update that keeps `created`, `origin`, `confirmed` and `learnedFrom`, the
 * lines that do not hold), who may revoke a preference, the conversion of the
 * old `memory.json`, and the fold running behind the real journal. Secret
 * shaped samples are assembled from parts so that no line of this file is a
 * token for the repository's secret scan.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { foldRecords, type Folded } from './fold-helpers.ts'
import { appendJournal, readJournal, type JournalRecord, type JsonValue, type NewRecord } from '../src/data/journal.ts'
import {
  applyRecord, baseRecord, checkSourceKnown, checkStore, classify, convertLegacy, emptyMemory, judgeStore, memoryFold, memoryId,
  revokeRecord, reviewRecord, revokeRefusal, similarity, storeRecord, strength,
  type MemoryEntry, type MemoryState, type Refusal, type StoreRequest, type Writer,
} from '../src/memory/model.ts'

const GHP = ['ghp', '_'].join('') + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'
const MIXED_TOKEN = ['aB3dE5gH7jK9mN1pQ3sT', '5vW7yZ9bD1fH3jL5nP7r'].join('')
const PEM = ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' ')
const SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
const SHA40 = 'cae6ddf1a2b3c4d5e6f708192a3b4c5d6e7f8091'

const T0 = '2026-11-01T08:00:00.000Z'
const day = (from: string, days: number): string => new Date(Date.parse(from) + days * 86_400_000).toISOString()

/** The example of design §3.2, the one `memory_store`'s description will carry. */
const EXAMPLE = {
  name: 'lead-with-the-answer',
  type: 'feedback',
  scope: 'all',
  description: 'Start every reply with the answer; keep jargon out',
  body: 'Open with the answer in one sentence, then the reasons.\n**Why:** the user reads replies on a phone between meetings.\n**How to apply:** define a term the first time it appears, or leave it out.',
  relay: 'Start with the answer, and keep jargon out.',
}

const PROJECT_PREFERENCE = { ...EXAMPLE, scope: 'project' }

const FACT = {
  name: 'signing-rules-differ',
  type: 'project',
  description: 'coding-plan and start-plan sign requests differently',
  body: 'The two plans sign different parts of the request.\n**Why:** the start-plan route rejects the coding-plan signature.',
  source: ['docs/DESIGN.md §4.3'],
}

const request = (args: unknown): StoreRequest => {
  const result = checkStore(args)
  assert.ok(!('code' in result), `refused: ${'code' in result ? `${result.code} ${result.message}` : ''}`)
  return result
}
const refusal = (args: unknown): Refusal => {
  const result = checkStore(args)
  assert.ok('code' in result, 'expected a refusal')
  return result
}

const LLM_A: Writer = { actor: 'llm', by: { session: 'session-a', agent: 'agent-1', tool: 'memory_store' } }
const LLM_B: Writer = { actor: 'llm', by: { session: 'session-b', agent: 'agent-2', tool: 'memory_store' } }
const HUMAN: Writer = { actor: 'human', by: { commandId: 'cmd-1' } }

let seq = 0
const at = (record: NewRecord, time: string = T0): JournalRecord => ({ v: 1, seq: ++seq, at: time, ...record })

const foldAll = (records: readonly JournalRecord[], from: MemoryState = emptyMemory('project')): Folded<MemoryState> => foldRecords(applyRecord, records, from)

const entryOf = (state: MemoryState, name: string): MemoryEntry => {
  const entry = state.entries.get(name)
  assert.ok(entry !== undefined, `no entry ${name}`)
  return entry
}

const store = (args: unknown, writer: Writer = LLM_A, time: string = T0): JournalRecord => at(storeRecord(request(args), writer), time)

test('user and feedback entries are preferences, project and reference entries are facts', () => {
  assert.equal(classify('user'), 'preference')
  assert.equal(classify('feedback'), 'preference')
  assert.equal(classify('project'), 'fact')
  assert.equal(classify('reference'), 'fact')
})

test('a preference keeps strength 1 after 60 days; a fact never reviewed has 0.5 after 14 days and the review bonus is capped', () => {
  const base = { lastReviewed: T0, reviews: 0 }
  assert.equal(strength({ ...base, kind: 'preference' }, day(T0, 60)), 1)
  assert.equal(strength({ ...base, kind: 'fact' }, T0), 1)
  assert.equal(strength({ ...base, kind: 'fact' }, day(T0, 14)), 0.5)
  assert.equal(strength({ ...base, kind: 'fact' }, day(T0, 28)), 0.25)
  assert.equal(strength({ ...base, reviews: 10, kind: 'fact' }, day(T0, 14)), 0.75)
  assert.equal(strength({ ...base, reviews: 40, kind: 'fact' }, day(T0, 14)), 0.75, 'at most 10 reviews count')
  assert.equal(strength({ ...base, reviews: 10, kind: 'fact' }, T0), 1, 'never above 1')
  assert.equal(strength({ ...base, kind: 'fact' }, day(T0, -3)), 1, 'a clock that went back does not raise it')
})

test('the design example and the texts the old check refused are taken', () => {
  const taken = request(EXAMPLE)
  assert.equal(taken.type, 'feedback')
  assert.equal(taken.scope, 'all')
  assert.equal(taken.relay, EXAMPLE.relay)
  assert.equal(taken.confirmNew, false)
  const paths = request({
    ...FACT,
    name: 'memory-section-source',
    body: 'Lives in reference/ZCode/apps/zcode-cli/packages/core/src/context/sections/memory.ts and buildProviderEndpointRoutingHeaders reads src/shared/dsh-min.ts for coding-plan/start-plan.\n**Why:** the section text is mirrored from there.',
    source: ['reference/ZCode/apps/zcode-cli/packages/core/src/context/sections/memory.ts', SHA40, `commit:${SHA40}`],
  })
  assert.equal(paths.source.length, 3)
  assert.equal(paths.scope, 'project')
})

test('scope defaults follow the type: user is all, project and reference are the project, feedback has no default', () => {
  const user = request({ name: 'ask-in-english', type: 'user', description: 'Answers in English', body: 'The user reads English best.', relay: 'Please answer in English.' })
  assert.equal(user.scope, 'all')
  assert.equal(request({ name: 'status-board', type: 'reference', description: 'The status board', body: 'See the board.' }).scope, 'project')
  assert.equal(request(FACT).scope, 'project')
  const missing = refusal({ ...EXAMPLE, scope: undefined })
  assert.deepEqual([missing.code, missing.field], ['invalid', 'scope'])
  assert.match(missing.hint ?? '', /"all" if it is about how the user likes to work in every project, "project" if it is a norm of this project/)
  const user2 = refusal({ ...FACT, type: 'reference', scope: 'all' })
  assert.deepEqual([user2.code, user2.field], ['invalid', 'scope'], 'the user-level file holds only what is about the user')
  assert.equal(refusal({ ...FACT, scope: 'all' }).field, 'scope')
  assert.equal(refusal({ ...FACT, scope: 'everywhere' }).field, 'scope')
})

test('each field rule refuses with its code and field', () => {
  const cases: ReadonlyArray<readonly [string, unknown, string, string | undefined]> = [
    ['arguments that are not an object', 'name=x', 'invalid', undefined],
    ['an unknown field', { ...EXAMPLE, colour: 'red' }, 'invalid', 'colour'],
    ['a name with capitals', { ...EXAMPLE, name: 'Lead-With-The-Answer' }, 'invalid', 'name'],
    ['a name of one character', { ...EXAMPLE, name: 'a' }, 'invalid', 'name'],
    ['a name of 65 characters', { ...EXAMPLE, name: `a${'b'.repeat(64)}` }, 'invalid', 'name'],
    ['a name with a double hyphen', { ...EXAMPLE, name: 'lead--answer' }, 'invalid', 'name'],
    ['an unknown type', { ...EXAMPLE, type: 'note' }, 'invalid', 'type'],
    ['an empty description', { ...EXAMPLE, description: '' }, 'invalid', 'description'],
    ['a description over 200 characters', { ...EXAMPLE, description: 'd'.repeat(201) }, 'invalid', 'description'],
    ['a description of two lines', { ...EXAMPLE, description: 'one\ntwo' }, 'invalid', 'description'],
    ['a body over 4000 characters', { ...EXAMPLE, body: `Why: ${'b'.repeat(4000)}` }, 'invalid', 'body'],
    ['a feedback body without a Why line', { ...EXAMPLE, body: 'Open with the answer.' }, 'invalid', 'body'],
    ['a project body without a Why line', { ...FACT, body: 'The plans differ.' }, 'invalid', 'body'],
    ['a relay of 501 characters', { ...EXAMPLE, relay: 'r'.repeat(501) }, 'invalid', 'relay'],
    ['a blank relay', { ...EXAMPLE, relay: '   ' }, 'invalid', 'relay'],
    ['six sources', { ...FACT, source: ['a.md', 'b.md', 'c.md', 'd.md', 'e.md', 'f.md'] }, 'invalid', 'source'],
    ['a source that is not text', { ...FACT, source: [7] }, 'invalid', 'source'],
    ['a commit source that is not hex', { ...FACT, source: ['commit:xyz1234'] }, 'invalid', 'source'],
    ['six learned-from keys', { ...EXAMPLE, learnedFrom: ['a', 'b', 'c', 'd', 'e', 'f'] }, 'invalid', 'learnedFrom'],
    ['a learned-from key over two lines', { ...EXAMPLE, learnedFrom: ['edit:a\nedit:b'] }, 'invalid', 'learnedFrom'],
    ['a confirmNew that is not a boolean', { ...EXAMPLE, confirmNew: 'yes' }, 'invalid', 'confirmNew'],
    ['a project fact without a source', { name: FACT.name, type: 'project', description: FACT.description, body: FACT.body }, 'bad_source', 'source'],
    ['a project fact with an empty source list', { ...FACT, source: [] }, 'bad_source', 'source'],
  ]
  for (const [what, args, code, field] of cases) {
    const refused = refusal(args)
    assert.equal(refused.code, code, what)
    assert.equal(refused.field, field, what)
    assert.ok(refused.message.length > 0, what)
  }
  assert.match(refusal({ ...EXAMPLE, body: 'Open with the answer.' }).hint ?? '', /follow the fact with \*\*Why:\*\* and \*\*How to apply:\*\* lines/)
  assert.ok(!('code' in checkStore({ ...EXAMPLE, body: 'Open with the answer.\n  **why:** a lower-case, indented Why line counts' })))
})

test('a user or feedback write without the user\'s words is ask_first; the hint names memory_habit (H1)', () => {
  const { relay: _relay, ...withoutRelay } = EXAMPLE
  const asked = refusal(withoutRelay)
  assert.equal(asked.code, 'ask_first')
  assert.match(asked.hint ?? '', /Only the user's own words make a preference\. To record a habit you only guessed from their edits, call memory_habit with action "ask"; when they say yes in their own words, record it with action "confirm"\./)
  assert.match(asked.hint ?? '', /store it as a project memory with its source/)
  assert.equal(refusal({ ...withoutRelay, type: 'user' }).code, 'ask_first')
  const fact = request({ name: 'status-board', type: 'reference', description: 'The status board', body: 'See the board.' })
  assert.equal(fact.relay, undefined, 'a fact needs no relay')
})

test('value is for the entry named reporting-depth only, one of three levels, a user entry for all, with the user\'s words', () => {
  const depth = { name: 'reporting-depth', type: 'user', scope: 'all', description: 'Reports short', body: 'Keep reports short.\n**Why:** the user said so.', relay: 'From now on, just the main points.', value: 'concise' }
  assert.equal(request(depth).value, 'concise')
  assert.equal(request({ ...depth, value: undefined }).value, undefined)
  const cases: ReadonlyArray<readonly [string, unknown]> = [
    ['another name', { ...depth, name: 'report-length' }],
    ['a level that does not exist', { ...depth, value: 'verbose' }],
    ['a level that is not text', { ...depth, value: 2 }],
    ['the wrong type', { ...depth, type: 'feedback' }],
    ['a project scope', { ...depth, scope: 'project' }],
    ['no relay', (({ relay: _relay, ...rest }) => rest)(depth)],
  ]
  for (const [what, args] of cases) {
    const refused = refusal(args)
    assert.deepEqual([refused.code, refused.field], ['invalid', 'value'], what)
  }
})

test('text that looks like a secret is refused in every text field and every source, naming the class', () => {
  const cases: ReadonlyArray<readonly [string, unknown, string, string]> = [
    ['body', { ...EXAMPLE, body: `Why: the key is ${GHP}` }, 'body', 'prefix'],
    ['description', { ...EXAMPLE, description: `Use ${MIXED_TOKEN} for it` }, 'description', 'token shape'],
    ['relay', { ...EXAMPLE, relay: PEM }, 'relay', 'pem'],
    ['name', { ...EXAMPLE, name: ['sk', '-'].join('') + 'abcdefghijklmnopqrst' }, 'name', 'prefix'],
    ['hex in the body', { ...EXAMPLE, body: `Why: digest ${SHA256}` }, 'body', 'hex'],
    ['source', { ...FACT, source: [`https://example.com/?key=${GHP}`] }, 'source', 'prefix'],
  ]
  for (const [what, args, field, kind] of cases) {
    const refused = refusal(args)
    assert.equal(refused.code, 'secret_like', what)
    assert.equal(refused.field, field, what)
    assert.match(refused.message, new RegExp(`looks like a secret \\(${kind}`), what)
  }
})

test('sources: a commit id in either form is taken and stored in lower case; one of the four recognised kinds is needed', () => {
  const taken = request({ ...FACT, source: [`commit:${SHA40.toUpperCase()}`, 'https://example.com/issues/3'] })
  assert.deepEqual(taken.source.map(ref => ref.text), [`commit:${SHA40}`, 'https://example.com/issues/3'])
  const known = (ref: { readonly kind: string, readonly id: string }): boolean => ref.kind === 'node' && ref.id === 'recommend-last'
  assert.equal(checkSourceKnown(taken.source, known), undefined, 'a commit and a URL need no lookup')
  const nodes = request({ ...FACT, source: ['node:recommend-last', 'docs/missing.md'] }).source
  assert.equal(checkSourceKnown(nodes, known), undefined, 'one recognised item is enough')
  const unknown = request({ ...FACT, source: ['node:nowhere', 'docs/missing.md', 'session:s-1'] }).source
  const refused = checkSourceKnown(unknown, known)
  assert.ok(refused !== undefined)
  assert.deepEqual([refused.code, refused.field], ['bad_source', 'source'])
  assert.match(refused.message, /node:nowhere/)
  assert.match(refused.message, /docs\/missing\.md/)
  assert.match(refused.message, /session:s-1/)
  assert.match(refused.hint ?? '', /a project graph node id, a file path \(optionally with §section\), a commit id, or a URL/)
})

test('similarity is the Jaccard overlap of the words of name and description, English by word and Chinese by adjacent pair', () => {
  const a = { name: 'reply-conclusion-first', description: 'Wants the conclusion first in plain words' }
  assert.equal(similarity(a, a), 1)
  assert.equal(similarity(a, { name: 'budget-owner', description: 'Alice approves spending' }), 0)
  assert.ok(similarity(a, { name: 'reply-conclusion-first-v2', description: 'Wants the conclusion first in plain words' }) >= 0.6)
  assert.ok(similarity({ name: 'amounts-two-decimals', description: '报表里的金额显示两位小数' }, { name: 'money-two-decimals', description: '报表里的金额显示两位小数' }) >= 0.6)
  assert.ok(similarity({ name: 'amounts-two-decimals', description: '报表里的金额显示两位小数' }, { name: 'tabs-not-spaces', description: '代码缩进用制表符' }) < 0.2)
  assert.equal(similarity({ name: 'ab', description: '' }, { name: 'AB', description: '' }), 1, 'case does not matter')
})

test('a new name close to an existing entry of the same type is refused as similar unless confirmNew; an update and another type are not', () => {
  const state = foldAll([store(PROJECT_PREFERENCE), store(FACT)]).state
  const near = { ...PROJECT_PREFERENCE, name: 'lead-with-the-answer-v2' }
  const refused = judgeStore(state, request(near))
  assert.ok('code' in refused)
  assert.equal(refused.code, 'similar')
  assert.match(refused.message, /lead-with-the-answer \(feedback\): Start every reply with the answer; keep jargon out/)
  assert.match(refused.hint ?? '', /update one of them by storing with its name, or pass confirmNew: true/)
  assert.deepEqual(judgeStore(state, request({ ...near, confirmNew: true })), { updated: false })
  assert.deepEqual(judgeStore(state, request(PROJECT_PREFERENCE)), { updated: true }, 'the same name is an update, never similar')
  assert.deepEqual(judgeStore(state, request({ ...near, type: 'user' })), { updated: false }, 'another type')
  const sameSource = judgeStore(state, request({ ...FACT, name: 'plan-signing', description: 'Different words altogether', source: ['docs/DESIGN.md §4.3'] }))
  assert.ok('code' in sameSource && sameSource.code === 'similar', 'one shared source is enough')
  const forgotten = foldAll([at(revokeRecord('forget', entryOf(state, 'lead-with-the-answer'), 'wrong', HUMAN))], state).state
  assert.deepEqual(judgeStore(forgotten, request(near)), { updated: false }, 'a forgotten entry is not a neighbour')
  const typeChange = judgeStore(state, request({ ...PROJECT_PREFERENCE, type: 'user' }))
  assert.ok('code' in typeChange)
  assert.deepEqual([typeChange.code, typeChange.field], ['invalid', 'type'])
})

test('a new entry takes its fields from the record: created and last review at the record time, no reviews, origin from the writer', () => {
  const { state, bad } = foldAll([store(PROJECT_PREFERENCE, LLM_A, T0), store(FACT, LLM_A, day(T0, 1))])
  assert.deepEqual(bad, [])
  assert.deepEqual(entryOf(state, 'lead-with-the-answer'), {
    name: 'lead-with-the-answer',
    scope: 'project',
    type: 'feedback',
    description: EXAMPLE.description,
    body: EXAMPLE.body,
    source: [],
    relay: EXAMPLE.relay,
    kind: 'preference',
    created: T0,
    lastReviewed: T0,
    reviews: 0,
    origin: { actor: 'llm', session: 'session-a', agent: 'agent-1' },
    status: 'active',
  })
  const fact = entryOf(state, 'signing-rules-differ')
  assert.deepEqual([fact.kind, fact.created, fact.relay, fact.relayChecked], ['fact', day(T0, 1), undefined, undefined])
  assert.equal(memoryId('all', 'x-y'), 'all:x-y')
})

test('the relay check is carried on the record: false is kept on the entry, true is not', () => {
  const unchecked = foldAll([at(storeRecord(request(EXAMPLE), { ...LLM_A, relayChecked: false }))], emptyMemory('all')).state
  assert.equal(entryOf(unchecked, 'lead-with-the-answer').relayChecked, false)
  const checked = foldAll([at(storeRecord(request(EXAMPLE), { ...LLM_A, relayChecked: true }))], emptyMemory('all')).state
  assert.equal('relayChecked' in entryOf(checked, 'lead-with-the-answer'), false)
})

test('an update keeps created, origin, confirmed and learnedFrom and replaces the six fields; reviews goes up by one', () => {
  const confirmed: MemoryEntry = {
    ...entryOf(foldAll([store({ ...EXAMPLE, scope: 'project', learnedFrom: ['edit:a'] }, LLM_A, T0)]).state, 'lead-with-the-answer'),
    confirmed: { ask: 'project:lead-with-the-answer', question: 'Keep answering first?', body: EXAMPLE.body, at: T0 },
  }
  const start = foldAll([at(baseRecord([confirmed]))]).state
  const next = foldAll([store({
    ...EXAMPLE,
    scope: 'project',
    description: 'Open with the answer',
    body: 'Answer first.\n**Why:** said again.',
    source: ['docs/CHARTER.md §6'],
    relay: 'Answer first, please.',
    learnedFrom: ['edit:b', 'edit:a'],
  }, LLM_B, day(T0, 3))], start).state
  const updated = entryOf(next, 'lead-with-the-answer')
  assert.equal(updated.created, T0)
  assert.deepEqual(updated.origin, { actor: 'llm', session: 'session-a', agent: 'agent-1' })
  assert.deepEqual(updated.confirmed, { ask: 'project:lead-with-the-answer', question: 'Keep answering first?', body: EXAMPLE.body, at: T0 })
  assert.deepEqual(updated.learnedFrom, ['edit:a', 'edit:b'], 'old keys first, new keys joined, no repeat')
  assert.deepEqual([updated.description, updated.body, updated.source, updated.relay], ['Open with the answer', 'Answer first.\n**Why:** said again.', ['docs/CHARTER.md §6'], 'Answer first, please.'])
  assert.deepEqual([updated.lastReviewed, updated.reviews, updated.type, updated.scope, updated.kind], [day(T0, 3), 1, 'feedback', 'project', 'preference'])
})

test('an update drops what the new record does not carry: value, relay and the unchecked mark come from the new record', () => {
  const depth = { name: 'reporting-depth', type: 'user', scope: 'all', description: 'Reports short', body: 'Short.\n**Why:** said so.', relay: 'Main points only.', value: 'concise' }
  const first = foldAll([at(storeRecord(request(depth), { ...LLM_A, relayChecked: false }))], emptyMemory('all')).state
  assert.equal(entryOf(first, 'reporting-depth').value, 'concise')
  assert.equal(entryOf(first, 'reporting-depth').relayChecked, false)
  const second = foldAll([at(storeRecord(request({ ...depth, value: 'detailed', relay: 'More detail is fine.' }), { ...LLM_A, relayChecked: true }), day(T0, 1))], first).state
  const entry = entryOf(second, 'reporting-depth')
  assert.deepEqual([entry.value, entry.relay, 'relayChecked' in entry, entry.reviews], ['detailed', 'More detail is fine.', false, 1])
})

test('learnedFrom keeps at most five keys when an update joins new ones', () => {
  const first = foldAll([store({ ...EXAMPLE, scope: 'project', learnedFrom: ['k1', 'k2', 'k3', 'k4'] })]).state
  const second = foldAll([store({ ...EXAMPLE, scope: 'project', learnedFrom: ['k4', 'k5', 'k6', 'k7'] })], first).state
  assert.deepEqual(entryOf(second, 'lead-with-the-answer').learnedFrom, ['k1', 'k2', 'k3', 'k4', 'k5'])
})

test('a store over a forgotten entry is a new entry with every field from the new record', () => {
  const written = foldAll([store({ ...EXAMPLE, scope: 'project', learnedFrom: ['edit:a'] }, LLM_A, T0)]).state
  const gone = foldAll([at(revokeRecord('forget', entryOf(written, 'lead-with-the-answer'), 'wrong', { actor: 'human', by: { commandId: 'cmd-2' } }), day(T0, 1))], written).state
  assert.equal(entryOf(gone, 'lead-with-the-answer').status, 'forgotten')
  const again = foldAll([store({ ...EXAMPLE, scope: 'project', description: 'Back again' }, LLM_B, day(T0, 2))], gone).state
  const entry = entryOf(again, 'lead-with-the-answer')
  assert.deepEqual([entry.status, entry.created, entry.reviews, entry.origin.session, entry.learnedFrom, entry.description], ['active', day(T0, 2), 0, 'session-b', undefined, 'Back again'])
})

test('lines that do not hold are refused with the reason and leave the state as it was', () => {
  const base = foldAll([store({ ...EXAMPLE, scope: 'project' }), store(FACT)]).state
  const good = store({ ...FACT, name: 'other-fact', description: 'Another thing entirely', source: ['docs/ROADMAP.md'] })
  const data = (record: JournalRecord, change: Record<string, unknown>): JournalRecord => ({ ...record, data: { ...(record.data as Record<string, JsonValue>), ...(change as Record<string, JsonValue>) } })
  const noCredential = at({ actor: 'llm', op: 'store', id: memoryId('project', 'guess'), data: { name: 'guess', type: 'feedback', scope: 'project', description: 'A guess', body: 'Guess.\nWhy: none.', source: [] } })
  const cases: ReadonlyArray<readonly [string, JournalRecord, RegExp]> = [
    ['a preference without the user\'s words', noCredential, /preference without the user's own words/],
    ['a store by the harness', { ...good, actor: 'harness' }, /store records are not written by harness/],
    ['a store with a field that fails the check', data(good, { body: 'no why line' }), /body:/],
    ['a store for the other scope', data(good, { scope: 'all', type: 'user' }), /scope/],
    ['a store whose id names another entry', { ...good, id: memoryId('project', 'something-else') }, /id is/],
    ['a store that names a question that does not exist', data(good, { ask: 'H-000000' }), /question/],
    ['a store with a relayChecked that is not a boolean', data(good, { relayChecked: 'no' }), /relayChecked/],
    ['a store that changes the type of an entry', store({ ...FACT, name: 'lead-with-the-answer', type: 'reference' }), /type/],
    ['an unknown operation', at({ actor: 'human', op: 'frobnicate', id: '*' }), /unknown operation frobnicate/],
    ['a forget of an entry that is not there', at({ actor: 'human', op: 'forget', id: memoryId('project', 'nowhere') }), /no active entry/],
    ['a restore of an entry that is active', at({ actor: 'human', op: 'restore', id: memoryId('project', 'signing-rules-differ') }), /not forgotten/],
    ['a review by a human', at({ actor: 'human', op: 'review', id: '*', data: { names: ['signing-rules-differ'] } }), /review records are not written by human/],
    ['a review without names', at({ actor: 'harness', op: 'review', id: '*', data: { names: [] } }), /names/],
    ['a base after entries', at(baseRecord([])), /base/],
    ['a base by a human', { ...at(baseRecord([])), actor: 'human' }, /base records are not written by human/],
  ]
  for (const [what, record, reason] of cases) {
    const step = applyRecord(base, record)
    assert.ok('bad' in step, what)
    assert.match(step.bad, reason, what)
  }
})

test('who may revoke a preference: the user, a record with the user\'s words, or the agent that just wrote it in the same session', () => {
  const preference = entryOf(foldAll([store({ ...EXAMPLE, scope: 'project' }, LLM_A)]).state, 'lead-with-the-answer')
  const fact = entryOf(foldAll([store(FACT, LLM_A)]).state, 'signing-rules-differ')
  assert.equal(revokeRefusal(fact, { actor: 'llm', session: 'session-b', agent: 'agent-2' }, 'forget'), undefined, 'a fact goes without words')
  assert.equal(revokeRefusal(preference, { actor: 'human' }, 'forget'), undefined)
  assert.equal(revokeRefusal(preference, { actor: 'llm', relay: 'Forget that one.', session: 'session-b', agent: 'agent-2' }, 'forget'), undefined)
  assert.equal(revokeRefusal(preference, { actor: 'llm', session: 'session-a', agent: 'agent-1' }, 'forget'), undefined, 'the same session and agent, just written')
  const other = revokeRefusal(preference, { actor: 'llm', session: 'session-b', agent: 'agent-2' }, 'forget')
  assert.ok(other !== undefined)
  assert.equal(other.code, 'preference_owner')
  assert.match(other.hint ?? '', /only the user revokes a preference: quote their words in relay/)
  assert.equal(revokeRefusal(preference, { actor: 'llm', session: 'session-a', agent: 'agent-9' }, 'forget')?.code, 'preference_owner', 'another agent of the same session')
  assert.equal(revokeRefusal(preference, { actor: 'llm', relay: '  ' }, 'forget')?.code, 'preference_owner', 'blank words are no words')
  assert.equal(revokeRefusal(preference, { actor: 'llm', session: 'session-a', agent: 'agent-1' }, 'restore')?.code, 'preference_owner', 'restoring needs the user\'s words')
  const confirmed: MemoryEntry = { ...preference, confirmed: { ask: "H-0a1b2c", question: "Keep answering first?", body: "", at: T0 } }
  assert.equal(revokeRefusal(confirmed, { actor: 'llm', session: 'session-a', agent: 'agent-1' }, 'forget')?.code, 'preference_owner', 'a confirmed habit has no exception')
  assert.equal(revokeRefusal(confirmed, { actor: 'human' }, 'forget'), undefined)
  const typed: MemoryEntry = { ...preference, origin: { actor: 'human' } }
  assert.equal(revokeRefusal(typed, { actor: 'llm', session: 'session-a', agent: 'agent-1' }, 'forget')?.code, 'preference_owner', 'an agent did not write it')
})

test('the fold enforces the same rule: an agent without the words cannot forget a preference, and an update does not hand over the entry', () => {
  const written = foldAll([store({ ...EXAMPLE, scope: 'project' }, LLM_A, T0)]).state
  const updatedByB = foldAll([store({ ...EXAMPLE, scope: 'project', description: 'Answer first' }, LLM_B, day(T0, 1))], written).state
  const entry = entryOf(updatedByB, 'lead-with-the-answer')
  const forgetBy = (writer: Writer, relay?: string): JournalRecord => at(revokeRecord('forget', entry, 'mistaken', { ...writer, ...(relay === undefined ? {} : { relay }) }), day(T0, 2))
  const byB = applyRecord(updatedByB, forgetBy(LLM_B))
  assert.ok('bad' in byB, 'session b updated it but did not create it')
  assert.match(byB.bad, /only the user revokes a preference/)
  assert.ok('state' in applyRecord(updatedByB, forgetBy(LLM_A)), 'session a created it and may take it back')
  assert.ok('state' in applyRecord(updatedByB, forgetBy(LLM_B, 'Forget that one.')), 'with the words anyone may')
  assert.ok('state' in applyRecord(updatedByB, forgetBy(HUMAN)))
  const confirmedState = foldAll([at(baseRecord([{ ...entry, confirmed: { ask: "H-0a1b2c", question: "Keep answering first?", body: "", at: T0 } }]))]).state
  assert.ok('bad' in applyRecord(confirmedState, forgetBy(LLM_A)), 'a confirmed habit is the user\'s alone')
  const restoreOf = (state: MemoryState, writer: Writer): JournalRecord => at(revokeRecord('restore', entryOf(state, 'lead-with-the-answer'), 'back', writer))
  const forgotten = foldAll([forgetBy(HUMAN)], updatedByB).state
  assert.ok('bad' in applyRecord(forgotten, restoreOf(forgotten, LLM_A)), 'an agent without the words cannot restore a preference')
  const restored = applyRecord(forgotten, restoreOf(forgotten, HUMAN))
  assert.ok('state' in restored)
  assert.equal(entryOf(restored.state, 'lead-with-the-answer').status, 'active')
  assert.equal(entryOf(restored.state, 'lead-with-the-answer').description, 'Answer first', 'restored as it was when forgotten')
})

test('a forget record carries the snapshot of what was forgotten, the reason and who asked', () => {
  const written = foldAll([store({ ...EXAMPLE, scope: 'project' }, LLM_A)]).state
  const entry = entryOf(written, 'lead-with-the-answer')
  const record = revokeRecord('forget', entry, 'the user changed their mind', { actor: 'llm', relay: 'Forget it.', by: { session: 'session-b', tool: 'memory_forget' } })
  assert.deepEqual([record.op, record.id, record.actor, record.relay, record.reason], ['forget', 'project:lead-with-the-answer', 'llm', 'Forget it.', 'the user changed their mind'])
  assert.deepEqual(record.data, JSON.parse(JSON.stringify(entry)))
})

test('a review raises the count of the facts named and leaves preferences and unknown names alone', () => {
  const state = foldAll([store({ ...EXAMPLE, scope: 'project' }), store(FACT)]).state
  const reviewed = foldAll([at(reviewRecord(['signing-rules-differ', 'lead-with-the-answer', 'gone']), day(T0, 5))], state)
  assert.deepEqual(reviewed.bad, [])
  const fact = entryOf(reviewed.state, 'signing-rules-differ')
  assert.deepEqual([fact.reviews, fact.lastReviewed], [1, day(T0, 5)])
  const preference = entryOf(reviewed.state, 'lead-with-the-answer')
  assert.deepEqual([preference.reviews, preference.lastReviewed], [0, T0])
  assert.equal(reviewRecord(['a-b']).actor, 'harness')
})

test('the old memory.json becomes facts without a source, names made kebab-case and kept apart, dates and counts as they were', () => {
  const long = `Hand-off of the plugin work. ${'x'.repeat(300)}`
  const converted = convertLegacy(JSON.stringify({
    version: 1,
    entries: [
      { id: 'glm-hourness-handoff', text: 'First line\nSecond line', tags: ['GLM-Hourness', '交接'], created: '2026-10-27T08:35:59.804Z', lastReviewed: '2026-10-27T08:36:48.918Z', reviews: 2 },
      { id: 'Glm Hourness Handoff', text: long, tags: [], created: '2026-10-28T00:00:00.000Z', lastReviewed: '2026-10-28T00:00:00.000Z', reviews: 0 },
      { id: 'x', text: '', tags: [], created: '2026-10-29T00:00:00.000Z', lastReviewed: '2026-10-29T00:00:00.000Z', reviews: 1 },
      { id: '交接', text: 'Only a Chinese id', tags: [], created: '2026-10-29T00:00:00.000Z', lastReviewed: '2026-10-29T00:00:00.000Z', reviews: 0 },
    ],
  }))
  assert.ok(!('error' in converted), 'error' in converted ? converted.error : '')
  const [first, second, third, fourth] = converted.entries
  assert.ok(first !== undefined && second !== undefined && third !== undefined && fourth !== undefined)
  assert.deepEqual(first, {
    name: 'glm-hourness-handoff',
    scope: 'project',
    type: 'project',
    description: 'First line',
    body: 'First line\nSecond line\nTags: GLM-Hourness, 交接',
    source: [],
    kind: 'fact',
    legacy: true,
    created: '2026-10-27T08:35:59.804Z',
    lastReviewed: '2026-10-27T08:36:48.918Z',
    reviews: 2,
    origin: { actor: 'harness' },
    status: 'active',
  })
  assert.equal(second.name, 'glm-hourness-handoff-2', 'a clash gets a number')
  assert.equal(second.description.length, 200)
  assert.ok(second.description.endsWith('…'))
  assert.match(third.name, /^legacy-/, 'a name too short is prefixed')
  assert.equal(third.body, 'x', 'an empty text falls back to the old id')
  assert.match(fourth.name, /^legacy-/, 'an id without letters or digits is prefixed')
  const names = converted.entries.map(entry => entry.name)
  assert.equal(new Set(names).size, names.length)
  const folded = foldAll([at(baseRecord(converted.entries))])
  assert.deepEqual(folded.bad, [])
  assert.deepEqual([...folded.state.entries.values()], converted.entries, 'the base record carries the whole state')
  assert.equal(at(baseRecord([])).id, '*')
  const revised = foldAll([store({ ...FACT, name: 'glm-hourness-handoff', source: ['docs/HANDOFF.md'] }, LLM_A, day(T0, 2))], folded.state)
  assert.deepEqual(revised.bad, [])
  const entry = entryOf(revised.state, 'glm-hourness-handoff')
  assert.deepEqual([entry.legacy, entry.created, entry.reviews, entry.source, entry.origin], [true, '2026-10-27T08:35:59.804Z', 3, ['docs/HANDOFF.md'], { actor: 'harness' }], 'an update keeps what marks it as migrated and counts one more review')
})

test('an old file that cannot be read is an error, never an empty store', () => {
  const broken: ReadonlyArray<readonly [string, string]> = [
    ['not JSON', '{nope'],
    ['another version', JSON.stringify({ version: 2, entries: [] })],
    ['no entries list', JSON.stringify({ version: 1 })],
    ['an entry without text', JSON.stringify({ version: 1, entries: [{ id: 'a-b', created: T0, lastReviewed: T0, reviews: 0 }] })],
    ['an entry with a date that is not one', JSON.stringify({ version: 1, entries: [{ id: 'a-b', text: 't', created: 'soon', lastReviewed: T0, reviews: 0 }] })],
    ['an entry with a negative count', JSON.stringify({ version: 1, entries: [{ id: 'a-b', text: 't', created: T0, lastReviewed: T0, reviews: -1 }] })],
  ]
  for (const [what, raw] of broken) {
    const converted = convertLegacy(raw)
    assert.ok('error' in converted, what)
    assert.ok(converted.error.length > 0, what)
  }
  assert.deepEqual(convertLegacy(JSON.stringify({ version: 1, entries: [] })), { entries: [] })
})

test('a base record that is not a list of entries, or that holds a bad entry, does not hold', () => {
  const entry = convertLegacy(JSON.stringify({ version: 1, entries: [{ id: 'old-one', text: 't', created: T0, lastReviewed: T0, reviews: 0 }] }))
  assert.ok(!('error' in entry))
  const [only] = entry.entries
  assert.ok(only !== undefined)
  const withData = (data: unknown): JournalRecord => at({ actor: 'harness', op: 'base', id: '*', data: data as JsonValue })
  const cases: ReadonlyArray<readonly [string, JournalRecord]> = [
    ['no entries list', withData({})],
    ['an entry that is not an object', withData({ entries: [3] })],
    ['an entry of another scope', withData({ entries: [{ ...JSON.parse(JSON.stringify(only)) as object, scope: 'all' }] })],
    ['an entry with a name that is not kebab-case', withData({ entries: [{ ...JSON.parse(JSON.stringify(only)) as object, name: 'Old One' }] })],
    ['a preference without the user\'s words', withData({ entries: [{ ...JSON.parse(JSON.stringify(only)) as object, type: 'user', scope: 'project' }] })],
    ['two entries with one name', at(baseRecord([only, only]))],
  ]
  for (const [what, record] of cases) assert.ok('bad' in applyRecord(emptyMemory('project'), record), what)
})

test('memoryFold gives the same object for a scope, so the journal cache keeps its folds apart', () => {
  assert.equal(memoryFold('project'), memoryFold('project'))
  assert.notEqual(memoryFold('project'), memoryFold('all'))
  assert.equal(memoryFold('all').empty().scope, 'all')
})

test('behind the real journal: records appended through the lock fold into entries, and a line written by hand that does not hold is counted', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'memory-model-'))
  const file = join(directory, 'memory.jsonl')
  const fold = memoryFold('all')
  const options = { directory: 'user', row: 'memory-test' } as const
  const first = await appendJournal(file, fold, () => ({ records: [storeRecord(request(EXAMPLE), { ...LLM_A, relayChecked: false })] }), options)
  assert.equal(first.status, 'ok')
  const second = await appendJournal(file, fold, (reading) => {
    const judged = judgeStore(reading.state, request({ ...EXAMPLE, description: 'Answer first, jargon out' }))
    assert.deepEqual(judged, { updated: true })
    return { records: [storeRecord(request({ ...EXAMPLE, description: 'Answer first, jargon out' }), { ...LLM_A, relayChecked: true })] }
  }, options)
  assert.equal(second.status, 'ok')
  appendFileSync(file, `${JSON.stringify({ v: 1, seq: 3, at: T0, actor: 'llm', op: 'store', id: 'all:guess', data: { name: 'guess', type: 'feedback', scope: 'all', description: 'A guess', body: 'Guess.\nWhy: none.' } })}\n`)
  const reading = await readJournal(file, fold)
  assert.equal(reading.bad.length, 1)
  assert.match(reading.bad[0]?.reason ?? '', /preference without the user's own words/)
  assert.equal(reading.bad[0]?.line, 3)
  const entry = entryOf(reading.state, 'lead-with-the-answer')
  assert.deepEqual([entry.description, entry.reviews, 'relayChecked' in entry], ['Answer first, jargon out', 1, false])
  assert.equal(reading.state.entries.size, 1)
})
