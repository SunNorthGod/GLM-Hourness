/**
 * The rules the guard framework implements, listed for the rules board's
 * catalog (docs/ORCHESTRATION.md §16, design §10.1): the board shows them
 * read-only next to its own entries and does not judge them. One list, here:
 * src/rules/builtin.ts maps it to catalog entries `<row>:<id>`, and
 * tests/contracts.spec.ts checks that every id is the id of a rule object the
 * row installs, so a rule added to a row without being listed fails there.
 *
 * `mode` is `enforce` for every rule: a rule denies from the day its row is
 * enabled (decision d-code-rules-enforce), there is no shadow mode to list.
 */
import type { HealthRow } from '../shared/health.ts'

interface GuardRuleEntry {
  /** The id of the GuardRule object, without the row prefix. */
  readonly id: string
  /** The row that installs the rule. */
  readonly row: HealthRow
  readonly mode: 'enforce'
  /** What the rule keeps, in one line, for the rules page. */
  readonly title: string
}

export const GUARD_RULES: readonly GuardRuleEntry[] = [
  { id: 'workspace-containment', row: 'guard', mode: 'enforce', title: '工作区圈禁：写文件的目标必须在工作区内' },
  { id: 'file-tools-only', row: 'guard', mode: 'enforce', title: '文件只用专用工具改：shell 里写文件会被拒' },
  { id: 'graph-files-only', row: 'graph', mode: 'enforce', title: '项目图的文件只经图工具改' },
  { id: 'files-only', row: 'loops', mode: 'enforce', title: '循环板的条目、脚本和运行时文件只由循环板自己写：写这些文件的调用会被拒' },
  { id: 'schedule-tools', row: 'loops', mode: 'enforce', title: '循环板自己的 DSH 提醒不经定时工具改，也不许冒充循环板建提醒' },
]
