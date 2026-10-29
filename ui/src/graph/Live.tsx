/**
 * 现场: the agents of the panel's session (agents.ts). Running agents come
 * first, one full row each: who, which model, what it does now and for how
 * long, where it stands on the graph, its last tool results and its token
 * usage; the mark breathes. Agents that are idle or stopped get a dimmed
 * one-line row (state, when they last called a tool, where they were), and
 * while anything runs they fold behind one line. With nothing running, a
 * note says what the section can see: this DSH session only.
 */
import { useState, type ReactElement } from 'react'
import type { LoadedGraph } from '../../../src/graph/parse.ts'
import { doingText, tokensText, useNow, type AgentLive } from './agents.ts'
import { Part, useServices } from './common.tsx'
import { LIVE_SCOPE_TEXT, nobodyRunningText, placeText, timeAgo } from './model.ts'

/** Where the agent stands: its focus node as a link, or why there is none. */
function Place({ graph, agent }: { readonly graph: LoadedGraph, readonly agent: AgentLive }): ReactElement | null {
  const { open } = useServices()
  const id = agent.view?.focus ?? null
  const focus = id === null ? undefined : graph.nodes.get(id)
  if (focus !== undefined) return <button type="button" className="glmg-more" onClick={() => { open(focus.id) }}>{placeText(focus.title, focus.status, agent.running)}</button>
  if (id !== null) return <span>焦点 {id} 不在图里</span>
  return agent.running ? <span>还没落到图上的节点</span> : null
}

function Tokens({ agent }: { readonly agent: AgentLive }): ReactElement | null {
  return agent.tokens === undefined || agent.tokens === 0 ? null : <span className="glmg-agent-tokens">{tokensText(agent.tokens)} tokens</span>
}

function RunningRow({ graph, agent, now }: { readonly graph: LoadedGraph, readonly agent: AgentLive, readonly now: number }): ReactElement {
  const view = agent.view
  return (
    <div className="glmg-agent">
      <span className="glmg-agent-mark running" aria-hidden="true" />
      <div className="glmg-row-main">
        <div className="glmg-agent-head">
          <span className="glmg-row-title">{agent.name}</span>
          {view?.model === null || view?.model === undefined ? null : <span className="glmg-who human">{view.model}</span>}
          <Tokens agent={agent} />
        </div>
        <div className="glmg-meta"><span>{doingText(agent, now)}</span></div>
        <div className="glmg-meta"><Place graph={graph} agent={agent} /></div>
        {view === undefined || view.recent.length === 0
          ? null
          : (
              <div className="glmg-chips">
                {view.recent.map(call => <span key={`${call.at}:${call.name}`} className={call.ok ? 'glmg-chip' : 'glmg-chip bad'} title={call.ok ? '成功' : '出错'}>{call.name}</span>)}
              </div>
            )}
      </div>
    </div>
  )
}

/** An idle main agent or a stopped child: dimmed, the state and the place on one line. A child that stopped after working shows a check. */
function StoppedRow({ graph, agent, now }: { readonly graph: LoadedGraph, readonly agent: AgentLive, readonly now: number }): ReactElement {
  const recent = agent.view?.recent ?? []
  const state = agent.main || recent.length === 0 ? 'idle' : 'done'
  const last = recent.length === 0 ? undefined : Math.max(...recent.map(call => call.at))
  return (
    <div className="glmg-agent quiet">
      <span className={`glmg-agent-mark ${state}`} aria-hidden="true">{state === 'done' ? '✓' : ''}</span>
      <div className="glmg-row-main">
        <div className="glmg-meta">
          <span className="glmg-row-title">{agent.name}</span>
          <span>{doingText(agent, now)}</span>
          {last === undefined ? null : <span>{timeAgo(new Date(last).toISOString(), now)}调过工具</span>}
          <Place graph={graph} agent={agent} />
          <Tokens agent={agent} />
        </div>
      </div>
    </div>
  )
}

/**
 * Children with no live view ran before this start of the app (a cold
 * session carries only its cached projections); with nothing running they
 * fold into a line of their own, since they carry no data.
 */
export function LiveSection({ graph, agents, tasks }: { readonly graph: LoadedGraph, readonly agents: readonly AgentLive[], readonly tasks: number }): ReactElement {
  const running = agents.filter(agent => agent.running)
  const now = useNow(running.length > 0)
  const [unfolded, setUnfolded] = useState(false)
  const main = agents.find(agent => agent.main)
  const stopped = agents.filter(agent => !agent.running && agent.view !== undefined)
  const earlier = agents.filter(agent => !agent.main && agent.view === undefined)
  const folded = running.length > 0 ? [...stopped, ...earlier] : earlier
  const toggle = running.length > 0
    ? unfolded ? '收起已停下的 agent' : `另有 ${folded.length} 个 agent 已停下`
    : unfolded ? '收起之前的子 agent' : `还有 ${earlier.length} 个子 agent 是这次启动之前跑的`
  return (
    <Part title={`现场 · ${running.length} 个在跑`}>
      {main?.view === undefined
        ? <div className="glmg-notice">还没有现场数据：会话开始干活后这里会出现；如果一直没有，看一下 graph-panel 行是不是关了。</div>
        : running.length === 0 ? <div className="glmg-notice">{nobodyRunningText(tasks)}<div className="glmg-notice-sub">{LIVE_SCOPE_TEXT}</div></div> : null}
      {running.map(agent => <RunningRow key={agent.id} graph={graph} agent={agent} now={now} />)}
      {running.length > 0 ? null : stopped.map(agent => <StoppedRow key={agent.id} graph={graph} agent={agent} now={now} />)}
      {folded.length === 0 ? null : <button type="button" className="glmg-more glmg-toggle" aria-expanded={unfolded} onClick={() => { setUnfolded(!unfolded) }}>{toggle}</button>}
      {unfolded ? folded.map(agent => <StoppedRow key={agent.id} graph={graph} agent={agent} now={now} />) : null}
    </Part>
  )
}
