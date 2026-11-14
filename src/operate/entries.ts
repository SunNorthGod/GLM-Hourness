/**
 * What the operate row hands the loop board (M7 design 0.6 §3.11.1): the
 * two time entries of the reports — `operate.morning`, every day at 08:30,
 * and `operate.weekly`, every Monday at 09:00 — whose `tell-main` texts name
 * `hourness_report` as the way to read the report and `propose_to_human` as
 * the way to put what waits for the person. The board's DSH timers trigger
 * them and deliver to the holder session (loop board design 0.6 §6.2); the
 * row runs nothing itself. No time zone is set: the host's own zone. No
 * limits: a daily and a weekly beat need no debounce. The patrol entry and
 * its `hourness_report {kind: 'patrol'}` arrive with the patrol lane (m7-7).
 */
import type { LoopEntryDefinition } from '../loops/model.ts'

/** The source line of the row's hand-over. */
export const OPERATE_ROW_SOURCE = { plugin: 'dsh-hourness', row: 'glm-hourness/operate' } as const

const MORNING_ID = 'operate.morning'
const WEEKLY_ID = 'operate.weekly'

/** The two time entries, worded as the design's table has them. */
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
]
