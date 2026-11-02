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
import { effectivePeakMode, repoJson, stateProblem, type JournalRecord, type RulesActor } from '../src/rules/model.ts'
import { refusalFor, WRITE_OPS, type WriteOp } from '../src/rules/permissions.ts'
import { loadState, rulesPaths, stateDigest } from '../src/rules/store.ts'
import { ruleOf } from './rules-fixtures.ts'
import { impatientLock, projectTest, quickIo, treeOf } from './rules-helpers.ts'
import { skipIfTempInsideGit } from './temp-outside-git.ts'

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

    // A drive root is never a project.
    assert.equal(projectOf(parse(base).root), undefined)
    assert.notEqual(homedir(), base)
  }
  finally {
    await rm(base, { recursive: true, force: true })
  }
})

// Outside git the walk up from the folder must find no repository, so these need a temporary directory that is not inside one.
test('outside git only a folder that already has a `.llm` is a project, and the home folder never is', { skip: skipIfTempInsideGit() }, async () => {
  const plain = await mkdtemp(join(tmpdir(), 'rules-plain-'))
  try {
    assert.equal(projectOf(plain), undefined)
    await mkdir(join(plain, '.llm'))
    assert.deepEqual(projectOf(plain), { root: plain, git: false })
    assert.equal(projectOf(plain, plain), undefined, 'the home folder is never a project, whatever it holds')
  }
  finally {
    await rm(plain, { recursive: true, force: true })
  }
})

// The identity table of design §2.5 for the operations the board has, one row each: who may ask. The person asks for
// what is the person's to decide; the host's own code for what only it knows; an agent and a detector for none of them
// (an agent's way to a change is a proposal, and a detector's is the signal of its own, neither of which this board has yet).
const PERSON: readonly WriteOp[] = ['peak-mode-set', 'rule-lift', 'rule-delete', 'signal-manual', 'signal-clear', 'signal-delete', 'ticket-let-once', 'ticket-cancel', 'recovery-accept', 'recovery-dismiss', 'repo-adopt', 'repo-restore']
const HOST: readonly WriteOp[] = ['rule-expire', 'ticket-open', 'ticket-update', 'ticket-handover', 'ticket-adopt', 'repo-outside', 'repo-outside-cleared', 'notice-add', 'notice-delivered']
const ACTORS = ['human', 'llm', 'harness', 'detector'] as const satisfies readonly RulesActor[]

test('the identity table has a row for each operation the board has and no other, and every cell is as the design says', () => {
  assert.deepEqual([...WRITE_OPS].sort(), [...PERSON, ...HOST].sort())
  for (const op of WRITE_OPS) {
    for (const actor of ACTORS) {
      const allowed = PERSON.includes(op) ? actor === 'human' : actor === 'harness'
      const refusal = refusalFor(actor, op)
      assert.equal(refusal === undefined, allowed, `${actor} on ${op}`)
      if (refusal !== undefined) {
        assert.match(refusal.message, new RegExp(`身份 ${actor}`), `${actor} on ${op}: the message says who was refused`)
        assert.ok(refusal.hint.length >= 8, `${actor} on ${op}: the hint says what to do instead`)
      }
    }
  }
})

test('a refusal tells a person what to type, or that the board does it by itself', () => {
  assert.match(refusalFor('llm', 'rule-lift')?.hint ?? '', /\/rules lift <规则 id>/)
  assert.match(refusalFor('llm', 'rule-delete')?.hint ?? '', /\/rules delete <规则 id>/)
  assert.match(refusalFor('llm', 'signal-manual')?.hint ?? '', /\/rules on <开关>.*\/rules set <信号> <值>/)
  assert.match(refusalFor('llm', 'signal-clear')?.hint ?? '', /\/rules clear <信号>/)
  assert.match(refusalFor('llm', 'signal-delete')?.hint ?? '', /\/rules delete <开关名>/)
  assert.match(refusalFor('llm', 'ticket-let-once')?.hint ?? '', /\/rules let <单号>/)
  assert.match(refusalFor('llm', 'ticket-cancel')?.hint ?? '', /\/rules cancel <单号>/)
  assert.match(refusalFor('detector', 'recovery-accept')?.hint ?? '', /\/rules recovery <编号> 照改\|忽略/)
  assert.match(refusalFor('llm', 'repo-adopt')?.hint ?? '', /\/rules recovery 文件 照改\|忽略/)
  assert.match(refusalFor('human', 'ticket-open')?.hint ?? '', /规则板自己/)
  assert.match(refusalFor('llm', 'rule-expire')?.message ?? '', /只有规则板自己能/)
})

/** A well formed request for each operation a caller can make; what it names need not exist, the identity is judged first. */
const REQUESTS: Readonly<Record<Exclude<WriteOp, 'repo-outside' | 'repo-outside-cleared'>, Record<string, unknown>>> = {
  'peak-mode-set': { op: 'peak-mode-set', level: 'stop' },
  'rule-lift': { op: 'rule-lift', id: 'r-block' },
  'rule-delete': { op: 'rule-delete', id: 'r-block' },
  'rule-expire': { op: 'rule-expire', id: 'r-ttl' },
  'signal-manual': { op: 'signal-manual', name: 'code-freeze', value: true },
  'signal-clear': { op: 'signal-clear', name: 'code-freeze' },
  'signal-delete': { op: 'signal-delete', name: 'code-freeze' },
  'ticket-open': { op: 'ticket-open', sessionId: 's-1', agentLabel: 'w', host: { pid: 1, startedAt: 2 }, signature: 'abc123def456', tool: 'pwsh', summary: 'x', rules: ['r-block'] },
  'ticket-update': { op: 'ticket-update', id: 'q-1', state: 'done' },
  'ticket-handover': { op: 'ticket-handover', id: 'q-1', sessionId: 's-2', agentLabel: 'main' },
  'ticket-adopt': { op: 'ticket-adopt', id: 'q-1', host: { pid: 1, startedAt: 2 } },
  'ticket-let-once': { op: 'ticket-let-once', id: 'q-1' },
  'ticket-cancel': { op: 'ticket-cancel', id: 'q-1' },
  'recovery-accept': { op: 'recovery-accept', labels: ['3-1'] },
  'recovery-dismiss': { op: 'recovery-dismiss', labels: ['3-1'] },
  'repo-adopt': { op: 'repo-adopt' },
  'repo-restore': { op: 'repo-restore' },
  'notice-add': { op: 'notice-add', kind: 'late-block', rule: 'r-block', text: 't' },
  'notice-delivered': { op: 'notice-delivered', id: 'n-1' },
}

projectTest('asked by the wrong identity, every operation is forbidden with how to do it, and no file is touched; by the right one it is not forbidden', async ({ root, board }) => {
  await mkdir(board.paths.rulesDir, { recursive: true })
  await writeFile(board.paths.rulesFile, repoJson({ version: 2, rules: { 'r-block': ruleOf({ id: 'r-block' }) } }))
  assert.notEqual(await board.settle(), 'busy')
  for (const [op, request] of Object.entries(REQUESTS)) {
    const wrong = ACTORS.filter(actor => (PERSON as readonly string[]).includes(op) ? actor !== 'human' : actor !== 'harness')
    for (const actor of wrong) {
      const before = await treeOf(root)
      const result = await board.apply(actor, request)
      assert.deepEqual([op, actor, result.ok, result.ok ? undefined : result.error.code], [op, actor, false, 'forbidden'])
      if (!result.ok) {
        assert.match(result.error.message, new RegExp(`身份 ${actor}`))
        assert.notEqual(result.error.hint, undefined)
      }
      assert.deepEqual(await treeOf(root), before, `${actor} on ${op}: nothing written`)
    }
    const right = PERSON.includes(op as WriteOp) ? 'human' : 'harness'
    const result = await board.apply(right, request)
    assert.notEqual(result.ok ? undefined : result.error.code, 'forbidden', `${right} on ${op}`)
  }
})

test('the two records the board makes about the rules file by itself are not requests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rules-'))
  try {
    await mkdir(join(root, '.git'))
    const board = openRulesBoard({ projectRoot: root })
    for (const op of ['repo-outside', 'repo-outside-cleared']) {
      for (const actor of ACTORS) {
        const result = await board.apply(actor, { op })
        assert.deepEqual([op, actor, result.ok, result.ok ? undefined : result.error.code], [op, actor, false, 'invalid'])
      }
    }
    assert.deepEqual(await readdir(root), ['.git'])
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

projectTest('nothing for a proposal is an operation of this board: each is an unknown op, whoever asks', async ({ root, board }) => {
  const proposals = ['propose', 'proposal-show', 'proposal-accept', 'proposal-reject', 'proposal-expire', 'rule-set', 'signal-define', 'detector-set', 'detector-delete', 'repin', 'remove', 'signal-detected']
  for (const op of proposals) {
    for (const actor of ACTORS) {
      const result = await board.apply(actor, { op, id: 'x', level: 'stop' })
      assert.deepEqual([op, actor, result.ok, result.ok ? undefined : result.error.code], [op, actor, false, 'invalid'])
      assert.match(result.ok ? '' : result.error.message, /不认识/)
    }
  }
  assert.deepEqual(await readdir(root), ['.git'])
})
