/**
 * The person's agreement in the chat reaches the rules board (docs/ORCHESTRATION.md §16.15;
 * design §9.3): a proposal recorded with `rules_propose`'s machinery is put to the human with
 * the real `propose_to_human` (`attach: 'rules:<proposal>'`), agreed to with the real
 * `record_human_answer`, and written by the real rules service as the person's. The graph is a
 * real graph engine on disk and the board a real engine on disk; the host is the design row's
 * fake host (the runtime surface, not the contract). Also the reconciliation, `/rules accept`,
 * and the `rules_propose` tool.
 */
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { ATTACH_BOARDS } from '../src/design/attach.ts'
import { proposeTool } from '../src/design/propose.ts'
import type { Attachable } from '../src/shared/attach.ts'
import { recordTool } from '../src/design/record.ts'
import { loadGraph } from '../src/graph/store.ts'
import { createRulesService, reconcile, type AcceptDeps } from '../src/rules/accept.ts'
import { runRulesCommand } from '../src/rules/commands.ts'
import { openRulesBoard } from '../src/rules/engine.ts'
import type { ProjectState } from '../src/rules/model.ts'
import { prepareProposal, sha256Of } from '../src/rules/proposal.ts'
import { rulesProposeTool, RULES_PROPOSE_EXAMPLES } from '../src/rules/propose-tool.ts'
import { readProject } from '../src/rules/repo.ts'
import { RULES_SERVICE, proposalLine } from '../src/rules/service.ts'
import { projectOf } from '../src/data/project-root.ts'
import { toolDeps, mainAgentWithGoal, type MainAgentFixture } from './design-tools-helpers.ts'
import { draftOf } from './rules-fixtures.ts'
import { exampleArgs } from './proposal-examples.ts'

const SCRIPT = 'process.stderr.write("keys differ")\nprocess.exit(2)\n'
const MAIN = { sessionId: 's1', agentId: 's1' }
const DAY_MS = 24 * 3_600_000

interface Setup {
  readonly fixture: MainAgentFixture
  readonly root: string
  readonly deps: AcceptDeps
  /** The tool dependencies of the design row with the real rules board in the table. */
  readonly design: ReturnType<typeof toolDeps>
  readonly board: ReturnType<typeof openRulesBoard>
  readonly state: () => ProjectState
}

async function setup(withService = true, now: () => number = () => Date.now()): Promise<Setup> {
  const fixture = await mainAgentWithGoal()
  const root = fixture.host.workspace('ws')
  mkdirSync(join(root, '.git'), { recursive: true })
  const deps: AcceptDeps = { rulesDir: 'docs/rules', now }
  const service = createRulesService(deps)
  const design = toolDeps(fixture, ATTACH_BOARDS, { lookup: { get: name => (withService && name === RULES_SERVICE ? service : undefined) } })
  const board = openRulesBoard({ projectRoot: root, rulesDir: 'docs/rules' })
  return { fixture, root, deps, design, board, state: () => readProject(board.paths).state }
}

async function propose(setupped: Setup, input: Record<string, unknown>, via: 'graph' | 'board' = 'graph'): Promise<string> {
  const id = `p-${Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0')}`
  const made = prepareProposal({ reason: 'the human asked for it', ...input }, { state: setupped.state(), rulesDirFromRoot: 'docs/rules', now: new Date(), via, proposedBy: MAIN, id, readScript: () => undefined })
  assert.ok(made.ok, JSON.stringify(made))
  const written = await setupped.board.apply('llm', { op: 'propose', proposal: made.proposal })
  assert.ok(written.ok, JSON.stringify(written))
  return id
}

const scriptRule = (over: Record<string, unknown> = {}): Record<string, unknown> => draftOf({ id: 'r-locale-keys', title: 'Translation files keep the same keys', filter: { writes: { paths: ['locales/'] } }, action: { kind: 'script', lang: 'node', text: SCRIPT, timeoutSeconds: 10 }, ...over })

/** The proposal is put to the human with the real propose_to_human; the main agent shows the reply as it is and the human says yes. */
async function putAndAgree(setupped: Setup, id: string, words = '可以，就按推荐的来'): Promise<{ readonly shown: string }> {
  const { fixture, design } = setupped
  const outcome = await fixture.host.invoke(fixture.agent, proposeTool(design), { ...exampleArgs('recommend'), attach: `rules:${id}` })
  assert.equal(outcome.kind, 'ok', JSON.stringify(outcome))
  const shown = outcome.kind === 'ok' ? String(outcome.value.text) : ''
  fixture.host.reply(fixture.agent, shown)
  await fixture.host.say(fixture.agent, words)
  return { shown }
}

const agree = (setupped: Setup, words = '可以，就按推荐的来'): ReturnType<Setup['fixture']['host']['invoke']> => setupped.fixture.host.invoke(setupped.fixture.agent, recordTool(setupped.design), { kind: 'question', question: 'question-1', answer: 'agree', words: [words], recordedAs: '同意这条规则' })

// ------------------------------------------------------------------ the whole path

test('a script rule is proposed, put to the human with its text, agreed to in the chat, and written as theirs: the rule, the pinned script, the file and the words', async () => {
  const setupped = await setup()
  const id = await propose(setupped, { kind: 'rule', body: scriptRule() })
  assert.equal(setupped.state().rules, undefined, 'a proposal is not a rule')
  const { shown } = await putAndAgree(setupped, id)
  assert.ok(shown.includes(SCRIPT.trimEnd()), 'the script is in what the human reads')
  const question = await setupped.fixture.node('question-1')
  assert.ok(question.body?.endsWith(proposalLine(id)), 'the question ends with the line that ties it to the proposal')
  const outcome = await agree(setupped)
  assert.equal(outcome.kind, 'ok', JSON.stringify(outcome))
  const handedBack = outcome.kind === 'ok' ? String(outcome.value.handedBack) : ''
  assert.equal(handedBack, `Rules board: proposal ${id} took effect (rule r-locale-keys).`)
  const state = setupped.state()
  const rule = state.rules?.['r-locale-keys']
  assert.equal(rule?.status, 'active')
  assert.equal(rule?.origin.actor, 'llm')
  assert.equal(rule?.origin.relay, '可以，就按推荐的来', 'the human\'s own words')
  assert.equal(rule?.origin.question, 'question-1')
  assert.equal(readFileSync(join(setupped.root, 'docs/rules/scripts/r-locale-keys.mjs'), 'utf8'), SCRIPT)
  assert.equal(state.scripts?.['r-locale-keys']?.sha256, sha256Of(SCRIPT))
  assert.equal(state.proposals?.[id]?.status, 'accepted')
  assert.equal(state.proposals?.[id]?.question, 'question-1')
})

test('an agreement on the graph that is not the human\'s, or that does not say they were shown the script, writes nothing', async () => {
  const setupped = await setup()
  const id = await propose(setupped, { kind: 'rule', body: scriptRule() })
  await putAndAgree(setupped, id)
  const service = createRulesService(setupped.deps)
  const dir = setupped.fixture.dir
  const cwd = setupped.root
  const ask = (): Promise<string> => service.acceptProposal({ questionId: 'question-1', graphDir: dir, cwd, by: { actor: 'llm', relay: '可以' } })
  assert.match(await ask(), /cannot write rules \(the question question-1 is approved, not decided\)/)
  // The main agent decides without the harness's tool: no mark of an agreement, no digest.
  const bare = await setupped.fixture.engine.apply('llm', { op: 'decide', id: 'question-1', rev: (await setupped.fixture.engine.load()).revisions.get('question-1'), conclusion: '同意', reason: '问过了', relay: '可以' })
  assert.ok(bare.ok, JSON.stringify(bare))
  assert.match(await ask(), /not the human's: it carries no words of theirs/)
  assert.equal(setupped.state().rules, undefined)
  assert.equal(setupped.state().proposals?.[id]?.status, 'open')
})

test('a decision with the mark of an agreement but not of the exact text the human was shown is not carried out', async () => {
  const setupped = await setup()
  const id = await propose(setupped, { kind: 'rule', body: scriptRule() })
  await putAndAgree(setupped, id)
  const marked = await setupped.fixture.engine.apply('llm', { op: 'decide', id: 'question-1', rev: (await setupped.fixture.engine.load()).revisions.get('question-1'), conclusion: '同意', reason: '人在对话里同意 · 已给人看原文 0123456789ab', relay: '可以' })
  assert.ok(marked.ok, JSON.stringify(marked))
  const service = createRulesService(setupped.deps)
  const line = await service.acceptProposal({ questionId: 'question-1', graphDir: setupped.fixture.dir, cwd: setupped.root, by: { actor: 'llm', relay: '可以' } })
  assert.match(line, /carries no mark that the human saw the exact text/)
  assert.equal(setupped.state().rules, undefined)
  assert.equal((await reconcile(setupped.deps, setupped.root, setupped.fixture.dir)).accepted.length, 0, 'the reconciliation holds the same line')
})

test('the question is attachable only while the proposal is open, made for the chat, and in this project', async () => {
  const setupped = await setup()
  const service = createRulesService(setupped.deps)
  const ask = async (cwd: string | undefined, proposal: string): Promise<Attachable> => await service.attachable({ cwd, proposal })
  const refusal = async (cwd: string | undefined, proposal: string): Promise<string> => {
    const answer = await ask(cwd, proposal)
    return answer.ok ? 'attachable' : answer.message
  }
  const id = await propose(setupped, { kind: 'rule', body: scriptRule() })
  const ok = await ask(setupped.root, id)
  assert.ok(ok.ok && ok.detail?.mustShow.includes(SCRIPT))
  assert.deepEqual(await ask(setupped.root, id), ok, 'asked twice, it says the same')
  assert.match(await refusal(undefined, id), /no project/)
  assert.match(await refusal(setupped.root, 'p-00000000'), /no proposal p-00000000/)
  const board = await propose(setupped, { kind: 'rule', body: draftOf({ id: 'r-board' }) }, 'board')
  assert.match(await refusal(setupped.root, board), /\/rules accept/)
  await setupped.board.apply('human', { op: 'proposal-reject', id })
  assert.match(await refusal(setupped.root, id), /is rejected, not open/)
})

// -------------------------------------------------------------- the reconciliation

test('an agreement the board did not hear is carried out from the graph: the row was off, and later it is on', async () => {
  const setupped = await setup(false)
  const id = await propose(setupped, { kind: 'rule', body: draftOf({ id: 'r-no-evening-push' }) })
  // The design row finds no rules service: the question cannot be put with attach, so the main agent puts it as it is and the human agrees on the graph.
  const live = createRulesService(setupped.deps)
  const withService = toolDeps(setupped.fixture, ATTACH_BOARDS, { lookup: { get: name => (name === RULES_SERVICE ? live : undefined) } })
  const outcome = await setupped.fixture.host.invoke(setupped.fixture.agent, proposeTool(withService), { ...exampleArgs('recommend'), attach: `rules:${id}` })
  assert.equal(outcome.kind, 'ok')
  setupped.fixture.host.reply(setupped.fixture.agent, outcome.kind === 'ok' ? String(outcome.value.text) : '')
  await setupped.fixture.host.say(setupped.fixture.agent, '可以，就按推荐的来')
  const recorded = await setupped.fixture.host.invoke(setupped.fixture.agent, recordTool(setupped.design), { kind: 'question', question: 'question-1', answer: 'agree', words: ['可以，就按推荐的来'], recordedAs: '同意' })
  assert.equal(recorded.kind, 'ok', JSON.stringify(recorded))
  assert.equal(recorded.kind === 'ok' ? recorded.value.handedBack : 'x', undefined, 'nobody was there to be handed the agreement')
  assert.equal(setupped.state().rules, undefined)
  const done = await reconcile(setupped.deps, setupped.root, setupped.fixture.dir)
  assert.deepEqual(done, { accepted: [id], rejected: [], expired: [] })
  assert.equal(setupped.state().rules?.['r-no-evening-push']?.origin.relay, '可以，就按推荐的来')
  assert.deepEqual(await reconcile(setupped.deps, setupped.root, setupped.fixture.dir), { accepted: [], rejected: [], expired: [] }, 'a second pass finds nothing to do')
})

test('a question the human let drop rejects its proposal, and a proposal no question names for 7 days lapses', async () => {
  let at = Date.now()
  const setupped = await setup(true, () => at)
  const id = await propose(setupped, { kind: 'rule', body: draftOf({ id: 'r-a' }) })
  await putAndAgree(setupped, id)
  const lonely = await propose(setupped, { kind: 'rule', body: draftOf({ id: 'r-b', title: 'Never put' }) })
  const dropped = await setupped.fixture.engine.apply('llm', { op: 'status', id: 'question-1', rev: (await setupped.fixture.engine.load()).revisions.get('question-1'), to: 'dropped', reason: '人说这件事不用定了', relay: '算了，不用定了' })
  assert.ok(dropped.ok, JSON.stringify(dropped))
  assert.deepEqual(await reconcile(setupped.deps, setupped.root, setupped.fixture.dir), { accepted: [], rejected: [id], expired: [] })
  assert.deepEqual(setupped.state().proposals?.[id]?.decidedBy?.relay, '算了，不用定了')
  assert.equal(setupped.state().proposals?.[lonely]?.status, 'open', 'a fresh proposal nobody has put yet is left alone')
  at += 8 * DAY_MS
  assert.deepEqual(await reconcile(setupped.deps, setupped.root, setupped.fixture.dir), { accepted: [], rejected: [], expired: [lonely] })
})

// -------------------------------------------------------------------- /rules accept

test('/rules accept shows the text of a script first and takes effect on the second, and /rules reject closes a proposal', async () => {
  const setupped = await setup()
  const id = await propose(setupped, { kind: 'rule', body: scriptRule() }, 'board')
  const project = projectOf(setupped.root)
  assert.ok(project !== undefined)
  const env = { rulesDir: 'docs/rules', now: () => Date.now(), peak: () => ({ peak: false, level: 'reduce' }) as never, settle: () => Promise.resolve({ paths: setupped.board.paths, read: readProject(setupped.board.paths) }) }
  const first = await runRulesCommand(`accept ${id}`, project, env)
  assert.equal(first.kind, 'success')
  assert.match(first.kind === 'success' ? first.text : '', /这条提议还没有生效/)
  assert.ok(first.kind === 'success' && first.text.includes(SCRIPT.trimEnd()))
  assert.equal(setupped.state().rules, undefined)
  const second = await runRulesCommand(`accept ${id}`, project, env)
  assert.match(second.kind === 'success' ? second.text : String(second.kind), new RegExp(`提议 ${id} 生效了`))
  assert.equal(setupped.state().rules?.['r-locale-keys']?.origin.actor, 'human')
  const other = await propose(setupped, { kind: 'rule', body: draftOf({ id: 'r-other' }) }, 'board')
  const rejected = await runRulesCommand(`reject ${other}`, project, env)
  assert.equal(rejected.kind === 'success' ? rejected.text : '', `提议 ${other} 已否掉。`)
  assert.equal(setupped.state().proposals?.[other]?.status, 'rejected')
  assert.equal((await runRulesCommand('accept nonsense', project, env)).kind, 'error')
  assert.equal((await runRulesCommand('accept p-00000000', project, env)).kind, 'error')
})

// ------------------------------------------------------------------ the tool

function stubGraphService(dir: string | undefined): { get: (name: string) => unknown } {
  return { get: name => (name === 'glmHournessGraph' ? { dirFor: () => dir, isGraphTool: () => false } : undefined) }
}

test('rules_propose records a proposal for the project of the session, says how to put it to the human, and names the field of a refusal', async () => {
  const setupped = await setup()
  const tool = rulesProposeTool({ ctx: stubGraphService(setupped.fixture.dir), rulesDir: 'docs/rules', now: () => Date.now() })
  const ok = await setupped.fixture.host.invoke(setupped.fixture.agent, tool, { kind: 'rule', body: scriptRule(), reason: 'zh.json lost keys last week' })
  assert.equal(ok.kind, 'ok', JSON.stringify(ok))
  const value = ok.kind === 'ok' ? ok.value : {}
  assert.match(String(value.proposal), /^p-[0-9a-f]{8}$/)
  assert.equal(value.attach, `rules:${String(value.proposal)}`)
  assert.match(String(value.message), /^Put it to the human with propose_to_human \(kind question, form recommend, attach rules:p-[0-9a-f]{8}\): one yes-or-no question with your recommendation and reason inside it;/)
  assert.ok((value.cautions as string[]).some(caution => caution.includes('docs/rules/scripts/r-locale-keys.mjs')))
  assert.equal(setupped.state().proposals?.[String(value.proposal)]?.via, 'graph')
  const refused = await setupped.fixture.host.invoke(setupped.fixture.agent, tool, { kind: 'rule', body: draftOf({ id: 'Bad' }), reason: 'x' })
  assert.deepEqual(refused.kind === 'error' ? [refused.error.code, refused.error.field] : [], ['invalid', 'body.id'])
  const noGraph = rulesProposeTool({ ctx: stubGraphService(undefined), rulesDir: 'docs/rules', now: () => Date.now() })
  const board = await setupped.fixture.host.invoke(setupped.fixture.agent, noGraph, { kind: 'rule', body: draftOf({ id: 'r-no-graph' }), reason: 'x' })
  assert.match(board.kind === 'ok' ? String(board.value.message) : '', /The project graph is not available: tell the human this proposal as one yes-or-no question and that they can type \/rules accept p-[0-9a-f]{8} or \/rules reject p-[0-9a-f]{8}\./)
})

test('the two examples of rules_propose are real: they pass the checks of a proposal, the description fits, and the example script blocks', async () => {
  const setupped = await setup()
  const lines = RULES_PROPOSE_EXAMPLES.split('\n').filter(line => line.startsWith('{'))
  assert.equal(lines.length, 2)
  const tool = rulesProposeTool({ ctx: stubGraphService(setupped.fixture.dir), rulesDir: 'docs/rules', now: () => Date.now() })
  assert.ok(tool.description.length <= 4000, `the description is ${tool.description.length} characters`)
  assert.equal(tool.name, 'rules_propose')
  // The first example reads the switch release-freeze the human defined: define it first, as the example says.
  const switched = await propose(setupped, { kind: 'switch', body: { name: 'release-freeze', type: { kind: 'boolean' } } })
  assert.ok((await setupped.board.apply('human', { op: 'proposal-accept', id: switched, by: 'human' })).ok)
  for (const line of lines) {
    const outcome = await setupped.fixture.host.invoke(setupped.fixture.agent, tool, JSON.parse(line) as unknown)
    assert.equal(outcome.kind, 'ok', `${line.slice(0, 60)}: ${JSON.stringify(outcome)}`)
    const id = outcome.kind === 'ok' ? String(outcome.value.proposal) : ''
    const accepted = await setupped.board.apply('human', { op: 'proposal-accept', id, by: 'llm', relay: '可以', question: 'question-1' })
    assert.ok(accepted.ok, JSON.stringify(accepted))
  }
  const file = readFileSync(join(setupped.root, 'docs/rules/scripts/r-locale-keys.mjs'), 'utf8')
  assert.ok(file.startsWith("import { readFileSync, existsSync } from 'node:fs'"), 'the file is the text of the example, byte for byte')
  assert.ok(setupped.state().rules?.['r-no-push-freeze'])
  const graph = await loadGraph(setupped.fixture.dir)
  assert.ok(graph.nodes.has('goal-1'))
})
