/**
 * Where a probe scenario's sessions work (scripts/sandbox.mjs
 * scenarioWorkspace; loop board design 0.6 §9.1, docs/DEVELOPMENT.md §3):
 * in a git repository of the scenario's own, so the rows that keep project
 * state under the project root write inside the run directory and never into
 * the project of the checkout the probe runs from (a work tree's project is
 * its main checkout's). The repositories are temporary directories of the
 * test; the run directory itself is not booted.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { initRepo, repo, scenarioWorkspace } from '../scripts/sandbox.mjs'

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
