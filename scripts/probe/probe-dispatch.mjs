/**
 * Dispatch feasibility spike (docs/ORCHESTRATION.md §2.1, §3.2; docs/DESIGN.md
 * §2.4a; ROADMAP borrowed-component checks 4, 4b and 12): an overlay-only
 * host-level row that exercises, on the real runtime, the seams the
 * background-dispatch and goal-driver design relies on. Not part of the
 * bundle and no product feature: loaded only through the overlay that
 * scripts/probe/run-probe.mjs generates.
 *
 * (a) `probe_dispatch` starts one background child per call through
 *     `ctx.subagents.startActivation` (spawn backend, delivery parent) with a
 *     prompt, a cwd, agentOptions (the model tier) and an outputSchema (the
 *     hand-back), and returns as soon as the child is accepted. The child id
 *     is reserved before the start, so the task is known before the child's
 *     first call can run.
 * (b) A `tools/pre-execute` listener maps the calling agent of every call
 *     back to its task (an rc.3 agent id is its session id, which is the
 *     reserved child id) and denies a file-tool write outside the task's
 *     write scope.
 * (c) `probe_goal_run` creates a second root agent and gives it a goal
 *     through `ctx.goals.create` (the plugin creates the goal, as the
 *     design's human-initiated command would), then waits until the goal
 *     leaves the active phase. The headless root stays inside that tool
 *     call, so the process lives through the goal rounds (headless exits at
 *     its own first quiescent idle, before the driver's checkpoint flush
 *     returns). Every goal-round step gets one projection notice in
 *     `agent/pre-step`, appended after `next()` like the bundle's step
 *     notices; `update_goal` with action complete is denied in
 *     `tools/pre-execute` until the goal agent's workspace holds the
 *     evidence file.
 *
 * (d) `probe_propose` hands a candidate lesson to the lessons service the way
 *     the dispatch of work does when a worker's handback carries one (M5
 *     design §8.1), so the lessons scenarios see `propose` on the real runtime.
 *
 * Every observation is one JSON line in `config.record`.
 */
import { appendFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { createUserNotice } from '../../packages/hourness/dist/shared/dsh-min.js'

export const name = 'glm-hourness-probe/dispatch'
export const inject = ['subagents', 'goals', 'agents', 'tools']

/** Source kind of the goal-round projection notice. */
export const PROJECTION_SOURCE = 'glm-probe-goal-projection'
/** First words of the write-scope denial and of the completion-gate denial. */
export const SCOPE_DENIAL = 'Write outside the task write scope'
export const GOAL_GATE_DENIAL = 'Goal completion needs evidence'

/** The task hand-back contract (the task node's output schema). */
const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'files'],
  additionalProperties: false,
}

/** File tools whose target is a path argument (the GLM aliases and the rc.3 natives). */
const WRITE_TOOLS = new Set(['Write', 'Edit', 'write', 'edit', 'str_replace_editor'])

const writeTarget = (call) => {
  if (!WRITE_TOOLS.has(call.name)) return undefined
  const args = call.arguments ?? {}
  if (typeof args.file_path === 'string') return args.file_path
  return typeof args.path === 'string' ? args.path : undefined
}

const within = (root, target) => {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

const goalView = goal => goal === undefined
  ? null
  : { id: goal.id, revision: goal.revision, phase: goal.phase, roundsStarted: goal.roundsStarted, maxGoalRounds: goal.maxGoalRounds, activation: goal.activation }

const textOf = value => ({ type: 'text', text: JSON.stringify(value) })

export function apply(ctx, config = {}) {
  const note = (entry) => {
    if (typeof config.record === 'string') appendFileSync(config.record, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`)
  }
  /** Dispatched tasks by reserved child id. */
  const tasks = new Map()
  /** Goal agents by id: their workspace and evidence file. */
  const goalAgents = new Map()
  const disposers = []

  disposers.push(ctx.tools.register({
    name: 'probe_dispatch',
    description: 'Probe only: start task `task` as a background subagent in `cwd` with write scope `scope` (relative to cwd) on model `model`; returns the child id at once.',
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string' },
        prompt: { type: 'string' },
        cwd: { type: 'string' },
        scope: { type: 'string' },
        model: { type: 'string' },
      },
      required: ['task', 'prompt', 'cwd', 'scope', 'model'],
    },
    output: { schema: { type: 'object', properties: { childId: { type: 'string' } } }, render: (_args, value) => [textOf(value)] },
    async execute(args, exec) {
      const parent = exec.agent
      if (parent === undefined) throw new Error('probe_dispatch needs a calling agent')
      const childId = `probe-task-${randomUUID()}`
      const task = { task: args.task, cwd: args.cwd, scope: resolve(args.cwd, args.scope) }
      tasks.set(childId, task)
      let activation
      try {
        activation = await ctx.subagents.startActivation({
          provider: 'spawn',
          label: `task ${args.task}`,
          childId,
          request: {
            prompt: [{ type: 'text', text: args.prompt }],
            parent,
            cwd: args.cwd,
            agentOptions: { model: args.model },
            outputSchema: OUTPUT_SCHEMA,
          },
          signal: exec.signal,
          delivery: 'parent',
        })
      }
      catch (error) {
        tasks.delete(childId)
        note({ kind: 'dispatch-failed', task: args.task, error: error instanceof Error ? error.message : String(error) })
        throw error
      }
      note({ kind: 'started', task: args.task, childId: activation.childId, messageId: activation.messageId ?? null, parentId: parent.id, scope: task.scope })
      activation.result.then(
        result => note({ kind: 'result', task: args.task, childId, stopReason: result.stopReason ?? null, structured: result.structured ?? null }),
        error => note({ kind: 'result-error', task: args.task, childId, error: error instanceof Error ? error.message : String(error) }),
      )
      return { childId: activation.childId }
    },
  }))

  disposers.push(ctx.tools.register({
    name: 'probe_propose',
    description: 'Probe only: hand the candidate lesson `candidate` to the lessons service the way a worker\'s handback does (task `task`, worker session `childId`, full commit id `commit`) and return what the service answers.',
    parameters: {
      type: 'object',
      properties: {
        candidate: { type: 'object' },
        task: { type: 'string' },
        childId: { type: 'string' },
        commit: { type: 'string' },
      },
      required: ['candidate'],
    },
    output: { schema: { type: 'object' }, render: (_args, value) => [textOf(value)] },
    async execute(args, exec) {
      const lessons = ctx.get('glmHournessLessons')
      const session = exec.agent?.session
      if (lessons === undefined || session === undefined) throw new Error('probe_propose needs the lessons service and a calling agent')
      const result = await lessons.propose(args.candidate, { session, task: args.task, childId: args.childId, commit: args.commit })
      note({ kind: 'proposed', task: args.task ?? null, result })
      return result
    },
  }))
  disposers.push(ctx.tools.register({
    name: 'probe_goal_run',
    description: 'Probe only: create a root agent in `cwd` with goal `objective` and wait until the goal leaves the active phase.',
    parameters: {
      type: 'object',
      properties: {
        objective: { type: 'string' },
        cwd: { type: 'string' },
        evidence: { type: 'string' },
        maxGoalRounds: { type: 'number' },
      },
      required: ['objective', 'cwd', 'evidence', 'maxGoalRounds'],
    },
    output: { schema: { type: 'object' }, render: (_args, value) => [textOf(value)] },
    async execute(args, exec) {
      const root = exec.agent
      if (root === undefined) throw new Error('probe_goal_run needs a calling agent')
      // Outside any agent's turn, like a human command: the driver only
      // drives an idle agent, and the goal tools check the initiator.
      const { agent, created } = await ctx.agents.withoutInitiator(async () => {
        const handle = await ctx.agents.create({
          sessionId: `probe-goal-${randomUUID()}`,
          meta: { cwd: args.cwd },
          agentOptions: { provider: root.options.provider, model: root.options.model },
        })
        goalAgents.set(handle.agent.id, { evidence: join(args.cwd, args.evidence) })
        return { agent: handle.agent, created: ctx.goals.create(handle.agent, { objective: args.objective, maxGoalRounds: args.maxGoalRounds }) }
      })
      note({ kind: 'goal-created', agentId: agent.id, root: ctx.agents.roots().includes(agent), goal: goalView(created) })
      const deadline = Date.now() + 90_000
      for (;;) {
        const goal = ctx.goals.get(agent)
        if (goal?.phase !== 'active' && agent.status === 'idle') break
        if (Date.now() > deadline || exec.signal.aborted) break
        await new Promise(resolveWait => setTimeout(resolveWait, 100))
      }
      const final = goalView(ctx.goals.get(agent))
      note({ kind: 'goal-final', agentId: agent.id, status: agent.status, goal: final })
      return { agentId: agent.id, goal: final }
    },
  }))

  disposers.push(ctx.on('goal/changed', ({ agent, change }) => {
    if (goalAgents.has(agent.id)) note({ kind: 'goal-changed', agentId: agent.id, operation: change?.operation ?? null, goal: goalView(ctx.goals.get(agent)) })
  }))

  disposers.push(ctx.on('tools/pre-execute', async (payload, next) => {
    const agent = payload.agent
    const task = agent === undefined ? undefined : tasks.get(agent.id)
    if (task !== undefined) {
      note({ kind: 'call', task: task.task, agentId: agent.id, sessionId: agent.session?.id ?? null, headerCwd: agent.session?.header?.cwd ?? null, tool: payload.name, nested: payload.parent !== undefined })
      const path = writeTarget(payload)
      if (path !== undefined) {
        const target = resolve(task.cwd, path)
        if (!within(task.scope, target)) {
          note({ kind: 'scope-deny', task: task.task, agentId: agent.id, tool: payload.name, target })
          return { kind: 'deny', reason: `${SCOPE_DENIAL}: ${target} is not under ${task.scope}. Task ${task.task} may write only inside its scope; report what else needs changing in your result.` }
        }
      }
    }
    const goalAgent = agent === undefined ? undefined : goalAgents.get(agent.id)
    if (goalAgent !== undefined) {
      note({ kind: 'call', agentId: agent.id, tool: payload.name, nested: payload.parent !== undefined })
      if (payload.name === 'update_goal' && payload.arguments?.action === 'complete') {
        const allowed = existsSync(goalAgent.evidence)
        note({ kind: 'goal-gate', agentId: agent.id, decision: allowed ? 'allow' : 'deny', goal: goalView(ctx.goals.get(agent)) })
        if (!allowed) return { kind: 'deny', reason: `${GOAL_GATE_DENIAL}: ${goalAgent.evidence} does not exist yet. Produce it, then mark the goal complete.` }
      }
    }
    return next()
  }))

  disposers.push(ctx.on('agent/created', ({ agent }) => {
    disposers.push(agent.ctx.on('agent/pre-step', async ({ signal }, next) => {
      const decision = await next()
      if (decision.kind === 'reject' || signal.aborted) return decision
      const submitted = decision.messages.find(message => message.source?.kind === 'goal' && message.source.round > 0)
      if (submitted === undefined) return decision
      const round = submitted.source.round
      note({ kind: 'round-notice', agentId: agent.id, round, admitted: decision.messages.map(message => message.source?.kind ?? null) })
      const notice = createUserNotice(PROJECTION_SOURCE, `goal round ${round}`, `<system-reminder>\nProbe projection for goal round ${round}: the evidence file must exist before the goal is marked complete.\n</system-reminder>`, { goalRound: round })
      return { ...decision, messages: [...decision.messages, notice] }
    }))
  }))

  return () => {
    for (const dispose of disposers.splice(0)) dispose()
  }
}
