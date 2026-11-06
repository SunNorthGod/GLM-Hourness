/**
 * The loop board's registry and its row (docs/ORCHESTRATION.md §18.4 to
 * §18.6; loop board design 0.6 §3.1 to §3.3, §4.1, §5.2, §12): what the rows
 * hand to `contribute` and what comes out of it, the events and the four
 * entries the loop row brings itself, and the row skeleton on the fake host
 * (the service reader is in contracts.spec.ts). M7's entries are not in
 * src/loops/: the table
 * here is test data shaped like loop board design §5.1, and it goes through
 * the real `contribute`.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { CHANNEL_EVENTS, CHANNEL_LOGIN_REJECTED, CHANNEL_PEAK_CHANGED, CHANNEL_QUOTA_LOW, channelEntries, loginRejectedKey, quotaLowKey } from '../src/loops/channel.ts'
import { LOOP_ACTIONS, LOOP_DEFAULTS, DEPENDENCY_FILES } from '../src/loops/defaults.ts'
import { fileChangedKey, hostRestartedKey, LOOP_EVENT_TABLE, LOOP_EVENTS, waitingOnHumanKey } from '../src/loops/events.ts'
import { apply, inject, name, type LoopsContext } from '../src/loops/index.ts'
import { validateEntry, type LoopEntryDefinition } from '../src/loops/model.ts'
import { createRegistry, LOOPS_SOURCE, validateContribution, type LoopsRegistry } from '../src/loops/registry.ts'
import { LOOPS_SERVICE, loopsService, type Contribution, type ContributionSource, type LoopEventDeclaration, type LoopEventField, type LoopEventParam, type LoopEventRecord, type LoopsService } from '../src/loops/service.ts'
import { validateWhen } from '../src/loops/trigger.ts'
import { collectHealth, healthServiceName } from '../src/shared/health.ts'
import { plainWordsIn } from '../src/graph/plain-question.ts'
import { GLM_LOOP_DEFAULTS } from '../src/glm-llm/loop-defaults.ts'
import type { UsagePricing } from '../src/shared/pricing.ts'
import { fakeInjector, serviceStore } from './fake-rc3.ts'

const NOW = new Date('2026-11-02T01:00:00Z')
const EXECUTE: ContributionSource = { plugin: 'dsh-hourness', row: 'glm-hourness/execute' }
const OPERATE: ContributionSource = { plugin: 'dsh-hourness', row: 'glm-hourness/operate' }
const ENV: ContributionSource = { plugin: 'dsh-hourness', row: 'glm-hourness/env' }
const RULES: ContributionSource = { plugin: 'dsh-hourness', row: 'glm-hourness/rules' }
const LOOPS: ContributionSource = { plugin: 'dsh-hourness', row: 'glm-hourness/loops' }

/** The loop row's hand-over as the row builds it (src/loops/index.ts): the entries and the one action, with a run the specs stand in for. */
const LOOP_HANDOVER = (run: NonNullable<Contribution['run']> = () => Promise.resolve({ outcome: 'skipped', reason: 'the specs do not run it' })): Contribution => ({ entries: LOOP_DEFAULTS, actions: LOOP_ACTIONS, run })

// ------------------------------------------------- test data shaped like M7's

const field = (fieldName: string, type: LoopEventField['type'], title: string, filter?: LoopEventField['filter']): LoopEventField => ({ name: fieldName, type, title, ...(filter === undefined ? {} : { filter }) })
const event = (id: string, title: string, fields: readonly LoopEventField[], personSelectable = true): LoopEventDeclaration => ({ id, title, fields, personSelectable })

/** Loop board design §4.2: the nine events M7 declares. */
const M7_EVENTS: readonly LoopEventDeclaration[] = [
  event('hourness.design-released', '设计放行了', [field('goal', 'string', '目标', 'in'), field('release', 'string', '放行时刻')]),
  event('hourness.handback', '一件活交回了', [field('task', 'string', '任务', 'in'), field('attempt', 'number', '第几次', 'atLeast'), field('status', 'string', '交回状态', 'in'), field('depth', 'string', '审查深浅', 'in'), field('reviewTask', 'string', '审查任务'), field('commits', 'number', '提交数'), field('floorHit', 'string', '碰到的必审条')]),
  event('hourness.review-passed', '审查过了', [field('task', 'string', '任务', 'in'), field('round', 'number', '第几轮')]),
  event('hourness.review-skipped', '按理由不审', [field('task', 'string', '任务', 'in')]),
  event('hourness.stopped', '一件活停下来了', [field('node', 'string', '节点', 'in'), field('kind', 'string', '哪种停下', 'in'), field('rounds', 'number', '轮数')]),
  event('hourness.tasks-closed', '一个目标下的活都关了', [field('goal', 'string', '目标', 'in')]),
  event('hourness.trunk-advanced', '合进主干了', [field('from', 'string', '原来的提交'), field('to', 'string', '现在的提交'), field('tasks', 'strings', '涉及的任务'), field('files', 'strings', '改到的文件', 'paths'), field('truncated', 'boolean', '名单被截断', 'is')]),
  event('hourness.outside-advance', '有人不经系统直接改了主干', [field('from', 'string', '原来的提交'), field('to', 'string', '现在的提交'), field('files', 'strings', '改到的文件', 'paths'), field('truncated', 'boolean', '名单被截断', 'is')]),
  event('hourness.host-started', '主 Agent 的会话开始走动', [], false),
]

const limits = (debounceSeconds: number, maxPerHour: number): Pick<LoopEntryDefinition, 'limits'> => ({ limits: { debounceSeconds, maxPerHour } })

/** Loop board design §5.1 rows 1 to 7, with the `why` M7 is asked to add. */
const M7_ENTRIES: readonly LoopEntryDefinition[] = [
  { id: 'execute.release', title: '设计放行之后：主 Agent 开始自己推进', why: '放行的设计要有人接着往下做，这一项让主 Agent 不等你就开工', when: { kind: 'event', events: ['hourness.design-released'] }, action: { kind: 'harness', action: 'execute.start-drive', tell: { text: 'The drive for goal {goal} has started. Split the goal into tasks and dispatch them; do not wait for the human.', wake: true } }, ...limits(5, 30) },
  { id: 'execute.handback', title: '一件活交回之后：派审查', why: '交回的活要有人审过才进主干，这一项提醒主 Agent 去派审查', when: { kind: 'event', events: ['hourness.handback'] }, action: { kind: 'tell-main', text: 'Task {task} came back (attempt {attempt}, {commits} commits). Dispatch a review at the depth you choose.', wake: true }, ...limits(5, 30) },
  { id: 'execute.reviewed', title: '审查过了（或按理由不审）之后：做出要进主干的提交，检查后合入', why: '审过的活要变成一次提交并合入主干，这一项提醒主 Agent 去做', when: { kind: 'event', events: ['hourness.review-passed', 'hourness.review-skipped'] }, action: { kind: 'tell-main', text: 'Review of {task} is done. Make the commit with its trailers, run check_commit and fast-forward the trunk.', wake: true }, ...limits(5, 30) },
  { id: 'execute.stopped', title: '审查或检查一再不过停下之后：在对话里问你', why: '停下的活不能再自动派，这一项让主 Agent 把它交给你定', when: { kind: 'event', events: ['hourness.stopped'] }, action: { kind: 'tell-main', text: 'Work on {node} stopped after {rounds} rounds ({kind}). Do not dispatch it again; put it to the human with propose_to_human.', wake: true }, ...limits(5, 30) },
  { id: 'execute.tasks-closed', title: '一个目标下的活都关了之后：派目标整体的审查', why: '活都做完了还要看目标整体对不对，这一项提醒主 Agent 去派审查', when: { kind: 'event', events: ['hourness.tasks-closed'] }, action: { kind: 'tell-main', text: 'All tasks of goal {goal} are closed. Dispatch the review of the goal as a whole.', wake: true }, ...limits(5, 30) },
  { id: 'execute.trunk', title: '合进主干之后：在主干上跑一遍完整的检查', why: '每次进主干的内容都要整体检查一遍，这一项在后台跑完再告诉主 Agent', when: { kind: 'event', events: ['hourness.trunk-advanced', 'hourness.outside-advance'] }, action: { kind: 'harness', action: 'execute.trunk-check' }, ...limits(30, 30) },
  { id: 'execute.restart', title: '重启之后：接上停了的活', why: '重启会打断正在做的活，这一项让执行行把停了的接上', when: { kind: 'event', events: ['hourness.host-started'] }, action: { kind: 'harness', action: 'execute.reconcile' }, ...limits(5, 6) },
]

const M7_ACTIONS = ['execute.start-drive', 'execute.trunk-check', 'execute.reconcile', 'execute.resume-drive'].map(id => ({ id, title: id }))
const done = (): Promise<{ readonly outcome: 'done' }> => Promise.resolve({ outcome: 'done' })

const M7_EXECUTE: Contribution = { events: M7_EVENTS, entries: M7_ENTRIES, actions: M7_ACTIONS, run: done }

/** Loop board design §5.1 rows 8 to 10: time entries, no event, no action. */
const M7_OPERATE: Contribution = {
  entries: [
    { id: 'operate.morning', title: '每天 08:30：晨报', why: '每天早上把昨天的进展和要你定的事摆给你看', when: { kind: 'daily', time: '08:30' }, action: { kind: 'tell-main', text: 'Write the morning report and show it as it is.', wake: true } },
    { id: 'operate.weekly', title: '每周一 09:00：周报', why: '每周回头看一次，提议下周值得做的事', when: { kind: 'weekly', time: '09:00', weekdays: [1] }, action: { kind: 'tell-main', text: 'Write the weekly report and propose at most three things.', wake: true } },
    { id: 'operate.patrol', title: '每天 02:30：夜间巡检', why: '夜里把计划内的活清一遍，要你定的留到第二天', when: { kind: 'daily', time: '02:30' }, action: { kind: 'tell-main', text: 'Patrol: do or dispatch what is planned and leave what needs the human for the next batch.', wake: false } },
  ],
}

function registryWith(): { readonly registry: LoopsRegistry, readonly reports: string[] } {
  const reports: string[] = []
  return { registry: createRegistry({ now: () => NOW, report: (message) => { reports.push(message) } }), reports }
}

const ids = (entries: readonly { readonly entry: { readonly id: string } }[]): readonly string[] => entries.map(item => item.entry.id)

/** The execute contribution with its entries changed by `edit`, and its first entry replaced by a copy changed by `patch`. */
function withEntry(patch: Record<string, unknown>, index = 1): Contribution {
  return { ...M7_EXECUTE, entries: M7_ENTRIES.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)) }
}

// ------------------------------------------------- what M7 hands over, whole

test('the M7-shaped tables go through contribute whole: every entry, event and action is accepted, nothing is dropped, nothing is reported', () => {
  const { registry, reports } = registryWith()
  const execute = registry.contribute(EXECUTE, M7_EXECUTE)
  const operate = registry.contribute(OPERATE, M7_OPERATE)
  assert.ok(execute.ok && operate.ok)
  assert.deepEqual(execute.accepted, M7_ENTRIES.map(entry => entry.id))
  assert.deepEqual(execute.dropped, [])
  assert.deepEqual(operate.accepted, ['operate.morning', 'operate.weekly', 'operate.patrol'])
  assert.deepEqual(operate.dropped, [])
  assert.deepEqual(reports, [])
  const listed = registry.entries()
  assert.deepEqual(ids(listed), [...M7_ENTRIES.map(entry => entry.id), 'operate.morning', 'operate.weekly', 'operate.patrol'])
  assert.ok(listed.every(item => item.state === 'active' && item.waitingOn.length === 0))
  for (const declared of M7_EVENTS) assert.ok(registry.events().has(declared.id), declared.id)
  const first = listed[0]?.entry
  assert.deepEqual(first?.source, { kind: 'plugin', plugin: 'dsh-hourness', row: 'glm-hourness/execute' })
  assert.match(first?.rev ?? '', /^[0-9a-f]{12}$/)
})

test('the rev of a plugin\'s entry is the first 12 hex digits of the SHA-256 of its canonical JSON: the same entry in another key order has the same rev, a changed word another', () => {
  const rev = (entry: LoopEntryDefinition): string | undefined => {
    const { registry } = registryWith()
    registry.contribute(OPERATE, { entries: [entry] })
    return registry.entries()[0]?.entry.rev
  }
  const base: LoopEntryDefinition = { id: 'operate.morning', title: 'A', why: 'B', when: { kind: 'daily', time: '08:30' }, action: { kind: 'tell-main', text: 'T', wake: true } }
  const reordered = { action: base.action, when: base.when, why: base.why, title: base.title, id: base.id } as LoopEntryDefinition
  assert.equal(rev(base), rev(reordered))
  assert.notEqual(rev(base), rev({ ...base, action: { kind: 'tell-main', text: 'T2', wake: true } }))
  assert.notEqual(rev(base), undefined)
})

// ------------------------------------------- a contribution refused as a whole

test('a source that is not a plugin name and a row id is refused', () => {
  const { registry, reports } = registryWith()
  for (const source of [{ plugin: 'Bad Name', row: 'glm-hourness/execute' }, { plugin: 'dsh-hourness', row: 'Glm Hourness' }, { plugin: '', row: 'x' }, { plugin: 'dsh-hourness', row: 'a'.repeat(65) }, { plugin: 7, row: 'x' }] as unknown as ContributionSource[]) {
    const result = registry.contribute(source, M7_OPERATE)
    assert.equal(result.ok, false, JSON.stringify(source))
  }
  assert.equal(registry.entries().length, 0)
  assert.ok(reports.length >= 1)
})

test('a namespace belongs to the first source that hands it over; the same source handing over again replaces its own', () => {
  const { registry, reports } = registryWith()
  assert.ok(registry.contribute(OPERATE, M7_OPERATE).ok)
  const rival = registry.contribute(ENV, { entries: [{ ...M7_OPERATE.entries[0], id: 'operate.evening' }] })
  assert.deepEqual(rival, { ok: false, reason: 'operate 已由 glm-hourness/operate 交过' })
  assert.deepEqual(reports, ['dsh-hourness 的 glm-hourness/env 交来的整份被拒：operate 已由 glm-hourness/operate 交过'])
  assert.equal(registry.entries().length, 3, 'the holder is untouched')
  const again = registry.contribute(OPERATE, { entries: [M7_OPERATE.entries[0]] })
  assert.ok(again.ok)
  assert.deepEqual(ids(registry.entries()), ['operate.morning'], 'the second hand-over replaces the first whole')
})

test('loops is the loop row\'s, channel is nobody\'s, gate is the rules row\'s and only for events', () => {
  const { registry } = registryWith()
  const entry = (id: string): LoopEntryDefinition => ({ ...M7_OPERATE.entries[0], id })
  assert.deepEqual(registry.contribute(EXECUTE, { entries: [entry('loops.mine')] }), { ok: false, reason: 'loops 留给循环行' })
  assert.deepEqual(registry.contribute(EXECUTE, { entries: [entry('channel.mine')] }), { ok: false, reason: 'channel 是通道事件的名字空间，不能由一份交来的东西占用' })
  const gate = event('gate.tool-call', '工具调用之前', [field('tool', 'string', '工具', 'in'), field('session', 'string', '会话', 'in')], false)
  assert.deepEqual(registry.contribute(ENV, { events: [gate], entries: [] }), { ok: false, reason: 'glm-hourness/env 不能声明拦路的事件' })
  assert.deepEqual(registry.contribute(ENV, { events: [gate], entries: [entry('env.mine')] }), { ok: false, reason: 'glm-hourness/env 不能声明拦路的事件' }, 'in whatever namespace the rest is')
  const accepted = registry.contribute(RULES, { events: [gate], entries: [entry('gate.mine')] })
  assert.ok(accepted.ok)
  assert.deepEqual(accepted.dropped.map(item => item.id), ['gate.mine'], 'the rules row hands over events only; its entries are on the rules board')
  assert.ok(registry.events().has('gate.tool-call'), 'a gating event may carry a session field, the others may not')
  assert.equal(registry.entries().length, 0)
  const own = registry.contribute(LOOPS, { entries: [{ ...entry('loops.mine'), ...limits(5, 6) }] })
  assert.ok(own.ok)
  assert.deepEqual(own.accepted, ['loops.mine'])
})

test('the namespace of M7\'s events is hourness., but only the execute row may use it', () => {
  const { registry } = registryWith()
  const stray = event('hourness.sneaky', '偷偷的事', [])
  const result = registry.contribute(OPERATE, { events: [stray], entries: [M7_OPERATE.entries[0]] })
  assert.ok(result.ok)
  assert.deepEqual(result.dropped.map(item => item.id), ['hourness.sneaky'])
  assert.match(result.dropped[0]?.reason ?? '', /^id：/)
  assert.equal(registry.events().has('hourness.sneaky'), false)
  assert.ok(registry.contribute(EXECUTE, M7_EXECUTE).ok)
  assert.ok(registry.events().has('hourness.handback'))
})

test('a hand-over whose namespace is hourness. from any row but the execute row is refused as a whole; the execute row\'s hand-over afterwards keeps all its events', () => {
  const { registry, reports } = registryWith()
  const refusal = { ok: false, reason: 'hourness 留给执行行（glm-hourness/execute），hourness. 的事件只从它收' }
  const trunk = M7_EVENTS.find(declared => declared.id === 'hourness.trunk-advanced')
  assert.ok(trunk)
  const mine: LoopEntryDefinition = { ...M7_OPERATE.entries[0], id: 'hourness.mine' }
  assert.deepEqual(registry.contribute(ENV, { events: [trunk], entries: [mine] }), refusal, 'entry and event in hourness.')
  assert.deepEqual(registry.contribute(OPERATE, { events: [trunk] }), refusal, 'an event alone')
  assert.deepEqual(registry.contribute(OPERATE, { entries: [mine] }), refusal, 'an entry alone')
  assert.deepEqual(registry.contribute({ plugin: 'other-plugin', row: 'other/row' }, { actions: [{ id: 'hourness.act', title: '动作' }], run: done }), refusal, 'an action alone')
  assert.equal(registry.events().has('hourness.trunk-advanced'), false)
  assert.equal(registry.entries().length, 0)
  assert.deepEqual(reports, [
    'dsh-hourness 的 glm-hourness/env 交来的整份被拒：hourness 留给执行行（glm-hourness/execute），hourness. 的事件只从它收',
    'dsh-hourness 的 glm-hourness/operate 交来的整份被拒：hourness 留给执行行（glm-hourness/execute），hourness. 的事件只从它收',
    'other-plugin 的 other/row 交来的整份被拒：hourness 留给执行行（glm-hourness/execute），hourness. 的事件只从它收',
  ])
  const execute = registry.contribute(EXECUTE, M7_EXECUTE)
  assert.ok(execute.ok)
  assert.deepEqual(execute.dropped, [])
  for (const declared of M7_EVENTS) assert.ok(registry.events().has(declared.id), declared.id)
  assert.deepEqual(ids(registry.entries()), M7_ENTRIES.map(entry => entry.id))
})

test('a contribution that hands over nothing claims no namespace', () => {
  const { registry } = registryWith()
  const empty = registry.contribute(ENV, { entries: [] })
  assert.ok(empty.ok)
  assert.deepEqual([empty.accepted, empty.dropped], [[], []])
  assert.ok(registry.contribute(OPERATE, M7_OPERATE).ok)
  assert.ok(registry.contribute({ plugin: 'dsh-hourness', row: 'glm-hourness/graph' }, { entries: [] }).ok)
})

test('a contribution that is not even a list of entries is dropped as a whole item, not thrown at', () => {
  const { registry } = registryWith()
  const result = registry.contribute(ENV, { entries: 'none' } as unknown as Contribution)
  assert.ok(result.ok)
  assert.deepEqual(result.dropped.map(item => item.id), ['entries'])
  assert.ok(registry.contribute(ENV, null as unknown as Contribution).ok)
})

// -------------------------------------- the counts and the ids inside one hand-over

test('at most 32 entries, 16 events and 16 actions: each one beyond is dropped with its own record', () => {
  const { registry } = registryWith()
  const entries = Array.from({ length: 34 }, (_, index): LoopEntryDefinition => ({ ...M7_OPERATE.entries[0], id: `operate.e${index}` }))
  const events = Array.from({ length: 18 }, (_, index) => event(`hourness.ev${index}`, `事件${index}`, []))
  const actions = Array.from({ length: 18 }, (_, index) => ({ id: `execute.a${index}`, title: `动作${index}` }))
  const result = registry.contribute(EXECUTE, { events, entries: entries.map(entry => ({ ...entry, id: entry.id.replace('operate', 'execute') })), actions, run: done })
  assert.ok(result.ok)
  assert.equal(result.accepted.length, 32)
  assert.deepEqual(result.dropped.map(item => item.id).sort(), ['execute.a16', 'execute.a17', 'execute.e32', 'execute.e33', 'hourness.ev16', 'hourness.ev17'])
  assert.ok(result.dropped.every(item => /^(entries|events|actions)：一份至多 \d+ /.test(item.reason)), JSON.stringify(result.dropped))
})

test('ids are namespace.name in the hand-over\'s namespace, and not repeated', () => {
  const { registry } = registryWith()
  const base = M7_OPERATE.entries[0]
  const result = registry.contribute(OPERATE, {
    entries: [
      base,
      { ...base, id: 'operate.morning' },
      { ...base, id: 'operate.Bad' },
      { ...base, id: 'operate' },
      { ...base, id: 'execute.stray' },
      { ...base, id: 'operate.' + 'x'.repeat(49) },
    ],
  })
  assert.ok(result.ok)
  assert.deepEqual(result.accepted, ['operate.morning'])
  assert.deepEqual(result.dropped.map(item => item.id), ['operate.morning', 'operate.Bad', 'operate', 'execute.stray', 'operate.' + 'x'.repeat(49)])
  assert.ok(result.dropped.every(item => /^id：/.test(item.reason)), JSON.stringify(result.dropped))
})

// ------------------------------------------------------------ declared events

test('an event with a field that cannot be told apart from the envelope, repeated, mistyped or too many is dropped, and so are the entries that name it', () => {
  const cases: ReadonlyArray<readonly [string, readonly LoopEventField[], RegExp]> = [
    ['an at field', [field('at', 'string', '时刻')], /^fields\[0\]\.name：/],
    ['a session field', [field('session', 'string', '会话')], /^fields\[0\]\.name：/],
    ['a bad name', [field('Bad', 'string', '名字')], /^fields\[0\]\.name：/],
    ['a repeated name', [field('a', 'string', '甲'), field('a', 'number', '乙')], /^fields\[1\]\.name：/],
    ['a type that does not exist', [field('a', 'date' as 'string', '甲')], /^fields\[0\]\.type：/],
    ['in on a number', [field('a', 'number', '甲', 'in')], /^fields\[0\]\.filter：/],
    ['is on a string', [field('a', 'string', '甲', 'is')], /^fields\[0\]\.filter：/],
    ['atLeast on a string', [field('a', 'string', '甲', 'atLeast')], /^fields\[0\]\.filter：/],
    ['paths on a string', [field('a', 'string', '甲', 'paths')], /^fields\[0\]\.filter：/],
    ['a comparison that does not exist', [field('a', 'string', '甲', 'like' as 'in')], /^fields\[0\]\.filter：/],
    ['a title of 21 code points', [field('a', 'string', '字'.repeat(21))], /^fields\[0\]\.title：/],
    ['17 fields', Array.from({ length: 17 }, (_, index) => field(`f${index}`, 'string', '字段')), /^fields：/],
  ]
  for (const [label, fields, reason] of cases) {
    const { registry } = registryWith()
    const tell = { kind: 'tell-main', text: 'x', wake: true } as const
    const naming: LoopEntryDefinition = { ...M7_ENTRIES[1], id: 'execute.names', when: { kind: 'event', events: ['hourness.bad'] }, action: tell }
    const other: LoopEntryDefinition = { ...M7_ENTRIES[1], id: 'execute.other', when: { kind: 'daily', time: '08:30' }, action: tell }
    const result = registry.contribute(EXECUTE, { events: [event('hourness.bad', '坏的事件', fields)], entries: [naming, other] })
    assert.ok(result.ok, label)
    const droppedEvent = result.dropped.find(item => item.id === 'hourness.bad')
    assert.match(droppedEvent?.reason ?? '', reason, label)
    assert.match(result.dropped.find(item => item.id === 'execute.names')?.reason ?? '', /^when\.events：/, label)
    assert.deepEqual(result.accepted, ['execute.other'], `${label}: the entry that names the dropped event goes with it`)
    assert.equal(registry.events().has('hourness.bad'), false, label)
  }
})

test('a gating event may have a session field; its gateOnErrorDefault is allow or block and belongs to gating events only', () => {
  const { registry } = registryWith()
  const gate = (extra: Record<string, unknown>, id = 'gate.tool-call'): LoopEventDeclaration => ({ ...event(id, '工具调用之前', [field('session', 'string', '会话', 'in')], false), ...extra })
  const result = registry.contribute(RULES, { events: [gate({ gateOnErrorDefault: 'block' }), gate({ gateOnErrorDefault: 'maybe' }, 'gate.dispatch'), gate({}, 'gate.trunk-advance')], entries: [] })
  assert.ok(result.ok)
  assert.deepEqual(result.dropped.map(item => item.id), ['gate.dispatch'])
  assert.match(result.dropped[0]?.reason ?? '', /^gateOnErrorDefault：/)
  const plain = registry.contribute(EXECUTE, { events: [{ ...M7_EVENTS[0], gateOnErrorDefault: 'block' }], entries: [] })
  assert.ok(plain.ok)
  assert.deepEqual(plain.dropped.map(item => item.id), ['hourness.design-released'])
  assert.match(plain.dropped[0]?.reason ?? '', /^gateOnErrorDefault：/)
})

test('an event needs a title, personSelectable as a boolean, and params like fields; a repeated id is dropped', () => {
  const { registry } = registryWith()
  const good = event('hourness.good', '好的事件', [field('a', 'string', '甲')])
  const bounded: LoopEventParam = { name: 'p', type: 'number', title: '参数', required: true, min: 1, max: 9 }
  const result = registry.contribute(EXECUTE, {
    events: [
      good,
      good,
      { ...good, id: 'hourness.untitled', title: '' },
      { ...good, id: 'hourness.selectable', personSelectable: 'yes' } as unknown as LoopEventDeclaration,
      { ...good, id: 'hourness.listed', listedOnly: 'yes' } as unknown as LoopEventDeclaration,
      { ...good, id: 'hourness.params', params: [bounded] },
      { ...good, id: 'hourness.badparam', params: [{ name: 'P', type: 'number', title: '参数', required: true }] },
      { ...good, id: 'hourness.dupparam', params: [{ name: 'p', type: 'string', title: '甲', required: false }, { name: 'p', type: 'string', title: '乙', required: false }] },
    ],
    entries: [],
  })
  assert.ok(result.ok)
  assert.deepEqual(result.dropped.map(item => item.id), ['hourness.good', 'hourness.untitled', 'hourness.selectable', 'hourness.listed', 'hourness.badparam', 'hourness.dupparam'])
  assert.deepEqual([...registry.events().keys()].filter(id => id.startsWith('hourness.')).sort(), ['hourness.good', 'hourness.params'])
})

test('actions: an id in the namespace and a title; and a hand-over that lists actions without a run has none of them, so no entry can name one', () => {
  const { registry } = registryWith()
  const harness = (action: string): LoopEntryDefinition => ({ ...M7_ENTRIES[0], action: { kind: 'harness', action } })
  const result = registry.contribute(EXECUTE, {
    events: M7_EVENTS,
    entries: [harness('execute.ok')],
    actions: [{ id: 'execute.ok', title: '做一件事' }, { id: 'execute.ok', title: '重复' }, { id: 'other.x', title: '别的名字空间' }, { id: 'execute.untitled', title: '' }],
    run: done,
  })
  assert.ok(result.ok)
  assert.deepEqual(result.accepted, ['execute.release'])
  assert.deepEqual(result.dropped.map(item => item.id), ['execute.ok', 'other.x', 'execute.untitled'])
  const mute = registryWith().registry.contribute(EXECUTE, { events: M7_EVENTS, entries: [harness('execute.ok')], actions: [{ id: 'execute.ok', title: '做一件事' }] })
  assert.ok(mute.ok)
  assert.deepEqual(mute.accepted, [])
  assert.deepEqual(mute.dropped.map(item => item.id).sort(), ['execute.ok', 'execute.release'])
  assert.match(mute.dropped.find(item => item.id === 'execute.ok')?.reason ?? '', /^run：/)
})

// -------------------------------------------------------- entries, one by one

test('each entry that does not hold is dropped with the path of the field and the sentence, and the rest are accepted', () => {
  const stray = (patch: Record<string, unknown>): Contribution => withEntry(patch)
  const cases: ReadonlyArray<readonly [string, Contribution, string, string]> = [
    ['an empty title', stray({ title: '' }), 'execute.handback', 'title'],
    ['no why', stray({ why: undefined }), 'execute.handback', 'why'],
    ['a long why', stray({ why: 'a'.repeat(151) }), 'execute.handback', 'why'],
    ['an every under 600 that tells the main agent', stray({ when: { kind: 'every', seconds: 599 } }), 'execute.handback', 'when.seconds'],
    ['a filter key the event does not declare', stray({ filter: { nope: { in: ['a'] } } }), 'execute.handback', 'filter.nope'],
    ['a comparison the field does not take', stray({ filter: { commits: { in: ['a'] } } }), 'execute.handback', 'filter.commits'],
    ['an event the board has never heard of', stray({ when: { kind: 'event', events: ['loops.hosr-restarted'] } }), 'execute.handback', 'when.events'],
    ['a gating event', stray({ when: { kind: 'event', events: ['gate.tool-call'] } }), 'execute.handback', 'when.events'],
    ['a script', stray({ action: { kind: 'script', script: { file: 'docs/loops/scripts/x.ps1', sha256: 'a'.repeat(64), lang: 'pwsh' }, report: 'always' } }), 'execute.handback', 'action.kind'],
    ['a check', stray({ action: { kind: 'check', tool: 't', argv: ['a'], report: 'always' } }), 'execute.handback', 'action.kind'],
    ['a harness action nobody lists', stray({ action: { kind: 'harness', action: 'execute.nope' } }), 'execute.handback', 'action.action'],
    ['an empty by', stray({ action: { kind: 'self', does: 'the host does it', by: '' } }), 'execute.handback', 'action.by'],
    ['a text of 2001 characters', stray({ action: { kind: 'tell-main', text: 'a'.repeat(2001), wake: true } }), 'execute.handback', 'action.text'],
    ['a placeholder no event declares', stray({ action: { kind: 'tell-main', text: 'Task {nope}', wake: true } }), 'execute.handback', 'action.text'],
    ['a placeholder only one of two events declares', withEntry({ action: { kind: 'tell-main', text: 'Round {round}', wake: true } }, 2), 'execute.reviewed', 'action.text'],
    ['a placeholder in a time entry', withEntry({ when: { kind: 'daily', time: '08:30' }, action: { kind: 'tell-main', text: 'Task {task}', wake: true } }), 'execute.handback', 'action.text'],
    ['a rate limit of 61 an hour', stray({ limits: { maxPerHour: 61 } }), 'execute.handback', 'limits.maxPerHour'],
    ['a machine scope', stray({ scope: 'machine' }), 'execute.handback', 'scope'],
    ['a quiet time on a time entry', stray({ when: { kind: 'daily', time: '08:30' }, action: { kind: 'tell-main', text: 'Daily.', wake: true }, quiet: { from: '22:00', to: '08:00' } }), 'execute.handback', 'quiet'],
    ['a field the board writes', stray({ rev: 'abc' }), 'execute.handback', 'rev'],
  ]
  for (const [label, contribution, id, path] of cases) {
    const { registry } = registryWith()
    const result = registry.contribute(EXECUTE, contribution)
    assert.ok(result.ok, label)
    assert.deepEqual(result.dropped.map(item => item.id), [id], label)
    assert.ok((result.dropped[0]?.reason ?? '').startsWith(`${path}：`), `${label}: ${result.dropped[0]?.reason}`)
    assert.deepEqual(result.accepted, M7_ENTRIES.map(entry => entry.id).filter(entry => entry !== id), `${label}: the others stand`)
  }
})

test('an entry that tells the main agent on a time or event trigger of the kinds the board allows is accepted from a plugin: cron, command, listed-only', () => {
  const { registry } = registryWith()
  const listed = { ...event('env.graph', '只列出的事', []), listedOnly: true } as LoopEventDeclaration
  const result = registry.contribute(ENV, {
    events: [listed],
    entries: [
      { id: 'env.cron', title: '每周一提醒', why: '每周一提醒一次', when: { kind: 'cron', expression: '0 9 * * 1' }, action: { kind: 'tell-main', text: 'Monday.', wake: true } },
      { id: 'env.command', title: '敲命令时', why: '人敲命令时由宿主做', when: { kind: 'command', names: ['status'] }, action: { kind: 'self', does: '宿主读一次额度', by: 'dsh-glm-zcode' } },
      { id: 'env.listed', title: '只列出', why: '这件事只在别处发生', when: { kind: 'event', events: ['env.graph'] }, action: { kind: 'self', does: '图工具提待决', by: 'glm-hourness/graph' } },
      { id: 'env.once', title: '一次', why: '到点说一次', when: { kind: 'once', at: '2026-11-03T00:00:00Z' }, action: { kind: 'tell-main', text: 'Once.', wake: false } },
      { id: 'env.stale', title: '过去的一次', why: '已经过去了', when: { kind: 'once', at: '2026-11-01T00:00:00Z' }, action: { kind: 'tell-main', text: 'Once.', wake: false } },
    ],
  })
  assert.ok(result.ok)
  assert.deepEqual(result.accepted, ['env.cron', 'env.command', 'env.listed', 'env.once'])
  assert.deepEqual(result.dropped.map(item => item.id), ['env.stale'])
  assert.match(result.dropped[0]?.reason ?? '', /^when\.at：/, 'a once is measured against the registry\'s clock')
})

test('the words a person has not learned are accepted and shown, and told once to the row health', () => {
  const { registry, reports } = registryWith()
  const result = registry.contribute(OPERATE, { entries: [{ ...M7_OPERATE.entries[0], title: '每天的验收报告', why: '看门禁有没有过' }] })
  assert.ok(result.ok)
  assert.deepEqual(result.accepted, ['operate.morning'])
  assert.deepEqual(result.dropped, [])
  assert.deepEqual(reports, ['operate.morning 的说法里有 验收、门禁'])
  registry.contribute(OPERATE, { entries: [{ ...M7_OPERATE.entries[0], title: '每天的验收报告', why: '看门禁有没有过' }] })
  assert.equal(reports.length, 1, 'said once')
})

test('what is dropped is reported once per source, entry and reason', () => {
  const { registry, reports } = registryWith()
  registry.contribute(EXECUTE, withEntry({ title: '' }))
  registry.contribute(EXECUTE, withEntry({ title: '' }))
  assert.deepEqual(reports, ['dsh-hourness 的 glm-hourness/execute 交来的 execute.handback 读不懂：title：标题要写 1 到 60 个字，一行'])
  registry.contribute(EXECUTE, withEntry({ title: '', why: '' }))
  assert.equal(reports.length, 2, 'another reason is another report')
})

// ----------------------------------------- an event nobody declares: the entry waits

test('an entry whose event nobody declares is listed greyed with the reason and the events it waits for, and runs when they arrive', () => {
  const { registry, reports } = registryWith()
  const own = registry.contribute(LOOPS, LOOP_HANDOVER())
  assert.ok(own.ok)
  assert.deepEqual(own.dropped, [])
  const state = (): Record<string, string> => Object.fromEntries(registry.entries().map(item => [item.entry.id, item.state]))
  assert.deepEqual(state(), { 'loops.deps-after-merge': 'waiting', 'loops.remind-waiting': 'active', 'loops.unsynced-daily': 'active', 'loops.peak-start': 'waiting', 'loops.peak-end': 'waiting' })
  const deps = registry.entries().find(item => item.entry.id === 'loops.deps-after-merge')
  assert.deepEqual(deps?.waitingOn, ['hourness.trunk-advanced', 'hourness.outside-advance'])
  assert.match(deps?.reason ?? '', /hourness\.trunk-advanced.*项目编排.*这一项现在不跑/)
  const peak = registry.entries().find(item => item.entry.id === 'loops.peak-start')
  assert.deepEqual(peak?.waitingOn, ['channel.peak-changed'])
  assert.match(peak?.reason ?? '', /channel\.peak-changed.*GLM 通道.*这一项现在不跑/)
  assert.equal(registry.entries().find(item => item.entry.id === 'loops.remind-waiting')?.reason, undefined)
  assert.deepEqual(reports, [], 'waiting is not a fault')

  const execute = registry.contribute(EXECUTE, M7_EXECUTE)
  assert.ok(execute.ok)
  assert.deepEqual(state(), { 'loops.deps-after-merge': 'active', 'loops.remind-waiting': 'active', 'loops.unsynced-daily': 'active', 'loops.peak-start': 'waiting', 'loops.peak-end': 'waiting', ...Object.fromEntries(M7_ENTRIES.map(entry => [entry.id, 'active'])) })
  assert.deepEqual(registry.entries().find(item => item.entry.id === 'loops.deps-after-merge')?.waitingOn, [])

  const half = registryWith()
  half.registry.contribute(LOOPS, LOOP_HANDOVER())
  half.registry.contribute(EXECUTE, { ...M7_EXECUTE, events: M7_EVENTS.filter(declared => declared.id !== 'hourness.outside-advance'), entries: M7_ENTRIES.filter(entry => entry.id !== 'execute.trunk') })
  const partly = half.registry.entries().find(item => item.entry.id === 'loops.deps-after-merge')
  assert.deepEqual([partly?.state, partly?.waitingOn], ['waiting', ['hourness.outside-advance']], 'one of its events is still nobody\'s')
})

test('withdrawn, the declaring part leaves its events and the entries that wait for them are greyed again', () => {
  const { registry } = registryWith()
  registry.contribute(LOOPS, LOOP_HANDOVER())
  const execute = registry.contribute(EXECUTE, M7_EXECUTE)
  assert.ok(execute.ok)
  assert.equal(registry.entries().find(item => item.entry.id === 'loops.deps-after-merge')?.state, 'active')
  execute.dispose()
  assert.equal(registry.entries().find(item => item.entry.id === 'loops.deps-after-merge')?.state, 'waiting')
  assert.equal(registry.events().has('hourness.trunk-advanced'), false)
  assert.deepEqual(ids(registry.entries()), ['loops.deps-after-merge', 'loops.remind-waiting', 'loops.unsynced-daily', 'loops.peak-start', 'loops.peak-end'])
})

test('when the event arrives and the entry does not fit it, the entry is dropped and the row health is told', () => {
  const { registry, reports } = registryWith()
  registry.contribute(LOOPS, LOOP_HANDOVER())
  const files = (type: LoopEventField['type'], filter?: LoopEventField['filter']): LoopEventDeclaration[] => M7_EVENTS.map(declared => (declared.id === 'hourness.trunk-advanced' ? event(declared.id, declared.title, [field('from', 'string', '原来的提交'), field('to', 'string', '现在的提交'), field('files', type, '改到的文件', filter)]) : declared))
  const result = registry.contribute(EXECUTE, { ...M7_EXECUTE, events: files('string') })
  assert.ok(result.ok)
  assert.deepEqual(result.accepted, M7_ENTRIES.map(entry => entry.id), 'M7\'s own entries do not depend on that field')
  assert.equal(registry.entries().find(item => item.entry.id === 'loops.deps-after-merge'), undefined)
  assert.deepEqual(reports, ['dsh-hourness 的 glm-hourness/loops 交来的 loops.deps-after-merge 读不懂：filter.files：字段“改到的文件”不能用来筛'])
  registry.contribute(EXECUTE, { ...M7_EXECUTE, events: files('strings', 'paths') })
  assert.equal(registry.entries().find(item => item.entry.id === 'loops.deps-after-merge')?.state, 'active', 'it comes back when the declaration fits')
  assert.equal(reports.length, 1)
})

// --------------------------------------------------------- replace and withdraw

test('a handle withdraws only its own hand-over: after a replacement the old handle does nothing, and a freed namespace can be taken', () => {
  const { registry } = registryWith()
  const first = registry.contribute(OPERATE, M7_OPERATE)
  const second = registry.contribute(OPERATE, { entries: [M7_OPERATE.entries[1]] })
  assert.ok(first.ok && second.ok)
  first.dispose()
  assert.deepEqual(ids(registry.entries()), ['operate.weekly'], 'the old handle left the replacement alone')
  second.dispose()
  assert.deepEqual(registry.entries(), [])
  second.dispose()
  assert.ok(registry.contribute(ENV, { entries: [{ ...M7_OPERATE.entries[0], id: 'operate.again' }] }).ok, 'operate is free again')
})

test('a replacement that is refused leaves the earlier hand-over standing', () => {
  const { registry } = registryWith()
  assert.ok(registry.contribute(OPERATE, M7_OPERATE).ok)
  assert.equal(registry.contribute(OPERATE, { entries: [{ ...M7_OPERATE.entries[0], id: 'loops.stolen' }] }).ok, false)
  assert.equal(registry.entries().length, 3)
})

test('validateContribution is the pure part: the same input gives the same answer and it holds no state', () => {
  const context = { table: new Map<string, LoopEventDeclaration>(), owners: new Map<string, string>(), now: NOW }
  const first = validateContribution(EXECUTE, M7_EXECUTE, context)
  const second = validateContribution(EXECUTE, M7_EXECUTE, context)
  assert.deepEqual(first, second)
  assert.ok(first.ok)
  assert.equal(first.namespace, 'execute')
  assert.deepEqual(first.entries.map(item => item.definition.id), M7_ENTRIES.map(entry => entry.id))
  assert.deepEqual(first.entries.map(item => item.waitingOn), M7_ENTRIES.map(() => []))
  const taken = validateContribution(ENV, M7_EXECUTE, { ...context, owners: new Map([['execute', 'dsh-hourness\nglm-hourness/execute']]) })
  assert.equal(taken.ok, false)
})

test('the registry is a LoopsService: the type-level contract of what rows call', () => {
  const { registry } = registryWith()
  const service: Pick<LoopsService, 'contribute'> = registry
  assert.equal(typeof service.contribute, 'function')
})

// -------------------------------------------------- the loop row\'s own events

test('the loop row\'s events: restarted, waiting on a human, a file changed, with the fields and parameters of design §4.1', () => {
  assert.deepEqual(LOOP_EVENTS.map(declared => declared.id), ['loops.host-restarted', 'loops.waiting-on-human', 'loops.file-changed'])
  assert.deepEqual([...LOOP_EVENT_TABLE.keys()], LOOP_EVENTS.map(declared => declared.id))
  const by = (id: string): LoopEventDeclaration => LOOP_EVENT_TABLE.get(id)!
  assert.deepEqual(by('loops.host-restarted').fields.map(item => [item.name, item.type, item.filter]), [['previousStart', 'string', undefined], ['downMinutes', 'number', 'atLeast'], ['crashed', 'boolean', 'is'], ['rebooted', 'boolean', 'is'], ['appChanged', 'boolean', 'is']])
  assert.deepEqual(by('loops.waiting-on-human').fields.map(item => [item.name, item.type, item.filter]), [['items', 'strings', undefined], ['count', 'number', 'atLeast']])
  assert.deepEqual(by('loops.file-changed').fields.map(item => [item.name, item.type, item.filter]), [['path', 'string', undefined], ['size', 'number', undefined], ['mtime', 'string', undefined]])
  assert.deepEqual(by('loops.waiting-on-human').params, [{ name: 'olderThanHours', type: 'number', title: '等了多少小时', required: true, min: 1, max: 168 }])
  assert.deepEqual(by('loops.file-changed').params?.map(item => [item.name, item.type, item.required]), [['path', 'string', true]])
  assert.equal(by('loops.host-restarted').params, undefined)
  assert.ok(LOOP_EVENTS.every(declared => declared.personSelectable === true && declared.listedOnly === undefined))
  assert.ok(LOOP_EVENTS.every(declared => declared.title.length > 0 && declared.fields.every(item => [...item.title].length <= 20)))
  const { registry } = registryWith()
  for (const declared of LOOP_EVENTS) assert.ok(registry.events().has(declared.id), 'the board has them before anyone hands anything over')
})

test('the parameters of the loop row\'s events are checked by the shared validateWhen', () => {
  const when = (events: string[], params?: Record<string, string | number | boolean>): number => validateWhen({ kind: 'event', events, ...(params === undefined ? {} : { params }) }, undefined, LOOP_EVENT_TABLE, { allowGate: false, origin: 'person', now: NOW, action: 'tell-main' }).length
  assert.equal(when(['loops.waiting-on-human'], { olderThanHours: 24 }), 0)
  assert.equal(when(['loops.waiting-on-human'], { olderThanHours: 0 }), 1)
  assert.equal(when(['loops.waiting-on-human'], { olderThanHours: 169 }), 1)
  assert.equal(when(['loops.waiting-on-human']), 1, 'required')
  assert.equal(when(['loops.file-changed'], { path: 'C:/Program Files/ZCode/resources/app.asar' }), 0)
  assert.equal(when(['loops.file-changed']), 1)
  assert.equal(when(['loops.host-restarted']), 0)
})

test('the keys of the loop row\'s events: the event name without its namespace, the subject and this occurrence', () => {
  const shaped = (key: string, first: string): void => {
    const segments = key.split(':')
    assert.ok(segments.length >= 3 && segments.every(segment => segment !== ''), key)
    assert.equal(segments[0], first)
  }
  assert.equal(hostRestartedKey('GLM-Hourness', '2026-11-02T01:00:00.000Z'), 'host-restarted:GLM-Hourness:2026-11-02T01:00:00.000Z')
  assert.notEqual(hostRestartedKey('p', '2026-11-02T01:00:00.000Z'), hostRestartedKey('p', '2026-11-02T01:05:00.000Z'), 'every start is its own occurrence')
  shaped(hostRestartedKey('p', '2026-11-02T01:00:00.000Z'), 'host-restarted')
  assert.equal(fileChangedKey('/work/app.asar', 4096, 1_793_000_000_000), 'file-changed:/work/app.asar:4096-1793000000000')
  assert.equal(fileChangedKey('C:\\Program Files\\ZCode\\app.asar', 'gone', 1_793_000_000_000), 'file-changed:C:\\Program Files\\ZCode\\app.asar:gone-1793000000000')
  assert.notEqual(fileChangedKey('/a', 1, 1), fileChangedKey('/a', 1, 2))
  shaped(fileChangedKey('/work/app.asar', 4096, 1), 'file-changed')
  shaped(fileChangedKey('C:\\x', 'gone', 1), 'file-changed')
  // The hour is the host's own, in the zone given.
  assert.equal(waitingOnHumanKey(24, new Date('2026-11-02T01:30:00Z'), 'Asia/Shanghai'), 'waiting-on-human:24:2026-11-02T09')
  assert.equal(waitingOnHumanKey(24, new Date('2026-11-02T01:30:00Z'), 'America/New_York'), 'waiting-on-human:24:2026-11-01T20')
  assert.equal(waitingOnHumanKey(24, new Date('2026-11-02T01:59:59Z'), 'Asia/Shanghai'), waitingOnHumanKey(24, new Date('2026-11-02T01:00:00Z'), 'Asia/Shanghai'), 'the same hour is the same occurrence')
  assert.notEqual(waitingOnHumanKey(24, new Date('2026-11-02T02:00:00Z'), 'Asia/Shanghai'), waitingOnHumanKey(24, new Date('2026-11-02T01:00:00Z'), 'Asia/Shanghai'))
  assert.notEqual(waitingOnHumanKey(48, new Date('2026-11-02T01:30:00Z'), 'Asia/Shanghai'), waitingOnHumanKey(24, new Date('2026-11-02T01:30:00Z'), 'Asia/Shanghai'))
  shaped(waitingOnHumanKey(24, new Date('2026-11-02T01:30:00Z'), 'Asia/Shanghai'), 'waiting-on-human')
})

// --------------------------------------------------- the loop row\'s four entries

test('the loop row brings exactly five entries, with the names, times, doers and words of design §5.2', () => {
  assert.deepEqual(LOOP_DEFAULTS.map(entry => entry.id), ['loops.deps-after-merge', 'loops.remind-waiting', 'loops.unsynced-daily', 'loops.peak-start', 'loops.peak-end'])
  const [deps, remind, unsynced, start, end] = LOOP_DEFAULTS as [LoopEntryDefinition, LoopEntryDefinition, LoopEntryDefinition, LoopEntryDefinition, LoopEntryDefinition]
  assert.deepEqual(LOOP_DEFAULTS.map(entry => entry.title), ['依赖文件变了之后：查依赖', '有事等你太久时：再跟你说一次', '每天下班前：查有没有没提交、没推送的改动', 'GLM 高峰开始时：按你选的高峰模式收放', 'GLM 高峰结束时：接上挪开的活'])

  assert.deepEqual(deps.when, { kind: 'event', events: ['hourness.trunk-advanced', 'hourness.outside-advance'] })
  assert.deepEqual(deps.filter, { files: { paths: DEPENDENCY_FILES } })
  assert.deepEqual(DEPENDENCY_FILES, ['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'yarn.lock', 'requirements.txt', 'pyproject.toml', 'poetry.lock', 'uv.lock', 'Pipfile.lock', 'Cargo.toml', 'Cargo.lock', 'go.mod', 'go.sum', 'Gemfile.lock', 'composer.lock'])
  assert.ok(DEPENDENCY_FILES.every(file => !file.includes('/')), 'a bare name counts in any directory')
  assert.deepEqual(deps.action, {
    kind: 'tell-main',
    text: 'Dependency files changed on the main branch ({from}..{to}): {files}. Run the project\'s dependency check (the patrol lines of norm-merge-gate) and report what it found. Put a major-version upgrade to the human with propose_to_human.',
    wake: true,
  })
  assert.deepEqual(deps.limits, { debounceSeconds: 30, maxPerHour: 6 })

  assert.deepEqual(remind.when, { kind: 'event', events: ['loops.waiting-on-human'], params: { olderThanHours: 24 } })
  assert.deepEqual(remind.quiet, { from: '22:00', to: '08:00' })
  assert.deepEqual(remind.action, {
    kind: 'tell-main',
    text: 'These have waited for the human for more than 24 hours: {items}. Remind the human once, the longest-waiting first and at most three in one reply: say each in one plain line with its title and what you need from the human. Do not open a new question for an item that already has one. Then end your turn.',
    wake: true,
  })
  assert.deepEqual(remind.limits, { debounceSeconds: 60, maxPerHour: 1 })

  // The end-of-day check is a time entry: it listens to no event, has no limits or quiet hours, and says in its words that it only reports.
  assert.deepEqual(unsynced.when, { kind: 'daily', time: '18:05' })
  assert.equal(unsynced.limits, undefined)
  assert.equal(unsynced.quiet, undefined)
  assert.equal(unsynced.action.kind, 'tell-main')
  assert.equal(unsynced.action.kind === 'tell-main' && unsynced.action.wake, true)
  const told = unsynced.action.kind === 'tell-main' ? unsynced.action.text : ''
  assert.doesNotMatch(told, /[{}]/, 'no placeholder: the entry has no event to fill it from')
  assert.match(told, /Read only: run git worktree list;.*git status --short.*git branch -vv.*git stash list\./)
  assert.match(told, /If everything is committed and pushed, end your turn without telling the human anything\./)
  assert.match(told, /Do not commit or push because of this reminder; the human decides\./)

  assert.deepEqual(start.when, { kind: 'event', events: ['channel.peak-changed'] })
  assert.deepEqual(start.filter, { edge: { in: ['start'] } })
  assert.deepEqual(start.action, { kind: 'self', does: '规则板定档位与上限，项目编排派活时照上限数', by: 'glm-hourness/rules' })
  assert.deepEqual(start.limits, { debounceSeconds: 5, maxPerHour: 6 })

  assert.deepEqual(end.when, { kind: 'event', events: ['channel.peak-changed'] })
  assert.deepEqual(end.filter, { edge: { in: ['end'] } })
  assert.deepEqual(end.action, { kind: 'harness', action: 'loops.peak-end' }, 'the words to the main agent come from the result of the action')
  assert.deepEqual(end.limits, { debounceSeconds: 5, maxPerHour: 6 })

  for (const peak of [start, end]) assert.equal(peak.basis, 'GLM 通道的高峰时刻与规则板的高峰模式')
  assert.deepEqual(LOOP_ACTIONS.map(action => action.id), ['loops.peak-end'])
})

test('the five entries are sound: one line of why each, no word a person has not learned, and the shared checks accept them', () => {
  for (const entry of LOOP_DEFAULTS) {
    assert.ok(typeof entry.why === 'string' && entry.why.length > 0 && !entry.why.includes('\n'), entry.id)
    assert.deepEqual(plainWordsIn(`${entry.title}${entry.why ?? ''}${entry.basis ?? ''}`), [], entry.id)
  }
  const { registry, reports } = registryWith()
  const result = registry.contribute(LOOPS, LOOP_HANDOVER())
  assert.ok(result.ok)
  assert.deepEqual(result.accepted, LOOP_DEFAULTS.map(entry => entry.id))
  assert.deepEqual(result.dropped, [])
  assert.deepEqual(reports, [])
})

test('runOfAction hands the run of the row that listed an action, and the loop row\'s run refuses a project it is not running', async () => {
  const { registry } = registryWith()
  assert.equal(registry.runOfAction('loops.peak-end'), undefined, 'nothing is handed over yet')
  const asked: string[] = []
  registry.contribute(EXECUTE, {
    entries: [],
    actions: [{ id: 'execute.resume-drive', title: '接上高峰里停住的自动推进' }],
    run: (action) => { asked.push(action); return Promise.resolve({ outcome: 'done' }) },
  })
  assert.equal(registry.runOfAction('nobody.action'), undefined, 'an action nobody lists has no run')
  const resume = registry.runOfAction('execute.resume-drive')
  assert.ok(typeof resume === 'function')
  const record: LoopEventRecord = { id: 'ev-0000000000000000', event: 'channel.peak-changed', at: NOW.toISOString(), project: '/p', key: 'peak-changed:end:x', payload: { edge: 'end', boundary: NOW.toISOString(), until: '' }, merged: [] }
  await resume('execute.resume-drive', record)
  assert.deepEqual(asked, ['execute.resume-drive'])
  registry.contribute(LOOPS, LOOP_HANDOVER())
  const own = registry.runOfAction('loops.peak-end')
  assert.ok(typeof own === 'function', 'the loop row\'s own hand-over listed the action')
  assert.deepEqual(await own('loops.peak-end', record), { outcome: 'skipped', reason: 'the specs do not run it' }, 'the run is the one the hand-over brought')
})

test('checksOf hands the page the checks the hand-over that brought an entry gives for one project: at most 10 of the page\'s shape; a member that is absent, throws or is not a list gives none and is told once', () => {
  const { registry, reports } = registryWith()
  const weekly = (id: string): LoopEntryDefinition => ({ id, title: id, why: '每周一提醒一次', when: { kind: 'cron', expression: '0 9 * * 1' }, action: { kind: 'tell-main', text: 'Monday.', wake: true } })
  const check = (key: string): unknown => ({ key, title: `Lint：${key}`, timeout: { seconds: 60, source: { kind: 'ceiling' } } })
  const asked: Array<[string, string]> = []
  registry.contribute(ENV, {
    entries: [weekly('env.checks'), weekly('env.quiet')],
    checks: (entry, project) => { asked.push([entry, project]); return (entry === 'env.checks' ? [...Array.from({ length: 11 }, (_, index) => check(`tool-1/c${index}`)), { key: 'odd' }] : []) as never },
  })
  const checks = registry.checksOf('env.checks', 'C:/p')
  assert.deepEqual(asked, [['env.checks', 'C:/p']], 'called for that entry and project')
  assert.deepEqual([checks?.length, checks?.[0]], [10, check('tool-1/c0')])
  assert.deepEqual(registry.checksOf('env.quiet', 'C:/p'), [])
  assert.equal(registry.checksOf('nobody.entry', 'C:/p'), undefined, 'an entry nobody hands over has none')
  assert.deepEqual(reports, [], 'the eleventh check is past the limit, not unreadable')
  registry.contribute(EXECUTE, { entries: [weekly('execute.weekly')], checks: () => { throw new Error('boom') } })
  assert.equal(registry.checksOf('execute.weekly', 'C:/p'), undefined)
  registry.checksOf('execute.weekly', 'C:/p')
  registry.contribute(OPERATE, { entries: [weekly('operate.weekly')], checks: () => 'one check' as never })
  assert.equal(registry.checksOf('operate.weekly', 'C:/p'), undefined)
  assert.deepEqual(reports, ['dsh-hourness 的 glm-hourness/execute 给「execute.weekly」的 checks 抛错：boom', 'dsh-hourness 的 glm-hourness/operate 给「operate.weekly」的 checks 不是一列，页面上不列'], 'told once each')
  registry.contribute(OPERATE, { entries: [weekly('operate.weekly')], checks: () => [check('tool-2/a'), { key: 'tool-2/b', title: 'B', timeout: { seconds: 0 } }] as never })
  assert.deepEqual(registry.checksOf('operate.weekly', 'C:/p'), [check('tool-2/a')])
  assert.equal(reports.at(-1), 'dsh-hourness 的 glm-hourness/operate 给「operate.weekly」的 checks 有读不懂的项，页面上不列那几项')
  registry.contribute(OPERATE, { entries: [weekly('operate.weekly')] })
  assert.equal(registry.checksOf('operate.weekly', 'C:/p'), undefined, 'a hand-over without checks gives none')
})

// ---------------------------------------------------------------- the row skeleton

/** Capture what the row warns about while `body` runs. */
function quietly<T>(body: () => T): { readonly value: T, readonly warnings: string[] } {
  const warnings: string[] = []
  const warn = console.warn
  console.warn = (message: string) => { warnings.push(message) }
  try {
    return { value: body(), warnings }
  }
  finally {
    console.warn = warn
  }
}

const healthOf = (store: ReturnType<typeof serviceStore>) => collectHealth(store, undefined).find(entry => entry.row === 'loops')

/** A host with every part the row sets itself up with (the command, the gate, the projection registry, the session controller), over a service store. */
function hostWithParts(): ReturnType<typeof serviceStore> & LoopsContext {
  const store = serviceStore()
  const injector = fakeInjector({ sessionProjections: { register: () => () => {} } as never, sessionController: { resolveAgent: () => Promise.resolve({}) } }, store)
  return Object.assign(store, { commands: { register: () => () => {} }, on: () => () => {}, inject: injector.inject })
}

test('the row is a cordis plugin that needs the commands service, provides the service and its health, and withdraws both', () => {
  assert.equal(name, 'dsh-glm-hourness/loops')
  assert.deepEqual(inject, ['commands'])
  const store = hostWithParts()
  const stop = apply(store)
  assert.ok(loopsService(store) !== undefined)
  assert.equal(healthOf(store)?.status, 'active')
  assert.match(healthOf(store)?.reason ?? '', new RegExp(`${LOOPS_SERVICE} 已就绪`))
  stop()
  assert.equal(store.services.has(LOOPS_SERVICE), false)
  assert.equal(store.services.has(healthServiceName('loops')), false)
  assert.equal(healthOf(store)?.status, 'absent')
})

test('through the service a row hands over its table, the loop row\'s own four are there already, and its namespace is reserved', () => {
  const store = hostWithParts()
  const { value: stop, warnings } = quietly(() => apply(store))
  const service = loopsService(store)!
  assert.deepEqual(warnings, [])
  const result = service.contribute(EXECUTE, M7_EXECUTE)
  assert.ok(result.ok)
  assert.deepEqual(result.accepted, M7_ENTRIES.map(entry => entry.id))
  assert.deepEqual(service.contribute(ENV, { entries: [{ ...M7_OPERATE.entries[0], id: 'loops.mine' }] }), { ok: false, reason: 'loops 留给循环行' })
  assert.equal(healthOf(store)?.status, 'degraded', 'a refused hand-over is told to the row health')
  assert.match(healthOf(store)?.reason ?? '', /glm-hourness\/env 交来的整份被拒：loops 留给循环行/)
  stop()
})

test('a dropped entry degrades the row health with the reason, once, and the row keeps working', () => {
  const store = hostWithParts()
  const stop = apply(store)
  const service = loopsService(store)!
  assert.ok(service.contribute(OPERATE, { entries: [{ ...M7_OPERATE.entries[0], why: '' }] }).ok)
  assert.equal(healthOf(store)?.status, 'degraded')
  assert.equal((healthOf(store)?.reason ?? '').split('交来的 operate.morning 读不懂：why：').length - 1, 1)
  assert.ok(service.contribute(OPERATE, { entries: [{ ...M7_OPERATE.entries[0], why: '' }] }).ok)
  assert.equal((healthOf(store)?.reason ?? '').split('交来的 operate.morning 读不懂：why：').length - 1, 1, 'the second hand-over adds nothing')
  stop()
})

test('activation never throws: a second instance, or a host without provide, is inactive with the reason and a warning', () => {
  const store = hostWithParts()
  const first = apply(store)
  const second = quietly(() => apply(store))
  assert.equal(healthOf(store)?.status, 'active', 'the first instance is untouched')
  assert.ok(second.warnings.some(text => text.includes(LOOPS_SERVICE)))
  second.value()
  assert.ok(loopsService(store) !== undefined, 'the second instance left the first one\'s service alone')
  first()
  const bare = quietly(() => apply({}))
  assert.ok(bare.warnings.some(text => text.includes('provide')))
  bare.value()
})

test('the row ships enabled in the orchestration patch (no disabled key), is registered in the directory table and the health rows, and has its locale files', async () => {
  const text = (path: string): Promise<string> => readFile(new URL(path, import.meta.url), 'utf8')
  const patch = await text('../packages/hourness/cordis.patch.yml')
  const rowAt = (id: string): number => patch.indexOf(`    - id: glm-hourness/${id}`)
  const start = rowAt('loops')
  assert.ok(rowAt('design') < start && start < rowAt('ui'), 'after design and before ui')
  const block = patch.slice(start, patch.indexOf('\n    - id:', start + 1))
  assert.deepEqual(block.split('\n').filter(line => /^ {6}[a-z]/.test(line)), ['      name: dsh-hourness/loops', '      config: {}'])
  const exported = (JSON.parse(await text('../packages/hourness/package.json')) as { exports: Record<string, string> }).exports
  assert.deepEqual([exported['./loops'], exported['./loops/locale/*.json']], ['./dist/loops/index.js', './locale/loops/*.json'])
  const locales = await Promise.all(['en', 'zh'].map(async language => JSON.parse(await text(`../packages/hourness/locale/loops/${language}.json`)) as { meta: { title: string, description: string } }))
  assert.ok(locales.every(locale => locale.meta.title.length > 0 && locale.meta.description.length > 0))
  const table = await text('../scripts/packages.mjs')
  assert.ok(table.includes("{ id: 'glm-hourness/loops', module: 'loops/index' }"))
})

// ------------------------------------------------------------ what src/loops/ is not

test('src/loops/ holds no other row\'s table: nothing imports the execution, operation, env or GLM rows but index.ts the env row\'s seam file, and only channel.ts reads the channel contract', () => {
  const directory = new URL('../src/loops/', import.meta.url)
  const files = readdirSync(directory).filter(file => file.endsWith('.ts'))
  assert.ok(files.includes('registry.ts') && files.includes('defaults.ts'))
  // channel.ts declares the three channel events and is the one place the channel's loopDefaults become entries (design §3.4).
  assert.deepEqual(CHANNEL_EVENTS.map(declared => declared.id), ['channel.peak-changed', 'channel.quota-low', 'channel.login-rejected'])
  for (const file of files) {
    const text = readFileSync(new URL(file, directory), 'utf8')
    const specifiers = [...text.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?\sfrom\s+['"]([^'"]+)['"]/g)].map(match => match[1] ?? '')
    // The board's check entries read the env row through the one file m4 design §6.1.2 names for it, wired in index.ts (checksSeam).
    const seam = (specifier: string): boolean => file === 'index.ts' && specifier === '../env/env-service.ts'
    for (const specifier of specifiers.filter(found => !seam(found))) assert.doesNotMatch(specifier, /(?:^|\/)(execute|operate|env|glm-llm)(?:\/|\.|$)/, `${file} imports ${specifier}`)
    if (file !== 'channel.ts') for (const specifier of specifiers) assert.doesNotMatch(specifier, /(?:^|\/)channel-loop(?:\.|$)/, `${file} imports ${specifier}`)
    // The one id of another row the board may name is the execute row's resume-drive, which design §6.9 item 4 row 3 (with §17 M7 item 6) makes the board call by id; peak.ts is the only file that names it.
    const withoutResume = text.replace(/['"`]execute\.resume-drive['"`]/g, '')
    assert.doesNotMatch(withoutResume, /['"`](?:execute|operate|env)\.[a-z]/, `${file} writes an id of another row`)
  }
})

// ------------------------------------------------------------ the channel's entries (design §3.4, §4.3)

const glmPricing = (loopDefaults: unknown): UsagePricing => ({ basis: 'probe', plan: 'GLM Coding Plan', charged: () => undefined, peak: () => false, loopDefaults } as unknown as UsagePricing)

test('the three channel events: the account-level two declare the fields and params of design §4.3, nobody picks them, and their keys name one occurrence', () => {
  const byId = new Map(CHANNEL_EVENTS.map(declared => [declared.id, declared]))
  const quota = byId.get(CHANNEL_QUOTA_LOW)
  assert.deepEqual(quota?.fields.map(field => [field.name, field.type]), [['window', 'string'], ['usedPercent', 'number'], ['resetAt', 'string'], ['line', 'string']])
  assert.deepEqual(quota?.params?.map(param => [param.name, param.required, param.min, param.max]), [['usedPercent', true, 1, 100], ['exhaustsWithinMinutes', true, 1, 1440], ['afterUsageMinutes', true, 1, 1440]])
  const login = byId.get(CHANNEL_LOGIN_REJECTED)
  assert.deepEqual(login?.fields.map(field => [field.name, field.type]), [['since', 'string'], ['path', 'string'], ['line', 'string']])
  assert.ok(CHANNEL_EVENTS.every(declared => !declared.personSelectable))
  assert.equal(quotaLowKey('five-hour', '2026-11-04T13:30:00.000Z'), 'quota-low:five-hour:2026-11-04T13:30:00.000Z')
  assert.equal(loginRejectedKey('', '2026-11-04T09:40:00.000Z'), 'login-rejected:glm:2026-11-04T09:40:00.000Z')
  assert.equal(loginRejectedKey('mint', '2026-11-04T09:40:00.000Z'), 'login-rejected:mint:2026-11-04T09:40:00.000Z')
  for (const declared of CHANNEL_EVENTS) assert.deepEqual(plainWordsIn([declared.title, ...declared.fields.map(field => field.title), ...(declared.params ?? []).map(param => param.title)].join('\n')), [], declared.id)
})

test('channelEntries turns the GLM channel\'s four defaults into entries by design §3.4: two it does itself, two the board tells the main agent, for the machine', () => {
  const entries = channelEntries(glmPricing(GLM_LOOP_DEFAULTS))
  assert.deepEqual(entries.map(entry => entry.id), ['glm:peak-reminder', 'glm:quota-on-command', 'glm:quota-low', 'glm:login-rejected'])
  const [peak, command, quota, login] = entries
  assert.deepEqual([peak?.when, peak?.filter, peak?.action, peak?.scope], [{ kind: 'event', events: [CHANNEL_PEAK_CHANGED] }, { edge: { in: ['start'] } }, { kind: 'self', does: 'GLM 高峰开始时提醒模型', by: 'dsh-glm-zcode' }, undefined])
  assert.deepEqual([command?.when, command?.action.kind], [{ kind: 'command', names: ['glm-status', 'hourness'] }, 'self'])
  assert.deepEqual(quota?.when, { kind: 'event', events: [CHANNEL_QUOTA_LOW], params: { usedPercent: 80, exhaustsWithinMinutes: 60, afterUsageMinutes: 15 } })
  assert.deepEqual([quota?.action.kind, quota?.action.kind === 'tell-main' && quota.action.wake, quota?.scope], ['tell-main', false, 'machine'])
  assert.ok(quota?.action.kind === 'tell-main' && quota.action.text.includes('"{line}"'))
  assert.deepEqual([login?.when, login?.action.kind, login?.scope], [{ kind: 'event', events: [CHANNEL_LOGIN_REJECTED] }, 'tell-main', 'machine'])
  // Every one is a sound plugin entry against the table the channel events are in.
  const table = new Map([...LOOP_EVENT_TABLE, ...CHANNEL_EVENTS.map(declared => [declared.id, declared] as const)])
  for (const entry of entries) assert.deepEqual(validateEntry(entry, 'plugin', { table, now: NOW }), [], entry.id)
})

test('channelEntries drops a runBy that does not go with its when, and what the contract itself drops, each told once', () => {
  const told: string[] = []
  const entries = channelEntries(glmPricing([
    { id: 'glm:low-self', title: '额度快用完', why: '通道自己做的额度提醒，这种搭配循环板不认', when: { kind: 'quota-low', usedPercent: 80, exhaustsWithinMinutes: 60, afterUsageMinutes: 15 }, runBy: 'channel' },
    { id: 'glm:peak-board', title: '高峰开始', why: '循环板做的高峰提醒，这种搭配循环板不认', when: { kind: 'peak-start' }, runBy: 'loop-board', tell: 'x' },
    { id: 'glm:later', title: '以后的', why: '通道以后加的触发', when: { kind: 'hourly' }, runBy: 'channel' },
    GLM_LOOP_DEFAULTS[3],
  ]), text => { told.push(text) })
  assert.deepEqual(entries.map(entry => entry.id), ['glm:login-rejected'])
  assert.equal(told.length, 3)
  assert.ok(told[0]?.includes('"glm:later"'), 'the contract drops a when it does not know')
  assert.ok(told.some(text => text.includes('glm:low-self') && text.includes('quota-low')))
  assert.ok(told.some(text => text.includes('glm:peak-board') && text.includes('peak-start')))
  assert.deepEqual(channelEntries(glmPricing(undefined)), [])
})

test('the registry lists the channel\'s entries after the hand-overs, from the glm-login row, active; an unsound one is dropped and told once; a hand-over still cannot bring a machine scope', () => {
  const told: string[] = []
  let defaults: readonly LoopEntryDefinition[] = channelEntries(glmPricing(GLM_LOOP_DEFAULTS))
  const registry = createRegistry({ now: () => NOW, report: (text) => { told.push(text) }, channel: () => CHANNEL_EVENTS, channelEntries: () => defaults })
  registry.contribute(LOOPS_SOURCE, { entries: LOOP_DEFAULTS, actions: LOOP_ACTIONS, run: () => Promise.resolve({ outcome: 'done' }) })
  const listed = registry.entries()
  assert.deepEqual(listed.slice(-4).map(item => [item.entry.id, item.state, item.entry.source.plugin, item.entry.source.row]), [
    ['glm:peak-reminder', 'active', 'dsh-glm-zcode', 'glm-hourness/glm-login'],
    ['glm:quota-on-command', 'active', 'dsh-glm-zcode', 'glm-hourness/glm-login'],
    ['glm:quota-low', 'active', 'dsh-glm-zcode', 'glm-hourness/glm-login'],
    ['glm:login-rejected', 'active', 'dsh-glm-zcode', 'glm-hourness/glm-login'],
  ])
  assert.match(listed.at(-1)?.entry.rev ?? '', /^[0-9a-f]{12}$/)
  assert.equal(told.length, 0, told.join('；'))
  // A tell that names a field the event does not declare: dropped, told once however often the board reads.
  defaults = defaults.map(entry => entry.id === 'glm:login-rejected' && entry.action.kind === 'tell-main' ? { ...entry, action: { ...entry.action, text: 'Say {nothing}.' } } : entry)
  registry.entries()
  assert.equal(registry.entries().some(item => item.entry.id === 'glm:login-rejected'), false)
  assert.equal(told.filter(text => text.startsWith('dsh-glm-zcode 的 glm-hourness/glm-login 交来的 glm:login-rejected 读不懂')).length, 1)
  // Without the pricing service the channel has nothing on the board.
  defaults = []
  assert.equal(registry.entries().some(item => item.entry.source.plugin === 'dsh-glm-zcode'), false)
  const handed = registry.contribute(EXECUTE, { entries: [{ id: 'execute.machine', title: '整台机器一件', why: '交来的条目不能是机器一级的', when: { kind: 'event', events: ['loops.host-restarted'] }, action: { kind: 'tell-main', text: 'x', wake: false }, scope: 'machine' }] })
  assert.ok(handed.ok && handed.dropped.some(item => item.id === 'execute.machine' && item.reason.includes('scope')))
})
