/**
 * How evidence and sources are written (M5 design §5.7): the one set of
 * forms shared by a lesson's `evidence`, a journal record's `evidence` and a
 * memory entry's `source`. `parseRef` reads one item, `checkRefs` checks a
 * list and applies the secret check the form calls for.
 *
 * Pure functions, no Node built-ins: the lessons page in the browser imports
 * them too. A prefix that names a form (`commit:`, `node:`, `task:`,
 * `session:`, `call:`, `command:`) always means that form; a body that does
 * not fit it is `invalid`, it never falls through to "other" and gets stored.
 */
import { COMMIT_PATTERN, ID_PATTERN } from '../graph/schema.ts'
import { invalid, listOf, type Refusal } from './refusal.ts'
import { findSecret, type SecretClass } from './secret-shape.ts'

/** The field a list of references belongs to; the rejection names it. */
export type RefField = 'evidence' | 'source'

type RefKind = 'commit' | 'node' | 'task' | 'session' | 'call' | 'command' | 'url' | 'other'

export interface ParsedRef {
  readonly kind: RefKind
  /** The item as it is stored: a commit id in lower case, anything else as written. */
  readonly text: string
  /** The commit id, the id after the colon, or the whole item for a url or other form. */
  readonly id: string
  /** The moment after `@` of a node or task reference. */
  readonly at?: string
}

export type RefsCheck =
  | { readonly ok: true, readonly refs: readonly ParsedRef[] }
  | { readonly ok: false, readonly code: 'invalid' | 'secret_like', readonly field: RefField, readonly index: number, readonly message: string }

const MAX_ITEM_LENGTH = 200
const NODE_OR_TASK = /^(node|task):([^@]*)(?:@(.*))?$/
const MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z?$/
const HOST_ID = /^[A-Za-z0-9_.:-]{1,128}$/
const FORM_PREFIX = /^(commit|node|task|session|call|command):/

/** One item read: the form it is, or why it is not one (English: the reason reaches the model that wrote the item). */
export type RefParse = ParsedRef | { readonly invalid: string }

const isSha = (text: string): boolean => COMMIT_PATTERN.test(text.toLowerCase())

function parseCommit(body: string): RefParse {
  return isSha(body)
    ? { kind: 'commit', text: `commit:${body.toLowerCase()}`, id: body.toLowerCase() }
    : { invalid: 'commit: must be followed by 7 to 40 hex digits' }
}

function parseNodeOrTask(kind: 'node' | 'task', id: string, at: string | undefined): RefParse {
  if (!ID_PATTERN.test(id)) return { invalid: `${kind}: must be followed by an id of lower-case letters, digits and hyphens, starting with a letter (at most 48 characters)` }
  if (at !== undefined && !MOMENT.test(at)) return { invalid: `${kind}:${id}@ must be followed by a moment like 2026-10-29T11:39` }
  return { kind, text: at === undefined ? `${kind}:${id}` : `${kind}:${id}@${at}`, id, ...(at === undefined ? {} : { at }) }
}

/** Read one item as one of the forms of §5.7; `{invalid}` says why it is not one. */
export function parseRef(item: string): RefParse {
  if (item.length === 0 || item.length > MAX_ITEM_LENGTH) return { invalid: `each item must be 1 to ${MAX_ITEM_LENGTH} characters` }
  if (/[\r\n]/.test(item)) return { invalid: 'an item must not contain a line break' }
  if (item.trim().length === 0) return { invalid: 'an item must not be blank' }
  const prefix = FORM_PREFIX.exec(item)?.[1]
  if (prefix === 'commit') return parseCommit(item.slice('commit:'.length))
  if (prefix === 'node' || prefix === 'task') {
    const [, , id = '', at] = NODE_OR_TASK.exec(item) ?? []
    return parseNodeOrTask(prefix, id, at)
  }
  if (prefix === 'session' || prefix === 'call' || prefix === 'command') {
    const id = item.slice(prefix.length + 1)
    return HOST_ID.test(id) ? { kind: prefix, text: item, id } : { invalid: `${prefix}: must be followed by 1 to 128 characters of letters, digits and _ . : -` }
  }
  if (/^https?:\/\//.test(item)) return /\s/.test(item) ? { invalid: 'a url must not contain whitespace' } : { kind: 'url', text: item, id: item }
  if (isSha(item)) return { kind: 'commit', text: item.toLowerCase(), id: item.toLowerCase() }
  return { kind: 'other', text: item, id: item }
}

/**
 * The secret classes left out for a form. A commit id is a hash by nature,
 * and the host issues session, call and command ids (a tool call id comes
 * from the model service and its length is not ours to assume), so they are
 * not typed in from a report; a named token pasted after `call:` is still
 * caught.
 */
function skipFor(kind: RefKind): readonly SecretClass[] | 'all' {
  if (kind === 'commit') return 'all'
  return kind === 'session' || kind === 'call' || kind === 'command' ? ['token', 'hex'] : []
}

/** The first item that is not well formed or looks like a secret, or the parsed items. */
export function checkRefs(items: readonly string[], field: RefField): RefsCheck {
  const refs: ParsedRef[] = []
  for (const [index, item] of items.entries()) {
    const parsed = parseRef(item)
    if ('invalid' in parsed) return { ok: false, code: 'invalid', field, index, message: parsed.invalid }
    const skip = skipFor(parsed.kind)
    const secret = skip === 'all' ? undefined : findSecret(item, skip)
    if (secret !== undefined) return { ok: false, code: 'secret_like', field, index, message: secret.message }
    refs.push(parsed)
  }
  return { ok: true, refs }
}

const MAX_GROUP_KEY_LENGTH = 80

/** Whether a learning group key (`edit:goal.stage`) is well formed: 1 to 80 characters, one line, no space at either end. */
export function isGroupKey(key: string): boolean {
  return key.length >= 1 && key.length <= MAX_GROUP_KEY_LENGTH && !/[\r\n]/.test(key) && key === key.trim()
}

/** The `learnedFrom` of a write: a list of at most `max` group keys without repeats; undefined when it is absent or empty. */
export function groupKeysOf(raw: unknown, max: number): Refusal<'invalid'> | string[] | undefined {
  if (raw === undefined) return undefined
  const list = listOf(raw)
  if (list === undefined || list.length > max || !list.every(key => typeof key === 'string' && isGroupKey(key))) {
    return invalid('learnedFrom', `learnedFrom must be a list of at most ${max} group keys, each one line of 1 to ${MAX_GROUP_KEY_LENGTH} characters`)
  }
  const unique = [...new Set(list as string[])]
  return unique.length === 0 ? undefined : unique
}
