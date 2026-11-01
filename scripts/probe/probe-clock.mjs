/**
 * Probe clock (docs/DEVELOPMENT.md §3, ROADMAP M6.1): an overlay-only row
 * that moves the runtime's wall clock, `Date.now()`, by a constant offset so
 * that a scenario runs at the instant `config.at`; time keeps running from
 * there. The peak-hour reminder (src/glm-prompt/peak-reminder.ts) reads
 * `Date.now()`. `new Date()`, which the usage journal stamps with, and
 * timers keep the real clock. With `config.shiftWith` naming a tool, the row
 * also registers that tool, whose call moves the clock to `at` mid-run (the
 * loops-peak scenario crosses a peak's end that way). Not part of the
 * bundle: loaded only through the overlay that scripts/probe/run-probe.mjs
 * generates.
 */
export const name = 'glm-hourness-probe/clock'
export const inject = ['tools']

const textOf = value => ({ type: 'text', text: JSON.stringify(value) })

export function apply(ctx, config = {}) {
  const real = Date.now
  let offset = Date.parse(config.at) - real()
  if (!Number.isFinite(offset)) throw new Error(`probe clock: invalid instant ${JSON.stringify(config.at)}`)
  Date.now = () => real() + offset
  const disposers = []
  if (typeof config.shiftWith === 'string') {
    disposers.push(ctx.tools.register({
      name: config.shiftWith,
      description: 'Probe only: move the runtime clock to the instant `at` (ISO 8601).',
      parameters: {
        type: 'object',
        properties: { at: { type: 'string', description: 'The instant the clock moves to' } },
        required: ['at'],
      },
      output: { schema: { type: 'object' }, render: (_args, value) => [textOf(value)] },
      async execute(args) {
        const at = Date.parse(args.at)
        if (!Number.isFinite(at)) throw new Error(`probe clock: invalid instant ${JSON.stringify(args.at)}`)
        offset = at - real()
        return { now: new Date(Date.now()).toISOString() }
      },
    }))
  }
  return () => {
    Date.now = real
    for (const dispose of disposers.splice(0)) dispose()
  }
}
