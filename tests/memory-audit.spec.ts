import assert from 'node:assert/strict'
import test from 'node:test'
import { auditJournal, auditPaths, projectJournal, rowJournal } from '../src/memory/audit.ts'
import { apply } from '../src/memory/index.ts'
import type { StreamChunk } from '../src/shared/lm-min.ts'
import { LEARNING_TOOL_NAMES, MEMORY_TOOL_NAMES } from '../src/shared/tool-names.ts'

function fakeFs() {
  const files = new Map<string, string>()
  const fs = {
    mkdir: (path: string) => {
      files.set(`${path}:dir`, '')
      return Promise.resolve()
    },
    appendFile: (path: string, data: string) => {
      files.set(path, (files.get(path) ?? '') + data)
      return Promise.resolve()
    },
  }
  return { files, fs }
}

const USER_HOME = 'C:/users/me/.dsh/glm-hourness'
const service = { userHome: USER_HOME, projectHome: 'C:/ws/.llm' }

test('audit paths: usage and its gaps under the user directory, violations, decisions and the checks\' timing under the project directory', () => {
  assert.deepEqual(auditPaths({ userHome: USER_HOME, projectHome: 'C:\\ws\\.llm\\' }), {
    violations: 'C:\\ws\\.llm/audit/violations.jsonl',
    decisions: 'C:\\ws\\.llm/audit/decisions.jsonl',
    suppressions: 'C:\\ws\\.llm/audit/suppressions.jsonl',
    timing: 'C:\\ws\\.llm/env-checks/timing.jsonl',
    limits: 'C:\\ws\\.llm/env-checks/limits.jsonl',
    usage: `${USER_HOME}/audit/usage.jsonl`,
    gaps: `${USER_HOME}/audit/usage-gaps.jsonl`,
  })
  assert.deepEqual(auditPaths({ projectHome: 'C:/ws/.llm' }), { violations: 'C:/ws/.llm/audit/violations.jsonl', decisions: 'C:/ws/.llm/audit/decisions.jsonl', suppressions: 'C:/ws/.llm/audit/suppressions.jsonl', timing: 'C:/ws/.llm/env-checks/timing.jsonl', limits: 'C:/ws/.llm/env-checks/limits.jsonl' })
  assert.deepEqual(auditPaths({ userHome: USER_HOME }), { usage: `${USER_HOME}/audit/usage.jsonl`, gaps: `${USER_HOME}/audit/usage-gaps.jsonl` })
})

test('audit journal appends one JSONL line per record; a sink without a directory rejects', async () => {
  const { files, fs } = fakeFs()
  const journal = auditJournal((path, line) => fs.appendFile(path, line), auditPaths({ projectHome: 'C:/ws/.llm' }))
  await journal.violation({ at: '2026-10-27T00:00:00Z', rule: 'workspace-containment', tool: 'Write', correction: 'Boundary: …' })
  await journal.decision({ at: '2026-10-27T00:00:02Z', kind: 'dispatch', subject: 'subagent a' })
  await assert.rejects(journal.usage({ at: '2026-10-27T00:00:01Z', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 5, outputTokens: 3 } }), /no user-level directory/)
  const lines = (files.get('C:/ws/.llm/audit/decisions.jsonl') ?? '').trim().split('\n')
  assert.equal(lines.length, 1)
  assert.deepEqual(Object.keys(JSON.parse(lines[0]!)), ['at', 'kind', 'subject'])
})

test('fsAppender creates the directory before the first append', async () => {
  const { files, fs } = fakeFs()
  const append = (await import('../src/memory/audit.ts')).fsAppender(fs)
  await append('C:/ws/.llm/audit/usage.jsonl', '{"x":1}')
  assert.ok(files.has('C:/ws/.llm/audit:dir'))
  assert.equal(files.get('C:/ws/.llm/audit/usage.jsonl'), '{"x":1}\n')
})

// A denial is journaled without being awaited and its follow-up a turn later:
// on a slow disk the second append finished first and the follow-up stood
// before its denial in the file (probe guard scope and guard paths, 2026-11-04).
test('fsAppender lands appends to one file in the order they were asked for, and a failed one does not hold up the next', async () => {
  const order: string[] = []
  let releaseFirst = (): void => {}
  const fs = {
    mkdir: () => Promise.resolve(),
    appendFile: (_path: string, data: string): Promise<void> => {
      if (data.startsWith('{"n":1')) return new Promise<void>(resolve => { releaseFirst = () => { order.push(data.trim()); resolve() } })
      if (data.startsWith('{"n":3')) return Promise.reject(new Error('disk full'))
      order.push(data.trim())
      return Promise.resolve()
    },
  }
  const append = (await import('../src/memory/audit.ts')).fsAppender(fs)
  const file = 'C:/ws/.llm/audit/violations.jsonl'
  const first = append(file, '{"n":1}')
  const second = append(file, '{"n":2}')
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(order, [], 'the second append waits for the first')
  releaseFirst()
  await Promise.all([first, second])
  assert.deepEqual(order, ['{"n":1}', '{"n":2}'])
  await assert.rejects(append(file, '{"n":3}'), /disk full/)
  await append(file, '{"n":4}')
  assert.deepEqual(order, ['{"n":1}', '{"n":2}', '{"n":4}'])
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
  assert.ok(warnings[0].startsWith('row: usage journal write failed: no user-level directory'))
  assert.equal((files.get(`${USER_HOME}/audit/usage.jsonl`) ?? '').trim().split('\n').length, 1)
})

// The violation journal reports how each write came out (m4-gate G1, §3.2),
// so the gate can count the records a session lost.

const denial = (at: string, rule = 'file-tools-only'): { at: string, rule: string, tool: string, correction: string } => ({ at, rule, tool: 'pwsh', correction: 'Boundary: …' })

test('a violation write reports its outcome: written, failed, or no home attempted', async () => {
  const { files, fs } = fakeFs()
  const journal = rowJournal('guard', () => ({ projectHome: 'C:/ws/.llm' }), fs)
  assert.equal(await journal.violation(denial('2026-11-01T01:00:00Z')), 'written')
  assert.equal(await journal.violation(denial('2026-11-01T02:00:00Z')), 'written')
  assert.equal((files.get('C:/ws/.llm/audit/violations.jsonl') ?? '').trim().split('\n').length, 2)
  const homeless = rowJournal('guard', () => ({}), fakeFs().fs)
  assert.equal(await homeless.violation(denial('t')), 'no-home')
})

/** The journal fs that fails with `error()` while broken stands and lands the writes after; the tests flip the flag between the writes. */
function brokenFs(error: () => NodeJS.ErrnoException): {
  files: Map<string, string>
  fs: { mkdir: (path: string, options: { recursive: boolean }) => Promise<unknown>, appendFile: (path: string, data: string) => Promise<void> }
  landed: () => void
  broke: () => void
} {
  const files = new Map<string, string>()
  let broken = true
  return {
    files,
    fs: {
      mkdir: () => Promise.resolve(undefined),
      appendFile: (path: string, data: string) => {
        if (broken) return Promise.reject(error())
        files.set(path, (files.get(path) ?? '') + data)
        return Promise.resolve()
      },
    },
    landed: () => { broken = false },
    broke: () => { broken = true },
  }
}

test('a failed append is held as a gap and written directly before the next record that lands', async () => {
  const { files, fs, landed } = brokenFs(() => Object.assign(new Error('EACCES: permission denied, open'), { code: 'EACCES' }))
  const warnings: string[] = []
  const warn = console.warn
  console.warn = (message: string) => { warnings.push(message) }
  const journal = rowJournal('guard', () => ({ projectHome: 'C:/ws/.llm' }), fs)
  const lost = denial('2026-11-01T01:00:00Z')
  assert.equal(await journal.violation(lost), 'failed')
  console.warn = warn
  assert.equal(warnings.length, 1, 'the first failure of the sink is reported on the console once')
  landed()
  assert.equal(await journal.violation(denial('2026-11-01T03:00:00Z', 'workspace-containment')), 'written')
  const lines = (files.get('C:/ws/.llm/audit/violations.jsonl') ?? '').trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
  assert.equal(lines.length, 2, 'the gap line and the next record landed together')
  const gap = lines[0]
  assert.deepEqual([gap.kind, gap.row, gap.lost], ['gap', 'guard', 1])
  assert.deepEqual(gap.classes, { denial: 1 })
  assert.deepEqual([gap.since, gap.until], [lost.at, lost.at])
  assert.equal(gap.code, 'EACCES')
  assert.equal(lines[1].rule, 'workspace-containment')
  assert.equal(lines[1].at, '2026-11-01T03:00:00Z')
})

test('failures merge into one pending gap; flush writes it alone and never rejects', async () => {
  const { files, fs, landed, broke } = brokenFs(() => Object.assign(new Error('no space left on device'), { code: 'ENOSPC' }))
  const warn = console.warn
  console.warn = () => {}
  const journal = rowJournal('guard', () => ({ projectHome: 'C:/ws/.llm' }), fs)
  try {
    assert.equal(await journal.violation(denial('2026-11-01T01:00:00Z')), 'failed')
    assert.equal(await journal.violation({ ...denial('2026-11-01T01:30:00Z'), kind: 'followup', outcome: 'repeat', denial: 'k', scope: 'other' } as never), 'failed')
    landed()
    assert.equal(await journal.violation(denial('2026-11-01T03:00:00Z')), 'written')
    const lines = (files.get('C:/ws/.llm/audit/violations.jsonl') ?? '').trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    const gap = lines[0]
    assert.deepEqual([gap.lost, gap.classes, gap.code, gap.since, gap.until], [2, { denial: 1, followup: 1 }, 'ENOSPC', '2026-11-01T01:00:00Z', '2026-11-01T01:30:00Z'])
    // flush() with nothing pending writes nothing.
    const before = files.get('C:/ws/.llm/audit/violations.jsonl') ?? ''
    await journal.flush()
    assert.equal(files.get('C:/ws/.llm/audit/violations.jsonl'), before)
    // A failure after the last record keeps its gap for flush().
    broke()
    assert.equal(await journal.violation(denial('2026-11-01T04:00:00Z')), 'failed')
    landed()
    await journal.flush()
    const flushed = (files.get('C:/ws/.llm/audit/violations.jsonl') ?? '').trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    assert.equal(flushed.length, 3)
    assert.equal(flushed[2].kind, 'gap')
    assert.equal((flushed[2].classes as Record<string, number>).denial, 1)
    assert.equal(flushed[2].until, '2026-11-01T04:00:00Z')
  }
  finally {
    console.warn = warn
  }
})

test('projectJournal writes each project into its own journal and flushes every cached one', async () => {
  const { files, fs } = fakeFs()
  const journal = projectJournal('guard', cwd => cwd === 'C:/a' ? 'C:/a/.llm' : cwd === 'C:/b' ? 'C:/b/.llm' : undefined, fs)
  const record = denial('2026-11-01T01:00:00Z')
  assert.equal(await journal.violation(record, 'C:/a'), 'written')
  assert.equal(await journal.violation(record, 'C:/b'), 'written')
  assert.equal(await journal.violation(record, undefined), 'no-home')
  // The fake fs records each sink's mkdir beside the file it creates (`:dir`).
  assert.deepEqual([...files.keys()].sort(), [
    'C:/a/.llm/audit/violations.jsonl', 'C:/a/.llm/audit:dir',
    'C:/b/.llm/audit/violations.jsonl', 'C:/b/.llm/audit:dir',
  ])
  await journal.flush()
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
  assert.deepEqual(registered, [...MEMORY_TOOL_NAMES, ...LEARNING_TOOL_NAMES])
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
    assert.equal(registered.length, MEMORY_TOOL_NAMES.length + LEARNING_TOOL_NAMES.length) // the memory tools do not need the data row: the project memory follows the session
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
  assert.deepEqual(registered, [...MEMORY_TOOL_NAMES, ...LEARNING_TOOL_NAMES])
  await drain(stream({ provider: 'glm', model: 'glm-5.3' }, chunks))
  dispose()
  assert.ok((files.get(`${USER_HOME}/audit/usage.jsonl`) ?? '').includes('"inputTokens":10'))
})