/**
 * The rules the guard framework implements, listed for the rules board's
 * catalog (docs/ORCHESTRATION.md §16, design §10.1): the board shows them
 * read-only next to its own entries and does not judge them. One list, here:
 * src/rules/builtin.ts maps it to catalog entries `<row>:<id>`, and
 * tests/contracts.spec.ts checks that every id is the id of a rule object the
 * row installs, so a rule added to a row without being listed fails there.
 *
 * There is no mode column (decision d-code-rules-enforce): a rule of this
 * catalog denies from the day its row is enabled, and the gate
 * (src/guard/gate.ts) is what installs it. `liftVia` is who can lift the
 * rule (design §3.5): 'any' — the human tells the main agent, or types
 * /rules lift on the rules board once it offers code rules; 'board' — only
 * the rules board's command, for the rule that guards the lift record
 * itself (lift-files-only arrives with G3).
 */
import type { HealthRow } from '../shared/health.ts'

interface GuardRuleEntry {
  /** The id of the GuardRule object, without the row prefix. */
  readonly id: string
  /** The row that installs the rule. */
  readonly row: HealthRow
  /** What the rule keeps, in one line, for the rules page. */
  readonly title: string
  /** What the rule blocks, in one phrase, for the lift result the main agent reads out. */
  readonly blocks: string
  readonly liftVia: 'any' | 'board'
}

export const GUARD_RULES: readonly GuardRuleEntry[] = [
  { id: 'workspace-containment', row: 'guard', title: '工作区圈禁：写文件的目标必须在工作区内', blocks: 'writes outside the workspace', liftVia: 'any' },
  { id: 'file-tools-only', row: 'guard', title: '文件只用专用工具改：shell 里写文件会被拒', blocks: 'shell commands that write files', liftVia: 'any' },
  { id: 'suppression-reason', row: 'guard', title: '压制注释必须写理由并挂节点', blocks: 'new suppression comments without a reason and a node id', liftVia: 'any' },
  { id: 'checker-config', row: 'guard', title: '检查器配置与基线走人的决定', blocks: 'writes to checker configuration and baselines', liftVia: 'any' },
  { id: 'scratch-only', row: 'guard', title: '一次性脚本只在草稿区', blocks: 'new scripts outside .llm/scratch/ in places that hold none of their kind', liftVia: 'any' },
  { id: 'lift-files-only', row: 'guard', title: '撤下记录由 harness 写：docs/guard/lifts.jsonl 不许改', blocks: 'writes to the lift record docs/guard/lifts.jsonl', liftVia: 'board' },
  { id: 'graph-files-only', row: 'graph', title: '项目图的文件只经图工具改', blocks: 'writes into the project graph', liftVia: 'any' },
  { id: 'files-only', row: 'loops', title: '循环板的条目、脚本和运行时文件只由循环板自己写：写这些文件的调用会被拒', blocks: 'writes under the loop board\'s files', liftVia: 'any' },
  { id: 'schedule-tools', row: 'loops', title: '循环板自己的 DSH 提醒不经定时工具改，也不许冒充循环板建提醒', blocks: 'changes to the loop board\'s reminders through the schedule tools', liftVia: 'any' },
  { id: 'metrics-files-only', row: 'metrics', title: '指标流水只由 harness 写：写、删、移流水文件与 npm run metrics -- prune 都会被拒', blocks: 'writes, deletes and moves under the metrics journal, and npm run metrics -- prune', liftVia: 'any' },
]
