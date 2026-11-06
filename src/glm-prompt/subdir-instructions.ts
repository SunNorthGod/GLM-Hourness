/**
 * Subdirectory instructions for the ZCode aliases (docs/DESIGN.md §5.11).
 *
 * rc.3 `dsh-agent-instructions` loads the AGENTS.md / CLAUDE.md files of the
 * directories between the session working directory and a file a native
 * `read`, `write` or `edit` touched, and appends them to the next request.
 * Its trigger table matches the execution's tool name, and on a GLM route the
 * model calls the ZCode aliases `Read`, `Write` and `Edit`, whose executions
 * keep the alias name, so no subdirectory file ever reaches the model there.
 *
 * This notice does what the host does for the natives, for the alias calls:
 * on a GLM step it reads the request-visible history, finds the successful
 * alias calls whose `file_path` lies below the working directory, and
 * appends one user notice with the instruction files of the directories not
 * delivered yet, shallow to deep. The state is derived from the history (the
 * notices carry the directories they delivered), so resume and compaction
 * behave as they do for the host's own messages; directories the host
 * delivered in an earlier non-GLM step (its `agent-instructions` messages
 * name their files) are not sent again.
 *
 * ZCode 3.17.1 itself does not load subdirectory instructions (it reads
 * ~/.zcode/AGENTS.md and the nearest AGENTS.md from the working directory up
 * to the project root once, at session start), so this notice is a request
 * difference from ZCode, recorded in docs/DESIGN.md §5.8.
 */
import { stat, readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { createUserNotice, type AgentLike, type DerivedMessage, type ServiceLookup, type SessionLike, type WorkingDirectoryService } from '../shared/dsh-min.ts'
import { installStepNotice, toolCallArguments, toolCallOutcomes } from '../shared/step-notice.ts'
import { wrapSystemReminder } from '../shared/zcode-notice.ts'

/** Source kind of the persisted notice; its `dirs` fact lists the directories whose files it carries. */
export const SUBDIR_INSTRUCTIONS_SOURCE = 'glm-subdir-instructions'

/** The alias tools whose successful calls touch a file (the host's trigger table, under their ZCode names). */
const FILE_TOUCH_ALIASES: ReadonlySet<string> = new Set(['Read', 'Write', 'Edit'])

/** The host's candidate file names, in its order: the shared files, then the local overlays (dsh-agent-instructions defaults). */
const INSTRUCTION_FILES: readonly string[] = ['AGENTS.md', 'CLAUDE.md', 'AGENTS.local.md', 'CLAUDE.local.md']

/** The host's marker of a project root and its per-batch and per-file byte limits (`maxBytes` in dsh-base, `maxSourceBytes` default). */
const PROJECT_ROOT_MARKER = '.git'
export const MAX_BATCH_BYTES = 65536
const MAX_SOURCE_BYTES = 1048576

/** The host's sentence after the scope line of an additional instruction section. */
const GUIDANCE = 'Use them as guidance when relevant; more specific instructions take precedence. They do not override system, developer, or direct user instructions.'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const byteLength = (value: string): number => Buffer.byteLength(value, 'utf8')

/** The first `maxBytes` of `value` as UTF-8, without a split character at the cut. */
function truncateUtf8(value: string, maxBytes: number): string {
  const bytes = Buffer.from(value, 'utf8')
  if (bytes.length <= maxBytes) return value
  let end = Math.max(0, Math.trunc(maxBytes))
  while (end > 0 && (bytes.readUInt8(end) & 0xc0) === 0x80) end--
  return bytes.subarray(0, end).toString('utf8')
}

/** One instruction file read from a directory below the working directory. */
export interface InstructionFile {
  readonly directory: string
  /** The path relative to the project root, as the host names it. */
  readonly displayPath: string
  readonly content: string
}

/** The absolute paths of the files the history's successful alias calls touched, in call order. */
export function touchedPaths(history: readonly DerivedMessage[], cwd: string): string[] {
  const { answered, failed } = toolCallOutcomes(history)
  const paths: string[] = []
  for (const message of history) {
    if (message.role !== 'assistant') continue
    for (const block of message.content ?? []) {
      if (block.type !== 'tool-call' || block.name === undefined || !FILE_TOUCH_ALIASES.has(block.name)) continue
      if (typeof block.id !== 'string' || !answered.has(block.id) || failed.has(block.id)) continue
      const filePath = toolCallArguments(block)?.file_path
      if (typeof filePath !== 'string' || filePath.trim().length === 0) continue
      paths.push(resolve(cwd, filePath.trim()))
    }
  }
  return [...new Set(paths)]
}

/** The directories below `cwd` down to the one holding `file`, shallow to deep; none when the file is not below `cwd` (the host's `descendantDirsBetween`). */
export function descendantDirs(cwd: string, file: string): string[] {
  const root = resolve(cwd)
  const target = dirname(resolve(root, file))
  const rel = relative(root, target)
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return []
  const dirs: string[] = []
  for (let current = target; current !== root; current = dirname(current)) {
    dirs.push(current)
    if (dirname(current) === current) break
  }
  return dirs.reverse()
}

async function isFile(path: string): Promise<number | undefined> {
  try {
    const info = await stat(path)
    return info.isFile() ? info.size : undefined
  }
  catch {
    return undefined
  }
}

/** The first directory from `cwd` upward that holds the root marker, else `cwd` (the host's `findProjectRoot`). */
async function projectRootOf(cwd: string): Promise<string> {
  const start = resolve(cwd)
  for (let current = start; ; current = dirname(current)) {
    try {
      await stat(join(current, PROJECT_ROOT_MARKER))
      return current
    }
    catch {
      // Not here: keep walking up.
    }
    if (dirname(current) === current) return start
  }
}

/** The instruction files of one directory, host order; a candidate whose trimmed content repeats an earlier one's, or that is empty or too large, is left out. */
async function readDirectory(directory: string, root: string): Promise<InstructionFile[]> {
  const files: InstructionFile[] = []
  const seen = new Set<string>()
  for (const name of INSTRUCTION_FILES) {
    const path = join(directory, name)
    const size = await isFile(path)
    if (size === undefined || size > MAX_SOURCE_BYTES) continue
    let content: string
    try {
      content = await readFile(path, 'utf8')
    }
    catch {
      continue
    }
    if (content.trim().length === 0) continue
    const digest = createHash('sha1').update(content.trim()).digest('hex')
    if (seen.has(digest)) continue
    seen.add(digest)
    files.push({ directory, displayPath: relative(root, path), content })
  }
  return files
}

/** One additional-instructions section (the host's `additionalSectionText`). */
function sectionText(file: InstructionFile): string {
  return [
    `Additional instructions from: ${file.displayPath}`,
    '',
    `These instructions apply to work under \`${dirname(file.displayPath)}\`. ${GUIDANCE}`,
    '',
    file.content,
  ].join('\n')
}

/** The wrapped notice text for `files` and what had to go to fit `maxBytes`. */
function frame(files: readonly InstructionFile[], notes: readonly string[]): string {
  return wrapSystemReminder([...notes, ...files.map(sectionText)].join('\n\n'))
}

/**
 * The notice text within `maxBytes`, as the host's budget does: the shallow
 * files go first, then the deepest one is cut. `included` are the files
 * whose text is in the notice (the deepest one possibly cut).
 */
export function renderBatch(files: readonly InstructionFile[], maxBytes: number = MAX_BATCH_BYTES): { readonly text: string, readonly included: readonly InstructionFile[] } {
  const full = frame(files, [])
  if (byteLength(full) <= maxBytes) return { text: full, included: files }
  const budget = (omitted: readonly InstructionFile[], cut: string): string =>
    `Workspace instruction budget ${maxBytes} bytes: ${[omitted.length > 0 ? `omitted ${omitted.map(file => file.displayPath).join(', ')}` : '', cut].filter(part => part.length > 0).join('; ')}`
  for (let start = 1; start < files.length; start++) {
    const kept = files.slice(start)
    const text = frame(kept, [budget(files.slice(0, start), '')])
    if (byteLength(text) <= maxBytes) return { text, included: kept }
  }
  const deepest = files[files.length - 1]
  if (deepest === undefined) return { text: '', included: [] }
  const omitted = files.slice(0, -1)
  const original = byteLength(deepest.content)
  const cutTo = (bytes: number): { text: string, file: InstructionFile } => {
    const file = { ...deepest, content: truncateUtf8(deepest.content, bytes) }
    return { text: frame([file], [budget(omitted, `truncated ${deepest.displayPath} from ${original} to ${byteLength(file.content)} bytes`)]), file }
  }
  let low = 0
  let high = original
  let best = cutTo(0)
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const candidate = cutTo(middle)
    if (byteLength(candidate.text) <= maxBytes) {
      best = candidate
      low = middle + 1
    }
    else high = middle - 1
  }
  return { text: best.text, included: [best.file] }
}

/** The directories earlier messages delivered: this notice's `dirs` and the files the host's `agent-instructions` messages name (relative to the project root). */
function deliveredDirs(history: readonly DerivedMessage[], root: string): Set<string> {
  const delivered = new Set<string>()
  for (const message of history) {
    const source = message.source
    if (message.role !== 'user' || source === undefined) continue
    if (source.kind === SUBDIR_INSTRUCTIONS_SOURCE && Array.isArray(source.dirs)) {
      for (const dir of source.dirs) if (typeof dir === 'string') delivered.add(dir)
    }
    else if (source.kind === 'agent-instructions' && Array.isArray(source.changes)) {
      for (const change of source.changes) {
        if (isRecord(change) && typeof change.path === 'string' && change.action !== 'remove') delivered.add(dirname(resolve(root, change.path)))
      }
    }
  }
  return delivered
}

/** What one agent remembers between steps: directories found without files, and the project root of each working directory. */
interface SubdirState {
  readonly empty: Set<string>
  readonly roots: Map<string, string>
}

const newSubdirState = (): SubdirState => ({ empty: new Set(), roots: new Map() })

/**
 * The notice for the directories the history's alias touches newly reach: the
 * touched directories not known to hold no files and not delivered by an
 * earlier message in the history. Directories whose files do not fit the
 * budget count as delivered, so the same batch is not sent again every step.
 */
async function buildSubdirNotice(history: readonly DerivedMessage[], cwd: string, state: SubdirState): Promise<ReturnType<typeof createUserNotice> | undefined> {
  const wanted: string[] = []
  for (const file of touchedPaths(history, cwd)) {
    for (const dir of descendantDirs(cwd, file)) if (!state.empty.has(dir) && !wanted.includes(dir)) wanted.push(dir)
  }
  if (wanted.length === 0) return undefined
  let root = state.roots.get(cwd)
  if (root === undefined) {
    root = await projectRootOf(cwd)
    state.roots.set(cwd, root)
  }
  const delivered = deliveredDirs(history, root)
  const files: InstructionFile[] = []
  for (const dir of wanted) {
    if (delivered.has(dir)) continue
    const found = await readDirectory(dir, root)
    if (found.length === 0) state.empty.add(dir)
    files.push(...found)
  }
  if (files.length === 0) return undefined
  const { text, included } = renderBatch(files)
  return createUserNotice(SUBDIR_INSTRUCTIONS_SOURCE, 'subdirectory instructions', text, { dirs: [...new Set(files.map(file => file.directory))], files: included.map(file => file.displayPath) })
}

/** The session's working directory as the file tools resolve against it (the `workingDirectory` service), else the recorded one. */
export function sessionWorkingDirectory(ctx: ServiceLookup, session: SessionLike | undefined): string | undefined {
  if (session === undefined) return undefined
  try {
    const service: unknown = typeof ctx.get === 'function' ? ctx.get('workingDirectory') : undefined
    const current = isRecord(service) && typeof service.get === 'function' ? (service as unknown as WorkingDirectoryService).get(session) : undefined
    if (typeof current === 'string' && current.length > 0) return current
  }
  catch {
    // An unreadable service falls back to the recorded directory.
  }
  const cwd = session.header.cwd
  return typeof cwd === 'string' && cwd.length > 0 ? cwd : undefined
}

/**
 * Install the notice on one agent (src/shared/step-notice.ts). A read that
 * fails is told once and the step goes on without the notice.
 */
export function installSubdirInstructions(agent: AgentLike, eligible: () => boolean, workingDirectory: () => string | undefined): (() => void) | undefined {
  const state = newSubdirState()
  let told = false
  return installStepNotice(agent, 'subdirectory instructions', eligible, async (history) => {
    const cwd = workingDirectory()
    if (cwd === undefined) return undefined
    try {
      return await buildSubdirNotice(history, cwd, state)
    }
    catch (error) {
      if (!told) console.warn(`dsh-glm-hourness/glm-prompt: subdirectory instructions skipped for agent ${agent.id}: ${error instanceof Error ? error.message : String(error)}`)
      told = true
      return undefined
    }
  }, 'glm-prompt')
}
