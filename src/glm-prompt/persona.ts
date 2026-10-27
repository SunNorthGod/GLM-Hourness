/**
 * Persona slider: three reporting levels (简洁 / 适中 / 详细) the model chooses
 * per reply from task weight, mirroring the user-owned vocabulary. The slider
 * value lives in project config; the dialect injects the guidance section so
 * only glm sessions see it.
 */

export const PERSONA_LEVELS = [
  { id: 'concise', label: '简洁', hint: '结论与影响，一两句；岔路只在真有分叉时提。' },
  { id: 'balanced', label: '适中', hint: '结论、影响、关键理由；岔路选项+建议。' },
  { id: 'detailed', label: '详细', hint: '完整论证链：结论、证据层级、影响、岔路对比、风险。' },
] as const

export type PersonaLevel = (typeof PERSONA_LEVELS)[number]['id']

/** Default selection guidance the model follows when choosing per reply. */
export const PERSONA_SECTION_NAME = 'glm:persona'

export function personaSection(preferred: PersonaLevel = 'balanced'): { name: string, order: number, text: string } {
  const levels = PERSONA_LEVELS.map(level => `- ${level.label}（${level.id}）：${level.hint}`).join('\n')
  const preferredLabel = PERSONA_LEVELS.find(level => level.id === preferred)!.label
  return {
    name: PERSONA_SECTION_NAME,
    order: 2360,
    text: [
      '# Reporting Depth',
      'For each user-facing reply, choose one reporting depth yourself from the task weight; do not ask the user which to use.',
      levels,
      `The user's standing preference is ${preferredLabel}（${preferred}）— start there and adjust per task: routine progress one notch terser, decision requests one notch fuller.`,
    ].join('\n'),
  }
}

export function isPersonaLevel(value: unknown): value is PersonaLevel {
  return typeof value === 'string' && PERSONA_LEVELS.some(level => level.id === value)
}
