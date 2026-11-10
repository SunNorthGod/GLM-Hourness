/**
 * The memory row's hand-over to the loop board (dreaming design §3.1–§3.7,
 * `.agents/tasks/dream/design.md`): the entry passes the board's own
 * validation as a plugin entry whose harness action is the one the row
 * lists; the runner refuses a foreign action and, without the board's
 * service, nothing is handed over at all; a pass over real temporary
 * transcripts proposes once, settles the second time, merges new evidence
 * the third; the person confirms with memory_store and drops with
 * memory_forget, both through the row's real tools; the page lists the open
 * candidates.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  DREAM_ACTION, DREAM_ENTRY_ID, MEMORY_ROW_SOURCE, dreamContribution, dreamDetails, dreamEntry, installDreamEntry, runDream,
  type DreamDeps,
} from '../src/memory/loop-entry.ts'
import { emptyMemory, type MemoryState } from '../src/memory/model.ts'
import { journalFile, readScope } from '../src/memory/storage.ts'
import type { ContributionHost, LoopEventRecord } from '../src/loops/service.ts'
import { validateContribution } from '../src/loops/registry.ts'
import { validateEntry } from '../src/loops/model.ts'
import { withRow, type Row } from './memory-row-host.ts'
import { skipIfTempInsideGit } from './temp-outside-git.ts'

const skip = skipIfTempInsideGit()

const NOW = new Date('2026-11-10T10:00:00.000Z')
const stubDeps = (): DreamDeps => ({ ctx: { get: () => undefined }, now: () => NOW })

const event = (project: string): LoopEventRecord => ({
  id: 'ev-dream0000000000',
  event: 'time',
  at: NOW.toISOString(),
  project,
  key: 'dream:nightly',
  payload: {},
  merged: [],
})

test('the board takes the memory row\'s hand-over whole (the contract test)', () => {
  const check = validateContribution(MEMORY_ROW_SOURCE, dreamContribution(stubDeps()), { table: new Map(), owners: new Map(), now: NOW })
  assert.ok(check.ok, JSON.stringify(check))
  assert.ok(check.ok && check.dropped.length === 0, JSON.stringify(check))
  assert.ok(check.ok && check.namespace === 'memory')
  const entry = dreamEntry()
  assert.equal(entry.id, DREAM_ENTRY_ID)
  assert.deepEqual(entry.when, { kind: 'daily', time: '18:35' })
  assert.equal(entry.action.kind, 'harness')
  if (entry.action.kind === 'harness') {
    assert.equal(entry.action.action, DREAM_ACTION)
    assert.equal(entry.action.tell?.wake, false, 'a night of candidates does not wake the person')
    assert.ok(entry.action.tell !== undefined && entry.action.tell.text.length > 0)
  }
})

test('the action-name gate: the entry only names the action the hand-over lists', () => {
  const table = new Map()
  const sound = validateEntry(dreamEntry(), 'plugin', { table, now: NOW, actions: new Set([DREAM_ACTION]) })
  assert.deepEqual(sound, [])
  const missing = validateEntry(dreamEntry(), 'plugin', { table, now: NOW, actions: new Set(['other.action']) })
  assert.ok(missing.some(issue => issue.path === 'action.action'), JSON.stringify(missing))
  const unlisted = validateEntry(dreamEntry(), 'plugin', { table, now: NOW })
  assert.ok(unlisted.some(issue => issue.path === 'action.action'), JSON.stringify(unlisted))
  // A harness action is plugin-only (design §3.4): this entry cannot enter through the person's
  // adoption lane at all, and the person's own script/check entries stay behind that lane.
  const asPerson = validateEntry(dreamEntry(), 'person', { table, now: NOW, actions: new Set([DREAM_ACTION]) })
  assert.ok(asPerson.some(issue => issue.path === 'action.kind'), JSON.stringify(asPerson))
})

test('the runner refuses a foreign action: one runner, one action', async () => {
  const result = await runDream(stubDeps(), 'loops.peak-end', event('nowhere'))
  assert.deepEqual(result, { outcome: 'failed', reason: 'action-missing' })
})

test('without the loop board\'s service nothing is handed over, and no report churns', () => {
  const created: Array<Parameters<ContributionHost['on']>[1]> = []
  const reports: string[] = []
  const host: ContributionHost = {
    get: () => undefined,
    on: (_event, listener) => { created.push(listener); return () => {} },
  }
  const dispose = installDreamEntry(host, { now: () => NOW }, message => { reports.push(message) })
  for (const listener of created.splice(0)) void listener()
  assert.deepEqual(reports, [], 'a missing service is the board\'s normal absence, not a problem of the row')
  dispose()
})

// --- A pass over real temporary transcripts ---------------------------------

const REQUEST_A = '以后都把提交说明写成英文'
const REQUEST_A_OTHER = '提交说明以后都用英文写吧'
const REQUEST_B = '不要在主分支上直接提交'

const transcriptText = (sentences: readonly string[]): string => [
  'Transcript of session x, exported 2026-11-09 when the conversation was compacted.',
  'Entries are the session\'s messages, tool calls and tool results up to that point, oldest first, as plain text; reasoning and images are left out.',
  'Each entry starts with a line "=== #<seq> <kind> <time>". Lines longer than 1000 characters continue on the next line.',
  'Strings that look like credentials are replaced with [redacted]. Replaced in this export: 0.',
  '',
  ...sentences.flatMap((sentence, index) => [`=== #${index + 1} user 2026-11-09T12:00:00.000Z`, sentence, '']),
].join('\n')

interface Space {
  readonly root: string
  readonly llm: string
  dispose(): void
}

/** A temporary project: a `.llm` with transcripts, no git — the shape projectDirOf accepts. */
function space(transcripts: Readonly<Record<string, readonly string[]>>): Space {
  const root = mkdtempSync(join(tmpdir(), 'memory-dream-run-'))
  const llm = join(root, '.llm')
  mkdirSync(join(llm, 'transcripts'), { recursive: true })
  for (const [name, sentences] of Object.entries(transcripts)) {
    writeFileSync(join(llm, 'transcripts', name), transcriptText(sentences), 'utf8')
  }
  return { root, llm, dispose: () => rmSync(root, { recursive: true, force: true }) }
}

const foldState = async (dir: string): Promise<MemoryState> => {
  const read = await readScope('project', dir)
  assert.ok(read.ok, JSON.stringify(read))
  return read.ok ? read.read.state : emptyMemory('project')
}

test('a pass proposes once, settles the second time, and merges new evidence the third', { skip }, async () => {
  const scope = space({ 's1.txt': [REQUEST_A], 's2.txt': [REQUEST_A_OTHER] })
  try {
    const deps = stubDeps()
    const first = await runDream(deps, DREAM_ACTION, event(scope.root))
    assert.equal(first.outcome, 'done', JSON.stringify(first))
    assert.ok(first.outcome === 'done' && /1 new memory proposal/.test(first.tell), first.outcome === 'done' ? first.tell : '')
    assert.ok(first.outcome === 'done' && first.tell.includes('memory.dream-nightly') && first.tell.includes('memory_store'))
    const state = await foldState(scope.llm)
    assert.equal(state.proposals.size, 1)
    const [proposal] = [...state.proposals.values()]
    assert.ok(proposal !== undefined)
    assert.deepEqual([...proposal.evidence].sort(), ['transcripts/s1.txt', 'transcripts/s2.txt'])

    const second = await runDream(deps, DREAM_ACTION, event(scope.root))
    assert.deepEqual(second, { outcome: 'skipped', reason: 'settled' }, 'nothing new, nothing appended')

    writeFileSync(join(scope.llm, 'transcripts', 's3.txt'), transcriptText([REQUEST_A]), 'utf8')
    const third = await runDream(deps, DREAM_ACTION, event(scope.root))
    assert.ok(third.outcome === 'done' && /refreshed 1/.test(third.tell), JSON.stringify(third))
    const merged = await foldState(scope.llm)
    assert.deepEqual([...(merged.proposals.get(proposal.name)?.evidence ?? [])].sort(),
      ['transcripts/s1.txt', 'transcripts/s2.txt', 'transcripts/s3.txt'])

    // The journal holds propose lines only — the pass writes no store line.
    const raw = readFileSync(journalFile(scope.llm), 'utf8').split('\n').filter(line => line.trim() !== '')
      .map(line => JSON.parse(line) as { op: string })
    assert.ok(raw.length >= 2 && raw.every(line => line.op === 'propose'), JSON.stringify(raw))
  }
  finally {
    scope.dispose()
  }
})

test('the page lists the open candidates and how the person decides', { skip }, async () => {
  const scope = space({ 's1.txt': [REQUEST_A], 's2.txt': [REQUEST_A_OTHER] })
  try {
    await runDream(stubDeps(), DREAM_ACTION, event(scope.root))
    const lines = dreamDetails(stubDeps(), scope.root)
    assert.ok(lines.length >= 2, JSON.stringify(lines))
    assert.match(lines[0] ?? '', /^dream-[0-9a-f]{8}（2 个会话，最近 \d{4}-\d{2}-\d{2}）：/)
    assert.ok(lines.at(-1)?.includes('memory_store') === true, 'the how-to line is there')
  }
  finally {
    scope.dispose()
  }
  const empty = space({})
  try {
    assert.deepEqual(dreamDetails(stubDeps(), empty.root), ['现在没有开着的记忆候选。'])
    assert.deepEqual(dreamDetails(stubDeps(), join(tmpdir(), 'memory-dream-nowhere-000000')), [], 'an unreadable project is no lines, not a throw')
  }
  finally {
    empty.dispose()
  }
})

test('the skips: no transcripts; a window gone empty; both polarities proposed', { skip }, async () => {
  const empty = space({})
  try {
    assert.deepEqual(await runDream(stubDeps(), DREAM_ACTION, event(empty.root)), { outcome: 'skipped', reason: 'no-transcripts' })
  }
  finally {
    empty.dispose()
  }
  const scope = space({ 's1.txt': [REQUEST_A, REQUEST_B], 's2.txt': [REQUEST_A_OTHER, '主分支上不要直接提交'] })
  try {
    const deps = stubDeps()
    const first = await runDream(deps, DREAM_ACTION, event(scope.root))
    assert.equal(first.outcome, 'done', JSON.stringify(first))
    const state = await foldState(scope.llm)
    assert.equal(state.proposals.size, 2, 'a keep and an avoid: the pass is not failure-only')
    // Two days past the real writes the window is empty: the exports are older than the window.
    const later = new Date(Date.now() + 49 * 3_600_000)
    const second = await runDream({ ...deps, now: () => later }, DREAM_ACTION, event(scope.root))
    assert.deepEqual(second, { outcome: 'skipped', reason: 'no-transcripts' })
  }
  finally {
    scope.dispose()
  }
})

// --- The person's decisions through the row's real tools --------------------

test('the confirming store and the dropping forget, through the real row', { skip }, async () => {
  await withRow(async (row: Row) => {
  // Seed the project's transcripts so the pass proposes through the row's own places.
  mkdirSync(join(row.project, 'transcripts'), { recursive: true })
  writeFileSync(join(row.project, 'transcripts', 's1.txt'), transcriptText([REQUEST_A]), 'utf8')
  writeFileSync(join(row.project, 'transcripts', 's2.txt'), transcriptText([REQUEST_A_OTHER]), 'utf8')
  const deps: DreamDeps = { ctx: row.runtime.ctx, now: row.now }
  const pass = await runDream(deps, DREAM_ACTION, event(row.project))
  assert.equal(pass.outcome, 'done', JSON.stringify(pass))
  const seeded = await foldState(row.project)
  assert.equal(seeded.proposals.size, 1)
  const [proposal] = [...seeded.proposals.values()]
  assert.ok(proposal !== undefined)

  // One more pass, one more proposal of the same pattern (a name already there merges; a dropped one comes back).
  const proposeAgain = async (note: string): Promise<void> => {
    await runDream(deps, DREAM_ACTION, event(row.project))
    assert.equal((await foldState(row.project)).proposals.size, 1, note)
  }

  // The person says no: the main agent calls memory_forget, the candidate goes, no words owed.
  const forgotten = await row.tool('memory_forget', { name: proposal.name, reason: '不要这条', scope: 'project' })
  assert.equal(forgotten.forgotten, true, JSON.stringify(forgotten))
  assert.equal((await foldState(row.project)).proposals.size, 0)

  // `/memory forget` drops a candidate the same way, as the person at the keyboard.
  await proposeAgain('the pass proposes again: the person dropped it once')
  const answer = await row.run(`forget ${proposal.name} project`)
  assert.equal(answer.kind, 'success', answer.text)
  assert.equal((await foldState(row.project)).proposals.size, 0)

  // The person says yes this time: memory_store with their words lands the entry and takes the candidate.
  await proposeAgain('the pass proposes again: the person answered')
  const stored = await row.tool('memory_store', {
    name: proposal.name,
    type: 'feedback',
    scope: 'project',
    description: proposal.description,
    body: proposal.body,
    source: [],
    relay: '以后都把提交说明写成英文',
  })
  assert.equal(stored.stored, true, JSON.stringify(stored))
  const after = await foldState(row.project)
  assert.equal(after.proposals.size, 0, 'the candidate is taken')
  assert.equal(after.entries.get(proposal.name)?.origin.actor, 'llm', 'the entry is the person\'s, confirmed with their words')

  // A pass after the entry does not propose the same name again: the person decided about it.
  const settled = await runDream(deps, DREAM_ACTION, event(row.project))
  assert.equal(settled.outcome, 'skipped', JSON.stringify(settled))
  assert.equal((await foldState(row.project)).proposals.size, 0)
  })
})
