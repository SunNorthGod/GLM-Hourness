/**
 * The loop board's registry (docs/ORCHESTRATION.md §18.4; loop board design 0.6
 * §3.1, §3.2): what the rows hand to `contribute` and what the board makes of
 * it. `validateContribution` is the pure check of one hand-over, `createRegistry`
 * holds the hand-overs in memory and answers with the entries and the event
 * table as they stand.
 *
 * The board takes entries and events from the rows that own them and defines
 * none of theirs: M7, M4 and the channel package hand their own tables over.
 * An entry may name an event nobody declares at the moment (the row that
 * declares it is off, or not loaded yet); it is kept and listed as waiting,
 * and it runs when the event is declared. Every change of the held hand-overs
 * checks all of them again against the others, so an entry whose event
 * arrives and does not fit it is dropped then, and told to the row health.
 *
 * What is wrong with a hand-over is told once per source, item and reason, to
 * `report` (the row's health), and returned to the caller in `dropped`.
 */
import { createHash } from 'node:crypto'
import { plainWordsIn } from '../graph/plain-question.ts'
import { canonicalJson } from '../rules/model.ts'
import { pluginLabel } from '../shared/plugin-labels.ts'
import { CHANNEL_SOURCE } from './channel.ts'
import { LOOP_EVENT_TABLE } from './events.ts'
import { validateEntry, type LoopEntry, type LoopEntryDefinition } from './model.ts'
import { DETAILS_MAX_LINES, DETAILS_MAX_WIDTH, type ContributeResult, type Contribution, type ContributionSource } from './service.ts'
import type { LoopEventDeclaration } from './trigger.ts'
import type { DetailsRead, ViewCheck } from './view.ts'

/** Who the loop row is when it hands its own entries over. */
export const LOOPS_SOURCE: ContributionSource = { plugin: 'dsh-hourness', row: 'glm-hourness/loops' }
/** The row whose events are named `hourness.` (the name M7 chose before the board existed), and the row that may declare gating events. */
const EXECUTE_ROW = 'glm-hourness/execute'
const RULES_ROW = 'glm-hourness/rules'

const MAX_ENTRIES = 32
const MAX_EVENTS = 16
const MAX_ACTIONS = 16
const MAX_FIELDS = 16

const PLUGIN_NAME = /^[a-z0-9@/._-]{1,64}$/
const ROW_NAME = /^[a-z0-9/._-]{1,64}$/
const DOTTED_ID = /^[a-z][a-z0-9-]{0,15}\.[a-z0-9-]{1,48}$/
const FIELD_NAME = /^[a-z][A-Za-z0-9]{0,31}$/
const EVENT_KEYS = ['id', 'title', 'fields', 'params', 'personSelectable', 'gateOnErrorDefault', 'listedOnly']
const FIELD_TYPES: readonly unknown[] = ['string', 'number', 'boolean', 'strings']
const PARAM_TYPES: readonly unknown[] = ['string', 'number', 'boolean']
/** The type each comparison is for. */
const COMPARES: Readonly<Record<string, string>> = { in: 'string', is: 'boolean', atLeast: 'number', paths: 'strings' }
/** The package that brings the events of a namespace, for the sentence about an event nobody declares. */
const EVENT_HOMES: ReadonlyMap<string, string> = new Map([['hourness', 'dsh-hourness'], ['env', 'dsh-hourness'], ['graph', 'dsh-hourness'], ['channel', 'dsh-glm-zcode']])
/** The most checks a hand-over gives the page of one entry (service.ts `checks`). */
const PAGE_CHECKS = 10
/** The outer shape of one check the page lists: a key, a title and a timeout with a positive number; the page checks the rest of the timeout itself (plain-ui 1.3 §8.2). */
function isViewCheck(value: unknown): value is ViewCheck {
  if (!isRecord(value) || typeof value.key !== 'string' || typeof value.title !== 'string' || !isRecord(value.timeout)) return false
  const seconds = value.timeout.seconds
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
}

type Rec = Readonly<Record<string, unknown>>

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isText(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && [...value].length >= min && [...value].length <= max && !/[\r\n]/.test(value)
}

interface Dropped {
  readonly id: string
  readonly reason: string
}

interface CheckedEntry {
  readonly definition: LoopEntryDefinition
  /** The events of the entry that nobody declares now, in the entry's order. */
  readonly waitingOn: readonly string[]
  /** The words a person has not learned (src/graph/plain-question.ts) in the title and why. */
  readonly plainWords: readonly string[]
}

interface ContributionContext {
  /** The events declared already: the board's own and the other holders'. */
  readonly table: ReadonlyMap<string, LoopEventDeclaration>
  /** The namespaces the other holders hold, with the key of the holder. */
  readonly owners: ReadonlyMap<string, string>
  readonly now: Date
}

type ContributionCheck =
  | { readonly ok: false, readonly reason: string }
  | {
    readonly ok: true
    readonly namespace: string | undefined
    readonly events: readonly LoopEventDeclaration[]
    readonly actions: readonly { readonly id: string, readonly title: string }[]
    readonly entries: readonly CheckedEntry[]
    readonly dropped: readonly Dropped[]
  }

/** The text of a source that may not even be an object, for a sentence and a key. */
function describe(source: unknown): { readonly plugin: string, readonly row: string } {
  const read = (key: string): string => {
    const value: unknown = isRecord(source) ? source[key] : undefined
    return typeof value === 'string' ? value : String(value)
  }
  return { plugin: read('plugin'), row: read('row') }
}

const keyOf = (source: unknown): string => `${describe(source).plugin}\n${describe(source).row}`

function sourceProblem(source: unknown): string | undefined {
  const { plugin, row } = describe(source)
  if (!isRecord(source) || typeof source.plugin !== 'string' || !PLUGIN_NAME.test(plugin)) return '来源的包名写成小写字母、数字和 @/._- ，1 到 64 个字符'
  if (typeof source.row !== 'string' || !ROW_NAME.test(row)) return '来源的行 id 写成小写字母、数字和 /._- ，1 到 64 个字符'
  return undefined
}

const idOf = (item: unknown): string => (isRecord(item) && typeof item.id === 'string' ? item.id : '')
const namespaceOf = (id: string): string | undefined => (DOTTED_ID.test(id) ? id.slice(0, id.indexOf('.')) : undefined)

/** What an item is called in `dropped`: its id, or its place in the list when it has none. */
const labelOf = (item: unknown, list: string, index: number): string => idOf(item) || `${list}[${index}]`

function listOf(value: unknown, list: string, dropped: Dropped[]): readonly unknown[] {
  if (value === undefined) return []
  if (Array.isArray(value)) return value
  dropped.push({ id: list, reason: `${list}：要写成列表` })
  return []
}

function fieldProblems(fields: unknown, gating: boolean, add: (path: string, message: string) => void): void {
  if (!Array.isArray(fields)) return add('fields', '字段写成列表')
  if (fields.length > MAX_FIELDS) add('fields', `至多 ${MAX_FIELDS} 个字段`)
  const names = new Set<string>()
  fields.forEach((field: unknown, index) => {
    const base = `fields[${index}]`
    if (!isRecord(field)) return add(base, '写成一个对象')
    for (const key of Object.keys(field)) if (field[key] !== undefined && !['name', 'type', 'title', 'filter'].includes(key)) add(`${base}.${key}`, '没有这个字段')
    const name = field.name
    if (typeof name !== 'string' || !FIELD_NAME.test(name)) add(`${base}.name`, '名字用小写字母开头、只含字母和数字，至多 32 个字符')
    else if (name === 'at' || (name === 'session' && !gating)) add(`${base}.name`, `${name} 是收件箱信封里的字段，不能再声明`)
    else if (names.has(name)) add(`${base}.name`, '重复了')
    else names.add(name)
    if (!FIELD_TYPES.includes(field.type)) add(`${base}.type`, 'type 写 string、number、boolean 或 strings')
    if (!isText(field.title, 1, 20)) add(`${base}.title`, '字段的名字写 1 到 20 个字')
    if (field.filter !== undefined && !(typeof field.filter === 'string' && Object.hasOwn(COMPARES, field.filter) && COMPARES[field.filter] === field.type)) {
      add(`${base}.filter`, `比法写 ${Object.keys(COMPARES).join('、')} 之一，且要合字段的类型（in 配 string，is 配 boolean，atLeast 配 number，paths 配 strings）`)
    }
  })
}

function paramProblems(params: unknown, add: (path: string, message: string) => void): void {
  if (params === undefined) return
  if (!Array.isArray(params)) return add('params', '参数写成列表')
  if (params.length > MAX_FIELDS) add('params', `至多 ${MAX_FIELDS} 个参数`)
  const names = new Set<string>()
  params.forEach((param: unknown, index) => {
    const base = `params[${index}]`
    if (!isRecord(param)) return add(base, '写成一个对象')
    for (const key of Object.keys(param)) if (param[key] !== undefined && !['name', 'type', 'title', 'required', 'min', 'max'].includes(key)) add(`${base}.${key}`, '没有这个字段')
    if (typeof param.name !== 'string' || !FIELD_NAME.test(param.name)) add(`${base}.name`, '名字用小写字母开头、只含字母和数字，至多 32 个字符')
    else if (names.has(param.name)) add(`${base}.name`, '重复了')
    else names.add(param.name)
    if (!PARAM_TYPES.includes(param.type)) add(`${base}.type`, 'type 写 string、number 或 boolean')
    if (!isText(param.title, 1, 20)) add(`${base}.title`, '参数的名字写 1 到 20 个字')
    if (typeof param.required !== 'boolean') add(`${base}.required`, 'required 写成是或否')
    for (const bound of ['min', 'max'] as const) {
      if (param[bound] !== undefined && !(param.type === 'number' && typeof param[bound] === 'number' && Number.isFinite(param[bound]))) add(`${base}.${bound}`, `${bound} 只配数字参数，写成数字`)
    }
  })
}

/** Why one declared event does not hold, in the form `path：sentence` joined with `；`, or undefined when it holds. */
function eventProblem(raw: unknown, namespace: string, exempt: (id: string) => boolean, declared: (id: string) => boolean): string | undefined {
  if (!isRecord(raw)) return 'event：要写成一个对象'
  const found: string[] = []
  const add = (path: string, message: string): void => { found.push(`${path}：${message}`) }
  for (const key of Object.keys(raw)) if (raw[key] !== undefined && !EVENT_KEYS.includes(key)) add(key, '没有这个字段')
  const id = raw.id
  if (typeof id !== 'string' || !DOTTED_ID.test(id)) add('id', '事件 id 写成 <名字空间>.<名>')
  else if (!exempt(id) && !id.startsWith(`${namespace}.`)) add('id', `要以 ${namespace}. 开头`)
  else if (declared(id)) add('id', '这一个事件已经有人声明了')
  if (!isText(raw.title, 1, 60)) add('title', '事件的名字写 1 到 60 个字，一行')
  fieldProblems(raw.fields, typeof id === 'string' && id.startsWith('gate.'), add)
  paramProblems(raw.params, add)
  if (typeof raw.personSelectable !== 'boolean') add('personSelectable', '写成是或否：人能不能在自己的条目里选它')
  const gateDefault = raw.gateOnErrorDefault
  if (gateDefault !== undefined && !(typeof id === 'string' && id.startsWith('gate.') && (gateDefault === 'allow' || gateDefault === 'block'))) add('gateOnErrorDefault', '只有拦路的事件有，写 allow 或 block')
  if (raw.listedOnly !== undefined && typeof raw.listedOnly !== 'boolean') add('listedOnly', '写成是或否')
  return found.length === 0 ? undefined : found.join('；')
}

function idProblem(id: unknown, namespace: string, seen: ReadonlySet<string>): string | undefined {
  if (typeof id !== 'string' || !DOTTED_ID.test(id)) return 'id：写成 <名字空间>.<名>，例 execute.release'
  if (!id.startsWith(`${namespace}.`)) return `id：要以 ${namespace}. 开头`
  if (seen.has(id)) return 'id：这一份里重复了'
  return undefined
}

function actionProblem(raw: unknown, namespace: string, seen: ReadonlySet<string>, hasRun: boolean): string | undefined {
  if (!isRecord(raw)) return 'action：要写成一个对象'
  const found: string[] = []
  for (const key of Object.keys(raw)) if (raw[key] !== undefined && key !== 'id' && key !== 'title') found.push(`${key}：没有这个字段`)
  const identity = idProblem(raw.id, namespace, seen)
  if (identity !== undefined) found.push(identity)
  if (!isText(raw.title, 1, 60)) found.push('title：动作的名字写 1 到 60 个字，一行')
  if (!hasRun) found.push('run：这一份列了动作却没有 run，动作跑不了')
  return found.length === 0 ? undefined : found.join('；')
}

/** The events of an entry the board does not have, that the part declaring them may still bring. */
function mayArrive(id: string): boolean {
  return DOTTED_ID.test(id) && !id.startsWith('loops.') && !id.startsWith('gate.')
}

function eventsOf(raw: unknown): readonly string[] {
  const when = isRecord(raw) && isRecord(raw.when) ? raw.when : undefined
  return when?.kind === 'event' && Array.isArray(when.events) ? when.events.filter((id: unknown): id is string => typeof id === 'string') : []
}

/**
 * Check one hand-over against what the board knows. A hand-over is refused as a whole when the source is not a plugin
 * and a row, when a namespace is the loop row's (`loops`), the execution row's (`hourness`), nobody's (`channel`) or
 * the rules row's (`gate`, which declares gating events only), or when another source holds the namespace; everything
 * else is dropped item by item. The namespace is that of the first entry (else the first action, else the first
 * event), and every id of the hand-over starts with it; the execution row's events start with `hourness.`. At most 32 entries, 16 events and 16
 * actions. A `script` or `check` entry, a machine scope and the rules row's entries are dropped. Pure; never throws.
 */
export function validateContribution(source: ContributionSource, contribution: Contribution, context: ContributionContext): ContributionCheck {
  const refused = sourceProblem(source)
  if (refused !== undefined) return { ok: false, reason: refused }
  const { row } = describe(source)
  const dropped: Dropped[] = []
  const body: Rec = isRecord(contribution) ? contribution : {}
  if (!isRecord(contribution)) dropped.push({ id: 'contribution', reason: '交来的东西要写成一个对象' })
  const events = listOf(body.events, 'events', dropped)
  const entries = listOf(body.entries, 'entries', dropped)
  const actions = listOf(body.actions, 'actions', dropped)

  const exempt = (id: string): boolean => row === EXECUTE_ROW && id.startsWith('hourness.')
  const noGate = { ok: false, reason: `${row} 不能声明拦路的事件` } as const
  if (row !== RULES_ROW && events.some(item => idOf(item).startsWith('gate.'))) return noGate
  const namespace = [...entries, ...actions, ...events.filter(item => !exempt(idOf(item)))].map(item => namespaceOf(idOf(item))).find(found => found !== undefined)
    ?? (events.some(item => exempt(idOf(item))) ? 'hourness' : undefined)
  if (namespace === 'gate' && row !== RULES_ROW) return noGate
  if (namespace === 'loops' && row !== LOOPS_SOURCE.row) return { ok: false, reason: 'loops 留给循环行' }
  if (namespace === 'channel') return { ok: false, reason: 'channel 是通道事件的名字空间，不能由一份交来的东西占用' }
  if (namespace === 'hourness' && row !== EXECUTE_ROW) return { ok: false, reason: `hourness 留给执行行（${EXECUTE_ROW}），hourness. 的事件只从它收` }
  const holder = namespace === undefined ? undefined : context.owners.get(namespace)
  if (holder !== undefined && holder !== keyOf(source)) return { ok: false, reason: `${namespace} 已由 ${holder.slice(holder.indexOf('\n') + 1)} 交过` }
  const space = namespace ?? ''

  const accepted: LoopEventDeclaration[] = []
  const lost = new Set<string>()
  const known = new Set<string>()
  events.forEach((raw, index) => {
    const reason = index >= MAX_EVENTS ? `events：一份至多 ${MAX_EVENTS} 个事件，多出的丢掉` : eventProblem(raw, space, exempt, id => known.has(id) || context.table.has(id))
    if (reason === undefined) {
      known.add(idOf(raw))
      accepted.push(raw as LoopEventDeclaration)
      return
    }
    lost.add(idOf(raw))
    dropped.push({ id: labelOf(raw, 'events', index), reason })
  })

  const hasRun = typeof body.run === 'function'
  const listed: { readonly id: string, readonly title: string }[] = []
  const seenActions = new Set<string>()
  actions.forEach((raw, index) => {
    const reason = index >= MAX_ACTIONS ? `actions：一份至多 ${MAX_ACTIONS} 个动作，多出的丢掉` : actionProblem(raw, space, seenActions, hasRun)
    if (reason === undefined) {
      const action = raw as { readonly id: string, readonly title: string }
      seenActions.add(action.id)
      listed.push(action)
    }
    else dropped.push({ id: labelOf(raw, 'actions', index), reason })
  })

  const table = new Map([...context.table, ...accepted.map(declared => [declared.id, declared] as const)])
  const checked: CheckedEntry[] = []
  const seenEntries = new Set<string>()
  entries.forEach((raw, index) => {
    const label = labelOf(raw, 'entries', index)
    const reject = (reason: string): void => { dropped.push({ id: label, reason }) }
    if (index >= MAX_ENTRIES) return reject(`entries：一份至多 ${MAX_ENTRIES} 项条目，多出的丢掉`)
    const identity = idProblem(idOf(raw), space, seenEntries)
    if (identity !== undefined) return reject(identity)
    if (row === RULES_ROW) return reject('entries：规则板的条目在规则板上，这里只收它的拦路事件')
    const absent = new Set(eventsOf(raw).filter(id => !table.has(id) && !lost.has(id) && mayArrive(id)))
    const found = validateEntry(raw, 'plugin', { table, now: context.now, actions: new Set(listed.map(action => action.id)), absent }).map(issue => `${issue.path}：${issue.message}`)
    if (isRecord(raw) && raw.scope === 'machine') found.push('scope：machine 只给通道包的两项，不收')
    if (found.length > 0) return reject(found.join('；'))
    seenEntries.add(idOf(raw))
    const definition = raw as LoopEntryDefinition
    checked.push({ definition, waitingOn: eventsOf(raw).filter(id => absent.has(id)), plainWords: plainWordsIn(`${definition.title}\n${definition.why ?? ''}`) })
  })
  return { ok: true, namespace, events: accepted, actions: listed, entries: checked, dropped }
}

/** One entry as the board lists it. */
interface RegisteredEntry {
  readonly entry: LoopEntry
  /** `waiting`: it names an event nobody declares now, so it is listed greyed and does not run. */
  readonly state: 'active' | 'waiting'
  readonly waitingOn: readonly string[]
  /** The sentence the page shows for a waiting entry. */
  readonly reason?: string
}

interface RegistryOptions {
  /** The clock, for the moment a `once` is measured against; default `new Date()`. */
  readonly now?: () => Date
  /** Told each distinct problem once, in words for the row health. */
  readonly report?: (message: string) => void
  /**
   * The channel events (src/loops/channel.ts), which the loop row puts out
   * itself from the pricing service and which are in the table only while that
   * service is there (design §4.3). They are not handed over: the `channel`
   * namespace belongs to no hand-over (§3.2).
   */
  readonly channel?: () => readonly LoopEventDeclaration[]
  /**
   * The channel's default entries (channel.ts `channelEntries`), read from the
   * same service and listed after the hand-overs. They are checked as any
   * plugin's entry is; one that does not hold is dropped and told once. Two of
   * them have the machine scope that no hand-over may have (design §3.4).
   */
  readonly channelEntries?: () => readonly LoopEntryDefinition[]
}

export interface LoopsRegistry {
  /** The `contribute` of the service (src/loops/service.ts). */
  contribute(source: ContributionSource, contribution: Contribution): ContributeResult
  /** Every accepted entry of every held hand-over, in the order the sources first handed over. */
  entries(): readonly RegisteredEntry[]
  /** The event table as it stands: the loop row's own events and the held hand-overs' accepted ones. */
  events(): ReadonlyMap<string, LoopEventDeclaration>
  /**
   * The `run` of the hand-over that brought this entry, with the action ids it
   * listed: how the runner executes a harness entry (design §6.5). Undefined
   * when no held hand-over has the entry, or when its source listed actions
   * without handing a `run` over.
   */
  actionOf(entry: string): { readonly run: NonNullable<Contribution['run']>, readonly actions: readonly string[] } | undefined
  /**
   * The `run` of the hand-over that listed this harness action, for the loop
   * row's own action to call another row's (design §6.9 item 4 row 3, the
   * execute row's resume action). Undefined while nobody lists it — M7 does
   * not exist yet — which is how the table skips its row 3.
   */
  runOfAction(action: string): NonNullable<Contribution['run']> | undefined
  /** The row that declared this event (`<row>` of its hand-over), for the record of what handed an event over; undefined for an event nobody declares. */
  declarerOf(event: string): string | undefined
  /**
   * The checks the hand-over that brought this entry gives the page for one
   * project (plain-ui 1.3 §8.2): at most 10 of the page's shape. Undefined
   * when no held hand-over has the entry, or its `checks` is absent, throws
   * or hands something that is not a list (the reason is told once); items
   * of the wrong outer shape are left out and told. The page checks the
   * inside of each timeout itself.
   */
  checksOf(entry: string, project: string): readonly ViewCheck[] | undefined
  /**
   * What the hand-over that brought this entry gives the page for one project root (design §3.1 `details`):
   * undefined when no held hand-over has the entry or its source gives no details; otherwise the lines, or why
   * the page cannot show them (the call threw, or its answer broke the limits of service.ts). Never throws.
   */
  detailsOf(entry: string, project: string): DetailsRead | undefined
}

/** A hand-over's answer to `details` as the page can show it: a list of single lines within the limits of service.ts. */
function detailsRead(lines: unknown): DetailsRead {
  if (!Array.isArray(lines)) return { ok: false, reason: '给的不是一张列表' }
  if (lines.length > DETAILS_MAX_LINES) return { ok: false, reason: `给了 ${lines.length} 行，至多 ${DETAILS_MAX_LINES} 行` }
  const bad = lines.findIndex(line => !isText(line, 1, DETAILS_MAX_WIDTH))
  if (bad >= 0) return { ok: false, reason: `第 ${bad + 1} 行不是 1 到 ${DETAILS_MAX_WIDTH} 个字的一行` }
  return { ok: true, lines: lines as readonly string[] }
}

/** "Event X is nobody's now (the part of <package> is off); this entry does not run." */
function waitingReason(ids: readonly string[]): string {
  const groups = new Map<string, string[]>()
  for (const id of ids) {
    const home = EVENT_HOMES.get(id.slice(0, id.indexOf('.')))
    const label = home === undefined ? '' : `（${pluginLabel(home)}的这一部分没启用）`
    groups.set(label, [...groups.get(label) ?? [], id])
  }
  return `${[...groups].map(([label, events]) => `${events.map(id => `「${id}」`).join('、')}现在没有谁报${label}`).join('；')}，这一项现在不跑`
}

const revOf = (definition: LoopEntryDefinition): string => createHash('sha256').update(canonicalJson(definition)).digest('hex').slice(0, 12)

interface Held {
  readonly token: object
  readonly source: ContributionSource
  readonly contribution: Contribution
  check: Extract<ContributionCheck, { readonly ok: true }>
}

export function createRegistry(options: RegistryOptions = {}): LoopsRegistry {
  const clock = options.now ?? ((): Date => new Date())
  const told = new Set<string>()
  const say = (message: string): void => {
    if (told.has(message)) return
    told.add(message)
    options.report?.(message)
  }
  const holders = new Map<string, Held>()

  const contextFor = (skip: string | undefined): ContributionContext => {
    const table = new Map([...LOOP_EVENT_TABLE, ...(options.channel?.() ?? []).map(declared => [declared.id, declared] as const)])
    const owners = new Map<string, string>()
    for (const [key, held] of holders) {
      if (key === skip) continue
      for (const declared of held.check.events) table.set(declared.id, declared)
      if (held.check.namespace !== undefined) owners.set(held.check.namespace, key)
    }
    return { table, owners, now: clock() }
  }

  /** Check every held hand-over again against the others and tell what is new. */
  const settle = (): void => {
    for (const [key, held] of holders) {
      const check = validateContribution(held.source, held.contribution, contextFor(key))
      if (!check.ok) continue
      held.check = check
      const who = `${held.source.plugin} 的 ${held.source.row}`
      for (const item of check.dropped) say(`${who} 交来的 ${item.id} 读不懂：${item.reason}`)
      for (const entry of check.entries) if (entry.plainWords.length > 0) say(`${entry.definition.id} 的说法里有 ${entry.plainWords.join('、')}`)
    }
  }

  /**
   * The channel's entries as they stand: each checked as a plugin's entry
   * against the table of the moment, with the words a person has not learned
   * told once. An id a hand-over already uses is the hand-over's.
   */
  const channelListed = (taken: ReadonlySet<string>): RegisteredEntry[] => {
    const definitions = options.channelEntries?.() ?? []
    if (definitions.length === 0) return []
    const context = contextFor(undefined)
    const who = `${CHANNEL_SOURCE.plugin} 的 ${CHANNEL_SOURCE.row}`
    return definitions.flatMap((definition): RegisteredEntry[] => {
      const found = validateEntry(definition, 'plugin', { table: context.table, now: context.now }).map(issue => `${issue.path}：${issue.message}`)
      if (taken.has(definition.id)) found.push('id：已由另一份交来的条目用了')
      if (found.length > 0) {
        say(`${who} 交来的 ${definition.id} 读不懂：${found.join('；')}`)
        return []
      }
      const words = plainWordsIn(`${definition.title}\n${definition.why ?? ''}`)
      if (words.length > 0) say(`${definition.id} 的说法里有 ${words.join('、')}`)
      return [{ entry: { ...definition, source: { kind: 'plugin', plugin: CHANNEL_SOURCE.plugin, row: CHANNEL_SOURCE.row }, rev: revOf(definition) }, state: 'active', waitingOn: [] }]
    })
  }

  return {
    contribute(source, contribution) {
      const key = keyOf(source)
      const check = validateContribution(source, contribution, contextFor(key))
      if (!check.ok) {
        const { plugin, row } = describe(source)
        say(`${plugin} 的 ${row} 交来的整份被拒：${check.reason}`)
        return { ok: false, reason: check.reason }
      }
      const token = {}
      holders.set(key, { token, source, contribution, check })
      settle()
      const standing = holders.get(key)?.check ?? check
      return {
        ok: true,
        dispose: () => {
          if (holders.get(key)?.token !== token) return
          holders.delete(key)
          settle()
        },
        accepted: standing.entries.map(entry => entry.definition.id),
        dropped: standing.dropped,
      }
    },
    entries() {
      const handed = [...holders.values()].flatMap(held => held.check.entries.map((item): RegisteredEntry => {
        const entry: LoopEntry = { ...item.definition, source: { kind: 'plugin', plugin: held.source.plugin, row: held.source.row }, rev: revOf(item.definition) }
        return item.waitingOn.length === 0
          ? { entry, state: 'active', waitingOn: [] }
          : { entry, state: 'waiting', waitingOn: item.waitingOn, reason: waitingReason(item.waitingOn) }
      }))
      return [...handed, ...channelListed(new Set(handed.map(item => item.entry.id)))]
    },
    events() {
      return contextFor(undefined).table
    },
    declarerOf(event) {
      for (const held of holders.values()) {
        if (held.check.events.some(declared => declared.id === event)) return held.source.row
      }
      return undefined
    },
    actionOf(entry) {
      for (const held of holders.values()) {
        if (!held.check.entries.some(item => item.definition.id === entry)) continue
        const source = held.contribution
        if (typeof source.run !== 'function') return undefined
        // Called through the hand-over, so the row's own `this` is its own object.
        return { run: (action, event) => source.run?.(action, event) ?? Promise.resolve({ outcome: 'failed', reason: 'run 不在了' }), actions: held.check.actions.map(action => action.id) }
      }
      return undefined
    },
    checksOf(entry, project) {
      for (const held of holders.values()) {
        if (!held.check.entries.some(item => item.definition.id === entry)) continue
        const source = held.contribution
        if (typeof source.checks !== 'function') return undefined
        const who = `${held.source.plugin} 的 ${held.source.row} 给「${entry}」的`
        let checks: unknown
        try {
          // Called through the hand-over, so the row's own `this` is its own object.
          checks = source.checks(entry, project)
        }
        catch (error) {
          say(`${who} checks 抛错：${error instanceof Error ? error.message : String(error)}`)
          return undefined
        }
        if (!Array.isArray(checks)) {
          say(`${who} checks 不是一列，页面上不列`)
          return undefined
        }
        const first = (checks as readonly unknown[]).slice(0, PAGE_CHECKS)
        const listed = first.filter(isViewCheck)
        if (listed.length !== first.length) say(`${who} checks 有读不懂的项，页面上不列那几项`)
        return listed
      }
      return undefined
    },
    runOfAction(action) {
      for (const held of holders.values()) {
        if (!held.check.actions.some(listed => listed.id === action)) continue
        const source = held.contribution
        if (typeof source.run !== 'function') return undefined
        return (actionId, event) => source.run?.(actionId, event) ?? Promise.resolve({ outcome: 'failed', reason: 'run 不在了' })
      }
      return undefined
    },
    detailsOf(entry, project) {
      for (const held of holders.values()) {
        if (!held.check.entries.some(item => item.definition.id === entry)) continue
        const source = held.contribution
        if (typeof source.details !== 'function') return undefined
        try {
          // Called through the hand-over, so the row's own `this` is its own object.
          return detailsRead(source.details(entry, project))
        }
        catch (error) {
          return { ok: false, reason: `抛错：${error instanceof Error ? error.message : String(error)}` }
        }
      }
      return undefined
    },
  }
}
