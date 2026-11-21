/**
 * The channel events and the channel's entries (docs/ORCHESTRATION.md §18.5;
 * loop board design 0.6 §3.4, §4.3): facts a channel gives through the pricing
 * service, and the default entries it puts in the service's `loopDefaults`. The
 * loop row puts the events out and declares them without knowing any one
 * channel; with no pricing service none of them is in the event table and the
 * channel has no entry on the board.
 *
 * - `channel.peak-changed`, which every project needs: each project's runner
 *   derives it from the pricing service's own peak reading (`peak`,
 *   `nextPeakChange` in src/shared/pricing.ts) and writes it into its own inbox.
 * - `channel.quota-low`, `channel.quota-reset` and `channel.login-rejected`,
 *   which are the account's: the machine-level runner derives them once for the
 *   whole machine and writes them into the inbox of the project the main agent
 *   last worked in (design §6.1, §6.4; machine.ts). The reset names a window
 *   whose reset instant the last reading showed and that has now passed; the
 *   runner tells each period once.
 * - `channel.quota-exhausts`, also the account's and judged by the same
 *   runner: a five-hour or weekly window whose average pace since the window
 *   began puts it past the whole share before the reset (quota-endurance.ts,
 *   judged on shared/quota.ts). It is the high-risk one of the reminders and
 *   the only one besides the low quota that says the pace.
 *
 * `channelEntries` is the one place the channel's `ChannelLoopDefault` items
 * (src/shared/channel-loop.ts) become entries of the board (design §3.4): the
 * channel package does not import the orchestration package, so it hands no
 * contribution over and the board reads its data instead. The pricing
 * service's `quota` member brings three more machine-level entries of the
 * channel's own (the two resets and the exhausts notice, one below); they are
 * not in `loopDefaults`, since they exist only where the quota can be read.
 *
 * Pure; no Node built-in.
 */
import { loopDefaultsOf, type ChannelLoopDefault } from '../shared/channel-loop.ts'
import { quotaOf, type UsagePricing } from '../shared/pricing.ts'
import type { Action, LoopEntryDefinition } from './model.ts'
import type { LoopEventDeclaration, LoopEventField } from './trigger.ts'

/** The fields the two pace events share: which quota, how much of it is used, when it resets, and the line for a person. */
const QUOTA_FIELDS: readonly LoopEventField[] = [
  { name: 'window', type: 'string', title: '哪一个额度' },
  { name: 'usedPercent', type: 'number', title: '已用的比例' },
  { name: 'resetAt', type: 'string', title: '几时重置' },
  { name: 'line', type: 'string', title: '说给人的一句' },
]

export const CHANNEL_PEAK_CHANGED = 'channel.peak-changed'
export const CHANNEL_QUOTA_LOW = 'channel.quota-low'
export const CHANNEL_QUOTA_RESET = 'channel.quota-reset'
export const CHANNEL_QUOTA_EXHAUSTS = 'channel.quota-exhausts'
export const CHANNEL_LOGIN_REJECTED = 'channel.login-rejected'

/** The package and row the channel's entries come from: the glm-login row provides the pricing service (design §3.4). */
export const CHANNEL_SOURCE = { plugin: 'dsh-glm-zcode', row: 'glm-hourness/glm-login' } as const

/** The channel events: in the event table only while the pricing service is there. A person picks none of them for an entry of their own. */
export const CHANNEL_EVENTS: readonly LoopEventDeclaration[] = [
  {
    id: CHANNEL_PEAK_CHANGED,
    title: 'GLM 高峰开始或结束',
    fields: [
      { name: 'edge', type: 'string', title: '开始还是结束', filter: 'in' },
      { name: 'boundary', type: 'string', title: '这一次边界的时刻' },
      { name: 'until', type: 'string', title: '这一段到几时' },
    ],
    // How a peak is handled is chosen on the rules board, so a person does not pick this event for an entry of their own.
    personSelectable: false,
  },
  {
    id: CHANNEL_QUOTA_LOW,
    title: '额度快用完了',
    fields: QUOTA_FIELDS,
    params: [
      { name: 'usedPercent', type: 'number', title: '用到几成', required: true, min: 1, max: 100 },
      { name: 'exhaustsWithinMinutes', type: 'number', title: '几分钟内会用完', required: true, min: 1, max: 1440 },
      { name: 'afterUsageMinutes', type: 'number', title: '上次读数后几分钟', required: true, min: 1, max: 1440 },
    ],
    // The account's quota is said by the channel's own entry, once for the machine.
    personSelectable: false,
  },
  {
    id: CHANNEL_QUOTA_RESET,
    title: 'GLM 额度到点重置了',
    fields: [
      { name: 'window', type: 'string', title: '哪一个额度', filter: 'in' },
      { name: 'resetAt', type: 'string', title: '这一次重置的时刻' },
      { name: 'line', type: 'string', title: '说给人的一句' },
    ],
    // The reset is said by the channel's own entry, once for the machine and once for a period.
    personSelectable: false,
  },
  {
    id: CHANNEL_QUOTA_EXHAUSTS,
    title: 'GLM 额度撑不到重置',
    fields: QUOTA_FIELDS,
    // The account's pace is said by the channel's own entry, once for the machine.
    personSelectable: false,
  },
  {
    id: CHANNEL_LOGIN_REJECTED,
    title: '通道的登录被拒了',
    fields: [
      { name: 'since', type: 'string', title: '几时被拒的' },
      { name: 'path', type: 'string', title: '在哪一步被拒' },
      { name: 'line', type: 'string', title: '说给人的一句' },
    ],
    personSelectable: false,
  },
]

/**
 * `channel.peak-changed`: the edge and the boundary instant. Every project
 * computes the same boundary from the same pricing service, so a project whose
 * runner starts late and the one that was running produce the same key for the
 * same change, and the change runs once.
 */
export function peakChangedKey(edge: 'start' | 'end', boundary: string): string {
  return `peak-changed:${edge}:${boundary}`
}

/** `channel.quota-low`: the window and its period (the first reset instant told for it, or the hour of the reading when there is none). */
export function quotaLowKey(window: string, period: string): string {
  return `quota-low:${window}:${period}`
}

/** `channel.quota-reset`: the window and its period, the reset instant the reading named; one line for one period. */
export function quotaResetKey(window: string, period: string): string {
  return `quota-reset:${window}:${period}`
}

/** `channel.quota-exhausts`: the window and its period; one notice for one window in one period. */
export function quotaExhaustsKey(window: string, period: string): string {
  return `quota-exhausts:${window}:${period}`
}

/** `channel.login-rejected`: where the login was rejected (`glm` when the channel does not say) and since when; one key for one rejection. */
export function loginRejectedKey(path: string, since: string): string {
  return `login-rejected:${path === '' ? 'glm' : path}:${since}`
}

/** A `self` entry: the channel package does it, the board lists it. */
const channelDoes = (item: ChannelLoopDefault): Action => ({ kind: 'self', does: item.title, by: CHANNEL_SOURCE.plugin })

/** The entry one channel item becomes (design §3.4 table), or why it cannot become one. */
function entryOf(item: ChannelLoopDefault): LoopEntryDefinition | string {
  const base = { id: item.id, title: item.title, why: item.why }
  const when = item.when
  switch (when.kind) {
    case 'peak-start':
      if (item.runBy !== 'channel') return 'peak-start 只由通道包自己做'
      return { ...base, when: { kind: 'event', events: [CHANNEL_PEAK_CHANGED] }, filter: { edge: { in: ['start'] } }, action: channelDoes(item) }
    case 'command':
      if (item.runBy !== 'channel') return 'command 只由通道包自己做'
      return { ...base, when: { kind: 'command', names: [...when.names] }, action: channelDoes(item) }
    case 'quota-low':
      if (item.runBy !== 'loop-board' || item.tell === undefined) return 'quota-low 由循环板执行，要带 tell'
      return {
        ...base,
        when: { kind: 'event', events: [CHANNEL_QUOTA_LOW], params: { usedPercent: when.usedPercent, exhaustsWithinMinutes: when.exhaustsWithinMinutes, afterUsageMinutes: when.afterUsageMinutes } },
        action: { kind: 'tell-main', text: item.tell, wake: false },
        scope: 'machine',
      }
    case 'login-rejected':
      if (item.runBy !== 'loop-board' || item.tell === undefined) return 'login-rejected 由循环板执行，要带 tell'
      return { ...base, when: { kind: 'event', events: [CHANNEL_LOGIN_REJECTED] }, action: { kind: 'tell-main', text: item.tell, wake: false }, scope: 'machine' }
  }
}

/**
 * The channel's three quota reminders the machine-level runner judges
 * (machine.ts): the reset of each window the quota can read and the
 * exhausts notice. They are not `loopDefaults` — they exist only where the
 * pricing service can read the quota — and the board lists them from the
 * same read as the rest of the channel's entries. `{line}` is filled with
 * the one-line wording of src/shared/quota.ts and src/loops/quota-endurance.ts.
 */
const QUOTA_MACHINE_ENTRIES: readonly LoopEntryDefinition[] = [
  {
    id: 'glm:quota-reset-five-hour',
    title: '5 小时额度重置时告诉你',
    why: '5 小时额度到点重置后，主 Agent 在下一次回话里告诉你一句，好安排新的用量。每个额度周期只说一次。',
    when: { kind: 'event', events: [CHANNEL_QUOTA_RESET] },
    filter: { window: { in: ['five-hour'] } },
    action: { kind: 'tell-main', text: '[GLM] The five-hour quota window has reset. Tell the human this line in your next reply: "{line}".', wake: false },
    scope: 'machine',
  },
  {
    id: 'glm:quota-reset-weekly',
    title: '每周额度重置时告诉你',
    why: '每周额度到点重置后，主 Agent 在下一次回话里告诉你一句。每个额度周期只说一次。',
    when: { kind: 'event', events: [CHANNEL_QUOTA_RESET] },
    filter: { window: { in: ['weekly'] } },
    action: { kind: 'tell-main', text: '[GLM] The weekly quota window has reset. Tell the human this line in your next reply: "{line}".', wake: false },
    scope: 'machine',
  },
  {
    id: 'glm:quota-exhausts',
    title: 'GLM 额度撑不到重置时告诉你',
    why: '照最近用量的平均速度，5 小时或每周额度会在重置前用完时，主 Agent 在下一次回话里告诉你一句。每个额度窗口的每个周期只说一次。',
    when: { kind: 'event', events: [CHANNEL_QUOTA_EXHAUSTS] },
    action: { kind: 'tell-main', text: '[GLM] The quota is on pace to run out before it resets. Tell the human this line in your next reply: "{line}". Do not switch models or plans because of it unless the human asks.', wake: false },
    scope: 'machine',
  },
]

/**
 * The channel's default entries as entries of the board, in the channel's
 * order, followed by the three quota reminders while the pricing service can
 * read the quota. An item whose `runBy` does not go with its `when` (the
 * channel doing a quota-low itself, the board running a peak-start) is
 * dropped and told to `problem` once per call; `loopDefaultsOf` has already
 * dropped and told what breaks the contract's own rules. The board checks
 * the entries again as it checks any plugin's (registry.ts).
 */
export function channelEntries(pricing: UsagePricing, problem?: (message: string) => void): readonly LoopEntryDefinition[] {
  const mapped = loopDefaultsOf(pricing, problem).flatMap((item) => {
    const entry = entryOf(item)
    if (typeof entry !== 'string') return [entry]
    problem?.(`${CHANNEL_SOURCE.plugin} 的 ${CHANNEL_SOURCE.row} 交来的 ${item.id} 读不懂：${entry}`)
    return []
  })
  return quotaOf(pricing) === undefined ? mapped : [...mapped, ...QUOTA_MACHINE_ENTRIES]
}
