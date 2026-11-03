/**
 * How the main agent asks the human and what a question of the proposal shape
 * records (docs/ORCHESTRATION.md §2.6, §3.5; decision d-ask-three-gates, a
 * trial the person watches): the record and the words are apart. The record
 * is a few fields on the graph that the harness checks (proposalRecordRefusal);
 * the words are `text`, one sentence the main agent writes itself, which the
 * harness holds to a few hard limits (askTextRefusal) and to the record
 * (textCoversRecord). Only the list of ways of a `choose` and the original
 * text a sample brings are laid out by the harness (renderAsk). The numbers
 * and the rules live here and nowhere else, so that a change after the trial
 * touches this file and src/design/talk.ts only. No Node built-ins: the
 * engine, the propose_to_human tool, the examples and the panel share it.
 */
import { PLAIN_LIMITS } from './schema.ts'

/** The four ways of asking: confirm a recommendation, choose a direction, ask what they want, show something to look at. */
export const ASK_FORMS = ['recommend', 'choose', 'want', 'look'] as const
export type AskForm = typeof ASK_FORMS[number]

/** The fields of the record a question keeps after it is made and may be revised (`form` is set once). */
export const PROPOSAL_FIELDS = ['ask', 'proposal', 'reason', 'cost', 'ways', 'notTaken'] as const

/**
 * Limits of the record, in code points: a line, a way, how many ways, the
 * conclusion of a decided question, how many questions one reply puts. The
 * limit of `ask` is the one of the text it opens (TALK_LIMITS).
 */
export const PROPOSAL_LIMITS = { line: 60, way: 50, minWays: 2, maxWays: 3, conclusion: 120, perReply: 3 } as const

/** Limits of what the human reads, in code points: the text of a question, by way of asking (confirm and release are asked as recommend). */
export const TALK_LIMITS = { text: { recommend: 160, choose: 120, want: 120, look: 120 } } as const satisfies { readonly text: Readonly<Record<AskForm, number>> }

/** Limits of the one-page release note a goal split into modules is released with, in code points. */
export const PAGE_LIMITS = { max: 2000 } as const

/** The circled number a question carries in the reply, first item ①; the habit question of the memory row numbers itself with them (M5 §3.8.1). */
export const CIRCLED = ['①', '②', '③'] as const

/** The record of a question: what is kept on the graph. */
export interface ProposalRecord {
  readonly title: string
  readonly ask: string
  readonly form: AskForm
  readonly proposal: string
  readonly reason?: string
  readonly cost?: string
  readonly ways?: readonly string[]
  readonly notTaken?: string
}

interface Refusal {
  readonly message: string
  readonly hint: string
}

/** Length in code points, so a character outside the BMP counts once. */
export function codePointCount(text: string): number {
  return [...text].length
}

/** NFKC and runs of white space as one space, no white space at the ends: the form in which texts are compared. */
export function normalizeText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/gu, ' ').trim()
}

const QUESTION_MARK = /[?？]/u

/** The title of a question: one line, not empty, at most PLAIN_LIMITS.title code points. */
export function proposalTitleRefusal(value: unknown): Refusal | undefined {
  const hint = `title is one line of at most ${PLAIN_LIMITS.title} characters: the name of the matter`
  if (typeof value !== 'string' || value.trim().length === 0) return { message: 'the title must be a non-empty string', hint }
  if (/[\r\n]/.test(value)) return { message: 'the title must be one line', hint }
  if (codePointCount(value) > PLAIN_LIMITS.title) return { message: `the title is longer than ${PLAIN_LIMITS.title} characters`, hint }
  return undefined
}

/** The sentence up to and with the first question mark: the question as it is kept on the graph. Call it after askTextRefusal passed. */
export function askOf(text: string): string {
  const trimmed = text.trim()
  const at = trimmed.search(QUESTION_MARK)
  return at < 0 ? trimmed : trimmed.slice(0, at + 1)
}

/**
 * The hard limits of the text the human reads: one line, not empty, exactly one
 * question mark, at most the limit of the way of asking. When it is too long
 * the hint says which sentence to shorten.
 */
export function askTextRefusal(form: AskForm, text: unknown): Refusal | undefined {
  const limit = TALK_LIMITS.text[form]
  const hint = `text is one line with exactly one question mark and at most ${limit} characters, in plain words`
  if (typeof text !== 'string' || text.trim().length === 0) return { message: 'text must be a non-empty string', hint }
  if (/[\r\n]/.test(text)) return { message: 'text must be one line', hint }
  const marks = [...text].filter(char => QUESTION_MARK.test(char)).length
  if (marks !== 1) return { message: `text must have exactly one question mark, it has ${marks}`, hint: 'one question at a time: put one decision in the sentence, and report the rest before the questions' }
  if (codePointCount(askOf(text)) > limit) return { message: `the question in text is longer than ${limit} characters`, hint: `shorten the sentence that ends with the question mark to at most ${limit} characters` }
  if (codePointCount(text.trim()) > limit) return { message: `text is longer than ${limit} characters`, hint: `shorten the sentence after the question mark: the whole text is at most ${limit} characters` }
  return undefined
}

/**
 * Whether the fields of the record are in the words the human reads, word for
 * word (compared after NFKC and with white space as one space). What is kept
 * on the graph is the question, so the recommendation and the reason of a
 * `recommend` and the guess of a `want` must be in the question itself; the
 * cost of a `recommend`, the reason of a `choose` and the name of a `look` may
 * be anywhere in the text. Returns the first field that is missing and where
 * it belongs.
 */
export function textCoversRecord(text: string, record: { readonly proposal?: string, readonly reason?: string, readonly cost?: string }, form: AskForm): { readonly field: 'proposal' | 'reason' | 'cost', readonly within: 'ask' | 'text' } | undefined {
  const whole = normalizeText(text)
  const question = normalizeText(askOf(text))
  const wanted: ReadonlyArray<readonly ['proposal' | 'reason' | 'cost', 'ask' | 'text']> =
    form === 'recommend' ? [['proposal', 'ask'], ['reason', 'ask'], ['cost', 'text']]
      : form === 'choose' ? [['reason', 'text']]
        : form === 'want' ? [['proposal', 'ask']]
          : [['proposal', 'text']]
  for (const [field, within] of wanted) {
    const value = record[field]
    if (value !== undefined && !(within === 'ask' ? question : whole).includes(normalizeText(value))) return { field, within }
  }
  return undefined
}

/**
 * Whether the one-page release note is one the human can release from: not empty,
 * not longer than PAGE_LIMITS.max code points, and with every text in `wanted`
 * in it (the titles of the modules and framework decisions, the directions word
 * for word; compared after NFKC and with white space as one space). The harness
 * checks what would let the human overlook a part of what they release, not
 * the headings or the wording. `label` says what the first missing text is.
 */
export function pageRefusal(page: string, wanted: ReadonlyArray<{ readonly text: string, readonly label: string }>): Refusal | undefined {
  const hint = `page is the one-page release note in plain words, 1 to ${PAGE_LIMITS.max} characters`
  if (page.trim().length === 0) return { message: 'page must not be empty', hint }
  if (codePointCount(page) > PAGE_LIMITS.max) return { message: `page is longer than ${PAGE_LIMITS.max} characters`, hint: `shorten the page to at most ${PAGE_LIMITS.max} characters` }
  const whole = normalizeText(page)
  const missing = wanted.find(entry => !whole.includes(normalizeText(entry.text)))
  return missing === undefined ? undefined : { message: `page does not have ${missing.label}`, hint: `the page must name ${missing.label} word for word: ${missing.text}` }
}

/** A fence of backticks longer than any run in `text`, at least three. */
function fenced(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map(run => run.length))
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${fence}\n${text}\n${fence}`
}

/**
 * What the human reads: the number and the text of the main agent; for a
 * `choose` a blank line and the ways as a numbered list, the last marked as the
 * recommendation (a list that is not set apart is one line in Markdown); then,
 * after a blank line, the original text that must be seen (a sample, a release
 * page, a board's proposal), as it is, in a code fence for a sketch.
 */
export function renderAsk(text: string, number: 1 | 2 | 3, ways?: readonly string[], exact?: string, fence?: boolean): string {
  const parts = [`${CIRCLED[number - 1]} ${text.trim()}`]
  if (ways !== undefined) parts.push(ways.map((way, index) => `${index + 1}. ${way}${index === ways.length - 1 ? '（推荐）' : ''}`).join('\n'))
  if (exact !== undefined) parts.push(fence === true ? fenced(exact) : exact)
  return parts.join('\n\n')
}

const FILLERS = new Set(['无', '没有', '暂无', '不适用', 'na', 'none'])

/** A word that fills a cell for the sake of filling it: nothing but punctuation, or 无, 没有, 暂无, 不适用, n/a, none. */
function isFiller(value: string): boolean {
  const bare = value.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()
  return bare === '' || FILLERS.has(bare)
}

function lineRefusal(field: string, value: unknown, limit: number): Refusal | undefined {
  const hint = `${field} is one short line of at most ${limit} characters`
  if (typeof value !== 'string' || value.trim().length === 0) return { message: `${field} must be a non-empty string`, hint }
  if (/[\r\n]/.test(value)) return { message: `${field} must be one line`, hint }
  if (codePointCount(value.trim()) > limit) return { message: `${field} is longer than ${limit} characters`, hint }
  return undefined
}

function waysRefusal(ways: readonly unknown[]): Refusal | undefined {
  const hint = `ways are ${PROPOSAL_LIMITS.minWays} or ${PROPOSAL_LIMITS.maxWays} paths, each one line of at most ${PROPOSAL_LIMITS.way} characters saying what the human would see, no question mark, all different, your pick last`
  if (ways.length < PROPOSAL_LIMITS.minWays || ways.length > PROPOSAL_LIMITS.maxWays) return { message: `ways must be ${PROPOSAL_LIMITS.minWays} or ${PROPOSAL_LIMITS.maxWays} paths, not ${ways.length}`, hint }
  for (const way of ways) {
    const refusal = lineRefusal('a way', way, PROPOSAL_LIMITS.way)
    if (refusal !== undefined) return { message: refusal.message, hint }
    if (QUESTION_MARK.test(way as string)) return { message: 'a way must not contain a question mark', hint }
  }
  if (new Set(ways.map(way => (way as string).trim())).size !== ways.length) return { message: 'the ways must all be different', hint }
  return undefined
}

/**
 * The rules of the record of a question in the proposal shape, in this order,
 * the first that fails: the title; the way of asking; the question (one line,
 * one question mark and ending with it, within the limit of its way of asking);
 * the recommendation or guess (one line; for a `choose` the last way); by way
 * of asking which fields are required and which are not taken; the optional
 * lines are real (no filler). `field` is the field to correct.
 */
export function proposalRecordRefusal(record: Readonly<Partial<Omit<ProposalRecord, 'ways'> & { ways: readonly unknown[] }>>): (Refusal & { readonly field: string }) | undefined {
  const refuse = (field: string, refusal: Refusal): Refusal & { field: string } => ({ ...refusal, field })
  const title = proposalTitleRefusal(record.title)
  if (title !== undefined) return refuse('title', title)
  const { form } = record
  if (form === undefined || !ASK_FORMS.includes(form)) return refuse('form', { message: 'form must be one of recommend, choose, want, look', hint: 'pick the way of asking: recommend, choose, want or look' })
  const limit = TALK_LIMITS.text[form]
  const ask = record.ask
  const hintAsk = `ask is the question: one sentence with exactly one question mark, ending with it, at most ${limit} characters`
  if (typeof ask !== 'string' || ask.trim().length === 0) return refuse('ask', { message: 'ask must be a non-empty string', hint: hintAsk })
  if (/[\r\n]/.test(ask)) return refuse('ask', { message: 'ask must be one line', hint: hintAsk })
  const trimmed = ask.trim()
  const marks = [...trimmed].filter(char => QUESTION_MARK.test(char)).length
  if (marks !== 1 || !QUESTION_MARK.test(trimmed.at(-1)!)) return refuse('ask', { message: 'ask must have exactly one question mark and end with it', hint: hintAsk })
  if (codePointCount(trimmed) > limit) return refuse('ask', { message: `ask is longer than ${limit} characters`, hint: hintAsk })
  const ways = record.ways
  if (form === 'choose') {
    if (ways === undefined) return refuse('ways', { message: 'a choose question needs its ways', hint: `ways are ${PROPOSAL_LIMITS.minWays} or ${PROPOSAL_LIMITS.maxWays} paths, your pick last` })
    const bad = waysRefusal(ways)
    if (bad !== undefined) return refuse('ways', bad)
  }
  const proposal = lineRefusal('proposal', record.proposal, PROPOSAL_LIMITS.line)
  if (proposal !== undefined) return refuse('proposal', { message: proposal.message, hint: form === 'choose' ? 'proposal is the way you recommend: the last of ways' : 'proposal is what you recommend, guess or show, in one short line' })
  const taken = form === 'recommend' ? ['reason', 'cost', 'notTaken'] : form === 'choose' ? ['reason', 'ways', 'notTaken'] : []
  for (const field of ['reason', 'cost', 'ways', 'notTaken'] as const) {
    if (record[field] !== undefined && !taken.includes(field)) return refuse(field, { message: `${field} is not taken in a question of the form ${form}`, hint: `a ${form} question has no ${field}: leave it out` })
  }
  if (record.reason === undefined && (form === 'recommend' || form === 'choose')) return refuse('reason', { message: `a ${form} question needs its reason`, hint: 'reason is why you recommend it, in one short line' })
  if (form === 'choose' && ways !== undefined) {
    if ((record.proposal as string).trim() !== (ways.at(-1) as string).trim()) return refuse('proposal', { message: 'the proposal of a choose question is its last way', hint: 'list the way you recommend last in ways; proposal is that way' })
  }
  for (const field of ['reason', 'cost', 'notTaken'] as const) {
    const value = record[field]
    if (value === undefined) continue
    const refusal = lineRefusal(field, value, PROPOSAL_LIMITS.line)
    if (refusal !== undefined) return refuse(field, refusal)
    if (isFiller(value)) return refuse(field, { message: `${field} is a filler`, hint: `leave ${field} out when there is nothing to say; a word like 无 is refused` })
  }
  return undefined
}
