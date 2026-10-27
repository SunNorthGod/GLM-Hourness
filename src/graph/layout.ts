/**
 * Layered layout of the project graph (docs/ORCHESTRATION.md §2.12).
 * Columns follow the decomposition depth with the goal on the left; every
 * subtree takes one contiguous vertical band, so decomposition edges never
 * cross. Siblings are reordered by the barycenter of their cross edges
 * (depends, source, supersedes) for a few sweeps, and the order with the
 * fewest crossings wins. Cross edges are routed after placement and never
 * move a node. Text width is estimated from character classes, never from
 * font metrics, so equal input gives equal output. The layout outputs
 * coordinates and wrapped label lines only; render.ts draws them.
 */
import { compareText } from './format.ts'
import { VERIFICATION_LABELS } from './labels.ts'
import { failure, type Failure } from './mutation.ts'
import { OPEN_STATUSES } from './projection.ts'
import { EDGE_TYPES, type EdgeType, type GraphNode, type NodeType } from './schema.ts'

/** Font sizes, line heights and padding in px; render.ts places the text with the same numbers. */
export const TEXT = {
  title: { size: 13, line: 18 },
  goal: { size: 15, line: 21 },
  meta: { size: 11, line: 15 },
  padX: 10,
  padY: 8,
} as const

/** Horizontal depth of the side points of a hexagon. */
export const HEX_INSET = 12

const TITLE_WIDTH = 168
const GOAL_TITLE_WIDTH = 200
const MIN_WIDTH = 96
const COLUMN_GAP = 64
const LEAF_GAP = 10
const BRANCH_GAP = 22
const ROOT_GAP = 40
const SWEEPS = 4
/** Cross edges attach to the box sides at this fraction of the height; decomposition edges attach at the middle. */
const CROSS_ANCHOR = 0.7
const BADGE_HEIGHT = 18

/** Colour class of a node: its status, except that open nodes held up by an undecided question are waiting. */
export type Tone = 'done' | 'doing' | 'todo' | 'waiting' | 'proposed' | 'closed'

export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface NodeBox extends Rect {
  readonly node: GraphNode
  readonly tone: Tone
  /** Wrapped title lines. */
  readonly lines: readonly string[]
  /** Second line: the id, plus the verification state of a decision or the outcome of a question. */
  readonly meta: string
  /** Decomposition depth, which is the column. */
  readonly depth: number
  /** Descendants hidden behind this collapsed node; 0 when nothing is hidden. */
  readonly hidden: number
  /** Count badge on the right edge of a collapsed node. */
  readonly badge?: Rect
  /** The node a projection view is centred on. */
  readonly focus: boolean
}

export type DrawnEdgeType = 'parent' | EdgeType

/** Cubic Bézier: start, two control points, end. */
export type CurvePath = readonly [number, number, number, number, number, number, number, number]

export interface EdgeRoute {
  readonly type: DrawnEdgeType
  /** The node that stores the edge: the child of a decomposition edge, the owner of a cross edge. */
  readonly node: string
  /** The edge target: the parent, or the `to` of the stored edge. */
  readonly to: string
  readonly path: CurvePath
}

export interface Layout {
  readonly width: number
  readonly height: number
  /** Drawn nodes in pre-order. */
  readonly nodes: readonly NodeBox[]
  /**
   * Decomposition edges in pre-order, then cross edges by type, node and
   * target. Every path runs from the `to` end to the `node` end, so arrows
   * point at the later party: the dependent, the derived node, the replacement.
   */
  readonly edges: readonly EdgeRoute[]
  /** Crossings with every edge taken as a straight segment; the sibling order minimises this. */
  readonly crossings: number
}

export interface LayoutOptions {
  /** Draw only this node and its descendants. */
  readonly root?: string
  /** Draw the projection of this node: its ancestors, its children, and its cross-edge neighbours with their ancestors. */
  readonly focus?: string
  /** Nodes whose descendants are hidden behind a count badge; unknown ids are ignored. */
  readonly collapsed?: readonly string[]
}

export type LayoutResult = { readonly ok: true, readonly layout: Layout } | Failure

const HEXAGON_TYPES: ReadonlySet<NodeType> = new Set(['decision', 'question'])

export function isHexagon(type: NodeType): boolean {
  return HEXAGON_TYPES.has(type)
}

const WIDE_PUNCTUATION = new Set([0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026])

/** Width of one character in em: CJK and full-width forms 1, wide Latin letters 0.9, capitals 0.7, other half-width 0.6. */
function charWidth(char: string): number {
  const code = char.codePointAt(0)!
  if (WIDE_PUNCTUATION.has(code)
    || (code >= 0x1100 && code <= 0x115F)
    || (code >= 0x2E80 && code <= 0xA4CF)
    || (code >= 0xAC00 && code <= 0xD7A3)
    || (code >= 0xF900 && code <= 0xFAFF)
    || (code >= 0xFE30 && code <= 0xFE4F)
    || (code >= 0xFF00 && code <= 0xFF60)
    || (code >= 0xFFE0 && code <= 0xFFE6)
    || code >= 0x1F300) {
    return 1
  }
  if (char === 'M' || char === 'W' || char === 'm' || char === 'w' || char === '@') return 0.9
  if (char >= 'A' && char <= 'Z') return 0.7
  return 0.6
}

/** Estimated width in px of a text at a font size. */
export function textWidth(text: string, size: number): number {
  let em = 0
  for (const char of text) em += charWidth(char)
  return em * size
}

/** Closing punctuation stays with the character before it, opening punctuation with the character after it. */
const CLOSING = new Set([...'，。、；：！？）》」』】〉”’,.;:!?)]}'])
const OPENING = new Set([...'（《「『【〈“‘([{'])
const ASCII_WORD = /^[\x21-\x7E]+$/

/** Units a line may break between: one CJK character, one run of ASCII, or a space. */
function breakUnits(text: string): string[] {
  const raw: string[] = []
  for (const char of text) {
    const last = raw[raw.length - 1]
    if (/\s/.test(char)) {
      if (last !== undefined && last !== ' ') raw.push(' ')
    }
    else if (ASCII_WORD.test(char) && last !== undefined && ASCII_WORD.test(last)) {
      raw[raw.length - 1] = last + char
    }
    else {
      raw.push(char)
    }
  }
  const units: string[] = []
  let opening = ''
  for (const unit of raw) {
    const last = units[units.length - 1]
    if (opening === '' && CLOSING.has(unit) && last !== undefined && last !== ' ') {
      units[units.length - 1] = last + unit
    }
    else if (OPENING.has(unit)) {
      opening += unit
    }
    else {
      units.push(opening + unit)
      opening = ''
    }
  }
  if (opening !== '') units.push(opening)
  return units
}

/** Greedy line breaking at maxWidth px; a unit wider than a whole line is split between characters. */
export function wrapText(text: string, maxWidth: number, size: number): string[] {
  const lines: string[] = []
  let line = ''
  const flush = (): void => {
    const trimmed = line.trimEnd()
    if (trimmed !== '') lines.push(trimmed)
    line = ''
  }
  for (const unit of breakUnits(text)) {
    if (unit === ' ') {
      if (line !== '') line += ' '
      continue
    }
    if (textWidth(line + unit, size) <= maxWidth) {
      line += unit
      continue
    }
    flush()
    for (const char of unit) {
      if (line !== '' && textWidth(line + char, size) > maxWidth) flush()
      line += char
    }
  }
  flush()
  return lines
}

function undecided(node: GraphNode | undefined): boolean {
  return node !== undefined && node.type === 'question' && OPEN_STATUSES.has(node.status)
}

function toneOf(node: GraphNode, nodes: ReadonlyMap<string, GraphNode>): Tone {
  if (node.status === 'dropped' || node.status === 'superseded') return 'closed'
  if (node.status === 'proposed') return 'proposed'
  if (node.status === 'done') return 'done'
  if (node.type === 'question') return 'waiting'
  if ((node.edges ?? []).some(edge => edge.type === 'depends' && undecided(nodes.get(edge.to)))) return 'waiting'
  return node.status === 'doing' ? 'doing' : 'todo'
}

function metaOf(node: GraphNode): string {
  if (node.type === 'decision' && node.verification !== undefined) return `${node.id} · ${VERIFICATION_LABELS[node.verification]}`
  if (node.type === 'question') {
    if (node.decision !== undefined) return `${node.id} · 选 ${node.decision}`
    if (OPEN_STATUSES.has(node.status)) return `${node.id} · 待拍板`
  }
  return node.id
}

interface Measured {
  readonly lines: readonly string[]
  readonly meta: string
  readonly width: number
  readonly height: number
}

function measure(node: GraphNode): Measured {
  const font = node.type === 'goal' ? TEXT.goal : TEXT.title
  const lines = wrapText(node.title, node.type === 'goal' ? GOAL_TITLE_WIDTH : TITLE_WIDTH, font.size)
  const meta = metaOf(node)
  const widest = Math.max(textWidth(meta, TEXT.meta.size), ...lines.map(entry => textWidth(entry, font.size)))
  const inset = isHexagon(node.type) ? HEX_INSET : 0
  return {
    lines,
    meta,
    width: Math.ceil(widest) + 2 * (TEXT.padX + inset),
    height: 2 * TEXT.padY + lines.length * font.line + TEXT.meta.line,
  }
}

function childrenIndex(nodes: ReadonlyMap<string, GraphNode>, among: ReadonlySet<string>): Map<string, string[]> {
  const index = new Map<string, string[]>()
  for (const id of [...among].sort(compareText)) {
    const parent = nodes.get(id)!.parent
    if (parent === undefined || parent === id || !among.has(parent)) continue
    const list = index.get(parent)
    if (list === undefined) index.set(parent, [id])
    else list.push(id)
  }
  return index
}

/** The node ids a view draws (before collapsing). */
function select(nodes: ReadonlyMap<string, GraphNode>, options: LayoutOptions): ReadonlySet<string> {
  const all = new Set(nodes.keys())
  if (options.root !== undefined) {
    const index = childrenIndex(nodes, all)
    const out = new Set<string>()
    const stack = [options.root]
    for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
      if (out.has(id)) continue
      out.add(id)
      stack.push(...index.get(id) ?? [])
    }
    return out
  }
  if (options.focus !== undefined) {
    const focus = options.focus
    const out = new Set<string>()
    // Stops at a node already selected: its own ancestors are selected with it.
    const withAncestors = (id: string): void => {
      for (let current: string | undefined = id; current !== undefined && nodes.has(current) && !out.has(current); current = nodes.get(current)!.parent) {
        out.add(current)
      }
    }
    withAncestors(focus)
    for (const node of nodes.values()) {
      if (node.parent === focus) out.add(node.id)
      if ((node.edges ?? []).some(edge => edge.to === focus)) withAncestors(node.id)
    }
    for (const edge of nodes.get(focus)!.edges ?? []) withAncestors(edge.to)
    return out
  }
  return all
}

interface Order {
  readonly roots: readonly string[]
  readonly children: ReadonlyMap<string, readonly string[]>
}

interface Tree extends Order {
  /** Drawn parent of every drawn node except the roots. */
  readonly parent: ReadonlyMap<string, string>
  readonly depth: ReadonlyMap<string, number>
  /** Collapsed nodes and the number of descendants they hide. */
  readonly hidden: ReadonlyMap<string, number>
  /** Every selected node and the drawn node that stands for it: itself, or its collapsed ancestor. */
  readonly drawnAs: ReadonlyMap<string, string>
}

/**
 * Spanning tree of the selection. Children start in creation order (first
 * history entry, then id); roots are goals first, then the rest in creation
 * order. Nodes whose parent chain loops (a validation error) are not
 * reachable from a root; each such loop is cut at its smallest id.
 */
function buildTree(nodes: ReadonlyMap<string, GraphNode>, selected: ReadonlySet<string>, collapsed: ReadonlySet<string>): Tree {
  const created = (id: string): string => nodes.get(id)!.history[0]?.at ?? ''
  const byCreation = (a: string, b: string): number => compareText(created(a), created(b)) || compareText(a, b)
  const isGoal = (id: string): number => nodes.get(id)!.type === 'goal' ? 0 : 1
  const index = childrenIndex(nodes, selected)
  for (const list of index.values()) list.sort(byCreation)
  const ids = [...selected].sort(compareText)
  const tops = ids.filter(id => {
    const parent = nodes.get(id)!.parent
    return parent === undefined || parent === id || !selected.has(parent)
  }).sort((a, b) => isGoal(a) - isGoal(b) || byCreation(a, b))

  const roots: string[] = []
  const children = new Map<string, string[]>()
  const parent = new Map<string, string>()
  const depth = new Map<string, number>()
  const hidden = new Map<string, number>()
  const drawnAs = new Map<string, string>()
  const hide = (start: readonly string[], owner: string): number => {
    let count = 0
    const stack = [...start]
    for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
      if (drawnAs.has(id)) continue
      drawnAs.set(id, owner)
      count++
      stack.push(...index.get(id) ?? [])
    }
    return count
  }
  const visit = (id: string, level: number): void => {
    drawnAs.set(id, id)
    depth.set(id, level)
    const list = (index.get(id) ?? []).filter(child => !drawnAs.has(child))
    if (list.length === 0) return
    if (collapsed.has(id)) {
      hidden.set(id, hide(list, id))
      return
    }
    children.set(id, list)
    for (const child of list) {
      parent.set(child, id)
      visit(child, level + 1)
    }
  }
  for (const id of [...tops, ...ids]) {
    if (drawnAs.has(id)) continue
    roots.push(id)
    visit(id, 0)
  }
  return { roots, children, parent, depth, hidden, drawnAs }
}

interface CrossEdge {
  readonly type: EdgeType
  readonly node: string
  readonly to: string
}

/** Cross edges between drawn nodes; an end inside a collapsed subtree moves to the collapsed node. */
function crossEdgesOf(nodes: ReadonlyMap<string, GraphNode>, selected: ReadonlySet<string>, drawnAs: ReadonlyMap<string, string>): CrossEdge[] {
  const seen = new Set<string>()
  const out: CrossEdge[] = []
  for (const id of [...selected].sort(compareText)) {
    for (const edge of nodes.get(id)!.edges ?? []) {
      if (!selected.has(edge.to)) continue
      const node = drawnAs.get(id)!
      const to = drawnAs.get(edge.to)!
      const key = `${edge.type} ${node} ${to}`
      if (node === to || seen.has(key)) continue
      seen.add(key)
      out.push({ type: edge.type, node, to })
    }
  }
  return out.sort((a, b) => EDGE_TYPES.indexOf(a.type) - EDGE_TYPES.indexOf(b.type) || compareText(a.node, b.node) || compareText(a.to, b.to))
}

function centerY(box: Rect): number {
  return box.y + box.height / 2
}

/** x of a box outline at height y; the sides of a hexagon slant toward its middle points. */
function sideX(box: NodeBox, side: 'left' | 'right', y: number): number {
  const half = box.height / 2
  const inset = isHexagon(box.node.type) ? HEX_INSET * Math.min(1, Math.abs(y - centerY(box)) / half) : 0
  return side === 'left' ? box.x + inset : box.x + box.width - inset
}

function treeRoute(parent: NodeBox, child: NodeBox): CurvePath {
  const x1 = parent.x + parent.width
  const y1 = centerY(parent)
  const x2 = child.x
  const y2 = centerY(child)
  const bend = (x2 - x1) / 2
  return [x1, y1, x1 + bend, y1, x2 - bend, y2, x2, y2]
}

/** Route from the tail (the edge target) to the head (the edge owner), entering the head from the side facing the tail. */
function crossRoute(tail: NodeBox, head: NodeBox): CurvePath {
  const y1 = tail.y + tail.height * CROSS_ANCHOR
  const y2 = head.y + head.height * CROSS_ANCHOR
  if (head.depth > tail.depth) {
    const x1 = sideX(tail, 'right', y1)
    const x2 = sideX(head, 'left', y2)
    const bend = Math.max(30, (x2 - x1) / 2)
    return [x1, y1, x1 + bend, y1, x2 - bend, y2, x2, y2]
  }
  if (head.depth < tail.depth) {
    const x1 = sideX(tail, 'left', y1)
    const x2 = sideX(head, 'right', y2)
    const bend = Math.max(30, (x1 - x2) / 2)
    return [x1, y1, x1 - bend, y1, x2 + bend, y2, x2, y2]
  }
  const x1 = sideX(tail, 'right', y1)
  const x2 = sideX(head, 'right', y2)
  const out = Math.max(x1, x2) + Math.min(80, 24 + Math.abs(y2 - y1) / 6)
  return [x1, y1, out, y1, out, y2, x2, y2]
}

function orientation(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax))
}

/** Proper intersection of the straight segments between the end points of two paths. */
function segmentsCross(p: CurvePath, q: CurvePath): boolean {
  return orientation(p[0], p[1], p[6], p[7], q[0], q[1]) * orientation(p[0], p[1], p[6], p[7], q[6], q[7]) < 0
    && orientation(q[0], q[1], q[6], q[7], p[0], p[1]) * orientation(q[0], q[1], q[6], q[7], p[6], p[7]) < 0
}

/** Crossings that involve at least one cross edge; edges sharing a node do not count. */
function countCrossings(edges: readonly EdgeRoute[]): number {
  let count = 0
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i]!
      const b = edges[j]!
      if (a.type === 'parent' && b.type === 'parent') continue
      if (a.node === b.node || a.node === b.to || a.to === b.node || a.to === b.to) continue
      if (segmentsCross(a.path, b.path)) count++
    }
  }
  return count
}

/**
 * One barycenter sweep. Every subtree that holds exactly one end of a cross
 * edge is pulled toward the other end; the key of a sibling is the mean of
 * its own centre and those pulls, so two siblings that pull at each other
 * tie instead of trading places. Ties keep the current order.
 */
function reorder(order: Order, boxes: ReadonlyMap<string, NodeBox>, crossEdges: readonly CrossEdge[], parent: ReadonlyMap<string, string>): Order {
  const center = (id: string): number => centerY(boxes.get(id)!)
  const chain = (id: string): string[] => {
    const out = [id]
    for (let next = parent.get(id); next !== undefined; next = parent.get(next)) out.push(next)
    return out
  }
  const pulls = new Map<string, { sum: number, count: number }>()
  const pull = (id: string, toward: number): void => {
    const entry = pulls.get(id)
    if (entry === undefined) pulls.set(id, { sum: toward, count: 1 })
    else {
      entry.sum += toward
      entry.count++
    }
  }
  for (const edge of crossEdges) {
    const a = chain(edge.node)
    const b = chain(edge.to)
    const inA = new Set(a)
    const inB = new Set(b)
    for (const id of a) {
      if (inB.has(id)) break
      pull(id, center(edge.to))
    }
    for (const id of b) {
      if (inA.has(id)) break
      pull(id, center(edge.node))
    }
  }
  const key = (id: string): number => {
    const entry = pulls.get(id)
    return entry === undefined ? center(id) : (center(id) + entry.sum) / (1 + entry.count)
  }
  const sort = (list: readonly string[]): string[] => list
    .map((id, index) => ({ id, index, key: key(id) }))
    .sort((a, b) => a.key - b.key || a.index - b.index)
    .map(entry => entry.id)
  return { roots: sort(order.roots), children: new Map([...order.children].map(([id, list]) => [id, sort(list)])) }
}

function sameOrder(a: Order, b: Order): boolean {
  const same = (x: readonly string[], y: readonly string[]): boolean => x.length === y.length && x.every((id, index) => id === y[index])
  return same(a.roots, b.roots) && [...a.children].every(([id, list]) => same(list, b.children.get(id) ?? []))
}

/**
 * Lay out a graph, a subtree (root) or a projection (focus). The graph may
 * carry validation errors: unknown parents make roots, unknown edge
 * targets are skipped, parent loops are cut.
 */
export function layoutGraph(nodes: ReadonlyMap<string, GraphNode>, options: LayoutOptions = {}): LayoutResult {
  if (options.root !== undefined && options.focus !== undefined) {
    return failure('invalid', 'root and focus select different views', 'pass root to draw a subtree or focus to draw a projection, not both', 'focus')
  }
  for (const field of ['root', 'focus'] as const) {
    const id = options[field]
    if (id !== undefined && !nodes.has(id)) return failure('not_found', `no readable node "${id}"`, 'list the nodes with load; a file that fails to parse is reported in the load issues', field)
  }
  const selected = select(nodes, options)
  const tree = buildTree(nodes, selected, new Set(options.collapsed ?? []))
  const drawn = [...tree.depth.keys()]
  const measured = new Map(drawn.map(id => [id, measure(nodes.get(id)!)]))
  const tones = new Map(drawn.map(id => [id, toneOf(nodes.get(id)!, nodes)]))
  const columnWidth: number[] = []
  for (const id of drawn) {
    const depth = tree.depth.get(id)!
    columnWidth[depth] = Math.max(columnWidth[depth] ?? MIN_WIDTH, measured.get(id)!.width)
  }
  // Depths are contiguous: every drawn node below a root has its drawn parent one column to the left.
  const columnX: number[] = []
  for (let depth = 0; depth < columnWidth.length; depth++) {
    columnX[depth] = depth === 0 ? 0 : columnX[depth - 1]! + columnWidth[depth - 1]! + COLUMN_GAP
  }
  const crossEdges = crossEdgesOf(nodes, selected, tree.drawnAs)

  const arrange = (order: Order): { readonly layout: Layout, readonly boxes: ReadonlyMap<string, NodeBox> } => {
    const kids = (id: string): readonly string[] => order.children.get(id) ?? []
    const gap = (a: string, b: string): number => kids(a).length > 0 || kids(b).length > 0 ? BRANCH_GAP : LEAF_GAP
    const band = new Map<string, number>()
    const stack = new Map<string, number>()
    const bandOf = (id: string): number => {
      const list = kids(id)
      let total = 0
      list.forEach((child, index) => {
        total += bandOf(child) + (index > 0 ? gap(list[index - 1]!, child) : 0)
      })
      stack.set(id, total)
      const value = Math.max(measured.get(id)!.height, total)
      band.set(id, value)
      return value
    }
    const preorder: string[] = []
    const tops = new Map<string, number>()
    const assign = (id: string, top: number): void => {
      preorder.push(id)
      const own = band.get(id)!
      tops.set(id, top + (own - measured.get(id)!.height) / 2)
      let y = top + (own - stack.get(id)!) / 2
      const list = kids(id)
      list.forEach((child, index) => {
        if (index > 0) y += gap(list[index - 1]!, child)
        assign(child, y)
        y += band.get(child)!
      })
    }
    let top = 0
    for (const root of order.roots) {
      const own = bandOf(root)
      assign(root, top)
      top += own + ROOT_GAP
    }
    const boxes = new Map<string, NodeBox>()
    for (const id of preorder) {
      const depth = tree.depth.get(id)!
      const { lines, meta, height } = measured.get(id)!
      const hidden = tree.hidden.get(id) ?? 0
      const box: NodeBox = {
        node: nodes.get(id)!,
        tone: tones.get(id)!,
        lines,
        meta,
        depth,
        hidden,
        focus: id === options.focus,
        x: columnX[depth]!,
        y: tops.get(id)!,
        width: columnWidth[depth]!,
        height,
      }
      if (hidden === 0) {
        boxes.set(id, box)
        continue
      }
      const badgeWidth = Math.ceil(textWidth(`+${hidden}`, TEXT.meta.size)) + 12
      boxes.set(id, { ...box, badge: { x: box.x + box.width - badgeWidth / 2, y: centerY(box) - BADGE_HEIGHT / 2, width: badgeWidth, height: BADGE_HEIGHT } })
    }
    const edges: EdgeRoute[] = []
    for (const id of preorder) {
      const parent = tree.parent.get(id)
      if (parent !== undefined) edges.push({ type: 'parent', node: id, to: parent, path: treeRoute(boxes.get(parent)!, boxes.get(id)!) })
    }
    for (const edge of crossEdges) edges.push({ ...edge, path: crossRoute(boxes.get(edge.to)!, boxes.get(edge.node)!) })
    let width = 0
    let height = 0
    for (const box of boxes.values()) {
      width = Math.max(width, box.x + box.width, box.badge === undefined ? 0 : box.badge.x + box.badge.width)
      height = Math.max(height, box.y + box.height)
    }
    for (const edge of edges) {
      for (let i = 0; i < edge.path.length; i += 2) {
        width = Math.max(width, edge.path[i]!)
        height = Math.max(height, edge.path[i + 1]!)
      }
    }
    return {
      layout: { width: Math.ceil(width), height: Math.ceil(height), nodes: preorder.map(id => boxes.get(id)!), edges, crossings: countCrossings(edges) },
      boxes,
    }
  }

  let current: Order = tree
  let arranged = arrange(current)
  let best = arranged.layout
  for (let sweep = 0; sweep < SWEEPS && crossEdges.length > 0 && best.crossings > 0; sweep++) {
    const next = reorder(current, arranged.boxes, crossEdges, tree.parent)
    if (sameOrder(next, current)) break
    current = next
    arranged = arrange(current)
    if (arranged.layout.crossings < best.crossings) best = arranged.layout
  }
  return { ok: true, layout: best }
}
