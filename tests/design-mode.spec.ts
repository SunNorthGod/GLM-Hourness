/**
 * The design row's main agent mode on the fake rc.3 host (docs/
 * ORCHESTRATION.md §3.1; decisions d-one-main-agent, question-26 C,
 * question-31 C): the identity section, the tool face, `/wish` with the
 * holder record and the alignment of the sessions that lost the role, the
 * pending state between the handler and command/done, and the row health.
 * The record files live in a real temporary directory; the host is the one
 * in design-host.ts.
 */
import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { apply, MAIN_AGENT_ACTIVE, MAIN_AGENT_INACTIVE, WAITING_STATE } from '../src/design/index.ts'
import { MAIN_AGENT_IDENTITY, MAIN_AGENT_ROLE, MAIN_AGENT_SECTION, MAIN_AGENT_TALK } from '../src/design/identity.ts'
import { CANCELLED_OFF, CANCELLED_ON, MAX_WISH_LENGTH, ROLE_UNCHANGED_MARK, STRONG_MODEL_NOTE, staleRecordKept } from '../src/design/mode.ts'
import { HIDDEN_FROM_MAIN_AGENT, TALK_GUIDE, TALK_SHAPES, type ProposalKind } from '../src/design/talk.ts'
import { ASK_FORMS, TALK_LIMITS } from '../src/graph/proposal.ts'
import { AGREE_WORDS } from '../src/shared/answer-marks.ts'
import { STR_REPLACE_EDITOR_UNKNOWN, WRITE_NATIVES } from '../src/design/role-face.ts'
import { claimHolder, holderFileOf, mainAgentOf, readHolder, replaceHolder } from '../src/graph/main-agent-holder.ts'
import { MAIN_AGENT_KEY } from '../src/graph/main-agent.ts'
import { PLAIN_QUESTION_GUIDE, PLAIN_WORDS_GUIDE, plainWordsIn } from '../src/graph/plain-question.ts'
import type { AssemblePayload, AssembledTool } from '../src/shared/dsh-min.ts'
import { healthServiceName, type RowHealthView } from '../src/shared/health.ts'
import { BASE_TOOLS, designHost, type DesignHost, type FakeAgent } from './design-host.ts'
import { captureWarnings } from './graph-helpers.ts'

// Everything the row says to the person (replies, errors, row health): the last test holds it to plain words.
const saidToPerson: string[] = []

const tick = (): Promise<void> => new Promise(resolve => { setImmediate(resolve) })

/** The row applied on a fresh host. */
function open(options: Parameters<typeof designHost>[0] = {}): { readonly host: DesignHost, readonly dispose: () => void } {
  const host = designHost(options)
  return { host, dispose: apply(host.ctx) }
}

/** A project whose first session is the main agent, and a second session of the same workspace. */
async function withMainAgent(options: Parameters<typeof designHost>[0] = {}): Promise<{ readonly host: DesignHost, readonly first: FakeAgent, readonly second: FakeAgent }> {
  const { host } = open(options)
  const first = host.addAgent('s1')
  const second = host.addAgent('s2')
  await type(host, first, '/wish')
  return { host, first, second }
}

/** A project whose first session is the main agent, and a busy fork of it that inherited the command events. */
async function withFork(): Promise<{ readonly host: DesignHost, readonly first: FakeAgent, readonly fork: FakeAgent }> {
  const { host } = open()
  const first = host.addAgent('s1')
  await type(host, first, '/wish')
  return { host, first, fork: host.addAgent('fork', { inheritFrom: first, status: 'running' }) }
}

/** Type a line as the person; the reply is recorded for the plain words test. */
async function type(host: DesignHost, agent: FakeAgent, line: string, hold?: Promise<void>): Promise<{ readonly kind: string, readonly text: string }> {
  const run = await host.execute(agent, line, hold)
  assert.ok(run !== undefined, `${line} is registered`)
  saidToPerson.push(run.result.text)
  return run.result
}

const graphDirOf = (host: DesignHost, workspace = 'ws'): string => resolve(host.workspace(workspace), 'docs', 'graph')
const recordFile = (host: DesignHost, workspace = 'ws'): string => holderFileOf(host.userHome, graphDirOf(host, workspace))
const healthView = (host: DesignHost): RowHealthView => host.services.get(healthServiceName('design')) as RowHealthView
const sessionHealth = (host: DesignHost, agent: FakeAgent): { readonly state: string, readonly reason: string } | undefined => {
  const report = healthView(host).session(agent.id)
  if (report !== undefined) saidToPerson.push(report.reason)
  return report === undefined ? undefined : { state: report.state, reason: report.reason }
}
const sectionOf = (assembled: AssemblePayload): { readonly name: string, readonly text: string } | undefined => assembled.sections.find(section => section.name === MAIN_AGENT_SECTION)
const toolNames = (assembled: AssemblePayload): string[] => assembled.tools.map(tool => tool.name)
const projectionOf = (host: DesignHost, agent: FakeAgent): unknown => host.projections.stateOf(agent.session, MAIN_AGENT_KEY)
const isOn = (host: DesignHost, agent: FakeAgent): boolean => (projectionOf(host, agent) as { active: boolean }).active

const tool = (name: string, parameters: Record<string, unknown> = { type: 'object', properties: {} }): AssembledTool => ({ name, description: name, parameters })
const EDITOR = tool('str_replace_editor', { type: 'object', properties: { command: { type: 'string', enum: ['view', 'create', 'str_replace', 'insert', 'undo_edit'] }, path: { type: 'string' } }, required: ['command', 'path'] })
const FACE: readonly AssembledTool[] = [...BASE_TOOLS, tool('Write'), tool('Edit'), tool('AskUserQuestion'), tool('Bash'), EDITOR]

type AssembleListener = Parameters<FakeAgent['listeners']['push']>[0]
/** Install a listener on the agent's own assemble waterfall, as another row would. */
const listen = (agent: FakeAgent, listener: AssembleListener, prepend: boolean): void => {
  (agent.ctx as unknown as { on(event: string, listener: AssembleListener, options: { prepend: boolean }): void }).on('system-prompt/assemble', listener, { prepend })
}

// ---------------------------------------------------------------- the identity section

test('the identity section: role and boundaries within 1,500, the talk guide and the plain-words list within 1,800, the whole within 3,000', () => {
  assert.ok(MAIN_AGENT_ROLE(false).length <= 1500, `role ${MAIN_AGENT_ROLE(false).length}`)
  assert.ok(MAIN_AGENT_ROLE(true).length <= 1500, `role with the execute row on: ${MAIN_AGENT_ROLE(true).length}`)
  assert.equal(MAIN_AGENT_TALK, `${TALK_GUIDE}\n${PLAIN_WORDS_GUIDE}`)
  assert.ok(MAIN_AGENT_TALK.length <= 1800, `talk ${MAIN_AGENT_TALK.length}`)
  assert.equal(MAIN_AGENT_IDENTITY(false), `${MAIN_AGENT_ROLE(false)}\n\n${MAIN_AGENT_TALK}`)
  assert.ok(MAIN_AGENT_IDENTITY(false).length <= 3000, `whole ${MAIN_AGENT_IDENTITY(false).length}`)
  assert.equal(MAIN_AGENT_SECTION, 'hourness:main-agent')
})

test('the tool description carries the shapes of a question and the worked examples; its limits come from the constants', () => {
  assert.ok(TALK_SHAPES.length <= 1700, `shapes ${TALK_SHAPES.length}`)
  assert.ok(PLAIN_QUESTION_GUIDE.length <= 1200, `examples ${PLAIN_QUESTION_GUIDE.length}`)
  assert.ok(TALK_SHAPES.includes(`at most ${TALK_LIMITS.text.recommend} characters for recommend and ${TALK_LIMITS.text.choose} for the others`))
  for (const form of ASK_FORMS) assert.ok(TALK_SHAPES.includes(`${form}:`), form)
})

test('the guide lists the words that plainly say yes: the list the harness reads, plus the number of a way', () => {
  const listed = [...TALK_GUIDE.matchAll(/\(((?:「[^」]+」)+)\)/g)].flatMap(match => [...match[1].matchAll(/「([^」]+)」/g)].map(word => word[1]))
  assert.deepEqual(listed, [...AGREE_WORDS, '第 N 条'])
})

test('the first part has the five items: role, the harness boundaries, git with its snapshot, the design loop, /plan', () => {
  for (const part of [
    'You are the main agent of this project: the human\'s one conversation with the project, and its project manager.',
    'You have no tools that write files.',
    'The harness enforces the boundaries and its denials name the right path: shell commands that write files are denied;',
    'until what you work on (the goal, or its module) is released, the subagents you dispatch, and theirs, only read;',
    'words you relay as the human\'s must be in a message they sent.',
    'The shell and git are yours; before a git command that can lose uncommitted work or rewrite history, the harness saves a snapshot and tells you how to restore it.',
    'The design loop runs wish, interview, design, release.',
    'If the human has /plan on, exit_plan_mode only leaves plan mode; it releases nothing on the graph.',
  ]) assert.ok(MAIN_AGENT_ROLE(false).includes(part), part)
  assert.ok(MAIN_AGENT_ROLE(true).includes('writing work goes to workers you dispatch with dispatch_task; subagents started with the subagent tool only read'), 'the F18 sentence is in the execute row variant')
})

test('the section names the two tools, the delegation call, the four ways of asking and the plain yes-words, and none of the retired names or phrases', () => {
  for (const wanted of ['propose_to_human', 'record_human_answer', 'delegation', ...ASK_FORMS, ...AGREE_WORDS]) assert.ok(MAIN_AGENT_IDENTITY(false).includes(wanted), wanted)
  for (const gone of ['ask_user_question', 'decision_card', 'design_review', 'ask_human', '(Recommended)', '(推荐)', '（推荐）', 'depth', 'never give them options', 'four short lines', 'norm-delegations']) assert.ok(!MAIN_AGENT_IDENTITY(false).includes(gone), gone)
})

test('talk.ts: the question tool hidden from the main agent, and the three proposal kinds', () => {
  assert.deepEqual(HIDDEN_FROM_MAIN_AGENT, ['ask_user_question'])
  const kinds = ['question', 'confirm', 'release'] satisfies ProposalKind[]
  assert.equal(kinds.length, 3)
  assert.deepEqual([...WRITE_NATIVES], ['write', 'edit'])
})

// ---------------------------------------------------------------- the row

test('apply registers /wish with its hint, the main agent projection and a health view that is in effect', () => {
  const { host } = open()
  const wish = host.commands.get('wish')
  assert.equal(wish?.definitionId, 'dsh-glm-hourness/wish')
  assert.equal(wish?.input?.hint, 'off | here [一句话] | 一句话')
  assert.ok(wish?.description.includes('here'))
  const agent = host.addAgent('s1')
  assert.deepEqual(projectionOf(host, agent), { active: false, running: null, settled: null })
  assert.deepEqual({ state: healthView(host).activation().state, reason: healthView(host).activation().reason }, { state: 'active', reason: '命令 /wish 已注册；会话状态服务已就绪' })
  assert.equal(sessionHealth(host, agent), undefined, 'a session that never acted has no report')
})

test('without the session state service /wish refuses and the row says so; when it arrives the row is in effect, when it leaves it is not', async () => {
  const { host } = open({ projections: false })
  const agent = host.addAgent('s1')
  assert.equal(healthView(host).activation().state, 'degraded')
  assert.equal(healthView(host).activation().reason, `命令 /wish 已注册；${WAITING_STATE}`)
  const refused = await type(host, agent, '/wish')
  assert.deepEqual(refused, { kind: 'error', text: '主 Agent 模式要用 DSH 的会话状态服务（sessionProjections），这个组合里没有' })
  host.injector.provide('sessionProjections', host.projections)
  assert.equal(healthView(host).activation().state, 'active')
  assert.equal((await type(host, agent, '/wish')).kind, 'success')
  host.injector.remove('sessionProjections')
  assert.equal(healthView(host).activation().state, 'degraded')
  assert.equal((await type(host, host.addAgent('s2'), '/wish')).kind, 'error')
})

test('a host without inject, a projection key already taken, a /wish that cannot register: the row warns, says why, and /wish does not turn the mode on', async () => {
  const noInject = designHost()
  const withoutInject = { ...noInject.ctx } as { inject?: unknown } & typeof noInject.ctx
  delete withoutInject.inject
  const { warnings: first } = await captureWarnings(() => apply(withoutInject))
  assert.deepEqual(first, [])
  assert.equal(healthView(noInject).activation().state, 'degraded')
  assert.ok(healthView(noInject).activation().reason.includes('宿主没有 inject'))

  const taken = designHost()
  taken.projections.register({ key: MAIN_AGENT_KEY, stateVersion: 1, stateSchema: { parse: value => value }, init: () => null, apply: state => state })
  const { warnings: second } = await captureWarnings(() => apply(taken.ctx))
  assert.equal(second.length, 1)
  assert.ok(second[0]?.includes('the main agent projection is off'))
  assert.equal(healthView(taken).activation().state, 'degraded')
  assert.ok(healthView(taken).activation().reason.includes('主 Agent 状态注册失败'))

  const twice = designHost()
  apply(twice.ctx)
  const { result: duplicate, warnings: third } = await captureWarnings(() => apply(twice.ctx))
  assert.equal(typeof duplicate, 'function', 'a failed activation still returns its disposer')
  assert.ok(third.some(warning => warning.includes('registering /wish failed')), third.join(' | '))
})

test('a /wish that cannot register leaves the row doing nothing else: no agent/created listener, no projection, inactive', async () => {
  const host = designHost()
  host.commands.set('wish', { definitionId: 'other/wish', name: 'wish', description: 'someone else\'s', input: { hint: 'x' }, handler: () => Promise.resolve({ kind: 'success', text: 'x' }) })
  const { warnings } = await captureWarnings(() => apply(host.ctx))
  assert.equal(warnings.length, 1)
  assert.equal(healthView(host).activation().state, 'inactive')
  assert.ok(healthView(host).activation().reason.startsWith('/wish 注册失败：'))
  assert.equal(host.projections.stateOf(host.addAgent('s1').session, MAIN_AGENT_KEY), undefined, 'the projection was never registered')
  const agent = host.addAgent('s2')
  await host.created(agent)
  assert.equal(agent.listeners.length, 0, 'no hooks are installed')
})

test('disposing the row takes back the command, the health view and the listeners it put on agents', async () => {
  const { host, dispose } = open()
  const agent = host.addAgent('s1')
  await host.created(agent)
  assert.equal(agent.listeners.length, 2)
  dispose()
  assert.equal(host.commands.size, 0)
  assert.equal(host.services.has(healthServiceName('design')), false)
  assert.equal(agent.listeners.length, 0)
})

// ---------------------------------------------------------------- /wish refusals

test('/wish is refused for a delegated child, a missing graph row, a missing graph directory, a session without a working directory and a wish that is too long', async () => {
  const { host } = open()
  const child = host.addAgent('child', { origin: 'subagent', parentSession: 's1' })
  assert.deepEqual(await type(host, child, '/wish'), { kind: 'error', text: '子 agent 的会话不能当主 Agent' })

  const agent = host.addAgent('s1')
  const tooLong = '愿'.repeat(MAX_WISH_LENGTH + 1)
  assert.deepEqual(await type(host, agent, `/wish ${tooLong}`), { kind: 'error', text: '愿望太长，请先用一两句话说' })
  assert.deepEqual(await type(host, agent, `/wish here ${tooLong}`), { kind: 'error', text: '愿望太长，请先用一两句话说' })
  assert.equal((await type(host, agent, `/wish ${'愿'.repeat(MAX_WISH_LENGTH)}`)).kind, 'success', 'exactly the limit is fine')
  await type(host, agent, '/wish off')

  const bare = host.addAgent('bare')
  delete (bare.session.header as { cwd?: string }).cwd
  assert.deepEqual(await type(host, bare, '/wish'), { kind: 'error', text: '这个会话没有工作目录，找不到项目图' })

  const noGraphDir = host.addAgent('missing', { workspace: 'empty' })
  rmSync(graphDirOf(host, 'empty'), { recursive: true })
  const refusal = await type(host, noGraphDir, '/wish')
  assert.equal(refusal.kind, 'error')
  assert.equal(refusal.text, `这个工作区还没有项目图：先建空目录 ${graphDirOf(host, 'empty')}`)

  const noGraphRow = open({ graph: false })
  assert.deepEqual(await type(noGraphRow.host, noGraphRow.host.addAgent('s1'), '/wish'), { kind: 'error', text: '项目图行 glm-hourness/graph 没有启用，主 Agent 没有图可用' })

  for (const refused of [child, bare, noGraphDir]) {
    assert.equal(isOn(host, refused), false, refused.id)
    assert.deepEqual(refused.sent, [], refused.id)
    assert.equal(sectionOf(await refused.assemble()), undefined, refused.id)
  }
})

// ---------------------------------------------------------------- /wish on and off

test('/wish makes the session the main agent: record, projection, one notice that does not wake it, the reply ends with the stronger model', async () => {
  const { host } = open()
  const agent = host.addAgent('s1')
  const reply = await type(host, agent, '/wish')
  assert.equal(reply.kind, 'success')
  assert.equal(reply.text, `已让这个会话的 agent 当主 Agent（项目经理）：它按项目图推进，不写文件；/wish off 退出。${STRONG_MODEL_NOTE}`)
  assert.ok(reply.text.includes('强一点的模型'))
  assert.equal(isOn(host, agent), true)
  const holder = readHolder(recordFile(host))
  assert.equal(holder.kind, 'held')
  assert.ok(holder.kind === 'held' && holder.record.sessionId === 's1' && holder.record.graphDir === graphDirOf(host) && !Number.isNaN(Date.parse(holder.record.since)))
  assert.equal(agent.sent.length, 1)
  assert.equal(agent.sent[0]?.via, 'inject')
  assert.equal(agent.sent[0]?.message.source.kind, 'glm-design-wish')
  assert.equal(agent.woken, undefined, 'an empty /wish does not wake an idle agent')
  assert.ok(sectionOf(await agent.assemble()))
  assert.deepEqual(sessionHealth(host, agent), { state: 'active', reason: MAIN_AGENT_ACTIVE })
  assert.equal((await type(host, agent, '/wish')).text, '这个会话已经是主 Agent')
  assert.equal(agent.sent.length, 1, 'already the main agent: nothing more is sent')
})

test('/wish with a sentence wakes an idle agent: its first assembly, started before the command returns, already has the section; the wish is quoted in the notice', async () => {
  const { host } = open()
  const agent = host.addAgent('s1')
  const reply = await type(host, agent, '/wish 记一下每天花了多少钱')
  assert.equal(reply.text, `已让这个会话的 agent 当主 Agent（项目经理）：它按项目图推进，不写文件；/wish off 退出。已把你的愿望交给它。${STRONG_MODEL_NOTE}`)
  assert.equal(agent.sent.length, 1)
  assert.equal(agent.sent[0]?.via, 'followup')
  const notice = agent.sent[0]?.message
  assert.ok(notice?.content[0]?.text.includes('"记一下每天花了多少钱"'))
  assert.ok(notice?.content[0]?.text.includes('需求：'))
  assert.ok(notice?.content[0]?.text.includes('Propose it as a proposal, without their words as relay: their confirmation of the requirement card (record_human_answer, kind confirm) is what approves the goal with their own words, not an edit.'), 'the confirmation approves the goal, the proposal does not')
  const facts = notice?.source.designWish as { commandId: string, text: string }
  assert.equal(facts.text, '记一下每天花了多少钱')
  assert.ok(facts.commandId.startsWith('cmd-'))
  assert.ok(agent.woken !== undefined)
  const first = await agent.woken
  assert.ok(sectionOf(first), 'the first step of the woken turn carries the identity section')
  assert.ok(!toolNames(first).includes('write') && !toolNames(first).includes('ask_user_question'))
})

test('/wish with a sentence reaches a running agent with steer, at its next step', async () => {
  const { host } = open()
  const agent = host.addAgent('s1', { status: 'running' })
  await type(host, agent, '/wish 记一笔账')
  assert.deepEqual(agent.sent.map(entry => entry.via), ['steer'])
  assert.equal(agent.woken, undefined)
  assert.ok(sectionOf(await agent.assemble()), 'the next step already has the role')
})

test('before command/done is in the log the pending state gives the role, and after it the projection does', async () => {
  const { host } = open()
  const agent = host.addAgent('s1')
  let release = (): void => {}
  const hold = new Promise<void>((resolve) => { release = resolve })
  const running = host.execute(agent, '/wish', hold)
  await tick()
  assert.deepEqual(agent.session.events.map(event => event.type), ['command/run'])
  assert.ok(sectionOf(await agent.assemble()))
  release()
  await running
  assert.deepEqual(agent.session.events.map(event => event.type), ['command/run', 'command/done'])
  assert.ok(sectionOf(await agent.assemble()))
})

test('/wish off ends the role from the very next step, deletes the record and tells the agent once', async () => {
  const { host } = open()
  const agent = host.addAgent('s1')
  await type(host, agent, '/wish')
  assert.ok(sectionOf(await agent.assemble()))
  let release = (): void => {}
  const hold = new Promise<void>((resolve) => { release = resolve })
  const leaving = host.execute(agent, '/wish off', hold)
  await tick()
  const during = await agent.assemble({ tools: FACE })
  assert.equal(sectionOf(during), undefined, 'the section is gone before command/done lands')
  assert.ok(toolNames(during).includes('write') && toolNames(during).includes('ask_user_question'), 'the tool face is the ordinary one again')
  release()
  const reply = await leaving
  saidToPerson.push(reply?.result.text ?? '')
  assert.deepEqual(reply?.result, { kind: 'success', text: '已退出主 Agent 模式：这个会话的 agent 又可以直接写文件了' })
  assert.deepEqual(readHolder(recordFile(host)), { kind: 'none' })
  assert.equal(isOn(host, agent), false)
  assert.equal(agent.sent.at(-1)?.via, 'inject')
  assert.ok(agent.sent.at(-1)?.message.content[0]?.text.includes('/wish off'))
  assert.deepEqual(await type(host, agent, '/wish off'), { kind: 'success', text: '这个会话本来就不是主 Agent' })
  assert.equal(agent.sent.length, 2, 'a /wish off that changes nothing sends nothing')
})

/** A command whose request is cancelled after its handler returned: the log ends with `command/done` in error. */
async function cancelled(host: DesignHost, agent: FakeAgent, line = '/wish'): Promise<void> {
  const aborted = new Promise<void>((_resolve, reject) => { setImmediate(() => { reject(new Error('cancelled')) }) })
  await assert.rejects(host.execute(agent, line, aborted), /cancelled/)
}

const holderOf = (host: DesignHost, workspace = 'ws'): string | undefined => mainAgentOf(host.userHome, graphDirOf(host, workspace))?.sessionId

test('a /wish whose request was cancelled after the handler returned leaves the session as it was and the health says so', async () => {
  const { host } = open()
  const agent = host.addAgent('s1')
  await cancelled(host, agent)
  assert.equal(holderOf(host), 's1', 'the cancelled /wish had claimed the record before it was cancelled')
  assert.equal(isOn(host, agent), false)
  assert.equal(sectionOf(await agent.assemble()), undefined, 'the role is gone again at the next step')
  assert.deepEqual(sessionHealth(host, agent), { state: 'degraded', reason: CANCELLED_ON })
  assert.deepEqual(readHolder(recordFile(host)), { kind: 'none' }, 'and the session\'s read of its role deleted the record')
})

test('a /wish off whose request was cancelled leaves the session the main agent, and the health says so', async () => {
  const { host, first } = await withMainAgent()
  await cancelled(host, first, '/wish off')
  assert.equal(isOn(host, first), true)
  assert.ok(sectionOf(await first.assemble()), 'still the main agent at the next step')
  const report = sessionHealth(host, first)
  assert.equal(report?.state, 'degraded')
  assert.ok(report?.reason.includes(CANCELLED_OFF), report?.reason)
})

test('the projection folds /wish: success turns it on, an error does not, off turns it off, a fork inherits it, a pointer reply does not turn it on', async () => {
  const { host } = open()
  const first = host.addAgent('s1')
  await type(host, first, `/wish ${'愿'.repeat(MAX_WISH_LENGTH + 1)}`)
  assert.equal(isOn(host, first), false, 'an error leaves it off')
  await type(host, first, '/wish')
  assert.equal(isOn(host, first), true)
  const lastRun = first.session.events.filter(event => event.type === 'command/run').at(-1)?.data as { commandId: string }
  assert.equal((projectionOf(host, first) as { settled: string }).settled, lastRun.commandId)
  const fork = host.addAgent('fork', { inheritFrom: first })
  assert.equal(isOn(host, fork), true, 'a fork starts as the session it was forked from')
  const second = host.addAgent('s2')
  assert.ok((await type(host, second, '/wish')).text.startsWith(ROLE_UNCHANGED_MARK))
  assert.equal(isOn(host, second), false, 'the pointer reply did not turn it on')
  await type(host, first, '/wish off')
  assert.equal(isOn(host, first), false)
})

// ---------------------------------------------------------------- one main agent per project

test('a second session in the project is told where the main agent is and stays what it was', async () => {
  const { host } = open({ persistence: true })
  const first = host.addAgent('s1')
  await type(host, first, '/wish')
  first.session.append('session/title', { title: '记账小工具' })
  const second = host.addAgent('s2')
  const reply = await type(host, second, '/wish')
  assert.equal(reply.kind, 'success')
  assert.match(reply.text, /^这个项目的主 Agent 在另一个会话里（\d+月\d+日 \d\d:\d\d 开始，会话「记账小工具」，id s1）。要把它移到这里，输入 \/wish here，那个会话会变回普通会话。$/)
  const withWish = await type(host, second, '/wish 记一笔账')
  assert.ok(withWish.text.endsWith('要把它移到这里并交给它这句话，输入 /wish here 加这句话，那个会话会变回普通会话。'))
  assert.deepEqual(second.sent, [])
  const face = await second.assemble({ tools: FACE })
  assert.equal(sectionOf(face), undefined)
  assert.deepEqual(toolNames(face), FACE.map(entry => entry.name), 'the tool face is the ordinary one')
  const holder = readHolder(recordFile(host))
  assert.ok(holder.kind === 'held' && holder.record.sessionId === 's1')
  assert.equal(host.executed.length, 0)
})

test('a main agent session that is stored but not open is named, with the note that it is not open', async () => {
  const { host } = open({ persistence: true })
  const first = host.addAgent('s1')
  await type(host, first, '/wish')
  host.agents.delete('s1')
  host.stored.push('s1')
  const reply = await type(host, host.addAgent('s2'), '/wish')
  assert.match(reply.text, /^这个项目的主 Agent 在另一个会话里（.*会话 id s1；现在没有打开）。/)
})

test('without the persistence service, or when it fails, the holder session is taken to be still stored', async () => {
  for (const break_ of [false, true]) {
    const { host } = open()
    const first = host.addAgent('s1')
    await type(host, first, '/wish')
    host.agents.delete('s1')
    if (break_) host.services.set('sessionPersistence', { list: () => Promise.reject(new Error('disk')) })
    const reply = await type(host, host.addAgent('s2'), '/wish')
    assert.ok(reply.text.startsWith('这个项目的主 Agent 在另一个会话里'), reply.text)
    assert.ok(reply.text.includes('现在没有打开'), reply.text)
  }
})

test('a holder session that is neither open nor stored is taken over, and the reply says the old one is gone', async () => {
  const { host } = open({ persistence: true })
  const first = host.addAgent('s1')
  await type(host, first, '/wish')
  host.agents.delete('s1')
  const second = host.addAgent('s2')
  const reply = await type(host, second, '/wish 记一笔账')
  assert.ok(reply.text.startsWith('原来的主 Agent 会话已经不在了，已让这个会话的 agent 当主 Agent'), reply.text)
  assert.ok(reply.text.endsWith(`已把你的愿望交给它。${STRONG_MODEL_NOTE}`))
  const holder = readHolder(recordFile(host))
  assert.ok(holder.kind === 'held' && holder.record.sessionId === 's2')
  assert.ok(sectionOf(await second.assemble()))
})

test('/wish here moves the role: the record changes hands, the open session gets /wish off as the person would type it, and both sessions\' sections follow', async () => {
  const { host, first, second } = await withMainAgent()
  const reply = await type(host, second, '/wish here')
  assert.equal(reply.text, `主 Agent 已从另一个会话移到这里；那个会话变回普通会话。那个会话派出去还在跑的子 agent 从现在起按普通会话的规矩。已让这个会话的 agent 当主 Agent（项目经理）：它按项目图推进，不写文件；/wish off 退出。${STRONG_MODEL_NOTE}`)
  assert.deepEqual(host.executed, [{ agentId: 's1', line: '/wish off' }])
  const holder = readHolder(recordFile(host))
  assert.ok(holder.kind === 'held' && holder.record.sessionId === 's2')
  assert.equal(isOn(host, first), false)
  assert.equal(isOn(host, second), true)
  assert.equal(sectionOf(await first.assemble({ tools: FACE })), undefined)
  assert.ok(toolNames(await first.assemble({ tools: FACE })).includes('write'), 'the old session has its write tool back')
  assert.ok(sectionOf(await second.assemble()))
  const told = first.sent.at(-1)
  assert.equal(told?.via, 'inject')
  assert.ok(told?.message.content[0]?.text.includes('moved to another session'))
  assert.equal((await type(host, first, '/wish off')).text, '这个会话本来就不是主 Agent', 'the old session\'s own /wish off changes nothing now')
  assert.equal(readHolder(recordFile(host)).kind, 'held', 'and does not delete the new holder\'s record')
})

test('/wish here with a sentence moves the role and starts from the wish', async () => {
  const { host, second } = await withMainAgent()
  const reply = await type(host, second, '/wish here 记一笔账')
  assert.ok(reply.text.startsWith('主 Agent 已从另一个会话移到这里；'))
  assert.ok(reply.text.endsWith(`已把你的愿望交给它。${STRONG_MODEL_NOTE}`))
  assert.deepEqual(second.sent.map(entry => entry.via), ['followup'])
  assert.ok(sectionOf(await second.woken!), 'the woken turn has the section')
})

test('/wish here in a project with no main agent is a plain /wish', async () => {
  const { host } = open()
  const agent = host.addAgent('s1')
  const reply = await type(host, agent, '/wish here')
  assert.ok(reply.text.startsWith('已让这个会话的 agent 当主 Agent'))
  assert.equal(host.executed.length, 0)
})

test('two projects, two main agents: a session in another workspace is not the holder\'s business', async () => {
  const { host } = open()
  const first = host.addAgent('s1')
  const other = host.addAgent('o1', { workspace: 'other' })
  await type(host, first, '/wish')
  assert.ok((await type(host, other, '/wish')).text.startsWith('已让这个会话的 agent 当主 Agent'))
  await type(host, other, '/wish here')
  assert.equal(isOn(host, first), true, 'moving the role in one project leaves the other\'s')
  assert.deepEqual(host.executed, [])
})

test('a record that cannot be written stops /wish: an error, no pending state, no mode', async () => {
  const { host } = open()
  const agent = host.addAgent('s1')
  mkdirSync(host.userHome, { recursive: true })
  writeFileSync(join(host.userHome, 'main-agent'), 'a file where the directory should be')
  const reply = await type(host, agent, '/wish')
  assert.equal(reply.kind, 'error')
  assert.ok(reply.text.startsWith('主 Agent 的持有者记录写不了：'), reply.text)
  assert.equal(isOn(host, agent), false)
  assert.deepEqual(agent.sent, [])
  assert.equal(sectionOf(await agent.assemble()), undefined)
})

test('an unreadable record: the projection decides and the health says to send /wish again; /wish takes the record over and moves the role off the others', async () => {
  const { host } = open()
  const first = host.addAgent('s1')
  const second = host.addAgent('s2')
  await type(host, first, '/wish')
  writeFileSync(recordFile(host), '{not json')
  assert.ok(sectionOf(await first.assemble()), 'by the projection alone, still the main agent')
  const degraded = sessionHealth(host, first)
  assert.equal(degraded?.state, 'degraded', 'the later "in effect" report does not cover the problem')
  assert.ok(degraded?.reason.startsWith('主 Agent 的持有者记录读不到（'))
  assert.ok(degraded?.reason.endsWith('）：在主 Agent 会话里再发一次 /wish'))
  const reply = await type(host, second, '/wish')
  assert.ok(reply.text.startsWith('原来的主 Agent 记录读不到（'), reply.text)
  assert.ok(reply.text.includes('），已改为这个会话；已让这个会话的 agent 当主 Agent'))
  assert.deepEqual(host.executed, [{ agentId: 's1', line: '/wish off' }], 'the other session was moved off the role')
  const holder = readHolder(recordFile(host))
  assert.ok(holder.kind === 'held' && holder.record.sessionId === 's2')
  assert.equal(sectionOf(await first.assemble()), undefined)
  assert.equal(sessionHealth(host, first)?.state, 'inactive')
})

test('a record that is gone while the projection is on: still the main agent by the projection, the health says there is no record', async () => {
  const { host } = open()
  const agent = host.addAgent('s1')
  await type(host, agent, '/wish')
  rmSync(recordFile(host))
  assert.ok(sectionOf(await agent.assemble()))
  assert.deepEqual(sessionHealth(host, agent), { state: 'degraded', reason: '主 Agent 的持有者记录读不到（没有记录）：在主 Agent 会话里再发一次 /wish' })
  await type(host, agent, '/wish')
  assert.equal(readHolder(recordFile(host)).kind, 'held', 'a second /wish writes the record again')
  assert.ok(sectionOf(await agent.assemble()))
  assert.equal(sessionHealth(host, agent)?.state, 'active')
})

test('a session whose graph directory is unknown is the main agent by its projection alone', async () => {
  const { host } = open()
  const agent = host.addAgent('s1')
  await type(host, agent, '/wish')
  host.services.delete('glmHournessGraph')
  const lone = host.addAgent('s3', { inheritFrom: agent })
  assert.ok(sectionOf(await lone.assemble()) === undefined, 'no installed hooks yet')
  await host.created(lone)
  assert.ok(sectionOf(await lone.assemble()), 'with no way to find the project there is no record to disagree')
  assert.equal(sessionHealth(host, lone)?.state, 'active')
})

// ---------------------------------------------------------------- a record that outlives its session's mode

const lostRun = { commandId: 'lost', name: 'wish', args: '', source: { kind: 'user' } }
const recordOf = (host: DesignHost, sessionId: string, workspace = 'ws'): Parameters<typeof claimHolder>[1] => ({ version: 1, sessionId, graphDir: graphDirOf(host, workspace), since: new Date().toISOString(), commandId: 'lost' })

/** Run `body` with the deletion of any record file failing, as an antivirus scanner holding the file does on Windows. */
async function whileRecordsCannotBeDeleted<T>(body: () => Promise<T>): Promise<T> {
  const fs = createRequire(import.meta.url)('node:fs') as { unlinkSync: (path: string) => void }
  const original = fs.unlinkSync
  fs.unlinkSync = (path) => {
    if (String(path).endsWith('.json')) throw new Error('EPERM: held by another program')
    original(path)
  }
  syncBuiltinESMExports()
  try {
    return await body()
  }
  finally {
    fs.unlinkSync = original
    syncBuiltinESMExports()
  }
}

/** Run `body` with the deletion of any temporary holder file failing, the way the same scanner holds the freshly written `.tmp`. */
async function whileTempUnlinkFails<T>(body: () => Promise<T>): Promise<T> {
  const fs = createRequire(import.meta.url)('node:fs') as { unlinkSync: (path: string) => void }
  const original = fs.unlinkSync
  fs.unlinkSync = (path) => {
    if (String(path).endsWith('.tmp')) throw new Error('EPERM: held by another program')
    original(path)
  }
  syncBuiltinESMExports()
  try {
    return await body()
  }
  finally {
    fs.unlinkSync = original
    syncBuiltinESMExports()
  }
}

/** The `agents` service with a registry that cannot be walked, so demoteOthers throws after the record was written. */
const brokenRegistry = { get: () => undefined, roots: () => { throw new Error('registry is down') } }

/** Poll until the holder record names `id`, so a concurrent /wish starts only once the other's write has landed. */
async function waitForRecord(host: DesignHost, id: string): Promise<void> {
  for (let attempt = 0; attempt < 200 && holderOf(host) !== id; attempt++) await tick()
  assert.equal(holderOf(host), id)
}

/** Hold the /wish off lines the row runs itself (`when` picks them by count) until the returned function lets them run. */
function holdWishOffs(host: DesignHost, when: (count: number) => boolean): () => void {
  let release: () => void = () => undefined
  const held = new Promise<void>(resolve => { release = resolve })
  const execute = host.ctx.commands.execute.bind(host.ctx.commands)
  let offs = 0
  ;(host.ctx.commands as { execute: typeof execute }).execute = (agent, line, attachments, signal) => line === '/wish off' && when(offs++) ? held.then(() => execute(agent, line, attachments, signal)) : execute(agent, line, attachments, signal)
  return release
}

test('a plain /wish in another session does not steal the role while a /wish here is still moving it: it is pointed, and the mover finishes (S3-1 R3)', async () => {
  const { host } = open()
  const holder = host.addAgent('s0')
  const mover = host.addAgent('s1')
  const comer = host.addAgent('s2')
  await type(host, holder, '/wish')
  // Hold every /wish off the row runs itself, so the mover's handler stays inside demoteOthers.
  const release = holdWishOffs(host, () => true)
  const moving = type(host, mover, '/wish here')
  await waitForRecord(host, 's1')
  await tick()
  const reply = await type(host, comer, '/wish')
  assert.ok(reply.text.startsWith(ROLE_UNCHANGED_MARK), reply.text)
  assert.equal(holderOf(host), 's1', 'the record still names the mover')
  release()
  const moved = await moving
  assert.ok(moved.text.startsWith('主 Agent 已从另一个会话移到这里'), moved.text)
  assert.equal(holderOf(host), 's1')
  assert.equal(isOn(host, mover), true)
})

test('the loser\'s demoteOthers skips the session the record names: a /wish here that completes during another one\'s demote wait keeps the role (S3-1 R3)', async () => {
  const { host } = open()
  const holder = host.addAgent('s0')
  const first = host.addAgent('s1')
  const second = host.addAgent('s2')
  await type(host, holder, '/wish')
  // The first /wish off the row runs itself is held, so the first mover waits inside demoteOthers; the later ones run.
  const release = holdWishOffs(host, count => count === 0)
  const slow = type(host, first, '/wish here')
  await waitForRecord(host, 's1')
  const quickReply = await type(host, second, '/wish here')
  assert.ok(quickReply.text.startsWith('主 Agent 已从另一个会话移到这里'), quickReply.text)
  assert.equal(holderOf(host), 's2')
  release()
  const slowReply = await slow
  assert.equal(slowReply.kind, 'error', slowReply.text)
  assert.equal(holderOf(host), 's2', 'the winner kept the record')
  assert.equal(isOn(host, second), true)
})

test('a temp-file cleanup that fails does not fail the /wish: the claim stands and the mode comes on (S3-3, S3-1 R1)', async () => {
  const { host } = open()
  const agent = host.addAgent('s1')
  await whileTempUnlinkFails(async () => {
    const reply = await type(host, agent, '/wish')
    assert.equal(reply.kind, 'success')
  })
  assert.equal(holderOf(host), 's1')
  assert.equal(isOn(host, agent), true)
})

/** A project whose holder is the main agent, and a mover whose /wish here fails in demoteOthers because the registry cannot be walked. */
async function moverWithBrokenRegistry(): Promise<{ readonly host: DesignHost, readonly holder: FakeAgent, readonly mover: FakeAgent }> {
  const { host } = open()
  const holder = host.addAgent('s0')
  const mover = host.addAgent('s1')
  await type(host, holder, '/wish')
  host.services.set('agents', brokenRegistry)
  return { host, holder, mover }
}

test('a /wish here that errors after it wrote the record releases it: no record naming a session whose mode is off (S3-1 R1)', async () => {
  const { host, mover } = await moverWithBrokenRegistry()
  const reply = await type(host, mover, '/wish here')
  assert.equal(reply.kind, 'error')
  assert.ok(reply.text.startsWith('主 Agent 的持有者记录写不了：'), reply.text)
  assert.ok(reply.text.includes('registry is down'), reply.text)
  assert.equal(holderOf(host), undefined, 'the record was released')
  assert.equal(isOn(host, mover), false)
})

test('a record that cannot be released after the error is reported in the mover\'s health (S3-1 R1)', async () => {
  const { host, mover } = await moverWithBrokenRegistry()
  await whileRecordsCannotBeDeleted(async () => {
    const reply = await type(host, mover, '/wish here')
    assert.equal(reply.kind, 'error')
  })
  assert.equal(holderOf(host), 's1', 'the record could not be deleted')
  const health = sessionHealth(host, mover)
  assert.equal(health?.state, 'degraded')
  assert.ok(health?.reason.startsWith('主 Agent 的持有者记录没能清掉（'), health?.reason)
  // The person's way out is unchanged: /wish off in that session deletes the record.
  host.services.delete('agents')
  assert.deepEqual(await type(host, mover, '/wish off'), { kind: 'success', text: '这个会话本来就不是主 Agent' })
  assert.equal(holderOf(host), undefined)
})

test('after a cancelled /wish the project has no main agent for mainAgentOf, and another session\'s /wish becomes it without a pointer reply', async () => {
  const { host } = open()
  const first = host.addAgent('s1')
  const second = host.addAgent('s2')
  await cancelled(host, first)
  await first.assemble()
  assert.equal(holderOf(host), undefined)
  const reply = await type(host, second, '/wish')
  assert.ok(reply.text.startsWith('已让这个会话的 agent 当主 Agent'), reply.text)
  assert.equal(holderOf(host), 's2')
  assert.equal(isOn(host, second), true)
})

test('a /wish off right after a cancelled /wish also leaves no record behind, and the health still says the /wish was cancelled', async () => {
  const { host } = open()
  const first = host.addAgent('s1')
  await cancelled(host, first)
  assert.deepEqual(await type(host, first, '/wish off'), { kind: 'success', text: '这个会话本来就不是主 Agent' })
  assert.equal(holderOf(host), undefined)
  assert.deepEqual(sessionHealth(host, first), { state: 'degraded', reason: CANCELLED_ON })
})

test('a cancelled /wish whose session has not read its role yet: another session\'s /wish takes the stale record over, and the cancelled session still says so', async () => {
  const { host } = open()
  const first = host.addAgent('s1')
  const second = host.addAgent('s2')
  await cancelled(host, first)
  assert.equal(holderOf(host), 's1')
  const reply = await type(host, second, '/wish 记一笔账')
  assert.ok(reply.text.startsWith('原来记的主 Agent 会话其实没有开着主 Agent 模式，已让这个会话的 agent 当主 Agent'), reply.text)
  assert.ok(reply.text.endsWith(`已把你的愿望交给它。${STRONG_MODEL_NOTE}`))
  assert.equal(holderOf(host), 's2')
  assert.ok(sectionOf(await second.woken!), 'the woken turn has the section')
  assert.equal(sectionOf(await first.assemble()), undefined)
  assert.deepEqual(sessionHealth(host, first), { state: 'degraded', reason: CANCELLED_ON }, 'looking at the session did not settle its cancelled /wish')
  assert.equal(holderOf(host), 's2', 'and the cancelled session\'s own read did not delete the new holder\'s record')
  assert.deepEqual(host.executed, [], 'nobody had to be told to leave')
})

test('a record that names an open session with no /wish in its log is stale: the next /wish takes it over', async () => {
  const { host } = open()
  host.addAgent('s1')
  const second = host.addAgent('s2')
  claimHolder(recordFile(host), recordOf(host, 's1'))
  const reply = await type(host, second, '/wish')
  assert.ok(reply.text.startsWith('原来记的主 Agent 会话其实没有开着主 Agent 模式，'), reply.text)
  assert.equal(holderOf(host), 's2')
})

test('a session that sends /wish again after a cancelled one keeps the record it claimed and becomes the main agent', async () => {
  const { host } = open()
  const first = host.addAgent('s1')
  await cancelled(host, first)
  const reply = await type(host, first, '/wish')
  assert.ok(reply.text.startsWith('已让这个会话的 agent 当主 Agent'), reply.text)
  assert.equal(holderOf(host), 's1')
  assert.ok(sectionOf(await first.assemble()))
  assert.deepEqual(sessionHealth(host, first), { state: 'active', reason: MAIN_AGENT_ACTIVE }, 'the new /wish replaced the cancelled one')
  assert.equal(holderOf(host), 's1')
})

test('a session reopened after a crash cut off its /wish (a record that names it, no command/done in its log) has the record deleted at creation', async () => {
  const { host } = open()
  const crashed = host.addAgent('s1')
  crashed.session.append('command/run', lostRun)
  claimHolder(recordFile(host), recordOf(host, 's1'))
  await host.created(crashed)
  assert.deepEqual(readHolder(recordFile(host)), { kind: 'none' })
  assert.deepEqual(sessionHealth(host, crashed), undefined)

  const intact = open().host
  const holder = intact.addAgent('s1')
  await type(intact, holder, '/wish')
  await intact.created(holder)
  assert.equal(holderOf(intact), 's1', 'a main agent whose /wish finished keeps its record')
  assert.deepEqual(intact.executed, [])
})

test('the record is not deleted at creation when the mode of the session cannot be known', async () => {
  const noService = open({ projections: false }).host
  const waiting = noService.addAgent('s1')
  claimHolder(recordFile(noService), recordOf(noService, 's1'))
  await noService.created(waiting)
  assert.equal(holderOf(noService), 's1', 'no session state service')

  const { host } = open()
  const agent = host.addAgent('s1')
  await type(host, agent, '/wish')
  host.projections.stateOf = () => { throw new Error('log unreadable') }
  await host.created(agent)
  assert.equal(holderOf(host), 's1', 'a state that cannot be read')
})

test('a stale record that cannot be deleted stays, the health of the session says how to try again, and /wish off deletes it later', async () => {
  const { host } = open()
  const first = host.addAgent('s1')
  await cancelled(host, first)
  await whileRecordsCannotBeDeleted(() => first.assemble())
  const stuck = staleRecordKept('EPERM: held by another program')
  assert.deepEqual(sessionHealth(host, first), { state: 'degraded', reason: `${CANCELLED_ON}；${stuck}` })
  assert.equal(holderOf(host), 's1')
  assert.deepEqual(await type(host, first, '/wish off'), { kind: 'success', text: '这个会话本来就不是主 Agent' })
  assert.equal(holderOf(host), undefined)

  const crashed = host.addAgent('s9', { workspace: 'other' })
  crashed.session.append('command/run', lostRun)
  claimHolder(recordFile(host, 'other'), recordOf(host, 's9', 'other'))
  await whileRecordsCannotBeDeleted(() => host.created(crashed))
  assert.deepEqual(sessionHealth(host, crashed), { state: 'degraded', reason: stuck })
  assert.equal(holderOf(host, 'other'), 's9')
})

// ---------------------------------------------------------------- a session that lost the role while it was away

test('a fork of the main agent session is an ordinary session at once, and turns its projection off at its first idle, not inside agent/created', async () => {
  const { host, first, fork } = await withFork()
  assert.equal(isOn(host, fork), true, 'the fork inherited the command events')
  await host.created(fork)
  assert.deepEqual(host.executed, [], '/wish off is not run inside the agent/created listener')
  assert.equal(sectionOf(await fork.assemble({ tools: FACE })), undefined, 'by the record it is not the main agent')
  assert.ok(toolNames(await fork.assemble({ tools: FACE })).includes('write'))
  fork.becomeIdle()
  await tick()
  assert.deepEqual(host.executed, [{ agentId: 'fork', line: '/wish off' }])
  assert.equal(isOn(host, fork), false)
  assert.equal(isOn(host, first), true)
  const holder = readHolder(recordFile(host))
  assert.ok(holder.kind === 'held' && holder.record.sessionId === 's1')
})

test('a session reopened after the role moved on is aligned the same way', async () => {
  const { host } = open()
  const first = host.addAgent('s1')
  const second = host.addAgent('s2')
  await type(host, first, '/wish')
  host.agents.delete('s1')
  await type(host, second, '/wish here')
  assert.deepEqual(host.executed, [], 'a session that is not open cannot be told')
  const reopened = host.addAgent('s1', { inheritFrom: first })
  await host.created(reopened)
  await tick()
  assert.deepEqual(host.executed, [{ agentId: 's1', line: '/wish off' }])
  assert.equal(isOn(host, reopened), false)
})

test('an agent/created for a session that is the holder, a plain session or a child does nothing', async () => {
  const { host } = open()
  const first = host.addAgent('s1')
  await type(host, first, '/wish')
  const plain = host.addAgent('plain')
  const child = host.addAgent('child', { origin: 'subagent', parentSession: 's1', inheritFrom: first })
  await host.created(first)
  await host.created(plain)
  await host.created(child)
  await tick()
  assert.deepEqual(host.executed, [])
})

test('if the role came back to the forked session before its first idle, it is left alone', async () => {
  const { host, fork } = await withFork()
  await host.created(fork)
  replaceHolder(recordFile(host), { version: 1, sessionId: 'fork', graphDir: graphDirOf(host), since: new Date().toISOString(), commandId: 'cmd-x' })
  fork.becomeIdle()
  await tick()
  assert.deepEqual(host.executed, [])
  assert.equal(isOn(host, fork), true)
})

test('a /wish off that cannot be run is warned once and shown in that session\'s health', async () => {
  const { host } = open()
  const first = host.addAgent('s1')
  await type(host, first, '/wish')
  const { warnings } = await captureWarnings(async () => {
    for (const [id, failure] of [['f1', 'undefined'], ['f2', 'throw']] as const) {
      const fork = host.addAgent(id, { inheritFrom: first })
      host.failExecute(id, failure)
      await host.created(fork)
      await tick()
    }
  })
  assert.equal(warnings.length, 1, 'once')
  assert.ok(warnings[0]?.includes('没能让会话 f1 退出主 Agent：/wish 在那个会话里没有注册'))
  const unresolved = healthView(host).session('f1')
  const thrown = healthView(host).session('f2')
  assert.deepEqual([unresolved?.state, unresolved?.reason], ['degraded', '没能让会话 f1 退出主 Agent：/wish 在那个会话里没有注册'])
  assert.deepEqual([thrown?.state, thrown?.reason], ['degraded', '没能让会话 f2 退出主 Agent：agent released'])
  saidToPerson.push(unresolved?.reason ?? '', thrown?.reason ?? '')
})

test('claiming a project twice at once: while the first session\'s /wish is still settling, the second session is pointed to it', async () => {
  const { host } = open()
  const first = host.addAgent('s1')
  const second = host.addAgent('s2')
  let settle = (): void => {}
  const hold = new Promise<void>((resolve) => { settle = resolve })
  // The first /wish has claimed the record and set its pending state; command/done has not landed.
  const claiming = host.execute(first, '/wish', hold)
  await tick()
  assert.equal(holderOf(host), 's1')
  assert.ok((await type(host, second, '/wish')).text.startsWith('这个项目的主 Agent 在另一个会话里'))
  assert.equal(isOn(host, second), false)
  assert.equal(holderOf(host), 's1')
  settle()
  await claiming
  assert.equal(isOn(host, first), true)
  assert.equal(holderOf(host), 's1')
})

test('/wish puts the hooks on a main agent session that was open before the row loaded, even though it is the main agent already', async () => {
  const { host } = open()
  const agent = host.addAgent('s1')
  // The session did /wish earlier (its log says so, the record names it), but this row instance has never seen the agent.
  agent.session.append('command/run', { commandId: 'earlier', name: 'wish', args: '', source: { kind: 'user' } })
  agent.session.append('command/done', { commandId: 'earlier', kind: 'success', text: '' })
  claimHolder(recordFile(host), { version: 1, sessionId: 's1', graphDir: graphDirOf(host), since: new Date().toISOString(), commandId: 'earlier' })
  assert.equal(isOn(host, agent), true)
  assert.equal(sectionOf(await agent.assemble()), undefined, 'no hooks yet')
  assert.equal((await type(host, agent, '/wish')).text, '这个会话已经是主 Agent')
  assert.ok(sectionOf(await agent.assemble()), 'the second /wish put the hooks on')
  assert.equal(agent.listeners.length, 2)
  assert.deepEqual(agent.sent, [], 'and sent nothing')
})

test('the hooks are installed once per agent, whether agent/created or /wish comes first', async () => {
  const { host } = open()
  const created = host.addAgent('s1')
  await host.created(created)
  await type(host, created, '/wish')
  await host.created(created)
  assert.equal(created.listeners.length, 2)
  const wished = host.addAgent('s2', { workspace: 'other' })
  await type(host, wished, '/wish')
  await host.created(wished)
  assert.equal(wished.listeners.length, 2)
})

// ---------------------------------------------------------------- the tool face

test('the main agent\'s tools: no write, no edit, no ask_user_question, ZCode names included; an ordinary session\'s tools are untouched', async () => {
  for (const withDialect of [false, true]) {
    const { host } = open(withDialect ? { dialect: { claims: () => true, nativeOf: (name: string) => name === 'AskUserQuestion' ? 'ask_user_question' : undefined, faceName: (native: string) => native } } : {})
    const plain = host.addAgent('plain', { workspace: 'other' })
    await host.created(plain)
    const ordinary = await plain.assemble({ tools: FACE })
    assert.deepEqual(toolNames(ordinary), FACE.map(entry => entry.name))
    assert.deepEqual(ordinary.tools, [...FACE], 'not even a copy is made')
    assert.equal(sessionHealth(host, plain), undefined)

    const agent = host.addAgent('s1')
    await type(host, agent, '/wish')
    const names = toolNames(await agent.assemble({ tools: FACE }))
    for (const gone of ['Write', 'Edit', 'write', 'edit', 'ask_user_question']) assert.ok(!names.includes(gone), `${gone} (dialect ${withDialect})`)
    assert.equal(names.includes('AskUserQuestion'), withDialect ? false : true, withDialect ? 'a dialect alias of ask_user_question goes too' : 'without a dialect only the native name is known')
    for (const kept of ['read', 'pwsh', 'graph_show', 'Bash', 'str_replace_editor']) assert.ok(names.includes(kept), kept)
  }
})

test('str_replace_editor stays with its command cut to view, without changing the tool object the assembly came with', async () => {
  const { host } = open()
  const agent = host.addAgent('s1')
  const before = JSON.stringify(FACE)
  await type(host, agent, '/wish')
  const editor = (await agent.assemble({ tools: FACE })).tools.find(entry => entry.name === 'str_replace_editor')
  const properties = editor?.parameters.properties as { command: { enum: string[], type: string }, path: unknown }
  assert.deepEqual(properties.command, { type: 'string', enum: ['view'] })
  assert.deepEqual(properties.path, { type: 'string' })
  assert.deepEqual(editor?.parameters.required, ['command', 'path'])
  assert.equal(JSON.stringify(FACE), before)
})

test('a str_replace_editor whose schema is not known is taken off the face and the health says so, and the later "in effect" does not cover it', async () => {
  const { host } = open()
  const agent = host.addAgent('s1')
  await type(host, agent, '/wish')
  for (const shape of [{ type: 'object', properties: {} }, { type: 'object', properties: { command: { type: 'string' } } }, { type: 'object' }]) {
    const assembled = await agent.assemble({ tools: [tool('read'), tool('str_replace_editor', shape)] })
    assert.deepEqual(toolNames(assembled), ['read'], JSON.stringify(shape))
    assert.deepEqual(sessionHealth(host, agent), { state: 'degraded', reason: STR_REPLACE_EDITOR_UNKNOWN })
  }
  await agent.assemble({ tools: FACE })
  assert.equal(sessionHealth(host, agent)?.state, 'active', 'a known shape clears it again')
})

test('the tool face listener has no prepend: another row\'s prepended listener sees the trimmed face whichever of the two was installed first', async () => {
  for (const externalFirst of [true, false]) {
    const { host } = open()
    const agent = host.addAgent('s1')
    const seen: string[][] = []
    const external: AssembleListener = async (_assembly, _context, next) => {
      const out = await next()
      seen.push(toolNames(out))
      return out
    }
    if (externalFirst) listen(agent, external, true)
    await type(host, agent, '/wish')
    if (!externalFirst) listen(agent, external, true)
    await agent.assemble({ tools: FACE })
    assert.equal(seen.length, 1)
    assert.ok(!seen[0]?.includes('write') && !seen[0]?.includes('Write') && !seen[0]?.includes('ask_user_question'), `external first: ${externalFirst}`)
  }
})

// ---------------------------------------------------------------- where the section goes

test('the section goes before glm:guard when the guard\'s listener adds it after, and before it when it is already there; last without it', async () => {
  const guard = { name: 'glm:guard', text: 'rules' }
  const appendGuard: AssembleListener = async (_assembly, _context, next) => {
    const out = await next()
    return { ...out, sections: [...out.sections, guard] }
  }
  for (const guardFirst of [true, false]) {
    const { host } = open()
    const agent = host.addAgent('s1')
    if (guardFirst) listen(agent, appendGuard, true)
    await type(host, agent, '/wish')
    if (!guardFirst) listen(agent, appendGuard, true)
    const names = (await agent.assemble()).sections.map(section => section.name)
    assert.deepEqual(names, ['harness:identity', MAIN_AGENT_SECTION, 'glm:guard'], `guard installed first: ${guardFirst}`)
  }
  const { host } = open()
  const agent = host.addAgent('s1')
  await type(host, agent, '/wish')
  assert.deepEqual((await agent.assemble({ sections: [{ name: 'harness:identity', text: 'i' }, guard, { name: 'glm:memory', text: 'm' }] })).sections.map(section => section.name), ['harness:identity', MAIN_AGENT_SECTION, 'glm:guard', 'glm:memory'])
  assert.deepEqual((await agent.assemble()).sections.map(section => section.name), ['harness:identity', MAIN_AGENT_SECTION])
  assert.equal(sectionOf(await agent.assemble())?.text, MAIN_AGENT_IDENTITY(false))
})

test('a dialect that rewrites the identity section leaves the main agent section where it is', async () => {
  const { host } = open()
  const agent = host.addAgent('s1')
  await type(host, agent, '/wish')
  const rewrite: AssembleListener = async (_assembly, _context, next) => {
    const out = await next()
    return { ...out, sections: out.sections.map(section => section.name === 'harness:identity' ? { name: 'glm:identity', text: 'You are ZCode' } : section) }
  }
  listen(agent, rewrite, true)
  assert.deepEqual((await agent.assemble()).sections.map(section => section.name), ['glm:identity', MAIN_AGENT_SECTION])
})

// ---------------------------------------------------------------- row health

test('the session health follows the role: in effect while the main agent, not in effect after it stops', async () => {
  const { host } = open()
  const agent = host.addAgent('s1')
  await agent.assemble()
  assert.equal(sessionHealth(host, agent), undefined, 'an ordinary session is never reported')
  await type(host, agent, '/wish')
  await agent.assemble()
  assert.deepEqual(sessionHealth(host, agent), { state: 'active', reason: MAIN_AGENT_ACTIVE })
  await type(host, agent, '/wish off')
  await agent.assemble()
  assert.deepEqual(sessionHealth(host, agent), { state: 'inactive', reason: MAIN_AGENT_INACTIVE })
})

test('a session state that cannot be read counts as an ordinary session for that step, warned once, with the health degraded', async () => {
  const { host } = open()
  const agent = host.addAgent('s1')
  await type(host, agent, '/wish')
  assert.ok(sectionOf(await agent.assemble()))
  const read = host.projections.stateOf.bind(host.projections)
  host.projections.stateOf = () => { throw new Error('log unreadable') }
  const { result: first, warnings } = await captureWarnings(() => agent.assemble({ tools: FACE }))
  assert.equal(sectionOf(first), undefined)
  assert.ok(toolNames(first).includes('write'))
  assert.equal(warnings.length, 1)
  assert.ok(warnings[0]?.includes('log unreadable'))
  assert.deepEqual(sessionHealth(host, agent), { state: 'degraded', reason: '读不到主 Agent 的会话状态（log unreadable），这一步当作普通会话' })
  const { warnings: again } = await captureWarnings(() => agent.assemble())
  assert.deepEqual(again, [], 'once per row')
  host.projections.stateOf = read
  assert.ok(sectionOf(await agent.assemble()))
  assert.equal(sessionHealth(host, agent)?.state, 'active')
})

test('a service the role read leans on that throws does not break the step: the session counts as an ordinary one for it, warned once, health degraded', async () => {
  const { host } = open()
  const agent = host.addAgent('s1')
  await type(host, agent, '/wish')
  await agent.assemble()
  host.services.set('glmHournessGraph', { dirFor: () => { throw new Error('graph row broke') }, isGraphTool: () => false })
  const other = host.addAgent('s2', { inheritFrom: agent })
  const { result, warnings } = await captureWarnings(async () => {
    await host.created(other)
    return other.assemble({ tools: FACE })
  })
  assert.equal(sectionOf(result), undefined)
  assert.deepEqual(toolNames(result), FACE.map(entry => entry.name))
  assert.equal(warnings.length, 1, 'once per row, whichever read failed first')
  assert.ok(warnings[0]?.includes('graph row broke'))
  const report = sessionHealth(host, other)
  assert.equal(report?.state, 'degraded')
  assert.ok(report?.reason.startsWith('读不到主 Agent 的状态（graph row broke）'))
})

test('a holder record that cannot be read when an agent is created does not break creation; the session\'s health says it was not checked', async () => {
  const { host } = open()
  const agent = host.addAgent('s1')
  await type(host, agent, '/wish')
  host.services.set('glmHournessGraph', { dirFor: () => { throw new Error('graph row broke') }, isGraphTool: () => false })
  const fork = host.addAgent('fork', { inheritFrom: agent })
  const { warnings } = await captureWarnings(() => host.created(fork))
  assert.equal(warnings.length, 1)
  assert.deepEqual(sessionHealth(host, fork), { state: 'degraded', reason: '没能检查这个会话是不是还是主 Agent：graph row broke' })
  await tick()
  assert.deepEqual(host.executed, [])
})

test('a projection value of another shape is read as a failure too, not as "off" without a word', async () => {
  const { host } = open()
  const agent = host.addAgent('s1')
  await type(host, agent, '/wish')
  host.projections.stateOf = () => ({ active: 'yes' })
  const { warnings } = await captureWarnings(() => agent.assemble())
  assert.equal(warnings.length, 1)
  assert.equal(sessionHealth(host, agent)?.state, 'degraded')
})

// ---------------------------------------------------------------- what the person reads

test('everything the row says to the person is in plain words', () => {
  assert.ok(saidToPerson.length > 20, `${saidToPerson.length} texts collected`)
  const fixed = [WAITING_STATE, MAIN_AGENT_ACTIVE, MAIN_AGENT_INACTIVE, STRONG_MODEL_NOTE, CANCELLED_ON]
  for (const text of [...saidToPerson, ...fixed]) assert.deepEqual(plainWordsIn(text), [], text)
})
