/**
 * dsh-glm-login — the channel's human commands. `/glm-login` starts the
 * server-mediated ZCode OAuth flow and replies with the authorize URL; the
 * poll completes in the background and the resolved coding-plan credential
 * lands in the encrypted store. `/glm-status` reports whether a credential is
 * present (key preview, JWT age on start-plan), followed by the row health
 * table of the invoking session (src/shared/health.ts). A missing home turns
 * /glm-login and /glm-logout off instead of failing activation; /glm-status
 * stays, so the table can say what is missing.
 */
import { ZcodeLogin, ZcodeAdapter, logout } from './zcode.ts'
import { collectHealth, provideRowHealth, renderHealthTable, sessionIdOf } from '../shared/health.ts'
import type { CommandDefinitionLike, CommandInvocationLike, CommandsHost, ProvideHost, ServiceLookup } from '../shared/dsh-min.ts'

export interface LoginConfig {
  /** The agent home directory (`.llm`): credentials.json + device-mid.txt live here. Required. */
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

/** cordis plugin entry: registers /glm-login, /glm-status, and /glm-logout. */
export function apply(ctx: CommandsHost & ServiceLookup & Partial<ProvideHost>, config: LoginConfig = {}): () => void {
  if (config.home === undefined || config.home.length === 0) {
    console.warn('dsh-glm-hourness/glm-login: home is not configured; /glm-login stays off (set config.home)')
    const health = provideRowHealth(ctx, 'glm-login', 'inactive', 'home 未配置，/glm-login 与 /glm-logout 关闭')
    const unregister = ctx.commands.register(statusCommand(async invocation => `glm-zcode：未登录（glm-login 行未配置 home，凭证位置未知）\n\n${healthText(ctx, invocation)}`))
    return () => {
      unregister()
      health.dispose()
    }
  }
  const home = config.home
  const login = new ZcodeLogin({ home, ...(config.fetchImpl === undefined ? {} : { fetchImpl: config.fetchImpl }) })
  const adapter = new ZcodeAdapter({ home, ...(config.fetchImpl === undefined ? {} : { fetchImpl: config.fetchImpl }) })
  const health = provideRowHealth(ctx, 'glm-login', 'active', '/glm-login、/glm-status、/glm-logout 已注册')
  const credentialText = async (): Promise<string> => {
    const status = await adapter.status()
    if (!status.logged) {
      return `glm-zcode：未登录（套餐 ${status.plan}）。运行 /glm-login 开始登录${login.state.error === undefined ? '' : `\n上次登录错误：${login.state.error}`}`
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
