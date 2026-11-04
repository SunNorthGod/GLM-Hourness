import assert from 'node:assert/strict'
import test from 'node:test'
import { plainWordsIn } from '../src/graph/plain-question.ts'
import type { GraphNode, HistoryEntry, Status } from '../src/graph/schema.ts'
import {
  bigLoopSet,
  designColumns,
  effectiveStage,
  goalOf,
  labeledSections,
  moduleReleaseGate,
  moduleSet,
  releaseGate,
  releaseSet,
  requirementCard,
  stageStatus,
  type GateItem,
  type StageStatus,
} from '../src/graph/stage.ts'
import { decide, design, failing, GOAL_BODY, graphOf, interview, node, question, splitDesign, userNodes } from './graph-memory.ts'
import { stageEdit } from './execute-helpers.ts'

test('labeledSections: full-width and ASCII colons, multi-line sections, the first of a repeated label, text before the first label', () => {
  const body = [
    '前言不属于任何一节',
    '需求：记账',
    '  每天一条  ',
    '问题: 月底看不出',
    '不是标签：这一行属于问题',
    ' 给谁：行首有空格，不算标签',
    '需求：第二次出现，不算',
    '约束：',
  ].join('\n')
  const sections = labeledSections(body, ['需求', '问题', '给谁', '约束'])
  assert.deepEqual([...sections], [
    ['需求', '记账\n  每天一条'],
    ['问题', '月底看不出\n不是标签：这一行属于问题\n 给谁：行首有空格，不算标签'],
    ['约束', ''],
  ])
  assert.equal(labeledSections('需求：a\r\n问题：b', ['需求', '问题']).get('需求'), 'a', 'CRLF line ends')
  assert.equal(labeledSections(undefined, ['需求']).size, 0)
})

test('effectiveStage: a proposed goal is in wish or interview; an approved goal in the stage it names or none; a closed goal in none', () => {
  const goal = (status: Status, stage?: GraphNode['stage']): GraphNode => node({ id: 'goal-1', type: 'goal', status, ...(stage === undefined ? {} : { stage }) })
  assert.equal(effectiveStage(goal('proposed')), 'wish')
  assert.equal(effectiveStage(goal('proposed', 'wish')), 'wish')
  assert.equal(effectiveStage(goal('proposed', 'interview')), 'interview')
  assert.equal(effectiveStage(goal('proposed', 'design')), 'interview', 'a stage the llm wrote on its own proposal does not count')
  assert.equal(effectiveStage(goal('proposed', 'release')), 'interview')
  assert.equal(effectiveStage(goal('approved')), null, 'an adopted goal without a stage does not run the design loop')
  assert.equal(effectiveStage(goal('approved', 'design')), 'design')
  assert.equal(effectiveStage(goal('doing', 'release')), 'release')
  for (const status of ['done', 'dropped', 'superseded'] as const) assert.equal(effectiveStage(goal(status, 'design')), null, status)
})

test('goalOf: the goal itself, the goal above a deep task, nothing for a missing node or a chain without a goal', () => {
  const graph = graphOf([
    node({ id: 'goal-1', type: 'goal' }),
    node({ id: 'feature-1', type: 'feature', parent: 'goal-1' }),
    node({ id: 'task-1', type: 'task', parent: 'feature-1' }),
    node({ id: 'task-2', type: 'task', parent: 'task-1' }),
    node({ id: 'task-9', type: 'task', parent: 'feature-9' }),
    node({ id: 'task-a', type: 'task', parent: 'task-b' }),
    node({ id: 'task-b', type: 'task', parent: 'task-a' }),
  ])
  assert.equal(goalOf(graph, 'goal-1')?.id, 'goal-1')
  assert.equal(goalOf(graph, 'task-2')?.id, 'goal-1')
  assert.equal(goalOf(graph, 'nope'), undefined)
  assert.equal(goalOf(graph, 'task-9'), undefined, 'the parent is missing')
  assert.equal(goalOf(graph, 'task-a'), undefined, 'a decomposition cycle is cut')
})

test('requirementCard: 9 items, each one missing on its own', () => {
  const complete = interview()
  assert.deepEqual(requirementCard(complete.graph, complete.goal).map(item => [item.key, item.ok]), [
    ['need', true], ['problem', true], ['audience', true], ['flows', true], ['constraints', true], ['acceptance', true], ['non-goals', true], ['risks', true], ['choice', true],
  ])
  for (const item of requirementCard(complete.graph, complete.goal)) {
    assert.ok(item.label.length > 0 && item.hint.length > 0, item.key)
  }
  const without = (label: string): string => GOAL_BODY.split('\n').filter(line => !line.startsWith(label)).join('\n')
  const cases: ReadonlyArray<readonly [string, Partial<GraphNode>]> = [
    ['need', { body: without('需求') }],
    ['problem', { body: without('问题') }],
    ['audience', { body: without('给谁') }],
    ['flows', { body: without('用户流程') }],
    ['constraints', { body: without('约束') }],
    ['acceptance', { acceptance: [] }],
    ['non-goals', { nonGoals: [] }],
  ]
  for (const [key, goal] of cases) {
    const { graph, goal: root } = interview(goal)
    assert.deepEqual(failing(requirementCard(graph, root)), [key], key)
  }
  const blankConstraint = interview({ body: GOAL_BODY.replace('约束：无', '约束：') })
  assert.deepEqual(failing(requirementCard(blankConstraint.graph, blankConstraint.goal)), ['constraints'], 'a label without text is missing')
  // Risks: only a risk under the goal that is not dropped or superseded counts.
  const risks = (status: Status): readonly string[] => {
    const graph = graphOf([...interview().graph.nodes.values()].map(entry => entry.id === 'risk-1' ? { ...entry, status } : entry))
    return failing(requirementCard(graph, graph.nodes.get('goal-1')!))
  }
  assert.deepEqual(risks('dropped'), ['risks'])
  assert.deepEqual(risks('superseded'), ['risks'])
  assert.deepEqual(risks('proposed'), [])
})

/** The node `id` with serves edges to `steps` added. */
const serving = (id: string, steps: readonly string[]) => (entry: GraphNode): GraphNode =>
  entry.id === id ? { ...entry, edges: [...(entry.edges ?? []), ...steps.map(to => ({ type: 'serves' as const, to }))] } : entry

test('requirementCard: 用户怎么用 is a live role with a live flow and step, or, while the goal has no live role, a line 用户流程：无 with its reason (user graph design 0.4.1 §5.1, §1.4 item 27)', () => {
  const body = GOAL_BODY.split('\n').filter(line => !line.startsWith('用户流程')).join('\n')
  const flows = (line: string | undefined, others: readonly GraphNode[] = []): boolean => {
    const { graph, goal } = interview({ body: line === undefined ? body : `${body}\n${line}` }, others)
    return requirementCard(graph, goal).find(item => item.key === 'flows')!.ok
  }
  const drawn = userNodes()
  const without = (...ids: readonly string[]): GraphNode[] => drawn.filter(entry => !ids.includes(entry.id))
  const dropped = (...ids: readonly string[]): GraphNode[] => drawn.map(entry => ids.includes(entry.id) ? { ...entry, status: 'dropped' as const } : entry)
  const NONE = '用户流程：无，内部重构，用户看不到变化'
  assert.equal(flows(undefined), false, 'neither a user graph nor the line')
  assert.equal(flows(NONE), true)
  assert.equal(flows('用户流程：无'), false, 'no reason')
  assert.equal(flows('用户流程：无，'), false, 'an empty reason')
  assert.equal(flows('用户流程：有'), false, 'not 无')
  assert.equal(flows(undefined, drawn), true, 'drawn')
  assert.equal(flows(NONE, drawn), true, 'both: the drawing holds')
  assert.equal(flows(NONE, without('flow-1', 'step-1', 'step-2')), false, 'a live role makes the line void')
  assert.equal(flows(undefined, without('step-1', 'step-2')), false, 'a flow without a step')
  assert.equal(flows(undefined, dropped('step-1')), true, 'one live step is enough')
  assert.equal(flows(undefined, dropped('flow-1')), false, 'the steps of a dropped flow are not live')
  assert.equal(flows(NONE, dropped('role-1')), true, 'a dropped role is no role: the line counts again')
  assert.equal(flows(undefined, dropped('role-1')), false)
  const item = requirementCard(interview({ body }).graph, interview({ body }).goal).find(entry => entry.key === 'flows')!
  assert.equal(item.label, '用户怎么用（谁来用、一步步做什么）')
  assert.match(item.hint, /^interview step 2b \(who uses it and what they do first; offer your guess\): graph_propose the roles under the goal, .* a line "用户流程：无，<reason>" in the goal body$/)
})

test('the release gates carry the user graph\'s items when the goal has one: five on a goal not split, six on the framework, module:serves on a module (user graph design 0.4.1 §5.2, §5.3, §1.4 items 29, 30)', () => {
  const userItems = (items: readonly GateItem[]): Array<[string, boolean]> => items.filter(item => item.key.startsWith('flows:') || item.key === 'module:serves').map(item => [item.key, item.ok])
  // Not split: the five items come last; a step nobody builds blocks the release.
  const single = design({}, userNodes())
  const served = graphOf([...single.graph.nodes.values()].map(serving('task-1', ['step-1', 'step-2'])))
  const gate = releaseGate(served, served.nodes.get('goal-1')!)
  assert.deepEqual(userItems(gate), [['flows:shape', true], ['flows:expect', true], ['flows:served', true], ['flows:walk', true], ['flows:page', true]])
  assert.deepEqual(gate.slice(-5).map(item => item.key), ['flows:shape', 'flows:expect', 'flows:served', 'flows:walk', 'flows:page'])
  assert.deepEqual(failing(releaseGate(single.graph, single.goal)), ['flows:served'])
  assert.equal(stageStatus(single.graph, single.goal).exitReady, false, 'the design cannot leave its stage while a step has nobody')
  // The framework of a split goal: six, flows:modules among them; a module that serves no step blocks it.
  const split = splitDesign(userNodes())
  const both = graphOf([...split.graph.nodes.values()].map(serving('task-a', ['step-1'])).map(serving('task-b', ['step-2'])))
  assert.deepEqual(userItems(releaseGate(both, both.nodes.get('goal-1')!)), [['flows:shape', true], ['flows:expect', true], ['flows:served', true], ['flows:modules', true], ['flows:walk', true], ['flows:page', true]])
  const idle = graphOf([...split.graph.nodes.values()].map(serving('task-a', ['step-1', 'step-2'])))
  assert.deepEqual(failing(releaseGate(idle, idle.nodes.get('goal-1')!)), ['flows:modules'])
  // A module: module:serves last; its task serves a step, or its body says why it serves none.
  const released = (nodes: readonly GraphNode[]): ReturnType<typeof graphOf> => graphOf(nodes.map((entry): GraphNode => {
    if (entry.id === 'goal-1') return { ...entry, stage: 'release' }
    if (entry.id === 'module-a' || entry.id === 'module-b') return { ...entry, status: 'approved', stage: 'design' }
    return (['role', 'flow', 'step', 'norm'] as const).some(type => entry.type === type) ? { ...entry, status: 'approved' } : entry
  }))
  const moduleGate = (graph: ReturnType<typeof graphOf>): readonly GateItem[] => moduleReleaseGate(graph, graph.nodes.get('goal-1')!, graph.nodes.get('module-b')!)
  assert.deepEqual(moduleGate(released([...both.nodes.values()])).at(-1), { key: 'module:serves', label: '这个模块服务至少一步，或写明为什么不服务', ok: true, hint: 'connect the module or its tasks to a step with serves, or add a line "服务：无，<reason>" to the module body' })
  assert.deepEqual(failing(moduleGate(released([...idle.nodes.values()]))), ['module:serves'])
  const declared = released([...idle.nodes.values()].map(entry => entry.id === 'module-b' ? { ...entry, body: '服务：无，月底汇总只读别的模块记下的账' } : entry))
  assert.deepEqual(failing(moduleGate(declared)), [])
  // A goal without a user graph has none of them (the gates of the tests above are unchanged).
  assert.deepEqual(userItems([...releaseGate(design().graph, design().goal), ...releaseGate(splitDesign().graph, splitDesign().goal)]), [])
})

test('requirementCard: the choice counts only a question whose last decide was the human\'s, in the panel or relayed', () => {
  const card = (decides: readonly HistoryEntry[], fields: Partial<GraphNode> = {}): string[] => {
    const graph = graphOf([
      node({ id: 'goal-1', type: 'goal', status: 'proposed', body: GOAL_BODY, acceptance: ['a'], nonGoals: ['n'] }),
      node({ id: 'risk-1', type: 'risk', parent: 'goal-1' }),
      node({ id: 'feature-1', type: 'feature', parent: 'goal-1' }),
      question('question-1', 'feature-1', { ...(decides.length === 0 ? {} : { status: 'done' as const, decision: decides.at(-1)!.option! }), ...fields }, decides),
    ])
    return failing(requirementCard(graph, graph.nodes.get('goal-1')!))
  }
  assert.deepEqual(card([decide('human', 5, 'B')]), [], 'decided by the human, deeper in the subtree')
  assert.deepEqual(card([decide('llm', 5, 'A', '选 A')]), [], 'relayed from the chat')
  assert.deepEqual(card([decide('llm', 5, 'B')], { decider: 'agent' }), ['choice'], 'the agent decided it on its own')
  assert.deepEqual(card([decide('llm', 5, 'B'), decide('human', 6, 'A')], { decider: 'agent' }), [], 'the human overturned the agent')
  assert.deepEqual(card([decide('human', 5, 'B'), decide('harness', 6, 'A')]), ['choice'], 'only the last decide counts')
  assert.deepEqual(card([]), ['choice'], 'not decided yet')
})

test('designColumns: five columns, each one missing on its own; the plan counts open nodes under the goal with a source edge to the decision', () => {
  const columns = (fields: Partial<GraphNode> = {}, others: readonly GraphNode[] = []): string[] => {
    const { graph, goal } = design(fields, others)
    return failing(designColumns(graph, goal, graph.nodes.get('decision-1')!))
  }
  const complete = design()
  assert.deepEqual(designColumns(complete.graph, complete.goal, complete.graph.nodes.get('decision-1')!).map(item => [item.key, item.ok]), [
    ['decision-1:reason', true], ['decision-1:architecture', true], ['decision-1:acceptance', true], ['decision-1:plan', true], ['decision-1:non-goals', true],
  ])
  assert.deepEqual(columns({ body: '架构：本地 JSON 文件\n查过的现成方案：ledger-cli 太重' }), ['decision-1:reason'])
  assert.deepEqual(columns({ body: '理由：一个人用\n查过的现成方案：ledger-cli 太重' }), ['decision-1:architecture'])
  assert.deepEqual(columns({ body: '理由：一个人用\n架构：本地 JSON 文件' }), ['decision-1:architecture'], 'search before building: the checked solutions are part of the architecture')
  assert.deepEqual(columns({ acceptance: [] }), ['decision-1:acceptance'])
  assert.deepEqual(columns({ nonGoals: [] }), ['decision-1:non-goals'])
  const unplanned = (feature: Partial<GraphNode>): string[] => {
    const { graph, goal } = design()
    const changed = graphOf([...graph.nodes.values()].map(entry => entry.id === 'task-1' ? { ...entry, ...feature } : entry))
    return failing(designColumns(changed, goal, changed.nodes.get('decision-1')!))
  }
  assert.deepEqual(unplanned({ edges: [] }), ['decision-1:plan'])
  assert.deepEqual(unplanned({ status: 'dropped' }), ['decision-1:plan'])
  assert.deepEqual(unplanned({ parent: 'goal-2' }), ['decision-1:plan'], 'a node outside the goal is not its plan')
})

test('designColumns: a step\'s source edge to a question does not make the plan (user graph design 0.4.1 §2.3, §1.4 item 25)', () => {
  const { graph, goal } = design({}, [
    node({ id: 'role-1', type: 'role', parent: 'goal-1' }, 3),
    node({ id: 'flow-1', type: 'flow', parent: 'role-1' }, 3),
    node({ id: 'step-1', type: 'step', parent: 'flow-1', acceptance: ['看到押金已收'], edges: [{ type: 'source', to: 'question-1' }] }, 3),
  ])
  const unplanned = graphOf([...graph.nodes.values()].map(entry => entry.id === 'task-1' ? { ...entry, edges: [] } : entry))
  assert.deepEqual(failing(designColumns(unplanned, goal, unplanned.nodes.get('decision-1')!)), ['decision-1:plan'], 'only planned work makes the plan, not a step that grew from a question')
})

test('releaseSet: a proposed user node counts only while it is live, the rest of the set unchanged (user graph design 0.4.1 §3.7)', () => {
  const { graph, goal } = design({}, [
    node({ id: 'role-1', type: 'role', parent: 'goal-1', status: 'proposed' }, 3),
    node({ id: 'flow-1', type: 'flow', parent: 'role-1', status: 'proposed' }, 4),
    node({ id: 'step-1', type: 'step', parent: 'flow-1', status: 'proposed' }, 5),
    // Rejected (reject does not cascade): its proposed step stays proposed and must not be approved by the release.
    node({ id: 'flow-2', type: 'flow', parent: 'role-1', status: 'dropped' }, 4),
    node({ id: 'step-2', type: 'step', parent: 'flow-2', status: 'proposed' }, 5),
    // An approved flow dropped later, with a proposed step under it.
    node({ id: 'flow-3', type: 'flow', parent: 'role-1', status: 'dropped' }, 4),
    node({ id: 'step-3', type: 'step', parent: 'flow-3', status: 'proposed' }, 5),
  ])
  const plain = design()
  const before = releaseSet(plain.graph, plain.goal).map(entry => entry.id)
  const ids = releaseSet(graph, goal).map(entry => entry.id)
  assert.deepEqual(ids.filter(id => !before.includes(id)), ['role-1', 'flow-1', 'step-1'])
  assert.deepEqual(ids.filter(id => before.includes(id)), before)
})

test('releaseSet: the proposed nodes under the goal by depth, creation time and id; parents before children', () => {
  const { graph, goal } = design({}, [
    node({ id: 'task-0', type: 'task', status: 'proposed', parent: 'task-1', acceptance: ['x'] }, 5),
    node({ id: 'risk-1', type: 'risk', status: 'proposed', parent: 'goal-1' }, 1),
    node({ id: 'task-2', type: 'task', status: 'approved', parent: 'task-1' }, 6),
    node({ id: 'goal-2', type: 'goal', status: 'proposed' }, 0),
    node({ id: 'feature-9', type: 'feature', status: 'proposed', parent: 'goal-2' }, 0),
  ])
  assert.deepEqual(releaseSet(graph, goal).map(entry => entry.id), ['risk-1', 'decision-1', 'task-1', 'task-0'])
})

test('stageStatus in design: the release gate lists the design decision, its five columns, task acceptance, undecided questions and supersessions', () => {
  const ready = design()
  const status: StageStatus = stageStatus(ready.graph, ready.goal)
  assert.deepEqual([status.goal, status.stage, status.closed, status.exitReady, status.waitingHuman], ['goal-1', 'design', false, true, 0])
  assert.deepEqual(status.items.map(item => item.key), [
    'decision', 'decision-1:reason', 'decision-1:architecture', 'decision-1:acceptance', 'decision-1:plan', 'decision-1:non-goals', 'task-1:acceptance',
  ])
  const blocked = (others: readonly GraphNode[], decision: Partial<GraphNode> = {}): StageStatus => {
    const { graph, goal } = design(decision, others)
    return stageStatus(graph, goal)
  }
  const human = blocked([question('question-2', 'task-1')])
  assert.deepEqual([failing(human.items), human.exitReady, human.waitingHuman], [['question-2:undecided'], false, 1])
  const agent = blocked([question('question-3', 'goal-1', { decider: 'agent' })])
  assert.deepEqual([failing(agent.items), agent.waitingHuman], [['question-3:undecided'], 0], 'an undecided question blocks whoever decides it')
  assert.match(agent.items.find(item => item.key === 'question-3:undecided')!.hint, /graph_decide/)
  assert.deepEqual(failing(blocked([node({ id: 'task-3', type: 'task', status: 'proposed', parent: 'task-1' }, 7)]).items), ['task-3:acceptance'])
  assert.deepEqual(failing(blocked([node({ id: 'task-4', type: 'task', status: 'proposed', parent: 'task-1', acceptance: ['y'], edges: [{ type: 'supersedes', to: 'task-9' }] }, 7)]).items), ['task-4:supersedes'])
  const noDecision = blocked([], { status: 'dropped' })
  assert.deepEqual([failing(noDecision.items), noDecision.exitReady], [['decision'], false], 'a dropped decision is no design')
  const adopted = blocked([], { status: 'approved' })
  assert.deepEqual([failing(adopted.items), adopted.exitReady], [[], true], 'a decision approved already is the design: a release that stopped or skipped a node is put again from there')
})

test('the hints that send the model to the human name the chat tools, not a question card', () => {
  const noChoice = interview()
  const withoutQuestion = graphOf([...noChoice.graph.nodes.values()].filter(entry => entry.type !== 'question'))
  const choice = requirementCard(withoutQuestion, withoutQuestion.nodes.get('goal-1')!).find(item => item.key === 'choice')!
  assert.equal(choice.ok, false)
  assert.equal(choice.hint, 'interview step 7 (the fork only the human can decide): put it with propose_to_human (kind question, form recommend or choose) and record the answer with record_human_answer; a question the agent decided on its own does not count')
  const waiting = design({}, [question('question-2', 'task-1')])
  const undecided = stageStatus(waiting.graph, waiting.goal).items.find(item => item.key === 'question-2:undecided')!
  assert.equal(undecided.hint, 'the human decides question-2: wait for the human\'s answer in the chat and record it with record_human_answer')
  for (const hint of [choice.hint, undecided.hint]) assert.ok(!hint.includes('decision_card') && !hint.includes('design_review') && !hint.includes('ask_user_question'), hint)
})

test('stageStatus in wish and interview: the requirement card plus the confirmation gate on a superseding goal', () => {
  const complete = interview()
  const status = stageStatus(complete.graph, complete.goal)
  assert.deepEqual([status.stage, status.exitReady, status.items.length], ['interview', true, 9])
  const early = interview({ stage: 'wish', acceptance: [] })
  const wish = stageStatus(early.graph, early.goal)
  assert.deepEqual([wish.stage, wish.exitReady, failing(wish.items)], ['wish', false, ['acceptance']])
  const superseding = interview({ edges: [{ type: 'supersedes', to: 'goal-0' }] }, [node({ id: 'goal-0', type: 'goal' })])
  const gated = stageStatus(superseding.graph, superseding.goal)
  assert.deepEqual([failing(gated.items), gated.exitReady], [['goal:supersedes'], false])
  assert.match(gated.items.at(-1)!.hint, /relay their words/)
})

test('stageStatus outside wish, interview and design: no items, not ready to leave; closed goals say so; waiting questions are counted', () => {
  const release = design()
  const released = graphOf([...release.graph.nodes.values()].map(entry => entry.id === 'goal-1' ? { ...entry, stage: 'release' as const } : entry))
  assert.deepEqual(stageStatus(released, released.nodes.get('goal-1')!), { goal: 'goal-1', stage: 'release', closed: false, items: [], exitReady: false, waitingHuman: 0 })
  const plain = graphOf([node({ id: 'goal-1', type: 'goal' }, 0, 'human'), question('question-1', 'goal-1'), question('question-2', 'goal-1', { status: 'proposed' })])
  assert.deepEqual(stageStatus(plain, plain.nodes.get('goal-1')!), { goal: 'goal-1', stage: null, closed: false, items: [], exitReady: false, waitingHuman: 2 })
  const closed = graphOf([node({ id: 'goal-1', type: 'goal', status: 'done', stage: 'design' }, 0, 'human')])
  assert.deepEqual(stageStatus(closed, closed.nodes.get('goal-1')!), { goal: 'goal-1', stage: null, closed: true, items: [], exitReady: false, waitingHuman: 0 })
})

test('the gate names a task and the goal of a decision as the human says them: what counts as done, not acceptance', () => {
  const ready = design()
  const items = stageStatus(ready.graph, ready.goal).items
  assert.equal(items.find(item => item.key === 'decision-1:acceptance')?.label, '目标（怎样算做成）')
  assert.equal(items.find(item => item.key === 'task-1:acceptance')?.label, '任务「task-1」怎样算做完')
  const split = splitDesign()
  const module = split.graph.nodes.get('module-a')!
  const labels = [...releaseGate(split.graph, split.goal), ...moduleReleaseGate(split.graph, split.goal, module), ...items].map(item => item.label)
  assert.ok(labels.length > 20)
  for (const label of labels) assert.deepEqual(plainWordsIn(label), [], label)
})

test('a line "如果失败：" in a decision is not a column: it ends the section above it and the gate does not look at it', () => {
  const columns = (body: string): string[] => {
    const { graph, goal } = design({ body })
    return failing(designColumns(graph, goal, graph.nodes.get('decision-1')!))
  }
  const line = '如果失败：文件被改坏'
  assert.deepEqual(columns(`理由：一个人用\n架构：本地 JSON 文件\n查过的现成方案：ledger-cli 太重\n${line}`), [], 'a line after the columns changes nothing')
  assert.deepEqual(columns(`理由：一个人用\n架构：本地 JSON 文件\n查过的现成方案：\n${line}`), ['decision-1:architecture'], 'an empty column followed by that line is still empty')
  assert.deepEqual(columns(`理由：一个人用\n架构：\n${line}\n查过的现成方案：ledger-cli 太重`), ['decision-1:architecture'], 'so is the architecture')
  assert.deepEqual(columns(`理由：\n${line}\n架构：本地 JSON 文件\n查过的现成方案：ledger-cli 太重`), ['decision-1:reason'], 'and the reason')
  assert.deepEqual(columns(`${line}\n理由：一个人用\n架构：本地 JSON 文件\n查过的现成方案：ledger-cli 太重`), [], 'it may come first')
  assert.deepEqual(columns('理由：一个人用\n架构：本地 JSON 文件\n查过的现成方案：ledger-cli 太重'), [], 'and it may be left out')
})

test('bigLoopSet: the proposals that are not below a module, the candidates included, in the order they are approved; moduleSet: those below one module', () => {
  const { graph, goal } = splitDesign([
    node({ id: 'task-0', type: 'task', status: 'proposed', parent: 'goal-1', acceptance: ['x'] }, 20),
    node({ id: 'feature-1', type: 'feature', status: 'proposed', parent: 'module-a' }, 21),
    node({ id: 'task-9', type: 'task', status: 'proposed', parent: 'feature-1', acceptance: ['x'] }, 22),
    node({ id: 'decision-old', type: 'decision', status: 'approved', parent: 'goal-1' }, 0),
    node({ id: 'module-c', type: 'feature', status: 'approved', parent: 'goal-1', stage: 'design' }, 23),
    node({ id: 'task-c', type: 'task', status: 'proposed', parent: 'module-c', acceptance: ['x'] }, 24),
  ])
  assert.deepEqual(bigLoopSet(graph, goal).map(entry => entry.id), ['decision-fw', 'norm-directions', 'module-a', 'module-b', 'task-0'], 'a released module\'s own proposals are its own release, and an approved node is not in any set')
  assert.deepEqual(moduleSet(graph, graph.nodes.get('module-a')!).map(entry => entry.id), ['decision-a', 'task-a', 'feature-1', 'task-9'], 'depth first: the parents come before their children')
  assert.deepEqual(moduleSet(graph, graph.nodes.get('module-c')!).map(entry => entry.id), ['task-c'])
  assert.equal(releaseSet(graph, goal).length, 12, 'the whole subtree is the set of a goal that is not split: the 5 of the framework and the 7 below the modules')
})

test('releaseGate of a goal split into modules: the framework, its five columns, the goal-level tasks, the questions outside the modules, the supersessions and the directions', () => {
  const ready = splitDesign()
  const status = stageStatus(ready.graph, ready.goal)
  assert.deepEqual(status.items.map(item => item.key), [
    'framework', 'directions', 'decision-fw:reason', 'decision-fw:architecture', 'decision-fw:acceptance', 'decision-fw:plan', 'decision-fw:non-goals',
  ])
  assert.deepEqual([failing(status.items), status.exitReady], [[], true])
  const gate = (others: readonly GraphNode[], patch: Record<string, Partial<GraphNode>> = {}): string[] => {
    const { graph, goal } = splitDesign(others)
    const changed = graphOf([...graph.nodes.values()].map(entry => patch[entry.id] === undefined ? entry : { ...entry, ...patch[entry.id] }))
    return failing(releaseGate(changed, changed.nodes.get(goal.id)!))
  }
  assert.deepEqual(gate([], { 'decision-fw': { status: 'dropped' } }), ['framework'])
  assert.deepEqual(gate([], { 'decision-fw': { nonGoals: [] } }), ['decision-fw:non-goals'])
  assert.deepEqual(gate([], { 'norm-directions': { status: 'dropped' } }), ['directions'])
  assert.deepEqual(gate([], { 'norm-directions': { acceptance: [] } }), ['directions'], 'a list with no direction in it')
  assert.deepEqual(gate([node({ id: 'task-0', type: 'task', status: 'proposed', parent: 'goal-1' }, 20)]), ['task-0:acceptance'])
  assert.deepEqual(gate([question('question-2', 'goal-1')]), ['question-2:undecided'])
  assert.deepEqual(gate([question('question-2', 'module-a')]), [], 'a question below a module is held for that module\'s release')
  assert.deepEqual(gate([question('question-2', 'module-a')], { 'decision-fw': { edges: [{ type: 'source', to: 'question-2' }] } }), ['question-2:undecided'], 'unless the framework rests on it')
  assert.deepEqual(gate([], { 'module-a': { edges: [{ type: 'supersedes', to: 'module-9' }] } }), ['module-a:supersedes'])
  // The design of a module is not asked for here: a decision of it without its columns does not hold the framework back.
  assert.deepEqual(gate([], { 'decision-a': { nonGoals: [] } }), [])
  // An approved framework decision is the framework: a release put again after the goal was sent back to design needs no new one.
  assert.deepEqual(gate([], { 'decision-fw': { status: 'approved' } }), [])
  assert.match(releaseGate(ready.graph, ready.goal).find(item => item.key === 'directions')!.hint, /norm node with the id norm-directions under the goal/)
})

test('moduleReleaseGate: the framework released, something to release, a decision directly under the module, its five columns, the criteria of its tasks, no question left open below it', () => {
  const at = (stage: 'design' | 'release', patch: Record<string, Partial<GraphNode>> = {}, others: readonly GraphNode[] = []): { graph: ReturnType<typeof graphOf>, goal: GraphNode, module: GraphNode } => {
    const base = splitDesign(others).graph
    const released = [...base.nodes.values()].map((entry): GraphNode => {
      const changed = patch[entry.id] === undefined ? entry : { ...entry, ...patch[entry.id] }
      if (entry.id === 'goal-1') return { ...changed, stage }
      if (entry.id === 'module-a' || entry.id === 'module-b') return { ...changed, status: 'approved', stage: 'design' }
      return changed
    })
    const graph = graphOf(released)
    return { graph, goal: graph.nodes.get('goal-1')!, module: graph.nodes.get('module-a')! }
  }
  const gate = (stage: 'design' | 'release', patch: Record<string, Partial<GraphNode>> = {}, others: readonly GraphNode[] = []): string[] => {
    const { graph, goal, module } = at(stage, patch, others)
    return failing(moduleReleaseGate(graph, goal, module))
  }
  const ready = at('release')
  assert.deepEqual(moduleReleaseGate(ready.graph, ready.goal, ready.module).map(item => item.key), [
    'framework-released', 'changes', 'decision', 'decision-a:reason', 'decision-a:architecture', 'decision-a:acceptance', 'decision-a:plan', 'decision-a:non-goals', 'task-a:acceptance',
  ])
  assert.deepEqual(gate('release'), [])
  assert.deepEqual(gate('design'), ['framework-released'], 'the goal has not released its framework')
  assert.deepEqual(gate('release', { 'decision-a': { nonGoals: [] } }), ['decision-a:non-goals'])
  assert.deepEqual(gate('release', { 'task-a': { acceptance: [] } }), ['task-a:acceptance'])
  assert.deepEqual(gate('release', { 'task-a': { edges: [{ type: 'source', to: 'decision-b' }] } }), ['decision-a:plan'], 'the plan of a decision of the module is below the module')
  assert.deepEqual(gate('release', {}, [question('question-2', 'module-a')]), ['question-2:undecided'])
  assert.deepEqual(gate('release', {}, [question('question-2', 'goal-1')]), [], 'a question of the framework is held for the framework unless the module rests on it')
  assert.deepEqual(gate('release', { 'decision-a': { edges: [{ type: 'source', to: 'question-2' }] } }, [question('question-2', 'goal-1')]), ['question-2:undecided'])
  assert.deepEqual(gate('release', { 'task-a': { edges: [{ type: 'source', to: 'decision-a' }, { type: 'supersedes', to: 'task-9' }] } }), ['task-a:supersedes'])
  // A decision only deeper down is not the module's own design.
  assert.deepEqual(gate('release', { 'decision-a': { parent: 'task-a' } }), ['decision'])
  // Nothing proposed below it: the module has nothing to release, unless its design is approved already (a stop after the approvals) or it was sent back to design.
  const approved = { 'decision-a': { status: 'approved' as const }, 'task-a': { status: 'approved' as const } }
  assert.deepEqual(gate('release', { 'decision-a': { status: 'dropped' }, 'task-a': { status: 'dropped' } }), ['changes', 'decision'])
  assert.deepEqual(gate('release', approved), [], 'the design is approved and waits for the stage only')
  const dropped = { 'decision-a': { status: 'approved' as const }, 'task-a': { status: 'dropped' as const } }
  assert.deepEqual(gate('release', dropped), [])
  const sentBack = at('release', { 'decision-a': { status: 'dropped' }, 'task-a': { status: 'dropped' }, 'module-a': { history: [...splitDesign().graph.nodes.get('module-a')!.history, stageEdit(9, 'release', 'design')] } })
  assert.deepEqual(failing(moduleReleaseGate(sentBack.graph, sentBack.goal, sentBack.module)), ['decision'], 'sent back to design: something to release, but the module still needs its decision')
})

test('stageStatus of a goal split into modules in design: the gate is the framework\'s, not the single level\'s, and a goal with a plain task and no feature is still the single level\'s', () => {
  const split = splitDesign()
  assert.equal(stageStatus(split.graph, split.goal).items[0].key, 'framework')
  assert.equal(stageStatus(design().graph, design().goal).items[0].key, 'decision')
})