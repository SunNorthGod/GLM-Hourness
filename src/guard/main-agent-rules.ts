/**
 * The interceptions M3 puts on the main agent, as a table (docs/
 * ORCHESTRATION.md §3.1, §6.1; decisions d-rules-visible and
 * d-defaults-readonly: every rule that stops an action is on the rules board,
 * where the ones a plugin brings can only be read). Constants only, no
 * imports, so the guard code that enforces the rules (src/guard/main-agent.ts)
 * and the rules board's catalog of code rules can both read it without
 * pulling the other's code in. The rules board lists each entry as
 * `design:<id>`.
 */

export interface MainAgentRule {
  /** The id in the code; the `rule` of the violation journal is this. */
  readonly id: string
  /** One line in plain words, the title on the rules page. */
  readonly title: string
  readonly enforcement: 'deny' | 'deny-when-no-snapshot'
  readonly subjects: 'main-agent' | 'main-agent-subagents' | 'every-session'
  /** The step of the plan that adds the rule: M3's steps for the first nine, 9 for the nowait batch (.agents/tasks/nowait/design.md). For the addendum and the tests. */
  readonly step: 3 | 4 | 5 | 6 | 8 | 9
}

export const NO_WRITE_RULE = 'main-agent-no-write'
export const ASK_RULE = 'main-agent-ask'
export const GIT_SNAPSHOT_RULE = 'git-snapshot'
export const DESIGN_RELEASE_RULE = 'design-before-release'
export const GRAPH_RELAY_RULE = 'main-agent-graph-relay'
export const GRAPH_OPTIONS_RULE = 'main-agent-graph-options'
export const GRAPH_DELEGATIONS_RULE = 'main-agent-graph-delegations'
export const GRAPH_STAGE_RULE = 'main-agent-graph-stage'
export const GRAPH_CLI_RULE = 'main-agent-graph-cli'
export const NO_WAIT_RULE = 'main-agent-no-wait'

export const MAIN_AGENT_RULES: readonly MainAgentRule[] = [
  { id: NO_WRITE_RULE, title: '主 Agent 不写文件', enforcement: 'deny', subjects: 'main-agent', step: 4 },
  { id: ASK_RULE, title: '主 Agent 不出问答卡', enforcement: 'deny', subjects: 'main-agent', step: 4 },
  { id: GIT_SNAPSHOT_RULE, title: '会丢工作的 git 命令先存档，存不了才拦；存档不推到远端', enforcement: 'deny-when-no-snapshot', subjects: 'main-agent', step: 4 },
  { id: DESIGN_RELEASE_RULE, title: '放行之前（目标或模块），主 Agent 派出去的 agent 只读', enforcement: 'deny', subjects: 'main-agent-subagents', step: 5 },
  { id: GRAPH_RELAY_RULE, title: '转述的人话要在人发来的消息里；子 agent 不转述人的话', enforcement: 'deny', subjects: 'every-session', step: 6 },
  { id: GRAPH_OPTIONS_RULE, title: '主 Agent 不在图上给人写选项表', enforcement: 'deny', subjects: 'main-agent', step: 6 },
  { id: GRAPH_DELEGATIONS_RULE, title: '「这类你定」只经记录人的话的工具写', enforcement: 'deny', subjects: 'every-session', step: 6 },
  { id: GRAPH_STAGE_RULE, title: '目标只经确认需求与放行方案向前', enforcement: 'deny', subjects: 'every-session', step: 8 },
  { id: GRAPH_CLI_RULE, title: '会话里不用命令行写项目图', enforcement: 'deny', subjects: 'every-session', step: 8 },
  { id: NO_WAIT_RULE, title: '主 Agent 不长等：sleep、点名超 30 秒与 job 长等待都拦', enforcement: 'deny', subjects: 'main-agent', step: 9 },
]

/**
 * The one main agent rule the lift paths take off (the nowait design §3; the
 * other nine stay read-only, d-defaults-readonly): the guard_lift tool and
 * the rules board's lift service resolve `main-agent-no-wait` and
 * `design:main-agent-no-wait` to it, the listener stops judging a lifted
 * rule (src/guard/main-agent.ts), and the rules page shows the lift. The
 * shape mirrors a guard catalog entry's liftable fields.
 */
export const DESIGN_LIFTS: ReadonlyMap<string, { readonly title: string, readonly blocks: string }> = new Map([
  [NO_WAIT_RULE, { title: '主 Agent 不长等：sleep、点名超 30 秒与 job 长等待都拦', blocks: 'main agent shell and job waits' }],
])
