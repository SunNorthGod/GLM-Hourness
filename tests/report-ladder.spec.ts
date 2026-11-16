/**
 * The rules ladder and the floor proposals' L2 (M7 design 0.6 §3.12.2,
 * §3.12.3, m7-8): the thresholds fire on the counts and only on the counts —
 * up at three blocks in seven days, down for a quiet gate-level norm, the
 * floor addition at two reworked pieces in one directory — the person's
 * twenty-eight-day rejection keeps a norm off the ladder, norms without the
 * labels are not read, the shadow-to-enforce direction stays gone
 * (`d-code-rules-enforce`), every draft passes the landed checks, and the
 * same records read twice give the same proposals.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { draftRefusal } from '../src/execute/asks.ts'
import { renderHandbackComment } from '../src/execute/attempts.ts'
import { parseFloor } from '../src/execute/floor.ts'
import { ladderEntry, ladderProposals, rejectedNorms, type LadderInput } from '../src/report/ladder.ts'
import { floorProposals, floorTasks, type FloorInput, type FloorTaskFact } from '../src/report/floor-proposals.ts'
import { at, graphOf, node, withNode } from './execute-helpers.ts'

const NOW = Date.parse(at(100))
const DAY = 86_400_000

/** A violation journal line of one rule at a moment so many days before the fixture clock. */
const denial = (rule: string, daysAgo: number): { readonly at: string, readonly rule: string, readonly tool: string } =>
  ({ at: new Date(NOW - daysAgo * DAY).toISOString(), rule, tool: 'Bash' })

/** A shadow record (mode shadow with paths) — the journal line a shadowing rule writes, allowed through. */
const shadow = (rule: string, daysAgo: number): { readonly at: string, readonly rule: string, readonly mode: 'shadow', readonly paths: readonly string[] } =>
  ({ at: new Date(NOW - daysAgo * DAY).toISOString(), rule, mode: 'shadow', paths: ['x.ts'] })

/** A norm node carrying the ladder labels. */
const norm = (id: string, level: string, rules: string, title = '规矩'): ReturnType<typeof node> =>
  node({ id, type: 'norm', title, status: 'approved', body: `为什么有这条\n级别：${level}\n规则：${rules}` })

const input = (norms: readonly ReturnType<typeof node>[], violations: readonly unknown[], rejected: readonly string[] = []): LadderInput =>
  ({ nowMs: NOW, norms, violations: violations as LadderInput['violations'], rejected })

test('a norm below gate with three blocks in seven days is proposed up, two or older ones are not', () => {
  const three = ladderProposals(input([norm('norm-a', '提示词', 'rules:env-key')], [
    denial('rules:env-key', 1), denial('rules:env-key', 3), denial('rules:env-key', 6),
  ]))
  assert.equal(three.length, 1)
  assert.deepEqual(
    { norm: three[0]?.norm, direction: three[0]?.direction, counts: three[0]?.counts },
    { norm: 'norm-a', direction: 'up', counts: '近 7 天拦截 3 条' },
  )
  assert.equal(ladderProposals(input([norm('norm-a', '提示词', 'rules:env-key')], [
    denial('rules:env-key', 1), denial('rules:env-key', 3),
  ])).length, 0, 'two blocks stay quiet')
  assert.equal(ladderProposals(input([norm('norm-a', '提示词', 'rules:env-key')], [
    denial('rules:env-key', 8), denial('rules:env-key', 9), denial('rules:env-key', 10),
  ])).length, 0, 'blocks older than seven days do not point up')
})

test('blocks of another rule do not count, and a gate-level norm never proposes up', () => {
  const other = input([norm('norm-a', '提示词', 'rules:env-key')], [
    denial('rules:other', 1), denial('rules:other', 2), denial('rules:other', 3),
  ])
  assert.equal(ladderProposals(other).length, 0)
  const gate = input([norm('norm-a', '门禁', 'rules:env-key')], [
    denial('rules:env-key', 1), denial('rules:env-key', 2), denial('rules:env-key', 3),
  ])
  assert.equal(ladderProposals(gate).length, 0)
})

test('a quiet gate-level norm is proposed down; any block or shadow record in twenty-eight days keeps it', () => {
  const quiet = ladderProposals(input([norm('norm-a', '门禁', 'rules:env-key')], []))
  assert.equal(quiet.length, 1)
  assert.equal(quiet[0]?.direction, 'down')
  assert.equal(quiet[0]?.counts, '近 28 天拦截与影子都是 0')
  const denied = input([norm('norm-a', '门禁', 'rules:env-key')], [denial('rules:env-key', 27)])
  assert.equal(ladderProposals(denied).length, 0)
  const shadowed = input([norm('norm-a', '门禁', 'rules:env-key')], [shadow('rules:env-key', 20)])
  assert.equal(ladderProposals(shadowed).length, 0)
  const below = ladderProposals(input([norm('norm-a', '记忆', 'rules:env-key')], []))
  assert.equal(below.length, 0, 'a level below gate with no blocks does not demote')
})

test('the shadow-to-enforce direction stays gone: a shadow-heavy norm below gate proposes nothing', () => {
  const heavy = input([norm('norm-a', '提示词', 'rules:env-key')], Array.from({ length: 25 }, (_, index) => shadow('rules:env-key', index + 1)))
  assert.equal(ladderProposals(heavy).length, 0)
})

test('norms without the labels are not read, and a rejected norm is skipped for twenty-eight days', () => {
  const unlabeled = node({ id: 'norm-b', type: 'norm', title: '没有标签', status: 'approved', body: '只有正文' })
  const noRules = norm('norm-c', '门禁', '')
  assert.equal(ladderProposals(input([unlabeled, noRules], [])).length, 0)
  assert.equal(ladderEntry(unlabeled), undefined)
  const question = node({ id: 'q-1', type: 'question', title: '要不要升', status: 'approved', parent: 'norm-a' }, 10, 'llm', [
    { at: new Date(NOW - 10 * DAY).toISOString(), actor: 'llm', op: 'comment', text: '人在对话里否掉：先不升' },
  ])
  const graph = graphOf([norm('norm-a', '门禁', 'rules:env-key'), question])
  const rejected = rejectedNorms(graph, NOW)
  assert.ok(rejected.has('norm-a'))
  assert.equal(ladderProposals(input([norm('norm-a', '门禁', 'rules:env-key')], [], [...rejected])).length, 0)
  const old = node({ id: 'q-old', type: 'question', title: '要不要升', status: 'approved', parent: 'norm-a' }, 10, 'llm', [
    { at: new Date(NOW - 40 * DAY).toISOString(), actor: 'llm', op: 'comment', text: '人在对话里否掉：先不升' },
  ])
  assert.ok(!rejectedNorms(graphOf([norm('norm-a', '门禁', 'rules:env-key'), old]), NOW).has('norm-a'), 'a forty-day-old rejection no longer blocks')
})

test('every draft the ladder and the floor produce passes the landed checks', () => {
  const ladder = ladderProposals(input([
    norm('norm-a', '提示词', 'rules:env-key', '环境密钥不进调用'),
    norm('norm-b', '门禁', 'rules:files-only', '只经文件工具写'),
  ], [denial('rules:env-key', 1), denial('rules:env-key', 2), denial('rules:env-key', 3)]))
  const floor = floorProposals({
    nowMs: NOW,
    tasks: [
      { task: 't1', depth: 'light', landings: [NOW - 5 * DAY], reworkMs: [NOW - 2 * DAY], paths: ['src/env/a.ts'] },
      { task: 't2', depth: 'skip', landings: [NOW - 6 * DAY], reworkMs: [NOW - 1 * DAY], paths: ['src/env/b.ts'] },
    ],
    floor: parseFloor(undefined),
  })
  assert.equal(ladder.length, 2, 'the quiet gate-level norm proposes down beside the promoted one')
  assert.equal(floor.length, 1)
  for (const proposal of [...ladder, ...floor]) assert.equal(draftRefusal(proposal.ask.draft), undefined)
})

test('the floor proposal fires at two reworked pieces in one directory and the floor path covers it out', () => {
  const tasks: readonly FloorTaskFact[] = [
    { task: 't1', depth: 'light', landings: [NOW - 5 * DAY], reworkMs: [NOW - 2 * DAY], paths: ['src/env/a.ts'] },
    { task: 't2', depth: 'skip', landings: [NOW - 6 * DAY], reworkMs: [NOW - 1 * DAY], paths: ['src/env/b.ts'] },
    { task: 't3', depth: 'light', landings: [NOW - 7 * DAY], reworkMs: [], paths: ['src/env/c.ts'] },
  ]
  const base: FloorInput = { nowMs: NOW, tasks, floor: parseFloor(undefined) }
  const proposals = floorProposals(base)
  assert.equal(proposals.length, 1)
  assert.deepEqual(proposals[0]?.paths, ['src'])
  assert.equal(proposals[0]?.declared, 3)
  assert.equal(proposals[0]?.reworked, 2)
  assert.equal(floorProposals({ ...base, tasks: tasks.slice(0, 1) }).length, 0, 'one reworked piece proposes nothing')
  const covered = floorProposals({ ...base, floor: parseFloor(node({ id: 'norm-review-floor', type: 'norm', title: '清单', status: 'approved', acceptance: ['环境一类的改动重写过 `files src/`'] })) })
  assert.equal(covered.length, 0, 'a directory the floor already names is not proposed')
  assert.equal(floorProposals({ ...base, tasks: tasks.map(task => ({ ...task, landings: [NOW - 40 * DAY] })) }).length, 0, 'landings older than twenty-eight days are not the cohort')
  const stale = floorProposals({
    ...base,
    tasks: [
      { task: 't1', depth: 'light', landings: [NOW - 5 * DAY, NOW - 40 * DAY], reworkMs: [NOW - 45 * DAY], paths: ['src/env/a.ts'] },
      { task: 't2', depth: 'skip', landings: [NOW - 6 * DAY], reworkMs: [], paths: ['src/env/b.ts'] },
    ],
  })
  assert.equal(stale.length, 0, 'rework from an old landing is outside the window, and one reworked piece proposes nothing')
})

test('floorTasks reads the cohort the graph holds: handback depth over the declaration, landings from the evidence comments', () => {
  const iso = (ms: number): string => new Date(ms).toISOString()
  const graph = graphOf([
    node({ id: 't-light', type: 'task', title: '轻审', status: 'done' }, 10, 'llm', [
      { at: iso(now(30)), actor: 'harness', op: 'comment', text: `第 1 次派发 · r1 · 模型 x/y，理由：改环境行 · 审查：轻审，理由：纯数据\npins: x` },
      { at: iso(now(29)), actor: 'harness', op: 'comment', text: '第 1 次交回 · done · r1\n提交 1 个 · 文件 2 个 · 报告 无\n问题 0 · 假设 0 · 问了 0 次（答 0、超时 0）· 计划 0 版 · 主 Agent 发来 0 条 · 候选经验 0 条\n有效深浅 轻审' },
      { at: iso(now(28)), actor: 'harness', op: 'comment', text: '进主干 abc1234（从 def5678）· 检查 ok' },
      { at: iso(now(26)), actor: 'llm', op: 'status', from: 'done', to: 'doing', reason: '回归坏了' },
    ]),
    node({ id: 't-raised', type: 'task', title: '升到全审', status: 'done' }, 10, 'llm', [
      { at: iso(now(30)), actor: 'harness', op: 'comment', text: `第 1 次派发 · r1 · 模型 x/y，理由：改环境行 · 审查：轻审\npins: x` },
      { at: iso(now(29)), actor: 'harness', op: 'comment', text: '第 1 次交回 · done · r1\n提交 1 个 · 文件 1 个 · 报告 无\n问题 0 · 假设 0 · 问了 0 次（答 0、超时 0）· 计划 0 版 · 主 Agent 发来 0 条 · 候选经验 0 条\n有效深浅 全审（碰到了清单）' },
      { at: iso(now(28)), actor: 'harness', op: 'comment', text: '进主干 aaa（从 bbb）· 检查 ok' },
    ]),
    node({ id: 't-skip', type: 'task', title: '不审', status: 'done' }, 10, 'llm', [
      { at: iso(now(30)), actor: 'harness', op: 'comment', text: `第 1 次派发 · r1 · 模型 x/y，理由：文案 · 审查：不审\npins: x` },
      { at: iso(now(28)), actor: 'harness', op: 'comment', text: '进主干 ccc（从 ddd）· 检查 ok' },
    ]),
    node({ id: 't-full', type: 'task', title: '声明全审', status: 'done' }, 10, 'llm', [
      { at: iso(now(30)), actor: 'harness', op: 'comment', text: `第 1 次派发 · r1 · 模型 x/y，理由：守门 · 审查：全审\npins: x` },
      { at: iso(now(28)), actor: 'harness', op: 'comment', text: '进主干 eee（从 fff）· 检查 ok' },
    ]),
    node({ id: 't-fix', type: 'task', title: '修复', status: 'doing' }, 5, 'llm', [{ at: iso(now(5)), actor: 'llm', op: 'propose', reason: '修', to: 'doing' }]),
  ])
  const fix = graph.nodes.get('t-fix')
  if (fix === undefined) throw new Error('fixture lost')
  const linked = withNode(graph, { ...fix, edges: [{ type: 'source', to: 't-skip' }], history: [{ at: iso(now(20)), actor: 'llm', op: 'propose', reason: '修', to: 'doing' }] })
  const facts = floorTasks(linked)
  const named = new Map(facts.map(fact => [fact.task, fact]))
  assert.deepEqual([...named.keys()].sort(), ['t-light', 't-skip'], 'the raised and the declared-full tasks stay out')
  const light = named.get('t-light')
  assert.equal(light?.depth, 'light')
  assert.equal(light?.landings.length, 1)
  assert.equal(light?.reworkMs.length, 1, 'the reopen two days after landing counts')
  assert.equal(named.get('t-skip')?.depth, 'skip')
  assert.equal(named.get('t-skip')?.reworkMs.length, 1, 'the sourced fix task counts')
  assert.equal(floorProposals({ nowMs: NOW, tasks: facts, floor: parseFloor(undefined) }).length, 0, 'comments written before the 改动 line existed record no paths, so no group can form (the old-record fallback)')
})

test('the changed paths ride the handback comments and the proposal fires end to end', () => {
  const iso = (ms: number): string => new Date(ms).toISOString()
  const handback = (childId: string, depth: '轻审' | undefined, paths?: readonly string[]): string => renderHandbackComment({
    attempt: 1, status: 'done', childId, commits: 1, files: 1, questions: 0, assumptions: 0, asked: 0, answered: 0, timeouts: 0, plans: 0, incoming: 0, lessons: 0,
    ...(depth === undefined ? {} : { depth }), ...(paths === undefined ? {} : { paths }), problems: [],
  })
  const dispatched = (daysAgo: number, why: string, review: string) => ({
    at: iso(now(daysAgo)), actor: 'harness', op: 'comment' as const, text: `第 1 次派发 · r · 模型 x/y，理由：${why} · 审查：${review}\npins: x`,
  })
  const landed = (daysAgo: number) => ({ at: iso(now(daysAgo)), actor: 'harness', op: 'comment' as const, text: `进主干 abc${daysAgo}（从 def${daysAgo}）· 检查 ok` })
  const reopened = (daysAgo: number) => ({ at: iso(now(daysAgo)), actor: 'llm', op: 'status' as const, from: 'done', to: 'doing', reason: '回归坏了' })
  const floorNode = node({ id: 'norm-review-floor', type: 'norm', title: '必须全审的改动', status: 'approved', acceptance: ['文档一类的改动重写过 `files docs/`'] })
  const graph = graphOf([
    floorNode,
    node({ id: 't-a', type: 'task', title: '轻审', status: 'done' }, 10, 'llm', [
      dispatched(30, '改环境行', '轻审'),
      { at: iso(now(29)), actor: 'harness', op: 'comment', text: handback('r1', '轻审', ['src/env/a.ts']) },
      landed(28),
      reopened(26),
    ]),
    node({ id: 't-b', type: 'task', title: '不审', status: 'done' }, 10, 'llm', [
      dispatched(30, '改环境行', '不审'),
      { at: iso(now(28)), actor: 'harness', op: 'comment', text: handback('r2', undefined, ['src/env/b.ts']) },
      landed(27),
      reopened(25),
    ]),
    node({ id: 't-old', type: 'task', title: '旧批注', status: 'done' }, 10, 'llm', [
      dispatched(30, '改环境行', '轻审'),
      { at: iso(now(29)), actor: 'harness', op: 'comment', text: handback('r3', '轻审') },
      landed(28),
      reopened(26),
    ]),
  ])
  const facts = floorTasks(graph)
  const named = new Map(facts.map(fact => [fact.task, fact]))
  assert.deepEqual(named.get('t-a')?.paths, ['src/env/a.ts'], 'the handback comment carries the changed paths')
  assert.deepEqual(named.get('t-b')?.paths, ['src/env/b.ts'], 'a skip handback without a depth line still carries them')
  assert.deepEqual(named.get('t-old')?.paths, [], 'a handback without the line records none')
  const proposals = floorProposals({ nowMs: NOW, tasks: facts, floor: parseFloor(floorNode) })
  assert.equal(proposals.length, 1, 'two reworked pieces in one top-level directory the floor does not cover propose the addition')
  assert.deepEqual(proposals[0]?.paths, ['src'])
  assert.equal(proposals[0]?.declared, 2)
  assert.equal(proposals[0]?.reworked, 2)
  // The old-record fallback inside the same graph: the one carrying task cannot reach two, the old-shape task contributes nothing.
  const mixed = floorProposals({ nowMs: NOW, tasks: facts.filter(fact => fact.task !== 't-b'), floor: parseFloor(floorNode) })
  assert.equal(mixed.length, 0, 'one carrying task alone proposes nothing and the old-shape task joins no group')
})

test('the paths read is the latest handback comment that carries the 改动 line', () => {
  const iso = (ms: number): string => new Date(ms).toISOString()
  const handback = (childId: string, paths?: readonly string[]): string => renderHandbackComment({
    attempt: 1, status: 'done', childId, commits: 1, files: 1, questions: 0, assumptions: 0, asked: 0, answered: 0, timeouts: 0, plans: 0, incoming: 0, lessons: 0, depth: '轻审',
    ...(paths === undefined ? {} : { paths }), problems: [],
  })
  const landed = (daysAgo: number) => ({ at: iso(now(daysAgo)), actor: 'harness', op: 'comment' as const, text: `进主干 abc${daysAgo}（从 def${daysAgo}）· 检查 ok` })
  const graph = graphOf([
    node({ id: 't-x', type: 'task', title: '两轮', status: 'done' }, 10, 'llm', [
      { at: iso(now(30)), actor: 'harness', op: 'comment', text: handback('r1', ['src/env/first.ts']) },
      landed(28),
      { at: iso(now(20)), actor: 'harness', op: 'comment', text: handback('r2') },
    ]),
    node({ id: 't-y', type: 'task', title: '两轮反向', status: 'done' }, 10, 'llm', [
      { at: iso(now(30)), actor: 'harness', op: 'comment', text: handback('r3') },
      landed(28),
      { at: iso(now(20)), actor: 'harness', op: 'comment', text: handback('r4', ['src/env/second.ts']) },
    ]),
  ])
  const named = new Map(floorTasks(graph).map(fact => [fact.task, fact]))
  assert.deepEqual(named.get('t-x')?.paths, ['src/env/first.ts'], 'a later comment whose diff did not answer falls back to the latest one that recorded')
  assert.deepEqual(named.get('t-y')?.paths, ['src/env/second.ts'], 'the latest recording wins over an older one')
})

function now(daysAgo: number): number {
  return NOW - daysAgo * DAY
}

test('the same records read twice give the same proposals', () => {
  const violations = [denial('rules:env-key', 1), denial('rules:env-key', 2), denial('rules:env-key', 3)]
  const once = ladderProposals(input([norm('norm-a', '提示词', 'rules:env-key')], violations))
  const twice = ladderProposals(input([norm('norm-a', '提示词', 'rules:env-key')], violations))
  assert.deepEqual(once, twice)
})
