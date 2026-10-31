/**
 * The entry shape both boards share (docs/ORCHESTRATION.md §18): when an
 * entry fires, the filter on an event's payload, the script action both
 * boards use, the declaration of an event in the shared event table, and
 * the functions that go with them. Every entry of the loop board and of the
 * rules board is `when` + `filter?` + an action of that board (HookShape);
 * the rules board imports this file and does not keep a second copy.
 *
 * Only types, constants and pure functions are here. No Node built-in is
 * imported, so the DSH panel, the rules board and the loop board can all
 * import the file (as src/graph/parse.ts). No function reads a file, and
 * only `performance.now()` (the global both Node and a browser have) reads a
 * clock, for the write-time probe of a regular expression; the moment an
 * entry is checked against is passed in.
 */

// ------------------------------------------------------------------ types

export type Trigger =
  | { readonly kind: 'once', readonly at: string }
  | { readonly kind: 'every', readonly seconds: number }
  | { readonly kind: 'daily', readonly time: string, readonly timeZone?: string }
  | { readonly kind: 'weekly', readonly time: string, readonly weekdays: readonly number[], readonly timeZone?: string }
  | { readonly kind: 'cron', readonly expression: string, readonly timeZone?: string }
  | { readonly kind: 'event', readonly events: readonly string[], readonly params?: EventParams }
  | { readonly kind: 'command', readonly names: readonly string[] }

/** Keys are field names the event declares; a field takes only the comparison it declares. */
export type EventFilter = Readonly<Record<string, FilterTest>>
export type FilterTest =
  | { readonly in: readonly string[] }
  | { readonly is: boolean }
  | { readonly atLeast: number }
  | { readonly paths: readonly string[] }
  | { readonly matches: string }
/** Keys are parameter names the event declares; a parameter decides how the event is found, it does not filter the payload. */
export type EventParams = Readonly<Record<string, string | number | boolean>>

/** One entry of either board: `A` is the board's own union of actions. */
export interface HookShape<A> {
  readonly when: Trigger
  readonly filter?: EventFilter
  readonly action: A
}

export type ScriptLang = 'pwsh' | 'node' | 'python' | 'bash'
export interface ScriptRef {
  /** Path from the project root, forward slashes, inside the owning board's script directory. */
  readonly file: string
  /** SHA-256 of the bytes the person agreed to, 64 lowercase hex digits. */
  readonly sha256: string
  readonly lang: ScriptLang
}
export interface ScriptAction {
  readonly kind: 'script'
  readonly script: ScriptRef
  /** Whole seconds: 1 to 30 on a gating event, 5 to 1800 elsewhere. When absent, effectiveTimeoutSeconds fills it (validateScriptAction). */
  readonly timeoutSeconds?: number
  /** Gating events only: what a timeout or crash does. Absent: the event's gateOnErrorDefault, else 'allow'. */
  readonly onError?: 'allow' | 'block'
}

export interface LoopEventField {
  /** /^[a-z][A-Za-z0-9]{0,31}$/ */
  readonly name: string
  readonly type: 'string' | 'number' | 'boolean' | 'strings'
  readonly title: string
  /** The one comparison the field takes (a string field declared `in` also takes `matches`). Absent: the field cannot be filtered. */
  readonly filter?: 'in' | 'is' | 'atLeast' | 'paths'
}
export interface LoopEventParam {
  readonly name: string
  readonly type: 'string' | 'number' | 'boolean'
  readonly title: string
  readonly required: boolean
  readonly min?: number
  readonly max?: number
}
export interface LoopEventDeclaration {
  /** `<namespace>.<name>`; the `gate.` namespace is the rules board's gating events. */
  readonly id: string
  readonly title: string
  readonly fields: readonly LoopEventField[]
  readonly params?: readonly LoopEventParam[]
  readonly personSelectable: boolean
  /** Gating events only: what a script's timeout or crash does when the entry does not say. */
  readonly gateOnErrorDefault?: 'allow' | 'block'
  /** Only a self entry may name the event: the board lists it and does not receive it. */
  readonly listedOnly?: boolean
}

/** One thing wrong with an entry, as the writer is told: the field path and a sentence for a person. */
export interface TriggerIssue {
  readonly path: string
  readonly message: string
}

// ---------------------------------------------------------------- helpers

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A number that can be a duration or a count: finite and not negative. */
function isMeasure(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

const DAY_MS = 86_400_000

// ------------------------------------------------------ time and zones

const formatters = new Map<string, Intl.DateTimeFormat>()

/** The formatter for a zone Intl knows; undefined for any other name. Only working formatters are kept. */
function zoneFormatter(timeZone: string): Intl.DateTimeFormat | undefined {
  const known = formatters.get(timeZone)
  if (known !== undefined) return known
  try {
    const made = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    formatters.set(timeZone, made)
    return made
  }
  catch {
    return undefined
  }
}

interface Wall {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly hour: number
  readonly minute: number
  readonly second: number
}

/** The clock on the wall of the zone at an instant. */
function wallOf(formatter: Intl.DateTimeFormat, ms: number): Wall | undefined {
  try {
    const fields: Record<string, number> = {}
    for (const part of formatter.formatToParts(new Date(ms))) {
      if (part.type !== 'literal') fields[part.type] = Number(part.value)
    }
    const { year, month, day, hour, minute, second } = fields
    if (year === undefined || month === undefined || day === undefined || hour === undefined || minute === undefined || second === undefined) return undefined
    if ([year, month, day, hour, minute, second].some(Number.isNaN)) return undefined
    return { year, month, day, hour: hour % 24, minute, second }
  }
  catch {
    return undefined
  }
}

/**
 * The instants at which the zone's wall clock reads this minute, earliest first: none when spring-forward skipped
 * it, two when fall-back repeated it, one otherwise. The offsets a day before and a day after bracket any
 * transition on that day.
 */
function instantsOf(formatter: Intl.DateTimeFormat, year: number, month: number, day: number, hour: number, minute: number): readonly number[] {
  const local = Date.UTC(year, month - 1, day, hour, minute, 0)
  const found: number[] = []
  for (const probe of [local - DAY_MS, local + DAY_MS]) {
    const wall = wallOf(formatter, probe)
    if (wall === undefined) continue
    const offset = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second) - Math.floor(probe / 1000) * 1000
    const candidate = local - offset
    const back = wallOf(formatter, candidate)
    const same = back !== undefined && back.year === year && back.month === month && back.day === day && back.hour === hour && back.minute === minute && back.second === 0
    if (same && !found.includes(candidate)) found.push(candidate)
  }
  return found.sort((a, b) => a - b)
}

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/
function parseClock(time: unknown): { readonly hour: number, readonly minute: number } | undefined {
  const match = typeof time === 'string' ? CLOCK.exec(time) : null
  return match === null ? undefined : { hour: Number(match[1]), minute: Number(match[2]) }
}

function isWeekdayList(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.length > 0 && value.every(day => typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 7) && new Set<unknown>(value).size === value.length
}

const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})$/
/** An ISO 8601 moment with an offset, as epoch milliseconds; a day the month does not have, hour 24 and a missing offset are refused (Date.parse rolls the first over and accepts the second). */
function parseInstant(text: unknown): number | undefined {
  const match = typeof text === 'string' ? INSTANT.exec(text) : null
  if (match === null) return undefined
  const [year, month, day, hour, minute] = [match[1], match[2], match[3], match[4], match[5]].map(Number) as [number, number, number, number, number]
  const second = match[6] === undefined ? 0 : Number(match[6])
  const millis = match[7] === undefined ? 0 : Number(match[7].slice(0, 3).padEnd(3, '0'))
  const zone = match[8] ?? 'Z'
  const offset = zone === 'Z' ? 0 : (zone.startsWith('-') ? -1 : 1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6)))
  const offsetOk = zone === 'Z' || (Number(zone.slice(1, 3)) <= 23 && Number(zone.slice(4, 6)) <= 59)
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  const calendarOk = month >= 1 && month <= 12 && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  if (!calendarOk || !offsetOk || hour > 23 || minute > 59 || second > 59) return undefined
  date.setUTCHours(hour, minute, second, millis)
  return date.getTime() - offset * 60_000
}

/**
 * The next moment a time trigger fires after `after`, or undefined: an event or command trigger has no moment of its
 * own, a cron expression is computed by the DSH schedule service, and a trigger that cannot be read gives nothing.
 * A wall-clock time that a spring-forward skips is skipped for that day; one that a fall-back repeats counts once, at
 * the earlier moment. `systemTimeZone` stands in for a trigger without a zone.
 */
export function nextOccurrence(when: Trigger, after: Date, systemTimeZone: string): Date | undefined {
  const afterMs = after.getTime()
  if (!Number.isFinite(afterMs) || !isRecord(when)) return undefined
  if (when.kind === 'once') {
    const at = parseInstant(when.at)
    return at !== undefined && at > afterMs ? new Date(at) : undefined
  }
  if (when.kind === 'every') {
    const next = typeof when.seconds === 'number' && when.seconds > 0 ? new Date(afterMs + when.seconds * 1000) : undefined
    return next !== undefined && Number.isFinite(next.getTime()) ? next : undefined
  }
  if (when.kind !== 'daily' && when.kind !== 'weekly') return undefined
  const clock = parseClock(when.time)
  const weekdays = when.kind === 'weekly' ? when.weekdays : undefined
  if (clock === undefined || (when.kind === 'weekly' && !isWeekdayList(weekdays))) return undefined
  const formatter = zoneFormatter(typeof when.timeZone === 'string' ? when.timeZone : systemTimeZone)
  const today = formatter === undefined ? undefined : wallOf(formatter, afterMs)
  if (formatter === undefined || today === undefined) return undefined
  // A skipped day costs one more day (a week for a weekly entry): three weeks cover every case.
  for (let ahead = 0; ahead <= 21; ahead++) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + ahead))
    if (weekdays !== undefined && !weekdays.includes(date.getUTCDay() === 0 ? 7 : date.getUTCDay())) continue
    const earliest = instantsOf(formatter, date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), clock.hour, clock.minute)[0]
    if (earliest !== undefined && earliest > afterMs) return new Date(earliest)
  }
  return undefined
}

// ------------------------------------------------------------ matches

/** How much of a value `matches` reads, and how long a pattern may be. */
const MATCH_WINDOW = 8192
const MATCH_PATTERN_MAX = 300
/** The most a probe input may take; the design's rule for a pattern that is "too slow". */
const PROBE_LIMIT_MS = 50

function compileMatch(pattern: string): RegExp | undefined {
  try {
    return new RegExp(pattern, 'i')
  }
  catch {
    return undefined
  }
}

/** The fixed long inputs a pattern is tried on when it is written: runs of one character and the shapes that make nested quantifiers backtrack. */
const PROBE_SHAPES: readonly ((length: number) => string)[] = [
  length => 'a'.repeat(length),
  length => `${'a'.repeat(length)}!`,
  length => `${'x'.repeat(length)}!`,
  length => `${'0'.repeat(length)}!`,
  length => 'ab'.repeat(length >> 1) + '!',
  length => 'a '.repeat(length >> 1) + '!',
  length => `${' '.repeat(length)}x`,
  length => '='.repeat(length),
  length => `${'='.repeat(length)}!`,
]
/** 8 characters growing by 15 % up to 8 KiB. Exponential patterns never finish on a long input and a regex cannot be interrupted, so the probe climbs and stops at the first input over the limit. */
const PROBE_LENGTHS: readonly number[] = (() => {
  const lengths: number[] = []
  for (let length = 8; length < MATCH_WINDOW; length += Math.max(1, Math.ceil(length * 0.15))) lengths.push(length)
  lengths.push(MATCH_WINDOW)
  return lengths
})()

function tooSlow(pattern: RegExp): boolean {
  for (const length of PROBE_LENGTHS) {
    for (const shape of PROBE_SHAPES) {
      const input = shape(length)
      const started = performance.now()
      pattern.test(input)
      if (performance.now() - started > PROBE_LIMIT_MS) return true
    }
  }
  return false
}

// ---------------------------------------------------------- validateWhen

type Add = (path: string, message: string) => void

const ZONE_HINT = '要写 IANA 时区名（例 Asia/Shanghai）'
const EVERY_MAX_SECONDS = 31_536_000
const COMMAND_NAME = /^[a-z0-9-]{1,32}$/

/** `mustWrite`: the entry has to name a zone itself (a person's daily and weekly entry); otherwise a missing zone means the system zone. */
function checkZone(trigger: Readonly<Record<string, unknown>>, mustWrite: boolean, add: Add): void {
  const zone = trigger.timeZone
  if (zone === undefined) {
    if (mustWrite) add('when.timeZone', `人写的条目要写明时区：${ZONE_HINT}`)
  }
  else if (typeof zone !== 'string' || zoneFormatter(zone) === undefined) add('when.timeZone', `不认识这个时区：${ZONE_HINT}`)
}

function checkOnce(trigger: Readonly<Record<string, unknown>>, now: Date, add: Add): void {
  const at = parseInstant(trigger.at)
  const limit = new Date(now.getTime())
  limit.setUTCFullYear(limit.getUTCFullYear() + 1)
  if (at === undefined) add('when.at', '要写成带时区偏移的 ISO 8601 时刻，例 2026-11-02T09:00:00+08:00')
  else if (at <= now.getTime()) add('when.at', '一次性的时刻要晚于现在')
  else if (at > limit.getTime()) add('when.at', '一次性的时刻至多是一年以后')
}

function checkEvery(trigger: Readonly<Record<string, unknown>>, action: 'tell-main' | 'self' | 'work', add: Add): void {
  const floor = action === 'tell-main' ? 600 : 300
  const seconds = trigger.seconds
  if (typeof seconds !== 'number' || !Number.isInteger(seconds) || seconds < floor || seconds > EVERY_MAX_SECONDS) {
    const reason = action === 'tell-main' ? '每次告诉主 Agent 都会叫醒它，在对话里留一回合' : '间隔太短会把机器跑满'
    add('when.seconds', `间隔要写成 ${floor} 到 ${EVERY_MAX_SECONDS} 之间的整数秒（${reason}）`)
  }
}

function checkWallClock(trigger: Readonly<Record<string, unknown>>, origin: 'person' | 'plugin', add: Add): void {
  if (parseClock(trigger.time) === undefined) add('when.time', '时间要写成 HH:MM（00:00 到 23:59）')
  checkZone(trigger, origin === 'person', add)
  if (trigger.kind === 'weekly' && !isWeekdayList(trigger.weekdays)) add('when.weekdays', '星期要写成 1 到 7 的不重复整数（7 是星期日），至少一个')
}

function checkCron(trigger: Readonly<Record<string, unknown>>, action: 'tell-main' | 'self' | 'work', add: Add): void {
  if (action !== 'tell-main') add('when', 'cron 写法只配“告诉主 Agent”')
  const expression = trigger.expression
  if (typeof expression !== 'string' || expression.length > 100 || expression.trim().split(/\s+/).length !== 5) add('when.expression', 'cron 要写成恰好 5 个以空白分隔的字段，总长至多 100 个字符')
  checkZone(trigger, false, add)
}

function checkCommand(trigger: Readonly<Record<string, unknown>>, action: 'tell-main' | 'self' | 'work', origin: 'person' | 'plugin', add: Add): void {
  if (origin !== 'plugin' || action !== 'self') add('when', '命令触发只给插件交来的“自己做”的条目')
  const names = trigger.names
  if (!Array.isArray(names) || names.length < 1 || names.length > 8 || !names.every(name => typeof name === 'string' && COMMAND_NAME.test(name))) {
    add('when.names', '命令名写 1 到 8 个，每个只用小写字母、数字和连字符，至多 32 个字符')
  }
}

function checkParam(spec: LoopEventParam, value: unknown, add: Add): void {
  const path = `when.params.${spec.name}`
  if (value === undefined) {
    if (spec.required) add(path, `缺少必填的参数“${spec.title}”`)
    return
  }
  if (spec.type === 'number') {
    const inRange = typeof value === 'number' && Number.isFinite(value) && (spec.min === undefined || value >= spec.min) && (spec.max === undefined || value <= spec.max)
    if (!inRange) add(path, `参数“${spec.title}”要写成数字${spec.min === undefined ? '' : `，不小于 ${spec.min}`}${spec.max === undefined ? '' : `，不大于 ${spec.max}`}`)
  }
  else if (spec.type === 'string') {
    if (typeof value !== 'string' || value === '' || value.length > 2000) add(path, `参数“${spec.title}”要写成 1 到 2000 个字符的文字`)
  }
  else if (typeof value !== 'boolean') {
    add(path, `参数“${spec.title}”要写成是或否`)
  }
}

/** Checks the event list and the params; returns the declarations of the listed events the table knows. */
function checkEvents(
  trigger: Readonly<Record<string, unknown>>,
  table: ReadonlyMap<string, LoopEventDeclaration>,
  options: { readonly allowGate: boolean, readonly origin: 'person' | 'plugin', readonly action: 'tell-main' | 'self' | 'work' },
  add: Add,
): readonly LoopEventDeclaration[] {
  const events = trigger.events
  if (!Array.isArray(events) || events.length < 1 || events.length > 4 || !events.every(id => typeof id === 'string')) {
    add('when.events', '事件要写 1 到 4 个')
    return []
  }
  const declared: LoopEventDeclaration[] = []
  for (const id of events as readonly string[]) {
    if (id.startsWith('gate.') && !options.allowGate) {
      add('when.events', '拦路的时刻归规则板：用 rules_propose')
      continue
    }
    const declaration = table.get(id)
    if (declaration === undefined) {
      add('when.events', `不认识的事件：${id}`)
      continue
    }
    if (options.origin === 'person' && !declaration.personSelectable) add('when.events', `“${declaration.title}”不能由人选，是给插件用的`)
    else if (declaration.listedOnly === true && options.action !== 'self') add('when.events', `“${declaration.title}”只在列出时用，条目收不到它`)
    else declared.push(declaration)
  }
  const params = trigger.params
  const given = params === undefined ? {} : (isRecord(params) ? params : undefined)
  if (given === undefined) add('when.params', '参数要写成一个对象')
  else {
    for (const key of Object.keys(given)) {
      if (!declared.some(declaration => declaration.params?.some(spec => spec.name === key) === true)) add(`when.params.${key}`, `这些事件没有参数“${key}”`)
    }
    for (const declaration of declared) {
      for (const spec of declaration.params ?? []) checkParam(spec, given[spec.name], add)
    }
  }
  return declared
}

const COMPARISONS = ['in', 'is', 'atLeast', 'paths', 'matches'] as const
type Comparison = (typeof COMPARISONS)[number]

/** Why a declared field cannot take this comparison, or undefined. */
function declarationProblem(declaration: LoopEventDeclaration, key: string, comparison: Comparison): string | undefined {
  const field = declaration.fields.find(candidate => candidate.name === key)
  if (field === undefined) return `事件“${declaration.title}”没有字段“${key}”`
  if (field.filter === undefined) return `字段“${field.title}”不能用来筛`
  if (field.filter === comparison || (comparison === 'matches' && field.filter === 'in' && field.type === 'string')) return undefined
  return `字段“${field.title}”只能用“${field.filter}”来比`
}

function checkValue(path: string, comparison: Comparison, value: unknown, add: Add): void {
  if (comparison === 'in') {
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string') || value.length > 50) add(path, '“in”要写成文字列表，至多 50 个')
  }
  else if (comparison === 'is') {
    if (typeof value !== 'boolean') add(path, '“is”要写成是或否')
  }
  else if (comparison === 'atLeast') {
    if (typeof value !== 'number' || !Number.isFinite(value)) add(path, '“atLeast”要写成数字')
  }
  else if (comparison === 'paths') {
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string' && item !== '') || value.length > 20) add(path, '“paths”要写成路径写法的列表，至多 20 个')
  }
  else if (typeof value !== 'string' || value === '' || value.length > MATCH_PATTERN_MAX) {
    add(path, `“matches”要写成 1 到 ${MATCH_PATTERN_MAX} 个字符的正则`)
  }
  else {
    const pattern = compileMatch(value)
    if (pattern === undefined) add(path, '这个正则编不过')
    else if (tooSlow(pattern)) add(path, '这个正则在长文本上太慢，换个写法')
  }
}

function checkFilter(filter: unknown, declared: readonly LoopEventDeclaration[], add: Add): void {
  if (!isRecord(filter)) return add('filter', '筛选要写成一个对象：字段名对应一种比法')
  for (const [key, test] of Object.entries(filter)) {
    const path = `filter.${key}`
    const comparisons = isRecord(test) ? Object.keys(test) : []
    const comparison = comparisons.length === 1 ? COMPARISONS.find(candidate => candidate === comparisons[0]) : undefined
    if (comparison === undefined || !isRecord(test)) {
      add(path, `每个字段只写一种比法：${COMPARISONS.join('、')}`)
      continue
    }
    const problem = declared.map(declaration => declarationProblem(declaration, key, comparison)).find(found => found !== undefined)
    if (problem === undefined) checkValue(path, comparison, test[comparison], add)
    else add(path, problem)
  }
}

/**
 * Everything wrong with a trigger and its filter, empty when it is sound. A sound trigger is one a board can run:
 * events in the table (`gate.` ones only where `allowGate`), filter keys and comparisons the listed events declare,
 * params as declared, times and zones that exist, and the limits of each kind (a `once` strictly ahead of `now` and at
 * most a year out; an `every` of at least 600 seconds when `action` is 'tell-main', 300 otherwise; cron only with
 * 'tell-main'; command triggers and listed-only events only with 'self'). `origin` 'person' also needs a zone on
 * daily and weekly, and only events marked for people. Never throws, whatever shape it is given.
 */
export function validateWhen(
  when: Trigger,
  filter: EventFilter | undefined,
  table: ReadonlyMap<string, LoopEventDeclaration>,
  options: {
    readonly allowGate: boolean
    readonly origin: 'person' | 'plugin'
    /** The moment a `once` is measured against. */
    readonly now: Date
    /** What the entry does, for the rules that depend on it: tells the main agent, is a plugin's self entry (the host does it), or runs something. */
    readonly action: 'tell-main' | 'self' | 'work'
  },
): readonly TriggerIssue[] {
  const issues: TriggerIssue[] = []
  const seen = new Set<string>()
  const add: Add = (path, message) => {
    if (seen.has(`${path}\n${message}`)) return
    seen.add(`${path}\n${message}`)
    issues.push({ path, message })
  }
  if (!isRecord(when)) {
    add('when', '“什么时候”要写成一个对象')
    return issues
  }
  let declared: readonly LoopEventDeclaration[] = []
  switch (when.kind) {
    case 'once':
      checkOnce(when, options.now, add)
      break
    case 'every':
      checkEvery(when, options.action, add)
      break
    case 'daily':
    case 'weekly':
      checkWallClock(when, options.origin, add)
      break
    case 'cron':
      checkCron(when, options.action, add)
      break
    case 'command':
      checkCommand(when, options.action, options.origin, add)
      break
    case 'event':
      declared = checkEvents(when, table, options, add)
      break
    default:
      add('when.kind', '不认识的触发方式')
  }
  if (filter !== undefined) {
    if (when.kind === 'event') checkFilter(filter, declared, add)
    else add('filter', '筛选只配“碰到某件事”的触发')
  }
  return issues
}

// ---------------------------------------------------------- matchesFilter

/** Matches one path segment against a glob in which `*` is any run of characters (`**` inside a segment is the same). */
function globMatch(glob: string, name: string): boolean {
  let g = 0
  let n = 0
  let star = -1
  let mark = 0
  while (n < name.length) {
    if (g < glob.length && glob[g] === '*') {
      star = g++
      mark = n
    }
    else if (g < glob.length && glob[g] === name[n]) {
      g++
      n++
    }
    else if (star >= 0) {
      g = star + 1
      n = ++mark
    }
    else return false
  }
  while (g < glob.length && glob[g] === '*') g++
  return g === glob.length
}

/** Whether pattern segments match path segments from the root; `**` as a whole segment takes zero or more segments, and with `prefix` the path may go on past the pattern. */
function segmentsMatch(pattern: readonly string[], path: readonly string[], prefix: boolean): boolean {
  const memo = new Map<number, boolean>()
  const from = (i: number, j: number): boolean => {
    const key = i * (path.length + 1) + j
    const known = memo.get(key)
    if (known !== undefined) return known
    let result: boolean
    const segment = pattern[i]
    if (segment === undefined) result = prefix || j === path.length
    else if (segment === '**') {
      result = i === pattern.length - 1
      for (let k = j; !result && k <= path.length; k++) result = from(i + 1, k)
    }
    else result = j < path.length && globMatch(segment, path[j] ?? '') && from(i + 1, j + 1)
    memo.set(key, result)
    return result
  }
  return from(0, 0)
}

const slashed = (text: string): string => text.replace(/\\/g, '/')
const parts = (text: string): readonly string[] => text.split('/').filter(part => part !== '' && part !== '.')

/** The segments of a path relative to the project root: separators unified, a leading project root dropped (a Windows drive path ignores case). */
function projectRelative(path: string, project: string): readonly string[] {
  const text = slashed(path)
  const root = slashed(project).replace(/\/+$/, '')
  const windows = /^[A-Za-z]:/.test(root)
  const head = text.slice(0, root.length)
  const under = root !== '' && (windows ? head.toLowerCase() === root.toLowerCase() : head === root)
  if (under && (text.length === root.length || text[root.length] === '/')) return parts(text.slice(root.length))
  return parts(text)
}

/**
 * One path against one pattern. A trailing slash is a directory prefix from the project root; a name with a slash is
 * a file relative to it; a bare name (it may carry `*`) is a file of that name at any depth.
 */
function pathMatches(pattern: string, path: readonly string[]): boolean {
  const text = slashed(pattern)
  if (!text.includes('/')) return path.length > 0 && globMatch(text, path[path.length - 1] ?? '')
  return segmentsMatch(parts(text), path, text.endsWith('/'))
}

function passes(test: unknown, value: unknown, project: string): boolean {
  if (!isRecord(test)) return false
  const keys = Object.keys(test)
  if (keys.length !== 1) return false
  const [comparison] = keys
  if (comparison === 'in') return Array.isArray(test.in) && typeof value === 'string' && test.in.includes(value)
  if (comparison === 'is') return typeof test.is === 'boolean' && value === test.is
  if (comparison === 'atLeast') return typeof test.atLeast === 'number' && typeof value === 'number' && Number.isFinite(value) && value >= test.atLeast
  if (comparison === 'paths') {
    if (!Array.isArray(test.paths) || !Array.isArray(value)) return false
    const patterns = test.paths.filter((pattern): pattern is string => typeof pattern === 'string')
    return value.some(item => typeof item === 'string' && patterns.some(pattern => pathMatches(pattern, projectRelative(item, project))))
  }
  if (comparison === 'matches') {
    const pattern = typeof test.matches === 'string' ? compileMatch(test.matches) : undefined
    return pattern !== undefined && typeof value === 'string' && pattern.test(value.slice(0, MATCH_WINDOW))
  }
  return false
}

/**
 * Whether one event's payload passes the filter: every key must pass, and a field the payload lacks, or holds in
 * another type, does not. `paths` reads absolute paths under `project` as paths relative to it. A filter that
 * validateWhen never saw (a pattern that does not compile, a comparison it does not know) simply does not pass.
 * Never throws.
 */
export function matchesFilter(filter: EventFilter | undefined, payload: Readonly<Record<string, unknown>>, project: string): boolean {
  if (filter === undefined) return true
  if (!isRecord(filter)) return false
  const entries = Object.entries(filter)
  if (entries.length === 0) return true
  if (!isRecord(payload)) return false
  return entries.every(([key, test]) => passes(test, payload[key], project))
}

// --------------------------------------------------------------- timeouts

/** The most a script may be given to run (decision d-timeout-measured): on a gating event, and for every other trigger. */
export const GATE_TIMEOUT_MAX_SECONDS = 30
export const WORK_TIMEOUT_MAX_SECONDS = 1800
/** The least an entry's `timeoutSeconds` can be: the lower end of the range ScriptAction allows. */
const GATE_TIMEOUT_MIN_SECONDS = 1
const WORK_TIMEOUT_MIN_SECONDS = 5

export interface TimeoutInput {
  /** Seconds the agent that wrote the script gave when the person approved it. Absent, zero, negative or not a finite number: no estimate. */
  readonly estimate?: number
  /** The latest runs of the entry, each with the id it is recorded under and how long it took in seconds. A run with a bad number or no id is left out. */
  readonly recent: readonly { readonly runId: string, readonly seconds: number }[]
  readonly purpose: 'gate' | 'work'
  /** The value in force now, passed through so the recorder can write what it changed from. */
  readonly previous?: number
}

export interface TimeoutDecision {
  readonly seconds: number
  /** What the value came from: no data ('ceiling'), the writer's estimate ('estimate'), or the ids of the runs it was computed from. */
  readonly source: 'ceiling' | 'estimate' | readonly string[]
  /** True when the ceiling cut a value that would have been higher: the main agent should be told. */
  readonly capped: boolean
  readonly previous?: number
}

/**
 * The one place a script's timeout is chosen (decision d-timeout-measured): the writer's estimate to start with, then
 * three times the slowest of the recent runs, never above the ceiling of the purpose and never below the least the
 * entry allows; with neither, the ceiling. Whole seconds, rounded up. Bad numbers count as absent, so the function
 * never throws and always gives a value with its source. It reads no clock and no file.
 */
export function effectiveTimeoutSeconds(input: TimeoutInput): TimeoutDecision {
  const gate = input.purpose === 'gate'
  const ceiling = gate ? GATE_TIMEOUT_MAX_SECONDS : WORK_TIMEOUT_MAX_SECONDS
  const floor = gate ? GATE_TIMEOUT_MIN_SECONDS : WORK_TIMEOUT_MIN_SECONDS
  const carried = isMeasure(input.previous) ? { previous: input.previous } : {}
  const recent: readonly unknown[] = Array.isArray(input.recent) ? input.recent : []
  const runs = recent.flatMap(run => (isRecord(run) && typeof run.runId === 'string' && isMeasure(run.seconds) ? [{ runId: run.runId, seconds: run.seconds }] : []))
  const estimate = isMeasure(input.estimate) && input.estimate > 0 ? input.estimate : undefined
  let wanted: number
  let source: TimeoutDecision['source']
  if (runs.length > 0) {
    wanted = 3 * runs.reduce((slowest, run) => Math.max(slowest, run.seconds), 0)
    source = runs.map(run => run.runId)
  }
  else if (estimate !== undefined) {
    wanted = estimate
    source = 'estimate'
  }
  else return { seconds: ceiling, source: 'ceiling', capped: false, ...carried }
  const whole = Math.ceil(wanted)
  return { seconds: Math.max(floor, Math.min(ceiling, whole)), source, capped: whole > ceiling, ...carried }
}

export interface ScriptTimingContext {
  /** 'gate' when the entry's event is a gating event. */
  readonly purpose: 'gate' | 'work'
  /** The gating event's `gateOnErrorDefault`. */
  readonly gateOnErrorDefault?: 'allow' | 'block'
  /** The estimate the writing agent gave at approval, used when the entry does not write a timeout. */
  readonly estimateSeconds?: number
}

export interface ScriptTiming {
  readonly timeoutSeconds: number
  /** Gating events only. */
  readonly onError?: 'allow' | 'block'
  /** Present when the entry wrote no timeout and effectiveTimeoutSeconds filled it: the value, where it came from, whether the ceiling cut it. */
  readonly filled?: TimeoutDecision
}

/**
 * Checks the timing of a script action and fills what it leaves out: `timeoutSeconds` must be a whole number of
 * seconds, 1 to 30 on a gating event and 5 to 1800 elsewhere, and is filled by effectiveTimeoutSeconds when absent;
 * `onError` exists on gating events only and falls back to the event's declared default, then 'allow'. The script
 * reference itself (file, hash, language) is checked by the board that owns the script directory.
 */
export function validateScriptAction(
  action: ScriptAction,
  context: ScriptTimingContext,
): { readonly ok: true, readonly timing: ScriptTiming } | { readonly ok: false, readonly issues: readonly TriggerIssue[] } {
  const gate = context.purpose === 'gate'
  const [least, most] = gate ? [GATE_TIMEOUT_MIN_SECONDS, GATE_TIMEOUT_MAX_SECONDS] : [WORK_TIMEOUT_MIN_SECONDS, WORK_TIMEOUT_MAX_SECONDS]
  const issues: TriggerIssue[] = []
  const written: unknown = action.timeoutSeconds
  const timeoutOk = written === undefined || (typeof written === 'number' && Number.isInteger(written) && written >= least && written <= most)
  if (!timeoutOk) issues.push({ path: 'action.timeoutSeconds', message: `超时要写成 ${least} 到 ${most} 之间的整数秒` })
  const onError: unknown = action.onError
  if (onError !== undefined && !gate) issues.push({ path: 'action.onError', message: '只有拦路的事件才有“超时或崩溃时怎样”' })
  else if (onError !== undefined && onError !== 'allow' && onError !== 'block') issues.push({ path: 'action.onError', message: '“超时或崩溃时怎样”只能写 allow 或 block' })
  if (issues.length > 0) return { ok: false, issues }
  const gating = gate ? { onError: action.onError ?? context.gateOnErrorDefault ?? 'allow' } : {}
  if (typeof written === 'number') return { ok: true, timing: { timeoutSeconds: written, ...gating } }
  const filled = effectiveTimeoutSeconds({ recent: [], purpose: context.purpose, ...(context.estimateSeconds === undefined ? {} : { estimate: context.estimateSeconds }) })
  return { ok: true, timing: { timeoutSeconds: filled.seconds, ...gating, filled } }
}
