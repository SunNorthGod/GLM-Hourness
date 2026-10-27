/**
 * Calibration run bounds (docs/ORCHESTRATION.md §10.5, ROADMAP M1.7): an
 * overlay-only plugin row that scripts/calibrate/run-calibrate.mjs inserts
 * for each run, so a stuck model cannot loop forever.
 *
 * - Step limit: model steps are counted over every agent of the process
 *   (subagents included); the step past `maxSteps` is rejected in
 *   `agent/pre-step`, which ends the turn as `blocked` (rc.3 dsh-agent-loop
 *   `turn()`).
 * - Time limit: `timeLimitMs` after the first agent was created, every live
 *   agent is cancelled with a hook cause (rc.3 `cancel`, cause kinds user /
 *   parent / disposed / hook) and every later step is rejected.
 * - Interruptions: each `approval/asked` session event (dsh-user-approval
 *   logs one per approval request; headless has no answerer, so it fails
 *   closed) is the moment an interactive session would have asked the human.
 *
 * Every event is one JSON line in `record`. Not part of the bundle.
 */
import { appendFileSync } from 'node:fs'

export const name = 'glm-hourness-calibrate/limits'

export function apply(ctx, config = {}) {
  const maxSteps = config.maxSteps ?? 40
  const timeLimitMs = config.timeLimitMs ?? 15 * 60_000
  const note = (entry) => {
    if (typeof config.record === 'string') appendFileSync(config.record, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`)
  }
  const agents = new Set()
  const disposers = []
  let steps = 0
  let startedAt
  let timer
  let expired = false
  const expire = () => {
    expired = true
    note({ kind: 'time-limit', elapsedMs: Date.now() - startedAt, steps })
    for (const agent of agents) {
      if (agent.status === 'running') agent.cancel({ kind: 'hook', reason: 'calibration time limit' })
    }
  }
  disposers.push(ctx.on('agent/created', ({ agent }) => {
    agents.add(agent)
    if (startedAt === undefined) {
      startedAt = Date.now()
      // Unreferenced: a finished run exits without waiting for the timer.
      timer = setTimeout(expire, timeLimitMs).unref()
    }
    // Outermost, so a rejected step runs no other pre-step listener (no
    // reminder or announcement is appended for a step that never happens).
    agent.ctx.on('agent/pre-step', (payload, next) => {
      if (expired) return Promise.resolve({ kind: 'reject' })
      steps += 1
      if (steps <= maxSteps) return next()
      note({ kind: 'step-limit', maxSteps })
      return Promise.resolve({ kind: 'reject' })
    }, { prepend: true })
  }))
  disposers.push(ctx.on('session/event', (session, event) => {
    if (event.type === 'approval/asked') note({ kind: 'approval', sessionId: session.id })
  }))
  return () => {
    clearTimeout(timer)
    for (const dispose of disposers) dispose()
  }
}
