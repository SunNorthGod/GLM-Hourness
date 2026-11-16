/**
 * The loop board in the panel's table (loop board design 0.6 §8.1,
 * ui/src/graph/boards.ts viewBoard): `id: 'loops'`, `label: '循环板'`, there
 * for a session whose projection hournessLoops names a project (a session
 * outside any git project has no board). The home line is the ladder of
 * design §8.3 over the view.json's facts (./model.ts loopsHomeLine — the
 * main agent's line for a state the home page names, else a script entry no
 * longer the agreed version); guideLine stays null and peakApplies is false;
 * the board hands over the status entries of the view.json it holds (status
 * hub 0.3 §3.4, §12 loops row — the two weekly lists, the same items the
 * row's status view serves the collector). No React here: the page component
 * is handed in, the specs run this file under Node.
 */
import type { ComponentType } from 'react'
import type { LoopsView } from '../../../src/loops/view.ts'
import type { RemoteRoot, SessionsClient } from '../dsh.ts'
import { BOARD_ORDER, viewBoard, type Board } from '../graph/boards.ts'
import { loopsHomeLine } from './model.ts'
import { holdLoopsSource } from './source.ts'

const NOTHING_YET = { available: true, homeLine: null, guideLine: null, peakApplies: false } as const

/** The board over the client's session list; the returned disposer stops following it and lets every reader go. */
export function loopsBoard(page: ComponentType<{ readonly sessionId: string }>, deps: { readonly remote: RemoteRoot, readonly sessions: SessionsClient }): { readonly board: Board, readonly dispose: () => void } {
  return viewBoard<LoopsView>({
    id: BOARD_ORDER[1],
    label: '循环板',
    page,
    remote: deps.remote,
    sessions: deps.sessions,
    key: 'hournessLoops',
    available: values => typeof values.projectKey === 'string',
    viewFile: values => typeof values.viewFile === 'string' && values.viewFile !== '' ? values.viewFile : null,
    hold: holdLoopsSource,
    stateOf: view => view === null
      ? { ...NOTHING_YET }
      : { available: true, homeLine: loopsHomeLine(view), guideLine: null, peakApplies: false, items: view.items },
  })
}
