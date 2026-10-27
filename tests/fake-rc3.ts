/**
 * Test double of the rc.3 runtime surface the dialect rows touch
 * (docs/DESIGN.md §2.4a). It offers only what the desktop runtime offers:
 * scoped `tools.register(definition)`, `tools.get(name, scope)`, and the
 * agent-scoped waterfalls. The route reaches plugins solely through the
 * assembly variables, exactly as installModelSelection injects them.
 */
import type { AgentLike, AssemblePayload, AssembledTool, PluginContext, PostExecuteDecision, ToolDefinitionLike, ToolExecutionPayload } from '../src/shared/dsh-min.ts'

type Listener = (...args: never[]) => unknown

export interface FakeRuntime {
  readonly ctx: PluginContext
  readonly agent: AgentLike
  /** Natives registered globally, by name. */
  readonly natives: Map<string, ToolDefinitionLike>
  /** Scoped registrations made through the agent context. */
  readonly scoped: ToolDefinitionLike[]
  /** Every `on()` registration, in order. */
  readonly listeners: Array<{ event: string, listener: Listener, options?: { prepend?: boolean } }>
  /** Run the agent-scoped assemble waterfall with the route the model selection would inject. */
  assemble(route: { provider?: string, model?: string }, sections?: AssemblePayload['sections']): Promise<AssemblePayload>
  /** Fire `agent/created` for the fake agent. */
  create(): Promise<void>
  /** Run `tools/post-execute` for one completed call. */
  postExecute(exec: Omit<ToolExecutionPayload, 'agent'>): Promise<PostExecuteDecision>
  /** Execute a visible tool by name the way the runtime resolves calls (scoped shadows global). */
  execute(name: string, args: unknown): Promise<unknown>
}

function native(name: string, calls: Array<{ name: string, args: unknown }>): ToolDefinitionLike {
  return {
    name,
    description: `native ${name}`,
    parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'object' }, render: () => [{ type: 'text', text: name }] },
    async execute(args) { calls.push({ name, args }); return { ok: name } },
  }
}

export const NATIVE_NAMES = ['read', 'write', 'edit', 'glob', 'grep', 'pwsh', 'todo_write', 'web_fetch'] as const

export function fakeRuntime(options: { natives?: readonly string[], calls?: Array<{ name: string, args: unknown }> } = {}): FakeRuntime {
  const calls = options.calls ?? []
  const natives = new Map((options.natives ?? NATIVE_NAMES).map(name => [name, native(name, calls)]))
  const scoped: ToolDefinitionLike[] = []
  const listeners: FakeRuntime['listeners'] = []
  const visible = (): ToolDefinitionLike[] => {
    const byName = new Map(natives)
    for (const tool of scoped) byName.set(tool.name, tool)
    return [...byName.values()]
  }
  const ctx: PluginContext = {
    systemPrompt: { section: () => () => {} },
    tools: {
      register: definition => {
        scoped.push(definition)
        return () => { scoped.splice(scoped.indexOf(definition), 1) }
      },
      restrict: () => { throw new Error('rc.3 dialect must not restrict') },
      schemas: () => visible().map(tool => ({ name: tool.name })),
      get: name => visible().find(tool => tool.name === name),
    },
    on: ((event: string, listener: Listener, opts?: { prepend?: boolean }) => {
      const entry = { event, listener, ...(opts === undefined ? {} : { options: opts }) }
      if (opts?.prepend === true) listeners.unshift(entry)
      else listeners.push(entry)
      return () => { listeners.splice(listeners.indexOf(entry), 1) }
    }) as PluginContext['on'],
  }
  const agent: AgentLike = { id: 'agent-1', ctx }
  const of = (event: string) => listeners.filter(entry => entry.event === event).map(entry => entry.listener)
  return {
    ctx,
    agent,
    natives,
    scoped,
    listeners,
    async assemble(route, sections = [{ name: 'harness:identity', text: 'You are an AI agent powered by DeepSeek Harness.' }]) {
      const tools: AssembledTool[] = visible().map(tool => ({ name: tool.name, description: tool.description, parameters: tool.parameters }))
      // The model-selection listener (innermost) injects the route after its own next().
      const base = async (): Promise<AssemblePayload> => ({ sections, contexts: [], tools, variables: { ...route } })
      const chain = of('system-prompt/assemble').reduceRight<() => Promise<AssemblePayload>>(
        (next, listener) => async () => (listener as unknown as (a: AssemblePayload, c: unknown, n: () => Promise<AssemblePayload>) => Promise<AssemblePayload>)({ sections, contexts: [], tools, variables: {} }, undefined, next),
        base,
      )
      return chain()
    },
    async create() {
      for (const listener of of('agent/created')) await (listener as unknown as (p: { agent: AgentLike }) => unknown)({ agent })
    },
    async postExecute(exec) {
      const chain = of('tools/post-execute').reduceRight<() => Promise<PostExecuteDecision>>(
        (next, listener) => async () => (listener as unknown as (e: ToolExecutionPayload, r: unknown, n: () => Promise<PostExecuteDecision>) => Promise<PostExecuteDecision>)({ ...exec, agent }, undefined, next),
        async () => ({ kind: 'accept' }),
      )
      return chain()
    },
    async execute(name, args) {
      const tool = visible().find(candidate => candidate.name === name)
      if (tool === undefined) throw new Error(`unknown tool "${name}"`)
      return tool.execute(args, { agent })
    },
  }
}
