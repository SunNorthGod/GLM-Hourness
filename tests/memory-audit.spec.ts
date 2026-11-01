import assert from 'node:assert/strict'
import test from 'node:test'
import { auditJournal, auditPaths, rowJournal } from '../src/memory/audit.ts'
import { apply } from '../src/memory/index.ts'
import type { StreamChunk } from '../src/shared/lm-min.ts'
import { MEMORY_TOOL_NAMES } from '../src/shared/tool-names.ts'

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

test('audit paths: usage under the user directory, violations and decisions under the project directory', async () => {
  assert.deepEqual(auditPaths({ userHome: USER_HOME, projectHome: 'C:\\ws\\.llm\\' }), {
    violations: 'C:\\ws\\.llm/audit/violations.jsonl',
    decisions: 'C:\\ws\\.llm/audit/decisions.jsonl',
    usage: `${USER_HOME}/audit/usage.jsonl`,
  })
  assert.deepEqual(auditPaths({ projectHome: 'C:/ws/.llm' }), { violations: 'C:/ws/.llm/audit/violations.jsonl', decisions: 'C:/ws/.llm/audit/decisions.jsonl' })
  assert.deepEqual(auditPaths({ userHome: USER_HOME }), { usage: `${USER_HOME}/audit/usage.jsonl` })
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

/** A memory context: the llm/stream waterfall, the agent lifecycle, the tools service and an optional data service. */
function memoryContext(data: unknown) {
  const events: Array<{ readonly event: string, readonly listener: unknown }> = []
  const registered: string[] = []
  const ctx = {
    on: (event: string, listener: unknown) => { events.push({ event, listener }); return () => {} },
    tools: { register: (tool: { name: string }) => { registered.push(tool.name); return () => {} } },
    get: (name: string) => name === 'glmHournessData' ? data : undefined,
  }
  /** Run the row's llm/stream listener over `chunks`. */
  const stream = (options: { provider: string, model: string }, chunks: readonly StreamChunk[]): AsyncIterable<StreamChunk> => {
    type StreamListener = (options: unknown, next: () => AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>
    const listener = events.find(entry => entry.event === 'llm/stream')?.listener as StreamListener
    return listener(options, async function* () { for (const chunk of chunks) yield chunk })
  }
  return { ctx, stream, registered }
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
  const { ctx, stream, registered } = memoryContext(service)
  const dispose = apply(ctx, { home: 'C:/ws/.llm', fs })
  assert.deepEqual(registered, MEMORY_TOOL_NAMES)
  const seen = await drain(stream({ provider: 'glm', model: 'glm-5.3' }, chunks))
  dispose()
  assert.deepEqual(seen, ['text-delta', 'usage', 'finish'])
  const written = files.get(`${USER_HOME}/audit/usage.jsonl`) ?? ''
  assert.ok(written.includes('"provider":"glm"'))
  assert.ok(written.includes('"inputTokens":10'))
  assert.equal(files.get('C:/ws/.llm/audit/usage.jsonl'), undefined) // the project directory holds no usage
})

test('without the data service the stream still passes through and no usage is written', async () => {
  const { files, fs } = fakeFs()
  const { ctx, stream, registered } = memoryContext(undefined)
  const warn = console.warn
  console.warn = () => {}
  try {
    apply(ctx, { home: 'C:/ws/.llm', fs })
    assert.equal(registered.length, 3) // the memory tools do not need the data row: the project memory follows the session
    assert.deepEqual(await drain(stream({ provider: 'glm', model: 'glm-5.3' }, chunks)), ['text-delta', 'usage', 'finish'])
  }
  finally {
    console.warn = warn
  }
  assert.equal([...files.keys()].filter(key => key.endsWith('.jsonl')).length, 0)
})

test('streams without a usage chunk write nothing', async () => {
  const { files, fs } = fakeFs()
  const { ctx, stream } = memoryContext(service)
  apply(ctx, { home: 'C:/ws/.llm', fs })
  await drain(stream({ provider: 'glm', model: 'm' }, [{ type: 'finish', reason: { kind: 'stop' } }]))
  assert.equal(files.get(`${USER_HOME}/audit/usage.jsonl`), undefined)
})

test('a row without the home setting registers the memory tools too and keeps the usage journal', async () => {
  // The project directory follows the session now; the old home setting decides nothing.
  const { files, fs } = fakeFs()
  const { ctx, stream, registered } = memoryContext(service)
  const warn = console.warn
  console.warn = () => {}
  let dispose: () => void
  try {
    dispose = apply(ctx, { fs })
  }
  finally {
    console.warn = warn
  }
  assert.deepEqual(registered, MEMORY_TOOL_NAMES)
  await drain(stream({ provider: 'glm', model: 'glm-5.3' }, chunks))
  dispose()
  assert.ok((files.get(`${USER_HOME}/audit/usage.jsonl`) ?? '').includes('"inputTokens":10'))
})