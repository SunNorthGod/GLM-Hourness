/**
 * The events the loop row itself puts out (docs/ORCHESTRATION.md §18.5; loop
 * board design 0.6 §4.1): the declarations the shared event table holds for
 * them, and the dedupe key of one occurrence of each. The row that finds the
 * event writes the key (the inbox keeps a key seven days and runs the event
 * once for it); the finding itself is not here.
 *
 * A key says "this occurrence": `<event name without its namespace>:<subject>:
 * <what makes this occurrence this one>`. Replaying the same occurrence gives
 * the same key; a real second occurrence gives another. Pure; no Node built-in.
 */
import type { LoopEventDeclaration } from './trigger.ts'

export const LOOP_EVENTS: readonly LoopEventDeclaration[] = [
  {
    id: 'loops.host-restarted',
    title: 'DSH 重新启动了',
    fields: [
      { name: 'previousStart', type: 'string', title: '上次启动的时刻' },
      { name: 'downMinutes', type: 'number', title: '停机的分钟数', filter: 'atLeast' },
      { name: 'crashed', type: 'boolean', title: '上次是崩溃的', filter: 'is' },
      { name: 'rebooted', type: 'boolean', title: '机器重启过', filter: 'is' },
      { name: 'appChanged', type: 'boolean', title: 'DSH 程序更新过', filter: 'is' },
    ],
    personSelectable: true,
  },
  {
    id: 'loops.waiting-on-human',
    title: '有事等你超过一段时间',
    fields: [
      { name: 'items', type: 'strings', title: '新越过门槛的几件' },
      { name: 'count', type: 'number', title: '一共几件', filter: 'atLeast' },
    ],
    params: [{ name: 'olderThanHours', type: 'number', title: '等了多少小时', required: true, min: 1, max: 168 }],
    personSelectable: true,
  },
  {
    id: 'loops.file-changed',
    title: '某个文件变了',
    fields: [
      { name: 'path', type: 'string', title: '文件路径' },
      { name: 'size', type: 'number', title: '大小' },
      { name: 'mtime', type: 'string', title: '修改时间' },
    ],
    params: [{ name: 'path', type: 'string', title: '要看的路径', required: true }],
    personSelectable: true,
  },
]

/** The same declarations by id: the part of the event table that is always there. */
export const LOOP_EVENT_TABLE: ReadonlyMap<string, LoopEventDeclaration> = new Map(LOOP_EVENTS.map(declared => [declared.id, declared]))

/** `loops.host-restarted`: the process that starts running the project writes the moment it started into the state, and that moment is the occurrence. */
export function hostRestartedKey(projectKey: string, startedAt: string): string {
  return `host-restarted:${projectKey}:${startedAt}`
}

/**
 * `loops.file-changed`: the file's size and modification time in milliseconds. A deleted file has the size `gone`;
 * its time is that of the last version seen, so a file deleted, written again and deleted again is two occurrences.
 */
export function fileChangedKey(path: string, size: number | 'gone', mtimeMs: number): string {
  return `file-changed:${path}:${size}-${mtimeMs}`
}

/** The hour of `at` in `timeZone` as `YYYY-MM-DDTHH`. `timeZone` is a name Intl knows (the host's own zone). */
function hourOf(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' }).formatToParts(at)
  const part = (type: string): string => parts.find(candidate => candidate.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}`
}

/** `loops.waiting-on-human`: the threshold and the hour of the check, in the host's time zone; an hour without a newly crossed item produces no event. */
export function waitingOnHumanKey(olderThanHours: number, at: Date, timeZone: string): string {
  return `waiting-on-human:${olderThanHours}:${hourOf(at, timeZone)}`
}
