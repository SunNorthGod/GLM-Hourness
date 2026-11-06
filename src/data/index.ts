/**
 * dsh-glm-hourness/data — the data directory service (docs/DESIGN.md §2.4).
 *
 * Resolves the user-level directory `<DSH home>/glm-hourness` (explicit
 * `dshHome` > `$DSH_HOME` > `~/.dsh`, the DSH layout) and takes the
 * project directory (workspace `.llm`) from config, then provides both, with
 * `projectDirOf` for the per-session project directory of memory and lessons, as
 * the `glmHournessData` cordis service. The guard, memory, workflow and
 * hourness rows read it lazily and keep working without it. Activation
 * does no I/O: the journals create their directories on the first write.
 * The row health (src/shared/health.ts) states which directories resolved.
 */
import { DATA_SERVICE, userDataHome, type DataService } from '../shared/data-home.ts'
import { projectDirOf } from './project-root.ts'
import { provideRowHealth } from '../shared/health.ts'
import type { ProvideHost } from '../shared/dsh-min.ts'

export interface DataConfig {
  /** Explicit DSH home (tests and the probe point it at a scratch directory); default `$DSH_HOME`, else `~/.dsh`. Empty counts as unset. */
  readonly dshHome?: string
  /** The project directory (workspace `.llm`): memory facts, violations, decisions. */
  readonly projectHome?: string
  /**
   * An absolute directory that stands for the project directory of every
   * session (memory, lessons and the env row's suppression count): the
   * probe, the calibration and tests point it at their run directory so they
   * never touch a repository's `.llm` or the real user directory. Empty
   * counts as unset.
   */
  readonly projectOverride?: string
}

/** cordis plugin identity. */
export const name = 'dsh-glm-hourness/data'

/** Build the service value for one config. */
export function dataServiceFor(config: DataConfig): DataService {
  const dshHome = config.dshHome === undefined || config.dshHome.length === 0 ? undefined : config.dshHome
  const override = config.projectOverride === undefined || config.projectOverride.length === 0 ? undefined : config.projectOverride
  return Object.freeze({
    userHome: userDataHome(dshHome),
    ...(config.projectHome === undefined || config.projectHome.length === 0 ? {} : { projectHome: config.projectHome }),
    projectDirOf: (cwd: string | undefined) => override ?? (cwd === undefined ? undefined : projectDirOf(cwd)),
  })
}

/** cordis plugin entry: provide the directories and the row health; activation never throws. */
export function apply(ctx: ProvideHost, config: DataConfig = {}): () => void {
  const service = dataServiceFor(config)
  if (service.projectHome === undefined) {
    console.warn('dsh-glm-hourness/data: projectHome is not configured; violations and decisions are journaled only by rows with their own home (set config.projectHome)')
  }
  let withdraw: () => void
  try {
    withdraw = ctx.provide(DATA_SERVICE, service)
  }
  catch (error) {
    console.warn(`dsh-glm-hourness/data: providing ${DATA_SERVICE} failed; rows fall back to their own home: ${(error as Error).message}`)
    const health = provideRowHealth(ctx, 'data', 'inactive', `数据目录服务未提供：${(error as Error).message}`)
    return () => health.dispose()
  }
  const override = config.projectOverride === undefined || config.projectOverride.length === 0 ? '' : `；记忆与经验的项目目录固定为 ${config.projectOverride}`
  const health = service.projectHome === undefined
    ? provideRowHealth(ctx, 'data', 'degraded', `用户级目录 ${service.userHome}；项目目录未配置，违规与决策只由配了 home 的行写入${override}`)
    : provideRowHealth(ctx, 'data', 'active', `用户级目录 ${service.userHome}；项目目录 ${service.projectHome}${override}`)
  return () => {
    health.dispose()
    withdraw()
  }
}
