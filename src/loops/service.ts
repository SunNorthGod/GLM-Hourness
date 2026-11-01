/**
 * The service the loop row provides, `glmHournessLoops` (docs/ORCHESTRATION.md
 * §18.4; loop board design 0.6 §3.1): the types and the reader other rows
 * import, and nothing of the loop row's own code. A row hands the board its
 * entries, the events it can tell the board about and the harness actions it
 * runs through `contribute`; the board validates them (registry.ts) and lists
 * them.
 *
 * `LoopsService` has the members that exist. `contribute` is built; the
 * members for events and runs (`emit`, `listens`, `recordRun`) arrive with the
 * runtime that has an inbox and a run record, and the members of the path of a
 * person's agreement (`attachable`, `acceptProposal`, `staleEntries`,
 * `timeoutEntries`) with that path, which is not built yet. The reader checks
 * the members that exist and takes a service that has more.
 *
 * The declarations of events (`LoopEventDeclaration` and the types in it) are
 * defined in trigger.ts, which both boards share, and are exported here under
 * their own names, so a row imports all it needs to hand something over from
 * this file.
 */
import type { ServiceLookup } from '../shared/dsh-min.ts'
import type { LoopEntryDefinition } from './model.ts'
import type { LoopEventDeclaration } from './trigger.ts'

export type { LoopEventDeclaration, LoopEventField, LoopEventParam } from './trigger.ts'

/** The cordis service name the loop row provides. */
export const LOOPS_SERVICE = 'glmHournessLoops'

export interface ContributionSource {
  /** The package: dsh-hourness. */
  readonly plugin: string
  /** The row id: glm-hourness/execute. */
  readonly row: string
}

/** One event of the inbox, with what was merged into the same run by the debounce. */
export interface LoopEventRecord {
  /** ev-<16 hex digits> */
  readonly id: string
  readonly event: string
  readonly at: string
  /** The absolute path of the project root. */
  readonly project: string
  readonly session?: string
  readonly key: string
  readonly payload: Readonly<Record<string, unknown>>
  readonly merged: readonly { readonly id: string, readonly key: string, readonly payload: Readonly<Record<string, unknown>> }[]
}

export type HarnessResult =
  | { readonly outcome: 'done', readonly tell?: string }
  | { readonly outcome: 'skipped', readonly reason: string }
  | { readonly outcome: 'failed', readonly reason: string, readonly tell?: string }

export interface Contribution {
  readonly events?: readonly LoopEventDeclaration[]
  readonly entries: readonly LoopEntryDefinition[]
  /** The harness actions this row runs; an entry's harness action can only be one listed here. */
  readonly actions?: readonly { readonly id: string, readonly title: string }[]
  /** The board calls it to run a harness action. It does not throw: a failure is in the result. Required when `actions` is not empty. */
  run?(action: string, event: LoopEventRecord): Promise<HarnessResult>
  /** For the page only: the lines shown when an entry is opened. Synchronous, does not throw, at most 20 lines of 160 code points. */
  details?(entry: string, project: string): readonly string[]
}

export type ContributeResult =
  | { readonly ok: true, readonly dispose: () => void, readonly accepted: readonly string[], readonly dropped: readonly { readonly id: string, readonly reason: string }[] }
  | { readonly ok: false, readonly reason: string }

export interface LoopsService {
  /**
   * Hand over entries, events and actions at activation. The same source handing over again replaces its earlier
   * hand-over whole. Does not throw. `accepted` are the ids of the entries that stand (an entry that waits for an
   * event nobody declares yet stands, greyed); `dropped` is what did not pass, with the path of the field and why.
   */
  contribute(source: ContributionSource, contribution: Contribution): ContributeResult
}

/** Read the service; undefined while the loop row is off, or when `contribute` has the wrong type (reported to `problem`). */
export function loopsService(ctx: ServiceLookup, problem?: (message: string) => void): LoopsService | undefined {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get(LOOPS_SERVICE) : undefined
  if (value === undefined || value === null) return undefined
  if (typeof (value as Partial<Record<keyof LoopsService, unknown>>).contribute === 'function') return value as LoopsService
  problem?.(`${LOOPS_SERVICE} has the wrong shape; the row cannot hand its entries over`)
  return undefined
}
