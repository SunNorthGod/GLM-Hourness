/**
 * The plaintext export of one session's log (docs/DESIGN.md §2.4, §5.6):
 * what the model reads with Read after a GLM compaction, when the summary
 * ends with ZCode 3.17.1's transcript sentence
 * (src/glm-prompt/zcode-compact-text.ts).
 *
 * Source: `sessionQuery.filterEvents(sessionId, [])` (official
 * @deepseek-ai/dsh-session-query 0.2.1-rc.3, lib/types/index.d.ts:118),
 * one log load that returns the first-party semantic text of every event in
 * ascending seq order (user and assistant text, tool-call names and
 * arguments, tool results, todos, turn ends; reasoning, images and
 * structural events give no text). Only the session that is being compacted
 * is read.
 *
 * Place: `<project data dir>/transcripts/<session id>.txt`, the project
 * data dir resolved like the journals (src/data/project-home.ts: row `home`,
 * else `<project root>/.llm` of the session's working directory, else the
 * data service's project directory). A directory named `.llm` is made
 * git-ignored first (src/data/llm-ignore.ts); when git still sees it,
 * nothing is written.
 *
 * Format: plain UTF-8 text with LF line ends, a five-line header, then one
 * entry per document: `=== #<seq> <kind> <ISO time>`, the text, an empty
 * line. Lines longer than TRANSCRIPT_LINE_MAX code points continue on the
 * next line, so Read's line window (2000 lines, 2000 characters per line,
 * 50 KB; rc.3 dsh-tool-fs) pages through the file without truncating a
 * line.
 *
 * Redaction: the text of every document goes through the secret-shape table
 * (src/data/secret-shape.ts, the one the memory rows' secret_like check
 * uses), each matching run becomes `[redacted]`, and the header's fourth
 * line says how many runs were replaced. When redaction throws, nothing is
 * written: the export is skipped with the reason, so the summary names no
 * file and the row health says why.
 *
 * Cleanup: after each write, the other `<id>.txt` files of the same
 * directory whose last write is more than TRANSCRIPT_KEEP_DAYS days old are
 * deleted; nothing else in the directory is touched.
 */
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { ensureLlmIgnored } from './llm-ignore.ts'
import { projectHomeFor } from './project-home.ts'
import { REDACTED, redactSecretsCounted } from './secret-shape.ts'
import type { AgentsService, ServiceLookup, SessionEventDocumentLike, SessionQueryLike } from '../shared/dsh-min.ts'

/** The directory under the project data dir that holds the exports. */
export const TRANSCRIPTS_DIR = 'transcripts'

/** Longest line of an export, in code points; a longer line continues on the next. */
export const TRANSCRIPT_LINE_MAX = 1000

/** How many days an export of another session is kept after its last write. */
export const TRANSCRIPT_KEEP_DAYS = 14

/** A session id that can be a file name as it is. */
const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/

/** The name of an export file; cleanup deletes nothing else. */
const TRANSCRIPT_FILE = /^[A-Za-z0-9_-]{1,128}\.txt$/

const DAY_MS = 86_400_000

/** The entry kind of each event type that has text (rc.3 session-query:545–565); any other type is written as it is. */
const KINDS: Readonly<Record<string, string>> = {
  'user/message': 'user',
  'assistant/message': 'assistant',
  'tool/call': 'tool call',
  'tool/result': 'tool result',
  'todo/write': 'todo',
  'turn/end': 'turn end',
}

/** What one export came to: the entries written, the runs redacted and the cleanup done after a write. */
export type ExportResult =
  | { readonly kind: 'written', readonly path: string, readonly entries: number, readonly redacted: number, readonly cleanup: CleanupResult }
  | { readonly kind: 'skipped', readonly reason: string }

export interface CleanupResult {
  readonly removed: number
  readonly failed: number
}

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error)

function isoOf(ms: number): string {
  const date = new Date(ms)
  return Number.isNaN(date.getTime()) ? 'unknown time' : date.toISOString()
}

/** One text line cut into pieces of at most TRANSCRIPT_LINE_MAX code points; a surrogate pair is never split. */
function splitLine(line: string): string[] {
  if (line.length <= TRANSCRIPT_LINE_MAX) return [line]
  const points = Array.from(line)
  if (points.length <= TRANSCRIPT_LINE_MAX) return [line]
  const pieces: string[] = []
  for (let start = 0; start < points.length; start += TRANSCRIPT_LINE_MAX) pieces.push(points.slice(start, start + TRANSCRIPT_LINE_MAX).join(''))
  return pieces
}

/**
 * The export text of one session's documents, exported at `exportedAt`, with
 * every credential-like run of a document's text replaced before its lines
 * are cut, and how many runs were replaced. Throws when the redaction throws
 * (redactSecretsCounted).
 */
export function renderTranscript(sessionId: string, documents: readonly SessionEventDocumentLike[], exportedAt: Date): { readonly text: string, readonly redacted: number } {
  const entries = documents.map(document => ({ document, body: redactSecretsCounted(document.text) }))
  const redacted = entries.reduce((sum, entry) => sum + entry.body.replaced, 0)
  const lines = [
    `Transcript of session ${sessionId}, exported ${isoOf(exportedAt.getTime())} when the conversation was compacted.`,
    'Entries are the session\'s messages, tool calls and tool results up to that point, oldest first, as plain text; reasoning and images are left out.',
    `Each entry starts with a line "=== #<seq> <kind> <time>". Lines longer than ${TRANSCRIPT_LINE_MAX} characters continue on the next line.`,
    `Strings that look like credentials (named key prefixes, Bearer values, private keys, long mixed-case tokens, 32 or more hex digits such as a full commit id) are replaced with ${REDACTED}. Replaced in this export: ${redacted}.`,
    '',
  ]
  for (const { document, body } of entries) {
    lines.push(`=== #${document.seq} ${KINDS[document.type] ?? document.type} ${isoOf(document.time)}`)
    for (const line of body.text.split(/\r\n|\r|\n/)) lines.push(...splitLine(line))
    lines.push('')
  }
  return { text: `${lines.join('\n')}\n`, redacted }
}

/** Delete the export files in `dir` other than `keepName` whose last write is more than TRANSCRIPT_KEEP_DAYS days before `nowMs`. */
export async function cleanTranscripts(dir: string, keepName: string, nowMs: number): Promise<CleanupResult> {
  let names: string[]
  try {
    names = (await readdir(dir, { withFileTypes: true })).filter(entry => entry.isFile() && TRANSCRIPT_FILE.test(entry.name) && entry.name !== keepName).map(entry => entry.name)
  }
  catch {
    return { removed: 0, failed: 1 }
  }
  let removed = 0
  let failed = 0
  for (const name of names) {
    try {
      const file = join(dir, name)
      if (nowMs - (await stat(file)).mtimeMs <= TRANSCRIPT_KEEP_DAYS * DAY_MS) continue
      await unlink(file)
      removed += 1
    }
    catch {
      failed += 1
    }
  }
  return { removed, failed }
}

function sessionQueryOf(ctx: ServiceLookup): SessionQueryLike | undefined {
  const value = (typeof ctx.get === 'function' ? ctx.get('sessionQuery') : undefined) as Partial<SessionQueryLike> | undefined
  return typeof value?.filterEvents === 'function' ? value as SessionQueryLike : undefined
}

/** The working directory of a live session (rc.3 dsh-agent `get`, agent:596), undefined when the session is not live or has none. */
function cwdOf(ctx: ServiceLookup, sessionId: string): string | undefined {
  const agents = (typeof ctx.get === 'function' ? ctx.get('agents') : undefined) as Partial<AgentsService> | undefined
  return typeof agents?.get === 'function' ? agents.get(sessionId)?.session.header.cwd : undefined
}

/**
 * Export one session's log to `<project data dir>/transcripts/<id>.txt`,
 * rewriting an earlier export of the same session, then clean the
 * directory. Every failure comes back as `skipped` with its reason; never
 * rejects.
 */
export async function exportTranscript(ctx: ServiceLookup, home: string | undefined, sessionId: string, now: Date): Promise<ExportResult> {
  try {
    if (!SESSION_ID.test(sessionId)) return { kind: 'skipped', reason: `会话 id 不能直接做文件名，不导出：${sessionId.slice(0, 80)}` }
    const query = sessionQueryOf(ctx)
    if (query === undefined) return { kind: 'skipped', reason: '没有 sessionQuery 服务，读不到会话日志' }
    const dir = projectHomeFor(ctx, home, cwdOf(ctx, sessionId))
    if (dir === undefined) return { kind: 'skipped', reason: '会话不在任何项目里，没有可写的 .llm/' }
    if (basename(dir) === '.llm') {
      const outcome = await ensureLlmIgnored(dirname(dir))
      if (outcome.kind === 'unwritable' || outcome.kind === 'visible') return { kind: 'skipped', reason: `.llm/ 没有确认被 git 忽略，不写明文副本：${outcome.reason}` }
    }
    let documents: readonly SessionEventDocumentLike[]
    try {
      documents = await query.filterEvents(sessionId, [])
    }
    catch (error) {
      return { kind: 'skipped', reason: `读会话日志失败：${messageOf(error)}` }
    }
    let rendered: ReturnType<typeof renderTranscript>
    try {
      rendered = renderTranscript(sessionId, documents, now)
    }
    catch (error) {
      return { kind: 'skipped', reason: `遮掉像凭证的字符串失败，不写明文：${messageOf(error)}` }
    }
    const folder = resolve(dir, TRANSCRIPTS_DIR)
    const name = `${sessionId}.txt`
    const path = join(folder, name)
    await mkdir(folder, { recursive: true })
    await writeFile(path, rendered.text, 'utf8')
    return { kind: 'written', path, entries: documents.length, redacted: rendered.redacted, cleanup: await cleanTranscripts(folder, name, now.getTime()) }
  }
  catch (error) {
    return { kind: 'skipped', reason: `写导出文件失败：${messageOf(error)}` }
  }
}
