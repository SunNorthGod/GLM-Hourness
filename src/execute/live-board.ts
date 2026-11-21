/**
 * Project-level fleet snapshot `<project>/.llm/execute/live-board.json` and
 * the `hournessExecuteBoard` session projection that hands its path to the
 * UI client.
 *
 * Updates are coalesced with a ~300 ms debounce timer per project (zero timers
 * when idle), written atomically via temp-file + fsync + rename, and all
 * pending timers are cleared on `dispose()`. Active dispatches and active
 * external jobs are always kept; settled dispatches and settled jobs are capped
 * at the 20 most recent entries.
 */
import { readFileSync } from 'node:fs'
import { mkdir, open, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureIgnored, projectOf } from '../data/project-root.ts'
import type { ExecuteLiveBoard } from '../shared/live-board.ts'
import { isGlmModel } from '../shared/route.ts'
import type { Attempt } from './attempts.ts'
import type { DispatchMode } from './dispatch-mode.ts'
import { ensureExecDir } from './gate-lock.ts'
import { pendingRequests } from './requests.ts'

export type { ExecuteLiveBoard }
export const LIVE_BOARD_VERSION = 1
export const LIVE_BOARD_PROJECTION = 'hournessExecuteBoard'
const LIVE_BOARD_FILE = 'live-board.json'

const DEFAULT_DEBOUNCE_MS = 300
const SETTLED_CAP = 20

type LiveDispatchEntry = ExecuteLiveBoard['dispatches'][number]
type LiveDispatchStatus = LiveDispatchEntry['status']
type LiveRequestEntry = ExecuteLiveBoard['requests'][number]
type LiveExternalJob = ExecuteLiveBoard['jobs'][number]
type LiveExternalJobKind = LiveExternalJob['kind']
type LiveExternalJobStatus = LiveExternalJob['status']

export interface ExecuteBoardProjectionView {
  readonly path: string | null
  readonly projectRoot: string | null
}

interface LiveBoardDriveInput {
  readonly goalId?: string
  readonly phase?: string
  readonly blockedCode?: string
  readonly stateLine?: string
  readonly counters: {
    readonly idle: number
    readonly peak: number
  }
}

interface LiveBoardPeakInput {
  readonly peak: boolean
  readonly level: string
  readonly until?: string
  readonly glmWorkerCap?: number
}

export interface LiveBoardOptions {
  readonly execDir: (projectRoot: string) => string
  readonly slots?: number
  readonly dispatchMode?: DispatchMode
  readonly debounceMs?: number
  readonly now?: () => number
  readonly onWriteError?: (projectRoot: string, error: unknown) => void
}

export interface LiveBoardStore {
  startDispatch(projectRoot: string, attempt: Attempt, meta?: { readonly startedAt?: number, readonly slots?: number, readonly peakCap?: number }): void
  settleDispatch(projectRoot: string, attempt: Attempt, settlement: { readonly stopReason?: string }, handbackDone?: boolean): void
  markHandbackDone(projectRoot: string, childId: string): void
  syncRequests(projectRoot: string, graphDir: string): void
  startJob(projectRoot: string, job: {
    readonly id: string
    readonly kind: LiveExternalJobKind
    readonly label: string
    readonly goalId?: string
    readonly tasks?: readonly string[]
    readonly flows?: readonly string[]
    readonly mode?: 'activation' | 'sync'
  }): void
  endJob(projectRoot: string, job: { readonly id: string, readonly status: LiveExternalJobStatus, readonly summary?: string }): void
  updateDrive(projectRoot: string, drive: LiveBoardDriveInput, peak?: LiveBoardPeakInput): void
  updateDispatchMode(projectRoot: string, mode: DispatchMode): void
  snapshot(projectRoot: string): ExecuteLiveBoard | undefined
  flush(projectRoot?: string): Promise<void>
  dispose(): void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Normalize drive-letter casing on Windows so one project shares one store key. */
function rootKey(projectRoot: string): string {
  return /^[A-Za-z]:/.test(projectRoot) ? `${projectRoot[0].toLowerCase()}${projectRoot.slice(1)}` : projectRoot
}

/** Path of `<project>/.llm/execute/live-board.json`. */
export function executeBoardPathOf(execDir: (projectRoot: string) => string, projectRoot: string): string {
  return join(execDir(projectRoot), LIVE_BOARD_FILE)
}

function parseBoardProjection(value: unknown): ExecuteBoardProjectionView {
  if (!isRecord(value)) throw new TypeError(`${LIVE_BOARD_PROJECTION}: expected object`)
  const { path, projectRoot } = value
  if (path !== null && typeof path !== 'string') throw new TypeError(`${LIVE_BOARD_PROJECTION}.path must be string or null`)
  if (projectRoot !== null && typeof projectRoot !== 'string') throw new TypeError(`${LIVE_BOARD_PROJECTION}.projectRoot must be string or null`)
  return { path, projectRoot }
}

const NO_PROJECT_BOARD: ExecuteBoardProjectionView = { path: null, projectRoot: null }

/**
 * Session projection exposing where `<project>/.llm/execute/live-board.json`
 * lives for the session's project, even before the first write lands.
 */
export function executeBoardProjection(execDir: (projectRoot: string) => string) {
  const stateOf = (header: unknown): ExecuteBoardProjectionView => {
    try {
      const cwd = isRecord(header) && typeof header.cwd === 'string' && header.cwd !== '' ? header.cwd : undefined
      const project = cwd === undefined ? undefined : projectOf(cwd)
      return project === undefined
        ? NO_PROJECT_BOARD
        : { path: executeBoardPathOf(execDir, project.root), projectRoot: project.root }
    }
    catch {
      return NO_PROJECT_BOARD
    }
  }
  return {
    key: LIVE_BOARD_PROJECTION,
    stateVersion: 1,
    stateSchema: { parse: parseBoardProjection },
    init: (header: unknown, _inheritedEventCount: number): ExecuteBoardProjectionView => stateOf(header),
    apply: (state: ExecuteBoardProjectionView): ExecuteBoardProjectionView => state,
    wire: { viewSchema: { parse: parseBoardProjection }, view: (state: ExecuteBoardProjectionView): ExecuteBoardProjectionView => state },
  } as const
}

const RETRY_CODES: ReadonlySet<string> = new Set(['EPERM', 'EBUSY', 'EACCES'])
let tempSeq = 0

/** Atomic file write via temp-file + fsync + rename (with brief Windows lock retries). */
export async function writeTmpRename(file: string, text: string): Promise<void> {
  const dir = join(file, '..')
  await mkdir(dir, { recursive: true })
  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    const tmp = `${file}.tmp.${process.pid}.${++tempSeq}`
    try {
      const handle = await open(tmp, 'w')
      try {
        await handle.writeFile(text, 'utf8')
        await handle.sync()
      }
      finally {
        await handle.close()
      }
      await rename(tmp, file)
      return
    }
    catch (error) {
      lastError = error
      await unlink(tmp).catch(() => {})
      const code = (error as { readonly code?: unknown } | null)?.code
      if (typeof code !== 'string' || !RETRY_CODES.has(code) || attempt === 3) break
      await new Promise(resolve => setTimeout(resolve, 35 * (attempt + 1)))
    }
  }
  throw lastError
}

function settlementStatusOf(stopReason: string | undefined): LiveDispatchStatus {
  switch (stopReason) {
    case 'completed':
      return 'completed'
    case 'aborted':
      return 'aborted'
    case 'max-tokens':
      return 'max-tokens'
    case 'refusal':
      return 'refusal'
    default:
      return 'error'
  }
}

function capSettledDispatches(entries: readonly LiveDispatchEntry[]): readonly LiveDispatchEntry[] {
  const active = entries.filter(entry => entry.status === 'running')
  const settled = entries
    .filter(entry => entry.status !== 'running')
    .sort((a, b) => (b.settledAt ?? b.startedAt) - (a.settledAt ?? a.startedAt))
    .slice(0, SETTLED_CAP)
  return [...active, ...settled]
}

function capSettledJobs(entries: readonly LiveExternalJob[]): readonly LiveExternalJob[] {
  const active = entries.filter(entry => entry.status === 'running')
  const settled = entries
    .filter(entry => entry.status !== 'running')
    .sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt))
    .slice(0, SETTLED_CAP)
  return [...active, ...settled]
}

interface ProjectState {
  readonly projectRoot: string
  maxSlots: number
  peakCap: number | undefined
  drive: ExecuteLiveBoard['drive']
  peak: ExecuteLiveBoard['peak']
  dispatches: LiveDispatchEntry[]
  requests: LiveRequestEntry[]
  jobs: LiveExternalJob[]
  dispatchMode: DispatchMode | undefined
  updatedAt: number
  dirty: boolean
  timer: ReturnType<typeof setTimeout> | undefined
  writing: Promise<void> | undefined
  ignoredPrepared: boolean
}

function dispatchEntryFromAttempt(
  attempt: Attempt,
  fields: { readonly status: LiveDispatchStatus, readonly startedAt: number, readonly settledAt?: number, readonly handbackDone?: boolean },
): LiveDispatchEntry {
  return {
    childId: attempt.childId,
    task: attempt.node,
    role: attempt.role,
    attempt: attempt.attempt,
    status: fields.status,
    startedAt: fields.startedAt,
    ...(fields.settledAt === undefined ? {} : { settledAt: fields.settledAt }),
    ...(attempt.parentSession === undefined ? {} : { parentSession: attempt.parentSession }),
    provider: attempt.provider,
    model: attempt.model,
    ...(attempt.reasoningEffort === undefined ? {} : { reasoningEffort: attempt.reasoningEffort }),
    why: attempt.why,
    ...(attempt.worktree === undefined ? {} : { worktree: attempt.worktree }),
    ...(attempt.branch === undefined ? {} : { branch: attempt.branch }),
    ...(attempt.review === undefined ? {} : { review: attempt.review }),
    ...(attempt.depth === undefined ? {} : { depth: attempt.depth }),
    plan: attempt.plan,
    ...(fields.handbackDone === undefined ? {} : { handbackDone: fields.handbackDone }),
  }
}

interface HydratedBoard {
  readonly dispatches: readonly LiveDispatchEntry[]
  readonly jobs: readonly LiveExternalJob[]
  readonly dispatchMode: DispatchMode | undefined
}

const VALID_ROLES: ReadonlySet<string> = new Set(['worker', 'review', 'acceptance-review', 'check'])
const VALID_PLANS: ReadonlySet<string> = new Set(['required', 'approved', 'skipped', 'none'])
const VALID_DISPATCH_STATUSES: ReadonlySet<string> = new Set(['running', 'completed', 'error', 'aborted', 'max-tokens', 'refusal', 'lost'])
const VALID_JOB_KINDS: ReadonlySet<string> = new Set(['gate', 'walk'])
const VALID_JOB_STATUSES: ReadonlySet<string> = new Set(['running', 'completed', 'error', 'aborted'])
const VALID_DISPATCH_MODES: ReadonlySet<string> = new Set(['eco', 'adaptive', 'burn'])

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function optionalStringList(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every(item => typeof item === 'string') ? value : undefined
}

function parseDispatchEntry(raw: unknown, nowMs: number): LiveDispatchEntry | undefined {
  if (!isRecord(raw)) return undefined
  if (
    typeof raw.childId !== 'string'
    || typeof raw.task !== 'string'
    || typeof raw.role !== 'string' || !VALID_ROLES.has(raw.role)
    || typeof raw.attempt !== 'number'
    || typeof raw.status !== 'string' || !VALID_DISPATCH_STATUSES.has(raw.status)
    || typeof raw.startedAt !== 'number'
    || typeof raw.provider !== 'string'
    || typeof raw.model !== 'string'
    || typeof raw.plan !== 'string' || !VALID_PLANS.has(raw.plan)
  ) {
    return undefined
  }
  const stale = raw.status === 'running'
  const status = stale ? 'lost' : raw.status as LiveDispatchStatus
  const settledAt = typeof raw.settledAt === 'number' ? raw.settledAt : (stale ? nowMs : undefined)
  const parentSession = optionalString(raw.parentSession)
  const reasoningEffort = optionalString(raw.reasoningEffort)
  const why = optionalString(raw.why)
  const worktree = optionalString(raw.worktree)
  const branch = optionalString(raw.branch)
  const review = raw.review === 'full' || raw.review === 'light' || raw.review === 'skip' ? raw.review : undefined
  const depth = raw.depth === 'full' || raw.depth === 'light' ? raw.depth : undefined
  const handbackDone = typeof raw.handbackDone === 'boolean' ? raw.handbackDone : undefined
  return {
    childId: raw.childId,
    task: raw.task,
    role: raw.role as LiveDispatchEntry['role'],
    attempt: raw.attempt,
    status,
    startedAt: raw.startedAt,
    ...(settledAt === undefined ? {} : { settledAt }),
    ...(parentSession === undefined ? {} : { parentSession }),
    provider: raw.provider,
    model: raw.model,
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    ...(why === undefined ? {} : { why }),
    ...(worktree === undefined ? {} : { worktree }),
    ...(branch === undefined ? {} : { branch }),
    ...(review === undefined ? {} : { review }),
    ...(depth === undefined ? {} : { depth }),
    plan: raw.plan as LiveDispatchEntry['plan'],
    ...(handbackDone === undefined ? {} : { handbackDone }),
  }
}

function parseJobEntry(raw: unknown, nowMs: number): LiveExternalJob | undefined {
  if (!isRecord(raw)) return undefined
  if (
    typeof raw.id !== 'string'
    || typeof raw.kind !== 'string' || !VALID_JOB_KINDS.has(raw.kind)
    || typeof raw.label !== 'string'
    || typeof raw.status !== 'string' || !VALID_JOB_STATUSES.has(raw.status)
    || typeof raw.startedAt !== 'number'
  ) {
    return undefined
  }
  const stale = raw.status === 'running'
  const status = stale ? 'aborted' : raw.status as LiveExternalJobStatus
  const endedAt = typeof raw.endedAt === 'number' ? raw.endedAt : (stale ? nowMs : undefined)
  const goalId = optionalString(raw.goalId)
  const tasks = optionalStringList(raw.tasks)
  const flows = optionalStringList(raw.flows)
  const mode = raw.mode === 'activation' || raw.mode === 'sync' ? raw.mode : undefined
  const summary = optionalString(raw.summary)
  return {
    id: raw.id,
    kind: raw.kind as LiveExternalJobKind,
    label: raw.label,
    status,
    startedAt: raw.startedAt,
    ...(endedAt === undefined ? {} : { endedAt }),
    ...(goalId === undefined ? {} : { goalId }),
    ...(tasks === undefined ? {} : { tasks }),
    ...(flows === undefined ? {} : { flows }),
    ...(mode === undefined ? {} : { mode }),
    ...(summary === undefined ? {} : { summary }),
  }
}

const EMPTY_HYDRATED: HydratedBoard = { dispatches: [], jobs: [], dispatchMode: undefined }

function hydrateFromDisk(file: string, nowMs: number): HydratedBoard {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (!isRecord(parsed) || parsed.version !== LIVE_BOARD_VERSION) return EMPTY_HYDRATED
    const dispatches = Array.isArray(parsed.dispatches)
      ? capSettledDispatches(parsed.dispatches.flatMap(entry => {
          const item = parseDispatchEntry(entry, nowMs)
          return item === undefined ? [] : [item]
        }))
      : []
    const jobs = Array.isArray(parsed.jobs)
      ? capSettledJobs(parsed.jobs.flatMap(entry => {
          const item = parseJobEntry(entry, nowMs)
          return item === undefined ? [] : [item]
        }))
      : []
    const dispatchMode = typeof parsed.dispatchMode === 'string' && VALID_DISPATCH_MODES.has(parsed.dispatchMode)
      ? parsed.dispatchMode as DispatchMode
      : undefined
    return { dispatches, jobs, dispatchMode }
  }
  catch {
    return EMPTY_HYDRATED
  }
}

export function createLiveBoardStore(options: LiveBoardOptions): LiveBoardStore {
  const defaultSlots = options.slots ?? 3
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const now = options.now ?? ((): number => Date.now())
  const projects = new Map<string, ProjectState>()
  let disposed = false

  const stateFor = (projectRoot: string): ProjectState => {
    const key = rootKey(projectRoot)
    let state = projects.get(key)
    if (state === undefined) {
      const hydrated = hydrateFromDisk(executeBoardPathOf(options.execDir, projectRoot), now())
      state = {
        projectRoot,
        maxSlots: defaultSlots,
        peakCap: undefined,
        drive: { counters: { idle: 0, peak: 0 } },
        peak: undefined,
        dispatches: [...hydrated.dispatches],
        requests: [],
        jobs: [...hydrated.jobs],
        dispatchMode: options.dispatchMode ?? hydrated.dispatchMode,
        updatedAt: now(),
        dirty: false,
        timer: undefined,
        writing: undefined,
        ignoredPrepared: false,
      }
      projects.set(key, state)
    }
    return state
  }

  const materialize = (state: ProjectState): ExecuteLiveBoard => {
    const running = state.dispatches.filter(entry => entry.status === 'running')
    const activeWorkers = running.filter(entry => entry.role === 'worker').length
    const glmWorkers = running.filter(entry => entry.role !== 'check' && isGlmModel(entry.model)).length
    return {
      version: LIVE_BOARD_VERSION,
      updatedAt: state.updatedAt,
      projectRoot: state.projectRoot,
      slots: {
        max: state.maxSlots,
        activeWorkers,
        glmWorkers,
        ...(state.peakCap === undefined ? {} : { peakCap: state.peakCap }),
      },
      drive: state.drive,
      ...(state.peak === undefined ? {} : { peak: state.peak }),
      dispatches: state.dispatches,
      requests: state.requests,
      jobs: state.jobs,
      ...(state.dispatchMode === undefined ? {} : { dispatchMode: state.dispatchMode }),
    }
  }

  const flushOne = async (state: ProjectState): Promise<void> => {
    if (state.timer !== undefined) {
      clearTimeout(state.timer)
      state.timer = undefined
    }
    if (state.writing !== undefined) {
      await state.writing
    }
    while (state.dirty && !disposed) {
      state.dirty = false
      const payload = `${JSON.stringify(materialize(state), null, 2)}\n`
      const targetDir = options.execDir(state.projectRoot)
      const targetFile = executeBoardPathOf(options.execDir, state.projectRoot)
      const writeOp = (async () => {
        try {
          if (!state.ignoredPrepared) {
            await ensureIgnored(state.projectRoot, '.llm').catch(() => {})
            await ensureExecDir(targetDir)
            state.ignoredPrepared = true
          }
          await writeTmpRename(targetFile, payload)
        }
        catch (error) {
          options.onWriteError?.(state.projectRoot, error)
        }
      })()
      state.writing = writeOp
      await writeOp
      if (state.writing === writeOp) state.writing = undefined
    }
  }

  const scheduleWrite = (state: ProjectState): void => {
    if (disposed) return
    state.updatedAt = now()
    state.dirty = true
    if (state.timer !== undefined) return
    const timer = setTimeout(() => {
      state.timer = undefined
      void flushOne(state)
    }, debounceMs)
    timer.unref()
    state.timer = timer
  }

  return {
    startDispatch(projectRoot, attempt, meta) {
      const state = stateFor(projectRoot)
      if (meta?.slots !== undefined) state.maxSlots = meta.slots
      if (meta?.peakCap !== undefined) state.peakCap = meta.peakCap
      const entry = dispatchEntryFromAttempt(attempt, { status: 'running', startedAt: meta?.startedAt ?? now() })
      state.dispatches = [...capSettledDispatches(state.dispatches.filter(item => item.childId !== attempt.childId)), entry]
      scheduleWrite(state)
    },

    settleDispatch(projectRoot, attempt, settlement, handbackDone) {
      const state = stateFor(projectRoot)
      const existing = state.dispatches.find(item => item.childId === attempt.childId)
      const settledAt = now()
      const status = settlementStatusOf(settlement.stopReason)
      const updated: LiveDispatchEntry = existing !== undefined
        ? {
            ...existing,
            status,
            settledAt,
            ...(handbackDone === undefined ? {} : { handbackDone }),
          }
        : dispatchEntryFromAttempt(attempt, {
            status,
            startedAt: settledAt,
            settledAt,
            ...(handbackDone === undefined ? {} : { handbackDone }),
          })
      state.dispatches = [...capSettledDispatches([...state.dispatches.filter(item => item.childId !== attempt.childId), updated])]
      scheduleWrite(state)
    },

    markHandbackDone(projectRoot, childId) {
      const state = stateFor(projectRoot)
      const index = state.dispatches.findIndex(item => item.childId === childId)
      if (index < 0) return
      const current = state.dispatches[index]
      if (current === undefined || current.handbackDone === true) return
      state.dispatches = state.dispatches.map((item, i) => i === index ? { ...item, handbackDone: true } : item)
      scheduleWrite(state)
    },

    syncRequests(projectRoot, graphDir) {
      const state = stateFor(projectRoot)
      const next: LiveRequestEntry[] = pendingRequests(graphDir).map(({ request, since }) => ({
        id: request.id,
        kind: request.kind,
        childId: request.childId,
        task: request.task,
        attempt: request.attempt,
        since,
        ...(request.version === undefined ? {} : { version: request.version }),
        ...(request.question === undefined ? {} : { question: request.question }),
        ...(request.assumption === undefined ? {} : { assumption: request.assumption }),
      }))
      if (JSON.stringify(state.requests) === JSON.stringify(next)) return
      state.requests = next
      scheduleWrite(state)
    },

    startJob(projectRoot, job) {
      const state = stateFor(projectRoot)
      const existing = state.jobs.find(item => item.id === job.id)
      const entry: LiveExternalJob = {
        id: job.id,
        kind: job.kind,
        label: job.label,
        status: 'running',
        startedAt: existing?.startedAt ?? now(),
        ...(job.goalId !== undefined ? { goalId: job.goalId } : existing?.goalId !== undefined ? { goalId: existing.goalId } : {}),
        ...(job.tasks !== undefined ? { tasks: job.tasks } : existing?.tasks !== undefined ? { tasks: existing.tasks } : {}),
        ...(job.flows !== undefined ? { flows: job.flows } : existing?.flows !== undefined ? { flows: existing.flows } : {}),
        ...(job.mode !== undefined ? { mode: job.mode } : existing?.mode !== undefined ? { mode: existing.mode } : {}),
      }
      state.jobs = [...capSettledJobs([...state.jobs.filter(item => item.id !== job.id), entry])]
      scheduleWrite(state)
    },

    endJob(projectRoot, job) {
      const state = stateFor(projectRoot)
      const existing = state.jobs.find(item => item.id === job.id)
      const endedAt = now()
      const entry: LiveExternalJob = existing !== undefined
        ? {
            ...existing,
            status: job.status,
            endedAt,
            ...(job.summary === undefined ? {} : { summary: job.summary }),
          }
        : {
            id: job.id,
            kind: job.id.startsWith('walk-') ? 'walk' : 'gate',
            label: job.id,
            status: job.status,
            startedAt: endedAt,
            endedAt,
            ...(job.summary === undefined ? {} : { summary: job.summary }),
          }
      state.jobs = [...capSettledJobs([...state.jobs.filter(item => item.id !== job.id), entry])]
      scheduleWrite(state)
    },

    updateDrive(projectRoot, drive, peak) {
      const state = stateFor(projectRoot)
      const nextDrive: ExecuteLiveBoard['drive'] = {
        ...(drive.goalId === undefined ? {} : { goalId: drive.goalId }),
        ...(drive.phase === undefined ? {} : { phase: drive.phase }),
        ...(drive.blockedCode === undefined ? {} : { blockedCode: drive.blockedCode }),
        ...(drive.stateLine === undefined ? {} : { stateLine: drive.stateLine }),
        counters: { idle: drive.counters.idle, peak: drive.counters.peak },
      }
      const nextPeak: ExecuteLiveBoard['peak'] = peak === undefined
        ? undefined
        : {
            peak: peak.peak,
            level: peak.level,
            ...(peak.until === undefined ? {} : { until: peak.until }),
          }
      const nextPeakCap = peak?.glmWorkerCap
      if (
        JSON.stringify(state.drive) === JSON.stringify(nextDrive)
        && JSON.stringify(state.peak) === JSON.stringify(nextPeak)
        && state.peakCap === nextPeakCap
      ) {
        return
      }
      state.drive = nextDrive
      state.peak = nextPeak
      state.peakCap = nextPeakCap
      scheduleWrite(state)
    },

    updateDispatchMode(projectRoot, mode) {
      const state = stateFor(projectRoot)
      if (state.dispatchMode === mode) return
      state.dispatchMode = mode
      scheduleWrite(state)
    },

    snapshot(projectRoot) {
      const state = projects.get(rootKey(projectRoot))
      return state === undefined ? undefined : materialize(state)
    },

    async flush(projectRoot) {
      if (projectRoot !== undefined) {
        const state = projects.get(rootKey(projectRoot))
        if (state !== undefined) await flushOne(state)
        return
      }
      await Promise.all([...projects.values()].map(state => flushOne(state)))
    },

    dispose() {
      disposed = true
      for (const state of projects.values()) {
        if (state.timer !== undefined) {
          clearTimeout(state.timer)
          state.timer = undefined
        }
        state.dirty = false
      }
    },
  }
}
