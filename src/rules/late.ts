/**
 * The late verdicts of gating scripts (docs/ORCHESTRATION.md §16.16; design
 * §6.7 「超时之后」, §6.4): a script that outlived its timeout keeps running in
 * the background, and when the call it judged was allowed to run, its later
 * word still lands. An exit of 2 is a late block: a line of the violation
 * journal with `mode: 'late'`, a `rules.late-verdict` event, and the main
 * agent told on the spot with the "Late block" paragraph, so it can look at
 * what the call did, fix or revert it, and tell the human. A run ended at the
 * ten-minute cap is told the same way as not finished. Any other later end,
 * and every late word of a call that did not run (the gate's verdict was a
 * block or a deferral), is only recorded. An agent that cannot be reached
 * leaves the words in the board's `notices`, for the main agent's next step
 * on this host; a late block or a capped run degrades the row's health once,
 * delivered or not.
 *
 * This is the one place that waits for the executor's `late` promises. The
 * handler never throws and never rejects: a fault in a journal, a board or a
 * message is a degraded row, not a broken host.
 */
import { openRulesBoard, type RulesBoard } from './engine.ts'
import { createUserNotice, type MessageableAgentLike, type ServiceLookup, type UserNotice } from '../shared/dsh-min.ts'
import type { RowHealth } from '../shared/health.ts'
import { toMetricsId } from '../shared/metrics.ts'
import { emitLateVerdict } from './metrics.ts'
import type { StoreIo } from './store.ts'
import { agentsOf, deliver, walkToRoot } from './wake.ts'
import { signatureOf } from './tickets.ts'
import { localClock } from './denial.ts'
import { callSummary } from './call.ts'
import { reasonOf, type ScriptOutcome } from './script-run.ts'
import type { LateScriptResult } from '../loops/script.ts'
import type { DescribedCall } from './call.ts'

/** Source kind of a late message (design §6.4). */
const LATE_SOURCE = 'hourness-rules-late'
/** The board's words for a run ended at the cap (the executor's `GATE_HARD_CAP_MS`). */
const CAP_MINUTES = 10

/** What the handler needs of the host and the row, the gate's own pieces. */
export interface LateDeps {
  readonly ctx: ServiceLookup
  readonly rulesDir: string | undefined
  readonly now: () => number
  /** The project's violation journal, as the gate writes it. */
  readonly journal: { readonly violation: (record: Record<string, unknown>, cwd: string | undefined) => Promise<unknown> }
  readonly health: RowHealth
  readonly warn: (message: string) => void
  /** The board's file operations, as the row was configured with. */
  readonly io?: StoreIo | undefined
}

/** The call whose script outlived its timeout, as the gate judged it. */
export interface LateCall {
  readonly root: string
  readonly cwd: string
  /** The moment of the judgement, ISO — the call's own time. */
  readonly at: string
  readonly tool: string
  readonly args: unknown
  readonly described: DescribedCall
  readonly agentId?: string | undefined
  readonly sessionId?: string | undefined
  /** Whether the calling session is a subagent, and the session that started it. */
  readonly origin: 'subagent' | undefined
  readonly parentSession?: string | undefined
  /** Whether the call ran: the gate's verdict was neither a block nor a deferral. */
  readonly ran: boolean
}

/** One timed-out script whose failure setting allowed the call, with the background run's promise. */
export interface LateScript {
  readonly rule: string
  readonly outcome: ScriptOutcome & { readonly late: Promise<LateScriptResult> }
  /** The approved bytes' digest, for the journal line. */
  readonly sha256: string
  readonly timeoutSeconds: number
  /** The values of the signals the rule read at the judgement; a value that could not be read is null. */
  readonly signals: Readonly<Record<string, boolean | number | string | null>>
}

const boards = new Map<string, RulesBoard>()

function boardOf(deps: LateDeps, root: string): RulesBoard | undefined {
  let board = boards.get(root)
  if (board === undefined) {
    try {
      board = openRulesBoard({ projectRoot: root, ...(deps.rulesDir === undefined ? {} : { rulesDir: deps.rulesDir }), ...(deps.io === undefined ? {} : { io: deps.io }) })
    }
    catch (error) {
      deps.warn(`the board for a late notice could not be opened: ${error instanceof Error ? error.message : String(error)}`)
      return undefined
    }
    boards.set(root, board)
  }
  return board
}

/** The call as the message and the signature name it: the shell text, the file written, else the arguments. */
const summaryOf = (call: LateCall): string => callSummary(call.described, call.args)

/** Who made the call, as the message says it: the subagent by the tail of its session id, else the main agent. */
function whoOf(call: LateCall): string {
  return call.origin === 'subagent' && call.sessionId !== undefined
    ? `subagent "${call.sessionId.length <= 12 ? call.sessionId : call.sessionId.slice(-8)}"`
    : 'the main agent'
}

/**
 * The agent the words go to: the root of the calling session's dispatch chain
 * (`dispatchRoot`, design §6.7; M3's holder record is not merged yet).
 * `undefined` when there is no root on this host, `'unavailable'` when the
 * registry cannot be asked at all.
 */
function recipientOf(ctx: ServiceLookup, call: LateCall): MessageableAgentLike | undefined | 'unavailable' {
  const agents = agentsOf(ctx)
  if (agents === undefined) return 'unavailable'
  const root = walkToRoot(call.origin === 'subagent' ? call.parentSession : call.sessionId, id => {
    try {
      return agents.get(id)
    }
    catch {
      return 'failed' as const
    }
  })
  return root === 'failed' ? 'unavailable' : root
}

/** The "Late block" paragraph (design §6.4). */
export function lateBlockText(call: LateCall, script: LateScript, reason: string, finishedAt: string): string {
  return `[rules board] Late block: rule ${script.rule}'s script ${script.outcome.file} did not answer within ${script.timeoutSeconds} s on ${call.tool} "${summaryOf(call)}" (${whoOf(call)}, ${localClock(call.at)}), so the call was allowed by the rule's timeout setting. The script finished at ${localClock(finishedAt)} and would have blocked it: "${reason}". Check what the call did; fix or revert it, and tell the human.`
}

/** The capped run's paragraph (design §6.4, the second one). */
export function scriptCappedText(call: LateCall, script: LateScript): string {
  return `[rules board] Rule ${script.rule}'s script did not finish within ${CAP_MINUTES} minutes on ${call.tool} "${summaryOf(call)}" (${whoOf(call)}, ${localClock(call.at)}) and was stopped; the call had been allowed by the rule's timeout setting. If this keeps happening, tell the human the script needs fixing.`
}

/** The notice a message that could not be delivered waits as, in the board's `notices`. */
function noticeOf(kind: 'late-block' | 'script-capped', rule: string, text: string): UserNotice {
  return createUserNotice(LATE_SOURCE, kind, text, { rule })
}

/**
 * Wait for every late run of one call and land what each means (design §6.7).
 * A late block of a call that ran is a journal line with `mode: 'late'` and
 * the main agent told; a capped run is told the same way as not finished;
 * every other later end is only a `rules.late-verdict` event. Never throws,
 * never rejects.
 */
export async function handleLateVerdicts(deps: LateDeps, call: LateCall, scripts: readonly LateScript[]): Promise<void> {
  await Promise.all(scripts.map(async (script) => {
    let result: LateScriptResult
    try {
      result = await script.outcome.late
    }
    catch {
      // The executor's promise never rejects; a stand-in that does is the caller's loss, not the host's.
      return
    }
    const timeoutMs = script.timeoutSeconds * 1000
    const afterMs = Math.max(0, result.durationMs - timeoutMs)
    const sig = signatureOf(call.tool, call.args)
    // A call that did not run cannot be contradicted: every later word is only recorded (design §6.7).
    if (!call.ran) {
      tellMetrics(deps, { event: 'rules.late-verdict', rule: toMetricsId(script.rule), sig, result: result.kind, afterMs, told: false }, call)
      return
    }
    const blocked = result.kind === 'exited' && result.exitCode === 2 ? result : undefined
    const words = result.kind === 'capped'
      ? scriptCappedText(call, script)
      : blocked !== undefined
        ? lateBlockText(call, script, reasonOf(blocked.stderr), new Date(deps.now()).toISOString())
        : undefined
    if (words === undefined) {
      tellMetrics(deps, { event: 'rules.late-verdict', rule: toMetricsId(script.rule), sig, result: result.kind, afterMs, told: false }, call)
      return
    }
    const kind = result.kind === 'capped' ? 'script-capped' as const : 'late-block' as const
    if (kind === 'late-block') {
      // The journal line first, as the gate's refusals do; a journal that cannot be reached never changes the verdict.
      const record = {
        at: new Date(deps.now()).toISOString(),
        rule: `rules:${script.rule}`,
        mode: 'late',
        effect: 'block',
        tool: call.tool,
        ...(call.agentId === undefined ? {} : { agentId: call.agentId }),
        ...(call.sessionId === undefined ? {} : { sessionId: call.sessionId }),
        signals: script.signals,
        script: { path: script.outcome.file, sha256: script.sha256, outcome: result.kind, ms: result.durationMs },
        correction: reasonOf(blocked?.stderr ?? ''),
      }
      try {
        await deps.journal.violation(record, call.cwd)
      }
      catch (error) {
        deps.warn(`a late violation line could not be handed to the journal: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    deps.health.report(call.sessionId, 'degraded', kind === 'late-block' ? `规则 ${script.rule} 的脚本超时后在后台跑完并拦下，调用已经执行` : `规则 ${script.rule} 的脚本超时后跑满上限被结束，没有跑完`)
    const recipient = recipientOf(deps.ctx, call)
    const sent = recipient === undefined || recipient === 'unavailable'
      ? { kind: 'skip' as const }
      : deliver(deps.ctx, recipient.id, noticeOf(kind, script.rule, words))
    const told = sent.kind === 'sent'
    tellMetrics(deps, { event: 'rules.late-verdict', rule: toMetricsId(script.rule), sig, result: result.kind, afterMs, told }, call)
    if (told) return
    // Not on this host, or the words could not be put in front of anybody: the main agent's next step on this host carries them (design §6.7).
    if (sent.kind === 'failed') deps.warn(`the late message of rule ${script.rule} could not be delivered: ${sent.why}`)
    const board = boardOf(deps, call.root)
    if (board === undefined) return
    try {
      const written = await board.apply('harness', { op: 'notice-add', kind, rule: script.rule, text: words })
      if (!written.ok) deps.warn(`the late notice of rule ${script.rule} could not be written: ${written.error.message}`)
    }
    catch (error) {
      deps.warn(`the late notice of rule ${script.rule} could not be written: ${error instanceof Error ? error.message : String(error)}`)
    }
  }))
}

/** Hand the verdict to the metrics; a stream that cannot take it is not the verdict's business. */
function tellMetrics(deps: LateDeps, event: Parameters<typeof emitLateVerdict>[1], call: LateCall): void {
  try {
    emitLateVerdict(deps.ctx, event, { dir: call.root, ...(call.sessionId === undefined ? {} : { sessionId: call.sessionId }) })
  }
  catch (error) {
    deps.warn(`the late-verdict event could not be handed to the metrics: ${error instanceof Error ? error.message : String(error)}`)
  }
}
