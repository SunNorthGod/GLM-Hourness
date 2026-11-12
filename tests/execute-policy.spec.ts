/**
 * The policy digest (reval design 0.2 §3, §4.2): the four classes digest
 * what they say and nothing else — unrelated graph activity and the graph
 * revision do not move them; one class's change reports that class only; a
 * deleted or superseded norm reads as missing; the absent rules file and the
 * empty one are the same stable digest; the line round-trips; a line the
 * parser half reads fails closed, never as fresh.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import type { GraphNode } from '../src/graph/schema.ts'
import {
  parsePolicyDrift,
  parsePolicyLine,
  policyDigests,
  policyStaleness,
  renderPolicyDrift,
  renderPolicyLine,
  type ClassDigest,
  type PolicyDigests,
  type RulesRead,
} from '../src/execute/policy-digest.ts'
import { graphOf, node, sha256, withNode } from './execute-helpers.ts'

const nodes = (): readonly GraphNode[] => [
  node({ id: 'goal-1', type: 'goal', stage: 'release', acceptance: ['the goal'] }, 0, 'human'),
  node({ id: 'norm-merge-gate', type: 'norm', acceptance: ['`$ npm test`'] }, 0, 'human'),
  node({ id: 'norm-review-floor', type: 'norm', acceptance: ['碰到必须全审：`files src/guard/`'] }, 0, 'human'),
  node({ id: 'env', type: 'feature', parent: 'goal-1' }, 0),
  node({ id: 'tool-1', type: 'tool', parent: 'env', title: 'the checker', acceptance: ['config site/eslint.json'] }, 0),
  node({ id: 'task-1', type: 'task', parent: 'goal-1', kind: 'implement', writeScope: ['src/'], acceptance: ['works'] }, 0),
  node({ id: 'decision-1', type: 'decision', parent: 'goal-1', verification: 'unverified' }, 0),
]

const graph = (revision = 'rev0') => graphOf(nodes(), revision)
const digestsOf = (one: ReturnType<typeof graph>, rules: RulesRead = { kind: 'absent' }) => policyDigests(one, rules, sha256)
const digest12 = (digest: ClassDigest): string => {
  assert.ok(digest.ok, 'the fixture class was expected to digest')
  return digest.digest
}

test('the four classes digest, and unrelated graph activity and the revision do not move them', () => {
  const before = digestsOf(graph())
  // An unrelated node's title, body and history change; the revision moves.
  const noisy = withNode(graph('rev9'), { ...node({ id: 'decision-1', type: 'decision', parent: 'goal-1', verification: 'unverified', title: 'retitled', body: 'rewritten' }, 9, 'llm', [{ at: '2026-11-13T00:00:09.000Z', actor: 'llm', op: 'comment', text: 'noise' }]) })
  assert.deepEqual(digestsOf(noisy), before, JSON.stringify({ before, after: digestsOf(noisy) }))
  for (const cls of ['gate', 'floor', 'rules', 'checker'] as const) {
    assert.match(digest12(before[cls]), /^[0-9a-f]{12}$/)
  }
})

test('gate: a command change moves it, prose does not; floor: a line change moves it; checker: a config line or an approval moves it', () => {
  const base = digestsOf(graph())
  const gateProse = digestsOf(withNode(graph(), node({ id: 'norm-merge-gate', type: 'norm', acceptance: ['`$ npm test`', '只许改这个目录'] }, 0, 'human')))
  assert.equal(digest12(gateProse.gate), digest12(base.gate), 'prose is not part of the gate digest')
  const gateCommand = digestsOf(withNode(graph(), node({ id: 'norm-merge-gate', type: 'norm', acceptance: ['`$ npm run build`'] }, 0, 'human')))
  assert.notEqual(digest12(gateCommand.gate), digest12(base.gate))
  const floorLine = digestsOf(withNode(graph(), node({ id: 'norm-review-floor', type: 'norm', acceptance: ['碰到必须全审：`files src/guard/`', '动了删除：`deletes`'] }, 0, 'human')))
  assert.notEqual(digest12(floorLine.floor), digest12(base.floor))
  assert.equal(digest12(floorLine.gate), digest12(base.gate), 'the floor change does not move the gate')
  const checkerPath = digestsOf(withNode(graph(), node({ id: 'tool-1', type: 'tool', parent: 'env', title: 'the checker', acceptance: ['config site/eslint.json', 'config site/knip-baseline.json'] }, 0)))
  assert.notEqual(digest12(checkerPath.checker), digest12(base.checker))
  // A proposed tool is not yet policy; approving it moves the checker digest.
  const proposed = digestsOf(withNode(graph(), node({ id: 'tool-2', type: 'tool', parent: 'env', title: 'the other checker', status: 'proposed', acceptance: ['config site/ruff.toml'] }, 0)))
  assert.equal(digest12(proposed.checker), digest12(base.checker))
  const approved = digestsOf(withNode(graph(), node({ id: 'tool-2', type: 'tool', parent: 'env', title: 'the other checker', acceptance: ['config site/ruff.toml'] }, 0)))
  assert.notEqual(digest12(approved.checker), digest12(base.checker))
})

test('a norm node deleted or superseded digests as missing, and the comparison reports it against the recorded digest', () => {
  const digests = digestsOf(graph())
  const gone = digestsOf(graphOf(nodes().filter(entry => entry.id !== 'norm-merge-gate')))
  assert.deepEqual(gone.gate, { ok: false, why: 'missing' })
  const superseded = digestsOf(withNode(graph(), { ...node({ id: 'norm-review-floor', type: 'norm', acceptance: ['碰到必须全审：`files src/guard/`'] }, 0, 'human', [{ at: '2026-11-13T00:00:01.000Z', actor: 'human', op: 'status', from: 'approved', to: 'superseded' }]), status: 'superseded' }))
  assert.deepEqual(superseded.floor, { ok: false, why: 'missing' })
  const line = renderPolicyLine(digests)
  assert.ok(line !== undefined)
  assert.deepEqual(policyStaleness(line, gone), [{ id: 'gate', change: 'missing', from: digest12(digests.gate) }])
})

test('rules: the absent file, the empty file and a real file are comparable, and absent and empty do not drift', () => {
  const absent = digestsOf(graph(), { kind: 'absent' })
  const empty = digestsOf(graph(), { kind: 'text', text: '' })
  assert.deepEqual(empty.rules, absent.rules, 'the absent file and the empty file are the same stable digest')
  const real = digestsOf(graph(), { kind: 'text', text: '{"version":2,"rules":{}}\n' })
  assert.notEqual(digest12(real.rules), digest12(absent.rules))
  const line = renderPolicyLine(absent)
  assert.ok(line !== undefined)
  assert.deepEqual(policyStaleness(line, empty), [], 'absent to empty reports nothing')
  assert.deepEqual(policyStaleness(line, real).map(change => change.id), ['rules'], 'absent to real reports rules only')
  // Unreadable: both sides unreadable reports nothing; one side reports it.
  const unreadable = digestsOf(graph(), { kind: 'unreadable' })
  assert.deepEqual(unreadable.rules, { ok: false, why: 'unreadable' })
  assert.deepEqual(policyStaleness(renderPolicyLine(unreadable), unreadable), [], 'the class the dispatch could not read reports nothing when it still cannot be read')
  assert.deepEqual(policyStaleness(line, unreadable), [{ id: 'rules', change: 'unreadable', from: digest12(absent.rules) }])
})

test('one class\'s change reports that class only, in class order', () => {
  const digests = digestsOf(graph())
  const line = renderPolicyLine(digests)
  assert.ok(line !== undefined)
  const moved = digestsOf(withNode(withNode(graph(), node({ id: 'norm-review-floor', type: 'norm', acceptance: ['碰到必须全审：`files src/guard/`', '动了删除：`deletes`'] }, 0, 'human')), node({ id: 'tool-1', type: 'tool', parent: 'env', title: 'the checker', acceptance: ['config site/ruff.toml'] }, 0)))
  const changes = policyStaleness(line, moved)
  assert.deepEqual(changes.map(change => change.id), ['floor', 'checker'])
  for (const change of changes) assert.equal(change.change, 'changed')
})

test('the policy line renders in class order and reads back; a line anywhere in the text is found, the last one wins', () => {
  const digests = digestsOf(graph())
  const line = renderPolicyLine(digests)
  assert.ok(line !== undefined)
  assert.match(line, /^policy: gate@[0-9a-f]{12} floor@[0-9a-f]{12} rules@[0-9a-f]{12} checker@[0-9a-f]{12}$/)
  assert.deepEqual(parsePolicyLine(line), {
    gate: digest12(digests.gate),
    floor: digest12(digests.floor),
    rules: digest12(digests.rules),
    checker: digest12(digests.checker),
  })
  // The line sits between other lines (the pins line comes after it).
  const between = `第 1 次派发 · hz-t-a1-000000\n${line}\npins: task-1@000000000000`
  assert.deepEqual(parsePolicyLine(between), parsePolicyLine(line))
  assert.equal(parsePolicyLine(`${line}\npolicy: gate@111111111111`)?.gate, '111111111111')
  // A class that could not digest renders no segment, and parses back as absent.
  const noGate: PolicyDigests = { ...digests, gate: { ok: false, why: 'missing' } }
  const shorter = renderPolicyLine(noGate)
  assert.equal(shorter, `policy: floor@${digest12(digests.floor)} rules@${digest12(digests.rules)} checker@${digest12(digests.checker)}`)
  assert.deepEqual(Object.keys(parsePolicyLine(shorter) ?? {}), ['floor', 'rules', 'checker'])
})

test('the parser tolerates stray whitespace; a class the line omits reads as changed (fail closed); no line at all exempts', () => {
  const digests = digestsOf(graph())
  const first = digest12(digests.gate)
  assert.deepEqual(parsePolicyLine(`  policy:   gate@${first}   floor@aaaaaaaaaaaa`), { gate: first, floor: 'aaaaaaaaaaaa' })
  // One malformed word leaves its class out; the others still read.
  const sloppy = parsePolicyLine(`policy: gate@nothex floor@${digest12(digests.floor)}`)
  assert.deepEqual(Object.keys(sloppy ?? {}), ['floor'])
  const line = renderPolicyLine(digests)
  assert.ok(line !== undefined)
  assert.ok(parsePolicyLine(line)?.floor !== undefined)
  // A line a hand shortened: every class it omits and that computes now reports changed.
  const gateOnly = `policy: gate@${first}`
  assert.deepEqual(policyStaleness(gateOnly, digests).map(change => change.id), ['floor', 'rules', 'checker'])
  // No policy line at all: the dispatch predates the digest, exempt.
  assert.deepEqual(policyStaleness(undefined, digests), [])
})

test('the 政策差 line round-trips, tolerates fullwidth commas and reads back in class order', () => {
  assert.equal(renderPolicyDrift(['floor']), '政策差：floor')
  assert.equal(renderPolicyDrift(['gate', 'rules']), '政策差：gate, rules')
  assert.deepEqual(parsePolicyDrift('第 1 次交回 · done · hz-t-a1-000000\n政策差：floor'), ['floor'])
  assert.deepEqual(parsePolicyDrift('政策差：rules, gate'), ['gate', 'rules'], 'class order, not line order')
  assert.deepEqual(parsePolicyDrift('政策差：floor，checker'), ['floor', 'checker'])
  assert.equal(parsePolicyDrift('第 1 次交回 · done · hz-t-a1-000000'), undefined)
  assert.equal(parsePolicyDrift('政策差：'), undefined)
  assert.equal(parsePolicyDrift('政策差：something else'), undefined)
})
