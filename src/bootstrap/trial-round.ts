/**
 * When a trial round starts and what it leaves (takeover design 0.6 §6.3):
 * the row's step listener calls `maybeStartRound` on every step of the main
 * agent with an open takeover. An existing project or gaps takeover starts
 * a round once `norm-merge-gate` proposed in this takeover is on the graph;
 * a new project once its first tool node or `norm-merge-gate` is, and then
 * only the probes run (there is no code yet). A round runs in the
 * background, one at a time per host process; the same plan (head and
 * command texts) is not started twice. Each command's result is a journal
 * `trial` record and a `bootstrap.trial` metrics event; the end of a round
 * is a notice to the main agent (`steer` while it runs, `followup` when
 * idle). `bootstrap_review` (B7) starts the later rounds.
 */
import { createHash } from 'node:crypto'
import type { LoadedGraph } from '../graph/parse.ts'
import type { SandboxLike, UserNotice } from '../shared/dsh-min.ts'
import { createUserNotice } from '../shared/dsh-min.ts'
import type { EmittedEvent } from '../shared/metrics.ts'
import { wrapSystemReminder } from '../shared/zcode-notice.ts'
import { kindOf } from './extract.ts'
import { proposedSinceOpen } from './gaps.ts'
import { afterTrialText, classTimeout, durationText } from './present.ts'
import { BOOTSTRAP_SOURCE } from './notice.ts'
import type { ScanResult } from './scan.ts'
import { appendTakeover, type OpenTakeover } from './takeover.ts'
import { readTrialFile, runTrial, type TrialFile, type TrialResult } from './trial.ts'
import { defaultTexts, probesOf, trialCommands, TRIAL_MINUTES_DEFAULT, type TrialCommand } from './trial-plan.ts'

const MERGE_GATE_ID = 'norm-merge-gate'

export interface RoundDeps {
  readonly sandbox: () => SandboxLike | undefined
  readonly emit: (event: EmittedEvent, dir: string) => void
  /** Hand a notice to the main agent (steer while running, followup when idle). */
  readonly notify: (notice: UserNotice) => void
  readonly trialMinutes: number
  readonly platform?: NodeJS.Platform
  /** Options passed to runTrial in tests (a temp directory, a short command limit). */
  readonly runOptions?: { readonly tmp?: string, readonly commandMs?: number }
}

export interface RoundStart {
  readonly root: string
  readonly takeover: OpenTakeover
  readonly graph: LoadedGraph
  readonly scan: ScanResult
  readonly files: readonly string[]
}

/** The rounds running in this process, by project root. */
const RUNNING = new Map<string, Promise<TrialFile>>()

/** The plan of a round: the head and the command texts with their kinds; the same plan runs once. */
function planKeyOf(head: string, commands: readonly TrialCommand[], probes: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify([head, commands.map(command => [command.kind, command.node, command.text, command.refused ?? '']), probes])).digest('hex').slice(0, 12)
}

/** The counts of a finished round, for the notice and the status line. */
function roundCounts(file: TrialFile): { readonly passed: number, readonly failed: number, readonly limited: number, readonly notRun: number, readonly timedOut: number } {
  const count = (test: (result: TrialResult) => boolean): number => file.results.filter(test).length
  return {
    passed: count(result => result.outcome === 'passed'),
    failed: count(result => result.outcome === 'failed' || result.outcome === 'denied'),
    limited: count(result => result.outcome === 'confinement-limited'),
    notRun: count(result => result.outcome === 'not-run' || result.outcome === 'sandbox-broken'),
    timedOut: count(result => result.outcome === 'timed-out'),
  }
}

/**
 * The lines `/hourness-init status` adds for the trial (§3.2): the round's
 * progress, and one line per timed-out command with the command, the
 * limit, the time used and what happens next (`afterTrialText`, word for
 * word the list's). The metrics design has the `bootstrap.trial` kind, but
 * no morning report reads it yet, so the timeout line says so (F18).
 */
export function trialStatusLines(file: TrialFile | undefined): string[] {
  if (file === undefined) return ['试跑：还没开始（项目图上有了合入前的检查才开始）。']
  const counts = roundCounts(file)
  const head = file.done
    ? `试跑第 ${file.round} 轮跑完：${counts.passed} 条过了，${counts.failed} 条没过，${counts.limited + counts.timedOut} 条在隔离里没跑出结论，${counts.notRun} 条没试跑${file.reason === undefined ? '' : `（${file.reason}）`}。`
    : `试跑第 ${file.round} 轮在跑：已有 ${file.results.length} 条结果。`
  const timedOut = file.results.filter(result => result.outcome === 'timed-out').map((result) => {
    const ranSec = (result.ms ?? result.limitMs) / 1000
    const timeout = classTimeout(result.cls, result.estimateSec)
    return `试跑：\`${result.text}\` 超过上限 ${durationText(result.limitMs / 1000, 'gate')}（已跑 ${durationText(ranSec, 'gate')}），整棵进程树已结束；${afterTrialText(result.cls, timeout, ranSec)}。晨报里还没有。`
  })
  return [head, ...timedOut]
}

/** Whether a gate command is a checker (§5.6 item 4: lint, typecheck, format check, dead code, duplicates), not a test, setup or build. */
export function isCheckerCommand(text: string): boolean {
  const kind = kindOf(text)
  if (kind === 'lint' || kind === 'typecheck' || kind === 'format-check') return true
  const words = text.toLowerCase().split(/[^a-z0-9]+/)
  return words.some(word => word === 'knip' || word === 'jscpd' || word === 'vulture' || word === 'deadcode')
}

/**
 * The checker commands of the merge gate that the trial found red on HEAD
 * (§5.6 items 4 and 5; paths #4): `failed` ones fail on the code as it is,
 * `limited` ones gave no result in isolation, so no baseline. Until M7 has
 * the `changed` form, neither goes into the gate. A test command stays
 * whatever its result (`d-tests-required-gate`).
 */
export function redCheckers(file: TrialFile | undefined): { readonly failed: readonly string[], readonly limited: readonly string[] } {
  const gate = (file?.results ?? []).filter(result => (result.kind === 'gate' || result.kind === 'when') && isCheckerCommand(result.text) && result.afterSetupFailure !== true)
  return {
    failed: [...new Set(gate.filter(result => result.outcome === 'failed' || result.outcome === 'denied').map(result => result.text))],
    limited: [...new Set(gate.filter(result => result.outcome === 'confinement-limited' || result.outcome === 'timed-out').map(result => result.text))],
  }
}

/** The notice that a round finished (§6.3). */
export function finishedNotice(takeoverId: string, file: TrialFile): UserNotice {
  const counts = roundCounts(file)
  const text = `Takeover ${takeoverId}: trial finished: ${counts.passed} passed, ${counts.failed} failed, ${counts.limited + counts.timedOut} not conclusive in isolation, ${counts.notRun} not run${file.reason === undefined ? '' : ` (${file.reason})`}; results in .llm/bootstrap/${takeoverId}/trial.json; the next reminder says what to change in norm-merge-gate.`
  return createUserNotice(BOOTSTRAP_SOURCE, `takeover ${takeoverId} trial round ${file.round} finished`, wrapSystemReminder(text), { bootstrap: { takeover: takeoverId, trial: file.round } })
}

/** Whether the takeover's set has what starts a round (§6.3): its own merge gate; for a new project also a tool node. */
function ready(graph: LoadedGraph, takeover: OpenTakeover): boolean {
  if (graph.nodes.has(MERGE_GATE_ID) && proposedSinceOpen(graph, MERGE_GATE_ID, takeover.openedAt)) return true
  return takeover.path === 'new' && [...graph.nodes.values()].some(node => node.type === 'tool' && node.parent === 'env' && proposedSinceOpen(graph, node.id, takeover.openedAt))
}

/** The tool nodes under env this takeover proposed. */
const takeoverTools = (graph: LoadedGraph, takeover: OpenTakeover) => [...graph.nodes.values()].filter(node => node.type === 'tool' && node.parent === 'env' && proposedSinceOpen(graph, node.id, takeover.openedAt))

/**
 * Start a round in the background when one is due; the promise of the
 * running round, or undefined when none was started. Never throws.
 */
export function maybeStartRound(start: RoundStart, deps: RoundDeps): Promise<TrialFile> | undefined {
  const { root, takeover, graph, scan, files } = start
  if (RUNNING.has(root) || !ready(graph, takeover)) return undefined
  const fresh = takeover.path === 'new'
  const head = scan.git.state === 'repo' ? scan.git.head : undefined
  const platform = deps.platform ?? process.platform
  const commands = fresh || head === undefined ? [] : trialCommands(graph.nodes.get(MERGE_GATE_ID), takeoverTools(graph, takeover), files, { scan, defaults: defaultTexts(scan, files, platform, false) })
  const probes = probesOf(scan, fresh)
  const planKey = planKeyOf(head ?? '', commands, probes)
  const previous = readTrialFile(root, takeover.id)
  // The same plan runs once; a round of it left unfinished by a host that died is picked up (§9.2): settled results are reused, the rest run.
  const resumed = previous?.planKey === planKey
  if (resumed && previous.done) return undefined
  const round = resumed ? previous.round : (previous?.round ?? 0) + 1
  const minutes = Number.isInteger(deps.trialMinutes) && deps.trialMinutes >= 1 && deps.trialMinutes <= 240 ? deps.trialMinutes : TRIAL_MINUTES_DEFAULT
  const settled = async (result: TrialResult): Promise<void> => {
    await appendTakeover(root, takeover.id, [{
      op: 'trial',
      data: { round, commandId: result.commandId, outcome: result.outcome, limitMs: result.limitMs, limitSource: result.limitSource, envKey: result.envKey, ...result.ms === undefined ? {} : { ms: result.ms }, ...result.log === undefined ? {} : { log: result.log } },
    }]).catch(() => false)
    deps.emit({ k: 'bootstrap.trial', by: 'bootstrap', body: { commandId: result.commandId, round, outcome: result.outcome, limitMs: result.limitMs, limitSource: result.limitSource, envKey: result.envKey === '' ? 'none' : result.envKey, ...result.ms === undefined ? {} : { ms: result.ms } } }, root)
  }
  const running = runTrial({
    root, takeoverId: takeover.id, head: head ?? '', round, commands, probes, sandbox: deps.sandbox(), totalMs: minutes * 60_000, planKey, settled, platform,
    ...previous === undefined ? {} : { previous },
    ...deps.runOptions?.tmp === undefined ? {} : { tmp: deps.runOptions.tmp },
    ...deps.runOptions?.commandMs === undefined ? {} : { commandMs: deps.runOptions.commandMs },
  }).then((file) => {
    try {
      deps.notify(finishedNotice(takeover.id, file))
    }
    catch {
      // The notice is a convenience; trial.json and the status carry the results.
    }
    return file
  }).finally(() => { RUNNING.delete(root) })
  RUNNING.set(root, running)
  return running
}
