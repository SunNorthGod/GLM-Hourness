/**
 * The metrics row on the fake rc.3 host (metrics design §6.1, §6.4, §9): the
 * service with its `where` resolution, the `llm`, `tool`, `turn`, `approval`,
 * `command`, `said`, `session`, `ask` and `answer` events of the row's own
 * seams, the row health with its per-session report, the background
 * self-check and the loop board's daily entry, and what the row says when
 * the host lacks a part. Observation must leave the host's behavior byte
 * for byte the same (§9.5), peak mode must not touch the row (§9.5's
 * d-main-agent-peak-exempt), and no metrics file may land in the user-level
 * directory (§3.5's d-memory-scope).
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply, METRICS_SELF_CHECK_ENTRY, name, type MetricsConfig } from '../src/metrics/index.ts'
import { readLog } from '../src/metrics/read.ts'
import { METRICS_SERVICE, type MetricsService } from '../src/shared/metrics.ts'
import { healthServiceName, type RowHealthView } from '../src/shared/health.ts'
import { LOOPS_DECLARATION } from '../src/loops/service.ts'
import type { Contribution, LoopEventRecord } from '../src/loops/service.ts'
import type { SessionEventLike, SessionLike, UserQuestionsRequest } from '../src/shared/dsh-min.ts'
import type { StreamChunk } from '../src/shared/lm-min.ts'
import { textUnits } from '../src/shared/text-units.ts'
import { fakeInjector, fakeRuntime, type FakeRuntime } from './fake-rc3.ts'

const AT = 1_700_000_000_000
const DAY_AT = new Date(AT).toISOString()

interface Fixture {
  readonly rt: FakeRuntime
  /** The scratch git project the sessions work in. */
  readonly root: string
  /** The user-level directory no metrics file may ever land in. */
  readonly userHome: string
  /** Withdraw the row: its health view, its seams and its writer. */
  readonly dispose: () => void
  readonly health: () => RowHealthView | undefined
  readonly service: () => MetricsService | undefined
  readonly events: () => Promise<Array<Record<string, unknown>>>
}

let counter = 0

/** A scratch git project and a user-level directory, with the row applied to a fake runtime whose agent works in the project. */
function fixture(config: MetricsConfig = {}, options: { readonly agents?: boolean } = {}): Fixture {
  const base = mkdtempSync(join(tmpdir(), `metrics-row-${++counter}-`))
  const root = join(base, 'ws')
  const userHome = join(base, 'dsh-home')
  mkdirSync(root, { recursive: true })
  assert.equal(spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: root }).status, 0)
  const rt = fakeRuntime({ route: { provider: 'glm-probe', model: 'glm-5.3' }, cwd: root })
  if (options.agents !== false) {
    rt.services.set('agents', { get: (id: string) => id === rt.agent.id ? { id: rt.agent.id, session: rt.agent.session } : undefined })
  }
  const now = config.now ?? ((): number => AT)
  const stop = apply({ ...rt.ctx } as never, {
    randomId: () => '0123abcd',
    now,
    ...config,
  })
  return {
    rt,
    root,
    userHome,
    dispose: stop,
    health: () => rt.ctx.get(healthServiceName('metrics')) as RowHealthView | undefined,
    service: () => rt.ctx.get(METRICS_SERVICE) as MetricsService | undefined,
    events: async () => (await readLog(root)).events as unknown as Array<Record<string, unknown>>,
  }
}

const rm = (fixture: Fixture): void => {
  fixture.dispose()
  rmSync(join(fixture.root, '..'), { recursive: true, force: true })
}

/** Wait until the journal holds at least `n` events (the writer pumps on a microtask and the file lands on the disk a tick later). */
async function untilEvents(fixture: Fixture, n: number): Promise<Array<Record<string, unknown>>> {
  for (let waited = 0; waited < 3000; waited += 20) {
    const events = await fixture.events()
    if (events.length >= n) return events
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  return fixture.events()
}

/** The session exists, then one count event into the project, settled on the disk. */
async function emitCount(fx: Fixture): Promise<Array<Record<string, unknown>>> {
  await fx.rt.create()
  fx.service()?.emit({ k: 'count', by: 'guard', at: DAY_AT, body: { what: 'w', value: 1 } }, { sessionId: fx.rt.agent.id, dir: fx.root })
  return untilEvents(fx, 2)
}

/** The stream a scripted step sends: one text block, one tool call, a usage block and a finish. */
function chunksOf(): StreamChunk[] {
  return [
    { type: 'text-delta', index: 0, text: '先读文件' },
    { type: 'block-end', index: 0, block: { type: 'text', text: '先读文件' } },
    { type: 'block-end', index: 1, block: { type: 'tool-call', id: 'call-1', name: 'Read', arguments: '{}' } },
    { type: 'usage', usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, cacheReadTokens: 50 } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}

/** The inner stream a scripted step sends: the chunks in order, then the failure when one is given. */
function streamOf(chunks: readonly StreamChunk[], fail?: Error): AsyncIterable<StreamChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      await Promise.resolve()
      yield* chunks
      if (fail !== undefined) throw fail
    },
  }
}

async function streamAll(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = []
  for await (const chunk of stream) out.push(chunk)
  return out
}

/** A session log event as rc.3 appends it: `{type, seq, time, data}` with the time at the fold's instant. */
const fire = (type: string, data: unknown): SessionEventLike => ({ type, seq: 1, time: AT + 5, data })

/** Wait until the project's path-hash key has been created and loaded, so tool targets hash deterministically. */
async function keyReady(fx: Fixture): Promise<void> {
  const file = join(fx.root, '.llm', 'metrics-key')
  for (let waited = 0; waited < 3000 && !existsSync(file); waited += 20) await new Promise(resolve => setTimeout(resolve, 20))
  await new Promise(resolve => setTimeout(resolve, 60))
}

test('the row provides the service and its health view; the identity is the row convention', () => {
  const fx = fixture()
  try {
    assert.equal(name, 'dsh-glm-hourness/metrics')
    assert.equal(typeof fx.service()?.emit, 'function')
    assert.equal(fx.health()?.row, 'metrics')
  }
  finally {
    rm(fx)
  }
})

test('observation leaves the host behavior byte for byte the same: the stream chunks, a thrown end, and a question answer pass through unchanged', async () => {
  const fx = fixture()
  try {
    const scripted = chunksOf()
    const seen = await streamAll(fx.rt.stream({ provider: 'glm-probe', model: 'glm-5.3', messages: [] }, () => streamOf(scripted)))
    assert.deepEqual(seen, scripted)
    const request: UserQuestionsRequest = { questions: [{ id: 'q-1', question: '选哪个？', options: [{ label: '甲' }, { label: '乙' }] }] }
    await assert.rejects(fx.rt.ask(request), (error: { readonly code?: unknown }) => error.code === 'NO_PROVIDER', 'no answerer means no-provider, unchanged for the caller')
    fx.rt.ctx.on('user-questions/request', () => Promise.resolve({ answers: [{ id: 'q-1', selected: ['乙'] }] }))
    assert.deepEqual(await fx.rt.ask(request), { answers: [{ id: 'q-1', selected: ['乙'] }] })
    await assert.rejects(streamAll(fx.rt.stream({ provider: 'glm-probe', model: 'glm-5.3', messages: [] }, () => streamOf([{ type: 'text-delta', index: 0, text: 'x' }], new Error('adapter gone')))), /adapter gone/, 'a failing stream reaches the caller unchanged')
  }
  finally {
    rm(fx)
  }
})

test('one model call leaves one llm event with the usage, the finish, the step and the retry count; a purpose call names no step', async () => {
  const fx = fixture({ checkDelay: 60_000 })
  try {
    await fx.rt.create()
    await fx.rt.request(2, 3)
    await streamAll(fx.rt.stream({ provider: 'glm-probe', model: 'glm-5.3', sessionId: fx.rt.agent.id, messages: [] }, () => streamOf(chunksOf())))
    await fx.rt.requestError(2, 3)
    await streamAll(fx.rt.stream({ provider: 'glm-probe', model: 'glm-5.3', sessionId: fx.rt.agent.id, messages: [] }, () => streamOf([{ type: 'usage', usage: { inputTokens: 1, outputTokens: 1, cacheWriteTokens: -5, reasoningTokens: Number.POSITIVE_INFINITY } }, { type: 'finish', reason: { kind: 'stop' } }])))
    await streamAll(fx.rt.stream({ provider: 'glm-probe', model: 'glm-5.3', sessionId: fx.rt.agent.id, purpose: 'compaction', messages: [] }, () => streamOf([{ type: 'finish', reason: { kind: 'stop' } }])))
    await streamAll(fx.rt.stream({ provider: 'glm-probe', model: 'glm-5.3', sessionId: fx.rt.agent.id, messages: [] }, () => streamOf([], new Error('gone mid-stream')))).catch(() => undefined)
    const events = await untilEvents(fx, 5)
    const llm = events.filter(event => event.k === 'llm') as Array<{ readonly sid?: string, readonly body: Record<string, unknown> }>
    assert.equal(llm.length, 4, 'four model calls, four llm events, the failing one included')
    assert.equal(llm[0].sid, fx.rt.agent.id, 'the sink stamps the envelope sid from the where of the stream')
    assert.deepEqual([llm[0].body.turn, llm[0].body.step], [2, 3])
    assert.deepEqual([llm[0].body.provider, llm[0].body.model], ['glm-probe', 'glm-5.3'])
    assert.deepEqual([llm[0].body.input, llm[0].body.output, llm[0].body.total, llm[0].body.cacheRead], [100, 20, 120, 50])
    assert.deepEqual([llm[0].body.fin, llm[0].body.calls, llm[0].body.text], ['tool-calls', 1, textUnits('先读文件')])
    assert.ok((llm[0].body.ms as number) >= 0)
    assert.equal(llm[1].body.retries, 1, 'the counted request-error lands in the next llm of the session')
    assert.deepEqual([llm[1].body.fin, llm[1].body.turn, llm[1].body.step], ['stop', 2, 3])
    assert.equal(llm[1].body.cacheWrite, undefined, 'a usage count that is not a non-negative finite number is not written')
    assert.equal(llm[1].body.reasoning, undefined)
    assert.deepEqual([llm[2].body.purpose, llm[2].body.turn, llm[2].body.step], ['compaction', undefined, undefined], 'a purpose call belongs to no step')
    assert.equal(llm[3].body.fin, 'error', 'a stream that fails ends with fin error')
    assert.equal(llm[3].body.usage ?? llm[3].body.input, undefined, 'no usage block means no token fields')
    const session = fx.health()?.session(fx.rt.agent.id)
    assert.match(session?.reason ?? '', /指标记入 .+\.llm.metrics，今天 \d+ 条/)
  }
  finally {
    rm(fx)
  }
})

test('session events fold into tool with its outcome, target hash and command word; a call without a result goes out at the turn edge', async () => {
  const fx = fixture({ checkDelay: 60_000 })
  try {
    const session = fx.rt.agent.session as SessionLike
    await fx.rt.create()
    await keyReady(fx)
    fx.rt.event(session, fire('turn/start', { turn: 1 }))
    fx.rt.event(session, fire('tool/call', { turn: 1, step: 1, callId: 'c1', name: 'Read', arguments: JSON.stringify({ file_path: join(fx.root, 'docs', 'a.md') }) }))
    fx.rt.event(session, fire('tool/result', { turn: 1, step: 1, message: { toolCallId: 'c1', content: [{ type: 'text', text: '正文' }], isError: false } }))
    fx.rt.event(session, fire('tool/call', { turn: 1, step: 2, callId: 'c2', name: 'Bash', arguments: JSON.stringify({ command: 'git status --short' }) }))
    fx.rt.event(session, fire('tool/result', { turn: 1, step: 2, error: { rule: 'main-agent-no-write' }, message: { toolCallId: 'c2', content: [{ type: 'text', text: 'Error: denied' }], isError: true } }))
    fx.rt.event(session, fire('approval/asked', { id: 'ap-1', toolName: 'write', callId: 'c3' }))
    fx.rt.event(session, fire('approval/decided', { id: 'ap-1', outcome: 'rejected' }))
    fx.rt.event(session, fire('tool/call', { turn: 1, step: 3, callId: 'c3', name: 'Write', arguments: JSON.stringify({ file_path: join(fx.root, 'out.txt') }) }))
    fx.rt.event(session, fire('tool/result', { turn: 1, step: 3, message: { toolCallId: 'c3', content: [], isError: true } }))
    fx.rt.event(session, fire('tool/call', { turn: 1, step: 4, callId: 'c4', name: 'Glob', arguments: '{broken' }))
    fx.rt.event(session, fire('turn/end', { turn: 1, reason: { kind: 'completed' } }))
    const events = await untilEvents(fx, 9)
    const tools = events.filter(event => event.k === 'tool') as Array<{ readonly at: string, readonly body: Record<string, unknown> }>
    assert.equal(tools.length, 4)
    assert.deepEqual([tools[0].body.turn, tools[0].body.step, tools[0].body.name, tools[0].body.cat, tools[0].body.out], [1, 1, 'Read', 'read', 'ok'])
    assert.match(tools[0].body.target as string, /^[0-9a-f]{12}$/, 'the file target is hashed under the project key')
    assert.equal(tools[0].body.chars, '正文'.length)
    assert.match(String(tools[0].at), /T/)
    assert.deepEqual([tools[1].body.name, tools[1].body.cat, tools[1].body.out, tools[1].body.cmd], ['Bash', 'shell', 'denied', 'git'])
    assert.equal(tools[1].body.target, undefined, 'a shell call has no target')
    assert.deepEqual([tools[2].body.out, tools[2].body.cat], ['declined', 'write'], 'a rejected approval decides the same call')
    assert.match(tools[2].body.target as string, /^[0-9a-f]{12}$/)
    assert.deepEqual([tools[3].body.name, tools[3].body.out], ['Glob', 'none'], 'a call still open at turn end is none')
    assert.equal(tools[3].body.target, undefined, 'arguments that do not parse leave no target behind')
    const turns = events.filter(event => event.k === 'turn') as Array<{ readonly body: Record<string, unknown> }>
    assert.deepEqual(turns.map(turn => [turn.body.turn, turn.body.phase, turn.body.end]), [[1, 'start', undefined], [1, 'end', 'completed']])
    const approvals = events.filter(event => event.k === 'approval') as Array<{ readonly body: Record<string, unknown> }>
    assert.deepEqual(approvals.map(entry => [entry.body.phase, entry.body.tool, entry.body.call, entry.body.outcome]), [['asked', 'write', 'c3', undefined], ['decided', undefined, 'c3', 'rejected']])
  }
  finally {
    rm(fx)
  }
})

test('the human said it: a user message counts once, with its units and attachments; a subagent session and other sources do not', async () => {
  const fx = fixture({ checkDelay: 60_000 })
  try {
    const session = fx.rt.agent.session as SessionLike
    const child = { ...fx.rt.agent, id: 'child-1', session: { ...session, id: 'child-1', header: { id: 'child-1', cwd: session.header.cwd, origin: 'subagent' as const } } }
    await fx.rt.create()
    fx.rt.event(session, fire('user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: '帮我看下预算' }, { type: 'image' }] }))
    fx.rt.event(session, fire('user/message', { source: { kind: 'runtime-context' }, content: [{ type: 'text', text: '注入' }] }))
    fx.rt.event(child.session as SessionLike, fire('user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: '子会话首条' }] }))
    const events = await untilEvents(fx, 2)
    const said = events.filter(event => event.k === 'said') as Array<{ readonly body: Record<string, unknown> }>
    assert.equal(said.length, 1)
    assert.deepEqual([said[0].body.units, said[0].body.attachments, said[0].body.source], [textUnits('帮我看下预算'), 1, 'user'])
  }
  finally {
    rm(fx)
  }
})

test('a slash command is counted as it starts and as it settles', async () => {
  const fx = fixture({ checkDelay: 60_000 })
  try {
    const session = fx.rt.agent.session as SessionLike
    fx.rt.event(session, fire('command/run', { commandId: 'cmd-1', name: 'rules', source: { kind: 'user' } }))
    fx.rt.event(session, fire('command/done', { commandId: 'cmd-1', kind: 'success', text: '已记录' }))
    fx.rt.event(session, fire('command/done', { commandId: 'cmd-2', kind: 'error' }))
    const events = await untilEvents(fx, 2)
    const commands = events.filter(event => event.k === 'command') as Array<{ readonly body: Record<string, unknown> }>
    assert.deepEqual(commands.map(command => [command.body.cid, command.body.name, command.body.phase, command.body.result]), [
      ['cmd-1', 'rules', 'run', undefined],
      ['cmd-1', 'rules', 'done', 'success'],
    ], 'a done without a run has no name and is not an event')
    assert.equal(commands.length, 2)
  }
  finally {
    rm(fx)
  }
})

test('a DSH native question is counted as ask and answer with the same q; the no-answerer rejection is no-provider', async () => {
  const fx = fixture({ checkDelay: 60_000 })
  try {
    await fx.rt.create()
    const request: UserQuestionsRequest = { questions: [{ id: 'q-1', question: '选哪个？', options: [{ label: 'A' }, { label: 'B' }] }], agent: fx.rt.agent }
    await assert.rejects(fx.rt.ask(request), (error: { readonly code?: unknown }) => error.code === 'NO_PROVIDER')
    const events = await untilEvents(fx, 3)
    const asks = events.filter(event => event.k === 'ask') as Array<{ readonly body: Record<string, unknown> }>
    const answers = events.filter(event => event.k === 'answer') as Array<{ readonly body: Record<string, unknown> }>
    assert.deepEqual(asks[0].body, { q: 'q-1', qs: 1, opts: 2, units: textUnits('选哪个？') + textUnits('A') + textUnits('B') })
    assert.equal(answers[0].body.q, 'q-1')
    assert.equal(answers[0].body.end, 'no-provider')
    assert.equal(answers[0].body.pick, undefined)
    assert.ok((answers[0].body.ms as number) >= 0)
    // An answered request carries the picked label; an id that is not id-shaped falls back to x-hash.
    fx.rt.ctx.on('user-questions/request', () => Promise.resolve({ answers: [{ id: 'q 2', selected: ['B'] }] }))
    await fx.rt.ask({ questions: [{ id: 'q 2', question: '选哪个？' }], agent: fx.rt.agent })
    await fx.rt.ask({ questions: [{ id: 'q-3', question: '选哪个？' }], agent: fx.rt.agent })
    const later = await untilEvents(fx, 7)
    const answers2 = later.filter(event => event.k === 'answer') as Array<{ readonly body: Record<string, unknown> }>
    assert.equal(answers2[1].body.end, 'answered')
    assert.equal(answers2[1].body.pick, 'B')
    const asks2 = later.filter(event => event.k === 'ask') as Array<{ readonly body: Record<string, unknown> }>
    assert.match(asks2[1].body.q as string, /^x-[0-9a-f]{12}$/, 'an id that is not id-shaped falls back to x-hash')
    assert.equal(asks2[2].body.q, 'q-3')
  }
  finally {
    rm(fx)
  }
})

test('the service resolves the project from dir first, then from the session; what has no project is only counted', async () => {
  const fx = fixture({ checkDelay: 60_000 })
  try {
    const service = fx.service()
    assert.ok(service !== undefined)
    service.emit({ k: 'count', by: 'guard', at: DAY_AT, body: { what: 'by-dir', value: 1 } }, { dir: join(fx.root, 'docs') })
    service.emit({ k: 'count', by: 'guard', at: DAY_AT, body: { what: 'by-session', value: 2 } }, { sessionId: fx.rt.agent.id })
    service.emit({ k: 'count', by: 'guard', at: DAY_AT, body: { what: 'nowhere', value: 3 } }, { sessionId: 'no-such-session' })
    const events = await untilEvents(fx, 2)
    const counts = events.filter(event => event.k === 'count') as Array<{ readonly sid?: string, readonly body: Record<string, unknown> }>
    assert.deepEqual(counts.map(count => count.body.what).sort(), ['by-dir', 'by-session'])
    assert.equal(counts.find(count => count.body.what === 'by-session')?.sid, fx.rt.agent.id, 'the sink stamps the envelope sid from the where of the service call')
    assert.equal(counts.find(count => count.body.what === 'by-dir')?.sid, undefined, 'a where without a session writes no sid')
    const activation = fx.health()?.activation()
    assert.match(activation?.reason ?? '', /无项目的事件 1 条（count）/)
    assert.equal(activation?.state, 'degraded')
    const report = fx.health()?.session('no-such-session')
    assert.match(report?.reason ?? '', /无项目的事件/)
  }
  finally {
    rm(fx)
  }
})

test('an event that breaks its field table is rejected: a reject line lands, the health counts it, and the kind stays out', async () => {
  const fx = fixture({ checkDelay: 60_000 })
  try {
    fx.service()?.emit({ k: 'count', by: 'guard', at: DAY_AT, body: { what: '有空白', value: 1 } }, { dir: fx.root })
    const events = await untilEvents(fx, 1)
    const rejects = events.filter(event => event.k === 'reject') as Array<{ readonly body: Record<string, unknown> }>
    assert.equal(rejects.length, 1)
    assert.deepEqual([rejects[0].body.of, rejects[0].body.field], ['count', 'what'])
    assert.equal(events.some(event => event.k === 'count'), false)
    assert.match(fx.health()?.activation().reason ?? '', /拒收 1 条/)
  }
  finally {
    rm(fx)
  }
})

test('the project keeps metrics/, the manifest and the key; the user-level directory gains no metrics file at all (acceptance 18)', async () => {
  const fx = fixture({ checkDelay: 60_000 })
  try {
    await emitCount(fx)
    for (let waited = 0; waited < 3000 && !existsSync(join(fx.root, '.llm', 'metrics-key')); waited += 20) await new Promise(resolve => setTimeout(resolve, 20))
    const llmDir = join(fx.root, '.llm')
    const metricsNames = readdirSync(llmDir).filter(entry => entry.startsWith('metrics')).sort()
    assert.deepEqual(metricsNames, ['metrics', 'metrics-key', 'metrics-manifest.jsonl'])
    assert.deepEqual(readdirSync(join(llmDir, 'metrics')).filter(entry => entry.startsWith('metrics')), [], 'the metrics directory itself holds day files only')
    assert.equal(existsSync(fx.userHome), false, 'the row never creates the user-level directory')
    if (existsSync(fx.userHome)) assert.deepEqual(readdirSync(fx.userHome).filter(entry => entry.startsWith('metrics')), [])
  }
  finally {
    rm(fx)
  }
})

test('peak mode does not touch the row: a stop-level service is never read, and the events keep flowing (acceptance 19)', async () => {
  const fx = fixture({ checkDelay: 60_000 })
  try {
    const reads: number[] = []
    fx.rt.services.set('glmHournessPeakMode', {
      stateForProject: () => { reads.push(1); return { level: 'stop', origin: 'human', peak: true } },
    })
    await emitCount(fx)
    assert.deepEqual(reads, [], 'the metrics row reads no peak mode')
    const activation = fx.health()?.activation()
    assert.ok(!(activation?.reason ?? '').includes('高峰'), activation?.reason)
  }
  finally {
    rm(fx)
  }
})

/** The loop board as a fake: it records the contribution and answers its own run calls from the harness action. */
function fakeLoops(): { readonly service: unknown, readonly contributions: Contribution[], readonly run: (action: string, event: LoopEventRecord) => Promise<unknown> } {
  const contributions: Contribution[] = []
  let runner: NonNullable<Contribution['run']> | undefined
  const service = {
    declaration: LOOPS_DECLARATION,
    contribute: (_source: unknown, contribution: Contribution) => {
      contributions.push(contribution)
      runner = contribution.run?.bind(contribution)
      return { ok: true as const, dispose: () => {}, accepted: ['metrics.selfcheck'], dropped: [] }
    },
    emit: () => Promise.resolve({ ok: true as const, id: 'ev-1', duplicate: false }),
    listens: () => true,
    recordRun: () => {},
  }
  return {
    service,
    contributions,
    run: (action: string, event: LoopEventRecord): Promise<unknown> => {
      assert.ok(runner !== undefined, 'the board has the harness action')
      return runner(action, event)
    },
  }
}

const record = (project: string): LoopEventRecord => ({ id: 'ev-1', event: 'schedule/due', at: DAY_AT, project, key: 'due:metrics.selfcheck:x', payload: {}, merged: [] })

test('the daily self-check entry goes to the loop board when it is there, with its action, its tell and the three outcomes (acceptance 20)', async () => {
  const base = mkdtempSync(join(tmpdir(), `metrics-row-loops-${++counter}-`))
  const root = join(base, 'ws')
  mkdirSync(root, { recursive: true })
  assert.equal(spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: root }).status, 0)
  const rt = fakeRuntime({ route: { provider: 'glm-probe', model: 'glm-5.3' }, cwd: root })
  rt.services.set('agents', { get: (id: string) => id === rt.agent.id ? { id: rt.agent.id, session: rt.agent.session } : undefined })
  const loops = fakeLoops()
  try {
    const injector = fakeInjector({ glmHournessLoops: loops.service }, rt.ctx)
    apply({ ...rt.ctx, inject: injector.inject } as never, {
      randomId: () => '0123abcd',
      now: () => AT,
      checkDelay: 60_000,
      selfcheck: (checked) => checked === 'C:/nowhere/at-all'
        ? Promise.reject(Object.assign(new Error('EACCES'), { code: 'EACCES' }))
        : Promise.resolve(checked.endsWith('lost') ? { ...emptyFindings(), lostFiles: ['events-x.jsonl'] } : emptyFindings()),
    })
    const health = () => rt.ctx.get(healthServiceName('metrics')) as RowHealthView | undefined
    assert.equal(loops.contributions.length, 1)
    const entry = loops.contributions[0]?.entries[0]
    assert.deepEqual(entry?.when, { kind: 'daily', time: '10:00' })
    assert.deepEqual(entry?.action, { kind: 'harness', action: 'metrics.selfcheck', tell: { text: 'The metrics log self-check found something; see the coverage line of /hourness.', wake: false } })
    assert.equal(METRICS_SELF_CHECK_ENTRY.id, 'metrics.selfcheck')
    assert.ok((METRICS_SELF_CHECK_ENTRY.action.tell?.text.length ?? 0) > 0 && !METRICS_SELF_CHECK_ENTRY.action.tell.text.includes('%s'))
    assert.deepEqual(await loops.run('metrics.selfcheck', record(root)), { outcome: 'skipped', reason: 'clean' }, 'clean says skipped, so the tell is never delivered')
    assert.deepEqual(await loops.run('metrics.selfcheck', record(`${root}-lost`)), { outcome: 'done' }, 'findings say done, and the board delivers the entry\'s tell')
    assert.deepEqual(await loops.run('metrics.selfcheck', record('C:/nowhere/at-all')), { outcome: 'skipped', reason: 'EACCES' }, 'a project that cannot be read is skipped with the reason')
    assert.match(health()?.activation().reason ?? '', /自查条目已交给循环板/)
    assert.equal(health()?.activation().state, 'active', 'the loops hand-off is not a fault')
  }
  finally {
    rmSync(base, { recursive: true, force: true })
  }
})

function emptyFindings() {
  return { events: 0, unreadable: [], missing: [], chainBreaks: [], noStop: [], clockRollbacks: [], duplicates: 0, lostFiles: [], forgeries: [], bytes: 0 }
}

test('without the loop board the row stays healthy, notes it, and still checks in the background (acceptance 20, §6.4)', async () => {
  const fx = fixture({ checkDelay: 0 })
  try {
    await emitCount(fx)
    for (let waited = 0; waited < 3000 && !(fx.health()?.session(fx.rt.agent.id)?.reason ?? '').includes('上次自查干净'); waited += 20) await new Promise(resolve => setTimeout(resolve, 20))
    const activation = fx.health()?.activation()
    assert.equal(activation?.state, 'active')
    assert.match(activation?.reason ?? '', /积分口径：未提供/)
    const report = fx.health()?.session(fx.rt.agent.id)
    assert.match(report?.reason ?? '', /上次自查干净/)
    assert.equal(report?.state, 'active')
  }
  finally {
    rm(fx)
  }
})

test('the background self-check reports what it found into the health and the session report (§6.4, §9.6)', async () => {
  const fx = fixture({ checkDelay: 0, selfcheck: () => Promise.resolve({ ...emptyFindings(), noStop: [{ w: 'ffffffff', lastAt: DAY_AT }] }) })
  try {
    await emitCount(fx)
    for (let waited = 0; waited < 3000 && !(fx.health()?.activation().reason ?? '').includes('自查有发现'); waited += 20) await new Promise(resolve => setTimeout(resolve, 20))
    assert.match(fx.health()?.activation().reason ?? '', /自查有发现：1 个进程没有正常退出/)
    assert.match(fx.health()?.session(fx.rt.agent.id)?.reason ?? '', /上次自查有发现/)
    assert.equal(fx.health()?.session(fx.rt.agent.id)?.state, 'degraded')
  }
  finally {
    rm(fx)
  }
})

test('a second metrics instance warns and says so; a host without seams names them; a host without agents counts (§9.1)', () => {
  const first = fixture({ checkDelay: 60_000 }, { agents: false })
  try {
    const rt = first.rt
    const warnings: string[] = []
    const original = console.warn
    console.warn = (text: string) => { warnings.push(text) }
    let stop: () => void = () => {}
    try {
      stop = apply({ ...rt.ctx } as never, { checkDelay: 60_000, randomId: () => 'ffffffff', now: () => AT })
    }
    finally {
      console.warn = original
    }
    assert.equal(warnings.filter(warning => warning.includes('glmHournessMetrics not provided')).length, 1, warnings.join(' | '))
    assert.ok(warnings.some(warning => warning.includes('row health not provided')), 'the second instance cannot provide its health view either, and says so')
    const activation = first.health()?.activation()
    assert.match(activation?.reason ?? '', /没有 agents 服务/)
    stop()
    const bare = fakeRuntime({ route: undefined })
    apply({ ...bare.ctx, on: undefined } as never, { checkDelay: 60_000, randomId: () => 'ffffffff', now: () => AT })
    assert.equal(bare.ctx.get(healthServiceName('metrics')) !== undefined, true)
    assert.match((bare.ctx.get(healthServiceName('metrics')) as RowHealthView).activation().reason ?? '', /接缝没装上/)
  }
  finally {
    rm(first)
  }
})

test('a project whose exclude file cannot be written keeps the events queued and says why (§9.2, acceptance 7 slice)', async () => {
  const fx = fixture({
    checkDelay: 60_000,
    ensureIgnored: () => Promise.reject(Object.assign(new Error('EACCES'), { code: 'EACCES' })),
  })
  try {
    await fx.rt.create()
    fx.service()?.emit({ k: 'count', by: 'guard', at: DAY_AT, body: { what: 'w', value: 1 } }, { sessionId: fx.rt.agent.id, dir: fx.root })
    await new Promise(resolve => setTimeout(resolve, 60))
    assert.equal(existsSync(join(fx.root, '.llm', 'metrics')), false, 'no metrics directory was created')
    // The failure is named at the next report moment (§9.2): the next event's report carries the error code.
    fx.service()?.emit({ k: 'count', by: 'guard', at: DAY_AT, body: { what: 'w2', value: 2 } }, { sessionId: fx.rt.agent.id, dir: fx.root })
    await new Promise(resolve => setTimeout(resolve, 60))
    const report = fx.health()?.session(fx.rt.agent.id)
    assert.match(report?.reason ?? '', /写入失败（EACCES/)
    assert.equal(report?.state, 'degraded')
  }
  finally {
    rm(fx)
  }
})

test('the first sight of a session is one session event with its origin and parent (§4.2)', async () => {
  const fx = fixture({ checkDelay: 60_000 })
  try {
    const child = { ...fx.rt.agent, id: 'child-1', session: { ...fx.rt.agent.session, id: 'child-1', header: { id: 'child-1', cwd: fx.rt.agent.session?.header.cwd, origin: 'subagent' as const, parentSession: fx.rt.agent.id } } }
    await fx.rt.create(child)
    const events = await untilEvents(fx, 1)
    const sessions = events.filter(event => event.k === 'session') as Array<{ readonly body: Record<string, unknown> }>
    assert.equal(sessions.length, 1)
    assert.deepEqual([sessions[0].body.origin, sessions[0].body.parent], ['subagent', fx.rt.agent.id])
  }
  finally {
    rm(fx)
  }
})
