/**
 * dsh-hourness-ui, host half (docs/DESIGN.md §2.3).
 *
 * Every surface of this package is in its client half (client.js, built
 * from ui/src/hourness-client.tsx): the project graph tab of the right
 * sidebar. Writes go through the orchestration package's commands
 * (remote.commands); a third-party package has no path to a Remote service
 * of its own (docs/DEVELOPMENT.md §5.6). This row only owns the client
 * package's Loader identity, so exactly one row resolves it.
 */
export const name = 'dsh-glm-hourness/ui'
/** cordis plugin entry: no host-side behavior; activation must never throw. */
export function apply() {}
