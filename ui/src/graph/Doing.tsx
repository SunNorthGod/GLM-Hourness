/**
 * 正在做: the agents at work (现场, Live.tsx), the nodes in progress with
 * how many of their children are closed, then the tasks ready to start and
 * the decisions not yet verified.
 */
import type { ReactElement } from 'react'
import { TYPE_LABELS } from '../../../src/graph/labels.ts'
import type { LoadedGraph } from '../../../src/graph/parse.ts'
import { ancestorsOf, type NodeRef, type OpenItems } from '../../../src/graph/projection.ts'
import type { AgentLive } from './agents.ts'
import { useServices } from './common.tsx'
import { LiveSection } from './Live.tsx'
import { progressOf } from './model.ts'

function Row({ graph, entry, tone }: { readonly graph: LoadedGraph, readonly entry: NodeRef, readonly tone: 'doing' | 'todo' }): ReactElement | null {
  const { open } = useServices()
  const node = graph.nodes.get(entry.id)
  if (node === undefined) return null
  const { done, total } = progressOf(graph, node.id)
  const path = ancestorsOf(graph, node).filter(ancestor => ancestor.type !== 'goal').map(ancestor => ancestor.title).reverse()
  return (
    <div className="glmg-row" onClick={() => { open(node.id) }}>
      <span className={`glmg-dot ${tone}`} />
      <div className="glmg-row-main">
        <div className="glmg-row-title">{node.title}</div>
        <div className="glmg-meta">
          <span>{TYPE_LABELS[node.type]}</span>
          {path.length === 0 ? null : <span>{path.join(' › ')}</span>}
          {total > 0 ? <span>{done}/{total}</span> : null}
        </div>
        {total > 0 ? <div className="glmg-progress"><b style={{ width: `${Math.round(done / total * 100)}%` }} /></div> : null}
      </div>
    </div>
  )
}

export function Doing({ graph, items, agents }: { readonly graph: LoadedGraph, readonly items: OpenItems, readonly agents: readonly AgentLive[] }): ReactElement {
  const doing = items.doing.filter(entry => entry.type !== 'goal')
  return (
    <div className="glmg-view">
      <LiveSection graph={graph} agents={agents} />
      <div className="glmg-section">进行中 · {doing.length}</div>
      {doing.length === 0 ? <div className="glmg-notice">现在没有进行中的节点。</div> : doing.map(entry => <Row key={entry.id} graph={graph} entry={entry} tone="doing" />)}
      <div className="glmg-section">可以开工 · {items.ready.length}</div>
      {items.ready.length === 0 ? <div className="glmg-notice">没有依赖都已完成、还没开工的任务。</div> : items.ready.map(entry => <Row key={entry.id} graph={graph} entry={entry} tone="todo" />)}
      {items.verificationDebt.length === 0
        ? null
        : (
            <>
              <div className="glmg-section">采纳了还没验证的决策 · {items.verificationDebt.length}</div>
              {items.verificationDebt.map(entry => <Row key={entry.id} graph={graph} entry={entry} tone="todo" />)}
            </>
          )}
    </div>
  )
}
