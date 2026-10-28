/**
 * Live state of one agent for the project graph panel (docs/ORCHESTRATION.md
 * §2.10 "实时现场", m2-8): a DSH session projection unit
 * (dsh-session-projection README) that folds the session's own committed
 * events into where the agent is on the graph and what it is doing. The
 * panel reads it through the client's session projections, for the panel's
 * session and for each direct child the subagent catalog names. Nothing is
 * written to disk: the session log is the record, this is a view of it.
 *
 * Events folded (rc.3 dsh-agent-loop and dsh-subagent appends):
 * turn/start {turn}, turn/end, step/start {turn, step}, tool/call {callId,
 * name, arguments (provider JSON text)}, tool/result {message: {isError,
 * source: {callId}}}, request/header {header: {config: {model}}},
 * subagent/catalog {childId, label}. Every event carries `time`
 * (Date.now() at append). Events of a fork's inherited prefix are skipped.
 * No Node built-ins: the panel imports the key and the view type.
 */
/** The tool that sets the focus node (tools.ts); the step projection (reminder.ts) and this fold find its calls in the history. */
export const FOCUS_TOOL = 'graph_focus'

/** Projection key the panel reads. */
export const LIVE_KEY = 'graphLive'

/** Tool results the view keeps, newest last. */
const RECENT = 6

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
  /** Direct children from the subagent catalog. */
  readonly children: readonly { readonly id: string, readonly label: string }[]
}

interface Pending {
  readonly name: string
  readonly since: number
  /** The node a graph_focus call names. */
  readonly focus?: string
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
  focus: null, model: null, turnSince: null, steps: 0, tool: null, recent: [], children: [], pending: {},
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

/** The node id a graph_focus call names; arguments arrive as the provider's JSON text. */
function focusOf(name: string, args: unknown): string | undefined {
  if (name !== FOCUS_TOOL) return undefined
  let parsed: unknown = args
  if (typeof args === 'string') {
    try {
      parsed = JSON.parse(args)
    }
    catch {
      return undefined
    }
  }
  return text(record(parsed).id)
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
      const focus = focusOf(name, data.arguments)
      const pending = { ...state.pending, [callId]: { name, since: event.time, ...(focus === undefined ? {} : { focus }) } }
      return { ...state, pending, tool: runningOf(pending) }
    }
    case 'tool/result': {
      const message = record(data.message)
      const callId = text(record(message.source).callId)
      const call = callId === undefined ? undefined : state.pending[callId]
      if (callId === undefined || call === undefined) return state
      const { [callId]: _done, ...pending } = state.pending
      const ok = message.isError !== true
      return {
        ...state,
        pending,
        tool: runningOf(pending),
        recent: [...state.recent, { name: call.name, at: event.time, ok }].slice(-RECENT),
        focus: ok && call.focus !== undefined ? call.focus : state.focus,
      }
    }
    case 'request/header': {
      const model = text(record(record(data.header).config).model) ?? null
      return model === state.model ? state : { ...state, model }
    }
    case 'subagent/catalog': {
      const id = text(data.childId)
      if (id === undefined || state.children.some(child => child.id === id)) return state
      return { ...state, children: [...state.children, { id, label: text(data.label) ?? id }] }
    }
    default:
      return state
  }
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

/** Shape check of a view value: checkpoint restore and the wire both parse through it. */
function parseView(value: unknown): LiveView {
  const view = record(value)
  if (!(view.focus === null || typeof view.focus === 'string')) fail('focus must be a string or null')
  if (!(view.model === null || typeof view.model === 'string')) fail('model must be a string or null')
  if (!isNullableNumber(view.turnSince) || typeof view.steps !== 'number') fail('turnSince and steps must be numbers')
  const tool = view.tool
  if (!(tool === null || (typeof record(tool).name === 'string' && typeof record(tool).since === 'number'))) fail('tool must be {name, since} or null')
  if (!Array.isArray(view.recent) || !view.recent.every(call => typeof record(call).name === 'string' && typeof record(call).at === 'number' && typeof record(call).ok === 'boolean')) fail('recent must be a list of {name, at, ok}')
  if (!Array.isArray(view.children) || !view.children.every(child => typeof record(child).id === 'string' && typeof record(child).label === 'string')) fail('children must be a list of {id, label}')
  return value as LiveView
}

function parseState(value: unknown): LiveState {
  const state = record(value)
  parseView(state)
  if (typeof state.inherited !== 'number') fail('inherited must be a number')
  const pending = record(state.pending)
  for (const call of Object.values(pending)) {
    if (typeof record(call).name !== 'string' || typeof record(call).since !== 'number') fail('pending calls must be {name, since}')
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
  stateVersion: 1,
  stateSchema: { parse: parseState },
  init: (_header: unknown, inheritedEventCount: number): LiveState => initialLive(inheritedEventCount),
  apply: foldLive,
  wire: { viewSchema: { parse: parseView }, view: liveView },
} as const
