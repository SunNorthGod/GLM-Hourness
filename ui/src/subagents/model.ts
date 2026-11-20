/**
 * Pure data-fusion and formatting model for the 「子智能体」 real-time
 * spectator dashboard and the FlowBar live subagent pill. No DOM, React, or
 * Node built-ins so both browser bundles and Node unit tests import it directly.
 */
import type { LiveCall, LiveView } from '../../../src/graph/live.ts'
import type { ExecuteLiveBoard } from '../../../src/shared/live-board.ts'
import type { ProjectionValues, RetainedSessionEventEntry, SubagentTimingView, TokenUsage } from '../dsh.ts'

export type { ExecuteLiveBoard }
export type DispatchMode = NonNullable<ExecuteLiveBoard['dispatchMode']>

type LiveDispatchEntry = ExecuteLiveBoard['dispatches'][number]
type LiveRequestEntry = ExecuteLiveBoard['requests'][number]
type LiveExternalJob = ExecuteLiveBoard['jobs'][number]

export const SUBAGENTS_TAB_KIND = 'glm-hourness-subagents'
export const SUBAGENTS_TAB_TITLE = '子智能体'

export type FleetFilter = 'all' | 'running' | 'attention' | 'done'

type FleetAgentStatus =
  | 'running'
  | 'waiting-approval'
  | 'waiting-main'
  | 'done'
  | 'error'
  | 'aborted'
  | 'lost'

interface FleetTokenBreakdown {
  readonly uncachedInput: number
  readonly output: number
  readonly cacheRead: number
  readonly cacheWrite: number
  readonly total: number
  readonly cacheHitPercent: number
}

export interface FleetAgentItem {
  readonly id: string
  readonly parentId: string
  readonly depth: number
  readonly name: string
  readonly mode: string
  readonly task: string | undefined
  readonly role: LiveDispatchEntry['role'] | 'subagent'
  readonly roleLabel: string
  readonly attempt: number | undefined
  readonly provider: string | null
  readonly providerLabel: string | null
  readonly model: string | null
  readonly worktree: string | undefined
  readonly branch: string | undefined
  readonly live: LiveView | undefined
  readonly timing: SubagentTimingView | undefined
  readonly tokens: FleetTokenBreakdown | undefined
  readonly openRequest: LiveRequestEntry | undefined
  readonly status: FleetAgentStatus
  readonly isRunning: boolean
  readonly needsAttention: boolean
  readonly activeSince: number | undefined
  readonly settledMs: number
  readonly activityLine: string
  readonly recentTools: readonly LiveCall[]
  readonly sortAt: number
}

export interface FleetJobItem {
  readonly id: string
  readonly kind: LiveExternalJob['kind']
  readonly label: string
  readonly status: LiveExternalJob['status']
  readonly isRunning: boolean
  readonly startedAt: number
  readonly endedAt: number | undefined
  readonly goalId: string | undefined
  readonly tasks: readonly string[]
  readonly flows: readonly string[]
  readonly mode: 'activation' | 'sync' | undefined
  readonly summary: string | undefined
}

export type PinnedAlert =
  | {
      readonly kind: 'request'
      readonly id: string
      readonly requestKind: 'plan' | 'question'
      readonly childId: string
      readonly task: string
      readonly since: number
      readonly title: string
      readonly detail: string
    }
  | {
      readonly kind: 'approval'
      readonly id: string
      readonly sessionId: string
      readonly name: string
      readonly toolName: string
      readonly since: number
      readonly title: string
      readonly detail: string
    }
  | {
      readonly kind: 'drive-wait'
      readonly id: string
      readonly code: string
      readonly title: string
      readonly detail: string
    }

export interface FleetGroup {
  readonly key: string
  readonly title: string
  readonly hasRunning: boolean
  readonly hasAttention: boolean
  readonly agents: readonly FleetAgentItem[]
  readonly jobs: readonly FleetJobItem[]
}

export interface FleetModel {
  readonly filter: FleetFilter
  readonly counts: {
    readonly all: number
    readonly running: number
    readonly attention: number
    readonly done: number
  }
  readonly slots: {
    readonly max: number
    readonly activeWorkers: number
    readonly glmWorkers: number
    readonly peakCap: number | undefined
  }
  readonly tokens: FleetTokenBreakdown
  readonly drive: ExecuteLiveBoard['drive'] | undefined
  readonly peak: ExecuteLiveBoard['peak'] | undefined
  readonly dispatchMode?: DispatchMode
  readonly alerts: readonly PinnedAlert[]
  readonly groups: readonly FleetGroup[]
  readonly discoveredIds: readonly string[]
}

interface SessionSummaryInput {
  readonly cwd?: string
  readonly title?: string
  readonly updatedAt?: number
  readonly projectionValues?: ProjectionValues
}

export interface BuildFleetInput {
  readonly rootSessionId: string
  readonly projections: Readonly<Record<string, { readonly values: ProjectionValues } | undefined>>
  readonly byId?: Readonly<Record<string, SessionSummaryInput | undefined>>
  readonly board: ExecuteLiveBoard | null
  readonly now: number
  readonly filter: FleetFilter
}

export interface DiscoveredChild {
  readonly id: string
  readonly parentId: string
  readonly depth: number
  readonly label: string | undefined
  readonly mode: string
  readonly createdAt: number | undefined
}

const CHILD_ID_WORK = /^hz-([a-z][a-z0-9-]{0,47})-a(\d+)-[0-9a-z]{6}$/
const CHILD_ID_ACC = /^hz-([a-z][a-z0-9-]{0,47})-acc-a(\d+)-[0-9a-z]{6}$/

function parseChildIdInfo(childId: string): { readonly task: string, readonly attempt: number, readonly acceptance: boolean } | undefined {
  const acc = CHILD_ID_ACC.exec(childId)
  if (acc?.[1] !== undefined && acc[2] !== undefined) return { task: acc[1], attempt: Number(acc[2]), acceptance: true }
  const work = CHILD_ID_WORK.exec(childId)
  if (work?.[1] !== undefined && work[2] !== undefined) return { task: work[1], attempt: Number(work[2]), acceptance: false }
  return undefined
}

export function subagentChatAddress(childId: string, parentId: string, mode: string): string {
  const normalizedMode = mode === 'continuable' || mode === 'one-shot' ? mode : 'unknown'
  return `dsh-resource://subagentchat/session/${encodeURIComponent(childId)}?parent=${encodeURIComponent(parentId)}&mode=${encodeURIComponent(normalizedMode)}`
}

export function formatProviderLabel(provider: string | null): string | null {
  if (provider === null || provider === '') return null
  if (provider === 'glm-zcode') return '个人套餐'
  if (provider === 'glm-start-plan') return '免费套餐'
  return provider
}

function formatRoleLabel(role: FleetAgentItem['role']): string {
  switch (role) {
    case 'worker': return '写手'
    case 'review': return '审查'
    case 'acceptance-review': return '整体验收'
    case 'check': return '检查'
    case 'subagent': return '子智能体'
  }
}

export function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000))
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const remSec = sec % 60
  if (min < 60) return remSec === 0 ? `${min}m` : `${min}m ${remSec}s`
  const hr = Math.floor(min / 60)
  const remMin = min % 60
  return `${hr}h ${String(remMin).padStart(2, '0')}m`
}

export function formatTokensCompact(value: number): string {
  const scaled = (count: number): string => count >= 100 ? String(Math.round(count)) : String(Math.round(count * 10) / 10)
  if (value < 1000) return String(Math.round(value))
  if (value < 1_000_000) return `${scaled(value / 1000)}K`
  return `${scaled(value / 1_000_000)}M`
}

function breakdownTokens(usage: TokenUsage | undefined): FleetTokenBreakdown | undefined {
  if (usage === undefined) return undefined
  const uncachedInput = Math.max(0, usage.uncachedInputTokens)
  const output = Math.max(0, usage.outputTokens)
  const cacheRead = Math.max(0, usage.cacheReadTokens)
  const cacheWrite = Math.max(0, usage.cacheWriteTokens)
  const totalInput = uncachedInput + cacheRead + cacheWrite
  const total = totalInput + output
  const cacheHitPercent = totalInput > 0 ? Math.round((cacheRead / totalInput) * 100) : 0
  return { uncachedInput, output, cacheRead, cacheWrite, total, cacheHitPercent }
}

const ZERO_TOKENS: FleetTokenBreakdown = {
  uncachedInput: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  total: 0,
  cacheHitPercent: 0,
}

function sumTokens(list: readonly (TokenUsage | undefined)[]): FleetTokenBreakdown {
  let uncachedInput = 0
  let output = 0
  let cacheRead = 0
  let cacheWrite = 0
  for (const usage of list) {
    if (usage === undefined) continue
    uncachedInput += Math.max(0, usage.uncachedInputTokens)
    output += Math.max(0, usage.outputTokens)
    cacheRead += Math.max(0, usage.cacheReadTokens)
    cacheWrite += Math.max(0, usage.cacheWriteTokens)
  }
  const totalInput = uncachedInput + cacheRead + cacheWrite
  const total = totalInput + output
  const cacheHitPercent = totalInput > 0 ? Math.round((cacheRead / totalInput) * 100) : 0
  return total === 0 ? ZERO_TOKENS : { uncachedInput, output, cacheRead, cacheWrite, total, cacheHitPercent }
}

function valuesOf(
  sessionId: string,
  projections: BuildFleetInput['projections'],
  byId: BuildFleetInput['byId'],
): ProjectionValues | undefined {
  return projections[sessionId]?.values ?? byId?.[sessionId]?.projectionValues
}

/**
 * Recursively walk `subagentCatalog` starting from `rootSessionId`,
 * guarding against cycles and ignoring external check activations (which are
 * surfaced via `board.jobs`).
 */
export function collectSubagentTree(
  rootSessionId: string,
  projections: BuildFleetInput['projections'],
  byId?: BuildFleetInput['byId'],
): readonly DiscoveredChild[] {
  const discovered: DiscoveredChild[] = []
  const seen = new Set<string>([rootSessionId])
  const queue: Array<{ readonly id: string, readonly depth: number }> = [{ id: rootSessionId, depth: 0 }]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current.depth >= 6) continue
    const catalog = valuesOf(current.id, projections, byId)?.subagentCatalog ?? []
    for (const entry of catalog) {
      if (entry.mode === 'external' || seen.has(entry.id)) continue
      seen.add(entry.id)
      discovered.push({
        id: entry.id,
        parentId: current.id,
        depth: current.depth + 1,
        label: entry.label,
        mode: entry.mode,
        createdAt: entry.createdAt,
      })
      queue.push({ id: entry.id, depth: current.depth + 1 })
    }
  }
  return discovered
}

function worktreeShortName(worktree: string | undefined): string | undefined {
  if (worktree === undefined || worktree === '') return undefined
  const normalized = worktree.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/.worktrees/')
  if (idx >= 0) return normalized.slice(idx + 1)
  const parts = normalized.split('/').filter(Boolean)
  return parts.at(-1)
}

function statusOfAgent(
  live: LiveView | undefined,
  timing: SubagentTimingView | undefined,
  dispatch: LiveDispatchEntry | undefined,
  openRequest: LiveRequestEntry | undefined,
): FleetAgentStatus {
  if (openRequest !== undefined) return 'waiting-main'
  if (live?.pendingApproval !== undefined && live.pendingApproval !== null) return 'waiting-approval'
  if (live?.turnSince !== null && live?.turnSince !== undefined) return 'running'
  if (timing?.active !== undefined) return 'running'
  if (dispatch?.status === 'running' && live === undefined && timing === undefined) return 'running'
  if (dispatch?.status === 'lost') return 'lost'
  if (dispatch?.status === 'aborted' || live?.turnEndReason === 'aborted') return 'aborted'
  if (dispatch?.status === 'error' || live?.turnEndReason === 'error' || (live?.lastError != null && timing?.lastTurnCompleted === false)) return 'error'
  if (live === undefined && timing === undefined && dispatch === undefined) return 'done'
  return 'done'
}

function activityLineOf(
  status: FleetAgentStatus,
  live: LiveView | undefined,
  openRequest: LiveRequestEntry | undefined,
): string {
  if (openRequest !== undefined) {
    return openRequest.kind === 'plan'
      ? `待主 Agent 审计划 v${openRequest.version ?? '?'}（${openRequest.id}）`
      : `问主 Agent：${openRequest.question ?? openRequest.id}`
  }
  if (status === 'waiting-approval' && live?.pendingApproval != null) {
    return `等待审批 · ${live.pendingApproval.toolName}`
  }
  if (live?.tool !== null && live?.tool !== undefined) {
    return `正在跑 ${live.tool.name}${live.tool.argHint === undefined ? '' : ` · ${live.tool.argHint}`}`
  }
  if (status === 'running' && live !== undefined) {
    const turn = live.turn ?? 1
    return `思考中 · 第 ${turn} 轮 第 ${live.steps} 步`
  }
  if (status === 'running') return '运行中…'
  if (status === 'error') {
    return live?.lastError != null ? `出错 · ${live.lastError.message}` : '执行出错'
  }
  if (status === 'aborted') return '已中止'
  if (status === 'lost') return '宿主重启前运行中（已丢失）'
  const lastTool = live?.recent.at(-1)
  return lastTool !== undefined ? `已完成 · 最近 ${lastTool.name}` : '已完成'
}

const BLOCK_TITLES: Readonly<Record<string, string>> = {
  'hourness-peak-wait': '高峰等待中',
  'hourness-quota-wait': '套餐配额等待重置',
  'hourness-design-wait': '等待设计重新放行',
  'hourness-waiting-human': '等待你拍板',
  'hourness-idle-rounds': '连续空转已暂停',
}

function isGlmModelId(model: string | null): boolean {
  return model !== null && model.toLowerCase().startsWith('glm')
}

export function buildFleetModel(input: BuildFleetInput): FleetModel {
  const { rootSessionId, projections, byId, board, filter } = input
  const tree = collectSubagentTree(rootSessionId, projections, byId)
  const treeById = new Map(tree.map(node => [node.id, node]))
  const dispatchById = new Map((board?.dispatches ?? []).map(entry => [entry.childId, entry]))
  const requestByChild = new Map((board?.requests ?? []).map(req => [req.childId, req]))

  const allIds = new Set<string>([...tree.map(node => node.id), ...dispatchById.keys()])
  const agents: FleetAgentItem[] = []

  for (const id of allIds) {
    const child = treeById.get(id)
    const dispatch = dispatchById.get(id)
    const vals = valuesOf(id, projections, byId)
    const live = vals?.graphLive
    const timing = vals?.subagentTiming
    const tokens = breakdownTokens(vals?.tokenUsage)
    const openRequest = requestByChild.get(id)
    const parsedId = parseChildIdInfo(id)

    const task = dispatch?.task ?? parsedId?.task
    const role: FleetAgentItem['role'] = dispatch?.role ?? (parsedId?.acceptance ? 'acceptance-review' : 'subagent')
    const status = statusOfAgent(live, timing, dispatch, openRequest)
    const isRunning = status === 'running' || status === 'waiting-approval' || status === 'waiting-main'
    const needsAttention = openRequest !== undefined || live?.pendingApproval != null || status === 'error' || status === 'lost'

    const provider = live?.provider ?? dispatch?.provider ?? null
    const model = live?.model ?? dispatch?.model ?? null
    const activeSince = isRunning
      ? (timing?.active?.since ?? live?.turnSince ?? dispatch?.startedAt ?? child?.createdAt)
      : undefined
    const settledMs = timing?.settledMs
      ?? (dispatch?.settledAt !== undefined && dispatch?.startedAt !== undefined ? Math.max(0, dispatch.settledAt - dispatch.startedAt) : 0)

    const sortAt = Math.max(
      dispatch?.startedAt ?? 0,
      dispatch?.settledAt ?? 0,
      child?.createdAt ?? 0,
      live?.turnSince ?? 0,
      live?.recent.at(-1)?.at ?? 0,
    )

    agents.push({
      id,
      parentId: child?.parentId ?? dispatch?.parentSession ?? rootSessionId,
      depth: child?.depth ?? 1,
      name: child?.label ?? (dispatch !== undefined ? `${dispatch.task} #${dispatch.attempt}` : byId?.[id]?.title ?? id),
      mode: child?.mode ?? 'one-shot',
      task,
      role,
      roleLabel: formatRoleLabel(role),
      attempt: dispatch?.attempt ?? parsedId?.attempt,
      provider,
      providerLabel: formatProviderLabel(provider),
      model,
      worktree: worktreeShortName(dispatch?.worktree),
      branch: dispatch?.branch,
      live,
      timing,
      tokens,
      openRequest,
      status,
      isRunning,
      needsAttention,
      activeSince,
      settledMs,
      activityLine: activityLineOf(status, live, openRequest),
      recentTools: live?.recent ?? [],
      sortAt,
    })
  }

  const jobs: FleetJobItem[] = (board?.jobs ?? []).map(job => ({
    id: job.id,
    kind: job.kind,
    label: job.label,
    status: job.status,
    isRunning: job.status === 'running',
    startedAt: job.startedAt,
    endedAt: job.endedAt,
    goalId: job.goalId,
    tasks: job.tasks ?? [],
    flows: job.flows ?? [],
    mode: job.mode,
    summary: job.summary,
  }))

  // Pinned alerts
  const alerts: PinnedAlert[] = []
  for (const req of board?.requests ?? []) {
    alerts.push({
      kind: 'request',
      id: `req:${req.id}`,
      requestKind: req.kind,
      childId: req.childId,
      task: req.task,
      since: req.since,
      title: req.kind === 'plan' ? `待审计划 · ${req.task} v${req.version ?? '?'} (${req.id})` : `工人提问 · ${req.task} (${req.id})`,
      detail: req.kind === 'plan' ? `子智能体 ${req.childId} 提交了计划，等待主 Agent 调用 answer_worker 审批` : (req.question ?? req.childId),
    })
  }

  for (const sessionId of [rootSessionId, ...allIds]) {
    const approval = valuesOf(sessionId, projections, byId)?.graphLive?.pendingApproval
    if (approval === undefined || approval === null) continue
    const label = sessionId === rootSessionId ? '主 Agent' : (treeById.get(sessionId)?.label ?? sessionId)
    alerts.push({
      kind: 'approval',
      id: `apr:${sessionId}:${approval.id}`,
      sessionId,
      name: label,
      toolName: approval.toolName,
      since: approval.since,
      title: `工具待审批 · ${approval.toolName}`,
      detail: `${label} 请求执行 ${approval.toolName}`,
    })
  }

  const blockedCode = board?.drive.blockedCode
  const blockTitle = blockedCode === undefined ? undefined : BLOCK_TITLES[blockedCode]
  if (blockedCode !== undefined && blockTitle !== undefined) {
    alerts.push({
      kind: 'drive-wait',
      id: `drive:${blockedCode}`,
      code: blockedCode,
      title: blockTitle,
      detail: board?.drive.stateLine ?? blockedCode,
    })
  }
  else if (board?.peak?.peak === true && board.peak.level !== 'inform') {
    alerts.push({
      kind: 'drive-wait',
      id: `peak:${board.peak.level}`,
      code: 'peak',
      title: `GLM 高峰限流（${board.peak.level === 'stop' ? '不做' : '少做'}）`,
      detail: board.peak.until === undefined ? '高峰时段生效中' : `预计 ${board.peak.until} 结束`,
    })
  }

  // Filter counts
  const counts = {
    all: agents.length + jobs.length,
    running: agents.filter(a => a.isRunning).length + jobs.filter(j => j.isRunning).length,
    attention: agents.filter(a => a.needsAttention).length,
    done: agents.filter(a => !a.isRunning).length + jobs.filter(j => !j.isRunning).length,
  }

  const filteredAgents = agents.filter((agent) => {
    if (filter === 'running') return agent.isRunning
    if (filter === 'attention') return agent.needsAttention
    if (filter === 'done') return !agent.isRunning
    return true
  })
  const filteredJobs = jobs.filter((job) => {
    if (filter === 'running') return job.isRunning
    if (filter === 'attention') return job.status === 'error'
    if (filter === 'done') return !job.isRunning
    return true
  })

  // Group hierarchically by task / goal / ad-hoc
  const grouped = new Map<string, { title: string, agents: FleetAgentItem[], jobs: FleetJobItem[] }>()
  const groupOf = (key: string, title: string) => {
    let group = grouped.get(key)
    if (group === undefined) {
      group = { title, agents: [], jobs: [] }
      grouped.set(key, group)
    }
    return group
  }

  for (const agent of filteredAgents) {
    const key = agent.task ?? '__adhoc__'
    const title = agent.task ?? '其他子智能体'
    groupOf(key, title).agents.push(agent)
  }
  for (const job of filteredJobs) {
    const key = job.goalId ?? job.tasks[0] ?? '__jobs__'
    const title = job.goalId ?? job.tasks[0] ?? '合并检查与走查'
    groupOf(key, title).jobs.push(job)
  }

  const ROLE_ORDER: Readonly<Record<FleetAgentItem['role'], number>> = {
    worker: 0,
    review: 1,
    'acceptance-review': 2,
    check: 3,
    subagent: 4,
  }

  const groups: FleetGroup[] = [...grouped.entries()]
    .map(([key, g]) => {
      const sortedAgents = [...g.agents].sort((a, b) => {
        if (a.isRunning !== b.isRunning) return a.isRunning ? -1 : 1
        if (a.depth !== b.depth) return a.depth - b.depth
        const ro = ROLE_ORDER[a.role] - ROLE_ORDER[b.role]
        if (ro !== 0) return ro
        return b.sortAt - a.sortAt
      })
      const sortedJobs = [...g.jobs].sort((a, b) => {
        if (a.isRunning !== b.isRunning) return a.isRunning ? -1 : 1
        return b.startedAt - a.startedAt
      })
      return {
        key,
        title: g.title,
        hasRunning: sortedAgents.some(a => a.isRunning) || sortedJobs.some(j => j.isRunning),
        hasAttention: sortedAgents.some(a => a.needsAttention),
        agents: sortedAgents,
        jobs: sortedJobs,
      }
    })
    .sort((a, b) => {
      if (a.hasAttention !== b.hasAttention) return a.hasAttention ? -1 : 1
      if (a.hasRunning !== b.hasRunning) return a.hasRunning ? -1 : 1
      const aLatest = Math.max(0, ...a.agents.map(x => x.sortAt), ...a.jobs.map(x => x.startedAt))
      const bLatest = Math.max(0, ...b.agents.map(x => x.sortAt), ...b.jobs.map(x => x.startedAt))
      return bLatest - aLatest
    })

  // Aggregate tokens across root + all discovered subagents
  const allTokenIds = new Set<string>([rootSessionId, ...allIds])
  const tokens = sumTokens([...allTokenIds].map(id => valuesOf(id, projections, byId)?.tokenUsage))

  const derivedActiveWorkers = agents.filter(a => a.isRunning && a.role === 'worker').length
  const derivedGlmWorkers = agents.filter(a => a.isRunning && a.role !== 'check' && isGlmModelId(a.model)).length
  const slots = board !== null
    ? {
        max: board.slots.max,
        activeWorkers: Math.max(board.slots.activeWorkers, derivedActiveWorkers),
        glmWorkers: Math.max(board.slots.glmWorkers, derivedGlmWorkers),
        peakCap: board.slots.peakCap,
      }
    : {
        max: 3,
        activeWorkers: derivedActiveWorkers,
        glmWorkers: derivedGlmWorkers,
        peakCap: undefined,
      }

  const dispatchMode: DispatchMode | undefined = board?.dispatchMode === 'eco' || board?.dispatchMode === 'adaptive' || board?.dispatchMode === 'burn'
    ? board.dispatchMode
    : undefined

  return {
    filter,
    counts,
    slots,
    tokens,
    drive: board?.drive,
    peak: board?.peak,
    ...(dispatchMode === undefined ? {} : { dispatchMode }),
    alerts,
    groups,
    discoveredIds: [...allIds],
  }
}

/** Compact pill wording for FlowBar above the main-agent composer. */
export function subagentPillSummary(input: { readonly activeWorkers: number, readonly openRequests: number }): { readonly text: string, readonly attention: boolean } | null {
  const parts: string[] = []
  if (input.activeWorkers > 0) parts.push(`${input.activeWorkers} 工人运行`)
  if (input.openRequests > 0) parts.push(`${input.openRequests} 待协调`)
  if (parts.length === 0) return null
  return { text: parts.join(' · '), attention: input.openRequests > 0 }
}

export interface SessionPreviewMessage {
  readonly kind: 'assistant' | 'streaming' | 'tool'
  readonly text: string
}

/** Extract recent streaming / assistant text blocks from retained session event entries. */
export function extractSessionPreview(entries: readonly RetainedSessionEventEntry[], maxMessages = 3): readonly SessionPreviewMessage[] {
  const out: SessionPreviewMessage[] = []
  let streamText = ''
  for (const item of entries) {
    const ev = item.event
    if (item.type === 'transient' && ev.type === 'assistant/live-chunk') {
      const data = ev.data as { readonly chunk?: { readonly type?: string, readonly text?: string, readonly delta?: string } } | undefined
      const piece = data?.chunk?.text ?? data?.chunk?.delta
      if (typeof piece === 'string') streamText += piece
      continue
    }
    if (ev.type === 'assistant/message') {
      streamText = ''
      const data = ev.data as { readonly message?: { readonly content?: ReadonlyArray<{ readonly type?: string, readonly text?: string, readonly name?: string }> } } | undefined
      const blocks = data?.message?.content ?? []
      const texts = blocks.flatMap(b => b.type === 'text' && typeof b.text === 'string' && b.text.trim() !== '' ? [b.text.trim()] : [])
      const tools = blocks.flatMap(b => b.type === 'tool-call' && typeof b.name === 'string' ? [b.name] : [])
      const combined = texts.length > 0 ? texts.join('\n') : tools.length > 0 ? `调用工具：${tools.join('、')}` : ''
      if (combined !== '') out.push({ kind: texts.length > 0 ? 'assistant' : 'tool', text: combined.slice(0, 600) })
    }
  }
  if (streamText.trim() !== '') {
    out.push({ kind: 'streaming', text: streamText.trim().slice(-600) })
  }
  return out.slice(-maxMessages)
}

export interface CommandTailEntry {
  readonly line: string
  readonly ok?: boolean
}

/** Parse the last `limit` lines of `<exec>/tasks/<task>/<childId>.commands.jsonl`. */
export function parseCommandsTail(jsonlText: string, limit = 12): readonly CommandTailEntry[] {
  const lines = jsonlText.split(/\r?\n/).filter(line => line.trim() !== '').slice(-limit)
  const out: CommandTailEntry[] = []
  for (const raw of lines) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const cmd = typeof parsed.command === 'string'
        ? parsed.command
        : typeof parsed.cmd === 'string'
          ? parsed.cmd
          : typeof parsed.name === 'string'
            ? `${parsed.name}${typeof parsed.path === 'string' ? ` ${parsed.path}` : ''}`
            : raw.slice(0, 140)
      const ok = typeof parsed.ok === 'boolean' ? parsed.ok : typeof parsed.exit === 'number' ? parsed.exit === 0 : undefined
      const firstLine = cmd.split(/\r?\n/)[0] ?? ''
      out.push({ line: firstLine.slice(0, 160), ...(ok === undefined ? {} : { ok }) })
    }
    catch {
      out.push({ line: raw.slice(0, 160) })
    }
  }
  return out
}
