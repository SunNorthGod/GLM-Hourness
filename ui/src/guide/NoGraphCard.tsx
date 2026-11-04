/**
 * The no-graph card on the opening screen (plain-ui 1.3 §6.6): when a
 * blank session's workspace has no project graph, this dock entry - right
 * after M3's wish card in the order, so the two never show together -
 * explains what a graph is for and how one comes to be. The 接管行
 * (/hourness-init) is not registered on main, so there is no
 * 建一张项目图 button: the wording is the without-bootstrap branch. The
 * card shows once per workspace: five visible seconds write the local
 * record (§6.8), and the record keeps it away from then on. It rides M3's
 * card styles, so the opening screen keeps one look.
 */
import { useEffect, useMemo, type ReactElement } from 'react'
import type { ClientContext, RemoteRoot, SessionSlotProps, SessionsClient } from '../dsh.ts'
import { cwdKeyOf } from '../graph/main-chat.ts'
import { useGraph } from '../flow/session.ts'
import { useBlank } from '../wish/hooks.ts'
import { WISH_CSS } from '../wish/styles.ts'
import { noGraphKey, readStamp, writeStamp } from './state.ts'

/** The dock entry's identity (§6.6). */
const NO_GRAPH_ID = 'hourness-nograph'
const NO_GRAPH_ORDER = 41
const NO_GRAPH_LABEL = '还没有项目图'
/** 连续显示这么久才算「出现过」，本机记下（§6.6）。 */
const STAY_MS = 5_000

const isWindows = (): boolean => typeof navigator === 'object' && /windows/i.test(navigator.userAgent)

function makeCard(remote: RemoteRoot, sessions: SessionsClient): (props: SessionSlotProps) => ReactElement | null {
  return function NoGraphCard({ sessionId, useSession }: SessionSlotProps): ReactElement | null {
    const blank = useBlank(sessions, sessionId, useSession)
    const snapshot = useGraph(remote, sessionId, blank)
    const cwd = useMemo(() => sessions.list.getSnapshot().byId[sessionId]?.cwd, [sessions, sessionId])
    const key = useMemo(() => cwd === undefined ? undefined : noGraphKey(cwdKeyOf(cwd, isWindows())), [cwd])
    const shown = blank && snapshot?.status === 'missing' && key !== undefined && readStamp(window.localStorage, key) === undefined
    useEffect(() => {
      if (!shown || key === undefined) return undefined
      // Still mounted after five seconds: the workspace has seen the card (§6.6).
      const timer = setTimeout(() => { writeStamp(window.localStorage, key, new Date().toISOString()) }, STAY_MS)
      return () => { clearTimeout(timer) }
    }, [shown, key])
    if (!shown) return null
    return (
      <div className="hw-card" role="region" aria-label="还没有项目图">
        <style>{WISH_CSS}</style>
        <h2 className="hw-title">这个工作区还没有项目图</h2>
        <p className="hw-body">项目图记下这个项目要做成什么、接下来做什么、哪些要你回话。有了它，主 Agent 才能接手。</p>
        <div className="hw-hint">在对话里让 agent 建空目录 docs/graph/nodes，面板会自己跟上。</div>
      </div>
    )
  }
}

/** Register the card in the stack above the input, behind M3's wish card. */
export function installNoGraphCard(ctx: ClientContext): void {
  const Card = makeCard(ctx.remote, ctx.sessions)
  ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register<{ readonly sessionId: string }>({
    name: 'conversation.input.dock',
    id: NO_GRAPH_ID,
    order: NO_GRAPH_ORDER,
    label: NO_GRAPH_LABEL,
    inject: sessionId => ({ sessionId }),
  }, Card as never)), 'glm-hourness-ui: no-graph card')
}
