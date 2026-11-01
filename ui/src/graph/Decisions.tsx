/**
 * agent 定的: what the agent is about to decide, then the latest
 * decisions, newest first, with who made each one: the agent on its own,
 * the agent relaying the human's words, or the human in the panel
 * (docs/ORCHESTRATION.md §2.9.1). Both are parts like the other views',
 * with their counts in the titles. Opening a decision shows the reason,
 * the relayed words and the other options; picking one overturns the
 * decision as the human.
 */
import type { ReactElement } from 'react'
import { useState } from 'react'
import type { LoadedGraph } from '../../../src/graph/parse.ts'
import type { OpenItems } from '../../../src/graph/projection.ts'
import { Options, Part, When, asButton, useServices } from './common.tsx'
import { DECIDED_BY_LABELS, decidedBy } from './model.ts'

function Pending({ graph, items }: { readonly graph: LoadedGraph, readonly items: OpenItems }): ReactElement {
  const { open } = useServices()
  return (
    <Part title={`agent 正要定的 · ${items.agentQueue.length}`}>
      {items.agentQueue.map(entry => {
        const leaning = entry.recommend === undefined ? undefined : graph.nodes.get(entry.id)?.options?.find(option => option.key === entry.recommend)
        return (
          <div key={entry.id} className="glmg-row" {...asButton<HTMLDivElement>(() => { open(entry.id) })}>
            <span className="glmg-who agent">待定</span>
            <div className="glmg-row-main">
              <div className="glmg-row-title">{entry.title}</div>
              <div className="glmg-meta">
                {entry.recommend === undefined ? null : <span>倾向 {entry.recommend}{leaning === undefined ? '' : ` ${leaning.label}`}</span>}
                {/* A question right under the goal needs no place: the goal is in the panel header. */}
                {entry.raisedBy === null || entry.raisedBy.type === 'goal' ? null : <span>挂在「{entry.raisedBy.title}」下</span>}
              </div>
            </div>
          </div>
        )
      })}
    </Part>
  )
}

function Recent({ graph, items }: { readonly graph: LoadedGraph, readonly items: OpenItems }): ReactElement {
  const { open } = useServices()
  const [expanded, setExpanded] = useState<string | undefined>(undefined)
  return (
    <Part title={`最近拍板的 · ${items.recentDecisions.length}`}>
      {items.recentDecisions.length === 0 ? <div className="glmg-notice">还没有拍过板的事。</div> : null}
      {items.recentDecisions.map(record => {
        const who = decidedBy(record)
        const node = graph.nodes.get(record.id)
        const isOpen = expanded === record.id
        return (
          <div key={record.id} className="glmg-row" onClick={() => { setExpanded(isOpen ? undefined : record.id) }}>
            <span className={`glmg-who ${who}`}>{DECIDED_BY_LABELS[who]}</span>
            <div className="glmg-row-main">
              {/* The title is the row's keyboard handle: its click bubbles to the row, which toggles. */}
              <button type="button" className="glmg-row-title glmg-row-toggle" aria-expanded={isOpen}>{record.title}</button>
              <div className="glmg-meta">
                <span>{record.decision === undefined ? `定了：${record.label}` : `选了 ${record.decision} ${record.label}`}</span>
                <When at={record.decidedAt} />
                {record.rounds > 1 ? <span>改过 {record.rounds - 1} 次</span> : null}
              </div>
              {isOpen && node !== undefined
                ? (
                    <div onClick={event => { event.stopPropagation() }}>
                      {record.reason === undefined ? null : <div className="glmg-text">理由：{record.reason}</div>}
                      {record.relay === undefined ? null : <blockquote className="glmg-quote">你说：{record.relay}</blockquote>}
                      <Options graph={graph} node={node} />
                      <div className="glmg-actions"><button type="button" className="glmg-more" onClick={() => { open(record.id) }}>看这张卡的全部内容</button></div>
                    </div>
                  )
                : null}
            </div>
          </div>
        )
      })}
    </Part>
  )
}

export function Decisions({ graph, items }: { readonly graph: LoadedGraph, readonly items: OpenItems }): ReactElement {
  if (items.recentDecisions.length === 0 && items.agentQueue.length === 0) {
    return <div className="glmg-empty glmg-view"><span className="glmg-empty-title">还没有拍过板的事</span></div>
  }
  return (
    <div className="glmg-view">
      {items.agentQueue.length === 0 ? null : <Pending graph={graph} items={items} />}
      <Recent graph={graph} items={items} />
    </div>
  )
}
