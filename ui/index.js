/**
 * GLM-Hourness UI bundle — Host half.
 *
 * Every surface of this package is in its Client half (ui/client.js): the
 * GLM pill, the settings section and the project graph tab. Host actions go
 * through the main bundle's commands (remote.commands); a third-party
 * package has no path to a Remote service of its own (docs/DEVELOPMENT.md
 * §5.6). This row only owns the bundle's Loader identity so the single-row
 * constraint holds (docs/DESIGN.md §2.3).
 */
export const name = 'dsh-glm-hourness/ui'
/** cordis plugin entry: no host-side behavior; activation must never throw. */
export function apply() {}
