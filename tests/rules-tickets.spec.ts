/**
 * Waiting tickets on the fake rc.3 host (docs/ORCHESTRATION.md §16.12; design
 * §6.3, §6.4, §6.5, §15 R4): a call a rule queues is refused once with a
 * ticket number and a text for who made the call (an agent, a subagent, a
 * run_code program); the same call again is the same ticket; the host that
 * owns a ticket re-judges it every 5 seconds and, when the rule no longer
 * holds, tells the original agent once, by its state (steer, inject, followup);
 * a subagent's ticket goes to the agent that dispatched it when the
 * subagent's session ends; a ticket expires by age, by an agent that did not
 * come back, or with the heartbeat of its host; the person lets a call
 * through once or cancels a ticket. No host call throws out of the gate, a
 * timer or an event listener.
 *
 * Rules reach a project through the rules file in its repository, the way a
 * clone has them. The clock is the test's: the row, the board and the
 * heartbeat read the same one.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { openRulesBoard } from '../src/rules/engine.ts'
import type { RepoRules } from '../src/rules/model.ts'
import { rulesPaths } from '../src/rules/store.ts'
import type { AgentLike } from '../src/shared/dsh-min.ts'
import { ruleOf } from './rules-fixtures.ts'
import { fakeClock, journalOf, MINUTE, quickIo, type FakeClock } from './rules-helpers.ts'
import { health, rowTest, subagentOf, textOf, type Fixture, type Options } from './rules-host.ts'

const HOUR = 60 * MINUTE

/** Queues a deploy while the code freeze is on. */
const FREEZE_RULE = ruleOf({ id: 'r-freeze', title: 'No deploy during the code freeze', filter: { command: { matches: 'deploy' } }, condition: { signal: 'code-freeze', is: true }, action: { kind: 'queue' } })
/** Blocks a deploy while the code is red: stronger than the queue, so a ticket the freeze opened is cleared when this one holds. */
const RED_RULE = ruleOf({ id: 'r-red', title: 'No deploy while the build is red', filter: { command: { matches: 'deploy' } }, condition: { signal: 'build-red', is: true } })
const SWITCHES: NonNullable<RepoRules['signals']> = {
  'code-freeze': { type: { kind: 'boolean' }, description: 'Nobody deploys', manual: { value: true, at: '2026-10-28T06:40:00.000Z' } },
  'build-red': { type: { kind: 'boolean' }, description: 'The build is red', manual: { value: false, at: '2026-10-28T06:40:00.000Z' } },
}
const file = (rules: readonly ReturnType<typeof ruleOf>[]): RepoRules => ({ version: 2, rules: Object.fromEntries(rules.map(rule => [rule.id, rule])), signals: SWITCHES })

const shell = (command: string): unknown => ({ command })
const reasonOf = (result: Parameters<typeof textOf>[0]): string => textOf(result).replace(/^Error: /, '')
const DEPLOY = 'npm run deploy'

/** A row on a clock the test moves, with the live host (`agents`, `goals`) and the freeze rule; the fake agent is `agent-1`, idle. */
function ticketTest(title: string, body: (fixture: Fixture, clock: FakeClock) => Promise<void>, over: Partial<Options> = {}): void {
  const clock = fakeClock('2026-10-28T07:00:00.000Z')
  rowTest(title, fixture => body(fixture, clock), { live: true, clock, rules: file([FREEZE_RULE, RED_RULE]), natives: ['pwsh', 'subagent'], ...over })
}

/** A second agent of the host: a subagent of `agent-1` by default, live in the registry. */
function subagent(fixture: Fixture, id = 'sub-1'): AgentLike {
  const base = subagentOf(fixture.runtime.agent)
  const session = base.session!
  const agent: AgentLike = { ...base, id, session: { ...session, id, header: { ...session.header, id } } }
  fixture.live.add(agent)
  return agent
}

/** The ticket of that number, which must exist. */
const ticketOf = (fixture: Fixture, id: string): NonNullable<ReturnType<Fixture['tickets']>[string]> => {
  const ticket = fixture.tickets()[id]
  assert.ok(ticket, `ticket ${id} exists`)
  return ticket
}

// ------------------------------------------------------------------ opening

ticketTest('a queued call is refused with a ticket number and the four parts, never runs, and leaves a ticket in the state and a queue line in the violation journal', async (fixture) => {
  const result = await fixture.exec('pwsh', shell(DEPLOY))
  assert.equal(result.isError, true)
  assert.deepEqual(fixture.calls, [], 'the call never ran')
  const reason = reasonOf(result)
  assert.match(reason, /^You tried to run "npm run deploy"\.\nBoundary: Deferred as ticket q-1\. Rule r-freeze "No deploy during the code freeze" \(set by the human at \d{4}-\d\d-\d\d \d\d:\d\d, until lifted\) defers it while code-freeze is on\.\nRight path: The call did not run\. Continue with other planned work; the harness sends you a message when q-1 clears, then run the same call again\. Running it again before that returns this message and does not queue it twice\.\nException: The human can let it through once \(\/rules let q-1\), or change the rule\.$/)
  const ticket = ticketOf(fixture, 'q-1')
  assert.deepEqual([ticket.state, ticket.rules, ticket.sessionId, ticket.agentLabel, ticket.tool, ticket.summary], ['deferred', ['r-freeze'], 'agent-1', 'agent-1', 'pwsh', DEPLOY])
  assert.match(ticket.signature, /^[0-9a-f]{12}$/)
  assert.equal(ticket.host.pid, process.pid)
  assert.equal(ticket.nested, undefined)
  const [line, ...rest] = await fixture.violations(1)
  assert.equal(rest.length, 0)
  assert.deepEqual([line?.rule, line?.mode, line?.effect, line?.ticket, line?.tool, line?.sessionId, line?.correction], ['rules:r-freeze', 'enforce', 'queue', 'q-1', 'pwsh', 'agent-1', reason])
})

ticketTest('the same call again is the same ticket, however the arguments are ordered; another call is another ticket', async (fixture) => {
  const first = await fixture.exec('pwsh', { command: DEPLOY, timeout: 5 })
  const again = await fixture.exec('pwsh', { timeout: 5, command: DEPLOY })
  assert.equal(reasonOf(again), reasonOf(first), 'the same refusal, the same number')
  assert.deepEqual(Object.keys(fixture.tickets()), ['q-1'], 'no second ticket')
  const other = await fixture.exec('pwsh', shell('npm run deploy --prod'))
  assert.match(reasonOf(other), /Deferred as ticket q-2\./)
  assert.deepEqual(Object.keys(fixture.tickets()).sort(), ['q-1', 'q-2'])
  assert.equal(ticketOf(fixture, 'q-1').signature === ticketOf(fixture, 'q-2').signature, false)
  assert.equal((await fixture.violations(3)).length, 3, 'every refusal is a line of the journal, the ticket is opened once')
})

ticketTest('a session has at most 20 open tickets: the 21st call is refused without a ticket and the text says to deal with the open ones first', async (fixture) => {
  for (let index = 1; index <= 20; index++) assert.match(reasonOf(await fixture.exec('pwsh', shell(`${DEPLOY} ${index}`))), new RegExp(`Deferred as ticket q-${index}\\.`))
  const refused = await fixture.exec('pwsh', shell(`${DEPLOY} 21`))
  assert.equal(refused.isError, true)
  const reason = reasonOf(refused)
  assert.match(reason, /^You tried to run "npm run deploy 21"\.\nBoundary: Too many open waiting tickets: this session already has 20 \(q-1, q-2, .*q-20\), the most it may have\.\nRight path: The call did not run and no ticket was opened\. /)
  assert.match(reason, /\nException: The human can cancel tickets \(\/rules cancel <ticket>\) or change the rules\.$/)
  assert.equal(Object.keys(fixture.tickets()).length, 20)
  assert.equal(fixture.calls.length, 0)
})

ticketTest('a call of a run_code program opens the ticket with nested true and the text for a program; the same call made directly is the same ticket', async (fixture) => {
  const nested = await fixture.exec('pwsh', shell(DEPLOY), { parent: { token: 'run_code' } })
  const reason = reasonOf(nested)
  assert.match(reason, /Boundary: Deferred as ticket q-1\. Rule r-freeze .* defers it while code-freeze is on\. Your program received this as an error\.\nRight path: The call did not run\. Continue with other planned work, in this program or the next one; the harness sends you a message when q-1 clears, then run the deferred call again\. Running it again before that returns this message and does not queue it twice\.\nException: /)
  assert.equal(ticketOf(fixture, 'q-1').nested, true)
  const direct = await fixture.exec('pwsh', shell(DEPLOY))
  assert.match(reasonOf(direct), /Deferred as ticket q-1\. Rule r-freeze .* defers it while code-freeze is on\.\nRight path: The call did not run\. Continue with other planned work; the harness sends you a message/, 'the direct text, the same ticket')
  assert.deepEqual(Object.keys(fixture.tickets()), ['q-1'])
  await fixture.run('off code-freeze')
  assert.equal(fixture.live.woken.length, 1)
  assert.match(fixture.live.woken[0]?.text ?? '', /You may run the deferred call again from a run_code program: pwsh "npm run deploy"\.$/)
})

ticketTest('a subagent gets the text that tells it to report the ticket in its handoff', async (fixture) => {
  const sub = subagent(fixture)
  const reason = reasonOf(await fixture.exec('pwsh', shell(DEPLOY), { agent: sub }))
  assert.match(reason, /\nRight path: The call did not run\. If your task cannot finish without this call, stop and report ticket q-1 in your handoff; the agent that dispatched you is told when it clears\. Otherwise continue with the rest of your task\.\nException: /)
  const nested = reasonOf(await fixture.exec('pwsh', shell(`${DEPLOY} --nested`), { agent: sub, parent: { token: 'run_code' } }))
  assert.match(nested, /Your program received this as an error\.\nRight path: The call did not run; your program received this as an error\. If your task cannot finish without this call, stop and report ticket q-2 in your handoff/)
  assert.equal(ticketOf(fixture, 'q-1').sessionId, 'sub-1')
})

ticketTest('a ticket that cannot be recorded still refuses the call, says so, and degrades the row\'s health', async (fixture) => {
  // A writer that holds the lock for longer than the board waits (2 seconds): the ticket cannot be recorded.
  const paths = rulesPaths(fixture.root)
  await mkdir(paths.runtimeDir, { recursive: true })
  await writeFile(paths.lock, JSON.stringify({ pid: process.pid, startedAt: Date.now(), at: Date.now() + HOUR, token: 'someone-else' }))
  const refused = await fixture.exec('pwsh', shell(DEPLOY))
  assert.equal(refused.isError, true)
  assert.deepEqual(fixture.calls, [])
  assert.match(reasonOf(refused), /\nBoundary: Deferred, but the board could not record a waiting ticket for it\. Rule r-freeze .* defers it while code-freeze is on\.\nRight path: The call did not run, and no message will come when the rule stops holding: run the call again yourself once it does not\.\nException: /)
  assert.deepEqual(Object.keys(fixture.tickets()), [])
  assert.equal(health(fixture.runtime).status, 'degraded')
  assert.match(health(fixture.runtime).reason, /等待单没记下/)
})

// ----------------------------------------------------------------- the wake

ticketTest('when the rule stops holding the ticket is cleared within the pass and the original agent is told once, with the reason', async (fixture, clock) => {
  await fixture.exec('pwsh', shell(DEPLOY))
  await fixture.pass()
  assert.equal(ticketOf(fixture, 'q-1').state, 'deferred', 'the freeze is still on')
  assert.equal(fixture.live.woken.length, 0)
  const off = await fixture.run('off code-freeze')
  assert.equal(off.kind, 'success')
  assert.equal(ticketOf(fixture, 'q-1').state, 'cleared')
  assert.equal(ticketOf(fixture, 'q-1').clearedAt, new Date(clock.now()).toISOString())
  assert.equal(fixture.live.woken.length, 1)
  const [woken] = fixture.live.woken
  assert.deepEqual([woken?.agentId, woken?.how, woken?.kind], ['agent-1', 'followup', 'hourness-rules-wake'])
  assert.match(woken?.text ?? '', /^\[rules board\] Ticket q-1 cleared: code-freeze is off now \(set by the human at \d\d:\d\d\)\. You may run the deferred call again: pwsh "npm run deploy"\.$/)
  await fixture.pass()
  await fixture.pass()
  assert.equal(fixture.live.woken.length, 1, 'told once')
})

ticketTest('a value the person set for a time that ran out clears the ticket on the 5-second pass, with no command at all', async (fixture, clock) => {
  await fixture.run('on code-freeze 30m')
  await fixture.exec('pwsh', shell(DEPLOY))
  await pass(fixture, clock, 31 * MINUTE)
  assert.equal(ticketOf(fixture, 'q-1').state, 'cleared')
  assert.match(fixture.live.woken[0]?.text ?? '', /^\[rules board\] Ticket q-1 cleared: the value set for code-freeze has expired\. /)
})

ticketTest('a rule lifted by the person, or deleted, clears the ticket and the text says which', async (fixture) => {
  await fixture.exec('pwsh', shell(DEPLOY))
  await fixture.run('lift r-freeze')
  assert.match(fixture.live.woken[0]?.text ?? '', /^\[rules board\] Ticket q-1 cleared: rule r-freeze was lifted by the human\. /)
})

const WAYS: ReadonlyArray<readonly [string, (fixture: Fixture) => void, string]> = [
  ['a running agent is steered', fixture => fixture.live.setStatus('agent-1', 'running'), 'steer'],
  ['an idle agent with an active goal gets the message injected', fixture => fixture.live.setGoal('agent-1', 'active'), 'inject'],
  ['an idle agent with a paused goal gets a followup', fixture => fixture.live.setGoal('agent-1', 'paused'), 'followup'],
  ['an idle agent with no goal gets a followup', () => {}, 'followup'],
  ['an agent for which the goal service throws (a released instance) is taken as having no goal', (fixture) => { fixture.live.setGoal('agent-1', 'active'); fixture.live.breakGoals('agent-1') }, 'followup'],
]
for (const [title, prepare, how] of WAYS) {
  ticketTest(`the wake is sent the way the agent can take it: ${title}`, async (fixture) => {
    await fixture.exec('pwsh', shell(DEPLOY))
    prepare(fixture)
    await fixture.run('off code-freeze')
    assert.deepEqual(fixture.live.woken.map(entry => [entry.agentId, entry.how, entry.kind]), [['agent-1', how, 'hourness-rules-wake']])
  })
}

ticketTest('the call again, once the ticket is cleared, runs and closes the ticket', async (fixture) => {
  assert.equal((await fixture.exec('pwsh', shell(DEPLOY))).isError, true)
  assert.equal((await fixture.exec('pwsh', shell(DEPLOY))).isError, true, 'before it clears the call is refused again')
  await fixture.run('off code-freeze')
  const ran = await fixture.exec('pwsh', shell(DEPLOY))
  assert.equal(ran.isError, false)
  assert.deepEqual(fixture.calls.map(call => call.name), ['pwsh'])
  const ticket = ticketOf(fixture, 'q-1')
  assert.equal(ticket.state, 'done')
  assert.ok(ticket.closedAt)
})

ticketTest('a cleared ticket whose rule holds again by the time the agent comes back is closed and the call is queued under a new number', async (fixture) => {
  await fixture.exec('pwsh', shell(DEPLOY))
  await fixture.run('off code-freeze')
  await fixture.run('on code-freeze')
  const again = await fixture.exec('pwsh', shell(DEPLOY))
  assert.match(reasonOf(again), /Deferred as ticket q-2\./)
  assert.equal(ticketOf(fixture, 'q-1').state, 'done')
  assert.equal(ticketOf(fixture, 'q-2').state, 'deferred')
})

// ------------------------------------------------------------------ hand-over

/** A subagent is deferred on the call and ends: the ticket q-1 is the root's (`agent-1`). */
async function endedSubagent(fixture: Fixture): Promise<void> {
  const first = subagent(fixture)
  await fixture.exec('pwsh', shell(DEPLOY), { agent: first })
  fixture.live.release('sub-1')
  fixture.runtime.disposeSession(first.session!)
  await fixture.until(() => fixture.tickets()['q-1']?.sessionId === 'agent-1')
}

ticketTest('a subagent\'s session ending hands the ticket to the agent that dispatched it; the root is told when it clears, and the text says the subagent has ended', async (fixture) => {
  const sub = subagent(fixture)
  await fixture.exec('pwsh', shell(DEPLOY), { agent: sub })
  fixture.live.release('sub-1')
  fixture.runtime.disposeSession(sub.session!)
  await fixture.until(() => fixture.tickets()['q-1']?.sessionId === 'agent-1')
  const handed = ticketOf(fixture, 'q-1')
  assert.deepEqual([handed.state, handed.agentLabel, handed.handedFrom?.sessionId, handed.handedFrom?.agentLabel], ['deferred', 'agent-1', 'sub-1', 'sub-1'])
  assert.equal(fixture.live.woken.length, 0, 'nobody is told when the ticket moves')
  const records = await journalOf(rulesPaths(fixture.root))
  assert.deepEqual([records.at(-1)?.actor, records.at(-1)?.op, records.at(-1)?.target], ['harness', 'ticket-handover', 'q-1'])
  await fixture.run('off code-freeze')
  assert.deepEqual(fixture.live.woken.map(entry => [entry.agentId, entry.how, entry.kind]), [['agent-1', 'followup', 'hourness-rules-wake']])
  assert.match(fixture.live.woken[0]?.text ?? '', /^\[rules board\] Ticket q-1 cleared: code-freeze is off now \(set by the human at \d\d:\d\d\)\. Subagent "sub-1" was deferred on pwsh "npm run deploy" and has ended\. Dispatch the task again or run the call yourself; a new dispatch of the same call reuses q-1\.$/)
})

ticketTest('a subagent whose session end is seen only because the registry no longer has it is handed over on the pass', async (fixture) => {
  const sub = subagent(fixture)
  await fixture.exec('pwsh', shell(DEPLOY), { agent: sub })
  await fixture.pass()
  assert.equal(ticketOf(fixture, 'q-1').sessionId, 'sub-1', 'a live subagent keeps its ticket')
  fixture.live.release('sub-1')
  await fixture.pass()
  assert.equal(ticketOf(fixture, 'q-1').sessionId, 'agent-1')
  assert.equal(ticketOf(fixture, 'q-1').handedFrom?.sessionId, 'sub-1')
})

ticketTest('a new subagent under the same root making the same call gets the same ticket, and it is woken when it clears', async (fixture) => {
  await endedSubagent(fixture)
  const second = subagent(fixture, 'sub-2')
  const reason = reasonOf(await fixture.exec('pwsh', shell(DEPLOY), { agent: second }))
  assert.match(reason, /Deferred as ticket q-1\./)
  assert.deepEqual(Object.keys(fixture.tickets()), ['q-1'], 'no second ticket')
  const reused = ticketOf(fixture, 'q-1')
  assert.deepEqual([reused.sessionId, reused.agentLabel, reused.handedFrom?.sessionId], ['sub-2', 'sub-2', 'sub-1'])
  await fixture.run('off code-freeze')
  assert.deepEqual(fixture.live.woken.map(entry => [entry.agentId, entry.kind]), [['sub-2', 'hourness-rules-wake']])
  assert.match(fixture.live.woken[0]?.text ?? '', /You may run the deferred call again: pwsh "npm run deploy"\.$/, 'the new subagent holds it: the plain text')
})

ticketTest('a cleared ticket handed to the root is closed by the same call made by a new subagent', async (fixture) => {
  await endedSubagent(fixture)
  await fixture.run('off code-freeze')
  const second = subagent(fixture, 'sub-2')
  assert.equal((await fixture.exec('pwsh', shell(DEPLOY), { agent: second })).isError, false)
  assert.equal(ticketOf(fixture, 'q-1').state, 'done')
})

ticketTest('a subagent that ends when no agent that dispatched it is left cancels its ticket and writes why', async (fixture) => {
  const sub = subagent(fixture)
  await fixture.exec('pwsh', shell(DEPLOY), { agent: sub })
  fixture.live.release('agent-1')
  fixture.live.release('sub-1')
  fixture.runtime.disposeSession(sub.session!)
  await fixture.until(() => fixture.tickets()['q-1']?.state === 'cancelled')
  const last = (await journalOf(rulesPaths(fixture.root))).at(-1)
  assert.deepEqual([last?.actor, last?.op, last?.target], ['harness', 'ticket-update', 'q-1'])
  assert.match(last?.reason ?? '', /子 agent sub-1 已结束，派发它的 agent 也不在/)
})

ticketTest('the session of a person ending cancels the tickets of that session', async (fixture) => {
  await fixture.exec('pwsh', shell(DEPLOY))
  fixture.live.release('agent-1')
  fixture.runtime.disposeSession(fixture.runtime.agent.session!)
  await fixture.until(() => fixture.tickets()['q-1']?.state === 'cancelled')
  assert.match((await journalOf(rulesPaths(fixture.root))).at(-1)?.reason ?? '', /会话 agent-1 已结束/)
  assert.equal(fixture.live.woken.length, 0)
})

// --------------------------------------------------------------------- expiry

/** Let time pass the way a host lives through it: the heartbeat written, the tickets judged again. */
async function pass(fixture: Fixture, clock: FakeClock, ms: number): Promise<void> {
  clock.advance(ms)
  await fixture.beat()
  await fixture.pass()
}

ticketTest('a ticket that has stood for 24 hours expires with the reason age', async (fixture, clock) => {
  await fixture.exec('pwsh', shell(DEPLOY))
  await pass(fixture, clock, 24 * HOUR + MINUTE)
  const ticket = ticketOf(fixture, 'q-1')
  assert.deepEqual([ticket.state, ticket.expiredWhy], ['expired', 'age'])
  assert.equal(fixture.live.woken.length, 0, 'the ticket ran out of time, nobody is told')
})

ticketTest('a cleared ticket the agent did not come back for in 30 minutes expires with the reason not-retried', async (fixture, clock) => {
  await fixture.exec('pwsh', shell(DEPLOY))
  await fixture.run('off code-freeze')
  await pass(fixture, clock, 29 * MINUTE)
  assert.equal(ticketOf(fixture, 'q-1').state, 'cleared')
  await pass(fixture, clock, 2 * MINUTE)
  const ticket = ticketOf(fixture, 'q-1')
  assert.deepEqual([ticket.state, ticket.expiredWhy], ['expired', 'not-retried'])
})

ticketTest('a ticket whose host has no fresh heartbeat is expired by the next write of anyone, decided and recorded in that write', async (fixture, clock) => {
  await fixture.exec('pwsh', shell(DEPLOY))
  clock.advance(MINUTE)
  await fixture.run('peak 少做')
  const ticket = ticketOf(fixture, 'q-1')
  assert.deepEqual([ticket.state, ticket.expiredWhy], ['expired', 'host-gone'])
  const record = (await journalOf(rulesPaths(fixture.root))).at(-1)
  assert.deepEqual(record?.changes.filter(change => change.path[0] === 'tickets').map(change => change.cause), ['expire'], 'the record carries the decision, a replay does not look at the clock')
})

ticketTest('a host that is alive but whose heartbeat went stale tells the agent once that the ticket was expired, does not reopen it, and degrades the health once', async (fixture, clock) => {
  await fixture.exec('pwsh', shell(DEPLOY))
  clock.advance(MINUTE)
  await fixture.run('peak 少做')
  assert.equal(ticketOf(fixture, 'q-1').expiredWhy, 'host-gone')
  assert.equal(fixture.live.woken.length, 1, 'the owner saw its ticket expire and told the agent')
  const [woken] = fixture.live.woken
  assert.deepEqual([woken?.agentId, woken?.how, woken?.kind], ['agent-1', 'followup', 'hourness-rules-wake'])
  assert.equal(woken?.text, '[rules board] Ticket q-1 was expired after a heartbeat timeout of this host; rule r-freeze may still hold. Running pwsh "npm run deploy" again queues it again if it does.')
  assert.equal(health(fixture.runtime).status, 'degraded')
  assert.match(health(fixture.runtime).reason, /等待单 q-1 因本宿主心跳超时被过期/)
  await fixture.pass()
  await fixture.pass()
  assert.equal(fixture.live.woken.length, 1, 'once per ticket in this process')
  assert.deepEqual(Object.keys(fixture.tickets()), ['q-1'], 'the ticket is not reopened')
  assert.match(reasonOf(await fixture.exec('pwsh', shell(DEPLOY))), /Deferred as ticket q-2\./, 'the call again, the rule still holding: a new ticket')
})

// ------------------------------------------------------------ let and cancel

ticketTest('/rules let lets the next call of the same signature through and closes the ticket; the next after that is queued again', async (fixture) => {
  await fixture.exec('pwsh', shell(DEPLOY))
  const letIt = await fixture.run('let q-1')
  assert.equal(letIt.kind, 'success')
  assert.ok(ticketOf(fixture, 'q-1').letOnceUntil)
  const ran = await fixture.exec('pwsh', shell(DEPLOY))
  assert.equal(ran.isError, false)
  assert.deepEqual(fixture.calls.map(call => call.name), ['pwsh'])
  assert.equal(ticketOf(fixture, 'q-1').state, 'done')
  assert.match(reasonOf(await fixture.exec('pwsh', shell(DEPLOY))), /Deferred as ticket q-2\./)
  assert.equal(fixture.live.woken.length, 0)
})

ticketTest('what /rules let allowed is gone after 10 minutes: the call is refused again under the same ticket', async (fixture, clock) => {
  await fixture.exec('pwsh', shell(DEPLOY))
  await fixture.run('let q-1')
  clock.advance(11 * MINUTE)
  await fixture.beat()
  assert.match(reasonOf(await fixture.exec('pwsh', shell(DEPLOY))), /Deferred as ticket q-1\./)
  assert.equal(ticketOf(fixture, 'q-1').state, 'deferred')
})

ticketTest('/rules cancel closes the ticket; the call again is queued under a new number', async (fixture) => {
  await fixture.exec('pwsh', shell(DEPLOY))
  assert.equal((await fixture.run('cancel q-1')).kind, 'success')
  assert.equal(ticketOf(fixture, 'q-1').state, 'cancelled')
  assert.match(reasonOf(await fixture.exec('pwsh', shell(DEPLOY))), /Deferred as ticket q-2\./)
  assert.equal(fixture.live.woken.length, 0)
})

ticketTest('/rules let and /rules cancel are the human\'s: the model, a detector and the harness itself are refused', async (fixture) => {
  await fixture.exec('pwsh', shell(DEPLOY))
  const board = openRulesBoard({ projectRoot: fixture.root, io: quickIo() })
  for (const actor of ['llm', 'detector', 'harness'] as const) {
    for (const op of ['ticket-let-once', 'ticket-cancel'] as const) {
      const result = await board.apply(actor, { op, id: 'q-1' })
      assert.equal(result.ok, false, `${actor} ${op}`)
      assert.equal(result.ok ? undefined : result.error.code, 'forbidden')
    }
  }
  assert.equal(ticketOf(fixture, 'q-1').state, 'deferred')
})

// ------------------------------------------------------------ host failures

ticketTest('a wake that cannot be sent to an agent that is not a subagent cancels the ticket, writes why, degrades the health and throws nothing', async (fixture) => {
  await fixture.exec('pwsh', shell(DEPLOY))
  fixture.live.breakWake('agent-1')
  const off = await fixture.run('off code-freeze')
  assert.equal(off.kind, 'success', 'the command is not hurt by a wake that fails')
  await fixture.until(() => fixture.tickets()['q-1']?.state === 'cancelled')
  assert.match((await journalOf(rulesPaths(fixture.root))).at(-1)?.reason ?? '', /唤醒发不出/)
  assert.equal(health(fixture.runtime).status, 'degraded')
  await fixture.pass()
})

ticketTest('a wake that cannot be sent to a subagent is sent to the agent that dispatched it, with the hand-over text', async (fixture) => {
  const sub = subagent(fixture)
  await fixture.exec('pwsh', shell(DEPLOY), { agent: sub })
  fixture.live.breakWake('sub-1')
  await fixture.run('off code-freeze')
  await fixture.until(() => fixture.live.woken.length === 1)
  assert.deepEqual(fixture.live.woken.map(entry => [entry.agentId, entry.how]), [['agent-1', 'followup']])
  assert.match(fixture.live.woken[0]?.text ?? '', /Subagent "sub-1" was deferred on pwsh "npm run deploy" and has ended\./)
  assert.equal(ticketOf(fixture, 'q-1').sessionId, 'agent-1')
})

ticketTest('a registry that throws reaches nothing: the gate refuses and opens the ticket, the pass and the session end finish, and the health says why', async (fixture) => {
  const sub = subagent(fixture)
  await fixture.exec('pwsh', shell(DEPLOY), { agent: sub })
  fixture.runtime.services.set('agents', { get: () => { throw new Error('registry down') } })
  assert.match(reasonOf(await fixture.exec('pwsh', shell(`${DEPLOY} again`), { agent: sub })), /Deferred as ticket q-2\./)
  await fixture.pass()
  assert.doesNotThrow(() => { fixture.runtime.disposeSession(sub.session!) })
  await fixture.run('off code-freeze')
  await fixture.pass()
  assert.equal(health(fixture.runtime).status, 'degraded')
  assert.match(health(fixture.runtime).reason, /registry down/)
})

ticketTest('without a registry of live agents nothing is told and nothing is cancelled: the tickets stay as they are', async (fixture) => {
  fixture.runtime.services.delete('agents')
  fixture.runtime.services.delete('goals')
  await fixture.exec('pwsh', shell(DEPLOY))
  await fixture.pass()
  assert.equal(ticketOf(fixture, 'q-1').state, 'deferred', 'a session whose end cannot be seen is not taken as ended')
  await fixture.run('off code-freeze')
  assert.equal(ticketOf(fixture, 'q-1').state, 'cleared')
  assert.equal(fixture.live.woken.length, 0)
  assert.equal(health(fixture.runtime).status, 'degraded')
  assert.match(health(fixture.runtime).reason, /agents/)
})

ticketTest('a stronger rule that blocks the call now clears the ticket: the call again meets the block, not a second queue', async (fixture) => {
  await fixture.exec('pwsh', shell(DEPLOY))
  await fixture.run('on build-red')
  assert.equal(ticketOf(fixture, 'q-1').state, 'cleared')
  assert.match(fixture.live.woken[0]?.text ?? '', /^\[rules board\] Ticket q-1 cleared: rule r-red blocks the call now\. /)
  const again = await fixture.exec('pwsh', shell(DEPLOY))
  assert.match(reasonOf(again), /Rule r-red .* blocks it now/)
  assert.deepEqual(Object.keys(fixture.tickets()), ['q-1'])
})

// ------------------------------------------------------- the code's entries

ticketTest('an entry of the code that queues is not carried out yet: a stop-level GLM subagent call runs and opens no ticket', async (fixture) => {
  await fixture.run('peak 不做')
  const sub = subagent(fixture)
  const result = await fixture.exec('pwsh', shell('echo hi'), { agent: sub })
  assert.equal(result.isError, false)
  assert.deepEqual(Object.keys(fixture.tickets()), [])
}, { route: { provider: 'zai', model: 'glm-4.6' }, rules: { version: 2 } })

// ------------------------------------------------------------- teardown

ticketTest('the row\'s timers go with the row, and a row that is gone sends nothing', async (fixture) => {
  await fixture.exec('pwsh', shell(DEPLOY))
  assert.equal(fixture.timers() > 0, true, 'the row holds its timers while it is on')
  fixture.dispose()
  assert.equal(fixture.timers(), 0)
  await fixture.pass()
  assert.equal(fixture.live.woken.length, 0)
})
