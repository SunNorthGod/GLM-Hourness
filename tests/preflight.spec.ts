import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { PACKAGES, SHARED_DIR } from '../scripts/packages.mjs'
import { tableProblems } from '../scripts/preflight-bundle.mjs'

const REPO = join(import.meta.dirname, '..')
const TABLE = {
  SHARED_DIR: 'shared',
  PACKAGES: [
    { key: 'glm', src: ['glm-llm', 'glm-prompt'] },
    { key: 'hourness', src: ['graph', 'guard'] },
  ],
}

/** A temporary repository whose src/ holds `dirs` (nested paths allowed); removed after `check`. */
function withSrc(dirs: readonly string[], check: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'preflight-'))
  try {
    for (const dir of dirs) mkdirSync(join(root, 'src', dir), { recursive: true })
    check(root)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const LAYOUT = ['shared', 'glm-llm/auth', 'glm-prompt', 'graph', 'guard']

test('the repository table holds on the repository', () => {
  assert.deepEqual(tableProblems(REPO, { SHARED_DIR, PACKAGES }), [])
})

test('a table matching its src/ passes; nested directories with their own names are fine', () => {
  withSrc(LAYOUT, root => assert.deepEqual(tableProblems(root, TABLE), []))
})

test('a source directory in two packages, a repeated key, or shared listed by a package fails', () => {
  withSrc(LAYOUT, (root) => {
    const [glm] = TABLE.PACKAGES
    const twice = { ...TABLE, PACKAGES: [glm, { key: 'hourness', src: ['graph', 'guard', 'glm-prompt'] }] }
    assert.deepEqual(tableProblems(root, twice), ['source directory src/glm-prompt belongs to both glm and hourness'])
    const repeated = { ...TABLE, PACKAGES: [...TABLE.PACKAGES, { key: 'glm', src: [] }] }
    assert.deepEqual(tableProblems(root, repeated), ['package key glm is registered twice'])
    const shared = { ...TABLE, PACKAGES: [glm, { key: 'hourness', src: ['graph', 'guard', 'shared'] }] }
    assert.deepEqual(tableProblems(root, shared), ['package hourness lists the shared library shared as its own source directory'])
  })
})

test('a top-level directory under src/ that no package lists fails; so does a registered directory that is missing', () => {
  withSrc([...LAYOUT, 'bootstrap'], root => assert.deepEqual(tableProblems(root, TABLE), ['src/bootstrap belongs to no package: register it in scripts/packages.mjs']))
  withSrc(LAYOUT.filter(dir => dir !== 'guard'), root => assert.deepEqual(tableProblems(root, TABLE), ['src/guard is registered but does not exist']))
})

test('a nested directory named after another package\'s directory, or named src, fails; under src/shared/ any package name fails', () => {
  withSrc([...LAYOUT, 'glm-llm/graph'], root => assert.deepEqual(tableProblems(root, TABLE), [
    'src/glm-llm/graph has the name of another package\'s directory src/graph; the boundary patterns would read imports of it as crossing',
  ]))
  withSrc([...LAYOUT, 'guard/deep/glm-prompt'], root => assert.equal(tableProblems(root, TABLE).length, 1))
  withSrc([...LAYOUT, 'graph/src'], root => assert.deepEqual(tableProblems(root, TABLE), ['src/graph/src is named src, which the boundary patterns read as the top of src/']))
  withSrc([...LAYOUT, 'shared/guard', 'shared/glm-llm'], root => assert.equal(tableProblems(root, TABLE).length, 2))
  withSrc([...LAYOUT, 'graph/graph', 'glm-llm/glm-prompt'], root => assert.deepEqual(tableProblems(root, TABLE), []))
})
