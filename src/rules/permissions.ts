/**
 * Who may write what (docs/ORCHESTRATION.md §16.9; design §2.5): the first
 * check of every write. The identity comes from the entry that calls, never
 * from the request: a slash command is the person's, a tool or the command
 * line is `llm`, a detector's runner is `detector`, the host's own code is
 * `harness`. One row for each operation the board has; the operations that
 * need the path of a person's agreement (the detectors) and the detector's own
 * signal are not in the table because the board does not have them yet.
 * The path of agreement is: an agent proposes (`propose`), and the person's
 * word makes it so (`proposal-accept`, typed by the person or handed over by the
 * host from the chat, where the main agent recorded the person's words).
 *
 * Two rows, `repo-outside` and `repo-outside-cleared`, are records the board
 * makes by itself when it finds the rules file changed or put back
 * (repo.ts `settleLocked`): they are in the table so that the record names
 * are the table's, and they are not requests.
 */
import type { RulesActor } from './model.ts'

interface Operation {
  /** The identity that may do it: the person for what is the person's to decide, the host's code for what only it knows, an agent for what it may only propose. */
  readonly writer: 'human' | 'harness' | 'llm'
  /** Another identity that may do it too: the host's code settles what the person decided on the graph. */
  readonly also?: 'harness'
  /** What it is, for "only the person can ...". */
  readonly does: string
  /** What the one who may not do it should do instead. */
  readonly hint: string
}

const BY_ITSELF = '规则板自己会做这件事，不需要你操作'
const TICKETS_BY_ITSELF = '等待单由规则板自己开、改和转交，不需要你操作；要放行或取消，打 /rules let <单号> 或 /rules cancel <单号>'
const NOTICES_BY_ITSELF = '提醒由规则板自己记和发，不需要你操作'

const OPERATIONS = {
  // Only the person changes the peak mode; an agent can propose it and the person's word makes it so (the proposal path joins with the full board).
  'peak-mode-set': { writer: 'human', does: '改高峰模式', hint: '在输入框打 /rules peak 无影响|少做|不做' },
  'rule-lift': { writer: 'human', does: '解除规则', hint: '在输入框打 /rules lift <规则 id>' },
  'rule-delete': { writer: 'human', does: '删除规则', hint: '在输入框打 /rules delete <规则 id>' },
  'rule-expire': { writer: 'harness', does: '让规则按自己的期限失效', hint: `${BY_ITSELF}；想让一条规则现在就停，在输入框打 /rules lift <规则 id>` },
  'signal-manual': { writer: 'human', does: '手设信号的值', hint: '在输入框打 /rules on <开关> [时长]，或 /rules set <信号> <值> [时长]' },
  'signal-clear': { writer: 'human', does: '清掉信号的手设值', hint: '在输入框打 /rules clear <信号>' },
  'signal-delete': { writer: 'human', does: '删除开关', hint: '在输入框打 /rules delete <开关名>' },
  'ticket-open': { writer: 'harness', does: '开等待单', hint: TICKETS_BY_ITSELF },
  'ticket-update': { writer: 'harness', does: '改等待单', hint: TICKETS_BY_ITSELF },
  'ticket-handover': { writer: 'harness', does: '转交等待单', hint: TICKETS_BY_ITSELF },
  'ticket-adopt': { writer: 'harness', does: '接手等待单', hint: TICKETS_BY_ITSELF },
  'ticket-let-once': { writer: 'human', does: '放行等待单这一次', hint: '在输入框打 /rules let <单号>' },
  'ticket-cancel': { writer: 'human', does: '取消等待单', hint: '在输入框打 /rules cancel <单号>' },
  'recovery-accept': { writer: 'human', does: '照改没有生效的记录', hint: '在输入框打 /rules recovery <编号> 照改|忽略' },
  'recovery-dismiss': { writer: 'human', does: '忽略没有生效的记录', hint: '在输入框打 /rules recovery <编号> 照改|忽略' },
  'repo-adopt': { writer: 'human', does: '照仓库里被改过的规则文件改', hint: '在输入框打 /rules recovery 文件 照改|忽略' },
  'repo-restore': { writer: 'human', does: '把规则文件按规则板自己的存档写回', hint: '在输入框打 /rules recovery 文件 照改|忽略' },
  'repo-outside': { writer: 'harness', does: '记下仓库里的规则文件被规则板以外改过', hint: `${BY_ITSELF}；看到这条提示之后，在输入框打 /rules recovery 文件 照改|忽略` },
  'repo-outside-cleared': { writer: 'harness', does: '记下仓库里的规则文件改回来了', hint: BY_ITSELF },
  'propose': { writer: 'llm', does: '提议加规则、解除规则、改档位或删规则', hint: '人说一句要什么，主 Agent 用 rules_propose 记提议，再问人' },
  'proposal-show': { writer: 'human', does: '看提议的原文', hint: '在输入框打 /rules accept <提议 id>' },
  'proposal-accept': { writer: 'human', also: 'harness', does: '同意提议', hint: '在对话里对主 Agent 说同意，由它记下你的话；或在输入框打 /rules accept <提议 id>' },
  'proposal-reject': { writer: 'human', also: 'harness', does: '否掉提议', hint: '在对话里对主 Agent 说不要，由它记下你的话；或在输入框打 /rules reject <提议 id>' },
  'proposal-expire': { writer: 'harness', does: '让没人看过的提议过期', hint: BY_ITSELF },
  'notice-add': { writer: 'harness', does: '记下要告诉主 Agent 的话', hint: NOTICES_BY_ITSELF },
  'notice-delivered': { writer: 'harness', does: '记下提醒已经发出', hint: NOTICES_BY_ITSELF },
} as const satisfies Record<string, Operation>

/** The operations the board has. */
export type WriteOp = keyof typeof OPERATIONS

export const WRITE_OPS = Object.keys(OPERATIONS) as readonly WriteOp[]

export interface Refusal {
  readonly message: string
  /** How the person does it, or that the board does it by itself. */
  readonly hint: string
}

/** Why the actor may not do the operation, or undefined when it may. */
export function refusalFor(actor: RulesActor, op: WriteOp): Refusal | undefined {
  const operation: Operation = OPERATIONS[op]
  if (operation.writer === actor || operation.also === actor) return undefined
  return {
    message: `只有${operation.writer === 'human' ? '人' : operation.writer === 'llm' ? '提议的 agent' : '规则板自己'}能${operation.does}（身份 ${actor} 不行）`,
    hint: operation.hint,
  }
}
