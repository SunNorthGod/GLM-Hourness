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
 * Both are the guard framework's rules (src/guard/rules.ts), installed through
 * its one gate (src/guard/gate.ts) outermost on `tools/pre-execute`, the way
 * the graph row installs graph-files-only (src/guard/graph-files.ts), so a
 * shell write into the board's files gets this correction and not
 * file-tools-only's. They deny from the day the row is enabled; there is no
 * mode that only records. `loops:files-only` differs from the graph's gate in
 * one place: a call made from inside another (a `run_code` program's tool call,
 * which carries `parent`) is judged like a direct one — the gate judges
 * children for this row (`judgeChildren`, ORCHESTRATION.md §18.8). Neither
 * rule needs state of the board,
 * so both hold when the board's files cannot be read. The board writes its own
 * files with its own code (store.ts), which the rules never see: they inspect
 * tool calls only.
 */
import { join } from 'node:path'
import { cachedWorktrees, projectOf } from '../data/project-root.ts'
import { cwdOf, installRuleGate, type GateHost } from '../guard/gate.ts'
import { writesInto } from '../guard/directory-writes.ts'
import { baseFor } from '../guard/index.ts'
import type { GuardRecord } from '../guard/records.ts'
import { originOf } from '../guard/origin.ts'
import { NATIVE_FACE, type Correction, type GuardRule, type RuleVerdict } from '../guard/rules.ts'
import { dialectNames, dialectService, dialectWarner, type DialectProblem } from '../shared/dialect.ts'
import { sessionRoute } from '../shared/route.ts'
import type { ToolExecutionPayload } from '../shared/dsh-min.ts'
import { TASK_PROMPT_PREFIX } from './remove.ts'

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
    detect(call) {
      const write = writes(call)
      if (write === undefined) return ALLOW
      return { kind: 'deny', rule: LOOPS_FILES_ONLY, correction: correction(write.kind === 'file' ? `You tried to write "${write.target}".` : `You tried to change the loop board's files through the shell: "${write.command}".`) }
    },
  }
}

export interface LoopsGuardDeps {
  readonly ctx: GateHost
  readonly now: () => number
  /** Journal a denial into the project of the call's session; it never rejects into the call. */
  readonly journal: (record: GuardRecord, cwd: string | undefined) => void
}

/** The rules of one call with the face the model reads and the origin of where it ran: the same reading in both gates (ORCHESTRATION.md §6.2). */
function rulesOf(deps: LoopsGuardDeps, warn: DialectProblem, payload: ToolExecutionPayload, rules: readonly GuardRule[]) {
  const route = sessionRoute(payload.agent?.session)
  return {
    rules,
    face: NATIVE_FACE,
    origin: originOf(dialectNames(dialectService(deps.ctx, warn), payload.agent, route, warn) !== undefined, route),
  }
}

/** The gate's journal call: the record goes to the project of the call's session. */
function journalOf(deps: LoopsGuardDeps): (record: GuardRecord, payload: ToolExecutionPayload) => void {
  return (record, payload) => { deps.journal(record, cwdOf(payload)) }
}

/** The id the schedule gate carries in the violation journal and the rules board's catalog. */
export const LOOPS_SCHEDULE_TOOLS = 'loops:schedule-tools'

/**
 * The calls of DSH's schedule tools the rule judges; `schedule_list` and
 * `schedule_view` only read and pass (rc.1 dsh-schedule tool directory,
 * dsh-schedule/README.md:30–37). rc.1 merged rc.3's `schedule_update` and
 * `schedule_delete` into one `schedule_edit`.
 */
export const SCHEDULE_TOOL_NAMES = ['schedule_create', 'schedule_edit'] as const

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
 * `schedule_edit` of a task of the board's is refused (an update or a delete,
 * whichever its `action` says). `ours` is that fact: `undefined` means it could
 * not be told, and then the call passes and the reconciliation puts the task
 * back afterwards.
 */
export function loopsScheduleTools(ours: boolean | undefined): GuardRule {
  return {
    id: 'schedule-tools',
    detect(call) {
      const args = (call.arguments ?? {}) as Record<string, unknown>
      if (call.name === 'schedule_create') {
        const prompt = typeof args.prompt === 'string' ? args.prompt : ''
        if (!prompt.trim().startsWith(TASK_PROMPT_PREFIX)) return ALLOW
        return { kind: 'deny', rule: LOOPS_SCHEDULE_TOOLS, correction: scheduleCorrection(`You tried to create a reminder whose instruction begins with "${TASK_PROMPT_PREFIX}", which is how the loop board writes its own.`) }
      }
      if (call.name !== 'schedule_edit') return ALLOW
      if (ours !== true) return ALLOW
      // The rc.1 service face takes the id at the top of the edit request; the tool package (dsh-tool-schedule) is not in
      // the rc.1 export, so the tool's own argument shape is UNVERIFIED — read here as a top-level `id`, to check on the
      // desktop (L4). A wrong reading would only let one rename through: the reconciliation puts the task back.
      const id = typeof args.id === 'string' ? args.id : ''
      return { kind: 'deny', rule: LOOPS_SCHEDULE_TOOLS, correction: scheduleCorrection(`You tried to change the reminder "${id}", which the loop board made for one of its loops.`) }
    },
  }
}

export interface ScheduleGuardDeps extends LoopsGuardDeps {
  /** The schedule ids the board bound in a project, from its state. */
  readonly bindings: (projectRoot: string) => ReadonlySet<string>
  /** The task of one id as the host has it, for a task the state does not name; undefined when it cannot be read, and then the call passes. */
  readonly taskOf: (id: string) => Promise<{ readonly prompt: string } | undefined>
}

/**
 * Install the gate on the schedule tools through the guard framework's
 * one gate, outermost on `tools/pre-execute`. The host is only read for a
 * call that names an id the board's own state does not, so an ordinary call
 * pays nothing. Throws only when the host refuses the registration.
 */
export function installLoopsScheduleGuard(deps: ScheduleGuardDeps): () => void {
  const warn = dialectWarner('loops')
  return installRuleGate(deps.ctx, {
    row: 'loops',
    prepend: true,
    rules: async (payload, call) => {
      if (!SCHEDULE_TOOL_NAMES.includes(call.name as typeof SCHEDULE_TOOL_NAMES[number])) return undefined
      const cwd = cwdOf(payload)
      const project = cwd === undefined ? undefined : projectOf(cwd)
      const args = (payload.arguments ?? {}) as Record<string, unknown>
      const id = typeof args.id === 'string' ? args.id : undefined
      let ours: boolean | undefined
      if (call.name !== 'schedule_create' && id !== undefined) {
        ours = project !== undefined && deps.bindings(project.root).has(id)
        if (!ours) {
          // A task the board's state does not name can still be one of its own (the state was lost): the host's own copy decides.
          const task = await deps.taskOf(id)
          ours = task === undefined ? undefined : task.prompt.trim().startsWith(TASK_PROMPT_PREFIX)
        }
      }
      return rulesOf(deps, warn, payload, [loopsScheduleTools(ours)])
    },
    journal: journalOf(deps),
  })
}

/** Install the gate on `tools/pre-execute`, outermost; the disposer takes it out. Throws only when the host refuses the registration. */
export function installLoopsFileGuard(deps: LoopsGuardDeps): () => void {
  const warn = dialectWarner('loops')
  const checkouts = cachedWorktrees(deps.now)
  return installRuleGate(deps.ctx, {
    row: 'loops',
    prepend: true,
    // A run_code program's tool call (it carries `parent`) is judged like a direct one (ORCHESTRATION.md §18.8).
    judgeChildren: true,
    rules: (payload) => {
      const cwd = cwdOf(payload)
      const project = cwd === undefined ? undefined : projectOf(cwd)
      if (project === undefined) return undefined
      // Every route, like the guard row (ORCHESTRATION.md §6.2): the rule judges the DSH native the call runs.
      return rulesOf(deps, warn, payload, [loopsFilesOnly(checkouts(project.root), baseFor(deps.ctx, payload.agent) ?? cwd)])
    },
    journal: journalOf(deps),
  })
}
