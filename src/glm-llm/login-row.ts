/**
 * dsh-glm-login — the channel's human commands. `/glm-login` starts the
 * server-mediated ZCode OAuth flow and replies with the authorize URL; the
 * poll completes in the background and the resolved coding-plan credential
 * lands in the encrypted store. `/glm-status` reports whether a credential is
 * present (key preview, JWT age on start-plan), then the peak line and the
 * quota section (src/glm-llm/quota.ts), then the row health table of the
 * invoking session (src/shared/health.ts). The credential directory is the
 * channel row's: `home`, else `<DSH home>/glm-hourness`.
 *
 * The row also provides the pricing service (src/shared/pricing.ts): the
 * GLM credit plan the orchestration package's usage panel prices calls
 * with, the quota reader (`quota`) and the channel's default loop-board
 * entries (`loopDefaults`). It is the plan's human entry and enabled by
 * default, and it does not depend on the route, the channel row or the
 * dialect. Its `plan` is the plan the quota section and the credential line
 * speak of; it must equal the glm-llm row's `plan`, which the rows cannot
 * check between them, so the credential line names the plan this row uses.
 */
import { ZcodeLogin, ZcodeAdapter, logout } from './zcode.ts'
import { homeField, planField } from './config-fields.ts'
import { creditPricing } from './credits.ts'
import { GLM_LOOP_DEFAULTS } from './loop-defaults.ts'
import { createQuotaReader, quotaHealthText } from './quota.ts'
import { QuotaJournal } from './quota-journal.ts'
import { credentialHome } from '../shared/data-home.ts'
import { collectHealth, provideRowHealth, renderHealthTable, sessionIdOf, type HealthState } from '../shared/health.ts'
import { PRICING_SERVICE, type UsagePricing } from '../shared/pricing.ts'
import { peakLine, quotaLines, type MomentZone, type QuotaRequest, type QuotaView } from '../shared/quota.ts'
import Schema from '../shared/schemastery.ts'
import type { CommandDefinitionLike, CommandInvocationLike, CommandsHost, ProvideHost, ServiceLookup } from '../shared/dsh-min.ts'

export interface LoginConfig {
  /** The credential directory (credentials.json); default `<DSH home>/glm-hourness`, as the channel row. */
  readonly home?: string
  /** Plan tier, as the glm-llm row's: coding-plan (default) or start-plan (no quota is read). Must equal the glm-llm row's. */
  readonly plan?: 'coding-plan' | 'start-plan'
  /** Injected transport for tests. */
  readonly fetchImpl?: typeof fetch
  /** Injected clock for tests, epoch milliseconds. */
  readonly now?: () => number
  /** The display zone of the moments in the status text, minutes east of UTC; tests set it, the host's offset otherwise. */
  readonly offsetMinutes?: number
}

/** Runtime Config schema: the row's knobs as real switches in the DSH plugin manager. */
export const Config = Schema.object({ home: homeField, plan: planField })

/** cordis plugin identity: needs the commands service. */
export const name = 'dsh-glm-hourness/glm-login'
export const inject = ['commands']

/** How long a status command waits for the quota read it starts or joins. */
const STATUS_WAIT_MS = 3000

/** The row health table for the session the command runs in. */
function healthText(ctx: ServiceLookup, invocation: CommandInvocationLike): string {
  const sessionId = sessionIdOf(invocation.agent)
  return renderHealthTable(collectHealth(ctx, sessionId), sessionId)
}

/** Provide the pricing service: its disposer, or (warned) why the context could not take it. */
function providePricing(ctx: Partial<ProvideHost>, service: UsagePricing): { readonly withdraw?: () => void, readonly failure?: string } {
  try {
    if (typeof ctx.provide !== 'function') throw new Error('the context has no provide')
    return { withdraw: ctx.provide(PRICING_SERVICE, service) }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`dsh-glm-hourness/glm-login: ${PRICING_SERVICE} not provided; the usage panel lists calls and tokens only: ${message}`)
    return { failure: message }
  }
}

/** cordis plugin entry: registers /glm-login, /glm-status, and /glm-logout; provides the pricing service. */
export function apply(ctx: CommandsHost & ServiceLookup & Partial<ProvideHost>, config: LoginConfig = {}): () => void {
  const home = credentialHome(config.home)
  const now = config.now ?? Date.now
  const zone: MomentZone = config.offsetMinutes === undefined ? {} : { offsetMinutes: config.offsetMinutes }
  const transport = config.fetchImpl === undefined ? {} : { fetchImpl: config.fetchImpl }
  const journal = new QuotaJournal({ home })
  const login = new ZcodeLogin({ home, ...transport })
  const adapter = new ZcodeAdapter({ home, journal, ...(config.plan === undefined ? {} : { plan: config.plan }), ...(config.now === undefined ? {} : { now: config.now }), ...transport })
  const reader = createQuotaReader({ adapter, journal, now, zone, ...transport })
  const commands = '/glm-login、/glm-status、/glm-logout 已注册'
  const quota = async (request?: QuotaRequest): Promise<QuotaView> => {
    const view = await reader.view(request)
    noteQuotaHealth()
    return view
  }
  const pricing = providePricing(ctx, Object.freeze({ ...creditPricing, quota, loopDefaults: GLM_LOOP_DEFAULTS }))
  const base: { readonly state: HealthState, readonly reason: string } = pricing.withdraw !== undefined
    ? { state: 'active', reason: commands }
    : { state: 'degraded', reason: `${commands}；积分口径未提供：${pricing.failure ?? ''}` }
  const health = provideRowHealth(ctx, 'glm-login', base.state, base.reason)
  /** The quota note after the row's own words; the quota never lowers the row's state, it is data for people. */
  function noteQuotaHealth(): void {
    const note = quotaHealthText(reader.health(), now(), zone)
    health.reactivate(base.state, note === '' ? base.reason : `${base.reason}；${note}`)
  }
  const credentialText = async (): Promise<string> => {
    const status = await adapter.status()
    if (!status.logged) {
      return `glm-zcode：未登录（套餐 ${status.plan}${status.incomplete === undefined ? '' : `，登录不完整：${status.incomplete}`}）。运行 /glm-login 开始登录${login.state.error === undefined ? '' : `\n上次登录错误：${login.state.error}`}`
    }
    return `glm-zcode：已登录（套餐 ${status.plan}，Key ${status.keyPreview}${status.userId === undefined ? '' : `，账号 ${status.userId}`}${status.jwtAgeHours === undefined ? '' : `，JWT 已用 ${status.jwtAgeHours} 小时`}）`
  }
  /** The peak line and the quota lines, the section between the credential line and the health table. */
  const quotaSection = async (): Promise<string> => {
    const view = await quota({ waitMs: STATUS_WAIT_MS })
    const at = now()
    return [peakLine(creditPricing.plan, atMs => creditPricing.peak(atMs), at, zone), ...quotaLines(view, at, zone)].join('\n')
  }
  const disposers = [
    ctx.commands.register({
      definitionId: 'dsh-glm-hourness/glm-login',
      name: 'glm-login',
      description: '通过浏览器 OAuth 登录原生 ZCode 通道',
      handler: async () => {
        try {
          const url = await login.start()
          return { kind: 'success', text: `请在浏览器中打开以下链接并完成授权（5 分钟内有效）：\n${url}\n授权完成后运行 /glm-status 确认状态。` }
        }
        catch (error) {
          return { kind: 'error', text: `登录失败：${(error as Error).message}` }
        }
      },
    }),
    ctx.commands.register(statusCommand(async invocation => {
      const credential = await credentialText()
      const section = await quotaSection()
      return `${credential}\n\n${section}\n\n${healthText(ctx, invocation)}`
    })),
    ctx.commands.register({
      definitionId: 'dsh-glm-hourness/glm-logout',
      name: 'glm-logout',
      description: '清除本机保存的原生 ZCode 通道凭证',
      handler: async invocation => {
        if (invocation.rawInput.trim().length > 0) return { kind: 'error', text: '用法：/glm-logout（无需参数）' }
        await logout(home)
        return { kind: 'success', text: 'glm-zcode：凭证已清除' }
      },
    }),
    () => health.dispose(),
    ...(pricing.withdraw === undefined ? [] : [pricing.withdraw]),
  ]
  return () => { for (const dispose of disposers) dispose() }
}

/** `/glm-status`: the credential line (first, the settings page parses it), the peak line and quota section, and the health table. */
function statusCommand(render: (invocation: CommandInvocationLike) => Promise<string>): CommandDefinitionLike {
  return {
    definitionId: 'dsh-glm-hourness/glm-status',
    name: 'glm-status',
    description: '查看原生 ZCode 通道的凭证状态与各行健康',
    handler: async invocation => ({ kind: 'success', text: await render(invocation) }),
  }
}
