/**
 * The status hub's item contract (status hub design 0.3 §2, §8): one status
 * entry a module computes once, with who submitted it, who may read it, when
 * it was true, where it came from, its one human line and its optional
 * detail — the panel, the reports and the main agent's tool all display this
 * one entry instead of recomputing it.
 *
 * Client-safe (status hub design 0.3 §2, the same rule the metrics board's
 * shared file follows): pure data and pure functions, no Node built-in is
 * imported, so both packages and the client can use the file. The host-side
 * registration and collection live apart (src/shared/status-host.ts,
 * src/report/status.ts) so nothing here pulls ProvideHost into a client
 * build. A module owns the words of its items
 * (`text`, `detail`); the hub owns the layout — where an entry shows, in
 * what order, filtered by which audience, and how staleness and absence are
 * worded.
 */

/** Who may read an entry: `person` only shows on faces, `agent` may also reach the model. */
export type StatusAudience = 'person' | 'agent'

/** The longest `text` (and each `detail` line) in code points. */
export const STATUS_TEXT_MAX = 200

export interface StatusItem {
  /** Stable id, `<owner>/<name>`, e.g. `glm/usage`, `rules/peak`, `metrics/load`. */
  readonly id: string
  /** The module or board that submitted it (a row-health row, or a board id); it owns the words below. */
  readonly owner: string
  /** Who may read it: `person` only shows on faces; `agent` may also reach the model. */
  readonly audience: StatusAudience
  /** When this was true, an ISO instant (`Date.parse` yields a finite number). */
  readonly asOf: string
  /** Where it came from — a journal path with a key, a projection name, a node id. For tracing, never shown on a face. */
  readonly source: string
  /** The one human line, through the plain-words check, one line, at most STATUS_TEXT_MAX code points. */
  readonly text: string
  /** Optional structured fields for machine views and cross-checks; no secrets and no command text (the metrics journal's privacy rule). */
  readonly fields?: Readonly<Record<string, string | number | boolean>>
  /** Optional detail lines (the body of a section-type entry, e.g. the usage list), each already human words, one line. */
  readonly detail?: readonly string[]
  /** How long until it counts as stale, in milliseconds; absent means never. */
  readonly staleAfterMs?: number
}

/** Whether `item` is stale at `nowMs`: its age exceeds `staleAfterMs`, when it has one. */
export function isStale(item: StatusItem, nowMs: number): boolean {
  if (item.staleAfterMs === undefined) return false
  const at = Date.parse(item.asOf)
  return Number.isFinite(at) && nowMs - at > item.staleAfterMs
}

/** The check's answer: a kept item (normalized, with the cleaning notes) or the reason a whole item was dropped. */
export type StatusItemChecked =
  | { readonly ok: true, readonly item: StatusItem, readonly warnings: readonly string[] }
  | { readonly ok: false, readonly reason: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const oneLine = (value: string): boolean => !value.includes('\n') && !value.includes('\r')

/** The code points of a string, so an astral character counts as one. */
const codePoints = (value: string): number => [...value].length

/**
 * One entry of outside input against the table of the design's §8. A whole
 * item drops (with the reason) when a required field is missing or wrong —
 * a wrong `audience` drops too and never defaults, because an entry meant
 * for the person that reaches the model is an irreversible disclosure, while
 * a dropped one only leaves a gap the other sources still fill. Optional
 * fields are cleaned, not dropped over: `fields` of a non-object reads as
 * none, keys of another value type are dropped, over-long `detail` lines are
 * cut, an unusable `staleAfterMs` reads as never stale — each cleaning is a
 * warning the caller reports.
 */
export function validateStatusItem(value: unknown): StatusItemChecked {
  if (!isRecord(value)) return { ok: false, reason: '不是对象' }
  const warnings: string[] = []
  const { id, owner, audience, asOf, source, text } = value
  if (typeof id !== 'string' || !/^[^/]+\/[^/]+$/.test(id)) return { ok: false, reason: `id 不是「<owner>/<name>」形状：${describe(id)}` }
  if (typeof owner !== 'string' || owner.trim().length === 0) return { ok: false, reason: `owner 为空：${id}` }
  if (audience !== 'person' && audience !== 'agent') return { ok: false, reason: `audience 不是 person 或 agent：${id}` }
  if (typeof asOf !== 'string' || !Number.isFinite(Date.parse(asOf))) return { ok: false, reason: `asOf 不是可解析的时刻：${id}` }
  if (typeof source !== 'string' || source.trim().length === 0) return { ok: false, reason: `source 为空：${id}` }
  if (typeof text !== 'string' || !oneLine(text) || text.trim().length === 0 || codePoints(text) > STATUS_TEXT_MAX) {
    return { ok: false, reason: `text 为空、跨行或超过 ${STATUS_TEXT_MAX} 个码点：${id}` }
  }
  let fields: Readonly<Record<string, string | number | boolean>> | undefined
  const rawFields = value.fields
  if (rawFields !== undefined) {
    if (isRecord(rawFields)) {
      const kept: Record<string, string | number | boolean> = {}
      for (const [key, entry] of Object.entries(rawFields)) {
        if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') kept[key] = entry
        else warnings.push(`${id} 的 fields.${key} 不是 string/number/boolean，已丢弃`)
      }
      fields = kept
    }
    else warnings.push(`${id} 的 fields 不是对象，当作没有`)
  }
  let detail: readonly string[] | undefined
  const rawDetail = value.detail
  if (rawDetail !== undefined) {
    if (Array.isArray(rawDetail) && rawDetail.every(line => typeof line === 'string')) {
      detail = rawDetail.map(line => {
        const cut = [...line].slice(0, STATUS_TEXT_MAX).join('')
        if (cut !== line) warnings.push(`${id} 的一条明细超过 ${STATUS_TEXT_MAX} 个码点，已截断`)
        return cut
      })
    }
    else warnings.push(`${id} 的 detail 不是字符串数组，当作没有`)
  }
  let staleAfterMs: number | undefined
  const rawStale = value.staleAfterMs
  if (rawStale !== undefined) {
    if (typeof rawStale === 'number' && Number.isFinite(rawStale) && rawStale > 0) staleAfterMs = rawStale
    else warnings.push(`${id} 的 staleAfterMs 不是正有限数，当作不陈旧`)
  }
  return {
    ok: true,
    item: {
      id,
      owner,
      audience,
      asOf,
      source,
      text,
      ...(fields === undefined ? {} : { fields }),
      ...(detail === undefined ? {} : { detail }),
      ...(staleAfterMs === undefined ? {} : { staleAfterMs }),
    },
    warnings,
  }
}

/** The words a drop reason names a field value with: the JSON text of short values, the type of the rest. */
function describe(value: unknown): string {
  if (typeof value === 'string') return value.length <= 40 ? value : `${value.slice(0, 40)}…`
  return typeof value
}
