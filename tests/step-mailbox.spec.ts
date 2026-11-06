/**
 * The step mailbox (src/shared/step-mailbox.ts; .agents/tasks/inject-via-prestep/design.md
 * §2, §5, §6): a notice that does not wake an agent waits in the row's memory,
 * not in the agent's inbox, and is put before the agent's next step, ahead of
 * the claimed messages, until a step has appended it to the session log; then
 * it is gone. Run on the step scope of tests/step-agent.ts, which runs a step
 * in rc.3's order. A source check pins the two places in src/ that still call
 * `agent.inject` for a message.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import test from 'node:test'
import { createUserNotice, type LiveAgentLike, type PreStepDecision, type UserNotice } from '../src/shared/dsh-min.ts'
import { createStepMailbox } from '../src/shared/step-mailbox.ts'
import { captureWarnings } from './graph-helpers.ts'
import { stepScope, type StepScope } from './step-agent.ts'

/** An idle agent on a step scope; `inject` records into `inbox`, the inbox the host would keep. */
function agentOn(scope: StepScope | undefined, id = 'session-1'): LiveAgentLike & { readonly inbox: UserNotice[], injectFails: boolean } {
  const inbox: UserNotice[] = []
  const agent = {
    id,
    session: { id, header: { id }, deriveMessages: () => [] },
    status: 'idle' as const,
    ...scope === undefined ? {} : { ctx: scope.ctx },
    inbox,
    injectFails: false,
    followup: () => { throw new Error('a notice that does not wake must not follow up') },
    inject(message: UserNotice) {
      if (agent.injectFails) throw new Error('agent released')
      inbox.push(message)
    },
    cancel: () => {},
  }
  return agent
}

const notice = (text: string): UserNotice => createUserNotice('test-notice', text, text)
const claimed = (text: string): UserNotice => createUserNotice('user', text, text)
const texts = (decision: PreStepDecision): string[] => decision.kind === 'enter' ? decision.messages.map(message => (message as UserNotice).content[0].text) : []

test('an idle agent: nothing goes into the inbox, the next step carries the notice before the claimed messages, the step after it does not', async () => {
  const scope = stepScope()
  const agent = agentOn(scope)
  const mailbox = createStepMailbox('test')
  assert.deepEqual(mailbox.post(agent, notice('paused')), { via: 'step' })
  assert.deepEqual(agent.inbox, [])
  assert.equal(mailbox.pendingCount(agent), 1)
  assert.deepEqual(texts(await scope.step(agent.session, { messages: [claimed('hello')] })), ['paused', 'hello'])
  assert.equal(mailbox.pendingCount(agent), 0, 'appended to the session log: delivered')
  assert.deepEqual(texts(await scope.step(agent.session, { messages: [claimed('again')] })), ['again'])
})

test('two notices keep their order, the same notice posted twice is carried once, and more than 32 drop the oldest with one warning', async () => {
  const scope = stepScope()
  const agent = agentOn(scope)
  const mailbox = createStepMailbox('test')
  const first = notice('first')
  mailbox.post(agent, first)
  mailbox.post(agent, first)
  mailbox.post(agent, notice('second'))
  assert.deepEqual(texts(await scope.step(agent.session)), ['first', 'second'])
  const { warnings } = await captureWarnings(() => {
    for (let index = 0; index < 34; index++) mailbox.post(agent, notice(`n${index}`))
  })
  assert.deepEqual(warnings, ['dsh-glm-hourness/test: an agent had more than 32 step notices waiting; the oldest was dropped'])
  assert.equal(mailbox.pendingCount(agent), 32)
  const carried = texts(await scope.step(agent.session))
  assert.deepEqual([carried.length, carried[0], carried.at(-1)], [32, 'n2', 'n33'])
})

test('a step cancelled after the pre-step and before the append carries the notice again at the next step, once', async () => {
  const scope = stepScope()
  const agent = agentOn(scope)
  const mailbox = createStepMailbox('test')
  mailbox.post(agent, notice('paused'))
  assert.deepEqual(texts(await scope.step(agent.session, { abort: true })), ['paused'])
  assert.equal(mailbox.pendingCount(agent), 1, 'not in the log: still waiting')
  assert.deepEqual(texts(await scope.step(agent.session)), ['paused'])
  assert.deepEqual(texts(await scope.step(agent.session)), [])
  assert.equal(scope.appended.filter(message => (message as UserNotice).content[0].text === 'paused').length, 1)
})

test('a rejected step and an empty first step take nothing and drop nothing', async () => {
  const scope = stepScope()
  const agent = agentOn(scope)
  const mailbox = createStepMailbox('test')
  mailbox.post(agent, notice('paused'))
  // Another listener that rejects the step, as the goal driver does.
  const off = scope.ctx.on('agent/pre-step', async (_payload, next) => { await next(); return { kind: 'reject' } })
  assert.equal((await scope.step(agent.session)).kind, 'reject')
  off()
  assert.equal(mailbox.pendingCount(agent), 1)
  assert.deepEqual(texts(await scope.step(agent.session, { step: 1 })), [], 'an empty first step stays empty')
  assert.equal(mailbox.pendingCount(agent), 1)
  assert.deepEqual(texts(await scope.step(agent.session)), ['paused'])
})

test('a step that already carries the notice (the goal driver put it back into the inbox) does not get a second copy, and its append delivers it', async () => {
  const scope = stepScope()
  const agent = agentOn(scope)
  const mailbox = createStepMailbox('test')
  const paused = notice('paused')
  mailbox.post(agent, paused)
  await scope.step(agent.session, { abort: true })
  assert.deepEqual(texts(await scope.step(agent.session, { messages: [paused, claimed('next')] })), ['paused', 'next'])
  assert.equal(mailbox.pendingCount(agent), 0)
})

test('an agent without a scoped context gets the notice through the inbox, warned once; when inject throws too it reaches nobody', async () => {
  const mailbox = createStepMailbox('test')
  const bare = agentOn(undefined)
  const { warnings } = await captureWarnings(() => {
    assert.deepEqual(mailbox.post(bare, notice('one')), { via: 'inbox', reason: 'the agent has no scoped context' })
    mailbox.post(bare, notice('two'))
  })
  assert.deepEqual(warnings, ['dsh-glm-hourness/test: notices go through the inbox: the agent has no scoped context'])
  assert.equal(bare.inbox.length, 2)
  bare.injectFails = true
  const lost = mailbox.post(bare, notice('three'))
  assert.equal(lost.via, 'none')
})

test('a scope that refuses the second listener: the first is withdrawn, nothing waits, and the notice goes through the inbox exactly once', async () => {
  const scope = stepScope()
  const agent = agentOn(scope)
  const mailbox = createStepMailbox('test')
  scope.refuse('session/event')
  const { warnings } = await captureWarnings(() => mailbox.post(agent, notice('paused')))
  assert.equal(warnings.length, 1)
  assert.equal(scope.listeners(), 0)
  assert.equal(mailbox.pendingCount(agent), 0)
  assert.equal(agent.inbox.length, 1)
})

test('a pre-step decision of a shape the mailbox cannot read is passed on unchanged, warned once', async () => {
  const scope = stepScope()
  const agent = agentOn(scope)
  const mailbox = createStepMailbox('test')
  mailbox.post(agent, notice('paused'))
  const odd = { kind: 'enter', messages: 'not a list' } as unknown as PreStepDecision
  scope.ctx.on('agent/pre-step', async (_payload, next) => { await next(); return odd })
  const { result, warnings } = await captureWarnings(() => scope.step(agent.session, { abort: true }))
  assert.equal(result, odd)
  assert.equal(warnings.length, 1)
  assert.ok(warnings[0].startsWith('dsh-glm-hourness/test: step notices skipped: '), warnings[0])
  assert.equal(mailbox.pendingCount(agent), 1)
})

test('dispose withdraws the listeners and drops what waits; a post after it reaches nobody', async () => {
  const scope = stepScope()
  const agent = agentOn(scope)
  const mailbox = createStepMailbox('test')
  mailbox.post(agent, notice('paused'))
  assert.equal(scope.listeners(), 2)
  mailbox.dispose()
  assert.equal(scope.listeners(), 0)
  assert.equal(mailbox.pendingCount(agent), 0)
  assert.deepEqual(texts(await scope.step(agent.session)), [])
  assert.equal(mailbox.post(agent, notice('late')).via, 'none')
  assert.deepEqual(agent.inbox, [])
})

test('src/ calls agent.inject for a message in two places only: the mailbox\'s inbox fallback and the loop board\'s answer to a running session', () => {
  const root = join(import.meta.dirname, '..', 'src')
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : entry.name.endsWith('.ts') ? [join(dir, entry.name)] : [])
  const calls = files(root).flatMap(file => [...readFileSync(file, 'utf8').matchAll(/\.inject\((?!\[|names\b)/g)].map(() => relative(root, file).replaceAll('\\', '/')))
  assert.deepEqual(calls.sort(), ['loops/deliver.ts', 'shared/step-mailbox.ts'])
})
