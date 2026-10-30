/**
 * The rules row's health line for a session (docs/DESIGN.md §2.5): what the
 * project's peak mode is, whether the clock can be read, and everything the
 * storage found that the person should know. The row is degraded when
 * something the board holds does not take effect (a file or journal line it
 * does not trust); a state it rebuilt and persisted without loss is told but
 * does not degrade it, and neither does a clock that cannot be read (a
 * package without the GLM channel has no peak hours; docs/ORCHESTRATION.md
 * §11.3 treats that as a supported combination).
 */
import type { HealthState } from '../shared/health.ts'
import { PEAK_LEVEL_WORDS } from '../shared/peak-mode.ts'
import { effectivePeakMode, type RecoveryReason, type RepoDiffLine } from './model.ts'
import type { PeakReading } from './peak.ts'
import type { ProjectRead } from './repo.ts'

const RECOVERED_TEXT: Readonly<Record<RecoveryReason, string>> = {
  'snapshot-behind': '存档没跟上变更记录，已补上',
  'snapshot-corrupt': '规则板的存档坏了（被清零、截断或读不出），已按变更记录重建',
  'snapshot-modified': '存档与变更记录对不上，已按变更记录重建，原存档已另存',
  'journal-shorter': '变更记录比存档短（被截断或删改过），已按变更记录重建，原存档已另存',
  'journal-tail': '变更记录的最后一条没写完，已丢掉',
  'journal-unreadable': '变更记录里有读不出的行',
  'journal-not-engine': '变更记录里有不是规则板自己写的记录',
}

function diffText(diff: readonly RepoDiffLine[]): string {
  const change = { added: '多了', removed: '没了', changed: '改了' }
  return diff.map(line => `${line.path.join('.')}${change[line.change]}${line.fields === undefined ? '' : `（${line.fields.join('、')}）`}`).join('，')
}

/** The state and the reason one session reports. `name` is the project's folder name. */
export function projectHealth(name: string, read: ProjectRead, reading: PeakReading, gitOperation: string | undefined): readonly [HealthState, string] {
  const effective = effectivePeakMode(read.state)
  const head = `本会话所在项目 ${name}：高峰模式 ${PEAK_LEVEL_WORDS[effective.level].name}（${effective.origin === 'human' ? '你选的' : '出厂默认'}）`
  const clock = reading.peak === undefined ? `读不出是不是高峰（${reading.why ?? '原因不明'}），这一档现在不生效` : reading.peak ? '现在是高峰' : '现在不是高峰'
  const told: string[] = []
  const problems: string[] = []
  const { state, load, repo } = read
  const unresolved = Object.values(state.unresolved ?? {})
  if (state.recovered !== undefined) told.push(RECOVERED_TEXT[state.recovered.reason])
  if (load.plan !== undefined) told.push('状态要重建，已在内存里按变更记录重放；下一次写入时留痕')
  if (state.recovered?.reason === 'snapshot-modified' || state.recovered?.reason === 'journal-shorter') problems.push(RECOVERED_TEXT[state.recovered.reason])
  if (unresolved.length > 0) problems.push(`变更记录里有 ${unresolved.length} 条没有生效的记录（编号 ${unresolved.map(entry => entry.label).join('、')}）。这一版还没有处理它们的命令；要清掉，删掉 .llm/rules/，规则板会照仓库里的规则文件重新开始`)
  if (repo.kind === 'unreadable') problems.push(`仓库里的规则文件读不出（${repo.reason}），没有生效`)
  if (repo.kind === 'outside') problems.push(`仓库里的规则文件被规则板以外改过，没有生效（${diffText(repo.diff)}）。要按存档重写它，打 /rules peak 重设一次档位`)
  else if (state.repo.outside !== undefined) problems.push(`仓库里的规则文件被规则板以外改过，没有生效（${diffText(state.repo.outside.diff)}）。要按存档重写它，打 /rules peak 重设一次档位`)
  if (repo.kind === 'owed') told.push(gitOperation === undefined ? '规则文件待写回' : `规则文件待写回（git 正在做 ${gitOperation}）`)
  return [problems.length === 0 ? 'active' : 'degraded', [head, clock, ...told, ...problems].join('；')]
}
