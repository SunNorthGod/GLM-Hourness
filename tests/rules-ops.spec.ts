/**
 * What each operation of the rules board does (docs/ORCHESTRATION.md §16.9;
 * design §2.5, §6.3, §7.4, §7.5, §9.2): the right identity writes one record
 * whose replay makes the state, a request that cannot be done is refused with
 * a sentence and writes nothing, and every write carries the clean-up and the
 * expiry the clock calls for, as values in its changes. Real files in a
 * temporary git project; the board runs on a clock the test moves.
 *
 * Rules and switches reach a project through the rules file in the repository
 * (the only way in until the path of a person's agreement exists), so each test
 * starts by putting a file there and letting the board start from it.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test, { mock } from 'node:test'
import type { JournalRecord, ProjectState, RepoRules } from '../src/rules/model.ts'
import { repoJson, repoPart } from '../src/rules/model.ts'
import { readProject } from '../src/rules/repo.ts'
import { applyRecord, loadState, stateDigest, textDigest, type RulesPaths } from '../src/rules/store.ts'
import { ruleOf, scriptRef } from './rules-fixtures.ts'
import { clockedTest, HOUR, injectRecord, journalOf, MINUTE, treeOf, writeHeartbeat, type ClockedProject, type FakeClock } from './rules-helpers.ts'

const A = { pid: 4100, startedAt: 1_000 }
const B = { pid: 4200, startedAt: 2_000 }
const PEAK_STOP = 'any:builtin:glm-peak-stop'

function startFile(clock: FakeClock): RepoRules {
  return {
    version: 2,
    rules: {
      'r-block': ruleOf({ id: 'r-block', title: 'Block everything' }),
      'r-ttl': ruleOf({ id: 'r-ttl', title: 'For an hour', lifetime: { kind: 'ttl', expiresAt: new Date(clock.now() + HOUR).toISOString() } }),
      'r-until': ruleOf({ id: 'r-until', title: 'Until the freeze is off', lifetime: { kind: 'until', condition: { signal: 'code-freeze', is: false } } }),
      'r-until-clock': ruleOf({ id: 'r-until-clock', title: 'Until 10:30', lifetime: { kind: 'until', condition: { clock: { from: '10:30', to: '11:30', tz: '+00:00' } } } }),
      'r-until-peak': ruleOf({ id: 'r-until-peak', title: 'Until the peak is over', lifetime: { kind: 'until', condition: { signal: 'glm-peak', is: false } } }),
      'r-script': ruleOf({ id: 'r-script', title: 'A script', action: { kind: 'script', script: scriptRef('r-script'), onError: 'block' } }),
    },
    signals: {
      'code-freeze': { type: { kind: 'boolean' }, description: 'Nobody merges' },
      shift: { type: { kind: 'enum', values: ['day', 'night'] } },
      'server-errors-5m': { type: { kind: 'number', unit: 'errors' }, detector: 'd-server-errors' },
    },
    scripts: { 'r-script': scriptRef('r-script') },
  }
}

/** The project starts from a rules file, as a clone does; returns the state the board made of it. */
async function startFrom(project: ClockedProject, file: RepoRules = startFile(project.clock)): Promise<ProjectState> {
  const { paths, board } = project
  await mkdir(paths.rulesDir, { recursive: true })
  await writeFile(paths.rulesFile, repoJson(file))
  assert.notEqual(await board.settle(), 'busy')
  return loadState(paths).state
}

const stateOf = (paths: RulesPaths): ProjectState => loadState(paths).state
const ticketOf = (paths: RulesPaths, id: string): NonNullable<ProjectState['tickets']>[string] => {
  const ticket = stateOf(paths).tickets?.[id]
  assert.ok(ticket, `ticket ${id}`)
  return ticket
}

/** The project started from the file, a minute on: the state a write is made against. */
async function startedAMinuteAgo(project: ClockedProject): Promise<ProjectState> {
  await startFrom(project)
  project.clock.advance(MINUTE)
  return stateOf(project.paths)
}

/** The project started from the file and `count` tickets opened, in the sessions s-1, s-2 and so on. */
async function ticketsOpened(project: ClockedProject, ask: ReturnType<typeof askOf>, count: number): Promise<void> {
  await startFrom(project)
  for (let session = 1; session <= count; session++) await ask('harness', opening({ sessionId: `s-${session}` }))
}

/** A new ticket's request; a spec says only what it changes. */
const opening = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  op: 'ticket-open', sessionId: 's-1', agentLabel: 'worker-1', host: A, signature: 'abc123def456', tool: 'pwsh', summary: 'npm test', rules: ['r-block'], ...over,
})

/**
 * A request made while the two hosts of the specs are alive: their heartbeats are stamped with the moment of the call,
 * so a ticket is not found host-less just because the spec moved the clock. A spec about a lost host writes its own.
 */
function askOf(project: ClockedProject): (actor: Parameters<ClockedProject['board']['apply']>[0], request: Record<string, unknown>) => ReturnType<ClockedProject['board']['apply']> {
  return async (actor, request) => {
    for (const host of [A, B]) await writeHeartbeat(project.paths, host, project.clock.iso())
    return project.board.apply(actor, request)
  }
}

/** The last record of the journal, which the write just made, and the state before it. */
async function lastWrite(paths: RulesPaths, before: ProjectState): Promise<JournalRecord> {
  const record = (await journalOf(paths)).at(-1)
  assert.ok(record)
  assert.equal(stateDigest(applyRecord(before, record)), record.snapshot, 'the record alone turns the state before into the state after')
  assert.equal(stateDigest(stateOf(paths)), record.snapshot)
  return record
}

async function refused(project: ClockedProject, actor: Parameters<ClockedProject['board']['apply']>[0], request: Record<string, unknown>, code: string, message: RegExp): Promise<void> {
  const before = await treeOf(project.root)
  const result = await project.board.apply(actor, request)
  assert.equal(result.ok, false, JSON.stringify(request))
  if (!result.ok) {
    assert.equal(result.error.code, code, JSON.stringify(request))
    assert.match(result.error.message, message)
  }
  assert.deepEqual(await treeOf(project.root), before, `a refused ${String(request.op)} writes no file`)
}

// ------------------------------------------------------------------- rules

clockedTest('rule-lift: the person lifts a rule that is in force; one record, and the rules file follows', async (project) => {
  const { clock, board, paths } = project
  const before = await startedAMinuteAgo(project)
  const result = await board.apply('human', { op: 'rule-lift', id: 'r-block', reason: '人用 /rules lift 解除了这条规则' })
  assert.ok(result.ok && result.changed)
  assert.equal(result.file, 'written')
  assert.equal(result.target, 'r-block')
  assert.equal(result.state.rules?.['r-block']?.status, 'lifted')
  const record = await lastWrite(paths, before)
  assert.deepEqual([record.actor, record.op, record.target, record.reason, record.at], ['human', 'rule-lift', 'r-block', '人用 /rules lift 解除了这条规则', clock.iso()])
  assert.deepEqual([(record.from as { status: string }).status, (record.to as { status: string }).status], ['active', 'lifted'])
  assert.deepEqual(record.changes.map(change => change.path), [['rules', 'r-block'], ['repo']])
  const file = JSON.parse(await readFile(paths.rulesFile, 'utf8')) as { rules: Record<string, { status: string }> }
  assert.equal(file.rules['r-block']?.status, 'lifted')
  assert.equal(stateOf(paths).repo.digest, textDigest(await readFile(paths.rulesFile, 'utf8')))
  assert.equal(readProject(paths).repo.kind, 'in-sync')
})

clockedTest('rule-lift and rule-delete refuse what is not there, with a sentence, and write nothing', async (project) => {
  await startFrom(project)
  await project.board.apply('human', { op: 'rule-lift', id: 'r-block' })
  await refused(project, 'human', { op: 'rule-lift', id: 'r-block' }, 'conflict', /r-block 不在生效，不用解除/)
  await refused(project, 'human', { op: 'rule-lift', id: 'r-nowhere' }, 'conflict', /没有 r-nowhere 这条规则/)
  await refused(project, 'human', { op: 'rule-lift', id: 'builtin:glm-peak-pricing' }, 'conflict', /写在代码里/)
  await refused(project, 'human', { op: 'rule-delete', id: 'r-nowhere' }, 'conflict', /没有 r-nowhere 这条规则/)
  // Names every object has are no entries.
  for (const id of ['__proto__', 'constructor', 'toString']) {
    await refused(project, 'human', { op: 'rule-lift', id }, 'conflict', /没有/)
    await refused(project, 'human', { op: 'rule-delete', id }, 'conflict', /没有/)
  }
  await refused(project, 'human', { op: 'rule-lift' }, 'invalid', /id/)
})

clockedTest('rule-delete: the entry goes with its script pin; the last decided thing going takes the rules file with it', async (project) => {
  const { board, paths } = project
  const before = await startedAMinuteAgo(project)
  const result = await board.apply('human', { op: 'rule-delete', id: 'r-script' })
  assert.ok(result.ok && result.changed)
  assert.equal(result.state.rules?.['r-script'], undefined)
  assert.equal(result.state.scripts, undefined, 'the pin of a deleted entry is gone, and an empty collection is absent')
  const record = await lastWrite(paths, before)
  assert.deepEqual(record.changes.map(change => change.path), [['rules', 'r-script'], ['scripts', 'r-script'], ['repo']])
  assert.equal(((JSON.parse(await readFile(paths.rulesFile, 'utf8')) as RepoRules).rules ?? {})['r-script'], undefined)
})

clockedTest('rule-delete of the only decided rule removes the rules file and its note, and the project reads as in sync', async (project) => {
  const { board, paths } = project
  await startFrom(project, { version: 2, rules: { 'r-only': ruleOf({ id: 'r-only' }) } })
  const result = await board.apply('human', { op: 'rule-delete', id: 'r-only' })
  assert.ok(result.ok && result.changed)
  assert.equal(result.file, 'removed')
  assert.equal(result.state.repo.digest, null)
  assert.deepEqual((await readdir(paths.runtimeDir)).sort(), ['journal.jsonl', 'state.json'])
  await assert.rejects(readFile(paths.rulesFile), { code: 'ENOENT' })
  assert.equal(readProject(paths).repo.kind, 'in-sync')
})

clockedTest('rule-expire: the harness ends a rule whose time is up, and only then', async (project) => {
  const { clock, board, paths } = project
  await startFrom(project)
  await refused(project, 'harness', { op: 'rule-expire', id: 'r-ttl' }, 'conflict', /期限还没到/)
  await refused(project, 'harness', { op: 'rule-expire', id: 'r-block' }, 'conflict', /没有期限/)
  await refused(project, 'harness', { op: 'rule-expire', id: 'r-until-peak' }, 'conflict', /读不到/)
  await refused(project, 'harness', { op: 'rule-expire', id: 'r-until-clock' }, 'conflict', /还没成立/)
  clock.advance(HOUR + MINUTE)
  const before = stateOf(paths)
  const done = await board.apply('harness', { op: 'rule-expire', id: 'r-ttl' })
  assert.ok(done.ok && done.changed)
  assert.equal(done.state.rules?.['r-ttl']?.status, 'expired')
  assert.equal(done.file, 'written', 'the status of a project rule is in the rules file')
  const record = await lastWrite(paths, before)
  assert.match(record.evidence ?? '', /到期时刻 .* 已过/)
  assert.equal(record.changes[0]?.cause, 'expire')
  // The until-condition holds at 10:31, and nothing wrote in between.
  clock.advance(90 * MINUTE)
  const second = await board.apply('harness', { op: 'rule-expire', id: 'r-until-clock' })
  assert.ok(second.ok && second.changed)
  assert.match((await journalOf(paths)).at(-1)?.evidence ?? '', /结束条件已成立/)
  await refused(project, 'harness', { op: 'rule-expire', id: 'r-ttl' }, 'conflict', /不在生效/)
})

clockedTest('a write that makes an until-condition true expires the rule in the same record; a rule it cannot read the condition of is left alone', async (project) => {
  const { board, paths } = project
  const before = await startedAMinuteAgo(project)
  const set = await board.apply('human', { op: 'signal-manual', name: 'code-freeze', value: false })
  assert.ok(set.ok && set.changed)
  assert.equal(set.state.rules?.['r-until']?.status, 'expired')
  assert.equal(set.state.rules?.['r-until-peak']?.status, 'active', 'glm-peak is the host\'s to read')
  const record = await lastWrite(paths, before)
  assert.deepEqual(record.changes.map(change => [change.path.join('/'), change.cause]), [['signals/code-freeze', undefined], ['rules/r-until', 'expire'], ['repo', undefined]])
})

clockedTest('rule-expire on a session rule needs the host to say the session is gone; such a rule never expires by itself', async (project) => {
  const { clock, board, paths } = project
  await startFrom(project)
  const session = ruleOf({ id: 'r-session', scope: 'session', sessionId: 's-9', lifetime: { kind: 'session' } })
  await injectRecord(paths, [{ path: ['rules', 'r-session'], value: session }], clock.iso())
  clock.advance(25 * HOUR)
  await refused(project, 'harness', { op: 'rule-expire', id: 'r-session' }, 'conflict', /会话 s-9 还没有释放/)
  const tick = await board.apply('harness', { op: 'notice-add', kind: 'late-block', rule: 'r-block', text: 'a write moves the clock' })
  assert.ok(tick.ok)
  assert.equal(stateOf(paths).rules?.['r-session']?.status, 'active')
  const before = stateOf(paths)
  const done = await board.apply('harness', { op: 'rule-expire', id: 'r-session', released: true })
  assert.ok(done.ok && done.changed)
  assert.equal(done.file, 'unchanged', 'a session\'s rule is not in the rules file')
  const record = await lastWrite(paths, before)
  assert.match(record.evidence ?? '', /会话 s-9 在本宿主上已释放/)
})

// ----------------------------------------------------------------- signals

clockedTest('signal-manual sets a person\'s value, with or without a time, and the rules file carries it', async (project) => {
  const { clock, board, paths } = project
  const before = await startedAMinuteAgo(project)
  const set = await board.apply('human', { op: 'signal-manual', name: 'code-freeze', value: true, durationMs: 2 * HOUR })
  assert.ok(set.ok && set.changed)
  assert.deepEqual(set.state.signals?.['code-freeze']?.manual, { value: true, at: clock.iso(), expiresAt: new Date(clock.now() + 2 * HOUR).toISOString() })
  const record = await lastWrite(paths, before)
  assert.deepEqual([record.actor, record.op, record.target, record.to], ['human', 'signal-manual', 'code-freeze', true])
  assert.equal(((JSON.parse(await readFile(paths.rulesFile, 'utf8')) as RepoRules).signals ?? {})['code-freeze']?.manual?.value, true)
  const detected = await board.apply('human', { op: 'signal-manual', name: 'server-errors-5m', value: 3 })
  assert.ok(detected.ok, 'a person\'s value goes over a detector\'s')
  assert.deepEqual(detected.state.signals?.['server-errors-5m']?.manual, { value: 3, at: clock.iso() })
  const enumSet = await board.apply('human', { op: 'signal-manual', name: 'shift', value: 'night' })
  assert.ok(enumSet.ok)
})

clockedTest('signal-manual refuses an unknown signal, a value of the wrong type and a time that is not a time', async (project) => {
  await startFrom(project)
  await refused(project, 'human', { op: 'signal-manual', name: 'nowhere', value: true }, 'conflict', /没有 nowhere 这个信号/)
  await refused(project, 'human', { op: 'signal-manual', name: 'glm-peak', value: true }, 'conflict', /宿主/)
  await refused(project, 'human', { op: 'signal-manual', name: 'code-freeze', value: 'yes' }, 'invalid', /类型/)
  await refused(project, 'human', { op: 'signal-manual', name: 'shift', value: 'dusk' }, 'invalid', /类型/)
  await refused(project, 'human', { op: 'signal-manual', name: 'server-errors-5m', value: Number.NaN }, 'invalid', /value/)
  for (const durationMs of [0, -1, 1.5, 7 * 24 * HOUR + 1, '2h']) {
    await refused(project, 'human', { op: 'signal-manual', name: 'code-freeze', value: true, durationMs }, 'invalid', /durationMs/)
  }
  await refused(project, 'human', { op: 'signal-manual', name: '__proto__', value: true }, 'conflict', /没有/)
})

clockedTest('signal-clear takes the person\'s value away; signal-delete removes a switch, not a detector\'s signal', async (project) => {
  const { board, paths } = project
  await startFrom(project)
  await refused(project, 'human', { op: 'signal-clear', name: 'code-freeze' }, 'conflict', /没有手设的值/)
  await board.apply('human', { op: 'signal-manual', name: 'code-freeze', value: true })
  const cleared = await board.apply('human', { op: 'signal-clear', name: 'code-freeze' })
  assert.ok(cleared.ok && cleared.changed)
  assert.equal(cleared.state.signals?.['code-freeze']?.manual, undefined)
  assert.equal(cleared.state.signals?.['code-freeze']?.description, 'Nobody merges', 'the definition stays')
  await refused(project, 'human', { op: 'signal-delete', name: 'server-errors-5m' }, 'conflict', /检测器 d-server-errors/)
  const before = stateOf(paths)
  const deleted = await board.apply('human', { op: 'signal-delete', name: 'code-freeze' })
  assert.ok(deleted.ok && deleted.changed)
  assert.equal(deleted.state.signals?.['code-freeze'], undefined)
  assert.ok(deleted.state.rules?.['r-until'], 'a rule that names the deleted signal stays: it is stored, not judged')
  await lastWrite(paths, before)
  await refused(project, 'human', { op: 'signal-delete', name: 'code-freeze' }, 'conflict', /没有 code-freeze 这个信号/)
})

// ----------------------------------------------------------------- tickets

clockedTest('ticket-open numbers tickets from q-1, keeps them in the state and out of the rules file', async (project) => {
  const ask = askOf(project)
  const { clock, paths } = project
  await startFrom(project)
  const fileBefore = await readFile(paths.rulesFile, 'utf8')
  clock.advance(MINUTE)
  const before = stateOf(paths)
  const first = await ask('harness', opening({ summary: 'x'.repeat(300), nested: true, scriptRules: ['r-script'] }))
  assert.ok(first.ok && first.changed)
  assert.equal(first.target, 'q-1')
  assert.equal(first.file, 'unchanged')
  const ticket = first.state.tickets?.['q-1']
  assert.deepEqual([ticket?.state, ticket?.since, ticket?.host, ticket?.rules, ticket?.nested, ticket?.scriptRules], ['deferred', clock.iso(), A, ['r-block'], true, ['r-script']])
  assert.equal(ticket?.summary.length, 160, 'a summary is cut to 160 characters')
  assert.equal(first.state.nextTicket, 2)
  const record = await lastWrite(paths, before)
  assert.deepEqual([record.actor, record.op, record.target], ['harness', 'ticket-open', 'q-1'])
  assert.deepEqual(record.changes.map(change => change.path), [['tickets', 'q-1'], ['nextTicket']])
  const second = await ask('harness', opening({ sessionId: 's-2' }))
  assert.ok(second.ok)
  assert.equal(second.target, 'q-2')
  assert.equal(second.state.nextTicket, 3)
  assert.equal(await readFile(paths.rulesFile, 'utf8'), fileBefore)
})

clockedTest('ticket-open refuses a request that lacks what a ticket needs', async (project) => {
  await startFrom(project)
  for (const [field, bad] of [['sessionId', undefined], ['agentLabel', ''], ['host', { pid: 'x', startedAt: 1 }], ['host', { pid: 1 }], ['signature', undefined], ['tool', 3], ['summary', undefined], ['rules', 'r-block'], ['rules', [1]], ['nested', false], ['pausedGoal', { id: 'g' }]] as const) {
    await refused(project, 'harness', opening({ [field]: bad }), 'invalid', new RegExp(field))
  }
})

clockedTest('ticket-update moves a ticket along its states, stamps the times itself and refuses a step back', async (project) => {
  const ask = askOf(project)
  const { clock, paths } = project
  await ticketsOpened(project, ask, 2)
  clock.advance(MINUTE)
  const cleared = await ask('harness', { op: 'ticket-update', id: 'q-1', state: 'cleared' })
  assert.ok(cleared.ok && cleared.changed)
  assert.equal(ticketOf(paths, 'q-1').clearedAt, clock.iso())
  const unchanged = await ask('harness', { op: 'ticket-update', id: 'q-1', state: 'cleared' })
  assert.ok(unchanged.ok && !unchanged.changed, 'saying what is so writes nothing')
  clock.advance(MINUTE)
  const done = await ask('harness', { op: 'ticket-update', id: 'q-1', state: 'done', resumed: true })
  assert.ok(done.ok && done.changed)
  assert.deepEqual([ticketOf(paths, 'q-1').state, ticketOf(paths, 'q-1').closedAt, ticketOf(paths, 'q-1').resumedAt], ['done', clock.iso(), clock.iso()])
  await refused(project, 'harness', { op: 'ticket-update', id: 'q-1', state: 'deferred' }, 'conflict', /done.*deferred|不能/)
  await refused(project, 'harness', { op: 'ticket-update', id: 'q-2', state: 'expired' }, 'invalid', /expiredWhy/)
  await refused(project, 'harness', { op: 'ticket-update', id: 'q-2', state: 'cleared', expiredWhy: 'age' }, 'invalid', /expiredWhy/)
  await refused(project, 'harness', { op: 'ticket-update', id: 'q-9', state: 'done' }, 'conflict', /没有 q-9 这张单/)
  await refused(project, 'harness', { op: 'ticket-update', id: 'q-2' }, 'invalid', /要改什么/)
  const expired = await ask('harness', { op: 'ticket-update', id: 'q-2', state: 'expired', expiredWhy: 'not-retried', rules: [] })
  assert.ok(expired.ok)
  assert.deepEqual([ticketOf(paths, 'q-2').state, ticketOf(paths, 'q-2').expiredWhy, ticketOf(paths, 'q-2').closedAt, ticketOf(paths, 'q-2').rules], ['expired', 'not-retried', clock.iso(), []])
})

clockedTest('ticket-update records a paused goal and the failure to pause one', async (project) => {
  const ask = askOf(project)
  const { paths } = project
  await startFrom(project)
  await ask('harness', opening({ signature: PEAK_STOP }))
  const paused = await ask('harness', { op: 'ticket-update', id: 'q-1', pausedGoal: { id: 'goal-1', revision: 4 } })
  assert.ok(paused.ok && paused.changed)
  assert.deepEqual(ticketOf(paths, 'q-1').pausedGoal, { id: 'goal-1', revision: 4 })
  const failed = await ask('harness', { op: 'ticket-update', id: 'q-1', pauseFailed: 'revision mismatch' })
  assert.ok(failed.ok && failed.changed)
  assert.equal(ticketOf(paths, 'q-1').pauseFailed, 'revision mismatch')
})

clockedTest('ticket-handover gives a ticket to another session and keeps who it came from first', async (project) => {
  const ask = askOf(project)
  const { clock, paths } = project
  await startFrom(project)
  await ask('harness', opening({ sessionId: 's-sub', agentLabel: 'sub-1' }))
  clock.advance(MINUTE)
  const before = stateOf(paths)
  const handed = await ask('harness', { op: 'ticket-handover', id: 'q-1', sessionId: 's-root', agentLabel: 'main', focus: 'task-3' })
  assert.ok(handed.ok && handed.changed)
  const ticket = ticketOf(paths, 'q-1')
  assert.deepEqual([ticket.sessionId, ticket.agentLabel, ticket.handedFrom], ['s-root', 'main', { sessionId: 's-sub', agentLabel: 'sub-1', focus: 'task-3', at: clock.iso() }])
  assert.equal((await lastWrite(paths, before)).op, 'ticket-handover')
  await ask('harness', { op: 'ticket-handover', id: 'q-1', sessionId: 's-sub-2', agentLabel: 'sub-2' })
  assert.deepEqual(ticketOf(paths, 'q-1').handedFrom?.sessionId, 's-sub', 'the first holder stays on record')
  const same = await ask('harness', { op: 'ticket-handover', id: 'q-1', sessionId: 's-sub-2', agentLabel: 'sub-2' })
  assert.ok(same.ok && !same.changed)
  await ask('harness', { op: 'ticket-update', id: 'q-1', state: 'done' })
  await refused(project, 'harness', { op: 'ticket-handover', id: 'q-1', sessionId: 's-x', agentLabel: 'x' }, 'conflict', /已经关了/)
})

clockedTest('ticket-adopt hands a peak-stop ticket to the host that found it, and brings back one whose host was lost', async (project) => {
  const ask = askOf(project)
  const { clock, paths } = project
  await startFrom(project)
  await ask('harness', opening({ signature: PEAK_STOP }))
  await ask('harness', opening({ sessionId: 's-2' }))
  await refused(project, 'harness', { op: 'ticket-adopt', id: 'q-2', host: B }, 'conflict', /不做档/)
  const moved = await ask('harness', { op: 'ticket-adopt', id: 'q-1', host: B })
  assert.ok(moved.ok && moved.changed)
  assert.deepEqual([ticketOf(paths, 'q-1').host, ticketOf(paths, 'q-1').state], [B, 'deferred'])
  const same = await ask('harness', { op: 'ticket-adopt', id: 'q-1', host: B })
  assert.ok(same.ok && !same.changed)
  // Host B stops reporting: the next write finds its ticket without a host.
  clock.advance(MINUTE)
  await writeHeartbeat(paths, A, clock.iso())
  await project.board.apply('harness', { op: 'notice-add', kind: 'late-block', rule: 'r-block', text: 'a write' })
  assert.deepEqual([ticketOf(paths, 'q-1').state, ticketOf(paths, 'q-1').expiredWhy], ['expired', 'host-gone'])
  assert.equal(ticketOf(paths, 'q-2').state, 'deferred', 'host A is alive')
  const back = await project.board.apply('harness', { op: 'ticket-adopt', id: 'q-1', host: A })
  assert.ok(back.ok && back.changed)
  const ticket = ticketOf(paths, 'q-1')
  assert.deepEqual([ticket.state, ticket.host, ticket.closedAt, ticket.expiredWhy], ['deferred', A, undefined, undefined])
  // One whose goal was resumed has finished: it is not taken back.
  await project.board.apply('harness', { op: 'ticket-update', id: 'q-1', state: 'expired', expiredWhy: 'host-gone', resumed: true })
  await refused(project, 'harness', { op: 'ticket-adopt', id: 'q-1', host: A }, 'conflict', /已经/)
})

clockedTest('ticket-let-once lets the next call through for ten minutes, or until the time the caller names; ticket-cancel closes a ticket', async (project) => {
  const ask = askOf(project)
  const { clock, paths } = project
  await ticketsOpened(project, ask, 3)
  clock.advance(MINUTE)
  const before = stateOf(paths)
  const once = await ask('human', { op: 'ticket-let-once', id: 'q-1' })
  assert.ok(once.ok && once.changed)
  assert.equal(ticketOf(paths, 'q-1').letOnceUntil, new Date(clock.now() + 10 * MINUTE).toISOString())
  assert.equal((await lastWrite(paths, before)).actor, 'human')
  const until = new Date(clock.now() + 3 * HOUR).toISOString()
  const named = await ask('human', { op: 'ticket-let-once', id: 'q-2', until })
  assert.ok(named.ok)
  assert.equal(ticketOf(paths, 'q-2').letOnceUntil, until)
  await refused(project, 'human', { op: 'ticket-let-once', id: 'q-3', until: new Date(clock.now() - 1).toISOString() }, 'invalid', /until/)
  await refused(project, 'human', { op: 'ticket-let-once', id: 'q-3', until: new Date(clock.now() + 25 * HOUR).toISOString() }, 'invalid', /until/)
  await ask('harness', { op: 'ticket-update', id: 'q-3', state: 'cleared' })
  await refused(project, 'human', { op: 'ticket-let-once', id: 'q-3' }, 'conflict', /q-3 已经解除，不用放行/)
  const cancelled = await ask('human', { op: 'ticket-cancel', id: 'q-3' })
  assert.ok(cancelled.ok && cancelled.changed)
  assert.deepEqual([ticketOf(paths, 'q-3').state, ticketOf(paths, 'q-3').closedAt], ['cancelled', clock.iso()])
  await refused(project, 'human', { op: 'ticket-cancel', id: 'q-3' }, 'conflict', /q-3 已经关了/)
  await refused(project, 'human', { op: 'ticket-let-once', id: 'q-3' }, 'conflict', /q-3 已经关了/)
  await refused(project, 'human', { op: 'ticket-cancel', id: 'q-0' }, 'conflict', /没有 q-0 这张单/)
})

// ---------------------------------------------------- clean-up and expiry

clockedTest('every write carries the clean-up the clock calls for, as values in its changes, and replay needs neither the clock nor the heartbeats', async (project) => {
  const { clock, board, paths } = project
  await startFrom(project)
  await writeHeartbeat(paths, A, clock.iso())
  await writeHeartbeat(paths, B, clock.iso())
  await board.apply('harness', opening({ sessionId: 's-a' }))                  // q-1: host A, goes on past 24 h
  await board.apply('harness', opening({ sessionId: 's-b', host: B }))         // q-2: host B, whose heartbeat is lost
  await board.apply('harness', opening({ sessionId: 's-c' }))                  // q-3: closed at once
  await board.apply('human', { op: 'ticket-cancel', id: 'q-3' })
  await board.apply('harness', opening({ sessionId: 's-d' }))                  // q-4: cleared and left
  await board.apply('harness', { op: 'ticket-update', id: 'q-4', state: 'cleared' })
  clock.advance(25 * HOUR)
  await writeHeartbeat(paths, A, clock.iso())
  await unlink(join(paths.runtimeDir, 'hosts', `${B.pid}-${B.startedAt}.json`))
  const before = stateOf(paths)
  const written = await board.apply('harness', { op: 'notice-add', kind: 'late-block', rule: 'r-block', text: 'any write will do' })
  assert.ok(written.ok)
  const record = await lastWrite(paths, before)
  const byPath = Object.fromEntries(record.changes.map(change => [change.path.join('/'), change]))
  assert.deepEqual(byPath['tickets/q-3'], { path: ['tickets', 'q-3'], cause: 'prune' }, 'closed more than 24 h ago: deleted')
  assert.equal(byPath['tickets/q-2']?.cause, 'expire')
  assert.equal(byPath['tickets/q-1']?.cause, 'expire')
  assert.equal(byPath['tickets/q-4']?.cause, 'expire')
  const now = stateOf(paths)
  assert.equal(now.tickets?.['q-3'], undefined)
  assert.deepEqual([now.tickets?.['q-2']?.state, now.tickets?.['q-2']?.expiredWhy, now.tickets?.['q-2']?.closedAt], ['expired', 'host-gone', clock.iso()])
  assert.equal(now.tickets?.['q-1']?.expiredWhy, 'age', 'a live host does not keep a ticket past 24 h')
  assert.equal(now.tickets?.['q-4']?.expiredWhy, 'not-retried', 'cleared and not retried within 30 minutes, its host alive')
  assert.equal(now.rules?.['r-ttl']?.status, 'expired')
  assert.equal(byPath['rules/r-ttl']?.cause, 'expire')
  assert.equal(await readFile(paths.rulesFile, 'utf8').then(text => (JSON.parse(text) as RepoRules).rules?.['r-ttl']?.status), 'expired', 'the expired rule is in the rules file')

  // Replay: no heartbeat directory, a clock that stands still at the epoch, a snapshot that is gone.
  await rm(join(paths.runtimeDir, 'hosts'), { recursive: true })
  await unlink(paths.state)
  mock.timers.enable({ apis: ['Date'], now: 0 })
  try {
    const replayed = loadState(paths)
    assert.equal(replayed.source, 'replay')
    assert.equal(stateDigest(replayed.state), stateDigest(now))
    assert.deepEqual(replayed.plan?.recovered?.skipped, [])
  }
  finally {
    mock.timers.reset()
  }
})

clockedTest('what is closed less than 24 h ago stays; a cleared ticket nobody retried in 30 minutes expires; a live host keeps an open ticket', async (project) => {
  const { clock, board, paths } = project
  await startFrom(project)
  await writeHeartbeat(paths, A, clock.iso())
  await board.apply('harness', opening())
  await board.apply('harness', opening({ sessionId: 's-2' }))
  await board.apply('harness', { op: 'ticket-update', id: 'q-2', state: 'cleared' })
  await board.apply('harness', opening({ sessionId: 's-3' }))
  await board.apply('human', { op: 'ticket-cancel', id: 'q-3' })
  clock.advance(23 * HOUR)
  await writeHeartbeat(paths, A, clock.iso())
  await board.apply('harness', { op: 'notice-add', kind: 'late-block', rule: 'r-block', text: 'first' })
  const tickets = stateOf(paths).tickets
  assert.equal(tickets?.['q-3']?.state, 'cancelled', 'closed 23 h ago: kept')
  assert.equal(tickets?.['q-1']?.state, 'deferred', 'open 23 h with a live host: kept')
  assert.deepEqual([tickets?.['q-2']?.state, tickets?.['q-2']?.expiredWhy], ['expired', 'not-retried'], 'cleared 23 h ago and not retried')
})

clockedTest('a ticket this very write touches is not cleaned up by it', async (project) => {
  const { clock, board, paths } = project
  await startFrom(project)
  await board.apply('harness', opening({ host: B }))
  clock.advance(HOUR)
  const done = await board.apply('human', { op: 'ticket-cancel', id: 'q-1' })
  assert.ok(done.ok)
  assert.deepEqual([ticketOf(paths, 'q-1').state, ticketOf(paths, 'q-1').expiredWhy], ['cancelled', undefined], 'the person closed it; its host being gone does not rewrite that')
})

// ---------------------------------------------------------------- recovery

const FORGED_AT = '2026-11-03T08:00:00.000Z'
const notice = (text: string): { readonly kind: string, readonly rule: string, readonly text: string, readonly at: string } => ({ kind: 'late-block', rule: 'r-block', text, at: FORGED_AT })
const forged = (extra: Record<string, unknown>): string => JSON.stringify({ at: FORGED_AT, actor: 'harness', op: 'notice-add', ...extra })
/** The key a skipped line is listed under: the first 12 hex digits of the SHA-256 of its text. */
const keyOf = (line: string): string => createHash('sha256').update(line).digest('hex').slice(0, 12)

/**
 * Three lines no engine wrote, appended to the journal and settled by a write: one with a digest that is made up (seq 40),
 * one with no digest that sets the same notice again and a second one, one with no changes at all. Each is listed
 * under a number the person can use; `labels` has them by name.
 */
async function withForgedLines(project: ClockedProject): Promise<{ readonly labels: Record<'first' | 'second' | 'empty', string>, readonly keys: Record<'first' | 'second' | 'empty', string> }> {
  const { paths, board } = project
  await startFrom(project)
  const lines = {
    first: forged({ seq: 40, changes: [{ path: ['notices', 'n-forged-1'], value: notice('forged with a digest') }], snapshot: '0123456789abcdef' }),
    second: forged({ changes: [{ path: ['notices', 'n-forged-1'], value: notice('overwritten by the second') }, { path: ['notices', 'n-forged-2'], value: notice('only in the second') }] }),
    empty: forged({}),
  }
  for (const line of Object.values(lines)) await appendFile(paths.journal, `${line}\n`)
  const written = await board.apply('harness', { op: 'notice-add', kind: 'late-block', rule: 'r-block', text: 'a write settles the lines' })
  assert.ok(written.ok)
  const keys = { first: keyOf(lines.first), second: keyOf(lines.second), empty: keyOf(lines.empty) }
  const unresolved = stateOf(paths).unresolved ?? {}
  assert.deepEqual(Object.keys(unresolved).sort(), Object.values(keys).sort())
  const label = (key: string): string => unresolved[key]?.label ?? 'missing'
  return { keys, labels: { first: label(keys.first), second: label(keys.second), empty: label(keys.empty) } }
}

clockedTest('recovery-accept makes the lines\' own changes the state\'s and clears them from the list; recovery-dismiss only clears', async (project) => {
  const { labels } = await withForgedLines(project)
  const { board, paths } = project
  const before = stateOf(paths)
  const accepted = await board.apply('human', { op: 'recovery-accept', labels: [labels.first], reason: '人看过那一行，照改' })
  assert.ok(accepted.ok && accepted.changed)
  assert.equal(accepted.state.notices?.['n-forged-1']?.text, 'forged with a digest')
  assert.equal(accepted.state.notices?.['n-forged-2'], undefined)
  assert.equal(Object.keys(accepted.state.unresolved ?? {}).length, 2)
  const record = await lastWrite(paths, before)
  assert.deepEqual([record.actor, record.op, record.target, record.reason], ['human', 'recovery-accept', labels.first, '人看过那一行，照改'])
  assert.equal(record.changes.at(-1)?.path[0], 'unresolved')
  const dismissed = await board.apply('human', { op: 'recovery-dismiss', labels: [labels.second] })
  assert.ok(dismissed.ok && dismissed.changed)
  assert.equal(dismissed.state.notices?.['n-forged-2'], undefined, 'dismissed: its change never takes effect')
  assert.deepEqual((await journalOf(paths)).at(-1)?.changes.map(change => change.path[0]), ['unresolved'])
  assert.equal(Object.keys(dismissed.state.unresolved ?? {}).length, 1)
})

clockedTest('recovery-accept takes several lines in the order the journal has them, and refuses lines it cannot do, whole', async (project) => {
  const { labels, keys } = await withForgedLines(project)
  const { board, paths } = project
  await refused(project, 'human', { op: 'recovery-accept', labels: [labels.first, '99-9'] }, 'conflict', /没有编号 99-9/)
  await refused(project, 'human', { op: 'recovery-accept', labels: [labels.empty] }, 'conflict', /这一条只能忽略/)
  await refused(project, 'human', { op: 'recovery-accept', labels: [] }, 'invalid', /labels/)
  await refused(project, 'human', { op: 'recovery-dismiss', labels: [labels.first, 7] }, 'invalid', /labels/)
  const both = await board.apply('human', { op: 'recovery-accept', labels: [labels.second, labels.first] })
  assert.ok(both.ok && both.changed)
  assert.equal(both.state.notices?.['n-forged-1']?.text, 'overwritten by the second', 'the journal\'s order, not the order the labels were given in')
  assert.equal(both.state.notices?.['n-forged-2']?.text, 'only in the second')
  assert.deepEqual(Object.keys(stateOf(paths).unresolved ?? {}), [keys.empty])
})

clockedTest('recovery-accept of a line whose changes do not fit the state is refused with the reason, and the line stays listed', async (project) => {
  const { paths, board } = project
  await startFrom(project)
  await appendFile(paths.journal, `${forged({ seq: 50, changes: [{ path: ['proposals', 'p-1'], value: {} }], snapshot: '0123456789abcdef' })}\n`)
  await appendFile(paths.journal, `${forged({ seq: 51, changes: [{ path: ['notices', 'n-bad'], value: { kind: 'shout', rule: 'r', text: 't', at: FORGED_AT } }], snapshot: '0123456789abcdef' })}\n`)
  await board.apply('harness', { op: 'notice-add', kind: 'late-block', rule: 'r-block', text: 'settle' })
  const [one, two] = Object.values(stateOf(paths).unresolved ?? {}).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  await refused(project, 'human', { op: 'recovery-accept', labels: [one?.label] }, 'invalid', /做不了/)
  await refused(project, 'human', { op: 'recovery-accept', labels: [two?.label] }, 'invalid', /不合法/)
  assert.equal(Object.keys(stateOf(paths).unresolved ?? {}).length, 2)
})

clockedTest('a line nothing can read can only be dismissed', async (project) => {
  const { paths, board } = project
  await startFrom(project)
  await appendFile(paths.journal, 'this is not json\n')
  await board.apply('harness', { op: 'notice-add', kind: 'late-block', rule: 'r-block', text: 'settle' })
  const entry = Object.values(stateOf(paths).unresolved ?? {}).find(item => item.why === 'unreadable')
  assert.ok(entry)
  await refused(project, 'human', { op: 'recovery-accept', labels: [entry.label] }, 'conflict', /这一条只能忽略/)
  const dismissed = await board.apply('human', { op: 'recovery-dismiss', labels: [entry.label] })
  assert.ok(dismissed.ok && dismissed.changed)
  assert.equal(Object.values(dismissed.state.unresolved ?? {}).some(item => item.why === 'unreadable'), false)
})

// ------------------------------------------------------------------- repo

clockedTest('repo-adopt makes a changed rules file the state\'s; repo-restore writes the board\'s own back; with nothing outside both do nothing', async (project) => {
  const { clock, board, paths } = project
  await startFrom(project)
  const none = await board.apply('human', { op: 'repo-adopt' })
  assert.ok(none.ok && !none.changed)
  const noRestore = await board.apply('human', { op: 'repo-restore' })
  assert.ok(noRestore.ok && !noRestore.changed)

  const file = JSON.parse(await readFile(paths.rulesFile, 'utf8')) as RepoRules & { rules: Record<string, unknown> }
  file.rules['r-new'] = ruleOf({ id: 'r-new', title: 'Added by hand' })
  await writeFile(paths.rulesFile, `${JSON.stringify(file)}\n`)
  clock.advance(MINUTE)
  const adopted = await board.apply('human', { op: 'repo-adopt' })
  assert.ok(adopted.ok && adopted.changed)
  assert.equal(adopted.state.rules?.['r-new']?.title, 'Added by hand')
  assert.equal(adopted.state.repo.outside, undefined)
  assert.deepEqual(adopted.repinNeeded, ['r-script'], 'the script that has no approval on this machine is named')
  const records = await journalOf(paths)
  assert.deepEqual(records.slice(-2).map(record => [record.actor, record.op]), [['harness', 'repo-outside'], ['human', 'repo-adopt']])
  assert.equal(readProject(paths).repo.kind, 'in-sync')

  const second = JSON.parse(await readFile(paths.rulesFile, 'utf8')) as { rules: Record<string, unknown> }
  delete second.rules['r-block']
  await writeFile(paths.rulesFile, `${JSON.stringify(second)}\n`)
  const restored = await board.apply('human', { op: 'repo-restore' })
  assert.ok(restored.ok && restored.changed)
  assert.equal(restored.file, 'written')
  assert.equal(await readFile(paths.rulesFile, 'utf8'), repoJson(repoPart(restored.state)!))
  assert.ok(restored.state.rules?.['r-block'], 'the board\'s own rule is back')
  assert.equal(readProject(paths).repo.kind, 'in-sync')
})

clockedTest('a file put back as the board wrote it clears the outside mark with a record of the harness', async (project) => {
  const { board, paths } = project
  await startFrom(project)
  const mine = await readFile(paths.rulesFile, 'utf8')
  await writeFile(paths.rulesFile, mine.replace('Block everything', 'Changed by hand'))
  await board.apply('harness', { op: 'notice-add', kind: 'late-block', rule: 'r-block', text: 'settles the outside change' })
  assert.notEqual(stateOf(paths).repo.outside, undefined)
  await writeFile(paths.rulesFile, mine)
  await board.apply('harness', { op: 'notice-delivered', id: 'n-3' })
  assert.deepEqual((await journalOf(paths)).map(record => record.op).filter(op => op.startsWith('repo-')), ['repo-outside', 'repo-outside-cleared'])
  assert.equal(stateOf(paths).repo.outside, undefined)
})

// ----------------------------------------------------------------- notices

clockedTest('notice-add keeps what the main agent has still to be told, notice-delivered removes it', async (project) => {
  const { clock, board, paths } = project
  await startFrom(project)
  const before = stateOf(paths)
  const added = await board.apply('harness', { op: 'notice-add', kind: 'script-capped', rule: 'r-script', text: 'The script ran 10 minutes and was ended.' })
  assert.ok(added.ok && added.changed)
  assert.equal(added.target, 'n-2', 'the id is made of the record\'s sequence number')
  assert.deepEqual(added.state.notices?.['n-2'], { kind: 'script-capped', rule: 'r-script', text: 'The script ran 10 minutes and was ended.', at: clock.iso() })
  const record = await lastWrite(paths, before)
  assert.deepEqual([record.actor, record.op, record.target], ['harness', 'notice-add', 'n-2'])
  await refused(project, 'harness', { op: 'notice-add', kind: 'shout', rule: 'r', text: 't' }, 'invalid', /kind/)
  await refused(project, 'harness', { op: 'notice-add', kind: 'late-block', rule: '', text: 't' }, 'invalid', /rule/)
  await refused(project, 'harness', { op: 'notice-add', kind: 'late-block', rule: 'r', text: '' }, 'invalid', /text/)
  await refused(project, 'harness', { op: 'notice-delivered', id: 'n-77' }, 'conflict', /没有 n-77 这条提醒/)
  const delivered = await board.apply('harness', { op: 'notice-delivered', id: 'n-2' })
  assert.ok(delivered.ok && delivered.changed)
  assert.equal(delivered.state.notices, undefined, 'the last one gone: no collection')
})

// ---------------------------------------------------------------- identity

clockedTest('who asks is the entry\'s, never the request\'s: a body that names another identity changes nothing', async (project) => {
  const { board, paths } = project
  await startFrom(project)
  await refused(project, 'llm', { op: 'rule-lift', id: 'r-block', actor: 'human' }, 'forbidden', /身份 llm/)
  await refused(project, 'detector', { op: 'rule-lift', id: 'r-block', actor: 'human', identity: 'human' }, 'forbidden', /身份 detector/)
  await refused(project, 'human', { op: 'notice-add', kind: 'late-block', rule: 'r', text: 't', actor: 'harness' }, 'forbidden', /身份 human/)
  const lifted = await board.apply('human', { op: 'rule-lift', id: 'r-block', actor: 'harness' })
  assert.ok(lifted.ok)
  assert.equal((await journalOf(paths)).at(-1)?.actor, 'human')
})

clockedTest('a request made against an older state is stale for every operation, not only the peak level', async (project) => {
  const { board, paths } = project
  const started = await startFrom(project)
  await board.apply('human', { op: 'rule-lift', id: 'r-block' })
  await refused(project, 'human', { op: 'rule-delete', id: 'r-script', rev: started.seq }, 'stale_revision', /第 \d+ 版/)
  const current = await board.apply('human', { op: 'rule-delete', id: 'r-script', rev: stateOf(paths).seq })
  assert.ok(current.ok && current.changed)
})

test('the operations table is the one the design lists: nothing for a proposal is in it', async () => {
  const { WRITE_OPS } = await import('../src/rules/permissions.ts')
  assert.equal(WRITE_OPS.some(op => /propos|^propose$|rule-set|signal-define|detector-|repin|^remove$|signal-detected/.test(op)), false)
})
