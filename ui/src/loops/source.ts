/**
 * The reader behind the loop board's page (loop board design 0.6 §8.4): it
 * reads the project's view.json, which the host that runs the board writes,
 * whole, follows it through the changes feed and re-checks it by size and
 * version every 15 s while someone subscribes (the panel's view file
 * reader, ../graph/view-file.ts); the snapshot holds the view as it reads,
 * and the page makes its model of it (./model.ts). The board and the page
 * read nothing else of the board's. A failed read, or a file that is not a
 * view, keeps the last content and the reason goes to the top of the page;
 * a view.json that is not there yet is no view, not a failure. One per
 * session and file, shared through holdLoopsSource.
 */
import type { LoopsView } from '../../../src/loops/view.ts'
import type { RemoteRoot } from '../dsh.ts'
import { viewFileHolder, ViewFileSource, type ViewFileSnapshot, type ViewFileSpec } from '../graph/view-file.ts'
import { POLL_MS } from '../graph/watched-files.ts'

export type LoopsSnapshot = ViewFileSnapshot<LoopsView | null>

/** The view in a file's text, or undefined when the text is not one (another version, a cut write). */
function parseView(text: string): LoopsView | undefined {
  try {
    const value = JSON.parse(text) as Partial<LoopsView> | null
    return value?.version === 1 && Array.isArray(value.entries) && Array.isArray(value.attention) && Array.isArray(value.recent) && typeof value.waiting === 'number'
      ? value as LoopsView
      : undefined
  }
  catch {
    return undefined
  }
}

const LOOPS_FILE: ViewFileSpec<LoopsView, LoopsView | null> = {
  label: 'loops',
  parse: parseView,
  build: view => view,
  failed: message => `循环板读不出：${message}`,
  unreadable: '循环板的 view.json 读不懂，下面是上一次读到的样子',
}

export class LoopsSource extends ViewFileSource<LoopsView, LoopsView | null> {
  constructor(remote: RemoteRoot, sessionId: string, viewFile: string, pollMs: number = POLL_MS) {
    super(remote, sessionId, viewFile, LOOPS_FILE, pollMs)
  }
}

/** The shared source of one session's view.json; release it when the board or the page lets go. */
export const holdLoopsSource = viewFileHolder((remote, sessionId, viewFile) => new LoopsSource(remote, sessionId, viewFile))
