/**
 * Host half of the client face of dsh-glm-zcode (docs/DESIGN.md §2.3): the
 * package's `.` export, loaded by the row named with the exact package
 * name (glm-hourness/glm-ui).
 *
 * Every surface of the client face is in its client half (client.js, built
 * from ui/src/glm-client.js): the GLM pill under the composer and the
 * settings section. Host actions go through the GLM package's commands
 * (remote.commands); a third-party package has no path to a Remote service
 * of its own (docs/DEVELOPMENT.md §5.6). This row only gives client-modules
 * the package's one Loader source; the host rows are named by subpath
 * specifiers, which client-modules never counts as sources.
 */
export const name = 'dsh-glm-hourness/glm-ui'
/** cordis plugin entry: no host-side behavior; activation must never throw. */
export function apply() {}
