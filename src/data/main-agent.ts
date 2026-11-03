/**
 * Whether an agent is the main agent of its project, for the rows that speak
 * to the main agent only (M5 design §4.2.1: the candidate, recurrence and
 * learning reminders). Memory and lessons share this one function, and it is
 * the only place that decides: no row reads the holder record or the
 * projection itself.
 *
 * The holder record of the project (src/graph/main-agent-holder.ts) names one
 * session, and `mainAgentOf` returns it as written, even when that session's
 * main-agent mode has since been turned off. So a record that names this
 * session is checked against the session's own `hournessMainAgent`
 * projection too. Once the design work adds a reader that does both, this
 * function calls it and the projection check below goes.
 *
 * Without a design row there is no record to read, and then every root agent
 * counts: a reminder must not be lost because the role it is for does not
 * exist. The reason comes back for the row's health.
 */
import { MAIN_AGENT_KEY } from '../graph/main-agent.ts'
import { holderHome, mainAgentOf } from '../graph/main-agent-holder.ts'
import { graphService } from '../graph/service.ts'
import type { ServiceLookup, SessionLike, SessionProjectionsService } from '../shared/dsh-min.ts'

export interface MainAgentJudgement {
  readonly main: boolean
  /** What is not as it should be in reading the role (for the row's degraded health, in Chinese); absent when nothing is. */
  readonly note?: string
}

const NO_DESIGN_ROW = '所有根 agent 都按主 Agent 处理'

/** Whether the session's own projection says main-agent mode is on; otherwise why that cannot be said. */
function modeIsOn(ctx: ServiceLookup, session: SessionLike): { readonly on: boolean } | { readonly problem: string } {
  const projections = (typeof ctx.get === 'function' ? ctx.get('sessionProjections') : undefined) as Partial<SessionProjectionsService> | undefined
  if (typeof projections?.stateOf !== 'function') return { problem: '会话状态服务（sessionProjections）不在，读不到本会话的主 Agent 状态' }
  let state: unknown
  try {
    state = projections.stateOf(session, MAIN_AGENT_KEY)
  }
  catch (error) {
    return { problem: `读不到本会话的主 Agent 状态（${error instanceof Error ? error.message : String(error)}）` }
  }
  if (typeof state !== 'object' || state === null || typeof (state as { active?: unknown }).active !== 'boolean') return { problem: '本会话没有主 Agent 状态（投影未注册，或值不是 {active}）' }
  return { on: (state as { active: boolean }).active }
}

/**
 * Judge an agent. A delegated child and an agent without a session are not
 * the main agent. For a root agent: the holder record of its project names
 * the main agent session; if that is another session this is not the main
 * agent, if it is this session its own mode must be on too.
 */
export function isMainAgentFor(ctx: ServiceLookup, agent: { readonly session?: SessionLike | undefined }): MainAgentJudgement {
  const session = agent.session
  if (session === undefined || session.header.origin === 'subagent') return { main: false }
  try {
    const graph = graphService(ctx)
    if (graph === undefined) return { main: true, note: `项目图行没有启用，主 Agent 的记录读不到：${NO_DESIGN_ROW}` }
    const dir = graph.dirFor(session.header.cwd)
    if (dir === undefined) return { main: true, note: `本会话没有工作目录，找不到项目的主 Agent 记录：${NO_DESIGN_ROW}` }
    const holder = mainAgentOf(holderHome(ctx), dir)
    if (holder === undefined) return { main: true, note: `项目 ${dir} 没有可读的主 Agent 记录：${NO_DESIGN_ROW}` }
    if (holder.sessionId !== session.id) return { main: false }
    const mode = modeIsOn(ctx, session)
    if ('problem' in mode) return { main: false, note: mode.problem }
    return mode.on ? { main: true } : { main: false, note: '主 Agent 记录指向本会话，但本会话的主 Agent 模式已关' }
  }
  catch (error) {
    return { main: true, note: `读主 Agent 记录出错（${error instanceof Error ? error.message : String(error)}）：${NO_DESIGN_ROW}` }
  }
}
