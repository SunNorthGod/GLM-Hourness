import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { referenceDir } from '../scripts/reference-dir.mjs'
import { apply, formatSummaryStream, withZcodeInstruction, type CompactRowContext } from '../src/glm-prompt/compact-row.ts'
import { transcriptNote } from '../src/glm-prompt/zcode-compact-text.ts'
import type { LlmStreamOptions } from '../src/shared/dsh-min.ts'
import type { StreamChunk } from '../src/shared/lm-min.ts'
import { TRANSCRIPT_SERVICE } from '../src/shared/transcript.ts'

/** A request with one field the row does not read, which must survive the rewrite. */
type StreamOptions = LlmStreamOptions & { readonly maxTokens?: number }

/** compaction-basic's instruction message (opening line as in rc.3 COMPACTION_INSTRUCTION). */
const DSH_INSTRUCTION = Object.freeze({
  role: 'user',
  content: [{ type: 'text', text: 'You are now acting as a compaction engine for this AI coding assistant. Condense the conversation ABOVE into a structured checkpoint.' }],
})
const prefix = [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }]
const compaction = (model: string): StreamOptions => ({ provider: 'glm-zcode', model, purpose: 'compaction', messages: [...prefix, DSH_INSTRUCTION], maxTokens: 4096 })

/** An adapter replying with the given text blocks. */
function adapter(texts: string[]) {
  return async function* (): AsyncIterable<StreamChunk> {
    let index = 0
    for (const text of texts) {
      yield { type: 'block-start', index, blockType: 'text' }
      yield { type: 'text-delta', index, text }
      yield { type: 'block-end', index, block: { type: 'text', text } }
      index += 1
    }
    yield { type: 'usage', usage: { inputTokens: 7, outputTokens: 3 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

/**
 * The rc.3 `llm/stream` dispatch: cordis waterfall over the registered
 * listeners (prepend registers outermost), `next()` without arguments, the
 * adapter call closing over the original options.
 */
function fakeLlm(texts: string[]) {
  const listeners: Array<(options: StreamOptions, next: () => AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>> = []
  const dispatched: StreamOptions[] = []
  const reply = adapter(texts)
  const ctx: CompactRowContext = {
    llm: {
      stream(options) {
        const chain = [...listeners]
        const next = (): AsyncIterable<StreamChunk> => {
          const listener = chain.shift()
          if (listener !== undefined) return listener(options, next)
          dispatched.push(options)
          return reply()
        }
        return next()
      },
    },
    on(_event, listener, options) {
      if (options?.prepend === true) listeners.unshift(listener)
      else listeners.push(listener)
      return () => { listeners.splice(listeners.indexOf(listener), 1) }
    },
  }
  return { ctx, listeners, dispatched }
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

const textOf = (chunks: StreamChunk[]): string[] => chunks.filter(chunk => chunk.type === 'block-end' && chunk.block?.type === 'text').map(chunk => chunk.block!.text!)

test('a GLM compaction request reaches the adapter with the ZCode instruction as its final message', async () => {
  const { ctx, dispatched } = fakeLlm(['<analysis>x</analysis><summary>checkpoint body</summary>'])
  apply(ctx)
  const chunks = await collect(ctx.llm.stream(compaction('glm-5.3')))
  assert.equal(dispatched.length, 1)
  const sent = dispatched[0]
  assert.equal(sent.maxTokens, 4096)
  assert.deepEqual(sent.messages.slice(0, -1), prefix) // the replayed prefix is kept for cache reuse
  const final = sent.messages.at(-1) as { role: string, content: Array<{ text: string }> }
  assert.equal(final.role, 'user')
  assert.ok(final.content[0].text.startsWith('CRITICAL: Respond with TEXT ONLY.'))
  assert.deepEqual(textOf(chunks), ['Summary:\ncheckpoint body'])
  assert.deepEqual(chunks.at(-2), { type: 'usage', usage: { inputTokens: 7, outputTokens: 3 } })
})

test('non-GLM compactions and ordinary GLM requests pass through untouched', async () => {
  for (const options of [compaction('deepseek-flash'), { ...compaction('glm-5.3'), purpose: undefined }]) {
    const { ctx, dispatched } = fakeLlm(['<analysis>x</analysis>raw'])
    apply(ctx)
    const chunks = await collect(ctx.llm.stream(options as StreamOptions))
    assert.equal(dispatched[0], options)
    assert.deepEqual(textOf(chunks), ['<analysis>x</analysis>raw'])
  }
  assert.equal(withZcodeInstruction({ ...compaction('glm-5.3'), messages: [...prefix, { role: 'user', content: [{ type: 'text', text: 'custom summarizer' }] }] }), undefined)
})

test('an analysis block split across text blocks is still stripped into one summary block', async () => {
  const chunks = await collect(formatSummaryStream(adapter(['<analysis>first', ' half</analysis><summary>kept</summary>'])()))
  assert.deepEqual(textOf(chunks), ['Summary:\nkept'])
  assert.equal(chunks.filter(chunk => chunk.type === 'block-start').length, 1)
})

test('an analysis-only reply lands no text, so compaction-basic fails loud', async () => {
  const chunks = await collect(formatSummaryStream(adapter(['<analysis>only analysis</analysis>'])()))
  assert.deepEqual(textOf(chunks), [])
  assert.deepEqual(chunks.map(chunk => chunk.type), ['usage', 'finish'])
})

const EXPORT_PATH = 'C:\\work\\app\\.llm\\transcripts\\S1.txt'

test('the transcript sentence is the 3.17.1 Bxt transcriptPath text, byte for byte, with the path at its end', () => {
  const bundle = readFileSync(join(referenceDir(), 'zcode-3.17.1', 'zcode.cjs'), 'utf8')
  const match = /return t\.transcriptPath&&\(n\+=`([^`]*)\$\{t\.transcriptPath\}`\)/.exec(bundle)
  assert.ok(match !== null, 'the Bxt transcriptPath branch is in the reference bundle')
  assert.equal(transcriptNote(EXPORT_PATH), `${match[1]}${EXPORT_PATH}`)
  assert.ok(transcriptNote(EXPORT_PATH).startsWith('\n\nIf you need specific details from before compaction'))
})

test('with a transcript path the formatted summary ends with the sentence naming it, in the one text block', async () => {
  let calls = 0
  const transcript = (): Promise<string | undefined> => { calls += 1; return Promise.resolve(EXPORT_PATH) }
  const chunks = await collect(formatSummaryStream(adapter(['<analysis>a</analysis><summary>kept</summary>'])(), transcript))
  assert.deepEqual(textOf(chunks), [`Summary:\nkept${transcriptNote(EXPORT_PATH)}`])
  assert.equal(chunks.filter(chunk => chunk.type === 'block-start').length, 1)
  assert.equal(calls, 1)
  const none = await collect(formatSummaryStream(adapter(['<summary>kept</summary>'])(), () => Promise.resolve(undefined)))
  assert.deepEqual(textOf(none), ['Summary:\nkept'])
})

test('an analysis-only reply lands no text and never asks for the transcript', async () => {
  let calls = 0
  const chunks = await collect(formatSummaryStream(adapter(['<analysis>only analysis</analysis>'])(), () => { calls += 1; return Promise.resolve(EXPORT_PATH) }))
  assert.deepEqual(textOf(chunks), [])
  assert.equal(calls, 0)
})

test('the row asks the transcript service for the compacting session and appends the sentence only for a written file', async () => {
  for (const [answer, expected] of [
    [{ kind: 'written', path: EXPORT_PATH, entries: 3 }, `Summary:\nbody${transcriptNote(EXPORT_PATH)}`],
    [{ kind: 'skipped', reason: 'no project' }, 'Summary:\nbody'],
  ] as const) {
    const fake = fakeLlm(['<analysis>x</analysis><summary>body</summary>'])
    const asked: string[] = []
    const service = { exportBeforeCompaction: (sessionId: string) => { asked.push(sessionId); return Promise.resolve(answer) } }
    apply({ ...fake.ctx, get: name => name === TRANSCRIPT_SERVICE ? service : undefined })
    const chunks = await collect(fake.ctx.llm.stream({ ...compaction('glm-5.3'), sessionId: 'S1' }))
    assert.deepEqual(asked, ['S1'])
    assert.deepEqual(textOf(chunks), [expected])
  }
  // A non-GLM compaction passes through and never reaches the service.
  const fake = fakeLlm(['<summary>raw</summary>'])
  const asked: string[] = []
  apply({ ...fake.ctx, get: () => ({ exportBeforeCompaction: (sessionId: string) => { asked.push(sessionId); return Promise.resolve({ kind: 'written', path: EXPORT_PATH, entries: 1 }) } }) })
  const chunks = await collect(fake.ctx.llm.stream({ ...compaction('deepseek-flash'), sessionId: 'S2' }))
  assert.deepEqual(asked, [])
  assert.deepEqual(textOf(chunks), ['<summary>raw</summary>'])
})

test('a transcript service that rejects (a broken contract) leaves the summary as it is', async () => {
  const fake = fakeLlm(['<summary>body</summary>'])
  apply({ ...fake.ctx, get: () => ({ exportBeforeCompaction: () => Promise.reject(new Error('broken')) }) })
  const chunks = await collect(fake.ctx.llm.stream({ ...compaction('glm-5.3'), sessionId: 'S1' }))
  assert.deepEqual(textOf(chunks), ['Summary:\nbody'])
})

test('the row registers one outermost global llm/stream listener', () => {
  const registrations: Array<{ event: string, options?: { global?: boolean, prepend?: boolean } }> = []
  apply({ llm: { stream: () => (async function* () {})() }, on: (event, _listener, options) => { registrations.push({ event, ...(options === undefined ? {} : { options }) }); return () => {} } })
  assert.deepEqual(registrations, [{ event: 'llm/stream', options: { global: true, prepend: true } }])
})
