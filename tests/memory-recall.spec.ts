/**
 * The memory index a session starts with (M5 design §3.3): which entries are
 * visible (the project's entry hides the user's of the same name, forgotten
 * ones are gone), their order (user preferences, feedback preferences, then
 * facts by strength), the line of each kind, the faded facts counted and not
 * listed, the limits of 200 lines and 25,000 characters with their warnings,
 * and the reminder around it. The clock is a parameter.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import type { JournalRecord } from '../src/data/journal.ts'
import { applyRecord, emptyMemory, storeRecord, type MemoryEntry, type MemoryState, type MemoryType, type Scope } from '../src/memory/model.ts'
import { INDEX_MAX_CHARS, INDEX_MAX_LINES, renderIndex, visibleEntries } from '../src/memory/recall.ts'

const NOW = '2026-11-01T08:00:00.000Z'
const day = (days: number): string => new Date(Date.parse(NOW) + days * 86_400_000).toISOString()

interface Spec {
  readonly name: string
  readonly type: MemoryType
  readonly description?: string
  readonly source?: readonly string[]
  readonly created?: string
  readonly lastReviewed?: string
  readonly reviews?: number
  readonly legacy?: true
  readonly status?: 'active' | 'forgotten'
}

const entry = (spec: Spec, scope: Scope = 'project'): MemoryEntry => ({
  name: spec.name,
  scope,
  type: spec.type,
  description: spec.description ?? `About ${spec.name}`,
  body: 'Body.',
  source: spec.source ?? [],
  kind: spec.type === 'user' || spec.type === 'feedback' ? 'preference' : 'fact',
  ...(spec.legacy === undefined ? {} : { legacy: true as const }),
  created: spec.created ?? NOW,
  lastReviewed: spec.lastReviewed ?? spec.created ?? NOW,
  reviews: spec.reviews ?? 0,
  origin: { actor: 'human' },
  status: spec.status ?? 'active',
})

const stateOf = (scope: Scope, ...entries: MemoryEntry[]): MemoryState => ({ scope, entries: new Map(entries.map(item => [item.name, item])) })
const lines = (text: string): string[] => text.split('\n')
const listed = (text: string): string[] => lines(text).filter(line => line.startsWith('- '))

test('the project entry hides the user entry of the same name; forgotten entries and absent states add nothing', () => {
  const project = stateOf('project',
    entry({ name: 'shared-name', type: 'feedback', description: 'The project norm' }),
    entry({ name: 'only-here', type: 'project', source: ['docs/A.md'] }),
    entry({ name: 'was-here', type: 'project', status: 'forgotten' }),
  )
  const user = stateOf('all',
    entry({ name: 'shared-name', type: 'feedback', description: 'The person\'s habit' }, 'all'),
    entry({ name: 'only-there', type: 'user' }, 'all'),
    entry({ name: 'was-there', type: 'user', status: 'forgotten' }, 'all'),
  )
  const names = visibleEntries(project, user).map(item => `${item.scope}:${item.name}`).sort()
  assert.deepEqual(names, ['all:only-there', 'project:only-here', 'project:shared-name'])
  assert.deepEqual(visibleEntries(undefined, user).map(item => item.name).sort(), ['only-there', 'shared-name'])
  assert.deepEqual(visibleEntries(project, undefined).map(item => item.name).sort(), ['only-here', 'shared-name'])
  assert.deepEqual(visibleEntries(undefined, undefined), [])
})

test('nothing active means no index; a store of faded facts only still says how many there are', () => {
  assert.equal(renderIndex([], NOW), undefined)
  assert.equal(renderIndex([entry({ name: 'gone-for-good', type: 'project', status: 'forgotten' })], NOW), undefined)
  const faded = renderIndex([entry({ name: 'old-one', type: 'project', lastReviewed: day(-100) })], NOW)
  assert.ok(faded !== undefined)
  assert.deepEqual([faded.listed, faded.faded, faded.truncated], [0, 1, false])
  assert.match(faded.text, /1 faded memory is not listed; memory_query finds it\./)
  assert.deepEqual(listed(faded.text), [])
})

test('the reminder has the header, the list, the faded count and the pointer to memory_query, inside system-reminder tags', () => {
  const index = renderIndex([
    entry({ name: 'reply-conclusion-first', type: 'user', description: 'Wants the conclusion first, in plain words' }),
    entry({ name: 'commit-one-change', type: 'feedback', description: 'One change per commit, message says why' }),
    entry({ name: 'signing-rules-differ', type: 'project', description: 'coding-plan and start-plan sign requests differently', source: ['docs/DESIGN.md §4.3', 'docs/B.md'] }),
    entry({ name: 'old-a', type: 'project', lastReviewed: day(-100) }),
    entry({ name: 'old-b', type: 'reference', lastReviewed: day(-100) }),
  ], NOW)
  assert.ok(index !== undefined)
  assert.equal(index.text, [
    '<system-reminder>',
    'Contents of the memory index (user\'s auto-memory, persists across conversations):',
    '',
    '- reply-conclusion-first (user) — Wants the conclusion first, in plain words',
    '- commit-one-change (feedback) — One change per commit, message says why',
    '- signing-rules-differ (project) — coding-plan and start-plan sign requests differently [source: docs/DESIGN.md §4.3]',
    '',
    '2 faded memories are not listed; memory_query finds them.',
    'Read a memory in full with memory_query {"name": "<name>"}.',
    '</system-reminder>',
  ].join('\n'))
  assert.deepEqual([index.listed, index.faded, index.truncated], [3, 2, false])
  const quiet = renderIndex([entry({ name: 'reply-conclusion-first', type: 'user' })], NOW)
  assert.ok(quiet !== undefined)
  assert.ok(!quiet.text.includes('faded'), 'no faded line when nothing faded')
  assert.match(quiet.text, /\n\nRead a memory in full with memory_query \{"name": "<name>"\}\.\n<\/system-reminder>$/)
})

test('preferences come first, user before feedback and the newer first; facts follow by strength, whatever their type', () => {
  const index = renderIndex([
    entry({ name: 'fact-weak', type: 'project', lastReviewed: day(-20), source: ['docs/A.md'] }),
    entry({ name: 'feedback-old', type: 'feedback', created: day(-30) }),
    entry({ name: 'fact-strong', type: 'reference', lastReviewed: day(-1) }),
    entry({ name: 'user-old', type: 'user', created: day(-40) }),
    entry({ name: 'feedback-new', type: 'feedback', created: day(-2) }),
    entry({ name: 'user-new', type: 'user', created: day(-3) }),
    entry({ name: 'fact-middle', type: 'project', lastReviewed: day(-10), source: ['docs/B.md'] }),
    entry({ name: 'fact-reviewed', type: 'project', lastReviewed: day(-20), reviews: 10, source: ['docs/C.md'] }),
  ], NOW)
  assert.ok(index !== undefined)
  assert.deepEqual(listed(index.text).map(line => /^- (\S+)/.exec(line)?.[1]), [
    'user-new', 'user-old', 'feedback-new', 'feedback-old', 'fact-strong', 'fact-middle', 'fact-reviewed', 'fact-weak',
  ])
})

test('facts below strength 0.1 are not listed (about 47 days without a review), preferences never fade', () => {
  const index = renderIndex([
    entry({ name: 'edge-in', type: 'project', lastReviewed: day(-40), source: ['docs/A.md'] }),
    entry({ name: 'edge-out', type: 'project', lastReviewed: day(-50), source: ['docs/B.md'] }),
    entry({ name: 'old-habit', type: 'user', created: day(-400) }),
  ], NOW)
  assert.ok(index !== undefined)
  assert.deepEqual(listed(index.text).map(line => /^- (\S+)/.exec(line)?.[1]), ['old-habit', 'edge-in'])
  assert.equal(index.faded, 1)
})

test('a project line shows its first source, a migrated one says it has none, other types show no source', () => {
  const index = renderIndex([
    entry({ name: 'a-fact', type: 'project', source: ['commit:cae6ddf', 'docs/B.md'] }),
    entry({ name: 'a-migrated-fact', type: 'project', legacy: true }),
    entry({ name: 'a-reference', type: 'reference', source: ['https://example.com/board'] }),
  ], NOW)
  assert.ok(index !== undefined)
  const rows = listed(index.text)
  assert.ok(rows.includes('- a-fact (project) — About a-fact [source: commit:cae6ddf]'), rows.join('\n'))
  assert.ok(rows.includes('- a-migrated-fact (project) — About a-migrated-fact [source: none, migrated]'), rows.join('\n'))
  assert.ok(rows.includes('- a-reference (reference) — About a-reference'), rows.join('\n'))
})

test('a migrated entry that was updated with a source shows that source', () => {
  const index = renderIndex([entry({ name: 'a-fact', type: 'project', legacy: true, source: ['docs/HANDOFF.md'] })], NOW)
  assert.ok(index !== undefined)
  assert.deepEqual(listed(index.text), ['- a-fact (project) — About a-fact [source: docs/HANDOFF.md]'])
})

test('more than 200 entries list the first 200 and end with the warning, which names how many there are', () => {
  const entries = Array.from({ length: 250 }, (_, index) => entry({ name: `habit-${String(index).padStart(3, '0')}`, type: 'user', created: day(-index) }))
  const index = renderIndex(entries, NOW)
  assert.ok(index !== undefined)
  assert.equal(INDEX_MAX_LINES, 200)
  assert.equal(listed(index.text).length, 200)
  assert.deepEqual([index.listed, index.truncated], [200, true])
  const rows = lines(index.text)
  const last = rows.lastIndexOf(listed(index.text)[199] ?? '')
  assert.equal(rows[last + 1], '> WARNING: the memory index is 250 lines (limit: 200). Only part of it was loaded.')
  assert.ok(listed(index.text).includes('- habit-000 (user) — About habit-000'), 'the newest are kept')
  assert.ok(!listed(index.text).some(row => row.startsWith('- habit-249 ')))
})

test('an index over 25,000 characters stops before the line that would pass the limit and says so', () => {
  const long = 'd'.repeat(200)
  const entries = Array.from({ length: 150 }, (_, index) => entry({ name: `habit-${String(index).padStart(3, '0')}`, type: 'user', description: long, created: day(-index) }))
  const index = renderIndex(entries, NOW)
  assert.ok(index !== undefined)
  assert.equal(INDEX_MAX_CHARS, 25_000)
  const rows = listed(index.text)
  assert.ok(rows.length < 150 && rows.length > 80, `${rows.length} lines`)
  assert.ok(rows.join('\n').length <= INDEX_MAX_CHARS)
  assert.ok(rows.join('\n').length + rows[0].length + 1 > INDEX_MAX_CHARS, 'the next line would not have fitted')
  assert.equal(index.truncated, true)
  assert.match(index.text, /\n> WARNING: the memory index is \d+ characters \(limit: 25000\)\. Only part of it was loaded\.\n/)
  assert.ok(!/memory index is \d+ lines/.test(index.text), 'the line limit was not passed')
})

test('the same entries give the same text, whatever order they come in', () => {
  const entries = [
    entry({ name: 'b-habit', type: 'user', created: day(-1) }),
    entry({ name: 'a-habit', type: 'user', created: day(-1) }),
    entry({ name: 'c-fact', type: 'project', source: ['docs/A.md'] }),
  ]
  const forward = renderIndex(entries, NOW)
  const backward = renderIndex([...entries].reverse(), NOW)
  assert.ok(forward !== undefined && backward !== undefined)
  assert.equal(forward.text, backward.text)
})

test('an index built from entries folded out of records lists them as stored', () => {
  const at = (record: ReturnType<typeof storeRecord>): JournalRecord => ({ v: 1, seq: 1, at: NOW, ...record })
  const request = {
    name: 'lead-with-the-answer',
    type: 'feedback' as const,
    scope: 'all' as const,
    description: 'Start every reply with the answer',
    body: 'Answer first.\n**Why:** the user reads on a phone.',
    source: [],
    relay: 'Start with the answer.',
    confirmNew: false,
  }
  const step = applyRecord(emptyMemory('all'), at(storeRecord(request, { actor: 'llm', by: { session: 'session-a' } })))
  assert.ok('state' in step)
  const index = renderIndex(visibleEntries(undefined, step.state), NOW)
  assert.ok(index !== undefined)
  assert.deepEqual(listed(index.text), ['- lead-with-the-answer (feedback) — Start every reply with the answer'])
})
