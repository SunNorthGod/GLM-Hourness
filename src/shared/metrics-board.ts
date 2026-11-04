/**
 * The metrics board's data shape (metrics design §7.6.2) and its validator,
 * shared by the host that computes and writes `view.json`
 * (src/metrics/index.ts) and the client page that reads it
 * (ui/src/metrics/): no Node built-ins here, so the client bundle runs it
 * too. The validator throws a TypeError naming the first offending field;
 * the caller turns that into 「指标板读不出：<原因>」.
 */

/** One board line: the label, the two windows' values (already formatted, sample counts composed in), the machine-readable denominators. */
export interface MetricsBoardRow {
  /** Plain words, at most 40 code points; a model name or rule id only as the second half. */
  readonly label: string
  /** Formatted `[current, previous]`; a ratio row's sample count is composed in here (62.5%（8 次里 5 次）); `—` without a denominator. */
  readonly values: readonly [string, string]
  /** The denominators per window, for `compare` and the tests; the page does not render them. */
  readonly samples?: readonly [number, number]
  /** One line, at most 60 code points. */
  readonly note?: string
}

/** One titled block of rows. */
export interface MetricsBoardGroup {
  /** `load`, `answers`, `asks`, `steps`, `tools`, `tasks`, `blocks`, `credits`, `coverage`. */
  readonly id: string
  /** Plain words, at most 40 code points. */
  readonly title: string
  /** True only for `load`: the weekly report may relay these numbers too. */
  readonly relayed: boolean
  /** One line, at most 60 code points; only `load` uses it (the fourth burden number). */
  readonly note?: string
  readonly rows: readonly MetricsBoardRow[]
}

/** The whole `view.json` (§7.6.2). */
export interface MetricsBoardView {
  readonly version: 1
  /** The last successful computation, ISO; null before the first. */
  readonly at: string | null
  /** The last attempt, ISO. */
  readonly tried: string
  /** The last attempt failed: one line of plain words, at most 60 code points. */
  readonly problem: string | null
  /** calc's basis line (§7.2), shown under 讲细点. */
  readonly basis: string
  /** The two window labels with their dates. */
  readonly windows: readonly [string, string]
  readonly groups: readonly MetricsBoardGroup[]
}

const CODE_POINTS = (value: string): number => [...value].length

const isIso = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && value === new Date(Date.parse(value)).toISOString()

/** One line of at most 60 code points, or undefined. */
function line(value: unknown, where: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.includes('\n') || CODE_POINTS(value) > 60) throw new TypeError(`${where} must be one line of at most 60 code points`)
  return value
}

function rowOf(value: unknown, where: string): MetricsBoardRow {
  if (typeof value !== 'object' || value === null) throw new TypeError(`${where} must be an object`)
  const record = value as Record<string, unknown>
  const label = record.label
  if (typeof label !== 'string' || CODE_POINTS(label) > 40) throw new TypeError(`${where}.label must be a string of at most 40 code points`)
  const values = record.values
  if (!Array.isArray(values) || values.length !== 2 || values.some(entry => typeof entry !== 'string')) throw new TypeError(`${where}.values must be two strings`)
  let samples: readonly [number, number] | undefined
  if (record.samples !== undefined) {
    const pair = record.samples
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some(entry => typeof entry !== 'number' || !Number.isInteger(entry))) throw new TypeError(`${where}.samples must be two integers`)
    samples = [pair[0] as number, pair[1] as number]
  }
  const note = line(record.note, `${where}.note`)
  return {
    label,
    values: [values[0] as string, values[1] as string],
    ...(samples === undefined ? {} : { samples }),
    ...(note === undefined ? {} : { note }),
  }
}

function groupOf(value: unknown, where: string): MetricsBoardGroup {
  if (typeof value !== 'object' || value === null) throw new TypeError(`${where} must be an object`)
  const record = value as Record<string, unknown>
  const id = record.id
  const title = record.title
  if (typeof id !== 'string' || id === '') throw new TypeError(`${where}.id must be a non-empty string`)
  if (typeof title !== 'string' || CODE_POINTS(title) > 40) throw new TypeError(`${where}.title must be a string of at most 40 code points`)
  if (typeof record.relayed !== 'boolean') throw new TypeError(`${where}.relayed must be a boolean`)
  if (!Array.isArray(record.rows) || record.rows.length > 40) throw new TypeError(`${where}.rows must be an array of at most 40 rows`)
  const note = line(record.note, `${where}.note`)
  return {
    id,
    title,
    relayed: record.relayed,
    ...(note === undefined ? {} : { note }),
    rows: record.rows.map((entry, index) => rowOf(entry, `${where}.rows[${index}]`)),
  }
}

/** Check one parsed `view.json` and return it; throws a TypeError naming the first field that does not fit (§7.6.3). */
export function parseMetricsBoardView(value: unknown): MetricsBoardView {
  if (typeof value !== 'object' || value === null) throw new TypeError('the view must be an object')
  const record = value as Record<string, unknown>
  if (record.version !== 1) throw new TypeError('version must be 1')
  const at = record.at
  if (at !== null && !isIso(at)) throw new TypeError('at must be an ISO instant or null')
  const tried = record.tried
  if (!isIso(tried)) throw new TypeError('tried must be an ISO instant')
  if (record.problem !== null && typeof record.problem !== 'string') throw new TypeError('problem must be a string or null')
  if (typeof record.basis !== 'string') throw new TypeError('basis must be a string')
  const windows = record.windows
  if (!Array.isArray(windows) || windows.length !== 2 || windows.some(entry => typeof entry !== 'string')) throw new TypeError('windows must be two strings')
  const groups = record.groups
  if (!Array.isArray(groups) || groups.length > 12) throw new TypeError('groups must be an array of at most 12 groups')
  const problem = record.problem === null ? undefined : line(record.problem, 'problem')
  return {
    version: 1,
    at,
    tried,
    problem: problem === undefined ? null : problem,
    basis: record.basis,
    windows: [windows[0] as string, windows[1] as string],
    groups: groups.map((entry, index) => groupOf(entry, `groups[${index}]`)),
  }
}
