/**
 * dsh-glm-llm — channel row: registers the native ZCode client adapter for
 * its provider route on the DSH LLM seam. The adapter resolves the
 * credential from the encrypted store (filled by
 * /glm-login), signs like the desktop client, and speaks Anthropic Messages
 * to the ZCode backend. The credential directory defaults to the user-level
 * directory `<DSH home>/glm-hourness` (docs/DESIGN.md §2.4); a missing
 * credential fails the stream with the re-login instruction.
 */
import { ZcodeAdapter } from './zcode.ts'
import { credentialHome } from '../shared/data-home.ts'
import { homeField, planField } from './config-fields.ts'
import { asAttachments } from './images.ts'
import Schema from '../shared/schemastery.ts'
import { provideRowHealth } from '../shared/health.ts'
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
}

/** Runtime Config schema: the channel knobs as real switches in the DSH plugin manager. */
export const Config = Schema.object({
  home: homeField,
  plan: planField,
  provider: Schema.string().default('glm-zcode').description('Provider route id registered on the LLM seam.'),
})

/** cordis plugin identity. */
export const name = 'dsh-glm-hourness/glm-llm'

/** cordis plugin entry: register the adapter; activation never throws. */
export function apply(ctx: (LlmContextLike | { llm?: LlmContextLike }) & ServiceLookup & Partial<ProvideHost>, config: GlmConfig = {}): (() => void) | void {
  const home = credentialHome(config.home)
  const provider = config.provider ?? 'glm-zcode'
  const plan = config.plan ?? 'coding-plan'
  const health = provideRowHealth(ctx, 'glm-llm', 'active', `已注册路由 ${provider}（套餐 ${plan}，凭证目录 ${home}）`)
  const unregister = registrarOf(ctx)([provider], new ZcodeAdapter({
    home,
    ...(config.plan === undefined ? {} : { plan: config.plan }),
    ...imageServices(ctx),
    sessionHeader: sessionHeaders(ctx),
    report: (sessionId, state, reason) => health.report(sessionId, state, reason),
  }))
  return () => {
    unregister()
    health.dispose()
  }
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
