import assert from 'node:assert/strict'
import test from 'node:test'
import { acceptancePathsOf, FLOOR_FORMS, floorHits, floorPathIn, isTestPath, parseFloor, pathEscalationReason, type FloorCall } from '../src/execute/floor.ts'
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
  if (process.platform === 'win32') {
    assert.deepEqual(floorHits(floor, { paths: [], deleted: [] }, [call({ writes: true, paths: ['c:\\repo\\.worktrees\\hz-t\\src\\a'], shell: false, tool: 'write' })], 'C:\\repo\\.worktrees\\hz-t'), [], 'mixed drive-letter casing inside worktree is allowed')
    assert.deepEqual(floorHits(floor, { paths: [], deleted: [] }, [call({ writes: true, paths: ['C:\\repo\\.worktrees\\hz-t2\\src\\a'], shell: false, tool: 'write' })], 'C:\\repo\\.worktrees\\hz-t'), [{ index: '3', reason: 'a write outside the worktree' }], 'sibling directory prefix is outside worktree')
  }
  assert.deepEqual(floorHits(floor, { paths: [], deleted: [] }, [call({ writes: true, paths: ['/w2/a'], shell: false, tool: 'write' })], '/w'), [{ index: '3', reason: 'a write outside the worktree' }], 'POSIX sibling directory prefix is outside worktree')
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

// ---- the handback path check (m7-handback-path-check) ----

test('isTestPath: a test directory segment or a test-shaped basename, case-insensitively; look-alikes stay out', () => {
  const yes = ['tests/feed.spec.ts', 'src/__tests__/feed.ts', 'site/feed/feed.spec.js', 'site/feed/feed_test.go', 'tests/test_feed.py', 'spec/loader.ts', 'test.ts', 'Site/Feed/SPEC.ts']
  for (const path of yes) assert.equal(isTestPath(path), true, path)
  const no = ['src/feed.ts', 'site/feed/feed.json', 'src/contest.ts', 'src/latest.ts', 'src/probertest.mjs', 'docs/testing.md']
  for (const path of no) assert.equal(isTestPath(path), false, path)
})

test('acceptancePathsOf: the backtick spans that name a path by shape; prose, commands and identifiers stay out', () => {
  assert.deepEqual(acceptancePathsOf(['改动落在 `src/execute/` 里', '文档照 `docs/ORCHESTRATION.md` §3']), ['src/execute/', 'docs/ORCHESTRATION.md'])
  assert.deepEqual(acceptancePathsOf(['`npm run -s graph -- show m7-habits` 能跑', '按 `briefGate` 判，规则在 `worker-scope`']), [])
  assert.deepEqual(acceptancePathsOf(['路径 `src/../etc` 与绝对 `/etc/x` 与通配 `a/*.ts` 都不算']), [])
  assert.deepEqual(acceptancePathsOf(['同名段落只记一次 `src/a.ts` `src/a.ts`']), ['src/a.ts'])
  assert.deepEqual(acceptancePathsOf([]), [])
})

test('pathEscalationReason: an all-test change and untouched acceptance paths escalate, other changes do not (m7-handback-path-check)', () => {
  // Escalation one: every changed path a test file.
  assert.equal(pathEscalationReason(['the feed builds'], { paths: ['tests/feed.spec.ts', 'src/feed.test.js'], deleted: [] }), '审查改为全审：改动全在测试文件里')
  // A change the diff did not answer for is unknown: nothing escalates.
  assert.equal(pathEscalationReason(['the feed builds'], { paths: [], deleted: [] }), undefined)
  // Escalation two: the acceptance names backtick paths and none was touched; a directory prefix counts as touched.
  const named = ['the change touches `site/feed/` and `docs/notes.md`']
  assert.match(pathEscalationReason(named, { paths: ['src/other.js'], deleted: [] }) ?? '', /^审查改为全审：验收点名的路径一个都没改（site\/feed\/, docs\/notes\.md）$/)
  assert.equal(pathEscalationReason(named, { paths: ['site/feed/feed.json'], deleted: [] }), undefined)
  // No backtick paths in the acceptance: the second trigger has nothing to check.
  assert.equal(pathEscalationReason(['the feed builds'], { paths: ['src/other.js'], deleted: [] }), undefined)
  // All-test wins over the named-path reason when both fire.
  const both = ['the change touches `site/feed/feed.json`']
  assert.equal(pathEscalationReason(both, { paths: ['tests/feed.spec.ts'], deleted: [] }), '审查改为全审：改动全在测试文件里')
  // The named-path reason lists at most three paths.
  const many = ['碰到 `a/1.ts` `a/2.ts` `a/3.ts` `a/4.ts` 一个都没改就全审']
  assert.match(pathEscalationReason(many, { paths: ['src/x.js'], deleted: [] }) ?? '', /（a\/1\.ts, a\/2\.ts, a\/3\.ts, …）$/)
})
