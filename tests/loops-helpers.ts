/**
 * Shared pieces of the loop board's storage specs: a project that is a real git
 * repository in a temporary directory (git's own refusals and markers are part
 * of what the board must live with), the entries a person would have agreed
 * to, and the record an earlier `add` would have left. The board has no
 * operation that adds an entry yet (that is the proposal path, which waits for
 * the agreement of the person on the project graph), so a spec makes one the
 * way the board will: the line in the change record first, then the files and
 * the note of what was written.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import type { EntryImage, JournalRecord } from '../src/loops/journal.ts'
import { metricEventOf } from '../src/loops/metrics.ts'
import { entryFileText, type PersonEntry } from '../src/loops/model.ts'
import type { LoopRecord } from '../src/loops/records.ts'
import { appendJournal, ensureRuntimeDir, openLoopStore, type LoopStore, type LoopStoreOptions } from '../src/loops/store.ts'
import { METRICS_KINDS } from '../src/metrics/kinds/index.ts'
import { checkEvent, FORMAT_VERSION } from '../src/metrics/schema.ts'
import type { StoreIo } from '../src/rules/store.ts'
import type { EmittedEvent } from '../src/shared/metrics.ts'
import { quickIo as quickStoreIo } from './rules-helpers.ts'

/** The moment the person agreed to the entries these specs seed. */
const AGREED_AT = '2026-11-01T01:00:00.000Z'

/** The moment the specs run at unless a case moves it: a day after the person agreed. */
export const NOW = Date.parse('2026-11-02T01:00:00.000Z')

export const sha256 = (data: string): string => createHash('sha256').update(data).digest('hex')

/** git in `cwd`, with a fixed identity and no conversion of line ends, so a case does not depend on the machine's configuration. */
export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Loops Test', '-c', 'user.email=loops@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd()
}

export interface GitProject {
  readonly root: string
  readonly store: LoopStore
  readonly git: (...args: string[]) => string
  /** Commit everything that is not ignored. */
  readonly commit: (message: string) => string
}

/** A git repository with one commit in a temporary directory and a board over it; the directory is removed afterwards. */
export function gitProjectTest(name: string, body: (project: GitProject) => Promise<void>, options: LoopStoreOptions = {}): void {
  test(name, async () => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'loops-')))
    try {
      git(root, 'init', '--quiet', '-b', 'main')
      await writeFile(join(root, 'README.md'), 'a project\n')
      git(root, 'add', '--all')
      git(root, 'commit', '--quiet', '-m', 'first')
      await body({
        root,
        store: openLoopStore(root, { io: quickIo(), ...options }),
        git: (...args) => git(root, ...args),
        commit: (message) => {
          git(root, 'add', '--all')
          git(root, 'commit', '--quiet', '--allow-empty', '-m', message)
          return git(root, 'rev-parse', 'HEAD')
        },
      })
    }
    finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  })
}

/** The rules board's file operations with no waiting between retries (both boards share `StoreIo`), on the clock these specs run at. */
export function quickIo(overrides: Partial<StoreIo> = {}): StoreIo {
  return quickStoreIo({ now: () => NOW, ...overrides })
}

/** An entry that only tells the main agent, with the source a chat agreement leaves. */
export function tellEntry(id: string, over: Partial<PersonEntry> = {}): PersonEntry {
  return {
    id,
    title: '每周五看一眼没合入的分支',
    when: { kind: 'weekly', time: '17:00', weekdays: [5], timeZone: 'Asia/Shanghai' },
    action: { kind: 'tell-main', text: 'Weekly: list the branches not merged into main and older than 7 days.', wake: true },
    source: { kind: 'person', at: AGREED_AT, via: 'chat', relay: '好，每周五提醒我看一眼', question: 'q-7', proposal: 'lp-0123abcd' },
    ...over,
  }
}

export const SCRIPT_TEXT = 'import { readFileSync } from \'node:fs\'\nconst event = JSON.parse(readFileSync(0, \'utf8\'))\nconsole.log(event.event)\n'

/** An entry that runs a script of Node, which a person agreed to. */
export function scriptEntry(id: string, text: string = SCRIPT_TEXT): PersonEntry {
  return tellEntry(id, {
    title: '重启之后查一下服务',
    when: { kind: 'event', events: ['loops.host-restarted'] },
    action: { kind: 'script', script: { file: `docs/loops/scripts/${id}.mjs`, sha256: sha256(text), lang: 'node' }, timeoutSeconds: 30, report: 'on-failure', note: 'After a restart: check the service and tell me if it is down.' },
  })
}

export interface SeedOptions {
  /** The text of the script, for an entry that runs one. */
  readonly scriptText?: string
  /** Write the files and the note (default true): false leaves a record whose files the board owes. */
  readonly files?: boolean
  readonly rev?: number
  readonly op?: 'add' | 'edit'
  readonly at?: string
}

/** What the board would have left for an agreed entry: the line in the change record, then the files, then the note. Returns the image the record carries. */
export async function seedAgreed(project: Pick<GitProject, 'root' | 'store'>, entry: PersonEntry, options: SeedOptions = {}): Promise<EntryImage> {
  const { paths } = project.store
  await ensureRuntimeDir(paths)
  const text = entryFileText(entry)
  const image: EntryImage = { entry, rev: options.rev ?? 1, status: 'active', fileSha256: sha256(text), ...(options.scriptText === undefined ? {} : { scriptText: options.scriptText }) }
  const record: JournalRecord = { seq: project.store.read().journal.nextSeq, at: options.at ?? AGREED_AT, actor: 'human', op: options.op ?? 'add', id: entry.id, after: image, via: 'chat' }
  await appendJournal(paths, record)
  if (options.files === false) return image
  await writeFiles(project.root, entry, text, options.scriptText)
  await noteWritten(paths.repoWritten, entry.id, image.fileSha256)
  return image
}

/** The files of an entry as the board leaves them. */
export async function writeFiles(root: string, entry: PersonEntry, text: string, scriptText?: string): Promise<void> {
  const entryFile = join(root, 'docs', 'loops', 'entries', `${entry.id}.json`)
  await mkdir(dirname(entryFile), { recursive: true })
  await writeFile(entryFile, text)
  if (entry.action.kind === 'script' && scriptText !== undefined) {
    const scriptFile = join(root, ...entry.action.script.file.split('/'))
    await mkdir(dirname(scriptFile), { recursive: true })
    await writeFile(scriptFile, scriptText)
  }
}

/** What one entry's note says the board last wrote, as `repo-written.json` has it now. */
export async function writtenNote(project: Pick<GitProject, 'store'>, id: string): Promise<{ readonly fileSha256: string | null, readonly at: string } | undefined> {
  const known = JSON.parse(await readFile(project.store.paths.repoWritten, 'utf8').catch(() => '{}')) as Record<string, { readonly fileSha256: string | null, readonly at: string } | undefined>
  return known[id]
}

/** The note of what the board last wrote, as `repo-written.json` has it. */
async function noteWritten(file: string, id: string, fileSha256: string | null): Promise<void> {
  const known = JSON.parse(await readFile(file, 'utf8').catch(() => '{}')) as Record<string, unknown>
  await writeFile(file, `${JSON.stringify({ ...known, [id]: { fileSha256, at: AGREED_AT } }, null, 2)}\n`)
}

export const entryFileOf = (root: string, id: string): string => join(root, 'docs', 'loops', 'entries', `${id}.json`)

/** The records of the change record; a line that is not a record is not one of them. */
export async function recordsOf(project: Pick<GitProject, 'store'>): Promise<JournalRecord[]> {
  const text = await readFile(project.store.paths.journal, 'utf8').catch(() => '')
  return text.split('\n').filter(line => line.startsWith('{') && line.endsWith('}')).map(line => JSON.parse(line) as JournalRecord).filter(record => typeof record.op === 'string')
}

/** The state of one entry now. */
export function statusOf(project: Pick<GitProject, 'store'>, id: string): string {
  return project.store.read().entries.find(entry => entry.id === id)?.status.kind ?? 'missing'
}

/**
 * Whether the metrics journal takes one event, checked as the writer checks
 * it (src/metrics/writer.ts: the body's fields of the kind's table, the
 * stored envelope, `checkEvent`; metrics design §4.4). The specs' fake
 * journals keep only what this takes, as the real one does: an event its
 * field tables refuse is lost whole, and a run with it drops off the page.
 */
export function journalTakes(event: EmittedEvent): boolean {
  const table = METRICS_KINDS.get(event.k)
  if (table === undefined) return false
  const given = event.body as Readonly<Record<string, unknown>>
  const body = Object.fromEntries(table.fields.flatMap(spec => given[spec.name] === undefined ? [] : [[spec.name, given[spec.name]]]))
  const stored = { s: FORMAT_VERSION, k: event.k, at: event.at ?? '2026-11-02T01:00:00.000Z', w: '0123abcd', n: 1, h: '000000000000', v: 'spec', by: event.by, body }
  return checkEvent(stored, METRICS_KINDS).ok
}

/** Whether the journal takes the event one board record maps to (src/loops/metrics.ts). */
export function journalTakesRecord(record: LoopRecord): boolean {
  const event = metricEventOf(record)
  return event !== undefined && journalTakes(event)
}

/** The names in a directory, or none when it is not there. */
export const namesIn = (dir: string): Promise<string[]> => readdir(dir).catch(() => [])

/**
 * The one-shot timers the board asks for, held until a case fires them: the
 * debounce, the quiet of the file watch and the limit of a harness action all
 * go through it, so no case waits a real minute.
 */
export function heldTimers(): { readonly timers: Array<{ readonly ms: number, readonly run: () => void }>, readonly delay: (run: () => void, ms: number) => () => void } {
  const timers: Array<{ readonly ms: number, readonly run: () => void }> = []
  return {
    timers,
    delay: (run, ms) => {
      const timer = { ms, run }
      timers.push(timer)
      return () => {
        const at = timers.indexOf(timer)
        if (at >= 0) timers.splice(at, 1)
      }
    },
  }
}


