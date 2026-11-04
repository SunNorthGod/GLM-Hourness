/**
 * Row health (docs/DESIGN.md §2.5): every host row of the bundle says
 * whether it is in effect and, if not, why.
 *
 * Each row provides its own read-only health view as the cordis service
 * `glmHournessHealth/<row>` at activation, with its activation status
 * (loaded and configured, or degraded and the reason). Whenever the row acts
 * in a session (an assembled step, a tool call, a model call, a command) it
 * reports that session's status; a report is stored the first time and
 * whenever the status changes. Two commands read every view through
 * `ctx.get` and render the same table for the invoking session: `/glm-status`
 * of the GLM channel package (after its credential line) and
 * `/hourness-status` of the orchestration package. A row whose service is
 * absent is not loaded (disabled, or its activation never completed); a
 * package none of whose rows is loaded takes one line. Provider and reader
 * need no load order and no shared module instance, and a row unloads its
 * view with its fiber. Reports stay in the host process; nothing reaches the
 * model-visible conversation.
 */
import type { ProvideHost, ServiceLookup } from './dsh-min.ts'

/** The GLM channel package's host rows (loader ids `glm-hourness/<row>`), in patch order. */
export const GLM_ROWS = ['glm-llm', 'glm-login', 'glm-prompt', 'glm-compact'] as const

/** The orchestration package's host rows, in patch order. */
export const HOURNESS_ROWS = ['data', 'guard', 'memory', 'lessons', 'workflow', 'hourness', 'graph', 'graph-panel', 'rules', 'design', 'loops', 'env'] as const

/**
 * Each package with its host rows: the runtime copy of the directory table
 * (scripts/packages.mjs), which src/ does not import; preflight checks the
 * two agree once the table lists package names and rows (split step 5). The
 * client rows run in the client and are not listed.
 */
export const HEALTH_PACKAGES = [
  { name: 'dsh-glm-zcode', rows: GLM_ROWS },
  { name: 'dsh-hourness', rows: HOURNESS_ROWS },
] as const

/** Every host row, package by package, in patch order. */
export const HEALTH_ROWS = [...GLM_ROWS, ...HOURNESS_ROWS] as const

export type HealthRow = typeof HEALTH_ROWS[number]

/** Rows whose status is fixed at activation: they do not act per session (graph-panel's command acts for the human, not a session's agent; the loop board belongs to the project, not to a session). */
const ACTIVATION_ONLY: ReadonlySet<HealthRow> = new Set(['glm-login', 'data', 'graph-panel', 'loops'])

/** A row's status: in effect, partly in effect, or not in effect. */
export type HealthState = 'active' | 'degraded' | 'inactive'

export interface HealthReport {
  readonly state: HealthState
  readonly reason: string
  /** ISO time of the report. */
  readonly at: string
}

/** The read side one row provides as its health service. */
export interface RowHealthView {
  readonly row: HealthRow
  activation(): HealthReport
  /** The latest report for one session, if the row acted there. */
  session(sessionId: string): HealthReport | undefined
}

/** The write side a row keeps, with its own view: the row reads what it reports, notes included. */
export interface RowHealth extends RowHealthView {
  /** Report the row's status in one session; stored when new or changed. A report without a session id is dropped. */
  report(sessionId: string | undefined, state: HealthState, reason: string): void
  /**
   * Attach a lasting problem to one session's report (m4-gate G1, F13). The
   * stored report is always the latest `report` call (the row's activation
   * status if there has been none) with every note of the session appended
   * to its reason, joined by '；', and its state raised to at least
   * 'degraded' ('inactive' stays) while one of them degrades. `degrades`
   * false attaches a remark that only adds its text (env's check timeouts,
   * M4 design §6.3.1). A later `report` keeps the notes. `text` undefined
   * withdraws the note. Like `report`, a call without a session id is
   * dropped. At most 4 notes per session (a fifth key is dropped), each cut
   * to 80 code points. Notes leave with the session's report when the
   * 64-session limit evicts it.
   */
  note(sessionId: string | undefined, key: string, text: string | undefined, degrades?: boolean): void
  /** Replace the activation status: a service the row waits for arrived or failed after activation. */
  reactivate(state: HealthState, reason: string): void
  /** Withdraw the health service. */
  dispose(): void
}

/** Sessions remembered per row; the oldest report leaves first. */
const SESSION_LIMIT = 64

/** How many notes one session carries; a further key is dropped. */
const NOTE_LIMIT = 4

/** How many code points of one note are kept. */
const NOTE_LENGTH = 80

/** The cordis service name of one row's health view. */
export function healthServiceName(row: HealthRow): string {
  return `glmHournessHealth/${row}`
}

/** The session an agent runs (rc.3 agents share their id with the session). */
export function sessionIdOf(agent: { readonly id: string, readonly session?: { readonly id: string } } | undefined): string | undefined {
  return agent?.session?.id ?? agent?.id
}

/** One note of a session: its text, and whether it lowers the row's state. */
interface Note {
  readonly text: string
  readonly degrades: boolean
}

/** A status composed of a base and the session's notes: the reason grows, the state rises to at least degraded while a note degrades ('inactive' stays). */
function compose(state: HealthState, reason: string, notes: ReadonlyMap<string, Note> | undefined): { state: HealthState, reason: string } {
  if (notes === undefined || notes.size === 0) return { state, reason }
  const degraded = state !== 'inactive' && [...notes.values()].some(note => note.degrades)
  return { state: degraded ? 'degraded' : state, reason: [reason, ...[...notes.values()].map(note => note.text)].join('；') }
}

/**
 * Provide one row's health view with its activation status. A context
 * without `provide`, or a failing provide (a second instance of the row),
 * keeps the reports local and warns once; activation never throws.
 */
export function provideRowHealth(ctx: Partial<ProvideHost>, row: HealthRow, state: HealthState, reason: string, now: () => Date = () => new Date()): RowHealth {
  const stamp = (state: HealthState, reason: string): HealthReport => Object.freeze({ state, reason, at: now().toISOString() })
  let activation = stamp(state, reason)
  /** The base the notes compose onto: the latest raw report call per session. */
  const bases = new Map<string, { state: HealthState, reason: string }>()
  const notes = new Map<string, Map<string, Note>>()
  const sessions = new Map<string, HealthReport>()
  /** The sessions the row has reported on or noted, first touch first: the 64-session cap covers notes without a report too, and the oldest report leaves first. */
  const touched = new Map<string, true>()
  const touch = (sessionId: string): void => {
    if (touched.has(sessionId)) return
    touched.set(sessionId, true)
    if (touched.size > SESSION_LIMIT) {
      const oldest = touched.keys().next().value as string
      touched.delete(oldest)
      sessions.delete(oldest)
      bases.delete(oldest)
      notes.delete(oldest)
    }
  }
  const store = (sessionId: string, report: { state: HealthState, reason: string }): void => {
    const last = sessions.get(sessionId)
    if (last !== undefined && last.state === report.state && last.reason === report.reason) return
    sessions.delete(sessionId)
    sessions.set(sessionId, stamp(report.state, report.reason))
  }
  const view: RowHealthView = Object.freeze({
    row,
    activation: () => activation,
    session: (sessionId: string) => {
      const stored = sessions.get(sessionId)
      if (stored !== undefined) return stored
      const ofSession = notes.get(sessionId)
      if (ofSession === undefined || ofSession.size === 0) return undefined
      const composed = compose(activation.state, activation.reason, ofSession)
      return stamp(composed.state, composed.reason)
    },
  })
  let withdraw = (): void => {}
  if (typeof ctx.provide === 'function') {
    try {
      withdraw = ctx.provide(healthServiceName(row), view)
    }
    catch (error) {
      console.warn(`dsh-glm-hourness/${row}: row health not provided: ${(error as Error).message}`)
    }
  }
  return {
    ...view,
    report(sessionId, state, reason) {
      if (sessionId === undefined || sessionId.length === 0) return
      bases.set(sessionId, { state, reason })
      store(sessionId, compose(state, reason, notes.get(sessionId)))
      touch(sessionId)
    },
    note(sessionId, key, text, degrades = true) {
      if (sessionId === undefined || sessionId.length === 0) return
      touch(sessionId)
      let ofSession = notes.get(sessionId)
      if (text === undefined) {
        if (ofSession === undefined) return
        ofSession.delete(key)
        if (ofSession.size === 0) notes.delete(sessionId)
      }
      else {
        if (ofSession === undefined) {
          ofSession = new Map()
          notes.set(sessionId, ofSession)
        }
        if (!ofSession.has(key) && ofSession.size >= NOTE_LIMIT) return
        // Map.set keeps the key's position: a note keeps the place it first took.
        ofSession.set(key, { text: Array.from(text).slice(0, NOTE_LENGTH).join(''), degrades })
      }
      const base = bases.get(sessionId)
      if (base === undefined) return // a session without a report composes on read; nothing is stored yet
      const composed = compose(base.state, base.reason, notes.get(sessionId))
      store(sessionId, composed)
    },
    reactivate(state, reason) {
      activation = stamp(state, reason)
    },
    dispose: () => withdraw(),
  }
}

/** One table line: the row's status in the session, `idle` when it has not acted there, `absent` when it is not loaded. */
export interface HealthEntry {
  readonly row: HealthRow
  readonly status: HealthState | 'idle' | 'absent'
  readonly reason: string
}

function asView(value: unknown): RowHealthView | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Partial<RowHealthView>
  return typeof record.activation === 'function' && typeof record.session === 'function' ? value as RowHealthView : undefined
}

/** A row's activation status as the host has it now (what the row says of itself, not of a session), `absent` when its health service is not there. */
export function activationState(ctx: ServiceLookup, row: HealthRow): HealthState | 'absent' {
  const view = asView(typeof ctx.get === 'function' ? ctx.get(healthServiceName(row)) : undefined)
  return view === undefined ? 'absent' : view.activation().state
}

/**
 * Every row's status for one session. An inactive activation wins (the row
 * cannot act); otherwise the session report, else the activation status
 * (`idle` for a loaded row that has not acted in the session yet).
 */
export function collectHealth(ctx: ServiceLookup, sessionId: string | undefined): HealthEntry[] {
  return HEALTH_ROWS.map((row): HealthEntry => {
    const view = asView(typeof ctx.get === 'function' ? ctx.get(healthServiceName(row)) : undefined)
    if (view === undefined) return { row, status: 'absent', reason: '行未启用，或激活未完成' }
    const activation = view.activation()
    if (activation.state === 'inactive' || ACTIVATION_ONLY.has(row)) return { row, status: activation.state, reason: activation.reason }
    const session = sessionId === undefined ? undefined : view.session(sessionId)
    if (session !== undefined) return { row, status: session.state, reason: session.reason }
    return { row, status: activation.state === 'active' ? 'idle' : activation.state, reason: activation.reason }
  })
}

const STATUS_LABELS: Readonly<Record<HealthEntry['status'], string>> = {
  active: '生效',
  degraded: '部分生效',
  inactive: '未生效',
  idle: '已加载，本会话未触发',
  absent: '未加载',
}

/** The 行 cell of a package's single line when none of its rows is loaded (ui/src/channel-model.ts reads it). */
const WHOLE_PACKAGE = '全部'

/**
 * The health table as `/glm-status` and `/hourness-status` show it
 * (Markdown), package by package: one line per row, in the order of
 * `entries`, or one line for a package whose rows are all present in
 * `entries` and all not loaded.
 */
export function renderHealthTable(entries: readonly HealthEntry[], sessionId: string | undefined): string {
  const cell = (text: string): string => text.replace(/\s*\n\s*/g, ' ').replaceAll('|', '\\|')
  const lines = HEALTH_PACKAGES.flatMap(({ name, rows }) => {
    const members: ReadonlySet<string> = new Set(rows)
    const own = entries.filter(entry => members.has(entry.row))
    const whole = rows.every(row => own.some(entry => entry.row === row && entry.status === 'absent'))
    if (whole) return [`| ${name} | ${WHOLE_PACKAGE} | ${STATUS_LABELS.absent} | 包未安装，或它的行全部禁用 |`]
    return own.map(entry => `| ${name} | ${entry.row} | ${STATUS_LABELS[entry.status]} | ${cell(entry.reason)} |`)
  })
  return [
    sessionId === undefined ? '## 行健康' : `## 行健康（会话 ${sessionId}）`,
    '',
    '| 包 | 行 | 状态 | 说明 |',
    '| --- | --- | --- | --- |',
    ...lines,
  ].join('\n')
}
