/**
 * glm-hourness/loops row entry (docs/ORCHESTRATION.md §18): the loop board. The
 * board lists what is done when something happens or the time comes: entries
 * from the rows that own them and from the people who add their own. This is
 * the skeleton of the row; what it does so far:
 * - provides the service `glmHournessLoops` (service.ts): a row hands its entries,
 *   events and harness actions to `contribute`, and the registry (registry.ts)
 *   validates them, holds them and lists what waits for an event nobody declares;
 * - hands over the loop row's own events (events.ts) as the always-there part of
 *   the event table, and its own four entries (defaults.ts);
 * - reports its health: ready, or degraded with each thing a hand-over got wrong.
 *
 * It listens to no event, runs no entry, stores nothing and registers no tool,
 * command or projection yet: those come with the storage, the inbox and the
 * runner. Activation never throws. A service that cannot be provided makes the
 * row inactive with the reason, and a host without `provide` the same. The row
 * ships disabled (packages/hourness/cordis.patch.yml).
 */
import type { ProvideHost } from '../shared/dsh-min.ts'
import { provideRowHealth, type HealthState, type RowHealth } from '../shared/health.ts'
import { LOOP_CONTRIBUTION, LOOP_DEFAULTS } from './defaults.ts'
import { createRegistry, LOOPS_SOURCE } from './registry.ts'
import { LOOPS_SERVICE, type LoopsService } from './service.ts'

/** cordis plugin identity. */
export const name = 'dsh-glm-hourness/loops'

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** cordis plugin entry: provide the service and the row health, hand over the row's own entries. Activation never throws. */
export function apply(ctx: Partial<ProvideHost>): () => void {
  if (typeof ctx.provide !== 'function') {
    console.warn(`${name}: the host has no provide; the loop board cannot hand out ${LOOPS_SERVICE} and stays off`)
    const off = provideRowHealth(ctx, 'loops', 'inactive', `宿主没有 provide，循环板的服务 ${LOOPS_SERVICE} 提供不了`)
    return () => { off.dispose() }
  }
  const problems: string[] = []
  const activation = (): readonly [HealthState, string] => problems.length === 0
    ? ['active', `服务 ${LOOPS_SERVICE} 已就绪，循环板自己的 ${LOOP_DEFAULTS.length} 项条目已登记`]
    : ['degraded', [`服务 ${LOOPS_SERVICE} 已就绪`, ...problems].join('；')]
  const health: RowHealth = provideRowHealth(ctx, 'loops', 'inactive', `服务 ${LOOPS_SERVICE} 还没提供`)
  const registry = createRegistry({
    report: (text) => {
      problems.push(text)
      health.reactivate(...activation())
    },
  })
  // What the contract says and no more: other rows get `contribute`, not the registry's readers.
  const service: LoopsService = { contribute: (source, contribution) => registry.contribute(source, contribution) }
  let withdraw: () => void
  try {
    withdraw = ctx.provide(LOOPS_SERVICE, service)
  }
  catch (error) {
    console.warn(`${name}: ${LOOPS_SERVICE} is not provided, no row can hand entries to the loop board: ${message(error)}`)
    health.reactivate('inactive', `服务 ${LOOPS_SERVICE} 没提供上：${message(error)}`)
    return () => { health.dispose() }
  }
  health.reactivate(...activation())
  const own = registry.contribute(LOOPS_SOURCE, LOOP_CONTRIBUTION)
  return () => {
    if (own.ok) own.dispose()
    withdraw()
    health.dispose()
  }
}
