/**
 * What the operate row hands the loop board (M7 design 0.6 §3.11.1): the
 * three time entries of the reports — `operate.morning`, every day at
 * 08:30, `operate.weekly`, every Monday at 09:00, and `operate.patrol`,
 * every day at 02:30 — whose `tell-main` texts name `hourness_report` as
 * the way to read the report and `propose_to_human` as the way to put what
 * waits for the person. The board's DSH timers trigger them and deliver to
 * the holder session (loop board design 0.6 §6.2); the row runs nothing
 * itself. No time zone is set: the host's own zone. No limits: a daily, a
 * weekly and a nightly beat need no debounce.
 */
import type { LoopEntryDefinition } from '../loops/model.ts'

/** The source line of the row's hand-over. */
export const OPERATE_ROW_SOURCE = { plugin: 'dsh-hourness', row: 'glm-hourness/operate' } as const

const MORNING_ID = 'operate.morning'
const WEEKLY_ID = 'operate.weekly'
const PATROL_ID = 'operate.patrol'

/** The three time entries, worded as the design's table has them. */
export const OPERATE_ENTRIES: readonly LoopEntryDefinition[] = [
  {
    id: MORNING_ID,
    title: '晨报',
    why: '每天早上把目标、进展、花费和等你回话的事讲给你听',
    when: { kind: 'daily', time: '08:30' },
    action: {
      kind: 'tell-main',
      wake: true,
      text: 'Scheduled morning report (hourness). Call hourness_report with kind "morning" and reply with its text unchanged. Then put at most three matters that wait for the person to them with propose_to_human.',
    },
  },
  {
    id: WEEKLY_ID,
    title: '周报',
    why: '每周数一数你被问了几次、返工多少，并提议规矩该怎么调',
    when: { kind: 'weekly', time: '09:00', weekdays: [1] },
    action: {
      kind: 'tell-main',
      wake: true,
      text: 'Scheduled weekly report (hourness). Call hourness_report with kind "weekly" and reply with its text unchanged. Put its proposals (at most three) to the person with propose_to_human, one plan each.',
    },
  },
  {
    id: PATROL_ID,
    title: '夜间巡检',
    why: '夜里查一遍工作目录、分支、主干和项目图乱没乱，并把主干完整检查一遍',
    when: { kind: 'daily', time: '02:30' },
    action: {
      kind: 'tell-main',
      wake: true,
      text: 'Scheduled patrol (hourness). Call hourness_report with kind "patrol". For each finding that is planned work, act on it or dispatch it; keep matters for the person for your next batch. Do not write files.',
    },
  },
]
