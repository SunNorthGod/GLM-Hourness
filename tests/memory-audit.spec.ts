import assert from 'node:assert/strict'
import test from 'node:test'
import { auditJournal, auditPaths } from '../src/memory/audit.ts'
import { apply, journalFor } from '../src/memory/index.ts'
import type { StreamChunk } from '../src/shared/lm-min.ts'

function fakeFs() {
  const files = new Map<string, string>()
  const fs = {
    mkdir: async (path: string) => { files.set(`${path}:dir`, ''); },
    appendFile: async (path: string, data: string) => { files.set(path, (files.get(path) ?? '') + data) },
  }
  return { files, fs }
}

test('audit journal appends JSONL lines under <home>/audit with directories created', async () => {
  const { files, fs } = fakeFs()
  const journal = auditJournal((path, line) => fs.appendFile(path, line), auditPaths('C:\\ws\\.llm'))
  await journal.violation({ at: '2026-10-27T00:00:00Z', rule: 'workspace-containment', tool: 'Write', correction: 'Boundary: …' })
  await journal.usage({ at: '2026-10-27T00:00:01Z', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 5, outputTokens: 3 } })
  await journal.decision({ at: '2026-10-27T00:00:02Z', level: 'L1', kind: 'dispatch', subject: 'subagent a' })
  assert.deepEqual(auditPaths('C:\\ws\\.llm'), {
    violations: 'C:\\ws\\.llm/audit/violations.jsonl',
    usage: 'C:\\ws\\.llm/audit/usage.jsonl',
    decisions: 'C:\\ws\\.llm/audit/decisions.jsonl',
  })
  const lines = (files.get('C:\\ws\\.llm/audit/decisions.jsonl') ?? '').trim().split('\n')
  assert.equal(lines.length, 1)
  assert.deepEqual(Object.keys(JSON.parse(lines[0]!)), ['at', 'level', 'kind', 'subject'])
})

test('fsAppender creates the directory before the first append', async () => {
  const { files, fs } = fakeFs()
  const append = (await import('../src/memory/audit.ts')).fsAppender(fs)
  await append('C:/ws/.llm/audit/usage.jsonl', '{"x":1}')
  assert.ok(files.has('C:/ws/.llm/audit:dir'))
  assert.equal(files.get('C:/ws/.llm/audit/usage.jsonl'), '{"x":1}\n')
})

test('apply records usage after the stream settles and passes chunks through', async () => {
  const { files, fs } = fakeFs()
  const listeners: Array<(options: unknown, next: () => AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>> = []
  const registered: string[] = []
  const dispose = apply({
    on: (_event, listener) => { listeners.push(listener); return () => {} },
    tools: { register: (tool: { name: string }) => { registered.push(tool.name); return () => {} } },
  }, { home: 'C:/ws/.llm', fs })
  assert.deepEqual(registered, ['memory_store', 'memory_query', 'memory_forget'])
  const chunks: StreamChunk[] = [
    { type: 'text-delta', index: 0, text: 'hi' },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 4 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  const seen: string[] = []
  for await (const chunk of listeners[0]!({ provider: 'glm', model: 'glm-5.3' }, async function* () { for (const c of chunks) yield c })) {
    seen.push(chunk.type)
  }
  await new Promise(resolve => setImmediate(resolve)) // settle the fire-and-forget write
  dispose()
  assert.deepEqual(seen, ['text-delta', 'usage', 'finish'])
  const written = files.get('C:/ws/.llm/audit/usage.jsonl') ?? ''
  assert.ok(written.includes('"provider":"glm"'))
  assert.ok(written.includes('"inputTokens":10'))
})

test('streams without a usage chunk write nothing', async () => {
  const { files, fs } = fakeFs()
  const listeners: Array<(options: unknown, next: () => AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>> = []
  apply({ on: (_event, listener) => { listeners.push(listener); return () => {} }, tools: { register: () => () => {} } }, { home: 'C:/ws/.llm', fs })
  for await (const _chunk of listeners[0]!({ provider: 'glm', model: 'm' }, async function* () { yield { type: 'finish', reason: { kind: 'stop' } } })) {
    void _chunk
  }
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(files.get('C:/ws/.llm/audit/usage.jsonl'), undefined)
})

test('a missing home degrades to a no-op instead of failing activation', () => {
  // Activation failures take the whole host startup down, so the row warns and registers nothing.
  const dispose = apply({ on: () => () => {}, tools: { register: () => () => {} } }, {})
  assert.equal(typeof dispose, 'function')
  dispose()
})
