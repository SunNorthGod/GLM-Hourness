/**
 * Probe environment companion (M4 design §14.1, scenario `env-check-command`
 * and the later env-checks scenarios): an overlay-only row that stands in
 * for the loop board, which provides no service in the headless runtime
 * (it has no session controller, loop board design 0.6 §3.1). It provides a
 * minimal `glmHournessLoops` whose `listens` is always true and records every
 * `contribute`, `emit` and `recordRun` it receives, and registers two probe
 * tools: `probe_check_command {tool, check?}`, which answers with what the env
 * row's service `glmHournessEnv` reads for the calling session's directory,
 * and `probe_loop_page {entry}`, which answers with what the env row's latest
 * hand-over gives the board's page for that entry there (`details`, `checks`).
 * Every record lands in a JSONL log (`out`) the checks read. Not part of the
 * bundle: loaded only through the overlay that scripts/probe/run-probe.mjs
 * generates.
 */
import { appendFileSync, writeFileSync } from 'node:fs'

export const name = 'glm-hourness-probe/env'
export const inject = ['tools']

/** The loop board's prompt line (src/loops/service.ts LOOPS_DECLARATION); the env row only checks it is a non-empty string. */
const DECLARATION = 'Probe loop board.'

export function apply(ctx, config = {}) {
  if (typeof config.out !== 'string' || config.out.length === 0) throw new Error('probe env: config.out must be a non-empty string')
  writeFileSync(config.out, '')
  const log = entry => {
    try {
      appendFileSync(config.out, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`)
    }
    catch {
      // The checks read an absent line as a step that never happened.
    }
  }
  /** The latest hand-over of each row, for probe_loop_page. */
  const handed = new Map()
  const board = {
    declaration: DECLARATION,
    contribute: (source, contribution) => {
      if (typeof source?.row === 'string') handed.set(source.row, contribution)
      log({
        kind: 'contribute',
        source,
        events: (contribution?.events ?? []).map(event => event.id),
        entries: (contribution?.entries ?? []).map(entry => ({ id: entry.id, ownRules: entry.ownRules ?? [] })),
      })
      return { ok: true, dispose: () => {}, accepted: (contribution?.entries ?? []).map(entry => entry.id), dropped: [] }
    },
    emit: (event) => {
      log({ kind: 'emit', event })
      return Promise.resolve({ ok: true, id: `ev-${Date.now().toString(16).padStart(16, '0')}`, duplicate: false })
    },
    listens: () => true,
    recordRun: (run) => { log({ kind: 'run', run }) },
  }
  const disposers = []
  const withdraw = ctx.provide('glmHournessLoops', board)
  if (typeof withdraw === 'function') disposers.push(withdraw)
  disposers.push(ctx.tools.register({
    name: 'probe_check_command',
    description: 'Probe only: read one check line of an approved environment tool node through the env row\'s service, for this session\'s directory.',
    parameters: { type: 'object', properties: { tool: { type: 'string', description: 'The tool node id' }, check: { type: 'string', description: 'The check line\'s name' } }, required: ['tool'] },
    output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: async (args, exec) => {
      const cwd = exec?.agent?.session?.header?.cwd
      const service = ctx.get('glmHournessEnv')
      const command = typeof cwd === 'string' && typeof service?.checkCommandOf === 'function'
        ? await service.checkCommandOf(cwd, String(args.tool), typeof args.check === 'string' ? args.check : undefined)
        : undefined
      log({ kind: 'check-command', service: service !== undefined, command: command ?? null })
      return { command: command ?? null }
    },
  }))
  disposers.push(ctx.tools.register({
    name: 'probe_loop_page',
    description: 'Probe only: what the env row\'s hand-over gives the loop board\'s page for one entry, for this session\'s directory.',
    parameters: { type: 'object', properties: { entry: { type: 'string', description: 'The entry id' } }, required: ['entry'] },
    output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: (args, exec) => {
      const cwd = exec?.agent?.session?.header?.cwd
      const contribution = handed.get('glm-hourness/env')
      const entry = String(args.entry)
      const read = member => typeof cwd === 'string' && typeof contribution?.[member] === 'function' ? contribution[member](entry, cwd) : null
      const page = { details: read('details'), checks: read('checks') }
      log({ kind: 'page', entry, page })
      return Promise.resolve(page)
    },
  }))
  return () => {
    for (const dispose of disposers.splice(0)) dispose()
  }
}
