/**
 * The one installation function of the guard framework (m4-gate G1, design
 * §3.1): every row that judges calls at `tools/pre-execute` — the guard row,
 * the graph row's graph-files-only, the loop board's two gates, later the
 * metrics row's — mounts the same listener through it, and `evaluate` is
 * gone. For each root call it maps the tool name to the DSH native, asks the
 * row for the rules of this call, removes the rules the human lifted
 * (src/guard/lift.ts), judges every rule and keeps every denial
 * (src/guard/rules.ts judge), journals one violation record per denial with
 * what the call touched (src/guard/records.ts subjectOf), and denies with
 * the first correction. A journal write that failed counts against the
 * session and is named on the row health with `note`, so a lost record is
 * never silent; a call is denied whether or not its record landed. A rule
 * whose detector threw fails open, and the row health names it. The
 * follow-up recorder hooks in with G2 and the request grants with G4.
 */
import type { JsonValue } from '../shared/json.ts'
import { dialectService, toNativeTool } from '../shared/dialect.ts'
import type { Route } from '../shared/route.ts'
import type { PreExecuteHost, PreExecuteListener, ServiceLookup, SessionEventHost, ToolExecutionPayload } from '../shared/dsh-min.ts'
import { sessionIdOf, type RowHealth } from '../shared/health.ts'
import { projectRootOf } from '../data/project-home.ts'
import type { RouteScope } from './origin.ts'
import { liftedRules } from './lift.ts'
import { judge, renderCorrection, type GuardRule, type ToolCall, type ToolFace } from './rules.ts'
import type { GuardRecord, ViolationRecord } from './records.ts'
import { subjectOf } from './records.ts'

/** The rules for one root call, and the face and origin they judge under. */
interface GateRules {
  readonly rules: readonly GuardRule[]
  readonly face: ToolFace
  /** Where the call ran (src/guard/origin.ts); every record carries it. */
  readonly origin: { readonly scope: RouteScope, readonly route?: Route | undefined }
}

export interface RuleGateOptions {
  /** Row name for health and console warnings. */
  readonly row: string
  /** Outermost (cordis prepend) or in registration order. */
  readonly prepend: boolean
  /** The rules for one root call; undefined: this row has nothing to judge here (the call still settles a follow-up from G2 on). */
  rules(payload: ToolExecutionPayload, call: ToolCall): Promise<GateRules | undefined> | GateRules | undefined
  /**
   * Writes one violation record (design §3.2); the payload tells the row
   * which session, hence which project. A journal that returns a promise
   * reports 'failed' writes to the gate, which counts them per session; a
   * rejected promise counts as 'failed' too. One that returns nothing is not
   * counted, and neither is 'no-home' (nothing was attempted; the row health
   * says so).
   */
  readonly journal: (record: GuardRecord, payload: ToolExecutionPayload) => Promise<'written' | 'failed' | 'no-home'> | void
  /** The row's health; the gate attaches its two lasting problems with `note` (design §3.1). */
  readonly health?: Pick<RowHealth, 'note'>
  /** Writes the journal's pending gap record on its own; the gate calls it on `session/disposed`. Absent: nothing is flushed. */
  readonly flush?: () => Promise<void> | void
  /** The calls that ran, where they ran: the guard row feeds its workspace-change fallback (design §3.4). */
  allowed?(payload: ToolExecutionPayload, origin: GateRules['origin']): void
  /**
   * Judge calls that carry `parent` (a `run_code` program's tool call) like
   * direct ones. Default false: a transport sub-call passes without reaching
   * the rules (design §3.1 step 1). The loop board's files gate judges them
   * (ORCHESTRATION.md §18.8), so it sets this.
   */
  readonly judgeChildren?: boolean | undefined
}

/** The row's context: pre-execute, service lookup, and the session observers. */
export type GateHost = PreExecuteHost & ServiceLookup & SessionEventHost

/** Whether this listener was installed by installRuleGate; the contracts test counts listeners by it (design §3.8). */
export function isGateListener(listener: unknown): boolean {
  return typeof listener === 'function' && (listener as { mark?: unknown }).mark === true
}

/** The working directory of the session a call belongs to, when it has one. */
export function cwdOf(payload: ToolExecutionPayload): string | undefined {
  const header = payload.agent?.session?.header.cwd
  return typeof header === 'string' && header.length > 0 ? header : undefined
}

/** Sessions whose rule detector errors were already warned about, per row: a rule warns once per session. */
const ruleWarned = new Map<string, Set<string>>()

/** Records a session lost so far, per row; a recovered write never resets the count (design §3.1 step 7). */
const lostRecords = new Map<string, number>()

/** How many code rules to name in the health note before it says 等. */
const NAMED_RULES_LIMIT = 3
/** How many code points of one note the row health keeps. */
const NOTE_LIMIT = 80

const cut = (text: string): string => Array.from(text).slice(0, NOTE_LIMIT).join('')

/**
 * Install the gate for one row: the `tools/pre-execute` listener (outermost
 * or in registration order, as the row registers today) and the
 * `session/disposed` observer that flushes the row journal. The returned
 * function unsubscribes both.
 */
export function installRuleGate(ctx: GateHost, options: RuleGateOptions): () => void {
  const listener: PreExecuteListener = async (payload, next) => {
    if (payload.parent !== undefined && options.judgeChildren !== true) return next()
    const call: ToolCall = { name: toNativeTool(dialectService(ctx), payload.name), arguments: (payload.arguments ?? {}) as JsonValue }
    let gate: GateRules | undefined
    try {
      gate = await options.rules(payload, call)
    }
    catch (error) {
      console.warn(`dsh-glm-hourness/${options.row}: the rules could not be prepared for a call: ${(error as Error).message}`)
      return next()
    }
    if (gate === undefined) return next()
    const sessionId = sessionIdOf(payload.agent)
    const root = projectRootOf(cwdOf(payload))
    const lifted = root === undefined ? undefined : liftedRules(root)
    const active = lifted === undefined || lifted.size === 0 ? gate.rules : gate.rules.filter(rule => !lifted.has(rule.id))
    const { denies, errors } = judge(active, call, gate.face)
    if (errors.length > 0) noteRuleErrors(options, sessionId, errors)
    if (denies.length > 0) {
      const reason = renderCorrection(denies[0].correction)
      for (const deny of denies) {
        const record: ViolationRecord = {
          at: new Date().toISOString(),
          rule: deny.rule,
          tool: payload.name,
          ...(payload.agent?.id === undefined ? {} : { agentId: payload.agent.id }),
          ...(payload.agent?.session?.id === undefined ? {} : { sessionId: payload.agent.session.id }),
          ...gate.origin,
          correction: renderCorrection(deny.correction),
          call: subjectOf(call),
          ...(deny.ref === undefined ? {} : { ref: deny.ref }),
        }
        // The denial returns at once; the write is counted when the journal settles: an outcome of 'failed'
        // or a rejected promise (design §3.1 step 7). 'no-home' and a journal that returns nothing are not counted.
        void (async () => {
          const outcome = await options.journal(record, payload)
          if (outcome === 'failed') lose(options.row, sessionId, options.health)
        })().catch(() => lose(options.row, sessionId, options.health))
      }
      return { kind: 'deny', reason }
    }
    const decision = await next()
    if (decision.kind === 'allow') options.allowed?.(payload, gate.origin)
    return decision
  }
  // The gate marks every listener it installs (design §3.1); the contracts test counts pre-execute listeners by it.
  ;(listener as { mark?: boolean }).mark = true
  const dispose = () => { void options.flush?.() }
  ;(dispose as { mark?: boolean }).mark = true
  const uninstallListener = ctx.on('tools/pre-execute', listener, { prepend: options.prepend })
  const uninstallDispose = ctx.on('session/disposed', dispose)
  return () => {
    uninstallDispose()
    uninstallListener()
  }
}

/** Name the rules whose detector threw on the row health and warn once per rule and session (design §3.1 step 5). */
function noteRuleErrors(options: RuleGateOptions, sessionId: string | undefined, errors: readonly string[]): void {
  const named = errors.slice(0, NAMED_RULES_LIMIT).join('、')
  options.health?.note(sessionId, 'rule-errors', cut(`规则 ${named}${errors.length > NAMED_RULES_LIMIT ? ' 等' : ''} 判定出错`))
  const warned = ruleWarned.get(keyOf(options.row, sessionId)) ?? new Set<string>()
  ruleWarned.set(keyOf(options.row, sessionId), warned)
  for (const rule of errors) {
    if (warned.has(rule)) continue
    warned.add(rule)
    console.warn(`dsh-glm-hourness/${options.row}: rule ${rule} could not judge a call; it fails open and is named on the row health`)
  }
}

/** Count one lost record against the session and name it on the row health (design §3.1 step 7); the count survives a recovered write. */
function lose(row: string, sessionId: string | undefined, health: RuleGateOptions['health']): void {
  const lost = (lostRecords.get(keyOf(row, sessionId)) ?? 0) + 1
  lostRecords.set(keyOf(row, sessionId), lost)
  health?.note(sessionId, 'violations-lost', cut(`${lost} 条违规没有落盘`))
}

const keyOf = (row: string, sessionId: string | undefined): string => `${row}:${sessionId ?? ''}`
