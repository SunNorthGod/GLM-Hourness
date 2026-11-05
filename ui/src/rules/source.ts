/**
 * The reader behind the rules board (docs/ORCHESTRATION.md §16.14): the
 * project's view.json, which the rules row writes, read whole through
 * remote.workspaceFiles, followed through its changes feed and re-checked
 * by size and version every 15 s while someone subscribes (the panel's view
 * file reader, ../graph/view-file.ts), and parsed with the reader the host
 * shares (src/rules/view.ts parseRulesView). The board and the page read
 * nothing else of the rules row's. A failed read, or a text that is not a
 * view, keeps the last view and the reason goes to the top of the page; a
 * view.json that is not there yet is no view, not a failure. One per
 * session and file, shared through holdRulesSource by the board and the
 * page.
 */
import { parseRulesView, type RulesView } from '../../../src/rules/view.ts'
import type { RemoteRoot } from '../dsh.ts'
import { viewFileHolder, ViewFileSource, type ViewFileSnapshot, type ViewFileSpec } from '../graph/view-file.ts'
import { POLL_MS } from '../graph/watched-files.ts'

/** The view of the last good read is the snapshot's model; null while there is none. */
export type RulesSnapshot = ViewFileSnapshot<RulesView | null>

const RULES_FILE: ViewFileSpec<RulesView, RulesView | null> = {
  label: 'rules',
  parse: parseRulesView,
  build: view => view,
  failed: message => `规则板读不出：${message}`,
  unreadable: '规则板的 view.json 读不懂，下面是上一次读到的样子',
}

export class RulesSource extends ViewFileSource<RulesView, RulesView | null> {
  constructor(remote: RemoteRoot, sessionId: string, viewFile: string, pollMs: number = POLL_MS) {
    super(remote, sessionId, viewFile, RULES_FILE, pollMs)
  }
}

/** The shared source of one session's view.json; release it when the board or the page lets go. */
export const holdRulesSource = viewFileHolder((remote, sessionId, viewFile) => new RulesSource(remote, sessionId, viewFile))
