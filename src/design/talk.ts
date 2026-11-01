/**
 * How the main agent talks with the human, defined in one place (docs/
 * ORCHESTRATION.md §3.5; decision d-chat-not-cards): the guide that goes
 * into its system prompt, and the question tools hidden from it. Pure
 * values with no imports of the design row, so the host and the simulated
 * human can both read them. The fold of the session log that tells what
 * the human said and what was put to them, and the check of a quote
 * against it (docs/ORCHESTRATION.md §3.5), are pure functions too; the
 * only imports are the thin DSH types and the tool names.
 */
import { normalizeText, TALK_LIMITS, type AskForm } from '../graph/proposal.ts'
import { AGREE_WORDS } from '../shared/answer-marks.ts'
import type { SessionEventLike } from '../shared/dsh-min.ts'
import { PROPOSE_TO_HUMAN, RECORD_HUMAN_ANSWER, shownProposalOf } from '../shared/tool-names.ts'

/**
 * The guide to talking with the human (decision d-ask-three-gates: whether
 * to ask, when to ask, how to interview), English instructions with the
 * person's words in Chinese. Followed in the system prompt by
 * PLAIN_WORDS_GUIDE (src/graph/plain-question.ts); how to ask is in
 * TALK_SHAPES and the examples, in the description of propose_to_human.
 */
export const TALK_GUIDE = [
  'Ask the human only what is theirs: what they want, what counts as done, what is not to be done; spending money, actions that cannot be taken back or that reach outside the project; matters of taste and trade-offs of value.',
  'Decide every reversible technical choice within their intent yourself and say so in one line in your next report ("我定了：X，因为 Y，不对就说").',
  `If they say 「这类你定」 about a kind of question, record it with ${RECORD_HUMAN_ANSWER} kind delegation and their exact words (undo: true when they take it back); from then on report that kind and never ask it, only while the matter can still be undone.`,
  'While you interview them, ask in plain chat, one or two questions at a time, and offer your guess to correct where you have one ("我猜你…，对吗？").',
  `Every other question that needs their answer goes through ${PROPOSE_TO_HUMAN}, and you show its text as given; its description has the four shapes (recommend, choose, want, look) and the limits.`,
  'Ask at a natural stopping point, report first and questions last, at most three in one reply, one decision each.',
  'In the report before the questions, say for each one what it is about and where it came from, in one sentence.',
  `A short answer to a matter that cannot be taken back is restated first ("那我记成：…") unless it is plainly yes (${[...AGREE_WORDS, '第 N 条'].map(word => `「${word}」`).join('')}); wait for their yes before you record it with ${RECORD_HUMAN_ANSWER} and their exact words.`,
  'Ask at the project-manager level, never about code, and never what you can look up.',
].join(' ')

/**
 * The four ways of asking and the limits that hold for all of them, written
 * for the main agent from the limits (src/graph/proposal.ts): the tool
 * description of propose_to_human carries it. There is no common template and
 * no labelled lines; the harness checks the record and a few hard limits of
 * the text, and lays out only the ways of a `choose` and a sample.
 */
export const TALK_SHAPES = [
  `Pick the shape the question needs; there is no common template and there are no labelled lines. text is the question as the human reads it: one line, exactly one question mark, plain words, at most ${TALK_LIMITS.text.recommend} characters for recommend and ${TALK_LIMITS.text.choose} for the others.`,
  'recommend: text is one yes-or-no question with your recommendation and its reason inside, then one sentence of cost only if there is a real cost; 「可以」 accepts it. Give proposal (the recommendation) and reason, and cost only if you wrote one.',
  'choose: only when a real trade-off exists. text asks the question; give ways, two or three, one line each saying what the human would see, your pick last, and reason for it; leave proposal out, the harness records the last way as proposal, lists the ways and marks your pick.',
  'want: text asks what they want and offers your guess for them to correct ("我猜你…，对吗？"). Give the guess as proposal.',
  'look: text says what you are showing and asks what is wrong with it. Give the sketch\'s name as proposal; when what they look at is text (a sketch, a sample of output), pass it in sample and the harness shows it as drawn under your question.',
  'The harness stores the sentence that ends with the question mark as the question, so proposal and reason (recommend), and proposal (want), must appear word for word in that sentence; cost, and the reason of choose, anywhere in text. It also checks that no word of the plain-words list is used and that one reply has at most three questions. Leave cost and notTaken out when there is nothing to say; a filler such as 无 is refused. notTaken is the way you did not take, kept for the record.',
].join('\n')

/**
 * What a proposal to the human is for: a matter only they can decide
 * (`question`), the requirement card to confirm (`confirm`), or the design
 * to release (`release`). The tools that put proposals to them, and the
 * checks on what they said back, are keyed by it.
 */
export type ProposalKind = 'question' | 'confirm' | 'release'

/**
 * Question tools the main agent does not get: the human is asked in plain
 * chat, never through option cards. Compared by DSH native name, so a dialect
 * alias of the same tool is hidden too.
 */
export const HIDDEN_FROM_MAIN_AGENT: readonly string[] = ['ask_user_question']

/**
 * What a session shows of its talk with the human, folded from its log (docs/
 * ORCHESTRATION.md §3.5): the messages the human sent and the matters the
 * main agent put to them with propose_to_human, in order. The harness checks
 * the human's words against it, so that "the human said this" is not up to
 * the model. The projection `hournessTalk` of the design row is this fold.
 */
export const TALK_PROJECTION = 'hournessTalk'

/** The text dsh-command-goal adds as a user message when /goal carries attachments: written by a command, not said by the human. */
export const GOAL_ATTACHMENT_TEXT = 'Reference attachments for the goal objective.'

/** A message the human sent. `restated` tells whether the main agent's message before it said it would record the answer ("我记成"). */
interface PersonMessage {
  readonly seq: number
  readonly time: number
  readonly text: string
  readonly restated: boolean
}

/** One matter the main agent put to the human; `after` is what the main agent said after that, until the human's next message. */
export interface Shown {
  readonly seq: number
  readonly time: number
  readonly kind: ProposalKind
  readonly goal?: string
  readonly module?: string
  readonly question?: string
  readonly number: 1 | 2 | 3
  readonly releaseSet?: ReadonlyArray<{ readonly id: string, readonly rev: string }>
  /** The way of asking of a question. */
  readonly form?: AskForm
  /** The original text the human must see before agreeing: the `sample` of the call (a release page comes with the step that opens release); `record_human_answer` finds it in `after`. */
  readonly exact?: string
  /** At most AFTER_LIMIT code points. */
  readonly after: string
  readonly afterTruncated: boolean
}

export interface TalkState {
  /** A delegated session: nothing is recorded. The task message a parent sends it looks like a human's message and is not one. */
  readonly inert: boolean
  /** Events with a lower seq were inherited from a parent by a fork: not this session's talk. */
  readonly skipBelowSeq: number
  readonly people: readonly PersonMessage[]
  readonly shown: readonly Shown[]
  /** The latest propose_to_human calls with the original text they carried, to tell their results from any other text that looks like one. */
  readonly calls: ReadonlyArray<{ readonly id: string, readonly exact?: string }>
  /** Results of propose_to_human calls whose text could not be read. */
  readonly unparsed: number
  /** Whether the latest message of the assistant said it would record the answer. */
  readonly restating: boolean
}

/** Longest `after`, in code points: room for an original text of 6000 code points plus the question and a few sentences. */
const AFTER_LIMIT = 16_000
/** The human's messages are kept up to this many code points, the oldest dropped first. */
const PEOPLE_LIMIT = 200_000
const CALLS_KEPT = 16
const SHOWN_KEPT = 64

const RESTATE_MARK = '我记成'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function textOf(blocks: unknown): string {
  if (!Array.isArray(blocks)) return ''
  return blocks.flatMap(block => isRecord(block) && block.type === 'text' && typeof block.text === 'string' ? [block.text] : []).join('\n')
}

/** The text of a message the human sent: the text blocks of a `user/message` joined by line breaks; undefined for any other event. */
function personTextOf(event: SessionEventLike): string | undefined {
  if (event.type !== 'user/message' || !isRecord(event.data)) return undefined
  const { source } = event.data
  if (!isRecord(source) || source.kind !== 'user' || source.form !== undefined) return undefined
  const text = textOf(event.data.content)
  return text.trim() === GOAL_ATTACHMENT_TEXT ? undefined : text
}

/**
 * Whether a session event is a message the human sent: a `user/message`
 * whose source is the user and has no `form`. A notice (`form: 'notice'`), a
 * plugin's snapshot (`form: 'snapshot'`), a command (`command/run`) and the
 * attachments line /goal adds are not. The desktop app builds the human's
 * messages with `source: {kind: 'user', …}` and the headless runner's task
 * message has the same source (dsh-headless:340–346).
 */
export function isPersonMessage(event: SessionEventLike): boolean {
  return personTextOf(event) !== undefined
}

export function talkInit(header: { readonly origin?: string }, inheritedEventCount: number): TalkState {
  return { inert: header.origin === 'subagent', skipBelowSeq: inheritedEventCount, people: [], shown: [], calls: [], unparsed: 0, restating: false }
}

function capped(people: readonly PersonMessage[]): readonly PersonMessage[] {
  let size = people.reduce((sum, message) => sum + [...message.text].length, 0)
  let from = 0
  while (size > PEOPLE_LIMIT && from < people.length - 1) size -= [...people[from++].text].length
  return from === 0 ? people : people.slice(from)
}

/** `after` of the matters shown since the human's last message, with the assistant's words added. */
function withAfter(state: TalkState, added: string): readonly Shown[] {
  if (added.length === 0) return state.shown
  const lastPerson = state.people.at(-1)?.seq ?? -1
  return state.shown.map((entry) => {
    if (entry.seq < lastPerson || entry.afterTruncated) return entry
    const room = AFTER_LIMIT - [...entry.after].length
    const piece = [...added]
    return piece.length <= room
      ? { ...entry, after: entry.after + added }
      : { ...entry, after: entry.after + piece.slice(0, room).join(''), afterTruncated: true }
  })
}

/** The `sample` a tool-call block carried (its arguments are the provider's JSON text, or already an object): the original text the human must see. */
function exactOf(block: Record<string, unknown>): { readonly exact?: string } {
  let input: unknown = block.arguments ?? block.input
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input)
    }
    catch {
      return {}
    }
  }
  const sample = isRecord(input) ? input.sample : undefined
  return typeof sample === 'string' && sample.length > 0 ? { exact: sample } : {}
}

/** Fold one event into the state; pure, and an event it does not know leaves the state as it was. */
export function talkApply(state: TalkState, event: SessionEventLike): TalkState {
  if (state.inert || event.seq < state.skipBelowSeq) return state
  const person = personTextOf(event)
  if (person !== undefined) return { ...state, people: capped([...state.people, { seq: event.seq, time: event.time, text: person, restated: state.restating }]) }
  if (!isRecord(event.data) || !isRecord(event.data.message)) return state
  const { message } = event.data
  if (event.type === 'assistant/message' && Array.isArray(message.content)) {
    const calls = message.content.flatMap(block => isRecord(block) && block.type === 'tool-call' && block.name === PROPOSE_TO_HUMAN && typeof block.id === 'string' ? [{ id: block.id, ...exactOf(block) }] : [])
    const said = textOf(message.content)
    return {
      ...state,
      calls: calls.length === 0 ? state.calls : [...state.calls, ...calls].slice(-CALLS_KEPT),
      shown: withAfter(state, said),
      restating: said.includes(RESTATE_MARK),
    }
  }
  const call = event.type === 'tool/result' && typeof message.toolCallId === 'string' ? state.calls.find(entry => entry.id === message.toolCallId) : undefined
  if (call !== undefined) {
    const result = shownProposalOf(message.isError === true, textOf(message.content))
    if (result === undefined) return message.isError === true ? state : { ...state, unparsed: state.unparsed + 1 }
    const entry: Shown = {
      seq: event.seq,
      time: event.time,
      kind: result.kind,
      ...result.goal === undefined ? {} : { goal: result.goal },
      ...result.module === undefined ? {} : { module: result.module },
      ...result.question === undefined ? {} : { question: result.question },
      number: result.number,
      ...result.releaseSet === undefined ? {} : { releaseSet: result.releaseSet },
      ...result.form === undefined ? {} : { form: result.form },
      ...call.exact === undefined ? {} : { exact: call.exact },
      after: '',
      afterTruncated: false,
    }
    return { ...state, shown: [...state.shown, entry].slice(-SHOWN_KEPT) }
  }
  return state
}

/**
 * The way back when the session projection could not be registered: the
 * same fold over the whole log, which rc.3 marks deprecated and only this
 * fallback reads (src/shared/dsh-min.ts `snapshotEvents`). A fork's inherited
 * events cannot be told apart there, so the fallback counts them.
 */
export function talkFold(header: { readonly origin?: string }, events: readonly SessionEventLike[]): TalkState {
  return events.reduce(talkApply, talkInit(header, 0))
}

/** The projection's `stateSchema.parse`: the shape of a state, checked at the edges of a session projection. */
export function parseTalkState(value: unknown): TalkState {
  if (!isRecord(value) || typeof value.inert !== 'boolean' || typeof value.skipBelowSeq !== 'number' || !Array.isArray(value.people) || !Array.isArray(value.shown) || !Array.isArray(value.calls)
    || typeof value.unparsed !== 'number' || typeof value.restating !== 'boolean') {
    throw new TypeError('talk state: inert, skipBelowSeq, people, shown, calls, unparsed and restating are required')
  }
  return value as unknown as TalkState
}

/** Normalised the way quotes and messages are compared: NFKC, runs of white space as one space, no white space at the ends. */
export const normalizeTalk = normalizeText

const BOUNDARY = /[\s\p{P}]/u

/** Whether `needle` is in `haystack` from a boundary to a boundary (the ends of the message, white space, or Unicode punctuation). */
function onBoundaries(haystack: string, needle: string): 'found' | 'inside' | 'absent' {
  let inside = false
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + 1)) {
    const before = at === 0 ? '' : [...haystack.slice(0, at)].at(-1)!
    const after = haystack.slice(at + needle.length)[0]
    if ((before === '' || BOUNDARY.test(before)) && (after === undefined || BOUNDARY.test(after))) return 'found'
    inside = true
  }
  return inside ? 'inside' : 'absent'
}

/**
 * Whether the human said each quote in a message they sent after `afterMs`
 * (docs/ORCHESTRATION.md §3.5): each quote is a stretch of one such message,
 * beginning and ending on a boundary, so "可以" is not taken out of "不可以"
 * but is out of "可以，放行". The quotes may come from different messages. On
 * success `relay` is the quotes as given, joined by line breaks.
 */
export function personSaid(state: TalkState, quotes: readonly string[], afterMs: number):
  { readonly ok: true, readonly relay: string } | { readonly ok: false, readonly reason: string, readonly offBoundary: boolean } {
  const messages = state.people.filter(message => message.time > afterMs).map(message => normalizeTalk(message.text))
  for (const [index, quote] of quotes.entries()) {
    const needle = normalizeTalk(quote)
    const found = needle.length === 0 ? 'absent' : messages.map(message => onBoundaries(message, needle))
    if (found !== 'absent' && found.includes('found')) continue
    const offBoundary = found !== 'absent' && found.includes('inside')
    return {
      ok: false,
      offBoundary,
      reason: `quote ${index + 1} is ${offBoundary ? 'in a message the human sent, but not as a whole phrase (it does not begin and end at a punctuation mark, a space or a line break)' : 'not in any message the human sent'} after the matter was put to them`,
    }
  }
  return { ok: true, relay: quotes.join('\n') }
}
