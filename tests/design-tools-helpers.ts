/**
 * What the specs of the two design tools share: a main agent on the fake host
 * with a project graph under it, tool dependencies built from the host for a
 * tool the test makes itself, and a stand-in for a board that proposes
 * something with `attach` (the real boards add their own rows to the table
 * when they merge, src/design/attach.ts).
 */
import { join } from 'node:path'
import { apply } from '../src/design/index.ts'
import type { AttachBoard, AttachService, Attachable } from '../src/design/attach.ts'
import type { DesignToolDeps } from '../src/design/propose.ts'
import { TALK_PROJECTION, type TalkState } from '../src/design/talk.ts'
import { openEngine, type GraphEngine } from '../src/graph/engine.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import { loadGraph } from '../src/graph/store.ts'
import { designHost, type DesignHost, type FakeAgent } from './design-host.ts'
import { exampleRecord } from './proposal-examples.ts'

export interface MainAgentFixture {
  readonly host: DesignHost
  readonly agent: FakeAgent
  readonly dir: string
  readonly engine: GraphEngine
  readonly node: (id: string) => Promise<GraphNode>
}

/**
 * A main agent (`s1`, after /wish) whose project graph has the goal-1 it has in
 * focus: the human's own (approved at once) or, with `goalBy` `llm`, the main
 * agent's proposal, which waits for the human's confirmation.
 */
export async function mainAgentWithGoal(options: Parameters<typeof designHost>[0] = {}, goalBy: 'human' | 'llm' = 'human'): Promise<MainAgentFixture> {
  const host = designHost(options)
  apply(host.ctx)
  const agent = host.addAgent('s1')
  await host.execute(agent, '/wish')
  const dir = join(host.workspace('ws'), 'docs', 'graph')
  const engine = openEngine(dir)
  const seeded = await engine.apply(goalBy, { op: 'propose', reason: '立项', node: { type: 'goal', title: '记账小工具', stage: 'interview', body: '需求：记一下每天花了多少钱' } })
  if (!seeded.ok) throw new Error(JSON.stringify(seeded.error))
  host.focuses.set(agent.id, 'goal-1')
  return { host, agent, dir, engine, node: async id => (await loadGraph(dir)).nodes.get(id)! }
}

/** Dependencies for a tool the test builds itself, over the host's projection of the human's talk. */
export function toolDeps(fixture: Pick<MainAgentFixture, 'host' | 'dir'>, boards: readonly AttachBoard[] = [], over: Partial<DesignToolDeps> = {}): DesignToolDeps {
  return {
    boards,
    lookup: { get: () => undefined },
    isMainAgent: agent => agent.id === 's1',
    graph: agent => ({ dir: fixture.dir, cwd: fixture.host.workspace('ws'), focus: fixture.host.focuses.get(agent.id) }),
    talk: agent => agent.session === undefined ? undefined : fixture.host.projections.stateOf(agent.session, TALK_PROJECTION) as TalkState | undefined,
    report: () => undefined,
    ...over,
  }
}

/** The five columns of a design decision as the engine takes them: reason, architecture and the checked solutions in the body, acceptance and non-goals. The plan is the nodes that point at the decision. */
const FIVE = { body: '理由：一个人用，不要服务端\n架构：本地 JSON 文件\n查过的现成方案：ledger-cli 太重', acceptance: ['月底出一张分类表'], nonGoals: ['不做同步'] } as const

/** What the main agent writes into the graph as the design of goal-1, as the llm. */
export type DesignShape = 'small' | 'split'

/** The titles and directions a page of the framework release has to name, for the split design. */
export const SPLIT_NAMES = { framework: '用本地文件存账', moduleA: '记账', moduleB: '月底汇总', directions: ['数据只存在本机', '先记账再汇总'] } as const

/** A page that names all of them: the framework, both modules and both directions. */
export const FRAMEWORK_PAGE = `框架：${SPLIT_NAMES.framework}。\n模块：${SPLIT_NAMES.moduleA}、${SPLIT_NAMES.moduleB}。\n你定过的方向：${SPLIT_NAMES.directions.join('；')}。`
/** A page of one module: what the human will see of it, by the module's title. */
export const modulePage = (title: string): string => `你会看到什么：${title}这一块做完以后的样子。\n它自己会做的：照图上的任务做。\n什么时候问你：碰到要你定的事。\n替你定了的方向：${SPLIT_NAMES.directions[0]}。`

/**
 * goal-1 in its design: the human's goal gets the stage design, then the main
 * agent (the llm) proposes the design. `small`: one design decision and one
 * task directly under the goal. `split`: the framework decision, the list of
 * directions, two module candidates `module-a` and `module-b` pointing at the
 * framework, and for each module its own decision and task: all proposals,
 * the module designs below the candidates.
 */
export async function writeDesign(fixture: Pick<MainAgentFixture, 'engine' | 'node'>, shape: DesignShape): Promise<void> {
  const { engine } = fixture
  const send = async (actor: 'human' | 'llm', input: Record<string, unknown>): Promise<void> => {
    const done = await engine.apply(actor, input)
    if (!done.ok) throw new Error(JSON.stringify(done.error))
  }
  const propose = (node: Record<string, unknown>): Promise<void> => send('llm', { op: 'propose', reason: '设计', node })
  await send('human', { op: 'edit', id: 'goal-1', rev: (await engine.load()).revisions.get('goal-1'), set: { stage: 'design' }, reason: '确认了需求' })
  const source = (to: string): { edges: Array<{ type: 'source', to: string }> } => ({ edges: [{ type: 'source', to }] })
  if (shape === 'small') {
    await propose({ type: 'decision', id: 'decision-1', title: '用本地文件存账', parent: 'goal-1', ...FIVE })
    await propose({ type: 'task', id: 'task-1', title: '写记账命令', parent: 'goal-1', acceptance: ['记一条能读回'], ...source('decision-1') })
    return
  }
  await propose({ type: 'decision', id: 'decision-fw', title: SPLIT_NAMES.framework, parent: 'goal-1', ...FIVE })
  await propose({ type: 'norm', id: 'norm-directions', title: '方向清单', parent: 'goal-1', acceptance: [...SPLIT_NAMES.directions] })
  for (const [id, title] of [['module-a', SPLIT_NAMES.moduleA], ['module-b', SPLIT_NAMES.moduleB]] as const) {
    const key = id.slice(-1)
    await propose({ type: 'feature', id, title, parent: 'goal-1', ...source('decision-fw') })
    await propose({ type: 'decision', id: `decision-${key}`, title: `${title}怎么做`, parent: id, ...FIVE })
    await propose({ type: 'task', id: `task-${key}`, title: `写${title}`, parent: id, acceptance: ['能用'], ...source(`decision-${key}`) })
  }
}

/**
 * The graph as the release of the framework leaves it (writeDesign 'split'):
 * the candidates are modules in design, the framework decision and the
 * directions are approved, and the goal is at release; the designs of the
 * modules are still proposals. Written as the human, so no rule is exercised.
 */
export async function frameworkReleased(fixture: Pick<MainAgentFixture, 'engine'>): Promise<void> {
  const { engine } = fixture
  const send = async (input: Record<string, unknown>): Promise<void> => {
    const done = await engine.apply('human', { ...input, rev: (await engine.load()).revisions.get(input.id as string) })
    if (!done.ok) throw new Error(JSON.stringify(done.error))
  }
  for (const id of ['module-a', 'module-b']) await send({ op: 'edit', id, set: { stage: 'design' }, reason: '放行框架' })
  for (const id of ['decision-fw', 'norm-directions', 'module-a', 'module-b']) await send({ op: 'approve', id, reason: '放行框架' })
  await send({ op: 'edit', id: 'goal-1', set: { stage: 'release' }, reason: '放行框架' })
}

/** The nine items of the requirement card, by the key of the gate item. */
export type CardItem = 'need' | 'problem' | 'audience' | 'flows' | 'constraints' | 'acceptance' | 'non-goals' | 'risks' | 'choice'

/** The goal's answer to 用户怎么用 when it draws no user graph (user graph design 0.4.1 §5.1). */
export const NO_END_USER = '练习用的目标，不画用户图'

/**
 * The requirement card of goal-1 filled in as the interview would, all nine
 * items or all but those named in `leave` (the goal's body labels, the line
 * that it has no end user, its acceptance and non-goals, a risk, and a
 * question the human decided).
 */
export async function fillRequirementCard(fixture: Pick<MainAgentFixture, 'engine'>, leave: readonly CardItem[] = []): Promise<void> {
  const { engine } = fixture
  const apply = async (actor: 'human' | 'llm', input: Record<string, unknown>): Promise<string> => {
    const done = await engine.apply(actor, input)
    if (!done.ok) throw new Error(JSON.stringify(done.error))
    return done.id
  }
  const revOf = async (id: string): Promise<string> => (await engine.load()).revisions.get(id)!
  const lines: Array<[CardItem, string]> = [['need', '需求：记一下每天花了多少钱'], ['problem', '问题：月底不知道钱花在哪'], ['audience', '给谁：我自己'], ['flows', `用户流程：无，${NO_END_USER}`], ['constraints', '约束：数据只存在本机']]
  await apply('human', {
    op: 'edit',
    id: 'goal-1',
    rev: await revOf('goal-1'),
    reason: '访谈',
    set: {
      body: lines.filter(([key]) => !leave.includes(key)).map(([, line]) => line).join('\n'),
      ...leave.includes('acceptance') ? {} : { acceptance: ['月底跑一个命令能看到按类别的合计'] },
      ...leave.includes('non-goals') ? {} : { nonGoals: ['不要手机版'] },
    },
  })
  if (!leave.includes('risks')) await apply('llm', { op: 'propose', reason: '访谈', node: { type: 'risk', title: '懒得每天记', parent: 'goal-1' } })
  if (!leave.includes('choice')) {
    const id = await apply('llm', { op: 'propose', reason: '交给人', node: { type: 'question', parent: 'goal-1', ...exampleRecord('recommend') } })
    await apply('human', { op: 'decide', id, rev: await revOf(id), conclusion: '默认少做', reason: '人拍板' })
  }
}

export interface FakeBoard {
  readonly board: AttachBoard
  readonly service: AttachService
  /** What `attachable` is asked, in order. */
  readonly asked: Array<{ readonly cwd: string | undefined, readonly proposal: string }>
  /** What `acceptProposal` is called with. */
  readonly accepted: Array<Parameters<AttachService['acceptProposal']>[0]>
  /** What the board says next about a proposal. */
  answer: Attachable
  /** What the board hands back after the human agreed, or how it fails. */
  handBack: () => Promise<string>
}

/** A board that takes `rules:p-<8 hex>`, ties a question to its proposal by a last line "提议：<id>", and says what it is told to. */
export function fakeBoard(prefix: 'rules:' | 'loops:' = 'rules:'): FakeBoard {
  const id = prefix === 'rules:' ? 'p' : 'lp'
  const asked: FakeBoard['asked'] = []
  const accepted: FakeBoard['accepted'] = []
  const fake: FakeBoard = {
    asked,
    accepted,
    answer: { ok: true, detail: { markdown: '脚本原文：\n```\nnpm test\n```\n注意：它会跑全部测试', mustShow: ['npm test', '它会跑全部测试'] } },
    handBack: () => Promise.resolve('Rules board: proposal took effect'),
    service: {
      attachable: (input) => { asked.push(input); return fake.answer },
      proposalLine: proposal => `提议：${proposal}`,
      acceptProposal: (input) => { accepted.push(input); return fake.handBack() },
    },
    board: {
      prefix,
      format: new RegExp(`^${prefix}${id}-[0-9a-f]{8}$`),
      board: prefix === 'rules:' ? 'the rules board' : 'the loops board',
      service: () => fake.service,
      idOf: body => new RegExp(`提议：(${id}-[0-9a-f]{8})\\s*$`).exec(body)?.[1],
    },
  }
  return fake
}
