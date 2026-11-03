/**
 * What the /wish entry reads about its session, as React hooks over the DSH
 * client services: whether the session has not started, the draft in its
 * input, whether /wish is among its commands. The rules are in ./model.ts.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import type { RemoteRoot, SessionsClient, UseInput, UseSession } from '../dsh.ts'
import { afterRead, isBlankSession, shouldReadCommands, type CommandsRead, type SessionFlags } from './model.ts'

/**
 * Whether the session has not started. The standard session prop is a
 * hook the slot hands to its components; when this build's slot does not
 * hand it to a third-party component the session list's `blank` answers.
 * The prop is present or missing for the life of a mounted component, so
 * the hooks it stands for are called in the same order on every render.
 */
export function useBlank(sessions: SessionsClient, sessionId: string, useSession: UseSession | undefined): boolean {
  const subscribe = useCallback((listener: () => void) => sessions.list.subscribe(listener), [sessions])
  const summaryBlank = useSyncExternalStore(subscribe, () => sessions.list.getSnapshot().byId[sessionId]?.blank)
  const flags: SessionFlags | undefined = useSession === undefined
    ? undefined
    : {
        blank: useSession(snapshot => snapshot?.blank),
        promptAttempted: useSession(snapshot => snapshot?.promptAttempted),
        running: useSession(snapshot => snapshot?.running),
      }
  return isBlankSession(flags, summaryBlank)
}

/** The draft in the session's input, or undefined when the input source is not handed to the component (same stability as useBlank's prop). */
export function useDraft(useInput: UseInput | undefined): string | undefined {
  return useInput === undefined ? undefined : useInput(input => input?.draft)
}

/** The command lists read in this app run, by session: one read each, shared by every entry of the session. */
const reads = new Map<string, CommandsRead>()
const reading = new Set<string>()
const readListeners = new Set<() => void>()

function keepRead(sessionId: string, names: readonly string[] | undefined): void {
  reads.set(sessionId, afterRead(reads.get(sessionId), names))
  reading.delete(sessionId)
  for (const listener of readListeners) listener()
}

function subscribeReads(listener: () => void): () => void {
  readListeners.add(listener)
  return () => { readListeners.delete(listener) }
}

/**
 * Whether /wish is among the session's commands (remote.commands.list; the
 * list needs a retained, open session). Read once per session; a failed
 * read is read once more after the session list changed. Undefined until a
 * read has finished.
 */
export function useWishRegistered(remote: RemoteRoot, sessions: SessionsClient, sessionId: string): boolean | undefined {
  const read = useSyncExternalStore(subscribeReads, () => reads.get(sessionId))
  const subscribe = useCallback((listener: () => void) => sessions.list.subscribe(listener), [sessions])
  const snapshot = useSyncExternalStore(subscribe, () => sessions.list.getSnapshot())
  const seen = useRef(snapshot)
  useEffect(() => {
    const changed = seen.current !== snapshot
    seen.current = snapshot
    if (reading.has(sessionId) || !shouldReadCommands(read, changed)) return
    reading.add(sessionId)
    remote.commands.list(sessionId).then(
      result => { keepRead(sessionId, result.ok ? result.value.map(command => command.name) : undefined) },
      () => { keepRead(sessionId, undefined) },
    )
  }, [remote, sessionId, snapshot, read])
  return read?.state === 'done' ? read.registered : undefined
}
