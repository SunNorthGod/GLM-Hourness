/**
 * Probe net log (docs/DEVELOPMENT.md §3, docs/ORCHESTRATION.md §11.3): an
 * overlay-only row that records every outgoing request of the host process
 * that goes through Node's fetch, as one JSON line `{ origin, path }` in
 * `config.record` (no query, no header, no body). Not part of the bundle:
 * loaded only through the overlay that scripts/probe/run-probe.mjs generates
 * for every scenario.
 *
 * The recorder wraps the dispatcher that fetch reads from the global
 * `undici.globalDispatcher.1` slot, not `globalThis.fetch`: a row that
 * captured `fetch` when it applied (the quota reader and the login client in
 * src/glm-llm/ do) keeps calling the function it captured, and a wrap of
 * `globalThis.fetch` made after that never sees those calls. The dispatcher
 * is below every fetch reference, so the record is the same whichever row
 * applied first.
 *
 * Right after the wrap the row requests `CANARY` once, a loopback port nobody
 * listens on. The line it leaves shows that the recorder was live in this
 * process; a log without it proves nothing.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export const name = 'glm-hourness-probe/net'

/** The slot Node's fetch takes its dispatcher from (undici's global dispatcher interop key). */
const DISPATCHER = Symbol.for('undici.globalDispatcher.1')

/** The request the row makes itself: its line is in every log of a live recorder. */
export const CANARY = Object.freeze({ origin: 'http://127.0.0.1:65535', path: '/probe-net-canary' })

/** The origin of a dispatch option: a string, or a URL object. */
const originOf = origin => origin instanceof URL ? origin.origin : String(origin)

export function apply(_ctx, config = {}) {
  if (typeof config.record !== 'string' || config.record.length === 0) throw new Error(`probe net: invalid record path ${JSON.stringify(config.record)}`)
  const original = globalThis[DISPATCHER]
  if (original === undefined) throw new Error('probe net: this runtime has no global fetch dispatcher to wrap')
  mkdirSync(dirname(config.record), { recursive: true })
  writeFileSync(config.record, '')
  const wrapped = new Proxy(original, {
    get(target, property) {
      if (property === 'dispatch') {
        return (options, handler) => {
          appendFileSync(config.record, `${JSON.stringify({ origin: originOf(options.origin), path: String(options.path).split(/[?#]/, 1)[0] })}\n`)
          return target.dispatch(options, handler)
        }
      }
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  globalThis[DISPATCHER] = wrapped
  fetch(`${CANARY.origin}${CANARY.path}`).catch(() => {})
  return () => {
    if (globalThis[DISPATCHER] === wrapped) globalThis[DISPATCHER] = original
  }
}
