/**
 * The rules board's model (docs/ORCHESTRATION.md §16): which level applies,
 * the words that name a level, the one serialization every digest is taken
 * over, the file in the repository, and the check of a state.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalJson, DEFAULT_PEAK_LEVEL, diffRepo, effectivePeakMode, emptyState, parsePeakLevel, parseRepoRules, repoJson, repoPart, stateFromRepo, stateProblem, type PeakModeSetting, type ProjectState } from '../src/rules/model.ts'

const CHOSEN: PeakModeSetting = { level: 'stop', at: '2026-10-30T01:00:00.000Z', origin: { actor: 'human' } }

test('a project that never chose has the factory level reduce, and any choice, even reduce, counts as the person\'s', () => {
  assert.equal(DEFAULT_PEAK_LEVEL, 'reduce')
  assert.deepEqual(effectivePeakMode({}), { level: 'reduce', origin: 'default' })
  assert.deepEqual(effectivePeakMode({ peakMode: CHOSEN }), { level: 'stop', origin: 'human', at: CHOSEN.at })
  assert.deepEqual(effectivePeakMode({ peakMode: { ...CHOSEN, level: 'reduce' } }), { level: 'reduce', origin: 'human', at: CHOSEN.at })
})

test('a level is named by its Chinese name or its stored value, nothing else', () => {
  assert.deepEqual(['无影响', '少做', '不做'].map(parsePeakLevel), ['inform', 'reduce', 'stop'])
  assert.deepEqual(['inform', 'reduce', 'stop', ' STOP ', ' 少做 '].map(parsePeakLevel), ['inform', 'reduce', 'stop', 'stop', 'reduce'])
  assert.deepEqual(['', '多做', 'off', '少做一点'].map(parsePeakLevel), [undefined, undefined, undefined, undefined])
})

test('one content has one serialization: keys in code point order, no whitespace, absent fields dropped', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: undefined } }), '{"a":{"d":[3,{"x":2,"y":1}]},"b":1}')
  assert.equal(canonicalJson({ '𝒜': 1, 'z': 2, 'a': 3 }), '{"a":3,"z":2,"𝒜":1}', 'a code point beyond the BMP sorts after z')
  const shuffled = { unresolved: {}, repo: { digest: null }, seq: 0, version: 2 }
  assert.equal(canonicalJson(shuffled), canonicalJson(emptyState()))
})

test('the rules file reads in git: sorted keys, two spaces, a final newline, the same text for the same content', () => {
  assert.equal(repoPart(emptyState()), undefined, 'nothing is decided: no file')
  const state: ProjectState = { ...emptyState(), peakMode: CHOSEN }
  const part = repoPart(state)
  assert.ok(part !== undefined)
  const text = repoJson(part)
  assert.equal(text, [
    '{',
    '  "peakMode": {',
    '    "at": "2026-10-30T01:00:00.000Z",',
    '    "level": "stop",',
    '    "origin": {',
    '      "actor": "human"',
    '    }',
    '  },',
    '  "version": 2',
    '}',
    '',
  ].join('\n'))
  assert.equal(repoJson({ version: 2, peakMode: { origin: { actor: 'human' }, level: 'stop', at: CHOSEN.at } }), text)
})

test('the rules file is read back only if it is exactly the board\'s shape', () => {
  const part = repoPart({ ...emptyState(), peakMode: CHOSEN })
  assert.ok(part !== undefined)
  const parsed = parseRepoRules(repoJson(part))
  assert.ok(parsed.ok)
  assert.deepEqual(parsed.repo, part)
  assert.deepEqual(parseRepoRules('{ "version": 2 }'), { ok: true, repo: { version: 2 } })
  const refused = (text: string): string => {
    const result = parseRepoRules(text)
    assert.equal(result.ok, false, text)
    return result.ok ? '' : result.reason
  }
  assert.equal(refused('not json'), '不是 JSON')
  assert.equal(refused('[]'), '最外层不是对象')
  assert.match(refused('{ "version": 1 }'), /version/)
  assert.match(refused('{ "version": 2, "rules": {} }'), /rules\.rules is not a field/)
  assert.match(refused(JSON.stringify({ version: 2, peakMode: { ...CHOSEN, level: 'sometimes' } })), /level/)
  assert.match(refused(JSON.stringify({ version: 2, peakMode: { ...CHOSEN, at: 'yesterday' } })), /\bat\b/)
  assert.match(refused(JSON.stringify({ version: 2, peakMode: { ...CHOSEN, origin: { actor: 'detector' } } })), /actor/)
})

test('a state is checked field by field, and an unknown field is not a state', () => {
  assert.equal(stateProblem(emptyState()), undefined)
  assert.equal(stateProblem({ ...emptyState(), seq: 3, peakMode: CHOSEN, repo: { digest: '0123456789abcdef' } }), undefined)
  assert.match(stateProblem({ ...emptyState(), version: 1 }) ?? '', /version/)
  assert.match(stateProblem({ ...emptyState(), seq: -1 }) ?? '', /seq/)
  assert.match(stateProblem({ ...emptyState(), root: 'C:/x' }) ?? '', /state\.root is not a field/)
  assert.match(stateProblem({ ...emptyState(), repo: { digest: 'short' } }) ?? '', /repo\.digest/)
  assert.match(stateProblem({ ...emptyState(), unresolved: { 'not-hex': {} } }) ?? '', /unresolved/)
  assert.match(stateProblem({ ...emptyState(), recovered: { at: '2026-10-30T01:00:00.000Z', reason: 'boredom', lost: false } }) ?? '', /reason/)
  assert.match(stateProblem('state') ?? '', /object/)
})

test('the difference between the file and the state is named per decided item', () => {
  const state: ProjectState = { ...emptyState(), peakMode: CHOSEN }
  assert.deepEqual(diffRepo(state, { version: 2, peakMode: CHOSEN }), [])
  assert.deepEqual(diffRepo(state, { version: 2 }), [{ path: ['peakMode'], change: 'removed' }])
  assert.deepEqual(diffRepo(emptyState(), { version: 2, peakMode: CHOSEN }), [{ path: ['peakMode'], change: 'added' }])
  assert.deepEqual(diffRepo(state, { version: 2, peakMode: { ...CHOSEN, level: 'inform' } }), [{ path: ['peakMode'], change: 'changed', fields: ['level'] }])
})

test('a project that starts from the rules file has the decision, a first sequence number and nothing unresolved', () => {
  const state = stateFromRepo({ version: 2, peakMode: CHOSEN }, '0123456789abcdef')
  assert.deepEqual(state, { version: 2, seq: 1, peakMode: CHOSEN, repo: { digest: '0123456789abcdef' }, unresolved: {} })
  assert.equal(stateProblem(state), undefined)
})
