/**
 * Which session the loop board may talk to (docs/ORCHESTRATION.md §18.10; loop
 * board design 0.6 §6.4): one function, `holderStateOf`, that says whether the
 * main agent of a project can be reached now, and the one place that locates
 * the holder record, `holderRecordFor`.
 *
 * The board does not remember who the main agent is: the reconciliation of the
 * reminders, every delivery and every beat ask again, so `/wish here` moves the
 * next delivery to the new session without the board doing anything (the
 * record is read through M3's `readHolder`, which caches on the file's
 * modification time and size, so asking again is cheap).
 *
 * Six answers, and what each costs (design §6.4 table): `ok` delivers; `none`,
 * `archived` and `not-found` are "there is nobody to tell", so a message waits
 * and the reminders of that session are removed; `elsewhere` means the session
 * is open in another DSH process, which is the process that must deliver;
 * `unknown` splits in two, by which of the two readings failed, because they
 * cost different things: with `archive-unreadable` the board goes on delivering
 * (not knowing whether a session is archived must not stop the board) while it
 * deletes no reminder, and with `holder-unreadable` it does not know whom to
 * tell and holds the message.
 *
 * The record alone is not enough (the M3 review of the /wish fix, finding R2):
 * a cancelled `/wish`, or a crash before the session was reopened, can leave a
 * record naming a session whose main-agent mode is off, and a reminder
 * delivered there lands on an ordinary agent. So where this process can read
 * that session's mode, the board crosses the record with it: mode off and no
 * `/wish` in flight reads as `none`. A session that is not open here cannot be
 * read that way, and then the record stands. When M3 lands a reader that says
 * both things at once, this file switches to it and nothing else changes.
 */
import { MAIN_AGENT_KEY, mainAgentActive } from '../graph/main-agent.ts'
import { holderHome, holderFileOf, readHolder, type HolderReading } from '../graph/main-agent-holder.ts'
import { graphService } from '../graph/service.ts'
import { DEFAULT_GRAPH_DIR } from '../graph/tools.ts'
import { join } from 'node:path'
import type { ServiceLookup, SessionLike, SessionProjectionsService, WorkspaceRegistryService } from '../shared/dsh-min.ts'
import { agentsOf } from '../rules/wake.ts'

/** How long a `session/writer-held` answer stands for (design §6.1, §6.4 (b)): after it the board asks once more, so it does not wait for a process that never takes the lock. */
export const WRITER_HELD_MS = 5 * 60_000

export type HolderStateKind = 'ok' | 'none' | 'archived' | 'not-found' | 'elsewhere' | 'unknown'

/** Why an answer is what it is; the page and the `loop-holder` record carry it (design §6.10). */
export type HolderReason =
  /** The record is not there: the project has no main agent, or the person left the role. */
  | 'no-record'
  /** The record names a session whose main-agent mode is off and which has no `/wish` in flight. */
  | 'mode-off'
  | 'holder-archived'
  | 'holder-not-found'
  /** Another process has the holder session open and asked for the run lock. */
  | 'handover'
  | 'writer-held'
  /** The archive set could not be read, so an archived holder session would not be noticed. */
  | 'archive-unreadable'
  /** The record itself could not be read. */
  | 'holder-unreadable'

export interface HolderState {
  readonly kind: HolderStateKind
  /** The session the record names, when there is one. */
  readonly session?: string
  readonly reason?: HolderReason
  /** What the reading failed with, for the row's health. */
  readonly detail?: string
}

/**
 * What the board remembers between beats about reaching the holder session
 * (design §6.4): the session a `resolveAgent` could not find, the moment one
 * answered that another process holds the writer, and how many reconciliations
 * in a row have read no record at all (two are needed before a reminder of the
 * old session is removed, so a record being replaced by a rename is not read as
 * gone).
 */
export interface HolderMemory {
  notFound?: { session: string, at: string }
  writerHeld?: { session: string, at: string }
  noRecord?: { count: number, at: string }
}

export interface HolderDeps {
  readonly projectRoot: string
  readonly ctx: ServiceLookup
  readonly now: () => number
  readonly memory: () => HolderMemory
  /** The session another process asked the run lock for, because the main agent's session is open there (design §6.1). */
  readonly handedElsewhere?: () => string | undefined
  /** The holder record; the default is the one locating function below. Tests replace it. */
  readonly record?: (projectRoot: string) => HolderReading
  /** Whether the record's session is in main-agent mode; the default reads the projection of a session open in this process. */
  readonly mode?: (sessionId: string) => 'on' | 'off' | 'unknown'
  /** The archived sessions; the default reads the host's workspace registry. */
  readonly archived?: () => readonly string[]
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 120)

/**
 * The one place the board locates the main agent's record (impl-plan
 * Interpretations 5): M3 keeps it under the user directory, keyed by the
 * project's graph directory, which the graph row's service names when it is
 * there and which is `docs/graph` of the project root when it is not. When M3
 * moves the record into the project's `.llm/`, only this function changes.
 */
export function holderRecordFor(ctx: ServiceLookup, projectRoot: string): HolderReading {
  const dir = graphService(ctx)?.dirFor(projectRoot) ?? join(projectRoot, ...DEFAULT_GRAPH_DIR.split('/'))
  return readHolder(holderFileOf(holderHome(ctx), dir))
}

/** The archived sessions of the host, or undefined when the registry cannot be read (design §10.2 V14). */
export function archivedSessionsOf(ctx: ServiceLookup): { readonly ids: readonly string[] } | { readonly fault: string } {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get('workspaceRegistry') : undefined
  if (value === undefined || value === null) return { fault: '这个进程里没有 DSH 的工作区登记表' }
  try {
    const ids = (value as WorkspaceRegistryService).archivedSessionIds
    return Array.isArray(ids) && ids.every(id => typeof id === 'string') ? { ids } : { fault: '工作区登记表的归档集合不是字符串数组' }
  }
  catch (error) {
    return { fault: message(error) }
  }
}

/**
 * Whether the session the record names has main-agent mode on, as far as this
 * process can tell: `unknown` unless the session is open here and the
 * main-agent projection reads. A `/wish` that has not finished counts as on,
 * because the role it asks for is not settled yet (src/design/mode.ts keeps
 * that in the projection's `running`).
 */
export function modeOfSession(ctx: ServiceLookup, sessionId: string): 'on' | 'off' | 'unknown' {
  const session: SessionLike | undefined = agentsOf(ctx)?.get(sessionId)?.session
  if (session === undefined) return 'unknown'
  const projections: unknown = typeof ctx.get === 'function' ? ctx.get('sessionProjections') : undefined
  const stateOf = (projections as Partial<SessionProjectionsService> | undefined)?.stateOf
  if (typeof stateOf !== 'function') return 'unknown'
  try {
    const state: unknown = stateOf.call(projections, session, MAIN_AGENT_KEY)
    if (state === undefined) return 'unknown'
    const running = (state as { readonly running?: unknown }).running
    if (typeof running === 'object' && running !== null) return 'on'
    return mainAgentActive({ [MAIN_AGENT_KEY]: state }) ? 'on' : 'off'
  }
  catch {
    return 'unknown'
  }
}

/**
 * Whether the board can talk to the main agent of this project now. Reads the
 * record, the mode of the session it names, the host's archive set and what the
 * last `resolveAgent` answered; never throws.
 */
export function holderStateOf(deps: HolderDeps): HolderState {
  const reading = (deps.record ?? (root => holderRecordFor(deps.ctx, root)))(deps.projectRoot)
  const memory = deps.memory()
  if (reading.kind === 'unreadable') return { kind: 'unknown', reason: 'holder-unreadable', detail: reading.reason }
  if (reading.kind === 'none') return { kind: 'none', reason: 'no-record' }
  const session = reading.record.sessionId
  const mode = (deps.mode ?? ((id: string) => modeOfSession(deps.ctx, id)))(session)
  // The record can name a session that is not in the role any more (a cancelled /wish, a crash before it was reopened): a reminder there would land on an ordinary agent.
  if (mode === 'off') return { kind: 'none', session, reason: 'mode-off' }
  const handed = deps.handedElsewhere?.()
  if (handed === session) return { kind: 'elsewhere', session, reason: 'handover' }
  const held = memory.writerHeld
  if (held?.session === session && deps.now() - Date.parse(held.at) < WRITER_HELD_MS) return { kind: 'elsewhere', session, reason: 'writer-held' }
  const gone = memory.notFound
  if (gone?.session === session) return { kind: 'not-found', session, reason: 'holder-not-found' }
  const archived = (deps.archived ?? (() => {
    const read = archivedSessionsOf(deps.ctx)
    if ('fault' in read) throw new Error(read.fault)
    return read.ids
  }))
  try {
    if (archived().includes(session)) return { kind: 'archived', session, reason: 'holder-archived' }
  }
  catch (error) {
    return { kind: 'unknown', session, reason: 'archive-unreadable', detail: message(error) }
  }
  return { kind: 'ok', session }
}

/** Whether a message can be delivered in this state (design §6.4: `ok`, and `unknown` only when it is the archive set that could not be read). */
export function canDeliver(state: HolderState): boolean {
  return state.kind === 'ok' || (state.kind === 'unknown' && state.reason === 'archive-unreadable')
}

/** Whether a reminder bound to the holder session may be removed in this state (design §6.2 item 0, §11.3): never while the board cannot see the session clearly. */
export function mayRemoveHolderTasks(state: HolderState): boolean {
  return state.kind !== 'elsewhere' && state.kind !== 'unknown'
}

/** What the page and the home line say in this state (design §6.4 table). */
export function holderLine(state: HolderState): string | undefined {
  switch (state.kind) {
    case 'none': return state.reason === 'mode-off' ? '还没有主 Agent（记录指的那个会话已经不是主 Agent 了）：在输入框打 /wish' : '还没有主 Agent：在输入框打 /wish'
    case 'archived': return '主 Agent 的会话已归档：在一个会话里打 /wish here'
    case 'not-found': return '主 Agent 的会话找不到了：在一个会话里打 /wish here'
    case 'elsewhere': return '主 Agent 的会话在另一个 DSH 窗口里，这块板交不过去'
    case 'unknown': return state.reason === 'archive-unreadable'
      ? '循环板此刻看不清主 Agent 的会话（读不到它归没归档），这几项的提醒先不删'
      : '循环板此刻看不清主 Agent 的会话（读不出主 Agent 是哪个会话），这几项的提醒先不删'
    default: return undefined
  }
}

/** The row health line of a state that degrades the row (design §6.4 table); `undefined` when the state is not a fault of the board's. */
export function holderFault(state: HolderState): string | undefined {
  if (state.kind === 'unknown') {
    return state.reason === 'archive-unreadable'
      ? `读不到归档状态：主 Agent 的会话被归档时循环板不知道（${state.detail ?? '读不出'}）`
      : `读不出主 Agent 的记录：${state.detail ?? '读不出'}`
  }
  return undefined
}
