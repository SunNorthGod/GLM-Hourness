/**
 * The trunk advance gate (M7 design 0.6 §3.8.4): the local trunk moves only
 * to a commit the harness checked, the published trunk only moves to a state
 * the local trunk reached through that gate, and the shell lines that could
 * move either one are recognised before they run. Pure functions; every git
 * fact arrives as a parameter, so the same rules run in the pre-execute
 * listener (E7) and in the tests.
 *
 * Three pieces:
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
 *
 * The call shapes follow M3's `gitInvocations` (src/guard/git-snapshot.ts):
 * one parsed `git <sub> <args…>` with global options already removed.
 */
import { floorPathIn } from './floor.ts'
import type { ParsedGate } from './gate-norm.ts'
import type { ParsedFloor } from './floor.ts'

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
  /** Whether the task's latest review passed as a full one. */
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
  | { readonly ok: false, readonly missing: string }

/** What the check clause answers when it fails (§3.8.4's refusal names what is missing). */
const MISSING = { check: 'no passed merge check covers the change under the current checklist' } as const

/** Whether every path sits inside one of the prefixes; nothing to place is inside anything. */
const withinPaths = (paths: readonly string[], prefixes: readonly string[]): boolean =>
  prefixes.length > 0 && paths.every(path => floorPathIn(prefixes, path))

/** Whether the paths differ from a commit by `only` paths: no difference, or every difference inside. */
const differsByOnly = (paths: readonly string[], only: readonly string[]): boolean =>
  paths.length === 0 || withinPaths(paths, only)

/** Whether the record ran every `when` command the change asks for. */
function coversWhen(record: PassedCheck, gate: ParsedGate, change: AdvanceChange): boolean {
  return gate.commands.every((command, index) => {
    if (command.kind !== 'check') return true
    const touches = (command.when ?? []).some(prefix => change.paths.some(path => floorPathIn([prefix], path)))
    return !touches || record.ran.includes(index)
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
  const only = facts.gate.only
  // The check clause: one passed record under the current digest that differs
  // from N by only paths and ran every when command the change asks for — or
  // the change touches only paths. The floor clause binds on top of it.
  const record = facts.checks.find(candidate => candidate.passed
    && candidate.normDigest === facts.normDigest
    && differsByOnly(facts.pathsToN(candidate.commit), only)
    && coversWhen(candidate, facts.gate, change))
  const checked = record !== undefined || differsByOnly(change.paths, only)
  if (!checked) return { ok: false, missing: MISSING.check }
  const strict = facts.floor.unparsed.length > 0
  const filesPaths = facts.floor.entries.flatMap(entry => entry.tests.filter(test => test.form === 'files').map(test => test.paths)).flat()
  const deletesEntry = facts.floor.entries.some(entry => entry.tests.some(test => test.form === 'deletes'))
  const exempt = (path: string): boolean =>
    facts.floorExempt.has(path)
    || (strict && ((facts.graphDir !== undefined && floorPathIn([facts.graphDir], path)) || withinPaths([path], only)))
  const unreviewed = change.paths.filter(path =>
    (strict || filesPaths.some(prefix => floorPathIn([prefix], path))) && !exempt(path) && !facts.reviews.same(path))
  const undeleted = (strict || deletesEntry)
    ? change.deleted.filter(path => !exempt(path) && !facts.reviews.deleted(path))
    : []
  const uncheckedTasks = facts.tasks.filter(({ task, hit }) => (strict || hit) && !facts.reviews.taskFull(task)).map(({ task }) => task)
  if (unreviewed.length === 0 && undeleted.length === 0 && uncheckedTasks.length === 0) return { ok: true }
  const what = unreviewed.length > 0
    ? `no passed full review saw ${unreviewed[0]}`
    : undeleted.length > 0
      ? `no passed full review saw the deletion of ${undeleted[0]}`
      : `the task of the ${uncheckedTasks[0]} trailer has no passed full review`
  return { ok: false, missing: `${what} (the must-review floor binds the trunk)` }
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
        'Build the commit off the main branch (for example in the task\'s worktree), run check_commit <commit>, then fast-forward the trunk with git merge --ff-only <commit>.',
        names.floorLine ?? 'none',
      ]
  }
}
