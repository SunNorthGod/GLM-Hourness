/**
 * The service the loop row provides, `glmHournessLoops` (docs/ORCHESTRATION.md
 * §18.4; loop board design 0.6 §3.1): the types and the reader other rows
 * import, and nothing of the loop row's own code. A row hands the board its
 * entries, the events it can tell the board about and the harness actions it
 * runs through `contribute`; the board validates them (registry.ts) and lists
 * them.
 *
 * `LoopsService` has the members that exist: `contribute`, the events and runs
 * of the runtime (`emit`, `listens`, `recordRun`), the two weekly lists
 * the status hub's batch 6 and the weekly report asked for (`staleEntries`,
 * `timeoutEntries`, design §6.11 — the board computes them beside its view,
 * from the metrics journal and the change record, and holds them for the
 * readers), and the three members of the path of a person's agreement
 * (`attachable`, `proposalLine`, `acceptProposal`, design §7.1) — one service,
 * of which `loopsService` checks the hand-over members and `loopsAttachService`
 * the agreement members. The reader checks the members that exist and takes a
 * service that has more.
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
import type { Attachable, AttachService } from '../shared/attach.ts'
import type { HarnessResult, LoopEventRecord } from '../shared/loop-records.ts'
import type { LoopEntryDefinition } from './model.ts'
import type { LoopEventDeclaration } from './trigger.ts'
import type { ViewCheck } from './view.ts'

export type { LoopEventDeclaration, LoopEventField, LoopEventParam } from './trigger.ts'
/** The record a harness action gets and the result it gives; shared with the execute row's service (src/shared/loop-records.ts). */
export type { HarnessResult, LoopEventRecord } from '../shared/loop-records.ts'

/** The cordis service name the loop row provides. */
export const LOOPS_SERVICE = 'glmHournessLoops'

export interface ContributionSource {
  /** The package: dsh-hourness. */
  readonly plugin: string
  /** The row id: glm-hourness/execute. */
  readonly row: string
}


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
  /** For the page only: the checks the entry runs in the project, each with its timeout in the shape the page words (plain-ui 1.3 §8.2). Synchronous, does not throw, at most 10. */
  checks?(entry: string, project: string): readonly ViewCheck[]
}

/** The most lines a hand-over's `details` may give for one entry (loop board design §3.1). */
export const DETAILS_MAX_LINES = 20
/** The most code points of one line of `details`. */
export const DETAILS_MAX_WIDTH = 160

export type ContributeResult =
  | { readonly ok: true, readonly dispose: () => void, readonly accepted: readonly string[], readonly dropped: readonly { readonly id: string, readonly reason: string }[] }
  | { readonly ok: false, readonly reason: string }

/** One of the person's entries the weekly report's first list names (design §3.1, §6.11). */
export interface StaleEntry {
  /** `u-<8 hex digits>`: the id of a person's entry. */
  readonly id: string
  readonly title: string
  /** When the person added it (the change record's earliest add), ISO. */
  readonly addedAt: string
  /** The latest run that ended `delivered`, `ran` or `reported`; absent when no run ever did. */
  readonly lastResultAt?: string
  /** How many runs the last four weeks had, of every outcome. */
  readonly runs28d: number
  /** No run triggered in the four weeks; or runs there were, but none reached a result. */
  readonly why: 'never-triggered' | 'no-result'
}

/** One entry the weekly report's second list names (design §3.1, §6.11, `d-script-timeout`). */
export interface TimeoutEntry {
  readonly id: string
  readonly title: string
  /** How many runs ended `unfinished` in the last seven days. */
  readonly timeouts7d: number
  /** The latest such run, ISO. */
  readonly lastTimeoutAt: string
}

export interface LoopsService {
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
  /**
   * The weekly report's first list (design §6.11): the person's entries of
   * this project that are four weeks old and whose last four weeks hold no
   * run that reached a result, at most three, the stalest first. Memory
   * only, does not throw; undefined when this process does not run the
   * project (the report then says the board is not in this DSH process).
   */
  staleEntries(project: string, now: Date): readonly StaleEntry[] | undefined
  /**
   * The weekly report's second list (design §6.11, `d-script-timeout`): the
   * entries of this project with three or more `unfinished` runs in the last
   * seven days, a person's and a plugin's alike, at most three, the most
   * timeouts first. Undefined as `staleEntries` is.
   */
  timeoutEntries(project: string, now: Date): readonly TimeoutEntry[] | undefined
  /**
   * The members of the path of a person's agreement (design §7.1), which the
   * design row (M3) reads through `loopsAttachService`: `attachable` before a
   * proposal is put to the human and again before their words are recorded
   * (the stored detail, never recomputed), `proposalLine` for the last line of
   * the question, `acceptProposal` once the human agreed, resolving to the
   * line the main agent is told. Neither throws. Optional on the type: a
   * reader that needs them checks they are there, the way `loopsService`
   * checks the hand-over members.
   */
  attachable?(request: { readonly cwd: string | undefined, readonly proposal: string }): Attachable
  proposalLine?(id: string): string
  acceptProposal?(request: { readonly questionId: string, readonly graphDir: string, readonly cwd: string | undefined, readonly by: { readonly actor: 'human' | 'llm', readonly relay?: string } }): Promise<string>
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
  if (typeof members.contribute === 'function' && typeof members.emit === 'function' && typeof members.listens === 'function' && typeof members.recordRun === 'function') return value as LoopsService
  problem?.(`${LOOPS_SERVICE} has the wrong shape; the row cannot hand its entries over`)
  return undefined
}

/** The last line of the question that carries a loop proposal: names the proposal and nothing else (loop board design §7.1 step 2). */
export function loopProposalLine(proposal: string): string {
  return `循环板提议 \`${proposal}\``
}

const PROPOSAL_LINE_PATTERN = /循环板提议 `(lp-[0-9a-f]{8})`\s*$/

/** The loop proposal a question body ends with; undefined when it ends with none of this board's. The inverse of `loopProposalLine`. */
export function loopProposalIdOf(body: string): string | undefined {
  return PROPOSAL_LINE_PATTERN.exec(body)?.[1]
}

/**
 * The members of the path of a person's agreement on the loop board's service,
 * as the design row (M3, src/design/attach.ts) reads them for
 * `attach: 'loops:<proposal>'`: undefined while the loop row is off, or while
 * the service there does not have them. The row's service carries these
 * beside the ones `loopsService` checks, so a wider service reads as both.
 */
export function loopsAttachService(ctx: ServiceLookup): AttachService | undefined {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get(LOOPS_SERVICE) : undefined
  const members = value as Partial<Record<keyof AttachService, unknown>> | undefined
  return typeof members?.attachable === 'function' && typeof members.proposalLine === 'function' && typeof members.acceptProposal === 'function' ? value as AttachService : undefined
}
