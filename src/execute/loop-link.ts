/**
 * The execute row's seam to the loop board (M7 design 0.6 §2.5 points 1–7):
 * the runtime half of the tables in src/execute/entries.ts.
 *
 * - `attach` hands the events, the seven entries and the harness actions to
 *   the board (`contribute`) and records, per entry, who executes it: the
 *   board when the hand-over came back `ok`, the entry is in `accepted` and
 *   the service's shape matched; this row otherwise (§2.5 point 4).
 * - `runAction` is `glmHournessExecute.runAction` and the board's `run`:
 *   it never throws and its promise is never rejected; an unknown action, a
 *   key the board would refuse, the payload of one of the row's events that
 *   its declaration refuses, a project that is not the root of a git
 *   repository and a graph that does not load are `failed` with the reason.
 *   An event of another row (the loop row's peak end, which runs
 *   `execute.resume-drive`) is checked by its key only. Every run appends a
 *   `start` line and an `end` line to `<exec>/actions.jsonl` (the claim
 *   other DSH processes see).
 * - `emit` hands one event over on a hot path: one key once per process; the
 *   promise is not awaited. Entries this row executes run in the fallback at
 *   once; a board-run harness entry gets a pending claim the watchdog reads
 *   back from actions.jsonl after five minutes; `duplicate` reruns an action
 *   another process left half-done; `unheard` and `ok: false` run the
 *   listening entries here (D16, §2.5 point 4).
 * - The fallback executor runs one entry the way the board would: a
 *   `tell-main` text with its `{name}`s filled from the payload, or the
 *   harness action and its tell. The notice goes to the project's holder
 *   (`glm-hourness-loop`, steer / inject / followup through
 *   src/rules/wake.ts); a holder that is not live here keeps it in memory
 *   until its next step (`flushHeld`). It dedupes by the event key and does
 *   not debounce (D15).
 * - `replayInterrupted` runs again the actions whose `start` line has no
 *   `end` and was written by another process (§3.9.6 step 7).
 * - `notes` are the row-health lines of §2.5 point 7.
 */
import { randomBytes } from 'node:crypto'
import { open, readFile, rename, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { holderHome, mainAgentOf } from '../graph/main-agent-holder.ts'
import { projectOf } from '../data/project-root.ts'
import { keyFaultOf, payloadFaultOf } from '../loops/inbox.ts'
import type { LoopEntryDefinition } from '../loops/model.ts'
import type { Contribution, HarnessResult, LoopEventRecord, LoopsService } from '../loops/service.ts'
import { deliver } from '../rules/wake.ts'
import { createUserNotice, type ServiceLookup, type UserNotice } from '../shared/dsh-min.ts'
import { stopDraftOf } from './asks.ts'
import type { GraphCache } from './dispatch.ts'
import { EXECUTE_ACTIONS, EXECUTE_ENTRIES, EXECUTE_EVENTS } from './entries.ts'
import { ensureExecDir } from './gate-lock.ts'
import { emitMetric } from './metrics.ts'

/** This process, as the claim lines and drive.jsonl name it (§2.5 point 2, §3.9.1). */
export const PROC = Math.round(performance.timeOrigin)

const SOURCE = { plugin: 'dsh-hourness', row: 'glm-hourness/execute' } as const
const CLAIM_MS = 5 * 60_000
const WATCH_MS = 30_000
const DAY_MS = 24 * 3_600_000
const ACTIONS_ROTATE_BYTES = 8 * 1024 * 1024
/** How long one run of an action may take before its lone `start` counts as abandoned (§2.5 point 5). */
const maxMsOf = (action: string): number => action === 'execute.trunk-check' ? 6 * 3_600_000 : 10 * 60_000
const VALUE_POINTS = 200

/** One event as the row hands it over: the declared payload and the key of this one occurrence. */
export interface LoopEmit {
  readonly event: string
  readonly key: string
  readonly payload: Readonly<Record<string, unknown>>
}

export type LoopAction = (record: LoopEventRecord) => Promise<HarnessResult>

/** One row-health line; a note that does not degrade is information only (the board being absent). */
interface LoopNote {
  readonly text: string
  readonly degraded: boolean
}

export interface LoopLinkDeps {
  readonly lookup: ServiceLookup
  readonly execDir: (projectRoot: string) => string
  readonly graphDirOfRoot: (root: string) => string
  readonly cache: GraphCache
  readonly report: (sessionId: string | undefined, state: 'active' | 'degraded', reason: string) => void
  /** The harness actions this row runs, by id. */
  readonly actions: Readonly<Record<string, LoopAction>>
  /** The row-health notes changed; the row reactivates its health. */
  readonly notesChanged: () => void
  readonly now?: () => Date
  /** A timer that runs once and never holds the host open. */
  readonly delay?: (run: () => void, ms: number) => () => void
}

export interface LoopLink {
  readonly contribution: Contribution
  /** Hand the tables over to this service (undefined: the board is absent, or its shape is wrong when `problem` says so). The disposer withdraws the hand-over. */
  attach(service: LoopsService | undefined, problem?: string): () => void
  runAction(action: string, record: LoopEventRecord): Promise<HarnessResult>
  emit(project: string, sessionId: string | undefined, event: LoopEmit): void
  /** Deliver the notices kept for this holder session while it was not live. */
  flushHeld(sessionId: string | undefined): void
  /** Run again the actions another process started and never ended; the count. */
  replayInterrupted(project: string): Promise<number>
  /** Whether the board took the hand-over: it is the one that should run the row's harness actions. */
  boardAttached(): boolean
  notes(): readonly LoopNote[]
  dispose(): void
}

interface ActionLine {
  readonly action: string
  readonly key: string
  readonly event?: string
  readonly payload?: Readonly<Record<string, unknown>>
  readonly at: string
  readonly proc: number
  readonly phase: 'start' | 'end'
  readonly outcome?: string
}

interface Claim {
  readonly entry: LoopEntryDefinition
  readonly action: string
  readonly record: LoopEventRecord
  readonly sessionId: string | undefined
  readonly emittedAt: number
}

type Attachment =
  | { readonly kind: 'absent' }
  | { readonly kind: 'mismatch', readonly problem: string }
  | { readonly kind: 'refused', readonly service: LoopsService, readonly reason: string }
  | { readonly kind: 'board', readonly service: LoopsService, readonly accepted: ReadonlySet<string>, readonly dropped: readonly { readonly id: string, readonly reason: string }[], readonly dispose: () => void }

interface Takeover {
  readonly at: number
  readonly text: string
}

const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error)
const sameDir = (a: string, b: string): boolean => resolve(a).toLowerCase() === resolve(b).toLowerCase()
const cut = (value: unknown): string => [...typeof value === 'string' ? value : JSON.stringify(value) ?? ''].slice(0, VALUE_POINTS).join('')
const actionTitle = (action: string): string => EXECUTE_ACTIONS.find(entry => entry.id === action)?.title ?? action
const listening = (event: string): readonly LoopEntryDefinition[] => EXECUTE_ENTRIES.filter(entry => entry.when.kind === 'event' && entry.when.events.includes(event))

/** A `{name}` of an entry's text, filled from the payload: a string as is, a list joined with `, `, each value at most 200 code points. */
function fill(text: string, payload: Readonly<Record<string, unknown>>): string {
  return text.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (whole, name: string) => {
    const value = payload[name]
    if (value === undefined) return whole
    return Array.isArray(value) ? value.map(item => cut(item)).join(', ') : cut(value)
  })
}

/** The action lines of one project; a line that does not parse is skipped. */
async function readActions(execDir: string): Promise<ActionLine[]> {
  const text = await readFile(join(execDir, 'actions.jsonl'), 'utf8').catch(() => '')
  return text.split('\n').flatMap((line) => {
    if (line.trim() === '') return []
    try {
      const value = JSON.parse(line) as Partial<ActionLine>
      return typeof value.action === 'string' && typeof value.key === 'string' && typeof value.at === 'string' && typeof value.proc === 'number' && (value.phase === 'start' || value.phase === 'end') ? [value as ActionLine] : []
    }
    catch {
      return []
    }
  })
}

/** Append one line, synced; the file is renamed aside above 8 MiB (§12 of the design's runtime table). */
async function appendAction(execDir: string, line: ActionLine, now: Date): Promise<void> {
  await ensureExecDir(execDir)
  const file = join(execDir, 'actions.jsonl')
  const size = await stat(file).then(info => info.size, () => 0)
  if (size > ACTIONS_ROTATE_BYTES) await rename(file, join(execDir, `actions-${now.toISOString().replace(/[:.]/g, '-')}.jsonl`))
  const handle = await open(file, 'a')
  try {
    await handle.write(`${JSON.stringify(line)}\n`)
    await handle.sync()
  }
  finally {
    await handle.close()
  }
}

/**
 * The `execute.stop-draft` action (§3.7.4): the stop of the event, and of
 * every event the board merged into it, as the tell the holder reads;
 * `skipped` when nothing stopped there. Read-only, so a rerun is harmless.
 */
export function stopDraftAction(cache: GraphCache, graphDirOfRoot: (root: string) => string): LoopAction {
  return async (record) => {
    const graph = await cache.load(graphDirOfRoot(record.project))
    const texts = [record, ...record.merged].flatMap((item) => {
      const { node, kind, rounds } = item.payload
      if (typeof node !== 'string' || typeof kind !== 'string' || typeof rounds !== 'number') return []
      const text = stopDraftOf(graph, { node, kind, rounds })
      return text === undefined ? [] : [text]
    })
    return texts.length === 0 ? { outcome: 'skipped', reason: 'nothing stopped there' } : { outcome: 'done', tell: texts.join('\n\n') }
  }
}

/** A timer that runs once and never holds the host open; the returned function cancels it. */
export function unrefDelay(run: () => void, ms: number): () => void {
  const timer = setTimeout(run, ms)
  timer.unref()
  return () => { clearTimeout(timer) }
}

export function createLoopLink(deps: LoopLinkDeps): LoopLink {
  const now = deps.now ?? ((): Date => new Date())
  const delay = deps.delay ?? unrefDelay
  let attachment: Attachment = { kind: 'absent' }
  const emitted = new Set<string>()
  const replayed = new Set<string>()
  const claims = new Map<string, Claim>()
  const held = new Map<string, UserNotice[]>()
  let takeovers: Takeover[] = []
  let cancelWatch: (() => void) | undefined
  let disposed = false

  const executor = (entry: string): 'board' | 'self' => attachment.kind === 'board' && attachment.accepted.has(entry) ? 'board' : 'self'
  const serviceOf = (): LoopsService | undefined => attachment.kind === 'board' || attachment.kind === 'refused' ? attachment.service : undefined

  function withdraw(): void {
    if (attachment.kind === 'board') {
      try {
        attachment.dispose()
      }
      catch (error) {
        deps.report(undefined, 'degraded', `从循环板撤回执行行的条目时出错：${errorText(error)}`)
      }
    }
    attachment = { kind: 'absent' }
  }

  function takeover(text: string): void {
    takeovers = [...takeovers.filter(item => now().getTime() - item.at < DAY_MS), { at: now().getTime(), text }]
    deps.notesChanged()
  }

  /** Put the notice in front of the project's holder, or keep it for the holder's next step. */
  function tell(record: LoopEventRecord, entry: LoopEntryDefinition, text: string, sessionId: string | undefined): void {
    const holder = mainAgentOf(holderHome(deps.lookup), deps.graphDirOfRoot(record.project))
    if (holder === undefined) {
      deps.report(sessionId, 'degraded', `「${entry.title}」的提醒送不到主 Agent（${record.key}）：项目没有主 Agent 记录`)
      emitMetric({ event: 'execute.loop-entry', entry: entry.id, key: record.key, delivered: false })
      return
    }
    const notice = createUserNotice('glm-hourness-loop', entry.title, text, { hournessLoop: { entry: entry.id, key: record.key } })
    const way = deliver(deps.lookup, holder.sessionId, notice)
    if (way.kind === 'sent') {
      emitMetric({ event: 'execute.loop-entry', entry: entry.id, key: record.key, delivered: true })
      return
    }
    if (way.kind === 'failed') {
      deps.report(sessionId, 'degraded', `「${entry.title}」的提醒没送出（${record.key}）：${way.why}`)
      emitMetric({ event: 'execute.loop-entry', entry: entry.id, key: record.key, delivered: false })
      return
    }
    // The holder is not live in this process (or there is no registry yet): its next step gets it (§2.5 point 6).
    held.set(holder.sessionId, [...held.get(holder.sessionId) ?? [], notice])
    emitMetric({ event: 'execute.loop-entry', entry: entry.id, key: record.key, delivered: false, deferred: 'holder-not-live' })
  }

  /** The fallback executor: one entry, the way the board runs it (§2.5 point 6). */
  async function runEntry(entry: LoopEntryDefinition, record: LoopEventRecord, sessionId: string | undefined): Promise<void> {
    const action = entry.action
    let text: string | undefined
    if (action.kind === 'tell-main') text = fill(action.text, record.payload)
    else if (action.kind === 'harness') {
      const result = await runAction(action.action, record)
      if (result.outcome === 'done') text = result.tell ?? (action.tell === undefined ? undefined : fill(action.tell.text, record.payload))
      else if (result.outcome === 'failed') {
        deps.report(sessionId, 'degraded', `「${actionTitle(action.action)}」没跑完（${record.key}）：${result.reason}`)
        text = result.tell
      }
    }
    if (text === undefined) {
      emitMetric({ event: 'execute.loop-entry', entry: entry.id, key: record.key, delivered: false })
      return
    }
    tell(record, entry, text, sessionId)
  }

  const runInFallback = (entry: LoopEntryDefinition, record: LoopEventRecord, sessionId: string | undefined): void => {
    void runEntry(entry, record, sessionId).catch((error: unknown) => {
      deps.report(sessionId, 'degraded', `「${entry.title}」没执行完（${record.key}）：${errorText(error)}`)
    })
  }

  async function runAction(action: string, record: LoopEventRecord): Promise<HarnessResult> {
    try {
      const run = Object.hasOwn(deps.actions, action) ? deps.actions[action] : undefined
      if (run === undefined) return { outcome: 'failed', reason: `unknown action ${action}` }
      // An event of another row (the loop row's peak end calls execute.resume-drive) has no declaration here: only its key is checked.
      const declared = EXECUTE_EVENTS.find(event => event.id === record.event)
      const fault = keyFaultOf(record.event, record.key) ?? (declared === undefined ? undefined : payloadFaultOf(declared, record.payload))
      if (fault !== undefined) return { outcome: 'failed', reason: fault }
      const location = projectOf(record.project)
      if (location === undefined || !location.git || !sameDir(location.root, record.project)) return { outcome: 'failed', reason: `${record.project} is not the root of a git repository` }
      try {
        await deps.cache.load(deps.graphDirOfRoot(record.project))
      }
      catch (error) {
        return { outcome: 'failed', reason: `the project graph cannot be read: ${errorText(error)}` }
      }
      const execDir = deps.execDir(record.project)
      try {
        await appendAction(execDir, { action, key: record.key, event: record.event, payload: record.payload, at: now().toISOString(), proc: PROC, phase: 'start' }, now())
      }
      catch (error) {
        return { outcome: 'failed', reason: `actions.jsonl cannot be written: ${errorText(error)}` }
      }
      let result: HarnessResult
      try {
        result = await run(record)
      }
      catch (error) {
        result = { outcome: 'failed', reason: errorText(error) }
      }
      await appendAction(execDir, { action, key: record.key, at: now().toISOString(), proc: PROC, phase: 'end', outcome: result.outcome }, now()).catch((error: unknown) => {
        deps.report(record.session, 'degraded', `actions.jsonl 的结束行写不进去（${record.key}）：${errorText(error)}`)
      })
      return result
    }
    catch (error) {
      return { outcome: 'failed', reason: errorText(error) }
    }
  }

  /** The watchdog's one look at the pending claims (§2.5 point 5). */
  async function watch(): Promise<void> {
    cancelWatch = undefined
    const at = now().getTime()
    for (const [id, claim] of [...claims]) {
      const lines = (await readActions(deps.execDir(claim.record.project))).filter(line => line.key === claim.record.key && line.action === claim.action)
      if (lines.some(line => line.phase === 'end')) {
        claims.delete(id)
        continue
      }
      const start = lines.find(line => line.phase === 'start')
      const overdue = start === undefined ? at - claim.emittedAt >= CLAIM_MS : at - Date.parse(start.at) > maxMsOf(claim.action)
      if (!overdue) continue
      claims.delete(id)
      emitMetric({ event: 'execute.loop-fallback', entry: claim.entry.id, key: claim.record.key, reason: 'unclaimed', waitedS: Math.round((at - claim.emittedAt) / 1000) })
      const text = `循环板没有在 5 分钟内执行『${actionTitle(claim.action)}』（${claim.record.event}）：M7 自己执行了`
      deps.report(claim.sessionId, 'degraded', text)
      takeover(text)
      runInFallback(claim.entry, claim.record, claim.sessionId)
    }
    schedule()
  }

  function schedule(): void {
    if (disposed || cancelWatch !== undefined || claims.size === 0) return
    cancelWatch = delay(() => {
      void watch().catch((error: unknown) => {
        deps.report(undefined, 'degraded', `看门读不了 actions.jsonl：${errorText(error)}`)
        schedule()
      })
    }, WATCH_MS)
  }

  /** `duplicate`: the board saw this key before; rerun an action nobody finished (§2.5 point 5). */
  async function rerunAbandoned(entry: LoopEntryDefinition, action: string, record: LoopEventRecord, sessionId: string | undefined): Promise<void> {
    const lines = (await readActions(deps.execDir(record.project))).filter(line => line.key === record.key && line.action === action)
    if (lines.some(line => line.phase === 'end')) return
    const start = lines.find(line => line.phase === 'start')
    if (start !== undefined && (start.proc === PROC || now().getTime() - Date.parse(start.at) <= maxMsOf(action))) return
    emitMetric({ event: 'execute.loop-fallback', entry: entry.id, key: record.key, reason: start === undefined ? 'unclaimed' : 'interrupted' })
    await runEntry(entry, record, sessionId)
  }

  function emit(project: string, sessionId: string | undefined, event: LoopEmit): void {
    if (emitted.has(event.key)) return
    emitted.add(event.key)
    const session = mainAgentOf(holderHome(deps.lookup), deps.graphDirOfRoot(project))?.sessionId ?? sessionId
    const record: LoopEventRecord = { id: `ev-${randomBytes(8).toString('hex')}`, event: event.event, at: now().toISOString(), project, ...(session === undefined ? {} : { session }), key: event.key, payload: event.payload, merged: [] }
    const entries = listening(event.event)
    for (const entry of entries) if (executor(entry.id) === 'self') runInFallback(entry, record, sessionId)
    const service = serviceOf()
    if (service === undefined) return
    const boardRun = entries.filter(entry => executor(entry.id) === 'board')
    const emittedAt = now().getTime()
    void Promise.resolve().then(() => service.emit({ event: event.event, cwd: project, ...(session === undefined ? {} : { session }), key: event.key, payload: event.payload })).then((result) => {
      if (!result.ok) {
        for (const entry of boardRun) {
          emitMetric({ event: 'execute.loop-fallback', entry: entry.id, key: event.key, reason: 'emit-failed' })
          runInFallback(entry, record, sessionId)
        }
        if (boardRun.length > 0) {
          const text = `交给循环板的事件 ${event.event} 没交上（${result.code}：${result.message}）：M7 自己执行了`
          deps.report(sessionId, 'degraded', text)
          takeover(text)
        }
        return
      }
      if ('unheard' in result) {
        // No entry that could run hears it there: the row's own entries run here, so a greyed entry never leaves the drive without its action (D16).
        for (const entry of boardRun) runInFallback(entry, record, sessionId)
        return
      }
      for (const entry of boardRun) {
        if (entry.action.kind !== 'harness') continue
        const action = entry.action.action
        if (result.duplicate) {
          void rerunAbandoned(entry, action, record, sessionId).catch((error: unknown) => {
            deps.report(sessionId, 'degraded', `「${entry.title}」的补做没跑完（${event.key}）：${errorText(error)}`)
          })
          continue
        }
        claims.set(`${entry.id}\n${event.key}`, { entry, action, record, sessionId, emittedAt })
      }
      schedule()
    }, (error: unknown) => {
      for (const entry of boardRun) runInFallback(entry, record, sessionId)
      deps.report(sessionId, 'degraded', `交给循环板的事件 ${event.event} 没交上：${errorText(error)}`)
    })
  }

  const contribution: Contribution = { events: EXECUTE_EVENTS, entries: EXECUTE_ENTRIES, actions: EXECUTE_ACTIONS, run: (action, record) => runAction(action, record) }
  const detach = (): void => {
    withdraw()
    deps.notesChanged()
  }

  return {
    contribution,
    attach(service, problem) {
      // The same service handed over again (every agent/created, V12) keeps the standing hand-over.
      if (service !== undefined && serviceOf() === service) return detach
      withdraw()
      if (service === undefined) attachment = problem === undefined ? { kind: 'absent' } : { kind: 'mismatch', problem }
      else {
        let result: ReturnType<LoopsService['contribute']>
        try {
          result = service.contribute(SOURCE, contribution)
        }
        catch (error) {
          result = { ok: false, reason: errorText(error) }
        }
        if (result.ok) {
          attachment = { kind: 'board', service, accepted: new Set(result.accepted), dropped: result.dropped, dispose: result.dispose }
          emitMetric({ event: 'execute.loop-contribute', row: SOURCE.row, accepted: result.accepted, dropped: result.dropped })
        }
        else {
          attachment = { kind: 'refused', service, reason: result.reason }
          emitMetric({ event: 'execute.loop-contribute', row: SOURCE.row, accepted: [], dropped: [{ id: SOURCE.row, reason: result.reason }] })
        }
      }
      deps.notesChanged()
      return detach
    },
    runAction,
    emit,
    flushHeld(sessionId) {
      if (sessionId === undefined) return
      const waiting = held.get(sessionId)
      if (waiting === undefined) return
      held.delete(sessionId)
      const kept = waiting.filter(notice => deliver(deps.lookup, sessionId, notice).kind !== 'sent')
      if (kept.length > 0) held.set(sessionId, kept)
    },
    async replayInterrupted(project) {
      const lines = await readActions(deps.execDir(project))
      const ended = new Set(lines.filter(line => line.phase === 'end').map(line => `${line.action}\n${line.key}`))
      const session = mainAgentOf(holderHome(deps.lookup), deps.graphDirOfRoot(project))?.sessionId
      let count = 0
      for (const line of lines) {
        const id = `${line.action}\n${line.key}`
        if (line.phase !== 'start' || line.proc === PROC || ended.has(id) || replayed.has(id) || line.event === undefined) continue
        replayed.add(id)
        const entry = EXECUTE_ENTRIES.find(candidate => candidate.action.kind === 'harness' && candidate.action.action === line.action)
        const record: LoopEventRecord = { id: `ev-${randomBytes(8).toString('hex')}`, event: line.event, at: line.at, project, ...(session === undefined ? {} : { session }), key: line.key, payload: line.payload ?? {}, merged: [] }
        emitMetric({ event: 'execute.loop-fallback', entry: entry?.id ?? line.action, key: line.key, reason: 'interrupted' })
        count += 1
        if (entry === undefined) await runAction(line.action, record)
        else await runEntry(entry, record, session)
      }
      return count
    },
    boardAttached: () => attachment.kind === 'board',
    notes() {
      const found: LoopNote[] = []
      if (attachment.kind === 'absent') found.push({ text: '循环板不在：M7 的事件条目由 M7 自己执行，晨报、周报、巡检不会到点出现', degraded: false })
      if (attachment.kind === 'mismatch') found.push({ text: `循环板接口与 M7 不符：${attachment.problem}；M7 自己执行事件条目`, degraded: true })
      if (attachment.kind === 'refused') found.push({ text: `循环板没收下 ${SOURCE.row}：${attachment.reason}；这几项由 M7 自己执行`, degraded: true })
      if (attachment.kind === 'board' && attachment.dropped.length > 0) found.push({ text: `${attachment.dropped.map(item => `循环板没收下 ${item.id}：${item.reason}`).join('；')}；这几项由 M7 自己执行`, degraded: true })
      const recent = takeovers.filter(item => now().getTime() - item.at < DAY_MS)
      const latest = recent.at(-1)
      if (latest !== undefined) found.push({ text: `${latest.text}（近 24 小时接手 ${recent.length} 次）`, degraded: true })
      return found
    },
    dispose() {
      disposed = true
      cancelWatch?.()
      cancelWatch = undefined
      claims.clear()
      withdraw()
    },
  }
}
