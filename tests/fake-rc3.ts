/**
 * Test double of the rc.3 runtime surface the dialect rows touch
 * (docs/DESIGN.md §2.4a). It offers only what the desktop runtime offers:
 * scoped `tools.register(definition)` (rejecting output schemas outside the
 * enforced subset), `tools.get(name, scope)`, `tools.execute(input)`
 * (gated by `tools/pre-execute`, validating success values against the
 * output schema), the agent-scoped waterfalls, the session's derived
 * history, and cordis `get` / `provide`. The route reaches plugins solely
 * through the assembly variables, exactly as installModelSelection injects
 * them.
 */
import type { AgentLike, AssemblePayload, AssembledTool, PluginContext, PreExecuteDecision, PreExecuteListener, PreStepDecision, PreStepPayload, ProvideHost, ServiceLookup, ToolDefinitionLike, ToolExecuteInput, ToolExecutionPayload, ToolFinalResult } from '../src/shared/dsh-min.ts'

type Listener = (...args: never[]) => unknown

/**
 * A cordis service store as far as the rows use it (rc.3 cordis
 * lib/index.js:763 `get`, :800 `provide`): `get` reads undefined until a
 * fiber provides the name, a second provider of the same name throws, and
 * the disposer unregisters.
 */
export function serviceStore(): ServiceLookup & ProvideHost & { readonly services: Map<string, unknown>, get(name: string): unknown } {
  const services = new Map<string, unknown>()
  return {
    services,
    get: (name: string) => services.get(name),
    provide: (name: string, value: unknown) => {
      if (services.has(name)) throw new Error(`service "${name}" has been registered`)
      services.set(name, value)
      return () => { services.delete(name) }
    },
  }
}

export interface FakeRuntime {
  /** The context every row receives; cordis contexts also read and provide services. */
  readonly ctx: PluginContext & ServiceLookup & ProvideHost
  /** The services provided through `ctx.provide`. */
  readonly services: Map<string, unknown>
  readonly agent: AgentLike
  /** Natives registered globally, by name. */
  readonly natives: Map<string, ToolDefinitionLike>
  /** Scoped registrations made through the agent context. */
  readonly scoped: ToolDefinitionLike[]
  /** Every `on()` registration, in order. */
  readonly listeners: Array<{ event: string, listener: Listener, options?: { prepend?: boolean } }>
  /** The session's request-visible history (`deriveMessages()` returns a copy). */
  readonly history: unknown[]
  /** Contexts tool bodies attached through `exec.deferContext`. */
  readonly deferred: unknown[]
  /** Every call `tools.execute` received. */
  readonly executed: ToolExecuteInput[]
  /** Run the agent-scoped assemble waterfall with the route the model selection would inject. */
  assemble(route: { provider?: string, model?: string }, sections?: AssemblePayload['sections']): Promise<AssemblePayload>
  /** Fire `agent/created` for the fake agent. */
  create(): Promise<void>
  /** Run `agent/pre-step` for one step; the runtime's default decision admits the claimed messages. */
  preStep(options?: { messages?: readonly unknown[], step?: number, turn?: number }): Promise<PreStepDecision>
  /** Execute a visible tool by name the way the runtime resolves calls (scoped shadows global); returns the body's value. */
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

const SCHEMA_CONSTRAINTS = new Set(['type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const'])
const SCHEMA_ANNOTATIONS = new Set(['description', 'title', 'default', 'examples'])
const SCHEMA_TYPES = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']
const BESIDE_ONE_OF = ['properties', 'required', 'additionalProperties', 'items', 'enum', 'const']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(entry => typeof entry === 'string')
}

function scalarMatches(type: string, value: unknown): boolean {
  switch (type) {
    case 'string': return typeof value === 'string'
    case 'number': return typeof value === 'number' && Number.isFinite(value)
    case 'integer': return Number.isInteger(value)
    case 'boolean': return typeof value === 'boolean'
    default: return value === null
  }
}

/**
 * Violations of the JSON Schema subset rc.3 enforces on tool output schemas
 * at `tools.register` (dsh-tools `assertSupportedJsonSchema`, tools:323,
 * called at tools:2978): `type` (one string) or `oneOf` (two or more
 * branches), object `properties` / `required` / boolean
 * `additionalProperties`, array `items`, scalar `enum` / `const`, and the
 * annotations description, title, default and examples.
 */
export function schemaViolations(schema: unknown, path = 'schema'): string[] {
  if (!isRecord(schema)) return [`${path} must be a schema object`]
  const out = Object.keys(schema).filter(key => !SCHEMA_CONSTRAINTS.has(key) && !SCHEMA_ANNOTATIONS.has(key)).map(key => `${path}.${key} is not a supported keyword`)
  const has = (key: string): boolean => Object.hasOwn(schema, key)
  if (has('type') && has('oneOf')) return [...out, `${path} cannot declare both type and oneOf`]
  if (has('oneOf')) {
    out.push(...BESIDE_ONE_OF.filter(has).map(key => `${path}.${key} is not supported beside oneOf`))
    const branches = schema.oneOf
    if (!Array.isArray(branches) || branches.length < 2) return [...out, `${path}.oneOf must be an array of at least two schemas`]
    return [...out, ...branches.flatMap((branch, index) => schemaViolations(branch, `${path}.oneOf[${index}]`))]
  }
  if (!has('type')) return [...out, ...BESIDE_ONE_OF.filter(has).map(key => `${path}.${key} requires type or oneOf`)]
  const type = schema.type
  if (typeof type !== 'string' || !SCHEMA_TYPES.includes(type)) return [...out, `${path}.type must be one of ${SCHEMA_TYPES.join('/')}`]
  const placement: Record<string, readonly string[]> = { properties: ['object'], required: ['object'], additionalProperties: ['object'], items: ['array'], enum: SCHEMA_TYPES.slice(2), const: SCHEMA_TYPES.slice(2) }
  out.push(...Object.entries(placement).filter(([key, types]) => has(key) && !types.includes(type)).map(([key]) => `${path}.${key} is not supported on type "${type}"`))
  if (type === 'object') {
    const properties = schema.properties
    if (has('properties') && !isRecord(properties)) out.push(`${path}.properties must be an object of schemas`)
    const declared = isRecord(properties) ? properties : {}
    for (const [key, child] of Object.entries(declared)) out.push(...schemaViolations(child, `${path}.properties.${key}`))
    const required = schema.required
    if (has('required')) {
      if (!isStringArray(required)) out.push(`${path}.required must be an array of strings`)
      else out.push(...required.filter(key => !Object.hasOwn(declared, key)).map(key => `${path}.required names "${key}" which is not in properties`))
    }
    if (has('additionalProperties') && typeof schema.additionalProperties !== 'boolean') out.push(`${path}.additionalProperties must be a boolean`)
  }
  else if (type === 'array') {
    if (has('items')) out.push(...schemaViolations(schema.items, `${path}.items`))
  }
  else {
    const allowed = schema.enum
    if (has('enum') && (!Array.isArray(allowed) || allowed.length === 0 || !allowed.every(entry => scalarMatches(type, entry)))) out.push(`${path}.enum must be a non-empty array of ${type} values`)
    if (has('const') && !scalarMatches(type, schema.const)) out.push(`${path}.const must be a ${type} value`)
  }
  return out
}

/**
 * Violations of a successful tool value against its output schema: rc.3
 * validates every body value before rendering it and turns a mismatch into
 * an error result (dsh-tools `createSuccessResult`, tools:3637–3640).
 */
function valueViolations(schema: Record<string, unknown>, value: unknown, path = 'value'): string[] {
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter(branch => valueViolations(branch as Record<string, unknown>, value, path).length === 0).length
    return matches === 1 ? [] : [`"${path}" must match exactly one oneOf branch (matched ${matches})`]
  }
  switch (schema.type) {
    case undefined: return []
    case 'object': {
      if (!isRecord(value)) return [`"${path}" must be an object`]
      const properties = isRecord(schema.properties) ? schema.properties : {}
      const out = ((schema.required ?? []) as string[]).filter(key => value[key] === undefined).map(key => `missing required property "${path}.${key}"`)
      for (const [key, child] of Object.entries(properties)) {
        if (value[key] !== undefined) out.push(...valueViolations(child as Record<string, unknown>, value[key], `${path}.${key}`))
      }
      if (schema.additionalProperties === false) out.push(...Object.keys(value).filter(key => !Object.hasOwn(properties, key)).map(key => `"${path}.${key}" is not a declared property (additionalProperties: false)`))
      return out
    }
    case 'array': {
      if (!Array.isArray(value)) return [`"${path}" must be an array`]
      const items = schema.items as Record<string, unknown> | undefined
      return items === undefined ? [] : value.flatMap((entry, index) => valueViolations(items, entry, `${path}[${index}]`))
    }
    default: {
      if (!scalarMatches(schema.type as string, value)) return [`"${path}" must be a ${String(schema.type)}`]
      if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return [`"${path}" must be one of ${JSON.stringify(schema.enum)}`]
      if (Object.hasOwn(schema, 'const') && value !== schema.const) return [`"${path}" must be ${JSON.stringify(schema.const)}`]
      return []
    }
  }
}

/**
 * `route` is the call config of the session's request header before any
 * assembly (rc.3 logs the header of every step before the model call);
 * each `assemble` then logs the route it was given, as the agent loop does.
 */
export function fakeRuntime(options: { natives?: readonly string[], calls?: Array<{ name: string, args: unknown }>, cwd?: string, route?: { provider?: string, model?: string } } = {}): FakeRuntime {
  const calls = options.calls ?? []
  let headerRoute = options.route
  const natives = new Map((options.natives ?? NATIVE_NAMES).map(name => [name, native(name, calls)]))
  const scoped: ToolDefinitionLike[] = []
  const listeners: FakeRuntime['listeners'] = []
  const history: unknown[] = []
  const deferred: unknown[] = []
  const executed: ToolExecuteInput[] = []
  let callCounter = 0
  const visible = (): ToolDefinitionLike[] => {
    const byName = new Map(natives)
    for (const tool of scoped) byName.set(tool.name, tool)
    return [...byName.values()]
  }
  const of = (event: string) => listeners.filter(entry => entry.event === event).map(entry => entry.listener)
  const execution = (callId: string, signal: AbortSignal, contexts: unknown[]) => ({
    callId,
    signal,
    deferContext(context: unknown) { contexts.push(context) },
    concludeTurn() {},
  })
  const store = serviceStore()
  const ctx: FakeRuntime['ctx'] = {
    get: store.get,
    provide: store.provide,
    tools: {
      register: definition => {
        const violations = schemaViolations(definition.output.schema)
        if (violations.length > 0) throw new TypeError(`unsupported JSON schema: ${violations.join('; ')}`)
        scoped.push(definition)
        return () => { scoped.splice(scoped.indexOf(definition), 1) }
      },
      get: name => visible().find(tool => tool.name === name),
      // Pipeline order of ToolRuntime.execute: pre-execute gate, body, output render, deferred contexts.
      async execute(input): Promise<ToolFinalResult> {
        executed.push(input)
        // prepareExecution (tools:3320–3321, 3337–3353): the waterfall defaults to allow; a deny reason
        // becomes the error result and the body never runs. ask and cancel are not modeled.
        const pending: ToolExecutionPayload = { name: input.name, arguments: input.arguments, ...(input.agent === undefined ? {} : { agent: input.agent }), ...(input.parent === undefined ? {} : { parent: input.parent }) }
        const gate = await of('tools/pre-execute').reduceRight<() => Promise<PreExecuteDecision>>(
          (next, listener) => async () => (listener as unknown as PreExecuteListener)(pending, next),
          () => Promise.resolve<PreExecuteDecision>({ kind: 'allow' }),
        )()
        if (gate.kind === 'deny') return { isError: true, content: [{ type: 'text', text: `Error: ${gate.reason}` }], error: { message: gate.reason } }
        if (gate.kind !== 'allow') throw new Error(`fake-rc3 does not model the ${gate.kind} decision`)
        const tool = visible().find(candidate => candidate.name === input.name)
        const contexts: unknown[] = []
        let result: ToolFinalResult
        try {
          if (tool === undefined) throw new Error(`unknown tool "${input.name}"`)
          const value = await tool.execute(input.arguments, { ...execution(input.callId, input.signal, contexts), ...(input.agent === undefined ? {} : { agent: input.agent }) })
          const violations = valueViolations(tool.output.schema, value)
          if (violations.length > 0) throw new Error(`tool "${tool.name}" returned an invalid value: ${violations.join('; ')}`)
          result = { isError: false, value, content: tool.output.render(input.arguments, value) }
        }
        catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          result = { isError: true, content: [{ type: 'text', text: `Error: ${message}` }], error: { message } }
        }
        return contexts.length > 0 ? { ...result, additionalContexts: contexts } : result
      },
    },
    on: ((event: string, listener: Listener, opts?: { prepend?: boolean }) => {
      const entry = { event, listener, ...(opts === undefined ? {} : { options: opts }) }
      if (opts?.prepend === true) listeners.unshift(entry)
      else listeners.push(entry)
      return () => { listeners.splice(listeners.indexOf(entry), 1) }
    }) as PluginContext['on'],
  }
  // rc.3 session header: `cwd` is present when the store recorded a working directory (session:1820–1826).
  const header = options.cwd === undefined ? { id: 'agent-1' } : { id: 'agent-1', cwd: options.cwd }
  // rc.3 Session.requestHeader(): the fold of the logged request headers (session:1612).
  const agent: AgentLike = { id: 'agent-1', ctx, session: { id: 'agent-1', header, deriveMessages: () => [...history], requestHeader: () => headerRoute === undefined ? undefined : { config: headerRoute } } }
  return {
    ctx,
    services: store.services,
    agent,
    natives,
    scoped,
    listeners,
    history,
    deferred,
    executed,
    async assemble(route, sections = [{ name: 'harness:identity', text: 'You are an AI agent powered by DeepSeek Harness.' }]) {
      const tools: AssembledTool[] = visible().map(tool => ({ name: tool.name, description: tool.description, parameters: tool.parameters }))
      headerRoute = route
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
    async preStep({ messages = [], step = 1, turn = 1 } = {}) {
      const payload: PreStepPayload = { agent, messages, signal: new AbortController().signal, step, turn }
      const chain = of('agent/pre-step').reduceRight<() => Promise<PreStepDecision>>(
        (next, listener) => async () => (listener as unknown as (p: PreStepPayload, n: () => Promise<PreStepDecision>) => Promise<PreStepDecision>)(payload, next),
        async () => ({ kind: 'enter', messages }),
      )
      return chain()
    },
    async execute(name, args) {
      const tool = visible().find(candidate => candidate.name === name)
      if (tool === undefined) throw new Error(`unknown tool "${name}"`)
      return tool.execute(args, { ...execution(`call-${++callCounter}`, new AbortController().signal, deferred), agent })
    },
  }
}
