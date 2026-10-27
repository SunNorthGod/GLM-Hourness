/**
 * L3 probe provider (docs/DEVELOPMENT.md §3, ROADMAP M1.7): a scripted LLM
 * adapter for the real DSH runtime. It registers provider `glm-probe` with
 * model `glm-5.3`, so the GLM-Hourness dialect sees a GLM route without any
 * network call. Every request the runtime sends is appended to the dump file
 * (system prompt, tool face, message summary); the reply follows the script.
 *
 * Not part of the bundle: loaded only through the overlay that
 * scripts/probe/run-probe.mjs generates for each run.
 */
import { appendFileSync } from 'node:fs'

export const name = 'glm-hourness-probe/llm'
export const inject = ['llm']

const MODEL = 'glm-5.3'

/** One scripted reply per request, in order; the last entry repeats. */
function parseScript(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return [{ text: 'ok' }]
  return JSON.parse(raw)
}

function leadingSystem(messages) {
  const texts = []
  for (const message of messages) {
    if (message.role !== 'system') break
    texts.push((message.content ?? []).map(part => part.text ?? '').join(''))
  }
  return texts
}

function summarizeMessage(message) {
  const parts = Array.isArray(message.content) ? message.content : []
  const text = parts.map(part => typeof part.text === 'string' ? part.text : '').join('\n')
  return {
    role: message.role,
    text: text.slice(0, 4000),
    ...(message.toolCallId === undefined ? {} : { toolCallId: message.toolCallId }),
    ...(message.isError === undefined ? {} : { isError: message.isError }),
    ...(Array.isArray(message.toolCalls) && message.toolCalls.length > 0 ? { toolCalls: message.toolCalls.map(call => call.name) } : {}),
    ...(message.source === undefined ? {} : { source: message.source.kind }),
  }
}

class ProbeAdapter {
  constructor(config) {
    this.dump = config.dump
    this.script = parseScript(config.script)
    /** Scripted (agent-step) requests answered so far. */
    this.calls = 0
    /** All requests answered so far, side requests included. */
    this.requests = 0
  }

  providerInfo(provider) { return { id: provider, name: 'GLM-Hourness probe' } }
  providerRetryPolicy() { return undefined }
  imageRequestPricing() { return undefined }
  imageRequestTarget(_provider, _model, image) { return { width: image.width, height: image.height, maxBytes: image.bytes } }
  listModels(provider) { return Promise.resolve([{ provider, id: MODEL, name: 'GLM-5.3 (probe)', inputModalities: ['text'] }]) }
  resolveModel(provider, model) {
    return Promise.resolve({
      provider,
      id: model,
      name: model,
      inputModalities: ['text'],
      context: { contextWindow: 200_000 },
      defaultMaxTokens: 32000,
      // Same route metadata as the glm-zcode adapter (no in-history updates),
      // so the runtime shapes the request exactly as it would for GLM.
      reasoning: { efforts: [{ id: 'high', name: 'High', description: 'probe' }], defaultEffort: 'high' },
    })
  }
  async prepareCall(provider, model) {
    return { model: await this.resolveModel(provider, model), stream: options => this.stream(options) }
  }

  async * stream(request) {
    // Only agent steps (requests that carry tools) follow the script; side
    // requests such as the session title get a fixed reply, so their timing
    // cannot shift the scripted sequence.
    const scripted = (request.tools ?? []).length > 0
    const step = scripted ? this.script[Math.min(this.calls, this.script.length - 1)] : { text: 'Probe session' }
    if (scripted) this.calls += 1
    this.requests += 1
    if (this.dump !== undefined) {
      appendFileSync(this.dump, `${JSON.stringify({
        call: this.requests,
        provider: request.provider,
        model: request.model,
        // The runtime delivers the prompt as leading system messages (the
        // channel lifts them the same way, src/glm-llm/anthropic.ts).
        system: [request.system ?? '', ...leadingSystem(request.messages ?? [])].filter(text => text.length > 0).join('\n\n'),
        tools: (request.tools ?? []).map(tool => ({ name: tool.name, description: tool.description, parameters: tool.parameters, ...(tool.deferLoading === true ? { deferLoading: true } : {}) })),
        messages: (request.messages ?? []).map(summarizeMessage),
      })}\n`)
    }
    if (step.tool !== undefined) {
      const id = `probe-call-${this.requests}`
      const args = JSON.stringify(step.tool.arguments ?? {})
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id, name: step.tool.name, argumentsDelta: '' }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: step.tool.name, arguments: args } }
      yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    const text = step.text ?? 'ok'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export function apply(ctx, config = {}) {
  return ctx.llm.registerAdapter(['glm-probe'], new ProbeAdapter(config))
}
