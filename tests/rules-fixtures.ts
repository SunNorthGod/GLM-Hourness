/**
 * Shared fixtures of the rules board's pure specs (rules-model, rules-judge,
 * rules-builtin): a moment inside GLM's peak hours, a call, the readings a
 * judgement is given, and a rule in the 0.9 shape.
 */
import { gateEvents, type GateCall } from '../src/rules/events.ts'
import { judgeInput, type JudgeInput } from '../src/rules/judge.ts'
import type { Rule, RuleContext, SignalType } from '../src/rules/model.ts'
import type { SignalReading } from '../src/rules/signals.ts'

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
