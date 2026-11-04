/**
 * The rules board's tool-call gate (docs/ORCHESTRATION.md §16.11; design
 * §6.2): a listener on `tools/pre-execute`, registered outermost, that judges
 * a call after every gate inside it has let it through.
 *
 * 1. The inner gates decide first (`next()`): a call the guard, the graph-files
 *    gate or any other refuses is returned as it is, and never reaches the
 *    rules of the board.
 * 2. `rules:files-only`: a write into the rules board's files is refused, by a
 *    file tool and by a shell command file-tools-only counts as a write, for a
 *    direct call and for a call of a `run_code` program alike (the graph-files
 *    gate lets nested calls pass; this one does not). The files are the rules
 *    directory of the repository, the same relative path in every work tree
 *    of it, and the project's `.llm/rules/`. Reads pass. This needs no state,
 *    so it holds when the state cannot be read.
 * 3. The call's events are built (`gateEvents`: `gate.tool-call` always,
 *    `gate.dispatch` for the native dispatch tools; `gate.trunk-advance` is
 *    declared and not pushed: the execute row reports a passing local trunk
 *    advance through `glmHournessExecute.trunkAdvanceFor(callId)` since M7
 *    E7, and this gate does not read it yet) and judged with the same
 *    `judgeInput`, `judge` and table of rules `checkCall` uses.
 * 4. A rule that blocks refuses the call with the four-part text; a rule that
 *    records lets it run and leaves a line; informing rules change nothing. A
 *    rule of the person that queues refuses the call once with a ticket, and
 *    the same call again with the same ticket (tickets.ts); a call that ran
 *    answers the cleared ticket it waited on. The entries of the stop level
 *    queue the same way: a GLM subagent's tool calls are one ticket for the
 *    session and its active goal is paused with it, the dispatch of a GLM
 *    subagent is an ordinary ticket on the agent that dispatches, and
 *    nothing is ever queued for the main agent's own calls (tickets.ts).
 *
 * The listener never throws. Reading or judging that fails lets the call run
 * and degrades the row's health with the reason; the board's own faults never
 * hold an agent (design §11.2), but a deferral whose ticket cannot be recorded
 * still refuses, and says so. Every refusal and every recorded call is a line
 * of the project's violation journal, the file the guard writes, with the rule
 * as `rules:<id>`. The listener also hooks the guard framework's follow-up
 * recorder (src/guard/followup.ts, m4-gate G2, design §3.3): as its first
 * step it settles the agent's pending follow-up with this call, and every
 * refusal (a block and a deferral that refuses with a ticket) is noted as
 * the agent's next pending one. A late denial of the board's detectors is
 * not noted: that call already ran.
 */
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { cachedWorktrees, projectOf } from '../data/project-root.ts'
import { writesInto } from '../guard/directory-writes.ts'
import * as followup from '../guard/followup.ts'
import { originOf } from '../guard/origin.ts'
import { renderCorrection, type ToolCall } from '../guard/rules.ts'
import { keyOf, type GuardRecord } from '../guard/records.ts'
import { dialectNames, dialectService, dialectWarner, toNativeTool } from '../shared/dialect.ts'
import type { AgentLike, PreExecuteDecision, PreExecuteHost, ServiceLookup, ToolExecutionPayload } from '../shared/dsh-min.ts'
import { sessionIdOf, type RowHealth } from '../shared/health.ts'
import type { JsonValue } from '../shared/json.ts'
import { sessionRoute } from '../shared/route.ts'
import { DISPATCH_TOOL_NAMES } from '../shared/tool-names.ts'
import { callerOf } from './caller.ts'
import { describeCall } from './call.ts'
import { denialText } from './denial.ts'
import { gateEvents, type GateCall } from './events.ts'
import { judge, judgeInput, type RuleHit } from './judge.ts'
import { effectivePeakMode, type BuiltinRule, type Rule } from './model.ts'
import type { PeakReading, ProjectView } from './peak.ts'
import { gitOperationIn } from './repo.ts'
import { projectHealth } from './row-health.ts'
import { rulesPaths, type RulesPaths } from './store.ts'
import { clockReadings, signalsRead, tableOf } from './table.ts'
import type { TicketDesk } from './tickets.ts'

/** The id of the gate on the board's own files, as the catalog lists it and the violation journal records it. */
export const RULES_FILES_ONLY = 'rules:files-only'

export interface GateDeps {
  readonly ctx: PreExecuteHost & ServiceLookup
  /** The rules directory of the row's configuration, relative to the project root unless absolute. */
  readonly rulesDir: string | undefined
  readonly now: () => number
  /** The project of a working directory, as the row reads it; it throws when the files cannot be read. */
  readonly project: (cwd: string) => ProjectView | undefined
  readonly peak: () => PeakReading
  /** Where the gate hands its record: the row journal (which reports how the write came out) or the raw audit journal; the gate does not read the outcome (design §3.2). */
  readonly journal: { readonly violation: (record: GuardRecord) => Promise<unknown> }
  readonly health: RowHealth
  /** The waiting tickets of the calls a rule queues. */
  readonly tickets: TicketDesk
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 80)

/** The directories only the rules board writes in: the rules directory, the same relative path in every other work tree, and the runtime directory. */
function boardDirs(paths: RulesPaths, trees: readonly string[]): readonly string[] {
  const inside = relative(paths.projectRoot, paths.rulesDir)
  const others = inside === '' || inside.startsWith('..') || isAbsolute(inside)
    ? []
    : trees.filter(tree => resolve(tree).toLowerCase() !== resolve(paths.projectRoot).toLowerCase()).map(tree => join(tree, inside))
  return [paths.rulesDir, ...others, paths.runtimeDir]
}

/** The refusal of `rules:files-only`, in the four parts every refusal of the board has. */
function filesOnlyText(attempt: string): string {
  return renderCorrection({
    fact: attempt,
    violation: `Rule ${RULES_FILES_ONLY} blocks writes under the rules board's files (docs/rules/ in the repository and .llm/rules/); only the rules board writes there.`,
    rightPath: 'Tell the human what you need and why; they change rules with /rules.',
    exception: 'Only the human can change rules, with /rules.',
  })
}

/** What a dispatching call says about the subagent it starts: the route it names (a provider and a model together), else nothing. */
function dispatchOf(args: unknown): NonNullable<GateCall['dispatch']> {
  const fields = typeof args === 'object' && args !== null && !Array.isArray(args) ? args as Record<string, unknown> : {}
  const { provider, model } = fields
  return typeof provider === 'string' && typeof model === 'string' && provider !== '' && model !== '' ? { targetModel: `${provider}/${model}` } : {}
}

/** The values of the signals a rule read, when it was judged; a signal that could not be read is null. */
type SignalValues = Record<string, boolean | number | string | null>

/** What a line of the violation journal says besides who, when and where (design §10.5): a denial has its correction, a call that ran has none; a deferral also names its ticket. */
type Line =
  | { readonly rule: string, readonly mode: 'enforce', readonly effect: 'block', readonly correction: string, readonly signals: SignalValues }
  | { readonly rule: string, readonly mode: 'enforce', readonly effect: 'queue', readonly correction: string, readonly ticket?: string, readonly signals: SignalValues }
  | { readonly rule: string, readonly mode: 'record', readonly effect: 'record', readonly signals: SignalValues }

/** Install the gate; the disposer takes it out. Throws only when the host refuses the registration. */
export function installRulesGate(deps: GateDeps): () => void {
  const warn = dialectWarner('rules')
  const warnFault = dialectWarner('rules')
  const trees = cachedWorktrees(deps.now)

  /** A line for the violation journal; the journal never rejects into the call, the call does not wait for the write (the guard does not either), and a journal that cannot be reached never changes what the rules said about the call. Returns the line's record key, for the follow-up recorder. */
  function note(agent: AgentLike, exec: ToolExecutionPayload, claimed: boolean, line: Line): string {
    const record: GuardRecord = {
      at: new Date(deps.now()).toISOString(),
      tool: exec.name,
      agentId: agent.id,
      sessionId: agent.session?.id,
      ...originOf(claimed, sessionRoute(agent.session)),
      ...line,
    }
    try {
      void deps.journal.violation(record)
    }
    catch (error) {
      warnFault(`a violation line could not be handed to the journal: ${message(error)}`)
    }
    return keyOf(record)
  }

  /** Note one refusal as the agent's pending follow-up (design §3.3): the rules have no right path of their own, so only a repeat, something else or no next call can settle it. The origin is the refusal line's. */
  function noteFollowup(agent: AgentLike, exec: ToolExecutionPayload, claimed: boolean, rule: string, call: ToolCall, key: string): void {
    if (typeof exec.callId !== 'string') return
    followup.noteDenial(agent, exec.callId, {
      rule,
      call,
      key,
      origin: originOf(claimed, sessionRoute(agent.session)),
    })
  }

  /** The row's health for the session, after the judgement; a report that fails never changes the verdict. */
  function report(sessionId: string | undefined, name: string, view: ProjectView, reading: PeakReading, root: string): void {
    try {
      deps.health.report(sessionId, ...projectHealth(name, view.read, reading, gitOperationIn(root)))
    }
    catch (error) {
      warnFault(`the row's health could not be reported: ${message(error)}`)
    }
  }

  async function judgeCall(exec: ToolExecutionPayload, agent: AgentLike, cwd: string): Promise<PreExecuteDecision | undefined> {
    const project = projectOf(cwd)
    if (project === undefined) return undefined
    const dialect = dialectService(deps.ctx, warn)
    const tool = toNativeTool(dialect, exec.name, warn)
    const caller = callerOf(deps.ctx, agent)
    const paths = rulesPaths(project.root, deps.rulesDir)
    const route = sessionRoute(agent.session)
    const claimed = dialectNames(dialect, agent, route, warn) !== undefined
    const call: ToolCall = { name: tool, arguments: (exec.arguments ?? {}) as JsonValue }
    const sessionId = sessionIdOf(agent)

    // 2. rules:files-only, before anything is read from the state.
    const write = writesInto(boardDirs(paths, trees(project.root)), caller.workspace)(call)
    if (write !== undefined) {
      const reason = filesOnlyText(write.kind === 'file' ? `You tried to write "${write.target}".` : `You tried to change the rules board's files through the shell: "${write.command}".`)
      noteFollowup(agent, exec, claimed, RULES_FILES_ONLY, call, note(agent, exec, claimed, { rule: RULES_FILES_ONLY, mode: 'enforce', effect: 'block', correction: reason, signals: {} }))
      return { kind: 'deny', reason }
    }

    // 3. The events and the judgement.
    let view: ProjectView | undefined
    try {
      view = deps.project(cwd)
    }
    catch (error) {
      deps.health.report(sessionId, 'degraded', `读规则板的状态失败：${message(error)}，这次调用放行`)
      return undefined
    }
    if (view === undefined) return undefined
    const { state } = view.read
    const level = effectivePeakMode(state)
    const reading = deps.peak()
    const now = new Date(deps.now())
    const { until, readings } = clockReadings(state, reading, now)
    const table = tableOf(state, level.level)
    const described = describeCall(tool, exec.arguments, caller.workspace)
    const why = (item: 'role' | 'model' | 'session'): string => caller.unknown[item] ?? `the ${item} of this call is not known`
    const unreadable = { role: why('role'), model: why('model'), session: why('session') }
    const events = gateEvents({
      at: now.toISOString(),
      project: project.root,
      cwd,
      tool,
      args: exec.arguments,
      ...(described.command === undefined ? {} : { command: described.command }),
      ...(described.writes === undefined ? {} : { writes: described.writes }),
      ...(caller.role === undefined ? {} : { role: caller.role }),
      ...(caller.model === undefined ? {} : { model: caller.model }),
      ...(caller.sessionId === undefined ? {} : { session: caller.sessionId }),
      nested: exec.parent !== undefined,
      ...(DISPATCH_TOOL_NAMES.includes(tool) ? { dispatch: dispatchOf(exec.arguments) } : {}),
    })
    const verdict = judge(judgeInput({ now, project: project.root, events, signals: [...readings.values()], unreadable }), table)
    report(sessionId, basename(project.root), view, reading, project.root)

    // 4. What the strongest effect makes of the call.
    const byId = new Map<string, Rule | BuiltinRule>(table.map(rule => [rule.id, rule]))
    const signalsOf = (hit: RuleHit): SignalValues => {
      const rule = byId.get(hit.rule)
      return Object.fromEntries((rule === undefined ? [] : signalsRead(rule)).map(name => [name, readings.get(name)?.value ?? null]))
    }
    const peak = { ...level, ...(until === undefined ? {} : { until }) }
    const pairs = (hits: readonly RuleHit[]): Array<{ readonly hit: RuleHit, readonly rule: Rule | BuiltinRule }> => hits.flatMap((hit) => {
      const rule = byId.get(hit.rule)
      return rule === undefined ? [] : [{ hit, rule }]
    })
    if (verdict.effect === 'block') {
      const reason = denialText({ attempt: described.attempt, effect: 'block', rules: pairs(verdict.strongest), peak })
      for (const hit of verdict.strongest) {
        noteFollowup(agent, exec, claimed, `rules:${hit.rule}`, call, note(agent, exec, claimed, { rule: `rules:${hit.rule}`, mode: 'enforce', effect: 'block', correction: reason, signals: signalsOf(hit) }))
      }
      return { kind: 'deny', reason }
    }
    const session = agent.session
    // The rules of the person and the entries of the stop level queue alike: the entries only name the calls of GLM subagents and the dispatch of one, never the main agent's own.
    const queued = verdict.effect === 'queue' ? pairs(verdict.strongest) : []
    if (session !== undefined && queued.length > 0) {
      const deferral = await deps.tickets.defer({ session, caller, view, root: project.root, cwd, tool, args: exec.arguments, described, events, unreadable, nested: exec.parent !== undefined, rules: queued, peak })
      if (deferral.kind === 'deny') {
        for (const { hit } of queued) {
          noteFollowup(agent, exec, claimed, `rules:${hit.rule}`, call, note(agent, exec, claimed, { rule: `rules:${hit.rule}`, mode: 'enforce', effect: 'queue', correction: deferral.reason, ...(deferral.ticket === undefined ? {} : { ticket: deferral.ticket }), signals: signalsOf(hit) }))
        }
        return { kind: 'deny', reason: deferral.reason }
      }
    }
    for (const hit of verdict.hits) {
      if (hit.effect === 'record') note(agent, exec, claimed, { rule: `rules:${hit.rule}`, mode: 'record', effect: 'record', signals: signalsOf(hit) })
    }
    if (session !== undefined) await deps.tickets.passed({ session, view, root: project.root, cwd, tool, args: exec.arguments })
    return undefined
  }

  return deps.ctx.on('tools/pre-execute', async (exec, next) => {
    // The follow-up recorder first (design §3.3): this call settles the agent's pending follow-up whoever refuses or allows it.
    const agent = exec.agent
    if (agent !== undefined && typeof exec.callId === 'string') {
      const sessionId = agent.session?.id
      if (sessionId !== undefined) followup.hookJournal(sessionId, record => { void deps.journal.violation(record).catch(() => {}) })
      followup.observe(agent, { name: toNativeTool(dialectService(deps.ctx, warn), exec.name, warn), arguments: (exec.arguments ?? {}) as JsonValue }, exec.callId)
    }
    const decision = await next()
    if (decision.kind !== 'allow') return decision
    try {
      const cwd = agent?.session?.header.cwd
      if (agent === undefined || typeof cwd !== 'string' || cwd === '') return decision
      return await judgeCall(exec, agent, cwd) ?? decision
    }
    catch (error) {
      deps.health.report(sessionIdOf(agent), 'degraded', `规则板判定出错：${message(error)}，这次调用放行`)
      return decision
    }
  }, { prepend: true })
}
