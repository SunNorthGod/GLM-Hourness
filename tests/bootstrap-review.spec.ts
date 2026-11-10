/**
 * bootstrap_review and the write that follows the human's agreement
 * (takeover design 0.6 §7.1–§7.7, §9.2, §5.6): the takeover set and its
 * duplicates, the §7.7 status lines, the checks in order, the question the
 * round returns through M3's validators, the tool's refusals, the
 * decision's verification and the six steps on a real graph engine (each
 * judged against the graph, so a repeat writes nothing twice), the
 * graph-in-git lookup, the baseline comment and its readers, and the
 * description example through the same checks as a real call.
 *
 * Real git repositories and real graphs everywhere; the only fakes are the
 * tool's dependencies, which the runtime wires (the L3 probe runs those
 * through the row itself).
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { ATTACH_BOARDS } from '../src/design/attach.ts'
import { openEngine } from '../src/graph/engine.ts'
import { loadGraph } from '../src/graph/store.ts'
import { askOf, askTextRefusal, proposalRecordRefusal, proposalTitleRefusal, textCoversRecord, TALK_LIMITS } from '../src/graph/proposal.ts'
import { plainWordsIn } from '../src/graph/plain-question.ts'
import { appendTakeover, openTakeover, openTakeoverOf, type OpenTakeover } from '../src/bootstrap/takeover.ts'
import { takeoverAttachLine } from '../src/bootstrap/service.ts'
import { commandsDetail, listAsk, listFull } from '../src/bootstrap/present.ts'
import {
  appliedMessage, applyAgreement, askDigestOf, baselineComment, baselineOf, bootstrapReviewTool, checkRound,
  duplicatesOf, formatOf, listAttachOf, listConclusion, questionStatus, SHOWN_MARK, takeoverQuestions, takeoverSet,
  trackedGraphFiles, type ReviewDeps, type RoundRecord, type RulesLookup, type TrialFacts,
} from '../src/bootstrap/review.ts'
import { BOOTSTRAP_REVIEW_EXAMPLE } from '../src/bootstrap/example.ts'
import type { ToolExecutionContext } from '../src/shared/dsh-min.ts'

let made: string | undefined
after(() => { if (made !== undefined) rmSync(made, { recursive: true, force: true }) })

const ESLINT = 'node node_modules/eslint/bin/eslint.js --format json'
const ESLINT_FILES = `${ESLINT} {files}`

/** A git repository with a committed src file; the graph directory exists. */
function workspace(name: string): string {
  made ??= mkdtempSync(join(tmpdir(), 'bs-review-'))
  const ws = join(made, name)
  mkdirSync(join(ws, 'docs', 'graph'), { recursive: true })
  mkdirSync(join(ws, 'src'), { recursive: true })
  writeFileSync(join(ws, 'src', 'a.js'), 'export const a = 1\n')
  const run = (args: string[]): void => { execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: ws }) }
  run(['init', '-q'])
  run(['add', 'src'])
  run(['commit', '-q', '-m', 'first'])
  return ws
}

const head = (ws: string): string => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ws, encoding: 'utf8' }).trim()

const gitCode = (ws: string, args: string[]): number => spawnSync('git', args, { cwd: ws }).status ?? 1

/** The id of the seeded env's one tool node. */
const toolIdOf = async (ws: string): Promise<string> => {
  const g = await loadGraph(join(ws, 'docs', 'graph'))
  return [...g.nodes.values()].find(node => node.type === 'tool')?.id ?? ''
}

/** An `existing` takeover over the workspace, opened before any graph seed. */
async function takeoverOf(ws: string, wish?: string): Promise<OpenTakeover> {
  const outcome = await openTakeover(ws, { path: 'existing', because: '已有的图，接着用', trigger: 'init', projectRoot: ws, graphDir: join(ws, 'docs', 'graph'), ...(wish === undefined ? {} : { wish }) })
  assert.equal(outcome.kind, 'opened')
  return outcome.takeover
}

type Actor = 'human' | 'harness' | 'llm'

/** Propose one node, asserting the write; returns the id when fixed, else the assigned one. */
const propose = async (ws: string, actor: Actor, node: Record<string, unknown>, reason = '接管'): Promise<string> => {
  const result = await openEngine(join(ws, 'docs', 'graph')).apply(actor, { op: 'propose', reason, node })
  assert.ok(result.ok, JSON.stringify(result.ok ? result : result.error))
  const graph = await loadGraph(join(ws, 'docs', 'graph'))
  const title = typeof node.title === 'string' ? node.title : ''
  const found = typeof node.id === 'string' ? node.id : [...graph.nodes.values()].find(entry => entry.title === title && entry.type === node.type)?.id ?? ''
  assert.ok(found !== '', `the proposal of ${title} is on the graph`)
  return found
}

const byTitle = async (ws: string, title: string): Promise<string> => {
  const graph = await loadGraph(join(ws, 'docs', 'graph'))
  const id = [...graph.nodes.values()].find(node => node.title === title)?.id ?? ''
  assert.ok(id !== '', `${title} is on the graph`)
  return id
}

/** Approve and decide one question the way record_human_answer would: a question is born approved (it goes straight to the human), so approve only a proposed node; the decide carries the human's words as relay. */
async function decided(ws: string, id: string, conclusion: string, digest?: string): Promise<void> {
  const dir = join(ws, 'docs', 'graph')
  const engine = openEngine(dir)
  const graph = await loadGraph(dir)
  if (graph.nodes.get(id)?.status === 'proposed') {
    assert.ok((await engine.apply('human', { op: 'approve', id, rev: graph.revisions.get(id), reason: '拿给人' })).ok)
  }
  const fresh = await loadGraph(dir)
  const reason = digest === undefined ? '人的原话' : `${SHOWN_MARK} ${digest}（原话：「行，就这样」）`
  assert.ok((await engine.apply('llm', { op: 'decide', id, rev: fresh.revisions.get(id), conclusion, reason, relay: '行，就这样' })).ok)
}

const lookup = (value: boolean | undefined): RulesLookup => () => Promise.resolve(value)

const trialOf = (results: TrialFacts['results']): TrialFacts => ({ done: true, results })

/** The full seed the review checks read: the norms, the gate, env with its checker, the floor, and the two decided things. */
async function seeded(ws: string, takeover: OpenTakeover, options: { readonly estimate?: string } = {}): Promise<void> {
  await propose(ws, 'harness', { type: 'goal', title: '这个项目要做成什么', acceptance: ['验收'] })
  await propose(ws, 'harness', { type: 'norm', id: 'norm-decision-tiers', title: '什么要问人', parent: 'goal-1', body: '不许碰：src/generated/\n花钱或独占：由项目的规范管' })
  await propose(ws, 'harness', { type: 'norm', id: 'norm-verify-tiers', title: '什么算验过', parent: 'goal-1', body: '花钱或独占：无\n不许碰：由项目的规范管' })
  await propose(ws, 'harness', { type: 'norm', id: 'norm-audit-trail', title: '怎么记账', parent: 'goal-1', body: '记进图' })
  await propose(ws, 'harness', { type: 'norm', id: 'norm-review-floor', title: '过评底线', parent: 'goal-1', body: '底线' })
  await propose(ws, 'harness', { type: 'norm', id: 'norm-merge-gate', title: '合入前的检查', parent: 'goal-1', acceptance: ['`$ npm test`', '每次合入前跑'] })
  await propose(ws, 'harness', { type: 'feature', id: 'env', title: '环境', parent: 'goal-1' })
  await propose(ws, 'harness', { type: 'tool', title: 'ESLint', parent: 'env', acceptance: [`\`${options.estimate ?? `check eslint eslint-json $ ${ESLINT_FILES}`}\` when *.js`] })
  await decided(ws, await propose(ws, 'harness', { type: 'question', title: '花钱或独占', parent: 'goal-1', body: `问题\n\n${takeoverAttachLine(`bootstrap:${takeover.id}:cost`)}`, ask: '这个项目花钱或独占机器吗？', form: 'recommend', proposal: '按你说的记', reason: '照你的回答写规范' }), '花钱或独占：无')
  await decided(ws, await propose(ws, 'harness', { type: 'question', title: '不许碰', parent: 'goal-1', body: `问题\n\n${takeoverAttachLine(`bootstrap:${takeover.id}:touch`)}`, ask: '哪里不许碰？', form: 'recommend', proposal: '按你说的记', reason: '照你的回答写规范' }), '不许碰：src/generated/')
}

const noRules = { rulesWhole: () => false, trial: () => undefined as TrialFacts | undefined, ancestor: () => Promise.resolve(true) }

test('the round ids: listConclusion is the exact recordedAs, listAttachOf takes 1–9999 without leading zeros, askDigest is 12 hex and stable', () => {
  assert.equal(listConclusion(1), '照第 1 版清单接管')
  assert.deepEqual(listAttachOf('tk-3k9x0a1b:list-1'), { id: 'tk-3k9x0a1b', round: 1 })
  assert.deepEqual(listAttachOf('tk-3k9x0a1b:list-9999'), { id: 'tk-3k9x0a1b', round: 9999 })
  assert.equal(listAttachOf('tk-3k9x0a1b:cost'), undefined)
  assert.equal(listAttachOf('tk-3k9x0a1b:list-0'), undefined)
  assert.equal(listAttachOf('tk-3k9x0a1b:list-00001'), undefined)
  assert.equal(listAttachOf('tk-3k9x0a1b:list-12345'), undefined)
  assert.equal(listAttachOf(undefined), undefined)
  const ask = { title: 't', text: '接这份清单，可以吗？', proposal: '接', reason: '全读自项目文件' }
  assert.match(askDigestOf(ask), /^[0-9a-f]{12}$/)
  assert.equal(askDigestOf(ask), askDigestOf({ ...ask }))
  assert.notEqual(askDigestOf(ask), askDigestOf({ ...ask, proposal: '接下' }))
  // The board row knows the list round: B7 widened the format, 1–9999, no leading zeros.
  const board = ATTACH_BOARDS.find(entry => entry.prefix === 'bootstrap:')
  assert.ok(board !== undefined && board.format.test('bootstrap:tk-3k9x0a1b:list-1') && !board.format.test('bootstrap:tk-3k9x0a1b:list-0'))
})

test('the takeover set reads parents before children and by creation; the later of a duplicate pair is the one to reject (§7.1)', async () => {
  const ws = workspace('set')
  const takeover = await takeoverOf(ws)
  // the set reads this takeover's own proposals (harness actor, status proposed): the human's own are born approved
  await propose(ws, 'harness', { type: 'goal', title: '目标一', acceptance: ['验收'] })
  await propose(ws, 'harness', { type: 'feature', title: '同一件事', parent: 'goal-1' })
  await propose(ws, 'harness', { type: 'feature', title: '同一件事', parent: 'goal-1' })
  await propose(ws, 'harness', { type: 'feature', title: '另一件', parent: 'goal-1' })
  await propose(ws, 'harness', { type: 'task', title: '一件活', parent: 'goal-1' })
  const graph = await loadGraph(join(ws, 'docs', 'graph'))
  const set = takeoverSet(graph, takeover)
  // parents before children, then creation order (each type counts from 1)
  assert.deepEqual(set.map(node => node.id), ['goal-1', 'feature-1', 'feature-2', 'feature-3', 'task-1'])
  const duplicates = duplicatesOf(set)
  assert.equal(duplicates.length, 1)
  assert.equal(duplicates[0]?.keep.id, 'feature-1')
  assert.equal(duplicates[0]?.later.id, 'feature-2')
  assert.deepEqual(takeoverQuestions(graph, takeover), [])
})

test('the §7.7 status lines: each kind answers in the human\'s words, the rule asks the board live, dropped says so', async () => {
  const ws = workspace('status')
  const takeover = await takeoverOf(ws)
  await propose(ws, 'harness', { type: 'goal', title: '目标', acceptance: ['验收'] })
  await propose(ws, 'harness', { type: 'question', title: '花钱或独占', parent: 'goal-1', body: `问题\n\n${takeoverAttachLine(`bootstrap:${takeover.id}:cost`)}`, ask: '这个项目花钱或独占机器吗？', form: 'recommend', proposal: '按你说的记', reason: '照你的回答写规范' })
  await propose(ws, 'harness', { type: 'question', title: '不许碰', parent: 'goal-1', body: `问题\n\n${takeoverAttachLine(`bootstrap:${takeover.id}:touch`)}`, ask: '哪里不许碰？', form: 'recommend', proposal: '按你说的记', reason: '照你的回答写规范' })
  const listId = await propose(ws, 'harness', { type: 'question', title: '第 1 版清单', parent: 'goal-1', body: `问题\n\n${takeoverAttachLine(`bootstrap:${takeover.id}:list-1`)}`, ask: '照这份清单接管，可以吗？', form: 'recommend', proposal: '照单接管', reason: '都读自项目文件' })
  await propose(ws, 'harness', { type: 'question', title: '拦 src/generated 的规则', parent: 'goal-1', body: '问题\n\n规则板提议 `p-1a2b3c4d`', ask: '立这条规则吗？', form: 'recommend', proposal: '立规则', reason: '生成的代码不该手改' })
  await decided(ws, await byTitle(ws, '花钱或独占'), '花钱或独占：无')
  await decided(ws, listId, listConclusion(1))
  const engine = openEngine(join(ws, 'docs', 'graph'))
  const droppedId = await byTitle(ws, '拦 src/generated 的规则')
  const before = await loadGraph(join(ws, 'docs', 'graph'))
  // a question is born approved, so the drop goes through status, the way M3's reject answer notes it
  assert.ok((await engine.apply('human', { op: 'status', id: droppedId, rev: before.revisions.get(droppedId), to: 'dropped', reason: '人说不要' })).ok)
  const graph = await loadGraph(join(ws, 'docs', 'graph'))
  const lines = await questionStatus(graph, takeover, lookup(true), ws)
  assert.deepEqual(lines, [
    '花钱或独占：你说了，主 Agent 还没记进规范',
    '不许碰：在等你回话',
    '清单：你同意了',
    '规则「拦 src/generated 的规则」：你说不要了',
  ])
  // a decided rule question reads through the board: open → 还没写上, gone → 已生效, board missing → 不拦
  const ruleId = await propose(ws, 'harness', { type: 'question', title: '拦 vendor 的规则', parent: 'goal-1', body: '问题\n\n规则板提议 `p-9f8e7d6c`', ask: '立这条规则吗？', form: 'recommend', proposal: '立规则', reason: '照你的回答' })
  await decided(ws, ruleId, '立')
  const g2 = await loadGraph(join(ws, 'docs', 'graph'))
  assert.equal((await questionStatus(g2, takeover, lookup(true), ws)).at(-1), '规则「拦 vendor 的规则」：你同意了，规则板还没写上；一分钟内会按图补上，还不行就看规则页的恢复一节')
  assert.equal((await questionStatus(g2, takeover, lookup(false), ws)).at(-1), '规则「拦 vendor 的规则」：已生效')
  assert.equal((await questionStatus(g2, takeover, undefined, ws)).at(-1), '规则「拦 vendor 的规则」：规则板没装，系统不会拦')
})

test('the checks refuse in order until the graph is whole (§7.2)', async () => {
  const ws = workspace('order')
  const takeover = await takeoverOf(ws)
  const graph0 = await loadGraph(join(ws, 'docs', 'graph'))
  const missing = await checkRound(noRules, takeover, graph0, '读过')
  assert.equal(missing.ok, false)
  if (!missing.ok) {
    assert.match(missing.message, /the anchor goal/)
    assert.match(missing.message, /norm-decision-tiers/)
    assert.match(missing.message, /norm-merge-gate with at least one/)
    assert.match(missing.message, /env/)
    assert.match(missing.message, /norm-review-floor/)
  }
  // a goal without acceptance
  await propose(ws, 'harness', { type: 'goal', title: '没验收的目标' })
  await propose(ws, 'harness', { type: 'norm', id: 'norm-decision-tiers', title: '什么要问人', parent: 'goal-1', body: '不许碰：无' })
  await propose(ws, 'harness', { type: 'norm', id: 'norm-verify-tiers', title: '什么算验过', parent: 'goal-1', body: '花钱或独占：无' })
  await propose(ws, 'harness', { type: 'norm', id: 'norm-audit-trail', title: '怎么记账', parent: 'goal-1', body: '记进图' })
  await propose(ws, 'harness', { type: 'norm', id: 'norm-review-floor', title: '过评底线', parent: 'goal-1', body: '底线' })
  await propose(ws, 'harness', { type: 'norm', id: 'norm-merge-gate', title: '合入前的检查', parent: 'goal-1', acceptance: ['`$ npm test`'] })
  await propose(ws, 'harness', { type: 'feature', id: 'env', title: '环境', parent: 'goal-1' })
  const graph1 = await loadGraph(join(ws, 'docs', 'graph'))
  const acceptance = await checkRound(noRules, takeover, graph1, '读过')
  assert.equal(acceptance.ok, false)
  if (!acceptance.ok) assert.match(acceptance.message, /these goals have no acceptance yet: goal-1/)
  // the two things undetermined
  const costId = await propose(ws, 'harness', { type: 'question', title: '花钱或独占', parent: 'goal-1', body: `问题\n\n${takeoverAttachLine(`bootstrap:${takeover.id}:cost`)}`, ask: '花钱吗？', form: 'recommend', proposal: '记', reason: '照你的回答' })
  await propose(ws, 'harness', { type: 'question', title: '不许碰', parent: 'goal-1', body: `问题\n\n${takeoverAttachLine(`bootstrap:${takeover.id}:touch`)}`, ask: '哪里不许碰？', form: 'recommend', proposal: '记', reason: '照你的回答' })
  // the goal gets its acceptance, so the next refusal is the things' one
  const engine0 = openEngine(join(ws, 'docs', 'graph'))
  const goalId = await byTitle(ws, '没验收的目标')
  const g0 = await loadGraph(join(ws, 'docs', 'graph'))
  assert.ok((await engine0.apply('harness', { op: 'edit', id: goalId, rev: g0.revisions.get(goalId), set: { acceptance: ['验收'] }, reason: '补验收' })).ok)
  const graph2 = await loadGraph(join(ws, 'docs', 'graph'))
  const undecided = await checkRound(noRules, takeover, graph2, '读过')
  assert.equal(undecided.ok, false)
  if (!undecided.ok) assert.match(undecided.message, /put the two things to the human first.*the cost question is not decided/)
  await decided(ws, costId, '花钱或独占：无')
  const touchId = await byTitle(ws, '不许碰')
  await decided(ws, touchId, '不许碰：无')
  const graph3 = await loadGraph(join(ws, 'docs', 'graph'))
  const whole = await checkRound(noRules, takeover, graph3, '读过')
  assert.equal(whole.ok, true, whole.ok ? '' : whole.message)
  assert.equal(whole.ok ? whole.view.anchor : '', 'goal-1')
})

test('the later checks: the evidence shas, the rules board over 不许碰 paths, the estimates against the trial, and the one-reply cap (§7.2 items 6–10)', async () => {
  const ws = workspace('later')
  const takeover = await takeoverOf(ws)
  await seeded(ws, takeover)
  // a task whose evidence is not hex, then one that is not an ancestor
  const taskId = await propose(ws, 'harness', { type: 'task', title: '一件活', parent: 'goal-1', body: '做了\n完成证据：zzz' })
  let graph = await loadGraph(join(ws, 'docs', 'graph'))
  const badSha = await checkRound(noRules, takeover, graph, '读过')
  assert.equal(badSha.ok, false)
  if (!badSha.ok) assert.match(badSha.message, /is not 7-40 hex digits/)
  const engine = openEngine(join(ws, 'docs', 'graph'))
  assert.ok((await engine.apply('harness', { op: 'edit', id: taskId, rev: graph.revisions.get(taskId), set: { body: '做了\n完成证据：deadbeef' }, reason: '写证据' })).ok)
  graph = await loadGraph(join(ws, 'docs', 'graph'))
  const notAncestor = await checkRound({ ...noRules, ancestor: () => Promise.resolve(false) }, takeover, graph, '读过')
  assert.equal(notAncestor.ok, false)
  if (!notAncestor.ok) assert.match(notAncestor.message, /is not an ancestor of HEAD/)
  const okEvidence = await checkRound(noRules, takeover, graph, '读过')
  assert.equal(okEvidence.ok, true, okEvidence.ok ? '' : okEvidence.message)
  // the rules board whole + a repository path in 不许碰 without a rule question
  const wholeRules = await checkRound({ ...noRules, rulesWhole: () => true }, takeover, graph, '读过')
  assert.equal(wholeRules.ok, false)
  if (!wholeRules.ok) assert.match(wholeRules.message, /propose the rule for src\/generated\//)
  const ruleId = await propose(ws, 'harness', { type: 'question', title: '拦 src/generated 的规则', parent: 'goal-1', body: '问题\n\n规则板提议 `p-1a2b3c4d`', ask: '立这条规则吗？', form: 'recommend', proposal: '立', reason: '照你的回答' })
  await decided(ws, ruleId, '立')
  const wholeRulesOk = await checkRound({ ...noRules, rulesWhole: () => true }, takeover, await loadGraph(join(ws, 'docs', 'graph')), '读过')
  assert.equal(wholeRulesOk.ok, true, wholeRulesOk.ok ? '' : wholeRulesOk.message)
  // estimates: an estimate the trial cannot back is removed; a measured time backs the exact line
  const ws2 = workspace('estimates')
  const takeover2 = await takeoverOf(ws2)
  await seeded(ws2, takeover2, { estimate: `check eslint eslint-json 8s $ ${ESLINT_FILES}` })
  const g2 = await loadGraph(join(ws2, 'docs', 'graph'))
  const noTrial = await checkRound(noRules, takeover2, g2, '读过')
  assert.equal(noTrial.ok, false)
  if (!noTrial.ok) assert.match(noTrial.message, /remove the estimate from this line/)
  const measured = trialOf([{ text: ESLINT_FILES, kind: 'check', outcome: 'passed', ms: 3200 }])
  const backed = await checkRound({ ...noRules, trial: () => measured }, takeover2, g2, '读过')
  assert.equal(backed.ok, false)
  if (!backed.ok) {
    assert.match(backed.message, /rewrite this check line exactly as given/)
    assert.match(backed.message, /4s/)
  }
  // the main agent edits its own proposal to the measured time, and the check passes
  const engine2 = openEngine(join(ws2, 'docs', 'graph'))
  const toolId = await toolIdOf(ws2)
  const gEdit = await loadGraph(join(ws2, 'docs', 'graph'))
  assert.ok((await engine2.apply('harness', { op: 'edit', id: toolId, rev: gEdit.revisions.get(toolId), set: { acceptance: [`\`check eslint eslint-json 4s $ ${ESLINT_FILES}\` when *.js`] }, reason: '按试跑改预计' })).ok)
  const g3 = await loadGraph(join(ws2, 'docs', 'graph'))
  const exact = await checkRound({ ...noRules, trial: () => measured }, takeover2, g3, '读过')
  assert.equal(exact.ok, true, exact.ok ? '' : exact.message)
  // the one-reply cap: a gate command longer than the cap
  const ws3 = workspace('cap')
  const takeover3 = await takeoverOf(ws3)
  await seeded(ws3, takeover3)
  const gateId = await byTitle(ws3, '合入前的检查')
  const engine3 = openEngine(join(ws3, 'docs', 'graph'))
  const g4 = await loadGraph(join(ws3, 'docs', 'graph'))
  assert.ok((await engine3.apply('harness', { op: 'edit', id: gateId, rev: g4.revisions.get(gateId), set: { acceptance: [`\`$ node long.js ${'x'.repeat(5200)}\``, '`$ npm test`'] }, reason: '太长' })).ok)
  const g5 = await loadGraph(join(ws3, 'docs', 'graph'))
  const capped = await checkRound(noRules, takeover3, g5, '读过')
  assert.equal(capped.ok, false)
  if (!capped.ok) assert.match(capped.message, /do not fit in one reply/)
})

test('the round view: the commands in detail, the question through M3\'s validators, and the full list file (§7.3)', async () => {
  const ws = workspace('view')
  const takeover = await takeoverOf(ws)
  await seeded(ws, takeover)
  await propose(ws, 'harness', { type: 'feature', title: '同一件事', parent: 'goal-1' })
  await propose(ws, 'harness', { type: 'feature', title: '同一件事', parent: 'goal-1' })
  await propose(ws, 'harness', { type: 'task', title: '已完成的活', parent: 'goal-1', body: `做了\n完成证据：${head(ws).slice(0, 7)}` })
  const graph = await loadGraph(join(ws, 'docs', 'graph'))
  const trial = trialOf([{ text: 'npm test', kind: 'gate', outcome: 'passed', ms: 4200 }])
  const checked = await checkRound({ ...noRules, trial: () => trial }, takeover, graph, '读过 README 和路线图，一个岔路没摆进节点')
  assert.equal(checked.ok, true, checked.ok ? '' : checked.message)
  if (!checked.ok) return
  const view = checked.view
  assert.equal(view.anchor, 'goal-1')
  assert.equal(view.goals, 1)
  assert.equal(view.done, 1)
  assert.equal(view.changed, 0)
  assert.ok(view.nodes.some(node => node.duplicate === true), 'the later duplicate carries the mark')
  const detail = commandsDetail(view)
  // the three fields of a detail line join with U+3000: the gate line shows the measured run, the check line the default ceiling
  const lines = detail.markdown.split('\n').filter(line => line.includes('\u3000') && (line.includes('npm test') || line.includes('eslint')))
  assert.equal(lines.length, 2)
  assert.match(lines.find(line => line.includes('npm test')) ?? '', /合入前\u3000试跑约 5 秒；/)
  assert.match(lines.find(line => line.includes('eslint')) ?? '', /改完文件就跑\u3000没预计，/)
  assert.ok(detail.mustShow.some(piece => piece.startsWith('注意：')), 'the notes are a must-show piece')
  // the question the tool returns passes the same validators M3 applies to a recommend record (N22/R1)
  const statuses = await questionStatus(graph, takeover, undefined, ws)
  const full = { ...view, round: 1, statuses, pathBasis: '已有的图，接着用' }
  const ask = listAsk(full)
  assert.equal(ask.fallback, undefined, 'the plain wording passes: no fallback needed')
  assert.equal(askTextRefusal('recommend', ask.text), undefined, askTextRefusal('recommend', ask.text)?.message ?? '')
  assert.ok([...ask.text].length <= TALK_LIMITS.text.recommend, `${[...ask.text].length} code points`)
  assert.equal(proposalTitleRefusal(ask.title), undefined)
  const record = { title: ask.title, ask: askOf(ask.text), form: 'recommend' as const, proposal: ask.proposal, reason: ask.reason, ...(ask.cost === undefined ? {} : { cost: ask.cost }), ...(ask.notTaken === undefined ? {} : { notTaken: ask.notTaken }) }
  assert.equal(proposalRecordRefusal(record), undefined, proposalRecordRefusal(record)?.message ?? '')
  assert.equal(textCoversRecord(ask.text, record, 'recommend'), undefined)
  assert.deepEqual(plainWordsIn(`${ask.title}\n${ask.text}`), [])
  assert.match(ask.text, /等你说再动|读自项目文件/)
  const file = listFull(full)
  assert.match(file, /# List round 1/)
  assert.match(file, /duplicate: on agreement the later one is rejected/)
  assert.match(file, /判路依据：已有的图/)
})

test('the tool refuses a non-main agent, a missing or new takeover, an apply in flight, a busy row, and a bad summary; the happy path returns every field (§7.2)', async () => {
  const ws = workspace('tool')
  const takeover = await takeoverOf(ws)
  await seeded(ws, takeover)
  const opened: number[] = []
  const deps = (overrides: Partial<ReviewDeps> = {}): ReviewDeps => ({
    isMain: () => true,
    open: () => Promise.resolve(takeover),
    graph: () => loadGraph(join(ws, 'docs', 'graph')),
    ancestor: () => Promise.resolve(true),
    testsMissing: () => Promise.resolve(false),
    pathBasis: () => Promise.resolve('已有的图，接着用'),
    trial: () => undefined,
    rulesWhole: () => false,
    rules: () => Promise.resolve(true),
    startTrial: () => {},
    openRound: () => { opened.push(1); return Promise.resolve() },
    round: () => takeover.round,
    busy: () => false,
    setBusy: () => {},
    cwd: () => ws,
    ...overrides,
  })
  const exec = { agent: { id: 'a1' }, callId: 'call-1' } as unknown as ToolExecutionContext
  const throws = async (raw: unknown, d: ReviewDeps, code: string, words: string): Promise<void> => {
    try {
      await bootstrapReviewTool(d).execute(raw, exec)
      assert.fail(`no refusal naming ${code}`)
    }
    catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      assert.ok(text.includes(code), `${text} does not name ${code}`)
      assert.ok(text.includes(words), `${text} does not say ${words}`)
    }
  }
  await throws({ summary: '读过' }, deps({ isMain: () => false }), 'forbidden', 'only the main agent')
  await throws({ summary: '读过' }, deps({ open: () => Promise.resolve(undefined) }), 'not_ready', 'no open takeover')
  await throws({ summary: '读过' }, deps({ open: () => Promise.resolve({ ...takeover, path: 'new' }) }), 'not_ready', 'new projects are agreed with the release')
  await throws({ summary: '读过' }, deps({ open: () => Promise.resolve({ ...takeover, stage: 'apply' }) }), 'not_ready', 'the takeover is being written')
  await throws({ summary: '读过' }, deps({ busy: () => true }), 'busy', 'another round is being opened')
  await throws({ summary: '' }, deps(), 'invalid', 'summary is 1 to 1500')
  // the happy path
  const result = await bootstrapReviewTool(deps()).execute({ summary: '读过 README，一个岔路先不摆' }, exec) as Record<string, unknown>
  assert.equal(result.ok, true)
  assert.equal(result.round, 1)
  assert.equal(result.attach, `bootstrap:${takeover.id}:list-1`)
  assert.equal(result.recordedAs, '照第 1 版清单接管')
  assert.equal(result.parent, 'goal-1')
  assert.equal(result.form, 'recommend')
  assert.match(String(result.listFile), /review-1\.md/)
  assert.match(String(result.message), /propose_to_human/)
  assert.match(String(result.text), /可以吗/)
  assert.deepEqual(opened, [1], 'openRound ran once')
  // the next round of the same takeover is round 2
  const second = await bootstrapReviewTool(deps({ round: () => 1 })).execute({ summary: '读过' }, exec) as Record<string, unknown>
  assert.equal(second.round, 2)
  assert.equal(second.attach, `bootstrap:${takeover.id}:list-2`)
})

/** A decided list question with the exact record fields, as record_human_answer writes them; returns its id and the digest the harness stored. */
async function decidedListQuestion(ws: string, round = 1): Promise<{ readonly id: string, readonly askDigest: string }> {
  const ask = {
    title: '照这份清单接管「示例」',
    text: '照这份清单接管「示例」：读出 1 个目标，我建议同意后摆上项目图、其余等你说再动，因为接管只把读出的现状摆上图，可以吗？',
    proposal: '同意后摆上项目图、其余等你说再动',
    reason: '接管只把读出的现状摆上图',
    cost: 'npm test 在副本里没跑通，合入前才知道结果',
    notTaken: '没自动开工，还要做的等你说',
  }
  const id = await propose(ws, 'harness', {
    type: 'question', title: ask.title, parent: 'goal-1', body: `问题\n\n${takeoverAttachLine(`bootstrap:${(await openTakeoverOf(ws))?.id}:list-${round}`)}`,
    ask: ask.text, form: 'recommend', proposal: ask.proposal, reason: ask.reason, cost: ask.cost, notTaken: ask.notTaken,
  })
  await decided(ws, id, listConclusion(round), 'b'.repeat(12))
  return { id, askDigest: askDigestOf(ask) }
}

test('the write verifies the decision against the stored round and refuses stale, changed and unseen agreements (§7.4 checks 1–5a)', async () => {
  const make = async (name: string): Promise<{ readonly ws: string, readonly takeover: OpenTakeover, readonly qid: string, readonly stored: RoundRecord }> => {
    const ws = workspace(name)
    const takeover = await takeoverOf(ws)
    await seeded(ws, takeover)
    const { id, askDigest } = await decidedListQuestion(ws)
    return { ws, takeover, qid: id, stored: { attach: `bootstrap:${takeover.id}:list-1`, askDigest, detail: 'd', detailDigest: 'b'.repeat(12), snapshot: [] } }
  }
  const ancestor = (): Promise<boolean> => Promise.resolve(true)
  // a stored digest that differs from the graph's record → changed; the true digest passes
  {
    const { takeover, qid, stored } = await make('verify')
    const wrong = await applyAgreement({ ancestor, journal: () => Promise.resolve(true) }, { ...takeover, round: 1, stage: 'apply' }, { ...stored, askDigest: 'c'.repeat(12) }, qid, () => Promise.resolve(true))
    assert.equal(wrong.ok, false)
    if (!wrong.ok) assert.equal(wrong.code, 'changed')
    const right = await applyAgreement({ ancestor, journal: () => Promise.resolve(true) }, { ...takeover, round: 1, stage: 'apply' }, stored, qid, () => Promise.resolve(true))
    assert.equal(right.ok, true, right.ok ? '' : right.why)
  }
  // a wrong conclusion → changed
  {
    const { ws, takeover, qid, stored } = await make('verify-conclusion')
    const engine = openEngine(join(ws, 'docs', 'graph'))
    const g = await loadGraph(join(ws, 'docs', 'graph'))
    assert.ok((await engine.apply('llm', { op: 'decide', id: qid, rev: g.revisions.get(qid), conclusion: '照第 2 版清单接管', reason: `${SHOWN_MARK} ${stored.detailDigest}`, relay: '行' })).ok)
    const refused = await applyAgreement({ ancestor, journal: () => Promise.resolve(true) }, { ...takeover, round: 1, stage: 'apply' }, stored, qid, () => Promise.resolve(true))
    assert.equal(refused.ok, false)
    if (!refused.ok) assert.equal(refused.code, 'changed')
  }
  // a decide whose reason does not carry the shown mark → unseen: the graph carries a mark for another digest
  {
    const { takeover, qid, stored } = await make('verify-unseen')
    const otherDigest = { ...stored, detailDigest: 'd'.repeat(12) }
    const refused = await applyAgreement({ ancestor, journal: () => Promise.resolve(true) }, { ...takeover, round: 1, stage: 'apply' }, otherDigest, qid, () => Promise.resolve(true))
    assert.equal(refused.ok, false)
    if (!refused.ok) assert.equal(refused.code, 'unseen')
    // a round mismatch → stale; an unknown question → missing
    const stale = await applyAgreement({ ancestor, journal: () => Promise.resolve(true) }, { ...takeover, round: 2, stage: 'apply' }, stored, qid, () => Promise.resolve(true))
    assert.equal(stale.ok, false)
    if (!stale.ok) assert.equal(stale.code, 'stale')
    const absent = await applyAgreement({ ancestor, journal: () => Promise.resolve(true) }, { ...takeover, round: 1, stage: 'apply' }, stored, 'question-999', () => Promise.resolve(true))
    assert.equal(absent.ok, false)
    if (!absent.ok) assert.equal(absent.code, 'missing')
  }
})

test('the six steps run on the real engine: approve, reject the duplicate, close the evidenced task, comment once, hand the wish back, close; a resume writes nothing twice (§7.4, §9.2)', async () => {
  const ws = workspace('apply')
  const takeover = await takeoverOf(ws, '把这事做完')
  await seeded(ws, takeover)
  await propose(ws, 'harness', { type: 'feature', title: '同一件事', parent: 'goal-1' })
  await propose(ws, 'harness', { type: 'feature', title: '同一件事', parent: 'goal-1' })
  const sha = head(ws).slice(0, 7)
  const taskId = await propose(ws, 'harness', { type: 'task', title: '已完成的活', parent: 'goal-1', body: `做了\n完成证据：${sha}` })
  const dir = join(ws, 'docs', 'graph')
  const engine = openEngine(dir)
  let graph = await loadGraph(dir)
  assert.ok((await engine.apply('human', { op: 'approve', id: taskId, rev: graph.revisions.get(taskId), reason: '拿给人' })).ok)
  graph = await loadGraph(dir)
  const snapshot = [...graph.nodes.values()].filter(node => node.type !== 'question').map(node => ({ id: node.id, rev: graph.revisions.get(node.id) ?? '' }))
  // the decided question is a list question: its record fields are what the harness stored
  const { id: qid, askDigest } = await decidedListQuestion(ws)
  const stored: RoundRecord = {
    attach: `bootstrap:${takeover.id}:list-1`,
    askDigest,
    detail: 'd', detailDigest: 'b'.repeat(12), snapshot,
  }
  await appendTakeover(ws, takeover.id, [{ op: 'review-open', data: { ...stored, detailShow: [] } }])
  await appendTakeover(ws, takeover.id, [{ op: 'apply-start', data: { questionId: qid, round: 1 } }])
  const state = await openTakeoverOf(ws)
  assert.ok(state !== undefined && state.stage === 'apply')
  // first try: the journal refuses the wish and the close, so the graph holds steps 1–4 but the takeover is open
  const half = await applyAgreement({ ancestor: sha => Promise.resolve(gitCode(ws, ['merge-base', '--is-ancestor', sha, 'HEAD']) === 0) }, state, stored, qid, async (records) => {
    if (records.some(record => record.op === 'apply' || record.op === 'takeover-closed')) return false
    return await appendTakeover(ws, state.id, records.map(record => ({ op: record.op as 'setup', data: record.data as Record<string, never> })))
  })
  assert.equal(half.ok, false)
  if (!half.ok) assert.equal(half.code, 'io')
  const afterHalf = await loadGraph(dir)
  assert.equal(afterHalf.nodes.get('goal-1')?.status, 'approved', 'step 1 approved the goal')
  assert.equal(afterHalf.nodes.get(taskId)?.status, 'done', 'step 3 closed the evidenced task')
  assert.equal((afterHalf.nodes.get('goal-1')?.history ?? []).filter(entry => entry.op === 'comment' && entry.actor === 'harness').length, 1, 'the anchor comment is there once')
  assert.ok((afterHalf.nodes.get(taskId)?.evidence ?? []).some(entry => entry.kind === 'commit' && entry.ref.startsWith(sha)), 'the evidence carries the commit')
  // the resume: everything is judged against the graph, nothing is written twice, and the wish and the close land
  const resumed = await openTakeoverOf(ws)
  assert.ok(resumed !== undefined && resumed.stage === 'apply')
  const result = await applyAgreement({ ancestor: sha2 => Promise.resolve(gitCode(ws, ['merge-base', '--is-ancestor', sha2, 'HEAD']) === 0) }, resumed, stored, qid, async (records) => appendTakeover(ws, resumed.id, records.map(record => ({ op: record.op as 'setup', data: record.data as Record<string, never> }))))
  assert.equal(result.ok, true, result.ok ? '' : result.why)
  assert.equal(result.ok ? result.wish : undefined, '把这事做完', 'the wish went back to the main agent')
  assert.deepEqual(result.ok ? result.totals : {}, { approved: 9, skipped: 0, rejected: 1, done: 1 })
  assert.equal(await openTakeoverOf(ws), undefined, 'the takeover is closed')
  const final = await loadGraph(dir)
  assert.equal((final.nodes.get('goal-1')?.history ?? []).filter(entry => entry.op === 'comment' && entry.actor === 'harness').length, 1, 'the anchor comment is still there once')
  assert.equal(final.nodes.get(taskId)?.status, 'done')
  const duplicate = [...final.nodes.values()].find(node => node.title === '同一件事' && node.status === 'dropped')
  assert.ok(duplicate !== undefined, 'the later duplicate was rejected')
  assert.ok((duplicate?.history ?? []).some(entry => entry.op === 'reject' && (entry.reason ?? '').includes('重复')))
  // the message M3 hands back
  const statuses = await questionStatus(final, { ...takeover, round: 1 }, undefined, ws)
  const message = appliedMessage({ id: takeover.id, round: 1 }, result.ok ? result.totals : { approved: 0, skipped: 0, rejected: 0, done: 0 }, statuses, dir, undefined)
  assert.match(message, /approved 9/)
  assert.match(message, /rejected 1 duplicates/)
  assert.match(message, /closed 1 done tasks/)
  assert.match(message, /git add -- /)
})

test('the graph-in-git lookup, the baseline comment and the format pairing (§7.6, §5.6 item 3)', async () => {
  const ws = workspace('tracked')
  assert.deepEqual(await trackedGraphFiles(ws, join(ws, 'docs', 'graph')), [], 'nothing tracked yet')
  const run = (args: string[]): void => { execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { cwd: ws }) }
  mkdirSync(join(ws, 'docs', 'graph', 'nodes'), { recursive: true })
  writeFileSync(join(ws, 'docs', 'graph', 'nodes', 'goal-1.json'), '{}\n')
  run(['add', 'docs/graph/nodes/goal-1.json'])
  assert.deepEqual(await trackedGraphFiles(ws, join(ws, 'docs', 'graph')), ['docs/graph/nodes/goal-1.json'])
  const bare = mkdtempSync(join(tmpdir(), 'bs-nogit-'))
  try {
    assert.equal(await trackedGraphFiles(bare, join(bare, 'docs', 'graph')), undefined, 'outside git git cannot say')
  }
  finally {
    rmSync(bare, { recursive: true, force: true })
  }
  assert.equal(baselineComment(86, 'abcdef1234567890', '2026-11-10'), '基线：86 条（abcdef1，2026-11-10）')
  // formatOf and baselineOf pair a gate command with the tool node's check line and the harness comment
  const ws2 = workspace('baseline')
  const takeover2 = await takeoverOf(ws2)
  await seeded(ws2, takeover2)
  const engine = openEngine(join(ws2, 'docs', 'graph'))
  const toolId = await toolIdOf(ws2)
  assert.ok((await engine.apply('harness', { op: 'comment', id: toolId, text: baselineComment(86, head(ws2), '2026-11-10') })).ok)
  const g = await loadGraph(join(ws2, 'docs', 'graph'))
  assert.deepEqual(baselineOf(g, ESLINT_FILES), { count: 86, commit: head(ws2).slice(0, 7) })
  assert.deepEqual(baselineOf(g, ESLINT), { count: 86, commit: head(ws2).slice(0, 7) })
  assert.equal(baselineOf(g, 'npm test'), undefined, 'a command no tool node carries has no baseline')
  assert.equal(formatOf(g, ESLINT_FILES), 'eslint-json')
  assert.equal(formatOf(g, ESLINT), 'eslint-json')
  assert.equal(formatOf(g, 'npm test'), undefined)
})

test('the description example goes through the same checks as a real call (design §5.9)', () => {
  const call = /propose_to_human \{(.*)\}/.exec(BOOTSTRAP_REVIEW_EXAMPLE)?.[1]
  assert.ok(call !== undefined, 'the example carries the propose_to_human call')
  const args = JSON.parse(`{${call}}`) as { kind: string, form: string, title: string, text: string, proposal: string, reason: string, cost: string, notTaken: string, attach: string }
  assert.equal(args.kind, 'question')
  assert.equal(args.form, 'recommend')
  assert.match(args.attach, /^bootstrap:tk-[0-9a-z]{8}:list-[1-9][0-9]{0,3}$/)
  assert.equal(listAttachOf(args.attach.slice('bootstrap:'.length))?.round, 1)
  assert.equal(askTextRefusal('recommend', args.text), undefined, askTextRefusal('recommend', args.text)?.message ?? '')
  assert.ok([...args.text].length <= TALK_LIMITS.text.recommend, `${[...args.text].length} code points`)
  assert.equal(proposalTitleRefusal(args.title), undefined)
  const record = { title: args.title, ask: askOf(args.text), form: 'recommend' as const, proposal: args.proposal, reason: args.reason, cost: args.cost, notTaken: args.notTaken }
  assert.equal(proposalRecordRefusal(record), undefined, proposalRecordRefusal(record)?.message ?? '')
  assert.equal(textCoversRecord(args.text, record, 'recommend'), undefined)
  assert.deepEqual(plainWordsIn(`${args.title}\n${args.text}`), [])
  assert.match(BOOTSTRAP_REVIEW_EXAMPLE, /record_human_answer/)
  assert.match(BOOTSTRAP_REVIEW_EXAMPLE, /照第 1 版清单接管/)
  assert.match(args.notTaken, /86 条旧告警/)
  const toolCall = /bootstrap_review \{(.*)\}/.exec(BOOTSTRAP_REVIEW_EXAMPLE)?.[1]
  assert.ok(toolCall !== undefined)
  const summary = (JSON.parse(`{${toolCall}}`) as { summary: string }).summary
  assert.ok(summary.trim().length >= 1 && summary.trim().length <= 1500)
})
