/**
 * The plan text the harness writes for the human (m4-request-card, design
 * §5.4): `renderPlan` assembles the request channel's one plan — the title
 * with the resolved path, the four short lines (background, proposal, doubt,
 * not taken), the optional attachments and the closing question — as
 * Markdown the agent puts at the very end of its reply. The four-line rules
 * exist once (`proposalLineRefusal`, `PROPOSAL_LABELS`, `splitBold`): the
 * third rework's question (design §4.6) and the panel reuse them. Only the
 * harness's own sentences are checked; the data — the path, the focus node's
 * title, the agent's three sentences — goes through `displayPath` and
 * `personTitle` first and is shown verbatim, so a path with 门禁 in it or a
 * focus title with a learned word still renders (F18). The plain-words check
 * (`plainWordsIn`) covers the constants only. Pure functions, no Node
 * built-ins; the request body, the third-rework tool and the panel import
 * from here.
 */
import { codePointCount } from './proposal.ts'
import { PLAIN_LIMITS } from './schema.ts'
import { plainWordsIn } from './plain-question.ts'

/** The labels of the four lines; the harness adds the colon, the line never carries it. */
export const PROPOSAL_LABELS = { background: '背景', proposal: '推荐', doubt: '疑问', notTaken: '不做' } as const

type ProposalLineField = keyof typeof PROPOSAL_LABELS

/** How long a line may be, minus its `**` marks: the background reads the panel's limit, the other three lines 40. */
const LINE_LIMITS: Readonly<Record<ProposalLineField, number>> = { background: PLAIN_LIMITS.background, proposal: 40, doubt: 40, notTaken: 40 }

/** A line's one bold span, cut out: at least two characters on one side of it. Undefined when the line has no usable single `**…**`. */
export function splitBold(line: string): { readonly before: string, readonly bold: string, readonly after: string } | undefined {
  const start = line.indexOf('**')
  if (start < 0) return undefined
  const end = line.indexOf('**', start + 2)
  if (end < 0) return undefined
  const bold = line.slice(start + 2, end)
  const before = line.slice(0, start)
  const after = line.slice(end + 2)
  if (bold.length === 0 || bold.includes('*')) return undefined
  const inner = codePointCount(bold)
  if (inner < 2 || inner > 12) return undefined
  if (before.length === 0 && after.length === 0) return undefined
  return { before, bold, after }
}

/** Why one four-line value is not a usable line; undefined when it is one (design §5.4, M3 addendum 0.5 §3.3's rules). */
export function proposalLineRefusal(field: ProposalLineField, value: unknown): { message: string, hint: string } | undefined {
  const label = PROPOSAL_LABELS[field]
  const hint = `${label} is one short line: a few key words in **bold** (2-12 code points, exactly one span), no newline, no ${label}： label of its own, at most ${LINE_LIMITS[field]} code points without the marks`
  if (typeof value !== 'string') return { message: `${label} is not a string`, hint }
  const line = value.trim()
  if (line.length === 0) return { message: `${label} is empty`, hint }
  if (line.includes('\n')) return { message: `${label} has a newline`, hint }
  if (line.startsWith(`${label}：`) || line.startsWith(`${label}:`)) return { message: `${label} carries its own label`, hint: 'leave out the label; the harness adds it' }
  const bold = splitBold(line)
  if (bold === undefined) return { message: `${label} has no single **bold** span of 2-12 code points`, hint }
  const rest = codePointCount(`${bold.before}${bold.after}`)
  if (rest > LINE_LIMITS[field]) return { message: `${label} is longer than ${LINE_LIMITS[field]} code points without the marks`, hint }
  return undefined
}

/** The characters that would break the Markdown of a verbatim string, escaped with a backslash. */
const FORMAT_CHARS = /[*`[\]<>]/g

/** Escape the characters that would turn a verbatim string into Markdown structure. */
const escapeText = (text: string): string => text.replace(FORMAT_CHARS, found => `\\${found}`)

/** How long a path may read in the title, in characters, before the middle collapses. */
const PATH_LIMIT = 60

/**
 * The path for the title (design §5.4): control characters become `?`, the
 * Markdown structural characters are escaped, and a path longer than 60
 * characters keeps its drive or root and its last two segments with an
 * ellipsis between. The path is data: it is shown as it resolves, and the
 * plain-words check skips it.
 */
export function displayPath(path: string): string {
  let text = ''
  for (const character of path) text += character < ' ' || character === '\u007f' ? '?' : escapeText(character)
  if (codePointCount(text) <= PATH_LIMIT) return text
  const segments = text.split(/[\\/]/)
  // Keep the drive or root and the last two segments; the middle becomes an ellipsis.
  const head = segments[0] === '' ? '' : segments[0]
  const tail = segments.slice(-2).join('/')
  const kept = head.length === 0 ? `…/${tail}` : `${head}/…/${tail}`
  return codePointCount(kept) <= codePointCount(text) ? kept : text
}

/** How a graph node's title reads to the human, or undefined when it is not fit to show (design §5.4). */
export function personTitle(title: string, options: { readonly limit: number, readonly issuesOf: (text: string) => readonly string[] }): string | undefined {
  const cleaned = title.replaceAll('*', '').replaceAll('`', '').trim()
  if (cleaned.length === 0) return undefined
  if (options.issuesOf(cleaned).length > 0) return undefined
  const points = [...cleaned]
  return points.length > options.limit ? `${points.slice(0, options.limit).join('')}…` : cleaned
}

export interface PlanLines {
  readonly background: string
  readonly proposal: string
  readonly doubt: string
  readonly notTaken: string
}

export interface PlanTextInput {
  /** The title: the harness's own lead, and the data (the escaped path) after it. */
  readonly title: { readonly lead: string, readonly data?: string | undefined }
  readonly lines: PlanLines
  /** The 附 block's lines, already formatted by the caller; shown verbatim, checked for nothing. */
  readonly attachments?: readonly string[]
  /** The closing question, the last paragraph, asked once. */
  readonly question: string
}

/** How long the whole title may be, in code points (design §5.4: the lead plus the full path fit in 80). */
const TITLE_LIMIT = 80

/**
 * Assemble the plan text (design §5.4): the title alone, then the four
 * labelled lines, then the attachments, then the question — one blank line
 * between paragraphs, the labels not bold, the question last and asked once.
 * Only the harness's own strings are checked: the four lines through
 * `proposalLineRefusal`, the title's length and newlines, and the
 * plain-words list over the lead, the four lines and the question. The data
 * (the title's `data`, the attachments) shows verbatim. A refusal throws:
 * the caller answers `unavailable` and the human is asked in plain words
 * (design §5.3 step 7).
 */
export function renderPlan(input: PlanTextInput): string {
  for (const field of ['background', 'proposal', 'doubt', 'notTaken'] as const) {
    const refusal = proposalLineRefusal(field, input.lines[field])
    if (refusal !== undefined) throw new Error(`renderPlan: ${refusal.message}`)
  }
  const data = input.title.data ?? ''
  const title = data.length === 0 ? input.title.lead : `${input.title.lead}${data}`
  if (title.includes('\n')) throw new Error('renderPlan: the title has a newline')
  if (codePointCount(title) > TITLE_LIMIT) throw new Error(`renderPlan: the title is longer than ${TITLE_LIMIT} code points`)
  for (const constant of [input.title.lead, input.lines.background, input.lines.proposal, input.lines.doubt, input.lines.notTaken, input.question]) {
    const words = plainWordsIn(constant)
    if (words.length > 0) throw new Error(`renderPlan: a plain-words list word in the harness text (${words[0]})`)
  }
  const paragraphs = [
    title,
    ...(['background', 'proposal', 'doubt', 'notTaken'] as const).map(field => `${PROPOSAL_LABELS[field]}：${input.lines[field].trim()}`),
    ...(input.attachments === undefined || input.attachments.length === 0 ? [] : [`附：\n${input.attachments.join('\n')}`]),
    input.question,
  ]
  return paragraphs.join('\n\n')
}
