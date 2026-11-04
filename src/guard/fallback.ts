/**
 * Workspace-change fallback for file-tools-only (m4-gate G3, design §3.4):
 * a rule only a turn's end can see, so it cannot block — it writes a late
 * denial into the journal and queues a correction for the agent's next step.
 *
 * dsh-workspace-changes summarizes the files each top-level turn changed
 * (git working-tree snapshots at turn start and turn end plus whole-file
 * captures around file-tool edits) and announces each summary with a
 * `workspace/changes` session event carrying the turn. The guard notes, per
 * session and turn, the targets of the file tools and the shell calls it let
 * through. When a turn that ran shell calls changed files no file tool of
 * that turn targeted, the shell probably wrote them in a way the quote-aware
 * reader does not see (a .NET call, `cmd /c`, an interpreter one-liner): one
 * late denial goes to the violation journal (`mode: 'late'`, `via:
 * 'turn-end'`; it counts as a violation, the model never read a denial —
 * that call already ran) and one correction reminder is queued for the
 * session, delivered by the guard row's `hourness-guard` step notice before
 * the agent's next step, at most one per turn and eight queued. Files under
 * the project graph count as known in a turn that ran a graph tool (the
 * graph row's service, src/graph/service.ts): the engine wrote them. The
 * price is a blind spot: a shell write into the graph in that same turn is
 * not recorded (graph-files-only still denies the ones it sees).
 * Every route is noted, like the guard judges every route (ORCHESTRATION.md
 * §6.2); a record carries the origin of its turn's shell calls
 * (src/guard/origin.ts): `dialect` when any of them ran where the GLM
 * dialect claimed the agent, else `other`, with the last one's route.
 *
 * Limits (dsh-workspace-changes README): only top-level sessions with a
 * working directory are summarized; outside a git repository, or without
 * git, the summary lists file-tool edits only, so shell writes are absent;
 * ignored files are covered only when a file tool touched them; edits the
 * user makes during a turn count for that turn.
 */
import { resolve } from 'node:path'
import { normalizePath, shellCommandOf, type ToolCall } from './rules.ts'
import { originOf, type CallOrigin, type RouteScope } from './origin.ts'
import { dialectNames, dialectService, dialectWarner, toNativeTool } from '../shared/dialect.ts'
import type { JsonValue } from '../shared/json.ts'
import type { Route } from '../shared/route.ts'
import type { AgentLike, ServiceLookup, SessionEventLike, SessionLike, ToolExecutionPayload, WorkspaceChangesService } from '../shared/dsh-min.ts'
import { graphService } from '../graph/service.ts'
import type { LateRecord } from './records.ts'

/** One shadow record's fields (JSONL line in the violation journal); the late denial adds `mode: 'late'` and `via: 'turn-end'` (records.ts LateRecord). */
export interface ShadowRecord {
  readonly at: string
  readonly rule: 'file-tools-only'
  readonly mode: 'shadow'
  readonly sessionId: string
  readonly agentId?: string | undefined
  /** The origin of the turn's shell calls (src/guard/origin.ts); absent on records written before split step 7. */
  readonly scope?: RouteScope | undefined
  readonly route?: Route | undefined
  readonly turn: number
  /** Changed files no file tool of the turn targeted, as workspace-changes displays them. */
  readonly paths: readonly string[]
  /** Changed files the summary did not list (beyond the plugin's `maxFiles`). */
  readonly unlisted?: number | undefined
  /** The shell calls the guard let through in that turn. */
  readonly calls: ReadonlyArray<{ readonly tool: string, readonly command: string }>
}

export interface WorkspaceFallback {
  /** A root tool call that is about to run, and where it runs. */
  observe(payload: ToolExecutionPayload, origin: CallOrigin): void
  /** A session log event. */
  event(session: SessionLike, event: SessionEventLike): void
  /** A disposed session: forget it. */
  disposed(session: SessionLike): void
  /** Whether the composition offers workspace-changes summaries. */
  available(): boolean
}

/** What the guard noted in one turn. */
interface TurnNotes {
  readonly targets: Set<string>
  /** Directories a known writer changed: the project graph, when a graph tool ran. */
  readonly known: Set<string>
  readonly calls: Array<{ tool: string, command: string }>
  agent?: AgentLike
  agentId?: string
  /** The session's working directory: the journal finds the project of the record with it (design §2.4). */
  cwd?: string
  /** The origin of the shell calls so far: dialect once any ran on a claimed route; the last one's route. */
  origin?: CallOrigin
}

function under(path: string, dirs: ReadonlySet<string>): boolean {
  for (const dir of dirs) if (path === dir || path.startsWith(`${dir}/`)) return true
  return false
}

/**
 * File tools by DSH native name and the argument naming their target
 * (dsh-tool-fs `file_path`, dsh-tool-str-replace-editor `path`); the ZCode
 * Write and Edit aliases map to write and edit before the lookup.
 */
const FILE_TOOLS: ReadonlyMap<string, string> = new Map([
  ['write', 'file_path'],
  ['edit', 'file_path'],
  ['str_replace_editor', 'path'],
])

/** Sessions tracked at once; the oldest leaves first. */
const SESSION_LIMIT = 64
/** Turns kept per session: a summary may arrive after the next turn started. */
const TURN_SPAN = 3

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined

/**
 * The correction reminder of one late denial (design §3.4, the wording verbatim; the tool names follow the face): the agent's
 * next step reads it, at most one per turn and eight queued per session, oldest first.
 */
const CORRECTION_LIMIT = 8
const pending = new Map<string, string[]>()

/** Take one queued correction of the session, oldest first; the step notice calls this, and delivering clears it. */
export function takeCorrection(sessionId: string): string | undefined {
  const queue = pending.get(sessionId)
  const text = queue?.shift()
  if (queue !== undefined && queue.length === 0) pending.delete(sessionId)
  return text
}

export function correctionBody(paths: readonly string[], calls: readonly { readonly tool: string, readonly command: string }[], face: (name: string) => string): string {
  // At most ten files and three commands, the commands cut to 80 characters, the whole within 600 (design §3.4).
  const shown = paths.slice(0, 10).map(displayOf)
  const commands = calls.slice(-3).map(call => `${call.tool} "${cut(call.command, 80)}"`)
  let body = `file-tools-only: in your last turn, shell commands changed files that no file tool wrote: ${shown.join(', ')}${commands.length > 0 ? ` (${commands.join(', ')})` : ''}. Those writes already happened. Check that the files are what you meant. From now on write files with ${face('write')} or ${face('edit')}: a shell command that writes a file is denied when the harness can read it, and recorded when it cannot.`
  if (paths.length > 10) body += ` ${paths.length - 10} more.`
  while ([...body].length > 600 && shown.length > 1) {
    shown.pop()
    body = `file-tools-only: in your last turn, shell commands changed files that no file tool wrote: ${shown.join(', ')}${commands.length > 0 ? ` (${commands.join(', ')})` : ''}. Those writes already happened. Check that the files are what you meant. From now on write files with ${face('write')} or ${face('edit')}: a shell command that writes a file is denied when the harness can read it, and recorded when it cannot.`
  }
  return cut(body, 600)
}

/** The display of one path: control characters out, as workspace-changes spells it. */
function displayOf(path: string): string {
  return path.replace(/[\p{C}]/gu, '?')
}

const cut = (text: string, limit: number): string => Array.from(text).slice(0, limit).join('')

/**
 * The workspace-change fallback over the composition's services; `write`
 * journals one record with the session's working directory (it never rejects
 * into the caller) and queues the correction the next step delivers.
 */
export function workspaceFallback(services: ServiceLookup, write: (record: LateRecord, cwd: string | undefined) => void, now: () => Date = () => new Date()): WorkspaceFallback {
  const turns = new Map<string, number>()
  const notes = new Map<string, Map<number, TurnNotes>>()
  const warn = dialectWarner('guard')
  const service = (): WorkspaceChangesService | undefined => {
    const value = record(typeof services.get === 'function' ? services.get('workspaceChanges') : undefined)
    return typeof value?.summary === 'function' ? value as unknown as WorkspaceChangesService : undefined
  }

  const compare = (sessionId: string, seq: number, turn: number, noted: TurnNotes): void => {
    const summary = service()?.summary(sessionId, seq)
    if (summary === undefined) return
    const paths = summary.files.filter(file => {
      const path = normalizePath(resolve(summary.cwd, file.path))
      return !noted.targets.has(path) && !under(path, noted.known)
    }).map(file => file.display)
    if (paths.length === 0) return
    const unlisted = summary.total - summary.files.length
    // The correction names the tools as the agent sees them (design §3.4): the turn's own route decides.
    const face = dialectNames(dialectService(services, warn), noted.agent, noted.origin?.route, warn) ?? ((name: string): string => name)
    const correction = correctionBody(paths, noted.calls, face)
    write({
      at: now().toISOString(),
      rule: 'file-tools-only',
      mode: 'late',
      via: 'turn-end',
      sessionId,
      ...(noted.agentId === undefined ? {} : { agentId: noted.agentId }),
      ...noted.origin,
      turn,
      paths,
      ...(unlisted > 0 ? { unlisted } : {}),
      calls: noted.calls,
    }, noted.cwd)
    // At most eight queued per session, the oldest leaving first (design §3.4); the record is already in the journal.
    const queue = pending.get(sessionId) ?? []
    queue.push(correction)
    if (queue.length > CORRECTION_LIMIT) queue.shift()
    pending.set(sessionId, queue)
  }

  return {
    observe(payload, origin) {
      const session = payload.agent?.session
      const turn = session === undefined ? undefined : turns.get(session.id)
      if (session === undefined || turn === undefined) return
      const byTurn = notes.get(session.id) ?? new Map<number, TurnNotes>()
      notes.set(session.id, byTurn)
      const noted = byTurn.get(turn) ?? { targets: new Set<string>(), known: new Set<string>(), calls: [] }
      byTurn.set(turn, noted)
      if (payload.agent !== undefined) {
        noted.agent = payload.agent
        noted.agentId = payload.agent.id
      }
      if (noted.cwd === undefined) {
        const header = session.header.cwd
        if (typeof header === 'string' && header.length > 0) noted.cwd = header
      }
      // A graph tool writes node files through the engine, which keeps the history: a known writer.
      const graph = graphService(services)
      if (graph?.isGraphTool(payload.name) === true) {
        const dir = graph.dirFor(session.header.cwd)
        if (dir !== undefined) noted.known.add(normalizePath(resolve(dir)))
        return
      }
      // Judged by the DSH native the call runs; the record keeps the name the model called.
      const call: ToolCall = { name: toNativeTool(dialectService(services, warn), payload.name, warn), arguments: (payload.arguments ?? {}) as JsonValue }
      const field = FILE_TOOLS.get(call.name)
      const target = field === undefined ? undefined : record(payload.arguments)?.[field]
      if (typeof target === 'string' && target.length > 0) {
        noted.targets.add(normalizePath(resolve(session.header.cwd ?? '', target)))
        return
      }
      const shell = shellCommandOf(call)
      if (shell === undefined) return
      noted.calls.push({ tool: payload.name, command: shell.command })
      noted.origin = originOf(noted.origin?.scope === 'dialect' || origin.scope === 'dialect', origin.route)
    },
    event(session, event) {
      const data = record(event.data)
      const turn = typeof data?.turn === 'number' ? data.turn : undefined
      if (turn === undefined) return
      if (event.type === 'turn/start') {
        turns.delete(session.id)
        turns.set(session.id, turn)
        if (turns.size > SESSION_LIMIT) {
          const oldest = turns.keys().next().value as string
          turns.delete(oldest)
          notes.delete(oldest)
        }
        const byTurn = notes.get(session.id)
        for (const noted of byTurn?.keys() ?? []) if (noted <= turn - TURN_SPAN) byTurn?.delete(noted)
        return
      }
      if (event.type !== 'workspace/changes') return
      const noted = notes.get(session.id)?.get(turn)
      notes.get(session.id)?.delete(turn)
      if (noted === undefined || noted.calls.length === 0) return
      // The recorder stores the summary right after its append returns, and
      // session observers run inside that append: read it a microtask later.
      const sessionId = session.id
      queueMicrotask(() => {
        try {
          compare(sessionId, event.seq, turn, noted)
        }
        catch (error) {
          console.warn(`dsh-glm-hourness/guard: workspace-change fallback failed: ${(error as Error).message}`)
        }
      })
    },
    disposed(session) {
      turns.delete(session.id)
      notes.delete(session.id)
    },
    available: () => service() !== undefined,
  }
}
