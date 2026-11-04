/**
 * The walk line of a flow body and the walk commands of the merge gate
 * (design 0.4.1 §2.7, §3.6): the flow picks a kind and an estimate, the
 * command itself lives only in the norm node the person approved
 * (norm-merge-gate), so the harness never executes text the main agent can
 * rewrite. Pure functions; engine.ts (the edit rule for the walk kind) and
 * user-graph.ts (the flow:no-walk gap) share them. No Node built-ins.
 */

/** The four ways a flow is walked: three the harness runs, one the person walks themselves. */
export const WALK_KINDS = ['命令', '截图', '终端', '你来走'] as const
export type WalkKind = typeof WALK_KINDS[number]

/** The kinds the harness runs; `你来走` needs no command. */
const AUTO_WALK_KINDS: readonly WalkKind[] = ['命令', '截图', '终端']

/** One flow's `走法：` line: a kind and an estimate in seconds, `你来走` alone, or why the line cannot be read. */
export type ParsedWalkLine = { readonly kind: WalkKind, readonly seconds?: number } | { readonly unparsed: string }

/** Longest estimate of a walk, in seconds (design §2.7): 1 s to 30 minutes. */
export const WALK_SECONDS_LIMIT = 1800

const WALK_PREFIX = '走法'

/** `走法：<命令|截图|终端> · 预计 <N> 秒`, or `走法：你来走`. */
const AUTO_LINE = /^(\S+)\s*·\s*预计\s*(\d+)\s*秒$/u

/** One line of norm-merge-gate's acceptance naming the command of one kind: `` `walk <kind> $ <command with {flow}>` ``. */
const COMMAND_LINE = /^`walk (.+?) \$ (.+)`$/u

/**
 * The `走法：` line of a flow body (the first section of that label counts,
 * like the labeled sections of stage.ts): a kind with its estimate, `你来走`
 * alone, or the reason it cannot be read (the gap flow:no-walk shows it).
 */
export function parseWalkLine(body: string | undefined): ParsedWalkLine {
  const found = (body ?? '').split(/\r?\n/).filter(line => line.startsWith(`${WALK_PREFIX}：`) || line.startsWith(`${WALK_PREFIX}:`))
  if (found.length === 0) return { unparsed: '正文没有「走法：」一行' }
  if (found.length > 1) return { unparsed: '正文有不止一行「走法：」' }
  const rest = found[0].slice(WALK_PREFIX.length + 1).trim()
  if (rest.startsWith('你来走')) {
    return rest.length === '你来走'.length ? { kind: '你来走' } : { unparsed: '「你来走」后面还有内容' }
  }
  const match = AUTO_LINE.exec(rest)
  if (match === null) return { unparsed: '「走法：」不是「命令 · 预计 N 秒」「截图 · 预计 N 秒」「终端 · 预计 N 秒」或「你来走」' }
  const kind = match[1]
  if (!(AUTO_WALK_KINDS as readonly string[]).includes(kind)) {
    return { unparsed: `走法种类「${kind}」不在 命令、截图、终端 里` }
  }
  const seconds = Number(match[2])
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > WALK_SECONDS_LIMIT) {
    return { unparsed: `预计 ${match[2]} 秒不是 1 到 ${WALK_SECONDS_LIMIT} 的整数` }
  }
  return { kind: kind as WalkKind, seconds }
}

/** The walk commands of a merge-gate acceptance: kind to command, and why a walk-shaped line was not used. */
export interface WalkCommands {
  /** One command per kind; absent when the acceptance names none. */
  readonly commands: Readonly<Partial<Record<WalkKind, string>>>
  /** The walk-shaped lines that name no usable command, with the reason each. */
  readonly skipped: readonly string[]
}

/**
 * The `` `walk <kind> $ <command>` `` lines of an acceptance (§2.7). Lines
 * that are not shaped like one are not walk lines (an acceptance names other
 * things too); a walk-shaped line whose kind is unknown or whose command
 * does not run one flow (`{flow}`) is skipped with its reason, so the gap
 * flow:no-walk can say what to fix. The first command of a kind wins.
 */
export function walkCommandsOf(acceptance: readonly string[] | undefined): WalkCommands {
  const commands: Partial<Record<WalkKind, string>> = {}
  const skipped: string[] = []
  for (const item of acceptance ?? []) {
    const match = COMMAND_LINE.exec(item.trim())
    if (match === null) continue
    const kind = match[1]
    const command = match[2]
    if (!(WALK_KINDS as readonly string[]).includes(kind)) {
      skipped.push(`walk 行的种类「${kind}」不在 命令、截图、终端、你来走 里`)
      continue
    }
    if (!command.includes('{flow}')) {
      skipped.push(`种类「${kind}」的 walk 命令里没有 {flow}，跑不了单条流程`)
      continue
    }
    if (commands[kind as WalkKind] !== undefined) {
      skipped.push(`种类「${kind}」已有 walk 命令，后一条没有用`)
      continue
    }
    commands[kind as WalkKind] = command
  }
  return { commands, skipped }
}
