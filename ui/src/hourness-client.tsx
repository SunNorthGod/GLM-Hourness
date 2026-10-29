/**
 * Client half of the orchestration package (the client face of
 * dsh-hourness, docs/DESIGN.md §2.3): the project graph tab of the right
 * sidebar (./graph/tab.tsx).
 * scripts/build-ui.mjs bundles this entry into packages/hourness/ui/client.js
 * for window.__ModuleLoader__; React and ui-primitives come from the DSH
 * client module table (docs/DEVELOPMENT.md §5.6).
 */
import type { ClientContext } from './dsh.ts'
import { installGraphTab } from './graph/tab.tsx'
/**
 * Client services the tab uses; nested Remote namespaces are declared with
 * their root (docs/DEVELOPMENT.md §5.7).
 */
export const inject = ['slots', 'sidebarRightTabs', 'remote', 'remote.commands', 'remote.workspaceFiles', 'sessions']
export function apply(ctx: ClientContext): void {
  installGraphTab(ctx)
}
