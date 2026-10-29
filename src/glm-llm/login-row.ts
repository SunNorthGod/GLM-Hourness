/**
 * dsh-glm-login — the channel's human commands. `/glm-login` starts the
 * server-mediated ZCode OAuth flow and replies with the authorize URL; the
 * poll completes in the background and the resolved coding-plan credential
 * lands in the encrypted store. `/glm-status` reports whether a credential is
 * present (key preview, JWT age on start-plan), followed by the row health
 * table of the invoking session (src/shared/health.ts). The credential
 * directory is the channel row's: `home`, else `<DSH home>/glm-hourness`.
 *
 * The row also provides the pricing service (src/shared/pricing.ts): the
 * GLM credit plan the orchestration package's usage panel prices calls
 * with. It is the plan's human entry and enabled by default, and it does
 * not depend on the route, the channel row or the dialect.
 */
import { ZcodeLogin, ZcodeAdapter, logout } from './zcode.ts'
import { creditPricing } from './credits.ts'
import { credentialHome } from '../shared/data-home.ts'
import { collectHealth, provideRowHealth, renderHealthTable, sessionIdOf } from '../shared/health.ts'
import { PRICING_SERVICE } from '../shared/pricing.ts'
import type { CommandDefinitionLike, CommandInvocationLike, CommandsHost, ProvideHost, ServiceLookup } from '../shared/dsh-min.ts'

export interface LoginConfig {
  /** The credential directory (credentials.json); default `<DSH home>/glm-hourness`, as the channel row. */
  readonly home?: string
  /** Injected transport for tests. */
  readonly fetchImpl?: typeof fetch
}

/** cordis plugin identity: needs the commands service. */
export const name = 'dsh-glm-hourness/glm-login'
export const inject = ['commands']

/** The row health table for the session the command runs in. */
function healthText(ctx: ServiceLookup, invocation: CommandInvocationLike): string {
  const sessionId = sessionIdOf(invocation.agent)
  return renderHealthTable(collectHealth(ctx, sessionId), sessionId)
}

/** Provide the pricing service: its disposer, or (warned) why the context could not take it. */
function providePricing(ctx: Partial<ProvideHost>): { readonly withdraw?: () => void, readonly failure?: string } {
  try {
    if (typeof ctx.provide !== 'function') throw new Error('the context has no provide')
    return { withdraw: ctx.provide(PRICING_SERVICE, creditPricing) }
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
  const login = new ZcodeLogin({ home, ...(config.fetchImpl === undefined ? {} : { fetchImpl: config.fetchImpl }) })
  const adapter = new ZcodeAdapter({ home, ...(config.fetchImpl === undefined ? {} : { fetchImpl: config.fetchImpl }) })
  const commands = '/glm-login、/glm-status、/glm-logout 已注册'
  const pricing = providePricing(ctx)
  const health = pricing.withdraw !== undefined
    ? provideRowHealth(ctx, 'glm-login', 'active', commands)
    : provideRowHealth(ctx, 'glm-login', 'degraded', `${commands}；积分口径未提供：${pricing.failure ?? ''}`)
  const credentialText = async (): Promise<string> => {
    const status = await adapter.status()
    if (!status.logged) {
      return `glm-zcode：未登录（套餐 ${status.plan}${status.incomplete === undefined ? '' : `，登录不完整：${status.incomplete}`}）。运行 /glm-login 开始登录${login.state.error === undefined ? '' : `\n上次登录错误：${login.state.error}`}`
    }
    return `glm-zcode：已登录（套餐 ${status.plan}，Key ${status.keyPreview}${status.userId === undefined ? '' : `，账号 ${status.userId}`}${status.jwtAgeHours === undefined ? '' : `，JWT 已用 ${status.jwtAgeHours} 小时`}）`
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
    ctx.commands.register(statusCommand(async invocation => `${await credentialText()}\n\n${healthText(ctx, invocation)}`)),
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

/** `/glm-status`: the credential line (first, the settings page parses it) and the health table. */
function statusCommand(render: (invocation: CommandInvocationLike) => Promise<string>): CommandDefinitionLike {
  return {
    definitionId: 'dsh-glm-hourness/glm-status',
    name: 'glm-status',
    description: '查看原生 ZCode 通道的凭证状态与各行健康',
    handler: async invocation => ({ kind: 'success', text: await render(invocation) }),
  }
}
