/**
 * Where a probe scenario's sessions work (scripts/sandbox.mjs
 * scenarioWorkspace; loop board design 0.6 §9.1, docs/DEVELOPMENT.md §3):
 * in a git repository of the scenario's own, so the rows that keep project
 * state under the project root write inside the run directory and never into
 * the project of the checkout the probe runs from (a work tree's project is
 * its main checkout's). The repositories are temporary directories of the
 * test; the run directory itself is not booted. Where the run directory is
 * (scripts/sandbox.mjs openRunDir, removeRunDir): directly under the
 * temporary root, outside the repository tree, and its deletion never
 * follows a junction into the checkout.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative } from 'node:path'
import test from 'node:test'
import { initRepo, openRunDir, removeRunDir, repo, scenarioWorkspace } from '../scripts/sandbox.mjs'

const head = (dir: string): string => spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout.trim()
/** The repository a directory is in, as a real path in lower case, so the two spellings of one Windows path compare equal. */
const topLevel = (dir: string): string => realpathSync.native(spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8' }).stdout.trim()).toLowerCase()
const real = (dir: string): string => realpathSync.native(dir).toLowerCase()

function withRunDir(body: (runDir: string) => void): void {
  const runDir = mkdtempSync(join(tmpdir(), 'glmh-probe-ws-'))
  try {
    body(runDir)
  }
  finally {
    rmSync(runDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 20 })
  }
}

test('a scenario that names no directory, or this checkout, works in its own scenario directory, made a repository with its files committed', () => {
  withRunDir((runDir) => {
    const dir = join(runDir, 'glm')
    mkdirSync(join(dir, 'home'), { recursive: true })
    writeFileSync(join(dir, 'home', 'memory.jsonl'), '{}\n')
    assert.equal(scenarioWorkspace(dir, repo), dir)
    assert.ok(existsSync(join(dir, '.git')))
    assert.equal(topLevel(dir), real(dir))
    assert.equal(spawnSync('git', ['ls-files'], { cwd: dir, encoding: 'utf8' }).stdout.trim(), 'home/memory.jsonl')
  })
})

test('a named directory that is not a repository is made one; one that is stays as it was', () => {
  withRunDir((runDir) => {
    const plain = join(runDir, 'glm-guard-paths', 'ws')
    mkdirSync(plain, { recursive: true })
    writeFileSync(join(plain, 'README.md'), 'probe workspace\n')
    assert.equal(scenarioWorkspace(join(runDir, 'glm-guard-paths'), plain), plain)
    assert.equal(topLevel(plain), real(plain))
    // The scenario directory above it is not touched: the workspace is the one the scenario named.
    assert.ok(!existsSync(join(runDir, 'glm-guard-paths', '.git')))

    // An empty directory gets an empty first commit, so it is a repository with a HEAD all the same.
    const empty = join(runDir, 'non-glm-guard', 'ws')
    mkdirSync(empty, { recursive: true })
    assert.equal(scenarioWorkspace(join(runDir, 'non-glm-guard'), empty), empty)
    assert.match(head(empty), /^[0-9a-f]{40}$/)

    const ready = join(runDir, 'rules-peak', 'ws')
    mkdirSync(ready, { recursive: true })
    writeFileSync(join(ready, 'README.md'), 'probe workspace\n')
    assert.ok(initRepo(ready))
    const before = head(ready)
    writeFileSync(join(ready, 'README.md'), 'edited by the scenario\n')
    assert.equal(scenarioWorkspace(join(runDir, 'rules-peak'), ready), ready)
    assert.equal(head(ready), before)
    assert.equal(readFileSync(join(ready, 'README.md'), 'utf8'), 'edited by the scenario\n')
  })
})

test('every probe scenario boots in the directory scenarioWorkspace gives: the one spawn of the runtime takes its cwd from it', () => {
  const text = readFileSync(new URL('../scripts/probe/run-probe.mjs', import.meta.url), 'utf8')
  const runner = /function runScenario\([^)]*\) \{[\s\S]*?\n\}\n/.exec(text)?.[0] ?? ''
  assert.ok(runner.includes('const workspace = scenarioWorkspace(dir, cwd)'), 'runScenario asks scenarioWorkspace for the directory')
  assert.ok(runner.includes('spawnSync(exe, args, { cwd: workspace,'), 'the runtime is spawned in that directory')
  // No other place boots the runtime: every scenario goes through runScenario.
  assert.equal(text.match(/sandboxCommand\(/g)?.length, 1)
})

test('a probe run directory is a new directory directly under the temporary root, outside the checkout and outside any repository', () => {
  const dir = openRunDir('2026-11-06T00-00-00-000Z')
  try {
    assert.equal(real(dirname(dir)), real(tmpdir()))
    assert.match(basename(dir), /^glm-hourness-probe-2026-11-06T00-00-00-000Z-/)
    assert.ok(relative(repo, dir).startsWith('..') || isAbsolute(relative(repo, dir)), `${dir} is outside ${repo}`)
    // No repository above it: a scenario directory under it that is not made one has no project root to fall back to.
    assert.notEqual(spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8' }).status, 0)
  }
  finally {
    removeRunDir(dir)
  }
  assert.ok(!existsSync(dir))
})

test('removeRunDir unlinks the junctions inside before deleting, so the directory they point to keeps its files, and refuses any other directory', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'glmh-probe-tmp-'))
  try {
    const target = join(tmp, 'checkout', 'packages', 'glm')
    mkdirSync(target, { recursive: true })
    writeFileSync(join(target, 'index.js'), 'export {}\n')
    const dir = openRunDir('stamp', tmp)
    const modules = join(dir, 'dsh-root', 'profiles', 'probe-full', 'node_modules')
    mkdirSync(modules, { recursive: true })
    symlinkSync(target, join(modules, 'dsh-glm-zcode'), 'junction')
    removeRunDir(dir, tmp)
    assert.ok(!existsSync(dir))
    assert.equal(readFileSync(join(target, 'index.js'), 'utf8'), 'export {}\n')

    const other = join(tmp, 'checkout')
    assert.throws(() => removeRunDir(other, tmp), /is not a probe run directory/)
    const nested = join(openRunDir('stamp', tmp), 'glm-hourness-probe-inner')
    mkdirSync(nested)
    assert.throws(() => removeRunDir(nested, tmp), /is not a probe run directory/)
    assert.ok(existsSync(join(target, 'index.js')) && existsSync(nested))
  }
  finally {
    rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 20 })
  }
})
