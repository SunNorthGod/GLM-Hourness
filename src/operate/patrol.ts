/**
 * The nightly patrol (M7 design 0.6 §3.11.2, batch m7-7): the body of
 * `hourness_report {kind: 'patrol'}`. The harness does the fast read-only
 * reads and the writes only it owns (the patrol journal, the evidence the
 * ok advance lines carry but the graph misses), and lists everything else
 * as findings the main agent acts on or dispatches; matters for the person
 * accumulate into its next batch. The two slow jobs — the full check on the
 * trunk and the `patrol $` commands of the merge gate — start in the
 * background: the tool result says so, and a job that fails sends the
 * failure to the main agent as a notice while a pass is only recorded.
 *
 * The trunk check is the same `trunkCheck` the `execute.trunk-check` entry
 * runs (§3.11.1; the design's shared-job note), started through the execute
 * row's service; with the execute row off it is a finding instead. The
 * evidence backfill is the trunk gate's reconcile step, surfaced as the
 * execute service's optional `reconcileTrunk`. The lessons row's `hygiene`
 * (M5 design §4.9) is called when the service is there; without the
 * experience row the section does not appear (M7 §3.5.5).
 *
 * Every run appends one line to `<proj>/.llm/operate/patrol.jsonl` (and a
 * `.gitignore` of `*` beside it, like every runtime file here); a settled
 * background job appends its own line. The journal is the patrol's memory:
 * the missed-run check (over 26 hours since the last run) and the
 * two-skips-in-a-row check read it back. Each call emits `operate.patrol`
 * (the finding counts, what the harness did, the trunk check's state) and
 * the `operate.report` event like every other kind.
 *
 * Same input, same text word for word: no clock and no random read inside —
 * `now` comes in with the deps, every listing walks its records in a fixed
 * order, and the plain-words check stays clean. git 的增删改是主 Agent 的
 * 事：the patrol never deletes a worktree or a branch, it lists them.
 */
import { mkdir, readFile, appendFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { basename, join } from 'node:path'
import { projectOf } from '../data/project-root.ts'
import { parseDispatchComment } from '../execute/attempts.ts'
import { parseFloor, floorHits } from '../execute/floor.ts'
import { readAdvances, readChecks, trunkBranchOf, type VerifiedCheck } from '../execute/check.ts'
import type { AdvanceRecord } from '../execute/advance.ts'
import type { Git, RecentCommit } from '../execute/git.ts'
import { sha256Hex } from '../execute/digest.ts'
import { parseGateNorm } from '../execute/gate-norm.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import type { GraphNode } from '../graph/schema.ts'
import { listOpenItems } from '../graph/projection.ts'
import { staleness } from '../graph/pins.ts'
import { validateGraph } from '../graph/validate.ts'
import { loadGraph } from '../graph/store.ts'
import { mainAgentOf, holderHome } from '../graph/main-agent-holder.ts'
import { LESSONS_SERVICE } from '../lessons/service.ts'
import type { LoopEventRecord } from '../loops/service.ts'
import { metricsOf } from '../shared/metrics.ts'
import { executeService } from '../shared/execute-service.ts'
import { createUserNotice, type AgentLike, type ServiceLookup } from '../shared/dsh-min.ts'
import { deliver } from '../rules/wake.ts'

/** A patrol run may lag the previous one by a day and two hours before the next patrol reports the miss (§3.11.2). */
const MISSED_MS = 26 * 3_600_000
/** One background command may take the same time a gate command may (§3.8.1). */
const COMMAND_TIMEOUT_MS = 30 * 60_000
/** The page size for seven-day commit reads, matching `git.recentCommits`'s upper bound. */
const WINDOW_COMMITS = 1000
/** One finding lists at most five names before the count. */
const DETAIL_MAX = 5
const DAY_MS = 86_400_000

export interface PatrolFinding {
  /** The count key the `operate.patrol` metric carries. */
  readonly key: string
  /** One plain line for the report, without the leading dash. */
  readonly text: string
}

/** The git and command layers, injectable for the specs; the real row passes the real ones. */
export interface PatrolDeps {
  readonly lookup: ServiceLookup
  readonly graphDirOf: (cwd: string | undefined) => string | undefined
  readonly git: Git
  /** One command line of the gate, through the shell (§3.8.1); the runLine of src/execute/check.ts. */
  readonly runLine: (command: string, cwd: string, logFile: string, timeoutMs: number, signal: AbortSignal) => Promise<{ readonly exit: number, readonly ms: number, readonly problem?: string }>
  readonly now?: () => Date
}

interface PatrolLine {
  readonly kind: 'run' | 'trunk-check' | 'patrol-command'
  readonly at: string
  readonly outcome?: string
}

/** The lines of the patrol journal, oldest first; a line that does not parse is skipped. */
async function readLines(operateDir: string): Promise<readonly PatrolLine[]> {
  const text = await readFile(join(operateDir, 'patrol.jsonl'), 'utf8').catch(() => '')
  return text.split('\n').flatMap((line) => {
    if (line.trim() === '') return []
    try {
      const value = JSON.parse(line) as Partial<PatrolLine>
      return typeof value.kind === 'string' && (value.kind === 'run' || value.kind === 'trunk-check' || value.kind === 'patrol-command') && typeof value.at === 'string' ? [value as PatrolLine] : []
    }
    catch {
      return []
    }
  })
}

/** The missed run of §3.11.2: the last patrol run over 26 hours ago. Pure. */
export function missedRunOf(lines: readonly PatrolLine[], nowMs: number): boolean {
  const last = [...lines].reverse().find(line => line.kind === 'run')
  if (last === undefined) return false
  const at = Date.parse(last.at)
  return !Number.isNaN(at) && nowMs - at > MISSED_MS
}

/** The skip streak of §3.11.2: the last two settled trunk checks were both skipped (the gate lock was taken both times). Pure. */
export function skipStreakOf(lines: readonly PatrolLine[]): boolean {
  const checks = lines.filter(line => line.kind === 'trunk-check').slice(-2)
  return checks.length === 2 && checks.every(line => line.outcome === 'skipped')
}

const short = (commit: string): string => commit.slice(0, 12)

/** The names one finding line lists, at most five and then the count. */
function names(list: readonly string[]): string {
  return list.length <= DETAIL_MAX ? list.join('、') : `${list.slice(0, DETAIL_MAX).join('、')}等 ${list.length} 个`
}

/** The count map one metric body carries, keys in first-seen order. Pure. */
function countsOf(findings: readonly PatrolFinding[]): Record<string, number> {
  return Object.fromEntries([...new Set(findings.map(finding => finding.key))].map(key => [key, findings.filter(finding => finding.key === key).length]))
}

/** Whether a done task carries the trunk-advance note (`进主干 <commit>…`, the harness's own comment). Pure. */
function hasTrunkNote(node: GraphNode): boolean {
  return node.history.some(entry => entry.op === 'comment' && entry.actor === 'harness' && entry.text?.startsWith('进主干 ') === true)
}

/** The task's latest dispatch with the moment its comment was written; the same walk the dispatch register does, keeping the time. */
function lastDispatch(node: GraphNode): { readonly attempt: number, readonly childId: string, readonly pins: string, readonly review?: string, readonly at: string } | undefined {
  for (let index = node.history.length - 1; index >= 0; index -= 1) {
    const entry = node.history[index]
    if (entry.op !== 'comment' || entry.actor !== 'harness' || entry.text === undefined) continue
    const record = parseDispatchComment(entry.text)
    if (record === undefined) continue
    return { attempt: record.attempt, childId: record.childId, pins: record.pins, ...(record.review === undefined ? {} : { review: record.review }), at: entry.at }
  }
  return undefined
}

interface TrunkState {
  readonly trunk: string
  readonly local?: string
  readonly remoteTracked?: string
  /** The remote's own value from `git ls-remote`; absent when there is no remote or the read failed. */
  readonly remoteLive?: string
  /** The read of the real remote failed; the tracked value stands in (§3.11.2). */
  readonly remoteUnreachable?: true
}

async function trunkStateOf(git: Git, project: string, graph: LoadedGraph): Promise<TrunkState> {
  const trunk = await trunkBranchOf(git, project, graph) ?? 'main'
  const upstream = await git.trunkUpstream(project, trunk).then(found => found.ok ? found.value : undefined).catch(() => undefined)
  const refs = await git.trunkRefs(project, trunk, upstream?.remote).then(found => found.ok ? found.value : undefined).catch(() => undefined)
  if (upstream?.remote === undefined) {
    return { trunk, ...(refs?.local === undefined ? {} : { local: refs.local }), ...(refs?.remote === undefined ? {} : { remoteTracked: refs.remote }) }
  }
  const live = await git.lsRemote(project, upstream.remote, trunk).then(found => found.ok ? found.value : undefined).catch(() => undefined)
  return {
    trunk,
    ...(refs?.local === undefined ? {} : { local: refs.local }),
    ...(refs?.remote === undefined ? {} : { remoteTracked: refs.remote }),
    ...(live === undefined ? { remoteUnreachable: true as const } : { remoteLive: live }),
  }
}

/** The section each finding key reads under; a key no row names still gets said, under 其他. Pure. */
const SECTIONS: readonly (readonly [string, readonly string[]])[] = [
  ['主干', ['trunk-ahead', 'trunk-remote-differs', 'trunk-remote-unreachable', 'trunk-unchecked', 'trunk-outside', 'trunk-floor', 'trunk-floor-incoming', 'trunk-unchecked-advance', 'trunk-check-absent', 'trunk-read']],
  ['活与证据', ['evidence-lacking', 'evidence-read']],
  ['工作树与分支', ['worktree-clean', 'worktree-dirty', 'branch-merged', 'branch-unmerged', 'worktree-read']],
  ['项目图', ['graph-unreadable', 'graph-stuck', 'graph-stale', 'graph-ask-old', 'graph-invalid']],
  ['经验与记忆', ['hygiene']],
  ['巡检自身', ['missed-run', 'skip-streak']],
]

/** The report text: the findings in §3.11.2's row order, then what runs in the background. Pure. */
export function patrolText(input: {
  readonly period: string
  readonly findings: readonly PatrolFinding[]
  readonly jobs: readonly string[]
}): string {
  const lines: string[] = [`# 巡检 ${input.period}`]
  const rest = [...input.findings]
  for (const [row, keys] of SECTIONS) {
    const section = rest.filter(finding => keys.includes(finding.key))
    if (section.length === 0) continue
    lines.push('', `## ${row}`)
    for (const finding of section) {
      lines.push(`- ${finding.text}`)
      rest.splice(rest.indexOf(finding), 1)
    }
  }
  if (rest.length > 0) {
    lines.push('', '## 其他')
    for (const finding of rest) lines.push(`- ${finding.text}`)
  }
  if (input.findings.length === 0) lines.push('', '## 发现', '- 没有要处理的事')
  lines.push('', '## 已在后台')
  lines.push(...(input.jobs.length === 0 ? ['- 无'] : input.jobs.map(job => `- ${job}`)))
  return lines.join('\n')
}

/** The tail of a job log from its top: the lines the failure notice carries (§3.11.2: the first 40). */
async function logHead(file: string, lines: number): Promise<string> {
  const text = await readFile(file, 'utf8').catch(() => '')
  return text.split(/\r?\n/).filter(line => line.trim() !== '').slice(0, lines).join('\n')
}

/** Append one line to the patrol journal, its `.gitignore` beside it (the design's runtime table). */
async function appendLine(operateDir: string, line: Record<string, unknown>): Promise<void> {
  await mkdir(operateDir, { recursive: true }).catch(() => undefined)
  await writeFile(join(operateDir, '.gitignore'), '*\n', 'utf8').catch(() => undefined)
  await appendFile(join(operateDir, 'patrol.jsonl'), `${JSON.stringify(line)}\n`, 'utf8').catch(() => undefined)
}

/** Send a settled job's failure to the holder; a pass is only recorded (§3.11.2). */
function notifyFailure(deps: PatrolDeps, project: string, sessionId: string | undefined, title: string, text: string): void {
  const graphDir = deps.graphDirOf(project) ?? join(project, 'docs', 'graph')
  const holder = mainAgentOf(holderHome(deps.lookup), graphDir)?.sessionId ?? sessionId
  if (holder === undefined) return
  try {
    deliver(deps.lookup, holder, createUserNotice('glm-hourness-execute', title, text))
  }
  catch {
    // The notice failing stops nothing; the journal keeps the outcome.
  }
}

/** Commits on `rev` at or after `sinceMs`, paging past `WINDOW_COMMITS` so busy weeks (>200 or >1000 commits) are not dropped. */
async function recentWindow(git: Git, project: string, rev: string, sinceMs: number): Promise<readonly RecentCommit[]> {
  const queue: string[] = [rev]
  const seen = new Set<string>()
  const window: RecentCommit[] = []
  let pages = 0
  while (queue.length > 0 && pages < 20) {
    const cursor = queue.shift()!
    pages += 1
    const batch = await git.recentCommits(project, cursor, WINDOW_COMMITS).then(found => found.ok ? found.value : []).catch(() => [])
    const inRange: RecentCommit[] = []
    for (const entry of batch) {
      if (seen.has(entry.commit)) continue
      seen.add(entry.commit)
      const at = Date.parse(entry.at)
      if (!Number.isNaN(at) && at >= sinceMs) {
        inRange.push(entry)
        window.push(entry)
      }
    }
    if (batch.length < WINDOW_COMMITS) continue
    const oldest = batch[batch.length - 1]
    const oldestMs = oldest === undefined ? Number.NaN : Date.parse(oldest.at)
    if (Number.isNaN(oldestMs) || oldestMs < sinceMs) continue
    for (const entry of inRange) {
      for (const parent of entry.parents) {
        if (!seen.has(parent) && !queue.includes(parent)) queue.push(parent)
      }
    }
  }
  return window
}

/**
 * The fast reads of §3.11.2's table, each read failing as its own finding,
 * never a throw. The trunk check and the patrol commands are the caller's
 * background jobs and are not started here.
 */
async function patrolFindings(deps: PatrolDeps, input: {
  readonly project: string
  readonly graph: LoadedGraph | { readonly unreadable: string }
  readonly execDir: string
  readonly nowMs: number
}): Promise<{ readonly findings: readonly PatrolFinding[], readonly did: readonly string[] }> {
  const { project, nowMs } = input
  const findings: PatrolFinding[] = []
  const did: string[] = []
  const graph = 'nodes' in input.graph ? input.graph : undefined
  const sinceMs = nowMs - 7 * DAY_MS

  const advances = await readAdvances(input.execDir).catch(() => [] as readonly AdvanceRecord[])
  const checks = await readChecks(input.execDir).catch(() => [] as readonly VerifiedCheck[])
  const floor = parseFloor(graph?.nodes.get('norm-review-floor'))
  /** Whether one commit touches the must-review list's file groups; root/shallow commits read the tree directly. */
  const hitsFloor = async (entry: RecentCommit): Promise<boolean> => {
    const parent = entry.parents[0]
    let paths: readonly string[]
    let deleted: readonly string[]
    if (parent === undefined) {
      const tree = await deps.git.treePaths(project, entry.commit)
      if (!tree.ok) return false
      paths = tree.value
      deleted = []
    }
    else {
      const change = await deps.git.changedFiles(project, parent, entry.commit)
      if (!change.ok) return false
      paths = change.value.map(file => file.path)
      deleted = change.value.filter(file => file.status === 'D').map(file => file.path)
    }
    return floorHits(floor, { paths, deleted }, [], join(project, '.worktrees', 'hz-patrol')).length > 0
  }
  /** Whether the task's latest dispatch was reviewed at full depth. */
  const reviewedFull = (task: string | undefined): boolean => {
    const node = task === undefined ? undefined : graph?.nodes.get(task)
    const dispatched = node === undefined ? undefined : lastDispatch(node)
    return dispatched?.review === 'full'
  }

  // --- 主干 (row 6): the real remote once, then the local records against it; the same state serves the branch row
  let state: TrunkState | undefined
  if (graph === undefined) {
    findings.push({ key: 'graph-unreadable', text: `项目图读不到：${'unreadable' in input.graph ? input.graph.unreadable : ''}，工作树、分支与项目图的巡检这一轮没有跑` })
  }
  else {
    try {
      state = await trunkStateOf(deps.git, project, graph)
      const reach = state.remoteLive ?? state.remoteTracked
      if (parseGateNorm(graph.nodes.get('norm-merge-gate')).push && state.local !== undefined && reach !== undefined && reach !== state.local) {
        const ahead = await deps.git.commitsBetween(project, reach, state.local)
        if (ahead.ok && ahead.value.length > 0) findings.push({ key: 'trunk-ahead', text: `主干领先上游 ${ahead.value.length} 个提交，还没推：${names(ahead.value.slice(0, DETAIL_MAX).map(short))}` })
      }
      if (state.remoteLive !== undefined && state.remoteTracked !== undefined && state.remoteLive !== state.remoteTracked) {
        findings.push({ key: 'trunk-remote-differs', text: '远端的主干和本机记的不一致（有人推了本机没拉，或本机的记录被改过）' })
      }
      if (state.remoteUnreachable === true) findings.push({ key: 'trunk-remote-unreachable', text: '没连上远端，远端的对照用的是本机记录的值' })
      if (state.local !== undefined) {
        const trailers = await deps.git.trailerCommits(project, state.local).then(found => found.ok ? found.value : []).catch(() => [])
        const window = await recentWindow(deps.git, project, state.local, sinceMs)
        // The commits the advance lines walk over: everything an ok local advance brought in covers its trailers, every line covers its own span.
        const coveredLocalOk = new Set<string>()
        const coveredAny = new Set<string>()
        const isVerifiedForward = (entry: AdvanceRecord): boolean =>
          entry.ref === 'local' && entry.ok === true && entry.rollback !== true
          && (entry.check != null || entry.only === true || entry.checkedAfter === true)
        for (const line of advances) {
          if (line.from === undefined || line.to === undefined || line.from === '' || line.to === '' || line.rollback === true) continue
          if (line.from === line.to) continue
          const forward = await deps.git.isAncestor(project, line.from, line.to)
          if (!forward.ok) continue
          const verifiedLocal = isVerifiedForward(line)
          if (!forward.value) {
            // Avoid unbounded full-history rev-list scans on rollbacks or diverged/rebased pairs.
            const back = await deps.git.isAncestor(project, line.to, line.from)
            if (back.ok && back.value) continue
            coveredAny.add(line.to)
            if (verifiedLocal) coveredLocalOk.add(line.to)
            continue
          }
          const span = await deps.git.commitsBetween(project, line.from, line.to)
          if (!span.ok) continue
          for (const commit of span.value) coveredAny.add(commit)
          if (verifiedLocal) {
            for (const commit of span.value) coveredLocalOk.add(commit)
          }
        }
        const uncovered = trailers.filter(entry => !coveredLocalOk.has(entry.commit))
        if (uncovered.length > 0) findings.push({ key: 'trunk-unchecked', text: `${uncovered.length} 个带任务尾注的主干提交没有成立的前进覆盖：${names(uncovered.map(entry => short(entry.commit)))}` })
        const outside = window.filter(entry => !coveredAny.has(entry.commit))
        if (outside.length > 0) findings.push({ key: 'trunk-outside', text: `近 7 天主干上 ${outside.length} 个提交不在任何前进与拉取记录里（系统外的改动）：${names(outside.map(entry => short(entry.commit)))}` })
        const floorCommits: string[] = []
        for (const entry of window) {
          if (!await hitsFloor(entry)) continue
          const trailer = trailers.find(candidate => candidate.commit === entry.commit)
          if (trailer === undefined || !trailer.tasks.some(task => reviewedFull(task))) floorCommits.push(entry.commit)
        }
        if (floorCommits.length > 0) findings.push({ key: 'trunk-floor', text: `近 7 天 ${floorCommits.length} 个碰到必须全审改动的主干提交没有全审看过：${names(floorCommits.map(short))}` })
        for (const line of advances) {
          if (line.incomingFloor === undefined || line.incomingFloor.length === 0 || line.at === undefined || Date.parse(line.at) < sinceMs) continue
          findings.push({ key: 'trunk-floor-incoming', text: `拉来的提交带着没全审的改动：${names(line.incomingFloor)}` })
        }
        const unchecked: AdvanceRecord[] = []
        for (let index = 0; index < advances.length; index++) {
          const line = advances[index]
          if (line === undefined || line.ref !== 'local' || line.rollback === true) continue
          const isUnchecked = line.ok === false || (line.ok === true && line.check == null && line.only !== true && line.checkedAfter !== true)
          if (!isUnchecked || line.to === undefined) continue
          if (checks.some(record => record.passed && record.commit === line.to)) continue
          let coveredLater = false
          for (let laterIndex = index + 1; laterIndex < advances.length; laterIndex++) {
            const later = advances[laterIndex]
            if (later === undefined || !isVerifiedForward(later) || later.to === undefined) continue
            const byTo = line.to !== '' ? await deps.git.isAncestor(project, line.to, later.to) : undefined
            if (byTo?.ok === true && byTo.value) {
              coveredLater = true
              break
            }
            const byFrom = line.from !== undefined && line.from !== '' ? await deps.git.isAncestor(project, line.from, later.to) : undefined
            if (byFrom?.ok === true && byFrom.value) {
              coveredLater = true
              break
            }
          }
          if (!coveredLater) unchecked.push(line)
        }
        if (unchecked.length > 0) findings.push({ key: 'trunk-unchecked-advance', text: `${unchecked.length} 次没检查的主干前进还没补检查：${names(unchecked.map(line => short(line.to)))}` })
      }
    }
    catch (error) {
      findings.push({ key: 'trunk-read', text: `主干读不了：${error instanceof Error ? error.message : String(error)}` })
    }
  }

  // --- 证据 (row 3): the harness writes back what the ok lines carry, then lists what still lacks it
  try {
    const execute = executeService(deps.lookup)
    if (execute?.reconcileTrunk !== undefined && graph !== undefined) {
      const written = await execute.reconcileTrunk(project)
      if (written > 0) did.push('evidence-backfill')
    }
    if (graph !== undefined) {
      const lacking = [...graph.nodes.values()].filter(node => node.type === 'task' && node.status === 'done' && !hasTrunkNote(node))
      if (lacking.length > 0) findings.push({ key: 'evidence-lacking', text: `${lacking.length} 个已完成的任务没有进主干的证据批注：${names(lacking.map(node => `${node.id}（${node.title}）`))}` })
    }
  }
  catch (error) {
    findings.push({ key: 'evidence-read', text: `证据补写读不了：${error instanceof Error ? error.message : String(error)}` })
  }

  // --- 工作树与分支 (rows 4–5): findings only, git 的增删改是主 Agent 的事
  if (graph !== undefined) {
    try {
      const worktrees = await deps.git.listWorktrees(project).then(found => found.ok ? found.value : []).catch(() => [])
      const clean: string[] = []
      const dirty: string[] = []
      for (const entry of worktrees) {
        const name = basename(entry.path)
        if (!name.startsWith('hz-') || name === 'hz-gate') continue
        const node = graph.nodes.get(name.slice('hz-'.length))
        if (node === undefined || (node.status !== 'done' && node.status !== 'dropped')) continue
        const unclean = await deps.git.uncleanFiles(entry.path)
        const files = unclean.ok ? [...unclean.value.tracked, ...unclean.value.untracked] : []
        if (files.length === 0) clean.push(name.slice('hz-'.length))
        else dirty.push(`${name.slice('hz-'.length)}：${names(files)}`)
      }
      if (clean.length > 0) findings.push({ key: 'worktree-clean', text: `${clean.length} 个已完成任务的工作树是干净的，可以删：${names(clean)}` })
      for (const line of dirty) findings.push({ key: 'worktree-dirty', text: `工作树里有没交回的改动：${line}` })
      const branches = await deps.git.listBranches(project, 'hz').then(found => found.ok ? found.value : []).catch(() => [])
      const merged: string[] = []
      const unmerged: string[] = []
      const trunkTip = state?.local
      for (const entry of branches) {
        const task = entry.branch.slice('hz/'.length).replace(/@\d+$/, '')
        const node = graph.nodes.get(task)
        if (node === undefined || (node.status !== 'done' && node.status !== 'dropped') || trunkTip === undefined) continue
        const inTrunk = await deps.git.isAncestor(project, entry.tip, trunkTip)
        if (!inTrunk.ok || inTrunk.value !== true) {
          unmerged.push(`${entry.branch}（${task}）`)
          continue
        }
        if (node.status !== 'done') continue
        const went = await deps.git.lastTaskCommit(project, trunkTip, task)
        if (!went.ok || went.value === undefined) continue
        const at = await deps.git.commitDate(project, went.value)
        if (at !== undefined && nowMs - Date.parse(at) > 14 * DAY_MS) merged.push(entry.branch)
      }
      if (merged.length > 0) findings.push({ key: 'branch-merged', text: `${merged.length} 个分支的内容进主干超过 14 天，可以删：${names(merged)}` })
      if (unmerged.length > 0) findings.push({ key: 'branch-unmerged', text: `${unmerged.length} 个任务已关、内容没进主干的分支：${names(unmerged)}` })
    }
    catch (error) {
      findings.push({ key: 'worktree-read', text: `工作树与分支读不了：${error instanceof Error ? error.message : String(error)}` })
    }
  }

  // --- 图 (row 7): stuck tasks, stale dispatches, aged asks, validation errors
  if (graph !== undefined) {
    const agents = (typeof deps.lookup.get === 'function' ? deps.lookup.get('agents') : undefined) as { get(name: string): unknown } | undefined
    const stuck: string[] = []
    const stale: string[] = []
    for (const node of graph.nodes.values()) {
      if (node.type !== 'task' || node.status !== 'doing') continue
      const dispatched = lastDispatch(node)
      if (dispatched === undefined || nowMs - Date.parse(dispatched.at) <= DAY_MS) continue
      const live = agents !== undefined && typeof agents.get === 'function' && agents.get(dispatched.childId) !== undefined
      if (!live) stuck.push(`${node.id}（${node.title}，第 ${dispatched.attempt} 次）`)
      if (staleness(graph, dispatched.pins, sha256Hex).length > 0) stale.push(`${node.id}（${node.title}）`)
    }
    if (stuck.length > 0) findings.push({ key: 'graph-stuck', text: `${stuck.length} 个任务进行中超过 24 小时，派发已不在：${names(stuck)}` })
    if (stale.length > 0) findings.push({ key: 'graph-stale', text: `${stale.length} 个派发过期了（任务在派发后改过）：${names(stale)}` })
    const aged = listOpenItems(graph).questions.filter(entry => entry.askedAt !== undefined && nowMs - Date.parse(entry.askedAt) > 3 * DAY_MS)
    if (aged.length > 0) findings.push({ key: 'graph-ask-old', text: `${aged.length} 件等你回话的事超过 3 天了：${names(aged.map(entry => `${entry.id}（${entry.title}）`))}` })
    const issues = validateGraph(graph.nodes)
    if (issues.length > 0) findings.push({ key: 'graph-invalid', text: `图有 ${issues.length} 处校验错误，第一条：${issues[0]?.message ?? ''}` })
  }

  return { findings, did }
}

/**
 * One patrol run: the fast reads, the two background jobs, the journal line
 * and the metrics. Never throws; every read that fails lands as a finding.
 * The trunk check rides the execute row's `runAction` (the same
 * `trunkCheck` the `execute.trunk-check` entry runs); with the execute row
 * off it is a finding and the run line says skipped.
 */
export async function patrolRun(deps: PatrolDeps, agent: AgentLike): Promise<{ text: string }> {
  const cwd = agent.session?.header.cwd
  const sessionId = typeof agent.session?.id === 'string' ? agent.session.id : undefined
  const now = deps.now ?? ((): Date => new Date())
  const nowMs = now().getTime()
  const at = now().toISOString()
  const day = now()
  const period = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
  const root = typeof cwd === 'string' && cwd.length > 0 ? projectOf(cwd)?.root : undefined
  if (root === undefined) {
    return { text: patrolText({ period, findings: [{ key: 'no-project', text: '这个会话没有可归的项目，巡检没有跑' }], jobs: [] }) }
  }
  const execDir = join(root, '.llm', 'execute')
  const operateDir = join(root, '.llm', 'operate')
  const graphDir = deps.graphDirOf(cwd)
  const graph: LoadedGraph | { readonly unreadable: string } = graphDir === undefined
    ? { unreadable: '项目图行 glm-hourness/graph 没有启用，或这个会话没有工作目录' }
    : await loadGraph(graphDir).catch((error: unknown) => ({ unreadable: `读图出错：${error instanceof Error ? error.message : String(error)}` }))

  const state = await patrolFindings(deps, { project: root, graph, execDir, nowMs })
  const findings = [...state.findings]
  const did = [...state.did]
  let trunk: 'passed' | 'failed' | 'skipped' | 'started'

  // The self row: the journal as it stands before this run's line is appended (rows 9 and 2).
  const lines = await readLines(operateDir).catch(() => [] as readonly PatrolLine[])
  if (missedRunOf(lines, nowMs)) findings.push({ key: 'missed-run', text: '距上次巡检超过 26 小时，漏跑了' })
  if (skipStreakOf(lines)) findings.push({ key: 'skip-streak', text: '主干检查连续两次没有跑成（锁被占），这次先跳过' })

  // The lessons row's hygiene (M5 §4.9): findings when the service is there, the section absent when it is not (§3.5.5).
  try {
    const service: unknown = typeof deps.lookup.get === 'function' ? deps.lookup.get(LESSONS_SERVICE) : undefined
    const hygiene = (service as { hygiene?: unknown } | null | undefined)?.hygiene
    if (typeof hygiene === 'function') {
      const found = await (hygiene as (session: unknown, now: string) => Promise<readonly { readonly kind: string, readonly id?: string, readonly detail: string }[]>)(agent.session, at)
      for (const item of found) findings.push({ key: 'hygiene', text: `${item.kind}: ${item.detail}` })
    }
  }
  catch (error) {
    findings.push({ key: 'hygiene', text: `经验与记忆的卫生读不了：${error instanceof Error ? error.message : String(error)}` })
  }

  // The two background jobs (评审 N6): the tool returns now, the results reach the next step.
  const jobs: string[] = []
  const execute = executeService(deps.lookup)
  const loaded = 'nodes' in graph ? graph : undefined
  if (execute === undefined || loaded === undefined) {
    findings.push({ key: 'trunk-check-absent', text: execute === undefined ? '执行行不在，这次的主干检查没有跑' : '项目图读不到，这次的主干检查没有跑' })
    trunk = 'skipped'
  }
  else {
    const trunkBranch = await trunkBranchOf(deps.git, root, loaded).catch(() => undefined) ?? 'main'
    const refs = await deps.git.trunkRefs(root, trunkBranch, undefined).then(found => found.ok ? found.value : undefined).catch(() => undefined)
    const to = refs?.local
    if (to === undefined) {
      findings.push({ key: 'trunk-check-absent', text: '主干读不出来，这次的主干检查没有跑' })
      trunk = 'skipped'
    }
    else {
      const key = `trunk-advanced:${to}:patrol-${nowMs}`
      const record: LoopEventRecord = { id: `ev-${randomBytes(8).toString('hex')}`, event: 'hourness.trunk-advanced', at, project: root, ...(sessionId === undefined ? {} : { session: sessionId }), key, payload: { to, tasks: '' }, merged: [] }
      jobs.push(`主干检查已在后台开始（job ${key}），结果送到你的下一步`)
      trunk = 'started'
      void execute.runAction('execute.trunk-check', record).then(async (result) => {
        const outcome = result.outcome === 'done' ? (result.tell === undefined ? 'passed' : 'failed')
          : result.outcome === 'skipped' ? 'passed' : result.reason?.includes('gate_busy') === true ? 'skipped' : 'failed'
        await appendLine(operateDir, { kind: 'trunk-check', at: new Date(now().getTime()).toISOString(), outcome })
        if (outcome === 'failed') notifyFailure(deps, root, sessionId, '巡检的主干检查', result.outcome === 'done' ? result.tell ?? '主干检查没过' : `主干检查没有跑完：${result.reason ?? ''}`)
      }).catch(() => undefined)
    }
  }
  const gate = loaded === undefined ? undefined : parseGateNorm(loaded.nodes.get('norm-merge-gate'))
  const patrolCommands = (gate?.commands ?? []).filter(command => command.kind === 'patrol')
  for (const [index, command] of patrolCommands.entries()) {
    const logFile = join(execDir, 'patrol', `${nowMs}-${index}.log`)
    jobs.push(`巡检命令已在后台开始（${command.command}），结果送到你的下一步`)
    void deps.runLine(command.command, root, logFile, COMMAND_TIMEOUT_MS, new AbortController().signal).then(async (run) => {
      await appendLine(operateDir, { kind: 'patrol-command', at: new Date(now().getTime()).toISOString(), outcome: run.exit === 0 ? 'passed' : 'failed' })
      if (run.exit !== 0) notifyFailure(deps, root, sessionId, '巡检的命令', `巡检命令 ${command.command} 没过（退出码 ${run.exit}${run.problem === undefined ? '' : `，${run.problem}`}），输出的前几行：\n${await logHead(logFile, 40)}`)
    }).catch(() => undefined)
  }

  await appendLine(operateDir, { kind: 'run', at, found: countsOf(findings), did, trunk })

  const text = patrolText({ period, findings, jobs })
  const where = { ...(sessionId === undefined ? {} : { sessionId }), ...(typeof cwd === 'string' && cwd.length > 0 ? { dir: cwd } : {}) }
  const metrics = metricsOf(deps.lookup)
  metrics?.emit({ k: 'operate.patrol', by: 'operate', body: { found: countsOf(findings), did, trunk } }, where)
  metrics?.emit({ k: 'operate.report', by: 'operate', body: { kind: 'patrol', lines: text.split('\n').length, units: [...text].length } }, where)
  return { text }
}
