/**
 * Probe lift companion (m4-gate G3, design §14.1 scenarios `guard-lift` and
 * `guard-fallback`): an overlay-only row that plays the human and, when
 * asked, the rules board. It registers two probe tools the scripted model
 * calls mid-turn, while the session's agent loop is alive:
 *
 * - `probe_say {text, rpcId?}` queues the human's words as the next client
 *   message of the calling session (`agent.followup`,
 *   `source: {kind: 'user', rpcId}`) — how a person's reply reaches the
 *   agent: the turn ends, the queued message opens the next one, and
 *   `guard_lift` reads its words from it.
 * - `probe_restore {rule}` (mounted with `config.restore`) puts the rule
 *   back the way the rules board's `/rules lift` would, through the service
 *   the guard row provides (`glmHournessLifts`, `setLifted`), and queues a
 *   board note as the next client message, so the next request shows the
 *   restored declaration.
 *
 * A turn-end wake does not work here: after the model's final text the host
 * tears the agent loop down within the same tick and `followup` finds the
 * inbox projection unregistered. Every step lands in a JSONL log (`out`) the
 * checks read; a step that never happens is an absent line. Not part of the
 * bundle: loaded only through the overlay that scripts/probe/run-probe.mjs
 * generates.
 */
import { appendFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

export const name = 'glm-hourness-probe/lift'
export const inject = ['tools']

export function apply(ctx, config = {}) {
  if (typeof config.out !== 'string' || config.out.length === 0) throw new Error('probe lift: config.out must be a non-empty string')
  if (config.restore === true && (typeof config.cwd !== 'string' || typeof config.rule !== 'string')) throw new Error('probe lift: restore needs config.cwd and config.rule')
  writeFileSync(config.out, '')
  const log = entry => {
    try {
      appendFileSync(config.out, `${JSON.stringify(entry)}\n`)
    }
    catch {
      // The checks read an absent line as a step that never happened.
    }
  }
  const disposers = []
  const message = (text, rpcId) => ({ id: randomUUID(), role: 'user', content: [{ type: 'text', text }], source: { kind: 'user', ...(rpcId === undefined ? {} : { rpcId }) } })
  disposers.push(ctx.tools.register({
    name: 'probe_say',
    description: 'Probe only: queue the human\'s words as the next client message of this session (the next turn opens with them).',
    parameters: { type: 'object', properties: { text: { type: 'string', description: 'The human\'s words' }, rpcId: { type: 'string', description: 'The client message id the words carry' } }, required: ['text'] },
    output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: (args, exec) => {
      const agent = exec?.agent
      if (agent === undefined || typeof agent.followup !== 'function') throw new Error('probe say: no agent to wake')
      agent.followup(message(String(args.text), typeof args.rpcId === 'string' ? args.rpcId : undefined))
      log({ kind: 'said', words: String(args.text), rpcId: typeof args.rpcId === 'string' ? args.rpcId : null })
      return { queued: true }
    },
  }))
  if (config.restore === true) {
    disposers.push(ctx.tools.register({
      name: 'probe_restore',
      description: 'Probe only: restore one rule through the lift service, the way /rules lift does, and queue the board\'s note as the next client message.',
      parameters: { type: 'object', properties: { rule: { type: 'string', description: 'The rule id with its row prefix, e.g. guard:scratch-only' } }, required: ['rule'] },
      output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      execute: async (args, exec) => {
        const agent = exec?.agent
        if (agent === undefined) throw new Error('probe restore: no agent')
        const cwd = typeof agent.session?.header?.cwd === 'string' ? agent.session.header.cwd : undefined
        const rule = String(args.rule)
        const result = await ctx.get('glmHournessLifts')?.setLifted({ cwd, rule, action: 'restore', command: `/rules lift ${rule}`, sessionId: agent.session?.id })
        log({ kind: 'restore', result: result ?? null })
        agent.followup(message('（规则板已把那条规则恢复）', `${config.rule}-board`))
        return result ?? { ok: false, code: 'unavailable' }
      },
    }))
  }
  return () => {
    for (const dispose of disposers.splice(0)) dispose()
  }
}
