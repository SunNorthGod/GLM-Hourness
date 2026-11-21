/**
 * The endurance mapping and wording of the quota reminders (docs/
 * ORCHESTRATION.md §18.7, §18.9): the one place that turns the usage
 * journal's records into the `QuotaUsageFact`s the shared judgment reads,
 * and the judgment's kinds into the lines a person reads on the loop board,
 * in the morning report and in the channel's exhausts event. The judgment
 * itself is shared/quota.ts's `quotaRateOf` and `quotaEnduranceOf`: this file
 * imports them and words what they answer, and derives no rate and no
 * threshold of its own — the window's length and the rule's two percents are
 * the sizes this file fixes for every reader, so the board, the report and
 * the machine-level runner judge alike.
 *
 * Pure; no Node built-in is imported, so both packages and the page can use
 * the file. The usage record's shape is written out here instead of taken
 * from the audit foundation (a runtime module), the same practice view.ts
 * follows for the shapes it reads; the fields are the usage journal's
 * `TokenUsage` vocabulary (src/shared/lm-min.ts): input counts the main
 * input only, cache reads and writes bill into no sum here.
 */
import { quotaEnduranceOf, quotaRateOf, formatMoment, type MomentZone, type QuotaEndurance, type QuotaEnduranceRule, type QuotaUsageFact, type QuotaWindowName, type QuotaWindowView } from '../shared/quota.ts'
import { isGlmModel } from '../shared/route.ts'

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

/** 撑不到与用得太少的界（task-7 设计定值；tests/quota.spec.ts 的 ENDURANCE 同例）。 */
export const QUOTA_ENDURANCE_RULE: QuotaEnduranceRule = { exhaustPercent: 100, lightPercent: 50 }

/** The windows the judgment runs for: the length its rate averages over, and the speed's name in the wording. */
export const WINDOW_LENGTHS: Readonly<Record<'five-hour' | 'weekly', { readonly lengthMs: number, readonly speed: string }>> = {
  'five-hour': { lengthMs: 5 * HOUR_MS, speed: '5 小时' },
  weekly: { lengthMs: 7 * DAY_MS, speed: '7 天' },
}

/** The length and speed of a window the judgment runs for; undefined for the ones it does not (the MCP window and the unnamed ones). */
function lengthOf(name: QuotaWindowName): { readonly lengthMs: number, readonly speed: string } | undefined {
  if (name === 'five-hour') return WINDOW_LENGTHS['five-hour']
  if (name === 'weekly') return WINDOW_LENGTHS.weekly
  return undefined
}

/** One line of the usage journal (src/memory/audit.ts `UsageRecord`), as the mapping reads it; the shape is this file's own for purity. */
interface UsageLine {
  readonly at?: unknown
  readonly model?: unknown
  readonly usage?: { readonly inputTokens?: unknown, readonly outputTokens?: unknown }
}

const count = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? value : 0

/**
 * The facts of a usage journal's text: one per GLM record with a time and
 * the tokens it bills (`inputTokens` for the input, `outputTokens` when the
 * record has them; cache reads and writes count toward no sum). A line that
 * is not a record, names a model of another family, carries no readable time
 * or finished after `now` is skipped: the judgment reads what happened up to
 * now, and a record without a count maps to input 0, which `quotaRateOf`
 * counts toward no sum.
 */
export function quotaUsageFactsOfText(text: string, now: number): QuotaUsageFact[] {
  const facts: QuotaUsageFact[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    let value: unknown
    try {
      value = JSON.parse(trimmed)
    }
    catch {
      continue
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
    const record = value as UsageLine
    if (!isGlmModel(record.model)) continue
    const at = typeof record.at === 'string' ? Date.parse(record.at) : Number.NaN
    if (!Number.isFinite(at) || at > now) continue
    const input = count(record.usage?.inputTokens)
    const output = count(record.usage?.outputTokens)
    facts.push({ at, input, ...(output === 0 ? {} : { output }) })
  }
  return facts
}

/**
 * The endurance of one window against its reset, at the average rate over
 * the window's length (shared/quota.ts): 撑不到, 用得太少, 撑得到 or 待数据.
 * A window the judgment does not run for is 待数据 (读数不足), as is one the
 * shared judgment cannot project.
 */
export function windowEnduranceOf(window: QuotaWindowView, facts: readonly QuotaUsageFact[], now: number): QuotaEndurance {
  const length = lengthOf(window.name)
  if (length === undefined) return { kind: 'pending', reason: '读数不足' }
  return quotaEnduranceOf(quotaRateOf(window, facts, now, length.lengthMs), window, now, QUOTA_ENDURANCE_RULE)
}

const percentWords = (value: number): string => `${Math.round(value)}%`

/** The line of one window's judgment; undefined for 撑得到, which says nothing (the reading's own lines carry the shares). */
function enduranceLine(window: QuotaWindowView, end: QuotaEndurance, speed: string, now: number, zone: MomentZone | undefined): string | undefined {
  const share = `已用 ${percentWords(window.usedPercent ?? 0)}`
  const reset = `到 ${formatMoment(window.resetAt ?? now, now, zone)} 重置`
  switch (end.kind) {
    case 'exhausts': return `${window.label}额度撑不到重置，${share}，${reset}，照 ${speed}平均速度预计到时约 ${percentWords(end.percentAtReset)}`
    case 'light': return `${window.label}额度用得太少，${share}，${reset}，照 ${speed}平均速度预计到时约 ${percentWords(end.percentAtReset)}`
    case 'pending': return `${window.label}额度判定待数据：${end.reason}`
    case 'lasts': return undefined
  }
}

/**
 * The judgment as lines, in the windows' order: one line per window the
 * judgment runs for that is 撑不到, 用得太少 or 待数据; 撑得到 says nothing.
 * The exhausts line of a single window is the wording the machine-level
 * runner puts in its `channel.quota-exhausts` event, so the board, the
 * report and the main agent's notice read the same sentence.
 */
export function quotaEnduranceLines(windows: readonly QuotaWindowView[], facts: readonly QuotaUsageFact[], now: number, zone?: MomentZone): string[] {
  const lines: string[] = []
  for (const window of windows) {
    const length = lengthOf(window.name)
    if (length === undefined) continue
    const line = enduranceLine(window, windowEnduranceOf(window, facts, now), length.speed, now, zone)
    if (line !== undefined) lines.push(line)
  }
  return lines
}
