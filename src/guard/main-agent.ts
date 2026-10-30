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
 *
 * The listener first reads the call (a cheap look at the tool name and the
 * shell text) and only then asks who the session is, so ordinary calls cost
 * nothing. Judging is fail-open when the role cannot be read (the row
 * health says so); the snapshot is the one rule that fails closed, because
 * letting a command through without its copy loses the work. This file does
 * not import the design directory: the design row hands in what it knows.
 * Denials go to the violation journal in the guard's record shape, with the
 * call's origin (src/guard/origin.ts). Nested transport calls pass.
 */
import type { AgentLike, PreExecuteHost, ServiceLookup } from '../shared/dsh-min.ts'
import type { JsonValue } from '../shared/json.ts'
import { dialectNames, dialectService, dialectWarner, toNativeTool } from '../shared/dialect.ts'
import type { HealthState } from '../shared/health.ts'
import { sessionRoute } from '../shared/route.ts'
import { baseFor, type ViolationRecord } from './index.ts'
import { guardGit, SNAPSHOT_NOTICE_KIND, snapshotCorrection, type SnapshotEnvironment } from './git-snapshot.ts'
import { ASK_RULE, GIT_SNAPSHOT_RULE, NO_WRITE_RULE } from './main-agent-rules.ts'
import { originOf } from './origin.ts'
import { evaluate, fileWriteTarget, isFileWrite, NATIVE_FACE, renderCorrection, shellCommandOf, shellWriteOf, type Correction, type GuardRule, type RuleVerdict, type ToolCall } from './rules.ts'
import { describeWrite } from './shell.ts'

const ALLOW: RuleVerdict = { kind: 'allow' }

const NO_WRITE_VIOLATION = 'You are the main agent of this session (/wish): the main agent plans, dispatches and accepts work; it never writes files itself.'
const NO_WRITE_RIGHT_PATH = 'Record designs and decisions on the project graph with the graph tools. For a change to files, describe it as a task node (graph_propose, type task, with acceptance), graph_focus it, and hand it to a subagent with the subagent tool; subagents write only once what you work on (the goal, or its module) is released, which the human does when you put the design to them with propose_to_human.'
const NO_WRITE_EXCEPTION = 'If the human wants this session to edit files directly, they leave main-agent mode with /wish off.'

/** main-agent-no-write: a file tool that writes, or a shell command that does. `call.name` is the DSH native. */
const mainAgentNoWrite: GuardRule = {
  id: NO_WRITE_RULE,
  // The main agent reads the rules in its identity section (src/design/identity.ts), not in the guard section every session gets.
  declare: '',
  detect(call) {
    const correction = (fact: string): Correction => ({ fact, violation: NO_WRITE_VIOLATION, rightPath: NO_WRITE_RIGHT_PATH, exception: NO_WRITE_EXCEPTION })
    const target = fileWriteTarget(call)
    if (target !== undefined) return { kind: 'deny', rule: NO_WRITE_RULE, correction: correction(`You tried to write "${target}".`) }
    // A file tool with no path in its arguments still writes (the runtime refuses it later); the rule does not wait for that.
    if (isFileWrite(call)) return { kind: 'deny', rule: NO_WRITE_RULE, correction: correction(`You called ${call.name}, which writes files.`) }
    const shell = shellWriteOf(call)
    if (shell === undefined) return ALLOW
    return { kind: 'deny', rule: NO_WRITE_RULE, correction: correction(`You tried to change files through the shell: "${shell.command}" (${describeWrite(shell.write)}).`) }
  },
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

/** What the design row hands to the rules. */
export interface MainAgentRulesDeps {
  /** Whether the agent's session is its project's main agent now. May throw: the call then passes and the health says why. */
  readonly isMainAgent: (agent: AgentLike) => boolean
  /** DSH natives of the tools the main agent does not get (ask_user_question). */
  readonly hiddenTools: readonly string[]
  /** Write one denial to the violation journal; never rejects into the call. */
  readonly journal: (record: ViolationRecord) => void
  /** Report the row health of the agent's session. */
  readonly report: (agent: AgentLike, state: HealthState, reason: string) => void
  /** Put a notice before the agent's next step; false when the agent could not be reached. */
  readonly tell: (agent: AgentLike, notice: { readonly kind: string, readonly summary: string, readonly text: string }) => boolean
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
  return ctx.on('tools/pre-execute', async (payload, next) => {
    const agent = payload.agent
    if (payload.parent !== undefined || agent?.session === undefined) return next()
    const dialect = dialectService(ctx, warn)
    const call: ToolCall = { name: toNativeTool(dialect, payload.name, warn), arguments: (payload.arguments ?? {}) as JsonValue }
    const shell = shellCommandOf(call)
    // Most calls are neither: read, search, graph tools. They pass before anything is asked about the session. A shell call is always looked at: whether its text runs git is for the shell reader to say, not for a search of the raw text (`"g"it` runs git).
    if (!isFileWrite(call) && !deps.hiddenTools.includes(call.name) && shell === undefined) return next()
    let main: boolean
    try {
      main = deps.isMainAgent(agent)
    }
    catch (error) {
      deps.report(agent, 'degraded', `读不到主 Agent 的状态（${message(error)}），这次调用没有按主 Agent 判`)
      return next()
    }
    if (!main) return next()
    const route = sessionRoute(agent.session)
    const names = dialectNames(dialect, agent, route, warn)
    const face = names ?? NATIVE_FACE
    const origin = originOf(names !== undefined, route)
    const deny = (rule: string, correction: Correction) => {
      const reason = renderCorrection(correction)
      deps.journal({ at: new Date().toISOString(), rule, tool: payload.name, agentId: agent.id, sessionId: agent.session?.id, ...origin, correction: reason })
      return { kind: 'deny' as const, reason }
    }
    const verdict = evaluate([ask, mainAgentNoWrite], call, face)
    if (verdict.kind === 'deny') return deny(verdict.rule, verdict.correction)
    if (shell === undefined) return next()
    // The base the shell's relative paths resolve from: the session's working directory, as the guard row reads it.
    const base = baseFor(ctx, agent)
    const git = await guardGit({ command: shell.command, dialects: shell.dialects, base, sessionId: agent.session.id, agentId: agent.id }, deps.snapshots)
    if (git.kind === 'refuse') return deny(GIT_SNAPSHOT_RULE, snapshotCorrection(shell.command, git.refusal))
    for (const text of git.notices) {
      if (!deps.tell(agent, { kind: SNAPSHOT_NOTICE_KIND, summary: 'git snapshot saved', text })) deps.report(agent, 'degraded', '快照已存，但没能告诉主 Agent 恢复办法')
    }
    if (git.degraded.length > 0) deps.report(agent, 'degraded', git.degraded.join('；'))
    return next()
  }, { prepend: true })
}
