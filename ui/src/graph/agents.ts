/**
 * The agents of the panel's session on the graph (docs/ORCHESTRATION.md
 * §2.10 实时现场, m2-8): the session itself and the direct children its
 * subagentCatalog names, each with its graphLive view (src/graph/live.ts)
 * and its token usage. The values come from the client's session list,
 * which follows every projection change of every live session on the host;
 * a session without values yet is read once through refreshProjections.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { LiveView } from '../../../src/graph/live.ts'
import type { SessionsClient, TokenUsage } from '../dsh.ts'

export interface AgentLive {
  readonly id: string
  /** 主 Agent, or the child's catalog label. */
  readonly name: string
  readonly main: boolean
  /** Undefined until the session's projections arrive, or when the graph-panel row is off. */
  readonly view: LiveView | undefined
  readonly tokens: number | undefined
  /** A turn is open. */
  readonly running: boolean
}

function total(usage: TokenUsage | undefined): number | undefined {
  return usage === undefined ? undefined : usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/** The panel session's agents, main first; children in catalog order. */
export function useAgents(sessions: SessionsClient, sessionId: string): readonly AgentLive[] {
  const subscribe = useCallback((listener: () => void) => sessions.list.subscribe(listener), [sessions])
  const projections = useSyncExternalStore(subscribe, () => sessions.list.getSnapshot().projectionsBySession)
  const agents = useMemo(() => {
    const own = projections[sessionId]?.values
    const agent = (id: string, name: string, main: boolean): AgentLive => {
      const values = projections[id]?.values
      return { id, name, main, view: values?.graphLive, tokens: total(values?.tokenUsage), running: values?.graphLive?.turnSince !== null && values?.graphLive?.turnSince !== undefined }
    }
    const children = (own?.subagentCatalog ?? []).filter(entry => entry.mode !== 'external')
    return [agent(sessionId, '主 Agent', true), ...children.map(entry => agent(entry.id, entry.label ?? entry.id, false))]
  }, [projections, sessionId])
  // Sessions without values yet (cold, or opened before the host had them): ask once each.
  const asked = useRef(new Set<string>())
  useEffect(() => {
    for (const { id } of agents) {
      if (projections[id] !== undefined || asked.current.has(id)) continue
      asked.current.add(id)
      void sessions.refreshProjections(id).catch(() => {})
    }
  }, [agents, projections, sessions])
  return agents
}

/** The current time, ticking every second while `active`, for the elapsed times of running work. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return undefined
    setNow(Date.now())
    const timer = setInterval(() => { setNow(Date.now()) }, 1000)
    return () => { clearInterval(timer) }
  }, [active])
  return now
}

function elapsedText(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} 分 ${seconds % 60} 秒`
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`
}

export function tokensText(value: number): string {
  if (value < 1000) return `${value}`
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`
  return `${(value / 1_000_000).toFixed(1)}M`
}

/** One line of what the agent does now. */
export function doingText(agent: AgentLive, now: number): string {
  const view = agent.view
  if (view === undefined) return agent.main ? '还没有现场数据' : '这次启动之前跑的，没有现场数据'
  if (view.tool !== null) return `在跑 ${view.tool.name} · ${elapsedText(now - view.tool.since)}`
  if (view.turnSince !== null) return `在想 · 第 ${view.steps} 步 · ${elapsedText(now - view.turnSince)}`
  return agent.main ? '空闲，等你说话' : '已停下'
}

/**
 * Where each agent stands on the graph: the main agent at its focus, a
 * child at its own focus, else at the main agent's focus. Agents with a
 * view but no place are listed under the empty key.
 */
export function placements(agents: readonly AgentLive[]): ReadonlyMap<string, readonly AgentLive[]> {
  const mainFocus = agents.find(agent => agent.main)?.view?.focus ?? null
  const placed = new Map<string, AgentLive[]>()
  for (const agent of agents) {
    // A child without a live view ran before this start of the app; it stands nowhere.
    if (agent.view === undefined) continue
    const at = agent.view.focus ?? (agent.main ? null : mainFocus) ?? ''
    placed.set(at, [...placed.get(at) ?? [], agent])
  }
  return placed
}
