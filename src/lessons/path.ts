/**
 * The reminder at a file (docs-at-hand design 0.3 §5): when an agent reads,
 * writes or edits a file and the call succeeds, the result carries one reminder
 * that gathers what the project knows about that path. The lessons that match
 * the path, the decisions the component's `AGENTS.md` lists with what the graph
 * says of them now, the open work under the path, and the component's
 * `AGENTS.md` itself when the host did not deliver it to this session.
 *
 * The listener is on `tools/post-execute` of the host, beside the failure
 * matching (src/lessons/failure.ts) and with the same rules: it only adds, a
 * call is never refused, changed or cancelled, a failure of its own leaves the
 * result as it was, warns once and shows in the health of the session's row.
 * A call is either a failure (failure matching speaks) or a success (this
 * speaks), so one call carries one reminder. What a session was told is the
 * visible history of the notices of both sources plus what this process pushed
 * since, so a lesson, a decision or a component is told once.
 *
 * Whether the host delivers the component's `AGENTS.md` is judged from what
 * the call is, not from the host's own message (which comes a step later): the
 * native file tools, a component below the session's working directory and a
 * session whose history holds the host's instructions message; or a component
 * the opening baseline holds (the working directory itself or above it).
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { isObject } from '../data/refusal.ts'
import { checkoutRootOf } from '../data/project-root.ts'
import { sessionDirectory } from '../env/edited.ts'
import { repoRelative } from '../execute/scope.ts'
import { graphService } from '../graph/service.ts'
import { loadGraph } from '../graph/store.ts'
import type { LoadedGraph } from '../graph/store.ts'
import { createUserNotice, type DerivedMessage, type PostExecuteHost, type PostExecutePayload, type ServiceLookup, type SessionLike, type UserNotice } from '../shared/dsh-min.ts'
import { componentDirOf, decisionIdsOf, DECISIONS_LISTED, graphFacts, pathNotice, WORK_LISTED, type Listed } from './docs.ts'
import { PATH_SOURCE, toldTo } from './failure.ts'
import { relevant } from './match.ts'
import { briefLine } from './render.ts'
import { projectDirFor, readLessons, type LessonsEnv } from './storage.ts'

/** The native file tools this reminder follows; the argument that names the file is `file_path`. */
const FILE_TOOLS: ReadonlySet<string> = new Set(['read', 'write', 'edit'])
const LESSONS_LISTED = 3
const AGENTS_MAX_BYTES = 64 * 1024
/** How long the graph read for one project is kept. */
const GRAPH_KEPT_MS = 10_000
/** The source of the message the host's `dsh-agent-instructions` row adds (src/lessons has no other reader of it). */
const HOST_INSTRUCTIONS = 'agent-instructions'

/** What the listener needs of the row. */
export interface PathParts {
  readonly ctx: PostExecuteHost & ServiceLookup
  readonly env: LessonsEnv
  /** What this process pushed to each session, shared with the failure matching. */
  readonly pushedBy: WeakMap<SessionLike, Set<string>>
  /** Tell the row's health how the session stands. */
  report(session: SessionLike): Promise<void>
  /** Warn on the console once per key. */
  warn(key: string, text: string): void
}

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error)
const digestOf = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 12)
const same = (a: string, b: string): boolean => process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b)

/** Whether `inner` is `outer` itself (`strict` false) or something below it. */
function below(outer: string, inner: string, strict: boolean): boolean {
  const rel = relative(resolve(outer), resolve(inner))
  if (rel === '') return !strict
  return !isAbsolute(rel) && rel.split(sep)[0] !== '..'
}

/** The text of a component's `AGENTS.md`, or undefined when it is missing or larger than the cap (a document that cannot be read whole is not sent in part). */
async function readAgents(file: string): Promise<{ readonly text?: string, readonly problem?: string }> {
  try {
    const size = (await stat(file)).size
    if (size > AGENTS_MAX_BYTES) return { problem: `${file} is larger than ${AGENTS_MAX_BYTES} bytes` }
    return { text: await readFile(file, 'utf8') }
  }
  catch (error) {
    return { problem: `${file}: ${messageOf(error)}` }
  }
}

/**
 * Whether the host delivers the component's `AGENTS.md` to this session by
 * itself (design §5.3): the opening baseline holds every component from the
 * project root down to the working directory; a component below the working
 * directory is delivered the step after a native `read`, `write` or `edit`
 * touched it. Either needs the host's instructions message in the session's
 * history, which says the row is on and the file system service is there.
 * `callName` is the name the call had, not the native it runs: the host's
 * trigger table reads the former, so an alias (`Read`) does not trigger it.
 */
function hostDelivers(history: readonly DerivedMessage[], callName: string, component: string, cwd: string): boolean {
  if (!history.some(message => message.source?.kind === HOST_INSTRUCTIONS)) return false
  if (below(component, cwd, false)) return true
  return FILE_TOOLS.has(callName) && below(cwd, component, true)
}

/** The reminder for one successful call, or undefined when there is nothing to say. */
async function remind(parts: PathParts, graphs: Map<string, { at: number, graph: LoadedGraph }>, exec: PostExecutePayload, session: SessionLike, native: string): Promise<UserNotice | undefined> {
  const { env, ctx } = parts
  const problems: string[] = []
  const target = isObject(exec.arguments) && typeof exec.arguments.file_path === 'string' ? exec.arguments.file_path : undefined
  const cwd = sessionDirectory(ctx, session)
  if (target === undefined || target === '' || cwd === undefined) return undefined
  const file = resolve(cwd, target)
  const root = checkoutRootOf(file)
  if (root === undefined) return undefined
  const repoPath = repoRelative(root, cwd, target)
  if (repoPath === undefined || repoPath === '') return undefined

  // The component, and its document.
  const componentDir = componentDirOf(root, file, dir => existsSync(join(dir, 'AGENTS.md')))
  const componentRel = componentDir === undefined ? undefined : relative(root, componentDir).split(sep).join('/')
  const isDocument = componentDir !== undefined && same(file, join(componentDir, 'AGENTS.md'))
  let agents: string | undefined
  if (componentDir !== undefined) {
    const read = await readAgents(join(componentDir, 'AGENTS.md'))
    agents = read.text
    if (read.problem !== undefined) problems.push(`组件文档读不出，这一部分不送：${read.problem}`)
  }

  // What the project knows of the path: only when the file is in the session's own project.
  const projectDir = env.dirOf(session)
  const fileProject = projectDirFor(ctx, dirname(file))
  const own = projectDir !== undefined && fileProject !== undefined && same(fileProject, projectDir)
  let lessons: string[] = []
  let lessonIds: string[] = []
  if (own) {
    const read = await readLessons(projectDir)
    if (read.ok) {
      const found = relevant(read.reading.state, { paths: [repoPath], tools: [native], commands: [], ignoreCase: env.ignoreCase, limit: LESSONS_LISTED }, env.now().toISOString())
      lessons = found.map(item => briefLine(item.lesson))
      lessonIds = found.map(item => item.lesson.id)
    }
    else problems.push(`读不出经验：${read.reason}`)
  }
  let facts: { readonly decisions: readonly Listed[], readonly work: readonly Listed[] } = { decisions: [], work: [] }
  const graphDir = own ? graphService(ctx)?.dirFor(cwd) : undefined
  if (graphDir !== undefined) {
    try {
      const kept = graphs.get(graphDir)
      const graph = kept !== undefined && env.now().getTime() - kept.at < GRAPH_KEPT_MS ? kept.graph : await loadGraph(graphDir)
      if (graph !== kept?.graph) graphs.set(graphDir, { at: env.now().getTime(), graph })
      facts = graphFacts(graph.nodes, repoPath, agents === undefined ? [] : decisionIdsOf(agents))
    }
    catch (error) {
      problems.push(`读不出项目图：${messageOf(error)}`)
    }
  }
  env.note(session.id, 'path', problems.length === 0 ? undefined : `路径提醒有一部分没送：${problems.join('；')}`)
  if (problems.length > 0) await parts.report(session)

  // Everything below is synchronous: what this call claims, a parallel call that finishes later does not claim again.
  const pushed = parts.pushedBy.get(session) ?? new Set<string>()
  parts.pushedBy.set(session, pushed)
  let history: readonly DerivedMessage[] = []
  let historyKnown = true
  try {
    history = session.deriveMessages() as readonly DerivedMessage[]
  }
  catch (error) {
    historyKnown = false
    parts.warn('path-history', `the history of the session could not be read, so the reminder does not know what was told: ${messageOf(error)}`)
  }
  const told = toldTo(history, pushed)
  const fresh = (key: string): boolean => !told.has(key)
  const bodyKey = componentRel === undefined || agents === undefined ? undefined : `doc:${componentRel}@${digestOf(agents)}`
  const sendBody = bodyKey !== undefined && !isDocument && fresh(bodyKey) && (!historyKnown || !hostDelivers(history, exec.name, componentDir ?? '', cwd))
  const decisions = facts.decisions.filter(item => fresh(`decision:${item.id}`))
  const work = facts.work.filter(item => fresh(`work:${item.id}`))
  const freshLessons = lessons.filter((_, index) => fresh(lessonIds[index] ?? ''))
  const keepKey = componentRel === undefined ? undefined : `keep:${componentRel}`
  const keepTrue = keepKey !== undefined && native !== 'read' && fresh(keepKey)
  const text = pathNotice({
    path: repoPath,
    ...(componentRel === undefined ? {} : { component: componentRel }),
    ...(sendBody && agents !== undefined ? { body: agents } : {}),
    decisions: decisions.slice(0, DECISIONS_LISTED).map(item => item.line),
    decisionsMore: Math.max(0, decisions.length - DECISIONS_LISTED),
    work: work.slice(0, WORK_LISTED).map(item => item.line),
    workMore: Math.max(0, work.length - WORK_LISTED),
    lessons: freshLessons,
    keepTrue,
  })
  if (text === undefined) return undefined
  const keys = [
    ...(sendBody && bodyKey !== undefined ? [bodyKey] : []),
    ...decisions.slice(0, DECISIONS_LISTED).map(item => `decision:${item.id}`),
    ...work.slice(0, WORK_LISTED).map(item => `work:${item.id}`),
    ...lessonIds.filter((_, index) => fresh(lessonIds[index] ?? '')),
    ...(keepTrue && keepKey !== undefined ? [keepKey] : []),
  ]
  for (const key of keys) pushed.add(key)
  return createUserNotice(PATH_SOURCE, 'docs and lessons at hand', text, { keys })
}

/** Install the listener on the host; the function that takes it back. */
export function installPathNotices(parts: PathParts): () => void {
  const graphs = new Map<string, { at: number, graph: LoadedGraph }>()
  return parts.ctx.on('tools/post-execute', async (exec, result, next) => {
    const downstream = await next()
    const session = exec.agent?.session
    const native = parts.env.native(exec.name)
    // A failed call is the failure matching's; a call a tool made inside another (`parent`) is not looked at.
    if (session === undefined || exec.parent !== undefined || result.isError || !FILE_TOOLS.has(native)) return downstream
    try {
      const notice = await remind(parts, graphs, exec, session, native)
      return notice === undefined ? downstream : { ...downstream, additionalContexts: [notice, ...downstream.additionalContexts ?? []] }
    }
    catch (error) {
      parts.warn('path-notice', `the reminder at a file failed, the result stays as it was: ${messageOf(error)}`)
      parts.env.note(session.id, 'path', `路径提醒出错：${messageOf(error)}`)
      await parts.report(session).catch(() => undefined)
      return downstream
    }
  })
}
