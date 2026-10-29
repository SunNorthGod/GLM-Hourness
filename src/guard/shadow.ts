/**
 * Workspace-change fallback for file-tools-only, in shadow mode
 * (docs/ORCHESTRATION.md §6.4, §6.5): it records, it never blocks.
 *
 * dsh-workspace-changes summarizes the files each top-level turn changed
 * (git working-tree snapshots at turn start and turn end plus whole-file
 * captures around file-tool edits) and announces each summary with a
 * `workspace/changes` session event carrying the turn. The guard notes, per
 * session and turn, the targets of the file tools and the shell calls it let
 * through. When a turn that ran shell calls changed files no file tool of
 * that turn targeted, one shadow record goes to the violation journal: the
 * shell probably wrote them in a way the quote-aware reader does not see
 * (a .NET call, `cmd /c`, an interpreter one-liner). The records measure
 * what the reader misses before any new detection is enforced. Files under
 * the project graph count as known in a turn that ran a graph tool (the
 * graph row's service, src/graph/service.ts): the engine wrote them.
 * The price is a blind spot: a shell write into the graph in that same
 * turn is not recorded (graph-files-only still denies the ones it sees).
 *
 * Limits (dsh-workspace-changes README): only top-level sessions with a
 * working directory are summarized; outside a git repository, or without
 * git, the summary lists file-tool edits only, so shell writes are absent;
 * ignored files are covered only when a file tool touched them; edits the
 * user makes during a turn count for that turn.
 */
import { resolve } from 'node:path'
import { normalizePath, shellCommandOf, type ToolCall } from './rules.ts'
import { dialectService, dialectWarner, toNativeTool } from '../shared/dialect.ts'
import type { JsonValue } from '../shared/json.ts'
import type { ServiceLookup, SessionEventLike, SessionLike, ToolExecutionPayload, WorkspaceChangesService } from '../shared/dsh-min.ts'
import { graphService } from '../graph/service.ts'

/** One shadow record (JSONL line in the violation journal). */
export interface ShadowRecord {
  readonly at: string
  readonly rule: 'file-tools-only'
  readonly mode: 'shadow'
  readonly sessionId: string
  readonly agentId?: string | undefined
  readonly turn: number
  /** Changed files no file tool of the turn targeted, as workspace-changes displays them. */
  readonly paths: readonly string[]
  /** Changed files the summary did not list (beyond the plugin's `maxFiles`). */
  readonly unlisted?: number | undefined
  /** The shell calls the guard let through in that turn. */
  readonly calls: ReadonlyArray<{ readonly tool: string, readonly command: string }>
}

export interface ShadowFallback {
  /** A root tool call that is about to run. */
  observe(payload: ToolExecutionPayload): void
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
  agentId?: string
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
 * The shadow fallback over the composition's services; `write` journals one
 * record (it never rejects into the caller).
 */
export function shadowFallback(services: ServiceLookup, write: (record: ShadowRecord) => void, now: () => Date = () => new Date()): ShadowFallback {
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
    write({
      at: now().toISOString(),
      rule: 'file-tools-only',
      mode: 'shadow',
      sessionId,
      ...(noted.agentId === undefined ? {} : { agentId: noted.agentId }),
      turn,
      paths,
      ...(unlisted > 0 ? { unlisted } : {}),
      calls: noted.calls,
    })
  }

  return {
    observe(payload) {
      const session = payload.agent?.session
      const turn = session === undefined ? undefined : turns.get(session.id)
      if (session === undefined || turn === undefined) return
      const byTurn = notes.get(session.id) ?? new Map<number, TurnNotes>()
      notes.set(session.id, byTurn)
      const noted = byTurn.get(turn) ?? { targets: new Set<string>(), known: new Set<string>(), calls: [] }
      byTurn.set(turn, noted)
      if (payload.agent !== undefined) noted.agentId = payload.agent.id
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
      if (shell !== undefined) noted.calls.push({ tool: payload.name, command: shell.command })
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
