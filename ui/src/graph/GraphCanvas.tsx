/**
 * 图: the project graph drawn with the engine's own layout
 * (src/graph/layout.ts) as React SVG, so nodes keep their identity between
 * reads and move to their new place instead of jumping. Colour is the
 * status, shape the type, as in graph.svg (docs/ORCHESTRATION.md §2.12),
 * but in the theme's colours; the second line of a box says what the node
 * waits for instead of its id. The agents of the session stand on their
 * focus nodes as badges (agents.ts placements). Drag or scroll to pan,
 * Ctrl+scroll or the buttons to zoom; a click, or Enter on a focused
 * node, opens the node.
 */
import { Button, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactElement, type WheelEvent as ReactWheelEvent } from 'react'
import { HEX_INSET, TEXT, isHexagon, layoutGraph, type CurvePath, type DrawnEdgeType, type NodeBox, type Tone } from '../../../src/graph/layout.ts'
import type { LoadedGraph } from '../../../src/graph/parse.ts'
import { doingText, placements, useNow, type AgentLive } from './agents.ts'
import { asButton } from './common.tsx'
import { FILTER_LABELS, statusText, visibleGraph, type GraphFilter } from './model.ts'

interface View {
  readonly x: number
  readonly y: number
  readonly k: number
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 2
/** Below this zoom the 13 px titles stop being readable in the sidebar. */
const READABLE_ZOOM = 0.8
const PAD = 16

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

function pathOf(path: CurvePath): string {
  const [x1, y1, c1x, c1y, c2x, c2y, x2, y2] = path
  return `M${x1} ${y1}C${c1x} ${c1y} ${c2x} ${c2y} ${x2} ${y2}`
}

const TONE_COLOUR: Readonly<Record<Tone, string>> = {
  done: 'var(--g-done)',
  doing: 'var(--g-doing)',
  todo: 'var(--g-ink3)',
  waiting: 'var(--g-wait)',
  proposed: 'var(--g-ink3)',
  closed: 'var(--g-ink3)',
}

function mix(colour: string, percent: number): string {
  return `color-mix(in srgb, ${colour} ${percent}%, transparent)`
}

function shapeStyle(box: NodeBox): CSSProperties {
  const { node, tone } = box
  const hexagon = isHexagon(node.type)
  const stroke = hexagon && tone !== 'waiting' && tone !== 'proposed' ? 'var(--g-purple)' : node.type === 'risk' ? 'var(--g-wait)' : TONE_COLOUR[tone]
  const fill = tone === 'proposed' ? 'transparent' : hexagon && tone !== 'waiting' ? mix('var(--g-purple)', 12) : mix(TONE_COLOUR[tone], tone === 'todo' || tone === 'closed' ? 8 : 15)
  const dash = tone === 'proposed' ? '6 4' : node.type === 'risk' ? '5 3' : undefined
  return { fill, stroke, strokeWidth: node.type === 'goal' ? 2.4 : 1.4, ...(dash === undefined ? {} : { strokeDasharray: dash }) }
}

function hexPoints(width: number, height: number): string {
  const inset = Math.min(HEX_INSET, width / 4)
  return [[inset, 0], [width - inset, 0], [width, height / 2], [width - inset, height], [inset, height], [0, height / 2]].map(([px, py]) => `${px},${py}`).join(' ')
}

function baseline(top: number, font: { readonly size: number, readonly line: number }): number {
  return top + font.line / 2 + font.size * 0.35
}

const EDGE_STYLE: Readonly<Record<DrawnEdgeType, CSSProperties & { readonly marker?: string }>> = {
  parent: { stroke: 'var(--g-line-strong)', strokeWidth: 1.4 },
  depends: { stroke: 'var(--g-ink3)', strokeWidth: 1.3, strokeDasharray: '6 4', marker: 'arrow' },
  source: { stroke: 'var(--g-ink3)', strokeWidth: 1.3, strokeDasharray: '2 3', marker: 'arrow' },
  supersedes: { stroke: 'var(--g-purple)', strokeWidth: 1.6, marker: 'arrow-purple' },
}

function NodeShape({ box, selected, hiddenClosed, onPick }: { readonly box: NodeBox, readonly selected: boolean, readonly hiddenClosed: number, readonly onPick: (id: string) => void }): ReactElement {
  const { node, width, height } = box
  const font = node.type === 'goal' ? TEXT.goal : TEXT.title
  const x = width / 2
  let top = TEXT.padY
  const lines = box.lines.map(line => {
    const text = <text key={`${top}`} x={x} y={baseline(top, font)} textAnchor="middle" fontSize={font.size} fontWeight={node.type === 'goal' ? 600 : 500} style={{ fill: 'var(--g-ink)' }}>{line}</text>
    top += font.line
    return text
  })
  const classes = ['glmg-node', box.tone, selected ? 'selected' : ''].filter(Boolean).join(' ')
  const hexagon = isHexagon(node.type)
  return (
    <g className={classes} style={{ transform: `translate(${box.x}px, ${box.y}px)` }} data-id={node.id} aria-label={`${node.title}，${statusText(node)}`} {...asButton<SVGGElement>(() => { onPick(node.id) })}>
      <title>{node.title}</title>
      <rect className="halo" x={-4} y={-4} width={width + 8} height={height + 8} rx={10} />
      {hexagon
        ? <polygon className="shape" points={hexPoints(width, height)} style={shapeStyle(box)} />
        : <rect className="shape" width={width} height={height} rx={node.type === 'goal' ? 10 : 6} style={shapeStyle(box)} />}
      {lines}
      <text x={x} y={baseline(top, TEXT.meta)} textAnchor="middle" fontSize={TEXT.meta.size} style={{ fill: box.tone === 'waiting' ? 'var(--g-wait)' : 'var(--g-ink3)' }}>{statusText(node)}</text>
      {hiddenClosed > 0
        ? (
            <g style={{ transform: `translate(${width - 14}px, -8px)` }}>
              <rect width={30} height={16} rx={8} style={{ fill: mix('var(--g-done)', 22), stroke: 'var(--g-done)', strokeWidth: 0.8 }} />
              <text x={15} y={11.5} textAnchor="middle" fontSize={10} fontWeight={600} style={{ fill: 'var(--g-done)' }}>✓{hiddenClosed}</text>
            </g>
          )
        : null}
    </g>
  )
}

/** Approximate text width at the badge font: CJK glyphs are square, Latin ones about 0.6 em. */
function badgeWidth(label: string): number {
  let width = 0
  for (const char of label) width += char.charCodeAt(0) > 0x2e80 ? 10 : 6
  return width + 20
}

function badgeLabel(agent: AgentLive): string {
  if (agent.main) return '主 Agent'
  const chars = [...agent.name]
  return chars.length > 8 ? `${chars.slice(0, 7).join('')}…` : agent.name
}

/** The agents standing on one node, as pills above its top edge; a running agent's dot breathes. */
function AgentBadges({ box, agents, now }: { readonly box: NodeBox, readonly agents: readonly AgentLive[], readonly now: number }): ReactElement {
  let x = box.x + 8
  return (
    <g className="glmg-badges">
      {agents.map(agent => {
        const label = badgeLabel(agent)
        const width = badgeWidth(label)
        const left = x
        x += width + 4
        const state = agent.running ? 'running' : 'idle'
        return (
          <g key={agent.id} className={`glmg-badge ${state}${agent.main ? ' main' : ''}`} style={{ transform: `translate(${left}px, ${box.y - 10}px)` }}>
            <title>{[agent.name, agent.view?.model, doingText(agent, now)].filter(part => part !== undefined && part !== null).join(' · ')}</title>
            <rect className="pill" width={width} height={18} rx={9} />
            <circle className="ring" cx={10} cy={9} r={5.5} />
            <circle className="dot" cx={10} cy={9} r={3} />
            <text x={18} y={12.5} fontSize={10} fontWeight={600}>{label}</text>
          </g>
        )
      })}
    </g>
  )
}

export interface GraphCanvasProps {
  readonly graph: LoadedGraph
  readonly selected: string | undefined
  readonly onPick: (id: string) => void
  readonly agents: readonly AgentLive[]
}

export function GraphCanvas({ graph, selected, onPick, agents }: GraphCanvasProps): ReactElement {
  const [filter, setFilter] = useState<GraphFilter>('open')
  const [menuOpen, setMenuOpen] = useState(false)
  const visible = useMemo(() => visibleGraph(graph, filter), [graph, filter])
  const layout = useMemo(() => {
    const result = layoutGraph(visible.nodes)
    return result.ok ? result.layout : undefined
  }, [visible])
  const placed = useMemo(() => placements(agents), [agents])
  const drawn = useMemo(() => new Set(layout?.nodes.map(box => box.node.id) ?? []), [layout])
  /** Agents without a node in the drawing: no focus yet, or a focus the filter hides. */
  const unplaced = [...placed].flatMap(([id, list]) => drawn.has(id) ? [] : list)
  const mainFocus = agents.find(agent => agent.main)?.view?.focus ?? null
  const now = useNow(agents.some(agent => agent.running))
  const canvas = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [view, setView] = useState<View | undefined>(undefined)
  const [interacting, setInteracting] = useState(false)
  const drag = useRef<{ readonly startX: number, readonly startY: number, readonly from: View, moved: boolean } | undefined>(undefined)
  /** The click that ends a pan lands on whatever is under the pointer; it must not open a node. */
  const swallowClick = useRef(false)
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const element = canvas.current
    if (element === null) return undefined
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => { observer.disconnect() }
  }, [])

  /**
   * A readable zoom centred on what matters now: the first node that waits
   * for the human, else the main agent's focus, else the first task in
   * progress, else the goal.
   */
  const home = (): View | undefined => {
    if (layout === undefined || size.width === 0) return undefined
    const k = clamp((size.width - 2 * PAD) / Math.max(1, layout.width), READABLE_ZOOM, 1)
    const anchor = layout.nodes.find(box => box.tone === 'waiting' || box.tone === 'proposed')
      ?? layout.nodes.find(box => box.node.id === mainFocus)
      ?? layout.nodes.find(box => box.node.type === 'task' && box.node.status === 'doing')
      ?? layout.nodes.find(box => box.node.type === 'goal')
      ?? layout.nodes[0]
    if (anchor === undefined) return { x: PAD, y: PAD, k }
    const x = Math.min(PAD, size.width * 0.45 - (anchor.x + anchor.width / 2) * k)
    return { x, y: size.height / 2 - (anchor.y + anchor.height / 2) * k, k }
  }
  /** The whole drawn graph in the canvas. */
  const overview = (): View | undefined => {
    if (layout === undefined || size.width === 0) return undefined
    const k = clamp(Math.min((size.width - 2 * PAD) / Math.max(1, layout.width), (size.height - 2 * PAD) / Math.max(1, layout.height)), MIN_ZOOM, 1)
    return { x: (size.width - layout.width * k) / 2, y: (size.height - layout.height * k) / 2, k }
  }

  // Place the view once the canvas has a size; later reads keep the user's pan and zoom.
  useEffect(() => {
    if (view === undefined) {
      const placed = home()
      if (placed !== undefined) setView(placed)
    }
  })

  const current = view ?? { x: PAD, y: PAD, k: 1 }

  const zoomAt = (factor: number, cx: number, cy: number): void => {
    const k = clamp(current.k * factor, MIN_ZOOM, MAX_ZOOM)
    const ratio = k / current.k
    setView({ k, x: cx - (cx - current.x) * ratio, y: cy - (cy - current.y) * ratio })
  }

  const touch = (): void => {
    setInteracting(true)
    if (settle.current !== undefined) clearTimeout(settle.current)
    settle.current = setTimeout(() => { setInteracting(false) }, 160)
  }

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    touch()
    if (event.ctrlKey || event.metaKey) {
      zoomAt(Math.exp(-event.deltaY * 0.0022), event.clientX - rect.left, event.clientY - rect.top)
      return
    }
    setView({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY })
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    swallowClick.current = false
    drag.current = { startX: event.clientX, startY: event.clientY, from: current, moved: false }
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = drag.current
    if (state === undefined) return
    const dx = event.clientX - state.startX
    const dy = event.clientY - state.startY
    if (!state.moved && Math.hypot(dx, dy) < 4) return
    if (!state.moved) {
      state.moved = true
      event.currentTarget.setPointerCapture(event.pointerId)
      setInteracting(true)
    }
    setView({ ...state.from, x: state.from.x + dx, y: state.from.y + dy })
  }
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = drag.current
    drag.current = undefined
    if (state?.moved === true) {
      swallowClick.current = true
      event.currentTarget.releasePointerCapture(event.pointerId)
      setInteracting(false)
    }
  }
  const pick = (id: string): void => {
    if (swallowClick.current) {
      swallowClick.current = false
      return
    }
    onPick(id)
  }

  const centre = (): [number, number] => [size.width / 2, size.height / 2]

  return (
    <div className="glmg-graph glmg-view">
      <div className="glmg-toolbar">
        <Menu
          open={menuOpen}
          onClose={() => { setMenuOpen(false) }}
          items={(Object.keys(FILTER_LABELS) as GraphFilter[]).map(id => ({ id, label: FILTER_LABELS[id] }))}
          selectedId={filter}
          onSelect={id => { setFilter(id); setMenuOpen(false) }}
          portal
          anchor={<button type="button" className="glmg-filter" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => { setMenuOpen(!menuOpen) }}>{FILTER_LABELS[filter]} ▾</button>}
        />
        <span className="grow" />
        <Button variant="ghost" size="sm" aria-label="缩小" onClick={() => { zoomAt(1 / 1.25, ...centre()) }}>−</Button>
        <Button variant="ghost" size="sm" aria-label="放大" onClick={() => { zoomAt(1.25, ...centre()) }}>+</Button>
        <Button variant="ghost" size="sm" onClick={() => { const placed = overview(); if (placed !== undefined) setView(placed) }}>全貌</Button>
        <Button variant="ghost" size="sm" onClick={() => { const placed = home(); if (placed !== undefined) setView(placed) }}>回到重点</Button>
      </div>
      <div
        ref={canvas}
        className={`glmg-canvas${interacting ? ' dragging' : ''}`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <svg role="group" aria-label="项目图">
          <defs>
            <marker id="glmg-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto"><path d="M0 0L10 5L0 10z" style={{ fill: 'var(--g-ink3)' }} /></marker>
            <marker id="glmg-arrow-purple" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto"><path d="M0 0L10 5L0 10z" style={{ fill: 'var(--g-purple)' }} /></marker>
          </defs>
          <g className="glmg-world" style={{ transform: `translate(${current.x}px, ${current.y}px) scale(${current.k})`, transformOrigin: '0 0' }}>
            {layout?.edges.map(edge => {
              const { marker, ...style } = EDGE_STYLE[edge.type]
              return <path key={`${edge.type}:${edge.node}:${edge.to}`} className="glmg-edge" d={pathOf(edge.path)} style={style} {...(marker === undefined ? {} : { markerEnd: `url(#glmg-${marker})` })} />
            })}
            {layout?.nodes.map(box => <NodeShape key={box.node.id} box={box} selected={box.node.id === selected} hiddenClosed={visible.hiddenClosed.get(box.node.id) ?? 0} onPick={pick} />)}
            {layout?.nodes.map(box => {
              const here = placed.get(box.node.id)
              return here === undefined ? null : <AgentBadges key={`agents:${box.node.id}`} box={box} agents={here} now={now} />
            })}
          </g>
        </svg>
        {unplaced.length === 0
          ? null
          : (
              <div className="glmg-unplaced">
                {unplaced.map(agent => <span key={agent.id} className={agent.running ? 'running' : undefined}><i />{agent.name}：{agent.view?.focus === null || agent.view?.focus === undefined ? '还没落到节点' : '焦点被筛选隐藏了'}</span>)}
              </div>
            )}
        <div className="glmg-legend">
          <span><i style={{ background: 'var(--g-wait)' }} />等你</span>
          <span><i style={{ background: 'var(--g-doing)' }} />进行中</span>
          <span><i style={{ background: 'var(--g-done)' }} />完成</span>
          <span><i style={{ background: 'var(--g-ink3)' }} />未开始</span>
          <span><i style={{ background: 'var(--g-purple)' }} />决策</span>
        </div>
      </div>
    </div>
  )
}
