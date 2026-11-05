/**
 * Shared fixtures of the rules board's pure specs (rules-model, rules-judge,
 * rules-builtin, rules-view, rules-panel-model): a moment inside GLM's peak
 * hours, a call, the readings a judgement is given, a rule in the 0.9 shape,
 * and what the rules row passes the page's data builder.
 */
import { gateEvents, type GateCall } from '../src/rules/events.ts'
import { judgeInput, type JudgeInput } from '../src/rules/judge.ts'
import type { ScriptRef } from '../src/loops/trigger.ts'
import { emptyState, type ProjectState, type RepoRules, type Rule, type RuleContext, type SignalType } from '../src/rules/model.ts'
import type { ProjectRead } from '../src/rules/repo.ts'
import type { SignalReading } from '../src/rules/signals.ts'
import type { RulesViewInput } from '../src/rules/view-build.ts'

/** Wednesday 15:00 in UTC+8, inside GLM's peak hours. */
export const NOW = new Date('2026-11-04T07:00:00.000Z')
export const PROJECT = 'C:/work/app'
export const GLM_MODEL = 'zai/glm-4.6'
export const OTHER_MODEL = 'deepseek/deepseek-chat'

/** The reading of `glm-peak`: a value, or unreadable with a reason when `value` is undefined. */
export function peak(value: boolean | undefined, reason = 'no pricing service'): SignalReading {
  return value === undefined ? { name: 'glm-peak', source: 'none', unknown: reason } : { name: 'glm-peak', source: 'clock', value }
}

/** What a spec says about a call; the rest is the fixture's. */
export type CallParts = Partial<GateCall>

export function callOf(over: CallParts = {}): GateCall {
  return { at: NOW.toISOString(), project: PROJECT, tool: 'pwsh', command: 'npm test', role: 'root', model: GLM_MODEL, session: 's-1', ...over }
}

/** The input of a judgement for one call: the gate and checkCall build theirs the same way. */
export function inputOf(call: CallParts, signals: readonly SignalReading[], extra: Partial<Parameters<typeof judgeInput>[0]> = {}): JudgeInput {
  return judgeInput({ now: NOW, project: PROJECT, events: gateEvents(callOf(call)), signals, ...extra })
}

/** A stored rule: blocks every tool call until lifted. */
export function ruleOf(over: Partial<Rule> = {}): Rule {
  return {
    id: 'r-1',
    title: 'a rule',
    scope: 'project',
    when: { kind: 'event', events: ['gate.tool-call'] },
    action: { kind: 'block' },
    lifetime: { kind: 'until-lifted' },
    reason: 'because',
    origin: { actor: 'human', at: '2026-11-01T00:00:00.000Z' },
    status: 'active',
    ...over,
  }
}

/** The rule of M6 design §7.3 that defers the runs that spend GLM credit while glm-peak is true. */
export const OFFPEAK_CREDIT_RUNS = ruleOf({
  id: 'r-offpeak-credit-runs',
  title: '高峰时积分重活排到高峰结束以后',
  filter: { command: { matches: String.raw`^\s*npm\s+run\s+(calibrate|smoke:authorized)\b|^\s*node\s+scripts[\\/](calibrate[\\/]run-calibrate|smoke-zcode-authorized)\.mjs\b` } },
  condition: { signal: 'glm-peak', is: true },
  action: { kind: 'queue' },
  reason: '（人写）高峰时 GLM 按全价计积分，练习题、对照实验与真网冒烟等到高峰结束',
})

/** A rule as a person writes it, before the engine adds origin and status; a plain record so a spec can add a field the type refuses. */
export function draftOf(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'r-no-evening-push',
    title: 'No pushes after 21:00',
    scope: 'project',
    when: { kind: 'event', events: ['gate.tool-call'] },
    filter: { command: { matches: '^\\s*git\\s+push\\b' } },
    condition: { not: { clock: { from: '09:00', to: '21:00', tz: '+08:00' } } },
    action: { kind: 'block' },
    lifetime: { kind: 'until-lifted' },
    reason: 'Evening pushes broke the nightly build twice.',
    ...over,
  }
}

export function contextOf(over: Partial<RuleContext> = {}): RuleContext {
  return {
    now: NOW,
    signals: new Map<string, SignalType>([
      ['glm-peak', { kind: 'boolean' }],
      ['code-freeze', { kind: 'boolean' }],
      ['server-errors-5m', { kind: 'number' }],
      ['phase', { kind: 'enum', values: ['build', 'ship'] }],
    ]),
    existing: [],
    ...over,
  }
}

export const SHA = 'a'.repeat(64)
export const SHA_OTHER = 'b'.repeat(64)

/** The reference a script entry holds: its file under the rules directory, the hash of the bytes, the language. */
export function scriptRef(id: string, sha256 = SHA): ScriptRef {
  return { file: `docs/rules/scripts/${id}.mjs`, sha256, lang: 'node' }
}

/** The end of the peak the page's data is built in: Wednesday 2026-10-28 18:00 in UTC+8. */
export const VIEW_PEAK_END = '2026-10-28T10:00:00.000Z'

/** The project's state as the row reads it: from the snapshot, the rules file in the repository in sync. */
export function projectReadOf(state: ProjectState, over: Partial<ProjectRead> = {}): ProjectRead {
  return { state, load: { state, source: 'snapshot', reasons: [], nextSeq: state.seq + 1, fresh: false }, repo: { kind: 'in-sync' }, ...over }
}

/** What the rules row passes buildRulesView for an empty project in a GLM peak that ends at VIEW_PEAK_END; a spec overrides the rest. */
export function viewInputOf(over: Partial<RulesViewInput> = {}): RulesViewInput {
  return {
    root: PROJECT,
    read: projectReadOf(emptyState()),
    reading: { peak: true, until: VIEW_PEAK_END },
    hoursZh: '工作日 14:00–18:00',
    rows: {},
    records: [],
    lifted: [],
    liveHosts: [],
    missingScripts: new Set(),
    items: [],
    statusProblems: [],
    host: { pid: 4242 },
    ...over,
  }
}

/**
 * Everything a person can decide, once: a rule with a filter and a condition, a rule that runs a script, a switch with
 * a value a person set, a signal a detector measures, the detector, the peak level and the pins of both scripts (a pin
 * in a file has no approval time: that is kept on the machine of the person who approved).
 */
export const FULL_RULES_FILE: RepoRules = {
  version: 2,
  peakMode: { level: 'stop', at: '2026-10-30T01:00:00.000Z', origin: { actor: 'human' } },
  rules: {
    'r-no-evening-push': ruleOf({
      id: 'r-no-evening-push',
      title: 'No pushes after 21:00',
      filter: { command: { matches: '^\\s*git\\s+push\\b' } },
      condition: { not: { clock: { from: '09:00', to: '21:00', tz: '+08:00' } } },
      reason: 'Evening pushes broke the nightly build twice.',
    }),
    'r-lint-gate': ruleOf({
      id: 'r-lint-gate',
      title: 'The trunk only moves when lint passes',
      when: { kind: 'event', events: ['gate.trunk-advance'] },
      action: { kind: 'script', script: scriptRef('r-lint-gate'), onError: 'block' },
      reason: 'A red trunk stopped the team for an afternoon.',
    }),
  },
  signals: {
    'code-freeze': { type: { kind: 'boolean' }, description: 'Nobody merges', manual: { value: true, at: '2026-10-30T02:00:00.000Z' } },
    'server-errors-5m': { type: { kind: 'number', unit: 'errors' }, detector: 'd-server-errors' },
  },
  detectors: {
    'd-server-errors': {
      id: 'd-server-errors',
      title: 'Server errors in the last 5 minutes',
      when: { kind: 'every', seconds: 300 },
      action: { kind: 'measure', script: scriptRef('d-server-errors', SHA_OTHER), signal: 'server-errors-5m', ttlMs: 900_000 },
      origin: { actor: 'human', at: '2026-10-30T01:30:00.000Z' },
      status: 'active',
    },
  },
  scripts: {
    'r-lint-gate': scriptRef('r-lint-gate'),
    'd-server-errors': scriptRef('d-server-errors', SHA_OTHER),
  },
}
