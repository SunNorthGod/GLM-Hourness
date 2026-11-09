/**
 * dsh-glm-hourness/transcript — the session transcript row (docs/DESIGN.md
 * §2.2, §2.4, §5.6).
 *
 * Provides the cordis service `glmHournessTranscript`
 * (src/shared/transcript.ts). The glm-compact row of the GLM channel
 * package calls it once a GLM compaction summary is done: the service
 * writes the session's whole log as plain text, credential-like strings
 * replaced, to `<project data dir>/transcripts/<session id>.txt`
 * (src/data/transcript.ts) and returns the path, which glm-compact puts at
 * the end of the summary in ZCode 3.17.1's transcript sentence. The row
 * health of the session names how many strings an export replaced, or why
 * nothing was written. Registers nothing model-facing; the
 * model reads the file with Read. Ships enabled since 2026-11-06, after the
 * L3 probe (scenario glm-compact-transcript) and the desktop L4 on an
 * isolated instance (packages/hourness/cordis.patch.yml). Activation does no
 * I/O and never throws.
 */
import { exportTranscript, TRANSCRIPT_KEEP_DAYS, TRANSCRIPTS_DIR, type ExportResult } from './transcript.ts'
import { provideRowHealth, type HealthState } from '../shared/health.ts'
import type { ProvideHost, ServiceLookup } from '../shared/dsh-min.ts'
import { TRANSCRIPT_SERVICE, type TranscriptService } from '../shared/transcript.ts'

export interface TranscriptConfig {
  /** The project data directory for every session (the probe and tests point it at their run directory); default: the session's project `.llm`. Empty counts as unset. */
  readonly home?: string
}

/** cordis plugin identity. */
export const name = 'dsh-glm-hourness/transcript'

/** Row health for one export. */
export function transcriptHealth(result: ExportResult): [HealthState, string] {
  if (result.kind === 'skipped') return ['degraded', `压缩摘要不带原文路径：${result.reason}`]
  const cleanup = [
    ...(result.cleanup.removed > 0 ? [`清掉 ${result.cleanup.removed} 份超过 ${TRANSCRIPT_KEEP_DAYS} 天的旧导出`] : []),
    ...(result.cleanup.failed > 0 ? [`${result.cleanup.failed} 份旧导出没清掉`] : []),
  ]
  const reason = [`压缩前导出 ${result.entries} 条到 ${result.path}，遮掉 ${result.redacted} 处像凭证的字符串`, ...cleanup].join('；')
  return [result.cleanup.failed > 0 ? 'degraded' : 'active', reason]
}

/** cordis plugin entry: provide the service and the row health; activation never throws. */
export function apply(ctx: ServiceLookup & Partial<ProvideHost>, config: TranscriptConfig = {}): () => void {
  const health = provideRowHealth(ctx, 'transcript', 'active', `已加载；GLM 压缩时把会话导出到项目 .llm/${TRANSCRIPTS_DIR}/，像凭证的字符串遮掉，别的会话的导出 ${TRANSCRIPT_KEEP_DAYS} 天后清掉`)
  const home = config.home === undefined || config.home.length === 0 ? undefined : config.home
  const service: TranscriptService = Object.freeze({
    async exportBeforeCompaction(sessionId: string) {
      const result = await exportTranscript(ctx, home, sessionId, new Date())
      health.report(sessionId, ...transcriptHealth(result))
      return result.kind === 'written' ? { kind: 'written', path: result.path, entries: result.entries } as const : result
    },
  })
  let withdraw = (): void => {}
  try {
    if (typeof ctx.provide !== 'function') throw new Error('the context cannot provide services')
    withdraw = ctx.provide(TRANSCRIPT_SERVICE, service)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`${name}: providing ${TRANSCRIPT_SERVICE} failed; GLM compaction summaries carry no transcript path: ${message}`)
    health.reactivate('inactive', `会话导出服务未提供：${message}`)
  }
  return () => {
    withdraw()
    health.dispose()
  }
}
