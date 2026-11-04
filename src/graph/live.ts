/**
 * Live state of one agent for the project graph panel (docs/ORCHESTRATION.md
 * §2.10 "实时现场", m2-8): a DSH session projection unit
 * (dsh-session-projection README) that folds the session's own committed
 * events into where the agent is on the graph and what it is doing. The
 * panel reads it through the client's session projections, for the panel's
 * session and for each direct child its subagentCatalog names. Nothing is
 * written to disk: the session log is the record, this is a view of it.
 *
 * Events folded (rc.3 dsh-agent-loop appends): turn/start {turn},
 * turn/end, step/start {turn, step}, tool/call {callId, name, arguments
 * (provider JSON text)}, tool/result {message: {isError, source:
 * {callId}}}, request/header {header: {config: {model}}}. Every event
 * carries `time` (Date.now() at append). Events of a fork's inherited
 * prefix are skipped. The children of a session, their activity and the
 * token usage come from DSH's own projections (subagentCatalog,
 * tokenUsage), which the panel reads next to this one. No Node built-ins:
 * the panel imports the view type and the placement rule.
 *
 * `awaiting` (plain-ui 1.3 §4.9): the matters the main agent put to the
 * human with propose_to_human and has not recorded a reply for with
 * record_human_answer yet — the confirm and release kinds only, a question
 * lives on the graph. Added when the result of a propose_to_human call is
 * read as shown to the human (tool-names.ts shownProposalOf, the one place
 * that knows the shape), removed when a record_human_answer result
 * succeeds; an error result keeps the matter, and neither the human's
 * messages nor the turn ends touch it — only a recorded answer does. At
 * most three (the design row asks at most three matters per reply), the
 * newest replacing the same matter.
 */
import { PROPOSE_TO_HUMAN, RECORD_HUMAN_ANSWER, shownProposalOf } from '../shared/tool-names.ts'
import { DEFERRED_TOOL_CALL_NAME } from '../shared/zcode-notice.ts'

/** The tool that sets the focus node (tools.ts); the step projection (reminder.ts) and this fold find its calls in the history. */
export const FOCUS_TOOL = 'graph_focus'

/** Projection key the panel reads. */
export const LIVE_KEY = 'graphLive'

/** Tool results the view keeps, newest last. */
const RECENT = 6

/** Matters kept in `awaiting` (the design row asks at most three per reply). */
const AWAITING_MAX = 3

/** The code points an argument keeps (plain-ui 1.3 §4.9: keep the projection small). */
const ARGS_MAX = 200

/** One matter the human has not answered yet (plain-ui 1.3 §4.9); plain-view.ts and the panel read the entries off the view. */
export interface AwaitingEntry {
  readonly kind: 'confirm' | 'release' | 'unknown'
  /** The goal the matter belongs to; '' when the arguments were not readable (kind unknown). */
  readonly goal: string
  /** The module of a single-module release; '' confirms or releases the whole goal. */
  readonly module: string
  /** The question as the human read it; absent when the result was not readable. */
  readonly text?: string
  /** When the result returned (ms epoch). */
  readonly at: number
}

interface LiveCall {
  readonly name: string
  readonly at: number
  readonly ok: boolean
}

/** What the panel shows for one agent. */
export interface LiveView {
  /** Node the agent set with graph_focus; null before any. */
  readonly focus: string | null
  readonly model: string | null
  /** Start of the open turn; null between turns. */
  readonly turnSince: number | null
  readonly steps: number
  /** The tool call running now, if any. */
  readonly tool: { readonly name: string, readonly since: number } | null
  readonly recent: readonly LiveCall[]
  readonly awaiting: readonly AwaitingEntry[]
}

interface Pending {
  readonly name: string
  readonly since: number
  /** The node a graph_focus call names. */
  readonly focus?: string
  /** The arguments of a propose_to_human / record_human_answer call, as far as they read. */
  readonly ask?: Ask
}

/** The arguments of one design-row call, each string cut to ARGS_MAX code points. */
interface Ask {
  readonly kind?: string
  readonly goal?: string
  readonly module?: string
}

export interface LiveState extends LiveView {
  /** Events below this seq were inherited from a fork parent. */
  readonly inherited: number
  readonly pending: Readonly<Record<string, Pending>>
}

/** The fields of a session event the fold reads. */
export interface LiveEvent {
  readonly type: string
  readonly seq: number
  readonly time: number
  readonly data?: unknown
}

const EMPTY: Omit<LiveState, 'inherited'> = {
  focus: null, model: null, turnSince: null, steps: 0, tool: null, recent: [], awaiting: [], pending: {},
}

export function initialLive(inherited: number): LiveState {
  return { ...EMPTY, inherited }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Call arguments as an object; they arrive as the provider's JSON text. */
function argumentsOf(args: unknown): Record<string, unknown> {
  if (typeof args !== 'string') return record(args)
  try {
    return record(JSON.parse(args))
  }
  catch {
    return {}
  }
}

/** The name the view shows: a DeferredToolCall wrapper shows the deferred tool it runs. */
function shownName(name: string, args: Record<string, unknown>): string {
  return name === DEFERRED_TOOL_CALL_NAME ? text(args.name) ?? name : name
}

/** A string argument, cut to ARGS_MAX code points; absent for anything else. */
function askField(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  const cut = [...value].slice(0, ARGS_MAX).join('')
  return cut.length > 0 ? cut : undefined
}

/** The design-row arguments a call carries, as far as they read. */
function askOf(args: Record<string, unknown>): Ask | undefined {
  const kind = askField(args.kind)
  const goal = askField(args.goal)
  const module = askField(args.module)
  return kind === undefined && goal === undefined && module === undefined ? undefined : { ...(kind === undefined ? {} : { kind }), ...(goal === undefined ? {} : { goal }), ...(module === undefined ? {} : { module }) }
}

/** The text blocks of a tool result message, joined by line breaks (the same reading talk.ts does). */
function textContentOf(blocks: unknown): string {
  if (!Array.isArray(blocks)) return ''
  return blocks.flatMap(block => typeof block === 'object' && block !== null && !Array.isArray(block)
    && (block as Record<string, unknown>).type === 'text' && typeof (block as Record<string, unknown>).text === 'string'
    ? [(block as Record<string, unknown>).text as string]
    : []).join('\n')
}

const sameAsk = (a: { readonly kind: string, readonly goal: string, readonly module: string }, b: { readonly kind: string, readonly goal: string, readonly module: string }): boolean =>
  a.kind === b.kind && a.goal === b.goal && a.module === b.module

/** `awaiting` with one entry added: the same matter replaced, the oldest dropped past AWAITING_MAX. */
function withAwaiting(state: LiveState, entry: AwaitingEntry): readonly AwaitingEntry[] {
  const next = [...state.awaiting.filter(prior => !sameAsk(prior, entry)), entry]
  return next.length > AWAITING_MAX ? next.slice(next.length - AWAITING_MAX) : next
}

/**
 * `awaiting` after a record_human_answer result succeeded: the recorded
 * matter goes (every answer counts — agree clears it, an add or a reject
 * waits for the next version), and arguments that did not read drop the
 * unknown fallbacks, the only entries they could mean.
 */
function withoutRecorded(state: LiveState, call: Pending): readonly AwaitingEntry[] {
  const kind = call.ask?.kind
  const goal = call.ask?.goal
  if (kind === undefined || goal === undefined) return state.awaiting.filter(entry => entry.kind !== 'unknown')
  const recorded = { kind, goal, module: call.ask?.module ?? '' }
  return state.awaiting.filter(entry => !sameAsk(entry, recorded))
}

/**
 * The awaiting answer of a settled propose_to_human result, or undefined
 * when nothing is added: a result read as shown to the human adds its
 * matter (a question lives on the graph), a readable success that is not
 * the tool's output with unreadable arguments adds the unknown fallback,
 * everything else adds nothing.
 */
function awaitingOf(call: Pending, isError: boolean, content: unknown, at: number): AwaitingEntry | undefined {
  const shown = shownProposalOf(isError, textContentOf(content))
  if (shown !== undefined) {
    if (shown.kind === 'question') return undefined
    const text = askField(shown.text)
    return { kind: shown.kind, goal: shown.goal ?? '', module: shown.module ?? '', at, ...(text === undefined ? {} : { text }) }
  }
  if (isError || call.ask?.kind !== undefined) return undefined
  return { kind: 'unknown', goal: '', module: '', at }
}

/** The running call shown: the latest still pending. */
function runningOf(pending: Readonly<Record<string, Pending>>): LiveView['tool'] {
  let latest: Pending | undefined
  for (const call of Object.values(pending)) if (latest === undefined || call.since >= latest.since) latest = call
  return latest === undefined ? null : { name: latest.name, since: latest.since }
}

/** Fold one committed event; an event the view does not depend on returns the same state. */
export function foldLive(state: LiveState, event: LiveEvent): LiveState {
  if (event.seq < state.inherited) return state
  const data = record(event.data)
  switch (event.type) {
    case 'turn/start':
      return { ...state, turnSince: event.time, steps: 0 }
    case 'turn/end':
      return { ...state, turnSince: null, tool: null, pending: {} }
    case 'step/start':
      return { ...state, steps: state.steps + 1 }
    case 'tool/call': {
      const callId = text(data.callId)
      const name = text(data.name)
      if (callId === undefined || name === undefined) return state
      const args = argumentsOf(data.arguments)
      // graph_focus is resident (toolsearch RESIDENT_TOOLS), so only a direct call moves the focus.
      const focus = name === FOCUS_TOOL ? text(args.id) : undefined
      const shown = shownName(name, args)
      // A DeferredToolCall wrapper carries the inner call in `input`.
      const inner = shown === name ? args : argumentsOf(args.input)
      const ask = shown === PROPOSE_TO_HUMAN || shown === RECORD_HUMAN_ANSWER ? askOf(inner) : undefined
      const pending = { ...state.pending, [callId]: { name: shown, since: event.time, ...(focus === undefined ? {} : { focus }), ...(ask === undefined ? {} : { ask }) } }
      return { ...state, pending, tool: runningOf(pending) }
    }
    case 'tool/result': {
      const message = record(data.message)
      const callId = text(record(message.source).callId) ?? text(message.toolCallId)
      const call = callId === undefined ? undefined : state.pending[callId]
      if (callId === undefined || call === undefined) return state
      const { [callId]: _done, ...pending } = state.pending
      const ok = message.isError !== true
      let awaiting = state.awaiting
      if (call.name === PROPOSE_TO_HUMAN) {
        const entry = awaitingOf(call, !ok, message.content, event.time)
        if (entry !== undefined) awaiting = withAwaiting(state, entry)
      }
      else if (call.name === RECORD_HUMAN_ANSWER && ok) awaiting = withoutRecorded(state, call)
      return {
        ...state,
        pending,
        tool: runningOf(pending),
        awaiting,
        recent: [...state.recent, { name: call.name, at: event.time, ok }].slice(-RECENT),
        focus: ok && call.focus !== undefined ? call.focus : state.focus,
      }
    }
    case 'request/header': {
      const model = text(record(record(data.header).config).model) ?? null
      return model === state.model ? state : { ...state, model }
    }
    default:
      return state
  }
}

/**
 * The node an agent stands on: its own focus; a child without one stands
 * on the main agent's focus. The panel places the agents with it, and the
 * run controls (run-control.ts) find who works on a node with it.
 */
export function placeOf(focus: string | null, mainFocus: string | null, main: boolean): string | null {
  return focus ?? (main ? null : mainFocus)
}

export function liveView(state: LiveState): LiveView {
  const { inherited: _inherited, pending: _pending, ...view } = state
  return view
}

function fail(message: string): never {
  throw new Error(`graphLive projection: ${message}`)
}

function isNullableNumber(value: unknown): boolean {
  return value === null || typeof value === 'number'
}

const AWAITING_KINDS: readonly string[] = ['confirm', 'release', 'unknown']

/** Shape check of one awaiting entry (plain-ui 1.3 §8.2): at most AWAITING_MAX, one shape each. */
function parseAwaiting(value: unknown): void {
  if (!Array.isArray(value) || value.length > AWAITING_MAX) fail(`awaiting must be at most ${AWAITING_MAX} entries`)
  for (const entry of value) {
    const item = record(entry)
    if (!AWAITING_KINDS.includes(item.kind as string) || typeof item.goal !== 'string' || typeof item.module !== 'string' || typeof item.at !== 'number') {
      fail('awaiting entries must be {kind, goal, module, at}')
    }
    const text = item.text
    if (text !== undefined && typeof text !== 'string') fail('awaiting text must be a string')
  }
}

/** Shape check of a view value: checkpoint restore and the wire both parse through it. */
function parseView(value: unknown): LiveView {
  const view = record(value)
  if (!(view.focus === null || typeof view.focus === 'string')) fail('focus must be a string or null')
  if (!(view.model === null || typeof view.model === 'string')) fail('model must be a string or null')
  if (!isNullableNumber(view.turnSince) || typeof view.steps !== 'number') fail('turnSince and steps must be numbers')
  const tool = view.tool
  if (!(tool === null || (typeof record(tool).name === 'string' && typeof record(tool).since === 'number'))) fail('tool must be {name, since} or null')
  if (!Array.isArray(view.recent) || !view.recent.every(call => typeof record(call).name === 'string' && typeof record(call).at === 'number' && typeof record(call).ok === 'boolean')) fail('recent must be a list of {name, at, ok}')
  parseAwaiting(view.awaiting)
  return value as LiveView
}

function parseState(value: unknown): LiveState {
  const state = record(value)
  parseView(state)
  if (typeof state.inherited !== 'number') fail('inherited must be a number')
  const pending = record(state.pending)
  for (const call of Object.values(pending)) {
    const item = record(call)
    if (typeof item.name !== 'string' || typeof item.since !== 'number') fail('pending calls must be {name, since}')
    const ask = item.ask
    if (ask === undefined) continue
    const args = record(ask)
    for (const field of ['kind', 'goal', 'module'] as const) {
      const value = args[field]
      if (value !== undefined && typeof value !== 'string') fail(`pending ask ${field} must be a string`)
    }
  }
  return value as LiveState
}

/**
 * The unit for `sessionProjections.register` (dsh-session-projection
 * ProjectionDefinition). The schemas are plain objects with `parse`, the
 * one member the registry calls; bump stateVersion with any change to the
 * state fields or the fold.
 */
export const liveProjection = {
  key: LIVE_KEY,
  stateVersion: 3,
  stateSchema: { parse: parseState },
  init: (_header: unknown, inheritedEventCount: number): LiveState => initialLive(inheritedEventCount),
  apply: foldLive,
  wire: { viewSchema: { parse: parseView }, view: liveView },
} as const
