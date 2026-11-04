/**
 * What the env row hands the loop board (M4 design §6.8, `d-rules-visible`):
 * the event `env.files-edited` ("an agent changed files"), which a person's
 * entries on the board hear (design §6.2; the row emits it after each step
 * that changed files, edited.ts), and the row's own entry for M4's checker,
 * `env.checks-after-edit`: a `self` entry the board lists and the row runs
 * (runner.ts), with the checker's five own rules built from the constants
 * and, when opened, two lines per check from the row's memory.
 */
import type { LoopEntryDefinition } from '../loops/model.ts'
import type { Contribution, ContributionSource, LoopEventDeclaration } from '../loops/service.ts'
import { CHECK_FAILURE_LIMIT, CHECK_SLOTS, MISSING_CHECK_NOTICES } from './runner.ts'
import { CHECK_QUEUE_WAIT_MS, CHECK_STEP_DEADLINE_MS, CHECK_TIMEOUT_CAP_MS, CHECK_TIMEOUT_FACTOR, CHECK_TIMEOUT_FLOOR_MS } from './timeout.ts'

/** The source line of the env row's hand-over (design §6.8's table). */
export const ENV_ROW_SOURCE: ContributionSource = { plugin: 'dsh-hourness', row: 'glm-hourness/env' }

/** The event of changed files: the files relative to the checkout root, the root, whether the list was cut (design §6.2, §6.8). */
export const FILES_EDITED_EVENT: LoopEventDeclaration = {
  id: 'env.files-edited',
  title: '一个 agent 改了文件',
  fields: [
    { name: 'files', type: 'strings', title: '改到的文件', filter: 'paths' },
    { name: 'root', type: 'string', title: '所在的检出' },
    { name: 'truncated', type: 'boolean', title: '文件太多被截了', filter: 'is' },
  ],
  personSelectable: true,
}

/** The id of the checker's entry on the board; the row reports every delivery of results under it. */
export const CHECKS_ENTRY_ID = 'env.checks-after-edit'

const s = (ms: number): number => ms / 1000

/** The checker's own rules as the board lists them (design §6.8), every number from its constant. */
export function checksOwnRules(): readonly string[] {
  return [
    `一步最多等这一步所有检查超时里最长的那个，不超过 ${s(CHECK_STEP_DEADLINE_MS)} 秒，跑得慢的在之后的步里送到`,
    `每项检查的超时由系统按最近几次的实际耗时定：最慢一次的 ${CHECK_TIMEOUT_FACTOR} 倍，不低于 ${s(CHECK_TIMEOUT_FLOOR_MS)} 秒、不超过 ${s(CHECK_TIMEOUT_CAP_MS)} 秒；超时算没跑完，下一次改动照常再跑`,
    `跑不起来或输出读不懂连续 ${CHECK_FAILURE_LIMIT} 次后，这个会话不再跑那一项`,
    `改了没有检查覆盖的语言的文件时，每个会话每种语言提醒 ${MISSING_CHECK_NOTICES} 次`,
    `同时最多跑 ${CHECK_SLOTS} 项检查；排队超过 ${s(CHECK_QUEUE_WAIT_MS)} 秒的这一次不跑，下一次改动再查`,
  ]
}

/** The checker's entry: it waits for changed files and the row does it itself. */
function checksEntry(): LoopEntryDefinition {
  return {
    id: CHECKS_ENTRY_ID,
    title: '改完文件就跑检查',
    why: '改完文件马上知道有没有新问题',
    when: { kind: 'event', events: [FILES_EDITED_EVENT.id] },
    action: { kind: 'self', does: '跑这个项目里批过的检查，结果在那个 agent 的下一步交给它', by: 'glm-hourness/env' },
    ownRules: checksOwnRules(),
  }
}

/** The env row's whole hand-over; `details` gives the opened entry's lines for one project (the checker's memory). */
export function envContribution(details?: (project: string) => readonly string[]): Contribution {
  return {
    events: [FILES_EDITED_EVENT],
    entries: [checksEntry()],
    ...(details === undefined ? {} : { details: (entry: string, project: string) => entry === CHECKS_ENTRY_ID ? details(project) : [] }),
  }
}
