import assert from 'node:assert/strict'
import test from 'node:test'
import { STAGE_LABELS } from '../src/graph/labels.ts'
import { plainWordsIn } from '../src/graph/plain-question.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import { FLOW_ORDER, FLOW_TEXT } from '../ui/src/flow/model.ts'
import {
  CARD_ORDER,
  NARROW_BELOW_PX,
  PILL_ORDER,
  WISH_COMMAND,
  WISH_DRAFT,
  WISH_OFF_COMMAND,
  WISH_TEXT,
  afterRead,
  cardActions,
  cardMode,
  draftPlan,
  fullCardBlocks,
  hasGraph,
  hasOpenGoal,
  isBlankSession,
  outcomeOf,
  pillLabel,
  pillShown,
  shouldReadCommands,
  type CardFacts,
  type CardMode,
  type CommandsRead,
  type ExecuteResult,
} from '../ui/src/wish/model.ts'
import { node, readySnapshot } from './ui-fixtures.ts'

type TextTable = Readonly<Record<string, string | ((...args: never[]) => string)>>

/** Every string a text table shows: the fixed ones, and each function's result for sample arguments. */
function shownBy(table: TextTable): string[] {
  return Object.values(table).map(value => typeof value === 'string' ? value : (value as (...args: unknown[]) => string)('示例', 2))
}

/** Every string of the entry a human reads. */
function humanStrings(): string[] {
  return shownBy(WISH_TEXT)
}

function facts(fields: Partial<CardFacts> = {}): CardFacts {
  return { blank: true, main: false, graph: true, wishRegistered: true, ...fields }
}

test('the card shows in full for a blank, ordinary session of a workspace with a graph and /wish registered', () => {
  assert.equal(cardMode(facts()), 'full')
})

test('a blank session that already is the main agent shows the exit line, whether or not /wish is listed', () => {
  assert.equal(cardMode(facts({ main: true })), 'exit')
  assert.equal(cardMode(facts({ main: true, wishRegistered: false })), 'exit')
})

test('the card shows nothing for a session that has started, a workspace without a graph, or /wish not registered', () => {
  assert.equal(cardMode(facts({ blank: false })), null)
  assert.equal(cardMode(facts({ blank: false, main: true })), null)
  assert.equal(cardMode(facts({ graph: false })), null)
  assert.equal(cardMode(facts({ graph: false, main: true })), null)
  assert.equal(cardMode(facts({ wishRegistered: false })), null)
})

test('cardMode over all sixteen combinations: only a blank session with a graph shows anything, and the main agent decides which', () => {
  const bools = [false, true]
  for (const blank of bools) for (const main of bools) for (const graph of bools) for (const wishRegistered of bools) {
    const expected: CardMode = !blank || !graph ? null : main ? 'exit' : wishRegistered ? 'full' : null
    assert.equal(cardMode({ blank, main, graph, wishRegistered }), expected, JSON.stringify({ blank, main, graph, wishRegistered }))
  }
})

test('a session is blank by the standard prop when nothing was sent, attempted or is running; by the session list when the prop is missing', () => {
  const flags = (blank: boolean | undefined, promptAttempted?: boolean, running?: boolean) => ({ blank, promptAttempted, running })
  assert.equal(isBlankSession(flags(true), false), true, 'the prop wins over the list')
  assert.equal(isBlankSession(flags(true, false, false), undefined), true)
  assert.equal(isBlankSession(flags(true, true), true), false, 'a prompt was attempted')
  assert.equal(isBlankSession(flags(true, false, true), true), false, 'something is running')
  assert.equal(isBlankSession(flags(false), true), false)
  assert.equal(isBlankSession(undefined, true), true, 'no prop: the list says blank')
  assert.equal(isBlankSession(undefined, false), false)
  assert.equal(isBlankSession(undefined, undefined), false, 'neither says: not blank')
  assert.equal(isBlankSession(flags(undefined), true), true, 'the prop has no snapshot yet: the list answers')
  assert.equal(isBlankSession(flags(undefined), undefined), false)
})

test('the workspace has a graph once its nodes were read, and not while loading, missing, failed or not held', () => {
  assert.equal(hasGraph(readySnapshot()), true)
  assert.equal(hasGraph({ status: 'loading' }), false)
  assert.equal(hasGraph({ status: 'missing' }), false)
  assert.equal(hasGraph({ status: 'failed', message: 'x' }), false)
  assert.equal(hasGraph(undefined), false)
})

test('a goal is open while it is proposed, approved or doing; only then is there something to continue', () => {
  const only = (...nodes: GraphNode[]): boolean => hasOpenGoal(readySnapshot(...nodes).graph)
  for (const status of ['proposed', 'approved', 'doing'] as const) assert.equal(only(node('goal-1', 'goal', { status })), true, status)
  for (const status of ['done', 'dropped', 'superseded'] as const) assert.equal(only(node('goal-1', 'goal', { status })), false, status)
  assert.equal(only(node('feature-1', 'feature')), false, 'a feature is not a goal')
  assert.equal(only(), false, 'an empty graph')
  assert.equal(only(node('goal-1', 'goal', { status: 'done' }), node('goal-2', 'goal')), true, 'one open goal among closed ones')
})

test('the card has its first button always and the resume button only while a goal is open', () => {
  assert.deepEqual(cardActions(true), ['start', 'resume'])
  assert.deepEqual(cardActions(false), ['start'])
})

test('the full card ends with the first-visit line when that component is in the build, and has none otherwise', () => {
  assert.deepEqual(fullCardBlocks(false), ['title', 'body', 'actions', 'strong', 'hint'])
  assert.deepEqual(fullCardBlocks(true), ['title', 'body', 'actions', 'strong', 'hint', 'first-visit-line'])
  assert.equal(fullCardBlocks(true).at(-1), 'first-visit-line')
})

test('the button under the composer reads 交给主 Agent in an ordinary session and 主 Agent in the main agent\'s', () => {
  assert.equal(pillLabel(false, 800), '交给主 Agent')
  assert.equal(pillLabel(false, undefined), '交给主 Agent', 'not measured yet')
  assert.equal(pillLabel(true, 800), '主 Agent')
})

test('a row narrower than 520 px shortens the first label to /wish and leaves the second alone', () => {
  assert.equal(NARROW_BELOW_PX, 520)
  assert.equal(pillLabel(false, NARROW_BELOW_PX - 1), '/wish')
  assert.equal(pillLabel(false, NARROW_BELOW_PX), '交给主 Agent', '520 px is not narrower than 520 px')
  assert.equal(pillLabel(false, 0), '/wish')
  assert.equal(pillLabel(true, NARROW_BELOW_PX - 1), '主 Agent')
})

test('the button under the composer shows in the main agent\'s session always, and in an ordinary one with a graph and /wish registered', () => {
  assert.equal(pillShown({ main: true, graph: false, wishRegistered: false }), true)
  assert.equal(pillShown({ main: false, graph: true, wishRegistered: true }), true)
  assert.equal(pillShown({ main: false, graph: false, wishRegistered: true }), false)
  assert.equal(pillShown({ main: false, graph: true, wishRegistered: false }), false)
})

test('the first button writes /wish into an empty draft, leaves a draft with text alone, and falls back to copying without the input', () => {
  assert.deepEqual(['', '  ', '\n'].map(draft => draftPlan({ inputActions: true, draft })), ['write', 'write', 'write'])
  assert.deepEqual(['/wish', '想要一个小工具', ' x '].map(draft => draftPlan({ inputActions: true, draft })), ['keep', 'keep', 'keep'])
  assert.equal(draftPlan({ inputActions: false, draft: '' }), 'copy', 'no setter')
  assert.equal(draftPlan({ inputActions: true, draft: undefined }), 'copy', 'no input source')
  assert.equal(draftPlan({ inputActions: false, draft: undefined }), 'copy')
  assert.equal(WISH_DRAFT, `${WISH_COMMAND} `)
})

test('the commands the buttons send are /wish and /wish off', () => {
  assert.equal(WISH_COMMAND, '/wish')
  assert.equal(WISH_OFF_COMMAND, '/wish off')
})

test('a /wish click tells the human what the command said, or why it did not run', () => {
  const results: readonly [ExecuteResult, { ok: boolean, text: string }][] = [
    [{ ok: true, value: { result: { kind: 'success', text: '已让这个会话的 agent 当主 Agent' } } }, { ok: true, text: '已让这个会话的 agent 当主 Agent' }],
    [{ ok: true, value: { result: { kind: 'success' } } }, { ok: true, text: '' }],
    [{ ok: true, value: { result: { kind: 'error', text: '主 Agent 在另一个会话里' } } }, { ok: false, text: '主 Agent 在另一个会话里' }],
    [{ ok: true, value: { result: { kind: 'error' } } }, { ok: false, text: '命令没有执行' }],
    [{ ok: true, value: undefined }, { ok: false, text: '这个会话里没有 /wish 命令' }],
    [{ ok: false, error: { message: '连不上' } }, { ok: false, text: '命令没有执行：连不上' }],
  ]
  for (const [result, expected] of results) assert.deepEqual(outcomeOf(result), expected, JSON.stringify(result))
})

test('the command list is read once per session; a failed read is read once more after the session list changed, and no more', () => {
  const found = afterRead(undefined, ['help', 'wish'])
  assert.deepEqual(found, { state: 'done', registered: true })
  assert.deepEqual(afterRead(undefined, ['help']), { state: 'done', registered: false })
  assert.equal(shouldReadCommands(undefined, false), true, 'nothing read yet')
  assert.equal(shouldReadCommands(found, true), false, 'a finished read is final, whatever changed')
  assert.equal(shouldReadCommands({ state: 'done', registered: false }, true), false)
  const first: CommandsRead = afterRead(undefined, undefined)
  assert.deepEqual(first, { state: 'failed', retried: false })
  assert.equal(shouldReadCommands(first, false), false, 'a failure waits for a change')
  assert.equal(shouldReadCommands(first, true), true)
  const second: CommandsRead = afterRead(first, undefined)
  assert.deepEqual(second, { state: 'failed', retried: true })
  assert.equal(shouldReadCommands(second, true), false, 'the second failure is final')
  assert.deepEqual(afterRead(first, ['wish']), { state: 'done', registered: true }, 'the retry succeeded')
})

test('the card, the popover and the exit line say what the addendum says', () => {
  assert.equal(WISH_TEXT.cardTitle, '把这个工作区交给主 Agent')
  assert.equal(WISH_TEXT.cardBody, '说一句你想做的。主 Agent 先问清楚、出方案给你批，再分给子 agent 去做；它自己不写代码。')
  assert.equal(WISH_TEXT.start, '写一句你想做的')
  assert.equal(WISH_TEXT.resume, '接着推进现有项目')
  assert.equal(WISH_TEXT.commandHint, '命令是 /wish，随时 /wish off 退出。')
  assert.equal(WISH_TEXT.alreadyMain, '这个会话的 agent 是主 Agent')
  assert.equal(WISH_TEXT.exit, '退出主 Agent（/wish off）')
  assert.equal(WISH_TEXT.popoverOrdinary, '让主 Agent 接手这个工作区：它按项目图推进，自己不写代码。')
  assert.equal(WISH_TEXT.popoverMain, '这个会话的 agent 是这个项目的主 Agent：按项目图推进，不写文件。进度在右边的项目图里。')
  assert.equal(WISH_TEXT.draftBusy, '输入框里还有没发出的字')
  assert.equal(WISH_TEXT.copyHelp, '在输入框打 /wish，后面跟一句你想做的')
  assert.equal(WISH_TEXT.copy, '复制 /wish')
})

test('the yellow line is 主 Agent 用强一点的模型 and names no model and no cheap one', () => {
  assert.equal(WISH_TEXT.strongModel, '主 Agent 用强一点的模型')
  for (const text of humanStrings()) {
    assert.doesNotMatch(text, /便宜/, text)
    assert.doesNotMatch(text, /glm|gpt|claude|gemini|deepseek|haiku|flash|mini|lite|nano/i, text)
  }
})

test('every string the human reads on the entry and on the flow bar is free of the words d-plain-questions replaces', () => {
  // The two models hold all the text of the entry and the bar (the components have none); the bar takes its stage names from STAGE_LABELS.
  const shown = [...humanStrings(), ...shownBy(FLOW_TEXT), ...Object.values(STAGE_LABELS)]
  assert.ok(shown.includes(WISH_TEXT.cardTitle) && shown.includes(FLOW_TEXT.noGoal) && shown.includes(STAGE_LABELS.interview), 'the sweep reaches both tables and the stage names')
  for (const text of shown) assert.deepEqual(plainWordsIn(text), [], text)
})

test('the entry sits behind the flow bar (30) in the dock above the input, and behind the GLM button (150) under the composer', () => {
  assert.equal(CARD_ORDER, 40)
  assert.ok(CARD_ORDER > FLOW_ORDER)
  assert.equal(PILL_ORDER, 160)
  assert.ok(PILL_ORDER > 150)
})
