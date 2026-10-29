/**
 * The project graph panel of one session (docs/ORCHESTRATION.md §13): four
 * views over the same live graph. 需要你 holds only what waits for the
 * human, so it opens first when anything does; agent 定的 lists what the
 * agent decided on its own; 正在做 the agents at work and the work in
 * progress; 图 the whole picture with the agents on their nodes. A node
 * opens over the current view, on a stage that does not scroll with the
 * list, so it shows wherever the list was scrolled to. Nodes opened from
 * the detail stack up: 返回 goes back one, Escape closes the detail, and
 * focus returns to what opened it. Each view opens at its top.
 */
import { Button, SegmentedTabs, TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from 'react'
import type { CommandsRemote, SessionsClient } from '../dsh.ts'
import { useAgents, useNow } from './agents.ts'
import { NowContext, ServicesContext, type PanelServices } from './common.tsx'
import { Decisions } from './Decisions.tsx'
import { Doing } from './Doing.tsx'
import { GraphCanvas } from './GraphCanvas.tsx'
import { headlineGoals } from './model.ts'
import { NeedsYou } from './NeedsYou.tsx'
import { NodeDetail } from './NodeDetail.tsx'
import { GRAPH_DIR, type GraphSource } from './source.ts'
import { PANEL_CSS } from './styles.ts'

type ViewName = 'you' | 'agent' | 'doing' | 'graph'

/** A count badge on a view tab; screen readers hear `label` after the tab name instead of a bare number. */
function Count({ value, label, quiet }: { readonly value: number, readonly label: string, readonly quiet?: boolean }): ReactElement | null {
  if (value === 0) return null
  return <><span className={quiet === true ? 'glmg-count quiet' : 'glmg-count'} aria-hidden="true">{value}</span><span className="glmg-sr">，{label}</span></>
}

/**
 * A problem banner under the tabs: what it means, the first case by file,
 * the others behind a toggle, and its own 重新读取 when reading again can
 * help (the header offers one only while the change feed is down).
 */
function Problems({ summary, lines, retry }: { readonly summary: string, readonly lines: readonly string[], readonly retry?: () => Promise<void> }): ReactElement {
  const [open, setOpen] = useState(false)
  const [reading, setReading] = useState(false)
  const shown = open ? lines : lines.slice(0, 1)
  const reread = (): void => {
    if (retry === undefined) return
    setReading(true)
    void retry().finally(() => { setReading(false) })
  }
  return (
    <div className="glmg-tabs">
      <div className="glmg-notice" role="status">
        {summary}
        {shown.map(line => <div key={line} className="glmg-notice-sub">{line}</div>)}
        {lines.length > 1 || retry !== undefined
          ? (
              <div className="glmg-notice-actions">
                {lines.length > 1 ? <button type="button" className="glmg-more" aria-expanded={open} onClick={() => { setOpen(!open) }}>{open ? '收起' : `还有 ${lines.length - 1} 处`}</button> : null}
                {retry === undefined ? null : <button type="button" className="glmg-more" disabled={reading} onClick={reread}>{reading ? '正在读…' : '重新读取'}</button>}
              </div>
            )
          : null}
      </div>
    </div>
  )
}

export interface GraphPanelProps {
  readonly source: GraphSource
  readonly commands: CommandsRemote
  readonly sessions: SessionsClient
  readonly sessionId: string
}

export function GraphPanel({ source, commands, sessions, sessionId }: GraphPanelProps): ReactElement {
  const snapshot = useSyncExternalStore(source.subscribe, source.getSnapshot)
  const agents = useAgents(sessions, sessionId)
  const now = useNow(agents.some(agent => agent.running))
  const [view, setView] = useState<ViewName | undefined>(undefined)
  /** The opened nodes, the shown one last. */
  const [trail, setTrail] = useState<readonly string[]>([])
  const selected = trail.at(-1)
  const depth = useRef(0)
  depth.current = trail.length
  /** What had focus when the detail opened (a row, a link, or a graph node, which is an SVG element); it gets focus back when the detail closes. */
  const opener = useRef<HTMLElement | SVGElement | null>(null)
  const body = useRef<HTMLDivElement | null>(null)
  const tabsId = useId()
  const open = useCallback((id: string) => {
    if (depth.current === 0) opener.current = document.activeElement instanceof HTMLElement || document.activeElement instanceof SVGElement ? document.activeElement : null
    setTrail(current => current.at(-1) === id ? current : [...current, id])
  }, [])
  const services = useMemo<PanelServices>(() => ({ commands, sessionId, open }), [commands, sessionId, open])

  const waiting = snapshot.status === 'ready' ? snapshot.items.questions.length + snapshot.items.proposals.length : 0
  // The first view: 需要你 when anything waits, else 正在做. It stays put afterwards, so settling the last card shows the empty state.
  const shown: ViewName = view ?? (waiting > 0 ? 'you' : 'doing')
  useEffect(() => {
    if (view === undefined && snapshot.status === 'ready') setView(shown)
  }, [view, snapshot.status, shown])
  // A new view starts at its top with no detail open.
  useLayoutEffect(() => {
    setTrail(current => current.length === 0 ? current : [])
    if (body.current !== null) body.current.scrollTop = 0
  }, [shown])
  // While the detail is open the list behind it takes no focus; on close the opener gets it back.
  const detailOpen = selected !== undefined
  useEffect(() => {
    const element = body.current
    if (element !== null) element.inert = detailOpen
    if (detailOpen) return
    const target = opener.current
    opener.current = null
    if (target?.isConnected === true) target.focus()
  }, [detailOpen])

  if (snapshot.status !== 'ready') {
    return (
      <div className="glmg">
        <style>{PANEL_CSS}</style>
        <div className="glmg-body">
          {snapshot.status === 'loading'
            ? <div className="glmg-empty"><TextShimmer active>正在读项目图…</TextShimmer></div>
            : (
                <div className="glmg-empty">
                  <span className="glmg-empty-title">{snapshot.status === 'missing' ? '这个工作区还没有项目图' : '项目图读不出来'}</span>
                  <span>{snapshot.status === 'missing' ? `项目图放在工作区的 ${GRAPH_DIR}/nodes 下；建一个空目录就是一张空图。` : snapshot.message}</span>
                  <Button variant="outline" size="sm" onClick={() => { void source.retry() }}>重新读取</Button>
                </div>
              )}
        </div>
      </div>
    )
  }

  const { graph, items, live, unreadable } = snapshot
  const goalTitles = headlineGoals(graph).map(goal => goal.title)
  const agentPending = items.agentQueue.length
  const errors = graph.issues.filter(issue => issue.severity === 'error')
  const doingCount = items.doing.filter(entry => entry.type !== 'goal').length
  const tabs: { readonly value: ViewName, readonly label: ReactElement }[] = [
    { value: 'you', label: <>需要你<Count value={waiting} label={`${waiting} 项`} /></> },
    { value: 'agent', label: <>agent 定的<Count value={agentPending} label={`待定 ${agentPending} 项`} quiet /></> },
    { value: 'doing', label: <>正在做<Count value={doingCount} label={`${doingCount} 项`} quiet /></> },
    { value: 'graph', label: <>图</> },
  ]
  // One tab panel: the body shows whichever view is selected.
  const panelId = `${tabsId}-panel`
  return (
    <ServicesContext.Provider value={services}>
      <NowContext.Provider value={now}>
      <div className="glmg">
        <style>{PANEL_CSS}</style>
        <div className="glmg-head">
          <span className="glmg-goal" title={goalTitles.length === 0 ? undefined : goalTitles.join('\n')}>{goalTitles.length === 0 ? '项目图' : goalTitles.join(' · ')}</span>
          <span className={live ? 'glmg-live' : 'glmg-live off'} title={live ? '图文件一变，这里就跟着变' : '没在跟踪文件变化，点重新读取'}>
            <i />{live ? '实时' : <button type="button" className="glmg-more" onClick={() => { void source.retry() }}>重新读取</button>}
          </span>
        </div>
        <div className="glmg-tabs">
          <SegmentedTabs
            label="项目图视图"
            value={shown}
            onChange={next => { setView(next) }}
            items={tabs.map(tab => ({ ...tab, id: `${tabsId}-${tab.value}`, panelId }))}
          />
        </div>
        {errors.length === 0 ? null : <Problems summary={`图里有 ${errors.length} 处校验错误，写入会被拒绝。让 agent 看一下，或用 git 还原节点文件。`} lines={errors.map(issue => `${issue.file}${issue.field === undefined ? '' : ` ${issue.field}`}：${issue.message}`)} />}
        {unreadable.length === 0 ? null : <Problems summary={`面板读不出 ${unreadable.length} 个节点文件，这些节点没有显示。`} lines={unreadable.map(entry => `${entry.file}：${entry.message}`)} retry={() => source.retry()} />}
        <div className="glmg-stage">
          <div ref={body} className="glmg-body" role="tabpanel" id={panelId} aria-labelledby={`${tabsId}-${shown}`} style={shown === 'graph' ? { overflow: 'hidden', padding: 0 } : undefined}>
            {shown === 'you' ? <NeedsYou key="you" graph={graph} items={items} onShowDecisions={() => { setView('agent') }} /> : null}
            {shown === 'agent' ? <Decisions key="agent" graph={graph} items={items} /> : null}
            {shown === 'doing' ? <Doing key="doing" graph={graph} items={items} agents={agents} /> : null}
            {shown === 'graph' ? <GraphCanvas graph={graph} selected={selected} onPick={open} agents={agents} /> : null}
          </div>
          {selected === undefined
            ? null
            : <NodeDetail key={selected} graph={graph} id={selected} agents={agents} onBack={() => { setTrail(current => current.slice(0, -1)) }} onClose={() => { setTrail([]) }} />}
        </div>
      </div>
      </NowContext.Provider>
    </ServicesContext.Provider>
  )
}
