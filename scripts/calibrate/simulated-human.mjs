/**
 * Simulated human (docs/DEVELOPMENT.md §3, docs/ORCHESTRATION.md §3.1): an
 * overlay-only row for the L3 probe and the calibration runs, standing in for
 * the person where a run has none. It types `/wish` the way the person does
 * and refuses the question cards the main agent must never raise. Not part of
 * the bundle: scripts/sandbox.mjs passes its path to the DSH Loader.
 *
 * - `wish`: when `true`, the first root agent gets `/wish` as the person's
 *   first command; a string is typed after it (`/wish <string>`). A person
 *   has one first session: root agents the run creates later are not typed
 *   for. The command runs in the serial `agent/created` listener, so its
 *   events come before the task message the headless runner sends. A command
 *   that cannot run (the design row is off) is recorded as `wish-failed`.
 * - Question cards: every agent gets a `user-questions/request` listener that
 *   cancels the request (`ASK_CANCELLED`, the shape the client rejects with)
 *   and records `unexpected-question` with the question ids: the main agent
 *   has no ask_user_question, so any card is a violation to count.
 *
 * Everything the row did is appended to `config.record` (one JSON object per
 * line, `human.jsonl` in the run directory). Answering questions and
 * replying in chat arrive with the steps that need them.
 */
import { appendFileSync } from 'node:fs'

export const name = 'glm-hourness-calibrate/simulated-human'
export const inject = ['commands']

/** The error the client rejects a question with when the person closes the card; the user-questions service restores it by name and code. */
function cancelled() {
  return Object.assign(new Error('the user cancelled ask_user_question'), { name: 'UserQuestionError', code: 'ASK_CANCELLED' })
}

export function apply(ctx, config = {}) {
  const note = (entry) => {
    if (typeof config.record === 'string') appendFileSync(config.record, `${JSON.stringify(entry)}\n`)
  }
  const wishLine = config.wish === true ? '/wish' : typeof config.wish === 'string' ? `/wish ${config.wish}` : undefined
  let typed = false
  const stop = ctx.on('agent/created', async ({ agent }) => {
    agent.ctx.on('user-questions/request', (request) => {
      note({ kind: 'unexpected-question', id: (request.questions ?? []).map(question => question.id) })
      return Promise.reject(cancelled())
    })
    // Only a root agent has a person to type for it; a delegated child carries `origin` in its session header.
    if (wishLine === undefined || typed || agent.session?.header?.origin !== undefined) return
    typed = true
    try {
      const run = await ctx.get('commands').execute(agent, wishLine, [], new AbortController().signal)
      if (run === undefined) note({ kind: 'wish-failed', reason: `${wishLine.split(' ')[0]} is not registered` })
      else note({ kind: 'wish', line: wishLine, result: run.result.kind, text: run.result.text })
    }
    catch (error) {
      note({ kind: 'wish-failed', reason: error instanceof Error ? error.message : String(error) })
    }
  })
  return stop
}
