/**
 * The memory tools over real journals in temporary directories (M5 design
 * §3.2 to §3.4, acceptance m5-1, m5-2): what a write may carry (text the old
 * path test refused, and the shapes of a secret that it must refuse), the
 * credential of a preference, the scopes and their directories, the
 * migration of the old `memory.json`, the recall and its review records, and
 * who may take a memory back.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { LockEnvironment } from '../src/data/lock.ts'
import { isRefusal } from '../src/data/refusal.ts'
import { checkStore, classify } from '../src/memory/model.ts'
import { journalFile, readScope } from '../src/memory/storage.ts'
import { MEMORY_STORE_EXAMPLE, memoryTools } from '../src/memory/tools.ts'
import { agentOf, journalRecords, MAIN, refusalOf, withFixture } from './memory-helpers.ts'

const GHP = `${['ghp', '_'].join('')}${'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'}`
const MIXED_TOKEN = ['aB3dE5gH7jK9mN1pQ3sT', '5vW7yZ9bD1fH3jL5nP7r'].join('')
const PEM = ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' ')
const SHA = '0123456789abcdef0123456789abcdef01234567'

const withMemory = withFixture

const records = journalRecords

const preference = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ ...MEMORY_STORE_EXAMPLE, ...over })
const fact = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'signing-rules-differ',
  type: 'project',
  description: 'coding-plan and start-plan sign requests differently',
  body: 'The two tiers sign differently.\n**Why:** a request signed the wrong way is refused.',
  source: ['docs/DESIGN.md §4.3'],
  ...over,
})
const KNOWN = ['docs/DESIGN.md §4.3', 'goal-1']
const names = (value: unknown): string[] => (value as Array<{ name: string }>).map(match => match.name)

/** A lock environment on a clock that only `sleep` moves, for a holder that is "alive". */
function clockLock(): LockEnvironment {
  let clock = 1_000_000
  return { now: () => clock, sleep: (ms) => { clock += ms; return Promise.resolve() }, pid: 4242, isAlive: () => true }
}

const EXEC = { agent: MAIN, callId: 'c', signal: new AbortController().signal, deferContext: () => {}, concludeTurn: () => {} }

test('the example in the description goes through the same check as a real call and stores a preference the person said', () => withMemory(async (memory) => {
  const checked = checkStore(MEMORY_STORE_EXAMPLE)
  assert.ok(!isRefusal(checked))
  assert.equal(classify(checked.type), 'preference')
  assert.ok(memory.tools.get('memory_store')?.description.includes(`memory_store ${JSON.stringify(MEMORY_STORE_EXAMPLE, null, 2)}`))
  assert.deepEqual(await memory.call('memory_store', MEMORY_STORE_EXAMPLE), { stored: true, name: 'lead-with-the-answer', scope: 'all', kind: 'preference', updated: false })
  const [record] = records(memory.places.user!)
  assert.equal(record?.actor, 'llm')
  assert.equal(record?.relay, 'Start with the answer, and keep jargon out.')
  assert.deepEqual(record?.by, { session: 'main-session', agent: 'main-session', tool: 'memory_store', callId: 'call-1' })
  assert.equal(record?.data.relayChecked, false, 'with the person\'s messages unreadable the words stay unchecked')
  assert.equal(records(memory.places.project!).length, 0, 'a preference about the person is not in the project')
}))

test('a memory that names a path, a file or a long identifier is stored: the old heuristic that refused them is gone', () => withMemory(async (memory) => {
  const stored = await memory.call('memory_store', {
    name: 'signing-paths',
    type: 'reference',
    description: 'coding-plan/start-plan and src/shared/dsh-min.ts',
    body: 'See reference/ZCode/apps/zcode-cli/packages/core/src/context/sections/memory.ts and buildProviderEndpointRoutingHeaders; cli/packages/core/src/context/sections/memory.',
  })
  assert.equal(stored.stored, true)
  const forms = [['fact-bare', 'Bare commit id as the source', SHA], ['fact-prefixed', 'Prefixed commit as the origin', `commit:${SHA}`]] as const
  for (const [name, description, source] of forms) {
    assert.equal((await memory.call('memory_store', fact({ name, description, source: [source] }))).stored, true, source)
  }
  assert.deepEqual(names((await memory.call('memory_query', { focus: 'dsh-min' })).matches), ['signing-paths'])
}))

test('a secret is refused with its class and nothing is written; a commit id is not a secret', () => withMemory(async (memory) => {
  for (const [secret, kind] of [[GHP, 'prefix'], [MIXED_TOKEN, 'token shape'], [PEM, 'pem']] as const) {
    const refused = await refusalOf(memory.call('memory_store', fact({ body: `The key is ${secret}\n**Why:** test` })))
    assert.equal(refused.code, 'secret_like')
    assert.equal(refused.field, 'body')
    assert.ok(refused.message.includes(kind), refused.message)
  }
  assert.equal((await refusalOf(memory.call('memory_store', fact({ source: [`call:${GHP}`] })))).code, 'secret_like')
  assert.equal((await refusalOf(memory.call('memory_store', preference({ relay: `my key ${GHP}` })))).field, 'relay')
  const bad = await refusalOf(memory.call('memory_store', fact({ source: ['commit:xyz1234'] })))
  assert.deepEqual([bad.code, bad.field], ['invalid', 'source'])
  assert.ok(!existsSync(journalFile(memory.places.project!)) && !existsSync(journalFile(memory.places.user!)))
}))

test('the field rules of a write: Why line, a source that can be recognised, the scope each type may have, no extra field', () => withMemory(async (memory) => {
  const refusals = (args: Record<string, unknown>) => refusalOf(memory.call('memory_store', args))
  assert.equal((await refusals(fact({ body: 'no reason given' }))).code, 'invalid')
  assert.equal((await refusals(fact({ source: [] }))).code, 'bad_source')
  assert.equal((await refusals(fact({ source: ['docs/nowhere.md'] }))).code, 'bad_source')
  const scope = await refusals(fact({ scope: 'all' }))
  assert.deepEqual([scope.code, scope.field], ['invalid', 'scope'])
  const noScope = await refusals(preference({ scope: undefined }))
  assert.deepEqual([noScope.code, noScope.field], ['invalid', 'scope'])
  assert.ok(noScope.hint?.includes('"all"') === true && noScope.hint.includes('"project"'))
  assert.equal((await refusals(preference({ extra: 1 }))).field, 'extra')
  assert.equal((await refusals({ name: 'x' })).code, 'invalid')
  const user = await memory.call('memory_store', { name: 'works-at-night', type: 'user', description: 'Works at night', body: 'Replies are read at night.', relay: 'I work at night.' })
  assert.equal(user.scope, 'all', 'a user memory without a scope is about the person')
  assert.equal(records(memory.places.user!).length, 1)
}, { known: KNOWN }))

test('a preference without the person\'s words is refused as ask_first, and the hint names memory_habit (H1)', () => withMemory(async (memory) => {
  const refused = await refusalOf(memory.call('memory_store', preference({ relay: undefined })))
  assert.deepEqual([refused.code, refused.field], ['ask_first', 'relay'])
  assert.ok(refused.hint?.includes('call memory_habit with action "ask"') === true && refused.hint.includes('record it with action "confirm"'))
  const relayText = (memory.tools.get('memory_store')?.parameters as { properties: { relay: { description: string } } }).properties.relay.description
  assert.ok(relayText.includes('from their latest message') && relayText.includes('ask first with memory_habit'))
  const depth = await refusalOf(memory.call('memory_store', { name: 'reporting-depth', type: 'user', description: 'Reports', body: 'Short.', value: 'concise' }))
  assert.deepEqual([depth.code, depth.field], ['invalid', 'value'], 'reporting-depth without words is invalid before it is ask_first')
}))

test('reporting-depth keeps the value in the user-level journal as a preference with the person\'s words', () => withMemory(async (memory) => {
  const stored = await memory.call('memory_store', { name: 'reporting-depth', type: 'user', description: 'Short reports', body: 'Keep reports short.\n**Why:** reads on a phone.', value: 'concise', relay: 'From now on just the key points.' })
  assert.equal(stored.kind, 'preference')
  const read = await readScope('all', memory.places.user!)
  assert.ok(read.ok)
  assert.equal(read.read.state.entries.get('reporting-depth')?.value, 'concise')
  for (const bad of [{ value: 'brief' }, { name: 'other-name' }, { relay: undefined }]) {
    assert.equal((await refusalOf(memory.call('memory_store', { name: 'reporting-depth', type: 'user', description: 'Short reports', body: 'Keep reports short.', value: 'concise', relay: 'Key points.', ...bad }))).code, 'invalid')
  }
}))

test('a new name close to an existing one is refused as similar with the neighbours listed, and stored with confirmNew; the same name updates', () => withMemory(async (memory) => {
  const base = { type: 'feedback', scope: 'all', description: 'Wants the conclusion first in plain words', body: 'Lead with the conclusion.\n**Why:** short replies.', relay: 'Conclusion first, please.' }
  await memory.call('memory_store', { ...base, name: 'reply-conclusion-first' })
  const similar = await refusalOf(memory.call('memory_store', { ...base, name: 'reply-conclusion-first-v2' }))
  assert.equal(similar.code, 'similar')
  assert.ok(similar.message.includes('reply-conclusion-first (feedback)'))
  assert.ok(similar.hint?.includes('confirmNew: true') === true)
  assert.equal((await memory.call('memory_store', { ...base, name: 'reply-conclusion-first-v2', confirmNew: true })).updated, false)
  const again = await memory.call('memory_store', { ...base, name: 'reply-conclusion-first', body: 'Lead with the conclusion, then the reasons.\n**Why:** short replies.' })
  assert.equal(again.updated, true)
  const changed = await refusalOf(memory.call('memory_store', { ...base, type: 'user', name: 'reply-conclusion-first' }))
  assert.deepEqual([changed.code, changed.field], ['invalid', 'type'], 'a preference does not become a fact that fades')
}, { known: KNOWN }))

test('an update keeps who made the entry and when, and counts one review', () => withMemory(async (memory) => {
  await memory.call('memory_store', preference(), agentOf('session-a', { cwd: 'C:/work/a' }))
  await memory.call('memory_store', preference({ body: 'Open with the answer.\n**Why:** a phone.' }), agentOf('session-b', { cwd: 'C:/work/b' }))
  const read = await readScope('all', memory.places.user!)
  assert.ok(read.ok)
  const entry = read.read.state.entries.get('lead-with-the-answer')
  assert.equal(entry?.origin.session, 'session-a')
  assert.equal(entry?.reviews, 1)
  assert.equal(entry?.body, 'Open with the answer.\n**Why:** a phone.')
}))

test('the two scopes go to their own directories', () => withMemory(async (memory) => {
  assert.equal((await memory.call('memory_store', fact())).scope, 'project')
  assert.equal(records(memory.places.project!).length, 1)
  assert.equal(records(memory.places.user!).length, 0)
}, { known: KNOWN }))

test('without a project directory a project memory is refused as no_project, and what is about the person is still kept', () => withMemory(async (memory) => {
  const refused = await refusalOf(memory.call('memory_store', fact()))
  assert.equal(refused.code, 'no_project')
  assert.ok(refused.hint?.includes('.llm') === true)
  assert.equal((await memory.call('memory_store', preference())).stored, true)
}, { places: root => ({ user: join(root, 'user', 'memory') }) }))

test('without the user-level directory a memory about the person is refused as no_user_dir, and a project one is still kept', () => withMemory(async (memory) => {
  assert.equal((await refusalOf(memory.call('memory_store', preference()))).code, 'no_user_dir')
  assert.equal((await memory.call('memory_store', fact())).stored, true)
}, { known: KNOWN, places: root => ({ project: join(root, 'project') }) }))

test('the first write to a project makes git ignore .llm; when that cannot be done nothing is created and the row is told', () => withMemory(async (memory) => {
  const repo = join(memory.root, 'repo')
  mkdirSync(join(repo, '.git', 'info'), { recursive: true })
  const storeIn = (project: string) => memoryTools({ ...memory.env, places: () => ({ project }) }).find(tool => tool.name === 'memory_store')!
  await storeIn(join(repo, '.llm')).execute(fact(), EXEC)
  assert.ok(readFileSync(join(repo, '.git', 'info', 'exclude'), 'utf8').includes('.llm/'))

  const blocked = join(memory.root, 'blocked')
  mkdirSync(join(blocked, '.git', 'info', 'exclude'), { recursive: true }) // a directory where the file should be
  const refused = await refusalOf(storeIn(join(blocked, '.llm')).execute(fact(), EXEC))
  assert.equal(refused.code, 'io')
  assert.ok(refused.message.includes('(directory)'), refused.message)
  assert.ok(!existsSync(join(blocked, '.llm')), 'no .llm folder is made where git was not told to ignore it')
  assert.ok(memory.notes.some(note => note.key === 'directory' && note.text?.includes('.llm') === true))
}, { known: KNOWN }))

test('the old memory.json is migrated by the first write: its state first in the journal, the file renamed; a later write finds that done', () => withMemory(async (memory) => {
  const legacy = join(memory.places.project!, 'memory.json')
  mkdirSync(memory.places.project!, { recursive: true })
  writeFileSync(legacy, JSON.stringify({ version: 1, entries: [{ id: 'glm-hourness-handoff', text: 'Old handoff note', tags: ['handoff'], created: '2026-10-27T00:00:00.000Z', lastReviewed: '2026-10-27T00:00:00.000Z', reviews: 1 }] }))
  const before = await readScope('project', memory.places.project!)
  assert.ok(before.ok && before.read.fromLegacy && before.read.state.entries.has('glm-hourness-handoff'), 'read through the converted file')
  assert.ok(!existsSync(journalFile(memory.places.project!)), 'a read does not migrate')
  const queried = await memory.call('memory_query', { focus: 'handoff' })
  assert.deepEqual(names(queried.matches), ['glm-hourness-handoff'])
  assert.deepEqual(records(memory.places.project!).map(record => record.op), ['base', 'review'], 'the review of a recalled fact is the first write, and it migrates')
  assert.ok(!existsSync(legacy))
  assert.equal(readdirSync(memory.places.project!).filter(file => file.startsWith('memory.json.migrated-')).length, 1)
  await memory.call('memory_store', fact())
  assert.deepEqual(records(memory.places.project!).map(record => record.op), ['base', 'review', 'store'])
  const after = await readScope('project', memory.places.project!)
  assert.ok(after.ok && after.read.state.entries.get('glm-hourness-handoff')?.legacy === true && !after.read.fromLegacy)
}, { known: KNOWN }))

test('an old memory.json that cannot be read is never overwritten: a write reports it and writes nothing, a query says it could not read the project', () => withMemory(async (memory) => {
  mkdirSync(memory.places.project!, { recursive: true })
  const legacy = join(memory.places.project!, 'memory.json')
  writeFileSync(legacy, '{ not json')
  const stored = await refusalOf(memory.call('memory_store', fact()))
  assert.equal(stored.code, 'io')
  assert.ok(stored.message.includes('memory.json') && stored.message.includes('left as it is'), stored.message)
  const queried = await memory.call('memory_query', { focus: 'anything' })
  assert.deepEqual(queried.matches, [])
  assert.ok((queried.notes as string[])[0]?.includes('memory.json') === true)
  assert.equal(readFileSync(legacy, 'utf8'), '{ not json')
  assert.ok(!existsSync(journalFile(memory.places.project!)))
  assert.ok(memory.notes.some(note => note.key === 'legacy' && note.text?.includes('旧记忆文件读不出') === true))
}, { known: KNOWN }))

test('a leftover memory.json next to a journal is renamed at the next write', () => withMemory(async (memory) => {
  await memory.call('memory_store', fact())
  const legacy = join(memory.places.project!, 'memory.json')
  writeFileSync(legacy, JSON.stringify({ version: 1, entries: [] }))
  const read = await readScope('project', memory.places.project!)
  assert.ok(read.ok && read.read.leftover, 'the reader sees the leftover')
  await memory.call('memory_store', fact({ name: 'another-fact', description: 'a second fact about sources', source: ['goal-1'] }))
  assert.ok(!existsSync(legacy))
}, { known: KNOWN }))

test('a journal that stays busy gives busy with the way to retry, and writes nothing', () => withMemory(async (memory) => {
  mkdirSync(memory.places.project!, { recursive: true })
  writeFileSync(`${journalFile(memory.places.project!)}.lock`, JSON.stringify({ pid: 99, startedAt: 1_000_000, at: 1_000_000, token: 'someone-else' }))
  const busy = await refusalOf(memory.call('memory_store', fact()))
  assert.equal(busy.code, 'busy')
  assert.equal(busy.hint, 'retry in a moment')
  assert.ok(!existsSync(journalFile(memory.places.project!)))
}, { known: KNOWN, append: { lock: clockLock() } }))

test('recall ranks by keyword hits times strength, reads one by name, filters by type and limits; a project entry shadows the person\'s of the same name', () => withMemory(async (memory) => {
  await memory.call('memory_store', preference())
  await memory.call('memory_store', fact())
  await memory.call('memory_store', fact({ name: 'sourcing-hint', description: 'where the reference is', body: 'Check the reference.\n**Why:** it moves.', type: 'reference', source: [] }))
  const hits = (await memory.call('memory_query', { focus: 'answer jargon' })).matches as Array<Record<string, unknown>>
  assert.deepEqual(names(hits), ['lead-with-the-answer'])
  assert.equal(hits[0]?.strength, 1)
  assert.equal(hits[0]?.relayChecked, false)
  const byName = (await memory.call('memory_query', { name: 'signing-rules-differ' })).matches as Array<Record<string, unknown>>
  assert.equal(byName.length, 1)
  assert.equal(byName[0]?.body, 'The two tiers sign differently.\n**Why:** a request signed the wrong way is refused.')
  assert.deepEqual(names((await memory.call('memory_query', { focus: 'sign reference answer', type: 'reference' })).matches), ['sourcing-hint'])
  assert.equal(((await memory.call('memory_query', { focus: 'why', limit: 1 })).matches as unknown[]).length, 1)
  await memory.call('memory_store', { ...MEMORY_STORE_EXAMPLE, scope: 'project', relay: 'Do it here too.' })
  const shadowing = (await memory.call('memory_query', { name: 'lead-with-the-answer' })).matches as Array<Record<string, unknown>>
  assert.deepEqual([shadowing.length, shadowing[0]?.scope, shadowing[0]?.shadows], [1, 'project', 'all'])
}, { known: KNOWN }))

test('a recalled fact is reviewed in the project journal by one record naming it; a preference is not, and a query writes nothing else', () => withMemory(async (memory) => {
  await memory.call('memory_store', preference())
  await memory.call('memory_store', fact())
  const queried = await memory.call('memory_query', { focus: 'sign tiers answer' })
  assert.equal((queried.matches as unknown[]).length, 2)
  assert.deepEqual(records(memory.places.project!).filter(record => record.op === 'review').map(record => record.data), [{ names: ['signing-rules-differ'] }])
  assert.equal(records(memory.places.user!).filter(record => record.op !== 'store').length, 0)
  const read = await readScope('project', memory.places.project!)
  assert.ok(read.ok)
  assert.equal(read.read.state.entries.get('signing-rules-differ')?.reviews, 1)
}, { known: KNOWN }))

test('what the query is asked has to be well formed', () => withMemory(async (memory) => {
  for (const [args, field] of [[{}, undefined], [{ focus: '' }, 'focus'], [{ focus: 'a', limit: 0 }, 'limit'], [{ focus: 'a', limit: 21 }, 'limit'], [{ focus: 'a', limit: 1.5 }, 'limit'], [{ focus: 'a', type: 'note' }, 'type'], [{ focus: 'a', other: 1 }, 'other']] as const) {
    const refused = await refusalOf(memory.call('memory_query', args))
    assert.deepEqual([refused.code, refused.field], ['invalid', field])
  }
}))

test('a preference is forgotten with the person\'s words, or without them by the agent that wrote it in the same session, and not by another session; a fact goes directly', () => withMemory(async (memory) => {
  const writer = agentOf('session-a', { cwd: 'C:/work/a' })
  await memory.call('memory_store', preference(), writer)
  await memory.call('memory_store', preference({ name: 'second-preference', description: 'Another way to work', relay: 'Do it my way.' }), writer)
  await memory.call('memory_store', fact())
  const other = await refusalOf(memory.call('memory_forget', { name: 'lead-with-the-answer', reason: 'not needed' }, agentOf('session-b')))
  assert.equal(other.code, 'preference_owner')
  assert.ok(other.hint?.includes('quote their words in relay') === true)
  assert.equal((await memory.call('memory_forget', { name: 'lead-with-the-answer', reason: 'the user said so', relay: 'Forget that one.' }, agentOf('session-b'))).forgotten, true)
  assert.equal((await memory.call('memory_forget', { name: 'second-preference', reason: 'recorded by mistake' }, writer)).forgotten, true)
  assert.equal((await memory.call('memory_forget', { name: 'signing-rules-differ', reason: 'out of date' }, agentOf('session-c'))).kind, 'fact')
  const forgotten = records(memory.places.user!).filter(record => record.op === 'forget')
  assert.equal(forgotten.length, 2)
  assert.equal(forgotten[0]?.relay, 'Forget that one.')
  assert.equal(forgotten[0]?.data.name, 'lead-with-the-answer', 'the record keeps the entry as it was')
  assert.equal((await refusalOf(memory.call('memory_forget', { name: 'lead-with-the-answer', reason: 'again' }))).code, 'not_found')
}, { known: KNOWN }))

test('forget looks in the project first, takes a named scope, and refuses what is not well formed or looks like a secret', () => withMemory(async (memory) => {
  await memory.call('memory_store', preference())
  await memory.call('memory_store', { ...MEMORY_STORE_EXAMPLE, scope: 'project' })
  const forgotten = await memory.call('memory_forget', { name: 'lead-with-the-answer', reason: 'wrong one', relay: 'Forget it.', scope: 'all' })
  assert.equal(forgotten.scope, 'all')
  assert.equal((await memory.call('memory_forget', { name: 'lead-with-the-answer', reason: 'the rest', relay: 'Forget it.' })).scope, 'project')
  for (const [args, field] of [[{ name: 'a', reason: '' }, 'reason'], [{ name: 'a', reason: 'x', scope: 'user' }, 'scope'], [{ name: 'a', reason: 'x', relay: ' ' }, 'relay'], [{ name: 'a', reason: 'x', more: 1 }, 'more'], [{ name: 'a', reason: `key ${GHP}` }, 'reason']] as const) {
    assert.equal((await refusalOf(memory.call('memory_forget', args))).field, field)
  }
}))

test('a delegated child is refused by every memory tool, with the way to hand back what it learned', () => withMemory(async (memory) => {
  const child = agentOf('child-session', { cwd: 'C:/work/project', subagent: true })
  for (const [name, args] of [['memory_store', preference()], ['memory_query', { focus: 'x' }], ['memory_forget', { name: 'x', reason: 'y' }]] as const) {
    const refused = await refusalOf(memory.call(name, args, child))
    assert.equal(refused.code, 'role', name)
    assert.ok(refused.hint?.includes('handback') === true)
  }
  assert.ok(!existsSync(journalFile(memory.places.user!)))
}))

test('the source has no trace of the git-knowability test: defaultKnowableFromGit, shouldStore and knowableFromGit are gone', () => {
  const dir = join(import.meta.dirname, '..', 'src')
  const files = (path: string): string[] => readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(path, entry.name)) : entry.name.endsWith('.ts') ? [join(path, entry.name)] : [])
  for (const file of files(dir)) {
    const text = readFileSync(file, 'utf8')
    for (const word of ['defaultKnowableFromGit', 'shouldStore', 'knowableFromGit']) assert.ok(!text.includes(word), `${file} still has ${word}`)
  }
})
