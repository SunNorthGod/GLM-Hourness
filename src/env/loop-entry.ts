/**
 * What the env row hands the loop board (M4 design §6.8, `d-rules-visible`):
 * the event `env.files-edited` ("an agent changed files"), which a person's
 * entries on the board hear (design §6.2; the row emits it after each step
 * that changed files, edited.ts). The row's own entry for M4's checker,
 * `env.checks-after-edit`, joins with the checker (checks-plan B4); until then
 * the hand-over has the event and no entry.
 */
import type { Contribution, ContributionSource, LoopEventDeclaration } from '../loops/service.ts'

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

/** The env row's whole hand-over. */
export function envContribution(): Contribution {
  return { events: [FILES_EDITED_EVENT], entries: [] }
}
