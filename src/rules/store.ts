/**
 * The rules board's storage in the project's `.llm/rules/` (docs/ORCHESTRATION.md
 * §16; design §7.1, §7.4, §7.5): an append-only journal that is the source
 * of truth, and a snapshot that is a cache of it. A write appends its
 * journal record and syncs it, then replaces the snapshot atomically; a
 * crash between the two leaves a journal that is ahead, and the next read
 * catches the snapshot up. A reader that finds the two files disagreeing
 * rebuilds the state by replaying the journal.
 *
 * One pure function, `applyRecord`, is the only way a state changes, for a
 * write and for a replay alike. It reads no clock, file or process table:
 * every decision that depends on them is made when the write is planned and
 * is written into the record's `changes`. Each record carries the digest of
 * the state it leaves, so a replay verifies it; a line that was appended
 * from outside, or altered, does not match and does not take effect.
 *
 * Reading is synchronous and writes nothing (`loadState`); persisting what a
 * read found (`persistLoad`) is done by a caller that holds the write lock.
 */
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { copyFile, mkdir, open, rename as renameFile, truncate, unlink, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { ensureIgnored } from '../data/project-root.ts'
import { canonicalJson, compareCodePoints, emptyState, stateProblem, withoutEmptyCollections, type Change, type JournalRecord, type ProjectState, type RecoveryReason, type SkippedRecord } from './model.ts'

/** The rules directory in the repository, relative to the project root. */
export const DEFAULT_RULES_DIR = 'docs/rules'

export interface RulesPaths {
  readonly projectRoot: string
  /** `<root>/.llm/rules`: runtime state, not in git. */
  readonly runtimeDir: string
  /** The rules directory in the repository (absolute). */
  readonly rulesDir: string
  readonly state: string
  readonly pending: string
  readonly journal: string
  readonly lock: string
  readonly repoWritten: string
  /** `<rulesDir>/rules.json`: what the person decided, exported for git. */
  readonly rulesFile: string
}

/** The files of one project. `rulesDir` is relative to the root unless absolute. */
export function rulesPaths(projectRoot: string, rulesDir: string = DEFAULT_RULES_DIR): RulesPaths {
  const runtimeDir = join(projectRoot, '.llm', 'rules')
  const rules = isAbsolute(rulesDir) ? rulesDir : join(projectRoot, rulesDir)
  return {
    projectRoot,
    runtimeDir,
    rulesDir: rules,
    state: join(runtimeDir, 'state.json'),
    pending: join(runtimeDir, '.state.json.pending'),
    journal: join(runtimeDir, 'journal.jsonl'),
    lock: join(runtimeDir, 'rules.lock'),
    repoWritten: join(runtimeDir, 'repo-written.json'),
    rulesFile: join(rules, 'rules.json'),
  }
}

/**
 * Create `<root>/.llm/rules/` for a first write, after git has been told to
 * ignore `.llm/` (`d-rules-in-repo`): the journal, snapshot and lock are
 * runtime state and must not show up as untracked files, or be committed by
 * `git add -A`, in a project whose own ignore files know nothing about them.
 * Throws when the ignore entry cannot be made; the directory is then not created.
 */
export async function ensureRuntimeDir(paths: RulesPaths): Promise<void> {
  await ensureIgnored(paths.projectRoot, '.llm')
  await mkdir(paths.runtimeDir, { recursive: true })
}

const digestOf = (text: string, length: number): string => createHash('sha256').update(text).digest('hex').slice(0, length)

/** The state as it is stored and digested: canonical serialization, a collection that is empty left out (rules design §7.2). */
const storedText = (state: ProjectState): string => canonicalJson(withoutEmptyCollections(state))

/**
 * The first 16 hex digits of the SHA-256 of the state as it is stored. A
 * collection that is empty counts as absent, so a state the full board has
 * extended with empty collections digests like the one this slice wrote.
 */
export function stateDigest(state: ProjectState): string {
  return digestOf(storedText(state), 16)
}

/** The first 16 hex digits of the SHA-256 of a text's UTF-8 bytes: the digest of the rules file. */
export function textDigest(text: string): string {
  return digestOf(text, 16)
}

/** The top-level fields a change replaces or deletes as a whole. */
const FIELDS: readonly string[] = ['peakMode', 'repo', 'recovered', 'nextTicket']

/** The collections a change touches one entry of; `proposals` of the full design is not among them. */
const COLLECTIONS: readonly string[] = ['rules', 'signals', 'detectors', 'scripts', 'tickets', 'notices', 'unresolved']

/**
 * The state after a record. Pure: it reads no clock, file or process table.
 * A path outside the list the state has, or a missing `repo`, throws; a
 * replay reads that as a record that does not take effect. A collection the
 * record leaves empty is absent from the result (deleting the last entry of
 * `rules` removes `rules`).
 */
export function applyRecord(state: ProjectState, record: { readonly seq: number, readonly changes: readonly Change[] }): ProjectState {
  const next: Record<string, unknown> = { ...state }
  for (const change of record.changes) {
    if (typeof change !== 'object' || change === null || !Array.isArray(change.path)) throw new Error('a change needs a path')
    const [head, entry] = change.path as readonly string[]
    if (change.path.length === 1 && head !== undefined && FIELDS.includes(head)) {
      if (change.value !== undefined) next[head] = change.value
      else if (head === 'repo') throw new Error('the repo field cannot be deleted')
      else delete next[head]
    }
    else if (change.path.length === 2 && head !== undefined && COLLECTIONS.includes(head) && entry !== undefined) {
      // An entry named __proto__ would set the collection's prototype instead of an entry.
      if (entry === '__proto__') throw new Error('__proto__ is not an entry name')
      const collection = { ...(next[head] as Record<string, unknown> | undefined) }
      if (change.value === undefined) delete collection[entry]
      else collection[entry] = change.value
      next[head] = collection
    }
    else throw new Error(`${JSON.stringify(change.path)} is not a path of the state`)
  }
  next.seq = record.seq
  return withoutEmptyCollections(next) as unknown as ProjectState
}

/**
 * The changes that turn one state into the other: one for each top-level field and each collection entry whose content
 * differs, in key order, a deletion for what only `before` has. The sequence number is the record's, not a change.
 * `applyRecord(before, { seq, changes: changesBetween(before, after) })` is `after` with that sequence number.
 */
export function changesBetween(before: ProjectState, after: ProjectState): Change[] {
  const was = before as unknown as Record<string, unknown>
  const now = after as unknown as Record<string, unknown>
  const union = (a: object, b: object): string[] => [...new Set([...Object.keys(a), ...Object.keys(b)])].sort(compareCodePoints)
  const changes: Change[] = []
  for (const name of union(was, now).filter(field => field !== 'seq' && field !== 'version')) {
    if (!COLLECTIONS.includes(name)) {
      if (canonicalJson(was[name]) !== canonicalJson(now[name])) changes.push(now[name] === undefined ? { path: [name] } : { path: [name], value: now[name] })
      continue
    }
    const held = (was[name] ?? {}) as Record<string, unknown>
    const next = (now[name] ?? {}) as Record<string, unknown>
    for (const id of union(held, next)) {
      if (canonicalJson(held[id]) !== canonicalJson(next[id])) changes.push(next[id] === undefined ? { path: [name, id] } : { path: [name, id], value: next[id] })
    }
  }
  return changes
}

type Line = { readonly text: string } & (
  | { readonly kind: 'record', readonly record: JournalRecord }
  /** An object without the fields every record has; `fields` is what it does say, for the person who looks at it. */
  | { readonly kind: 'foreign', readonly fields: Partial<JournalRecord> }
  | { readonly kind: 'unreadable' }
)

function parseLine(text: string): Line {
  let value: unknown
  try {
    value = JSON.parse(text)
  }
  catch {
    return { text, kind: 'unreadable' }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { text, kind: 'unreadable' }
  const record = value as Partial<JournalRecord>
  const whole = Number.isInteger(record.seq) && record.seq !== undefined && record.seq > 0 && Array.isArray(record.changes) && typeof record.snapshot === 'string' && /^[0-9a-f]{16}$/.test(record.snapshot)
  // An object without the fields every engine record has was not written by the engine: it does not break the chain.
  return whole ? { text, kind: 'record', record: record as JournalRecord } : { text, kind: 'foreign', fields: record }
}

interface JournalRead {
  readonly lines: readonly Line[]
  /** The unfinished last line (no newline), or ''. */
  readonly tail: string
  /** Byte length of the complete lines. */
  readonly completeBytes: number
}

/** The text of a file, or undefined when it does not exist; other failures throw. */
export function readText(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

function parseJournal(raw: string): JournalRead {
  const end = raw.lastIndexOf('\n') + 1
  const complete = raw.slice(0, end)
  return {
    lines: complete.split('\n').slice(0, -1).filter(text => text.trim() !== '').map(parseLine),
    tail: raw.slice(end),
    completeBytes: Buffer.byteLength(complete),
  }
}

const readJournal = (file: string): JournalRead => parseJournal(readText(file) ?? '')

/** The name of a journal file that was rotated: it holds the records up to this sequence number. */
const rotatedName = (seq: number): string => `journal-${seq}.jsonl`

type SnapshotRead = { readonly kind: 'missing' } | { readonly kind: 'corrupt' } | { readonly kind: 'ok', readonly state: ProjectState }

function readSnapshot(file: string): SnapshotRead {
  const raw = readText(file)
  if (raw === undefined) return { kind: 'missing' }
  try {
    const value: unknown = JSON.parse(raw)
    return stateProblem(value) === undefined ? { kind: 'ok', state: value as ProjectState } : { kind: 'corrupt' }
  }
  catch {
    return { kind: 'corrupt' }
  }
}

const REASON_ORDER: readonly RecoveryReason[] = ['snapshot-behind', 'snapshot-corrupt', 'snapshot-modified', 'journal-shorter', 'journal-tail', 'journal-unreadable', 'journal-not-engine']

/** What a writer has to persist after a read found the files disagreeing. */
interface LoadPlan {
  /** A snapshot that a failed rename left as `.state.json.pending` is the newest state: move it over `state.json`. */
  readonly adoptPending: boolean
  /** The snapshot is behind the journal and nothing else is wrong: rewrite it, without a record. */
  readonly rewriteSnapshot: boolean
  /** Something did not take effect or the snapshot is replaced: write a `recovered` record. */
  readonly recovered?: {
    readonly reason: RecoveryReason
    readonly lost: boolean
    /** Lines that did not take effect, without labels (the record assigns them). */
    readonly skipped: readonly SkippedRecord[]
    /** The unfinished last line, to cut off the journal. */
    readonly tail: string
    readonly completeBytes: number
    /** Copy the whole journal aside: it has lines nothing could read. */
    readonly copyJournal: boolean
    /** The old snapshot parses but is replaced: keep it aside. */
    readonly replaceSnapshot: boolean
  }
}

export interface LoadResult {
  readonly state: ProjectState
  readonly source: 'empty' | 'snapshot' | 'pending' | 'replay'
  /** Every finding of this read, the most serious last. */
  readonly reasons: readonly RecoveryReason[]
  readonly plan?: LoadPlan
  /** The sequence number the next record gets: one past the highest that parses, unfinished or foreign lines aside. */
  readonly nextSeq: number
  /** The journal has no complete line and the snapshot is absent: the project has no state of its own yet. */
  readonly fresh: boolean
}

function keyOf(line: Line): string {
  return digestOf(line.text, 12)
}

function skip(line: Line, why: SkippedRecord['why'], afterSeq: number): SkippedRecord {
  const record: Partial<JournalRecord> | undefined = line.kind === 'record' ? line.record : line.kind === 'foreign' ? line.fields : undefined
  return {
    key: keyOf(line),
    label: '',
    ...(typeof record?.seq === 'number' && Number.isInteger(record.seq) ? { seq: record.seq } : {}),
    afterSeq,
    why,
    ...(typeof record?.actor === 'string' ? { actor: record.actor } : {}),
    ...(typeof record?.op === 'string' ? { op: record.op } : {}),
    ...(typeof record?.target === 'string' ? { target: record.target } : {}),
  }
}

function tryApply(state: ProjectState, record: JournalRecord): ProjectState | undefined {
  try {
    const candidate = applyRecord(state, record)
    return stateDigest(candidate) === record.snapshot ? candidate : undefined
  }
  catch {
    return undefined
  }
}

/** The full state a `base` or `recovered` record carries, when it is whole: the point a replay can restart from. */
function anchorOf(record: JournalRecord): ProjectState | undefined {
  if (record.op !== 'base' && record.op !== 'recovered') return undefined
  if (record.state === undefined || stateProblem(record.state) !== undefined) return undefined
  return stateDigest(record.state) === record.snapshot ? record.state : undefined
}

/** The keys a `recovered` record registered in `unresolved`: they were reported when it was written. */
function registeredKeys(record: JournalRecord): ReadonlySet<string> {
  return new Set(record.changes.flatMap(change => typeof change === 'object' && change !== null && Array.isArray(change.path) && change.path.length === 2 && change.path[0] === 'unresolved' ? [change.path[1]] : []))
}

function replay(lines: readonly Line[], from: number, start: ProjectState): { readonly state: ProjectState, readonly skipped: SkippedRecord[] } {
  let state = start
  let skipped: SkippedRecord[] = []
  let brokenAt: number | undefined
  for (const line of lines.slice(from)) {
    if (line.kind === 'unreadable') {
      skipped.push(skip(line, 'unreadable', state.seq))
      brokenAt ??= skipped.length - 1
      continue
    }
    if (line.kind === 'foreign') {
      skipped.push(skip(line, 'digest-mismatch', state.seq))
      continue
    }
    const { record } = line
    if (brokenAt === undefined) {
      const next = tryApply(state, record)
      if (next === undefined) {
        skipped.push(skip(line, 'digest-mismatch', state.seq))
        continue
      }
      state = next
      if (record.op === 'recovered') {
        const registered = registeredKeys(record)
        skipped = skipped.filter(entry => !registered.has(entry.key))
      }
      continue
    }
    // The chain is broken: only an anchor, a record that holds the whole state, restarts it.
    const anchor = anchorOf(record)
    if (anchor === undefined) {
      skipped.push(skip(line, 'after-unreadable', state.seq))
      continue
    }
    const registered = registeredKeys(record)
    const brokeAt = brokenAt
    state = anchor
    skipped = skipped
      .map((entry, index) => index >= brokeAt && entry.why === 'after-unreadable' ? { ...entry, why: 'covered-by-anchor' as const, coveredBy: record.seq } : entry)
      .filter(entry => !registered.has(entry.key))
    brokenAt = undefined
  }
  return { state, skipped }
}

/**
 * The journal files that make one journal, oldest first, the current one last (design §7.5 step 1, §7.6). A rotation
 * sets the full file aside as `journal-<last seq>.jsonl` and starts the next with a `base`; so a file that begins with
 * a base at sequence number B carries on from `journal-<B - 1>.jsonl`, and only when the highest sequence number in
 * that file is B - 1. A file with that name that is not what the base carries on from (a copy a rotation made before
 * it was interrupted, or one that was edited) is not part of the journal, and the walk stops where it cannot go on.
 */
function journalChain(paths: RulesPaths, current: JournalRead): readonly JournalRead[] {
  const chain: JournalRead[] = [current]
  for (;;) {
    const head = chain[0]?.lines[0]
    if (head?.kind !== 'record' || head.record.op !== 'base') break
    const earlier = readText(join(paths.runtimeDir, rotatedName(head.record.seq - 1)))
    if (earlier === undefined) break
    const file = parseJournal(earlier)
    const highest = Math.max(0, ...file.lines.flatMap(line => line.kind === 'record' ? [line.record.seq] : []))
    if (highest !== head.record.seq - 1) break
    chain.unshift(file)
  }
  return chain
}

/** Where a replay of the files restarts: after the record the snapshot was made from, else after the latest whole anchor at the head of a file, else from nothing. */
function startOf(chain: readonly JournalRead[], snapshot: ProjectState | undefined, matching: number): { readonly from: number, readonly start: ProjectState } {
  if (snapshot !== undefined && matching >= 0) return { from: matching + 1, start: snapshot }
  let offset = chain.reduce((sum, file) => sum + file.lines.length, 0)
  for (const file of [...chain].reverse()) {
    offset -= file.lines.length
    const head = file.lines[0]
    const anchor = head?.kind === 'record' ? anchorOf(head.record) : undefined
    if (anchor !== undefined) return { from: offset + 1, start: anchor }
  }
  return { from: 0, start: emptyState() }
}

/**
 * The whole journal directory replayed in one go: every file the current one carries on from, in order, from nothing
 * (or from the whole anchor the oldest file begins with, when the files before it are gone). Every record is checked
 * like any other, a `base` included, so a chain of bases that does not carry on shows up as lines that did not take
 * effect. Reads only.
 */
export function replayJournals(paths: RulesPaths): { readonly state: ProjectState, readonly skipped: readonly SkippedRecord[] } {
  const history = journalChain(paths, readJournal(paths.journal)).flatMap(file => file.lines)
  const head = history[0]
  const anchor = head?.kind === 'record' ? anchorOf(head.record) : undefined
  return anchor === undefined ? replay(history, 0, emptyState()) : replay(history, 1, anchor)
}

/** The `changes` of the lines listed under these keys (`unresolved`), once each, in the order the journal has them; a line with no changes has none. */
export function skippedLines(paths: RulesPaths, keys: ReadonlySet<string>): ReadonlyArray<{ readonly key: string, readonly changes: unknown }> {
  const found: Array<{ readonly key: string, readonly changes: unknown }> = []
  for (const line of journalChain(paths, readJournal(paths.journal)).flatMap(file => file.lines)) {
    const key = keyOf(line)
    if (keys.has(key) && !found.some(item => item.key === key)) found.push({ key, changes: line.kind === 'record' ? line.record.changes : line.kind === 'foreign' ? line.fields.changes : undefined })
  }
  return found
}
/**
 * Read the state of a project from its files, without writing and without
 * the lock (docs/ORCHESTRATION.md §16; design §7.5). The snapshot is used
 * as it is when the journal ends with exactly the record it was made from;
 * otherwise the journal is replayed through `applyRecord`, verifying every
 * record's digest, and `plan` says what a writer should persist.
 */
export function loadState(paths: RulesPaths): LoadResult {
  const journal = readJournal(paths.journal)
  const snapshot = readSnapshot(paths.state)
  const pending = readSnapshot(paths.pending)
  const { lines } = journal
  const records = lines.flatMap(line => line.kind === 'record' ? [line.record] : [])
  const nextSeq = Math.max(0, ...records.map(record => record.seq)) + 1
  const last = lines.at(-1)
  const cutTail = journal.tail === ''
    ? undefined
    : { reason: 'journal-tail' as const, skipped: [] as SkippedRecord[], lost: false, tail: journal.tail, completeBytes: journal.completeBytes, copyJournal: false, replaceSnapshot: false }
  const fresh = lines.length === 0 && snapshot.kind === 'missing' && pending.kind === 'missing'
  const done = (state: ProjectState, source: LoadResult['source'], reasons: readonly RecoveryReason[], plan?: LoadPlan): LoadResult => ({
    state,
    source,
    reasons,
    ...(plan === undefined ? {} : { plan }),
    nextSeq: Math.max(nextSeq, state.seq + 1),
    fresh,
  })
  const tailPlan: LoadPlan | undefined = cutTail === undefined ? undefined : { adoptPending: false, rewriteSnapshot: false, recovered: cutTail }

  if (lines.length === 0 && snapshot.kind === 'missing' && pending.kind === 'missing') return done(emptyState(), 'empty', cutTail === undefined ? [] : ['journal-tail'], tailPlan)

  if (snapshot.kind === 'ok' && last?.kind === 'record' && last.record.seq === snapshot.state.seq && last.record.snapshot === stateDigest(snapshot.state)) {
    return done(snapshot.state, 'snapshot', cutTail === undefined ? [] : ['journal-tail'], tailPlan)
  }

  if (pending.kind === 'ok' && last?.kind === 'record' && last.record.seq === pending.state.seq && last.record.snapshot === stateDigest(pending.state)) {
    const plan: LoadPlan = { adoptPending: true, rewriteSnapshot: false, ...(cutTail === undefined ? {} : { recovered: cutTail }) }
    return done(pending.state, 'pending', cutTail === undefined ? [] : ['journal-tail'], plan)
  }

  // Replay. The start is the snapshot when the journal has the record it was made from (it may be in the file a rotation set aside), else the latest `base` that is whole at the head of a file, else nothing.
  const chain = journalChain(paths, journal)
  const history = chain.flatMap(file => file.lines)
  const matching = snapshot.kind === 'ok' ? history.findIndex(line => line.kind === 'record' && line.record.seq === snapshot.state.seq && line.record.snapshot === stateDigest(snapshot.state)) : -1
  const { from, start } = startOf(chain, matching >= 0 && snapshot.kind === 'ok' ? snapshot.state : undefined, matching)
  const { state, skipped } = replay(history, from, start)
  const everyRecord = history.flatMap(line => line.kind === 'record' ? [line.record] : [])

  const reasons = new Set<RecoveryReason>()
  const parseableSnapshotReplaced = snapshot.kind === 'ok' && matching < 0
  if (matching >= 0 && snapshot.kind === 'ok' && state.seq > snapshot.state.seq) reasons.add('snapshot-behind')
  if (matching < 0) {
    if (snapshot.kind === 'ok') reasons.add(everyRecord.some(record => record.seq >= snapshot.state.seq) ? 'snapshot-modified' : 'journal-shorter')
    else reasons.add('snapshot-corrupt')
  }
  if (cutTail !== undefined) reasons.add('journal-tail')
  if (skipped.some(entry => entry.why === 'unreadable' || entry.why === 'after-unreadable' || entry.why === 'covered-by-anchor')) reasons.add('journal-unreadable')
  if (skipped.some(entry => entry.why === 'digest-mismatch')) reasons.add('journal-not-engine')
  const ordered = REASON_ORDER.filter(reason => reasons.has(reason))
  const mustRecord = skipped.length > 0 || ordered.some(reason => reason !== 'snapshot-behind')
  const plan: LoadPlan = mustRecord
    ? {
        adoptPending: false,
        rewriteSnapshot: false,
        recovered: {
          reason: ordered.at(-1) ?? 'snapshot-corrupt',
          lost: skipped.some(entry => entry.why === 'after-unreadable'),
          skipped,
          tail: journal.tail,
          completeBytes: journal.completeBytes,
          copyJournal: skipped.some(entry => entry.why === 'unreadable' || entry.why === 'after-unreadable' || entry.why === 'covered-by-anchor'),
          replaceSnapshot: parseableSnapshotReplaced,
        },
      }
    : { adoptPending: false, rewriteSnapshot: true }
  return done(state, 'replay', ordered, plan)
}

export interface StoreIo {
  readonly rename: (from: string, to: string) => Promise<void>
  readonly sleep: (ms: number) => Promise<void>
  readonly now: () => number
}

export const realStoreIo: StoreIo = {
  rename: renameFile,
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  now: () => Date.now(),
}

/** Waits between the attempts to rename over a file a reader has open (Windows answers EPERM or EBUSY). */
const RENAME_BACKOFF_MS = [20, 40, 80, 160, 320]

export async function renameWithRetry(io: StoreIo, from: string, to: string): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    try {
      await io.rename(from, to)
      return true
    }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if ((code !== 'EPERM' && code !== 'EBUSY') || attempt >= RENAME_BACKOFF_MS.length) return false
      await io.sleep(RENAME_BACKOFF_MS[attempt] ?? 0)
    }
  }
}

/** Write a file atomically: a synced temporary file in the same directory, renamed over the target. On failure the temporary file stays and its path is returned. */
export async function writeAtomic(file: string, text: string, io: StoreIo): Promise<{ readonly ok: true } | { readonly ok: false, readonly temporary: string }> {
  const temporary = `${file}.${Math.random().toString(36).slice(2, 10)}.tmp`
  const handle = await open(temporary, 'w')
  try {
    await handle.writeFile(text)
    await handle.sync()
  }
  finally {
    await handle.close()
  }
  return await renameWithRetry(io, temporary, file) ? { ok: true } : { ok: false, temporary }
}

/** Append one record, as a line of JSON, to a journal file and sync it: from here the write has happened. The loop board's change record is written the same way. */
export async function appendLine(file: string, record: unknown): Promise<void> {
  const handle = await open(file, 'a')
  try {
    await handle.appendFile(`${JSON.stringify(record)}\n`)
    await handle.sync()
  }
  finally {
    await handle.close()
  }
}

/** Append one record to the journal and sync it: from here the write has happened. */
export function appendRecord(paths: RulesPaths, record: JournalRecord): Promise<void> {
  return appendLine(paths.journal, record)
}

/**
 * Replace the snapshot. When the rename keeps failing the new snapshot is
 * left as `.state.json.pending`, which the next read adopts; the journal
 * already has the record, so nothing is lost either way.
 */
export async function writeSnapshot(paths: RulesPaths, state: ProjectState, io: StoreIo): Promise<'replaced' | 'pending' | 'failed'> {
  const written = await writeAtomic(paths.state, storedText(state), io)
  if (written.ok) {
    await unlink(paths.pending).catch(() => {})
    return 'replaced'
  }
  if (await renameWithRetry(io, written.temporary, paths.pending)) return 'pending'
  await unlink(written.temporary).catch(() => {})
  return 'failed'
}

/** The size a journal file may reach before it is set aside (design §7.6). */
export const ROTATE_BYTES = 8 * 1024 * 1024

/** Whether the current journal has reached the size at which it is set aside. */
export function journalIsFull(paths: RulesPaths, limit: number): boolean {
  try {
    return statSync(paths.journal).size >= limit
  }
  catch {
    return false
  }
}

/**
 * Set the journal aside as `journal-<seq - 1>.jsonl` and start the next with a `base` at `seq` that carries the whole
 * state (design §7.6). The caller holds the write lock and has read the state it passes; `seq` is the sequence number of
 * the next record, so the file is named after the last record it holds. The old file is copied and synced, then the
 * journal is replaced by the new one in one rename: until the rename the journal is as it was (the copy is a file that
 * nothing carries on from, and the next rotation writes over it), after it the old records are in the copy. A rename that
 * cannot be done throws, and nothing has changed.
 */
export async function rotateJournal(paths: RulesPaths, state: ProjectState, seq: number, io: StoreIo): Promise<void> {
  const rotated = join(paths.runtimeDir, rotatedName(seq - 1))
  await copyFile(paths.journal, rotated)
  const copy = await open(rotated, 'r+')
  try {
    await copy.sync()
  }
  finally {
    await copy.close()
  }
  const next = applyRecord(state, { seq, changes: [] })
  const record: JournalRecord = { seq, at: new Date(io.now()).toISOString(), actor: 'harness', op: 'base', evidence: `流水满了，上一份存为 ${rotatedName(seq - 1)}`, changes: [], snapshot: stateDigest(next), state: next }
  const written = await writeAtomic(paths.journal, `${JSON.stringify(record)}\n`, io)
  if (!written.ok) {
    await unlink(written.temporary).catch(() => {})
    throw new Error('流水满了要换新的，但新文件换不上去（文件正被别处打开），这次没有写')
  }
}
/** A time as it goes into a file name. */
export function stamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[:.]/g, '-')
}

/**
 * Persist what a read found: the pending snapshot adopted, the snapshot
 * caught up, or a `recovered` record (and the copies it keeps) written. The
 * caller holds the write lock and has read under it: a reader that saw a
 * writer between its append and its rename finds the files consistent by
 * now, has no plan, and writes nothing.
 */
export async function persistLoad(paths: RulesPaths, load: LoadResult, io: StoreIo = realStoreIo): Promise<LoadResult> {
  const plan = load.plan
  if (plan === undefined) return load
  if (plan.adoptPending && !await renameWithRetry(io, paths.pending, paths.state)) await writeSnapshot(paths, load.state, io)
  if (plan.rewriteSnapshot) await writeSnapshot(paths, load.state, io)
  const recovered = plan.recovered
  if (recovered === undefined) return { state: load.state, source: 'snapshot', reasons: load.reasons, nextSeq: load.nextSeq, fresh: false }
  const at = new Date(io.now()).toISOString()
  const suffix = stamp(io.now())
  let replaced: string | undefined
  const corrupt = join(paths.runtimeDir, `.journal.corrupt-${suffix}`)
  // The copy is made before the cut, so it keeps the unfinished line too; the line alone is kept only when there is no copy.
  if (recovered.copyJournal) await copyFile(paths.journal, corrupt)
  else if (recovered.tail !== '') await writeFile(corrupt, recovered.tail)
  if (recovered.tail !== '') await truncate(paths.journal, recovered.completeBytes)
  if (recovered.replaceSnapshot) {
    replaced = join(paths.runtimeDir, `.state.json.replaced-${suffix}`)
    await copyFile(paths.state, replaced)
  }
  const seq = load.nextSeq
  const changes: Change[] = [
    { path: ['recovered'], value: { at, reason: recovered.reason, lost: recovered.lost, ...(replaced === undefined ? {} : { replaced }) } },
    ...recovered.skipped.map((entry, index): Change => ({ path: ['unresolved', entry.key], value: { ...entry, label: `${seq}-${index + 1}` } })),
  ]
  const next = applyRecord(load.state, { seq, changes })
  const record: JournalRecord = {
    seq,
    at,
    actor: 'harness',
    op: 'recovered',
    reason: recovered.reason,
    ...(replaced === undefined ? {} : { evidence: `旧存档另存为 ${replaced}` }),
    changes,
    snapshot: stateDigest(next),
    state: next,
  }
  await appendRecord(paths, record)
  await writeSnapshot(paths, next, io)
  return { state: next, source: 'snapshot', reasons: load.reasons, nextSeq: seq + 1, fresh: false }
}
