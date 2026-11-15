/**
 * The rules board in the panel's table (rules design 0.10 §9.1, plain-ui 1.3
 * §4.7, docs/ORCHESTRATION.md §16.14; ui/src/graph/boards.ts viewBoard):
 * `id: 'rules'` (BOARD_ORDER[0]), `label: '规则板'`, available when the
 * rules row's projection hournessRules is there for the session, also for a
 * session outside any project (its page says that only the code's rules
 * apply). For a session in a project the board holds the project's
 * view.json reader (./source.ts) and hands over what the file says: the
 * home line and the guide line of ./model.ts, whether the peak mode
 * applies (a pricing service is there), and the board's status entries
 * verbatim. No React here: the page component is handed in, the specs run
 * this file under Node.
 */
import type { ComponentType } from 'react'
import type { RulesView } from '../../../src/rules/view.ts'
import type { RemoteRoot, SessionsClient } from '../dsh.ts'
import { BOARD_ORDER, viewBoard, type Board } from '../graph/boards.ts'
import { rulesGuideLine, rulesHomeLine } from './model.ts'
import { holdRulesSource } from './source.ts'

const NOTHING_YET = { available: true, homeLine: null, guideLine: null, peakApplies: false } as const

/** The board over the client's session list; the returned disposer stops following it and lets every reader go. */
export function rulesBoard(page: ComponentType<{ readonly sessionId: string }>, deps: { readonly remote: RemoteRoot, readonly sessions: SessionsClient }): { readonly board: Board, readonly dispose: () => void } {
  return viewBoard<RulesView>({
    id: BOARD_ORDER[0],
    label: '规则板',
    page,
    remote: deps.remote,
    sessions: deps.sessions,
    key: 'hournessRules',
    available: () => true,
    viewFile: values => typeof values.viewFile === 'string' && values.viewFile !== '' ? values.viewFile : null,
    hold: holdRulesSource,
    stateOf: view => view === null
      ? { ...NOTHING_YET }
      : { available: true, homeLine: rulesHomeLine(view), guideLine: rulesGuideLine(view), peakApplies: view.peak.applies, items: view.items },
  })
}
