/**
 * The takeover service `glmHournessBootstrap` (takeover design 0.6 §3.1,
 * §4, §5.1): `prepare` opens a takeover (or hands back the open one) after
 * the deterministic part, and `holds` tells M3's stage reminder that a goal
 * is the takeover's to steer. The per-step work of the row lives here too:
 * on every step of the main agent with an open takeover it reads the
 * journal and the graph, proposes the three norm templates under the anchor
 * as `harness` (§4.2), notes when M3 never asked `holds` (F44), and builds
 * the reminder. `wants`, the `wish` trigger and the `holdWish` of the
 * result arrive with M3's two seams (their caller); until then the takeover
 * is opened by `/hourness-init` on the transition path (§3.1, last part).
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { projectOf } from '../data/project-root.ts'
import { openEngine } from '../graph/engine.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import { loadGraph } from '../graph/store.ts'
import type { AgentLike, DerivedMessage, DesignInvocationLike, SessionLike, UserNotice } from '../shared/dsh-min.ts'
import type { HealthState } from '../shared/health.ts'
import { anchorOf, gapsOf, proposedSince, proposedSinceOpen } from './gaps.ts'
import { startNotice, stepReminder, type ReminderFacts } from './notice.ts'
import { writeScan } from './scan.ts'
import { settleWorkspace } from './setup.ts'
import { appendTakeover, openTakeover, openTakeoverOf, takeoverDir, type OpenTakeover, type TakeoverPath, type TakeoverRecord } from './takeover.ts'
import { NORM_TEMPLATES } from './templates.ts'

export const BOOTSTRAP_SERVICE = 'glmHournessBootstrap'

/** How a takeover is asked for: `/hourness-init`, with the path the person chose when they gave one. */
interface PrepareRequest {
  readonly trigger: 'init'
  readonly path?: 'new' | 'existing'
}

type PrepareResult =
  | { readonly ok: false, readonly text: string }
  | {
    readonly ok: true
    /** The path decision, what was done and the next step, for the command result (Chinese). */
    readonly text: string
    /** The takeover-start notice; none on the new-project path. */
    readonly notice?: UserNotice
  }

interface BootstrapService {
  prepare(invocation: DesignInvocationLike, request: PrepareRequest): Promise<PrepareResult>
  /** Whether the goal belongs to the open takeover of an existing project or of the gaps (sync, from memory). */
  holds(cwd: string, goalId: string): boolean
}

/** The labels of the three paths in the person's words. */
export const PATH_LABELS: Readonly<Record<TakeoverPath, string>> = { new: '新项目', existing: '已有项目', gaps: '补缺' }

/** The note when M3's stage reminder never asked `holds` (§9.1, F44). */
export const STAGE_NOTE = { code: 'stage-reminder-not-yielded', text: 'M3 does not yet yield its stage reminder to the takeover; expected on the transition path' } as const

/** Steps with an anchor after which a takeover that was never asked `holds` gets the note. */
const STAGE_NOTE_STEPS = 3

/** Failed proposals of one norm after which the row stops trying (§4.2). */
const NORM_ATTEMPTS = 3

export interface BootstrapDeps {
  /** The graph row's `dirFor`; undefined while the graph row is off. */
  readonly graphDir: (cwd: string | undefined) => string | undefined
  /** The user's home directory (never a project). */
  readonly home: () => string
  /** Install the row's per-agent listeners; nothing when they are installed already. */
  readonly install: (agent: AgentLike) => void
  readonly report: (agent: AgentLike, state: HealthState, reason: string) => void
}

/** What the row knows of one project between steps, for `holds`. */
interface Live {
  takeover: OpenTakeover
  goals: ReadonlySet<string>
  anchorSteps: number
  asked: boolean
}

const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

/** How many commits `history.tsv` lists; 0 when it is not there. */
async function historyLines(root: string, id: string): Promise<number> {
  try {
    return (await readFile(join(takeoverDir(root, id), 'history.tsv'), 'utf8')).split('\n').filter(line => line !== '').length
  }
  catch {
    return 0
  }
}

/** The facts of a reminder for the takeover as the graph is now. */
async function factsOf(root: string, takeover: OpenTakeover, graph: LoadedGraph): Promise<ReminderFacts> {
  const anchor = anchorOf(graph, takeover.openedAt)
  return {
    takeover: { id: takeover.id, path: takeover.path },
    history: await historyLines(root, takeover.id),
    ...anchor === undefined ? {} : { anchor },
    proposed: proposedSince(graph, takeover.openedAt),
    missing: takeover.path === 'gaps' ? gapsOf(graph).missing.map(gap => gap.id) : [],
  }
}

export interface BootstrapRuntime {
  readonly service: BootstrapService
  /** The step builder of one agent's reminder (src/shared/step-notice.ts). */
  step(agent: AgentLike, history: readonly DerivedMessage[], admitted: readonly unknown[], session: SessionLike): Promise<UserNotice | undefined>
  /** Forget a project's takeover (it was closed by /hourness-init off). */
  forget(root: string): void
}

export function bootstrapRuntime(deps: BootstrapDeps): BootstrapRuntime {
  const live = new Map<string, Live>()
  const failures = new Map<string, number>()

  /** Propose the norm templates missing under the anchor as the harness; whether any was written. */
  const writeNorms = async (root: string, takeover: OpenTakeover, graph: LoadedGraph, anchor: string, agent: AgentLike): Promise<boolean> => {
    const records: TakeoverRecord[] = []
    let wrote = false
    for (const template of NORM_TEMPLATES) {
      if (graph.nodes.has(template.id)) continue
      const key = `${root}\n${template.id}`
      if ((failures.get(key) ?? 0) >= NORM_ATTEMPTS) continue
      const result = await openEngine(takeover.graphDir).apply('harness', { op: 'propose', reason: `接管 ${takeover.id}：规范模板 ${template.id}`, node: { type: 'norm', id: template.id, title: template.title, parent: anchor, body: template.body } })
      if (result.ok) {
        wrote = true
        records.push({ op: 'setup', data: { item: `norm:${template.id}`, action: 'created' } })
        continue
      }
      if (result.error.code === 'conflict') continue
      const count = (failures.get(key) ?? 0) + 1
      failures.set(key, count)
      records.push({ op: 'setup', data: { item: `norm:${template.id}`, action: 'failed', detail: `${result.error.code}: ${result.error.message}`.slice(0, 300) } })
      if (count >= NORM_ATTEMPTS) deps.report(agent, 'degraded', `规范模板 ${template.id} 连续 ${count} 次没写上（${result.error.code}），不再试`)
    }
    await appendTakeover(root, takeover.id, records).catch((error: unknown) => { deps.report(agent, 'degraded', `接管流水的记录写不进：${message(error)}`) })
    return wrote
  }

  const service: BootstrapService = {
    async prepare(invocation, request) {
      const session = invocation.agent.session
      const cwd = session.header.cwd
      if (typeof cwd !== 'string') return { ok: false, text: '这个会话没有工作目录' }
      const graphDir = deps.graphDir(cwd)
      if (graphDir === undefined) return { ok: false, text: '项目图行 glm-hourness/graph 没有启用' }
      const settled = await settleWorkspace(cwd, graphDir, deps.home())
      if (!settled.ok) return settled
      const { root, scan, decision } = settled
      const path: TakeoverPath = decision.path === 'gaps' ? 'gaps' : request.path ?? decision.path
      const because = decision.note === undefined ? decision.reason : `${decision.reason}；${decision.note}`
      const by = { session: session.id, commandId: invocation.commandId }
      const head = scan.scan.git.state === 'repo' ? scan.scan.git.head : undefined
      const opened = await openTakeover(root, { path, because, trigger: request.trigger, projectRoot: root, graphDir, ...head === undefined ? {} : { head }, by })
      if (opened.kind === 'io') return { ok: false, text: `接管流水写不进（${opened.message}）：接管没有开` }
      const { takeover } = opened
      const warnings = [...settled.warnings]
      try {
        await writeScan(takeoverDir(root, takeover.id), scan)
        await appendTakeover(root, takeover.id, [...settled.setup, { op: 'scan', data: { files: scan.files.length, truncated: [...scan.scan.truncated], ms: scan.scan.ms } }], by)
      }
      catch (error) {
        warnings.push(`扫描结果或接管流水写不进：${message(error)}`)
      }
      deps.report(invocation.agent, warnings.length > 0 ? 'degraded' : 'active', warnings.length > 0 ? warnings.join('；') : `接管 ${takeover.id} 开着（${PATH_LABELS[takeover.path]}）`)
      deps.install(invocation.agent)
      const graph = await loadGraph(graphDir)
      const facts = await factsOf(root, takeover, graph)
      const gaps = takeover.path === 'gaps' ? gapsOf(graph) : undefined
      const lines = [
        `${opened.kind === 'resumed' ? '接着做开着的接管' : '开了接管'} ${takeover.id}（${PATH_LABELS[takeover.path]}）：${opened.kind === 'resumed' ? '' : `${because}。`}`,
        ...settled.done.length === 0 ? [] : [`做了：${settled.done.join('，')}。`],
        ...gaps === undefined ? [] : [`缺：${gaps.missing.map(gap => gap.id).join('、') || '没有'}。`, ...gaps.rejected.map(node => `你拒过 ${node.title}（${node.id}）：要的话在面板里恢复它。`), ...gaps.wrongType.map(node => `${node.id} 是一个 ${node.type}，不是接管要的类型：没有动它。`)],
        ...warnings,
        takeover.path === 'new' ? '说一句你想做成什么，主 Agent 从这里开始问你。' : '主 Agent 开始读这个项目。',
      ]
      live.set(root, { takeover, goals: new Set(), anchorSteps: 0, asked: false })
      return { ok: true, text: lines.join('\n'), ...takeover.path === 'new' ? {} : { notice: startNotice(facts) } }
    },
    holds(cwd, goalId) {
      const root = projectOf(cwd, deps.home())?.root
      const known = root === undefined ? undefined : live.get(root)
      if (known === undefined) return false
      known.asked = true
      return known.takeover.path !== 'new' && known.goals.has(goalId)
    },
  }

  return {
    service,
    forget: (root) => { live.delete(root) },
    async step(agent, history, admitted, session) {
      const cwd = session.header.cwd
      const root = typeof cwd === 'string' ? projectOf(cwd, deps.home())?.root : undefined
      if (root === undefined) return undefined
      let takeover: OpenTakeover | undefined
      try {
        takeover = await openTakeoverOf(root)
      }
      catch (error) {
        deps.report(agent, 'degraded', `接管流水读不出：${message(error)}`)
        return undefined
      }
      if (takeover === undefined) {
        live.delete(root)
        return undefined
      }
      let graph = await loadGraph(takeover.graphDir)
      const anchor = anchorOf(graph, takeover.openedAt)
      if (anchor !== undefined && await writeNorms(root, takeover, graph, anchor, agent)) graph = await loadGraph(takeover.graphDir)
      const goals = new Set([...graph.nodes.values()].filter(node => node.type === 'goal' && proposedSinceOpen(graph, node.id, takeover.openedAt)).map(node => node.id))
      const previous = live.get(root)
      const known: Live = previous?.takeover.id === takeover.id ? Object.assign(previous, { takeover, goals }) : { takeover, goals, anchorSteps: 0, asked: false }
      live.set(root, known)
      if (anchor !== undefined && takeover.path !== 'new') known.anchorSteps += 1
      if (known.anchorSteps >= STAGE_NOTE_STEPS && !known.asked && !takeover.noted.includes(STAGE_NOTE.code)) {
        await appendTakeover(root, takeover.id, [{ op: 'note', data: { ...STAGE_NOTE } }]).catch((error: unknown) => { deps.report(agent, 'degraded', `接管流水的记录写不进：${message(error)}`) })
      }
      return stepReminder(history, admitted, await factsOf(root, takeover, graph))
    },
  }
}
