/**
 * What a listing of a project's rules is made of (docs/ORCHESTRATION.md
 * §16.10, §16.11): the rules in force, the waiting calls, the signals and the
 * notes about how the state was read. `npm run -s rules -- show` and the tool
 * `rules_show` list the same things from the same functions, and print them
 * with the same formatter (show.ts). Pure.
 */
import { ended, type JudgeInput } from './judge.ts'
import { unapprovedScripts, type BuiltinRule, type ProjectState, type Rule, type Ticket } from './model.ts'
import type { ProjectRead } from './repo.ts'
import type { ShownRule } from './show.ts'
import type { SignalReading } from './signals.ts'
import { compare } from './table.ts'

/** Said of a rule whose script nobody on this machine has read. */
const SCRIPT_NOT_APPROVED = 'The script is not approved on this machine, so it is not run.'

/** What a reader should know about how a project's state was read. */
export function stateNotes(read: ProjectRead): string[] {
  const notes: string[] = []
  if (read.load.fresh) {
    notes.push(read.repo.kind === 'fresh-start'
      ? '这个项目还没有规则板自己的状态，照仓库里的规则文件在内存里开始，没有写文件'
      : read.repo.kind === 'unreadable'
        ? `这个项目还没有规则板自己的状态，仓库里的规则文件读不出（${read.repo.reason}），按空状态判`
        : '这个项目还没有规则板的状态')
  }
  else if (read.load.source === 'replay') notes.push('状态要重建，已在内存里按变更记录重放，没有写文件')
  if (read.repo.kind === 'outside' || read.repo.kind === 'outside-known') notes.push('仓库里的规则文件被规则板以外改过，按变更记录判')
  return notes
}

/** The rules of the table that are in force at the moment of `input`: not lifted, not past their time. A script nobody here has read is told as such. */
export function rulesInForce(state: ProjectState, table: readonly (Rule | BuiltinRule)[], input: JudgeInput): ShownRule[] {
  const unapproved = new Set(unapprovedScripts(state).map(entry => entry.id))
  return table
    .filter(rule => !('status' in rule && rule.status !== 'active') && !ended(rule, input))
    .map(rule => (unapproved.has(rule.id) ? { rule, note: SCRIPT_NOT_APPROVED } : { rule }))
}

/** The calls still waiting, or cleared and not yet repeated, by number. */
export function openTickets(state: ProjectState): Ticket[] {
  return Object.values(state.tickets ?? {}).filter(ticket => ticket.state === 'deferred' || ticket.state === 'cleared').sort((a, b) => compare(a.id, b.id))
}

/** The readings of the project's own signals (switches and the signals of detectors), by name. */
export function projectSignals(state: ProjectState, readings: ReadonlyMap<string, SignalReading>): SignalReading[] {
  return Object.keys(state.signals ?? {}).sort(compare).flatMap(name => readings.get(name) ?? [])
}
