/**
 * What the environment row gives the loop board for a person's check entries
 * (M4 design §6.1.2; loop board design 0.6 §17, the M4 section): the service
 * `glmHournessEnv` with `checkCommandOf`, which reads one check line of an
 * approved tool node now, and the two pure functions the board imports from
 * this file and nowhere else in src/env/ (`fillCheckArgv`,
 * `formatCheckOutput`). M4 does not read, write or run the board's entries:
 * the board's executor runs them (src/loops/script.ts, queue `check`), and
 * src/loops/index.ts joins these to the board's seam (`LoopChecks` in
 * src/loops/run.ts).
 */
import type { ServiceLookup } from '../shared/dsh-min.ts'
import { graphService } from '../graph/service.ts'
import { readGraph } from '../graph/row-health.ts'
import type { LoopChecks } from '../loops/run.ts'
import { envBranch } from './branch.ts'
import { fillCheckArgv, type CheckFormat } from './check-entry.ts'

export type { CheckFormat } from './check-entry.ts'
export { fillCheckArgv, isCheckFormat } from './check-entry.ts'
export { formatCheckOutput } from './parsers.ts'

/** The cordis service name the env row provides. */
export const ENV_SERVICE = 'glmHournessEnv'

export interface CheckCommand {
  /** The tool node id. */
  readonly tool: string
  /** The line's name. */
  readonly check: string
  /** Human words: "<tool title>：<name>". */
  readonly title: string
  /** Placeholders left in ({files}); argv[0] startable without a shell. */
  readonly argv: readonly string[]
  readonly format: CheckFormat
  /** The line has a `when`: M4's own checker runs it too (design §6.1). The loop board writes "M4 自带的检查器也跑这一条" under the entry. */
  readonly own: boolean
  /** The line's `<estimate>` in seconds: the expected run time, not a timeout. Absent when the line has none. */
  readonly estimateSeconds?: number
}

export interface EnvService {
  /**
   * One check line of an approved tool node of the project of `cwd`, read from the graph now.
   * undefined: no graph, node missing or not approved, line missing or not valid (checkLineRefusal), or the node has several
   * check lines and `check` is not given. Never throws. The loop board calls it when a `check` entry is proposed and before every run.
   */
  checkCommandOf(cwd: string, tool: string, check?: string): Promise<CheckCommand | undefined>
}

/** undefined when the env row is not loaded or a member has the wrong type (reported to `problem`). */
export function envService(ctx: ServiceLookup, problem?: (message: string) => void): EnvService | undefined {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get(ENV_SERVICE) : undefined
  if (value === undefined || value === null) return undefined
  if (typeof (value as Partial<Record<keyof EnvService, unknown>>).checkCommandOf === 'function') return value as EnvService
  problem?.(`${ENV_SERVICE} has the wrong shape; the loop board's check entries are refused (check-missing)`)
  return undefined
}

/** The service over the graph row's service: the same read path as the environment notice (notice.ts). */
export function createEnvService(ctx: ServiceLookup): EnvService {
  return Object.freeze({
    async checkCommandOf(cwd: string, tool: string, check?: string): Promise<CheckCommand | undefined> {
      try {
        const dir = graphService(ctx)?.dirFor(cwd)
        if (dir === undefined) return undefined
        const read = await readGraph(dir, cwd)
        if ('failure' in read) return undefined
        const node = envBranch(read.graph).tools.find(candidate => candidate.id === tool)
        if (node === undefined) return undefined
        const line = check === undefined ? (node.checks.length === 1 ? node.checks[0] : undefined) : node.checks.find(entry => entry.name === check)
        if (line === undefined) return undefined
        return {
          tool: node.id,
          check: line.name,
          title: `${node.title}：${line.name}`,
          argv: line.argv,
          format: line.format,
          own: line.paths !== undefined,
          ...(line.estimateSeconds === undefined ? {} : { estimateSeconds: line.estimateSeconds }),
        }
      }
      catch {
        return undefined
      }
    },
  })
}

/**
 * The service and the filler keep the shape of the loop board's seam (src/loops/run.ts `LoopChecks`), so the board's
 * side and this row cannot drift apart unnoticed (compile-time only).
 */
type EnvServiceContractCheck = [EnvService['checkCommandOf'], typeof fillCheckArgv] extends [LoopChecks['commandOf'], LoopChecks['fill']] ? true : never
const envServiceContractCheck: EnvServiceContractCheck = true
void envServiceContractCheck
