/**
 * The rules board's entries that live in code (docs/ORCHESTRATION.md §16,
 * design §3.1, §3.6, §10.1): the default rule that tells GLM sessions about
 * peak pricing, the four entries that carry out the peak levels `reduce` and
 * `stop`, and the catalog of the rules that other rows implement. None of
 * them is in a file or can be lifted by a person; the one thing a person
 * chooses is the level (effectivePeakMode, model.ts), which decides which
 * entries are in force (builtinRulesFor).
 *
 * The default rule only informs. The entries a level adds queue, and only in
 * a GLM peak: when the peak cannot be read their condition is unknown and
 * `onUnknown: 'skip'` leaves them off. The main agent is never held: no entry
 * filters it, except that the dispatch of a GLM subagent is queued whoever
 * dispatches, because it is the subagent that is being held back.
 */
import { GUARD_RULES } from '../guard/catalog.ts'
import type { PeakLevel } from '../shared/peak-mode.ts'
import type { BuiltinRule, CatalogEntry, Condition } from './model.ts'
import { GLM_PEAK } from './signals.ts'

/** The GLM family as the model filters read `<provider>/<model>`: a model part that starts with `glm`, whatever slashes it holds after that. Equal to isGlmModel on the model part. */
const GLM_MODEL = { matches: '^[^/]*/glm' }
const IN_PEAK: Condition = { signal: GLM_PEAK, is: true }

const PRICING_ID = 'builtin:glm-peak-pricing'

export const GLM_PEAK_PRICING: BuiltinRule = {
  id: PRICING_ID,
  title: 'GLM 峰谷定价：高峰时段按全价计积分，其余时段半价',
  scope: 'builtin',
  when: { kind: 'event', events: ['rules.step'] },
  filter: { model: GLM_MODEL },
  condition: IN_PEAK,
  onUnknown: 'skip',
  action: { kind: 'inform' },
  lifetime: { kind: 'until-lifted' },
  reason: '人 2026-10-29：唯一一个加进去的默认规则是峰谷定价的事情。时段与系数见 docs/ORCHESTRATION.md §11.2、docs/FACTS.md §2.4',
  source: 'rules',
  toldBy: 'glm-prompt',
}

const PEAK_MODE_REASON = '人 2026-10-30：高峰模式，出厂少做，档位由人选（docs/ORCHESTRATION.md §16）'

/** `reduce`: a script that reports it spends GLM credit and could wait is queued; nothing else is touched. */
export const GLM_PEAK_REDUCE: BuiltinRule = {
  id: 'builtin:glm-peak-reduce',
  title: '高峰少做：自报花 GLM 积分且可挪的脚本排队',
  scope: 'builtin',
  when: { kind: 'event', events: ['gate.tool-call'] },
  filter: { glmSpend: { in: ['optional'] } },
  condition: IN_PEAK,
  onUnknown: 'skip',
  action: { kind: 'queue' },
  lifetime: { kind: 'until-lifted' },
  reason: PEAK_MODE_REASON,
  source: 'rules',
  partOf: PRICING_ID,
  enabledBy: ['reduce'],
}

/** `stop`: every tool call of a GLM subagent is queued, one ticket for the session, the rules board's own tools excepted. */
export const GLM_PEAK_STOP: BuiltinRule = {
  id: 'builtin:glm-peak-stop',
  title: '高峰不做：GLM 子 agent 的每次工具调用排队',
  scope: 'builtin',
  when: { kind: 'event', events: ['gate.tool-call'] },
  filter: { role: { in: ['subagent'] }, model: GLM_MODEL },
  condition: IN_PEAK,
  onUnknown: 'skip',
  action: { kind: 'queue' },
  lifetime: { kind: 'until-lifted' },
  reason: PEAK_MODE_REASON,
  source: 'rules',
  partOf: PRICING_ID,
  enabledBy: ['stop'],
  ticketPerSession: true,
}

/** `stop`: dispatching a GLM subagent is queued on the dispatcher's session, whoever it is. A dispatch that names no model is not guessed at (the target model is unreadable). */
export const GLM_PEAK_STOP_DISPATCH: BuiltinRule = {
  id: 'builtin:glm-peak-stop-dispatch',
  title: '高峰不做：派 GLM 子 agent 的调用排队',
  scope: 'builtin',
  when: { kind: 'event', events: ['gate.dispatch'] },
  filter: { targetModel: GLM_MODEL },
  condition: IN_PEAK,
  onUnknown: 'skip',
  action: { kind: 'queue' },
  lifetime: { kind: 'until-lifted' },
  reason: PEAK_MODE_REASON,
  source: 'rules',
  partOf: PRICING_ID,
  enabledBy: ['stop'],
}

/** `stop`: a script that reports it spends GLM credit, whether or not it could wait, is queued. A script is not a session, so nothing else is asked of the call. */
export const GLM_PEAK_STOP_SCRIPTS: BuiltinRule = {
  id: 'builtin:glm-peak-stop-scripts',
  title: '高峰不做：自报花 GLM 积分的脚本排队',
  scope: 'builtin',
  when: { kind: 'event', events: ['gate.tool-call'] },
  filter: { glmSpend: { in: ['optional', 'necessary'] } },
  condition: IN_PEAK,
  onUnknown: 'skip',
  action: { kind: 'queue' },
  lifetime: { kind: 'until-lifted' },
  reason: PEAK_MODE_REASON,
  source: 'rules',
  partOf: PRICING_ID,
  enabledBy: ['stop'],
}

const BUILTIN_RULES: readonly BuiltinRule[] = [GLM_PEAK_PRICING, GLM_PEAK_REDUCE, GLM_PEAK_STOP, GLM_PEAK_STOP_DISPATCH, GLM_PEAK_STOP_SCRIPTS]

/** The entries in force at a level: the default rule always, and the entries the level enables. */
export function builtinRulesFor(level: PeakLevel): readonly BuiltinRule[] {
  return BUILTIN_RULES.filter(rule => rule.enabledBy === undefined || rule.enabledBy.includes(level))
}

/** Every row the catalog lists is in the orchestration package (design §10.1). */
const PLUGIN = 'dsh-hourness'

/**
 * The rules other rows implement, and the rules board's own, listed read-only
 * (design §10.1): the guard framework's (src/guard/catalog.ts, mapped to
 * `<row>:<id>`), the rules board's gate on its own files, the default rule
 * and its entries. The gate on the rules files is listed here and arrives
 * with the rules row.
 */
export const CATALOG: readonly CatalogEntry[] = [
  ...GUARD_RULES.map((rule): CatalogEntry => ({ id: `${rule.row}:${rule.id}`, title: rule.title, row: rule.row, effect: 'block', plugin: PLUGIN })),
  { id: 'rules:files-only', title: '规则文件只经规则板改：写规则目录的调用会被拒', row: 'rules', effect: 'block', plugin: PLUGIN },
  ...BUILTIN_RULES.map((rule): CatalogEntry => ({
    id: rule.id,
    title: rule.title,
    row: 'rules',
    effect: rule.action.kind,
    plugin: PLUGIN,
    ...(rule.toldBy === undefined ? {} : { toldBy: rule.toldBy }),
  })),
]
