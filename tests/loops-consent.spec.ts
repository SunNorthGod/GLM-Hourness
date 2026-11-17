/**
 * The person's agreement reaches the loop board (docs/ORCHESTRATION.md §18;
 * loop board design 0.6 §7.1 to §7.3): a proposal recorded with the real
 * `loop_propose` machinery is put to the human with the real `propose_to_human`
 * (`attach: 'loops:<proposal>'`), agreed to with the real `record_human_answer`,
 * and written by the board as the person's entry, the script pinned by the
 * bytes they saw. The graph is a real graph engine on disk and the board a
 * real store on disk; the host is the design row's fake host. Also the board
 * path (`/loops accept` twice, `reject`), the reconciliation, and the tools.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { createLoopsAccept } from '../src/loops/accept.ts'
import { ATTACH_BOARDS, attachDigest } from '../src/design/attach.ts'
import { proposeTool } from '../src/design/propose.ts'
import { recordTool } from '../src/design/record.ts'
import { loopProposalLine, LOOPS_SERVICE, loopProposalIdOf } from '../src/loops/service.ts'
import { appendJournal, openLoopStore, type LoopStore } from '../src/loops/store.ts'
import { EXECUTE_EVENTS } from '../src/execute/entries.ts'
import { loopNoteTool, loopProposeTool, LOOP_PROPOSE_EXAMPLES } from '../src/loops/tools.ts'
import { notesOf } from '../src/loops/notes.ts'
import type { LoopChecks } from '../src/loops/run.ts'
import type { AgentLike } from '../src/shared/dsh-min.ts'
import { entryFileText } from '../src/loops/model.ts'
import type { LoopEventDeclaration } from '../src/loops/trigger.ts'
import { prepareProposal, type PrepareContext } from '../src/loops/proposal.ts'
import { commandText } from '../src/loops/command-text.ts'
import { LOOP_EVENT_TABLE } from '../src/loops/events.ts'
import { ANSWER_MARKS } from '../src/shared/answer-marks.ts'
import type { ServiceLookup } from '../src/shared/dsh-min.ts'
import { projectOf } from '../src/data/project-root.ts'
import { mainAgentWithGoal, toolDeps, type MainAgentFixture } from './design-tools-helpers.ts'
import { exampleArgs, exampleRecord } from './proposal-examples.ts'
import { entryFileOf, NOW, quickIo, seedAgreed, scriptEntry, SCRIPT_TEXT, sha256, tellEntry, writeFiles } from './loops-helpers.ts'
import { runLoopsCommand } from '../src/loops/commands.ts'
import type { LoopProposal } from '../src/loops/journal.ts'

const SCRIPT = 'console.log("loop board")\n'
const MAIN_WORDS = '可以，就这样'
const DAY_MS = 24 * 3_600_000

interface Setup {
  readonly fixture: MainAgentFixture
  readonly root: string
  readonly store: LoopStore
  readonly clock: { at: number }
}

/** A main agent with a project graph and a loop store in the same project. */
async function setup(): Promise<Setup> {
  const fixture = await mainAgentWithGoal()
  const root = fixture.host.workspace('ws')
  mkdirSync(join(root, '.git'), { recursive: true })
  const clock = { at: NOW }
  const store = openLoopStore(root, { io: quickIo({ now: () => clock.at }) })
  return { fixture, root, store, clock }
}

/** The prepare context over the setup's store; a check's command and a repin's script are read for real. */
function contextOf(setupped: Setup, via: 'graph' | 'board', id: string, table: ReadonlyMap<string, LoopEventDeclaration> = LOOP_EVENT_TABLE): PrepareContext {
  const read = setupped.store.read()
  return {
    table,
    entries: new Map(read.entries.map(entry => [entry.id, { status: entry.status.kind, entry: entry.entry }])),
    pluginIds: new Set(),
    proposals: new Map([...setupped.store.proposals()].map(([key, proposal]) => [key, { status: proposal.image.status }])),
    personCount: read.entries.filter(entry => entry.status.kind !== 'deleted').length,
    now: new Date(setupped.clock.at),
    via,
    id,
    checkCommand: async () => ['node', '--version'],
    readScript: (file) => {
      try {
        return readFileSync(join(setupped.root, ...file.split('/')), 'utf8')
      }
      catch {
        return undefined
      }
    },
  }
}

/** Record a proposal the way `loop_propose` does, and answer with its id. */
async function propose(setupped: Setup, input: Record<string, unknown>, via: 'graph' | 'board' = 'graph'): Promise<{ readonly id: string, readonly digest: string | undefined }> {
  const id = `lp-${Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0')}`
  // The board draws the entry id its own: the proposal id (lp-) and the entry id (u-) are two.
  const made = await prepareProposal({ reason: 'the human asked for it', ...input }, contextOf(setupped, via, `u-${Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0')}`))
  assert.ok(made.ok, JSON.stringify(made))
  const written = await setupped.store.apply('llm', { op: 'propose', id, image: made.image })
  assert.ok(written.ok, JSON.stringify(written))
  return { id, digest: made.image.digest }
}

/** An add that only tells the main agent. */
const tellAdd = (title: string, seconds: number): Record<string, unknown> => ({
  kind: 'add',
  body: { title, when: { kind: 'every', seconds }, action: { kind: 'tell-main', text: '说一声', wake: true } },
})

/** An add of an entry that runs this spec's script. */
const scriptAdd = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind: 'add',
  body: {
    title: '每小时跑一次巡查',
    when: { kind: 'every', seconds: 3600 },
    action: { kind: 'script', report: 'on-failure', timeoutSeconds: 30, note: '服务器巡检' },
  },
  script: { lang: 'node', text: SCRIPT },
  ...over,
})

/** The service the design row reads, over the setup's store. */
function serviceOf(setupped: Setup): { readonly attachable: unknown, readonly proposalLine: (id: string) => string, readonly acceptProposal: unknown } {
  const accept = createLoopsAccept({ storeFor: () => setupped.store })
  return { attachable: accept.attachable, proposalLine: loopProposalLine, acceptProposal: accept.acceptProposal }
}

/** The design row's tool dependencies with the loops service in the table. */
function designOf(setupped: Setup): ReturnType<typeof toolDeps> {
  return toolDeps(setupped.fixture, ATTACH_BOARDS, { lookup: { get: (name: string) => name === LOOPS_SERVICE ? serviceOf(setupped) : undefined } as unknown as ServiceLookup })
}

/** The proposal is put to the human with the real propose_to_human; the main agent shows the reply as it is and the human says yes. */
async function putAndAgree(setupped: Setup, id: string, words = MAIN_WORDS): Promise<{ readonly shown: string }> {
  const { fixture, design } = { fixture: setupped.fixture, design: designOf(setupped) }
  const outcome = await fixture.host.invoke(fixture.agent, proposeTool(design), { ...exampleArgs('recommend'), attach: `loops:${id}` })
  assert.equal(outcome.kind, 'ok', JSON.stringify(outcome))
  const shown = outcome.kind === 'ok' ? String(outcome.value.text) : ''
  fixture.host.reply(fixture.agent, shown)
  await fixture.host.say(fixture.agent, words)
  return { shown }
}

const agree = (setupped: Setup, words = MAIN_WORDS): ReturnType<MainAgentFixture['host']['invoke']> => setupped.fixture.host.invoke(setupped.fixture.agent, recordTool(designOf(setupped)), { kind: 'question', question: 'question-1', answer: 'agree', words: [words], recordedAs: '同意这条循环板条目' })

/** The person's entry the board wrote, read back from the files. */
function entryOf(setupped: Setup, proposal: string): { readonly id: string, readonly source: Record<string, unknown>, readonly sha256: string, readonly scriptSha256: string | undefined } {
  const held = setupped.store.read().entries.find(candidate => candidate.entry?.source.proposal === proposal)
  assert.ok(held?.entry !== undefined, 'the entry the proposal wrote is on the board')
  return { id: held.id, source: held.entry.source as unknown as Record<string, unknown>, sha256: held.sha256 ?? '', scriptSha256: held.entry.action.kind === 'script' ? held.entry.action.script.sha256 : undefined }
}

/** Run one `/loops` line over the setup's store, as the person. */
function loopsCommand(setupped: Setup, input: string) {
  const store = setupped.store
  return runLoopsCommand(input, {
    store,
    pluginIds: () => new Set(),
    now: () => setupped.clock.at,
    view: async () => undefined,
    proposals: () => store.proposals(),
    decide: mutation => store.apply('human', mutation),
  })
}

// ------------------------------------------------------------------ the chat path

test('a script entry is proposed, put to the human with its text, agreed to in the chat, and written as theirs: the entry, the pinned script, the words', async () => {
  const setupped = await setup()
  const { id, digest } = await propose(setupped, scriptAdd())
  assert.match(digest ?? '', /^[0-9a-f]{12}$/, 'the digest of the detail is stored with the proposal')
  const project = projectOf(setupped.root)!.root
  const accept = createLoopsAccept({ storeFor: cwd => cwd === undefined || projectOf(cwd)?.root !== project ? undefined : setupped.store })
  const asked = await accept.attachable({ cwd: setupped.root, proposal: id })
  assert.ok(asked.ok && asked.detail?.mustShow.includes(SCRIPT), 'the stored detail shows the script whole')
  assert.equal(asked.detail === undefined ? '' : attachDigest(asked.detail), digest, 'the detail and its digest are the stored ones, twice the same')
  const { shown } = await putAndAgree(setupped, id)
  assert.ok(shown.includes(SCRIPT.trimEnd()), 'the script is in what the human reads')
  const question = await setupped.fixture.node('question-1')
  assert.ok(question.body?.endsWith(loopProposalLine(id)), 'the question ends with the line that ties it to the proposal')
  assert.equal(loopProposalIdOf(question.body ?? ''), id)
  const outcome = await agree(setupped)
  assert.equal(outcome.kind, 'ok', JSON.stringify(outcome))
  const handedBack = outcome.kind === 'ok' ? String(outcome.value.handedBack) : ''
  assert.match(handedBack, /^Loop board: proposal lp-[0-9a-f]{8} took effect \(entry u-[0-9a-f]{8}\)\. Commit the changed paths under docs\/loops\//)
  const written = entryOf(setupped, id)
  assert.equal(written.source.kind, 'person')
  assert.equal(written.source.via, 'chat')
  assert.equal(written.source.relay, MAIN_WORDS, 'the human\'s own words')
  assert.equal(written.source.question, 'question-1')
  assert.equal(written.source.proposal, id)
  assert.equal(readFileSync(join(setupped.root, 'docs', 'loops', 'scripts', `${written.id}.mjs`), 'utf8'), SCRIPT, 'the script bytes are the ones the human saw')
  assert.equal(written.scriptSha256, sha256(SCRIPT), 'the pin is the hash of those bytes')
  const held = setupped.store.proposals().get(id)
  assert.equal(held?.image.status, 'accepted')
  assert.deepEqual([held?.image.decided?.by, held?.image.decided?.relay, held?.image.decided?.question], ['llm', MAIN_WORDS, 'question-1'])
})

test('an agreement that is not the human\'s, or that does not carry the mark of the exact text, writes nothing', async () => {
  const setupped = await setup()
  const { id, digest } = await propose(setupped, scriptAdd())
  await putAndAgree(setupped, id)
  const accept = createLoopsAccept({ storeFor: () => setupped.store })
  const ask = (): Promise<string> => accept.acceptProposal({ questionId: 'question-1', graphDir: setupped.fixture.dir, cwd: setupped.root, by: { actor: 'llm', relay: '可以' } })
  // The main agent decides without the harness's tool: no mark of an agreement, no digest.
  const bare = await setupped.fixture.engine.apply('llm', { op: 'decide', id: 'question-1', rev: (await setupped.fixture.engine.load()).revisions.get('question-1'), conclusion: '同意', reason: '问过了', relay: '可以' })
  assert.ok(bare.ok, JSON.stringify(bare))
  assert.match(await ask(), /cannot write entries \(the decision on question-1 is not the human's/)
  assert.equal(setupped.store.read().entries.length, 0, 'nothing was written')
  // A second proposal, decided with a mark whose digest is another text's: not carried out either.
  const second = await propose(setupped, scriptAdd({ body: { title: '另一项', when: { kind: 'every', seconds: 7200 }, action: { kind: 'script', report: 'on-failure', timeoutSeconds: 30 } } }))
  const asked = await setupped.fixture.engine.apply('llm', { op: 'propose', reason: '问人', node: { type: 'question', parent: 'goal-1', ...exampleRecord('recommend'), body: `要不要这项？\n${loopProposalLine(second.id)}` } })
  assert.ok(asked.ok, JSON.stringify(asked))
  void digest
  const wrong = await setupped.fixture.engine.apply('llm', { op: 'decide', id: asked.id, rev: (await setupped.fixture.engine.load()).revisions.get(asked.id), conclusion: '同意', reason: `${ANSWER_MARKS.agree} · 已给人看原文 0123456789ab`, relay: '可以' })
  assert.ok(wrong.ok, JSON.stringify(wrong))
  assert.match(await accept.acceptProposal({ questionId: asked.id, graphDir: setupped.fixture.dir, cwd: setupped.root, by: { actor: 'llm', relay: '可以' } }), /carries no mark that the human saw the exact text/)
  assert.equal(setupped.store.proposals().get(id)?.image.status, 'open')
  assert.equal(setupped.store.proposals().get(second.id)?.image.status, 'open')
  assert.equal(setupped.store.read().entries.length, 0)
})

test('the reconciliation carries out what the graph holds and the board did not hear: accepted, dropped, and the one nobody put to the human lapses', async () => {
  const setupped = await setup()
  const { id, digest } = await propose(setupped, scriptAdd())
  // The human's word is on the graph (they decided it themselves there), the board was not listening.
  const asked = await setupped.fixture.engine.apply('llm', { op: 'propose', reason: '问人', node: { type: 'question', parent: 'goal-1', ...exampleRecord('recommend'), body: `要不要这项？\n${loopProposalLine(id)}` } })
  assert.ok(asked.ok, JSON.stringify(asked))
  const decided = await setupped.fixture.engine.apply('human', { op: 'decide', id: asked.id, rev: (await setupped.fixture.engine.load()).revisions.get(asked.id), conclusion: '同意', reason: `${ANSWER_MARKS.agree} · 已给人看原文 ${digest}` })
  assert.ok(decided.ok, JSON.stringify(decided))
  const accept = createLoopsAccept({ storeFor: () => setupped.store })
  // A second proposal the human let drop, on a question that names it.
  const second = await propose(setupped, tellAdd('另一项', 7200))
  const droppedAsk = await setupped.fixture.engine.apply('llm', { op: 'propose', reason: '问人', node: { type: 'question', parent: 'goal-1', ...exampleRecord('recommend'), body: `要不要这项？\n${loopProposalLine(second.id)}` } })
  assert.ok(droppedAsk.ok, JSON.stringify(droppedAsk))
  // A question under an approved goal is born approved; the human closes it as dropped.
  const dropped = await setupped.fixture.engine.apply('human', { op: 'status', id: droppedAsk.id, rev: (await setupped.fixture.engine.load()).revisions.get(droppedAsk.id), to: 'dropped', reason: '不要这项' })
  assert.ok(dropped.ok, JSON.stringify(dropped))
  // A third one nobody ever put to the human, eight days old.
  const stale = `lp-${Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0')}`
  await appendJournal(setupped.store.paths, { seq: setupped.store.read().journal.nextSeq, at: new Date(setupped.clock.at - 8 * DAY_MS).toISOString(), actor: 'llm', op: 'propose', id: stale, proposalAfter: { status: 'open', kind: 'add', via: 'graph', at: new Date(setupped.clock.at - 8 * DAY_MS).toISOString(), reason: '', body: { id: 'u-9e8d7c6b', title: '没人见过的', when: { kind: 'daily', time: '09:00', timeZone: 'Asia/Shanghai' }, action: { kind: 'tell-main', text: '说一声', wake: false } }, describe: '每天 09:00 提醒主 Agent', cautions: [] } })
  const done = await accept.reconcile(setupped.root, setupped.fixture.dir)
  assert.deepEqual(done.accepted, [id])
  assert.deepEqual(done.rejected, [second.id])
  assert.deepEqual(done.expired, [stale])
  const written = entryOf(setupped, id)
  assert.equal(written.source.via, 'chat', 'the reconciliation writes as the chat path does')
  assert.equal(readFileSync(join(setupped.root, 'docs', 'loops', 'scripts', `${written.id}.mjs`), 'utf8'), SCRIPT)
  assert.equal(setupped.store.proposals().get(second.id)?.image.status, 'rejected')
  assert.equal(setupped.store.proposals().get(stale)?.image.status, 'expired')
})

// ------------------------------------------------------------------ the board path

test('`/loops accept` of a proposal with text shows it whole the first time and takes effect on the second within 30 minutes', async () => {
  const setupped = await setup()
  const { id } = await propose(setupped, scriptAdd(), 'board')
  const first = await loopsCommand(setupped, `accept ${id}`)
  assert.equal(first.kind, 'success')
  assert.ok(first.kind === 'success' && first.text.includes(SCRIPT.trimEnd()), 'the command\'s own reply shows the script')
  assert.ok(first.kind === 'success' && first.text.includes(`再打一次 /loops accept ${id}`))
  let held: LoopProposal | undefined = setupped.store.proposals().get(id)
  assert.ok(held?.image.shownAt !== undefined, 'the showing is recorded')
  assert.equal(held?.image.status, 'open', 'nothing took effect yet')
  assert.equal(setupped.store.read().entries.length, 0, 'no entry was written')
  // Past the 30 minutes the text has to be shown again.
  setupped.clock.at += 31 * 60_000
  const stale = await loopsCommand(setupped, `accept ${id}`)
  assert.ok(stale.kind === 'success' && stale.text.includes(SCRIPT.trimEnd()), 'the text is shown again')
  const second = await loopsCommand(setupped, `accept ${id}`)
  assert.equal(second.kind, 'success')
  assert.ok(second.kind === 'success' && second.text.includes('已加上「每小时跑一次巡查」'))
  held = setupped.store.proposals().get(id)
  assert.equal(held?.image.status, 'accepted')
  const written = entryOf(setupped, id)
  assert.equal(written.source.via, 'board', 'the person typed the command themselves')
  assert.match(String(written.source.relay), /人用 \/loops accept 同意了提议/)
  assert.equal(readFileSync(join(setupped.root, 'docs', 'loops', 'scripts', `${written.id}.mjs`), 'utf8'), SCRIPT)
})

test('`/loops reject` turns a board proposal down, and the commands refuse what is not theirs', async () => {
  const setupped = await setup()
  const { id } = await propose(setupped, { kind: 'add', body: { title: '到点说一声', when: { kind: 'daily', time: '09:00', timeZone: 'Asia/Shanghai' }, action: { kind: 'tell-main', text: '该看一眼了', wake: true } } }, 'board')
  const graphId = (await propose(setupped, { kind: 'add', body: { title: '图上的', when: { kind: 'daily', time: '10:00', timeZone: 'Asia/Shanghai' }, action: { kind: 'tell-main', text: '说一声', wake: false } } }))
  const wrongPath = await loopsCommand(setupped, `accept ${graphId.id}`)
  assert.equal(wrongPath.kind, 'error')
  assert.ok(wrongPath.kind === 'error' && wrongPath.text.includes('项目图'), 'a chat proposal is decided in the chat')
  const done = await loopsCommand(setupped, `reject ${id}`)
  assert.equal(done.kind, 'success')
  assert.ok(done.kind === 'success' && done.text.includes('这条提议不加了'))
  assert.equal(setupped.store.proposals().get(id)?.image.status, 'rejected')
  assert.equal(setupped.store.read().entries.length, 0)
  const again = await loopsCommand(setupped, `accept ${id}`)
  assert.equal(again.kind, 'error')
  assert.ok(again.kind === 'error' && again.text.includes('已经 rejected'))
})

// ------------------------------------------------------------------ the writes the kinds make

test('an edit rewrites the entry and a delete batch removes each of them, with the proposal named in the record', async () => {
  const setupped = await setup()
  await seedAgreed({ root: setupped.root, store: setupped.store }, scriptEntry('u-0a1b2c3d'), { scriptText: SCRIPT_TEXT })
  await seedAgreed({ root: setupped.root, store: setupped.store }, scriptEntry('u-4e5f6a7b'), { scriptText: SCRIPT_TEXT })
  const edited = await propose(setupped, { kind: 'edit', entry: 'u-0a1b2c3d', body: { id: 'u-0a1b2c3d', title: '改成每两小时', when: { kind: 'every', seconds: 7200 }, action: { kind: 'script', report: 'always', timeoutSeconds: 30 } }, script: { lang: 'node', text: SCRIPT } }, 'board')
  const removed = await propose(setupped, { kind: 'delete', entries: ['u-0a1b2c3d', 'u-4e5f6a7b'] }, 'board')
  // A script edit carries text: it is shown whole first, and takes effect on the second accept.
  const shown = await loopsCommand(setupped, `accept ${edited.id}`)
  assert.ok(shown.kind === 'success' && shown.text.includes(SCRIPT.trimEnd()))
  const editDone = await loopsCommand(setupped, `accept ${edited.id}`)
  assert.equal(editDone.kind, 'success', JSON.stringify(editDone))
  const held = setupped.store.read().entries.find(entry => entry.id === 'u-0a1b2c3d')
  assert.equal(held?.entry?.title, '改成每两小时')
  assert.equal(held?.entry?.source.proposal, edited.id)
  const deleteDone = await loopsCommand(setupped, `accept ${removed.id}`)
  assert.equal(deleteDone.kind, 'success')
  assert.ok(deleteDone.kind === 'success' && deleteDone.text.includes('已删掉提议里的 2 项'))
  const records = readFileSync(setupped.store.paths.journal, 'utf8').split('\n').filter(line => line.trim() !== '').map(line => JSON.parse(line) as { op: string, id?: string, proposal?: string })
  for (const id of ['u-0a1b2c3d', 'u-4e5f6a7b']) {
    assert.equal(existsSync(entryFileOf(setupped.root, id)), false, `${id} is gone from the checkout`)
    assert.ok(records.some(record => record.op === 'delete' && record.id === id && record.proposal === removed.id), 'the record names the proposal that removed it')
  }
})

test('a repin pins the script as the file stands now, after the human saw that text', async () => {
  const setupped = await setup()
  await seedAgreed({ root: setupped.root, store: setupped.store }, scriptEntry('u-0a1b2c3d'), { scriptText: SCRIPT_TEXT })
  const changed = `${SCRIPT_TEXT}// touched by hand\n`
  await writeFiles(setupped.root, scriptEntry('u-0a1b2c3d'), entryFileText(scriptEntry('u-0a1b2c3d')), changed)
  // The entry file is the agreed one; the script's bytes are not (readBoard judges the entry file, the executor the script).
  assert.equal(setupped.store.read().entries[0]?.status.kind, 'ok')
  const made = await prepareProposal({ reason: '照现在的样子接着用', kind: 'repin', entry: 'u-0a1b2c3d' }, contextOf(setupped, 'graph', 'u-1a2b3c4d'))
  assert.ok(made.ok, JSON.stringify(made))
  assert.equal(made.image.scriptText, changed, 'the proposal carries the text as it stands')
  assert.ok(made.image.detail?.mustShow.includes(changed), 'the human is shown that text')
  const written = await setupped.store.apply('llm', { op: 'propose', id: made.id, image: made.image })
  assert.ok(written.ok, JSON.stringify(written))
  // Nothing changed any more would be refused.
  const nothing = await prepareProposal({ reason: '再钉一次', kind: 'repin', entry: 'u-4e5f6a7b' }, contextOf(setupped, 'graph', 'u-2b3c4d5e'))
  assert.equal(nothing.ok, false, 'there is no entry u-4e5f6a7b to repin')
  const done = await setupped.store.apply('harness', { op: 'proposal-accept', id: made.id, by: 'llm', relay: '好，照现在的用', question: 'q-1' })
  assert.ok(done.ok, JSON.stringify(done))
  const pinned = setupped.store.read().entries.find(entry => entry.id === 'u-0a1b2c3d')
  assert.equal(pinned?.status.kind, 'ok', 'the entry runs again, pinned to the text the human saw')
  assert.equal(pinned?.entry?.action.kind === 'script' ? pinned.entry.action.script.sha256 : '', sha256(changed))
  assert.equal(pinned?.entry?.source.via, 'chat')
})

test('a check entry pins the command the tool node holds now', async () => {
  const setupped = await setup()
  const made = await prepareProposal({
    reason: 'the human asked for a check',
    kind: 'add',
    body: { title: '合入前跑一遍检查', when: { kind: 'event', events: ['loops.host-restarted'] }, action: { kind: 'check', tool: 'pwsh', report: 'on-failure', timeoutSeconds: 60 } },
  }, contextOf(setupped, 'graph', 'u-3c4d5e6f'))
  assert.ok(made.ok, JSON.stringify(made))
  const action = made.image.body?.action
  assert.deepEqual(action !== undefined && action.kind === 'check' ? action.argv : undefined, ['node', '--version'], 'the command is the one the seam read')
  assert.ok(made.image.detail?.mustShow.includes(commandText(['node', '--version'])), 'the human sees the command line')
})

// ------------------------------------------------------------------ the store's own lines

test('a taken id, an unknown replaces, and the cap of open proposals are refused without writing', async () => {
  const setupped = await setup()
  const first = await propose(setupped, { kind: 'add', body: { title: '一项', when: { kind: 'daily', time: '09:00', timeZone: 'Asia/Shanghai' }, action: { kind: 'tell-main', text: '说一声', wake: false } } })
  const taken = await setupped.store.apply('llm', { op: 'propose', id: first.id, image: { kind: 'add', via: 'graph', at: new Date(setupped.clock.at).toISOString(), reason: '', body: { id: 'u-1a1a1a1a', title: '另一项', when: { kind: 'daily', time: '09:00', timeZone: 'Asia/Shanghai' }, action: { kind: 'tell-main', text: '说一声', wake: false } }, describe: '每天 09:00 提醒主 Agent', cautions: [] } })
  assert.equal(taken.ok, false, 'the id is taken')
  const wrongReplaces = await setupped.store.apply('llm', { op: 'propose', id: 'lp-4d5e6f70', image: { kind: 'add', via: 'graph', at: new Date(setupped.clock.at).toISOString(), reason: '', replaces: 'lp-00000000', body: { id: 'u-1b1b1b1b', title: '一项', when: { kind: 'daily', time: '09:00', timeZone: 'Asia/Shanghai' }, action: { kind: 'tell-main', text: '说一声', wake: false } }, describe: '每天 09:00 提醒主 Agent', cautions: [] } })
  assert.equal(wrongReplaces.ok, false, 'replaces must be an open proposal')
  const byHuman = await setupped.store.apply('human', { op: 'propose', id: 'lp-5e6f7081', image: { kind: 'add', via: 'board', at: new Date(setupped.clock.at).toISOString(), reason: '', body: { id: 'u-1c1c1c1c', title: '一项', when: { kind: 'daily', time: '09:00', timeZone: 'Asia/Shanghai' }, action: { kind: 'tell-main', text: '说一声', wake: false } }, describe: '每天 09:00 提醒主 Agent', cautions: [] } })
  assert.equal(byHuman.ok, false)
  assert.match(byHuman.ok ? '' : byHuman.message, /提议只由主 Agent 记/)
})

test('the graph directory decides `via`, and a proposal made for the chat is not attachable on the board path', async () => {
  const setupped = await setup()
  const accept = createLoopsAccept({ storeFor: () => setupped.store })
  const { id } = await propose(setupped, { kind: 'add', body: { title: '图上的', when: { kind: 'daily', time: '09:00', timeZone: 'Asia/Shanghai' }, action: { kind: 'tell-main', text: '说一声', wake: false } } }, 'graph')
  const answer = await accept.attachable({ cwd: setupped.root, proposal: id })
  assert.ok(answer.ok, 'a graph proposal is attachable')
  const refuse = await loopsCommand(setupped, `accept ${id}`)
  assert.equal(refuse.kind, 'error')
  const boardOne = await propose(setupped, { kind: 'add', body: { title: '板上的', when: { kind: 'daily', time: '09:00', timeZone: 'Asia/Shanghai' }, action: { kind: 'tell-main', text: '说一声', wake: false } } }, 'board')
  const boardAnswer = await accept.attachable({ cwd: setupped.root, proposal: boardOne.id })
  assert.equal(boardAnswer.ok, false, 'a board proposal is not put to the human through the chat')
  assert.ok(!boardAnswer.ok && boardAnswer.message.includes('/loops accept'), 'the message says what the person types')
})

// ------------------------------------------------------------------ the tools

test('loop_propose is the main agent\'s: a sub-agent and a root are refused, and what it records is an open proposal with its attach', async () => {
  const setupped = await setup()
  const registry = {
    events: () => LOOP_EVENT_TABLE,
    entries: () => [{ entry: { id: 'execute.release', title: '插件的', when: { kind: 'daily', time: '09:00', timeZone: 'Asia/Shanghai' }, action: { kind: 'tell-main', text: '说一声', wake: false }, source: { kind: 'plugin', plugin: 'dsh-hourness', row: 'glm-hourness/execute' }, rev: 'x' } }],
  } as unknown as import('../src/loops/registry.ts').LoopsRegistry
  const ctx: ServiceLookup = { get: (name) => name === 'sessionProjections' ? { stateOf: () => ({ active: true }) } : undefined }
  const tool = loopProposeTool({ ctx, now: () => setupped.clock.at, storeFor: () => setupped.store, registry, checks: () => undefined })
  const agentOf = (origin: string | undefined): AgentLike => ({ id: 's9', session: { id: 's9', header: { cwd: setupped.root, origin } } } as unknown as AgentLike)
  const input = { kind: 'add', reason: 'the human asked', body: { title: '到点说一声', when: { kind: 'daily', time: '09:00', timeZone: 'Asia/Shanghai' }, action: { kind: 'tell-main', text: '该看一眼了', wake: true } } }
  await assert.rejects(tool.execute(input, { agent: agentOf('subagent') }), /loop_propose is the main agent's tool/)
  const done = await tool.execute(input, { agent: agentOf(undefined) }) as { readonly ok: boolean, readonly proposal: string, readonly attach: string, readonly describe: string }
  assert.equal(done.ok, true)
  assert.match(done.proposal, /^lp-[0-9a-f]{8}$/)
  assert.equal(done.attach, `loops:${done.proposal}`)
  assert.ok(done.describe.length > 0 && [...done.describe].length <= 40, 'describe is one line of at most 40 code points')
  assert.equal(setupped.store.proposals().get(done.proposal)?.image.status, 'open')
  // A plugin's entry cannot be proposed about.
  await assert.rejects(tool.execute({ kind: 'delete', entry: 'execute.release', reason: '不要了' }, { agent: agentOf(undefined) }), /插件带来的条目暂时只能看/)
})

test('the two examples of loop_propose pass the real checks, and a check proposal reads its command from the seam', async () => {
  const setupped = await setup()
  const table = new Map(LOOP_EVENT_TABLE)
  for (const event of EXECUTE_EVENTS) if (!table.has(event.id)) table.set(event.id, event)
  const seam: { readonly asked: string | undefined } = { asked: undefined }
  const registry = {
    events: () => table,
    entries: () => [],
  } as unknown as import('../src/loops/registry.ts').LoopsRegistry
  const ctx: ServiceLookup = { get: (name) => name === 'sessionProjections' ? { stateOf: () => ({ active: true }) } : undefined }
  const checks = (): LoopChecks => ({
    commandOf: async (_cwd, tool) => {
      seam.asked = tool
      return { argv: ['node', '--version'], format: null, own: false }
    },
    fill: argv => ({ argv, used: 0, dropped: 0 }),
    present: () => undefined,
  })
  const tool = loopProposeTool({ ctx, now: () => setupped.clock.at, storeFor: () => setupped.store, registry, checks })
  // The two examples of the description, as the model reads them, through the same prepareProposal a real call takes.
  const examples = LOOP_PROPOSE_EXAMPLES.split('\n').map(line => line.trim()).filter(line => line.startsWith('{')).map(line => JSON.parse(line) as Record<string, unknown>)
  assert.equal(examples.length, 2)
  for (const example of examples) {
    const made = await prepareProposal(example, contextOf(setupped, 'graph', `u-${Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0')}`, table))
    assert.ok(made.ok, `${JSON.stringify(example)}: ${made.ok ? '' : made.message}`)
    assert.ok((made.image.describe?.length ?? 0) > 0)
  }
  // A check proposal carries the command the seam read, and the human sees the command line.
  const checkDone = await tool.execute({
    kind: 'add',
    reason: 'the human asked for a check',
    body: { title: '跑一遍检查', when: { kind: 'event', events: ['hourness.trunk-advanced'] }, filter: { files: { paths: ['docs/**/*.md'] } }, action: { kind: 'check', tool: 'pwsh', report: 'on-failure', timeoutSeconds: 60 } },
  }, { agent: { id: 's9', session: { id: 's9', header: { cwd: setupped.root } } } } as unknown as AgentLike) as { readonly ok: boolean, readonly proposal: string, readonly detail?: { readonly mustShow: readonly string[] } }
  assert.equal(checkDone.ok, true)
  assert.equal(seam.asked, 'pwsh', 'the command came from the tool node named')
  const held = setupped.store.proposals().get(checkDone.proposal)
  const argv = held?.image.body?.action.kind === 'check' ? held.image.body.action.argv : undefined
  assert.deepEqual(argv, ['node', '--version'])
  assert.ok(checkDone.detail?.mustShow.includes(commandText(['node', '--version'])))
})

test('loop_note records a conclusion on the run delivered to the main agent, and refuses without one', async () => {
  const setupped = await setup()
  await seedAgreed({ root: setupped.root, store: setupped.store }, tellEntry('u-0a1b2c3d'))
  const delivered: Record<string, string | undefined> = { 'u-0a1b2c3d': 'run-000000000001' }
  const ctx: ServiceLookup = { get: (name) => name === 'sessionProjections' ? { stateOf: () => ({ active: true }) } : undefined }
  const tool = loopNoteTool({ ctx, io: quickIo({ now: () => setupped.clock.at }), now: () => setupped.clock.at, storeFor: () => setupped.store, runOf: (root, entry) => projectOf(root)?.root === setupped.root ? delivered[entry] : undefined })
  await assert.rejects(tool.execute({ entry: 'u-4e5f6a7b', text: '没有运行' }, { agent: { id: 's9', session: { id: 's9', header: { cwd: setupped.root } } } } as unknown as AgentLike), /这一项还没有交给你的运行/)
  await assert.rejects(tool.execute({ entry: 'u-0a1b2c3d', text: '' }, { agent: { id: 's9', session: { id: 's9', header: { cwd: setupped.root } } } } as unknown as AgentLike), /1 to 500/)
  const done = await tool.execute({ entry: 'u-0a1b2c3d', text: '这次检查没有发现坏链接。' }, { agent: { id: 's9', session: { id: 's9', header: { cwd: setupped.root } } } } as unknown as AgentLike) as { readonly ok: boolean, readonly entry: string, readonly run: string }
  assert.deepEqual([done.ok, done.entry, done.run], [true, 'u-0a1b2c3d', 'run-000000000001'])
  const notes = notesOf(setupped.store.paths)
  assert.deepEqual(notes.map(note => [note.entry, note.run]), [['u-0a1b2c3d', 'run-000000000001']])
  // The 21st note of one entry trims it back to 20.
  for (let index = 2; index <= 21; index++) {
    delivered['u-0a1b2c3d'] = `run-${String(index).padStart(12, '0')}`
    await tool.execute({ entry: 'u-0a1b2c3d', text: `第 ${index} 次的结论。` }, { agent: { id: 's9', session: { id: 's9', header: { cwd: setupped.root } } } } as unknown as AgentLike)
  }
  const trimmed = notesOf(setupped.store.paths)
  assert.equal(trimmed.length, 20)
  assert.equal(trimmed[0]?.run, 'run-000000000002', 'the oldest fell off')
})
