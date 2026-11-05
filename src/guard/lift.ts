/**
 * The lifted rules of one project (m4-gate, design §3.5): the record of the
 * human's decisions is `docs/guard/lifts.jsonl` in the project root,
 * append-only, one JSON line per lift or restore. A rule's state is its last
 * line's action. Reading costs one stat per judgment: the parsed set is
 * cached per project root and re-read only when the file's size or mtime
 * changed; a file that is absent or unreadable lifts nothing, so the rules
 * keep blocking, and bad lines are skipped and counted (the row health says
 * how many).
 *
 * G3 adds the write side. `appendLift` is the one writer; `guardLift` is the
 * tool the main agent calls when the human says to stop enforcing a rule —
 * the words are checked against the human's own latest client message
 * (`session.deriveMessages()`, the M3-aligned reading: `source.kind 'user'`,
 * no `form`, a string `rpcId`), against the intent word lists below, and one
 * human message buys at most one successful lift. The words lists are
 * permission: changing them is a full-review change. The rules board's
 * hand-over (src/guard/lift-service.ts) skips the words check and may also
 * lift `liftVia: 'board'` rules.
 */
import { mkdir, appendFile, readFile } from 'node:fs/promises'
import { readFileSync, statSync, type Stats } from 'node:fs'
import { dirname, join } from 'node:path'
import { GUARD_RULES } from './catalog.ts'
import type { LiftRecord } from './records.ts'
import type { AgentLike, DerivedMessage } from '../shared/dsh-min.ts'

/** The path relative to the project root; the exact file appendLift appends to. */
const LIFTS_FILE = join('docs', 'guard', 'lifts.jsonl')

/**
 * The record file's absolute path in one project root, forward slashes: the
 * spelling the report reads it by and names in its source fields (status hub
 * design 0.3 §3.2, batch 4). One definition for the report and the guard
 * row's status view.
 */
export function liftRecordPath(root: string): string {
  return `${root.replaceAll('\\', '/')}/docs/guard/lifts.jsonl`
}

interface LiftLine {
  readonly at: string
  readonly rule: string
  readonly action: 'lift' | 'restore'
  readonly via: 'chat' | 'board'
  readonly words: string
}

const isLiftLine = (value: unknown): value is LiftLine => {
  if (typeof value !== 'object' || value === null) return false
  const line = value as Record<string, unknown>
  return typeof line.at === 'string' && typeof line.rule === 'string' && line.rule.length > 0
    && (line.action === 'lift' || line.action === 'restore')
    && (line.via === 'chat' || line.via === 'board')
    && typeof line.words === 'string'
}

/** One parsed line of the file, all the fields the readers share (the reconciliation keys on at, rule, action; `lifted` reads via and words). */
interface LiftLineFact {
  readonly at: string
  readonly rule: string
  readonly action: 'lift' | 'restore'
  readonly via: 'chat' | 'board'
  readonly words: string
}

export interface LiftStates {
  /** The final state per rule: the last valid line's action. */
  readonly states: ReadonlyMap<string, 'lift' | 'restore'>
  /** The valid lines, in file order. */
  readonly lines: readonly LiftLineFact[]
  /** Lines a hand may have written: skipped, counted, never lifting. */
  readonly unreadable: number
}

/** The states of one file's text: the shared parse of the gate, the tool, the service and the morning report (design §3.10). */
export function liftStatesOf(text: string): LiftStates {
  const states = new Map<string, 'lift' | 'restore'>()
  const lines: LiftLineFact[] = []
  let unreadable = 0
  for (const line of text.split('\n')) {
    if (line.trim().length === 0) continue
    try {
      const parsed: unknown = JSON.parse(line)
      if (isLiftLine(parsed)) {
        states.set(parsed.rule, parsed.action)
        lines.push({ at: parsed.at, rule: parsed.rule, action: parsed.action, via: parsed.via, words: parsed.words })
        continue
      }
    }
    catch {
      // Not JSON: a line a hand may have written.
    }
    unreadable += 1
  }
  return { states, lines, unreadable }
}

interface Cached {
  readonly size: number
  readonly mtime: number
  readonly lifted: ReadonlySet<string>
  readonly unreadable: number
  readonly readable: boolean
}

const cache = new Map<string, Cached>()

const EMPTY: ReadonlySet<string> = new Set()

/** The states of the file at `root`; `readable: false` when it exists but cannot be read, absent otherwise (both lift nothing). */
export function liftedRulesOf(root: string): { readonly lifted: ReadonlySet<string>, readonly unreadable: number, readonly readable: boolean } {
  const file = join(root, LIFTS_FILE)
  let stats: Stats
  try {
    stats = statSync(file)
  }
  catch (error) {
    // The file absent equals no lift (design §3.5); only an error of another kind is the degraded read.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { lifted: EMPTY, unreadable: 0, readable: true }
    return { lifted: EMPTY, unreadable: 0, readable: false }
  }
  const known = cache.get(root)
  if (known !== undefined && known.size === stats.size && known.mtime === stats.mtimeMs) {
    return { lifted: known.lifted, unreadable: known.unreadable, readable: known.readable }
  }
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  }
  catch {
    // Unreadable lifts nothing and the rules keep blocking (design §3.5); the row health names the downgrade.
    const fresh: Cached = { size: stats.size, mtime: stats.mtimeMs, lifted: EMPTY, unreadable: 0, readable: false }
    cache.set(root, fresh)
    return { lifted: fresh.lifted, unreadable: 0, readable: false }
  }
  const states = liftStatesOf(text)
  const lifted = new Set<string>()
  for (const [rule, action] of states.states) if (action === 'lift') lifted.add(rule)
  const fresh: Cached = { size: stats.size, mtime: stats.mtimeMs, lifted, unreadable: states.unreadable, readable: true }
  cache.set(root, fresh)
  return { lifted: fresh.lifted, unreadable: fresh.unreadable, readable: true }
}

/** The ids of the rules currently lifted in the project at `root`; empty when the file is absent or unreadable. */
export function liftedRules(root: string): ReadonlySet<string> {
  return liftedRulesOf(root).lifted
}

/** The parse of the project's lift file right now, or undefined when it is absent or unreadable; a fresh read (the file is small). */
export function liftFileStates(root: string): LiftStates | undefined {
  try {
    return liftStatesOf(readFileSync(join(root, LIFTS_FILE), 'utf8'))
  }
  catch {
    return undefined
  }
}

/** Drop the cached states of one project: appendLift calls it, so the next judgment re-reads. */
function forgetLifts(root: string): void {
  cache.delete(root)
}

/**
 * Append one line to the project's lift record and forget the cache. The
 * directory is created when missing (the file rides in git; the first lift
 * on a fresh clone makes it). Throws when the file cannot be written: the
 * callers turn that into `unavailable` and the rules keep blocking.
 */
export async function appendLift(root: string, line: LiftLine): Promise<void> {
  const file = join(root, LIFTS_FILE)
  await mkdir(dirname(file), { recursive: true })
  let text = ''
  try {
    text = await readFile(file, 'utf8')
  }
  catch {
    // Absent: the append starts the file (a leading newline would be a bad line).
  }
  await appendFile(file, `${text === '' || text.endsWith('\n') ? '' : '\n'}${JSON.stringify(line)}\n`)
  forgetLifts(root)
}

/**
 * The words a human uses to stop or restore a rule (design §3.5 step 4).
 * Permission lists: changing them is a `norm-review-floor` change. Chinese
 * words match by substring, English ones by whole word, case-insensitive.
 */
export const LIFT_WORDS: readonly string[] = ['别拦', '不拦', '不用拦', '先别拦', '撤下', '关掉', '放开', '解除', '去掉', '还给你', 'lift', 'unblock', 'stop blocking', 'disable']
export const RESTORE_WORDS: readonly string[] = ['恢复', '拦回来', '重新拦', 'restore']
export const NEGATIONS: readonly string[] = ['不要', '别', '不能', '不可', '不许', '不准', '千万别', "don't", 'do not', 'never']

const isHan = (word: string): boolean => /[\u4e00-\u9fff]/.test(word)

/** Whether the hit at `index` is negated: the text hugging it before (whitespace removed) ends with a negation (design §3.5 step 4-2). */
function negatedAt(text: string, index: number): boolean {
  const lowered = text.slice(0, index).replace(/\s+/g, '').toLowerCase()
  return NEGATIONS.some(negation => isHan(negation)
    ? lowered.endsWith(negation)
    : new RegExp(`(?:^|[^a-z'])${negation.toLowerCase().replace("'", "['’’]")}$`, 'i').test(lowered))
}

/** Whether `text` contains a word of `list` with one occurrence not negated (design §3.5 step 4-2): han words by substring, the rest by whole word. */
export function hasIntentWord(text: string, list: readonly string[]): boolean {
  for (const word of list) {
    if (isHan(word)) {
      let at = text.indexOf(word)
      while (at >= 0) {
        if (!negatedAt(text, at)) return true
        at = text.indexOf(word, at + 1)
      }
      continue
    }
    const pattern = new RegExp(`(?:^|[^A-Za-z'’])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace("'", "['’’]")}(?![A-Za-z'’])`, 'gi')
    let match = pattern.exec(text)
    while (match !== null) {
      if (!negatedAt(text, match.index)) return true
      match = pattern.exec(text)
    }
  }
  return false
}

/** The message's latest person message: `role 'user'`, `source.kind 'user'`, no `source.form` (design §3.5 step 4; notices and snapshots are not). */
function lastPersonMessage(history: readonly DerivedMessage[]): DerivedMessage | undefined {
  for (let index = history.length - 1; index >= 0; index--) {
    const message = history[index]
    if (message.role !== 'user') continue
    const source = message.source
    if (typeof source !== 'object' || source === null) continue
    if (source.kind !== 'user' || source.form !== undefined) continue
    return message
  }
  return undefined
}

/** The text of one message: its text blocks joined by line breaks. */
function textOf(message: DerivedMessage): string {
  return (message.content ?? []).flatMap(block => block.type === 'text' && typeof block.text === 'string' ? [block.text] : []).join('\n')
}

/** NFKC, whitespace collapsed to one space: the comparison form of the segment check (design §3.5 step 4-1). */
const normalizeSaid = (text: string): string => text.normalize('NFKC').replace(/\s+/g, ' ').trim()

/**
 * Whether `words` is a whole segment of the person message: the boundaries
 * fall on the message's start or end, or on whitespace or punctuation
 * (design §3.5 step 4-1) — a quote cannot cut a word in half and change what
 * the human meant.
 */
export function saidSegment(message: string, words: string): boolean {
  const haystack = normalizeSaid(message)
  const needle = normalizeSaid(words)
  if (needle.length === 0) return false
  let at = haystack.indexOf(needle)
  while (at >= 0) {
    const beforeOk = at === 0 || /[\s\p{P}]/u.test(haystack[at - 1] ?? '')
    const end = at + needle.length
    const afterOk = end >= haystack.length || /[\s\p{P}]/u.test(haystack[end] ?? '')
    if (beforeOk && afterOk) return true
    at = haystack.indexOf(needle, at + 1)
  }
  return false
}

/** The ids remembered as already exchanged for a successful lift, per `rpcId`; the oldest leaves first (design §3.5 step 4-4). */
const SPENT_LIMIT = 64
const spent = new Set<string>()

const noteSpent = (rpcId: string): void => {
  spent.add(rpcId)
  if (spent.size > SPENT_LIMIT) spent.delete(spent.keys().next().value as string)
}

/** How guardLift refused: the codes of design §3.5, thrown as the graph tools' `{code, message, hint}` JSON. */
interface LiftRefusal {
  readonly code: 'forbidden' | 'invalid' | 'not_said' | 'unavailable'
  readonly message: string
  readonly hint: string
}

export interface LiftSuccess {
  readonly outcome: 'lifted' | 'restored' | 'noop'
  readonly rule: string
  readonly title: string
  readonly blocks: string
  readonly message: string
}

export interface GuardLiftArgs {
  readonly rule?: unknown
  readonly words?: unknown
  readonly action?: unknown
}

export interface GuardLiftDeps {
  readonly agent: AgentLike | undefined
  readonly root: string | undefined
  readonly record: (record: LiftRecord) => Promise<unknown> | void
  readonly now: () => Date
}

const LIFT_MESSAGE = (title: string, blocks: string, rule: string): string =>
  `Tell the human in your reply that ${title} is now lifted for this project and no longer blocks ${blocks}. To put it back, the human says so and you call guard_lift again with action "restore" and their words; once the rules board offers it for code rules, /rules restore ${rule} there does the same. Steps from now on do not list the rule in the system prompt, so this session's prompt cache is rebuilt once.`

/**
 * The `guard_lift` body (design §3.5 steps 1–7): the caller is the root
 * agent, the arguments and the rule id are valid, the words are a segment of
 * the human's own latest client message and carry an intent word, and one
 * message lifts once. Refusals throw the `{code, message, hint}` JSON, as
 * the graph tools' `refuse` does.
 */
export async function guardLift(args: GuardLiftArgs, deps: GuardLiftDeps): Promise<LiftSuccess> {
  function refuse(result: LiftRefusal): never {
    throw new Error(JSON.stringify(result))
  }

  // Step 1: the caller is the root agent (the session header carries no subagent origin).
  if (deps.agent?.session?.header.origin === 'subagent') {
    refuse({ code: 'forbidden', message: 'a subagent cannot lift rules', hint: 'a subagent cannot lift rules: report to the main agent' })
  }
  // Step 2: the arguments are valid.
  const { rule, words, action } = args
  if (typeof rule !== 'string' || rule.length === 0 || typeof words !== 'string' || words.length === 0 || words.length > 500) {
    refuse({ code: 'invalid', message: 'the arguments do not fit', hint: 'pass the rule id and the clause where the human asks for it, copied exactly' })
  }
  if (action !== undefined && action !== 'lift' && action !== 'restore') {
    refuse({ code: 'invalid', message: 'the arguments do not fit', hint: 'action is "lift" or "restore"' })
  }
  const wanted = action ?? 'lift'
  // Step 3: the rule is one of the catalog's.
  const entry = GUARD_RULES.find(candidate => candidate.id === rule)
  if (entry === undefined) {
    refuse({ code: 'invalid', message: 'unknown rule', hint: `liftable ids: ${GUARD_RULES.filter(candidate => candidate.liftVia === 'any').map(candidate => candidate.id).join(', ')}` })
  }
  if (entry.liftVia === 'board') {
    refuse({ code: 'forbidden', message: 'the rule protects the lift record itself', hint: 'this rule protects the lift record itself, so only the human can lift it, with /rules lift lift-files-only once the rules board offers that for code rules; until then it cannot be lifted' })
  }
  // Step 4: the words are the human's own.
  if (deps.agent?.session === undefined || typeof deps.agent.session.deriveMessages !== 'function') {
    refuse({ code: 'not_said', message: 'the human\'s words could not be read', hint: 'quote the clause where the human asks to stop or restore this rule, exactly as they wrote it' })
  }
  const history = deps.agent.session.deriveMessages() as readonly DerivedMessage[]
  const person = lastPersonMessage(history)
  const rpcId = typeof person?.source?.rpcId === 'string' ? person.source.rpcId : undefined
  if (person === undefined || rpcId === undefined) {
    refuse({ code: 'not_said', message: 'the words are not the human\'s latest message', hint: 'quote the clause where the human asks to stop or restore this rule, exactly as they wrote it; if they did not ask for this, do not call it; if they asked for several rules, lift one and ask them to say the others' })
  }
  const said = textOf(person)
  if (!saidSegment(said, words) || words.replace(/\s/g, '').length < 4 || !hasIntentWord(words, wanted === 'lift' ? LIFT_WORDS : RESTORE_WORDS)) {
    refuse({ code: 'not_said', message: 'the words are not the human\'s ask', hint: 'quote the clause where the human asks to stop or restore this rule, exactly as they wrote it; if they did not ask for this, do not call it; if they asked for several rules, lift one and ask them to say the others' })
  }
  if (spent.has(rpcId)) {
    refuse({ code: 'not_said', message: 'this human message already lifted a rule', hint: 'the human says it again, or answers for the rule still held: one human message lifts at most one rule' })
  }
  // Step 5: the state may already be the wanted one.
  if (deps.root === undefined) {
    refuse({ code: 'unavailable', message: 'the project root could not be found', hint: 'tell the human the rule could not be lifted (no project); they can ask again (once the rules board offers it for code rules, /rules lift there is another way)' })
  }
  const state = liftedRulesOf(deps.root)
  if (!state.readable) {
    refuse({ code: 'unavailable', message: 'the lift record could not be read', hint: 'tell the human the rule could not be lifted (the record is unreadable); they can ask again (once the rules board offers it for code rules, /rules lift there is another way)' })
  }
  const isLifted = state.lifted.has(rule)
  if (wanted === 'lift' ? isLifted : !isLifted) {
    return { outcome: 'noop', rule, title: entry.title, blocks: entry.blocks, message: `${entry.title} is already ${wanted === 'lift' ? 'lifted' : 'in force'}; nothing was written. Tell the human.` }
  }
  // Step 6: the record line goes into the project's file.
  const at = deps.now().toISOString()
  try {
    await appendLift(deps.root, { at, rule, action: wanted, via: 'chat', words: words.slice(0, 500) })
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? 'error'
    refuse({ code: 'unavailable', message: `the lift record could not be written (${code})`, hint: `tell the human the rule could not be lifted (${code}); they can ask again (once the rules board offers it for code rules, /rules lift <id> there is another way)` })
  }
  // Step 7: the violation journal keeps the lift, like every harness write.
  noteSpent(rpcId)
  void deps.record({ kind: 'lift', at, rule, action: wanted, via: 'chat', sessionId: deps.agent?.session?.id, words: words.slice(0, 500) })
  return { outcome: wanted === 'lift' ? 'lifted' as const : 'restored' as const, rule, title: entry.title, blocks: entry.blocks, message: LIFT_MESSAGE(entry.title, entry.blocks, rule) }
}
