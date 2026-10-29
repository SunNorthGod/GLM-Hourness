/**
 * Readers of the GLM channel's command replies for the composer pill
 * (ui/src/channel.js). The text comes from the host half: the credential
 * line of `/glm-status` and the last login error under it
 * (src/glm-llm/login-row.ts), then the row health table (src/shared/health.ts
 * renderHealthTable). tests/health.spec.ts runs the real handlers and reads
 * their text through these functions, so a format change on either side
 * fails there instead of blanking a field of the dialog.
 */

/** The credential as `/glm-status` states it. */
type ChannelStatus =
  | { readonly logged: true, readonly plan: string, readonly key: string, readonly userId?: string, readonly jwt?: string }
  | { readonly logged: false, readonly plan: string, readonly incomplete?: string, readonly loginError?: string }

/** A command reply as the pill's runner returns it; `missing` when no row registers the command. */
interface CommandReply {
  readonly ok: boolean
  readonly missing: boolean
  readonly text: string
}

/** One line of the health table: the row's name (the package's for a package's single line), state label and reason. */
interface HealthLine {
  readonly row: string
  readonly state: string
  readonly reason: string
}

const LOGGED = /已登录（套餐 ([^，）]+)，Key ([^，）]+)(?:，账号 ([^，）]+))?(?:，JWT 已用 ([\d.]+) 小时)?）/
const NOT_LOGGED = /未登录（套餐 ([^，）]+)(?:，登录不完整：([^）]+))?）/
const LOGIN_ERROR_PREFIX = '上次登录错误：'

/** The credential line, and on a not-logged-in reply the last login error line, as fields; null when the text does not read. */
function parseStatus(text: string): ChannelStatus | null {
  const logged = LOGGED.exec(text)
  if (logged !== null) {
    const [, plan, key, userId, jwt] = logged
    return { logged: true, plan, key, ...(userId === undefined ? {} : { userId }), ...(jwt === undefined ? {} : { jwt }) }
  }
  const out = NOT_LOGGED.exec(text)
  if (out === null) return null
  const [, plan, incomplete] = out
  const loginError = text.split('\n').find(line => line.startsWith(LOGIN_ERROR_PREFIX))?.slice(LOGIN_ERROR_PREFIX.length)
  return { logged: false, plan, ...(incomplete === undefined ? {} : { incomplete }), ...(loginError === undefined ? {} : { loginError }) }
}

/** What a `/glm-status` reply says about the credential; `unknown` names why it cannot be told. */
export function statusOf(reply: CommandReply): ChannelStatus | { readonly unknown: string } {
  if (reply.missing) return { unknown: 'glm-login 行没有加载' }
  if (!reply.ok) return { unknown: '查询失败，见下方输出' }
  return parseStatus(reply.text) ?? { unknown: '返回内容读不懂' }
}

/** A line of the health table or its heading. */
function isTableLine(line: string): boolean {
  return line.startsWith('|') || line.startsWith('## 行健康')
}

/** The 行 cell of a package's single line when none of its rows is loaded (src/shared/health.ts). */
const WHOLE_PACKAGE = '全部'

/**
 * The row health table of `/glm-status` (columns 包, 行, 状态, 说明), or null
 * when the text has none. A package's single line is named by the package.
 */
export function parseHealth(text: string): HealthLine[] | null {
  const rows: HealthLine[] = []
  for (const line of text.split('\n')) {
    if (!line.startsWith('| ') || line.startsWith('| ---') || line.startsWith('| 包 |')) continue
    const cells = line.slice(1, -1).split(/(?<!\\)\|/).map(cell => cell.trim().replaceAll('\\|', '|'))
    if (cells.length === 4) rows.push({ row: cells[1] === WHOLE_PACKAGE ? cells[0] : cells[1], state: cells[2], reason: cells[3] })
  }
  return rows.length === 0 ? null : rows
}

/**
 * The lines of a reply with a health table that the dialog shows as neither
 * a field nor a health row: everything except blank lines, the table with
 * its heading, and the credential and login error lines once they parse.
 */
export function restOf(text: string): string[] {
  const status = parseStatus(text)
  const isField = (line: string): boolean => status !== null && (status.logged
    ? LOGGED.test(line)
    : NOT_LOGGED.test(line) || (status.loginError !== undefined && line.startsWith(LOGIN_ERROR_PREFIX)))
  return text.split('\n').filter(line => line.trim().length > 0 && !isTableLine(line) && !isField(line))
}
