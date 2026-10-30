/**
 * The rules board's one way in and the project it works on (docs/ORCHESTRATION.md
 * §16; design §2.5, §7.3, §7.4): who may write, what a request must be, what
 * a write leaves, what stops it, and which folder is a project.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import test from 'node:test'
import { gitDirOf, projectOf } from '../src/data/project-root.ts'
import { openRulesBoard } from '../src/rules/engine.ts'
import { effectivePeakMode, stateProblem, type JournalRecord, type RulesActor } from '../src/rules/model.ts'
import { refusalFor } from '../src/rules/permissions.ts'
import { loadState, rulesPaths, stateDigest } from '../src/rules/store.ts'
import { impatientLock, projectTest, quickIo } from './rules-helpers.ts'

const SET = { op: 'peak-mode-set', level: 'stop' } as const

projectTest('only the person changes the peak mode: an agent, the harness and a detector are refused, with how to do it, and nothing is written', async ({ root, board }) => {
  for (const actor of ['llm', 'harness', 'detector'] as const satisfies readonly RulesActor[]) {
    const result = await board.apply(actor, SET)
    assert.equal(result.ok, false, actor)
    if (!result.ok) {
      assert.equal(result.error.code, 'forbidden', actor)
      assert.match(result.error.message, new RegExp(`身份 ${actor}`))
      assert.match(result.error.hint ?? '', /\/rules peak 无影响\|少做\|不做/)
    }
  }
  assert.deepEqual(await readdir(root), ['.git'])
  assert.equal(refusalFor('human', 'peak-mode-set'), undefined)
  const done = await board.apply('human', SET)
  assert.ok(done.ok)
})

projectTest('a request that is not well formed is refused before any file is touched', async ({ root, board }) => {
  const bad: ReadonlyArray<readonly [string, unknown]> = [
    ['null', null],
    ['a string', 'peak-mode-set'],
    ['no op', {}],
    ['an unknown op', { op: 'rule-set', level: 'stop' }],
    ['no level', { op: 'peak-mode-set' }],
    ['a level by its Chinese name (the stored value is what a request carries)', { op: 'peak-mode-set', level: '少做' }],
    ['an unknown level', { op: 'peak-mode-set', level: 'off' }],
    ['a negative revision', { op: 'peak-mode-set', level: 'reduce', rev: -1 }],
    ['a fractional revision', { op: 'peak-mode-set', level: 'reduce', rev: 1.5 }],
    ['a reason that is not text', { op: 'peak-mode-set', level: 'reduce', reason: 7 }],
  ]
  for (const [name, request] of bad) {
    const result = await board.apply('human', request)
    assert.deepEqual([name, result.ok, result.ok ? undefined : result.error.code], [name, false, 'invalid'])
  }
  assert.deepEqual(await readdir(root), ['.git'])
})

projectTest('a request made against an older state is refused; against the current one it goes through', async ({ board }) => {
  const first = await board.apply('human', SET)
  assert.ok(first.ok)
  const stale = await board.apply('human', { op: 'peak-mode-set', level: 'inform', rev: 0 })
  assert.deepEqual([stale.ok, stale.ok ? undefined : stale.error.code], [false, 'stale_revision'])
  assert.equal(effectivePeakMode(loadState(board.paths).state).level, 'stop')
  const current = await board.apply('human', { op: 'peak-mode-set', level: 'inform', rev: first.state.seq })
  assert.ok(current.ok)
  assert.equal(effectivePeakMode(current.state).level, 'inform')
})

projectTest('what a write leaves: a record that says who, what and why, a state that passes the check, and the person\'s choice with its time', async ({ board }) => {
  const at = Date.parse('2026-10-30T09:00:00Z')
  const timed = openRulesBoard({ projectRoot: board.paths.projectRoot, io: quickIo({ now: () => at }) })
  const result = await timed.apply('human', { op: 'peak-mode-set', level: 'stop', reason: '人用 /rules peak 把高峰模式改成了「不做」' })
  assert.ok(result.ok)
  assert.equal(stateProblem(result.state), undefined)
  assert.deepEqual(result.state.peakMode, { level: 'stop', at: '2026-10-30T09:00:00.000Z', origin: { actor: 'human' } })
  const [record] = (await readFile(timed.paths.journal, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as JournalRecord)
  assert.deepEqual({ ...record, snapshot: undefined, changes: undefined }, { seq: 1, at: '2026-10-30T09:00:00.000Z', actor: 'human', op: 'peak-mode-set', target: 'peakMode', from: 'reduce', to: 'stop', reason: '人用 /rules peak 把高峰模式改成了「不做」', snapshot: undefined, changes: undefined })
  assert.deepEqual(record?.changes.map(change => change.path), [['peakMode'], ['repo']])
  assert.equal(record?.snapshot, stateDigest(result.state))
  const without = await timed.apply('human', { op: 'peak-mode-set', level: 'inform' })
  assert.ok(without.ok)
  const [, second] = (await readFile(timed.paths.journal, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as JournalRecord)
  assert.equal(second?.reason, '人把高峰模式改成了「无影响」', 'the reason has a default when the entry gives none')
  assert.equal(second?.from, 'stop')
})

projectTest('a writer that cannot get the lock reports busy and writes nothing', async ({ root }) => {
  const paths = rulesPaths(root)
  await mkdir(paths.runtimeDir, { recursive: true })
  await writeFile(paths.lock, JSON.stringify({ pid: process.pid, startedAt: Date.now(), at: Date.now(), token: 'someone' }))
  const board = openRulesBoard({ projectRoot: root, lock: impatientLock() })
  const result = await board.apply('human', SET)
  assert.deepEqual([result.ok, result.ok ? undefined : result.error.code], [false, 'busy'])
  assert.deepEqual((await readdir(paths.runtimeDir)).sort(), ['rules.lock'], 'the other holder\'s lock stays, nothing else is written')
})

projectTest('a writer whose lock was taken over while it planned abandons the write', async ({ root }) => {
  const paths = rulesPaths(root)
  let takeover = true
  const board = openRulesBoard({
    projectRoot: root,
    io: quickIo({
      now: () => {
        if (takeover) {
          takeover = false
          writeFileSync(paths.lock, JSON.stringify({ pid: process.pid, startedAt: 1, at: Date.now(), token: 'the one that took over' }))
        }
        return Date.now()
      },
    }),
  })
  const result = await board.apply('human', SET)
  assert.deepEqual([result.ok, result.ok ? undefined : result.error.code], [false, 'busy'])
  assert.deepEqual((await readdir(paths.runtimeDir)).sort(), ['rules.lock'])
  assert.equal((JSON.parse(await readFile(paths.lock, 'utf8')) as { token: string }).token, 'the one that took over')
})

projectTest('a write that cannot reach the disk is an error result, never a throw, and leaves the state as it was', async ({ root, board }) => {
  await writeFile(join(root, '.llm'), 'a file where the directory should be')
  const result = await board.apply('human', SET)
  assert.deepEqual([result.ok, result.ok ? undefined : result.error.code], [false, 'io'])
  assert.match(result.ok ? '' : result.error.message, /^没写成：/)
  assert.deepEqual(effectivePeakMode(loadState(board.paths).state), { level: 'reduce', origin: 'default' })
})

test('a project is the repository root: the main checkout, its work trees and any folder inside are one', async () => {
  const base = await mkdtemp(join(tmpdir(), 'rules-key-'))
  try {
    const main = join(base, 'main')
    await mkdir(join(main, '.git', 'worktrees', 'wt'), { recursive: true })
    await mkdir(join(main, 'src', 'deep'), { recursive: true })
    assert.equal(projectOf(join(main, 'src', 'deep'))?.root, main)
    assert.deepEqual(projectOf(main), { root: main, git: true })

    // A work tree: its `.git` is a file that names a directory under the main `.git`, whose `commondir` leads back.
    const wt = join(base, 'wt')
    await mkdir(join(wt, 'inner'), { recursive: true })
    await writeFile(join(wt, '.git'), `gitdir: ${join(main, '.git', 'worktrees', 'wt')}\n`)
    await writeFile(join(main, '.git', 'worktrees', 'wt', 'commondir'), '../..\n')
    assert.equal(projectOf(join(wt, 'inner'))?.root, main, 'a work tree is the project of its main checkout')
    assert.equal(rulesPaths(projectOf(wt)!.root).rulesFile, join(main, 'docs', 'rules', 'rules.json'))
    assert.equal(gitDirOf(main), join(main, '.git'))
    assert.equal(gitDirOf(wt), join(main, '.git', 'worktrees', 'wt'))

    // A relative gitdir is read against the folder of the `.git` file.
    const relative = join(base, 'relative')
    await mkdir(relative)
    await writeFile(join(relative, '.git'), 'gitdir: ../main/.git/worktrees/wt\n')
    assert.equal(projectOf(relative)?.root, main)

    // A submodule's git directory has no commondir: the folder itself is the project.
    const sub = join(base, 'sub')
    await mkdir(join(base, 'modules', 'sub'), { recursive: true })
    await mkdir(sub)
    await writeFile(join(sub, '.git'), `gitdir: ${join(base, 'modules', 'sub')}\n`)
    assert.equal(projectOf(sub)?.root, sub)

    // Outside git only a folder that already has a `.llm` is a project.
    const plain = join(base, 'plain')
    await mkdir(plain)
    assert.equal(projectOf(plain), undefined)
    await mkdir(join(plain, '.llm'))
    assert.deepEqual(projectOf(plain), { root: plain, git: false })

    // The home folder and a drive root are never a project, whatever they hold.
    assert.equal(projectOf(plain, plain), undefined)
    assert.equal(projectOf(parse(base).root), undefined)
    assert.notEqual(homedir(), base)
  }
  finally {
    await rm(base, { recursive: true, force: true })
  }
})
