/**
 * GLM-Hourness UI bundle, client half (docs/DESIGN.md §2.3): the GLM
 * channel surfaces (settings section and composer pill) and the project
 * graph tab of the right sidebar. scripts/build-ui.mjs bundles this entry
 * into ui/client.js for window.__ModuleLoader__; React and ui-primitives
 * come from the DSH client module table (docs/DEVELOPMENT.md §5.6).
 */
import { installChannel } from './channel.js'
import type { ClientContext } from './dsh.ts'
import { installGraphTab } from './graph/tab.tsx'

/**
 * Client services the halves use; nested Remote namespaces are declared
 * with their root (docs/DEVELOPMENT.md §5.7).
 */
export const inject = ['slots', 'sidebarRightTabs', 'remote', 'remote.commands', 'remote.workspaceFiles']

export function apply(ctx: ClientContext): void {
  installChannel(ctx)
  installGraphTab(ctx)
}
