/**
 * The loop row on the fake rc.3 host (docs/ORCHESTRATION.md §18; loop board
 * design §7.2, §8.4, §11.1): `/loops` and its `delete`, `restore` and `ack`
 * as the person types them and what they answer, the settling of a project's
 * files when a session starts in it, the project's `view.json` with what the
 * runtime kept and recorded, the row's health, the session projection
 * `hournessLoops`, and what the row says when the host lacks a part. The
 * storage under it is in loops-store.spec.ts; the view's words and the page
 * in loops-panel-model.spec.ts.
 */
import assert from 'node:assert/strict'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { holderFileOf, projectKey } from '../src/graph/main-agent-holder.ts'
import { inject, LOOPS_COMMAND, name } from '../src/loops/index.ts'
import { LOOP_STEP_SOURCE, machineStepFile, STEP_NOTE_MS, type MachineStepNote, type StepNote } from '../src/loops/reminder.ts'
import { LOOPS_KEY } from '../src/loops/projection.ts'
import { LOOPS_DECLARATION, loopsService } from '../src/loops/service.ts'
import { NOT_A_PROJECT } from '../src/loops/commands.ts'
import { entryFileText } from '../src/loops/model.ts'
import { openLoopStore } from '../src/loops/store.ts'
import { nextOccurrence } from '../src/loops/trigger.ts'
import { momentText, type LoopsView } from '../src/loops/view.ts'
import { appendEvents } from '../src/metrics/library.ts'
import type { EmittedEvent } from '../src/shared/metrics.ts'
import { entryFileOf, NOW, quickIo, recordsOf, scriptEntry, SCRIPT_TEXT, seedAgreed, tellEntry, writeFiles } from './loops-helpers.ts'
import { withLoopsRow, type LoopsFixture } from './loops-host.ts'

const A = 'u-0a1b2c3d'
const B = 'u-4e5f6a7b'
const C = 'u-8c9d0e1f'

const rowTest = (title: string, body: (fixture: LoopsFixture) => Promise<void> | void, options: Parameters<typeof withLoopsRow>[1] = {}): void => {
  test(title, () => withLoopsRow(body, options))
}

/** The board of the fixture's project, with a person's entry agreed to the way a chat agreement leaves it. */
const agreed = async (fixture: LoopsFixture, ...entries: Array<ReturnType<typeof tellEntry>>): Promise<void> => {
  const store = openLoopStore(fixture.root, { io: quickIo() })
  for (const entry of entries) await seedAgreed({ root: fixture.root, store }, entry, entry.action.kind === 'script' ? { scriptText: SCRIPT_TEXT } : {})
}

const viewOf = async (root: string): Promise<LoopsView> => JSON.parse(await readFile(join(root, '.llm', 'loops', 'view.json'), 'utf8')) as LoopsView

test('the row is a cordis plugin that needs the commands service, and registers /loops as a command of its own with its usage as the hint', async () => {
  assert.deepEqual([name, inject, LOOPS_COMMAND], ['dsh-glm-hourness/loops', ['commands'], 'loops'])
  await withLoopsRow(({ commands }) => {
    const command = commands.get('loops')
    assert.deepEqual([command?.definitionId, command?.name, command?.recordInput], ['dsh-glm-hourness/loops', 'loops', undefined])
    assert.match(command?.input?.hint ?? '', /delete.+restore.+ack/)
    assert.ok((command?.description ?? '').length > 0)
  })
})

rowTest('the service the row provides carries the line the guard adds to its prompt section', ({ runtime }) => {
  assert.equal(loopsService(runtime.ctx)?.declaration, LOOPS_DECLARATION)
})

// ------------------------------------------------------------------ /loops

rowTest('/loops with a word it does not know, or without its argument, answers the usage and writes nothing', async (fixture) => {
  await agreed(fixture, tellEntry(A))
  const before = await readFile(join(fixture.root, '.llm', 'loops', 'journal.jsonl'), 'utf8')
  for (const input of ['frobnicate', 'delete', 'delete   ', 'restore', 'restore not-an-id', 'ack now', 'accept lp-0123abcd']) {
    const result = await fixture.run(input)
    assert.deepEqual([input, result.kind, result.text], [input, 'error', '用法：/loops（列出全部）、/loops delete <名字或 id>、/loops restore <id>、/loops ack'])
  }
  assert.equal(await readFile(join(fixture.root, '.llm', 'loops', 'journal.jsonl'), 'utf8'), before)
})

/** The machine's words for a time written in a zone: none when the zone is this machine's. */
const zoneOf = (timeZone: string): string => timeZone === Intl.DateTimeFormat().resolvedOptions().timeZone ? '' : `（${timeZone}）`

rowTest('/loops with nothing lists every entry: the plugins\' first, then the person\'s with how to change and delete them and their ids, the deleted ones with their restore line, and what waits; it writes nothing', async (fixture) => {
  await agreed(fixture, tellEntry(A), scriptEntry(B), tellEntry(C, { title: '第三项' }))
  await fixture.run(`delete ${C}`)
  const before = await readFile(join(fixture.root, '.llm', 'loops', 'journal.jsonl'), 'utf8')
  const result = await fixture.run('')
  assert.equal(result.kind, 'success')
  const lines = result.text.split('\n')
  const next = momentText(nextOccurrence(tellEntry(A).when, new Date(NOW), Intl.DateTimeFormat().resolvedOptions().timeZone)!)
  const mine = lines.indexOf('你自己加的（2 项）：')
  // Without a pricing service the loop row hands over its two entries that are not about the peak; the one whose events nobody declares does not run now.
  assert.deepEqual(lines.slice(0, mine), [
    '插件带来的（2 项，只能看）：',
    '· 依赖文件变了之后：查依赖 · 碰到「hourness.trunk-advanced」或「hourness.outside-advance」 · 还没跑过 · 现在不跑',
    '· 有事等你太久时：再跟你说一次 · 碰到「有事等你超过一段时间」 · 还没跑过',
  ])
  assert.deepEqual(lines.slice(mine + 1), [
    `· 每周五看一眼没合入的分支 · 每周五 17:00${zoneOf('Asia/Shanghai')} · 还没跑过 · 下次 ${next}`,
    '· 重启之后查一下服务 · 碰到「DSH 重新启动了」 · 还没跑过',
    '要改：跟主 Agent 说「把<名字>改成……」；要删：在输入框打 /loops delete <名字或 id>',
    `你加的各项的 id：${A}「每周五看一眼没合入的分支」、${B}「重启之后查一下服务」`,
    `7 天内删掉的「第三项」：打 /loops restore ${C} 能恢复`,
    '在等的 0 件',
  ])
  assert.equal(await readFile(join(fixture.root, '.llm', 'loops', 'journal.jsonl'), 'utf8'), before)
})

rowTest('/loops with nothing in a project without entries of the person\'s says how to add one', async (fixture) => {
  const result = await fixture.run('')
  assert.equal(result.kind, 'success')
  assert.deepEqual(result.text.split('\n').slice(-3), ['你自己加的（0 项）：', '还没有你加的。要加：跟主 Agent 说「每 30 分钟查一下服务器，挂了告诉我」', '在等的 0 件'])
})

rowTest('/loops delete by id deletes the person\'s entry in one line that says how to get it back; the change is the person\'s in the record and git sees the file go', async (fixture) => {
  await agreed(fixture, scriptEntry(B))
  const result = await fixture.run(`delete ${B}`)
  assert.deepEqual([result.kind, result.text], ['success', `已删「重启之后查一下服务」；7 天内打 /loops restore ${B} 能恢复`])
  const records = await recordsOf({ store: openLoopStore(fixture.root) })
  assert.deepEqual(records.map(record => [record.op, record.actor, record.via]), [['add', 'human', 'chat'], ['delete', 'human', 'board']])
  assert.equal(await readFile(entryFileOf(fixture.root, B), 'utf8').catch(() => 'gone'), 'gone')
})

rowTest('/loops delete by name finds the person\'s own entry with that title; a name that fits two entries deletes neither and lists their ids', async (fixture) => {
  await agreed(fixture, tellEntry(A), tellEntry(B, { title: '另一项' }), tellEntry(C, { title: '另一项' }))
  const twice = await fixture.run('delete 另一项')
  assert.deepEqual([twice.kind, twice.text], ['error', `有 2 项叫「另一项」，先不删。它们的 id：${B}、${C}；按 id 再打一次`])
  assert.equal((await recordsOf({ store: openLoopStore(fixture.root) })).length, 3, 'nothing was written')
  const once = await fixture.run('delete   每周五看一眼没合入的分支  ')
  assert.deepEqual([once.kind, once.text], ['success', `已删「每周五看一眼没合入的分支」；7 天内打 /loops restore ${A} 能恢复`])
  const none = await fixture.run('delete 不存在的')
  assert.deepEqual([none.kind, none.text], ['error', '这个项目里没有叫「不存在的」的一项（只找你自己加的）'])
  const unknownId = await fixture.run(`delete ${A.replace('0a', 'ff')}`)
  assert.equal(unknownId.kind, 'error')
})

rowTest('an entry a plugin brought is for looking at: /loops delete answers that it cannot be deleted, by its id, and writes nothing', async (fixture) => {
  const result = await fixture.run('delete loops.remind-waiting')
  assert.deepEqual([result.kind, result.text], ['error', '插件带来的条目只能看，删不掉'])
  assert.equal((await fixture.run('delete execute.handback')).text, '插件带来的条目只能看，删不掉', 'whether or not it is handed over now')
  assert.equal(await readFile(join(fixture.root, '.llm', 'loops', 'journal.jsonl'), 'utf8').catch(() => 'none'), 'none')
})

rowTest('/loops restore answers with the next time for an entry that fires on the clock and not for one that waits for an event, and says when git held the files back', async (fixture) => {
  await agreed(fixture, tellEntry(A), scriptEntry(B))
  await fixture.run(`delete ${A}`)
  await fixture.run(`delete ${B}`)
  const timed = await fixture.run(`restore ${A}`)
  assert.equal(timed.kind, 'success')
  assert.match(timed.text, /^已恢复「每周五看一眼没合入的分支」，下次 \d+月\d+日 \d\d:\d\d$/)
  const evented = await fixture.run(`restore ${B}`)
  assert.deepEqual([evented.kind, evented.text], ['success', '已恢复「重启之后查一下服务」'])
  await fixture.run(`delete ${B}`)
  await writeFile(join(fixture.root, '.git', 'MERGE_HEAD'), '')
  const held = await fixture.run(`restore ${B}`)
  assert.deepEqual([held.kind, held.text], ['success', '已恢复「重启之后查一下服务」（git 正在合并、变基或占着索引，文件等它做完再写）'])
})

rowTest('/loops restore of an entry that is fine, one that was never agreed to here, and one deleted long ago is refused with the reason', async (fixture) => {
  await agreed(fixture, tellEntry(A))
  const fine = await fixture.run(`restore ${A}`)
  assert.deepEqual([fine.kind, fine.text], ['error', '「每周五看一眼没合入的分支」现在是好的，没有要恢复的'])
  const unknown = await fixture.run(`restore ${B}`)
  assert.deepEqual([unknown.kind, unknown.text], ['error', `没有这一项（${B}）`])
  await writeFiles(fixture.root, scriptEntry(C), entryFileText(scriptEntry(C)), SCRIPT_TEXT)
  const unadopted = await fixture.run(`restore ${C}`)
  assert.deepEqual([unadopted.kind, unadopted.text], ['error', '「重启之后查一下服务」在这台电脑上没有你同意过的版本，恢复不了；要用它，跟主 Agent 说'])
})

rowTest('/loops ack answers that there is nothing to acknowledge, and once a line of the record could not be read it acknowledges it', async (fixture) => {
  await agreed(fixture, tellEntry(A))
  const nothing = await fixture.run('ack')
  assert.deepEqual([nothing.kind, nothing.text], ['error', '没有要确认的提示'])
  await appendFile(join(fixture.root, '.llm', 'loops', 'journal.jsonl'), 'garbage\n')
  const done = await fixture.run('ack')
  assert.deepEqual([done.kind, done.text], ['success', '好，这条提示不再显示'])
  assert.equal((await fixture.run('ack')).kind, 'error')
})

rowTest('a session that is in no git project has no board: /loops says so', async ({ run }) => {
  const result = await run('delete x')
  assert.deepEqual([result.kind, result.text], ['error', NOT_A_PROJECT])
}, { cwd: null })

// --------------------------------------------------- settling and the view

rowTest('a session that starts in a project settles its files: a clone\'s entry that only tells the main agent is taken in, one that runs a script is listed as not adopted, and view.json says so', async (fixture) => {
  await writeFiles(fixture.root, tellEntry(A), entryFileText(tellEntry(A)))
  await writeFiles(fixture.root, scriptEntry(B), entryFileText(scriptEntry(B)), SCRIPT_TEXT)
  await fixture.runtime.create()
  const view = await viewOf(fixture.root)
  assert.equal(view.version, 1)
  assert.equal(view.project, projectKey(fixture.root))
  assert.deepEqual(view.entries.filter(entry => entry.source === 'person').map(entry => [entry.id, entry.state]), [[A, 'ok'], [B, 'unadopted']])
  assert.deepEqual(view.entries.filter(entry => entry.source === 'plugin').map(entry => [entry.id, entry.state]).slice(0, 2), [['loops.deps-after-merge', 'waiting'], ['loops.remind-waiting', 'active']])
  assert.deepEqual(view.attention, ['「重启之后查一下服务」在这台电脑上没有你同意的记录，先不跑'])
  assert.deepEqual((await recordsOf({ store: openLoopStore(fixture.root) })).map(record => [record.op, record.id]), [['adopt', A]])
  assert.equal(fixture.health().status, 'active', 'an entry that is not adopted is for the person to see, not a fault of the row')
})

rowTest('view.json is written when its content changes and at most every 2 seconds: a change that comes sooner waits, and the same content is not written again', async (fixture) => {
  await agreed(fixture, tellEntry(A))
  await fixture.runtime.create()
  assert.equal((await viewOf(fixture.root)).entries.find(entry => entry.id === A)?.state, 'ok')
  await fixture.run(`delete ${A}`)
  assert.equal((await viewOf(fixture.root)).entries.find(entry => entry.id === A)?.state, 'ok', 'the change is a moment too soon: it waits')
  assert.deepEqual(fixture.delayed.map(entry => entry.ms), [2_000])
  fixture.delayed[0]?.run()
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.equal((await viewOf(fixture.root)).entries.find(entry => entry.id === A)?.state, 'deleted')
  assert.equal((await viewOf(fixture.root)).entries.find(entry => entry.id === A)?.note, `要恢复：在输入框打 /loops restore ${A}`)
  const written = await readFile(join(fixture.root, '.llm', 'loops', 'view.json'), 'utf8')
  await fixture.runtime.create()
  assert.deepEqual(fixture.delayed, [], 'the same content: nothing to write, nothing to wait for')
  assert.equal(await readFile(join(fixture.root, '.llm', 'loops', 'view.json'), 'utf8'), written)
})

/** A `loop-done` event of the project's metrics journal, where the run records are. */
const doneEvent = (entry: string, run: string, at: string, outcome: string, more: { readonly reason?: string, readonly exits?: readonly number[] } = {}): EmittedEvent =>
  ({ k: 'loop-done', by: 'loops', at, body: { entry, run, outcome, ...more } })

rowTest('view.json carries what the runtime kept: each entry\'s last run in the page\'s words, the main agent\'s line, how many things wait, and the last runs newest first', async (fixture) => {
  await agreed(fixture, tellEntry(A), scriptEntry(B))
  const runtimeDir = join(fixture.root, '.llm', 'loops')
  await writeFile(join(runtimeDir, 'state.json'), JSON.stringify({
    last: {
      [A]: { run: 'run-0000000000a1', at: '2026-11-01T09:00:00.000Z', outcome: 'delivered' },
      [B]: { run: 'run-0000000000b1', at: '2026-11-01T10:00:00.000Z', outcome: 'reported' },
    },
    passing: { [B]: false },
    holder: { state: 'archived', reason: 'holder-archived', session: 'sess-main', at: '2026-11-01T08:00:00.000Z' },
    held: [{ at: '2026-11-01T09:00:00.000Z', entry: A, run: 'run-0000000000a1', title: '每周五看一眼没合入的分支', text: 'Weekly.', wake: true, reason: 'holder-archived' }],
  }))
  const written = await appendEvents(fixture.root, [
    doneEvent(A, 'run-0000000000a1', '2026-11-01T09:00:00.000Z', 'held', { reason: 'holder-archived' }),
    { k: 'loop-holder', by: 'loops', at: '2026-11-01T09:00:00.000Z', body: { state: 'archived' } },
    { k: 'loop-duplicate', by: 'loops', at: '2026-11-01T09:30:00.000Z', body: { event: 'loops.host-restarted', key: 'host-restarted:p:1', from: 'loops', firstSeen: '2026-11-01T09:29:00.000Z' } },
    doneEvent(B, 'run-0000000000b1', '2026-11-01T10:00:00.000Z', 'reported', { exits: [1] }),
    { k: 'loop-task-delete', by: 'loops', at: '2026-11-01T10:30:00.000Z', body: { entry: A, scheduleId: 'task-1', why: 'holder-archived', deleted: true } },
  ])
  assert.equal(written.rejected, 0, 'the journal takes every fixture event')
  await fixture.runtime.create()
  const view = await viewOf(fixture.root)
  const entry = (id: string) => view.entries.find(item => item.id === id)
  assert.deepEqual(entry(A)?.last, { at: '2026-11-01T09:00:00.000Z', outcome: 'delivered', text: '已交给主 Agent' })
  assert.deepEqual(entry(B)?.last, { at: '2026-11-01T10:00:00.000Z', outcome: 'reported', text: '没过，已告诉主 Agent' })
  assert.deepEqual([entry(A)?.trigger, entry(A)?.when, entry(A)?.does, entry(A)?.from], ['time', `每周五 17:00${zoneOf('Asia/Shanghai')}`, '告诉主 Agent', '你在对话里加的：「好，每周五提醒我看一眼」'])
  assert.equal(entry(A)?.next, nextOccurrence(tellEntry(A).when, new Date(NOW), Intl.DateTimeFormat().resolvedOptions().timeZone)?.toISOString())
  assert.deepEqual([entry(B)?.trigger, entry(B)?.does, entry(B)?.next], ['event', `跑脚本 docs/loops/scripts/${B}.mjs，没过才告诉主 Agent`, undefined])
  assert.deepEqual(view.holder, { line: '主 Agent 的会话已归档：在一个会话里打 /wish here', session: 'sess-main' })
  assert.equal(view.waiting, 1)
  assert.deepEqual(view.recent, [
    { at: '2026-11-01T10:30:00.000Z', title: '每周五看一眼没合入的分支', text: '删掉了 DSH 里的旧提醒（主 Agent 的会话已归档）' },
    { at: '2026-11-01T10:00:00.000Z', title: '重启之后查一下服务', text: '没过，已告诉主 Agent' },
    { at: '2026-11-01T09:30:00.000Z', title: 'DSH 重新启动了', text: '同一件事又报了一次，没再跑' },
    { at: '2026-11-01T09:00:00.000Z', title: '每周五看一眼没合入的分支', text: '先存着' },
  ])
})

rowTest('after every beat of a project it runs the row writes view.json again, so a run recorded since shows among the last runs', async (fixture) => {
  await agreed(fixture, tellEntry(A))
  await fixture.runtime.create()
  assert.deepEqual((await viewOf(fixture.root)).recent, [])
  await appendEvents(fixture.root, [doneEvent(A, 'run-0000000000a2', '2026-11-02T00:30:00.000Z', 'delivered')])
  fixture.beats[0]?.run()
  // The beat's write comes less than 2 seconds after the last one on this fixed clock: it waits for its timer.
  for (let tries = 0; tries < 100 && !fixture.delayed.some(entry => entry.ms === 2_000); tries++) await new Promise(resolve => setTimeout(resolve, 20))
  fixture.delayed.find(entry => entry.ms === 2_000)?.run()
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.deepEqual((await viewOf(fixture.root)).recent, [{ at: '2026-11-02T00:30:00.000Z', title: '每周五看一眼没合入的分支', text: '已交给主 Agent' }])
})

// ---------------------------------------------------------------- health

rowTest('the row\'s health says what is wrong with a project\'s entries as long as it is: a file changed outside, a file that cannot be read, a record line that cannot be read', async (fixture) => {
  await agreed(fixture, tellEntry(A), tellEntry(B, { title: '第二项' }))
  await fixture.runtime.create()
  assert.deepEqual([fixture.health().status, fixture.health().reason.includes('命令 /loops 已注册')], ['active', true])

  await writeFile(entryFileOf(fixture.root, A), entryFileText(tellEntry(A, { title: '被改过' })))
  await writeFile(entryFileOf(fixture.root, B), '')
  await fixture.runtime.create()
  const reason = fixture.health().reason
  assert.equal(fixture.health().status, 'degraded')
  assert.match(reason, /「被改过」的条目文件在循环板之外被改过，先不跑/)
  assert.match(reason, new RegExp(`「第二项」的条目文件读不出，先不跑：打 /loops restore ${B}`))

  await fixture.run(`restore ${A}`)
  await fixture.run(`restore ${B}`)
  assert.equal(fixture.health().status, 'active')
  await appendFile(join(fixture.root, '.llm', 'loops', 'journal.jsonl'), 'garbage\n')
  await fixture.runtime.create()
  assert.match(fixture.health().reason, /变更记录第 \d+ 行读不出/)
  await fixture.run('ack')
  assert.equal(fixture.health().status, 'active')
})

// ---------------------------------------------------------------- projection

rowTest('the session projection hournessLoops is registered once the registry is there, answers where the project\'s view.json is, and no event changes it', ({ projections, root, health }) => {
  assert.deepEqual(projections.map(unit => unit.key), [LOOPS_KEY])
  assert.equal(LOOPS_KEY, 'hournessLoops')
  const [unit] = projections
  const state = unit.init({ id: 's', cwd: root })
  assert.deepEqual(state, { projectKey: projectKey(root), viewFile: join(root, '.llm', 'loops', 'view.json') })
  assert.equal(unit.apply(state), state, 'the same reference: the host does no work')
  assert.deepEqual(unit.init({ id: 's' }), { projectKey: null, viewFile: null })
  assert.deepEqual(unit.init({ id: 's', cwd: join(root, '..') }), { projectKey: null, viewFile: null }, 'not a git project')
  assert.deepEqual(unit.init(42), { projectKey: null, viewFile: null })
  assert.equal(health().reason.includes(`会话投影 ${LOOPS_KEY} 已注册`), true)
})

rowTest('until the session projection registry is there the row is partly in effect and says so', ({ health, projections, provideProjections }) => {
  assert.equal(health().status, 'degraded')
  assert.match(health().reason, /会话投影 hournessLoops 等 sessionProjections 服务/)
  assert.deepEqual(projections, [])
  provideProjections()
  assert.equal(health().status, 'active')
  assert.equal(projections.length, 1)
}, { projections: false })

// ------------------------------------------------------ a host that lacks a part

for (const [part, said] of [['commands', /宿主没有 commands，\/loops 注册不了/], ['on', /宿主没有 on，loops:files-only 装不上，没有什么拦着别人写循环板的文件/]] as const) {
  rowTest(`a host without ${part} does not stop the row: it still provides the service, and the health says what is missing`, ({ health, runtime }) => {
    assert.equal(health().status, 'degraded')
    assert.match(health().reason, said)
    assert.ok(loopsService(runtime.ctx) !== undefined)
  }, { without: [part] })
}

rowTest('a host without inject keeps the row and its gate, and says that this process hands out no service and runs nothing', ({ health, runtime }) => {
  // The service and the running of entries live inside ctx.inject(['sessionController']) (design §3.1, §6.1).
  assert.equal(health().status, 'degraded')
  assert.match(health().reason, /宿主没有 inject，会话投影未注册/)
  assert.match(health().reason, /宿主没有 inject，这个进程不提供循环板的服务/)
  assert.equal(loopsService(runtime.ctx), undefined)
}, { without: ['inject'] })

rowTest('without a session controller the row registers everything and says it runs nothing; when one arrives it hands the service out and beats', ({ health, runtime, controller, beats }) => {
  assert.equal(loopsService(runtime.ctx), undefined, 'a process that cannot reach a session hands out no service')
  assert.equal(health().status, 'active', 'that is not a fault: headless and the probe are like this (design §11.1)')
  assert.match(health().reason, /这个进程不跑循环板（没有会话控制器）/)
  assert.equal(beats.length, 0)
  controller(true)
  assert.ok(loopsService(runtime.ctx) !== undefined)
  assert.equal(beats.length, 1)
  assert.equal(beats[0]?.ms, 60_000)
  assert.match(health().reason, /glmHournessLoops 已就绪/)
  controller(false)
  assert.equal(loopsService(runtime.ctx), undefined, 'the service and the beat leave with the controller')
  assert.equal(beats.length, 0)
}, { controller: false })

rowTest('the main agent walking a step leaves the two notes of the walk, and a step with no reminder of the board gets no line', async ({ root, runtime }) => {
  // The holder record of this project names the fake agent's session, as /wish would have left it.
  const file = holderFileOf(join(root, 'user'), join(root, 'docs', 'graph'))
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify({ version: 1, sessionId: runtime.agent.id, graphDir: join(root, 'docs', 'graph'), since: new Date(NOW - 3_600_000).toISOString(), commandId: 'command-1' })}\n`)
  await runtime.create()
  const mainStep = join(root, '.llm', 'loops', 'main-step.json')
  const lastStep = machineStepFile(join(root, 'user'))
  // A step that admits a message of its own: installStepNotice does not build on an empty first step.
  const step = { messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }], step: 2 }
  await runtime.preStep(step)
  const note = JSON.parse(await readFile(mainStep, 'utf8')) as StepNote
  const machine = JSON.parse(await readFile(lastStep, 'utf8')) as MachineStepNote
  assert.equal(note.session, runtime.agent.id)
  assert.equal(machine.projectKey, projectKey(root))
  assert.equal(machine.project, root)
  assert.equal(STEP_NOTE_MS, 60_000)
  // A step with no reminder of the board's in it gets no line: the step keeps exactly the messages it admitted.
  const plain = await runtime.preStep(step)
  assert.equal(plain.messages.length, step.messages.length)
  assert.equal(JSON.stringify(plain.messages).includes(LOOP_STEP_SOURCE), false)
})
