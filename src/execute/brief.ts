/**
 * The dispatch gate and the worker brief (M7 design 0.6 §3.5.1, §3.5.2,
 * §3.7.5, §6.4). Pure functions over a loaded graph and a context of facts
 * the caller read: the running dispatches, the free slots, the release state
 * (`releaseOf`, §2.4), the cap the rules board gives GLM subagents in a peak.
 *
 * `briefGate` checks `dispatch_task`'s arguments and the node in table order
 * and returns the first refusal. It reads `ctx.release`, never a derived
 * stage: a module not released stops the work under it while its neighbours
 * go on. What it names is one of five subjects: a write task, a review task,
 * a module's design-review task, a module (whose design-review task the
 * harness proposes and dispatches), the goal (the review of the whole goal).
 * Rows that need the handback state of the reviewed task or the parsed
 * output schema take them from the context, because those come from the
 * handback and schema code of later steps; this file invents neither.
 */
import { MODULE_READERS, directionsOf, goalLayer, isDesignReview, isPostRelease, scopedTasks, sentBack, type ModuleReaders, type ReleaseResult } from '../graph/execute-stage.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import { ancestorsOf, childrenIndex, subtreeOf, waitsForHuman } from '../graph/projection.ts'
import { ID_PATTERN, type GraphNode } from '../graph/schema.ts'
import { effectiveStage, goalOf } from '../graph/stage.ts'
import { stepsServedBy } from '../graph/user-graph.ts'
import { isGlmModel } from '../shared/route.ts'
import { runningGlm, runningOn, runningWorkers, type Attempt } from './attempts.ts'
import { digest12 } from './digest.ts'
import { catalogHint, oneLine, parseModelArgs, type CatalogEntry, type ModelArgs } from './models.ts'
import { overlaps } from './scope.ts'

// ---- arguments ----

const DISPATCH_LIMITS = { reason: 300, context: 4000, quickScope: 2 } as const

type ReviewDepth = 'full' | 'light' | 'skip'

/** The arguments of `dispatch_task` after their shape was checked (§3.1.1). */
interface DispatchArgs extends ModelArgs {
  readonly id: string
  /** The review depth declared for a write task. */
  readonly review?: { readonly depth: ReviewDepth, readonly why?: string }
  /** The depth of one review round; review tasks only. */
  readonly depth?: 'full' | 'light'
  readonly depthWhy?: string
  readonly context?: string
  readonly quick?: boolean
}

export type DispatchArgsResult =
  | { readonly ok: true, readonly args: DispatchArgs }
  | { readonly ok: false, readonly message: string }

const ARGUMENT_NAMES: ReadonlySet<string> = new Set(['id', 'model', 'why', 'provider', 'reasoningEffort', 'review', 'depth', 'depthWhy', 'context', 'quick'])

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** A reason of 1–300 characters once its whitespace is one line; undefined when it is not. */
function reasonOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const line = oneLine(value)
  return line.length > 0 && line.length <= DISPATCH_LIMITS.reason ? line : undefined
}

function parseReview(value: unknown): DispatchArgs['review'] | string {
  if (!isRecord(value) || Object.keys(value).some(key => key !== 'depth' && key !== 'why')) return 'review must be {depth, why?}'
  const { depth, why } = value
  if (depth !== 'full' && depth !== 'light' && depth !== 'skip') return 'review.depth must be full, light or skip'
  const reason = why === undefined ? undefined : reasonOf(why)
  if (why !== undefined && reason === undefined) return `review.why must be one line of 1-${DISPATCH_LIMITS.reason} characters`
  if (depth !== 'full' && reason === undefined) return `review.why is required when the depth is ${depth}: 1-${DISPATCH_LIMITS.reason} characters saying why`
  return { depth, ...(reason === undefined ? {} : { why: reason }) }
}

/**
 * Shape check of the call (§6.4): known names only, `id` a node id, the model
 * arguments, `review` as `{depth, why?}` with a reason when the depth is
 * `light` or `skip`, `depth` full or light, `depthWhy` and `context` within
 * their limits, `quick` a boolean. Whether the arguments fit the kind of node
 * is `briefGate`'s next row.
 */
export function parseDispatchArgs(raw: unknown): DispatchArgsResult {
  if (!isRecord(raw)) return { ok: false, message: 'the arguments must be an object' }
  const extra = Object.keys(raw).filter(key => !ARGUMENT_NAMES.has(key))
  if (extra.length > 0) return { ok: false, message: `unknown argument${extra.length > 1 ? 's' : ''}: ${extra.join(', ')}` }
  if (typeof raw.id !== 'string' || !ID_PATTERN.test(raw.id)) return { ok: false, message: 'id must be a node id' }
  const model = parseModelArgs(raw)
  if (!model.ok) return model
  const review = raw.review === undefined ? undefined : parseReview(raw.review)
  if (typeof review === 'string') return { ok: false, message: review }
  if (raw.depth !== undefined && raw.depth !== 'full' && raw.depth !== 'light') return { ok: false, message: 'depth must be full or light' }
  const depthWhy = raw.depthWhy === undefined ? undefined : reasonOf(raw.depthWhy)
  if (raw.depthWhy !== undefined && depthWhy === undefined) return { ok: false, message: `depthWhy must be one line of 1-${DISPATCH_LIMITS.reason} characters` }
  if (raw.depthWhy !== undefined && raw.depth === undefined) return { ok: false, message: 'depthWhy goes with depth' }
  if (raw.context !== undefined && (typeof raw.context !== 'string' || raw.context.length > DISPATCH_LIMITS.context)) return { ok: false, message: `context must be a string of at most ${DISPATCH_LIMITS.context} characters` }
  if (raw.quick !== undefined && typeof raw.quick !== 'boolean') return { ok: false, message: 'quick must be true or false' }
  return {
    ok: true,
    args: {
      ...model.args,
      id: raw.id,
      ...(review === undefined ? {} : { review }),
      ...(raw.depth === undefined ? {} : { depth: raw.depth }),
      ...(depthWhy === undefined ? {} : { depthWhy }),
      ...(raw.context === undefined ? {} : { context: raw.context }),
      ...(raw.quick === undefined ? {} : { quick: raw.quick }),
    },
  }
}

// ---- the gate ----

type RefusalCode =
  | 'invalid' | 'bad_task' | 'not_released' | 'bad_attributes' | 'no_acceptance' | 'deps_open' | 'waiting_human'
  | 'busy' | 'scope_busy' | 'slots_full' | 'bad_schema' | 'nothing_to_review' | 'no_directions'

interface Refusal {
  readonly ok: false
  readonly code: RefusalCode
  readonly message: string
  readonly hint: string
  /** The GLM peak cap refused the call: the cap and the GLM subagents running (§3.16 `execute.peak-cap`). */
  readonly peakCap?: { readonly cap: number, readonly running: number }
}

/** What a `dispatch_task` call names. */
type Subject = 'write' | 'review' | 'design-review' | 'module' | 'goal'

export type GateResult =
  | { readonly ok: true, readonly args: DispatchArgs, readonly subject: Subject }
  | Refusal

/** The cap the rules board gives GLM subagents in a peak (`glmWorkerCap`, §3.1.2 step 3); the caller read it and formatted the end of the peak. */
interface GlmWorkerCap {
  readonly cap: number
  /** When the cap ends, as HH:MM. */
  readonly until?: string
}

export interface BriefContext {
  /** The arguments exactly as the call carried them. */
  readonly args: unknown
  /** The dispatches running now, any role. */
  readonly running: readonly Attempt[]
  /** The limit on running write tasks (the row setting, default 3). */
  readonly slots: number
  /** `releaseOf` of the node; for a module or a module's design-review task, of that task (the gate reads the goal layer itself, §3.7.5). */
  readonly release: ReleaseResult
  /** The execution line remembers this node as stopped although the graph does not say so yet (§3.7.3). */
  readonly stopped: boolean
  readonly glmWorkerCap?: GlmWorkerCap
  /** Whether the task's `outputSchema` resolves to an object schema inside the runtime's subset. Write tasks. */
  readonly outputSchemaOk: boolean
  /** The reviewed task's handback: whether a finished one exists and whether it has gone stale since. Review tasks. */
  readonly reviewTarget?: { readonly handedBack: boolean, readonly stale: boolean }
  /** The provider's catalog, for the model hint of an invalid call. */
  readonly catalog?: readonly CatalogEntry[]
  readonly readers?: ModuleReaders
  /** The goal already has an acceptance-review round at the current trunk commit (§3.9.4): its review is `busy`. Goals only. */
  readonly acceptedAtTrunk?: boolean
}

function refuse(code: RefusalCode, message: string, hint: string): Refusal {
  return { ok: false, code, message, hint }
}

function subjectOf(graph: LoadedGraph, node: GraphNode, readers: ModuleReaders): Subject | undefined {
  if (node.type === 'goal') return 'goal'
  if (node.type === 'task') {
    if (node.kind !== 'review') return 'write'
    return isDesignReview(graph, node, readers) ? 'design-review' : 'review'
  }
  if (node.type !== 'feature') return undefined
  try {
    return readers.moduleOf(graph, node)?.id === node.id ? 'module' : undefined
  }
  catch {
    return undefined
  }
}

/** Whether the arguments fit the kind of node; the message when they do not (§6.4). */
function misfit(subject: Subject, args: DispatchArgs, node: GraphNode): string | undefined {
  if (subject === 'write') {
    if (args.depth !== undefined || args.depthWhy !== undefined) return 'depth and depthWhy are for review tasks; a write task declares its review with review'
    const scope = node.writeScope ?? []
    if (args.quick === true && (scope.length > DISPATCH_LIMITS.quickScope || scope.some(entry => entry.endsWith('/')))) {
      return `quick needs a write scope of at most ${DISPATCH_LIMITS.quickScope} files and no directory; this task has ${scope.length === 0 ? 'none' : scope.join(', ')}`
    }
    return undefined
  }
  const fixed = subject === 'review' ? [] : ['depth', 'depthWhy']
  const given = [
    ...(args.review === undefined ? [] : ['review']),
    ...(args.quick === undefined ? [] : ['quick']),
    ...fixed.filter(name => (name === 'depth' ? args.depth : args.depthWhy) !== undefined),
  ]
  if (given.length === 0) return undefined
  const reason = subject === 'review' ? 'a review task takes depth and depthWhy only' : 'its review is always full'
  return `${given.join(', ')} not accepted here: ${reason}`
}

function releaseRefusal(graph: LoadedGraph, release: Exclude<ReleaseResult, { readonly ok: true }>): Refusal {
  if (release.reason === 'unreadable') {
    return refuse('not_released', 'The module structure could not be read.', 'The module structure could not be read; the harness refuses dispatch until it can.')
  }
  const node = graph.nodes.get(release.node)
  const back = node !== undefined && sentBack(node) ? ' It was sent back to design; wait for the person to release it again.' : ''
  const stage = release.stage ?? 'none'
  if (release.level === 'module') {
    return refuse('not_released', `Module ${release.node} is not released (stage ${stage}).`,
      `This module's design is not released: put its one-page release to the person with propose_to_human (kind release, module ${release.node}).${back}`)
  }
  return refuse('not_released', `Goal ${release.node} is not released (stage ${stage}).`,
    `The design is not released: put it to the person with propose_to_human (kind release).${back}`)
}

/** The goal-layer failure of a module's design review, or undefined when the goal is released; the module layer does not apply to it. */
function goalRefusal(graph: LoadedGraph, node: GraphNode, release: ReleaseResult): Refusal | undefined {
  if (!release.ok && release.level === 'goal') return releaseRefusal(graph, release)
  const goal = goalOf(graph, node.id)
  const layer = goal === undefined ? undefined : goalLayer(goal)
  return layer === undefined || layer.ok ? undefined : releaseRefusal(graph, layer)
}

/** Open questions the person owes an answer on in the subtree, and the subtree's unresolved stop marks (§3.7.3, §3.5.1). */
function waitingOn(graph: LoadedGraph, node: GraphNode): { readonly questions: string[], readonly stops: string[] } {
  const subtree = subtreeOf(childrenIndex(graph), node)
  const humanTimes = subtree.flatMap(entry => entry.history.filter(item => item.actor === 'human' || item.relay !== undefined).map(item => Date.parse(item.at)))
  const stops = subtree.filter(entry => entry.history.some(item => {
    const marked = item.op === 'comment' && item.text !== undefined && /·\s*停下\s*$/.test(item.text)
    return marked && !humanTimes.some(time => time > Date.parse(item.at))
  }))
  return { questions: subtree.filter(waitsForHuman).map(entry => entry.id), stops: stops.map(entry => entry.id) }
}

/** Design decisions directly under the module that still count. */
function designDecisions(graph: LoadedGraph, module: GraphNode): GraphNode[] {
  return [...graph.nodes.values()].filter(entry => entry.parent === module.id && entry.type === 'decision' && entry.status !== 'dropped' && entry.status !== 'superseded')
}

/** The review-specific row of a module's design review (§3.5.1, last row; §3.7.5 failures). */
function designReviewRefusal(graph: LoadedGraph, node: GraphNode, subject: 'module' | 'design-review', readers: ModuleReaders): Refusal | undefined {
  const module = subject === 'module' ? node : readers.moduleOf(graph, node)
  if (module === undefined) return refuse('nothing_to_review', `Task ${node.id} is under no module.`, 'A module design review is dispatched with the module id.')
  const sources: (GraphNode | undefined)[] = subject === 'module'
    ? designDecisions(graph, module)
    : (node.edges ?? []).filter(edge => edge.type === 'source').map(edge => graph.nodes.get(edge.to))
  const gone = sources.some(entry => entry === undefined || entry.status === 'dropped' || entry.status === 'superseded')
  const stage = effectiveStage(module)
  if (sources.length === 0 || gone) {
    return refuse('nothing_to_review', `Module ${module.id} has no design decision to review.`, 'Write the module\'s design as decisions under the module (with propose), then dispatch the review.')
  }
  if (stage === null || isPostRelease(stage)) {
    return refuse('nothing_to_review', `Module ${module.id} is released (stage ${stage ?? 'none'}); its design is no longer under review.`, 'The person has seen this module\'s one-page release. A review is dispatched again only after the module was sent back to design.')
  }
  if (directionsOf(graph) === undefined) {
    return refuse('no_directions', 'The goal has no direction list.', 'The goal has no direction list (norm-directions); the big loop writes it before any module design is reviewed.')
  }
  return undefined
}

function describeRunning(attempts: readonly Attempt[]): string {
  return attempts.length === 0 ? 'none' : attempts.map(attempt => `${attempt.node} (${attempt.childId}, ${attempt.model})`).join('; ')
}

/**
 * `dispatch_task`'s gate, rows in the order of §3.5.1, the first that does not
 * hold refuses. Returns the parsed arguments and the subject on success so
 * the caller parses once.
 */
export function briefGate(graph: LoadedGraph, node: GraphNode, ctx: BriefContext): GateResult {
  const readers = ctx.readers ?? MODULE_READERS
  const parsed = parseDispatchArgs(ctx.args)
  if (!parsed.ok) return refuse('invalid', parsed.message, `Fix the call and send it again. ${catalogHint(ctx.catalog)}`)
  const { args } = parsed
  // An unreadable module structure refuses everything first: the node cannot even be classified with readers that fail (R5-F3).
  if (!ctx.release.ok && ctx.release.reason === 'unreadable') return releaseRefusal(graph, ctx.release)
  const subject = subjectOf(graph, node, readers)
  if (subject === undefined) return refuse('bad_task', `Node ${node.id} (${node.type}) cannot be dispatched.`, 'dispatch_task takes a task, a module of a split goal (for its design review) or a goal (for its acceptance review).')
  const wrong = misfit(subject, args, node)
  if (wrong !== undefined) return refuse('invalid', wrong, 'Remove the argument or change the call to fit the node.')

  // bad_task: approved or doing; a module's design-review task is also taken as a proposal (M3 addendum §3.14.7).
  const allowed = subject === 'design-review' ? ['proposed', 'approved', 'doing'] : ['approved', 'doing']
  if (!allowed.includes(node.status)) {
    const hint = node.status === 'done' ? 'Reopen a finished task first.'
      : node.status === 'proposed' ? 'A proposal is approved when the person releases the design it belongs to.'
        : `Only ${allowed.join(' or ')} nodes are dispatched.`
    return refuse('bad_task', `Node ${node.id} is ${node.status}.`, hint)
  }

  // not_released: module and goal. A module's design review skips the module layer.
  const own = subject === 'module' || subject === 'design-review'
  const blocked = own ? goalRefusal(graph, node, ctx.release) : (ctx.release.ok ? undefined : releaseRefusal(graph, ctx.release))
  if (blocked !== undefined) return blocked

  if (subject === 'write') {
    if (node.kind === undefined || (node.writeScope ?? []).length === 0 || node.worktree === false) {
      return refuse('bad_attributes', `Task ${node.id} lacks dispatch attributes.`, 'Set kind and a non-empty writeScope with graph_edit; worktree must not be false.')
    }
  }
  if ((subject === 'write' || subject === 'goal') && (node.acceptance ?? []).length === 0) {
    return refuse('no_acceptance', `${node.id} has no acceptance criteria.`, 'Propose the task again with acceptance criteria; changing the acceptance of an existing task is the human\'s.')
  }
  if (subject === 'write') {
    const open = (node.edges ?? []).filter(edge => edge.type === 'depends' && graph.nodes.get(edge.to)?.status !== 'done').map(edge => edge.to)
    if (open.length > 0) return refuse('deps_open', `Task ${node.id} depends on unfinished work.`, `Unfinished: ${open.join(', ')}.`)
  }
  if (subject === 'write' || subject === 'review' || subject === 'design-review') {
    const waiting = waitingOn(graph, node)
    if (waiting.questions.length > 0 || waiting.stops.length > 0 || ctx.stopped) {
      const parts = [
        ...(waiting.questions.length > 0 ? [`open questions for the person: ${waiting.questions.join(', ')}`] : []),
        ...(waiting.stops.length > 0 ? [`stopped, no answer since: ${waiting.stops.join(', ')}`] : []),
        ...(ctx.stopped && waiting.stops.length === 0 ? ['stopped in this process'] : []),
      ]
      return refuse('waiting_human', `Task ${node.id} waits for the person.`, `${parts.join('; ')}; the person has not answered yet: put it to them in the chat with propose_to_human.`)
    }
  }

  const holders = subject === 'module'
    ? [...graph.nodes.values()].filter(entry => entry.parent === node.id && isDesignReview(graph, entry, readers)).flatMap(entry => runningOn(ctx.running, entry.id))
    : runningOn(ctx.running, node.id)
  if (holders.length > 0) return refuse('busy', `${node.id} already has a running dispatch.`, `Running: ${holders.map(attempt => attempt.childId).join(', ')}.`)
  if (subject === 'goal' && ctx.acceptedAtTrunk === true) {
    return refuse('busy', `Goal ${node.id} already has an acceptance review at the current trunk commit.`, 'Its round comment on the goal is the verdict; dispatch the acceptance review again after the trunk moves.')
  }

  if (subject === 'write') {
    const workers = runningWorkers(ctx.running)
    for (const worker of workers) {
      const theirs = graph.nodes.get(worker.node)?.writeScope ?? []
      if (overlaps(node.writeScope ?? [], theirs)) {
        return refuse('scope_busy', `Task ${node.id} writes where ${worker.node} is writing.`, `${worker.node} holds ${theirs.join(', ')}. Add a dependency with graph_link, or wait for it.`)
      }
    }
    if (workers.length >= ctx.slots) return refuse('slots_full', `All ${ctx.slots} write slots are in use.`, `Running write tasks: ${describeRunning(workers)}.`)
  }
  if (isGlmModel(args.model) && ctx.glmWorkerCap !== undefined) {
    const glm = runningGlm(ctx.running)
    const { cap, until } = ctx.glmWorkerCap
    if (glm.length >= cap) {
      const refusal = refuse('slots_full', `GLM peak, reduce: at most ${cap} GLM subagent${cap === 1 ? '' : 's'} at a time${until === undefined ? '' : ` until ${until}`}.`,
        `Running GLM subagents: ${describeRunning(glm)}. A non-GLM model is not limited.`)
      return { ...refusal, peakCap: { cap, running: glm.length } }
    }
  }
  if (subject === 'write' && !ctx.outputSchemaOk) return refuse('bad_schema', `The outputSchema of task ${node.id} does not resolve.`, 'Name a built-in schema or a JSON file in the repository that holds an object schema.')

  if (subject === 'review' && (ctx.reviewTarget === undefined || !ctx.reviewTarget.handedBack || ctx.reviewTarget.stale)) {
    return refuse('nothing_to_review', `Review task ${node.id} has no current finished handback to review.`, 'Dispatch the reviewed task first, or again if its handback went stale.')
  }
  if (subject === 'module' || subject === 'design-review') {
    const nothing = designReviewRefusal(graph, node, subject, readers)
    if (nothing !== undefined) return nothing
  }
  return { ok: true, args, subject }
}

// ---- the brief ----

export const BRIEF_LIMIT = 9000

/** What an earlier attempt left for this one: a line of outcome, and detail that is cut first when the brief is long. */
interface EarlierAttempt {
  readonly outcome: string
  readonly details: readonly string[]
}

export interface BriefInput {
  readonly graph: LoadedGraph
  readonly task: GraphNode
  readonly childId: string
  /** The main agent's agent id. */
  readonly parent: string
  readonly worktree: string
  readonly branch: string
  readonly base: { readonly branch: string, readonly sha: string }
  /** The main agent's `context` argument. */
  readonly context?: string
  readonly earlier: readonly EarlierAttempt[]
  /** An approved plan carried over from an earlier dispatch (§3.3.4), as `readPlanSection` gives it. */
  readonly plan?: { readonly version: number, readonly steps: string }
  /** The dispatch was `quick` and needs no plan. */
  readonly quick?: boolean
  /** Lessons that match the task, one line each; at most five are used. */
  readonly lessons?: readonly string[]
  /** The components the write scope touches (docs-at-hand design 0.3 §4.4), repository-relative, as the caller read them in the worktree. */
  readonly docs?: readonly string[]
  /** The rules board's lines for this session, when the rules row is on. */
  readonly rules?: readonly string[]
  /** The commands of `norm-merge-gate`. */
  readonly gateCommands: readonly string[]
}

type Truncation = 'docs' | 'lessons' | 'earlier' | 'context'

export interface Brief {
  readonly text: string
  /** 12 hex digits of the text before the footer. */
  readonly digest: string
  /** What was cut to fit `BRIEF_LIMIT`, in the order it was cut. */
  readonly truncated: readonly Truncation[]
}

const LESSON_LIMIT = 5

function decisionLine(node: GraphNode): string {
  const label = node.type === 'question' && node.decision !== undefined ? ` -> ${node.options?.find(option => option.key === node.decision)?.label ?? node.decision}` : ''
  return `${node.id} "${node.title}"${label}`
}

function sourcesOf(graph: LoadedGraph, task: GraphNode): GraphNode[] {
  return (task.edges ?? []).filter(edge => edge.type === 'source').flatMap(edge => {
    const target = graph.nodes.get(edge.to)
    return target === undefined ? [] : [target]
  })
}

/** The user steps the task serves, as `flow › step` (user graph design 0.4.1 §5.4): the live steps of its own serves edges, in edge order. */
function servedSteps(graph: LoadedGraph, task: GraphNode): string[] {
  return stepsServedBy(graph, task).map((step) => {
    const flow = step.parent === undefined ? undefined : graph.nodes.get(step.parent)
    return flow === undefined ? step.title : `${flow.title} › ${step.title}`
  })
}

function body(input: BriefInput, cut: ReadonlySet<Truncation>): string {
  const { graph, task } = input
  const chain = [...ancestorsOf(graph, task)].reverse().map(node => `"${node.title}"`)
  const sources = sourcesOf(graph, task).map(decisionLine)
  const steps = servedSteps(graph, task)
  const notIn = [...new Set([...(task.nonGoals ?? []), ...ancestorsOf(graph, task).flatMap(node => node.nonGoals ?? [])])]
  const lessons = (input.lessons ?? []).slice(0, LESSON_LIMIT)
  const lines: string[] = [
    `# Task ${task.id}: ${task.title}`,
    `You are a worker dispatched by the main agent (agent id "${input.parent}") for exactly one task of the project graph.`,
    '',
    '## Goal',
    `${task.title}. Why it exists: ${[...chain, 'this task'].join(' > ')}.`,
    `Decisions it follows: ${sources.length === 0 ? 'none recorded' : sources.join('; ')}.`,
    '',
    '## Context',
  ]
  if (input.context !== undefined && input.context.trim() !== '') lines.push(`- From the main agent: ${cut.has('context') ? '(truncated)' : input.context.trim()}`)
  lines.push(
    `- Workspace: your worktree "${input.worktree}" on branch "${input.branch}", created from "${input.base.branch}" at ${input.base.sha}. Paths below are relative to it.`,
    `- Project graph: read with graph_show / graph_open; graph_focus "${task.id}" first so the panel shows you on this task. You may only graph_comment.`,
  )
  if (steps.length > 0) lines.push(`- User steps this task serves (flow › step): ${steps.join('; ')}. This is how the user meets what you build.`)
  if (input.earlier.length > 0) {
    lines.push('- Earlier attempts:')
    for (const [index, attempt] of input.earlier.entries()) {
      lines.push(`  - attempt ${index + 1}: ${attempt.outcome}${cut.has('earlier') && attempt.details.length > 0 ? ' (details truncated)' : ''}`)
      if (!cut.has('earlier')) lines.push(...attempt.details.map(detail => `    ${detail}`))
    }
  }
  if (input.plan !== undefined) lines.push(`- Approved plan (version ${input.plan.version}):`, ...input.plan.steps.split('\n').map(line => `  ${line}`))
  if (lessons.length > 0) lines.push(cut.has('lessons') ? '- Lessons that match this task: (truncated)' : `- Lessons that match this task:\n${lessons.map(lesson => `  - ${lesson}`).join('\n')}`)
  const scope = task.writeScope ?? []
  lines.push(
    '',
    '## Constraints',
    `- Write only inside: ${scope.length === 0 ? 'nothing' : scope.join(', ')}. Writes elsewhere are refused.`,
    ...(cut.has('docs') ? [] : (input.docs ?? []).map(component => `- Component doc covering your scope: ${component}/AGENTS.md. Keep it true: update it in the same commits when your change alters what it says; otherwise say in the handback field "docs" why it still holds.`)),
    input.plan !== undefined
      ? `- Your plan (version ${input.plan.version}) is already approved: write inside it. To change it, submit a new version with submit_plan and wait for approval.`
      : input.quick ? '- Quick task: no plan needed.' : '- Before writing, submit a plan with submit_plan and wait for approval.',
    '- Questions that need the main agent: ask_main (state the assumption you will use if no answer comes). Do not end your turn to wait.',
    `- Commit on your branch; start every commit message with "${task.id}: ". Do not push, and do not touch other branches or worktrees; the main agent integrates your branch.`,
    '- Subagents you start may only read. Do not start or restart the DeepSeek Harness desktop app; desktop checks are batched (verify "L4-batch").',
    `- Not in scope: ${notIn.length === 0 ? 'nothing recorded' : notIn.join('; ')}`,
  )
  if (input.rules !== undefined && input.rules.length > 0) lines.push(`- Rules in effect: ${input.rules.join('; ')}`)
  lines.push('', '## Done when', ...(task.acceptance ?? []).map((item, index) => `${index + 1}. ${item}`))
  lines.push(
    input.gateCommands.length === 0
      ? '- Run the project checks in your worktree before handing back.'
      : `- Run the project checks in your worktree before handing back: ${input.gateCommands.join(' ; ')}.`,
    `- Hand back by calling structured_output once (status, summary of at most 2000 characters, commits, files, checks, questions, assumptions, lessons). Write long reports to ".hourness/${input.childId}.md" in your worktree and give the path in "report".`,
  )
  return lines.join('\n')
}

/**
 * The text a write worker starts from (§3.5.2), built only from the graph
 * and the facts of the dispatch: the model writes none of it. English, at most
 * 9000 characters; when it is longer, first the component-doc line, then the
 * lessons, then the details of earlier attempts, then the main agent's
 * context are cut, in that order, until it fits (docs-at-hand design 0.3
 * §4.4: the component-doc line yields before the lessons — the reminder at a
 * file names it again on the first write). The footer carries the digest of
 * everything above it and the graph revision it was written at.
 */
export function renderBrief(input: BriefInput): Brief {
  const cut = new Set<Truncation>()
  const present: Readonly<Record<Truncation, boolean>> = {
    docs: (input.docs ?? []).length > 0,
    lessons: (input.lessons ?? []).length > 0,
    earlier: input.earlier.some(attempt => attempt.details.length > 0),
    context: (input.context ?? '').trim() !== '',
  }
  let text = body(input, cut)
  for (const step of ['docs', 'lessons', 'earlier', 'context'] as const) {
    if (text.length <= BRIEF_LIMIT) break
    if (!present[step]) continue
    cut.add(step)
    text = body(input, cut)
  }
  const digest = digest12(text)
  return { text: `${text}\n\nbrief ${digest} · graph ${input.graph.revision}`, digest, truncated: [...cut] }
}

// ---- the design review's brief (§3.7.5) ----

const DECISION_TEXT_LIMIT = 400

export interface DesignReviewInput {
  readonly graph: LoadedGraph
  readonly childId: string
  /** The main agent's agent id. */
  readonly parent: string
  /** The review task; its module is read from the graph. */
  readonly task: GraphNode
}

/**
 * The brief of a module's design review (§3.7.5): the shape of §3.5.2, the
 * goal line naming the module, the context carrying the design decisions
 * under review with their reason text, the module's acceptance and non-goals,
 * the planning already under the module, and the direction list as numbered
 * `direction:<i>` items. The reviewer writes nothing but the report; the
 * blocking criteria gain `direction:<i>`, and `checked` must cover every
 * direction and every acceptance item.
 */
export function renderDesignReviewBrief(input: DesignReviewInput): Brief {
  const readers = MODULE_READERS
  const module = readers.moduleOf(input.graph, input.task)
  // The gate guarantees a module under every design review it passes; a miss is a bug, not a brief.
  if (module === undefined) throw new TypeError(`the review task ${input.task.id} is under no module`)
  const sources = (input.task.edges ?? []).filter(edge => edge.type === 'source').flatMap(edge => {
    const decision = input.graph.nodes.get(edge.to)
    return decision === undefined ? [] : [decision]
  })
  const directions = directionsOf(input.graph)?.acceptance ?? []
  const planned = [...input.graph.nodes.values()].filter(entry => entry.parent === module.id && (entry.type === 'feature' || entry.type === 'task') && entry.id !== input.task.id)
  const lines: string[] = [
    `# Design review ${input.task.id}: module ${module.id} "${module.title}"`,
    `You are a reviewer dispatched by the main agent (agent id "${input.parent}") for exactly one review of the project graph.`,
    '',
    '## Goal',
    `Review the design of module ${module.id} "${module.title}" against the direction list.`,
    `Decisions it follows: ${sources.map(decisionLine).join('; ') || 'none recorded'}.`,
    '',
    '## Context',
    '- Workspace: your working directory is the main checkout of the repository.',
    '- The design decisions under review:',
    ...sources.map(decision => `  - ${decision.id} "${decision.title}"${decision.body === undefined || decision.body.trim() === '' ? '' : ` — ${decision.body.trim().slice(0, DECISION_TEXT_LIMIT)}`}`),
    `- The module's acceptance: ${(module.acceptance ?? []).join('; ') || 'none recorded'}.`,
    `- Not in scope: ${(module.nonGoals ?? []).join('; ') || 'nothing recorded'}.`,
    ...(planned.length > 0 ? ['- Planning already under the module:', ...planned.map(entry => `  - ${entry.type} "${entry.title}"${(entry.acceptance ?? []).length > 0 ? ` (acceptance: ${(entry.acceptance ?? []).join('; ')})` : ''}`)] : []),
    '- The direction list:',
    ...directions.map((direction, index) => `  - direction:${index} ${direction}`),
    '',
    '## Constraints',
    '- You write nothing except your report under .hourness/ in your working directory.',
    '- Questions that need the main agent: ask_main (state the assumption you will use if no answer comes). Do not end your turn to wait.',
    '- A finding blocks only when it hangs on acceptance:<i> of the module, on irreversible-loss, on failure-plan, or on direction:<i> when the design violates direction item <i>. Everything else is not blocking.',
    '- checked must cover every direction:<i> above and every acceptance:<i> of the module, each with the evidence you looked at.',
    '',
    '## Done when',
    `- Hand back by calling structured_output once (verdict, commit, findings, checked, lessons). Write the long report to ".hourness/${input.childId}.md" in your working directory and give the path in "report".`,
  ]
  const text = lines.join('\n')
  const digest = digest12(text)
  return { text: `${text}\n\nbrief ${digest} · graph ${input.graph.revision}`, digest, truncated: [] }
}

// ---- the task review's brief (§3.7.1) ----

export interface ReviewBriefInput {
  readonly graph: LoadedGraph
  /** The review task. */
  readonly task: GraphNode
  /** The reviewed task, the parent of the review task. */
  readonly reviewed: GraphNode
  readonly childId: string
  readonly depth: 'full' | 'light'
  /** The done handback under review, as the task's comment carries it. */
  readonly handback?: { readonly head?: string, readonly base?: string, readonly status: string }
  /** The previous round's blocking findings, one line each (§3.7.3). */
  readonly findings?: readonly string[]
  /** The commands of `norm-merge-gate`, for context. */
  readonly gateCommands: readonly string[]
}

/**
 * The text a task reviewer starts from (§3.7.1): the reviewed commit and
 * base, the handback's facts, the previous round's findings, and the depth's
 * own instruction. The reviewer writes nothing but the verdict.
 */
export function renderReviewBrief(input: ReviewBriefInput): Brief {
  const { graph, reviewed } = input
  const chain = [...ancestorsOf(graph, reviewed)].reverse().map(node => `"${node.title}"`)
  const base = input.handback?.base ?? 'unknown'
  const head = input.handback?.head ?? 'unknown'
  const depthLine = input.depth === 'full'
    ? 'Check every acceptance item; "checked" must list every acceptance:<i> with the evidence you looked at.'
    : 'Read the change; report only findings that meet one of the three blocking criteria, the rest as non-blocking.'
  const lines: string[] = [
    `# Task ${input.task.id}: ${input.task.title}`,
    `You are a reviewer dispatched by the main agent for exactly one review (dispatch id "${input.childId}").`,
    '',
    '## Goal',
    `Review the work of task ${reviewed.id} "${reviewed.title}" at the declared depth: ${input.depth === 'full' ? 'full — against every acceptance item' : 'light — a scan of the change'}. Why the task exists: ${[...chain, 'this task'].join(' > ')}.`,
    '',
    '## Context',
    `- Reviewed: commit ${head}, made from base ${base}. Read the change with git diff ${base}..${head} in the worktree.`,
    `- The handback status was ${input.handback?.status ?? 'unknown'}; the task body carries its summary comment and the plan section.`,
    ...(input.findings === undefined || input.findings.length === 0 ? [] : ['- Findings of the previous round (these come first):', ...input.findings.map(finding => `  - ${finding}`)]),
    `- Project checks for context: ${input.gateCommands.length === 0 ? 'none recorded' : input.gateCommands.join(' ; ')}.`,
    '',
    '## Constraints',
    `- You write nothing: the worktree is read-only for you. Long notes go to ".hourness/${input.childId}.md"; only the verdict comes back.`,
    '- Questions that need the main agent: ask_main (state the assumption you will use if no answer comes).',
    '- Blocking criteria (docs/DEVELOPMENT.md §1.1): acceptance:<i> names the unmet acceptance item of the reviewed task; irreversible-loss; failure-plan. A finding that names none of the three does not block.',
    `- How far this round goes: ${depthLine}`,
    '',
    '## Done when',
    '1. verdict APPROVED only when nothing blocks; CHANGES_REQUESTED with the blocking findings otherwise (the verdict follows the findings).',
    '2. commit names the reviewed commit; every finding carries id, blocking, criterion, where, what and fix; checked lists what you looked at.',
    '- Hand back by calling structured_output once with the hourness-review-v1 verdict.',
  ]
  const text = lines.join('\n')
  const digest = digest12(text)
  return { text: `${text}\n\nbrief ${digest} · graph ${input.graph.revision}`, digest, truncated: [] }
}

// ---- the acceptance review's brief (§3.9.4) ----

export interface AcceptanceBriefInput {
  readonly graph: LoadedGraph
  readonly goal: GraphNode
  readonly childId: string
  /** The trunk branch and the commit of it under review (40 hex digits). */
  readonly trunk: { readonly branch: string, readonly sha: string }
  /** The commands of `norm-merge-gate`, for context. */
  readonly gateCommands: readonly string[]
}

/**
 * The text the reviewer of a whole goal starts from (§3.9.4, design 0.2
 * §3.9.4), in the shape of §3.5.2: the goal line names the trunk commit, the
 * done-when list is the goal's acceptance as numbered `acceptance:<i>`
 * items, a finding blocks only on one of them, and `checked` must hold every
 * item with the evidence it rests on. The reviewer writes nothing but its
 * report under `.hourness/` of the main checkout.
 */
export function renderAcceptanceBrief(input: AcceptanceBriefInput): Brief {
  const { graph, goal } = input
  const trunk12 = input.trunk.sha.slice(0, 12)
  const acceptance = goal.acceptance ?? []
  let scoped: GraphNode[]
  try {
    scoped = scopedTasks(graph, goal)
  }
  catch {
    // A module structure that cannot be read leaves the list out; the reviewer reads the graph itself.
    scoped = []
  }
  const tasks = scoped.map((task) => {
    const commit = task.evidence?.find(item => item.kind === 'commit')?.ref
    return `  - ${task.id} "${task.title}" (${task.status}${commit === undefined ? '' : `, trunk commit ${commit.slice(0, 12)}`})`
  })
  const lines: string[] = [
    `# Acceptance review of goal ${goal.id}: ${goal.title}`,
    `You are a reviewer dispatched by the main agent for exactly one review of the whole goal (dispatch id "${input.childId}").`,
    '',
    '## Goal',
    `Review goal ${goal.id} at commit ${trunk12} against its acceptance.`,
    '',
    '## Context',
    `- Workspace: your working directory is the main checkout; review branch ${input.trunk.branch} at commit ${trunk12} (git show, git log and git diff read it).`,
    ...(tasks.length > 0 ? ['- The work of the goal:', ...tasks] : []),
    `- Not in scope: ${(goal.nonGoals ?? []).join('; ') || 'nothing recorded'}.`,
    `- Project checks for context: ${input.gateCommands.length === 0 ? 'none recorded' : input.gateCommands.join(' ; ')}.`,
    '',
    '## Constraints',
    `- You write nothing except your report ".hourness/${input.childId}.md" in your working directory.`,
    '- Questions that need the main agent: ask_main (state the assumption you will use if no answer comes). Do not end your turn to wait.',
    '- A finding blocks only when its criterion is acceptance:<i>, the item of the goal it shows unmet. Everything else is not blocking.',
    '- checked must hold one entry per item below, written "acceptance:<i> <evidence>": the commit, the check log or the file you looked at.',
    '',
    '## Done when',
    ...acceptance.map((item, index) => `- acceptance:${index} ${item}`),
    `- Hand back by calling structured_output once with the hourness-review-v1 verdict (verdict, commit ${trunk12}, findings, checked, lessons). Write the long report to ".hourness/${input.childId}.md" and give the path in "report".`,
  ]
  const text = lines.join('\n')
  const digest = digest12(text)
  return { text: `${text}\n\nbrief ${digest} · graph ${graph.revision}`, digest, truncated: [] }
}
