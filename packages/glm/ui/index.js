/**
 * dsh-glm-zcode-ui, host half (docs/DESIGN.md §2.3).
 *
 * Every surface of this package is in its client half (client.js, built
 * from ui/src/glm-client.js): the GLM pill under the composer and the
 * settings section. Host actions go through the GLM package's commands
 * (remote.commands); a third-party package has no path to a Remote service
 * of its own (docs/DEVELOPMENT.md §5.6). This row only owns the client
 * package's Loader identity, so exactly one row resolves it.
 */
export const name = 'dsh-glm-hourness/glm-ui'
/** cordis plugin entry: no host-side behavior; activation must never throw. */
export function apply() {}
