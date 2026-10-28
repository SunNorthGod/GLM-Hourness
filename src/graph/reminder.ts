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
 * loses it until graph_focus is called again.
 */
import { createHash } from 'node:crypto'
import { installStepNotice, toolCallArguments, toolCallOutcomes } from '../glm-prompt/step-notice.ts'
import { createUserNotice, type AgentLike, type DerivedMessage, type UserNotice } from '../shared/dsh-min.ts'
import { wrapSystemReminder } from '../toolsearch/zcode-text.ts'
import { projectNode, type NodeRef, type Projection } from './projection.ts'
import { loadGraph } from './store.ts'
import { FOCUS_TOOL, locateGraph, type FocusMemory } from './tools.ts'

/** Source kind of the persisted projection notice. */
export const PROJECTION_SOURCE = 'glm-graph-projection'

/**
 * Source kind of the user message a compaction puts in place of the range
 * it summarized; the source also carries the string `compactionId`
 * (compaction:109, compaction:116–122; compaction-basic:595–598).
 */
export const CHECKPOINT_SOURCE = 'compact-checkpoint'

/** Source kind of a goal round message, queued with agent.followup and admitted by the next step (goal-round-driver:144–151, 164). */
export const GOAL_ROUND_SOURCE = 'goal'

const PROJECTION_REASONS = ['compaction', 'goal-round', 'focus', 'changed'] as const
/** Why a notice was added: the first rule of projectionReason that applied. */
type ProjectionReason = typeof PROJECTION_REASONS[number]

/** Facts persisted in the notice source; later steps re-derive what the model was shown from them. */
interface ProjectionFacts {
  readonly focus: string
  /** First 12 hex digits of the SHA-256 of the reminder body. */
  readonly digest: string
  /** compactionId of the latest checkpoint visible when the notice was added. */
  readonly anchor?: string
  readonly reason: ProjectionReason
}

/** What the request-visible history shows about the step projection. */
interface ProjectionHistory {
  /** The latest focus: a successful graph_focus call or a projection notice, whichever is later. */
  readonly focus?: string
  readonly notice?: ProjectionFacts & { readonly index: number }
  readonly checkpoint?: { readonly index: number, readonly id?: string }
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

function projectionHistory(history: readonly DerivedMessage[]): ProjectionHistory {
  const { answered, failed } = toolCallOutcomes(history)
  let focus: string | undefined
  let notice: ProjectionHistory['notice']
  let checkpoint: ProjectionHistory['checkpoint']
  for (let index = history.length - 1; index >= 0; index--) {
    if (focus !== undefined && notice !== undefined && checkpoint !== undefined) break
    const message = history[index]
    const kind = message.source?.kind
    if (kind === CHECKPOINT_SOURCE) {
      const id = message.source?.compactionId
      checkpoint ??= typeof id === 'string' ? { index, id } : { index }
      continue
    }
    if (message.role === 'user' && kind === PROJECTION_SOURCE) {
      const facts = noticeFacts(message.source?.graphProjection)
      if (facts === undefined) continue
      notice ??= { ...facts, index }
      focus ??= facts.focus
      continue
    }
    if (focus === undefined && message.role === 'assistant') focus = focusCall(message, answered, failed)
  }
  return {
    ...(focus === undefined ? {} : { focus }),
    ...(notice === undefined ? {} : { notice }),
    ...(checkpoint === undefined ? {} : { checkpoint }),
  }
}

/** Why this step needs a notice, or undefined when the history already shows the current projection. */
function projectionReason(state: ProjectionHistory, focus: string, digest: string, goalRound: boolean): ProjectionReason | undefined {
  const { notice, checkpoint } = state
  if (checkpoint !== undefined && (notice === undefined || notice.index < checkpoint.index || notice.anchor !== checkpoint.id)) return 'compaction'
  if (goalRound) return 'goal-round'
  if (notice === undefined || notice.focus !== focus) return 'focus'
  if (notice.digest !== digest) return 'changed'
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
  list('Open gates', projection.gates.map(gate => `${gate.kind}: ${gate.message} (${gate.ids.join(', ')})`))
  if (errors > 0) lines.push(`The graph has ${errors} validation error(s): every write is refused until the node files are fixed; tell the human.`)
  return lines.join('\n')
}

/** The reminder body for the focus, or the problem that keeps it from being projected. */
async function reminderBody(configured: string, cwd: string | undefined, focus: string): Promise<string> {
  const located = await locateGraph(configured, cwd)
  if (typeof located !== 'string') return `Project graph: your focus node ${focus} cannot be read: ${located.error.message} (${located.error.hint}).`
  const graph = await loadGraph(located)
  const result = projectNode(graph, focus)
  if (!result.ok) return `Project graph: your focus node ${focus} is not in the graph at ${located}. graph_open lists the open nodes; ${FOCUS_TOOL} moves the focus.`
  return renderProjection(result.projection, graph.issues.filter(issue => issue.severity === 'error').length)
}

function isGoalRound(message: unknown): boolean {
  return isRecord(message) && isRecord(message.source) && message.source.kind === GOAL_ROUND_SOURCE
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
}

/** The notice this step needs, or undefined; keeps the focus it used in `focuses`. */
async function projectionNotice(input: ProjectionInput): Promise<UserNotice | undefined> {
  const state = projectionHistory(input.history)
  const focus = state.focus ?? input.focuses.get(input.sessionId)
  if (focus === undefined) return undefined
  input.focuses.set(input.sessionId, focus)
  const body = await reminderBody(input.dir, input.cwd, focus)
  const digest = createHash('sha256').update(body).digest('hex').slice(0, 12)
  const reason = projectionReason(state, focus, digest, input.admitted.some(isGoalRound))
  if (reason === undefined) return undefined
  const anchor = state.checkpoint?.id
  const facts: ProjectionFacts = { focus, digest, ...(anchor === undefined ? {} : { anchor }), reason }
  return createUserNotice(PROJECTION_SOURCE, `project graph projection of ${focus} (${reason})`, wrapSystemReminder(body), { graphProjection: facts })
}

/**
 * Install the step projection on one agent through the shared step notice
 * seam (src/glm-prompt/step-notice.ts), on every route: a step that needs
 * the notice gets it after its admitted messages. A failure while reading
 * the graph warns and leaves the step as it was. Returns undefined,
 * installing nothing, when the agent has no session history.
 */
export function installProjection(agent: AgentLike, dir: string, focuses: FocusMemory): (() => void) | undefined {
  return installStepNotice(agent, 'step projection', () => true, async (history, { admitted, session }) => {
    try {
      return await projectionNotice({ history, admitted, sessionId: session.id, cwd: session.header.cwd, dir, focuses })
    }
    catch (error) {
      console.warn(`dsh-glm-hourness/graph: step projection skipped for agent ${agent.id}: ${error instanceof Error ? error.message : String(error)}`)
      return undefined
    }
  }, 'graph')
}
