/**
 * The time limit of M4's own checks (M4 design §6.3.1, decision
 * d-timeout-measured): three times the run time, not under the floor and not
 * over the ceiling. The first run time is the estimate the agent wrote on the
 * check line; after real runs it is the slowest of the recent ones; with
 * neither the limit is the ceiling. The human sees the limit next to the
 * check line when approving the tool node: `timeoutText` writes that
 * sentence from the same constants, and the graph tools return it for every
 * readable check line of an environment tool node (`envToolTimeouts`),
 * recording each estimate they wrote in the project's timing journal
 * (`estimateLines`, `appendTiming`). This file is the one place the numbers
 * are written; everything else reads them from here.
 */
import { createHash } from 'node:crypto'
import { appendFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { GraphNode } from '../graph/schema.ts'
import { isEnvTool, nodeChecks } from './branch.ts'

/** The limit is this many times the run time. */
export const CHECK_TIMEOUT_FACTOR = 3
/** The run time is the slowest of this many recent runs. */
export const CHECK_RECENT_RUNS = 10
/** No limit is shorter: a cold start or a virus scan makes a one-second check slower now and then. */
export const CHECK_TIMEOUT_FLOOR_MS = 5_000
/** No limit is longer unless the main agent raises it for one check; with no estimate and no run the limit is this. */
export const CHECK_TIMEOUT_CAP_MS = 60_000

/** One check's limit and where its run time came from. */
interface CheckTimeout {
  readonly limitMs: number
  /** The slowest recent run, the line's estimate, or neither (the ceiling). */
  readonly basis: 'runs' | 'estimate' | 'ceiling'
  /** Set when three times the run time was over the ceiling and the limit was held there. */
  readonly capped?: { readonly wantedMs: number }
}

/**
 * The limit of one check: the factor times the slowest of the last
 * CHECK_RECENT_RUNS entries of `recentMs` (oldest first; a run stopped at its
 * limit counts as that limit), else times the estimate; at least the floor,
 * at most the ceiling (then `capped` says what was wanted). No estimate and
 * no run give the ceiling. Pure.
 */
export function checkTimeout(input: {
  readonly estimateS?: number | undefined
  readonly recentMs: readonly number[]
  readonly factor?: number
  readonly floorMs?: number
  readonly capMs?: number
}): CheckTimeout {
  const factor = input.factor ?? CHECK_TIMEOUT_FACTOR
  const floorMs = input.floorMs ?? CHECK_TIMEOUT_FLOOR_MS
  const capMs = input.capMs ?? CHECK_TIMEOUT_CAP_MS
  const recent = input.recentMs.slice(-CHECK_RECENT_RUNS)
  const basis = recent.length > 0 ? 'runs' : input.estimateS === undefined ? 'ceiling' : 'estimate'
  if (basis === 'ceiling') return { limitMs: capMs, basis }
  const runMs = basis === 'runs' ? Math.max(...recent) : (input.estimateS ?? 0) * 1000
  const wantedMs = Math.max(floorMs, factor * runMs)
  return wantedMs > capMs ? { limitMs: capMs, basis, capped: { wantedMs } } : { limitMs: wantedMs, basis }
}

const seconds = (ms: number): number => ms / 1000

/**
 * The sentence the human reads next to a check line when approving its tool
 * node (design §6.3.1 item 3): the limit of the first run and the estimate it
 * came from, in one of four forms, at most 40 code points. Built from the
 * constants above.
 */
export function timeoutText(estimateS?: number): string {
  const timeout = checkTimeout({ estimateS, recentMs: [] })
  const limit = `超时 ${seconds(timeout.limitMs)} 秒`
  if (estimateS === undefined) return `${limit}（没有估计，先用最长的）`
  if (timeout.capped !== undefined) return `${limit}（估 ${estimateS} 秒，乘 ${CHECK_TIMEOUT_FACTOR} 超过 ${seconds(CHECK_TIMEOUT_CAP_MS)} 秒）`
  if (CHECK_TIMEOUT_FACTOR * estimateS * 1000 < CHECK_TIMEOUT_FLOOR_MS) return `${limit}（估 ${estimateS} 秒，乘 ${CHECK_TIMEOUT_FACTOR} 不足 ${seconds(CHECK_TIMEOUT_FLOOR_MS)} 秒）`
  return `${limit}（估 ${estimateS} 秒，乘 ${CHECK_TIMEOUT_FACTOR}）`
}

/** The key of one check in the journals and in check_limit: `<tool node id>/<check name>`. */
export function checkKey(tool: string, name: string): string {
  return `${tool}/${name}`
}

/** The digest the journals keep a command under: the first 8 hex digits of the SHA-256 of the argument vector as JSON. A changed command starts over. */
export function argvDigest(argv: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(argv)).digest('hex').slice(0, 8)
}

/**
 * An estimate on a check line was written or changed. The graph history
 * entry has no session field, so the graph tools record the session here
 * when graph_propose or graph_edit returns the timeouts; `actor` and
 * `historyAt` copy the history entry the engine just wrote.
 */
export interface EstimateLine {
  readonly kind: 'estimate'
  readonly at: string
  readonly check: string
  readonly argv: string
  readonly estimateS: number
  readonly node: string
  readonly actor: 'llm' | 'human'
  readonly historyAt: string
  readonly session?: string
}

/** The timeout sentence of one check line of a tool node. */
export interface CheckTimeoutText {
  /** The line's name. */
  readonly check: string
  readonly text: string
}

/** The timeouts of an environment tool node, one per readable check line in line order; undefined for any other node. */
export function envToolTimeouts(node: GraphNode): readonly CheckTimeoutText[] | undefined {
  if (!isEnvTool(node)) return undefined
  return nodeChecks(node).map(({ entry }) => ({ check: entry.name, text: timeoutText(entry.estimateSeconds) }))
}

/**
 * The estimates the write that made the node's last history entry put on an
 * environment tool node: a propose puts every check line with an estimate,
 * an edit the lines with an estimate its new acceptance conditions have and
 * its old ones did not have word for word. Any other node or operation puts
 * none. Pure but for `at`.
 */
export function estimateLines(node: GraphNode, session: string | undefined, at: Date): readonly EstimateLine[] {
  const last = node.history.at(-1)
  const actor = last?.actor === 'llm' || last?.actor === 'human' ? last.actor : undefined
  if (!isEnvTool(node) || last === undefined || actor === undefined) return []
  let added: (line: string) => boolean
  if (last.op === 'propose') added = () => true
  else if (last.op === 'edit' && last.changes?.acceptance !== undefined) {
    const before = last.changes.acceptance.from
    const old = new Set(Array.isArray(before) ? before.filter((line): line is string => typeof line === 'string') : [])
    added = line => !old.has(line)
  }
  else return []
  return nodeChecks(node).flatMap(({ line, entry }): EstimateLine[] => entry.estimateSeconds === undefined || !added(line) ? [] : [{
    kind: 'estimate',
    at: at.toISOString(),
    check: checkKey(node.id, entry.name),
    argv: argvDigest(entry.argv),
    estimateS: entry.estimateSeconds,
    node: node.id,
    actor,
    historyAt: last.at,
    ...(session === undefined ? {} : { session }),
  }])
}

/** Append one line to `<home>/env-checks/timing.jsonl` (append-only, not in git), creating the directory. Rejects on a write failure. */
export async function appendTiming(home: string, line: EstimateLine): Promise<void> {
  const file = join(home, 'env-checks', 'timing.jsonl')
  await mkdir(dirname(file), { recursive: true })
  await appendFile(file, `${JSON.stringify(line)}\n`, 'utf8')
}
