/**
 * The status hub's host-side registration (status hub design 0.3 §3.2),
 * parallel to the row health of src/shared/health.ts: a row that has status
 * to submit provides its own read-only view as the cordis service
 * `glmHournessStatus/<row>` at activation, and the report side's collector
 * (src/report/status.ts) reads every view through `ctx.get`. Provider and
 * reader need no load order and no shared module instance, and a row unloads
 * its view with its fiber. The view is synchronous like a row-health view;
 * a row whose items need journal reads does them inside its items function.
 * Nothing here reaches the model-visible conversation.
 */
import type { ProvideHost } from './dsh-min.ts'
import type { HealthRow } from './health.ts'
import type { StatusItem } from './status.ts'

/** The read side one row provides as its status service. */
export interface RowStatusView {
  readonly row: HealthRow
  /** The row's items, computed when asked; the same pure function the row's projection feeds. */
  readonly items: (sessionId: string | undefined) => readonly StatusItem[]
}

/** The cordis service name of one row's status view. */
export function statusServiceName(row: HealthRow): string {
  return `glmHournessStatus/${row}`
}

/**
 * Provide one row's status view. A context without `provide`, or a failing
 * provide (a second instance of the row), keeps the items local and warns
 * once; activation never throws (the same rule as provideRowHealth).
 */
export function provideRowStatus(ctx: Partial<ProvideHost>, row: HealthRow, items: (sessionId: string | undefined) => readonly StatusItem[]): { dispose(): void } {
  const view: RowStatusView = Object.freeze({ row, items })
  const provide = ctx.provide
  if (typeof provide !== 'function') return { dispose: () => {} }
  try {
    return { dispose: provide(statusServiceName(row), view) }
  }
  catch (error) {
    console.warn(`dsh-glm-hourness/${row}: row status not provided: ${(error as Error).message}`)
    return { dispose: () => {} }
  }
}
