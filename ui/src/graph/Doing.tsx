/**
 * 正在做: the agents at work (现场, Live.tsx), the nodes in progress with
 * how far their work children are, then the tasks ready to start and the
 * decisions not yet verified, each list in the graph view's sibling order
 * (model.ts byCreation). The three node lists share one row: title,
 * then type, path and progress on one meta line, so every row has the same
 * height and separator whether it has progress or not.
 */
import type { ReactElement } from 'react'
import { TYPE_LABELS } from '../../../src/graph/labels.ts'
import type { LoadedGraph } from '../../../src/graph/parse.ts'
import { ancestorsOf, type NodeRef, type OpenItems } from '../../../src/graph/projection.ts'
import type { AgentLive } from './agents.ts'
import { Part, useServices } from './common.tsx'
import { LiveSection } from './Live.tsx'
import { byCreation, progressOf, progressText } from './model.ts'

function Row({ graph, entry, tone }: { readonly graph: LoadedGraph, readonly entry: NodeRef, readonly tone: 'doing' | 'todo' }): ReactElement | null {
  const { open } = useServices()
  const node = graph.nodes.get(entry.id)
  if (node === undefined) return null
  const progress = progressOf(graph, node.id)
  const text = progressText(progress)
  // The goal is in the panel header; a node right under it has no path of its own.
  const path = ancestorsOf(graph, node).filter(ancestor => ancestor.type !== 'goal').map(ancestor => ancestor.title).reverse()
  return (
    <div className="glmg-row" onClick={() => { open(node.id) }}>
      <span className={`glmg-dot ${tone}`} />
      <div className="glmg-row-main">
        <div className="glmg-row-title">{node.title}</div>
        <div className="glmg-meta">
          <span>{TYPE_LABELS[node.type]}</span>
          {path.length === 0 ? null : <span>{path.join(' › ')}</span>}
          {text.work === undefined
            ? null
            : <span className="glmg-meter"><span className="glmg-progress"><b style={{ width: `${Math.round(progress.done / progress.total * 100)}%` }} /></span>{text.work}</span>}
          {text.questions === undefined ? null : <span>{text.questions}</span>}
        </div>
      </div>
    </div>
  )
}

function Rows({ graph, entries, tone, empty }: { readonly graph: LoadedGraph, readonly entries: readonly NodeRef[], readonly tone: 'doing' | 'todo', readonly empty: string }): ReactElement {
  if (entries.length === 0) return <div className="glmg-notice">{empty}</div>
  return <>{entries.map(entry => <Row key={entry.id} graph={graph} entry={entry} tone={tone} />)}</>
}

export function Doing({ graph, items, agents }: { readonly graph: LoadedGraph, readonly items: OpenItems, readonly agents: readonly AgentLive[] }): ReactElement {
  const order = byCreation(graph)
  const doing = items.doing.filter(entry => entry.type !== 'goal').sort(order)
  const ready = [...items.ready].sort(order)
  const debt = [...items.verificationDebt].sort(order)
  return (
    <div className="glmg-view">
      <LiveSection graph={graph} agents={agents} tasks={doing.filter(entry => entry.type === 'task').length} />
      <Part title={`进行中 · ${doing.length}`}><Rows graph={graph} entries={doing} tone="doing" empty="现在没有进行中的节点。" /></Part>
      <Part title={`可以开工 · ${ready.length}`}><Rows graph={graph} entries={ready} tone="todo" empty="没有依赖都已完成、还没开工的任务。" /></Part>
      {debt.length === 0
        ? null
        : <Part title={`采纳了还没验证的决策 · ${debt.length}`}>{debt.map(entry => <Row key={entry.id} graph={graph} entry={entry} tone="todo" />)}</Part>}
    </div>
  )
}
