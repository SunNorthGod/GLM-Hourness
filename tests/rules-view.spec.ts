/**
 * The rules page's data (docs/ORCHESTRATION.md §16.14): buildRulesView over
 * what the row has read, group by group, and the reader the client parses
 * view.json with. Pure: the project state, the journal records and the
 * readings are built here; nothing is read from disk.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { GUARD_RULES } from '../src/guard/catalog.ts'
import { MAIN_AGENT_RULES } from '../src/guard/main-agent-rules.ts'
import type { GuardRecord } from '../src/guard/records.ts'
import { effectiveTimeoutSeconds } from '../src/loops/trigger.ts'
import type { StatusItem } from '../src/shared/status.ts'
import { BUILTIN_RULES, CATALOG } from '../src/rules/builtin.ts'
import { emptyState, type ProjectState, type Rule, type Ticket } from '../src/rules/model.ts'
import { buildRulesView, LIFT_BOARD_ONLY, LIFT_NOT_OFFERED, VIEW_ROWS, type RulesViewInput } from '../src/rules/view-build.ts'
import { journalRuleOf, parseRulesView, RULES_VIEW_VERSION, type RulesView } from '../src/rules/view.ts'
import { projectReadOf as readOf, ruleOf, scriptRef, SHA_OTHER, VIEW_PEAK_END as PEAK_END, viewInputOf } from './rules-fixtures.ts'

/** Wednesday 15:00 in UTC+8, inside GLM's peak hours; the peak ends at 18:00. */
const NOW_MS = Date.parse('2026-10-28T15:00:00+08:00')
const ago = (days: number, minutes = 0): string => new Date(NOW_MS - days * 86_400_000 - minutes * 60_000).toISOString()

const view = (over: Partial<RulesViewInput> = {}): RulesView => buildRulesView(viewInputOf(over), NOW_MS)

/** A denial as the guard framework journals it: the bare rule id, no mode. */
const guardDenial = (rule: string, at: string, command = 'echo hi'): GuardRecord => ({ at, rule, tool: 'pwsh', correction: 'no', call: { tool: 'pwsh', command } })
/** A line of the rules board's gate: `rules:<id>` with its mode and effect. */
const boardLine = (rule: string, at: string, kind: 'block' | 'queue' | 'record'): GuardRecord => (kind === 'record'
  ? { at, rule, tool: 'pwsh', mode: 'record', effect: 'record' }
  : { at, rule, tool: 'pwsh', mode: 'enforce', effect: kind, correction: 'no' }) as unknown as GuardRecord

const codeOf = (built: RulesView, id: string): RulesView['code'][number] => {
  const entry = built.code.find(item => item.id === id)
  assert.ok(entry !== undefined, `${id} is in the code group`)
  return entry
}

test('the view has its version, the moment and the writing host; the code group is the catalog without the five entries of the peak, and execute is absent', () => {
  const built = view()
  assert.equal(built.version, RULES_VIEW_VERSION)
  assert.equal(built.at, new Date(NOW_MS).toISOString())
  assert.deepEqual(built.host, { pid: 4242 })
  assert.deepEqual(built.builtins.map(entry => entry.id), BUILTIN_RULES.map(rule => rule.id))
  assert.deepEqual(built.code.map(entry => entry.id), CATALOG.map(entry => entry.id).filter(id => !id.startsWith('builtin:')))
  assert.equal(built.code.some(entry => entry.id.includes('credential')), false, 'there is no credential-read rule')
  assert.equal(built.rows.execute, 'absent')
  assert.deepEqual(Object.keys(built.rows).sort(), [...VIEW_ROWS, 'execute'].sort())
})

test('the peak mode: the factory level with no choice, the person\'s level with its moment, and how the choice came in', () => {
  const factory = view().peak
  assert.deepEqual(factory, { applies: true, now: true, until: PEAK_END, hoursZh: '工作日 14:00–18:00', level: 'reduce', origin: 'default', waiting: { tickets: 0, pausedGoals: 0 } })
  const chosen = view({ read: readOf({ ...emptyState(), seq: 1, peakMode: { level: 'stop', at: '2026-10-28T06:30:00.000Z', origin: { actor: 'human' } } }) }).peak
  assert.deepEqual([chosen.level, chosen.origin, chosen.setAt, chosen.via], ['stop', 'human', '2026-10-28T06:30:00.000Z', 'command'])
  const relayed = view({ read: readOf({ ...emptyState(), seq: 1, peakMode: { level: 'inform', at: '2026-10-28T06:40:00.000Z', origin: { actor: 'llm', relay: '高峰照常做' } } }) }).peak
  assert.deepEqual([relayed.level, relayed.origin, relayed.via], ['inform', 'human', 'agent'])
})

test('the peak hours: no pricing service, a pricing service whose peak throws, and off peak with the next start', () => {
  const none = view({ reading: { peak: undefined, why: '没有计价服务（GLM 通道包未装，或它的 glm-login 行未启用）', noService: true }, hoursZh: undefined }).peak
  assert.equal(none.applies, false)
  assert.equal('now' in none || 'problem' in none || 'hoursZh' in none, false, 'without a pricing service there is no peak and no problem to name')
  const broken = view({ reading: { peak: undefined, why: '计价服务的 peak 出错：boom', problem: 'the pricing service failed: boom' } }).peak
  assert.deepEqual([broken.applies, broken.now, broken.problem], [true, undefined, '计价服务的 peak 出错：boom'])
  const off = view({ reading: { peak: false, until: '2026-10-29T06:00:00.000Z' } }).peak
  assert.deepEqual([off.applies, off.now, off.until], [true, false, '2026-10-29T06:00:00.000Z'])
})

test('the default rule and its entries: which level enables each, which are in force at the level, the row that tells, and 7 days of their records', () => {
  const at = (level: 'inform' | 'reduce' | 'stop'): RulesView['builtins'] => view({
    read: readOf({ ...emptyState(), seq: 1, peakMode: { level, at: '2026-10-28T06:30:00.000Z', origin: { actor: 'human' } } }),
    rows: { 'glm-prompt': 'active' },
    records: [boardLine('rules:builtin:glm-peak-stop', ago(0, 5), 'queue'), boardLine('rules:builtin:glm-peak-stop', ago(1), 'queue'), boardLine('rules:builtin:glm-peak-stop', ago(8), 'queue')],
  }).builtins
  const enabled = (list: RulesView['builtins']): string[] => list.filter(entry => entry.enabled).map(entry => entry.id)
  assert.deepEqual(enabled(at('inform')), ['builtin:glm-peak-pricing'])
  assert.deepEqual(enabled(at('reduce')), ['builtin:glm-peak-pricing', 'builtin:glm-peak-reduce'])
  assert.deepEqual(enabled(at('stop')), ['builtin:glm-peak-pricing', 'builtin:glm-peak-stop', 'builtin:glm-peak-stop-dispatch', 'builtin:glm-peak-stop-scripts'])
  const [pricing, reduce, stop] = at('stop')
  assert.deepEqual([pricing?.effect, pricing?.toldBy, pricing?.toldState, 'partOf' in (pricing ?? {})], ['inform', 'glm-prompt', 'active', false])
  assert.deepEqual([reduce?.partOf, reduce?.enabledBy, reduce?.effect], ['builtin:glm-peak-pricing', ['reduce'], 'queue'])
  assert.equal(stop?.count7d, 2, 'the deferrals of the last 7 days, not the one of 8 days ago')
})

test('the stop level\'s waiting work: its open tickets and the paused goals among them, with the owning host alive or not', () => {
  const ticket = (id: string, rules: readonly string[], over: Partial<Ticket> = {}): Ticket => ({ id, state: 'deferred', rules, sessionId: `s-${id}`, agentLabel: 'worker', host: { pid: 7, startedAt: 1 }, signature: id, tool: 'pwsh', summary: 'pwsh "npm test"', since: ago(0, 30), ...over })
  const tickets = { 'q-1': ticket('q-1', ['builtin:glm-peak-stop'], { pausedGoal: { id: 'g-1', revision: 2 } }), 'q-2': ticket('q-2', ['builtin:glm-peak-stop-dispatch'], { host: { pid: 8, startedAt: 1 } }), 'q-3': ticket('q-3', ['r-hold']), 'q-4': ticket('q-4', ['builtin:glm-peak-stop'], { state: 'done' }) }
  const built = view({ read: readOf({ ...emptyState(), seq: 3, tickets }), liveHosts: [{ pid: 7, startedAt: 1 }] })
  assert.deepEqual(built.peak.waiting, { tickets: 2, pausedGoals: 1 })
  assert.deepEqual(built.tickets.map(entry => [entry.id, entry.stop, entry.goalPaused, entry.hostAlive]), [['q-1', true, true, true], ['q-2', true, false, false], ['q-3', false, false, true]], 'a closed ticket is not listed')
})

test('a person\'s rule: the inputs the page words, the condition now, whether it is in force, and its blocked and noted calls of 7 days counted apart', () => {
  const freeze: Rule = ruleOf({ id: 'r-freeze', title: 'Freeze', condition: { signal: 'code-freeze', is: true } })
  const noted: Rule = ruleOf({ id: 'r-note', title: 'Note pushes', action: { kind: 'record' }, condition: { signal: 'missing', is: true } })
  const gone: Rule = ruleOf({ id: 'r-old', title: 'Old', lifetime: { kind: 'ttl', expiresAt: ago(1) } })
  const state: ProjectState = { ...emptyState(), seq: 4, rules: { 'r-freeze': freeze, 'r-note': noted, 'r-old': gone }, signals: { 'code-freeze': { type: { kind: 'boolean' }, manual: { value: true, at: ago(0, 60), expiresAt: ago(-1) } } } }
  const records = [boardLine('rules:r-freeze', ago(0, 1), 'block'), boardLine('rules:r-freeze', ago(2), 'queue'), boardLine('rules:r-freeze', ago(9), 'block'), boardLine('rules:r-freeze', ago(1), 'record'), boardLine('rules:r-note', ago(0, 2), 'record'), boardLine('rules:r-note', ago(3), 'record'), guardDenial('r-freeze', ago(0, 3))]
  const built = view({ read: readOf(state), records })
  const [first, second, third] = built.rules
  assert.deepEqual(built.rules.map(rule => rule.id), ['r-freeze', 'r-note', 'r-old'])
  assert.deepEqual([first?.conditionNow, first?.inForce, first?.enforce7d, first?.record7d], ['true', true, 2, 1], 'a block and a deferral within 7 days; a bare id is not this rule')
  assert.deepEqual([second?.conditionNow, second?.enforce7d, second?.record7d, second?.action], ['unknown', 0, 2, { kind: 'record' }])
  assert.deepEqual([third?.inForce, 'conditionNow' in (third ?? {})], [false, false], 'a rule whose time is up is listed, not in force')
  assert.deepEqual([first?.scope, first?.when, first?.origin, first?.lifetime, first?.reason, first?.onUnknown], [freeze.scope, freeze.when, freeze.origin, freeze.lifetime, freeze.reason, 'skip'])
  assert.deepEqual(built.signals, [{ name: 'code-freeze', type: { kind: 'boolean' }, value: true, source: 'manual', setAt: ago(0, 60), expiresAt: ago(-1) }])
})

test('a rule\'s script: the three standings and the approved one, the file that is gone, the timeout the design fills, and what a failure does by default', () => {
  const script = (id: string, over: Partial<Extract<Rule['action'], { kind: 'script' }>> = {}, events: Rule['when']['events'] = ['gate.tool-call']): Rule => ruleOf({ id, title: id, when: { kind: 'event', events }, action: { kind: 'script', script: scriptRef(id), ...over } })
  const rules = {
    'r-approved': script('r-approved', { timeoutSeconds: 12, onError: 'block' }),
    'r-not-approved': script('r-not-approved'),
    'r-changed': script('r-changed'),
    'r-no-pin': script('r-no-pin', {}, ['gate.trunk-advance']),
  }
  const scripts = {
    'r-approved': { ...scriptRef('r-approved'), approvedAt: ago(1) },
    'r-not-approved': scriptRef('r-not-approved'),
    'r-changed': { ...scriptRef('r-changed', SHA_OTHER), approvedAt: ago(1) },
  }
  const built = view({ read: readOf({ ...emptyState(), seq: 2, rules, scripts }), missingScripts: new Set(['r-changed']) })
  const of = (id: string): RulesView['rules'][number]['script'] => built.rules.find(rule => rule.id === id)?.script
  const design = effectiveTimeoutSeconds({ recent: [], purpose: 'gate' }).seconds
  assert.deepEqual(of('r-approved'), { file: 'docs/rules/scripts/r-approved.mjs', lang: 'node', standing: 'approved', missing: false, timeoutSeconds: 12, timeoutFrom: 'entry', onError: 'block', onErrorIsDefault: false })
  assert.deepEqual([of('r-not-approved')?.standing, of('r-not-approved')?.timeoutSeconds, of('r-not-approved')?.timeoutFrom, of('r-not-approved')?.onError, of('r-not-approved')?.onErrorIsDefault], ['not-approved', design, 'design', 'allow', true])
  assert.deepEqual([of('r-changed')?.standing, of('r-changed')?.missing], ['changed', true])
  assert.deepEqual([of('r-no-pin')?.standing, of('r-no-pin')?.onError, of('r-no-pin')?.onErrorIsDefault], ['no-pin', 'block', true], 'the trunk advance blocks by default')
  assert.equal(built.rules.find(rule => rule.id === 'r-approved')?.action.kind, 'script')
})

test('a code rule: the denials of 7 days only, the last five of the whole journal newest first with what they touched, and a late denial as late', () => {
  const records = [
    ...Array.from({ length: 7 }, (_, index) => guardDenial('workspace-containment', ago(index * 2, 1), `cmd-${index}`)),
    { at: ago(0, 10), rule: 'file-tools-only', mode: 'late', via: 'turn-end', sessionId: 's-1', turn: 3, paths: ['src/a.ts', 'src/b.ts'], calls: [] } as unknown as GuardRecord,
    { at: ago(0, 20), rule: 'file-tools-only', tool: 'pwsh', correction: 'no', call: { tool: 'pwsh', command: 'x'.repeat(100) } } as GuardRecord,
  ]
  const built = view({ records, rows: { guard: 'active' } })
  const containment = codeOf(built, 'guard:workspace-containment')
  assert.equal(containment.denials7d, 4, 'days 0, 2, 4 and 6; days 8, 10 and 12 are past the week')
  assert.deepEqual(containment.last.map(entry => entry.what), ['pwsh cmd-0', 'pwsh cmd-1', 'pwsh cmd-2', 'pwsh cmd-3', 'pwsh cmd-4'])
  assert.deepEqual(containment.last.map(entry => [entry.outcome, entry.rule]), Array.from({ length: 5 }, () => ['block', 'workspace-containment']))
  assert.deepEqual([containment.row, containment.rowState, containment.title], ['guard', 'active', GUARD_RULES[0]?.title])
  const shell = codeOf(built, 'guard:file-tools-only')
  assert.equal(shell.denials7d, 2, 'the late denial counts')
  assert.deepEqual(shell.last.map(entry => [entry.outcome, entry.what.length]), [['late', 'src/a.ts、src/b.ts'.length], ['block', 60]], 'newest first; the command is cut at 60 characters')
  assert.equal(codeOf(built, 'graph:graph-files-only').rowState, 'absent', 'a row this host does not load')
})

test('the journal ids: the guard\'s and the main agent\'s rules journal their bare id, the rules board writes rules:<id>, and loops:files-only and rules:files-only do not mix', () => {
  for (const rule of GUARD_RULES) assert.equal(journalRuleOf(`${rule.row}:${rule.id}`), rule.id)
  for (const rule of MAIN_AGENT_RULES) assert.equal(journalRuleOf(`design:${rule.id}`), rule.id)
  assert.equal(journalRuleOf('rules:files-only'), 'rules:files-only')
  for (const rule of BUILTIN_RULES) assert.equal(journalRuleOf(rule.id), `rules:${rule.id}`)
  assert.equal(journalRuleOf('r-probe-block'), 'rules:r-probe-block')
  const built = view({ records: [guardDenial('files-only', ago(0, 1)), guardDenial('files-only', ago(0, 2)), boardLine('rules:files-only', ago(0, 3), 'block'), guardDenial('main-agent-no-write', ago(0, 4))] })
  assert.deepEqual([codeOf(built, 'loops:files-only').denials7d, codeOf(built, 'rules:files-only').denials7d, codeOf(built, 'design:main-agent-no-write').denials7d], [2, 1, 1])
  assert.deepEqual(codeOf(built, 'rules:files-only').last.map(entry => entry.rule), ['rules:files-only'])
  assert.deepEqual(codeOf(built, 'loops:files-only').last.map(entry => entry.rule), ['files-only', 'files-only'])
})

test('lifting a code rule: the main agent for the guard\'s rules, nothing for the lift record\'s rule, nothing for the rules the lift does not know, and a lifted rule with its moment and the way back', () => {
  const built = view({ lifted: [{ rule: 'files-only', at: '2026-10-28T05:00:00.000Z', via: 'chat', words: '先撤下循环板文件那条' }] })
  const containment = codeOf(built, 'guard:workspace-containment')
  assert.deepEqual(containment, { ...containment, liftHow: `跟主 Agent 说「撤下${containment.title}」` })
  assert.equal('liftedAt' in containment || 'notLiftableBecause' in containment, false)
  const record = codeOf(built, 'guard:lift-files-only')
  assert.deepEqual([record.liftHow, record.notLiftableBecause], [null, LIFT_BOARD_ONLY])
  for (const id of ['rules:files-only', `design:${MAIN_AGENT_RULES[0]?.id ?? ''}`]) assert.deepEqual([codeOf(built, id).liftHow, codeOf(built, id).notLiftableBecause], [null, LIFT_NOT_OFFERED])
  const nowait = codeOf(built, 'design:main-agent-no-wait')
  assert.equal(nowait.liftHow, `跟主 Agent 说「撤下${nowait.title}」`, 'the one design rule a lift path names shows its lift (nowait design §3)')
  const liftedNowait = codeOf(view({ lifted: [{ rule: 'main-agent-no-wait', at: '2026-11-13T05:00:00.000Z', via: 'board', words: '/rules lift design:main-agent-no-wait' }] }), 'design:main-agent-no-wait')
  assert.deepEqual([liftedNowait.liftedAt, liftedNowait.restoreHow], ['2026-11-13T05:00:00.000Z', `要恢复：跟主 Agent 说「恢复${liftedNowait.title}」`])
  const loops = codeOf(built, 'loops:files-only')
  assert.deepEqual([loops.liftedAt, loops.restoreHow], ['2026-10-28T05:00:00.000Z', `要恢复：跟主 Agent 说「恢复${loops.title}」`])
  assert.equal(codeOf(built, 'rules:files-only').liftedAt, undefined, 'the lift of files-only is the loop board\'s rule, not the rules board\'s')
  assert.equal(built.code.some(entry => entry.liftHow?.includes('/rules lift') === true), false, 'the code rules are not lifted with /rules lift')
})

test('the items and the status problems are what the row passes, as they are; the notices, the recovery and the repository check are listed', () => {
  const items: StatusItem[] = [
    { id: 'rules/denials', owner: 'rules', audience: 'agent', asOf: ago(0), source: 'x', text: '- 拦下 files-only × 2' },
    { id: 'rules/lifts', owner: 'rules', audience: 'agent', asOf: ago(0), source: 'y', text: '- 撤下的规则：无', detail: ['- lifts.jsonl 读不出（ENOENT），这一次没有对账'] },
  ]
  const problems = [{ row: 'guard', reason: 'boom' }]
  const state: ProjectState = {
    ...emptyState(),
    seq: 6,
    notices: { 'n-1': { kind: 'late-block', rule: 'r-1', text: 'late', at: ago(0, 5) } },
    recovered: { at: ago(0, 30), reason: 'journal-not-engine', lost: false },
    unresolved: { k1: { key: 'k1', label: '6-1', afterSeq: 5, why: 'digest-mismatch', op: 'rule-set', actor: 'llm' } },
  }
  const built = view({ items, statusProblems: problems, read: readOf(state, { repo: { kind: 'owed' } }) })
  assert.deepEqual(built.items, items)
  assert.deepEqual(built.statusProblems, problems)
  assert.deepEqual(built.notices, [{ kind: 'late-block', rule: 'r-1', text: 'late', at: ago(0, 5) }])
  assert.deepEqual(built.recovery, { notes: [], recovered: state.recovered, unresolved: [{ label: '6-1', why: 'digest-mismatch', actor: 'llm', op: 'rule-set' }], repo: 'owed' })
})

test('an empty project: no rules, signals, tickets or notices, the note that the board has no state yet, and every code rule at zero', () => {
  const state = emptyState()
  const built = view({ read: { state, load: { state, source: 'empty', reasons: [], nextSeq: 1, fresh: true }, repo: { kind: 'in-sync' } } })
  assert.deepEqual([built.rules, built.signals, built.tickets, built.notices, built.items, built.statusProblems], [[], [], [], [], [], []])
  assert.deepEqual(built.recovery, { notes: ['这个项目还没有规则板的状态'], unresolved: [], repo: 'in-sync' })
  assert.equal(built.code.every(entry => entry.denials7d === 0 && entry.last.length === 0), true)
  assert.equal(built.builtins.every(entry => entry.count7d === 0), true)
})

test('parseRulesView reads what the row writes and drops another version, a shape that is not a view, and text that is not JSON', () => {
  const built = view({ records: [guardDenial('files-only', ago(0, 1))] })
  assert.deepEqual(parseRulesView(`${JSON.stringify(built, null, 2)}\n`), built)
  assert.equal(parseRulesView(JSON.stringify({ ...built, version: 2 })), undefined)
  assert.equal(parseRulesView(JSON.stringify({ ...built, code: {} })), undefined)
  assert.equal(parseRulesView(JSON.stringify({ ...built, peak: { ...built.peak, waiting: 3 } })), undefined)
  assert.equal(parseRulesView(JSON.stringify({ ...built, recovery: { notes: [] } })), undefined)
  assert.equal(parseRulesView('[]'), undefined)
  assert.equal(parseRulesView('{not json'), undefined)
})
