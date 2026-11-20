/**
 * Client data sources for the 「子智能体」 dashboard:
 * - watches `<project>/.llm/execute/live-board.json` via remote.workspaceFiles
 *   changes + stat fallback (reusing ViewFileSource / viewFileHolder)
 * - recursively discovers children/grandchildren via `sessions.list` and
 *   triggers `sessions.refreshProjections` once for cold descendants
 * - retains a single expanded subagent session via `sessions.retain` for live
 *   message streaming + tails its `.commands.jsonl` log on expand, releasing on collapse
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { RemoteRoot, RetainedSessionEventEntry, SessionReference, SessionsClient } from '../dsh.ts'
import { ViewFileSource, viewFileHolder, type ViewFileSpec } from '../graph/view-file.ts'
import { POLL_MS } from '../graph/watched-files.ts'
import {
  buildFleetModel,
  extractSessionPreview,
  parseCommandsTail,
  type CommandTailEntry,
  type ExecuteLiveBoard,
  type FleetFilter,
  type FleetModel,
  type SessionPreviewMessage,
} from './model.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Browser-safe parser/validator for `live-board.json`. */
function parseExecuteLiveBoard(text: string): ExecuteLiveBoard | undefined {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  }
  catch {
    return undefined
  }
  if (!isRecord(raw) || raw.version !== 1 || typeof raw.updatedAt !== 'number' || typeof raw.projectRoot !== 'string') {
    return undefined
  }
  if (!isRecord(raw.slots) || typeof raw.slots.max !== 'number' || typeof raw.slots.activeWorkers !== 'number' || typeof raw.slots.glmWorkers !== 'number') {
    return undefined
  }
  if (!isRecord(raw.drive) || !isRecord(raw.drive.counters) || typeof raw.drive.counters.idle !== 'number' || typeof raw.drive.counters.peak !== 'number') {
    return undefined
  }
  if (!Array.isArray(raw.dispatches) || !Array.isArray(raw.requests) || !Array.isArray(raw.jobs)) {
    return undefined
  }
  return raw as unknown as ExecuteLiveBoard
}

const BOARD_SPEC: ViewFileSpec<ExecuteLiveBoard, ExecuteLiveBoard | null> = {
  label: 'execute-live-board',
  parse: parseExecuteLiveBoard,
  build: board => board,
  failed: message => `实时总览读不出：${message}`,
  unreadable: 'live-board.json 格式无法解析，保留上一次状态',
}

class ExecuteBoardSource extends ViewFileSource<ExecuteLiveBoard, ExecuteLiveBoard | null> {
  constructor(remote: RemoteRoot, sessionId: string, viewFile: string, pollMs: number = POLL_MS) {
    super(remote, sessionId, viewFile, BOARD_SPEC, pollMs)
  }
}

const holdExecuteBoardSource = viewFileHolder(
  (remote, sessionId, viewFile) => new ExecuteBoardSource(remote, sessionId, viewFile),
)

export function useExecuteBoard(
  remote: RemoteRoot,
  sessions: SessionsClient,
  sessionId: string,
): {
  readonly board: ExecuteLiveBoard | null
  readonly projectRoot: string | null
  readonly boardPath: string | null
  readonly loading: boolean
  readonly missing: boolean
  readonly problem: string | null
} {
  const subscribeList = useCallback((listener: () => void) => sessions.list.subscribe(listener), [sessions])
  const boardProj = useSyncExternalStore(
    subscribeList,
    () => sessions.list.getSnapshot().projectionsBySession[sessionId]?.values.hournessExecuteBoard,
  )
  const boardPath = boardProj?.path ?? null
  const projectRoot = boardProj?.projectRoot ?? null

  const [source, setSource] = useState<ExecuteBoardSource | undefined>(undefined)
  useEffect(() => {
    if (boardPath === null) {
      setSource(undefined)
      return undefined
    }
    const held = holdExecuteBoardSource(remote, sessionId, boardPath)
    setSource(held.source)
    return () => { held.release() }
  }, [remote, sessionId, boardPath])

  const subscribeBoard = useCallback(
    (listener: () => void) => (source === undefined ? () => {} : source.subscribe(listener)),
    [source],
  )
  const snap = useSyncExternalStore(
    subscribeBoard,
    () => source?.getSnapshot(),
  )

  return {
    board: snap?.model ?? null,
    projectRoot,
    boardPath,
    loading: boardPath !== null && (snap?.loading ?? true),
    missing: snap?.missing ?? false,
    problem: snap?.problem ?? null,
  }
}

export function useSubagentFleet(
  remote: RemoteRoot,
  sessions: SessionsClient,
  sessionId: string,
  filter: FleetFilter,
): {
  readonly model: FleetModel
  readonly projectRoot: string | null
  readonly boardLoading: boolean
  readonly boardMissing: boolean
  readonly boardProblem: string | null
  readonly refreshAll: () => void
} {
  const subscribeList = useCallback((listener: () => void) => sessions.list.subscribe(listener), [sessions])
  const listSnapshot = useSyncExternalStore(subscribeList, () => sessions.list.getSnapshot())
  const { board, projectRoot, loading, missing, problem } = useExecuteBoard(remote, sessions, sessionId)

  const model = useMemo(() => buildFleetModel({
    rootSessionId: sessionId,
    projections: listSnapshot.projectionsBySession,
    byId: listSnapshot.byId,
    board,
    now: Date.now(),
    filter,
  }), [sessionId, listSnapshot, board, filter])

  // Ask once per newly discovered child/grandchild without cached projections.
  const asked = useRef(new Set<string>())
  useEffect(() => {
    const candidates = [sessionId, ...model.discoveredIds]
    for (const id of candidates) {
      if (listSnapshot.projectionsBySession[id] !== undefined || asked.current.has(id)) continue
      asked.current.add(id)
      void sessions.refreshProjections(id).catch(() => {})
    }
  }, [sessionId, model.discoveredIds, listSnapshot.projectionsBySession, sessions])

  const refreshAll = useCallback(() => {
    asked.current.clear()
    for (const id of [sessionId, ...model.discoveredIds]) {
      asked.current.add(id)
      void sessions.refreshProjections(id).catch(() => {})
    }
  }, [sessionId, model.discoveredIds, sessions])

  return {
    model,
    projectRoot,
    boardLoading: loading,
    boardMissing: missing,
    boardProblem: problem,
    refreshAll,
  }
}

export interface InspectorState {
  readonly preview: readonly SessionPreviewMessage[]
  readonly commands: readonly CommandTailEntry[]
  readonly loadingCommands: boolean
}

/**
 * Retain one subagent session on card expand for live streaming text / messages
 * and read its `.commands.jsonl` tail, releasing immediately on collapse/unmount.
 */
export function useRetainedInspector(
  remote: RemoteRoot,
  sessions: SessionsClient,
  params: {
    readonly rootSessionId: string
    readonly childId: string
    readonly parentId: string
    readonly mode: string
    readonly projectRoot: string | null
    readonly task: string | undefined
    readonly expanded: boolean
  },
): InspectorState {
  const { rootSessionId, childId, parentId, mode, projectRoot, task, expanded } = params
  const [entries, setEntries] = useState<readonly RetainedSessionEventEntry[]>([])
  const [commands, setCommands] = useState<readonly CommandTailEntry[]>([])
  const [loadingCommands, setLoadingCommands] = useState(false)

  useEffect(() => {
    if (!expanded || typeof sessions.retain !== 'function') {
      setEntries([])
      return undefined
    }
    const controller = new AbortController()
    let reference: SessionReference | undefined
    let unsubEvents: (() => void) | undefined
    let active = true

    const attach = (binding: NonNullable<SessionReference['binding']>) => {
      if (!active || binding.eventSource === undefined) return
      const source = binding.eventSource
      setEntries(source.getSnapshot().entries)
      unsubEvents?.()
      unsubEvents = source.subscribe(() => {
        if (active) setEntries(source.getSnapshot().entries)
      })
    }

    try {
      reference = sessions.retain(
        {
          kind: 'subagent',
          parentSessionId: parentId,
          childSessionId: childId,
          mode,
        },
        { source: 'hournessSubagentInspector', signal: controller.signal },
      )
      if (reference.binding !== undefined) {
        attach(reference.binding)
      }
      else if (reference.ready !== undefined) {
        void reference.ready.then((binding) => {
          attach(binding)
        }).catch(() => {})
      }
    }
    catch {
      // Unknown or disposed child session: fall back cleanly without crashing.
    }

    return () => {
      active = false
      controller.abort()
      unsubEvents?.()
      try {
        reference?.release()
      }
      catch {
        // ignore release error
      }
    }
  }, [expanded, sessions, childId, parentId, mode])

  useEffect(() => {
    if (!expanded || projectRoot === null || task === undefined) {
      setCommands([])
      setLoadingCommands(false)
      return undefined
    }
    const controller = new AbortController()
    const sep = projectRoot.includes('\\') ? '\\' : '/'
    const path = `${projectRoot}${sep}.llm${sep}execute${sep}tasks${sep}${task}${sep}${childId}.commands.jsonl`
    setLoadingCommands(true)
    void remote.workspaceFiles.readBytes(rootSessionId, path, {}, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return
        if (!res.ok) {
          setCommands([])
          return
        }
        const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(res.value.data)
        setCommands(parseCommandsTail(text))
      })
      .catch(() => {
        if (!controller.signal.aborted) setCommands([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCommands(false)
      })
    return () => { controller.abort() }
  }, [expanded, remote, rootSessionId, projectRoot, task, childId])

  const preview = useMemo(() => extractSessionPreview(entries), [entries])
  return { preview, commands, loadingCommands }
}
