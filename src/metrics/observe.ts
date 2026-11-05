/**
 * The metrics row's own observers over the rc.3 seams (metrics design §6.1):
 * the `llm/stream` waterfall wraps the stream and reads it without changing
 * a chunk, the per-agent `agent/request` and `agent/request-error`
 * waterfalls give a step its `(turn, step)` and its retry count, the session
 * log's events fold into `turn`, `tool`, `approval`, `command` and `said`,
 * and the `user-questions/request` waterfall counts a DSH native question.
 * Every seam is observe-only: a fault of the observation is caught, counted
 * and warned about once, and the stream, the result or the answer is handed
 * back exactly as it came (§9.2; §9.5's "observation does not change
 * behavior").
 *
 * Field readings (§4.1, §4.3): a session event's `at` is the event's own
 * time; the `llm` of one step carries that step's `(turn, step)` and its
 * `agent/request-error` count, and a call with a `purpose` (compaction,
 * session title) belongs to no step; a `tool`'s result is `ok`, or `denied`
 * when the result's error info names a rule, or `declined` when a
 * `rejected` or `cancelled` approval decided the same call, or `error`, and
 * `none` for a call that never got a result. Nothing here reads a file: the
 * project of a working directory, the path-hash key and the credit plan are
 * the row's (src/metrics/index.ts).
 */
import { createHash, createHmac } from 'node:crypto'
import { resolve } from 'node:path'
import type {
  AgentLike,
  AgentRequestErrorPayload,
  AgentRequestPayload,
  LlmStreamOptions,
  SessionEventLike,
  SessionLike,
  UserQuestionsAnswer,
  UserQuestionsRequest,
} from '../shared/dsh-min.ts'
import type { FinishReason, StreamChunk, TokenUsage } from '../shared/lm-min.ts'
import { asRecord } from '../shared/json.ts'
import { textUnits } from '../shared/text-units.ts'
import { toolCategory } from '../shared/tool-names.ts'
import type { UsagePricing } from '../shared/pricing.ts'
import type { QueuedEvent } from '../shared/metrics.ts'

/** Where an observed event happened: what the row resolves the project from (§3.3). */
export interface ObservedWhere {
  readonly sessionId?: string
  readonly dir?: string
}

/** The row's one sink: hands an event in and counts what has no project (§3.5). Never throws. */
export type ObservedSink = (event: QueuedEvent, where: ObservedWhere) => void

export interface MetricsObserveOptions {
  readonly record: ObservedSink
  /** One fault of the observation, for the row's health and console (§9.2). */
  readonly problem: (text: string) => void
  /** The clock of the non-session events' durations (ms, ttft, question waits). */
  readonly now: () => number
  /** The credit plan, read per `llm` (§4.3); undefined when glm-login is not there. */
  readonly pricing: () => UsagePricing | undefined
  /** The project root of a working directory, `undefined` when there is none (the repository's `projectOf`). */
  readonly rootOf: (cwd: string) => string | undefined
  /** The path-hash key of a project, when it is loaded (§4.3; the row loads it ahead of the first tool call). */
  readonly keyOf: (root: string) => string | undefined
}

/** The file tools whose target path the metrics journal hashes (§4.3; the argument fields are the guard's). */
const TARGET_FIELDS: ReadonlyMap<string, 'file_path' | 'path'> = new Map([
  ['write', 'file_path'], ['edit', 'file_path'], ['str_replace_editor', 'path'],
  ['read', 'file_path'], ['read_image', 'file_path'],
  ['Write', 'file_path'], ['Edit', 'file_path'], ['Read', 'file_path'],
  ['glob', 'path'], ['grep', 'path'], ['Glob', 'path'], ['Grep', 'path'],
])

/** The shell tools whose command text the metrics journal names the first word of (§4.3, the same fields the guard reads). */
const SHELL_FIELDS: ReadonlyMap<string, 'command' | 'text'> = new Map([
  ['pwsh', 'command'], ['bash', 'command'], ['terminal_send', 'text'], ['Bash', 'command'],
])

/** Sessions the step state and the pending tables remember; the oldest leaves first (the guard's limit). */
const SESSION_LIMIT = 64

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function idShaped(value: string): boolean {
  return /^[A-Za-z0-9_.:@+/-]{1,120}$/.test(value)
}

/** The outcomes a decided approval can name (metrics design §4.2, F14). */
const APPROVAL_OUTCOMES: readonly string[] = ['allowed-once', 'rejected', 'cancelled', 'unavailable']

/** The instant of a session event, as the envelope carries it (§4.1). */
function atOf(event: SessionEventLike): string {
  return new Date(event.time).toISOString()
}

/** The usage fields of one stream, each count only when it is a non-negative finite number (§9.4). */
function usageOf(usage: TokenUsage | undefined): Partial<Record<'input' | 'output' | 'cacheRead' | 'cacheWrite' | 'reasoning' | 'total', number>> {
  if (usage === undefined) return {}
  const fields = {
    input: count(usage.inputTokens),
    output: count(usage.outputTokens),
    cacheRead: count(usage.cacheReadTokens),
    cacheWrite: count(usage.cacheWriteTokens),
    reasoning: count(usage.reasoningTokens),
    total: count(usage.totalTokens),
  }
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))
}

function finOf(reason: FinishReason | undefined, failed: boolean): 'stop' | 'tool-calls' | 'max-tokens' | 'aborted' | 'error' | 'none' | 'other' {
  if (failed) return 'error'
  if (reason === undefined) return 'none'
  if (reason.kind === 'stop' || reason.kind === 'tool-calls' || reason.kind === 'max-tokens' || reason.kind === 'aborted' || reason.kind === 'error') return reason.kind
  return 'other'
}

/** The credits one call was charged, to four decimals, when the plan prices the model (§4.3). */
function creditsOf(plan: UsagePricing, model: string, usage: TokenUsage, atMs: number, problem: (text: string) => void): number | undefined {
  try {
    const charged = count(plan.charged(model, usage, atMs))
    return charged === undefined ? undefined : Number(charged.toFixed(4))
  }
  catch (error) {
    problem(`pricing failed for a model call: ${(error as Error).message}`)
    return undefined
  }
}

function peakOf(plan: UsagePricing, atMs: number, problem: (text: string) => void): boolean | undefined {
  try {
    return plan.peak(atMs)
  }
  catch (error) {
    problem(`pricing peak failed for a model call: ${(error as Error).message}`)
    return undefined
  }
}

/** The path the metrics journal hashes for a file tool's target: inside the project relative, outside absolute, forward slashes, lowercased on Windows (§4.3). */
function targetPathOf(root: string, cwd: string | undefined, raw: string): string {
  let absolute: string | undefined
  try {
    absolute = resolve(cwd ?? root, raw)
  }
  catch {
    absolute = undefined
  }
  const inside = absolute !== undefined && (absolute === root || absolute.startsWith(`${root}\\`) || absolute.startsWith(`${root}/`))
  const path = inside ? (absolute as string).slice(root.length + 1) : absolute ?? raw
  const forward = path.replaceAll('\\', '/')
  return process.platform === 'win32' ? forward.toLowerCase() : forward
}

/** The HMAC-SHA-256 digest (12 hex digits) of a hashed path under one project's key (§4.3). */
function hashTarget(key: string, path: string): string {
  return createHmac('sha256', Buffer.from(key, 'hex')).update(path, 'utf8').digest('hex').slice(0, 12)
}

/** The `id` a question request is counted under: the first question's own id when it is id-shaped, else `x-` plus 12 hex digits of its SHA-256 (§9.4). */
function questionIdOf(questions: readonly unknown[]): string | undefined {
  const id = text(asRecord(questions[0]).id)
  if (id === undefined) return undefined
  return idShaped(id) ? id : `x-${createHash('sha256').update(id, 'utf8').digest('hex').slice(0, 12)}`
}

/** The shell command's first word, when it is worth naming (§4.3): letters, digits and `._-`, at most 24 characters, no run of six digits, no hex run of sixteen; anything else, an assignment start included, is `other`. */
function firstWordOf(command: unknown): string | undefined {
  if (typeof command !== 'string') return undefined
  const word = command.trim().split(/\s+/)[0] ?? ''
  const first = word.replace(/\.(exe|cmd)$/i, '').toLowerCase()
  if (first.length === 0 || first.length > 24 || !/^[A-Za-z0-9._-]+$/.test(first) || /\d{6}/.test(first) || /^[0-9a-f]{16,}$/.test(first)) return 'other'
  return first
}

/** One tool call waiting for its result, as `tool/call` recorded it. */
interface CallStarted {
  readonly turn: number
  readonly step: number
  readonly name: string
  readonly time: number
  readonly path?: string
  readonly cmd?: string
}

export interface MetricsObserver {
  /** The `llm/stream` listener: wraps `next()`, hands every chunk through unchanged, and records one `llm` when the stream ends, fails or is dropped. */
  onStream(options: LlmStreamOptions, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk>
  /** The per-agent `agent/request` listener, installed on `agent.ctx`: remembers the step's `(turn, step)`. */
  trackRequests(agent: AgentLike): () => void
  /** The per-agent `agent/request-error` listener: counts the step's retries into the next `llm` of the session. */
  trackRetries(agent: AgentLike): () => void
  /** The `session/event` listener: queues the event and folds it a microtask later. */
  onEvent(session: SessionLike, event: SessionEventLike): void
  /** The `session/disposed` listener: forgets the session's pending tables. */
  onDisposed(session: SessionLike): void
  /** The `user-questions/request` listener: records `ask` at entry and `answer` at settlement, and hands the result or the error through unchanged. */
  onQuestions(request: UserQuestionsRequest, next: () => Promise<UserQuestionsAnswer>): Promise<UserQuestionsAnswer>
  /** Drop a session's step state, as `session/disposed` does for the pending tables. */
  forget(sessionId: string): void
}

/**
 * The row's observers over one process's seams. Everything a fold needs is
 * in the event and the session it arrived on; the project of an event and
 * its path hashes are the sink's and the two lookup functions'.
 */
export function createObserve(options: MetricsObserveOptions): MetricsObserver {
  const { record: sink, problem, now, pricing, rootOf, keyOf } = options
  /** The latest step of each agent (rc.3 agent and session share their id), from `agent/request`. */
  const steps = new Map<string, { readonly turn: number, readonly step: number }>()
  /** Retries counted per agent since its last `agent/request`, read by the next step's `llm`. */
  const retries = new Map<string, number>()
  /** Calls with no result yet, per session: `tool/call` started them, `tool/result` or a turn's edge finishes them. */
  const calls = new Map<string, Map<string, CallStarted>>()
  /** Approvals asked, per session, with the outcome once it is decided: a result's `declined` reads both. */
  const approvals = new Map<string, Map<string, { readonly call?: string, decided?: string }>>()
  /** Commands running, per session: `command/done` reads the name `command/run` recorded. */
  const commands = new Map<string, Map<string, string>>()
  /** Events waiting for their fold; the synchronous listener only queues them (§6.1). */
  const queued: Array<{ readonly session: SessionLike, readonly event: SessionEventLike }> = []
  let draining = false

  const bound = (sessionId: string): Map<string, CallStarted> => {
    let pending = calls.get(sessionId)
    if (pending === undefined) {
      if (calls.size >= SESSION_LIMIT) calls.delete(calls.keys().next().value as string)
      pending = new Map()
      calls.set(sessionId, pending)
    }
    return pending
  }

  const boundBy = <V>(map: Map<string, Map<string, V>>, sessionId: string): Map<string, V> => {
    let pending = map.get(sessionId)
    if (pending === undefined) {
      if (map.size >= SESSION_LIMIT) map.delete(map.keys().next().value as string)
      pending = new Map()
      map.set(sessionId, pending)
    }
    return pending
  }

  const safely = (body: () => void, what: string): void => {
    try {
      body()
    }
    catch (error) {
      problem(`${what} failed: ${(error as Error).message}`)
    }
  }

  const drain = (): void => {
    draining = false
    while (queued.length > 0) {
      const { session, event } = queued.shift() as { readonly session: SessionLike, readonly event: SessionEventLike }
      safely(() => fold(session, event), `the fold of a ${event.type} event`)
    }
  }

  /** The hashed target of a call's path, when the project and its key are there (§4.3). */
  function targetOf(where: ObservedWhere, path: string | undefined): string | undefined {
    if (path === undefined || where.dir === undefined) return undefined
    const root = rootOf(where.dir)
    const key = root === undefined ? undefined : keyOf(root)
    return key === undefined ? undefined : hashTarget(key, path)
  }

  function fold(session: SessionLike, event: SessionEventLike): void {
    const data = asRecord(event.data)
    const where: ObservedWhere = { sessionId: session.id, ...(session.header.cwd === undefined ? {} : { dir: session.header.cwd }) }
    switch (event.type) {
      case 'turn/start': {
        const turn = count(data.turn)
        if (turn !== undefined) sink({ k: 'turn', by: 'host', at: atOf(event), body: { turn, phase: 'start' } }, where)
        flushUnfinished(session.id, atOf(event), where)
        return
      }
      case 'turn/end': {
        const turn = count(data.turn)
        if (turn !== undefined) {
          const end = text(asRecord(data.reason).kind)
          sink({ k: 'turn', by: 'host', at: atOf(event), body: { turn, phase: 'end', ...(end === undefined ? {} : { end }) } }, where)
        }
        flushUnfinished(session.id, atOf(event), where)
        return
      }
      case 'tool/call': {
        const callId = text(data.callId)
        const turn = count(data.turn)
        const step = count(data.step)
        const name = text(data.name)
        if (callId === undefined || turn === undefined || step === undefined || name === undefined) return
        const args = argumentsOf(data.arguments)
        const field = TARGET_FIELDS.get(name)
        const raw = field === undefined ? undefined : args[field]
        const shell = SHELL_FIELDS.get(name)
        bound(session.id).set(callId, {
          turn, step, name, time: event.time,
          ...(field === undefined || typeof raw !== 'string' || raw.length === 0 || where.dir === undefined ? {} : { path: targetPathOf(rootOf(where.dir) ?? where.dir, where.dir, raw) }),
          ...(shell === undefined ? {} : { ...(firstWordOf(args[shell]) === undefined ? {} : { cmd: firstWordOf(args[shell]) as string }) }),
        })
        return
      }
      case 'tool/result': {
        const message = asRecord(data.message)
        const callId = text(message.toolCallId) ?? text(asRecord(message.source).callId)
        const turn = count(data.turn)
        const step = count(data.step)
        const pending = callId === undefined ? undefined : calls.get(session.id)?.get(callId)
        if (turn === undefined || step === undefined || pending === undefined || callId === undefined) return
        calls.get(session.id)?.delete(callId)
        const target = targetOf(where, pending.path)
        sink({
          k: 'tool', by: 'host', at: atOf(event),
          body: {
            turn, step, call: callId, name: pending.name, cat: toolCategory(pending.name),
            out: outcomeOf(session.id, callId, message.isError === true, data.error),
            ms: Math.max(0, event.time - pending.time),
            ...charsOf(message.content),
            ...(target === undefined ? {} : { target }),
            ...(pending.cmd === undefined ? {} : { cmd: pending.cmd }),
          },
        }, where)
        return
      }
      case 'approval/asked': {
        const id = text(data.id)
        if (id === undefined) return
        const asked: { call?: string, decided?: string } = { ...(text(data.callId) === undefined ? {} : { call: text(data.callId) as string }) }
        boundBy(approvals, session.id).set(id, asked)
        sink({
          k: 'approval', by: 'host', at: atOf(event),
          body: { id, phase: 'asked', ...(text(data.toolName) === undefined ? {} : { tool: text(data.toolName) as string }), ...(asked.call === undefined ? {} : { call: asked.call }) },
        }, where)
        return
      }
      case 'approval/decided': {
        const id = text(data.id)
        if (id === undefined) return
        const asked = approvals.get(session.id)?.get(id)
        const named = text(data.outcome)
        if (named !== undefined && !APPROVAL_OUTCOMES.includes(named)) problem(`an approval outcome the journal does not name: ${named}`)
        const outcome = named !== undefined && APPROVAL_OUTCOMES.includes(named) ? named as 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable' : undefined
        if (asked !== undefined && outcome !== undefined) asked.decided = outcome
        sink({
          k: 'approval', by: 'host', at: atOf(event),
          body: {
            id, phase: 'decided',
            ...(asked?.call === undefined ? {} : { call: asked.call }),
            ...(outcome === undefined ? {} : { outcome }),
          },
        }, where)
        return
      }
      case 'command/run': {
        const cid = text(data.commandId)
        const name = text(data.name)
        if (cid === undefined || name === undefined) return
        boundBy(commands, session.id).set(cid, name)
        sink({ k: 'command', by: 'host', at: atOf(event), body: { cid, name, phase: 'run' } }, where)
        return
      }
      case 'command/done': {
        const cid = text(data.commandId)
        const name = text(data.name) ?? (cid === undefined ? undefined : commands.get(session.id)?.get(cid))
        if (cid === undefined || name === undefined) return
        commands.get(session.id)?.delete(cid)
        const kind = text(data.kind)
        sink({
          k: 'command', by: 'host', at: atOf(event),
          body: { cid, name, phase: 'done', ...(kind === 'success' || kind === 'error' ? { result: kind } : {}) },
        }, where)
        return
      }
      case 'user/message': {
        const source = asRecord(data.source)
        if (source.kind !== 'user' || session.header.origin === 'subagent') return
        const content = Array.isArray(data.content) ? data.content : []
        let units = 0
        let attachments = 0
        for (const block of content) {
          const one = asRecord(block)
          if (one.type === 'text' && typeof one.text === 'string') units += textUnits(one.text)
          else if (one.type === 'image') attachments += 1
        }
        sink({ k: 'said', by: 'host', at: atOf(event), body: { units, attachments, source: 'user' } }, where)
        return
      }
      default:
        return
    }
  }

  /** A call's outcome (§6.1): `ok` when the result is not an error, `denied` when its error info names a rule, `declined` when a rejecting approval decided the call, else `error`. */
  function outcomeOf(sessionId: string, callId: string, isError: boolean, errorInfo: unknown): 'ok' | 'error' | 'denied' | 'declined' {
    if (!isError) return 'ok'
    if (typeof asRecord(errorInfo).rule === 'string' && (asRecord(errorInfo).rule as string).length > 0) return 'denied'
    const asked = approvals.get(sessionId)
    if (asked !== undefined) {
      for (const entry of asked.values()) if (entry.call === callId && (entry.decided === 'rejected' || entry.decided === 'cancelled')) return 'declined'
    }
    return 'error'
  }

  /** Calls still without a result at a turn's edges go out as `out: 'none'` (§6.1). */
  function flushUnfinished(sessionId: string, at: string, where: ObservedWhere): void {
    const pending = calls.get(sessionId)
    if (pending === undefined || pending.size === 0) return
    for (const [callId, call] of pending) {
      pending.delete(callId)
      const target = targetOf(where, call.path)
      sink({
        k: 'tool', by: 'host', at,
        body: {
          turn: call.turn, step: call.step, call: callId, name: call.name, cat: toolCategory(call.name), out: 'none',
          ...(target === undefined ? {} : { target }),
          ...(call.cmd === undefined ? {} : { cmd: call.cmd }),
        },
      }, where)
    }
  }

  function argumentsOf(raw: unknown): Record<string, unknown> {
    if (typeof raw !== 'string') return asRecord(raw)
    try {
      return asRecord(JSON.parse(raw))
    }
    catch {
      return {}
    }
  }

  function charsOf(content: unknown): { chars?: number } {
    if (!Array.isArray(content)) return {}
    let chars = 0
    for (const block of content) {
      const one = asRecord(block)
      if (one.type === 'text' && typeof one.text === 'string') chars += one.text.length
    }
    return chars === 0 ? {} : { chars }
  }

  /** The `llm` of one stream: usage fields that are counts, the finish reason, the step and its retries, and the plan's credits and peak. */
  function recordStream(call: LlmStreamOptions, read: {
    readonly startedAt: number
    readonly ttft: number | undefined
    readonly usage: TokenUsage | undefined
    readonly finish: FinishReason | undefined
    readonly failed: boolean
    readonly callsOut: number
    readonly textOut: number
  }): void {
    const step = call.purpose === undefined && call.sessionId !== undefined ? steps.get(call.sessionId) : undefined
    const retryCount = call.purpose === undefined && call.sessionId !== undefined ? retries.get(call.sessionId) : undefined
    if (call.purpose === undefined && call.sessionId !== undefined) retries.set(call.sessionId, 0)
    const atMs = now()
    let plan: UsagePricing | undefined
    safely(() => { plan = pricing() }, 'the read of the pricing service')
    const usage = usageOf(read.usage)
    const credits = read.usage !== undefined && plan !== undefined ? creditsOf(plan, call.model, read.usage, atMs, problem) : undefined
    const peak = plan !== undefined ? peakOf(plan, atMs, problem) : undefined
    sink({
      k: 'llm', by: 'host',
      body: {
        ...(step === undefined || step.turn === 0 ? {} : { turn: step.turn, step: step.step }),
        provider: call.provider,
        model: call.model,
        ...(call.purpose === undefined ? {} : { purpose: call.purpose }),
        ...usage,
        ms: Math.max(0, atMs - read.startedAt),
        ...(read.ttft === undefined ? {} : { ttft: read.ttft }),
        fin: finOf(read.finish, read.failed),
        calls: read.callsOut,
        text: read.textOut,
        ...(retryCount === undefined || retryCount === 0 ? {} : { retries: retryCount }),
        ...(credits === undefined ? {} : { credits }),
        ...(peak === undefined ? {} : { peak }),
      },
    }, call.sessionId === undefined ? {} : { sessionId: call.sessionId })
  }

  /** The label the human picked, when the answer names one and it is an id (§4.2). */
  function pickOf(answer: UserQuestionsAnswer): string | undefined {
    if (!('answers' in answer) || !Array.isArray(answer.answers)) return undefined
    const first = asRecord(answer.answers[0])
    const selected = Array.isArray(first.selected) ? text(first.selected[0]) : undefined
    return selected !== undefined && idShaped(selected) ? selected : undefined
  }

  return {
    onStream(call: LlmStreamOptions, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> {
      const startedAt = now()
      let ttft: number | undefined
      let usage: TokenUsage | undefined
      let finish: FinishReason | undefined
      let failed = false
      let callsOut = 0
      let textOut = 0
      return (async function* () {
        try {
          for await (const chunk of next()) {
            if (ttft === undefined && (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta' || chunk.type === 'tool-call-delta')) ttft = Math.max(0, now() - startedAt)
            if (chunk.type === 'usage') usage = chunk.usage
            if (chunk.type === 'finish') finish = chunk.reason
            if (chunk.type === 'block-end') {
              if (chunk.block.type === 'tool-call') callsOut += 1
              else if (chunk.block.type === 'text') textOut += textUnits(chunk.block.text)
            }
            yield chunk
          }
        }
        catch (error) {
          failed = true
          throw error
        }
        finally {
          safely(() => recordStream(call, { startedAt, ttft, usage, finish, failed, callsOut, textOut }), 'the record of a model call')
        }
      })()
    },

    trackRequests(agent: AgentLike): () => void {
      return agent.ctx.on('agent/request', (payload: AgentRequestPayload, next: () => Promise<unknown>) => {
        safely(() => {
          steps.set(agent.id, { turn: count(payload.turn) ?? 0, step: count(payload.step) ?? 0 })
          retries.set(agent.id, 0)
          if (steps.size > SESSION_LIMIT) {
            const oldest = steps.keys().next().value as string
            steps.delete(oldest)
            retries.delete(oldest)
          }
        }, 'the step tracker')
        return next()
      })
    },

    trackRetries(agent: AgentLike): () => void {
      return agent.ctx.on('agent/request-error', (_payload: AgentRequestErrorPayload, next: () => Promise<unknown>) => {
        safely(() => { retries.set(agent.id, (retries.get(agent.id) ?? 0) + 1) }, 'the retry counter')
        return next()
      })
    },

    onEvent(session: SessionLike, event: SessionEventLike): void {
      queued.push({ session, event })
      if (!draining) {
        draining = true
        queueMicrotask(drain)
      }
    },

    onDisposed(session: SessionLike): void {
      safely(() => {
        calls.delete(session.id)
        approvals.delete(session.id)
        commands.delete(session.id)
        steps.delete(session.id)
        retries.delete(session.id)
      }, 'the disposal of a session')
    },

    async onQuestions(request: UserQuestionsRequest, next: () => Promise<UserQuestionsAnswer>): Promise<UserQuestionsAnswer> {
      const sessionId = request.agent?.session?.id
      const where: ObservedWhere = sessionId === undefined ? {} : { sessionId }
      const startedAt = now()
      const questions = Array.isArray(request.questions) ? request.questions : undefined
      const id = questions === undefined ? undefined : questionIdOf(questions)
      if (id === undefined) {
        problem('a question request whose questions are not a list with string ids is not recorded')
        return next()
      }
      let qs = 0
      let opts = 0
      let units = 0
      for (const one of questions ?? []) {
        const question = asRecord(one)
        if (typeof question.question === 'string') {
          qs += 1
          units += textUnits(question.question)
        }
        if (Array.isArray(question.options)) {
          for (const option of question.options) {
            const label = asRecord(option).label
            if (typeof label === 'string') {
              opts += 1
              units += textUnits(label)
            }
          }
        }
      }
      safely(() => sink({ k: 'ask', by: 'host', body: { q: id, qs, opts, units } }, where), 'the record of a question request')
      try {
        const answer = await next()
        const pick = pickOf(answer)
        safely(() => sink({
          k: 'answer', by: 'host',
          body: { q: id, ms: Math.max(0, now() - startedAt), end: 'answered', ...(pick === undefined ? {} : { pick }) },
        }, where), 'the record of a question answer')
        return answer
      }
      catch (error) {
        const code = asRecord(error).code
        const end = code === 'NO_PROVIDER'
          ? 'no-provider'
          : code === 'ASK_TIMED_OUT'
            ? 'timed-out'
            : code === 'ASK_ABORTED' || request.signal?.aborted === true ? 'aborted' : 'error'
        safely(() => sink({ k: 'answer', by: 'host', body: { q: id, ms: Math.max(0, now() - startedAt), end } }, where), 'the record of a question failure')
        throw error
      }
    },

    forget(sessionId: string): void {
      steps.delete(sessionId)
      retries.delete(sessionId)
    },
  }
}
