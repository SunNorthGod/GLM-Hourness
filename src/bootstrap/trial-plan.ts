/**
 * What a trial run runs and how its results read (takeover design 0.6 §6.1,
 * §6.2 item 5, §6.3). Pure: the graph, the scan and the default table in,
 * the ordered command list out, each command with whether it may run before
 * the human agrees and why not; the classification of one settled run; the
 * environment key results are reused under.
 *
 * Only a command whose text is word for word a scan candidate read from HEAD
 * or a row of the default table for this platform may run (§6.1 condition
 * 1): the main agent read README and docs that a prompt injection can
 * change, so its own text never executes here. Conditions 2–4 are the scan's
 * danger, long-running and multi-line marks; 5 and 6 (the sandbox, the total
 * time) are the runner's.
 *
 * The gate lines are read with M7's parser (src/execute/gate-norm.ts
 * `parseGateNorm`, plan B7's round trip): the forms M7 does not know are
 * prose and the trial skips them, exactly as its gate will.
 */
import { createHash } from 'node:crypto'
import { isEnvTool, nodeChecks } from '../env/branch.ts'
import { fillCheckArgv } from '../env/check-entry.ts'
import type { GraphNode } from '../graph/schema.ts'
import { parseGateNorm } from '../execute/gate-norm.ts'
import { matchesFilter } from '../loops/trigger.ts'
import { dangerOf, longRunningOf } from './danger.ts'
import { DEFAULT_KEYS, DEFAULTS_VERSION, ecosystemDefaults, toolNodeDraft, type DefaultKey } from './defaults.ts'
import type { CommandCandidate } from './extract.ts'
import type { CommandClass } from './present.ts'
import type { ScanResult } from './scan.ts'
import { TRIAL_ENV_VERSION } from './trial-env.ts'

/** The fixed limit of one trial command (§6.3): the human has not agreed yet, so there is no estimate and no history. */
export const TRIAL_COMMAND_MS = 10 * 60_000
/** The default total of one round, warm-up and probes included (`trialMinutes`, 1–240). */
export const TRIAL_MINUTES_DEFAULT = 45

export type TrialOutcome = 'passed' | 'failed' | 'denied' | 'confinement-limited' | 'timed-out' | 'sandbox-broken' | 'not-run' | 'running'

/** Where a command text came from: a scan candidate of HEAD, the default table, or the main agent (never run). */
type TrialOrigin = 'scan' | 'default' | 'agent'

/** What line a command stands on: the gate's setup, plain, `when` and patrol lines, a tool node's check line. */
type TrialKind = 'setup' | 'gate' | 'when' | 'check' | 'patrol'

export interface TrialCommand {
  /** The first 12 hex digits of the text's SHA-256 (the scan's candidate id). */
  readonly id: string
  /** The command as written: a gate line's command, or a check line's command with `{files}`. */
  readonly text: string
  readonly kind: TrialKind
  readonly cls: CommandClass
  /** The node the line is on. */
  readonly node: string
  /** A check line runs without a shell (M4 §6.1.1): its argument vector with `{files}` filled; a gate line runs whole in a shell. */
  readonly argv?: readonly string[]
  /** A check line's `<预计>`, in seconds, when it has one. */
  readonly estimateSec?: number
  readonly origin: TrialOrigin
  /** Why it may not run before the human agrees; undefined when it may. */
  readonly refused?: string
}

const idOf = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 12)

const MERGE_GATE_ID = 'norm-merge-gate'

/** The texts the default table gives this project (setup, gate and check commands of the recognised ecosystems; every row for a new one). */
export function defaultTexts(scan: ScanResult, files: readonly string[], platform: NodeJS.Platform, fresh: boolean): ReadonlySet<string> {
  const texts = new Set<string>()
  for (const key of (fresh ? DEFAULT_KEYS : scan.stacks) as readonly string[]) {
    const row = ecosystemDefaults(key as DefaultKey, { platform, files, fresh })
    if (row === undefined) continue
    for (const command of row.setup) texts.add(command)
    for (const entry of row.gate) texts.add(entry.command)
    for (const tool of row.tools) {
      const line = toolNodeDraft(tool).acceptance[0] ?? ''
      const command = /\$ (.*)` when /.exec(line)?.[1]
      if (command !== undefined) texts.add(command)
    }
  }
  return texts
}

/** Where the trial may take a text from (§6.1 condition 1). */
export interface TrialSources {
  /** The scan's candidates; only those read from HEAD count. */
  readonly scan: ScanResult
  readonly defaults: ReadonlySet<string>
}

/** Whether a text may run before the human agrees (§6.1 conditions 1–4), and where it came from. */
export function eligibility(text: string, sources: TrialSources, where: string): { readonly origin: TrialOrigin, readonly refused?: string } {
  const trimmed = text.trim()
  const fromHead = sources.scan.sources.from === 'head'
  const candidate: CommandCandidate | undefined = fromHead ? sources.scan.candidates.find(item => item.text.trim() === trimmed) : undefined
  if (candidate === undefined && !sources.defaults.has(trimmed)) return { origin: 'agent', refused: `没试跑：命令是 agent 写的（来自 ${where}）` }
  const origin: TrialOrigin = candidate === undefined ? 'default' : 'scan'
  const context = candidate === undefined ? {} : { ...candidate.name === undefined ? {} : { name: candidate.name }, ...candidate.expanded === undefined ? {} : { expanded: candidate.expanded } }
  const danger = candidate?.danger ?? dangerOf(trimmed, context)
  if (danger !== undefined && danger !== null) return { origin, refused: `没试跑：看起来会对外发布或部署（${danger}）` }
  if (candidate?.longRunning === true || longRunningOf(trimmed, context)) return { origin, refused: '没试跑：会一直跑下去' }
  if (candidate?.multiline === true) return { origin, refused: '没试跑：CI 里的多行脚本' }
  return { origin }
}

const CLASS_OF: Readonly<Record<TrialKind, CommandClass>> = { setup: 'gate', gate: 'gate', when: 'gate', check: 'check', patrol: 'patrol' }
const ORDER: readonly TrialKind[] = ['setup', 'gate', 'when', 'check', 'patrol']

/** How many files a check line's `{files}` gets in the trial (§6.3). */
const CHECK_FILES = 3

/**
 * The commands of one round (§6.3 order): the gate's setup lines, its plain
 * `$` lines, its `when` lines, the check lines with `when` of the tool
 * nodes under `env` this takeover proposed (`{files}` filled with at most
 * three tracked files they match, by path), then the patrol lines.
 */
export function trialCommands(gate: GraphNode | undefined, tools: readonly GraphNode[], files: readonly string[], sources: TrialSources): TrialCommand[] {
  const commands: TrialCommand[] = []
  for (const command of parseGateNorm(gate).commands) {
    const kind: TrialKind = command.kind === 'setup' ? 'setup' : command.kind === 'patrol' ? 'patrol' : command.when !== undefined ? 'when' : 'gate'
    commands.push({ id: idOf(command.command), text: command.command, kind, cls: CLASS_OF[kind], node: MERGE_GATE_ID, ...eligibility(command.command, sources, MERGE_GATE_ID) })
  }
  for (const tool of tools) {
    if (!isEnvTool(tool)) continue
    for (const { entry } of nodeChecks(tool)) {
      const paths = entry.paths
      if (paths === undefined) continue
      const text = entry.argv.join(' ')
      const matching = [...files].sort().filter(file => matchesFilter({ files: { paths } }, { files: [file] }, '')).slice(0, CHECK_FILES)
      const filled = fillCheckArgv(entry.argv, matching).argv
      const allowed = eligibility(text, sources, tool.id)
      const empty = entry.argv.includes('{files}') && matching.length === 0
      commands.push({
        id: idOf(text), text, kind: 'check', cls: 'check', node: tool.id, argv: filled,
        ...entry.estimateSeconds === undefined ? {} : { estimateSec: entry.estimateSeconds },
        origin: allowed.origin,
        ...allowed.refused !== undefined ? { refused: allowed.refused } : empty ? { refused: '没试跑：没有已跟踪的文件对得上它的 when' } : {},
      })
    }
  }
  return ORDER.flatMap(kind => commands.filter(command => command.kind === kind))
}

/** The probe commands of each row (§6.1, last part): they answer whether the tool is there, and their output is part of the environment key. */
const PROBES: Readonly<Partial<Record<DefaultKey, readonly string[]>>> = {
  'node-npm': ['node --version', 'npm --version'],
  'node-pnpm': ['node --version'],
  'node-yarn': ['node --version'],
  'node-bun': ['node --version'],
  'python-uv': ['uv --version'],
  go: ['go version'],
  rust: ['cargo --version', 'cargo clippy --version'],
  shell: ['shellcheck --version'],
  cmake: ['clang-tidy --version', 'cmake --version'],
}

/** The probes of the recognised ecosystems; every probe for a new project. */
export function probesOf(scan: ScanResult, fresh: boolean): readonly string[] {
  const keys = (fresh ? DEFAULT_KEYS : scan.stacks) as readonly string[]
  return [...new Set(keys.flatMap(key => PROBES[key as DefaultKey] ?? []))]
}

/**
 * The key a result is reused under (§6.3): the whitelist's and the default
 * table's versions, the platform, the sandbox's enforcement and what the
 * probes printed. A new tool version, whitelist or table runs it again.
 */
export function envKeyOf(platform: NodeJS.Platform, enforcement: string, probeOutputs: readonly string[]): string {
  return createHash('sha256').update([TRIAL_ENV_VERSION, DEFAULTS_VERSION, platform, enforcement, ...probeOutputs].join('\n')).digest('hex').slice(0, 12)
}

/** The argument vector a gate line runs as: the same shell M7's gate spawns with `shell: true` (§6.2 item 4). */
export function shellArgv(command: string, platform: NodeJS.Platform, comSpec: string | undefined): readonly string[] {
  return platform === 'win32' ? [comSpec ?? 'cmd.exe', '/d', '/s', '/c', command] : ['/bin/sh', '-c', command]
}

/** The rules of a confined wrap the classification reads (rc.3 dsh-sandbox `ConfinedArgv`). */
export interface ConfinedFacts {
  readonly enforcement: 'full' | 'partial'
  readonly denialSignatures: readonly string[]
  readonly runnerFailureRules: ReadonlyArray<{ readonly allowedExitCodes?: readonly number[], readonly fatalSignatures: readonly string[], readonly informationalLines?: readonly string[] }>
}

/** What a settled run reads as (§6.2 item 5), with the stderr line that decided it. */
export interface Classified {
  readonly outcome: 'passed' | 'failed' | 'denied' | 'confinement-limited' | 'sandbox-broken'
  readonly matchedLine?: string
  /** For `denied`: the first path in stderr, when there is one. */
  readonly target?: string
}

const MATCHED_LIMIT = 200

/**
 * One settled run (§6.2 item 5): a runner failure (nonzero, its exit gate,
 * a fatal stderr line) is `sandbox-broken`; on Windows under `partial`, a
 * nonzero exit with `EPERM` or a denial signature in stderr is
 * `confinement-limited` (a confined program cannot start a child with pipes,
 * and that text reads the same as a write the sandbox refused); elsewhere a
 * denial signature is `denied`; else the exit code decides. A signal death
 * (exit null) is `failed`.
 */
export function classify(exit: number | null, stderr: string, facts: ConfinedFacts, platform: NodeJS.Platform): Classified {
  const lines = stderr.split(/\r?\n/)
  if (exit !== null && exit !== 0) {
    for (const rule of facts.runnerFailureRules) {
      if (rule.allowedExitCodes !== undefined && !rule.allowedExitCodes.includes(exit)) continue
      const benign = new Set((rule.informationalLines ?? []).map(line => line.toLowerCase()))
      const fatal = rule.fatalSignatures.filter(signature => signature.trim() !== '').map(signature => signature.toLowerCase())
      const line = lines.find(text => !benign.has(text.toLowerCase()) && fatal.some(signature => text.toLowerCase().includes(signature)))
      if (line !== undefined) return { outcome: 'sandbox-broken', matchedLine: line.slice(0, MATCHED_LIMIT) }
    }
  }
  if (exit === 0) return { outcome: 'passed' }
  const signatures = facts.denialSignatures.map(signature => signature.toLowerCase())
  const denial = lines.find(text => signatures.some(signature => text.toLowerCase().includes(signature)))
  if (exit !== null && platform === 'win32' && facts.enforcement === 'partial') {
    const line = lines.find(text => text.includes('EPERM')) ?? denial
    if (line !== undefined) return { outcome: 'confinement-limited', matchedLine: line.slice(0, MATCHED_LIMIT) }
  }
  if (exit !== null && platform !== 'win32' && denial !== undefined) {
    const target = /([A-Za-z]:\\[^\s'"]+|\/[^\s'":]+)/.exec(denial)?.[1]
    return { outcome: 'denied', matchedLine: denial.slice(0, MATCHED_LIMIT), ...target === undefined ? {} : { target } }
  }
  return { outcome: 'failed' }
}
