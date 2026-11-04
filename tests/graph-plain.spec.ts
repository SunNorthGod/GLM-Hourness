/**
 * The writing check (src/graph/plain.ts, plain-ui 1.3 §5.3, §10.1): each
 * rule's hits and misses on the design's examples, which fields of which
 * nodes are read, the length limits in code points, the why field on read
 * and write, and the reading notices on open nodes only. The engine's
 * warnings and the second phase are in tests/graph-engine.spec.ts.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { serializeNode } from '../src/graph/format.ts'
import { parseGraph } from '../src/graph/parse.ts'
import { nodePlainIssues, plainIssues, plainNotices } from '../src/graph/plain.ts'
import { PLAIN_LIMITS, type GraphNode } from '../src/graph/schema.ts'
import { at } from './execute-helpers.ts'

const IDS: ReadonlySet<string> = new Set(['m3-1', 'question-17', 'split', 'goal-1', 'task-1'])

/** The rules a text breaks, by name. */
const rules = (text: string, field: Parameters<typeof plainIssues>[1] = 'title'): string[] => plainIssues(text, field, IDS).map(found => found.rule)

const node = (fields: Partial<GraphNode> & Pick<GraphNode, 'id' | 'type'>): GraphNode =>
  ({ title: '记账', status: 'approved', parent: 'goal-1', history: [{ at: at(0), actor: 'llm', op: 'propose', reason: '测试', to: fields.status ?? 'approved' }], ...fields })

test('code: milestone, leading section and finding numbers; a number followed by a unit is not one', () => {
  for (const text of ['M3 设计循环', '照 M8.1 做', '3.1 主 Agent 接手', '见 §4', '见 § 4', '修掉（V-01）', 'F-29 的修法']) assert.deepEqual(rules(text), ['code'], text)
  for (const text of ['1.5 倍用量', '2.5 小时', '1.5 x 更快', 'GLM-5.3 的上手', 'P11-03 之后', '3.1主 Agent']) assert.deepEqual(rules(text), [], text)
})

test('id: an id of the graph that has a digit or a hyphen, standing alone', () => {
  assert.deepEqual(rules('跟 m3-1 一起'), ['id'])
  assert.deepEqual(rules('question-17 定了'), ['id'])
  assert.deepEqual(rules('（task-1）'), ['id'])
  for (const text of ['先 split 再说', 'xm3-1 不是', 'm3-12 不在图上', 'm3-1x']) assert.deepEqual(rules(text), [], text)
})

test('identifier: backticks, snake and camel case, file names; product names and commands are not code', () => {
  for (const text of ['调 graph_focus', '读 graphLive', '`做`', '改 panel-row.ts', '读 package.json', '写 a.yml']) assert.deepEqual(rules(text), ['identifier'], text)
  for (const text of ['在对话里发 /wish', 'ZCode 的身份', 'GLM-5.3 能用', '装 dsh-glm-zcode', 'macOS 与 iOS', 'iPhone 上看', 'iPad 与 iPadOS']) assert.deepEqual(rules(text), [], text)
})

test('enum and term: engine status words as whole words, the internal words; 投影 is jargon only', () => {
  assert.deepEqual(rules('status doing'), ['enum'])
  assert.deepEqual(rules('一个 one-way 的选择'), ['enum'])
  assert.deepEqual(rules('Done 了'), ['enum'])
  assert.deepEqual(rules('undone 不算'), [])
  assert.deepEqual(rules('给这个节点改名'), ['term'])
  assert.deepEqual(rules('待决的推荐项'), ['term'])
  assert.deepEqual(rules('每一步的投影'), ['jargon'])
  assert.match(plainIssues('每一步的投影', 'title', IDS)[0].hint, /每一步给 agent 的项目摘要/)
})

test('typeWord: only on what a template writes', () => {
  assert.deepEqual(rules('新加了一个任务', 'generated'), ['typeWord'])
  assert.deepEqual(rules('一个 feature 做完了', 'generated'), ['typeWord'])
  assert.deepEqual(rules('定下的规范', 'generated'), ['typeWord'])
  assert.deepEqual(rules('目标、风险、工具和决定', 'generated'), [])
  assert.deepEqual(rules('新加了一个任务', 'title'), [])
})

test('length: title 40 and why 80 code points, an emoji counts once, a line break is one too many lines', () => {
  assert.equal(PLAIN_LIMITS.why, 80)
  const title = (n: number): string => '记'.repeat(n - 1) + '😀'
  assert.deepEqual(rules(title(40), 'title'), [])
  assert.deepEqual(rules(title(41), 'title'), ['length'])
  assert.deepEqual(rules('理'.repeat(80), 'why'), [])
  assert.deepEqual(rules('理'.repeat(81), 'why'), ['length'])
  assert.deepEqual(rules('第一行\n第二行', 'why'), ['length'])
  assert.deepEqual(rules('记'.repeat(200), 'proposal'), [], 'the lines of a question are M3\'s to measure')
})

test('jargon: on a question\'s title and lines and on a proposed node; not on the title of work in progress', () => {
  const ids = new Set<string>()
  const asked = node({ id: 'question-1', type: 'question', title: 'M7 的十个任务用什么验收', ask: '用什么验收？', form: 'recommend', proposal: '标定集只做回归守门', reason: '省事', notTaken: '每次都过门禁' })
  assert.deepEqual(nodePlainIssues(asked, ids).map(found => `${found.field}:${found.rule}`), ['title:code', 'title:jargon', 'proposal:jargon', 'notTaken:jargon'])
  const decided = { ...asked, title: '借书押金', proposal: '先不收', notTaken: '收押金', status: 'done', conclusion: '按验收走' } as GraphNode
  assert.deepEqual(nodePlainIssues(decided, ids).map(found => `${found.field}:${found.rule}`), ['conclusion:jargon'])
  const proposed = node({ id: 'feature-1', type: 'feature', status: 'proposed', title: '验收自动跑', why: '门禁更快' })
  assert.deepEqual(nodePlainIssues(proposed, ids).map(found => `${found.field}:${found.rule}`), ['title:jargon', 'why:jargon'])
  const doing = node({ id: 'task-2', type: 'task', status: 'doing', title: '标定集只做回归守门', why: '验收看得见' })
  assert.deepEqual(nodePlainIssues(doing, ids), [])
  assert.deepEqual(nodePlainIssues(node({ id: 'task-3', type: 'task', title: '怎样算做完写清楚' }), ids), [])
  assert.deepEqual(nodePlainIssues(asked, ids, ['proposal']).map(found => found.field), ['proposal'], 'only narrows the fields')
})

test('a question with options reads its title only; the ask, reason, cost and ways are never read here', () => {
  const card = node({ id: 'question-2', type: 'question', title: 'M3 怎么走', options: [{ key: 'A', label: '甲' }, { key: 'B', label: '乙' }], recommend: 'B' })
  assert.deepEqual(nodePlainIssues(card, new Set()).map(found => `${found.field}:${found.rule}`), ['title:code'])
  const asked = node({ id: 'question-3', type: 'question', title: '借书押金', ask: 'M3 要不要？', form: 'recommend', proposal: '先不收', reason: '照 M3', cost: 'M4 慢' })
  assert.deepEqual(nodePlainIssues(asked, new Set()), [])
})

test('why: read and written back byte for byte, right after the title; a question carries none; over 80 is an error', () => {
  const withWhy = node({ id: 'task-1', type: 'task', title: '记账', why: '月底能看出钱花在哪' })
  const text = serializeNode(withWhy)
  assert.ok(text.indexOf('"why"') > text.indexOf('"title"') && text.indexOf('"why"') < text.indexOf('"status"'), 'why follows title')
  const goal = { name: 'goal-1.json', text: serializeNode({ id: 'goal-1', type: 'goal', title: '记账本', status: 'approved', history: [{ at: at(0), actor: 'human', op: 'propose', reason: '测试', to: 'approved' }] }), revision: 'r2' }
  const graph = parseGraph([{ name: 'task-1.json', text, revision: 'r1' }, goal], 'rev')
  assert.deepEqual(graph.issues, [])
  assert.equal(serializeNode(graph.nodes.get('task-1')!), text)
  const asked = serializeNode(node({ id: 'question-1', type: 'question', ask: '要吗？', form: 'want', proposal: '要', why: '为什么' }))
  const long = serializeNode(node({ id: 'task-2', type: 'task', why: '理'.repeat(81) }))
  const errors = parseGraph([{ name: 'question-1.json', text: asked, revision: 'a' }, { name: 'task-2.json', text: long, revision: 'b' }, goal], 'rev').issues.filter(found => found.severity === 'error')
  assert.deepEqual(errors.map(found => `${found.file} ${found.field}`), ['nodes/question-1.json why', 'nodes/task-2.json why'])
})

test('reading notices: one per rule an open node breaks, with its field and rule; closed nodes are not read', () => {
  const nodes = new Map<string, GraphNode>([
    ['goal-1', node({ id: 'goal-1', type: 'goal', title: '记账本', parent: undefined })],
    ['task-1', node({ id: 'task-1', type: 'task', title: 'M3 记一条', why: '跟 task-2 一起' })],
    ['task-2', node({ id: 'task-2', type: 'task', title: 'M3 已做完', status: 'done', evidence: [{ kind: 'commit', ref: 'abc1234' }] })],
    ['task-3', node({ id: 'task-3', type: 'task', title: 'M3 不做了', status: 'dropped' })],
  ])
  assert.deepEqual(plainNotices(nodes).map(found => [found.severity, found.file, found.field, found.rule]), [
    ['notice', 'nodes/task-1.json', 'title', 'code'],
    ['notice', 'nodes/task-1.json', 'why', 'id'],
  ])
  assert.match(plainNotices(nodes)[0].message, /^a milestone, section or finding number \("M3"\); say what it is in plain words/)
})
