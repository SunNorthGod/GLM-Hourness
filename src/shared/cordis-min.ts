/**
 * The two cordis context shapes the shared modules that the client bundle
 * also type-checks need (peak-mode.ts, health.ts, through src/rules/view.ts):
 * looking a service up and providing one. They live apart from dsh-min.ts,
 * which imports Node's crypto and so cannot enter the client's type graph
 * (ui/tsconfig.json has no Node types); dsh-min.ts re-exports both, so rows
 * keep importing host types from there.
 */

/** cordis `ctx.get(name)`: an optional service without the inject requirement; undefined until its fiber is active. */
export interface ServiceLookup {
  get?(name: string): unknown
}

/** cordis `ctx.provide(name, value)`: register a service owned by the calling fiber; the disposer unregisters it (also on unload). */
export interface ProvideHost {
  provide(name: string, value: unknown): () => void
}
