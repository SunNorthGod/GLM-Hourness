/**
 * The loop board's storage for the entries a person agreed to (docs/ORCHESTRATION.md
 * §18.7; loop board design §9.1 to §9.3): one file per entry in the repository
 * (`docs/loops/entries/<id>.json`, and `docs/loops/scripts/` for a script's
 * text) and, in the project's `.llm/loops/`, the change record
 * (`journal.jsonl`), the note of what the board last wrote
 * (`repo-written.json`) and the lock. Judgments follow the change record, not
 * the files: git moves the files (a branch switch, a stash, a revert, a pull)
 * and a script can edit them, so a file counts only when it is the one the
 * person agreed to. The board never writes back what git changed.
 *
 * The files an entry is in, against what the record says (readBoard):
 *
 * - the file is what the record's last agreed line says: the entry runs;
 * - the record is ahead of the file and the board has not noted the write
 *   (a git operation was running, or the host stopped between the record and
 *   the rename): the board owes the write and makes it when it can;
 * - the board noted the write and the file is anything else (a hand edit, a
 *   revert, an old version checked out): changed outside, the entry does not
 *   run, and the difference is noted in the record once;
 * - the file is gone but the board had written it (a branch without it, a
 *   stash): not in this checkout, nothing is written back;
 * - the file cannot be read: the entry does not run, `/loops restore` writes the
 *   agreed version back;
 * - the file is not in the record at all (a new clone, a teammate's entry that
 *   came with a pull): an entry that only tells the main agent is taken in as it
 *   is; an entry that would run something is listed as not adopted and does not
 *   run, since no agreement of the person on this computer exists to run it by.
 *
 * Reading is synchronous and writes nothing (`readBoard`). Persisting what a
 * read found (`settle`) and the person's changes (`apply`) happen under the
 * write lock: the record line first, synced, then the files, each through a
 * temporary file in `.llm/loops/tmp/` and a rename, then the note. A crash in
 * between leaves a record that is ahead, which the next read finishes. Nothing
 * is written into `docs/loops/` while git is merging, rebasing, cherry-picking,
 * reverting or bisecting, or holds the index.
 */
import { createHash, randomBytes } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { copyFile, mkdir, open, truncate, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { acquireLock, realLockEnvironment, type LockEnvironment } from '../data/lock.ts'
import { ensureIgnored } from '../data/project-root.ts'
import { gitOperationIn } from '../rules/repo.ts'
import { appendLine, readText, realStoreIo, renameWithRetry, stamp, writeAtomic, type StoreIo } from '../rules/store.ts'
import { LOOP_EVENT_TABLE } from './events.ts'
import { acknowledgedThrough, historyOf, parseJournal, type EntryImage, type JournalRecord, type LoopActor } from './journal.ts'
import { entryFileText, validatePersonEntry, type PersonEntry } from './model.ts'
import type { LoopEventDeclaration } from './trigger.ts'

/** The loop board's directory in the repository, relative to the project root. */
const LOOPS_DIR = 'docs/loops'

export interface LoopsPaths {
  readonly projectRoot: string
  /** `docs/loops/entries`: one file per entry of a person. */
  readonly entriesDir: string
  /** `<root>/.llm/loops`: runtime state, not in git. */
  readonly runtimeDir: string
  readonly journal: string
  readonly repoWritten: string
  /** Where a file is written before it is renamed into the repository, so a crash leaves nothing in `docs/`. */
  readonly tmpDir: string
  readonly lock: string
  readonly view: string
  /** The project's inbox: one line per event handed over (design §6.3). */
  readonly events: string
  /** What the runner keeps between beats and restarts: the inbox position, the dedupe keys, what waits, the host (design §9.1). */
  readonly state: string
  /** The project's run lock: the process that runs the board holds it (design §6.1). */
  readonly runner: string
  /** Where a process in which the main agent's session is open asks for the run lock (design §6.1). */
  readonly handover: string
  /** The whole text of every DSH reminder the board deleted, written before the delete (design §6.2). */
  readonly removedTasks: string
  /** The last step of the main agent's session of this project, written by every process (design §6.1). */
  readonly mainStep: string
  /** Where a run's log goes, one folder per entry (design §6.6); the executor appends the file. */
  readonly logsDir: string
}

export function loopsPaths(projectRoot: string): LoopsPaths {
  const runtimeDir = join(projectRoot, '.llm', 'loops')
  return {
    projectRoot,
    entriesDir: join(projectRoot, ...LOOPS_DIR.split('/'), 'entries'),
    runtimeDir,
    journal: join(runtimeDir, 'journal.jsonl'),
    repoWritten: join(runtimeDir, 'repo-written.json'),
    tmpDir: join(runtimeDir, 'tmp'),
    lock: join(runtimeDir, 'write.lock'),
    view: join(runtimeDir, 'view.json'),
    events: join(runtimeDir, 'events.jsonl'),
    state: join(runtimeDir, 'state.json'),
    runner: join(runtimeDir, 'runner.lock'),
    handover: join(runtimeDir, 'handover.json'),
    removedTasks: join(runtimeDir, 'removed-tasks.jsonl'),
    mainStep: join(runtimeDir, 'main-step.json'),
    logsDir: join(runtimeDir, 'logs'),
  }
}

/**
 * Create `<root>/.llm/loops/` for a first write, after git has been told to
 * ignore `.llm/` (design §9.1): the record, the notes and the lock are runtime
 * state and must not show up as untracked files in a project whose own ignore
 * files know nothing about them. The directory has a `.gitignore` of its own
 * that ignores everything in it; an existing one is left as it is. Throws when
 * the ignore entry cannot be made; the directory is then not created.
 */
export async function ensureRuntimeDir(paths: LoopsPaths): Promise<void> {
  await ensureIgnored(paths.projectRoot, '.llm')
  await mkdir(paths.tmpDir, { recursive: true })
  await writeFile(join(paths.runtimeDir, '.gitignore'), '*\n', { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error
  })
}

/** Append one record to the change record and sync it: from here the write has happened. */
export function appendJournal(paths: LoopsPaths, record: JournalRecord): Promise<void> {
  return appendLine(paths.journal, record)
}

const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex')

/** A deleted entry can be restored this long (design §7.2). */
const RESTORE_WINDOW_MS = 7 * 24 * 3_600_000
/** A temporary file a crash left is removed after this long (design §9.1). */
const TMP_KEEP_MS = 3_600_000

const ENTRY_FILE = /^(u-[0-9a-f]{8})\.json$/
const PERSON_ID = /^u-[0-9a-f]{8}$/

type EntryStatus =
  /** The file is the agreed one. */
  | { readonly kind: 'ok' }
  /** The record is ahead of the file: the board writes it (or removes it, for a deletion) when it can. */
  | { readonly kind: 'owed' }
  /** The file is not the agreed one and the board did not write it. */
  | { readonly kind: 'outside', readonly sha256: string }
  /** The file is gone and the board had written it. */
  | { readonly kind: 'not-in-checkout' }
  | { readonly kind: 'unreadable', readonly reason: string }
  /** No agreement of the person on this computer: the entry is read and does not run. */
  | { readonly kind: 'unadopted' }
  | { readonly kind: 'deleted', readonly at: string, readonly restorable: boolean }

export interface BoardEntry {
  readonly id: string
  readonly title: string
  readonly status: EntryStatus
  /** The definition on file when the file can be read, else the one the record holds. */
  readonly entry: PersonEntry | undefined
  /** The entry as the last agreed line of the record leaves it. */
  readonly agreed: EntryImage | undefined
  /** SHA-256 of the file's bytes; undefined when there is no file. */
  readonly sha256: string | undefined
  /** Whether `/loops restore` can write the agreed version back. */
  readonly restorable: boolean
}

/** What a writer has to persist after a read. */
interface SettlePlan {
  /** An entry to take in as it is: only tells the main agent, so it needs no agreement. */
  readonly adopt: readonly { readonly id: string, readonly entry: PersonEntry, readonly sha256: string }[]
  /** A file somebody else wrote and the record does not name yet. */
  readonly external: readonly { readonly id: string, readonly sha256: string }[]
  /** Entries whose file the board owes. */
  readonly owed: readonly string[]
  /** Entries whose file is the agreed one while the board's note does not say so. */
  readonly noteWritten: readonly string[]
  /** Temporary files a crash left, old enough to remove. */
  readonly staleTmp: readonly string[]
  /** The unreadable lines are not copied aside yet: the digest that names the copy. */
  readonly corruptCopy: string | undefined
}

export interface BoardRead {
  /** Every entry the record or the entries directory names, by id. */
  readonly entries: readonly BoardEntry[]
  readonly journal: {
    readonly nextSeq: number
    /** The line numbers of lines that could not be read. */
    readonly unreadable: readonly number[]
    /** Those the person has not acknowledged with `/loops ack`. */
    readonly unacknowledged: readonly number[]
    /** The unfinished last line, or ''. */
    readonly tail: string
    readonly completeBytes: number
  }
  /** The git operation that keeps the board from writing into `docs/loops/`, or undefined. */
  readonly git: string | undefined
  /** The project has entry files and no record: this computer meets them for the first time. */
  readonly fresh: boolean
  readonly plan: SettlePlan
}

interface ReadEnv {
  /** The events the board knows now: an entry that names none of them cannot be read. */
  readonly table: () => ReadonlyMap<string, LoopEventDeclaration>
  readonly now: () => number
}

interface WrittenNote {
  /** SHA-256 of the entry file the board last wrote; null for a deletion. */
  readonly fileSha256: string | null
  readonly at: string
}

function readWritten(paths: LoopsPaths): Readonly<Record<string, WrittenNote | undefined>> {
  try {
    const value: unknown = JSON.parse(readText(paths.repoWritten) ?? 'null')
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, WrittenNote> : {}
  }
  catch {
    return {}
  }
}

function readBytes(file: string): Buffer | undefined {
  try {
    return readFileSync(file)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

const entryPath = (paths: LoopsPaths, id: string): string => join(paths.entriesDir, `${id}.json`)

const SCRIPT_FILE = /^docs\/loops\/scripts\/u-[0-9a-f]{8}\.(?:ps1|mjs|py|sh)$/

/**
 * The script file an entry runs, from the project root; undefined for an entry without one. Only a file in
 * `docs/loops/scripts/` counts, whatever a record says, since the board removes and replaces what this names.
 */
function scriptPath(paths: LoopsPaths, entry: PersonEntry): string | undefined {
  const file = entry.action.kind === 'script' ? entry.action.script.file : undefined
  return file !== undefined && SCRIPT_FILE.test(file) ? join(paths.projectRoot, ...file.split('/')) : undefined
}

/** The moment an entry is checked against: when the person agreed to it (a `once` entry is later than that, whenever the file is read), else the epoch. */
function momentOf(at: unknown): Date {
  const ms = typeof at === 'string' ? Date.parse(at) : Number.NaN
  return new Date(Number.isNaN(ms) ? 0 : ms)
}

type Parsed = { readonly ok: true, readonly entry: PersonEntry } | { readonly ok: false, readonly reason: string }

/** The entry a file holds, or why it cannot be read: a file counts only when it is sound against the table and carries the id of its name. */
function parseEntryFile(text: string, id: string, table: ReadonlyMap<string, LoopEventDeclaration>): Parsed {
  let value: unknown
  try {
    value = JSON.parse(text)
  }
  catch {
    return { ok: false, reason: '不是合法的 JSON（空的、被截断或被清零）' }
  }
  const issues = validatePersonEntry(value, { table, now: momentOf((value as { source?: { at?: unknown } } | null)?.source?.at) })
  const first = issues[0]
  if (first !== undefined) return { ok: false, reason: `${first.path}：${first.message}` }
  if ((value as { id: string }).id !== id) return { ok: false, reason: '文件里的 id 与文件名不符' }
  return { ok: true, entry: value as PersonEntry }
}

/**
 * Why an image of the record cannot be written to the files, or undefined when it can: a line somebody appended is
 * checked like an entry file, and the text and the script must be what the digests say, since the board writes
 * these bytes and notes the digest as its own.
 */
function imageProblem(image: EntryImage, table: ReadonlyMap<string, LoopEventDeclaration>): string | undefined {
  const { entry } = image
  const issues = validatePersonEntry(entry, { table, now: momentOf((entry as { source?: { at?: unknown } }).source?.at) })
  if (issues[0] !== undefined) return `存档里的这一项不合格（${issues[0].path}：${issues[0].message}）`
  if (entry.action.kind === 'script' && (image.scriptText === undefined || sha256(image.scriptText) !== entry.action.script.sha256)) return '存档里的脚本原文对不上哈希'
  if (sha256(entryFileText(entry)) !== image.fileSha256) return '存档里的条目重写出来与当时写的不一样'
  return undefined
}

function entryFileIds(paths: LoopsPaths): readonly string[] {
  try {
    return readdirSync(paths.entriesDir).flatMap(name => ENTRY_FILE.exec(name)?.[1] ?? [])
  }
  catch {
    return []
  }
}

/** Temporary files old enough to remove. */
function staleTmpFiles(paths: LoopsPaths, now: number): readonly string[] {
  try {
    return readdirSync(paths.tmpDir).filter(name => now - statSync(join(paths.tmpDir, name)).mtimeMs > TMP_KEEP_MS).map(name => join(paths.tmpDir, name))
  }
  catch {
    return []
  }
}

/**
 * The state of the entries of a project against its files (design §9.3). Reads
 * only: no lock, nothing written. `plan` says what a writer should persist.
 */
function readBoard(paths: LoopsPaths, env: ReadEnv): BoardRead {
  const raw = readText(paths.journal)
  const journal = parseJournal(raw ?? '')
  const histories = historyOf(journal.lines)
  const written = readWritten(paths)
  const files = entryFileIds(paths)
  const table = env.table()
  const now = env.now()
  const adopt: Array<SettlePlan['adopt'][number]> = []
  const external: Array<SettlePlan['external'][number]> = []
  const owed: string[] = []
  const noteWritten: string[] = []

  function inspect(id: string): BoardEntry {
    const history = histories.get(id)
    const bytes = readBytes(entryPath(paths, id))
    const sha = bytes === undefined ? undefined : sha256(bytes)
    const parsed = bytes === undefined ? undefined : parseEntryFile(bytes.toString('utf8'), id, table)
    const onFile = parsed?.ok === true ? parsed.entry : undefined
    const agreed = history?.approved.after
    const shown = onFile ?? agreed?.entry
    const entry = (status: EntryStatus, restorable = agreed !== undefined): BoardEntry => ({ id, title: shown?.title ?? id, status, entry: shown, agreed, sha256: sha, restorable })
    if (history === undefined || agreed === undefined) {
      if (parsed === undefined || sha === undefined) return entry({ kind: 'unreadable', reason: '没有这个文件' }, false)
      if (!parsed.ok) return entry({ kind: 'unreadable', reason: parsed.reason }, false)
      if (parsed.entry.action.kind === 'tell-main') adopt.push({ id, entry: parsed.entry, sha256: sha })
      return entry({ kind: 'unadopted' }, false)
    }
    const note = written[id]
    /** The board owes the files of this image: unless the image cannot be written, then it is the record that is unreadable. */
    const owe = (image: EntryImage): BoardEntry => {
      const problem = image.status === 'deleted' ? undefined : imageProblem(image, table)
      if (problem !== undefined) return entry({ kind: 'unreadable', reason: problem }, false)
      owed.push(id)
      return entry({ kind: 'owed' }, image.status !== 'deleted')
    }
    if (agreed.status === 'deleted') {
      const restorable = now - Date.parse(history.approved.at) <= RESTORE_WINDOW_MS
      if (sha === undefined) {
        if (note?.fileSha256 !== null) noteWritten.push(id)
        return entry({ kind: 'deleted', at: history.approved.at, restorable }, restorable)
      }
      // The deletion is the board's to finish while it has not noted the file gone and the file is the one it deleted.
      if (note?.fileSha256 !== null && sha === agreed.fileSha256) return owe(agreed)
    }
    else {
      const completed = note?.fileSha256 === agreed.fileSha256
      if (sha === agreed.fileSha256) {
        if (!completed) noteWritten.push(id)
        return entry({ kind: 'ok' })
      }
      const restoring = history.approved.op === 'restore'
      if (sha === undefined) {
        if (!completed && (history.previous === undefined || restoring || history.approved.op === 'adopt')) return owe(agreed)
        return entry({ kind: 'not-in-checkout' })
      }
      // The record is ahead of the file and the board has not written yet: the file is the one before, or a restore is asked for.
      if (!completed && (sha === history.previous?.fileSha256 || restoring)) return owe(agreed)
    }
    if (parsed === undefined || sha === undefined) return entry({ kind: 'not-in-checkout' })
    if (!parsed.ok) return entry({ kind: 'unreadable', reason: parsed.reason })
    if (!history.observed.has(sha)) external.push({ id, sha256: sha })
    return entry({ kind: 'outside', sha256: sha })
  }
  const entries = [...new Set([...histories.keys(), ...files])].sort().map(inspect)
  const unreadable = journal.lines.filter(line => line.record === undefined)
  const through = acknowledgedThrough(journal.lines)
  const corruptText = unreadable.map(line => `${line.number}\t${line.text}`).join('\n')
  const digest = corruptText === '' ? undefined : sha256(corruptText).slice(0, 8)
  let copied = false
  try {
    copied = digest !== undefined && readdirSync(paths.runtimeDir).some(name => name.startsWith('.journal.corrupt-') && name.endsWith(`-${digest}`))
  }
  catch {
    // No runtime directory yet: nothing is copied.
  }
  return {
    entries,
    journal: {
      nextSeq: journal.nextSeq,
      unreadable: unreadable.map(line => line.number),
      unacknowledged: unreadable.map(line => line.number).filter(number => number > through),
      tail: journal.tail,
      completeBytes: journal.completeBytes,
    },
    git: gitOperationIn(paths.projectRoot),
    fresh: raw === undefined && files.length > 0,
    plan: { adopt, external, owed, noteWritten, staleTmp: staleTmpFiles(paths, now), corruptCopy: copied ? undefined : digest },
  }
}

/** Whether a read found something a writer should persist. */
function hasWork(read: BoardRead): boolean {
  const { plan } = read
  return read.journal.tail !== '' || plan.corruptCopy !== undefined || plan.adopt.length + plan.external.length + plan.owed.length + plan.noteWritten.length + plan.staleTmp.length > 0
}

type Mutation =
  | { readonly op: 'delete', readonly entry: string }
  | { readonly op: 'restore', readonly entry: string }
  /** Acknowledge the unreadable lines of the change record. */
  | { readonly op: 'ack' }

/** What happened to the files: written, removed, left for later because git is busy, not done because a rename or removal failed, or nothing to do. */
type FileOutcome = 'written' | 'removed' | 'deferred' | 'failed' | 'none'

export type ApplyResult =
  | { readonly ok: true, readonly op: Mutation['op'], readonly id?: string, readonly title?: string, readonly file: FileOutcome, readonly entry?: PersonEntry }
  | { readonly ok: false, readonly code: 'busy' | 'invalid' | 'forbidden' | 'not_found' | 'io', readonly message: string }

export interface LoopStoreOptions {
  readonly io?: StoreIo
  readonly lock?: LockEnvironment
  /** The events the board knows now; the entry events of the loop row itself when absent. */
  readonly table?: () => ReadonlyMap<string, LoopEventDeclaration>
}

export interface LoopStore {
  readonly paths: LoopsPaths
  /** The state of the project's entries; reads only. */
  read(): BoardRead
  /** Persist what a read found, under the write lock. `busy` when another writer holds it for the whole wait; no lock is taken when there is nothing to persist. */
  settle(): Promise<BoardRead | 'busy'>
  /** One change of the person's. Every operation is the person's: another identity is `forbidden`. */
  apply(actor: LoopActor, mutation: Mutation): Promise<ApplyResult>
  /** Run `body` holding the write lock, after the runtime directory exists. `busy` when the lock is held for the whole wait. */
  locked<T>(body: () => Promise<T>): Promise<T | 'busy'>
}

const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

const fail = (code: Extract<ApplyResult, { ok: false }>['code'], text: string): ApplyResult => ({ ok: false, code, message: text })

export function openLoopStore(projectRoot: string, options: LoopStoreOptions = {}): LoopStore {
  const paths = loopsPaths(projectRoot)
  const io = options.io ?? realStoreIo
  const lockEnvironment = options.lock ?? realLockEnvironment
  const env: ReadEnv = { table: options.table ?? ((): ReadonlyMap<string, LoopEventDeclaration> => LOOP_EVENT_TABLE), now: io.now }
  const iso = (): string => new Date(io.now()).toISOString()

  /** A file written through a temporary file in `.llm/loops/tmp/` and a rename. On failure the temporary file stays and the next read finishes the write (design §9.2 step 5). */
  async function place(target: string, data: string): Promise<boolean> {
    await mkdir(paths.tmpDir, { recursive: true })
    await mkdir(dirname(target), { recursive: true })
    const temporary = join(paths.tmpDir, `${randomBytes(6).toString('hex')}.tmp`)
    const handle = await open(temporary, 'w')
    try {
      await handle.writeFile(Buffer.from(data, 'utf8'))
      await handle.sync()
    }
    finally {
      await handle.close()
    }
    return renameWithRetry(io, temporary, target)
  }

  const removeFile = (target: string): Promise<void> => unlink(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
  })

  /** What is in the way of a write is kept aside first: it may be the person's hand edit. `current` is the digest of the file now, `expected` the one the board is about to leave there or take away. */
  async function keepAside(target: string, current: string | undefined, expected: string): Promise<void> {
    if (current === undefined || current === expected) return
    await copyFile(target, join(paths.runtimeDir, `.${basename(target)}.outside-${stamp(io.now())}`))
  }

  /** The note of what the board last wrote, for the ids given; best effort, since the next read notes it again. */
  async function note(patch: Readonly<Record<string, WrittenNote>>): Promise<void> {
    if (Object.keys(patch).length === 0) return
    const written = await writeAtomic(paths.repoWritten, `${JSON.stringify({ ...readWritten(paths), ...patch }, null, 2)}\n`, io)
    if (!written.ok) await unlink(written.temporary).catch(() => {})
  }

  /** Write an entry's files: the script first, then the entry. False when a rename failed; the temporary file stays. */
  async function writeImage(id: string, image: EntryImage, current: string | undefined): Promise<boolean> {
    const script = scriptPath(paths, image.entry)
    if (script !== undefined && image.scriptText !== undefined && !await place(script, image.scriptText)) return false
    await keepAside(entryPath(paths, id), current, image.fileSha256)
    return place(entryPath(paths, id), entryFileText(image.entry))
  }

  /** Remove an entry's files: the entry first, then the script. */
  async function removeImage(id: string, entry: PersonEntry, current: string | undefined, expected: string): Promise<void> {
    await keepAside(entryPath(paths, id), current, expected)
    await removeFile(entryPath(paths, id))
    const script = scriptPath(paths, entry)
    if (script !== undefined) await removeFile(script)
  }
  /** Make the writes the board owes, unless git is in the middle of something, and note the files that are already as agreed. A write that does not succeed is tried again at the next read. */
  async function finishOwed(read: BoardRead, patch: Record<string, WrittenNote>): Promise<void> {
    for (const id of read.plan.noteWritten) {
      const image = read.entries.find(candidate => candidate.id === id)?.agreed
      if (image !== undefined) patch[id] = { fileSha256: image.status === 'deleted' ? null : image.fileSha256, at: iso() }
    }
    for (const id of read.git === undefined ? read.plan.owed : []) {
      const found = read.entries.find(candidate => candidate.id === id)
      const image = found?.agreed
      if (found === undefined || image === undefined) continue
      try {
        if (image.status === 'deleted') {
          await removeImage(id, image.entry, found.sha256, image.fileSha256)
          patch[id] = { fileSha256: null, at: iso() }
        }
        else if (await writeImage(id, image, found.sha256)) patch[id] = { fileSha256: image.fileSha256, at: iso() }
      }
      catch {
        // Tried again at the next read.
      }
    }
    await note(patch)
  }

  async function settleLocked(): Promise<BoardRead> {
    const read = readBoard(paths, env)
    if (!hasWork(read)) return read
    await ensureRuntimeDir(paths)
    const { plan } = read
    if (read.journal.tail !== '') {
      // The unfinished line is kept aside before the file is cut (design §9.3).
      await writeFile(join(paths.runtimeDir, `.journal.corrupt-${stamp(io.now())}`), read.journal.tail)
      await truncate(paths.journal, read.journal.completeBytes)
    }
    if (plan.corruptCopy !== undefined) await copyFile(paths.journal, join(paths.runtimeDir, `.journal.corrupt-${stamp(io.now())}-${plan.corruptCopy}`))
    let seq = read.journal.nextSeq
    const patch: Record<string, WrittenNote> = {}
    for (const item of plan.external) {
      await appendJournal(paths, { seq: seq++, at: iso(), actor: 'harness', op: 'external', id: item.id, observed: { fileSha256: item.sha256 }, via: 'repo', note: '条目文件在循环板之外被改过，没有生效' })
    }
    for (const item of plan.adopt) {
      const after: EntryImage = { entry: item.entry, rev: 1, status: 'active', fileSha256: item.sha256 }
      await appendJournal(paths, { seq: seq++, at: iso(), actor: 'harness', op: 'adopt', id: item.id, after, via: 'repo', note: '只告诉主 Agent 的条目，照仓库里的文件读入，不用批准记录' })
      patch[item.id] = { fileSha256: item.sha256, at: iso() }
    }
    await finishOwed(read, patch)
    for (const file of plan.staleTmp) await removeFile(file).catch(() => {})
    return readBoard(paths, env)
  }

  async function locked<T>(body: () => Promise<T>): Promise<T | 'busy'> {
    await ensureRuntimeDir(paths)
    const lock = await acquireLock(paths.lock, lockEnvironment, { keepStale: true })
    if (lock === 'busy') return 'busy'
    try {
      return await body()
    }
    finally {
      await lock.release()
    }
  }

  async function settle(): Promise<BoardRead | 'busy'> {
    const read = readBoard(paths, env)
    return hasWork(read) ? locked(settleLocked) : read
  }

  /**
   * The record line of a change, then its files. The line comes first and is synced: from there the change has
   * happened, and a file that is not written (git is busy, a rename fails) is owed and written at the next read.
   */
  async function change(found: BoardEntry, read: BoardRead, record: { readonly op: string, readonly before?: EntryImage, readonly after: EntryImage }): Promise<FileOutcome> {
    const id = found.id
    await appendJournal(paths, { seq: read.journal.nextSeq, at: iso(), actor: 'human', id, via: 'board', ...record })
    if (read.git !== undefined) return 'deferred'
    const { after } = record
    try {
      if (after.status === 'deleted') {
        await removeImage(id, found.entry ?? after.entry, found.sha256, after.fileSha256)
        await note({ [id]: { fileSha256: null, at: iso() } })
        return 'removed'
      }
      if (!await writeImage(id, after, found.sha256)) return 'failed'
      await note({ [id]: { fileSha256: after.fileSha256, at: iso() } })
      return 'written'
    }
    catch {
      return 'failed'
    }
  }

  async function deleteEntry(read: BoardRead, id: string): Promise<ApplyResult> {
    const found = read.entries.find(candidate => candidate.id === id)
    if (found === undefined) return fail('not_found', `没有这一项（${id}）`)
    if (found.status.kind === 'deleted') return fail('invalid', `「${found.title}」已经删过了；7 天内打 /loops restore ${id} 能恢复`)
    // An entry the board never agreed to is deleted as the file has it; one whose file cannot be read and has no record cannot be.
    const base: EntryImage | undefined = found.agreed ?? (found.entry === undefined || found.sha256 === undefined ? undefined : { entry: found.entry, rev: 0, status: 'active', fileSha256: found.sha256 })
    if (base === undefined) return fail('invalid', `「${found.title}」的条目文件读不出，也没有存档，删不了：跟主 Agent 说「从 git 里恢复 docs/loops/entries/${id}.json」，或自己删掉这个文件`)
    const after: EntryImage = { ...base, rev: base.rev + 1, status: 'deleted' }
    const file = await change(found, read, { op: 'delete', ...(found.agreed === undefined ? {} : { before: found.agreed }), after })
    return { ok: true, op: 'delete', id, title: found.title, file }
  }

  async function restoreEntry(read: BoardRead, id: string): Promise<ApplyResult> {
    const found = read.entries.find(candidate => candidate.id === id)
    if (found === undefined) return fail('not_found', `没有这一项（${id}）`)
    const { agreed, status } = found
    if (status.kind === 'ok') return fail('invalid', `「${found.title}」现在是好的，没有要恢复的`)
    if (status.kind === 'owed') return fail('invalid', `「${found.title}」的文件等 git 做完手上的事之后由循环板写好，不用恢复`)
    if (status.kind === 'unadopted') return fail('invalid', `「${found.title}」在这台电脑上没有你同意过的版本，恢复不了；要用它，跟主 Agent 说`)
    if (status.kind === 'deleted' && !status.restorable) return fail('invalid', `「${found.title}」删了超过 7 天，恢复不了`)
    if (agreed === undefined) return fail('invalid', `「${found.title}」没有存档，恢复不了：跟主 Agent 说「从 git 里恢复 docs/loops/entries/${id}.json」`)
    const problem = imageProblem(agreed, env.table())
    if (problem !== undefined) return fail('invalid', `「${found.title}」恢复不了：${problem}`)
    const after: EntryImage = { ...agreed, rev: agreed.rev + 1, status: 'active' }
    const file = await change(found, read, { op: 'restore', before: agreed, after })
    return { ok: true, op: 'restore', id, title: found.title, file, entry: agreed.entry }
  }

  async function acknowledge(read: BoardRead): Promise<ApplyResult> {
    const last = read.journal.unacknowledged.at(-1)
    if (last === undefined) return fail('invalid', '没有要确认的提示')
    await appendJournal(paths, { seq: read.journal.nextSeq, at: iso(), actor: 'human', op: 'ack', through: last, via: 'board' })
    return { ok: true, op: 'ack', file: 'none' }
  }
  async function apply(actor: LoopActor, mutation: Mutation): Promise<ApplyResult> {
    if (actor !== 'human') return fail('forbidden', '条目只由人改：删、恢复和确认都得是人敲的 /loops')
    if (mutation.op !== 'ack' && !PERSON_ID.test(mutation.entry)) return fail('invalid', 'id 写成 u- 加 8 位小写十六进制')
    try {
      const done = await locked(async () => {
        const read = await settleLocked()
        return mutation.op === 'delete' ? deleteEntry(read, mutation.entry) : mutation.op === 'restore' ? restoreEntry(read, mutation.entry) : acknowledge(read)
      })
      return done === 'busy' ? fail('busy', '循环板正忙，没记上，再打一次') : done
    }
    catch (error) {
      return fail('io', `写不进文件：${message(error)}`)
    }
  }

  return { paths, read: () => readBoard(paths, env), settle, apply, locked }
}
