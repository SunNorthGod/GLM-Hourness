/**
 * "Only when it changed" for a notice that shows the model a digest of the
 * graph (docs/ORCHESTRATION.md §2.5, §3.5): the step projection of the focus
 * node (src/graph/reminder.ts) and the main agent's stage reminder
 * (src/design/stage-notice.ts) both decide the same way whether the history
 * already shows the current text. Everything is re-derived from the
 * request-visible history on every step, so resume and compaction see what
 * the model sees. A notice is added when the history has none for the
 * current subject, when the text changed since the latest one, when a
 * compaction checkpoint came after it or it was anchored to another one
 * (re-anchoring), or when the step admits a goal round message (one beat of
 * the goal driver). Compaction removes the notices from the visible history,
 * so a checkpoint without a later notice always asks for a new one.
 */
import { createHash } from 'node:crypto'
import type { DerivedMessage } from '../shared/dsh-min.ts'

/**
 * Source kind of the user message a compaction puts in place of the range
 * it summarized; the source also carries the string `compactionId`
 * (compaction:109, compaction:116–122; compaction-basic:595–598).
 */
export const CHECKPOINT_SOURCE = 'compact-checkpoint'

/** Source kind of a goal round message, queued with agent.followup and admitted by the next step (goal-round-driver:144–151, 164). */
export const GOAL_ROUND_SOURCE = 'goal'

/** What every notice of this family keeps in its source; later steps re-derive what the model was shown from it. */
export interface DigestFacts {
  /** First 12 hex digits of the SHA-256 of the notice body. */
  readonly digest: string
  /** compactionId of the latest checkpoint visible when the notice was added. */
  readonly anchor?: string
}

/** What the request-visible history shows about one kind of notice. */
export interface NoticeHistory<Facts extends DigestFacts> {
  readonly notice?: Facts & { readonly index: number }
  readonly checkpoint?: { readonly index: number, readonly id?: string }
}

/** First 12 hex digits of the SHA-256 of a notice body. */
export function digestOf(body: string): string {
  return createHash('sha256').update(body).digest('hex').slice(0, 12)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Whether a message the step admits is a goal round message. */
export function isGoalRound(message: unknown): boolean {
  return isRecord(message) && isRecord(message.source) && message.source.kind === GOAL_ROUND_SOURCE
}

/**
 * The latest notice of `kind` in the history and the latest compaction
 * checkpoint. `read` takes the source of a user message of that kind and
 * returns its facts; a source it cannot read counts as no notice.
 */
export function noticeHistory<Facts extends DigestFacts>(history: readonly DerivedMessage[], kind: string, read: (source: Readonly<Record<string, unknown>>) => Facts | undefined): NoticeHistory<Facts> {
  let notice: NoticeHistory<Facts>['notice']
  let checkpoint: NoticeHistory<Facts>['checkpoint']
  for (let index = history.length - 1; index >= 0; index--) {
    if (notice !== undefined && checkpoint !== undefined) break
    const message = history[index]
    const source = message.source
    if (source?.kind === CHECKPOINT_SOURCE) {
      const id = source.compactionId
      checkpoint ??= typeof id === 'string' ? { index, id } : { index }
      continue
    }
    if (message.role !== 'user' || source?.kind !== kind) continue
    const facts = read(source)
    if (facts !== undefined) notice ??= { ...facts, index }
  }
  return { ...(notice === undefined ? {} : { notice }), ...(checkpoint === undefined ? {} : { checkpoint }) }
}

/**
 * Why this step needs a notice, or undefined when the history already shows
 * the current text. The first rule that applies wins: `compaction`, then
 * `goal-round`, then `subject` (no notice yet, or one about another subject),
 * then `changed`.
 * @param subject - the name of the reason for a new subject (the focus node, the goal).
 */
export function changeReason<Facts extends DigestFacts, Subject extends string>(
  state: NoticeHistory<Facts>,
  current: { readonly digest: string, readonly goalRound: boolean, readonly sameSubject: (notice: Facts) => boolean },
  subject: Subject,
): 'compaction' | 'goal-round' | Subject | 'changed' | undefined {
  const { notice, checkpoint } = state
  if (checkpoint !== undefined && (notice === undefined || notice.index < checkpoint.index || notice.anchor !== checkpoint.id)) return 'compaction'
  if (current.goalRound) return 'goal-round'
  if (notice === undefined || !current.sameSubject(notice)) return subject
  if (notice.digest !== current.digest) return 'changed'
  return undefined
}
