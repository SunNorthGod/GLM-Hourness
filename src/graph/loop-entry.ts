/**
 * What the graph row hands the loop board (m4 design §6.8, `d-rules-visible`):
 * the event `graph.third-reopen` and the entry `graph.third-rework`, whose
 * action is `self` — the row files the third-rework question itself and the
 * board only lists it. The event is `listedOnly`: the board never receives
 * it, so nothing is emitted; the only runtime report is `recordRun` per
 * filed question (tools.ts). The hand-over goes through `ctx.inject` at
 * activation, so the board arriving later or restarting re-hands it and the
 * disposer withdraws it; where the host has no inject, every agent/created
 * re-hands the same source, which replaces wholesale. A refused hand-over is
 * warned once, kept on the row health, and asking goes on either way.
 */
import type { ServiceLookup } from '../shared/dsh-min.ts'
import { REOPEN_LIMIT } from './reopen.ts'
import { LOOPS_SERVICE, loopsService, type Contribution, type ContributeResult, type ContributionSource, type LoopEventDeclaration } from '../loops/service.ts'
import type { LoopEntryDefinition } from '../loops/model.ts'

/** The source line of the graph row's hand-over (design §6.8's table). */
export const GRAPH_ROW_SOURCE: ContributionSource = { plugin: 'dsh-hourness', row: 'glm-hourness/graph' }

/** The event of the third reopen; no fields, listed only (design §6.8's table). */
export const THIRD_REOPEN_EVENT: LoopEventDeclaration = {
  id: 'graph.third-reopen',
  title: '同一件活第三次重开',
  fields: [],
  personSelectable: false,
  listedOnly: true,
}

/** The board's line for the question's own rule, built from the constant like every ownRules sentence. */
export function thirdReworkRule(limit: number = REOPEN_LIMIT): string {
  return `LLM 第 ${limit} 次重开同一件活时问你；你答过之后再数 ${limit} 次`
}

/** The entry the board lists: what the row does on a third reopen. */
export function thirdReworkEntry(rule: string = thirdReworkRule()): LoopEntryDefinition {
  return {
    id: 'graph.third-rework',
    title: '同一件活第三次返工之前：停下问你',
    why: '同一处反复修不好，常常是问题没找对',
    when: { kind: 'event', events: [THIRD_REOPEN_EVENT.id] },
    action: { kind: 'self', does: '在这件活下面提一件要你定的事，由主 Agent 在对话里问你', by: 'glm-hourness/graph' },
    ownRules: [rule],
  }
}

/** The graph row's whole hand-over: one event, one entry, no details (design §6.8: 不给). */
export function graphContribution(): Contribution {
  return { events: [THIRD_REOPEN_EVENT], entries: [thirdReworkEntry()] }
}

/** Hand the contribution over through the loops service read from `ctx`; undefined when the board is not here. Refusals and drops go to `report`. */
function handOverLoops(ctx: ServiceLookup, report: (message: string) => void): (() => void) | undefined {
  const service = loopsService(ctx, report)
  if (service === undefined) return undefined
  const result = service.contribute(GRAPH_ROW_SOURCE, graphContribution())
  reportProblems(result, report)
  return result.ok ? () => { result.dispose() } : undefined
}

/** A refused hand-over and every dropped piece get one line each, with the board's reason. */
function reportProblems(result: ContributeResult, report: (message: string) => void): void {
  if (!result.ok) {
    report(`交给循环板的 graph.third-rework 没被收下：${result.reason}`)
    return
  }
  for (const dropped of result.dropped) report(`交给循环板的 ${dropped.id} 没被收下：${dropped.reason}`)
}

/** What the wiring needs of the row's context. */
export interface LoopEntryHost extends ServiceLookup {
  /** cordis inject when the host has it; a package-provided service is reached by name. */
  inject?(names: readonly string[], callback: (sub: ServiceLookup) => (() => void) | void): unknown
  /** Awaited serially at agent creation; without inject the hand-over rides it. */
  on(event: 'agent/created', listener: () => Promise<void> | void): () => void
}

/**
 * Install the hand-over: through inject when the host has it (the board's
 * disposer withdraws it when the loops service leaves), otherwise once per
 * agent/created. Problems reach `report` at most once per message, so a
 * restarting board does not churn the health line.
 */
export function installLoopEntry(ctx: LoopEntryHost, report: (message: string, sessionId?: string) => void): () => void {
  const told = new Set<string>()
  const once = (message: string, sessionId?: string): void => {
    if (told.has(message)) return
    told.add(message)
    report(message, sessionId)
  }
  if (typeof ctx.inject === 'function') {
    try {
      ctx.inject([LOOPS_SERVICE], sub => handOverLoops(sub, once))
    }
    catch (error) {
      once(`交给循环板的 graph.third-rework 没有交上：${error instanceof Error ? error.message : String(error)}`)
    }
    return () => {}
  }
  return ctx.on('agent/created', () => { handOverLoops(ctx, once) })
}
