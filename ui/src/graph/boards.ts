/**
 * The board registration table of the panel (plain-ui 0.7 §4.7, M5 design
 * §8.2, status hub design 0.3 §3.4): the module-level table the boards of
 * the panel register themselves in, and the order the panel lists them in.
 * The panel only reads this table: it lists the boards whose `available` is
 * true, in BOARD_ORDER, opening a board's Page on its second-layer stack.
 * What a board's snapshot hands over is checked here (plain-ui 1.3 §8.2's
 * table row, extended with `items` by the status hub's §12): a field that
 * does not fit is cleaned with one warning, so a board's bug costs it a line
 * or its entries, not the panel. A board that mirrors one of its entries on
 * the home page derives the line through homeLineFromItem, so both faces
 * show one value. plain-ui owns the full home page and footer; until then
 * this is the one table and the panel's temporary entry reads it. No React
 * here: the specs run the table under Node, so the panel-side hook lives
 * with the panel.
 */
import type { ComponentType } from 'react'
import { validateStatusItem, type StatusItem } from '../../../src/shared/status.ts'

/** What one board tells the panel about itself right now. */
export interface BoardState {
  readonly available: boolean
  /** The line on the home page's 现在, at most 60 code points; null hides it. */
  readonly homeLine: string | null
  /** The line on the onboarding page, at most 60 code points; null hides it. */
  readonly guideLine: string | null
  /** Only the rules board uses it (GLM peak pricing); every other board is false. */
  readonly peakApplies: boolean
  /**
   * This board's status entries (status hub 0.3 §3.4): the same items the
   * board's row submits to the hub, for the board's page to list. A board
   * without entries leaves it out.
   */
  readonly items?: readonly StatusItem[]
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

/** The cap the home and guide lines share (plain-ui 1.3 §8.2). */
const LINE_MAX = 60

/** One line of at most 60 code points, or null; anything else is not a line. */
function lineOf(value: unknown): string | null {
  return typeof value === 'string' && !value.includes('\n') && [...value].length <= LINE_MAX ? value : null
}

const warned = new Set<string>()
const warnOnce = (key: string, text: string): void => {
  if (warned.has(key)) return
  warned.add(key)
  console.warn(`glm-hourness: ${text}`)
}

const checkedByInput = new WeakMap<object, BoardState | null>()

/**
 * The snapshot result the panel reads (plain-ui 1.3 §8.2, status hub 0.3
 * §12): `available` is a boolean — anything else makes the whole state
 * unusable, null, and the panel treats the board as not available;
 * `peakApplies` is a boolean, a missing one counts as false; the lines are
 * one line of at most 60 code points or null, a line that does not fit is
 * hidden with one warning; and `items`, when there, is an array whose every
 * entry passes validateStatusItem, the invalid ones dropped and the cleaned
 * ones kept, each with one warning per reason. The checked state is
 * remembered per input object, so a board whose snapshot is stable keeps a
 * stable checked state (useSyncExternalStore).
 */
export function checkedBoardState(boardId: string, state: BoardState): BoardState | null {
  if (typeof state !== 'object' || state === null) {
    warnOnce(`${boardId}:state`, `board ${boardId} handed no state; the panel treats it as not available`)
    return null
  }
  const known = checkedByInput.get(state)
  if (known !== undefined) return known
  if (typeof state.available !== 'boolean') {
    warnOnce(`${boardId}:available`, `board ${boardId} handed no boolean available; the panel treats it as not available`)
    checkedByInput.set(state, null)
    return null
  }
  const key = (field: string): string => `${boardId}:${field}`
  let peakApplies = state.peakApplies
  if (typeof peakApplies !== 'boolean') {
    warnOnce(key('peakApplies'), `board ${boardId} handed a peakApplies that is not a boolean; the panel reads false`)
    peakApplies = false
  }
  const homeLine = lineOf(state.homeLine)
  if (homeLine !== state.homeLine) warnOnce(key('homeLine'), `board ${boardId} handed a homeLine that is not one line of at most ${LINE_MAX} code points; the panel hides it`)
  const guideLine = lineOf(state.guideLine)
  if (guideLine !== state.guideLine) warnOnce(key('guideLine'), `board ${boardId} handed a guideLine that is not one line of at most ${LINE_MAX} code points; the panel hides it`)
  let items: readonly StatusItem[] | undefined
  if (state.items !== undefined) {
    if (Array.isArray(state.items)) {
      const kept: StatusItem[] = []
      for (const candidate of state.items) {
        const result = validateStatusItem(candidate)
        if (!result.ok) {
          warnOnce(`${boardId}:item:${result.reason}`, `board ${boardId} handed a status entry that is dropped (${result.reason})`)
          continue
        }
        for (const warning of result.warnings) warnOnce(`${boardId}:item:${warning}`, `board ${boardId} handed a status entry that is cleaned: ${warning}`)
        kept.push(result.item)
      }
      items = kept
    }
    else warnOnce(key('items'), `board ${boardId} handed items that are not an array; the panel reads none`)
  }
  const checked: BoardState = {
    available: state.available,
    homeLine,
    guideLine,
    peakApplies,
    ...(items === undefined ? {} : { items }),
  }
  checkedByInput.set(state, checked)
  return checked
}

/**
 * The home line a board mirrors from one of its entries (status hub 0.3
 * §3.4): the entry's text, verbatim, when that text fits the home line's 60
 * code points; null otherwise, and the board falls back to its own words or
 * hides the line. The board names the entry by id — that naming is how a
 * mirrored line is told from a lookalike one, so the L2 assertion holds by
 * construction: the home page's line and the board page's entry are one
 * value. Diagnostic lines (a board's own words about itself) are not derived
 * here and are not covered by the assertion.
 */
export function homeLineFromItem(items: readonly StatusItem[] | undefined, itemId: string): string | null {
  const item = items?.find(entry => entry.id === itemId)
  return item !== undefined && [...item.text].length <= LINE_MAX ? item.text : null
}

/**
 * The per-session bookkeeping every board factory needs (plain-ui 1.3 §4.7):
 * listeners and the last handed state per session, an ask-once marker for
 * cold sessions, and the fan-out to a session's listeners. `remember` keeps
 * the very object it was given, so a factory that re-hands the same object
 * while nothing moved keeps useSyncExternalStore stable.
 */
export interface BoardSessions {
  /** Add a listener; the unsubscribe drops the session's state when the last listener leaves. */
  subscribe(sessionId: string, listener: () => void): () => void
  /** Wake the session's listeners. */
  changed(sessionId: string): void
  /** The remembered state, or undefined before the first one. */
  state(sessionId: string): BoardState | undefined
  /** Keep `state` for the session and wake its listeners. */
  remember(sessionId: string, state: BoardState): void
  /** The sessions someone currently listens to. */
  listened(): readonly string[]
  /**
   * The listened sessions and their projection values; a session whose
   * values are not there yet asks once (through `ask`) and is left out of
   * the answer, the list's next change bringing them.
   */
  listenedWith<V>(projections: Readonly<Record<string, { readonly values: V } | undefined>>, ask: (sessionId: string) => void): ReadonlyArray<{ readonly sessionId: string, readonly values: V }>
}

export function boardSessions(): BoardSessions {
  const listeners = new Map<string, Set<() => void>>()
  const states = new Map<string, BoardState>()
  const asked = new Set<string>()
  return {
    subscribe(sessionId, listener) {
      let set = listeners.get(sessionId)
      if (set === undefined) {
        set = new Set()
        listeners.set(sessionId, set)
      }
      set.add(listener)
      return () => {
        set.delete(listener)
        if (set.size === 0) {
          listeners.delete(sessionId)
          states.delete(sessionId)
        }
      }
    },
    changed(sessionId) {
      for (const listener of listeners.get(sessionId) ?? []) listener()
    },
    state: sessionId => states.get(sessionId),
    remember(sessionId, state) {
      states.set(sessionId, state)
      for (const listener of listeners.get(sessionId) ?? []) listener()
    },
    listened: () => [...listeners.keys()],
    listenedWith<V>(projections: Readonly<Record<string, { readonly values: V } | undefined>>, ask: (sessionId: string) => void) {
      const out: Array<{ readonly sessionId: string, readonly values: V }> = []
      for (const sessionId of [...listeners.keys()]) {
        const entry = projections[sessionId]
        if (entry === undefined) {
          if (!asked.has(sessionId)) {
            asked.add(sessionId)
            ask(sessionId)
          }
          continue
        }
        out.push({ sessionId, values: entry.values })
      }
      return out
    },
  }
}
