/**
 * Running a harness action (docs/ORCHESTRATION.md §18.9; loop board design 0.6
 * §6.5, §3.1): the row that brought the entry hands the board a `run(action,
 * event)`, and the board calls it inside an async context that carries this
 * run's number, so an event the action itself brings in is known to be this
 * run's doing (the self-loop window of §6.7). The board waits at most six
 * hours, the longest a dispatch gate of the execute row is held; after that the
 * run is `failed` and the action is the other row's business.
 *
 * What a result means (design §6.5, the wording the board holds the other rows
 * to): `done` means the action ran, whatever it found; a `tell` on it is what
 * the main agent is to be told. `failed` is only "the action could not run",
 * which is what degrades this row's health: a red main branch is a finding of
 * the action, not a fault of the board. `skipped` is "nothing to do this time".
 *
 * Nothing here throws: a `run` that throws, rejects or never answers is a
 * `failed` result with the reason in it.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { HarnessResult, LoopEventRecord } from './service.ts'

/** How long the board waits for one action (design §3.1: the execute row's longest gate hold). */
const ACTION_LIMIT_MS = 6 * 3_600_000

const runs = new AsyncLocalStorage<string>()

/** The run whose execution the current async context belongs to, if any (design §6.3 `cause`). */
export function currentRun(): string | undefined {
  return runs.getStore()
}

/** Run `body` as the execution of `run`, so an `emit` made inside it carries the run as its cause. */
function withinRun<T>(run: string, body: () => Promise<T>): Promise<T> {
  return runs.run(run, body)
}

export interface HarnessDeps {
  /** What the row that brought the entry handed over. */
  readonly run: (action: string, event: LoopEventRecord) => Promise<HarnessResult>
  readonly now: () => number
  /** A timer for the limit; the row's timers never hold the host open. */
  readonly delay: (run: () => void, ms: number) => () => void
  readonly limitMs?: number
}

export interface HarnessOutcome {
  readonly outcome: 'done' | 'skipped' | 'failed'
  /** What the main agent is to be told, when the action says so. */
  readonly tell?: string
  readonly reason?: string
  readonly durationMs: number
}

const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

/** Call the action of one run and say what came of it. */
export async function runAction(action: string, record: LoopEventRecord, run: string, deps: HarnessDeps): Promise<HarnessOutcome> {
  const started = deps.now()
  const limitMs = deps.limitMs ?? ACTION_LIMIT_MS
  let cancel: (() => void) | undefined
  const limit = new Promise<HarnessResult>((resolve) => {
    cancel = deps.delay(() => { resolve({ outcome: 'failed', reason: 'timeout' }) }, limitMs)
  })
  try {
    const result = await Promise.race([withinRun(run, () => deps.run(action, record)), limit])
    const durationMs = deps.now() - started
    if (result.outcome === 'done') {
      return { outcome: 'done', durationMs, ...(typeof result.tell === 'string' && result.tell.length > 0 ? { tell: result.tell } : {}) }
    }
    if (result.outcome === 'skipped') return { outcome: 'skipped', reason: result.reason, durationMs }
    return { outcome: 'failed', reason: result.reason, durationMs, ...(typeof result.tell === 'string' && result.tell.length > 0 ? { tell: result.tell } : {}) }
  }
  catch (error) {
    return { outcome: 'failed', reason: message(error), durationMs: deps.now() - started }
  }
  finally {
    cancel?.()
  }
}
