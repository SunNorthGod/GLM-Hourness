import assert from 'node:assert/strict'
import test from 'node:test'
import { makeGlmCompactionEngine, summarizeGlm, type BaseEngine, type SummarizeInput } from '../src/glm-prompt/compact-engine.ts'

function fakeLlm(script: string[]) {
  const requests: unknown[] = []
  const stream = async function* (options: unknown) {
    requests.push(options)
    yield { type: 'block-start', blockType: 'text' }
    for (const text of script) {
      yield { type: 'block-end', block: { type: 'text', text } }
    }
    yield { type: 'usage', usage: { inputTokens: 7, outputTokens: 3 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  return { ctx: { llm: { stream } }, requests }
}

test('summarizeGlm replays the prefix and lands the ZCode instruction as the final user message', async () => {
  const { ctx, requests } = fakeLlm(['<analysis>x</analysis><summary>checkpoint body</summary>'])
  const input: SummarizeInput = {
    tools: [{ name: 'Read' }],
    messages: [{ role: 'system', content: [{ type: 'text', text: 'dialect' }] }],
  }
  const result = await summarizeGlm(
    ctx,
    { provider: 'glm', model: 'glm-5.3' },
    { maxTokens: 4096 },
    input,
    { session: { id: 's1', toolHistory: () => ({}) }, options: { provider: 'glm', model: 'glm-5.3' } },
  )
  const options = requests[0] as { messages: unknown[], purpose: string, provider: string, tools: unknown[], maxTokens: number, sessionId: string }
  assert.equal(options.purpose, 'compaction')
  assert.equal(options.provider, 'glm')
  assert.equal(options.maxTokens, 4096)
  const final = options.messages.at(-1) as { role: string, content: Array<{ type: string, text: string }> }
  assert.equal(final.role, 'user')
  assert.ok(final.content[0]!.text.startsWith('CRITICAL: Respond with TEXT ONLY.'))
  assert.equal(result.provider, 'glm')
  // Official post-processing over the joined stream text: analysis stripped,
  // summary tag rewritten with the "Summary:" header.
  assert.deepEqual(result.summary, [{ type: 'text', text: 'Summary:\ncheckpoint body' }])
  assert.deepEqual(result.usage, { inputTokens: 7, outputTokens: 3 })
})

test('engine delegates non-glm routes to the base summarize', async () => {
  const calls: string[] = []
  const Base = class {
    async summarize(): Promise<unknown> { calls.push('base'); return { summary: [] } }
  } as unknown as BaseEngine
  const engine = makeGlmCompactionEngine(Base, { llm: { stream: async function* () {} } }, {})
  const owner = { options: { provider: 'deepseek' }, session: { requestHeader: () => ({ config: { provider: 'deepseek', model: 'x' } }) } }
  await engine.summarize({ messages: [] }, owner as never)
  assert.deepEqual(calls, ['base'])
})

test('engine takes the glm branch for glm routes', async () => {
  const Base = class {
    ctx: unknown
    constructor(ctx: unknown) { this.ctx = ctx }
    async summarize(): Promise<unknown> { throw new Error('base should not run') }
  } as unknown as BaseEngine
  const { ctx, requests } = fakeLlm(['<summary>s</summary>'])
  const engine = makeGlmCompactionEngine(Base, ctx, {})
  const owner = { options: { provider: 'glm' }, session: { requestHeader: () => ({ config: { provider: 'glm', model: 'glm-5.3' } }) } }
  const result = await engine.summarize({ messages: [] }, owner as never)
  assert.deepEqual(result.summary, [{ type: 'text', text: 'Summary:\ns' }])
  assert.equal(requests.length, 1)
})

test('analysis blocks split across stream blocks are still stripped', async () => {
  const { ctx } = fakeLlm(['<analysis>first', ' half</analysis><summary>kept</summary>'])
  const result = await summarizeGlm(ctx, { provider: 'glm', model: 'm' }, {}, { messages: [] }, { session: {}, options: {} })
  assert.deepEqual(result.summary, [{ type: 'text', text: 'Summary:\nkept' }])
})

test('empty glm summaries fail loud', async () => {
  const { ctx } = fakeLlm(['<analysis>only analysis</analysis>'])
  await assert.rejects(
    summarizeGlm(ctx, { provider: 'glm', model: 'm' }, {}, { messages: [] }, { session: {}, options: {} }),
    /no text summary content/,
  )
})
