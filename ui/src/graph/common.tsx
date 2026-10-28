/**
 * Pieces every view of the graph panel shares: the services context, the
 * write hook (graph writes and run controls), markdown with its copy
 * labels, and the option picker that decides (or overturns) a question.
 */
import { Button, Input, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import { createContext, useContext, useState, type ReactElement } from 'react'
import type { LoadedGraph } from '../../../src/graph/parse.ts'
import type { DecisionOption, GraphNode } from '../../../src/graph/schema.ts'
import type { RunAction } from '../../../src/graph/run.ts'
import type { CommandsRemote } from '../dsh.ts'
import { applyMutation, runControl, type ApplyOutcome } from './apply.ts'

export interface PanelServices {
  readonly commands: CommandsRemote
  readonly sessionId: string
  /** Show one node in the detail view. */
  readonly open: (id: string) => void
}

export const ServicesContext = createContext<PanelServices | null>(null)

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

export function Markdown({ text, className }: { readonly text: string, readonly className?: string }): ReactElement {
  return <MarkdownText text={text} labels={MARKDOWN_LABELS} {...(className === undefined ? {} : { className })} />
}

/** The revision a write to this node must carry. */
export function revOf(graph: LoadedGraph, id: string): string {
  return graph.revisions.get(id) ?? ''
}

export function Outcome({ outcome }: { readonly outcome: ApplyOutcome | undefined }): ReactElement | null {
  if (outcome === undefined) return null
  return <div className={outcome.ok ? 'glmg-result' : 'glmg-result bad'} role="status">{outcome.text}</div>
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
              <span className="glmg-option-text">{option.consequence}</span>
            </button>
            {isPicked
              ? (
                  <div className="glmg-confirm">
                    <Input value={reason} placeholder="一句理由（可不填）" aria-label="理由" onChange={event => { setReason(event.target.value) }} onKeyDown={event => { if (event.key === 'Enter') void decide(option) }} />
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
