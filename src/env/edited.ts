/**
 * Which files an agent changed since its last step (M4 design §6.2), and the
 * event the env row hands the loop board for them, `env.files-edited`.
 *
 * At each `agent/pre-step` the row reads the request-visible history: the
 * file tool calls of the agent's assistant messages after the starting
 * point (`write` and `edit` by `file_path`, `str_replace_editor` but `view`
 * by `path`), whose result is not an error. A call is unwrapped from
 * `DeferredToolCall` first and its name mapped to the DSH native (GLM
 * sessions record the aliases `Write`, `Edit`). Paths resolve against the
 * session's working directory; only files that exist now count.
 *
 * The starting point is the later of two calls: the one the latest checks
 * notice (source `hourness-checks`) records, and the one this row has read
 * up to in this process. The notice alone would not do: a step whose checks
 * all pass injects none, and the same files would come back at every step
 * (checks-plan §4 difference 3). After a restart without a notice, the
 * visible calls are read once more.
 *
 * The files are grouped by the checkout they sit in (the nearest `.git`, a
 * work tree's own), relative to its root with forward slashes, at most 200
 * per group. Each group is one event when an entry of the board hears it;
 * then M4's own checker (runner.ts) gets the step, with the edits' new text
 * for the changed lines outside git, and its notice joins the step.
 */
import { statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { performance } from 'node:perf_hooks'
import type { AgentLike, DerivedMessage, ServiceLookup, SessionLike, UserNotice, WorkingDirectoryService } from '../shared/dsh-min.ts'
import type { EditMarks } from './changed-lines.ts'
import { unwrapDeferredCall } from '../shared/deferred-call.ts'
import { dialectService, toNativeTool } from '../shared/dialect.ts'
import { installStepNotice, toolCallArguments, toolCallOutcomes } from '../shared/step-notice.ts'
import { checkoutRootOf, projectOf } from '../data/project-root.ts'
import { loopsService } from '../loops/service.ts'
import { CHECKS_NOTICE_SOURCE } from './check-notice.ts'
import { FILES_EDITED_EVENT } from './loop-entry.ts'

/** At most this many files in one event; the rest are dropped and the event says so (design §6.2). */
export const EDITED_FILES_LIMIT = 200

/** The millisecond this process started: the event keys of a host whose step payload has no turn (design §6.2). */
const PROCESS_STARTED = Math.floor(performance.timeOrigin)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

type Block = NonNullable<DerivedMessage['content']>[number]

/** The files one step found: the absolute targets in call order, what the calls wrote into each, and the id of the last call read. */
interface EditedSince {
  readonly last: string | undefined
  readonly targets: readonly string[]
  /** By absolute target: a whole write, or the new text of edits (the changed lines outside git, changed-lines.ts). */
  readonly marks: ReadonlyMap<string, EditMarks>
}

/** One checkout's share of the changed files. */
export interface EditedGroup {
  /** The checkout root: the directory holding the nearest `.git` (a work tree's own root), or the project root outside git. */
  readonly root: string
  /** Relative to `root`, forward slashes, at most EDITED_FILES_LIMIT. */
  readonly files: readonly string[]
  readonly truncated: boolean
}

/** The last call the latest checks notice covered, or undefined. */
function noticeMark(history: readonly DerivedMessage[]): string | undefined {
  let mark: string | undefined
  for (const message of history) {
    if (message.role !== 'user' || message.source?.kind !== CHECKS_NOTICE_SOURCE) continue
    const checks = message.source.checks
    if (isRecord(checks) && typeof checks.lastCall === 'string') mark = checks.lastCall
  }
  return mark
}

/** The path a file tool call writes and what it put there, or undefined for any other call. */
function targetOf(block: Block, native: (name: string) => string): { readonly path: string, readonly insert?: { readonly text: string, readonly all: boolean } } | undefined {
  let name = block.name ?? ''
  let args: unknown = toolCallArguments(block)
  const wrapped = unwrapDeferredCall(name, args)
  if (wrapped !== undefined) {
    name = wrapped.name
    args = wrapped.arguments
  }
  if (!isRecord(args)) return undefined
  const tool = native(name)
  const path = tool === 'write' || tool === 'edit' ? args.file_path : tool === 'str_replace_editor' && args.command !== 'view' ? args.path : undefined
  if (typeof path !== 'string' || path === '') return undefined
  // An edit's new text (replace_all may be a ZCode semantic-boolean string); any other write counts the whole file.
  const text = tool === 'edit' ? args.new_string : tool === 'str_replace_editor' && (args.command === 'str_replace' || args.command === 'insert') ? args.new_str : undefined
  return typeof text === 'string' ? { path, insert: { text, all: tool === 'edit' && (args.replace_all === true || args.replace_all === 'true') } } : { path }
}

/**
 * The files the calls after the starting point wrote (absolute, deduplicated,
 * in call order) and the last call read. A call without a result yet ends the
 * reading: it is read at a later step. `base` resolves relative paths; without
 * it a relative path is skipped. Pure over the history.
 */
export function editedSince(history: readonly DerivedMessage[], watermark: string | undefined, native: (name: string) => string, base: string | undefined): EditedSince {
  const calls = history.flatMap(message => message.role === 'assistant' ? (message.content ?? []).filter(block => block.type === 'tool-call' && typeof block.id === 'string') : [])
  const position = (id: string | undefined): number => id === undefined ? -1 : calls.findIndex(block => block.id === id)
  const start = Math.max(position(noticeMark(history)), position(watermark))
  const { answered, failed } = toolCallOutcomes(history)
  const targets: string[] = []
  const marks = new Map<string, EditMarks>()
  let last: string | undefined
  for (const block of calls.slice(start + 1)) {
    const id = block.id ?? ''
    if (!answered.has(id)) break
    last = id
    if (failed.has(id)) continue
    const target = targetOf(block, native)
    if (target === undefined || (!isAbsolute(target.path) && base === undefined)) continue
    const absolute = resolve(base ?? '', target.path)
    if (!targets.includes(absolute)) targets.push(absolute)
    const before = marks.get(absolute) ?? { whole: false, inserts: [] }
    marks.set(absolute, target.insert === undefined ? { whole: true, inserts: before.inserts } : { whole: before.whole, inserts: [...before.inserts, target.insert] })
  }
  return { last, targets, marks }
}

const isFile = (path: string): boolean => {
  try {
    return statSync(path).isFile()
  }
  catch {
    return false
  }
}

/**
 * Group the targets that exist now by their checkout (design §6.2, review
 * N40). `outsideGit` is the session's project root when that project is not
 * in git: its files have no `.git` above them and group under it; any other
 * file without a checkout is skipped.
 */
export function editedGroups(targets: readonly string[], outsideGit?: string): readonly EditedGroup[] {
  const groups = new Map<string, { files: string[], truncated: boolean }>()
  for (const target of targets) {
    if (!isFile(target)) continue
    const root = checkoutRootOf(target) ?? outsideGit
    if (root === undefined) continue
    const file = relative(root, target).split(sep).join('/')
    if (file === '' || file === '..' || file.startsWith('../') || isAbsolute(file)) continue
    const group = groups.get(root) ?? { files: [], truncated: false }
    groups.set(root, group)
    if (group.files.includes(file)) continue
    if (group.files.length >= EDITED_FILES_LIMIT) group.truncated = true
    else group.files.push(file)
  }
  return [...groups].map(([root, group]) => ({ root, files: group.files, truncated: group.truncated }))
}

/** The session's working directory as the file tools resolve against it (the `workingDirectory` service, as the guard reads it), else the recorded one. */
export function sessionDirectory(ctx: ServiceLookup, session: SessionLike): string | undefined {
  try {
    const service: unknown = typeof ctx.get === 'function' ? ctx.get('workingDirectory') : undefined
    const current = isRecord(service) && typeof service.get === 'function' ? (service as unknown as WorkingDirectoryService).get(session) : undefined
    if (typeof current === 'string' && current !== '') return current
  }
  catch {
    // An unreadable service falls back to the recorded directory.
  }
  const cwd = session.header.cwd
  return typeof cwd === 'string' && cwd !== '' ? cwd : undefined
}

/** The project root of a working directory when the project is not in git, else undefined. */
function outsideGitRoot(cwd: string): string | undefined {
  const project = projectOf(cwd)
  return project !== undefined && !project.git ? project.root : undefined
}

/** What one step changed, for M4's own checks (runner.ts): every step gets one, with or without changed files (results of earlier steps arrive). */
export interface EditedStep {
  readonly session: SessionLike
  /** The session's working directory, undefined when it has none. */
  readonly cwd: string | undefined
  readonly groups: readonly EditedGroup[]
  /** By absolute target, as `editedSince` gives them. */
  readonly marks: ReadonlyMap<string, EditMarks>
  readonly history: readonly DerivedMessage[]
  /** The last call read so far (this step's, else the earlier mark): the checks notice records it as `source.checks.lastCall`. */
  readonly mark: string | undefined
}

/**
 * Install the changed-files step on one agent: at every step it reads the
 * files the agent changed since the starting point and, when an entry of the
 * loop board hears `env.files-edited` in this project, emits one event per
 * checkout without waiting for it; then `checks` gets the step (M4's own
 * checker) and its notice, if any, joins the step. `report` receives a
 * session's problem, or undefined once an event went through again. Never
 * throws into the step.
 */
export function installFilesEdited(ctx: ServiceLookup, agent: AgentLike, report: (sessionId: string, problem: string | undefined) => void, checks?: (step: EditedStep) => Promise<UserNotice | undefined>): (() => void) | undefined {
  let watermark: string | undefined
  let unnumbered = 0
  const uninstall = installStepNotice(agent, 'changed-files event', () => true, async (history, { session, step, turn }) => {
    let edited: EditedStep = { session, cwd: undefined, groups: [], marks: new Map(), history, mark: watermark }
    try {
      const cwd = sessionDirectory(ctx, session)
      const since = editedSince(history, watermark, name => toNativeTool(dialectService(ctx), name), cwd)
      if (since.last !== undefined) watermark = since.last
      const groups = since.targets.length === 0 || cwd === undefined ? [] : editedGroups(since.targets, outsideGitRoot(cwd))
      edited = { session, cwd, groups, marks: since.marks, history, mark: watermark }
      const loops = groups.length === 0 || cwd === undefined ? undefined : loopsService(ctx, problem => { report(session.id, problem) })
      if (loops !== undefined && cwd !== undefined && loops.listens(FILES_EDITED_EVENT.id, cwd)) {
        const stamp = turn === undefined ? `p${PROCESS_STARTED}-${++unnumbered}` : `${turn}-${step}`
        for (const [index, group] of groups.entries()) {
          const key = `files-edited:${session.id}:${stamp}${index === 0 ? '' : `-${index + 1}`}`
          void loops.emit({ event: FILES_EDITED_EVENT.id, cwd, session: session.id, key, payload: { files: group.files, root: group.root, truncated: group.truncated } }).then(
            result => { report(session.id, result.ok ? undefined : `env.files-edited 没交上（${result.code}）：${result.message}`) },
            (error: unknown) => { report(session.id, `env.files-edited 没交上：${error instanceof Error ? error.message : String(error)}`) },
          )
        }
      }
    }
    catch (error) {
      report(session.id, `改动文件没推出来：${error instanceof Error ? error.message : String(error)}`)
    }
    if (checks === undefined) return undefined
    try {
      return await checks(edited)
    }
    catch (error) {
      // The checker never throws by design; a slip must still not break the step.
      report(session.id, `检查没跑成：${error instanceof Error ? error.message : String(error)}`)
      return undefined
    }
  }, 'env')
  return uninstall
}
