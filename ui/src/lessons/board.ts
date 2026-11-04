/**
 * The lessons board (M5 design §4.7, §8.2): the one board M5 registers in
 * the panel's table (ui/src/graph/boards.ts). `available` looks at the
 * session projections of the two rows: hournessLessons or hournessMemory
 * being there is enough; the page itself reads the journal paths out of
 * them. homeLine and guideLine stay null (the home page gains no line for
 * it) and peakApplies is false. No React here: the page component is
 * handed in, the specs run this file under Node.
 */
import type { ComponentType } from 'react'
import type { ProjectionValues, SessionsClient } from '../dsh.ts'
import { BOARD_ORDER, boardSessions, type Board, type BoardState } from '../graph/boards.ts'

export interface LessonsBoardDeps {
  readonly sessions: SessionsClient
}

const UNAVAILABLE: BoardState = { available: false, homeLine: null, guideLine: null, peakApplies: false }

/** The board state of one session: the projections of the two rows are there or not. */
const stateOf = (values: ProjectionValues | undefined): BoardState =>
  values?.hournessLessons !== undefined || values?.hournessMemory !== undefined
    ? { available: true, homeLine: null, guideLine: null, peakApplies: false }
    : UNAVAILABLE

/**
 * The board over the client's session list: it follows the projections of
 * every session someone listens to and asks once for the values of a
 * session that has none yet. The returned disposer stops the following.
 */
export function lessonsBoard(page: ComponentType<{ readonly sessionId: string }>, deps: LessonsBoardDeps): { readonly board: Board, readonly dispose: () => void } {
  const sessions = boardSessions()

  const recompute = (): void => {
    for (const { sessionId, values } of sessions.listenedWith(deps.sessions.list.getSnapshot().projectionsBySession, id => { void deps.sessions.refreshProjections(id).catch(() => {}) })) {
      const next = stateOf(values)
      const current = sessions.state(sessionId)
      // Only `available` ever moves; keeping the same object until it does is what useSyncExternalStore requires.
      if (current === undefined || current.available !== next.available) sessions.remember(sessionId, next)
    }
  }

  const unsubscribeList = deps.sessions.list.subscribe(recompute)

  return {
    board: {
      id: BOARD_ORDER[2],
      label: '经验',
      subscribe: (sessionId, listener) => {
        const off = sessions.subscribe(sessionId, listener)
        recompute()
        return off
      },
      snapshot: sessionId => sessions.state(sessionId) ?? UNAVAILABLE,
      Page: page,
    },
    dispose: unsubscribeList,
  }
}
