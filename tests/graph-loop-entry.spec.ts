import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply } from '../src/graph/index.ts'
import { GRAPH_ROW_SOURCE, graphContribution, installLoopEntry, thirdReworkEntry, thirdReworkRule, THIRD_REOPEN_EVENT, type LoopEntryHost } from '../src/graph/loop-entry.ts'
import { REOPEN_LIMIT } from '../src/graph/reopen.ts'
import { loadGraph } from '../src/graph/store.ts'
import type { ServiceLookup, ToolFinalResult } from '../src/shared/dsh-min.ts'
import { healthServiceName, type RowHealthView } from '../src/shared/health.ts'
import { LOOPS_DECLARATION, LOOPS_SERVICE, type ContributeResult, type ContributionSource, type ListedRun, type LoopsService } from '../src/loops/service.ts'
import { validateContribution } from '../src/loops/registry.ts'
import { seedAsHuman } from './graph-helpers.ts'
import { fakeRuntime, type FakeRuntime } from './fake-rc3.ts'

/** What the fake board recorded: the hand-over it received and the runs reported to it. */
interface FakeBoard {
  readonly service: LoopsService
  readonly handed: { source?: ContributionSource, contribution?: unknown, contributes: number, runs: ListedRun[] }
}

/** A loop board that records its hand-overs and runs; a refused one and a throwing recordRun serve the failure cases. */
function fakeBoard(options: { refused?: string, recordRunThrows?: boolean } = {}): FakeBoard {
  const handed: FakeBoard['handed'] = { contributes: 0, runs: [] }
  const service: LoopsService = {
    declaration: LOOPS_DECLARATION,
    contribute: (source, contribution) => {
      handed.source = source
      handed.contribution = contribution
      handed.contributes++
      const result: ContributeResult = options.refused === undefined
        ? { ok: true, dispose: () => {}, accepted: ['graph.third-rework'], dropped: [] }
        : { ok: false, reason: options.refused }
      return result
    },
    emit: () => Promise.resolve({ ok: true as const, id: 'ev-x', duplicate: false }),
    listens: () => false,
    recordRun: run => {
      if (options.recordRunThrows === true) throw new Error('board closed')
      handed.runs.push(run)
    },
  }
  return { service, handed }
}

interface Fixture {
  /** The session working directory; the graph is docs/graph under it. */
  readonly workspace: string
  readonly graph: string
  readonly runtime: FakeRuntime
  readonly call: (name: string, args?: unknown, agent?: FakeRuntime['agent']) => Promise<ToolFinalResult>
  readonly rev: (id: string) => Promise<string>
  readonly question: (id: string) => Promise<Record<string, unknown>>
}

async function setup(board: FakeBoard | undefined): Promise<Fixture> {
  const workspace = await mkdtemp(join(tmpdir(), 'graph-loop-entry-'))
  const graph = join(workspace, 'docs', 'graph')
  await mkdir(graph, { recursive: true })
  await seedAsHuman(graph, [
    { type: 'goal', title: '项目图', acceptance: ['人能看，LLM 能读写'] },
    { type: 'feature', title: '图行', parent: 'goal-1' },
    { type: 'task', title: '路径解析', parent: 'feature-1', acceptance: ['测试过'] },
  ])
  const runtime = fakeRuntime({ natives: [], cwd: workspace })
  if (board !== undefined) runtime.ctx.provide(LOOPS_SERVICE, board.service)
  apply(runtime.ctx, {})
  let counter = 0
  return {
    workspace,
    graph,
    runtime,
    call: async (name, args = {}, agent) => runtime.ctx.tools.execute({ callId: `call-${++counter}`, name, arguments: args, agent: agent ?? runtime.agent, signal: new AbortController().signal }),
    rev: async id => (await loadGraph(graph)).revisions.get(id)!,
    question: async id => (await loadGraph(graph)).nodes.get(id) as unknown as Record<string, unknown>,
  }
}

/** Run the body with console.warn captured; the warnings are the row's board problems. */
async function captured(body: (warnings: string[]) => Promise<void>): Promise<void> {
  const original = console.warn
  const warnings: string[] = []
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')) }
  try {
    await body(warnings)
  }
  finally {
    console.warn = original
  }
}

/** Tear the workspace down after the body, warnings and all. */
async function withFixture(board: FakeBoard | undefined, body: (fixture: Fixture) => Promise<void>): Promise<void> {
  const fixture = await setup(board)
  try {
    await body(fixture)
  }
  finally {
    await rm(fixture.workspace, { recursive: true, force: true })
  }
}

const EVIDENCE = [{ kind: 'commit', ref: 'abc1234' }]

/** Move task-1 to done and reopen it `times` times through the graph_status tool — each reopen one done-to-doing move; returns the last reopen's result. */
async function reopenThroughTool(fixture: Fixture, times: number): Promise<{ isError: boolean, value: { notice?: string }, text: string | undefined }> {
  const status = async (to: 'done' | 'doing', reason: string): Promise<ToolFinalResult> => {
    const result = await fixture.call('graph_status', { id: 'task-1', rev: await fixture.rev('task-1'), to, reason, ...(to === 'done' ? { evidence: EVIDENCE } : {}) })
    assert.equal(result.isError, false, result.content[0]?.text)
    return result
  }
  let last = await status('done', '第一次完成')
  for (let index = 0; index < times; index++) {
    if (index > 0) await status('done', `第 ${index} 次修复完成`)
    last = await status('doing', '没修住')
  }
  return { isError: last.isError, value: last.value as { notice?: string }, text: last.content[0]?.text }
}

/** A caller from a subagent session: the header says so (session header origin, session:1820–1826). */
function subagentOf(fixture: Fixture): FakeRuntime['agent'] {
  const session = fixture.runtime.agent.session!
  return { ...fixture.runtime.agent, session: { ...session, header: { ...session.header, origin: 'subagent' as const } } }
}

/** One done-and-reopen round through the tool, human's words relayed: their own decision. */
async function relayedReopen(fixture: Fixture): Promise<{ notice?: string }> {
  const done = await fixture.call('graph_status', { id: 'task-1', rev: await fixture.rev('task-1'), to: 'done', reason: '先完成', evidence: EVIDENCE })
  assert.equal(done.isError, false, done.content[0]?.text)
  const reopened = await fixture.call('graph_status', { id: 'task-1', rev: await fixture.rev('task-1'), to: 'doing', reason: '人让再试', relay: '再试一次吧' })
  assert.equal(reopened.isError, false, reopened.content[0]?.text)
  return reopened.value as { notice?: string }
}

test('the board-side validation takes the graph row\'s hand-over whole (m4 design §6.8, the contract test)', () => {
  const contribution = graphContribution()
  const check = validateContribution(GRAPH_ROW_SOURCE, contribution, { table: new Map(), owners: new Map(), now: new Date() })
  assert.ok(check.ok, JSON.stringify(check))
  assert.ok(check.ok && check.dropped.length === 0, JSON.stringify(check))
  assert.ok(check.ok && check.namespace === 'graph')
  const entry = thirdReworkEntry()
  assert.equal(entry.id, 'graph.third-rework')
  assert.deepEqual(entry.when, { kind: 'event', events: [THIRD_REOPEN_EVENT.id] })
  assert.deepEqual(entry.action, { kind: 'self', does: '在这件活下面提一件要你定的事，由主 Agent 在对话里问你', by: 'glm-hourness/graph' })
  // One own rule, built from the constant, within the board's line limit of 80 code points.
  assert.equal(entry.ownRules?.length, 1)
  assert.equal(entry.ownRules?.[0], thirdReworkRule())
  assert.equal(entry.ownRules?.[0], `LLM 第 ${REOPEN_LIMIT} 次重开同一件活时问你；你答过之后再数 ${REOPEN_LIMIT} 次`)
  assert.ok([...entry.ownRules ?? []].every(line => [...line].length <= 80))
  assert.ok([...entry.title].length <= 60)
  assert.ok([...(entry.why ?? '')].length <= 150)
  // The event is listed only: the board never receives it, so the row emits nothing.
  assert.equal(THIRD_REOPEN_EVENT.listedOnly, true)
  assert.equal(THIRD_REOPEN_EVENT.personSelectable, false)
  assert.deepEqual(THIRD_REOPEN_EVENT.fields, [])
})

test('the row hands the entry over when an agent arrives (no inject on this host)', async () => {
  const board = fakeBoard()
  await captured(async warnings => {
    await withFixture(board, async fixture => {
      await fixture.runtime.create()
      assert.equal(board.handed.source?.plugin, 'dsh-hourness')
      assert.equal(board.handed.source?.row, 'glm-hourness/graph')
      assert.deepEqual((board.handed.contribution as { entries: readonly { id: string }[] }).entries.map(entry => entry.id), ['graph.third-rework'])
      // An agent arriving again hands the same source over: the board replaces it wholesale.
      assert.equal(board.handed.contributes, 1)
      await fixture.runtime.create()
      assert.equal(board.handed.contributes, 2)
      assert.deepEqual(warnings, [])
    })
  })
})

test('a third reopen files the question and reports one run; earlier reopens do neither', async () => {
  const board = fakeBoard()
  await captured(async () => {
    await withFixture(board, async fixture => {
      const first = await reopenThroughTool(fixture, 1)
      assert.equal(first.value.notice, undefined)
      assert.equal(board.handed.runs.length, 0)
      const third = await reopenThroughTool(fixture, 2)
      assert.ok(typeof third.value.notice === 'string' && third.value.notice.length > 0, 'the third reopen carries a notice')
      const question = await fixture.question('question-1')
      assert.equal(question.parent, 'task-1')
      assert.equal(question.form, 'recommend')
      assert.equal(question.options, undefined)
      assert.ok(third.value.notice?.includes('question-1'))
      assert.ok(third.value.notice?.includes('先停下查原因，可以吗？'))
      assert.deepEqual(board.handed.runs, [{ cwd: fixture.workspace, entry: 'graph.third-rework', outcome: 'reported' }])
      // A fourth reopen with the question open files nothing and reports nothing more.
      const fourth = await fixture.call('graph_status', { id: 'task-1', rev: await fixture.rev('task-1'), to: 'done', reason: '先完成', evidence: EVIDENCE })
      assert.equal(fourth.isError, false)
      const again = await fixture.call('graph_status', { id: 'task-1', rev: await fixture.rev('task-1'), to: 'doing', reason: '没修住' })
      assert.equal((again.value as { notice?: string }).notice, undefined)
      assert.equal(board.handed.runs.length, 1)
    })
  })
})

test('a relayed reopen does not ask: it is the human\'s own decision', async () => {
  const board = fakeBoard()
  await captured(async () => {
    await withFixture(board, async fixture => {
      for (let index = 0; index < REOPEN_LIMIT; index++) {
        const { notice } = await relayedReopen(fixture)
        assert.equal(notice, undefined)
      }
      assert.equal(board.handed.runs.length, 0)
      assert.equal((await loadGraph(fixture.graph)).nodes.has('question-1'), false)
    })
  })
})

test('after the human decides, the count starts over: three more reopens ask again', async () => {
  const board = fakeBoard()
  await captured(async () => {
    await withFixture(board, async fixture => {
      const third = await reopenThroughTool(fixture, REOPEN_LIMIT)
      const filed = third.value.notice?.match(/question-\d+/)?.[0] ?? ''
      assert.ok(filed.length > 0)
      // The human agrees; the decide closes the question and the next window begins.
      await fixture.call('graph_decide', { id: filed, rev: await fixture.rev(filed), conclusion: '先停下查原因', reason: '好，先查', relay: '先查原因' })
      for (let round = 0; round < REOPEN_LIMIT; round++) {
        const reopened = await reopenThroughTool(fixture, 1)
        if (round < REOPEN_LIMIT - 1) assert.equal(reopened.value.notice, undefined)
        else assert.ok(reopened.value.notice?.includes('question-2'), 'the second question is filed')
      }
      assert.deepEqual(board.handed.runs.map(run => run.outcome), ['reported', 'reported'])
    })
  })
})

test('a subagent caller reads the short notice: stop and hand back', async () => {
  const board = fakeBoard()
  await captured(async () => {
    await withFixture(board, async fixture => {
      await reopenThroughTool(fixture, REOPEN_LIMIT - 1)
      const done = await fixture.call('graph_status', { id: 'task-1', rev: await fixture.rev('task-1'), to: 'done', reason: '先完成', evidence: EVIDENCE })
      assert.equal(done.isError, false)
      const reopened = await fixture.call('graph_status', { id: 'task-1', rev: await fixture.rev('task-1'), to: 'doing', reason: '没修住' }, subagentOf(fixture))
      assert.ok(String((reopened.value as { notice?: string }).notice).includes('Stop work on it'))
      assert.ok(String((reopened.value as { notice?: string }).notice).includes('the main agent asks the human'))
      assert.equal(board.handed.runs.length, 1)
    })
  })
})

test('without the board the question is still filed; only the run is missing', async () => {
  await captured(async () => {
    await withFixture(undefined, async fixture => {
      const third = await reopenThroughTool(fixture, REOPEN_LIMIT)
      assert.ok(typeof third.value.notice === 'string')
      assert.equal((await loadGraph(fixture.graph)).nodes.has('question-1'), true)
    })
  })
})

test('a refused hand-over is warned once and kept on the row health; the question still goes out', async () => {
  const board = fakeBoard({ refused: '这个来源交过了' })
  await captured(async warnings => {
    await withFixture(board, async fixture => {
      await fixture.runtime.create()
      assert.equal(warnings.filter(line => line.includes('graph.third-rework')).length, 1, 'warned once')
      const view = fixture.runtime.services.get(healthServiceName('graph')) as RowHealthView
      assert.equal(view.activation().state, 'degraded')
      assert.match(view.activation().reason, /graph\.third-rework 没被收下/)
      const third = await reopenThroughTool(fixture, REOPEN_LIMIT)
      assert.ok(typeof third.value.notice === 'string')
    })
  })
})

test('a throwing recordRun is a row-health note, never a tool failure', async () => {
  const board = fakeBoard({ recordRunThrows: true })
  await captured(async warnings => {
    await withFixture(board, async fixture => {
      await fixture.runtime.create()
      const third = await reopenThroughTool(fixture, REOPEN_LIMIT)
      assert.equal(third.isError, false)
      assert.ok(typeof third.value.notice === 'string', 'the question is filed all the same')
      assert.ok(warnings.some(line => line.includes('graph.third-rework 没被收下')), 'warned')
      const view = fixture.runtime.services.get(healthServiceName('graph')) as RowHealthView
      const session = view.session('agent-1')
      assert.ok(session !== undefined && session.reason.includes('graph.third-rework 没被收下'), 'the note is on the session')
    })
  })
})

test('the wiring hands over through inject when the host has it', () => {
  const board = fakeBoard()
  const injects: string[][] = []
  const ctx: LoopEntryHost = {
    get: name => name === LOOPS_SERVICE ? board.service : undefined,
    inject: (names: readonly string[], callback: (sub: ServiceLookup) => (() => void) | void) => {
      injects.push([...names])
      const dispose = callback({ get: name => name === LOOPS_SERVICE ? board.service : undefined })
      void dispose
      return undefined
    },
    on: () => () => {},
  }
  installLoopEntry(ctx, () => {})
  assert.deepEqual(injects, [[LOOPS_SERVICE]])
  assert.equal(board.handed.source?.row, 'glm-hourness/graph')
})
