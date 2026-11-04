/**
 * The user graph on the design row's side (user graph design 0.4.1 §5.1 to
 * §5.3, §1.4 items 27 to 31): the user page a confirm and a release append
 * (propose_to_human), the two checks record_human_answer makes of it (shown
 * whole, its stable part unchanged), the page kept on the showing (`Shown`),
 * and the stage reminder's lines on the user graph. On the fake host with the
 * real engine and the real fold of the session log; the stage reminder on
 * graphs built in memory.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { STAGE_SOURCE, USER_DESIGN_LINE, USER_INTERVIEW_LINE, USER_RELEASE_LINE, stageNotice, stageReminder } from '../src/design/stage-notice.ts'
import { TALK_PROJECTION, type TalkState } from '../src/design/talk.ts'
import type { GraphEngine } from '../src/graph/engine.ts'
import { fenced, renderAsk } from '../src/graph/proposal.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import { releaseUserPage, userGraphOf, type UserPage } from '../src/graph/user-graph.ts'
import type { DerivedMessage, UserNotice } from '../src/shared/dsh-min.ts'
import { PROPOSE_TO_HUMAN, RECORD_HUMAN_ANSWER, shownProposalOf } from '../src/shared/tool-names.ts'
import { FRAMEWORK_PAGE, NO_END_USER, fillRequirementCard, mainAgentWithGoal, modulePage, writeDesign, type MainAgentFixture } from './design-tools-helpers.ts'
import { GOAL_BODY, design, graphOf, interview, userNodes } from './graph-memory.ts'

type Outcome = Awaited<ReturnType<MainAgentFixture['host']['callTool']>>

const valueOf = (outcome: Outcome): Record<string, unknown> => outcome.kind === 'ok' ? outcome.value : assert.fail(JSON.stringify(outcome))
const errorOf = (outcome: Outcome): { code: string, message: string, hint: string } => outcome.kind === 'error' ? outcome.error : assert.fail(JSON.stringify(outcome))

const CONFIRM = { kind: 'confirm', goal: 'goal-1', text: '需求就按上面这样定，可以吗？' }
const RELEASE = { kind: 'release', goal: 'goal-1', text: '照上面的方案放行，可以吗？' }
const AGREE = '对，就这样'
const CHANGED = '页在给你看之后变了'
const STATE_HEADING = '截至给你看的时刻（这一段只是给你看现状，不是你要同意的内容，之后会变）'
const TIMEOUT_TEXT = '超时是预计秒数的 3 倍，跑过几次之后按最近三次里最慢的一次的 3 倍，不低于 10 秒、不高于 30 分钟。写着「你来走」的流程不跑命令，这里写「没法自动测，做完时请你亲自走一遍」。'
const WALK_LINE = '`walk 命令 $ npm run e2e -- --flow {flow}`'

/** The confirm sample of the user graph drawUserGraph draws (§5.1). */
const CONFIRM_PAGE = '用户怎么用\n记账的人\n 记一笔：1 输入一笔花销〔看到记好了〕→ 2 看到这一笔〔列表里多了一行〕'

async function send(engine: GraphEngine, actor: 'human' | 'llm', input: Record<string, unknown>): Promise<void> {
  const done = await engine.apply(actor, { ...input, ...input.op === 'propose' || input.op === 'comment' ? {} : { rev: (await engine.load()).revisions.get(input.id as string) } })
  if (!done.ok) throw new Error(JSON.stringify(done.error))
}

/**
 * The interview's drawing as the main agent's own proposals (§5.1): one role,
 * one flow walked by command, its two steps and the flow's entry; with
 * `gate`, the merge gate's walk line too (what a release asks for).
 */
async function drawUserGraph(engine: GraphEngine, gate = false): Promise<void> {
  const propose = (node: Record<string, unknown>): Promise<void> => send(engine, 'llm', { op: 'propose', reason: '访谈 2b', node })
  await propose({ id: 'role-1', type: 'role', title: '记账的人', parent: 'goal-1' })
  await propose({ id: 'flow-1', type: 'flow', title: '记一笔', parent: 'role-1', body: '走法：命令 · 预计 30 秒' })
  await propose({ id: 'step-2', type: 'step', title: '看到这一笔', parent: 'flow-1', acceptance: ['列表里多了一行'] })
  await propose({ id: 'step-1', type: 'step', title: '输入一笔花销', parent: 'flow-1', acceptance: ['看到记好了'], edges: [{ type: 'next', to: 'step-2' }] })
  await send(engine, 'llm', { op: 'link', id: 'flow-1', reason: '流程从这一步开始', type: 'next', to: 'step-1' })
  if (gate) await propose({ id: 'norm-merge-gate', type: 'norm', title: '合入前检查', parent: 'goal-1', acceptance: ['`npm test` 通过', WALK_LINE] })
}

/** The work `id` serves `step`. */
const serve = (fixture: MainAgentFixture, id: string, step: string): Promise<void> => send(fixture.engine, 'llm', { op: 'link', id, reason: '这件活做这一步', type: 'serves', to: step })

/** Put a matter to the human; the main agent says `said` (the text it got back when left out), and the human answers. */
async function shown(fixture: MainAgentFixture, args: Record<string, unknown>, said?: (text: string) => string): Promise<Record<string, unknown>> {
  const value = valueOf(await fixture.host.callTool(fixture.agent, PROPOSE_TO_HUMAN, args))
  const text = String(value.text)
  fixture.host.reply(fixture.agent, said === undefined ? text : said(text))
  await fixture.host.say(fixture.agent, AGREE)
  return value
}

const record = (fixture: MainAgentFixture, args: Record<string, unknown>) => fixture.host.callTool(fixture.agent, RECORD_HUMAN_ANSWER, { answer: 'agree', words: [AGREE], recordedAs: '照这样定', ...args })

/** The question and the user page under it, the way propose_to_human lays them out. */
const withPage = (question: string, page: string): string => `${question}\n\n${fenced(page)}`

// ---------------------------------------------------------------- confirm (§5.1, §1.4 items 27, 28)

test('confirm of a goal with a user graph: the sample of roles, flows and steps is appended to the text and kept on the result and on the showing; the human agrees once it is shown whole', async () => {
  const fixture = await mainAgentWithGoal({}, 'llm')
  await fillRequirementCard(fixture, ['flows'])
  await drawUserGraph(fixture.engine)
  const value = valueOf(await fixture.host.callTool(fixture.agent, PROPOSE_TO_HUMAN, CONFIRM))
  assert.deepEqual(value.userPage, { stable: CONFIRM_PAGE, state: '' }, 'a confirm has no state: only roles, flows, steps, conditions and what each step looks like done')
  assert.equal(value.text, withPage(renderAsk(CONFIRM.text, 1), CONFIRM_PAGE))
  const talk = fixture.host.projections.stateOf(fixture.agent.session, TALK_PROJECTION) as TalkState
  assert.deepEqual(talk.shown.at(-1)?.userPage, { stable: CONFIRM_PAGE, state: '' })
  // The main agent showed the question but not the sample: not shown, nothing written.
  fixture.host.reply(fixture.agent, renderAsk(CONFIRM.text, 1))
  await fixture.host.say(fixture.agent, AGREE)
  const before = (await fixture.engine.load()).revision
  const unseen = errorOf(await record(fixture, { kind: 'confirm', goal: 'goal-1' }))
  assert.deepEqual([unseen.code, unseen.message], ['not_shown', 'The human has not seen the whole user page they must see before agreeing'])
  assert.equal((await fixture.engine.load()).revision, before)
  // Shown whole, the same page now: confirmed.
  await shown(fixture, CONFIRM)
  assert.equal(valueOf(await record(fixture, { kind: 'confirm', goal: 'goal-1' })).outcome, 'confirmed')
  assert.deepEqual([(await fixture.node('goal-1')).status, (await fixture.node('goal-1')).stage], ['approved', 'design'])
})

test('confirm: a page that changed after it was shown is not agreed to (not_shown, 页在给你看之后变了); a change outside what the person reads is not a change', async () => {
  const fixture = await mainAgentWithGoal({}, 'llm')
  await fillRequirementCard(fixture, ['flows'])
  await drawUserGraph(fixture.engine)
  await shown(fixture, CONFIRM)
  await send(fixture.engine, 'llm', { op: 'edit', id: 'step-1', reason: '改标题', set: { title: '输入金额和类别' } })
  const before = (await fixture.engine.load()).revision
  const changed = errorOf(await record(fixture, { kind: 'confirm', goal: 'goal-1' }))
  assert.equal(changed.code, 'not_shown')
  assert.ok(changed.message.startsWith(CHANGED), changed.message)
  assert.match(changed.hint, /put it to the human again with propose_to_human/)
  assert.equal((await fixture.engine.load()).revision, before, 'the graph does not move')
  // Shown again; then the body of a step changes, which the sample does not show: agreed.
  await shown(fixture, CONFIRM)
  await send(fixture.engine, 'llm', { op: 'edit', id: 'step-1', reason: '补一句', set: { body: '金额和类别都要填' } })
  assert.equal(valueOf(await record(fixture, { kind: 'confirm', goal: 'goal-1' })).outcome, 'confirmed')
})

test('confirm of a goal without end users: the line that says so is the page, checked the same way; neither a user graph nor the line is gate_unmet; both, the drawing is the page', async () => {
  const fixture = await mainAgentWithGoal({}, 'llm')
  await fillRequirementCard(fixture)
  const line = `这个目标没有终端用户：${NO_END_USER}`
  const value = await shown(fixture, CONFIRM)
  assert.deepEqual(value.userPage, { stable: line, state: '' })
  const goal = await fixture.node('goal-1')
  await send(fixture.engine, 'llm', { op: 'edit', id: 'goal-1', reason: '改原因', set: { body: (goal.body ?? '').replace(NO_END_USER, '内部重构，用户看不到') } })
  const changed = errorOf(await record(fixture, { kind: 'confirm', goal: 'goal-1' }))
  assert.equal(changed.code, 'not_shown')
  assert.ok(changed.message.startsWith(CHANGED))

  const neither = await mainAgentWithGoal({}, 'llm')
  await fillRequirementCard(neither, ['flows'])
  const unmet = errorOf(await neither.host.callTool(neither.agent, PROPOSE_TO_HUMAN, CONFIRM))
  assert.deepEqual([unmet.code, unmet.message], ['gate_unmet', 'the requirement card of "goal-1" is not complete; missing: 用户怎么用（谁来用、一步步做什么）'])
  assert.match(unmet.hint, /interview step 2b/)

  const both = await mainAgentWithGoal({}, 'llm')
  await fillRequirementCard(both)
  await drawUserGraph(both.engine)
  assert.deepEqual(valueOf(await both.host.callTool(both.agent, PROPOSE_TO_HUMAN, CONFIRM)).userPage, { stable: CONFIRM_PAGE, state: '' }, 'a live role makes 用户流程：无 void')
})

test('confirm: a sample of the user graph too big for one page is refused as gate_unmet, not cut (flows:page)', async () => {
  const fixture = await mainAgentWithGoal({}, 'llm')
  await fillRequirementCard(fixture, ['flows'])
  await drawUserGraph(fixture.engine)
  await send(fixture.engine, 'llm', { op: 'edit', id: 'step-2', reason: '写细', set: { acceptance: ['长'.repeat(8_000)] } })
  const error = errorOf(await fixture.host.callTool(fixture.agent, PROPOSE_TO_HUMAN, CONFIRM))
  assert.deepEqual([error.code, error.message], ['gate_unmet', 'the requirement of "goal-1" is not complete; missing: 用户怎么用的样稿放得下一页（不超过 8,000 字）'])
  assert.match(error.hint, /split the goal, or shorten flow and step titles$/)
  assert.deepEqual((fixture.host.projections.stateOf(fixture.agent.session, TALK_PROJECTION) as TalkState).shown, [], 'nothing was shown')
})

// ---------------------------------------------------------------- release of a goal not split (§5.2, §1.4 item 29)

test('release of a goal not split: who owns each flow and how it is walked (stable) and the timeout caps (state) are appended; both must be in the reply; a step nobody builds is gate_unmet', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'small')
  await drawUserGraph(fixture.engine, true)
  const unmet = errorOf(await fixture.host.callTool(fixture.agent, PROPOSE_TO_HUMAN, RELEASE))
  assert.equal(unmet.code, 'gate_unmet')
  assert.match(unmet.message, /missing: 每一步都有人负责$/)
  await serve(fixture, 'task-1', 'step-1')
  await serve(fixture, 'task-1', 'step-2')
  const stable = [
    '每条流程由谁负责',
    ' 记账的人 › 记一笔：写记账命令',
    '每条流程怎么走一遍（命令来自合入前检查清单，放行之后执行的就是这些）',
    ' 记账的人 › 记一笔：命令 · npm run e2e -- --flow flow-1 · 预计 30 秒',
    TIMEOUT_TEXT,
  ].join('\n')
  const state = `${STATE_HEADING}\n 超时上限：记一笔 90 秒，都是预计的 3 倍，还没有跑过`
  // The reply has the stable part but not the state: not shown whole.
  const value = await shown(fixture, RELEASE, () => withPage(renderAsk(RELEASE.text, 1), stable))
  assert.deepEqual(value.userPage, { stable, state })
  assert.equal(value.text, withPage(renderAsk(RELEASE.text, 1), `${stable}\n${state}`))
  const partial = errorOf(await record(fixture, { kind: 'release', goal: 'goal-1' }))
  assert.deepEqual([partial.code, partial.message], ['not_shown', 'The human has not seen the whole user page they must see before agreeing'])
  // Shown whole: released, the user nodes approved with the rest.
  await shown(fixture, RELEASE)
  const released = valueOf(await record(fixture, { kind: 'release', goal: 'goal-1' }))
  assert.equal(released.outcome, 'released')
  for (const id of ['role-1', 'flow-1', 'step-1', 'step-2', 'norm-merge-gate']) assert.ok((released.approved as string[]).includes(id), id)
})

test('release of a goal not split: a flow renamed, its command or its owner changed after the showing is not agreed to; a renamed step, not on this page, is held back by the check of the release set', async () => {
  for (const change of ['flow', 'command', 'owner', 'title'] as const) {
    const fixture = await mainAgentWithGoal()
    await writeDesign(fixture, 'small')
    await drawUserGraph(fixture.engine, true)
    await serve(fixture, 'task-1', 'step-1')
    await serve(fixture, 'task-1', 'step-2')
    await shown(fixture, RELEASE)
    if (change === 'flow') await send(fixture.engine, 'llm', { op: 'edit', id: 'flow-1', reason: '改名', set: { title: '记一笔花销' } })
    if (change === 'command') await send(fixture.engine, 'llm', { op: 'edit', id: 'norm-merge-gate', reason: '换命令', set: { acceptance: ['`npm test` 通过', '`walk 命令 $ npm run e2e:all -- --flow {flow}`'] } })
    if (change === 'owner') await send(fixture.engine, 'llm', { op: 'propose', reason: '多一件活', node: { id: 'task-2', type: 'task', title: '写列表命令', parent: 'goal-1', acceptance: ['列表能读回'], edges: [{ type: 'serves', to: 'step-2' }] } })
    if (change === 'title') await send(fixture.engine, 'llm', { op: 'edit', id: 'step-2', reason: '改标题', set: { title: '看到记下的这一笔' } })
    const outcome = await record(fixture, { kind: 'release', goal: 'goal-1' })
    if (change === 'title') {
      // §5.2: the set check covers the nodes the release approves, the stable part what the person read; the steps are in the set, not on this page.
      const value = valueOf(outcome)
      assert.equal(value.outcome, 'partial')
      assert.deepEqual(value.skipped, [{ id: 'step-2', code: 'stale_revision' }])
    }
    else {
      const error = errorOf(outcome)
      assert.equal(error.code, 'not_shown', change)
      assert.ok(error.message.startsWith(CHANGED), change)
    }
    assert.equal((await fixture.node('goal-1')).stage, 'design', change)
  }
})

// ---------------------------------------------------------------- the two levels of a split goal (§5.2, §5.3, §1.4 items 29, 30)

/** writeDesign 'split' with the user graph drawn and served: task-a (module a, 记账) serves step-1, task-b (module b, 月底汇总) step-1 and step-2. */
async function splitServed(): Promise<MainAgentFixture> {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'split')
  await drawUserGraph(fixture.engine, true)
  await serve(fixture, 'task-a', 'step-1')
  await serve(fixture, 'task-b', 'step-1')
  await serve(fixture, 'task-b', 'step-2')
  return fixture
}

/** The release page of the goal, or of `module`, rendered from the graph as it is now. */
const pageNow = async (fixture: MainAgentFixture, module?: string): Promise<UserPage> =>
  releaseUserPage(userGraphOf(await fixture.engine.load(), await fixture.node('goal-1')), module === undefined ? undefined : await fixture.node(module))

const shownPage = (value: Record<string, unknown>): UserPage => value.userPage as UserPage

/** The page of `module` rendered now has the stable part of `showing` and a state part that moved on; the agreement records the module as released. */
async function stateMovedOn(fixture: MainAgentFixture, showing: Record<string, unknown>, module: string): Promise<void> {
  const now = await pageNow(fixture, module)
  assert.equal(now.stable, shownPage(showing).stable)
  assert.notEqual(now.state, shownPage(showing).state, 'the state part did change')
  assert.equal(valueOf(await record(fixture, { kind: 'release', goal: 'goal-1', module })).outcome, 'released')
}

test('a split goal: the framework release carries the owners by module; a module release the steps that module serves, and the agreement holds while other modules move on, not when the steps it serves change', async () => {
  const fixture = await splitServed()
  // The framework: the owners are the modules, the command came from the merge gate.
  const framework = await shown(fixture, { ...RELEASE, page: FRAMEWORK_PAGE })
  const page = shownPage(framework)
  assert.ok(page.stable.startsWith('每条流程由谁负责\n 记账的人 › 记一笔：记账、月底汇总\n每条流程怎么走一遍'), page.stable)
  assert.equal(framework.text, withPage(renderAsk(RELEASE.text, 1, undefined, FRAMEWORK_PAGE, false), `${page.stable}\n${page.state}`))
  assert.equal(valueOf(await record(fixture, { kind: 'release', goal: 'goal-1' })).outcome, 'released')
  // Module b first; its page is the steps it serves.
  const moduleB = await shown(fixture, { ...RELEASE, module: 'module-b', page: modulePage('月底汇总') })
  assert.match(shownPage(moduleB).stable, /^这个模块服务哪几步\n 记一笔：1 输入一笔花销〔看到记好了〕→ 2 看到这一笔〔列表里多了一行〕$/)
  assert.equal(valueOf(await record(fixture, { kind: 'release', goal: 'goal-1', module: 'module-b' })).outcome, 'released')
  // Module a: after its page was shown, its task is linked to one more step: the steps it serves changed.
  const moduleA = { ...RELEASE, module: 'module-a', page: modulePage('记账') }
  await shown(fixture, moduleA)
  await serve(fixture, 'task-a', 'step-2')
  const changed = errorOf(await record(fixture, { kind: 'release', goal: 'goal-1', module: 'module-a' }))
  assert.equal(changed.code, 'not_shown')
  assert.ok(changed.message.startsWith(CHANGED))
  // Shown again; then module b's task starts on a step module a serves too: the state the person saw moved on, what they agree to did not.
  const again = await shown(fixture, moduleA)
  await send(fixture.engine, 'llm', { op: 'status', id: 'task-b', reason: '开工', to: 'doing' })
  await stateMovedOn(fixture, again, 'module-a')
})

test('a split goal, after the framework page was shown: a module\'s task moving on, or one more task under a module already on those steps linked with serves, leaves the owners as shown and the agreement standing (item 29)', async () => {
  const fixture = await splitServed()
  const framework = await shown(fixture, { ...RELEASE, page: FRAMEWORK_PAGE })
  // task-b is approved; module b gets task-12 on step-1, which it serves already. By file name task-12 comes before task-a and task-b; by owner nothing moved.
  await send(fixture.engine, 'human', { op: 'approve', id: 'task-b', reason: '先定下' })
  await send(fixture.engine, 'llm', { op: 'propose', reason: '多一件活', node: { id: 'task-12', type: 'task', title: '写汇总校验', parent: 'module-b', acceptance: ['能用'], edges: [{ type: 'serves', to: 'step-1' }] } })
  assert.equal((await pageNow(fixture)).stable, shownPage(framework).stable, 'the owners of a flow are listed by the owner, not by the file names of the servers')
  assert.equal(valueOf(await record(fixture, { kind: 'release', goal: 'goal-1' })).outcome, 'released')
})

test('a module release, after its page was shown: a step it serves renamed is not agreed to (not_shown); its own task moving on leaves the agreement standing (item 30)', async () => {
  const fixture = await splitServed()
  await shown(fixture, { ...RELEASE, page: FRAMEWORK_PAGE })
  assert.equal(valueOf(await record(fixture, { kind: 'release', goal: 'goal-1' })).outcome, 'released')
  const moduleA = { ...RELEASE, module: 'module-a', page: modulePage('记账') }
  await shown(fixture, moduleA)
  // The title of a released step is the person's: they rename it in the panel.
  await send(fixture.engine, 'human', { op: 'edit', id: 'step-1', reason: '改标题', set: { title: '输入金额和类别' } })
  const renamed = errorOf(await record(fixture, { kind: 'release', goal: 'goal-1', module: 'module-a' }))
  assert.equal(renamed.code, 'not_shown')
  assert.ok(renamed.message.startsWith(CHANGED), renamed.message)
  // Shown again; then module a's own task is approved and started: the state the person saw moved on, what they agree to did not.
  const again = await shown(fixture, moduleA)
  await send(fixture.engine, 'human', { op: 'approve', id: 'task-a', reason: '先定下' })
  await send(fixture.engine, 'human', { op: 'status', id: 'task-a', reason: '开工', to: 'doing' })
  await stateMovedOn(fixture, again, 'module-a')
})

// ---------------------------------------------------------------- the showing keeps the page (§5.2: Shown takes userPage from the result)

test('the result of propose_to_human is read with its user page, and one whose page is not two strings is not a showing', () => {
  const result = { tool: PROPOSE_TO_HUMAN, kind: 'confirm', goal: 'goal-1', number: 1, text: '…' }
  assert.equal(shownProposalOf(false, JSON.stringify(result))?.userPage, undefined)
  assert.deepEqual(shownProposalOf(false, JSON.stringify({ ...result, userPage: { stable: '用户怎么用', state: '' } }))?.userPage, { stable: '用户怎么用', state: '' })
  for (const userPage of [null, 'page', { stable: '用户怎么用' }, { stable: 1, state: '' }]) assert.equal(shownProposalOf(false, JSON.stringify({ ...result, userPage })), undefined, JSON.stringify(userPage))
})

// ---------------------------------------------------------------- the stage reminder (§1.4 item 31)

const lines = (graph: ReturnType<typeof graphOf>): string[] => stageReminder(graph, 'goal-1').text.split('\n')
const gapLines = (graph: ReturnType<typeof graphOf>): string[] => lines(graph).filter(line => line.startsWith('User graph: '))

test('stage reminder, interview: the line on drawing the user graph always; the gap line only for the gaps the interview closes; the next question of step 2b', () => {
  const body = GOAL_BODY.split('\n').filter(line => !line.startsWith('用户流程')).join('\n')
  const blank = interview({ body }).graph
  assert.ok(lines(blank).includes(USER_INTERVIEW_LINE))
  assert.deepEqual(gapLines(blank), [])
  assert.ok(lines(blank).includes('Next: ask 「谁会用它，他们进来先做什么」 with your guess of who uses it, written as 「我猜用它的有……，对吗？」, then interview step 2b (who uses it and what they do first; offer your guess): graph_propose the roles under the goal, the flows under each role and the steps under each flow (types role, flow and step, in the human\'s words), or, for a goal with no end user, a line "用户流程：无，<reason>" in the goal body.'), stageReminder(blank, 'goal-1').text)
  // Drawn without the flow's entry: one shape gap; the steps nobody builds yet are the design's business, not listed here.
  const noEntry = interview({ body }, userNodes('proposed', false)).graph
  assert.deepEqual(gapLines(noEntry), ['User graph: 1 gap(s); the first, flow:entry on flow-1 (「记一笔」找不到起点（或有两个起点）): the flow\'s own next edge is its entry: graph_relink flow-1 to its first step.'])
  assert.deepEqual(gapLines(interview({ body }, userNodes()).graph), [], 'a whole drawing: no gap the interview closes')
  assert.ok(lines(interview().graph).includes(USER_INTERVIEW_LINE), 'also for a goal that says it has no end user')
})

test('stage reminder, design and after the release: one line on the user graph and one line of its gaps, for a goal with a user graph only', () => {
  const drawn = design({}, userNodes()).graph
  assert.ok(lines(drawn).includes(USER_DESIGN_LINE))
  assert.deepEqual(gapLines(drawn), ['User graph: 3 gap(s); the first, step:unserved on step-1 (「记一笔」的第 1 步「输入一笔花销」没人负责): connect step-1 to the module or task that builds it, with graph_link type serves.'])
  assert.ok(lines(drawn).some(line => line.startsWith('- 每一步都有人负责: ')), 'the release gate lists the missing item too')
  const plain = design().graph
  assert.ok(!lines(plain).includes(USER_DESIGN_LINE))
  assert.deepEqual(gapLines(plain), [], 'a goal without a user graph: neither line')
  const releasedGraph = (nodes: readonly GraphNode[]): ReturnType<typeof graphOf> => graphOf(nodes.map(entry => entry.id === 'goal-1' ? { ...entry, stage: 'release' as const } : entry))
  const released = releasedGraph([...design({}, userNodes('approved')).graph.nodes.values()])
  assert.ok(lines(released).includes(USER_RELEASE_LINE))
  assert.equal(gapLines(released).length, 1)
  assert.ok(!lines(releasedGraph([...design().graph.nodes.values()])).includes(USER_RELEASE_LINE))
})

test('stage reminder: a user graph whose gaps did not change is not added again; a change of its gaps is', () => {
  const noticeMessage = (notice: UserNotice): DerivedMessage => ({ role: 'user', content: notice.content, source: notice.source })
  const reasonOf = (notice: UserNotice | undefined): unknown => (notice?.source.designStage as { reason?: string } | undefined)?.reason
  const drawn = design({}, userNodes()).graph
  const first = stageNotice([], [], stageReminder(drawn, 'goal-1'))!
  assert.equal(first.source.kind, STAGE_SOURCE)
  assert.equal(stageNotice([noticeMessage(first)], [], stageReminder(design({}, userNodes()).graph, 'goal-1')), undefined, 'the same graph read again')
  const served = graphOf([...drawn.nodes.values()].map(entry => entry.id === 'task-1' ? { ...entry, edges: [...entry.edges ?? [], { type: 'serves' as const, to: 'step-1' }, { type: 'serves' as const, to: 'step-2' }] } : entry))
  assert.deepEqual(gapLines(served), ['User graph: 1 gap(s); the first, flow:no-test on flow-1 (「记一笔」每一步都拆成了任务，还没有人写走一遍要跑的测试): a task of kind test writes the end-to-end test the walk of flow-1 runs: put it in the module that owns these steps, or link it with serves to the steps it covers (inside the serving module, a linked test task becomes the step\'s only leaf, so link it there only to a step that already has task-level serves).'])
  assert.equal(reasonOf(stageNotice([noticeMessage(first)], [], stageReminder(served, 'goal-1'))), 'changed')
})
