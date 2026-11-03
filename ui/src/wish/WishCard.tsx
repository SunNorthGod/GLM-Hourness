/**
 * The /wish card on the opening screen of a new session (M3 addendum §2.6,
 * mockup-wish.svg ①): a dock entry between the workspace row and the input,
 * the width of the input. Each render decides by cardMode (./model.ts):
 * the full card for a blank session that is not the main agent's, in a
 * workspace with a project graph and /wish registered; one line with the
 * exit button for a blank session that already is the main agent (a bare
 * /wish opens no turn, so the screen may stay); nothing otherwise. The
 * session is "blank" until its first message, so the card is gone from
 * then on and the button under the composer (WishPill) takes over.
 */
import { useMemo, type ReactElement } from 'react'
import { mainAgentActive } from '../../../src/graph/main-agent.ts'
import type { ClientContext, RemoteRoot, SessionSlotProps, SessionsClient } from '../dsh.ts'
import { useGraph, useSessionValues } from '../flow/session.ts'
import { RenderGuard, WarnIcon } from '../flow/shared.tsx'
import { WishButtons, type EntryServices } from './Buttons.tsx'
import { useBlank, useDraft, useWishRegistered } from './hooks.ts'
import { CARD_ORDER, ENTRY_ID, WISH_TEXT, cardMode, fullCardBlocks, hasGraph, hasOpenGoal, type CardBlock } from './model.ts'
import { WISH_CSS } from './styles.ts'

/**
 * Whether ui/src/guide/FirstVisitLine.tsx (plain-ui 0.7 §6.5) is part of this
 * build. It is not: the panel design's guide step lands it. That step sets
 * this to true and renders the component for the 'first-visit-line' block
 * below; the block then closes the full card, and the component decides by
 * itself whether it shows.
 */
const FIRST_VISIT_LINE = false

function makeCard(remote: RemoteRoot, sessions: SessionsClient): (props: SessionSlotProps) => ReactElement {
  function Card({ sessionId, useSession, useInput, inputActions }: SessionSlotProps): ReactElement | null {
    const values = useSessionValues(sessions, sessionId)
    const main = mainAgentActive(values)
    const blank = useBlank(sessions, sessionId, useSession)
    const draft = useDraft(useInput)
    const wishRegistered = useWishRegistered(remote, sessions, sessionId)
    const graph = useGraph(remote, sessionId, blank)
    const mode = cardMode({ blank, main, graph: hasGraph(graph), wishRegistered: wishRegistered === true })
    const services: EntryServices = useMemo(() => ({ remote, sessionId, inputActions, draft }), [sessionId, inputActions, draft])
    if (mode === null) return null
    if (mode === 'exit') {
      return (
        <div className="hw-card hw-line" role="region" aria-label={WISH_TEXT.alreadyMain}>
          <style>{WISH_CSS}</style>
          <span>{WISH_TEXT.alreadyMain}</span>
          <WishButtons services={services} enter={false} openGoal={false} />
        </div>
      )
    }
    const openGoal = graph?.status === 'ready' && hasOpenGoal(graph.graph)
    const block = (name: CardBlock): ReactElement | null => {
      switch (name) {
        case 'title': return <h2 key={name} className="hw-title">{WISH_TEXT.cardTitle}</h2>
        case 'body': return <p key={name} className="hw-body">{WISH_TEXT.cardBody}</p>
        case 'actions': return <WishButtons key={name} services={services} enter openGoal={openGoal} />
        case 'strong': return <div key={name} className="hw-strong"><WarnIcon />{WISH_TEXT.strongModel}</div>
        case 'hint': return <div key={name} className="hw-hint">{WISH_TEXT.commandHint}</div>
        case 'first-visit-line': return null
      }
    }
    return (
      <div className="hw-card" role="region" aria-label={WISH_TEXT.cardTitle}>
        <style>{WISH_CSS}</style>
        {fullCardBlocks(FIRST_VISIT_LINE).map(block)}
      </div>
    )
  }
  return function WishCard(props: SessionSlotProps): ReactElement {
    return <RenderGuard entry="wish card"><Card {...props} /></RenderGuard>
  }
}

/** Register the card in the stack above the input, behind the flow bar. */
export function installWishCard(ctx: ClientContext): void {
  const WishCard = makeCard(ctx.remote, ctx.sessions)
  ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register<{ readonly sessionId: string }>({
    name: 'conversation.input.dock',
    id: ENTRY_ID,
    order: CARD_ORDER,
    label: WISH_TEXT.slotLabel,
    inject: sessionId => ({ sessionId }),
  }, WishCard as never)), 'hourness-ui: wish card')
}
