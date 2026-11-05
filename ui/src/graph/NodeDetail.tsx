/**
 * One node, reading first: what it is, where it hangs, why it exists (its
 * why, or a goal's 问题 section), what done means, and what happened to it.
 * The writing check's notices on the node sit with its id at the bottom. The panel only looks (plain-ui,
 * d-ui-look-not-operate): where the human used to act there is now a line
 * that says how — the answer or the order goes through the main agent's
 * chat, or a /graph-run line the human types. The id is at the bottom, for
 * telling the LLM which node is meant.
 */
import { Button, IconChevronLeftOutlineRegular, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useRef, type KeyboardEvent, type ReactElement, type ReactNode } from 'react'
import { EVIDENCE_LABELS, KIND_LABELS, STAGE_LABELS, STATUS_LABELS, TIER_LABELS, TYPE_LABELS, VERIFICATION_LABELS } from '../../../src/graph/labels.ts'
import type { LoadedGraph } from '../../../src/graph/parse.ts'
import { whyOf } from '../../../src/graph/plain-view.ts'
import { ancestorsOf } from '../../../src/graph/projection.ts'
import { RUN_COMMAND } from '../../../src/graph/run.ts'
import type { GraphNode, Verification } from '../../../src/graph/schema.ts'
import { goalOf } from '../../../src/graph/stage.ts'
import { isUserNode } from '../../../src/graph/user-graph.ts'
import { placements, runningOn, type AgentLive } from './agents.ts'
import { Folded, Markdown, NodeRow, Options, Part, When, useServices } from './common.tsx'
import { MainChatLine } from './MainChat.tsx'
import { byCreation, dotTone, historyText, needsHuman, presenceText, progressOf, progressText, statusText } from './model.ts'
import { hasUserPage, whoBuilds } from './user-view.ts'

const HISTORY_SHOWN = 6

/** The writing check's fields and rules in the panel's words (plain-ui 1.3 §5.3). */
const WORDING_FIELDS: Readonly<Record<string, string>> = { title: '标题', why: '为什么', proposal: '推荐', notTaken: '不选的那种', conclusion: '结论' }
const WORDING_RULES: Readonly<Record<string, string>> = {
  code: '带路线或章节编号',
  id: '带图里的编号',
  identifier: '带代码名或文件名',
  enum: '带英文状态词',
  term: '带内部用词',
  typeWord: '带类型名',
  jargon: '带换词表上的词',
  length: '太长或不止一行',
}

/** A verified decision reads as success, an overturned one as danger, a superseded one as plain history. */
const VERIFICATION_TONES: Readonly<Record<Verification, 'warning' | 'success' | 'danger' | 'neutral'>> = {
  unverified: 'warning',
  sandbox: 'success',
  device: 'success',
  overturned: 'danger',
  superseded: 'neutral',
}

/**
 * The task's run as a line (plain-ui 1.3 §4.5): who works here, and how to
 * stop or redo it — a word to the main agent, or the /graph-run command
 * the human types; the panel has no buttons for it.
 */
function RunLine({ node, agents }: { readonly node: GraphNode, readonly agents: readonly AgentLive[] }): ReactElement | null {
  if (node.type !== 'task') return null
  const here = (placements(agents).get(node.id) ?? []).filter(agent => agent.running)
  const presence = presenceText(node.status, here.map(agent => agent.name))
  return (
    <Part title="运行">
      <div className="glmg-text">{node.status === 'doing' ? '在做' : node.status === 'done' ? '做完了' : presence ?? '还没开始'}</div>
      <div className="glmg-meta">要停或重做：跟主 Agent 说，或在输入框打 /{RUN_COMMAND} stop {node.id}、/{RUN_COMMAND} redo {node.id}</div>
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
  /** 用户怎么用 of a goal (user graph design 0.4.1 §6.1: the goal's and the user nodes' pages lead there). */
  readonly onUserPage: (goalId: string) => void
}

/**
 * The detail's frame: 返回 on top, Escape closes, and focus moves to 返回
 * when it opens (the frame mounts once per page), so the keyboard starts
 * inside it. The board pages of the panel open in the same frame.
 */
export function Frame({ onBack, onClose, children }: Pick<DetailProps, 'onBack' | 'onClose'> & { readonly children: ReactNode }): ReactElement {
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

/**
 * 谁在做它 (user graph design 0.4.1 §3.7): a step has no children; its page
 * lists the features and tasks that serve it, with their status.
 */
function Builders({ graph, step }: { readonly graph: LoadedGraph, readonly step: GraphNode }): ReactElement {
  const builders = whoBuilds(graph, step)
  return (
    <Part title="谁在做它">
      {builders.length === 0
        ? <div className="glmg-meta">还没人负责</div>
        : builders.map(builder => <NodeRow key={builder.id} graph={graph} node={builder} tone={dotTone(builder)} path status />)}
    </Part>
  )
}

export function NodeDetail({ graph, id, agents, onBack, onClose, onUserPage }: DetailProps): ReactElement {
  const { open } = useServices()
  const node = graph.nodes.get(id)
  if (node === undefined) {
    return <Frame onBack={onBack} onClose={onClose}><div className="glmg-notice">这个节点已经不在图里了。</div></Frame>
  }
  const ancestors = ancestorsOf(graph, node).reverse()
  const children = [...graph.nodes.values()].filter(child => child.parent === node.id).sort(byCreation(graph))
  const live = runningOn(agents)
  const progress = progressText(progressOf(graph, node.id))
  const history = node.history.slice(-HISTORY_SHOWN).reverse()
  const done = node.status === 'done'
  const userGoal = node.type === 'goal' || isUserNode(node) ? goalOf(graph, node.id) : undefined
  const userEntry = userGoal !== undefined && hasUserPage(graph, userGoal) ? userGoal : undefined
  const why = whyOf(node)
  // The writing check's notices on this node (plain-ui 1.3 §5.3): small print by the id, only to read.
  const wording = graph.issues.filter(issue => issue.file === `nodes/${node.id}.json` && issue.rule !== undefined)
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
          <Tag tone={needsHuman(node) ? 'danger' : done ? 'success' : node.status === 'doing' ? 'warning' : 'neutral'}>{node.type === 'question' && done ? STATUS_LABELS[node.status] : statusText(node, graph)}</Tag>
          {node.verification === undefined ? null : <Tag tone={VERIFICATION_TONES[node.verification]}>{VERIFICATION_LABELS[node.verification]}</Tag>}
          {node.stage === undefined ? null : <Tag tone="neutral">阶段：{STAGE_LABELS[node.stage]}</Tag>}
          {node.kind === undefined ? null : <Tag tone="neutral">{KIND_LABELS[node.kind]}</Tag>}
          {node.tier === undefined ? null : <Tag tone="neutral">{TIER_LABELS[node.tier]}</Tag>}
        </div>
        {userEntry === undefined ? null : <button type="button" className="glmg-more" onClick={() => { onUserPage(userEntry.id) }}>用户怎么用 ›</button>}
        {node.body === undefined ? null : <Folded lines={10} className="glmg-text"><Markdown text={node.body} /></Folded>}
        {node.type === 'question' ? null : <Part title="为什么"><div className={why === undefined ? 'glmg-meta' : 'glmg-text'}>{why ?? '没写'}</div></Part>}
        {node.type === 'question' ? <Part title="选项"><Options node={node} /><MainChatLine /></Part> : null}
        {node.status === 'proposed' && node.type !== 'question' ? <><div className="glmg-notice">要批准或不要</div><MainChatLine /></> : null}
        <RunLine node={node} agents={agents} />
        {(node.acceptance ?? []).length === 0
          ? null
          : <Part title="怎样算完成"><ul className={`glmg-list${done ? ' ok' : ''}`}>{(node.acceptance ?? []).map(item => <li key={item}>{item}</li>)}</ul></Part>}
        {(node.nonGoals ?? []).length === 0
          ? null
          : <Part title="不做什么"><ul className="glmg-list">{(node.nonGoals ?? []).map(item => <li key={item}>{item}</li>)}</ul></Part>}
        {node.type === 'step' ? <Builders graph={graph} step={node} /> : null}
        {children.length === 0
          ? null
          : (
              <Part title={['下面的节点', progress.work, progress.questions].filter(part => part !== undefined).join(' · ')}>
                {children.map(child => <NodeRow key={child.id} graph={graph} node={child} tone={live.has(child.id) ? `${dotTone(child)} live` : dotTone(child)} status />)}
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
        <div className="glmg-id">
          跟 agent 说起它时可以用 id：<code>{node.id}</code>
          {wording.length === 0 ? null : <div className="glmg-meta">写法提示：{wording.map(issue => `${WORDING_FIELDS[issue.field ?? ''] ?? issue.field ?? ''}${WORDING_RULES[issue.rule ?? ''] ?? issue.rule ?? ''}`).join('、')}</div>}
        </div>
    </Frame>
  )
}
