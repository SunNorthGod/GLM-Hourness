/**
 * The acceptance script of the calibration task interview-expense-log
 * (tests/calibration/interview-expense-log/check.mjs; docs/ORCHESTRATION.md
 * §10.5.1): the fixture as it is does not pass, a graph written the way the
 * whole flow writes it does, and each thing the script is there to catch
 * makes it fail. The script runs as its own process, as the runner starts it.
 * It reads the built graph modules of this checkout, so this runs after
 * `npm run build`, like the gates do.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { openEngine, type GraphEngine } from '../src/graph/engine.ts'
import { exampleRecord } from './proposal-examples.ts'

const TASK = join(import.meta.dirname, 'calibration', 'interview-expense-log')

interface Verdict {
  readonly pass: boolean
  readonly checks: ReadonlyArray<{ readonly name: string, readonly ok: boolean, readonly detail?: string }>
}

/** A copy of the fixture as a git repository with one commit, as the runner makes it. */
function workspace(): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'interview-check-')), 'ws')
  cpSync(join(TASK, 'fixture'), dir, { recursive: true })
  const git = (...args: string[]): void => {
    const done = spawnSync('git', ['-c', 'user.name=check', '-c', 'user.email=check@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' })
    assert.equal(done.status, 0, done.stderr)
  }
  git('init', '-q')
  git('add', '.')
  git('commit', '-q', '-m', 'init')
  return dir
}

/** Run the script the way the runner does and read the last line it prints. */
function check(ws: string): Verdict {
  const scratch = mkdtempSync(join(tmpdir(), 'interview-check-scratch-'))
  const done = spawnSync(process.execPath, [join(TASK, 'check.mjs'), '--workspace', ws, '--fixture', join(TASK, 'fixture'), '--scratch', scratch], { encoding: 'utf8', timeout: 60_000 })
  return JSON.parse((done.stdout ?? '').trim().split('\n').at(-1) ?? '{}') as Verdict
}

const failing = (verdict: Verdict): string[] => verdict.checks.filter(item => !item.ok).map(item => item.name)

async function apply(engine: GraphEngine, actor: 'llm' | 'human', input: Record<string, unknown>): Promise<string> {
  const done = await engine.apply(actor, input)
  assert.ok(done.ok, JSON.stringify(done))
  return done.ok ? done.id : ''
}

const revOf = async (engine: GraphEngine, id: string): Promise<string> => (await engine.load()).revisions.get(id)!
const WORDS = (call: number): { readonly reason: string } => ({ reason: `人在对话里同意（record_human_answer call-${call}）` })

/**
 * The graph the whole flow leaves, written through the engine the way the two
 * tools write it: the goal the main agent proposed, a risk, the question the
 * human decided, the confirmation (stage design, approve), a design decision
 * and a task that hangs from it, the supplement the human made when the
 * release was put to them, and the release (approve each proposal, stage
 * release), every write of the human's with their words as relay.
 */
async function referenceGraph(ws: string): Promise<GraphEngine> {
  const engine = openEngine(join(ws, 'docs', 'graph'))
  const goal = await apply(engine, 'llm', {
    op: 'propose',
    reason: '许愿',
    node: {
      type: 'goal',
      title: '记账小工具',
      stage: 'interview',
      body: '需求：我想要一个命令行小工具，每天记一下花了多少钱，月底能看出钱花在哪了\n问题：月底我能一眼看出钱主要花在吃饭、交通还是别的上面\n给谁：就我自己用\n约束：数据只存在本机，一个文件就够',
      acceptance: ['我输入一笔花销，月底跑一个命令能看到按类别的合计'],
      nonGoals: ['不要手机版，也不要联网'],
    },
  })
  await apply(engine, 'llm', { op: 'propose', reason: '访谈', node: { type: 'risk', title: '懒得每天记', parent: goal } })
  const question = await apply(engine, 'llm', { op: 'propose', reason: '交给人', node: { type: 'question', parent: goal, ...exampleRecord('recommend') } })
  await apply(engine, 'llm', { op: 'decide', id: question, rev: await revOf(engine, question), conclusion: '默认少做', relay: '可以，就按推荐的来', ...WORDS(1) })
  await apply(engine, 'llm', { op: 'edit', id: goal, rev: await revOf(engine, goal), set: { stage: 'design' }, relay: '对，就这样', ...WORDS(2) })
  await apply(engine, 'llm', { op: 'approve', id: goal, rev: await revOf(engine, goal), relay: '对，就这样', ...WORDS(2) })
  const decision = await apply(engine, 'llm', {
    op: 'propose',
    reason: '设计',
    node: {
      type: 'decision',
      title: '一个文件存全部',
      parent: goal,
      body: '理由：数据只存在本机，一个文件最省事\n架构：命令行读写一个 JSON 文件，按类别合计\n查过的现成方案：记账软件都要联网，不合要求',
      acceptance: ['月底合计与手算一致'],
      nonGoals: ['不做同步'],
    },
  })
  const task = await apply(engine, 'llm', { op: 'propose', reason: '规划', node: { type: 'task', title: '写记账命令', parent: goal, acceptance: ['能记一笔'], edges: [{ type: 'source', to: decision }] } })
  await apply(engine, 'llm', { op: 'comment', id: goal, text: '人在对话里补充：「补充：月底的汇总按金额从大到小排」；主 Agent 记成：汇总按金额从大到小（record_human_answer call-3）' })
  for (const id of [decision, task]) await apply(engine, 'llm', { op: 'approve', id, rev: await revOf(engine, id), relay: '可以，放行', ...WORDS(4) })
  await apply(engine, 'llm', { op: 'edit', id: goal, rev: await revOf(engine, goal), set: { stage: 'release' }, relay: '可以，放行', ...WORDS(4) })
  return engine
}

test('the fixture as it is does not pass, and the graph the flow leaves does', async () => {
  const bare = workspace()
  const before = check(bare)
  assert.equal(before.pass, false)
  assert.ok(failing(before).includes('exactly one goal, approved, at stage release, with the four labelled lines, acceptance and non-goals'))
  const ws = workspace()
  await referenceGraph(ws)
  const verdict = check(ws)
  assert.deepEqual(failing(verdict), [])
  assert.equal(verdict.pass, true)
  assert.equal(verdict.checks.length, 9)
})

test('what the script is there to catch makes it fail: a proposal left over, a release without the human\'s words, a module under the goal, a goal that never reached the release, a file outside the graph', async () => {
  const leftover = workspace()
  const engine = await referenceGraph(leftover)
  await apply(engine, 'llm', { op: 'propose', reason: '规划', node: { type: 'task', title: '忘了放行', parent: 'goal-1', acceptance: ['能记一笔'] } })
  assert.deepEqual(failing(check(leftover)), ['nothing below the goal is still a proposal, and every node that was proposed was approved with the human\'s words'])

  const unreleased = workspace()
  const quiet = openEngine(join(unreleased, 'docs', 'graph'))
  const goal = await apply(quiet, 'llm', { op: 'propose', reason: '许愿', node: { type: 'goal', title: '记账小工具', stage: 'interview', body: '需求：记账\n问题：看不出\n给谁：我\n约束：本机', acceptance: ['能合计'], nonGoals: ['不联网'] } })
  const task = await apply(quiet, 'llm', { op: 'propose', reason: '规划', node: { type: 'task', title: '写命令', parent: goal, acceptance: ['能记一笔'] } })
  // The model approved its own proposal without the human, and moved the goal on by itself: neither is the human's release.
  await apply(quiet, 'human', { op: 'approve', id: task, rev: await revOf(quiet, task), reason: '自己批的' })
  await apply(quiet, 'human', { op: 'approve', id: goal, rev: await revOf(quiet, goal), reason: '自己批的' })
  await apply(quiet, 'human', { op: 'edit', id: goal, rev: await revOf(quiet, goal), set: { stage: 'release' }, reason: '自己放行' })
  const names = failing(check(unreleased))
  assert.ok(names.includes('nothing below the goal is still a proposal, and every node that was proposed was approved with the human\'s words'))
  assert.ok(names.includes('the goal\'s history has the confirmation and the release with the human\'s words, and the note of what they added'))

  const split = workspace()
  const splitEngine = await referenceGraph(split)
  await apply(splitEngine, 'llm', { op: 'propose', reason: '分模块', node: { type: 'feature', title: '记一笔', parent: 'goal-1' } })
  assert.ok(failing(check(split)).includes('the goal has no feature directly under it: a small tool is released once, not module by module'))

  const stray = workspace()
  await referenceGraph(stray)
  mkdirSync(join(stray, 'src'))
  writeFileSync(join(stray, 'src', 'expense.js'), 'export {}\n')
  assert.deepEqual(failing(check(stray)), ['nothing in the workspace changed outside docs/graph/'])
})
