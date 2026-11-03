/**
 * The buttons of the /wish entry, shared by the opening card and the
 * popover under the composer. "写一句你想做的" writes "/wish " into an empty
 * input through the standard prop inputActions and puts the caret behind
 * it; with text in the input it changes nothing and says so; without the
 * prop it sends no command and shows what to type with a copy button.
 * "接着推进现有项目" and the exit button send /wish and /wish off through
 * remote.commands.execute: each is a click of the human, who is the only
 * one able to send a slash command. All wording is in ./model.ts.
 */
import { Button, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import { useState, type ReactElement } from 'react'
import type { InputActions, RemoteRoot } from '../dsh.ts'
import { WISH_COMMAND, WISH_DRAFT, WISH_OFF_COMMAND, WISH_TEXT, cardActions, draftPlan, outcomeOf } from './model.ts'

export interface EntryServices {
  readonly remote: RemoteRoot
  readonly sessionId: string
  readonly inputActions: InputActions | undefined
  /** The draft in the session's input; undefined when the input source is not handed to the component. */
  readonly draft: string | undefined
}

export interface ButtonsProps {
  readonly services: EntryServices
  /** The enter buttons (start, and resume with an open goal), or the exit button. */
  readonly enter: boolean
  readonly openGoal: boolean
  /** The native Button size: md on the opening card (the approval card's action row), sm in the popover. */
  readonly size?: 'sm' | 'md'
  /** Called after the draft was written: the popover closes and the caret is in the input. */
  readonly onDrafted?: () => void
}

interface Note {
  readonly tone: 'info' | 'ok' | 'error'
  readonly text: string
}

/**
 * Put the caret behind the text of the session's input. The editor is a
 * Lexical contenteditable marked data-composer-input; a bare focus lands the
 * caret at the start (dsh-client-ui-conversation SessionInputShell.focus),
 * which would put what the human types before "/wish ".
 */
function focusComposerEnd(sessionId: string): void {
  window.requestAnimationFrame(() => {
    const scope = [...document.querySelectorAll('[data-conversation-session]')].find(element => element.getAttribute('data-conversation-session') === sessionId)
    const editor = (scope ?? document).querySelector<HTMLElement>('[data-composer-input]')
    if (editor === null) return
    editor.focus()
    const selection = window.getSelection()
    if (selection === null) return
    selection.selectAllChildren(editor)
    selection.collapseToEnd()
  })
}

export function WishButtons({ services, enter, openGoal, size = 'sm', onDrafted }: ButtonsProps): ReactElement {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note | null>(null)
  const [fallback, setFallback] = useState(false)

  const run = (line: string): void => {
    setBusy(true)
    setNote(null)
    services.remote.commands.execute(services.sessionId, line, []).then(
      outcomeOf,
      (error: unknown) => outcomeOf({ ok: false, error: { message: error instanceof Error ? error.message : String(error) } }),
    ).then(outcome => {
      setBusy(false)
      setNote({ tone: outcome.ok ? 'ok' : 'error', text: outcome.text })
    }, () => { setBusy(false) })
  }

  const start = (): void => {
    const plan = draftPlan({ inputActions: services.inputActions !== undefined, draft: services.draft })
    setFallback(plan === 'copy')
    if (plan === 'copy') {
      setNote(null)
      return
    }
    if (plan === 'keep') {
      setNote({ tone: 'info', text: WISH_TEXT.draftBusy })
      return
    }
    services.inputActions?.setDraft(WISH_DRAFT)
    setNote(null)
    focusComposerEnd(services.sessionId)
    onDrafted?.()
  }

  const copy = (): void => {
    void writeClipboard(WISH_COMMAND).then(ok => {
      setNote(ok ? { tone: 'ok', text: WISH_TEXT.copied } : { tone: 'error', text: WISH_TEXT.copyFailed })
    })
  }

  return (
    <div className="hw-buttons">
      <div className="hw-actions">
        {enter
          ? cardActions(openGoal).map(action => action === 'start'
              ? <Button key={action} variant="primary" size={size} disabled={busy} onClick={start}>{WISH_TEXT.start}</Button>
              : <Button key={action} variant="outline" size={size} disabled={busy} onClick={() => { run(WISH_COMMAND) }}>{WISH_TEXT.resume}</Button>)
          : <Button variant="outline" size={size} disabled={busy} onClick={() => { run(WISH_OFF_COMMAND) }}>{WISH_TEXT.exit}</Button>}
      </div>
      {fallback
        ? (
            <div className="hw-fallback">
              <span>{WISH_TEXT.copyHelp}</span>
              <Button variant="outline" size={size} onClick={copy}>{WISH_TEXT.copy}</Button>
            </div>
          )
        : null}
      {note === null ? null : <div className={`hw-note hw-note-${note.tone}`} role="status">{note.text}</div>}
    </div>
  )
}
