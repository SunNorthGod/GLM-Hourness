/**
 * The changed files of a step and the event `env.files-edited`
 * (src/env/edited.ts, M4 design §6.2, review N40): which calls count (GLM
 * aliases, DeferredToolCall, str_replace_editor but view, failed results),
 * where reading starts (the checks notice and the row's own mark), grouping
 * by checkout (a work tree is its own root), the 200-file cut, and the event
 * on the fake runtime: one per checkout, keys that do not collide, nothing
 * when nobody hears it or the board is absent, nothing twice.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { CHECKS_NOTICE_SOURCE } from '../src/env/check-notice.ts'
import { EDITED_FILES_LIMIT, editedGroups, editedSince } from '../src/env/edited.ts'
import { apply as envApply } from '../src/env/index.ts'
import { LOOPS_DECLARATION, LOOPS_SERVICE, type LoopEventInput, type LoopsService } from '../src/loops/service.ts'
import { matchesFilter } from '../src/loops/trigger.ts'
import { toNativeTool } from '../src/shared/dialect.ts'
import type { DerivedMessage } from '../src/shared/dsh-min.ts'
import { fakeRuntime } from './fake-rc3.ts'

const native = (name: string): string => toNativeTool(undefined, name)

const call = (id: string, name: string, args: Record<string, unknown>): DerivedMessage =>
  ({ role: 'assistant', source: { kind: 'model' }, content: [{ type: 'tool-call', id, name, arguments: JSON.stringify(args) }] })
const result = (id: string, isError = false): DerivedMessage =>
  ({ role: 'tool', toolCallId: id, isError, content: [{ type: 'text', text: isError ? 'failed' : 'ok' }] })

/** A repository with a work tree under .worktrees/t: the main checkout has a .git directory, the work tree a .git file. */
async function withCheckouts(body: (repo: string, tree: string) => Promise<void>): Promise<void> {
  const repo = await mkdtemp(join(tmpdir(), 'env-edited-'))
  try {
    const tree = join(repo, '.worktrees', 't')
    await mkdir(join(repo, '.git'), { recursive: true })
    await mkdir(join(repo, 'src'), { recursive: true })
    await mkdir(join(tree, 'src'), { recursive: true })
    await writeFile(join(tree, '.git'), `gitdir: ${join(repo, '.git', 'worktrees', 't')}\n`)
    await body(repo, tree)
  }
  finally {
    await rm(repo, { recursive: true, force: true })
  }
}

test('which calls count: write, edit, aliases, DeferredToolCall, str_replace_editor but view; failed and other calls do not', () => {
  const history = [
    call('c1', 'write', { file_path: '/r/a.ts', content: '' }), result('c1'),
    call('c2', 'Edit', { file_path: 'b.ts', old_string: 'x', new_string: 'y' }), result('c2'),
    call('c3', 'DeferredToolCall', { name: 'Write', input: { file_path: '/r/c.ts', content: '' } }), result('c3'),
    call('c4', 'str_replace_editor', { command: 'view', path: '/r/d.ts' }), result('c4'),
    call('c5', 'str_replace_editor', { command: 'create', path: '/r/e.ts' }), result('c5'),
    call('c6', 'write', { file_path: '/r/f.ts', content: '' }), result('c6', true),
    call('c7', 'read', { file_path: '/r/g.ts' }), result('c7'),
    call('c8', 'write', { file_path: '/r/a.ts', content: 'again' }), result('c8'),
  ]
  const edited = editedSince(history, undefined, native, '/r')
  assert.deepEqual(edited.targets.map(path => path.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')), ['/r/a.ts', '/r/b.ts', '/r/c.ts', '/r/e.ts'])
  assert.equal(edited.last, 'c8')
  // Without a working directory a relative path is skipped.
  assert.equal(editedSince(history, undefined, native, undefined).targets.length, 3)
})

test('reading starts after the later of the checks notice and the row\'s mark, and stops at a call without a result', () => {
  const notice: DerivedMessage = { role: 'user', source: { kind: CHECKS_NOTICE_SOURCE, checks: { lastCall: 'c2' } }, content: [{ type: 'text', text: 'checks' }] }
  const history = [
    call('c1', 'write', { file_path: '/r/a.ts' }), result('c1'),
    call('c2', 'write', { file_path: '/r/b.ts' }), result('c2'),
    notice,
    call('c3', 'write', { file_path: '/r/c.ts' }), result('c3'),
    call('c4', 'write', { file_path: '/r/d.ts' }), result('c4'),
    call('c5', 'write', { file_path: '/r/e.ts' }),
  ]
  const names = (mark: string | undefined): string[] => editedSince(history, mark, native, '/r').targets.map(path => path.replace(/\\/g, '/').split('/').at(-1) ?? '')
  assert.deepEqual(names(undefined), ['c.ts', 'd.ts'], 'after the notice; c5 has no result yet')
  assert.deepEqual(names('c1'), ['c.ts', 'd.ts'], 'the notice is later than the mark')
  assert.deepEqual(names('c3'), ['d.ts'], 'the mark is later than the notice')
  assert.equal(editedSince(history, 'c4', native, '/r').last, undefined, 'nothing new to read')
})

test('groups by checkout: a work tree is its own root, files are relative with forward slashes, a src/ filter matches (N40)', async () => {
  await withCheckouts(async (repo, tree) => {
    await writeFile(join(repo, 'src', 'a.ts'), 'a')
    await writeFile(join(tree, 'src', 'a.ts'), 'a')
    const groups = editedGroups([join(tree, 'src', 'a.ts'), join(repo, 'src', 'a.ts'), join(repo, 'src', 'gone.ts')])
    assert.deepEqual(groups.map(group => [group.root, group.files, group.truncated]), [[tree, ['src/a.ts'], false], [repo, ['src/a.ts'], false]])
    const [first] = groups
    assert.ok(first !== undefined)
    assert.equal(matchesFilter({ files: { paths: ['src/'] } }, { files: first.files }, first.root), true)
  })
})

test('at most 200 files in a group; the rest are dropped and the group says so', async () => {
  await withCheckouts(async (repo) => {
    const files = Array.from({ length: EDITED_FILES_LIMIT + 3 }, (_, index) => join(repo, 'src', `f${index}.txt`))
    for (const file of files) await writeFile(file, '')
    const [group] = editedGroups(files)
    assert.equal(group?.files.length, EDITED_FILES_LIMIT)
    assert.equal(group?.truncated, true)
  })
})

interface FakeBoard {
  readonly service: LoopsService
  readonly emitted: LoopEventInput[]
  hears: boolean
}

function fakeBoard(): FakeBoard {
  const board: FakeBoard = {
    emitted: [],
    hears: true,
    service: {
      declaration: LOOPS_DECLARATION,
      contribute: () => ({ ok: true, dispose: () => {}, accepted: [], dropped: [] }),
      emit: (event) => {
        board.emitted.push(event)
        return Promise.resolve({ ok: true as const, id: 'ev-x', duplicate: false })
      },
      listens: () => board.hears,
      recordRun: () => {},
    },
  }
  return board
}

/**
 * A session working directory beside the checkouts that is no project: the
 * env row's repository work (the `.llm/` ignore, the daily suppression count
 * that runs in the background) stays off, so nothing writes into the
 * fixture after it is removed. The edits name files by absolute path.
 */
async function withSessionDir(body: (cwd: string) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), 'env-edited-cwd-'))
  try {
    await body(cwd)
  }
  finally {
    await rm(cwd, { recursive: true, force: true })
  }
}

test('on the fake runtime: one event per checkout with keys that do not collide, nothing twice, nothing unheard', async () => {
  await withCheckouts(async (repo, tree) => withSessionDir(async (cwd) => {
    const board = fakeBoard()
    const runtime = fakeRuntime({ natives: [], cwd })
    runtime.ctx.provide(LOOPS_SERVICE, board.service)
    const dispose = envApply(runtime.ctx)
    await runtime.create()
    await writeFile(join(repo, 'src', 'a.ts'), 'a')
    await writeFile(join(tree, 'src', 'b.ts'), 'b')
    runtime.history.push(
      call('c1', 'write', { file_path: join(repo, 'src', 'a.ts'), content: 'a' }), result('c1'),
      call('c2', 'DeferredToolCall', { name: 'Write', input: { file_path: join(tree, 'src', 'b.ts'), content: 'b' } }), result('c2'),
    )
    await runtime.preStep({ turn: 2, step: 3 })
    assert.deepEqual(board.emitted.map(event => [event.event, event.key, event.payload.root, event.payload.files, event.payload.truncated, event.cwd, event.session]), [
      ['env.files-edited', 'files-edited:agent-1:2-3', repo, ['src/a.ts'], false, cwd, 'agent-1'],
      ['env.files-edited', 'files-edited:agent-1:2-3-2', tree, ['src/b.ts'], false, cwd, 'agent-1'],
    ])
    // The next step has no new call: nothing again.
    await runtime.preStep({ turn: 2, step: 4 })
    assert.equal(board.emitted.length, 2)
    // Nobody hears it: a new edit emits nothing, and is not emitted later either.
    board.hears = false
    runtime.history.push(call('c3', 'write', { file_path: join(repo, 'src', 'a.ts'), content: 'a2' }), result('c3'))
    await runtime.preStep({ turn: 2, step: 5 })
    board.hears = true
    await runtime.preStep({ turn: 2, step: 6 })
    assert.equal(board.emitted.length, 2)
    dispose()
  }))
})

test('without the loop board nothing is emitted and the step goes on', async () => {
  await withCheckouts(async (repo) => withSessionDir(async (cwd) => {
    const runtime = fakeRuntime({ natives: [], cwd })
    const dispose = envApply(runtime.ctx)
    await runtime.create()
    await writeFile(join(repo, 'src', 'a.ts'), 'a')
    runtime.history.push(call('c1', 'write', { file_path: join(repo, 'src', 'a.ts'), content: 'a' }), result('c1'))
    const decision = await runtime.preStep({ turn: 1, step: 2 })
    assert.equal(decision.kind, 'enter')
    dispose()
  }))
})
