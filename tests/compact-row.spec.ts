import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, formatSummaryStream, withZcodeInstruction, type CompactRowContext, type StreamChunk, type StreamOptions } from '../src/glm-prompt/compact-row.ts'

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
  const sent = dispatched[0]!
  assert.equal(sent.maxTokens, 4096)
  assert.deepEqual(sent.messages.slice(0, -1), prefix) // the replayed prefix is kept for cache reuse
  const final = sent.messages.at(-1) as { role: string, content: Array<{ text: string }> }
  assert.equal(final.role, 'user')
  assert.ok(final.content[0]!.text.startsWith('CRITICAL: Respond with TEXT ONLY.'))
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

test('the row registers one outermost global llm/stream listener', () => {
  const registrations: Array<{ event: string, options?: { global?: boolean, prepend?: boolean } }> = []
  apply({ llm: { stream: () => (async function* () {})() }, on: (event, _listener, options) => { registrations.push({ event, ...(options === undefined ? {} : { options }) }); return () => {} } })
  assert.deepEqual(registrations, [{ event: 'llm/stream', options: { global: true, prepend: true } }])
})
