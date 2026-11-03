/**
 * The execution-boundary rules of the main agent (docs/ORCHESTRATION.md
 * §3.1, §6.1; decisions d-main-agent-shell and d-chat-not-cards): one
 * `tools/pre-execute` listener, installed by the design row, that judges the
 * calls of the session which is its project's main agent and nobody else's.
 *
 * - main-agent-no-write: the main agent has no tool that writes files, but
 *   the runtime executes by name, so a file tool called by name and a shell
 *   command that writes a file are denied here. Git is not a file write.
 * - main-agent-ask: ask_user_question is hidden from its tool face; called by
 *   name it is denied, the human is asked in plain chat.
 * - git-snapshot: it may run any git command. One that can lose uncommitted
 *   work or rewrite history runs after the harness has saved a copy it can
 *   restore (src/guard/git-snapshot.ts); one that cannot be saved before is
 *   denied, and so is one that would send the copies off the machine.
 * - design-before-release: the subagents the main agent dispatches, and the
 *   ones they dispatch, only read until what the main agent works on (the
 *   goal, or its module) is released (src/guard/design-release.ts). It
 *   judges a write by a delegated session, so it is the one rule here that
 *   is not about the main agent's own calls.
 * - main-agent-graph-relay, main-agent-graph-options,
 *   main-agent-graph-delegations, main-agent-graph-stage and
 *   main-agent-graph-cli: how a session may write the project graph
 *   (src/guard/main-agent-graph.ts). The delegations, stage and cli rules are
 *   for every session (a delegated or an ordinary session that tries to move
 *   a goal on, or to write the graph through its command line with `relay`,
 *   is also reported); the other two judge the main agent, and the relay rule
 *   also refuses a delegated session's `relay`.
 *
 * The listener first reads the call (a cheap look at the tool name and the
 * shell text) and only then asks who the session is, so ordinary calls cost
 * nothing. Judging is fail-open when the role cannot be read (the row
 * health says so); the snapshot is the one rule that fails closed, because
 * letting a command through without its copy loses the work. This file does
 * not import the design directory: the design row hands in what it knows.
 * Denials go to the violation journal in the guard's record shape, with the
 * call's origin (src/guard/origin.ts). A nested transport call (it carries a
 * `parent` token, the way the PTC preset dispatches from run_code) is judged
 * like a direct one: inside it the main agent has no write either, its
 * dispatched sessions stay read-only, and the graph-write rules still hold
 * (review findings S4-1, S5-1, S6-2, S8-3).
 */
import type { AgentLike, PreExecuteDecision, PreExecuteHost, ServiceLookup, SessionLike } from '../shared/dsh-min.ts'
import type { JsonValue } from '../shared/json.ts'
import { dialectNames, dialectService, dialectWarner, toNativeTool } from '../shared/dialect.ts'
import type { HealthState } from '../shared/health.ts'
import { DELEGATIONS_ID } from '../shared/answer-marks.ts'
import { sessionRoute } from '../shared/route.ts'
import { GRAPH_TOOL_NAMES } from '../shared/tool-names.ts'
import { baseFor, type ViolationRecord } from './index.ts'
import { guardGit, SNAPSHOT_NOTICE_KIND, snapshotCorrection, type SnapshotEnvironment } from './git-snapshot.ts'
import { DISPATCH_CHAIN_RULE, dispatchChainCorrection, judgeDispatchedWrite, releaseCorrection, type ReleaseDeps } from './design-release.ts'
import { attemptOf, DELEGATIONS_CORRECTION, GRAPH_CLI_CORRECTION, graphCliWrite, judgeGraphStage, judgeMainAgentGraph, relayOf, stageCandidate, SUBAGENT_RELAY_CORRECTION, writesDelegations, type GraphRuleDeps, type SessionKind, type StageAttempt } from './main-agent-graph.ts'
import { ASK_RULE, DESIGN_RELEASE_RULE, GIT_SNAPSHOT_RULE, GRAPH_CLI_RULE, GRAPH_DELEGATIONS_RULE, GRAPH_RELAY_RULE, GRAPH_STAGE_RULE, NO_WRITE_RULE } from './main-agent-rules.ts'
import { originOf } from './origin.ts'
import { evaluate, fileWriteTarget, isFileWrite, NATIVE_FACE, renderCorrection, shellCommandOf, shellWriteOf, type Correction, type GuardRule, type RuleVerdict, type ToolCall } from './rules.ts'
import { describeWrite } from './shell.ts'

const ALLOW: RuleVerdict = { kind: 'allow' }

/** The graph tools by name. */
const GRAPH_NAMES: ReadonlySet<string> = new Set(GRAPH_TOOL_NAMES)

const NO_WRITE_VIOLATION = 'You are the main agent of this session (/wish): the main agent plans, dispatches and accepts work; it never writes files itself.'
const NO_WRITE_RIGHT_PATH = 'Record designs and decisions on the project graph with the graph tools. For a change to files, describe it as a task node (graph_propose, type task, with acceptance), graph_focus it, and hand it to a subagent with the subagent tool; subagents write only once what you work on (the goal, or its module) is released, which the human does when you put the design to them with propose_to_human.'
/** The right path once the execute row is on (F18): writing work goes to dispatched workers, plain subagents only read. */
const NO_WRITE_RIGHT_PATH_EXECUTE = 'Record designs and decisions on the project graph with the graph tools. For a change to files, describe it as a task node (graph_propose, type task, with acceptance), graph_focus it, and dispatch it with dispatch_task: writing work goes to workers you dispatch with dispatch_task; subagents started with the subagent tool only read.'
const NO_WRITE_EXCEPTION = 'If the human wants this session to edit files directly, they leave main-agent mode with /wish off.'

/** What a call does that writes files, as the first line of a correction; undefined when it writes nothing. `call.name` is the DSH native. */
function writeFactOf(call: ToolCall): string | undefined {
  const target = fileWriteTarget(call)
  if (target !== undefined) return `You tried to write "${target}".`
  // A file tool with no path in its arguments still writes (the runtime refuses it later); the rules do not wait for that.
  if (isFileWrite(call)) return `You called ${call.name}, which writes files.`
  const shell = shellWriteOf(call)
  return shell === undefined ? undefined : `You tried to change files through the shell: "${shell.command}" (${describeWrite(shell.write)}).`
}

/** main-agent-no-write: a file tool that writes, or a shell command that does. The right path points at dispatch_task once the execute row is on (F18). */
function mainAgentNoWrite(executeOn: () => boolean): GuardRule {
  return {
    id: NO_WRITE_RULE,
    // The main agent reads the rules in its identity section (src/design/identity.ts), not in the guard section every session gets.
    declare: '',
    detect(call) {
      const fact = writeFactOf(call)
      if (fact === undefined) return ALLOW
      return { kind: 'deny', rule: NO_WRITE_RULE, correction: { fact, violation: NO_WRITE_VIOLATION, rightPath: executeOn() ? NO_WRITE_RIGHT_PATH_EXECUTE : NO_WRITE_RIGHT_PATH, exception: NO_WRITE_EXCEPTION } }
    },
  }
}

/** main-agent-ask: the question tool hidden from the main agent, called by name. `hidden` lists the DSH natives. */
function mainAgentAsk(hidden: readonly string[]): GuardRule {
  return {
    id: ASK_RULE,
    declare: '',
    detect(call, face) {
      if (!hidden.includes(call.name)) return ALLOW
      return {
        kind: 'deny',
        rule: ASK_RULE,
        correction: {
          fact: `You called ${face(call.name)}.`,
          violation: 'As the main agent you talk with the human in plain chat, without option cards.',
          rightPath: 'Ask in your reply in plain words, or put a plan to them with propose_to_human.',
          exception: 'none',
        },
      }
    },
  }
}

/** The part of an agent the rules read: its id and its session. A live agent of the registry is one too. */
type Subject = Pick<AgentLike, 'id' | 'session'>

/** A graph write that tried to move work on with the human's words, by a session that has no right to them: what the design row tells the human about (the row health, a notice to the main agent). */
export interface BypassAlert {
  readonly rule: string
  readonly agent: Subject
  readonly kind: 'subagent' | 'ordinary'
  readonly tool: string
  /** What was tried, in the human's words: 把「…」推到 …, 批准「…」. */
  readonly what: string
  readonly goal?: string
  readonly node?: string
}

/** What the design row hands to the rules. */
export interface MainAgentRulesDeps extends Pick<ReleaseDeps, 'agents' | 'graph'>, Pick<GraphRuleDeps, 'checkRelay'> {
  /** Whether the agent's session is its project's main agent now. May throw: the call then passes and the health says why. */
  readonly isMainAgent: (agent: Subject) => boolean
  /**
   * The execute row's wiring (src/shared/execute-service.ts): `isWorker` per
   * call answers `true` for a registered worker or reviewer, `false` for an
   * agent the row gates but no dispatch carries, `undefined` when the row is
   * off; `executeOn` answers whether the row is on now. With it, the main
   * agent's boundary line and no-write right path point at dispatch_task
   * (F18), and design-before-release defers a registered worker's write to
   * the execute row's rules.
   */
  readonly isWorker?: (agentId: string) => boolean | undefined
  readonly executeOn?: () => boolean
  /** DSH natives of the tools the main agent does not get (ask_user_question). */
  readonly hiddenTools: readonly string[]
  /** Write one denial to the violation journal; never rejects into the call. */
  readonly journal: (record: ViolationRecord) => void
  /** Report the row health of the agent's session. */
  readonly report: (agent: Subject, state: HealthState, reason: string) => void
  /** Put a notice before the agent's next step; false when the agent could not be reached. */
  readonly tell: (agent: AgentLike, notice: { readonly kind: string, readonly summary: string, readonly text: string }) => boolean
  /** A delegated session sent the human's words with a graph write: told to the human and the main agent. Never rejects into the call. */
  readonly bypass: (alert: BypassAlert) => void
  /** One metrics event (src/design/metrics.ts); never throws. */
  readonly metric: (event: { readonly event: string, readonly [field: string]: unknown }) => void
  /** The machine the snapshot runs on; tests replace the parts they control. */
  readonly snapshots?: SnapshotEnvironment
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Install the listener on `tools/pre-execute`, outermost so that a write gets this correction instead of file-tools-only's. Returns the uninstall function. */
export function installMainAgentRules(ctx: PreExecuteHost & ServiceLookup, deps: MainAgentRulesDeps): () => void {
  const warn = dialectWarner('design')
  const ask = mainAgentAsk(deps.hiddenTools)
  const noWrite = mainAgentNoWrite(() => deps.executeOn?.() ?? false)
  return ctx.on('tools/pre-execute', async (payload, next) => {
    const agent = payload.agent
    // A nested transport call is judged like a direct one of the same agent: the PTC preset reaches these rules through it, so it may not pass (S4-1, S5-1, S6-2, S8-3).
    if (agent?.session === undefined) return next()
    const dialect = dialectService(ctx, warn)
    const call: ToolCall = { name: toNativeTool(dialect, payload.name, warn), arguments: (payload.arguments ?? {}) as JsonValue }
    const shell = shellCommandOf(call)
    const delegated = agent.session.header.origin === 'subagent'
    // A graph write is looked at only when it carries the human's words, proposes or edits (the options rule), approves, or points at norm-delegations.
    const toDelegations = writesDelegations(call)
    const graphCall = GRAPH_NAMES.has(call.name) && (relayOf(call) !== undefined || call.name === 'graph_propose' || call.name === 'graph_edit' || stageCandidate(call) || toDelegations)
    // Most calls are neither: read, search, graph tools. They pass before anything is asked about the session. A shell call is always looked at: whether its text runs git is for the shell reader to say, not for a search of the raw text (`"g"it` runs git). A delegated session is judged for its writes only.
    if (!isFileWrite(call) && !(!delegated && deps.hiddenTools.includes(call.name)) && shell === undefined && !graphCall) return next()
    const session = agent.session
    // Who the session is, for the metric of a denial and the words of an alert; settled below once the role is read.
    let who: SessionKind = delegated ? 'subagent' : 'main-agent'
    const denial = (rule: string, correction: Correction, extra: Partial<Pick<ViolationRecord, 'session' | 'goal' | 'node' | 'stageFrom' | 'stageTo'>> = {}) => {
      const route = sessionRoute(session)
      const origin = originOf(dialectNames(dialect, agent, route, warn) !== undefined, route)
      const reason = renderCorrection(correction)
      deps.journal({ at: new Date().toISOString(), rule, tool: payload.name, agentId: agent.id, sessionId: session.id, ...origin, correction: reason, ...extra })
      deps.metric({ event: 'design.rule-denied', rule, tool: call.name, session: who })
      return { kind: 'deny' as const, reason }
    }
    /** A delegated or an ordinary session tried to move work on without the human: the denial goes to the journal with who tried and at what, and the human and the main agent are told. */
    const refusedAttempt = (rule: string, correction: Correction, attempt: Pick<StageAttempt, 'what' | 'goal' | 'node' | 'stageFrom' | 'stageTo'> | undefined) => {
      const parent = session.header.parentSession
      const kind = who === 'subagent' ? 'subagent' as const : 'ordinary' as const
      const decision = denial(rule, correction, {
        session: { id: session.id, kind, ...kind === 'subagent' && parent !== undefined ? { parent } : {} },
        goal: attempt?.goal,
        node: attempt?.node,
        stageFrom: attempt?.stageFrom,
        stageTo: attempt?.stageTo,
      })
      if (attempt === undefined) return decision
      try {
        deps.bypass({ rule, agent: { id: agent.id, session }, kind, tool: call.name, what: attempt.what, ...attempt.goal === undefined ? {} : { goal: attempt.goal }, ...attempt.node === undefined ? {} : { node: attempt.node } })
      }
      catch (error) {
        deps.report(agent, 'degraded', `不经人的同意推进目标的写入被拒了，但没能告诉人（${message(error)}）`)
      }
      return decision
    }
    /** main-agent-graph-stage for a session that is not the main agent. */
    const stageRefusal = async () => {
      const verdict = await judgeGraphStage(deps, { session }, call, who === 'main-agent' ? 'ordinary' : who)
      if (verdict.kind === 'allow') return undefined
      if (verdict.degraded !== undefined) deps.report(agent, 'degraded', verdict.degraded)
      return refusedAttempt(GRAPH_STAGE_RULE, verdict.correction, verdict.attempt)
    }
    /** main-agent-graph-cli for a shell call of any session; an attempt with `relay` in it is told to the human like the graph tool's. */
    const cliRefusal = () => {
      const subcommand = shell === undefined ? undefined : graphCliWrite(shell.command, shell.dialects)
      if (shell === undefined || subcommand === undefined) return undefined
      if (who === 'main-agent') return denial(GRAPH_CLI_RULE, GRAPH_CLI_CORRECTION)
      return refusedAttempt(GRAPH_CLI_RULE, GRAPH_CLI_CORRECTION, shell.command.includes('relay') ? { what: `用命令行带转述的话改项目图（${subcommand === '' ? '没有子命令' : subcommand}）` } : undefined)
    }
    // Every kind of session: the node of what the human handed over for good is written by record_human_answer alone.
    if (toDelegations) return denial(GRAPH_DELEGATIONS_RULE, DELEGATIONS_CORRECTION, { node: DELEGATIONS_ID })
    if (delegated) {
      if (graphCall) {
        // A subagent has no human to quote: its relay is refused whatever it says; what moves a goal on is refused with or without it.
        if (relayOf(call) !== undefined) return refusedAttempt(GRAPH_RELAY_RULE, SUBAGENT_RELAY_CORRECTION, await attemptOf(deps, { session }, call))
        return await stageRefusal() ?? next()
      }
      return cliRefusal() ?? judgeDelegated(deps, { id: agent.id, session }, writeFactOf(call), denial, next)
    }
    try {
      who = deps.isMainAgent(agent) ? 'main-agent' : 'ordinary'
    }
    catch (error) {
      // The two rules that hold for every session still apply; the ones about the main agent's own calls cannot be judged.
      deps.report(agent, 'degraded', `读不到主 Agent 的状态（${message(error)}），这次调用没有按主 Agent 判`)
      who = 'ordinary'
      return (graphCall ? await stageRefusal() : cliRefusal()) ?? next()
    }
    if (who === 'ordinary') return (graphCall ? await stageRefusal() : cliRefusal()) ?? next()
    if (graphCall) {
      const verdict = await judgeMainAgentGraph(deps, { id: agent.id, session }, call)
      if (verdict.degraded !== undefined) deps.report(agent, 'degraded', verdict.degraded)
      return verdict.kind === 'deny'
        ? denial(verdict.rule, verdict.correction, { node: verdict.node, goal: verdict.goal, stageFrom: verdict.stageFrom, stageTo: verdict.stageTo })
        : next()
    }
    const route = sessionRoute(session)
    const face = dialectNames(dialect, agent, route, warn) ?? NATIVE_FACE
    const verdict = evaluate([ask, noWrite], call, face)
    if (verdict.kind === 'deny') return denial(verdict.rule, verdict.correction)
    if (shell === undefined) return next()
    const cli = cliRefusal()
    if (cli !== undefined) return cli
    // The base the shell's relative paths resolve from: the session's working directory, as the guard row reads it.
    const base = baseFor(ctx, agent)
    const git = await guardGit({ command: shell.command, dialects: shell.dialects, base, sessionId: session.id, agentId: agent.id }, deps.snapshots)
    if (git.kind === 'refuse') return denial(GIT_SNAPSHOT_RULE, snapshotCorrection(shell.command, git.refusal))
    for (const text of git.notices) {
      if (!deps.tell(agent, { kind: SNAPSHOT_NOTICE_KIND, summary: 'git snapshot saved', text })) deps.report(agent, 'degraded', '快照已存，但没能告诉主 Agent 恢复办法')
    }
    if (git.degraded.length > 0) deps.report(agent, 'degraded', git.degraded.join('；'))
    return next()
  }, { prepend: true })
}

/** design-before-release: a delegated session's write is judged by the main agent that roots its dispatch chain. A call that writes nothing passes. */
async function judgeDelegated(
  deps: MainAgentRulesDeps,
  agent: { readonly id: string, readonly session: SessionLike },
  fact: string | undefined,
  denial: (rule: string, correction: Correction) => PreExecuteDecision,
  next: () => Promise<PreExecuteDecision>,
): Promise<PreExecuteDecision> {
  if (fact === undefined) return next()
  const outcome = await judgeDispatchedWrite(deps, agent)
  if (outcome.kind === 'deny') return denial(DESIGN_RELEASE_RULE, releaseCorrection(fact, outcome.verdict))
  // dispatch-chain-readonly (M7 design 0.6 §3.2.2): with the execute row on, the released stage is no longer a pass — a plain subagent of the main agent only reads.
  if (outcome.kind === 'readonly') return denial(DISPATCH_CHAIN_RULE, dispatchChainCorrection(fact))
  if (outcome.unjudged !== undefined) {
    const why = `派出去的 agent 的写入没有按放行状态判（${outcome.unjudged}），这次调用放行了`
    deps.report(agent, 'degraded', why)
    if (outcome.root !== undefined) deps.report(outcome.root, 'degraded', why)
  }
  return next()
}
