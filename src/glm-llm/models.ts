/**
 * The native channel's model catalog. GLM models: thinking efforts
 * low/high/max per the ZCode training distribution (GLM-5.3 folds "off" into
 * low), default max_tokens 32000.
 */

/** GLM thinking efforts in the ZCode distribution: low / high / max. */
export const GLM_REASONING_EFFORTS = [
  { id: 'low', name: 'Low', description: 'Routine or latency-sensitive tasks; also the floor when thinking cannot be disabled.' },
  { id: 'high', name: 'High', description: 'The default balance for most tasks.' },
  { id: 'max', name: 'Max', description: 'Reserve for the hardest quality-first tasks.' },
] as const

/** ZCode default output cap. */
export const GLM_DEFAULT_MAX_TOKENS = 32000

/**
 * The channel's model catalog with truthful input modalities: GLM-5.3 has no
 * vision tower and is text-only; GLM-5.3-Flash is multimodal (user,
 * 2026-10-28). A text-only route makes DSH project request images to text
 * before the adapter (dsh-llm `projectImagesForTextModel`) and makes
 * `read_image` refuse (dsh-tool-fs `assertImageCapableRoute`).
 */
export const GLM_MODELS = [
  { id: 'glm-5.3', name: 'GLM-5.3', inputModalities: ['text'] },
  { id: 'glm-5.3-flash', name: 'GLM-5.3-Flash', inputModalities: ['text', 'image'] },
] as const

/** Declared input modalities of one model id; ids outside the catalog are text-only. */
export function glmInputModalities(model: string): ReadonlyArray<'text' | 'image'> {
  return GLM_MODELS.find(entry => entry.id === model)?.inputModalities ?? ['text']
}
