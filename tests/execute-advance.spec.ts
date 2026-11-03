import assert from 'node:assert/strict'
import test from 'node:test'
import { advanceCorrection, advanceOk, classifyTrunkCall, pushOk, type AdvanceFacts, type AdvanceRecord, type AdvanceReviews, type TrunkState } from '../src/execute/advance.ts'
import { floorPathIn, parseFloor } from '../src/execute/floor.ts'
import { normDigest, parseGateNorm } from '../src/execute/gate-norm.ts'
import { node, sha256 } from './execute-helpers.ts'

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
