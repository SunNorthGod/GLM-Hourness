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
import type { SessionsClient } from '../dsh.ts'
import { BOARD_ORDER, projectionBoard, type Board } from '../graph/boards.ts'

export interface LessonsBoardDeps {
  readonly sessions: SessionsClient
}

/** The board over the client's session list; the returned disposer stops following it. */
export function lessonsBoard(page: ComponentType<{ readonly sessionId: string }>, deps: LessonsBoardDeps): { readonly board: Board, readonly dispose: () => void } {
  return projectionBoard({
    id: BOARD_ORDER[2],
    label: '经验',
    page,
    sessions: deps.sessions,
    available: values => values?.hournessLessons !== undefined || values?.hournessMemory !== undefined,
  })
}
