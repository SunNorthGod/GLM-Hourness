/**
 * The project graph panel of one session (docs/ORCHESTRATION.md §13), the
 * home page of plain-ui 1.3 (§4.1, §4.2): one page, five sections — 效果是,
 * 需要你, 现在, 怎么做 · 接下来, 上次看之后 — no tabs. The second layer
 * opens over it in a frame with 返回 and Escape: the pages (需要你全部,
 * 怎么做, 现场, 上次看之后, 框架与模块, 整张图, and a goal's 用户怎么用 from
 * its home line, its node page or the footer), the node pages stacked as
 * the trail, and the registered boards' pages (M5 §8.2), each board
 * bounded by its own error boundary. The panel only looks (plain-ui,
 * d-ui-look-not-operate); 展开 and navigation are its only clicks.
 * 上次看之后 runs on seen.ts: the mount is the arrival and reads the last
 * departure from the browser's local storage, keyed by the graph's
 * absolute nodes directory; visible is the window's focus, with the
 * intersection observer as a veto (seen.ts watchVisibility). The main chat's result (MainChat.tsx) is computed once here
 * and handed to every view through its context; it also decides the
 * 「现在」line's subject (mainHere) and whose session's awaiting the needs
 * read (plain-ui 1.3 §4.9).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from 'react'
import { changesSince, modulesView, needsOf, planOf } from '../../../src/graph/plain-view.ts'
import type { LoadedGraph } from '../../../src/graph/parse.ts'
import type { AwaitingEntry, RequestLiveEntry } from '../../../src/graph/live.ts'
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
import { openerOf } from './main-chat.ts'
import { MainChatContext, useMainAgent } from './MainChat.tsx'
import { NeedsPage } from './NeedsYou.tsx'
import { LiveSection } from './Live.tsx'
import { headlineGoals } from './model.ts'
import { ModulesPage } from './Modules.tsx'
import { Frame, NodeDetail } from './NodeDetail.tsx'
import { PlanPage } from './Plan.tsx'
import { type GraphSource } from './source.ts'
import { initialSeen, nextSeen, seenKeyOf, seenRecordOf, watchVisibility, writeSeenRecord, type SeenEvent, type VisibilityHost } from './seen.ts'
import { PANEL_CSS } from './styles.ts'
import { hasUserPage } from './user-view.ts'
import { UserPage } from './UserView.tsx'
import { firstVisit, graphHasHumanActorHistory } from '../guide/state.ts'

/** A second-layer page, or the home when undefined. */
type PageId = 'needs' | 'plan' | 'live' | 'changes' | 'decided' | 'modules' | 'graph' | 'user'

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

/** The real window and body for watchVisibility: focus and blur on the window, an IntersectionObserver on the body when it is there. */
function windowVisibility(element: HTMLElement | null): VisibilityHost {
  return {
    hasFocus: () => document.hasFocus(),
    onFocusChange: (listener) => {
      window.addEventListener('focus', listener)
      window.addEventListener('blur', listener)
      return () => {
        window.removeEventListener('focus', listener)
        window.removeEventListener('blur', listener)
      }
    },
    ...(element === null || typeof IntersectionObserver !== 'function'
      ? {}
      : {
          observe: (listener: (intersecting: boolean) => void) => {
            const observer = new IntersectionObserver(entries => { listener(entries.at(-1)?.isIntersecting === true) })
            observer.observe(element)
            return () => { observer.disconnect() }
          },
        }),
  }
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
  /** The goal whose 用户怎么用 page is open (user graph design 0.4.1 §6.1). */
  const [userGoal, setUserGoal] = useState<string | undefined>(undefined)
  /** The goal whose 模块页 was opened from the home page. */
  const [moduleGoal, setModuleGoal] = useState<string | undefined>(undefined)
  const [seen, setSeen] = useState(initialSeen)
  const selected = trail.at(-1)
  const depth = useRef(0)
  depth.current = trail.length
  const covered = page !== undefined || boardId !== undefined || selected !== undefined
  const coveredRef = useRef(false)
  coveredRef.current = covered
  /** What had focus when a layer opened; it gets focus back when everything closed. */
  const opener = useRef<HTMLElement | SVGElement | null>(null)
  /** What had focus inside a second-layer page when a node detail opened over it. */
  const trailOpener = useRef<HTMLElement | SVGElement | null>(null)
  const body = useRef<HTMLDivElement>(null)
  /** The seen machine's state as the events left it: an unmount writes its departure from here, where a state update would be dropped. */
  const seenNow = useRef(initialSeen)
  /** The body's visibility as state: it bounds the main chat's read window. */
  const [bodyVisible, setBodyVisible] = useState(false)
  /**
   * The guide page (plain-ui 1.3 §6.4): undefined until the first-visit
   * rule has been answered (it needs the graph's history), then whether
   * the page stands instead of the home. 手动打开 works without a graph.
   */
  const [guide, setGuide] = useState<boolean | undefined>(undefined)
  const captureOpener = useCallback(() => {
    if (!coveredRef.current) {
      opener.current = document.activeElement instanceof HTMLElement || document.activeElement instanceof SVGElement ? document.activeElement : null
    }
  }, [])
  const open = useCallback((id: string) => {
    const active = document.activeElement instanceof HTMLElement || document.activeElement instanceof SVGElement ? document.activeElement : null
    if (!coveredRef.current) opener.current = active
    else if (depth.current === 0) trailOpener.current = active
    setTrail(current => current.at(-1) === id ? current : [...current, id])
  }, [])
  const services = useMemo<PanelServices>(() => ({ open }), [open])
  // This session's projection values: the live views' awaiting, and whether this agent is the project's main agent.
  const projections = useSyncExternalStore(
    useCallback((listener: () => void) => sessions.list.subscribe(listener), [sessions]),
    () => sessions.list.getSnapshot().projectionsBySession,
  )
  const values = projections[sessionId]?.values
  const main = useMainAgent(sessionId, { sessions, files, openSession: openerOf(workspace) }, bodyVisible)
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
  // The request plans ride the same session: the main agent files every request, a worker's goes through it (m4-request-card design §5.8).
  const requests: readonly RequestLiveEntry[] = holderId !== undefined ? holderValues?.graphLive?.requests ?? [] : values?.graphLive?.requests ?? []
  const graph: LoadedGraph | undefined = snapshot.status === 'ready' ? snapshot.graph : undefined
  // The first-visit rule needs the graph's history; answered once, at the first ready snapshot (§6.4).
  useEffect(() => {
    if (guide !== undefined || snapshot.status !== 'ready') return
    setGuide(firstVisit(window.localStorage, graphHasHumanActorHistory(snapshot.graph)))
  }, [guide, snapshot])

  // The needs list and the view models, from one graph; empty stand-ins while the graph reads.
  const needs = useMemo(() => graph === undefined ? [] : needsOf(graph, awaiting, requests, now), [graph, awaiting, requests, now])
  const quiet = useMemo(
    () => new Set(needs.map(need => need.node?.id).filter(id => id !== undefined)),
    [needs],
  )
  const modules = useMemo(() => graph === undefined ? null : modulesView(graph, awaiting), [graph, awaiting])

  // The local record's key follows the absolute nodes directory the reads came from (seen.ts, plain-ui 1.3 §6.8).
  const nodesAbsolute = snapshot.status === 'ready' ? source.nodesDirAbsolute() : undefined
  const seenKey = nodesAbsolute === undefined ? undefined : seenKeyOf(nodesAbsolute)

  // Visible (seen.ts watchVisibility): the window's focus, the observer on the body as a veto; it also bounds the main chat's reads.
  const ready = snapshot.status === 'ready'
  useEffect(() => watchVisibility(windowVisibility(body.current), setBodyVisible), [ready])
  // 上次看之后 (seen.ts): the mount is an arrival, visibility moves the window, the unmount may be a departure.
  useEffect(() => {
    if (seenKey === undefined) return undefined
    const step = (event: SeenEvent): void => {
      const { state, departure } = nextSeen(seenNow.current, event, Date.now(), seenRecordOf(window.localStorage, seenKey))
      if (departure !== undefined) writeSeenRecord(window.localStorage, seenKey, departure)
      seenNow.current = state
      setSeen(state)
    }
    step('mount')
    return () => { step('unmount') }
  }, [seenKey])
  useEffect(() => {
    if (seenKey === undefined) return
    const { state, departure } = nextSeen(seenNow.current, bodyVisible ? 'visible' : 'hidden', Date.now(), seenRecordOf(window.localStorage, seenKey))
    if (departure !== undefined) writeSeenRecord(window.localStorage, seenKey, departure)
    seenNow.current = state
    setSeen(state)
  }, [seenKey, bodyVisible])
  const closeLayer = useCallback((): void => {
    setPage(undefined)
    setBoardId(undefined)
    setUserGoal(undefined)
    setModuleGoal(undefined)
    setTrail(current => current.length === 0 ? current : [])
  }, [])
  const openPage = useCallback((next: PageId): void => {
    captureOpener()
    setTrail([])
    setBoardId(undefined)
    setUserGoal(undefined)
    setModuleGoal(undefined)
    setGuide(false)
    setPage(next)
  }, [captureOpener])
  const openModules = useCallback((goalId: string): void => {
    captureOpener()
    setTrail([])
    setBoardId(undefined)
    setUserGoal(undefined)
    setGuide(false)
    setModuleGoal(goalId)
    setPage('modules')
  }, [captureOpener])
  const openUser = useCallback((goalId: string): void => {
    captureOpener()
    setTrail([])
    setBoardId(undefined)
    setModuleGoal(undefined)
    setGuide(false)
    setUserGoal(goalId)
    setPage('user')
  }, [captureOpener])
  const openBoardPage = useCallback((id: string, clearGuide = false): void => {
    captureOpener()
    setTrail([])
    setPage(undefined)
    setUserGoal(undefined)
    setModuleGoal(undefined)
    if (clearGuide) setGuide(false)
    setBoardId(id)
  }, [captureOpener])
  const openGuide = useCallback((): void => {
    setTrail([])
    setPage(undefined)
    setBoardId(undefined)
    setUserGoal(undefined)
    setModuleGoal(undefined)
    setGuide(true)
  }, [])
  const prevSessionId = useRef(sessionId)
  useEffect(() => {
    if (prevSessionId.current === sessionId) return
    prevSessionId.current = sessionId
    opener.current = null
    trailOpener.current = null
    holderAsked.current = undefined
    setGuide(undefined)
    setPage(undefined)
    setTrail([])
    setBoardId(undefined)
    setUserGoal(undefined)
    setModuleGoal(undefined)
  }, [sessionId])
  const prevSelected = useRef<string | undefined>(undefined)
  useLayoutEffect(() => {
    const wasSelected = prevSelected.current !== undefined
    prevSelected.current = selected
    if (!wasSelected || selected !== undefined || !covered) return
    const target = trailOpener.current
    trailOpener.current = null
    if (target?.isConnected === true) target.focus()
  }, [selected, covered])
  // While a layer is open the list behind it takes no focus; on close the opener gets it back; a page starts at its top.
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

  const openBoard = boardId === undefined ? undefined : boards().find(board => board.id === boardId)

  if (snapshot.status !== 'ready' || graph === undefined) {
    // 没有项目图的一节 (plain-ui 1.3 §6.6): bootstrap 启用后指向 /wish；上手说明 opens manually, without a graph.
    return (
      <div className="glmg">
        <style>{PANEL_CSS}</style>
        <div className="glmg-stage">
          <div ref={body} className="glmg-body">
            {guide === true
              ? <GuidePage sessionId={sessionId} onOpenBoard={id => { openBoardPage(id) }} onDone={() => { setGuide(false) }} />
              : snapshot.status === 'loading'
                ? <div className="glmg-empty"><span className="glmg-empty-title">正在读项目图…</span></div>
                : (
                    <div className="glmg-empty">
                      <span className="glmg-empty-title">{snapshot.status === 'missing' ? '这个工作区还没有项目图' : '项目图读不出来'}</span>
                      <span>{snapshot.status === 'missing' ? '项目图记下这个项目要做成什么、接下来做什么、哪些要你回话。有了它，主 Agent 才能接手。' : snapshot.status === 'failed' ? snapshot.message : ''}</span>
                      {snapshot.status === 'missing' ? <span>在对话里打 /wish：主 Agent 会接管这里，问清要做什么，项目图随之建起来。</span> : null}
                      <div className="glmg-actions">
                        <button type="button" className="glmg-more" onClick={() => { void source.retry() }}>重新读取</button>
                        <button type="button" className="glmg-more" onClick={openGuide}>上手说明 ›</button>
                      </div>
                    </div>
                  )}
          </div>
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
      </div>
    )
  }

  const { items, live, unreadable } = snapshot
  const goalTitles = headlineGoals(graph).map(goal => goal.title)
  const errors = graph.issues.filter(issue => issue.severity === 'error')
  const goalTitle = (id: string): string | undefined => graph.nodes.get(id)?.title
  const footUser = headlineGoals(graph).find(goal => hasUserPage(graph, goal))
  const pageBody = page === 'user' && userGoal !== undefined
    ? <UserPage graph={graph} goalId={userGoal} />
    : page === 'needs'
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
            ? modules === null ? <div className="glmg-notice">图上还没有方向清单，两层循环的显示不出现。</div> : <ModulesPage graph={graph} view={modules} focusGoalId={moduleGoal} />
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
                ? <GuidePage sessionId={sessionId} onOpenBoard={id => { openBoardPage(id) }} onDone={() => { setGuide(false) }} />
                : (
                    <Home
                      graph={graph}
                      agents={agents}
                      awaiting={awaiting}
                      requests={requests}
                      since={seen.since}
                      quiet={quiet}
                      sessionId={sessionId}
                      mainHere={mainHere}
                      onPlan={() => { openPage('plan') }}
                      onChanges={() => { openPage('changes') }}
                      onLive={() => { openPage('live') }}
                      onNeeds={() => { openPage('needs') }}
                      onModules={openModules}
                      onUser={openUser}
                      onBoard={id => { openBoardPage(id) }}
                    />
                  )}
            </div>
            {page !== undefined
              ? (
                  <Frame onBack={closeLayer} onClose={closeLayer} flush={page === 'graph'} inert={selected !== undefined}>
                    <PanelBoundary key={page} label="这一页">
                      {pageBody}
                    </PanelBoundary>
                  </Frame>
                )
              : null}
            {selected !== undefined
              ? <NodeDetail key={selected} graph={graph} id={selected} agents={agents} onBack={() => { setTrail(current => current.slice(0, -1)) }} onClose={closeLayer} onUserPage={openUser} />
              : null}
            {openBoard !== undefined && page === undefined && selected === undefined
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
            {boards().map(board => <BoardLine key={board.id} board={board} sessionId={sessionId} onOpen={() => { openBoardPage(board.id, true) }} />)}
            <button type="button" className="glmg-more" onClick={openGuide}>上手说明 ›</button>
            {footUser === undefined ? null : <button type="button" className="glmg-more" onClick={() => { openUser(footUser.id) }}>用户怎么用 ›</button>}
            <button type="button" className="glmg-more" onClick={() => { openPage('graph') }}>整张图 ›</button>
          </div>
        </div>
        </NowContext.Provider>
      </ServicesContext.Provider>
    </MainChatContext.Provider>
  )
}

