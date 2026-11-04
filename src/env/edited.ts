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
 * per group. Each group is one event when an entry of the board hears it.
 */
import { statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { performance } from 'node:perf_hooks'
import type { AgentLike, DerivedMessage, ServiceLookup, SessionLike, WorkingDirectoryService } from '../shared/dsh-min.ts'
import { unwrapDeferredCall } from '../shared/deferred-call.ts'
import { dialectService, toNativeTool } from '../shared/dialect.ts'
import { installStepNotice, toolCallArguments, toolCallOutcomes } from '../shared/step-notice.ts'
import { checkoutRootOf, projectOf } from '../data/project-root.ts'
import { loopsService } from '../loops/service.ts'
import { FILES_EDITED_EVENT } from './loop-entry.ts'

/** Source kind of the checks notice (design §6.5); its `source.checks.lastCall` is the last tool call it covered. */
export const CHECKS_NOTICE_SOURCE = 'hourness-checks'

/** At most this many files in one event; the rest are dropped and the event says so (design §6.2). */
export const EDITED_FILES_LIMIT = 200

/** The millisecond this process started: the event keys of a host whose step payload has no turn (design §6.2). */
const PROCESS_STARTED = Math.floor(performance.timeOrigin)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

type Block = NonNullable<DerivedMessage['content']>[number]

/** The files one step found: the absolute targets in call order, and the id of the last call read. */
interface EditedSince {
  readonly last: string | undefined
  readonly targets: readonly string[]
}

/** One checkout's share of the changed files. */
interface EditedGroup {
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

/** The path a file tool call writes, or undefined for any other call. */
function targetOf(block: Block, native: (name: string) => string): string | undefined {
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
  return typeof path === 'string' && path !== '' ? path : undefined
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
  let last: string | undefined
  for (const block of calls.slice(start + 1)) {
    const id = block.id ?? ''
    if (!answered.has(id)) break
    last = id
    if (failed.has(id)) continue
    const path = targetOf(block, native)
    if (path === undefined || (!isAbsolute(path) && base === undefined)) continue
    const absolute = resolve(base ?? '', path)
    if (!targets.includes(absolute)) targets.push(absolute)
  }
  return { last, targets }
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
function sessionDirectory(ctx: ServiceLookup, session: SessionLike): string | undefined {
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

/**
 * Install the changed-files step on one agent: at every step it reads the
 * files the agent changed since the starting point and, when an entry of the
 * loop board hears `env.files-edited` in this project, emits one event per
 * checkout without waiting for it. It injects nothing. `report` receives a
 * session's problem, or undefined once an event went through again. Never
 * throws into the step.
 */
export function installFilesEdited(ctx: ServiceLookup, agent: AgentLike, report: (sessionId: string, problem: string | undefined) => void): (() => void) | undefined {
  let watermark: string | undefined
  let unnumbered = 0
  const uninstall = installStepNotice(agent, 'changed-files event', () => true, (history, { session, step, turn }) => {
    try {
      const cwd = sessionDirectory(ctx, session)
      const edited = editedSince(history, watermark, name => toNativeTool(dialectService(ctx), name), cwd)
      if (edited.last !== undefined) watermark = edited.last
      if (edited.targets.length === 0 || cwd === undefined) return undefined
      const loops = loopsService(ctx, problem => { report(session.id, problem) })
      if (loops === undefined || !loops.listens(FILES_EDITED_EVENT.id, cwd)) return undefined
      const groups = editedGroups(edited.targets, outsideGitRoot(cwd))
      if (groups.length === 0) return undefined
      const stamp = turn === undefined ? `p${PROCESS_STARTED}-${++unnumbered}` : `${turn}-${step}`
      for (const [index, group] of groups.entries()) {
        const key = `files-edited:${session.id}:${stamp}${index === 0 ? '' : `-${index + 1}`}`
        void loops.emit({ event: FILES_EDITED_EVENT.id, cwd, session: session.id, key, payload: { files: group.files, root: group.root, truncated: group.truncated } }).then(
          result => { report(session.id, result.ok ? undefined : `env.files-edited 没交上（${result.code}）：${result.message}`) },
          (error: unknown) => { report(session.id, `env.files-edited 没交上：${error instanceof Error ? error.message : String(error)}`) },
        )
      }
    }
    catch (error) {
      report(session.id, `改动文件没推出来：${error instanceof Error ? error.message : String(error)}`)
    }
    return undefined
  }, 'env')
  return uninstall
}
