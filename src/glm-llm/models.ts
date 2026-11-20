/**
 * The native channel's model catalog. GLM models: thinking efforts
 * low/high/max per the ZCode training distribution (GLM-5.3 folds "off" into
 * low), default max_tokens 32000.
 */
import { OFFICIAL_GLM_MODEL_IDS } from './zcode-wire.ts'

/** GLM thinking efforts in the ZCode distribution: low / high / max. */
export const GLM_REASONING_EFFORTS = [
  { id: 'low', name: 'Low', description: 'Routine or latency-sensitive tasks; also the floor when thinking cannot be disabled.' },
  { id: 'high', name: 'High', description: 'The default balance for most tasks.' },
  { id: 'max', name: 'Max', description: 'Reserve for the hardest quality-first tasks.' },
] as const

/** The output cap the channel declares to DSH (DSH's own budget input; the coding-plan wire value follows ZCodeModelRule). */
export const GLM_DEFAULT_MAX_TOKENS = 32000

export interface GlmModelEntry {
  readonly id: string
  readonly name: string
  readonly inputModalities: readonly ('text' | 'image')[]
}

/**
 * Shared GLM model catalog: both Coding Plan and Start Plan expose GLM-5.3
 * (text-only) and GLM-5.3-Flash (multimodal).
 */
export const GLM_MODELS: readonly GlmModelEntry[] = [
  { id: 'glm-5.3', name: 'GLM-5.3', inputModalities: ['text'] },
  { id: 'glm-5.3-flash', name: 'GLM-5.3-Flash', inputModalities: ['text', 'image'] },
]

/** Declared input modalities of one model id; ids outside the catalog are text-only. */
export function glmInputModalities(model: string): ReadonlyArray<'text' | 'image'> {
  const lower = model.toLowerCase()
  return GLM_MODELS.find(entry => entry.id === lower)?.inputModalities ?? ['text']
}

/** What the ZCode built-in catalog says about one model, as far as the request needs it. */
export interface ZcodeModelRule {
  /** `properties.contextWindow`. */
  readonly contextWindow: number
  /** `optionSpecs.maxOutputTokens.max`. */
  readonly maxOutputTokens: number
  /** `optionSpecs.reasoningLevel.values`; the first is the auxiliary level (3.16.3 `PP`). */
  readonly reasoningLevels: readonly string[]
  /** The anthropic-messages option map for one reasoning level (`modelApiRules[].optionSpecs.reasoningLevel.map`). */
  optionPatch(reasoningLevel: string): Readonly<Record<string, unknown>>
}

/**
 * The GLM-5.3 family as the ZCode built-in catalog configures it
 * (ZCode `zcode-builtin.json`: model rule `.*glm-5\.3.*`).
 */
const GLM_53_RULE: ZcodeModelRule = {
  contextWindow: 1_000_000,
  maxOutputTokens: 128_000,
  reasoningLevels: ['low', 'high', 'max'],
  optionPatch: reasoningLevel => ({ thinking: { type: 'enabled' }, output_config: { effort: reasoningLevel } }),
}
const GLM_53_MATCH = /^.*glm-5\.3.*$/iu

/**
 * The context window the channel declares to DSH, from the glm-llm row's
 * config `contextWindow` (docs/DESIGN.md §4.6): default 512000 (the person,
 * 2026-11-05), at least the catalog's output maximum of one step and at most
 * the catalog's window. A step's output budget takes the smaller of this
 * window and the catalog's.
 */
export const GLM_CONTEXT_WINDOW = { default: 512_000, min: GLM_53_RULE.maxOutputTokens, max: GLM_53_RULE.contextWindow } as const

/** The catalog rule of one model id; undefined outside the matched GLM-5.3 family (the request then keeps the DSH values). */
export function zcodeModelRule(model: string): ZcodeModelRule | undefined {
  return GLM_53_MATCH.test(model) ? GLM_53_RULE : undefined
}

const OFFICIAL_IDS = new Map(OFFICIAL_GLM_MODEL_IDS.map(id => [id.toLowerCase(), id]))

/** The model id on the wire: the official casing of a known GLM id (3.16.3 `normalizeOfficialGlmModelId` `GZt` @526265), else unchanged. */
export function zcodeWireModelId(model: string): string {
  return OFFICIAL_IDS.get(model.toLowerCase()) ?? model
}
