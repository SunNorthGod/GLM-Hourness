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

export interface MainAgentFixture {
  readonly host: DesignHost
  readonly agent: FakeAgent
  readonly dir: string
  readonly engine: GraphEngine
  readonly node: (id: string) => Promise<GraphNode>
}

/** A main agent (`s1`, after /wish) whose project graph has the goal-1 it has in focus. */
export async function mainAgentWithGoal(options: Parameters<typeof designHost>[0] = {}): Promise<MainAgentFixture> {
  const host = designHost(options)
  apply(host.ctx)
  const agent = host.addAgent('s1')
  await host.execute(agent, '/wish')
  const dir = join(host.workspace('ws'), 'docs', 'graph')
  const engine = openEngine(dir)
  const seeded = await engine.apply('human', { op: 'propose', reason: '立项', node: { type: 'goal', title: '记账小工具', stage: 'interview', body: '需求：记一下每天花了多少钱' } })
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
