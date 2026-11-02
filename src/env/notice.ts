/**
 * The environment notice (M4 design §7.2): what the project already has,
 * which checks run after edits, and where one-off scripts go. Injected at an
 * agent's first step and whenever the branch changes (the digest of the body
 * moves), after a compaction the same way the graph projection re-anchors
 * (src/graph/reminder.ts). The checks line stays "No checks run after edits
 * in this project yet." until m4-checks wires the check lines; a session
 * whose graph is unreadable (or has no `env` node) gets the scratch line
 * alone.
 */
import { createHash } from 'node:crypto'
import type { DerivedMessage, SessionLike, UserNotice } from '../shared/dsh-min.ts'
import { createUserNotice } from '../shared/dsh-min.ts'
import { wrapSystemReminder } from '../shared/zcode-notice.ts'
import { graphService } from '../graph/service.ts'
import { readGraph } from '../graph/row-health.ts'
import { CHECKPOINT_SOURCE } from '../graph/reminder.ts'
import { envBranch, type EnvBranch } from './branch.ts'
import type { ServiceLookup } from '../shared/dsh-min.ts'

/** Source kind of the persisted environment notice; later steps re-derive from it. */
export const ENV_NOTICE_SOURCE = 'hourness-env'

/** At most this many tools are listed; the rest collapse into one line. */
const TOOL_LIMIT = 12

/** The notice body stays within this many characters. */
const BODY_LIMIT = 1500

/** The scratch line, present in every environment notice (the one thing every session needs). */
export const SCRATCH_LINE = 'One-off scripts go in .llm/scratch/ (git-ignored). Delete them or promote them (create them again under scripts/ with the write tool and give them a graph node) before you hand back.'

/** The checks line until m4-checks wires the check lines of the approved tool nodes. */
export const NO_CHECKS_LINE = 'No checks run after edits in this project yet.'

/** The reminder body for one branch, or for no branch at all (the scratch line alone). */
export function envNoticeBody(branch: EnvBranch | undefined): string {
  const lines: string[] = []
  if (branch !== undefined && (branch.tools.length > 0 || branch.proposals > 0)) {
    lines.push('Project tools (graph node env). Use these before writing your own.')
    for (const tool of branch.tools.slice(0, TOOL_LIMIT)) lines.push(`- ${tool.title} [${tool.id}]: ${tool.usage.slice(0, 120)}`)
    if (branch.tools.length > TOOL_LIMIT) lines.push(`${branch.tools.length - TOOL_LIMIT} more: graph_show env`)
    if (branch.proposals > 0) lines.push(`${branch.proposals} more tool node${branch.proposals === 1 ? ' waits' : 's wait'} for the human's approval.`)
    lines.push(NO_CHECKS_LINE)
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

/** The notice body for one session: the branch of its project graph, or the scratch line alone. */
async function bodyForSession(ctx: ServiceLookup, session: SessionLike): Promise<string> {
  const cwd = session.header.cwd
  const dir = graphService(ctx)?.dirFor(cwd)
  if (dir === undefined) return envNoticeBody(undefined)
  const read = await readGraph(dir, cwd)
  if ('failure' in read) return envNoticeBody(undefined)
  return envNoticeBody(envBranch(read.graph))
}

/**
 * The user notice for this step, or undefined when the history already shows
 * the current body. The facts ride on the notice's source, so a later step
 * (and a resumed or compacted session) re-derives what the model was shown.
 */
export async function envNotice(ctx: ServiceLookup, history: readonly DerivedMessage[], session: SessionLike): Promise<UserNotice | undefined> {
  const body = await bodyForSession(ctx, session)
  const digest = createHash('sha256').update(body).digest('hex').slice(0, 12)
  const state = envNoticeHistory(history)
  const reason = envNoticeReason(state, digest)
  if (reason === undefined) return undefined
  const anchor = state.checkpoint?.id
  return createUserNotice(ENV_NOTICE_SOURCE, `environment notice (${reason})`, wrapSystemReminder(body), { envNotice: { digest, ...(anchor === undefined ? {} : { anchor }), reason } })
}
