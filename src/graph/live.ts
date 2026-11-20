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
 *
 * `requests` (m4-request-card design §5.8): the guard row's request plans
 * the human has not answered yet. Added when the result of a
 * request_exception call reads as an ask (tool-names.ts shownRequestOf),
 * removed when its `approved` replay is read or when a closing
 * hourness-request notice (source.request.outcome approved, declined,
 * closed, expired, lapsed) is folded; the still-open notices keep it. The
 * 2-hour cap is the panel's own display filter (plain-view.ts), not a fold
 * rule — a session that never steps again still drops its stale asks there.
 * At most eight, the oldest out.
 */
import { PROPOSE_TO_HUMAN, RECORD_HUMAN_ANSWER, REQUEST_EXCEPTION, REQUEST_NOTICE_SOURCE, shownProposalOf, shownRequestOf } from '../shared/tool-names.ts'
import { DEFERRED_TOOL_CALL_NAME } from '../shared/zcode-notice.ts'

/** The tool that sets the focus node (tools.ts); the step projection (reminder.ts) and this fold find its calls in the history. */
export const FOCUS_TOOL = 'graph_focus'

/** Projection key the panel reads. */
export const LIVE_KEY = 'graphLive'

/** Tool results the view keeps, newest last. */
const RECENT = 12

/** Matters kept in `awaiting` (the design row asks at most three per reply). */
const AWAITING_MAX = 3

/** Request plans kept in `requests` (m4-request-card design §5.8; the desk holds one open per session, the cap bounds the residue of settled asks). */
const REQUESTS_MAX = 8

/** The request notice outcomes that close an ask (m4-request-card design §5.5); `open` keeps it. */
const CLOSED_REQUEST_OUTCOMES: ReadonlySet<string> = new Set(['approved', 'declined', 'closed', 'expired', 'lapsed'])

/** The code points an argument keeps (plain-ui 1.3 §4.9: keep the projection small). */
const ARGS_MAX = 200

/** Maximum code points kept for a concise tool argument hint or error message. */
const HINT_MAX = 100
const ERROR_MAX = 200

export type LivePhase = 'idle' | 'thinking' | 'tool' | 'waiting-approval' | 'ended'
const LIVE_PHASES: readonly string[] = ['idle', 'thinking', 'tool', 'waiting-approval', 'ended']

/** Pending tool-approval question tracked across approval/asked and approval/decided. */
interface PendingApproval {
  readonly id: string
  readonly toolName: string
  readonly since: number
}

/** Latest error observed on the session (agent/request-error, llm/retry, or error turn/end). */
interface LiveError {
  readonly at: number
  readonly message: string
}

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

/** One request plan the human has not answered yet (m4-request-card design §5.8); the panel reads the entries off the view, the four lines verbatim with their bold marks. */
export interface RequestLiveEntry {
  readonly ref: string
  readonly title: string
  readonly background: string
  readonly proposal: string
  readonly doubt: string
  readonly notTaken: string
  /** When the ask result returned (ms epoch). */
  readonly at: number
}

export interface LiveCall {
  readonly name: string
  readonly at: number
  readonly ok: boolean
  readonly ms?: number
  readonly argHint?: string
}

interface LiveTool {
  readonly name: string
  readonly since: number
  readonly argHint?: string
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
  readonly tool: LiveTool | null
  readonly recent: readonly LiveCall[]
  readonly awaiting: readonly AwaitingEntry[]
  /** The request plans the human has not answered yet (m4-request-card design §5.8). */
  readonly requests: readonly RequestLiveEntry[]
  readonly turn?: number
  readonly stepSince?: number | null
  readonly phase?: LivePhase
  readonly turnEndReason?: string | null
  readonly provider?: string | null
  readonly pendingApproval?: PendingApproval | null
  readonly lastError?: LiveError | null
}

interface Pending {
  readonly name: string
  readonly since: number
  /** Concise argument hint extracted at tool/call time. */
  readonly argHint?: string
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
  focus: null,
  model: null,
  provider: null,
  turn: 0,
  turnSince: null,
  stepSince: null,
  steps: 0,
  phase: 'idle',
  turnEndReason: null,
  tool: null,
  recent: [],
  awaiting: [],
  requests: [],
  pendingApproval: null,
  lastError: null,
  pending: {},
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

/** Trim to the first non-empty line and clip to `max` code points. */
function clipLine(value: string, max: number): string | undefined {
  const firstLine = value.split(/\r?\n/).map(line => line.trim()).find(line => line.length > 0)
  if (firstLine === undefined) return undefined
  const points = [...firstLine]
  return points.length <= max ? firstLine : `${points.slice(0, max - 1).join('')}…`
}

function firstString(args: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = text(args[key])
    if (value !== undefined) return value
  }
  return undefined
}

const FILE_HINT_TOOLS: ReadonlySet<string> = new Set([
  'Read', 'Write', 'Edit', 'MultiEdit', 'str_replace_editor', 'read_file', 'write_file', 'edit_file', 'View', 'NotebookEdit', 'Glob', 'Grep',
])
const COMMAND_HINT_TOOLS: ReadonlySet<string> = new Set([
  'Bash', 'pwsh', 'powershell', 'terminal_send', 'run_command', 'Terminal',
])
const GRAPH_EXECUTE_HINT_TOOLS: ReadonlySet<string> = new Set([
  'dispatch_task', 'check_commit', 'answer_worker', 'submit_plan', 'ask_main', 'propose_to_human', 'record_human_answer', 'request_exception',
])

/** Extract a concise <= 100-char hint from a tool call's arguments. */
function argHintOf(name: string, args: Record<string, unknown>): string | undefined {
  let raw: string | undefined
  if (FILE_HINT_TOOLS.has(name)) {
    raw = firstString(args, ['file_path', 'path', 'filePath', 'target_file', 'notebook_path', 'pattern'])
  }
  else if (COMMAND_HINT_TOOLS.has(name)) {
    raw = firstString(args, ['command', 'cmd', 'CommandLine', 'input'])
  }
  else if (name.startsWith('graph_') || GRAPH_EXECUTE_HINT_TOOLS.has(name)) {
    raw = firstString(args, ['id', 'node', 'task', 'request', 'ref', 'commit', 'goal', 'question'])
  }
  else {
    raw = firstString(args, ['id', 'file_path', 'path', 'command', 'query', 'url', 'name', 'title', 'request', 'ref'])
  }
  return raw === undefined ? undefined : clipLine(raw, HINT_MAX)
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

/** `requests` with one plan added: the same ref replaced, the oldest dropped past REQUESTS_MAX. */
function withRequest(entries: readonly RequestLiveEntry[], entry: RequestLiveEntry): readonly RequestLiveEntry[] {
  const next = [...entries.filter(prior => prior.ref !== entry.ref), entry]
  return next.length > REQUESTS_MAX ? next.slice(next.length - REQUESTS_MAX) : next
}

/** `requests` without one ref; the same array when nothing matched, so the fold stays referential. */
function withoutRequest(entries: readonly RequestLiveEntry[], ref: string): readonly RequestLiveEntry[] {
  const next = entries.filter(entry => entry.ref !== ref)
  return next.length === entries.length ? entries : next
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
  return latest === undefined ? null : { name: latest.name, since: latest.since, ...(latest.argHint === undefined ? {} : { argHint: latest.argHint }) }
}

function activePhaseOf(state: Pick<LiveState, 'turnSince' | 'tool' | 'pendingApproval'>): LivePhase {
  if (state.pendingApproval !== undefined && state.pendingApproval !== null) return 'waiting-approval'
  if (state.tool !== null) return 'tool'
  return state.turnSince !== null ? 'thinking' : 'idle'
}

/** Fold one committed event; an event the view does not depend on returns the same state. */
export function foldLive(state: LiveState, event: LiveEvent): LiveState {
  if (event.seq < state.inherited) return state
  const data = record(event.data)
  switch (event.type) {
    case 'turn/start':
      return {
        ...state,
        turn: typeof data.turn === 'number' ? data.turn : (state.turn ?? 0) + 1,
        turnSince: event.time,
        stepSince: null,
        steps: 0,
        phase: 'thinking',
        turnEndReason: null,
        pendingApproval: null,
      }
    case 'turn/end': {
      const reason = record(data.reason)
      const kind = text(reason.kind) ?? text(data.reason) ?? null
      const errMessage = kind === 'error' ? clipLine(text(record(reason.error).message) ?? 'turn ended with error', ERROR_MAX) : undefined
      return {
        ...state,
        turnSince: null,
        stepSince: null,
        tool: null,
        pending: {},
        pendingApproval: null,
        phase: 'ended',
        turnEndReason: kind,
        ...(errMessage === undefined ? {} : { lastError: { at: event.time, message: errMessage } }),
      }
    }
    case 'step/start': {
      const next: LiveState = {
        ...state,
        steps: state.steps + 1,
        stepSince: event.time,
      }
      return { ...next, phase: activePhaseOf(next) }
    }
    case 'step/end':
      return state.stepSince === null || state.stepSince === undefined ? state : { ...state, stepSince: null }
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
      const argHint = argHintOf(shown, inner)
      const ask = shown === PROPOSE_TO_HUMAN || shown === RECORD_HUMAN_ANSWER ? askOf(inner) : undefined
      const pending = {
        ...state.pending,
        [callId]: {
          name: shown,
          since: event.time,
          ...(argHint === undefined ? {} : { argHint }),
          ...(focus === undefined ? {} : { focus }),
          ...(ask === undefined ? {} : { ask }),
        },
      }
      const tool = runningOf(pending)
      const next: LiveState = { ...state, pending, tool }
      return { ...next, phase: activePhaseOf(next) }
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
      // The request channel's ask (m4-request-card design §5.8): an ask adds its plan, an approved replay settles it.
      let requests = state.requests
      if (call.name === REQUEST_EXCEPTION) {
        const shown = shownRequestOf(!ok, textContentOf(message.content))
        if (shown !== undefined) {
          requests = shown.outcome === 'ask'
            ? withRequest(state.requests, { ...shown.request, at: event.time })
            : withoutRequest(state.requests, shown.ref)
        }
      }
      const tool = runningOf(pending)
      const ms = Math.max(0, event.time - call.since)
      const recentCall: LiveCall = {
        name: call.name,
        at: event.time,
        ok,
        ms,
        ...(call.argHint === undefined ? {} : { argHint: call.argHint }),
      }
      const next: LiveState = {
        ...state,
        pending,
        tool,
        awaiting,
        requests,
        recent: [...state.recent, recentCall].slice(-RECENT),
        focus: ok && call.focus !== undefined ? call.focus : state.focus,
      }
      return { ...next, phase: activePhaseOf(next) }
    }
    case 'approval/asked': {
      const id = text(data.id)
      const toolName = text(data.toolName)
      if (id === undefined || toolName === undefined) return state
      return {
        ...state,
        pendingApproval: { id, toolName, since: event.time },
        phase: 'waiting-approval',
      }
    }
    case 'approval/decided': {
      if (state.pendingApproval === undefined || state.pendingApproval === null) return state
      const id = text(data.id)
      if (id !== undefined && id !== state.pendingApproval.id) return state
      const next: LiveState = { ...state, pendingApproval: null }
      return { ...next, phase: activePhaseOf(next) }
    }
    case 'agent/request-error':
    case 'llm/retry': {
      const failure = record(data.failure)
      const raw = text(failure.message) ?? text(data.message)
      const msg = raw === undefined ? undefined : clipLine(raw, ERROR_MAX)
      if (msg === undefined) return state
      return { ...state, lastError: { at: event.time, message: msg } }
    }
    case 'user/message': {
      // A request notice's close (m4-request-card design §5.8): the reminder's facts carry the ref and the outcome.
      const source = record(data.source)
      if (source.kind !== REQUEST_NOTICE_SOURCE) return state
      const request = record(source.request)
      if (typeof request.ref !== 'string' || typeof request.outcome !== 'string' || CLOSED_REQUEST_OUTCOMES.has(request.outcome) === false) return state
      const requests = withoutRequest(state.requests, request.ref)
      return requests === state.requests ? state : { ...state, requests }
    }
    case 'request/header': {
      const config = record(record(data.header).config)
      const model = text(config.model) ?? null
      const provider = text(config.provider) ?? null
      return model === state.model && provider === (state.provider ?? null)
        ? state
        : { ...state, model, provider }
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

/** Shape check of the request plans (m4-request-card design §5.8): at most REQUESTS_MAX, one shape each. */
function parseRequests(value: unknown): void {
  if (!Array.isArray(value) || value.length > REQUESTS_MAX) fail(`requests must be at most ${REQUESTS_MAX} entries`)
  for (const entry of value) {
    const item = record(entry)
    if (typeof item.at !== 'number') fail('request entries must carry an at')
    for (const field of ['ref', 'title', 'background', 'proposal', 'doubt', 'notTaken'] as const) {
      if (typeof item[field] !== 'string') fail(`request entries must carry a ${field}`)
    }
  }
}

/** Shape check of a view value: checkpoint restore and the wire both parse through it. */
function parseView(value: unknown): LiveView {
  const view = record(value)
  if (!(view.focus === null || typeof view.focus === 'string')) fail('focus must be a string or null')
  if (!(view.model === null || typeof view.model === 'string')) fail('model must be a string or null')
  if (!isNullableNumber(view.turnSince) || typeof view.steps !== 'number') fail('turnSince and steps must be numbers')
  if (view.turn !== undefined && typeof view.turn !== 'number') fail('turn must be a number')
  if (view.stepSince !== undefined && !isNullableNumber(view.stepSince)) fail('stepSince must be a number or null')
  if (view.phase !== undefined && !LIVE_PHASES.includes(view.phase as string)) fail('phase must be a valid live phase')
  if (view.turnEndReason !== undefined && view.turnEndReason !== null && typeof view.turnEndReason !== 'string') fail('turnEndReason must be a string or null')
  if (view.provider !== undefined && view.provider !== null && typeof view.provider !== 'string') fail('provider must be a string or null')
  const tool = view.tool
  if (!(tool === null || (typeof record(tool).name === 'string' && typeof record(tool).since === 'number' && (record(tool).argHint === undefined || typeof record(tool).argHint === 'string')))) {
    fail('tool must be {name, since} or null')
  }
  if (!Array.isArray(view.recent) || !view.recent.every((call) => {
    const item = record(call)
    return typeof item.name === 'string'
      && typeof item.at === 'number'
      && typeof item.ok === 'boolean'
      && (item.ms === undefined || typeof item.ms === 'number')
      && (item.argHint === undefined || typeof item.argHint === 'string')
  })) fail('recent must be a list of {name, at, ok}')
  if (view.pendingApproval !== undefined && view.pendingApproval !== null) {
    const approval = record(view.pendingApproval)
    if (typeof approval.id !== 'string' || typeof approval.toolName !== 'string' || typeof approval.since !== 'number') {
      fail('pendingApproval must be {id, toolName, since} or null')
    }
  }
  if (view.lastError !== undefined && view.lastError !== null) {
    const error = record(view.lastError)
    if (typeof error.at !== 'number' || typeof error.message !== 'string') {
      fail('lastError must be {at, message} or null')
    }
  }
  parseAwaiting(view.awaiting)
  parseRequests(view.requests)
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
    if (item.argHint !== undefined && typeof item.argHint !== 'string') fail('pending argHint must be a string')
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
  stateVersion: 5,
  stateSchema: { parse: parseState },
  init: (_header: unknown, inheritedEventCount: number): LiveState => initialLive(inheritedEventCount),
  apply: foldLive,
  wire: { viewSchema: { parse: parseView }, view: liveView },
} as const
