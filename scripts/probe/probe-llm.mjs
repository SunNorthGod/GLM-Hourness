/**
 * L3 probe provider (docs/DEVELOPMENT.md §3, ROADMAP M1.7): a scripted LLM
 * adapter for the real DSH runtime. It registers provider `glm-probe` with
 * model `glm-5.3`, so the GLM-Hourness dialect sees a GLM route without any
 * network call. Every request the runtime sends is appended to the dump file
 * (system prompt, tool face, message summary); the reply follows the script.
 *
 * The model catalog (ids and input modalities) and the image request target
 * come from the built glm-zcode channel (packages/glm/dist/), and each request is also
 * run through the channel's real encoder with the runtime's attachment
 * service, so the dump shows the image blocks glm-zcode would send. A
 * scripted step marked `status` also records what the bundle's `/glm-status`
 * command prints for the session at that point (credential line and row
 * health table); a step marked `live` records the graph panel's live view
 * of the session (the graphLive projection, src/graph/live.ts).
 *
 * Each session follows its own script: the first session that sends a
 * scripted request follows `script`; each later one (a subagent, or a
 * second root agent the dispatch spike creates) takes the next entry of
 * `others`, in the order of its first scripted request. A step marked `goal`
 * fills `goal_id` and `revision` of its `update_goal` calls (direct or
 * through DeferredToolCall) from the session's live goal.
 *
 * Not part of the bundle: loaded only through the overlay that
 * scripts/probe/run-probe.mjs generates for each run.
 */
import { appendFileSync } from 'node:fs'
import { GLM_MODELS, glmInputModalities } from '../../packages/glm/dist/glm-llm/models.js'
import { asAttachments, glmImageRequestTarget, prepareRequestImages } from '../../packages/glm/dist/glm-llm/images.js'
import { encodeRequest, splitSystemPrompt } from '../../packages/glm/dist/glm-llm/anthropic.js'

export const name = 'glm-hourness-probe/llm'
export const inject = ['llm']

/** Reply to compaction summaries, in the shape the ZCode compact prompt asks for. */
const COMPACTION_REPLY = '<analysis>probe analysis</analysis>\n\n<summary>probe summary</summary>'

/** One scripted reply per request, in order; the last entry repeats. Entries: `{ tool }`, `{ tools: [...] }` or `{ text }`, optionally with `status: true` or `goal: true`. */
function parseScript(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return [{ text: 'ok' }]
  return JSON.parse(raw)
}

/** The scripts of later sessions: a JSON array of scripts. */
function parseOthers(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return []
  return JSON.parse(raw)
}

/** `call` with `goal_id` and `revision` of `goal` filled into its update_goal arguments. */
function withGoal(call, goal) {
  if (goal === undefined) return call
  const ref = { goal_id: goal.id, revision: goal.revision }
  if (call.name === 'update_goal') return { ...call, arguments: { ...call.arguments, ...ref } }
  if (call.name === 'DeferredToolCall' && call.arguments?.name === 'update_goal') return { ...call, arguments: { ...call.arguments, input: { ...call.arguments.input, ...ref } } }
  return call
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
    // The graph step projection records why it was added (src/graph/reminder.ts).
    ...(typeof message.source?.graphProjection?.reason === 'string' ? { projection: message.source.graphProjection.reason } : {}),
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

/**
 * Run one of the bundle's real command handlers for the request's session,
 * the way dsh-commands `execute` invokes it (the exact agent, the raw
 * input), without the command lifecycle events: the agent is mid-step.
 */
async function runCommand(ctx, request, name, rawInput) {
  const agent = ctx.get('agents')?.get(request.sessionId)
  if (agent === undefined) return { kind: 'error', text: `probe: no live agent for session ${request.sessionId}` }
  const definition = ctx.get('commands')?.find(agent, name)
  if (definition === undefined) return { kind: 'error', text: `probe: /${name} is not registered` }
  const result = await definition.handler(Object.freeze({ commandId: `probe-${name}`, agent, rawInput, attachments: Object.freeze([]), signal: request.signal ?? new AbortController().signal }))
  return { kind: result.kind, text: result.text ?? '' }
}

/** The `/glm-status` text for the request's session. */
async function glmStatus(ctx, request) {
  return (await runCommand(ctx, request, 'glm-status', '')).text
}

/**
 * The projections the graph panel's live view reads for the request's
 * session (graphLive from src/graph/live.ts, DSH's subagentCatalog and
 * tokenUsage), from the session projection registry the way the client's
 * projection snapshot does; null when the registry or the agent is missing.
 */
function liveOf(ctx, request) {
  const session = ctx.get('agents')?.get(request.sessionId)?.session
  const projections = ctx.get('sessionProjections')
  if (session === undefined || typeof projections?.snapshot !== 'function') return null
  const { graphLive = null, subagentCatalog = null, tokenUsage = null } = projections.snapshot(session).values
  return { graphLive, subagentCatalog, tokenUsage }
}

class ProbeAdapter {
  constructor(ctx, config) {
    this.ctx = ctx
    this.dump = config.dump
    /** Unassigned scripts, in the order sessions claim them. */
    this.scripts = [parseScript(config.script), ...parseOthers(config.others)]
    /** Each session's script and the scripted (agent-step) requests it answered so far. */
    this.cursors = new Map()
    /** All requests answered so far, side requests included. */
    this.requests = 0
  }

  /** The cursor of a session, claiming the next unassigned script on its first scripted request. */
  cursorOf(sessionId) {
    let cursor = this.cursors.get(sessionId)
    if (cursor === undefined) {
      cursor = { script: this.scripts.shift() ?? [{ text: 'ok' }], calls: 0 }
      this.cursors.set(sessionId, cursor)
    }
    return cursor
  }

  /** The live goal of a request's session, if any. */
  goalOf(request) {
    const agent = this.ctx.get('agents')?.get(request.sessionId)
    return agent === undefined ? undefined : this.ctx.get('goals')?.get(agent)
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
    const cursor = scripted ? this.cursorOf(request.sessionId) : undefined
    const step = cursor === undefined
      ? { text: compaction ? COMPACTION_REPLY : 'Probe session' }
      : cursor.script[Math.min(cursor.calls, cursor.script.length - 1)]
    if (cursor !== undefined) cursor.calls += 1
    this.requests += 1
    // A step marked `status` records the /glm-status text before replying;
    // a step with `command: { name, input }` runs that command and records its result;
    // a step marked `live` records the graph panel's live view of the session.
    const status = step.status === true ? await glmStatus(this.ctx, request).catch(error => `probe: /glm-status failed: ${error instanceof Error ? error.message : String(error)}`) : undefined
    let live
    if (step.live === true) {
      try {
        live = liveOf(this.ctx, request)
      }
      catch (error) {
        live = { error: error instanceof Error ? error.message : String(error) }
      }
    }
    const command = step.command === undefined
      ? undefined
      : { name: step.command.name, ...await runCommand(this.ctx, request, step.command.name, step.command.input ?? '').catch(error => ({ kind: 'error', text: `probe: /${step.command.name} threw: ${error instanceof Error ? error.message : String(error)}` })) }
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
        // The runtime's wall clock at this request (the probe clock row may move it).
        clock: Date.now(),
        provider: request.provider,
        model: request.model,
        wire,
        ...(request.purpose === undefined ? {} : { purpose: request.purpose }),
        ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
        ...(status === undefined ? {} : { status }),
        ...(command === undefined ? {} : { command }),
        ...(live === undefined ? {} : { live }),
        // The runtime delivers the prompt as leading system messages (the
        // channel lifts them the same way, src/glm-llm/anthropic.ts).
        system: [request.system ?? '', ...leadingSystem(request.messages ?? [])].filter(text => text.length > 0).join('\n\n'),
        tools: (request.tools ?? []).map(tool => ({ name: tool.name, description: tool.description, parameters: tool.parameters, ...(tool.deferLoading === true ? { deferLoading: true } : {}) })),
        messages: (request.messages ?? []).map(summarizeMessage),
      })}\n`)
    }
    // A step calls one tool (`tool`) or several in one assistant turn (`tools`).
    const scriptedCalls = step.tools ?? (step.tool === undefined ? [] : [step.tool])
    const goal = step.goal === true ? this.goalOf(request) : undefined
    const calls = scriptedCalls.map(call => withGoal(call, goal))
    if (calls.length > 0) {
      for (const [index, call] of calls.entries()) {
        const id = `probe-call-${this.requests}-${index}`
        const args = JSON.stringify(call.arguments ?? {})
        yield { type: 'block-start', index, blockType: 'tool-call' }
        yield { type: 'tool-call-delta', index, id, name: call.name, argumentsDelta: '' }
        yield { type: 'block-end', index, block: { type: 'tool-call', id, name: call.name, arguments: args } }
      }
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
