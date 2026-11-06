/**
 * The session projection `hournessLoops` (docs/ORCHESTRATION.md §18.7; loop board
 * design §8.4): what the board's page needs to find the board of the session's
 * project. The page does not call the host for the board; it reads the project's
 * `view.json` (view.ts) from the path the projection gives, and watches it. The
 * state is made when the session starts, from the working directory in its
 * header, and no event of the session changes it. A session whose working
 * directory is in no git project has `null` for both: it has no board.
 *
 * The rules board's projection `hournessRules` (src/rules/projection.ts) is
 * the same unit over its own `view.json`: `viewFileProjection` is the one
 * definition of both.
 */
import { projectOf } from '../data/project-root.ts'
import { projectKey } from '../graph/main-agent-holder.ts'
import { loopsPaths } from './store.ts'

export const LOOPS_KEY = 'hournessLoops'

/** Where a board's page finds the board of the session's project. */
export interface ViewFileProjectionState {
  /** The key of the project (the same key the main agent's record uses), or null. */
  readonly projectKey: string | null
  /** The absolute path of the project's `view.json`, or null. */
  readonly viewFile: string | null
}

export type LoopsProjectionState = ViewFileProjectionState

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const NO_BOARD: ViewFileProjectionState = { projectKey: null, viewFile: null }

/**
 * The unit for `sessionProjections.register` (dsh-session-projection
 * ProjectionDefinition) of a board whose page reads `viewFileOf(project root)`;
 * bump `stateVersion` with any change to the state. `init` never throws.
 */
export function viewFileProjection<Key extends string>(key: Key, board: string, viewFileOf: (root: string) => string) {
  const parseState = (value: unknown): ViewFileProjectionState => {
    if (!isRecord(value)) throw new TypeError(`${board} state: an object {projectKey, viewFile}`)
    const { projectKey: projected, viewFile } = value
    if (!(projected === null || typeof projected === 'string') || !(viewFile === null || typeof viewFile === 'string')) throw new TypeError(`${board} state: projectKey and viewFile are a string or null`)
    return value as unknown as ViewFileProjectionState
  }
  /** The state of a session from its header: where its project's board is. Never throws. */
  const stateOf = (header: unknown): ViewFileProjectionState => {
    try {
      const cwd = isRecord(header) && typeof header.cwd === 'string' && header.cwd !== '' ? header.cwd : undefined
      const project = cwd === undefined ? undefined : projectOf(cwd)
      return project === undefined ? NO_BOARD : { projectKey: projectKey(project.root), viewFile: viewFileOf(project.root) }
    }
    catch {
      return NO_BOARD
    }
  }
  return {
    key,
    stateVersion: 1,
    stateSchema: { parse: parseState },
    init: (header: unknown): ViewFileProjectionState => stateOf(header),
    // No event of the session changes the state: the same reference, so the host does no work.
    apply: (state: ViewFileProjectionState): ViewFileProjectionState => state,
    wire: { viewSchema: { parse: parseState }, view: (state: ViewFileProjectionState): ViewFileProjectionState => state },
  } as const
}

export const loopsProjection = viewFileProjection(LOOPS_KEY, 'loops', root => loopsPaths(root).view)
