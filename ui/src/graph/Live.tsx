/**
 * 现场: one row per agent of the panel's session (agents.ts): who, which
 * model, what it does now and for how long, where it stands on the graph,
 * its last tool results and its token usage. A running agent breathes; a
 * child that stops shows a check once.
 */
import { useState, type ReactElement } from 'react'
import type { LoadedGraph } from '../../../src/graph/parse.ts'
import { doingText, tokensText, useNow, type AgentLive } from './agents.ts'
import { useServices } from './common.tsx'

function AgentRow({ graph, agent, now }: { readonly graph: LoadedGraph, readonly agent: AgentLive, readonly now: number }): ReactElement {
  const { open } = useServices()
  const view = agent.view
  const focus = view?.focus === null || view?.focus === undefined ? undefined : graph.nodes.get(view.focus)
  const state = agent.running ? 'running' : agent.main || (view?.recent.length ?? 0) === 0 ? 'idle' : 'done'
  return (
    <div className={`glmg-agent ${state}`}>
      {/* Keyed by state so the check animates once when a child stops. */}
      <span key={state} className={`glmg-agent-mark ${state}`} aria-hidden="true">{state === 'done' ? '✓' : ''}</span>
      <div className="glmg-row-main">
        <div className="glmg-agent-head">
          <span className="glmg-row-title">{agent.name}</span>
          {view?.model === null || view?.model === undefined ? null : <span className="glmg-who human">{view.model}</span>}
          {agent.tokens === undefined || agent.tokens === 0 ? null : <span className="glmg-agent-tokens">{tokensText(agent.tokens)} tokens</span>}
        </div>
        <div className="glmg-meta"><span>{doingText(agent, now)}</span></div>
        <div className="glmg-meta">
          {focus === undefined
            ? <span>{view?.focus === null || view?.focus === undefined ? '还没落到图上的节点' : `焦点 ${view.focus} 不在图里`}</span>
            : <button type="button" className="glmg-more" onClick={() => { open(focus.id) }}>在「{focus.title}」</button>}
        </div>
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

/**
 * Children with no live view ran before this start of the app (a cold
 * session carries only its cached projections): they fold into one line
 * that opens on demand, so the section shows the work of now.
 */
export function LiveSection({ graph, agents }: { readonly graph: LoadedGraph, readonly agents: readonly AgentLive[] }): ReactElement {
  const now = useNow(agents.some(agent => agent.running))
  const [showEarlier, setShowEarlier] = useState(false)
  const main = agents.find(agent => agent.main)
  const earlier = agents.filter(agent => !agent.main && agent.view === undefined)
  const rows = agents.filter(agent => agent.view !== undefined || (showEarlier && !agent.main))
  return (
    <>
      <div className="glmg-section">现场 · {agents.length - earlier.length}</div>
      {main?.view === undefined
        ? <div className="glmg-notice">还没有现场数据：会话开始干活后这里会出现；如果一直没有，看一下 graph-panel 行是不是关了。</div>
        : null}
      {rows.map(agent => <AgentRow key={agent.id} graph={graph} agent={agent} now={now} />)}
      {earlier.length === 0
        ? null
        : <button type="button" className="glmg-more glmg-earlier" onClick={() => { setShowEarlier(!showEarlier) }}>{showEarlier ? '收起之前的子 agent' : `还有 ${earlier.length} 个子 agent 是这次启动之前跑的`}</button>}
    </>
  )
}
