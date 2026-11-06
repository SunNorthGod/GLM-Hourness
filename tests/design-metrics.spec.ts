/**
 * The design row's events in the metrics journal (M3 addendum 0.6 §3.12;
 * metrics design §4.5, §6.2): with the metrics service there, each of the
 * ten kinds the design row and the main agent's rules hand in passes the
 * journal's own validator as it is (no field outside the closed table, every
 * required one there), carries `by: design` and names the session it
 * happened in; without the service nothing is handed in and nothing is
 * said. The service is a stand-in that keeps what it is given.
 */
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { apply } from '../src/design/index.ts'
import { METRICS_KINDS } from '../src/metrics/kinds/index.ts'
import { checkEvent, FORMAT_VERSION } from '../src/metrics/schema.ts'
import { METRICS_SERVICE, type MetricsWhere, type QueuedEvent } from '../src/shared/metrics.ts'
import { PROPOSE_TO_HUMAN, RECORD_HUMAN_ANSWER } from '../src/shared/tool-names.ts'
import { denied, designHost, type DesignHost, type FakeAgent } from './design-host.ts'
import { fillRequirementCard, mainAgentWithGoal, writeDesign, type MainAgentFixture } from './design-tools-helpers.ts'
import { sh } from './git-fixture.ts'
import { captureWarnings } from './graph-helpers.ts'
import { exampleArgs } from './proposal-examples.ts'

interface Handed { readonly event: QueuedEvent, readonly where: MetricsWhere }

/** A metrics service that keeps every event it is handed. */
function metricsOn(host: DesignHost): Handed[] {
  const handed: Handed[] = []
  host.services.set(METRICS_SERVICE, { emit: (event: QueuedEvent, where: MetricsWhere) => { handed.push({ event, where }) } })
  return handed
}

/**
 * Whether the journal takes the event exactly as handed in: the envelope the
 * writer adds around it, the body untouched, so a field outside the table is
 * a refusal here (the writer would drop it silently).
 */
function takes(event: QueuedEvent): { readonly ok: boolean, readonly why: string } {
  const stored = { s: FORMAT_VERSION, k: event.k, at: '2026-11-05T12:00:00.000Z', w: '0123abcd', n: 1, h: '000000000000', v: 'spec', by: event.by, body: event.body }
  const check = checkEvent(stored, METRICS_KINDS)
  return check.ok ? { ok: true, why: '' } : { ok: false, why: `${event.k}: ${check.field} ${check.reason} ${JSON.stringify(event.body)}` }
}

/** The events of one kind, each checked: the journal takes it, by design, filed under the session. */
function ofKind(handed: readonly Handed[], kind: string, session: string): Array<Record<string, unknown>> {
  const found = handed.filter(entry => entry.event.k === kind)
  for (const { event, where } of found) {
    const verdict = takes(event)
    assert.ok(verdict.ok, verdict.why)
    assert.equal(event.by, 'design', kind)
    assert.equal(where.sessionId, session, kind)
    assert.equal(typeof where.dir, 'string', kind)
  }
  return found.map(entry => entry.event.body as Record<string, unknown>)
}

async function withMetrics(goalBy: 'human' | 'llm' = 'human'): Promise<MainAgentFixture & { readonly handed: Handed[] }> {
  const fixture = await mainAgentWithGoal({}, goalBy)
  return { ...fixture, handed: metricsOn(fixture.host) }
}

const ok = (outcome: { readonly kind: string }): void => { assert.equal(outcome.kind, 'ok', JSON.stringify(outcome)) }

// ---------------------------------------------------------------- the two tools

test('a question put and answered: design.proposal-shown and design.answer-recorded, paired by pending, with the form, the counts and the wait', async () => {
  const fixture = await withMetrics()
  const { host, agent, handed } = fixture
  const shown = await host.callTool(agent, PROPOSE_TO_HUMAN, exampleArgs('recommend'))
  ok(shown)
  host.reply(agent, shown.kind === 'ok' ? String(shown.value.text) : '')
  await host.say(agent, '可以，就按推荐的来')
  ok(await host.callTool(agent, RECORD_HUMAN_ANSWER, { kind: 'question', question: 'question-1', answer: 'agree', words: ['可以，就按推荐的来'], recordedAs: '默认少做' }))
  const [put] = ofKind(handed, 'design.proposal-shown', agent.id)
  assert.deepEqual([put?.kind, put?.form, put?.number, put?.goal, put?.pending, put?.again, put?.sample], ['question', 'recommend', 1, 'goal-1', 'question-1', false, false])
  assert.ok(typeof put?.units === 'number' && typeof put.points === 'number' && put.points >= put.units, JSON.stringify(put))
  const [answered] = ofKind(handed, 'design.answer-recorded', agent.id)
  assert.deepEqual([answered?.kind, answered?.form, answered?.answer, answered?.outcome, answered?.goal, answered?.pending, answered?.noted, answered?.delegated], ['question', 'recommend', 'agree', 'decided', 'goal-1', 'question-1', false, false])
  assert.equal(answered?.units, [...'可以，就按推荐的来'].length)
  assert.ok(typeof answered?.ms === 'number' && answered.ms >= 0)
})

test('a choose answered with the recommended way: pickedRecommended is true; a question shown again carries again', async () => {
  const fixture = await withMetrics()
  const { host, agent, handed } = fixture
  ok(await host.callTool(agent, PROPOSE_TO_HUMAN, exampleArgs('choose')))
  const again = await host.callTool(agent, PROPOSE_TO_HUMAN, { kind: 'question', question: 'question-1', text: String(exampleArgs('choose').text) })
  ok(again)
  host.reply(agent, again.kind === 'ok' ? String(again.value.text) : '')
  await host.say(agent, '就按推荐的来')
  const ways = (exampleArgs('choose').ways as string[]).length
  ok(await host.callTool(agent, RECORD_HUMAN_ANSWER, { kind: 'question', question: 'question-1', answer: 'agree', way: ways, words: ['就按推荐的来'], recordedAs: '按推荐' }))
  const shown = ofKind(handed, 'design.proposal-shown', agent.id)
  assert.deepEqual(shown.map(body => [body.form, body.again, body.number]), [['choose', false, 1], ['choose', true, 2]])
  const [answered] = ofKind(handed, 'design.answer-recorded', agent.id)
  assert.equal(answered?.pickedRecommended, true)
})

test('a refused question: design.proposal-refused with the reason code, and for words that are not the record, the field and where they had to be', async () => {
  const fixture = await withMetrics()
  const { host, agent, handed } = fixture
  const args = exampleArgs('recommend')
  assert.equal((await host.callTool(agent, PROPOSE_TO_HUMAN, { ...args, text: '我推荐默认少做' })).kind, 'error')
  assert.equal((await host.callTool(agent, PROPOSE_TO_HUMAN, { ...args, text: '这样可以吗？' })).kind, 'error')
  const refused = ofKind(handed, 'design.proposal-refused', agent.id)
  assert.deepEqual(refused.map(body => [body.kind, body.form, body.code]), [['question', 'recommend', 'text-shape'], ['question', 'recommend', 'not-in-text']])
  assert.equal(refused[1]?.field, 'proposal')
  assert.equal(refused[1]?.within, 'ask')
  assert.deepEqual(ofKind(handed, 'design.proposal-shown', agent.id), [])
})

test('words the human did not say: design.answer-refused with words-not-found; a matter not shown: not_shown', async () => {
  const fixture = await withMetrics()
  const { host, agent, handed } = fixture
  ok(await host.callTool(agent, PROPOSE_TO_HUMAN, exampleArgs('recommend')))
  await host.say(agent, '可以')
  assert.equal((await host.callTool(agent, RECORD_HUMAN_ANSWER, { kind: 'question', question: 'question-1', answer: 'agree', words: ['我编的一句话'], recordedAs: '同意' })).kind, 'error')
  assert.equal((await host.callTool(agent, RECORD_HUMAN_ANSWER, { kind: 'confirm', goal: 'goal-1', answer: 'agree', words: ['可以'], recordedAs: '同意' })).kind, 'error')
  assert.deepEqual(ofKind(handed, 'design.answer-refused', agent.id), [{ kind: 'question', code: 'words-not-found' }, { kind: 'confirm', code: 'not_shown' }])
})

test('the requirement confirmed: kind confirm, pending is the goal; a "this kind you decide": design.delegation with counts only', async () => {
  const fixture = await withMetrics('llm')
  const { host, agent, handed } = fixture
  await fillRequirementCard(fixture)
  const shown = await host.callTool(agent, PROPOSE_TO_HUMAN, { kind: 'confirm', goal: 'goal-1', text: '需求就按上面这样定，可以吗？' })
  ok(shown)
  host.reply(agent, shown.kind === 'ok' ? String(shown.value.text) : '')
  await host.say(agent, '对，就这样')
  ok(await host.callTool(agent, RECORD_HUMAN_ANSWER, { kind: 'confirm', goal: 'goal-1', answer: 'agree', words: ['对，就这样'], recordedAs: '需求按上面这样定' }))
  const [put] = ofKind(handed, 'design.proposal-shown', agent.id)
  assert.deepEqual([put?.kind, put?.goal, put?.pending, put?.form, put?.again], ['confirm', 'goal-1', 'goal-1', undefined, false])
  const [answered] = ofKind(handed, 'design.answer-recorded', agent.id)
  assert.deepEqual([answered?.kind, answered?.outcome, answered?.pending], ['confirm', 'confirmed', 'goal-1'])
  await host.say(agent, '代码风格这类你定')
  ok(await host.callTool(agent, RECORD_HUMAN_ANSWER, { kind: 'delegation', scope: '代码风格', words: ['代码风格这类你定'] }))
  assert.deepEqual(ofKind(handed, 'design.delegation', agent.id), [{ action: 'add', count: 1, scopeUnits: 4, where: 'graph' }])
})

test('the design released: kind release, the goal as pending, the released outcome', async () => {
  const fixture = await withMetrics()
  const { host, agent, handed } = fixture
  await writeDesign(fixture, 'small')
  const shown = await host.callTool(agent, PROPOSE_TO_HUMAN, { kind: 'release', goal: 'goal-1', text: '照上面的方案放行，可以吗？' })
  ok(shown)
  host.reply(agent, shown.kind === 'ok' ? String(shown.value.text) : '')
  await host.say(agent, '可以，放行')
  ok(await host.callTool(agent, RECORD_HUMAN_ANSWER, { kind: 'release', goal: 'goal-1', answer: 'agree', words: ['可以，放行'], recordedAs: '照这一页放行' }))
  const [put] = ofKind(handed, 'design.proposal-shown', agent.id)
  assert.deepEqual([put?.kind, put?.goal, put?.pending, put?.module], ['release', 'goal-1', 'goal-1', undefined])
  const [answered] = ofKind(handed, 'design.answer-recorded', agent.id)
  assert.deepEqual([answered?.kind, answered?.outcome, answered?.pending], ['release', 'released', 'goal-1'])
})

// ---------------------------------------------------------------- the holder record and the rules

test('the holder record: written by /wish, moved by /wish here, deleted by /wish off, each a design.holder-moved', async () => {
  const host = designHost()
  apply(host.ctx)
  const handed = metricsOn(host)
  const first = host.addAgent('s1')
  const second = host.addAgent('s2')
  assert.equal((await host.execute(first, '/wish'))?.result.kind, 'success')
  assert.equal((await host.execute(second, '/wish here'))?.result.kind, 'success')
  assert.equal((await host.execute(second, '/wish off'))?.result.kind, 'success')
  const moves = handed.filter(entry => entry.event.k === 'design.holder-moved')
  for (const { event } of moves) assert.ok(takes(event).ok, takes(event).why)
  assert.deepEqual(moves.map(entry => [entry.where.sessionId, entry.event.body]), [
    ['s1', { how: 'wish', to: 's1' }],
    ['s2', { how: 'here', from: 's1', to: 's2' }],
    ['s2', { how: 'off', from: 's2' }],
  ])
})

test('a denial of the main agent\'s rules: design.rule-denied with the rule, the native tool and the kind of session', async () => {
  const fixture = await withMetrics()
  const { host, agent, handed } = fixture
  denied(await host.preExecute(agent, 'write', { file_path: 'a.txt', content: 'x' }))
  denied(await host.preExecute(agent, 'ask_user_question', {}))
  assert.deepEqual(ofKind(handed, 'design.rule-denied', agent.id), [
    { rule: 'main-agent-no-write', tool: 'write', sessionKind: 'main-agent' },
    { rule: 'main-agent-ask', tool: 'ask_user_question', sessionKind: 'main-agent' },
  ])
})

test('a subagent that relays the human\'s words to move the goal: design.bypass-refused with the stage it had and the one it wanted', async () => {
  const fixture = await withMetrics()
  const { host, agent, engine, handed } = fixture
  const child: FakeAgent = host.addAgent('child', { origin: 'subagent', parentSession: agent.id })
  const rev = (await engine.load()).revisions.get('goal-1')
  denied(await host.preExecute(child, 'graph_edit', { id: 'goal-1', rev, set: { stage: 'release' }, reason: '放行', relay: '可以，放行' }))
  assert.deepEqual(ofKind(handed, 'design.bypass-refused', 'child'), [{ rule: 'main-agent-graph-relay', sessionKind: 'subagent', goal: 'goal-1', from: 'interview', to: 'release' }])
  assert.deepEqual(ofKind(handed, 'design.rule-denied', 'child').map(body => body.sessionKind), ['subagent'])
})

// ---------------------------------------------------------------- git snapshots

test('a git command that can lose work: git.snapshot with the class, what was kept and the time; one that would delete ignored files: git.snapshot-refused with its code', async () => {
  const host = designHost()
  apply(host.ctx)
  const handed = metricsOn(host)
  const dir = host.workspace('ws')
  sh(dir, 'init', '--quiet', '-b', 'main')
  writeFileSync(join(dir, 'a.txt'), 'one\n')
  sh(dir, 'add', 'a.txt')
  sh(dir, 'commit', '--quiet', '-m', 'first')
  const agent = host.addAgent('s1')
  await host.execute(agent, '/wish')
  writeFileSync(join(dir, 'a.txt'), 'precious\n')
  assert.equal((await host.preExecute(agent, 'Bash', { command: 'git checkout -- a.txt' })).kind, 'allow')
  denied(await host.preExecute(agent, 'Bash', { command: 'git clean -fdx' }))
  const [saved] = ofKind(handed, 'git.snapshot', 's1')
  assert.equal(saved?.class, 'discard')
  assert.deepEqual(saved?.saved, { stash: true, worktree: false, files: 0, inTheWay: 0, cleaned: 0, removed: 0, refs: 0 })
  assert.deepEqual([saved?.tagged, saved?.ignored, saved?.ignoredBytes], [false, 0, 0])
  assert.ok(typeof saved?.ms === 'number' && saved.ms >= 0)
  assert.deepEqual(ofKind(handed, 'git.snapshot-refused', 's1'), [{ code: 'ignored-files' }])
})

// ---------------------------------------------------------------- without the service

test('without the metrics service nothing is handed in and nothing is said; a service that throws does not reach the tool', async () => {
  const fixture = await mainAgentWithGoal()
  const { host, agent } = fixture
  const quiet = await captureWarnings(async () => {
    ok(await host.callTool(agent, PROPOSE_TO_HUMAN, exampleArgs('recommend')))
    denied(await host.preExecute(agent, 'write', { file_path: 'a.txt', content: 'x' }))
  })
  assert.deepEqual(quiet.warnings, [])
  host.services.set(METRICS_SERVICE, { emit: () => { throw new Error('the journal is gone') } })
  const loud = await captureWarnings(async () => {
    ok(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs('want') }))
    denied(await host.preExecute(agent, 'write', { file_path: 'a.txt', content: 'x' }))
  })
  assert.deepEqual(loud.warnings, [])
})
