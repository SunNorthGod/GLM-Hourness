/**
 * dsh-glm-login — the channel's human commands. `/glm-login` starts the
 * server-mediated ZCode OAuth flow and replies with the authorize URL; the
 * poll completes in the background and the resolved coding-plan credential
 * lands in the encrypted store. `/glm-status` reports whether a credential is
 * present (key preview, JWT age on start-plan). A missing home degrades to a
 * no-op instead of failing activation.
 */
import { ZcodeLogin, ZcodeAdapter, logout } from './zcode.ts'
import type { CommandsHost } from '../shared/dsh-min.ts'

export interface LoginConfig {
  /** The agent home directory (`.llm`): credentials.json + device-mid.txt live here. Required. */
  readonly home?: string
  /** Injected transport for tests. */
  readonly fetchImpl?: typeof fetch
}

/** cordis plugin identity: needs the commands service. */
export const name = 'dsh-glm-hourness/glm-login'
export const inject = ['commands']

/** cordis plugin entry: registers /glm-login, /glm-status, and /glm-logout. */
export function apply(ctx: CommandsHost, config: LoginConfig = {}): () => void {
  if (config.home === undefined || config.home.length === 0) {
    console.warn('dsh-glm-hourness/glm-login: home is not configured; /glm-login stays off (set config.home)')
    return () => {}
  }
  const home = config.home
  const login = new ZcodeLogin({ home, ...(config.fetchImpl === undefined ? {} : { fetchImpl: config.fetchImpl }) })
  const adapter = new ZcodeAdapter({ home, ...(config.fetchImpl === undefined ? {} : { fetchImpl: config.fetchImpl }) })
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
    ctx.commands.register({
      definitionId: 'dsh-glm-hourness/glm-status',
      name: 'glm-status',
      description: '查看原生 ZCode 通道的凭证状态',
      handler: async () => {
        const status = await adapter.status()
        if (!status.logged) {
          return { kind: 'success', text: `glm-zcode：未登录（套餐 ${status.plan}）。运行 /glm-login 开始登录${login.state.error === undefined ? '' : `\n上次登录错误：${login.state.error}`}` }
        }
        return { kind: 'success', text: `glm-zcode：已登录（套餐 ${status.plan}，Key ${status.keyPreview}${status.userId === undefined ? '' : `，账号 ${status.userId}`}${status.jwtAgeHours === undefined ? '' : `，JWT 已用 ${status.jwtAgeHours} 小时`}）` }
      },
    }),
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
  ]
  return () => { for (const dispose of disposers) dispose() }
}
