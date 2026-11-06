/**
 * The environment notice (M4 design §7.2): what the project already has,
 * which checks run after edits, and where one-off scripts go. Injected at an
 * agent's first step and whenever the branch changes (the digest of the body
 * moves), after a compaction the same way the graph projection re-anchors
 * (src/graph/reminder.ts). The checks line names M4's own checks (the
 * check lines with `when` of the approved tool nodes) and where they apply;
 * a changed check line or tool node revision counts as a change too. The
 * root agent's notice adds one line per check held at its ceiling
 * (limit-tool.ts, design §6.3.1 item 6): raising the ceiling is its own
 * decision; the line goes when the state does, which is a change too. A
 * session whose graph is unreadable (or has no `env` node) gets the scratch
 * line alone.
 */
import { createHash } from 'node:crypto'
import type { DerivedMessage, SessionLike, UserNotice } from '../shared/dsh-min.ts'
import { createUserNotice } from '../shared/dsh-min.ts'
import { wrapSystemReminder } from '../shared/zcode-notice.ts'
import { graphService } from '../graph/service.ts'
import { readGraph } from '../graph/row-health.ts'
import { CHECKPOINT_SOURCE } from '../graph/reminder.ts'
import { loopsService } from '../loops/service.ts'
import { projectHomeFor } from '../data/project-home.ts'
import { envBranch, type EnvBranch } from './branch.ts'
import { heldAtCeiling, heldSentence, readLimits } from './limit-tool.ts'
import { argvDigest, checkKey, readTiming } from './timeout.ts'
import type { ServiceLookup } from '../shared/dsh-min.ts'

/** Source kind of the persisted environment notice; later steps re-derive from it. */
export const ENV_NOTICE_SOURCE = 'hourness-env'

/** At most this many tools are listed; the rest collapse into one line. */
const TOOL_LIMIT = 12

/** The notice body stays within this many characters. */
const BODY_LIMIT = 1500

/** The scratch line, present in every environment notice (the one thing every session needs). */
export const SCRATCH_LINE = 'One-off scripts go in .llm/scratch/ (git-ignored). Delete them or promote them (create them again under scripts/ with the write tool and give them a graph node) before you hand back.'

/** The checks line when no approved tool node has a check line with `when`. */
export const NO_CHECKS_LINE = 'No checks run after edits in this project yet.'

/** The checks line when the loop board is off: M4's own checks do not run (design §6.1.2). */
export const NO_BOARD_LINE = 'No checks run after edits: the loop board is not enabled.'

/** The checks line stays within this many characters. */
const CHECKS_LINE_LIMIT = 300

/** The checks line: M4's own checks by name and conditions, or why none run. */
function checksLine(branch: EnvBranch, board: boolean): string {
  if (!board) return NO_BOARD_LINE
  const own = branch.tools.flatMap(tool => tool.checks.flatMap(check => check.paths === undefined ? [] : [`${check.name} on ${check.paths.join(', ')}`]))
  if (own.length === 0) return NO_CHECKS_LINE
  const line = `Checks run after each edit (listed on the loop board): ${own.join('; ')}.`
  return line.length <= CHECKS_LINE_LIMIT ? line : `${line.slice(0, CHECKS_LINE_LIMIT - 1)}…`
}

/**
 * The reminder body for one branch, or for no branch at all (the scratch
 * line alone); `board` says whether the loop board is on; `held` are the
 * lines of the checks held at their ceiling, for the root agent alone.
 */
export function envNoticeBody(branch: EnvBranch | undefined, board = true, held: readonly string[] = []): string {
  const lines: string[] = []
  if (branch !== undefined && (branch.tools.length > 0 || branch.proposals > 0)) {
    lines.push('Project tools (graph node env). Use these before writing your own.')
    for (const tool of branch.tools.slice(0, TOOL_LIMIT)) lines.push(`- ${tool.title} [${tool.id}]: ${tool.usage.slice(0, 120)}`)
    if (branch.tools.length > TOOL_LIMIT) lines.push(`${branch.tools.length - TOOL_LIMIT} more: graph_show env`)
    if (branch.proposals > 0) lines.push(`${branch.proposals} more tool node${branch.proposals === 1 ? ' waits' : 's wait'} for the human's approval.`)
    lines.push(checksLine(branch, board))
    if (board) lines.push(...held)
  }
  lines.push(SCRATCH_LINE)
  let body = lines.join('\n')
  // The cap is on the model-visible text: drop whole tool lines from the end
  // (the "N more" line already points at graph_show env) until it fits.
  while (body.length > BODY_LIMIT && lines.length > 1) {
    const index = lines.findIndex(line => line.startsWith('- '))
    if (index < 0) break
    lines.splice(index, 1)
    body = lines.join('\n')
  }
  return body
}

/** Why this step needs the notice. */
type EnvNoticeReason = 'first' | 'changed' | 'compaction'

interface NoticeFacts {
  readonly digest: string
  readonly anchor?: string
  readonly reason: EnvNoticeReason
}

/** What the request-visible history shows about earlier environment notices. */
interface EnvHistory {
  readonly notice?: NoticeFacts & { readonly index: number }
  readonly checkpoint?: { readonly index: number, readonly id?: string }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function noticeFacts(value: unknown): NoticeFacts | undefined {
  if (!isRecord(value)) return undefined
  const { digest, anchor, reason } = value
  if (typeof digest !== 'string' || !['first', 'changed', 'compaction'].includes(reason as EnvNoticeReason)) return undefined
  if (anchor !== undefined && typeof anchor !== 'string') return undefined
  return { digest, ...(anchor === undefined ? {} : { anchor }), reason: reason as EnvNoticeReason }
}

/** The latest environment notice and the latest compaction checkpoint of the history. */
function envNoticeHistory(history: readonly DerivedMessage[]): EnvHistory {
  // Later messages overwrite earlier ones, so the loop ends at the newest of each kind.
  let notice: EnvHistory['notice']
  let checkpoint: EnvHistory['checkpoint']
  for (const [index, message] of history.entries()) {
    const kind = message.source?.kind
    if (kind === CHECKPOINT_SOURCE) {
      const id = message.source?.compactionId
      checkpoint = typeof id === 'string' ? { index, id } : { index }
    }
    else if (message.role === 'user' && kind === ENV_NOTICE_SOURCE) {
      const facts = noticeFacts(message.source?.envNotice)
      if (facts !== undefined) notice = { ...facts, index }
    }
  }
  return {
    ...(notice === undefined ? {} : { notice }),
    ...(checkpoint === undefined ? {} : { checkpoint }),
  }
}

/** Why this step needs a notice, or undefined when the history already shows this body. */
function envNoticeReason(state: EnvHistory, digest: string): EnvNoticeReason | undefined {
  const { notice, checkpoint } = state
  if (checkpoint !== undefined && (notice === undefined || notice.index < checkpoint.index || notice.anchor !== checkpoint.id)) return 'compaction'
  if (notice === undefined) return 'first'
  if (notice.digest !== digest) return 'changed'
  return undefined
}

/**
 * The lines of the checks held at their ceiling (design §6.3.1 item 6), from
 * the project's timing journal and limits.jsonl: M4's own checks of the
 * branch, in branch order. A journal or a setting that cannot be read gives
 * no line from it.
 */
async function heldLines(home: string | undefined, branch: EnvBranch): Promise<readonly string[]> {
  if (home === undefined) return []
  const timing = await readTiming(home)
  const limits = await readLimits(home)
  if ('error' in timing) return []
  const book = 'error' in limits ? { lines: [], bad: 0 } : limits
  const nowMs = Date.now()
  return branch.tools.flatMap(tool => tool.checks.flatMap((check) => {
    if (check.paths === undefined) return []
    const held = heldAtCeiling(timing.lines, book, { key: checkKey(tool.id, check.name), name: check.name, argv: argvDigest(check.argv), estimateS: check.estimateSeconds }, nowMs)
    return held === undefined ? [] : [heldSentence(held)]
  }))
}

/**
 * The notice body for one session: the branch of its project graph, or the
 * scratch line alone; with the revisions of the tool nodes that carry checks,
 * which the digest takes in so a changed check command shows again. A root
 * agent's body (no `origin: 'subagent'` on the session header) also has the
 * lines of the checks held at their ceiling: only the main agent can raise
 * a ceiling.
 */
async function bodyForSession(ctx: ServiceLookup, session: SessionLike): Promise<{ readonly body: string, readonly revisions: string }> {
  const cwd = session.header.cwd
  const dir = graphService(ctx)?.dirFor(cwd)
  if (dir === undefined) return { body: envNoticeBody(undefined), revisions: '' }
  const read = await readGraph(dir, cwd)
  if ('failure' in read) return { body: envNoticeBody(undefined), revisions: '' }
  const branch = envBranch(read.graph)
  const revisions = branch.tools.filter(tool => tool.checks.length > 0).map(tool => `${tool.id}@${tool.rev}`).join(',')
  const board = loopsService(ctx) !== undefined
  const held = board && session.header.origin !== 'subagent' ? await heldLines(projectHomeFor(ctx, undefined, cwd), branch) : []
  return { body: envNoticeBody(branch, board, held), revisions }
}

/**
 * The user notice for this step, or undefined when the history already shows
 * the current body. The facts ride on the notice's source, so a later step
 * (and a resumed or compacted session) re-derives what the model was shown.
 */
export async function envNotice(ctx: ServiceLookup, history: readonly DerivedMessage[], session: SessionLike): Promise<UserNotice | undefined> {
  const { body, revisions } = await bodyForSession(ctx, session)
  const digest = createHash('sha256').update(revisions === '' ? body : `${body}\n${revisions}`).digest('hex').slice(0, 12)
  const state = envNoticeHistory(history)
  const reason = envNoticeReason(state, digest)
  if (reason === undefined) return undefined
  const anchor = state.checkpoint?.id
  return createUserNotice(ENV_NOTICE_SOURCE, `environment notice (${reason})`, wrapSystemReminder(body), { envNotice: { digest, ...(anchor === undefined ? {} : { anchor }), reason } })
}
