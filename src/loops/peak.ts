/**
 * The end of a GLM peak (docs/ORCHESTRATION.md §18.12; loop board design 0.6
 * §6.9 item 4): the harness action `loops.peak-end` of the loop row's own
 * hand-over. When the channel says the peak ended, the action takes the first
 * row of the design's table that holds: revive the main agent's session when
 * the execute row's `execute.resume-drive` needs it and call that action once,
 * then, or without it, wake the main agent once when the moved work can start
 * and it worked during the peak, is idle and is not waiting for the person.
 *
 * What the board reads of the rest of the orchestration package:
 * - the level only through the rules board's service (`glmHournessPeakMode`
 *   of src/shared/peak-mode.ts, `stateForProject`), never its files;
 * - the execute row's action through the registry's `runOfAction`, which is
 *   undefined until a hand-over lists it — M7 does not exist yet, so row 3 of
 *   the table is skipped whole and the reminder path still works;
 * - the peak clock through the pricing service, the same `peak(t)` the
 *   channel events come from.
 *
 * Nothing here throws: every host call is wrapped, and a reading that fails
 * falls the way the design biases it (towards waking, which costs one step,
 * never towards staying silent, which leaves the moved work waiting).
 */
import { readFileSync } from 'node:fs'
import { agentsOf } from '../rules/wake.ts'
import { peakModeService, type PeakModeState } from '../shared/peak-mode.ts'
import type { GoalView, GoalsService, MessageableAgentLike, ServiceLookup } from '../shared/dsh-min.ts'
import { runAction, currentRun } from './harness.ts'
import type { HolderMemory, HolderState } from './holder.ts'
import { reviveSession, type Revival } from './deliver.ts'
import { PEAK_END_ACTION } from './defaults.ts'
import { reasonCode, type RunReasonCode } from './records.ts'
import type { HarnessResult, LoopEventRecord } from './service.ts'

/** The execute row's action that resumes a drive that waited out the peak (design §17 M7 item 6). It exists only while a hand-over lists it. */
export const PEAK_RESUME_ACTION = 'execute.resume-drive'

/** How long the board waits for `execute.resume-drive` (design §6.9 item 4 row 3: it changes one goal, sixty seconds without an answer is a fault). */
const RESUME_LIMIT_MS = 60_000

/** The run of a hand-over: what the board calls to execute one harness action (design §6.5). */
type ActionRun = (action: string, event: LoopEventRecord) => Promise<HarnessResult>

export interface PeakEndDeps {
  readonly ctx: ServiceLookup
  /** The project the action runs for; the level and the walk record are this project's. */
  readonly projectRoot: string
  readonly now: () => number
  /** A timer for the resume limit; the row's timers never hold the host open. */
  readonly delay: (run: () => void, ms: number) => () => void
  /** The pricing service's peak reading, while it is there (design §4.3). */
  readonly peak: () => ((atMs: number) => boolean) | undefined
  /** The holder state, asked again for every judgement (design §6.4). */
  readonly holder: () => HolderState
  readonly memory: () => HolderMemory
  /** `<project>/.llm/loops/main-step.json`, the walk record every process writes (design §6.1). */
  readonly mainStep: string
  /** The run of the hand-over that listed a harness action; undefined while nobody does (M7 absent). */
  readonly runOfAction: (action: string) => ActionRun | undefined
  /** Keep a judgement that has to be made again (row 2): the runner pushes the marker and makes it again on a later beat. */
  readonly hold: (event: LoopEventRecord, run: string, reason: string) => void
  readonly report: (text: string, level: 'info' | 'degraded') => void
}

/**
 * How one judgement of the table ends. `held` is row 2: the runner records
 * the run held and makes the judgement again later. The reason is a code of
 * the run reasons (records.ts); the words of each row are the page's
 * (view.ts), and what the main agent reads is the `tell`.
 */
type PeakEndJudgement =
  | { readonly outcome: 'done', readonly tell: string, readonly reason?: RunReasonCode }
  | { readonly outcome: 'skipped', readonly reason: RunReasonCode }
  | { readonly outcome: 'failed', readonly reason: RunReasonCode, readonly tell: string }
  | { readonly outcome: 'held', readonly reason: RunReasonCode }

/**
 * What the board's own peak-end action returns: the HarnessResult contract
 * (§6.5), with two fields only this action sets — `held` on a skipped result
 * (row 2: the run is held and the judgement is made again; harness.ts carries
 * it into the outcome) and `reason` on a done one (the reason the record
 * carries). No other row's result carries them.
 */
type OwnActionResult = HarnessResult
  | { readonly outcome: 'skipped', readonly reason: string, readonly held?: string }
  | { readonly outcome: 'done', readonly tell: string, readonly reason?: string }

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 120)

/** `<HH:MM>` in the host's time zone, as the design's `{end}` is written. */
function clockOf(atMs: number): string {
  const at = new Date(atMs)
  const two = (value: number): string => String(value).padStart(2, '0')
  return `${two(at.getHours())}:${two(at.getMinutes())}`
}

/** `{end}` of the event's boundary; a boundary that cannot be read travels as the text it has. */
function endOf(event: LoopEventRecord): string {
  const raw = event.payload.boundary
  if (typeof raw !== 'string' || raw.length === 0) return '?'
  const at = Date.parse(raw)
  return Number.isFinite(at) ? clockOf(at) : raw
}

/** The level of this project through the rules board's service; undefined when the service is absent or cannot read the project. Never throws. */
export function peakLevelOf(ctx: ServiceLookup, projectRoot: string): PeakModeState | undefined {
  try {
    return peakModeService(ctx)?.stateForProject(projectRoot)
  }
  catch {
    return undefined
  }
}

interface StepNote {
  readonly session?: unknown
  readonly at?: unknown
}

/** The walk record as the file holds it; undefined when it cannot be read (design §6.1). */
function readMainStep(file: string): StepNote | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as StepNote
  }
  catch {
    return undefined
  }
}

/**
 * The start of the peak that ended at `boundaryMs`: walking back by whole
 * minutes over the pricing service's `peak(t)`, the first off-peak minute is
 * just before the start (design §6.9 item 4 row 8). At most 24 hours; a clock
 * that cannot be read leaves the start unknown and the caller biases to
 * "worked".
 */
function peakStartOf(peak: ((atMs: number) => boolean) | undefined, boundaryMs: number): number | undefined {
  if (peak === undefined || !Number.isFinite(boundaryMs)) return undefined
  const minute = 60_000
  for (let walked = 1; walked <= 24 * 60; walked++) {
    const at = boundaryMs - walked * minute
    let inPeak: boolean
    try {
      inPeak = peak(at)
    }
    catch {
      return undefined
    }
    if (!inPeak) return at + minute
  }
  return boundaryMs - 24 * 60 * minute
}

/**
 * Whether the main agent took a step during this peak: the walk record names
 * the holder's session and is not older than the peak's start. A record that
 * is not there, cannot be read, or has a moment that cannot be read counts as
 * walked — one wake more costs a step, a missed one leaves the work waiting
 * (design §6.9 item 4 row 8).
 */
function workedInPeak(deps: PeakEndDeps, session: string, start: number | undefined): boolean {
  const note = readMainStep(deps.mainStep)
  if (note === undefined) return true
  if (note.session !== session) return false
  const at = typeof note.at === 'string' ? Date.parse(note.at) : Number.NaN
  if (Number.isNaN(at)) return true
  return start === undefined || at >= start
}

/** The goal of a live agent; a service that throws, or an agent that is not its live instance, is no goal (goal:611–614). */
function goalOf(ctx: ServiceLookup, agent: MessageableAgentLike): GoalView | undefined {
  const goals: unknown = typeof ctx.get === 'function' ? ctx.get('goals') : undefined
  if (typeof (goals as GoalsService | undefined)?.get !== 'function') return undefined
  try {
    return (goals as GoalsService).get(agent)
  }
  catch {
    return undefined
  }
}

/**
 * What a revival that did not reach an agent means for the table (design
 * §6.9 item 4 rows 1–3): its two expected answers convert to the rows the
 * delivery table has them as, and any other answer leaves the table going.
 */
function revivalOf(revival: Revival): PeakEndJudgement | undefined {
  if (!('wait' in revival)) return undefined
  if (revival.wait === 'holder-not-found' || revival.wait === 'no-session-controller') return { outcome: 'skipped', reason: 'peak-no-holder' }
  if (revival.wait === 'writer-held') return { outcome: 'held', reason: 'writer-held' }
  return undefined
}

/** Row 3's one call, and what it makes of the run (design §6.9 item 4 row 3). */
async function resumeDrive(deps: PeakEndDeps, resume: ActionRun, event: LoopEventRecord, run: string, end: string, revived: MessageableAgentLike | undefined): Promise<PeakEndJudgement | undefined> {
  const result = await runAction(PEAK_RESUME_ACTION, event, run, { run: resume, now: deps.now, delay: deps.delay, limitMs: RESUME_LIMIT_MS })
  if (result.outcome === 'done') {
    return { outcome: 'done', tell: result.tell ?? `GLM peak hours ended at ${end}. The harness resumed the drive that waited out the peak; continue with the work you moved.` }
  }
  if (result.outcome === 'skipped') {
    // The session this row just revived: M7 may have caught the drive up on `agent/created` (design §6.9 item 4 row 3, review F40).
    if (revived !== undefined && goalOf(deps.ctx, revived)?.phase === 'active') {
      return { outcome: 'done', reason: 'peak-drive-caught-up', tell: `GLM peak hours ended at ${end}. The drive is running again; continue with the work you moved.` }
    }
    return undefined
  }
  // The execute row's words go into the main agent's message; the record keeps a code (`timeout` when the limit fired).
  const why = result.reason ?? '没有给出原因'
  return {
    outcome: 'failed',
    reason: reasonCode(result.reason, 'plugin-reason'),
    tell: result.tell ?? `GLM peak hours ended at ${end}. The harness could not resume the drive that waited out the peak (${why}). Tell the human in one line that the moved work can start and the drive resumes when they say so.`,
  }
}

/**
 * One judgement of the table, rows in order (design §6.9 item 4). Never
 * throws; every reading that fails falls the way its row biases.
 */
async function judgePeakEnd(deps: PeakEndDeps, event: LoopEventRecord, run: string): Promise<PeakEndJudgement> {
  const end = endOf(event)
  const holder = deps.holder()
  const session = holder.session
  // Row 1: nobody to wake. The reason is already on the page (§6.4).
  const nobody = holder.kind === 'none' || holder.kind === 'archived' || holder.kind === 'not-found'
    || (holder.kind === 'unknown' && holder.reason === 'holder-unreadable')
  if (nobody || session === undefined) return { outcome: 'skipped', reason: 'peak-no-holder' }
  // Row 2: the session is open in another DSH process; the run lock goes there, and the holder of it judges again.
  if (holder.kind === 'elsewhere') return { outcome: 'held', reason: 'writer-held' }

  const level = peakLevelOf(deps.ctx, deps.projectRoot)
  // The boundary as a moment (endOf is the display form): the walk record is judged against the minutes of this peak.
  const boundaryRaw = event.payload.boundary
  const boundaryMs = typeof boundaryRaw === 'string' ? Date.parse(boundaryRaw) : Number.NaN
  const start = peakStartOf(deps.peak(), boundaryMs)
  const worked = workedInPeak(deps, session, start)
  const resume = deps.runOfAction(PEAK_RESUME_ACTION)

  // Row 3: the execute row listed the action. A hot session is called on any level (review F48); a cold one only when this peak saw it work and the level is not a readable 无影响.
  if (resume !== undefined) {
    const live = agentsOf(deps.ctx)?.get(session)
    if (live !== undefined) {
      const driven = await resumeDrive(deps, resume, event, run, end, undefined)
      if (driven !== undefined) return driven
    }
    else if (worked && !(level !== undefined && level.level === 'inform')) {
      const revival = await reviveSession(deps.ctx, session, deps.memory(), new Date(deps.now()).toISOString())
      if ('agent' in revival) {
        const driven = await resumeDrive(deps, resume, event, run, end, revival.agent)
        if (driven !== undefined) return driven
        // A skipped answer falls through to the level rows: the drive was already running (review F40).
      }
      else {
        const converted = revivalOf(revival)
        if (converted !== undefined) return converted
        // Any other answer is a revival that did not happen: the table goes on.
      }
    }
  }

  // Row 4.
  if (level === undefined) return { outcome: 'skipped', reason: 'peak-level-unreadable' }
  // Row 5 is the fall-through: 少做 and 不做 reach the same rows (d-main-agent-peak-exempt).
  // Row 6.
  if (level.level === 'inform') return { outcome: 'skipped', reason: 'peak-level-inform' }
  // Row 7.
  const live = agentsOf(deps.ctx)?.get(session)
  if (live !== undefined && live.status === 'running') return { outcome: 'skipped', reason: 'peak-holder-running' }
  // Row 8.
  if (!worked) return { outcome: 'skipped', reason: 'peak-holder-idle' }
  // Row 9: the goal, revived into this process first when the session is cold (the delivery below needs it anyway).
  let agent = live
  if (agent === undefined) {
    const revival = await reviveSession(deps.ctx, session, deps.memory(), new Date(deps.now()).toISOString())
    if ('agent' in revival) agent = revival.agent
    else {
      const converted = revivalOf(revival)
      if (converted !== undefined) return converted
      // A revival that did not happen counts as no goal: biased to wake, the delivery retries (design §6.9 item 4 row 9).
    }
  }
  if (agent !== undefined) {
    const goal = goalOf(deps.ctx, agent)
    if (goal?.phase === 'paused') return { outcome: 'skipped', reason: 'peak-drive-paused' }
    if (goal?.phase === 'blocked') {
      const code = goal.blockedReason?.code
      if (code === 'hourness-waiting-human') return { outcome: 'skipped', reason: 'peak-waiting-human' }
      if (code === 'hourness-idle-rounds') return { outcome: 'skipped', reason: 'peak-idle-rounds' }
      return { outcome: 'skipped', reason: 'peak-drive-blocked' }
    }
  }
  // Row 10.
  return { outcome: 'done', tell: `GLM peak hours ended at ${end}. Work you moved to after peak can start now.` }
}

export interface PeakEnd {
  /** The harness action of the loop row's own hand-over (design §6.5). Never throws. */
  run(action: string, event: LoopEventRecord): Promise<OwnActionResult>
  /** One judgement of the table, for the runner's rerun of a held one (row 2). Never throws. */
  judge(event: LoopEventRecord, run: string): Promise<PeakEndJudgement>
}

/** The board's own action over the runner's deps. */
export function createPeakEnd(deps: PeakEndDeps): PeakEnd {
  return {
    async run(action, event): Promise<OwnActionResult> {
      if (action !== PEAK_END_ACTION) return { outcome: 'failed', reason: 'action-missing' }
      const run = currentRun() ?? 'run-000000000000'
      try {
        const judgement = await judgePeakEnd(deps, event, run)
        if (judgement.outcome === 'held') {
          deps.hold(event, run, judgement.reason)
          return { outcome: 'skipped', reason: judgement.reason, held: judgement.reason }
        }
        if (judgement.outcome === 'done') return { outcome: 'done', tell: judgement.tell, ...(judgement.reason === undefined ? {} : { reason: judgement.reason }) }
        if (judgement.outcome === 'failed') return { outcome: 'failed', reason: judgement.reason, tell: judgement.tell }
        return { outcome: 'skipped', reason: judgement.reason }
      }
      catch (error) {
        deps.report(`高峰结束的接续出错：${message(error)}`, 'degraded')
        const end = endOf(event)
        return {
          outcome: 'failed',
          reason: 'board-error',
          tell: `GLM peak hours ended at ${end}. The harness could not resume the drive that waited out the peak (${message(error)}). Tell the human in one line that the moved work can start and the drive resumes when they say so.`,
        }
      }
    },
    judge: (event, run) => judgePeakEnd(deps, event, run).catch((error): PeakEndJudgement => ({ outcome: 'failed', reason: 'board-error', tell: `GLM peak hours ended at ${endOf(event)}. The harness could not judge the end of the peak (${message(error)}). Tell the human in one line that the moved work can start.` })),
  }
}
