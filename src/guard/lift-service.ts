/**
 * The lift service (m4-gate G3, design §3.5): what the rules board's
 * `/rules lift <id>` and `/rules restore <id>` call to put a lift or restore
 * of a code rule into the project's record. The command is the human's own
 * — the board checks who typed it — so there is no words check here, and a
 * `liftVia: 'board'` rule (the guard of the lift record itself) can be
 * lifted only through this path. The board side of the wire is a seam
 * request the orchestration side takes after dogfood; until then the human
 * has one path, telling the main agent, and this service is provided but has
 * no caller.
 */
import { GUARD_RULES } from './catalog.ts'
import { appendLift, liftedRulesOf, liftFileStates } from './lift.ts'
import type { LiftRecord } from './records.ts'
import type { ServiceLookup } from '../shared/dsh-min.ts'

/** The service name the rules board reads through ctx (the same convention as the pricing service). */
export const LIFT_SERVICE = 'glmHournessLifts'

interface LiftCall {
  readonly cwd: string
  readonly rule: string
  readonly action: 'lift' | 'restore'
  /** The command text, at most 500 characters. */
  readonly command: string
  readonly sessionId?: string
}

type LiftCallResult =
  | { readonly ok: true, readonly outcome: 'lifted' | 'restored' | 'noop', readonly rule: string, readonly title: string }
  | { readonly ok: false, readonly code: 'unknown_rule' | 'not_liftable' | 'unavailable', readonly message: string }

interface LiftState {
  readonly rule: string
  readonly at: string
  readonly via: 'chat' | 'board'
  readonly words: string
}

export interface LiftService {
  setLifted(call: LiftCall): Promise<LiftCallResult>
  /** The rules lifted now in the project of `cwd`, with when, by which route and the words. */
  lifted(cwd: string): readonly LiftState[]
}

export interface LiftServiceDeps {
  readonly rootOf: (cwd: string) => string | undefined
  readonly record: (record: LiftRecord, cwd: string | undefined) => Promise<unknown> | void
  readonly now: () => Date
}

/** The ids of the catalog rows, for the `<row>:<id>` resolution order (design §3.5: `loops:loops:x` strips to `loops:x`, never further). */
const ROWS: ReadonlySet<string> = new Set(GUARD_RULES.map(entry => entry.row))

/**
 * Resolve the rule id the way design §3.5 names it: the exact id first, else
 * the string with one leading `<row>:` off, which must itself be an id. Every
 * catalog rule is the board's to lift — `liftVia: `board`` means ONLY the
 * board can lift it (the guard_lift tool refuses it, src/guard/lift.ts), not
 * that the service refuses it. The service's `not_liftable` code stays in
 * the contract for a rule that forbids the board; today none does.
 */
export function resolveLiftRule(name: string): { readonly id: string } | { readonly code: 'unknown_rule' | 'not_liftable' } {
  const exact = GUARD_RULES.find(entry => entry.id === name)
  if (exact !== undefined) return { id: exact.id }
  const stripped = /^[a-z]+:(.+)$/.exec(name)?.[1]
  if (stripped !== undefined && ROWS.has(name.slice(0, name.indexOf(':')))) {
    const inner = GUARD_RULES.find(entry => entry.id === stripped)
    if (inner !== undefined) return { id: inner.id }
  }
  return { code: 'unknown_rule' }
}

/** The service over the write entry and the journal; the members never throw. */
export function liftServiceOver(deps: LiftServiceDeps): LiftService {
  return {
    async setLifted(call): Promise<LiftCallResult> {
      const resolved = resolveLiftRule(call.rule)
      if ('code' in resolved) {
        return { ok: false, code: resolved.code, message: `unknown rule: liftable ids are ${GUARD_RULES.map(entry => `${entry.row}:${entry.id}`).join(', ')}` }
      }
      const entry = GUARD_RULES.find(candidate => candidate.id === resolved.id) as (typeof GUARD_RULES)[number]
      const root = deps.rootOf(call.cwd)
      if (root === undefined) return { ok: false, code: 'unavailable', message: 'the project root could not be found' }
      const state = liftedRulesOf(root)
      if (!state.readable) return { ok: false, code: 'unavailable', message: 'the lift record could not be read' }
      const isLifted = state.lifted.has(entry.id)
      if (call.action === 'lift' ? isLifted : !isLifted) return { ok: true, outcome: 'noop', rule: entry.id, title: entry.title }
      const at = deps.now().toISOString()
      try {
        await appendLift(root, { at, rule: entry.id, action: call.action, via: 'board', words: call.command.slice(0, 500) })
      }
      catch (error) {
        return { ok: false, code: 'unavailable', message: `the lift record could not be written (${(error as NodeJS.ErrnoException).code ?? 'error'})` }
      }
      void deps.record({ kind: 'lift', at, rule: entry.id, action: call.action, via: 'board', sessionId: call.sessionId, words: call.command.slice(0, 500) }, call.cwd)
      return { ok: true, outcome: call.action === 'lift' ? 'lifted' as const : 'restored' as const, rule: entry.id, title: entry.title }
    },
    lifted(cwd): readonly LiftState[] {
      const root = deps.rootOf(cwd)
      if (root === undefined) return []
      const file = liftFileStates(root)
      if (file === undefined) return []
      return [...file.states].flatMap(([rule, action]) => {
        if (action !== 'lift') return []
        // The moment, the route and the words come from the rule's last lift line in the file.
        const line = file.lines.filter(entry => entry.rule === rule && entry.action === 'lift').at(-1)
        return line === undefined ? [] : [{ rule, at: line.at, via: line.via, words: line.words }]
      })
    },
  }
}

/** The service as the board reads it: undefined when the guard row is not loaded or a member has the wrong type (as pricingService). */
export function liftService(ctx: ServiceLookup, problem?: (message: string) => void): LiftService | undefined {
  try {
    const value: unknown = typeof ctx?.get === 'function' ? ctx.get(LIFT_SERVICE) : undefined
    const service = value as Partial<LiftService> | undefined
    if (typeof service?.setLifted === 'function' && typeof service.lifted === 'function') return service as LiftService
  }
  catch (error) {
    problem?.(error instanceof Error ? error.message : String(error))
  }
  return undefined
}
