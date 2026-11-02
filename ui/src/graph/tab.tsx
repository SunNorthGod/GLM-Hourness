/**
 * The project graph as a page type of the DSH right sidebar
 * (dsh-client-ui-sidebar-right README, "Extension seats"): the type with
 * its guide entry, and the body under `sidebar.right.pane.tab` keyed by
 * the type's id. The slot's inject hands the body its session; the body
 * holds that session's shared graph source while it is mounted.
 */
import { IconGoalOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useState, type ReactElement } from 'react'
import type { ClientContext, CommandsRemote, RemoteRoot, SessionsClient } from '../dsh.ts'
import { PanelBoundary } from './common.tsx'
import { GraphPanel } from './Panel.tsx'
import { holdSource, type GraphSource } from './source.ts'

/** This implementation's identity in the tab system, and the key its body registers under. */
const GRAPH_TAB_ID = 'dsh-glm-hourness-ui/graph'
const GRAPH_TAB_KIND = 'glm-hourness-graph'

interface BodyProps {
  readonly graphSessionId: string
}

function makeBody(remote: RemoteRoot, commands: CommandsRemote, sessions: SessionsClient): (props: BodyProps) => ReactElement | null {
  return function GraphTabBody({ graphSessionId }: BodyProps): ReactElement | null {
    const [source, setSource] = useState<GraphSource | undefined>(undefined)
    useEffect(() => {
      const held = holdSource(remote, graphSessionId)
      setSource(held.source)
      return () => { held.release() }
    }, [graphSessionId])
    if (source === undefined) return null
    // 重新加载 renders the panel again; the graph source is held by the body, so the panel comes back with the current graph.
    return <PanelBoundary label="项目图面板"><GraphPanel source={source} commands={commands} sessions={sessions} sessionId={graphSessionId} /></PanelBoundary>
  }
}

export function installGraphTab(ctx: ClientContext): void {
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: GRAPH_TAB_ID,
    kind: GRAPH_TAB_KIND,
    priority: 'extension',
    keepMounted: true,
    title: () => '项目图',
    guide: [{
      id: 'graph',
      order: 40,
      title: () => '项目图',
      description: () => '需要你的事、agent 定的事、正在做的',
      icon: IconGoalOutlineRegular,
    }],
  }), 'glm-hourness-ui: graph tab type')
  const Body = makeBody(ctx.remote, ctx.remote.commands, ctx.sessions)
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register<BodyProps>({
    name: 'sidebar.right.pane.tab',
    key: GRAPH_TAB_ID,
    inject: sessionId => ({ graphSessionId: sessionId }),
  }, Body as never)), 'glm-hourness-ui: graph tab body')
}
