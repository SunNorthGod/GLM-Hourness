/**
 * `rules_show`, the agent's one tool of the rules board (docs/ORCHESTRATION.md
 * §16.11; design §6.4, §9.3): it lists what holds the caller, so an agent that
 * a rule has refused, or that wants to know before it tries, can read the
 * rules instead of guessing. It lists, without cutting anything short:
 *
 * - the rules in force for the caller: the person's rules that are about the
 *   caller (a rule that names other roles, models or sessions is left out, and a
 *   rule that asks about a field of the caller that is not known is told as
 *   such), the default rule of GLM's prices where there is a pricing service,
 *   and the entries of the code the peak mode enables for the caller;
 * - the caller's own waiting calls;
 * - the signals of the project with their source, and the GLM peak;
 * - how the state was read.
 *
 * It changes nothing, and an agent that is held back may call it
 * (RULES_TOOL_NAMES). There is no tool that writes a rule: only the human
 * changes rules.
 */
import { projectOf } from '../data/project-root.ts'
import { matchesFilter } from '../loops/trigger.ts'
import type { AgentLike, ServiceLookup, ToolDefinitionLike } from '../shared/dsh-min.ts'
import { GLM_PEAK_PRICING } from './builtin.ts'
import { callerOf, type Caller } from './caller.ts'
import { judgeInput } from './judge.ts'
import { openTickets, projectSignals, rulesInForce, stateNotes } from './listing.ts'
import { effectivePeakMode, type BuiltinRule, type ProjectState, type Rule } from './model.ts'
import type { PeakReading, ProjectView } from './peak.ts'
import { showText, type ShownRule } from './show.ts'
import { clockReadings, tableOf } from './table.ts'

export interface ShowToolDeps {
  readonly ctx: ServiceLookup
  readonly now: () => number
  /** The project of a working directory, as the row reads it; it throws when the files cannot be read. */
  readonly project: (cwd: string) => ProjectView | undefined
  readonly peak: () => PeakReading
}

const NO_PROJECT = 'This session has no working directory, or it is not in a project: no project\'s rules apply to it, only the rules in code do.'

/** Said of a rule that queues: nothing defers a call yet. */
const QUEUE_NOT_ENFORCED = 'Not enforced yet: a call this rule would defer runs.'

const ITEMS = ['role', 'model', 'session'] as const

/** Whether a rule is about the caller: its filter's `role`, `model` and `session` against what the caller is, and a session rule against the caller's session. A field the caller cannot tell makes the rule not apply, and the reason is told for a rule of the person. */
function aboutCaller(rule: Rule | BuiltinRule, caller: Caller, project: string): { readonly applies: boolean, readonly note?: string } {
  if (rule.scope === 'session' && 'sessionId' in rule && rule.sessionId !== caller.sessionId) return { applies: false }
  for (const item of ITEMS) {
    const test = rule.filter?.[item]
    if (test === undefined) continue
    const value = item === 'session' ? caller.sessionId : caller[item]
    if (value === undefined) return { applies: false, ...(rule.scope === 'builtin' ? {} : { note: `${rule.id} asks about your ${item}, which is not known: ${caller.unknown[item] ?? 'no reason given'}.` }) }
    if (!matchesFilter({ [item]: test }, { [item]: value }, project)) return { applies: false }
  }
  return { applies: true }
}

/** The listing for one caller. */
function showFor(deps: ShowToolDeps, agent: AgentLike | undefined): string {
  const caller = callerOf(deps.ctx, agent)
  const project = caller.cwd === undefined ? undefined : projectOf(caller.cwd)
  const view = caller.cwd === undefined || project === undefined ? undefined : deps.project(caller.cwd)
  if (project === undefined || view === undefined) return NO_PROJECT
  const state: ProjectState = view.read.state
  const level = effectivePeakMode(state)
  const reading = deps.peak()
  const now = new Date(deps.now())
  const { glmPeak, until, readings } = clockReadings(state, reading, now)
  const input = judgeInput({ now, project: project.root, events: [], signals: [...readings.values()] })
  const notes = stateNotes(view.read)
  const rules: ShownRule[] = []
  for (const shown of rulesInForce(state, tableOf(state, level.level), input)) {
    if (shown.rule.id === GLM_PEAK_PRICING.id) {
      if (reading.noService !== true) rules.push(shown)
      continue
    }
    const placed = aboutCaller(shown.rule, caller, project.root)
    if (placed.note !== undefined) notes.push(placed.note)
    if (!placed.applies) continue
    rules.push(shown.rule.action.kind === 'queue' ? { ...shown, note: [shown.note, QUEUE_NOT_ENFORCED].filter(part => part !== undefined).join(' ') } : shown)
  }
  const tickets = openTickets(state).filter(ticket => ticket.sessionId === caller.sessionId)
  return showText({ project: project.root, peak: level, glmPeak, ...(until === undefined ? {} : { until }), rules, tickets, signals: projectSignals(state, readings), notes })
}

const EMPTY_PARAMETERS = { type: 'object', properties: {}, required: [], additionalProperties: false }
const OUTPUT_SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' }, text: { type: 'string' } }, required: ['ok', 'text'], additionalProperties: false }

/** The tool, to register on the host. */
export function rulesShowTool(deps: ShowToolDeps): ToolDefinitionLike {
  return {
    name: 'rules_show',
    description: 'Read the rules board of this project: the rules in force for you and how each acts (blocked, recorded, for information), the human who set them and since when, your waiting calls, the signals the rules read with their source, whether it is a GLM peak, and the peak mode. Nothing is left out. You cannot change rules: only the human can.',
    parameters: EMPTY_PARAMETERS,
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: (value as { text: string }).text }],
    },
    execute: (_args, exec) => {
      const agent = (exec as { agent?: AgentLike } | undefined)?.agent
      return Promise.resolve({ ok: true, text: showFor(deps, agent) })
    },
  }
}
