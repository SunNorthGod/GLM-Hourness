/**
 * The trial run (takeover design 0.6 §6): before the human agrees, the
 * commands the takeover proposes run once in a copy of HEAD, under DSH's
 * sandbox, with an environment that holds no credential, so the list round
 * can say whether each one runs and how long it takes.
 *
 * - The copy: `git clone --template= --shared --no-checkout` of the project
 *   into `<tmp>/hourness-trial-<project key>-<takeover>-<round>/repo`, a
 *   detached checkout of HEAD without LFS smudging, the remote removed. No
 *   hooks (an empty template), no untracked files, no hard links (alternates
 *   read the original objects). A marker file `.hourness-trial` names the
 *   host and the command process (§6.2 item 1).
 * - The wrap: every process goes through `sandbox.confine(argv,
 *   {mode: 'workspace-write', workspaceRoot: <trial dir>})` without a
 *   session (§6.2 item 4); a gate line runs in the shell M7's gate uses
 *   (`cmd.exe /d /s /c`, `/bin/sh -c`), a check line as its argument vector
 *   (M4 §6.1.1). No sandbox, or `SANDBOX_UNAVAILABLE`: nothing runs.
 * - Limits: 10 minutes a command, `trialMinutes` a round (warm-up and probes
 *   included). A timeout ends the whole process tree (`killTree`, the loop
 *   board's executor), that command is `timed-out` and the others still run.
 * - What stays: one log per command under `.llm/bootstrap/<id>/trial/`
 *   (at most 20 MiB, the last 1 MiB kept in memory to read), `trial.json`,
 *   a journal `trial` record and a `bootstrap.trial` metrics event per
 *   command. The trial directory is removed at the end; a host that died
 *   mid-round leaves it to `sweepTrialDirs` on the next activation, which
 *   ends a process only when its command line names that directory.
 *
 * Never throws: every failure is an outcome or a `reason`.
 */
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync, writeSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { killTree } from '../loops/script.ts'
import type { SandboxLike } from '../shared/dsh-min.ts'
import { trialEnv, TRIAL_HOME_DIRS } from './trial-env.ts'
import { classify, envKeyOf, shellArgv, TRIAL_COMMAND_MS, type ConfinedFacts, type TrialCommand, type TrialOutcome } from './trial-plan.ts'

/** The name every trial directory starts with; nothing else is ever removed. */
export const TRIAL_PREFIX = 'hourness-trial-'
const MARKER = '.hourness-trial'
const LOG_LIMIT = 20 * 1024 * 1024
const KEPT_LIMIT = 1024 * 1024
const GIT_MS = 120_000
const WARMUP_MS = 5 * 60_000
/** The trial directories a round of this process is using now; the sweep leaves them alone. */
const ACTIVE = new Set<string>()

/** One command's result in `trial.json` (§6.3). */
export interface TrialResult {
  readonly commandId: string
  readonly text: string
  readonly kind: TrialCommand['kind']
  readonly cls: TrialCommand['cls']
  readonly node: string
  readonly origin: TrialCommand['origin']
  readonly outcome: TrialOutcome
  readonly reason?: string
  readonly exit?: number
  readonly ms?: number
  readonly limitMs: number
  readonly limitSource: 'ceiling'
  readonly matchedLine?: string
  readonly afterSetupFailure?: boolean
  readonly log?: string
  readonly head: string
  readonly envKey: string
  readonly enforcement?: 'full' | 'partial'
  readonly coldCache: true
  readonly estimateSec?: number
  /** Taken over from the round before (same head, text and environment key), not run again. */
  readonly reused?: true
}

/** `trial.json`: one round's results; `done` once every command has one. */
export interface TrialFile {
  readonly round: number
  readonly head: string
  readonly envKey: string
  readonly startedAt: string
  readonly done: boolean
  /** Why nothing ran this round, when nothing did (no sandbox, the copy failed). */
  readonly reason?: string
  readonly results: readonly TrialResult[]
  readonly limitMs: number
  readonly usedMs: number
  /** The commands and head the round was started for: the row does not start the same plan twice. */
  readonly planKey?: string
}

export interface TrialInput {
  readonly root: string
  readonly takeoverId: string
  readonly head: string
  readonly round: number
  readonly commands: readonly TrialCommand[]
  readonly probes: readonly string[]
  readonly sandbox: SandboxLike | undefined
  /** The round's total, in milliseconds (`trialMinutes`). */
  readonly totalMs: number
  /** One command's limit; TRIAL_COMMAND_MS unless a test shortens it. */
  readonly commandMs?: number
  /** The results of the round before, reused when head, text and environment key match (§6.3). */
  readonly previous?: TrialFile
  readonly planKey?: string
  /** Each command's result as it settles (the journal record and the metrics event). */
  readonly settled?: (result: TrialResult) => Promise<void> | void
  readonly platform?: NodeJS.Platform
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly tmp?: string
  readonly realHome?: string
  readonly now?: () => number
}

const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

/** Where a takeover's trial files go: `trial.json` and the logs. */
const trialDirOf = (root: string, takeoverId: string): string => join(root, '.llm', 'bootstrap', takeoverId)

/** The `trial.json` of a takeover; undefined when there is none or it does not read. */
export function readTrialFile(root: string, takeoverId: string): TrialFile | undefined {
  try {
    return JSON.parse(readFileSync(join(trialDirOf(root, takeoverId), 'trial.json'), 'utf8')) as TrialFile
  }
  catch {
    return undefined
  }
}

function writeTrialFile(root: string, takeoverId: string, file: TrialFile): void {
  try {
    mkdirSync(trialDirOf(root, takeoverId), { recursive: true })
    writeFileSync(join(trialDirOf(root, takeoverId), 'trial.json'), `${JSON.stringify(file, null, 2)}\n`)
  }
  catch {
    // The journal records still say what ran.
  }
}

function git(cwd: string, args: readonly string[]): Promise<{ readonly code: number, readonly err: string }> {
  return new Promise((done) => {
    execFile('git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=', ...args], { cwd, timeout: GIT_MS, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (error, _out, err) => {
      done({ code: error === null ? 0 : typeof error.code === 'number' ? error.code : -1, err: String(err).trim().slice(0, 300) })
    })
  })
}

/** The copy of HEAD (§6.2 item 2); the reason when it cannot be made. */
async function cloneHead(root: string, dir: string, head: string): Promise<string | undefined> {
  const repo = join(dir, 'repo')
  const clone = await git(dir, ['clone', '--template=', '--shared', '--no-checkout', '--quiet', root, repo])
  if (clone.code !== 0) return `克隆失败：${clone.err}`
  const checkout = await git(repo, ['-c', 'filter.lfs.smudge=', '-c', 'filter.lfs.process=', '-c', 'filter.lfs.required=false', 'checkout', '--quiet', '--detach', head])
  if (checkout.code !== 0) return `检出失败：${checkout.err}`
  const remote = await git(repo, ['remote', 'remove', 'origin'])
  return remote.code === 0 ? undefined : `去掉远端失败：${remote.err}`
}

interface Marker {
  readonly takeover: string
  readonly root: string
  readonly dir: string
  readonly createdAt: string
  readonly hostPid: number
  commandPid?: number
  commandStartedAt?: string
}

function writeMarker(dir: string, marker: Marker): void {
  try {
    writeFileSync(join(dir, MARKER), `${JSON.stringify(marker)}\n`)
  }
  catch {
    // The marker only guides the sweep; the round goes on.
  }
}

/** Remove a trial directory: only one under `tmp`, named with the prefix, holding the marker. Whether it is gone. */
function removeTrialDir(dir: string, tmp: string = tmpdir()): boolean {
  const full = resolve(dir)
  const base = resolve(tmp)
  if (!full.startsWith(base + sep) || !basename(full).startsWith(TRIAL_PREFIX) || !existsSync(join(full, MARKER))) return !existsSync(full)
  try {
    rmSync(full, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
  }
  catch {
    // Held open: the sweep tries again at the next activation.
  }
  return !existsSync(full)
}

interface RunOutcome {
  readonly exit: number | null
  readonly stdout: string
  readonly stderr: string
  readonly ms: number
  readonly timedOut: boolean
  readonly spawnError?: string
}

/** Start one wrapped process and wait for its end (§6.3): the timer from the spawn, the whole tree ended at the limit, output to the log. */
function runProcess(argv: readonly string[], cwd: string, env: Record<string, string>, limitMs: number, log: string | undefined, header: string, onStart: (pid: number) => void): Promise<RunOutcome> {
  const started = Date.now()
  let fd: number | undefined
  let written = 0
  if (log !== undefined) {
    try {
      fd = openSync(log, 'w')
      writeSync(fd, header)
    }
    catch {
      fd = undefined
    }
  }
  const kept = { out: [] as Buffer[], err: [] as Buffer[], outBytes: 0, errBytes: 0 }
  return new Promise((done) => {
    let settled = false
    let timedOut = false
    let child: ChildProcess | undefined
    const clock: { timer?: NodeJS.Timeout } = {}
    const finish = (outcome: RunOutcome): void => {
      if (settled) return
      settled = true
      if (clock.timer !== undefined) clearTimeout(clock.timer)
      if (fd !== undefined) {
        try {
          if (written >= LOG_LIMIT) writeSync(fd, '\n[log cut at 20 MiB]\n')
          closeSync(fd)
        }
        catch {
          // The bytes written so far stay.
        }
      }
      done(outcome)
    }
    const text = (parts: Buffer[]): string => Buffer.concat(parts).toString('utf8')
    try {
      const [program = '', ...args] = argv
      child = spawn(program, args, { cwd, env, windowsHide: true, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
    }
    catch (error) {
      finish({ exit: null, stdout: '', stderr: '', ms: Date.now() - started, timedOut: false, spawnError: message(error) })
      return
    }
    if (child.pid !== undefined) onStart(child.pid)
    clock.timer = setTimeout(() => {
      timedOut = true
      if (child?.pid !== undefined) killTree(child.pid)
    }, limitMs)
    const take = (stream: 'out' | 'err') => (chunk: Buffer): void => {
      if (fd !== undefined && written < LOG_LIMIT) {
        try {
          const piece = chunk.subarray(0, LOG_LIMIT - written)
          writeSync(fd, piece)
          written += piece.length
        }
        catch {
          // A full disk does not stop the run.
        }
      }
      const parts = stream === 'out' ? kept.out : kept.err
      parts.push(chunk)
      const key = stream === 'out' ? 'outBytes' : 'errBytes'
      kept[key] += chunk.length
      while (kept[key] > KEPT_LIMIT && parts.length > 1) kept[key] -= parts.shift()?.length ?? 0
    }
    child.stdout?.on('data', take('out'))
    child.stderr?.on('data', take('err'))
    child.on('error', (error) => { finish({ exit: null, stdout: text(kept.out), stderr: text(kept.err), ms: Date.now() - started, timedOut, spawnError: message(error) }) })
    child.on('close', (code) => { finish({ exit: code, stdout: text(kept.out), stderr: text(kept.err), ms: Date.now() - started, timedOut }) })
  })
}

const projectKey = (root: string): string => createHash('sha256').update(resolve(root).toLowerCase()).digest('hex').slice(0, 8)

/**
 * One round of the trial (§6.3). The order is the commands' own (setup,
 * plain gate lines, `when` lines, check lines, patrol lines), after a
 * warm-up that does not count as a command and the probes whose output
 * makes the environment key. Writes `trial.json` as results come in.
 */
export async function runTrial(input: TrialInput): Promise<TrialFile> {
  const platform = input.platform ?? process.platform
  const env = input.env ?? process.env
  const tmp = input.tmp ?? tmpdir()
  const now = input.now ?? Date.now
  const commandMs = input.commandMs ?? TRIAL_COMMAND_MS
  const startedAt = new Date(now()).toISOString()
  const start = now()
  const results: TrialResult[] = []
  const base = { head: input.head, limitMs: commandMs, limitSource: 'ceiling' as const, coldCache: true as const }
  const resultOf = (command: TrialCommand, rest: Partial<TrialResult> & Pick<TrialResult, 'outcome' | 'envKey'>): TrialResult => ({
    commandId: command.id, text: command.text, kind: command.kind, cls: command.cls, node: command.node, origin: command.origin,
    ...command.estimateSec === undefined ? {} : { estimateSec: command.estimateSec }, ...base, ...rest,
  })
  let file: TrialFile = { round: input.round, head: input.head, envKey: '', startedAt, done: false, results, limitMs: input.totalMs, usedMs: 0, ...input.planKey === undefined ? {} : { planKey: input.planKey } }
  const save = (patch: Partial<TrialFile> = {}): TrialFile => {
    file = { ...file, results: [...results], usedMs: now() - start, ...patch }
    writeTrialFile(input.root, input.takeoverId, file)
    return file
  }
  const settle = async (result: TrialResult): Promise<void> => {
    results.push(result)
    save()
    try {
      await input.settled?.(result)
    }
    catch {
      // The record is the caller's; trial.json has the result.
    }
  }
  const notRunAll = async (reason: string, envKey: string, from = 0): Promise<TrialFile> => {
    for (const command of input.commands.slice(from)) await settle(resultOf(command, { outcome: 'not-run', reason: command.refused ?? reason, envKey }))
    return save({ done: true, ...from === 0 ? { reason } : {} })
  }
  save()
  if (input.sandbox === undefined) return notRunAll('这台机器上 DSH 的沙盒不可用：没有试跑', '')
  const dir = join(tmp, `${TRIAL_PREFIX}${projectKey(input.root)}-${input.takeoverId}-${input.round}`)
  ACTIVE.add(dir)
  const marker: Marker = { takeover: input.takeoverId, root: input.root, dir, createdAt: startedAt, hostPid: process.pid }
  try {
    if (existsSync(dir)) removeTrialDir(dir, tmp)
    mkdirSync(dir, { recursive: true })
    writeMarker(dir, marker)
    for (const sub of TRIAL_HOME_DIRS) mkdirSync(join(dir, 'home', ...sub.split('/')), { recursive: true })
    mkdirSync(join(dir, 'cache'), { recursive: true })
    writeFileSync(join(dir, 'home', '.gitconfig'), '')
  }
  catch (error) {
    return notRunAll(`试跑目录建不起来：${message(error)}`, '')
  }
  try {
    // A round of probes only (a new project) needs no copy: they run in the trial directory.
    const cloned = input.commands.length === 0 ? undefined : await cloneHead(input.root, dir, input.head)
    if (cloned !== undefined) return notRunAll(`这一轮没有试跑：${cloned}`, '')
    const repo = input.commands.length === 0 ? dir : join(dir, 'repo')
    const childEnv = trialEnv({ env, dir, realHome: input.realHome ?? homedir(), platform, exists: existsSync })
    const logDir = join(trialDirOf(input.root, input.takeoverId), 'trial')
    mkdirSync(logDir, { recursive: true })
    const comSpec = Object.entries(env).find(([name]) => name.toUpperCase() === 'COMSPEC')?.[1]
    let facts: ConfinedFacts | undefined
    const left = (): number => input.totalMs - (now() - start)
    const run = async (argv: readonly string[], limitMs: number, log?: string, header = ''): Promise<{ readonly outcome: RunOutcome, readonly facts: ConfinedFacts } | { readonly unavailable: string }> => {
      let wrapped
      try {
        wrapped = await input.sandbox?.confine(argv, { mode: 'workspace-write', workspaceRoot: dir })
      }
      catch (error) {
        return { unavailable: message(error).slice(0, 300) }
      }
      if (wrapped === undefined) return { unavailable: 'no sandbox' }
      facts = { enforcement: wrapped.enforcement, denialSignatures: wrapped.denialSignatures, runnerFailureRules: wrapped.runnerFailureRules }
      const outcome = await runProcess(wrapped.argv, repo, childEnv, limitMs, log, header, (pid) => {
        marker.commandPid = pid
        marker.commandStartedAt = new Date().toISOString()
        writeMarker(dir, marker)
      })
      return { outcome, facts }
    }
    // The warm-up: the first grant walks the whole tree once (windows-acl, U9); not a command, counted in the total.
    const warm = await run(shellArgv(platform === 'win32' ? 'ver' : 'true', platform, comSpec), Math.min(WARMUP_MS, Math.max(1, left())))
    if ('unavailable' in warm) return notRunAll(`这台机器上 DSH 的沙盒不可用：没有试跑（${warm.unavailable}）`, '')
    if (warm.outcome.timedOut) return notRunAll('预热超过 5 分钟：这一轮没有试跑', '')
    const probeOutputs: string[] = []
    for (const probe of input.probes) {
      if (left() <= 0) break
      const ran = await run(shellArgv(probe, platform, comSpec), Math.min(60_000, left()))
      probeOutputs.push(`${probe}\n${'unavailable' in ran ? '' : ran.outcome.exit === 0 ? ran.outcome.stdout.trim() : `exit ${String(ran.outcome.exit)}`}`)
    }
    const enforcement = facts?.enforcement ?? 'full'
    const envKey = envKeyOf(platform, enforcement, probeOutputs)
    save({ envKey })
    let setupFailed = false
    for (const [index, command] of input.commands.entries()) {
      if (command.refused !== undefined) {
        await settle(resultOf(command, { outcome: 'not-run', reason: command.refused, envKey }))
        continue
      }
      const reused = input.previous?.results.find(result => result.head === input.head && result.text === command.text && result.envKey === envKey && result.kind === command.kind && !['not-run', 'running', 'sandbox-broken'].includes(result.outcome))
      if (reused !== undefined) {
        await settle(resultOf(command, { ...reused, envKey, reused: true }))
        if (command.kind === 'setup' && reused.outcome !== 'passed') setupFailed = true
        continue
      }
      if (left() <= 0) {
        await settle(resultOf(command, { outcome: 'not-run', reason: `没试跑：试跑时间用完了（合计上限 ${Math.round(input.totalMs / 60_000)} 分钟，已用 ${Math.round((now() - start) / 60_000)} 分钟）`, envKey }))
        continue
      }
      const limitMs = Math.min(commandMs, left())
      const argv = command.argv ?? shellArgv(command.text, platform, comSpec)
      const log = join(logDir, `${String(index + 1).padStart(2, '0')}-${command.id}.log`)
      const header = [`command: ${command.text}`, `argv: ${JSON.stringify(argv)}`, `cwd: ${repo}`, `env: ${Object.keys(childEnv).sort().join(' ')}`, `enforcement: ${enforcement}`, `started: ${new Date(now()).toISOString()}`, '', ''].join('\n')
      const ran = await run(argv, limitMs, log, header)
      const logRel = `.llm/bootstrap/${input.takeoverId}/trial/${basename(log)}`
      if ('unavailable' in ran) return notRunAll(`沙盒没能包装命令：${ran.unavailable}`, envKey, index)
      const { outcome } = ran
      const after = setupFailed && command.kind !== 'setup' ? { afterSetupFailure: true } : {}
      if (outcome.timedOut) {
        await settle(resultOf(command, { outcome: 'timed-out', ms: outcome.ms, limitMs, log: logRel, envKey, enforcement, ...after }))
        if (command.kind === 'setup') setupFailed = true
        continue
      }
      if (outcome.spawnError !== undefined) {
        await settle(resultOf(command, { outcome: 'sandbox-broken', reason: `沙盒没能启动：${outcome.spawnError}`, ms: outcome.ms, log: logRel, envKey, enforcement }))
        return notRunAll(`沙盒没能启动：${outcome.spawnError}`, envKey, index + 1)
      }
      const judged = classify(outcome.exit, outcome.stderr, ran.facts, platform)
      await settle(resultOf(command, {
        outcome: judged.outcome, ...outcome.exit === null ? {} : { exit: outcome.exit }, ms: outcome.ms, log: logRel, envKey, enforcement, ...after,
        ...judged.matchedLine === undefined ? {} : { matchedLine: judged.matchedLine },
        ...judged.outcome === 'denied' ? { reason: `在隔离里被拦：${judged.target === undefined ? '要写副本以外的地方' : `要写 ${judged.target}`}` } : {},
      }))
      if (judged.outcome === 'sandbox-broken') return notRunAll(`沙盒没能启动：${judged.matchedLine ?? ''}`, envKey, index + 1)
      if (command.kind === 'setup' && judged.outcome !== 'passed') setupFailed = true
    }
    return save({ done: true })
  }
  finally {
    removeTrialDir(dir, tmp)
    ACTIVE.delete(dir)
  }
}

/** Whether a process is alive (signal 0). */
function alive(pid: number | undefined): boolean {
  if (pid === undefined || !Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  }
  catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** A process's command line (Windows through CIM, elsewhere `ps`); undefined when it cannot be read. */
function commandLineOf(pid: number): Promise<string | undefined> {
  return new Promise((done) => {
    const [program, args] = process.platform === 'win32'
      ? ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${String(pid)}").CommandLine`]] as const
      : ['ps', ['-o', 'args=', '-p', String(pid)]] as const
    execFile(program, [...args], { timeout: 15_000, windowsHide: true }, (error, out) => { done(error === null && String(out).trim() !== '' ? String(out).trim() : undefined) })
  })
}

export interface SweepOutcome {
  readonly removed: readonly string[]
  readonly killed: readonly number[]
  readonly skipped: readonly string[]
  readonly left: readonly string[]
}

/**
 * The residue of a host that died mid-round (§6.3): every marked trial
 * directory under `tmp` whose host is not alive (or is this process). A
 * command process still alive is ended, whole tree, only when its command
 * line names the directory; a pid that may have been reused is left alone.
 * Then the directory goes; one that cannot is in `left`.
 */
export async function sweepTrialDirs(options: { readonly tmp?: string, readonly self?: number, readonly readCommandLine?: (pid: number) => Promise<string | undefined>, readonly kill?: (pid: number) => void } = {}): Promise<SweepOutcome> {
  const tmp = options.tmp ?? tmpdir()
  const self = options.self ?? process.pid
  const read = options.readCommandLine ?? commandLineOf
  const kill = options.kill ?? killTree
  const removed: string[] = []
  const killed: number[] = []
  const skipped: string[] = []
  const left: string[] = []
  let names: string[]
  try {
    names = readdirSync(tmp).filter(name => name.startsWith(TRIAL_PREFIX))
  }
  catch {
    return { removed, killed, skipped, left }
  }
  for (const name of names) {
    const dir = join(tmp, name)
    let marker: Partial<Marker>
    try {
      marker = JSON.parse(readFileSync(join(dir, MARKER), 'utf8')) as Partial<Marker>
    }
    catch {
      continue
    }
    // A round of this process, or another live host, is using it; a marker naming this process otherwise is a reused pid of a dead host.
    if (ACTIVE.has(dir) || (marker.hostPid !== self && alive(marker.hostPid))) {
      skipped.push(dir)
      continue
    }
    if (alive(marker.commandPid) && marker.commandPid !== undefined) {
      const line = await read(marker.commandPid)
      if (line !== undefined && line.toLowerCase().includes(dir.toLowerCase())) {
        kill(marker.commandPid)
        killed.push(marker.commandPid)
      }
    }
    if (removeTrialDir(dir, tmp)) removed.push(dir)
    else left.push(dir)
  }
  return { removed, killed, skipped, left }
}
