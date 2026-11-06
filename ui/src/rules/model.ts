/**
 * The view model of the rules board's page (rules design 0.10 §9.1, plain-ui
 * 1.3 §4.7, docs/ORCHESTRATION.md §16.14): what the project's view.json
 * (src/rules/view.ts) and the two checklist nodes of the panel's graph become
 * as the page's head, its status entries and its seven groups, and the two
 * lines the board hands the home page and the onboarding page. Every line is
 * in the page's words; ids, signal names and rule ids are small print after
 * them. Pure functions, no React, no DOM, no Node built-ins, so the spec runs
 * them directly. The page carries no write path: what the person can change
 * is said as what to tell the main agent or which /rules command to type,
 * and the entries the plugins bring say nothing about changing them.
 *
 * Two groups are written as the orchestrator settled them (plan Q1 B, plain-ui
 * 1.3 §4.7): the gates group lists both checklists of the graph verbatim with
 * the sentence that the part that enforces them is not installed, and the
 * code rules group enforces on enablement, lists no credential-read rule and
 * says how each rule is lifted as the view gives it.
 */
import { momentText } from '../../../src/loops/view.ts'
import { RULES_EVENT_TABLE } from '../../../src/rules/events.ts'
import { RECOVERED_TEXT, type Condition, type RowState, type SignalValue } from '../../../src/rules/model.ts'
import type { RulesCodeView, RulesPersonView, RulesView } from '../../../src/rules/view.ts'
import { STATUS_LABELS } from '../../../src/shared/health.ts'
import { PEAK_LEVEL_WORDS, PEAK_REDUCE_GLM_WORKERS, peakModeIntro, type PeakLevel } from '../../../src/shared/peak-mode.ts'
import { pluginLabel } from '../../../src/shared/plugin-labels.ts'

/** One entry of a group: its title, what it is like now, where it comes from and how to change it, and 讲细点. */
interface RulesEntry {
  readonly key: string
  readonly title: string
  /** The id in small print after the title; null when there is none to show. */
  readonly small: string | null
  readonly lines: readonly string[]
  /** Grey lines: where it comes from, how to change or lift it. */
  readonly grey: readonly string[]
  /** 讲细点; empty: nothing to open. */
  readonly details: readonly string[]
  /** It does not act now (lifted, ended): shown greyed. */
  readonly greyed: boolean
  /** A line that leads to the group of the waiting work; null when there is none. */
  readonly jump: string | null
  /** A person's rule that runs a script: its file from the project root, read when 讲细点 opens; null for the others. */
  readonly script: string | null
}

/** One checklist node of the graph in the gates group (plan Q1 B). */
interface RulesChecklist {
  readonly id: string
  readonly title: string
  /** 项目图上的规范「…」· 你批过的; null when the node is not in the graph. */
  readonly from: string | null
  /** The node's items verbatim, or the one sentence that the project has none. */
  readonly items: readonly string[]
  /** Who enforces it; null when the node is not in the graph. */
  readonly tail: string | null
}

interface RulesGroup {
  readonly key: string
  readonly title: string
  /** Grey lines under the name: where the group's entries come from. */
  readonly grey: readonly string[]
  /** Lines before the entries. */
  readonly lines: readonly string[]
  readonly lists: readonly RulesChecklist[]
  readonly entries: readonly RulesEntry[]
  /** Lines after the entries: how to add or change. */
  readonly tail: readonly string[]
}

interface RulesPageModel {
  readonly head: string
  /** The one sentence in place of the groups that need view.json: no project, or no view.json yet; null when there is a view. */
  readonly notice: string | null
  /** The board's status entries (status hub 0.3 §3.4): the text line, the detail under 讲细点. */
  readonly items: ReadonlyArray<{ readonly id: string, readonly text: string, readonly detail: readonly string[] }>
  /** The status rows whose entries could not be read, in the page's words. */
  readonly problems: readonly string[]
  readonly groups: readonly RulesGroup[]
}

/** A node of the panel's graph as the gates group reads it. */
interface ChecklistNode {
  readonly title: string
  readonly acceptance?: readonly string[] | undefined
}

interface RulesPageOptions {
  /** The session's projection names no project: no working directory, or one outside a git project. */
  readonly noProject?: 'no-cwd' | 'not-git' | undefined
}

const HEAD = '规则板 · 一件事要发生时，让不让做'

/** The cap the home and guide lines share (plain-ui 1.3 §8.2). */
const LINE_MAX = 60

/** One line of at most 60 code points; a longer one is cut to 59 and an ellipsis. */
function cutLine(text: string): string {
  const points = [...text]
  return points.length <= LINE_MAX ? text : `${points.slice(0, LINE_MAX - 1).join('')}…`
}

const levelName = (level: PeakLevel): string => PEAK_LEVEL_WORDS[level]?.name ?? level
const stateWords = (state: RowState): string => STATUS_LABELS[state] ?? state

/** Who chose the level and when: 出厂默认, 你在 <时刻> 选的, or 你在对话里说的，<时刻>. */
function chosenWords(peak: RulesView['peak']): string {
  if (peak.origin === 'default') return '出厂默认'
  if (peak.setAt === undefined) return '你选的'
  return peak.via === 'agent' ? `你在对话里说的，${momentText(peak.setAt)}` : `你在 ${momentText(peak.setAt)} 选的`
}

const waitingCount = (view: RulesView): number => view.tickets.filter(ticket => ticket.state === 'deferred').length

/**
 * The home page's 现在 line (rules design 0.10 §9.1, plan Q2 A): in a GLM peak
 * the peak's end and the level; otherwise the calls a rule holds back;
 * otherwise none. The board's own words, not an entry's text.
 */
export function rulesHomeLine(view: RulesView | null): string | null {
  if (view === null) return null
  if (view.peak.now === true) {
    const until = view.peak.until === undefined ? '' : `，到 ${momentText(view.peak.until)}`
    return cutLine(`GLM 高峰中${until} · 高峰模式：${levelName(view.peak.level)}`)
  }
  const waiting = waitingCount(view)
  return waiting > 0 ? cutLine(`${waiting} 件事在等规则放行`) : null
}

/**
 * The onboarding page's line (rules design 0.10 §9.1): the level and who
 * chose it; the reason when the peak cannot be read; none without a pricing
 * service, where the peak mode does not act.
 */
export function rulesGuideLine(view: RulesView | null): string | null {
  if (view === null || !view.peak.applies) return null
  const name = levelName(view.peak.level)
  if (view.peak.now === undefined) return cutLine(`现在读不到是不是高峰（${view.peak.problem ?? '原因不明'}），档位是${name}`)
  return cutLine(`现在是：${name}（${chosenWords(view.peak)}）`)
}

// ------------------------------------------------------------- the gates

/** The two checklist nodes and the group name each has when the graph does not hold it (rules design 0.10 §9.1). */
const CHECKLISTS: ReadonlyArray<readonly [string, string]> = [['norm-merge-gate', '合入前的检查'], ['norm-review-floor', '必须全审的改动']]

function gatesGroup(nodes: ReadonlyMap<string, ChecklistNode> | string): RulesGroup {
  const lists = typeof nodes === 'string'
    ? []
    : CHECKLISTS.map(([id, name]): RulesChecklist => {
        const node = nodes.get(id)
        return node === undefined
          ? { id, title: name, from: null, items: [`这个项目还没有${name}`], tail: null }
          : { id, title: node.title, from: `项目图上的规范「${node.title}」· 你批过的`, items: node.acceptance ?? [], tail: '由派活与合入那一块执行，它还没装上' }
      })
  return {
    key: 'gates',
    title: '会挡住动作的门',
    grey: [],
    lines: typeof nodes === 'string' ? [nodes] : [],
    lists,
    entries: [],
    tail: ['要改：跟主 Agent 说「合入前的检查加一条……」；清单在项目图上由你批，改松要你同意'],
  }
}

// ---------------------------------------------------- the default rule

const entry = (key: string, title: string, parts: Partial<Omit<RulesEntry, 'key' | 'title'>>): RulesEntry => ({
  key,
  title,
  small: parts.small ?? null,
  lines: parts.lines ?? [],
  grey: parts.grey ?? [],
  details: parts.details ?? [],
  greyed: parts.greyed ?? false,
  jump: parts.jump ?? null,
  script: parts.script ?? null,
})

/** 此刻是不是高峰, and when that turns. */
function clockWords(peak: RulesView['peak']): string {
  if (peak.now === undefined) return `读不到是不是高峰（${peak.problem ?? '原因不明'}）`
  if (peak.now) return `此刻是高峰${peak.until === undefined ? '' : `，到 ${momentText(peak.until)} 结束`}`
  return `此刻不是高峰${peak.until === undefined ? '' : `，下一个高峰 ${momentText(peak.until)}`}`
}

/** The lines of 高峰时 GLM 的活怎么办 (rules design 0.10 §9.1): the levels are text, the current one marked, never a choice. */
function peakModeEntry(view: RulesView): RulesEntry {
  const { peak } = view
  const intro = peakModeIntro(peak.hoursZh).split('\n')
  const levels = (Object.keys(PEAK_LEVEL_WORDS) as PeakLevel[]).map(level => `${PEAK_LEVEL_WORDS[level].name}：${PEAK_LEVEL_WORDS[level].half}${level === peak.level ? ' ← 现在' : ''}`)
  const now = `现在是：${levelName(peak.level)}（${chosenWords(peak)}）`
  const change = intro[intro.length - 1] ?? ''
  if (!peak.applies) return entry('peak-mode', '高峰时 GLM 的活怎么办', { lines: [now, ...levels], grey: [change] })
  const loops = view.rows.loops === 'active' || view.rows.loops === 'degraded'
  const holds = peak.level === 'reduce' || peak.level === 'stop'
  const until = peak.now === true && peak.until !== undefined ? `，${momentText(peak.until)}后接着做` : ''
  return entry('peak-mode', '高峰时 GLM 的活怎么办', {
    lines: [
      intro[0] ?? '',
      now,
      ...levels,
      ...(peak.level === 'reduce' ? [`派活那一块还没装上，同时至多 ${PEAK_REDUCE_GLM_WORKERS} 个这一条现在只在提醒主 Agent`] : []),
      ...(holds ? [loops ? '高峰结束时叫醒主 Agent、接上挪开的活，由循环板做' : '循环板没装上：高峰结束后主 Agent 要等下一次有人或有事叫它'] : []),
      '主 Agent 不受高峰模式影响，任何时候都照常回你的话；高峰模式只管它派出去的子 agent 与重活',
      ...(peak.now === undefined ? [`读不到是不是高峰（${peak.problem ?? '原因不明'}），这一档现在不生效`] : []),
    ],
    grey: [change],
    jump: peak.level === 'stop' && peak.waiting.tickets > 0 ? `高峰不做：${peak.waiting.tickets} 件事在排队、${peak.waiting.pausedGoals} 个子 agent 停着${until}` : null,
  })
}

function defaultsGroup(view: RulesView): RulesGroup {
  const { peak } = view
  const [pricing, ...parts] = view.builtins
  const pricingEntry = pricing === undefined || !peak.applies
    ? []
    : [entry(pricing.id, `${pricing.title}${peak.hoursZh === undefined ? '' : `（${peak.hoursZh}）`}`, {
        small: pricing.id,
        lines: [
          clockWords(peak),
          `只告知 · 告诉模型的是 ${pricing.toldBy ?? 'glm-prompt'} 行的高峰提醒，此刻${stateWords(pricing.toldState ?? 'absent')}`,
          `判定它的是 rules 行，此刻${stateWords(view.rows.rules ?? 'absent')}`,
        ],
      })]
  const partEntries = peak.applies
    ? parts.map(part => entry(part.id, part.title, {
        small: part.id,
        lines: [
          `${(part.enabledBy ?? []).map(levelName).join('、')}档启用 · ${part.enabled ? '此刻启用' : '此刻没启用'}`,
          `最近 7 天排队 ${part.count7d} 次`,
        ],
      }))
    : []
  return {
    key: 'defaults',
    title: '默认规则与高峰模式',
    grey: ['项目编排带来的 · 只能看；高峰时段来自 GLM 通道'],
    lines: peak.applies ? [] : ['装了 GLM 通道包才有高峰时段，高峰模式现在不起作用'],
    lists: [],
    entries: [...pricingEntry, peakModeEntry(view), ...partEntries],
    tail: [],
  }
}

// ----------------------------------------------------- the person's rules

const DAYS = ['一', '二', '三', '四', '五', '六', '日']

function valueWords(value: SignalValue): string {
  return typeof value === 'boolean' ? (value ? '开' : '关') : String(value)
}

/** A condition in words: `code-freeze 开着`, `周一、周五 09:00–21:00 之外`. */
function conditionWords(condition: Condition): string {
  if ('signal' in condition) {
    const name = condition.signal
    if ('known' in condition) return `${name} 有值`
    if ('is' in condition) return typeof condition.is === 'boolean' ? `${name} ${condition.is ? '开着' : '关着'}` : `${name} 是 ${condition.is}`
    if ('in' in condition) return `${name} 是 ${condition.in.map(valueWords).join('、')} 之一`
    if ('above' in condition) return `${name} 大于 ${condition.above}`
    return `${name} 小于 ${condition.below}`
  }
  if ('clock' in condition) return windowWords(condition.clock, false)
  if ('stage' in condition) return `目标在${condition.stage.join('或')}阶段`
  if ('not' in condition) return 'clock' in condition.not ? windowWords(condition.not.clock, true) : `不是「${conditionWords(condition.not)}」`
  const [parts, joiner] = 'all' in condition ? [condition.all, '，并且'] : [condition.any, '，或者']
  return parts.map(conditionWords).join(joiner)
}

function windowWords(clock: Extract<Condition, { readonly clock: unknown }>['clock'], outside: boolean): string {
  const days = clock.days === undefined ? '' : `${clock.days.map(day => `周${DAYS[day - 1] ?? String(day)}`).join('、')} `
  return `${days}${clock.from}–${clock.to}${clock.tz === undefined ? '' : `（${clock.tz}）`}${outside ? '之外' : '之间'}`
}

/** The fields a rule can filter on, as the page names them. */
const FIELD_WORDS: Readonly<Record<string, string>> = {
  tool: '工具',
  command: '命令',
  writes: '要写的文件',
  role: '谁在做',
  model: '模型',
  session: '会话',
  nested: 'run_code 里的子调用',
  glmSpend: '脚本自报的 GLM 积分花法',
  targetModel: '被派的子 agent 的模型',
  task: '任务',
  branch: '主干',
}

const ROLE_WORDS: Readonly<Record<string, string>> = { 'main-agent': '主 Agent', root: '根 agent', subagent: '子 agent' }

function filterWords(filter: NonNullable<RulesPersonView['filter']>): string {
  return Object.entries(filter).map(([field, value]) => {
    const name = FIELD_WORDS[field] ?? field
    if ('in' in value) return `${name}是 ${value.in.map(item => field === 'role' ? ROLE_WORDS[item] ?? item : item).join(' 或 ')}`
    if ('is' in value) return `${value.is ? '是' : '不是'}${name}`
    if ('atLeast' in value) return `${name}至少 ${value.atLeast}`
    if ('paths' in value) return `${name}在 ${value.paths.join('、')} 下`
    return `${name}符合「${value.matches}」`
  }).join('、')
}

function actionWords(action: RulesPersonView['action']): string {
  switch (action.kind) {
    case 'block': return '拦下'
    case 'queue': return '排队，等条件不成立再做'
    case 'record': return '只记下，不挡'
    case 'inform': return '只告知，harness 不检查'
    case 'script': return `跑脚本 ${action.script.file}`
  }
}

function lifetimeWords(lifetime: RulesPersonView['lifetime']): string {
  switch (lifetime.kind) {
    case 'until-lifted': return '直到解除'
    case 'ttl': return `到 ${momentText(lifetime.expiresAt)} 为止`
    case 'until': return `直到${conditionWords(lifetime.condition)}`
    case 'session': return '只在这个会话里'
  }
}

/** Who set a rule: the person, their words through the main agent, or a decision on the graph. */
function setByWords(origin: RulesPersonView['origin']): string {
  if (origin.question !== undefined) return `照图上 ${origin.question} 补写`
  if (origin.actor === 'human') return '你定的'
  return origin.relay === undefined ? '主 Agent 照你的话写的' : `你在对话里说的：「${origin.relay}」`
}

const TRUTH_WORDS: Readonly<Record<string, string>> = { true: '此刻成立', false: '此刻不成立', unknown: '此刻读不出' }

/** The script's lines (plain-ui 1.3 §4.7): its file, whether it is the version the person agreed to, the timeout and its source, what a failure does. */
function scriptLines(script: NonNullable<RulesPersonView['script']>): string[] {
  const standing = script.missing
    ? '脚本文件不见了'
    : script.standing === 'approved'
      ? '和你同意的那一版一样'
      : script.standing === 'changed'
        ? `脚本 ${script.file} 和你同意的那一版不一样，没在跑；要用改过的这一版，跟主 Agent 说，它会把新的原文给你看`
        : '这台电脑上没有你看过原文的记录，先不跑'
  const timeout = `超时 ${script.timeoutSeconds} 秒（${script.timeoutFrom === 'design' ? '设计里定的固定值' : '规则里写明的'}）`
  const onError = `超时或出错时${script.onError === 'block' ? '拦下' : '放行'}（${script.onErrorIsDefault ? '默认' : '写明的'}）`
  return [`脚本：${script.file}`, standing, `${timeout} · ${onError}`]
}

function personEntry(rule: RulesPersonView): RulesEntry {
  const record = rule.action.kind === 'record'
  const what = [
    (rule.when.events as readonly string[]).map(id => RULES_EVENT_TABLE.get(id)?.title ?? id).join('或'),
    ...(rule.filter === undefined ? [] : [filterWords(rule.filter)]),
    actionWords(rule.action),
  ].join(' · ')
  const counts = record
    ? `最近 7 天只记下 ${rule.record7d} 次 · 这是你选的做法，不是试运行阶段`
    : `最近 7 天挡下 ${rule.enforce7d} 次${rule.record7d > 0 ? `，只记下 ${rule.record7d} 次` : ''}`
  const notNow = rule.inForce ? [] : [rule.status === 'lifted' ? '已解除' : rule.status === 'expired' ? '已到期' : '时间到了，不再生效']
  return entry(rule.id, rule.title, {
    small: rule.id,
    lines: [
      what,
      ...(rule.condition === undefined ? [] : [`条件：${conditionWords(rule.condition)} · ${TRUTH_WORDS[rule.conditionNow ?? 'unknown'] ?? ''}`]),
      `${rule.scope === 'session' ? `会话 ${rule.sessionId ?? ''}` : '这个项目'} · ${momentText(rule.origin.at)} 起 · ${lifetimeWords(rule.lifetime)} · ${setByWords(rule.origin)}`,
      counts,
      ...notNow,
      ...(rule.script === undefined ? [] : scriptLines(rule.script)),
    ],
    grey: [rule.status === 'active'
      ? `要改：跟主 Agent 说「把这条改成……」；要解除：打 /rules lift ${rule.id}；要删掉：打 /rules delete ${rule.id}`
      : `要删掉：打 /rules delete ${rule.id}`],
    details: [
      `为什么有它：${rule.reason}`,
      ...(rule.condition !== undefined && rule.onUnknown === 'apply' ? ['条件读不出时照样按成立处理'] : []),
    ],
    greyed: !rule.inForce,
    script: rule.script?.file ?? null,
  })
}

function personGroup(view: RulesView): RulesGroup {
  return {
    key: 'mine',
    title: '你定的规则',
    grey: [],
    lines: view.rules.length === 0 ? ['还没有你定的规则'] : [],
    lists: [],
    entries: view.rules.map(personEntry),
    tail: ['要加一条：跟主 Agent 说你要的规矩，例如「今晚 21 点以后别推送」，它会把要写的规则作为一个方案给你看'],
  }
}

// --------------------------------------------------------- the code rules

const CODE_FROM = `${pluginLabel('dsh-hourness')}带来的 · 只能看`

/** The lift line (plain-ui 1.3 §4.7): what the view gives, never a command the page makes up. */
function liftLine(code: RulesCodeView): string {
  return typeof code.liftHow === 'string'
    ? `撤下：${code.liftHow}`
    : `这一条现在还不能一句话撤下（${code.notLiftableBecause ?? '规则板还没有给出撤下的办法'}）`
}

function codeEntry(code: RulesCodeView): RulesEntry {
  const lifted = code.liftedAt !== undefined
  return entry(code.id, code.title, {
    small: code.id,
    lines: [
      `在 ${code.row} 行，此刻${stateWords(code.rowState)}`,
      `最近 7 天拦下 ${code.denials7d} 次`,
      ...(code.liftedAt === undefined ? [] : [`已撤下 · ${momentText(code.liftedAt)}`]),
    ],
    grey: [CODE_FROM, ...(lifted ? (code.restoreHow === undefined ? [] : [code.restoreHow]) : [liftLine(code)])],
    details: code.last.length === 0
      ? ['最近没有拦下的记录']
      : code.last.map(denial => `${momentText(denial.at)} · ${denial.what} · ${denial.outcome === 'late' ? '晚到的拦下' : '拦下'} · ${denial.rule}`),
    greyed: lifted,
  })
}

function codeGroup(view: RulesView): RulesGroup {
  return { key: 'code', title: '写在代码里的规则（启用即拦）', grey: [], lines: [], lists: [], entries: view.code.map(codeEntry), tail: [] }
}

// ------------------------------------------------------------- the signals

function glmPeakWords(view: RulesView): string {
  const { peak } = view
  if (!peak.applies) return '读不出：没有计价服务，装了 GLM 通道包才有'
  if (peak.now === undefined) return `读不出：${peak.problem ?? '原因不明'}`
  if (peak.now) return `是${peak.until === undefined ? '' : `，到 ${momentText(peak.until)}`}（${peak.hoursZh === undefined ? '' : `${peak.hoursZh}，`}计价服务现算）`
  return `否${peak.until === undefined ? '' : `，下一次 ${momentText(peak.until)}`}`
}

const SOURCE_WORDS: Readonly<Record<string, string>> = { manual: '你设的', detector: '检测器测的', clock: '宿主算的', heartbeat: '宿主算的', caller: '调用方给的', none: '没有来源' }

function signalEntry(signal: RulesView['signals'][number]): RulesEntry {
  const value = signal.value === undefined ? '读不出' : `${valueWords(signal.value)}${signal.type.kind === 'number' && signal.type.unit !== undefined ? ` ${signal.type.unit}` : ''}`
  const when = [
    ...(signal.setAt === undefined ? [] : [`${momentText(signal.setAt)} 起`]),
    ...(signal.expiresAt === undefined ? [] : [`${momentText(signal.expiresAt)} 到期`]),
  ]
  return entry(signal.name, signal.description ?? signal.name, {
    small: signal.name,
    lines: [[value, SOURCE_WORDS[signal.source] ?? signal.source, ...when].join(' · ')],
    grey: [signal.type.kind === 'boolean'
      ? `要改：打 /rules on ${signal.name} [时长] 或 /rules off ${signal.name}；不要了：/rules delete ${signal.name}`
      : `要改：打 /rules set ${signal.name} <值> [时长]；不要了：/rules delete ${signal.name}`],
    details: signal.unknown === undefined ? [] : [`读不出的原因：${signal.unknown}`],
  })
}

function signalsGroup(view: RulesView): RulesGroup {
  return {
    key: 'signals',
    title: '信号与检测器',
    grey: [],
    lines: [],
    lists: [],
    entries: [entry('glm-peak', 'GLM 是不是高峰', { small: 'glm-peak', lines: [`${glmPeakWords(view)}（宿主 ${view.host.pid}）`] }), ...view.signals.map(signalEntry)],
    tail: ['要定义一个开关或加一个检测器：跟主 Agent 说你要测什么'],
  }
}

// --------------------------------------------------------- the waiting work

function ticketEntry(ticket: RulesView['tickets'][number], peak: RulesView['peak']): RulesEntry {
  const ends = peak.now === true && peak.until !== undefined ? `，${momentText(peak.until)}接着做` : ''
  return entry(ticket.id, ticket.summary, {
    small: ticket.id,
    lines: [
      `${ticket.agentLabel} · 会话 ${ticket.sessionId}`,
      `因为 ${ticket.rules.join('、')} · ${momentText(ticket.since)} 起 · ${ticket.state === 'deferred' ? '在等' : '规则已放行，等它再调一次'}`,
      ...(ticket.letOnceUntil === undefined ? [] : [`放行了这一次，${momentText(ticket.letOnceUntil)} 前再调就过`]),
      ...(ticket.stop ? [`高峰不做${ends}${ticket.goalPaused ? '；这个子 agent 的 goal 已暂停' : ''}`] : []),
      ...(ticket.hostAlive ? [] : ['宿主不在，下一次写入时过期']),
    ],
    grey: [ticket.stop
      ? `这个会话本次高峰照常做：打 /rules let ${ticket.id}；取消：/rules cancel ${ticket.id}`
      : `放行这一次：打 /rules let ${ticket.id}；取消：/rules cancel ${ticket.id}`],
    details: [`工具：${ticket.tool}`, `宿主 ${ticket.hostPid}`],
  })
}

function waitingGroup(view: RulesView): RulesGroup {
  const notices = view.notices.map((notice, index) => entry(`notice-${index}`, notice.text, {
    small: notice.rule,
    lines: ['主 Agent 下次走步时会收到'],
    details: [`${momentText(notice.at)} · ${notice.kind}`],
  }))
  return {
    key: 'waiting',
    title: '在等的工作',
    grey: [],
    lines: view.tickets.length === 0 && notices.length === 0 ? ['没有在等的工作'] : [],
    lists: [],
    entries: [...view.tickets.map(ticket => ticketEntry(ticket, view.peak)), ...notices],
    tail: [],
  }
}

// -------------------------------------------------------------- the recovery

const SKIP_WORDS: Readonly<Record<string, string>> = {
  'digest-mismatch': '不是规则板自己写的记录',
  'after-unreadable': '排在一条读不出的记录之后',
  unreadable: '这一行读不出',
  'covered-by-anchor': '后面的存档已经盖过它',
}

function recoveryGroup(view: RulesView): RulesGroup | undefined {
  const { recovery } = view
  const recovered = recovery.recovered
  const lines = [
    ...recovery.notes,
    ...(recovered === undefined ? [] : [`${momentText(recovered.at)} ${RECOVERED_TEXT[recovered.reason] ?? recovered.reason}${recovered.replaced === undefined ? '' : `，原存档另存在 ${recovered.replaced}`}${recovered.lost ? '，有改动没能留下' : ''}`]),
    ...(recovery.repo === 'owed' ? ['规则文件待写回'] : []),
    ...(recovery.repo === 'outside' ? ['照文件里的生效：打 /rules recovery 文件 照改；改回规则板的那一份：/rules recovery 文件 忽略'] : []),
  ]
  const entries = recovery.unresolved.map(skipped => entry(skipped.label, `编号 ${skipped.label}`, {
    lines: [[SKIP_WORDS[skipped.why] ?? skipped.why, ...(skipped.actor === undefined ? [] : [`身份 ${skipped.actor}`]), ...(skipped.op === undefined ? [] : [`操作 ${skipped.op}`]), ...(skipped.target === undefined ? [] : [`目标 ${skipped.target}`])].join(' · ')],
    grey: [skipped.why === 'unreadable' || skipped.why === 'covered-by-anchor'
      ? `忽略：打 /rules recovery ${skipped.label} 忽略`
      : `照改：打 /rules recovery ${skipped.label} 照改；忽略：/rules recovery ${skipped.label} 忽略`],
    details: skipped.seq === undefined ? [] : [`第 ${skipped.seq} 条记录`],
  }))
  if (lines.length === 0 && entries.length === 0) return undefined
  return { key: 'recovery', title: '提议与恢复', grey: [], lines, lists: [], entries, tail: [] }
}

// ------------------------------------------------------------------ the page

const NO_PROJECT: Readonly<Record<'no-cwd' | 'not-git', string>> = {
  'no-cwd': '这个会话没有工作目录，只有代码里的规则对它生效',
  'not-git': '这个会话不在 git 项目里，只有代码里的规则对它生效',
}

/** Said while the project has no view.json: the rules row writes it every 15 seconds and after every /rules. */
const NO_VIEW = '规则板还没写出这个项目的这一页：规则行每 15 秒写一次，在这个项目的会话里打 /rules show 也会写出来'

const PROBLEM_WORDS: Readonly<Record<string, string>> = { guard: '拦下与撤下的汇总暂时读不到', rules: '高峰时段这一行暂时读不到' }

/**
 * The page model. `view` is null while the project has no view.json yet;
 * `nodes` are the panel's graph nodes, or why the graph cannot be read now.
 */
export function buildRulesPage(view: RulesView | null, nodes: ReadonlyMap<string, ChecklistNode> | string, options: RulesPageOptions = {}): RulesPageModel {
  if (options.noProject !== undefined) return { head: HEAD, notice: NO_PROJECT[options.noProject], items: [], problems: [], groups: [] }
  if (view === null) return { head: HEAD, notice: NO_VIEW, items: [], problems: [], groups: [gatesGroup(nodes)] }
  const recovery = recoveryGroup(view)
  return {
    head: HEAD,
    notice: null,
    items: view.items.map(item => ({ id: item.id, text: item.text, detail: item.detail ?? [] })),
    problems: view.statusProblems.map(problem => `${PROBLEM_WORDS[problem.row] ?? `${problem.row} 行的汇总暂时读不到`}：${problem.reason}`),
    groups: [gatesGroup(nodes), defaultsGroup(view), personGroup(view), codeGroup(view), signalsGroup(view), waitingGroup(view), ...(recovery === undefined ? [] : [recovery])],
  }
}
