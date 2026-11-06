/**
 * `checkCall`: judge a hypothetical tool call against a project's rules
 * without being inside DSH (docs/ORCHESTRATION.md §16.10; design §9.4). The
 * rules command line, a repository script that wants to ask before it runs
 * and the loop board all come through here. It builds the events of the call
 * (`gateEvents`) and the input of the judgement (`judgeInput`) with the same
 * functions the tool-call gate uses and judges with the same `judge` over the
 * same table of rules (the person's rules, the default rule, and the entries
 * the peak level enables); only where a value comes from differs, because
 * there is no session, no pricing service and no focused goal here:
 *
 * - `glm-peak`: the caller's value, else the reading in the heartbeat of a
 *   host that is alive, else unknown;
 * - the stage, the role, the model and the session: only what the caller says;
 * - the signals of the project: the project's state, as the gate reads them.
 *
 * It writes nothing and takes no lock: the state is read the way every reader
 * reads it (a state that disagrees with its journal is replayed in memory),
 * and the one thing it hands out besides the result is a `rules.check` event
 * to the metrics exit, which can fail without anyone noticing. A rule that
 * runs a script is judged as one whose script is not approved: the library
 * starts no process, and nothing can approve a script yet.
 */
import { resolve } from 'node:path'
import { projectOf } from '../data/project-root.ts'
import { STAGES } from '../graph/schema.ts'
import { runScript } from '../loops/script.ts'
import { describeCall } from './call.ts'
import { denialText, type PeakSetting } from './denial.ts'
import { gateEvents } from './events.ts'
import { hostPeak, liveHeartbeats, readHeartbeats, type HostHeartbeat, type HostPeak } from './heartbeat.ts'
import { combine, judge, judgeInput, type JudgeResult, type Truth } from './judge.ts'
import { openTickets, projectSignals, rulesInForce, stateNotes } from './listing.ts'
import { emitMetric, type MetricExit, type RulesCheckEvent } from './metrics.ts'
import { approvedScriptRules, effectivePeakMode, effectOf, type Effect, type PeakLevel, type ProjectState } from './model.ts'
import { readProject } from './repo.ts'
import { runPendingScripts, type RunScript } from './script-run.ts'
import { showText } from './show.ts'
import { GLM_PEAK, effectiveSignal, type SignalReading } from './signals.ts'
import { rulesPaths } from './store.ts'
import { readingsOf, signalsRead, tableOf } from './table.ts'

/** The signals the host computes and a caller may give a value for. */
export type HostSignal = 'glm-peak'
export const HOST_SIGNALS: readonly HostSignal[] = [GLM_PEAK]

export interface CheckOptions {
  /** A directory of the project; the project root and the project are found from it (design §7.3). */
  readonly project: string
  /** The rules directory in the repository, relative to the root unless absolute. Default `docs/rules`. */
  readonly rulesDir?: string
  readonly session?: string
  /** `provider/model` of the calling session. */
  readonly model?: string
  readonly role?: 'main-agent' | 'root' | 'subagent'
  /** The stage of the focused goal (`src/graph/schema.ts`). */
  readonly stage?: string
  /** Host signals the caller gives a value for; a value given is used and no heartbeat is read for it. */
  readonly signals?: Readonly<Partial<Record<HostSignal, boolean>>>
  /** Whether the run spends GLM credit and could wait (`optional`) or not (`necessary`); absent means it does not say. */
  readonly glmSpend?: 'optional' | 'necessary'
  /** The end of the GLM peak the caller's `glm-peak` belongs to (ISO 8601); the words of a deferral say when to try again. Only with a `glm-peak` the caller gives. */
  readonly peakUntil?: string
  /** How long the caller has waited since its first judgement; goes into the event, changes nothing else. */
  readonly waitedMs?: number
  /** Who asked: the command line says `cli`. Goes into the event. */
  readonly caller?: 'cli' | 'library'
  /** Where the `rules.check` event goes; default nowhere (metrics.ts). */
  readonly metrics?: MetricExit
  /** The moment of the judgement in milliseconds; only a test sets it. */
  readonly now?: number
  /** Starts a script a person approved; default the shared executor's 
unScript (src/loops/script.ts), the one place a process is started. A test gives a stand-in. */
  readonly runScript?: RunScript
}

export interface CheckResult {
  /** `allow`: no rule applied. */
  readonly effect: 'allow' | Effect
  /** 4 for a block, 5 for a deferral, 0 for the rest. */
  readonly exitCode: 0 | 4 | 5
  /** The rules that listen to the call and pass its filter, with the value of their condition. A rule that runs a script has the effect `script` unless the script's failure setting made it a block. */
  readonly rules: ReadonlyArray<{ readonly id: string, readonly title: string, readonly effect: Effect | 'script', readonly when: Truth }>
  /** The refusal, for a block or a deferral. */
  readonly text?: string
  /** The signals the conditions and lifetimes of those rules read. */
  readonly signals: readonly SignalReading[]
  /** Rules that did not apply because a field they ask about was not given. */
  readonly subjects: JudgeResult['subjects']
  /** What became of each script of the rules that applied: run (`allow`, `block`, `queue`, or a failure: `failed`, `timeout`, `refused` when the executor would not run it), or not run (`refused`: not approved on this machine, or called from inside a script). */
  readonly scripts: ReadonlyArray<{ readonly rule: string, readonly file?: string, readonly outcome: 'allow' | 'block' | 'queue' | 'failed' | 'timeout' | 'refused', readonly ms?: number }>
  readonly peakMode: PeakLevel
  readonly notes: readonly string[]
}

/** `usage`: an option that does not fit; `io`: the state of the project cannot be read. */
export class RulesCheckError extends Error {
  readonly code: 'usage' | 'io'

  constructor(code: 'usage' | 'io', message: string) {
    super(message)
    this.name = 'RulesCheckError'
    this.code = code
  }
}

const usage = (message: string): RulesCheckError => new RulesCheckError('usage', message)

// ------------------------------------------------------------ reading a project

/** A project as a check or a show reads it. */
interface View {
  readonly root: string
  readonly state: ProjectState
  readonly notes: string[]
  /** The heartbeats of the hosts that are alive, newest first. */
  readonly hosts: readonly HostHeartbeat[]
  readonly now: Date
}

/** A state that disagrees with its journal is read again after this, up to this many times, before it is replayed in memory (a writer may be between its append and its rename). */
const REREAD_AFTER_MS = 50
const REREADS = 3

const sleep = (ms: number): Promise<void> => new Promise(resolveSleep => setTimeout(resolveSleep, ms))

async function readView(project: string, rulesDir: string | undefined, now: Date): Promise<View> {
  const notes: string[] = []
  const location = projectOf(resolve(project))
  const root = location?.root ?? resolve(project)
  if (location === undefined) notes.push(`${resolve(project)} 不在 git 仓库里，也没有 .llm/，按没有规则板的状态判`)
  const paths = rulesPaths(root, rulesDir)
  try {
    let read = readProject(paths)
    for (let attempt = 0; attempt < REREADS && read.load.plan !== undefined; attempt++) {
      await sleep(REREAD_AFTER_MS)
      read = readProject(paths)
    }
    notes.push(...stateNotes(read))
    const { heartbeats, unreadable } = readHeartbeats(paths)
    notes.push(...unreadable.map(name => `心跳文件 ${name} 读不出，没有采用`))
    return { root, state: read.state, notes, hosts: liveHeartbeats(heartbeats, now.getTime()), now }
  }
  catch (error) {
    throw new RulesCheckError('io', `项目 ${root} 的规则板状态读不出：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** The reading of `glm-peak` and, while it is peak, when the peak ends. */
function glmPeakOf(given: boolean | undefined, host: HostPeak, peakUntil: string | undefined): { readonly reading: SignalReading, readonly until?: string } {
  if (given !== undefined) return { reading: { name: GLM_PEAK, source: 'caller', value: given }, ...(given && peakUntil !== undefined ? { until: peakUntil } : {}) }
  if ('value' in host) return { reading: { name: GLM_PEAK, source: 'heartbeat', host: host.host, value: host.value }, ...(host.value && host.until !== undefined ? { until: host.until } : {}) }
  return { reading: host.host === undefined ? { name: GLM_PEAK, source: 'none', unknown: host.unknown } : { name: GLM_PEAK, source: 'heartbeat', host: host.host, unknown: host.unknown } }
}

// ----------------------------------------------------------------- the options

const ROLES: readonly string[] = ['main-agent', 'root', 'subagent']

function checkOptions(call: { readonly tool: string }, options: CheckOptions): void {
  if (typeof call.tool !== 'string' || call.tool.length < 1 || call.tool.length > 64) throw usage('--tool 要写 1 到 64 个字符的工具名')
  if (typeof options.project !== 'string' || options.project === '') throw usage('--project 要写一个目录')
  if (options.role !== undefined && !ROLES.includes(options.role)) throw usage(`--role 要写 ${ROLES.join('、')} 里的一个`)
  if (options.stage !== undefined && !(STAGES as readonly string[]).includes(options.stage)) throw usage(`--stage 要写 ${STAGES.join('、')} 里的一个`)
  if (options.model !== undefined) {
    const slash = options.model.indexOf('/')
    if (options.model.length > 200 || slash < 1 || slash === options.model.length - 1) throw usage('--model 要写成 提供方/模型，两段都不能空，至多 200 个字符')
  }
  if (options.session !== undefined && (options.session.length < 1 || options.session.length > 128)) throw usage('--session 要写 1 到 128 个字符')
  if (options.glmSpend !== undefined && options.glmSpend !== 'optional' && options.glmSpend !== 'necessary') throw usage('--glm-spend 要写 optional 或 necessary')
  if (options.waitedMs !== undefined && !(Number.isInteger(options.waitedMs) && options.waitedMs >= 0)) throw usage('--waited-ms 要写成不小于 0 的整数毫秒')
  if (options.peakUntil !== undefined) {
    if (options.signals?.[GLM_PEAK] === undefined) throw usage('--peak-until 要和 --signal glm-peak=true 一起给')
    if (Number.isNaN(Date.parse(options.peakUntil))) throw usage('--peak-until 要写成 ISO 8601 的时刻')
  }
}

/** The names a caller may give a value for, and the values: after the state is read, because a name in the state gets its own answer. */
function checkSignals(signals: Readonly<Record<string, unknown>> | undefined, state: ProjectState): void {
  for (const [name, value] of Object.entries(signals ?? {})) {
    if (!(HOST_SIGNALS as readonly string[]).includes(name)) {
      throw usage(Object.hasOwn(state.signals ?? {}, name)
        ? `${name} 存在项目状态里，命令行不能给它值；改它用规则页或 /rules on|off`
        : `${name} 没有这个宿主信号；命令行只能给 ${HOST_SIGNALS.join('、')} 的值`)
    }
    if (typeof value !== 'boolean') throw usage(`${name} 的值要写 true 或 false`)
  }
}

// ------------------------------------------------------------------- the check

const EXIT_CODE = { block: 4, queue: 5 } as const

/**
 * Judge `call` (`tool` is the DSH native name) against the project. A usage
 * error throws `RulesCheckError('usage')` before anything is judged; a state
 * that cannot be read throws `RulesCheckError('io')`. Every judgement sends
 * one `rules.check` event, whatever the verdict.
 */
export async function checkCall(call: { readonly tool: string, readonly args: unknown }, options: CheckOptions): Promise<CheckResult> {
  checkOptions(call, options)
  const now = new Date(options.now ?? Date.now())
  const caller = options.caller ?? 'library'
  const view = await readView(options.project, options.rulesDir, now)
  checkSignals(options.signals, view.state)

  const peak = effectivePeakMode(view.state)
  const host = hostPeak(view.hosts, now.getTime())
  const { reading: glmPeak, until } = glmPeakOf(options.signals?.[GLM_PEAK], host, options.peakUntil)
  const readings = readingsOf(view.state, glmPeak, now)
  const table = tableOf(view.state, peak.level)

  const described = describeCall(call.tool, call.args)
  const spelled = (field: string): string => (caller === 'cli' ? `命令行没有给 --${field}` : `调用方没有给 ${field}`)
  const input = judgeInput({
    now,
    project: view.root,
    events: gateEvents({
      at: now.toISOString(),
      project: view.root,
      cwd: resolve(options.project),
      tool: call.tool,
      args: call.args,
      ...(described.command === undefined ? {} : { command: described.command }),
      ...(described.writes === undefined ? {} : { writes: described.writes }),
      ...(options.role === undefined ? {} : { role: options.role }),
      ...(options.model === undefined ? {} : { model: options.model }),
      ...(options.session === undefined ? {} : { session: options.session }),
      ...(options.glmSpend === undefined ? {} : { glmSpend: options.glmSpend }),
      caller,
    }),
    signals: [...readings.values()],
    stage: options.stage === undefined ? { unknown: '命令行没有会话的焦点，用 --stage 给' } : { stage: options.stage },
    unreadable: { role: spelled('role'), model: spelled('model'), session: spelled('session') },
  })
  const judged = judge(input, table, { approved: approvedScriptRules(view.state) })

  const byId = new Map(table.map(rule => [rule.id, rule]))
  // A script that calls `checkCall` again (it runs `npm run -s rules -- check`) is told what the rules say of their own actions and runs no script: otherwise a script could call itself without end.
  const insideScript = process.env.HOURNESS_BOARD === 'rules'
  const ran = judged.pending.length === 0 || insideScript
    ? []
    : await runPendingScripts({
      pending: judged.pending,
      info: (id) => {
        const rule = byId.get(id)
        return { title: rule?.title ?? id, filtersWrites: rule?.filter?.writes !== undefined }
      },
      root: view.root,
      events: input.events,
      now,
      ...(options.session === undefined ? {} : { session: options.session }),
      run: options.runScript ?? runScript,
    })
  const verdict: JudgeResult = ran.length === 0 ? judged : { ...judged, ...combine([...judged.hits, ...ran.flatMap(outcome => outcome.hit ?? [])]) }
  const hitOf = new Map(verdict.hits.map(hit => [hit.rule, hit]))
  const applicable = verdict.evaluated.flatMap(({ rule: id, when }) => {
    const rule = byId.get(id)
    return rule === undefined ? [] : [{ rule, when }]
  })
  const rules = applicable.map(({ rule, when }): CheckResult['rules'][number] => ({ id: rule.id, title: rule.title, effect: hitOf.get(rule.id)?.effect ?? effectOf(rule.action) ?? 'script', when }))
  const signalNames = new Set(applicable.flatMap(({ rule }) => signalsRead(rule)))
  const signals = [...signalNames].map(name => readings.get(name) ?? effectiveSignal(name, undefined, now))

  const refusal = verdict.effect === 'block' || verdict.effect === 'queue' ? verdict.effect : undefined
  const strongest = verdict.strongest.flatMap((hit) => {
    const rule = byId.get(hit.rule)
    return rule === undefined ? [] : [{ hit, rule }]
  })
  const result: CheckResult = {
    effect: verdict.effect,
    exitCode: refusal === undefined ? 0 : EXIT_CODE[refusal],
    rules,
    ...(refusal === undefined ? {} : { text: denialText({ attempt: described.attempt, effect: refusal, rules: strongest, peak: { ...peak, ...(until === undefined ? {} : { until }) } }) }),
    signals,
    subjects: verdict.subjects,
    scripts: [
      ...verdict.refused.map(script => ({ rule: script.rule, outcome: 'refused' as const })),
      ...(insideScript ? judged.pending.map(script => ({ rule: script.rule, file: script.script.file, outcome: 'refused' as const })) : []),
      ...ran.map(outcome => ({ rule: outcome.rule, file: outcome.file, outcome: outcome.outcome, ...(outcome.ms === undefined ? {} : { ms: outcome.ms }) })),
    ],
    peakMode: peak.level,
    notes: [
      ...view.notes,
      ...verdict.refused.map(script => script.reason),
      ...(insideScript && judged.pending.length > 0 ? ['在脚本里自查，没有再跑脚本'] : []),
      ...ran.flatMap(outcome => outcome.note ?? []),
    ],
  }

  const event: RulesCheckEvent = {
    event: 'rules.check',
    effect: result.effect,
    exitCode: result.exitCode,
    rules: verdict.hits.map(hit => hit.rule),
    peakMode: { level: peak.level, origin: peak.origin },
    ...(options.glmSpend === undefined ? {} : { glmSpend: options.glmSpend }),
    glmPeakSource: glmPeak.source,
    unknownSignals: signals.filter(signal => signal.value === undefined).map(signal => signal.name),
    ...(options.waitedMs === undefined ? {} : { waitedMs: options.waitedMs }),
    caller,
  }
  await emitMetric(event, view.root, options.metrics)
  return result
}

// -------------------------------------------------------------------- the show

export interface ShowOptions {
  readonly project: string
  readonly rulesDir?: string
  /** The moment in milliseconds; only a test sets it. */
  readonly now?: number
}

export interface ShowResult {
  readonly project: string
  /** The same text `rules_show` gives an agent. */
  readonly text: string
  readonly peakMode: PeakSetting
  /** `glm-peak` first, then the signals of the project. */
  readonly signals: readonly SignalReading[]
  readonly notes: readonly string[]
}

/** What `rules_show` shows, for a reader with no session: all the rules in force, whoever they are about. Writes nothing. */
export async function showProject(options: ShowOptions): Promise<ShowResult> {
  const now = new Date(options.now ?? Date.now())
  const view = await readView(options.project, options.rulesDir, now)
  const peak = effectivePeakMode(view.state)
  const { reading: glmPeak, until } = glmPeakOf(undefined, hostPeak(view.hosts, now.getTime()), undefined)
  const readings = readingsOf(view.state, glmPeak, now)
  const input = judgeInput({ now, project: view.root, events: [], signals: [...readings.values()] })
  const rules = rulesInForce(view.state, tableOf(view.state, peak.level), input)
  const tickets = openTickets(view.state)
  const signals = projectSignals(view.state, readings)
  return {
    project: view.root,
    text: showText({ project: view.root, peak, glmPeak, ...(until === undefined ? {} : { until }), rules, tickets, signals, notes: view.notes }),
    peakMode: peak,
    signals: [glmPeak, ...signals],
    notes: view.notes,
  }
}
