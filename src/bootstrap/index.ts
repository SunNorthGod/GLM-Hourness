/**
 * glm-hourness/bootstrap row entry (takeover design 0.6 §2.1, §3.2, §5.1;
 * docs/ORCHESTRATION.md §19): the command /hourness-init, the service
 * `glmHournessBootstrap`, and on every root agent a step notice that
 * reminds the main agent of the open takeover (src/bootstrap/runtime.ts
 * does the work; src/bootstrap/service.ts is the contract M3 reads). Until M3's /wish calls the takeover, a takeover opens on
 * the transition path: an empty graph directory, /wish without words, then
 * /hourness-init in the same session (§3.1). The row injects `commands`;
 * activation never throws: a registration that fails is a warning. Ships
 * disabled until the L3 probe and the first desktop pass.
 */
import { homedir } from 'node:os'
import { isMainAgentFor } from '../data/main-agent.ts'
import { projectOf } from '../data/project-root.ts'
import { holderHome, mainAgentOf } from '../graph/main-agent-holder.ts'
import { graphService } from '../graph/service.ts'
import { loadGraph } from '../graph/store.ts'
import type { AgentLike, CommandDefinitionLike, CommandResultLike, DesignInvocationLike, ProvideHost, ServiceLookup, SessionLike, UserNotice } from '../shared/dsh-min.ts'
import { activationState, provideRowHealth, sessionIdOf, type HealthState } from '../shared/health.ts'
import { installStepNotice } from '../shared/step-notice.ts'
import { rulesService } from '../rules/service.ts'
import { anchorOf, gapsOf, lacksAnything, proposedSince } from './gaps.ts'
import { pathNotice } from './notice.ts'
import { hasProjectGraph } from './path.ts'
import { PATH_LABELS, STAGE_NOTE, bootstrapRuntime, type BootstrapRuntime } from './runtime.ts'
import { BOOTSTRAP_SERVICE } from './service.ts'
import { settleWorkspace, trackedFiles, untrackedNodeFiles } from './setup.ts'
import { appendTakeover, openTakeoverOf, type OpenTakeover } from './takeover.ts'
import { thingLines, thingStates } from './things.ts'
import { readTrialFile, sweepTrialDirs } from './trial.ts'
import { TRIAL_MINUTES_DEFAULT } from './trial-plan.ts'
import { trialStatusLines } from './trial-round.ts'
import { emitMetric, type EmittedEvent } from '../shared/metrics.ts'
import { sandboxOf } from '../shared/dsh-min.ts'

/** cordis plugin identity: needs the commands service. */
export const name = 'dsh-glm-hourness/bootstrap'

export const inject = ['commands']

export const INIT_COMMAND = 'hourness-init'

/** The reply to /hourness-init without a graph in a session that is not the main agent (F46): a success, the panel's button must not look failed. */
export const NOT_MAIN_REPLY = '发 /wish 开始接管；如果它只让这个会话当了主 Agent、没有开始读项目，再发一次 /hourness-init'

/** The row's context: the commands service, the agent lifecycle event, and service lookup. */
export interface BootstrapContext extends ServiceLookup, Partial<ProvideHost> {
  readonly commands: { register(definition: CommandDefinitionLike<DesignInvocationLike>): () => void }
  on(event: 'agent/created', listener: (payload: { agent: AgentLike }) => Promise<void> | void): () => void
}

const ARGUMENTS = ['status', 'new', 'existing', 'off'] as const
type Argument = typeof ARGUMENTS[number] | ''

const fail = (text: string): CommandResultLike => ({ kind: 'error', text })
const done = (text: string): CommandResultLike => ({ kind: 'success', text })
const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

/**
 * Whether the agent is this project's main agent for the takeover: the
 * holder record names its session and its mode is on. Unlike the memory and
 * lessons reminders, no record is not "every root agent": a takeover
 * steers one session only (`d-one-main-agent`).
 */
function isMainAgent(ctx: ServiceLookup, agent: { readonly session?: SessionLike | undefined }): boolean {
  const judged = isMainAgentFor(ctx, agent)
  return judged.main && judged.note === undefined
}

/** Hand a notice to the agent: into the running step, or as the next turn of an idle agent (agent-loop:790–814). */
function deliver(agent: DesignInvocationLike['agent'], notice: UserNotice): void {
  if (agent.status === 'running') agent.steer(notice)
  else agent.followup(notice)
}

/** `/hourness-init status` (or no argument) while a takeover is open: what it is at, without writing anything. */
async function openStatus(takeover: OpenTakeover, root: string): Promise<string> {
  const graph = await loadGraph(takeover.graphDir)
  const { total, byType } = proposedSince(graph, takeover.openedAt)
  const counts = Object.entries(byType).sort(([a], [b]) => a.localeCompare(b)).map(([type, count]) => `${type} ${count}`).join('、')
  const anchor = anchorOf(graph, takeover.openedAt)
  return [
    `接管 ${takeover.id} 开着（${PATH_LABELS[takeover.path]}）：这次接管已提 ${total} 个节点${total === 0 ? '' : `（${counts}）`}。`,
    anchor === undefined ? '还没有锚点：主 Agent 提的第一个目标就是锚点，三个规范挂在它下面。' : `锚点 ${anchor}：三个规范挂在它下面。`,
    ...thingLines(thingStates(graph, takeover)),
    ...trialStatusLines(readTrialFile(root, takeover.id)),
    ...takeover.noted.includes(STAGE_NOTE.code) ? ['设计行的阶段提醒还没有对接管让位：主 Agent 照接管的提醒走。'] : [],
    takeover.path === 'new' ? '下一步：主 Agent 在访谈里问你。' : '下一步：主 Agent 读项目、提节点。',
  ].join('\n')
}

export function initCommand(ctx: BootstrapContext, runtime: BootstrapRuntime, home: () => string): CommandDefinitionLike<DesignInvocationLike> {
  const start = async (invocation: DesignInvocationLike, path: 'new' | 'existing' | undefined): Promise<CommandResultLike> => {
    const result = await runtime.service.prepare(invocation, { trigger: 'init', ...path === undefined ? {} : { path } })
    if (!result.ok) return fail(result.text)
    if (result.notice !== undefined) deliver(invocation.agent, result.notice)
    return done(result.text)
  }

  const withOpen = async (invocation: DesignInvocationLike, input: Argument, takeover: OpenTakeover, root: string): Promise<CommandResultLike> => {
    const by = { session: invocation.agent.session.id, commandId: invocation.commandId }
    if (input === '' || input === 'status') return done(await openStatus(takeover, root))
    if (input === 'off') {
      const graph = await loadGraph(takeover.graphDir)
      await appendTakeover(root, takeover.id, [{ op: 'takeover-closed', data: { reason: 'abandoned', counts: { proposed: proposedSince(graph, takeover.openedAt).total } } }], by)
      runtime.forget(root)
      return done([
        '已放弃这次接管：已经提的节点与交给你的几件事留在『需要你』里，你可以在面板上看、在对话里让主 Agent 处理',
        ...takeover.wish === undefined ? [] : [`你当时许的愿「${takeover.wish}」没有交出去，要的话再发 /wish`],
      ].join('\n'))
    }
    if (takeover.path === 'gaps') return fail('这里已经有项目图：/hourness-init 只补缺，不改判')
    if (takeover.path === input) return done(`这次接管本来就按${PATH_LABELS[input]}做`)
    const graph = await loadGraph(takeover.graphDir)
    await appendTakeover(root, takeover.id, [{ op: 'takeover-path', data: { from: takeover.path, to: input, commandId: invocation.commandId } }], by)
    deliver(invocation.agent, pathNotice(takeover, input))
    return done(`改判为${PATH_LABELS[input]}：主 Agent 下一步按这条路做；已经提的 ${proposedSince(graph, takeover.openedAt).total} 个节点留着，清单上会列出`)
  }

  const handler = async (invocation: DesignInvocationLike): Promise<CommandResultLike> => {
    const raw = invocation.rawInput.trim()
    if (raw !== '' && !(ARGUMENTS as readonly string[]).includes(raw)) return fail('/hourness-init 只认四个参数：status、new、existing、off（或不带参数）')
    const input = raw as Argument
    const session = invocation.agent.session
    if (session.header.origin === 'subagent') return fail('子 agent 的会话不能接管项目')
    const cwd = session.header.cwd
    if (typeof cwd !== 'string' || cwd === '') return fail('这个会话没有工作目录')
    const graphDir = graphService(ctx)?.dirFor(cwd)
    if (graphDir === undefined) return fail('项目图行 glm-hourness/graph 没有启用')
    const root = projectOf(cwd, home())?.root
    let open: OpenTakeover | undefined
    try {
      open = root === undefined ? undefined : await openTakeoverOf(root)
    }
    catch (error) {
      return fail(`接管流水读不出：${message(error)}`)
    }
    try {
      if (open !== undefined && root !== undefined) return await withOpen(invocation, input, open, root)
    }
    catch (error) {
      return fail(`接管流水写不进：${message(error)}`)
    }
    if (input === 'off') return done('没有开着的接管')
    const main = isMainAgent(ctx, invocation.agent)
    if (!hasProjectGraph(graphDir)) {
      if (input === 'status') return done('还没接管：发 /wish 开始')
      if (activationState(ctx, 'design') === 'absent') {
        // Without the design row there is no main agent to read the project: only the deterministic part (§13).
        const settled = await settleWorkspace(cwd, graphDir, home())
        if (!settled.ok) return fail(settled.text)
        return done([...settled.done.length === 0 ? [] : [`做了：${settled.done.join('，')}。`], '读项目要主 Agent（glm-hourness/design）：这一行没有启用，接管只做了目录与忽略'].join('\n'))
      }
      if (!main) return done(NOT_MAIN_REPLY)
      return start(invocation, input === 'new' || input === 'existing' ? input : undefined)
    }
    if (input === 'new' || input === 'existing') return fail('这里已经有项目图：/hourness-init 只补缺，不改判')
    const gaps = gapsOf(await loadGraph(graphDir), root === undefined ? [] : await trackedFiles(root))
    const untracked = root === undefined ? undefined : await untrackedNodeFiles(root, graphDir)
    const untrackedLine = untracked !== undefined && untracked > 0 ? [`项目图还有 ${untracked} 个节点文件没进 git`] : []
    const lacking = [...gaps.missing.map(gap => gap.id), ...gaps.unchecked.length === 0 ? [] : [`${gaps.unchecked.map(extension => `*${extension}`).join('、')} 的检查`]].join('、')
    if (input === 'status') return done([lacksAnything(gaps) ? `缺：${lacking}` : '已经接管过', ...untrackedLine].join('\n'))
    if (!lacksAnything(gaps)) return done(['这个项目已经接管过了', ...untrackedLine].join('\n'))
    if (!main) {
      const holder = mainAgentOf(holderHome(ctx), graphDir)
      return holder !== undefined && holder.sessionId !== session.id
        ? fail(`这个项目的主 Agent 在另一个会话里（id ${holder.sessionId.slice(0, 8)}）：到那里发 /hourness-init，或在这里发 /wish here 把它移过来`)
        : fail('先发 /wish 让这个会话当主 Agent，再发 /hourness-init')
    }
    return start(invocation, undefined)
  }

  return {
    definitionId: 'dsh-glm-hourness/bootstrap',
    name: INIT_COMMAND,
    description: '接管这个项目：没有项目图时开始接管（也可以用 /wish）；有图时补上缺的规范、门禁与检查器；status 看进度；new、existing 改判；off 放弃这次接管',
    input: { hint: 'status | new | existing | off' },
    handler,
  }
}

/** Row config: `trialMinutes`, the total of one trial round (1–240 whole minutes, default 45; §2.1). */
export interface BootstrapConfig {
  readonly trialMinutes?: unknown
}

/** The configured total, or the default when it is not a whole number in 1–240. */
export function trialMinutesOf(config: BootstrapConfig): number {
  const value = config.trialMinutes
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 240 ? value : TRIAL_MINUTES_DEFAULT
}

/** cordis plugin entry. */
export function apply(ctx: BootstrapContext, config: BootstrapConfig = {}): () => void {
  const health = provideRowHealth(ctx, 'bootstrap', 'active', '已加载；/hourness-init 开接管，接管开着时每步提醒主 Agent')
  const disposers: Array<() => void> = [() => { health.dispose() }]
  const report = (agent: AgentLike, state: HealthState, reason: string): void => {
    const id = sessionIdOf(agent)
    if (id !== undefined) health.report(id, state, reason)
  }
  const installed = new WeakSet<AgentLike>()
  const install = (agent: AgentLike): void => {
    if (installed.has(agent) || agent.session?.header.origin === 'subagent') return
    installed.add(agent)
    try {
      const uninstall = installStepNotice(agent, 'takeover reminder', () => isMainAgent(ctx, agent), async (history, { admitted, session }) => {
        try {
          return await runtime.step(agent, history, admitted, session)
        }
        catch (error) {
          // A takeover that cannot be read never takes a step down.
          report(agent, 'degraded', `接管提醒这一步没带上：${message(error)}`)
          return undefined
        }
      }, 'bootstrap')
      if (uninstall !== undefined) disposers.push(uninstall)
    }
    catch (error) {
      console.warn(`${name}: takeover reminder not installed for agent ${agent.id}: ${message(error)}`)
    }
  }
  // The rules board can take a rule through the human's agreement once its service has the members of that path (src/rules/service.ts); today it has only `declaration`.
  const rulesWhole = (): boolean => {
    const service = rulesService(ctx) as unknown as Partial<Record<'attachable' | 'acceptProposal', unknown>> | undefined
    return typeof service?.attachable === 'function' && typeof service.acceptProposal === 'function'
  }
  const trial = {
    sandbox: () => sandboxOf(ctx),
    emit: (event: EmittedEvent, dir: string) => { emitMetric(ctx, event, { dir }) },
    notify: (agent: AgentLike, notice: UserNotice) => {
      const live = agent as Partial<DesignInvocationLike['agent']>
      try {
        if (live.status === 'running' && typeof live.steer === 'function') live.steer(notice)
        else if (typeof live.followup === 'function') live.followup(notice)
      }
      catch (error) {
        console.warn(`${name}: trial notice not delivered to agent ${agent.id}: ${message(error)}`)
      }
    },
    trialMinutes: trialMinutesOf(config),
  }
  const runtime = bootstrapRuntime({ graphDir: cwd => graphService(ctx)?.dirFor(cwd), home: homedir, install, report, rulesWhole, trial })
  // The residue of a host that died mid-round (§6.3): best effort, never in the way of activation.
  void sweepTrialDirs().then((swept) => {
    if (swept.left.length > 0) health.reactivate('degraded', `试跑目录删不掉：${swept.left.join('、').slice(0, 200)}`)
  }, () => undefined)
  try {
    if (typeof ctx.provide === 'function') disposers.push(ctx.provide(BOOTSTRAP_SERVICE, runtime.service))
    disposers.push(ctx.on('agent/created', ({ agent }) => { install(agent) }))
    disposers.push(ctx.commands.register(initCommand(ctx, runtime, homedir)))
  }
  catch (error) {
    console.warn(`${name}: activation incomplete: ${message(error)}`)
  }
  return () => {
    for (const disposer of disposers.splice(0).reverse()) disposer()
  }
}
