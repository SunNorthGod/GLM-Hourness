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

/** The eight items of the requirement card, by the key of the gate item. */
export type CardItem = 'need' | 'problem' | 'audience' | 'constraints' | 'acceptance' | 'non-goals' | 'risks' | 'choice'

/**
 * The requirement card of goal-1 filled in as the interview would, all eight
 * items or all but those named in `leave` (the goal's body labels, its
 * acceptance and non-goals, a risk, and a question the human decided).
 */
export async function fillRequirementCard(fixture: Pick<MainAgentFixture, 'engine'>, leave: readonly CardItem[] = []): Promise<void> {
  const { engine } = fixture
  const apply = async (actor: 'human' | 'llm', input: Record<string, unknown>): Promise<string> => {
    const done = await engine.apply(actor, input)
    if (!done.ok) throw new Error(JSON.stringify(done.error))
    return done.id
  }
  const revOf = async (id: string): Promise<string> => (await engine.load()).revisions.get(id)!
  const lines: Array<[CardItem, string]> = [['need', '需求：记一下每天花了多少钱'], ['problem', '问题：月底不知道钱花在哪'], ['audience', '给谁：我自己'], ['constraints', '约束：数据只存在本机']]
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
