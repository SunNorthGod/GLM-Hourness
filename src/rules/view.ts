/**
 * The rules page's data (docs/ORCHESTRATION.md §16.14): what the rules row
 * writes into `<project root>/.llm/rules/view.json` and the panel's rules board
 * reads. The host computes every group of the page (view-build.ts) and the
 * board's status items from the same collector the report reads, so the page
 * and the report cannot differ; the client only words what it finds here.
 *
 * This file is the contract both sides share: the version, the shape, the
 * reader the client parses the file with, and the one mapping from a catalog
 * id to the rule id the violation journal carries. It imports types only, so
 * the client bundle can take it.
 */
import type { PeakLevel } from '../shared/peak-mode.ts'
import type { StatusItem } from '../shared/status.ts'
import type { Condition, Effect, RecoveryReason, Rule, RuleAction, RowState, SignalType, SignalValue, SkippedRecord, Ticket } from './model.ts'

/** Bump with any change of the shape; a reader drops a file of another version. */
export const RULES_VIEW_VERSION = 1

/** The peak hours and the peak mode of the project (page group 2). */
interface RulesPeakView {
  /** A pricing service is on this host: GLM's peak hours exist here, and the peak mode can act. */
  readonly applies: boolean
  /** Whether it is peak now; absent when it cannot be read. */
  readonly now?: boolean
  /** ISO 8601: the end of this peak while `now`, else the start of the next. */
  readonly until?: string
  /** Why it cannot be read whether it is peak, while a pricing service is there. */
  readonly problem?: string
  /** The pricing service's words for the peak hours. */
  readonly hoursZh?: string
  readonly level: PeakLevel
  /** `default`: the factory level applies; `human`: the person chose it. */
  readonly origin: 'default' | 'human'
  /** When the person chose it. */
  readonly setAt?: string
  /** How the choice came in: the person's own `/rules peak`, or their words through the main agent. */
  readonly via?: 'command' | 'agent'
  /** The work the stop level holds back now: open tickets of its entries, and the goals of GLM subagents it paused. */
  readonly waiting: { readonly tickets: number, readonly pausedGoals: number }
}

/** The default rule and its four entries (page group 2). */
interface RulesBuiltinView {
  readonly id: string
  readonly title: string
  readonly effect: Effect
  /** The default rule an entry belongs to; absent on the default rule. */
  readonly partOf?: string
  /** The levels that enable the entry; absent: every level. */
  readonly enabledBy?: readonly PeakLevel[]
  /** In force at the project's level now. */
  readonly enabled: boolean
  /** The row that tells the model about an informing entry, and its state. */
  readonly toldBy?: string
  readonly toldState?: RowState
  /** Calls the entry blocked or put off in the last 7 days. */
  readonly count7d: number
}

/** A rule's script as the page shows it (page group 3). */
export interface RulesScriptView {
  readonly file: string
  readonly lang: string
  /** `approved`: the person read exactly these bytes on this machine; the other three are unapprovedScripts' standings. */
  readonly standing: 'approved' | 'no-pin' | 'not-approved' | 'changed'
  /** The file is not in the project. */
  readonly missing: boolean
  readonly timeoutSeconds: number
  /** `entry`: the rule writes it; `design`: the fixed value of the design fills it. */
  readonly timeoutFrom: 'entry' | 'design'
  /** What a timeout or a crash does. */
  readonly onError: 'allow' | 'block'
  /** The rule does not say; the event's declared default (else allow) applies. */
  readonly onErrorIsDefault: boolean
}

/** One rule the person set (page group 3): the inputs the page words, and the counts. */
export interface RulesPersonView {
  readonly id: string
  readonly title: string
  readonly scope: Rule['scope']
  readonly sessionId?: string
  readonly when: Rule['when']
  readonly filter?: Rule['filter']
  readonly condition?: Condition
  /** The condition at the moment of the view; absent when the rule has none. */
  readonly conditionNow?: 'true' | 'false' | 'unknown'
  readonly onUnknown: 'skip' | 'apply'
  readonly action: RuleAction
  /** Until when: the lifetime as the rule writes it. */
  readonly lifetime: Rule['lifetime']
  /** Who set it, when, with whose words. */
  readonly origin: Rule['origin']
  readonly status: Rule['status']
  /** Active and its own time is not up. */
  readonly inForce: boolean
  readonly reason: string
  /** Journal records of the last 7 days: calls it blocked or put off, and calls it only noted. */
  readonly enforce7d: number
  readonly record7d: number
  readonly script?: RulesScriptView
}

/** One denial of a code rule, for the page's last five. */
export interface RulesDenialView {
  readonly at: string
  /** The tool and the command or target, or the files a late denial found; at most 60 characters. */
  readonly what: string
  /** `block`: the call did not run; `late`: it ran and was found after the turn. */
  readonly outcome: 'block' | 'late'
  /** The rule id the journal carries. */
  readonly rule: string
}

/** One rule another row implements, or the rules board's own gate (page group 4). */
export interface RulesCodeView {
  /** The catalog id `<row>:<id>`. */
  readonly id: string
  readonly title: string
  readonly row: string
  readonly rowState: RowState
  /** Denials in the last 7 days, the statistics reader's count (src/guard/measure.ts). */
  readonly denials7d: number
  /** The newest denials of the whole journal, newest first, at most five. */
  readonly last: readonly RulesDenialView[]
  /** What the person says to lift it, or null when it cannot be lifted now. */
  readonly liftHow: string | null
  readonly notLiftableBecause?: string
  /** The rule stands lifted since then. */
  readonly liftedAt?: string
  readonly restoreHow?: string
}

/** A switch or a detector's signal of the project (page group 5). */
interface RulesSignalView {
  readonly name: string
  readonly type: SignalType
  readonly description?: string
  readonly value?: SignalValue
  readonly unknown?: string
  readonly source: string
  /** When the person set the value, and when it runs out. */
  readonly setAt?: string
  readonly expiresAt?: string
}

/** A call a rule put off (page group 6). */
interface RulesTicketView {
  readonly id: string
  readonly state: Ticket['state']
  readonly sessionId: string
  readonly agentLabel: string
  readonly tool: string
  readonly summary: string
  readonly rules: readonly string[]
  readonly since: string
  readonly letOnceUntil?: string
  /** The host that owns it, and whether its heartbeat is fresh. */
  readonly hostPid: number
  readonly hostAlive: boolean
  /** Put off by the stop level, and whether the subagent's goal is paused now. */
  readonly stop: boolean
  readonly goalPaused: boolean
}

/** Something the main agent is told at its next step (page group 6). */
interface RulesNoticeView {
  readonly kind: string
  readonly rule: string
  readonly text: string
  readonly at: string
}

/** How the state was read, and what waits for the person (page group 7). */
interface RulesRecoveryView {
  readonly notes: readonly string[]
  readonly recovered?: { readonly at: string, readonly reason: RecoveryReason, readonly lost: boolean, readonly replaced?: string }
  readonly unresolved: ReadonlyArray<Pick<SkippedRecord, 'label' | 'why' | 'seq' | 'actor' | 'op' | 'target'>>
  /** The rules file in the repository against the state: `in-sync`, `owed`, `outside`, and the others of the repository check. */
  readonly repo: string
}

export interface RulesView {
  readonly version: typeof RULES_VIEW_VERSION
  /** When the host computed it. */
  readonly at: string
  /** The host that wrote it. */
  readonly host: { readonly pid: number }
  readonly peak: RulesPeakView
  /** The rows the page names, and their state on the writing host; `execute` is absent (main has no execute row). */
  readonly rows: Readonly<Record<string, RowState>>
  readonly builtins: readonly RulesBuiltinView[]
  readonly rules: readonly RulesPersonView[]
  readonly code: readonly RulesCodeView[]
  readonly signals: readonly RulesSignalView[]
  readonly tickets: readonly RulesTicketView[]
  readonly notices: readonly RulesNoticeView[]
  readonly recovery: RulesRecoveryView
  /** The board's status items: the collector's items with owner `rules`, as they are. */
  readonly items: readonly StatusItem[]
  /** The rows among `rules` and `guard` whose status could not be read, with the reason. */
  readonly statusProblems: ReadonlyArray<{ readonly row: string, readonly reason: string }>
}

const ARRAYS = ['builtins', 'rules', 'code', 'signals', 'tickets', 'notices', 'items', 'statusProblems'] as const

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The view a file's text holds, or undefined for another version or a shape that is not a view. */
export function parseRulesView(text: string): RulesView | undefined {
  let value: unknown
  try {
    value = JSON.parse(text)
  }
  catch {
    return undefined
  }
  if (!isRecord(value) || value.version !== RULES_VIEW_VERSION || typeof value.at !== 'string') return undefined
  if (!isRecord(value.host) || typeof value.host.pid !== 'number') return undefined
  if (!isRecord(value.peak) || typeof value.peak.applies !== 'boolean' || typeof value.peak.level !== 'string' || !isRecord(value.peak.waiting)) return undefined
  if (!isRecord(value.rows) || !isRecord(value.recovery) || !Array.isArray(value.recovery.notes) || !Array.isArray(value.recovery.unresolved)) return undefined
  if (!ARRAYS.every(key => Array.isArray(value[key]))) return undefined
  return value as unknown as RulesView
}

/**
 * The rule id the violation journal carries for a catalog id or a person's
 * rule id. The rules board writes `rules:<id>`: its own gate's
 * `rules:files-only` as it is, a code entry `builtin:...` and a person's
 * rule `r-...` with the prefix. The guard framework's rules and the main
 * agent's (`<row>:<id>`, `design:<id>`) journal their bare id, so
 * `loops:files-only` is `files-only` and never `rules:files-only`.
 */
export function journalRuleOf(id: string): string {
  if (id.startsWith('rules:')) return id
  const colon = id.indexOf(':')
  return colon < 0 || id.startsWith('builtin:') ? `rules:${id}` : id.slice(colon + 1)
}
