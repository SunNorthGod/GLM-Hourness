/**
 * The path of a person's agreement in the rules board's engine (docs/ORCHESTRATION.md
 * §16.15; design §9.3): an agent proposes (`prepareProposal`, then the engine's
 * `propose`), and the person's word makes it so (`proposal-accept`). Real files in a
 * temporary git project, a clock the test moves, the real engine and the real
 * validation of rules; nothing is mocked.
 */
import assert from 'node:assert/strict'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { approvedScriptRules, type ProjectState } from '../src/rules/model.ts'
import { prepareProposal, proposalDetail, scriptFileFor, sha256Of, type Prepared } from '../src/rules/proposal.ts'
import { readProject } from '../src/rules/repo.ts'
import { parseRequest } from '../src/rules/request.ts'
import { proposalIdOf, proposalLine } from '../src/rules/service.ts'
import { loadState } from '../src/rules/store.ts'
import { draftOf } from './rules-fixtures.ts'
import { clockedTest, journalOf, MINUTE, treeOf, type ClockedProject } from './rules-helpers.ts'

const DAY_MS = 24 * 60 * MINUTE

const MAIN = { sessionId: 's-main', agentId: 'agent-main' }
const SCRIPT = 'const { payload } = JSON.parse(require("node:fs").readFileSync(0, "utf8"))\nif (payload.args.content === undefined) process.exit(0)\nprocess.stderr.write("keys differ")\nprocess.exit(2)\n'

const scriptDraft = (over: Record<string, unknown> = {}): Record<string, unknown> => draftOf({
  id: 'r-locale-keys',
  title: 'Translation files keep the same keys',
  filter: { writes: { paths: ['locales/'] } },
  action: { kind: 'script', lang: 'node', text: SCRIPT, timeoutSeconds: 10 },
  ...over,
})

let counter = 0
const idOf = (): string => `p-${(++counter).toString(16).padStart(8, '0')}`

function context(project: ClockedProject, over: Partial<Parameters<typeof prepareProposal>[1]> = {}): Parameters<typeof prepareProposal>[1] {
  return {
    state: loadState(project.paths).state,
    rulesDirFromRoot: 'docs/rules',
    now: new Date(project.clock.now()),
    via: 'graph',
    proposedBy: MAIN,
    id: idOf(),
    readScript: () => undefined,
    ...over,
  }
}

/** Prepare and propose; the proposal's id. */
async function propose(project: ClockedProject, input: Record<string, unknown>, over: Partial<Parameters<typeof prepareProposal>[1]> = {}): Promise<string> {
  const made = prepareProposal({ reason: 'the human said so', ...input }, context(project, over))
  assert.ok(made.ok, JSON.stringify(made))
  const written = await project.board.apply('llm', { op: 'propose', proposal: made.proposal })
  assert.ok(written.ok, JSON.stringify(written))
  return made.proposal.id
}

const stateOf = (project: ClockedProject): ProjectState => loadState(project.paths).state
const failed = (made: Prepared): { field: string, message: string } => {
  assert.ok(!made.ok, 'the proposal should have been refused')
  return made
}

// ----------------------------------------------------------- what the agent gives

test('the line a question ends with names the proposal, and reads back', () => {
  assert.equal(proposalLine('p-3f9a1c07'), '规则板提议 `p-3f9a1c07`')
  assert.equal(proposalIdOf(`一些话\n\n${proposalLine('p-3f9a1c07')}`), 'p-3f9a1c07')
  assert.equal(proposalIdOf('规则板提议 `p-3f9a1c07` 之后还有话'), undefined)
  assert.equal(proposalIdOf('没有这一行'), undefined)
})

clockedTest('a script rule is made ready with its file, its hash and the cautions the human is shown', (project) => {
  const made = prepareProposal({ kind: 'rule', body: scriptDraft({ reason: undefined }), reason: 'zh.json lost keys last week' }, context(project))
  assert.ok(made.ok, JSON.stringify(made))
  const { proposal } = made
  assert.equal(proposal.kind, 'rule')
  assert.equal(proposal.script?.file, 'docs/rules/scripts/r-locale-keys.mjs')
  assert.equal(proposal.script?.sha256, sha256Of(SCRIPT))
  const stored = proposal.body as { action: Record<string, unknown>, reason: string }
  assert.deepEqual(stored.action, { kind: 'script', script: { file: 'docs/rules/scripts/r-locale-keys.mjs', sha256: sha256Of(SCRIPT), lang: 'node' }, timeoutSeconds: 10 })
  assert.equal(stored.reason, 'zh.json lost keys last week', 'a rule with no reason of its own takes the proposal\'s')
  assert.match(proposal.describe, /写 locales\/ 下的文件之前，跑脚本 r-locale-keys\.mjs：它退出 2 就拦下、3 就排队；10 秒没答或出错时放行/)
  assert.deepEqual(proposal.cautions.slice(0, 3), ['脚本在 docs/rules/scripts/r-locale-keys.mjs', '超过 10 秒算没答，按放行处理（默认）', '出错时也放行'])
  assert.ok(proposal.cautions.some(caution => caution.includes('还不跑脚本')), proposal.cautions.join(' | '))
  const detail = proposalDetail(proposal)
  assert.ok(detail?.markdown.includes(SCRIPT.trimEnd()))
  assert.deepEqual(detail?.mustShow, [SCRIPT, ...proposal.cautions])
})

clockedTest('what is wrong with a proposal is named by the field to correct, and nothing is made', async (project) => {
  const make = (input: Record<string, unknown>): { field: string, message: string } => failed(prepareProposal(input, context(project)))
  assert.equal(make({ kind: 'detector', body: {}, reason: 'x' }).field, 'kind')
  assert.match(make({ kind: 'detector', body: {}, reason: 'x' }).message, /detector runner/)
  assert.equal(make({ kind: 'rule', body: draftOf(), reason: '' }).field, 'reason')
  assert.equal(make({ kind: 'rule', body: draftOf(), reason: 'x', background: '…' }).field, 'background')
  assert.match(make({ kind: 'rule', body: draftOf(), reason: 'x', summary: '…' }).message, /propose_to_human/)
  assert.equal(make({ kind: 'rule', body: draftOf({ id: 'Bad Id' }), reason: 'x' }).field, 'body.id')
  assert.equal(make({ kind: 'rule', body: scriptDraft({ action: { kind: 'script', lang: 'node', text: '' } }), reason: 'x' }).field, 'body.action.text')
  assert.equal(make({ kind: 'rule', body: scriptDraft({ action: { kind: 'script', lang: 'node', text: SCRIPT, shell: true } }), reason: 'x' }).field, 'body.action.shell')
  assert.equal(make({ kind: 'rule', body: scriptDraft({ action: { kind: 'script', lang: 'cobol', text: SCRIPT } }), reason: 'x' }).field, 'body.action.lang')
  const secret = ['ghp', '_', 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'].join('')
  assert.equal(make({ kind: 'rule', body: scriptDraft({ action: { kind: 'script', lang: 'node', text: `const key = '${secret}'\n` } }), reason: 'x' }).field, 'body.action.text')
  assert.equal(make({ kind: 'rule', body: scriptDraft({ action: { kind: 'script', lang: 'node', text: `${'process.exit(0)\n'.repeat(101)}` } }), reason: 'x' }).field, 'body.action.text')
  assert.equal(make({ kind: 'lift', body: { id: 'r-missing' }, reason: 'x' }).field, 'body.id')
  assert.equal(make({ kind: 'peak-mode', body: { level: 'reduce' }, reason: 'x' }).field, 'body.level', 'the factory level is reduce already')
  assert.equal(make({ kind: 'switch', body: { name: 'r-freeze', type: { kind: 'boolean' } }, reason: 'x' }).field, 'body.name')
  assert.equal(make({ kind: 'remove', body: [], reason: 'x' }).field, 'body')
  assert.equal(make({ kind: 'repin', body: { id: 'r-missing' }, reason: 'x' }).field, 'body.id')
  assert.equal(make({ kind: 'rule', body: draftOf(), reason: 'x', replaces: 'p-00000000' }).field, 'replaces')
  assert.deepEqual(await treeOf(project.root), {}, 'preparing a proposal writes no file')
})

// ------------------------------------------------------------------ the engine

clockedTest('a proposal is written by the agent, decides nothing, and only the person (or the host from the chat) can agree to it', async (project) => {
  const id = await propose(project, { kind: 'rule', body: draftOf() })
  const state = stateOf(project)
  assert.equal(state.proposals?.[id]?.status, 'open')
  assert.equal(state.rules, undefined, 'a proposal is not a rule')
  assert.equal(state.proposals?.[id]?.proposedBy.sessionId, 's-main')
  const made = prepareProposal({ kind: 'rule', body: draftOf({ id: 'r-other' }), reason: 'x' }, context(project))
  assert.ok(made.ok)
  const asHuman = await project.board.apply('human', { op: 'propose', proposal: made.proposal })
  assert.ok(!asHuman.ok && asHuman.error.code === 'forbidden', JSON.stringify(asHuman))
  const byAgent = await project.board.apply('llm', { op: 'proposal-accept', id, by: 'human' })
  assert.ok(!byAgent.ok && byAgent.error.code === 'forbidden')
  assert.match(byAgent.ok ? '' : byAgent.error.hint ?? '', /对主 Agent 说同意|\/rules accept/)
  for (const actor of ['llm', 'detector'] as const) {
    const refused = await project.board.apply(actor, { op: 'proposal-reject', id })
    assert.ok(!refused.ok && refused.error.code === 'forbidden', actor)
  }
  assert.equal(stateOf(project).proposals?.[id]?.status, 'open')
  const taken = await project.board.apply('llm', { op: 'propose', proposal: { ...made.proposal, id } })
  assert.ok(!taken.ok && taken.error.code === 'conflict', 'an id that is taken is refused')
})

clockedTest('agreeing writes the rule as the person\'s, with their words and the question, and marks the proposal in the same record', async (project) => {
  const id = await propose(project, { kind: 'rule', body: draftOf({ id: 'r-no-evening-push' }) })
  project.clock.advance(MINUTE)
  const accepted = await project.board.apply('human', { op: 'proposal-accept', id, by: 'llm', relay: '可以，就这样', question: 'question-7' })
  assert.ok(accepted.ok && accepted.changed, JSON.stringify(accepted))
  const state = stateOf(project)
  const rule = state.rules?.['r-no-evening-push']
  assert.equal(rule?.status, 'active')
  assert.deepEqual(rule?.origin, { actor: 'llm', at: new Date(project.clock.now()).toISOString(), relay: '可以，就这样', proposedBy: MAIN, question: 'question-7' })
  assert.equal(state.proposals?.[id]?.status, 'accepted')
  assert.equal(state.proposals?.[id]?.question, 'question-7')
  assert.deepEqual(state.proposals?.[id]?.decidedBy, { actor: 'llm', relay: '可以，就这样', at: new Date(project.clock.now()).toISOString() })
  const record = (await journalOf(project.paths)).at(-1)
  assert.equal(record?.op, 'proposal-accept')
  assert.equal(record?.actor, 'human')
  assert.deepEqual(readProject(project.paths).state, state, 'a replay of the journal is the state')
  const again = await project.board.apply('harness', { op: 'proposal-accept', id, by: 'llm', relay: '可以，就这样', question: 'question-7' })
  assert.ok(again.ok && !again.changed, 'agreeing twice writes once')
  assert.equal((await journalOf(project.paths)).length, 2)
  const file = JSON.parse(await readFile(project.paths.rulesFile, 'utf8')) as { rules: Record<string, unknown> }
  assert.ok(file.rules['r-no-evening-push'], 'the rule is in the rules file of the repository')
})

clockedTest('a script rule that is agreed to has its file written byte for byte and its hash pinned as approved on this machine', async (project) => {
  const id = await propose(project, { kind: 'rule', body: scriptDraft() })
  const before = await treeOf(project.root)
  assert.deepEqual(Object.keys(before).filter(name => name.startsWith('docs/')), [], 'no file of the repository before the agreement')
  project.clock.advance(MINUTE)
  const accepted = await project.board.apply('human', { op: 'proposal-accept', id, by: 'llm', relay: '行', question: 'question-8' })
  assert.ok(accepted.ok, JSON.stringify(accepted))
  assert.equal(await readFile(join(project.root, 'docs/rules/scripts/r-locale-keys.mjs'), 'utf8'), SCRIPT)
  const state = stateOf(project)
  assert.deepEqual(state.scripts?.['r-locale-keys'], { file: 'docs/rules/scripts/r-locale-keys.mjs', sha256: sha256Of(SCRIPT), lang: 'node', approvedAt: new Date(project.clock.now()).toISOString() })
  assert.deepEqual([...approvedScriptRules(state)], ['r-locale-keys'])
  const exported = JSON.parse(await readFile(project.paths.rulesFile, 'utf8')) as { scripts: Record<string, Record<string, unknown>> }
  assert.deepEqual(Object.keys(exported.scripts['r-locale-keys'] ?? {}).sort(), ['file', 'lang', 'sha256'], 'the approval stays on the machine where the person gave it')
})

clockedTest('while git is in the middle of an operation a script is not written and nothing is recorded: the person agrees again once it is done', async (project) => {
  const id = await propose(project, { kind: 'rule', body: scriptDraft() })
  await writeFile(join(project.root, '.git', 'MERGE_HEAD'), 'abc\n')
  const before = await treeOf(project.root)
  const accepted = await project.board.apply('human', { op: 'proposal-accept', id, by: 'llm', relay: '行' })
  assert.ok(!accepted.ok && accepted.error.code === 'io', JSON.stringify(accepted))
  assert.match(accepted.ok ? '' : accepted.error.message, /MERGE_HEAD/)
  assert.deepEqual(await treeOf(project.root), before)
  assert.equal(stateOf(project).proposals?.[id]?.status, 'open')
  await rm(join(project.root, '.git', 'MERGE_HEAD'))
  assert.ok((await project.board.apply('human', { op: 'proposal-accept', id, by: 'llm', relay: '行' })).ok)
})

clockedTest('a rule that no longer passes the validation is not written, and a rule in force under the same id is not replaced', async (project) => {
  const switched = await propose(project, { kind: 'switch', body: { name: 'code-freeze', type: { kind: 'boolean' } } })
  await project.board.apply('human', { op: 'proposal-accept', id: switched, by: 'human' })
  const reads = await propose(project, { kind: 'rule', body: draftOf({ id: 'r-freeze', condition: { signal: 'code-freeze', is: true } }) })
  await project.board.apply('human', { op: 'signal-delete', name: 'code-freeze' })
  const refused = await project.board.apply('human', { op: 'proposal-accept', id: reads, by: 'human' })
  assert.ok(!refused.ok && refused.error.code === 'invalid', JSON.stringify(refused))
  assert.match(refused.ok ? '' : refused.error.message, /condition\.signal/)
  assert.equal(stateOf(project).proposals?.[reads]?.status, 'open')
  const first = await propose(project, { kind: 'rule', body: draftOf({ id: 'r-same' }) })
  await project.board.apply('human', { op: 'proposal-accept', id: first, by: 'human' })
  const made = prepareProposal({ kind: 'rule', body: draftOf({ id: 'r-same' }), reason: 'x' }, context(project))
  assert.equal(failed(made).field, 'body.id')
})

clockedTest('lifting, a switch, the peak mode and removing are written by agreeing, each as the person\'s', async (project) => {
  const rule = await propose(project, { kind: 'rule', body: draftOf({ id: 'r-a' }) })
  const other = await propose(project, { kind: 'rule', body: draftOf({ id: 'r-b', title: 'Second' }) })
  for (const id of [rule, other]) assert.ok((await project.board.apply('human', { op: 'proposal-accept', id, by: 'human' })).ok)
  const lift = await propose(project, { kind: 'lift', body: { id: 'r-a' } })
  assert.ok((await project.board.apply('human', { op: 'proposal-accept', id: lift, by: 'llm', relay: '把 r-a 解除' })).ok)
  assert.equal(stateOf(project).rules?.['r-a']?.status, 'lifted')
  const peak = await propose(project, { kind: 'peak-mode', body: { level: 'stop' } })
  assert.ok((await project.board.apply('human', { op: 'proposal-accept', id: peak, by: 'llm', relay: '高峰别做了', question: 'question-9' })).ok)
  assert.deepEqual(stateOf(project).peakMode, { level: 'stop', at: new Date(project.clock.now()).toISOString(), origin: { actor: 'llm', relay: '高峰别做了', question: 'question-9' } })
  const switched = await propose(project, { kind: 'switch', body: { name: 'night-shift', type: { kind: 'enum', values: ['day', 'night'] }, description: 'Who is on' } })
  assert.ok((await project.board.apply('human', { op: 'proposal-accept', id: switched, by: 'human' })).ok)
  assert.deepEqual(stateOf(project).signals?.['night-shift'], { type: { kind: 'enum', values: ['day', 'night'] }, description: 'Who is on' })
  const remove = await propose(project, { kind: 'remove', body: [{ id: 'r-a' }, { id: 'r-b' }] })
  assert.equal(stateOf(project).proposals?.[remove]?.describe, '删除 2 条规则：No pushes after 21:00、Second')
  assert.ok((await project.board.apply('human', { op: 'proposal-accept', id: remove, by: 'llm', relay: '都删了' })).ok)
  assert.equal(stateOf(project).rules, undefined)
  assert.deepEqual(readProject(project.paths).state, stateOf(project))
})

clockedTest('a new proposal that replaces an open one supersedes it, and a rejected or expired one is closed for good', async (project) => {
  const first = await propose(project, { kind: 'rule', body: draftOf({ id: 'r-first' }) })
  const second = await propose(project, { kind: 'rule', body: draftOf({ id: 'r-second' }), replaces: first })
  assert.equal(stateOf(project).proposals?.[first]?.status, 'superseded')
  assert.equal(stateOf(project).proposals?.[second]?.replaces, first)
  const gone = await project.board.apply('human', { op: 'proposal-accept', id: first, by: 'human' })
  assert.ok(!gone.ok && gone.error.code === 'conflict')
  assert.ok((await project.board.apply('human', { op: 'proposal-reject', id: second, by: 'llm', relay: '不要' })).ok)
  assert.deepEqual(stateOf(project).proposals?.[second]?.decidedBy, { actor: 'llm', relay: '不要', at: new Date(project.clock.now()).toISOString() })
  const again = await project.board.apply('human', { op: 'proposal-reject', id: second })
  assert.ok(again.ok && !again.changed)
  const lapsed = await propose(project, { kind: 'rule', body: draftOf({ id: 'r-lapsed' }) })
  const byPerson = await project.board.apply('human', { op: 'proposal-expire', id: lapsed })
  assert.ok(!byPerson.ok && byPerson.error.code === 'forbidden')
  assert.ok((await project.board.apply('harness', { op: 'proposal-expire', id: lapsed })).ok)
  assert.equal(stateOf(project).proposals?.[lapsed]?.status, 'expired')
  const closed = await project.board.apply('human', { op: 'proposal-accept', id: lapsed, by: 'human' })
  assert.ok(!closed.ok && closed.error.code === 'conflict')
})

clockedTest('a proposal the person decided is kept for 30 days and then goes with the next write', async (project) => {
  const id = await propose(project, { kind: 'rule', body: draftOf({ id: 'r-old' }) })
  await project.board.apply('human', { op: 'proposal-reject', id })
  project.clock.advance(29 * DAY_MS)
  await project.board.apply('human', { op: 'signal-manual', name: 'nothing', value: true })
  assert.ok(stateOf(project).proposals?.[id], 'still there after 29 days')
  project.clock.advance(2 * DAY_MS)
  const other = await propose(project, { kind: 'rule', body: draftOf({ id: 'r-new' }) })
  assert.equal(stateOf(project).proposals?.[id], undefined)
  assert.equal(stateOf(project).proposals?.[other]?.status, 'open')
})

clockedTest('at the command line a proposal with text to read takes effect only on the second accept within 30 minutes', async (project) => {
  const id = await propose(project, { kind: 'rule', body: scriptDraft() }, { via: 'board' })
  const first = await project.board.apply('human', { op: 'proposal-accept', id, by: 'human', board: true })
  assert.ok(!first.ok && first.error.code === 'conflict', JSON.stringify(first))
  assert.match(first.ok ? '' : first.error.message, /先打一次 \/rules accept/)
  assert.ok((await project.board.apply('human', { op: 'proposal-show', id })).ok)
  assert.equal(stateOf(project).proposals?.[id]?.shownAt, new Date(project.clock.now()).toISOString())
  project.clock.advance(31 * MINUTE)
  const late = await project.board.apply('human', { op: 'proposal-accept', id, by: 'human', board: true })
  assert.ok(!late.ok && late.error.code === 'conflict', 'the showing is older than 30 minutes')
  assert.ok((await project.board.apply('human', { op: 'proposal-show', id })).ok)
  project.clock.advance(5 * MINUTE)
  assert.ok((await project.board.apply('human', { op: 'proposal-accept', id, by: 'human', board: true })).ok)
  const plain = await propose(project, { kind: 'rule', body: draftOf({ id: 'r-plain' }) }, { via: 'board' })
  assert.ok((await project.board.apply('human', { op: 'proposal-accept', id: plain, by: 'human', board: true })).ok, 'a proposal with no text to read takes effect at once')
})

clockedTest('a changed script is approved again only for the bytes the person was shown', async (project) => {
  const id = await propose(project, { kind: 'rule', body: scriptDraft() })
  assert.ok((await project.board.apply('human', { op: 'proposal-accept', id, by: 'human' })).ok)
  const scriptPath = join(project.root, 'docs/rules/scripts/r-locale-keys.mjs')
  const edited = `${SCRIPT}// edited\n`
  await writeFile(scriptPath, edited)
  const read = (file: string): string | undefined => (file === 'docs/rules/scripts/r-locale-keys.mjs' ? edited : undefined)
  assert.deepEqual([...approvedScriptRules(stateOf(project))], ['r-locale-keys'], 'the pin still names the approved bytes')
  const made = prepareProposal({ kind: 'repin', body: { id: 'r-locale-keys' }, reason: 'the script was edited' }, context(project, { readScript: read }))
  assert.ok(made.ok, JSON.stringify(made))
  assert.equal(made.proposal.script?.text, edited)
  assert.match(made.proposal.describe, /让规则 r-locale-keys 跑你现在看到的这一份脚本/)
  assert.ok((await project.board.apply('llm', { op: 'propose', proposal: made.proposal })).ok)
  await writeFile(scriptPath, `${edited}// edited again, after the person read it\n`)
  const stale = await project.board.apply('human', { op: 'proposal-accept', id: made.proposal.id, by: 'human' })
  assert.ok(!stale.ok && stale.error.code === 'invalid', JSON.stringify(stale))
  assert.match(stale.ok ? '' : stale.error.message, /脚本在你看过之后又改了/)
  await writeFile(scriptPath, edited)
  assert.ok((await project.board.apply('human', { op: 'proposal-accept', id: made.proposal.id, by: 'llm', relay: '看过了，可以' })).ok)
  const state = stateOf(project)
  assert.equal(state.scripts?.['r-locale-keys']?.sha256, sha256Of(edited))
  const action = state.rules?.['r-locale-keys']?.action
  assert.ok(action?.kind === 'script' && action.script.sha256 === sha256Of(edited))
  assert.deepEqual([...approvedScriptRules(state)], ['r-locale-keys'])
})

test('a script of a rule lives at <rules dir>/scripts/<rule id>.<suffix of its language>', () => {
  assert.equal(scriptFileFor('docs/rules', 'r-x', 'node'), 'docs/rules/scripts/r-x.mjs')
  assert.equal(scriptFileFor('docs\\rules\\', 'r-x', 'pwsh'), 'docs/rules/scripts/r-x.ps1')
  assert.equal(scriptFileFor('rules', 'r-x', 'python'), 'rules/scripts/r-x.py')
  assert.equal(scriptFileFor('rules', 'r-x', 'bash'), 'rules/scripts/r-x.sh')
})

test('the engine reads a proposal request as one with the fields it needs', () => {
  const refusal = (request: unknown): string => {
    const parsed = parseRequest(request)
    return typeof parsed === 'string' ? parsed : 'accepted'
  }
  assert.match(refusal({ op: 'propose', proposal: { id: 'nope' } }), /proposal\.id/)
  assert.match(refusal({ op: 'proposal-accept', id: 'p-00000001', by: 'llm' }), /relay/)
  assert.match(refusal({ op: 'proposal-accept', id: 'p-00000001', by: 'machine' }), /by 要是/)
  assert.match(refusal({ op: 'proposal-reject', id: 'p-00000001', by: 'machine' }), /by 要是/)
  assert.deepEqual(parseRequest({ op: 'proposal-reject', id: 'p-00000001' }), { op: 'proposal-reject', id: 'p-00000001' })
  assert.deepEqual(parseRequest({ op: 'proposal-accept', id: 'p-00000001', by: 'human', board: true }), { op: 'proposal-accept', id: 'p-00000001', by: 'human', board: true })
})
