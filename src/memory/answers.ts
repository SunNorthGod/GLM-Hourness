/**
 * What the memory row reads of a session's talk with the person (M5 design
 * §3.8): the session's talk state, whether the person said a quote in their
 * latest message (the `relay` of a preference, §3.2), whether they said the
 * words of an answer in their first message after a habit question
 * (memory_habit confirm and decline), and how many matters were put to them
 * since their last message (the per-reply cap of questions, §3.8.1).
 *
 * The talk state is the `hournessTalk` session projection; when the
 * projection is not registered, the session log folded by talkFold is the
 * way back, as the design row reads it. `undefined` means neither can be
 * read: ask, confirm and decline fail closed with `unavailable`, and
 * memory_store keeps the words but marks them unchecked. Every use of
 * src/design/talk.ts in this repository outside the design row itself
 * lives in this file.
 */
import { personSaid, TALK_PROJECTION, talkFold, type TalkState } from '../design/talk.ts'
import type { ServiceLookup, SessionLike, SessionProjectionsService } from '../shared/dsh-min.ts'

/** What the memory tools need of the talk state; a full TalkState satisfies it. */
export interface TalkView {
  readonly people: ReadonlyArray<{ readonly seq: number, readonly time: number }>
  readonly shown: ReadonlyArray<{ readonly seq: number }>
}

const projectionsOf = (ctx: ServiceLookup): SessionProjectionsService | undefined => {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get('sessionProjections') : undefined
  return typeof value === 'object' && value !== null ? (value as SessionProjectionsService) : undefined
}

/** The reader of a session's talk: the projection when it is registered, the folded session log otherwise. */
export function answersOf(ctx: ServiceLookup): {
  talkOf(session: SessionLike | undefined): TalkView | undefined
} {
  return {
    talkOf(session) {
      if (session === undefined) return undefined
      try {
        const state = projectionsOf(ctx)?.stateOf(session, TALK_PROJECTION)
        if (state !== undefined) return state as TalkView
      }
      catch {
        // The projection cannot be read; the log below is the way back.
      }
      if (typeof session.snapshotEvents !== 'function') return undefined
      try {
        return talkFold(session.header, session.snapshotEvents())
      }
      catch {
        return undefined
      }
    },
  }
}

const said = (talk: TalkView, quotes: readonly string[], afterMs: number): ReturnType<typeof personSaid> =>
  personSaid(talk as TalkState, quotes, afterMs)

/**
 * Whether the person said `quote` in their latest message (§3.2 step 4): the
 * message they sent last, no earlier one. On success `relay` is the quote as
 * given.
 */
export function saidLatest(talk: TalkView, quote: string): { readonly ok: true, readonly relay: string } | { readonly ok: false } {
  const last = talk.people.at(-1)
  if (last === undefined) return { ok: false }
  const verdict = said(talk, [quote], last.time - 1)
  return verdict.ok ? { ok: true, relay: verdict.relay } : { ok: false }
}

/** The person's first message after the question, as a view that holds only it; `undefined` when they have not replied yet. */
export function firstReply(talk: TalkView, askedAtMs: number): TalkView | undefined {
  const message = talk.people.find(person => person.time > askedAtMs)
  return message === undefined ? undefined : { ...talk, people: [message] }
}

/** Whether the person said every quote in the first message after the question (§3.8.3). On success `relay` is the quotes joined by line breaks. */
export function saidInReply(reply: TalkView, quotes: readonly string[], askedAtMs: number): { readonly ok: true, readonly relay: string } | { readonly ok: false } {
  const verdict = said(reply, quotes, askedAtMs)
  return verdict.ok ? { ok: true, relay: verdict.relay } : { ok: false }
}

/** How many matters were put to the person since their last message: their share of the at-most-three rule (§3.8.1 step 7). */
export function shownSinceLastPerson(talk: TalkView): number {
  const last = talk.people.at(-1)
  const after = last === undefined ? -1 : last.seq
  return talk.shown.filter(entry => entry.seq > after).length
}
