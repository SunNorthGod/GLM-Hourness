/**
 * The main agent's stage reminder (src/design/stage-notice.ts; docs/
 * ORCHESTRATION.md §3.5, §4.8): what it says at each stage of the focus goal,
 * when the history already shows it, and how the design row puts it after the
 * step's admitted messages of a main agent and of nobody else.
 */
import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { apply } from '../src/design/index.ts'
import { INTERVIEW_METHOD, INTERVIEW_STEPS, STAGE_SOURCE, nextInterviewItem, stageNotice, stageReminder, type StageReminder } from '../src/design/stage-notice.ts'
import { requirementCard } from '../src/graph/stage.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import type { DerivedMessage, UserNotice } from '../src/shared/dsh-min.ts'
import { designHost, healthOf, type DesignHost, type FakeAgent } from './design-host.ts'
import { GOAL_BODY, design, graphOf, interview, node } from './graph-memory.ts'
import { captureWarnings, seedAsHuman } from './graph-helpers.ts'

/** Words a stage reminder must not carry: the question cards are gone, the human is asked in plain chat. */
const BANNED = ['ask_user_question', 'decision_card', 'design_review', 'ask_human', '(Recommended)', '(推荐)', '（推荐）']

const textOf = (reminder: StageReminder): string => reminder.text
const lines = (reminder: StageReminder): string[] => reminder.text.split('\n')
const nextLine = (reminder: StageReminder): string | undefined => lines(reminder).find(line => line.startsWith('Next: '))

// ---------------------------------------------------------------- the interview

test('interview: the method line, the count of the card, the missing items and the next question', () => {
  const { graph } = interview({ body: GOAL_BODY.split('\n').filter(line => !line.startsWith('问题')).join('\n') })
  const reminder = stageReminder(graph, 'goal-1')
  assert.deepEqual([reminder.goal, reminder.stage], ['goal-1', 'interview'])
  assert.ok(lines(reminder).includes(INTERVIEW_METHOD))
  assert.ok(reminder.text.includes('Requirement card: 7 of 8 filled.'))
  assert.ok(reminder.text.includes('做成以后，你的日子会有什么不一样'), reminder.text)
  assert.match(nextLine(reminder) ?? '', /^Next: ask 「做成以后，你的日子会有什么不一样」, then interview step 2 /)
  assert.equal(lines(reminder).filter(line => line.startsWith('Next: ')).length, 1)
})

test('interview: the next question is the smallest step of what is missing, not the card\'s order; the others are listed with their labels and hints', () => {
  // The card puts the constraints before the success; the interview asks the success first.
  const { graph } = interview({ body: GOAL_BODY.split('\n').filter(line => !line.startsWith('约束')).join('\n'), acceptance: [] })
  const reminder = stageReminder(graph, 'goal-1')
  assert.match(nextLine(reminder) ?? '', /^Next: ask 「你会怎么检查它真的做成了」, then /)
  assert.ok(reminder.text.includes('- 约束: interview step 5'), reminder.text)
  assert.ok(!reminder.text.includes('- 成功（怎样算做成）:'), 'the item asked next is in the Next line, not listed twice')
})

test('interview: problem and audience are one step, the problem first; non-goals and risks ask with the guesses in one line', () => {
  const asked = (labels: readonly string[]): string => {
    const body = GOAL_BODY.split('\n').filter(line => !labels.some(label => line.startsWith(label))).join('\n')
    return nextLine(stageReminder(interview({ body }).graph, 'goal-1')) ?? ''
  }
  assert.match(asked(['问题', '给谁']), /^Next: ask 「做成以后，你的日子会有什么不一样」, then interview step 2 \(.*\): a line "问题："/)
  assert.match(asked(['给谁']), /^Next: ask 「做成以后，你的日子会有什么不一样」, then interview step 2: a line "给谁："/)
  assert.match(nextLine(stageReminder(interview({ nonGoals: [] }).graph, 'goal-1')) ?? '', /^Next: ask 「有没有你明确不想要的」 with your guesses in one line, then /)
  const noRisk = interview()
  const withoutRisk = graphOf([...noRisk.graph.nodes.values()].filter(entry => entry.type !== 'risk'))
  assert.match(nextLine(stageReminder(withoutRisk, 'goal-1')) ?? '', /^Next: ask 「假如最后没做成，最可能是因为什么」 with your three guesses in one line, then /)
  const needless = interview({ body: GOAL_BODY.split('\n').filter(line => !line.startsWith('需求')).join('\n') })
  assert.match(nextLine(stageReminder(needless.graph, 'goal-1')) ?? '', /^Next: ask 「你想要什么」 as an open question, then /)
})

test('interview: the fork only the human can decide is put with propose_to_human, not asked as a question', () => {
  const { graph } = interview()
  const withoutChoice = graphOf([...graph.nodes.values()].filter(entry => entry.type !== 'question'))
  const reminder = stageReminder(withoutChoice, 'goal-1')
  assert.equal(nextLine(reminder), 'Next: put the one fork only the human can decide with propose_to_human (kind question) and record their answer with record_human_answer; a question you decide on your own does not count.')
})

test('interview: only a superseding goal missing means no Next line, only the label and the hint', () => {
  const { graph } = interview({ edges: [{ type: 'supersedes', to: 'goal-0' }] }, [node({ id: 'goal-0', type: 'goal' })])
  const reminder = stageReminder(graph, 'goal-1')
  assert.equal(nextLine(reminder), undefined)
  assert.ok(lines(reminder).some(line => line.startsWith('- 「goal-1」取代旧节点: ') || line.includes('取代旧节点: superseding a node needs the human')), reminder.text)
})

test('interview: a complete card asks the human to confirm the requirement', () => {
  const reminder = stageReminder(interview().graph, 'goal-1')
  assert.equal(nextLine(reminder), 'Next: put the requirement to the human with propose_to_human (kind confirm).')
  assert.ok(reminder.text.includes('Requirement card: 8 of 8 filled.'))
  const wish = stageReminder(interview({ stage: 'wish' }).graph, 'goal-1')
  assert.equal(wish.stage, 'wish')
})

test('the interview table has exactly the keys of the requirement card', () => {
  const { graph, goal } = interview()
  assert.deepEqual(INTERVIEW_STEPS.map(entry => entry.key).sort(), requirementCard(graph, goal).map(item => item.key).sort())
  assert.deepEqual(nextInterviewItem([]), undefined)
})

// ---------------------------------------------------------------- design and release

/** goal-1 at `stage`, split into module-a (released) and module-b (design), with the framework decision. */
function splitGoal(stage: 'design' | 'release', modules = 2): ReturnType<typeof graphOf> {
  const features = Array.from({ length: modules }, (_, index): GraphNode => node({ id: `module-${index + 1}`, type: 'feature', parent: 'goal-1', stage: index === 0 ? 'release' : 'design', title: `模块${index + 1}` }, 3 + index))
  return graphOf([
    node({ id: 'goal-1', type: 'goal', stage }, 0, 'human'),
    node({ id: 'decision-1', type: 'decision', parent: 'goal-1' }, 1),
    ...features,
    node({ id: 'task-1', type: 'task', parent: 'module-2' }, 9),
    node({ id: 'task-0', type: 'task', parent: 'module-1' }, 9),
  ])
}

/** The design fixture with its plan as tasks directly under the goal: a small project, not split into modules. */
function smallDesign(decision: Partial<GraphNode> = {}, others: readonly GraphNode[] = []): ReturnType<typeof graphOf> {
  const base = design(decision, others).graph
  return graphOf([...base.nodes.values()].filter(entry => entry.id !== 'feature-1').map(entry => entry.id === 'task-1' ? { ...entry, parent: 'goal-1', edges: [{ type: 'source' as const, to: 'decision-1' }] } : entry))
}

test('design: the writing format with the three labels; the gate lists what blocks and, when it holds, asks for the release', () => {
  const ready = stageReminder(smallDesign(), 'goal-1')
  for (const label of ['理由：', '架构：', '查过的现成方案：']) assert.ok(ready.text.includes(label), label)
  assert.ok(ready.text.includes('Design columns: 1 decision(s) proposed; decision-1 has the fewest, 5 of 5.'))
  assert.equal(nextLine(ready), 'Next: put the design to the human with propose_to_human (kind release).')
  const blocked = stageReminder(smallDesign({ nonGoals: [] }), 'goal-1')
  assert.equal(nextLine(blocked), undefined)
  assert.ok(blocked.text.includes('- 非目标: set nonGoals on decision-1'), blocked.text)
  assert.ok(blocked.text.includes('4 of 5'))
  assert.ok(!blocked.text.includes('如果失败：'), 'the post-mortem line comes with step 9')
})

test('design of a split goal: the framework and module writing format, no single-layer format line', () => {
  const reminder = stageReminder(splitGoal('design'), 'goal-1')
  assert.ok(reminder.text.includes('norm-directions'))
  assert.ok(reminder.text.includes('plan each module as a feature directly under the goal'))
  assert.ok(!reminder.text.includes('a small project keeps its tasks directly under the goal'))
  assert.ok(reminder.text.includes('理由：') && reminder.text.includes('查过的现成方案：'))
  assert.equal(nextLine(reminder), undefined, 'the release lines of a split goal come with the release gate of step 9')
})

test('release of an unsplit goal: one line to tell the human', () => {
  const reminder = stageReminder(graphOf([node({ id: 'goal-1', type: 'goal', stage: 'release' }, 0, 'human'), node({ id: 'task-1', type: 'task', parent: 'goal-1' })]), 'task-1')
  assert.deepEqual([reminder.goal, reminder.stage], ['goal-1', 'release'])
  assert.ok(reminder.text.endsWith('The design is released. Tell the human in one line; decomposition and dispatch come next.'), reminder.text)
})

test('release of a split goal: says each module starts in design, lists the modules and tells the main agent to focus the module before dispatching', () => {
  const reminder = stageReminder(splitGoal('release'), 'goal-1')
  assert.ok(reminder.text.includes('The framework, the module list and the directions are released.'))
  assert.ok(reminder.text.includes('put it to the human with propose_to_human (kind release, module <id>, page)'))
  assert.ok(reminder.text.includes('graph_focus to the module or the task it belongs to'))
  assert.deepEqual(lines(reminder).filter(line => line.startsWith('- ')), ['- 模块1（module-1）：已放行', '- 模块2（module-2）：设计中'])
})

test('release of a split goal: at most eight module lines, the rest counted', () => {
  const reminder = stageReminder(splitGoal('release', 11), 'goal-1')
  assert.equal(lines(reminder).filter(line => line.startsWith('- ')).length, 8)
  assert.equal(lines(reminder).at(-1), 'and 3 more')
  const exactly = stageReminder(splitGoal('release', 8), 'goal-1')
  assert.equal(lines(exactly).filter(line => line.startsWith('- ')).length, 8)
  assert.ok(!exactly.text.includes(' more'))
})

test('a module sent back to design is listed as sent back', () => {
  const graph = splitGoal('release')
  const back = graphOf([...graph.nodes.values()].map(entry => entry.id === 'module-2'
    ? { ...entry, history: [...entry.history, { at: '2026-10-29T09:00:00.000Z', actor: 'llm' as const, op: 'edit' as const, reason: '退回', changes: { stage: { from: 'release', to: 'design' } } }] }
    : entry))
  assert.ok(lines(stageReminder(back, 'goal-1')).includes('- 模块2（module-2）：退回设计'))
})

test('focus inside a module: the module\'s writing format while it is in design, one line once it is released', () => {
  const graph = splitGoal('release')
  const inDesign = stageReminder(graph, 'task-1')
  assert.ok(inDesign.text.includes('module module-2 "模块2", which is in design'))
  assert.ok(inDesign.text.includes('Write this module\'s design decisions as children of the module'))
  assert.ok(inDesign.text.includes('graph_focus to the module or the task it belongs to'))
  assert.ok(!inDesign.text.includes('The framework, the module list and the directions are released.'))
  const released = stageReminder(graph, 'task-0')
  assert.ok(released.text.includes('This module is released. Tell the human in one line; decomposition and dispatch of this module come next.'))
  const candidate = graphOf([...graph.nodes.values(), node({ id: 'candidate-1', type: 'feature', parent: 'goal-1', status: 'proposed' }, 12)])
  assert.ok(stageReminder(candidate, 'candidate-1').text.includes('The framework, the module list and the directions are released.'), 'a candidate is read at the goal level')
})

test('the goal back in design while modules exist: the framework text covers the whole goal, a module focus included', () => {
  const reminder = stageReminder(splitGoal('design'), 'task-1')
  assert.ok(reminder.text.includes('The work is split into modules.'))
  assert.ok(!reminder.text.includes('which is in design'))
})

// ---------------------------------------------------------------- the other situations

test('no goal in focus, a focus that is not in the graph, a focus with no goal above it: nothing is released yet', () => {
  const graph = graphOf([node({ id: 'goal-1', type: 'goal' }, 0, 'human'), node({ id: 'task-9', type: 'task' })])
  for (const [focus, why] of [[undefined, 'no goal is in your focus yet'], ['missing-1', 'your focus missing-1 is not in the graph'], ['task-9', 'your focus task-9 has no goal above it']] as const) {
    const reminder = stageReminder(graph, focus)
    assert.deepEqual([reminder.goal, reminder.stage], ['', 'none'], String(focus))
    assert.ok(reminder.text.includes(why), reminder.text)
    assert.ok(reminder.text.includes('the subagents you dispatch can only read'))
    assert.ok(reminder.text.includes('graph_open lists the open work'))
  }
})

test('a closed goal, a goal that names no stage, and a stage after the release', () => {
  const closed = stageReminder(graphOf([node({ id: 'goal-1', type: 'goal', status: 'done', stage: 'design' }, 0, 'human')]), 'goal-1')
  assert.deepEqual([closed.stage, closed.text.includes('is done. A closed goal is not worked on')], ['closed', true])
  const plain = stageReminder(graphOf([node({ id: 'goal-1', type: 'goal', title: '小工具' }, 0, 'human')]), 'goal-1')
  assert.deepEqual([plain.goal, plain.stage], ['goal-1', 'none'])
  assert.ok(plain.text.includes('does not run the design loop'))
  const later = stageReminder(graphOf([node({ id: 'goal-1', type: 'goal', stage: 'execute' }, 0, 'human')]), 'goal-1')
  assert.deepEqual([later.stage, later.text.includes('stage execute, which does not belong to the design loop')], ['execute', true])
})

test('questions waiting for the human are counted on the last line', () => {
  const { graph } = interview({}, [node({ id: 'question-2', type: 'question', parent: 'goal-1', status: 'approved' })])
  assert.equal(lines(stageReminder(graph, 'goal-1')).at(-1), '1 question(s) under this goal wait for the human\'s answer.')
})

test('no stage reminder names a question card, a review tool or a recommended mark', () => {
  const graphs: Array<[string, ReturnType<typeof graphOf>, string | undefined]> = [
    ['interview', interview().graph, 'goal-1'],
    ['interview with gaps', interview({ acceptance: [], nonGoals: [], body: '需求：x' }).graph, 'goal-1'],
    ['interview with the fork missing behind other gaps', graphOf([...interview({ acceptance: [] }).graph.nodes.values()].filter(entry => entry.type !== 'question')), 'goal-1'],
    ['design', smallDesign(), 'goal-1'],
    ['design with an undecided question', smallDesign({}, [node({ id: 'question-2', type: 'question', parent: 'goal-1', status: 'approved' })]), 'goal-1'],
    ['split design', splitGoal('design'), 'goal-1'],
    ['split release', splitGoal('release'), 'goal-1'],
    ['module in design', splitGoal('release'), 'task-1'],
    ['module released', splitGoal('release'), 'task-0'],
    ['no focus', graphOf([]), undefined],
  ]
  for (const [name, graph, focus] of graphs) {
    const text = textOf(stageReminder(graph, focus))
    for (const word of BANNED) assert.ok(!text.includes(word), `${name}: ${word}`)
  }
})

// ---------------------------------------------------------------- when the history already shows it

const noticeMessage = (notice: UserNotice): DerivedMessage => ({ role: 'user', content: notice.content, source: notice.source })
const reasonOf = (notice: UserNotice | undefined): unknown => (notice?.source.designStage as { reason?: string } | undefined)?.reason

const reminder = (text: string, goal = 'goal-1', stage = 'interview'): StageReminder => ({ goal, stage, text })

test('stageNotice: the first one is added, an unchanged one is not; the text of the reminder is wrapped and the facts say what it was about', () => {
  const first = stageNotice([], [], reminder('one'))
  assert.ok(first !== undefined)
  assert.equal(first.source.kind, STAGE_SOURCE)
  assert.equal(reasonOf(first), 'goal')
  assert.equal(first.content[0].text, '<system-reminder>\none\n</system-reminder>')
  assert.deepEqual({ ...(first.source.designStage as object), digest: '' }, { goal: 'goal-1', stage: 'interview', digest: '', reason: 'goal' })
  assert.match((first.source.designStage as { digest: string }).digest, /^[0-9a-f]{12}$/)
  assert.equal(stageNotice([noticeMessage(first)], [], reminder('one')), undefined)
})

test('stageNotice: a changed text is added again, a changed goal is added with the goal reason', () => {
  const first = stageNotice([], [], reminder('one'))!
  const history = [noticeMessage(first)]
  assert.equal(reasonOf(stageNotice(history, [], reminder('two'))), 'changed')
  assert.equal(reasonOf(stageNotice(history, [], reminder('one', 'goal-2'))), 'goal')
  assert.equal(reasonOf(stageNotice(history, [], reminder('one', ''))), 'goal', 'a focus that lost its goal is a new subject')
})

test('stageNotice: after a compaction the reminder is added once more and anchored to the checkpoint; a goal round adds it too', () => {
  const first = stageNotice([], [], reminder('one'))!
  const checkpoint: DerivedMessage = { role: 'user', source: { kind: 'compact-checkpoint', compactionId: 'c-1' } }
  const compacted = stageNotice([noticeMessage(first), checkpoint], [], reminder('one'))
  assert.equal(reasonOf(compacted), 'compaction')
  assert.equal((compacted?.source.designStage as { anchor?: string }).anchor, 'c-1')
  assert.equal(stageNotice([checkpoint, noticeMessage(compacted!)], [], reminder('one')), undefined, 'anchored to the checkpoint it follows')
  const other: DerivedMessage = { role: 'user', source: { kind: 'compact-checkpoint', compactionId: 'c-2' } }
  assert.equal(reasonOf(stageNotice([checkpoint, noticeMessage(compacted!), other], [], reminder('one'))), 'compaction')
  assert.equal(reasonOf(stageNotice([noticeMessage(first)], [{ source: { kind: 'goal' } }], reminder('one'))), 'goal-round')
})

test('stageNotice: a notice with unreadable facts counts as none', () => {
  const broken: DerivedMessage = { role: 'user', source: { kind: STAGE_SOURCE, designStage: { goal: 1 } } }
  assert.equal(reasonOf(stageNotice([broken], [], reminder('one'))), 'goal')
})

// ---------------------------------------------------------------- on the design row

async function wiredMainAgent(): Promise<{ readonly host: DesignHost, readonly agent: FakeAgent, readonly graphDir: string }> {
  const host = designHost()
  apply(host.ctx)
  const agent = host.addAgent('s1')
  assert.equal((await host.execute(agent, '/wish'))?.result.kind, 'success')
  return { host, agent, graphDir: join(host.workspace('ws'), 'docs', 'graph') }
}

/** The stage reminders a step admitted, after it ran on the agent. */
async function stepNotices(agent: FakeAgent): Promise<UserNotice[]> {
  const decision = await agent.step()
  assert.equal(decision.kind, 'enter')
  return (decision as { messages: UserNotice[] }).messages.filter(message => message.source?.kind === STAGE_SOURCE)
}

test('a main agent gets the reminder after its assembly, again only when it changes, and the notice ends the step\'s messages', async () => {
  const { host, agent, graphDir } = await wiredMainAgent()
  await agent.assemble()
  const first = await stepNotices(agent)
  assert.equal(first.length, 1)
  assert.equal(reasonOf(first[0]), 'goal')
  assert.ok(first[0].content[0].text.includes('no goal is in your focus yet'))
  assert.deepEqual(await stepNotices(agent), [], 'unchanged')

  await seedAsHuman(graphDir, [{ type: 'goal', title: '记账', stage: 'design', body: GOAL_BODY, acceptance: ['a'], nonGoals: ['n'] }])
  host.focuses.set('s1', 'goal-1')
  await agent.assemble()
  const second = await stepNotices(agent)
  assert.equal(second.length, 1)
  assert.equal(reasonOf(second[0]), 'goal')
  assert.ok(second[0].content[0].text.includes('Stage reminder: goal goal-1 "记账" is at stage design.'))
  assert.equal(second[0].source.kind, STAGE_SOURCE)

  await seedAsHuman(graphDir, [{ type: 'risk', title: '风险', parent: 'goal-1' }, { type: 'question', title: '卡着', parent: 'goal-1', options: [{ key: 'A', label: '甲', gain: '快', cost: '糙' }, { key: 'B', label: '乙', gain: '稳', cost: '慢' }], recommend: 'B', crux: '要快吗', verdict: '是 → A；否 → B', weight: 'two-way' }])
  await agent.assemble()
  const third = await stepNotices(agent)
  assert.equal(reasonOf(third[0]), 'changed', 'a question waiting for the human changes the text')
  assert.equal(healthOf(host, agent)?.state, 'active')
})

test('a notice goes after the messages the step admits', async () => {
  const { agent } = await wiredMainAgent()
  await agent.assemble()
  const claimed = { id: 'm-1', role: 'user', content: [{ type: 'text', text: '继续' }], source: { kind: 'user' } }
  const decision = await agent.step({ messages: [claimed] })
  const messages = (decision as { messages: Array<{ id: string }> }).messages
  assert.equal(messages[0].id, 'm-1')
  assert.equal(messages.length, 2)
  assert.equal((messages[1] as unknown as UserNotice).source.kind, STAGE_SOURCE)
})

test('an ordinary session, a delegated child and a main agent that left the role get no reminder', async () => {
  const { host, agent } = await wiredMainAgent()
  const plain = host.addAgent('plain', { workspace: 'other' })
  const child = host.addAgent('child', { origin: 'subagent', parentSession: 's1' })
  for (const other of [plain, child]) {
    await other.assemble()
    assert.deepEqual(await stepNotices(other), [], other.id)
  }
  assert.equal((await host.execute(agent, '/wish off'))?.result.kind, 'success')
  await agent.assemble()
  assert.deepEqual(await stepNotices(agent), [])
})

test('a graph that cannot be read: the step goes without the reminder and the session\'s health says so', async () => {
  const { host, agent } = await wiredMainAgent()
  await agent.assemble()
  host.services.set('glmHournessGraph', { dirFor: () => { throw new Error('graph row broke') }, isGraphTool: () => false, focusOf: () => undefined })
  const { result } = await captureWarnings(() => stepNotices(agent))
  assert.deepEqual(result, [])
  const health = healthOf(host, agent)
  assert.equal(health?.state, 'degraded')
  assert.match(health?.reason ?? '', /阶段提醒这一步没带上/)
  assert.match(health?.reason ?? '', /graph row broke/)
  host.services.delete('glmHournessGraph')
  const missing = await captureWarnings(() => stepNotices(agent))
  assert.deepEqual(missing.result, [])
  assert.equal(healthOf(host, agent)?.state, 'degraded')
})
