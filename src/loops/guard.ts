/**
 * The loop board's two gates (docs/ORCHESTRATION.md §18.8, §18.10; loop board
 * design §2.4 rows 16 and 16a, §6.2, §13): `loops:files-only` over the board's
 * files, and `loops:schedule-tools` over the board's own DSH reminders, so an
 * agent can neither change them through the schedule tools nor make a reminder
 * that the board would take for one of its own.
 *
 * The first one: `loops:files-only`. The entries a person
 * agreed to, their scripts and the board's runtime files are written by the
 * board and by nobody else, so a file tool or a shell command that writes into
 * them is denied with a four-part correction, and the denial is a line of the
 * project's violation journal. The files are `docs/loops/` in every checkout of
 * the repository (the main checkout and each work tree, as `git worktree list`
 * gives them, read at most once a minute) and `.llm/loops/`; reads pass.
 *
 * The rule is the guard framework's (src/guard/rules.ts), installed on
 * `tools/pre-execute` outermost the way the graph row installs graph-files-only
 * (src/guard/graph-files.ts), so a shell write into the board's files gets this
 * correction and not file-tools-only's. It denies from the day the row is
 * enabled; there is no mode that only records. It differs from the graph's gate in
 * one place: a call made from inside another (a `run_code` program's tool call,
 * which carries `parent`) is judged like a direct one. The rule needs no state
 * of the board, so it holds when the board's files cannot be read. The board
 * writes its own files with its own code (store.ts), which the rule never sees:
 * it inspects tool calls only.
 */
import { join } from 'node:path'
import { cachedWorktrees, projectOf } from '../data/project-root.ts'
import { writesInto } from '../guard/directory-writes.ts'
import { baseFor, type ViolationRecord } from '../guard/index.ts'
import { originOf } from '../guard/origin.ts'
import { evaluate, renderCorrection, type Correction, type GuardRule, type RuleVerdict, type ToolCall } from '../guard/rules.ts'
import { dialectNames, dialectService, dialectWarner, toNativeTool, type DialectService } from '../shared/dialect.ts'
import type { PreExecuteDecision, PreExecuteHost, ServiceLookup, ToolExecutionPayload } from '../shared/dsh-min.ts'
import type { JsonValue } from '../shared/json.ts'
import { sessionRoute } from '../shared/route.ts'
import { TASK_PROMPT_PREFIX } from './remove.ts'
import { LOOPS_DECLARATION } from './service.ts'

/** The id the gate carries in the violation journal and the rules board's catalog (`<row>:<id>`). */
export const LOOPS_FILES_ONLY = 'loops:files-only'

const ALLOW: RuleVerdict = { kind: 'allow' }

/** The directories only the loop board writes in: `docs/loops/` and `.llm/loops/` of every checkout of the repository. */
function boardDirs(checkouts: readonly string[]): readonly string[] {
  return checkouts.flatMap(root => [join(root, 'docs', 'loops'), join(root, '.llm', 'loops')])
}

function correction(fact: string): Correction {
  return {
    fact,
    violation: `Rule ${LOOPS_FILES_ONLY} blocks writes under the loop board's files (docs/loops/ in the repository and .llm/loops/); only the loop board writes there.`,
    rightPath: 'Tell the human what you need and why; they delete or restore a loop with /loops.',
    exception: 'Only the human can change loop entries, with /loops.',
  }
}

/** The rule for one call: `checkouts` are the roots of every checkout of the repository, `cwd` the directory relative targets resolve against (without it a relative target cannot be judged and passes). */
export function loopsFilesOnly(checkouts: readonly string[], cwd: string | undefined): GuardRule {
  const writes = writesInto(boardDirs(checkouts), cwd)
  return {
    id: 'files-only',
    declare: LOOPS_DECLARATION,
    detect(call) {
      const write = writes(call)
      if (write === undefined) return ALLOW
      return { kind: 'deny', rule: LOOPS_FILES_ONLY, correction: correction(write.kind === 'file' ? `You tried to write "${write.target}".` : `You tried to change the loop board's files through the shell: "${write.command}".`) }
    },
  }
}

export interface LoopsGuardDeps {
  readonly ctx: PreExecuteHost & ServiceLookup
  readonly now: () => number
  /** Journal a denial in the project's violation journal; it never rejects into the call. */
  readonly journal: (record: ViolationRecord) => void
}

/** What both gates answer a denied call with: the four-part text, and one line of the project's violation journal (the same shape the guard row writes). */
function denial(deps: LoopsGuardDeps, payload: ToolExecutionPayload, verdict: Extract<RuleVerdict, { kind: 'deny' }>, dialect: DialectService | undefined, warn: (text: string) => void): PreExecuteDecision {
  const reason = renderCorrection(verdict.correction)
  const route = sessionRoute(payload.agent?.session)
  deps.journal({
    at: new Date(deps.now()).toISOString(),
    rule: verdict.rule,
    tool: payload.name,
    agentId: payload.agent?.id,
    sessionId: payload.agent?.session?.id,
    ...originOf(dialectNames(dialect, payload.agent, route, warn) !== undefined, route),
    mode: 'enforce',
    correction: reason,
  })
  return { kind: 'deny', reason }
}

/** The id the schedule gate carries in the violation journal and the rules board's catalog. */
export const LOOPS_SCHEDULE_TOOLS = 'loops:schedule-tools'

/** The three calls of DSH's schedule tools the rule judges (tool-schedule:508, 570, 600; `schedule_list` only reads). */
export const SCHEDULE_TOOL_NAMES = ['schedule_create', 'schedule_update', 'schedule_delete'] as const

function scheduleCorrection(fact: string): Correction {
  return {
    fact,
    violation: `Rule ${LOOPS_SCHEDULE_TOOLS} blocks changes to the loop board's own DSH reminders through the schedule tools, and reminders that pass themselves off as the board's.`,
    rightPath: 'That reminder belongs to the loop board; changes go through the loop board (loop_propose), not the schedule tools.',
    exception: 'Reminders you set for yourself are yours: schedule_create with any other text, schedule_list and changes to your own reminders all pass.',
  }
}

/**
 * The rule for one call (design §6.2 last paragraph, §2.4 row 16): a
 * `schedule_create` whose instruction begins, after its surrounding whitespace,
 * with the board's own first line is refused, so a reminder of an agent cannot
 * be taken for one of the board's by the reconciliation (review F13); a
 * `schedule_update` or `schedule_delete` of a task of the board's is refused.
 * `ours` is that fact: `undefined` means it could not be told, and then the call
 * passes and the reconciliation puts the task back afterwards.
 */
export function loopsScheduleTools(ours: boolean | undefined): GuardRule {
  return {
    id: 'schedule-tools',
    declare: LOOPS_DECLARATION,
    detect(call) {
      const args = (call.arguments ?? {}) as Record<string, unknown>
      if (call.name === 'schedule_create') {
        const prompt = typeof args.prompt === 'string' ? args.prompt : ''
        if (!prompt.trim().startsWith(TASK_PROMPT_PREFIX)) return ALLOW
        return { kind: 'deny', rule: LOOPS_SCHEDULE_TOOLS, correction: scheduleCorrection(`You tried to create a reminder whose instruction begins with "${TASK_PROMPT_PREFIX}", which is how the loop board writes its own.`) }
      }
      if (call.name !== 'schedule_update' && call.name !== 'schedule_delete') return ALLOW
      if (ours !== true) return ALLOW
      const id = typeof args.id === 'string' ? args.id : ''
      return { kind: 'deny', rule: LOOPS_SCHEDULE_TOOLS, correction: scheduleCorrection(`You tried to ${call.name === 'schedule_delete' ? 'delete' : 'change'} the reminder "${id}", which the loop board made for one of its loops.`) }
    },
  }
}

export interface ScheduleGuardDeps extends LoopsGuardDeps {
  /** The schedule ids the board bound in a project, from its state. */
  readonly bindings: (projectRoot: string) => ReadonlySet<string>
  /** The task of one id as the host has it, for a task the state does not name; undefined when the catalog cannot be read, and then the call passes. */
  readonly taskOf: (id: string) => Promise<{ readonly prompt: string } | undefined>
}

/**
 * Install the gate on the three schedule tools, outermost on
 * `tools/pre-execute`. The catalog is only read for a call that names an id the
 * board's own state does not, so an ordinary call pays nothing. Throws only
 * when the host refuses the registration.
 */
export function installLoopsScheduleGuard(deps: ScheduleGuardDeps): () => void {
  const warn = dialectWarner('loops')
  const warnFault = dialectWarner('loops')
  return deps.ctx.on('tools/pre-execute', async (payload, next) => {
    try {
      const dialect = dialectService(deps.ctx, warn)
      const name = toNativeTool(dialect, payload.name, warn)
      if (!SCHEDULE_TOOL_NAMES.includes(name as typeof SCHEDULE_TOOL_NAMES[number])) return next()
      const header = payload.agent?.session?.header.cwd
      const cwd = typeof header === 'string' && header.length > 0 ? header : undefined
      const project = cwd === undefined ? undefined : projectOf(cwd)
      const args = (payload.arguments ?? {}) as Record<string, unknown>
      const id = typeof args.id === 'string' ? args.id : undefined
      let ours: boolean | undefined
      if (name !== 'schedule_create' && id !== undefined) {
        ours = project !== undefined && deps.bindings(project.root).has(id)
        if (!ours) {
          // A task the board's state does not name can still be one of its own (the state was lost): the host's own copy decides.
          const task = await deps.taskOf(id)
          ours = task === undefined ? undefined : task.prompt.trim().startsWith(TASK_PROMPT_PREFIX)
        }
      }
      const call: ToolCall = { name, arguments: (payload.arguments ?? {}) as JsonValue }
      const verdict = evaluate([loopsScheduleTools(ours)], call)
      if (verdict.kind !== 'deny') return next()
      return denial(deps, payload, verdict, dialect, warn)
    }
    catch (error) {
      // The gate cannot tell whose reminder the call names: the call goes on, and the host log says the gate failed.
      warnFault(`the loop board's schedule gate could not judge a call: ${error instanceof Error ? error.message : String(error)}`)
      return next()
    }
  }, { prepend: true })
}

/** Install the gate on `tools/pre-execute`, outermost; the disposer takes it out. Throws only when the host refuses the registration. */
export function installLoopsFileGuard(deps: LoopsGuardDeps): () => void {
  const warn = dialectWarner('loops')
  const warnFault = dialectWarner('loops')
  const checkouts = cachedWorktrees(deps.now)
  return deps.ctx.on('tools/pre-execute', (payload, next) => {
    try {
      const header = payload.agent?.session?.header.cwd
      const cwd = typeof header === 'string' && header.length > 0 ? header : undefined
      const project = cwd === undefined ? undefined : projectOf(cwd)
      if (project === undefined) return next()
      // Every route, like the guard row (ORCHESTRATION.md §6.2): the rule judges the DSH native the call runs.
      const dialect = dialectService(deps.ctx, warn)
      const call: ToolCall = { name: toNativeTool(dialect, payload.name, warn), arguments: (payload.arguments ?? {}) as JsonValue }
      const verdict = evaluate([loopsFilesOnly(checkouts(project.root), baseFor(deps.ctx, payload.agent) ?? cwd)], call)
      if (verdict.kind !== 'deny') return next()
      return Promise.resolve(denial(deps, payload, verdict, dialect, warn))
    }
    catch (error) {
      // The gate cannot tell what the call writes: the call goes on, and the host log says the gate failed.
      warnFault(`the loop board's file gate could not judge a call: ${error instanceof Error ? error.message : String(error)}`)
      return next()
    }
  }, { prepend: true })
}
