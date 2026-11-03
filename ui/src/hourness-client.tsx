/**
 * Client half of the orchestration package (the client face of
 * dsh-hourness, docs/DESIGN.md §2.3): the project graph tab of the right
 * sidebar (./graph/tab.tsx), the flow bar above the composer of the main
 * agent's session (./flow/FlowBar.tsx) and the /wish entry, the card on the
 * opening screen and the button under the composer (./wish/), and the
 * memory and lessons board of the panel (./lessons/, registered on the
 * board table ui/src/graph/boards.ts). scripts/build-ui.mjs bundles this
 * entry into packages/hourness/ui/client.js
 * for window.__ModuleLoader__; React and ui-primitives come from the DSH
 * client module table (docs/DEVELOPMENT.md §5.6).
 */
import type { ClientContext } from './dsh.ts'
import { installFlowBar } from './flow/FlowBar.tsx'
import { installGraphTab } from './graph/tab.tsx'
import { installLessonsBoard } from './lessons/LessonsPage.tsx'
import { installWishCard } from './wish/WishCard.tsx'
import { installWishPill } from './wish/WishPill.tsx'
/**
 * Client services the tab, the bar and the entry use; nested Remote
 * namespaces are declared with their root (docs/DEVELOPMENT.md §5.7).
 * `uiWorkspace` (dsh-client-ui-workspace) opens the main agent's
 * conversation from the panel's jump lines (plain-ui 1.3 §4.9).
 */
export const inject = ['slots', 'sidebarRightTabs', 'remote', 'remote.commands', 'remote.workspaceFiles', 'sessions', 'uiWorkspace']
export function apply(ctx: ClientContext): void {
  installGraphTab(ctx)
  installFlowBar(ctx)
  installWishCard(ctx)
  installWishPill(ctx)
  ctx.effect(() => installLessonsBoard(ctx), 'glm-hourness-ui: lessons board')
}
