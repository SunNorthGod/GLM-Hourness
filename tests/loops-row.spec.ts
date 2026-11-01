/**
 * The loop row on the fake rc.3 host (docs/ORCHESTRATION.md §18; loop board
 * design §7.2, §8.4, §11.1): `/loops delete`, `restore` and `ack` as the person
 * types them and what they answer, the settling of a project's files when a
 * session starts in it, the project's `view.json`, the row's health, the
 * session projection `hournessLoops`, and what the row says when the host lacks
 * a part. The storage under it is in loops-store.spec.ts.
 */
import assert from 'node:assert/strict'
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { projectKey } from '../src/graph/main-agent-holder.ts'
import { inject, LOOPS_COMMAND, name } from '../src/loops/index.ts'
import { LOOPS_KEY } from '../src/loops/projection.ts'
import { LOOPS_DECLARATION, loopsService } from '../src/loops/service.ts'
import { NOT_A_PROJECT } from '../src/loops/commands.ts'
import { entryFileText } from '../src/loops/model.ts'
import { openLoopStore } from '../src/loops/store.ts'
import type { LoopsView } from '../src/loops/view.ts'
import { entryFileOf, quickIo, recordsOf, scriptEntry, SCRIPT_TEXT, seedAgreed, tellEntry, writeFiles } from './loops-helpers.ts'
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

rowTest('/loops with nothing, or with a word it does not know, or without its argument, answers the usage and writes nothing', async (fixture) => {
  await agreed(fixture, tellEntry(A))
  const before = await readFile(join(fixture.root, '.llm', 'loops', 'journal.jsonl'), 'utf8')
  for (const input of ['', 'frobnicate', 'delete', 'delete   ', 'restore', 'restore not-an-id', 'ack now', 'accept lp-0123abcd']) {
    const result = await fixture.run(input)
    assert.deepEqual([input, result.kind, result.text], [input, 'error', '用法：/loops delete <名字或 id>、/loops restore <id>、/loops ack'])
  }
  assert.equal(await readFile(join(fixture.root, '.llm', 'loops', 'journal.jsonl'), 'utf8'), before)
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

for (const [part, said] of [['commands', /宿主没有 commands，\/loops 注册不了/], ['on', /宿主没有 on，loops:files-only 装不上，没有什么拦着别人写循环板的文件/], ['inject', /宿主没有 inject，会话投影未注册/]] as const) {
  rowTest(`a host without ${part} does not stop the row: it still provides the service, and the health says what is missing`, ({ health, runtime }) => {
    assert.equal(health().status, 'degraded')
    assert.match(health().reason, said)
    assert.ok(loopsService(runtime.ctx) !== undefined)
  }, { without: [part] })
}
