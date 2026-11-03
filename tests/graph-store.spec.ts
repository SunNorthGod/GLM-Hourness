import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { serializeNode, type GraphIssue } from '../src/graph/format.ts'
import type { GraphNode, HistoryEntry } from '../src/graph/schema.ts'
import { graphRevision, hasErrors, loadGraph, revisionOf, writeNodes } from '../src/graph/store.ts'

const AT = '2026-10-28T08:00:00.000Z'
const born: HistoryEntry = { at: AT, actor: 'human', op: 'propose', reason: '建图', to: 'approved' }

function goal(): GraphNode {
  return { id: 'goal-1', type: 'goal', title: '项目图引擎', status: 'approved', acceptance: ['人能看，LLM 能读写'], history: [born] }
}

function feature(): GraphNode {
  return { id: 'feature-1', type: 'feature', title: '存储', status: 'approved', parent: 'goal-1', history: [born] }
}

function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, type: 'task', title: `${id} 任务`, status: 'approved', parent: 'feature-1', history: [born], ...extra }
}

function question(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'question-1',
    type: 'question',
    title: '存储格式',
    status: 'approved',
    parent: 'goal-1',
    options: [
      { key: 'A', label: 'JSON', consequence: '不新增解析器' },
      { key: 'B', label: 'Markdown', consequence: '正文更好读' },
    ],
    recommend: 'A',
    history: [born],
    ...extra,
  }
}

async function tempGraph(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'graph-store-'))
}

/** Write node files: strings verbatim, objects as JSON. The base goal and feature are always present. */
async function graphWith(files: Record<string, unknown>): Promise<string> {
  const dir = await tempGraph()
  await mkdir(join(dir, 'nodes'))
  const all: Record<string, unknown> = { 'goal-1': goal(), 'feature-1': feature(), ...files }
  for (const [name, value] of Object.entries(all)) {
    const text = typeof value === 'string' ? value : serializeNode(value as GraphNode)
    await writeFile(join(dir, 'nodes', `${name}.json`), text)
  }
  return dir
}

function errorsOf(issues: readonly GraphIssue[]): GraphIssue[] {
  return issues.filter(issue => issue.severity === 'error')
}

const FULL_TASK = [
  '{',
  '  "id": "task-1",',
  '  "type": "task",',
  '  "title": "图存储",',
  '  "status": "done",',
  '  "parent": "feature-1",',
  '  "slope": "downhill",',
  '  "kind": "implement",',
  '  "tier": "standard",',
  '  "worktree": true,',
  '  "outputSchema": "handback-implement",',
  '  "body": "第一行\\n第二行",',
  '  "acceptance": [',
  '    "往返逐字节一致"',
  '  ],',
  '  "writeScope": [',
  '    "src/graph/",',
  '    "tests/graph-store.spec.ts"',
  '  ],',
  '  "edges": [',
  '    {',
  '      "type": "depends",',
  '      "to": "task-0"',
  '    },',
  '    {',
  '      "type": "source",',
  '      "to": "feature-1"',
  '    }',
  '  ],',
  '  "evidence": [',
  '    {',
  '      "kind": "commit",',
  '      "ref": "e1c4c15"',
  '    },',
  '    {',
  '      "kind": "test",',
  '      "ref": "npm test",',
  '      "exit": 0,',
  '      "note": "全绿"',
  '    }',
  '  ],',
  '  "history": [',
  '    {',
  '      "at": "2026-10-28T08:00:00.000Z",',
  '      "actor": "llm",',
  '      "op": "propose",',
  '      "reason": "按路线拆分",',
  '      "to": "approved"',
  '    },',
  '    {',
  '      "at": "2026-10-28T09:00:00.000Z",',
  '      "actor": "human",',
  '      "op": "edit",',
  '      "reason": "说清楚",',
  '      "changes": {',
  '        "title": {',
  '          "from": "存储",',
  '          "to": "图存储"',
  '        },',
  '        "acceptance": {',
  '          "from": null,',
  '          "to": [',
  '            "往返逐字节一致"',
  '          ]',
  '        }',
  '      }',
  '    },',
  '    {',
  '      "at": "2026-10-28T10:00:00.000Z",',
  '      "actor": "llm",',
  '      "op": "status",',
  '      "reason": "测试通过",',
  '      "from": "approved",',
  '      "to": "done",',
  '      "evidence": [',
  '        {',
  '          "kind": "test",',
  '          "ref": "npm test",',
  '          "exit": 0',
  '        }',
  '      ]',
  '    },',
  '    {',
  '      "at": "2026-10-28T11:00:00.000Z",',
  '      "actor": "human",',
  '      "op": "comment",',
  '      "text": "看过了"',
  '    }',
  '  ]',
  '}',
  '',
].join('\n')

/** The FULL_TASK node built with fields, edges and change keys in a different order. */
function scrambledTask(): GraphNode {
  return {
    history: [
      { to: 'approved', reason: '按路线拆分', op: 'propose', actor: 'llm', at: '2026-10-28T08:00:00.000Z' },
      { changes: { acceptance: { to: ['往返逐字节一致'], from: null }, title: { to: '图存储', from: '存储' } }, reason: '说清楚', op: 'edit', actor: 'human', at: '2026-10-28T09:00:00.000Z' },
      { evidence: [{ exit: 0, ref: 'npm test', kind: 'test' }], to: 'done', from: 'approved', reason: '测试通过', op: 'status', actor: 'llm', at: '2026-10-28T10:00:00.000Z' },
      { text: '看过了', op: 'comment', actor: 'human', at: '2026-10-28T11:00:00.000Z' },
    ],
    evidence: [{ ref: 'e1c4c15', kind: 'commit' }, { note: '全绿', exit: 0, ref: 'npm test', kind: 'test' }],
    edges: [{ to: 'feature-1', type: 'source' }, { to: 'task-0', type: 'depends' }],
    writeScope: ['src/graph/', 'tests/graph-store.spec.ts'],
    nonGoals: [],
    acceptance: ['往返逐字节一致'],
    body: '第一行\n第二行',
    outputSchema: 'handback-implement',
    worktree: true,
    tier: 'standard',
    kind: 'implement',
    slope: 'downhill',
    parent: 'feature-1',
    status: 'done',
    title: '图存储',
    type: 'task',
    id: 'task-1',
  }
}

test('canonical serialization: schema field order, sorted edges, empty arrays omitted, Chinese unescaped', () => {
  assert.equal(serializeNode(scrambledTask()), FULL_TASK)
})

test('a canonical graph round-trips byte-identical through load and write', async () => {
  // question-2 is a table card (ORCHESTRATION.md §2.6); its cells are given out of key order.
  const table = question({
    id: 'question-2',
    options: [{ key: 'B', label: 'Markdown', gain: '正文更好读', cost: '要自写解析器' }, { key: 'A', label: 'JSON', gain: '不新增解析器', cost: '长正文是一行字符串' }],
    dimension: { name: '新增依赖', values: { B: '1 个', A: '0 个' } },
    crux: '长段正文主要在网页上读吗？',
    verdict: '是 → B；否 → A',
    weight: 'two-way',
  })
  const dir = await graphWith({ 'task-0': task('task-0'), 'task-1': FULL_TASK, 'question-1': question(), 'question-2': table })
  try {
    const graph = await loadGraph(dir)
    assert.deepEqual(graph.issues, [])
    assert.deepEqual([...graph.nodes.keys()], ['feature-1', 'goal-1', 'question-1', 'question-2', 'task-0', 'task-1'])
    const written = JSON.parse(await readFile(join(dir, 'nodes', 'question-2.json'), 'utf8')) as { options: object[], dimension: { values: object } }
    assert.deepEqual(Object.keys(written).slice(5, 11), ['options', 'dimension', 'recommend', 'crux', 'verdict', 'weight'])
    assert.deepEqual(Object.keys(written.options[0]), ['key', 'label', 'gain', 'cost'])
    assert.deepEqual(Object.keys(written.dimension.values), ['A', 'B'], 'cells in key order')
    for (const [id, node] of graph.nodes) {
      const bytes = await readFile(join(dir, 'nodes', `${id}.json`), 'utf8')
      assert.equal(serializeNode(node), bytes, id)
    }
    const outcome = await writeNodes(dir, [...graph.nodes.values()].map(node => ({ node, expected: graph.revisions.get(node.id)! })))
    assert.equal(outcome.ok, true)
    assert.equal(await readFile(join(dir, 'nodes', 'task-1.json'), 'utf8'), FULL_TASK)
    const again = await loadGraph(dir)
    assert.equal(again.revision, graph.revision)
    assert.deepEqual([...again.revisions], [...graph.revisions])
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('serialization is deterministic: equal nodes give equal bytes', () => {
  const first = serializeNode(scrambledTask())
  const parsed = JSON.parse(first) as GraphNode
  assert.equal(serializeNode(parsed), first)
  assert.equal(serializeNode(scrambledTask()), first)
  assert.ok(!first.includes('\\u'), 'non-ASCII text is written as is')
})

test('a hand-written file that is valid but not canonical loads with a notice only', async () => {
  const dir = await graphWith({ 'task-1': `${JSON.stringify(task('task-1'), null, 4)}\n` })
  try {
    const graph = await loadGraph(dir)
    assert.equal(hasErrors(graph), false)
    assert.deepEqual(graph.issues.map(issue => [issue.severity, issue.file]), [['notice', 'nodes/task-1.json']])
    assert.ok(graph.nodes.has('task-1'))
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
})

interface ErrorCase {
  readonly name: string
  readonly files: Record<string, unknown>
  readonly file: string
  readonly field: string | undefined
  readonly message: RegExp
}

const decision = { id: 'decision-1', type: 'decision', title: '用 JSON', status: 'approved', parent: 'goal-1', verification: 'unverified', history: [born] }

const ERROR_CASES: readonly ErrorCase[] = [
  { name: 'invalid JSON', files: { 'task-1': '{ "id": ' }, file: 'nodes/task-1.json', field: undefined, message: /not valid JSON/ },
  { name: 'root is not an object', files: { 'task-1': '[]\n' }, file: 'nodes/task-1.json', field: undefined, message: /must be a JSON object/ },
  { name: 'file name is not an id', files: { Task_1: task('task-1') }, file: 'nodes/Task_1.json', field: undefined, message: /file name/ },
  { name: 'id differs from file name', files: { 'task-1': task('task-2') }, file: 'nodes/task-1.json', field: 'id', message: /does not match the file name/ },
  { name: 'unknown field', files: { 'task-1': task('task-1', { color: 'red' }) }, file: 'nodes/task-1.json', field: 'color', message: /not a known field/ },
  { name: 'missing title', files: { 'task-1': task('task-1', { title: undefined }) }, file: 'nodes/task-1.json', field: 'title', message: /is required/ },
  { name: 'multi-line title', files: { 'task-1': task('task-1', { title: '第一行\n第二行' }) }, file: 'nodes/task-1.json', field: 'title', message: /single line/ },
  { name: 'unknown status', files: { 'task-1': task('task-1', { status: 'finished' }) }, file: 'nodes/task-1.json', field: 'status', message: /must be one of proposed/ },
  { name: 'unknown type', files: { 'task-1': task('task-1', { type: 'epic' }) }, file: 'nodes/task-1.json', field: 'type', message: /must be one of goal/ },
  { name: 'parent is not an id', files: { 'task-1': task('task-1', { parent: '../x' }) }, file: 'nodes/task-1.json', field: 'parent', message: /must be a node id/ },
  { name: 'goal with a parent', files: { 'goal-2': { ...goal(), id: 'goal-2', parent: 'goal-1' } }, file: 'nodes/goal-2.json', field: 'parent', message: /goal node has no parent/ },
  { name: 'task without a parent', files: { 'task-1': task('task-1', { parent: undefined }) }, file: 'nodes/task-1.json', field: 'parent', message: /required for a task node/ },
  { name: 'stage on a task', files: { 'task-1': task('task-1', { stage: 'design' }) }, file: 'nodes/task-1.json', field: 'stage', message: /only goal and feature/ },
  { name: 'decision without verification', files: { 'decision-1': { ...decision, verification: undefined } }, file: 'nodes/decision-1.json', field: 'verification', message: /required for a decision node/ },
  { name: 'unknown verification state', files: { 'decision-1': { ...decision, verification: 'tested' } }, file: 'nodes/decision-1.json', field: 'verification', message: /must be one of unverified/ },
  { name: 'verification on a task', files: { 'task-1': task('task-1', { verification: 'sandbox' }) }, file: 'nodes/task-1.json', field: 'verification', message: /only decision nodes/ },
  { name: 'unknown task kind', files: { 'task-1': task('task-1', { kind: 'deploy' }) }, file: 'nodes/task-1.json', field: 'kind', message: /must be one of implement, test, review, docs/ },
  { name: 'unknown model tier', files: { 'task-1': task('task-1', { tier: 'max' }) }, file: 'nodes/task-1.json', field: 'tier', message: /must be one of hard, standard, simple/ },
  { name: 'worktree flag that is not a boolean', files: { 'task-1': task('task-1', { worktree: 'yes' }) }, file: 'nodes/task-1.json', field: 'worktree', message: /true or false/ },
  { name: 'multi-line output schema', files: { 'task-1': task('task-1', { outputSchema: 'a\nb' }) }, file: 'nodes/task-1.json', field: 'outputSchema', message: /single line/ },
  { name: 'absolute write scope', files: { 'task-1': task('task-1', { writeScope: ['/etc/passwd'] }) }, file: 'nodes/task-1.json', field: 'writeScope[0]', message: /repository-relative path/ },
  { name: 'write scope leaving the repository', files: { 'task-1': task('task-1', { writeScope: ['src/../../x'] }) }, file: 'nodes/task-1.json', field: 'writeScope[0]', message: /repository-relative path/ },
  { name: 'write scope with a drive or backslash', files: { 'task-1': task('task-1', { writeScope: ['src/ok.ts', 'C:\\work'] }) }, file: 'nodes/task-1.json', field: 'writeScope[1]', message: /repository-relative path/ },
  { name: 'write scope with a glob', files: { 'task-1': task('task-1', { writeScope: ['src/*.ts'] }) }, file: 'nodes/task-1.json', field: 'writeScope[0]', message: /repository-relative path/ },
  { name: 'duplicate write scope path', files: { 'task-1': task('task-1', { writeScope: ['src/graph/', 'src/graph/'] }) }, file: 'nodes/task-1.json', field: 'writeScope[1]', message: /duplicate path "src\/graph\/"/ },
  { name: 'review task with a write scope', files: { 'task-1': task('task-1', { kind: 'review', writeScope: ['src/graph/'] }) }, file: 'nodes/task-1.json', field: 'writeScope', message: /review task writes nothing/ },
  { name: 'dispatch attribute on a feature', files: { 'feature-2': { ...feature(), id: 'feature-2', tier: 'hard' } }, file: 'nodes/feature-2.json', field: 'tier', message: /only task nodes carry dispatch attributes/ },
  { name: 'question without options', files: { 'question-1': question({ options: undefined, recommend: undefined }) }, file: 'nodes/question-1.json', field: 'ask', message: /a question node has options, or ask, form and proposal/ },
  { name: 'question with one option', files: { 'question-1': question({ options: [{ key: 'A', label: 'JSON', consequence: '无' }] }) }, file: 'nodes/question-1.json', field: 'options', message: /2 to 4 options/ },
  { name: 'duplicate option key', files: { 'question-1': question({ options: [{ key: 'A', label: 'x', consequence: 'y' }, { key: 'A', label: 'z', consequence: 'w' }] }) }, file: 'nodes/question-1.json', field: 'options[1].key', message: /duplicate option key/ },
  { name: 'recommend is not an option', files: { 'question-1': question({ recommend: 'C' }) }, file: 'nodes/question-1.json', field: 'recommend', message: /not an option key/ },
  { name: 'decision is not an option', files: { 'question-1': question({ decision: 'C' }) }, file: 'nodes/question-1.json', field: 'decision', message: /not an option key/ },
  { name: 'options on a task', files: { 'task-1': task('task-1', { recommend: 'A' }) }, file: 'nodes/task-1.json', field: 'recommend', message: /only question nodes/ },
  { name: 'card line on a task', files: { 'task-1': task('task-1', { crux: '要不要分两步？' }) }, file: 'nodes/task-1.json', field: 'crux', message: /only question nodes carry options, dimension, recommend, crux, verdict, weight/ },
  { name: 'unknown weight', files: { 'question-1': question({ weight: 'one-time' }) }, file: 'nodes/question-1.json', field: 'weight', message: /must be one of one-way, two-way/ },
  { name: 'blank verdict', files: { 'question-1': question({ verdict: ' ' }) }, file: 'nodes/question-1.json', field: 'verdict', message: /non-empty string/ },
  { name: 'dimension cell under a key that is not an option key', files: { 'question-1': question({ dimension: { name: '工期', values: { 'A B': '1 天' } } }) }, file: 'nodes/question-1.json', field: 'dimension.values.A B', message: /option key/ },
  { name: 'dimension without values', files: { 'question-1': question({ dimension: { name: '工期', values: {} } }) }, file: 'nodes/question-1.json', field: 'dimension.values', message: /option key to cell text/ },
  { name: 'unknown edge type', files: { 'task-1': task('task-1', { edges: [{ type: 'blocks', to: 'goal-1' }] }) }, file: 'nodes/task-1.json', field: 'edges[0].type', message: /must be one of depends/ },
  { name: 'duplicate edge', files: { 'task-1': task('task-1', { edges: [{ type: 'source', to: 'goal-1' }, { type: 'source', to: 'goal-1' }] }) }, file: 'nodes/task-1.json', field: 'edges[1]', message: /duplicate source edge/ },
  { name: 'unknown edge target', files: { 'task-1': task('task-1', { edges: [{ type: 'depends', to: 'task-9' }] }) }, file: 'nodes/task-1.json', field: 'edges[0].to', message: /unknown node "task-9"/ },
  { name: 'edge to itself', files: { 'task-1': task('task-1', { edges: [{ type: 'depends', to: 'task-1' }] }) }, file: 'nodes/task-1.json', field: 'edges[0].to', message: /its own node/ },
  { name: 'unknown parent', files: { 'task-1': task('task-1', { parent: 'feature-9' }) }, file: 'nodes/task-1.json', field: 'parent', message: /unknown node "feature-9"/ },
  { name: 'commit evidence with a bad hash', files: { 'task-1': task('task-1', { evidence: [{ kind: 'commit', ref: 'HEAD' }] }) }, file: 'nodes/task-1.json', field: 'evidence[0].ref', message: /commit hash/ },
  { name: 'test evidence without an exit code', files: { 'task-1': task('task-1', { evidence: [{ kind: 'test', ref: 'npm test' }] }) }, file: 'nodes/task-1.json', field: 'evidence[0].exit', message: /required for test and check/ },
  { name: 'exit code on commit evidence', files: { 'task-1': task('task-1', { evidence: [{ kind: 'commit', ref: 'e1c4c15', exit: 0 }] }) }, file: 'nodes/task-1.json', field: 'evidence[0].exit', message: /only test and check/ },
  { name: 'non-integer exit code', files: { 'task-1': task('task-1', { evidence: [{ kind: 'test', ref: 'npm test', exit: '0' }] }) }, file: 'nodes/task-1.json', field: 'evidence[0].exit', message: /integer/ },
  { name: 'decision evidence on a task', files: { 'task-1': task('task-1', { evidence: [{ kind: 'decision', ref: 'A' }] }) }, file: 'nodes/task-1.json', field: 'evidence[0].kind', message: /belongs to question nodes/ },
  { name: 'done without passing evidence', files: { 'task-1': task('task-1', { status: 'done', evidence: [{ kind: 'test', ref: 'npm test', exit: 1 }] }) }, file: 'nodes/task-1.json', field: 'evidence', message: /passing evidence/ },
  { name: 'done without any evidence', files: { 'task-1': task('task-1', { status: 'done' }) }, file: 'nodes/task-1.json', field: 'evidence', message: /passing evidence/ },
  { name: 'empty history', files: { 'task-1': task('task-1', { history: [] }) }, file: 'nodes/task-1.json', field: 'history', message: /at least one entry/ },
  { name: 'unknown actor', files: { 'task-1': task('task-1', { history: [{ ...born, actor: 'bot' }] }) }, file: 'nodes/task-1.json', field: 'history[0].actor', message: /must be one of human/ },
  { name: 'unknown operation', files: { 'task-1': task('task-1', { history: [{ ...born, op: 'create' }] }) }, file: 'nodes/task-1.json', field: 'history[0].op', message: /must be one of propose/ },
  { name: 'local timestamp', files: { 'task-1': task('task-1', { history: [{ ...born, at: '2026-10-28 08:00' }] }) }, file: 'nodes/task-1.json', field: 'history[0].at', message: /UTC timestamp/ },
  { name: 'missing reason', files: { 'task-1': task('task-1', { history: [{ ...born, reason: undefined }] }) }, file: 'nodes/task-1.json', field: 'history[0].reason', message: /except comment/ },
  { name: 'comment without text', files: { 'task-1': task('task-1', { history: [born, { at: AT, actor: 'human', op: 'comment' }] }) }, file: 'nodes/task-1.json', field: 'history[1].text', message: /required for a comment/ },
  { name: 'change of a field edit cannot touch', files: { 'task-1': task('task-1', { history: [born, { at: AT, actor: 'human', op: 'edit', reason: 'x', changes: { status: { from: 'approved', to: 'done' } } }] }) }, file: 'nodes/task-1.json', field: 'history[1].changes.status', message: /not an editable field/ },
  { name: 'change with a malformed value', files: { 'task-1': task('task-1', { history: [born, { at: AT, actor: 'human', op: 'edit', reason: 'x', changes: { slope: { from: null, to: 'flat' } } }] }) }, file: 'nodes/task-1.json', field: 'history[1].changes.slope.to', message: /must be one of uphill/ },
  {
    name: 'decomposition cycle',
    files: { 'task-1': task('task-1', { parent: 'task-2' }), 'task-2': task('task-2', { parent: 'task-1' }) },
    file: 'nodes/task-1.json',
    field: 'parent',
    message: /decomposition cycle: task-1 -> task-2 -> task-1/,
  },
  {
    name: 'dependency cycle',
    files: {
      'task-1': task('task-1', { edges: [{ type: 'depends', to: 'task-2' }] }),
      'task-2': task('task-2', { edges: [{ type: 'depends', to: 'task-3' }] }),
      'task-3': task('task-3', { edges: [{ type: 'depends', to: 'task-1' }] }),
    },
    file: 'nodes/task-1.json',
    field: 'edges',
    message: /dependency cycle: task-1 -> task-2 -> task-3 -> task-1/,
  },
]

for (const errorCase of ERROR_CASES) {
  test(`validation error names file and field: ${errorCase.name}`, async () => {
    // Objects go through JSON.stringify so undefined fields drop out and malformed values reach the file as written.
    const files = Object.fromEntries(Object.entries(errorCase.files).map(([name, value]) => [name, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`]))
    const dir = await graphWith(files)
    try {
      const graph = await loadGraph(dir)
      assert.ok(hasErrors(graph))
      const match = errorsOf(graph.issues).find(issue => issue.file === errorCase.file && issue.field === errorCase.field && errorCase.message.test(issue.message))
      assert.ok(match, `expected an error on ${errorCase.file} ${errorCase.field ?? '(file)'} matching ${errorCase.message}; got ${JSON.stringify(graph.issues)}`)
    }
    finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
}

test('the valid goal, feature, decision and question fixtures load without issues', async () => {
  const dir = await graphWith({
    'decision-1': decision,
    'question-1': question({ status: 'done', decision: 'A', evidence: [{ kind: 'decision', ref: 'A' }] }),
    'task-1': task('task-1'),
    'task-2': task('task-2', { kind: 'review', tier: 'hard', worktree: false, outputSchema: 'handback-review' }),
  })
  try {
    const graph = await loadGraph(dir)
    assert.deepEqual(graph.issues, [])
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a node with a rule violation stays readable; a malformed node is left out', async () => {
  const dir = await graphWith({ 'task-1': task('task-1', { status: 'done' }), 'task-2': task('task-2', { status: 7 }) })
  try {
    const graph = await loadGraph(dir)
    assert.ok(graph.nodes.has('task-1'))
    assert.ok(!graph.nodes.has('task-2'))
    assert.ok(graph.revisions.has('task-2'), 'every node file counts toward the graph revision')
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('revisions: node revision hashes the file bytes; the graph revision follows any file change', async () => {
  const dir = await graphWith({ 'task-1': task('task-1') })
  try {
    const path = join(dir, 'nodes', 'task-1.json')
    const bytes = await readFile(path)
    const graph = await loadGraph(dir)
    assert.equal(graph.revisions.get('task-1'), createHash('sha256').update(bytes).digest('hex').slice(0, 12))
    assert.equal(revisionOf(bytes.toString('utf8')), graph.revisions.get('task-1'))
    const lines = ['feature-1', 'goal-1', 'task-1'].map(id => `${id} ${graph.revisions.get(id)!}\n`).join('')
    assert.equal(graph.revision, createHash('sha256').update(lines).digest('hex').slice(0, 12))
    assert.equal(graphRevision(new Map([...graph.revisions].reverse())), graph.revision)

    await writeFile(path, `${bytes.toString('utf8')} `)
    const changed = await loadGraph(dir)
    assert.notEqual(changed.revision, graph.revision)
    await writeFile(path, bytes)
    assert.equal((await loadGraph(dir)).revision, graph.revision)
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('writeNodes checks every expected revision before writing and leaves no temp files', async () => {
  const dir = await tempGraph()
  try {
    const created = await writeNodes(dir, [{ node: goal(), expected: null }])
    assert.equal(created.ok, true)
    const graph = await loadGraph(dir)
    assert.deepEqual(graph.issues, [])
    const rev = graph.revisions.get('goal-1')!
    assert.equal(created.ok && created.revisions.get('goal-1'), rev)

    const again = await writeNodes(dir, [{ node: goal(), expected: null }])
    assert.deepEqual(again, { ok: false, id: 'goal-1', current: rev })

    const renamed: GraphNode = { ...goal(), title: '改名' }
    const stale = await writeNodes(dir, [{ node: feature(), expected: null }, { node: renamed, expected: '000000000000' }])
    assert.deepEqual(stale, { ok: false, id: 'goal-1', current: rev })
    assert.deepEqual((await readdir(join(dir, 'nodes'))).sort(), ['goal-1.json'], 'a failed check writes nothing')

    const updated = await writeNodes(dir, [{ node: renamed, expected: rev }, { node: feature(), expected: null }])
    assert.equal(updated.ok, true)
    const after = await loadGraph(dir)
    assert.equal(after.nodes.get('goal-1')!.title, '改名')
    assert.equal(updated.ok && updated.revisions.get('goal-1'), after.revisions.get('goal-1'))
    assert.deepEqual((await readdir(join(dir, 'nodes'))).sort(), ['feature-1.json', 'goal-1.json'])

    await assert.rejects(writeNodes(dir, [{ node: { ...goal(), id: '../escape' }, expected: null }]), /not a node id/)
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a missing nodes directory is an empty graph; temp and other files are ignored', async () => {
  const dir = await tempGraph()
  try {
    const empty = await loadGraph(dir)
    assert.equal(empty.nodes.size, 0)
    assert.deepEqual(empty.issues, [])
    await mkdir(join(dir, 'nodes'))
    await writeFile(join(dir, 'nodes', '.goal-1.0123456789ab.tmp'), '{')
    await writeFile(join(dir, 'nodes', 'README.md'), '# 说明\n')
    const ignored = await loadGraph(dir)
    assert.equal(ignored.revisions.size, 0)
    assert.equal(ignored.revision, empty.revision)
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
})
