/**
 * What the lessons row says about a file's component when an agent touches the
 * file (docs-at-hand design 0.3 §4, §5): which component a file belongs to, the
 * decision ids the component's `AGENTS.md` lists, what the project graph says
 * about them and about the open work under the path, and the one reminder these
 * and the lessons that match the path become. Pure functions; the listener that
 * reads the files and the graph is src/lessons/path.ts.
 *
 * A component is a directory below the checkout root that holds an `AGENTS.md`;
 * a file belongs to the nearest one above it. The `AGENTS.md` lists decisions by
 * id only, so what the reminder says of a decision (its status, whether it was
 * verified, overturned or replaced) is read from the graph at the moment, and a
 * decision overturned later does not leave the document saying the old thing.
 */
import path from 'node:path'
import { within, type PathApi } from '../execute/scope.ts'
import { ID_PATTERN, type GraphNode } from '../graph/schema.ts'
import { wrapSystemReminder } from '../shared/zcode-notice.ts'

/** The most of the component's `AGENTS.md` the reminder carries. */
export const BODY_MAX = 2_500
/** The most the whole reminder holds. */
export const NOTICE_MAX = 4_000
export const DECISIONS_LISTED = 5
export const WORK_LISTED = 3
const TITLE_MAX = 80

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim()

/** `text` cut to `max` characters with an ellipsis; a cut never leaves half of a surrogate pair. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text
  const kept = text.slice(0, Math.max(0, max - 1))
  return `${/[\uD800-\uDBFF]$/.test(kept) ? kept.slice(0, -1) : kept}…`
}

/**
 * The nearest directory at or above `start`, below the checkout root `base`
 * (the root itself is no component), for which `hasAgents` says there is an
 * `AGENTS.md`. A directory outside the base belongs to none.
 */
function componentAbove(base: string, start: string, hasAgents: (dir: string) => boolean, api: PathApi & Pick<typeof path, 'dirname'>): string | undefined {
  let dir = start
  for (;;) {
    const relative = api.relative(base, dir)
    if (relative === '' || api.isAbsolute(relative) || relative.split(api.sep)[0] === '..') return undefined
    if (hasAgents(dir)) return dir
    const parent = api.dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/**
 * The component a file belongs to: the nearest directory above the file, below
 * `root` (the root itself is no component), for which `hasAgents` says there is
 * an `AGENTS.md`. The file may be that `AGENTS.md` itself. A file outside the
 * root belongs to none.
 */
export function componentDirOf(root: string, file: string, hasAgents: (dir: string) => boolean, api: PathApi & Pick<typeof path, 'dirname'> = path): string | undefined {
  return componentAbove(api.resolve(root), api.dirname(api.resolve(file)), hasAgents, api)
}

/**
 * The components a write scope touches (docs-at-hand design 0.3 §4.1, §5.5):
 * for every entry the nearest directory that holds an `AGENTS.md` — a
 * directory entry (a trailing `/`) starts at itself, since such a document
 * applies to work under it; a file entry starts at its parent — once each, in
 * the order the scope first touches them, repository-relative. Entries that
 * name no component (the checkout root, outside paths) contribute none.
 */
export function scopeComponents(scope: readonly string[], root: string, hasAgents: (dir: string) => boolean, api: PathApi & Pick<typeof path, 'dirname'> = path): readonly string[] {
  const base = api.resolve(root)
  const found: string[] = []
  for (const entry of scope) {
    const clean = entry.replace(/\/+$/, '')
    const start = clean.length === entry.length ? api.dirname(api.resolve(base, entry)) : api.resolve(base, clean)
    const dir = componentAbove(base, start, hasAgents, api)
    if (dir === undefined) continue
    const relative = api.relative(base, dir).split(api.sep).join('/')
    if (!found.includes(relative)) found.push(relative)
  }
  return found
}

const DECISIONS_HEADING = /^(#{1,6})\s*(?:Decisions|决策)\s*$/i

/**
 * The decision ids a component's `AGENTS.md` lists: the list items of its
 * decisions section (heading `Decisions` or `决策`, up to the next heading), each
 * starting with a graph node id. Anything else in the section is not an id and
 * is left out; one id counts once, in the order of the document.
 */
export function decisionIdsOf(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/)
  const start = lines.findIndex(line => DECISIONS_HEADING.test(line.trim()))
  if (start < 0) return []
  const ids: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line.trim())) break
    const item = /^\s*[-*]\s+`?([A-Za-z0-9][A-Za-z0-9-]*)`?(?=$|[\s:,.;，。：；（(])/.exec(line)
    const id = item?.[1]
    if (id !== undefined && ID_PATTERN.test(id) && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/** One decision or task line and the id it stands for, for the dedupe keys. */
export interface Listed {
  readonly id: string
  readonly line: string
}

/** What the graph says about a path: the decisions and the open work, each in the order they are listed, with the count that did not fit. */
export interface GraphFacts {
  readonly decisions: readonly Listed[]
  readonly work: readonly Listed[]
}

const LIVE_TASK: ReadonlySet<string> = new Set(['approved', 'doing'])
const COUNTED_TASK: ReadonlySet<string> = new Set(['approved', 'doing', 'done'])

function decisionLine(node: GraphNode): string {
  const parts: string[] = [node.status]
  if (node.verification === 'sandbox' || node.verification === 'device') parts.push(`verified on ${node.verification}`)
  if (node.verification === 'overturned') parts.push('overturned')
  const by = [...node.history].reverse().find(entry => entry.op === 'supersede' && entry.by !== undefined)?.by
  if (node.status === 'superseded' && by !== undefined) parts.push(`superseded by ${by}`)
  return `${node.id} "${clip(oneLine(node.title), TITLE_MAX)}" (${parts.join(', ')})`
}

/**
 * The decisions and the open work for one repository-relative path. A task is
 * under the path when one of its write scope entries contains it (`within`, the
 * judgement the dispatch gate uses). Decisions are the ones the component
 * lists, then the ones the `source` edges of the tasks under the path point
 * at; a dropped decision is not listed, and an id the graph does not have is
 * listed as such. Open work is a task that is approved or doing.
 */
export function graphFacts(nodes: ReadonlyMap<string, GraphNode>, repoPath: string, listed: readonly string[]): GraphFacts {
  const under = [...nodes.values()]
    .filter(node => node.type === 'task' && COUNTED_TASK.has(node.status) && (node.writeScope ?? []).length > 0 && within(node.writeScope ?? [], repoPath))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
  const ids = [...listed]
  for (const task of under) {
    for (const edge of task.edges ?? []) {
      if (edge.type === 'source' && nodes.get(edge.to)?.type === 'decision' && !ids.includes(edge.to)) ids.push(edge.to)
    }
  }
  const decisions: Listed[] = []
  for (const id of ids) {
    const node = nodes.get(id)
    if (node === undefined) decisions.push({ id, line: `${id} (not in the graph)` })
    else if (node.status !== 'dropped') decisions.push({ id, line: decisionLine(node) })
  }
  const work = under
    .filter(node => LIVE_TASK.has(node.status))
    .map((node): Listed => ({ id: node.id, line: `${node.id} "${clip(oneLine(node.title), TITLE_MAX)}" (${node.status})` }))
  return { decisions, work }
}

/** What one reminder is made of; every list holds what is new to the session already. */
export interface NoticeParts {
  /** The repository-relative path the agent touched. */
  readonly path: string
  /** The component's directory, repository-relative, when the path has one. */
  readonly component?: string
  /** The component's `AGENTS.md` text, when the host did not deliver it to the session. */
  readonly body?: string
  readonly decisions: readonly string[]
  readonly decisionsMore: number
  readonly work: readonly string[]
  readonly workMore: number
  /** The lessons for the path, one line each. */
  readonly lessons: readonly string[]
  /** Ask the agent to keep the component's document true (after a write or an edit). */
  readonly keepTrue: boolean
}

/** The list as one line of `; `-separated items, with `(+N more)` for what was left out. */
const listLine = (label: string, items: readonly string[], more: number): string | undefined =>
  items.length === 0 ? undefined : `${label}: ${items.join('; ')}${more > 0 ? ` (+${more} more)` : ''}`

/**
 * The reminder, in the words the model reads (English), or undefined when
 * there is nothing to say. The body is cut so that the whole stays within
 * `NOTICE_MAX`; the other lines are short by their own limits.
 */
export function pathNotice(parts: NoticeParts): string | undefined {  const where = parts.component === undefined ? '' : ` (component ${parts.component})`
  const rest = [
    listLine('Decisions on this path (project graph)', parts.decisions, parts.decisionsMore),
    listLine('Open work on this path', parts.work, parts.workMore),
    listLine('Lessons for this path (advice, not rules)', parts.lessons, 0),
    parts.keepTrue && parts.component !== undefined ? `Keep the component doc true: if your change alters what ${parts.component}/AGENTS.md says, update it in the same commit.` : undefined,
  ].filter((line): line is string => line !== undefined)
  if (rest.length === 0 && parts.body === undefined) return undefined
  const head = `Docs and lessons at hand for ${parts.path}${where}:`
  const cut = parts.component === undefined ? '' : `\n(truncated; Read ${parts.component}/AGENTS.md for the rest)`
  // The tags, the newlines between the parts and the line that names the file are counted with the other lines.
  const overhead = [head, ...rest].join('\n').length + (parts.component === undefined ? 0 : `\n${parts.component}/AGENTS.md:\n`.length) + cut.length + 64
  const room = Math.max(0, Math.min(BODY_MAX, NOTICE_MAX - overhead))
  const body = parts.body === undefined || parts.component === undefined
    ? []
    : [`${parts.component}/AGENTS.md:`, parts.body.length <= room ? parts.body.trimEnd() : `${parts.body.slice(0, room).trimEnd()}${cut}`]
  return wrapSystemReminder([head, ...body, ...rest].join('\n'))
}

// ---- the docs gaps of a handback (docs-at-hand design 0.3 §6) ----

/**
 * The components a handback's change touched whose `AGENTS.md` the change did
 * not: for every changed file (added, modified, deleted; a rename arrives as
 * a delete and an add, `--no-renames`) the nearest component `componentAt`
 * names, the component's own `AGENTS.md` excepted. A file with no component,
 * and a project with no component documents at all, leaves no gap. Pure; the
 * caller decides which components exist — for the handback it is the head
 * commit's tree, not the worktree (§6.1).
 */
export function docsGaps(paths: readonly string[], componentAt: (file: string) => string | undefined): readonly string[] {
  const touched = new Set<string>()
  const candidates: string[] = []
  for (const file of paths) {
    const component = componentAt(file)
    if (component === undefined) continue
    if (file === `${component}/AGENTS.md`) touched.add(component)
    else if (!candidates.includes(component)) candidates.push(component)
  }
  return candidates.filter(component => !touched.has(component))
}

/** Whether `text` names the component path, bounded by characters that cannot extend a path segment. */
function mentions(text: string | undefined, component: string): boolean {
  if (text === undefined) return false
  const escaped = component.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^A-Za-z0-9-])${escaped}(?![A-Za-z0-9-])`).test(text)
}

/**
 * The `Docs:` lines of one handback (§6.2), without the prefix the summary
 * comment renders them with: the worker's own `docs` line verbatim, then one
 * sentence per gap the worker's line does not name — or, when the gaps could
 * not be computed (`gaps` undefined), the one line that says so with the
 * reason. Nothing to say leaves no line.
 */
export function docsLines(gaps: readonly string[] | undefined, docs: string | undefined, whyNot: string | undefined): readonly string[] {
  const lines: string[] = []
  if (docs !== undefined) lines.push(docs)
  if (gaps === undefined) {
    if (whyNot !== undefined) lines.push(`文档缺口没算成：${whyNot}`)
    return lines
  }
  for (const component of gaps) {
    if (!mentions(docs, component)) lines.push(`${component} changed code but its AGENTS.md was not touched and the handback says nothing about it.`)
  }
  return lines
}
