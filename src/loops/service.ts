/**
 * The service the loop row provides, `glmHournessLoops` (docs/ORCHESTRATION.md
 * §18.4; loop board design 0.6 §3.1): the types and the reader other rows
 * import, and nothing of the loop row's own code. A row hands the board its
 * entries, the events it can tell the board about and the harness actions it
 * runs through `contribute`; the board validates them (registry.ts) and lists
 * them.
 *
 * `LoopsService` has the members that exist: `contribute`, the events and runs
 * of the runtime (`emit`, `listens`, `recordRun`), and the line the guard adds
 * to its prompt section while this row is on (`declaration`, as the rules
 * service has it). The members of the path of a person's agreement
 * (`attachable`, `acceptProposal`, `staleEntries`, `timeoutEntries`) arrive
 * with that path, which is not built yet. The reader checks the members that
 * exist and takes a service that has more.
 *
 * The service is handed out only in a process that has a session controller,
 * which is the one process that can reach a session and deliver (design §3.1,
 * §6.1): a row that does not find it runs its own event entries itself.
 *
 * The declarations of events (`LoopEventDeclaration` and the types in it) are
 * defined in trigger.ts, which both boards share, and are exported here under
 * their own names, so a row imports all it needs to hand something over from
 * this file, together with the one way of handing it over
 * (`installContribution`), which the graph row and the env row share.
 */
import type { ServiceLookup } from '../shared/dsh-min.ts'
import type { LoopEntryDefinition } from './model.ts'
import type { LoopEventDeclaration } from './trigger.ts'

export type { LoopEventDeclaration, LoopEventField, LoopEventParam } from './trigger.ts'

/** The cordis service name the loop row provides. */
export const LOOPS_SERVICE = 'glmHournessLoops'

/** The line the guard's `glm:guard` section ends with while the loop board is on. It does not change with the entries, so it does not change the prompt cache. */
export const LOOPS_DECLARATION = 'The loop board keeps the loops the human agreed to in docs/loops/ and .llm/loops/; only the board writes there, and a write to those files with a file tool or the shell is denied.'

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

/** One event a row hands over (design §3.1). */
export interface LoopEventInput {
  readonly event: string
  /** The working directory of the session it happened in; the project is read from it (design §2.1). */
  readonly cwd: string
  /** The session it is about (the execute row hands the holder session over). */
  readonly session?: string
  /**
   * The dedupe key, 1 to 200 characters, which says *this occurrence*:
   * `<event without its namespace>:<subject>:<what makes this occurrence this
   * one>`, at least three parts and none of them empty (design §4, the key
   * column of each table). One key is run once in seven days in one project.
   */
  readonly key: string
  readonly payload: Readonly<Record<string, unknown>>
}

export type EmitResult =
  | { readonly ok: true, readonly id: string, readonly duplicate: boolean }
  /** This process runs the project, has read the entries, and no entry that could run hears the event: nothing was written and no key was kept. */
  | { readonly ok: true, readonly duplicate: false, readonly unheard: true }
  | { readonly ok: false, readonly code: 'unknown-event' | 'invalid' | 'no-project' | 'busy' | 'io', readonly message: string }

/** One run of a `self` entry, reported by the row that ran it (design §3.1). */
export interface ListedRun {
  readonly cwd: string
  readonly entry: string
  readonly outcome: 'ran' | 'reported' | 'skipped' | 'failed'
  readonly durationMs?: number
  readonly exits?: readonly number[]
  /** One line, at most 120 code points. */
  readonly reason?: string
}

export interface Contribution {
  readonly events?: readonly LoopEventDeclaration[]
  readonly entries: readonly LoopEntryDefinition[]
  /** The harness actions this row runs; an entry's harness action can only be one listed here. */
  readonly actions?: readonly { readonly id: string, readonly title: string }[]
  /** The board calls it to run a harness action. It does not throw: a failure is in the result. Required when `actions` is not empty. */
  run?(action: string, event: LoopEventRecord): Promise<HarnessResult>
  /**
   * For the page only: the lines shown when an entry is opened, for the project root given. Synchronous, does not
   * throw, at most `DETAILS_MAX_LINES` lines of `DETAILS_MAX_WIDTH` code points. The board calls it each time it
   * writes view.json; an answer that throws or does not keep to this is shown as unreadable and told to the row health.
   */
  details?(entry: string, project: string): readonly string[]
}

/** The most lines a hand-over's `details` may give for one entry (loop board design §3.1). */
export const DETAILS_MAX_LINES = 20
/** The most code points of one line of `details`. */
export const DETAILS_MAX_WIDTH = 160

export type ContributeResult =
  | { readonly ok: true, readonly dispose: () => void, readonly accepted: readonly string[], readonly dropped: readonly { readonly id: string, readonly reason: string }[] }
  | { readonly ok: false, readonly reason: string }

export interface LoopsService {
  /** The line for the guard's prompt section. */
  readonly declaration: string
  /**
   * Hand over entries, events and actions at activation. The same source handing over again replaces its earlier
   * hand-over whole. Does not throw. `accepted` are the ids of the entries that stand (an entry that waits for an
   * event nobody declares yet stands, greyed); `dropped` is what did not pass, with the path of the field and why.
   */
  contribute(source: ContributionSource, contribution: Contribution): ContributeResult
  /**
   * Hand one event over: it is checked and appended to the project's inbox,
   * whoever runs that project (design §6.3). Does not throw and the promise is
   * not rejected; a write that could not be made is retried three times inside
   * ten seconds before the result says `busy` or `io`. A caller on a hot path
   * need not await it.
   */
  emit(event: LoopEventInput): Promise<EmitResult>
  /**
   * Whether an entry that could run now hears this event in this project
   * (`self` entries do not count: they do not read the inbox). Memory only,
   * does not throw. True when this process does not run the project or has not
   * read its entries yet: the event is handed over and whoever holds the lock
   * judges it.
   */
  listens(event: string, cwd: string): boolean
  /** One run of a `self` entry, reported by the row that ran it; the id of an entry that is not a listed one is dropped. Does not throw. */
  recordRun(run: ListedRun): void
}

/** What a contributing row's context needs for `installContribution`. */
export interface ContributionHost extends ServiceLookup {
  /** cordis inject when the host has it; a package-provided service is reached by name. */
  inject?(names: readonly string[], callback: (sub: ServiceLookup) => (() => void) | void): unknown
  /** Awaited serially at agent creation; without inject the hand-over rides it. */
  on(event: 'agent/created', listener: () => Promise<void> | void): () => void
}

/**
 * How a row hands its contribution to the board (loop board design 0.6 §3.1, m4 design §6.8): through `inject` when the
 * host has it, so the board arriving later or restarting gets it again and the board's leaving withdraws it; otherwise
 * once per `agent/created`, where the same source handing over again replaces its earlier hand-over. A refused
 * hand-over and every dropped piece reach `report` once per message, named after `label` and the piece, so a
 * restarting board does not churn the row's health line. Never throws.
 */
export function installContribution(ctx: ContributionHost, source: ContributionSource, contribution: () => Contribution, label: string, report: (message: string) => void): () => void {
  const told = new Set<string>()
  const once = (message: string): void => {
    if (told.has(message)) return
    told.add(message)
    report(message)
  }
  const handOver = (sub: ServiceLookup): (() => void) | undefined => {
    const service = loopsService(sub, once)
    if (service === undefined) return undefined
    const result = service.contribute(source, contribution())
    if (!result.ok) {
      once(`交给循环板的 ${label} 没被收下：${result.reason}`)
      return undefined
    }
    for (const dropped of result.dropped) once(`交给循环板的 ${dropped.id} 没被收下：${dropped.reason}`)
    return () => { result.dispose() }
  }
  if (typeof ctx.inject === 'function') {
    try {
      ctx.inject([LOOPS_SERVICE], handOver)
    }
    catch (error) {
      once(`交给循环板的 ${label} 没有交上：${error instanceof Error ? error.message : String(error)}`)
    }
    return () => {}
  }
  return ctx.on('agent/created', () => { handOver(ctx) })
}

/** Read the service; undefined while the loop row is off, or when a member has the wrong type (reported to `problem`). */
export function loopsService(ctx: ServiceLookup, problem?: (message: string) => void): LoopsService | undefined {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get(LOOPS_SERVICE) : undefined
  if (value === undefined || value === null) return undefined
  const members = value as Partial<Record<keyof LoopsService, unknown>>
  if (typeof members.contribute === 'function' && typeof members.emit === 'function' && typeof members.listens === 'function' && typeof members.recordRun === 'function'
    && typeof members.declaration === 'string' && members.declaration.length > 0) return value as LoopsService
  problem?.(`${LOOPS_SERVICE} has the wrong shape; the row cannot hand its entries over`)
  return undefined
}
