/**
 * The rules board's four events (docs/ORCHESTRATION.md §16, design §2.3):
 * their declarations in the shape the loop board's shared event table uses
 * (LoopEventDeclaration), and the one place that builds an event's payload
 * and envelope from a call, so the tool-call gate and `checkCall` cannot
 * differ. Pure: no Node built-in, no clock, no file.
 *
 * Three of the events gate an action: `gate.tool-call` (every tool call),
 * `gate.dispatch` (a call that dispatches a subagent, also a tool call) and
 * `gate.trunk-advance` (a git call that moves the trunk, also a tool call).
 * `rules.step` is each agent's step; it gates nothing and only informing
 * rules listen to it. The rules board checks its own entries against these
 * four declarations and nothing else.
 */
import type { LoopEventDeclaration, LoopEventField } from '../loops/trigger.ts'

export const GATE_EVENTS = ['gate.tool-call', 'gate.dispatch', 'gate.trunk-advance'] as const
export type GateEvent = (typeof GATE_EVENTS)[number]
export type RulesEvent = GateEvent | 'rules.step'

function field(name: string, type: LoopEventField['type'], title: string, filter?: LoopEventField['filter']): LoopEventField {
  return { name, type, title, ...(filter === undefined ? {} : { filter }) }
}

/** The three fields that say who acts; a field a call cannot tell is left out of its payload. */
const WHO: readonly LoopEventField[] = [
  field('role', 'string', '谁在做：主 Agent、根 agent 还是子 agent', 'in'),
  field('model', 'string', '会话用的模型，写成 提供方/模型', 'in'),
  field('session', 'string', '会话', 'in'),
]
const COMMAND = field('command', 'string', '命令文本（pwsh、bash、terminal_send），只看前 8 KiB', 'in')
const TOOL = field('tool', 'string', '工具的原生名', 'in')

const DECLARATIONS: readonly LoopEventDeclaration[] = [
  {
    id: 'gate.tool-call',
    title: '要执行一次工具调用之前',
    fields: [
      TOOL, COMMAND,
      field('writes', 'strings', '这次调用要写的文件，相对会话工作区', 'paths'),
      ...WHO,
      field('nested', 'boolean', '是不是 run_code 程序里的子调用', 'is'),
      field('glmSpend', 'string', '脚本自报的 GLM 积分花法：optional 或 necessary', 'in'),
      field('cwd', 'string', '会话的工作目录，只给脚本看'),
      field('argsTruncated', 'boolean', '参数副本是不是被截短了，只给脚本看'),
    ],
    personSelectable: true,
  },
  {
    id: 'gate.dispatch',
    title: '要派一个子 agent 之前',
    fields: [
      TOOL, ...WHO,
      field('targetModel', 'string', '被派的子 agent 的模型，没有写时为空', 'in'),
      field('task', 'string', '被派的任务 id，没有时为空', 'in'),
    ],
    personSelectable: true,
  },
  {
    id: 'gate.trunk-advance',
    title: '要让主干前进之前',
    fields: [
      field('branch', 'string', '主干的名字', 'in'),
      field('from', 'string', '前进之前的提交，只给脚本看'),
      field('to', 'string', '前进之后的提交，只给脚本看'),
      COMMAND, ...WHO,
    ],
    personSelectable: true,
    // A trunk that advances is hard to take back: a script that fails or times out blocks it unless the entry says otherwise.
    gateOnErrorDefault: 'block',
  },
  {
    id: 'rules.step',
    title: '一个 agent 的每一步之前',
    fields: [...WHO],
    personSelectable: true,
  },
]

/** The four declarations by id: the table `validateWhen` checks the rules board's entries against. */
export const RULES_EVENT_TABLE: ReadonlyMap<string, LoopEventDeclaration> = new Map(DECLARATIONS.map(declaration => [declaration.id, declaration]))

/** One event of one call, as a script gets it on its standard input and as the filters read it. */
export interface RulesEventRecord {
  readonly event: RulesEvent
  readonly at: string
  readonly project: string
  readonly session?: string
  readonly payload: Readonly<Record<string, unknown>>
}

/** What the gate or `checkCall` knows about a call. A field it cannot tell is left out, never guessed. */
export interface GateCall {
  readonly at: string
  /** The project root. */
  readonly project: string
  readonly cwd?: string
  /** The native tool name. */
  readonly tool: string
  readonly args?: unknown
  /** The shell text of a shell call. */
  readonly command?: string
  /** What the call writes, relative to the session's workspace. */
  readonly writes?: readonly string[]
  readonly role?: 'main-agent' | 'root' | 'subagent'
  /** `provider/model` of the calling session (modelId). */
  readonly model?: string
  readonly session?: string
  /** A call from inside a run_code program. */
  readonly nested?: boolean
  /** A script's own report of whether it spends GLM credit and could wait. */
  readonly glmSpend?: 'optional' | 'necessary'
  /** Who asked: only `checkCall` says, the gate has no caller field. */
  readonly caller?: 'cli' | 'library'
  /** Present when the call dispatches a subagent. */
  readonly dispatch?: { readonly targetModel?: string, readonly task?: string }
  /** Present when the call advances the trunk. */
  readonly trunkAdvance?: { readonly branch: string, readonly from: string, readonly to: string }
}

const COMMAND_WINDOW = 8192
const ARGS_LIMIT = 65_536

function defined(entries: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined))
}

/** A copy of the arguments for scripts to read, at most 64 KiB serialized; a longer one is cut and says so. Arguments that do not serialize are left out. */
function argsPayload(args: unknown): Record<string, unknown> {
  let text: string | undefined
  try {
    text = JSON.stringify(args)
  }
  catch {
    return {}
  }
  if (text === undefined) return {}
  if (text.length <= ARGS_LIMIT) return { args: JSON.parse(text) as unknown }
  return { args: text.slice(0, ARGS_LIMIT), argsTruncated: true }
}

function record(event: RulesEvent, call: Pick<GateCall, 'at' | 'project' | 'session'>, payload: Record<string, unknown>): RulesEventRecord {
  return { event, at: call.at, project: call.project, ...(call.session === undefined ? {} : { session: call.session }), payload: defined(payload) }
}

/**
 * The events one call pushes: `gate.tool-call` always, `gate.dispatch` when it
 * dispatches a subagent and `gate.trunk-advance` when it advances the trunk,
 * in that order. The caller says which of the two it is; this file knows no
 * tool names beyond the declarations.
 */
export function gateEvents(call: GateCall): readonly RulesEventRecord[] {
  const who = { role: call.role, model: call.model, session: call.session }
  const command = call.command?.slice(0, COMMAND_WINDOW)
  const events = [record('gate.tool-call', call, {
    tool: call.tool,
    command,
    writes: call.writes === undefined ? undefined : [...call.writes],
    ...who,
    nested: call.nested ?? false,
    glmSpend: call.glmSpend,
    caller: call.caller,
    cwd: call.cwd,
    ...(call.args === undefined ? {} : argsPayload(call.args)),
  })]
  if (call.dispatch !== undefined) {
    events.push(record('gate.dispatch', call, { tool: call.tool, ...who, targetModel: call.dispatch.targetModel ?? '', task: call.dispatch.task ?? '' }))
  }
  if (call.trunkAdvance !== undefined) {
    events.push(record('gate.trunk-advance', call, { ...call.trunkAdvance, command, ...who }))
  }
  return events
}

/** The `rules.step` event of an agent about to take a step. */
export function stepEvent(step: Pick<GateCall, 'at' | 'project' | 'role' | 'model' | 'session'>): RulesEventRecord {
  return record('rules.step', step, { role: step.role, model: step.model, session: step.session })
}

/** `provider/model` of a request header's route, the form the model filters read; a header without a provider gives an empty one. Undefined while there is no model. */
export function modelId(route: { readonly provider?: string, readonly model?: string }): string | undefined {
  return route.model === undefined || route.model === '' ? undefined : `${route.provider ?? ''}/${route.model}`
}
