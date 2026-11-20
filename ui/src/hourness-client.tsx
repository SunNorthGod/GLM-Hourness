/**
 * Client half of the orchestration package (the client face of
 * dsh-hourness, docs/DESIGN.md §2.3): the project graph tab of the right
 * sidebar (./graph/tab.tsx), the flow bar above the composer of the main
 * agent's session (./flow/FlowBar.tsx) and the /wish entry, the card on the
 * opening screen and the button under the composer (./wish/), and the
 * boards of the panel, registered on the board table
 * ui/src/graph/boards.ts: the rules board (./rules/), the loop board
 * (./loops/), the memory and lessons board (./lessons/) and the metrics
 * board (./metrics/).
 * scripts/build-ui.mjs bundles this
 * entry into packages/hourness/ui/client.js
 * for window.__ModuleLoader__; React and ui-primitives come from the DSH
 * client module table (docs/DEVELOPMENT.md §5.6).
 */
import { IconGoalOutlineRegular, IconSparkleRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ClientContext } from './dsh.ts'
import { installFlowBar } from './flow/FlowBar.tsx'
import { PanelBoundary } from './graph/common.tsx'
import { GRAPH_TAB_KIND, installGraphTab } from './graph/tab.tsx'
import { installNoGraphCard } from './guide/NoGraphCard.tsx'
import { installLessonsBoard } from './lessons/LessonsPage.tsx'
import { installLoopsBoard } from './loops/LoopsPage.tsx'
import { installMetricsBoard } from './metrics/board.tsx'
import { installRulesBoard } from './rules/RulesPage.tsx'
import { SUBAGENTS_TAB_KIND, SUBAGENTS_TAB_TITLE } from './subagents/model.ts'
import { SubagentsBoard } from './subagents/SubagentsBoard.tsx'
import { installWishCard } from './wish/WishCard.tsx'
import { installWishPill } from './wish/WishPill.tsx'

function installSubagentsTab(ctx: ClientContext): void {
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: SUBAGENTS_TAB_KIND,
    kind: SUBAGENTS_TAB_KIND,
    priority: 'extension',
    keepMounted: true,
    title: () => SUBAGENTS_TAB_TITLE,
    guide: [{
      id: 'subagents',
      order: 45,
      title: () => SUBAGENTS_TAB_TITLE,
      description: () => '实时监看各路子智能体的运行阶段、工具耗时、令牌开销与待协调请求',
      icon: IconSparkleRegular,
    }],
  }), 'glm-hourness-ui: subagents tab type')
  const Body = ({ sessionId }: { readonly sessionId: string }) => (
    <PanelBoundary label={SUBAGENTS_TAB_TITLE}>
      <SubagentsBoard sessionId={sessionId} ctx={ctx} />
    </PanelBoundary>
  )
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register<{ readonly sessionId: string }>({
    name: 'sidebar.right.pane.tab',
    key: SUBAGENTS_TAB_KIND,
    inject: sessionId => ({ sessionId }),
  }, Body as never)), 'glm-hourness-ui: subagents tab body')
  void IconGoalOutlineRegular
}

/**
 * Client services the tab, the bar and the entry use; nested Remote
 * namespaces are declared with their root (docs/DEVELOPMENT.md §5.7).
 * `uiWorkspace` (dsh-client-ui-workspace) opens the main agent's
 * conversation from the panel's jump lines (plain-ui 1.3 §4.9);
 * `sidebarRight` (dsh-client-ui-sidebar-right) is the「第一次用？」line's
 * way into the panel tab (§6.5).
 */
export const inject = ['slots', 'sidebarRightTabs', 'sidebarRight', 'remote', 'remote.commands', 'remote.workspaceFiles', 'sessions', 'uiWorkspace']
export function apply(ctx: ClientContext): void {
  installGraphTab(ctx)
  installSubagentsTab(ctx)
  installFlowBar(ctx)
  installWishCard(ctx, () => { ctx.sidebarRight.openTab(GRAPH_TAB_KIND) })
  installWishPill(ctx)
  installNoGraphCard(ctx)
  ctx.effect(() => installRulesBoard(ctx), 'glm-hourness-ui: rules board')
  ctx.effect(() => installLoopsBoard(ctx), 'glm-hourness-ui: loop board')
  ctx.effect(() => installLessonsBoard(ctx), 'glm-hourness-ui: lessons board')
  ctx.effect(() => installMetricsBoard(ctx), 'glm-hourness-ui: metrics board')
}
