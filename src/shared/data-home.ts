/**
 * The bundle's data directories (docs/DESIGN.md §2.4).
 *
 * User-level data (the usage journal and the encrypted credential file;
 * later preference memory) lives in one directory per machine, named after this
 * project under the DSH home: DSH keeps all user data under one root and a
 * plugin owns a directory named after itself there (dsh-llm-deepseek writes
 * `$DSH_HOME/llm-deepseek/files-v3.json`, rc.3 dsh-llm-deepseek
 * lib/index.js:824). Project-level data (memory facts, violations,
 * decisions) lives in the workspace `.llm`, which the rows cannot infer at
 * activation and take from config.
 *
 * The data row (src/data/index.ts) resolves both once and provides them as
 * the `glmHournessData` service. The other rows read it lazily through cordis
 * `ctx.get` (no inject requirement), so they activate and keep working
 * without it; an explicit row `home` wins over the service's project
 * directory.
 */
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ServiceLookup } from './dsh-min.ts'

/** The directory this project owns under the DSH home. */
export const USER_DATA_DIR_NAME = 'glm-hourness'

/** The cordis service name the data row provides. */
export const DATA_SERVICE = 'glmHournessData'

/** The two data directories a row writes into; either may be unknown. */
export interface DataHomes {
  /** User-level directory, `<DSH home>/glm-hourness`: the usage journal. */
  readonly userHome?: string
  /** Project-level directory (workspace `.llm`): memory facts, violations, decisions. */
  readonly projectHome?: string
}

/** The `glmHournessData` service value: the user directory is always resolved. */
export interface DataService extends DataHomes {
  readonly userHome: string
}

/**
 * Expand `~`, `~/` and `~\` against the OS home, as rc.3 dsh-home-paths
 * `expandHomePath` does (lib/index.js:70).
 */
export function expandHomePath(path: string, home: string = homedir()): string {
  if (path === '~') return home
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(home, path.slice(2))
  return path
}

/**
 * Resolve the DSH home as rc.3 dsh-home-paths `resolveDshHome` does
 * (lib/index.js:83 `resolveRoot`, :109): an explicit path, else a non-blank
 * `$DSH_HOME`, else `~/.dsh`; tilde-expanded and absolute. Replicated, not
 * imported: packages of the desktop install do not resolve from the
 * repository path (the failure glm-compact had, docs/DESIGN.md §5.6).
 */
export function resolveDshHome(configured?: string, env: Readonly<Record<string, string | undefined>> = process.env, home: string = homedir()): string {
  const fromEnv = env.DSH_HOME
  return resolve(expandHomePath(configured ?? (fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : join(home, '.dsh')), home))
}

/** The user-level directory under the resolved DSH home. */
export function userDataHome(configured?: string, env: Readonly<Record<string, string | undefined>> = process.env, home: string = homedir()): string {
  return join(resolveDshHome(configured, env, home), USER_DATA_DIR_NAME)
}

/**
 * The credential directory of the channel rows (glm-llm, glm-login): a
 * non-empty row `home`, else the user-level directory. Resolved without the
 * data service, which may not be active when the channel row activates.
 */
export function credentialHome(home: string | undefined, env: Readonly<Record<string, string | undefined>> = process.env): string {
  return home !== undefined && home.length > 0 ? home : userDataHome(undefined, env)
}

function isDataService(value: unknown): value is DataService {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.userHome === 'string' && (record.projectHome === undefined || typeof record.projectHome === 'string')
}

/** Read the data service; undefined while the data row is disabled or not active yet. */
export function dataService(ctx: ServiceLookup): DataService | undefined {
  const value = typeof ctx.get === 'function' ? ctx.get(DATA_SERVICE) : undefined
  return isDataService(value) ? value : undefined
}

/**
 * The directories one row writes into, resolved at the time of the write: a
 * non-empty row `home` is the project directory, else the service's; the
 * user directory comes from the service only, so no row writes user-level
 * data the data row did not resolve.
 */
export function dataHomes(ctx: ServiceLookup, home: string | undefined): DataHomes {
  const service = dataService(ctx)
  const projectHome = home !== undefined && home.length > 0 ? home : service?.projectHome
  return {
    ...(service === undefined ? {} : { userHome: service.userHome }),
    ...(projectHome === undefined ? {} : { projectHome }),
  }
}
