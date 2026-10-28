/**
 * 需要你: everything that waits for the human, oldest first: questions the
 * human decides and proposals to approve or reject (docs/ORCHESTRATION.md
 * §2.9.1). Each card can be settled in place; a settled card slides out
 * before the re-read graph drops it.
 */
import { Button, IconCheckCircleFillRegular, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { useState, type ReactElement } from 'react'
import { TYPE_LABELS } from '../../../src/graph/labels.ts'
import type { LoadedGraph } from '../../../src/graph/parse.ts'
import type { OpenItems } from '../../../src/graph/projection.ts'
import type { GraphNode } from '../../../src/graph/schema.ts'
import { Markdown, Options, Outcome, revOf, useServices, useWriter } from './common.tsx'
import { decidedBy, timeAgo } from './model.ts'

function Body({ text }: { readonly text: string | undefined }): ReactElement | null {
  const [open, setOpen] = useState(false)
  if (text === undefined) return null
  const long = text.length > 160
  return (
    <div>
      <Markdown text={text} className={`glmg-text${long && !open ? ' clamp' : ''}`} />
      {long ? <button type="button" className="glmg-more" onClick={() => { setOpen(!open) }}>{open ? '收起' : '展开'}</button> : null}
    </div>
  )
}

function CardHead({ node, graph }: { readonly node: GraphNode, readonly graph: LoadedGraph }): ReactElement {
  const { open } = useServices()
  const parent = node.parent === undefined ? undefined : graph.nodes.get(node.parent)
  const first = node.history[0]
  return (
    <>
      <h3 className="glmg-card-title" onClick={() => { open(node.id) }}>{node.title}</h3>
      <div className="glmg-meta">
        <span>{TYPE_LABELS[node.type]}</span>
        {parent === undefined ? null : <span>挂在「{parent.title}」下</span>}
        {first === undefined ? null : <span>{first.actor === 'human' ? '你' : 'agent'}提的 · {timeAgo(first.at)}</span>}
      </div>
    </>
  )
}

function QuestionCard({ graph, node, onSettled }: { readonly graph: LoadedGraph, readonly node: GraphNode, readonly onSettled: () => void }): ReactElement {
  return (
    <div className="glmg-card wait">
      <CardHead node={node} graph={graph} />
      <Body text={node.body} />
      <Options graph={graph} node={node} onDecided={onSettled} />
    </div>
  )
}

function ProposalCard({ graph, node, onSettled }: { readonly graph: LoadedGraph, readonly node: GraphNode, readonly onSettled: () => void }): ReactElement {
  const writer = useWriter()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const settle = async (op: 'approve' | 'reject'): Promise<void> => {
    const fallback = op === 'approve' ? '在面板里批准' : '在面板里否决'
    const result = await writer.run({ op, id: node.id, rev: revOf(graph, node.id), reason: reason.trim().length > 0 ? reason.trim() : fallback })
    if (result.ok) onSettled()
  }
  return (
    <div className="glmg-card wait">
      <CardHead node={node} graph={graph} />
      <Body text={node.body} />
      {rejecting
        ? (
            <div className="glmg-confirm">
              <Input value={reason} placeholder="为什么不要（可不填）" aria-label="否决理由" onChange={event => { setReason(event.target.value) }} />
              <Button variant="outline" size="sm" disabled={writer.busy} onClick={() => { void settle('reject') }}>否决</Button>
              <Button variant="ghost" size="sm" onClick={() => { setRejecting(false) }}>取消</Button>
            </div>
          )
        : (
            <div className="glmg-actions">
              <Button variant="primary" size="sm" disabled={writer.busy} onClick={() => { void settle('approve') }}>批准</Button>
              <Button variant="ghost" size="sm" disabled={writer.busy} onClick={() => { setRejecting(true) }}>不要</Button>
            </div>
          )}
      <Outcome outcome={writer.outcome} />
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
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set())
  const nodes = waiting(graph, items)
  if (nodes.length === 0) {
    const own = items.recentDecisions.filter(entry => decidedBy(entry) === 'agent').length
    return (
      <div className="glmg-empty glmg-view">
        <span className="glmg-empty-mark"><IconCheckCircleFillRegular size={26} /></span>
        <span className="glmg-empty-title">没有需要你的事</span>
        <span>agent 按决策分级自己定的事都留了痕，不同意随时可以推翻。</span>
        <Button variant="outline" size="sm" onClick={onShowDecisions}>{own > 0 ? `看看 agent 自己定的 ${own} 件事` : '看看最近拍板的事'}</Button>
      </div>
    )
  }
  const settled = (id: string) => () => { setLeaving(new Set([...leaving, id])) }
  return (
    <div className="glmg-view">
      {nodes.map(node => (
        <div key={node.id} className={leaving.has(node.id) ? 'glmg-leaving' : undefined}>
          {node.status === 'proposed'
            ? <ProposalCard graph={graph} node={node} onSettled={settled(node.id)} />
            : <QuestionCard graph={graph} node={node} onSettled={settled(node.id)} />}
        </div>
      ))}
    </div>
  )
}
