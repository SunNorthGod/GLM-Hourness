/**
 * The lessons row on the fake rc.3 host (M5 design §2.3, §4.2, §4.6, §4.7,
 * §7; acceptance lessons-1 items 3, 5, 6): the tools it registers and the
 * events it listens to (none of them gates a tool call), the notices to the
 * main agent, the tool face of a delegated child, `/lessons`, the projection,
 * the service and the row health. The journal is a real file in a temporary
 * directory; the main agent of the project is judged by the real holder
 * record.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { realLockEnvironment } from '../src/data/lock.ts'
import { MAIN_AGENT_KEY } from '../src/graph/main-agent.ts'
import { claimHolder, holderFileOf } from '../src/graph/main-agent-holder.ts'
import { apply, inject, LESSONS_PROJECTION, name, type LessonsConfig, type LessonsContext } from '../src/lessons/index.ts'
import { PENDING_SOURCE, RECUR_SOURCE } from '../src/lessons/notices.ts'
import { LESSONS_SERVICE, type LessonsService } from '../src/lessons/service.ts'
import { journalFile } from '../src/lessons/storage.ts'
import { LESSONS_MERGE_EXAMPLE } from '../src/lessons/tools.ts'
import type { AgentCommandInvocationLike, CommandDefinitionLike, SessionLike, SessionProjectionsService, UserNotice } from '../src/shared/dsh-min.ts'
import { collectHealth } from '../src/shared/health.ts'
import { LESSONS_TOOL_NAMES } from '../src/shared/tool-names.ts'
import { fakeRuntime, type FakeRuntime } from './fake-rc3.ts'
import { captureWarnings } from './graph-helpers.ts'
import { CANDIDATE, LESSON, NOW } from './lessons-helpers.ts'
import { refusalOf } from './memory-helpers.ts'
import { createChild, failRegistration, optionalServices, stepOf } from './row-host.ts'

const WORK = resolve(tmpdir(), 'lessons-row-project')
const GRAPH_DIR = join(WORK, 'docs', 'graph')
const DAY = 86_400_000

interface Row {
  readonly root: string
  readonly project: string
  readonly userHome: string
  readonly runtime: FakeRuntime
  readonly commands: Map<string, CommandDefinitionLike<AgentCommandInvocationLike>>
  readonly projections: Array<Parameters<SessionProjectionsService['register']>[0]>
  readonly service: LessonsService
  readonly dispose: () => void
  /** The modes the projection of each session reports, for the judgement of the main agent. */
  readonly modes: Map<string, unknown>
  readonly services: { provide(): void, remove(): void }
  setNow(at: Date): void
  /** Make `sessionId` the main agent of the project, in the record file. */
  hold(sessionId: string): void
  /** The records of the project's journal, in file order. */
  readonly journal: () => Array<Record<string, unknown>>
  /** One step of the main agent; the notices the row adds stay in the history like real ones. */
  readonly step: () => Promise<readonly UserNotice[]>
  /** Type `/lessons <input>` as the person, in the main agent's session. */
  readonly run: (input: string) => Promise<{ readonly kind: string, readonly text?: string }>
  /** Call a lessons tool as the main agent of the fake host. */
  readonly tool: (name: string, args: unknown) => Promise<Record<string, unknown>>
}

interface Options {
  /** The data row names no project for the session. */
  readonly noProject?: boolean
  readonly config?: LessonsConfig
  /** Leave the optional services out: the host has no `inject`. */
  readonly bare?: boolean
  /** The commands and sessionProjections services are not there when the row starts. */
  readonly late?: boolean
  /** The graph row and the session state service are there, so the main agent is judged by its record. */
  readonly judged?: boolean
}

async function withRow(body: (row: Row) => Promise<void> | void, options: Options = {}): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'lessons-row-'))
  const project = join(root, 'project')
  const userHome = join(root, 'dsh', 'glm-hourness')
  let clock = NOW
  const runtime = fakeRuntime({ natives: ['pwsh'], cwd: WORK })
  runtime.services.set('glmHournessData', { userHome, projectDirOf: () => options.noProject === true ? undefined : project })
  const modes = new Map<string, unknown>()
  if (options.judged === true) {
    runtime.services.set('glmHournessGraph', { dirFor: () => GRAPH_DIR, isGraphTool: () => false })
    runtime.services.set('sessionProjections', { stateOf: (session: SessionLike, key: string) => key === MAIN_AGENT_KEY ? modes.get(session.id) : undefined })
  }
  const optional = optionalServices(runtime, options)
  const { commands, projections, services } = optional
  const ctx = optional.ctx as unknown as LessonsContext
  const config: LessonsConfig = { now: () => clock, random: (() => { let drawn = 0x100000; return () => drawn++ })(), ignoreCase: false, append: { lock: { ...realLockEnvironment, now: () => clock.getTime() } }, ...options.config }
  const dispose = apply(ctx, config)
  const service = runtime.services.get(LESSONS_SERVICE) as LessonsService
  const row: Row = {
    root,
    project,
    userHome,
    runtime,
    commands,
    projections,
    service,
    dispose,
    modes,
    services,
    setNow(at) { clock = at },
    hold(sessionId) {
      rmSync(holderFileOf(userHome, GRAPH_DIR), { force: true })
      claimHolder(holderFileOf(userHome, GRAPH_DIR), { version: 1, sessionId, graphDir: GRAPH_DIR, since: '2026-11-01T00:00:00.000Z', commandId: `cmd-${sessionId}` })
    },
    tool: async (toolName, args) => await runtime.execute(toolName, args) as Record<string, unknown>,
    run: async input => commands.get('lessons')!.handler({ commandId: 'cmd-1', agent: { id: runtime.agent.id, session: runtime.agent.session }, rawInput: input } as unknown as AgentCommandInvocationLike),
    step: () => stepOf(runtime),

    journal: () => {
      try {
        return readJournalLines(journalFile(project))
      }
      catch {
        return []
      }
    },
  }
  try {
    await runtime.create()
    await body(row)
  }
  finally {
    dispose()
    rmSync(root, { recursive: true, force: true })
  }
}

const readJournalLines = (file: string): Array<Record<string, unknown>> => readFileSync(file, 'utf8').split('\n').filter(line => line !== '').map(line => JSON.parse(line) as Record<string, unknown>)

const rowHealth = (row: Row, sessionId = 'agent-1') => collectHealth(row.runtime.ctx, sessionId).find(entry => entry.row === 'lessons')!
const kinds = (notices: readonly UserNotice[]): string[] => notices.map(notice => notice.source.kind)
const proposeFrom = (row: Row, session: string, candidate: object = CANDIDATE) => row.service.propose(candidate as never, { session: { id: session, header: { id: session }, deriveMessages: () => [] }, task: 'task-3' })

test('the row is a cordis plugin that needs the tools service; it registers the two tools, gates no tool call and listens to agent creation and the step only', async () => {
  await withRow((row) => {
    assert.equal(name, 'dsh-glm-hourness/lessons')
    assert.deepEqual(inject, ['tools'])
    assert.deepEqual(row.runtime.scoped.map(tool => tool.name), LESSONS_TOOL_NAMES)
    const events = new Set(row.runtime.listeners.map(entry => entry.event))
    assert.deepEqual([...events].sort(), ['agent/created', 'agent/pre-step'])
    assert.ok(!events.has('tools/pre-execute'), 'the lessons row blocks no tool call (d-code-rules-enforce: it registers no rule)')
    assert.ok(row.commands.has('lessons') && row.projections.length === 1 && row.runtime.services.has(LESSONS_SERVICE))
  })
})

test('disposing the row withdraws its tools, listeners, service and health', async () => {
  await withRow((row) => {
    assert.equal(row.runtime.scoped.length > 0 && row.runtime.listeners.length > 0, true)
    row.dispose()
    assert.equal(row.runtime.scoped.length + row.runtime.listeners.length, 0)
    assert.equal(row.runtime.services.has(LESSONS_SERVICE), false)
    assert.deepEqual([...row.runtime.services.keys()].filter(key => key.startsWith('glmHournessHealth/lessons')), [])
  })
})

test('the command and the projection follow their services: absent at the start they are registered when the services arrive, and withdrawn when they leave', async () => {
  await withRow(async (row) => {
    assert.equal(row.commands.size + row.projections.length, 0)
    const waiting = collectHealth(row.runtime.ctx, undefined).find(entry => entry.row === 'lessons')!
    assert.equal(waiting.status, 'degraded')
    assert.ok(waiting.reason.includes('命令 /lessons 等 commands 服务') && waiting.reason.includes('会话投影 hournessLessons 等 sessionProjections 服务'), waiting.reason)
    assert.equal((await row.tool('lessons_merge', LESSON)).status, 'active', 'the tools work without them')
    row.services.provide()
    assert.ok(row.commands.has('lessons') && row.projections.length === 1)
    assert.equal(collectHealth(row.runtime.ctx, undefined).find(entry => entry.row === 'lessons')!.status, 'idle')
    row.services.remove()
    assert.equal(row.commands.size + row.projections.length, 0)
    assert.equal(collectHealth(row.runtime.ctx, undefined).find(entry => entry.row === 'lessons')!.status, 'degraded')
  }, { late: true })
})

test('the optional services never arriving: the tools and the notices work, and the health says what is off', async () => {
  const { warnings } = await captureWarnings(() => withRow(async (row) => {
    assert.equal((await row.tool('lessons_merge', LESSON)).status, 'active')
    const activation = collectHealth(row.runtime.ctx, undefined).find(entry => entry.row === 'lessons')!
    assert.equal(activation.status, 'degraded')
    assert.ok(activation.reason.includes('宿主没有 inject，没有注册命令 /lessons') && activation.reason.includes('宿主没有 inject，没有注册会话投影 hournessLessons'), activation.reason)
  }, { bare: true }))
  assert.deepEqual(warnings.filter(text => text.includes('dsh-glm-hourness/lessons')), [])
})

test('candidates waiting get one notice to the main agent, again only when the set changes or the history lost it', async () => {
  await withRow(async (row) => {
    assert.deepEqual(await row.step(), [], 'no candidate, no notice')
    await proposeFrom(row, 'worker-1')
    const [first, ...more] = await row.step()
    assert.equal(more.length, 0)
    assert.equal(first?.source.kind, PENDING_SOURCE)
    assert.equal(first?.source.form, 'notice')
    assert.equal(first?.source.candidates, 1)
    assert.ok(first?.content[0].text.startsWith('<system-reminder>\nLesson candidates waiting for you to merge (1):\n- C-100000 from task-3: Get-Content without -Encoding'), first?.content[0].text)
    assert.deepEqual(await row.step(), [], 'the same set is not listed again')
    await proposeFrom(row, 'worker-2', { ...CANDIDATE, problem: 'A different pitfall.', errors: ['a different error piece'] })
    const [second] = await row.step()
    assert.ok(second?.content[0].text.includes('waiting for you to merge (2)'), second?.content[0].text)
    assert.notEqual(second?.source.digest, first?.source.digest)
    await row.tool('lessons_merge', { action: 'new', reason: 'worth keeping', candidate: 'C-100000' })
    await row.tool('lessons_merge', { action: 'drop', reason: 'not a lesson', candidate: 'C-100001' })
    assert.deepEqual(await row.step(), [], 'nothing is waiting any more: no notice for an empty set')
    await proposeFrom(row, 'worker-3', { ...CANDIDATE, problem: 'A third pitfall.', errors: ['a third error piece'] })
    row.runtime.history.length = 0 // a compaction replaced the history
    assert.equal((await row.step()).length, 1)
    assert.equal((await row.step()).length, 0)
  })
})

test('a candidate open for more than 30 days expires at the next notice step and is not listed; reopening brings it back', async () => {
  await withRow(async (row) => {
    row.setNow(new Date(NOW.getTime() - 31 * DAY))
    await proposeFrom(row, 'worker-1')
    row.setNow(NOW)
    assert.deepEqual(await row.step(), [])
    assert.deepEqual(row.journal().map(record => [record.op, record.actor]), [['propose', 'harness'], ['expire', 'harness']])
    assert.equal((await row.tool('lessons_merge', { action: 'reopen', reason: 'still true', candidate: 'C-100000' })).status, 'open')
    assert.equal((await row.step()).length, 1)
  })
})

test('only the main agent of the project is told: another session of the project is not, whatever its own mode; one whose mode is off is not and the health says why', async () => {
  await withRow(async (row) => {
    row.hold('someone-else')
    row.modes.set('someone-else', { active: true, running: null, settled: null })
    await proposeFrom(row, 'worker-1')
    assert.deepEqual(await row.step(), [], 'the record names another session')
    assert.equal(rowHealth(row).status, 'idle', 'nothing is wrong with that: the row did not report')
    row.hold('agent-1')
    row.modes.set('agent-1', { active: false, running: null, settled: null })
    assert.deepEqual(await row.step(), [], 'the record names this session but its mode is off')
    assert.ok(rowHealth(row).reason.includes('主 Agent 模式已关'), rowHealth(row).reason)
    row.modes.set('agent-1', { active: true, running: null, settled: null })
    assert.deepEqual(kinds(await row.step()), [PENDING_SOURCE])
  }, { judged: true })
  await withRow(async (row) => {
    await proposeFrom(row, 'worker-1')
    assert.deepEqual(kinds(await row.step()), [PENDING_SOURCE], 'without the design row every root agent counts')
    assert.ok(rowHealth(row).reason.includes('所有根 agent 都按主 Agent 处理'), rowHealth(row).reason)
  })
})

test('a lesson that matched or took a candidate in three sessions in 28 days is brought up once, one lesson a step, two a week, and the record comes before the notice', async () => {
  await withRow(async (row) => {
    const lessons = ['one', 'two', 'three'].map((word, index) => ({ ...LESSON, reason: word, situation: { errors: [`error piece number ${word}`] }, pitfall: `Pitfall ${word} with a long enough sentence to be told apart.`, fix: `Fix ${word}.`, evidence: [`docs/note-${String(index)}.md`] }))
    for (const lesson of lessons) await row.tool('lessons_merge', lesson)
    for (const [index, word] of ['one', 'two', 'three'].entries()) {
      for (const session of ['s1', 's2', 's3']) {
        row.setNow(new Date(NOW.getTime() - (10 - index) * DAY))
        await proposeFrom(row, session, { problem: `The ${word} again.`, fix: 'Same.', files: [], commands: [], tools: [], errors: [`error piece number ${word}`] })
      }
    }
    row.setNow(NOW)
    const [first] = await row.step()
    assert.equal(first?.source.kind, RECUR_SOURCE)
    assert.ok(first?.content[0].text.startsWith('<system-reminder>\nLesson L-1000'), first?.content[0].text)
    assert.ok(first?.content[0].text.includes('matched failures in 3 sessions in the last 28 days'), first?.content[0].text)
    assert.deepEqual(row.journal().filter(record => record.op === 'recur-notified').map(record => record.id), [first?.source.lesson])
    const second = await row.step()
    assert.deepEqual(kinds(second), [RECUR_SOURCE])
    assert.notEqual(second[0]?.source.lesson, first?.source.lesson)
    assert.deepEqual(kinds(await row.step()), [], 'two reminders a week at most: the third lesson waits for next week')
    row.setNow(new Date(NOW.getTime() + 7 * DAY))
    assert.deepEqual(kinds(await row.step()), [RECUR_SOURCE])
  })
})

test('a delegated child loses lessons_merge from its request and gets no notice, keeps lessons_query; calling the merge by name is refused with the way to hand back', async () => {
  await withRow(async (row) => {
    const { child, stepListenersAdded } = await createChild(row.runtime)
    assert.equal(stepListenersAdded, 0, 'no notice listener for a child')

    const assembled = await row.runtime.assemble({ provider: 'glm-probe', model: 'glm-5.3' })
    assert.deepEqual(assembled.tools.map(tool => tool.name).sort(), ['lessons_query', 'pwsh'], 'lessons_merge is not in the child\'s face')
    const merge = await row.runtime.ctx.tools.execute({ callId: 'c1', name: 'lessons_merge', arguments: LESSON, agent: child, signal: new AbortController().signal })
    assert.equal(merge.isError, true)
    const refusal = JSON.parse(merge.content[0]?.text?.replace(/^Error: /, '') ?? '{}') as { code: string, hint: string }
    assert.equal(refusal.code, 'role')
    assert.ok(refusal.hint.includes('handback'), refusal.hint)
    assert.deepEqual(row.journal(), [])
    const query = await row.runtime.ctx.tools.execute({ callId: 'c2', name: 'lessons_query', arguments: { text: 'anything' }, agent: child, signal: new AbortController().signal })
    assert.equal(query.isError, false)
  })
})

test('a root agent keeps both tools in its request', async () => {
  await withRow(async (row) => {
    const assembled = await row.runtime.assemble({ provider: 'glm-probe', model: 'glm-5.3' })
    assert.deepEqual(assembled.tools.map(tool => tool.name).sort(), ['lessons_merge', 'lessons_query', 'pwsh'])
  })
})

test('the example in the description of lessons_merge is a call that works, and its lesson is found by lessons_query', async () => {
  await withRow(async (row) => {
    assert.ok(row.runtime.scoped.find(tool => tool.name === 'lessons_merge')?.description.includes(JSON.stringify(LESSONS_MERGE_EXAMPLE, null, 2)))
    const written = await row.tool('lessons_merge', LESSONS_MERGE_EXAMPLE)
    assert.deepEqual(written, { action: 'new', lesson: 'L-100000', status: 'active' })
    const found = await row.tool('lessons_query', { error: 'EMFILE: too many open files while opening a photo' })
    assert.deepEqual((found.lessons as Array<{ id: string }>).map(entry => entry.id), ['L-100000'])
  })
})

test('/lessons show lists the counts and the latest lessons', async () => {
  await withRow(async (row) => {
    await row.tool('lessons_merge', LESSON)
    await proposeFrom(row, 'worker-1')
    const shown = await row.run('show')
    assert.equal(shown.kind, 'success')
    assert.ok(shown.text?.includes('本项目：1 条经验，1 条候选等主 Agent 合并，0 条被 agent 收起，0 条被你删掉'), shown.text ?? '')
    assert.ok(shown.text?.includes('- L-100000：A worker committed a graph comment although its brief said not to.'), shown.text ?? '')
  })
})

test('/lessons delete and restore work as the person without any quoted words, drop throws a candidate away; the journal keeps the command', async () => {
  await withRow(async (row) => {
    await row.tool('lessons_merge', LESSON)
    await proposeFrom(row, 'worker-1')
    assert.equal((await row.run('delete L-100000')).text, '已删除「A worker committed a graph comment alth…」（L-100000）。')
    assert.equal((await row.run('delete L-100000')).text, '找不到 L-100000，可能已被删除，刷新一下。')
    assert.equal((await row.run('restore L-100000')).text, '已找回「A worker committed a graph comment alth…」（L-100000）。')
    assert.equal((await row.run('drop C-100001')).kind, 'success')
    const records = row.journal()
    assert.deepEqual(records.slice(-3).map(record => [record.op, record.actor, record.id]), [['delete', 'human', 'L-100000'], ['restore', 'human', 'L-100000'], ['drop', 'human', 'C-100001']])
    assert.deepEqual(records.at(-3)?.by, { session: 'agent-1', agent: 'agent-1', commandId: 'cmd-1' })
    assert.equal(records.at(-3)?.relay, undefined)
    assert.ok(typeof records.at(-3)?.data === 'object' && (records.at(-3)?.data as { id: string }).id === 'L-100000', 'the delete keeps a snapshot')
  })
})

test('/lessons says how to use it when the input is not one of the forms, and what is wrong when the id is not one', async () => {
  await withRow(async (row) => {
    for (const input of ['', 'list', 'delete', 'delete a b', 'show now', 'forget L-100000']) {
      const result = await row.run(input)
      assert.equal(result.kind, 'error', input)
      assert.ok(result.text?.startsWith('用法：/lessons show'), `${input}: ${result.text}`)
    }
    assert.equal((await row.run('delete nonsense')).text, '「nonsense」不是经验的编号（L-加六位小写十六进制）。')
    assert.equal((await row.run('drop L-100000')).text, '「L-100000」不是候选的编号（C-加六位小写十六进制）。')
    assert.equal((await row.run('drop C-100000')).text, '找不到 C-100000，可能已被删除，刷新一下。')
  })
  await withRow(async (row) => {
    assert.equal((await row.run('show')).kind, 'error')
    assert.equal((await row.run('delete L-100000')).kind, 'error')
  }, { noProject: true })
})

test('the projection gives the page the journal of the project of a session, and null where the session has none', async () => {
  await withRow((row) => {
    const [projection] = row.projections
    assert.equal(projection?.key, LESSONS_PROJECTION)
    const state = projection?.init({ id: 's', cwd: WORK }, 0)
    assert.deepEqual(state, { journal: journalFile(row.project) })
    assert.throws(() => projection?.stateSchema.parse({ journal: 1 }), /journal/)
    assert.deepEqual(projection?.stateSchema.parse(state), state)
    assert.equal((projection?.wire?.view as (state: unknown) => unknown)(state), state)
    assert.equal((projection?.apply as (state: unknown) => unknown)(state), state, 'the state of a session does not change')
  })
  await withRow((row) => {
    assert.deepEqual(row.projections[0]?.init({ id: 's' }, 0), { journal: null })
  }, { noProject: true })
})

test('the row health tells the project, the counts and what went wrong: refused candidates, bad lines, no project', async () => {
  await withRow(async (row) => {
    await row.tool('lessons_merge', LESSON)
    await proposeFrom(row, 'worker-1')
    await row.step()
    const health = rowHealth(row)
    assert.equal(health.status, 'degraded', 'the main agent is judged without the design row: said')
    assert.ok(health.reason.includes(`项目 ${row.project}（生效经验 1、候选 1）`), health.reason)
    await row.service.propose({ ...CANDIDATE, fix: `Use ${['ghp', 'x'.repeat(36)].join('_')} to log in.` }, { session: row.runtime.agent.session as SessionLike })
    writeFileSync(journalFile(row.project), `${readFileSync(journalFile(row.project), 'utf8')}not a record\n`)
    await row.step()
    assert.ok(rowHealth(row).reason.includes('流水有 1 行读不出'), rowHealth(row).reason)
    assert.ok(rowHealth(row).reason.includes('1 条候选被拒（secret_like 1 条）'), rowHealth(row).reason)
  })
  await withRow(async (row) => {
    await row.step()
    assert.equal(rowHealth(row).status, 'degraded')
    assert.ok(rowHealth(row).reason.includes('这个文件夹不是项目'), rowHealth(row).reason)
  }, { noProject: true })
})

test('a write that failed shows in the health of its session until a write succeeds', async () => {
  await withRow(async (row) => {
    mkdirSync(row.project, { recursive: true })
    mkdirSync(journalFile(row.project), { recursive: true }) // a directory where the journal should be
    assert.equal((await refusalOf(row.tool('lessons_merge', LESSON))).code, 'io')
    await row.step()
    assert.ok(rowHealth(row).reason.includes('经验读不出'), rowHealth(row).reason)
    rmSync(journalFile(row.project), { recursive: true })
    await row.tool('lessons_merge', LESSON)
    await row.step()
    assert.ok(!rowHealth(row).reason.includes('经验读不出'), rowHealth(row).reason)
  })
})

test('activation does not throw when a tool cannot be registered or the service is taken: what was registered is withdrawn and the row says why', async () => {
  const runtime = fakeRuntime({ natives: ['pwsh'] })
  failRegistration(runtime, 2, 'name taken')

  const { warnings, result: dispose } = await captureWarnings(() => apply(runtime.ctx as unknown as LessonsContext))
  assert.deepEqual(runtime.scoped, [])
  assert.equal(warnings.length, 1)
  assert.ok(warnings[0]?.includes('name taken'))
  const health = collectHealth(runtime.ctx, undefined).find(entry => entry.row === 'lessons')!
  assert.equal(health.status, 'inactive')
  assert.ok(health.reason.includes('经验工具注册失败'))
  dispose()

  const taken = fakeRuntime({ natives: ['pwsh'] })
  taken.services.set(LESSONS_SERVICE, {})
  const second = await captureWarnings(() => apply(taken.ctx as unknown as LessonsContext))
  assert.equal(second.warnings.length, 1)
  assert.ok(second.warnings[0]?.includes(`${LESSONS_SERVICE} is not provided`), second.warnings[0])
  assert.ok(collectHealth(taken.ctx, undefined).find(entry => entry.row === 'lessons')!.reason.includes('没提供上'))
  second.result()
})
