/**
 * One node, reading first: what it is, where it hangs, why it exists, what
 * done means, and what happened to it. Actions the human may take sit
 * where they belong: options on a question, approve or reject on a
 * proposal, a comment on anything. The id is at the bottom, for telling
 * the LLM which node is meant.
 */
import { Button, IconChevronLeftOutlineRegular, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { useState, type ReactElement } from 'react'
import { ACTOR_LABELS, EVIDENCE_LABELS, KIND_LABELS, OP_LABELS, STAGE_LABELS, STATUS_LABELS, TIER_LABELS, TYPE_LABELS, VERIFICATION_LABELS } from '../../../src/graph/labels.ts'
import type { LoadedGraph } from '../../../src/graph/parse.ts'
import { ancestorsOf } from '../../../src/graph/projection.ts'
import type { GraphNode, HistoryEntry } from '../../../src/graph/schema.ts'
import { Markdown, Options, Outcome, revOf, useServices, useWriter } from './common.tsx'
import { needsHuman, statusText, timeAgo } from './model.ts'

const HISTORY_SHOWN = 6

function historyLine(entry: HistoryEntry): string {
  const who = entry.relay !== undefined ? '你（经对话）' : entry.actor === 'human' ? '你' : entry.actor === 'llm' ? 'agent' : ACTOR_LABELS[entry.actor]
  const what = entry.op === 'comment' ? `批注：${entry.text ?? ''}` : `${OP_LABELS[entry.op]}${entry.option === undefined ? '' : ` ${entry.option}`}${entry.reason === undefined ? '' : `：${entry.reason}`}`
  return `${timeAgo(entry.at)} · ${who} · ${what}`
}

function Comment({ node }: { readonly node: GraphNode }): ReactElement {
  const writer = useWriter()
  const [text, setText] = useState('')
  return (
    <div className="glmg-comment">
      <textarea value={text} placeholder="写给 agent 或以后的自己" aria-label="批注" onChange={event => { setText(event.target.value) }} />
      <div>
        <Button variant="outline" size="sm" disabled={writer.busy || text.trim().length === 0} onClick={() => { void writer.run({ op: 'comment', id: node.id, text: text.trim() }).then(result => { if (result.ok) setText('') }) }}>批注</Button>
      </div>
      <Outcome outcome={writer.outcome} />
    </div>
  )
}

function ProposalActions({ graph, node }: { readonly graph: LoadedGraph, readonly node: GraphNode }): ReactElement {
  const writer = useWriter()
  return (
    <div className="glmg-actions">
      <Button variant="primary" size="sm" disabled={writer.busy} onClick={() => { void writer.run({ op: 'approve', id: node.id, rev: revOf(graph, node.id), reason: '在面板里批准' }) }}>批准</Button>
      <Button variant="ghost" size="sm" disabled={writer.busy} onClick={() => { void writer.run({ op: 'reject', id: node.id, rev: revOf(graph, node.id), reason: '在面板里否决' }) }}>不要</Button>
      <Outcome outcome={writer.outcome} />
    </div>
  )
}

export function NodeDetail({ graph, id, onClose }: { readonly graph: LoadedGraph, readonly id: string, readonly onClose: () => void }): ReactElement {
  const { open } = useServices()
  const node = graph.nodes.get(id)
  if (node === undefined) {
    return (
      <div className="glmg-detail">
        <div className="glmg-detail-head"><Button variant="ghost" size="sm" onClick={onClose}><IconChevronLeftOutlineRegular size={14} />返回</Button></div>
        <div className="glmg-detail-body"><div className="glmg-notice">这个节点已经不在图里了。</div></div>
      </div>
    )
  }
  const ancestors = ancestorsOf(graph, node).reverse()
  const children = [...graph.nodes.values()].filter(child => child.parent === node.id)
  const history = node.history.slice(-HISTORY_SHOWN).reverse()
  const done = node.status === 'done'
  return (
    <div className="glmg-detail">
      <div className="glmg-detail-head">
        <Button variant="ghost" size="sm" onClick={onClose}><IconChevronLeftOutlineRegular size={14} />返回</Button>
      </div>
      <div className="glmg-detail-body">
        {ancestors.length === 0
          ? null
          : <div className="glmg-crumbs">{ancestors.map(ancestor => <span key={ancestor.id}><button type="button" onClick={() => { open(ancestor.id) }}>{ancestor.title}</button> ›</span>)}</div>}
        <h2>{node.title}</h2>
        <div className="glmg-meta">
          <Tag tone="neutral">{TYPE_LABELS[node.type]}</Tag>
          <Tag tone={needsHuman(node) ? 'danger' : done ? 'success' : node.status === 'doing' ? 'warning' : 'neutral'}>{node.type === 'question' && done ? STATUS_LABELS[node.status] : statusText(node)}</Tag>
          {node.verification === undefined ? null : <Tag tone={node.verification === 'unverified' ? 'warning' : 'info'}>{VERIFICATION_LABELS[node.verification]}</Tag>}
          {node.stage === undefined ? null : <Tag tone="neutral">阶段：{STAGE_LABELS[node.stage]}</Tag>}
          {node.kind === undefined ? null : <Tag tone="neutral">{KIND_LABELS[node.kind]}</Tag>}
          {node.tier === undefined ? null : <Tag tone="neutral">{TIER_LABELS[node.tier]}</Tag>}
        </div>
        {node.body === undefined ? null : <Markdown text={node.body} className="glmg-text" />}
        {node.type === 'question' ? <><div className="glmg-section">{done ? '选项（再选一个就是推翻）' : '选项'}</div><Options graph={graph} node={node} /></> : null}
        {node.status === 'proposed' ? <ProposalActions graph={graph} node={node} /> : null}
        {(node.acceptance ?? []).length === 0
          ? null
          : <><div className="glmg-section">怎样算完成</div><ul className={`glmg-list${done ? ' ok' : ''}`}>{(node.acceptance ?? []).map(item => <li key={item}>{item}</li>)}</ul></>}
        {(node.nonGoals ?? []).length === 0
          ? null
          : <><div className="glmg-section">不做什么</div><ul className="glmg-list">{(node.nonGoals ?? []).map(item => <li key={item}>{item}</li>)}</ul></>}
        {children.length === 0
          ? null
          : (
              <>
                <div className="glmg-section">下面的节点 · {children.filter(child => child.status === 'done').length}/{children.length}</div>
                {children.map(child => (
                  <div key={child.id} className="glmg-row" onClick={() => { open(child.id) }}>
                    <span className={`glmg-dot ${needsHuman(child) ? 'wait' : child.status === 'proposed' ? 'proposed' : child.status}`} />
                    <div className="glmg-row-main"><div className="glmg-row-title">{child.title}</div><div className="glmg-meta">{statusText(child)}</div></div>
                  </div>
                ))}
              </>
            )}
        {(node.evidence ?? []).length === 0
          ? null
          : <><div className="glmg-section">证据</div><ul className="glmg-list ok">{(node.evidence ?? []).map((entry, index) => <li key={index}>{EVIDENCE_LABELS[entry.kind]} {entry.ref}{entry.exit === undefined ? '' : `（退出码 ${entry.exit}）`}{entry.note === undefined ? '' : ` · ${entry.note}`}</li>)}</ul></>}
        <div className="glmg-section">最近发生的</div>
        <div className="glmg-history">{history.map((entry, index) => <div key={index}>{historyLine(entry)}{entry.relay === undefined ? null : <blockquote className="glmg-quote">{entry.relay}</blockquote>}</div>)}</div>
        <div className="glmg-section">批注</div>
        <Comment node={node} />
        <div className="glmg-id">跟 agent 说起它时可以用 id：<code>{node.id}</code></div>
      </div>
    </div>
  )
}
