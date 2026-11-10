/**
 * The nightly consolidation's extraction and fold (dreaming design §3.2,
 * §3.5, `.agents/tasks/dream/design.md`): the transcript export's entries,
 * the person's marked sentences (both polarities, never an agent's), the
 * cross-session clustering and its stable names, the `propose` records the
 * fold takes and merges, the confirming `store` that takes a proposal away,
 * the `forget` that drops one, and the lines that do not hold. Secret-shaped
 * samples are assembled from parts so that no line of this file is a token
 * for the repository's secret scan.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { foldRecords, type Folded } from './fold-helpers.ts'
import {
  clusterSessions, extractCandidates, hasAvoidWord, markerOf, parseTranscript, personSentences, sentencesOf,
  DREAM_CLUSTER_SHARE, DREAM_MAX_CANDIDATES, type DreamInput,
} from '../src/memory/dream.ts'
import {
  applyRecord, emptyMemory, forgetProposalRecord, memoryId, proposeRecord, storeRecord,
  type MemoryState,
} from '../src/memory/model.ts'
import type { JournalRecord, NewRecord } from '../src/data/journal.ts'

const NOW = Date.parse('2026-11-10T10:00:00.000Z')
const HOUR = 3_600_000

let seq = 0
const at = (record: NewRecord, time = '2026-11-09T20:00:00.000Z'): JournalRecord => ({ v: 1, seq: ++seq, at: time, ...record })

const PROPOSAL_FIELDS = {
  name: 'dream-a1b2c3d4',
  type: 'feedback',
  scope: 'project',
  description: 'Commit messages stay in English',
  body: 'Commit messages stay in English.\n**Why:** the person made this request in 2 session(s).\n**How to apply:** nothing yet — a proposal waits for the person to confirm it.',
}

const EVIDENCE = ['transcripts/s1.txt', 'transcripts/s2.txt']

/** A `propose` record as the fold reads it, fields unchecked — the fold's own rejections need raw data. */
const propose = (data: Record<string, unknown>): NewRecord => {
  const name = typeof data.name === 'string' ? data.name : ''
  return { actor: 'harness', by: { tool: 'dream' }, op: 'propose', id: memoryId('project', name), data }
}

/** A transcript export the way the transcript row renders it: a five-line header, then entries. */
const transcript = (entries: readonly { readonly seq: number, readonly kind: string, readonly text: string }[]): string => [
  'Transcript of session x, exported 2026-11-09 when the conversation was compacted.',
  'Entries are the session\'s messages, tool calls and tool results up to that point, oldest first, as plain text; reasoning and images are left out.',
  'Each entry starts with a line "=== #<seq> <kind> <time>". Lines longer than 1000 characters continue on the next line.',
  'Strings that look like credentials are replaced with [redacted]. Replaced in this export: 0.',
  '',
  ...entries.flatMap(entry => [`=== #${entry.seq} ${entry.kind} 2026-11-09T12:00:00.000Z`, entry.text, '']),
].join('\n')

test('parseTranscript: the header drops, the entries keep their kind and their wrapped lines', () => {
  const entries = parseTranscript(transcript([
    { seq: 1, kind: 'user', text: '第一行\n第二行' },
    { seq: 2, kind: 'assistant', text: '回答' },
  ]))
  assert.deepEqual(entries.map(entry => [entry.seq, entry.kind]), [[1, 'user'], [2, 'assistant']])
  assert.equal(entries[0]?.text, '第一行 第二行', 'the export\'s continuation lines join with a space')
  assert.equal(entries[1]?.text, '回答')
})

test('parseTranscript: an empty file and a header-less file give no entries and no throw', () => {
  assert.deepEqual(parseTranscript(''), [])
  assert.deepEqual(parseTranscript('随便什么没有条目头的文本'), [])
})

test('the markers: the habit list is the keep side, the correction list the avoid side, English by whole word', () => {
  assert.equal(markerOf('以后都把提交说明写成英文'), 'keep')
  assert.equal(markerOf('每次都先跑测试再改代码'), 'keep')
  assert.equal(markerOf('Please remember this preference'), 'keep')
  assert.equal(markerOf('不要在主分支上直接提交'), 'avoid')
  assert.equal(markerOf('别总是把日志打到控制台'), 'avoid')
  assert.equal(markerOf('From now on, run the checks first'), 'keep')
  assert.equal(markerOf('Do not push to main'), 'avoid')
  assert.equal(markerOf('先跑测试吗？'), undefined)
  assert.equal(hasAvoidWord('一定要坚持不懈'), false, 'only the list\'s words match')
  assert.equal(hasAvoidWord('stopped early'), false, 'an English word matches whole, not by prefix')
})

test('the person\'s sentences: only user entries, at most one of each marker per entry', () => {
  const entries = parseTranscript(transcript([
    { seq: 1, kind: 'user', text: '以后都把提交说明写成英文。另外每次都先跑测试。不要在主分支直接提交。' },
    { seq: 2, kind: 'assistant', text: '我会记住的，以后都写成英文。' },
    { seq: 3, kind: 'user', text: '好的' },
  ]))
  const sentences = personSentences(entries)
  assert.equal(sentences.length, 2, 'one keep and one avoid from the first entry; the assistant line is nobody\'s request')
  assert.ok(sentences[0]?.includes('以后都把提交说明写成英文'))
  assert.ok(sentences[1]?.includes('不要在主分支直接提交'))
})

test('clustering: rephrases across sessions join, unrelated sentences and one session alone do not', () => {
  const sessions = new Map<string, readonly string[]>([
    ['s1', ['以后提交说明都用英文写', '每次都先跑测试再改代码']],
    ['s2', ['提交说明以后都用英文写吧']],
    ['s3', ['帮我把这个函数重构成更小的几块']],
  ])
  const clusters = clusterSessions(sessions).filter(cluster => cluster.sessions.size >= 2)
  assert.equal(clusters.length, 1)
  const sentences = [...new Set([...(clusters[0]?.sessions.values() ?? [])].flat())]
  assert.equal(sentences.length, 2, 'both wordings are kept as the person\'s sentences')
})

test('the threshold is the pass\'s own, measured on the spec\'s rephrases', () => {
  assert.equal(DREAM_CLUSTER_SHARE, 0.5)
})

const input = (session: string, text: string, hoursAgo: number): DreamInput =>
  ({ session, file: `transcripts/${session}.txt`, text, mtimeMs: NOW - hoursAgo * HOUR })

test('extractCandidates: a request in two sessions becomes one candidate with a stable name and the transcripts as evidence', () => {
  const [first] = extractCandidates([
    input('s1', transcript([{ seq: 1, kind: 'user', text: '以后都把提交说明写成英文' }]), 20),
    input('s2', transcript([{ seq: 1, kind: 'user', text: '提交说明，以后都要用英文来写' }]), 30),
  ], NOW)
  assert.ok(first !== undefined)
  assert.match(first.name, /^dream-[0-9a-f]{8}$/)
  assert.equal(first.type, 'feedback')
  assert.equal(first.scope, 'project')
  assert.equal(first.description, '以后都把提交说明写成英文', 'the shortest wording is the description')
  assert.match(first.body, /\*\*Why:/)
  assert.deepEqual(first.evidence, ['transcripts/s1.txt', 'transcripts/s2.txt'])
  const [again] = extractCandidates([
    input('s1', transcript([{ seq: 1, kind: 'user', text: '以后都把提交说明写成英文' }]), 20),
    input('s2', transcript([{ seq: 1, kind: 'user', text: '提交说明，以后都要用英文来写' }]), 30),
  ], NOW)
  assert.equal(again?.name, first.name, 'the same input gives the same name, so re-proposals merge')
})

test('extractCandidates: one session, the window edge, and agent words bring nothing', () => {
  const same = transcript([{ seq: 1, kind: 'user', text: '以后都把提交说明写成英文' }])
  assert.deepEqual(extractCandidates([input('s1', same, 20), input('s2', same, 30)], NOW).length, 1,
    'the same request in two exports of one session is one session')
  assert.deepEqual(extractCandidates([input('s1', same, 20)], NOW), [], 'one session is no recurrence')
  assert.deepEqual(extractCandidates([input('s1', same, 60)], NOW), [], 'older than the window is not read')
  const agentSays = transcript([
    { seq: 1, kind: 'user', text: '好' },
    { seq: 2, kind: 'assistant', text: '我以后都先写测试' },
  ])
  assert.deepEqual(extractCandidates([input('s1', agentSays, 20), input('s2', agentSays, 30)], NOW), [],
    'an agent\'s "I will always" is nobody\'s request')
})

test('extractCandidates: at most five candidates, the widest clusters first', () => {
  const inputs: DreamInput[] = [
    input('s1', transcript([
      { seq: 1, kind: 'user', text: '以后都把提交说明写成英文' },
      { seq: 2, kind: 'user', text: '不要在周末打扰我' },
      { seq: 3, kind: 'user', text: '每次都先跑测试再改代码' },
      { seq: 4, kind: 'user', text: '报告写短一点，别再啰嗦' },
      { seq: 5, kind: 'user', text: '以后都先问一句再动主分支' },
      { seq: 6, kind: 'user', text: '以后都把文档和代码同一批提交' },
    ]), 20),
    input('s2', transcript([
      { seq: 1, kind: 'user', text: '提交说明以后都用英文写' },
      { seq: 2, kind: 'user', text: '周末不要再打扰我' },
      { seq: 3, kind: 'user', text: '测试要跑在改代码之前，每次都这样' },
      { seq: 4, kind: 'user', text: '别再写长篇报告，写短一点' },
      { seq: 5, kind: 'user', text: '动主分支之前先问一声，以后都这样' },
      { seq: 6, kind: 'user', text: '文档和代码以后都要同一批提交' },
    ]), 25),
    input('s3', transcript([{ seq: 1, kind: 'user', text: '提交说明以后都用英文' }]), 30),
  ]
  const candidates = extractCandidates(inputs, NOW)
  assert.ok(candidates.length <= DREAM_MAX_CANDIDATES)
  assert.equal(candidates.length, 5, 'six clusters, the cap holds')
  assert.equal(candidates[0]?.evidence.length, 3, 'the cluster with three sessions comes first')
})

test('extractCandidates: a sentence that still reads like a credential is dropped, not proposed', () => {
  const token = ['aB3dE5gH7jK9mN1pQ3sT', '5vW7yZ9bD1fH3jL5nP7r'].join('')
  const secret = `以后 token 都用 ${token} 这个值`
  assert.deepEqual(extractCandidates([
    input('s1', transcript([{ seq: 1, kind: 'user', text: secret }]), 20),
    input('s2', transcript([{ seq: 1, kind: 'user', text: secret }]), 30),
  ]), [], 'the export redacts, and the extractor does not trust it blindly')
})

// --- The fold ---------------------------------------------------------------

const fold = (records: readonly NewRecord[], from: MemoryState = emptyMemory('project')): Folded<MemoryState> =>
  foldRecords(applyRecord, records.map(record => at(record)), from)

const storeOf = (): NewRecord => {
  const request = { ...PROPOSAL_FIELDS, source: [], relay: '以后都把提交说明写成英文', confirmNew: false }
  return storeRecord(request as Parameters<typeof storeRecord>[0], { actor: 'llm', relay: '以后都把提交说明写成英文', by: { session: 's1', tool: 'memory_store' } })
}

test('a propose lands as a proposal, and no entry: recall never sees it', () => {
  const record = proposeRecord(PROPOSAL_FIELDS, EVIDENCE, { tool: 'dream' })
  assert.ok(!('invalid' in record))
  const { state, bad } = fold([record])
  assert.deepEqual(bad, [])
  const proposal = state.proposals.get(PROPOSAL_FIELDS.name)
  assert.ok(proposal !== undefined)
  assert.equal(proposal.type, 'feedback')
  assert.deepEqual(proposal.evidence, EVIDENCE)
  assert.equal(state.entries.size, 0, 'a proposal is not an entry')
})

test('a re-proposal merges the evidence and keeps the first time', () => {
  const first = proposeRecord(PROPOSAL_FIELDS, ['transcripts/s1.txt'], { tool: 'dream' })
  assert.ok(!('invalid' in first))
  const second = proposeRecord(PROPOSAL_FIELDS, ['transcripts/s2.txt', 'transcripts/s1.txt'], { tool: 'dream' })
  assert.ok(!('invalid' in second))
  const { state } = fold([first, at(second, '2026-11-10T02:00:00.000Z')])
  const proposal = state.proposals.get(PROPOSAL_FIELDS.name)
  assert.ok(proposal !== undefined)
  assert.deepEqual(proposal.evidence, ['transcripts/s1.txt', 'transcripts/s2.txt'], 'merged, deduped')
  assert.equal(proposal.at, '2026-11-09T20:00:00.000Z')
  assert.equal(proposal.lastAt, '2026-11-10T02:00:00.000Z')
})

test('the confirming store takes the proposal and lands the entry; the person\'s words come with it', () => {
  const proposal = proposeRecord(PROPOSAL_FIELDS, EVIDENCE, { tool: 'dream' })
  assert.ok(!('invalid' in proposal))
  const { state, bad } = fold([proposal, storeOf()])
  assert.deepEqual(bad, [])
  assert.equal(state.proposals.size, 0, 'the candidate is taken')
  assert.equal(state.entries.get(PROPOSAL_FIELDS.name)?.origin.actor, 'llm', 'the entry\'s origin is the confirming store, never the pass')
})

test('a forget drops the proposal; the trail keeps what was dropped', () => {
  const proposal = proposeRecord(PROPOSAL_FIELDS, EVIDENCE, { tool: 'dream' })
  assert.ok(!('invalid' in proposal))
  const forget = forgetProposalRecord({
    ...PROPOSAL_FIELDS,
    evidence: EVIDENCE,
    at: '2026-11-09T20:00:00.000Z',
    lastAt: '2026-11-09T20:00:00.000Z',
  }, '人不要这条', { actor: 'human', by: { tool: 'memory' } })
  const { state } = fold([proposal, forget])
  assert.equal(state.proposals.size, 0)
  assert.equal((forget.data as Record<string, unknown> | undefined)?.proposal, true)
})

test('a propose for a name an entry already holds is settled: an open proposal is taken back, none is added', () => {
  const proposal = proposeRecord(PROPOSAL_FIELDS, ['transcripts/s9.txt'], { tool: 'dream' })
  assert.ok(!('invalid' in proposal))
  const { state } = fold([storeOf(), proposal])
  assert.equal(state.proposals.size, 0)
  assert.equal(state.entries.size, 1)
})

test('the lines that do not hold: not the harness, wrong id, wrong type, a relay, a credential', () => {
  const base = proposeRecord(PROPOSAL_FIELDS, EVIDENCE, { tool: 'dream' })
  assert.ok(!('invalid' in base))
  const token = ['ghp', '_'].join('') + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'
  const cases: readonly (readonly [NewRecord, string])[] = [
    [{ ...base, actor: 'llm' }, 'not written by harness'],
    [{ ...base, id: memoryId('project', 'other-name') }, 'wrong id'],
    [propose({ ...PROPOSAL_FIELDS, type: 'project' }), 'a proposal is a project norm'],
    [propose({ ...PROPOSAL_FIELDS, relay: '人的原话' }), 'carries none of the person\'s words'],
    [propose({ ...PROPOSAL_FIELDS, name: 'Not Kebab' }), 'the name is not kebab-case'],
    [propose({ ...PROPOSAL_FIELDS, body: '没有为什么的一行' }), 'a feedback needs a Why line'],
    [propose({ ...PROPOSAL_FIELDS, body: `用这个令牌 ${token}\n**Why:** 有` }), 'a credential in the body'],
    [propose({ ...PROPOSAL_FIELDS, evidence: [] }), 'no evidence'],
    [propose({ ...PROPOSAL_FIELDS, evidence: ['一\n二'] }), 'evidence is one line'],
  ]
  for (const [record, note] of cases) {
    const { bad } = fold([record])
    assert.equal(bad.length, 1, `${note}: ${JSON.stringify(bad)}`)
  }
  const userScope = fold([base], emptyMemory('all'))
  assert.equal(userScope.bad.length, 1, 'the user-level journal takes no proposals')
})

test('proposeRecord says what is invalid instead of returning a record', () => {
  assert.ok('invalid' in proposeRecord({ ...PROPOSAL_FIELDS, name: 'Not Kebab' }, EVIDENCE, { tool: 'dream' }))
  assert.ok('invalid' in proposeRecord(PROPOSAL_FIELDS, [], { tool: 'dream' }))
  assert.ok('invalid' in proposeRecord(PROPOSAL_FIELDS, ['一行\n带换行'], { tool: 'dream' }))
})

test('the sentence cutter keeps the sentences of a wrapped line whole', () => {
  assert.equal(sentencesOf('以后都把提交说明写成英文，每次提交都检查。不要推到主分支').length, 2)
})
