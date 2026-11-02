/**
 * The journal records and the one classifier (src/guard/records.ts, m4-gate
 * G1): every record kind classifies as the design's table says, the keys are
 * the first 12 hex digits of the line's SHA-256, and a judged call leaves
 * the shell text or the file target as its subject.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyRecord, keyOf, recordKey, subjectOf } from '../src/guard/records.ts'

const parse = (line: string): Record<string, unknown> => JSON.parse(line) as Record<string, unknown>

test('classifyRecord: every kind names itself; an unknown kind is unreadable, never a denial', () => {
  assert.equal(classifyRecord(parse('{"kind":"followup","outcome":"repeat"}')), 'followup')
  assert.equal(classifyRecord(parse('{"kind":"request","ref":"r-1","outcome":"asked"}')), 'request')
  assert.equal(classifyRecord(parse('{"kind":"grant","ref":"r-1"}')), 'grant')
  assert.equal(classifyRecord(parse('{"kind":"grant-void","ref":"r-1"}')), 'grant-void')
  assert.equal(classifyRecord(parse('{"kind":"lift","rule":"scratch-only","action":"lift"}')), 'lift')
  assert.equal(classifyRecord(parse('{"kind":"gap","lost":2,"classes":{}}')), 'gap')
  assert.equal(classifyRecord(parse('{"kind":"x"}')), 'unknown')
})

test('classifyRecord: denials, the rules board\'s four kinds, and the late denials', () => {
  // A guard denial carries no mode; a rules-board denial says enforce.
  assert.equal(classifyRecord(parse('{"rule":"file-tools-only","tool":"pwsh"}')), 'denial')
  assert.equal(classifyRecord(parse('{"rule":"rules:p-1","mode":"enforce","effect":"block"}')), 'denial')
  assert.equal(classifyRecord(parse('{"rule":"rules:p-1","mode":"enforce","effect":"queue"}')), 'deferral')
  assert.equal(classifyRecord(parse('{"rule":"rules:p-1","mode":"record"}')), 'rule-record')
  // Late denials: the fallback and the rules board's late blocks are violations; anything else late is unreadable.
  assert.equal(classifyRecord(parse('{"rule":"file-tools-only","mode":"late","paths":["a"]}')), 'late-denial')
  assert.equal(classifyRecord(parse('{"rule":"rules:p-1","mode":"late"}')), 'late-denial')
  assert.equal(classifyRecord(parse('{"rule":"x","mode":"late"}')), 'unknown')
  // The pre-0.6 shadow record: the same facts under the old name.
  assert.equal(classifyRecord(parse('{"rule":"file-tools-only","mode":"shadow","paths":["a"]}')), 'late-denial')
  assert.equal(classifyRecord(parse('{"rule":"file-tools-only","mode":"shadow"}')), 'unknown')
  // A record-only mode on a rule outside the rules board is unreadable.
  assert.equal(classifyRecord(parse('{"rule":"guard:x","mode":"record"}')), 'unknown')
})

test('recordKey and keyOf: 12 hex digits, stable, distinct per line', () => {
  const line = '{"at":"2026-11-02T00:00:00Z","rule":"file-tools-only"}'
  assert.match(recordKey(line), /^[0-9a-f]{12}$/)
  assert.equal(recordKey(line), recordKey(line))
  assert.notEqual(recordKey(line), recordKey(`${line} `))
  assert.equal(keyOf(JSON.parse(line) as object), recordKey(line))
})

test('subjectOf: the shell text, the file target, or the bare tool', () => {
  assert.deepEqual(subjectOf({ name: 'pwsh', arguments: { command: 'Set-Content a b' } }), { tool: 'pwsh', command: 'Set-Content a b' })
  assert.deepEqual(subjectOf({ name: 'write', arguments: { file_path: 'src/a.ts' } }), { tool: 'write', target: 'src/a.ts' })
  assert.deepEqual(subjectOf({ name: 'str_replace_editor', arguments: { path: 'src/b.ts' } }), { tool: 'str_replace_editor', target: 'src/b.ts' })
  assert.deepEqual(subjectOf({ name: 'read', arguments: { file_path: 'src/a.ts' } }), { tool: 'read', target: 'src/a.ts' })
  assert.deepEqual(subjectOf({ name: 'glob', arguments: { pattern: '*' } }), { tool: 'glob' })
  const long = 'x'.repeat(9000)
  assert.equal(subjectOf({ name: 'bash', arguments: { command: long } }).command?.length, 8192)
})
