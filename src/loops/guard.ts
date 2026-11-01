/**
 * The loop board's gate on its own files (docs/ORCHESTRATION.md §18.8; loop
 * board design §2.4 row 16a, §13): `loops:files-only`. The entries a person
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
import { dialectNames, dialectService, dialectWarner, toNativeTool } from '../shared/dialect.ts'
import type { PreExecuteHost, ServiceLookup } from '../shared/dsh-min.ts'
import type { JsonValue } from '../shared/json.ts'
import { sessionRoute } from '../shared/route.ts'
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
      return Promise.resolve({ kind: 'deny', reason })
    }
    catch (error) {
      // The gate cannot tell what the call writes: the call goes on, and the host log says the gate failed.
      warnFault(`the loop board's file gate could not judge a call: ${error instanceof Error ? error.message : String(error)}`)
      return next()
    }
  }, { prepend: true })
}
