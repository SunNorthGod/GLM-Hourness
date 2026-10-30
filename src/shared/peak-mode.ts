/**
 * The peak mode contract (docs/ORCHESTRATION.md §16): the level a person
 * chose for GLM's peak hours in a project, and what the rules row hands to
 * the rows that read it.
 *
 * The rules row (src/rules/index.ts) provides the cordis service
 * `glmHournessPeakMode`; the dispatch tool of the orchestration package reads
 * `glmWorkerCap` once when it counts free slots, the GLM channel package may
 * read the level to word its peak reminder, and the loop board reads it for
 * the end of a peak. The contract lives in the shared library because the GLM
 * package reads it too and cannot import src/rules/ (docs/DESIGN.md §2.3):
 * the orchestration package provides, the others read, the opposite
 * direction of src/shared/pricing.ts.
 *
 * Only types, constants, pure functions and the reader are here; no Node
 * built-in is imported, so the client and both packages can use the file. A
 * malformed value counts as absent and is reported to the reader's
 * `problem` callback, as pricingService does.
 */
import type { ServiceLookup } from './dsh-min.ts'

/** The cordis service name the rules row provides. */
export const PEAK_MODE_SERVICE = 'glmHournessPeakMode'

/** The three levels a person can choose: no effect, do less, do none. */
export type PeakLevel = 'inform' | 'reduce' | 'stop'

/** At most this many GLM subagents run at once in a peak under `reduce` (the number belongs to the rules board, docs/ORCHESTRATION.md §16). */
export const PEAK_REDUCE_GLM_WORKERS = 1

export interface PeakModeState {
  readonly level: PeakLevel
  /** `default`: the project never chose, the factory level `reduce` applies; `human`: the person chose it. */
  readonly origin: 'default' | 'human'
  /** When the person chose it; only with origin `human`. */
  readonly at?: string
  /** Whether it is peak now; undefined when the rules row cannot read it (no pricing service, or `peak` threw). */
  readonly peak: boolean | undefined
  /** ISO 8601: the end of this peak when `peak` is true, the start of the next one when false. */
  readonly until?: string
  /**
   * The cap on concurrently running GLM subagents. Present only while `peak`
   * is true and `level` is `reduce`; the dispatch tool counts running GLM
   * subagents against it, and without the field it uses its own slots.
   */
  readonly glmWorkerCap?: number
}

/** What `peakHoldFor` gives while the peak mode holds a session's GLM work back. */
export interface PeakHold {
  readonly level: 'reduce' | 'stop'
  /** ISO 8601: the end of this peak. */
  readonly until: string
}

export interface PeakModeService {
  /**
   * The peak mode of the project a session belongs to. Reads memory and the
   * pricing service only, never throws; undefined for a session the host
   * does not know, one without a working directory, or one outside a project.
   */
  stateFor(sessionId: string): PeakModeState | undefined
  /** The same for a working directory, for a session this host does not run. Never writes; undefined when the project's state cannot be read. */
  stateForProject(cwd: string): PeakModeState | undefined
  /**
   * Whether the peak mode holds this session's GLM work back: `{level, until}`
   * while it is peak, the end is known and the level is `reduce` or `stop`,
   * otherwise undefined. The main agent is never held (its own tool calls are
   * not touched on any level); the value says the GLM work it dispatches is.
   * Computed by the same function as `stateFor`, so level and `until` agree.
   */
  peakHoldFor(sessionId: string): PeakHold | undefined
}

/** The reader: undefined while the rules row is off; undefined with a `problem` report when a member has the wrong type. */
export function peakModeService(ctx: ServiceLookup, problem?: (message: string) => void): PeakModeService | undefined {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get(PEAK_MODE_SERVICE) : undefined
  if (value === undefined || value === null) return undefined
  const service = value as Partial<Record<keyof PeakModeService, unknown>>
  if (typeof service.stateFor === 'function' && typeof service.stateForProject === 'function' && typeof service.peakHoldFor === 'function') return value as PeakModeService
  problem?.(`${PEAK_MODE_SERVICE} has the wrong shape; the peak mode reads as absent`)
  return undefined
}

/** What the level, the clock and the peak reading say; the one place the state is filled. */
export interface PeakModeInput {
  readonly level: PeakLevel
  readonly origin: 'default' | 'human'
  readonly at?: string
  readonly peak: boolean | undefined
  readonly until?: string
}

/** The state a reader gets; `glmWorkerCap` only while it is peak and the level is `reduce`. */
export function peakModeState(input: PeakModeInput): PeakModeState {
  return {
    level: input.level,
    origin: input.origin,
    ...(input.at === undefined ? {} : { at: input.at }),
    peak: input.peak,
    ...(input.until === undefined ? {} : { until: input.until }),
    ...(input.peak === true && input.level === 'reduce' ? { glmWorkerCap: PEAK_REDUCE_GLM_WORKERS } : {}),
  }
}

/** The hold of a state: only in a peak whose end is known, on `reduce` and `stop`. */
export function peakHoldOf(state: PeakModeState): PeakHold | undefined {
  if (state.peak !== true || state.until === undefined || state.level === 'inform') return undefined
  return { level: state.level, until: state.until }
}

/** The names and the consequence of each level, for the replies of /rules peak; the onboarding page takes the names. The cap in the text of `reduce` is `PEAK_REDUCE_GLM_WORKERS`, so the sentence and the enforced number cannot differ. */
export const PEAK_LEVEL_WORDS: Readonly<Record<PeakLevel, { readonly name: string, readonly half: string }>> = {
  inform: { name: '无影响', half: '照常做，只提醒' },
  reduce: { name: '少做', half: `高峰里同时至多 ${PEAK_REDUCE_GLM_WORKERS} 个 GLM 子 agent，重活挪到高峰之后，必要的活照做` },
  stop: { name: '不做', half: '高峰里 GLM 的活停下排队，高峰结束后接着做' },
}

/**
 * The text about the mode: the three levels, the default, that the main
 * agent is not held, and how to change it. `peakHoursZh` is the pricing
 * service's description of the peak hours, left out when there is none. The
 * change line names the ways that exist: the command today; the main agent's
 * proposal joins with the proposal path (docs/ORCHESTRATION.md §16).
 */
export function peakModeIntro(peakHoursZh?: string): string {
  const hours = peakHoursZh === undefined ? '' : `（${peakHoursZh}）`
  return [
    `高峰模式：GLM 高峰时段${hours}里 GLM 的活怎么办，你选一档。`,
    `${PEAK_LEVEL_WORDS.inform.name}：${PEAK_LEVEL_WORDS.inform.half}。`,
    `${PEAK_LEVEL_WORDS.reduce.name}：${PEAK_LEVEL_WORDS.reduce.half}。`,
    `${PEAK_LEVEL_WORDS.stop.name}：${PEAK_LEVEL_WORDS.stop.half}。`,
    `默认是**${PEAK_LEVEL_WORDS.reduce.name}**。主 Agent 不受影响，随时回话。`,
    `要改：在输入框打 /rules peak ${PEAK_LEVEL_WORDS.inform.name}|${PEAK_LEVEL_WORDS.reduce.name}|${PEAK_LEVEL_WORDS.stop.name}。`,
  ].join('\n')
}
