/**
 * What the flow bar and the /wish entry read about their session, as React
 * hooks over the DSH client services: the session's projection values, the
 * workspace's graph. The pure rules are in ./model.ts and ../wish/model.ts.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ProjectionValues, RemoteRoot, SessionsClient } from '../dsh.ts'
import { holdSource, type GraphSnapshot, type GraphSource } from '../graph/source.ts'

/**
 * The session's projection values from the client session list, which
 * follows every projection change of every live session; a session with no
 * values yet is read once through refreshProjections (same as the panel's
 * useAgents).
 */
export function useSessionValues(sessions: SessionsClient, sessionId: string): ProjectionValues | undefined {
  const subscribe = useCallback((listener: () => void) => sessions.list.subscribe(listener), [sessions])
  const projections = useSyncExternalStore(subscribe, () => sessions.list.getSnapshot().projectionsBySession)
  const asked = useRef(new Set<string>())
  useEffect(() => {
    if (projections[sessionId] !== undefined || asked.current.has(sessionId)) return
    asked.current.add(sessionId)
    void sessions.refreshProjections(sessionId).catch(() => {})
  }, [projections, sessionId, sessions])
  return projections[sessionId]?.values
}

/**
 * The workspace graph of the session, shared with the panel (one source per
 * session, released with the last holder); undefined while not wanted or
 * before the source is held.
 */
export function useGraph(remote: RemoteRoot, sessionId: string, wanted: boolean): GraphSnapshot | undefined {
  const [source, setSource] = useState<GraphSource | undefined>(undefined)
  useEffect(() => {
    if (!wanted) {
      setSource(undefined)
      return undefined
    }
    const held = holdSource(remote, sessionId)
    setSource(held.source)
    return () => { held.release() }
  }, [remote, sessionId, wanted])
  const subscribe = useCallback((listener: () => void) => (source === undefined ? () => {} : source.subscribe(listener)), [source])
  return useSyncExternalStore(subscribe, () => source?.getSnapshot())
}
