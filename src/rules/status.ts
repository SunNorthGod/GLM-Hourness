/**
 * The rules row's status entries (status hub design 0.3 §3.1, §4.2, §12
 * rules row): the one `rules/peak` entry, whose text is the peak-hours line
 * the 面板 section shows (peakStatusItems, the same words /hourness prints
 * from the pricing service) and whose fields carry the project's peak mode
 * level and its origin — the board's half of the entry. The peak-hours
 * computation stays the pricing service's (M6's); the level is this board's
 * own state. This module is the one source of the entry: the row's status
 * view serves it to the collector (src/report/status.ts), and the rules
 * board's page, when that board lands, fills its items from the same
 * function. Without a readable peak clock there is no entry, exactly as the
 * 面板 has no line; the level alone is not worded here — that wording is the
 * rules board design's.
 */
import { peakStatusItems } from '../report/panel.ts'
import type { UsagePricing } from '../shared/pricing.ts'
import type { MomentZone } from '../shared/quota.ts'
import type { StatusItem } from '../shared/status.ts'
import { stateOf, type PeakReading, type ProjectView } from './peak.ts'

/**
 * The entry: the hours line, with the level and its origin in the fields
 * when the project's rules state is readable. No entry when the peak clock
 * cannot be read (no pricing service, or `peak` failing) — the same absence
 * the hourness row's half-entry would have.
 */
export function rulesStatusItems(view: ProjectView | undefined, reading: PeakReading, pricing: UsagePricing, nowMs: number, zone?: MomentZone): readonly StatusItem[] {
  const [hours] = peakStatusItems(pricing, nowMs, zone)
  if (hours === undefined) return []
  if (view === undefined) return [hours]
  const mode = stateOf(view.read, reading)
  return [{ ...hours, fields: { ...hours.fields, peakMode: mode.level, peakModeOrigin: mode.origin } }]
}
