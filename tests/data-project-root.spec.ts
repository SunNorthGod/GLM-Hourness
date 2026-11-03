/**
 * The two functions M5 added to src/data/project-root.ts (design §5.5):
 * `projectDirOf`, which only names the project's `.llm`, and
 * `ensureProjectDir`, which makes it ignored and then creates it. `projectOf`
 * itself is tested with the rules board (tests/rules-engine.spec.ts). Every
 * case builds its own repository layout under the temporary directory, so
 * nothing touches this repository's `.git/info/exclude` or `.llm/`.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import test from 'node:test'
import { ensureProjectDir, projectDirOf } from '../src/data/project-root.ts'
import { skipIfTempInsideGit } from './temp-outside-git.ts'

const scratch = (): string => mkdtempSync(join(tmpdir(), 'project-dir-'))

/** A repository root with an empty `.git`. */
function repository(): string {
  const root = scratch()
  mkdirSync(join(root, '.git', 'info'), { recursive: true })
  return root
}

const excludeOf = (root: string): string => readFileSync(join(root, '.git', 'info', 'exclude'), 'utf8')

test('projectDirOf: the .llm of the repository root, from the root or from a folder below it', () => {
  const root = repository()
  mkdirSync(join(root, 'src', 'deep'), { recursive: true })
  assert.equal(projectDirOf(root), join(root, '.llm'))
  assert.equal(projectDirOf(join(root, 'src', 'deep')), join(root, '.llm'))
})

test('projectDirOf: a work tree has the .llm of its main checkout', () => {
  const base = scratch()
  const main = join(base, 'main')
  mkdirSync(join(main, '.git', 'worktrees', 'wt'), { recursive: true })
  writeFileSync(join(main, '.git', 'worktrees', 'wt', 'commondir'), '../..\n')
  const wt = join(base, 'wt')
  mkdirSync(join(wt, 'inner'), { recursive: true })
  writeFileSync(join(wt, '.git'), `gitdir: ${join(main, '.git', 'worktrees', 'wt')}\n`)
  assert.equal(projectDirOf(join(wt, 'inner')), join(main, '.llm'))
})

test('projectDirOf: the home directory and a drive root are never projects, whatever they hold', () => {
  const root = repository()
  mkdirSync(join(root, '.llm'))
  assert.equal(projectDirOf(root, root), undefined, 'the user\'s home folder')
  assert.equal(projectDirOf(parse(root).root), undefined, 'a drive root')
})

test('projectDirOf: outside git only a folder that already has .llm is a project, and one made later is found at once', { skip: skipIfTempInsideGit() }, () => {
  const folder = scratch()
  assert.equal(projectDirOf(folder), undefined)
  mkdirSync(join(folder, '.llm'))
  assert.equal(projectDirOf(folder), join(folder, '.llm'))
})

test('projectDirOf writes nothing: no .llm folder and no ignore line', () => {
  const root = repository()
  projectDirOf(root)
  assert.ok(!existsSync(join(root, '.llm')))
  assert.ok(!existsSync(join(root, '.git', 'info', 'exclude')))
})

test('ensureProjectDir: .llm/ is made ignored first, then created; a second call neither repeats the line nor fails', async () => {
  const root = repository()
  await ensureProjectDir(join(root, '.llm'))
  assert.ok(existsSync(join(root, '.llm')))
  assert.equal(excludeOf(root), '.llm/\n')
  await ensureProjectDir(join(root, '.llm'))
  assert.equal(excludeOf(root), '.llm/\n')
})

test('ensureProjectDir: an ignore line the repository already has is not repeated, and the line is added after an exclude file that lacks a final newline', async () => {
  const known = repository()
  writeFileSync(join(known, '.git', 'info', 'exclude'), '# local\n/.llm\n')
  await ensureProjectDir(join(known, '.llm'))
  assert.equal(excludeOf(known), '# local\n/.llm\n')
  const bare = repository()
  writeFileSync(join(bare, '.git', 'info', 'exclude'), '*.log')
  await ensureProjectDir(join(bare, '.llm'))
  assert.equal(excludeOf(bare), '*.log\n.llm/\n')
})

test('ensureProjectDir: when the ignore line cannot be written the error comes out and .llm/ is not created', async () => {
  const root = repository()
  mkdirSync(join(root, '.git', 'info', 'exclude')) // a folder where the file should be
  await assert.rejects(ensureProjectDir(join(root, '.llm')))
  assert.ok(!existsSync(join(root, '.llm')))
})

test('ensureProjectDir: a folder with another name (the probe\'s and the tests\' explicit one) is only created, even inside a repository', async () => {
  const root = repository()
  await ensureProjectDir(join(root, 'scratch', 'memory'))
  assert.ok(existsSync(join(root, 'scratch', 'memory')))
  assert.ok(!existsSync(join(root, '.git', 'info', 'exclude')))
})

test('ensureProjectDir: outside a repository .llm is created and nothing is written elsewhere', { skip: skipIfTempInsideGit() }, async () => {
  const folder = scratch()
  await ensureProjectDir(join(folder, '.llm'))
  assert.ok(existsSync(join(folder, '.llm')))
  assert.ok(!existsSync(join(folder, '.git')))
})
