/**
 * glm-hourness/env row entry (M4 design §7; docs/ORCHESTRATION.md §7.1,
 * §7.4, §7.6): at agent creation installs the environment notice
 * (notice.ts) — the project's tools from the graph's `env` branch, the
 * checks that run after edits, and the scratch area — at the session's
 * first step and whenever the branch changes; before the first notice for a
 * repository makes the project's `.llm/` git-ignored
 * (src/data/llm-ignore.ts), so the harness's runtime records never show up
 * in git; and once per repository and day counts the repository's
 * suppression comments into the project's `.llm/audit/
 * suppressions.jsonl` (suppressions.ts, m4-suppressions).
 *
 * For the loop board (m4-checks, design §6.1.2, §6.2, §6.8) it provides the
 * service `glmHournessEnv` (env-service.ts: the command of one approved
 * check line, which the board's check entries run), hands the board the event
 * `env.files-edited` (loop-entry.ts), and at each step of every agent emits
 * that event for the files the agent changed (edited.ts) when an entry of the
 * board hears it. M4's own check runner joins later. Ships disabled.
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { installStepNotice } from '../shared/step-notice.ts'
import { ensureLlmIgnored } from '../data/llm-ignore.ts'
import { projectOf } from '../data/project-root.ts'
import { provideRowHealth, sessionIdOf, type HealthState, type RowHealth } from '../shared/health.ts'
import type { AgentLike, ProvideHost, ServiceLookup, SessionLike } from '../shared/dsh-min.ts'
import { graphService } from '../graph/service.ts'
import { installContribution } from '../loops/service.ts'
import { installFilesEdited } from './edited.ts'
import { createEnvService, ENV_SERVICE } from './env-service.ts'
import { envContribution, ENV_ROW_SOURCE, FILES_EDITED_EVENT } from './loop-entry.ts'
import { envNotice } from './notice.ts'
import { dailySuppressions, type SuppressionRecord } from './suppressions.ts'

/** The row's context: the agent lifecycle event, service lookup and provision, and cordis inject when the host has it. */
export interface EnvContext extends ServiceLookup, Partial<ProvideHost> {
  /** cordis inject: the loop board's service is package-provided, so the row reaches it by name (design §6.8). */
  inject?(names: readonly string[], callback: (sub: ServiceLookup) => (() => void) | void): unknown
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

/** Install the environment notice on one agent, and settle the repository work (ignore, daily count) once. */
export function installEnvNotice(ctx: EnvContext, agent: AgentLike, health: RowHealth): (() => void) | undefined {
  const session = agent.session
  if (session === undefined) {
    console.warn(`${name}: environment notice not installed for agent ${agent.id}: no session`)
    return undefined
  }
  const sessionId = sessionIdOf(agent)
  const settled = installWork(ctx, session, health, sessionId)
  const uninstall = installStepNotice(agent, 'environment notice', () => true, async (history, { session: stepSession }) => {
    await settled
    return await envNotice(ctx, history, stepSession)
  }, 'env')
  return uninstall ?? undefined
}

/**
 * The first-install work for one session's repository, in order: the
 * `.llm/` ignore (its outcome goes to the row health), then the daily
 * suppression count in the background. The count is fire-and-forget: a
 * failure reaches the row health, never a step.
 */
function installWork(ctx: EnvContext, session: SessionLike, health: RowHealth, sessionId: string | undefined): Promise<void> {
  return (async () => {
    const cwd = session.header.cwd
    const root = typeof cwd === 'string' ? projectOf(cwd)?.root : undefined
    const outcome = root === undefined ? undefined : await ensureLlmIgnored(root)
    if (sessionId !== undefined) health.report(sessionId, ...envHealth(graphService(ctx)?.dirFor(cwd), outcome))
    if (root === undefined) return
    void dailySuppressions(root, record => appendSuppression(root, record), {
      lastRecord: () => lastSuppression(root),
      problem: (message) => {
        if (sessionId !== undefined) health.report(sessionId, 'degraded', `压制注释计数失败：${message}`)
        console.warn(`${name}: suppression count failed: ${message}`)
      },
    }).catch(() => {})
  })()
}

/** The last record of the repository's suppression journal, undefined when there is none. */
async function lastSuppression(root: string): Promise<SuppressionRecord | undefined> {
  try {
    const lines = (await readFile(join(root, '.llm', 'audit', 'suppressions.jsonl'), 'utf8')).split('\n').filter(line => line.trim() !== '')
    return lines.at(-1) === undefined ? undefined : JSON.parse(lines.at(-1)!) as SuppressionRecord
  }
  catch {
    return undefined
  }
}

/** Append one count record to the repository's `.llm/audit/suppressions.jsonl`. */
async function appendSuppression(root: string, record: SuppressionRecord): Promise<void> {
  const file = join(root, '.llm', 'audit', 'suppressions.jsonl')
  await mkdir(dirname(file), { recursive: true })
  await appendFile(file, `${JSON.stringify(record)}\n`)
}

/** Provide `glmHournessEnv`; the disposer withdraws it. A host without provide, or a failing one, is the reason returned instead. */
function provideEnvService(ctx: EnvContext): (() => void) | string {
  if (typeof ctx.provide !== 'function') return '宿主没有 provide：循环板读不到检查命令，它的 check 条目一律 check-missing'
  try {
    return ctx.provide(ENV_SERVICE, createEnvService(ctx))
  }
  catch (error) {
    return `${ENV_SERVICE} 没提供上（${error instanceof Error ? error.message : String(error)}）：循环板的 check 条目一律 check-missing`
  }
}

/** cordis plugin entry. */
export function apply(ctx: EnvContext): () => void {
  const provided = provideEnvService(ctx)
  const notProvided = typeof provided === 'string' ? provided : undefined
  if (notProvided !== undefined) console.warn(`${name}: ${notProvided}`)
  const loaded = '已加载；环境提醒在会话第一步与环境分支变化后的下一步注入'
  const health = provideRowHealth(ctx, 'env', notProvided === undefined ? 'active' : 'degraded', notProvided === undefined ? loaded : `${loaded}；${notProvided}`)
  const disposers: Array<() => void> = [() => { health.dispose() }]
  if (typeof provided === 'function') disposers.push(provided)
  const installed = new WeakSet<AgentLike>()
  disposers.push(ctx.on('agent/created', ({ agent }) => {
    if (installed.has(agent)) return
    installed.add(agent)
    try {
      const notice = installEnvNotice(ctx, agent, health)
      if (notice !== undefined) disposers.push(notice)
      const edited = installFilesEdited(ctx, agent, (sessionId, problem) => { health.note(sessionId, 'files-edited', problem) })
      if (edited !== undefined) disposers.push(edited)
    }
    catch (error) {
      // One agent's notice must never break agent creation.
      console.warn(`${name}: environment notice not installed for agent ${agent.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }))
  // The event of changed files on the loop board (design §6.8): warned once and kept on the activation line when refused.
  disposers.push(installContribution(ctx, ENV_ROW_SOURCE, envContribution, FILES_EDITED_EVENT.id, (message) => {
    console.warn(`${name}: ${message}`)
    health.reactivate('degraded', message)
  }))
  return () => {
    for (const disposer of disposers.splice(0).reverse()) disposer()
  }
}
