/**
 * The model a dispatch runs on (M7 design 0.6 §3.1.3, §6.4). The main agent
 * names the model and gives the reason on every dispatch; the harness picks
 * no default and ranks no model. What it does: check the arguments' shape,
 * check the model against the provider's catalog, and build `agentOptions`.
 * Pure functions here; reading the catalog (`llm.listModels`) and a model's
 * effort levels (`llm.resolveModelInfo`) is the caller's job, and a
 * provider that is not registered makes that read throw, which the caller
 * reports as `unknown_provider`.
 */

export const MODEL_LIMITS = { model: 200, why: 300, effort: 40, provider: 200, hint: 10 } as const

/** What the main agent chose: the provider is already resolved (the argument, or the main agent's own route). */
export interface ModelChoice {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

/** One entry of a provider's catalog (`llm.listModels`). */
export interface CatalogEntry {
  readonly id: string
  readonly name?: string
}

/** The dispatch arguments about the model, after checking their shape. */
export interface ModelArgs {
  readonly model: string
  /** Single line, 1–300 characters. */
  readonly why: string
  readonly provider?: string
  readonly reasoningEffort?: string
}

export type ModelArgsResult =
  | { readonly ok: true, readonly args: ModelArgs }
  | { readonly ok: false, readonly message: string }

/** Whitespace runs become one space: reasons are single lines. */
export function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function optionalText(raw: Record<string, unknown>, key: string): string | undefined | null {
  const value = raw[key]
  if (value === undefined) return undefined
  return typeof value === 'string' ? value : null
}

/**
 * `model`, `why`, `provider` and `reasoningEffort` of a `dispatch_task`
 * call (§6.4). `model` is 1–200 characters without whitespace, `why` 1–300
 * characters once its whitespace is collapsed, `provider` and
 * `reasoningEffort` are optional non-empty strings of at most 200 and 40.
 */
export function parseModelArgs(raw: Record<string, unknown>): ModelArgsResult {
  const model = optionalText(raw, 'model')
  if (model === undefined || model === null || model.length === 0 || model.length > MODEL_LIMITS.model || /\s/.test(model)) {
    return { ok: false, message: `model is required: 1-${MODEL_LIMITS.model} characters, no whitespace` }
  }
  const whyText = optionalText(raw, 'why')
  const why = typeof whyText === 'string' ? oneLine(whyText) : ''
  if (why.length === 0 || why.length > MODEL_LIMITS.why) {
    return { ok: false, message: `why is required: one line of 1-${MODEL_LIMITS.why} characters saying why this model` }
  }
  const provider = optionalText(raw, 'provider')
  if (provider === null || provider?.length === 0 || (provider?.length ?? 0) > MODEL_LIMITS.provider) {
    return { ok: false, message: `provider, when given, is a registered provider id of 1-${MODEL_LIMITS.provider} characters` }
  }
  const effort = optionalText(raw, 'reasoningEffort')
  if (effort === null || effort?.length === 0 || (effort?.length ?? 0) > MODEL_LIMITS.effort) {
    return { ok: false, message: `reasoningEffort, when given, is 1-${MODEL_LIMITS.effort} characters` }
  }
  return { ok: true, args: { model, why, ...(provider === undefined ? {} : { provider }), ...(effort === undefined ? {} : { reasoningEffort: effort }) } }
}

/** The first model ids of a catalog, for a hint; says so when the catalog could not be read or is empty. */
export function catalogHint(catalog: readonly CatalogEntry[] | undefined): string {
  if (catalog === undefined || catalog.length === 0) return 'The model catalog could not be read, so no model ids can be listed.'
  const ids = catalog.slice(0, MODEL_LIMITS.hint).map(entry => entry.id)
  return `Models on this provider: ${ids.join(', ')}${catalog.length > ids.length ? ', …' : ''}`
}

export type ModelCheck =
  | { readonly ok: true, readonly note?: string }
  | { readonly ok: false, readonly code: 'unknown_model' | 'invalid', readonly message: string, readonly hint: string }

/** The note a dispatch comment carries when the catalog could not vouch for the model. */
export const CATALOG_UNCHECKED_NOTE = '模型目录读不到，没有核对'

/**
 * The catalog check (§3.1.3). A non-empty catalog that lacks the model is
 * `unknown_model`; a catalog that could not be read (`undefined`) or is empty
 * lets the model through with a note, because the runtime does not bind the
 * catalog to routing (llm:2080–2083) and an unreadable list must not block a
 * model that works. `efforts` are the reasoning levels of the chosen model
 * when they could be read: given, they must contain `reasoningEffort`.
 */
export function checkModelChoice(choice: ModelChoice, catalog: readonly CatalogEntry[] | undefined, efforts: readonly string[] | undefined): ModelCheck {
  const listed = catalog !== undefined && catalog.length > 0
  if (listed && !catalog.some(entry => entry.id === choice.model)) {
    return { ok: false, code: 'unknown_model', message: `model "${choice.model}" is not in the catalog of provider "${choice.provider}"`, hint: catalogHint(catalog) }
  }
  if (choice.reasoningEffort !== undefined && efforts !== undefined && !efforts.includes(choice.reasoningEffort)) {
    const levels = efforts.length === 0 ? 'no reasoning effort levels' : `these reasoning effort levels: ${efforts.join(', ')}`
    return { ok: false, code: 'invalid', message: `reasoningEffort "${choice.reasoningEffort}" is not one the model supports`, hint: `Model "${choice.model}" has ${levels}.` }
  }
  return listed ? { ok: true } : { ok: true, note: CATALOG_UNCHECKED_NOTE }
}

/** `agentOptions` of the spawned agent: DSH merges them over the parent's route (subagent:315–329). */
export function agentOptionsOf(choice: ModelChoice): { readonly provider: string, readonly model: string, readonly reasoningEffort?: string } {
  return { provider: choice.provider, model: choice.model, ...(choice.reasoningEffort === undefined ? {} : { reasoningEffort: choice.reasoningEffort }) }
}
