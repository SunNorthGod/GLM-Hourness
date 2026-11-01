/**
 * The learning pipeline on the memory row, on the fake rc.3 host (M5 design
 * §3.6 step 2, acceptance m5-4 items 1 to 3 as far as they need no habits):
 * the read-only tool `learning_signals`, the service member
 * `learningDigest`, and the digest reminder of the main agent, with the
 * graph written by the real engine and the journals real files.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { openEngine } from '../src/graph/engine.ts'
import { loadGraph } from '../src/graph/store.ts'
import { LEARNING_SOURCE } from '../src/memory/notices.ts'
import { journalFile } from '../src/memory/storage.ts'
import { MEMORY_STORE_EXAMPLE } from '../src/memory/tools.ts'
import type { UserNotice } from '../src/shared/dsh-min.ts'
import { refusalOf } from './memory-helpers.ts'
import { rowHealth, withRow, type Row } from './memory-row-host.ts'
import { skipIfTempInsideGit } from './temp-outside-git.ts'

const skip = skipIfTempInsideGit()

const MINUTE = 60_000
const DAY = 86_400_000
const T0 = new Date('2026-11-10T12:00:00Z')
const later = (ms: number): Date => new Date(T0.getTime() + ms)
const FIVE_DAYS_BEFORE = later(-5 * DAY)

/** What the person does to the agent's work, written by the real engine with a clock that starts at `from`: `edits` changes of the acceptance of a task the agent wrote, `rejects` rejections of a feature it proposed. */
async function personActs(graphDir: string, from: Date, acts: { readonly edits?: number, readonly rejects?: number }): Promise<void> {
  let tick = 0
  const engine = openEngine(graphDir, { now: () => new Date(from.getTime() + tick++ * 1000) })
  const must = async (actor: 'human' | 'llm', mutation: Record<string, unknown>) => {
    const result = await engine.apply(actor, mutation)
    assert.ok(result.ok, JSON.stringify(result))
    return result
  }
  if (!(await loadGraph(graphDir)).nodes.has('goal-1')) {
    await must('human', { op: 'propose', reason: 'goal', node: { type: 'goal', title: 'the project', stage: 'design', acceptance: ['it works'] } })
    await must('human', { op: 'propose', reason: 'split', node: { type: 'feature', title: 'the feature', parent: 'goal-1' } })
  }
  for (let index = 0; index < (acts.edits ?? 0); index += 1) {
    const task = await must('llm', { op: 'propose', reason: 'plan', node: { type: 'task', title: 'a task', parent: 'feature-1', acceptance: ['first version'] } })
    await must('human', { op: 'edit', id: task.id, rev: task.rev, reason: 'tighter', set: { acceptance: ['the person\'s version'] } })
  }
  for (let index = 0; index < (acts.rejects ?? 0); index += 1) {
    const feature = await must('llm', { op: 'propose', reason: 'new branch', node: { type: 'feature', title: 'a branch', parent: 'goal-1' } })
    await must('human', { op: 'reject', id: feature.id, rev: feature.rev, reason: 'no' })
  }
}

const journalLines = (dir: string): Array<Record<string, unknown>> => {
  const file = journalFile(dir)
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(line => line !== '').map(line => JSON.parse(line) as Record<string, unknown>) : []
}

const reminders = (notices: readonly UserNotice[]): UserNotice[] => notices.filter(notice => notice.source.kind === LEARNING_SOURCE)
const KEY = 'edit:task.acceptance'

test('the reminder reaches the main agent once, after its record; the next step, a compaction and the health find nothing to repeat', { skip }, async () => {
  await withRow(async (row) => {
    await personActs(row.graphDir, FIVE_DAYS_BEFORE, { edits: 2 })
    const first = await row.step()
    assert.deepEqual(first.map(notice => notice.source.kind), [LEARNING_SOURCE])
    const text = first[0].content[0].text
    assert.ok(text.includes('Call learning_signals') && text.includes('learnedFrom'), text)
    assert.equal(first[0].source.groups, 1)
    const [record, ...more] = journalLines(row.project)
    assert.equal(more.length, 0)
    assert.deepEqual([record?.op, record?.actor, record?.id, record?.data, record?.at, record?.by], ['learn-notified', 'harness', '*', { keys: [KEY] }, T0.toISOString(), { session: 'agent-1', tool: 'learning' }])
    assert.deepEqual(await row.step(), [])
    row.runtime.history.length = 0 // a compaction replaced the history
    assert.deepEqual(await row.step(), [], 'the record says it was sent')
    assert.ok(!rowHealth(row).reason.includes('行读不出'), rowHealth(row).reason)
  }, { clock: T0, graph: 'plain' })
})

test('seven days later the same groups do not bring it again; new groups do, once the hour that follows a digest that did not qualify is over', { skip }, async () => {
  await withRow(async (row) => {
    await personActs(row.graphDir, FIVE_DAYS_BEFORE, { edits: 2 })
    assert.equal(reminders(await row.step()).length, 1)
    row.setNow(later(7 * DAY - MINUTE))
    assert.deepEqual(await row.step(), [], 'six days, 23 hours and 59 minutes')
    row.setNow(later(7 * DAY))
    assert.deepEqual(await row.step(), [], 'seven days, but the groups are the ones the last reminder named')
    assert.equal(journalLines(row.project).length, 1)
    await personActs(row.graphDir, later(6 * DAY), { rejects: 2 })
    row.setNow(later(7 * DAY + 30 * MINUTE))
    assert.deepEqual(await row.step(), [])
    row.setNow(later(7 * DAY + 61 * MINUTE))
    assert.equal(reminders(await row.step()).length, 1)
    assert.deepEqual(journalLines(row.project).map(record => record.data), [{ keys: [KEY] }, { keys: [KEY, 'reject:feature'] }])
  }, { clock: T0, graph: 'plain' })
})

test('nothing is recorded or sent while no group has enough events, and the graph is not read again for an hour', { skip }, async () => {
  await withRow(async (row) => {
    await personActs(row.graphDir, FIVE_DAYS_BEFORE, { edits: 1 })
    assert.deepEqual(await row.step(), [])
    assert.equal(journalLines(row.project).length, 0)
    const asked = row.graphAsked()
    assert.ok(asked > 0)
    assert.deepEqual(await row.step(), [])
    assert.equal(row.graphAsked(), asked)
    await personActs(row.graphDir, later(MINUTE), { edits: 1 })
    row.setNow(later(61 * MINUTE))
    assert.equal(reminders(await row.step()).length, 1)
    assert.ok(row.graphAsked() > asked)
  }, { clock: T0, graph: 'plain' })
})

test('a group settled by a preference does not bring the reminder until it comes back after the landing', { skip }, async () => {
  await withRow(async (row) => {
    await personActs(row.graphDir, FIVE_DAYS_BEFORE, { edits: 2 })
    assert.equal((await row.tool('memory_store', { ...MEMORY_STORE_EXAMPLE, learnedFrom: [KEY] })).stored, true)
    assert.deepEqual(reminders(await row.step()), [], 'one preference settles the group')
    await personActs(row.graphDir, later(DAY), { edits: 1 })
    row.setNow(later(3 * DAY))
    assert.equal(reminders(await row.step()).length, 1, 'a correction after the landing is a recurrence')
    assert.deepEqual(journalLines(row.project).map(record => record.data), [{ keys: [KEY] }])
  }, { clock: T0, graph: 'plain' })
})

test('a comment `学自：<key>` on a node settles a group as well (a rule proposal or a candidate exercise is settled that way)', { skip }, async () => {
  await withRow(async (row) => {
    await personActs(row.graphDir, FIVE_DAYS_BEFORE, { edits: 2 })
    const result = await openEngine(row.graphDir, { now: () => later(-DAY) }).apply('llm', { op: 'comment', id: 'goal-1', text: `rule proposal sent to the person. 学自：${KEY}` })
    assert.ok(result.ok)
    assert.deepEqual(reminders(await row.step()), [])
    assert.equal(journalLines(row.project).length, 0)
  }, { clock: T0, graph: 'plain' })
})

test('only the main agent of the project is told: another session that holds the role, and a holder whose mode is off, are not; the one that holds it with the mode on is, and its health has nothing to say about the role', { skip }, async () => {
  await withRow(async (row) => {
    await personActs(row.graphDir, FIVE_DAYS_BEFORE, { edits: 2 })
    row.hold('another-session')
    row.modes.set('agent-1', { active: true })
    assert.deepEqual(reminders(await row.step()), [], 'another session holds the role')
    assert.equal(journalLines(row.project).length, 0)
    row.hold('agent-1')
    row.modes.set('agent-1', { active: false })
    assert.deepEqual(reminders(await row.step()), [])
    assert.ok(rowHealth(row).reason.includes('主 Agent 模式已关'), rowHealth(row).reason)
    row.modes.set('agent-1', { active: true })
    assert.equal(reminders(await row.step()).length, 1)
    assert.equal(rowHealth(row).status, 'active', rowHealth(row).reason)
    assert.ok(!rowHealth(row).reason.includes('主 Agent'), rowHealth(row).reason)
  }, { clock: T0, graph: 'judged' })
})

test('without a record of the main agent every root agent is told, and the health says it was decided by default', { skip }, async () => {
  await withRow(async (row) => {
    await personActs(row.graphDir, FIVE_DAYS_BEFORE, { edits: 2 })
    assert.equal(reminders(await row.step()).length, 1)
    const health = rowHealth(row)
    assert.equal(health.status, 'degraded')
    assert.ok(health.reason.includes('所有根 agent 都按主 Agent 处理'), health.reason)
  }, { clock: T0, graph: 'judged' })
})

test('a record that cannot be written sends nothing and the health says so', { skip }, async () => {
  await withRow(async (row) => {
    await personActs(row.graphDir, FIVE_DAYS_BEFORE, { edits: 2 })
    assert.deepEqual(reminders(await row.step()), [])
    const health = rowHealth(row)
    assert.equal(health.status, 'degraded')
    assert.ok(health.reason.includes('学习摘要的提醒没能记下'), health.reason)
  }, { clock: T0, graph: 'plain', config: { append: { sync: () => Promise.reject(new Error('disk full')) } } })
})

test('a session without a project, and a session with no graph, are left alone', { skip }, async () => {
  await withRow(async (row) => {
    assert.deepEqual(await row.step(), [])
  }, { clock: T0, graph: 'plain', noProject: true })
  await withRow(async (row) => {
    assert.deepEqual(await row.step(), [])
    assert.equal(journalLines(row.project).length, 0)
  }, { clock: T0 })
})

const refusedWith = async (row: Row, args: unknown) => (await refusalOf(row.tool('learning_signals', args))).code

test('learning_signals answers with the groups of the window, each with where it is settled; the arguments narrow it', { skip }, async () => {
  await withRow(async (row) => {
    await personActs(row.graphDir, FIVE_DAYS_BEFORE, { edits: 2, rejects: 1 })
    const digest = await row.tool('learning_signals', {})
    assert.deepEqual(Object.keys(digest).sort(), ['graph', 'groups', 'since', 'until'])
    assert.deepEqual([digest.until, digest.since, digest.graph], [T0.toISOString(), later(-28 * DAY).toISOString(), 'ok'])
    const [group, ...rest] = digest.groups as Array<Record<string, unknown>>
    assert.equal(rest.length, 0, 'one rejection is below the default of two')
    assert.deepEqual([group?.key, group?.meaning, group?.count, group?.learned, group?.recurrences, group?.weekly], [KEY, 'the person changed the acceptance the agent had set on a task', 2, 0, 0, [0, 0, 0, 2]])
    assert.equal((group?.examples as unknown[]).length, 2)
    const wide = await row.tool('learning_signals', { minCount: 1 })
    assert.deepEqual((wide.groups as Array<{ key: string }>).map(entry => entry.key), [KEY, 'reject:feature'])
    assert.deepEqual((await row.tool('learning_signals', { since: later(-DAY).toISOString() })).groups, [])
    assert.deepEqual(await row.tool('learning_signals', undefined), digest)
    assert.deepEqual(await row.service.learningDigest(row.runtime.agent.session, {}), digest)
    assert.deepEqual(await row.service.learningDigest(row.runtime.agent.session, { minCount: 1 }), wide)
    assert.deepEqual(journalLines(row.project), [], 'the tool writes nothing')
  }, { clock: T0, graph: 'plain' })
})

test('learning_signals refuses what it cannot read: a field it does not have, a since that is not a past moment, a minCount that is not a count from 1 to 50', { skip }, async () => {
  await withRow(async (row) => {
    for (const args of [{ limit: 3 }, { since: 'last week' }, { since: later(DAY).toISOString() }, { minCount: 0 }, { minCount: 51 }, { minCount: 2.5 }, { minCount: '2' }, 'text']) {
      assert.equal(await refusedWith(row, args), 'invalid', JSON.stringify(args))
    }
    assert.equal((await row.tool('learning_signals', { minCount: 50 })).graph, 'unavailable')
  }, { clock: T0 })
})

test('a graph that cannot be read is reported and does not stop the tool: the digest says unavailable, names the reason, and the health keeps it until a read succeeds', { skip }, async () => {
  await withRow(async (row) => {
    mkdirSync(row.graphDir, { recursive: true })
    writeFileSync(join(row.graphDir, 'nodes'), 'a file where the folder of the nodes should be')
    const digest = await row.tool('learning_signals', {})
    assert.equal(digest.graph, 'unavailable')
    assert.ok((digest.notes as string[])[0]?.includes('the project graph could not be read'), JSON.stringify(digest.notes))
    await row.step()
    assert.ok(rowHealth(row).reason.includes('学习摘要的来源没读全'), rowHealth(row).reason)
  }, { clock: T0, graph: 'plain' })
  await withRow(async (row) => {
    const digest = await row.tool('learning_signals', {})
    assert.equal(digest.graph, 'unavailable')
    assert.ok(!('notes' in digest), 'no graph row is not a failure')
  }, { clock: T0 })
})

test('the depth of the reports is a signal: the step from one depth to another is a group of its own', { skip }, async () => {
  await withRow(async (row) => {
    const depth = (value: string, relay: string) => row.tool('memory_store', { name: 'reporting-depth', type: 'user', description: 'Report length', body: 'Reports.\n**Why:** the person said so.', value, relay })
    await depth('concise', 'Shorter, please.')
    row.setNow(later(MINUTE))
    await depth('detailed', 'Longer, please.')
    row.setNow(later(2 * MINUTE))
    await depth('concise', 'Shorter again.')
    row.setNow(later(3 * MINUTE))
    const digest = await row.tool('learning_signals', { minCount: 1 })
    assert.deepEqual((digest.groups as Array<{ key: string, count: number }>).map(group => [group.key, group.count]), [['depth:down', 1], ['depth:up', 1]])
  }, { clock: T0 })
})
