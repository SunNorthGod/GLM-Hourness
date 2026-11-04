/**
 * The environment branch reader (src/env/branch.ts): which tool children of
 * the `env` node are listed, which wait, and which `config` lines parse.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { parseGraph, type NodeFile } from '../src/graph/parse.ts'
import { serializeNode } from '../src/graph/format.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import { envBranch } from '../src/env/branch.ts'

const TOOL_BODY = '用途：静态检查\n用法：npm run lint\n  （先改代码再跑）\n选择理由：仓库现成\n安装位置：devDependencies'

function graphOf(nodes: readonly Record<string, unknown>[]) {
  const files: NodeFile[] = nodes.map(node => {
    const full = { history: [], ...node } as unknown as GraphNode
    return { name: `${full.id}.json`, text: serializeNode(full), revision: 'a'.repeat(12) }
  })
  return parseGraph(files, 'b'.repeat(12))
}

const ENV = { id: 'env', type: 'feature', title: '环境', parent: 'goal-1' }
const GOAL = { id: 'goal-1', type: 'goal', title: '目标' }

test('envBranch lists approved tool children with usage first line and config paths', () => {
  const graph = graphOf([
    GOAL,
    ENV,
    { id: 'tool-1', type: 'tool', title: 'ESLint', parent: 'env', status: 'approved', body: TOOL_BODY, acceptance: ['验收：全绿', '`config eslint.config.mjs, knip-baseline.json`'] },
    { id: 'tool-2', type: 'tool', title: 'gitleaks', parent: 'env', status: 'doing', body: '用法：npm run check:secrets' },
  ])
  const branch = envBranch(graph)
  assert.deepEqual(branch.issues, [])
  assert.equal(branch.proposals, 0)
  assert.deepEqual(branch.tools.map(tool => [tool.id, tool.title, tool.usage, tool.configs]), [
    ['tool-1', 'ESLint', 'npm run lint', ['eslint.config.mjs', 'knip-baseline.json']],
    ['tool-2', 'gitleaks', 'npm run check:secrets', []],
  ])
})

test('envBranch counts proposals and skips dropped ones; a node without 用法 has an empty usage', () => {
  const graph = graphOf([
    GOAL,
    ENV,
    { id: 'tool-1', type: 'tool', title: '等待批准', parent: 'env', status: 'proposed', body: TOOL_BODY },
    { id: 'tool-2', type: 'tool', title: '弃了', parent: 'env', status: 'dropped', body: '用法：gone' },
    { id: 'tool-3', type: 'tool', title: '没写用法', parent: 'env', status: 'approved' },
  ])
  const branch = envBranch(graph)
  assert.equal(branch.proposals, 1)
  assert.deepEqual(branch.tools.map(tool => [tool.id, tool.usage]), [['tool-3', '']])
})

test('envBranch reports unreadable config lines by node and line number, and takes no notice of other lines', () => {
  const graph = graphOf([
    GOAL,
    ENV,
    {
      id: 'tool-1', type: 'tool', title: 'ESLint', parent: 'env', status: 'approved',
      acceptance: ['`config /abs/path`', '普通验收行', '`config a/../b`', '`config`', '`config tsconfig.json,`', '`config C:/x.json`', 'config a`b.json'],
    },
  ])
  const branch = envBranch(graph)
  assert.deepEqual(branch.tools[0]?.configs, [])
  assert.deepEqual(branch.issues, ['tool-1 第 1 条 config 行读不懂', 'tool-1 第 3 条 config 行读不懂', 'tool-1 第 5 条 config 行读不懂', 'tool-1 第 6 条 config 行读不懂', 'tool-1 第 7 条 config 行读不懂'])
})

test('envBranch reads the paths of a well-formed config line, backticks optional', () => {
  const graph = graphOf([
    GOAL,
    ENV,
    { id: 'tool-1', type: 'tool', title: 'ESLint', parent: 'env', status: 'approved', acceptance: ['`config a.json, b/c.json`', 'config d.json'] },
  ])
  assert.deepEqual(envBranch(graph).tools[0]?.configs, ['a.json', 'b/c.json', 'd.json'])
})

test('envBranch without an env node, or without tool children, is empty', () => {
  assert.deepEqual(envBranch(graphOf([GOAL])), { tools: [], proposals: 0, issues: [] })
  assert.deepEqual(envBranch(graphOf([GOAL, ENV])), { tools: [], proposals: 0, issues: [] })
})
