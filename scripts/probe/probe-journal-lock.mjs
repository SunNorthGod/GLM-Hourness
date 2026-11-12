/**
 * Probe journal lock (takeover design 0.6 §9.2): an overlay-only row that
 * holds the takeover journal's write lock for a few seconds, the way a host
 * that died mid-write would leave it held. The bootstrap-resume scenario
 * calls its tool right before record_human_answer, so the harness's first
 * write of the agreement is refused busy and the resume has to run from the
 * graph when another session takes the main role. Not part of the bundle:
 * loaded only through the overlay that scripts/probe/run-probe.mjs generates.
 */
import { join } from 'node:path'

export const name = 'glm-hourness-probe/journal-lock'
export const inject = ['tools']

const textOf = value => ({ type: 'text', text: JSON.stringify(value) })

export function apply(ctx, config = {}) {
  const disposers = []
  if (typeof config.root === 'string') {
    disposers.push(ctx.tools.register({
      name: 'probe_hold_journal',
      description: 'Probe only: hold the takeover journal write lock for holdMs milliseconds, then release it.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: { schema: { type: 'object' }, render: (_args, value) => [textOf(value)] },
      async execute() {
        const lock = await import('../../packages/hourness/dist/data/lock.js')
        const held = await lock.acquireLock(join(config.root, '.llm', 'bootstrap', 'journal.jsonl.lock'), lock.realLockEnvironment, { holder: 'probe-journal-lock', waitMs: 8000, staleMs: 120000 })
        if (held === 'busy') return { held: false }
        const timer = setTimeout(() => { void held.release() }, typeof config.holdMs === 'number' ? config.holdMs : 6000)
        timer.unref?.()
        return { held: true }
      },
    }))
  }
  return () => {
    for (const dispose of disposers.splice(0)) dispose()
  }
}
