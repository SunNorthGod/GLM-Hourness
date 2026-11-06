/**
 * The transcript service contract between the two packages (docs/DESIGN.md
 * §2.4, §5.6, §8): the orchestration package's transcript row
 * (src/data/transcript-row.ts) provides `glmHournessTranscript`; the GLM
 * channel package's glm-compact row reads it lazily through cordis `ctx.get`
 * and, when a GLM compaction summary is done, asks it to export the
 * session's log as plain text. The row ships enabled; with it disabled, or
 * with only the GLM package installed, the service is absent and
 * glm-compact's output is unchanged.
 */
import type { ServiceLookup } from './dsh-min.ts'

/** The cordis service name the transcript row provides. */
export const TRANSCRIPT_SERVICE = 'glmHournessTranscript'

/** What one export came to: the absolute path of the written file, or why nothing was written. */
type TranscriptExport =
  | { readonly kind: 'written', readonly path: string, readonly entries: number }
  | { readonly kind: 'skipped', readonly reason: string }

export interface TranscriptService {
  /** Export the whole log of one session before its compaction checkpoint lands; never rejects. */
  exportBeforeCompaction(sessionId: string): Promise<TranscriptExport>
}

/** Read the transcript service; undefined while the transcript row is disabled or not active yet. */
export function transcriptService(ctx: ServiceLookup): TranscriptService | undefined {
  const value = typeof ctx.get === 'function' ? ctx.get(TRANSCRIPT_SERVICE) : undefined
  if (typeof value !== 'object' || value === null) return undefined
  return typeof (value as Record<string, unknown>).exportBeforeCompaction === 'function' ? value as TranscriptService : undefined
}
