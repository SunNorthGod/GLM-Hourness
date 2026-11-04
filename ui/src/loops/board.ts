/**
 * The loop board in the panel's table (loop board design 0.6 §8.1,
 * ui/src/graph/boards.ts): `id: 'loops'`, `label: '循环板'`, available when
 * the loop row's projection hournessLoops names a project for the session
 * (a session outside any git project has no board). homeLine and guideLine
 * stay null and peakApplies is false; the board hands over no status
 * entries (docs/ORCHESTRATION.md §18.7). No React here: the page component
 * is handed in, the specs run this file under Node.
 */
import type { ComponentType } from 'react'
import type { SessionsClient } from '../dsh.ts'
import { BOARD_ORDER, projectionBoard, type Board } from '../graph/boards.ts'

/** The board over the client's session list; the returned disposer stops following it. */
export function loopsBoard(page: ComponentType<{ readonly sessionId: string }>, sessions: SessionsClient): { readonly board: Board, readonly dispose: () => void } {
  return projectionBoard({
    id: BOARD_ORDER[1],
    label: '循环板',
    page,
    sessions,
    available: values => typeof values?.hournessLoops?.projectKey === 'string',
  })
}
