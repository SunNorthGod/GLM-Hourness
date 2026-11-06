/**
 * The lift path of m4-gate G3 (design §3.5): the guard_lift tool checks the
 * caller is the root agent, the words are a whole segment of the human's own
 * latest client message and carry an intent word that no negation cancels,
 * and one human message buys at most one successful lift; a success appends
 * `docs/guard/lifts.jsonl` and a journal record. lift-files-only guards the
 * record in every checkout of the project, including worktrees created after
 * the session started (review F14); reads and git pass. The rules board's
 * service lifts without a words check and can lift lift-files-only. The
 * morning report's reconciliation compares the file's terminal state with the
 * journal's (review F15) over the WHOLE journal, not the period (F16), and
 * carries checkoutRootOf's reading of "which checkout is this in" (N23).
 * Real temporary git repositories throughout; the git commands really run.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkoutRootOf, projectOf } from '../src/data/project-root.ts'
import { guardLift, hasIntentWord, LIFT_WORDS, NEGATIONS, RESTORE_WORDS, saidSegment } from '../src/guard/lift.ts'
import { LIFT_SERVICE, liftService, liftServiceOver, resolveLiftRule } from '../src/guard/lift-service.ts'
import { liftFilesOnly } from '../src/guard/lift-files.ts'
import { liftStatesOf } from '../src/guard/lift.ts'
import { NATIVE_FACE, type GuardRule, type ToolCall } from '../src/guard/rules.ts'
import { morningReport } from '../src/workflow/morning-report.ts'
import type { LiftsInput } from '../src/guard/status.ts'
import type { AgentLike, DerivedMessage } from '../src/shared/dsh-min.ts'
import type { LiftRecord } from '../src/guard/records.ts'

/** A repo with one commit, so `git worktree add` has a base; files are seeded and committed. */
function tempRepo(files: readonly string[] = ['README.md']): { root: string, run: (args: string[]) => string } {
  const root = mkdtempSync(join(tmpdir(), 'guard-lift-'))
  const run = (args: string[]): string => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  run(['init', '-q'])
  run(['config', 'user.email', 'probe@example.com'])
  run(['config', 'user.name', 'probe'])
  for (const file of files) {
    mkdirSync(dirnameOf(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), 'seed\n')
  }
  run(['add', '.'])
  run(['commit', '-q', '-m', 'seed'])
  return { root, run }
}

const dirnameOf = (path: string): string => {
  const index = path.lastIndexOf('/')
  const back = path.lastIndexOf('\\')
  const at = Math.max(index, back)
  return at <= 0 ? path : path.slice(0, at)
}

const liftsPath = (root: string): string => join(root, 'docs', 'guard', 'lifts.jsonl')

/** An agent whose session history holds the messages given; `deriveMessages` is what guardLift reads. */
function agentOf(messages: readonly DerivedMessage[], origin?: 'subagent'): AgentLike {
  return {
    id: 'agent-lift',
    session: {
      id: 'session-lift',
      header: { id: 'session-lift', ...(origin === undefined ? {} : { origin }) },
      deriveMessages: () => messages,
      requestHeader: () => undefined,
    },
  }
}

const person = (text: string, rpcId?: string): DerivedMessage => ({
  role: 'user',
  content: [{ type: 'text', text }],
  source: rpcId === undefined ? { kind: 'user' } : { kind: 'user', rpcId },
})

const depsOf = (agent: AgentLike | undefined, root: string | undefined, records: LiftRecord[]): Parameters<typeof guardLift>[1] => ({
  agent,
  root,
  record: record => { records.push(record) },
  now: () => new Date('2026-11-04T09:00:00Z'),
})

const refusalOf = async (promise: Promise<unknown>): Promise<{ code: string, message: string, hint: string }> => {
  try {
    await promise
  }
  catch (error) {
    return JSON.parse((error as Error).message) as { code: string, message: string, hint: string }
  }
  throw new Error('guardLift was expected to refuse')
}

// ------------------------------------------------------------------ the words

test('the word lists and their negation reading (design §3.5 step 4-2)', () => {
  assert.ok(hasIntentWord('新建脚本那条先别拦了', LIFT_WORDS), '「先」before 「别拦」 is not a negation')
  assert.ok(hasIntentWord('别关掉那条', LIFT_WORDS) === false, '「关掉」 preceded by the negation 「别」')
  assert.ok(hasIntentWord("don't disable that rule", LIFT_WORDS) === false)
  assert.ok(hasIntentWord('don’t disable that rule', LIFT_WORDS) === false, 'the curly apostrophe counts too')
  assert.ok(hasIntentWord('please disable it', LIFT_WORDS))
  assert.ok(hasIntentWord('uploaded', LIFT_WORDS) === false, 'an English word matches whole')
  assert.ok(hasIntentWord('那条先别拦了', RESTORE_WORDS) === false, '「别拦」 is not a restore intent')
  assert.ok(hasIntentWord('拦回来', RESTORE_WORDS))
  assert.equal(NEGATIONS.includes('别'), true)
  assert.ok(hasIntentWord('这条不要动，那条撤下吧', LIFT_WORDS), 'one occurrence not negated is enough')
})

test('saidSegment: boundaries on whitespace or punctuation, never inside a word (design §3.5 step 4-1)', () => {
  const message = '新建脚本那条先别拦了，其他照旧'
  assert.ok(saidSegment(message, '新建脚本那条先别拦了'), 'starts at the message, ends on the comma')
  assert.ok(saidSegment(message, '先别拦了') === false, "「先」 before it is not a boundary (the design's not_said case)")
  assert.ok(saidSegment(message, '其他照旧'), 'the segment after the comma starts on a boundary')
  assert.ok(saidSegment(message, '脚本那条先') === false, 'a quote cutting into the words around it')
  assert.ok(saidSegment('please stop blocking this rule', 'stop blocking this rule'))
  assert.ok(saidSegment('please stop blocking this rule', 'blocking thi') === false)
})

// ------------------------------------------------------------------- guard_lift

const HUMAN_LIFT = '新建脚本那条先别拦了'

test('guard_lift lifts with the human\'s own words, writes the record line and the journal record', async () => {
  const { root } = tempRepo()
  const records: LiftRecord[] = []
  const agent = agentOf([person(HUMAN_LIFT, 'rpc-1')])
  const result = await guardLift({ rule: 'scratch-only', words: HUMAN_LIFT }, depsOf(agent, root, records))
  assert.deepEqual([result.outcome, result.rule], ['lifted', 'scratch-only'])
  assert.ok(result.message.includes('no longer blocks') && result.message.includes('guard_lift again with action "restore"'), 'the result says what to tell the human (design §3.5)')
  assert.ok(result.message.includes('once the rules board offers it for code rules, /rules restore scratch-only'))
  const states = liftStatesOf(readFileSync(liftsPath(root), 'utf8'))
  assert.deepEqual([...states.states.entries()], [['scratch-only', 'lift']])
  assert.equal(states.unreadable, 0)
  assert.deepEqual(records.map(record => [record.kind, record.via, record.words]), [['lift', 'chat', HUMAN_LIFT]])
  // The second guard_lift on the same human message is refused even for another rule.
  const again = await refusalOf(guardLift({ rule: 'checker-config', words: HUMAN_LIFT }, depsOf(agent, root, records)))
  assert.equal(again.code, 'not_said')
  // A new human message buys a new exchange: restore what was lifted.
  const agent2 = agentOf([person(HUMAN_LIFT, 'rpc-1'), person('把脚本那条恢复吧', 'rpc-2')])
  const restored = await guardLift({ rule: 'scratch-only', action: 'restore', words: '把脚本那条恢复吧' }, depsOf(agent2, root, records))
  assert.equal(restored.outcome, 'restored')
  // noop: restoring what already stands writes nothing.
  const agent3 = agentOf([person('把脚本那条恢复吧', 'rpc-3')])
  const noop = await guardLift({ rule: 'scratch-only', action: 'restore', words: '把脚本那条恢复吧' }, depsOf(agent3, root, records))
  assert.equal(noop.outcome, 'noop')
  rmSync(root, { recursive: true, force: true })
})

test('guard_lift refuses: a subagent, no person message, no rpcId, words outside the message, too short, no intent, a negated restore', async () => {
  const { root } = tempRepo()
  const records: LiftRecord[] = []
  const sub = await refusalOf(guardLift({ rule: 'scratch-only', words: HUMAN_LIFT }, depsOf(agentOf([person(HUMAN_LIFT, 'r')], 'subagent'), root, records)))
  assert.equal(sub.code, 'forbidden')
  const nobody = await refusalOf(guardLift({ rule: 'scratch-only', words: HUMAN_LIFT }, depsOf(agentOf([]), root, records)))
  assert.equal(nobody.code, 'not_said')
  const noRpc = await refusalOf(guardLift({ rule: 'scratch-only', words: HUMAN_LIFT }, depsOf(agentOf([person(HUMAN_LIFT)]), root, records)))
  assert.equal(noRpc.code, 'not_said', 'the headless task message is not a client message')
  const notice = agentOf([
    person(HUMAN_LIFT, 't4-notice'),
    { role: 'user', content: [{ type: 'text', text: 'hourness-guard correction' }], source: { kind: 'hourness-guard', form: 'notice' } },
  ])
  assert.ok((await guardLift({ rule: 'scratch-only', words: HUMAN_LIFT }, depsOf(notice, root, records))).outcome === 'lifted', 'a notice between the messages does not hide the human\'s words')
  const other = await refusalOf(guardLift({ rule: 'scratch-only', words: '这句话不在最近一条人的消息里' }, depsOf(agentOf([person(HUMAN_LIFT, 't4-other')]), root, records)))
  assert.equal(other.code, 'not_said')
  const cut = await refusalOf(guardLift({ rule: 'scratch-only', words: '别拦了' }, depsOf(agentOf([person(HUMAN_LIFT, 't4-cut')]), root, records)))
  assert.equal(cut.code, 'not_said', 'the start falls inside a word: not a whole segment')
  const short = await refusalOf(guardLift({ rule: 'scratch-only', words: '别拦' }, depsOf(agentOf([person('别拦', 't4-short')]), root, records)))
  assert.equal(short.code, 'not_said', 'fewer than four code points')
  const plain = await refusalOf(guardLift({ rule: 'scratch-only', words: '继续' }, depsOf(agentOf([person('继续', 't4-plain')]), root, records)))
  assert.equal(plain.code, 'not_said', 'no lift intent')
  const restore = await refusalOf(guardLift({ rule: 'scratch-only', action: 'restore', words: '别拦这条' }, depsOf(agentOf([person('别拦这条', 't4-restore')]), root, records)))
  assert.equal(restore.code, 'not_said', 'a lift word is not a restore intent')
  rmSync(root, { recursive: true, force: true })
})

test('guard_lift refuses an unknown id, an action that is not lift or restore, and lift-files-only with the board hint', async () => {
  const { root } = tempRepo()
  const records: LiftRecord[] = []
  const agent = agentOf([person(HUMAN_LIFT, 't5-id')])
  const unknown = await refusalOf(guardLift({ rule: 'worker-scope', words: HUMAN_LIFT }, depsOf(agent, root, records)))
  assert.equal(unknown.code, 'invalid')
  assert.ok(unknown.hint.includes('liftable ids'))
  const action = await refusalOf(guardLift({ rule: 'scratch-only', words: HUMAN_LIFT, action: 'reenable' }, depsOf(agent, root, records)))
  assert.equal(action.code, 'invalid')
  const board = await refusalOf(guardLift({ rule: 'lift-files-only', words: HUMAN_LIFT }, depsOf(agent, root, records)))
  assert.equal(board.code, 'forbidden')
  assert.ok(board.hint.includes('/rules lift lift-files-only') && board.hint.includes('until then it cannot be lifted'))
  const noRoot = await refusalOf(guardLift({ rule: 'scratch-only', words: HUMAN_LIFT }, depsOf(agent, undefined, records)))
  assert.equal(noRoot.code, 'unavailable')
  rmSync(root, { recursive: true, force: true })
})

// ---------------------------------------------------------------- lift-files-only

test('lift-files-only: the record is denied in the main checkout, by relative and absolute spelling, and in a worktree created after the session started', () => {
  const { root, run } = tempRepo()
  const worktree = join(mkdtempSync(join(tmpdir(), 'guard-wt-')), 'wt')
  run(['worktree', 'add', worktree, '-b', 'wt'])
  const rule: GuardRule = liftFilesOnly(worktree)
  const denied = (call: ToolCall, why: string): void => {
    const verdict = rule.detect(call, NATIVE_FACE)
    assert.equal(verdict.kind, 'deny', why)
    assert.equal((verdict as { rule: string }).rule, 'lift-files-only')
    const correction = (verdict as { correction: { fact: string, rightPath: string, exception: string } }).correction
    assert.ok(correction.fact.startsWith('You tried to change the lift record'))
    assert.equal(correction.rightPath, 'Do not edit this file. Only the human can lift or restore rules. If you think a rule blocks you wrongly, say so in your reply.')
    assert.equal(correction.exception, 'none')
  }
  // ① a session in the worktree writes its own copy, relative and absolute.
  denied({ name: 'write', arguments: { file_path: 'docs/guard/lifts.jsonl', content: '{}' } }, 'relative in the worktree')
  denied({ name: 'write', arguments: { file_path: join(worktree, 'docs', 'guard', 'lifts.jsonl'), content: '{}' } }, 'absolute in the worktree')
  // ③ the main checkout's session writes the worktree copy.
  const mainRule = liftFilesOnly(root)
  assert.equal(mainRule.detect({ name: 'write', arguments: { file_path: join(worktree, 'docs', 'guard', 'lifts.jsonl'), content: '{}' } }, NATIVE_FACE).kind, 'deny', 'the main session writing the worktree copy')
  assert.equal(mainRule.detect({ name: 'edit', arguments: { file_path: join(root, 'docs', 'guard', 'lifts.jsonl'), old_string: 'a', new_string: 'b' } }, NATIVE_FACE).kind, 'deny', 'edit of the main copy')
  // ⑤ shell spellings; reads and git pass.
  const shell = liftFilesOnly(join(root, 'src'))
  denied({ name: 'pwsh', arguments: { command: 'Set-Content ../docs/guard/lifts.jsonl -Value x' } }, 'a relative shell write')
  denied({ name: 'pwsh', arguments: { command: 'Set-Content .\\docs\\guard\\lifts.jsonl -Value x' } }, 'a backslash shell write')
  assert.equal(shell.detect({ name: 'pwsh', arguments: { command: 'cat docs/guard/lifts.jsonl' } }, NATIVE_FACE).kind, 'allow', 'a read is not a write')
  assert.equal(shell.detect({ name: 'pwsh', arguments: { command: 'git add docs/guard/lifts.jsonl' } }, NATIVE_FACE).kind, 'allow', 'git is not judged')
  // ⑥ neighbors pass, in both checkouts.
  for (const path of ['docs/guard/README.md', 'docs/guard/lifts.jsonl.bak', 'docs/guard/x-lifts.jsonl']) {
    assert.equal(mainRule.detect({ name: 'write', arguments: { file_path: join(root, path), content: 'x' } }, NATIVE_FACE).kind, 'allow', path)
    assert.equal(rule.detect({ name: 'write', arguments: { file_path: join(worktree, path), content: 'x' } }, NATIVE_FACE).kind, 'allow', `worktree ${path}`)
  }
  // ⑦ another project's record file passes for this session.
  const { root: other } = tempRepo()
  assert.equal(mainRule.detect({ name: 'write', arguments: { file_path: join(other, 'docs', 'guard', 'lifts.jsonl'), content: '{}' } }, NATIVE_FACE).kind, 'allow', 'another project\'s record')
  // ⑧ outside git: only the session project's own root's file is the record.
  const plain = mkdtempSync(join(tmpdir(), 'guard-plain-'))
  mkdirSync(join(plain, 'docs', 'guard'), { recursive: true })
  mkdirSync(join(plain, '.llm'), { recursive: true })
  assert.ok(projectOf(plain) !== undefined, 'the fixture is a project (a .llm directory)')
  const plainRule = liftFilesOnly(plain)
  assert.equal(plainRule.detect({ name: 'write', arguments: { file_path: join(plain, 'docs', 'guard', 'lifts.jsonl'), content: '{}' } }, NATIVE_FACE).kind, 'deny')
  rmSync(root, { recursive: true, force: true })
  rmSync(worktree, { recursive: true, force: true })
  rmSync(other, { recursive: true, force: true })
  rmSync(plain, { recursive: true, force: true })
})

test('checkoutRootOf answers with the checkout itself, where projectOf folds to the main one (design §3.5, N23)', () => {
  const { root, run } = tempRepo()
  const worktree = join(mkdtempSync(join(tmpdir(), 'guard-wt2-')), 'wt')
  run(['worktree', 'add', worktree, '-b', 'wt2'])
  assert.equal(checkoutRootOf(join(root, 'src', 'a.ts')), root)
  assert.equal(checkoutRootOf(join(worktree, 'src', 'a.ts')), worktree, 'the worktree\'s own root, not the main checkout')
  assert.equal(projectOf(worktree)?.root, root, 'projectOf still folds the worktree to the main checkout')
  assert.equal(checkoutRootOf(join(worktree, 'not', 'created', 'yet.ts')), worktree, 'a directory that does not exist yet walks on')
  assert.equal(checkoutRootOf(join(mkdtempSync(join(tmpdir(), 'guard-nogit-')), 'x.ts')), undefined, 'outside git: undefined')
  rmSync(root, { recursive: true, force: true })
  rmSync(worktree, { recursive: true, force: true })
})

// ------------------------------------------------------------- the board's service

test('setLifted lifts by the board without a words check, restores lift-files-only, and resolves <row>:<id> one strip at a time', async () => {
  const { root } = tempRepo()
  const records: LiftRecord[] = []
  const service = liftServiceOver({
    rootOf: () => root,
    record: (record, cwd) => { records.push(record); assert.equal(cwd, root) },
    now: () => new Date('2026-11-04T10:00:00Z'),
  })
  assert.deepEqual(resolveLiftRule('guard:scratch-only'), { id: 'scratch-only' })
  assert.deepEqual(resolveLiftRule('guard:guard:scratch-only'), { code: 'unknown_rule' }, 'one strip lands on the id space, which holds no row prefixes: unknown')
  assert.deepEqual(resolveLiftRule('loops:files-only'), { id: 'files-only' }, 'rule 2: one leading row prefix off the board spelling')
  assert.deepEqual(resolveLiftRule('loops:loops:files-only'), { code: 'unknown_rule' }, 'one strip lands on the id space, never a second strip')
  assert.deepEqual(resolveLiftRule('guard:nonexistent'), { code: 'unknown_rule' })
  const boardLift = await service.setLifted({ cwd: root, rule: 'lift-files-only', action: 'lift', command: '/rules lift guard:lift-files-only', sessionId: 's1' })
  assert.deepEqual([boardLift.ok, boardLift.ok === true ? boardLift.outcome : ''], [true, 'lifted'], 'a liftVia board rule lifts by the board')
  const chat = await service.setLifted({ cwd: root, rule: 'guard:scratch-only', action: 'lift', command: '/rules lift guard:scratch-only' })
  assert.deepEqual([chat.ok, chat.ok === true ? chat.outcome : ''], [true, 'lifted'])
  assert.deepEqual(records.map(record => [record.via, record.rule, record.words]), [['board', 'lift-files-only', '/rules lift guard:lift-files-only'], ['board', 'scratch-only', '/rules lift guard:scratch-only']])
  const lifted = service.lifted(root)
  assert.deepEqual(lifted.map(entry => [entry.rule, entry.via]), [['lift-files-only', 'board'], ['scratch-only', 'board']], 'the service reads its own via board')
  const noop = await service.setLifted({ cwd: root, rule: 'scratch-only', action: 'lift', command: '/rules lift guard:scratch-only' })
  assert.deepEqual([noop.ok, noop.ok === true ? noop.outcome : ''], [true, 'noop'])
  const restore = await service.setLifted({ cwd: root, rule: 'scratch-only', action: 'restore', command: '/rules restore guard:scratch-only' })
  assert.equal(restore.ok === true ? restore.outcome : '', 'restored')
  rmSync(root, { recursive: true, force: true })
})

test('liftService reads the service the guard row provides through ctx, and undefined when it is absent or malformed', () => {
  const service = liftServiceOver({ rootOf: () => undefined, record: () => {}, now: () => new Date() })
  const ctx = { get: (name: string): unknown => name === LIFT_SERVICE ? service : undefined }
  assert.equal(liftService(ctx) === service, true)
  assert.equal(liftService({ get: () => undefined }), undefined)
  assert.equal(liftService({ get: () => ({ setLifted: 'no' }) }), undefined, 'a member of the wrong type reads as absent')
})

// ------------------------------------------------------- the morning report's reconciliation

const reportWith = (records: readonly LiftRecord[], file: LiftsInput['file'], over: Partial<LiftsInput> = {}): string =>
  morningReport({
    period: 'p',
    decisions: [],
    violations: [],
    usage: [],
    asks: { waiting: { count: 0 }, agentOwn: 0, decided: { person: 0, inChat: 0, agent: 0 } },
    offsetMinutes: 480,
    lifts: { records, ...(over.earliest === undefined ? {} : { earliest: over.earliest }), ...(file === undefined ? {} : { file }), ...(over.uncommitted === undefined ? {} : { uncommitted: over.uncommitted }) },
  })

test('the report lists the lifted rules with the last chat lift\'s moment and words, board form included', () => {
  const records: LiftRecord[] = [
    { kind: 'lift', at: '2026-11-01T06:02:00Z', rule: 'scratch-only', action: 'lift', via: 'chat', words: '新建脚本那条先别拦了' },
    { kind: 'lift', at: '2026-11-02T06:00:00Z', rule: 'lift-files-only', action: 'lift', via: 'board', words: '/rules lift guard:lift-files-only' },
  ]
  const report = reportWith(records, undefined)
  assert.ok(report.includes('- 撤下的规则：scratch-only（11-01 14:02，经对话，原话「新建脚本那条先别拦了」）、lift-files-only（11-02 14:00，经规则板，写命令原文「/rules lift guard:lift-files-only」）'), report)
})

test('the reconciliation names a terminal mismatch in both directions, and a checkout back to an old version is found (F15, ⑪)', () => {
  const records: LiftRecord[] = [
    { kind: 'lift', at: '2026-11-01T06:00:00Z', rule: 'scratch-only', action: 'lift', via: 'chat', words: 'w' },
    { kind: 'lift', at: '2026-11-02T06:00:00Z', rule: 'scratch-only', action: 'restore', via: 'chat', words: 'w' },
  ]
  // The file was checked back out to the lift-only version (git checkout A -- …).
  const fileOnlyLift = { text: `${JSON.stringify({ at: '2026-11-01T06:00:00Z', rule: 'scratch-only', action: 'lift', via: 'chat', words: 'w' })}\n` }
  const report = reportWith(records, fileOnlyLift)
  assert.ok(report.includes('- lifts.jsonl 与流水对不上：scratch-only，文件里最后一行是撤下，流水里最后一条是恢复'), report)
  // The other direction: the file holds the restore, the journal lost it.
  const reversed = reportWith([{ kind: 'lift', at: '2026-11-01T06:00:00Z', rule: 'scratch-only', action: 'lift', via: 'chat', words: 'w' }], fileOnlyLift)
  assert.ok(reversed.includes('- 撤下的规则：scratch-only'), reversed)
  assert.ok(!reversed.includes('对不上'), reversed)
  // ⑬ the file is gone while the journal holds a lift.
  const gone = reportWith([{ kind: 'lift', at: '2026-11-01T06:00:00Z', rule: 'scratch-only', action: 'lift', via: 'chat', words: 'w' }], { text: '' })
  assert.ok(gone.includes('- lifts.jsonl 与流水对不上：scratch-only，文件里没有这条规则的行，流水里最后一条是撤下'), gone)
  // An agreeing state has no reconciliation line.
  const agree = reportWith(records, { text: `${JSON.stringify({ at: '2026-11-01T06:00:00Z', rule: 'scratch-only', action: 'lift', via: 'chat', words: 'w' })}\n${JSON.stringify({ at: '2026-11-02T06:00:00Z', rule: 'scratch-only', action: 'restore', via: 'chat', words: 'w' })}\n` })
  assert.ok(!agree.includes('对不上'), agree)
  assert.ok(!agree.includes('撤下的规则'), agree)
})

test('a rule carried by the file alone before the journal\'s first record is one line, not per-rule rows; a later agreement does not report (N29, ⑭)', () => {
  // The journal starts today; the file carries lifts from three days ago (a new machine's clone).
  const records: LiftRecord[] = [
    { kind: 'lift', at: '2026-11-04T06:00:00Z', rule: 'file-tools-only', action: 'lift', via: 'chat', words: 'w' },
    { kind: 'lift', at: '2026-11-04T07:00:00Z', rule: 'scratch-only', action: 'lift', via: 'chat', words: 'w' },
  ]
  const oldLine = (rule: string, at: string): string => JSON.stringify({ at, rule, action: 'lift', via: 'chat', words: 'old words' })
  const file = { text: `${oldLine('checker-config', '2026-11-01T06:00:00Z')}\n${oldLine('suppression-reason', '2026-11-02T06:00:00Z')}\n${JSON.stringify({ at: '2026-11-04T07:00:00Z', rule: 'scratch-only', action: 'lift', via: 'chat', words: 'w' })}\n` }
  const report = reportWith(records, file, { earliest: '2026-11-04T05:00:00Z' })
  assert.ok(report.includes('- 流水里没有这些撤下记录（换了电脑？）：lifts.jsonl 里有 2 条规则的撤下或恢复早于本机流水：checker-config、suppression-reason'), report)
  assert.ok(!report.includes('对不上：checker-config'), report)
  assert.ok(!report.includes('对不上：suppression-reason'), report)
  // scratch-only agrees (same line both sides): no line of its own.
  assert.ok(!report.includes('对不上：scratch-only'), report)
  assert.ok(report.includes('- 撤下的规则：'), report)
})

test('the lift side ignores the report period (F16): a lift three days ago is listed today, and an unreadable file says so', () => {
  const records: LiftRecord[] = [{ kind: 'lift', at: '2026-11-01T06:00:00Z', rule: 'scratch-only', action: 'lift', via: 'chat', words: '三天前那句' }]
  const file = { text: `${JSON.stringify({ at: '2026-11-01T06:00:00Z', rule: 'scratch-only', action: 'lift', via: 'chat', words: '三天前那句' })}\n` }
  const report = reportWith(records, file)
  assert.ok(report.includes('- 撤下的规则：scratch-only（11-01 14:00，经对话，原话「三天前那句」）'), report)
  assert.ok(!report.includes('对不上'), report)
  const unreadable = reportWith([], { error: 'EACCES' })
  assert.ok(unreadable.includes('- lifts.jsonl 读不出（EACCES），这一次没有对账'), unreadable)
  const uncommitted = reportWith(records, file, { uncommitted: true })
  assert.ok(uncommitted.includes('- lifts.jsonl 有未提交的撤下，随下一次提交带上'), uncommitted)
})

test('a bad line of the file counts as unreadable and the rest still works', () => {
  const states = liftStatesOf(`${JSON.stringify({ at: '2026-11-01T06:00:00Z', rule: 'scratch-only', action: 'lift', via: 'chat', words: 'w' })}\nnot json\n${JSON.stringify({ at: 'x', rule: 'other' })}\n`)
  assert.deepEqual([...states.states.entries()], [['scratch-only', 'lift']])
  assert.equal(states.unreadable, 2)
})

test('the report derives the lifted rules from the journal alone without a file, and the git status really runs through reportFromFiles', async () => {
  const { root, run } = tempRepo()
  // The guard row's real flow: reportFromFiles reads the whole journal and the file, and asks git about uncommitted lifts.
  mkdirSync(join(root, '.llm', 'audit'), { recursive: true })
  const record = { kind: 'lift', at: '2026-11-04T06:00:00Z', rule: 'scratch-only', action: 'lift', via: 'chat', words: '先别拦了' }
  writeFileSync(join(root, '.llm', 'audit', 'violations.jsonl'), `${JSON.stringify(record)}\n`)
  mkdirSync(join(root, 'docs', 'guard'), { recursive: true })
  writeFileSync(liftsPath(root), `${JSON.stringify({ at: '2026-11-04T06:00:00Z', rule: 'scratch-only', action: 'lift', via: 'chat', words: '先别拦了' })}\n`)
  const { reportFromFiles } = await import('../src/workflow/morning-report.ts')
  run(['add', 'docs/guard/lifts.jsonl'])
  run(['commit', '-q', '-m', 'lifts'])
  const report = await reportFromFiles({ readFile: path => Promise.resolve(readFileSync(path, 'utf8')) }, { projectHome: join(root, '.llm') }, 'p', () => Promise.reject(new Error('no graph')), undefined, { root, now: Date.parse('2026-11-04T12:00:00Z'), offsetMinutes: 480 })
  assert.ok(report.includes('- 撤下的规则：scratch-only（11-04 14:00，经对话，原话「先别拦了」）'), report)
  assert.ok(!report.includes('对不上'), report)
  assert.ok(!report.includes('未提交'), report, 'a committed state has no uncommitted line')
  // With an uncommitted change, the line appears; git really ran.
  writeFileSync(liftsPath(root), `${readFileSync(liftsPath(root), 'utf8')}${JSON.stringify({ at: '2026-11-04T07:00:00Z', rule: 'checker-config', action: 'lift', via: 'board', words: '/rules lift guard:checker-config' })}\n`)
  run(['add', 'docs/guard/lifts.jsonl'])
  const dirty = await reportFromFiles({ readFile: path => Promise.resolve(readFileSync(path, 'utf8')) }, { projectHome: join(root, '.llm') }, 'p', () => Promise.reject(new Error('no graph')), undefined, { root, now: Date.parse('2026-11-04T12:00:00Z'), offsetMinutes: 480 })
  assert.ok(dirty.includes('- lifts.jsonl 有未提交的撤下，随下一次提交带上'), dirty)
  rmSync(root, { recursive: true, force: true })
})

test('after a worktree copy merges into the main checkout, the next report names the rule (F14 ⑨)', async () => {
  const { root } = tempRepo()
  // The journal has no lift record for scratch-only; the file (as a merged branch would bring it) lifts it.
  mkdirSync(join(root, '.llm', 'audit'), { recursive: true })
  writeFileSync(join(root, '.llm', 'audit', 'violations.jsonl'), '')
  mkdirSync(join(root, 'docs', 'guard'), { recursive: true })
  writeFileSync(liftsPath(root), `${JSON.stringify({ at: '2026-11-04T06:00:00Z', rule: 'scratch-only', action: 'lift', via: 'board', words: '/rules lift guard:scratch-only' })}\n`)
  const { reportFromFiles } = await import('../src/workflow/morning-report.ts')
  const report = await reportFromFiles({ readFile: path => Promise.resolve(readFileSync(path, 'utf8')) }, { projectHome: join(root, '.llm') }, 'p', () => Promise.reject(new Error('no graph')), undefined, { root, now: Date.parse('2026-11-04T12:00:00Z'), offsetMinutes: 480 })
  assert.ok(report.includes('- lifts.jsonl 与流水对不上：scratch-only，文件里最后一行是撤下，流水里没有这条规则的记录'), report)
  assert.ok(report.includes('- 撤下的规则：scratch-only'), report)
  assert.ok(existsSync(liftsPath(root)))
  rmSync(root, { recursive: true, force: true })
})
