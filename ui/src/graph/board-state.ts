/**
 * The panel-side hook over the board registration table (plain-ui 1.3
 * §4.7, M5 §8.2): one board's checked state for one session, stable while
 * the board's snapshot is. The table itself stays React-free (boards.ts -
 * the specs run it under Node), so the hook lives here where the panel
 * and the guide page both read it. A board whose subscribe or snapshot
 * throws is treated as not available, warned about once; the others go
 * on. An unregistered board id reads as not available, without a hook
 * count changing.
 */
import { useCallback, useSyncExternalStore } from 'react'
import { checkedBoardState, type Board, type BoardState } from './boards.ts'

/** The state of a board that is not there or does not answer. */
const BOARD_UNAVAILABLE: BoardState = { available: false, homeLine: null, guideLine: null, peakApplies: false }

const boardWarned = new WeakSet<Board>()

/** Warn about a board's failure once; the same board failing again stays quiet. */
const warnBoardOnce = (board: Board, error: unknown): void => {
  if (boardWarned.has(board)) return
  boardWarned.add(board)
  console.warn(`glm-hourness: board ${board.id} is not available:`, error)
}

/** The state of one registered board for one session; undefined names a board that has not registered. */
export function useBoard(board: Board | undefined, sessionId: string): BoardState {
  const subscribe = useCallback((listener: () => void) => {
    if (board === undefined) return () => {}
    try {
      return board.subscribe(sessionId, listener)
    }
    catch (error) {
      warnBoardOnce(board, error)
      return () => {}
    }
  }, [board, sessionId])
  const getSnapshot = useCallback(() => {
    if (board === undefined) return BOARD_UNAVAILABLE
    try {
      return checkedBoardState(board.id, board.snapshot(sessionId)) ?? BOARD_UNAVAILABLE
    }
    catch (error) {
      warnBoardOnce(board, error)
      return BOARD_UNAVAILABLE
    }
  }, [board, sessionId])
  return useSyncExternalStore(subscribe, getSnapshot)
}
