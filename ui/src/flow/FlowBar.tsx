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
import { useCallback, useSyncExternalStore, type ReactElement } from 'react'
import { mainAgentActive } from '../../../src/graph/main-agent.ts'
import type { ClientContext, RemoteRoot, SessionsClient } from '../dsh.ts'
import type { GraphSnapshot } from '../graph/source.ts'
import { collectSubagentTree, SUBAGENTS_TAB_KIND, subagentPillSummary } from '../subagents/model.ts'
import { useExecuteBoard } from '../subagents/source.ts'
import { FLOW_ID, FLOW_ORDER, FLOW_TEXT, flowBarText, isCheapModel } from './model.ts'
import { useGraph, useSessionValues } from './session.ts'
import { RenderGuard, WarnIcon } from './shared.tsx'
import { FLOW_CSS } from './styles.ts'

const PILL_CSS = [
  '.hf-pill{flex:none;margin-left:auto;display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.16));border-radius:999px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,#e8e8e8);font:inherit;font-size:11.5px;line-height:18px;cursor:pointer;white-space:nowrap}',
  '.hf-pill:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.2))}',
  '.hf-pill.attn{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#f59e0b) 60%,transparent);color:var(--dsw-alias-state-warn-primary,#f59e0b)}',
].join('\n')

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

function makeBar(remote: RemoteRoot, sessions: SessionsClient, sidebarRight?: ClientContext['sidebarRight']): (props: BarProps) => ReactElement {
  function Bar({ sessionId }: BarProps): ReactElement | null {
    const subscribe = useCallback((listener: () => void) => sessions.list.subscribe(listener), [sessions])
    const listSnapshot = useSyncExternalStore(subscribe, () => sessions.list.getSnapshot())
    const values = useSessionValues(sessions, sessionId)
    const main = mainAgentActive(values)
    const graph = useGraph(remote, sessionId, main)
    const { board } = useExecuteBoard(remote, sessions, sessionId)
    const wasDismissed = useSyncExternalStore(subscribeDismissed, () => dismissed.has(sessionId))
    const live = values?.graphLive
    const text = flowBarText({ main, live, graph: graph ?? LOADING, cheapModel: !wasDismissed && isCheapModel(live?.model) })
    if (text === null) return null

    const tree = collectSubagentTree(sessionId, listSnapshot.projectionsBySession, listSnapshot.byId)
    const runningFromSessions = tree.filter((child) => {
      const childVals = listSnapshot.projectionsBySession[child.id]?.values ?? listSnapshot.byId[child.id]?.projectionValues
      return childVals?.graphLive?.turnSince != null || childVals?.subagentTiming?.active !== undefined
    }).length
    const activeWorkers = Math.max(board?.slots.activeWorkers ?? 0, runningFromSessions)
    const openRequests = board?.requests.length ?? 0
    const pill = subagentPillSummary({ activeWorkers, openRequests })

    const dot = text.waiting ? 'warning' : live !== undefined && live.turnSince !== null ? 'ongoing' : 'idle'
    // The goal bar's type scale: the leading name reads at the label weight, the rest as the
    // bar's body text. The line stays one string (the name span sits inside the text span), so
    // the separator's spaces survive and the whole line still ellipsizes as one.
    const separatorAt = text.line.indexOf(FLOW_TEXT.separator)
    return (
      <div className="hf-bar" role="group" aria-label={FLOW_TEXT.region}>
        <style>{`${FLOW_CSS}\n${PILL_CSS}`}</style>
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
          {pill === null
            ? null
            : (
                <button
                  type="button"
                  className={pill.attention ? 'hf-pill attn' : 'hf-pill'}
                  onClick={() => { sidebarRight?.openTab(SUBAGENTS_TAB_KIND) }}
                >
                  {pill.text}
                </button>
              )}
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
  const FlowBar = makeBar(ctx.remote, ctx.sessions, ctx.sidebarRight)
  ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register<BarProps>({
    name: 'conversation.input.dock',
    id: FLOW_ID,
    order: FLOW_ORDER,
    label: FLOW_TEXT.slotLabel,
    inject: sessionId => ({ sessionId }),
  }, FlowBar as never)), 'hourness-ui: flow bar')
}
