/**
 * The GLM channel's default loop-board entries (docs/ORCHESTRATION.md §11.4,
 * docs/DESIGN.md §2.2), as data for the pricing service's `loopDefaults`
 * member. The loop board lists them and runs the two marked `loop-board`;
 * the two marked `channel` are done by this package and only listed. The
 * entries are read-only defaults: a person who wants other thresholds adds an
 * entry of their own. The text for people uses plain words and does not name
 * the peak hours, which only `peakHours` states; `tell` is the English notice
 * the loop board gives the main agent, with `{line}` replaced by the one-line
 * quota or login wording of src/shared/quota.ts.
 */
import type { ChannelLoopDefault } from '../shared/channel-loop.ts'

const entries: readonly ChannelLoopDefault[] = [
  {
    id: 'glm:peak-reminder',
    title: 'GLM 高峰开始时提醒模型',
    why: '高峰时段里 GLM 按全价算积分，其余时段半价。每段高峰里，GLM 会话的第一步会收到一句提醒，说法跟着你选的高峰档位走。这一条由 GLM 通道包自己做，不装编排层也照常。',
    when: { kind: 'peak-start' },
    runBy: 'channel',
  },
  {
    id: 'glm:quota-on-command',
    title: '看状态时读一次 GLM 额度',
    why: '你敲 /glm-status 或 /hourness 时，向服务端读一次额度，60 秒内不重复读。这一条由 GLM 通道包自己做。',
    when: { kind: 'command', names: ['glm-status', 'hourness'] },
    runBy: 'channel',
  },
  {
    id: 'glm:quota-low',
    title: 'GLM 额度快用完时告诉你',
    why: '5 小时或每周额度用到 80%，或照现在的速度一小时内会用完时，主 Agent 在下一次回话里告诉你一句。每个额度周期只说一次。只在 GLM 有新用量、上次读数满 15 分钟时才去读额度。',
    when: { kind: 'quota-low', usedPercent: 80, exhaustsWithinMinutes: 60, afterUsageMinutes: 15 },
    runBy: 'loop-board',
    tell: '[GLM] Quota running low. Tell the human this line in your next reply: "{line}". Do not switch models or plans because of it unless the human asks.',
  },
  {
    id: 'glm:login-rejected',
    title: 'GLM 登录失效时提醒你重新登录',
    why: 'GLM 的登录被服务端拒绝后，GLM 的请求都会失败。主 Agent 在下一次回话里告诉你运行 /glm-login。',
    when: { kind: 'login-rejected' },
    runBy: 'loop-board',
    tell: '[GLM] The GLM login was rejected; GLM requests fail until the human signs in again. Tell the human this line in your next reply: "{line}".',
  },
]

/** Freeze an entry and what it holds, so a reader cannot change the defaults. */
function frozen(entry: ChannelLoopDefault): ChannelLoopDefault {
  if (entry.when.kind === 'command') Object.freeze(entry.when.names)
  Object.freeze(entry.when)
  return Object.freeze(entry)
}

export const GLM_LOOP_DEFAULTS: readonly ChannelLoopDefault[] = Object.freeze(entries.map(frozen))
