/**
 * 需要你: everything that waits for the human, oldest first: questions the
 * human decides and proposals to approve or reject (docs/ORCHESTRATION.md
 * §2.9.1). The panel only looks (plain-ui, d-ui-look-not-operate): a card
 * shows the matter and where to answer it — the answer is said in the main
 * agent's chat, and the card is gone once the graph moves on.
 */
import { IconCheckCircleFillRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReactElement } from 'react'
import { TYPE_LABELS } from '../../../src/graph/labels.ts'
import type { LoadedGraph } from '../../../src/graph/parse.ts'
import type { OpenItems } from '../../../src/graph/projection.ts'
import type { GraphNode } from '../../../src/graph/schema.ts'
import { Folded, Markdown, Options, When, useServices } from './common.tsx'
import { decidedBy } from './model.ts'

function Body({ text }: { readonly text: string | undefined }): ReactElement | null {
  if (text === undefined) return null
  return <Folded lines={4} className="glmg-text"><Markdown text={text} /></Folded>
}

function CardHead({ node, graph }: { readonly node: GraphNode, readonly graph: LoadedGraph }): ReactElement {
  const { open } = useServices()
  const parent = node.parent === undefined ? undefined : graph.nodes.get(node.parent)
  const first = node.history[0]
  return (
    <>
      <h3 className="glmg-card-title"><button type="button" className="glmg-card-link" onClick={() => { open(node.id) }}>{node.title}</button></h3>
      <div className="glmg-meta">
        <span>{TYPE_LABELS[node.type]}</span>
        {/* The goal is in the panel header; a card right under it needs no place. */}
        {parent === undefined || parent.type === 'goal' ? null : <span>挂在「{parent.title}」下</span>}
        {first === undefined ? null : <span>{first.actor === 'human' ? '你' : 'agent '}提的 · <When at={first.at} /></span>}
      </div>
    </>
  )
}

/** One card: the matter and where to answer it; nothing on it writes. */
function Card({ graph, node }: { readonly graph: LoadedGraph, readonly node: GraphNode }): ReactElement {
  return (
    <div className="glmg-card wait">
      <CardHead node={node} graph={graph} />
      <Body text={node.body} />
      {node.status === 'proposed'
        ? <div className="glmg-notice">要批准或不要：在主 Agent 的对话里回话</div>
        : <Options node={node} />}
    </div>
  )
}

/** The cards in display order: oldest first by the time they were raised. */
function waiting(graph: LoadedGraph, items: OpenItems): GraphNode[] {
  // A proposed question is a proposal; the human's queue holds approved and reopened ones, so the lists do not overlap.
  return [...items.questions, ...items.proposals]
    .map(ref => graph.nodes.get(ref.id))
    .filter((node): node is GraphNode => node !== undefined)
    .sort((a, b) => (a.history[0]?.at ?? '').localeCompare(b.history[0]?.at ?? ''))
}

export function NeedsYou({ graph, items, onShowDecisions }: { readonly graph: LoadedGraph, readonly items: OpenItems, readonly onShowDecisions: () => void }): ReactElement {
  const nodes = waiting(graph, items)
  if (nodes.length === 0) {
    const own = items.recentDecisions.filter(entry => decidedBy(entry) === 'agent').length
    return (
      <div className="glmg-empty glmg-view">
        <span className="glmg-empty-mark"><IconCheckCircleFillRegular size={26} /></span>
        <span className="glmg-empty-title">没有需要你的事</span>
        <span>agent 按决策分级自己定的事都留了痕，不同意随时可以推翻。</span>
        <button type="button" className="glmg-more" onClick={onShowDecisions}>{own > 0 ? `看看 agent 自己定的 ${own} 件事` : '看看最近拍板的事'}</button>
      </div>
    )
  }
  return (
    <div className="glmg-view">
      {nodes.map(node => <Card key={node.id} graph={graph} node={node} />)}
    </div>
  )
}
