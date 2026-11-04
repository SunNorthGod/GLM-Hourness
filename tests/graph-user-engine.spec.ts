import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { judgeMainAgentGraph, type GraphRuleDeps } from '../src/guard/main-agent-graph.ts'
import type { GraphFocusService } from '../src/graph/service.ts'
import {
  USER_LIMITS,
  type GraphEdge,
  type GraphNode,
} from '../src/graph/schema.ts'
import { personSaid, talkFold, type TalkState } from '../src/design/talk.ts'
import { graphTools } from '../src/graph/tools.ts'
import { engineFixture, fixtureTest, must, refused, type EngineFixture } from './graph-helpers.ts'
import type { SessionEventLike } from '../src/shared/dsh-min.ts'

/**
 * A library system: two flows of the reader, one of them walked by the
 * person (你来走), the features and tasks that serve the steps.  The ids
 * follow design 0.4.1 §3.5's example (flow-3, step-8, step-9) where the
 * acceptance cites it.
 */
async function fixture(): Promise<EngineFixture> {
  return engineFixture('graph-user-engine-', 28, async ({ run, act }) => {
    await run('human', { op: 'propose', reason: '立项', node: { id: 'goal-1', type: 'goal', title: '图书管理系统', acceptance: ['读者能借到书'] } })
    await run('human', { op: 'propose', reason: '画用户图', node: { id: 'role-1', type: 'role', title: '读者', parent: 'goal-1' } })
    await run('human', { op: 'propose', reason: '画用户图', node: { id: 'flow-1', type: 'flow', title: '借书', parent: 'role-1', body: '前提：已登录\n走法：命令 · 预计 30 秒' } })
    await run('human', { op: 'propose', reason: '画用户图', node: { id: 'flow-2', type: 'flow', title: '续借', parent: 'role-1', body: '走法：你来走' } })
    await run('human', { op: 'propose', reason: '画用户图', node: { id: 'flow-3', type: 'flow', title: '还书', parent: 'role-1', body: '走法：命令 · 预计 20 秒' } })
    await run('human', { op: 'propose', reason: '画用户图', node: { id: 'step-3', type: 'step', title: '看到应还日期', parent: 'flow-1', acceptance: ['日期在借出之后 30 天'] } })
    await run('human', { op: 'propose', reason: '画用户图', node: { id: 'step-2', type: 'step', title: '确认借阅', parent: 'flow-1', acceptance: ['提示借阅成功'], edges: [{ type: 'next', to: 'step-3' }] } })
    await run('human', { op: 'propose', reason: '画用户图', node: { id: 'step-1', type: 'step', title: '点借阅', parent: 'flow-1', acceptance: ['弹出确认框'], edges: [{ type: 'next', to: 'step-2' }] } })
    await run('human', { op: 'propose', reason: '画用户图', node: { id: 'step-4', type: 'step', title: '点续借', parent: 'flow-2', acceptance: ['提示续借成功'] } })
    await act('human', { op: 'link', reason: '流程入口', id: 'flow-1', type: 'next', to: 'step-1' })
    await act('human', { op: 'link', reason: '流程入口', id: 'flow-2', type: 'next', to: 'step-4' })
    await run('human', { op: 'propose', reason: '开发那一侧', node: { id: 'feat-1', type: 'feature', title: '借阅', parent: 'goal-1', edges: [{ type: 'serves', to: 'step-1' }] } })
    await run('human', { op: 'propose', reason: '开发那一侧', node: { id: 'task-1', type: 'task', title: '借阅接口', parent: 'feat-1', acceptance: ['接口返回应还日期'] } })
    // Seven more features serve step-1, so it sits at its limit of eight.
    for (let index = 2; index <= 8; index++) {
      await run('human', { op: 'propose', reason: '开发那一侧', node: { id: `feat-${index}`, type: 'feature', title: `模块 ${index}`, parent: 'goal-1', edges: [{ type: 'serves', to: 'step-1' }] } })
    }
  })
}
const userTest = fixtureTest(fixture)

const WALK_AT = '3f2a91c'

function walkEvidence(overrides: Partial<{ ref: string, exit: number, note: string }> = {}): GraphNode['evidence'] {
  return [{ kind: 'walk', ref: overrides.ref ?? 'command:npm run e2e -- --flow flow-1', exit: overrides.exit ?? 0, note: overrides.note ?? `@${WALK_AT} sha256:9bd1c0e2 通过` }]
}

userTest('propose of a user node: the llm drafts proposed, the human or a relayed write approves (design §1.4 item 9)', async g => {
  const drafted = await g.run('llm', { op: 'propose', reason: '访谈草稿', node: { type: 'flow', title: '预约', parent: 'role-1', body: '走法：你来走' } })
  assert.equal(drafted.node.status, 'proposed')
  const human = await g.run('human', { op: 'propose', reason: '人画的', node: { type: 'flow', title: '预约', parent: 'role-1', body: '走法：你来走' } })
  assert.equal(human.node.status, 'approved')
  const relayed = await g.run('llm', { op: 'propose', reason: '访谈草稿', relay: '再来一条预约流程', node: { type: 'flow', title: '预约', parent: 'role-1', body: '走法：你来走' } })
  assert.equal(relayed.node.status, 'approved')
})

userTest('permissions: an unrelayed llm cannot approve, reject, drop, restore or close a user node (design §1.4 item 10)', async g => {
  refused(await g.engine.apply('llm', { op: 'approve', id: 'step-1', rev: await g.rev('step-1'), reason: '自己批' }), 'forbidden')
  refused(await g.engine.apply('llm', { op: 'reject', id: 'step-1', rev: await g.rev('step-1'), reason: '自己否' }), 'forbidden')
  refused(await g.act('llm', { op: 'status', id: 'step-1', to: 'dropped', reason: '不要了' }), 'forbidden')
  // A user node is never doing or done, whoever writes: the hint points at the walk.
  refused(await g.act('llm', { op: 'status', id: 'step-1', to: 'done', reason: '做完了' }), 'bad_transition', 'to')
  refused(await g.act('human', { op: 'status', id: 'step-1', to: 'doing', reason: '开工' }), 'bad_transition', 'to')
  const done = await g.run('human', { op: 'propose', reason: '收尾', node: { type: 'task', title: '临时', parent: 'feat-1', acceptance: ['有'], edges: [] } })
  await g.act('llm', { op: 'status', id: done.id, to: 'doing', reason: '开工' })
  refused(await g.act('llm', { op: 'status', id: 'step-1', to: 'dropped', reason: '不要了' }), 'forbidden')
  await g.act('human', { op: 'status', id: 'step-1', to: 'dropped', reason: '人不要了' })
  refused(await g.act('llm', { op: 'status', id: 'step-1', to: 'approved', reason: '恢复' }), 'forbidden')
  await g.act('human', { op: 'status', id: 'step-1', to: 'approved', reason: '人要了' })
  void done
})

userTest('permissions: the shape of an approved user node is the person\'s, its body wording is not (design §1.4 item 10)', async g => {
  for (const field of ['title', 'parent'] as const) {
    refused(await g.act('llm', { op: 'edit', id: 'step-2', reason: '改一下', set: { [field]: field === 'title' ? '改名' : 'flow-2' } }), 'forbidden', `set.${field}`)
  }
  refused(await g.act('llm', { op: 'edit', id: 'step-2', reason: '改验收', set: { acceptance: ['改成别的'] } }), 'forbidden', 'set.acceptance')
  await g.act('llm', { op: 'edit', id: 'step-2', reason: '补一句前提', set: { body: '走法：命令 · 预计 30 秒\n前提：读者已登录' } })
  // The estimate moves, the kind does not: 命令 stays 命令.
  await g.act('llm', { op: 'edit', id: 'step-2', reason: '估错了', set: { body: '走法：命令 · 预计 45 秒' } })
  refused(await g.act('llm', { op: 'edit', id: 'step-2', reason: '改成你来走', set: { body: '走法：你来走' } }), 'forbidden', 'set.body')
  // A flow that had no walk line gains one: from nothing to something is the person's too.
  const drafted = await g.run('llm', { op: 'propose', reason: '草稿', node: { type: 'flow', title: '草稿流程', parent: 'role-1' } })
  await g.act('llm', { op: 'edit', id: drafted.id, reason: '草稿随意', set: { body: '走法：你来走' } })
  await g.run('human', { op: 'approve', id: drafted.id, rev: await g.rev(drafted.id), reason: '人批了' })
  refused(await g.act('llm', { op: 'edit', id: drafted.id, reason: '改成命令', set: { body: '走法：命令 · 预计 10 秒' } }), 'forbidden', 'set.body')
  await g.act('llm', { op: 'edit', id: drafted.id, reason: '带转述改', set: { body: '走法：命令 · 预计 10 秒' }, relay: '这条自动测吧' })
})

userTest('permissions: the next edges of an approved step need the person; serves is the work side\'s own bookkeeping (design §1.4 item 10)', async g => {
  refused(await g.act('llm', { op: 'link', id: 'step-3', reason: '加一条', type: 'next', to: 'step-1' }), 'forbidden', 'id')
  refused(await g.act('llm', { op: 'unlink', id: 'step-2', reason: '摘一条', type: 'next', to: 'step-3' }), 'forbidden')
  refused(await g.act('llm', { op: 'relink', id: 'step-2', reason: '改出边', next: [{ to: 'step-1', when: '没看完' }] }), 'forbidden')
  await g.act('llm', { op: 'link', id: 'step-3', reason: '回环', type: 'next', to: 'step-1', when: '没看完', relay: '没看完就回到第一步' })
  await g.act('llm', { op: 'link', id: 'feat-1', reason: '登记谁做', type: 'serves', to: 'step-2' })
  // Their own open proposal stays theirs, edges included.
  const drafted = await g.run('llm', { op: 'propose', reason: '草稿', node: { type: 'step', title: '草稿步骤', parent: 'flow-2' } })
  await g.act('llm', { op: 'link', id: drafted.id, reason: '草稿连边', type: 'next', to: 'step-4' })
  await g.act('llm', { op: 'relink', id: drafted.id, reason: '草稿改出边', next: [{ to: 'step-4', when: '想续借' }] })
})

userTest('serves limits are write-time gates on the new edges only (design §1.4 item 11)', async g => {
  // step-1 already has eight live servers from the fixture: the ninth is refused.
  const ninth = await g.run('human', { op: 'propose', reason: '第九个模块', node: { type: 'feature', title: '第九个', parent: 'goal-1' } })
  refused(await g.act('human', { op: 'link', id: ninth.id, reason: '第九条线', type: 'serves', to: 'step-1' }), 'invalid', 'to')
  // A task serves at most three steps; the fourth is refused.
  await g.act('human', { op: 'link', id: 'task-1', reason: '第一条', type: 'serves', to: 'step-2' })
  await g.act('human', { op: 'link', id: 'task-1', reason: '第二条', type: 'serves', to: 'step-3' })
  await g.act('human', { op: 'link', id: 'task-1', reason: '第三条', type: 'serves', to: 'step-4' })
  const other = await g.run('human', { op: 'propose', reason: '多一步', node: { type: 'step', title: '多出的一步', parent: 'flow-1', acceptance: ['看到了'] } })
  refused(await g.act('human', { op: 'link', id: 'task-1', reason: '第四条', type: 'serves', to: other.id }), 'invalid', 'to')
  // A feature owns at most twenty steps by its own links.
  const edges: GraphEdge[] = []
  for (let index = 1; index <= USER_LIMITS.servesPerFeature; index++) {
    const step = await g.run('human', { op: 'propose', reason: '流程步骤', node: { type: 'step', title: `步骤 ${index}`, parent: 'flow-3', acceptance: ['看到了'] } })
    edges.push({ type: 'serves', to: step.id })
  }
  const big = await g.run('human', { op: 'propose', reason: '大模块', node: { type: 'feature', title: '大模块', parent: 'goal-1', edges } })
  const oneMore = await g.run('human', { op: 'propose', reason: '再一步', node: { type: 'step', title: '第 21 步', parent: 'flow-3', acceptance: ['看到了'] } })
  refused(await g.act('human', { op: 'link', id: big.id, reason: '第 21 条', type: 'serves', to: oneMore.id }), 'invalid', 'to')
})

userTest('stale serves do not gate the write that closes the work; a new edge to a dropped step does (design §1.4 item 11)', async g => {
  await g.act('human', { op: 'link', id: 'task-1', reason: '连到将废的步骤', type: 'serves', to: 'step-4' })
  await g.act('human', { op: 'status', id: 'step-4', to: 'dropped', reason: '人不要这一步了' })
  // The task closes, edits and drops as usual: its old serves is not re-judged (§3.4).
  await g.act('human', { op: 'status', id: 'task-1', to: 'done', reason: '做完了', evidence: [{ kind: 'commit', ref: WALK_AT }] })
  await g.act('llm', { op: 'edit', id: 'task-1', reason: '补一句', set: { body: '接口做完' } })
  await g.act('human', { op: 'unlink', id: 'task-1', reason: '摘掉旧线', type: 'serves', to: 'step-4' })
  await g.act('human', { op: 'status', id: 'task-1', to: 'doing', reason: '重开' })
  await g.act('human', { op: 'status', id: 'task-1', to: 'dropped', reason: '不要了' })
  // A new edge to the dropped step is refused wherever it comes from.
  refused(await g.act('human', { op: 'link', id: 'task-1', reason: '再连', type: 'serves', to: 'step-4' }), 'invalid', 'to')
})

userTest('a kept next edge to a stale step does not block a relink; a new one does (design §1.4 item 11)', async g => {
  await g.act('human', { op: 'link', id: 'step-1', reason: '分支', type: 'next', to: 'step-3', when: '密码错' })
  await g.act('human', { op: 'status', id: 'step-3', to: 'dropped', reason: '人不要了' })
  await g.act('llm', { op: 'edit', id: 'step-1', reason: '改正文', set: { body: '改过' } })
  // The kept entry points at the dropped step: not new, so W5 does not fire; the other edge changed.
  await g.act('human', { op: 'relink', id: 'step-1', reason: '人要的分支', next: [{ to: 'step-3', when: '密码错' }, { to: 'step-2', when: '密码对' }], relay: '密码对就走确认借阅' })
  // A new entry to the dropped step is refused.
  refused(await g.act('human', { op: 'relink', id: 'step-1', reason: '连回废步骤', next: [{ to: 'step-3', when: '密码错' }, { to: 'step-2', when: '密码对' }, { to: 'step-3' }] }), 'invalid', 'next[0]')
  // Restoring the step is not a write the rules judge.
  await g.act('human', { op: 'status', id: 'step-3', to: 'approved', reason: '人又要了' })
})

userTest('restoring a node may exceed the limits, and only a new edge is gated afterwards (design §1.4 item 11)', async g => {
  // Eight servers serve step-1 from the fixture. Drop and restore one: the write is not refused.
  await g.act('human', { op: 'status', id: 'feat-8', to: 'dropped', reason: '先不要这个模块' })
  await g.act('human', { op: 'status', id: 'feat-8', to: 'approved', reason: '又要了' })
  // A ninth live server cannot be added while eight serve the step.
  const extra = await g.run('human', { op: 'propose', reason: '第九个模块', node: { type: 'feature', title: '第九个', parent: 'goal-1' } })
  refused(await g.act('human', { op: 'link', id: extra.id, reason: '第九条线', type: 'serves', to: 'step-1' }), 'invalid', 'to')
  // Dropping the step itself lifts the count; restoring it is fine with all eight back.
  await g.act('human', { op: 'status', id: 'step-1', to: 'dropped', reason: '这步先不要' })
  await g.act('human', { op: 'status', id: 'step-1', to: 'approved', reason: '这步又要了' })
  refused(await g.act('human', { op: 'link', id: extra.id, reason: '第九条线', type: 'serves', to: 'step-1' }), 'invalid', 'to')
})

userTest('a task that becomes a review keeps no serves; the same write to its body is fine (design §1.4 item 11)', async g => {
  await g.act('human', { op: 'link', id: 'task-1', reason: '连一步', type: 'serves', to: 'step-2' })
  refused(await g.act('llm', { op: 'edit', id: 'task-1', reason: '改成评审', set: { kind: 'review' } }), 'invalid', 'set.kind')
  await g.act('llm', { op: 'edit', id: 'task-1', reason: '改正文没事', set: { body: '接口' } })
})

userTest('relink: one write, one history of the real edges, nothing recorded for what stayed (design §1.4 item 12)', async g => {
  // step-2 carries next -> step-3 (no when). Adding a condition rewrites the edge: unlink of the old, link of the new.
  const done = must(await g.act('llm', { op: 'relink', id: 'step-2', reason: '分支', next: [{ to: 'step-3', when: '已登录' }, { to: 'step-1', when: '没登录' }], relay: '没登录就回到第一步' }))
  assert.equal(done.node.edges?.filter(edge => edge.type === 'next').length, 2)
  const history = (await g.node('step-2')).history
  const unlink = history.at(-3)
  const link = history.at(-1)
  assert.equal(unlink?.op, 'unlink')
  assert.deepEqual(unlink?.edge, { type: 'next', to: 'step-3' })
  assert.equal(unlink?.relay, '没登录就回到第一步')
  assert.equal(link?.op, 'link')
  assert.deepEqual(link?.edge, { type: 'next', to: 'step-1', when: '没登录' })
  assert.equal(link?.at, unlink?.at, 'same time, reason and relay on both entries')
  assert.equal(link?.reason, unlink?.reason)
  // An unchanged list is refused as a conflict; nothing is recorded.
  const before = (await g.node('step-2')).history.length
  refused(await g.act('human', { op: 'relink', id: 'step-2', reason: '原样', next: [{ to: 'step-3', when: '已登录' }, { to: 'step-1', when: '没登录' }] }), 'conflict', 'next')
  assert.equal((await g.node('step-2')).history.length, before)
  refused(await g.act('human', { op: 'relink', id: 'step-2', reason: '太多', next: Array.from({ length: USER_LIMITS.relinkEdges + 1 }, () => ({ to: 'step-1' })) }), 'invalid', 'next')
  refused(await g.act('human', { op: 'relink', id: 'step-2', reason: '重复', next: [{ to: 'step-3' }, { to: 'step-3', when: '密码错' }] }), 'invalid', 'next[0]')
  refused(await g.act('human', { op: 'relink', id: 'flow-1', reason: '两条入口', next: [{ to: 'step-1' }, { to: 'step-2' }] }), 'invalid', 'next')
  refused(await g.act('human', { op: 'relink', id: 'role-1', reason: '不是步骤', next: [] }), 'invalid', 'id')
  refused(await g.engine.apply('human', { op: 'relink', id: 'step-2', rev: 'stale', reason: '过期', next: [] }), 'stale_revision', 'rev')
  refused(await g.engine.apply('llm', { op: 'relink', id: 'step-2', rev: await g.rev('step-2'), reason: '自己改', next: [{ to: 'step-1' }] }), 'forbidden')
})

userTest('walk: who may record what (design §1.4 item 14)', async g => {
  await g.act('harness', { op: 'walk', id: 'step-1', reason: '作业 1 走一遍', evidence: walkEvidence() })
  refused(await g.act('harness', { op: 'walk', id: 'step-1', reason: '作业 2', evidence: walkEvidence({ ref: 'person:conversation' }) }), 'invalid', 'evidence')
  refused(await g.engine.apply('llm', { op: 'walk', id: 'step-1', rev: await g.rev('step-1'), reason: '自报', evidence: walkEvidence() }), 'forbidden', 'evidence')
  await g.act('llm', { op: 'walk', id: 'step-1', reason: '人走完录的', evidence: walkEvidence({ ref: 'person:conversation', note: `@${WALK_AT} 人说没问题` }), relay: '我走了一遍，没问题' })
  refused(await g.act('llm', { op: 'walk', id: 'step-1', reason: '人走完录的', evidence: walkEvidence({ ref: 'command:npm test' }), relay: '我走了一遍' }), 'invalid', 'evidence')
  await g.act('human', { op: 'walk', id: 'step-1', reason: '人自己记', evidence: [{ kind: 'walk', ref: 'person:我的记录', exit: 0, note: `@${WALK_AT} 我走了` }] })
  const draft = await g.run('llm', { op: 'propose', reason: '草稿', node: { type: 'step', title: '草稿步骤', parent: 'flow-1' } })
  refused(await g.act('harness', { op: 'walk', id: draft.id, reason: '草稿步骤', evidence: walkEvidence() }), 'bad_transition', 'id')
  await g.act('human', { op: 'status', id: 'step-3', to: 'dropped', reason: '人不要了' })
  refused(await g.act('harness', { op: 'walk', id: 'step-3', reason: '废步骤', evidence: walkEvidence() }), 'bad_transition', 'id')
})

userTest('walk: the evidence shapes and the ten kept on the node (design §1.4 item 14)', async g => {
  refused(await g.engine.apply('harness', { op: 'walk', id: 'step-1', rev: await g.rev('step-1'), reason: '没有证据', evidence: [] }), 'invalid', 'evidence')
  refused(await g.engine.apply('harness', { op: 'walk', id: 'step-1', rev: await g.rev('step-1'), reason: '太多证据', evidence: Array.from({ length: USER_LIMITS.walkEvidence + 1 }, () => ({ kind: 'walk' as const, ref: 'command:npm test', exit: 0, note: `@${WALK_AT} 一次` })) }), 'invalid', 'evidence')
  refused(await g.act('harness', { op: 'walk', id: 'step-1', reason: 'note 不合式', evidence: walkEvidence({ note: '没有提交号' }) }), 'invalid', 'evidence[0].note')
  refused(await g.act('harness', { op: 'walk', id: 'step-1', reason: '别的种类', evidence: [{ kind: 'test', ref: 'npm test', exit: 0 }] }), 'invalid', 'evidence[0].kind')
  for (let index = 0; index < USER_LIMITS.walkKept + 2; index++) {
    await g.act('harness', { op: 'walk', id: 'step-2', reason: `第 ${index} 次走`, evidence: walkEvidence({ note: `@${WALK_AT} 第 ${index} 次` }) })
  }
  const node = await g.node('step-2')
  const kept = node.evidence?.filter(entry => entry.kind === 'walk') ?? []
  assert.equal(kept.length, USER_LIMITS.walkKept, 'the node keeps the most recent walks')
  assert.ok(kept.every(entry => entry.note !== `@${WALK_AT} 第 0 次`), 'the oldest fell off the node')
  assert.equal(node.history.filter(entry => entry.op === 'walk').length, USER_LIMITS.walkKept + 2, 'the history keeps them all')
})

userTest('the propose and relink of the example pass the real transcribe check, once per node (design §1.4 item 13)', async g => {
  const words = '借书前要先交押金'
  // The fixture clock ticks one second per write; the seed has spent 18. The person speaks after step-1's proposal (:07) and before the relink below (:19).
  const at = Date.UTC(2026, 9, 28, 8, 0, 15)
  const events: SessionEventLike[] = [
    { type: 'assistant/message', seq: 0, time: at, data: { message: { role: 'assistant', content: [{ type: 'text', text: '我建议加一步' }], source: { kind: 'model' } }, turn: 1 } },
    { type: 'user/message', seq: 1, time: at + 1, data: { id: 'u1', role: 'user', content: [{ type: 'text', text: words }], source: { kind: 'user' } } },
  ]
  const state: TalkState = talkFold({}, events)
  const deps: GraphRuleDeps = {
    graph: () => ({ dirFor: () => g.dir }) as unknown as GraphFocusService,
    checkRelay: (_agent, quotes, afterMs) => {
      const said = personSaid(state, quotes, afterMs)
      return said.ok ? { ok: true } : { ok: false, reason: said.reason, offBoundary: said.offBoundary }
    },
  }
  const agent = { id: 'main', session: { header: { cwd: g.dir }, id: 's1' } }
  // The person's words came after the flow's last change but the new step has no history: the propose passes with the words as relay.
  const propose = await judgeMainAgentGraph(deps, agent, {
    name: 'graph_propose',
    arguments: { node: { type: 'step', parent: 'flow-1', title: '交押金', acceptance: ['页面提示押金已收'], edges: [{ type: 'next', to: 'step-2' }] }, reason: words, relay: words },
  })
  assert.equal(propose.kind, 'allow', JSON.stringify(propose))
  const created = await g.run('llm', { op: 'propose', reason: words, relay: words, node: { type: 'step', parent: 'flow-1', title: '交押金', acceptance: ['页面提示押金已收'], edges: [{ type: 'next', to: 'step-2' }] } })
  // The relink names the id the propose returned; the words are still later than step-8's last change... step-2's propose is newer, so the same sentence covers step-1's relink only because step-1 was proposed before the words.
  const relink = await judgeMainAgentGraph(deps, agent, {
    name: 'graph_relink',
    arguments: { id: 'step-1', rev: await g.rev('step-1'), reason: '没交押金的先去交押金', next: [{ to: 'step-2', when: '已交押金' }, { to: created.id, when: '没交押金' }], relay: words },
  })
  assert.equal(relink.kind, 'allow', JSON.stringify(relink))
  await g.run('llm', { op: 'relink', id: 'step-1', rev: await g.rev('step-1'), reason: '没交押金的先去交押金', next: [{ to: 'step-2', when: '已交押金' }, { to: created.id, when: '没交押金' }], relay: words })
  // Writing the same node a second time with the same sentence is denied: the words are older than its last change.
  const again = await judgeMainAgentGraph(deps, agent, {
    name: 'graph_relink',
    arguments: { id: 'step-1', rev: await g.rev('step-1'), reason: '再改一次', next: [{ to: 'step-2', when: '已交押金' }], relay: words },
  })
  assert.equal(again.kind, 'deny', 'the same sentence does not cover a second write to the node')
  assert.equal(again.kind === 'deny' && again.rule, 'main-agent-graph-relay')
})


/** The graph_walk tool over the fixture's directory. */
function walkToolOf(dir: string): { readonly walk: { readonly execute: (args: unknown, exec: unknown) => Promise<unknown> }, readonly exec: unknown } {
  return {
    walk: graphTools(dir, new Map()).find(tool => tool.name === 'graph_walk')!,
    exec: { agent: { session: { header: { cwd: dir }, id: 's' } } },
  }
}

/** graph_walk refuses with the engine's structured error; the JSON error text names the code. */
async function walkRefuses(walk: { readonly execute: (args: unknown, exec: unknown) => Promise<unknown> }, exec: unknown, args: Record<string, unknown>, code: string): Promise<void> {
  await assert.rejects(() => walk.execute(args, exec), (error: Error) => error.message.includes(`"${code}"`), `expected ${code}`)
}

userTest('graph_walk checks the flow before anything is written (design §1.4 item 15)', async g => {
  const { walk, exec } = walkToolOf(g.dir)
  const rev = await g.rev('flow-1')
  const relay = '我走了一遍，第一三步没问题'
  // steps must cover every live approved step exactly once.
  await walkRefuses(walk, exec, { id: 'flow-1', rev, steps: [{ id: 'step-1', ok: true }], reason: '走了一遍', relay }, 'invalid')
  await walkRefuses(walk, exec, { id: 'flow-1', rev, steps: [{ id: 'step-1', ok: true }, { id: 'step-2', ok: true }, { id: 'step-3', ok: true }, { id: 'step-4', ok: true }], reason: '走了一遍', relay }, 'invalid')
  await walkRefuses(walk, exec, { id: 'goal-1', rev: await g.rev('goal-1'), steps: [], reason: '走了一遍', relay }, 'invalid')
  // A proposed live step blocks the whole call before anything is written.
  await g.run('llm', { op: 'propose', reason: '草稿', node: { type: 'step', title: '草稿步骤', parent: 'flow-1' } })
  const fresh = await g.rev('flow-1')
  await walkRefuses(walk, exec, { id: 'flow-1', rev: fresh, steps: [{ id: 'step-1', ok: true }, { id: 'step-2', ok: true }, { id: 'step-3', ok: true }], reason: '走了一遍', relay }, 'bad_transition')
  await g.run('human', { op: 'reject', id: 'step-5', rev: await g.rev('step-5'), reason: '草稿不要了：这条不要' })
  // A stale rev is refused.
  await walkRefuses(walk, exec, { id: 'flow-1', rev: '0'.repeat(12), steps: [{ id: 'step-1', ok: true }, { id: 'step-2', ok: true }, { id: 'step-3', ok: true }], reason: '走了一遍', relay }, 'stale_revision')
  // The temp directory is no git repository: the walk is refused before any write.
  await walkRefuses(walk, exec, { id: 'flow-1', rev: await g.rev('flow-1'), steps: [{ id: 'step-1', ok: true }, { id: 'step-2', ok: true }, { id: 'step-3', ok: true }], reason: '走了一遍', relay }, 'unavailable')
  const node = await g.node('step-1')
  assert.equal((node.evidence ?? []).length, 0, 'nothing was written')
})

userTest('graph_walk records one walk entry per step at the project root HEAD (design §1.4 item 15)', async g => {
  execFileSync('git', ['init'], { cwd: g.dir })
  writeFileSync(join(g.dir, 'README.md'), '图书管理系统\n')
  const git = (args: readonly string[]): void => {
    execFileSync('git', args, { cwd: g.dir, env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' } })
  }
  git(['add', '.'])
  git(['commit', '-m', 'init'])
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: g.dir, encoding: 'utf8' }).trim().slice(0, 7)
  const { walk, exec } = walkToolOf(g.dir)
  const result = await walk.execute({
    id: 'flow-1',
    rev: await g.rev('flow-1'),
    steps: [{ id: 'step-1', ok: true }, { id: 'step-2', ok: false }, { id: 'step-3', ok: true }],
    reason: '人走完了借书',
    relay: '第一步第三步没问题\n第二步不对',
  }, exec) as { readonly ok: true, readonly commit: string, readonly changed: readonly string[] }
  assert.equal(result.ok, true)
  assert.equal(result.commit, head)
  assert.deepEqual(result.changed, ['step-1', 'step-2', 'step-3'])
  const first = await g.node('step-1')
  const walkEntry = first.history.at(-1)
  assert.equal(walkEntry?.op, 'walk')
  assert.equal(walkEntry?.relay, '第一步第三步没问题\n第二步不对')
  const evidence = first.evidence?.at(-1)
  assert.deepEqual(evidence, { kind: 'walk', ref: 'person:conversation', exit: 0, note: `@${head} 第一步第三步没问题` }, 'the note takes the first line of the relay')
  const second = await g.node('step-2')
  assert.equal(second.evidence?.at(-1)?.exit, 1, 'a step the person saw fail records exit 1')
})
