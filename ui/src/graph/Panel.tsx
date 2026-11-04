/**
 * The project graph panel of one session (docs/ORCHESTRATION.md §13), the
 * home page of plain-ui 1.3 (§4.1, §4.2): one page, five sections — 效果是,
 * 需要你, 现在, 怎么做 · 接下来, 上次看之后 — no tabs. The second layer
 * opens over it in a frame with 返回 and Escape: the pages (需要你全部,
 * 怎么做, 现场, 上次看之后, 框架与模块, 整张图), the node pages stacked as
 * the trail, and the registered boards' pages (M5 §8.2), each board
 * bounded by its own error boundary. The panel only looks (plain-ui,
 * d-ui-look-not-operate); 展开 and navigation are its only clicks.
 * 上次看之后 runs on seen.ts: the arrival reads the last departure from
 * the browser's local storage, keyed by the graph's absolute nodes
 * directory. The main chat's result (MainChat.tsx) is computed once here
 * and handed to every view through its context; it also decides the
 * 「现在」line's subject (mainHere) and whose session's awaiting the needs
 * read (plain-ui 1.3 §4.9).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from 'react'
import { changesSince, modulesView, needsOf, planOf } from '../../../src/graph/plain-view.ts'
import type { LoadedGraph } from '../../../src/graph/parse.ts'
import type { AwaitingEntry } from '../../../src/graph/live.ts'
import type { SessionsClient, UiWorkspace, WorkspaceFilesRemote } from '../dsh.ts'
import { useAgents, useNow } from './agents.ts'
import { useBoard } from './board-state.ts'
import { boards, type Board } from './boards.ts'
import { ChangesPage } from './Changes.tsx'
import { NowContext, PanelBoundary, ServicesContext, type PanelServices } from './common.tsx'
import { Decisions } from './Decisions.tsx'
import { GraphCanvas } from './GraphCanvas.tsx'
import { GuidePage } from './Guide.tsx'
import { Home } from './Home.tsx'
import { MainChatContext, useMainAgent } from './MainChat.tsx'
import { NeedsPage } from './NeedsYou.tsx'
import { LiveSection } from './Live.tsx'
import { ModulesPage } from './Modules.tsx'
import { Frame, NodeDetail } from './NodeDetail.tsx'
import { PlanPage } from './Plan.tsx'
import { GRAPH_DIR, type GraphSource } from './source.ts'
import { initialSeen, nextSeen, seenKeyOf, seenRecordOf, writeSeenRecord } from './seen.ts'
import { PANEL_CSS } from './styles.ts'
import { firstVisit, graphHasHumanActorHistory } from '../guide/state.ts'

/** A second-layer page, or the home when undefined. */
type PageId = 'needs' | 'plan' | 'live' | 'changes' | 'decided' | 'modules' | 'graph'

/**
 * A problem banner: what it means, the first case by file, the others
 * behind a toggle, and its own 重新读取 when reading again can help.
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
  )
}

// --- The registered boards (plain-ui 1.3 §4.7, M5 §8.2) ----------------------

/** The footer's entry of one board; hooks run here, not in the footer's loop. */
function BoardLine({ board, sessionId, onOpen }: { readonly board: Board, readonly sessionId: string, readonly onOpen: () => void }): ReactElement | null {
  const state = useBoard(board, sessionId)
  if (!state.available) return null
  return <button type="button" className="glmg-more" onClick={onOpen}>{board.label} ›</button>
}

export interface GraphPanelProps {
  readonly source: GraphSource
  readonly sessions: SessionsClient
  readonly files: WorkspaceFilesRemote
  readonly workspace: UiWorkspace
  readonly sessionId: string
}

export function GraphPanel({ source, sessions, files, workspace, sessionId }: GraphPanelProps): ReactElement {
  const snapshot = useSyncExternalStore(source.subscribe, source.getSnapshot)
  const agents = useAgents(sessions, sessionId)
  const now = useNow(agents.some(agent => agent.running))
  /** The open second-layer page, when one is. */
  const [page, setPage] = useState<PageId | undefined>(undefined)
  /** The opened nodes, the shown one last. */
  const [trail, setTrail] = useState<readonly string[]>([])
  /** The board whose page is open. */
  const [boardId, setBoardId] = useState<string | undefined>(undefined)
  /** The absolute graph directory, for the local record's key; read once. */
  const [graphDirAbs, setGraphDirAbs] = useState<string | undefined>(undefined)
  const [seen, setSeen] = useState(initialSeen)
  const selected = trail.at(-1)
  const depth = useRef(0)
  depth.current = trail.length
  /** What had focus when a layer opened; it gets focus back when everything closed. */
  const opener = useRef<HTMLElement | SVGElement | null>(null)
  const body = useRef<HTMLDivElement>(null)
  /** Whether the body intersects the viewport, as the observer last said. */
  const shown = useRef(false)
  /** The body's visibility as state: it bounds the main chat's read window. */
  const [bodyVisible, setBodyVisible] = useState(false)
  /**
   * The guide page (plain-ui 1.3 §6.4): undefined until the first-visit
   * rule has been answered (it needs the graph's history), then whether
   * the page stands instead of the home. 手动打开 works without a graph.
   */
  const [guide, setGuide] = useState<boolean | undefined>(undefined)
  const open = useCallback((id: string) => {
    if (depth.current === 0) opener.current = document.activeElement instanceof HTMLElement || document.activeElement instanceof SVGElement ? document.activeElement : null
    setTrail(current => current.at(-1) === id ? current : [...current, id])
  }, [])
  const services = useMemo<PanelServices>(() => ({ open }), [open])
  // This session's projection values: the live views' awaiting, and whether this agent is the project's main agent.
  const projections = useSyncExternalStore(
    useCallback((listener: () => void) => sessions.list.subscribe(listener), [sessions]),
    () => sessions.list.getSnapshot().projectionsBySession,
  )
  const values = projections[sessionId]?.values
  const main = useMainAgent(sessionId, { sessions, files, openSession: workspace.openSession }, bodyVisible)
  // The main agent's awaiting lives in its session's graphLive; when it is another session, ask the host once for its values.
  const holderId = main.chat?.kind === 'there' ? main.chat.sessionId : undefined
  const holderAsked = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (holderId === undefined || projections[holderId] !== undefined || holderAsked.current === holderId) return
    holderAsked.current = holderId
    void sessions.refreshProjections(holderId).catch(() => {})
  }, [holderId, projections, sessions])
  const holderValues = holderId === undefined ? undefined : projections[holderId]?.values
  const mainHere = main.chat?.kind === 'here' === true
  const awaiting: readonly AwaitingEntry[] = holderId !== undefined ? holderValues?.graphLive?.awaiting ?? [] : values?.graphLive?.awaiting ?? []
  const graph: LoadedGraph | undefined = snapshot.status === 'ready' ? snapshot.graph : undefined
  // The first-visit rule needs the graph's history; answered once, at the first ready snapshot (§6.4).
  useEffect(() => {
    if (guide !== undefined || snapshot.status !== 'ready') return
    setGuide(firstVisit(window.localStorage, graphHasHumanActorHistory(snapshot.graph)))
  }, [guide, snapshot])

  // The needs list and the view models, from one graph; empty stand-ins while the graph reads.
  const needs = useMemo(() => graph === undefined ? [] : needsOf(graph, awaiting), [graph, awaiting])
  const quiet = useMemo(
    () => new Set(needs.map(need => need.node?.id).filter(id => id !== undefined)),
    [needs],
  )
  const modules = useMemo(() => graph === undefined ? null : modulesView(graph, awaiting), [graph, awaiting])

  // The absolute path of the graph directory, once: the local record's key follows it.
  useEffect(() => {
    let live = true
    void source.statAbsolute().then(path => { if (live && path !== null) setGraphDirAbs(path) }).catch(() => {})
    return () => { live = false }
  }, [source])
  const seenKey = graphDirAbs === undefined ? undefined : seenKeyOf(`${graphDirAbs}/nodes`)

  // The panel body's visibility decides both the seen window (seen.ts) and the main chat's read timing.
  useEffect(() => {
    const apply = (intersecting: boolean): void => {
      const event = intersecting && document.visibilityState === 'visible' ? 'visible' : 'hidden'
      setBodyVisible(event === 'visible')
      if (seenKey === undefined) return
      const at = Date.now()
      setSeen(current => {
        const { state, departure } = nextSeen(current, event, at, seenRecordOf(window.localStorage, seenKey))
        if (departure !== undefined) writeSeenRecord(window.localStorage, seenKey, departure)
        return state
      })
    }
    const observer = new IntersectionObserver(entries => {
      const intersecting = entries[0]?.isIntersecting === true
      if (intersecting === shown.current) return
      shown.current = intersecting
      apply(intersecting)
    })
    if (body.current !== null) observer.observe(body.current)
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') apply(shown.current)
      else apply(false)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      apply(false)
    }
  }, [seenKey])

  const closeLayer = useCallback((): void => {
    setPage(undefined)
    setBoardId(undefined)
    setTrail(current => current.length === 0 ? current : [])
  }, [])
  // While a layer is open the list behind it takes no focus; on close the opener gets it back; a page starts at its top.
  const covered = page !== undefined || boardId !== undefined || selected !== undefined
  useLayoutEffect(() => {
    const element = body.current
    if (element !== null) {
      element.inert = covered
      if (covered) element.scrollTop = 0
    }
    if (covered) return
    const target = opener.current
    opener.current = null
    if (target?.isConnected === true) target.focus()
  }, [covered])

  if (snapshot.status !== 'ready' || graph === undefined) {
    // 没有项目图的一节 (plain-ui 1.3 §6.6): the 接管行 is not registered on main, so the wording is the without-bootstrap branch; 上手说明 opens manually, without a graph.
    return (
      <div className="glmg">
        <style>{PANEL_CSS}</style>
        {guide === true
          ? (
              <div className="glmg-body">
                <GuidePage sessionId={sessionId} onOpenBoard={() => {}} onDone={() => { setGuide(false) }} />
              </div>
            )
            : (
                <div className="glmg-body">
                  {snapshot.status === 'loading'
                    ? <div className="glmg-empty"><span className="glmg-empty-title">正在读项目图…</span></div>
                    : (
                        <div className="glmg-empty">
                          <span className="glmg-empty-title">{snapshot.status === 'missing' ? '这个工作区还没有项目图' : '项目图读不出来'}</span>
                          <span>{snapshot.status === 'missing' ? '项目图记下这个项目要做成什么、接下来做什么、哪些要你回话。有了它，主 Agent 才能接手。' : snapshot.status === 'failed' ? snapshot.message : ''}</span>
                          {snapshot.status === 'missing' ? <span>在对话里让 agent 建空目录 {GRAPH_DIR}/nodes，面板会自己跟上。</span> : null}
                          <div className="glmg-actions">
                            <button type="button" className="glmg-more" onClick={() => { void source.retry() }}>重新读取</button>
                            <button type="button" className="glmg-more" onClick={() => { setGuide(true) }}>上手说明 ›</button>
                          </div>
                        </div>
                      )}
                </div>
              )}
      </div>
    )
  }

  const { items, live, unreadable } = snapshot
  const goalTitles = [...graph.nodes.values()].filter(node => node.type === 'goal').map(goal => goal.title)
  const errors = graph.issues.filter(issue => issue.severity === 'error')
  const openBoard = boardId === undefined ? undefined : boards().find(board => board.id === boardId)
  // A plain closure, not useCallback: a hook here would change the panel's hook order between the
  // not-ready early return above and this branch — React 18.3.1's error #310 on the desktop
  // (keepMounted tab, session switch between a workspace without a graph and one with one).
  // Its only consumer (PlanPage) re-renders whenever the panel does, so the identity never mattered.
  const goalTitle = (id: string): string | undefined => graph.nodes.get(id)?.title
  const pageBody = page === 'needs'
    ? <NeedsPage graph={graph} needs={needs} />
    : page === 'plan'
      ? <PlanPage graph={graph} plan={planOf(graph, now, agents.find(agent => agent.main && agent.running)?.view?.focus ?? undefined)} goalTitle={goalTitle} />
      : page === 'live'
        ? <LiveSection graph={graph} agents={agents} tasks={items.doing.filter(entry => entry.type !== 'goal').length} />
        : page === 'changes'
          ? <ChangesPage rows={changesSince(graph, seen.since === undefined ? new Date(now - 24 * 60 * 60 * 1000).toISOString() : new Date(seen.since).toISOString(), quiet)} onDecided={() => { setPage('decided') }} />
          : page === 'decided'
            ? <Decisions graph={graph} items={items} />
          : page === 'modules'
            ? modules === null ? <div className="glmg-notice">图上还没有方向清单，两层循环的显示不出现。</div> : <ModulesPage graph={graph} view={modules} />
            : <GraphCanvas graph={graph} selected={selected} onPick={open} agents={agents} />

  return (
    <MainChatContext.Provider value={main}>
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
          {errors.length === 0 ? null : <Problems summary={`图里有 ${errors.length} 处校验错误，写入会被拒绝。让 agent 看一下，或用 git 还原节点文件。`} lines={errors.map(issue => `${issue.file}${issue.field === undefined ? '' : ` ${issue.field}`}：${issue.message}`)} />}
          {unreadable.length === 0 ? null : <Problems summary={`面板读不出 ${unreadable.length} 个节点文件，这些节点没有显示。`} lines={unreadable.map(entry => `${entry.file}：${entry.message}`)} retry={() => source.retry()} />}
          <div className="glmg-stage">
            <div ref={body} className="glmg-body">
              {guide === true
                ? <GuidePage sessionId={sessionId} onOpenBoard={id => { setBoardId(id) }} onDone={() => { setGuide(false) }} />
                : (
                    <Home
                      graph={graph}
                      agents={agents}
                      awaiting={awaiting}
                      since={seen.since}
                      quiet={quiet}
                      sessionId={sessionId}
                      mainHere={mainHere}
                      onPlan={() => { setPage('plan') }}
                      onChanges={() => { setPage('changes') }}
                      onLive={() => { setPage('live') }}
                      onNeeds={() => { setPage('needs') }}
                      onModules={() => { setPage('modules') }}
                      onBoard={id => { setBoardId(id) }}
                    />
                  )}
            </div>
            {selected !== undefined
              ? (
                  <Frame onBack={() => { setTrail(current => current.slice(0, -1)) }} onClose={closeLayer}>
                    <NodeDetail key={selected} graph={graph} id={selected} agents={agents} onBack={() => { setTrail(current => current.slice(0, -1)) }} onClose={closeLayer} />
                  </Frame>
                )
              : null}
            {page !== undefined && selected === undefined
              ? (
                  <Frame onBack={closeLayer} onClose={closeLayer}>
                    <PanelBoundary key={page} label="这一页">
                      {pageBody}
                    </PanelBoundary>
                  </Frame>
                )
              : null}
            {openBoard !== undefined
              ? (
                  <Frame onBack={closeLayer} onClose={closeLayer}>
                    <PanelBoundary key={openBoard.id} label={`${openBoard.label}页`}>
                      <openBoard.Page sessionId={sessionId} />
                    </PanelBoundary>
                  </Frame>
                )
              : null}
          </div>
          <div className="glmg-foot">
            {boards().map(board => <BoardLine key={board.id} board={board} sessionId={sessionId} onOpen={() => { setBoardId(board.id) }} />)}
            <button type="button" className="glmg-more" onClick={() => { setGuide(true) }}>上手说明 ›</button>
            <button type="button" className="glmg-more" onClick={() => { setPage('graph') }}>整张图 ›</button>
          </div>
        </div>
        </NowContext.Provider>
      </ServicesContext.Provider>
    </MainChatContext.Provider>
  )
}

