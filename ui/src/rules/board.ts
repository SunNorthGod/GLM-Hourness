/**
 * The rules board in the panel's table (rules design 0.10 §9.1, plain-ui 1.3
 * §4.7, docs/ORCHESTRATION.md §16.14): `id: 'rules'` (BOARD_ORDER[0]),
 * `label: '规则板'`, available when the rules row's projection hournessRules
 * is there for the session, also for a session outside any project (its
 * page says that only the code's rules apply). For a session in a project
 * the board holds the project's view.json reader (./source.ts) and hands
 * over what the file says: the home line and the guide line of ./model.ts,
 * whether the peak mode applies (a pricing service is there), and the
 * board's status entries verbatim. It follows the projections (asking once
 * for a cold session) and each held reader; the same state object stays
 * while nothing it hands over moved. No React here: the page component is
 * handed in, the specs run this file under Node.
 */
import type { ComponentType } from 'react'
import type { RulesView } from '../../../src/rules/view.ts'
import type { RemoteRoot, SessionsClient } from '../dsh.ts'
import { BOARD_ORDER, boardSessions, type Board, type BoardState } from '../graph/boards.ts'
import { rulesGuideLine, rulesHomeLine } from './model.ts'
import { holdRulesSource, type RulesSource } from './source.ts'

const UNAVAILABLE: BoardState = { available: false, homeLine: null, guideLine: null, peakApplies: false }
/** There, with nothing to hand over yet: no project, or no view.json read. */
const NOTHING_YET: BoardState = { available: true, homeLine: null, guideLine: null, peakApplies: false }

function stateOf(view: RulesView | null): BoardState {
  if (view === null) return NOTHING_YET
  return { available: true, homeLine: rulesHomeLine(view), guideLine: rulesGuideLine(view), peakApplies: view.peak.applies, items: view.items }
}

/** Whether two states hand over the same: then the board keeps the one it has. */
const sameState = (a: BoardState, b: BoardState): boolean =>
  a.available === b.available && a.homeLine === b.homeLine && a.guideLine === b.guideLine && a.peakApplies === b.peakApplies && JSON.stringify(a.items) === JSON.stringify(b.items)

interface Held {
  readonly viewFile: string
  readonly source: RulesSource
  release: () => void
  unsubscribe: () => void
}

/** The board over the client's session list; the returned disposer stops following it and lets every reader go. */
export function rulesBoard(page: ComponentType<{ readonly sessionId: string }>, deps: { readonly remote: RemoteRoot, readonly sessions: SessionsClient }): { readonly board: Board, readonly dispose: () => void } {
  const sessions = boardSessions()
  const held = new Map<string, Held>()

  const letGo = (sessionId: string): void => {
    const hold = held.get(sessionId)
    if (hold === undefined) return
    held.delete(sessionId)
    hold.unsubscribe()
    hold.release()
  }

  /** The reader of the session's view.json, held while the projection names it. */
  const readerOf = (sessionId: string, viewFile: string | null): RulesSource | undefined => {
    const known = held.get(sessionId)
    if (known !== undefined && known.viewFile === viewFile) return known.source
    letGo(sessionId)
    if (viewFile === null) return undefined
    const shared = holdRulesSource(deps.remote, sessionId, viewFile)
    held.set(sessionId, { viewFile, ...shared, unsubscribe: shared.source.subscribe(recompute) })
    return shared.source
  }

  const recompute = (): void => {
    const projections = deps.sessions.list.getSnapshot().projectionsBySession
    for (const { sessionId, values } of sessions.listenedWith(projections, id => { void deps.sessions.refreshProjections(id).catch(() => {}) })) {
      const projected = values.hournessRules
      let next = UNAVAILABLE
      if (projected === undefined) letGo(sessionId)
      else {
        const viewFile = typeof projected.viewFile === 'string' && projected.viewFile !== '' ? projected.viewFile : null
        next = stateOf(readerOf(sessionId, viewFile)?.getSnapshot().model ?? null)
      }
      const current = sessions.state(sessionId)
      if (current === undefined || !sameState(current, next)) sessions.remember(sessionId, next)
    }
    // A session nobody listens to any more lets its reader go.
    const listened = new Set(sessions.listened())
    for (const sessionId of [...held.keys()].filter(id => !listened.has(id))) letGo(sessionId)
  }

  const unsubscribeList = deps.sessions.list.subscribe(recompute)

  return {
    board: {
      id: BOARD_ORDER[0],
      label: '规则板',
      subscribe: (sessionId, listener) => {
        const off = sessions.subscribe(sessionId, listener)
        recompute()
        return () => {
          off()
          recompute()
        }
      },
      snapshot: sessionId => sessions.state(sessionId) ?? UNAVAILABLE,
      Page: page,
    },
    dispose: () => {
      unsubscribeList()
      for (const sessionId of [...held.keys()]) letGo(sessionId)
    },
  }
}
