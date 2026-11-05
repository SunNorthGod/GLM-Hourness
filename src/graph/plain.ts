/**
 * The writing check (plain-ui 1.3 §5.3, docs/ORCHESTRATION.md §2.9): what
 * the human reads, held to plain words. That is a node's title and why, the
 * proposal and the way not taken of a question put as a proposal, its
 * conclusion, and the words the panel's templates write (`generated`). Pure
 * text and pure functions, no Node built-ins: the engine (warnings now,
 * refusals in the second phase), the graph reader (notices on open nodes)
 * and the panel import it.
 *
 * The ask, the reason, the cost and the ways of a question are not checked
 * here: propose_to_human refuses the plain-words list and the lengths on
 * them from the first day (src/design/propose.ts).
 */
import type { GraphIssue } from './format.ts'
import { codePointCount } from './proposal.ts'
import { PLAIN_WORDS, plainWordsIn } from './plain-question.ts'
import { NODE_TYPES, PLAIN_LIMITS, type GraphNode, type Status } from './schema.ts'

/**
 * The phase of the check (§5.3): 1 warns and writes, 2 refuses. Switching
 * is a commit of its own, made only when the preconditions of §5.3 hold
 * (the open nodes rewritten, a contract test for every entry that writes
 * what the human reads); going back is changing this constant.
 */
export const PLAIN_PHASE: 1 | 2 = 1

type PlainRule = 'code' | 'id' | 'identifier' | 'enum' | 'term' | 'typeWord' | 'jargon' | 'length'

/** The fields the check reads: a node's, or `generated` for the words a template writes. */
type PlainField = 'title' | 'why' | 'proposal' | 'notTaken' | 'conclusion' | 'generated'

export interface PlainIssue {
  readonly rule: PlainRule
  readonly field: PlainField
  /** What was found, in English for the agent. */
  readonly message: string
  /** How to write it instead. */
  readonly hint: string
}

/** Milestone numbers (M3, M8.1), a leading section number not followed by a unit (3.1 主 Agent, not 1.5 倍), section signs and finding numbers (V-01). */
const CODES: readonly RegExp[] = [
  /(?<![A-Za-z0-9])M\d+(?:\.\d+)*(?![A-Za-z0-9])/u,
  /^\d+(?:\.\d+)+\s(?!(?:倍|%|个|次|秒|分|小时|天|周|元|积分|万|千|亿|[kKMGx](?![A-Za-z])))/mu,
  /§\s?\d/u,
  /(?<![A-Za-z0-9])[A-Z]{1,2}-\d{2}(?!\d)/u,
]

/** A run of id characters standing alone: a node id is matched against these whole. */
const ID_TOKENS = /(?<![A-Za-z0-9-])[a-z][a-z0-9-]*(?![A-Za-z0-9-])/gu

/** Product names written in camel case that are not code. */
const CAMEL_NAMES: ReadonlySet<string> = new Set(['macOS', 'iOS', 'iPadOS', 'iPhone', 'iPad'])

const SNAKE = /\b[a-z0-9]+_[a-z0-9_]+\b/u
const CAMEL = /\b[a-z]+[A-Z][A-Za-z0-9]*\b/gu
const FILE_NAME = /\b[\w.-]+\.(?:ts|tsx|js|mjs|cjs|json|md|ya?ml)\b/u

/** The engine's status, verification and slope words (§2.6), whole words, any case. */
const ENGINE_WORDS = new RegExp(`(?<![A-Za-z0-9_])(?:${['proposed', 'approved', 'doing', 'done', 'dropped', 'superseded', 'unverified', 'sandbox', 'device', 'overturned', 'uphill', 'downhill', 'one-way', 'two-way'].join('|')})(?![A-Za-z0-9_])`, 'iu')

/** Internal words of the graph; 投影 is on the plain-words list and reported as jargon, with what to say instead. */
const TERMS: readonly string[] = ['待决', '修订号', '派发属性', '写入范围', '决定者', '节点']

/** Type names a template must not write; 目标, 风险, 工具 and 决定 are everyday words. */
const TYPE_WORDS: readonly string[] = ['特性', '任务', '规范', '复盘']
const ENGLISH_TYPES = new RegExp(`(?<![A-Za-z0-9_])(?:${NODE_TYPES.join('|')})(?![A-Za-z0-9_])`, 'iu')

const LIMITS: Partial<Record<PlainField, number>> = { title: PLAIN_LIMITS.title, why: PLAIN_LIMITS.why }

function issue(rule: PlainRule, field: PlainField, message: string, hint: string): PlainIssue {
  return { rule, field, message, hint }
}

function codeIssue(text: string, field: PlainField): PlainIssue | undefined {
  const found = CODES.map(pattern => pattern.exec(text)?.[0]).find(match => match !== undefined)
  return found === undefined ? undefined : issue('code', field, `a milestone, section or finding number ("${found.trim()}")`, 'say what it is in plain words; numbers belong in body')
}

function idIssue(text: string, field: PlainField, ids: ReadonlySet<string>): PlainIssue | undefined {
  const found = [...text.matchAll(ID_TOKENS)].map(match => match[0]).find(token => /[\d-]/u.test(token) && ids.has(token))
  return found === undefined ? undefined : issue('id', field, `the node id "${found}"`, 'name the thing in words; ids belong in body')
}

function identifierIssue(text: string, field: PlainField): PlainIssue | undefined {
  const found = text.includes('`') ? '`'
    : SNAKE.exec(text)?.[0]
      ?? [...text.matchAll(CAMEL)].map(match => match[0]).find(word => !CAMEL_NAMES.has(word))
      ?? FILE_NAME.exec(text)?.[0]
  return found === undefined ? undefined : issue('identifier', field, found === '`' ? 'a backtick' : `code or a file name ("${found}")`, 'say what it does; code and file names belong in body')
}

function lengthIssue(text: string, field: PlainField): PlainIssue | undefined {
  const limit = LIMITS[field]
  if (limit === undefined) return undefined
  const hint = `${field} is one line of at most ${limit} characters`
  if (/[\r\n]/u.test(text)) return issue('length', field, 'more than one line', hint)
  const count = codePointCount(text)
  return count > limit ? issue('length', field, `${count} characters, more than ${limit}`, hint) : undefined
}

/**
 * The rules `text` breaks, at most one issue per rule. `field` names what
 * the text is; `typeWord` is checked on `generated` only, `length` on title
 * and why. `ids` are the node ids of the graph. Every text gets `jargon`;
 * nodePlainIssues keeps it only where the human answers or approves.
 */
export function plainIssues(text: string, field: PlainField, ids: ReadonlySet<string>): PlainIssue[] {
  const found: Array<PlainIssue | undefined> = [codeIssue(text, field), idIssue(text, field, ids), identifierIssue(text, field)]
  const engineWord = ENGINE_WORDS.exec(text)?.[0]
  if (engineWord !== undefined) found.push(issue('enum', field, `the engine word "${engineWord}"`, 'say the state in plain words, as the panel does (做完了, 在做, 等你批准)'))
  const term = TERMS.find(word => text.includes(word))
  if (term !== undefined) found.push(issue('term', field, `the internal word ${term}`, 'say what it is for someone who uses the project'))
  if (field === 'generated') {
    const typeWord = TYPE_WORDS.find(word => text.includes(word)) ?? ENGLISH_TYPES.exec(text)?.[0]
    if (typeWord !== undefined) found.push(issue('typeWord', field, `the type name ${typeWord}`, 'say what the thing does, not what type it is'))
  }
  const jargon = plainWordsIn(text)[0]
  if (jargon !== undefined) {
    const say = PLAIN_WORDS.find(entry => entry.avoid.includes(jargon))?.say ?? 'a plainer word'
    found.push(issue('jargon', field, `the word ${jargon}, which the human has not learned`, `say ${say} instead of ${jargon}`))
  }
  found.push(lengthIssue(text, field))
  return found.filter(entry => entry !== undefined)
}

/** The node fields the check reads: title and why on every node, and on a question put as a proposal its two lines and its conclusion. */
const NODE_TEXT_FIELDS = ['title', 'why', 'proposal', 'notTaken', 'conclusion'] as const

/**
 * The rules a node's texts break (§5.3): `title` and `why` of every node,
 * and `proposal`, `notTaken` and `conclusion` of a question without
 * options. `jargon` counts on what the human answers or approves only: a
 * question, and a proposed node. `only` narrows the fields (an edit checks
 * what it changed).
 */
export function nodePlainIssues(node: GraphNode, ids: ReadonlySet<string>, only?: readonly string[]): PlainIssue[] {
  const fields = node.type === 'question' && node.options === undefined ? NODE_TEXT_FIELDS : NODE_TEXT_FIELDS.slice(0, 2)
  const jargon = node.type === 'question' || node.status === 'proposed'
  return fields.filter(field => only === undefined || only.includes(field)).flatMap(field => {
    const text = node[field]
    return text === undefined ? [] : plainIssues(text, field, ids).filter(found => jargon || found.rule !== 'jargon')
  })
}

/**
 * The writing rules as the graph tools describe them (§5.3): the paragraph
 * on title and why, then the plain-words list item by item.
 */
export const PLAIN_WRITING_GUIDE = [
  'title and why are read by the human: plain words for someone who uses this project, saying what changes once it is done and why it is done.',
  'No milestone or section numbers (M3, 3.1, §4), finding numbers (V-01), node ids, code or file names, or engine status words; put those in body.',
  `title one line, at most ${PLAIN_LIMITS.title} characters; why one sentence, at most ${PLAIN_LIMITS.why}; a question has no why.`,
  'Express order with depends edges; the panel orders 接下来 by them.',
  `In what the human reads write the right-hand words: ${PLAIN_WORDS.map(({ avoid, say }) => `${avoid.join(' or ')} -> ${say}`).join('; ')}.`,
].join(' ')

const CLOSED: ReadonlySet<Status> = new Set(['done', 'dropped', 'superseded'])

/** The reading notices of a graph (§5.3): one per rule an open node's texts break; closed nodes are not checked. */
export function plainNotices(nodes: ReadonlyMap<string, GraphNode>): GraphIssue[] {
  const ids = new Set(nodes.keys())
  return [...nodes.values()].filter(node => !CLOSED.has(node.status)).flatMap(node => nodePlainIssues(node, ids).map((found): GraphIssue => ({
    severity: 'notice',
    file: `nodes/${node.id}.json`,
    field: found.field,
    rule: found.rule,
    message: `${found.message}; ${found.hint}`,
  })))
}
