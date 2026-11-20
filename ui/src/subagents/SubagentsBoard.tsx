/**
 * 「子智能体」 real-time fleet spectator dashboard for the DSH right sidebar.
 *
 * Combines live session projections (recursive `subagentCatalog`, `graphLive`
 * v5, `subagentTiming`, `tokenUsage`) with `<project>/.llm/execute/live-board.json`.
 */
import { useEffect, useState, type ReactElement } from 'react'
import type { ClientContext } from '../dsh.ts'
import {
  formatDuration,
  formatTokensCompact,
  subagentChatAddress,
  type DispatchMode,
  type FleetAgentItem,
  type FleetFilter,
  type FleetGroup,
  type FleetJobItem,
  type PinnedAlert,
} from './model.ts'
import { useRetainedInspector, useSubagentFleet } from './source.ts'
import { SUBAGENTS_CSS } from './styles.ts'

export interface SubagentsBoardProps {
  readonly sessionId: string
  readonly ctx: Pick<ClientContext, 'remote' | 'sessions' | 'sidebarRight' | 'uiWorkspace'>
}

const FILTERS: ReadonlyArray<{ readonly value: FleetFilter, readonly label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'running', label: '运行中' },
  { value: 'attention', label: '待协调' },
  { value: 'done', label: '已完成' },
]

const DISPATCH_MODES: ReadonlyArray<{ readonly value: DispatchMode, readonly label: string }> = [
  { value: 'eco', label: '省额度' },
  { value: 'adaptive', label: '自适应' },
  { value: 'burn', label: '燃烧' },
]

/**
 * Isolated elapsed-time badge: ticks every 1s only while `running` is true,
 * preventing 1s re-renders of the entire fleet tree.
 */
function DurationBadge({
  activeSince,
  settledMs,
  running,
}: {
  readonly activeSince: number | undefined
  readonly settledMs: number
  readonly running: boolean
}): ReactElement | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running || activeSince === undefined) return undefined
    setNow(Date.now())
    const timer = setInterval(() => { setNow(Date.now()) }, 1000)
    return () => { clearInterval(timer) }
  }, [running, activeSince])

  const elapsed = running && activeSince !== undefined
    ? settledMs + Math.max(0, now - activeSince)
    : settledMs
  if (elapsed <= 0 && !running) return null
  return <span className="glms-duration">{formatDuration(elapsed)}</span>
}

function AlertBanner({ alert }: { readonly alert: PinnedAlert }): ReactElement {
  const warnTone = alert.kind === 'drive-wait'
  return (
    <div className={warnTone ? 'glms-alert warn' : 'glms-alert'} role="status">
      <div className="glms-alert-title">{alert.title}</div>
      <div className="glms-alert-detail">{alert.detail}</div>
    </div>
  )
}

function AgentCard({
  item,
  rootSessionId,
  projectRoot,
  ctx,
}: {
  readonly item: FleetAgentItem
  readonly rootSessionId: string
  readonly projectRoot: string | null
  readonly ctx: SubagentsBoardProps['ctx']
}): ReactElement {
  const [expanded, setExpanded] = useState(false)
  const inspector = useRetainedInspector(ctx.remote, ctx.sessions, {
    rootSessionId,
    childId: item.id,
    parentId: item.parentId,
    mode: item.mode,
    projectRoot,
    task: item.task,
    expanded,
  })

  const canSplit = typeof ctx.sidebarRight.openResource === 'function' && item.mode !== 'external'
  const canOpenMain = typeof ctx.uiWorkspace?.openSession === 'function'

  const cardClasses = [
    'glms-card',
    item.depth > 1 ? 'nested' : '',
    item.isRunning ? 'running' : '',
    item.needsAttention ? 'attention' : '',
  ].filter(Boolean).join(' ')

  const openAside = (): void => {
    void ctx.sidebarRight.openResource?.(
      subagentChatAddress(item.id, item.parentId, item.mode),
      { kind: 'subagentchat', preferNewPane: true },
    )
  }

  return (
    <article className={cardClasses}>
      <div className="glms-card-top">
        <div className="glms-card-id">
          <span className={`glms-dot ${item.status}`} aria-hidden="true" />
          <span className="glms-title" title={item.name}>{item.name}</span>
        </div>
        <DurationBadge activeSince={item.activeSince} settledMs={item.settledMs} running={item.isRunning} />
      </div>

      <div className="glms-badges">
        <span className="glms-pill role">{item.roleLabel}</span>
        {item.attempt === undefined ? null : <span className="glms-pill">第 {item.attempt} 轮</span>}
        {item.providerLabel === null ? null : <span className="glms-pill plan">{item.providerLabel}</span>}
        {item.model === null ? null : <span className="glms-pill" title={item.model}>{item.model}</span>}
        {item.worktree === undefined ? null : <span className="glms-pill" title={item.worktree}>{item.worktree}</span>}
        {item.branch === undefined ? null : <span className="glms-pill" title={item.branch}>{item.branch}</span>}
        {item.openRequest !== undefined ? <span className="glms-pill warn">等主 Agent</span> : null}
        {item.live?.pendingApproval != null ? <span className="glms-pill warn">待审批</span> : null}
      </div>

      <div className="glms-activity">{item.activityLine}</div>

      {item.tokens === undefined || item.tokens.total === 0
        ? null
        : (
            <div className="glms-tokens">
              <span>总 {formatTokensCompact(item.tokens.total)}</span>
              <span>输入 {formatTokensCompact(item.tokens.uncachedInput + item.tokens.cacheRead + item.tokens.cacheWrite)}</span>
              <span>输出 {formatTokensCompact(item.tokens.output)}</span>
              <span>缓存命中 {item.tokens.cacheHitPercent}%</span>
            </div>
          )}

      {item.recentTools.length === 0
        ? null
        : (
            <div className="glms-tools">
              {item.recentTools.map((call, idx) => {
                const tooltip = [
                  call.name,
                  call.ok ? '成功' : '失败',
                  call.ms === undefined ? undefined : `${call.ms}ms`,
                  call.argHint,
                ].filter(Boolean).join(' · ')
                return (
                  <span key={`${idx}:${call.at}:${call.name}`} className={call.ok ? 'glms-tool' : 'glms-tool bad'} title={tooltip}>
                    <span>{call.name}</span>
                    {call.ms === undefined ? null : <span className="glms-tool-ms">{call.ms}ms</span>}
                  </span>
                )
              })}
            </div>
          )}

      <div className="glms-actions">
        {canSplit ? <button type="button" className="glms-btn" onClick={openAside}>分屏看对话</button> : null}
        {canOpenMain ? <button type="button" className="glms-btn" onClick={() => { ctx.uiWorkspace.openSession(item.id) }}>主窗打开</button> : null}
        <button
          type="button"
          className="glms-btn"
          aria-expanded={expanded}
          onClick={() => { setExpanded(prev => !prev) }}
        >
          {expanded ? '收起详情' : '实时详情'}
        </button>
      </div>

      {!expanded
        ? null
        : (
            <div className="glms-inspector">
              {inspector.preview.length === 0
                ? <div className="glms-meta">暂无实时对话流片段</div>
                : inspector.preview.map((msg, idx) => (
                    <div key={`${msg.kind}:${idx}`} className="glms-preview">
                      {msg.kind === 'streaming' ? '▌ ' : ''}{msg.text}
                    </div>
                  ))}
              {inspector.loadingCommands
                ? <div>读取命令记录中…</div>
                : inspector.commands.length === 0
                  ? null
                  : (
                      <div>
                        <div>最近命令（{inspector.commands.length}）</div>
                        <ul className="glms-cmds">
                          {inspector.commands.map((cmd, idx) => (
                            <li key={`${idx}:${cmd.line}`}>
                              {cmd.ok === false ? '✗ ' : cmd.ok === true ? '✓ ' : ''}{cmd.line}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
            </div>
          )}
    </article>
  )
}

function JobCard({ job }: { readonly job: FleetJobItem }): ReactElement {
  const settledMs = job.endedAt !== undefined ? Math.max(0, job.endedAt - job.startedAt) : 0
  return (
    <article className={job.isRunning ? 'glms-card running' : job.status === 'error' ? 'glms-card attention' : 'glms-card'}>
      <div className="glms-card-top">
        <div className="glms-card-id">
          <span className={`glms-dot ${job.isRunning ? 'running' : job.status === 'error' ? 'error' : 'done'}`} aria-hidden="true" />
          <span className="glms-title" title={job.label}>{job.label}</span>
        </div>
        <DurationBadge activeSince={job.startedAt} settledMs={settledMs} running={job.isRunning} />
      </div>
      <div className="glms-badges">
        <span className="glms-pill role">{job.kind === 'walk' ? '用户流走查' : '合并检查'}</span>
        {job.mode === undefined ? null : <span className="glms-pill">{job.mode === 'activation' ? '后台通道' : '同步回退'}</span>}
        {job.tasks.map(t => <span key={t} className="glms-pill">{t}</span>)}
        {job.flows.map(f => <span key={f} className="glms-pill">{f}</span>)}
      </div>
      <div className="glms-activity">
        {job.isRunning ? '执行中…' : job.summary ?? (job.status === 'completed' ? '已完成' : job.status)}
      </div>
    </article>
  )
}

function GroupSection({
  group,
  rootSessionId,
  projectRoot,
  ctx,
}: {
  readonly group: FleetGroup
  readonly rootSessionId: string
  readonly projectRoot: string | null
  readonly ctx: SubagentsBoardProps['ctx']
}): ReactElement {
  return (
    <section className="glms-group">
      <div className="glms-group-head">
        <span>{group.title}</span>
        <span>{group.agents.length + group.jobs.length} 项</span>
      </div>
      <div className="glms-cards">
        {group.agents.map(item => (
          <AgentCard key={item.id} item={item} rootSessionId={rootSessionId} projectRoot={projectRoot} ctx={ctx} />
        ))}
        {group.jobs.map(job => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>
    </section>
  )
}

export function SubagentsBoard({ sessionId, ctx }: SubagentsBoardProps): ReactElement {
  const [filter, setFilter] = useState<FleetFilter>('all')
  const { model, projectRoot, boardProblem, refreshAll } = useSubagentFleet(ctx.remote, ctx.sessions, sessionId, filter)
  const [modePending, setModePending] = useState(false)
  const [modeError, setModeError] = useState<string | null>(null)
  const [optimisticMode, setOptimisticMode] = useState<DispatchMode | undefined>(undefined)

  useEffect(() => {
    setOptimisticMode(undefined)
  }, [model.dispatchMode])

  const activeMode: DispatchMode = optimisticMode ?? model.dispatchMode ?? 'adaptive'
  const canSwitchMode = typeof ctx.remote?.commands?.execute === 'function'

  const switchMode = (nextMode: DispatchMode): void => {
    if (modePending || !canSwitchMode) return
    if (model.dispatchMode === nextMode && optimisticMode === undefined) return
    setModePending(true)
    setModeError(null)
    void ctx.remote.commands.execute(sessionId, `/dispatch-mode ${nextMode}`, []).then(
      (res) => {
        if (!res.ok) {
          setOptimisticMode(undefined)
          setModeError(res.error.message || '切换派发模式失败')
          return
        }
        const cmd = res.value?.result
        if (cmd === undefined) {
          setOptimisticMode(undefined)
          setModeError('当前会话不支持 /dispatch-mode 命令')
          return
        }
        if (cmd.kind === 'error') {
          setOptimisticMode(undefined)
          setModeError(cmd.text ?? '切换派发模式失败')
          return
        }
        setOptimisticMode(nextMode)
        setModeError(null)
      },
      (error: unknown) => {
        setOptimisticMode(undefined)
        setModeError(error instanceof Error ? error.message : String(error))
      },
    ).finally(() => {
      setModePending(false)
    })
  }

  const slotRatio = model.slots.max > 0 ? Math.min(100, Math.round((model.slots.activeWorkers / model.slots.max) * 100)) : 0
  const anyRunning = model.counts.running > 0

  return (
    <div className="glms">
      <style>{SUBAGENTS_CSS}</style>
      <header className="glms-head">
        <div className="glms-head-top">
          <div className="glms-beacon">
            <span className={anyRunning ? 'glms-beacon-dot live' : 'glms-beacon-dot'} aria-hidden="true" />
            <span>{anyRunning ? `实时监看 · ${model.counts.running} 路运行中` : '子智能体监看 · 当前空闲'}</span>
          </div>
          <button type="button" className="glms-refresh" onClick={refreshAll}>刷新</button>
        </div>

        <div className="glms-stats">
          <div className="glms-slot-row">
            <span>写槽位 {model.slots.activeWorkers}/{model.slots.max}</span>
            <span className="glms-slot-bar" aria-hidden="true">
              <span className={model.slots.activeWorkers >= model.slots.max ? 'glms-slot-fill full' : 'glms-slot-fill'} style={{ width: `${slotRatio}%` }} />
            </span>
            {model.slots.peakCap === undefined ? null : <span className="glms-pill warn">高峰上限 {model.slots.peakCap}</span>}
          </div>
          {model.tokens.total === 0
            ? null
            : (
                <div className="glms-token-row">
                  <span>舰队总计 {formatTokensCompact(model.tokens.total)} tok</span>
                  <span>输入 {formatTokensCompact(model.tokens.uncachedInput + model.tokens.cacheRead + model.tokens.cacheWrite)}</span>
                  <span>输出 {formatTokensCompact(model.tokens.output)}</span>
                  <span>缓存命中 {model.tokens.cacheHitPercent}%</span>
                </div>
              )}
        </div>

        <div className="glms-mode-row">
          <span className="glms-mode-label">派发偏好</span>
          <div className="glms-mode-seg" role="group" aria-label="派发偏好">
            {DISPATCH_MODES.map(item => (
              <button
                key={item.value}
                type="button"
                className="glms-mode-btn"
                aria-pressed={activeMode === item.value}
                disabled={!canSwitchMode || modePending}
                onClick={() => { switchMode(item.value) }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        {modeError === null ? null : <div className="glms-mode-err" role="status">{modeError}</div>}

        <div className="glms-filters" role="group" aria-label="子智能体过滤">
          {FILTERS.map(item => (
            <button
              key={item.value}
              type="button"
              className="glms-filter"
              aria-pressed={filter === item.value}
              onClick={() => { setFilter(item.value) }}
            >
              <span>{item.label}</span>
              <span>{model.counts[item.value]}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="glms-body">
        {boardProblem === null ? null : <div className="glms-notice" role="status">{boardProblem}</div>}

        {model.alerts.length === 0
          ? null
          : (
              <div className="glms-alerts">
                {model.alerts.map(alert => <AlertBanner key={alert.id} alert={alert} />)}
              </div>
            )}

        {model.groups.length === 0
          ? (
              <div className="glms-empty">
                {filter === 'all'
                  ? '本会话还没有派发过子智能体；一旦主 Agent 开始派活，各路写手、审查与检查任务会实时出现在这里。'
                  : '当前筛选条件下没有子智能体记录。'}
              </div>
            )
          : model.groups.map(group => (
              <GroupSection key={group.key} group={group} rootSessionId={sessionId} projectRoot={projectRoot} ctx={ctx} />
            ))}
      </div>
    </div>
  )
}
