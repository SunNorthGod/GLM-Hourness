/**
 * Where the main agent's conversation is (plain-ui 1.3 §4.9), the React
 * half: one hook reads the graph-panel row's hournessProject pointer,
 * reads the holder record through remote.workspaceFiles, and says which
 * of the three results holds - this session, another session (a button
 * opens it through uiWorkspace), or none ("还没有主 Agent"). When the
 * record cannot be read the sessions list is the fallback (main-chat.ts
 * mainChatOf). The same result drives the「现在」line's subject (mainHere:
 * the record names this session, or the fallback found it). The panel
 * computes it once; every view reads it from the context, never
 * re-deriving it.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from 'react'
import { mainAgentActive } from '../../../src/graph/main-agent.ts'
import { holderRecordOf, type HolderRecord } from '../../../src/shared/holder-record.ts'
import { cwdKeyOf, mainChatOf, recordReads, type HolderReading, type MainChat } from './main-chat.ts'
import type { SessionsClient, WorkspaceFilesRemote } from '../dsh.ts'

const isWindows = (): boolean => typeof navigator === 'object' && /windows/i.test(navigator.userAgent)

/** Read failures reach the console once per reason (§8.1), not once per poll. */
const warned = new Set<string>()
const warnOnce = (reason: string): void => {
  if (warned.has(reason)) return
  warned.add(reason)
  console.warn(`glm-hourness: ${reason}`)
}

interface MainAgentDeps {
  readonly sessions: SessionsClient
  readonly files: WorkspaceFilesRemote
  /** uiWorkspace.openSession; absent when the client host did not inject the service. */
  readonly openSession: ((sessionId: string) => void) | undefined
}

interface MainChatService {
  /** Undefined until the first read lands, or while the projection has not arrived. */
  readonly chat: MainChat | undefined
  /** Open the main agent's conversation; a no-op with a warning when there is nowhere to go. */
  readonly open: () => void
}

/**
 * The result and the jump, read on mount, when the panel turns visible,
 * and every 30 seconds while it is visible (plain-ui 1.3 §4.9 step 2,
 * main-chat.ts recordReads).
 */
export function useMainAgent(sessionId: string, deps: MainAgentDeps, visible: boolean): MainChatService {
  const subscribe = useCallback((listener: () => void) => deps.sessions.list.subscribe(listener), [deps.sessions])
  const snapshot = useSyncExternalStore(subscribe, () => deps.sessions.list.getSnapshot())
  const arrived = snapshot.projectionsBySession[sessionId] !== undefined
  const project = snapshot.projectionsBySession[sessionId]?.values.hournessProject
  const holderFile = project?.holderFile ?? null
  const [reading, setReading] = useState<HolderReading | undefined>(undefined)
  /** The reads of the current record path, told when the panel turns visible or hidden. */
  const reads = useRef<ReturnType<typeof recordReads> | undefined>(undefined)
  const visibleNow = useRef(visible)
  visibleNow.current = visible

  // The record read; a not-found is a readable "there is none", anything else is unreadable.
  useEffect(() => {
    if (holderFile === null) return undefined
    let live = true
    const read = (): void => {
      void deps.files.readBytes(sessionId, holderFile, {}).then(result => {
        if (!live) return
        if (!result.ok) {
          if (result.error.code === 'workspace-file/not-found') setReading({ kind: 'absent' })
          else {
            warnOnce(`主 Agent 记录读不出来：${result.error.code} ${result.error.message}`)
            setReading({ kind: 'unreadable', reason: result.error.message })
          }
          return
        }
        let record: HolderRecord | undefined
        try {
          record = holderRecordOf(JSON.parse(new TextDecoder().decode(result.value.data)))
        }
        catch (error) {
          record = undefined
          warnOnce(`主 Agent 记录读不出来：${error instanceof Error ? error.message : String(error)}`)
        }
        setReading(record === undefined ? { kind: 'unreadable', reason: '记录的内容不是主 Agent 记录' } : { kind: 'held', sessionId: record.sessionId })
      }).catch((error: unknown) => {
        if (!live) return
        warnOnce(`主 Agent 记录读不出来：${error instanceof Error ? error.message : String(error)}`)
        setReading({ kind: 'unreadable', reason: error instanceof Error ? error.message : String(error) })
      })
    }
    const every = (ms: number, task: () => void): (() => void) => {
      const timer = setInterval(task, ms)
      return () => { clearInterval(timer) }
    }
    reads.current = recordReads(read, visibleNow.current, every)
    return () => {
      live = false
      reads.current?.stop()
      reads.current = undefined
    }
  }, [sessionId, holderFile, deps.files])
  useEffect(() => { reads.current?.setVisible(visible) }, [visible])

  // The fallback candidates: sessions of this working directory in main-agent mode (§4.9 step 4).
  const candidates = useMemo(() => {
    const own = snapshot.byId[sessionId]?.cwd
    if (own === undefined) return []
    const windows = isWindows()
    const key = cwdKeyOf(own, windows)
    return Object.entries(snapshot.byId).flatMap(([id, summary]) =>
      mainAgentActive(summary?.projectionValues) && summary?.cwd !== undefined && cwdKeyOf(summary.cwd, windows) === key ? [id] : [])
  }, [snapshot, sessionId])

  const chat = useMemo<MainChat | undefined>(() => {
    if (holderFile !== null) return reading === undefined ? undefined : mainChatOf(reading, sessionId, candidates)
    if (!arrived) return undefined
    if (project === undefined) return mainChatOf({ kind: 'unreadable', reason: '位置投影不在（graph-panel 行没开？）' }, sessionId, candidates)
    return mainChatOf({ kind: 'unreadable', reason: project.reason ?? '位置投影没有给出路径' }, sessionId, candidates)
  }, [holderFile, arrived, project, reading, sessionId, candidates])

  const open = useCallback(() => {
    if (chat?.kind !== 'there') return
    if (deps.openSession === undefined) {
      console.warn('glm-hourness: uiWorkspace is missing, cannot open the main agent conversation')
      return
    }
    deps.openSession(chat.sessionId)
  }, [chat, deps.openSession])
  return { chat, open }
}

const MainChatContext = createContext<MainChatService | null>(null)
export { MainChatContext }

/** The panel's one result; views read it, they do not re-derive it (plain-ui 1.3 §4.9). */
function useMainChat(): MainChatService {
  const service = useContext(MainChatContext)
  if (service === null) throw new Error('graph panel: the main chat context is missing')
  return service
}

/** Where to answer, as one line: the three results of §4.9, rendered. */
export function MainChatLine(): ReactElement | null {
  const { chat, open } = useMainChat()
  if (chat === undefined) return null
  if (chat.kind === 'here') return <div className="glmg-notice">在这个对话里回话</div>
  if (chat.kind === 'there') {
    return (
      <div className="glmg-notice">
        <button type="button" className="glmg-more" onClick={open}>去主 Agent 的对话回话 ›</button>
        {chat.guessed ? <div className="glmg-meta">按会话状态认的</div> : null}
      </div>
    )
  }
  if (chat.kind === 'absent') return <div className="glmg-notice">还没有主 Agent：在输入框打 /wish</div>
  return <div className="glmg-notice">找不到主 Agent 的对话：{chat.reason}</div>
}
