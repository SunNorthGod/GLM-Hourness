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
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { DesignContext } from '../src/design/index.ts'
import type { AgentLike, AssemblePayload, AssembledSection, AssembledTool, CommandDefinitionLike, CommandExecutionLike, CommandResultLike, DesignAgentLike, DesignAgentsService, DesignInvocationLike, PreExecuteDecision, PreExecuteListener, PreStepDecision, PreStepPayload, SessionEventLike, SessionLike, SessionProjectionsService, ToolExecutionPayload, UserNotice } from '../src/shared/dsh-min.ts'
import { healthServiceName, type RowHealthView } from '../src/shared/health.ts'
import { fakeInjector, serviceStore } from './fake-rc3.ts'

interface LoggedEvent extends SessionEventLike {
  readonly time: number
}

type Header = SessionLike['header']

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
  assemble(options?: { readonly sections?: readonly AssembledSection[], readonly tools?: readonly AssembledTool[] }): Promise<AssemblePayload>
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
}

interface Cell {
  state: unknown
  observed: number
}

/** A host with a workspace directory tree in a temporary directory; `options.graph` false leaves the graph row's service out. */
export function designHost(options: { readonly graph?: boolean, readonly projections?: boolean, readonly persistence?: boolean, readonly dialect?: unknown } = {}): DesignHost {
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

  const injector = fakeInjector(options.projections === false ? {} : { sessionProjections: projections })

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
          const chain = listeners.reduceRight<() => Promise<AssemblePayload>>(
            (next, listener) => () => listener({ ...base, contexts: [], variables: {} }, undefined, next),
            () => Promise.resolve({ ...base, contexts: [], variables: {} }),
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
  }
}
