/**
 * The metrics command line (design §7.5): `summary`, `verify`, `compare`,
 * `prune` and `backfill-graph` over one project's journal. The scripts
 * entry (scripts/metrics/cli.ts) is the launcher; this module holds the
 * argument grammar, the rendering and the four `verify` reconciliations
 * the checker cannot do (the graph history, the usage journal, the
 * timeout entries, and — via `checkLog` — the manifest).
 *
 * Exit codes: 0 clean, 1 findings (verify), 2 bad command line.
 */
import { readdirSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { userDataHome } from '../shared/data-home.ts'
import { compare, localDate, scoresFor, type CalcGroup, type CompareKey } from './calc.ts'
import { appendEvents } from './library.ts'
import { checkLog, readLog } from './read.ts'
import type { MetricsEvent } from './schema.ts'
import { projectOf } from '../data/project-root.ts'
import { loadGraph } from '../graph/store.ts'
import type { EmittedEvent } from '../shared/metrics.ts'

const USAGE = `npm run metrics -- <子命令> [选项]
子命令：summary | verify | compare --by <v|model|host|role> | prune --before <YYYY-MM-DD> | backfill-graph
选项：--project <目录>（默认当前目录）  --from <ISO>  --to <ISO>  --tz <±HH:MM>（默认 +08:00）
      --basis '<文件>:<行数>[,...]'  --json`

export interface CliIo {
  /** The working directory `--project` defaults to. */
  readonly cwd: string
  /** The environment `DSH_HOME` resolves against (the usage journal of verify). */
  readonly env: Readonly<Record<string, string | undefined>>
  /** The clock for the default window end and "quiet" judgments; tests pin it. */
  readonly now: () => number
}

export interface CliResult {
  /** 0 clean, 1 findings (verify), 2 bad command line. */
  readonly exitCode: 0 | 1 | 2
  readonly stdout: string
  readonly stderr: string
}

const ok = (stdout = ''): CliResult => ({ exitCode: 0, stdout, stderr: '' })
const fail = (stderr: string): CliResult => ({ exitCode: 1, stdout: '', stderr })
const usageError = (message: string): CliResult => ({ exitCode: 2, stdout: '', stderr: `${message}\n${USAGE}\n` })

const FILE_PATTERN = /^events-\d{4}-\d{2}-\d{2}(-([0-9a-f]{8}|bf-[0-9a-f]{7}))?\.jsonl$/
const TZ_PATTERN = /^[+-]\d{2}:\d{2}$/

interface Args {
  readonly command: string
  readonly project: string
  readonly from?: string
  readonly to?: string
  readonly tz: string
  readonly basis?: ReadonlyMap<string, number>
  readonly json: boolean
  readonly by?: string
  readonly before?: string
}

function parseArgs2(args: readonly string[]): Args | CliResult {
  let parsed: ReturnType<typeof parseArgs>
  try {
    parsed = parseArgs({
      args: [...args],
      options: {
        project: { type: 'string' },
        from: { type: 'string' },
        to: { type: 'string' },
        tz: { type: 'string' },
        basis: { type: 'string' },
        json: { type: 'boolean', default: false },
        by: { type: 'string' },
        before: { type: 'string' },
      },
      allowPositionals: true,
    })
  }
  catch (error) {
    return usageError(`参数不合法：${(error as Error).message}`)
  }
  const [command] = parsed.positionals
  const text = (value: string | boolean | readonly (string | boolean)[] | undefined): string | undefined =>
    typeof value === 'string' && value.length > 0 ? value : undefined
  const by = text(parsed.values.by)
  const before = text(parsed.values.before)
  const tz = text(parsed.values.tz)
  const from = text(parsed.values.from)
  const to = text(parsed.values.to)
  const project = text(parsed.values.project)
  const basisText = text(parsed.values.basis)
  if (command === undefined || !['summary', 'verify', 'compare', 'prune', 'backfill-graph'].includes(command)) {
    return usageError('第一个参数必须是 summary、verify、compare、prune 或 backfill-graph')
  }
  if (command === 'compare' && by === undefined) return usageError('compare 需要 --by <v|model|host|role>')
  if (command === 'compare' && !['v', 'model', 'host', 'role'].includes(by!)) return usageError('--by 只认 v、model、host、role')
  if (command === 'prune' && before === undefined) return usageError('prune 需要 --before <YYYY-MM-DD>')
  if (before !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(before)) return usageError('--before 是 YYYY-MM-DD')
  if (tz !== undefined && !TZ_PATTERN.test(tz)) return usageError('--tz 匹配 ±HH:MM')
  if (from !== undefined && !Number.isFinite(Date.parse(from))) return usageError('--from 必须是可解析的时刻')
  if (to !== undefined && !Number.isFinite(Date.parse(to))) return usageError('--to 必须是可解析的时刻')
  let basis: ReadonlyMap<string, number> | undefined
  if (basisText !== undefined) {
    const map = new Map<string, number>()
    for (const item of basisText.split(',')) {
      const at = item.lastIndexOf(':')
      const file = at === -1 ? item : item.slice(0, at)
      const lines = Number(at === -1 ? '' : item.slice(at + 1))
      if (!FILE_PATTERN.test(file) || !Number.isInteger(lines) || lines <= 0) return usageError(`--basis 的每项是 <文件>:<正整数>，文件名合 ${FILE_PATTERN.source}：${item}`)
      map.set(file, lines)
    }
    basis = map
  }
  return {
    command,
    project: resolve(project ?? '.'),
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
    tz: tz ?? '+08:00',
    ...(basis === undefined ? {} : { basis }),
    json: parsed.values.json === true,
    ...(by === undefined ? {} : { by }),
    ...(before === undefined ? {} : { before }),
  }
}

/** The rendered text of the groups: the basis line first, then each group's rows (deterministic, §7.2). */
function render(basis: string, groups: readonly CalcGroup[]): string {
  const lines = [basis]
  for (const group of groups) {
    lines.push(group.title)
    for (const row of group.rows) lines.push(`  ${row.label}  ${row.value}`)
  }
  return `${lines.join('\n')}\n`
}

/** The window the caller asked for, with the defaults filled from the events. */
function windowOf(args: Args, events: readonly { readonly at: string }[], now: () => number): { readonly from: string, readonly to: string } {
  const first = events[0]?.at ?? '1970-01-01T00:00:00.000Z'
  const last = events.at(-1)?.at
  return {
    from: args.from ?? first,
    to: args.to ?? (last === undefined ? new Date(now()).toISOString() : new Date(Date.parse(last) + 1).toISOString()),
  }
}

/** The `(node, hi)` pairs the journal's graph events already carry (§7.5). */
function graphPairs(events: readonly MetricsEvent[]): ReadonlySet<string> {
  const pairs = new Set<string>()
  for (const event of events) {
    if (event.k !== 'graph') continue
    const node = typeof event.body.node === 'string' ? event.body.node : undefined
    const hi = typeof event.body.hi === 'number' ? event.body.hi : undefined
    if (node !== undefined && hi !== undefined) pairs.add(`${node}\u0000${hi}`)
  }
  return pairs
}

/** A computation's answer in text or in JSON — the two shapes `summary` and `compare` print. */
function output(computed: { readonly basis: string, readonly groups: readonly CalcGroup[] }, json: boolean): CliResult {
  return json ? ok(`${JSON.stringify({ basis: computed.basis, groups: computed.groups }, null, 2)}\n`) : ok(render(computed.basis, computed.groups))
}

/**
 * `verify`'s four reconciliations beyond `checkLog` (§7.5): the graph
 * history the journal misses, the per-session llm counts against the usage
 * journal, the manifest (already `checkLog`'s lost files), and the timeout
 * entries. `events` is the full journal read once.
 */
async function verifyReconciliations(root: string, env: CliIo['env'], events: readonly MetricsEvent[]): Promise<readonly string[]> {
  const findings: string[] = []

  // The graph history (§7.5): entries later than the journal's start that no live graph event carries.
  const graphDir = join(root, 'docs', 'graph')
  if (existsSync(graphDir)) {
    const start = events[0]?.at
    const pairs = graphPairs(events)
    if (start !== undefined) {
      const graph = await loadGraph(graphDir)
      for (const [node, nodeFile] of [...graph.nodes.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        nodeFile.history.forEach((entry, hi) => {
          if (entry.at >= start && !pairs.has(`${node}\u0000${hi}`)) {
            findings.push(`图历史缺条目：${node}#${hi} ${entry.at} ${entry.op}（流水开始于 ${start}）`)
          }
        })
      }
    }
  }

  // The usage journal (§7.5): per session, the journal's llm count against the usage rows.
  const usagePath = join(userDataHome(undefined, env), 'audit', 'usage.jsonl')
  if (existsSync(usagePath)) {
    const perSession = new Map<string, number>()
    for (const line of readFileSync(usagePath, 'utf8').split('\n')) {
      if (line === '') continue
      try {
        const record = JSON.parse(line) as { readonly sessionId?: unknown }
        if (typeof record.sessionId === 'string') perSession.set(record.sessionId, (perSession.get(record.sessionId) ?? 0) + 1)
      }
      catch {
        findings.push(`用量流水有一行读不出（${usagePath}）`)
      }
    }
    const journalCounts = new Map<string, number>()
    for (const event of events) {
      if (event.k !== 'llm' || event.sid === undefined) continue
      journalCounts.set(event.sid, (journalCounts.get(event.sid) ?? 0) + 1)
    }
    for (const [sid, count] of [...journalCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const usage = perSession.get(sid) ?? 0
      if (usage !== count) findings.push(`会话 ${sid} 的 llm 事件 ${count} 条，用量流水 ${usage} 条`)
    }
  }

  // The timeout entries (F12): runs carry a same-entry hit within ±5 s; hits that name a run
  // name one; sets chain prevMs to the previous limit of the same entry.
  const at = (event: { readonly at: string }): number => Date.parse(event.at)
  const runs = events.filter(event =>
    (event.k === 'loop-done' && event.body.outcome === 'unfinished') ||
    (event.k === 'rules.script' && event.body.result === 'timeout'))
  const hits = events.filter(event => event.k === 'timeout.hit')
  for (const run of runs) {
    const entry = typeof run.body.entry === 'string' ? run.body.entry : typeof run.body.rule === 'string' ? run.body.rule : undefined
    const hit = entry === undefined ? undefined : hits.find(event =>
      event.body.entry === entry && Math.abs(at(event) - at(run)) <= 5_000)
    if (hit === undefined) findings.push(`运行缺 timeout.hit：${run.k} ${entry ?? '—'} 于 ${run.at}`)
  }
  for (const hit of hits) {
    const run = typeof hit.body.run === 'string' ? hit.body.run : undefined
    if (run === undefined) continue // a check sender has no run events; only the prevMs chain judges those
    const entry = typeof hit.body.entry === 'string' ? hit.body.entry : undefined
    const found = entry !== undefined && runs.some(later =>
      (later.body.entry === entry || later.body.rule === entry) && Math.abs(at(later) - at(hit)) <= 5_000)
    if (!found) findings.push(`timeout.hit 没有对应的运行：${String(hit.body.entry)} 于 ${hit.at}（run ${run}）`)
  }
  const setsByEntry = new Map<string, MetricsEvent[]>()
  for (const event of events) {
    if (event.k !== 'timeout.set') continue
    const entry = typeof event.body.entry === 'string' ? event.body.entry : undefined
    if (entry !== undefined) setsByEntry.set(entry, [...setsByEntry.get(entry) ?? [], event])
  }
  for (const [entry, sets] of [...setsByEntry.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ordered = [...sets].sort((a, b) => a.at.localeCompare(b.at) || a.n - b.n)
    ordered.forEach((event, position) => {
      const prev = typeof event.body.prevMs === 'number' ? event.body.prevMs : undefined
      if (position === 0) {
        if (prev !== undefined) findings.push(`timeout.set 的第一条带 prevMs：${entry} 于 ${event.at}`)
        return
      }
      const previous = ordered[position - 1].body.limitMs
      const previousLimit = typeof previous === 'number' ? previous : undefined
      if (previousLimit === undefined || prev !== previousLimit) {
        findings.push(`timeout.set 的 prevMs 对不上上一条的 limitMs：${entry} 于 ${event.at}（prevMs ${prev ?? '无'}，上一条 ${previousLimit ?? '无'}）`)
      }
    })
  }
  return findings
}

/** The first seven hex digits of the project's git HEAD — the backfill writer's id (F31). */
function headOf(root: string): string | undefined {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
  const head = result.status === 0 ? result.stdout.trim() : ''
  return /^[0-9a-f]{40}$/.test(head) ? head.slice(0, 7) : undefined
}

export async function runCli(args: readonly string[], io: CliIo): Promise<CliResult> {
  const parsed = parseArgs2(args)
  if ('exitCode' in parsed) return parsed
  const root = projectOf(parsed.project)?.root
  if (root === undefined) return usageError(`--project ${parsed.project} 不在任何项目里`)
  const now = io.now

  if (parsed.command === 'verify') {
    const findings = await checkLog(root)
    const { events } = await readLog(root)
    const lines: string[] = []
    if (findings.missing.length > 0) lines.push(...findings.missing.map(range => `缺行：${range.w} ${range.from}–${range.to}`))
    if (findings.chainBreaks.length > 0) lines.push(...findings.chainBreaks.map(breaks => `链断：${breaks.w} 序号 ${breaks.n}`))
    if (findings.noStop.length > 0) lines.push(...findings.noStop.map(writer => `没有正常退出：${writer.w}（最后一条 ${writer.lastAt}）`))
    if (findings.clockRollbacks.length > 0) lines.push(...findings.clockRollbacks.map(rollback => `时钟回拨：${rollback.w} 序号 ${rollback.n} 于 ${rollback.at}`))
    if (findings.duplicates > 0) lines.push(`重复 (w, n)：${findings.duplicates} 条`)
    if (findings.unreadable.length > 0) lines.push(...findings.unreadable.map(problem => `无法读取：${problem.file} 第 ${problem.line} 行（${problem.reason}）`))
    if (findings.lostFiles.length > 0) lines.push(...findings.lostFiles.map(file => `文件丢失：${file}`))
    if (findings.forgeries.length > 0) lines.push(...findings.forgeries.map(forgery => `伪造：命令行写入者 ${forgery.w} 写了宿主事件 ${forgery.kind}`))
    lines.push(...await verifyReconciliations(root, io.env, events))
    if (lines.length === 0) return ok('verify：没有发现\n')
    return fail(`verify：${lines.length} 项发现\n${lines.map(line => `- ${line}`).join('\n')}\n`)
  }

  if (parsed.command === 'prune') {
    const before = parsed.before!
    const dir = join(root, '.llm', 'metrics')
    if (!existsSync(dir)) return ok('prune：没有可删的文件\n')
    const names = readdirSync(dir).filter(name => /^events-\d{4}-\d{2}-\d{2}.*\.jsonl$/.test(name) && name.slice(7, 17) < before).sort()
    if (names.length === 0) return ok(`prune：${before} 之前没有文件\n`)
    let lines = 0
    for (const name of names) lines += readFileSync(join(dir, name), 'utf8').split('\n').length - 1
    const written = await appendEvents(root, [{ k: 'prune', by: 'host', body: { before, files: names.length, lines } }])
    if (written.rejected > 0 || written.error !== undefined) return fail(`prune：prune 事件写不进（${written.error ?? `拒收 ${written.rejected}`}），文件未删\n`)
    for (const name of names) rmSync(join(dir, name))
    return ok(`prune：删了 ${names.length} 个文件（${lines} 行）\n`)
  }

  if (parsed.command === 'backfill-graph') {
    const graphDir = join(root, 'docs', 'graph')
    if (!existsSync(graphDir)) return fail(`backfill-graph：${graphDir} 不存在\n`)
    const head = headOf(root)
    if (head === undefined) return fail('backfill-graph：项目不是 git 仓库（取不到 HEAD）\n')
    const graph = await loadGraph(graphDir)
    const { events } = await readLog(root)
    const firstLive = events.find(event => event.k === 'graph' && event.body.src !== 'history')?.at
    const pairs = graphPairs(events)
    const backfill: EmittedEvent[] = []
    for (const [node, nodeFile] of [...graph.nodes.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      nodeFile.history.forEach((entry, hi) => {
        if (firstLive !== undefined && entry.at >= firstLive) return
        if (pairs.has(`${node}\u0000${hi}`)) return
        backfill.push({
          k: 'graph',
          by: 'graph',
          at: entry.at,
          body: {
            node,
            type: nodeFile.type,
            op: entry.op,
            hi,
            actor: entry.actor,
            ...(entry.relay !== undefined ? { relay: true } : {}),
            ...(entry.from !== undefined ? { from: entry.from } : {}),
            ...(entry.to !== undefined ? { to: entry.to } : {}),
            src: 'history',
          },
        })
      })
    }
    if (backfill.length === 0) return ok('backfill-graph：没有要补的条目\n')
    // Ascending by `at`, with the writer's clock pinned to the oldest
    // instant: start, the events, and stop all sit inside the backfilled
    // span, so the reader's clock-rollback check stays quiet (§5.4).
    backfill.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''))
    const oldest = Date.parse(backfill[0].at ?? '')
    const result = await appendEvents(root, backfill, 'cli', { randomId: () => `bf-${head}`, now: () => oldest })
    if (result.error !== undefined || result.rejected > 0) return fail(`backfill-graph：写不进（${result.error ?? `拒收 ${result.rejected}`}）\n`)
    return ok(`backfill-graph：补了 ${backfill.length} 条（写入者 bf-${head}）\n`)
  }

  const { events, basis } = await readLog(root, { from: parsed.from, to: parsed.to, basis: parsed.basis })
  const { from, to } = windowOf(parsed, events, now)
  const findings = await checkLog(root, { from, to })
  // The size the report names is the size of its input: with a basis, the
  // bytes of the covered lines; without, the journal's files as they are on
  // disk. Otherwise an append between runs would change the rerun's output
  // and break the verbatim reproduces of acceptance 8.
  const input = {
    events,
    basis,
    from,
    to,
    tz: parsed.tz,
    findings: { ...findings, bytes: basis === undefined ? findings.bytes : coveredBytes(root, basis) },
    today: localDate(new Date(now()).toISOString(), parsed.tz),
  }
  if (parsed.command === 'summary') return output(scoresFor(input), parsed.json)
  if (parsed.command === 'compare') return output(compare({ ...input, by: parsed.by as CompareKey }), parsed.json)
  return usageError('未知子命令')
}

/** The bytes of each basis file's first `limit` lines (§5.3's 总大小, scoped to the basis so reruns are verbatim). */
function coveredBytes(root: string, basis: ReadonlyMap<string, number>): number {
  let total = 0
  for (const [file, limit] of basis) {
    try {
      const lines = readFileSync(join(root, '.llm', 'metrics', file), 'utf8').split('\n')
      total += lines.slice(0, limit).reduce((sum, line) => sum + Buffer.byteLength(`${line}\n`, 'utf8'), 0)
    }
    catch {
      // A file that vanished since the read contributes nothing.
    }
  }
  return total
}
