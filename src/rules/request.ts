/**
 * The requests of the board's operations (docs/ORCHESTRATION.md §16.9; design
 * §9.2, §12): what a caller may ask `apply` for, and the check that a request
 * has the fields its operation needs, of the types it needs. The check is
 * about the request alone; whether the thing it names exists and may be done
 * now is the plan's (plan.ts). A request carries no identity: who asks is the
 * entry's, and a field that claims one is not read.
 */
import { PEAK_LEVEL_WORDS } from '../shared/peak-mode.ts'
import { proposalProblem } from './entries.ts'
import { parsePeakLevel, type PeakLevel, type Proposal, type SignalValue, type Ticket } from './model.ts'
import { WRITE_OPS, type WriteOp } from './permissions.ts'

/** The operations a caller asks for: all but the two records the board makes by itself when it finds the rules file changed. */
type RequestOp = Exclude<WriteOp, 'repo-outside' | 'repo-outside-cleared'>

/** A host process: its pid and the moment it started. */
export interface HostRef {
  readonly pid: number
  readonly startedAt: number
}

type TicketState = Ticket['state']

/** What `propose` writes: the proposal as the agent made it, without what the board adds (time, status, who decided, the question). */
type ProposalDraft = Omit<Proposal, 'status' | 'at' | 'decidedBy' | 'question' | 'shownAt'>

interface Common {
  /** The sequence number the caller read; a newer state refuses the write. */
  readonly rev?: number
  /** Why, in the entry's words, for the journal. */
  readonly reason?: string
}

export type Request = Common & (
  | { readonly op: 'peak-mode-set', readonly level: PeakLevel }
  | { readonly op: 'rule-lift', readonly id: string }
  | { readonly op: 'rule-delete', readonly id: string }
  /** `released`: the host says the session of a session rule has been released here; it cannot be seen from the state. */
  | { readonly op: 'rule-expire', readonly id: string, readonly released?: true }
  | { readonly op: 'signal-manual', readonly name: string, readonly value: SignalValue, readonly durationMs?: number }
  | { readonly op: 'signal-clear', readonly name: string }
  | { readonly op: 'signal-delete', readonly name: string }
  | {
    readonly op: 'ticket-open'
    readonly sessionId: string
    readonly agentLabel: string
    readonly host: HostRef
    readonly signature: string
    readonly tool: string
    readonly summary: string
    readonly rules: readonly string[]
    readonly nested?: true
    readonly scriptRules?: readonly string[]
    readonly pausedGoal?: { readonly id: string, readonly revision: number }
    readonly pauseFailed?: string
  }
  | {
    readonly op: 'ticket-update'
    readonly id: string
    readonly state?: TicketState
    readonly expiredWhy?: NonNullable<Ticket['expiredWhy']>
    readonly rules?: readonly string[]
    readonly scriptRules?: readonly string[]
    readonly pausedGoal?: { readonly id: string, readonly revision: number }
    readonly pauseFailed?: string
    /** The goal was resumed (or did not need to be) now: the board stamps the time. */
    readonly resumed?: true
  }
  | { readonly op: 'ticket-handover', readonly id: string, readonly sessionId: string, readonly agentLabel: string, readonly focus?: string }
  | { readonly op: 'ticket-adopt', readonly id: string, readonly host: HostRef }
  | { readonly op: 'ticket-let-once', readonly id: string, readonly until?: string }
  | { readonly op: 'ticket-cancel', readonly id: string }
  | { readonly op: 'recovery-accept', readonly labels: readonly string[] }
  | { readonly op: 'recovery-dismiss', readonly labels: readonly string[] }
  | { readonly op: 'repo-adopt' }
  | { readonly op: 'repo-restore' }
  | { readonly op: 'propose', readonly proposal: ProposalDraft }
  /** The person was shown the text of a proposal that runs something (`/rules accept` the first time): the second within 30 minutes takes effect. */
  | { readonly op: 'proposal-show', readonly id: string }
  /** `by`: who decided (`human` typed it, `llm` is the main agent recording the human's words, which are `relay`); `question`: the question on the graph; `board`: the person typed `/rules accept`, not the graph. */
  | { readonly op: 'proposal-accept', readonly id: string, readonly by: 'human' | 'llm', readonly relay?: string, readonly question?: string, readonly board?: true }
  | { readonly op: 'proposal-reject', readonly id: string, readonly by?: 'human' | 'llm', readonly relay?: string }
  /** The proposal was put to nobody for 7 days (`via: 'graph'`, no question on the graph names it). */
  | { readonly op: 'proposal-expire', readonly id: string }
  | { readonly op: 'notice-add', readonly kind: 'late-block' | 'script-capped', readonly rule: string, readonly text: string }
  | { readonly op: 'notice-delivered', readonly id: string }
)

/** The longest a person's value for a signal may last (design §5.1). */
const MAX_MANUAL_MS = 7 * 24 * 3_600_000

const TICKET_STATES: readonly string[] = ['deferred', 'cleared', 'done', 'cancelled', 'expired']
const EXPIRED_WHY: readonly string[] = ['age', 'not-retried', 'host-gone']
const NOTICE_KINDS: readonly string[] = ['late-block', 'script-capped']
const MAX_LABELS = 50
const MAX_TEXT = 2000

type Fields = Readonly<Record<string, unknown>>
type Parsed<T> = { readonly ok: true, readonly value: T } | { readonly ok: false, readonly message: string }

const good = <T>(value: T): Parsed<T> => ({ ok: true, value })
const bad = (message: string): Parsed<never> => ({ ok: false, message })

function text(fields: Fields, key: string, what: string, max = 200): Parsed<string> {
  const value = fields[key]
  return typeof value === 'string' && value !== '' && value.length <= max ? good(value) : bad(`${key} 要写成${what}（不空，至多 ${max} 个字符）`)
}

function optionalText(fields: Fields, key: string, what: string, max = 200): Parsed<string | undefined> {
  return fields[key] === undefined ? good(undefined) : text(fields, key, what, max)
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0

function host(fields: Fields, key: string): Parsed<HostRef> {
  const value = fields[key]
  const sound = typeof value === 'object' && value !== null && !Array.isArray(value)
  const { pid, startedAt } = (sound ? value : {}) as Fields
  return sound && Object.keys(value).length === 2 && isCount(pid) && isCount(startedAt) ? good({ pid, startedAt }) : bad(`${key} 要写成 {pid, startedAt}，两个都是非负整数`)
}

function wordList(fields: Fields, key: string, max: number): Parsed<readonly string[] | undefined> {
  const value = fields[key]
  if (value === undefined) return good(undefined)
  return Array.isArray(value) && value.length <= max && value.every(item => typeof item === 'string' && item !== '' && item.length <= 200)
    ? good(value as readonly string[])
    : bad(`${key} 要写成名字的列表（每个不空，至多 ${max} 个）`)
}

function goal(fields: Fields): Parsed<{ readonly id: string, readonly revision: number } | undefined> {
  const value = fields.pausedGoal
  if (value === undefined) return good(undefined)
  const sound = typeof value === 'object' && value !== null && !Array.isArray(value)
  const { id, revision } = (sound ? value : {}) as Fields
  return sound && Object.keys(value).length === 2 && typeof id === 'string' && id !== '' && isCount(revision) ? good({ id, revision }) : bad('pausedGoal 要写成 {id, revision}')
}

/** Fields of a kind that are only ever `true` when present. */
function onlyTrue(fields: Fields, key: string): Parsed<true | undefined> {
  return fields[key] === undefined ? good(undefined) : fields[key] === true ? good(true) : bad(`${key} 只能写 true`)
}

/** The first failure of a list of checks, or every value they produced. */
function all(...parts: Array<Parsed<unknown>>): string | undefined {
  return parts.find(part => !part.ok)?.message
}

/** The value of a check that passed; the callers have looked at `all` first. */
const got = <T>(part: Parsed<T>): T => (part as { readonly value: T }).value

/** The request made of the fields that have a value: an optional field of a request is absent, never `undefined`. The caller has checked each field. */
function defined(fields: Record<string, unknown>): Request {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as unknown as Request
}

function parseBody(op: RequestOp, fields: Fields): Request | string {
  switch (op) {
    case 'peak-mode-set': {
      const level = fields.level
      return typeof level === 'string' && parsePeakLevel(level) === level ? { op, level } : `level 要是 ${Object.keys(PEAK_LEVEL_WORDS).join('、')} 之一`
    }
    case 'rule-lift':
    case 'rule-delete':
    case 'ticket-cancel':
    case 'notice-delivered': {
      const id = text(fields, 'id', '名字')
      return all(id) ?? { op, id: got(id) }
    }
    case 'rule-expire': {
      const id = text(fields, 'id', '名字')
      const released = onlyTrue(fields, 'released')
      return all(id, released) ?? defined({ op, id: got(id), released: got(released) })
    }
    case 'signal-clear':
    case 'signal-delete': {
      const name = text(fields, 'name', '信号名')
      return all(name) ?? { op, name: got(name) }
    }
    case 'signal-manual': {
      const name = text(fields, 'name', '信号名')
      const value = fields.value
      const duration = fields.durationMs
      const soundValue = typeof value === 'boolean' || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
      if (!soundValue) return 'value 要是布尔、数或字符串'
      if (duration !== undefined && !(typeof duration === 'number' && Number.isInteger(duration) && duration >= 1 && duration <= MAX_MANUAL_MS)) return 'durationMs 要是 1 到 7 天之间的整数毫秒数'
      return all(name) ?? defined({ op, name: got(name), value, durationMs: duration })
    }
    case 'ticket-open': {
      const [sessionId, agentLabel, signature, tool] = [text(fields, 'sessionId', '会话 id'), text(fields, 'agentLabel', '名字'), text(fields, 'signature', '签名'), text(fields, 'tool', '工具名')]
      const hostOf = host(fields, 'host')
      const rules = wordList(fields, 'rules', 20)
      const scriptRules = wordList(fields, 'scriptRules', 20)
      const paused = goal(fields)
      const nested = onlyTrue(fields, 'nested')
      const failed = optionalText(fields, 'pauseFailed', '原因', 400)
      const summary = fields.summary
      if (typeof summary !== 'string') return 'summary 要写成命令或参数的文字'
      if (!Array.isArray(fields.rules)) return 'rules 要写成推迟它的规则 id 的列表'
      return all(sessionId, agentLabel, signature, tool, hostOf, rules, scriptRules, paused, nested, failed) ?? defined({
        op, sessionId: got(sessionId), agentLabel: got(agentLabel), host: got(hostOf), signature: got(signature), tool: got(tool), summary, rules: got(rules) ?? [],
        nested: got(nested), scriptRules: got(scriptRules), pausedGoal: got(paused), pauseFailed: got(failed),
      })
    }
    case 'ticket-update': {
      const id = text(fields, 'id', '名字')
      const rules = wordList(fields, 'rules', 20)
      const scriptRules = wordList(fields, 'scriptRules', 20)
      const paused = goal(fields)
      const failed = optionalText(fields, 'pauseFailed', '原因', 400)
      const resumed = onlyTrue(fields, 'resumed')
      const state = fields.state
      const why = fields.expiredWhy
      const problem = all(id, rules, scriptRules, paused, failed, resumed)
      if (problem !== undefined) return problem
      if (state !== undefined && !(typeof state === 'string' && TICKET_STATES.includes(state))) return `state 要是 ${TICKET_STATES.join('、')} 之一`
      if (why !== undefined && !(typeof why === 'string' && EXPIRED_WHY.includes(why))) return `expiredWhy 要是 ${EXPIRED_WHY.join('、')} 之一`
      if (state === 'expired' && why === undefined) return 'state 为 expired 时要写 expiredWhy（age、not-retried 或 host-gone）'
      if (why !== undefined && state !== 'expired') return 'expiredWhy 只在 state 为 expired 时写'
      const body = defined({ op, id: got(id), state, expiredWhy: why, rules: got(rules), scriptRules: got(scriptRules), pausedGoal: got(paused), pauseFailed: got(failed), resumed: got(resumed) })
      return Object.keys(body).length > 2 ? body : 'ticket-update 要写要改什么：state、rules、scriptRules、pausedGoal、pauseFailed 或 resumed'
    }
    case 'ticket-handover': {
      const [id, sessionId, agentLabel] = [text(fields, 'id', '名字'), text(fields, 'sessionId', '会话 id'), text(fields, 'agentLabel', '名字')]
      const focus = optionalText(fields, 'focus', '节点 id')
      return all(id, sessionId, agentLabel, focus) ?? defined({ op, id: got(id), sessionId: got(sessionId), agentLabel: got(agentLabel), focus: got(focus) })
    }
    case 'ticket-adopt': {
      const id = text(fields, 'id', '名字')
      const hostOf = host(fields, 'host')
      return all(id, hostOf) ?? { op, id: got(id), host: got(hostOf) }
    }
    case 'ticket-let-once': {
      const id = text(fields, 'id', '名字')
      const until = fields.until
      if (until !== undefined && !(typeof until === 'string' && !Number.isNaN(Date.parse(until)))) return 'until 要写成 ISO 时刻'
      return all(id) ?? defined({ op, id: got(id), until })
    }
    case 'recovery-accept':
    case 'recovery-dismiss': {
      const labels = fields.labels
      return Array.isArray(labels) && labels.length >= 1 && labels.length <= MAX_LABELS && labels.every(label => typeof label === 'string' && label !== '' && label.length <= 40)
        ? { op, labels: labels as string[] }
        : `labels 要写成编号的列表（1 到 ${MAX_LABELS} 个，每个是 /rules 列出的编号）`
    }
    case 'repo-adopt':
    case 'repo-restore':
      return { op }
    case 'propose': {
      const draft = fields.proposal
      if (typeof draft !== 'object' || draft === null || Array.isArray(draft)) return 'proposal 要写成一个提议'
      const record = draft as Fields
      const problem = proposalProblem(String(record.id), { ...record, status: 'open', at: new Date(0).toISOString() }, 'proposal')
      return problem ?? { op, proposal: record as unknown as ProposalDraft }
    }
    case 'proposal-show':
    case 'proposal-expire': {
      const id = text(fields, 'id', '提议 id')
      return all(id) ?? { op, id: got(id) }
    }
    case 'proposal-accept': {
      const id = text(fields, 'id', '提议 id')
      const relay = optionalText(fields, 'relay', '人的原话', MAX_TEXT)
      const question = optionalText(fields, 'question', '待决的 id')
      const board = onlyTrue(fields, 'board')
      if (fields.by !== 'human' && fields.by !== 'llm') return 'by 要是 human 或 llm'
      if (fields.by === 'llm' && fields.relay === undefined) return 'by 为 llm 时要带人的原话 relay'
      return all(id, relay, question, board) ?? defined({ op, id: got(id), by: fields.by, relay: got(relay), question: got(question), board: got(board) })
    }
    case 'proposal-reject': {
      const id = text(fields, 'id', '提议 id')
      const relay = optionalText(fields, 'relay', '人的原话', MAX_TEXT)
      if (fields.by !== undefined && fields.by !== 'human' && fields.by !== 'llm') return 'by 要是 human 或 llm'
      return all(id, relay) ?? defined({ op, id: got(id), by: fields.by, relay: got(relay) })
    }
    case 'notice-add': {
      const kind = fields.kind
      if (!(typeof kind === 'string' && NOTICE_KINDS.includes(kind))) return `kind 要是 ${NOTICE_KINDS.join('、')} 之一`
      const rule = text(fields, 'rule', '规则 id')
      const words = text(fields, 'text', '要告诉主 Agent 的话', MAX_TEXT)
      return all(rule, words) ?? { op, kind: kind as 'late-block' | 'script-capped', rule: got(rule), text: got(words) }
    }
  }
}

/** The request as a typed value, or why it is not one. */
export function parseRequest(request: unknown): Request | string {
  if (typeof request !== 'object' || request === null || Array.isArray(request)) return '请求不是对象'
  const fields = request as Fields
  const { op, rev, reason } = fields
  if (typeof op !== 'string' || !(WRITE_OPS as readonly string[]).includes(op)) return `op ${JSON.stringify(op)} 不认识`
  if (op === 'repo-outside' || op === 'repo-outside-cleared') return `op ${JSON.stringify(op)} 是规则板自己做的记录，不是请求`
  if (rev !== undefined && !isCount(rev)) return 'rev 要是非负整数'
  if (reason !== undefined && !(typeof reason === 'string' && reason.length <= MAX_TEXT)) return `reason 要是字符串（至多 ${MAX_TEXT} 个字符）`
  const body = parseBody(op as RequestOp, fields)
  if (typeof body === 'string') return body
  return { ...body, ...(rev === undefined ? {} : { rev }), ...(reason === undefined ? {} : { reason }) }
}
