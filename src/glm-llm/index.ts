/**
 * dsh-glm-llm — channel row: registers the native ZCode client adapter for
 * its provider route on the DSH LLM seam. The adapter resolves the
 * credential from the encrypted store (filled by
 * /glm-login), signs like the desktop client, and speaks Anthropic Messages
 * to the ZCode backend. A missing home degrades to a no-op; a missing
 * credential fails the stream with the re-login instruction.
 */
import { ZcodeAdapter } from './zcode.ts'
import { asAttachments, type AttachmentsLike } from './images.ts'
import Schema from '../shared/schemastery.ts'

export interface LlmContextLike {
  registerAdapter(providers: readonly string[], adapter: ZcodeAdapter): () => void
}

/**
 * Optional services read lazily per request through cordis `ctx.get`, the
 * way the rc.3 pi-ai adapter reads `attachments` and `fs` without injecting
 * them: the channel works without either and needs them only for images.
 */
interface ServiceLookup {
  get?(name: string): unknown
}

/** The `fs` service member that maps a host path into the tool execution world. */
interface FsPathMapper {
  processPathFromHostPath?(hostPath: string): string | undefined
}

/** The seam lives on the llm service (`ctx.llm`); the flat form covers test doubles. */
export type AdapterRegistrar = (providers: readonly string[], adapter: ZcodeAdapter) => () => void

/** Resolve `registerAdapter` from a live cordis context or a flat double. */
export function registrarOf(ctx: LlmContextLike | { llm?: LlmContextLike }): AdapterRegistrar {
  const llm = (ctx as { llm?: LlmContextLike }).llm
  if (llm !== undefined && typeof llm.registerAdapter === 'function') return (providers, adapter) => llm.registerAdapter(providers, adapter)
  return (providers, adapter) => (ctx as LlmContextLike).registerAdapter(providers, adapter)
}

export interface GlmConfig {
  /** The agent home directory (`.llm`): credentials.json + device-mid.txt. */
  readonly home?: string
  /** Plan tier: coding-plan (default, 150% bonus) or start-plan (gateway prompt). */
  readonly plan?: 'coding-plan' | 'start-plan'
  /** Registered provider route id; defaults to `glm-zcode` to avoid the pi-ai `glm` route. */
  readonly provider?: string
}

/** Runtime Config schema: the channel knobs as real switches in the DSH plugin manager. */
export const Config = Schema.object({
  home: Schema.string().required().description('Agent home directory (.llm): the encrypted credential store and deviceMid live here.'),
  plan: Schema.union([Schema.const('coding-plan'), Schema.const('start-plan')]).default('coding-plan').description('Plan tier: coding-plan (default, usage bonus) or start-plan (gateway 3-block prompt, JWT auth).'),
  provider: Schema.string().default('glm-zcode').description('Provider route id registered on the LLM seam.'),
})

/** cordis plugin identity. */
export const name = 'dsh-glm-hourness/glm-llm'

/** cordis plugin entry: register the adapter; activation never throws. */
export function apply(ctx: (LlmContextLike | { llm?: LlmContextLike }) & ServiceLookup, config: GlmConfig = {}): (() => void) | void {
  if (config.home === undefined || config.home.length === 0) {
    console.warn('dsh-glm-hourness/glm-llm: home is not configured; the native channel stays off (set config.home, then run /glm-login)')
    return () => {}
  }
  const provider = config.provider ?? 'glm-zcode'
  return registrarOf(ctx)([provider], new ZcodeAdapter({
    home: config.home,
    ...(config.plan === undefined ? {} : { plan: config.plan }),
    ...imageServices(ctx),
  }))
}

/** The adapter's per-request access to the attachment service and the `fs` path mapping. */
export function imageServices(ctx: ServiceLookup): { resolveAttachments: () => AttachmentsLike | undefined, mapHostPath: (hostPath: string) => string | undefined } {
  const lookup = (name: string): unknown => typeof ctx.get === 'function' ? ctx.get(name) : undefined
  return {
    resolveAttachments: () => asAttachments(lookup('attachments')),
    mapHostPath: hostPath => (lookup('fs') as FsPathMapper | undefined)?.processPathFromHostPath?.(hostPath),
  }
}
