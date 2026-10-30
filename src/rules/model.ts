/**
 * The rules board's model (docs/ORCHESTRATION.md §16; the full design is
 * .agents/tasks/rules/design.md §7.2): the state of one project, the journal
 * record that changes it, the part of the state a person decided (the file
 * in the repository), and the one function that says which peak level
 * applies. Pure types, validation and serialization; no Node built-in is
 * imported, so a client could import the file (as src/graph/parse.ts).
 *
 * The state holds what the peak level needs and no more; the rules,
 * proposals, signals, detectors and tickets of the full board join as
 * further top-level fields. Two things of the full design are left out on
 * purpose: `root` (a digest that covers the project path would fail every
 * verification once the folder is renamed or moved) and the collections no
 * code reads yet.
 *
 * A collection that is empty is absent from what is stored and digested: in
 * the state, in the digest of every journal record and in the rules file
 * (`withoutEmptyCollections`). That is what lets the full board add its
 * collections without a migration: a state that has them empty digests like
 * one that does not have them, so what this slice wrote still replays.
 */
import { PEAK_LEVEL_WORDS, type PeakLevel } from '../shared/peak-mode.ts'

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

/** One line of the difference between the repository file and the board's state. */
export interface RepoDiffLine {
  readonly path: readonly [string] | readonly [string, string]
  readonly change: 'added' | 'removed' | 'changed'
  readonly fields?: readonly string[]
}

export interface ProjectState {
  /** 2 from the first version of the board: the full design's shape. A snapshot with another version is not a snapshot. */
  readonly version: 2
  /** The sequence number of the last journal record. */
  readonly seq: number
  /** The person's peak level; present only once chosen. Readers go through effectivePeakMode. */
  readonly peakMode?: PeakModeSetting
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

/** One change of a state: replace or delete a top-level field, or one entry of `unresolved`. */
export interface Change {
  readonly path: readonly [string] | readonly [string, string]
  /** Absent means delete. */
  readonly value?: unknown
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

/** The part of the state a person decided: what goes into the repository. */
export interface RepoRules {
  readonly version: 2
  readonly peakMode?: PeakModeSetting
}

/** What the repository file holds for a state; undefined while the person decided nothing (no file). */
export function repoPart(state: ProjectState): RepoRules | undefined {
  return state.peakMode === undefined ? undefined : { version: 2, peakMode: state.peakMode }
}

function compareCodePoints(a: string, b: string): number {
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

type Problem = string | undefined

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isTime = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value))
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0

function unknownKeys(record: Record<string, unknown>, allowed: readonly string[], path: string): Problem {
  const extra = Object.keys(record).find(key => !allowed.includes(key))
  return extra === undefined ? undefined : `${path}.${extra} is not a field`
}

function textField(record: Record<string, unknown>, key: string, path: string): Problem {
  return record[key] === undefined || typeof record[key] === 'string' ? undefined : `${path}.${key} must be a string`
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

/** Why a value is not a project state, or undefined when it is one. */
export function stateProblem(value: unknown): Problem {
  if (!isRecord(value)) return 'the state must be an object'
  const extra = unknownKeys(value, ['version', 'seq', 'peakMode', 'repo', 'recovered', 'unresolved'], 'state')
  if (extra !== undefined) return extra
  if (value.version !== 2) return 'state.version must be 2'
  if (!isCount(value.seq)) return 'state.seq must be a count'
  if (value.peakMode !== undefined) {
    const problem = settingProblem(value.peakMode, 'state.peakMode')
    if (problem !== undefined) return problem
  }
  const repo = repoProblem(value.repo)
  if (repo !== undefined) return repo
  if (value.recovered !== undefined) {
    const problem = recoveredProblem(value.recovered)
    if (problem !== undefined) return problem
  }
  if (value.unresolved === undefined) return undefined
  if (!isRecord(value.unresolved)) return 'state.unresolved must be an object'
  return Object.entries(value.unresolved).map(([key, entry]) => skippedProblem(key, entry)).find(problem => problem !== undefined)
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
  const problem = unknownKeys(value, ['version', 'peakMode'], 'rules')
    ?? (value.version === 2 ? undefined : 'rules.version must be 2')
    ?? (value.peakMode === undefined ? undefined : settingProblem(value.peakMode, 'rules.peakMode'))
  if (problem !== undefined) return { ok: false, reason: problem }
  return { ok: true, repo: value as unknown as RepoRules }
}

/** The state a project starts from when it has the file and no record of its own: the decided part, nothing else. */
export function stateFromRepo(repo: RepoRules, digest: string): ProjectState {
  return { version: 2, seq: 1, ...(repo.peakMode === undefined ? {} : { peakMode: repo.peakMode }), repo: { digest } }
}

/** How the file in the repository differs from the part the state would export. */
export function diffRepo(state: ProjectState, file: RepoRules): readonly RepoDiffLine[] {
  const mine = state.peakMode
  const theirs = file.peakMode
  if (mine === undefined && theirs === undefined) return []
  if (mine === undefined) return [{ path: ['peakMode'], change: 'added' }]
  if (theirs === undefined) return [{ path: ['peakMode'], change: 'removed' }]
  const fields = (['level', 'at', 'origin'] as const).filter(field => canonicalJson(mine[field]) !== canonicalJson(theirs[field]))
  return fields.length === 0 ? [] : [{ path: ['peakMode'], change: 'changed', fields }]
}
