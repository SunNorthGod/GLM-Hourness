import assert from 'node:assert/strict'
import test from 'node:test'
import type { LiveView } from '../src/graph/live.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import { FLOW_ORDER, FLOW_TEXT, flowBarText, isCheapModel, type FlowBarInput } from '../ui/src/flow/model.ts'
import type { GraphSnapshot } from '../ui/src/graph/source.ts'
import { node, readySnapshot } from './ui-fixtures.ts'

const INTERVIEW_BODY = '需求：每天记一下花了多少钱\n问题：月底不知道钱花在哪\n给谁：我自己\n约束：无'
const COLUMNS_BODY = '理由：想少做一次\n架构：一个脚本\n查过的现成方案：没有合适的'

/** The live view of a main agent that is between turns; `recent` holds the tool results the fold keeps. */
function liveAt(fields: Partial<LiveView> = {}): LiveView {
  return { focus: 'goal-1', model: null, turnSince: null, steps: 0, tool: null, recent: [], ...fields }
}

const HANDED_OVER: LiveView['recent'] = [{ name: 'propose_to_human', at: 1, ok: true }]

function barOf(graph: GraphSnapshot, live: LiveView | undefined, extra: Partial<FlowBarInput> = {}): ReturnType<typeof flowBarText> {
  return flowBarText({ main: true, live, graph, cheapModel: false, ...extra })
}

/** The line of a bar that has to exist. */
function lineOf(graph: GraphSnapshot, live: LiveView = liveAt()): string | undefined {
  return barOf(graph, live)?.line
}

function goal(fields: Partial<GraphNode> = {}): GraphNode {
  return node('goal-1', 'goal', { title: '记账小工具', ...fields })
}

/** A proposed design decision with the given sections filled: reason and architecture in the body, non-goals as a field. */
function decision(id: string, fields: Partial<GraphNode>): GraphNode {
  return node(id, 'decision', { parent: 'goal-1', status: 'proposed', ...fields })
}

test('isCheapModel: a whole word of flash, mini, lite, haiku, small or nano in the lower-cased id', () => {
  for (const id of ['GLM-5.3-Flash', 'gpt-4o-mini', 'claude-3-5-haiku', 'gemini-2.0-flash-lite', 'models/gemini_2.5_flash', 'vendor:Nano', 'a small one', 'SMALL']) {
    assert.equal(isCheapModel(id), true, id)
  }
  for (const id of ['GLM-5.3', 'gemini-2.5-pro', 'deepseek-chat', '', 'gemini', 'minimax-m2', 'flashy-1', 'smaller', 'glm-5.3-flashing']) {
    assert.equal(isCheapModel(id), false, id)
  }
})

test('isCheapModel: a value that is not a string is not a small model', () => {
  for (const value of [undefined, null, 5, true, {}, ['flash'], Symbol('flash')]) assert.equal(isCheapModel(value), false, String(typeof value))
})

test('the bar sits behind DSH\'s queue strip (20) and ahead of the /wish card (40)', () => {
  assert.equal(FLOW_ORDER, 30)
})

test('a session that is not the main agent\'s gets no bar, whatever the graph and the live view say', () => {
  const graph = readySnapshot(goal())
  assert.equal(flowBarText({ main: false, live: liveAt({ model: 'GLM-5.3-Flash' }), graph, cheapModel: true }), null)
  assert.equal(flowBarText({ main: false, live: undefined, graph: { status: 'loading' }, cheapModel: false }), null)
})

test('without the graphLive projection the bar says the stage cannot be read and why, and names the row to enable', () => {
  const result = flowBarText({ main: true, live: undefined, graph: readySnapshot(goal()), cheapModel: true })
  assert.deepEqual(result, { line: '主 Agent · 读不到阶段（项目图面板 glm-hourness/graph-panel 没有启用）', waiting: false, modelNote: null })
  assert.doesNotMatch(FLOW_TEXT.stageUnreadable, /现场投影未注册/)
})

test('while the graph is not readable the bar says so, one line each for loading, no graph and a failed read', () => {
  assert.equal(lineOf({ status: 'loading' }), '主 Agent · 读取项目图中')
  assert.equal(lineOf({ status: 'missing' }), '主 Agent · 这个工作区还没有项目图')
  assert.equal(lineOf({ status: 'failed', message: 'boom' }), '主 Agent · 读不到项目图')
})

test('no focus, a focus that is not on the graph, or a focus with no goal above it: still no goal', () => {
  const graph = readySnapshot(goal(), node('feature-x', 'feature'))
  assert.equal(lineOf(graph, liveAt({ focus: null })), '主 Agent · 还没有目标')
  assert.equal(lineOf(graph, liveAt({ focus: 'task-99' })), '主 Agent · 还没有目标')
  assert.equal(lineOf(graph, liveAt({ focus: 'feature-x' })), '主 Agent · 还没有目标')
})

test('the goal is the focus itself or the nearest goal above it', () => {
  const graph = readySnapshot(goal({ status: 'proposed', stage: 'interview', body: INTERVIEW_BODY }), node('feature-1', 'feature', { parent: 'goal-1' }), node('task-1', 'task', { parent: 'feature-1' }))
  for (const focus of ['goal-1', 'feature-1', 'task-1']) assert.equal(lineOf(graph, liveAt({ focus })), '主 Agent · 访谈 · 需求卡 4/8', focus)
})

test('wish and interview show the requirement card: items filled of 8', () => {
  assert.equal(lineOf(readySnapshot(goal({ status: 'proposed' }))), '主 Agent · 许愿 · 需求卡 0/8')
  const interview = goal({ status: 'proposed', stage: 'interview', body: INTERVIEW_BODY, acceptance: ['月底能看出钱花在哪'] })
  assert.equal(lineOf(readySnapshot(interview)), '主 Agent · 访谈 · 需求卡 5/8')
  // A stage the LLM wrote on its own proposal does not count: the proposal is in the interview whatever it names.
  assert.equal(lineOf(readySnapshot(goal({ status: 'proposed', stage: 'release' }))), '主 Agent · 访谈 · 需求卡 0/8')
})

test('design shows the five columns of the decision that has the fewest filled, whatever the order of the decisions', () => {
  const approved = { stage: 'design' } as const
  const three = { body: COLUMNS_BODY, nonGoals: ['不做多人'] }
  const one = { body: '理由：x' }
  assert.equal(lineOf(readySnapshot(goal(approved), decision('decision-1', three))), '主 Agent · 设计 · 五栏 3/5')
  assert.equal(lineOf(readySnapshot(goal(approved), decision('decision-1', three), decision('decision-2', one))), '主 Agent · 设计 · 五栏 1/5')
  assert.equal(lineOf(readySnapshot(goal(approved), decision('decision-1', one), decision('decision-2', three))), '主 Agent · 设计 · 五栏 1/5')
  // Only decisions in the release set count; a decision already approved is not part of it.
  assert.equal(lineOf(readySnapshot(goal(approved), decision('decision-1', three), decision('decision-2', { status: 'approved' }))), '主 Agent · 设计 · 五栏 3/5')
})

test('design with no decision yet says so instead of a count', () => {
  assert.equal(lineOf(readySnapshot(goal({ stage: 'design' }))), '主 Agent · 设计 · 还没有设计决策')
})

test('a released goal says so; a goal that does not run the design loop shows its title; a later stage shows its name', () => {
  assert.equal(lineOf(readySnapshot(goal({ stage: 'release' }))), '主 Agent · 已放行')
  assert.equal(lineOf(readySnapshot(goal())), '主 Agent · 记账小工具')
  assert.equal(lineOf(readySnapshot(goal({ stage: 'execute' }))), '主 Agent · 执行')
})

test('a closed goal shows its title and says closed, for done, dropped and superseded', () => {
  for (const status of ['done', 'dropped', 'superseded'] as const) {
    assert.equal(lineOf(readySnapshot(goal({ status, stage: 'release' }))), '主 Agent · 记账小工具（已关闭）', status)
  }
})

test('the main agent waits for the human when it handed something over and its turn is over: the stage says for what', () => {
  const interview = readySnapshot(goal({ status: 'proposed', stage: 'interview', body: INTERVIEW_BODY }))
  const design = readySnapshot(goal({ stage: 'design' }), decision('decision-1', { body: COLUMNS_BODY }))
  assert.deepEqual(barOf(interview, liveAt({ recent: HANDED_OVER })), { line: '主 Agent · 访谈 · 需求卡 4/8 · 等你确认', waiting: true, modelNote: null })
  assert.equal(lineOf(readySnapshot(goal({ status: 'proposed' })), liveAt({ recent: HANDED_OVER })), '主 Agent · 许愿 · 需求卡 0/8 · 等你确认')
  assert.deepEqual(barOf(design, liveAt({ recent: HANDED_OVER })), { line: '主 Agent · 设计 · 五栏 2/5 · 等你批准', waiting: true, modelNote: null })
})

test('a question waiting for the human turns the wait into 等你拍板, whatever the stage', () => {
  const question = node('question-1', 'question', { parent: 'goal-1' })
  const interview = readySnapshot(goal({ status: 'proposed', stage: 'interview' }), question)
  const design = readySnapshot(goal({ stage: 'design' }), question)
  assert.equal(lineOf(interview, liveAt({ recent: HANDED_OVER })), '主 Agent · 访谈 · 需求卡 0/8 · 等你拍板')
  assert.equal(lineOf(design, liveAt({ recent: HANDED_OVER })), '主 Agent · 设计 · 还没有设计决策 · 等你拍板')
})

test('no wait while the turn is open, when the last tool result is another tool\'s or a failed hand-over, or when nothing came back yet', () => {
  const graph = readySnapshot(goal({ status: 'proposed', stage: 'interview' }))
  const quiet = '主 Agent · 访谈 · 需求卡 0/8'
  assert.equal(lineOf(graph, liveAt({ recent: HANDED_OVER, turnSince: 5 })), quiet, 'the turn is open')
  assert.equal(lineOf(graph, liveAt({ recent: [...HANDED_OVER, { name: 'record_human_answer', at: 2, ok: true }] })), quiet, 'the human answered and it recorded it')
  assert.equal(lineOf(graph, liveAt({ recent: [{ name: 'propose_to_human', at: 1, ok: false }] })), quiet, 'the hand-over was refused')
  assert.equal(lineOf(graph, liveAt({ recent: [] })), quiet, 'no tool result yet')
  assert.equal(barOf(graph, liveAt({ recent: HANDED_OVER, turnSince: 5 }))?.waiting, false)
})

test('a released goal and a goal outside the design loop show no wait without a question waiting', () => {
  assert.equal(lineOf(readySnapshot(goal({ stage: 'release' })), liveAt({ recent: HANDED_OVER })), '主 Agent · 已放行')
  assert.equal(lineOf(readySnapshot(goal()), liveAt({ recent: HANDED_OVER })), '主 Agent · 记账小工具')
})

test('questions waiting for the human are counted when the main agent is not itself waiting; the agent\'s own and the settled ones are not', () => {
  const waiting = [node('question-1', 'question', { parent: 'goal-1' }), node('question-2', 'question', { parent: 'goal-1', status: 'doing' })]
  const others = [node('question-3', 'question', { parent: 'goal-1', decider: 'agent' }), node('question-4', 'question', { parent: 'goal-1', status: 'done' })]
  const result = barOf(readySnapshot(goal({ stage: 'release' }), ...waiting, ...others), liveAt())
  assert.deepEqual(result, { line: '主 Agent · 已放行 · 待你拍板 2', waiting: true, modelNote: null })
  assert.equal(lineOf(readySnapshot(goal({ stage: 'release' }), ...others)), '主 Agent · 已放行')
})

test('a closed goal shows no wait and no count', () => {
  const graph = readySnapshot(goal({ status: 'done' }), node('question-1', 'question', { parent: 'goal-1' }))
  assert.equal(lineOf(graph, liveAt({ recent: HANDED_OVER })), '主 Agent · 记账小工具（已关闭）')
})

test('the stronger-model note is a second line of its own: the model named, only when asked for and known', () => {
  const graph = readySnapshot(goal({ stage: 'release' }))
  const flash = liveAt({ model: 'GLM-5.3-Flash' })
  assert.deepEqual(barOf(graph, flash, { cheapModel: true }), { line: '主 Agent · 已放行', waiting: false, modelNote: '现在是 GLM-5.3-Flash；主 Agent 建议换强一点的模型' })
  assert.equal(barOf(graph, flash, { cheapModel: false })?.modelNote, null, 'dismissed or not a small model')
  assert.equal(barOf(graph, liveAt({ model: null }), { cheapModel: true })?.modelNote, null, 'no model seen yet')
})

test('the stronger-model note follows the bar into every graph state that has a live view', () => {
  const flash = liveAt({ model: 'GLM-5.3-Flash' })
  const note = '现在是 GLM-5.3-Flash；主 Agent 建议换强一点的模型'
  for (const graph of [{ status: 'loading' }, { status: 'missing' }, { status: 'failed', message: 'x' }, readySnapshot(), readySnapshot(goal({ status: 'done' }))] as const) {
    assert.equal(barOf(graph, flash, { cheapModel: true })?.modelNote, note, graph.status)
  }
})

test('the dismissal of the note reads 这次就用它', () => {
  assert.equal(FLOW_TEXT.dismiss, '这次就用它')
})
