/**
 * The plan of a write (docs/ORCHESTRATION.md §16.9; design §7.4 steps 4 and
 * 5): for each operation, every change it makes to the state, as values, and
 * the digest of the state after. The plan is where the clock, the heartbeat
 * directory and the journal are read: whatever they say is written into the
 * `changes` of the record, so a replay (`applyRecord`) needs none of them.
 *
 * A plan has two parts. The operation's own changes come from the one function
 * of the operation, which also decides whether it can be done at all and says
 * so in a sentence the person can use. Then the plan adds what the clock calls
 * for whatever the operation was (clean-up and expiry, step 5) and, when the
 * part a person decided changed, the new digest of the rules file. The entries
 * the operation itself changes are left alone by the clean-up: a person's
 * cancel is not rewritten as an expiry because the ticket's host is also gone.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PEAK_LEVEL_WORDS } from '../shared/peak-mode.ts'
import { PEAK_STOP_SIGNATURE } from './builtin.ts'
import { matchesType, ticketProblem } from './entries.ts'
import { HEARTBEAT_FRESH_MS } from './heartbeat.ts'
import { evaluateCondition, judgeInput } from './judge.ts'
import { canonicalJson, effectivePeakMode, repoJson, repoPart, stateProblem, type Change, type Condition, type PeakModeSetting, type ProjectState, type RepoRules, type Rule, type SignalState, type SignalType, type Ticket } from './model.ts'
import type { HostRef, Request } from './request.ts'
import { GLM_PEAK, effectiveSignal } from './signals.ts'
import { applyRecord, skippedLines, stateDigest, textDigest, type RulesPaths } from './store.ts'

export interface PlanContext {
  /** The moment of the write: every time in the record is this one. */
  readonly now: Date
  /** The sequence number the record will carry. */
  readonly seq: number
  readonly paths: RulesPaths
}

/** What the engine writes: the request is not one of the two that settle a rules file with their own record (engine.ts). */
export type PlannedRequest = Exclude<Request, { readonly op: 'repo-adopt' | 'repo-restore' }>

interface Refused {
  readonly ok: false
  readonly code: 'conflict' | 'invalid'
  readonly message: string
}

export type Plan =
  | Refused
  /** The request asks for what is so already: nothing is written. */
  | { readonly ok: true, readonly changed: false }
  | {
    readonly ok: true
    readonly changed: true
    readonly target?: string
    readonly from?: unknown
    readonly to?: unknown
    readonly reason: string
    readonly evidence?: string
    readonly changes: readonly Change[]
    readonly next: ProjectState
    /** `stateDigest(next)`: the record carries it and a replay checks it. */
    readonly snapshot: string
    /** The part a person decided changed: the rules file is to be written from `part`, or removed when nothing is decided any more. */
    readonly rewrite?: { readonly part: RepoRules | undefined }
  }

const refuse = (code: Refused['code'], message: string): Refused => ({ ok: false, code, message })

interface Own {
  readonly target?: string
  readonly from?: unknown
  readonly to?: unknown
  readonly reason: string
  readonly evidence?: string
  readonly changes: readonly Change[]
  /** The rules file is written even though the decided part reads the same (the person chose the same level again, and the file was changed from outside). */
  readonly forceFile?: true
}

type Step = Own | Refused | 'unchanged'

const MINUTE_MS = 60_000
const DAY_MS = 24 * 3_600_000
const NOT_RETRIED_MS = 30 * MINUTE_MS
const LET_ONCE_MS = 10 * MINUTE_MS
const SUMMARY_CHARS = 160

/** The entry of a collection by its name, and not what every object has under that name (`constructor`, `__proto__`). */
function own<T>(collection: Readonly<Record<string, T>> | undefined, key: string): T | undefined {
  return collection !== undefined && Object.hasOwn(collection, key) ? collection[key] : undefined
}

function without<T extends object>(value: T, ...keys: readonly string[]): T {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key))) as T
}

const isOpen = (ticket: Ticket): boolean => ticket.state === 'deferred' || ticket.state === 'cleared'

/** Where a ticket may go from where it is. */
const TICKET_MOVES: Readonly<Record<Ticket['state'], readonly Ticket['state'][]>> = {
  deferred: ['cleared', 'done', 'cancelled', 'expired'],
  cleared: ['done', 'cancelled', 'expired'],
  done: [],
  cancelled: [],
  expired: [],
}

// ------------------------------------------------------------------ rules

/**
 * Whether a condition can be read from the state alone: a clock, and a switch (a signal no detector measures). A signal
 * the host computes (`glm-peak`), one a detector measures and the focus of a session are the host's to read, so a rule
 * that ends on one of them is not ended by the board on its own word.
 */
function readable(condition: Condition, state: ProjectState): boolean {
  if ('clock' in condition) return true
  if ('stage' in condition) return false
  if ('signal' in condition) {
    const signal = own(state.signals, condition.signal)
    return signal !== undefined && signal.detector === undefined
  }
  if ('not' in condition) return readable(condition.not, state)
  return ('all' in condition ? condition.all : condition.any).every(item => readable(item, state))
}

type Ended = { readonly ended: true, readonly evidence: string } | { readonly ended: false, readonly why: string }

/** Whether the time of a rule is up, by the clock and the state; the evidence goes into the record. A session rule ends when the host says its session is gone, which the state cannot show. */
function lifetimeEnded(rule: Rule, state: ProjectState, now: Date): Ended {
  const { lifetime } = rule
  if (lifetime.kind === 'until-lifted') return { ended: false, why: `${rule.id} 没有期限，要停它只能解除或删除` }
  if (lifetime.kind === 'session') return { ended: false, why: `会话 ${rule.sessionId ?? ''} 还没有释放` }
  if (lifetime.kind === 'ttl') {
    return now.getTime() >= Date.parse(lifetime.expiresAt)
      ? { ended: true, evidence: `到期时刻 ${lifetime.expiresAt} 已过` }
      : { ended: false, why: `${rule.id} 的期限还没到（到期时刻 ${lifetime.expiresAt}）` }
  }
  if (!readable(lifetime.condition, state)) return { ended: false, why: `${rule.id} 的结束条件里有规则板读不到的信号（宿主算的、检测器量的或阶段），要由宿主来判断` }
  const readings = Object.entries(state.signals ?? {}).map(([name, signal]) => effectiveSignal(name, signal, now))
  const holds = evaluateCondition(lifetime.condition, judgeInput({ now, project: '', events: [], signals: readings })) === 'true'
  return holds ? { ended: true, evidence: '结束条件已成立' } : { ended: false, why: `${rule.id} 的结束条件还没成立` }
}

function ruleOf(state: ProjectState, id: string, what: string): Rule | Refused {
  const rule = own(state.rules, id)
  if (rule !== undefined) return rule
  return refuse('conflict', id.startsWith('builtin:') ? `${id} 是写在代码里的规则，不能${what}` : `没有 ${id} 这条规则`)
}

function planLift(request: Extract<Request, { readonly op: 'rule-lift' }>, state: ProjectState): Step {
  const rule = ruleOf(state, request.id, '解除')
  if ('ok' in rule) return rule
  if (rule.status !== 'active') return refuse('conflict', `${rule.id} 不在生效，不用解除`)
  const lifted: Rule = { ...rule, status: 'lifted' }
  return { target: rule.id, from: rule, to: lifted, reason: request.reason ?? `人解除了规则 ${rule.id}（${rule.title}）`, changes: [{ path: ['rules', rule.id], value: lifted }] }
}

function planDelete(request: Extract<Request, { readonly op: 'rule-delete' }>, state: ProjectState): Step {
  const rule = ruleOf(state, request.id, '删除')
  if ('ok' in rule) return rule
  // The pin of an entry is the entry's: it goes with it. The script file in the repository belongs to the path of agreement and stays.
  const pin: readonly Change[] = own(state.scripts, rule.id) === undefined ? [] : [{ path: ['scripts', rule.id] }]
  return { target: rule.id, from: rule, reason: request.reason ?? `人删除了规则 ${rule.id}（${rule.title}）`, changes: [{ path: ['rules', rule.id] }, ...pin] }
}

function planExpire(request: Extract<Request, { readonly op: 'rule-expire' }>, state: ProjectState, ctx: PlanContext): Step {
  const rule = ruleOf(state, request.id, '失效')
  if ('ok' in rule) return rule
  if (rule.status !== 'active') return refuse('conflict', `${rule.id} 不在生效，不用失效`)
  let evidence: string
  if (rule.lifetime.kind === 'session') {
    if (request.released !== true) return refuse('conflict', `会话 ${rule.sessionId ?? ''} 还没有释放`)
    evidence = `会话 ${rule.sessionId ?? ''} 在本宿主上已释放`
  }
  else {
    const ended = lifetimeEnded(rule, state, ctx.now)
    if (!ended.ended) return refuse('conflict', ended.why)
    evidence = ended.evidence
  }
  const expired: Rule = { ...rule, status: 'expired' }
  return { target: rule.id, from: rule, to: expired, reason: request.reason ?? `规则 ${rule.id} 按自己的期限失效`, evidence, changes: [{ path: ['rules', rule.id], value: expired, cause: 'expire' }] }
}

// ---------------------------------------------------------------- signals

const SIGNAL_TYPE_WORDS = (type: SignalType): string => type.kind === 'boolean' ? '布尔值' : type.kind === 'number' ? '数' : `取值表 ${type.values.join('、')}`

function signalOf(state: ProjectState, name: string): SignalState | Refused {
  const signal = own(state.signals, name)
  if (signal !== undefined) return signal
  return refuse('conflict', name === GLM_PEAK ? `${GLM_PEAK} 由宿主现算，不能手设，也没有存在项目里的值` : `没有 ${name} 这个信号`)
}

function planManual(request: Extract<Request, { readonly op: 'signal-manual' }>, state: ProjectState, ctx: PlanContext): Step {
  const signal = signalOf(state, request.name)
  if ('ok' in signal) return signal
  if (!matchesType(signal.type, request.value)) return refuse('invalid', `value 要合信号 ${request.name} 的类型（${SIGNAL_TYPE_WORDS(signal.type)}）`)
  const expiresAt = request.durationMs === undefined ? undefined : new Date(ctx.now.getTime() + request.durationMs).toISOString()
  const manual = { value: request.value, at: ctx.now.toISOString(), ...(expiresAt === undefined ? {} : { expiresAt }) }
  return {
    target: request.name,
    from: signal.manual?.value,
    to: request.value,
    reason: request.reason ?? `人把信号 ${request.name} 设为 ${String(request.value)}${expiresAt === undefined ? '' : `，到 ${expiresAt}`}`,
    changes: [{ path: ['signals', request.name], value: { ...signal, manual } }],
  }
}

function planClear(request: Extract<Request, { readonly op: 'signal-clear' }>, state: ProjectState): Step {
  const signal = signalOf(state, request.name)
  if ('ok' in signal) return signal
  if (signal.manual === undefined) return refuse('conflict', `信号 ${request.name} 没有手设的值，不用清`)
  return { target: request.name, from: signal.manual.value, reason: request.reason ?? `人清掉了信号 ${request.name} 的手设值`, changes: [{ path: ['signals', request.name], value: without(signal, 'manual') }] }
}

function planSignalDelete(request: Extract<Request, { readonly op: 'signal-delete' }>, state: ProjectState): Step {
  const signal = signalOf(state, request.name)
  if ('ok' in signal) return signal
  if (signal.detector !== undefined) return refuse('conflict', `「${request.name}」是检测器 ${signal.detector} 的信号，不是开关，不能这样删`)
  // A rule that names the signal stays: a stored rule is read back leniently, and judging it reads the signal as unknown.
  return { target: request.name, from: signal, reason: request.reason ?? `人删除了开关 ${request.name}`, changes: [{ path: ['signals', request.name] }] }
}

// ---------------------------------------------------------------- tickets

function ticketOf(state: ProjectState, id: string): Ticket | Refused {
  return own(state.tickets, id) ?? refuse('conflict', `没有 ${id} 这张单`)
}

function sameJson(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b)
}

/** A ticket replaced by its changed copy: refused when the copy is not a ticket, nothing when it is the same. */
function replaceTicket(ticket: Ticket, changed: Ticket, reason: string, change: { readonly from?: unknown, readonly to?: unknown } = {}): Step {
  if (sameJson(ticket, changed)) return 'unchanged'
  const problem = ticketProblem(ticket.id, changed, `tickets.${ticket.id}`)
  if (problem !== undefined) return refuse('invalid', problem)
  return { target: ticket.id, ...change, reason, changes: [{ path: ['tickets', ticket.id], value: changed }] }
}

function planOpen(request: Extract<Request, { readonly op: 'ticket-open' }>, state: ProjectState, ctx: PlanContext): Step {
  let number = state.nextTicket ?? 1
  while (own(state.tickets, `q-${number}`) !== undefined) number++
  const id = `q-${number}`
  const ticket: Ticket = {
    id,
    state: 'deferred',
    rules: [...request.rules],
    sessionId: request.sessionId,
    agentLabel: request.agentLabel,
    host: { pid: request.host.pid, startedAt: request.host.startedAt },
    signature: request.signature,
    tool: request.tool,
    summary: Array.from(request.summary).slice(0, SUMMARY_CHARS).join(''),
    since: ctx.now.toISOString(),
    ...(request.nested === undefined ? {} : { nested: true as const }),
    ...(request.scriptRules === undefined ? {} : { scriptRules: [...request.scriptRules] }),
    ...(request.pausedGoal === undefined ? {} : { pausedGoal: { ...request.pausedGoal } }),
    ...(request.pauseFailed === undefined ? {} : { pauseFailed: request.pauseFailed }),
  }
  const problem = ticketProblem(id, ticket, `tickets.${id}`)
  if (problem !== undefined) return refuse('invalid', problem)
  return {
    target: id,
    to: ticket,
    reason: request.reason ?? `${request.agentLabel} 的 ${request.tool} 调用被规则 ${request.rules.join('、')} 推迟，开了等待单 ${id}`,
    changes: [{ path: ['tickets', id], value: ticket }, { path: ['nextTicket'], value: number + 1 }],
  }
}

function planUpdate(request: Extract<Request, { readonly op: 'ticket-update' }>, state: ProjectState, ctx: PlanContext): Step {
  const ticket = ticketOf(state, request.id)
  if ('ok' in ticket) return ticket
  const now = ctx.now.toISOString()
  let changed: Record<string, unknown> = { ...ticket }
  if (request.state !== undefined && request.state !== ticket.state) {
    if (!TICKET_MOVES[ticket.state].includes(request.state)) return refuse('conflict', `${ticket.id} 是 ${ticket.state}，不能改成 ${request.state}`)
    changed = { ...changed, state: request.state }
    if (request.state === 'cleared') changed.clearedAt = now
    else changed.closedAt = now
    if (request.state === 'expired') changed.expiredWhy = request.expiredWhy
  }
  if (request.rules !== undefined) changed.rules = [...request.rules]
  if (request.scriptRules !== undefined) changed.scriptRules = [...request.scriptRules]
  if (request.pausedGoal !== undefined) changed.pausedGoal = { ...request.pausedGoal }
  if (request.pauseFailed !== undefined) changed.pauseFailed = request.pauseFailed
  if (request.resumed === true) changed.resumedAt = now
  const moved = request.state !== undefined && request.state !== ticket.state
  return replaceTicket(ticket, changed as unknown as Ticket, request.reason ?? (moved ? `等待单 ${ticket.id} 从 ${ticket.state} 变为 ${request.state ?? ''}` : `等待单 ${ticket.id} 更新`), moved ? { from: ticket.state, to: request.state } : {})
}

function planHandover(request: Extract<Request, { readonly op: 'ticket-handover' }>, state: ProjectState, ctx: PlanContext): Step {
  const ticket = ticketOf(state, request.id)
  if ('ok' in ticket) return ticket
  if (!isOpen(ticket)) return refuse('conflict', `${ticket.id} 已经关了，不用转交`)
  // The first holder stays on record: a second hand-over (a new sub-agent doing the same call) does not replace it.
  const handedFrom = ticket.handedFrom ?? { sessionId: ticket.sessionId, agentLabel: ticket.agentLabel, ...(request.focus === undefined ? {} : { focus: request.focus }), at: ctx.now.toISOString() }
  return replaceTicket(ticket, { ...ticket, sessionId: request.sessionId, agentLabel: request.agentLabel, handedFrom }, request.reason ?? `等待单 ${ticket.id} 从 ${ticket.agentLabel} 转给 ${request.agentLabel}`, { from: ticket.sessionId, to: request.sessionId })
}

function planAdopt(request: Extract<Request, { readonly op: 'ticket-adopt' }>, state: ProjectState): Step {
  const ticket = ticketOf(state, request.id)
  if ('ok' in ticket) return ticket
  if (ticket.signature !== PEAK_STOP_SIGNATURE) return refuse('conflict', `只有不做档的单能由别的宿主接手，${ticket.id} 不是`)
  const lost = ticket.state === 'expired' && ticket.expiredWhy === 'host-gone' && ticket.resumedAt === undefined
  if (!isOpen(ticket) && !lost) return refuse('conflict', `${ticket.id} 已经结束，不用接手`)
  const host = { pid: request.host.pid, startedAt: request.host.startedAt }
  const adopted: Ticket = lost ? { ...without(ticket, 'closedAt', 'expiredWhy'), state: 'deferred', host } : { ...ticket, host }
  return replaceTicket(ticket, adopted, request.reason ?? `宿主 ${host.pid} 接手了等待单 ${ticket.id}`, { from: ticket.host, to: host })
}

function planLetOnce(request: Extract<Request, { readonly op: 'ticket-let-once' }>, state: ProjectState, ctx: PlanContext): Step {
  const ticket = ticketOf(state, request.id)
  if ('ok' in ticket) return ticket
  if (ticket.state === 'cleared') return refuse('conflict', `${ticket.id} 已经解除，不用放行`)
  if (ticket.state !== 'deferred') return refuse('conflict', `${ticket.id} 已经关了，不用放行`)
  const now = ctx.now.getTime()
  const until = request.until === undefined ? now + LET_ONCE_MS : Date.parse(request.until)
  if (!(until > now && until <= now + DAY_MS)) return refuse('invalid', 'until 要晚于现在、至多 24 小时以后')
  return replaceTicket(ticket, { ...ticket, letOnceUntil: new Date(until).toISOString() }, request.reason ?? `人放行了等待单 ${ticket.id} 这一次`)
}

function planCancel(request: Extract<Request, { readonly op: 'ticket-cancel' }>, state: ProjectState, ctx: PlanContext): Step {
  const ticket = ticketOf(state, request.id)
  if ('ok' in ticket) return ticket
  if (!isOpen(ticket)) return refuse('conflict', `${ticket.id} 已经关了，不用取消`)
  return replaceTicket(ticket, { ...ticket, state: 'cancelled', closedAt: ctx.now.toISOString() }, request.reason ?? `人取消了等待单 ${ticket.id}`, { from: ticket.state, to: 'cancelled' })
}

// --------------------------------------------------------------- recovery

function planRecovery(request: Extract<Request, { readonly op: 'recovery-accept' | 'recovery-dismiss' }>, state: ProjectState, ctx: PlanContext): Step {
  const listed = Object.values(state.unresolved ?? {})
  const entries = []
  for (const label of request.labels) {
    const entry = listed.find(item => item.label === label)
    if (entry === undefined) return refuse('conflict', `没有编号 ${label} 的记录（可能已经处理过了）`)
    entries.push(entry)
  }
  const forgotten: readonly Change[] = [...new Set(entries.map(entry => entry.key))].map(key => ({ path: ['unresolved', key] }))
  const target = request.labels.join(',')
  if (request.op === 'recovery-dismiss') return { target, reason: request.reason ?? `人忽略了编号 ${target} 的记录`, changes: forgotten }
  for (const entry of entries) {
    if (entry.why === 'unreadable' || entry.why === 'covered-by-anchor') return refuse('conflict', `编号 ${entry.label} 这一条只能忽略：${entry.why === 'unreadable' ? '它读不出来，没有可照改的内容' : '它的结果已经在状态里'}`)
  }
  // The person vouches for what the lines say: their own changes, in the order the journal has them.
  const lines = skippedLines(ctx.paths, new Set(entries.map(entry => entry.key)))
  const changes: Change[] = []
  for (const entry of entries) {
    const line = lines.find(item => item.key === entry.key)
    if (line === undefined) return refuse('conflict', `找不到编号 ${entry.label} 那一行（变更记录已经变了），只能忽略`)
    if (!Array.isArray(line.changes)) return refuse('conflict', `编号 ${entry.label} 那一行没有可照改的内容，这一条只能忽略`)
  }
  for (const line of lines) changes.push(...(line.changes as Change[]))
  return { target, reason: request.reason ?? `人照编号 ${target} 的记录改了`, changes: [...changes, ...forgotten] }
}

// --------------------------------------------------------------- notices

function planNoticeAdd(request: Extract<Request, { readonly op: 'notice-add' }>, ctx: PlanContext): Step {
  const id = `n-${ctx.seq}`
  return {
    target: id,
    reason: request.reason ?? `记下要告诉主 Agent 的话（${request.kind}，规则 ${request.rule}）`,
    changes: [{ path: ['notices', id], value: { kind: request.kind, rule: request.rule, text: request.text, at: ctx.now.toISOString() } }],
  }
}

function planNoticeDelivered(request: Extract<Request, { readonly op: 'notice-delivered' }>, state: ProjectState): Step {
  const notice = own(state.notices, request.id)
  if (notice === undefined) return refuse('conflict', `没有 ${request.id} 这条提醒`)
  return { target: request.id, from: notice, reason: request.reason ?? `提醒 ${request.id} 已经发出`, changes: [{ path: ['notices', request.id] }] }
}

// ------------------------------------------------------------- peak mode

function planPeak(request: Extract<Request, { readonly op: 'peak-mode-set' }>, state: ProjectState, ctx: PlanContext): Step {
  const current = effectivePeakMode(state)
  if (current.origin === 'human' && current.level === request.level && state.repo.outside === undefined && state.repo.digest !== null) return 'unchanged'
  const setting: PeakModeSetting = { level: request.level, at: ctx.now.toISOString(), origin: { actor: 'human' } }
  return {
    target: 'peakMode',
    from: current.level,
    to: request.level,
    reason: request.reason ?? `人把高峰模式改成了「${PEAK_LEVEL_WORDS[request.level].name}」`,
    changes: [{ path: ['peakMode'], value: setting }],
    forceFile: true,
  }
}

function planOwn(request: PlannedRequest, state: ProjectState, ctx: PlanContext): Step {
  switch (request.op) {
    case 'peak-mode-set': return planPeak(request, state, ctx)
    case 'rule-lift': return planLift(request, state)
    case 'rule-delete': return planDelete(request, state)
    case 'rule-expire': return planExpire(request, state, ctx)
    case 'signal-manual': return planManual(request, state, ctx)
    case 'signal-clear': return planClear(request, state)
    case 'signal-delete': return planSignalDelete(request, state)
    case 'ticket-open': return planOpen(request, state, ctx)
    case 'ticket-update': return planUpdate(request, state, ctx)
    case 'ticket-handover': return planHandover(request, state, ctx)
    case 'ticket-adopt': return planAdopt(request, state)
    case 'ticket-let-once': return planLetOnce(request, state, ctx)
    case 'ticket-cancel': return planCancel(request, state, ctx)
    case 'recovery-accept':
    case 'recovery-dismiss': return planRecovery(request, state, ctx)
    case 'notice-add': return planNoticeAdd(request, ctx)
    case 'notice-delivered': return planNoticeDelivered(request, state)
  }
}

// ------------------------------------------------------ clean-up and expiry

/** Whether the host has written its heartbeat in the last 45 seconds: the file `hosts/<pid>-<start>.json` and its `at`. */
function hostAlive(paths: RulesPaths, host: HostRef, nowMs: number): boolean {
  try {
    const at = (JSON.parse(readFileSync(join(paths.runtimeDir, 'hosts', `${host.pid}-${host.startedAt}.json`), 'utf8')) as { at?: unknown }).at
    const time = typeof at === 'string' ? Date.parse(at) : Number.NaN
    return !Number.isNaN(time) && nowMs - time <= HEARTBEAT_FRESH_MS
  }
  catch {
    return false
  }
}

/**
 * Design §7.4 step 5, decided here and written down: a ticket closed more than a day ago is deleted (`prune`); an open
 * ticket whose host has no fresh heartbeat, a cleared one nobody came back for in 30 minutes, and one that has stood a
 * day, expire; a rule whose time is up or whose end condition holds is marked expired. What the operation itself
 * changes (`touched`) is left as the operation made it.
 */
function cleanup(ctx: PlanContext, state: ProjectState, touched: ReadonlySet<string>): Change[] {
  const nowMs = ctx.now.getTime()
  const now = ctx.now.toISOString()
  const changes: Change[] = []
  const alive = new Map<string, boolean>()
  const hostIsUp = (host: HostRef): boolean => {
    const key = `${host.pid}-${host.startedAt}`
    if (!alive.has(key)) alive.set(key, hostAlive(ctx.paths, host, nowMs))
    return alive.get(key) as boolean
  }
  for (const ticket of Object.values(state.tickets ?? {})) {
    if (touched.has(`tickets/${ticket.id}`)) continue
    const path = ['tickets', ticket.id] as const
    if (!isOpen(ticket)) {
      if (nowMs - Date.parse(ticket.closedAt ?? ticket.since) > DAY_MS) changes.push({ path, cause: 'prune' })
      continue
    }
    const why: NonNullable<Ticket['expiredWhy']> | undefined = !hostIsUp(ticket.host)
      ? 'host-gone'
      : ticket.state === 'cleared' && nowMs - Date.parse(ticket.clearedAt ?? ticket.since) >= NOT_RETRIED_MS
        ? 'not-retried'
        : nowMs - Date.parse(ticket.since) >= DAY_MS ? 'age' : undefined
    if (why !== undefined) changes.push({ path, value: { ...ticket, state: 'expired', expiredWhy: why, closedAt: now }, cause: 'expire' })
  }
  for (const rule of Object.values(state.rules ?? {})) {
    if (rule.status !== 'active' || touched.has(`rules/${rule.id}`) || rule.lifetime.kind === 'session' || rule.lifetime.kind === 'until-lifted') continue
    if (lifetimeEnded(rule, state, ctx.now).ended) changes.push({ path: ['rules', rule.id], value: { ...rule, status: 'expired' }, cause: 'expire' })
  }
  return changes
}

const partText = (part: RepoRules | undefined): string => part === undefined ? '' : repoJson(part)

/** The plan of one request on the state it was made against; never throws. */
export function planWrite(ctx: PlanContext, state: ProjectState, request: PlannedRequest): Plan {
  const step = planOwn(request, state, ctx)
  if (step === 'unchanged') return { ok: true, changed: false }
  if ('ok' in step) return step
  try {
    const touched = new Set(step.changes.map(change => change.path.join('/')))
    const changes: Change[] = [...step.changes, ...cleanup(ctx, applyRecord(state, { seq: ctx.seq, changes: step.changes }), touched)]
    const decided = repoPart(applyRecord(state, { seq: ctx.seq, changes }))
    const rewrite = step.forceFile === true || partText(repoPart(state)) !== partText(decided)
    if (rewrite) changes.push({ path: ['repo'], value: { digest: decided === undefined ? null : textDigest(repoJson(decided)) } })
    const next = applyRecord(state, { seq: ctx.seq, changes })
    const problem = stateProblem(next)
    if (problem !== undefined) return refuse('invalid', `写后的状态不合法：${problem}`)
    return {
      ok: true,
      changed: true,
      ...(step.target === undefined ? {} : { target: step.target }),
      ...(step.from === undefined ? {} : { from: step.from }),
      ...(step.to === undefined ? {} : { to: step.to }),
      reason: step.reason,
      ...(step.evidence === undefined ? {} : { evidence: step.evidence }),
      changes,
      next,
      snapshot: stateDigest(next),
      ...(rewrite ? { rewrite: { part: decided } } : {}),
    }
  }
  catch (error) {
    return refuse('invalid', `这次的改动做不了：${error instanceof Error ? error.message : String(error)}`)
  }
}
