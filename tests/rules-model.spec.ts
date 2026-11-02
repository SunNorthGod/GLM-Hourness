/**
 * The rules board's model (docs/ORCHESTRATION.md §16): which level applies,
 * the words that name a level, the one serialization every digest is taken
 * over, the file in the repository, and the check of a state.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { adoptRepo, canonicalJson, DEFAULT_PEAK_LEVEL, diffRepo, effectivePeakMode, effectOf, emptyState, parsePeakLevel, parseRepoRules, repoJson, repoPart, stateFromRepo, stateProblem, unapprovedScripts, validateRule, withoutEmptyCollections, type Notice, type PeakModeSetting, type ProjectState, type RepoRules, type RowState, type Ticket } from '../src/rules/model.ts'
import type { HealthState } from '../src/shared/health.ts'
import { contextOf, draftOf, FULL_RULES_FILE, NOW, ruleOf, scriptRef, SHA, SHA_OTHER } from './rules-fixtures.ts'

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
  const shuffled = { repo: { digest: null }, seq: 0, version: 2 }
  assert.equal(canonicalJson(shuffled), canonicalJson(emptyState()))
})

test('a collection that is empty is absent from what is stored: the state, and the rules file', () => {
  assert.deepEqual(emptyState(), { version: 2, seq: 0, repo: { digest: null } }, 'the state of a project nobody wrote to has no unresolved collection')
  assert.deepEqual(withoutEmptyCollections({ version: 2, rules: {}, tickets: { 'q-1': { id: 'q-1' } }, peakMode: CHOSEN, list: [], repo: { digest: null } }), { version: 2, tickets: { 'q-1': { id: 'q-1' } }, peakMode: CHOSEN, list: [], repo: { digest: null } }, 'only an empty object goes: not a filled one, an array or a value')
  const extra = { rules: {}, detectors: {}, signals: {}, scripts: {} }
  const decided = { version: 2 as const, peakMode: CHOSEN }
  assert.equal(repoJson({ ...decided, ...extra }), repoJson(decided), 'the full board\'s empty collections change neither the file nor its digest')
  assert.notEqual(repoJson({ ...decided, rules: { 'r-1': {} } } as unknown as RepoRules), repoJson(decided), 'a collection with an entry is part of the file')
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
  assert.deepEqual(parseRepoRules('{ "version": 2, "rules": {} }'), { ok: true, repo: { version: 2, rules: {} } }, 'a collection with nothing in it is the full board\'s empty collection, not a mistake')
  assert.match(refused('{ "version": 2, "proposals": {} }'), /rules\.proposals is not a field/)
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
  assert.match(stateProblem({ ...emptyState(), unresolved: 'none' }) ?? '', /state\.unresolved must be an object/)
  assert.equal(stateProblem({ ...emptyState(), unresolved: {} }), undefined, 'an empty collection is not an error: it digests as absent')
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
  assert.deepEqual(state, { version: 2, seq: 1, peakMode: CHOSEN, repo: { digest: '0123456789abcdef' } })
  assert.equal(stateProblem(state), undefined)
})

// ------------------------------------------------------------ the full stored shape (design §7.2, §7.5)

const FILE_DIGEST = '0123456789abcdef'
const TICKET: Ticket = {
  id: 'q-1',
  state: 'deferred',
  rules: ['r-no-evening-push'],
  sessionId: 's-1',
  agentLabel: 'main',
  host: { pid: 100, startedAt: 1_700_000_000_000 },
  signature: 'abcdef012345',
  tool: 'pwsh',
  summary: 'git push origin main',
  since: '2026-11-04T07:00:00.000Z',
}
const NOTICE: Notice = { kind: 'late-block', rule: 'r-lint-gate', text: 'The lint script finished late and blocks the merge.', at: '2026-11-04T07:05:00.000Z' }
const fromFile = (): ProjectState => stateFromRepo(FULL_RULES_FILE, FILE_DIGEST)
const pinOf = (state: ProjectState, id: string): NonNullable<ProjectState['scripts']>[string] => {
  const pin = state.scripts?.[id]
  assert.ok(pin !== undefined, `${id} has a pin`)
  return pin
}
const approve = (state: ProjectState, id: string): ProjectState => ({ ...state, scripts: { ...state.scripts, [id]: { ...pinOf(state, id), approvedAt: '2026-10-30T03:00:00.000Z' } } })

/** The same content with the keys of every object in the other order. */
function reversed(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reversed)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(Object.entries(value).reverse().map(([key, field]) => [key, reversed(field)]))
}

test('a project that starts from a file of everything a person decided has all of it, no approval for any script, and the file\'s digest', () => {
  const state = fromFile()
  assert.equal(stateProblem(state), undefined)
  assert.deepEqual(Object.keys(state.rules ?? {}).sort(), ['r-lint-gate', 'r-no-evening-push'])
  assert.deepEqual(Object.keys(state.signals ?? {}).sort(), ['code-freeze', 'server-errors-5m'])
  assert.deepEqual(Object.keys(state.detectors ?? {}), ['d-server-errors'])
  assert.deepEqual([state.seq, state.repo, state.peakMode?.level], [1, { digest: FILE_DIGEST }, 'stop'])
  assert.deepEqual(state.scripts, FULL_RULES_FILE.scripts)
  for (const pin of Object.values(state.scripts ?? {})) assert.equal('approvedAt' in pin, false, 'a pin that came with the file is not an approval')
  for (const absent of ['tickets', 'notices', 'nextTicket', 'unresolved', 'recovered'] as const) assert.equal(absent in state, false, `${absent} is the runtime's, not the file's`)
  assert.deepEqual(repoPart(state), FULL_RULES_FILE, 'what the state exports is what it started from')
})

test('what belongs to a session or to the runtime never goes to the rules file', () => {
  const session = ruleOf({ id: 'r-session-only', scope: 'session', sessionId: 's-1', lifetime: { kind: 'session' } })
  const base = fromFile()
  const state: ProjectState = {
    ...base,
    seq: 9,
    rules: { ...base.rules, 'r-session-only': session },
    signals: { ...base.signals, 'server-errors-5m': { type: { kind: 'number', unit: 'errors' }, detector: 'd-server-errors', detected: { value: 4, since: '2026-11-04T07:00:00.000Z' } } },
    tickets: { 'q-1': TICKET },
    nextTicket: 2,
    notices: { 'n-1': NOTICE },
    recovered: { at: '2026-11-04T07:00:00.000Z', reason: 'snapshot-corrupt', lost: false },
  }
  assert.equal(stateProblem(state), undefined)
  assert.deepEqual(repoPart(state), FULL_RULES_FILE)
  assert.equal(repoJson(repoPart(state)!).includes('r-session-only'), false)
})

test('the rules file reads the same whatever order the keys were written in: sorted keys, two spaces, a final newline, no empty collection', () => {
  const text = repoJson(FULL_RULES_FILE)
  assert.equal(repoJson(reversed(FULL_RULES_FILE) as RepoRules), text)
  assert.equal(repoJson({ ...(reversed(FULL_RULES_FILE) as RepoRules), tickets: {}, notices: {} } as RepoRules), text, 'empty collections of the runtime change nothing')
  assert.ok(text.startsWith('{\n  "detectors": {\n    "d-server-errors": {\n'), 'collections in key order, two spaces')
  assert.ok(text.endsWith('\n  "version": 2\n}\n'))
  assert.equal(text.split('\n').filter(line => /^\t/.test(line)).length, 0)
  const parsed = parseRepoRules(text)
  assert.ok(parsed.ok)
  assert.deepEqual(parsed.repo, FULL_RULES_FILE)
  assert.equal(repoJson(parsed.repo), text, 'writing what was read gives the same text')
})

test('a rules file is read only if every entry of it is sound; what a person cannot have decided is refused with the field', () => {
  type Json = { [key: string]: unknown }
  /** The file with each `[path, value]` put in place (an undefined value deletes), as the text a hand edit leaves. */
  const refused = (...edits: ReadonlyArray<readonly [readonly string[], unknown]>): string => {
    const file = JSON.parse(JSON.stringify(FULL_RULES_FILE)) as Json
    for (const [path, value] of edits) {
      const parent = path.slice(0, -1).reduce<Json>((node, key) => node[key] as Json, file)
      const last = path.at(-1) ?? ''
      if (value === undefined) delete parent[last]
      else parent[last] = value
    }
    const result = parseRepoRules(JSON.stringify(file))
    assert.equal(result.ok, false)
    return result.ok ? '' : result.reason
  }
  const push = ['rules', 'r-no-evening-push'] as const
  assert.match(refused([[...push, 'scope'], 'session'], [[...push, 'sessionId'], 's-1']), /scope/)
  assert.match(refused([[...push, 'action'], { kind: 'explode' }]), /action/)
  assert.match(refused([[...push, 'status'], 'sleeping']), /status/)
  assert.match(refused([[...push, 'origin'], undefined]), /origin/)
  assert.match(refused([['rules', 'r-other'], FULL_RULES_FILE.rules?.['r-no-evening-push']]), /r-other\.id/)
  assert.match(refused([['scripts', 'r-lint-gate', 'approvedAt'], '2026-10-30T03:00:00.000Z']), /rules\.scripts\.r-lint-gate\.approvedAt is not a field/)
  assert.match(refused([['scripts', 'r-lint-gate', 'sha256'], 'short']), /sha256/)
  assert.match(refused([['signals', 'code-freeze', 'manual', 'value'], 'yes']), /code-freeze\.manual/)
  assert.match(refused([['signals', 'server-errors-5m', 'detected'], { value: 1, since: '2026-11-04T07:00:00.000Z' }]), /detected is not a field/)
  assert.match(refused([['detectors', 'd-server-errors', 'action', 'kind'], 'block']), /action/)
  assert.match(refused([['detectors', 'd-server-errors', 'when'], { kind: 'every', seconds: 59 }]), /when/)
  assert.match(refused([['tickets'], {}]), /rules\.tickets is not a field/)
  assert.match(refused([['proposals'], {}]), /rules\.proposals is not a field/)
})

test('a stored rule is checked for its shape, not for the moment or the project: an expired time to live, a signal nobody defines and more than fifty rules are kept as they are', () => {
  const parse = (file: RepoRules): boolean => parseRepoRules(repoJson(file)).ok
  const stale = ruleOf({ id: 'r-stale', lifetime: { kind: 'ttl', expiresAt: '2020-01-01T00:00:00.000Z' }, status: 'expired', condition: { signal: 'gone-signal', is: true } })
  assert.equal(parse({ version: 2, rules: { 'r-stale': stale } }), true)
  const many = Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`r-${index}`, ruleOf({ id: `r-${index}` })]))
  assert.equal(parse({ version: 2, rules: many }), true)
  assert.equal(parse({ version: 2, rules: { 'r-stale': { ...stale, condition: { signal: 'gone-signal', is: true, above: 3 } } } }), false, 'the comparison itself is still checked')
})

test('a state is checked entry by entry for the collections of the full board; proposals are not part of it', () => {
  const full: ProjectState = { ...fromFile(), seq: 3, tickets: { 'q-1': TICKET }, nextTicket: 2, notices: { 'n-1': NOTICE } }
  assert.equal(stateProblem(full), undefined)
  const bad = (change: Partial<ProjectState> | Record<string, unknown>): string => stateProblem({ ...full, ...change }) ?? ''
  assert.match(bad({ proposals: {} }), /state\.proposals is not a field/)
  assert.match(bad({ nextTicket: -1 }), /nextTicket/)
  assert.match(bad({ tickets: { 'q-1': { ...TICKET, state: 'lost' } } }), /tickets\.q-1\.state/)
  assert.match(bad({ tickets: { 'q-2': TICKET } }), /tickets\.q-2\.id/)
  assert.match(bad({ tickets: { 'q-1': { ...TICKET, host: { pid: 'x', startedAt: 1 } } } }), /host/)
  assert.match(bad({ notices: { 'n-1': { ...NOTICE, kind: 'rumour' } } }), /notices\.n-1\.kind/)
  assert.match(bad({ scripts: { 'r-lint-gate': { ...scriptRef('r-lint-gate'), approvedAt: 'long ago' } } }), /approvedAt/)
  assert.match(bad({ rules: { 'r-x': ruleOf({ id: 'r-no-evening-push' }) } }), /rules\.r-x\.id/)
  assert.match(bad({ signals: { 'code-freeze': { type: { kind: 'boolean' }, manual: { value: 3, at: '2026-10-30T02:00:00.000Z' } } } }), /signals\.code-freeze\.manual/)
  assert.match(bad({ detectors: { 'd-server-errors': { ...(full.detectors ?? {})['d-server-errors'], status: 'gone' } } }), /detectors\.d-server-errors\.status/)
  assert.equal(stateProblem({ ...full, rules: {}, signals: {}, detectors: {}, tickets: {}, scripts: {}, notices: {} }), undefined, 'the empty collections of the full board digest as absent')
})

test('the difference between the file and the state names each decided entry, in the order the file lists them', () => {
  const state = fromFile()
  assert.deepEqual(diffRepo(state, FULL_RULES_FILE), [])
  const file: RepoRules = {
    ...FULL_RULES_FILE,
    peakMode: { ...FULL_RULES_FILE.peakMode!, level: 'inform' },
    rules: { 'r-no-evening-push': { ...FULL_RULES_FILE.rules!['r-no-evening-push'], reason: 'Edited by hand.', title: 'Edited' }, 'r-new': ruleOf({ id: 'r-new' }) },
    signals: { 'code-freeze': { type: { kind: 'boolean' }, description: 'Nobody merges' }, 'server-errors-5m': FULL_RULES_FILE.signals!['server-errors-5m'] },
    scripts: { 'r-lint-gate': scriptRef('r-lint-gate', SHA_OTHER), 'd-server-errors': scriptRef('d-server-errors', SHA_OTHER) },
  }
  delete (file as { detectors?: unknown }).detectors
  assert.deepEqual(diffRepo(state, file), [
    { path: ['detectors', 'd-server-errors'], change: 'removed' },
    { path: ['peakMode'], change: 'changed', fields: ['level'] },
    { path: ['rules', 'r-lint-gate'], change: 'removed' },
    { path: ['rules', 'r-new'], change: 'added' },
    { path: ['rules', 'r-no-evening-push'], change: 'changed', fields: ['reason', 'title'] },
    { path: ['scripts', 'r-lint-gate'], change: 'changed', fields: ['sha256'] },
    { path: ['signals', 'code-freeze'], change: 'changed', fields: ['manual'] },
  ])
  assert.deepEqual(diffRepo({ ...state, tickets: { 'q-1': TICKET }, rules: { ...state.rules, 'r-session': ruleOf({ id: 'r-session', scope: 'session', sessionId: 's-1', lifetime: { kind: 'session' } }) } }, FULL_RULES_FILE), [], 'the runtime and the sessions are not compared with a file that cannot hold them')
})

test('adopting a file replaces what a person decided, keeps what the runtime holds and the approvals of scripts that did not change', () => {
  const approved = approve(approve({ ...fromFile(), seq: 7 }, 'r-lint-gate'), 'd-server-errors')
  const session = ruleOf({ id: 'r-session-only', scope: 'session', sessionId: 's-1', lifetime: { kind: 'session' } })
  const state: ProjectState = {
    ...approved,
    rules: { ...approved.rules, 'r-session-only': session },
    signals: { ...approved.signals, 'server-errors-5m': { type: { kind: 'number', unit: 'errors' }, detector: 'd-server-errors', detected: { value: 4, since: '2026-11-04T07:00:00.000Z' } } },
    tickets: { 'q-1': TICKET },
    nextTicket: 2,
    repo: { digest: '1111111111111111', outside: { digest: '2222222222222222', at: '2026-11-04T08:00:00.000Z', copy: 'x', diff: [] } },
  }
  const file: RepoRules = {
    version: 2,
    rules: {
      'r-lint-gate': { ...FULL_RULES_FILE.rules!['r-lint-gate'], action: { kind: 'script', script: scriptRef('r-lint-gate', SHA_OTHER), onError: 'block' } },
      'r-new-script': ruleOf({ id: 'r-new-script', action: { kind: 'script', script: scriptRef('r-new-script') } }),
    },
    signals: FULL_RULES_FILE.signals!,
    detectors: FULL_RULES_FILE.detectors!,
    scripts: { 'r-lint-gate': scriptRef('r-lint-gate', SHA_OTHER), 'r-new-script': scriptRef('r-new-script'), 'd-server-errors': scriptRef('d-server-errors', SHA_OTHER) },
  }
  const next = adoptRepo(state, file, '3333333333333333')
  assert.equal(stateProblem(next), undefined)
  assert.deepEqual([next.seq, next.repo], [7, { digest: '3333333333333333' }], 'the digest is the file\'s and the outside mark is cleared; the sequence is the engine\'s to set')
  assert.equal(next.peakMode, undefined, 'the file has none')
  assert.deepEqual(Object.keys(next.rules ?? {}).sort(), ['r-lint-gate', 'r-new-script', 'r-session-only'], 'the rule the file lacks is gone, the session\'s stays')
  assert.deepEqual(next.tickets, { 'q-1': TICKET })
  assert.equal(next.nextTicket, 2)
  assert.deepEqual(next.signals?.['server-errors-5m']?.detected, { value: 4, since: '2026-11-04T07:00:00.000Z' }, 'a measured value is the runtime\'s')
  assert.equal(next.scripts?.['d-server-errors']?.approvedAt, '2026-10-30T03:00:00.000Z', 'the same bytes, the same approval')
  assert.equal('approvedAt' in pinOf(next, 'r-lint-gate'), false, 'other bytes under the same name are not what was approved')
  assert.equal('approvedAt' in pinOf(next, 'r-new-script'), false)
  assert.deepEqual(unapprovedScripts(next).map(entry => [entry.id, entry.standing]), [['r-lint-gate', 'not-approved'], ['r-new-script', 'not-approved']])
})

test('a script can run only when its pin carries an approval for exactly the bytes the entry names', () => {
  const state = fromFile()
  assert.deepEqual(unapprovedScripts(state).map(entry => [entry.id, entry.standing]), [['d-server-errors', 'not-approved'], ['r-lint-gate', 'not-approved']], 'read from a file: listed, not approved')
  assert.equal(unapprovedScripts(state)[1]?.title, 'The trunk only moves when lint passes')
  assert.deepEqual(unapprovedScripts(approve(approve(state, 'r-lint-gate'), 'd-server-errors')), [])
  const { scripts, ...withoutPins } = approve(state, 'r-lint-gate')
  assert.deepEqual(unapprovedScripts(withoutPins).map(entry => [entry.id, entry.standing]), [['d-server-errors', 'no-pin'], ['r-lint-gate', 'no-pin']])
  const changed = approve(state, 'r-lint-gate')
  const swapped: ProjectState = { ...changed, scripts: { ...scripts, 'r-lint-gate': { ...pinOf(changed, 'r-lint-gate'), sha256: SHA_OTHER } } }
  assert.deepEqual(unapprovedScripts(swapped).filter(entry => entry.id === 'r-lint-gate').map(entry => entry.standing), ['changed'], 'the pin and the entry name different bytes')
  const lifted: ProjectState = { ...state, rules: { ...state.rules, 'r-lint-gate': { ...state.rules!['r-lint-gate'], status: 'lifted' } }, detectors: { 'd-server-errors': { ...state.detectors!['d-server-errors'], status: 'removed' } } }
  assert.deepEqual(unapprovedScripts(lifted), [], 'what is lifted or removed does not run, so it is not waiting for anything')
  assert.deepEqual(unapprovedScripts(emptyState()), [])
})

// ------------------------------------------------------------ rules (design §2.2, §2.3, §12)

/** The paths a rule is refused at, each once. */
const paths = (rule: unknown, context = contextOf()): string[] => [...new Set(validateRule(rule, context).map(issue => issue.path))]
const SCRIPT = { kind: 'script' as const, script: { file: 'docs/rules/scripts/r-no-evening-push.mjs', sha256: SHA, lang: 'node' as const } }

test('a rule in the 0.9 shape is sound; what is not an object or not a rule is refused', () => {
  assert.deepEqual(validateRule(draftOf(), contextOf()), [])
  assert.deepEqual(paths('a rule'), ['rule'])
  assert.deepEqual(paths(null), ['rule'])
  assert.deepEqual(paths([]), ['rule'])
})

test('id, title, reason, source and scope have the limits of design §12', () => {
  assert.deepEqual(['R-1', 'x-1', 'r-', `r-${'a'.repeat(47)}`, 'r-a_b'].map(id => paths(draftOf({ id }))), [['id'], ['id'], ['id'], ['id'], ['id']])
  assert.deepEqual(paths(draftOf({ id: `r-${'a'.repeat(46)}` })), [], '48 characters is the longest')
  assert.deepEqual(['', 'two\nlines', 'a'.repeat(121), 7].map(title => paths(draftOf({ title }))), [['title'], ['title'], ['title'], ['title']])
  assert.deepEqual(paths(draftOf({ title: 'a'.repeat(120) })), [])
  assert.deepEqual(['', 'a'.repeat(2001)].map(reason => paths(draftOf({ reason }))), [['reason'], ['reason']])
  assert.deepEqual(paths(draftOf({ reason: 'a'.repeat(2000) })), [])
  assert.deepEqual(paths(draftOf({ source: 'Not An Id' })), ['source'])
  assert.deepEqual(paths(draftOf({ source: 'rules' })), [])
  assert.deepEqual(paths(draftOf({ scope: 'machine' })), ['scope'])
  assert.deepEqual(paths(draftOf({ scope: 'builtin' })), ['scope'], 'builtin is the code\'s scope')
  assert.deepEqual(paths(draftOf({ scope: 'session' })), ['sessionId'], 'a session rule names its session')
  assert.deepEqual(paths(draftOf({ sessionId: 's-1' })), ['sessionId'], 'a project rule does not')
  assert.deepEqual(paths(draftOf({ scope: 'session', sessionId: 's-1' })), [])
  assert.deepEqual(paths(draftOf({ onUnknown: 'maybe' })), ['onUnknown'])
  assert.deepEqual(['skip', 'apply'].map(onUnknown => paths(draftOf({ onUnknown }))), [[], []])
})

test('the engine writes origin and status; the 0.8 fields are extra fields; the code-only flag is refused with its own sentence', () => {
  assert.deepEqual(paths(draftOf({ origin: { actor: 'human', at: NOW.toISOString() } })), ['origin'])
  assert.deepEqual(paths(draftOf({ status: 'active' })), ['status'])
  for (const key of ['effect', 'subjects', 'shadow', 'throttle', 'params', 'holdMs', 'history']) assert.deepEqual(paths(draftOf({ [key]: 1 })), [key], key)
  const flagged = validateRule(draftOf({ ticketPerSession: true }), contextOf())
  assert.deepEqual(flagged.map(issue => issue.path), ['ticketPerSession'])
  assert.match(flagged[0]?.message ?? '', /默认规则的高峰模式/)
  assert.deepEqual(paths(draftOf({ action: { kind: 'block', class: 'shell' } })), ['action.class'], 'the 0.8 action class is not a field of an action')
})

test('a rule listens to the rules board\'s own events: one to three gating events, or rules.step alone', () => {
  assert.deepEqual(paths(draftOf({ when: { kind: 'daily', time: '09:00', timeZone: 'Asia/Shanghai' } })), ['when'])
  assert.deepEqual(paths(draftOf({ when: 'gate.tool-call' })), ['when'])
  assert.deepEqual(paths(draftOf({ when: { kind: 'event', events: ['loops.file-changed'] } })), ['when.events'])
  assert.deepEqual(paths(draftOf({ when: { kind: 'event', events: [] } })), ['when.events'])
  assert.deepEqual(paths(draftOf({ when: { kind: 'event', events: ['gate.tool-call', 'gate.tool-call'] } })), ['when.events'])
  assert.deepEqual(paths(draftOf({ when: { kind: 'event', events: ['gate.tool-call', 'gate.dispatch', 'gate.trunk-advance', 'rules.step'] } })), ['when.events'])
  assert.deepEqual(paths(draftOf({ when: { kind: 'event', events: ['gate.tool-call', 'rules.step'] } })), ['when.events'], 'rules.step is listed alone')
  assert.deepEqual(paths(draftOf({ when: { kind: 'event', events: ['gate.tool-call', 'gate.dispatch', 'gate.trunk-advance'] }, filter: { role: { in: ['subagent'] } } })), [])
  assert.deepEqual(paths(draftOf({ when: { kind: 'event', events: ['gate.tool-call', 'gate.dispatch'] }, filter: { writes: { paths: ['src/'] } } })), ['filter.writes'], 'every listed event declares a filter key')
  assert.deepEqual(paths(draftOf({ when: { kind: 'event', events: ['rules.step'], params: { x: 1 } }, filter: undefined, condition: undefined, action: { kind: 'inform' } })), ['when.params.x'])
})

test('a filter key is a field every listed event declares, with the comparison it declares', () => {
  assert.deepEqual(paths(draftOf({ filter: { branch: { in: ['main'] } } })), ['filter.branch'], 'branch is gate.trunk-advance\'s')
  assert.deepEqual(paths(draftOf({ filter: { nested: { in: ['x'] } } })), ['filter.nested'])
  assert.deepEqual(paths(draftOf({ filter: { cwd: { in: ['x'] } } })), ['filter.cwd'], 'cwd is for scripts to read, not to filter')
  assert.deepEqual(paths(draftOf({ filter: { role: { in: ['admin'] } } })), ['filter.role'])
  assert.deepEqual(paths(draftOf({ filter: { role: { in: ['main-agent', 'root', 'subagent'] }, nested: { is: false }, tool: { in: ['pwsh'] } } })), [])
  assert.deepEqual(paths(draftOf({ when: { kind: 'event', events: ['gate.dispatch'] }, filter: { targetModel: { matches: '^[^/]*/glm' }, task: { in: ['t-1'] } }, action: { kind: 'queue' } })), [])
  assert.deepEqual(paths(draftOf({ filter: { targetModel: { matches: 'glm' } } })), ['filter.targetModel'], 'targetModel is gate.dispatch\'s')
  assert.deepEqual(paths(draftOf({ when: { kind: 'event', events: ['rules.step'] }, filter: { tool: { in: ['pwsh'] } }, condition: undefined, action: { kind: 'inform' } })), ['filter.tool'])
})

test('a command pattern is compiled, bounded and probed when it is written (the shared matches check)', () => {
  assert.deepEqual(paths(draftOf({ filter: { command: { matches: 'x'.repeat(301) } } })), ['filter.command'])
  assert.deepEqual(paths(draftOf({ filter: { command: { matches: '(' } } })), ['filter.command'])
  assert.deepEqual(paths(draftOf({ filter: { command: { matches: '(a+)+$' } } })), ['filter.command'], 'a pattern that backtracks is too slow')
  assert.deepEqual(paths(draftOf({ filter: { command: { matches: '\\b(ssh|scp|rsync)\\b.*\\bprod-db-01\\b' } } })), [])
})

test('model patterns: at most 10 exact ids of two non-empty parts; a pattern is the 0.9 form of */glm*', () => {
  const ids = (count: number): string[] => Array.from({ length: count }, (_, index) => `p/m${index}`)
  assert.deepEqual(paths(draftOf({ filter: { model: { in: ids(10) } } })), [])
  assert.deepEqual(paths(draftOf({ filter: { model: { in: ids(11) } } })), ['filter.model'])
  assert.deepEqual(['glm-4.6', 'zai/', '/glm', ''].map(id => paths(draftOf({ filter: { model: { in: [id] } } }))), [['filter.model'], ['filter.model'], ['filter.model'], ['filter.model']])
  assert.deepEqual(paths(draftOf({ filter: { model: { in: ['openrouter/z-ai/glm-4.6'] } } })), [], 'the model part may hold slashes')
  assert.deepEqual(paths(draftOf({ filter: { model: { matches: '^[^/]*/glm' } } })), [])
})

test('write targets are relative, slash-separated, without .., and only * and ** are wildcards; tools are at most 20 names', () => {
  assert.deepEqual(paths(draftOf({ filter: { writes: { paths: ['src/**/*.ts', 'docs/', 'migrations/**', 'a.json'] } } })), [])
  for (const bad of ['/etc/x', 'C:/x', '..\\x', '../x', 'a/../b', 'src\\x', 'src/?.ts', 'src/[ab].ts', 'src/{a,b}.ts', '']) {
    assert.deepEqual(paths(draftOf({ filter: { writes: { paths: [bad] } } })), ['filter.writes'], bad)
  }
  assert.deepEqual(paths(draftOf({ filter: { writes: { paths: Array.from({ length: 21 }, (_, index) => `d${index}/`) } } })), ['filter.writes'])
  assert.deepEqual(paths(draftOf({ filter: { tool: { in: Array.from({ length: 20 }, (_, index) => `t${index}`) } } })), [])
  assert.deepEqual(paths(draftOf({ filter: { tool: { in: Array.from({ length: 21 }, (_, index) => `t${index}`) } } })), ['filter.tool'])
  assert.deepEqual(paths(draftOf({ filter: { tool: { in: ['t'.repeat(65)] } } })), ['filter.tool'])
})

test('glmSpend filters belong to the code\'s entries; a person\'s rule that names one is refused', () => {
  const spend = draftOf({ filter: { glmSpend: { in: ['optional'] } }, action: { kind: 'queue' } })
  const refused = validateRule(spend, contextOf())
  assert.deepEqual(refused.map(issue => issue.path), ['filter.glmSpend'])
  assert.match(refused[0]?.message ?? '', /默认规则的高峰模式/)
  assert.ok(paths(draftOf({ filter: { glmSpend: { in: ['sometimes'] } }, action: { kind: 'queue' } }), contextOf({ code: true })).includes('filter.glmSpend'), 'the values are optional and necessary')
  assert.equal(paths(spend, contextOf({ code: true })).includes('filter.glmSpend'), false, 'code may filter on what a script reports')
})

test('events and actions go together as the action table says: rules.step only informs, a gating event never informs, a write is never deferred', () => {
  const step = { when: { kind: 'event', events: ['rules.step'] }, filter: undefined, condition: undefined }
  assert.deepEqual(paths(draftOf({ ...step, action: { kind: 'inform' } })), [])
  for (const kind of ['block', 'queue', 'record']) assert.deepEqual(paths(draftOf({ ...step, action: { kind } })), ['action'], `${kind} on rules.step is a rule with no action to block`)
  assert.deepEqual(paths(draftOf({ ...step, action: SCRIPT })), ['action'])
  assert.deepEqual(paths(draftOf({ action: { kind: 'inform' } })), ['action'], 'a gating event never only informs')
  for (const kind of ['block', 'queue', 'record']) assert.deepEqual(paths(draftOf({ action: { kind } })), [], kind)
  for (const event of ['gate.dispatch', 'gate.trunk-advance']) assert.deepEqual(paths(draftOf({ when: { kind: 'event', events: [event] }, filter: undefined, action: { kind: 'queue' } })), [], event)
  assert.deepEqual(paths(draftOf({ action: { kind: 'queue' }, filter: { writes: { paths: ['src/'] } } })), ['action'], 'a deferred write may rest on a file that has changed')
  assert.deepEqual(paths(draftOf({ action: { kind: 'block' }, filter: { writes: { paths: ['src/'] } } })), [])
  assert.deepEqual(paths(draftOf({ action: { kind: 'record' }, filter: { writes: { paths: ['src/'] } } })), [])
  assert.deepEqual(paths(draftOf({ action: { kind: 'measure' } })), ['action.kind'], 'measure belongs to detectors')
  assert.deepEqual(paths(draftOf({ action: { kind: 'explode' } })), ['action.kind'])
  assert.deepEqual(paths(draftOf({ action: 'block' })), ['action'])
})

test('a script action: the reference points at the rule\'s own script file, the timeout and the failure setting have the gate ranges', () => {
  const script = (over: Record<string, unknown>): Record<string, unknown> => draftOf({ action: { ...SCRIPT, ...over } })
  assert.deepEqual(paths(draftOf({ action: SCRIPT })), [])
  assert.deepEqual(paths(draftOf({ action: SCRIPT, filter: { writes: { paths: ['migrations/**'] } } })), [], 'a script may judge a write: exit 3 then blocks')
  assert.deepEqual(paths(script({ timeoutSeconds: 30, onError: 'block' })), [])
  assert.deepEqual([0, 31, 1.5, '5'].map(timeoutSeconds => paths(script({ timeoutSeconds }))), [['action.timeoutSeconds'], ['action.timeoutSeconds'], ['action.timeoutSeconds'], ['action.timeoutSeconds']])
  assert.deepEqual(paths(script({ onError: 'maybe' })), ['action.onError'])
  assert.deepEqual(paths(script({ script: { ...SCRIPT.script, sha256: 'abc' } })), ['action.script.sha256'])
  assert.deepEqual(paths(script({ script: { ...SCRIPT.script, sha256: 'A'.repeat(64) } })), ['action.script.sha256'], 'lower-case hex')
  assert.deepEqual(paths(script({ script: { ...SCRIPT.script, lang: 'perl' } })), ['action.script.lang'])
  for (const file of ['docs/rules/scripts/other.mjs', 'docs/rules/scripts/r-no-evening-push.sh', '../scripts/r-no-evening-push.mjs', '/abs/scripts/r-no-evening-push.mjs', 'docs\\rules\\scripts\\r-no-evening-push.mjs', 'scripts/../x/r-no-evening-push.mjs']) {
    assert.deepEqual(paths(script({ script: { ...SCRIPT.script, file } })), ['action.script.file'], file)
  }
  assert.deepEqual(paths(script({ script: { ...SCRIPT.script, file: 'tools/rules/scripts/r-no-evening-push.mjs' } })), [], 'the rules directory is configurable: only its scripts/ folder and the file name are fixed')
  assert.deepEqual(paths(script({ script: { ...SCRIPT.script, extra: 1 } })), ['action.script.extra'])
})

test('a condition names defined signals with values of their type, in at most 5 levels and 20 leaves', () => {
  const leaf = { signal: 'code-freeze', is: true }
  assert.deepEqual(paths(draftOf({ condition: leaf })), [])
  assert.deepEqual(paths(draftOf({ condition: { signal: 'glm-peak', is: true } })), [], 'glm-peak is defined by the host')
  assert.deepEqual(paths(draftOf({ condition: { signal: 'nope', is: true } })), ['condition.signal'])
  assert.deepEqual(paths(draftOf({ condition: { all: [leaf, { signal: 'nope', is: true }] } })), ['condition.all[1].signal'])
  assert.deepEqual(paths(draftOf({ condition: { signal: 'server-errors-5m', above: 0 } })), [])
  assert.deepEqual(paths(draftOf({ condition: { signal: 'server-errors-5m', in: [1, 2] } })), [])
  assert.deepEqual(paths(draftOf({ condition: { signal: 'phase', in: ['build', 'ship'] } })), [])
  assert.deepEqual(paths(draftOf({ condition: { signal: 'code-freeze', known: true } })), [])
  assert.deepEqual(paths(draftOf({ condition: { signal: 'code-freeze', known: false } })), ['condition.known'])
  assert.deepEqual(paths(draftOf({ condition: { signal: 'code-freeze', above: 1 } })), ['condition.above'], 'a switch is not a number')
  assert.deepEqual(paths(draftOf({ condition: { signal: 'server-errors-5m', is: true } })), ['condition.is'])
  assert.deepEqual(paths(draftOf({ condition: { signal: 'server-errors-5m', below: '3' } })), ['condition.below'])
  assert.deepEqual(paths(draftOf({ condition: { signal: 'phase', is: 'dev' } })), ['condition.is'], 'the value is in the enum')
  assert.deepEqual(paths(draftOf({ condition: { signal: 'phase', in: [] } })), ['condition.in'])
  assert.deepEqual(paths(draftOf({ condition: { signal: 'code-freeze', is: true, known: true } })), ['condition'], 'one comparison per leaf')
  assert.deepEqual(paths(draftOf({ condition: { signal: 'code-freeze' } })), ['condition'])
  assert.deepEqual(paths(draftOf({ condition: { foo: 1 } })), ['condition'])
  assert.deepEqual(paths(draftOf({ condition: { all: [] } })), ['condition.all'])
  assert.deepEqual(paths(draftOf({ condition: { any: [leaf, leaf], not: leaf } })), ['condition'], 'one form per node')
  const nest = (levels: number): unknown => (levels === 0 ? leaf : { not: nest(levels - 1) })
  assert.deepEqual(paths(draftOf({ condition: nest(4) })), [], 'five levels counting the leaf')
  assert.equal(paths(draftOf({ condition: nest(5) }))[0]?.startsWith('condition'), true)
  assert.equal(paths(draftOf({ condition: nest(5) })).length, 1)
  assert.deepEqual(paths(draftOf({ condition: { all: Array.from({ length: 20 }, () => leaf) } })), [])
  assert.deepEqual(paths(draftOf({ condition: { all: Array.from({ length: 21 }, () => leaf) } })), ['condition'])
})

test('a clock condition: days 1-7, HH:MM bounds that differ, a zone that is local or a fixed offset; a stage is one the graph has', () => {
  const clock = (over: Record<string, unknown>): Record<string, unknown> => draftOf({ condition: { clock: { from: '09:00', to: '18:00', ...over } } })
  assert.deepEqual(paths(clock({ days: [1, 2, 3, 4, 5], tz: 'local' })), [])
  assert.deepEqual(paths(clock({ tz: '-05:30' })), [])
  assert.deepEqual(paths(clock({ from: '22:00', to: '06:00' })), [], 'across midnight')
  for (const days of [[0], [8], [], [1, 1], '1']) assert.deepEqual(paths(clock({ days })), ['condition.clock.days'], JSON.stringify(days))
  for (const from of ['9:00', '24:00', '09:60', 9]) assert.deepEqual(paths(clock({ from })), ['condition.clock.from'], String(from))
  assert.deepEqual(paths(clock({ to: '24:00' })), ['condition.clock.to'])
  assert.deepEqual(paths(clock({ to: '09:00' })), ['condition.clock.to'], 'a window that starts where it ends is empty or whole: refused')
  for (const tz of ['+8', 'Europe/Paris', '+25:00', '+08:60']) assert.deepEqual(paths(clock({ tz })), ['condition.clock.tz'], tz)
  assert.deepEqual(paths(clock({ extra: 1 })), ['condition.clock.extra'])
  assert.deepEqual(paths(draftOf({ condition: { clock: { to: '18:00' } } })), ['condition.clock.from'])
  assert.deepEqual(paths(draftOf({ condition: { stage: ['interview', 'design'] } })), [])
  assert.deepEqual(paths(draftOf({ condition: { stage: ['nope'] } })), ['condition.stage'])
  assert.deepEqual(paths(draftOf({ condition: { stage: [] } })), ['condition.stage'])
})

test('a lifetime is until lifted, a time within 30 days, a condition, or the session of a session rule', () => {
  const day = 86_400_000
  const at = (offset: number): string => new Date(NOW.getTime() + offset).toISOString()
  assert.deepEqual(paths(draftOf({ lifetime: { kind: 'ttl', expiresAt: at(29 * day) } })), [])
  assert.deepEqual(paths(draftOf({ lifetime: { kind: 'ttl', expiresAt: at(30 * day) } })), [], '30 days exactly')
  for (const expiresAt of [at(-1), at(0), at(30 * day + 1000), 'next week', 7]) assert.deepEqual(paths(draftOf({ lifetime: { kind: 'ttl', expiresAt } })), ['lifetime.expiresAt'], String(expiresAt))
  assert.deepEqual(paths(draftOf({ lifetime: { kind: 'until', condition: { signal: 'code-freeze', is: false } } })), [])
  assert.deepEqual(paths(draftOf({ lifetime: { kind: 'until', condition: { signal: 'nope', is: true } } })), ['lifetime.condition.signal'])
  assert.deepEqual(paths(draftOf({ lifetime: { kind: 'session' } })), ['lifetime'], 'only a session rule lives as long as its session')
  assert.deepEqual(paths(draftOf({ scope: 'session', sessionId: 's-1', lifetime: { kind: 'session' } })), [])
  assert.deepEqual(paths(draftOf({ lifetime: { kind: 'forever' } })), ['lifetime.kind'])
  assert.deepEqual(paths(draftOf({ lifetime: { kind: 'until-lifted', extra: 1 } })), ['lifetime.extra'])
  assert.deepEqual(paths(draftOf({ lifetime: undefined })), ['lifetime'])
})

test('a project has at most 50 active rules and at most 10 with a script; a rule that replaces one of them does not count twice', () => {
  const others = (count: number, withScript = false): Array<{ readonly id: string, readonly action: { readonly kind: 'block' } | typeof SCRIPT }> =>
    Array.from({ length: count }, (_, index) => ({ id: `r-other-${index}`, action: withScript ? SCRIPT : { kind: 'block' as const } }))
  assert.deepEqual(paths(draftOf(), contextOf({ existing: others(49) })), [])
  const full = validateRule(draftOf(), contextOf({ existing: others(50) }))
  assert.deepEqual(full.map(issue => issue.path), ['id'])
  assert.match(full[0]?.message ?? '', /先解除一些/)
  assert.deepEqual(paths(draftOf({ id: 'r-other-3' }), contextOf({ existing: others(50) })), [], 'a change of an active rule keeps the count')
  assert.deepEqual(paths(draftOf({ action: SCRIPT }), contextOf({ existing: others(10, true) })), ['action'])
  assert.deepEqual(paths(draftOf({ action: SCRIPT }), contextOf({ existing: others(9, true) })), [])
  assert.deepEqual(paths(draftOf(), contextOf({ existing: others(10, true) })), [], 'a rule without a script is not held back by the script limit')
  const replacing = { ...SCRIPT, script: { ...SCRIPT.script, file: 'docs/rules/scripts/r-other-0.mjs' } }
  assert.deepEqual(paths(draftOf({ id: 'r-other-0', action: replacing }), contextOf({ existing: others(10, true) })), [], 'replacing a script rule by a script rule')
})

test('an action names its effect: the four effects are the action kinds, a script has none until it is run', () => {
  assert.deepEqual((['block', 'queue', 'record', 'inform'] as const).map(kind => effectOf({ kind })), ['block', 'queue', 'record', 'inform'])
  assert.equal(effectOf({ kind: 'script', script: { file: 'docs/rules/scripts/r-1.mjs', sha256: SHA, lang: 'node' } }), undefined)
})

test('a row state is a health state or absent, as the catalog and the heartbeat read it', () => {
  const states: Record<RowState, true> = { active: true, degraded: true, inactive: true, absent: true }
  const health: readonly HealthState[] = ['active', 'degraded', 'inactive']
  const fromHealth: RowState = health[0] ?? 'absent'
  assert.deepEqual(Object.keys(states).sort(), [...health, 'absent'].sort())
  assert.equal(fromHealth, 'active')
})
