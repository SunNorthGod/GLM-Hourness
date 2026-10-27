/**
 * GLM-Hourness UI bundle — Host half.
 *
 * The panel is a pure Client feature today: this row only owns the bundle's
 * Loader identity so the single-row constraint holds (docs/DESIGN.md §2.3).
 * Host actions (login, credential status) will register here as a Remote
 * service in a later step, one variable at a time.
 */
export const name = 'dsh-glm-hourness/ui'

/** cordis plugin entry: no host-side behavior yet; activation must never throw. */
export function apply() {}
