import assert from 'node:assert/strict'
import { posix, win32 } from 'node:path'
import test from 'node:test'
import { checkNode, type GraphIssue } from '../src/graph/format.ts'
import { isScopePath, overlaps, repoRelative, within } from '../src/execute/scope.ts'

test('within: compares whole segments; a directory entry contains its files and itself, a file entry only itself', () => {
  const scope = ['src/execute/', 'docs/DESIGN.md']
  assert.equal(within(scope, 'src/execute/scope.ts'), true)
  assert.equal(within(scope, 'src/execute/deep/er/x.ts'), true)
  assert.equal(within(scope, 'src/execute'), true)
  assert.equal(within(scope, 'src/execute/'), true)
  assert.equal(within(scope, 'src/execute2/x.ts'), false)
  assert.equal(within(scope, 'src/exec'), false)
  assert.equal(within(scope, 'src/other.ts'), false)
  assert.equal(within(scope, 'docs/DESIGN.md'), true)
  assert.equal(within(scope, 'docs/DESIGN.md/inner'), false)
  assert.equal(within(scope, 'docs/DESIGN.md2'), false)
  assert.equal(within(scope, 'docs'), false)
  assert.equal(within(['src2/'], 'src/a.ts'), false)
  assert.equal(within(['src/'], 'src2/a.ts'), false)
})

test('within: a plan path that is itself a directory fits only a directory entry that holds it', () => {
  assert.equal(within(['src/'], 'src/execute/'), true)
  assert.equal(within(['src/execute/'], 'src/'), false)
  assert.equal(within(['src/execute'], 'src/execute/'), false)
  assert.equal(within(['src/execute'], 'src/execute'), true)
  assert.equal(within(['src/execute/'], 'src/execute'), true)
})

test('within: an empty scope contains nothing, and any one entry that fits is enough', () => {
  assert.equal(within([], 'src/a.ts'), false)
  assert.equal(within(['lib/', 'src/'], 'src/a.ts'), true)
})

test('within: segments are compared exactly, case included', () => {
  assert.equal(within(['src/'], 'Src/a.ts'), false)
  assert.equal(within(['src/Foo.ts'], 'src/foo.ts'), false)
  assert.equal(within(['src/Foo.ts'], 'src/Foo.ts'), true)
})

test('within: text that is no scope path is never inside, whatever the scope says', () => {
  const scope = ['src/', 'docs/a.md']
  for (const target of ['src/../etc/passwd', '../src/a.ts', 'src/./a.ts', 'src//a.ts', '/src/a.ts', 'src\\a.ts', 'C:/src/a.ts', 'src/*.ts', 'src/a?.ts', 'src/a\u0000.ts', '', '/']) {
    assert.equal(within(scope, target), false, JSON.stringify(target))
  }
  // A malformed entry contains nothing, not even itself.
  assert.equal(within(['src/../'], 'src/a.ts'), false)
  assert.equal(within(['..'], '..'), false)
  assert.equal(within(['src//'], 'src/a.ts'), false)
})

test('isScopePath agrees with the graph format on what a write scope entry may be', () => {
  const candidates = [
    'src/', 'src', 'src/a.ts', 'a', 'a/b/', 'docs/DESIGN.md', 'src/a b.ts', 'src/é.ts',
    '', '/', '//', 'src//', 'src//a', '/src', './src', 'src/.', 'src/..', '../src', 'src/../a',
    'a\\b', 'C:/a', 'a:b', 'src/*', 'a?', 'a"b', 'a<b', 'a>b', 'a|b', 'a\tb', 'a\u0000b', 'a\u001fb',
  ]
  for (const candidate of candidates) {
    const issues: GraphIssue[] = []
    checkNode({
      id: 'task-1', type: 'task', title: 't', status: 'approved', parent: 'feature-1', writeScope: [candidate],
      history: [{ at: '2026-10-30T08:00:00.000Z', actor: 'human', op: 'propose', reason: 'r', to: 'approved' }],
    }, 'nodes/task-1.json', issues)
    const graphAccepts = !issues.some(issue => issue.severity === 'error' && issue.field?.startsWith('writeScope'))
    assert.equal(isScopePath(candidate), graphAccepts, JSON.stringify(candidate))
  }
})

test('overlaps: containment either way counts; siblings and prefixes of a name do not', () => {
  assert.equal(overlaps(['src/'], ['src/execute/']), true)
  assert.equal(overlaps(['src/execute/'], ['src/']), true)
  assert.equal(overlaps(['src/a.ts'], ['src/a.ts']), true)
  assert.equal(overlaps(['src/'], ['src/a.ts']), true)
  assert.equal(overlaps(['src/a.ts'], ['src/b.ts']), false)
  assert.equal(overlaps(['src/'], ['src2/']), false)
  assert.equal(overlaps(['src/execute/'], ['src/graph/']), false)
  assert.equal(overlaps(['src/a.ts'], ['src/a.ts/inner']), false)
  assert.equal(overlaps(['a/', 'b/'], ['c/', 'b/x.ts']), true)
  assert.equal(overlaps(['a/', 'b/'], ['c/', 'd/']), false)
})

test('overlaps: a scope without entries meets nothing, and case is ignored because the file system may', () => {
  assert.equal(overlaps([], ['src/']), false)
  assert.equal(overlaps(['src/'], []), false)
  assert.equal(overlaps([], []), false)
  assert.equal(overlaps(['Src/'], ['src/a.ts']), true)
  assert.equal(overlaps(['src/A.ts'], ['SRC/a.ts']), true)
})

test('overlaps: a malformed entry serializes the work instead of hiding it', () => {
  assert.equal(overlaps(['src/../'], ['lib/']), true)
  assert.equal(overlaps(['lib/'], ['src//']), true)
  assert.equal(overlaps(['src/../'], []), false)
})

test('repoRelative on POSIX paths: inside, outside, dot-dot, the root, absolute targets and .git', () => {
  const root = '/ws/.worktrees/hz-t'
  assert.equal(repoRelative(root, root, 'src/a.ts', posix), 'src/a.ts')
  assert.equal(repoRelative(root, `${root}/src`, 'a.ts', posix), 'src/a.ts')
  assert.equal(repoRelative(root, `${root}/src`, '../lib/b.ts', posix), 'lib/b.ts')
  assert.equal(repoRelative(root, root, `${root}/docs/x.md`, posix), 'docs/x.md')
  assert.equal(repoRelative(root, root, '.', posix), '')
  assert.equal(repoRelative(root, root, '..', posix), undefined)
  assert.equal(repoRelative(root, root, '../hz-other/a.ts', posix), undefined)
  assert.equal(repoRelative(root, `${root}/src`, '../../a.ts', posix), undefined)
  assert.equal(repoRelative(root, root, '/etc/passwd', posix), undefined)
  assert.equal(repoRelative(root, root, '/ws/.worktrees/hz-t2/a.ts', posix), undefined)
  assert.equal(repoRelative(root, root, '.git/config', posix), undefined)
  assert.equal(repoRelative(root, root, '.git', posix), undefined)
  assert.equal(repoRelative(root, root, 'src/../.git/hooks/pre-commit', posix), undefined)
  assert.equal(repoRelative(root, root, '.GIT/config', posix), undefined)
  assert.equal(repoRelative(root, root, '.git./config', posix), undefined)
  assert.equal(repoRelative(root, root, '.github/workflows/x.yml', posix), '.github/workflows/x.yml')
  assert.equal(repoRelative(root, root, 'vendor/x/.git/config', posix), 'vendor/x/.git/config')
  assert.equal(repoRelative(root, root, 'a\\b', posix), 'a\\b')
})

test('repoRelative on Windows paths: the root matches without regard to case or separator, other drives are outside', () => {
  const root = 'C:\\ws\\.worktrees\\hz-t'
  assert.equal(repoRelative(root, root, 'src\\a.ts', win32), 'src/a.ts')
  assert.equal(repoRelative(root, root, 'src/a.ts', win32), 'src/a.ts')
  assert.equal(repoRelative(root, root, 'src/deep\\b/c.ts', win32), 'src/deep/b/c.ts')
  assert.equal(repoRelative(root, 'c:\\WS\\.worktrees\\HZ-T\\src', 'a.ts', win32), 'src/a.ts')
  assert.equal(repoRelative(root, root, 'c:/ws/.worktrees/hz-t/docs/x.md', win32), 'docs/x.md')
  assert.equal(repoRelative(root, root, 'D:\\ws\\.worktrees\\hz-t\\a.ts', win32), undefined)
  assert.equal(repoRelative(root, root, '..\\hz-other\\a.ts', win32), undefined)
  assert.equal(repoRelative(root, root, 'C:\\ws\\.worktrees\\hz-t2\\a.ts', win32), undefined)
  assert.equal(repoRelative(root, root, '.git\\config', win32), undefined)
  assert.equal(repoRelative(root, root, '.GIT\\config', win32), undefined)
  assert.equal(repoRelative(root, root, '.git.\\config', win32), undefined)
  assert.equal(repoRelative(root, root, '.git \\config', win32), undefined)
  assert.equal(repoRelative(root, root, '.', win32), '')
})

test('repoRelative feeds within: the end-to-end verdict for a worker write', () => {
  const root = '/ws/.worktrees/hz-t'
  const scope = ['src/execute/']
  const verdict = (target: string): boolean => {
    const relative = repoRelative(root, root, target, posix)
    return relative !== undefined && within(scope, relative)
  }
  assert.equal(verdict('src/execute/scope.ts'), true)
  assert.equal(verdict('src/execute/../graph/x.ts'), false)
  assert.equal(verdict('src/execute/../../.git/config'), false)
  assert.equal(verdict('/ws/src/execute/scope.ts'), false)
})
