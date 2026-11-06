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
import { MAIN_AGENT_KEY } from '../src/graph/main-agent.ts'
import { openRulesBoard } from '../src/rules/engine.ts'
import type { RepoRules } from '../src/rules/model.ts'
import { loadState, rulesPaths } from '../src/rules/store.ts'
import type { AgentLike } from '../src/shared/dsh-min.ts'
import { collectHealth } from '../src/shared/health.ts'
import { PRICING_SERVICE } from '../src/shared/pricing.ts'
import { OFFPEAK_CREDIT_RUNS, ruleOf } from './rules-fixtures.ts'
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
  const clock = over.clock ?? fakeClock('2026-10-28T07:00:00.000Z')
  rowTest(title, fixture => body(fixture, clock), { live: true, clock, rules: file([FREEZE_RULE, RED_RULE]), natives: ['pwsh', 'subagent'], ...over })
}

/** A second agent of the host: a subagent of `agent-1` by default, live in the registry. */
function subagentFor(parts: { readonly runtime: Fixture['runtime'], readonly live: Fixture['live'] }, id = 'sub-1'): AgentLike {
  const base = subagentOf(parts.runtime.agent)
  const session = base.session!
  const agent: AgentLike = { ...base, id, session: { ...session, id, header: { ...session.header, id } } }
  parts.live.add(agent)
  return agent
}
const subagent = (fixture: Fixture, id = 'sub-1'): AgentLike => subagentFor(fixture, id)

/** The rules row's line in the health table of the session. */
const healthOf = (fixture: Fixture, sessionId: string): ReturnType<typeof collectHealth>[number] => collectHealth(fixture.runtime.ctx, sessionId).find(entry => entry.row === 'rules')!

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

// ------------------------------------------------------- the peak levels
//
// The stop level queues the GLM subagents of a project in a GLM peak: one
// ticket for the whole session, and its active goal is paused for the time.
// The main agent is never held. The peak is 15:00-18:00 UTC+8; the clock of
// these tests starts at 15:00 and `OVER` moves it past 18:00.

const GLM = { provider: 'zai', model: 'glm-4.6' }
const DEEPSEEK = { provider: 'deepseek', model: 'deepseek-chat' }
const PEAK_END = '2026-10-28T10:00:00.000Z'
const AFTER_PEAK = '2026-10-28T11:00:00.000Z'
const STOP = 'any:builtin:glm-peak-stop'
const OVER = 3 * HOUR + MINUTE
const OLD_HOST = { pid: 4242, startedAt: 1 }
const STOP_NATIVES = ['pwsh', 'subagent', 'propose_to_human', 'record_human_answer']
const MAIN_PROJECTION = { sessionProjections: { stateOf: (_session: unknown, key: string) => (key === MAIN_AGENT_KEY ? { active: true } : undefined) } }
const DISPATCH = { provider: 'zai', model: 'glm-4.6', prompt: 'build the ui' }

/** `HH:MM` on the wall clock of this machine, by another route than the code takes (the Swedish format is year-first and 24-hour). */
const clockHm = (iso: string): string => new Date(iso).toLocaleString('sv-SE').slice(11, 16)

/** A GLM project at the stop level, in a peak, with a GLM subagent that has an active goal (`goal-sub-1`, revision 1). */
function stopTest(title: string, body: (fixture: Fixture, clock: FakeClock, sub: AgentLike) => Promise<void>, over: Partial<Options> = {}): void {
  ticketTest(title, async (fixture, clock) => {
    assert.equal((await fixture.run('peak 不做')).kind, 'success')
    const sub = subagent(fixture)
    fixture.live.setGoal(sub.id, 'active')
    await body(fixture, clock, sub)
  }, { route: GLM, rules: { version: 2 }, natives: STOP_NATIVES, ...over })
}

/** The refusal a GLM subagent gets at the stop level, for ticket `id` (design §6.4). */
const stopRefusal = (attempt: string, id: string, goal: string): string => [
  attempt,
  `Boundary: Deferred as ticket ${id}. GLM peak hours now until ${clockHm(PEAK_END)}, and the human chose "stop" for peak hours: GLM subagents do no work until then.${goal}`,
  `Right path: The call did not run. Stop and report ticket ${id} and where you stopped in your handoff; the agent that dispatched you is told at ${clockHm(PEAK_END)} and can dispatch the work again. Other tool calls before then return this message.`,
  `Exception: The human can let this session work through this peak (/rules let ${id}), or change the peak mode (/rules peak).`,
].join('\n')

const RELEASED = '[rules board] Ticket q-1 cleared: GLM peak hours are over (or the human changed the peak mode).'

stopTest('the first tool call of a GLM subagent opens one ticket for the session and pauses its active goal; later calls of any kind share the ticket and pause nothing again', async (fixture, _clock, sub) => {
  const result = await fixture.exec('pwsh', shell('npm test'), { agent: sub })
  assert.equal(result.isError, true)
  assert.deepEqual(fixture.calls, [], 'the call never ran')
  assert.equal(reasonOf(result), stopRefusal('You tried to run "npm test".', 'q-1', ' Your goal is paused.'))
  const ticket = ticketOf(fixture, 'q-1')
  assert.deepEqual([ticket.state, ticket.signature, ticket.rules, ticket.sessionId, ticket.tool, ticket.summary], ['deferred', STOP, ['builtin:glm-peak-stop'], 'sub-1', 'pwsh', 'npm test'])
  assert.deepEqual([ticket.pausedGoal, ticket.pauseFailed, ticket.resumedAt], [{ id: 'goal-sub-1', revision: 2 }, undefined, undefined], 'the revision after the pause')
  assert.deepEqual(fixture.live.goalCalls, [{ op: 'pause', agentId: 'sub-1', ref: { id: 'goal-sub-1', revision: 1 } }])
  assert.equal(fixture.live.goalOf('sub-1')?.phase, 'paused')
  const other = await fixture.exec('pwsh', shell('npm run build'), { agent: sub })
  assert.equal(reasonOf(other).split('\n').slice(1).join('\n'), reasonOf(result).split('\n').slice(1).join('\n'), 'a different call is the same ticket and the same words')
  assert.deepEqual(Object.keys(fixture.tickets()), ['q-1'])
  assert.equal(fixture.live.goalCalls.length, 1, 'the goal is paused once')
  const [first, second, ...rest] = await fixture.violations(2)
  assert.equal(rest.length, 0)
  assert.deepEqual([first?.rule, first?.effect, first?.ticket, second?.ticket], ['rules:builtin:glm-peak-stop', 'queue', 'q-1', 'q-1'])
})

stopTest('the tools of the rules board are not held at the stop level, so the subagent can still read the rules and report', async (fixture, _clock, sub) => {
  const shown = await fixture.exec('rules_show', {}, { agent: sub })
  assert.equal(shown.isError, false)
  assert.deepEqual(Object.keys(fixture.tickets()), [])
  assert.deepEqual(fixture.live.goalCalls, [])
})

stopTest('a GLM subagent with no goal gets the ticket and the words without the goal sentence, and nothing is paused', async (fixture, _clock, sub) => {
  fixture.live.setGoal(sub.id, undefined)
  const result = await fixture.exec('pwsh', shell('npm test'), { agent: sub })
  assert.equal(reasonOf(result), stopRefusal('You tried to run "npm test".', 'q-1', ''))
  assert.deepEqual([ticketOf(fixture, 'q-1').pausedGoal, ticketOf(fixture, 'q-1').pauseFailed], [undefined, undefined])
  assert.deepEqual(fixture.live.goalCalls, [])
})

stopTest('a goal created after the first call is paused by the next one: the ticket had no goal to pause yet', async (fixture, _clock, sub) => {
  fixture.live.setGoal(sub.id, undefined)
  await fixture.exec('pwsh', shell('npm test'), { agent: sub })
  fixture.live.setGoal(sub.id, 'active')
  const again = await fixture.exec('pwsh', shell('npm test'), { agent: sub })
  assert.match(reasonOf(again), /Your goal is paused\.\nRight path/)
  assert.deepEqual(ticketOf(fixture, 'q-1').pausedGoal, { id: 'goal-sub-1', revision: 2 })
  assert.equal(fixture.live.goalCalls.length, 1)
})

stopTest('a pause that throws leaves pauseFailed with the first 80 characters, degrades the row\'s health, says so to the agent, and queueing goes on without another try', async (fixture, _clock, sub) => {
  const why = `the goal moved on ${'x'.repeat(100)}`
  fixture.live.breakGoalChange('sub-1', 'pause', why, 'GOAL_STALE_REVISION')
  const result = await fixture.exec('pwsh', shell('npm test'), { agent: sub })
  assert.equal(result.isError, true)
  assert.equal(reasonOf(result), stopRefusal('You tried to run "npm test".', 'q-1', ' Your goal could not be paused; end your turn anyway.'))
  const ticket = ticketOf(fixture, 'q-1')
  assert.deepEqual([ticket.pausedGoal, ticket.pauseFailed], [undefined, why.slice(0, 80)])
  assert.equal(healthOf(fixture, 'sub-1').status, 'degraded')
  assert.match(healthOf(fixture, 'sub-1').reason, /goal 没暂停/)
  assert.equal((await fixture.exec('pwsh', shell('npm run build'), { agent: sub })).isError, true, 'still queued')
  assert.equal(fixture.live.goalCalls.length, 1, 'no second try')
  assert.equal(fixture.live.goalOf('sub-1')?.phase, 'active')
})

// ----------------------------------------------------- nobody else is held

/** Every kind of call the main agent makes runs, and its goal is not touched. */
const neverHeld = async (fixture: Fixture): Promise<void> => {
  fixture.live.setGoal('agent-1', 'active')
  for (const [name, args] of [['pwsh', shell('npm test')], ['rules_show', {}], ['propose_to_human', {}], ['record_human_answer', {}]] as const) {
    assert.equal((await fixture.exec(name, args)).isError, false, `${name} runs`)
  }
  assert.deepEqual(Object.keys(fixture.tickets()), [])
  assert.deepEqual(fixture.live.goalCalls, [], 'no goal is paused')
  assert.equal(fixture.live.goalOf('agent-1')?.phase, 'active')
}

stopTest('a GLM main agent is never held or paused at the stop level, with or without the main-agent mode', async (fixture) => {
  await neverHeld(fixture)
})

stopTest('the main agent by the main-agent projection is the same', async (fixture) => {
  await neverHeld(fixture)
}, { services: MAIN_PROJECTION })

stopTest('a main agent that is not on GLM is never held either', async (fixture) => {
  await neverHeld(fixture)
}, { route: DEEPSEEK, services: MAIN_PROJECTION })

stopTest('a subagent that is not on GLM is not held and keeps its goal', async (fixture, _clock, sub) => {
  fixture.live.setGoal(sub.id, 'active')
  assert.equal((await fixture.exec('pwsh', shell('npm test'), { agent: sub })).isError, false)
  assert.deepEqual(Object.keys(fixture.tickets()), [])
  assert.deepEqual(fixture.live.goalCalls, [])
}, { route: DEEPSEEK })

stopTest('nothing is held at the stop level while the GLM peak cannot be read, and the dispatch of a GLM subagent runs', async (fixture, _clock, sub) => {
  assert.equal((await fixture.exec('pwsh', shell('npm test'), { agent: sub })).isError, false)
  assert.equal((await fixture.exec('subagent', DISPATCH)).isError, false)
  assert.deepEqual(Object.keys(fixture.tickets()), [])
  assert.deepEqual(fixture.live.goalCalls, [])
}, { pricing: 'none' })

stopTest('outside a peak nothing is held at the stop level', async (fixture, _clock, sub) => {
  assert.equal((await fixture.exec('pwsh', shell('npm test'), { agent: sub })).isError, false)
  assert.deepEqual(Object.keys(fixture.tickets()), [])
}, { clock: fakeClock(AFTER_PEAK) })

stopTest('at the reduce level the gate holds nothing: the calls of a GLM subagent and the dispatch of one run', async (fixture, _clock, sub) => {
  await fixture.run('peak 少做')
  assert.equal((await fixture.exec('pwsh', shell('npm test'), { agent: sub })).isError, false)
  assert.equal((await fixture.exec('subagent', DISPATCH)).isError, false)
  assert.deepEqual(Object.keys(fixture.tickets()), [])
  assert.deepEqual(fixture.live.goalCalls, [])
})

// ------------------------------------------------------------- the dispatch

stopTest('a main agent that dispatches a GLM subagent gets an ordinary ticket and keeps working: nothing is paused, and it is told it can dispatch again when the peak is over', async (fixture, clock) => {
  fixture.live.setGoal('agent-1', 'active')
  const result = await fixture.exec('subagent', DISPATCH)
  assert.equal(result.isError, true)
  assert.deepEqual(fixture.calls, [])
  const until = clockHm(PEAK_END)
  assert.equal(reasonOf(result), [
    'You tried to call subagent.',
    `Boundary: Deferred as ticket q-1. GLM peak hours now until ${until}, and the human chose "stop" for peak hours: no GLM subagents until then. You are not held: keep answering the human and doing other work.`,
    `Right path: The dispatch did not run. Do other planned work, or dispatch this task with a non-GLM model if that fits; at ${until} the harness tells you that you can dispatch it again.`,
    'Exception: The human can let this one dispatch through now (/rules let q-1), or change the peak mode (/rules peak).',
  ].join('\n'))
  const ticket = ticketOf(fixture, 'q-1')
  assert.match(ticket.signature, /^[0-9a-f]{12}$/, 'an ordinary ticket, by the call')
  assert.deepEqual([ticket.rules, ticket.sessionId, ticket.pausedGoal], [['builtin:glm-peak-stop-dispatch'], 'agent-1', undefined])
  assert.equal(reasonOf(await fixture.exec('subagent', DISPATCH)), reasonOf(result), 'the same dispatch is the same ticket')
  assert.equal((await fixture.exec('pwsh', shell('npm test'))).isError, false, 'the main agent goes on with its other calls')
  assert.deepEqual(fixture.live.goalCalls, [], 'the main agent\'s goal is never paused')
  await pass(fixture, clock, OVER)
  assert.equal(ticketOf(fixture, 'q-1').state, 'cleared')
  assert.deepEqual(fixture.live.woken.map(entry => [entry.agentId, entry.how, entry.kind, entry.text]), [['agent-1', 'inject', 'hourness-rules-wake', `${RELEASED} You can dispatch again: subagent "${JSON.stringify(DISPATCH)}".`]])
  assert.equal((await fixture.exec('subagent', DISPATCH)).isError, false, 'dispatching again runs')
  assert.equal(ticketOf(fixture, 'q-1').state, 'done')
  assert.deepEqual(fixture.live.goalCalls, [])
}, { services: MAIN_PROJECTION })

// -------------------------------------------------------- peak end and level

stopTest('when the peak ends the goal is resumed first, then the subagent is told to carry on, and the ticket is done', async (fixture, clock, sub) => {
  await fixture.exec('pwsh', shell('npm test'), { agent: sub })
  await pass(fixture, clock, MINUTE)
  assert.equal(ticketOf(fixture, 'q-1').state, 'deferred', 'the peak goes on')
  assert.equal(fixture.live.goalCalls.length, 1)
  await pass(fixture, clock, OVER)
  assert.deepEqual(fixture.live.goalCalls.at(-1), { op: 'resume', agentId: 'sub-1', ref: { id: 'goal-sub-1', revision: 2 } })
  assert.equal(fixture.live.goalOf('sub-1')?.phase, 'active')
  assert.deepEqual(fixture.live.log, ['goal:pause', 'goal:resume', 'wake:inject'], 'resume, then the wake')
  assert.deepEqual(fixture.live.woken.map(entry => [entry.agentId, entry.kind, entry.text]), [['sub-1', 'hourness-rules-wake', `${RELEASED} Your goal is resumed. Continue your work from where you stopped; the call that was deferred was pwsh "npm test".`]])
  const ticket = ticketOf(fixture, 'q-1')
  assert.equal(ticket.state, 'done')
  assert.equal(ticket.resumedAt, new Date(clock.now()).toISOString())
  await pass(fixture, clock, MINUTE)
  assert.equal(fixture.live.log.length, 3, 'once')
  assert.equal(health(fixture.runtime).status, 'active')
})

stopTest('a goal that cannot be resumed is told in the wake with the reason, the agent is told to inform the person, and the ticket is done', async (fixture, clock, sub) => {
  await fixture.exec('pwsh', shell('npm test'), { agent: sub })
  const why = `round budget used up ${'y'.repeat(100)}`
  fixture.live.breakGoalChange('sub-1', 'resume', why, 'GOAL_INVALID_TRANSITION')
  await pass(fixture, clock, OVER)
  assert.deepEqual(fixture.live.woken.map(entry => entry.text), [`${RELEASED} Your goal could not be resumed: ${why.slice(0, 80)}. Tell the human; they can resume it from the goal bar or with /goal resume. Continue your work from where you stopped; the call that was deferred was pwsh "npm test".`])
  const ticket = ticketOf(fixture, 'q-1')
  assert.deepEqual([ticket.state, ticket.resumedAt], ['done', undefined])
  assert.equal(healthOf(fixture, 'sub-1').status, 'degraded')
  assert.match(healthOf(fixture, 'sub-1').reason, /goal 没能恢复/)
  assert.equal(fixture.live.goalCalls.filter(call => call.op === 'resume').length, 1, 'no second try')
})

stopTest('a goal the person resumed or changed in the peak is not resumed: only the wake is sent', async (fixture, clock, sub) => {
  await fixture.exec('pwsh', shell('npm test'), { agent: sub })
  fixture.live.setGoal('sub-1', 'active')
  assert.equal(fixture.live.goalOf('sub-1')?.revision, 3)
  await pass(fixture, clock, OVER)
  assert.deepEqual(fixture.live.goalCalls.map(call => call.op), ['pause'], 'no resume')
  assert.deepEqual(fixture.live.woken.map(entry => entry.text), [`${RELEASED} Continue your work from where you stopped; the call that was deferred was pwsh "npm test".`])
  assert.equal(ticketOf(fixture, 'q-1').state, 'done')
  assert.equal(fixture.live.goalOf('sub-1')?.revision, 3, 'the person\'s goal is as they left it')
})

stopTest('changing the level from stop to inform resolves the ticket the same way, at once', async (fixture, _clock, sub) => {
  await fixture.exec('pwsh', shell('npm test'), { agent: sub })
  assert.equal((await fixture.run('peak 无影响')).kind, 'success')
  assert.deepEqual(fixture.live.log, ['goal:pause', 'goal:resume', 'wake:inject'])
  assert.equal(ticketOf(fixture, 'q-1').state, 'done')
  assert.equal((await fixture.exec('pwsh', shell('npm test'), { agent: sub })).isError, false, 'the next call runs')
})

stopTest('a subagent that handed back and ended before the peak did: the root is told to dispatch the task again, and nothing is resumed', async (fixture, clock, sub) => {
  await fixture.exec('pwsh', shell('npm test'), { agent: sub })
  fixture.live.release('sub-1')
  fixture.runtime.disposeSession(sub.session!)
  await fixture.until(() => fixture.tickets()['q-1']?.sessionId === 'agent-1')
  await fixture.pass()
  await pass(fixture, clock, OVER)
  assert.deepEqual(fixture.live.goalCalls.map(call => call.op), ['pause'], 'the ended session\'s goal is not touched')
  assert.deepEqual(fixture.live.woken.map(entry => [entry.agentId, entry.text]), [['agent-1', `${RELEASED} Subagent "sub-1" stopped during peak at pwsh "npm test". Dispatch the task again to continue it.`]])
  assert.equal(ticketOf(fixture, 'q-1').state, 'done')
})

// ----------------------------------------------------------------- let once

stopTest('/rules let on a stop ticket lets the session work to the end of this peak and resumes its goal; the ticket stays open and nobody is woken', async (fixture, clock, sub) => {
  await fixture.exec('pwsh', shell('npm test'), { agent: sub })
  const reply = await fixture.run('let q-1')
  assert.equal(reply.kind, 'success')
  assert.match(reply.text ?? '', new RegExp(`q-1 .*到 (周. )?${clockHm(PEAK_END)}`))
  const ticket = ticketOf(fixture, 'q-1')
  assert.deepEqual([ticket.state, ticket.letOnceUntil, ticket.resumedAt], ['deferred', PEAK_END, new Date(clock.now()).toISOString()])
  assert.deepEqual(fixture.live.goalCalls.map(call => call.op), ['pause', 'resume'])
  assert.equal(fixture.live.goalOf('sub-1')?.phase, 'active')
  for (const command of ['npm test', 'npm run build']) assert.equal((await fixture.exec('pwsh', shell(command), { agent: sub })).isError, false, `${command} passes`)
  assert.deepEqual(fixture.calls.map(call => call.name), ['pwsh', 'pwsh'])
  assert.equal(ticketOf(fixture, 'q-1').state, 'deferred', 'the ticket is not closed by the calls')
  assert.deepEqual(fixture.live.woken, [])
  await pass(fixture, clock, OVER)
  assert.equal(ticketOf(fixture, 'q-1').state, 'done', 'it closes with the peak')
  assert.deepEqual(fixture.live.woken, [], 'the agent worked through it and is not told')
  assert.deepEqual(fixture.live.goalCalls.map(call => call.op), ['pause', 'resume'], 'resumed once')
})

stopTest('a let when the end of the peak cannot be read lasts four hours', async (fixture, clock, sub) => {
  await fixture.exec('pwsh', shell('npm test'), { agent: sub })
  fixture.runtime.services.delete('glmHournessPricing')
  const expected = new Date(clock.now() + 4 * HOUR).toISOString()
  assert.equal((await fixture.run('let q-1')).kind, 'success')
  assert.equal(ticketOf(fixture, 'q-1').letOnceUntil, expected)
  assert.equal(fixture.live.goalOf('sub-1')?.phase, 'active')
})

stopTest('a late heartbeat that expires a stop ticket under a live host does not strand the paused goal: the host takes the ticket back, and the goal is resumed when the peak ends', async (fixture, clock, sub) => {
  await fixture.exec('pwsh', shell('npm test'), { agent: sub })
  clock.advance(MINUTE)
  const board = openRulesBoard({ projectRoot: fixture.root, io: quickIo({ now: clock.now }) })
  assert.ok((await board.apply('harness', { op: 'notice-add', kind: 'late-block', rule: 'r-x', text: 'any write lets the board expire the ticket of a host whose heartbeat is late' })).ok)
  assert.equal(ticketOf(fixture, 'q-1').state, 'expired')
  await fixture.pass()
  const back = ticketOf(fixture, 'q-1')
  assert.deepEqual([back.state, back.expiredWhy, back.host.pid], ['deferred', undefined, process.pid])
  assert.deepEqual(fixture.live.woken, [], 'the ticket is the host\'s again, nobody is told it ended')
  await pass(fixture, clock, OVER)
  assert.deepEqual(fixture.live.log, ['goal:pause', 'goal:resume', 'wake:inject'])
  assert.equal(ticketOf(fixture, 'q-1').state, 'done')
})

// ------------------------------------------------------------------ restart

const RESTART = { sessionId: 'sub-1', agentLabel: 'sub-1', host: OLD_HOST, signature: STOP, tool: 'pwsh', summary: 'npm test', rules: ['builtin:glm-peak-stop'] }

/** What a host that is gone leaves: the stop level and a ticket of its own in the project; with live, the subagent is already on the next host when it starts, its goal paused. */
function leftBehind(ticket: Record<string, unknown>, state: { readonly expire?: boolean, readonly stamp?: boolean, readonly live?: boolean } = {}): NonNullable<Options['setup']> {
  return async ({ root, runtime, live, now }) => {
    const board = openRulesBoard({ projectRoot: root, io: quickIo({ now }) })
    assert.ok((await board.apply('human', { op: 'peak-mode-set', level: 'stop' })).ok)
    assert.ok((await board.apply('harness', { op: 'ticket-open', ...RESTART, ...ticket })).ok)
    if (state.stamp === true) assert.ok((await board.apply('harness', { op: 'ticket-update', id: 'q-1', resumed: true })).ok)
    if (state.expire === true) {
      assert.ok((await board.apply('harness', { op: 'notice-add', kind: 'late-block', rule: 'r-x', text: 'a write that lets the board expire the ticket of a host without a heartbeat' })).ok)
      assert.equal(loadState(rulesPaths(root)).state.tickets?.['q-1']?.state, 'expired')
    }
    if (state.live === true) pausedSubagent({ runtime, live })
  }
}
const PAUSED = { pausedGoal: { id: 'goal-sub-1', revision: 2 } }

/** The subagent of the ticket on this host, with its goal paused (revision 2) as a session that was paused before the restart is. */
function pausedSubagent(parts: { readonly runtime: Fixture['runtime'], readonly live: Fixture['live'] }): AgentLike {
  const sub = subagentFor(parts)
  parts.live.setGoal(sub.id, 'active')
  parts.live.setGoal(sub.id, 'paused')
  return sub
}

ticketTest('after a restart the new host takes over the stop ticket of a session that appears: the goal stays paused through the peak and is resumed, with the wake, when it ends', async (fixture, clock) => {
  await fixture.runtime.create(pausedSubagent(fixture))
  const adopted = ticketOf(fixture, 'q-1')
  assert.deepEqual([adopted.state, adopted.host.pid, adopted.host.pid === OLD_HOST.pid], ['deferred', process.pid, false])
  assert.equal((await journalOf(rulesPaths(fixture.root))).filter(record => record.op === 'ticket-adopt').length, 1)
  assert.deepEqual(fixture.live.goalCalls, [], 'the peak goes on: nothing resumed')
  await pass(fixture, clock, OVER)
  assert.deepEqual(fixture.live.log, ['goal:resume', 'wake:inject'])
  assert.deepEqual(fixture.live.woken.map(entry => entry.text), [`${RELEASED} Your goal is resumed. Continue your work from where you stopped; the call that was deferred was pwsh "npm test".`])
  assert.equal(ticketOf(fixture, 'q-1').state, 'done')
}, { route: GLM, rules: { version: 2 }, setup: leftBehind(PAUSED) })

ticketTest('a ticket the host that left had already expired as host-gone is taken over too, and is deferred again', async (fixture) => {
  assert.equal(ticketOf(fixture, 'q-1').state, 'expired')
  await fixture.runtime.create(pausedSubagent(fixture))
  const adopted = ticketOf(fixture, 'q-1')
  assert.deepEqual([adopted.state, adopted.expiredWhy, adopted.host.pid], ['deferred', undefined, process.pid])
}, { route: GLM, rules: { version: 2 }, setup: leftBehind(PAUSED, { expire: true }) })

ticketTest('a ticket whose goal was already resumed is not taken over', async (fixture) => {
  await fixture.runtime.create(pausedSubagent(fixture))
  assert.deepEqual([ticketOf(fixture, 'q-1').state, ticketOf(fixture, 'q-1').host.pid], ['expired', OLD_HOST.pid])
  assert.deepEqual(fixture.live.goalCalls, [])
}, { route: GLM, rules: { version: 2 }, setup: leftBehind(PAUSED, { expire: true, stamp: true }) })

ticketTest('an ordinary ticket is not taken over: it waited for a call that ended with the host', async (fixture) => {
  await fixture.runtime.create(pausedSubagent(fixture))
  assert.equal(ticketOf(fixture, 'q-1').host.pid, OLD_HOST.pid)
  assert.deepEqual(fixture.live.goalCalls, [])
}, { route: GLM, rules: { version: 2 }, setup: leftBehind({ signature: 'abcdef012345', rules: ['r-freeze'] }) })

ticketTest('when the peak is already over at the restart the goal is resumed and the subagent woken at once', async (fixture) => {
  await fixture.runtime.create(pausedSubagent(fixture))
  assert.deepEqual(fixture.live.log, ['goal:resume', 'wake:inject'])
  assert.equal(ticketOf(fixture, 'q-1').state, 'done')
  assert.equal(fixture.live.goalOf('sub-1')?.phase, 'active')
}, { route: GLM, rules: { version: 2 }, clock: fakeClock(AFTER_PEAK), setup: leftBehind(PAUSED) })

ticketTest('a row that starts with the session already live takes the ticket over without waiting for agent/created', async (fixture) => {
  await fixture.until(() => ticketOf(fixture, 'q-1').host.pid === process.pid)
  await fixture.pass()
  assert.equal(ticketOf(fixture, 'q-1').state, 'deferred')
  assert.deepEqual(fixture.live.goalCalls, [])
}, { route: GLM, rules: { version: 2 }, setup: leftBehind(PAUSED, { live: true }) })

ticketTest('a row that starts after the peak with the session live resumes the goal and wakes it', async (fixture) => {
  await fixture.until(() => fixture.live.log.length === 2)
  assert.deepEqual(fixture.live.log, ['goal:resume', 'wake:inject'])
  assert.equal(ticketOf(fixture, 'q-1').state, 'done')
}, { route: GLM, rules: { version: 2 }, clock: fakeClock(AFTER_PEAK), setup: leftBehind(PAUSED, { live: true }) })

// ------------------------------------------------------------------- unload

stopTest('unloading the row resumes the goal of every stop ticket of this host, writes it down, and wakes nobody', async (fixture, _clock, sub) => {
  await fixture.exec('pwsh', shell('npm test'), { agent: sub })
  await fixture.dispose()
  assert.deepEqual(fixture.live.log, ['goal:pause', 'goal:resume'])
  assert.equal(fixture.live.goalOf('sub-1')?.phase, 'active')
  const ticket = ticketOf(fixture, 'q-1')
  assert.ok(ticket.resumedAt)
  assert.deepEqual(fixture.live.woken, [])
  const records = await journalOf(rulesPaths(fixture.root))
  assert.deepEqual([records.at(-1)?.op, records.at(-1)?.reason], ['ticket-update', '规则行卸载，goal 已恢复'])
})

stopTest('a resume that throws on unload leaves the ticket as it was for the next start', async (fixture, _clock, sub) => {
  await fixture.exec('pwsh', shell('npm test'), { agent: sub })
  fixture.live.breakGoalChange('sub-1', 'resume')
  await fixture.dispose()
  const ticket = ticketOf(fixture, 'q-1')
  assert.deepEqual([ticket.state, ticket.resumedAt, ticket.pausedGoal], ['deferred', undefined, { id: 'goal-sub-1', revision: 2 }])
  assert.equal(fixture.live.goalOf('sub-1')?.phase, 'paused')
})

stopTest('the whole unload step is bounded by two seconds, and the goals are resumed before the board is asked for its lock', async (fixture, _clock, sub) => {
  await fixture.exec('pwsh', shell('npm test'), { agent: sub })
  const paths = rulesPaths(fixture.root)
  await mkdir(paths.runtimeDir, { recursive: true })
  await writeFile(paths.lock, JSON.stringify({ pid: process.pid, startedAt: Date.now(), at: Date.now() + HOUR, token: 'someone-else' }))
  const started = Date.now()
  await fixture.dispose()
  assert.ok(Date.now() - started < 3_500, `took ${Date.now() - started} ms`)
  assert.equal(fixture.live.goalOf('sub-1')?.phase, 'active', 'the goal is resumed although the ticket could not be written')
  assert.equal(ticketOf(fixture, 'q-1').resumedAt, undefined)
})

stopTest('a stop ticket of another host is left alone on unload', async (fixture, _clock, sub) => {
  await fixture.exec('pwsh', shell('npm test'), { agent: sub })
  const board = openRulesBoard({ projectRoot: fixture.root, io: quickIo() })
  assert.ok((await board.apply('harness', { op: 'ticket-adopt', id: 'q-1', host: OLD_HOST })).ok)
  await fixture.dispose()
  assert.deepEqual(fixture.live.log, ['goal:pause'])
})

// ------------------------------------------------------ the end of the peak
//
// A rule of the person that defers a call while glm-peak is true says until
// when, and the wake says when that peak ended (M6 design §7.2): the end of
// the peak the ticket was opened in, worked out at the wake. The clock starts
// at 15:00 UTC+8 on a Wednesday, in the peak.

const PEAK_HOLD_FILE: RepoRules = { version: 2, rules: { [OFFPEAK_CREDIT_RUNS.id]: OFFPEAK_CREDIT_RUNS } }
const CALIBRATE = 'npm run calibrate'
const CALIBRATE_AGAIN = 'You may run the deferred call again: pwsh "npm run calibrate".'

ticketTest('a rule of the person on glm-peak true defers the call until the end of the peak, and the wake says when the peak ended', async (fixture, clock) => {
  const refused = reasonOf(await fixture.exec('pwsh', shell(CALIBRATE)))
  assert.ok(refused.includes(`\nBoundary: Deferred as ticket q-1. Rule r-offpeak-credit-runs "${OFFPEAK_CREDIT_RUNS.title}" (`), refused)
  assert.ok(refused.includes(` defers it while glm-peak is true until ${clockHm(PEAK_END)}.\nRight path: `), refused)
  await pass(fixture, clock, MINUTE)
  assert.equal(ticketOf(fixture, 'q-1').state, 'deferred', 'the peak is still on')
  await pass(fixture, clock, 3 * HOUR)
  assert.equal(ticketOf(fixture, 'q-1').state, 'cleared')
  assert.deepEqual(fixture.live.woken.map(entry => entry.text), [`[rules board] Ticket q-1 cleared: glm-peak ended at ${clockHm(PEAK_END)}. ${CALIBRATE_AGAIN}`])
}, { rules: PEAK_HOLD_FILE })

/** A pricing service in which it is never peak. */
const NEVER_PEAK = { basis: 'test', plan: 'test', charged: () => undefined, peak: () => false }
const NO_TIME: ReadonlyArray<readonly [string, (fixture: Fixture) => void, string]> = [
  ['there is no pricing service', (fixture) => { fixture.runtime.services.delete(PRICING_SERVICE) }, '没有计价服务（GLM 通道包未装，或它的 glm-login 行未启用）'],
  ['the pricing service does not put the opening of the ticket in a peak', (fixture) => { fixture.runtime.services.set(PRICING_SERVICE, NEVER_PEAK) }, 'glm-peak is off now'],
]
for (const [title, change, because] of NO_TIME) {
  ticketTest(`the wake has no time in it when ${title}`, async (fixture) => {
    await fixture.exec('pwsh', shell(CALIBRATE))
    change(fixture)
    await fixture.pass()
    assert.equal(ticketOf(fixture, 'q-1').state, 'cleared')
    assert.deepEqual(fixture.live.woken.map(entry => entry.text), [`[rules board] Ticket q-1 cleared: ${because}. ${CALIBRATE_AGAIN}`])
  }, { rules: PEAK_HOLD_FILE })
}

// ------------------------------------------------------------- teardown

ticketTest('the row\'s timers go with the row, and a row that is gone sends nothing', async (fixture) => {
  await fixture.exec('pwsh', shell(DEPLOY))
  assert.equal(fixture.timers() > 0, true, 'the row holds its timers while it is on')
  await fixture.dispose()
  assert.equal(fixture.timers(), 0)
  await fixture.pass()
  assert.equal(fixture.live.woken.length, 0)
})
