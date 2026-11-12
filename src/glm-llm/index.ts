/**
 * dsh-glm-llm — channel row: registers the native ZCode client adapter for
 * its provider route on the DSH LLM seam. The adapter resolves the
 * credential from the encrypted store (filled by
 * /glm-login), signs like the desktop client, and speaks Anthropic Messages
 * to the ZCode backend. The credential directory defaults to the user-level
 * directory `<DSH home>/glm-hourness` (docs/DESIGN.md §2.4); a missing
 * credential fails the stream with the re-login instruction. A spent quota
 * or a refused login the stream meets also goes to the metrics journal of
 * the request's session when the orchestration package's metrics row is on
 * (src/glm-llm/metrics.ts).
 */
import { ZcodeAdapter } from './zcode.ts'
import { facePolicyRegistry } from './face-wire.ts'
import { credentialHome } from '../shared/data-home.ts'
import { homeField, planField } from './config-fields.ts'
import { asAttachments } from './images.ts'
import { glmMetricSink } from './metrics.ts'
import { GLM_CONTEXT_WINDOW } from './models.ts'
import Schema from '../shared/schemastery.ts'
import { provideRowHealth } from '../shared/health.ts'
import { FACES_SERVICE, facePolicyOf } from '../shared/face-policy.ts'
import type { AdapterRegistry, AgentsService, FsPathService, ProvideHost, ServiceLookup } from '../shared/dsh-min.ts'
import type { SessionHeaderLike } from './headers.ts'
import type { AttachmentsLike } from '../shared/lm-min.ts'

/** The `llm` service as this row uses it. */
export type LlmContextLike = AdapterRegistry<ZcodeAdapter>

/** The seam lives on the llm service (`ctx.llm`); the flat form covers test doubles. */
export type AdapterRegistrar = (providers: readonly string[], adapter: ZcodeAdapter) => () => void

/** Resolve `registerAdapter` from a live cordis context or a flat double. */
export function registrarOf(ctx: LlmContextLike | { llm?: LlmContextLike }): AdapterRegistrar {
  const llm = (ctx as { llm?: LlmContextLike }).llm
  if (llm !== undefined && typeof llm.registerAdapter === 'function') return (providers, adapter) => llm.registerAdapter(providers, adapter)
  return (providers, adapter) => (ctx as LlmContextLike).registerAdapter(providers, adapter)
}

export interface GlmConfig {
  /** The credential directory (credentials.json); default the user-level directory `<DSH home>/glm-hourness` (docs/DESIGN.md §2.4). */
  readonly home?: string
  /** Plan tier: coding-plan (default, 150% bonus) or start-plan (gateway prompt). */
  readonly plan?: 'coding-plan' | 'start-plan'
  /** Registered provider route id; defaults to `glm-zcode` to avoid the pi-ai `glm` route. */
  readonly provider?: string
  /** The context window declared to DSH, as written: anything but an integer in GLM_CONTEXT_WINDOW's range falls back to the default (docs/DESIGN.md §4.6). */
  readonly contextWindow?: unknown
}

const { default: WINDOW_DEFAULT, min: WINDOW_MIN, max: WINDOW_MAX } = GLM_CONTEXT_WINDOW

/** Runtime Config schema: the channel knobs as real switches in the DSH plugin manager. */
export const Config = Schema.object({
  home: homeField,
  plan: planField,
  provider: Schema.string().default('glm-zcode').description('Provider route id registered on the LLM seam.'),
  // The `any` member lets a value outside the range through the Loader's
  // validation, so the row falls back to the default and says so in its
  // health; the integer field alone would make the Loader refuse the whole
  // channel row (AGENTS.md: activation degrades, never fails).
  contextWindow: Schema.union([Schema.natural().min(WINDOW_MIN).max(WINDOW_MAX), Schema.any()]).default(WINDOW_DEFAULT).description(`Context window in tokens: declared to DSH (its compaction and budgets) and used for each step's output budget, which takes the smaller of this and the ZCode catalog's ${WINDOW_MAX}. An integer from ${WINDOW_MIN} to ${WINDOW_MAX}; default ${WINDOW_DEFAULT}. Any other value falls back to the default and the row health says so.`),
})

/** cordis plugin identity. */
export const name = 'dsh-glm-hourness/glm-llm'

/** cordis plugin entry: register the adapter; activation never throws. */
export function apply(ctx: (LlmContextLike | { llm?: LlmContextLike }) & ServiceLookup & Partial<ProvideHost>, config: GlmConfig = {}): (() => void) | void {
  const home = credentialHome(config.home)
  const provider = config.provider ?? 'glm-zcode'
  const plan = config.plan ?? 'coding-plan'
  const window = contextWindowOf(config.contextWindow)
  if (window.refused !== undefined) console.warn(`dsh-glm-hourness/glm-llm: ${window.refused}`)
  // The face-policy registry (face-migration design 0.1 §4.1): the service the
  // orchestration rows register their wire-face sources in. A context that
  // cannot take it leaves the role layer out — the adapters still send the
  // dialect face — and the row health says so.
  const faces = facePolicyRegistry()
  const provided = provideFaces(ctx, faces)
  const activation = `已注册路由 ${provider}（套餐 ${plan}，凭证目录 ${home}，上下文窗口 ${window.value}）`
  const refused = window.refused === undefined ? provided.failure : provided.failure === undefined ? window.refused : `${window.refused}；${provided.failure}`
  const health = provideRowHealth(ctx, 'glm-llm', refused === undefined ? 'active' : 'degraded', `${activation}${refused === undefined ? '' : `；${refused}`}`)
  const unregister = registrarOf(ctx)([provider], new ZcodeAdapter({
    home,
    ...(config.plan === undefined ? {} : { plan: config.plan }),
    contextWindow: window.value,
    ...imageServices(ctx),
    sessionHeader: sessionHeaders(ctx),
    facePolicy: () => facePolicyOf(ctx),
    // A session's report replaces the activation text, so a refused window rides on each report and keeps an answered request partly in effect.
    report: (sessionId, state, reason) => refused === undefined
      ? health.report(sessionId, state, reason)
      : health.report(sessionId, state === 'active' ? 'degraded' : state, `${reason}；${refused}`),
    metric: glmMetricSink(ctx),
  }))
  return () => {
    unregister()
    provided.withdraw?.()
    health.dispose()
  }
}

/**
 * The configured context window: an integer in GLM_CONTEXT_WINDOW's range,
 * the default when absent, else the default with the words for the row
 * health. Never throws: the shown value is cut, and only a number or a
 * string is written out.
 */
function contextWindowOf(value: unknown): { readonly value: number, readonly refused?: string } {
  if (value === undefined || value === null) return { value: WINDOW_DEFAULT }
  if (typeof value === 'number' && Number.isInteger(value) && value >= WINDOW_MIN && value <= WINDOW_MAX) return { value }
  const shown = typeof value === 'number' ? String(value) : typeof value === 'string' ? JSON.stringify(value.slice(0, 40)) : typeof value
  return { value: WINDOW_DEFAULT, refused: `上下文窗口配置 ${shown} 不是 ${WINDOW_MIN} 到 ${WINDOW_MAX} 之间的整数，按缺省 ${WINDOW_DEFAULT}` }
}

/**
 * The header of a live session through the `agents` service (rc.3
 * dsh-agent `get`, agent:596), read lazily per request like the image
 * services: the request attribution tells a delegated child by its
 * `origin` and follows `parentSession` to its parent's trace. Without the
 * service every session reads as a main session.
 */
export function sessionHeaders(ctx: ServiceLookup): (sessionId: string) => SessionHeaderLike | undefined {
  return sessionId => {
    const agents = (typeof ctx.get === 'function' ? ctx.get('agents') : undefined) as Partial<AgentsService> | undefined
    return typeof agents?.get === 'function' ? agents.get(sessionId)?.session.header : undefined
  }
}

/**
 * The adapter's per-request access to the attachment service and the `fs`
 * path mapping, read lazily through cordis `ctx.get`, the way the rc.3 pi-ai
 * adapter reads them without injecting them: the channel works without
 * either and needs them only for images.
 */
export function imageServices(ctx: ServiceLookup): { resolveAttachments: () => AttachmentsLike | undefined, mapHostPath: (hostPath: string) => string | undefined } {
  const lookup = (name: string): unknown => typeof ctx.get === 'function' ? ctx.get(name) : undefined
  return {
    resolveAttachments: () => asAttachments(lookup('attachments')),
    mapHostPath: hostPath => (lookup('fs') as Partial<FsPathService> | undefined)?.processPathFromHostPath?.(hostPath),
  }
}

const FACES_FAILURE = '面注册表服务未提供：角色面的改写不生效，工具面只有方言层'

/** Provide the face-policy registry; its disposer, or (warned) why the context could not take it. */
function provideFaces(ctx: Partial<ProvideHost>, registry: ReturnType<typeof facePolicyRegistry>): { readonly withdraw?: () => void, readonly failure?: string } {
  try {
    if (typeof ctx.provide !== 'function') throw new Error('the context has no provide')
    return { withdraw: ctx.provide(FACES_SERVICE, registry) }
  }
  catch (error) {
    const failure = error instanceof Error ? error.message : String(error)
    console.warn(`dsh-glm-hourness/glm-llm: ${FACES_SERVICE} not provided; ${FACES_FAILURE}: ${failure}`)
    return { failure: `${FACES_FAILURE}（${failure}）` }
  }
}
