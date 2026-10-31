import assert from 'node:assert/strict'
import test from 'node:test'
import { auditJournal, auditPaths, rowJournal } from '../src/memory/audit.ts'
import { apply } from '../src/memory/index.ts'
import type { StreamChunk } from '../src/shared/lm-min.ts'

function fakeFs() {
  const files = new Map<string, string>()
  const fs = {
    mkdir: async (path: string) => { files.set(`${path}:dir`, ''); },
    appendFile: async (path: string, data: string) => { files.set(path, (files.get(path) ?? '') + data) },
  }
  return { files, fs }
}

const USER_HOME = 'C:/users/me/.dsh/glm-hourness'
const service = { userHome: USER_HOME, projectHome: 'C:/ws/.llm' }

test('audit paths: usage and its gaps under the user directory, violations and decisions under the project directory', async () => {
  assert.deepEqual(auditPaths({ userHome: USER_HOME, projectHome: 'C:\\ws\\.llm\\' }), {
    violations: 'C:\\ws\\.llm/audit/violations.jsonl',
    decisions: 'C:\\ws\\.llm/audit/decisions.jsonl',
    usage: `${USER_HOME}/audit/usage.jsonl`,
    gaps: `${USER_HOME}/audit/usage-gaps.jsonl`,
  })
  assert.deepEqual(auditPaths({ projectHome: 'C:/ws/.llm' }), { violations: 'C:/ws/.llm/audit/violations.jsonl', decisions: 'C:/ws/.llm/audit/decisions.jsonl' })
  assert.deepEqual(auditPaths({ userHome: USER_HOME }), { usage: `${USER_HOME}/audit/usage.jsonl`, gaps: `${USER_HOME}/audit/usage-gaps.jsonl` })
})

test('audit journal appends one JSONL line per record; a sink without a directory rejects', async () => {
  const { files, fs } = fakeFs()
  const journal = auditJournal((path, line) => fs.appendFile(path, line), auditPaths({ projectHome: 'C:/ws/.llm' }))
  await journal.violation({ at: '2026-10-27T00:00:00Z', rule: 'workspace-containment', tool: 'Write', correction: 'Boundary: …' })
  await journal.decision({ at: '2026-10-27T00:00:02Z', level: 'L1', kind: 'dispatch', subject: 'subagent a' })
  await assert.rejects(journal.usage({ at: '2026-10-27T00:00:01Z', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 5, outputTokens: 3 } }), /no user-level directory/)
  const lines = (files.get('C:/ws/.llm/audit/decisions.jsonl') ?? '').trim().split('\n')
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

test('a row journal resolves directories per write and never rejects into the caller', async () => {
  const { files, fs } = fakeFs()
  let homes: { userHome?: string } = {}
  const journal = rowJournal('row', () => homes, fs)
  const warn = console.warn
  const warnings: string[] = []
  console.warn = (message: string) => { warnings.push(message) }
  try {
    await journal.usage({ at: 't0', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 1, outputTokens: 1 } }) // resolves despite no directory
    homes = { userHome: USER_HOME } // the data service activated later
    await journal.usage({ at: 't1', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 2, outputTokens: 1 } })
  }
  finally {
    console.warn = warn
  }
  assert.equal(warnings.length, 1)
  assert.ok(warnings[0]!.startsWith('row: usage journal write failed: no user-level directory'))
  assert.equal((files.get(`${USER_HOME}/audit/usage.jsonl`) ?? '').trim().split('\n').length, 1)
})

/** A memory context: the llm/stream waterfall, the tools service and an optional data service. */
function memoryContext(data: unknown) {
  const listeners: Array<(options: unknown, next: () => AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>> = []
  const registered: string[] = []
  const ctx = {
    on: (_event: 'llm/stream', listener: typeof listeners[number]) => { listeners.push(listener); return () => {} },
    tools: { register: (tool: { name: string }) => { registered.push(tool.name); return () => {} } },
    get: (name: string) => name === 'glmHournessData' ? data : undefined,
  }
  return { ctx, listeners, registered }
}

async function drain(stream: AsyncIterable<StreamChunk>): Promise<string[]> {
  const seen: string[] = []
  for await (const chunk of stream) seen.push(chunk.type)
  await new Promise(resolve => setImmediate(resolve)) // settle the fire-and-forget write
  return seen
}

const chunks: StreamChunk[] = [
  { type: 'text-delta', index: 0, text: 'hi' },
  { type: 'usage', usage: { inputTokens: 10, outputTokens: 4 } },
  { type: 'finish', reason: { kind: 'stop' } },
]

test('apply records usage in the user-level journal after the stream settles and passes chunks through', async () => {
  const { files, fs } = fakeFs()
  const { ctx, listeners, registered } = memoryContext(service)
  const dispose = apply(ctx, { home: 'C:/ws/.llm', fs })
  assert.deepEqual(registered, ['memory_store', 'memory_query', 'memory_forget'])
  const seen = await drain(listeners[0]!({ provider: 'glm', model: 'glm-5.3' }, async function* () { for (const c of chunks) yield c }))
  dispose()
  assert.deepEqual(seen, ['text-delta', 'usage', 'finish'])
  const written = files.get(`${USER_HOME}/audit/usage.jsonl`) ?? ''
  assert.ok(written.includes('"provider":"glm"'))
  assert.ok(written.includes('"inputTokens":10'))
  assert.equal(files.get('C:/ws/.llm/audit/usage.jsonl'), undefined) // the project directory holds no usage
})

test('without the data service the stream still passes through and no usage is written', async () => {
  const { files, fs } = fakeFs()
  const { ctx, listeners, registered } = memoryContext(undefined)
  const warn = console.warn
  console.warn = () => {}
  try {
    apply(ctx, { home: 'C:/ws/.llm', fs })
    assert.equal(registered.length, 3) // the memory tools work on the row home alone
    assert.deepEqual(await drain(listeners[0]!({ provider: 'glm', model: 'glm-5.3' }, async function* () { for (const c of chunks) yield c })), ['text-delta', 'usage', 'finish'])
  }
  finally {
    console.warn = warn
  }
  assert.equal([...files.keys()].filter(key => key.endsWith('.jsonl')).length, 0)
})

test('streams without a usage chunk write nothing', async () => {
  const { files, fs } = fakeFs()
  const { ctx, listeners } = memoryContext(service)
  apply(ctx, { home: 'C:/ws/.llm', fs })
  await drain(listeners[0]!({ provider: 'glm', model: 'm' }, async function* () { yield { type: 'finish', reason: { kind: 'stop' } } }))
  assert.equal(files.get(`${USER_HOME}/audit/usage.jsonl`), undefined)
})

test('a missing home leaves the memory tools off but keeps the usage journal', async () => {
  // Activation failures take the whole host startup down, so the row warns instead of throwing.
  const { files, fs } = fakeFs()
  const { ctx, listeners, registered } = memoryContext(service)
  const warn = console.warn
  console.warn = () => {}
  let dispose: () => void
  try {
    dispose = apply(ctx, { fs })
  }
  finally {
    console.warn = warn
  }
  assert.equal(registered.length, 0)
  await drain(listeners[0]!({ provider: 'glm', model: 'glm-5.3' }, async function* () { for (const c of chunks) yield c }))
  dispose()
  assert.ok((files.get(`${USER_HOME}/audit/usage.jsonl`) ?? '').includes('"inputTokens":10'))
})
