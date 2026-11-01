/**
 * The memory row on the fake rc.3 host (M5 design §2.3, §3.3, §3.7, §7;
 * acceptance m5-2, m5-5 first half): the tools it registers and the events
 * it listens to (none of them gates a tool call), the memory index a root
 * agent starts with, the tool face of a delegated child, `/memory`, the
 * projection, the service the dialect reads the reporting depth from, and
 * the row health. The journals are real files in temporary directories.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { openEngine } from '../src/graph/engine.ts'
import { loadGraph } from '../src/graph/store.ts'
import { apply, INDEX_SOURCE, inject, MEMORY_PROJECTION, name, type MemoryContext } from '../src/memory/index.ts'
import { journalFile } from '../src/memory/storage.ts'
import { MEMORY_STORE_EXAMPLE } from '../src/memory/tools.ts'
import { collectHealth } from '../src/shared/health.ts'
import { MEMORY_SERVICE, memoryService } from '../src/shared/memory-service.ts'
import { LEARNING_TOOL_NAMES, MEMORY_TOOL_NAMES } from '../src/shared/tool-names.ts'
import { fakeRuntime } from './fake-rc3.ts'
import { captureWarnings } from './graph-helpers.ts'
import { rowHealth, withRow, type Row } from './memory-row-host.ts'
import { createChild, failRegistration } from './row-host.ts'
import { skipIfTempInsideGit } from './temp-outside-git.ts'

const PREFERENCE = { ...MEMORY_STORE_EXAMPLE }
const FACT = {
  name: 'signing-rules-differ',
  type: 'project',
  description: 'coding-plan and start-plan sign requests differently',
  body: 'The two tiers sign differently.\n**Why:** a request signed the wrong way is refused.',
  source: ['docs/DESIGN.md'],
}

/** The row needs a folder outside git for the session's working directory. */
const skip = skipIfTempInsideGit()

const refused = async (promise: Promise<unknown>): Promise<{ code: string, message: string }> => {
  try {
    await promise
  }
  catch (error) {
    return JSON.parse((error as Error).message) as { code: string, message: string }
  }
  return assert.fail('expected a refusal')
}

test('the row is a cordis plugin that needs the tools service; it registers the three memory tools and the learning tool, gates no tool call and listens to nothing else than agent creation and model calls', { skip }, async () => {
  await withRow((row) => {
    assert.equal(name, 'dsh-glm-hourness/memory')
    assert.deepEqual(inject, ['tools'])
    assert.deepEqual(row.runtime.scoped.map(tool => tool.name), [...MEMORY_TOOL_NAMES, ...LEARNING_TOOL_NAMES])
    const events = new Set(row.runtime.listeners.map(entry => entry.event))
    assert.deepEqual([...events].sort(), ['agent/created', 'agent/pre-step', 'llm/stream'])
    assert.ok(!events.has('tools/pre-execute'), 'the memory row blocks no tool call (d-code-rules-enforce: it registers no rule)')
    assert.ok(!events.has('tools/post-execute'))
    assert.ok(row.commands.has('memory') && row.projections.length === 1 && row.runtime.services.has(MEMORY_SERVICE))
  })
})

test('disposing the row withdraws its tools, listeners, service and health', { skip }, async () => {
  await withRow(async (row) => {
    await row.step()
    row.dispose()
    assert.deepEqual(row.runtime.scoped, [])
    assert.deepEqual(row.runtime.listeners, [])
    assert.ok(!row.runtime.services.has(MEMORY_SERVICE))
    assert.ok(![...row.runtime.services.keys()].some(key => key.startsWith('glmHournessHealth/memory')))
  })
})
test('the command and the projection follow their services: absent at the start they are registered when the services arrive, and withdrawn when they leave', { skip }, async () => {
  await withRow(async (row) => {
    assert.equal(row.commands.size + row.projections.length, 0)
    const waiting = collectHealth(row.runtime.ctx, undefined).find(entry => entry.row === 'memory')!
    assert.equal(waiting.status, 'degraded')
    assert.ok(waiting.reason.includes('命令 /memory 等 commands 服务') && waiting.reason.includes('会话投影 hournessMemory 等 sessionProjections 服务'), waiting.reason)
    assert.equal((await row.tool('memory_store', PREFERENCE)).stored, true, 'the tools work without them')
    row.services.provide()
    assert.ok(row.commands.has('memory') && row.projections.length === 1)
    assert.equal(collectHealth(row.runtime.ctx, undefined).find(entry => entry.row === 'memory')!.status, 'idle', 'in effect, and not acted in a session yet')
    row.services.remove()
    assert.equal(row.commands.size + row.projections.length, 0)
    assert.equal(collectHealth(row.runtime.ctx, undefined).find(entry => entry.row === 'memory')!.status, 'degraded')
  }, { late: true })
})

test('an empty memory gives no index at the start; the first write gives one at the next step, and later steps none', { skip }, async () => {
  await withRow(async (row) => {
    assert.deepEqual(await row.step(), [])
    assert.equal((await row.tool('memory_store', PREFERENCE)).stored, true)
    const [notice, ...more] = await row.step()
    assert.equal(more.length, 0)
    assert.equal(notice?.source.kind, INDEX_SOURCE)
    assert.equal(notice?.source.form, 'notice')
    assert.equal(notice?.source.entries, 1)
    assert.equal(typeof notice?.source.digest, 'string')
    assert.ok(notice?.content[0].text.startsWith('<system-reminder>\nContents of the memory index'))
    assert.ok(notice?.content[0].text.includes('- lead-with-the-answer (feedback) — Start every reply with the answer; keep jargon out'))
    assert.deepEqual(await row.step(), [], 'the index is in the history, so it is not repeated')
  })
})

test('a session that starts with memories gets the index on its first step, preferences first, and again after a compaction removed it', { skip }, async () => {
  await withRow(async (row) => {
    await row.tool('memory_store', FACT)
    await row.tool('memory_store', PREFERENCE)
    const [first] = await row.step()
    const text = first?.content[0].text ?? ''
    assert.ok(text.indexOf('lead-with-the-answer') < text.indexOf('signing-rules-differ'), 'the preference is listed before the fact')
    assert.ok(text.includes('[source: docs/DESIGN.md]'))
    assert.deepEqual(await row.step(), [])
    row.runtime.history.length = 0 // a compaction replaced the history
    assert.equal((await row.step()).length, 1)
  })
})

test('a memory journal that cannot be read does not stop the step: the index is built from what can be read and the health says what is wrong', { skip }, async () => {
  await withRow(async (row) => {
    await row.tool('memory_store', FACT)
    mkdirSync(join(row.userDir, 'memory.jsonl'), { recursive: true }) // a directory where the journal should be
    const notices = await row.step()
    assert.equal(notices.length, 1)
    assert.ok(notices[0]?.content[0].text.includes('signing-rules-differ'))
    const health = rowHealth(row)
    assert.equal(health.status, 'degraded')
    assert.ok(health.reason.includes('用户级记忆读不出'), health.reason)
    assert.ok(health.reason.includes('索引不全'), health.reason)
  })
})

test('a delegated child loses the memory tools and the learning tool from its request and gets no index and no reminder; calling a tool by name is refused', { skip }, async () => {
  await withRow(async (row) => {
    const { child, stepListenersAdded } = await createChild(row.runtime)
    assert.equal(stepListenersAdded, 0, 'no index listener and no learning reminder for a child')

    const assembled = await row.runtime.assemble({ provider: 'glm-probe', model: 'glm-5.3' })
    assert.deepEqual(assembled.tools.map(tool => tool.name), ['pwsh'], 'the memory tools and the learning tool are not in the child\'s face')
    for (const [callId, name, args] of [['c1', 'memory_store', PREFERENCE], ['c2', 'learning_signals', {}]] as const) {
      const result = await row.runtime.ctx.tools.execute({ callId, name, arguments: args, agent: child, signal: new AbortController().signal })
      assert.equal(result.isError, true, name)
      assert.ok(result.content[0]?.text?.includes('"code":"role"') === true, name)
    }
    assert.ok(!existsSync(journalFile(row.userDir)))
  })
})

test('a root agent keeps the memory tools and the learning tool in its request', { skip }, async () => {
  await withRow(async (row) => {
    const assembled = await row.runtime.assemble({ provider: 'glm-probe', model: 'glm-5.3' })
    assert.deepEqual(assembled.tools.map(tool => tool.name).sort(), ['learning_signals', 'memory_forget', 'memory_query', 'memory_store', 'pwsh'])
  })
})

test('/memory show lists the counts and the latest entries, and marks the words that were not checked', { skip }, async () => {
  await withRow(async (row) => {
    await row.tool('memory_store', PREFERENCE)
    await row.tool('memory_store', FACT)
    const shown = await row.run('show')
    assert.equal(shown.kind, 'success')
    assert.ok(shown.text?.includes('本项目：偏好 0 条，事实 1 条，已忘掉 0 条'), shown.text ?? '')
    assert.ok(shown.text?.includes('关于你的（所有项目）：偏好 1 条，事实 0 条'), shown.text ?? '')
    assert.ok(shown.text?.includes('- lead-with-the-answer（feedback，关于你的（所有项目））：Start every reply with the answer; keep jargon out [原话未核对]'), shown.text ?? '')
    assert.ok(shown.text?.includes('- signing-rules-differ（project，本项目）'), shown.text ?? '')
  })
})

test('/memory forget works as the person on a preference without any words, and restore brings it back; the journal keeps the command', { skip }, async () => {
  await withRow(async (row) => {
    await row.tool('memory_store', PREFERENCE)
    assert.equal((await row.run('forget lead-with-the-answer')).text, '已忘掉「lead-with-the-answer」（关于你的（所有项目））。')
    const lines = readFileSync(journalFile(row.userDir), 'utf8').trim().split('\n').map(line => JSON.parse(line) as { op: string, actor: string, by?: Record<string, string> })
    assert.deepEqual(lines.map(line => [line.op, line.actor]), [['store', 'llm'], ['forget', 'human']])
    assert.deepEqual(lines[1]?.by, { session: 'agent-1', agent: 'agent-1', commandId: 'cmd-1' })
    assert.equal((await row.run('forget lead-with-the-answer')).kind, 'error', 'it is forgotten already')
    assert.equal((await row.run('restore lead-with-the-answer all')).text, '已找回「lead-with-the-answer」（关于你的（所有项目））。')
    assert.equal((await row.run('restore lead-with-the-answer')).kind, 'error', 'it is not forgotten any more')
    assert.deepEqual(((await row.tool('memory_query', { name: 'lead-with-the-answer' })).matches as Array<{ name: string }>).map(match => match.name), ['lead-with-the-answer'])
  })
})

test('/memory says how to use it when the input is not one of the forms', { skip }, async () => {
  await withRow(async (row) => {
    for (const input of ['', 'list', 'forget', 'forget a b c', 'restore x elsewhere', 'show now']) {
      const result = await row.run(input)
      assert.equal(result.kind, 'error', input)
      assert.ok(result.text?.startsWith('用法：/memory show'), `${input}: ${result.text}`)
    }
    assert.equal((await row.run('forget nothing-here')).text, '没有叫「nothing-here」的记忆。/memory show 能看到现有的。')
  })
})

test('the projection gives the panel the paths of the two journals of a session, and null where the session has none', { skip }, async () => {
  await withRow((row) => {
    const [projection] = row.projections
    assert.equal(projection?.key, MEMORY_PROJECTION)
    const state = projection?.init({ id: 's', cwd: row.work }, 0)
    assert.deepEqual(state, { projectJournal: join(row.project, 'memory.jsonl'), userJournal: join(row.userDir, 'memory.jsonl') })
    assert.deepEqual(projection?.stateSchema.parse(state), state)
    assert.throws(() => projection?.stateSchema.parse({ projectJournal: 1, userJournal: null }), /projectJournal/)
    assert.equal((projection?.apply as (state: unknown) => unknown)(state), state)
    assert.equal((projection?.wire?.view as (state: unknown) => unknown)(state), state)
  })
  await withRow((row) => {
    assert.deepEqual(row.projections[0]?.init({ id: 's' }, 0), { projectJournal: null, userJournal: null })
  }, { noData: true, noProject: true })
})

test('the service gives a session the reporting depth it found when it first asked, and a new session the latest', { skip }, async () => {
  await withRow(async (row) => {
    const reader = memoryService(row.runtime.ctx)
    assert.equal(reader, row.service)
    assert.equal(reader?.depth('first'), undefined, 'no preference yet')
    const words = { name: 'reporting-depth', type: 'user', description: 'Short reports', body: 'Keep reports short.\n**Why:** a phone.', value: 'concise', relay: 'From now on just the key points.' }
    await row.tool('memory_store', words)
    assert.equal(reader?.depth('first'), undefined, 'the session keeps what it found')
    assert.equal(reader?.depth('second'), 'concise', 'the first ask reads the journal at once, with an empty cache')
    await row.tool('memory_store', { ...words, value: 'detailed', relay: 'More detail, please.' })
    assert.equal(reader?.depth('second'), 'concise')
    assert.equal(reader?.depth('third'), 'detailed')
    await row.tool('memory_forget', { name: 'reporting-depth', reason: 'the person asked', relay: 'Back to the default.' })
    assert.equal(reader?.depth('third'), 'detailed')
    assert.equal(reader?.depth('fourth'), undefined)
  })
})

test('the service remembers 500 sessions at most, the oldest first', { skip }, async () => {
  await withRow(async (row) => {
    await row.tool('memory_store', { name: 'reporting-depth', type: 'user', description: 'Short reports', body: 'Short.', value: 'concise', relay: 'Key points.' })
    assert.equal(row.service.depth('oldest'), 'concise')
    await row.tool('memory_forget', { name: 'reporting-depth', reason: 'reset', relay: 'Default again.' })
    for (let index = 0; index < 500; index += 1) row.service.depth(`filler-${index}`)
    assert.equal(row.service.depth('oldest'), undefined, 'asked again after it left the cache, it reads the journal again')
  })
})

test('a reporting depth that cannot be read gives none and warns once', { skip }, async () => {
  await withRow(async (row) => {
    mkdirSync(join(row.userDir, 'memory.jsonl'), { recursive: true })
    const { result, warnings } = await captureWarnings(() => [row.service.depth('a'), row.service.depth('b')])
    assert.deepEqual(result, [undefined, undefined])
    assert.equal(warnings.length, 1)
    assert.ok(warnings[0]?.includes('读不出汇报细度'), warnings[0])
  })
})

test('a reporting depth that cannot be read shows in the row health of the session that asked, and only there', { skip }, async () => {
  await withRow(async (row) => {
    mkdirSync(join(row.userDir, 'memory.jsonl'), { recursive: true })
    await captureWarnings(() => row.service.depth('another-session'))
    await row.step()
    assert.ok(!rowHealth(row).reason.includes('读不出汇报细度'), rowHealth(row).reason)
    await captureWarnings(() => row.service.depth('agent-1'))
    await row.step()
    const health = rowHealth(row)
    assert.equal(health.status, 'degraded')
    assert.ok(health.reason.includes('读不出汇报细度'), health.reason)
    assert.ok(health.reason.includes('配置的默认档'), health.reason)
  })
})

test('stats count what a period added and took out; the period decides', { skip }, async () => {
  await withRow(async (row) => {
    await row.tool('memory_store', PREFERENCE)
    await row.tool('memory_store', { ...PREFERENCE, name: 'another-habit', description: 'Another way to work', relay: 'Do it my way.' })
    await row.tool('memory_store', FACT)
    await row.tool('memory_store', { name: 'reporting-depth', type: 'user', description: 'Short reports', body: 'Short.', value: 'concise', relay: 'Key points.' })
    await row.tool('memory_forget', { name: 'another-habit', reason: 'not needed', relay: 'Forget it.' })
    const session = row.runtime.agent.session
    assert.deepEqual(await row.service.stats(session, '2000-01-01T00:00:00Z', '2100-01-01T00:00:00Z'), { preferencesAdded: 3, factsAdded: 1, forgotten: 1, reportingDepthChanges: 1 })
    assert.deepEqual(await row.service.stats(session, '2000-01-01T00:00:00Z', '2001-01-01T00:00:00Z'), { preferencesAdded: 0, factsAdded: 0, forgotten: 0, reportingDepthChanges: 0 })
  })
})

test('hygiene lists a migrated entry without a source, a fact that faded long ago, a source that is gone, a dropped source node and the unreadable lines', { skip }, async () => {
  await withRow(async (row) => {
    const day = 86_400_000
    const longAgo = new Date(Date.now() - 200 * day).toISOString()
    mkdirSync(row.project, { recursive: true })
    writeFileSync(join(row.project, 'memory.json'), JSON.stringify({ version: 1, entries: [{ id: 'old-note', text: 'An old note', tags: [], created: longAgo, lastReviewed: longAgo, reviews: 0 }] }))
    await row.tool('memory_store', FACT)
    const graphDir = join(row.work, 'docs', 'graph')
    const engine = openEngine(graphDir)
    assert.ok((await engine.apply('human', { op: 'propose', reason: 'seed', node: { type: 'goal', title: '目标' } })).ok)
    row.runtime.services.set('glmHournessGraph', { dirFor: () => graphDir, isGraphTool: () => false })
    await row.tool('memory_store', { ...FACT, name: 'node-fact', description: 'a fact that names a node', source: ['goal-1'] })
    const session = row.runtime.agent.session
    const kinds = async (now: number) => (await row.service.hygiene(session, new Date(now).toISOString())).map(finding => `${finding.kind}:${finding.name ?? ''}`).sort()
    assert.deepEqual(await kinds(Date.now()), ['faded:old-note', 'legacy:old-note'])
    rmSync(join(row.work, 'docs', 'DESIGN.md'))
    appendBad(row)
    assert.deepEqual(await kinds(Date.now() + 200 * day), ['bad-lines:', 'faded:node-fact', 'faded:old-note', 'faded:signing-rules-differ', 'legacy:old-note', 'source-missing:signing-rules-differ'])
    const dropped = await engine.apply('human', { op: 'status', id: 'goal-1', rev: (await loadGraph(graphDir)).revisions.get('goal-1'), to: 'dropped', reason: 'not needed' })
    assert.ok(dropped.ok, JSON.stringify(dropped))
    assert.ok((await kinds(Date.now())).includes('source-dead:node-fact'))
  })
})
function appendBad(row: Row): void {
  writeFileSync(journalFile(row.project), `${readFileSync(journalFile(row.project), 'utf8')}not a record\n`)
}

test('the row health tells the directories, the counts and whether the index is in; a configured home is said to be ignored and changes nothing', { skip }, async () => {
  await withRow(async (row) => {
    await row.tool('memory_store', PREFERENCE)
    await row.step()
    const health = rowHealth(row)
    assert.equal(health.status, 'active')
    assert.ok(health.reason.includes(`项目 ${row.project}（偏好 0、事实 0）`), health.reason)
    assert.ok(health.reason.includes(`用户级 ${row.userDir}（偏好 1、事实 0）`), health.reason)
    assert.ok(health.reason.includes('本会话已带索引'), health.reason)
    assert.ok(health.reason.includes('行配置 home 已不再使用（M5），项目目录跟会话的工作区'), health.reason)
    await row.tool('memory_store', FACT)
    assert.ok(existsSync(journalFile(row.project)), 'the project memory is in the directory of the session, not in the configured home')
    assert.ok(!existsSync(join(row.root, 'elsewhere', 'memory.jsonl')))
  }, { config: { home: 'elsewhere' } })
})

test('the row health says what is missing: no data row, no project, bad lines', { skip }, async () => {
  await withRow(async (row) => {
    await row.step()
    const health = rowHealth(row)
    assert.equal(health.status, 'degraded')
    assert.ok(health.reason.includes('数据目录行未启用：用户级的记忆不可用，用量不记录'), health.reason)
    assert.ok(health.reason.includes('这个文件夹不是项目'), health.reason)
  }, { noData: true, noProject: true })
  await withRow(async (row) => {
    await row.tool('memory_store', FACT)
    appendBad(row)
    await row.step()
    const health = rowHealth(row)
    assert.equal(health.status, 'degraded')
    assert.ok(health.reason.includes('项目流水有 1 行读不出'), health.reason)
  })
})

test('a write that failed shows in the health of its session until a write succeeds', { skip }, async () => {
  await withRow(async (row) => {
    mkdirSync(join(row.project, 'memory.json'), { recursive: true }) // an old file that cannot be read as one
    assert.equal((await refused(row.tool('memory_store', FACT))).code, 'io')
    await row.step()
    assert.ok(rowHealth(row).reason.includes('旧记忆文件读不出'), rowHealth(row).reason)
    rmSync(join(row.project, 'memory.json'), { recursive: true })
    await row.tool('memory_store', FACT)
    await row.step()
    assert.equal(rowHealth(row).status, 'active')
  })
})

test('the optional services arriving late or never: the tools and the index work, and the health says what is off', { skip }, async () => {
  const { warnings } = await captureWarnings(() => withRow(async (row) => {
    assert.equal((await row.tool('memory_store', PREFERENCE)).stored, true)
    assert.equal((await row.step()).length, 1)
    const activation = collectHealth(row.runtime.ctx, undefined).find(entry => entry.row === 'memory')!
    assert.equal(activation.status, 'degraded')
    assert.ok(activation.reason.includes('宿主没有 inject，没有注册命令 /memory'), activation.reason)
    assert.ok(activation.reason.includes('宿主没有 inject，没有注册会话投影 hournessMemory'), activation.reason)
  }, { bare: true }))
  assert.deepEqual(warnings.filter(text => text.includes('dsh-glm-hourness/memory')), [])
})

test('activation does not throw when a tool cannot be registered: the tools that were registered are withdrawn and the row says why', { skip }, async () => {
  const runtime = fakeRuntime({ natives: ['pwsh'] })
  failRegistration(runtime, 2, 'name taken')

  const { warnings, result: dispose } = await captureWarnings(() => apply(runtime.ctx as unknown as MemoryContext))
  assert.deepEqual(runtime.scoped, [])
  assert.equal(warnings.length, 1)
  assert.ok(warnings[0]?.includes('name taken'))
  const health = collectHealth(runtime.ctx, undefined).find(entry => entry.row === 'memory')!
  assert.equal(health.status, 'inactive')
  assert.ok(health.reason.includes('记忆工具注册失败'))
  dispose()
})
