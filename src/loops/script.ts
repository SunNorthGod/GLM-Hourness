/**
 * The two boards' shared script executor (docs/ORCHESTRATION.md §18.9; loop
 * board design 0.6 §6.6; M4 design §6.3): this is the one module of either
 * board that starts a process (`src/loops/` and `src/rules/` nowhere else,
 * design §13). The rules board imports it for its detectors and gating
 * scripts, the loop board for a person's script entries (`runScript`,
 * purpose `work`) and their check entries (`runCommand`, queue `check`);
 * M4's own checkers start theirs through `runCommand` with queue `direct`
 * and own their concurrency.
 *
 * What the executor guarantees for every process:
 *
 * - no shell: the argument vector goes to the program's hands as it is;
 * - the program is resolved with `resolveProgram`, which searches only the
 *   absolute directories of `PATH`, skips the project and each of its work
 *   trees (libuv on Windows looks into the child's working directory first,
 *   review F53) and flags a `.cmd`/`.bat` result as `needsShell` instead of
 *   starting one (Node cannot spawn them without a shell);
 * - the environment is the whitelist of design §6.6 plus the `HOURNESS_*`
 *   names of the run: no DSH credential and no GLM key reaches a script;
 * - a timeout ends the whole process tree, work and check alike (design
 *   `d-script-timeout`: the late running of a gating script is the rules
 *   board's, not this file's);
 * - output is capped per stream (design: 1 MiB, at most 4 MiB), and a run
 *   with a `logFile` writes the command line, the digest, the resolved
 *   program and then the whole output there.
 *
 * A script entry runs a private copy: the executor verifies the bytes of
 * `script.file` against the digest the person agreed to, writes them to
 * `.llm/loops/run/<run>.<suffix>` and hands that copy to the interpreter, so
 * what executes is what the person read even when the file changes between
 * the check and the start (design §6.6, acceptance 30d). Nothing here
 * throws: every result is a `ScriptResult`.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync, writeSync } from 'node:fs'
import { basename, delimiter, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { constants, setPriority } from 'node:os'
import { cachedWorktrees } from '../data/project-root.ts'
import { commandText, INTERPRETERS, SCRIPT_MAX_BYTES, WORK_TIMEOUT_MS } from './command-text.ts'
import type { ScriptLang, ScriptRef } from './trigger.ts'

export { commandText, WORK_TIMEOUT_MS } from './command-text.ts'
/** The most a work script may run (design §6.6; a person's entry allows 5 to 1800 whole seconds). */
export const WORK_TIMEOUT_MAX_MS = 1_800_000
/** How many of a project's person-added checks run at once (design §6.6, review F50). */
export const CHECK_CONCURRENT = 2
/** The timeout of a gating script that names none, and the most it may have (design §6.7). */
export const GATE_TIMEOUT_MS = 10_000
export const GATE_TIMEOUT_MAX_MS = 30_000
/** How many gating scripts of a project run at once, and how many wait for a place; one more is answered with a timeout at once (design §6.6, review F49). */
export const GATE_CONCURRENT = 4
export const GATE_QUEUE_MAX = 16
/** Output kept per stream when the request names none (design §6.6). */
export const OUTPUT_DEFAULT_BYTES = 1_048_576
/** The most output kept per stream (design §6.6). */
export const OUTPUT_MAX_BYTES = 4_194_304
/** The suffix of the script file of each language (`src/loops/model.ts` spells the same for validation). */
const SCRIPT_SUFFIX: Readonly<Record<ScriptLang, string>> = { pwsh: 'ps1', node: 'mjs', python: 'py', bash: 'sh' }

/** The environment a process gets (design §6.6: this list, and nothing else of the host's). */
const ENV_NAMES: readonly string[] = ['PATH', 'PATHEXT', 'SystemRoot', 'TEMP', 'TMP', 'USERPROFILE', 'HOME', 'APPDATA', 'LOCALAPPDATA']

/** What a script reads about its run on standard input (design §6.6), written as one JSON line. */
export interface HookEnvelope {
  readonly version: 1
  readonly board: 'loops' | 'rules'
  readonly entry: string
  readonly run: string
  /** The event id; a time trigger says `time`. */
  readonly event: string
  /** The event's id in the inbox (`ev-…`); a gating event and a time trigger have none. */
  readonly id?: string
  readonly at: string
  /** Absolute path of the project root. */
  readonly project: string
  readonly session?: string
  readonly key?: string
  readonly payload: Readonly<Record<string, unknown>>
  readonly merged?: readonly { readonly id: string, readonly key: string, readonly payload: Readonly<Record<string, unknown>> }[]
  /** A time trigger: when this run should have happened. */
  readonly occurrenceAt?: string
}

export interface ScriptRequest {
  /** The project root; also the working directory of the process. */
  readonly project: string
  /** The script as the person agreed to it; the file must sit under the project (no symlinks out). */
  readonly script: ScriptRef
  readonly envelope: HookEnvelope
  /**
   * `work`: one script of each board per project at a time, queued without
   * the wait counting into its timeout. `gate`: the rules board's scripts that
   * stand in front of a call (design §6.6, §6.7): at most `GATE_CONCURRENT` of a
   * project at once and `GATE_QUEUE_MAX` waiting, the wait counts into the
   * timeout (the call is held while it waits), the timeout is at most
   * `GATE_TIMEOUT_MAX_MS` and, absent, `GATE_TIMEOUT_MS`. The tree is ended at
   * the timeout, as for `work`: a gating script is not kept running in the
   * background after it, which the late verdict of design §6.7 would need and
   * which comes with the host's gate using this file.
   */
  readonly purpose: 'work' | 'gate'
  readonly timeoutMs?: number
  /** Given: the command line, the digest and the whole output are appended here. */
  readonly logFile?: string
  readonly signal?: AbortSignal
}

export type ScriptResult =
  | { readonly kind: 'exited', readonly exitCode: number, readonly stdout: string, readonly stderr: string, readonly durationMs: number, readonly truncated: boolean }
  /** The tree was ended at the limit; a gating script's later end is the rules board's (design §6.6). */
  | { readonly kind: 'timeout', readonly stdout: string, readonly stderr: string, readonly durationMs: number }
  | { readonly kind: 'crashed', readonly reason: 'spawn' | 'signal' | 'io', readonly message: string, readonly durationMs: number }
  | { readonly kind: 'refused', readonly reason: 'script-changed' | 'script-missing' | 'outside-project' | 'too-large' | 'aborted', readonly message: string }

export interface CommandRequest {
  /**
   * Which lane serves the process (design §6.6, review F50): `check` is a
   * person-added check of the loop board, at most `CHECK_CONCURRENT` of a
   * project at once in a lane of its own, and needs an envelope; `direct` is
   * never queued (M4's own checkers manage their concurrency), and an
   * envelope is welcome but not required (an empty standard input closed at
   * once, and only `HOURNESS_PROJECT_ROOT` of the `HOURNESS_*` names).
   */
  readonly queue: 'check' | 'direct'
  /** The project root. */
  readonly project: string
  /** The working directory: the main checkout or one of its work trees; default the project. */
  readonly cwd?: string
  /** One command line without a shell; `argv[0]` is resolved with `resolveProgram`. */
  readonly argv: readonly string[]
  readonly envelope?: HookEnvelope
  /** Default `WORK_TIMEOUT_MS`, at most `WORK_TIMEOUT_MAX_MS`. */
  readonly timeoutMs?: number
  /** Output kept per stream; default 1 MiB, at most 4 MiB. */
  readonly maxOutputBytes?: number
  readonly logFile?: string
  readonly signal?: AbortSignal
}

/** `resolveProgram`'s answer: an absolute path outside the project, or nothing anywhere on `PATH`. */
export type ResolvedProgram =
  | { readonly ok: true, readonly path: string, readonly needsShell: boolean }
  | { readonly ok: false, readonly reason: 'not-found' }

const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

/** Digest of the bytes a person agreed to; the same value rides in the entry (`ScriptRef.sha256`). */
export function scriptSha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Case-folded on Windows, so `C:\Work` and `c:\work` are one directory. */
const fold = (path: string): string => process.platform === 'win32' ? path.toLowerCase() : path

/** Whether `path` is `base` itself or something under it. */
function inside(path: string, base: string): boolean {
  const made = fold(resolve(path))
  const root = fold(resolve(base))
  return made === root || made.startsWith(root.endsWith(sep) ? root : root + sep)
}

/** The real path when there is one, the resolved path when the file or directory is not there. */
function realOrSelf(path: string): string {
  try {
    return realpathSync(path)
  }
  catch {
    return resolve(path)
  }
}

/**
 * The program a command names (design §6.6, review F53): only the absolute
 * directories of `PATH` are searched, and every directory inside the project
 * or one of its work trees is skipped — libuv on Windows looks into the
 * child's working directory first, so a planted `node.exe` there must not
 * win. Relative `PATH` entries (including `.`) are skipped as well. A name
 * that carries `/` or `\` is a path: resolved against `cwd`, required to
 * exist, visible to the person in the command line. On Windows the suffixes
 * of `PATHEXT` are tried in turn unless the name ends in one already. A
 * `.cmd`/`.bat` answer is `needsShell`: Node cannot start them without a
 * shell, so the caller answers `crashed` instead of starting one. Pure
 * function plus file reads; never throws.
 */
export function resolveProgram(name: string, cwd: string, project: string, worktrees: readonly string[]): ResolvedProgram {
  try {
    if (name.length === 0) return { ok: false, reason: 'not-found' }
    if (name.includes('/') || name.includes('\\')) {
      const direct = resolve(cwd, name)
      if (!existsSync(direct)) return { ok: false, reason: 'not-found' }
      return { ok: true, path: direct, needsShell: /\.(cmd|bat)$/i.test(direct) }
    }
    const bases = [project, ...worktrees].map(realOrSelf)
    const skipped = (dir: string): boolean => bases.some(base => inside(dir, base))
    const extensions = process.platform === 'win32'
      ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(part => part.length > 0)
      : ['']
    const endings = process.platform === 'win32' && /\.[A-Za-z0-9]+$/.test(basename(name)) ? [''] : extensions
    for (const raw of (process.env.PATH ?? '').split(delimiter)) {
      if (!isAbsolute(raw)) continue
      const dir = resolve(raw)
      if (skipped(dir)) continue
      for (const ending of endings) {
        const found = join(dir, name + ending)
        if (existsSync(found)) return { ok: true, path: found, needsShell: /\.(cmd|bat)$/i.test(found) }
      }
    }
    return { ok: false, reason: 'not-found' }
  }
  catch {
    return { ok: false, reason: 'not-found' }
  }
}

// -------------------------------------------------------------------- lanes

/**
 * One lane of a project: at most `size` processes at once, the rest in arrival
 * order; the wait does not count into a run's timeout, because the timer
 * starts at the spawn. The gates never reject.
 */
class Lane {
  private readonly waiting: Array<() => void> = []
  private used = 0
  readonly size: number

  constructor(size: number) {
    this.size = size
  }

  async enter(): Promise<() => void> {
    if (this.used < this.size) {
      this.used += 1
      return () => this.leave()
    }
    return await new Promise(resolveLeave => {
      this.waiting.push(() => {
        this.used += 1
        resolveLeave(() => this.leave())
      })
    })
  }

  private leave(): void {
    this.used -= 1
    this.waiting.shift()?.()
  }

  /**
   * A place for a call that is held while it waits (a gating script): at once when one is free, else after the ones
   * ahead, for at most `waitMs`, and not at all when `maxWaiting` are waiting already (`full`), the wait runs out
   * (`late`) or `signal` is aborted (`aborted`). A caller that is told no place was not waiting any more.
   */
  enterWithin(waitMs: number, maxWaiting: number, signal: AbortSignal | undefined): Promise<(() => void) | 'full' | 'late' | 'aborted'> {
    if (signal?.aborted === true) return Promise.resolve('aborted')
    if (this.used < this.size) {
      this.used += 1
      return Promise.resolve(() => this.leave())
    }
    if (this.waiting.length >= maxWaiting) return Promise.resolve('full')
    return new Promise((resolveEntry) => {
      const place = (): void => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        this.used += 1
        resolveEntry(() => this.leave())
      }
      const stop = (answer: 'late' | 'aborted'): void => {
        clearTimeout(timer)
        const at = this.waiting.indexOf(place)
        if (at >= 0) this.waiting.splice(at, 1)
        signal?.removeEventListener('abort', onAbort)
        resolveEntry(answer)
      }
      const onAbort = (): void => { stop('aborted') }
      this.waiting.push(place)
      const timer = setTimeout(() => { stop('late') }, Math.max(0, waitMs))
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }
}

const lanes = new Map<string, Lane>()

function laneFor(key: string, size: number): Lane {
  const known = lanes.get(key)
  if (known !== undefined) return known
  const made = new Lane(size)
  lanes.set(key, made)
  return made
}

// ------------------------------------------------------------- the process

/** End the process and everything it spawned (design §6.6): Windows takes `taskkill /T /F`, the others the process group. The takeover's trial ends its runs the same way (takeover design 0.6 §6.3). */
export function killTree(pid: number): void {
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).on('error', () => undefined)
    }
    catch {
      // The tree is already gone, or taskkill could not start: nothing to end.
    }
  }
  else {
    try {
      process.kill(-pid, 'SIGKILL')
    }
    catch {
      try {
        process.kill(pid, 'SIGKILL')
      }
      catch {
        // Gone already.
      }
    }
  }
}

interface ProcessPlan {
  readonly program: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: Record<string, string>
  /** Written to standard input, then the stream closes; absent, it closes at once (design §6.6: M4's `direct` runs read an empty one). */
  readonly stdin?: string
  readonly timeoutMs: number
  readonly capBytes: number
  readonly logFile?: string
  readonly firstLine?: string
  readonly signal?: AbortSignal
  /** Runs when the process is over, win or lose (the private copy goes away). */
  readonly finish?: () => void
}

const timeoutOf = (request: { readonly timeoutMs?: number }): number =>
  request.timeoutMs === undefined || !(Number.isFinite(request.timeoutMs) && request.timeoutMs > 0)
    ? WORK_TIMEOUT_MS
    : Math.min(request.timeoutMs, WORK_TIMEOUT_MAX_MS)

/** The timeout of a gating script: what the request names, at most the ceiling, else the default (design §6.7). */
const gateTimeoutOf = (request: { readonly timeoutMs?: number }): number =>
  request.timeoutMs === undefined || !(Number.isFinite(request.timeoutMs) && request.timeoutMs > 0)
    ? GATE_TIMEOUT_MS
    : Math.min(request.timeoutMs, GATE_TIMEOUT_MAX_MS)

const outputOf = (maxOutputBytes: number | undefined): number =>
  maxOutputBytes === undefined || !(Number.isFinite(maxOutputBytes) && maxOutputBytes > 0)
    ? OUTPUT_DEFAULT_BYTES
    : Math.min(maxOutputBytes, OUTPUT_MAX_BYTES)

/**
 * Start one process and wait for its end, whatever kind of end (design §6.6).
 * The timer starts at the spawn, so a wait in a lane is free; the timeout
 * ends the whole tree; output is kept per stream up to the cap while the log
 * takes everything; the promise never rejects.
 */
function runProcess(plan: ProcessPlan): Promise<ScriptResult> {
  const started = Date.now()
  let log: number | undefined
  if (plan.logFile !== undefined) {
    try {
      mkdirSync(dirname(plan.logFile), { recursive: true })
      log = openSync(plan.logFile, 'a')
      writeSync(log, `${plan.firstLine ?? ''}\n`)
    }
    catch {
      // A log that cannot open does not stop the run; the output still comes back.
      log = undefined
    }
  }
  const slices: { out: Buffer[], err: Buffer[] } = { out: [], err: [] }
  const kept = { out: 0, err: 0 }
  let truncated = false
  let timedOut = false
  return new Promise<ScriptResult>(resolveResult => {
    let settled = false
    let timer: NodeJS.Timeout | undefined
    let child: ChildProcess | undefined
    const done = (result: ScriptResult): void => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      plan.signal?.removeEventListener('abort', onAbort)
      if (log !== undefined) {
        try {
          closeSync(log)
        }
        catch {
          // The log's bytes are on disk already.
        }
      }
      try {
        plan.finish?.()
      }
      catch {
        // A copy that could not be removed now goes with the hour sweep.
      }
      resolveResult(result)
    }
    const onAbort = (): void => {
      if (child?.pid !== undefined) killTree(child.pid)
    }
    try {
      child = spawn(plan.program, [...plan.args], {
        shell: false,
        windowsHide: true,
        cwd: plan.cwd,
        env: plan.env,
        detached: process.platform !== 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    }
    catch (error) {
      done({ kind: 'crashed', reason: 'spawn', message: message(error), durationMs: Date.now() - started })
      return
    }
    if (child.pid === undefined) {
      done({ kind: 'crashed', reason: 'spawn', message: `程序没有起来：${plan.program}`, durationMs: Date.now() - started })
      return
    }
    try {
      setPriority(child.pid, constants.priority.PRIORITY_BELOW_NORMAL)
    }
    catch {
      // A priority the host refuses is not the run's business.
    }
    timer = setTimeout(() => {
      timedOut = true
      if (child?.pid !== undefined) killTree(child.pid)
    }, plan.timeoutMs)
    plan.signal?.addEventListener('abort', onAbort, { once: true })
    child.on('error', (error: Error) => {
      done({ kind: 'crashed', reason: 'spawn', message: message(error), durationMs: Date.now() - started })
    })
    child.on('close', (code: number | null, signalName: NodeJS.Signals | null) => {
      const durationMs = Date.now() - started
      const stdout = Buffer.concat(slices.out).toString('utf8')
      const stderr = Buffer.concat(slices.err).toString('utf8')
      if (timedOut) {
        done({ kind: 'timeout', stdout, stderr, durationMs })
        return
      }
      if (signalName !== null) {
        done({ kind: 'crashed', reason: 'signal', message: `被信号结束：${String(signalName)}`, durationMs })
        return
      }
      done({ kind: 'exited', exitCode: code ?? 0, stdout, stderr, durationMs, truncated })
    })
    child.stdin?.on('error', () => undefined)
    // One JSON line, then the stream closes; a script that never reads it loses nothing.
    child.stdin?.end(plan.stdin ?? '')
    const take = (name: 'out' | 'err'): ((chunk: Buffer) => void) => (chunk: Buffer): void => {
      if (log !== undefined) {
        try {
          writeSync(log, chunk)
        }
        catch {
          // A log that cannot take more does not stop the run.
        }
      }
      const room = plan.capBytes - kept[name]
      if (room <= 0) {
        truncated = true
        return
      }
      if (chunk.length > room) truncated = true
      const piece = chunk.subarray(0, room)
      kept[name] += piece.length
      slices[name].push(piece)
    }
    child.stdout?.on('data', take('out'))
    child.stderr?.on('data', take('err'))
  })
}

// ---------------------------------------------------------------- runScript

/** The work trees of a project, remembered for a minute (`src/data/project-root.ts`). */
const worktreesOf = cachedWorktrees(() => Date.now())

const refusedRun = (reason: Extract<ScriptResult, { kind: 'refused' }>['reason'], text: string): ScriptResult =>
  ({ kind: 'refused', reason, message: text })

const crashedRun = (reason: Extract<ScriptResult, { kind: 'crashed' }>['reason'], text: string, durationMs = 0): ScriptResult =>
  ({ kind: 'crashed', reason, message: text, durationMs })

/** The whitelist of design §6.6, plus the `HOURNESS_*` names of the run; a `direct` run gets the project root only. */
function envOf(envelope: HookEnvelope | undefined, project: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const name of ENV_NAMES) {
    const value = process.env[name]
    if (value !== undefined) env[name] = value
  }
  env.HOURNESS_PROJECT_ROOT = project
  if (envelope !== undefined) {
    env.HOURNESS_BOARD = envelope.board
    env.HOURNESS_ENTRY = envelope.entry
    env.HOURNESS_RUN = envelope.run
    env.HOURNESS_EVENT = envelope.event
  }
  return env
}

/**
 * Run a person's script, purpose `work` or `gate` (design §6.6): verify the bytes of
 * the file the entry names against the digest the person agreed to, write
 * the verified bytes to a private copy under `.llm/loops/run/`, hand the copy
 * to the interpreter of the script's language, and remove the copy at the
 * end. The envelope goes to the script's standard input as one JSON line.
 * One script of each board per project at a time, the rest queued, the wait
 * free of the timeout. The result is what the process did; what that means
 * is the calling board's.
 */
export function runScript(request: ScriptRequest): Promise<ScriptResult> {
  try {
    const project = realOrSelf(request.project)
    const file = join(project, ...request.script.file.split('/'))
    let bytes: Buffer
    try {
      bytes = readFileSync(file)
    }
    catch {
      return Promise.resolve(refusedRun('script-missing', `脚本文件读不到：${request.script.file}`))
    }
    if (bytes.length > SCRIPT_MAX_BYTES) {
      return Promise.resolve(refusedRun('too-large', `脚本超过 ${SCRIPT_MAX_BYTES} 字节，人看不完的原文不跑`))
    }
    if (!inside(realOrSelf(file), project)) {
      return Promise.resolve(refusedRun('outside-project', `脚本经符号链接指到了项目之外：${request.script.file}`))
    }
    const hash = scriptSha256(bytes)
    if (hash !== request.script.sha256) {
      return Promise.resolve(refusedRun('script-changed', '脚本与同意时的哈希对不上，先不跑'))
    }
    const spec = INTERPRETERS[request.script.lang]
    const resolved = resolveProgram(spec.program, project, project, worktreesOf(project))
    if (!resolved.ok) {
      return Promise.resolve(crashedRun('spawn', `找不到 ${spec.program}：PATH 里项目之外的目录都没有它`))
    }
    const copyDir = join(project, '.llm', 'loops', 'run')
    mkdirSync(copyDir, { recursive: true })
    const copy = join(copyDir, `${request.envelope.run}.${SCRIPT_SUFFIX[request.script.lang]}`)
    try {
      writeFileSync(copy, bytes, { flag: 'wx' })
    }
    catch (error) {
      return Promise.resolve(crashedRun('io', `脚本副本写不下：${message(error)}`))
    }
    const firstLine = `$ ${commandText(request.script)} · sha256 ${hash} · program ${resolved.path}`
    const start = (timeoutMs: number): Promise<ScriptResult> => runProcess({
      program: resolved.path,
      args: [...spec.before, copy],
      cwd: project,
      env: envOf(request.envelope, project),
      stdin: JSON.stringify(request.envelope),
      timeoutMs,
      capBytes: OUTPUT_DEFAULT_BYTES,
      ...(request.logFile === undefined ? {} : { logFile: request.logFile, firstLine }),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      finish: () => {
        unlinkSync(copy)
      },
    }).then(result => {
      if (result.kind !== 'exited') {
        // A tree ended hard can hold the copy a moment on Windows: one late try, the hour sweep behind it.
        setTimeout(() => {
          try {
            unlinkSync(copy)
          }
          catch {
            // The sweep of stale copies takes it later.
          }
        }, 1_000).unref()
      }
      return result
    })
    if (request.purpose === 'gate') {
      const arrived = Date.now()
      const limit = gateTimeoutOf(request)
      return laneFor(`gate\n${fold(project)}`, GATE_CONCURRENT).enterWithin(limit, GATE_QUEUE_MAX, request.signal).then(async (entered) => {
        if (typeof entered === 'string') {
          // The place never came: the copy is not wanted, and the answer is the one of a script that ran out of time (or was called off).
          try {
            unlinkSync(copy)
          }
          catch {
            // The sweep of stale copies takes it later.
          }
          return entered === 'aborted' ? refusedRun('aborted', '在脚本起来之前，这次运行已经被中止') : { kind: 'timeout' as const, stdout: '', stderr: '', durationMs: Date.now() - arrived }
        }
        try {
          return await start(Math.max(1, limit - (Date.now() - arrived)))
        }
        finally {
          entered()
        }
      })
    }
    return laneFor(`work\n${fold(project)}\n${request.envelope.board}`, 1).enter().then(release => start(timeoutOf(request)).then(result => {
      release()
      return result
    }))
  }
  catch (error) {
    return Promise.resolve(crashedRun('io', message(error)))
  }
}

/**
 * Run one command of a check entry or of M4's own checkers (design §6.6):
 * no file to verify — the entry's `argv` is the pin, and the loop board
 * compares it with the tool node before every run — so what the request
 * carries is what runs. The working directory must be the main checkout or
 * one of its work trees (M4 design §6.3: the check runs where the changed
 * files are); `argv[0]` goes through `resolveProgram`, and a `.cmd`/`.bat`
 * answer is a `crashed` before anything starts.
 */
export function runCommand(request: CommandRequest): Promise<ScriptResult> {
  try {
    if (request.queue === 'check' && request.envelope === undefined) {
      return Promise.resolve(refusedRun('aborted', 'queue check needs an envelope'))
    }
    const project = realOrSelf(request.project)
    const worktrees = worktreesOf(project)
    const cwd = realOrSelf(resolve(request.cwd ?? project))
    const roots = [project, ...worktrees].map(realOrSelf)
    if (!roots.some(root => fold(cwd) === fold(root))) {
      return Promise.resolve(refusedRun('outside-project', `工作目录不是这个项目的检出：${request.cwd ?? project}`))
    }
    const program = request.argv[0] ?? ''
    const resolved = resolveProgram(program, cwd, project, worktrees)
    if (!resolved.ok) return Promise.resolve(crashedRun('spawn', `找不到 ${program}`))
    if (resolved.needsShell) {
      return Promise.resolve(crashedRun('spawn', '这条命令要经 cmd 才能跑，请在工具节点里写成能直接起的程序（例 node 加脚本路径）'))
    }
    const plan: ProcessPlan = {
      program: resolved.path,
      args: request.argv.slice(1),
      cwd,
      env: envOf(request.envelope, project),
      timeoutMs: timeoutOf(request),
      capBytes: outputOf(request.maxOutputBytes),
      ...(request.logFile === undefined ? {} : { logFile: request.logFile, firstLine: `$ ${commandText(request.argv)} · program ${resolved.path}` }),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    }
    if (request.queue === 'direct') return runProcess(plan)
    // A project runs at most CHECK_CONCURRENT checks at once, in a lane of their own, never behind a work script (design §6.6, review F50).
    return laneFor(`check\n${fold(project)}`, CHECK_CONCURRENT).enter().then(release => runProcess(plan).then(result => {
      release()
      return result
    }))
  }
  catch (error) {
    return Promise.resolve(crashedRun('io', message(error)))
  }
}

/**
 * Remove the private copies a crash left behind (design §6.6): the runner
 * calls this once a beat, and anything older than an hour goes. Never throws.
 */
export function sweepRunCopies(projectRoot: string, nowMs: number): void {
  const dir = join(projectRoot, '.llm', 'loops', 'run')
  let names: string[]
  try {
    names = readdirSync(dir)
  }
  catch {
    return
  }
  for (const name of names) {
    try {
      if (nowMs - statSync(join(dir, name)).mtimeMs > 3_600_000) unlinkSync(join(dir, name))
    }
    catch {
      // Gone already, or held by a live process: the next beat tries again.
    }
  }
}
