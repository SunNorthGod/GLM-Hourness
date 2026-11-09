/**
 * 讲细点 of an entry that may run a script, on the rules board and the loop
 * board (rules design 0.10 §9.1, loop board design 0.6 §8.2 item 5): the
 * entry's lines, and, for a script, its text read each time the person opens
 * it (./script-text.ts); closed, nothing is read. Only reading: the one
 * thing to do here is to open it. The page puts where to read into
 * ScriptReadContext; without it the text cannot be read and the line says so.
 */
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactElement, type SyntheticEvent } from 'react'
import type { WorkspaceFilesRemote } from '../dsh.ts'
import { projectRootOfView, readScriptText, scriptTextHead, type ScriptText } from './script-text.ts'

/** Where a page reads its scripts: the session's files and the board's view.json, whose directory names the project root. */
export interface ScriptRead {
  readonly files: WorkspaceFilesRemote
  readonly sessionId: string
  readonly viewFile: string
}

export const ScriptReadContext = createContext<ScriptRead | null>(null)

const TEXT_STYLE: CSSProperties = { margin: '4px 0 0', padding: '6px 8px', maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', borderRadius: 8, background: 'var(--g-layer)', fontSize: 11 }

/** 讲细点 over the lines and, when `file` is a script's path from the project root, its text; nothing when there is neither. */
export function ScriptDetails({ lines, file }: { readonly lines: readonly string[], readonly file: string | null }): ReactElement | null {
  const read = useContext(ScriptReadContext)
  const [shown, setShown] = useState<ScriptText | null>(null)
  const reading = useRef<AbortController | null>(null)
  useEffect(() => () => { reading.current?.abort() }, [])
  if (lines.length === 0 && file === null) return null
  const onToggle = (event: SyntheticEvent<HTMLDetailsElement>): void => {
    if (!event.currentTarget.open || file === null) return
    reading.current?.abort()
    const project = read === null ? null : projectRootOfView(read.viewFile)
    if (read === null || project === null) {
      setShown({ kind: 'no-root' })
      return
    }
    const controller = new AbortController()
    reading.current = controller
    setShown({ kind: 'reading' })
    void readScriptText(read.files, read.sessionId, project, file, controller.signal)
      .catch((error: unknown): ScriptText => ({ kind: 'failed', message: error instanceof Error ? error.message : String(error) }))
      .then((result) => {
        if (!controller.signal.aborted) setShown(result)
      })
  }
  return (
    <details onToggle={onToggle}>
      <summary>讲细点</summary>
      {lines.map((line, index) => <div key={`${index}:${line}`}>{line}</div>)}
      {file === null || shown === null ? null : <div>{scriptTextHead(shown, file)}</div>}
      {shown?.kind === 'text' ? <pre style={TEXT_STYLE}>{shown.text}</pre> : null}
    </details>
  )
}
