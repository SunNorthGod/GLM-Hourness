/**
 * Pieces every view of the graph panel shares: the services context, the
 * write hook (graph writes and run controls), markdown with its copy
 * labels, folding of long content, keyboard-reachable rows and the node
 * row, the titled parts views are made of, and the option picker that
 * decides (or overturns) a question.
 */
import { Button, Input, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import { createContext, useContext, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from 'react'
import { TYPE_LABELS } from '../../../src/graph/labels.ts'
import type { LoadedGraph } from '../../../src/graph/parse.ts'
import { ancestorsOf } from '../../../src/graph/projection.ts'
import type { DecisionOption, GraphNode } from '../../../src/graph/schema.ts'
import type { RunAction } from '../../../src/graph/run.ts'
import type { CommandsRemote } from '../dsh.ts'
import { applyMutation, runControl, type ApplyOutcome } from './apply.ts'
import { absoluteTime, progressOf, progressText, statusText, timeAgo } from './model.ts'

export interface PanelServices {
  readonly commands: CommandsRemote
  readonly sessionId: string
  /** Show one node in the detail view. */
  readonly open: (id: string) => void
}

export const ServicesContext = createContext<PanelServices | null>(null)

/** The panel's clock (agents.ts useNow), one for every relative time in the panel. */
export const NowContext = createContext(0)

/** A relative time (3 分钟前) that follows the panel's clock, with the local date and minute as its tooltip. */
export function When({ at }: { readonly at: string }): ReactElement {
  const now = useContext(NowContext)
  return <span title={absoluteTime(at)}>{timeAgo(at, now)}</span>
}

export function useServices(): PanelServices {
  const services = useContext(ServicesContext)
  if (services === null) throw new Error('graph panel: services are missing')
  return services
}

export interface Writer {
  readonly busy: boolean
  readonly outcome: ApplyOutcome | undefined
  run(mutation: Readonly<Record<string, unknown>>): Promise<ApplyOutcome>
  /** A run control on a task (/graph-run). */
  control(action: RunAction, id: string): Promise<ApplyOutcome>
}

/** One command at a time from one set of controls (no double sends: a command is not idempotent), with its outcome kept for display. */
export function useWriter(): Writer {
  const { commands, sessionId } = useServices()
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<ApplyOutcome | undefined>(undefined)
  const send = async (task: () => Promise<ApplyOutcome>): Promise<ApplyOutcome> => {
    setBusy(true)
    setOutcome(undefined)
    const result = await task()
    setBusy(false)
    setOutcome(result)
    return result
  }
  return {
    busy,
    outcome,
    run: mutation => send(() => applyMutation(commands, sessionId, mutation)),
    control: (action, id) => send(() => runControl(commands, sessionId, action, id)),
  }
}

const MARKDOWN_LABELS = {
  code: { copyLabel: '复制', copiedLabel: '已复制', toolbarLabels: { codeLabel: '代码', wrapLabel: '自动换行', unwrapLabel: '不换行' } },
  footnotes: '脚注',
} as const

/**
 * Markdown sized by its container: MarkdownText drops a className and sets
 * its own type scale, so the wrapper carries the panel's sizes and
 * paragraph spacing (styles.ts, .glmg-md).
 */
export function Markdown({ text }: { readonly text: string }): ReactElement {
  return <div className="glmg-md"><MarkdownText text={text} labels={MARKDOWN_LABELS} /></div>
}

/**
 * Content folded to `lines` lines of its own line height behind 展开
 * (收起 folds it back). The fold is measured, not guessed from the text:
 * the toggle and the fade appear only when the content overflows the
 * folded height at the current width.
 */
export function Folded({ lines, className, children }: { readonly lines: number, readonly className?: string, readonly children: ReactNode }): ReactElement {
  const box = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)
  useLayoutEffect(() => {
    const element = box.current
    if (element === null || inner.current === null || open) return undefined
    const measure = (): void => { setOverflows(element.scrollHeight > element.clientHeight + 1) }
    measure()
    // The box changes size with the width; the content changes size when it re-renders.
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    observer.observe(inner.current)
    return () => { observer.disconnect() }
  }, [open])
  const folded = open ? '' : overflows ? ' clamp faded' : ' clamp'
  return (
    <div className="glmg-fold">
      <div ref={box} className={`${className ?? ''}${folded}`} style={open ? undefined : { maxHeight: `${lines}lh` }}>
        <div ref={inner}>{children}</div>
      </div>
      {open || overflows ? <button type="button" className="glmg-more" aria-expanded={open} onClick={() => { setOpen(!open) }}>{open ? '收起' : '展开'}</button> : null}
    </div>
  )
}

/**
 * Props that let an element that is not a button open something the way a
 * button does: in the tab order, named as a button, Enter or Space on the
 * element itself (not on a control inside it) acts like a click.
 */
export function asButton<T extends Element>(onActivate: () => void): { readonly role: 'button', readonly tabIndex: 0, readonly onClick: () => void, readonly onKeyDown: (event: KeyboardEvent<T>) => void } {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: event => {
      if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
      event.preventDefault()
      onActivate()
    },
  }
}

/**
 * One node as a list row (正在做's lists, the detail's children): the
 * dot, the title, then on one meta line the type, optionally the status
 * and the path below the goal, and the progress of its work children. The
 * row opens the node.
 */
export function NodeRow({ graph, node, tone, path, status }: { readonly graph: LoadedGraph, readonly node: GraphNode, readonly tone: string, readonly path?: boolean, readonly status?: boolean }): ReactElement {
  const { open } = useServices()
  const progress = progressOf(graph, node.id)
  const text = progressText(progress)
  // The goal is in the panel header; a node right under it has no path of its own.
  const trail = path === true ? ancestorsOf(graph, node).filter(ancestor => ancestor.type !== 'goal').map(ancestor => ancestor.title).reverse() : []
  return (
    <div className="glmg-row" {...asButton<HTMLDivElement>(() => { open(node.id) })}>
      <span className={`glmg-dot ${tone}`} aria-hidden="true" />
      <div className="glmg-row-main">
        <div className="glmg-row-title">{node.title}</div>
        <div className="glmg-meta">
          <span>{TYPE_LABELS[node.type]}</span>
          {status === true ? <span>{statusText(node)}</span> : null}
          {trail.length === 0 ? null : <span>{trail.join(' › ')}</span>}
          {text.work === undefined
            ? null
            : <span className="glmg-meter"><span className="glmg-progress" aria-hidden="true"><b style={{ width: `${Math.round(progress.done / progress.total * 100)}%` }} /></span>{text.work}</span>}
          {text.questions === undefined ? null : <span>{text.questions}</span>}
        </div>
      </div>
    </div>
  )
}

/** One part of a view or of the node detail: a title over its content, set off from the part above by a rule. */
export function Part({ title, children }: { readonly title: ReactNode, readonly children: ReactNode }): ReactElement {
  return (
    <section className="glmg-part">
      <div className="glmg-section">{title}</div>
      {children}
    </section>
  )
}

/** The revision a write to this node must carry. */
function revOf(graph: LoadedGraph, id: string): string {
  return graph.revisions.get(id) ?? ''
}

export function Outcome({ outcome }: { readonly outcome: ApplyOutcome | undefined }): ReactElement | null {
  if (outcome === undefined) return null
  return <div className={outcome.ok ? 'glmg-result' : 'glmg-result bad'} role="status">{outcome.text}</div>
}

/**
 * Approve or reject a proposal, the same control on a 需要你 card and in
 * the detail: 批准 approves at once; 不要 asks for an optional reason and
 * a second click on 否决 before it rejects (a rejected node is dropped).
 */
export function ProposalActions({ graph, node, onSettled }: { readonly graph: LoadedGraph, readonly node: GraphNode, readonly onSettled?: () => void }): ReactElement {
  const writer = useWriter()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const settle = async (op: 'approve' | 'reject'): Promise<void> => {
    const fallback = op === 'approve' ? '在面板里批准' : '在面板里否决'
    const result = await writer.run({ op, id: node.id, rev: revOf(graph, node.id), reason: reason.trim().length > 0 ? reason.trim() : fallback })
    if (result.ok) onSettled?.()
  }
  return (
    <>
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
    </>
  )
}

interface OptionsProps {
  readonly graph: LoadedGraph
  readonly node: GraphNode
  /** Called after a successful decide, before the graph re-reads. */
  readonly onDecided?: () => void
}

/**
 * The options of a question as buttons. Picking one asks for an optional
 * reason and decides as the human; on a decided question the current
 * choice is marked and the others overturn it.
 */
export function Options({ graph, node, onDecided }: OptionsProps): ReactElement {
  const writer = useWriter()
  const [picked, setPicked] = useState<string | undefined>(undefined)
  const [reason, setReason] = useState('')
  const options: readonly DecisionOption[] = node.options ?? []
  const decide = async (option: DecisionOption): Promise<void> => {
    const result = await writer.run({
      op: 'decide',
      id: node.id,
      rev: revOf(graph, node.id),
      option: option.key,
      reason: reason.trim().length > 0 ? reason.trim() : `在面板里选了 ${option.key} ${option.label}`,
    })
    if (result.ok) {
      setPicked(undefined)
      setReason('')
      onDecided?.()
    }
  }
  return (
    <div className="glmg-options">
      {options.map(option => {
        const current = node.status === 'done' && node.decision === option.key
        const isPicked = picked === option.key
        return (
          <div key={option.key}>
            <button
              type="button"
              className={`glmg-option${isPicked ? ' picked' : ''}${current ? ' current' : ''}`}
              disabled={current || writer.busy}
              onClick={() => { setPicked(isPicked ? undefined : option.key) }}
            >
              <span className="glmg-option-head">
                <span className="glmg-option-key">{option.key}</span>
                {option.label}
                {node.recommend === option.key && node.status !== 'done' ? <span className="glmg-who relay">推荐</span> : null}
                {current ? <span className="glmg-who human">当前</span> : null}
              </span>
              <span className="glmg-option-text">{option.consequence ?? `得到 ${option.gain ?? ''}；代价 ${option.cost ?? ''}`}</span>
            </button>
            {isPicked
              ? (
                  <div className="glmg-confirm">
                    <Input
                      value={reason}
                      placeholder="一句理由（可不填）"
                      aria-label="理由"
                      onChange={event => { setReason(event.target.value) }}
                      onKeyDown={event => {
                        // The Enter that commits an IME composition is not a submit (DSH's own editors check the same), and a busy writer is not sent twice.
                        if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.keyCode === 229 || writer.busy) return
                        void decide(option)
                      }}
                    />
                    <Button variant="primary" size="sm" disabled={writer.busy} onClick={() => { void decide(option) }}>{node.status === 'done' ? '改成这个' : '就这个'}</Button>
                  </div>
                )
              : null}
          </div>
        )
      })}
      <Outcome outcome={writer.outcome} />
    </div>
  )
}
