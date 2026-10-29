/**
 * One node, reading first: what it is, where it hangs, why it exists, what
 * done means, and what happened to it. Actions the human may take sit
 * where they belong: options on a question, approve or reject on a
 * proposal, run controls on a task, a comment on anything. The id is at
 * the bottom, for telling the LLM which node is meant.
 */
import { Button, IconChevronLeftOutlineRegular, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from 'react'
import { EVIDENCE_LABELS, KIND_LABELS, STAGE_LABELS, STATUS_LABELS, TIER_LABELS, TYPE_LABELS, VERIFICATION_LABELS } from '../../../src/graph/labels.ts'
import type { LoadedGraph } from '../../../src/graph/parse.ts'
import { ancestorsOf } from '../../../src/graph/projection.ts'
import { RUN_LABELS, nodeRefusal, offersRedo } from '../../../src/graph/run.ts'
import type { GraphNode, Verification } from '../../../src/graph/schema.ts'
import { placements, type AgentLive } from './agents.ts'
import { Folded, Markdown, NodeRow, Options, Outcome, Part, ProposalActions, When, useServices, useWriter } from './common.tsx'
import { byCreation, dotTone, historyText, needsHuman, presenceText, progressOf, progressText, statusText } from './model.ts'

const HISTORY_SHOWN = 6

/** A verified decision reads as success, an overturned one as danger, a superseded one as plain history. */
const VERIFICATION_TONES: Readonly<Record<Verification, 'warning' | 'success' | 'danger' | 'neutral'>> = {
  unverified: 'warning',
  sandbox: 'success',
  device: 'success',
  overturned: 'danger',
  superseded: 'neutral',
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

/**
 * Run controls of a task (/graph-run, src/graph/run.ts): start while it is
 * open, not done and nobody runs on it; pause while a running agent stands
 * on it (the live view's placements); redo once it is done, or when its
 * acceptance changed after it was last started. Each note is a line of
 * its own; each button's title says what happens; the outcome line is the
 * one the conversation shows.
 */
function RunControls({ node, agents }: { readonly node: GraphNode, readonly agents: readonly AgentLive[] }): ReactElement | null {
  const writer = useWriter()
  const here = (placements(agents).get(node.id) ?? []).filter(agent => agent.running)
  const start = nodeRefusal(node, 'start') === undefined && here.length === 0
  const redo = offersRedo(node)
  if (node.type !== 'task' || (!start && !redo && here.length === 0)) return null
  const notes = [
    presenceText(node.status, here.map(agent => agent.name)),
    redo ? node.status === 'done' ? '已完成，可以按现在的验收条件重做' : '验收条件在上次开始之后改过' : undefined,
  ].filter(note => note !== undefined)
  return (
    <Part title="让 agent 干活">
      {notes.length === 0 ? null : <div className="glmg-notes">{notes.map(note => <div key={note}>{note}</div>)}</div>}
      <div className="glmg-actions">
        {start ? <Button variant="primary" size="sm" disabled={writer.busy} title="主 Agent 收到这个任务，把焦点设到这里开始做" onClick={() => { void writer.control('start', node.id) }}>{RUN_LABELS.start}</Button> : null}
        {here.length > 0 ? <Button variant="outline" size="sm" disabled={writer.busy} title="停下在这里干活的 agent，并告诉主 Agent 不要重新派发" onClick={() => { void writer.control('stop', node.id) }}>{RUN_LABELS.stop}</Button> : null}
        {redo ? <Button variant="outline" size="sm" disabled={writer.busy} title="停下在这里干活的 agent，让主 Agent 按现在的验收条件重做" onClick={() => { void writer.control('redo', node.id) }}>{RUN_LABELS.redo}</Button> : null}
      </div>
      <Outcome outcome={writer.outcome} />
    </Part>
  )
}

interface DetailProps {
  readonly graph: LoadedGraph
  readonly id: string
  readonly agents: readonly AgentLive[]
  /** 返回: the node opened before this one, or the list. */
  readonly onBack: () => void
  /** Escape: back to the list. */
  readonly onClose: () => void
}

/**
 * The detail's frame: 返回 on top, Escape closes, and focus moves to 返回
 * when a node opens (the frame mounts once per node), so the keyboard
 * starts inside the detail.
 */
function Frame({ onBack, onClose, children }: Pick<DetailProps, 'onBack' | 'onClose'> & { readonly children: ReactNode }): ReactElement {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => { root.current?.querySelector<HTMLButtonElement>('.glmg-detail-head button')?.focus() }, [])
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape' || event.nativeEvent.isComposing) return
    event.stopPropagation()
    onClose()
  }
  return (
    <div ref={root} className="glmg-detail" onKeyDown={onKeyDown}>
      <div className="glmg-detail-head"><Button variant="ghost" size="sm" onClick={onBack}><IconChevronLeftOutlineRegular size={14} />返回</Button></div>
      <div className="glmg-detail-body">{children}</div>
    </div>
  )
}

export function NodeDetail({ graph, id, agents, onBack, onClose }: DetailProps): ReactElement {
  const { open } = useServices()
  const node = graph.nodes.get(id)
  if (node === undefined) {
    return <Frame onBack={onBack} onClose={onClose}><div className="glmg-notice">这个节点已经不在图里了。</div></Frame>
  }
  const ancestors = ancestorsOf(graph, node).reverse()
  const children = [...graph.nodes.values()].filter(child => child.parent === node.id).sort(byCreation(graph))
  const progress = progressText(progressOf(graph, node.id))
  const history = node.history.slice(-HISTORY_SHOWN).reverse()
  const done = node.status === 'done'
  return (
    <Frame onBack={onBack} onClose={onClose}>
        {ancestors.length === 0
          ? null
          : (
              <div className="glmg-crumbs">
                {/* The goal's title is in the panel header; its crumb says 目标 and still opens it. */}
                {ancestors.map((ancestor, index) => <span key={ancestor.id}><button type="button" title={ancestor.title} onClick={() => { open(ancestor.id) }}>{ancestor.type === 'goal' ? TYPE_LABELS.goal : ancestor.title}</button>{index < ancestors.length - 1 ? ' ›' : null}</span>)}
              </div>
            )}
        <h2>{node.title}</h2>
        <div className="glmg-meta">
          <Tag tone="neutral">{TYPE_LABELS[node.type]}</Tag>
          <Tag tone={needsHuman(node) ? 'danger' : done ? 'success' : node.status === 'doing' ? 'warning' : 'neutral'}>{node.type === 'question' && done ? STATUS_LABELS[node.status] : statusText(node)}</Tag>
          {node.verification === undefined ? null : <Tag tone={VERIFICATION_TONES[node.verification]}>{VERIFICATION_LABELS[node.verification]}</Tag>}
          {node.stage === undefined ? null : <Tag tone="neutral">阶段：{STAGE_LABELS[node.stage]}</Tag>}
          {node.kind === undefined ? null : <Tag tone="neutral">{KIND_LABELS[node.kind]}</Tag>}
          {node.tier === undefined ? null : <Tag tone="neutral">{TIER_LABELS[node.tier]}</Tag>}
        </div>
        {node.body === undefined ? null : <Folded lines={10} className="glmg-text"><Markdown text={node.body} /></Folded>}
        {node.type === 'question' ? <Part title={done ? '选项（再选一个就是推翻）' : '选项'}><Options graph={graph} node={node} /></Part> : null}
        {node.status === 'proposed' ? <Part title="批准或否决"><ProposalActions graph={graph} node={node} /></Part> : null}
        <RunControls node={node} agents={agents} />
        {(node.acceptance ?? []).length === 0
          ? null
          : <Part title="怎样算完成"><ul className={`glmg-list${done ? ' ok' : ''}`}>{(node.acceptance ?? []).map(item => <li key={item}>{item}</li>)}</ul></Part>}
        {(node.nonGoals ?? []).length === 0
          ? null
          : <Part title="不做什么"><ul className="glmg-list">{(node.nonGoals ?? []).map(item => <li key={item}>{item}</li>)}</ul></Part>}
        {children.length === 0
          ? null
          : (
              <Part title={['下面的节点', progress.work, progress.questions].filter(part => part !== undefined).join(' · ')}>
                {children.map(child => <NodeRow key={child.id} graph={graph} node={child} tone={dotTone(child)} status />)}
              </Part>
            )}
        {(node.evidence ?? []).length === 0
          ? null
          : <Part title="证据"><ul className="glmg-list ok">{(node.evidence ?? []).map((entry, index) => <li key={index}>{EVIDENCE_LABELS[entry.kind]} {entry.ref}{entry.exit === undefined ? '' : `（退出码 ${entry.exit}）`}{entry.note === undefined ? '' : ` · ${entry.note}`}</li>)}</ul></Part>}
        <Part title="最近发生的">
          <div className="glmg-history">
            {history.map((entry, index) => {
              const { who, what } = historyText(entry)
              return (
                <div key={index}>
                  <Folded lines={3}><span className="glmg-history-when"><When at={entry.at} /> · {who} · </span>{what}</Folded>
                  {entry.relay === undefined ? null : <blockquote className="glmg-quote">{entry.relay}</blockquote>}
                </div>
              )
            })}
          </div>
        </Part>
        <Part title="批注"><Comment node={node} /></Part>
        <div className="glmg-id">跟 agent 说起它时可以用 id：<code>{node.id}</code></div>
    </Frame>
  )
}
