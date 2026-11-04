/**
 * One graph write retried with fresh revisions (M7 design 0.6 §3.1.2 step
 * 10, §3.7.5): the callers re-read the revisions inside `run`, so a retry
 * never writes against a stale one; the last refusal is the thrown error's
 * payload, or the failed result. The dispatch tool, the plan tools and the
 * handback processing share it.
 */
import type { ApplyResult } from '../graph/engine.ts'

const WRITE_RETRY_DELAYS_MS = [200, 800, 2000] as const

const sleep = (ms: number): Promise<void> => new Promise(done => { setTimeout(done, ms) })

export async function writeWithRetry(run: () => Promise<ApplyResult>): Promise<ApplyResult> {
  for (let attempt = 0; ; attempt++) {
    const result = await run()
    if (result.ok) return result
    if (attempt >= WRITE_RETRY_DELAYS_MS.length) return result
    await sleep(WRITE_RETRY_DELAYS_MS[attempt])
  }
}
