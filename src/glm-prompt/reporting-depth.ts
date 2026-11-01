/**
 * Reporting depth: three levels (简洁 / 适中 / 详细) the model chooses per
 * reply from task weight, mirroring the user-owned vocabulary. The standing
 * preference lives in the row config `reportingDepth`; the dialect injects
 * the guidance section so only glm sessions see it. This is not the person's
 * persona (how the main agent talks, src/design/persona.ts): the config key
 * was called `persona` until the persona setting arrived, and the old key is
 * still read (readReportingDepth).
 */

export const REPORTING_DEPTHS = [
  { id: 'concise', label: '简洁', hint: '结论与影响，一两句；岔路只在真有分叉时提。' },
  { id: 'balanced', label: '适中', hint: '结论、影响、关键理由；岔路选项+建议。' },
  { id: 'detailed', label: '详细', hint: '完整论证链：结论、证据层级、影响、岔路对比、风险。' },
] as const

export type ReportingDepth = (typeof REPORTING_DEPTHS)[number]['id']

/** Default selection guidance the model follows when choosing per reply. */
export const REPORTING_DEPTH_SECTION = 'glm:reporting-depth'

export function reportingDepthSection(preferred: ReportingDepth = 'balanced'): { name: string, order: number, text: string } {
  const levels = REPORTING_DEPTHS.map(level => `- ${level.label}（${level.id}）：${level.hint}`).join('\n')
  const preferredLabel = REPORTING_DEPTHS.find(level => level.id === preferred)!.label
  return {
    name: REPORTING_DEPTH_SECTION,
    order: 2360,
    text: [
      '# Reporting Depth',
      'For each user-facing reply, choose one reporting depth yourself from the task weight; do not ask the user which to use.',
      levels,
      `The user's standing preference is ${preferredLabel}（${preferred}）— start there and adjust per task: routine progress one notch terser, decision requests one notch fuller.`,
    ].join('\n'),
  }
}

export function isReportingDepth(value: unknown): value is ReportingDepth {
  return typeof value === 'string' && REPORTING_DEPTHS.some(level => level.id === value)
}

/** The depth a row config comes to, and what to say about the keys it was written with. */
export interface DepthReading {
  readonly depth: ReportingDepth
  /** For the row health; undefined when the keys need no remark. */
  readonly note: string | undefined
  /** Whether `note` is also logged (once, at activation): the old key decided or the two keys disagree. */
  readonly warn: boolean
}

/**
 * `reportingDepth` wins over the old key `persona`, which wins over
 * `balanced`. Neither key has a schema default, so the keys present are the
 * keys the person wrote (docs/ORCHESTRATION.md §3.1). The old key alone
 * works and is told once; two keys that disagree are told once; two that
 * agree are only noted in the row health, as there is nothing to fix but a
 * line to delete.
 */
export function readReportingDepth(config: { readonly reportingDepth?: unknown, readonly persona?: unknown }): DepthReading {
  const current = isReportingDepth(config.reportingDepth) ? config.reportingDepth : undefined
  const old = isReportingDepth(config.persona) ? config.persona : undefined
  if (current === undefined) {
    return { depth: old ?? 'balanced', note: old === undefined ? undefined : 'glm-prompt 的 persona 已改名为 reportingDepth，这次按旧键生效', warn: old !== undefined }
  }
  if (old === undefined) return { depth: current, note: undefined, warn: false }
  return old === current
    ? { depth: current, note: '旧键 persona 可以删掉', warn: false }
    : { depth: current, note: 'persona 与 reportingDepth 不同，按 reportingDepth', warn: true }
}
