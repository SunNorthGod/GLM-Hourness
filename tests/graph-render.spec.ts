import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { serializeNode } from '../src/graph/format.ts'
import { HEX_INSET, TEXT, isHexagon, layoutGraph, textWidth, wrapText, type Layout, type LayoutOptions, type NodeBox } from '../src/graph/layout.ts'
import { renderGraph } from '../src/graph/render.ts'
import { STATUSES, type GraphNode, type NodeType } from '../src/graph/schema.ts'
import { loadGraph, type LoadedGraph } from '../src/graph/store.ts'

const run = promisify(execFile)
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let clock = 0

/** A node created one millisecond after the previous one, so creation order is the call order. */
function make(id: string, type: NodeType, parent: string | undefined, extra: Partial<GraphNode> = {}): GraphNode {
  const at = new Date(Date.UTC(2026, 9, 28, 8, 0, 0, clock++)).toISOString()
  return {
    id,
    type,
    title: `${id} 标题`,
    status: 'approved',
    ...(parent === undefined ? {} : { parent }),
    ...(type === 'decision' ? { verification: 'unverified' as const } : {}),
    ...(type === 'question'
      ? { options: [{ key: 'A', label: '甲', consequence: '甲的后果' }, { key: 'B', label: '乙', consequence: '乙的后果' }], recommend: 'A' }
      : {}),
    history: [{ at, actor: 'human', op: 'propose', reason: '测试', to: 'approved' }],
    ...extra,
  }
}

function graphOf(nodes: readonly GraphNode[]): LoadedGraph {
  return {
    nodes: new Map(nodes.map(node => [node.id, node])),
    revisions: new Map(nodes.map(node => [node.id, '000000000000'])),
    revision: 'abcdef012345',
    issues: [],
  }
}

function layoutOf(nodes: readonly GraphNode[], options: LayoutOptions = {}): Layout {
  const result = layoutGraph(new Map(nodes.map(node => [node.id, node])), options)
  assert.ok(result.ok, JSON.stringify(result))
  return result.layout
}

function svgOf(nodes: readonly GraphNode[], options: LayoutOptions = {}): string {
  const result = renderGraph(graphOf(nodes), options)
  assert.ok(result.ok, JSON.stringify(result))
  return result.svg
}

function box(layout: Layout, id: string): NodeBox {
  const found = layout.nodes.find(entry => entry.node.id === id)
  assert.ok(found !== undefined, `no box for ${id}`)
  return found
}

/** The markup of one node group; node groups contain no nested groups. */
function nodeGroup(svg: string, id: string): string {
  const match = new RegExp(`<g data-id="${id}"[^>]*>[\\s\\S]*?</g>`).exec(svg)
  assert.ok(match !== null, `no node group for ${id}`)
  return match[0]
}

function small(): GraphNode[] {
  return [
    make('goal-1', 'goal', undefined, { title: '项目图引擎：人能看，LLM 能读写' }),
    make('feature-1', 'feature', 'goal-1', { title: '底层' }),
    make('feature-2', 'feature', 'goal-1', { title: '编排层' }),
    make('task-1', 'task', 'feature-1', { title: '存储与校验', status: 'done', evidence: [{ kind: 'commit', ref: '17b8e3f' }] }),
    make('task-2', 'task', 'feature-1', { title: '引擎 API', status: 'doing', edges: [{ type: 'depends', to: 'task-1' }] }),
    make('decision-1', 'decision', 'feature-2', { title: '自建分层布局' }),
    make('question-1', 'question', 'feature-2', { title: '存储格式' }),
    make('task-3', 'task', 'feature-2', { title: '渲染器', edges: [{ type: 'depends', to: 'question-1' }, { type: 'source', to: 'decision-1' }] }),
    make('risk-1', 'risk', 'goal-1', { title: '只有 L3 验证' }),
    make('task-4', 'task', 'feature-2', { title: '提议的查看器', status: 'proposed' }),
    make('task-5', 'task', 'feature-1', { title: '废弃的路线', status: 'dropped' }),
  ]
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const WORDS = ['项目图', '引擎', 'DSH', '投影', '渲染器', 'LLM', '布局', '查看器', '命令行', 'rc.3', '验收条件', '证据', '，', '取代关系', 'GLM-5.3', '待决', '决策卡', 'WWW', '（试行）']
const TYPES: readonly NodeType[] = ['feature', 'task', 'task', 'task', 'decision', 'question', 'risk', 'norm', 'tool']

/** A random tree of `count` nodes under one goal, with cross edges only toward earlier nodes (so no dependency cycles). */
function generated(count: number, seed: number): GraphNode[] {
  const random = mulberry32(seed)
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!
  const nodes = [make('goal-1', 'goal', undefined, { title: '生成的大图：一百二十个节点的布局检查' })]
  for (let index = 1; index < count; index++) {
    const type = pick(TYPES)
    const title = Array.from({ length: 1 + Math.floor(random() * 9) }, () => pick(WORDS)).join('')
    const edges: { type: 'depends' | 'source' | 'supersedes', to: string }[] = []
    for (const [type, chance] of [['depends', 0.35], ['source', 0.1], ['supersedes', 0.05]] as const) {
      if (index > 2 && random() < chance) edges.push({ type, to: nodes[1 + Math.floor(random() * (index - 1))]!.id })
    }
    const extra: Partial<GraphNode> = { title, status: pick(STATUSES), ...(edges.length === 0 ? {} : { edges }) }
    const decided = type === 'question' && random() < 0.4 ? { decision: 'B' } : {}
    nodes.push(make(`n-${index}`, type, nodes[Math.floor(random() * index)]!.id, { ...extra, ...decided }))
  }
  return nodes
}

function overlaps(a: NodeBox, b: NodeBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

test('the same graph renders byte-identical SVG whatever the node order', () => {
  const nodes = small()
  const first = svgOf(nodes)
  assert.equal(svgOf(nodes), first)
  assert.equal(svgOf([...nodes].reverse()), first)
  assert.ok(first.startsWith('<svg xmlns="http://www.w3.org/2000/svg" '))
  assert.ok(first.endsWith('</svg>\n'))
  assert.ok(!first.includes('NaN') && !first.includes('Infinity') && !first.includes('<script'))
  assert.match(first, /data-revision="abcdef012345"/)
  assert.match(first, /项目图 · 修订 abcdef012345 · 11 个节点/)
})

test('120 generated nodes get boxes that do not overlap, in columns by depth, with titles inside', () => {
  for (const seed of [20261028, 7, 99]) {
    const nodes = generated(120, seed)
    const layout = layoutOf(nodes)
    assert.equal(layout.nodes.length, 120)
    for (let i = 0; i < layout.nodes.length; i++) {
      const a = layout.nodes[i]!
      assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.width <= layout.width && a.y + a.height <= layout.height, `${a.node.id} lies inside the picture`)
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const b = layout.nodes[j]!
        assert.ok(!overlaps(a, b), `seed ${seed}: ${a.node.id} overlaps ${b.node.id}`)
      }
      const font = a.node.type === 'goal' ? TEXT.goal : TEXT.title
      const room = a.width - 2 * (TEXT.padX + (isHexagon(a.node.type) ? HEX_INSET : 0))
      for (const line of a.lines) assert.ok(textWidth(line, font.size) <= room, `${a.node.id}: "${line}" fits its box`)
      assert.equal(a.lines.join('').replace(/\s/g, ''), a.node.title.replace(/\s/g, ''), 'wrapping keeps every character')
      if (a.node.parent !== undefined) {
        const parent = box(layout, a.node.parent)
        assert.equal(a.depth, parent.depth + 1)
        assert.ok(a.x >= parent.x + parent.width, `${a.node.id} is right of its parent`)
      }
    }
    for (const edge of layout.edges) {
      for (let i = 0; i < edge.path.length; i += 2) {
        const [x, y] = [edge.path[i]!, edge.path[i + 1]!]
        assert.ok(Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= layout.width && y <= layout.height, `${edge.type} ${edge.node} -> ${edge.to} stays inside the picture`)
      }
    }
    const svg = svgOf(nodes)
    assert.equal(svg.match(/<g data-id="/g)?.length, 120)
    assert.equal(svg.match(/<path data-edge="parent"/g)?.length, 119)
    assert.ok(!svg.includes('NaN'))
  }
})

test('decomposition edges never cross: every subtree keeps a contiguous band', () => {
  const layout = layoutOf(generated(120, 5))
  const bands = new Map<string, { top: number, bottom: number }>()
  for (const entry of [...layout.nodes].reverse()) {
    const own = { top: entry.y, bottom: entry.y + entry.height }
    const band = bands.get(entry.node.id) ?? own
    const merged = { top: Math.min(band.top, own.top), bottom: Math.max(band.bottom, own.bottom) }
    bands.set(entry.node.id, merged)
    if (entry.node.parent === undefined) continue
    const parent = bands.get(entry.node.parent)
    bands.set(entry.node.parent, parent === undefined ? merged : { top: Math.min(parent.top, merged.top), bottom: Math.max(parent.bottom, merged.bottom) })
  }
  for (const entry of layout.nodes) {
    const children = layout.nodes.filter(child => child.node.parent === entry.node.id)
    for (let i = 1; i < children.length; i++) {
      const above = bands.get(children[i - 1]!.node.id)!
      const below = bands.get(children[i]!.node.id)!
      assert.ok(above.bottom < below.top, `subtrees of ${children[i - 1]!.node.id} and ${children[i]!.node.id} are disjoint`)
    }
  }
})

test('a collapsed subtree is one box with a count badge, and edges into it end on that box', () => {
  const nodes = [
    make('goal-1', 'goal', undefined),
    make('feature-1', 'feature', 'goal-1'),
    make('task-1', 'task', 'feature-1'),
    make('task-2', 'task', 'feature-1'),
    make('task-3', 'task', 'task-2'),
    make('feature-2', 'feature', 'goal-1'),
    make('task-4', 'task', 'feature-2', { edges: [{ type: 'depends', to: 'task-3' }, { type: 'depends', to: 'task-1' }] }),
  ]
  const layout = layoutOf(nodes, { collapsed: ['feature-1', 'unknown-id'] })
  assert.deepEqual(layout.nodes.map(entry => entry.node.id), ['goal-1', 'feature-1', 'feature-2', 'task-4'])
  const collapsed = box(layout, 'feature-1')
  assert.equal(collapsed.hidden, 3)
  assert.ok(collapsed.badge !== undefined)
  assert.ok(collapsed.badge.x < collapsed.x + collapsed.width && collapsed.badge.x + collapsed.badge.width > collapsed.x + collapsed.width, 'the badge sits on the right edge')
  const cross = layout.edges.filter(edge => edge.type !== 'parent')
  assert.deepEqual(cross.map(edge => [edge.type, edge.node, edge.to]), [['depends', 'task-4', 'feature-1']], 'both edges end on the collapsed box, once')
  const svg = svgOf(nodes, { collapsed: ['feature-1'] })
  const group = nodeGroup(svg, 'feature-1')
  assert.match(group, /data-hidden="3"/)
  assert.match(group, />\+3<\/text>/)
  assert.match(group, /折叠了 3 个节点/)
  assert.ok(!svg.includes('data-id="task-3"'))
  assert.match(svg, /项目图 · 修订 abcdef012345 · 7 个节点/, 'the caption counts hidden nodes')
  assert.equal(box(layoutOf(nodes), 'feature-1').hidden, 0, 'nothing is collapsed by default')
})

test('the legend explains statuses, types and edges, also on an empty graph', () => {
  for (const svg of [svgOf(small()), svgOf([])]) {
    const legend = /<g data-legend="true"[^>]*>[\s\S]*?\n<\/g>/.exec(svg)
    assert.ok(legend !== null, 'legend group present')
    for (const label of ['状态', '完成', '进行中', '未开始', '等人', '提议', '废弃或被取代', '类型', '目标', '决策', '待决（等人拍板）', '风险', '连线', '分解', '依赖', '来源', '取代', '折叠的子树', '箭头指向后来的一方']) {
      assert.ok(legend[0].includes(`>${label}`), `legend shows ${label}`)
    }
  }
  const empty = svgOf([])
  assert.match(empty, /图里还没有节点/)
  assert.match(empty, /项目图 · 修订 abcdef012345 · 0 个节点/)
})

test('styles follow the sketch: colour by status, shape by type, dashed proposals and risks', () => {
  const svg = svgOf(small())
  assert.match(nodeGroup(svg, 'task-1'), /data-tone="done"[\s\S]*fill="#dcfce7" stroke="#16a34a"/)
  assert.match(nodeGroup(svg, 'task-2'), /data-tone="doing"[\s\S]*fill="#fef3c7" stroke="#d97706"/)
  assert.match(nodeGroup(svg, 'feature-1'), /data-tone="todo"[\s\S]*fill="#f3f4f6" stroke="#9ca3af"/)
  assert.match(nodeGroup(svg, 'task-3'), /data-tone="waiting"[\s\S]*fill="#fee2e2" stroke="#dc2626"/, 'depends on an undecided question')
  assert.match(nodeGroup(svg, 'question-1'), /data-tone="waiting"[\s\S]*<polygon [^>]*fill="#fee2e2" stroke="#7c3aed"/)
  assert.match(nodeGroup(svg, 'question-1'), /question-1 · 待拍板/)
  assert.match(nodeGroup(svg, 'decision-1'), /<polygon [^>]*fill="#ede9fe" stroke="#7c3aed"/)
  assert.match(nodeGroup(svg, 'decision-1'), /decision-1 · 未验证/)
  assert.match(nodeGroup(svg, 'risk-1'), /<rect [^>]*stroke="#dc2626" stroke-width="1.5" stroke-dasharray="5 3"/)
  assert.match(nodeGroup(svg, 'task-4'), /data-tone="proposed"[\s\S]*stroke-dasharray="6 4"/)
  assert.match(nodeGroup(svg, 'task-5'), /data-tone="closed" opacity="0.5"/)
  assert.match(nodeGroup(svg, 'goal-1'), /<rect [^>]*rx="10"[^>]*stroke-width="2.5"/)
  assert.match(svg, /<path data-edge="depends" data-node="task-2" data-to="task-1" d="[^"]+" fill="none" stroke="#6b7280" stroke-width="1.5" stroke-dasharray="6 4" marker-end="url\(#graph-arrow\)"\/>/)
  assert.match(svg, /<path data-edge="source" data-node="task-3" data-to="decision-1" [^>]*stroke-dasharray="2 3"/)
  assert.match(svg, /<path data-edge="parent" data-node="task-1" data-to="feature-1" [^>]*stroke="#9ca3af" stroke-width="1.5"\/>/)

  const decided = small().map(node => node.id === 'question-1' ? { ...node, status: 'done' as const, decision: 'B' } : node)
  const after = svgOf(decided)
  assert.match(nodeGroup(after, 'question-1'), /data-tone="done"[\s\S]*<polygon [^>]*fill="#ede9fe"/)
  assert.match(nodeGroup(after, 'question-1'), /question-1 · 选 B/)
  assert.match(nodeGroup(after, 'question-1'), /拍板：B 乙/)
  assert.match(nodeGroup(after, 'task-3'), /data-tone="todo"/, 'no longer held up once the question is decided')
})

test('arrows point at the later party and cross edges never move a node', () => {
  const nodes = small()
  const layout = layoutOf(nodes)
  const edge = layout.edges.find(entry => entry.type === 'depends' && entry.node === 'task-2')!
  const tail = box(layout, 'task-1')
  const head = box(layout, 'task-2')
  assert.equal(edge.to, 'task-1')
  assert.ok(Math.abs(edge.path[1] - (tail.y + tail.height * 0.7)) < 0.01 && Math.abs(edge.path[7] - (head.y + head.height * 0.7)) < 0.01, 'the path starts at the prerequisite and ends at the dependent')
  const without = layoutOf(nodes.map(node => node.id === 'task-2' ? { ...node, edges: [] } : node))
  for (const entry of without.nodes) {
    const same = box(layout, entry.node.id)
    assert.equal(same.depth, entry.depth)
    assert.equal(same.x, entry.x)
  }
})

test('titles wrap at the maximum width without splitting ASCII words or starting a line with closing punctuation', () => {
  const lines = wrapText('把项目图的布局与绘制分开，布局只输出坐标，绘制只认坐标；DSH-runtime 与 elkjs 的比较写在文档里。', 168, 13)
  assert.ok(lines.length > 1)
  for (const line of lines) {
    assert.ok(textWidth(line, 13) <= 168, line)
    assert.ok(!/^[，。；、）]/.test(line), `"${line}" does not start with closing punctuation`)
  }
  assert.ok(lines.some(line => line.includes('DSH-runtime')), 'an ASCII word stays whole')
  assert.deepEqual(wrapText('短标题', 168, 13), ['短标题'])
  const long = wrapText('x'.repeat(60), 100, 13)
  assert.ok(long.length > 1 && long.every(line => textWidth(line, 13) <= 100), 'a word longer than a line is split')
  assert.equal(textWidth('中文', 10), 20)
  assert.equal(textWidth('ab', 10), 12)
})

test('titles are escaped as XML', () => {
  const nodes = [make('goal-1', 'goal', undefined, { title: '<script>alert("x")</script> & 1 > 0' })]
  const svg = svgOf(nodes)
  assert.ok(!svg.includes('<script>'))
  assert.match(svg, /&lt;script&gt;alert\(&quot;x&quot;\)/)
  assert.match(svg, /&amp; 1 &gt; 0/)
})

test('a subtree view and a projection view select their nodes', () => {
  const nodes = small()
  assert.deepEqual(layoutOf(nodes, { root: 'feature-1' }).nodes.map(entry => entry.node.id), ['feature-1', 'task-1', 'task-2', 'task-5'])
  const projection = layoutOf(nodes, { focus: 'task-3' })
  assert.deepEqual(projection.nodes.map(entry => entry.node.id).sort(), ['decision-1', 'feature-2', 'goal-1', 'question-1', 'task-3'])
  assert.equal(box(projection, 'task-3').focus, true)
  assert.equal(box(projection, 'goal-1').focus, false)
  const svg = svgOf(nodes, { focus: 'task-3' })
  assert.match(nodeGroup(svg, 'task-3'), /data-focus="true"[\s\S]*stroke="#2563eb"/)
  assert.match(svg, /项目图 · 投影 task-3 · 修订/)
  assert.match(svgOf(nodes, { root: 'feature-1' }), /项目图 · 子树 feature-1 · 修订/)
  const neighbour = layoutOf(nodes, { focus: 'task-1' })
  assert.deepEqual(neighbour.nodes.map(entry => entry.node.id).sort(), ['feature-1', 'goal-1', 'task-1', 'task-2'], 'dependents come with their ancestors')

  const both = layoutGraph(graphOf(nodes).nodes, { root: 'feature-1', focus: 'task-3' })
  assert.ok(!both.ok && both.error.code === 'invalid' && both.error.field === 'focus')
  const unknown = renderGraph(graphOf(nodes), { root: 'nope' })
  assert.ok(!unknown.ok && unknown.error.code === 'not_found' && unknown.error.field === 'root' && unknown.error.hint.length > 0)
})

test('a graph with validation errors still lays out: unknown parents become roots, loops are cut', () => {
  const nodes = [
    make('goal-1', 'goal', undefined),
    make('task-1', 'task', 'missing'),
    make('task-2', 'task', 'task-3'),
    make('task-3', 'task', 'task-2', { edges: [{ type: 'depends', to: 'gone' }] }),
  ]
  const layout = layoutOf(nodes)
  assert.deepEqual(layout.nodes.map(entry => entry.node.id), ['goal-1', 'task-1', 'task-2', 'task-3'])
  assert.equal(box(layout, 'task-1').depth, 0)
  assert.equal(box(layout, 'task-3').depth, 1)
  const graph: LoadedGraph = { ...graphOf(nodes), issues: [{ severity: 'error', file: 'nodes/task-1.json', field: 'parent', message: 'unknown node "missing"' }] }
  const result = renderGraph(graph)
  assert.ok(result.ok)
  assert.match(result.svg, /4 个节点 · 校验错误 1 条/)
})

test('barycenter sweeps reorder siblings to remove a dependency crossing', () => {
  // In creation order task-a sits above task-b, and the edge from task-a to
  // task-c1 (two branches further down) crosses the decomposition edge task-b -> task-b1.
  const nodes = [
    make('goal-1', 'goal', undefined),
    make('feature-1', 'feature', 'goal-1'),
    make('feature-2', 'feature', 'goal-1'),
    make('task-a', 'task', 'feature-1'),
    make('task-b', 'task', 'feature-1'),
    make('task-b1', 'task', 'task-b'),
    make('task-c', 'task', 'feature-2'),
    make('task-c1', 'task', 'task-c', { edges: [{ type: 'depends', to: 'task-a' }] }),
  ]
  const creation = ['goal-1', 'feature-1', 'task-a', 'task-b', 'task-b1', 'feature-2', 'task-c', 'task-c1']
  const layout = layoutOf(nodes)
  assert.equal(layout.crossings, 0)
  assert.notDeepEqual(layout.nodes.map(entry => entry.node.id), creation)
  const plain = layoutOf(nodes.map(node => node.id === 'task-c1' ? { ...node, edges: [] } : node))
  assert.deepEqual(plain.nodes.map(entry => entry.node.id), creation, 'without cross edges the creation order stands')
})

test('npm run graph:render writes the renderer output for a graph directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'graph-render-'))
  try {
    await mkdir(join(dir, 'nodes'))
    for (const node of small()) await writeFile(join(dir, 'nodes', `${node.id}.json`), serializeNode(node))
    const out = join(dir, 'picture', 'graph.svg')
    const script = join(repository, 'scripts', 'graph', 'render.ts')
    const { stdout } = await run(process.execPath, ['--experimental-strip-types', '--no-warnings', script, '--dir', dir, '--out', out, '--collapse', 'feature-1'])
    assert.match(stdout, /graph:render: wrote .*graph\.svg \(8 nodes drawn, revision [0-9a-f]{12}\)/)
    const expected = renderGraph(await loadGraph(dir), { collapsed: ['feature-1'] })
    assert.ok(expected.ok)
    assert.equal(await readFile(out, 'utf8'), expected.svg)
    await assert.rejects(run(process.execPath, ['--experimental-strip-types', '--no-warnings', script, '--dir', dir, '--out', out, '--root', 'nope']), /not_found/)
    await assert.rejects(run(process.execPath, ['--experimental-strip-types', '--no-warnings', script, '--bogus']), /usage: npm run graph:render/)
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
})
