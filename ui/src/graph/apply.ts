/**
 * The panel's write path: host commands of the glm-hourness/graph-panel row
 * (src/graph/panel-row.ts), both acting as the human. /graph-apply applies
 * one mutation; /graph-run starts, stops or redoes the work on a task
 * (src/graph/run-control.ts). The answer is the command's one-line outcome
 * or refusal, the same line the conversation shows; the panel shows it, and
 * the change feed brings the new graph.
 */
import { RUN_COMMAND, RUN_LABELS, type RunAction } from '../../../src/graph/run.ts'
import type { CommandsRemote } from '../dsh.ts'

/** Host command of the glm-hourness/graph-panel row. */
const APPLY_COMMAND = 'graph-apply'

export type ApplyOutcome = { readonly ok: boolean, readonly text: string }

/** Send one command line for the session; `failed` begins the line when it did not take effect. */
async function execute(commands: CommandsRemote, sessionId: string, command: string, input: string, failed: string): Promise<ApplyOutcome> {
  try {
    const result = await commands.execute(sessionId, `/${command} ${input}`, [])
    if (!result.ok) return { ok: false, text: `${failed}：${result.error.message}` }
    if (result.value === undefined) return { ok: false, text: `${failed}：/${command} 不可用。请在插件管理器里启用 glm-hourness/graph-panel 行` }
    const outcome = result.value.result
    return { ok: outcome.kind === 'success', text: outcome.text ?? (outcome.kind === 'success' ? '已完成' : failed) }
  }
  catch (error) {
    return { ok: false, text: `${failed}：${error instanceof Error ? error.message : String(error)}` }
  }
}

export function applyMutation(commands: CommandsRemote, sessionId: string, mutation: Readonly<Record<string, unknown>>): Promise<ApplyOutcome> {
  return execute(commands, sessionId, APPLY_COMMAND, JSON.stringify(mutation), '写入没有生效')
}

export function runControl(commands: CommandsRemote, sessionId: string, action: RunAction, id: string): Promise<ApplyOutcome> {
  return execute(commands, sessionId, RUN_COMMAND, `${action} ${id}`, `「${RUN_LABELS[action]}」没有执行`)
}
