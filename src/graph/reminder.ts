/**
 * Step projection (docs/ORCHESTRATION.md §2.5): an agent that set a focus
 * node with graph_focus gets, at the end of a step's input, a short
 * <system-reminder> with the focus node, its path to the goal, children,
 * sources, dependencies both ways, stage and open gates. It follows the
 * injection conventions (docs/DESIGN.md §6): an `agent/pre-step` notice
 * built with createUserNotice, never the system prompt.
 *
 * Everything is re-derived from the request-visible history on every step,
 * so resume and compaction see what the model sees. The focus is the
 * latest successful graph_focus call or projection notice. A notice is
 * added only when the history does not already show the current
 * projection: none for this focus yet, a different digest than the latest
 * notice recorded, a compaction checkpoint the latest notice was not
 * anchored to (re-anchoring), or a goal round message in the step's input
 * (one beat of the goal driver). Compaction removes the call and the
 * notices from the visible history, so the focus is also kept in memory
 * per session; a process restart between a compaction and the next step
 * loses it until graph_focus is called again. The re-anchoring notice also
 * carries the goal's non-goals and the rules denied in this session
 * (reanchor.ts); they stay out of the digest, so no other step carries them.
 */
import { createUserNotice, type AgentLike, type DerivedMessage, type UserNotice } from '../shared/dsh-min.ts'
import { installStepNotice, toolCallArguments, toolCallOutcomes } from '../shared/step-notice.ts'
import { wrapSystemReminder } from '../shared/zcode-notice.ts'
import { changeReason, digestOf, isGoalRound, noticeHistory, type DigestFacts } from './digest-notice.ts'
import { projectNode, type NodeRef, type Projection } from './projection.ts'
import { reanchorLines, sessionDenials } from './reanchor.ts'
import { FOCUS_TOOL } from './live.ts'
import { readGraph, type GraphRead } from './row-health.ts'
import type { FocusMemory } from './tools.ts'

export { CHECKPOINT_SOURCE, GOAL_ROUND_SOURCE } from './digest-notice.ts'

/** Source kind of the persisted projection notice. */
export const PROJECTION_SOURCE = 'glm-graph-projection'

const PROJECTION_REASONS = ['compaction', 'goal-round', 'focus', 'changed'] as const
/** Why a notice was added: the first rule of changeReason (digest-notice.ts) that applied. */
type ProjectionReason = typeof PROJECTION_REASONS[number]

/** Facts persisted in the notice source; later steps re-derive what the model was shown from them. */
interface ProjectionFacts extends DigestFacts {
  readonly focus: string
  readonly reason: ProjectionReason
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function noticeFacts(value: unknown): ProjectionFacts | undefined {
  if (!isRecord(value)) return undefined
  const { focus, digest, anchor, reason } = value
  if (typeof focus !== 'string' || typeof digest !== 'string' || !PROJECTION_REASONS.includes(reason as ProjectionReason)) return undefined
  if (anchor !== undefined && typeof anchor !== 'string') return undefined
  return { focus, digest, ...(anchor === undefined ? {} : { anchor }), reason: reason as ProjectionReason }
}

/** The node id of the last answered, successful graph_focus call in an assistant message. */
function focusCall(message: DerivedMessage, answered: ReadonlySet<string>, failed: ReadonlySet<string>): string | undefined {
  const blocks = message.content ?? []
  for (let position = blocks.length - 1; position >= 0; position--) {
    const block = blocks[position]
    if (block.type !== 'tool-call' || block.name !== FOCUS_TOOL || typeof block.id !== 'string') continue
    if (!answered.has(block.id) || failed.has(block.id)) continue
    const id = toolCallArguments(block)?.id
    if (typeof id === 'string') return id
  }
  return undefined
}

/**
 * The focus the request-visible history shows: the latest successful
 * graph_focus call or projection notice, whichever is later; undefined when
 * a compaction removed both. The step projection and the graph row's
 * `focusOf` (src/graph/service.ts) read it the same way, so a reader that
 * judges by the focus sees the focus the model sees.
 */
export function focusFromHistory(history: readonly DerivedMessage[]): string | undefined {
  const { answered, failed } = toolCallOutcomes(history)
  for (let index = history.length - 1; index >= 0; index--) {
    const message = history[index]
    if (message.role === 'user' && message.source?.kind === PROJECTION_SOURCE) {
      const facts = noticeFacts(message.source.graphProjection)
      if (facts !== undefined) return facts.focus
      continue
    }
    if (message.role !== 'assistant') continue
    const focus = focusCall(message, answered, failed)
    if (focus !== undefined) return focus
  }
  return undefined
}

type Ref = Pick<NodeRef, 'id' | 'type' | 'title' | 'status' | 'verification' | 'decision'>

function refLine(ref: Ref): string {
  const state = [ref.status, ...(ref.verification === undefined ? [] : [ref.verification]), ...(ref.decision === undefined ? [] : [`decided ${ref.decision}`])]
  return `${ref.type} ${ref.id} [${state.join(', ')}] ${ref.title}`
}

/**
 * The reminder body for one projection. Revisions and history stay out, so
 * a comment or a write elsewhere in the graph does not change it.
 * @param errors - validation errors of the graph.
 */
function renderProjection(projection: Projection, errors: number): string {
  const lines = [
    'Project graph: projection of your focus node. graph_show gives every field and the revs a change needs; change the graph only through the graph tools.',
    `Focus: ${refLine(projection.node)}`,
  ]
  const list = (title: string, entries: readonly string[]): void => {
    if (entries.length > 0) lines.push(`${title}:`, ...entries.map(entry => `- ${entry}`))
  }
  list('Acceptance', projection.node.acceptance ?? [])
  list('Path to the goal, parent first', projection.ancestors.map(refLine))
  if (projection.stage !== null) lines.push(`Stage: ${projection.stage}`)
  list('Children', projection.children.map(refLine))
  list('Exists because of', projection.sources.map(refLine))
  list('Depends on', projection.dependsOn.map(refLine))
  list('Needed by', projection.dependents.map(refLine))
  // User graph (design 0.4.1 §3.7, §5.4): these lists are empty on the development graph's nodes, so their reminders stay as they were.
  list('Serves the steps', (projection.serves ?? []).map(refLine))
  list('Served by', (projection.servedBy ?? []).map(refLine))
  list(projection.node.type === 'flow' ? 'Starts at' : 'Next steps', (projection.next ?? []).map(edge => `${refLine(edge.to)}${edge.when === undefined ? '' : ` (when: ${edge.when})`}`))
  list('Previous steps', (projection.previous ?? []).map(refLine))
  list('Open gates', projection.gates.map(gate => `${gate.kind}: ${gate.message} (${gate.ids.join(', ')})`))
  if (errors > 0) lines.push(`The graph has ${errors} validation error(s): every write is refused until the node files are fixed; tell the human.`)
  return lines.join('\n')
}

/** The reminder body for the focus with the projection it renders, or the problem that keeps it from being projected. */
function reminderBody(read: GraphRead, focus: string): { readonly body: string, readonly projection?: Projection } {
  if ('failure' in read) return { body: `Project graph: your focus node ${focus} cannot be read: ${read.failure.error.message} (${read.failure.error.hint}).` }
  const result = projectNode(read.graph, focus)
  if (!result.ok) return { body: `Project graph: your focus node ${focus} is not in the graph at ${read.dir}. graph_open lists the open nodes; ${FOCUS_TOOL} moves the focus.` }
  return { body: renderProjection(result.projection, read.graph.issues.filter(issue => issue.severity === 'error').length), projection: result.projection }
}

/** Where a re-anchoring reads the session's denials, and whom it tells how the read came out. */
export interface ReanchorSource {
  /** The violation journal of the project a working directory belongs to; undefined without a project directory. */
  readonly journal: (cwd: string | undefined) => string | undefined
  /** Told after every re-anchoring: undefined when the journal was read, else why the denials were left out. */
  readonly told: (sessionId: string, problem: string | undefined) => void
}

interface ProjectionInput {
  /** The request-visible history (`session.deriveMessages()`). */
  readonly history: readonly DerivedMessage[]
  /** The messages the step admits. */
  readonly admitted: readonly unknown[]
  readonly sessionId: string
  /** The session working directory a relative graph dir resolves against. */
  readonly cwd: string | undefined
  /** The configured graph dir. */
  readonly dir: string
  readonly focuses: FocusMemory
  /** Told what the read of the graph found, for the row health. */
  readonly onRead: (read: GraphRead, focus: string) => void
  readonly reanchor: ReanchorSource
}

/** The notice this step needs, or undefined; keeps the focus it used in `focuses`. */
async function projectionNotice(input: ProjectionInput): Promise<UserNotice | undefined> {
  const state = noticeHistory(input.history, PROJECTION_SOURCE, source => noticeFacts(source.graphProjection))
  const focus = focusFromHistory(input.history) ?? input.focuses.get(input.sessionId)
  if (focus === undefined) return undefined
  input.focuses.set(input.sessionId, focus)
  const read = await readGraph(input.dir, input.cwd)
  input.onRead(read, focus)
  const { body, projection } = reminderBody(read, focus)
  const digest = digestOf(body)
  const reason = changeReason(state, { digest, goalRound: input.admitted.some(isGoalRound), sameSubject: notice => notice.focus === focus }, 'focus')
  if (reason === undefined) return undefined
  const anchor = state.checkpoint?.id
  const facts: ProjectionFacts = { focus, digest, ...(anchor === undefined ? {} : { anchor }), reason }
  // Only the re-anchoring carries the extra lines; the digest stays the projection's, so the next step adds nothing.
  const extra = reason === 'compaction' ? await reanchorExtra(input, projection) : []
  const text = extra.length === 0 ? body : [body, ...extra].join('\n')
  return createUserNotice(PROJECTION_SOURCE, `project graph projection of ${focus} (${reason})`, wrapSystemReminder(text), { graphProjection: facts })
}

/** The re-anchoring's lines; the journal's read is told to the row health, and a failed read only leaves the denials out. */
async function reanchorExtra(input: ProjectionInput, projection: Projection | undefined): Promise<string[]> {
  const denials = await sessionDenials(input.reanchor.journal(input.cwd), input.sessionId)
  input.reanchor.told(input.sessionId, 'problem' in denials ? denials.problem : undefined)
  return reanchorLines(projection, denials)
}

/**
 * Install the step projection on one agent through the shared step notice
 * seam (src/shared/step-notice.ts), on every route: a step that needs
 * the notice gets it after its admitted messages. A failure while reading
 * the graph warns and leaves the step as it was. `onRead` hears what each
 * read of the graph found (the row health); `reanchor` is where a
 * re-anchoring reads the session's denials. Returns undefined, installing
 * nothing, when the agent has no session history.
 */
export function installProjection(agent: AgentLike, dir: string, focuses: FocusMemory, onRead: (sessionId: string, read: GraphRead, focus: string) => void, reanchor: ReanchorSource): (() => void) | undefined {
  return installStepNotice(agent, 'step projection', () => true, async (history, { admitted, session }) => {
    try {
      return await projectionNotice({ history, admitted, sessionId: session.id, cwd: session.header.cwd, dir, focuses, onRead: (read, focus) => { onRead(session.id, read, focus) }, reanchor })
    }
    catch (error) {
      console.warn(`dsh-glm-hourness/graph: step projection skipped for agent ${agent.id}: ${error instanceof Error ? error.message : String(error)}`)
      return undefined
    }
  }, 'graph')
}
