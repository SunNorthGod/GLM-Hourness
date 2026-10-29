/**
 * Client half of the GLM channel package (dsh-glm-zcode-ui, docs/DESIGN.md
 * §2.3): the settings section and the composer pill (./channel.js).
 * scripts/build-ui.mjs bundles this entry into packages/glm/ui/client.js
 * for window.__ModuleLoader__; React and ui-primitives come from the DSH
 * client module table (docs/DEVELOPMENT.md §5.6).
 */
import { installChannel } from './channel.js'

/**
 * Client services the channel uses; the nested Remote namespace is declared
 * with its root (docs/DEVELOPMENT.md §5.7).
 */
export const inject = ['slots', 'remote', 'remote.commands']

export function apply(ctx) {
  installChannel(ctx)
}
