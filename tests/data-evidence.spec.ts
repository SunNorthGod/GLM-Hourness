/**
 * How evidence and sources are written (M5 design §5.7): every form of the
 * table, the commit-id exception to the secret check, the forms whose ids the
 * host issues, and the group keys of the learning pipeline.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkRefs, isGroupKey, parseRef, type ParsedRef } from '../src/data/evidence.ts'

const SHA40 = 'cae6ddf1a2b3c4d5e6f708192a3b4c5d6e7f8091'
const GHP = ['ghp', '_'].join('') + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'
const UUID = '0b8f2f3e-6c1d-4a52-9b7e-3d5a1c7e9f02'
const CALL_ID = 'call_00_aB3dE5gH7jK9mN1pQ3sT5vW7'

const parsed = (item: string): ParsedRef => {
  const result = parseRef(item)
  assert.ok(!('invalid' in result), `${item}: ${'invalid' in result ? result.invalid : ''}`)
  return result
}

test('the sample ids have the lengths the cases name', () => {
  assert.equal(SHA40.length, 40)
  assert.equal(CALL_ID.length, 32)
})

test('every form of the table is read as that form', () => {
  assert.deepEqual(parsed(`commit:${SHA40}`), { kind: 'commit', text: `commit:${SHA40}`, id: SHA40 })
  assert.deepEqual(parsed('commit:CAE6DDF'), { kind: 'commit', text: 'commit:cae6ddf', id: 'cae6ddf' }, 'stored in lower case')
  assert.deepEqual(parsed(SHA40), { kind: 'commit', text: SHA40, id: SHA40 }, 'a bare 40-digit id is a commit')
  assert.deepEqual(parsed('cae6ddf'), { kind: 'commit', text: 'cae6ddf', id: 'cae6ddf' })
  assert.deepEqual(parsed('node:risk-shared-desktop'), { kind: 'node', text: 'node:risk-shared-desktop', id: 'risk-shared-desktop' })
  assert.deepEqual(parsed('task:task-3'), { kind: 'task', text: 'task:task-3', id: 'task-3' })
  assert.deepEqual(parsed('node:recommend-last@2026-10-29T11:39'), { kind: 'node', text: 'node:recommend-last@2026-10-29T11:39', id: 'recommend-last', at: '2026-10-29T11:39' })
  assert.equal(parsed('node:recommend-last@2026-10-29T11:39:05Z').at, '2026-10-29T11:39:05Z')
  assert.equal(parsed('node:recommend-last@2026-10-29T11:39Z').at, '2026-10-29T11:39Z')
  assert.deepEqual(parsed(`session:session-${UUID}`), { kind: 'session', text: `session:session-${UUID}`, id: `session-${UUID}` })
  assert.equal(parsed(`call:${CALL_ID}`).kind, 'call')
  assert.equal(parsed('command:cmd-1').kind, 'command')
  assert.deepEqual(parsed('https://example.com/issues/12'), { kind: 'url', text: 'https://example.com/issues/12', id: 'https://example.com/issues/12' })
  assert.deepEqual(parsed('docs/DEVELOPMENT.md §7'), { kind: 'other', text: 'docs/DEVELOPMENT.md §7', id: 'docs/DEVELOPMENT.md §7' })
  assert.equal(parsed('deadbeef').kind, 'commit', 'a node id made only of hex digits reads as a commit; node: names it')
})

test('a prefix that names a form always means that form: a body that does not fit is invalid, never "other"', () => {
  const invalid = [
    'commit:', 'commit:xyz1234', 'commit:abc123', `commit:${SHA40}0`, `commit:${GHP}`,
    'node:', 'node:Recommend_Last', 'node:1abc', `node:${'a'.repeat(49)}`, 'node:x@yesterday', 'task:Task-3',
    'session:', 'call:has space', `command:${'a'.repeat(129)}`,
    'https://example.com/a b',
    '', '   ', 'line\nbreak', 'x'.repeat(201),
  ]
  for (const item of invalid) assert.ok('invalid' in parseRef(item), JSON.stringify(item))
  assert.ok(!('invalid' in parseRef('x'.repeat(200))))
})

test('checkRefs returns the parsed items, with commit ids in lower case', () => {
  const result = checkRefs([`commit:${SHA40.toUpperCase()}`, 'node:risk-shared-desktop', 'docs/HANDOFF.md §6'], 'evidence')
  assert.ok(result.ok)
  assert.deepEqual(result.refs.map(ref => ref.text), [`commit:${SHA40}`, 'node:risk-shared-desktop', 'docs/HANDOFF.md §6'])
  assert.deepEqual(checkRefs([], 'source'), { ok: true, refs: [] })
})

test('taken as evidence or source: deep paths, plan names, commit ids written either way, host ids', () => {
  const taken = [
    'reference/ZCode/apps/zcode-cli/packages/core/src/context/sections/memory.ts',
    'coding-plan/start-plan',
    SHA40,
    `commit:${SHA40}`,
    'task:task-3',
    'node:risk-shared-desktop',
    'node:recommend-last@2026-10-29T11:39',
    `session:session-${UUID}`,
    `call:${CALL_ID}`,
    'command:cmd-1',
    '.agents/tasks/m1-l4/report.md',
  ]
  for (const item of taken) assert.ok(checkRefs([item], 'evidence').ok, item)
})

test('a full commit id is not judged a digest, and nothing is judged for it', () => {
  assert.ok(checkRefs([SHA40], 'source').ok)
  assert.ok(checkRefs([`commit:${SHA40}`], 'source').ok)
  assert.equal(checkRefs([`some text with ${SHA40} inside`], 'evidence').ok, false, 'the same digits inside other text are still a digest')
})

test('refused as secret_like with the class and the place: a pasted token in any form that is judged', () => {
  const sample = checkRefs(['docs/HANDOFF.md §6', `see ${GHP}`], 'evidence')
  assert.deepEqual(sample, { ok: false, code: 'secret_like', field: 'evidence', index: 1, message: 'looks like a secret (prefix: ghp_); remove it' })
  const call = checkRefs([`call:${GHP}`], 'source')
  assert.ok(!call.ok)
  assert.equal(call.code, 'secret_like')
  assert.equal(call.message, 'looks like a secret (prefix: ghp_); remove it', 'a prefix is still caught after call:')
  const tokenInUrl = checkRefs([`https://example.com/${'Gh1'.repeat(11)}`, 'x'], 'evidence')
  assert.ok(!tokenInUrl.ok && tokenInUrl.code === 'secret_like')
  const digestInUrl = checkRefs([`https://example.com/commit/${SHA40}`], 'evidence')
  assert.ok(!digestInUrl.ok && digestInUrl.code === 'secret_like', 'a url is judged in full')
})

test('refused as invalid, not secret_like, when the form is broken, even when the body is secret-shaped', () => {
  const afterCommit = checkRefs([`commit:${GHP}`], 'evidence')
  assert.ok(!afterCommit.ok)
  assert.equal(afterCommit.code, 'invalid')
  assert.equal(afterCommit.field, 'evidence')
  assert.equal(afterCommit.index, 0)
  for (const item of ['commit:xyz1234', 'node:Recommend_Last']) {
    const result = checkRefs(['docs/x.md', item], 'source')
    assert.ok(!result.ok)
    assert.deepEqual([result.code, result.field, result.index], ['invalid', 'source', 1], item)
  }
})

test('the host ids of session, call and command are not judged as tokens or digests', () => {
  assert.ok(checkRefs([`call:${'Gh1'.repeat(11)}`], 'evidence').ok)
  assert.ok(checkRefs([`session:${'a1'.repeat(16)}`], 'evidence').ok)
  assert.ok(!checkRefs([`node:${'a'.repeat(30)}`, `call:${GHP}`], 'evidence').ok)
})

test('group keys: 1 to 80 characters, one line, no space at either end', () => {
  for (const key of ['edit:goal.stage', 'reject:node-title', 'chat:reject', 'a', 'x'.repeat(80), 'a b c']) assert.equal(isGroupKey(key), true, key)
  for (const key of ['', 'x'.repeat(81), ' edit:goal.stage', 'edit:goal.stage ', 'edit:goal\n.stage', 'edit:goal\r.stage', '\tedit:goal.stage']) assert.equal(isGroupKey(key), false, JSON.stringify(key))
})
