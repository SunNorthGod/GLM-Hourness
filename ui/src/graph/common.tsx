/**
 * Pieces every view of the graph panel shares: the services context,
 * markdown with its copy labels, folding of long content,
 * keyboard-reachable rows and the node row, the titled parts views are
 * made of, and a question's read-only display — the panel only looks
 * (plain-ui, d-ui-look-not-operate): the answer is said in the main agent's
 * chat, and every card says so.
 */
import { Button, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import { Component, createContext, useContext, useLayoutEffect, useRef, useState, type ErrorInfo, type KeyboardEvent, type ReactElement, type ReactNode } from 'react'
import type { LoadedGraph } from '../../../src/graph/parse.ts'
import { askLines } from '../../../src/graph/plain-view.ts'
import { splitBold } from '../../../src/graph/plan-text.ts'
import { ancestorsOf } from '../../../src/graph/projection.ts'
import type { GraphNode } from '../../../src/graph/schema.ts'
import { absoluteTime, progressOf, progressText, statusText, timeAgo } from './model.ts'

export interface PanelServices {
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
 * One node as a list row (the plan, the detail's children and builders,
 * the framework): the dot, the title, then on one meta line optionally the
 * status and the path below the goal, and the progress of its work
 * children. No type name (done condition 2): a row without `status` has
 * its status written by the caller. The row opens the node.
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
          {status === true ? <span>{statusText(node, graph)}</span> : null}
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

/** One line's words with its one `**…**` span in bold (M3's splitBold); a line without one as it is. */
function Bold({ text }: { readonly text: string }): ReactElement {
  const bold = splitBold(text)
  return bold === undefined ? <>{text}</> : <>{bold.before}<strong>{bold.bold}</strong>{bold.after}</>
}

/**
 * A question as the panel shows it, whole: the question as the human read
 * it, then the lines of its way of asking (the recommendation or guess,
 * the reason, the cost, the ways, the way not taken; plain-view.ts askLines),
 * each its own paragraph, the label not bold. The panel only looks
 * (plain-ui, d-ui-look-not-operate): no option buttons, no letter keys, no
 * recommendation marks — the answer is said in the main agent's chat, and
 * the caller renders where that is (MainChatLine). A decided question
 * shows its conclusion; one with the legacy option card shows the options
 * read-only with the current choice marked.
 */
export function Options({ node }: { readonly node: GraphNode }): ReactElement {
  const options = node.options ?? []
  return (
    <div className="glmg-options">
      {node.ask === undefined ? null : <p className="glmg-text">{node.ask}</p>}
      {askLines(node).map(line => <p key={`${line.label ?? ''}:${line.text}`} className="glmg-text">{line.label === undefined ? null : `${line.label}：`}<Bold text={line.text} /></p>)}
      {options.map(option => (
        <div key={option.key} className="glmg-text">
          {node.status === 'done' && node.decision === option.key ? `选了「${option.label}」` : option.label}
          {option.consequence === undefined ? null : `（${option.consequence}）`}
        </div>
      ))}
      {node.status === 'done' && node.conclusion !== undefined ? <div className="glmg-text">定了：{node.conclusion}</div> : null}
    </div>
  )
}

/**
 * A render error inside one view shows its message instead of retiring the
 * tab body (the graph panel's body and each board page get their own).
 * 重新加载 renders the children again.
 */
export class PanelBoundary extends Component<{ readonly label: string, readonly children: ReactNode }, { readonly error: unknown }> {
  override state: { readonly error: unknown } = { error: undefined }

  static getDerivedStateFromError(error: unknown): { readonly error: unknown } {
    return { error }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(`glm-hourness ${this.props.label}:`, error, info.componentStack)
  }

  override render(): ReactNode {
    if (this.state.error === undefined) return this.props.children
    const { error } = this.state
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown error'
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, padding: 16 }}>
        <span style={{ color: 'var(--dsw-alias-state-error-primary)' }}>{`${this.props.label}出错了：${message}`}</span>
        <Button variant="outline" size="sm" onClick={() => { this.setState({ error: undefined }) }}>重新加载</Button>
      </div>
    )
  }
}
