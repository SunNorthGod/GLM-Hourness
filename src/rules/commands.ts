/**
 * `/rules`, the person's way to look at the rules and to change what they may
 * change (docs/ORCHESTRATION.md §16.4, §16.11; design §9.2). The person types
 * it, so every write is made as `human`; a model cannot type a slash command.
 * Each subcommand is one operation of the engine (engine.ts) and answers in
 * one line of Chinese; a request the board refuses answers the board's reason
 * in one line and writes nothing.
 *
 * Not here, because the path of a person's agreement they belong to is not
 * built: writing a rule, defining a switch, accepting or rejecting a proposal.
 * Those words are not subcommands, and they get the usage like any other.
 */
import { basename } from 'node:path'
import type { ProjectLocation } from '../data/project-root.ts'
import type { CommandResultLike } from '../shared/dsh-min.ts'
import { PEAK_LEVEL_WORDS, peakModeIntro, type PeakModeState } from '../shared/peak-mode.ts'
import { localMinute } from './denial.ts'
import { openRulesBoard, type ApplyError } from './engine.ts'
import { judgeInput } from './judge.ts'
import { openTickets, projectSignals, rulesInForce } from './listing.ts'
import { effectivePeakMode, parsePeakLevel, type PeakLevel, type ProjectState, type Rule } from './model.ts'
import { stateOf, type PeakReading, type ProjectView } from './peak.ts'
import type { SignalReading } from './signals.ts'
import { GLM_PEAK } from './signals.ts'
import type { StoreIo } from './store.ts'
import { readingsOf, tableOf } from './table.ts'

/** What the subcommands say, as the usage of the command (input.hint) and as the reply to a line that is none of them. */
export const RULES_HINT = 'show | peak [无影响|少做|不做] | lift <规则> | delete <规则或开关> | on <开关> [时长] | off <开关> | set <信号> <值> [时长] | clear <信号> | let <单号> | cancel <单号> | recovery <编号…|文件> 照改|忽略'

const RULES_USAGE = [
  '用法：/rules 后面跟下面几种之一：',
  '/rules show：看这个项目的规则、在等的工作和信号',
  '/rules peak [无影响|少做|不做]：看或改高峰模式；不带档位就是看现在是哪一档',
  '/rules lift <规则 id>、/rules delete <规则 id>：解除、删除一条你定的规则',
  '/rules on <开关> [时长]、/rules off <开关>：打开、关上一个开关；时长写成 30m、2h、1d，至多 7d',
  '/rules set <信号> <值> [时长]、/rules clear <信号>：手设、清掉一个信号的值',
  '/rules delete <开关名>：删掉一个开关',
  '/rules let <单号>、/rules cancel <单号>：放行一张等待单这一次、取消它',
  '/rules recovery <编号> 照改|忽略（几个编号用逗号隔开）：处理变更记录里没有生效的记录',
  '/rules recovery 文件 照改|忽略：仓库里的规则文件被规则板以外改过时，照文件改，或让规则板按自己的存档写回',
].join('\n')

export const NOT_A_PROJECT = '这个会话没有工作目录，或不在项目里（用户主目录、盘符根，或既没有 .git 也没有 .llm 的文件夹），规则板找不到项目，高峰模式不起作用。'

const pad = (value: number): string => String(value).padStart(2, '0')
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** A moment as the person reads it: `HH:MM` today, `周X HH:MM` on another day, in the machine's time zone. */
export function clockText(iso: string, nowMs: number): string {
  const at = new Date(iso)
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`
  return at.toDateString() === new Date(nowMs).toDateString() ? time : `周${WEEKDAYS[at.getDay()]} ${time}`
}

/** One sentence about the clock: is it peak, until when. */
function peakLine(state: PeakModeState, why: string | undefined, nowMs: number): string {
  if (state.peak === undefined) return `读不到是不是高峰（${why ?? '原因不明'}），这一档现在不生效。`
  const until = state.until === undefined ? undefined : clockText(state.until, nowMs)
  if (state.peak) return until === undefined ? '现在是高峰。' : `现在是高峰，到 ${until}。`
  return until === undefined ? '现在不是高峰。' : `现在不是高峰，下一次 ${until} 开始。`
}

const chosen = (state: PeakModeState, nowMs: number): string => state.origin === 'human' && state.at !== undefined ? `你在 ${clockText(state.at, nowMs)} 选的` : '出厂默认'

function failureText(error: ApplyError, prefix = ''): string {
  if (error.code === 'busy' || error.code === 'io') return error.message
  return `${prefix}${error.message}${error.hint === undefined ? '' : `。${error.hint}`}`
}

// ------------------------------------------------------------------ parsing

const DURATION = /^(\d+)([mhd])$/
const UNIT_MS = { m: 60_000, h: 3_600_000, d: 86_400_000 } as const
const MAX_DURATION_MS = 7 * UNIT_MS.d
const DURATION_HINT = '时长写成 30m、2h 或 1d，至多 7d。'

const ACCEPT = ['照改', 'accept']
const DISMISS = ['忽略', 'dismiss']
const FILE = ['文件', 'file']

type Duration = { readonly ms: number, readonly text: string }

/** A duration the way the person types it, or undefined when it is not one the board takes. */
function durationOf(word: string): Duration | undefined {
  const match = DURATION.exec(word)
  if (match === null) return undefined
  const ms = Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS]
  return ms >= 1 && ms <= MAX_DURATION_MS ? { ms, text: word } : undefined
}

function valueOf(word: string): boolean | number | string {
  if (/^true$/i.test(word)) return true
  if (/^false$/i.test(word)) return false
  return /^-?\d+(\.\d+)?$/.test(word) ? Number(word) : word
}

/** What a subcommand asks: a write of the engine and the line that says it was done, or one of the commands that read. */
type Parsed =
  | { readonly kind: 'show' }
  | { readonly kind: 'peak', readonly level?: PeakLevel, readonly word?: string }
  | { readonly kind: 'write', readonly request: Record<string, unknown>, readonly done: string }
  | { readonly kind: 'repo', readonly adopt: boolean }

function parse(input: string): Parsed | string {
  const [sub, ...rest] = input.trim().split(/\s+/).filter(word => word !== '')
  const count = rest.length
  const timed = (word: string | undefined): Duration | string | undefined => (word === undefined ? undefined : durationOf(word) ?? DURATION_HINT)
  switch (sub) {
    case 'show':
      return count === 0 ? { kind: 'show' } : RULES_USAGE
    case 'peak': {
      if (count > 1) return RULES_USAGE
      const [word] = rest
      if (word === undefined) return { kind: 'peak' }
      const level = parsePeakLevel(word)
      return level === undefined ? `不认识档位「${word}」。${RULES_USAGE}` : { kind: 'peak', level, word }
    }
    case 'lift':
      return count === 1 ? { kind: 'write', request: { op: 'rule-lift', id: rest[0], reason: `人用 /rules lift 解除了 ${rest[0]}` }, done: `规则 ${rest[0]} 已解除，不再起作用。` } : RULES_USAGE
    case 'delete': {
      const [name] = rest
      if (count !== 1 || name === undefined) return RULES_USAGE
      return name.startsWith('r-') || name.startsWith('builtin:')
        ? { kind: 'write', request: { op: 'rule-delete', id: name, reason: `人用 /rules delete 删除了 ${name}` }, done: `规则 ${name} 已删除。` }
        : { kind: 'write', request: { op: 'signal-delete', name, reason: `人用 /rules delete 删除了 ${name}` }, done: `开关 ${name} 已删除。` }
    }
    case 'on': {
      if (count < 1 || count > 2) return RULES_USAGE
      const duration = timed(rest[1])
      if (typeof duration === 'string') return duration
      return { kind: 'write', request: { op: 'signal-manual', name: rest[0], value: true, ...(duration === undefined ? {} : { durationMs: duration.ms }), reason: `人用 /rules on 打开了 ${rest[0]}` }, done: `开关 ${rest[0]} 已打开${duration === undefined ? '' : `（${duration.text} 后失效）`}。` }
    }
    case 'off':
      return count === 1 ? { kind: 'write', request: { op: 'signal-manual', name: rest[0], value: false, reason: `人用 /rules off 关上了 ${rest[0]}` }, done: `开关 ${rest[0]} 已关上。` } : RULES_USAGE
    case 'set': {
      if (count < 2 || count > 3) return RULES_USAGE
      const duration = timed(rest[2])
      if (typeof duration === 'string') return duration
      return { kind: 'write', request: { op: 'signal-manual', name: rest[0], value: valueOf(rest[1]), ...(duration === undefined ? {} : { durationMs: duration.ms }), reason: `人用 /rules set 设了 ${rest[0]}` }, done: `信号 ${rest[0]} 的值设成了 ${rest[1]}${duration === undefined ? '' : `（${duration.text} 后失效）`}。` }
    }
    case 'clear':
      return count === 1 ? { kind: 'write', request: { op: 'signal-clear', name: rest[0], reason: `人用 /rules clear 清掉了 ${rest[0]} 的手设值` }, done: `信号 ${rest[0]} 的手设值清掉了。` } : RULES_USAGE
    case 'let':
      return count === 1 ? { kind: 'write', request: { op: 'ticket-let-once', id: rest[0], reason: `人用 /rules let 放行了 ${rest[0]}` }, done: `${rest[0]} 放行这一次：10 分钟内同样的调用再来会放行。` } : RULES_USAGE
    case 'cancel':
      return count === 1 ? { kind: 'write', request: { op: 'ticket-cancel', id: rest[0], reason: `人用 /rules cancel 取消了 ${rest[0]}` }, done: `${rest[0]} 已取消。` } : RULES_USAGE
    case 'recovery': {
      const verb = rest.at(-1)
      const accept = verb !== undefined && ACCEPT.includes(verb)
      if (count < 2 || verb === undefined || !(accept || DISMISS.includes(verb))) return RULES_USAGE
      const targets = rest.slice(0, -1)
      if (targets.length === 1 && FILE.includes(targets[0])) return { kind: 'repo', adopt: accept }
      const labels = targets.flatMap(word => word.split(',')).filter(label => label !== '')
      if (labels.length === 0) return RULES_USAGE
      return { kind: 'write', request: { op: accept ? 'recovery-accept' : 'recovery-dismiss', labels }, done: `${accept ? '已照改' : '已忽略'} ${labels.join('、')}。` }
    }
    default:
      return RULES_USAGE
  }
}

// -------------------------------------------------------------------- show

const EFFECT_WORDS = { block: '拦下', queue: '排队（这一版还没有执行）', record: '只记下，不挡', inform: '只告知' } as const

function lifetimeWords(rule: Rule): string {
  switch (rule.lifetime.kind) {
    case 'until-lifted': return '直到解除'
    case 'ttl': return `到 ${localMinute(rule.lifetime.expiresAt)}`
    case 'until': return '直到条件不再成立'
    case 'session': return '这个会话里'
  }
}

function signalWords(reading: SignalReading): string {
  if (reading.value === undefined) return `读不出（${reading.unknown}）`
  const value = typeof reading.value === 'boolean' ? (reading.value ? '开' : '关') : String(reading.value)
  const source = reading.source === 'manual' ? '手设' : reading.source === 'detector' ? '检测器' : reading.source
  return `${value}（${source}）`
}

/** `/rules show`: the project's rules, what waits and the signals, for the person. */
function showHuman(name: string, view: ProjectView, reading: PeakReading, nowMs: number): string {
  const state: ProjectState = view.read.state
  const now = new Date(nowMs)
  const level = effectivePeakMode(state)
  const mode = stateOf(view.read, reading)
  const glmPeak: SignalReading = reading.peak === undefined ? { name: GLM_PEAK, source: 'none', unknown: reading.why ?? '原因不明' } : { name: GLM_PEAK, source: 'clock', value: reading.peak }
  const readings = readingsOf(state, glmPeak, now)
  const input = judgeInput({ now, project: view.paths.projectRoot, events: [], signals: [...readings.values()] })
  const rules = rulesInForce(state, tableOf(state, level.level), input).map(({ rule }) => {
    const how = EFFECT_WORDS[rule.action.kind === 'script' ? 'block' : rule.action.kind]
    const who = rule.scope === 'builtin' ? '写在代码里的规则' : `${rule.origin.actor === 'human' ? '你' : '主 Agent 照你同意的'}在 ${localMinute(rule.origin.at)} 定的 · ${lifetimeWords(rule)}`
    return `- ${rule.id}「${rule.title}」：${rule.action.kind === 'script' ? '跑脚本' : how} · ${who}`
  })
  const tickets = openTickets(state).map(ticket => `- ${ticket.id} ${ticket.tool}「${ticket.summary}」：从 ${localMinute(ticket.since)} 起等规则 ${ticket.rules.join('、')}`)
  const signals = projectSignals(state, readings).map(signal => `- ${signal.name}：${signalWords(signal)}`)
  return [
    `规则板 · ${name}`,
    `高峰模式：${PEAK_LEVEL_WORDS[level.level].name}（${chosen(mode, nowMs)}）。${peakLine(mode, reading.why, nowMs)}`,
    ...(rules.length === 0 ? ['生效的规则：没有'] : ['生效的规则：', ...rules]),
    ...(tickets.length === 0 ? ['在等的工作：没有'] : ['在等的工作：', ...tickets]),
    ...(signals.length === 0 ? ['信号：没有'] : ['信号：', ...signals]),
  ].join('\n')
}

// ------------------------------------------------------------------ running

export interface RulesCommandEnv {
  /** The rules directory of the row's configuration, relative to the project root unless absolute. */
  readonly rulesDir: string
  readonly io?: StoreIo
  readonly now: () => number
  readonly peak: () => PeakReading
  /** Persist what a read of the project found (a recovery, the start from the rules file, an owed write) and report the session's health; the project as it stands, undefined when it cannot be read. */
  readonly settle: () => Promise<ProjectView | undefined>
}

const error = (text: string): CommandResultLike => ({ kind: 'error', text })

/** Run one `/rules` line for the person. Never throws: a write that fails is a reply. */
export async function runRulesCommand(input: string, project: ProjectLocation | undefined, env: RulesCommandEnv): Promise<CommandResultLike> {
  const parsed = parse(input)
  if (typeof parsed === 'string') return error(parsed)
  if (project === undefined) return error(NOT_A_PROJECT)
  const board = openRulesBoard({ projectRoot: project.root, rulesDir: env.rulesDir, ...(env.io === undefined ? {} : { io: env.io }) })

  if (parsed.kind === 'show') {
    const view = await env.settle()
    return view === undefined ? error('读不出规则板的状态，行健康里有原因。') : { kind: 'success', text: showHuman(basename(project.root), view, env.peak(), env.now()) }
  }

  if (parsed.kind === 'peak') {
    const { level, word } = parsed
    if (level === undefined || word === undefined) {
      const view = await env.settle()
      if (view === undefined) return error('读不出规则板的状态，行健康里有原因。')
      const clock = env.peak()
      const state = stateOf(view.read, clock)
      return { kind: 'success', text: `高峰模式：${PEAK_LEVEL_WORDS[state.level].name}（${chosen(state, env.now())}）。${peakLine(state, clock.why, env.now())}\n\n${peakModeIntro()}` }
    }
    const words = PEAK_LEVEL_WORDS[level]
    const result = await board.apply('human', { op: 'peak-mode-set', level, reason: `人用 /rules peak 把高峰模式改成了「${words.name}」` })
    const view = await env.settle()
    if (!result.ok) return error(failureText(result.error, '高峰模式没有改：'))
    if (!result.changed) return { kind: 'success', text: `高峰模式已经是「${words.name}」，没有改动。` }
    const clock = env.peak()
    const line = view === undefined ? '' : peakLine(stateOf(view.read, clock), clock.why, env.now())
    const file = result.file === 'deferred' ? '仓库里的规则文件等 git 做完合并或变基再写。' : result.file === 'failed' ? '仓库里的规则文件没写成，下次读状态时补写。' : ''
    return { kind: 'success', text: `高峰模式改成了「${words.name}」（${words.half}）。${line}${file}\n档位已记下，派活和提醒那几块读它；这一版没有排队和暂停，不拦任何调用。` }
  }

  if (parsed.kind === 'repo') {
    const result = await board.apply('human', { op: parsed.adopt ? 'repo-adopt' : 'repo-restore', reason: parsed.adopt ? '人照仓库里的规则文件改了' : '人让规则板按自己的存档写回仓库里的规则文件' })
    await env.settle()
    if (!result.ok) return error(failureText(result.error))
    if (!result.changed) return { kind: 'success', text: '仓库里的规则文件没有被规则板以外改过，不用处理。' }
    if (parsed.adopt) {
      const scripts = result.repinNeeded === undefined ? '' : `这几条的脚本在这台电脑上还没有你看过原文的记录，先不跑：${result.repinNeeded.join('、')}。`
      return { kind: 'success', text: `已照仓库里的规则文件改。${scripts}` }
    }
    const filed = { written: '已按规则板自己的存档写回仓库里的规则文件。', removed: '规则板没有要存的决定，仓库里的规则文件已删掉。', deferred: '仓库里的规则文件等 git 做完合并或变基再写。', failed: '仓库里的规则文件没写成，下次读状态时补写。', unchanged: '已记下，规则文件不用动。' }
    return { kind: 'success', text: filed[result.file] }
  }

  const result = await board.apply('human', parsed.request)
  await env.settle()
  if (!result.ok) return error(failureText(result.error))
  return { kind: 'success', text: result.changed ? parsed.done : '已经是这样，没有改动。' }
}
