/**
 * SVG renderer (docs/ORCHESTRATION.md §2.10, §2.12): draws a layout as one
 * standalone SVG with presentation attributes only (no script, style sheet,
 * web font or external reference), so any SVG viewer shows the same
 * picture. Shape encodes the node type and colour the status, after the
 * sketch the user accepted on 2026-10-28; the legend is part of the
 * picture. Node groups carry data-id, count badges data-badge, and edges
 * data-edge, data-node and data-to. The DSH panel (ui/src/graph) draws
 * the same layout itself, with the theme's colours. One element per line
 * keeps diffs of the committed picture readable.
 */
import { STATUS_LABELS, TYPE_LABELS, VERIFICATION_LABELS } from './labels.ts'
import {
  HEX_INSET,
  TEXT,
  isHexagon,
  layoutGraph,
  textWidth,
  type CurvePath,
  type DrawnEdgeType,
  type Layout,
  type LayoutOptions,
  type NodeBox,
  type Rect,
  type Tone,
} from './layout.ts'
import type { Failure } from './mutation.ts'
import type { NodeType } from './schema.ts'
import type { LoadedGraph } from './parse.ts'

const MARGIN = 20
const LEGEND_GAP = 16
const FONT = "system-ui, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"
const INK = '#111827'
const MUTED = '#6b7280'
const PURPLE = '#7c3aed'
const PURPLE_FILL = '#ede9fe'
const RED = '#dc2626'
const FOCUS = '#2563eb'
const BADGE_FILL = '#374151'
const PROPOSED_DASH = '6 4'
const RISK_DASH = '5 3'
const CLOSED_OPACITY = 0.5
const ARROW = 'graph-arrow'
const ARROW_PURPLE = 'graph-arrow-purple'

const TONES: Readonly<Record<Tone, { readonly fill: string, readonly stroke: string }>> = {
  done: { fill: '#dcfce7', stroke: '#16a34a' },
  doing: { fill: '#fef3c7', stroke: '#d97706' },
  todo: { fill: '#f3f4f6', stroke: '#9ca3af' },
  waiting: { fill: '#fee2e2', stroke: RED },
  proposed: { fill: '#ffffff', stroke: MUTED },
  closed: { fill: '#f3f4f6', stroke: '#9ca3af' },
}

interface EdgeStyle {
  readonly stroke: string
  readonly width: number
  readonly dash?: string
  readonly marker?: string
}

const EDGE_STYLES: Readonly<Record<DrawnEdgeType, EdgeStyle>> = {
  parent: { stroke: '#9ca3af', width: 1.5 },
  depends: { stroke: MUTED, width: 1.5, dash: '6 4', marker: ARROW },
  source: { stroke: MUTED, width: 1.5, dash: '2 3', marker: ARROW },
  supersedes: { stroke: PURPLE, width: 1.8, marker: ARROW_PURPLE },
}

interface Paint {
  readonly fill: string
  readonly stroke: string
  readonly width: number
  readonly dash?: string
}

type Shape = 'goal' | 'hexagon' | 'box'

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Coordinates rounded to 0.1 px, never written as -0. */
function num(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return rounded === 0 ? '0' : String(rounded)
}

type Attributes = Readonly<Record<string, string | number | undefined>>

function attributes(values: Attributes): string {
  return Object.entries(values)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([key, value]) => ` ${key}="${typeof value === 'number' ? num(value) : escapeXml(value)}"`)
    .join('')
}

/** One element; content is markup and must already be escaped. */
function element(name: string, values: Attributes, content?: string): string {
  return content === undefined ? `<${name}${attributes(values)}/>` : `<${name}${attributes(values)}>${content}</${name}>`
}

function group(values: Attributes, children: readonly string[]): string {
  return element('g', values, `\n${children.join('\n')}\n`)
}

function baseline(top: number, font: { readonly size: number, readonly line: number }): number {
  return top + font.line / 2 + font.size * 0.35
}

function outline(rect: Rect, shape: Shape, paint: Paint): string {
  const stroke = { 'fill': paint.fill, 'stroke': paint.stroke, 'stroke-width': paint.width, 'stroke-dasharray': paint.dash }
  if (shape === 'hexagon') {
    const { x, y, width, height } = rect
    const inset = Math.min(HEX_INSET, width / 4)
    const points: readonly (readonly [number, number])[] = [
      [x + inset, y], [x + width - inset, y], [x + width, y + height / 2],
      [x + width - inset, y + height], [x + inset, y + height], [x, y + height / 2],
    ]
    return element('polygon', { points: points.map(([px, py]) => `${num(px)},${num(py)}`).join(' '), ...stroke })
  }
  return element('rect', { x: rect.x, y: rect.y, width: rect.width, height: rect.height, rx: shape === 'goal' ? 10 : 6, ...stroke })
}

function shapeOf(type: NodeType): Shape {
  return type === 'goal' ? 'goal' : isHexagon(type) ? 'hexagon' : 'box'
}

function paintOf(type: NodeType, tone: Tone): Paint {
  const colours = TONES[tone]
  const width = type === 'goal' ? 2.5 : 1.5
  const dash = tone === 'proposed' ? PROPOSED_DASH : type === 'risk' ? RISK_DASH : undefined
  const dashed = dash === undefined ? {} : { dash }
  if (isHexagon(type)) return { fill: tone === 'waiting' || tone === 'proposed' ? colours.fill : PURPLE_FILL, stroke: PURPLE, width, ...dashed }
  if (type === 'risk') return { fill: colours.fill, stroke: RED, width, ...dashed }
  return { fill: colours.fill, stroke: colours.stroke, width, ...dashed }
}

function tooltip(box: NodeBox): string {
  const { node } = box
  const facts = [node.id, TYPE_LABELS[node.type], STATUS_LABELS[node.status]]
  if (node.verification !== undefined) facts.push(VERIFICATION_LABELS[node.verification])
  const lines = [node.title, facts.join(' · ')]
  const chosen = node.options?.find(entry => entry.key === node.decision)
  if (chosen !== undefined) lines.push(`拍板：${chosen.key} ${chosen.label}`)
  if (box.hidden > 0) lines.push(`折叠了 ${box.hidden} 个节点`)
  return lines.join('\n')
}

function badge(rect: Rect, label: string): string[] {
  return [
    element('rect', { x: rect.x, y: rect.y, width: rect.width, height: rect.height, rx: rect.height / 2, fill: BADGE_FILL }),
    element('text', {
      'x': rect.x + rect.width / 2,
      'y': baseline(rect.y + (rect.height - TEXT.meta.line) / 2, TEXT.meta),
      'text-anchor': 'middle',
      'font-size': TEXT.meta.size,
      'font-weight': 600,
      'fill': '#ffffff',
    }, escapeXml(label)),
  ]
}

function drawNode(box: NodeBox): string {
  const { node } = box
  const font = node.type === 'goal' ? TEXT.goal : TEXT.title
  const parts = [element('title', {}, escapeXml(tooltip(box)))]
  if (box.focus) {
    parts.push(element('rect', { 'x': box.x - 4, 'y': box.y - 4, 'width': box.width + 8, 'height': box.height + 8, 'rx': 10, 'fill': 'none', 'stroke': FOCUS, 'stroke-width': 2 }))
  }
  parts.push(outline(box, shapeOf(node.type), paintOf(node.type, box.tone)))
  const x = box.x + box.width / 2
  let top = box.y + TEXT.padY
  for (const line of box.lines) {
    parts.push(element('text', { x, 'y': baseline(top, font), 'text-anchor': 'middle', 'font-size': font.size, 'font-weight': node.type === 'goal' ? 600 : undefined, 'fill': INK }, escapeXml(line)))
    top += font.line
  }
  parts.push(element('text', { x, 'y': baseline(top, TEXT.meta), 'text-anchor': 'middle', 'font-size': TEXT.meta.size, 'fill': MUTED }, escapeXml(box.meta)))
  if (box.badge !== undefined) parts.push(group({ 'data-badge': 'true' }, badge(box.badge, `+${box.hidden}`)))
  return group({
    'data-id': node.id,
    'data-type': node.type,
    'data-status': node.status,
    'data-tone': box.tone,
    'data-hidden': box.hidden > 0 ? box.hidden : undefined,
    'data-focus': box.focus ? 'true' : undefined,
    'opacity': box.tone === 'closed' ? CLOSED_OPACITY : undefined,
  }, parts)
}

function curve(path: CurvePath): string {
  const [x1, y1, c1x, c1y, c2x, c2y, x2, y2] = path
  return `M${num(x1)} ${num(y1)}C${num(c1x)} ${num(c1y)} ${num(c2x)} ${num(c2y)} ${num(x2)} ${num(y2)}`
}

function stroked(type: DrawnEdgeType, d: string, extra: Attributes = {}): string {
  const style = EDGE_STYLES[type]
  return element('path', {
    ...extra,
    'd': d,
    'fill': 'none',
    'stroke': style.stroke,
    'stroke-width': style.width,
    'stroke-dasharray': style.dash,
    'marker-end': style.marker === undefined ? undefined : `url(#${style.marker})`,
  })
}

function marker(id: string, colour: string): string {
  return element('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' }, element('path', { d: 'M0 0L10 5L0 10z', fill: colour }))
}

const LEGEND_FONT = 12
const LEGEND_ROW = 24
const LEGEND_PAD = 10
const ROW_LABEL_WIDTH = 44
const SWATCH_WIDTH = 28
const SWATCH_HEIGHT = 14

/** Draws a legend sample with its left edge at x and its middle at y. */
type Swatch = (x: number, y: number) => string

function boxSwatch(shape: Shape, paint: Paint, opacity?: number): Swatch {
  return (x, y) => {
    const drawn = outline({ x, y: y - SWATCH_HEIGHT / 2, width: SWATCH_WIDTH, height: SWATCH_HEIGHT }, shape, paint)
    return opacity === undefined ? drawn : element('g', { opacity }, drawn)
  }
}

function lineSwatch(type: DrawnEdgeType): Swatch {
  return (x, y) => stroked(type, `M${num(x)} ${num(y)}L${num(x + SWATCH_WIDTH)} ${num(y)}`)
}

const LEGEND_ROWS: readonly { readonly title: string, readonly items: readonly (readonly [label: string, draw: Swatch])[] }[] = [
  {
    title: '状态',
    items: [
      ['完成', boxSwatch('box', paintOf('task', 'done'))],
      ['进行中', boxSwatch('box', paintOf('task', 'doing'))],
      ['未开始', boxSwatch('box', paintOf('task', 'todo'))],
      ['等人', boxSwatch('box', paintOf('task', 'waiting'))],
      ['提议', boxSwatch('box', paintOf('task', 'proposed'))],
      ['废弃或被取代', boxSwatch('box', paintOf('task', 'closed'), CLOSED_OPACITY)],
    ],
  },
  {
    title: '类型',
    items: [
      ['目标', boxSwatch('goal', paintOf('goal', 'todo'))],
      ['特性与任务', boxSwatch('box', paintOf('task', 'todo'))],
      ['决策', boxSwatch('hexagon', paintOf('decision', 'todo'))],
      ['待决（等人拍板）', boxSwatch('hexagon', paintOf('question', 'waiting'))],
      ['风险', boxSwatch('box', paintOf('risk', 'todo'))],
    ],
  },
  {
    title: '连线',
    items: [
      ['分解', lineSwatch('parent')],
      ['依赖', lineSwatch('depends')],
      ['来源', lineSwatch('source')],
      ['取代', lineSwatch('supersedes')],
      ['折叠的子树', (x, y) => badge({ x, y: y - 9, width: SWATCH_WIDTH, height: 18 }, '+N').join('\n')],
    ],
  },
]

const LEGEND_NOTE = '箭头指向后来的一方：从前置指向依赖它的节点，从来源指向因它而有的节点，从旧节点指向取代它的新节点'

function legend(caption: string): { readonly svg: string, readonly width: number, readonly height: number } {
  const parts: string[] = []
  const label = (text: string, x: number, y: number, fill: string): string =>
    element('text', { x, y: y + LEGEND_FONT * 0.35, 'font-size': LEGEND_FONT, fill }, escapeXml(text))
  parts.push(element('text', { 'x': LEGEND_PAD, 'y': LEGEND_PAD + 13, 'font-size': 13, 'font-weight': 600, 'fill': INK }, escapeXml(caption)))
  let width = LEGEND_PAD + textWidth(caption, 13)
  let y = LEGEND_PAD + 22
  for (const row of LEGEND_ROWS) {
    const middle = y + LEGEND_ROW / 2
    parts.push(label(row.title, LEGEND_PAD, middle, MUTED))
    let x = LEGEND_PAD + ROW_LABEL_WIDTH
    for (const [text, draw] of row.items) {
      parts.push(draw(x, middle), label(text, x + SWATCH_WIDTH + 6, middle, INK))
      x += SWATCH_WIDTH + 6 + textWidth(text, LEGEND_FONT) + 18
    }
    width = Math.max(width, x)
    y += LEGEND_ROW
  }
  parts.push(label(LEGEND_NOTE, LEGEND_PAD, y + 10, MUTED))
  width = Math.ceil(Math.max(width, LEGEND_PAD + textWidth(LEGEND_NOTE, LEGEND_FONT)) + LEGEND_PAD)
  const height = y + 20 + LEGEND_PAD
  const background = element('rect', { 'width': width, 'height': height, 'rx': 8, 'fill': '#f9fafb', 'stroke': '#e5e7eb' })
  return { svg: group({ 'data-legend': 'true', 'transform': `translate(${MARGIN} ${MARGIN})` }, [background, ...parts]), width, height }
}

function renderSvg(layout: Layout, caption: string, revision: string): string {
  const key = legend(caption)
  const graphTop = MARGIN + key.height + LEGEND_GAP
  const empty = layout.nodes.length === 0
  const body = empty
    ? [element('text', { 'x': 0, 'y': 14, 'font-size': 13, 'fill': MUTED }, '图里还没有节点')]
    : [
        ...layout.edges.map(edge => stroked(edge.type, curve(edge.path), { 'data-edge': edge.type, 'data-node': edge.node, 'data-to': edge.to })),
        ...layout.nodes.map(drawNode),
      ]
  const width = Math.ceil(Math.max(key.width, layout.width) + 2 * MARGIN)
  const height = Math.ceil(graphTop + (empty ? 20 : layout.height) + MARGIN)
  const root = attributes({ 'xmlns': 'http://www.w3.org/2000/svg', width, height, 'viewBox': `0 0 ${width} ${height}`, 'font-family': FONT, 'data-revision': revision })
  return [
    `<svg${root}>`,
    element('title', {}, escapeXml(caption)),
    element('defs', {}, marker(ARROW, MUTED) + marker(ARROW_PURPLE, PURPLE)),
    element('rect', { width, height, fill: '#ffffff' }),
    key.svg,
    group({ 'data-graph': 'true', 'transform': `translate(${MARGIN} ${num(graphTop)})` }, body),
    '</svg>',
    '',
  ].join('\n')
}

export type RenderResult = { readonly ok: true, readonly svg: string, readonly layout: Layout } | Failure

/** Lay out and draw a loaded graph; the caption names the view, the graph revision, the node count and validation errors. */
export function renderGraph(graph: LoadedGraph, options: LayoutOptions = {}): RenderResult {
  const result = layoutGraph(graph.nodes, options)
  if (!result.ok) return result
  const { layout } = result
  const total = layout.nodes.reduce((sum, box) => sum + 1 + box.hidden, 0)
  const errors = graph.issues.filter(issue => issue.severity === 'error').length
  const view = options.root !== undefined ? ` · 子树 ${options.root}` : options.focus !== undefined ? ` · 投影 ${options.focus}` : ''
  const caption = `项目图${view} · 修订 ${graph.revision} · ${total} 个节点${errors > 0 ? ` · 校验错误 ${errors} 条` : ''}`
  return { ok: true, svg: renderSvg(layout, caption, graph.revision), layout }
}
