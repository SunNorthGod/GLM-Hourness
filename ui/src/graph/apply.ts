/**
 * The panel's write path: one mutation through the host command
 * /graph-apply (src/graph/panel-row.ts), which applies it with actor human.
 * The answer is the command's one-line outcome or refusal; the panel shows
 * it, and the change feed brings the new graph.
 */
import type { CommandsRemote } from '../dsh.ts'

/** Host command of the glm-hourness/graph-panel row. */
const APPLY_COMMAND = 'graph-apply'

export type ApplyOutcome = { readonly ok: boolean, readonly text: string }

const ROW_OFF = '写入没有生效：/graph-apply 不可用。请在插件管理器里启用 glm-hourness/graph-panel 行'

export async function applyMutation(commands: CommandsRemote, sessionId: string, mutation: Readonly<Record<string, unknown>>): Promise<ApplyOutcome> {
  try {
    const result = await commands.execute(sessionId, `/${APPLY_COMMAND} ${JSON.stringify(mutation)}`, [])
    if (!result.ok) return { ok: false, text: `写入没有生效：${result.error.message}` }
    if (result.value === undefined) return { ok: false, text: ROW_OFF }
    const outcome = result.value.result
    return { ok: outcome.kind === 'success', text: outcome.text ?? (outcome.kind === 'success' ? '已写入' : '写入没有生效') }
  }
  catch (error) {
    return { ok: false, text: `写入没有生效：${error instanceof Error ? error.message : String(error)}` }
  }
}
