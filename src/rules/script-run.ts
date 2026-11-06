/**
 * Running the scripts a person approved and what their endings mean (docs/ORCHESTRATION.md
 * §16.15; design §6.7): `judge` hands back the approved scripts of the rules that apply as
 * `pending`; this runs them through the shared executor (`purpose: 'gate'`, the process,
 * the copy of the approved bytes, the timeout and the end of the process tree are the
 * executor's, src/loops/script.ts) and turns each ending into what it makes of the call.
 *
 * The meaning is the board's: exit 0 lets the call through, 2 blocks it (the reason is the
 * start of what the script wrote on standard error, with control characters taken out), 3
 * defers it (a rule that filters on writes blocks instead: a write is not deferred); any
 * other ending (another exit code, a process that would not start, a timeout, a script that
 * is not the approved bytes any more) is a failure and goes by the rule's `onError`: `allow`
 * lets the call through, `block` blocks it. Scripts run side by side; the first that blocks
 * ends the wait and the others are called off, and what ends after that is not read.
 * The output of a script is not kept anywhere but in the reason of a block or deferral.
 */
import { randomBytes } from 'node:crypto'
import type { HookEnvelope, ScriptRequest, ScriptResult } from '../loops/script.ts'
import type { RulesEventRecord } from './events.ts'
import type { JudgeResult, RuleHit } from './judge.ts'

/** Starts one script; the shared executor's `runScript`, or a stand-in. */
export type RunScript = (request: ScriptRequest) => Promise<ScriptResult>

/** What one script made of the call. */
export interface ScriptOutcome {
  readonly rule: string
  /** The script's path in the project. */
  readonly file: string
  readonly outcome: 'allow' | 'block' | 'queue' | 'failed' | 'timeout' | 'refused'
  readonly ms?: number
  /** The hit it makes of the rule: absent when the call goes through. */
  readonly hit?: RuleHit
  /** A sentence for the person who reads the result of `checkCall`: what happened to the script, and what the rule's failure setting made of it. */
  readonly note?: string
}

/** What the run needs to know of a rule besides what `pending` says. */
interface RuleInfo {
  readonly title: string
  /** The rule filters on what the call writes: a deferral of a write is a block. */
  readonly filtersWrites: boolean
}

const REASON_CODE_POINTS = 500
const NO_REASON = 'the script gave no reason'

/** What the script wrote on standard error as one line: control characters out, line breaks as `\n`, at most 500 code points. */
function reasonOf(stderr: string): string {
  const cleaned = stderr
    .replace(/\r?\n/g, '\\n')
    // eslint-disable-next-line no-control-regex -- the point is to take the control characters of a script's output out of what a model reads
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .trim()
  return cleaned === '' ? NO_REASON : [...cleaned].slice(0, REASON_CODE_POINTS).join('')
}

/** How a script that was not run, or did not answer 0, 2 or 3, is told in the refusal and in the note. */
const REFUSED_WORDS: Readonly<Record<Extract<ScriptResult, { kind: 'refused' }>['reason'], string>> = {
  'script-changed': 'was changed after the human agreed, so it did not run',
  'script-missing': 'is missing, so it did not run',
  'outside-project': 'is outside the project, so it did not run',
  'too-large': 'is too large to have been read, so it did not run',
  aborted: 'was called off before it started',
}

type Pending = JudgeResult['pending'][number]

/** How a script that did not answer 0, 2 or 3 failed: `which ...` after "ran its script <file>", or what follows "its script <file>" when it did not run, and the note's words. */
function failureOf(pending: Pending, result: ScriptResult): { readonly said: string, readonly notRun: boolean, readonly chinese: string } {
  if (result.kind === 'exited') return { said: `exited with code ${result.exitCode}`, notRun: false, chinese: `退出码是 ${result.exitCode}` }
  if (result.kind === 'timeout') return { said: `did not finish within ${pending.timeoutSeconds} s`, notRun: false, chinese: `超过 ${pending.timeoutSeconds} 秒没答（超时）` }
  if (result.kind === 'crashed') return { said: `could not start (${result.message.replace(/\s+/g, ' ').slice(0, 80)})`, notRun: false, chinese: `没跑起来：${result.message.replace(/\s+/g, ' ').slice(0, 80)}` }
  return { said: REFUSED_WORDS[result.reason], notRun: true, chinese: `没有跑：${REFUSED_WORDS[result.reason]}` }
}

/** The ending of one script as what it makes of the call. `undefined` for a run that was called off, which makes nothing of it. */
function outcomeOf(pending: Pending, info: RuleInfo, result: ScriptResult): ScriptOutcome | undefined {
  const { file } = pending.script
  const hit = (effect: 'block' | 'queue', verdict: string, failed = false): RuleHit => ({ rule: pending.rule, title: info.title, effect, verdict, ...(failed ? { scriptFailed: true as const } : {}) })
  if (result.kind === 'exited' && result.exitCode === 0) return { rule: pending.rule, file, outcome: 'allow', ms: result.durationMs }
  if (result.kind === 'exited' && (result.exitCode === 2 || result.exitCode === 3)) {
    const why = reasonOf(result.stderr)
    if (result.exitCode === 2) return { rule: pending.rule, file, outcome: 'block', ms: result.durationMs, hit: hit('block', `ran its script ${file}, which blocked the call: "${why}".`) }
    if (info.filtersWrites) {
      return {
        rule: pending.rule,
        file,
        outcome: 'queue',
        ms: result.durationMs,
        hit: hit('block', `ran its script ${file}, which asked to defer the call; a write is not deferred, so it is blocked: "${why}".`),
        note: `脚本 ${file} 要排队，但这条规则筛的是写文件，写文件不配排队，按拦下判`,
      }
    }
    return { rule: pending.rule, file, outcome: 'queue', ms: result.durationMs, hit: hit('queue', `ran its script ${file}, which deferred the call: "${why}".`) }
  }
  if (result.kind === 'refused' && result.reason === 'aborted') return undefined
  const failure = failureOf(pending, result)
  const outcome = result.kind === 'timeout' ? 'timeout' : result.kind === 'refused' ? 'refused' : 'failed'
  const ms = result.kind === 'refused' ? undefined : result.durationMs
  const blocks = pending.onError === 'block'
  const sentence = failure.notRun
    ? `has a script ${file} that ${failure.said}, and the rule says to block when its script fails.`
    : `ran its script ${file}, which ${failure.said}, and the rule says to block when its script fails.`
  return {
    rule: pending.rule,
    file,
    outcome,
    ...(ms === undefined ? {} : { ms }),
    ...(blocks ? { hit: hit('block', sentence, true) } : {}),
    note: `脚本 ${file} ${failure.chinese}，按条目的失败做法判了${blocks ? '拦下' : '放行'}`,
  }
}

export interface RunPendingOptions {
  readonly pending: JudgeResult['pending']
  /** The rule of each pending script: its title and whether it filters on writes. */
  readonly info: (rule: string) => RuleInfo
  /** The project root: the working directory of every script and the `project` of its envelope. */
  readonly root: string
  /** The events of the call; a script gets the payload of the event it listens to. */
  readonly events: readonly RulesEventRecord[]
  readonly now: Date
  readonly session?: string
  readonly run: RunScript
}

/**
 * Run the pending scripts of one call, side by side, and return what each made of it, in the order of `pending`.
 * The call is not held longer than the longest timeout; the first script that blocks ends the wait and the others
 * are called off (their processes ended, their endings not read). When this returns, no process of it is left.
 */
export async function runPendingScripts(options: RunPendingOptions): Promise<ScriptOutcome[]> {
  const controller = new AbortController()
  const read = new Map<string, ScriptOutcome | undefined>()
  const runs = options.pending.map(async (pending): Promise<void> => {
    const event = options.events.find(entry => entry.event === pending.event)
    const envelope: HookEnvelope = {
      version: 1,
      board: 'rules',
      entry: pending.rule,
      run: `rr-${randomBytes(4).toString('hex')}`,
      event: pending.event,
      at: options.now.toISOString(),
      project: options.root,
      ...(options.session === undefined ? {} : { session: options.session }),
      payload: event?.payload ?? {},
    }
    const result = await options.run({ project: options.root, script: pending.script, envelope, purpose: 'gate', timeoutMs: pending.timeoutSeconds * 1000, signal: controller.signal })
    // What ends after another script blocked is not read: that run was called off.
    if (controller.signal.aborted) return
    const outcome = outcomeOf(pending, options.info(pending.rule), result)
    read.set(pending.rule, outcome)
    if (outcome?.hit?.effect === 'block') controller.abort()
  })
  await Promise.all(runs)
  controller.abort()
  return options.pending.flatMap(pending => read.get(pending.rule) ?? [])
}
