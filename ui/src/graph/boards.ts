/**
 * The board registration table of the panel (plain-ui 0.7 §4.7, M5 design
 * §8.2): the module-level table the boards of the panel register themselves
 * in, and the order the panel lists them in. The panel only reads this
 * table: it lists the boards whose `available` is true, in BOARD_ORDER,
 * opening a board's Page on its second-layer stack. plain-ui owns the full
 * home page and footer; until then this is the one table and the panel's
 * temporary entry reads it. No React here: the specs run the table under
 * Node, so the panel-side hook lives with the panel.
 */
import type { ComponentType } from 'react'

/** What one board tells the panel about itself right now. */
export interface BoardState {
  readonly available: boolean
  /** The line on the home page's 现在, at most 60 code points; null hides it. */
  readonly homeLine: string | null
  /** The line on the onboarding page, at most 60 code points; null hides it. */
  readonly guideLine: string | null
  /** Only the rules board uses it (GLM peak pricing); every other board is false. */
  readonly peakApplies: boolean
}

/** The known boards and their order on the footer and the onboarding page. */
export const BOARD_ORDER = ['rules', 'loops', 'lessons'] as const

export interface Board {
  readonly id: string
  /** The name on the footer. */
  readonly label: string
  /** Call the listener when this session's state changes; returns the unsubscribe. */
  subscribe(sessionId: string, listener: () => void): () => void
  /** Read the board's cache synchronously; the same object while unchanged (useSyncExternalStore). */
  snapshot(sessionId: string): BoardState
  readonly Page: ComponentType<{ readonly sessionId: string }>
}

/** The table, best available first, then by registration. */
const table: Board[] = []

/**
 * A board registers itself here once at activation. A second registration
 * of the same id is a build or wiring bug: console.error, no overwrite.
 */
export function registerBoard(board: Board): void {
  const known = table.find(entry => entry.id === board.id)
  if (known !== undefined) {
    console.error(`glm-hourness: board ${board.id} is registered already; keeping the first registration`)
    return
  }
  table.push(board)
}

/** The registered boards: the BOARD_ORDER ids in that order, the others after them by registration. */
export function boards(): readonly Board[] {
  const ordered = BOARD_ORDER.flatMap(id => table.filter(board => board.id === id))
  return [...ordered, ...table.filter(board => !(BOARD_ORDER as readonly string[]).includes(board.id))]
}
