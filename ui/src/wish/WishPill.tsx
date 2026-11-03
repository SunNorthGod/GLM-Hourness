/**
 * The button under the composer (M3 addendum §2.6, mockup-wish.svg ② ④ ⑤):
 * "交给主 Agent" in an ordinary session of a workspace with a project graph
 * (when /wish is registered), "主 Agent" in the main agent's session. It
 * opens a small popover with the explanation, the stronger-model line and
 * the buttons of the card (./Buttons.tsx), or, in the main agent's session,
 * the way out. On a row narrower than NARROW_BELOW_PX the first label is
 * "/wish". It is quiet: no pop-up, no flicker, no badge. All wording is in
 * ./model.ts.
 */
import { Tag, useAnchoredPosition, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { mainAgentActive } from '../../../src/graph/main-agent.ts'
import type { ClientContext, RemoteRoot, SessionSlotProps, SessionsClient } from '../dsh.ts'
import { useGraph, useSessionValues } from '../flow/session.ts'
import { RenderGuard, WarnIcon } from '../flow/shared.tsx'
import { WishButtons, type EntryServices } from './Buttons.tsx'
import { useDraft, useWishRegistered } from './hooks.ts'
import { ENTRY_ID, PILL_ORDER, WISH_TEXT, hasGraph, hasOpenGoal, pillLabel, pillShown } from './model.ts'
import { WISH_CSS } from './styles.ts'

/** The width of the composer's dock row the button sits in, followed while it is shown; undefined before it is measured. */
function useRowWidth(anchor: { readonly current: Element | null }, shown: boolean): number | undefined {
  const [width, setWidth] = useState<number | undefined>(undefined)
  useEffect(() => {
    const row = shown ? anchor.current?.closest('[data-composer-dock]') : null
    if (row === null || row === undefined) return undefined
    setWidth(row.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => { setWidth(row.getBoundingClientRect().width) })
    observer.observe(row)
    return () => { observer.disconnect() }
  }, [anchor, shown])
  return width
}

function makePill(remote: RemoteRoot, sessions: SessionsClient): (props: SessionSlotProps) => ReactElement {
  function Pill({ sessionId, useInput, inputActions }: SessionSlotProps): ReactElement | null {
    const values = useSessionValues(sessions, sessionId)
    const main = mainAgentActive(values)
    const wishRegistered = useWishRegistered(remote, sessions, sessionId)
    const graph = useGraph(remote, sessionId, true)
    const draft = useDraft(useInput)
    const shown = pillShown({ main, graph: hasGraph(graph), wishRegistered: wishRegistered === true })
    const [open, setOpen] = useState(false)
    const anchorRef = useRef<HTMLSpanElement>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)
    const rowWidth = useRowWidth(anchorRef, shown)
    const position = useAnchoredPosition({ open, anchorRef, panelRef, side: 'top', gap: 8, margin: 12 })
    useDismissOnOutsidePointer(anchorRef, open, setOpen, panelRef)
    const services: EntryServices = useMemo(() => ({ remote, sessionId, inputActions, draft }), [sessionId, inputActions, draft])

    // Escape closes the popover and gives the focus back to the button.
    useEffect(() => {
      if (!open) return undefined
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape') return
        setOpen(false)
        triggerRef.current?.focus()
      }
      document.addEventListener('keydown', onKeyDown)
      return () => { document.removeEventListener('keydown', onKeyDown) }
    }, [open])

    // The popover is hidden while it is measured; the focus moves into it once it is placed.
    const placed = position !== null
    useEffect(() => {
      if (open && placed) panelRef.current?.focus()
    }, [open, placed])

    if (!shown) return null
    const openGoal = graph?.status === 'ready' && hasOpenGoal(graph.graph)
    const label = pillLabel(main, rowWidth)
    const popover = (
      <div
        ref={panelRef}
        className="hw-dialog"
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        style={placed ? position : { visibility: 'hidden', left: 0, top: 0 }}
      >
        <style>{WISH_CSS}</style>
        <p>{main ? WISH_TEXT.popoverMain : WISH_TEXT.popoverOrdinary}</p>
        {main ? null : <p>{WISH_TEXT.commandHint}</p>}
        {main ? null : <Tag tone="warning" className="hw-strong"><WarnIcon />{WISH_TEXT.strongModel}</Tag>}
        <WishButtons services={services} enter={!main} openGoal={openGoal} onDrafted={() => { setOpen(false) }} />
      </div>
    )
    return (
      <span className="hw-anchor" ref={anchorRef}>
        <style>{WISH_CSS}</style>
        <button
          ref={triggerRef}
          type="button"
          className={main ? 'hw-pill hw-pill-main' : 'hw-pill'}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => { setOpen(!open) }}
        >
          {label}
        </button>
        {open ? createPortal(popover, document.body) : null}
      </span>
    )
  }
  return function WishPill(props: SessionSlotProps): ReactElement {
    return <RenderGuard entry="wish button"><Pill {...props} /></RenderGuard>
  }
}

/** Register the button in the row under the composer, behind DSH's statistics (0, 1) and the GLM button (150). */
export function installWishPill(ctx: ClientContext): void {
  const WishPill = makePill(ctx.remote, ctx.sessions)
  ctx.effect(() => ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register<{ readonly sessionId: string }>({
    name: 'conversation.composer.dock',
    id: ENTRY_ID,
    order: PILL_ORDER,
    label: WISH_TEXT.slotLabel,
    inject: sessionId => ({ sessionId }),
  }, WishPill as never)), 'hourness-ui: wish button')
}
