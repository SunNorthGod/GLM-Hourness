/**
 * The trunk-advance check (M7 design 0.6 §3.8.4; E1b's pure half, E7's
 * listeners). The pure cases: advanceOk's check and floor clauses, pushOk,
 * the classification of §3.8.4's table with the E3-9 rows, the four-part
 * corrections (the push fact included, D13) and the two trunk events of
 * §2.5. The listener cases run on a real repository through the fake rc.3
 * host with a pwsh tool that really runs the command: a merge that is not a
 * fast-forward is refused; a fast-forward to a checked commit lands its
 * advances.jsonl line, the evidence, the completion and the removal of the
 * worktree (only once the review is settled) and the trunk event; a script
 * move is found after the call and its check afterwards writes the evidence
 * 「检查在前进之后」; the E3-9 forms are refused before they run; a commit on
 * the trunk passes only inside the only paths; a rollback passes;
 * `trunkAdvanceFor` is readable inside the gate for exactly the allowed
 * advance (R4-F4); a move between steps is recorded as outside; the floor
 * clause names the review it wants; and a worker's trunk move gets
 * worker-git's correction first. A case whose comment says 「today:」 fails
 * on the tree before E7 (§8.1's 今天必败 column).
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { advanceCorrection, advanceOk, classifyTrunkCall, pushOk, trunkEventOf, type AdvanceFacts, type AdvanceRecord, type AdvanceReviews, type TrunkState } from '../src/execute/advance.ts'
import { forgetAttempt, registerAttempt, registeredAttempt } from '../src/execute/attempts.ts'
import { EXECUTE_EVENTS } from '../src/execute/entries.ts'
import { floorPathIn, parseFloor } from '../src/execute/floor.ts'
import { normDigest, parseGateNorm } from '../src/execute/gate-norm.ts'
import { installExecuteRules } from '../src/guard/execute-rules.ts'
import type { AgentLike, PostExecuteListener, PreExecuteListener } from '../src/shared/dsh-min.ts'
import { node, sha256 } from './execute-helpers.ts'
import { advanceEvents, doneEvidence, withTrunkRig } from './execute-trunk.ts'

const gateNode = (acceptance: readonly string[]) => node({ id: 'norm-merge-gate', type: 'norm', acceptance }, 0, 'human')
const floorNode = (acceptance: readonly string[] | undefined) => node({ id: 'norm-review-floor', type: 'norm', ...(acceptance === undefined ? {} : { acceptance }) }, 0, 'human')

const gate = (lines: readonly string[]) => {
  const parsed = parseGateNorm(gateNode(lines))
  return { parsed, digest: normDigest(parsed, sha256) }
}

const reviews = (same: readonly string[] = [], deleted: readonly string[] = [], full: readonly string[] = []): AdvanceReviews => ({
  same: path => same.includes(path),
  deleted: path => deleted.includes(path),
  taskFull: task => full.includes(task),
})

const factsOf = (over: Partial<AdvanceFacts> & { readonly gate: AdvanceFacts['gate'], readonly normDigest: string }): AdvanceFacts => ({
  checks: [],
  pathsToN: () => [],
  floor: parseFloor(floorNode(undefined)),
  reviews: reviews(),
  tasks: [],
  graphDir: 'docs/graph',
  floorExempt: new Set<string>(),
  ...over,
})

test('advanceOk: the check clause — one passed record under the current digest, differing by only paths, running the when commands', () => {
  const g = gate(['`$ npm test`', '`$ npm run lint when src/`', '`only docs/graph/`'])
  // The change touches src/ and only src/: the record must have run the lint.
  const facts = factsOf({ gate: g.parsed, normDigest: g.digest, checks: [{ commit: 'a1', normDigest: g.digest, ran: [0, 1], passed: true }] })
  assert.deepEqual(advanceOk(facts, { paths: ['src/a.ts'], deleted: [] }), { ok: true })
  const withoutLint = factsOf({ gate: g.parsed, normDigest: g.digest, checks: [{ commit: 'a1', normDigest: g.digest, ran: [0], passed: true }] })
  const refused = advanceOk(withoutLint, { paths: ['src/a.ts'], deleted: [] })
  assert.equal(refused.ok, false)
  // No record under the current digest at all: the check clause is what refuses.
  const none = advanceOk(factsOf({ gate: g.parsed, normDigest: g.digest }), { paths: ['src/a.ts'], deleted: [] })
  assert.equal(none.ok, false)
  assert.ok(none.ok === false && none.missing.includes('passed merge check'))
  // A different digest counts for nothing.
  const otherDigest = factsOf({ gate: g.parsed, normDigest: 'deadbeef0000', checks: [{ commit: 'a1', normDigest: g.digest, ran: [0, 1], passed: true }] })
  assert.equal(advanceOk(otherDigest, { paths: ['src/a.ts'], deleted: [] }).ok, false)
  // The record's commit differs from N only by only paths.
  const viaPaths = factsOf({ gate: g.parsed, normDigest: g.digest, checks: [{ commit: 'a1', normDigest: g.digest, ran: [0, 1], passed: true }], pathsToN: commit => commit === 'a1' ? ['docs/graph/x.json'] : [] })
  assert.deepEqual(advanceOk(viaPaths, { paths: ['src/a.ts'], deleted: [] }), { ok: true })
  // The record's commit differs from N by a code path: not covered.
  const beyondPaths = factsOf({ gate: g.parsed, normDigest: g.digest, checks: [{ commit: 'a1', normDigest: g.digest, ran: [0, 1], passed: true }], pathsToN: () => ['src/late.ts'] })
  assert.equal(advanceOk(beyondPaths, { paths: ['src/a.ts'], deleted: [] }).ok, false)
  // A change inside the only paths passes with no record at all.
  assert.deepEqual(advanceOk(factsOf({ gate: g.parsed, normDigest: g.digest }), { paths: ['docs/graph/graph.json'], deleted: [] }), { ok: true })
})

test('advanceOk: the floor clause — by path in the loose reading, every path in the strict one, the exemptions where the design puts them', () => {
  const g = gate(['`$ npm test`'])
  const checked = [{ commit: 'n', normDigest: g.digest, ran: [0], passed: true }] as const
  const loose = factsOf({
    gate: g.parsed, normDigest: g.digest, checks: [...checked],
    floor: parseFloor(floorNode(['改到守卫 `files src/guard/`', '动了删除 `deletes`'])),
    reviews: reviews([], ['src/gone.ts']),
  })
  // A touched file under the files path without a full review is refused, with the file named.
  const refused = advanceOk(loose, { paths: ['src/guard/main-agent.ts'], deleted: [] })
  assert.equal(refused.ok, false)
  assert.ok(refused.ok === false && refused.missing.includes('src/guard/main-agent.ts'))
  // The same file with a review of the same content passes.
  assert.deepEqual(advanceOk({ ...loose, reviews: reviews(['src/guard/main-agent.ts']) }, { paths: ['src/guard/main-agent.ts'], deleted: [] }), { ok: true })
  // A file outside every files path needs no review.
  assert.deepEqual(advanceOk(loose, { paths: ['src/plain/a.ts'], deleted: [] }), { ok: true })
  // A deletion needs a reviewed deletion only when a deletes line exists.
  const noDeletes = factsOf({ gate: g.parsed, normDigest: g.digest, checks: [...checked], floor: parseFloor(floorNode(['改到守卫 `files src/guard/`'])), reviews: reviews() })
  assert.deepEqual(advanceOk(noDeletes, { paths: [], deleted: ['src/old.ts'] }), { ok: true })
  assert.equal(advanceOk(loose, { paths: [], deleted: ['src/other.ts'] }).ok, false)
  assert.deepEqual(advanceOk(loose, { paths: [], deleted: ['src/gone.ts'] }), { ok: true })

  // Strict: unparsed lines make every path need a review, sparing the graph directory and the only paths.
  const strictGate = gate(['`$ npm test`', '`only docs/graph/`'])
  const strict = factsOf({
    gate: strictGate.parsed, normDigest: strictGate.digest, checks: [{ commit: 'n', normDigest: strictGate.digest, ran: [0], passed: true }],
    floor: parseFloor(floorNode(['人话一条', '写错 `file x`'])),
    reviews: reviews(['src/every.ts']),
  })
  assert.equal(advanceOk(strict, { paths: ['src/every.ts'], deleted: [] }).ok, true)
  assert.equal(advanceOk(strict, { paths: ['src/other.ts'], deleted: [] }).ok, false)
  assert.deepEqual(advanceOk(strict, { paths: ['docs/graph/graph.json'], deleted: [] }), { ok: true })
  // A file exempted as fetched-in needs no review; the check clause still binds it.
  const exempted = factsOf({ ...strict, floorExempt: new Set(['src/other.ts']) })
  assert.equal(advanceOk(exempted, { paths: ['src/other.ts'], deleted: [] }).ok, true)
  // In the strict reading every trailer task needs a passed full review; loosely, only a task whose record hit a command or an outside line.
  const withTask = factsOf({ ...loose, checks: [...checked], tasks: [{ task: 'task-1', hit: false }], reviews: reviews() })
  assert.deepEqual(advanceOk(withTask, { paths: ['src/plain/a.ts'], deleted: [] }), { ok: true })
  const hitTask = factsOf({ ...loose, checks: [...checked], tasks: [{ task: 'task-1', hit: true }], reviews: reviews() })
  assert.equal(advanceOk(hitTask, { paths: ['src/plain/a.ts'], deleted: [] }).ok, false)
  const strictTask = factsOf({ ...strict, tasks: [{ task: 'task-1', hit: false }], reviews: reviews(['src/plain/a.ts']) })
  assert.equal(advanceOk(strictTask, { paths: ['src/plain/a.ts'], deleted: [] }).ok, false)
})

test('advanceOk: the when clause reads the acceptance indexes the record ran, which a prose line ahead of the commands shifts from their positions', () => {
  const g = gate(['Run the build and the tests before a merge.', '`$ npm test`', '`$ npm run lint when src/`'])
  assert.deepEqual(g.parsed.commands.map(command => command.index), [1, 2])
  // today: position 1 (the lint) was read as index 1 (the tests), so a record without the lint covered a src/ change.
  const testsOnly = factsOf({ gate: g.parsed, normDigest: g.digest, checks: [{ commit: 'a1', normDigest: g.digest, ran: [1], passed: true }] })
  const refused = advanceOk(testsOnly, { paths: ['src/a.ts'], deleted: [] })
  assert.equal(refused.ok, false)
  assert.ok(refused.ok === false && refused.missing === 'no passed merge check covers the change under the current checklist')
  const both = factsOf({ gate: g.parsed, normDigest: g.digest, checks: [{ commit: 'a1', normDigest: g.digest, ran: [1, 2], passed: true }] })
  assert.deepEqual(advanceOk(both, { paths: ['src/a.ts'], deleted: [] }), { ok: true })
})

test('advanceOk: an empty change passes whatever the records say (the caller checked ancestry first)', () => {
  const g = gate(['`$ npm test`'])
  assert.deepEqual(advanceOk(factsOf({ gate: g.parsed, normDigest: g.digest, checks: [{ commit: 'n', normDigest: g.digest, ran: [0], passed: true }] }), { paths: [], deleted: [] }), { ok: true })
})

test('pushOk: the three clauses', () => {
  const records: AdvanceRecord[] = [
    { ref: 'local', from: 'o1', to: 'o2', ok: true },
    { ref: 'remote', by: 'fetch', from: 'o2', to: 'o3' },
  ]
  assert.deepEqual(pushOk(records, 'o2', 'o2'), { ok: true })
  // Pushing exactly a state the local trunk reached through the gate.
  assert.deepEqual(pushOk(records, 'o2', 'o2'), { ok: true })
  assert.deepEqual(pushOk(records, 'o1', 'o2'), { ok: true })
  // Pushing a fetched state or a task branch's tip the local trunk never reached.
  const refused = pushOk(records, 'o2', 'o3')
  assert.equal(refused.ok, false)
  assert.equal(pushOk(records, 'o2', 'hz-task-1-a1').ok, false)
  // Or by the same gate as from T, when the caller binds advanceOk.
  const fromT = (from: string, to: string) => to === 'checked' ? { ok: true as const } : { ok: false as const, missing: 'no passed merge check' }
  assert.deepEqual(pushOk(records, 'o3', 'checked', fromT), { ok: true })
  assert.equal(pushOk(records, 'o3', 'unchecked', fromT).ok, false)
})

const state: TrunkState = {
  trunk: 'main',
  current: 'main',
  onTrunk: true,
  remote: 'origin',
  remoteUrl: 'https://git.example/repo.git',
  selfPath: 'C:/repo',
}

const offTrunk: TrunkState = { ...state, current: 'feature', onTrunk: false }

test('classifyTrunkCall: the local-trunk rows resolve a target, the unpredictable ones refuse on the trunk', () => {
  assert.deepEqual(classifyTrunkCall({ sub: 'merge', args: ['--ff-only', 'abc1234'] }, state), { verdict: 'advance', target: 'abc1234' })
  assert.deepEqual(classifyTrunkCall({ sub: 'reset', args: ['--hard', 'abc1234'] }, state), { verdict: 'advance', target: 'abc1234' })
  assert.deepEqual(classifyTrunkCall({ sub: 'reset', args: ['abc1234'] }, state), { verdict: 'allow' })
  assert.deepEqual(classifyTrunkCall({ sub: 'branch', args: ['-f', 'main', 'abc1234'] }, state), { verdict: 'advance', target: 'abc1234' })
  assert.deepEqual(classifyTrunkCall({ sub: 'update-ref', args: ['refs/heads/main', 'abc1234'] }, state), { verdict: 'advance', target: 'abc1234' })
  assert.deepEqual(classifyTrunkCall({ sub: 'checkout', args: ['-B', 'main', 'abc1234'] }, state), { verdict: 'advance', target: 'abc1234' })
  assert.deepEqual(classifyTrunkCall({ sub: 'switch', args: ['-C', 'main', 'abc1234'] }, state), { verdict: 'advance', target: 'abc1234' })
  assert.deepEqual(classifyTrunkCall({ sub: 'fetch', args: ['.', 'abc1234:main'] }, state), { verdict: 'advance', target: 'abc1234' })
  assert.deepEqual(classifyTrunkCall({ sub: 'fetch', args: ['.', 'abc1234:refs/heads/main'] }, state), { verdict: 'advance', target: 'abc1234' })
  // Off the trunk the unpredictable rows are the agent's own branch work.
  assert.deepEqual(classifyTrunkCall({ sub: 'merge', args: ['--no-ff', 'abc'] }, offTrunk), { verdict: 'allow' })
  assert.deepEqual(classifyTrunkCall({ sub: 'rebase', args: ['main'] }, offTrunk), { verdict: 'allow' })
  assert.deepEqual(classifyTrunkCall({ sub: 'cherry-pick', args: ['abc'] }, offTrunk), { verdict: 'allow' })
  assert.deepEqual(classifyTrunkCall({ sub: 'commit', args: ['-m', 'x'] }, offTrunk), { verdict: 'allow' })
  // On the trunk they are refused, except a commit staged entirely in only paths.
  assert.deepEqual(classifyTrunkCall({ sub: 'merge', args: ['--no-ff', 'abc'] }, state), { verdict: 'refuse', why: 'unpredictable' })
  assert.deepEqual(classifyTrunkCall({ sub: 'commit', args: ['-am', 'docs'] }, state, { staged: ['docs/graph/graph.json'], only: ['docs/graph/'] }), { verdict: 'allow' })
  assert.deepEqual(classifyTrunkCall({ sub: 'commit', args: ['-am', 'code'] }, state, { staged: ['src/a.ts'], only: ['docs/graph/'] }), { verdict: 'refuse', why: 'unpredictable' })
})

test('classifyTrunkCall: the E3-9 rows — push ., branch -M, worktree add -B, pull ., and the symbolic-ref that never goes through', () => {
  // On a feature branch, each of these would move the trunk to feature's unchecked tip.
  assert.deepEqual(classifyTrunkCall({ sub: 'push', args: ['.', 'feature:main'] }, offTrunk), { verdict: 'advance', target: 'feature' })
  assert.deepEqual(classifyTrunkCall({ sub: 'branch', args: ['-M', 'main'] }, offTrunk), { verdict: 'advance', target: 'feature' })
  assert.deepEqual(classifyTrunkCall({ sub: 'branch', args: ['--move', '--force', 'feature', 'main'] }, offTrunk), { verdict: 'advance', target: 'feature' })
  assert.deepEqual(classifyTrunkCall({ sub: 'worktree', args: ['add', '-B', 'main', '../wt', 'feature'] }, offTrunk), { verdict: 'advance', target: 'feature' })
  assert.deepEqual(classifyTrunkCall({ sub: 'pull', args: ['.', 'feature:main'] }, offTrunk), { verdict: 'advance', target: 'feature' })
  // The file:// self form behaves like the dot.
  assert.deepEqual(classifyTrunkCall({ sub: 'push', args: ['file:///C:/repo', 'feature:main'] }, offTrunk), { verdict: 'advance', target: 'feature' })
  // And they pass through advanceOk like any other row: a checked source is fine (the caller judges).
  assert.deepEqual(classifyTrunkCall({ sub: 'push', args: ['.', 'feature:refs/heads/main'] }, offTrunk), { verdict: 'advance', target: 'feature' })
  // The symbolic-ref of the trunk itself has no way through, on or off the trunk.
  assert.deepEqual(classifyTrunkCall({ sub: 'symbolic-ref', args: ['refs/heads/main', 'refs/heads/feature'] }, offTrunk), { verdict: 'refuse', why: 'symbolic-trunk' })
  assert.deepEqual(classifyTrunkCall({ sub: 'symbolic-ref', args: ['refs/heads/main', 'refs/heads/feature'] }, state), { verdict: 'refuse', why: 'symbolic-trunk' })
})

test('classifyTrunkCall: the pull and remote-tracking rows refuse, the upstream push reads its target', () => {
  // Any pull on the trunk, and a pull of a foreign source into the trunk off it.
  assert.deepEqual(classifyTrunkCall({ sub: 'pull', args: ['--ff-only'] }, state), { verdict: 'refuse', why: 'pull' })
  assert.deepEqual(classifyTrunkCall({ sub: 'pull', args: ['origin', 'main:main'] }, offTrunk), { verdict: 'refuse', why: 'pull' })
  assert.deepEqual(classifyTrunkCall({ sub: 'fetch', args: ['origin', 'abc:main'] }, state), { verdict: 'refuse', why: 'pull' })
  // The tracking reference is never written by hand.
  assert.deepEqual(classifyTrunkCall({ sub: 'fetch', args: ['.', 'abc:refs/remotes/origin/main'] }, state), { verdict: 'refuse', why: 'remote-tracking' })
  assert.deepEqual(classifyTrunkCall({ sub: 'update-ref', args: ['refs/remotes/origin/main', 'abc'] }, state), { verdict: 'refuse', why: 'remote-tracking' })
  assert.deepEqual(classifyTrunkCall({ sub: 'symbolic-ref', args: ['refs/remotes/origin/main', 'refs/heads/main'] }, state), { verdict: 'refuse', why: 'remote-tracking' })
  assert.deepEqual(classifyTrunkCall({ sub: 'branch', args: ['-r', '-D', 'origin/main'] }, state), { verdict: 'refuse', why: 'remote-tracking' })
  // A plain fetch without a refspec is the way through.
  assert.deepEqual(classifyTrunkCall({ sub: 'fetch', args: ['origin'] }, state), { verdict: 'allow' })
  // The upstream push: the target is the rev, or the local trunk's value without a refspec.
  assert.deepEqual(classifyTrunkCall({ sub: 'push', args: ['origin', 'abc1234:main'] }, state), { verdict: 'push', target: 'abc1234' })
  assert.deepEqual(classifyTrunkCall({ sub: 'push', args: ['origin', 'main'] }, state), { verdict: 'push', target: 'main' })
  assert.deepEqual(classifyTrunkCall({ sub: 'push', args: ['--force-with-lease', 'origin', 'abc1234:main'] }, state), { verdict: 'push', target: 'abc1234' })
  assert.deepEqual(classifyTrunkCall({ sub: 'push', args: [] }, state), { verdict: 'push', target: 'main' })
  // Pushing to another remote or another branch is not the gate's business.
  assert.deepEqual(classifyTrunkCall({ sub: 'push', args: ['upstream2', 'abc1234:main'] }, state), { verdict: 'allow' })
  assert.deepEqual(classifyTrunkCall({ sub: 'push', args: ['origin', 'abc1234:refs/heads/wip'] }, state), { verdict: 'allow' })
  // Pushing the same URL as the upstream counts as the upstream.
  assert.deepEqual(classifyTrunkCall({ sub: 'push', args: ['https://git.example/repo.git', 'abc1234:main'] }, state), { verdict: 'push', target: 'abc1234' })
  // --all and --mirror to the upstream are refused by name.
  assert.deepEqual(classifyTrunkCall({ sub: 'push', args: ['--all', 'origin'] }, state), { verdict: 'refuse', why: 'push-all' })
  assert.deepEqual(classifyTrunkCall({ sub: 'push', args: ['--mirror'] }, state), { verdict: 'refuse', why: 'push-all' })
  // Deleting the published trunk is refused outright.
  assert.deepEqual(classifyTrunkCall({ sub: 'push', args: ['origin', ':main'] }, state), { verdict: 'refuse', why: 'delete-trunk' })
})

test('advanceCorrection: the four parts, with the three-step way through for a pull', () => {
  const lines = advanceCorrection('pull', { trunk: 'main', from: 'o1', to: 'o2' })
  assert.equal(lines.length, 4)
  assert.ok(lines[0]?.includes('main would move from o1 to o2'))
  assert.ok(lines[2]?.includes('git fetch <upstream>'))
  assert.ok(lines[2]?.includes('check_commit <upstream>/<trunk>'))
  assert.ok(lines[2]?.includes('git merge --ff-only <upstream>/<trunk>'))
  const tracked = advanceCorrection('remote-tracking', { trunk: 'main', from: 'o1', to: 'o2', remote: 'origin' })
  assert.ok(tracked[0]?.includes('origin/main is the harness\'s view of the published main branch'))
  const floorLine = advanceCorrection('unpredictable', { trunk: 'main', from: 'o1', to: 'o2', floorLine: 'dispatch a full review of the task that changed src/a.ts' })
  assert.equal(floorLine[3], 'dispatch a full review of the task that changed src/a.ts')
})

test('the only-path matching the gate and the floor share reads prefixes by segments', () => {
  assert.equal(floorPathIn(['docs/graph/'], 'docs/graph/graph.json'), true)
  assert.equal(floorPathIn(['docs/graph'], 'docs/graph.json'), false)
})

test('advanceCorrection: the push refusal states the published trunk, with the boundary and the way through of the unpredictable rows (D13)', () => {
  const missing = 'no passed merge check covers the change under the current checklist'
  const lines = advanceCorrection('push', { trunk: 'main', from: 'o1', to: 'n1', remote: 'origin', missing })
  assert.equal(lines.length, 4)
  assert.equal(lines[0], `origin/main would be pushed from o1 to n1 without a passed merge check (${missing}).`)
  assert.deepEqual(lines.slice(1), advanceCorrection('unpredictable', { trunk: 'main', from: 'o1', to: 'n1' }).slice(1))
  assert.equal(advanceCorrection('push', { trunk: 'main', from: 'o1', to: 'n1', floorLine: 'dispatch a full review of task-1' })[3], 'dispatch a full review of task-1')
})

test('trunkEventOf: the two events with the declared payload of §2.5, tasks on trunk-advanced only, at most 200 files, the key of this one line', () => {
  const from = 'a'.repeat(40)
  const to = 'b'.repeat(40)
  const line: AdvanceRecord = { ref: 'local', from, to, tasks: ['task-1', 'task-2'], at: '2026-11-04T08:00:00.000Z', ok: true }
  const declared = (id: string): string[] => (EXECUTE_EVENTS.find(event => event.id === id)?.fields ?? []).map(field => field.name).sort()
  const many = Array.from({ length: 205 }, (_, index) => `src/f${index}.ts`)
  const advanced = trunkEventOf('trunk-advanced', line, many)
  assert.equal(advanced.event, 'hourness.trunk-advanced')
  assert.equal(advanced.key, `trunk-advanced:${to}:2026-11-04T08:00:00.000Z`)
  assert.deepEqual(Object.keys(advanced.payload).sort(), declared('hourness.trunk-advanced'))
  assert.equal(advanced.payload.tasks, 'task-1,task-2')
  assert.deepEqual(advanced.payload.files, many.slice(0, 200))
  assert.equal(advanced.payload.truncated, true)
  const outside = trunkEventOf('outside-advance', { ref: 'local', by: 'outside', from, to, at: '2026-11-04T09:00:00.000Z' }, ['README.md'])
  assert.equal(outside.event, 'hourness.outside-advance')
  assert.equal(outside.key, `outside-advance:${to}:2026-11-04T09:00:00.000Z`)
  assert.deepEqual(Object.keys(outside.payload).sort(), declared('hourness.outside-advance'))
  assert.deepEqual(outside.payload, { from, to, files: ['README.md'], truncated: false })
})

// ---- the listeners on a real repository ----

const RULE = 'trunk-advance-checked'

test('a merge on the trunk that is not a fast-forward is refused with the four parts and journaled; the trunk stays', async () => {
  await withTrunkRig({}, async (rig) => {
    rig.taskBranch({ 'src/feed.js': 'feed\n' })
    const before = rig.repo.git('rev-parse', 'main')
    // today: nothing judged the call, git made the merge commit on main.
    const { result, text } = await rig.run('git merge --no-ff hz/task-1 -m merge-task-1')
    assert.equal(result.isError, true)
    const [fact, boundary, rightPath, exception] = text.split('\n')
    assert.match(fact ?? '', /^main would move from [0-9a-f]{12} to a merge result without a passed merge check\.$/)
    assert.equal(boundary, 'Boundary: The main branch moves only to a commit the harness checked.')
    assert.match(rightPath ?? '', /^Right path: Build the commit off the main branch .*run check_commit <commit>, then fast-forward the trunk with git merge --ff-only <commit>\.$/)
    assert.equal(exception, 'Exception: none')
    assert.equal(rig.repo.git('rev-parse', 'main'), before)
    assert.deepEqual(rig.violations.map(record => [record.rule, record.effect]), [[RULE, undefined]])
    assert.ok(rig.metrics.some(event => event.event === 'execute.advance-refused'))
    assert.deepEqual(await rig.advances(), [])
  })
})

test('a fast-forward to a checked commit lands the advance line, the evidence and the completion of a skip-depth task, removes its clean worktree and hands on the trunk event', async () => {
  await withTrunkRig({}, async (rig) => {
    const { commit, worktree } = rig.taskBranch({ 'src/feed.js': 'feed\n' })
    await rig.dispatched('skip', commit)
    const from = rig.repo.git('rev-parse', 'main')
    assert.equal((await rig.check('hz/task-1')).status, 'started')
    const { result, callId } = await rig.run(`git merge --ff-only ${commit}`)
    assert.equal(result.isError, false)
    assert.equal(rig.repo.git('rev-parse', 'main'), commit)
    const [line] = await rig.advances()
    assert.ok(line !== undefined)
    assert.deepEqual({ ...line, at: undefined }, { ref: 'local', from, to: commit, agent: rig.main.id, callId, check: commit, tasks: ['task-1'], at: undefined, ok: true })
    const task = await rig.node('task-1')
    assert.equal(task.status, 'done')
    const evidence = doneEvidence(task)
    assert.deepEqual(evidence[0], { kind: 'commit', ref: commit })
    assert.deepEqual(evidence.slice(1).map(item => [item.kind, item.ref, item.exit]), [
      ['test', 'node -e "process.exit(0)"', 0],
      ['test', 'node -e "process.exit(0)"', 0],
      ['test', 'node -e "process.exit(0)"', 0],
    ])
    assert.ok(evidence.slice(1).every(item => item.note?.startsWith('.llm/execute/checks/') === true), 'each test names its log')
    assert.ok((await rig.comments('task-1')).includes(`进主干 ${commit.slice(0, 12)}（从 ${from.slice(0, 12)}）· 检查 ${commit.slice(0, 12)}`))
    assert.equal(existsSync(worktree), false, 'the clean worktree of the done task is removed')
    assert.equal(rig.repo.git('rev-parse', 'hz/task-1'), commit, 'the branch stays')
    assert.equal(rig.events.length, 1)
    const [seen] = rig.events
    assert.equal(seen?.trunk, 'main')
    assert.equal(seen?.event.event, 'hourness.trunk-advanced')
    assert.equal(seen?.event.key, `trunk-advanced:${commit}:${line.at ?? ''}`)
    assert.deepEqual(seen?.event.payload, { from, to: commit, tasks: 'task-1', files: ['src/feed.js'], truncated: false })
    assert.deepEqual(advanceEvents(rig.metrics).map(event => [event.ref, event.way, event.byCheck, event.byPaths, event.reviewPending]), [['local', 'advance', true, false, []]])
    assert.deepEqual(rig.violations, [])
  })
})

test('a task whose review has not passed gets the trunk comment with 审查还没过, stays in progress and keeps its worktree', async () => {
  await withTrunkRig({}, async (rig) => {
    const { commit, worktree } = rig.taskBranch({ 'src/feed.js': 'feed\n' })
    await rig.dispatched('全审', commit)
    await rig.check(commit)
    assert.equal((await rig.run(`git merge --ff-only ${commit}`)).result.isError, false)
    const task = await rig.node('task-1')
    assert.equal(task.status, 'doing')
    assert.ok((await rig.comments('task-1')).some(text => text.startsWith('进主干 ') && text.endsWith(' · 审查还没过，过了再记完成')))
    assert.equal(existsSync(worktree), true, 'the reviewer still needs the worktree (D3)')
    assert.deepEqual(advanceEvents(rig.metrics).map(event => event.reviewPending), [['task-1']])
  })
})

test('a trailer task without a dispatch comment gets 没有派发记录 and no completion', async () => {
  await withTrunkRig({}, async (rig) => {
    const { commit } = rig.taskBranch({ 'src/feed.js': 'feed\n' })
    await rig.check(commit)
    assert.equal((await rig.run(`git merge --ff-only ${commit}`)).result.isError, false)
    const task = await rig.node('task-1')
    assert.equal(task.status, 'approved')
    assert.ok((await rig.comments('task-1')).some(text => text.endsWith(' · 没有派发记录：主 Agent 确认之后可以 graph_status 它')))
  })
})

test('a script move is found after the call: the unchecked line, a detected-after violation, the notice and no evidence; the check afterwards writes the evidence 检查在前进之后', async () => {
  await withTrunkRig({}, async (rig) => {
    const { commit } = rig.taskBranch({ 'src/feed.js': 'feed\n' })
    await rig.dispatched('skip', commit)
    const from = rig.repo.git('rev-parse', 'main')
    // An alias hides update-ref from the table; only the compare after the call sees the move.
    const { result } = await rig.run(`git -c alias.tm="update-ref refs/heads/main ${commit}" tm`)
    assert.equal(result.isError, false)
    assert.equal(rig.repo.git('rev-parse', 'main'), commit)
    const [unchecked] = await rig.advances()
    assert.equal(unchecked?.ok, false)
    assert.deepEqual([unchecked?.ref, unchecked?.from, unchecked?.to, unchecked?.tasks], ['local', from, commit, ['task-1']])
    assert.match(unchecked?.missing ?? '', /no passed merge check/)
    assert.deepEqual(rig.violations.map(record => [record.rule, record.effect]), [[RULE, 'detected-after']])
    const notice = rig.sent.at(-1)
    assert.equal(notice?.source.kind, 'glm-hourness-execute')
    assert.match(notice?.content[0]?.text ?? '', new RegExp(`^main moved from ${from.slice(0, 12)} to ${commit.slice(0, 12)} without a passed merge check \\(.+\\)\\. No evidence was recorded\\. Run check_commit ${commit.slice(0, 12)}; if it fails, fix or revert on the main branch\\.$`))
    assert.equal((await rig.node('task-1')).status, 'doing')
    assert.ok(!(await rig.comments('task-1')).some(text => text.startsWith('进主干 ')))
    assert.ok(rig.metrics.some(event => event.event === 'execute.unchecked-advance' && event.ref === 'local'))

    // The commit is on the trunk now; its check runs every command and the evidence follows.
    assert.equal((await rig.check(commit)).status, 'started')
    const after = (await rig.advances()).at(-1)
    assert.deepEqual([after?.ref, after?.ok, after?.checkedAfter, after?.check, after?.tasks], ['local', true, true, commit, ['task-1']])
    const task = await rig.node('task-1')
    assert.equal(task.status, 'done')
    assert.equal(doneEvidence(task).filter(item => item.kind === 'test').length, 3, 'the when line ran too')
    assert.ok((await rig.comments('task-1')).some(text => text.startsWith('进主干 ') && text.endsWith(' · 检查在前进之后')))
    assert.ok(advanceEvents(rig.metrics).some(event => event.checkedAfter === true))
  })
})

test('the six E3-9 forms are refused before they run with the checkout on another branch; L and T stay', async () => {
  await withTrunkRig({ remote: true }, async (rig) => {
    rig.repo.commitOn('feature', { 'src/feature.js': 'feature\n' }, 'feature work')
    rig.repo.git('checkout', '--quiet', 'feature')
    const local = rig.repo.git('rev-parse', 'refs/heads/main')
    const tracking = rig.repo.git('rev-parse', 'refs/remotes/origin/main')
    // today: each of these moved main (or origin/main) to the unchecked feature commit.
    for (const command of [
      'git push . feature:main',
      'git branch -M feature main',
      'git worktree add -B main ../wt feature',
      'git pull . feature:main',
      'git symbolic-ref refs/heads/main refs/heads/feature',
      'git push . feature:refs/remotes/origin/main',
    ]) {
      const { result, text } = await rig.run(command)
      assert.equal(result.isError, true, `${command} was not refused`)
      assert.ok(text.includes('Boundary: The main branch moves only to a commit the harness checked.'), `${command}: ${text}`)
    }
    assert.equal(rig.repo.git('rev-parse', 'refs/heads/main'), local)
    assert.equal(rig.repo.git('rev-parse', 'refs/remotes/origin/main'), tracking)
    assert.equal(rig.repo.git('symbolic-ref', '--short', 'HEAD'), 'feature')
    assert.equal(rig.violations.length, 6)
  })
})

test('a commit on the trunk passes with only paths staged and is recorded by paths; with a source file staged it is refused', async () => {
  await withTrunkRig({}, async (rig) => {
    const from = rig.repo.git('rev-parse', 'main')
    writeFileSync(join(rig.repo.graphDir, 'notes.md'), 'a note\n')
    rig.repo.git('add', '--', 'docs/graph/notes.md')
    const graphNote = await rig.run('git commit -m graph-note')
    assert.equal(graphNote.result.isError, false)
    const to = rig.repo.git('rev-parse', 'main')
    assert.notEqual(to, from)
    const [line] = await rig.advances()
    assert.deepEqual([line?.ok, line?.only, line?.check, line?.from, line?.to], [true, true, null, from, to])
    mkdirSync(join(rig.repo.root, 'src'), { recursive: true })
    writeFileSync(join(rig.repo.root, 'src', 'x.ts'), 'export {}\n')
    rig.repo.git('add', '--', 'src/x.ts')
    // today: the commit landed on main unchecked.
    const code = await rig.run('git commit -m code-on-main')
    assert.equal(code.result.isError, true)
    assert.match(code.text, /^main would move from [0-9a-f]{12} to a new commit without a passed merge check\./)
    assert.equal(rig.repo.git('rev-parse', 'main'), to)
  })
})

test('a rollback of the trunk passes and is recorded with check null and no tasks', async () => {
  await withTrunkRig({}, async (rig) => {
    const base = rig.repo.git('rev-parse', 'main')
    const top = rig.repo.commit({ 'README.md': 'changed by hand\n' }, 'by hand')
    const { result } = await rig.run('git reset --hard HEAD~1')
    assert.equal(result.isError, false)
    assert.equal(rig.repo.git('rev-parse', 'main'), base)
    const [line] = await rig.advances()
    assert.deepEqual([line?.ref, line?.from, line?.to, line?.check, line?.tasks, line?.ok], ['local', top, base, null, [], true])
    assert.deepEqual(rig.violations, [])
  })
})

test('trunkAdvanceFor (R4-F4): an inner listener reads the allowed fast-forward, is never reached by the refused call, reads nothing for a script move, and the entry is gone after post-execute', async () => {
  const readings = new Map<string, unknown>()
  await withTrunkRig({
    before: (runtime, gate) => {
      const inner: PreExecuteListener = async (payload, next) => {
        readings.set(payload.callId ?? '', gate()?.trunkAdvanceFor(payload.callId ?? ''))
        return next()
      }
      runtime.ctx.on('tools/pre-execute', inner, { prepend: true })
    },
  }, async (rig) => {
    const { commit, worktree } = rig.taskBranch({ 'src/feed.js': 'feed\n' })
    const from = rig.repo.git('rev-parse', 'main')
    const refused = await rig.run('git merge --no-ff hz/task-1 -m merge-task-1')
    assert.equal(refused.result.isError, true)
    assert.equal(readings.has(refused.callId), false, 'the refused call never reached the inner listener')
    await rig.check(commit)
    const allowed = await rig.run(`git merge --ff-only ${commit}`)
    assert.deepEqual(readings.get(allowed.callId), { branch: 'main', from, to: commit })
    assert.equal(rig.gate.trunkAdvanceFor(allowed.callId), undefined, 'post-execute dropped it')
    writeFileSync(join(worktree, 'src', 'feed.js'), 'feed 2\n')
    rig.repo.git('-C', worktree, 'commit', '--quiet', '-am', 'task-1: more')
    const second = rig.repo.git('-C', worktree, 'rev-parse', 'HEAD')
    const script = await rig.run(`git -c alias.tm="update-ref refs/heads/main ${second}" tm`)
    assert.equal(readings.has(script.callId), true)
    assert.equal(readings.get(script.callId), undefined, 'a move the table cannot see has no entry')
  })
})

test('a commit made outside every call is seen at the main agent\'s next step as an outside advance: the line, the metric and the event, no violation', async () => {
  await withTrunkRig({}, async (rig) => {
    await rig.runtime.preStep()
    const from = rig.repo.git('rev-parse', 'main')
    const to = rig.repo.commit({ 'README.md': 'edited in a terminal\n' }, 'by the person')
    await rig.runtime.preStep()
    const [line] = await rig.advances()
    assert.deepEqual([line?.ref, line?.by, line?.from, line?.to, line?.ok], ['local', 'outside', from, to, undefined])
    assert.ok(advanceEvents(rig.metrics).some(event => event.way === 'outside' && event.external === true))
    assert.deepEqual(rig.events.map(seen => [seen.event.event, seen.event.payload.files]), [['hourness.outside-advance', ['README.md']]])
    assert.deepEqual(rig.violations, [])
  })
})

test('the floor clause: a checked fast-forward that touches a must-review file without a passed full review is refused and names the review it wants', async () => {
  await withTrunkRig({ floor: ['碰到受保护的目录：`files src/guarded/`'] }, async (rig) => {
    const { commit } = rig.taskBranch({ 'src/guarded/x.ts': 'guarded\n' })
    await rig.check(commit)
    const { result, text } = await rig.run(`git merge --ff-only ${commit}`)
    assert.equal(result.isError, true)
    assert.match(text, /no passed full review saw src\/guarded\/x\.ts \(the must-review floor binds the trunk\)/)
    assert.ok(text.endsWith('Exception: dispatch a full review of the task that changed src/guarded/x.ts'), text)
    assert.notEqual(rig.repo.git('rev-parse', 'main'), commit)
  })
})

test('a registered worker that moves the trunk gets worker-git\'s correction: the chain\'s rules stay outside the trunk check, as the row installs them', async () => {
  await withTrunkRig({}, async (rig) => {
    const { commit, worktree } = rig.taskBranch({ 'src/feed.js': 'feed\n' })
    const childId = 'hz-task-1-a1-wwwwww'
    // The trunk check reads the same register, so without the order it would answer this call itself.
    registerAttempt({ childId, role: 'worker', node: 'task-1', attempt: 1, graphDir: rig.repo.graphDir, worktree, branch: 'hz/task-1', baseSha: rig.repo.git('rev-parse', 'main'), review: 'skip', provider: 'probe', model: 'probe-model', why: 'one directory', plan: 'skipped', pins: 'pins: task-1@000000000000' })
    const undo = installExecuteRules(rig.runtime.ctx, {
      lookup: { get: () => undefined },
      register: registeredAttempt,
      owning: () => undefined,
      live: () => true,
      graphOf: () => undefined,
      journal: record => { rig.violations.push(record) },
      report: () => {},
      record: () => Promise.resolve(true),
      effectiveDir: session => session.header.cwd,
    })
    try {
      const worker: AgentLike = { id: childId, ctx: {} as never, session: { id: childId, header: { id: childId, cwd: worktree }, deriveMessages: () => [] } }
      const { result, text } = await rig.run(`git update-ref refs/heads/main ${commit}`, { agent: worker })
      assert.equal(result.isError, true)
      assert.match(text, /You are the worker for task task-1/)
      assert.deepEqual(rig.violations.map(record => record.rule), ['worker-git'])
      assert.notEqual(rig.repo.git('rev-parse', 'main'), commit)
    }
    finally {
      undo()
      forgetAttempt(childId)
    }
  })
})

test('a plain subagent the main agent started is judged like the main agent: its trunk move is refused, and the next step books no outside move', async () => {
  await withTrunkRig({}, async (rig) => {
    const { commit } = rig.taskBranch({ 'src/feed.js': 'feed\n' })
    await rig.runtime.preStep()
    const before = rig.repo.git('rev-parse', 'main')
    const child: AgentLike = { id: 'sub-1', ctx: {} as never, session: { id: 'sub-1', header: { id: 'sub-1', cwd: rig.repo.root, parentSession: rig.main.id, origin: 'subagent' }, deriveMessages: () => [] } }
    // today: nothing judged the subagent's call, git moved main, and the next step booked the move as the person's.
    const { result, text } = await rig.run(`git update-ref refs/heads/main ${commit}`, { agent: child })
    assert.equal(result.isError, true)
    assert.match(text, /^main would move from [0-9a-f]{12} to [0-9a-f]{12} without a passed merge check/)
    assert.equal(rig.repo.git('rev-parse', 'main'), before)
    assert.deepEqual(rig.violations.map(record => [record.rule, record.agentId]), [[RULE, 'sub-1']])
    await rig.runtime.preStep()
    assert.deepEqual(await rig.advances(), [])
  })
})

test('one trunk move is recorded once: a call that spans another call\'s fast-forward does not record it again', async () => {
  let reached = (): void => {}
  const waiting = new Promise<void>((done) => { reached = done })
  let release = (): void => {}
  const held = new Promise<void>((done) => { release = done })
  await withTrunkRig({
    before: (runtime) => {
      // Inside the gate: the spanning call has its baseline and waits here while the fast-forward runs and settles.
      const hold: PreExecuteListener = async (payload, next) => {
        if (payload.callId === 'spanning') {
          reached()
          await held
        }
        return next()
      }
      runtime.ctx.on('tools/pre-execute', hold, { prepend: true })
    },
  }, async (rig) => {
    const { commit } = rig.taskBranch({ 'src/feed.js': 'feed\n' })
    await rig.check(commit)
    const spanning = rig.run('git status --short', { callId: 'spanning' })
    await waiting
    assert.equal((await rig.run(`git merge --ff-only ${commit}`)).result.isError, false)
    release()
    assert.equal((await spanning).result.isError, false)
    // today: the spanning call's post-execute compared O..N against its own baseline and recorded the advance a second time.
    assert.equal((await rig.advances()).filter(line => line.ref === 'local').length, 1)
    assert.equal((await rig.comments('task-1')).filter(comment => comment.startsWith('进主干 ')).length, 1)
    assert.equal(advanceEvents(rig.metrics).length, 1)
    assert.equal(rig.events.length, 1)
  })
})

test('the step compare starts from the oldest call whose post-execute never came, so a move inside it is not lost', async () => {
  await withTrunkRig({}, async (rig) => {
    // An outer listener settles the lost calls without the gate's post-execute (§15 U20).
    const lose: PostExecuteListener = async (exec, _result, next) => exec.callId.startsWith('lost-') ? { kind: 'accept' } : next()
    const undo = rig.runtime.ctx.on('tools/post-execute', lose, { prepend: true })
    try {
      await rig.runtime.preStep()
      const from = rig.repo.git('rev-parse', 'main')
      const first = rig.repo.commitOn('side', { 'src/a.js': 'a\n' }, 'side one')
      const second = rig.repo.commitOn('side', { 'src/b.js': 'b\n' }, 'side two')
      await rig.run(`git -c alias.tm="update-ref refs/heads/main ${first}" tm`, { callId: 'lost-1' })
      await rig.run(`git -c alias.tm="update-ref refs/heads/main ${second}" tm`, { callId: 'lost-2' })
      assert.equal(rig.repo.git('rev-parse', 'main'), second)
      assert.deepEqual(await rig.advances(), [], 'no post-execute compared')
      await rig.runtime.preStep()
      // today: the compare started from the newest lost baseline and recorded only first..second.
      assert.deepEqual((await rig.advances()).map(line => [line.ref, line.from, line.to, line.callId, line.ok]), [['local', from, second, 'lost-1', false]])
    }
    finally {
      undo()
    }
  })
})
