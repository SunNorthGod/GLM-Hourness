/**
 * The channel events (docs/ORCHESTRATION.md §18.5; loop board design 0.6 §4.3):
 * facts a channel gives through the pricing service. The loop row puts them out
 * and declares them without knowing any one channel; with no pricing service
 * none of them is in the event table, so an entry that waits for one is listed
 * greyed (src/loops/registry.ts).
 *
 * Built here: `channel.peak-changed`, which every project needs and which the
 * project's runner derives from the pricing service's own peak reading
 * (`peak`, `nextPeakChange` in src/shared/pricing.ts). The two account-level
 * events (`channel.quota-low`, `channel.login-rejected`) come with the
 * machine-level runner and the channel package's quota reading, which are not
 * built yet (design §16 S7); their declarations arrive with it.
 *
 * Pure; no Node built-in.
 */
import type { LoopEventDeclaration } from './trigger.ts'

export const CHANNEL_PEAK_CHANGED = 'channel.peak-changed'

/** The declaration of `channel.peak-changed`: in the event table only while the pricing service is there. */
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
