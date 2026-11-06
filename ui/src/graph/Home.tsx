/**
 * The home page (plain-ui 1.3 §4.2, mockup-home.svg): five sections from
 * top to bottom — 效果是, 需要你, 现在, 怎么做 · 接下来, 上次看之后 — no
 * tabs, every section at most five rows, the rest behind a 讲细点 that
 * opens the second-layer page. A goal with a user graph leads 效果是 with
 * its flow progress (user-view.ts). Everything else is computed by plain-view.ts
 * from the current graph and the session's live views; the boards' lines
 * come from the registration table. A graph without any node shows only
 * 效果是 with the way to start (§4.10). The panel only looks.
 */
import type { ReactElement } from 'react'
import { useSyncExternalStore, useContext } from 'react'
import type { LoadedGraph } from '../../../src/graph/parse.ts'
import type { GraphNode } from '../../../src/graph/schema.ts'
import type { AwaitingEntry } from '../../../src/graph/live.ts'
import {
  changesSince, liveLine, moduleRowText, needsOf, planOf, progressLine,
  type ChangeRow, type NeedEntry,
} from '../../../src/graph/plain-view.ts'
import { boards, checkedBoardState, type Board } from './boards.ts'
import type { AgentLive } from './agents.ts'
import { NowContext, Options, Part, When, useServices } from './common.tsx'
import { CopyWish } from './Guide.tsx'
import { MainChatLine } from './MainChat.tsx'
import { headlineGoals, statusText } from './model.ts'
import { homeFlowLine } from './user-view.ts'

/**
 * The home rows of one goal: for a goal with a user graph its flow progress
 * first, opening 用户怎么用 (user graph design 0.4.1 §6.1); the progress of
 * the work; the module line when the two-level loop is on.
 */
function GoalRow({ graph, goal, awaiting, onModules, onUser }: { readonly graph: LoadedGraph, readonly goal: GraphNode, readonly awaiting: readonly AwaitingEntry[], readonly onModules: () => void, readonly onUser: () => void }): ReactElement {
  const row = moduleRowText(graph, goal, awaiting)
  const flows = homeFlowLine(graph, goal)
  return (
    <div className="glmg-goalrow">
      <div className="glmg-row-title">{goal.title}</div>
      {flows === null ? null : <button type="button" className="glmg-more" onClick={onUser}>{flows} ›</button>}
      <div className="glmg-meta"><span>{progressLine(graph, goal.id)}</span></div>
      {row === null ? null : <button type="button" className="glmg-more" onClick={onModules}>{row} ›</button>}
    </div>
  )
}

/**
 * One need (done conditions 1 and 6): the first is shown whole — a
 * question's ask and the lines of its way of asking (common.tsx Options) —
 * the rest show their title and ask; a matter only the main agent's chat
 * holds shows its text. The answer is in the main agent's chat.
 */
function NeedCard({ need, first }: { readonly need: NeedEntry, readonly first: boolean }): ReactElement {
  const { open } = useServices()
  const node = need.node
  if (node === undefined) {
    return (
      <div className="glmg-card wait">
        <div className="glmg-row-title">{need.matter?.text ?? '主 Agent 在对话里等你回话'}</div>
        {first ? <MainChatLine /> : null}
      </div>
    )
  }
  const question = node.type === 'question'
  return (
    <div className="glmg-card wait">
      <h3 className="glmg-card-title"><button type="button" className="glmg-card-link" onClick={() => { open(node.id) }}>{node.title}</button></h3>
      <div className="glmg-meta"><span>{statusText(node)}</span><When at={need.since} /></div>
      {question && first ? <Options node={node} /> : null}
      {question && !first && node.ask !== undefined ? <p className="glmg-text">{node.ask}</p> : null}
      {first ? <MainChatLine /> : null}
    </div>
  )
}

/** One board's home line, read through the table's snapshot hooks. */
function BoardLineInner({ board, sessionId, onOpen }: { readonly board: Board, readonly sessionId: string, readonly onOpen: () => void }): ReactElement | null {
  const state = useSyncExternalStore(
    listener => board.subscribe(sessionId, listener),
    () => checkedBoardState(board.id, board.snapshot(sessionId)) ?? { available: false, homeLine: null, guideLine: null, peakApplies: false },
  )
  if (!state.available || state.homeLine === null) return null
  return <button type="button" className="glmg-more" onClick={onOpen}>{state.homeLine} ›</button>
}

export interface HomeProps {
  readonly graph: LoadedGraph
  readonly agents: readonly AgentLive[]
  readonly awaiting: readonly AwaitingEntry[]
  readonly since: number | undefined
  readonly quiet: ReadonlySet<string>
  readonly sessionId: string
  /** Whether this session's agent is the project's main agent (drives the 现在 wording). */
  readonly mainHere: boolean
  readonly onPlan: () => void
  readonly onChanges: () => void
  readonly onLive: () => void
  readonly onNeeds: () => void
  readonly onModules: (goalId: string) => void
  /** 用户怎么用 of one goal. */
  readonly onUser: (goalId: string) => void
  readonly onBoard: (id: string) => void
}

/** The home page's body. */
export function Home({ graph, agents, awaiting, since, quiet, sessionId, mainHere, onPlan, onChanges, onLive, onNeeds, onModules, onUser, onBoard }: HomeProps): ReactElement {
  const now = useContext(NowContext)
  // An empty graph (no node at all; closed goals are not empty) shows only 效果是 and the way to start (§4.10).
  if (graph.nodes.size === 0) {
    return (
      <div className="glmg-view">
        <Part title="效果是">
          <div className="glmg-meta">这张图还是空的</div>
          <div className="glmg-text">在输入框打 /wish，后面跟一句你想做的</div>
          <CopyWish />
        </Part>
      </div>
    )
  }
  const goals = headlineGoals(graph)
  const needs = needsOf(graph, awaiting)
  const plan = planOf(graph, now, agents.find(agent => agent.main && agent.running)?.view?.focus ?? undefined)
  const changes: readonly ChangeRow[] = since === undefined
    ? changesSince(graph, new Date(now - 24 * 60 * 60 * 1000).toISOString(), quiet)
    : changesSince(graph, new Date(since).toISOString(), quiet)
  const line = liveLine(agents.map(agent => ({ main: agent.main, running: agent.running, ...(agent.view === undefined ? {} : { view: agent.view }) })), graph, now, mainHere)
  return (
    <div className="glmg-view">
      <Part title="效果是">
        {goals.slice(0, 3).map(goal => <GoalRow key={goal.id} graph={graph} goal={goal} awaiting={awaiting} onModules={() => { onModules(goal.id) }} onUser={() => { onUser(goal.id) }} />)}
        {goals.length > 3 ? <div className="glmg-meta">还有 {goals.length - 3} 个目标</div> : null}
        {goals.length === 0 ? <div className="glmg-meta">这张图还是空的</div> : null}
      </Part>
      <Part title={`需要你 · ${needs.length}`}>
        {needs.length === 0
          ? <div className="glmg-meta">现在没有要你回话的事</div>
          : needs.slice(0, 3).map((need, index) => <NeedCard key={need.node?.id ?? `awaiting:${index}`} need={need} first={index === 0} />)}
        {needs.length > 3 ? <button type="button" className="glmg-more" onClick={onNeeds}>还有 {needs.length - 3} 件 · 讲细点</button> : null}
      </Part>
      <Part title="现在">
        <div className="glmg-text">{line.line}</div>
        {line.sub === undefined ? null : <div className="glmg-meta">{line.sub}</div>}
        {boards().map(board => <BoardLineInner key={board.id} board={board} sessionId={sessionId} onOpen={() => { onBoard(board.id) }} />)}
        <button type="button" className="glmg-more" onClick={onLive}>讲细点 · 现场</button>
      </Part>
      <Part title="怎么做 · 接下来">
        {[...plan.doing, ...plan.ready, ...plan.waiting].slice(0, 3).map(item => (
          <div key={item.node.id} className="glmg-goalrow">
            <div className="glmg-row-title">{item.node.title}</div>
            <div className="glmg-meta"><span>{item.status}</span></div>
          </div>
        ))}
        <button type="button" className="glmg-more" onClick={onPlan}>讲细点 · 全部 {plan.total} 件</button>
      </Part>
      <Part title={since === undefined ? '最近一天' : '上次看之后'}>
        {changes.length === 0
          ? <div className="glmg-meta">上次看之后没有变化</div>
          : changes.slice(0, 5).map((row, index) => (
              <div key={`${row.at}:${index}`} className="glmg-goalrow">
                <div className="glmg-text">{row.text}</div>
              </div>
            ))}
        {changes.length > 5 ? <button type="button" className="glmg-more" onClick={onChanges}>讲细点 · 还有 {changes.length - 5} 处变化</button> : null}
      </Part>
    </div>
  )
}
