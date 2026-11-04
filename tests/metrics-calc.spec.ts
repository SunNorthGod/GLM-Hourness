/**
 * The computation and the command line (metrics design §12 step 4):
 * determinism and the basis line (acceptance 8), the comparison (9), the
 * `verify` findings and its four reconciliations (10), the prune (14),
 * the timeout facts (21), the quota stall and the progress rows (24), the
 * facts half of the deny/lift accounting (22) and the follow-the-
 * recommendation ratio that lives in `scoresFor` and nowhere else (4's
 * last sentence). The fixtures live in tests/fixtures/metrics/.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { CALC_VERSION, compare, factsFor, median, pct, scoresFor, type CalcGroup } from '../src/metrics/calc.ts'
import { runCli } from '../src/metrics/cli.ts'
import { appendEvents } from '../src/metrics/library.ts'
import { readLog } from '../src/metrics/read.ts'
import { METRICS_KINDS } from '../src/metrics/kinds/index.ts'
import type { MetricsEvent } from '../src/metrics/schema.ts'
import { userDataHome } from '../src/shared/data-home.ts'
import { emptyFindings } from './metrics-helpers.ts'
import { nodeMetricsFs, openWriter } from '../src/metrics/writer.ts'
import { serializeNode } from '../src/graph/format.ts'
import type { GraphNode } from '../src/graph/schema.ts'

const FROM = '2026-11-04T00:00:00.000Z'
const TO = '2026-11-05T00:00:00.000Z'
const TODAY = '2026-11-04'

const inputOf = (events: readonly MetricsEvent[], overrides: Partial<Parameters<typeof factsFor>[0]> = {}) => ({
  events,
  basis: new Map([['events-2026-11-04.jsonl', events.length]]),
  from: FROM,
  to: TO,
  tz: '+08:00',
  findings: emptyFindings(),
  ...overrides,
})

const groupOf = (groups: readonly CalcGroup[], title: string): CalcGroup | undefined =>
  groups.find(group => group.title === title)

const rowOf = (groups: readonly CalcGroup[], title: string, label: string): string | undefined =>
  groupOf(groups, title)?.rows.find(row => row.label === label)?.value

const loadFixture = (name: string): MetricsEvent[] => JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'metrics', name), 'utf8')) as MetricsEvent[]

const summaryFixture = (): MetricsEvent[] => loadFixture('events-summary.json')

function tempProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'metrics-calc-'))
  const git = (args: readonly string[]): void => {
    const result = spawnSync('git', ['-c', 'user.email=probe@example', '-c', 'user.name=probe', ...args], { cwd: root, encoding: 'utf8' })
    if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
  }
  git(['init', '-q', '-b', 'main'])
  writeFileSync(join(root, 'README.md'), 'fixture\n')
  git(['add', '.'])
  git(['commit', '-q', '-m', 'fixture'])
  mkdirSync(join(root, '.git', 'info'), { recursive: true })
  return root
}

/** The CLI's io against a scratch DSH home. */
const cliIo = (root: string, now: () => number = Date.now) => {
  const home = join(root, 'dsh-home')
  return { io: { cwd: root, env: { DSH_HOME: home }, now }, home }
}

test('the basis line names the files with their line ranges, the window, the unreadable count and the version (acceptance 8)', () => {
  const basis = new Map([['events-2026-11-04.jsonl', 842], ['events-2026-11-05.jsonl', 120]])
  const line = factsFor(inputOf([], { basis })).basis
  assert.equal(line, `依据：events-2026-11-04.jsonl 1–842 行，events-2026-11-05.jsonl 1–120 行；窗口 ${FROM}–${TO}（+08:00）；无法读取 0；计算版本 ${CALC_VERSION}`)
  assert.equal(CALC_VERSION, 1)
})

test('the same events compute the same output twice, in any order, facts and scores and compare alike (acceptance 8)', () => {
  const events = summaryFixture()
  const first = JSON.stringify(scoresFor(inputOf(events)))
  const second = JSON.stringify(scoresFor(inputOf(events)))
  assert.equal(first, second)
  const shuffled = [...events].reverse()
  assert.equal(JSON.stringify(scoresFor(inputOf(shuffled))), first)
  const facts = JSON.stringify(factsFor(inputOf(events)))
  assert.equal(JSON.stringify(factsFor(inputOf([...events].sort(() => 0.5 - Math.random())))), facts)
  const compared = JSON.stringify(compare({ ...inputOf(events), by: 'v' }))
  assert.equal(JSON.stringify(compare({ ...inputOf([...events].reverse()), by: 'v' })), compared)
})

test('the summary fixture computes the table: the burden numbers, the lift, the per-step medians, the peak share (acceptance 21 slice)', () => {
  const { groups } = scoresFor(inputOf(summaryFixture(), { today: TODAY }))
  assert.equal(rowOf(groups, '问人（减负数字）', '问你几次'), '2 次')
  assert.equal(rowOf(groups, '问人（减负数字）', '每次要读的字'), '65（最长 90）')
  assert.equal(rowOf(groups, '问人（减负数字）', '你回话等了多久'), '21 分钟（最长 30 分钟）')
  assert.equal(rowOf(groups, '撤下', '现在撤下'), 'file-tools-only')
  assert.equal(rowOf(groups, '每一步（按模型）', 'glm-5.3'), '步数 3；用时中位 9000ms；token 中位 120；首字中位 1200ms（最长 1800ms）；结束 stop 2、tool-calls 1')
  assert.match(rowOf(groups, '积分', '总计') ?? '', /^7\.00（高峰 85\.7%）$/)
  assert.match(rowOf(groups, '积分', '角色 main') ?? '', /6\.00/)
  assert.match(rowOf(groups, '积分', '角色 worker') ?? '', /1\.00/)
  assert.match(rowOf(groups, '工具', '被拦率') ?? '', /^50\.0%$/)
})

test('factsFor carries no score rows; the ratio and the per-step table live only in scoresFor (acceptance 4, F9)', () => {
  const facts = factsFor(inputOf(summaryFixture()))
  const labels = facts.groups.flatMap(group => group.rows.map(row => row.label))
  assert.ok(!labels.some(label => label.includes('跟了推荐') || label.includes('每一步') || label.includes('被拦率')))
  assert.equal(rowOf(facts.groups, '问人（减负数字）', '问你几次'), '2 次')
})

test('compare by v lists per-step medians, per-task credits, the agreement rate and the samples per build (acceptance 9)', () => {
  const events = loadFixture('events-compare.json')
  const { groups } = compare({ ...inputOf(events), by: 'v' })
  assert.deepEqual(groups.map(group => group.title), ['v=0.3.0+v1.dirty', 'v=0.3.0+v2.dirty'])
  const v1 = groupOf(groups, 'v=0.3.0+v1.dirty')
  assert.equal(v1?.rows.find(row => row.label === '样本')?.value, '6 条（模型调用 2）')
  assert.equal(v1?.rows.find(row => row.label === '每步用时中位')?.value, '6000ms')
  assert.equal(v1?.rows.find(row => row.label === '每步 token 中位')?.value, '13')
  assert.match(v1?.rows.find(row => row.label === '积分')?.value ?? '', /^1\.50/)
  assert.match(v1?.rows.find(row => row.label === '每任务积分')?.value ?? '', /task-v1 0\.50/)
  assert.equal(v1?.rows.find(row => row.label === '原样同意')?.value, '100.0%')
  const v2 = groupOf(groups, 'v=0.3.0+v2.dirty')
  assert.equal(v2?.rows.find(row => row.label === '每步用时中位')?.value, '8000ms')
  assert.match(v2?.rows.find(row => row.label === '原样同意')?.value ?? '', /^0\.0%$/)
})

test('the follow-the-recommendation ratio is 40.0% over 5 answers, in scoresFor and not in factsFor (acceptance 4)', () => {
  const events = loadFixture('events-design.json')
  const scores = scoresFor(inputOf(events))
  const row = groupOf(scores.groups, '问人（打分）')?.rows.find(row => row.label === '跟了推荐')
  assert.ok(row !== undefined)
  assert.ok(row.value.startsWith('40.0%'), row.value)
  assert.equal(row.samples, 5)
  const facts = factsFor(inputOf(events))
  assert.equal(facts.groups.flatMap(group => group.rows).find(row => row.label === '跟了推荐'), undefined)
})

test('the timeout facts list each entry with its count, last limit and elapsed, the source with its estimate; no score side repeats them (acceptance 21)', () => {
  const at = (minute: number) => `2026-11-04T11:${String(minute).padStart(2, '0')}:00.000Z`
  const ev = (k: string, n: number, body: Record<string, unknown>, minute: number): MetricsEvent =>
    ({ s: 1, k, at: at(minute), w: '0123abcd', n, h: '0'.repeat(12), v: 'v', by: 'rules', body })
  const events: MetricsEvent[] = [
    ev('timeout.set', 1, { entry: 'e-1', kind: 'script', limitMs: 9000, source: 'estimate', estMs: 3000 }, 1),
    ev('timeout.set', 2, { entry: 'e-1', kind: 'script', limitMs: 9000, source: 'measured', runs: 2, slowestMs: 3000, prevMs: 9000 }, 2),
    ev('timeout.set', 3, { entry: 'e-2', kind: 'script', limitMs: 60000, source: 'default' }, 3),
    ev('timeout.set', 4, { entry: 'e-3', kind: 'loop', limitMs: 30000, source: 'ceiling', wantedMs: 90000, estMs: 1000, floored: true, told: true }, 4),
    ev('timeout.set', 5, { entry: 'e-4', kind: 'check', limitMs: 600000, source: 'fixed' }, 5),
    ev('timeout.hit', 6, { entry: 'e-1', kind: 'script', limitMs: 9000, elapsedMs: 9001, outcome: 'killed', source: 'measured', told: false }, 6),
    ev('timeout.hit', 7, { entry: 'e-3', kind: 'loop', limitMs: 30000, elapsedMs: 30001, outcome: 'partial', source: 'ceiling', told: true }, 7),
  ]
  const { groups } = factsFor(inputOf(events))
  const timeouts = groupOf(groups, '超时')
  assert.ok(timeouts !== undefined)
  const e1 = timeouts.rows.find(row => row.label === 'e-1')
  assert.match(e1?.value ?? '', /^超时 1 次；最近限 9000ms／用时 9001ms／结局 killed；来源 measured；上次变更 .*（原 9000ms）；告知 否/)
  const e3 = timeouts.rows.find(row => row.label === 'e-3')
  assert.match(e3?.value ?? '', /被上限截住 1 次；告知 是/)
  assert.match(timeouts.rows.find(row => row.label === 'e-2')?.value ?? '', /来源 default（无预计）|来源 default/)
  // The score side adds no timeout group of its own.
  const scoreTitles = scoresFor(inputOf(events)).groups.slice(factsFor(inputOf(events)).groups.length).map(group => group.title)
  assert.ok(!scoreTitles.some(title => title.includes('超时')))
})

test('the quota stall counts a stop-to-resume pair by the M7 codes, or reads — without them; the progress rows count due and handover (acceptance 24)', () => {
  const ev = (n: number, body: Record<string, unknown>): MetricsEvent =>
    ({ s: 1, k: 'execute.goal', at: `2026-11-04T12:${String(n).padStart(2, '0')}:00.000Z`, w: '0123abcd', n, h: '0'.repeat(12), v: 'v', by: 'execute', body })
  const events: MetricsEvent[] = [
    ev(1, { goal: 'g-7', op: 'stalled', code: 'quota-exhausted' }),
    ev(2, { goal: 'g-7', op: 'resumed', resumeWhy: 'quota-reset' }),
  ]
  const withCodes = factsFor(inputOf(events, { quota: { stallCode: 'quota-exhausted', resumeCode: 'quota-reset' } }))
  assert.match(rowOf(withCodes.groups, '额度停住', '停住') ?? '', /^停了 1 次，共 1 分钟；自己接上 1 次；人手动接上 0 次；现在没停$/)
  const withoutCodes = factsFor(inputOf(events))
  assert.equal(rowOf(withoutCodes.groups, '额度停住', '停住'), '—')
  const progressEvents: MetricsEvent[] = [
    { s: 1, k: 'progress.due', at: '2026-11-04T13:00:00.000Z', w: 'w', n: 1, h: '0'.repeat(12), v: 'v', by: 'execute', body: { goal: 'g-8', scope: 'goal', away: true } },
    { s: 1, k: 'progress.due', at: '2026-11-04T13:01:00.000Z', w: 'w', n: 2, h: '0'.repeat(12), v: 'v', by: 'execute', body: { goal: 'g-8', part: 'p-1', scope: 'part', away: false } },
    { s: 1, k: 'progress.handover', at: '2026-11-04T13:02:00.000Z', w: 'w', n: 3, h: '0'.repeat(12), v: 'v', by: 'execute', body: { n: 2, waitedMs: 900000, goalDone: true } },
  ]
  const progress = factsFor(inputOf(progressEvents))
  assert.equal(rowOf(progress.groups, '汇报', '到期'), '整目标 1；一块 1')
  assert.equal(rowOf(progress.groups, '汇报', '交付'), '1 次')
  assert.equal(rowOf(progress.groups, '汇报', '最长等了'), '15 分钟')
  assert.equal(rowOf(progress.groups, '汇报', '目标做完的交了'), '交了')
})

test('no kind field or enum value names the shadow or promotion vocabulary; the deny and lift facts count per rule without samples (acceptance 22)', () => {
  const forbidden = /shadow|promot|precision|recall|影子|试运行|转正/
  const offenders: string[] = []
  for (const [kind, table] of METRICS_KINDS) {
    for (const field of table.fields) {
      if (forbidden.test(field.name)) offenders.push(`${kind}.${field.name}`)
      if (Array.isArray(field.type)) for (const value of field.type as readonly string[]) if (forbidden.test(value)) offenders.push(`${kind}.${field.name}=${value}`)
    }
  }
  assert.deepEqual(offenders, [])
  const at = (minute: number) => `2026-11-04T14:${String(minute).padStart(2, '0')}:00.000Z`
  const events: MetricsEvent[] = [
    { s: 1, k: 'rule', at: at(1), w: 'w', n: 1, h: '0'.repeat(12), v: 'v', by: 'guard', sid: 's-1', body: { call: 'c-1', rule: 'file-tools-only', effect: 'deny' } },
    { s: 1, k: 'rule', at: at(2), w: 'w', n: 2, h: '0'.repeat(12), v: 'v', by: 'guard', sid: 's-1', body: { rule: 'file-tools-only', effect: 'deny' } },
    { s: 1, k: 'rule', at: at(3), w: 'w', n: 3, h: '0'.repeat(12), v: 'v', by: 'guard', sid: 's-1', body: { rule: 'git-snapshot', effect: 'late' } },
  ]
  const facts = factsFor(inputOf(events))
  assert.equal(rowOf(facts.groups, '拦截', '近 7 天拦下'), 'file-tools-only 2')
  assert.equal(rowOf(facts.groups, '拦截', '晚到的拦下'), '1 次；判定 0')
  const interceptLabels = groupOf(facts.groups, '拦截')?.rows.map(row => row.label).join(',') ?? ''
  const liftLabels = groupOf(facts.groups, '撤下')?.rows.map(row => row.label).join(',') ?? ''
  for (const labels of [interceptLabels, liftLabels]) assert.ok(!/样本|误伤|precision|recall/.test(labels), labels)
})

test('rule and lift events roundtrip verbatim with any id-shaped via (acceptance 22)', async () => {
  const root = tempProject()
  try {
    const at = (minute: number) => `2026-11-04T15:${String(minute).padStart(2, '0')}:00.000Z`
    const first = await appendEvents(root, [
      { k: 'rule', by: 'guard', at: at(1), body: { call: 'c-1', rule: 'metrics-files-only', effect: 'deny' } },
      { k: 'lift', by: 'guard', at: at(2), body: { rule: 'metrics-files-only', action: 'lift', via: 'board', units: 4 } },
    ])
    assert.deepEqual({ written: first.written, rejected: first.rejected, error: first.error ?? null }, { written: 4, rejected: 0, error: null })
    const second = await appendEvents(root, [
      { k: 'lift', by: 'guard', at: at(3), body: { rule: 'metrics-files-only', action: 'restore', via: 'chat', units: 6 } },
      { k: 'lift', by: 'guard', at: at(4), body: { rule: 'metrics-files-only', action: 'lift', via: 'phone', units: 6 } },
    ])
    assert.equal(second.error, undefined)
    const { events } = await readLog(root)
    const lifts = events.filter(event => event.k === 'lift')
    assert.deepEqual(lifts.map(lift => lift.body.via), ['board', 'chat', 'phone'])
    const denied = events.find(event => event.k === 'rule')
    assert.deepEqual(denied?.body, { call: 'c-1', rule: 'metrics-files-only', effect: 'deny' })
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('verify renders the checker findings and exits 1, or exits 0 on a clean project (acceptance 10)', async () => {
  const dirty = tempProject()
  const clean = tempProject()
  try {
    // A writer whose chain breaks when a line is edited afterwards.
    const writer = openWriter({ host: 'headless', fs: nodeMetricsFs, now: () => Date.parse('2026-11-04T16:00:00.000Z'), randomId: () => 'aaaa1111' })
    writer.record(dirty, { k: 'count', by: 'guard', at: '2026-11-04T16:00:01.000Z', body: { what: 'a', value: 1 } })
    writer.record(dirty, { k: 'count', by: 'guard', at: '2026-11-04T16:00:02.000Z', body: { what: 'b', value: 2 } })
    await writer.flush()
    await writer.close()
    const day = join(dirty, '.llm', 'metrics', 'events-2026-11-04.jsonl')
    const lines = readFileSync(day, 'utf8').split('\n').filter(line => line !== '')
    const tampered = lines.map((line, index) => index === 2 ? line.replace('"value":2', '"value":9') : line)
    writeFileSync(day, `${tampered.join('\n')}\n`)
    // A manifest line naming a file the disk does not have (§5.5).
    await writeFile(join(dirty, '.llm', 'metrics-manifest.jsonl'), `${JSON.stringify({ file: 'events-2026-11-01.jsonl', w: 'bbbb2222', firstN: 1, at: '2026-11-01T00:00:00.000Z' })}\n`, 'utf8')
    const io = cliIo(dirty)
    const result = await runCli(['verify', '--project', dirty], io.io)
    assert.equal(result.exitCode, 1, result.stdout + result.stderr)
    assert.match(result.stderr, /链断：aaaa1111 序号 3/)
    assert.match(result.stderr, /文件丢失：events-2026-11-01\.jsonl/)

    const cleanResult = await runCli(['verify', '--project', clean], cliIo(clean).io)
    assert.equal(cleanResult.exitCode, 0)
    assert.match(cleanResult.stdout, /没有发现/)
  }
  finally {
    rmSync(dirty, { recursive: true, force: true })
    rmSync(clean, { recursive: true, force: true })
  }
})

test('verify reconciles the timeout entries and the usage journal (acceptance 10, F12)', async () => {
  const root = tempProject()
  try {
    const writer = openWriter({ host: 'headless', fs: nodeMetricsFs, now: () => Date.parse('2026-11-04T17:00:00.000Z'), randomId: () => 'aaaa1111' })
    writer.record(root, { k: 'llm', by: 'host', at: '2026-11-04T17:00:01.000Z', sid: 's-1', body: { turn: 1, step: 1, provider: 'p', model: 'm', input: 1, output: 1, total: 2, ms: 5, ttft: 5, fin: 'stop', calls: 0, text: 0, credits: 0, peak: false } })
    writer.record(root, { k: 'llm', by: 'host', at: '2026-11-04T17:00:02.000Z', sid: 's-1', body: { turn: 1, step: 2, provider: 'p', model: 'm', input: 1, output: 1, total: 2, ms: 5, ttft: 5, fin: 'stop', calls: 0, text: 0, credits: 0, peak: false } })
    writer.record(root, { k: 'loop-done', by: 'loops', at: '2026-11-04T17:01:00.000Z', body: { entry: 'e-hit', run: 'r-1', outcome: 'unfinished' } })
    writer.record(root, { k: 'loop-done', by: 'loops', at: '2026-11-04T17:02:00.000Z', body: { entry: 'e-miss', run: 'r-2', outcome: 'unfinished' } })
    writer.record(root, { k: 'timeout.hit', by: 'loops', at: '2026-11-04T17:01:01.000Z', body: { entry: 'e-hit', kind: 'loop', limitMs: 1000, elapsedMs: 1001, outcome: 'killed', source: 'fixed', told: false, run: 'r-1' } })
    writer.record(root, { k: 'timeout.hit', by: 'loops', at: '2026-11-04T17:03:00.000Z', body: { entry: 'e-lone', kind: 'loop', limitMs: 1000, elapsedMs: 1001, outcome: 'killed', source: 'fixed', told: false, run: 'r-9' } })
    writer.record(root, { k: 'timeout.set', by: 'loops', at: '2026-11-04T17:04:00.000Z', body: { entry: 'e-chain', kind: 'script', limitMs: 100, source: 'estimate', estMs: 30 } })
    writer.record(root, { k: 'timeout.set', by: 'loops', at: '2026-11-04T17:05:00.000Z', body: { entry: 'e-chain', kind: 'script', limitMs: 200, source: 'measured', runs: 1, slowestMs: 60, prevMs: 999 } })
    await writer.flush()
    await writer.close()
    const { io } = cliIo(root)
    const usagePath = join(userDataHome(undefined, io.env), 'audit', 'usage.jsonl')
    mkdirSync(dirname(usagePath), { recursive: true })
    // One usage row for the session, two llm events in the journal: a mismatch.
    writeFileSync(usagePath, `${JSON.stringify({ at: '2026-11-04T17:00:01.000Z', sessionId: 's-1', provider: 'p', model: 'm', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } })}\n`)
    const result = await runCli(['verify', '--project', root], io)
    assert.equal(result.exitCode, 1)
    assert.match(result.stderr, /运行缺 timeout\.hit：loop-done e-miss/)
    assert.match(result.stderr, /timeout\.hit 没有对应的运行：e-lone .*（run r-9）/)
    assert.match(result.stderr, /prevMs 对不上上一条的 limitMs：e-chain .*（prevMs 999，上一条 100）/)
    assert.match(result.stderr, /会话 s-1 的 llm 事件 2 条，用量流水 1 条/)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('verify flags graph history entries the journal misses; backfill-graph fills them once and never twice (acceptance 10, §7.5)', async () => {
  const root = tempProject()
  try {
    const { io } = cliIo(root)
    const seed = await appendEvents(root, [{ k: 'count', by: 'guard', at: '2026-11-04T18:00:00.000Z', body: { what: 'seed', value: 1 } }])
    assert.equal(seed.error, undefined)
    const nodes = join(root, 'docs', 'graph', 'nodes')
    mkdirSync(nodes, { recursive: true })
    const entry = (at: string, op: string): { readonly at: string, readonly actor: 'human', readonly op: string, readonly reason: string } => ({ at, actor: 'human', op, reason: 'probe' })
    const node: GraphNode = {
      id: 'goal-1',
      type: 'goal',
      title: '回填',
      status: 'approved',
      history: [entry('2026-11-04T18:00:00.000Z', 'propose'), entry('2026-11-04T19:00:00.000Z', 'approve')],
    }
    await writeFile(join(nodes, 'goal-1.json'), serializeNode(node), 'utf8')
    // The journal starts after the first history entry: that one is missing, the second is inside the live span.
    const before = await runCli(['verify', '--project', root], io)
    assert.equal(before.exitCode, 1)
    assert.match(before.stderr, /图历史缺条目：goal-1#0 .*流水开始于/)
    const backfill = await runCli(['backfill-graph', '--project', root], io)
    assert.equal(backfill.exitCode, 0, backfill.stderr)
    assert.match(backfill.stdout, /补了 2 条（写入者 bf-[0-9a-f]{7}）/)
    const again = await runCli(['backfill-graph', '--project', root], io)
    assert.match(again.stdout, /没有要补的条目/)
    const { events } = await readLog(root)
    const graphs = events.filter(event => event.k === 'graph')
    assert.equal(graphs.length, 2)
    assert.ok(graphs.every(event => /^bf-[0-9a-f]{7}$/.test(event.w)))
    assert.deepEqual(graphs.map(event => [event.body.hi, event.body.src, event.body.op]), [[0, 'history', 'propose'], [1, 'history', 'approve']])
    assert.equal(graphs[0]?.body.rev, undefined)
    const after = await runCli(['verify', '--project', root], io)
    assert.ok(!after.stderr.includes('图历史缺条目'), after.stderr)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('prune writes the event first, deletes the old files, and verify stops reporting them; a hand-deleted file stays a finding (acceptance 14)', async () => {
  const root = tempProject()
  try {
    const oldWriter = openWriter({ host: 'headless', fs: nodeMetricsFs, now: () => Date.parse('2026-11-01T00:00:00.000Z'), randomId: () => 'aaaa1111' })
    oldWriter.record(root, { k: 'count', by: 'guard', at: '2026-11-01T00:00:01.000Z', body: { what: 'old', value: 1 } })
    await oldWriter.flush()
    await oldWriter.close()
    const midWriter = openWriter({ host: 'headless', fs: nodeMetricsFs, now: () => Date.parse('2026-11-02T00:00:00.000Z'), randomId: () => 'cccc3333' })
    midWriter.record(root, { k: 'count', by: 'guard', at: '2026-11-02T00:00:01.000Z', body: { what: 'mid', value: 3 } })
    await midWriter.flush()
    await midWriter.close()
    const newWriter = openWriter({ host: 'headless', fs: nodeMetricsFs, now: () => Date.parse('2026-11-04T19:00:00.000Z'), randomId: () => 'bbbb2222' })
    newWriter.record(root, { k: 'count', by: 'guard', at: '2026-11-04T19:00:01.000Z', body: { what: 'new', value: 2 } })
    await newWriter.flush()
    await newWriter.close()
    const oldDay = join(root, '.llm', 'metrics', 'events-2026-11-01.jsonl')
    const midDay = join(root, '.llm', 'metrics', 'events-2026-11-02.jsonl')
    const oldLines = readFileSync(oldDay, 'utf8').split('\n').filter(line => line !== '').length
    // A hand deletion is a finding: the manifest remembers the file, no prune covers it.
    rmSync(midDay)
    const handDeleted = await runCli(['verify', '--project', root], cliIo(root).io)
    assert.equal(handDeleted.exitCode, 1)
    assert.match(handDeleted.stderr, /文件丢失：events-2026-11-02\.jsonl/)
    const prune = await runCli(['prune', '--before', '2026-11-02', '--project', root], cliIo(root).io)
    assert.equal(prune.exitCode, 0, prune.stderr)
    assert.match(prune.stdout, /删了 1 个文件（3 行）/)
    assert.ok(!existsSync(oldDay))
    const { events } = await readLog(root)
    const pruneEvent = events.find(event => event.k === 'prune')
    assert.ok(pruneEvent !== undefined)
    assert.equal(pruneEvent.body.before, '2026-11-02')
    assert.equal(pruneEvent.body.files, 1)
    assert.equal(pruneEvent.body.lines, oldLines)
    const after = await runCli(['verify', '--project', root], cliIo(root).io)
    assert.ok(!after.stderr.includes('events-2026-11-01'), after.stderr)
    assert.match(after.stderr, /文件丢失：events-2026-11-02\.jsonl/)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the summary command prints the basis first and renders every group; --json answers with the same groups (acceptance 8 slice)', async () => {
  const root = tempProject()
  try {
    const { io } = cliIo(root)
    await appendEvents(root, [
      { k: 'count', by: 'guard', at: '2026-11-04T20:00:00.000Z', body: { what: 'a', value: 1 } },
      { k: 'count', by: 'guard', at: '2026-11-04T20:01:00.000Z', body: { what: 'b', value: 2 } },
    ])
    const args = ['summary', '--project', root, '--from', FROM, '--to', TO, '--tz', '+08:00']
    const text = await runCli(args, io)
    assert.equal(text.exitCode, 0)
    const lines = text.stdout.split('\n')
    assert.match(lines[0] ?? '', /^依据：events-\d{4}-\d{2}-\d{2}\.jsonl 1–\d+ 行；窗口/)
    assert.ok(lines.some(line => line === '覆盖'))
    assert.ok(lines.some(line => line.includes('问你几次') || line.includes('问人')))
    const json = await runCli([...args, '--json'], io)
    assert.equal(json.exitCode, 0)
    const parsed = JSON.parse(json.stdout) as { readonly basis: string, readonly groups: unknown }
    assert.match(parsed.basis, /^依据：/)
    assert.ok(Array.isArray(parsed.groups) && parsed.groups.length > 0)
    // Bad command lines exit 2 with the usage.
    const bad = await runCli(['summary', '--tz', '08:00', '--project', root], io)
    assert.equal(bad.exitCode, 2)
    assert.match(bad.stderr, /±HH:MM/)
    const outside = mkdtempSync(join(tmpdir(), 'metrics-noproj-'))
    try {
      const noProject = await runCli(['summary', '--project', outside], cliIo(outside).io)
      assert.equal(noProject.exitCode, 2)
      assert.match(noProject.stderr, /不在任何项目里/)
    }
    finally {
      rmSync(outside, { recursive: true, force: true })
    }
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an in-window append changes the output, and the basis rerun reproduces the first report verbatim (acceptance 8)', async () => {
  const root = tempProject()
  try {
    const { io } = cliIo(root)
    const args = ['summary', '--project', root, '--from', FROM, '--to', TO, '--tz', '+08:00']
    await appendEvents(root, [
      { k: 'count', by: 'guard', at: '2026-11-04T20:00:00.000Z', body: { what: 'a', value: 1 } },
      { k: 'count', by: 'guard', at: '2026-11-04T20:01:00.000Z', body: { what: 'b', value: 2 } },
    ])
    const first = await runCli(args, io)
    assert.equal(first.exitCode, 0)
    const appended = await appendEvents(root, [{ k: 'count', by: 'guard', at: '2026-11-04T20:02:00.000Z', body: { what: 'c', value: 3 } }])
    assert.equal(appended.error, undefined)
    // The rerun reads by the FIRST report's basis line: the file it named, to the line it read.
    const read = (first.stdout.split('\n')[0] ?? '').match(/(events-[^ ]+\.jsonl) 1–(\d+) 行/)
    assert.ok(read !== undefined, first.stdout.split('\n')[0] ?? '')
    const rerun = await runCli([...args, '--basis', `${read[1]}:${read[2]}`], io)
    assert.equal(rerun.exitCode, 0)
    assert.equal(rerun.stdout, first.stdout, 'the basis rerun reproduces the first report verbatim')
    const without = await runCli(args, io)
    assert.equal(without.exitCode, 0)
    assert.notEqual(without.stdout, first.stdout, 'without the basis the appended event shows')
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('pct keeps one decimal and reads — on a zero denominator; median rounds the even mean (§7.2)', () => {
  assert.equal(pct(2, 5), '40.0%')
  assert.equal(pct(1, 0), '—')
  assert.equal(median([1, 2]), 2)
  assert.equal(median([1, 2, 5]), 2)
})
