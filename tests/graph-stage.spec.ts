import assert from 'node:assert/strict'
import test from 'node:test'
import type { LoadedGraph } from '../src/graph/parse.ts'
import type { Actor, GraphNode, HistoryEntry, Status } from '../src/graph/schema.ts'
import {
  designColumns,
  effectiveStage,
  goalOf,
  labeledSections,
  releaseSet,
  requirementCard,
  stageStatus,
  type GateItem,
  type StageStatus,
} from '../src/graph/stage.ts'

type Fields = Omit<Partial<GraphNode>, 'history'> & Pick<GraphNode, 'id' | 'type'>

/** A history time, second `n` of one minute. */
function at(n: number): string {
  return `2026-10-29T08:00:${String(n).padStart(2, '0')}.000Z`
}

function proposed(actor: Actor, n: number, to: Status): HistoryEntry {
  return { at: at(n), actor, op: 'propose', reason: '测试', to }
}

/** A node proposed by `actor` at second `n`; extra history entries follow the propose. */
function node(fields: Fields, n = 0, actor: Actor = 'llm', extra: readonly HistoryEntry[] = []): GraphNode {
  const status = fields.status ?? 'approved'
  return { title: fields.id, ...fields, status, history: [proposed(actor, n, status), ...extra] }
}

function graphOf(nodes: readonly GraphNode[]): LoadedGraph {
  return { nodes: new Map(nodes.map(entry => [entry.id, entry])), revisions: new Map(nodes.map(entry => [entry.id, 'rev'])), revision: 'rev', issues: [] }
}

function decide(actor: Actor, n: number, option: string, relay?: string): HistoryEntry {
  return { at: at(n), actor, op: 'decide', reason: '定', from: 'approved', to: 'done', option, evidence: [{ kind: 'decision', ref: option }], ...(relay === undefined ? {} : { relay }) }
}

const OPTIONS = [{ key: 'A', label: '甲', consequence: '快' }, { key: 'B', label: '乙', consequence: '稳' }]

function question(id: string, parent: string, fields: Partial<GraphNode> = {}, extra: readonly HistoryEntry[] = []): GraphNode {
  return node({ id, type: 'question', parent, options: OPTIONS, recommend: 'B', ...fields }, 1, 'llm', extra)
}

const GOAL_BODY = '需求：我想要一个命令行小工具，每天记一下花了多少钱\n问题：月底不知道钱花在哪\n给谁：本人\n约束：无'

/** A goal in the interview whose requirement card is complete: body labels, acceptance, non-goals, a risk and a choice the human made. */
function interview(goal: Partial<GraphNode> = {}, others: readonly GraphNode[] = []): { readonly graph: LoadedGraph, readonly goal: GraphNode } {
  const root = node({ id: 'goal-1', type: 'goal', status: 'proposed', stage: 'interview', body: GOAL_BODY, acceptance: ['月底能看出钱花在哪'], nonGoals: ['不做多人共享'], ...goal })
  const graph = graphOf([
    root,
    node({ id: 'risk-1', type: 'risk', parent: 'goal-1' }),
    question('question-1', 'goal-1', { status: 'done', decision: 'B' }, [decide('human', 5, 'B')]),
    ...others,
  ])
  return { graph, goal: graph.nodes.get('goal-1')! }
}

function failing(items: readonly GateItem[]): string[] {
  return items.filter(item => !item.ok).map(item => item.key)
}

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

test('requirementCard: 8 items, each one missing on its own', () => {
  const complete = interview()
  assert.deepEqual(requirementCard(complete.graph, complete.goal).map(item => [item.key, item.ok]), [
    ['need', true], ['problem', true], ['audience', true], ['constraints', true], ['acceptance', true], ['non-goals', true], ['risks', true], ['choice', true],
  ])
  for (const item of requirementCard(complete.graph, complete.goal)) {
    assert.ok(item.label.length > 0 && item.hint.length > 0, item.key)
  }
  const without = (label: string): string => GOAL_BODY.split('\n').filter(line => !line.startsWith(label)).join('\n')
  const cases: ReadonlyArray<readonly [string, Partial<GraphNode>]> = [
    ['need', { body: without('需求') }],
    ['problem', { body: without('问题') }],
    ['audience', { body: without('给谁') }],
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

/** A goal in design with one complete design decision, its plan and a decided fork. */
function design(decision: Partial<GraphNode> = {}, others: readonly GraphNode[] = []): { readonly graph: LoadedGraph, readonly goal: GraphNode } {
  const graph = graphOf([
    node({ id: 'goal-1', type: 'goal', status: 'approved', stage: 'design', body: GOAL_BODY, acceptance: ['a'], nonGoals: ['n'] }, 0, 'human'),
    question('question-1', 'goal-1', { status: 'done', decision: 'B' }, [decide('human', 2, 'B')]),
    node({
      id: 'decision-1', type: 'decision', status: 'proposed', parent: 'goal-1', verification: 'unverified',
      body: '理由：一个人用，不要服务端\n架构：本地 JSON 文件\n查过的现成方案：ledger-cli 太重',
      acceptance: ['月底出一张分类表'], nonGoals: ['不做同步'], edges: [{ type: 'source', to: 'question-1' }], ...decision,
    }, 3),
    node({ id: 'feature-1', type: 'feature', status: 'proposed', parent: 'goal-1', edges: [{ type: 'source', to: 'decision-1' }] }, 4),
    node({ id: 'task-1', type: 'task', status: 'proposed', parent: 'feature-1', acceptance: ['记一条能读回'] }, 5),
    ...others,
  ])
  return { graph, goal: graph.nodes.get('goal-1')! }
}

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
    const changed = graphOf([...graph.nodes.values()].map(entry => entry.id === 'feature-1' ? { ...entry, ...feature } : entry))
    return failing(designColumns(changed, goal, changed.nodes.get('decision-1')!))
  }
  assert.deepEqual(unplanned({ edges: [] }), ['decision-1:plan'])
  assert.deepEqual(unplanned({ status: 'dropped' }), ['decision-1:plan'])
  assert.deepEqual(unplanned({ parent: 'goal-2' }), ['decision-1:plan'], 'a node outside the goal is not its plan')
})

test('releaseSet: the proposed nodes under the goal by depth, creation time and id; parents before children', () => {
  const { graph, goal } = design({}, [
    node({ id: 'task-0', type: 'task', status: 'proposed', parent: 'feature-1', acceptance: ['x'] }, 5),
    node({ id: 'risk-1', type: 'risk', status: 'proposed', parent: 'goal-1' }, 1),
    node({ id: 'task-2', type: 'task', status: 'approved', parent: 'feature-1' }, 6),
    node({ id: 'goal-2', type: 'goal', status: 'proposed' }, 0),
    node({ id: 'feature-9', type: 'feature', status: 'proposed', parent: 'goal-2' }, 0),
  ])
  assert.deepEqual(releaseSet(graph, goal).map(entry => entry.id), ['risk-1', 'decision-1', 'feature-1', 'task-0', 'task-1'])
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
  const human = blocked([question('question-2', 'feature-1')])
  assert.deepEqual([failing(human.items), human.exitReady, human.waitingHuman], [['question-2:undecided'], false, 1])
  const agent = blocked([question('question-3', 'goal-1', { decider: 'agent' })])
  assert.deepEqual([failing(agent.items), agent.waitingHuman], [['question-3:undecided'], 0], 'an undecided question blocks whoever decides it')
  assert.match(agent.items.find(item => item.key === 'question-3:undecided')!.hint, /graph_decide/)
  assert.deepEqual(failing(blocked([node({ id: 'task-3', type: 'task', status: 'proposed', parent: 'feature-1' }, 7)]).items), ['task-3:acceptance'])
  assert.deepEqual(failing(blocked([node({ id: 'task-4', type: 'task', status: 'proposed', parent: 'feature-1', acceptance: ['y'], edges: [{ type: 'supersedes', to: 'task-9' }] }, 7)]).items), ['task-4:supersedes'])
  const noDecision = blocked([], { status: 'approved' })
  assert.deepEqual([failing(noDecision.items), noDecision.exitReady], [['decision'], false], 'an adopted decision is not in the release set')
})

test('stageStatus in wish and interview: the requirement card plus the confirmation gate on a superseding goal', () => {
  const complete = interview()
  const status = stageStatus(complete.graph, complete.goal)
  assert.deepEqual([status.stage, status.exitReady, status.items.length], ['interview', true, 8])
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
