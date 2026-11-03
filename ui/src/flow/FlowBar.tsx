/**
 * The flow bar: a strip above the composer of the main-agent session that
 * says which stage the current goal is in, what is missing and whether the
 * main agent waits for the human (docs/ORCHESTRATION.md §4.8). It reads the
 * session's hournessMainAgent and graphLive projection values and the
 * workspace graph (shared with the panel), and renders nothing in a session
 * that is not the main agent's. It only shows; the one control is the
 * dismissal of the stronger-model reminder. All wording is in ./model.ts.
 */
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { useSyncExternalStore, type ReactElement } from 'react'
import { mainAgentActive } from '../../../src/graph/main-agent.ts'
import type { ClientContext, RemoteRoot, SessionsClient } from '../dsh.ts'
import type { GraphSnapshot } from '../graph/source.ts'
import { FLOW_ID, FLOW_ORDER, FLOW_TEXT, flowBarText, isCheapModel } from './model.ts'
import { useGraph, useSessionValues } from './session.ts'
import { RenderGuard, WarnIcon } from './shared.tsx'
import { FLOW_CSS } from './styles.ts'

/** Sessions whose reminder the human dismissed with "这次就用它": in memory, until the page reloads. */
const dismissed = new Set<string>()
const dismissedListeners = new Set<() => void>()

function subscribeDismissed(listener: () => void): () => void {
  dismissedListeners.add(listener)
  return () => { dismissedListeners.delete(listener) }
}

function dismiss(sessionId: string): void {
  dismissed.add(sessionId)
  for (const listener of dismissedListeners) listener()
}

const LOADING: GraphSnapshot = { status: 'loading' }

interface BarProps {
  readonly sessionId: string
}

function makeBar(remote: RemoteRoot, sessions: SessionsClient): (props: BarProps) => ReactElement {
  function Bar({ sessionId }: BarProps): ReactElement | null {
    const values = useSessionValues(sessions, sessionId)
    const main = mainAgentActive(values)
    const graph = useGraph(remote, sessionId, main)
    const wasDismissed = useSyncExternalStore(subscribeDismissed, () => dismissed.has(sessionId))
    const live = values?.graphLive
    const text = flowBarText({ main, live, graph: graph ?? LOADING, cheapModel: !wasDismissed && isCheapModel(live?.model) })
    if (text === null) return null
    const dot = text.waiting ? 'warning' : live !== undefined && live.turnSince !== null ? 'ongoing' : 'idle'
    // The goal bar's type scale: the leading name reads at the label weight, the rest as the
    // bar's body text. The line stays one string (the name span sits inside the text span), so
    // the separator's spaces survive and the whole line still ellipsizes as one.
    const separatorAt = text.line.indexOf(FLOW_TEXT.separator)
    return (
      <div className="hf-bar" role="group" aria-label={FLOW_TEXT.region}>
        <style>{FLOW_CSS}</style>
        <div className="hf-line">
          <StateDot state={dot} />
          <span className="hf-text" title={text.line}>
            {separatorAt < 0
              ? text.line
              : (
                  <>
                    <span className="hf-name">{text.line.slice(0, separatorAt)}</span>
                    {text.line.slice(separatorAt)}
                  </>
                )}
          </span>
        </div>
        {text.modelNote === null
          ? null
          : (
              <div className="hf-note">
                <WarnIcon />
                <span className="hf-note-text">{text.modelNote}</span>
                <button type="button" className="hf-dismiss" onClick={() => { dismiss(sessionId) }}>{FLOW_TEXT.dismiss}</button>
              </div>
            )}
      </div>
    )
  }
  return function FlowBar(props: BarProps): ReactElement {
    return <RenderGuard entry="flow bar"><Bar {...props} /></RenderGuard>
  }
}

/** Register the bar in the stack above the composer (the same slot DSH's goal and queue strips use). */
export function installFlowBar(ctx: ClientContext): void {
  const FlowBar = makeBar(ctx.remote, ctx.sessions)
  ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register<BarProps>({
    name: 'conversation.input.dock',
    id: FLOW_ID,
    order: FLOW_ORDER,
    label: FLOW_TEXT.slotLabel,
    inject: sessionId => ({ sessionId }),
  }, FlowBar as never)), 'hourness-ui: flow bar')
}
