/**
 * The metrics board (metrics design §7.6, acceptance 25 (a)–(e)): the
 * `boardView` groups and rows over the fixtures (a), the contract pins —
 * only `cli.ts` and `board-view.ts` import `scoresFor`, only `index.ts`
 * imports `board-view.ts`, and no board name reaches `/hourness` or the
 * self-check's tell (b) —, the `hournessMetrics` projection whose values
 * carry a path or a reason and never a number (c), the compute and write
 * failures behind an injected read and rename that leave the model flow
 * byte for byte the same (d), and the client board over a fake registry
 * host and a fake `readBytes` (e). The fixtures live in
 * tests/fixtures/metrics/.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { emptyFindings, scratchGitProject } from './metrics-helpers.ts'
import { readFile, rename as realRename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import test from 'node:test'
import { plainWordsIn } from '../src/graph/plain-question.ts'
import { apply, METRICS_PROJECTION, METRICS_SELF_CHECK_ENTRY, type MetricsConfig, type MetricsProjectionView } from '../src/metrics/index.ts'
import { checkLog, readLog } from '../src/metrics/read.ts'
import type { MetricsEvent } from '../src/metrics/schema.ts'
import { boardView, boardWindows, capView } from '../src/metrics/board-view.ts'
import { parseMetricsBoardView, type MetricsBoardView } from '../src/shared/metrics-board.ts'
import { healthServiceName, type RowHealthView } from '../src/shared/health.ts'
import { renderHourness } from '../src/report/index.ts'
import { fakeInjector, fakeRuntime, type FakeRuntime } from './fake-rc3.ts'
import { GUIDE_LINE, homeLineOf, metricsBoard, stampOf } from '../ui/src/metrics/board.ts'
import type { ProjectionValues, RemoteRoot, SessionsClient } from '../ui/src/dsh.ts'
import type { BoardState } from '../ui/src/graph/boards.ts'
import type { StreamChunk } from '../src/shared/lm-min.ts'

const AT = 1_790_000_000_000
const NOW = Date.parse('2026-11-04T10:00:00.000Z')

const loadFixture = (name: string): MetricsEvent[] => JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'metrics', name), 'utf8')) as MetricsEvent[]

const windows = boardWindows(new Date(NOW).toISOString(), '+08:00')

const inputOf = (events: readonly MetricsEvent[]) => ({
  events,
  current: windows.current,
  previous: windows.previous,
  tz: '+08:00',
  findings: emptyFindings(),
  basis: new Map([['events-2026-11-04.jsonl', events.length]]),
})

const compose = (shaped: { readonly basis: string, readonly groups: MetricsBoardView['groups'] }, at: string | null, tried: string): MetricsBoardView =>
  ({ version: 1, at, tried, problem: null, basis: shaped.basis, windows: windows.labels, groups: shaped.groups })

/** Every fixed name the board can show: the empty-events view carries exactly the fixed titles, labels and notes. */
function boardNames(): string[] {
  const shaped = boardView(inputOf([]))
  const names: string[] = []
  for (const group of shaped.groups) {
    names.push(group.title)
    if (group.note !== undefined) names.push(group.note)
    for (const row of group.rows) {
      names.push(row.label)
      if (row.note !== undefined) names.push(row.note)
    }
  }
  return [...new Set(names)]
}

test('boardView pairs the two windows over the design fixture: the follow ratio leads, the burden rows sit in the relayed group (acceptance 25 a)', () => {
  const events = loadFixture('events-design.json')
  const shaped = boardView(inputOf(events))
  assert.deepEqual(shaped.groups.map(group => group.id), ['load', 'answers', 'asks', 'steps', 'tools', 'tasks', 'blocks', 'credits', 'coverage'])
  const load = shaped.groups[0]
  assert.ok(load !== undefined && load.relayed, 'the burden group is the relayed one')
  assert.deepEqual(load.rows.map(row => row.label), ['问你几次', '每次要读的字（中位数）', '你回话等了多久（中位数）'])
  assert.equal(load.note, '第四个数「因你的决定返工几次」在周报里，由项目图算')
  const answers = shaped.groups.find(group => group.id === 'answers')
  const follow = answers?.rows.find(row => row.label === '跟了推荐')
  assert.ok(follow !== undefined)
  assert.ok(follow.values[0].startsWith('40.0%'), follow.values[0])
  assert.equal(follow.samples?.[0], 5)
  assert.ok(!JSON.stringify(shaped.groups).includes('因你的决定返工几次：'), 'the fourth burden number is the note, never a row')
  const tasks = shaped.groups.find(group => group.id === 'tasks')
  const pending = tasks?.rows.filter(row => row.note === '还没接上')
  assert.deepEqual(pending?.map(row => [row.label, row.values]), [['降档后的返工比例', ['—', '—']], ['练习题回归一次做对的比例', ['—', '—']]])
  const coverage = shaped.groups.find(group => group.id === 'coverage')
  assert.ok(coverage?.rows.find(row => row.label === '依据')?.values[0].startsWith('依据：'))
  assert.equal(coverage?.rows.find(row => row.label === '无法读取')?.values[0], '0 行')
})

test('boardView keeps at most eight named models and sums the rest into 其他; the same events compute the same view twice (acceptance 25 a)', () => {
  const llm = (model: string, minute: number, n: number): MetricsEvent =>
    ({ s: 1, k: 'llm', at: `2026-11-04T10:${String(minute).padStart(2, '0')}:00.000Z`, w: '0123abcd', n, h: '0'.repeat(12), v: 'v', by: 'host', body: { turn: 1, step: n, model, ms: 1000, total: 10 } })
  const many = Array.from({ length: 10 }, (_, index) => llm(`model-${index}`, index + 1, index + 1))
  const shaped = boardView(inputOf(many))
  const steps = shaped.groups.find(group => group.id === 'steps')
  assert.equal(steps?.rows.length, 9)
  assert.deepEqual(steps?.rows.slice(0, 8).map(row => row.label), Array.from({ length: 8 }, (_, index) => `每步 model-${index}`))
  const other = steps?.rows.at(-1)
  assert.equal(other?.label, '其他')
  assert.equal(other?.values[0], '其余 2 个模型，共 2 步')
  assert.deepEqual(other?.samples, [2, 0])

  const events = loadFixture('events-design.json')
  const first = JSON.stringify(boardView(inputOf(events)))
  assert.equal(JSON.stringify(boardView(inputOf(events))), first)
  assert.equal(JSON.stringify(boardView(inputOf([...events].reverse()))), first)
  const strip = (at: number): string => {
    const view = JSON.parse(JSON.stringify(compose(boardView(inputOf(events)), new Date(NOW + at).toISOString(), new Date(NOW + at).toISOString()))) as Record<string, unknown>
    delete view.at
    delete view.tried
    return JSON.stringify(view)
  }
  assert.equal(strip(1000), strip(2000), 'view.json differs only in at and tried (acceptance 25 a)')
  assert.doesNotThrow(() => parseMetricsBoardView(compose(boardView(inputOf(events)), new Date(NOW).toISOString(), new Date(NOW).toISOString())))
})

test('capView keeps the whole text under 64 KiB, drops the later rows first and names what did not fit (§7.6.2)', () => {
  const big: MetricsBoardView = {
    version: 1,
    at: null,
    tried: new Date(NOW).toISOString(),
    problem: null,
    basis: '依据：（空）',
    windows: ['最近 7 天', '前 7 天'],
    groups: Array.from({ length: 9 }, (_, group) => ({
      id: `g${group}`,
      title: `组 ${group}`,
      relayed: false,
      rows: Array.from({ length: 300 }, (_, index) => ({ label: `行 ${index}`, values: ['x'.repeat(300), '—'] as const })),
    })),
  }
  const capped = capView(big)
  assert.ok(Buffer.byteLength(JSON.stringify(capped), 'utf8') <= 64 * 1024)
  const parsed = parseMetricsBoardView(capped)
  const last = parsed.groups.at(-1)
  assert.ok(last !== undefined && last.rows.some(row => row.values[0].includes('行没放下，看命令行')))
  assert.equal(capView(parseMetricsBoardView(compose(boardView(inputOf(loadFixture('events-design.json'))), new Date(NOW).toISOString(), new Date(NOW).toISOString()))).version, 1, 'a real view is far under the cap')
})

test('the contract pins: only cli and board-view import scoresFor, only index imports board-view, no board name reaches /hourness or the tell (acceptance 25 b)', async () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(dir, entry.name)) : entry.name.endsWith('.ts') ? [join(dir, entry.name)] : [])
  const src = walk(join(import.meta.dirname, '..', 'src'))
  const relativeOf = (file: string): string => relative(join(import.meta.dirname, '..', 'src'), file).split(sep).join('/')
  const mention = (needle: string): string[] => src.filter(file => readFileSync(file, 'utf8').includes(needle)).map(relativeOf).sort()
  assert.deepEqual(mention('scoresFor'), ['metrics/board-view.ts', 'metrics/calc.ts', 'metrics/cli.ts'])
  assert.deepEqual(mention('board-view'), ['metrics/index.ts'])

  const names = boardNames()
  const tell = METRICS_SELF_CHECK_ENTRY.action.tell?.text ?? ''
  assert.ok(tell.length > 0)
  for (const name of names) assert.ok(!tell.includes(name), name)

  const base = mkdtempSync(join(tmpdir(), 'metrics-board-hourness-'))
  try {
    const output = await renderHourness({ projectHome: join(base, 'p'), userHome: join(base, 'u') }, { fs: { readFile: () => Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })) }, now: new Date(NOW), offsetMinutes: 480 })
    for (const name of names) assert.ok(!output.includes(name), name)
  }
  finally {
    rmSync(base, { recursive: true, force: true })
  }
})

interface CapturedProjection {
  readonly key: string
  readonly stateVersion: number
  readonly init: (header: unknown) => unknown
}

test('the hournessMetrics projection hands the client a path or a reason, never a number, and stays off with the row (acceptance 25 c)', () => {
  const root = scratchGitProject('metrics-board-projection-')
  const userHome = join(root, '..', 'dsh-home')
  const rt = fakeRuntime({ route: { provider: 'glm-probe', model: 'glm-5.3' }, cwd: root })
  rt.services.set('agents', { get: (id: string) => id === rt.agent.id ? { id: rt.agent.id, session: rt.agent.session } : undefined })
  const registered: CapturedProjection[] = []
  const projectionsService = {
    register: (definition: unknown): (() => void) => {
      registered.push(definition as CapturedProjection)
      return () => {}
    },
    snapshot: (): { readonly values: Readonly<Record<string, unknown>> } => ({ values: {} }),
    stateOf: (): unknown => undefined,
  }
  try {
    const injector = fakeInjector({ sessionProjections: projectionsService }, rt.ctx)
    const stop = apply({ ...rt.ctx, inject: injector.inject } as never, { randomId: () => '0123abcd', now: () => NOW })
    assert.equal(registered.length, 1)
    const definition = registered[0]
    assert.equal(definition.key, METRICS_PROJECTION)
    assert.equal(METRICS_PROJECTION, 'hournessMetrics')
    assert.equal(definition.stateVersion, 1)
    const inProject = definition.init({ cwd: root }) as MetricsProjectionView
    assert.deepEqual(inProject, { viewFile: join(root, '.llm', 'metrics', 'view.json') })
    const noProject = definition.init({ cwd: userHome }) as MetricsProjectionView
    assert.deepEqual(noProject, { viewFile: null, reason: 'no-project' })
    const leaves = (value: unknown): unknown[] => typeof value === 'object' && value !== null ? Object.values(value).flatMap(leaves) : [value]
    for (const leaf of [...leaves(inProject), ...leaves(noProject)]) assert.ok(leaf === null || typeof leaf === 'string', 'projection values carry only paths and reasons')
    stop()
  }
  finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }

  const quietRoot = scratchGitProject('metrics-board-off-')
  const quiet = fakeRuntime({ route: { provider: 'glm-probe', model: 'glm-5.3' }, cwd: quietRoot })
  try {
    const stop = apply({ ...quiet.ctx } as never, { randomId: () => '0123abcd', now: () => NOW })
    const health = quiet.ctx.get(healthServiceName('metrics')) as RowHealthView | undefined
    assert.match(health?.activation().reason ?? '', /指标板没有登记/)
    stop()
  }
  finally {
    rmSync(join(quietRoot, '..'), { recursive: true, force: true })
  }
})

/** A scratch project with the row applied, a captured timer and the two failure seams of acceptance 25 (d). */
function boardFixture(): {
  readonly root: string
  readonly health: () => RowHealthView | undefined
  readonly emit: (at: number) => void
  readonly flush: () => void
  readonly setClock: (ms: number) => void
  readonly failCompute: (fail: boolean) => void
  readonly failRename: (fail: boolean) => void
  readonly rt: FakeRuntime
  readonly dispose: () => void
} {
  const root = scratchGitProject('metrics-board-row-')
  // The journal directory exists from the start: a directory created moments ago can transiently refuse its first file on Windows, and the writer's retry waits 30 s — longer than this test.
  mkdirSync(join(root, '.llm', 'metrics'), { recursive: true })
  const rt = fakeRuntime({ route: { provider: 'glm-probe', model: 'glm-5.3' }, cwd: root })
  rt.services.set('agents', { get: (id: string) => id === rt.agent.id ? { id: rt.agent.id, session: rt.agent.session } : undefined })
  let ms = AT
  let computeBroken = false
  let renameBroken = false
  const bodies: Array<() => void> = []
  const defaultRead = async (project: string, window: { readonly from: string, readonly to: string }) => {
    const [read, findings] = await Promise.all([
      readLog(project, { from: window.from, to: window.to }),
      checkLog(project, { from: window.from, to: window.to, now: () => ms }),
    ])
    return { events: read.events, basis: read.basis, findings }
  }
  const config: MetricsConfig = {
    randomId: () => '0123abcd',
    now: () => ms,
    timer: body => {
      bodies.push(body)
      return () => {}
    },
    boardRead: (project, window) => computeBroken ? Promise.reject(Object.assign(new Error('盘没了'), { code: 'EACCES' })) : defaultRead(project, window),
    rename: (from, to) => renameBroken ? Promise.reject(Object.assign(new Error('EACCES'), { code: 'EACCES' })) : realRename(from, to),
  }
  const stop = apply({ ...rt.ctx } as never, config)
  const service = (): { emit: (event: Record<string, unknown>, where: Record<string, unknown>) => void } | undefined =>
    rt.ctx.get('glmHournessMetrics') as { emit: (event: Record<string, unknown>, where: Record<string, unknown>) => void } | undefined
  return {
    root,
    rt,
    health: () => rt.ctx.get(healthServiceName('metrics')) as RowHealthView | undefined,
    emit: (at: number) => service()?.emit({ k: 'count', by: 'guard', at: new Date(at).toISOString(), body: { what: 'w', value: 1 } }, { sessionId: rt.agent.id, dir: root }),
    flush: () => {
      while (bodies.length > 0) bodies.shift()!()
    },
    setClock: (next: number) => { ms = next },
    failCompute: (fail: boolean) => { computeBroken = fail },
    failRename: (fail: boolean) => { renameBroken = fail },
    dispose: () => {
      stop()
      rmSync(join(root, '..'), { recursive: true, force: true })
    },
  }
}

async function untilView(root: string, want: (view: MetricsBoardView) => boolean): Promise<MetricsBoardView> {
  const file = join(root, '.llm', 'metrics', 'view.json')
  let lastText = '<no file>'
  for (let waited = 0; waited < 5000; waited += 25) {
    try {
      lastText = await readFile(file, 'utf8')
      const view = parseMetricsBoardView(JSON.parse(lastText))
      if (want(view)) return view
    }
    catch {
      // Not written yet, or half a write: keep waiting.
    }
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  const dir = existsSync(join(root, '.llm', 'metrics')) ? readdirSync(join(root, '.llm', 'metrics')).join('、') : 'dir gone'
  throw new Error(`the board view never settled (dir: ${dir}; head: ${lastText.slice(0, 300)})`)
}

async function untilEvents(root: string, n: number): Promise<void> {
  for (let waited = 0; waited < 3000; waited += 20) {
    if ((await readLog(root)).events.length >= n) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

test('a failed compute keeps the last content and updates tried and problem; a failed write leaves the file and names the code; the streams pass through (acceptance 25 d)', async () => {
  const fx = boardFixture()
  try {
    await fx.rt.create()
    fx.emit(AT)
    await untilEvents(fx.root, 2)
    fx.flush()
    const good = await untilView(fx.root, view => view.problem === null && view.groups.length === 9)
    assert.equal(good.at, new Date(AT).toISOString())

    // Each later refresh needs the hourly throttle passed (the design computes at most hourly): the clock jumps an hour, which stays inside the same local day for the next two phases.
    fx.setClock(AT + 3_600_000)
    fx.failCompute(true)
    fx.emit(AT + 3_600_000)
    await untilEvents(fx.root, 3)
    fx.flush()
    const broken = await untilView(fx.root, view => view.problem !== null)
    assert.equal(broken.problem, '盘没了')
    assert.equal(broken.at, good.at, 'the last successful compute time stays')
    assert.equal(broken.tried, new Date(AT + 3_600_000).toISOString())
    assert.deepEqual(broken.groups, good.groups, 'the last good content is kept')
    assert.equal(broken.basis, good.basis)
    assert.deepEqual(broken.windows, good.windows)
    assert.match(fx.health()?.activation().reason ?? '', /指标板没能更新：盘没了/)
    assert.equal(fx.health()?.activation().state, 'degraded')

    fx.setClock(AT + 7_200_000)
    fx.failCompute(false)
    fx.emit(AT + 7_200_000)
    await untilEvents(fx.root, 4)
    fx.flush()
    const healed = await untilView(fx.root, view => view.problem === null && view.at !== good.at)
    assert.equal(healed.tried, new Date(AT + 7_200_000).toISOString())

    const viewPath = join(fx.root, '.llm', 'metrics', 'view.json')
    const before = await readFile(viewPath, 'utf8')
    fx.setClock(AT + 10_800_000)
    fx.failRename(true)
    fx.emit(AT + 10_800_000)
    await untilEvents(fx.root, 5)
    fx.flush()
    await new Promise(resolve => setTimeout(resolve, 300))
    assert.equal(await readFile(viewPath, 'utf8'), before, 'a failed rename leaves the file unchanged')
    const dir = readdirSync(join(fx.root, '.llm', 'metrics'))
    assert.ok(dir.every(name => !name.endsWith('.tmp')), 'the temporary file does not stay')
    assert.match(fx.health()?.activation().reason ?? '', /指标板写不进：EACCES/)

    const scripted: StreamChunk[] = [
      { type: 'text-delta', index: 0, text: '先读文件' },
      { type: 'usage', usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, cacheReadTokens: 50 } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ]
    const seen: StreamChunk[] = []
    for await (const chunk of fx.rt.stream({ provider: 'glm-probe', model: 'glm-5.3', sessionId: fx.rt.agent.id, messages: [] }, () => ({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve()
        yield* scripted
      },
    }))) seen.push(chunk)
    assert.deepEqual(seen, scripted, 'the model stream passes through byte for byte while the board fails')
  }
  finally {
    fx.dispose()
  }
})

/** The fake client host of acceptance 25 (e): one view file, one session's projection values. */
function fakeClient(fileText: string | undefined, values: ProjectionValues | undefined): { readonly remote: RemoteRoot, readonly sessions: SessionsClient } {
  const encoded = fileText === undefined ? undefined : new TextEncoder().encode(fileText)
  const remote = {
    workspaceFiles: {
      readBytes: (_sessionId: string, path: string) => encoded === undefined
        ? Promise.resolve({ ok: false as const, error: { code: 'workspace-file/not-found', message: 'not found' } })
        : Promise.resolve({ ok: true as const, value: { absolutePath: path, version: 'v1', bytes: encoded.length, offset: 0, data: encoded, eof: true } }),
      stat: (_sessionId: string, path: string) => encoded === undefined
        ? Promise.resolve({ ok: false as const, error: { code: 'workspace-file/not-found', message: 'not found' } })
        : Promise.resolve({ ok: true as const, value: { absolutePath: path, version: 'v1', bytes: encoded.length } }),
      list: (): Promise<never> => Promise.reject(new Error('unused')),
      changes: (): unknown => { throw new Error('unused') },
    },
    commands: {
      execute: (): Promise<never> => Promise.reject(new Error('unused')),
      list: () => Promise.resolve({ ok: true as const, value: [] as const }),
    },
    $stream: () => ({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve()
        const done: WatchFrame[] = []
        yield* done
      },
      dispose: () => Promise.resolve(),
    }),
  }
  const listeners = new Set<() => void>()
  const sessions: SessionsClient = {
    list: {
      getSnapshot: () => ({
        projectionsBySession: { s1: values === undefined ? undefined : { values } },
        byId: {},
      }),
      subscribe: listener => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    refreshProjections: async () => {},
  }
  return { remote: remote as RemoteRoot, sessions }
}

const viewJson = (overrides: Partial<MetricsBoardView> = {}): string => JSON.stringify({
  version: 1,
  at: new Date(NOW - 60_000).toISOString(),
  tried: new Date(NOW - 60_000).toISOString(),
  problem: null,
  basis: '依据：events-2026-11-04.jsonl 1–3 行；窗口 2026-10-28T16:00:00.000Z–2026-11-04T16:00:00.000Z（+08:00）；无法读取 0；计算版本 1',
  windows: ['最近 7 天', '前 7 天'],
  groups: [{
    id: 'load',
    title: '你的负担（周报里主 Agent 也会说这几个数）',
    relayed: true,
    note: '第四个数「因你的决定返工几次」在周报里，由项目图算',
    rows: [{ label: '问你几次', values: ['2 次', '—'], samples: [2, 0] }],
  }],
  ...overrides,
})

async function untilBoard(board: { readonly snapshot: (sessionId: string) => BoardState }, want: (state: BoardState) => boolean): Promise<BoardState> {
  for (let waited = 0; waited < 3000; waited += 20) {
    const state = board.snapshot('s1')
    if (want(state)) return state
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  return board.snapshot('s1')
}

const page = (): null => null

test('the client board: available follows the projection, the home line takes the first sentence that applies, the guide line is fixed (acceptance 25 e)', async () => {
  const viewFile = 'C:/ws/.llm/metrics/view.json'

  const off = metricsBoard(page, { ...fakeClient(undefined, undefined), now: () => NOW })
  const offUnsub = off.board.subscribe('s1', () => {})
  assert.equal(off.board.snapshot('s1').available, false, 'no projection value, no board')
  offUnsub()
  off.dispose()

  const missing = metricsBoard(page, { ...fakeClient(undefined, { hournessMetrics: { viewFile } }), now: () => NOW })
  const missingUnsub = missing.board.subscribe('s1', () => {})
  const missingState = await untilBoard(missing.board, state => state.available)
  assert.equal(missingState.available, true, 'a projection that names a file makes the board available')
  assert.equal(missingState.homeLine, null, 'a file that is not there yet gives no home line')
  assert.equal(missingState.guideLine, GUIDE_LINE)
  assert.equal(missingState.peakApplies, false)
  missingUnsub()
  missing.dispose()

  const healthy = metricsBoard(page, { ...fakeClient(viewJson(), { hournessMetrics: { viewFile } }), now: () => NOW })
  const healthyUnsub = healthy.board.subscribe('s1', () => {})
  assert.equal((await untilBoard(healthy.board, state => state.available)).homeLine, null, 'a fresh healthy view gives no line')
  healthyUnsub()
  healthy.dispose()

  const broken = metricsBoard(page, { ...fakeClient('{not json', { hournessMetrics: { viewFile } }), now: () => NOW })
  const brokenUnsub = broken.board.subscribe('s1', () => {})
  const brokenState = await untilBoard(broken.board, state => state.homeLine !== null)
  assert.match(brokenState.homeLine ?? '', /^指标板读不出：/)
  assert.ok([...(brokenState.homeLine ?? '')].length <= 60)
  brokenUnsub()
  broken.dispose()

  const wrongShape = metricsBoard(page, { ...fakeClient(viewJson({ version: 2 as unknown as 1 }), { hournessMetrics: { viewFile } }), now: () => NOW })
  const wrongUnsub = wrongShape.board.subscribe('s1', () => {})
  assert.equal((await untilBoard(wrongShape.board, state => state.homeLine !== null)).homeLine, '指标板读不出：version must be 1')
  wrongUnsub()
  wrongShape.dispose()

  const failed = metricsBoard(page, { ...fakeClient(viewJson({ problem: '盘没了' }), { hournessMetrics: { viewFile } }), now: () => NOW })
  const failedUnsub = failed.board.subscribe('s1', () => {})
  assert.equal((await untilBoard(failed.board, state => state.homeLine !== null)).homeLine, '指标板没能更新：盘没了')
  failedUnsub()
  failed.dispose()

  const staleAt = new Date(NOW - 25 * 60 * 60_000).toISOString()
  const stale = metricsBoard(page, { ...fakeClient(viewJson({ at: staleAt, tried: staleAt }), { hournessMetrics: { viewFile } }), now: () => NOW })
  const staleUnsub = stale.board.subscribe('s1', () => {})
  const staleState = await untilBoard(stale.board, state => state.homeLine !== null)
  assert.equal(staleState.homeLine, `指标板的数停在 ${stampOf(staleAt)}，之后没算成`)
  assert.ok([...(staleState.homeLine ?? '')].length <= 60)
  staleUnsub()
  stale.dispose()

  const noProject = metricsBoard(page, { ...fakeClient(undefined, { hournessMetrics: { viewFile: null, reason: 'no-project' } }), now: () => NOW })
  const noProjectUnsub = noProject.board.subscribe('s1', () => {})
  assert.equal(noProject.board.snapshot('s1').available, false, 'no view file, no board')
  noProjectUnsub()
  noProject.dispose()
})

test('the board page is read-only and speaks plain words: no commands.execute, the fixed sentences carry no avoid-list word (acceptance 25 e)', () => {
  const sourceOf = (name: string): string => readFileSync(join(import.meta.dirname, '..', 'ui', 'src', 'metrics', name), 'utf8')
  const pageSource = sourceOf('board.tsx')
  const boardSource = sourceOf('board.ts')
  for (const text of [pageSource, boardSource]) {
    assert.ok(!text.includes('commands.execute'), 'the page never executes commands')
    assert.ok(!text.includes('流水'), 'no 换词表 word either')
  }
  for (const sentence of ['系统记下的数，只给你看，主 Agent 不转述', '还没有算过：项目编排启用后几分钟内算第一次', '讲细点', '也可以在插件仓库的命令行打 npm run metrics -- summary --project']) {
    assert.ok(pageSource.includes(sentence), sentence)
  }
  assert.ok(pageSource.includes('<h2>指标</h2>'), 'the head names the board')
  const fixed = [
    ...boardNames(),
    GUIDE_LINE,
    '系统记下的数，只给你看，主 Agent 不转述',
    '还没有算过：项目编排启用后几分钟内算第一次',
    '讲细点',
    '也可以在插件仓库的命令行打 npm run metrics -- summary --project <这个项目的目录>',
  ]
  for (const name of fixed) {
    assert.deepEqual(plainWordsIn(name), [], name)
    assert.ok(!name.includes('流水'), name)
  }
  assert.equal([...GUIDE_LINE].length, 38, 'the guide line is the design sentence')
})

test('homeLineOf composes the three sentences in order, cut at 60 code points (acceptance 25 e)', () => {
  assert.equal(homeLineOf({ problem: 'x'.repeat(200), view: null }, NOW), `指标板读不出：${'x'.repeat(52)}…`)
  assert.equal(homeLineOf({ problem: null, view: null }, NOW), null, 'no file, no line')
  const view = (overrides: Partial<MetricsBoardView>): MetricsBoardView => JSON.parse(viewJson(overrides)) as MetricsBoardView
  assert.equal(homeLineOf({ problem: null, view: view({ problem: '盘没了' }) }, NOW), '指标板没能更新：盘没了')
  const staleAt = new Date(NOW - 25 * 60 * 60_000).toISOString()
  assert.equal(homeLineOf({ problem: null, view: view({ at: staleAt, tried: staleAt }) }, NOW), `指标板的数停在 ${stampOf(staleAt)}，之后没算成`)
  assert.equal(homeLineOf({ problem: null, view: view({}) }, NOW), null, 'a fresh healthy view gives no line')
})

test('the view lands beside the journal and the user-level directory stays clean (§3.5)', async () => {
  const root = scratchGitProject('metrics-board-scope-')
  mkdirSync(join(root, '.llm', 'metrics'), { recursive: true })
  const userHome = join(root, '..', 'dsh-home')
  writeFileSync(join(root, 'README.md'), 'fixture\n')
  const rt = fakeRuntime({ route: { provider: 'glm-probe', model: 'glm-5.3' }, cwd: root })
  rt.services.set('agents', { get: (id: string) => id === rt.agent.id ? { id: rt.agent.id, session: rt.agent.session } : undefined })
  const bodies: Array<() => void> = []
  try {
    const stop = apply({ ...rt.ctx } as never, {
      randomId: () => '0123abcd',
      now: () => AT,
      timer: body => {
        bodies.push(body)
        return () => {}
      },
    })
    await rt.create()
    const service = rt.ctx.get('glmHournessMetrics') as { emit: (event: Record<string, unknown>, where: Record<string, unknown>) => void } | undefined
    service?.emit({ k: 'count', by: 'guard', at: new Date(AT).toISOString(), body: { what: 'w', value: 1 } }, { sessionId: rt.agent.id, dir: root })
    for (let waited = 0; waited < 3000 && !existsSync(join(root, '.llm', 'metrics-key')); waited += 20) await new Promise(resolve => setTimeout(resolve, 20))
    while (bodies.length > 0) bodies.shift()!()
    await untilView(root, view => view.problem === null)
    assert.ok(existsSync(join(root, '.llm', 'metrics', 'view.json')))
    assert.equal(existsSync(userHome), false, 'no metrics file lands in the user-level directory')
    stop()
  }
  finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})
