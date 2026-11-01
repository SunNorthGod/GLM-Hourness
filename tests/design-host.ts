/**
 * Test double of the rc.3 runtime surface the design row touches (docs/
 * DESIGN.md §2.4a): several root agents, each with its own session log and
 * its own scoped context; the commands service (`command/run` appended
 * before the handler, `command/done` after it settles, commands:327–395);
 * session projections folded lazily over the log, like
 * dsh-session-projection (`register`, `stateOf`, init with the inherited
 * event count); the agents registry (`get`, `roots`); a live agent's
 * `followup`, `steer`, `inject`, `whenIdle` (an idle agent that is woken
 * starts its first assembly before the call returns, agent-loop:800–807).
 * Services are those of the cordis store. Nothing the runtime does not do.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { DesignContext } from '../src/design/index.ts'
import type { AgentLike, AssemblePayload, AssembledSection, AssembledTool, CommandDefinitionLike, CommandExecutionLike, CommandResultLike, DesignAgentLike, DesignAgentsService, DesignInvocationLike, PreExecuteDecision, PreExecuteListener, PreStepDecision, PreStepPayload, SessionEventLike, SessionLike, SessionProjectionsService, ToolDefinitionLike, ToolExecutionContext, ToolExecutionPayload, ToolsLike, UserNotice } from '../src/shared/dsh-min.ts'
import { healthServiceName, type RowHealthView } from '../src/shared/health.ts'
import { fakeInjector, schemaViolations, serviceStore } from './fake-rc3.ts'

interface LoggedEvent extends SessionEventLike {
  readonly time: number
}

type Header = SessionLike['header']

/** What a tool call came to, as the runtime would hand it to the model: stopped by a gate, a tool error (`Error: ` and the JSON of its refusal) or a value. */
type ToolOutcome =
  | { readonly kind: 'denied', readonly reason: string }
  | { readonly kind: 'error', readonly error: { readonly code: string, readonly message: string, readonly field?: string, readonly hint: string } }
  | { readonly kind: 'ok', readonly value: Record<string, unknown> }

interface FakeSession extends SessionLike {
  readonly events: LoggedEvent[]
  /** The request-visible history `deriveMessages()` returns: what the steps admitted. */
  readonly history: unknown[]
  readonly inherited: number
  append(type: string, data: unknown): void
}

type AssembleListener = (assembly: AssemblePayload, context: unknown, next: () => Promise<AssemblePayload>) => Promise<AssemblePayload>
type PreStepListener = (payload: PreStepPayload, next: () => Promise<PreStepDecision>) => Promise<PreStepDecision>

export interface FakeAgent extends DesignAgentLike {
  readonly session: FakeSession
  status: 'idle' | 'running'
  /** Everything sent to the agent, in order. */
  readonly sent: Array<{ readonly via: 'followup' | 'inject' | 'steer', readonly message: UserNotice }>
  /** The assembly a followup that woke the idle agent started, before the call returned. */
  woken: Promise<AssemblePayload> | undefined
  /** The scoped `system-prompt/assemble` listeners, outermost first. */
  readonly listeners: AssembleListener[]
  /** Assemble one step the way the agent loop does: the base assembly through the agent's own listeners. */
  assemble(options?: { readonly sections?: readonly AssembledSection[], readonly tools?: readonly AssembledTool[], readonly variables?: Record<string, unknown> }): Promise<AssemblePayload>
  /** Run `agent/pre-step` for one step the way the agent loop does: the claimed messages through the scoped listeners; what the step admits is appended to the session history. Returns the decision. */
  step(options?: { readonly messages?: readonly unknown[], readonly step?: number }): Promise<PreStepDecision>
  /** The agent finishes its activity. */
  becomeIdle(): void
}

/** The row health the design row reported for an agent's session; undefined when it reported none. */
export function healthOf(host: DesignHost, agent: FakeAgent): { readonly state: string, readonly reason: string } | undefined {
  const report = (host.services.get(healthServiceName('design')) as RowHealthView).session(agent.id)
  return report === undefined ? undefined : { state: report.state, reason: report.reason }
}

export const BASE_TOOLS: readonly AssembledTool[] = ['read', 'write', 'edit', 'pwsh', 'ask_user_question', 'graph_show'].map(toolName => ({ name: toolName, description: toolName, parameters: { type: 'object', properties: {} } }))

const BASE_SECTIONS: readonly AssembledSection[] = [{ name: 'harness:identity', text: 'You are an AI agent powered by DeepSeek Harness.' }]

export interface DesignHost {
  readonly ctx: DesignContext
  readonly services: Map<string, unknown>
  /** The user directory the holder records live in (the data service's). */
  readonly userHome: string
  /** The project directory the violation journal is written under (the data service's). */
  readonly projectHome: string
  readonly workspace: (name: string) => string
  /** The node each session has in focus, as the graph row's `focusOf` reports it (session id to node id). */
  readonly focuses: Map<string, string>
  /** Registered commands by name. */
  readonly commands: Map<string, CommandDefinitionLike<DesignInvocationLike>>
  /** Every line the row itself ran through `commands.execute`, with the agent it ran on (not the lines the person types through `execute` below). */
  readonly executed: Array<{ readonly agentId: string, readonly line: string }>
  readonly agents: Map<string, FakeAgent>
  readonly projections: SessionProjectionsService
  readonly injector: ReturnType<typeof fakeInjector>
  /** Session ids `sessionPersistence.list()` reports (only when the service is provided). */
  readonly stored: string[]
  addAgent(id: string, options?: { readonly workspace?: string, readonly origin?: 'subagent', readonly parentSession?: string, readonly inheritFrom?: FakeAgent, readonly status?: 'idle' | 'running' }): FakeAgent
  /** Announce the agent to the row's `agent/created` listeners, awaiting them serially. */
  created(agent: AgentLike): Promise<void>
  /** Run a tool call through the row's `tools/pre-execute` listeners (outermost first) down to an allow, as the runtime does before it executes a call. */
  preExecute(agent: AgentLike, toolName: string, args: unknown, parent?: unknown): Promise<PreExecuteDecision>
  /** Run a command line as the person: `command/run`, the handler, `command/done` (held back until `holdDone` resolves). */
  execute(agent: FakeAgent, line: string, holdDone?: Promise<void>): Promise<CommandExecutionLike | undefined>
  /** Make `commands.execute` of the named command's line refuse, to model a failing /wish off. */
  failExecute(agentId: string, failure: 'undefined' | 'throw'): void
  /** The tools the row registered, by name. */
  readonly tools: Map<string, ToolDefinitionLike>
  /** The person sends a message in the agent's session, a little after whatever was written before it. */
  say(agent: FakeAgent, text: string): Promise<void>
  /** The model says something: an `assistant/message` with the text. */
  reply(agent: FakeAgent, text: string): void
  /** The model calls a tool as the runtime runs it: the call is logged, the gates of `tools/pre-execute` run, the body runs, the result is logged. */
  callTool(agent: FakeAgent, name: string, args: unknown): Promise<ToolOutcome>
  /** Run a tool body that was built by the test, not registered by the row, as a call of the model: logged, no gates. */
  invoke(agent: FakeAgent, tool: ToolDefinitionLike, args: unknown): Promise<ToolOutcome>
}

interface Cell {
  state: unknown
  observed: number
}

/** A host with a workspace directory tree in a temporary directory; `options.graph` false leaves the graph row's service out. */
export function designHost(options: { readonly graph?: boolean, readonly projections?: boolean, readonly persistence?: boolean, readonly dialect?: unknown, readonly tools?: boolean } = {}): DesignHost {
  const root = mkdtempSync(join(tmpdir(), 'design-host-'))
  const userHome = join(root, 'user')
  const store = serviceStore()
  const workspaces = new Map<string, string>()
  const workspace = (name: string): string => {
    const known = workspaces.get(name)
    if (known !== undefined) return known
    const dir = join(root, name)
    mkdirSync(join(dir, 'docs', 'graph'), { recursive: true })
    workspaces.set(name, dir)
    return dir
  }
  const commands = new Map<string, CommandDefinitionLike<DesignInvocationLike>>()
  const executed: DesignHost['executed'] = []
  const agents = new Map<string, FakeAgent>()
  const createdListeners: Array<(payload: { agent: AgentLike }) => Promise<void> | void> = []
  const gates: PreExecuteListener[] = []
  const stored: string[] = []
  const focuses = new Map<string, string>()
  const failures = new Map<string, 'undefined' | 'throw'>()
  let commandCounter = 0
  let callCounter = 0

  const registrations = new Map<string, Parameters<SessionProjectionsService['register']>[0]>()
  const cells = new Map<string, WeakMap<SessionLike, Cell>>()
  const projections: SessionProjectionsService = {
    register(definition) {
      if (registrations.has(definition.key)) throw new Error(`session projection key "${definition.key}" is already registered`)
      registrations.set(definition.key, definition)
      cells.set(definition.key, new WeakMap())
      return () => { registrations.delete(definition.key) }
    },
    snapshot: () => ({ values: {} }),
    stateOf(session, key) {
      const definition = registrations.get(key)
      const bySession = cells.get(key)
      if (definition === undefined || bySession === undefined) return undefined
      const log = (session as FakeSession).events
      let cell = bySession.get(session)
      if (cell === undefined) {
        cell = { state: definition.init(session.header, (session as FakeSession).inherited), observed: 0 }
        bySession.set(session, cell)
      }
      for (; cell.observed < log.length; cell.observed++) cell.state = definition.apply(cell.state as never, log[cell.observed] as never)
      return cell.state
    },
  }
  // The title unit the dsh-session-title row registers: the latest title text.
  projections.register({ key: 'title', stateVersion: 1, stateSchema: { parse: value => value }, init: () => null, apply: (state: never, event: never) => (event as SessionEventLike).type === 'session/title' ? ((event as SessionEventLike).data as { title: string }).title : state })

  // The tools service: registration checks the schemas against the subset rc.3 enforces; a name registered twice is refused.
  const tools = new Map<string, ToolDefinitionLike>()
  const toolsService: ToolsLike = {
    register(definition) {
      if (tools.has(definition.name)) throw new Error(`tool "${definition.name}" is already registered`)
      const violations = [...schemaViolations(definition.parameters, `${definition.name}.parameters`), ...schemaViolations(definition.output.schema, `${definition.name}.output`)]
      if (violations.length > 0) throw new Error(`tool "${definition.name}" has a schema outside the enforced subset: ${violations.join('; ')}`)
      tools.set(definition.name, definition)
      return () => { tools.delete(definition.name) }
    },
    get: name => tools.get(name),
    execute: () => Promise.reject(new Error('the design host runs tools through callTool')),
  }

  const logCall = (agent: FakeAgent, name: string, args: unknown): string => {
    const callId = `call-${++callCounter}`
    agent.session.append('assistant/message', { message: { id: `assistant-${agent.session.events.length}`, role: 'assistant', content: [{ type: 'tool-call', id: callId, name, arguments: JSON.stringify(args) }], source: { kind: 'model', provider: 'probe', model: 'probe' } }, turn: 1 })
    return callId
  }
  const logResult = (agent: FakeAgent, callId: string, text: string, isError: boolean): void => {
    agent.session.append('tool/result', { message: { id: `tool-${callId}`, role: 'tool', content: [{ type: 'text', text }], toolCallId: callId, ...isError ? { isError: true } : {}, source: { kind: 'tool', callId } } })
  }
  const runBody = async (agent: FakeAgent, tool: ToolDefinitionLike, args: unknown, callId: string): Promise<ToolOutcome> => {
    const exec: ToolExecutionContext = { callId, agent, signal: new AbortController().signal, deferContext: () => undefined, concludeTurn: () => undefined }
    try {
      const value = await tool.execute(args, exec)
      logResult(agent, callId, tool.output.render(args, value).map(part => part.text ?? '').join(''), false)
      return { kind: 'ok', value: value as Record<string, unknown> }
    }
    catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      logResult(agent, callId, `Error: ${text}`, true)
      return { kind: 'error', error: JSON.parse(text) as { code: string, message: string, field?: string, hint: string } }
    }
  }

  const injector = fakeInjector({ ...options.projections === false ? {} : { sessionProjections: projections }, ...options.tools === false ? {} : { tools: toolsService } })

  if (options.graph !== false) store.provide('glmHournessGraph', { dirFor: (cwd: string | undefined) => cwd === undefined ? undefined : resolve(cwd, 'docs/graph'), isGraphTool: () => false, focusOf: (session: SessionLike) => focuses.get(session.id) })
  const projectHome = join(root, 'project')
  store.provide('glmHournessData', { userHome, projectHome })
  const registry: DesignAgentsService = { get: id => agents.get(id), roots: () => [...agents.values()].filter(agent => agent.session.header.origin !== 'subagent') }
  store.provide('agents', registry)
  if (options.persistence === true) store.provide('sessionPersistence', { list: () => Promise.resolve(stored.map(id => ({ header: { id } }))) })
  if (options.dialect !== undefined) store.provide('glmHournessDialect', options.dialect)

  const ctx: DesignContext = {
    get: name => store.get(name),
    provide: (name, value) => store.provide(name, value),
    inject: injector.inject,
    commands: {
      register(definition) {
        if (commands.has(definition.name)) throw new Error(`command "${definition.name}" is already registered`)
        commands.set(definition.name, definition)
        return () => { commands.delete(definition.name) }
      },
      execute: (agent, line, _attachments, signal) => {
        executed.push({ agentId: agent.id, line })
        const failure = failures.get(agent.id)
        if (failure === 'throw') return Promise.reject(new Error('agent released'))
        if (failure === 'undefined') return Promise.resolve(undefined)
        return run(agent as FakeAgent, line, signal, undefined)
      },
    },
    on: ((event: string, listener: never, listenerOptions?: { readonly prepend?: boolean }) => {
      if (event === 'tools/pre-execute') {
        // Like cordis: a prepended listener is the outermost.
        if (listenerOptions?.prepend === true) gates.unshift(listener)
        else gates.push(listener)
        return () => { gates.splice(gates.indexOf(listener), 1) }
      }
      createdListeners.push(listener)
      return () => { createdListeners.splice(createdListeners.indexOf(listener), 1) }
    }),
  }

  async function run(agent: FakeAgent, line: string, signal: AbortSignal, holdDone: Promise<void> | undefined): Promise<CommandExecutionLike | undefined> {
    const parsed = /^\/([a-z][a-z0-9_-]*)(?:\s+([\s\S]*))?$/.exec(line.trim())
    const definition = parsed === null ? undefined : commands.get(parsed[1] ?? '')
    if (parsed === null || definition === undefined) return undefined
    if (signal.aborted) throw new Error('aborted')
    const commandId = `cmd-${++commandCounter}`
    const rawInput = parsed[2] ?? ''
    agent.session.append('command/run', { commandId, name: definition.name, ...definition.recordInput === false ? {} : { args: rawInput }, source: { kind: 'user' } })
    let result: CommandResultLike
    try {
      result = await definition.handler(Object.freeze({ commandId, agent, rawInput, attachments: [], signal }))
      if (holdDone !== undefined) await holdDone
    }
    catch (error) {
      agent.session.append('command/done', { commandId, kind: 'error', text: error instanceof Error ? error.message : String(error) })
      throw error
    }
    agent.session.append('command/done', { commandId, kind: result.kind, text: result.text })
    return { commandId, result }
  }

  return {
    ctx,
    services: store.services,
    userHome,
    projectHome,
    workspace,
    focuses,
    commands,
    executed,
    agents,
    projections,
    injector,
    stored,
    addAgent(id, agentOptions = {}) {
      const cwd = workspace(agentOptions.workspace ?? 'ws')
      const header: Header = { id, cwd, ...agentOptions.origin === undefined ? {} : { origin: agentOptions.origin }, ...agentOptions.parentSession === undefined ? {} : { parentSession: agentOptions.parentSession } }
      const inheritedEvents = agentOptions.inheritFrom?.session.events ?? []
      const events: LoggedEvent[] = inheritedEvents.map(event => ({ ...event }))
      const history: unknown[] = []
      const session: FakeSession = {
        id,
        header,
        events,
        history,
        inherited: events.length,
        deriveMessages: () => [...history],
        snapshotEvents: () => [...events],
        append(type, data) { events.push({ type, seq: events.length, time: Date.now(), data }) },
      }
      const idleWaiters: Array<() => void> = []
      const listeners: AssembleListener[] = []
      const preStepListeners: PreStepListener[] = []
      const agentCtx = {
        on: (event: string, listener: AssembleListener | PreStepListener, opts?: { prepend?: boolean }) => {
          if (event === 'agent/pre-step') {
            preStepListeners.push(listener as PreStepListener)
            return () => { preStepListeners.splice(preStepListeners.indexOf(listener as PreStepListener), 1) }
          }
          if (event !== 'system-prompt/assemble') throw new Error(`fake agent context does not model ${event}`)
          if (opts?.prepend === true) listeners.unshift(listener as AssembleListener)
          else listeners.push(listener as AssembleListener)
          return () => { listeners.splice(listeners.indexOf(listener as AssembleListener), 1) }
        },
      } as unknown as DesignAgentLike['ctx']
      const agent: FakeAgent = {
        id,
        session,
        ctx: agentCtx,
        status: agentOptions.status ?? 'idle',
        sent: [],
        woken: undefined,
        listeners,
        assemble(assembleOptions = {}) {
          const base = { sections: assembleOptions.sections ?? BASE_SECTIONS, tools: assembleOptions.tools ?? BASE_TOOLS }
          // The model-selection listener, innermost, injects the route into the variables after its own next() (rc.3); a test that needs a route passes it here.
          const variables = assembleOptions.variables ?? {}
          const chain = listeners.reduceRight<() => Promise<AssemblePayload>>(
            (next, listener) => () => listener({ ...base, contexts: [], variables: {} }, undefined, next),
            () => Promise.resolve({ ...base, contexts: [], variables: { ...variables } }),
          )
          return chain()
        },
        async step(stepOptions = {}) {
          const messages = stepOptions.messages ?? []
          const payload: PreStepPayload = { agent, messages, signal: new AbortController().signal, turn: 1, step: stepOptions.step ?? 2 }
          const chain = preStepListeners.reduceRight<() => Promise<PreStepDecision>>(
            (next, listener) => () => listener(payload, next),
            () => Promise.resolve({ kind: 'enter', messages }),
          )
          const decision = await chain()
          if (decision.kind === 'enter') history.push(...decision.messages)
          return decision
        },
        followup(message) {
          this.sent.push({ via: 'followup', message })
          if (this.status === 'idle') this.woken = this.assemble()
        },
        steer(message) { this.sent.push({ via: 'steer', message }) },
        inject(message) { this.sent.push({ via: 'inject', message }) },
        cancel() {},
        whenIdle: () => agent.status === 'idle' ? Promise.resolve() : new Promise<void>(resolve => { idleWaiters.push(resolve) }),
        becomeIdle() {
          this.status = 'idle'
          for (const resolve of idleWaiters.splice(0)) resolve()
        },
      }
      agents.set(id, agent)
      return agent
    },
    async created(agent) {
      for (const listener of createdListeners) await listener({ agent })
    },
    preExecute(agent, toolName, args, parent) {
      const payload: ToolExecutionPayload = { name: toolName, arguments: args, agent, ...parent === undefined ? {} : { parent } }
      const chain = gates.reduceRight<() => Promise<PreExecuteDecision>>((next, listener) => () => listener(payload, next), () => Promise.resolve({ kind: 'allow' }))
      return chain()
    },
    execute: (agent, line, holdDone) => {
      return run(agent, line, new AbortController().signal, holdDone)
    },
    failExecute: (agentId, failure) => { failures.set(agentId, failure) },
    tools,
    async say(agent, text) {
      await new Promise<void>(resolve => { setTimeout(resolve, 4) })
      agent.session.append('user/message', { id: `user-${agent.session.events.length}`, role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } })
    },
    reply(agent, text) {
      agent.session.append('assistant/message', { message: { id: `assistant-${agent.session.events.length}`, role: 'assistant', content: [{ type: 'text', text }], source: { kind: 'model', provider: 'probe', model: 'probe' } }, turn: 1 })
    },
    async callTool(agent, name, args) {
      const callId = logCall(agent, name, args)
      const chain = gates.reduceRight<() => Promise<PreExecuteDecision>>((next, listener) => () => listener({ name, arguments: args, agent } satisfies ToolExecutionPayload, next), () => Promise.resolve({ kind: 'allow' }))
      const decision = await chain()
      if (decision.kind !== 'allow') {
        const reason = decision.kind === 'deny' ? decision.reason : decision.kind
        logResult(agent, callId, `Error: ${reason}`, true)
        return { kind: 'denied', reason }
      }
      const tool = tools.get(name)
      if (tool === undefined) throw new Error(`no tool "${name}" is registered`)
      return runBody(agent, tool, args, callId)
    },
    invoke(agent, tool, args) {
      return runBody(agent, tool, args, logCall(agent, tool.name, args))
    },
  }
}

export const sleep = (ms: number): Promise<void> => new Promise(resolve => { setTimeout(resolve, ms) })

/** The reason of a call the rules denied; fails the test for any other decision. */
export function denied(decision: PreExecuteDecision): string {
  assert.equal(decision.kind, 'deny', JSON.stringify(decision))
  return (decision as { reason: string }).reason
}

/** The lines of the violation journal once there are `count` of them (the row writes them without waiting). */
export async function journaled(host: DesignHost, count: number): Promise<Array<Record<string, unknown>>> {
  const file = join(host.projectHome, 'audit', 'violations.jsonl')
  for (let attempt = 0; attempt < 200; attempt++) {
    const rows = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(line => line !== '').map(line => JSON.parse(line) as Record<string, unknown>) : []
    if (rows.length >= count) return rows
    await sleep(10)
  }
  assert.fail(`the violation journal never reached ${count} lines`)
}

/** A host where the talk projection cannot be registered (its key is taken), so the tools read the session log instead. */
export function hostWithoutTalkProjection(): DesignHost {
  const host = designHost()
  const register = host.projections.register.bind(host.projections)
  host.projections.register = (definition) => {
    if (definition.key === 'hournessTalk') throw new Error('projection key is taken')
    return register(definition)
  }
  return host
}