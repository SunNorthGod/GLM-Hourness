/**
 * dsh-glm-hourness/data — the data directory service (docs/DESIGN.md §2.4).
 *
 * Resolves the user-level directory `<DSH home>/glm-hourness` (explicit
 * `dshHome` > `$DSH_HOME` > `~/.dsh`, the DSH layout) and takes the
 * project directory (workspace `.llm`) from config, then provides both as
 * the `glmHournessData` cordis service. The guard, memory, workflow and
 * hourness rows read it lazily and keep working without it. Activation
 * does no I/O: the journals create their directories on the first write.
 */
import { DATA_SERVICE, userDataHome, type DataService } from '../shared/data-home.ts'
import type { ProvideHost } from '../shared/dsh-min.ts'

export interface DataConfig {
  /** Explicit DSH home (tests and the probe point it at a scratch directory); default `$DSH_HOME`, else `~/.dsh`. Empty counts as unset. */
  readonly dshHome?: string
  /** The project directory (workspace `.llm`): memory facts, violations, decisions. */
  readonly projectHome?: string
}

/** cordis plugin identity. */
export const name = 'dsh-glm-hourness/data'

/** Build the service value for one config. */
export function dataServiceFor(config: DataConfig): DataService {
  const dshHome = config.dshHome === undefined || config.dshHome.length === 0 ? undefined : config.dshHome
  return Object.freeze({
    userHome: userDataHome(dshHome),
    ...(config.projectHome === undefined || config.projectHome.length === 0 ? {} : { projectHome: config.projectHome }),
  })
}

/** cordis plugin entry: provide the directories; activation never throws. */
export function apply(ctx: ProvideHost, config: DataConfig = {}): () => void {
  const service = dataServiceFor(config)
  if (service.projectHome === undefined) {
    console.warn('dsh-glm-hourness/data: projectHome is not configured; violations and decisions are journaled only by rows with their own home (set config.projectHome)')
  }
  try {
    return ctx.provide(DATA_SERVICE, service)
  }
  catch (error) {
    console.warn(`dsh-glm-hourness/data: providing ${DATA_SERVICE} failed; rows fall back to their own home: ${(error as Error).message}`)
    return () => {}
  }
}
