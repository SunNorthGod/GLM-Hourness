/**
 * An entry of the loop board (docs/ORCHESTRATION.md §18.3; loop board design
 * 0.6 §2.1, §2.3, §12): its fields, the actions the board has of its own, and
 * `validateEntry`, the one check both sources go through, a person's entry
 * (written by the board after the person agreed) and a plugin's (handed over
 * by a row). The shared form of an entry (`HookShape`, `Trigger`, the filter)
 * is in trigger.ts, and so are the checks of `when` and `filter`; this file
 * adds the entry's own fields and its actions.
 *
 * Only types and pure functions; no Node built-in, so the board's page can
 * import it. Nothing here reads a clock or a file: the moment a `once` is
 * measured against, the events the board knows and the harness actions of the
 * hand-over come in with the call.
 */
import { validateScriptAction, validateWhen, WORK_TIMEOUT_MAX_SECONDS, WORK_TIMEOUT_MIN_SECONDS, type EventFilter, type HookShape, type LoopEventDeclaration, type ScriptAction, type ScriptLang, type Trigger, type TriggerIssue } from './trigger.ts'

/**
 * What an entry does. `script` and `check` run something and exist only in a
 * person's entries (the person agreed to the text); a plugin's entries are
 * `tell-main`, `harness` (an action the row that handed the entry over runs
 * and reports) and `self` (the row does it itself and the board only lists it).
 */
export type Action =
  | { readonly kind: 'tell-main', readonly text: string, readonly wake: boolean }
  | { readonly kind: 'harness', readonly action: string, readonly tell?: { readonly text: string, readonly wake: boolean } }
  | LoopScriptAction
  | LoopCheckAction
  | { readonly kind: 'self', readonly does: string, readonly by: string }

/** The shared script action, plus what the loop board does with the result. No `onError`: a loop board entry meets no gating event. */
export interface LoopScriptAction extends Omit<ScriptAction, 'onError'> {
  readonly report: 'always' | 'on-failure' | 'on-change'
  readonly to?: 'main' | 'event-session'
  readonly note?: string
  readonly glmSpend?: 'optional' | 'necessary'
}

/** A check a person had run: the command line comes from an environment tool node of the project graph and is kept as the person agreed to it. */
export interface LoopCheckAction {
  readonly kind: 'check'
  readonly tool: string
  readonly check?: string
  readonly argv: readonly string[]
  readonly timeoutSeconds?: number
  readonly report: 'always' | 'on-failure' | 'on-change'
  readonly to?: 'main' | 'event-session'
  readonly note?: string
  readonly glmSpend?: 'optional' | 'necessary'
}

/** What the writer hands over: the shared shape and the fields of design §2.1 up to `ownRules`. */
export interface LoopEntryDefinition extends HookShape<Action> {
  readonly id: string
  readonly title: string
  readonly why?: string
  readonly limits?: { readonly debounceSeconds?: number, readonly maxPerHour?: number }
  readonly quiet?: { readonly from: string, readonly to: string }
  readonly scope?: 'project' | 'machine'
  readonly basis?: string
  readonly ownRules?: readonly string[]
}

/** An entry as the board holds it: the definition, who brought it and its revision (a plugin's: the first 12 hex digits of the SHA-256 of its canonical JSON). */
export interface LoopEntry extends LoopEntryDefinition {
  readonly source: { readonly kind: 'plugin', readonly plugin: string, readonly row: string }
  readonly rev: string
}

/** Who agreed to a person's entry and how: the person's words travel with the entry into the repository (design §2.1, §14). */
export interface PersonSource {
  readonly kind: 'person'
  /** When the person agreed (ISO time). */
  readonly at: string
  readonly via: 'chat' | 'board'
  /** The person's words, as the main agent relayed them. */
  readonly relay: string
  /** The question on the project graph the agreement was recorded on; only when `via` is `chat`. */
  readonly question?: string
  /** The proposal the entry came from, `lp-<8 hex digits>`. */
  readonly proposal: string
}

/** A person's entry as the file in the repository holds it: the definition and where it came from (`rev` and `status` are the journal's). */
export interface PersonEntry extends LoopEntryDefinition {
  readonly source: PersonSource
}

/** What `validateEntry` needs besides the entry. */
export interface EntryContext {
  /** Every event the board knows now. */
  readonly table: ReadonlyMap<string, LoopEventDeclaration>
  /** The moment a `once` is measured against. */
  readonly now: Date
  /** The harness actions of the hand-over the entry came in with. */
  readonly actions?: ReadonlySet<string>
  /**
   * Plugin entries only: event ids the entry may name although the table lacks them, because the row that declares
   * them is not there (yet). The entry then waits; what can be checked without the declaration is checked, and the
   * rest is checked when the declaration arrives. An id the table has is not waited for.
   */
  readonly absent?: ReadonlySet<string>
}

type Rec = Readonly<Record<string, unknown>>
type Add = (path: string, message: string) => void

const PERSON_ID = /^u-[0-9a-f]{8}$/
const PLUGIN_ID = /^[a-z][a-z0-9-]{0,15}[.:][a-z0-9-]{1,48}$/
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/
const SHA256 = /^[0-9a-f]{64}$/
/** A `{name}` in a text; braces around anything else are plain text. */
const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g
const LINE_BREAK = /[\r\n]/
const REPORTS: readonly unknown[] = ['always', 'on-failure', 'on-change']
const SPENDS: readonly unknown[] = ['optional', 'necessary']
const SUFFIX: Readonly<Record<ScriptLang, string>> = { pwsh: 'ps1', node: 'mjs', python: 'py', bash: 'sh' }

/** The fields of an entry that the writer gives; `source`, `rev` and `status` are the board's. */
const FIELDS = ['id', 'title', 'why', 'when', 'filter', 'action', 'limits', 'quiet', 'scope', 'basis', 'ownRules']
const BOARD_FIELDS = ['source', 'rev', 'status']

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const points = (value: string): number => [...value].length

/** A string of `min` to `max` code points, on one line unless `single` is false. */
function isText(value: unknown, min: number, max: number, single = true): value is string {
  return typeof value === 'string' && points(value) >= min && points(value) <= max && (!single || !LINE_BREAK.test(value))
}

const isWhole = (value: unknown, least: number, most: number): boolean => typeof value === 'number' && Number.isInteger(value) && value >= least && value <= most

function checkKeys(record: Rec, allowed: readonly string[], base: string, add: Add): void {
  for (const key of Object.keys(record)) {
    if (record[key] === undefined || allowed.includes(key)) continue
    add(`${base}${key}`, BOARD_FIELDS.includes(key) && base === '' ? '这个字段由循环板自己写，交来的一方不写' : '没有这个字段')
  }
}

function placeholdersIn(value: string): readonly string[] {
  return [...new Set([...value.matchAll(PLACEHOLDER)].map(match => match[1] ?? ''))]
}

/** Every `{name}` of a text is a field every event of the trigger declares; a time trigger has no payload, so no `{name}`. */
function checkPlaceholders(value: string, path: string, when: unknown, table: ReadonlyMap<string, LoopEventDeclaration>, add: Add): void {
  const names = placeholdersIn(value)
  if (names.length === 0 || !isRecord(when)) return
  if (when.kind !== 'event') return add(path, '到点的条目没有事件的内容可填，文字里不能有 {名字}')
  const declared = (Array.isArray(when.events) ? when.events : []).flatMap((id: unknown) => {
    const found = typeof id === 'string' ? table.get(id) : undefined
    return found === undefined ? [] : [found]
  })
  // With no declaration at hand, nothing can be checked now.
  if (declared.length === 0) return
  for (const name of names) {
    if (!declared.every(event => event.fields.some(field => field.name === name))) add(path, `{${name}} 不是这些事件都有的字段`)
  }
}

/** A `{text, wake}` pair: the words to the main agent, and whether they wake it. */
function checkTell(tell: unknown, path: string, extra: readonly string[], entry: Rec, context: EntryContext, add: Add): void {
  if (!isRecord(tell)) return add(path, '写成 {text, wake}')
  checkKeys(tell, [...extra, 'text', 'wake'], `${path}.`, add)
  if (!isText(tell.text, 1, 2000, false)) add(`${path}.text`, '文字写 1 到 2000 个字')
  else checkPlaceholders(tell.text, `${path}.text`, entry.when, context.table, add)
  if (typeof tell.wake !== 'boolean') add(`${path}.wake`, 'wake 写成是或否：要不要叫醒主 Agent')
}

/** The fields a script and a check have in common: what to do with the result. */
function checkDelivery(action: Rec, entry: Rec, add: Add): void {
  if (!REPORTS.includes(action.report)) add('action.report', 'report 写 always、on-failure 或 on-change')
  if (action.to !== undefined && action.to !== 'main' && action.to !== 'event-session') add('action.to', 'to 写 main 或 event-session')
  else if (action.to === 'event-session' && !(isRecord(entry.when) && entry.when.kind === 'event')) add('action.to', '到点的条目没有会话，结果不能交给事件里的会话')
  if (action.note !== undefined && !isText(action.note, 1, 500, false)) add('action.note', '注意事项写 1 到 500 个字')
  if (action.glmSpend !== undefined && !SPENDS.includes(action.glmSpend)) add('action.glmSpend', 'glmSpend 写 optional 或 necessary')
}

function checkScript(action: Rec, entry: Rec, add: Add): void {
  checkKeys(action, ['kind', 'script', 'timeoutSeconds', 'report', 'to', 'note', 'glmSpend'], 'action.', add)
  const script = action.script
  if (isRecord(script)) {
    checkKeys(script, ['file', 'sha256', 'lang'], 'action.script.', add)
    const lang = typeof script.lang === 'string' && Object.hasOwn(SUFFIX, script.lang) ? script.lang as ScriptLang : undefined
    if (lang === undefined) add('action.script.lang', `语言写 ${Object.keys(SUFFIX).join('、')} 之一`)
    else if (script.file !== `docs/loops/scripts/${String(entry.id)}.${SUFFIX[lang]}`) add('action.script.file', `脚本文件写成 docs/loops/scripts/<条目 id>.${SUFFIX[lang]}`)
    if (typeof script.sha256 !== 'string' || !SHA256.test(script.sha256)) add('action.script.sha256', '哈希写成 64 位小写十六进制')
  }
  else add('action.script', '脚本写成 {file, sha256, lang}')
  // The timeout has the ranges of a script that is not on a gating event (src/loops/trigger.ts).
  const timing = validateScriptAction({ kind: 'script', script: script as ScriptAction['script'], ...(action.timeoutSeconds === undefined ? {} : { timeoutSeconds: action.timeoutSeconds as number }) }, { purpose: 'work' })
  if (!timing.ok) for (const issue of timing.issues) add(issue.path, issue.message)
  checkDelivery(action, entry, add)
}

function checkCheck(action: Rec, entry: Rec, add: Add): void {
  checkKeys(action, ['kind', 'tool', 'check', 'argv', 'timeoutSeconds', 'report', 'to', 'note', 'glmSpend'], 'action.', add)
  if (!isText(action.tool, 1, 200)) add('action.tool', '写环境工具节点的 id')
  if (action.check !== undefined && !isText(action.check, 1, 200)) add('action.check', '节点里有几条检查时，写是哪一条')
  const argv = action.argv
  if (!Array.isArray(argv) || argv.length < 1 || argv.length > 64) add('action.argv', '命令行写成 1 到 64 项的列表')
  else {
    argv.forEach((item: unknown, index) => {
      if (!isText(item, 1, 2000, false) || item.includes('\0')) add(`action.argv[${index}]`, '每一项写 1 到 2000 个字，不含空字符')
    })
  }
  if (action.timeoutSeconds !== undefined && !isWhole(action.timeoutSeconds, WORK_TIMEOUT_MIN_SECONDS, WORK_TIMEOUT_MAX_SECONDS)) {
    add('action.timeoutSeconds', `超时要写成 ${WORK_TIMEOUT_MIN_SECONDS} 到 ${WORK_TIMEOUT_MAX_SECONDS} 之间的整数秒`)
  }
  checkDelivery(action, entry, add)
}

/** Which kinds each source may have; a kind in neither list is not a kind at all. */
const KINDS = {
  person: ['tell-main', 'script', 'check'],
  plugin: ['tell-main', 'harness', 'self'],
} as const
const ALL_KINDS: readonly string[] = ['tell-main', 'harness', 'script', 'check', 'self']

function checkAction(entry: Rec, origin: 'person' | 'plugin', context: EntryContext, add: Add): void {
  const action = entry.action
  if (action === undefined) return add('action', '必填')
  if (!isRecord(action)) return add('action', '动作要写成一个对象')
  const kind = action.kind
  if (typeof kind !== 'string' || !ALL_KINDS.includes(kind)) return add('action.kind', '不认识的动作')
  if (!(KINDS[origin] as readonly string[]).includes(kind)) {
    return add('action.kind', origin === 'person' ? '人的条目只能是告诉主 Agent、跑脚本或跑检查' : '插件交来的条目只能是告诉主 Agent、harness 动作或自己做：会跑东西的条目只经人同意那一条路')
  }
  if (kind === 'tell-main') checkTell(action, 'action', ['kind'], entry, context, add)
  else if (kind === 'harness') {
    checkKeys(action, ['kind', 'action', 'tell'], 'action.', add)
    if (typeof action.action !== 'string' || context.actions?.has(action.action) !== true) add('action.action', '这个动作不在交来它的那一份列的动作里')
    if (action.tell !== undefined) checkTell(action.tell, 'action.tell', [], entry, context, add)
  }
  else if (kind === 'self') {
    checkKeys(action, ['kind', 'does', 'by'], 'action.', add)
    if (!isText(action.does, 1, 500)) add('action.does', '“做什么”写一行，1 到 500 个字')
    if (!isText(action.by, 1, 64)) add('action.by', '“谁来做”写 1 到 64 个字符')
  }
  else if (kind === 'script') checkScript(action, entry, add)
  else checkCheck(action, entry, add)
}

/** The rule of `when` the action decides: telling the main agent wakes it, a plugin's self entry is done by the host, anything else runs something. */
function modeOf(action: unknown): 'tell-main' | 'self' | 'work' {
  const kind = isRecord(action) ? action.kind : undefined
  return kind === 'tell-main' ? 'tell-main' : kind === 'self' ? 'self' : 'work'
}

function checkWhen(entry: Rec, origin: 'person' | 'plugin', context: EntryContext, add: Add): void {
  const when = entry.when
  if (when === undefined) return add('when', '必填')
  const options = { allowGate: false, origin, now: context.now, action: modeOf(entry.action) } as const
  const filter = entry.filter as EventFilter | undefined
  const issues = (trigger: Trigger): void => {
    for (const issue of validateWhen(trigger, filter, context.table, options)) add(issue.path, issue.message)
  }
  if (!isRecord(when) || when.kind !== 'event' || !Array.isArray(when.events) || origin !== 'plugin') return issues(when as unknown as Trigger)
  const waiting = when.events.filter((id: unknown): id is string => typeof id === 'string' && !context.table.has(id) && context.absent?.has(id) === true)
  if (waiting.length === 0) return issues(when as unknown as Trigger)
  // Some events are not declared yet: check what the declared ones allow now, the rest when they arrive.
  if (when.events.length > 4) add('when.events', '事件要写 1 到 4 个')
  const known = when.events.filter((id: unknown) => !waiting.includes(id as string))
  if (known.length > 0) issues({ ...when, events: known } as unknown as Trigger)
  else if (filter !== undefined && !isRecord(filter)) add('filter', '筛选要写成一个对象：字段名对应一种比法')
}

function checkLimits(limits: unknown, add: Add): void {
  if (!isRecord(limits)) return add('limits', '写成 {debounceSeconds, maxPerHour}')
  checkKeys(limits, ['debounceSeconds', 'maxPerHour'], 'limits.', add)
  if (limits.debounceSeconds !== undefined && !isWhole(limits.debounceSeconds, 0, 3600)) add('limits.debounceSeconds', '去抖写成 0 到 3600 之间的整数秒')
  if (limits.maxPerHour !== undefined && !isWhole(limits.maxPerHour, 1, 60)) add('limits.maxPerHour', '每小时至多写成 1 到 60 之间的整数')
}

function checkQuiet(quiet: unknown, entry: Rec, add: Add): void {
  const tellsOnEvent = isRecord(entry.when) && entry.when.kind === 'event' && isRecord(entry.action) && entry.action.kind === 'tell-main'
  if (!tellsOnEvent) add('quiet', '安静时段只配“告诉主 Agent”的事件条目')
  if (!isRecord(quiet)) return add('quiet', '写成 {from, to}，都是 HH:MM')
  checkKeys(quiet, ['from', 'to'], 'quiet.', add)
  const from = typeof quiet.from === 'string' && CLOCK.test(quiet.from)
  const to = typeof quiet.to === 'string' && CLOCK.test(quiet.to)
  if (!from) add('quiet.from', 'from 写成 HH:MM（00:00 到 23:59）')
  if (!to) add('quiet.to', 'to 写成 HH:MM（00:00 到 23:59）')
  else if (from && quiet.from === quiet.to) add('quiet.to', 'from 和 to 不能相同')
}

function checkOwnRules(rules: unknown, add: Add): void {
  if (!Array.isArray(rules) || rules.length > 6) return add('ownRules', '自己的规矩写成列表，至多 6 行')
  rules.forEach((line: unknown, index) => {
    if (!isText(line, 1, 80)) add(`ownRules[${index}]`, '每行写 1 到 80 个字，一行')
  })
}

/**
 * Everything wrong with an entry, empty when it is sound (design §12): the fields and their ranges, `when` and
 * `filter` through the shared validateWhen with the rule the action decides, the action of the source (a person may
 * tell the main agent, run a script or run a check; a plugin may tell the main agent, run a harness action it lists,
 * or do the thing itself), placeholders against the events' declarations, limits, quiet time and scope. A `{name}`
 * is a field every listed event declares; a time entry has none. The writer gives no `source`, `rev` or `status`.
 * Each issue has the field path and a sentence for a person. Never throws, whatever it is given.
 */
export function validateEntry(input: unknown, origin: 'person' | 'plugin', context: EntryContext): readonly TriggerIssue[] {
  if (!isRecord(input)) return [{ path: 'entry', message: '条目要写成一个对象' }]
  const seen = new Set<string>()
  const issues: TriggerIssue[] = []
  const add: Add = (path, message) => {
    if (seen.has(`${path}\n${message}`)) return
    seen.add(`${path}\n${message}`)
    issues.push({ path, message })
  }
  const entry = input
  checkKeys(entry, FIELDS, '', add)
  if (!(typeof entry.id === 'string' && (origin === 'person' ? PERSON_ID : PLUGIN_ID).test(entry.id))) {
    add('id', origin === 'person' ? 'id 写成 u- 加 8 位小写十六进制' : 'id 写成 <名字空间>.<名>，例 execute.release')
  }
  if (!(typeof entry.title === 'string' && isText(entry.title.trim(), 1, 60) && !LINE_BREAK.test(entry.title))) add('title', '标题要写 1 到 60 个字，一行')
  if (entry.why === undefined ? origin === 'plugin' : !isText(entry.why, 1, 150)) add('why', '为什么有它，写 1 到 150 个字，一行')
  if (entry.basis !== undefined && !isText(entry.basis, 1, 80)) add('basis', '依据写 1 到 80 个字，一行')
  if (entry.ownRules !== undefined) checkOwnRules(entry.ownRules, add)
  checkWhen(entry, origin, context, add)
  checkAction(entry, origin, context, add)
  if (entry.limits !== undefined) checkLimits(entry.limits, add)
  if (entry.quiet !== undefined) checkQuiet(entry.quiet, entry, add)
  if (entry.scope !== undefined && !(entry.scope === 'project' || (entry.scope === 'machine' && origin === 'plugin'))) add('scope', 'scope 写 project；machine 只给通道包交来的条目')
  return issues
}

const PROPOSAL_ID = /^lp-[0-9a-f]{8}$/

/** Everything wrong with the `source` of a person's entry, empty when it is sound. */
function personSourceIssues(source: unknown): readonly TriggerIssue[] {
  if (!isRecord(source)) return [{ path: 'source', message: '来源写成 {kind, at, via, relay, proposal}' }]
  const issues: TriggerIssue[] = []
  const add: Add = (path, message) => { issues.push({ path, message }) }
  checkKeys(source, ['kind', 'at', 'via', 'relay', 'question', 'proposal'], 'source.', add)
  if (source.kind !== 'person') add('source.kind', 'kind 写 person')
  if (typeof source.at !== 'string' || Number.isNaN(Date.parse(source.at))) add('source.at', 'at 写成 ISO 8601 时刻')
  if (source.via !== 'chat' && source.via !== 'board') add('source.via', 'via 写 chat 或 board')
  if (!isText(source.relay, 1, 2000, false)) add('source.relay', '原话写 1 到 2000 个字')
  if (source.question !== undefined && !isText(source.question, 1, 100)) add('source.question', '问题的 id 写 1 到 100 个字符')
  if (typeof source.proposal !== 'string' || !PROPOSAL_ID.test(source.proposal)) add('source.proposal', '提议的 id 写成 lp- 加 8 位小写十六进制')
  return issues
}

/**
 * Everything wrong with the content of a person's entry file, empty when it is sound: the definition goes through
 * `validateEntry` as a person's, the `source` through its own check. A file is read against the moment the person
 * agreed (`context.now` is `source.at`): a `once` entry is later than that moment, whenever the file is read.
 */
export function validatePersonEntry(input: unknown, context: EntryContext): readonly TriggerIssue[] {
  if (!isRecord(input)) return [{ path: 'entry', message: '条目要写成一个对象' }]
  const { source, ...definition } = input
  return [...validateEntry(definition, 'person', context), ...personSourceIssues(source)]
}

/** The order the keys of an entry file have, so that a change reads as a small `git diff`. */
const FILE_ORDER = ['id', 'title', 'why', 'when', 'filter', 'action', 'limits', 'quiet', 'scope', 'basis', 'ownRules', 'source'] as const

/** The value with the keys of every object in code point order; lists keep their order. */
function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortedKeys(value[key])]))
}

/**
 * The bytes of a person's entry file (design §9.1): JSON with two-space indentation, the entry's own fields in a
 * fixed order and the keys inside them in code point order, one line break at the end. One entry has one text, so
 * the digest of the file says whether the entry is as the board wrote it.
 */
export function entryFileText(entry: PersonEntry): string {
  const record = entry as unknown as Rec
  return `${JSON.stringify(Object.fromEntries(FILE_ORDER.filter(key => record[key] !== undefined).map(key => [key, sortedKeys(record[key])])), null, 2)}\n`
}
