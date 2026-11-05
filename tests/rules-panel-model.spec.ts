/**
 * The rules board's page (docs/ORCHESTRATION.md §16.14; rules design 0.10
 * §9.1, plain-ui 1.3 §4.7, plan.md Q1 B and Q2 A): views built by the host's
 * buildRulesView, written out and read back through parseRulesView the way
 * the client reads view.json, then made into the page's head, status entries
 * and seven groups and into the board's home and guide lines; the plain-words
 * check over every fixed string and sample line; the board's registration
 * and what it hands the panel, the view.json reader over the fake remote
 * (panel-helpers.ts), and the static check that ui/src/rules/ never writes.
 * The pure functions run without React.
 */
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import ts from 'typescript'
import { plainWordsIn } from '../src/graph/plain-question.ts'
import type { GuardRecord } from '../src/guard/records.ts'
import { effectiveTimeoutSeconds } from '../src/loops/trigger.ts'
import { momentText } from '../src/loops/view.ts'
import { GLM_PEAK_PRICING } from '../src/rules/builtin.ts'
import { emptyState, type ProjectState, type Rule, type Ticket } from '../src/rules/model.ts'
import { buildRulesView, LIFT_BOARD_ONLY, LIFT_NOT_OFFERED, type RulesViewInput } from '../src/rules/view-build.ts'
import { parseRulesView, type RulesView } from '../src/rules/view.ts'
import type { StatusItem } from '../src/shared/status.ts'
import { BOARD_ORDER, boards, checkedBoardState, registerBoard, type BoardState } from '../ui/src/graph/boards.ts'
import { loopsBoard } from '../ui/src/loops/board.ts'
import { rulesBoard } from '../ui/src/rules/board.ts'
import { buildRulesPage, rulesGuideLine, rulesHomeLine } from '../ui/src/rules/model.ts'
import { holdRulesSource, RulesSource } from '../ui/src/rules/source.ts'
import { fakeRemote, fakeSessions, until } from './panel-helpers.ts'
import { projectReadOf, ruleOf, scriptRef, SHA_OTHER, VIEW_PEAK_END, viewInputOf } from './rules-fixtures.ts'

/** Wednesday 15:00 in UTC+8, inside GLM's peak hours, which end at VIEW_PEAK_END. */
const NOW_MS = Date.parse('2026-10-28T15:00:00+08:00')
const minutesAgo = (minutes: number): string => new Date(NOW_MS - minutes * 60_000).toISOString()
const CHOSEN_AT = '2026-10-28T06:30:00.000Z'

/** A view as the client reads it: built by the host, written as view.json, parsed back. */
function viewOf(over: Partial<RulesViewInput> = {}): RulesView {
  const parsed = parseRulesView(`${JSON.stringify(buildRulesView(viewInputOf(over), NOW_MS), null, 2)}\n`)
  assert.ok(parsed !== undefined, 'the view reads back')
  return parsed
}

const stateWith = (over: Partial<ProjectState>): ProjectState => ({ ...emptyState(), seq: 1, ...over })
const readWith = (over: Partial<ProjectState>): RulesViewInput['read'] => projectReadOf(stateWith(over))
const humanLevel = (level: 'inform' | 'reduce' | 'stop'): Partial<ProjectState> => ({ peakMode: { level, at: CHOSEN_AT, origin: { actor: 'human' } } })

/** The two checklist nodes as the panel's graph holds them. */
const NODES: ReadonlyMap<string, { readonly title: string, readonly acceptance: readonly string[] }> = new Map([
  ['norm-merge-gate', { title: '合入主干前必须全部通过的命令', acceptance: ['`$ npm run build`', '`$ npm test`', '`push`'] }],
  ['norm-review-floor', { title: '本仓库必须全审的改动', acceptance: ['改到拦截与权限：写入范围与工具面', '删东西、推送这类收不回的操作'] }],
])

type Page = ReturnType<typeof buildRulesPage>
type Group = Page['groups'][number]

const pageOf = (view: RulesView | null): Page => buildRulesPage(view, NODES)
function groupOf(page: Page, key: string): Group {
  const group = page.groups.find(entry => entry.key === key)
  assert.ok(group !== undefined, `the page has the group ${key}`)
  return group
}
function entryOf(page: Page, group: string, key: string): Group['entries'][number] {
  const found = groupOf(page, group).entries.find(entry => entry.key === key)
  assert.ok(found !== undefined, `${group} has ${key}`)
  return found
}

/** A record of the rules board's gate for a person's rule: `rules:<id>`, enforced or only noted. */
const gateRecord = (rule: string, minutes: number, mode: 'enforce' | 'record'): GuardRecord => ({ rule: `rules:${rule}`, at: minutesAgo(minutes), tool: 'pwsh', mode, effect: mode === 'record' ? 'record' : 'block', ...(mode === 'record' ? {} : { correction: 'no' }) }) as unknown as GuardRecord

/** A ticket a rule opened half an hour ago; the stop level's own unless `rules` says otherwise. */
const waitingTicket = (id: string, over: Partial<Ticket> = {}): Ticket => ({
  id,
  state: 'deferred',
  rules: ['builtin:glm-peak-stop'],
  sessionId: 'sess-worker',
  agentLabel: 'glm 子 agent',
  host: { pid: 4242, startedAt: 1 },
  signature: `any:builtin:glm-peak-stop:${id}`,
  tool: 'pwsh',
  summary: 'pwsh "npm run probe"',
  since: minutesAgo(30),
  ...over,
})

// --- The head and the order of the groups ----------------------------------

test('the page has its head and the groups in the order of rules design §9.1; the recovery group only when it has something', () => {
  const page = pageOf(viewOf())
  assert.equal(page.head, '规则板 · 一件事要发生时，让不让做')
  assert.equal(page.notice, null)
  assert.deepEqual(page.groups.map(group => [group.key, group.title]), [
    ['gates', '会挡住动作的门'],
    ['defaults', '默认规则与高峰模式'],
    ['mine', '你定的规则'],
    ['code', '写在代码里的规则（启用即拦）'],
    ['signals', '信号与检测器'],
    ['waiting', '在等的工作'],
  ])
  const recovered = { at: minutesAgo(10), reason: 'snapshot-behind' as const, lost: false }
  const unresolved = { k1: { key: 'k1', label: '6-1', afterSeq: 5, why: 'digest-mismatch' as const, op: 'rule-set', actor: 'llm' as const }, k2: { key: 'k2', label: '7-1', afterSeq: 6, why: 'unreadable' as const } }
  const withRecovery = pageOf(viewOf({ read: projectReadOf(stateWith({ recovered, unresolved }), { repo: { kind: 'owed' } }) }))
  const recovery = groupOf(withRecovery, 'recovery')
  assert.equal(withRecovery.groups.at(-1), recovery)
  assert.equal(recovery.title, '提议与恢复')
  assert.deepEqual(recovery.lines, [`${momentText(recovered.at)} 存档没跟上变更记录，已补上`, '规则文件待写回'])
  assert.deepEqual(recovery.entries.map(entry => [entry.title, entry.lines, entry.grey]), [
    ['编号 6-1', ['不是规则板自己写的记录 · 身份 llm · 操作 rule-set'], ['照改：打 /rules recovery 6-1 照改；忽略：/rules recovery 6-1 忽略']],
    ['编号 7-1', ['这一行读不出'], ['忽略：打 /rules recovery 7-1 忽略']],
  ])
})

// --- Group 1: the gates ----------------------------------------------------

test('the gates group lists both checklists of the graph verbatim, says who enforces them is not installed, and names a checklist the graph does not hold', () => {
  const gates = groupOf(pageOf(viewOf()), 'gates')
  assert.deepEqual(gates.lists, [
    { id: 'norm-merge-gate', title: '合入主干前必须全部通过的命令', from: '项目图上的规范「合入主干前必须全部通过的命令」· 你批过的', items: NODES.get('norm-merge-gate')?.acceptance, tail: '由派活与合入那一块执行，它还没装上' },
    { id: 'norm-review-floor', title: '本仓库必须全审的改动', from: '项目图上的规范「本仓库必须全审的改动」· 你批过的', items: NODES.get('norm-review-floor')?.acceptance, tail: '由派活与合入那一块执行，它还没装上' },
  ])
  assert.deepEqual(gates.tail, ['要改：跟主 Agent 说「合入前的检查加一条……」；清单在项目图上由你批，改松要你同意'])
  assert.equal(JSON.stringify(gates).includes('机器认得'), false, 'no floor note before M7 lands')
  const one = groupOf(buildRulesPage(viewOf(), new Map([['norm-merge-gate', { title: '合入前要过的命令' }]])), 'gates')
  assert.deepEqual(one.lists.map(list => [list.title, list.from, list.items, list.tail]), [
    ['合入前要过的命令', '项目图上的规范「合入前要过的命令」· 你批过的', [], '由派活与合入那一块执行，它还没装上'],
    ['必须全审的改动', null, ['这个项目还没有必须全审的改动'], null],
  ])
  const unread = groupOf(buildRulesPage(viewOf(), '项目图读不出：boom'), 'gates')
  assert.deepEqual([unread.lines, unread.lists], [['项目图读不出：boom'], []])
})

// --- Group 2: the default rule and the peak mode ---------------------------

test('the peak mode lists the three levels as text with 「← 现在」 on the current one only, the cap of the reduce level as not installed, and the end of a peak by the loop board', () => {
  const page = pageOf(viewOf({ rows: { 'glm-prompt': 'active', rules: 'active', loops: 'active' } }))
  const defaults = groupOf(page, 'defaults')
  assert.deepEqual(defaults.grey, ['项目编排带来的 · 只能看；高峰时段来自 GLM 通道'])
  assert.deepEqual(defaults.entries.map(entry => entry.key), ['builtin:glm-peak-pricing', 'peak-mode', 'builtin:glm-peak-reduce', 'builtin:glm-peak-stop', 'builtin:glm-peak-stop-dispatch', 'builtin:glm-peak-stop-scripts'])
  const pricing = entryOf(page, 'defaults', 'builtin:glm-peak-pricing')
  assert.deepEqual([pricing.title, pricing.small, pricing.grey], [`${GLM_PEAK_PRICING.title}（工作日 14:00–18:00）`, 'builtin:glm-peak-pricing', []])
  assert.deepEqual(pricing.lines, [`此刻是高峰，到 ${momentText(VIEW_PEAK_END)} 结束`, '只告知 · 告诉模型的是 glm-prompt 行的高峰提醒，此刻生效', '判定它的是 rules 行，此刻生效'])
  const mode = entryOf(page, 'defaults', 'peak-mode')
  assert.equal(mode.title, '高峰时 GLM 的活怎么办')
  assert.deepEqual(mode.lines, [
    '高峰模式：GLM 高峰时段（工作日 14:00–18:00）里 GLM 的活怎么办，你选一档。',
    '现在是：少做（出厂默认）',
    '无影响：照常做，只提醒',
    '少做：高峰里同时至多 1 个 GLM 子 agent，重活挪到高峰之后，必要的活照做 ← 现在',
    '不做：高峰里 GLM 的活停下排队，高峰结束后接着做',
    '派活那一块还没装上，同时至多 1 个这一条现在只在提醒主 Agent',
    '高峰结束时叫醒主 Agent、接上挪开的活，由循环板做',
    '主 Agent 不受高峰模式影响，任何时候都照常回你的话；高峰模式只管它派出去的子 agent 与重活',
  ])
  assert.deepEqual([mode.grey, mode.jump], [['要改：在输入框打 /rules peak 无影响|少做|不做。'], null])
  assert.deepEqual(entryOf(page, 'defaults', 'builtin:glm-peak-reduce').lines, ['少做档启用 · 此刻启用', '最近 7 天排队 0 次'])
  assert.deepEqual(entryOf(page, 'defaults', 'builtin:glm-peak-stop').lines, ['不做档启用 · 此刻没启用', '最近 7 天排队 0 次'])
  const inform = entryOf(pageOf(viewOf({ read: readWith(humanLevel('inform')) })), 'defaults', 'peak-mode')
  assert.deepEqual(inform.lines.filter(line => line.includes('← 现在')), ['无影响：照常做，只提醒 ← 现在'])
  assert.equal(inform.lines.some(line => line.includes('派活那一块') || line.includes('循环板')), false, 'the level that holds nothing back has no cap and no end of a peak')
  const stop = entryOf(pageOf(viewOf({ read: readWith(humanLevel('stop')) })), 'defaults', 'peak-mode')
  assert.deepEqual(stop.lines.filter(line => line.includes('← 现在')), ['不做：高峰里 GLM 的活停下排队，高峰结束后接着做 ← 现在'])
  assert.ok(stop.lines.includes('循环板没装上：高峰结束后主 Agent 要等下一次有人或有事叫它'), 'the loop row is not loaded')
  assert.equal(stop.lines.some(line => line.includes('派活那一块')), false)
})

test('the peak words without a pricing service, with a peak that cannot be read, and on the stop level with work waiting', () => {
  const none = pageOf(viewOf({ reading: { peak: undefined, why: '没有计价服务（GLM 通道包未装，或它的 glm-login 行未启用）', noService: true }, hoursZh: undefined }))
  const noneDefaults = groupOf(none, 'defaults')
  assert.deepEqual(noneDefaults.lines, ['装了 GLM 通道包才有高峰时段，高峰模式现在不起作用'])
  assert.deepEqual(noneDefaults.entries.map(entry => entry.key), ['peak-mode'], 'only the level is left')
  assert.deepEqual(entryOf(none, 'defaults', 'peak-mode').lines, ['现在是：少做（出厂默认）', '无影响：照常做，只提醒', '少做：高峰里同时至多 1 个 GLM 子 agent，重活挪到高峰之后，必要的活照做 ← 现在', '不做：高峰里 GLM 的活停下排队，高峰结束后接着做'])
  assert.deepEqual(entryOf(none, 'signals', 'glm-peak').lines, ['读不出：没有计价服务，装了 GLM 通道包才有（宿主 4242）'])

  const broken = pageOf(viewOf({ reading: { peak: undefined, why: '计价服务的 peak 出错：boom', problem: 'the pricing service failed: boom' } }))
  assert.equal(entryOf(broken, 'defaults', 'builtin:glm-peak-pricing').lines[0], '读不到是不是高峰（计价服务的 peak 出错：boom）')
  assert.ok(entryOf(broken, 'defaults', 'peak-mode').lines.includes('读不到是不是高峰（计价服务的 peak 出错：boom），这一档现在不生效'))
  assert.deepEqual(entryOf(broken, 'signals', 'glm-peak').lines, ['读不出：计价服务的 peak 出错：boom（宿主 4242）'])

  const tickets = {
    'q-1': waitingTicket('q-1', { pausedGoal: { id: 'g-1', revision: 2 } }),
    'q-2': waitingTicket('q-2', { rules: ['r-hold'], summary: 'git push', agentLabel: '主 Agent', sessionId: 'sess-main' }),
    'q-3': waitingTicket('q-3', { rules: ['builtin:glm-peak-stop-dispatch'], host: { pid: 9, startedAt: 1 } }),
  }
  const waiting = pageOf(viewOf({ read: readWith({ ...humanLevel('stop'), tickets }), liveHosts: [{ pid: 4242, startedAt: 1 }] }))
  const end = momentText(VIEW_PEAK_END)
  assert.equal(entryOf(waiting, 'defaults', 'peak-mode').jump, `高峰不做：2 件事在排队、1 个子 agent 停着，${end}后接着做`)
  const [first, second, third] = groupOf(waiting, 'waiting').entries
  assert.deepEqual([first?.title, first?.small, first?.lines], ['pwsh "npm run probe"', 'q-1', ['glm 子 agent · 会话 sess-worker', `因为 builtin:glm-peak-stop · ${momentText(minutesAgo(30))} 起 · 在等`, `高峰不做，${end}接着做；这个子 agent 的 goal 已暂停`]])
  assert.deepEqual(first?.grey, ['这个会话本次高峰照常做：打 /rules let q-1；取消：/rules cancel q-1'])
  assert.deepEqual(second?.grey, ['放行这一次：打 /rules let q-2；取消：/rules cancel q-2'])
  assert.equal(second?.lines.some(line => line.includes('高峰不做')), false, 'a person\'s rule is not the stop level')
  assert.ok(third?.lines.includes('宿主不在，下一次写入时过期'), 'the owning host is not alive')
})

// --- The home line and the guide line --------------------------------------

test('the home line: the peak sentence in a peak, even with work waiting; the waiting work outside a peak; none otherwise', () => {
  const end = momentText(VIEW_PEAK_END)
  assert.equal(rulesHomeLine(viewOf()), `GLM 高峰中，到 ${end} · 高峰模式：少做`)
  assert.equal(rulesHomeLine(viewOf({ reading: { peak: true } })), 'GLM 高峰中 · 高峰模式：少做', 'no end: no time part')
  const tickets = { 'q-1': waitingTicket('q-1', { rules: ['r-hold'] }), 'q-2': waitingTicket('q-2', { rules: ['r-hold'] }), 'q-3': waitingTicket('q-3', { rules: ['r-hold'], state: 'cleared' }) }
  assert.equal(rulesHomeLine(viewOf({ read: readWith({ ...humanLevel('stop'), tickets }) })), `GLM 高峰中，到 ${end} · 高峰模式：不做`)
  const offPeak: RulesViewInput['reading'] = { peak: false, until: '2026-10-29T06:00:00.000Z' }
  assert.equal(rulesHomeLine(viewOf({ reading: offPeak, read: readWith({ tickets }) })), '2 件事在等规则放行', 'a cleared ticket does not wait')
  assert.equal(rulesHomeLine(viewOf({ reading: offPeak })), null)
  assert.equal(rulesHomeLine(viewOf({ reading: { peak: undefined, why: 'x', noService: true } })), null)
  assert.equal(rulesHomeLine(null), null)
})

test('the guide line: the level and who chose it, the reason a peak cannot be read, none without a pricing service; both lines at most 60 code points', () => {
  assert.equal(rulesGuideLine(viewOf()), '现在是：少做（出厂默认）')
  assert.equal(rulesGuideLine(viewOf({ read: readWith(humanLevel('stop')) })), `现在是：不做（你在 ${momentText(CHOSEN_AT)} 选的）`)
  assert.equal(rulesGuideLine(viewOf({ read: readWith({ peakMode: { level: 'inform', at: CHOSEN_AT, origin: { actor: 'llm', relay: '高峰照常做' } } }) })), `现在是：无影响（你在对话里说的，${momentText(CHOSEN_AT)}）`)
  assert.equal(rulesGuideLine(viewOf({ reading: { peak: undefined, why: '计价服务的 peak 出错：boom', problem: 'boom' } })), '现在读不到是不是高峰（计价服务的 peak 出错：boom），档位是少做')
  assert.equal(rulesGuideLine(viewOf({ reading: { peak: undefined, why: 'x', noService: true } })), null)
  assert.equal(rulesGuideLine(null), null)
  const long = rulesGuideLine(viewOf({ reading: { peak: undefined, why: '读'.repeat(80), problem: 'boom' } })) ?? ''
  assert.deepEqual([[...long].length, long.endsWith('…')], [60, true])
  const views = [viewOf(), viewOf({ read: readWith(humanLevel('stop')) }), viewOf({ reading: { peak: false, until: VIEW_PEAK_END }, read: readWith({ tickets: { 'q-1': waitingTicket('q-1') } }) })]
  for (const line of views.flatMap(view => [rulesHomeLine(view), rulesGuideLine(view)])) assert.ok(line === null || [...line].length <= 60, `${line} fits the line`)
})

// --- Group 3: the person's rules -------------------------------------------

test('a person\'s rule says 什么时候 · 筛选 · 动作, its condition now, scope, time, who set it and its 7-day counts; a noted rule is the person\'s choice; a script says its standing, timeout and failure', () => {
  const push: Rule = ruleOf({ id: 'r-push', title: '冻结时别推送', filter: { command: { in: ['git push'] } }, condition: { signal: 'code-freeze', is: true } })
  const noted: Rule = ruleOf({ id: 'r-note', title: '记下改依赖的命令', action: { kind: 'record' } })
  const gone: Rule = ruleOf({ id: 'r-old', title: '过期的规则', lifetime: { kind: 'ttl', expiresAt: minutesAgo(60) } })
  const script = (id: string): Rule => ruleOf({ id, title: id, action: { kind: 'script', script: scriptRef(id) } })
  const rules = { 'r-push': push, 'r-note': noted, 'r-old': gone, 'r-s1': script('r-s1'), 'r-s2': script('r-s2'), 'r-s3': script('r-s3') }
  const scripts = { 'r-s1': scriptRef('r-s1'), 'r-s2': { ...scriptRef('r-s2', SHA_OTHER), approvedAt: minutesAgo(600) }, 'r-s3': { ...scriptRef('r-s3'), approvedAt: minutesAgo(600) } }
  const signals = { 'code-freeze': { type: { kind: 'boolean' as const }, manual: { value: true, at: minutesAgo(60) } } }
  const records = [gateRecord('r-push', 5, 'enforce'), gateRecord('r-push', 6, 'record'), gateRecord('r-note', 7, 'record'), gateRecord('r-note', 8, 'record')]
  const page = pageOf(viewOf({ read: readWith({ rules, scripts, signals }), records, missingScripts: new Set(['r-s3']) }))
  const mine = groupOf(page, 'mine')
  assert.deepEqual(mine.entries.map(entry => entry.key), ['r-note', 'r-old', 'r-push', 'r-s1', 'r-s2', 'r-s3'])
  const pushEntry = entryOf(page, 'mine', 'r-push')
  assert.deepEqual([pushEntry.title, pushEntry.small, pushEntry.greyed], ['冻结时别推送', 'r-push', false])
  assert.deepEqual(pushEntry.lines, [
    '要执行一次工具调用之前 · 命令是 git push · 拦下',
    '条件：code-freeze 开着 · 此刻成立',
    `这个项目 · ${momentText(push.origin.at)} 起 · 直到解除 · 你定的`,
    '最近 7 天挡下 1 次，只记下 1 次',
  ])
  assert.deepEqual(pushEntry.grey, ['要改：跟主 Agent 说「把这条改成……」；要解除：打 /rules lift r-push；要删掉：打 /rules delete r-push'])
  assert.deepEqual(pushEntry.details, [`为什么有它：${push.reason}`])
  const noteEntry = entryOf(page, 'mine', 'r-note')
  assert.deepEqual(noteEntry.lines.slice(0, 1), ['要执行一次工具调用之前 · 只记下，不挡'])
  assert.ok(noteEntry.lines.includes('最近 7 天只记下 2 次 · 这是你选的做法，不是试运行阶段'))
  const old = entryOf(page, 'mine', 'r-old')
  assert.deepEqual([old.greyed, old.lines.includes('时间到了，不再生效')], [true, true])
  const design = effectiveTimeoutSeconds({ recent: [], purpose: 'gate' }).seconds
  assert.deepEqual(entryOf(page, 'mine', 'r-s1').lines.slice(-3), ['脚本：docs/rules/scripts/r-s1.mjs', '这台电脑上没有你看过原文的记录，先不跑', `超时 ${design} 秒（设计里定的固定值） · 超时或出错时放行（默认）`])
  assert.ok(entryOf(page, 'mine', 'r-s2').lines.includes('脚本 docs/rules/scripts/r-s2.mjs 和你同意的那一版不一样，没在跑；要用改过的这一版，跟主 Agent 说，它会把新的原文给你看'))
  assert.ok(entryOf(page, 'mine', 'r-s3').lines.includes('脚本文件不见了'))
  assert.deepEqual(mine.tail, ['要加一条：跟主 Agent 说你要的规矩，例如「今晚 21 点以后别推送」，它会把要写的规则作为一个方案给你看'])
  assert.equal(JSON.stringify(page).includes('4 周没用过'), false, 'the weekly proposal is not on main')
  const empty = groupOf(pageOf(viewOf()), 'mine')
  assert.deepEqual([empty.lines, empty.entries], [['还没有你定的规则'], []])
})

// --- Group 4: the code rules -----------------------------------------------

test('the code rules enforce on enablement: the row and its state, 7 days of denials with the last five under 讲细点, and the lift line as the view gives it', () => {
  const view = viewOf({
    rows: { guard: 'active' },
    records: [
      { at: minutesAgo(3), rule: 'workspace-containment', tool: 'pwsh', correction: 'no', call: { tool: 'pwsh', command: 'echo one' } },
      { at: minutesAgo(4), rule: 'workspace-containment', tool: 'pwsh', correction: 'no', call: { tool: 'pwsh', command: 'echo two' } },
    ],
    lifted: [{ rule: 'files-only', at: minutesAgo(90), via: 'chat', words: '先撤下循环板文件那条' }],
  })
  const page = pageOf(view)
  const code = groupOf(page, 'code')
  assert.deepEqual(code.entries.map(entry => entry.key), view.code.map(entry => entry.id))
  const containment = entryOf(page, 'code', 'guard:workspace-containment')
  assert.deepEqual(containment.lines, ['在 guard 行，此刻生效', '最近 7 天拦下 2 次'])
  assert.deepEqual(containment.grey, ['项目编排带来的 · 只能看', `撤下：跟主 Agent 说「撤下${containment.title}」`])
  assert.deepEqual(containment.details, [`${momentText(minutesAgo(3))} · pwsh echo one · 拦下 · workspace-containment`, `${momentText(minutesAgo(4))} · pwsh echo two · 拦下 · workspace-containment`])
  assert.deepEqual(entryOf(page, 'code', 'guard:lift-files-only').grey.at(-1), `这一条现在还不能一句话撤下（${LIFT_BOARD_ONLY}）`)
  assert.deepEqual(entryOf(page, 'code', 'rules:files-only').grey.at(-1), `这一条现在还不能一句话撤下（${LIFT_NOT_OFFERED}）`)
  const loops = entryOf(page, 'code', 'loops:files-only')
  assert.deepEqual([loops.greyed, loops.lines.at(-1), loops.grey], [true, `已撤下 · ${momentText(minutesAgo(90))}`, ['项目编排带来的 · 只能看', `要恢复：跟主 Agent 说「恢复${loops.title}」`]])
  assert.deepEqual(entryOf(page, 'code', 'graph:graph-files-only').lines, ['在 graph 行，此刻未加载', '最近 7 天拦下 0 次'])
  assert.deepEqual(entryOf(page, 'code', 'graph:graph-files-only').details, ['最近没有拦下的记录'])
  const text = JSON.stringify(code)
  for (const word of ['只记下，不挡', '影子', '试运行', '转正', 'credential']) assert.equal(text.includes(word), false, `the code rules group has no ${word}`)
})

// --- Group 5: the signals --------------------------------------------------

test('the signals: glm-peak with the host that read it, each switch with its value, source, times and how to change it', () => {
  const signals = {
    'code-freeze': { type: { kind: 'boolean' as const }, description: '代码冻结', manual: { value: true, at: minutesAgo(60), expiresAt: minutesAgo(-60) } },
    'error-rate': { type: { kind: 'number' as const, unit: '次' } },
  }
  const page = pageOf(viewOf({ read: readWith({ signals }) }))
  const group = groupOf(page, 'signals')
  assert.deepEqual(group.entries.map(entry => [entry.key, entry.title, entry.small]), [['glm-peak', 'GLM 是不是高峰', 'glm-peak'], ['code-freeze', '代码冻结', 'code-freeze'], ['error-rate', 'error-rate', 'error-rate']])
  assert.deepEqual(entryOf(page, 'signals', 'glm-peak').lines, [`是，到 ${momentText(VIEW_PEAK_END)}（工作日 14:00–18:00，计价服务现算）（宿主 4242）`])
  const freeze = entryOf(page, 'signals', 'code-freeze')
  assert.deepEqual(freeze.lines, [`开 · 你设的 · ${momentText(minutesAgo(60))} 起 · ${momentText(minutesAgo(-60))} 到期`])
  assert.deepEqual(freeze.grey, ['要改：打 /rules on code-freeze [时长] 或 /rules off code-freeze；不要了：/rules delete code-freeze'])
  const rate = entryOf(page, 'signals', 'error-rate')
  assert.deepEqual([rate.lines, rate.grey, rate.details.length], [['读不出 · 没有来源'], ['要改：打 /rules set error-rate <值> [时长]；不要了：/rules delete error-rate'], 1])
  assert.deepEqual(group.tail, ['要定义一个开关或加一个检测器：跟主 Agent 说你要测什么'])
  const off = pageOf(viewOf({ reading: { peak: false, until: '2026-10-29T06:00:00.000Z' } }))
  assert.deepEqual(entryOf(off, 'signals', 'glm-peak').lines, [`否，下一次 ${momentText('2026-10-29T06:00:00.000Z')}（宿主 4242）`])
})

// --- The status entries, no project, no view -------------------------------

test('the status entries are the view\'s items with their detail; a status row that failed says so; no project or no view.json is one sentence', () => {
  const items: StatusItem[] = [
    { id: 'rules/peak', owner: 'rules', audience: 'agent', asOf: minutesAgo(0), source: 'x', text: '- 高峰：高峰中，到 18:00' },
    { id: 'rules/lifts', owner: 'rules', audience: 'agent', asOf: minutesAgo(0), source: 'y', text: '- 撤下的规则：无', detail: ['- 最近 7 天没有撤下'] },
  ]
  const page = pageOf(viewOf({ items, statusProblems: [{ row: 'guard', reason: 'boom' }, { row: 'rules', reason: 'bang' }] }))
  assert.deepEqual(page.items, [{ id: 'rules/peak', text: '- 高峰：高峰中，到 18:00', detail: [] }, { id: 'rules/lifts', text: '- 撤下的规则：无', detail: ['- 最近 7 天没有撤下'] }])
  assert.deepEqual(page.problems, ['拦下与撤下的汇总暂时读不到：boom', '高峰时段这一行暂时读不到：bang'])
  for (const [noProject, sentence] of [['no-cwd', '这个会话没有工作目录，只有代码里的规则对它生效'], ['not-git', '这个会话不在 git 项目里，只有代码里的规则对它生效']] as const) {
    assert.deepEqual(buildRulesPage(null, NODES, { noProject }), { head: '规则板 · 一件事要发生时，让不让做', notice: sentence, items: [], problems: [], groups: [] })
  }
  const unwritten = pageOf(null)
  assert.match(unwritten.notice ?? '', /^规则板还没写出这个项目的这一页/)
  assert.deepEqual(unwritten.groups.map(group => group.key), ['gates'], 'the checklists come from the graph, not from view.json')
})

// --- Plain words -----------------------------------------------------------

/** The files whose strings the person reads on the rules page: the client's page files and the host's lift sentences. */
const PAGE_FILES = ['ui/src/rules/model.ts', 'ui/src/rules/source.ts', 'ui/src/rules/board.ts', 'ui/src/rules/RulesPage.tsx', 'src/rules/view-build.ts']

/**
 * The string literals, template parts and JSX text with Chinese in them of
 * the files that make what the person reads, as the TypeScript parser sees
 * them (nested templates and backticks in comments do not confuse it).
 */
async function fixedStrings(files: readonly string[]): Promise<string> {
  const found: string[] = []
  for (const file of files) {
    const path = join(import.meta.dirname, '..', ...file.split('/'))
    const source = ts.createSourceFile(path, await readFile(path, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const visit = (node: ts.Node): void => {
      const literal = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)
      if (literal && /[\u4e00-\u9fff]/.test(node.text)) found.push(node.text)
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return found.join('\n')
}

/** Every line the page shows. */
function shownText(page: Page): string {
  return [
    page.head,
    page.notice ?? '',
    ...page.items.flatMap(item => [item.text, ...item.detail]),
    ...page.problems,
    ...page.groups.flatMap(group => [
      group.title,
      ...group.grey,
      ...group.lines,
      ...group.lists.flatMap(list => [list.title, list.from ?? '', ...list.items, list.tail ?? '']),
      ...group.entries.flatMap(entry => [entry.title, ...entry.lines, ...entry.grey, ...entry.details, entry.jump ?? '']),
      ...group.tail,
    ]),
  ].join('\n')
}

test('every fixed string of the page and every line of a full page is in plain words (rules design §9.1), and no credential-read rule is listed', async () => {
  const strings = await fixedStrings(PAGE_FILES)
  assert.ok(strings.includes('会挡住动作的门') && strings.includes('这是你选的做法，不是试运行阶段'), 'the check reads the strings')
  assert.deepEqual(plainWordsIn(strings), [])
  const rules = { 'r-push': ruleOf({ id: 'r-push', title: '冻结时别推送', filter: { command: { in: ['git push'] }, role: { in: ['subagent'] } }, condition: { all: [{ signal: 'code-freeze', is: true }, { not: { clock: { from: '09:00', to: '21:00', days: [1, 5] } } }] } }) }
  const tickets = { 'q-1': waitingTicket('q-1', { pausedGoal: { id: 'g-1', revision: 2 } }) }
  const full = pageOf(viewOf({ read: readWith({ ...humanLevel('stop'), rules, tickets, notices: { 'n-1': { kind: 'late-block', rule: 'r-push', text: '晚到的拦下：git push', at: minutesAgo(5) } } }), rows: { guard: 'active', loops: 'active' } }))
  assert.equal(entryOf(full, 'mine', 'r-push').lines[0], '要执行一次工具调用之前 · 命令是 git push、谁在做是 子 agent · 拦下')
  assert.equal(entryOf(full, 'mine', 'r-push').lines[1], '条件：code-freeze 开着，并且周一、周五 09:00–21:00之外 · 此刻读不出')
  const shown = shownText(full)
  assert.ok(shown.includes('主 Agent 下次走步时会收到') && shown.includes(LIFT_BOARD_ONLY) && shown.includes(LIFT_NOT_OFFERED), 'the full page has every group and the host\'s lift sentences')
  assert.deepEqual(plainWordsIn(shown), [])
  assert.equal(shown.includes('credential'), false)
})

// --- The board ---------------------------------------------------------------

const VIEW_JSON = 'C:/work/app/.llm/rules/view.json'
const IN_PROJECT = { hournessRules: { projectKey: 'C:/work/app', viewFile: VIEW_JSON } }
const NO_PROJECT_VALUE = { hournessRules: { projectKey: null, viewFile: null } }
const NOTHING: BoardState = { available: true, homeLine: null, guideLine: null, peakApplies: false }
const viewText = (view: RulesView): string => `${JSON.stringify(view, null, 2)}\n`
/** The change frame the host's write of view.json brings. */
const rewritten = (fake: ReturnType<typeof fakeRemote>): void => { fake.push({ kind: 'change', change: { absolutePath: VIEW_JSON } }) }

const BOARD_ITEMS: StatusItem[] = [
  { id: 'rules/peak', owner: 'rules', audience: 'agent', asOf: minutesAgo(0), source: 'glmHournessPricing', text: '- 高峰：高峰中，到 18:00（工作日 14:00–18:00）', fields: { peakMode: 'reduce', peakModeOrigin: 'default' } },
  { id: 'rules/lifts', owner: 'rules', audience: 'agent', asOf: minutesAgo(0), source: 'docs/guard/lifts.jsonl', text: '- 撤下的规则：无' },
]

test('the rules board registers as 规则板 under BOARD_ORDER[0] and comes first on the footer, before a board registered earlier', () => {
  const { sessions } = fakeSessions({}, {})
  const loops = loopsBoard(() => null, sessions)
  const rules = rulesBoard(() => null, { remote: fakeRemote({}).remote, sessions })
  try {
    registerBoard(loops.board)
    registerBoard(rules.board)
    assert.deepEqual([rules.board.id, rules.board.label, BOARD_ORDER[0]], ['rules', '规则板', 'rules'])
    assert.deepEqual(boards().map(board => board.id), ['rules', 'loops'])
  }
  finally {
    loops.dispose()
    rules.dispose()
  }
})

test('the board is there while the projection value is, also outside a project with nothing to hand over; a cold session asks once', async () => {
  const fake = fakeRemote({})
  const { sessions, setProjections, refreshCountOf } = fakeSessions({}, IN_PROJECT)
  const { board, dispose } = rulesBoard(() => null, { remote: fake.remote, sessions })
  try {
    const stop = board.subscribe('s1', () => {})
    setProjections('s1', {})
    assert.equal(board.snapshot('s1').available, false, 'without the rules row there is no board')
    setProjections('s1', NO_PROJECT_VALUE)
    assert.deepEqual(board.snapshot('s1'), NOTHING, 'a session outside any project still opens the page')
    setProjections('s1', {})
    assert.equal(board.snapshot('s1').available, false)
    stop()
    const stopCold = board.subscribe('cold', () => {})
    await until(() => board.snapshot('cold').available, 'the cold session\'s values')
    assert.equal(refreshCountOf('cold'), 1)
    assert.deepEqual(board.snapshot('cold'), NOTHING, 'no view.json yet: there, nothing to hand over')
    stopCold()
  }
  finally {
    dispose()
  }
})

test('once view.json is read the board hands over its home line, guide line, peakApplies and items; the same object while nothing moved; checkedBoardState keeps it without a warning', async () => {
  const built = buildRulesView(viewInputOf({ items: BOARD_ITEMS }), NOW_MS)
  const fake = fakeRemote({ [VIEW_JSON]: viewText(built) })
  const { sessions } = fakeSessions({ s1: IN_PROJECT }, IN_PROJECT)
  const { board, dispose } = rulesBoard(() => null, { remote: fake.remote, sessions })
  const warn = console.warn
  const warnings: string[] = []
  try {
    const stop = board.subscribe('s1', () => {})
    await until(() => board.snapshot('s1').homeLine !== null, 'the view read')
    const state = board.snapshot('s1')
    const fileItems = (JSON.parse(viewText(built)) as RulesView).items
    assert.deepEqual(state, { available: true, homeLine: `GLM 高峰中，到 ${momentText(VIEW_PEAK_END)} · 高峰模式：少做`, guideLine: '现在是：少做（出厂默认）', peakApplies: true, items: fileItems })
    assert.deepEqual(state.items, fileItems, 'the items are the file\'s, verbatim')
    console.warn = (...args: unknown[]) => { warnings.push(args.join(' ')) }
    assert.deepEqual(checkedBoardState('rules', state), state)
    assert.deepEqual(warnings, [])
    const reads = fake.readsOf(VIEW_JSON)
    await fake.write(VIEW_JSON, viewText({ ...built, at: new Date(NOW_MS + 60_000).toISOString() }))
    rewritten(fake)
    await until(() => fake.readsOf(VIEW_JSON) > reads, 'the rewrite read')
    await new Promise(resolve => { setTimeout(resolve, 20) })
    assert.equal(board.snapshot('s1'), state, 'only the moment moved: the same object')
    const off = buildRulesView(viewInputOf({ reading: { peak: false, until: '2026-10-29T06:00:00.000Z' }, read: projectReadOf(stateWith({ tickets: { 'q-1': waitingTicket('q-1', { rules: ['r-hold'] }) } })) }), NOW_MS)
    await fake.write(VIEW_JSON, viewText(off))
    rewritten(fake)
    await until(() => board.snapshot('s1').homeLine === '1 件事在等规则放行', 'the moved view')
    assert.deepEqual(board.snapshot('s1').items, [])
    stop()
  }
  finally {
    console.warn = warn
    dispose()
  }
})

// --- The reader of view.json -------------------------------------------------

test('the reader keeps the last view on a failed read and says why, refuses a text that is not a view, and follows a rewrite through the change feed and the poll', async () => {
  const built = buildRulesView(viewInputOf(), NOW_MS)
  const fake = fakeRemote({ [VIEW_JSON]: viewText(built) })
  const source = new RulesSource(fake.remote, 's1', VIEW_JSON, 25)
  const stop = source.subscribe(() => {})
  try {
    await until(() => !source.getSnapshot().loading, 'the first read')
    assert.deepEqual([source.getSnapshot().problem, source.getSnapshot().missing, source.getSnapshot().model], [null, false, built])
    fake.fail(VIEW_JSON, 'boom')
    rewritten(fake)
    await until(() => source.getSnapshot().problem === '规则板读不出：boom', 'the failed read')
    assert.deepEqual(source.getSnapshot().model, built, 'the last view stays')
    fake.fail(VIEW_JSON, undefined)
    await fake.write(VIEW_JSON, JSON.stringify({ ...built, version: 2 }))
    rewritten(fake)
    await until(() => source.getSnapshot().problem === '规则板的 view.json 读不懂，下面是上一次读到的样子', 'the text that is not a view')
    assert.deepEqual(source.getSnapshot().model, built)
    const later = buildRulesView(viewInputOf({ reading: { peak: false, until: '2026-10-29T06:00:00.000Z' } }), NOW_MS)
    await fake.write(VIEW_JSON, viewText(later))
    await until(() => source.getSnapshot().model?.peak.now === false, 'the polled rewrite, without a change frame')
    assert.equal(source.getSnapshot().problem, null)
  }
  finally {
    stop()
  }
  const empty = new RulesSource(fakeRemote({}).remote, 's1', VIEW_JSON)
  const stopEmpty = empty.subscribe(() => {})
  try {
    await until(() => !empty.getSnapshot().loading, 'the read of a file that is not there')
    assert.deepEqual([empty.getSnapshot().missing, empty.getSnapshot().problem, empty.getSnapshot().model], [true, null, null], 'a view.json not there yet is no view, not a failure')
  }
  finally {
    stopEmpty()
  }
  const first = holdRulesSource(fake.remote, 's1', VIEW_JSON)
  const second = holdRulesSource(fake.remote, 's1', VIEW_JSON)
  assert.equal(first.source, second.source, 'one reader per session and file')
  first.release()
  second.release()
})

// --- The page never writes ----------------------------------------------------

const WRITE_MARK = /remote\.commands|commands\.execute|\.write(?:File|Bytes)?\(|radio|<(?:button|input|textarea|select|form)[\s/>]/i

test('no file under ui/src/rules/ calls remote.commands, writes a file or renders a button, an input or a radio', async () => {
  const dir = join(import.meta.dirname, '..', 'ui', 'src', 'rules')
  const files = (await readdir(dir)).filter(name => /\.(ts|tsx)$/.test(name))
  assert.deepEqual(files.sort(), ['RulesPage.tsx', 'board.ts', 'model.ts', 'source.ts'])
  for (const file of files) assert.equal(WRITE_MARK.test(await readFile(join(dir, file), 'utf8')), false, `${file} must not write: no command call, no file write, no button, input or radio`)
})