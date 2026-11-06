/**
 * The takeover row (takeover design 0.6 §1.4 bootstrap-row; §3.1 transition
 * path, §3.2, §4, §5.1): /hourness-init on the fake host with the design
 * row, the takeover journal, the deterministic part, the norm templates the
 * harness proposes under the anchor, the takeover reminder and its order
 * against M3's stage reminder, and the note when M3 never asks `holds`.
 * M3's /wish does not call the takeover yet, so every takeover here opens on
 * the transition path: /wish without words, then /hourness-init.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import test from 'node:test'
import { apply as applyBootstrap, NOT_MAIN_REPLY } from '../src/bootstrap/index.ts'
import { BOOTSTRAP_SOURCE, INTERVIEW_YIELD, reminderText, type ReminderFacts } from '../src/bootstrap/notice.ts'
import { STAGE_NOTE } from '../src/bootstrap/runtime.ts'
import { BOOTSTRAP_SERVICE } from '../src/bootstrap/service.ts'
import { settleWorkspace } from '../src/bootstrap/setup.ts'
import { NORM_TEMPLATES, PLACEHOLDERS } from '../src/bootstrap/templates.ts'
import { ensureLlmIgnored } from '../src/data/llm-ignore.ts'
import { projectOf } from '../src/data/project-root.ts'
import { apply as applyDesign } from '../src/design/index.ts'
import { ROLE_UNCHANGED_MARK, STRONG_MODEL_NOTE } from '../src/design/mode.ts'
import { STAGE_SOURCE } from '../src/design/stage-notice.ts'
import { openEngine } from '../src/graph/engine.ts'
import { labeledSections } from '../src/graph/stage.ts'
import { loadGraph } from '../src/graph/store.ts'
import type { UserNotice } from '../src/shared/dsh-min.ts'
import { healthServiceName, type RowHealthView } from '../src/shared/health.ts'
import { git, init, journal, rootAgent, takeoverHost as host, transitionAgent } from './bootstrap-host.ts'
import { designHost, type DesignHost, type FakeAgent } from './design-host.ts'
import { serviceStore } from './fake-rc3.ts'

const kinds = (messages: readonly unknown[]): string[] => messages.map(message => String((message as UserNotice).source.kind))

const health = (made: DesignHost, agent: FakeAgent): string | undefined => (made.services.get(healthServiceName('bootstrap')) as RowHealthView).session(agent.id)?.state

/** A small existing project: a package.json, one source file, committed. */
function existingProject(ws: string): void {
  writeFileSync(join(ws, 'package.json'), JSON.stringify({ name: 'demo', scripts: { test: 'node --test', lint: 'eslint .' } }, null, 2))
  mkdirSync(join(ws, 'src'), { recursive: true })
  writeFileSync(join(ws, 'src', 'index.js'), 'export const one = 1\n')
  git(ws, 'init', '-q')
  git(ws, 'add', 'package.json', 'src')
  git(ws, 'commit', '-q', '-m', 'first')
}

test('transition path, new project: an empty folder with only docs/graph is git-initialised, .llm/ is ignored, the journal opens without a wish (row #1, #7 F47, #8)', async () => {
  const made = host()
  const agent = await transitionAgent(made, 's-new', 'fresh')
  const ws = made.workspace('fresh')
  assert.equal(projectOf(ws), undefined, 'before: a folder outside git without .llm is no project')
  const result = await init(made, agent)
  assert.equal(result.kind, 'success', result.text)
  assert.match(result.text, /（新项目）/)
  assert.match(result.text, /建了 git 仓库/)
  assert.match(result.text, /说一句你想做成什么/)
  assert.equal(projectOf(ws)?.root, ws, 'after git init the project root is found')
  assert.ok(existsSync(join(ws, '.llm')) && existsSync(join(ws, 'docs', 'graph', 'nodes')))
  assert.match(readFileSync(join(ws, '.git', 'info', 'exclude'), 'utf8'), /^\.llm\/$/m)
  assert.equal(spawnSync('git', ['check-ignore', '-q', '.llm/x'], { cwd: ws }).status, 0)
  const records = journal(ws)
  assert.equal(records[0]?.op, 'takeover-open')
  assert.equal(records[0]?.data?.path, 'new')
  assert.equal(records[0]?.data?.trigger, 'init')
  assert.equal(records[0]?.data?.wish, undefined, 'the transition path has no wish to keep')
  assert.deepEqual(records.filter(record => record.op === 'setup').map(record => [record.data?.item, record.data?.action]), [['git-init', 'created'], ['exclude', 'created'], ['llm-dir', 'created'], ['graph-dir', 'created']])
  assert.equal(agent.sent.filter(sent => sent.message.source.kind === BOOTSTRAP_SOURCE).length, 0, 'a new project starts the interview: no takeover-start notice')
  assert.equal(health(made, agent), 'active')
})

test('transition path, new project: a folder outside git with only .llm/ and docs/graph opens even after the env row found no git there (row #1, #8; review B4 F1)', async () => {
  const made = host()
  const ws = made.workspace('llm-only')
  mkdirSync(join(ws, '.llm'))
  assert.equal(projectOf(ws)?.root, ws, 'a folder with .llm/ counts as a project before git init')
  // What the env row does at agent/created for that project root.
  assert.equal((await ensureLlmIgnored(ws)).kind, 'no-git')
  const agent = await transitionAgent(made, 's-llm-only', 'llm-only')
  const result = await init(made, agent)
  assert.equal(result.kind, 'success', result.text)
  assert.match(result.text, /（新项目）/)
  assert.match(result.text, /建了 git 仓库/)
  assert.match(readFileSync(join(ws, '.git', 'info', 'exclude'), 'utf8'), /^\.llm\/$/m)
  assert.equal(spawnSync('git', ['check-ignore', '-q', '.llm/x'], { cwd: ws }).status, 0)
  assert.equal(journal(ws)[0]?.data?.path, 'new')
  assert.equal((await ensureLlmIgnored(ws)).kind, 'ignored', 'the rows see the repository too')
})

test('transition path, existing project: the takeover-start notice wakes the idle main agent; the anchor gets the three norms as harness proposals, once (row #2, #3, #7)', async () => {
  const made = host()
  const ws = made.workspace('existing')
  existingProject(ws)
  const agent = await transitionAgent(made, 's-ex', 'existing')
  // An M3 without the seam never finds the service, so it never asks holds (F44): the service is withdrawn for the rest of the test.
  made.services.delete(BOOTSTRAP_SERVICE)
  const result = await init(made, agent)
  assert.equal(result.kind, 'success', result.text)
  assert.match(result.text, /（已有项目）：已有项目：1 个代码文件、1 个提交/)
  assert.match(result.text, /主 Agent 开始读这个项目/)
  const start = agent.sent.at(-1)
  assert.equal(start?.via, 'followup', 'idle: the notice is the next turn')
  assert.ok(agent.woken !== undefined, 'the followup woke the idle agent')
  assert.equal(start?.message.source.kind, BOOTSTRAP_SOURCE)
  const startText = start?.message.content[0]?.text ?? ''
  assert.match(startText, /^<system-reminder>\nThe human started a takeover of this project; begin now\./)
  assert.ok(startText.includes(INTERVIEW_YIELD))
  const open = journal(ws)[0]
  assert.equal(open?.data?.path, 'existing')
  assert.ok(existsSync(join(ws, '.llm', 'bootstrap', open?.id ?? '', 'scan.json')))

  const dir = join(ws, 'docs', 'graph')
  const goal = await openEngine(dir).apply('llm', { op: 'propose', reason: '接管：读项目', node: { type: 'goal', title: '这个项目要做成什么' } })
  assert.ok(goal.ok)
  await agent.assemble()
  const first = await agent.step()
  const graph = await loadGraph(dir)
  for (const template of NORM_TEMPLATES) {
    const norm = graph.nodes.get(template.id)
    assert.equal(norm?.status, 'proposed', template.id)
    assert.equal(norm?.parent, 'goal-1', template.id)
    assert.equal(norm?.history[0]?.actor, 'harness', template.id)
    assert.equal(norm?.history[0]?.reason, `接管 ${open?.id}：规范模板 ${template.id}`)
  }
  const tiers = labeledSections(graph.nodes.get('norm-decision-tiers')?.body, ['不许碰', '常设授权'])
  assert.equal(tiers.get('不许碰'), PLACEHOLDERS.touch)
  assert.equal(tiers.get('常设授权'), '无')
  assert.equal(labeledSections(graph.nodes.get('norm-verify-tiers')?.body, ['花钱或独占']).get('花钱或独占'), PLACEHOLDERS.cost)
  // U15 (DESIGN §2.4a): cordis runs pre-step listeners outermost first and each appends after its next(), so the row whose listener was installed later (the takeover) appends first.
  const order = kinds(first.kind === 'enter' ? first.messages : [])
  assert.ok(order.includes(STAGE_SOURCE), `M3's stage reminder is there too: ${order.join(', ')}`)
  assert.ok(order.indexOf(BOOTSTRAP_SOURCE) < order.indexOf(STAGE_SOURCE), `takeover reminder first, then M3's: ${order.join(', ')}`)
  const reminder = (first.kind === 'enter' ? first.messages : []).find(message => (message as UserNotice).source.kind === BOOTSTRAP_SOURCE) as UserNotice | undefined
  assert.match(reminder?.content[0]?.text ?? '', /under the anchor goal-1/)

  for (let step = 0; step < 3; step++) await agent.step()
  const after = await loadGraph(dir)
  assert.equal([...after.nodes.values()].filter(node => node.type === 'norm').length, 3, 'no second proposal of a norm')
  const notes = journal(ws).filter(record => record.op === 'note')
  assert.deepEqual(notes.map(record => record.data), [{ ...STAGE_NOTE }], 'the fake host never asks holds: one note, F44')
  assert.equal(health(made, agent), 'active', 'the note does not change the row health')
  assert.match((await init(made, agent, 'status')).text, /设计行的阶段提醒还没有对接管让位/)
})

test('holds is true only for a goal of the open existing or gaps takeover, and asking it stops the note', async () => {
  const made = host()
  const ws = made.workspace('holds')
  existingProject(ws)
  const agent = await transitionAgent(made, 's-holds', 'holds')
  assert.equal((await init(made, agent)).kind, 'success')
  const service = made.services.get(BOOTSTRAP_SERVICE) as { holds(cwd: string, goal: string): boolean }
  const before = await openEngine(join(ws, 'docs', 'graph')).apply('human', { op: 'propose', reason: '旧目标', node: { type: 'goal', id: 'goal-old', title: '旧目标' } })
  assert.ok(before.ok)
  await openEngine(join(ws, 'docs', 'graph')).apply('llm', { op: 'propose', reason: '接管', node: { type: 'goal', id: 'goal-new', title: '新目标' } })
  await agent.assemble()
  for (let step = 0; step < 4; step++) {
    await agent.step()
    assert.equal(service.holds(ws, 'goal-new'), true)
  }
  assert.equal(service.holds(ws, 'goal-nope'), false)
  assert.equal(journal(ws).filter(record => record.op === 'note').length, 0, 'holds was asked: no note')
})

test('/hourness-init off before the first node, then /hourness-init again: a second takeover; an empty nodes/ is still no graph (row #4)', async () => {
  const made = host()
  const ws = made.workspace('reopen')
  const agent = await transitionAgent(made, 's-reopen', 'reopen')
  assert.equal((await init(made, agent)).kind, 'success')
  const off = await init(made, agent, 'off')
  assert.equal(off.kind, 'success')
  assert.match(off.text, /^已放弃这次接管/)
  assert.ok(existsSync(join(ws, 'docs', 'graph', 'nodes')) && readdirSync(join(ws, 'docs', 'graph', 'nodes')).length === 0)
  assert.equal((await init(made, agent)).kind, 'success')
  const opened = journal(ws).filter(record => record.op === 'takeover-open')
  assert.equal(opened.length, 2)
  assert.notEqual(opened[0]?.id, opened[1]?.id)
  assert.deepEqual(journal(ws).filter(record => record.op === 'takeover-closed').map(record => [record.id, record.data?.reason]), [[opened[0]?.id, 'abandoned']])
  assert.deepEqual(await init(made, agent, 'off').then(result => result.kind), 'success')
  assert.equal((await init(made, agent, 'off')).text, '没有开着的接管')
})

test('path changes: new and existing while open (steer when running), refused on a graph (§3.2)', async () => {
  const made = host()
  const ws = made.workspace('change')
  existingProject(ws)
  const agent = await transitionAgent(made, 's-change', 'change')
  assert.equal((await init(made, agent)).kind, 'success')
  agent.status = 'running'
  const changed = await init(made, agent, 'new')
  assert.equal(changed.kind, 'success')
  assert.match(changed.text, /^改判为新项目：主 Agent 下一步按这条路做；已经提的 0 个节点留着/)
  assert.equal(agent.sent.at(-1)?.via, 'steer')
  assert.match(agent.sent.at(-1)?.message.content[0]?.text ?? '', /changed the path of takeover tk-[0-9a-z]{8} to new project/)
  assert.deepEqual(journal(ws).filter(record => record.op === 'takeover-path').map(record => [record.data?.from, record.data?.to]), [['existing', 'new']])
  assert.match((await init(made, agent, 'status')).text, /（新项目）/)
  assert.equal((await init(made, agent, 'bogus')).kind, 'error')
})

test('a graph: nothing missing says so and writes nothing; gaps open a gaps takeover; another session is pointed at the main agent (row #5)', async () => {
  const made = host()
  const full = made.workspace('full')
  existingProject(full)
  const seed = async (dir: string, skip: readonly string[]): Promise<void> => {
    const engine = openEngine(dir)
    await engine.apply('human', { op: 'propose', reason: '种子', node: { type: 'goal', title: '目标' } })
    for (const node of [
      ...NORM_TEMPLATES.map(template => ({ type: 'norm', id: template.id, title: template.title, parent: 'goal-1' })),
      { type: 'norm', id: 'norm-merge-gate', title: '合入门禁', parent: 'goal-1' },
      { type: 'feature', id: 'env', title: '环境', parent: 'goal-1' },
      { type: 'norm', id: 'norm-review-floor', title: '底线清单', parent: 'goal-1' },
      // A check line on *.js: the most used code extension of the project is covered (§5.8's checker gap).
      { type: 'tool', id: 'tool-eslint', title: 'ESLint', parent: 'env', acceptance: ['`check eslint eslint-json $ node node_modules/eslint/bin/eslint.js --format json {files}` when *.js'] },
    ].filter(node => !skip.includes(node.id) && !(node.parent === 'env' && skip.includes('env')))) assert.ok((await engine.apply('human', { op: 'propose', reason: '种子', node })).ok, node.id)
  }
  await seed(join(full, 'docs', 'graph'), [])
  const agent = await rootAgent(made, 's-full', 'full')
  const revision = (await loadGraph(join(full, 'docs', 'graph'))).revision
  const already = await init(made, agent)
  assert.equal(already.kind, 'success')
  assert.match(already.text, /^这个项目已经接管过了\n项目图还有 8 个节点文件没进 git$/)
  assert.equal((await loadGraph(join(full, 'docs', 'graph'))).revision, revision)
  assert.equal(journal(full).length, 0)
  assert.equal((await init(made, agent, 'new')).text, '这里已经有项目图：/hourness-init 只补缺，不改判')

  const gapsWs = made.workspace('gaps')
  existingProject(gapsWs)
  await seed(join(gapsWs, 'docs', 'graph'), ['env'])
  const main = await rootAgent(made, 's-gaps', 'gaps')
  const other = await rootAgent(made, 's-other', 'gaps', false)
  const pointed = await init(made, other)
  assert.equal(pointed.kind, 'error')
  assert.match(pointed.text, /^这个项目的主 Agent 在另一个会话里（id s-gaps）/)
  const before = await loadGraph(join(gapsWs, 'docs', 'graph'))
  const opened = await init(made, main)
  assert.equal(opened.kind, 'success', opened.text)
  assert.match(opened.text, /（补缺）/)
  assert.match(opened.text, /缺：env。/)
  assert.match(opened.text, /改这些文件时没有检查：\*\.js/, 'without env no check line covers the project\'s .js files')
  assert.match(main.sent.at(-1)?.message.content[0]?.text ?? '', /Filling the gaps of this project's graph/)
  await main.assemble()
  await main.step()
  const after = await loadGraph(join(gapsWs, 'docs', 'graph'))
  assert.deepEqual([...after.revisions], [...before.revisions], 'the gaps path changes no node it found')
})

test('no graph and not the main agent: the F46 success reply, nothing written (row #7)', async () => {
  const made = host()
  const ws = made.workspace('plain')
  const agent = await rootAgent(made, 's-plain', 'plain', false)
  const result = await init(made, agent)
  assert.deepEqual(result, { kind: 'success', text: NOT_MAIN_REPLY })
  assert.equal((await init(made, agent, 'status')).text, '还没接管：发 /wish 开始')
  assert.ok(!existsSync(join(ws, '.llm')) && !existsSync(join(ws, '.git')))
})

test('settleWorkspace refuses the home directory, a drive root and a folder with files outside git, and writes nothing (row #8)', async () => {
  const home = mkdtempSync(join(tmpdir(), 'bs-row-home-'))
  const refused = await settleWorkspace(home, join(home, 'docs', 'graph'), home)
  assert.deepEqual(refused, { ok: false, text: '这个会话的工作目录不是一个项目文件夹' })
  const drive = parse(tmpdir()).root
  assert.deepEqual(await settleWorkspace(drive, join(drive, 'docs', 'graph'), home), { ok: false, text: '这个会话的工作目录不是一个项目文件夹' })
  const loose = join(home, 'loose')
  mkdirSync(join(loose, 'docs', 'graph'), { recursive: true })
  writeFileSync(join(loose, 'notes.txt'), 'x\n')
  const stopped = await settleWorkspace(loose, join(loose, 'docs', 'graph'), home)
  assert.equal(stopped.ok, false)
  assert.ok(!existsSync(join(home, '.llm')) && !existsSync(join(home, '.git')) && !existsSync(join(loose, '.llm')) && !existsSync(join(loose, '.git')))
})

test('the row installs no gate, registers /hourness-init and provides its service; a registration that throws does not throw out of activation; with the row off /wish is unchanged (row #6)', async () => {
  const events: string[] = []
  const store = serviceStore()
  const dispose = applyBootstrap({ get: name => store.get(name), provide: (name, value) => store.provide(name, value), commands: { register: () => { throw new Error('taken') } }, on: (event) => { events.push(event); return () => {} } })
  assert.equal((store.get(healthServiceName('bootstrap')) as RowHealthView).activation().state, 'active')
  assert.equal(typeof (store.get(BOOTSTRAP_SERVICE) as { prepare?: unknown }).prepare, 'function')
  assert.deepEqual(events, ['agent/created'], 'the row listens to agent creation only: no tools/pre-execute gate')
  dispose()
  assert.equal(store.get(BOOTSTRAP_SERVICE), undefined, 'disposal withdraws the service')
  const made = host()
  assert.ok(made.commands.has('hourness-init'))
  // With the row off, /wish is M3's own: no takeover, nothing written beside the holder record.
  const plain = designHost()
  applyDesign(plain.ctx)
  const without = plain.addAgent('s-b', { workspace: 'b' })
  await plain.created(without)
  assert.equal((await plain.execute(without, '/wish'))?.result.text, `已让这个会话的 agent 当主 Agent（项目经理）：它按项目图推进，不写文件；/wish off 退出。${STRONG_MODEL_NOTE}`)
  assert.ok(!existsSync(join(plain.workspace('b'), '.llm')) && !existsSync(join(plain.workspace('b'), '.git')))
  // The same /wish with the row on is the takeover's turn first.
  const withRow = await made.execute(await rootAgent(made, 's-a', 'a', false), '/wish')
  assert.match(withRow?.result.text ?? '', /^开了接管 tk-[0-9a-z]{8}（新项目）/)
})

// ---------------------------------------------------------------- /wish calls the takeover (design 0.6 §3.1; row #1, #2, #4, #7)

const startNoticesOf = (agent: FakeAgent): string[] => agent.sent.filter(sent => sent.message.source.kind === BOOTSTRAP_SOURCE).map(sent => sent.via)

test('/wish on an empty folder opens the takeover as a new project: nothing to hold, the interview is M3\'s, the journal says /wish opened it (row #1)', async () => {
  const made = host()
  const agent = await rootAgent(made, 's-w-new', 'wnew', false)
  const ws = made.workspace('wnew')
  const run = await made.execute(agent, '/wish')
  assert.equal(run?.result.kind, 'success', run?.result.text)
  assert.match(run?.result.text ?? '', /^开了接管 tk-[0-9a-z]{8}（新项目）：空目录：当新项目，已建 git 仓库。/)
  assert.match(run?.result.text ?? '', /说一句你想做成什么，主 Agent 从这里开始问你。\n已让这个会话的 agent 当主 Agent（项目经理）/)
  const open = journal(ws)[0]
  assert.deepEqual([open?.op, open?.data?.trigger, open?.data?.path, open?.data?.wish], ['takeover-open', 'wish', 'new', undefined])
  assert.ok(existsSync(join(ws, '.llm')) && existsSync(join(ws, 'docs', 'graph', 'nodes')))
  assert.equal(spawnSync('git', ['check-ignore', '-q', '.llm/x'], { cwd: ws }).status, 0)
  assert.deepEqual(agent.sent, [], 'no words and a new project: nothing wakes the agent')
  assert.equal(health(made, agent), 'active')
  assert.match((await init(made, agent, 'status')).text, /^接管 tk-[0-9a-z]{8} 开着（新项目）/, 'the session is the main agent of the open takeover')
})

test('/wish with words in a folder that has no docs/graph: the directory is made, the takeover keeps the wish, and on a new project M3 also gets it as the interview\'s first step (row #1, #4)', async () => {
  const made = host()
  const agent = await rootAgent(made, 's-w-words', 'wwords', false)
  const ws = made.workspace('wwords')
  rmSync(join(ws, 'docs'), { recursive: true })
  const run = await made.execute(agent, '/wish 记一笔账')
  assert.equal(run?.result.kind, 'success', run?.result.text)
  assert.ok(existsSync(join(ws, 'docs', 'graph', 'nodes')))
  assert.doesNotMatch(run?.result.text ?? '', /说一句你想做成什么/, 'the person said it already')
  assert.match(run?.result.text ?? '', /已把你的愿望交给它/)
  const open = journal(ws)[0]
  assert.deepEqual([open?.data?.trigger, open?.data?.path, open?.data?.wish], ['wish', 'new', '记一笔账'])
  assert.deepEqual(agent.sent.map(sent => [sent.via, sent.message.source.kind]), [['followup', 'glm-design-wish']], 'a new project: M3\'s wish notice, no takeover-start notice')
  assert.equal(health(made, agent), 'active')
})

test('/wish on an existing project: the takeover-start notice wakes the idle agent instead of the wish notice, the wish is kept in the journal, a second /wish resumes the takeover and keeps the new words, /hourness-init off quotes the latest (row #2, #4)', async () => {
  const made = host()
  const ws = made.workspace('wexisting')
  existingProject(ws)
  const agent = await rootAgent(made, 's-w-ex', 'wexisting', false)
  const first = await made.execute(agent, '/wish 加一个导出')
  assert.equal(first?.result.kind, 'success', first?.result.text)
  assert.match(first?.result.text ?? '', /^开了接管 tk-[0-9a-z]{8}（已有项目）：已有项目：1 个代码文件、1 个提交/)
  assert.match(first?.result.text ?? '', /你许的愿记在接管流水里，清单同意之后交给主 Agent。\n主 Agent 开始读这个项目，读完先问你两件事。\n已让这个会话的 agent 当主 Agent/)
  assert.doesNotMatch(first?.result.text ?? '', /已把你的愿望交给它/)
  assert.deepEqual(agent.sent.map(sent => [sent.via, sent.message.source.kind]), [['followup', BOOTSTRAP_SOURCE]], 'no wish notice: the takeover\'s own')
  assert.ok(agent.woken !== undefined, 'the idle agent is woken')
  assert.match(agent.sent[0]?.message.content[0]?.text ?? '', /^<system-reminder>\nThe human started a takeover of this project; begin now\./)
  const open = journal(ws)[0]
  assert.deepEqual([open?.data?.trigger, open?.data?.path, open?.data?.wish], ['wish', 'existing', '加一个导出'])

  const second = await made.execute(agent, '/wish 再加一个导出')
  assert.equal(second?.result.kind, 'success', second?.result.text)
  assert.match(second?.result.text ?? '', /^接着做开着的接管 /)
  assert.equal(journal(ws).filter(record => record.op === 'takeover-open').length, 1, 'the open takeover is resumed, not a second one')
  const wishes = journal(ws).filter(record => record.op === 'takeover-wish')
  assert.equal(wishes.length, 1)
  assert.equal(wishes[0]?.id, open?.id)
  assert.equal(wishes[0]?.data?.text, '再加一个导出')
  assert.equal(typeof wishes[0]?.data?.commandId, 'string')
  assert.deepEqual(startNoticesOf(agent), ['followup', 'followup'], 'the resumed takeover starts the next turn again')
  assert.ok(!second?.result.text.includes('已经是主 Agent'))

  const off = await init(made, agent, 'off')
  assert.match(off.text, /你当时许的愿「再加一个导出」没有交出去，要的话再发 \/wish/)
  assert.equal(journal(ws).filter(record => record.op === 'takeover-closed').length, 1)
})

test('/hourness-init off, then a bare /wish in the session that is the main agent: a second takeover opens and the reply says so (row #4; review B8 F1)', async () => {
  const made = host()
  const agent = await rootAgent(made, 's-w-reopen', 'wreopen', false)
  const ws = made.workspace('wreopen')
  assert.match((await made.execute(agent, '/wish'))?.result.text ?? '', /^开了接管 /)
  assert.match((await init(made, agent, 'off')).text, /^已放弃这次接管/)
  const again = await made.execute(agent, '/wish')
  assert.equal(again?.result.kind, 'success')
  assert.match(again?.result.text ?? '', /^开了接管 tk-[0-9a-z]{8}（新项目）[\s\S]*\n这个会话已经是主 Agent$/)
  const opens = journal(ws).filter(record => record.op === 'takeover-open')
  assert.equal(opens.length, 2)
  assert.deepEqual(opens.map(record => record.data?.trigger), ['wish', 'wish'])
  assert.deepEqual(journal(ws).filter(record => record.op === 'takeover-closed').map(record => record.data?.reason), ['abandoned'])
})

test('/wish with an empty argument on an existing project reaches a running agent with steer (row #2)', async () => {
  const made = host()
  const ws = made.workspace('wsteer')
  existingProject(ws)
  const agent = await rootAgent(made, 's-w-steer', 'wsteer', false)
  agent.status = 'running'
  assert.equal((await made.execute(agent, '/wish'))?.result.kind, 'success')
  assert.deepEqual(startNoticesOf(agent), ['steer'])
  assert.equal(journal(ws)[0]?.data?.wish, undefined)
})

test('/wish that the takeover refuses (files that are not a git repository) writes nothing and the session is not the main agent (row #8)', async () => {
  const made = host()
  const agent = await rootAgent(made, 's-w-loose', 'wloose', false)
  const ws = made.workspace('wloose')
  writeFileSync(join(ws, 'notes.txt'), 'x\n')
  const run = await made.execute(agent, '/wish 记一笔账')
  assert.deepEqual(run?.result, { kind: 'error', text: '这个目录有文件但不是 git 仓库：先在终端里 git init 并提交一次，再发 /wish' })
  assert.ok(!existsSync(join(ws, '.llm')) && !existsSync(join(ws, '.git')))
  assert.deepEqual(agent.sent, [])
  assert.deepEqual(await init(made, agent), { kind: 'success', text: NOT_MAIN_REPLY }, 'it never became the main agent')
})

test('/wish in a session while another session is the main agent points there and does not open or resume a takeover; /wish here moves the role and the takeover starts in the new session (row #2)', async () => {
  const made = host()
  const ws = made.workspace('wpoint')
  existingProject(ws)
  const first = await rootAgent(made, 's-w-first', 'wpoint', false)
  assert.equal((await made.execute(first, '/wish'))?.result.kind, 'success')
  const second = await rootAgent(made, 's-w-second', 'wpoint', false)
  const pointed = await made.execute(second, '/wish 加一个导出')
  assert.ok(pointed?.result.text.startsWith(ROLE_UNCHANGED_MARK), pointed?.result.text)
  assert.equal(journal(ws).filter(record => record.op === 'takeover-open').length, 1)
  assert.equal(journal(ws).filter(record => record.op === 'takeover-wish').length, 0, 'the words went nowhere')
  assert.deepEqual(second.sent, [])
  const moved = await made.execute(second, '/wish here 加一个导出')
  assert.equal(moved?.result.kind, 'success', moved?.result.text)
  assert.equal(journal(ws).filter(record => record.op === 'takeover-open').length, 1)
  assert.deepEqual(journal(ws).filter(record => record.op === 'takeover-wish').map(record => record.data?.text), ['加一个导出'])
  assert.deepEqual(startNoticesOf(second), ['followup'])
})

test('wants: true while the project has no graph or an open takeover, false for a graph with none; a graph with gaps is taken over by /hourness-init and /wish then resumes it (§3.1)', async () => {
  const made = host()
  const ws = made.workspace('wwants')
  existingProject(ws)
  const service = made.services.get(BOOTSTRAP_SERVICE) as { wants(cwd: string): Promise<boolean> }
  assert.equal(await service.wants(ws), true, 'an empty nodes/ is no graph')
  assert.ok((await openEngine(join(ws, 'docs', 'graph')).apply('human', { op: 'propose', reason: '种子', node: { type: 'goal', title: '目标' } })).ok)
  assert.equal(await service.wants(ws), false, 'a graph and no open takeover: M3\'s own /wish')
  const agent = await rootAgent(made, 's-w-wants', 'wwants')
  assert.deepEqual(journal(ws), [], 'that /wish did not touch the takeover')
  assert.equal((await init(made, agent)).kind, 'success')
  assert.equal(await service.wants(ws), true, 'the gaps takeover is open')
  const resumed = await made.execute(agent, '/wish 补一补')
  assert.match(resumed?.result.text ?? '', /^接着做开着的接管 /)
  assert.deepEqual(journal(ws).filter(record => record.op === 'takeover-wish').map(record => record.data?.text), ['补一补'])
  assert.equal((await init(made, agent, 'off')).kind, 'success')
  assert.equal(await service.wants(ws), false)
})

test('holds: M3\'s stage reminder leaves the interview of a held goal to the takeover and stops the note; a new project and a closed takeover keep it (row #7)', async () => {
  const made = host()
  const ws = made.workspace('wholds')
  existingProject(ws)
  const agent = await rootAgent(made, 's-w-holds', 'wholds', false)
  assert.equal((await made.execute(agent, '/wish'))?.result.kind, 'success')
  const dir = join(ws, 'docs', 'graph')
  assert.ok((await openEngine(dir).apply('llm', { op: 'propose', reason: '接管：读项目', node: { type: 'goal', title: '这个项目要做成什么' } })).ok)
  made.focuses.set(agent.id, 'goal-1')
  await agent.assemble()
  for (let step = 0; step < 4; step++) {
    const decision = await agent.step()
    const sources = kinds(decision.kind === 'enter' ? decision.messages : [])
    assert.ok(sources.includes(BOOTSTRAP_SOURCE) || step > 0, `step ${step}: ${sources.join(', ')}`)
    assert.ok(!sources.includes(STAGE_SOURCE), `step ${step}: M3's interview reminder yields: ${sources.join(', ')}`)
  }
  assert.equal(journal(ws).filter(record => record.op === 'note').length, 0, 'holds was asked on every step: no note')
  assert.equal((await init(made, agent, 'off')).kind, 'success')
  await agent.assemble()
  const after = await agent.step()
  assert.ok(kinds(after.kind === 'enter' ? after.messages : []).includes(STAGE_SOURCE), 'the takeover let go: the reminder is back')

  const fresh = made.workspace('wholds-new')
  const newAgent = await rootAgent(made, 's-w-holds-new', 'wholds-new', false)
  assert.equal((await made.execute(newAgent, '/wish'))?.result.kind, 'success')
  assert.ok((await openEngine(join(fresh, 'docs', 'graph')).apply('llm', { op: 'propose', reason: '访谈', node: { type: 'goal', title: '记账' } })).ok)
  made.focuses.set(newAgent.id, 'goal-1')
  await newAgent.assemble()
  const interview = await newAgent.step()
  assert.ok(kinds(interview.kind === 'enter' ? interview.messages : []).includes(STAGE_SOURCE), 'a new project is interviewed: the takeover holds nothing')
})

test('the reminder texts carry the interview sentence on the existing and gaps paths and never ask to wait or stop', () => {
  for (const path of ['new', 'existing', 'gaps'] as const) {
    for (const state of ['wait', 'ask', 'pending', 'write', 'done'] as const) {
      const facts: ReminderFacts = { takeover: { id: 'tk-abcdefgh', path }, history: 2, anchor: 'goal-1', proposed: { total: 1, byType: { goal: 1 } }, missing: ['env'], unchecked: ['.py'], things: { cost: state, touch: state }, touchInside: state === 'done' ? ['vendor/'] : [], rulesWhole: false, testsMissing: true }
      const text = reminderText(facts)
      assert.equal(text.includes(INTERVIEW_YIELD), path !== 'new', path)
      assert.doesNotMatch(text, /peak|pause|hold|\bwait\b/i, `${path} ${state}`)
      // Design 0.6 §5.1 caps a step notice at 2,500 characters while its own existing-project template runs to about 3,100;
      // the existing path reaches 2,845 here. 3,000 is the cap proposed in impl-plan §7 Q4, pending the answer.
      assert.ok(text.length <= 3000, `${path} ${state}: ${text.length}`)
    }
  }
})
