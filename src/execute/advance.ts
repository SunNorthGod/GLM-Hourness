/**
 * The trunk advance gate (M7 design 0.6 §3.8.4): the local trunk moves only
 * to a commit the harness checked, the published trunk only moves to a state
 * the local trunk reached through that gate, and the shell lines that could
 * move either one are recognised before they run.
 *
 * The pure half; every git fact arrives as a parameter:
 * - `advanceOk(facts, change)` — may the local trunk go from O to N. The
 *   check clause reads the passed check records; the floor clause reads the
 *   reviewed content; the fetched clause spares files that came in by a real
 *   pull. It answers what is missing, word for word what the refusal and the
 *   violation journal show.
 * - `pushOk(records, from, to, advance?)` — may the upstream's trunk go from
 *   T to N: backwards or nowhere, or exactly a state the local trunk reached,
 *   or by the same gate again.
 * - `classifyTrunkCall(call, state, options?)` — which of §3.8.4's rows one
 *   parsed git call falls into, with the target it would move the trunk (or
 *   the tracking reference) to; `advanceCorrection` words the refusal.
 * - `trunkEventOf(kind, line, files)` — the `hourness.trunk-advanced` and
 *   `hourness.outside-advance` events of §2.5 for one advances.jsonl line.
 *
 * The listener half, `installTrunkGate` (E7): `tools/pre-execute` judges
 * every git call in the shell calls of the main agent and its dispatch chain
 * against the rows above and refuses with the four-part correction;
 * `tools/post-execute` re-reads the local trunk L and the remote-tracking
 * reference T, writes the advances.jsonl line, the task evidence and the
 * completion (only once the review is settled), or, for a move the table did
 * not see (a script, an alias), the violation with `effect:
 * 'detected-after'` and the notice; the main agent's `agent/pre-step`
 * compares again and records a move no call claimed as `{by: 'outside'}`. A
 * passing local advance is kept by call id until post-execute (at most 60
 * seconds) for the rules board (`glmHournessExecute.trunkAdvanceFor`,
 * R4-F4). A check that passes after the reference had already moved writes
 * the evidence then (「检查在前进之后」).
 *
 * The call shapes follow M3's `gitInvocations` (src/guard/git-snapshot.ts):
 * one parsed `git <sub> <args…>` with global options already removed.
 */
import { stat } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { projectOf } from '../data/project-root.ts'
import { errorText } from '../design/tool-support.ts'
import { openEngine } from '../graph/engine.ts'
import { isDesignReview } from '../graph/execute-stage.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import type { Evidence, GraphNode } from '../graph/schema.ts'
import type { ExecuteRulesDeps } from '../guard/execute-rules.ts'
import { dispatchRoot } from '../guard/design-release.ts'
import { gitInvocations, type GitInvocation } from '../guard/git-snapshot.ts'
import { renderCorrection, shellCommandOf, type ToolCall } from '../guard/rules.ts'
import { dialectService, dialectWarner, toNativeTool } from '../shared/dialect.ts'
import { createUserNotice, type AgentLike, type AgentsService, type PostExecuteListener, type PreExecuteListener, type SessionLike } from '../shared/dsh-min.ts'
import type { JsonValue } from '../shared/json.ts'
import { latestDispatch, parseDispatchComment, parseHandbackComment, taskReviewOf, type HandbackComment } from './attempts.ts'
import { appendAdvance, readAdvances, readChecks, toHolder, trunkBranchOf, type VerifiedCheck } from './check.ts'
import { sha256Hex } from './digest.ts'
import type { GraphCache } from './dispatch.ts'
import { floorPathIn, parseFloor } from './floor.ts'
import { normDigest, parseGateNorm } from './gate-norm.ts'
import type { ParsedGate } from './gate-norm.ts'
import type { ParsedFloor } from './floor.ts'
import { reflogKind, type Git, type TrunkRefs } from './git.ts'
import { emitMetric } from './metrics.ts'
import { writeWithRetry } from './retry.ts'

/** A passed check record as checks.jsonl holds it (§3.8.3 step 8). */
interface PassedCheck {
  readonly commit: string
  /** The digest of the checklist the record ran under. */
  readonly normDigest: string
  /** The acceptance indexes the record ran. */
  readonly ran: readonly number[]
  readonly passed: true
}

/** One line of advances.jsonl (§3.8.4). */
export interface AdvanceRecord {
  readonly ref: 'local' | 'remote'
  readonly by?: 'fetch' | 'push' | 'outside'
  readonly from: string
  readonly to: string
  readonly ok?: boolean
  /** The agent whose call moved the reference, and the call. */
  readonly agent?: string
  readonly callId?: string
  /** The passed record's commit the advance stood on; `null` for a rollback. */
  readonly check?: string | null
  /** The advance passed because it changed `only` paths and nothing else. */
  readonly only?: boolean
  /** The tasks named by the trailers the advance brought in. */
  readonly tasks?: readonly string[]
  /** Must-review files that came in by a real fetch and were not fully reviewed on this machine. */
  readonly incomingFloor?: readonly string[]
  readonly at?: string
  /** What a refused or unchecked advance lacked, in the words of `advanceOk`. */
  readonly missing?: string
  /** The check passed after the reference had already moved (「检查在前进之后」). */
  readonly checkedAfter?: true
}

/** The change between two commits, as `changedFiles` (src/execute/git.ts) reads it. */
export interface AdvanceChange {
  /** Every path the change touches: added, modified, deleted, type-changed. */
  readonly paths: readonly string[]
  /** The paths the change deletes. */
  readonly deleted: readonly string[]
}

/** The review facts of the floor clause, per file; the caller asks git. */
export interface AdvanceReviews {
  /** Whether a passed full review saw the same content this advance carries: the reviewed commit's blob of the file equals N's (§3.8.4). */
  readonly same: (path: string) => boolean
  /** Whether a passed full review deleted this file too. */
  readonly deleted: (path: string) => boolean
  /** Whether the review of the work the task's latest dispatch handed back passed as a full one (a review of an earlier attempt does not count). */
  readonly taskFull: (task: string) => boolean
}

/** Everything `advanceOk` judges by. */
export interface AdvanceFacts {
  /** The gate as it reads now, with the digest of this list. */
  readonly gate: ParsedGate
  readonly normDigest: string
  /** The passed records of checks.jsonl, under any digest. */
  readonly checks: readonly PassedCheck[]
  /** For a passed record's commit: the paths it differs from N by; empty when it is N (git compares the trees). */
  readonly pathsToN: (commit: string) => readonly string[]
  /** The floor as it reads now (§3.8.5); no node is an empty floor that binds nobody. */
  readonly floor: ParsedFloor
  readonly reviews: AdvanceReviews
  /** The tasks named by the `Hourness-Task` trailers in O..N, and whether that task's own command record hit a `commands` or `outside` line. */
  readonly tasks: readonly { readonly task: string, readonly hit: boolean }[]
  /** The project-graph directory only the graph tools write; the strict floor spares it (§3.8.4). */
  readonly graphDir: string | undefined
  /** The files that came in by a real fetch and sit under no unchecked push: they need no full review, the check still binds (§3.8.4). */
  readonly floorExempt: ReadonlySet<string>
}

export type AdvanceVerdict =
  | { readonly ok: true }
  /** `review` names what the floor clause wants a passed full review of: the file, or the trailer task. */
  | { readonly ok: false, readonly missing: string, readonly review?: { readonly file: string } | { readonly task: string } }

/** What the check clause answers when it fails (§3.8.4's refusal names what is missing). */
const MISSING = { check: 'no passed merge check covers the change under the current checklist' } as const

/** Whether every path sits inside one of the prefixes; nothing to place is inside anything. */
const withinPaths = (paths: readonly string[], prefixes: readonly string[]): boolean =>
  prefixes.length > 0 && paths.every(path => floorPathIn(prefixes, path))

/** Whether the paths differ from a commit by `only` paths: no difference, or every difference inside. */
const differsByOnly = (paths: readonly string[], only: readonly string[]): boolean =>
  paths.length === 0 || withinPaths(paths, only)

/** Whether the record ran every `when` command the change asks for; `ran` holds acceptance indexes, which prose, `only` and `push` lines shift away from the positions in `commands`. */
function coversWhen(record: PassedCheck, gate: ParsedGate, change: AdvanceChange): boolean {
  return gate.commands.every((command) => {
    if (command.kind !== 'check') return true
    const touches = (command.when ?? []).some(prefix => change.paths.some(path => floorPathIn([prefix], path)))
    return !touches || record.ran.includes(command.index)
  })
}

/**
 * May the local trunk go from O to N (§3.8.4). Backwards: always — the
 * snapshots keep what a rewrite loses, and no evidence is written. Forwards,
 * two clauses must both hold:
 * - the check clause: one passed record under the current digest covers the
 *   advance — its commit equals N or differs from N by `only` paths, and
 *   every `when` command the change asks for is in the record — or the
 *   change touches only `only` paths;
 * - the floor clause: every touched file under a `files` path — every
 *   touched file at all when the floor has unparsed lines, sparing the graph
 *   directory and the `only` paths — saw the same content in a passed full
 *   review, every deletion was reviewed as one (when the floor has a
 *   `deletes` line, or always in the strict reading), and every trailer task
 *   whose own command record hit a `commands` or `outside` line — all of
 *   them in the strict reading — has a passed full review. Files in
 *   `floorExempt` (fetched in by a real pull, under no unchecked push) need
 *   no review; the check clause still binds them.
 */
export function advanceOk(facts: AdvanceFacts, change: AdvanceChange): AdvanceVerdict {
  // The check clause: one passed record under the current digest that differs
  // from N by only paths and ran every when command the change asks for — or
  // the change touches only paths. The floor clause binds on top of it.
  const checked = facts.checks.some(candidate => coveredBy(facts, change, candidate)) || differsByOnly(change.paths, facts.gate.only)
  if (!checked) return { ok: false, missing: MISSING.check }
  const floor = floorReading(facts)
  const unreviewed = change.paths.filter(path => floor.binds(path) && !floor.exempt(path) && !facts.reviews.same(path))
  const undeleted = floor.deletes
    ? change.deleted.filter(path => !floor.exempt(path) && !facts.reviews.deleted(path))
    : []
  const uncheckedTasks = facts.tasks.filter(({ task, hit }) => (floor.strict || hit) && !facts.reviews.taskFull(task)).map(({ task }) => task)
  const binding = '(the must-review floor binds the trunk)'
  const [file] = unreviewed
  if (file !== undefined) return { ok: false, missing: `no passed full review saw ${file} ${binding}`, review: { file } }
  const [gone] = undeleted
  if (gone !== undefined) return { ok: false, missing: `no passed full review saw the deletion of ${gone} ${binding}`, review: { file: gone } }
  const [task] = uncheckedTasks
  if (task !== undefined) return { ok: false, missing: `the task of the ${task} trailer has no passed full review ${binding}`, review: { task } }
  return { ok: true }
}

/** Whether the check clause can stand on this passed record: under the current digest, differing from N by only paths, running every `when` command the change asks for. */
function coveredBy(facts: AdvanceFacts, change: AdvanceChange, candidate: PassedCheck): boolean {
  return candidate.passed
    && candidate.normDigest === facts.normDigest
    && differsByOnly(facts.pathsToN(candidate.commit), facts.gate.only)
    && coversWhen(candidate, facts.gate, change)
}

/** How the floor reads for one advance: which paths it binds, which it spares, and whether deletions need a review. */
function floorReading(facts: Pick<AdvanceFacts, 'floor' | 'floorExempt' | 'graphDir' | 'gate'>): { readonly strict: boolean, readonly deletes: boolean, readonly binds: (path: string) => boolean, readonly exempt: (path: string) => boolean } {
  const strict = facts.floor.unparsed.length > 0
  const filesPaths = facts.floor.entries.flatMap(entry => entry.tests.filter(test => test.form === 'files').map(test => test.paths)).flat()
  const deletesEntry = facts.floor.entries.some(entry => entry.tests.some(test => test.form === 'deletes'))
  return {
    strict,
    deletes: strict || deletesEntry,
    binds: path => strict || filesPaths.some(prefix => floorPathIn([prefix], path)),
    exempt: path => facts.floorExempt.has(path)
      || (strict && ((facts.graphDir !== undefined && floorPathIn([facts.graphDir], path)) || withinPaths([path], facts.gate.only))),
  }
}

/** The files the fetched clause spared from the floor (§3.8.4's `incomingFloor`): bound by it, not fully reviewed here, and in `floorExempt`. */
function incomingFloorOf(facts: AdvanceFacts, change: AdvanceChange): string[] {
  const floor = floorReading(facts)
  const changed = change.paths.filter(path => floor.binds(path) && !facts.reviews.same(path))
  const removed = floor.deletes ? change.deleted.filter(path => !facts.reviews.deleted(path)) : []
  return [...new Set([...changed, ...removed])].filter(path => facts.floorExempt.has(path))
}

/**
 * May the upstream's trunk go from T to N (§3.8.4): backwards or nowhere; or
 * N is exactly a state the local trunk reached through the gate (a local
 * record with `ok`, whatever wrote it afterwards); or the same advance gate
 * as from T, when the caller binds `advanceOk` to the T..N change. A task
 * branch, or an intermediate commit between two local advances, fits none
 * of the three.
 */
export function pushOk(records: readonly AdvanceRecord[], from: string, to: string, advance?: (from: string, to: string) => AdvanceVerdict): AdvanceVerdict {
  if (to === from) return { ok: true }
  if (records.some(record => record.ref === 'local' && record.ok === true && record.to === to)) return { ok: true }
  if (advance !== undefined) return advance(from, to)
  return { ok: false, missing: `the published trunk would move to ${to}, which the local trunk never reached through the gate` }
}

// ---- the pre-execute classification (§3.8.4's table) ----

/** One parsed git call, as M3's `gitInvocations` returns it. */
export interface TrunkCall {
  readonly sub: string
  readonly args: readonly string[]
}

/** The repository state the classification judges by; the caller reads git once per call. */
export interface TrunkState {
  /** The trunk branch's name. */
  readonly trunk: string
  /** The branch the checkout is on; undefined when detached. */
  readonly current: string | undefined
  /** Whether the checkout is on the trunk. */
  readonly onTrunk: boolean
  /** The upstream remote's name; undefined without a remote. */
  readonly remote: string | undefined
  /** The upstream remote's URL, as `git remote get-url` prints it. */
  readonly remoteUrl: string | undefined
  /** The repository's own root, for `push . <rev>:<trunk>` and its file:// form. */
  readonly selfPath: string | undefined
}

/** What one call would do to the trunk or its published view (§3.8.4). */
export type CallVerdict =
  | { readonly verdict: 'advance', readonly target: string }
  | { readonly verdict: 'push', readonly target: string | undefined }
  | { readonly verdict: 'allow' }
  | { readonly verdict: 'refuse', readonly why: RefusalWhy }

export type RefusalWhy =
  | 'pull'
  | 'remote-tracking'
  | 'symbolic-trunk'
  | 'push-all'
  | 'delete-trunk'
  | 'unpredictable'
  /** The upstream push row when `pushOk` fails (D13; `classifyTrunkCall` never answers it). */
  | 'push'

const RESET_MODES: ReadonlySet<string> = new Set(['--hard', '--keep', '--merge', '--soft'])
const MOVE_FLAGS: ReadonlySet<string> = new Set(['-M', '-m', '--move', '-C', '-c'])

/** The positional arguments of the call: options and their values taken out, `--` kept as a wall. */
function positionals(args: readonly string[], valued: ReadonlySet<string>): readonly string[] {
  const rest: string[] = []
  for (let at = 0; at < args.length; at++) {
    const word = args[at] ?? ''
    if (word === '--') return [...rest, ...args.slice(at + 1)]
    if (word.startsWith('-')) {
      const name = word.split('=')[0] ?? word
      if (!word.includes('=') && valued.has(name)) at += 1
      continue
    }
    rest.push(word)
  }
  return rest
}

const flagsOf = (args: readonly string[]): ReadonlySet<string> =>
  new Set(args.filter(word => word.startsWith('-')).map(word => word.split('=')[0] ?? word))

/** Whether `name` is the upstream: the configured remote, or a URL that normalises to its URL. */
function isUpstream(name: string, state: TrunkState): boolean {
  if (state.remote === undefined) return false
  if (name === state.remote) return true
  if (state.remoteUrl === undefined) return false
  const strip = (value: string): string => value.replace(/^file:\/\//, '').replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase()
  return strip(name) === strip(state.remoteUrl)
}

/** Whether `name` is the repository itself: `.`, its own path, or a file:// URL of it. */
function isSelf(name: string, state: TrunkState): boolean {
  if (name === '.') return true
  if (state.selfPath === undefined) return false
  const strip = (value: string): string => value.replace(/^file:\/\//, '').replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase()
  return strip(name) === strip(state.selfPath)
}

/** Whether a refspec destination names the trunk: `main` or `refs/heads/main`. */
const namesTrunk = (ref: string, trunk: string): boolean => ref === trunk || ref === `refs/heads/${trunk}`

const advance = (target: string): CallVerdict => ({ verdict: 'advance', target })
const refuse = (why: RefusalWhy): CallVerdict => ({ verdict: 'refuse', why })

/**
 * Which row of §3.8.4's pre-execute table one parsed git call falls into —
 * the local-trunk rows that resolve a target and hand it to `advanceOk`, the
 * push rows that hand theirs to `pushOk`, the rows that refuse outright, and
 * everything the post-execute compare catches, which is `allow`. The rows
 * E3's review added (E3-9) sit in the same table: `push . <rev>:<trunk>`,
 * `branch -M <x> <trunk>`, `worktree add -B <trunk> <path> <rev>`,
 * `pull . <rev>:<trunk>`, and the `symbolic-ref` of the trunk itself, which
 * has no way through at all.
 */
export function classifyTrunkCall(call: TrunkCall, state: TrunkState, options?: {
  /** The paths `commit` has staged, when the call is a commit and the caller could read them. */
  readonly staged?: readonly string[]
  /** The gate's `only` paths, for the commit row. */
  readonly only?: readonly string[]
}): CallVerdict {
  const { sub, args } = call
  const flags = flagsOf(args)
  const trunk = state.trunk
  switch (sub) {
    case 'merge': {
      const target = positionals(args, new Set()).at(-1)
      if (flags.has('--ff-only')) return target === undefined ? (state.onTrunk ? refuse('unpredictable') : { verdict: 'allow' }) : advance(target)
      return state.onTrunk ? refuse('unpredictable') : { verdict: 'allow' }
    }
    case 'reset': {
      const modes = args.filter(word => RESET_MODES.has(word))
      const target = positionals(args, new Set()).at(-1)
      if (modes.length > 0 && target !== undefined && state.onTrunk) return advance(target)
      return { verdict: 'allow' }
    }
    case 'branch': {
      if (args.some(word => word === '-r' || word === '--remotes')) {
        const touching = args.some(word => word === '-d' || word === '-D' || MOVE_FLAGS.has(word))
        return touching ? refuse('remote-tracking') : { verdict: 'allow' }
      }
      const rest = positionals(args, new Set())
      const move = args.some(word => MOVE_FLAGS.has(word))
      const force = args.some(word => word === '-f' || word === '--force')
      if (move && rest.length >= 1 && rest.at(-1) === trunk) {
        const source = rest.length >= 2 ? rest[0] : state.current
        return source === undefined || source === '' ? refuse('unpredictable') : advance(source)
      }
      if (!move && force && rest.length >= 2 && rest[0] === trunk) return advance(rest[1] ?? '')
      return { verdict: 'allow' }
    }
    case 'update-ref': {
      const rest = args.filter(word => !word.startsWith('-'))
      const ref = rest[0] ?? ''
      if (namesTrunk(ref, trunk)) {
        const target = rest[1]
        return target === undefined ? { verdict: 'allow' } : advance(target)
      }
      if (ref.startsWith('refs/remotes/')) return refuse('remote-tracking')
      return { verdict: 'allow' }
    }
    case 'symbolic-ref': {
      const ref = args.filter(word => !word.startsWith('-'))[0] ?? ''
      if (namesTrunk(ref, trunk)) return refuse('symbolic-trunk')
      if (ref.startsWith('refs/remotes/')) return refuse('remote-tracking')
      return { verdict: 'allow' }
    }
    case 'checkout':
    case 'switch': {
      const create = args.findIndex(word => word === '-B' || word === '-C')
      if (create < 0) return { verdict: 'allow' }
      if (args[create + 1] !== trunk) return { verdict: 'allow' }
      const target = args.filter((word, index) => index !== create && index !== create + 1 && !word.startsWith('-')).at(-1)
      return target === undefined ? refuse('unpredictable') : advance(target)
    }
    case 'fetch': {
      const rest = positionals(args, new Set())
      for (const refspec of rest.slice(1)) {
        const [source = '', destination = ''] = refspec.split(':')
        if (destination === '') continue
        if (destination.startsWith('refs/remotes/')) return refuse('remote-tracking')
        if (namesTrunk(destination, trunk)) {
          if (isSelf(rest[0] ?? '', state)) return source === '' ? refuse('pull') : advance(source)
          return refuse('pull')
        }
      }
      return { verdict: 'allow' }
    }
    case 'pull': {
      if (state.onTrunk) return refuse('pull')
      const rest = positionals(args, new Set())
      for (const refspec of rest.slice(1)) {
        const [source = '', destination = ''] = refspec.split(':')
        if (!namesTrunk(destination, trunk)) continue
        if (isSelf(rest[0] ?? '', state)) return source === '' ? refuse('pull') : advance(source)
        return refuse('pull')
      }
      return { verdict: 'allow' }
    }
    case 'push': {
      if (flags.has('--all') || flags.has('--mirror')) {
        const remote = positionals(args, new Set())[0] ?? ''
        return remote === '' || isUpstream(remote, state) || isSelf(remote, state) ? refuse('push-all') : { verdict: 'allow' }
      }
      const rest = positionals(args, new Set())
      const remote = rest[0] ?? ''
      const refspec = rest[1]
      if (refspec === undefined) return state.onTrunk && (remote === '' || isUpstream(remote, state)) ? { verdict: 'push', target: trunk } : { verdict: 'allow' }
      const [source = '', destination = ''] = refspec.split(':')
      if (destination.startsWith('refs/remotes/')) {
        return isSelf(remote, state) || isUpstream(remote, state) ? refuse('remote-tracking') : { verdict: 'allow' }
      }
      if (namesTrunk(destination, trunk)) {
        if (source === '') return refuse('delete-trunk')
        if (isSelf(remote, state)) return advance(source)
        if (isUpstream(remote, state)) return { verdict: 'push', target: source }
        return { verdict: 'allow' }
      }
      if (destination === '' && namesTrunk(source, trunk)) {
        if (isUpstream(remote, state)) return { verdict: 'push', target: trunk }
        return { verdict: 'allow' }
      }
      return { verdict: 'allow' }
    }
    case 'worktree': {
      const add = args.findIndex(word => word === 'add')
      if (add < 0) return { verdict: 'allow' }
      const flag = args.findIndex((word, index) => index > add && (word === '-B' || word === '-C'))
      if (flag < 0 || args[flag + 1] !== trunk) return { verdict: 'allow' }
      const rest = args.filter((word, index) => index > add && index !== flag && index !== flag + 1 && !word.startsWith('-'))
      const target = rest[1]
      return target === undefined ? refuse('unpredictable') : advance(target)
    }
    case 'commit': {
      if (!state.onTrunk) return { verdict: 'allow' }
      const staged = options?.staged
      const only = options?.only ?? []
      if (staged === undefined || !withinPaths(staged, only)) return refuse('unpredictable')
      return { verdict: 'allow' }
    }
    case 'rebase':
    case 'cherry-pick':
    case 'revert':
    case 'am':
      return state.onTrunk ? refuse('unpredictable') : { verdict: 'allow' }
    default:
      return { verdict: 'allow' }
  }
}

/**
 * The four-part correction a refusal shows (§3.8.4): the fact, the
 * boundary, the way through, the exceptions. A `floorLine` replaces the
 * empty exception when the must-review floor is what stopped the move.
 */
export function advanceCorrection(why: RefusalWhy, names: {
  readonly trunk: string
  readonly from: string
  readonly to: string
  readonly remote?: string
  readonly missing?: string
  readonly floorLine?: string
}): readonly string[] {
  const { trunk, from, to } = names
  const fact = `${trunk} would move from ${from} to ${to} without a passed merge check${names.missing === undefined ? '' : ` (${names.missing})`}.`
  switch (why) {
    case 'pull':
      return [
        fact,
        'The main branch moves only to a commit the harness checked.',
        'Pull in three steps: git fetch <upstream>; run check_commit <upstream>/<trunk>; then git merge --ff-only <upstream>/<trunk> once it passes.',
        names.floorLine ?? 'none',
      ]
    case 'remote-tracking':
      return [
        `${names.remote ?? 'the upstream'}/${trunk} is the harness's view of the published main branch; only git fetch updates it.`,
        'The main branch moves only to a commit the harness checked.',
        'Run git fetch <upstream> without a refspec and let git update the remote-tracking reference.',
        'none',
      ]
    case 'symbolic-trunk':
      return [
        `${trunk} would become a symbolic reference to ${to}; the gate could no longer see where its commits go.`,
        'The main branch moves only to a commit the harness checked.',
        'There is no way through: keep the trunk a real branch and move it with git merge --ff-only.',
        'none',
      ]
    case 'push-all':
      return [
        `${names.remote ?? 'the upstream'}/${trunk} would be pushed for every branch at once.`,
        'The main branch moves only to a commit the harness checked.',
        `Push the trunk by name: git push ${names.remote ?? '<upstream>'} ${trunk}.`,
        'none',
      ]
    case 'delete-trunk':
      return [
        `${names.remote ?? 'the upstream'}/${trunk} would be deleted on the remote.`,
        'The published main branch only moves forward to a state the local trunk reached.',
        'There is no way through for a deletion; ask the person before touching the published trunk.',
        'none',
      ]
    case 'unpredictable':
      return [
        fact,
        'The main branch moves only to a commit the harness checked.',
        BUILD_AND_CHECK,
        names.floorLine ?? 'none',
      ]
    case 'push':
      return [
        `${names.remote ?? 'the upstream'}/${trunk} would be pushed from ${from} to ${to} without a passed merge check${names.missing === undefined ? '' : ` (${names.missing})`}.`,
        'The main branch moves only to a commit the harness checked.',
        BUILD_AND_CHECK,
        names.floorLine ?? 'none',
      ]
  }
}

const BUILD_AND_CHECK = 'Build the commit off the main branch (for example in the task\'s worktree), run check_commit <commit>, then fast-forward the trunk with git merge --ff-only <commit>.'

// ---- the two trunk events (§2.5) ----

/** At most this many changed files travel in an event (§2.5). */
const EVENT_FILES = 200

/** One trunk event as the loop board's `emit` takes it: the declared payload of `src/execute/entries.ts` and the key of this one occurrence. */
interface TrunkEvent {
  readonly event: 'hourness.trunk-advanced' | 'hourness.outside-advance'
  readonly key: string
  readonly payload: Readonly<Record<string, string | boolean | readonly string[]>>
}

/**
 * The event of one advances.jsonl line (§2.5): `hourness.trunk-advanced`
 * after a checked local advance (with the trailer tasks, comma-joined),
 * `hourness.outside-advance` after a move nobody's call claimed or an
 * unchecked push; the files of the change, at most 200, and whether the list
 * was cut. The key is `<name>:<to>:<the line's at>`, the same for every
 * replay of this one occurrence.
 */
export function trunkEventOf(kind: 'trunk-advanced' | 'outside-advance', line: AdvanceRecord, files: readonly string[]): TrunkEvent {
  const shown = files.slice(0, EVENT_FILES)
  return {
    event: `hourness.${kind}`,
    key: `${kind}:${line.to}:${line.at ?? ''}`,
    payload: {
      from: line.from,
      to: line.to,
      ...(kind === 'trunk-advanced' ? { tasks: (line.tasks ?? []).join(',') } : {}),
      files: shown,
      truncated: files.length > shown.length,
    },
  }
}

// ---------------------------------------------------------------------------
// The listener half (§3.8.4, E7)

/** The violation journal's id of the rule; the rules board's catalog adds `execute:` (D8). */
const RULE = 'trunk-advance-checked'
/** A passing local advance stays readable by call id this long when post-execute never comes (R4-F4). */
const ADVANCE_KEEP_MS = 60_000
/** A call whose post-execute has not come after this long counts as one that never will (§15 U20). */
const ORPHAN_MS = 60_000
/** How long the trunk, its upstream and the upstream's URL are kept per project before they are read again. */
const SETUP_FRESH_MS = 30_000
/** How many of the newest passed records an advance compares by path (D11): a missed older one means a refusal and a re-run of check_commit. */
const COMPARED_RECORDS = 50
/** How many of the newest fetch lines the fetched clause reads. */
const FETCH_LINES = 20
/** What `pathsToN` answers for a record that was not compared: a path no `only` prefix holds. */
const NOT_COMPARED: readonly string[] = ['(not compared: older than the newest passed records)']
const EMPTY_GRAPH: LoadedGraph = { nodes: new Map(), revisions: new Map(), revision: '', issues: [] }

const FOLD_CASE = process.platform === 'win32' || process.platform === 'darwin'
const pathKey = (path: string): string => FOLD_CASE ? resolve(path).toLowerCase() : resolve(path)
const samePath = (a: string, b: string): boolean => pathKey(a) === pathKey(b)
const short = (commit: string): string => commit.slice(0, 12)

/** The local advance a call is about to make, as the rules board reads it before the call runs (R4-F4). */
interface TrunkAdvance {
  readonly branch: string
  readonly from: string
  readonly to: string
}

/** The trunk of a project and where it is published. */
interface TrunkSetup {
  readonly trunk: string
  readonly remote: string | undefined
  /** `refs/remotes/<remote>/<trunk>`. */
  readonly tracking: string | undefined
  readonly remoteUrl: string | undefined
}

/** What one call saw before it ran: the two references, who called, the git calls of its text. */
interface Baseline {
  readonly project: string
  readonly setup: TrunkSetup
  readonly local: string | undefined
  readonly remote: string | undefined
  readonly agentId: string
  readonly sessionId: string
  readonly tool: string
  readonly callId: string
  /** The git calls of the shell text that run in this project. */
  readonly invocations: readonly GitInvocation[]
  readonly startedAt: number
}

/** The calls that may have made one move, the comparing call first. */
type Movers = readonly [Baseline, ...Baseline[]]

/** A passed record as checks.jsonl holds it, with its verified result. */
type PassedRecord = VerifiedCheck & { readonly passed: true }

/** Everything one advance is judged by, read from git, the records and the graph. */
interface AdvanceRead {
  readonly facts: AdvanceFacts
  readonly change: AdvanceChange
  readonly passed: readonly PassedRecord[]
  /** Trailer task → the newest commit of the range that names it. */
  readonly trailers: ReadonlyMap<string, string>
}

/** What the gate needs from the execute row. */
interface TrunkGateDeps extends Pick<ExecuteRulesDeps, 'lookup' | 'register' | 'owning' | 'effectiveDir' | 'journal'> {
  readonly git: Git
  readonly cache: GraphCache
  readonly graphDirOfRoot: (root: string) => string
  readonly execDir: (projectRoot: string) => string
  /** Whether the agent is its project's main agent now; may throw. */
  readonly isMain: (agent: { readonly id: string, readonly session?: SessionLike }) => boolean
  readonly report: (sessionId: string | undefined, state: 'active' | 'degraded', reason: string) => void
  /** Whether a trailer task's own command record hit a `commands` or `outside` line of the floor (§3.8.4). */
  readonly taskHit: (project: string, graph: LoadedGraph, task: string) => Promise<boolean>
  /** Hand one trunk event on: E7 runs the `execute.trunk` entry in this process (D4), E8 emits it. `sessionId` is the session whose call or step saw the move, for the row health. */
  readonly onTrunkEvent: (project: string, trunk: string, event: TrunkEvent, sessionId: string | undefined) => void
  /** The clock of the records' times; tests pin it. */
  readonly now?: () => Date
}

/** The host events the gate listens on. */
interface TrunkGateHost {
  on(event: 'tools/pre-execute', listener: PreExecuteListener, options?: { prepend?: boolean }): () => void
  on(event: 'tools/post-execute', listener: PostExecuteListener, options?: { prepend?: boolean }): () => void
  on(event: 'agent/pre-step', listener: (payload: { readonly agent: AgentLike }, next: () => Promise<unknown>) => Promise<unknown>): () => void
}

/**
 * The task evidence of a check (§3.8.4): the trailer commit, and each
 * command of the record; the `only` check when the advance passed by paths
 * or stood on an `only` record; the record itself (`trunk check <C12>`,
 * `merge check <C12>`, with its result file) when it ran no command because
 * earlier records covered it.
 */
function evidenceOf(trailerCommit: string, record: VerifiedCheck | undefined, only: readonly string[]): Evidence[] {
  const commands = record?.detail.commands ?? []
  const ran: Evidence[] = commands.length > 0
    ? commands.map((command): Evidence => ({ kind: 'test', ref: command.line, exit: 0, note: command.log }))
    : record === undefined || record.kind === 'only'
      ? [{ kind: 'check', ref: `only ${only.join(', ')}`, exit: 0 }]
      : [{ kind: 'check', ref: `${record.kind === 'trunk' ? 'trunk check' : 'merge check'} ${short(record.commit)}`, exit: 0, note: record.result }]
  return [{ kind: 'commit', ref: trailerCommit }, ...ran]
}

/** The record the evidence names among those that cover an advance: the newest that ran commands, else the newest (F6: a covering record that ran nothing understates what ran). */
function evidenceRecord<T extends VerifiedCheck>(covering: readonly T[]): T | undefined {
  return [...covering].reverse().find(candidate => candidate.detail.commands.length > 0) ?? covering.at(-1)
}

/** When the task's latest dispatch comment was written; undefined when it was never dispatched. */
function dispatchedAt(node: GraphNode): string | undefined {
  return node.history.filter(entry => entry.op === 'comment' && entry.actor === 'harness' && entry.text !== undefined && parseDispatchComment(entry.text) !== undefined).at(-1)?.at
}

/** What a done review task's passing round saw, from its latest done evidence (`review <childId>`, note `<commit12> · <全审|轻审> · …`): the commit, the depth and when it passed. */
function passedReview(node: GraphNode): { readonly commit: string, readonly depth: '全审' | '轻审', readonly at: string } | undefined {
  const done = node.history.filter(entry => entry.op === 'status' && entry.to === 'done').at(-1)
  if (done === undefined) return undefined
  for (const item of done.evidence ?? []) {
    if (item.kind !== 'check' || !item.ref.startsWith('review ') || item.exit !== 0) continue
    const seen = /^([0-9a-f]{7,40}) · (全审|轻审)(?: · |$)/.exec(item.note ?? '')
    if (seen !== null) return { commit: seen[1], depth: seen[2] as '全审' | '轻审', at: done.at }
  }
  return undefined
}

/** The 12-hex commit a done review task's passing full review saw. */
function fullReviewCommit(node: GraphNode): string | undefined {
  const passed = passedReview(node)
  return passed?.depth === '全审' ? passed.commit : undefined
}

/** The done handback of the task's latest dispatch; undefined while that dispatch has not handed back done (an earlier attempt's handback does not speak for a rework). */
function currentHandback(node: GraphNode): HandbackComment | undefined {
  const dispatch = latestDispatch(node)
  if (dispatch === undefined) return undefined
  return node.history
    .flatMap(entry => entry.op === 'comment' && entry.actor === 'harness' && entry.text !== undefined ? [parseHandbackComment(entry.text)] : [])
    .filter((entry): entry is HandbackComment => entry !== undefined && entry.status === 'done' && entry.childId === dispatch.childId)
    .at(-1)
}

/**
 * The depth of the passing review of the task's current handback (§3.8.4,
 * review N4): its review task passed no earlier than the latest dispatch, on
 * the commit that handback names. A rework reuses the review task an earlier
 * attempt finished (src/execute/handback.ts proposes one only when none
 * exists), so the review task being done says nothing about the rework.
 */
function currentReviewDepth(graph: LoadedGraph, node: GraphNode, handback: HandbackComment): '全审' | '轻审' | undefined {
  const review = taskReviewOf(graph, node.id)
  const passed = review?.status === 'done' ? passedReview(review) : undefined
  const since = dispatchedAt(node)
  if (passed === undefined || since === undefined || Date.parse(passed.at) < Date.parse(since)) return undefined
  const head = handback.head
  if (head !== undefined && !passed.commit.startsWith(head) && !head.startsWith(passed.commit)) return undefined
  return passed.depth
}

/** Whether a task's review is settled (§3.8.4, review N4): the latest dispatch handed back done with review skipped, or the review of that handback passed. */
function reviewSettled(graph: LoadedGraph, node: GraphNode): boolean {
  const handback = currentHandback(node)
  if (handback === undefined) return false
  if (handback.depth === undefined) return true
  return currentReviewDepth(graph, node, handback) !== undefined
}

/** The options of `git commit` that take a value (the next word, or the rest of a short cluster). */
const COMMIT_VALUED_SHORT: ReadonlySet<string> = new Set(['m', 'F', 'C', 'c', 't'])
const COMMIT_VALUED_LONG: ReadonlySet<string> = new Set(['--message', '--file', '--reuse-message', '--reedit-message', '--fixup', '--squash', '--author', '--date', '--template', '--cleanup', '--trailer', '--pathspec-from-file'])

/** What a `git commit` call records: `-a`/`--all`, the pathspecs it names, and whether they come from a file the text does not show. */
function commitArgs(args: readonly string[]): { readonly all: boolean, readonly paths: readonly string[], readonly fromFile: boolean } {
  let all = false
  let fromFile = false
  const paths: string[] = []
  for (let at = 0; at < args.length; at++) {
    const word = args[at] ?? ''
    if (word === '--') {
      paths.push(...args.slice(at + 1))
      break
    }
    if (word.startsWith('--')) {
      const name = word.split('=')[0] ?? word
      if (name === '--all') all = true
      if (name === '--pathspec-from-file') fromFile = true
      if (!word.includes('=') && COMMIT_VALUED_LONG.has(name)) at += 1
      continue
    }
    if (word.startsWith('-') && word.length > 1) {
      const letters = [...word.slice(1)]
      for (const [index, letter] of letters.entries()) {
        if (letter === 'a') all = true
        if (!COMMIT_VALUED_SHORT.has(letter)) continue
        if (index === letters.length - 1) at += 1
        break
      }
      continue
    }
    paths.push(word)
  }
  return { all, paths, fromFile }
}

/** What a refused row's fact names as the target, which the call itself decides. */
function unknownTarget(sub: string): string {
  switch (sub) {
    case 'pull':
    case 'fetch': return 'what the pull brings in'
    case 'commit': return 'a new commit'
    case 'merge': return 'a merge result'
    default: return `the result of git ${sub}`
  }
}

/** The floor clause's way through, in the exception part of the correction (§3.8.4). */
function floorLineOf(verdict: AdvanceVerdict): { readonly floorLine?: string } {
  if (verdict.ok || verdict.review === undefined) return {}
  return { floorLine: 'file' in verdict.review ? `dispatch a full review of the task that changed ${verdict.review.file}` : `dispatch a full review of ${verdict.review.task}` }
}

/**
 * Install the trunk-advance check (§3.8.4) on the host: `tools/pre-execute`
 * and `tools/post-execute`, prepended, and `agent/pre-step` for the main
 * agent. Returns the uninstall function; `trunkAdvanceFor(callId)`, the local
 * advance a running call was allowed to make (R4-F4); `checkedAfter(project,
 * commit, sessionId)`, which a passing check calls to write the evidence an
 * unchecked move was waiting for (a write that fails is said in that
 * session's row health); and `trunkEvidenceOf(project, task)`, the evidence of
 * the task's newest checked advance after its latest dispatch, which the
 * review-pass path writes on the task's completion (D2).
 */
export function installTrunkGate(ctx: TrunkGateHost, deps: TrunkGateDeps): {
  readonly dispose: () => void
  readonly trunkAdvanceFor: (callId: string) => TrunkAdvance | undefined
  readonly checkedAfter: (project: string, commit: string, sessionId?: string) => Promise<void>
  readonly trunkEvidenceOf: (project: string, task: string) => Promise<readonly Evidence[] | undefined>
} {
  const git = deps.git
  const warn = dialectWarner('execute')
  const stamp = (): string => (deps.now ?? ((): Date => new Date()))().toISOString()
  const baselines = new Map<string, Baseline>()
  const advancing = new Map<string, { readonly value: TrunkAdvance, readonly timer: ReturnType<typeof setTimeout> }>()
  const lastSeen = new Map<string, TrunkRefs>()
  /** Per project and reference (`<project>\n<local|remote>`): the value a compare last accounted for, and when. */
  const claims = new Map<string, { readonly value: string | undefined, readonly at: number }>()
  const setups = new Map<string, { readonly at: number, readonly setup: TrunkSetup | undefined }>()

  const loadGraph = async (project: string): Promise<LoadedGraph> => {
    try {
      return await deps.cache.load(deps.graphDirOfRoot(project))
    }
    catch {
      return EMPTY_GRAPH
    }
  }

  const isMainAgent = (agent: { readonly id: string, readonly session?: SessionLike }): boolean => {
    try {
      return deps.isMain(agent)
    }
    catch {
      return false
    }
  }

  /**
   * Whether a subagent's dispatch chain is rooted at the main agent: a plain
   * subagent the main agent started, or one such a subagent started in turn
   * (§2.3.1, §3.8.4 "主 Agent 与它派发链里所有 agent"). The walk goes up
   * `parentSession` through the live agents (M3's `dispatchRoot`); a chain
   * that cannot be followed is not judged, as M3's release judge does.
   */
  const rootedAtMain = (agent: AgentLike, session: SessionLike): boolean => {
    if (session.header.origin !== 'subagent') return false
    try {
      const value: unknown = typeof deps.lookup.get === 'function' ? deps.lookup.get('agents') : undefined
      if (typeof value !== 'object' || value === null || typeof (value as { get?: unknown }).get !== 'function') return false
      const root = dispatchRoot(value as Pick<AgentsService, 'get'>, { id: agent.id, session })
      return root.kind === 'root' && isMainAgent(root.root)
    }
    catch {
      return false
    }
  }

  /** The trunk of a project (D14) and its upstream, kept for SETUP_FRESH_MS; `undefined` when the trunk cannot be told. */
  async function setupOf(project: string): Promise<TrunkSetup | undefined> {
    const key = pathKey(project)
    const kept = setups.get(key)
    if (kept !== undefined && Date.now() - kept.at < SETUP_FRESH_MS) return kept.setup
    const trunk = await trunkBranchOf(git, project, await loadGraph(project))
    let setup: TrunkSetup | undefined
    if (trunk !== undefined) {
      const upstream = await git.trunkUpstream(project, trunk)
      const remote = upstream.ok ? upstream.value : undefined
      const url = remote === undefined ? undefined : await git.remoteUrl(project, remote.remote)
      setup = { trunk, remote: remote?.remote, tracking: remote?.tracking, remoteUrl: url?.ok === true ? url.value : undefined }
    }
    setups.set(key, { at: Date.now(), setup })
    return setup
  }

  const remember = (callId: string, value: TrunkAdvance): void => {
    forget(callId)
    const timer = setTimeout(() => { advancing.delete(callId) }, ADVANCE_KEEP_MS)
    timer.unref()
    advancing.set(callId, { value, timer })
  }
  function forget(callId: string): void {
    const kept = advancing.get(callId)
    if (kept === undefined) return
    clearTimeout(kept.timer)
    advancing.delete(callId)
  }

  /** Deliver a notice to the project's main agent; a notice that does not arrive is said in the row health. */
  const tell = (project: string, sessionId: string | undefined, summary: string, text: string, facts: Readonly<Record<string, unknown>>): void => {
    const why = toHolder(deps.lookup, deps.graphDirOfRoot(project), createUserNotice('glm-hourness-execute', summary, text, { hournessExecute: facts }))
    if (why !== undefined) deps.report(sessionId, 'degraded', `主干前进的通知送不到当前主 Agent：${why}`)
  }

  const append = async (project: string, line: AdvanceRecord): Promise<void> => {
    await appendAdvance(deps.execDir(project), line)
  }

  /** The files a change touches, for an event; none when git cannot read the change. */
  const filesOf = async (project: string, from: string, to: string): Promise<readonly string[]> => {
    const changed = await git.changedFiles(project, from, to)
    return changed.ok ? changed.value.map(file => file.path) : []
  }

  // ---- the facts of one advance ----

  /** The review facts of the floor clause, read from git for the paths the change asks about. */
  async function reviewFacts(project: string, graph: LoadedGraph, facts: Pick<AdvanceFacts, 'floor' | 'floorExempt' | 'graphDir' | 'gate'>, from: string, to: string, change: AdvanceChange): Promise<AdvanceReviews> {
    const floor = floorReading(facts)
    const asked = change.paths.filter(path => floor.binds(path) && !floor.exempt(path))
    const askedDeleted = floor.deletes ? change.deleted.filter(path => !floor.exempt(path)) : []
    const same = new Set<string>()
    const deleted = new Set<string>()
    if (asked.length > 0 || askedDeleted.length > 0) {
      const reviewed: string[] = []
      for (const node of graph.nodes.values()) {
        if (node.type !== 'task' || node.kind !== 'review' || node.status !== 'done' || isDesignReview(graph, node)) continue
        const commit = fullReviewCommit(node)
        const resolved = commit === undefined ? undefined : await git.resolveCommit(project, commit)
        if (resolved !== undefined) reviewed.push(resolved)
      }
      for (const path of asked) {
        for (const commit of reviewed) {
          const result = await git.sameContent(project, commit, to, path)
          if (result.ok && result.value) {
            same.add(path)
            break
          }
        }
      }
      for (const path of askedDeleted) {
        for (const commit of reviewed) {
          const there = await git.entryAt(project, commit, path)
          if (!there.ok || there.value !== undefined) continue
          const base = await git.mergeBase(project, commit, from)
          const before = base.ok && base.value !== undefined ? await git.entryAt(project, base.value, path) : undefined
          if (before?.ok === true && before.value !== undefined) {
            deleted.add(path)
            break
          }
        }
      }
    }
    return {
      same: path => same.has(path),
      deleted: path => deleted.has(path),
      taskFull: (task) => {
        const node = graph.nodes.get(task)
        const handback = node === undefined ? undefined : currentHandback(node)
        return node !== undefined && handback !== undefined && currentReviewDepth(graph, node, handback) === '全审'
      },
    }
  }

  /** The files that came in by a real fetch under no unchecked push (§3.8.4's fetched clause). */
  async function fetchedFiles(project: string, records: readonly AdvanceRecord[], from: string, to: string): Promise<ReadonlySet<string>> {
    const fetches = records.filter(line => line.ref === 'remote' && line.by === 'fetch').slice(-FETCH_LINES)
    if (fetches.length === 0) return new Set()
    const between = await git.commitsBetween(project, from, to)
    if (!between.ok || between.value.length === 0) return new Set()
    const wanted = new Set(between.value)
    const fetched = new Set<string>()
    for (const line of fetches) {
      const range = await git.commitsBetween(project, from, line.to)
      if (range.ok) for (const commit of range.value) if (wanted.has(commit)) fetched.add(commit)
    }
    if (fetched.size === 0) return new Set()
    const unchecked = records.filter((line, index) => line.ref === 'remote' && line.ok === false
      && !records.slice(index + 1).some(later => later.ref === 'remote' && later.checkedAfter === true && later.to === line.to))
    for (const line of unchecked) {
      const range = await git.commitsBetween(project, line.from === '' ? from : line.from, line.to)
      if (!range.ok) return new Set()
      for (const commit of range.value) fetched.delete(commit)
    }
    const exempt = new Set<string>()
    for (const commit of fetched) {
      const changed = await git.changedFiles(project, `${commit}^`, commit)
      if (changed.ok) for (const file of changed.value) exempt.add(file.path)
    }
    return exempt
  }

  /** The facts `advanceOk` judges O..N by (§3.8.4); a reason when git cannot read the change. */
  async function readAdvanceFacts(project: string, graph: LoadedGraph, records: readonly AdvanceRecord[], from: string, to: string): Promise<{ readonly ok: true, readonly read: AdvanceRead } | { readonly ok: false, readonly reason: string }> {
    const changed = await git.changedFiles(project, from, to)
    if (!changed.ok) return { ok: false, reason: changed.reason }
    const change: AdvanceChange = { paths: changed.value.map(file => file.path), deleted: changed.value.filter(file => file.status === 'D').map(file => file.path) }
    const trailers = await git.taskTrailers(project, from, to)
    if (!trailers.ok) return { ok: false, reason: trailers.reason }
    const gate = parseGateNorm(graph.nodes.get('norm-merge-gate'))
    const digest = normDigest(gate, sha256Hex)
    const passed = (await readChecks(deps.execDir(project))).filter((record): record is PassedRecord => record.passed && record.normDigest === digest)
    const tree = await git.treeOf(project, to)
    const toTree = tree.ok ? tree.value : undefined
    const compared = new Map<string, readonly string[]>()
    for (const record of passed.slice(-COMPARED_RECORDS)) {
      if (compared.has(record.commit)) continue
      if (toTree !== undefined && record.tree === toTree) {
        compared.set(record.commit, [])
        continue
      }
      const diff = await git.changedFiles(project, record.commit, to)
      if (diff.ok) compared.set(record.commit, diff.value.map(file => file.path))
    }
    const named = new Map<string, string>()
    for (const entry of trailers.value) for (const task of entry.tasks) if (!named.has(task)) named.set(task, entry.commit)
    const tasks: { readonly task: string, readonly hit: boolean }[] = []
    for (const task of named.keys()) tasks.push({ task, hit: await deps.taskHit(project, graph, task) })
    const relativeGraph = relative(project, deps.graphDirOfRoot(project)).replaceAll('\\', '/')
    const graphDir = relativeGraph === '' || relativeGraph.startsWith('..') ? undefined : `${relativeGraph}/`
    const floor = parseFloor(graph.nodes.get('norm-review-floor'))
    const floorExempt = await fetchedFiles(project, records, from, to)
    const reviews = await reviewFacts(project, graph, { floor, floorExempt, graphDir, gate }, from, to, change)
    const facts: AdvanceFacts = { gate, normDigest: digest, checks: passed, pathsToN: commit => compared.get(commit) ?? NOT_COMPARED, floor, reviews, tasks, graphDir, floorExempt }
    return { ok: true, read: { facts, change, passed, trailers: named } }
  }

  // ---- the evidence (§3.8.4) ----

  /** Write the trunk evidence of one trailer task: the comment always, the completion only once the review is settled (D2), then the clean worktree goes (D3). */
  async function recordTrunkEvidence(project: string, task: string, info: {
    readonly trailerCommit: string
    readonly record: VerifiedCheck | undefined
    readonly only: readonly string[]
    readonly from: string
    readonly to: string
    readonly checkedAfter: boolean
    readonly sessionId: string | undefined
  }): Promise<'done' | 'pending' | 'noted' | 'missing'> {
    const engine = openEngine(deps.graphDirOfRoot(project), { now: deps.now ?? ((): Date => new Date()) })
    let graph: LoadedGraph
    try {
      graph = await engine.load()
    }
    catch (error) {
      deps.report(info.sessionId, 'degraded', `进主干的证据写不进图（${task}）：${errorText(error)}；事实在 advances.jsonl 里`)
      return 'missing'
    }
    const node = graph.nodes.get(task)
    if (node === undefined) return 'missing'
    const check = info.record !== undefined ? short(info.record.commit) : `only ${info.only.join(', ')}`
    const head = `进主干 ${short(info.to)}（从 ${short(info.from)}）· 检查 ${check}${info.checkedAfter ? ' · 检查在前进之后' : ''}`
    const say = async (text: string): Promise<void> => {
      const written = await writeWithRetry(() => engine.apply('harness', { op: 'comment', id: task, text })).catch(() => undefined)
      if (written === undefined || !written.ok) deps.report(info.sessionId, 'degraded', `进主干的批注写不进图（${task}）；事实在 advances.jsonl 里`)
    }
    const removeWorktree = async (): Promise<void> => {
      const path = join(project, '.worktrees', `hz-${task}`)
      if (await stat(path).then(() => true, () => false)) await git.removeWorktree(project, path)
    }
    if (node.status === 'done') {
      await say(head)
      await removeWorktree()
      return 'noted'
    }
    if (latestDispatch(node) === undefined) {
      await say(`${head} · 没有派发记录：主 Agent 确认之后可以 graph_status 它`)
      return 'noted'
    }
    if (!reviewSettled(graph, node)) {
      await say(`${head} · 审查还没过，过了再记完成`)
      return 'pending'
    }
    await say(head)
    if (node.status !== 'approved' && node.status !== 'doing') return 'noted'
    const evidence = evidenceOf(info.trailerCommit, info.record, info.only)
    const written = await writeWithRetry(async () => {
      const current = await engine.load()
      return engine.apply('harness', { op: 'status', id: task, rev: current.revisions.get(task)!, to: 'done', evidence, reason: `the trunk reached ${short(info.to)} with a passed merge check` })
    }).catch((error: unknown) => ({ ok: false as const, error: { message: errorText(error) } }))
    if (!written.ok) {
      deps.report(info.sessionId, 'degraded', `任务的完成写不进图（${task}）：${written.error.message}；事实在 advances.jsonl 里`)
      return 'noted'
    }
    await removeWorktree()
    return 'done'
  }

  // ---- after a call, and at a step ----

  /** The local trunk moved from O to N' during a call (§3.8.4's post-execute, the local half); `by` is the call the move is booked to (`bookedTo`). */
  async function localMoved(base: Baseline, by: Baseline, from: string, to: string): Promise<void> {
    const { project, setup } = base
    const at = stamp()
    const who = { agent: by.agentId, callId: by.callId }
    const back = await git.isAncestor(project, to, from)
    if (back.ok && back.value) {
      await append(project, { ref: 'local', from, to, ...who, check: null, tasks: [], at, ok: true })
      emitMetric({ event: 'execute.advance', ref: 'local', way: 'advance', from, to, tasks: [] })
      return
    }
    const graph = await loadGraph(project)
    const records = await readAdvances(deps.execDir(project))
    const read = await readAdvanceFacts(project, graph, records, from, to)
    const verdict: AdvanceVerdict = read.ok ? advanceOk(read.read.facts, read.read.change) : { ok: false, missing: `the change cannot be read: ${read.reason}` }
    if (!read.ok || !verdict.ok) {
      const tasks = read.ok ? [...read.read.trailers.keys()] : []
      const missing = verdict.ok ? '' : verdict.missing
      await append(project, { ref: 'local', from, to, ...who, tasks, at, ok: false, missing })
      const text = `${setup.trunk} moved from ${short(from)} to ${short(to)} without a passed merge check (${missing}). No evidence was recorded. Run check_commit ${short(to)}; if it fails, fix or revert on the main branch.`
      deps.journal({ at, rule: RULE, tool: by.tool, agentId: by.agentId, sessionId: by.sessionId, correction: text, effect: 'detected-after' })
      emitMetric({ event: 'execute.unchecked-advance', ref: 'local', from, to, missing })
      tell(project, by.sessionId, `${setup.trunk} moved without a passed merge check`, text, { event: 'advance', ref: 'local', from, to, ok: false })
      return
    }
    const { facts, change, passed, trailers } = read.read
    const record = evidenceRecord(passed.filter(candidate => coveredBy(facts, change, candidate)))
    const tasks = [...trailers.keys()]
    const incomingFloor = incomingFloorOf(facts, change)
    const line: AdvanceRecord = {
      ref: 'local', from, to, ...who,
      check: record?.commit ?? null,
      ...(record === undefined ? { only: true } : {}),
      tasks,
      ...(incomingFloor.length > 0 ? { incomingFloor } : {}),
      at,
      ok: true,
    }
    await append(project, line)
    const reviewPending: string[] = []
    for (const [task, trailerCommit] of trailers) {
      const outcome = await recordTrunkEvidence(project, task, { trailerCommit, record, only: facts.gate.only, from, to, checkedAfter: false, sessionId: by.sessionId })
      if (outcome === 'pending') reviewPending.push(task)
    }
    emitMetric({ event: 'execute.advance', ref: 'local', way: 'advance', from, to, tasks, byCheck: record !== undefined, byPaths: record === undefined, reviewPending, incomingFloor: incomingFloor.length })
    deps.onTrunkEvent(project, setup.trunk, trunkEventOf('trunk-advanced', line, change.paths), by.sessionId)
  }

  /**
   * The remote-tracking reference moved from T0 to T' (§3.8.4's post-execute,
   * the remote half). `movers` are the calls that may have moved it, the
   * comparing call first (`moversOf`): the first compare after a move records
   * it, which need not be the compare of the call that fetched.
   */
  async function remoteMoved(base: Baseline, movers: Movers, from: string | undefined, to: string): Promise<void> {
    const { project, setup } = base
    const at = stamp()
    const subject = setup.tracking === undefined ? undefined : await git.reflogSubject(project, setup.tracking)
    const kind = subject?.ok === true && subject.value !== undefined ? reflogKind(subject.value) : 'unknown'
    // A real pull names the upstream, by name or by the same URL, or no remote at all (git takes the configured one).
    const upstreamState: TrunkState = { trunk: setup.trunk, current: undefined, onTrunk: false, remote: setup.remote, remoteUrl: setup.remoteUrl, selfPath: undefined }
    const fetches = (call: Baseline): boolean => call.invocations.some((invocation) => {
      if (invocation.sub !== 'fetch' && invocation.sub !== 'pull') return false
      const named = positionals(invocation.args, new Set())[0]
      return named === undefined || isUpstream(named, upstreamState)
    })
    // A fetch when one of the calls fetched the upstream and none of them pushed.
    const fetcher = kind === 'fetch' && !movers.some(call => call.invocations.some(invocation => invocation.sub === 'push')) ? movers.find(fetches) : undefined
    if (fetcher !== undefined) {
      await append(project, { ref: 'remote', by: 'fetch', from: from ?? '', to, agent: fetcher.agentId, callId: fetcher.callId, at })
      emitMetric({ event: 'execute.advance', ref: 'remote', way: 'fetch', from: from ?? '', to, tasks: [] })
      return
    }
    const by = bookedTo(movers)
    const who = { agent: by.agentId, callId: by.callId }
    // Everything else is judged as a push.
    let verdict: AdvanceVerdict = { ok: true }
    const back = from === undefined ? undefined : await git.isAncestor(project, to, from)
    if (back?.ok !== true || !back.value) {
      const records = await readAdvances(deps.execDir(project))
      verdict = pushOk(records, from ?? '', to)
      if (!verdict.ok && from !== undefined) {
        const read = await readAdvanceFacts(project, await loadGraph(project), records, from, to)
        if (read.ok) verdict = pushOk(records, from, to, () => advanceOk(read.read.facts, read.read.change))
      }
    }
    if (verdict.ok) {
      await append(project, { ref: 'remote', by: 'push', from: from ?? '', to, ...who, at, ok: true })
      emitMetric({ event: 'execute.advance', ref: 'remote', way: 'push', from: from ?? '', to, tasks: [] })
      return
    }
    const line: AdvanceRecord = { ref: 'remote', by: 'push', from: from ?? '', to, ...who, at, ok: false, missing: verdict.missing }
    await append(project, line)
    const remote = setup.remote ?? 'the upstream'
    const text = `${remote}/${setup.trunk} was pushed from ${from === undefined ? '(none)' : short(from)} to ${short(to)} without a passed merge check (${verdict.missing}). The published main branch now carries unchecked commits. Run check_commit ${short(to)}; if it fails, fix forward on the main branch, or tell the person before any force-push.`
    deps.journal({ at, rule: RULE, tool: by.tool, agentId: by.agentId, sessionId: by.sessionId, correction: text, effect: 'detected-after' })
    emitMetric({ event: 'execute.unchecked-advance', ref: 'remote', from: from ?? '', to, missing: verdict.missing })
    tell(project, by.sessionId, `${remote}/${setup.trunk} was pushed without a passed merge check`, text, { event: 'advance', ref: 'remote', from: from ?? '', to, ok: false })
    deps.onTrunkEvent(project, setup.trunk, trunkEventOf('outside-advance', line, from === undefined ? [] : await filesOf(project, from, to)), by.sessionId)
  }

  /**
   * The calls that may have moved one reference to `to`: the comparing call,
   * then the older calls whose post-execute never came (`lost`, from the
   * step compare), then the project's calls still running; a call that
   * already saw `to` before it ran began after the move.
   */
  const moversOf = (base: Baseline, lost: readonly Baseline[], ref: 'local' | 'remote', to: string): Movers => [
    base,
    ...[...lost, ...baselines.values()].filter(call => call !== base && samePath(call.project, base.project) && call[ref] !== to),
  ]

  /** Who a move is booked to: the comparing call when it ran git in the project, else the first of the other movers that did, else the comparing call. */
  const bookedTo = (movers: Movers): Baseline => {
    const [base] = movers
    return base.invocations.length > 0 ? base : movers.find(call => call.invocations.length > 0) ?? base
  }

  /** Where a call's compare starts for one reference: the value another compare accounted for after this call began, else the call's own baseline. */
  const startOf = (base: Baseline, ref: 'local' | 'remote'): string | undefined => {
    const claim = claims.get(`${pathKey(base.project)}\n${ref}`)
    return claim !== undefined && claim.at >= base.startedAt ? claim.value : base[ref]
  }

  /**
   * Re-read L and T after a call and handle what moved; the last-seen value
   * is updated first. A move is recorded once: the compare starts from the
   * value an earlier compare already accounted for when that happened after
   * this call began (a call that spans another call's fast-forward does not
   * record it again), and claims the current values before anything is
   * awaited, so of two compares that run side by side only the first
   * records the move. Because that first compare need not be the moving
   * call's, the move is booked to a call that ran git in the project, and a
   * remote move is a fetch when any call that may have made it fetched
   * (`moversOf`, read at the claim). `lost` are the older calls whose
   * post-execute never came, which the step compare hands on.
   */
  async function compare(base: Baseline, lost: readonly Baseline[] = []): Promise<void> {
    const refs = await git.trunkRefs(base.project, base.setup.trunk, base.setup.remote)
    if (!refs.ok) {
      deps.report(base.sessionId, 'degraded', `主干前进的比对读不出主干：${refs.reason}`)
      return
    }
    lastSeen.set(pathKey(base.project), refs.value)
    const { local, remote } = refs.value
    const fromLocal = startOf(base, 'local')
    const fromRemote = startOf(base, 'remote')
    const now = Date.now()
    claims.set(`${pathKey(base.project)}\nlocal`, { value: local, at: now })
    claims.set(`${pathKey(base.project)}\nremote`, { value: remote, at: now })
    const localMovers = local === undefined ? undefined : moversOf(base, lost, 'local', local)
    const remoteMovers = remote === undefined ? undefined : moversOf(base, lost, 'remote', remote)
    if (local !== undefined && localMovers !== undefined && fromLocal !== undefined && local !== fromLocal) await localMoved(base, bookedTo(localMovers), fromLocal, local)
    if (remote !== undefined && remoteMovers !== undefined && remote !== fromRemote) await remoteMoved(base, remoteMovers, fromRemote, remote)
  }

  /** A move no call claimed (§3.8.4's step compare): the person's terminal, another tool. Recorded, no violation, no evidence. */
  async function outside(project: string, setup: TrunkSetup, seen: TrunkRefs, now: TrunkRefs, sessionId: string): Promise<void> {
    const at = stamp()
    if (seen.local !== undefined && now.local !== undefined && seen.local !== now.local) {
      const line: AdvanceRecord = { ref: 'local', by: 'outside', from: seen.local, to: now.local, at }
      await append(project, line)
      emitMetric({ event: 'execute.advance', ref: 'local', way: 'outside', from: seen.local, to: now.local, tasks: [], external: true })
      deps.onTrunkEvent(project, setup.trunk, trunkEventOf('outside-advance', line, await filesOf(project, seen.local, now.local)), sessionId)
    }
    if (now.remote !== undefined && seen.remote !== now.remote) {
      await append(project, { ref: 'remote', by: 'outside', from: seen.remote ?? '', to: now.remote, at })
      emitMetric({ event: 'execute.advance', ref: 'remote', way: 'outside', from: seen.remote ?? '', to: now.remote, tasks: [], external: true })
    }
  }

  // ---- before a call ----

  /** The shell call of the main agent or its dispatch chain this gate judges; `undefined` for every other call. */
  function callerOf(payload: Parameters<PreExecuteListener>[0]): { readonly agent: AgentLike, readonly session: SessionLike, readonly project: string, readonly invocations: readonly GitInvocation[] } | undefined {
    if (payload.parent !== undefined) return undefined
    const agent = payload.agent
    const session = agent?.session
    if (agent === undefined || session === undefined) return undefined
    const call: ToolCall = { name: toNativeTool(dialectService(deps.lookup, warn), payload.name, warn), arguments: (payload.arguments ?? {}) as JsonValue }
    const shell = shellCommandOf(call)
    if (shell === undefined) return undefined
    const inChain = deps.register(agent.id) !== undefined
      || (session.header.origin === 'subagent' && deps.owning({ id: agent.id, session }) !== undefined)
      || isMainAgent(agent)
      || rootedAtMain(agent, session)
    if (!inChain) return undefined
    const cwd = deps.effectiveDir(session) ?? session.header.cwd
    const project = cwd === undefined ? undefined : projectOf(cwd)?.root
    if (cwd === undefined || project === undefined) return undefined
    let invocations: GitInvocation[]
    try {
      invocations = shell.dialects.flatMap(dialect => gitInvocations(shell.command, dialect, cwd))
    }
    catch {
      invocations = []
    }
    const inProject = invocations.filter((invocation) => {
      const root = invocation.dir === undefined ? undefined : projectOf(invocation.dir)?.root
      return root !== undefined && samePath(root, project)
    })
    return { agent, session, project, invocations: inProject }
  }

  /** The paths a `git commit` on the trunk would record, repository-relative; `undefined` when the text does not say (a pathspec file). */
  async function stagedFor(dir: string, args: readonly string[]): Promise<readonly string[] | undefined> {
    const parsed = commitArgs(args)
    if (parsed.fromFile) return undefined
    if (parsed.paths.length > 0) {
      const top = await git.toplevel(dir)
      if (top === undefined) return undefined
      return parsed.paths.map(path => relative(top, resolve(dir, path)).replaceAll('\\', '/'))
    }
    const staged = await git.stagedPaths(dir, parsed.all)
    return staged.ok ? staged.value : undefined
  }

  type Judgement =
    | { readonly kind: 'allow' }
    | { readonly kind: 'advance', readonly from: string, readonly to: string }
    | { readonly kind: 'deny', readonly parts: readonly string[], readonly missing: string }

  /** One git call against §3.8.4's table, the target resolved and judged by `advanceOk` or `pushOk`. */
  async function judge(base: Baseline, invocation: GitInvocation, graph: () => Promise<LoadedGraph>): Promise<Judgement> {
    const allow: Judgement = { kind: 'allow' }
    // A global option the reader does not know hides the subcommand: the post-execute compare judges what happened.
    if (invocation.unknownGlobal || invocation.dir === undefined) return allow
    const { setup, project } = base
    const dir = invocation.dir
    const current = await git.currentBranch(dir)
    const state: TrunkState = { trunk: setup.trunk, current, onTrunk: current === setup.trunk, remote: setup.remote, remoteUrl: setup.remoteUrl, selfPath: project.replaceAll('\\', '/') }
    const staged = invocation.sub === 'commit' && state.onTrunk ? await stagedFor(dir, invocation.args) : undefined
    const gate = parseGateNorm((await graph()).nodes.get('norm-merge-gate'))
    const verdict = classifyTrunkCall({ sub: invocation.sub, args: invocation.args }, state, { ...(staged === undefined ? {} : { staged }), only: gate.only })
    const names = { trunk: setup.trunk, ...(setup.remote === undefined ? {} : { remote: setup.remote }) }
    const from = base.local
    switch (verdict.verdict) {
      case 'allow':
        return allow
      case 'refuse':
        return { kind: 'deny', parts: advanceCorrection(verdict.why, { ...names, from: from === undefined ? '(none)' : short(from), to: unknownTarget(invocation.sub) }), missing: `git ${invocation.sub} (${verdict.why})` }
      case 'advance': {
        if (from === undefined) return allow
        const to = await git.resolveCommit(dir, verdict.target)
        // A target that names no commit fails in git itself; whatever moves anyway, the compare sees.
        if (to === undefined) return allow
        const back = await git.isAncestor(project, to, from)
        if (back.ok && back.value) return { kind: 'advance', from, to }
        const records = await readAdvances(deps.execDir(project))
        const read = await readAdvanceFacts(project, await graph(), records, from, to)
        const ok: AdvanceVerdict = read.ok ? advanceOk(read.read.facts, read.read.change) : { ok: false, missing: `the change cannot be read: ${read.reason}` }
        if (ok.ok) return { kind: 'advance', from, to }
        return { kind: 'deny', parts: advanceCorrection('unpredictable', { ...names, from: short(from), to: short(to), missing: ok.missing, ...floorLineOf(ok) }), missing: ok.missing }
      }
      case 'push': {
        const target = verdict.target === undefined || verdict.target === setup.trunk ? `refs/heads/${setup.trunk}` : verdict.target
        const to = await git.resolveCommit(dir, target)
        if (to === undefined) return allow
        const tracked = base.remote
        if (tracked !== undefined) {
          const back = await git.isAncestor(project, to, tracked)
          if (back.ok && back.value) return allow
        }
        const records = await readAdvances(deps.execDir(project))
        let ok = pushOk(records, tracked ?? '', to)
        if (!ok.ok && tracked !== undefined) {
          const read = await readAdvanceFacts(project, await graph(), records, tracked, to)
          if (read.ok) ok = pushOk(records, tracked, to, () => advanceOk(read.read.facts, read.read.change))
        }
        if (ok.ok) return allow
        return { kind: 'deny', parts: advanceCorrection('push', { ...names, from: tracked === undefined ? '(none)' : short(tracked), to: short(to), missing: ok.missing, ...floorLineOf(ok) }), missing: ok.missing }
      }
    }
  }

  type Before =
    | { readonly kind: 'pass' }
    | { readonly kind: 'deny', readonly reason: string, readonly missing: string }
    | { readonly kind: 'watch', readonly base: Baseline, readonly advance: TrunkAdvance | undefined }

  /** The pre-execute verdict of one call: the baseline to compare after it, the local advance it may make, or the refusal. */
  async function before(payload: Parameters<PreExecuteListener>[0], caller: NonNullable<ReturnType<typeof callerOf>>): Promise<Before> {
    const { agent, session, project } = caller
    const setup = await setupOf(project)
    if (setup === undefined) return { kind: 'pass' }
    // Taken before the read: a compare that claims a value while the read runs counts as after this call began.
    const startedAt = Date.now()
    const refs = await git.trunkRefs(project, setup.trunk, setup.remote)
    if (!refs.ok) {
      deps.report(session.id, 'degraded', `主干前进的核对读不出主干，这次调用放行了：${refs.reason}`)
      return { kind: 'pass' }
    }
    const base: Baseline = {
      project, setup, local: refs.value.local, remote: refs.value.remote,
      agentId: agent.id, sessionId: session.id, tool: payload.name, callId: payload.callId ?? '',
      invocations: caller.invocations, startedAt,
    }
    let graph: LoadedGraph | undefined
    const graphOnce = async (): Promise<LoadedGraph> => graph ??= await loadGraph(project)
    let advance: TrunkAdvance | undefined
    for (const invocation of caller.invocations) {
      const judged = await judge(base, invocation, graphOnce)
      if (judged.kind === 'deny') {
        const [fact = '', violation = '', rightPath = '', exception = 'none'] = judged.parts
        return { kind: 'deny', reason: renderCorrection({ fact, violation, rightPath, exception }), missing: judged.missing }
      }
      if (judged.kind === 'advance') advance = { branch: setup.trunk, from: judged.from, to: judged.to }
    }
    return { kind: 'watch', base, advance }
  }

  const preExecute: PreExecuteListener = async (payload, next) => {
    const caller = callerOf(payload)
    if (caller === undefined) return next()
    const verdict = await before(payload, caller).catch((error: unknown): Before => {
      deps.report(caller.session.id, 'degraded', `主干前进的核对没跑完，这次调用放行了：${errorText(error)}`)
      return { kind: 'pass' }
    })
    if (verdict.kind === 'deny') {
      deps.journal({ at: stamp(), rule: RULE, tool: payload.name, agentId: caller.agent.id, sessionId: caller.session.id, correction: verdict.reason })
      emitMetric({ event: 'execute.advance-refused', missing: verdict.missing })
      return { kind: 'deny', reason: verdict.reason }
    }
    const callId = payload.callId
    if (verdict.kind === 'watch' && callId !== undefined) {
      baselines.set(callId, verdict.base)
      if (verdict.advance !== undefined) remember(callId, verdict.advance)
    }
    return next()
  }

  const postExecute: PostExecuteListener = async (exec, _result, next) => {
    const decision = await next()
    const base = baselines.get(exec.callId)
    forget(exec.callId)
    if (base === undefined) return decision
    baselines.delete(exec.callId)
    try {
      await compare(base)
    }
    catch (error) {
      deps.report(base.sessionId, 'degraded', `主干前进的比对没跑完：${errorText(error)}`)
    }
    return decision
  }

  /** The main agent's step: a move since the last look that no post-execute claimed (§3.8.4, the last paragraph before the cost). */
  async function stepCompare(agent: AgentLike): Promise<void> {
    const session = agent.session
    if (session === undefined || !isMainAgent(agent)) return
    const cwd = deps.effectiveDir(session) ?? session.header.cwd
    const project = cwd === undefined ? undefined : projectOf(cwd)?.root
    if (project === undefined) return
    const setup = await setupOf(project)
    if (setup === undefined) return
    const refs = await git.trunkRefs(project, setup.trunk, setup.remote)
    if (!refs.ok) return
    const key = pathKey(project)
    const seen = lastSeen.get(key)
    if (seen === undefined) {
      lastSeen.set(key, refs.value)
      return
    }
    if (seen.local === refs.value.local && seen.remote === refs.value.remote) return
    const open = [...baselines.entries()].filter(([, base]) => samePath(base.project, project))
    // The main agent's own calls of the step before have all ended; a call older than ORPHAN_MS lost its post-execute (U20).
    // The compare starts from the oldest of them: a move inside an older lost call lies before the newer baselines.
    const ended = open.filter(([, base]) => base.agentId === agent.id || Date.now() - base.startedAt > ORPHAN_MS)
    const oldest = ended[0]
    if (oldest !== undefined) {
      for (const [callId] of ended) {
        baselines.delete(callId)
        forget(callId)
      }
      await compare(oldest[1], ended.slice(1).map(([, base]) => base))
      return
    }
    // A call of the dispatch chain is still running: its post-execute claims the move.
    if (open.length > 0) return
    lastSeen.set(key, refs.value)
    await outside(project, setup, seen, refs.value, session.id)
  }

  const preStep = async (payload: { readonly agent: AgentLike }, next: () => Promise<unknown>): Promise<unknown> => {
    try {
      await stepCompare(payload.agent)
    }
    catch (error) {
      deps.report(payload.agent.session?.id, 'degraded', `主干的每步比对没跑完：${errorText(error)}`)
    }
    return next()
  }

  // ---- the two seams ----

  /** The evidence of the task's newest checked advance written after its latest dispatch: an advance of an attempt before a reopen is no evidence for the rework (ORCHESTRATION §2). */
  async function trunkEvidenceOf(project: string, task: string): Promise<readonly Evidence[] | undefined> {
    const graph = await loadGraph(project)
    const node = graph.nodes.get(task)
    const since = node === undefined ? undefined : dispatchedAt(node)
    if (since === undefined) return undefined
    const lines = await readAdvances(deps.execDir(project))
    const line = lines.filter(entry => entry.ref === 'local' && entry.ok === true && (entry.tasks ?? []).includes(task)
      && entry.at !== undefined && Date.parse(entry.at) > Date.parse(since)).at(-1)
    if (line === undefined || (typeof line.check !== 'string' && line.only !== true)) return undefined
    const trailers = await git.taskTrailers(project, line.from, line.to)
    const trailerCommit = trailers.ok ? trailers.value.find(entry => entry.tasks.includes(task))?.commit : undefined
    if (trailerCommit === undefined) return undefined
    const gate = parseGateNorm(graph.nodes.get('norm-merge-gate'))
    if (typeof line.check !== 'string') return evidenceOf(trailerCommit, undefined, gate.only)
    const checked = line.check
    const record = evidenceRecord((await readChecks(deps.execDir(project))).filter(entry => entry.commit === checked && entry.passed))
    return record === undefined ? undefined : evidenceOf(trailerCommit, record, gate.only)
  }

  async function checkedAfter(project: string, commit: string, sessionId?: string): Promise<void> {
    const execDir = deps.execDir(project)
    const lines = await readAdvances(execDir)
    const waiting = lines.filter((line, index) => line.ok === false && line.to === commit
      && !lines.slice(index + 1).some(later => later.ref === line.ref && later.checkedAfter === true && later.to === commit))
    const byRef = [...new Map(waiting.map(line => [line.ref, line])).values()]
    if (byRef.length === 0) return
    const record = evidenceRecord((await readChecks(execDir)).filter(entry => entry.commit === commit && entry.passed))
    if (record === undefined) return
    const gate = parseGateNorm((await loadGraph(project)).nodes.get('norm-merge-gate'))
    for (const line of byRef) {
      const at = stamp()
      if (line.ref === 'remote') {
        await append(project, { ref: 'remote', by: 'push', from: line.from, to: line.to, check: commit, at, ok: true, checkedAfter: true })
        emitMetric({ event: 'execute.advance', ref: 'remote', way: 'push', from: line.from, to: line.to, tasks: [], checkedAfter: true })
        continue
      }
      const trailers = await git.taskTrailers(project, line.from, line.to)
      const named = new Map<string, string>()
      if (trailers.ok) for (const entry of trailers.value) for (const task of entry.tasks) if (!named.has(task)) named.set(task, entry.commit)
      const tasks = [...named.keys()]
      await append(project, { ref: 'local', from: line.from, to: line.to, check: commit, tasks, at, ok: true, checkedAfter: true })
      const reviewPending: string[] = []
      for (const [task, trailerCommit] of named) {
        const outcome = await recordTrunkEvidence(project, task, { trailerCommit, record, only: gate.only, from: line.from, to: line.to, checkedAfter: true, sessionId })
        if (outcome === 'pending') reviewPending.push(task)
      }
      emitMetric({ event: 'execute.advance', ref: 'local', way: 'advance', from: line.from, to: line.to, tasks, byCheck: true, checkedAfter: true, reviewPending })
    }
  }

  const undos = [
    ctx.on('tools/pre-execute', preExecute, { prepend: true }),
    ctx.on('tools/post-execute', postExecute, { prepend: true }),
    ctx.on('agent/pre-step', preStep),
  ]
  return {
    dispose: () => {
      for (const undo of undos.splice(0)) undo()
      for (const callId of [...advancing.keys()]) forget(callId)
      baselines.clear()
    },
    trunkAdvanceFor: callId => advancing.get(callId)?.value,
    checkedAfter,
    trunkEvidenceOf,
  }
}
