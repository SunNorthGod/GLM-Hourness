/**
 * The session projection `hournessLoops` (docs/ORCHESTRATION.md §18.7; loop board
 * design §8.4): what the board's page needs to find the board of the session's
 * project. The page does not call the host for the board; it reads the project's
 * `view.json` (view.ts) from the path the projection gives, and watches it. The
 * state is made when the session starts, from the working directory in its
 * header, and no event of the session changes it. A session whose working
 * directory is in no git project has `null` for both: it has no board.
 */
import { projectOf } from '../data/project-root.ts'
import { projectKey } from '../graph/main-agent-holder.ts'
import { loopsPaths } from './store.ts'

export const LOOPS_KEY = 'hournessLoops'

export interface LoopsProjectionState {
  /** The key of the project (the same key the main agent's record uses), or null. */
  readonly projectKey: string | null
  /** The absolute path of the project's `view.json`, or null. */
  readonly viewFile: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseState(value: unknown): LoopsProjectionState {
  if (!isRecord(value)) throw new TypeError('loops state: an object {projectKey, viewFile}')
  const { projectKey: key, viewFile } = value
  if (!(key === null || typeof key === 'string') || !(viewFile === null || typeof viewFile === 'string')) throw new TypeError('loops state: projectKey and viewFile are a string or null')
  return value as unknown as LoopsProjectionState
}

const NO_BOARD: LoopsProjectionState = { projectKey: null, viewFile: null }

/** The state of a session from its header: where its project's board is. Never throws. */
function projectionStateOf(header: unknown): LoopsProjectionState {
  try {
    const cwd = isRecord(header) && typeof header.cwd === 'string' && header.cwd !== '' ? header.cwd : undefined
    const project = cwd === undefined ? undefined : projectOf(cwd)
    return project === undefined ? NO_BOARD : { projectKey: projectKey(project.root), viewFile: loopsPaths(project.root).view }
  }
  catch {
    return NO_BOARD
  }
}

/** The unit for `sessionProjections.register` (dsh-session-projection ProjectionDefinition); bump `stateVersion` with any change to the state. */
export const loopsProjection = {
  key: LOOPS_KEY,
  stateVersion: 1,
  stateSchema: { parse: parseState },
  init: (header: unknown): LoopsProjectionState => projectionStateOf(header),
  // No event of the session changes the state: the same reference, so the host does no work.
  apply: (state: LoopsProjectionState): LoopsProjectionState => state,
  wire: { viewSchema: { parse: parseState }, view: (state: LoopsProjectionState): LoopsProjectionState => state },
} as const
