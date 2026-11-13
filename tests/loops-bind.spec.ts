/**
 * The DSH reminders of the loop board's time entries (loop board design 0.6
 * §6.2, §11.3; docs/ORCHESTRATION.md §18.10): one reconciliation makes, moves,
 * puts back, takes in and removes reminders, and the removal is the part that
 * cannot be undone, so every case of it is pinned here: what proves a reminder
 * is the board's, which reasons may remove one, that the whole text is on disk
 * before the delete, and that a board which cannot see the main agent's session
 * clearly removes nothing.
 *
 * The host is the fake schedule service of tests/fake-rc3.ts, which models the
 * rc.1 face and refuses what it refuses: `create` without an explicit
 * `{kind: 'session'}` target (rc.1's own default would open a fresh session
 * per reminder), a `timing` without exactly the kind and its selector, and an
 * `edit` whose `expectedUpdatedAt` is not the stored stamp (`schedule_conflict`).
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ENTRY_GONE_GAP_MS, ENTRY_GONE_WARMUP_MS, fingerprintOf, NOT_DELIVERED_MS, promptOf, reconcile, selectorOf, specDigestOf, timeEntries, titleOf, type BindDeps } from '../src/loops/bind.ts'
import type { DeliverRequest, DeliverResult } from '../src/loops/deliver.ts'
import { LOOP_DEFAULTS } from '../src/loops/defaults.ts'
import type { HolderState } from '../src/loops/holder.ts'
import { emptyState, type RunnableEntry, type RuntimeState } from '../src/loops/inbox.ts'
import type { DriftRecord, LoopRecord, TaskDeleteRecord } from '../src/loops/records.ts'
import { entryIdOfPrompt, isOurs, keptLines, REMOVED_KEPT_MS, removeTask, TASK_PROMPT_PREFIX, TASK_TITLE_PREFIX, type RemoveDeps, type RemovedTaskLine } from '../src/loops/remove.ts'
import { ensureRuntimeDir, loopsPaths } from '../src/loops/store.ts'
import { fakeSchedule, type FakeSchedule, type ScheduleCall } from './fake-rc3.ts'
import { journalTakesRecord, NOW, quickIo, tellEntry } from './loops-helpers.ts'

const ZONE = 'Asia/Shanghai'
const HOLDER = 'session-main'

interface Bench {
  readonly root: string
  readonly deps: BindDeps
  readonly state: RuntimeState
  readonly schedule: FakeSchedule
  readonly records: LoopRecord[]
  readonly said: Array<{ readonly text: string, readonly level: string }>
  readonly delivered: DeliverRequest[]
  /** The moment every reading is taken at; a case moves it. */
  at: { ms: number }
  holder: HolderState
  entries: RunnableEntry[]
  deleted: Set<string>
  deliverResult: DeliverResult
}

/** A project directory with the board's runtime directory, a fake schedule service and the reconciliation's dependencies over them. */
async function bench(body: (it: Bench) => Promise<void>, options: { readonly startedAgo?: number } = {}): Promise<void> {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'loops-bind-')))
  try {
    const paths = loopsPaths(root)
    await ensureRuntimeDir(paths)
    const at = { ms: NOW }
    const now = (): number => at.ms
    const state = emptyState()
    const records: LoopRecord[] = []
    const said: Bench['said'] = []
    const delivered: DeliverRequest[] = []
    const schedule = fakeSchedule({ now })
    const it: Bench = {
      root,
      state,
      schedule,
      records,
      said,
      delivered,
      at,
      holder: { kind: 'ok', session: HOLDER },
      entries: [],
      deleted: new Set<string>(),
      deliverResult: { kind: 'delivered', how: 'followup' },
      deps: {
        paths,
        io: quickIo({ now }),
        now,
        state: () => state,
        schedule: () => schedule.service,
        holder: () => it.holder,
        entries: () => it.entries,
        deleted: entry => it.deleted.has(entry),
        startedAt: new Date(NOW - (options.startedAgo ?? 10 * 60_000)).toISOString(),
        // The records the metrics journal would take (a refused one is lost, as in the real one).
        record: (record) => { if (journalTakesRecord(record)) records.push(record) },
        report: (text, level) => void said.push({ text, level }),
        deliver: (request) => {
          delivered.push(request)
          return Promise.resolve(it.deliverResult)
        },
        timeZone: () => ZONE,
      },
    }
    await body(it)
  }
  finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

const weekly = (id = 'u-1a2b3c4d'): RunnableEntry => ({ entry: tellEntry(id), source: 'person' })

const plugin = (id = 'operate.morning'): RunnableEntry => ({
  entry: { ...tellEntry(id), when: { kind: 'daily', time: '08:30', timeZone: ZONE } },
  source: 'plugin',
  plugin: 'dsh-hourness',
  row: 'glm-hourness/operate',
})

const deletions = (records: readonly LoopRecord[]): Array<{ readonly why: string, readonly deleted: boolean }> =>
  records.flatMap((record): TaskDeleteRecord[] => record.kind === 'loop-task-delete' ? [record] : []).map(record => ({ why: record.why, deleted: record.deleted }))

const drifts = (records: readonly LoopRecord[]): Array<DriftRecord['what']> =>
  records.flatMap((record): DriftRecord[] => record.kind === 'loop-drift' ? [record] : []).map(record => record.what)

const removedLines = async (root: string): Promise<RemovedTaskLine[]> => {
  const text = await readFile(loopsPaths(root).removedTasks, 'utf8').catch(() => '')
  return text.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line) as RemovedTaskLine)
}

/** Bind the weekly entry to its reminder and hand back the reminder's id. */
async function bindOne(it: Bench): Promise<string> {
  it.entries = [weekly()]
  await reconcile(it.deps)
  const task = it.schedule.tasks()[0]
  assert.ok(task !== undefined, 'the reminder was made')
  return task.id
}

test('bind: a person\'s weekly entry becomes one reminder on the main agent\'s session, written the way the board writes them', async () => {
  await bench(async (it) => {
    it.entries = [weekly()]
    const done = await reconcile(it.deps)
    assert.deepEqual([...done.created], ['u-1a2b3c4d'])
    const tasks = it.schedule.tasks()
    assert.equal(tasks.length, 1)
    const task = tasks[0]
    // The target is an explicit session one: rc.1's own default would open a fresh session per reminder.
    assert.deepEqual(task.target, { kind: 'session', sessionId: HOLDER })
    assert.equal(task.involvedSessionIds.includes(HOLDER), true)
    assert.equal(task.title, `${TASK_TITLE_PREFIX}每周五看一眼没合入的分支`)
    assert.ok(task.prompt.startsWith(`${TASK_PROMPT_PREFIX}u-1a2b3c4d (added by the human). Change it on the loop board, not here.\n`))
    assert.equal(entryIdOfPrompt(task.prompt), 'u-1a2b3c4d')
    assert.equal(task.kind, 'weekly')
    assert.deepEqual(task.weekdays, [5])
    assert.equal(task.time, '17:00:00.000')
    assert.equal(task.timeZone, ZONE)
    const binding = it.state.bindings['u-1a2b3c4d']
    assert.equal(binding.scheduleId, task.id)
    assert.equal(binding.sessionId, HOLDER)
    assert.equal(binding.fingerprint, fingerprintOf(task))
    assert.equal(binding.specDigest, specDigestOf(weekly(), ZONE))
    // The create named the holder session as the actor, so the host's notice skips the session the board writes for.
    assert.deepEqual(it.schedule.calls.filter(call => call.op === 'create').map(call => call.actor), [HOLDER])
    // A second reconciliation with nothing changed makes nothing and touches nothing.
    const again = await reconcile(it.deps)
    assert.deepEqual([...again.created, ...again.updated, ...again.removed], [])
    assert.equal(it.schedule.tasks().length, 1)
  })
})

test('bind: only an entry that tells the main agent at a time is one DSH reminder', () => {
  const event: RunnableEntry = { entry: { ...tellEntry('u-event001'), when: { kind: 'event', events: ['loops.host-restarted'] } }, source: 'person' }
  const command: RunnableEntry = { entry: { ...tellEntry('u-command1'), when: { kind: 'command', names: ['hourness'] }, action: { kind: 'self', does: 'x', by: 'y' } }, source: 'plugin' }
  const harness: RunnableEntry = { entry: { ...tellEntry('u-harness1'), action: { kind: 'harness', action: 'execute.trunk-check' } }, source: 'plugin' }
  assert.deepEqual(timeEntries([weekly(), plugin(), event, command, harness]).map(item => item.entry.id), ['u-1a2b3c4d', 'operate.morning'])
})

test('bind: a plugin\'s entry says whose default it is, and the timing of each kind maps to the host\'s own selector', () => {
  const item = plugin()
  assert.ok(promptOf(item).startsWith(`${TASK_PROMPT_PREFIX}operate.morning (default of dsh-hourness). Change it on the loop board, not here.`))
  assert.equal(titleOf(item.entry).startsWith(TASK_TITLE_PREFIX), true)
  assert.deepEqual(selectorOf({ kind: 'once', at: '2026-11-03T09:00:00+08:00' }, ZONE), { at: '2026-11-03T09:00:00+08:00' })
  assert.deepEqual(selectorOf({ kind: 'every', seconds: 1800 }, ZONE), { every_seconds: 1800 })
  assert.deepEqual(selectorOf({ kind: 'daily', time: '08:30' }, ZONE), { daily: { time: '08:30:00', time_zone: ZONE } })
  assert.deepEqual(selectorOf({ kind: 'weekly', time: '17:00', weekdays: [5] }, ZONE), { weekly: { time: '17:00:00', time_zone: ZONE, weekdays: [5] } })
  assert.deepEqual(selectorOf({ kind: 'cron', expression: '0 9 * * 1' }, ZONE), { cron: { expression: '0 9 * * 1', time_zone: ZONE } })
  // An event entry and a command entry are not reminders of DSH.
  assert.equal(selectorOf({ kind: 'event', events: ['loops.host-restarted'] }, ZONE), undefined)
  assert.equal(selectorOf({ kind: 'command', names: ['hourness'] }, ZONE), undefined)
})

test('bind: the loop row\'s end-of-day entry is a time entry that becomes one daily reminder of DSH at 18:05, with the words of the entry and no event to fill', () => {
  const entry = LOOP_DEFAULTS.find(candidate => candidate.id === 'loops.unsynced-daily')
  assert.ok(entry !== undefined)
  const item: RunnableEntry = { entry, source: 'plugin', plugin: 'dsh-hourness', row: 'glm-hourness/loops' }
  assert.deepEqual(timeEntries([item]).map(candidate => candidate.entry.id), ['loops.unsynced-daily'])
  assert.deepEqual(selectorOf(entry.when, ZONE), { daily: { time: '18:05:00', time_zone: ZONE } })
  const prompt = promptOf(item)
  assert.ok(prompt.startsWith(`${TASK_PROMPT_PREFIX}loops.unsynced-daily (default of dsh-hourness). Change it on the loop board, not here.`))
  assert.ok(entry.action.kind === 'tell-main' && prompt.includes(entry.action.text))
})

test('bind: the main agent moves to another session: the new reminder is made first, the old one removed as moved with its whole text kept', async () => {
  await bench(async (it) => {
    it.entries = [weekly()]
    await reconcile(it.deps)
    const first = it.schedule.tasks()[0]
    it.holder = { kind: 'ok', session: 'session-second' }
    const done = await reconcile(it.deps)
    assert.deepEqual([...done.moved], ['u-1a2b3c4d'])
    const tasks = it.schedule.tasks()
    assert.equal(tasks.length, 1)
    assert.deepEqual(tasks[0].target, { kind: 'session', sessionId: 'session-second' })
    assert.deepEqual(deletions(it.records), [{ why: 'moved', deleted: true }])
    const lines = await removedLines(it.root)
    assert.equal(lines.length, 1)
    assert.equal(lines[0].why, 'moved')
    assert.equal(lines[0].entry, 'u-1a2b3c4d')
    assert.equal(lines[0].record.id, first.id)
    assert.equal(lines[0].record.prompt, first.prompt)
    // The delete of the moved-away task went through one edit, with the stamp the catalog gave.
    const edit = it.schedule.calls.filter(call => call.op === 'edit' && call.action === 'delete')
    assert.equal(edit.length, 1)
    assert.equal(edit[0].id, first.id)
    assert.equal(edit[0].actor, 'session-second')
    assert.equal(typeof edit[0].expectedUpdatedAt, 'string')
  })
})

test('bind: a reminder somebody edited on the DSH task page is put back with one edit and the catalog stamp, one drift record and one line a day', async () => {
  await bench(async (it) => {
    const task = await bindOne(it)
    it.schedule.edit(task, { prompt: 'Loop board: u-1a2b3c4d (added by the human). Change it on the loop board, not here.\nsomething the person typed' })
    const drifted = it.schedule.tasks()[0]
    const done = await reconcile(it.deps)
    assert.deepEqual([...done.updated], ['u-1a2b3c4d'])
    assert.equal(it.schedule.tasks()[0].prompt, promptOf(weekly()))
    // rc.1 has no session-scoped list and no whole-record expected: the repair is one edit with the stamp of the catalog row.
    const asked: readonly ScheduleCall[] = it.schedule.calls
    const edit = asked.find(call => call.op === 'edit' && call.action === 'update')
    assert.ok(edit !== undefined, 'the repair is one edit')
    assert.equal(edit.id, task)
    assert.equal(edit.actor, HOLDER)
    assert.equal(edit.expectedUpdatedAt, drifted.updatedAt)
    assert.ok(!asked.some(call => call.op === 'list'), 'there is no list to read an expected record from')
    assert.deepEqual(drifts(it.records), ['edited'])
    assert.equal(done.lines.filter(line => line.includes('在 DSH 的自动化任务页里改的不算数')).length, 1)
    // The same task says it once a day.
    it.schedule.edit(it.schedule.tasks()[0].id, { title: 'somebody renamed it' })
    const second = await reconcile(it.deps)
    assert.equal(second.lines.filter(line => line.includes('在 DSH 的自动化任务页里改的不算数')).length, 0)
    assert.equal(it.schedule.tasks()[0].title, titleOf(weekly().entry))
  })
})

test('bind: a reminder of the board\'s that no binding names is taken back when the entry is still there, and counted as a duplicate when the entry already has one', async () => {
  await bench(async (it) => {
    const task = await bindOne(it)
    // The state file was lost: the binding is gone, the reminder is not.
    it.state.bindings = {}
    const done = await reconcile(it.deps)
    assert.deepEqual([...done.adopted], ['u-1a2b3c4d'])
    assert.equal(it.state.bindings['u-1a2b3c4d'].scheduleId, task)
    assert.equal(it.schedule.tasks().length, 1)
    // A second reminder for the same entry is one too many.
    it.schedule.seed(HOLDER, { title: titleOf(weekly().entry), prompt: promptOf(weekly()) })
    const again = await reconcile(it.deps)
    assert.equal(again.removed.length, 1)
    assert.deepEqual(deletions(it.records), [{ why: 'duplicate', deleted: true }])
    assert.equal(it.schedule.tasks().length, 1)
  })
})

test('bind: a reminder whose entry is not in the table waits five minutes and two passes a minute apart, unless the person deleted the entry', async () => {
  await bench(async (it) => {
    it.schedule.seed(HOLDER, { title: `${TASK_TITLE_PREFIX}morning`, prompt: promptOf(plugin()) })
    // This process has only just started running the project: the row that hands the entry over may still be coming.
    const warm = await reconcile(it.deps)
    assert.deepEqual([...warm.removed], [])
    assert.equal(warm.kept.length, 1)
    assert.ok(warm.kept[0].includes('先等它'))
    it.at.ms += ENTRY_GONE_WARMUP_MS + 60_000
    const first = await reconcile(it.deps)
    assert.deepEqual([...first.removed], [], 'one pass after the warm-up is not enough')
    it.at.ms += ENTRY_GONE_GAP_MS + 1_000
    const second = await reconcile(it.deps)
    assert.equal(second.removed.length, 1)
    assert.deepEqual(deletions(it.records), [{ why: 'entry-gone', deleted: true }])
  }, { startedAgo: 0 })
  // The person deleting the entry is certain, so the reminder goes in the same pass.
  await bench(async (it) => {
    it.schedule.seed(HOLDER, { title: `${TASK_TITLE_PREFIX}morning`, prompt: promptOf(weekly()) })
    it.deleted.add('u-1a2b3c4d')
    const done = await reconcile(it.deps)
    assert.equal(done.removed.length, 1)
    assert.deepEqual(deletions(it.records), [{ why: 'entry-gone', deleted: true }])
  }, { startedAgo: 0 })
})

test('bind: no main agent must be read twice, a minute apart, before the reminders of the old session go', async () => {
  await bench(async (it) => {
    it.entries = [weekly()]
    await reconcile(it.deps)
    it.holder = { kind: 'none', reason: 'no-record' }
    const first = await reconcile(it.deps)
    assert.deepEqual([...first.removed], [])
    assert.ok(first.lines.some(line => line.includes('再看一拍')))
    assert.equal(it.schedule.tasks().length, 1)
    it.at.ms += ENTRY_GONE_GAP_MS + 1_000
    const second = await reconcile(it.deps)
    assert.equal(second.removed.length, 1)
    assert.deepEqual(deletions(it.records), [{ why: 'no-holder', deleted: true }])
    assert.equal(it.schedule.tasks().length, 0)
    assert.deepEqual(it.state.bindings, {})
  })
})

test('bind: an archived or missing holder session takes its reminders with it, and the reason says which', async () => {
  for (const state of [{ kind: 'archived' as const, reason: 'holder-archived' as const }, { kind: 'not-found' as const, reason: 'holder-not-found' as const }]) {
    await bench(async (it) => {
      it.entries = [weekly()]
      await reconcile(it.deps)
      it.holder = { kind: state.kind, session: HOLDER, reason: state.reason }
      const done = await reconcile(it.deps)
      assert.equal(done.removed.length, 1)
      assert.deepEqual(deletions(it.records), [{ why: state.reason, deleted: true }])
      assert.equal(it.schedule.tasks().length, 0)
      assert.deepEqual([...done.created], [], 'nothing is made for a session nobody can be told through')
    })
  }
})

test('bind: a holder session the board cannot see clearly keeps every reminder; the session being open elsewhere stops the reconciliation entirely', async () => {
  await bench(async (it) => {
    it.entries = [weekly()]
    await reconcile(it.deps)
    const before = it.schedule.calls.length
    it.holder = { kind: 'elsewhere', session: HOLDER, reason: 'writer-held' }
    const elsewhere = await reconcile(it.deps)
    assert.deepEqual([...elsewhere.created, ...elsewhere.removed, ...elsewhere.updated], [])
    assert.equal(it.schedule.calls.length, before, 'not even the catalog is read')
    it.holder = { kind: 'unknown', session: HOLDER, reason: 'holder-unreadable', detail: 'broken' }
    await reconcile(it.deps)
    assert.equal(it.schedule.calls.length, before)
    // Only the archive set could not be read: the board goes on making and putting back, and removes nothing of that session.
    it.holder = { kind: 'unknown', session: HOLDER, reason: 'archive-unreadable', detail: 'not started' }
    it.schedule.seed(HOLDER, { title: `${TASK_TITLE_PREFIX}orphan`, prompt: promptOf(plugin()) })
    it.at.ms += 10 * 60_000
    const unreadable = await reconcile(it.deps)
    assert.deepEqual([...unreadable.removed], [])
    assert.equal(unreadable.kept.length, 1)
    assert.ok(unreadable.kept[0].includes('看不清主 Agent 的会话'))
    assert.equal(it.schedule.tasks().length, 2)
  })
})

test('bind: a reminder is not deleted when its whole text cannot be written down first', async () => {
  await bench(async (it) => {
    it.entries = [weekly()]
    await reconcile(it.deps)
    // The record file cannot be appended to: a directory in its place is the simplest way to say so.
    rmSync(it.deps.paths.removedTasks, { force: true })
    mkdirSync(it.deps.paths.removedTasks, { recursive: true })
    it.holder = { kind: 'archived', session: HOLDER, reason: 'holder-archived' }
    const done = await reconcile(it.deps)
    assert.deepEqual([...done.removed], [])
    assert.equal(done.kept.length, 1)
    assert.ok(done.kept[0].includes('removed-tasks.jsonl'))
    assert.equal(it.schedule.tasks().length, 1, 'the reminder is still there')
    assert.deepEqual(deletions(it.records), [], 'and no record says it went')
    assert.ok(it.said.some(line => line.level === 'degraded' && line.text.includes('没能记下要删的 DSH 提醒')))
  })
})

test('bind: a delivery DSH made is one run of the entry, and one it owes for five minutes is a failure the board delivers itself', async () => {
  await bench(async (it) => {
    it.entries = [weekly()]
    await reconcile(it.deps)
    const task = it.schedule.tasks()[0]
    it.schedule.fire(task.id, { messageId: 'message-1' })
    await reconcile(it.deps)
    const done = it.records.filter(record => record.kind === 'loop-done')
    assert.equal(done.length, 1)
    assert.deepEqual([done[0].kind === 'loop-done' ? done[0].outcome : '', done[0].kind === 'loop-done' ? done[0].delivery : ''], ['delivered', 'dsh'])
    assert.equal(it.state.bindings['u-1a2b3c4d'].deliveredMessageId, 'message-1')
    // The next due time passes and DSH delivers nothing.
    it.schedule.due(task.id, new Date(it.at.ms - 1000).toISOString())
    await reconcile(it.deps)
    assert.equal(it.delivered.length, 0, 'the board waits five minutes for the host')
    it.at.ms += NOT_DELIVERED_MS + 60_000
    await reconcile(it.deps)
    assert.equal(it.delivered.length, 1)
    assert.equal(it.delivered[0].entry, 'u-1a2b3c4d')
    assert.deepEqual(drifts(it.records), ['not-delivered'])
    assert.deepEqual(deletions(it.records), [{ why: 'not-delivered', deleted: true }])
    // The reminder was made again, so the host counts from now.
    assert.equal(it.schedule.tasks().length, 1)
    assert.notEqual(it.schedule.tasks()[0].id, task.id)
  })
})

test('bind: a one-shot entry that has fired is left as DSH left it and not made again', async () => {
  await bench(async (it) => {
    const once: RunnableEntry = { entry: { ...tellEntry('u-once0001'), when: { kind: 'once', at: new Date(NOW + 3_600_000).toISOString() } }, source: 'person' }
    it.entries = [once]
    await reconcile(it.deps)
    const task = it.schedule.tasks()[0]
    assert.equal(task.kind, 'at')
    it.schedule.fire(task.id)
    const done = await reconcile(it.deps)
    assert.equal(it.state.bindings['u-once0001'].done, true)
    assert.ok(done.lines.some(line => line.includes('已跑过')))
    const again = await reconcile(it.deps)
    assert.deepEqual([...again.created], [])
    assert.equal(it.schedule.tasks().length, 1)
  })
})

test('bind: a task the person paused is left alone — no repair, no not-delivered remake, no removal — and counted once a day', async () => {
  await bench(async (it) => {
    const task = await bindOne(it)
    it.schedule.pause(task)
    // Past due and past the not-delivered window: a pause is the person's change, not a missed delivery.
    it.schedule.due(task, new Date(it.at.ms - 1000).toISOString())
    it.at.ms += NOT_DELIVERED_MS + 60_000
    const done = await reconcile(it.deps)
    assert.deepEqual([...done.removed, ...done.updated], [])
    assert.deepEqual(deletions(it.records), [])
    assert.equal(it.delivered.length, 0)
    assert.equal(it.schedule.tasks().length, 1)
    assert.equal(it.schedule.tasks()[0].id, task)
    assert.equal(done.lines.filter(line => line.includes('人暂停的提醒：1 条')).length, 1)
    // The same day says it once.
    const again = await reconcile(it.deps)
    assert.equal(again.lines.filter(line => line.includes('人暂停的提醒')).length, 0)
    // The person resumes: the board writes nothing (the content still matches), and the next delivery counts as a run.
    it.schedule.resume(task)
    it.schedule.fire(task, { messageId: 'message-paused-1' })
    const resumed = await reconcile(it.deps)
    assert.deepEqual([...resumed.removed, ...resumed.updated], [])
    assert.deepEqual(it.records.filter(record => record.kind === 'loop-done').map(record => record.kind === 'loop-done' ? record.outcome : ''), ['delivered'])
    assert.equal(it.state.bindings['u-1a2b3c4d'].deliveredMessageId, 'message-paused-1')
  })
})

test('bind: a paused reminder the state does not name is adopted, not deleted, and joins the day\'s count', async () => {
  await bench(async (it) => {
    const task = await bindOne(it)
    it.state.bindings = {}
    it.schedule.pause(task)
    const done = await reconcile(it.deps)
    assert.deepEqual([...done.adopted], ['u-1a2b3c4d'])
    assert.deepEqual([...done.removed], [])
    assert.equal(it.schedule.tasks().length, 1)
    assert.ok(done.lines.some(line => line.includes('人暂停的提醒：1 条')))
  })
})

test('bind: an edit refused as schedule_conflict deletes the task and makes it again', async () => {
  await bench(async (it) => {
    const task = await bindOne(it)
    it.schedule.edit(task, { prompt: 'Loop board: u-1a2b3c4d (added by the human). Change it on the loop board, not here.\nsomething the person typed' })
    it.schedule.conflictOnce(task)
    const done = await reconcile(it.deps)
    assert.deepEqual([...done.updated], ['u-1a2b3c4d'])
    assert.deepEqual(deletions(it.records), [{ why: 'repair', deleted: true }])
    assert.equal(it.schedule.tasks().length, 1)
    assert.notEqual(it.schedule.tasks()[0].id, task)
    assert.equal(it.schedule.tasks()[0].prompt, promptOf(weekly()))
  })
})

test('bind: the fake refuses a create without an explicit session target, the trap rc.1\'s default would spring', async () => {
  await bench(async (it) => {
    const timing = { kind: 'daily' as const, daily: { time: '09:00:00', time_zone: ZONE } }
    const missing = { title: 'x', prompt: 'y', timing } as unknown as Parameters<typeof it.schedule.service.create>[0]
    await assert.rejects(async () => it.schedule.service.create(missing, HOLDER), /session targets only/)
    const wrong = { title: 'x', prompt: 'y', timing, target: { kind: 'new_once' as const } } as unknown as Parameters<typeof it.schedule.service.create>[0]
    await assert.rejects(async () => it.schedule.service.create(wrong, HOLDER), /session targets only/)
    assert.equal(it.schedule.tasks().length, 0)
  })
})

test('edit: the absent-updatedAt trap of rc.1 — a wrong stamp conflicts, an omitted stamp skips the check, null matches only an unwritten row', async () => {
  await bench(async (it) => {
    const made = await it.schedule.service.create({ title: 'x', prompt: 'y', timing: { kind: 'every', every_seconds: 3600 }, target: { kind: 'session', sessionId: HOLDER } }, HOLDER)
    assert.equal(typeof made.updatedAt, 'string')
    // `null` matches rows without an `updatedAt`; this row has one, so it is a conflict.
    assert.deepEqual(await it.schedule.service.edit({ id: made.id, action: 'update', patch: { title: 'null stamp' }, expectedUpdatedAt: null }, HOLDER), { id: made.id, code: 'schedule_conflict' })
    // A stale stamp is a conflict.
    assert.deepEqual(await it.schedule.service.edit({ id: made.id, action: 'update', patch: { title: 'stale' }, expectedUpdatedAt: new Date(Date.parse(made.updatedAt!) - 1_000).toISOString() }, HOLDER), { id: made.id, code: 'schedule_conflict' })
    // The stamp the row carries writes.
    const current = await it.schedule.service.edit({ id: made.id, action: 'update', patch: { title: 'current' }, expectedUpdatedAt: made.updatedAt }, HOLDER)
    assert.ok(!('code' in current) && !('deleted' in current))
    // The field left out skips the check, whatever the row carries.
    const skipped = await it.schedule.service.edit({ id: made.id, action: 'update', patch: { title: 'unchecked' } }, HOLDER)
    assert.ok(!('code' in skipped) && !('deleted' in skipped))
    assert.equal(skipped.title, 'unchecked')
    // A row the host never wrote: `null` matches it.
    const bare = it.schedule.seed(HOLDER, { title: `${TASK_TITLE_PREFIX}bare`, prompt: promptOf(plugin()) }, null)
    assert.equal(bare.updatedAt, undefined)
    const onBare = await it.schedule.service.edit({ id: bare.id, action: 'update', patch: { title: 'named' }, expectedUpdatedAt: null }, HOLDER)
    assert.ok(!('code' in onBare) && !('deleted' in onBare))
    assert.equal(onBare.title, 'named')
  })
})

test('removeTask: a reminder the board cannot prove is its own is kept, whatever the reason says', async () => {
  await bench(async (it) => {
    const mine = it.schedule.seed(HOLDER, { title: `${TASK_TITLE_PREFIX}morning`, prompt: promptOf(plugin()) })
    const theirs = it.schedule.seed(HOLDER, { title: 'Water the plants', prompt: 'Water the plants on the balcony.' })
    assert.equal(isOurs(new Set(), mine), true)
    assert.equal(isOurs(new Set(), theirs), false)
    assert.equal(isOurs(new Set([theirs.id]), theirs), true, 'a task the board made is its own by its binding alone')
    const deps: RemoveDeps = {
      paths: it.deps.paths,
      schedule: it.schedule.service,
      now: it.deps.now,
      ours: () => new Set(),
      holder: () => it.holder,
      record: it.deps.record,
      report: it.deps.report,
    }
    const kept = await removeTask(deps, theirs, 'entry-gone')
    assert.equal(kept.kind, 'kept')
    assert.equal(it.schedule.tasks().length, 2)
    assert.deepEqual(await removedLines(it.root), [], 'nothing was written down either')
    const gone = await removeTask(deps, mine, 'entry-gone', 'operate.morning')
    assert.equal(gone.kind, 'deleted')
    assert.equal(it.schedule.tasks().length, 1)
  })
})

test('removeTask: every one of the eight reasons removes a reminder, and each writes its reason down', async () => {
  const reasons = ['moved', 'entry-gone', 'duplicate', 'no-holder', 'holder-archived', 'holder-not-found', 'repair', 'not-delivered'] as const
  await bench(async (it) => {
    const deps: RemoveDeps = {
      paths: it.deps.paths,
      schedule: it.schedule.service,
      now: it.deps.now,
      ours: () => new Set(it.schedule.tasks().map(task => task.id)),
      holder: () => it.holder,
      record: it.deps.record,
      report: it.deps.report,
    }
    for (const why of reasons) {
      const task = it.schedule.seed(HOLDER, { title: `${TASK_TITLE_PREFIX}${why}`, prompt: promptOf(weekly()) })
      const done = await removeTask(deps, task, why, 'u-1a2b3c4d')
      assert.equal(done.kind, 'deleted', why)
    }
    assert.deepEqual(deletions(it.records).map(record => record.why), [...reasons])
    const lines = await removedLines(it.root)
    assert.deepEqual(lines.map(line => line.why), [...reasons])
    assert.equal(keptLines(readFileSync(it.deps.paths.removedTasks, 'utf8'), it.at.ms).length, 8)
    // A line older than thirty days is not kept.
    assert.equal(keptLines(readFileSync(it.deps.paths.removedTasks, 'utf8'), it.at.ms + REMOVED_KEPT_MS + 86_400_000).length, 0)
  })
})

test('removeTask: a reminder bound to a holder session the board cannot see clearly is kept for every reason', async () => {
  await bench(async (it) => {
    const task = it.schedule.seed(HOLDER, { title: `${TASK_TITLE_PREFIX}morning`, prompt: promptOf(weekly()) })
    const deps: RemoveDeps = {
      paths: it.deps.paths,
      schedule: it.schedule.service,
      now: it.deps.now,
      ours: () => new Set([task.id]),
      holder: () => it.holder,
      record: it.deps.record,
      report: it.deps.report,
    }
    for (const holder of [{ kind: 'elsewhere' as const, reason: 'handover' as const }, { kind: 'unknown' as const, reason: 'archive-unreadable' as const }, { kind: 'unknown' as const, reason: 'holder-unreadable' as const }]) {
      it.holder = { kind: holder.kind, session: HOLDER, reason: holder.reason }
      const kept = await removeTask(deps, task, 'entry-gone', 'u-1a2b3c4d')
      assert.equal(kept.kind, 'kept', holder.reason)
      assert.ok(kept.kind === 'kept' && kept.why.includes(holder.reason))
    }
    assert.equal(it.schedule.tasks().length, 1)
    assert.deepEqual(it.records, [])
  })
})
