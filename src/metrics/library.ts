/**
 * The library entry for one-shot processes outside DSH (metrics design
 * §5.2, F4): the rules board's command-line `check`, the scripts that gate
 * on it, anything that records a verdict and exits. `openWriter().record()`
 * waits for no one, so such a process would leave before its events were
 * written; `appendEvents` locates the project of `dir`, records the events,
 * and closes within a two-second budget, retrying a failed write once
 * before it reports. Outside a project it writes nothing at all.
 */
import { projectOf } from '../data/project-root.ts'
import type { EmittedEvent } from '../shared/metrics.ts'
import { nodeMetricsFs, openWriter } from './writer.ts'

export interface AppendResult {
  readonly written: number
  readonly rejected: number
  readonly error?: string
}

/** Events recorded per flush round; a batch over the writer's queue limit would drop its head (§5.1 step 4). */
const APPEND_CHUNK = 512

/** Record every event for the project of `dir` and close (2 s budget). Never throws. */
export async function appendEvents(dir: string, events: readonly EmittedEvent[], host: 'cli' = 'cli'): Promise<AppendResult> {
  const project = projectOf(dir)
  if (project === undefined) return { written: 0, rejected: 0, error: 'no-project' }
  const writer = openWriter({ host, fs: nodeMetricsFs })
  for (let start = 0; start < events.length; start += APPEND_CHUNK) {
    for (const event of events.slice(start, start + APPEND_CHUNK)) writer.record(project.root, event)
    await writer.flush()
  }
  const first = writer.status().get(project.root)
  if (first?.error !== undefined) await writer.flush() // one retry inside the budget (§5.2)
  await writer.close()
  const status = writer.status().get(project.root)
  return {
    written: status?.written ?? 0,
    rejected: status?.rejected ?? 0,
    ...(status?.error === undefined ? {} : { error: status.error }),
  }
}
