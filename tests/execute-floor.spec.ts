import assert from 'node:assert/strict'
import test from 'node:test'
import { FLOOR_FORMS, floorHits, floorPathIn, parseFloor, type FloorCall } from '../src/execute/floor.ts'
import { node } from './execute-helpers.ts'

const floorNode = (acceptance: readonly string[]) => node({ id: 'norm-review-floor', type: 'norm', acceptance }, 0, 'human')
const call = (over: Partial<FloorCall> = {}): FloorCall => ({ tool: 'pwsh', words: [['node', 'build.mjs']], git: [], paths: [], writes: false, shell: true, ...over })

test('FLOOR_FORMS: the four judgement forms', () => {
  assert.deepEqual([...FLOOR_FORMS], ['files', 'deletes', 'commands', 'outside'])
})

test('parseFloor: the four forms, the unparsed lines, and the prose backticks that are not forms', () => {
  const floor = parseFloor(floorNode([
    '改到守卫的代码 `files src/guard/`',
    '动了删除 `deletes`',
    '跑了危险命令 `commands git push, rm -rf`',
    '写到了工作树外 `outside`',
    '两类一起 `files src/a/` `deletes`',
  ]))
  assert.deepEqual(floor.unparsed, [])
  assert.deepEqual(floor.entries.map(entry => entry.index), [0, 1, 2, 3, 4])
  assert.deepEqual(floor.entries[0]?.tests, [{ form: 'files', paths: ['src/guard/'] }])
  assert.deepEqual(floor.entries[1]?.tests, [{ form: 'deletes' }])
  assert.deepEqual(floor.entries[2]?.tests, [{ form: 'commands', words: [['git', 'push'], ['rm', '-rf']] }])
  assert.deepEqual(floor.entries[3]?.tests, [{ form: 'outside' }])
  assert.deepEqual(floor.entries[4]?.tests, [{ form: 'files', paths: ['src/a/'] }, { form: 'deletes' }])

  // A line without any trailing segment is unparsed, and so is a malformed one.
  const strict = parseFloor(floorNode(['本仓库已批准的人话一条', '路径写错 `file src/`', '绝对路径 `files /etc`', '空列表 `files `', '越界 `files src/../etc`', '通配 `files src/*.ts`']))
  assert.deepEqual(strict.entries, [])
  assert.deepEqual(strict.unparsed, [0, 1, 2, 3, 4, 5])
  // Mid-text backticks are not forms; the line still has no judgement.
  const mid = parseFloor(floorNode(['人话里的 `~/.dsh` 不算']))
  assert.deepEqual(mid.unparsed, [0])
  // No node at all: this project has no floor.
  assert.deepEqual(parseFloor(undefined), { entries: [], unparsed: [] })
})

test('floorHits: files, deletes, commands and outside, and the strict answer when lines are unparsed', () => {
  const floor = parseFloor(floorNode([
    '改到守卫的代码 `files src/guard/`',
    '动了删除 `deletes`',
    '跑了危险命令 `commands git push`',
    '写到了工作树外 `outside`',
  ]))
  assert.deepEqual(floorHits(floor, { paths: ['src/guard/main-agent.ts'], deleted: [] }, [], '/repo/.worktrees/hz-t'), [{ index: '0', reason: 'src/guard/main-agent.ts' }])
  // A sibling directory is not the prefix.
  assert.deepEqual(floorHits(floor, { paths: ['src/guardx/a.ts'], deleted: [] }, [], '/w'), [])
  assert.deepEqual(floorHits(floor, { paths: [], deleted: ['src/old.ts'] }, [], '/w'), [{ index: '1', reason: 'deleted src/old.ts' }])
  // The command matches by whole words from the start; refused calls count too.
  assert.deepEqual(floorHits(floor, { paths: [], deleted: [] }, [call({ words: [['git', 'push', 'origin']] })], '/w'), [{ index: '2', reason: 'git push' }])
  assert.deepEqual(floorHits(floor, { paths: [], deleted: [] }, [call({ git: [{ sub: 'push', args: ['origin'] }] })], '/w'), [{ index: '2', reason: 'git push' }])
  assert.deepEqual(floorHits(floor, { paths: [], deleted: [] }, [call({ words: [['npm', 'run', 'push']] })], '/w'), [])
  // outside: a write outside the worktree, or any absolute path in a shell call; a home path is always outside.
  assert.deepEqual(floorHits(floor, { paths: [], deleted: [] }, [call({ writes: true, paths: ['C:\\other\\x'], shell: false, tool: 'write' })], 'C:\\repo\\.worktrees\\hz-t'), [{ index: '3', reason: 'a write outside the worktree' }])
  assert.deepEqual(floorHits(floor, { paths: [], deleted: [] }, [call({ writes: false, paths: ['C:\\repo\\.worktrees\\hz-t\\src\\a'], shell: true })], 'C:\\repo\\.worktrees\\hz-t'), [])
  assert.deepEqual(floorHits(floor, { paths: [], deleted: [] }, [call({ writes: true, paths: ['~/.dsh/profile'] })], '/w'), [{ index: '3', reason: 'a write outside the worktree' }])
  // A read tool outside is not a write outside.
  assert.deepEqual(floorHits(floor, { paths: [], deleted: [] }, [call({ writes: false, shell: false, tool: 'read', paths: ['/elsewhere/x'] })], '/w'), [])

  // Unparsed lines: every change hits once, naming the lines.
  const strict = parseFloor(floorNode(['人话一条', '写错 `file x`']))
  assert.deepEqual(strict.unparsed, [0, 1])
  assert.deepEqual(floorHits(strict, { paths: ['src/plain/x.ts'], deleted: [] }, [], '/w'), [{ index: '0,1', reason: 'unparsed' }])
})

test('floorHits: an unsplitable shell text hits every commands line, and matching is case-insensitive', () => {
  const floor = parseFloor(floorNode(['跑了危险命令 `commands git push`', '改到守卫 `files src/Guard/`']))
  assert.deepEqual(floorHits(floor, { paths: [], deleted: [] }, [call({ words: null })], '/w'), [{ index: '0', reason: '1 command unreadable' }])
  assert.deepEqual(floorHits(floor, { paths: ['src/GUARD/A.ts'], deleted: [] }, [], '/w'), [{ index: '1', reason: 'src/GUARD/A.ts' }])
  assert.deepEqual(floorPathIn(['src/guard/'], 'src/guard/a.ts'), true)
  assert.deepEqual(floorPathIn(['src/guard'], 'src/guard/a.ts'), false)
})

test('a file-tool call has no shell words to split, so it does not hit a commands line', () => {
  const floor = parseFloor(floorNode(['跑了危险命令 `commands git push`']))
  assert.deepEqual(floorHits(floor, { paths: [], deleted: [] }, [call({ tool: 'write', words: undefined, writes: true, shell: false })], '/w'), [])
})
