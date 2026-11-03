import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { ProjectionValues, RemoteRoot, SessionsClient, StreamItem, WatchFrame } from '../ui/src/dsh.ts'
import { BOARD_ORDER, boards, checkedBoardState, homeLineFromItem, registerBoard, type Board, type BoardState } from '../ui/src/graph/boards.ts'
import { buildLessonsPage, memoryRows } from '../ui/src/lessons/model.ts'
import { foldJournalText, holdLessonsSource, LessonsSource, type LessonsPaths } from '../ui/src/lessons/source.ts'
import { lessonsBoard } from '../ui/src/lessons/board.ts'
import type { StatusItem } from '../src/shared/status.ts'
import { lessonsFold } from '../src/lessons/model.ts'
import { memoryFold } from '../src/memory/model.ts'

/**
 * The lessons page of the panel (M5 impl plan S10, design §4.7, lessons-3):
 * the view model (rows, the collapsed groups, the 要改 lines, the 原话未核对
 * tag, the candidate count, the one reporting-depth line), the fold of whole
 * journal text, the page source (a failed read keeps the last content and
 * shows the reason; the change feed and the size+version poll), the board
 * registration table and the snapshot result the panel reads from it
 * (plain-ui 1.3 §8.2, status hub 0.3 §12, including the home line mirrored
 * from a board's entry), and the static check that ui/src/lessons/ never
 * writes: no commands.execute, no button, toggle or form. The pure
 * functions run without rendering React.
 */

const NOW = Date.parse('2026-10-29T12:00:00.000Z')

/** One journal record as a line; `fields` carries the rest. */
const line = (seq: number, fields: Readonly<Record<string, unknown>>): string =>
  JSON.stringify({ v: 1, seq, at: '2026-10-25T08:00:00.000Z', actor: 'llm', ...fields })

/** The lessons journal of the page tests: two active lessons, one open candidate, one retired, one deleted. */
const LESSONS_TEXT = [
  line(1, { at: '2026-10-25T08:00:00.000Z', actor: 'harness', op: 'propose', id: 'C-000001', evidence: ['task:task-33'], data: { situation: { files: ['docs/graph/**'], tools: [], commands: ['git commit'], errors: [] }, pitfall: 'worker wrote the graph', fix: 'let the main agent write the graph' } }),
  line(2, { at: '2026-10-24T08:00:00.000Z', actor: 'llm', op: 'new', id: 'L-0a1b2c', evidence: ['docs/DEVELOPMENT.md §7'], data: { situation: { files: ['src/*/index.ts'], tools: [], commands: [], errors: [] }, pitfall: 'apply threw at activation', fix: 'degrade to a warning plus no-op' } }),
  line(3, { at: '2026-10-26T08:00:00.000Z', actor: 'llm', op: 'confirm', id: 'L-0a1b2c', evidence: ['commit:abc1234'] }),
  line(4, { at: '2026-10-27T08:00:00.000Z', actor: 'harness', by: { session: 's9' }, op: 'hit', id: 'L-0a1b2c' }),
  line(5, { at: '2026-10-27T08:00:00.000Z', actor: 'llm', op: 'new', id: 'L-0d1e2f', evidence: ['docs/DEVELOPMENT.md §7'], data: { situation: { files: [], tools: [], commands: ['git status'], errors: [] }, pitfall: 'a relative path left the workspace', fix: 'resolve against the session working directory' } }),
  line(6, { at: '2026-10-23T08:00:00.000Z', actor: 'llm', op: 'new', id: 'L-0b2c3d', evidence: ['docs/HANDOFF.md §6'], data: { situation: { files: [], tools: ['pwsh'], commands: [], errors: [] }, pitfall: 'a retired lesson', fix: 'the retired fix' } }),
  line(7, { at: '2026-10-25T08:00:00.000Z', actor: 'llm', op: 'retire', id: 'L-0b2c3d' }),
  line(8, { at: '2026-10-22T08:00:00.000Z', actor: 'human', op: 'new', id: 'L-0c3d4e', evidence: ['docs/HANDOFF.md §6'], data: { situation: { files: ['docs/**'], tools: [], commands: [], errors: [] }, pitfall: 'a deleted lesson', fix: 'the deleted fix' } }),
  line(9, { at: '2026-10-26T08:00:00.000Z', actor: 'human', op: 'delete', id: 'L-0c3d4e' }),
].join('\n') + '\n'

/** The user-level memory journal: the reporting depth, a human preference, an unchecked one. */
const USER_MEMORY_TEXT = [
  line(1, { at: '2026-10-29T09:00:00.000Z', actor: 'llm', relay: '太长了', op: 'store', id: 'all:reporting-depth', data: { name: 'reporting-depth', scope: 'all', type: 'user', description: '汇报细度', body: '主人嫌长。', source: [], value: 'concise' } }),
  line(2, { at: '2026-10-28T09:00:00.000Z', actor: 'human', op: 'store', id: 'all:no-lecture', data: { name: 'no-lecture', scope: 'all', type: 'user', description: '不要说教', body: '直接给结论就好。' } }),
  line(3, { at: '2026-10-27T09:00:00.000Z', actor: 'llm', relay: '先做再问', op: 'store', id: 'all:act-first', data: { name: 'act-first', scope: 'all', type: 'user', description: '先动手', body: '先做再说。', relayChecked: false } }),
].join('\n') + '\n'

/** The project memory journal: a migrated fact without a source, and a fact with one (the base starts the journal). */
const PROJECT_MEMORY_TEXT = [
  line(1, { at: '2026-10-02T09:00:00.000Z', actor: 'harness', op: 'base', id: '*', data: { entries: [{ name: 'old-lead', scope: 'project', type: 'project', description: '旧迁移线索', body: 'Why: 迁移来的。\nHow to apply: 查看旧记录。', source: [], legacy: true, created: '2026-09-01T09:00:00.000Z', lastReviewed: '2026-10-01T09:00:00.000Z', reviews: 0, origin: { actor: 'harness' }, status: 'active' }] } }),
  line(2, { at: '2026-10-25T09:00:00.000Z', actor: 'llm', relay: '图由主 Agent 写', op: 'store', id: 'project:graph-write', data: { name: 'graph-write', scope: 'project', type: 'project', description: '图只由主 Agent 写', body: 'Why: worker 直接提交过图批注。\nHow to apply: 写图的事派回主 Agent。', source: ['node:recommend-last@2026-10-29T11:39'] } }),
].join('\n') + '\n'

// --- The board registration table -------------------------------------------

test('the lessons board registers by its BOARD_ORDER id, and a second registration of the same id does not overwrite', () => {
  const board = lessonsBoard(() => null, { sessions: fakeSessions({}).sessions }).board
  assert.equal(board.id, BOARD_ORDER[2])
  assert.equal(board.label, '经验')
  registerBoard(board)
  assert.equal(boards().filter(entry => entry.id === 'lessons').length, 1)
  const errors: unknown[][] = []
  const original = console.error
  console.error = (...args: unknown[]) => { errors.push(args) }
  try {
    registerBoard(lessonsBoard(() => null, { sessions: fakeSessions({}).sessions }).board)
  }
  finally {
    console.error = original
  }
  assert.equal(errors.length, 1)
  assert.equal(boards().filter(entry => entry.id === 'lessons').length, 1)
  const others = BOARD_ORDER.slice(0, 2).map(id => fakeBoard(id))
  for (const other of others) registerBoard(other)
  registerBoard(fakeBoard('homeline-test'))
  assert.deepEqual(boards().map(entry => entry.id), [...BOARD_ORDER, 'homeline-test'])
})

const fakeBoard = (id: string): Board => ({
  id,
  label: id,
  subscribe: () => () => {},
  snapshot: () => ({ available: false, homeLine: null, guideLine: null, peakApplies: false }),
  Page: () => null,
})

test('the lessons board is available when either projection is there, with no home or guide line', () => {
  const { sessions, setProjections } = fakeSessions({})
  const board = lessonsBoard(() => null, { sessions }).board
  const unavailable: BoardState = { available: false, homeLine: null, guideLine: null, peakApplies: false }
  assert.deepEqual(board.snapshot('s1'), unavailable)
  const seen: BoardState[] = []
  const stop = board.subscribe('s1', () => { seen.push(board.snapshot('s1')) })
  setProjections('s1', { hournessMemory: { projectJournal: null, userJournal: 'C:/home/memory/memory.jsonl' } })
  assert.deepEqual(board.snapshot('s1'), { available: true, homeLine: null, guideLine: null, peakApplies: false })
  assert.equal(seen.length, 1)
  setProjections('s2', { hournessLessons: { journal: null } })
  const stop2 = board.subscribe('s2', () => {})
  assert.equal(board.snapshot('s2').available, true)
  stop2()
  stop()
  setProjections('s1', undefined)
  assert.equal(board.snapshot('s1').available, false)
})

test('the lessons board asks once for the projections of a session that has none yet', async () => {
  const { sessions, refreshCountOf } = fakeSessions({})
  const board = lessonsBoard(() => null, { sessions }).board
  const stop = board.subscribe('cold', () => {})
  await new Promise(resolve => { setTimeout(resolve, 20) })
  assert.equal(refreshCountOf('cold'), 1)
  assert.equal(board.snapshot('cold').available, true)
  stop()
})

// --- The snapshot result the panel reads (plain-ui 1.3 §8.2, status hub 0.3 §12) ---

/** A well-formed status entry, the shape a board's items hold. */
const entryOf = (id: string, text: string): StatusItem => ({ id, owner: 'rules', audience: 'agent', asOf: new Date(NOW).toISOString(), source: 'glmHournessPricing/peak', text })

test('the panel checks a snapshot result: unfit lines are hidden and wrong fields defaulted with one warning each, an unusable state is not available', () => {
  const warnings: string[] = []
  const original = console.warn
  console.warn = (message: string) => { warnings.push(message) }
  try {
    const good: BoardState = { available: true, homeLine: '正常', guideLine: null, peakApplies: false }
    assert.deepEqual(checkedBoardState('rules', good), good)
    assert.equal(checkedBoardState('rules', good), checkedBoardState('rules', good), 'the same input object keeps the same checked state')
    const checked = checkedBoardState('rules', {
      available: true,
      homeLine: '一'.repeat(61),
      guideLine: '第一行\n第二行',
      peakApplies: '是' as unknown as boolean,
      items: [entryOf('rules/peak', '高峰中'), entryOf('', '缺号'), entryOf('glm/usage', '长'.repeat(201)), { ...entryOf('glm/quota', '额度'), detail: 3 } as unknown as StatusItem],
    })
    assert.deepEqual(checked, { available: true, homeLine: null, guideLine: null, peakApplies: false, items: [entryOf('rules/peak', '高峰中'), entryOf('glm/quota', '额度')] })
    assert.equal(checkedBoardState('rules', { available: '是' as unknown as boolean, homeLine: null, guideLine: null, peakApplies: false }), null)
    assert.deepEqual(checkedBoardState('rules', { available: true, homeLine: null, guideLine: null, peakApplies: false, items: '没有' as unknown as StatusItem[] }), { available: true, homeLine: null, guideLine: null, peakApplies: false })
  }
  finally {
    console.warn = original
  }
  assert.equal(warnings.filter(text => text.includes('homeLine')).length, 1)
  assert.equal(warnings.filter(text => text.includes('guideLine')).length, 1)
  assert.equal(warnings.filter(text => text.includes('peakApplies')).length, 1)
  assert.equal(warnings.filter(text => text.includes('id 不是')).length, 1)
  assert.equal(warnings.filter(text => text.includes('text 为空、跨行或超过')).length, 1)
  assert.equal(warnings.filter(text => text.includes('detail 不是字符串数组')).length, 1)
  assert.equal(warnings.filter(text => text.includes('items that are not an array')).length, 1)
  assert.equal(warnings.filter(text => text.includes('no boolean available')).length, 1)
})

test('the home line a board mirrors from an entry is that entry text verbatim when it fits 60 code points, and nothing otherwise', () => {
  const items = [entryOf('rules/peak', '高峰中，到 18:00'), entryOf('glm/usage', '长'.repeat(61))]
  assert.equal(homeLineFromItem(items, 'rules/peak'), '高峰中，到 18:00')
  assert.equal(homeLineFromItem(items, 'glm/usage'), null)
  assert.equal(homeLineFromItem(items, 'glm/quota'), null)
  assert.equal(homeLineFromItem(undefined, 'rules/peak'), null)
  assert.equal(homeLineFromItem([entryOf('rules/peak', '高'.repeat(60))], 'rules/peak'), '高'.repeat(60))
})

// --- The view model ----------------------------------------------------------

test('the lessons half: counts, rows newest confirmed first, collapsed groups with restore lines', () => {
  const state = foldJournalText(LESSONS_TEXT, lessonsFold)
  const page = buildLessonsPage(state, memoryRows(null, null, NOW), NOW)
  assert.equal(page.topLine, '本项目 2 条经验 · 1 条候选等主 Agent 合并')
  assert.deepEqual(page.rows.map(row => row.id), ['L-0d1e2f', 'L-0a1b2c'])
  const merged = page.rows.find(row => row.id === 'L-0a1b2c')!
  assert.equal(merged.title, 'apply threw at activation')
  assert.equal(merged.stateLine, 'degrade to a warning plus no-op · 3 天前确认 · 28 天里 1 个会话碰到')
  assert.deepEqual(merged.situation, ['文件 src/*/index.ts'])
  assert.deepEqual(merged.evidence, ['docs/DEVELOPMENT.md §7', 'commit:abc1234'])
  assert.equal(merged.changeLine, '要改：跟主 Agent 说「删掉经验 L-0a1b2c」，或在输入框打 /lessons delete L-0a1b2c')
  const quiet = page.rows.find(row => row.id === 'L-0d1e2f')!
  assert.equal(quiet.stateLine, 'resolve against the session working directory · 2 天前确认')
  assert.equal(page.retired.title, 'agent 收起的（1）')
  assert.equal(page.retired.rows[0].changeLine, '要恢复：跟主 Agent 说「把 L-0b2c3d 找回来」，或打 /lessons restore L-0b2c3d')
  assert.equal(page.deleted.title, '你删掉的（1）')
  assert.equal(page.deleted.rows[0].changeLine, '要恢复：跟主 Agent 说「把 L-0c3d4e 找回来」，或打 /lessons restore L-0c3d4e')
})

test('an empty lessons journal reads as no lessons yet, without a candidate line', () => {
  const page = buildLessonsPage(foldJournalText('', lessonsFold), memoryRows(null, null, NOW), NOW)
  assert.equal(page.topLine, '这个项目还没有经验')
})

test('the memory half: relay with the 原话未核对 tag, one reporting-depth line, facts with source and strength', () => {
  const project = foldJournalText(PROJECT_MEMORY_TEXT, memoryFold('project'))
  const user = foldJournalText(USER_MEMORY_TEXT, memoryFold('all'))
  const memory = memoryRows(project, user, NOW)
  // The depth is one line of its own, not a row of the preferences.
  assert.deepEqual(memory.preferences.map(row => row.name), ['no-lecture', 'act-first'])
  assert.equal(memory.depth!.line, '汇报细度：简洁 · 你 10-29 说过「太长了」')
  assert.equal(memory.depth!.changeLine, '要改：跟主 Agent 说「忘掉 reporting-depth」，或在输入框打 /memory forget reporting-depth')
  const checked = memory.preferences.find(row => row.name === 'no-lecture')!
  assert.equal(checked.saidLine, '你 10-28 存入')
  assert.equal(checked.unchecked, false)
  const unchecked = memory.preferences.find(row => row.name === 'act-first')!
  assert.equal(unchecked.saidLine, '你 10-27 说过「先做再问」')
  assert.equal(unchecked.unchecked, true)
  const fact = memory.facts.find(row => row.name === 'graph-write')!
  assert.equal(fact.sourceLine, '出处：node:recommend-last@2026-10-29T11:39')
  assert.equal(fact.strengthText, '强度 82%')
  assert.equal(fact.noSource, false)
  assert.equal(fact.changeLine, '要改：跟主 Agent 说「忘掉 graph-write」，或在输入框打 /memory forget graph-write')
  const legacy = memory.facts.find(row => row.name === 'old-lead')!
  assert.equal(legacy.sourceLine, null)
  assert.equal(legacy.noSource, true)
  assert.equal(legacy.strengthText, '强度 25%')
})

test('without the memory journals the memory half is empty and no depth line shows', () => {
  const memory = memoryRows(null, null, NOW)
  assert.deepEqual(memory.preferences, [])
  assert.deepEqual(memory.facts, [])
  assert.equal(memory.depth, null)
})

/** The user-level journal of the habit test: an ask, the confirming store, an update that changes the content, and a second habit the person declined. */
const HABIT_MEMORY_TEXT = [
  line(1, { at: '2026-10-20T09:00:00.000Z', actor: 'llm', by: { session: 's1' }, op: 'ask', id: 'all:rename-keep-date', data: { name: 'rename-keep-date', scope: 'all', question: '重命名时保留拍摄日期，好吗？', description: '重命名时保留拍摄日期', body: 'Why: 你说过照片的日期不能丢。\nHow to apply: 改名不改时间戳。' } }),
  line(2, { at: '2026-10-22T09:00:00.000Z', actor: 'llm', relay: '好，保留拍摄日期', by: { session: 's1' }, op: 'store', id: 'all:rename-keep-date', data: { name: 'rename-keep-date', scope: 'all', type: 'feedback', description: '重命名时保留拍摄日期', body: 'Why: 你说过照片的日期不能丢。\nHow to apply: 改名不改时间戳。', source: [], ask: '重命名时保留拍摄日期，好吗？', relayChecked: true } }),
  line(3, { at: '2026-10-26T09:00:00.000Z', actor: 'llm', relay: '只在照片库里保留', by: { session: 's1' }, op: 'store', id: 'all:rename-keep-date', data: { name: 'rename-keep-date', scope: 'all', type: 'feedback', description: '重命名时保留拍摄日期', body: 'Why: 你说过照片的日期不能丢。\nHow to apply: 照片库里改名不改时间戳，别处随意。', source: [], relayChecked: true } }),
  line(4, { at: '2026-10-24T09:00:00.000Z', actor: 'llm', by: { session: 's1' }, op: 'ask', id: 'all:rename-prefix', data: { name: 'rename-prefix', scope: 'all', question: '重命名时都加日期前缀，好吗？', description: '重命名时加日期前缀', body: 'Why: 排序方便。\nHow to apply: 文件名前加 YYYY-MM-DD。', learnedFrom: ['edit:goal.stage'] } }),
  line(5, { at: '2026-10-25T09:00:00.000Z', actor: 'llm', relay: '不用，前缀随意', by: { session: 's1' }, op: 'decline', id: 'all:rename-prefix', data: { name: 'rename-prefix', question: '重命名时都加日期前缀，好吗？', description: '重命名时加日期前缀', learnedFrom: ['edit:goal.stage'] } }),
].join('\n') + '\n'

test('the habit rows: a confirmed habit with its question and 要记的 line, the changed-content line, and the folded declined habits (lessons-3)', () => {
  const user = foldJournalText(HABIT_MEMORY_TEXT, memoryFold('all'))
  const memory = memoryRows(null, user, NOW)
  assert.deepEqual(memory.preferences.map(row => row.name), ['rename-keep-date'])
  const habit = memory.preferences[0]
  assert.equal(habit.saidLine, '你 10-26 说过「只在照片库里保留」')
  assert.deepEqual(habit.habit, {
    questionLine: '当时问你的是：「重命名时保留拍摄日期，好吗？」',
    memorizeLine: '要记的：重命名时保留拍摄日期',
    changedLine: '内容在你确认之后改过，依据是你 10-26 说过「只在照片库里保留」',
  })
  assert.deepEqual(memory.declinedHabits.rows.map(row => row.name), ['rename-prefix'])
  const no = memory.declinedHabits.rows[0]
  assert.equal(no.questionLine, '当时问你的是：「重命名时都加日期前缀，好吗？」')
  assert.equal(no.saidLine, '你 10-25 说过「不用，前缀随意」')
  assert.equal(no.untilLine, '11-22 之前不再问')
  assert.equal(no.changeLine, '要改：11-22 之后想记回来，跟主 Agent 再说一次')
})

// --- The page source ---------------------------------------------------------

/**
 * One changes feed of the fake remote: the test pushes frames, the reader
 * pulls them until the feed is disposed. A frame the reader does not wait
 * for is queued.
 */
function fakeFeed(): {
  readonly deliver: (frame: WatchFrame) => void
  readonly open: <T>() => AsyncIterable<StreamItem<T>> & { dispose(): Promise<void> }
} {
  const queued: WatchFrame[] = []
  let waiting: (() => void) | undefined
  let over = false
  return {
    deliver: frame => {
      queued.push(frame)
      waiting?.()
    },
    open: <T>() => ({
      async *[Symbol.asyncIterator]() {
        while (!over) {
          if (queued.length === 0) {
            await new Promise<void>(resolve => { waiting = resolve })
            continue
          }
          yield { value: queued.shift() as T, accept: (): void => {} }
        }
      },
      dispose: () => {
        over = true
        waiting?.()
        return Promise.resolve()
      },
    }),
  }
}

/** A Remote face over absolute paths on disk, with a change feed the test drives and failing reads. */
function fakeRemote(files: { readonly [path: string]: string }): {
  readonly remote: RemoteRoot
  readonly push: (frame: WatchFrame) => void
  readonly fail: (path: string, message: string | undefined) => void
  readonly readsOf: (path: string) => number
  readonly write: (path: string, text: string) => Promise<void>
} {
  const contents = new Map(Object.entries(files))
  const failures = new Map<string, string>()
  const reads = new Map<string, number>()
  /** Every open feed; a pushed frame is broadcast and the reader filters by its path. */
  const feeds = new Set<ReturnType<typeof fakeFeed>['deliver']>()
  const fail = (path: string, message: string | undefined): void => {
    if (message === undefined) failures.delete(path)
    else failures.set(path, message)
  }
  const read = (path: string): Promise<RemoteResult> => {
    const failure = failures.get(path)
    if (failure !== undefined) return Promise.resolve({ ok: false, error: { code: 'workspace-file/unknown', message: failure } })
    const text = contents.get(path)
    if (text === undefined) return Promise.resolve({ ok: false, error: { code: 'workspace-file/not-found', message: path } })
    reads.set(path, (reads.get(path) ?? 0) + 1)
    return Promise.resolve({ ok: true, value: { absolutePath: path, version: String(text.length), bytes: text.length, data: new TextEncoder().encode(text) } })
  }
  const remote: RemoteRoot = {
    workspaceFiles: {
      list: () => Promise.resolve({ ok: false as const, error: { code: 'workspace-file/not-found', message: 'not used' } }),
      readBytes: (_session, path) => read(path),
      stat: (_session, path) => {
        const failure = failures.get(path)
        if (failure !== undefined) return Promise.resolve({ ok: false, error: { code: 'workspace-file/unknown', message: failure } })
        const text = contents.get(path)
        return text === undefined
          ? Promise.resolve({ ok: false, error: { code: 'workspace-file/not-found', message: path } })
          : Promise.resolve({ ok: true, value: { absolutePath: path, version: String(text.length), bytes: text.length } })
      },
      changes: () => undefined,
    },
    commands: { execute: () => Promise.resolve({ ok: true, value: undefined }) },
    $stream: <T>() => {
      const feed = fakeFeed()
      feeds.add(feed.deliver)
      return feed.open<T>()
    },
  }
  return {
    remote,
    push: frame => {
      for (const deliver of feeds) deliver(frame)
    },
    fail,
    readsOf: path => reads.get(path) ?? 0,
    write: (path, text) => {
      contents.set(path, text)
      return Promise.resolve()
    },
  }
}

type RemoteResult =
  | { readonly ok: true, readonly value: { readonly absolutePath: string, readonly version: string, readonly bytes?: number, readonly data: Uint8Array } }
  | { readonly ok: false, readonly error: { readonly code: string, readonly message: string } }

function fakeSessions(initial: { readonly [sessionId: string]: ProjectionValues | undefined }): {
  readonly sessions: SessionsClient
  readonly setProjections: (sessionId: string, values: ProjectionValues | undefined) => void
  readonly refreshCountOf: (sessionId: string) => number
} {
  const projections: Record<string, { readonly values: ProjectionValues, readonly state?: string } | undefined> = { ...initial }
  const listeners = new Set<() => void>()
  const refreshes = new Map<string, number>()
  const sessions: SessionsClient = {
    list: {
      getSnapshot: () => ({ projectionsBySession: projections }),
      subscribe: listener => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    refreshProjections: sessionId => {
      refreshes.set(sessionId, (refreshes.get(sessionId) ?? 0) + 1)
      projections[sessionId] = { values: { hournessLessons: { journal: 'C:/p/.llm/lessons.jsonl' }, hournessMemory: { projectJournal: 'C:/p/.llm/memory.jsonl', userJournal: 'C:/u/memory/memory.jsonl' } } }
      for (const listener of listeners) listener()
      return Promise.resolve()
    },
  }
  return {
    sessions,
    setProjections: (sessionId, values) => {
      projections[sessionId] = values === undefined ? undefined : { values }
      for (const listener of listeners) listener()
    },
    refreshCountOf: sessionId => refreshes.get(sessionId) ?? 0,
  }
}

async function until(check: () => boolean, what: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (check()) return
    await new Promise(resolve => { setTimeout(resolve, 20) })
  }
  throw new Error(`timed out: ${what}`)
}

const LESSONS_PATH = 'C:/p/.llm/lessons.jsonl'
const PROJECT_PATH = 'C:/p/.llm/memory.jsonl'
const USER_PATH = 'C:/u/memory/memory.jsonl'
const PATHS: LessonsPaths = { lessons: LESSONS_PATH, project: PROJECT_PATH, user: USER_PATH }

const THIRD = (): string => line(10, { at: '2026-10-28T08:00:00.000Z', actor: 'llm', op: 'new', id: 'L-0e4f5a', evidence: ['docs/HANDOFF.md §6'], data: { situation: { files: [], tools: [], commands: ['npm test'], errors: [] }, pitfall: 'a third lesson', fix: 'the third fix' } })

/** A started source that waits out its first read and always stops, so a failing assertion leaves no timer behind. */
async function withSource(
  fake: ReturnType<typeof fakeRemote>,
  paths: LessonsPaths,
  run: (source: LessonsSource) => Promise<void> | void,
  pollMs?: number,
): Promise<void> {
  const source = new LessonsSource(fake.remote, 's1', paths, pollMs)
  const stop = source.subscribe(() => {})
  try {
    await until(() => !source.getSnapshot().loading, 'the first read')
    await run(source)
  }
  finally {
    stop()
  }
}

test('the source folds the three journals, follows an append through the change feed, and stops with the listener', async () => {
  const fake = fakeRemote({ [LESSONS_PATH]: LESSONS_TEXT, [USER_PATH]: USER_MEMORY_TEXT })
  await withSource(fake, PATHS, async (source) => {
    assert.equal(source.getSnapshot().problem, null)
    assert.equal(source.getSnapshot().model.topLine, '本项目 2 条经验 · 1 条候选等主 Agent 合并')
    assert.equal(source.getSnapshot().model.memory.depth!.line, '汇报细度：简洁 · 你 10-29 说过「太长了」')
    // A journal appended after the first read arrives through the change feed, without the poll.
    await fake.write(LESSONS_PATH, `${LESSONS_TEXT}${THIRD()}\n`)
    fake.push({ kind: 'change', change: { absolutePath: LESSONS_PATH } })
    await until(() => source.getSnapshot().model.rows.length === 3, 'the appended lesson')
  })
})

test('a failed read keeps the last content and shows the reason at the top, and clears when the read works again', async () => {
  const fake = fakeRemote({ [LESSONS_PATH]: LESSONS_TEXT })
  await withSource(fake, { lessons: LESSONS_PATH, project: null, user: null }, async (source) => {
    fake.fail(LESSONS_PATH, 'boom')
    fake.push({ kind: 'change', change: { absolutePath: LESSONS_PATH } })
    await until(() => source.getSnapshot().problem !== null, 'the failure')
    assert.match(source.getSnapshot().problem!, /经验读不出/)
    assert.match(source.getSnapshot().problem!, /boom/)
    assert.equal(source.getSnapshot().model.rows.length, 2)
    fake.fail(LESSONS_PATH, undefined)
    fake.push({ kind: 'change', change: { absolutePath: LESSONS_PATH } })
    await until(() => source.getSnapshot().problem === null, 'the recovery')
  })
})

test('the poll re-reads only what the stat says changed, and picks up an append without a change feed', async () => {
  const fake = fakeRemote({ [LESSONS_PATH]: LESSONS_TEXT })
  await withSource(fake, { lessons: LESSONS_PATH, project: null, user: null }, async (source) => {
    const reads = fake.readsOf(LESSONS_PATH)
    await new Promise(resolve => { setTimeout(resolve, 100) })
    assert.equal(fake.readsOf(LESSONS_PATH), reads, 'an unchanged stat does not re-read')
    await fake.write(LESSONS_PATH, `${LESSONS_TEXT}${THIRD()}\n`)
    await until(() => source.getSnapshot().model.rows.length === 3, 'the polled append')
  }, 25)
})

test('a journal that is not there yet is an empty state, not a failure', async () => {
  await withSource(fakeRemote({}), PATHS, (source) => {
    assert.equal(source.getSnapshot().problem, null)
    assert.equal(source.getSnapshot().model.topLine, '这个项目还没有经验')
  })
})

test('the held source is one per session and paths, released with the last holder', () => {
  const { remote } = fakeRemote({ [LESSONS_PATH]: '' })
  const first = holdLessonsSource(remote, 's1', { lessons: LESSONS_PATH, project: null, user: null })
  const second = holdLessonsSource(remote, 's1', { lessons: LESSONS_PATH, project: null, user: null })
  assert.equal(first.source, second.source)
  second.release()
  first.release()
  const again = holdLessonsSource(remote, 's1', { lessons: LESSONS_PATH, project: null, user: null })
  assert.notEqual(again.source, first.source)
  again.release()
})

// --- The page never writes ---------------------------------------------------

const WRITE_MARK = /commands\.execute|<(?:button|input|textarea|select|form)[\s/>]/i

async function lessonsFiles(): Promise<readonly string[]> {
  const dir = join(import.meta.dirname, '..', 'ui', 'src', 'lessons')
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  return entries.filter(entry => entry.isFile() && /\.(ts|tsx)$/.test(entry.name)).map(entry => join(dir, entry.name))
}

test('no file under ui/src/lessons/ calls commands.execute or renders a write control', async () => {
  const files = await lessonsFiles()
  assert.ok(files.length >= 4, `the page package is there: ${files.length}`)
  for (const file of files) {
    const text = await readFile(file, 'utf8')
    assert.equal(WRITE_MARK.test(text), false, `${file} must not write: no commands.execute, no button, toggle or form`)
  }
})

test('the static check finds a planted command call or button', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lessons-panel-static-'))
  try {
    const guilty = join(dir, 'Guilty.tsx')
    await writeFile(guilty, 'export const x = () => commands.execute(sessionId, "/lessons show", [])\nexport const y = <button type="button">写</button>\n')
    await mkdir(join(dir, 'clean'), { recursive: true })
    await writeFile(join(dir, 'clean', 'clean.ts'), 'export const ok = 1\n')
    let found = 0
    for (const file of [guilty, join(dir, 'clean', 'clean.ts')]) {
      if (WRITE_MARK.test(await readFile(file, 'utf8'))) found += 1
    }
    assert.equal(found, 1)
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
})
