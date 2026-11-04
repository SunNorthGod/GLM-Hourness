/**
 * The request channel's desk (m4-request-card, design §5): the in-memory
 * state and the step logic behind `request_exception`. One refusal book
 * (design §5.3: what a denied call's ref cites), one grant book (§5.6:
 * human-approved writes, used once, re-checked at use time) and at most one
 * open request per session (§5.3 step 5) — all process memory; a restart
 * drops them, the next denial carries a fresh ref, and the first notice
 * install names the asks that lapsed (§5.5 step 6). `requestException` is
 * the tool body (§5.3's check order, first failure throws the
 * `{code, message, hint}` JSON); `readReply` is the hourness-request step
 * notice's decision over what the step admitted (§5.5: the human's own
 * client message approves, anything else is named and the request stays);
 * `outsideDenial` and `peekGrant` are the seams an outer gate (M7's
 * worker-scope) uses. Not one of these records authorizes anything: only
 * the human's own client message does (§5.6 只认人).
 */
import { resolve } from 'node:path'
import type { JsonValue } from '../shared/json.ts'
import { codePointCount } from '../graph/proposal.ts'
import { displayPath, personTitle, renderPlan, type PlanLines } from '../graph/plan-text.ts'
import { plainWordsIn } from '../graph/plain-question.ts'
import { projectOf } from '../data/project-root.ts'
import type { AgentLike, DerivedMessage, ServiceLookup, SessionLike, UserNotice } from '../shared/dsh-min.ts'
import { createUserNotice } from '../shared/dsh-min.ts'
import type { ToolCall } from './rules.ts'
import type { GrantRecord, GrantVoidRecord, RequestRecord } from './records.ts'
import { APPROVAL_WORDS, DECLINE_WORDS, GRANT_TTL_MS, GrantBook, REQUEST_TTL_MS, RefusalBook, exceptionOf, normalizeShown, normalizeWords, signatureOf, type GrantEntry, type RefusalEntry, type RefusalVia } from './request.ts'

/** The service name the outer gates read through ctx (the lift service's convention). */
export const REQUESTS_SERVICE = 'glmHournessRequests'

/** The notice source of every request reminder (design §5.5). */
export const REQUEST_SOURCE = 'hourness-request'

/** The ask result's instruction to the agent (design §5.3's output, verbatim). */
export const REQUEST_ASK_MESSAGE = 'Put `text` at the very end of your reply, exactly as given (same lines, same marks), and end your turn without another tool call. Do not call propose_to_human in this reply. The human\'s next message answers it; you get a note at your next step. If a goal keeps you running and the harness does not pause it, tell the human in this reply to answer when you stop; the request stays open until they do.'

/** How long the whole plan text may be before the preview and the quotes shrink (design §5.4). */
const PLAN_LIMIT = 2000
/** Targets above this size are not backed up (design §5.4's table). */
const BACKUP_LIMIT = 10 * 1024 * 1024
/** Arguments above this size move to a file the note names (design §5.5). */
const ARGS_INLINE_LIMIT = 4 * 1024
/** How many content lines the preview shows (design §5.4). */
const PREVIEW_LINES = 10
/** How many characters of one preview line survive. */
const PREVIEW_LINE_LIMIT = 120
/** How many characters of one agent quote survive once the whole runs over the limit (design §5.4). */
const QUOTE_LIMIT = 40

/** One open request (design §5.3 step 7). One per session. */
interface OpenRequest {
  readonly ref: string
  readonly sessionId: string
  readonly agent: AgentLike | undefined
  readonly rule: string
  readonly tool: string
  readonly args: Readonly<Record<string, unknown>>
  readonly signature: string
  /** The dispatch chain's root the refusal recorded; the grant matches calls of the same root. */
  readonly dispatchRoot: string
  readonly target: string
  readonly facts: { readonly exists: boolean, readonly size?: number | undefined, readonly mtimeMs?: number | undefined }
  /** The agent whose call was denied (the approval note's second line reads it, design §5.5). */
  readonly denied: AgentLike | undefined
  readonly via: RefusalVia
  /** The plan text, its lines (title plus the four, for the panel, §5.8), and the normal form the reply must end with (§5.5 step 3). */
  text: string
  readonly lines: RequestLines
  tail: string
  readonly askedAt: number
  unclear: number
  readonly cwd: string | undefined
}

/** A message's text: the text blocks joined (DerivedMessage has no flat text field). */
const textOf = (entry: DerivedMessage): string => (entry.content ?? []).map(block => block.text ?? '').join('')

/** The last index where a predicate holds, -1 when none (lib ES2022 has no findLastIndex). */
const lastIndexOf = <T>(items: readonly T[], holds: (item: T) => boolean): number => {
  for (let index = items.length - 1; index >= 0; index--) if (holds(items[index]) === true) return index
  return -1
}

/** A call's arguments as a record: a non-object arguments field reads as empty. */
const argsRecordOf = (value: unknown): Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : {}

/** What the step notice feeds for one step (installStepNotice's builder arguments). */
export interface StepInput {
  /** The history up to this step (deriveMessages). */
  readonly history: readonly DerivedMessage[]
  /** The messages this step admitted from the inbox. */
  readonly admitted: readonly DerivedMessage[]
  /** The step number within the turn (the still-waits reminder rides the first one only, design §5.5 step 2). */
  readonly step: number
  readonly session: SessionLike
  /** The agent the notice is installed on. */
  readonly agent: AgentLike | undefined
}

/** The outside gates' view (design §5.9). M7 is not merged; the interface is the seam it will call. */
export interface RequestsService {
  /**
   * For an outer gate that is denying this write: when the target leaves the
   * project itself (F19), register the denial and return the ref and the
   * worker's exception sentence. A target inside the project but outside the
   * worker's work tree returns undefined: the outer gate corrects it by its
   * own rules, the human is not asked. Never throws.
   */
  outsideDenial(call: { readonly agent: AgentLike, readonly tool: string, readonly args: Readonly<Record<string, unknown>>, readonly base: string, readonly task?: string }): { readonly ref: string, readonly exception: string } | undefined
  /** Read only (§5.6): an unused, unexpired, not-in-use grant matches this call's signature and dispatch root. Never throws. */
  peekGrant(call: { readonly agent: AgentLike, readonly tool: string, readonly args: Readonly<Record<string, unknown>>, readonly base: string }): boolean
  /** Requests waiting for the human in one session, oldest first (§5.3 step 7). Never throws. */
  openRequests(sessionId: string): readonly { readonly ref: string, readonly askedAt: string, readonly target: string }[]
}

/** The plan's title line plus the four lines, as the ask result carries them for the panel (design §5.3, §5.8). */
type RequestLines = PlanLines & { readonly title: string }

/** The file calls the desk makes, structurally `node:fs/promises`' subset; tests inject fakes. */
export interface RequestDeskFs {
  stat(path: string): Promise<{ readonly size: number, readonly mtimeMs: number }>
  mkdir(path: string, options: { readonly recursive: boolean }): Promise<string | undefined>
  copyFile(src: string, dest: string): Promise<void>
  writeFile(path: string, text: string): Promise<void>
}

/** The outcome of the use-time check and backup (design §5.6): ready to run, voided, or the backup failed. */
export type GrantPreparation = { readonly kind: 'ready' } | { readonly kind: 'void', readonly reason: string } | { readonly kind: 'backup-failed', readonly reason: string }

/** One denied call the desk may yet cite, registered by the guard row's gate (design §5.1 step 1) or by an outer gate through the service (§5.9). */
interface DeniedInput {
  readonly agent: AgentLike | undefined
  readonly call: ToolCall
  /** The caller's working directory the target spelling resolves against. */
  readonly base: string | undefined
  readonly target: string
  readonly rule: string
  readonly via: RefusalVia
  /** The ref the correction named; absent when the caller (outsideDenial) has none yet. */
  readonly ref?: string
}

/** What `request_exception` answers (design §5.3's output): a refusal, an already-approved answer, or the plan text to show. */
export type RequestExceptionResult =
  | { readonly code: 'forbidden' | 'invalid' | 'not_found' | 'expired' | 'busy' | 'unavailable', readonly message: string, readonly hint: string }
  | { readonly outcome: 'approved', readonly ref: string, readonly tool: string, readonly arguments: Readonly<Record<string, unknown>>, readonly expires: string, readonly message: string }
  | { readonly outcome: 'ask', readonly ref: string, readonly text: string, readonly lines: RequestLines, readonly message: string }

/** What the desk needs from the guard row (wired in src/guard/index.ts); tests inject fakes. */
export interface RequestDeskDeps {
  readonly refusals: RefusalBook
  readonly grants: GrantBook
  readonly now: () => Date
  /** The violation journal; failures are the caller's (the row's) to report. */
  readonly journal: (record: RequestRecord | GrantRecord | GrantVoidRecord, cwd: string | undefined) => void | Promise<void>
  /** The dispatch chain's root of an agent (src/guard/design-release.ts); undefined when the chain is broken. */
  readonly dispatchRootOf: (agent: AgentLike | undefined) => string | undefined
  /** The project directory a working directory belongs to, or undefined (§5.6's backup home, §5.9's F19). */
  readonly projectHomeOf: (cwd: string | undefined) => string | undefined
  /** The row's containment roots configured for an agent (§5.9's F19 fallback). */
  readonly rootsOf: (agent: AgentLike) => readonly string[] | undefined
  /** The filing agent's graph focus node's title, or undefined (design §5.4); may read the graph. */
  readonly focusTitleOf: (agent: AgentLike | undefined) => Promise<string | undefined>
  /** Deliver a notice to an agent out of band (the 2h closing reminder, §5.5 step 1); may throw when the session is gone. */
  readonly wake: (agent: AgentLike, notice: UserNotice) => void
  /** A health note to the session's log (degraded reasons, §5.3 step 7). */
  readonly note: (sessionId: string, key: string, text: string) => void
  readonly warn: (message: string) => void
  readonly fs: RequestDeskFs
}

/** The desk the guard row holds: the books, the tool body, the step reading, the timers, the outer gates' service. */
export interface RequestDesk {
  readonly books: { readonly refusals: RefusalBook, readonly grants: GrantBook }
  registerDenied(input: DeniedInput): { readonly ref: string, readonly signature: string }
  requestException(args: Readonly<Record<string, unknown>>, agent: AgentLike | undefined, cwd: string | undefined): Promise<RequestExceptionResult>
  readReply(input: StepInput): Promise<UserNotice | undefined>
  expireDue(sessionId: string): Promise<UserNotice | undefined>
  lapseOrphans(agent: AgentLike, history: readonly DerivedMessage[]): UserNotice | undefined
  prepareGrant(call: ToolCall, base: string | undefined, grant: GrantEntry, cwd: string | undefined): Promise<GrantPreparation>
  readonly service: RequestsService
  dispose(): void
}

/** How much of a text is cut when the whole runs over the limit; the cut names itself. */
const cutTo = (text: string, limit: number): string => codePointCount(text) <= limit ? text : `${[...text].slice(0, limit).join('')}…`

const fenceOf = (content: string): string => {
  const longest = [...content.matchAll(/`+/g)].reduce((max, run) => Math.max(max, run[0].length), 0)
  return '`'.repeat(Math.max(3, longest + 1))
}

/** The content preview (design §5.4): the first lines, each cut, fenced one past the longest backtick run; binary content is named, not shown. */
const previewOf = (content: string): string => {
  if (content.includes('\0') === true) return `二进制内容，${content.length} 字节`
  const lines = content.split('\n')
  const shown = lines.slice(0, PREVIEW_LINES).map(line => cutTo(line, PREVIEW_LINE_LIMIT))
  const fence = fenceOf(content)
  return `${fence}text\n${shown.join('\n')}\n${fence}`
}

/** The mtime stamp of the attachments (design §5.4's example: 10-30 09:12, the local zone). */
const stampOf = (mtimeMs: number): string => {
  const at = new Date(mtimeMs)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`
}

/** The agent's words as the attachments quote them: newlines become spaces, the Markdown structural characters escaped, cut when the whole runs over the limit. */
const quoteOf = (text: string, limit: number): string => `「${cutTo(text.replaceAll('\n', ' ').replace(/[*`[\]<>]/g, found => `\\${found}`), limit)}」`

/** The closing question, asked once (design §5.4: one plan, one reply word). */
export const QUESTION = '放行这一次，可以吗？（回「可以」才算数）'

/** The act each rule's background line names (design §5.4's table). */
const ACT_OF: Readonly<Record<string, string>> = {
  'workspace-containment': '改工作区外的文件',
  'checker-config': '改检查器的配置',
  'scratch-only': '新建脚本',
}

/** The doubt line per rule (design §5.4: one fact a person can check, whose change means do not approve). */
const DOUBT_OF: Readonly<Record<string, string>> = {
  'workspace-containment': '这个文件若**不归这件活管**，就不该放行',
  'checker-config': '这次改动若**让检查变松**，就不该放行',
  'scratch-only': '这个脚本若**只用一次**，就该放草稿区',
}

/** The title's lead per rule and target state (design §5.4's table). */
const titleLeadOf = (rule: string, exists: boolean): string =>
  rule === 'checker-config' ? '要改检查器的配置：'
    : rule === 'scratch-only' ? '要在项目里新建脚本：'
      : exists === true ? '要改工作区外的文件：' : '要在工作区外新建文件：'

/** An edit or a str_replace write changes one place per call; the proposal line says so (design §5.4's table). */
const isEditKind = (tool: string): boolean => tool === 'edit' || tool === 'str_replace_editor'

/** First lines of a text, fenced (design §5.4: at most five for the edit's before and after). */
const linesPreview = (text: string, lines: number): string => {
  const all = text.split('\n')
  const shown = all.slice(0, lines).map(line => cutTo(line, PREVIEW_LINE_LIMIT))
  const fence = fenceOf(text)
  return `${fence}text\n${shown.join('\n')}\n${fence}`
}

/** The plan text of one refusal (design §5.4): title with the display path, the four lines, the attachments, the question. */
function buildPlan(deps: RequestDeskDeps, refusal: RefusalEntry, said: { purpose: string, reversibility: string, alternatives: string }, facts: { readonly exists: boolean, readonly size?: number | undefined, readonly mtimeMs?: number | undefined }, cwd: string | undefined, focusRaw: string | undefined): { readonly text: string, readonly lines: RequestLines } {
  const home = deps.projectHomeOf(cwd)
  const backup = facts.exists === true && (facts.size ?? 0) <= BACKUP_LIMIT && home !== undefined
  const focus = focusRaw === undefined ? undefined : personTitle(focusRaw, { limit: 16, issuesOf: text => plainWordsIn(text) })
  const bold = ACT_OF[refusal.rule] ?? '改工作区外的文件'
  const background = focus === undefined
    ? `agent 要**${bold}**，系统先拦下了`
    : `agent 做「${focus}」时要**${bold}**，系统先拦下了`
  const proposal = facts.exists === false
    ? '**放行这一次**，是新文件，删掉就能撤回'
    : isEditKind(refusal.tool) === true
      ? backup === true ? '**放行这一次**，改 1 处，旧内容先备份' : '放行这一次，但**旧内容找不回来**'
      : backup === true ? '**放行这一次**，旧内容先备份，改坏了能找回' : '放行这一次，但**旧内容找不回来**'
  const lines: PlanLines = { background, proposal, doubt: DOUBT_OF[refusal.rule] ?? DOUBT_OF['workspace-containment'], notTaken: '**不放行**，文件不动，agent 换在工作区里做' }
  const attachments: string[] = []
  if (isEditKind(refusal.tool) === true) {
    const before = typeof refusal.args.old_string === 'string' ? refusal.args.old_string : ''
    const after = typeof refusal.args.new_string === 'string' ? refusal.args.new_string : ''
    attachments.push('- 改动前后（各前 5 行）：', `改动前：\n${linesPreview(before, 5)}`, `改动后：\n${linesPreview(after, 5)}`)
  }
  else if (facts.exists === true) {
    const size = facts.size ?? 0
    const why = size > BACKUP_LIMIT ? '大于 10 MiB，不备份' : home === undefined ? '没有项目目录，不备份' : undefined
    attachments.push(`- 文件现在：已存在，${size} 字节，${stampOf(facts.mtimeMs ?? 0)} 改过${why === undefined ? '' : `，${why}`}`)
  }
  else {
    attachments.push('- 文件现在：不存在，将新建')
  }
  attachments.push(`- agent 说的目的：${quoteOf(said.purpose, QUOTE_LIMIT)}`)
  attachments.push(`- agent 说还会碰到：${quoteOf(said.reversibility, QUOTE_LIMIT)}`)
  attachments.push(`- agent 试过的替代：${quoteOf(said.alternatives, QUOTE_LIMIT)}`)
  if (isEditKind(refusal.tool) === false) {
    const content = typeof refusal.args.content === 'string' ? refusal.args.content : undefined
    if (content === undefined) attachments.push('- 将写入的内容：调用没有内容参数')
    else {
      const preview = previewOf(content)
      attachments.push(preview.startsWith('二进制内容') === true ? `- 将写入的内容：${preview}` : `- 将写入的内容（前 ${Math.min(PREVIEW_LINES, content.split('\n').length)} 行，共 ${content.split('\n').length} 行）：\n${preview}`)
    }
  }
  const title = `${titleLeadOf(refusal.rule, facts.exists)}${displayPath(refusal.target)}`
  const render = (withAttachments: readonly string[]): string => renderPlan({ title: { lead: titleLeadOf(refusal.rule, facts.exists), data: displayPath(refusal.target) }, lines, attachments: withAttachments, question: QUESTION })
  let text = render(attachments)
  if (codePointCount(text) > PLAN_LIMIT) {
    // The preview shrinks first, then the quotes (design §5.4); each cut names itself.
    const shrunk = attachments.map(line => line.includes('```') === true && line.startsWith('- 将写入的内容（') === true ? line.replace(/\ntext\n[\s\S]*\n```$/, '\ntext\n…\n```') : line)
    text = render(shrunk)
  }
  if (codePointCount(text) > PLAN_LIMIT) {
    const shorter = attachments.map(line => {
      const at = line.indexOf('「')
      return at >= 0 && line.endsWith('」') === true ? `${line.slice(0, at)}「${cutTo(line.slice(at + 1, -1), QUOTE_LIMIT)}」` : line
    })
    text = render(shorter)
  }
  return { text: cutTo(text, PLAN_LIMIT), lines: { title, ...lines } }
}

export function createRequestDesk(deps: RequestDeskDeps): RequestDesk {
  const open = new Map<string, OpenRequest>()
  const timers = new Map<string, NodeJS.Timeout>()
  const lapsed = new WeakSet<AgentLike>()
  /** The agent each refusal denied (the approval note's second line and the plan's `denied` field read it, §5.5). */
  const deniedAgents = new Map<string, AgentLike>()

  const journal = (entry: Record<string, unknown>, kind: 'request' | 'grant' | 'grant-void', cwd: string | undefined): void => {
    void deps.journal({ kind, at: deps.now().toISOString(), ...entry } as RequestRecord & GrantRecord & GrantVoidRecord, cwd)
  }

  const closeWith = (openRequest: OpenRequest, outcome: RequestRecord['outcome'], text: string, words?: string, extra?: Record<string, unknown>): UserNotice => {
    open.delete(openRequest.sessionId)
    const timer = timers.get(openRequest.sessionId)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.delete(openRequest.sessionId)
    }
    journal({ ref: openRequest.ref, outcome, sessionId: openRequest.sessionId, rule: openRequest.rule, tool: openRequest.tool, target: openRequest.target, ...(words === undefined ? {} : { words }), ...extra }, 'request', openRequest.cwd)
    return createUserNotice(REQUEST_SOURCE, `Request ${openRequest.ref} ${outcome}`, text, { request: { ref: openRequest.ref, outcome } })
  }

  const expire = (openRequest: OpenRequest): UserNotice => {
    const notice = closeWith(openRequest, 'expired', `Request ${openRequest.ref} expired: the human did not answer within 2 hours. If the write is still needed, make the denied call again for a fresh ref.`)
    if (openRequest.agent !== undefined) {
      try {
        deps.wake(openRequest.agent, notice)
      }
      catch {
        // The session may be gone; the record is written either way.
      }
    }
    return notice
  }

  const armTimer = (openRequest: OpenRequest): void => {
    const left = openRequest.askedAt + REQUEST_TTL_MS - deps.now().getTime()
    const timer = setTimeout(() => {
      timers.delete(openRequest.sessionId)
      if (open.get(openRequest.sessionId) === openRequest) void expire(openRequest)
    }, Math.max(0, left))
    timer.unref()
    timers.set(openRequest.sessionId, timer)
  }

  const registerDenied: RequestDesk['registerDenied'] = input => {
    const args = argsRecordOf(input.call.arguments)
    const signature = signatureOf(input.call.name, args, input.base)
    const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'
    const ref = input.ref ?? `r-${Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * 36)]).join('')}`
    deps.refusals.add({
      ref,
      rule: input.rule,
      tool: input.call.name,
      args,
      signature,
      target: input.target,
      at: deps.now().getTime(),
      agentId: input.agent?.id,
      sessionId: input.agent?.session?.id,
      dispatchRoot: deps.dispatchRootOf(input.agent) ?? '',
      via: input.via,
    })
    if (input.agent !== undefined) deniedAgents.set(ref, input.agent)
    return { ref, signature }
  }

  const pad = (value: number): string => String(value).padStart(2, '0')
  const clockOf = (time: number): string => `${pad(new Date(time).getHours())}:${pad(new Date(time).getMinutes())}`

  const desk: RequestDesk = {
    books: { refusals: deps.refusals, grants: deps.grants },

    registerDenied,

    async requestException(args, agent, cwd) {
      // Step 1 (design §5.3): only a root agent files a request.
      if (agent === undefined || agent.session?.header.origin === 'subagent') return { code: 'forbidden', message: 'a subagent cannot file a request', hint: 'a subagent cannot ask the human: if you have ask_main, give the ref to the main agent with it; otherwise put the ref in your final result' }
      // Step 2: exactly the four fields (design §5.3's table).
      if (Object.keys(args).some(key => key !== 'ref' && key !== 'purpose' && key !== 'reversibility' && key !== 'alternatives')) return { code: 'invalid', message: 'the arguments do not fit', hint: 'pass exactly ref, purpose, reversibility and alternatives' }
      const ref = args.ref
      if (typeof ref !== 'string' || /^r-[0-9a-z]{8}$/.test(ref) === false) return { code: 'invalid', message: 'the arguments do not fit', hint: 'ref is the reference a denial named, r- plus eight lowercase letters or digits' }
      const sentence = (value: unknown, limit: number): string | undefined => typeof value === 'string' && value.trim().length > 0 && codePointCount(value.trim()) <= limit ? value.trim() : undefined
      const purpose = sentence(args.purpose, 80)
      const reversibility = sentence(args.reversibility, 60)
      const alternatives = sentence(args.alternatives, 60)
      if (purpose === undefined || reversibility === undefined || alternatives === undefined) return { code: 'invalid', message: 'the arguments do not fit', hint: 'one short sentence each: the human reads them as one-line quotes (purpose at most 80, reversibility and alternatives at most 60 code points)' }
      // Step 3: the refusal in this process's memory (design §5.3 step 3).
      const refusal = deps.refusals.get(ref)
      if (refusal === undefined) return { code: 'not_found', message: 'the reference names no refused call of this process', hint: 'resubmit the call that was denied: the new denial carries a fresh ref' }
      if (deps.now().getTime() - refusal.at > REQUEST_TTL_MS) return { code: 'expired', message: 'the refused call is older than 2 hours', hint: 'resubmit the call that was denied: the new denial carries a fresh ref' }
      const chainRoot = deps.dispatchRootOf(agent)
      if (chainRoot === undefined || chainRoot === '' || refusal.dispatchRoot === '' || refusal.dispatchRoot !== chainRoot) return { code: 'forbidden', message: 'the reference belongs to another dispatch chain', hint: 'ask the human in your reply' }
      // Step 4: an unused grant for this ref answers at once (design §5.3 step 4).
      const standing = deps.grants.get(ref)
      if (standing !== undefined && standing.expiresAt > deps.now().getTime()) return { outcome: 'approved', ref, tool: refusal.tool, arguments: refusal.args, expires: new Date(standing.expiresAt).toISOString(), message: `The human already approved request ${ref}. Make the identical call once before ${clockOf(standing.expiresAt)}.` }
      // Step 5: this session's open request (design §5.3 step 5).
      const sessionId = agent.session?.id
      const waiting = sessionId === undefined ? undefined : open.get(sessionId)
      if (waiting !== undefined) {
        if (waiting.ref === ref) return { outcome: 'ask', ref, text: waiting.text, lines: waiting.lines, message: REQUEST_ASK_MESSAGE }
        return { code: 'busy', message: 'this session already has a request waiting for the human', hint: 'finish the open request first: the human\'s next message settles it' }
      }
      // Step 5a: a proposal shown since the human's last client message (design §5.3 step 5a): the tool-call block's name after the DeferredToolCall unwrap, its result not an error.
      const history = typeof agent.session?.deriveMessages === 'function' ? agent.session.deriveMessages() as readonly DerivedMessage[] : []
      const lastClient = lastIndexOf(history, entry => entry.role === 'user' && entry.source?.kind === 'user' && typeof entry.source?.rpcId === 'string')
      const proposalShown = history.slice(lastClient + 1).some(entry => {
        if (entry.role !== 'assistant') return false
        const calls = (entry.content ?? []).filter(block => block.type === 'tool-call')
        const names = calls.map(block => {
          if (block.name === 'DeferredToolCall') {
            const nested = typeof block.arguments === 'string' ? safeJson(block.arguments) : typeof block.arguments === 'object' && block.arguments !== null ? block.arguments as Record<string, unknown> : undefined
            return typeof nested?.name === 'string' ? nested.name : ''
          }
          return block.name ?? ''
        })
        if (names.includes('propose_to_human') === false) return false
        const id = calls.at(-1)?.id
        const result = id === undefined ? undefined : history.find(candidate => candidate.role === 'tool' && candidate.toolCallId === id)
        return result === undefined || result.isError !== true
      })
      if (proposalShown === true) return { code: 'busy', message: 'a proposal is already in front of the human', hint: 'end this reply with the proposals you showed; file the request after the human answers' }
      // Step 6: the target's facts, fresh (design §5.3 step 6); ENOENT means absent, another error is the degraded answer.
      let facts: { exists: boolean, size?: number | undefined, mtimeMs?: number | undefined }
      try {
        const info = await deps.fs.stat(refusal.target)
        facts = { exists: true, size: info.size, mtimeMs: info.mtimeMs }
      }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'ENOENT') facts = { exists: false }
        else return { code: 'unavailable', message: 'the target cannot be read', hint: `the target cannot be read (${code ?? 'error'}); tell the human in your reply` }
      }
      // Step 7: the plan text (design §5.4); a throw degrades to unavailable without registering or journaling (F18).
      try {
        const focusTitle = await deps.focusTitleOf(agent)
        const plan = buildPlan(deps, refusal, { purpose, reversibility, alternatives }, facts, cwd, focusTitle)
        const openRequest: OpenRequest = {
          ref,
          sessionId: sessionId ?? '',
          agent,
          rule: refusal.rule,
          tool: refusal.tool,
          args: refusal.args,
          signature: refusal.signature,
          dispatchRoot: refusal.dispatchRoot,
          target: refusal.target,
          facts,
          denied: deniedAgents.get(ref),
          via: refusal.via,
          text: plan.text,
          lines: plan.lines,
          tail: normalizeShown(plan.text),
          askedAt: deps.now().getTime(),
          unclear: 0,
          cwd,
        }
        if (sessionId !== undefined) {
          open.set(sessionId, openRequest)
          armTimer(openRequest)
        }
        journal({ ref, outcome: 'asked', sessionId, rule: refusal.rule, tool: refusal.tool, target: refusal.target }, 'request', cwd)
        return { outcome: 'ask', ref, text: plan.text, lines: plan.lines, message: REQUEST_ASK_MESSAGE }
      }
      catch (error) {
        const why = error instanceof Error ? error.message : String(error)
        if (sessionId !== undefined) deps.note(sessionId, 'request-note', `申报文字写不出（${why}）；改为在回复里直接告诉人`)
        deps.warn(`the plan text failed (${sessionId ?? 'no session'}): ${why}`)
        return { code: 'unavailable', message: 'the harness could not write the text for the human', hint: 'the harness could not write the text for the human; tell the human in your reply what you need and why' }
      }
    },

    async readReply(input) {
      const openRequest = open.get(input.session.id)
      if (openRequest === undefined) return undefined
      // By clock first: the timer may be gone (a restart, a disposed session); the step still closes it (§5.5 step 1).
      if (deps.now().getTime() - openRequest.askedAt > REQUEST_TTL_MS) return expire(openRequest)
      const client = input.admitted.find(entry => entry.role === 'user' && entry.source?.kind === 'user' && typeof entry.source?.rpcId === 'string')
      const clientText = client?.content?.map(block => block.text ?? '').join('') ?? ''
      if (client === undefined) {
        if (input.admitted.some(entry => entry.role === 'user' && entry.source?.kind === 'user') === true) {
          journal({ ref: openRequest.ref, outcome: 'not-client', sessionId: openRequest.sessionId, rule: openRequest.rule, tool: openRequest.tool, target: openRequest.target }, 'request', openRequest.cwd)
          return createUserNotice(REQUEST_SOURCE, `Request ${openRequest.ref} not from the client`, `The message after request ${openRequest.ref} did not come through the DSH client, so it cannot approve it; the request stays open.`, { request: { ref: openRequest.ref, outcome: 'open' } })
        }
        if (input.step === 1) {
          return createUserNotice(REQUEST_SOURCE, `Request ${openRequest.ref} still waits`, `Request ${openRequest.ref} still waits for the human. When you end this turn, put its text at the very end of your reply again, unchanged; the human's next message answers it.`, { request: { ref: openRequest.ref, outcome: 'open' } })
        }
        return undefined
      }
      // Step 3: the human read the request's text last (design §5.5 step 3): the last assistant message carries no tool-call block, its text ends with the tail, and no user message came between.
      const assistantAt = lastIndexOf(input.history, entry => entry.role === 'assistant')
      const lastAssistant = assistantAt < 0 ? undefined : input.history[assistantAt]
      const blocks = lastAssistant?.content ?? []
      const hasCalls = blocks.some(block => block.type === 'tool-call')
      const shown = blocks.map(block => block.text ?? '').join('')
      const afterAssistant = lastAssistant === undefined ? [] : input.history.slice(assistantAt + 1)
      const between = afterAssistant.some(entry => entry.role === 'user' && entry.source?.kind === 'user')
      if (hasCalls === true || between === true || normalizeShown(shown).endsWith(openRequest.tail) === false) {
        journal({ ref: openRequest.ref, outcome: 'not-shown', sessionId: openRequest.sessionId, rule: openRequest.rule, tool: openRequest.tool, target: openRequest.target, words: cutTo(clientText, 500) }, 'request', openRequest.cwd)
        return createUserNotice(REQUEST_SOURCE, `Request ${openRequest.ref} not approved`, `Request ${openRequest.ref} was not approved: the human had not just read its text (your last reply did not end with it). When you end this turn, put the text at the very end of your reply, unchanged; the human's next message answers it.`, { request: { ref: openRequest.ref, outcome: 'open' } })
      }
      // Step 4: the words (design §5.5 step 4).
      const words = normalizeWords(clientText)
      const cite = cutTo(clientText, 500)
      if (APPROVAL_WORDS.has(words) === true) {
        // Step 5: the grant (design §5.5 step 5); only the human's own client message lands here (§5.6 只认人).
        const grant: GrantEntry = {
          ref: openRequest.ref,
          rule: openRequest.rule,
          signature: openRequest.signature,
          root: openRequest.dispatchRoot,
          facts: openRequest.facts,
          decidedAt: deps.now().getTime(),
          expiresAt: deps.now().getTime() + GRANT_TTL_MS,
          words: cite,
        }
        deps.grants.add(grant)
        const messageId = typeof client.source?.rpcId === 'string' ? client.source.rpcId : undefined
        // The approval note (design §5.5): the tool and the arguments verbatim, the second line by who was denied.
        const argsJson = JSON.stringify({ tool: openRequest.tool, arguments: openRequest.args })
        const home = deps.projectHomeOf(openRequest.cwd)
        let where: string
        if (argsJson.length <= ARGS_INLINE_LIMIT) where = argsJson
        else if (home !== undefined) {
          const file = `${home.replaceAll('\\', '/')}/requests/${openRequest.ref}.call.json`
          try {
            await deps.fs.mkdir(join2(home, 'requests'), { recursive: true })
            await deps.fs.writeFile(file, JSON.stringify({ tool: openRequest.tool, arguments: openRequest.args }, undefined, 2))
            where = `the arguments are in ${file}; pass them verbatim`
          }
          catch (error) {
            deps.note(openRequest.sessionId, 'request-note', `放行的参数写不进 ${file}：${error instanceof Error ? error.message : String(error)}`)
            where = `the content must be exactly the content of the denied call (${openRequest.tool} on ${displayPath(openRequest.target)})`
          }
        }
        else {
          deps.note(openRequest.sessionId, 'request-note', '没有项目目录，放行的说明只写工具与目标')
          where = `the content must be exactly the content of the denied call (${openRequest.tool} on ${displayPath(openRequest.target)})`
        }
        const deniedElsewhere = openRequest.denied !== undefined && input.agent !== undefined && openRequest.denied.id !== input.agent.id
        const second = deniedElsewhere === false
          ? ''
          : openRequest.via === 'worker'
            ? `\nThe worker waits in ask_main with this ref: answer it with answer_worker, for example "The human approved request ${openRequest.ref}: make the identical call once now." If it has handed back already, dispatch the task again and tell the new worker with send_message to make exactly this call once.`
            : '\nIf you cannot write files (main agent), dispatch a subagent and give it these arguments verbatim; the approval covers your whole dispatch chain.'
        return closeWith(openRequest, 'approved', `The human approved request ${openRequest.ref} ("${cite}"). Make exactly this call once before ${clockOf(grant.expiresAt)}: ${where}.${second}`, cite, { by: 'human', via: 'chat', ...(messageId === undefined ? {} : { messageId }) })
      }
      if (DECLINE_WORDS.has(words) === true) {
        return closeWith(openRequest, 'declined', `The human declined request ${openRequest.ref} ("${cite}"). Do not retry this call; do the work inside the workspace, or ask them what to do instead.`, cite)
      }
      // Unclear: the confirmation sentence becomes the tail; the third unreadable reply closes the request (design §5.5 step 4).
      openRequest.unclear += 1
      if (openRequest.unclear >= 3) {
        return closeWith(openRequest, 'closed', `Request ${openRequest.ref} was closed: the human's replies stayed unclear. Make the denied call again for a fresh ref and file the request from the start.`, cite)
      }
      const name = openRequest.target.replaceAll('\\', '/').split('/').at(-1) ?? openRequest.target
      const confirm = `放行这一次写 ${name}，可以吗？（回「可以」才算数）`
      openRequest.tail = normalizeShown(confirm)
      journal({ ref: openRequest.ref, outcome: 'unclear', sessionId: openRequest.sessionId, rule: openRequest.rule, tool: openRequest.tool, target: openRequest.target, words: cite }, 'request', openRequest.cwd)
      return createUserNotice(REQUEST_SOURCE, `Request ${openRequest.ref} unclear`, `The human's reply is not a plain yes or no, so nothing is approved yet: "${cite}". Answer what they said; if they seem to want the write, end your reply with this line, unchanged: ${confirm}`, { request: { ref: openRequest.ref, outcome: 'open' } })
    },

    expireDue(sessionId) {
      const openRequest = open.get(sessionId)
      if (openRequest === undefined || deps.now().getTime() - openRequest.askedAt <= REQUEST_TTL_MS) return Promise.resolve(undefined)
      return Promise.resolve(expire(openRequest))
    },

    lapseOrphans(agent, history) {
      // One scan per agent (design §5.5 step 6): the asks of this process the restart cannot answer.
      if (lapsed.has(agent) === true) return undefined
      lapsed.add(agent)
      const asks: string[] = []
      for (const entry of history) {
        if (entry.role !== 'tool' || entry.isError === true) continue
        const text = textOf(entry)
        if (text.includes('"outcome":"ask"') === false) continue
        const match = /"ref":"(r-[0-9a-z]{8})"/.exec(text)
        if (match !== null) asks.push(match[1])
      }
      if (asks.length === 0) return undefined
      const settled = new Set<string>()
      for (const entry of history) {
        if (entry.role !== 'user' || entry.source?.kind !== REQUEST_SOURCE) continue
        const request = entry.source.request
        if (typeof request === 'object' && request !== null && typeof (request as Record<string, unknown>).ref === 'string') settled.add((request as Record<string, unknown>).ref as string)
      }
      const orphans = asks.filter(ref => settled.has(ref) === false)
      if (orphans.length === 0) return undefined
      const lines = orphans.map(ref => `Request ${ref} lapsed: DSH or the plugin restarted, so the human's answer can no longer approve it. If the write is still needed, make the denied call again for a fresh ref.`)
      return createUserNotice(REQUEST_SOURCE, 'Open requests lapsed', lines.join('\n'), { request: { ref: orphans[0], outcome: 'lapsed' } })
    },

    async prepareGrant(call, base, grant, cwd) {
      // The use-time check (design §5.6): the target's facts now, against the ones the plan text stated.
      const target = targetOf(call, base)
      if (target === undefined) return { kind: 'void', reason: 'the call names no file target' }
      let facts: { exists: boolean, size?: number, mtimeMs?: number }
      try {
        const info = await deps.fs.stat(target)
        facts = { exists: true, size: info.size, mtimeMs: info.mtimeMs }
      }
      catch {
        facts = { exists: false }
      }
      const changed = facts.exists !== grant.facts.exists
        || (facts.exists === true && grant.facts.exists === true && (facts.size !== grant.facts.size || Math.abs((facts.mtimeMs ?? 0) - (grant.facts.mtimeMs ?? 0)) > 1))
      if (changed === true) {
        const what = facts.exists !== grant.facts.exists ? 'it is gone or appeared' : facts.size !== grant.facts.size ? 'its size changed' : 'it was modified after the approval'
        deps.grants.void(grant.ref)
        return { kind: 'void', reason: what }
      }
      // The backup (design §5.6): whenever the target exists, is at most 10 MiB and the project has a home — regardless of what the text said.
      if (facts.exists === true && (facts.size ?? 0) <= BACKUP_LIMIT) {
        const home = deps.projectHomeOf(cwd)
        if (home !== undefined) {
          const file = `${home.replaceAll('\\', '/')}/requests/${grant.ref}.before`
          try {
            await deps.fs.mkdir(join2(home, 'requests'), { recursive: true })
            await deps.fs.copyFile(target, file)
            grant.backupPath = file
            return { kind: 'ready' }
          }
          catch (error) {
            return { kind: 'backup-failed', reason: error instanceof Error ? error.message : String(error) }
          }
        }
      }
      return { kind: 'ready' }
    },

    service: {
      outsideDenial: call => registerOutside(call),
      peekGrant(call) {
        const signature = signatureOf(call.tool, call.args, call.base)
        const root = deps.dispatchRootOf(call.agent)
        return root !== undefined && root !== '' && deps.grants.find(signature, root) !== undefined
      },
      openRequests(sessionId) {
        const openRequest = open.get(sessionId)
        return openRequest === undefined ? [] : [{ ref: openRequest.ref, askedAt: new Date(openRequest.askedAt).toISOString(), target: openRequest.target }]
      },
    },

    dispose() {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
      open.clear()
    },
  }

  // The worker's sentence for an outer gate (design §5.9's F19 judgment): the
  // target's nearest existing directory decides its project. A target in the
  // caller's own project — same root, or under the caller's project root — is
  // not asked about; neither is one a configured containment root holds. Only
  // a target outside the project (another project, or none) gets a ref.
  function registerOutside(call: { readonly agent: AgentLike, readonly tool: string, readonly args: Readonly<Record<string, unknown>>, readonly base: string, readonly task?: string }): { readonly ref: string, readonly exception: string } | undefined {
    try {
      const spelled = typeof call.args.file_path === 'string' ? call.args.file_path : typeof call.args.path === 'string' ? call.args.path : undefined
      if (spelled === undefined) return undefined
      const target = resolve(call.base, spelled)
      // projectOf walks the real file system (the nearest .git above), so the nearest existing directory check rides on it.
      const rootTarget = projectOf(target)?.root
      const rootBase = projectOf(call.base)?.root
      if (rootBase !== undefined && (rootTarget === rootBase || normalizeInside(rootBase, target) === true)) return undefined
      const roots = deps.rootsOf(call.agent)
      if (roots !== undefined && roots.some(root => normalizeInside(root, target) === true)) return undefined
      const registered = registerDenied({ agent: call.agent, call: { name: call.tool, arguments: call.args as JsonValue }, base: call.base, target, rule: 'workspace-containment', via: 'worker' })
      return { ref: registered.ref, exception: exceptionOf('worker', registered.ref) }
    }
    catch {
      return undefined
    }
  }

  return desk
}

/** The target argument of a file-tool call, for the use-time stat. */
const targetOf = (call: ToolCall, base: string | undefined): string | undefined => {
  const args = argsRecordOf(call.arguments)
  const spelled = typeof args.file_path === 'string' ? args.file_path : typeof args.path === 'string' ? args.path : undefined
  return spelled === undefined ? undefined : resolve(base ?? '.', spelled)
}

/** Whether a path sits inside a root (the containment reading, normalizePath). */
const normalizeInside = (root: string, path: string): boolean => {
  const p = path.replaceAll('\\', '/').toLowerCase()
  const r = root.replaceAll('\\', '/').toLowerCase().replace(/\/+$/, '')
  return p === r || p.startsWith(`${r}/`)
}

/** The join the desk uses for the project home's requests directory (forward slashes on every platform). */
const join2 = (home: string, leaf: string): string => `${home.replaceAll('\\', '/').replace(/\/+$/, '')}/${leaf}`

/** The JSON object of a tool-call block's arguments text, or undefined. */
const safeJson = (text: string): Record<string, unknown> | undefined => {
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined
  }
  catch {
    return undefined
  }
}

/** The reader of the service the guard row provides (design §5.9): undefined when the row is not loaded or a member has the wrong shape, the problem named once. */
export function requestsService(ctx: ServiceLookup, problem?: (message: string) => void): RequestsService | undefined {
  let warned = false
  const say = (message: string): void => {
    if (warned === true || problem === undefined) return
    warned = true
    problem(message)
  }
  const value: unknown = typeof ctx.get === 'function' ? ctx.get(REQUESTS_SERVICE) : undefined
  if (value === null || typeof value !== 'object') return undefined
  const candidate = value as Partial<RequestsService>
  if (typeof candidate.peekGrant !== 'function' || typeof candidate.openRequests !== 'function' || typeof candidate.outsideDenial !== 'function') {
    say(`service "${REQUESTS_SERVICE}" has the wrong shape`)
    return undefined
  }
  return candidate as RequestsService
}
