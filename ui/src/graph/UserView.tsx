/**
 * 用户怎么用 (user graph design 0.4.1 §6.2): the overview band, then the
 * user view (roles, flows, steps) and the development view (features and
 * tasks) side by side from 760 px of container width, one column with a
 * 用户视角 / 开发视角 switch below it. Everything shown is computed by
 * user-view.ts; this file renders it and keeps the page's own state: the
 * selection, the unfolded flows, the shown side. Selecting a step lights up
 * the work connected to it and scrolls it into view; selecting a feature or
 * task lights up the steps it serves; a second click or Escape clears it.
 * The highlight is a border and a word, every state is written out. The
 * page only looks (d-ui-look-not-operate): its buttons select, fold and
 * open node pages.
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import type { LoadedGraph } from '../../../src/graph/parse.ts'
import { useServices } from './common.tsx'
import { absoluteTime } from './model.ts'
import { userViewOf, type DevRow, type FlowRow, type Mark, type RoleRow, type StepRow } from './user-view.ts'

type Side = 'user' | 'dev'

const SIDE_WORDS: Readonly<Record<Side, string>> = { user: '用户视角', dev: '开发视角' }

/** The word a highlighted row carries besides its border. */
const MARK_WORDS: Readonly<Record<Mark, string | undefined>> = { selected: '选中', linked: '相连', faded: undefined, plain: undefined }

function markClass(mark: Mark): string {
  return mark === 'plain' ? '' : ` ${mark}`
}

function MarkWord({ mark }: { readonly mark: Mark }): ReactElement | null {
  const word = MARK_WORDS[mark]
  return word === undefined ? null : <span className="glmg-uv-mark">{word}</span>
}

function StepLine({ row, onPick }: { readonly row: StepRow, readonly onPick: (id: string) => void }): ReactElement {
  return (
    <div className={`glmg-uv-step${markClass(row.mark)}`} data-node={row.id}>
      <button type="button" className="glmg-uv-row" aria-pressed={row.mark === 'selected'} onClick={() => { onPick(row.id) }}>
        <span className="glmg-uv-num">{row.number}</span>
        <span className="glmg-uv-title">{row.title}</span>
        <span className="glmg-uv-state">{row.state}</span>
        <span className="glmg-uv-tag">服务者 {row.servers}</span>
        <MarkWord mark={row.mark} />
      </button>
      {row.next === undefined ? null : <div className="glmg-uv-sub">└ {row.next}</div>}
      {row.nextDropped ? <div className="glmg-uv-sub">后面接的那一步已经不要了</div> : null}
      {row.unreachable ? <div className="glmg-uv-sub">从起点走不到</div> : null}
    </div>
  )
}

function FlowBlock({ flow, unfolded, onToggle, onPick }: { readonly flow: FlowRow, readonly unfolded: boolean, readonly onToggle: (id: string) => void, readonly onPick: (id: string) => void }): ReactElement {
  const shown = unfolded || flow.open
  return (
    <div className={`glmg-uv-flow${markClass(flow.mark)}`} data-node={flow.id}>
      <button type="button" className="glmg-uv-row flow" aria-expanded={shown} onClick={() => { onToggle(flow.id) }}>
        <span className="glmg-uv-title">{shown ? '▾' : '▸'} {flow.title}</span>
        <span className="glmg-uv-state">{flow.state} · {flow.steps} 步</span>
        <MarkWord mark={flow.mark} />
      </button>
      {flow.walk === undefined ? null : <div className="glmg-uv-sub">{absoluteTime(flow.walk.at)} · {flow.walk.text}</div>}
      {shown
        ? (
            <>
              <div className="glmg-uv-sub">{flow.spec}</div>
              {flow.rows.map(row => <StepLine key={row.id} row={row} onPick={onPick} />)}
            </>
          )
        : null}
    </div>
  )
}

function RoleBlock({ role, unfolded, onToggle, onPick }: { readonly role: RoleRow, readonly unfolded: ReadonlySet<string>, readonly onToggle: (id: string) => void, readonly onPick: (id: string) => void }): ReactElement {
  return (
    <div className="glmg-uv-role" data-node={role.id}>
      <div className={`glmg-uv-head${markClass(role.mark)}`}>
        <span className="glmg-uv-title">{role.title}</span>
        <span className="glmg-uv-state">{role.state}</span>
        <MarkWord mark={role.mark} />
      </div>
      {role.flows.length === 0 ? <div className="glmg-uv-sub">还没有流程</div> : null}
      {role.flows.map(flow => <FlowBlock key={flow.id} flow={flow} unfolded={unfolded.has(flow.id)} onToggle={onToggle} onPick={onPick} />)}
    </div>
  )
}

function DevLine({ row, onPick }: { readonly row: DevRow, readonly onPick: (id: string) => void }): ReactElement {
  return (
    <div className={`glmg-uv-step${markClass(row.mark)}`} data-node={row.id} style={{ paddingLeft: `${row.depth * 14}px` }}>
      <button type="button" className="glmg-uv-row" aria-pressed={row.mark === 'selected'} onClick={() => { onPick(row.id) }}>
        <span className="glmg-uv-title">{row.depth > 0 ? '├ ' : ''}{row.title}</span>
        <span className="glmg-uv-state">{row.status}</span>
        <span className="glmg-uv-tag">服务 {row.serves} 步</span>
        {row.orphan === undefined ? null : <span className="glmg-uv-orphan">{row.orphan}</span>}
        <MarkWord mark={row.mark} />
      </button>
    </div>
  )
}

function DevColumn({ rows, onPick }: { readonly rows: readonly DevRow[], readonly onPick: (id: string) => void }): ReactElement {
  return (
    <section className="glmg-uv-col" aria-label={SIDE_WORDS.dev}>
      <div className="glmg-section">{SIDE_WORDS.dev}</div>
      {rows.length === 0 ? <div className="glmg-uv-sub">这个目标下还没有特性和任务</div> : rows.map(row => <DevLine key={row.id} row={row} onPick={onPick} />)}
    </section>
  )
}

/** The page of one goal. */
export function UserPage({ graph, goalId }: { readonly graph: LoadedGraph, readonly goalId: string }): ReactElement {
  const { open } = useServices()
  const root = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(() => new Set())
  const [side, setSide] = useState<Side>('user')
  const focused = useRef(false)
  const view = userViewOf(graph, goalId, selected, width)
  const focus = view.kind === 'ready' ? view.focus : undefined

  useLayoutEffect(() => {
    const element = root.current
    if (element === null) return undefined
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => { observer.disconnect() }
  }, [])
  // 先看到什么 (§6.2): nothing selected, the first flow that needs attention unfolded and scrolled to, once.
  useEffect(() => {
    if (focused.current || focus === undefined) return
    focused.current = true
    setUnfolded(current => new Set([...current, focus]))
    root.current?.querySelector(`[data-node="${CSS.escape(focus)}"]`)?.scrollIntoView({ block: 'start' })
  }, [focus])
  // A selection scrolls the first row it lights up into view.
  useEffect(() => {
    if (selected !== undefined) root.current?.querySelector('.linked')?.scrollIntoView({ block: 'nearest' })
  }, [selected, side])

  const pick = (id: string): void => { setSelected(current => current === id ? undefined : id) }
  const choose = (id: string): void => {
    setSelected(id)
    const type = graph.nodes.get(id)?.type
    setSide(type === 'feature' || type === 'task' ? 'dev' : 'user')
  }
  const toggle = (id: string): void => {
    setUnfolded((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape' || event.nativeEvent.isComposing || selected === undefined) return
    event.stopPropagation()
    setSelected(undefined)
  }
  const title = graph.nodes.get(goalId)?.title ?? goalId

  let content: ReactElement
  if (view.kind === 'none') content = <div className="glmg-notice">{view.text}</div>
  else if (view.kind === 'failed') {
    content = (
      <>
        <div className="glmg-notice">{view.text}</div>
        <DevColumn rows={view.dev} onPick={() => {}} />
      </>
    )
  }
  else {
    const other: Side = view.side === 'dev' ? 'user' : 'dev'
    const userColumn = (
      <section className="glmg-uv-col" aria-label={SIDE_WORDS.user}>
        <div className="glmg-section">{SIDE_WORDS.user}</div>
        {view.roles.map(role => <RoleBlock key={role.id} role={role} unfolded={unfolded} onToggle={toggle} onPick={pick} />)}
      </section>
    )
    const devColumn = <DevColumn rows={view.dev} onPick={pick} />
    content = (
      <>
        <div className="glmg-uv-band">
          <div className="glmg-text">{view.progress}</div>
          {view.gaps.map(gap => <button key={`${gap.node}:${gap.text}`} type="button" className="glmg-more" onClick={() => { choose(gap.node) }}>▸ {gap.text}</button>)}
          {view.more > 0 ? <div className="glmg-meta">还有 {view.more} 处要注意</div> : null}
        </div>
        {selected === undefined || view.side === undefined
          ? null
          : (
              <div className="glmg-uv-picked">
                <span>选中了「{graph.nodes.get(selected)?.title ?? selected}」</span>
                <button type="button" className="glmg-more" onClick={() => { open(selected) }}>打开它的页 ›</button>
                {view.layout === 'single' && view.linked > 0 && view.side === side
                  ? <button type="button" className="glmg-more" onClick={() => { setSide(other) }}>看它在{SIDE_WORDS[other]}里 ›</button>
                  : null}
                <button type="button" className="glmg-more" onClick={() => { setSelected(undefined) }}>取消（Esc）</button>
              </div>
            )}
        {view.layout === 'split'
          ? <div className="glmg-uv-cols">{userColumn}{devColumn}</div>
          : (
              <>
                <div className="glmg-uv-switch">
                  {(['user', 'dev'] as const).map(entry => <button key={entry} type="button" className="glmg-filter" aria-pressed={side === entry} onClick={() => { setSide(entry) }}>{SIDE_WORDS[entry]}</button>)}
                </div>
                {side === 'user' ? userColumn : devColumn}
              </>
            )}
      </>
    )
  }
  return (
    <div ref={root} className="glmg-view glmg-uv" onKeyDown={onKeyDown}>
      <div className="glmg-section">用户怎么用 · {title}</div>
      {content}
    </div>
  )
}
