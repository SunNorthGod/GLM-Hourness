/**
 * L3 probe provider (docs/DEVELOPMENT.md §3, ROADMAP M1.7): a scripted LLM
 * adapter for the real DSH runtime. It registers provider `glm-probe` with
 * model `glm-5.3`, so the GLM-Hourness dialect sees a GLM route without any
 * network call. Every request the runtime sends is appended to the dump file
 * (system prompt, tool face, message summary); the reply follows the script.
 *
 * The model catalog (ids and input modalities) and the image request target
 * come from the built glm-zcode channel (dist/), and each request is also
 * run through the channel's real encoder with the runtime's attachment
 * service, so the dump shows the image blocks glm-zcode would send.
 *
 * Not part of the bundle: loaded only through the overlay that
 * scripts/probe/run-probe.mjs generates for each run.
 */
import { appendFileSync } from 'node:fs'
import { GLM_MODELS, glmInputModalities } from '../../dist/glm-llm/lm-min.js'
import { asAttachments, glmImageRequestTarget, prepareRequestImages } from '../../dist/glm-llm/images.js'
import { encodeRequest, splitSystemPrompt } from '../../dist/glm-llm/anthropic.js'

export const name = 'glm-hourness-probe/llm'
export const inject = ['llm']

/** Reply to compaction summaries, in the shape the ZCode compact prompt asks for. */
const COMPACTION_REPLY = '<analysis>probe analysis</analysis>\n\n<summary>probe summary</summary>'

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
  const images = parts.filter(part => part.type === 'image').length
  return {
    role: message.role,
    text: text.slice(0, 4000),
    ...(images === 0 ? {} : { images }),
    ...(message.toolCallId === undefined ? {} : { toolCallId: message.toolCallId }),
    ...(message.isError === undefined ? {} : { isError: message.isError }),
    // rc.3 carries assistant tool calls as tool-call content blocks.
    ...(parts.some(part => part.type === 'tool-call') ? { toolCalls: parts.filter(part => part.type === 'tool-call').map(part => part.name) } : {}),
    ...(message.source === undefined ? {} : { source: message.source.kind }),
  }
}

/** Image blocks of an encoded glm-zcode body: where they sit, media type, base64 length, PNG signature. */
function wireImages(body) {
  const summary = block => ({ mediaType: block.source.media_type, base64Length: block.source.data.length, png: block.source.data.startsWith('iVBORw0KGgo') })
  return body.messages.flatMap(message => message.content.flatMap((block) => {
    if (block.type === 'image') return [{ where: 'user', ...summary(block) }]
    if (block.type === 'tool_result' && Array.isArray(block.content)) return block.content.filter(part => part.type === 'image').map(part => ({ where: 'tool_result', ...summary(part) }))
    return []
  }))
}

class ProbeAdapter {
  constructor(ctx, config) {
    this.ctx = ctx
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
  imageRequestTarget(_provider, _model, image) { return glmImageRequestTarget(image) }
  listModels(provider) { return Promise.resolve(GLM_MODELS.map(model => ({ provider, id: model.id, name: `${model.name} (probe)`, inputModalities: [...model.inputModalities] }))) }
  resolveModel(provider, model) {
    return Promise.resolve({
      provider,
      id: model,
      name: model,
      inputModalities: [...glmInputModalities(model)],
      context: { contextWindow: 200_000 },
      defaultMaxTokens: 32000,
      // Same route metadata as the glm-zcode adapter (catalog modalities, no
      // in-history updates), so the runtime shapes the request as for GLM.
      reasoning: { efforts: [{ id: 'high', name: 'High', description: 'probe' }], defaultEffort: 'high' },
    })
  }
  async prepareCall(provider, model) {
    return { model: await this.resolveModel(provider, model), stream: options => this.stream(options) }
  }

  async * stream(request) {
    // Only agent steps follow the script; side requests (session title,
    // compaction summaries) get fixed replies, so their timing cannot shift
    // the scripted sequence. Compaction requests carry tools too.
    const compaction = request.purpose === 'compaction'
    const scripted = !compaction && (request.tools ?? []).length > 0
    const step = scripted
      ? this.script[Math.min(this.calls, this.script.length - 1)]
      : { text: compaction ? COMPACTION_REPLY : 'Probe session' }
    if (scripted) this.calls += 1
    this.requests += 1
    if (this.dump !== undefined) {
      // The glm-zcode encoder over this exact request, with the runtime's
      // attachment and fs services (the channel row reads them the same way).
      let wire
      try {
        const { messages } = splitSystemPrompt(request)
        const fs = this.ctx.get('fs')
        const images = await prepareRequestImages(messages, asAttachments(this.ctx.get('attachments')), hostPath => fs?.processPathFromHostPath?.(hostPath), request.signal)
        wire = { images: wireImages(encodeRequest({ ...request, messages }, [], images)) }
      }
      catch (error) {
        wire = { error: error instanceof Error ? error.message : String(error) }
      }
      appendFileSync(this.dump, `${JSON.stringify({
        call: this.requests,
        provider: request.provider,
        model: request.model,
        wire,
        ...(request.purpose === undefined ? {} : { purpose: request.purpose }),
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
  return ctx.llm.registerAdapter(['glm-probe'], new ProbeAdapter(ctx, config))
}
