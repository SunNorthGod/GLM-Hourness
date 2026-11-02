/**
 * glm-hourness/env row entry (M4 design §7; docs/ORCHESTRATION.md §7.1,
 * §7.4): at agent creation installs the environment notice (notice.ts) —
 * the project's tools from the graph's `env` branch, the checks that run
 * after edits, and the scratch area — at the session's first step and
 * whenever the branch changes; and before the first notice for a repository
 * makes the project's `.llm/` git-ignored (src/shared/llm-ignore.ts), so
 * the harness's runtime records never show up in git. The check runner
 * (m4-checks) and the suppression count (m4-suppressions) join later.
 * Ships disabled: the row registers nothing model-facing until then.
 */
import { installStepNotice } from '../shared/step-notice.ts'
import { ensureLlmIgnored } from '../data/llm-ignore.ts'
import { projectOf } from '../data/project-root.ts'
import { provideRowHealth, sessionIdOf, type HealthState, type RowHealth } from '../shared/health.ts'
import type { AgentLike, ProvideHost, ServiceLookup, SessionLike } from '../shared/dsh-min.ts'
import { graphService } from '../graph/service.ts'
import { envNotice } from './notice.ts'

/** The row's context: the agent lifecycle event and service lookup. */
export interface EnvContext extends ServiceLookup, Partial<ProvideHost> {
  /** Awaited serially before agent creation resolves; the first step sees the effects. */
  on(event: 'agent/created', listener: (payload: { agent: AgentLike }) => Promise<void> | void): () => void
}

/** cordis plugin identity. */
export const name = 'dsh-glm-hourness/env'

/** Row health for one session: where the notice read its branch, and the state of the `.llm/` ignore. */
export function envHealth(graph: string | undefined, ignore: { readonly kind: 'ignored', readonly appended: boolean } | { readonly kind: 'no-git' } | { readonly kind: 'unwritable' | 'visible', readonly reason: string } | undefined): [HealthState, string] {
  const parts = [
    ...(graph === undefined ? ['环境提醒无项目图，只带草稿区一行'] : [`环境提醒读图 ${graph}`]),
    ...(ignore === undefined ? [] : ignore.kind === 'ignored' && ignore.appended ? ['已把 .llm/ 写进 .git/info/exclude'] : ignore.kind === 'visible' ? [`项目的 .llm/ 没有被 git 忽略：${ignore.reason}`] : ignore.kind === 'unwritable' ? [`.llm/ 的忽略行写不进：${ignore.reason}`] : []),
  ]
  const degraded = ignore?.kind === 'visible' || ignore?.kind === 'unwritable'
  return degraded ? ['degraded', parts.join('；')] : ['active', parts.join('；')]
}

/** Install the environment notice on one agent, and settle the `.llm/` ignore of its repository once. */
export function installEnvNotice(ctx: EnvContext, agent: AgentLike, health: RowHealth): (() => void) | undefined {
  const session = agent.session
  if (session === undefined) {
    console.warn(`${name}: environment notice not installed for agent ${agent.id}: no session`)
    return undefined
  }
  const sessionId = sessionIdOf(agent)
  const settled = ignoreOutcome(ctx, session, health, sessionId)
  const uninstall = installStepNotice(agent, 'environment notice', () => true, async (history, { session: stepSession }) => {
    await settled
    return await envNotice(ctx, history, stepSession)
  }, 'env')
  return uninstall ?? undefined
}

/** The repository's ignore outcome, reported once to the session's row health. */
function ignoreOutcome(ctx: EnvContext, session: SessionLike, health: RowHealth, sessionId: string | undefined): Promise<void> {
  return (async () => {
    const cwd = session.header.cwd
    const root = typeof cwd === 'string' ? projectOf(cwd)?.root : undefined
    const outcome = root === undefined ? undefined : await ensureLlmIgnored(root)
    if (sessionId !== undefined) health.report(sessionId, ...envHealth(graphService(ctx)?.dirFor(cwd), outcome))
  })()
}

/** cordis plugin entry. */
export function apply(ctx: EnvContext): () => void {
  const health = provideRowHealth(ctx, 'env', 'active', '已加载；环境提醒在会话第一步与环境分支变化后的下一步注入')
  const disposers: Array<() => void> = [() => { health.dispose() }]
  const installed = new WeakSet<AgentLike>()
  disposers.push(ctx.on('agent/created', ({ agent }) => {
    if (installed.has(agent)) return
    installed.add(agent)
    try {
      const uninstall = installEnvNotice(ctx, agent, health)
      if (uninstall !== undefined) disposers.push(uninstall)
    }
    catch (error) {
      // One agent's notice must never break agent creation.
      console.warn(`${name}: environment notice not installed for agent ${agent.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }))
  return () => {
    for (const disposer of disposers.splice(0).reverse()) disposer()
  }
}
