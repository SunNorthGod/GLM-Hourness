/**
 * The rules board's model (docs/ORCHESTRATION.md §16; the full design is
 * .agents/tasks/rules/design.md §7.2): the state of one project, the journal
 * record that changes it, the part of the state a person decided (the file
 * in the repository), and the one function that says which peak level
 * applies. Pure types, validation and serialization; no Node built-in is
 * imported, so a client could import the file (as src/graph/parse.ts).
 *
 * The state holds the collections of the full board: rules, signals,
 * detectors, tickets, notices and script pins, each keyed by id. Two things
 * of the full design are left out on purpose: `root` (a digest that covers
 * the project path would fail every verification once the folder is renamed
 * or moved) and `proposals`, which only the path of a person's agreement can
 * fill and which that path brings with it.
 *
 * A collection that is empty is absent from what is stored and digested: in
 * the state, in the digest of every journal record and in the rules file
 * (`withoutEmptyCollections`). That is what lets the full board add its
 * collections without a migration: a state that has them empty digests like
 * one that does not have them, so what this slice wrote still replays.
 */
import { ID_PATTERN, STAGES } from '../graph/schema.ts'
import { validateScriptAction, validateWhen, type EventFilter, type ScriptAction, type ScriptLang, type ScriptRef, type Trigger, type TriggerIssue } from '../loops/trigger.ts'
import type { HealthRow, HealthState } from '../shared/health.ts'
import { PEAK_LEVEL_WORDS, type PeakLevel } from '../shared/peak-mode.ts'
import { detectorProblem, isCount, isRecord, isTime, matchesType, noticeProblem, originProblem, proposalProblem, scriptPinProblem, signalProblem, textField, ticketProblem, unknownKeys, type Problem } from './entries.ts'
import { GATE_EVENTS, RULES_EVENT_TABLE, type GateEvent } from './events.ts'
import { GLM_PEAK } from './signals.ts'

export type { PeakLevel } from '../shared/peak-mode.ts'

/** Who writes: the entry fixes it, a request cannot claim another (docs/ORCHESTRATION.md §16). */
export type RulesActor = 'human' | 'llm' | 'harness' | 'detector'

/** The level a project has when nobody chose one (the person's decision d-peak-mode). */
export const DEFAULT_PEAK_LEVEL: PeakLevel = 'reduce'

const LEVELS: readonly string[] = Object.keys(PEAK_LEVEL_WORDS)

/** The level a person's word names: the Chinese name or the stored value; undefined for anything else. */
export function parsePeakLevel(word: string): PeakLevel | undefined {
  const lowered = word.trim().toLowerCase()
  if (LEVELS.includes(lowered)) return lowered as PeakLevel
  return (Object.entries(PEAK_LEVEL_WORDS) as Array<[PeakLevel, { readonly name: string }]>).find(([, words]) => words.name === word.trim())?.[0]
}

/** The level a person chose, with when and by whose word; only a person's choice is stored. */
export interface PeakModeSetting {
  readonly level: PeakLevel
  readonly at: string
  readonly origin: { readonly actor: 'human' | 'llm', readonly relay?: string, readonly question?: string }
}

/** The level that applies and where it comes from: one place decides the factory default. */
export function effectivePeakMode(state: { readonly peakMode?: PeakModeSetting }): { readonly level: PeakLevel, readonly origin: 'default' | 'human', readonly at?: string } {
  if (state.peakMode === undefined) return { level: DEFAULT_PEAK_LEVEL, origin: 'default' }
  return { level: state.peakMode.level, origin: 'human', at: state.peakMode.at }
}

/** A journal line that did not take effect on replay, listed until a person handles it. */
export interface SkippedRecord {
  /** First 12 hex digits of the SHA-256 of the line's bytes; also its key in `unresolved`. */
  readonly key: string
  /** `<seq of the recovered record that registered it>-<index>`; assigned when the recovered record is written, so it stays the same on replay. */
  readonly label: string
  readonly seq?: number
  /** The last record that took effect before it. */
  readonly afterSeq: number
  /** `covered-by-anchor`: after a break, an anchor record holds the full state; the line cannot change it. */
  readonly why: 'digest-mismatch' | 'after-unreadable' | 'unreadable' | 'covered-by-anchor'
  readonly coveredBy?: number
  readonly actor?: string
  readonly op?: string
  readonly target?: string
}

export type RecoveryReason = 'snapshot-behind' | 'snapshot-corrupt' | 'snapshot-modified' | 'journal-shorter' | 'journal-tail' | 'journal-unreadable' | 'journal-not-engine'

/** What a rebuild of the state says, by its reason (design §7.5): the row's health line (row-health.ts) and the rules page's recovery group. */
export const RECOVERED_TEXT: Readonly<Record<RecoveryReason, string>> = {
  'snapshot-behind': '存档没跟上变更记录，已补上',
  'snapshot-corrupt': '规则板的存档坏了（被清零、截断或读不出），已按变更记录重建',
  'snapshot-modified': '存档与变更记录对不上，已按变更记录重建，原存档已另存',
  'journal-shorter': '变更记录比存档短（被截断或删改过），已按变更记录重建，原存档已另存',
  'journal-tail': '变更记录的最后一条没写完，已丢掉',
  'journal-unreadable': '变更记录里有读不出的行',
  'journal-not-engine': '变更记录里有不是规则板自己写的记录',
}

/** One line of the difference between the repository file and the board's state. */
export interface RepoDiffLine {
  readonly path: readonly [string] | readonly [string, string]
  readonly change: 'added' | 'removed' | 'changed'
  readonly fields?: readonly string[]
}

/** One script an entry runs: where it is, the hash of the bytes a person agreed to and, on the machine where the person agreed, when. */
interface ScriptPin extends ScriptRef {
  /** Absent on a pin that came with the rules file: nobody on this machine has read these bytes, and the script does not run. */
  readonly approvedAt?: string
}

/** The kinds of change an agent can propose (rules design §9.3); a `detector` comes with the detector runner. */
export type ProposalKind = 'rule' | 'lift' | 'switch' | 'peak-mode' | 'remove' | 'repin'

/**
 * An agent's proposal (design §7.2, §9.3): the content only. It has no effect until the human agrees to it in the chat
 * and the board writes it (`proposal-accept`); the engine marks it `accepted` in the same write. `body` is the rule,
 * the switch, the level, the id of the rule to lift or repin, or the 1 to 3 entries to remove, in the form the board
 * writes them; `script` is the text of a script the rule runs, which the human read and which is written to the
 * repository when the proposal is accepted.
 */
export interface Proposal {
  /** `p-<8 hex digits>`. */
  readonly id: string
  readonly kind: ProposalKind
  readonly body: unknown
  /** The script of a `rule` that runs one, or the script a `repin` asks to approve (the file's text as the board read it). */
  readonly script?: { readonly text: string, readonly sha256: string, readonly file: string, readonly lang: ScriptLang, readonly timeoutSeconds?: number, readonly onError?: 'allow' | 'block' }
  /** One line of what the proposal does once it is in force. */
  readonly describe: string
  /** What the human is to know besides it, one sentence each (they go after the question, with the script). */
  readonly cautions: readonly string[]
  /** Why the agent proposed it; for the rules page and the journal only. */
  readonly reason: string
  /** `graph`: the main agent puts it to the human in the chat; `board`: the human types `/rules accept` or `/rules reject`. */
  readonly via: 'graph' | 'board'
  /** `board` and a script: when the human first typed `/rules accept` and was shown the text; the second `accept` within 30 minutes takes effect. */
  readonly shownAt?: string
  /** The older proposal this one replaces. */
  readonly replaces?: string
  /** The question on the graph this was put to the human with; set when the proposal is accepted. */
  readonly question?: string
  readonly proposedBy: { readonly sessionId: string, readonly agentId: string }
  readonly at: string
  readonly status: 'open' | 'accepted' | 'rejected' | 'superseded' | 'expired'
  readonly decidedBy?: { readonly actor: 'human' | 'llm' | 'harness', readonly relay?: string, readonly at: string }
}

/** A host process: its pid and the moment it started (the pid alone can be reused). */
interface HostId {
  readonly pid: number
  readonly startedAt: number
}

/** A call a rule put off, kept until it is let through, given up or expired (design §6.3). */
export interface Ticket {
  /** `q-<number>`, unique in the project. */
  readonly id: string
  readonly state: 'deferred' | 'cleared' | 'done' | 'cancelled' | 'expired'
  /** The rules that put it off. */
  readonly rules: readonly string[]
  readonly sessionId: string
  readonly agentLabel: string
  readonly host: HostId
  /** The tool name and the normalized arguments, hashed: the same call asks the same question. */
  readonly signature: string
  readonly tool: string
  readonly summary: string
  readonly since: string
  /** The person let this one through, until this time. */
  readonly letOnceUntil?: string
  /** When it entered `cleared`: the 30 minutes in which the agent may come back run from here (design §6.3). */
  readonly clearedAt?: string
  /** When it entered `done`, `cancelled` or `expired`. */
  readonly closedAt?: string
  readonly expiredWhy?: 'age' | 'not-retried' | 'host-gone'
  /** Opened by a call inside a run_code program. */
  readonly nested?: true
  /** The rules whose script is the reason it was put off. */
  readonly scriptRules?: readonly string[]
  /** The goal paused when the ticket was opened, and the revision after pausing it. */
  readonly pausedGoal?: { readonly id: string, readonly revision: number }
  readonly pauseFailed?: string
  readonly resumedAt?: string
  readonly handedFrom?: { readonly sessionId: string, readonly agentLabel: string, readonly focus?: string, readonly at: string }
}

/** Something the main agent has still to be told and could not be told on this host. */
export interface Notice {
  readonly kind: 'late-block' | 'script-capped'
  readonly rule: string
  readonly text: string
  readonly at: string
}

/** When a detector measures: every so often, at a time of day or week, or when a file changes. */
type DetectorTrigger =
  | Extract<Trigger, { readonly kind: 'every' | 'daily' | 'weekly' }>
  | { readonly kind: 'event', readonly events: readonly ['loops.file-changed'], readonly params: { readonly path: string } }

/** An entry that measures a signal by running a script a person approved (design §5.2). */
interface Detector {
  /** `d-<name>`. */
  readonly id: string
  readonly title: string
  readonly when: DetectorTrigger
  readonly action: { readonly kind: 'measure', readonly script: ScriptRef, readonly signal: string, readonly ttlMs: number, readonly timeoutSeconds?: number }
  readonly origin: Rule['origin']
  readonly status: 'active' | 'removed'
}

export interface ProjectState {
  /** 2 from the first version of the board: the full design's shape. A snapshot with another version is not a snapshot. */
  readonly version: 2
  /** The sequence number of the last journal record. */
  readonly seq: number
  /** The person's peak level; present only once chosen. Readers go through effectivePeakMode. */
  readonly peakMode?: PeakModeSetting
  /** Rules by id: a person's rules of the project and of a session. Absent while there are none. */
  readonly rules?: Readonly<Record<string, Rule>>
  /** Signals by name: switches and the signals of detectors, with the value a person set and the value last measured. */
  readonly signals?: Readonly<Record<string, SignalState>>
  readonly detectors?: Readonly<Record<string, Detector>>
  /** The script pins by entry id: what the entry's script is and whether a person approved exactly that. */
  readonly scripts?: Readonly<Record<string, ScriptPin>>
  /** Proposals by id: what agents proposed, open until the human decided. */
  readonly proposals?: Readonly<Record<string, Proposal>>
  readonly tickets?: Readonly<Record<string, Ticket>>
  /** The number the next ticket gets; set by the record that opens the first ticket. */
  readonly nextTicket?: number
  readonly notices?: Readonly<Record<string, Notice>>
  /** The rules file in the repository: the digest of what the board last exported (null while nothing is decided), and the copy of a file someone else changed. */
  readonly repo: {
    readonly digest: string | null
    readonly outside?: { readonly digest: string, readonly at: string, readonly copy: string, readonly diff: readonly RepoDiffLine[] }
  }
  readonly recovered?: { readonly at: string, readonly reason: RecoveryReason, readonly lost: boolean, readonly replaced?: string }
  /** Absent while there is nothing unresolved; readers treat absent as empty. */
  readonly unresolved?: Readonly<Record<string, SkippedRecord>>
}

/** The state of a project the board has not written to yet. */
export function emptyState(): ProjectState {
  return { version: 2, seq: 0, repo: { digest: null } }
}

/**
 * One change of a state: replace or delete a top-level field (`peakMode`, `repo`, `recovered`, `nextTicket`), or one
 * entry of a collection (`rules`, `signals`, `detectors`, `scripts`, `tickets`, `notices`, `unresolved`).
 */
export interface Change {
  readonly path: readonly [string] | readonly [string, string]
  /** Absent means delete. */
  readonly value?: unknown
  /** Why the write made this change by the way: a closed ticket past its day is pruned, a ticket or a rule whose time is up expires (design §7.4 step 5). Replay does exactly the change; the cause is for the person who reads the record. */
  readonly cause?: 'prune' | 'expire'
}

export interface JournalRecord {
  readonly seq: number
  readonly at: string
  readonly actor: RulesActor
  readonly op: string
  readonly target?: string
  readonly from?: unknown
  readonly to?: unknown
  readonly reason?: string
  readonly relay?: string
  readonly evidence?: string
  /** Every change this write makes to the state, in order; replay does exactly this and nothing else. */
  readonly changes: readonly Change[]
  /** stateDigest of the state after the change. */
  readonly snapshot: string
  /** Only in `base` and `recovered`: the full state after the write, the anchor a replay can restart from. */
  readonly state?: ProjectState
}

/**
 * The part of the state a person decided: what goes into the repository. A session's rules, the measured values of
 * signals, tickets, notices and the record of recoveries are the runtime's and are not in it; a script pin is, without
 * the approval, which stays on the machine where the person gave it.
 */
export interface RepoRules {
  readonly version: 2
  readonly rules?: Readonly<Record<string, Rule>>
  readonly detectors?: Readonly<Record<string, Detector>>
  readonly signals?: Readonly<Record<string, Omit<SignalState, 'detected'>>>
  readonly peakMode?: PeakModeSetting
  readonly scripts?: Readonly<Record<string, ScriptRef>>
}

/** The record without some of its keys. */
function omitKeys<T extends object>(record: T, keys: readonly string[]): T {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key))) as T
}

/** What the repository file holds for a state; undefined while the person decided nothing (no file). */
export function repoPart(state: ProjectState): RepoRules | undefined {
  const part: RepoRules = withoutEmptyCollections({
    version: 2,
    rules: Object.fromEntries(Object.entries(state.rules ?? {}).filter(([, rule]) => rule.scope === 'project')),
    detectors: state.detectors ?? {},
    signals: Object.fromEntries(Object.entries(state.signals ?? {}).map(([name, signal]) => [name, omitKeys(signal, ['detected'])])),
    ...(state.peakMode === undefined ? {} : { peakMode: state.peakMode }),
    scripts: Object.fromEntries(Object.entries(state.scripts ?? {}).map(([id, pin]) => [id, { file: pin.file, sha256: pin.sha256, lang: pin.lang }])),
  })
  return Object.keys(part).length === 1 ? undefined : part
}

/** Strings in code point order, the order every serialization and every list of the board uses. */
export function compareCodePoints(a: string, b: string): number {
  const x = Array.from(a, char => char.codePointAt(0) ?? 0)
  const y = Array.from(b, char => char.codePointAt(0) ?? 0)
  for (let index = 0; index < Math.min(x.length, y.length); index++) {
    if (x[index] !== y[index]) return x[index] - y[index]
  }
  return x.length - y.length
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted)
  if (typeof value !== 'object' || value === null) return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(Object.keys(record).filter(key => record[key] !== undefined).sort(compareCodePoints).map(key => [key, sorted(record[key])]))
}

/** One serialization for one content: keys in code point order, no whitespace; the input of every digest. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sorted(value))
}

/**
 * The value with every top-level field that is an empty object left out: a
 * collection with nothing in it is absent from what is stored and digested
 * (rules design §7.2). Applied to the state before a digest or a snapshot
 * and to the rules file before it is written, so a collection the full board
 * adds changes no digest while it is empty.
 */
export function withoutEmptyCollections<T extends object>(value: T): T {
  const isEmptyCollection = (field: unknown): boolean => typeof field === 'object' && field !== null && !Array.isArray(field) && Object.keys(field).length === 0
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, field]) => !isEmptyCollection(field))) as T
}

/** How the repository file is written: keys in code point order, two spaces of indent, a final newline, empty collections absent; a git diff of it reads at a glance. */
export function repoJson(repo: RepoRules): string {
  return `${JSON.stringify(sorted(withoutEmptyCollections(repo)), null, 2)}\n`
}

function settingProblem(value: unknown, path: string): Problem {
  if (!isRecord(value)) return `${path} must be an object`
  const extra = unknownKeys(value, ['level', 'at', 'origin'], path)
  if (extra !== undefined) return extra
  if (typeof value.level !== 'string' || !LEVELS.includes(value.level)) return `${path}.level must be one of ${LEVELS.join(', ')}`
  if (!isTime(value.at)) return `${path}.at must be an ISO time`
  const origin = value.origin
  if (!isRecord(origin)) return `${path}.origin must be an object`
  return unknownKeys(origin, ['actor', 'relay', 'question'], `${path}.origin`)
    ?? (origin.actor === 'human' || origin.actor === 'llm' ? undefined : `${path}.origin.actor must be human or llm`)
    ?? textField(origin, 'relay', `${path}.origin`)
    ?? textField(origin, 'question', `${path}.origin`)
}

function diffProblem(value: unknown, path: string): Problem {
  if (!isRecord(value)) return `${path} must be an object`
  const extra = unknownKeys(value, ['path', 'change', 'fields'], path)
  if (extra !== undefined) return extra
  if (!Array.isArray(value.path) || value.path.length < 1 || value.path.length > 2 || !value.path.every(part => typeof part === 'string')) return `${path}.path must be one or two strings`
  if (value.change !== 'added' && value.change !== 'removed' && value.change !== 'changed') return `${path}.change must be added, removed or changed`
  return value.fields === undefined || (Array.isArray(value.fields) && value.fields.every(field => typeof field === 'string')) ? undefined : `${path}.fields must be strings`
}

function repoProblem(value: unknown): Problem {
  if (!isRecord(value)) return 'repo must be an object'
  const extra = unknownKeys(value, ['digest', 'outside'], 'repo')
  if (extra !== undefined) return extra
  if (value.digest !== null && (typeof value.digest !== 'string' || !/^[0-9a-f]{16}$/.test(value.digest))) return 'repo.digest must be null or 16 hex digits'
  if (value.outside === undefined) return undefined
  const outside = value.outside
  if (!isRecord(outside)) return 'repo.outside must be an object'
  const outsideExtra = unknownKeys(outside, ['digest', 'at', 'copy', 'diff'], 'repo.outside')
  if (outsideExtra !== undefined) return outsideExtra
  if (typeof outside.digest !== 'string' || !isTime(outside.at) || typeof outside.copy !== 'string' || !Array.isArray(outside.diff)) return 'repo.outside needs digest, at, copy and diff'
  return outside.diff.map((line, index) => diffProblem(line, `repo.outside.diff[${index}]`)).find(problem => problem !== undefined)
}

const RECOVERY_REASONS: readonly string[] = ['snapshot-behind', 'snapshot-corrupt', 'snapshot-modified', 'journal-shorter', 'journal-tail', 'journal-unreadable', 'journal-not-engine']
const SKIP_REASONS: readonly string[] = ['digest-mismatch', 'after-unreadable', 'unreadable', 'covered-by-anchor']

function recoveredProblem(value: unknown): Problem {
  if (!isRecord(value)) return 'recovered must be an object'
  return unknownKeys(value, ['at', 'reason', 'lost', 'replaced'], 'recovered')
    ?? (isTime(value.at) ? undefined : 'recovered.at must be an ISO time')
    ?? (typeof value.reason === 'string' && RECOVERY_REASONS.includes(value.reason) ? undefined : 'recovered.reason is not a known reason')
    ?? (typeof value.lost === 'boolean' ? undefined : 'recovered.lost must be a boolean')
    ?? textField(value, 'replaced', 'recovered')
}

function skippedProblem(key: string, value: unknown): Problem {
  const path = `unresolved.${key}`
  if (!isRecord(value)) return `${path} must be an object`
  return unknownKeys(value, ['key', 'label', 'seq', 'afterSeq', 'why', 'coveredBy', 'actor', 'op', 'target'], path)
    ?? (value.key === key && /^[0-9a-f]{12}$/.test(key) ? undefined : `${path}.key must be the entry key, 12 hex digits`)
    ?? (typeof value.label === 'string' ? undefined : `${path}.label must be a string`)
    ?? (isCount(value.afterSeq) ? undefined : `${path}.afterSeq must be a count`)
    ?? (typeof value.why === 'string' && SKIP_REASONS.includes(value.why) ? undefined : `${path}.why is not a known reason`)
    ?? (value.seq === undefined || isCount(value.seq) ? undefined : `${path}.seq must be a count`)
    ?? (value.coveredBy === undefined || isCount(value.coveredBy) ? undefined : `${path}.coveredBy must be a count`)
    ?? textField(value, 'actor', path)
    ?? textField(value, 'op', path)
    ?? textField(value, 'target', path)
}

/** Every entry of a collection checked, the first problem named; a collection that is absent has none. */
function collectionProblem(collection: unknown, path: string, check: (key: string, entry: unknown, path: string) => Problem): Problem {
  if (collection === undefined) return undefined
  if (!isRecord(collection)) return `${path} must be an object`
  if (Object.hasOwn(collection, '__proto__')) return `${path}.__proto__ is not an entry name`
  return Object.entries(collection).map(([key, entry]) => check(key, entry, `${path}.${key}`)).find(problem => problem !== undefined)
}

/** The types of the signals a stored rule may name: the project's own, and the one the host computes. */
/** The types of the signals a condition may name: `glm-peak` and each signal of the state. */
export function signalTypesOf(signals: unknown): ReadonlyMap<string, SignalType> {
  const types = new Map<string, SignalType>([[GLM_PEAK, { kind: 'boolean' }]])
  if (isRecord(signals)) {
    for (const [name, signal] of Object.entries(signals)) if (isRecord(signal) && isRecord(signal.type)) types.set(name, signal.type as unknown as SignalType)
  }
  return types
}

const RULE_STATUSES: readonly string[] = ['active', 'lifted', 'expired']

/**
 * A rule as stored: what a person could have written (`validateRule`, with the checks that depend on the moment or on
 * the project's other entries off: a time to live may have run out, a signal may have been deleted since, the project
 * may hold more rules than a new one is allowed), and the origin and status the engine added. The rules file holds the
 * project's rules only.
 */
function storedRuleProblem(key: string, value: unknown, path: string, types: ReadonlyMap<string, SignalType>, inFile: boolean): Problem {
  if (!isRecord(value)) return `${path} must be an object`
  const found = validateRule(omitKeys(value, ['origin', 'status']), { now: new Date(0), signals: types, existing: [], stored: true })[0]
  return (found === undefined ? undefined : `${path}.${found.path}: ${found.message}`)
    ?? (value.id === key ? undefined : `${path}.id must be the key ${key}`)
    ?? (inFile && value.scope !== 'project' ? `${path}.scope must be project: a session's rules are not in the rules file` : undefined)
    ?? originProblem(value.origin, `${path}.origin`)
    ?? (typeof value.status === 'string' && RULE_STATUSES.includes(value.status) ? undefined : `${path}.status must be one of ${RULE_STATUSES.join(', ')}`)
}

/** What a person decided, in the state and in the rules file alike: the peak level, signals, detectors, rules and script pins. */
function decidedProblem(value: Record<string, unknown>, root: 'state' | 'rules'): Problem {
  const inFile = root === 'rules'
  const types = signalTypesOf(value.signals)
  return (value.peakMode === undefined ? undefined : settingProblem(value.peakMode, `${root}.peakMode`))
    ?? collectionProblem(value.signals, `${root}.signals`, (_key, entry, at) => signalProblem(entry, at, !inFile))
    ?? collectionProblem(value.detectors, `${root}.detectors`, detectorProblem)
    ?? collectionProblem(value.rules, `${root}.rules`, (key, entry, at) => storedRuleProblem(key, entry, at, types, inFile))
    ?? collectionProblem(value.scripts, `${root}.scripts`, (_key, entry, at) => scriptPinProblem(entry, at, !inFile))
}

const STATE_FIELDS: readonly string[] = ['version', 'seq', 'peakMode', 'repo', 'recovered', 'unresolved', 'rules', 'signals', 'detectors', 'scripts', 'proposals', 'tickets', 'nextTicket', 'notices']

/** Why a value is not a project state, or undefined when it is one. */
export function stateProblem(value: unknown): Problem {
  if (!isRecord(value)) return 'the state must be an object'
  return unknownKeys(value, STATE_FIELDS, 'state')
    ?? (value.version === 2 ? undefined : 'state.version must be 2')
    ?? (isCount(value.seq) ? undefined : 'state.seq must be a count')
    ?? repoProblem(value.repo)
    ?? (value.recovered === undefined ? undefined : recoveredProblem(value.recovered))
    ?? decidedProblem(value, 'state')
    ?? collectionProblem(value.proposals, 'state.proposals', proposalProblem)
    ?? collectionProblem(value.tickets, 'state.tickets', ticketProblem)
    ?? collectionProblem(value.notices, 'state.notices', (_key, entry, at) => noticeProblem(entry, at))
    ?? (value.nextTicket === undefined || isCount(value.nextTicket) ? undefined : 'state.nextTicket must be a count')
    ?? collectionProblem(value.unresolved, 'state.unresolved', (key, entry) => skippedProblem(key, entry))
}

/** The rules file as text: the part a person decided, or why the text is not one. */
export function parseRepoRules(text: string): { readonly ok: true, readonly repo: RepoRules } | { readonly ok: false, readonly reason: string } {
  let value: unknown
  try {
    value = JSON.parse(text)
  }
  catch {
    return { ok: false, reason: '不是 JSON' }
  }
  if (!isRecord(value)) return { ok: false, reason: '最外层不是对象' }
  const problem = unknownKeys(value, ['version', 'rules', 'detectors', 'signals', 'peakMode', 'scripts'], 'rules')
    ?? (value.version === 2 ? undefined : 'rules.version must be 2')
    ?? decidedProblem(value, 'rules')
  if (problem !== undefined) return { ok: false, reason: problem }
  return { ok: true, repo: value as unknown as RepoRules }
}

/** The same script reference: where it is, which bytes, which language. */
const sameScript = (a: ScriptRef, b: ScriptRef): boolean => a.file === b.file && a.sha256 === b.sha256 && a.lang === b.lang

/**
 * The state after taking what a person decided from a rules file. The decided part is the file's; the runtime's part (a
 * session's rules, the values detectors measured, tickets, notices, the record of recoveries) stays; the outside mark
 * is gone because the state is now made from the file (`digest` is the file's). A script pin that names the same bytes
 * keeps the approval given on this machine; a new or changed one starts without, so the script it names does not run
 * until a person has read those bytes. Pure; the sequence number is the caller's to set.
 */
export function adoptRepo(state: ProjectState, file: RepoRules, digest: string): ProjectState {
  const signals = Object.fromEntries(Object.entries(file.signals ?? {}).map(([name, signal]) => {
    const detected = state.signals?.[name]?.detected
    return [name, detected === undefined ? signal : { ...signal, detected }]
  }))
  const scripts = Object.fromEntries(Object.entries(file.scripts ?? {}).map(([id, pin]) => {
    const held = state.scripts?.[id]
    return [id, held?.approvedAt !== undefined && sameScript(held, pin) ? held : pin]
  }))
  return withoutEmptyCollections({
    ...omitKeys(state, ['peakMode', 'rules', 'detectors', 'signals', 'scripts', 'repo']),
    ...(file.peakMode === undefined ? {} : { peakMode: file.peakMode }),
    rules: { ...file.rules, ...Object.fromEntries(Object.entries(state.rules ?? {}).filter(([, rule]) => rule.scope === 'session')) },
    detectors: file.detectors ?? {},
    signals,
    scripts,
    repo: { digest },
  })
}

/** The state a project starts from when it has the file and no record of its own: the decided part, nothing else. */
export function stateFromRepo(repo: RepoRules, digest: string): ProjectState {
  return adoptRepo({ ...emptyState(), seq: 1 }, repo, digest)
}

/** The difference of one decided item: absent on one side, or the fields (in code point order) whose content differs. */
function diffEntry(path: RepoDiffLine['path'], mine: unknown, theirs: unknown): RepoDiffLine | undefined {
  if (mine === undefined && theirs === undefined) return undefined
  if (mine === undefined) return { path, change: 'added' }
  if (theirs === undefined) return { path, change: 'removed' }
  const a = mine as Record<string, unknown>
  const b = theirs as Record<string, unknown>
  const fields = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(field => canonicalJson(a[field]) !== canonicalJson(b[field])).sort(compareCodePoints)
  return fields.length === 0 ? undefined : { path, change: 'changed', fields }
}

/** How the file in the repository differs from the part the state would export, item by item, in the order the file lists them. */
export function diffRepo(state: ProjectState, file: RepoRules): readonly RepoDiffLine[] {
  const mine: Record<string, unknown> = { ...repoPart(state) }
  const theirs: Record<string, unknown> = { ...withoutEmptyCollections(file) }
  const lines: Array<RepoDiffLine | undefined> = [diffEntry(['peakMode'], mine.peakMode, theirs.peakMode)]
  for (const collection of ['detectors', 'rules', 'scripts', 'signals']) {
    const here = (mine[collection] ?? {}) as Record<string, unknown>
    const there = (theirs[collection] ?? {}) as Record<string, unknown>
    for (const id of [...new Set([...Object.keys(here), ...Object.keys(there)])].sort(compareCodePoints)) lines.push(diffEntry([collection, id], here[id], there[id]))
  }
  return lines.filter(line => line !== undefined).sort((a, b) => compareCodePoints(a.path.join('\u0000'), b.path.join('\u0000')))
}

/** The scripts that cannot run: entries that are in force and whose script has no approval for exactly the bytes they name. */
export function unapprovedScripts(state: Pick<ProjectState, 'rules' | 'detectors' | 'scripts'>): ReadonlyArray<{ readonly id: string, readonly title: string, readonly standing: 'no-pin' | 'not-approved' | 'changed' }> {
  const entries = [
    ...Object.values(state.rules ?? {}).flatMap(rule => rule.status === 'active' && rule.action.kind === 'script' ? [{ id: rule.id, title: rule.title, script: rule.action.script }] : []),
    ...Object.values(state.detectors ?? {}).flatMap(detector => detector.status === 'active' ? [{ id: detector.id, title: detector.title, script: detector.action.script }] : []),
  ]
  return entries
    .map(({ id, title, script }) => {
      const pin = state.scripts?.[id]
      const standing: 'no-pin' | 'not-approved' | 'changed' | undefined = pin === undefined ? 'no-pin' : !sameScript(pin, script) ? 'changed' : pin.approvedAt === undefined ? 'not-approved' : undefined
      return standing === undefined ? undefined : { id, title, standing }
    })
    .filter(entry => entry !== undefined)
    .sort((a, b) => compareCodePoints(a.id, b.id))
}

/** The ids of the rules in force whose script a person approved on this machine for exactly the bytes the rule names: the scripts the board runs. */
export function approvedScriptRules(state: Pick<ProjectState, 'rules' | 'detectors' | 'scripts'>): ReadonlySet<string> {
  const unapproved = new Set(unapprovedScripts(state).map(entry => entry.id))
  return new Set(Object.values(state.rules ?? {}).filter(rule => rule.status === 'active' && rule.action.kind === 'script' && !unapproved.has(rule.id)).map(rule => rule.id))
}

// ------------------------------------------------------------------ rules
//
// A rule is the shape both boards share (when + filter + action, src/loops/trigger.ts) plus the board's own
// `condition`: `filter` reads what this event carries, `condition` reads the board's state at the moment of the
// judgement (signals, the clock, the stage). The state above does not hold rules yet; the judge (judge.ts) takes the
// rules it is given.

/** What a judgement comes to; each action kind is one, and a script's exit code is mapped onto one. */
export type Effect = 'block' | 'queue' | 'record' | 'inform'

/** A rule listens to one to three gating events, or to `rules.step` alone. */
type RuleTrigger = Extract<Trigger, { readonly kind: 'event' }> & { readonly events: readonly GateEvent[] | readonly ['rules.step'] }

/** A rule's action: one of the four effects, or a script a person approved after reading it. */
export type RuleAction = { readonly kind: Effect } | ScriptAction

export type SignalValue = boolean | number | string
export type SignalType =
  | { readonly kind: 'boolean' }
  | { readonly kind: 'number', readonly unit?: string }
  | { readonly kind: 'enum', readonly values: readonly string[] }

/** A signal kept in the project state: a switch (no detector) or a detector's signal. Its effective value is computed (signals.ts). */
export interface SignalState {
  readonly type: SignalType
  readonly description?: string
  /** The detector that defines the signal; a switch has none. */
  readonly detector?: string
  readonly detected?: { readonly value: SignalValue, readonly since: string }
  readonly manual?: { readonly value: SignalValue, readonly at: string, readonly expiresAt?: string, readonly relay?: string }
}

/** The one comparison a signal condition makes. */
type SignalComparison =
  | { readonly is: SignalValue }
  | { readonly in: readonly SignalValue[] }
  | { readonly above: number }
  | { readonly below: number }
  | { readonly known: true }

/**
 * A condition holds, does not hold, or cannot be told (a signal nobody can read). `all`, `any` and `not` keep that
 * third value (judge.ts evaluateCondition). A clock window runs from `from` (in) to `to` (out); `to` before `from` runs
 * across midnight; `days` are ISO weekdays (1 = Monday) of the day the window began.
 */
export type Condition =
  | ({ readonly signal: string } & SignalComparison)
  | { readonly clock: { readonly days?: readonly number[], readonly from: string, readonly to: string, readonly tz?: string } }
  | { readonly stage: readonly string[] }
  | { readonly all: readonly Condition[] }
  | { readonly any: readonly Condition[] }
  | { readonly not: Condition }

export interface Rule {
  readonly id: string
  readonly title: string
  readonly scope: 'project' | 'session'
  /** Required when `scope` is `session`. */
  readonly sessionId?: string
  readonly when: RuleTrigger
  readonly filter?: EventFilter
  readonly condition?: Condition
  /** What to do when the condition cannot be read: `skip` (default) leaves the rule off, `apply` treats it as holding. */
  readonly onUnknown?: 'skip' | 'apply'
  readonly action: RuleAction
  readonly lifetime:
    | { readonly kind: 'until-lifted' }
    | { readonly kind: 'ttl', readonly expiresAt: string }
    | { readonly kind: 'until', readonly condition: Condition }
    | { readonly kind: 'session' }
  readonly reason: string
  /** The project graph node this rule exists for; its format is checked, nothing else. */
  readonly source?: string
  /** The engine writes who set the rule; a request does not carry it. */
  readonly origin: { readonly actor: 'human' | 'llm', readonly at: string, readonly relay?: string, readonly proposedBy?: { readonly sessionId: string, readonly agentId: string }, readonly question?: string }
  readonly status: 'active' | 'lifted' | 'expired'
}

/**
 * An entry that lives in code (builtin.ts): not in any file, not liftable. It has no script and no session; the three
 * fields below are what only code may use (the check refuses them in a person's rule).
 */
export interface BuiltinRule extends Omit<Rule, 'scope' | 'sessionId' | 'origin' | 'status' | 'action'> {
  readonly scope: 'builtin'
  readonly action: Exclude<RuleAction, ScriptAction>
  /** The row that tells the model about an informing rule; the rules board's reminder does not repeat it. */
  readonly toldBy?: HealthRow
  /** The default rule an entry belongs to; the rules page shows it under that rule. */
  readonly partOf?: string
  /** Only these peak levels enable the entry; absent means every level. */
  readonly enabledBy?: readonly PeakLevel[]
  /** Queue with one ticket for the whole session (signature `any:<id>`), the tool calls of the rules board itself excepted. */
  readonly ticketPerSession?: true
}

/** One rule that another row (or the rules board's own gate) implements, listed read-only: `<row>:<id>`. */
export interface CatalogEntry {
  readonly id: string
  readonly title: string
  readonly row: HealthRow
  readonly effect: Effect
  /** The row that tells the model about an informing entry. */
  readonly toldBy?: HealthRow
  /** The package the row is in; the rules page says "<package> brings it, read only". */
  readonly plugin: 'dsh-hourness' | 'dsh-glm-zcode'
}

/** How loaded a row is on this host: its health state, or absent when its service is not there. */
export type RowState = HealthState | 'absent'

/** What of an action is its effect; a script has none until it has been run. */
export function effectOf(action: RuleAction): Effect | undefined {
  return action.kind === 'script' ? undefined : action.kind
}

// ------------------------------------------------------------ validation

export interface RuleContext {
  /** The moment `ttl` and `once`-like times are measured against. */
  readonly now: Date
  /** The signals a condition may name, with their types: the project's switches and detector signals, and `glm-peak`. */
  readonly signals: ReadonlyMap<string, SignalType>
  /** The rules in force now; only their ids and whether they run a script matter (the limits of design §12). */
  readonly existing: readonly Pick<Rule, 'id' | 'action'>[]
  /** An entry of the code: it may use what a person's rule may not (`glmSpend` filters, one ticket per session) and has no limits. */
  readonly code?: boolean
  /**
   * A rule read back from the state or the rules file, not a request to make one: what depends on the moment or on the
   * project's other entries is not checked (a time to live that has run out, a signal that is no longer defined, the
   * limits of the project); the shape of everything else is.
   */
  readonly stored?: true
}

const RULE_ID = /^r-[a-z0-9][a-z0-9-]{0,45}$/
const BUILTIN_ID = /^builtin:[a-z0-9][a-z0-9-]{0,40}$/
const SHA256 = /^[0-9a-f]{64}$/
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const CLOCK_ZONE = /^[+-](?:[01]\d|2[0-3]):[0-5]\d$/
const SCRIPT_SUFFIX: Readonly<Record<ScriptLang, string>> = { pwsh: 'ps1', node: 'mjs', python: 'py', bash: 'sh' }
const ROLES: readonly string[] = ['main-agent', 'root', 'subagent']
const GLM_SPENDS: readonly string[] = ['optional', 'necessary']
const EFFECTS: readonly string[] = ['block', 'queue', 'record', 'inform']
const SIGNAL_COMPARISONS = ['is', 'in', 'above', 'below', 'known'] as const

const RULE_FIELDS: readonly string[] = ['id', 'title', 'scope', 'sessionId', 'when', 'filter', 'condition', 'onUnknown', 'action', 'lifetime', 'reason', 'source']
const CODE_FIELDS: readonly string[] = ['toldBy', 'partOf', 'enabledBy', 'ticketPerSession']
const CODE_ONLY = '这一类只给默认规则的高峰模式用'

const MAX_ACTIVE_RULES = 50
const MAX_SCRIPT_RULES = 10
const MAX_TTL_MS = 30 * 86_400_000
const MAX_CONDITION_DEPTH = 5
const MAX_CONDITION_LEAVES = 20

const isText = (value: unknown, least: number, most: number): value is string => typeof value === 'string' && value.length >= least && value.length <= most

type Add = (path: string, message: string) => void

function checkFields(rule: Readonly<Record<string, unknown>>, code: boolean, add: Add): void {
  for (const key of Object.keys(rule)) {
    if (RULE_FIELDS.includes(key)) continue
    if (code && CODE_FIELDS.includes(key)) continue
    if (key === 'ticketPerSession') add(key, CODE_ONLY)
    else if (key === 'origin' || key === 'status') add(key, '这一项由规则板写，写规则的人不给')
    else add(key, '规则没有这个字段')
  }
  if (!code) return
  if (rule.partOf !== undefined && typeof rule.partOf !== 'string') add('partOf', 'partOf 要写成规则 id')
  if (rule.toldBy !== undefined && typeof rule.toldBy !== 'string') add('toldBy', 'toldBy 要写成行名')
  if (rule.ticketPerSession !== undefined && rule.ticketPerSession !== true) add('ticketPerSession', 'ticketPerSession 只能是 true')
  const levels: readonly string[] = Object.keys(PEAK_LEVEL_WORDS)
  const enabledBy = rule.enabledBy
  if (enabledBy !== undefined && !(Array.isArray(enabledBy) && enabledBy.length > 0 && enabledBy.every(level => typeof level === 'string' && levels.includes(level)))) add('enabledBy', `enabledBy 要写成 ${levels.join('、')} 里的几个`)
}

function checkIdentity(rule: Readonly<Record<string, unknown>>, code: boolean, add: Add): void {
  if (!(typeof rule.id === 'string' && (code ? BUILTIN_ID : RULE_ID).test(rule.id))) add('id', code ? '代码里的条目 id 写成 builtin:<名字>' : '规则 id 写成 r- 开头，小写字母、数字和连字符，至多 48 个字符')
  if (!(isText(rule.title, 1, 120) && !rule.title.includes('\n'))) add('title', '标题写成一行，1 到 120 个字符')
  if (!isText(rule.reason, 1, 2000)) add('reason', '理由写成 1 到 2000 个字符')
  if (rule.source !== undefined && !(typeof rule.source === 'string' && ID_PATTERN.test(rule.source))) add('source', '来源写成项目图节点的 id')
  if (rule.onUnknown !== undefined && rule.onUnknown !== 'skip' && rule.onUnknown !== 'apply') add('onUnknown', 'onUnknown 只能写 skip 或 apply')
  const scope = rule.scope
  if (code) {
    if (scope !== 'builtin') add('scope', '代码里的条目的范围是 builtin')
  }
  else if (scope !== 'project' && scope !== 'session') add('scope', '范围写 project 或 session')
  else if (scope === 'session' && typeof rule.sessionId !== 'string') add('sessionId', '会话规则要写明是哪个会话')
  else if (scope === 'project' && rule.sessionId !== undefined) add('sessionId', '项目规则不写会话')
  if (code && rule.sessionId !== undefined) add('sessionId', '代码里的条目不属于某个会话')
}

/** The events of a rule's `when`, or undefined after saying what is wrong. */
function checkEvents(when: unknown, add: Add): readonly string[] | undefined {
  if (!isRecord(when) || when.kind !== 'event') {
    add('when', '规则只听规则板的四个事件：写成 {"kind": "event", "events": [...]}')
    return undefined
  }
  const events = when.events
  const sound = Array.isArray(events) && events.length > 0 && events.every(event => typeof event === 'string' && RULES_EVENT_TABLE.has(event)) && new Set(events).size === events.length
  const gating = sound && events.every(event => (GATE_EVENTS as readonly unknown[]).includes(event))
  if (!sound || !(gating || (events.length === 1 && events[0] === 'rules.step'))) {
    add('when.events', `规则只听规则板的事件：${GATE_EVENTS.join('、')} 里的一到三个，或单独的 rules.step`)
    return undefined
  }
  return events as readonly string[]
}

function checkModelIds(path: string, test: unknown, add: Add): void {
  const ids = isRecord(test) ? test.in : undefined
  if (ids === undefined) return
  const sound = Array.isArray(ids) && ids.length <= 10 && ids.every(id => typeof id === 'string' && /^[^/]+\/.+$/.test(id))
  if (!sound) add(path, '模型最多写 10 个，每个写成 提供方/模型，两段都不为空')
}

function checkWrites(test: unknown, add: Add): void {
  const patterns = isRecord(test) ? test.paths : undefined
  if (!Array.isArray(patterns)) return
  const sound = (pattern: unknown): boolean => typeof pattern === 'string' && pattern !== '' && !/[\\?[\]{}]/.test(pattern)
    && !pattern.startsWith('/') && !/^[A-Za-z]:/.test(pattern) && !pattern.split('/').includes('..')
  if (!patterns.every(sound)) add('filter.writes', '写入目标写成相对项目的路径，用 / 分隔，不含 ..，只有 * 和 ** 两种通配')
}

function checkTools(test: unknown, add: Add): void {
  const names = isRecord(test) ? test.in : undefined
  if (Array.isArray(names) && !(names.length <= 20 && names.every(name => isText(name, 1, 64)))) add('filter.tool', '工具最多写 20 个，每个是工具名')
}

/** The checks on a filter that the shared validateWhen leaves to the board: model ids, write targets, tool names, roles and the code-only fields. */
function checkFilter(filter: unknown, code: boolean, add: Add): void {
  if (!isRecord(filter)) return
  checkModelIds('filter.model', filter.model, add)
  checkModelIds('filter.targetModel', filter.targetModel, add)
  checkWrites(filter.writes, add)
  checkTools(filter.tool, add)
  const roles = isRecord(filter.role) ? filter.role.in : undefined
  if (Array.isArray(roles) && !roles.every(role => typeof role === 'string' && ROLES.includes(role))) add('filter.role', `角色只能写 ${ROLES.join('、')}`)
  if (filter.glmSpend === undefined) return
  const spends = isRecord(filter.glmSpend) ? filter.glmSpend.in : undefined
  if (!code) add('filter.glmSpend', CODE_ONLY)
  else if (!(Array.isArray(spends) && spends.every(spend => typeof spend === 'string' && GLM_SPENDS.includes(spend)))) add('filter.glmSpend', `glmSpend 只能写 ${GLM_SPENDS.join('、')}`)
}

function checkScript(action: Readonly<Record<string, unknown>>, ruleId: unknown, add: Add): void {
  for (const key of Object.keys(action)) {
    if (!['kind', 'script', 'timeoutSeconds', 'onError'].includes(key)) add(`action.${key}`, '脚本动作没有这个字段')
  }
  const script = action.script
  if (!isRecord(script)) {
    add('action.script', '脚本要写成 {file, sha256, lang}')
    return
  }
  for (const key of Object.keys(script)) {
    if (!['file', 'sha256', 'lang'].includes(key)) add(`action.script.${key}`, '脚本引用没有这个字段')
  }
  if (!(typeof script.sha256 === 'string' && SHA256.test(script.sha256))) add('action.script.sha256', '哈希写成 64 位小写十六进制')
  const lang = typeof script.lang === 'string' && Object.hasOwn(SCRIPT_SUFFIX, script.lang) ? script.lang as ScriptLang : undefined
  if (lang === undefined) add('action.script.lang', `语言写 ${Object.keys(SCRIPT_SUFFIX).join('、')} 之一`)
  const file = script.file
  const name = typeof ruleId === 'string' ? ruleId : ''
  // The rules directory is configurable, so only its scripts/ folder and the file name are fixed here.
  const tails = (lang === undefined ? Object.values(SCRIPT_SUFFIX) : [SCRIPT_SUFFIX[lang]]).map(suffix => `scripts/${name}.${suffix}`)
  const sound = typeof file === 'string' && !file.includes('\\') && !file.startsWith('/') && !/^[A-Za-z]:/.test(file) && !file.split('/').includes('..')
    && tails.some(tail => file === tail || file.endsWith(`/${tail}`))
  if (!sound) add('action.script.file', '脚本文件写成 <规则目录>/scripts/<规则 id>.<后缀>，相对项目，不含 ..')
  // The timeout and the failure setting have the ranges of a gating event (src/loops/trigger.ts); the shared check says so.
  const checked = validateScriptAction({ kind: 'script', script: script as unknown as ScriptAction['script'], ...(action.timeoutSeconds === undefined ? {} : { timeoutSeconds: action.timeoutSeconds as number }), ...(action.onError === undefined ? {} : { onError: action.onError as 'allow' | 'block' }) }, { purpose: 'gate' })
  if (!checked.ok) for (const issue of checked.issues) add(issue.path, issue.message)
}

function checkAction(rule: Readonly<Record<string, unknown>>, events: readonly string[], context: RuleContext, add: Add): void {
  const action = rule.action
  if (!isRecord(action)) {
    add('action', '动作要写成一个对象')
    return
  }
  const kind = action.kind
  if (kind === 'measure') return add('action.kind', 'measure 只给检测器')
  if (kind !== 'script' && !(typeof kind === 'string' && EFFECTS.includes(kind))) return add('action.kind', `动作写 ${EFFECTS.join('、')} 或 script`)
  if (kind === 'script') checkScript(action, rule.id, add)
  else {
    for (const key of Object.keys(action)) if (key !== 'kind') add(`action.${key}`, `${kind} 动作没有这个字段`)
  }
  const stepOnly = events.length === 1 && events[0] === 'rules.step'
  const filter = isRecord(rule.filter) ? rule.filter : {}
  if (stepOnly && kind !== 'inform') add('action', 'rules.step 只配只告知（inform）：别的动作要有一个会拦的事件')
  else if (!stepOnly && kind === 'inform') add('action', '只告知（inform）只配 rules.step')
  else if (kind === 'queue' && filter.writes !== undefined) add('action', '写文件的规则不配排队：被推迟的写入可能基于已经变了的文件，只能拦下或只记录')
  if (context.code === true || context.stored === true) return
  if (kind === 'script' && context.existing.filter(other => other.id !== rule.id && other.action.kind === 'script').length >= MAX_SCRIPT_RULES) {
    add('action', `一个项目里带脚本的生效规则至多 ${MAX_SCRIPT_RULES} 条：先解除一些`)
  }
}

/** Walks a condition; `budget.leaves` counts the leaves of the whole condition, `budget.stored` says a signal nobody defines is let through. */
function checkCondition(value: unknown, path: string, depth: number, signals: ReadonlyMap<string, SignalType>, budget: { leaves: number, readonly stored: boolean }, add: Add): void {
  if (depth > MAX_CONDITION_DEPTH) return add(path, `条件嵌套至多 ${MAX_CONDITION_DEPTH} 层`)
  if (!isRecord(value)) return add(path, '条件要写成一个对象')
  const forms = ['signal', 'clock', 'stage', 'all', 'any', 'not'].filter(form => value[form] !== undefined)
  if (forms.length !== 1) return add(path, '条件写成 signal、clock、stage、all、any、not 之中的一种')
  const [form] = forms
  if (form === 'all' || form === 'any') {
    const items = value[form]
    if (!Array.isArray(items) || items.length === 0) return add(`${path}.${form}`, `${form} 要写成不空的条件列表`)
    items.forEach((item, index) => checkCondition(item, `${path}.${form}[${index}]`, depth + 1, signals, budget, add))
  }
  else if (form === 'not') checkCondition(value.not, `${path}.not`, depth + 1, signals, budget, add)
  else {
    budget.leaves++
    if (form === 'signal') checkSignal(value, path, signals, budget.stored, add)
    else if (form === 'clock') checkClock(value.clock, `${path}.clock`, add)
    else if (!(Array.isArray(value.stage) && value.stage.length > 0 && value.stage.every(stage => typeof stage === 'string' && (STAGES as readonly string[]).includes(stage)))) add(`${path}.stage`, `阶段写成 ${STAGES.join('、')} 里的几个`)
  }
}

function checkSignal(leaf: Readonly<Record<string, unknown>>, path: string, signals: ReadonlyMap<string, SignalType>, stored: boolean, add: Add): void {
  const type = typeof leaf.signal === 'string' ? signals.get(leaf.signal) : undefined
  if (type === undefined && !stored) return add(`${path}.signal`, '没有定义过这个信号')
  const extra = Object.keys(leaf).filter(key => key !== 'signal' && !(SIGNAL_COMPARISONS as readonly string[]).includes(key))
  if (extra.length > 0) return add(`${path}.${extra[0]}`, '信号条件没有这个字段')
  const given = SIGNAL_COMPARISONS.filter(comparison => leaf[comparison] !== undefined)
  if (given.length !== 1) return add(path, '信号条件写一种比较：is、in、above、below、known')
  // A stored rule may name a signal that was deleted since: the comparison is still one, its values cannot be held to a type.
  if (type === undefined) return
  const [comparison] = given
  const value = leaf[comparison]
  if (comparison === 'known') {
    if (value !== true) add(`${path}.known`, 'known 只能写 true')
  }
  else if (comparison === 'is') {
    if (!matchesType(type, value)) add(`${path}.is`, '比较的值要合这个信号的类型')
  }
  else if (comparison === 'in') {
    if (!(Array.isArray(value) && value.length > 0 && value.length <= 20 && value.every(item => matchesType(type, item)))) add(`${path}.in`, '要写成不空的值列表，每个合这个信号的类型')
  }
  else if (type.kind !== 'number' || typeof value !== 'number' || !Number.isFinite(value)) add(`${path}.${comparison}`, 'above 和 below 只配数值信号，值写成数字')
}

function isClockTime(time: unknown): boolean {
  return typeof time === 'string' && CLOCK_TIME.test(time)
}

function checkClock(clock: unknown, path: string, add: Add): void {
  if (!isRecord(clock)) return add(path, 'clock 要写成一个对象')
  for (const key of Object.keys(clock)) if (!['days', 'from', 'to', 'tz'].includes(key)) add(`${path}.${key}`, '时钟条件没有这个字段')
  if (!isClockTime(clock.from)) add(`${path}.from`, 'from 写成 HH:MM')
  if (!isClockTime(clock.to)) add(`${path}.to`, 'to 写成 HH:MM')
  else if (clock.from === clock.to) add(`${path}.to`, 'from 和 to 不能相同：空窗口与整天说不清')
  const days = clock.days
  if (days !== undefined && !(Array.isArray(days) && days.length > 0 && days.every(day => typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 7) && new Set(days).size === days.length)) add(`${path}.days`, 'days 写成 1 到 7 的不重复整数，1 是星期一')
  const zone = clock.tz
  if (zone !== undefined && zone !== 'local' && !(typeof zone === 'string' && CLOCK_ZONE.test(zone))) add(`${path}.tz`, 'tz 写 local 或 ±HH:MM')
}

function checkRootCondition(value: unknown, path: string, context: RuleContext, add: Add): void {
  const budget = { leaves: 0, stored: context.stored === true }
  checkCondition(value, path, 1, context.signals, budget, add)
  if (budget.leaves > MAX_CONDITION_LEAVES) add(path, `条件至多 ${MAX_CONDITION_LEAVES} 个叶子`)
}

function checkLifetime(rule: Readonly<Record<string, unknown>>, context: RuleContext, add: Add): void {
  const lifetime = rule.lifetime
  if (!isRecord(lifetime)) return add('lifetime', '期限要写成一个对象')
  const allowed = lifetime.kind === 'ttl' ? ['kind', 'expiresAt'] : lifetime.kind === 'until' ? ['kind', 'condition'] : ['kind']
  for (const key of Object.keys(lifetime)) if (!allowed.includes(key)) add(`lifetime.${key}`, '这种期限没有这个字段')
  if (lifetime.kind === 'ttl') {
    const at = typeof lifetime.expiresAt === 'string' ? Date.parse(lifetime.expiresAt) : Number.NaN
    // A stored rule's time to live may have run out; it only has to be a time.
    const sound = context.stored === true ? !Number.isNaN(at) : at > context.now.getTime() && at <= context.now.getTime() + MAX_TTL_MS
    if (!sound) add('lifetime.expiresAt', '到期时刻写成晚于现在、至多 30 天以后的 ISO 时刻')
  }
  else if (lifetime.kind === 'until') checkRootCondition(lifetime.condition, 'lifetime.condition', context, add)
  else if (lifetime.kind === 'session') {
    if (rule.scope !== 'session') add('lifetime', '只有会话规则能活到会话结束')
  }
  else if (lifetime.kind !== 'until-lifted') add('lifetime.kind', '期限写 until-lifted、ttl、until 或 session')
}

/**
 * Everything wrong with a rule as a person writes it (design §12), empty when it is sound: the identity fields, the
 * events, the filter against the events' declarations (the loop board's `validateWhen`), the pairing of events and
 * actions, a script action, the condition, the lifetime, and the limits of the project (at most 50 active rules, 10 of
 * them with a script). A request carries no `origin` or `status`. Never throws, whatever it is given.
 */
export function validateRule(input: unknown, context: RuleContext): readonly TriggerIssue[] {
  // One entry per path and sentence, in the order they were found.
  const found = new Map<string, TriggerIssue>()
  const add: Add = (path, message) => void found.set(`${path}\n${message}`, { path, message })
  if (!isRecord(input)) {
    add('rule', '规则要写成一个对象')
    return [...found.values()]
  }
  const rule = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
  const code = context.code === true
  checkFields(rule, code, add)
  checkIdentity(rule, code, add)
  for (const key of ['when', 'action', 'lifetime']) if (rule[key] === undefined) add(key, '必填')
  const events = rule.when === undefined ? undefined : checkEvents(rule.when, add)
  if (events !== undefined) {
    for (const issue of validateWhen(rule.when as Trigger, rule.filter as EventFilter | undefined, RULES_EVENT_TABLE, { allowGate: true, origin: 'person', now: context.now, action: 'work' })) add(issue.path, issue.message)
    checkFilter(rule.filter, code, add)
    if (rule.action !== undefined) checkAction(rule, events, context, add)
  }
  if (rule.condition !== undefined) checkRootCondition(rule.condition, 'condition', context, add)
  if (rule.lifetime !== undefined) checkLifetime(rule, context, add)
  if (!code && context.stored !== true && typeof rule.id === 'string' && context.existing.filter(other => other.id !== rule.id).length >= MAX_ACTIVE_RULES) {
    add('id', `这个项目已有 ${MAX_ACTIVE_RULES} 条生效的规则：先解除一些`)
  }
  return [...found.values()]
}
