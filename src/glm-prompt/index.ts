/**
 * dsh-glm-prompt — dialect row: in glm sessions the model-visible prompt and
 * tool surface mirror the ZCode training distribution.
 *
 * Activation seam: the `system-prompt/assemble` waterfall carries the
 * resolved model route in `assembly.variables` (injected by the harness
 * model-selection listener), and the final prompt renders after the
 * waterfall — a prepend-registered listener rewrites the assembled sections
 * per request (see assembly.ts). The native-tool restriction follows the same
 * route through the agent hooks where builds still expose it; rc builds that
 * dropped `modelSelection` from those hooks keep the native face untouched.
 * Non-glm assemblies pass through unchanged; a disabled row changes nothing.
 */
import { buildIdentitySection } from './identity.ts'
import { aliasSpecs, buildAlias, hiddenNatives } from './aliases.ts'
import { CLI_PREFIX, DEFERRED_DECLARATION } from './verbatim.ts'
import { personaSection, type PersonaLevel } from './persona.ts'
import { buildEnvInfoSection, CONTEXT_MANAGEMENT_DSH, MEMORY_SECTION_DSH, SESSION_GUIDANCE_DSH, SKILLS_NOTE_DSH } from './localize.ts'
import { rewriteDialectAssembly, isGlmAssembly } from './assembly.ts'
import type { AssemblePayload } from '../shared/dsh-min.ts'
import {
  mapTodoWriteToDsh,
  zcodeTodoWriteDescription,
  zcodeTodoWriteSchema,
} from './todowrite.ts'
import type { AgentLike, ModelSelection, PluginContext, ToolDefinitionLike, UserNotice } from '../shared/dsh-min.ts'
import Schema from '../shared/schemastery.ts'
import { PERSONA_LEVELS } from './persona.ts'
import { createUserNotice } from '../shared/dsh-min.ts'
import { initialReminderState, observeToolCall, type ReminderState } from './todo-reminder.ts'

/** Row config. */
export interface GlmPromptConfig {
  /** Reporting-depth standing preference for the persona slider. */
  readonly persona?: PersonaLevel
  /** Tier: coding-plan (localized, default) or start-plan (byte-identical official mirror). */
  readonly tier?: 'coding-plan' | 'start-plan'
  /** Host facts for the Environment section (ledger ③); omitted skips the section. */
  readonly env?: { cwd: string, platform: string, shell: string, osVersion: string, isGitRepository: boolean, additionalDirectories?: readonly string[], modelLine?: string }
  /** Whether user-invocable skills exist (ledger ⑤ adds the skills note). */
  readonly skills?: boolean
  /** Whether the toolsearch row ships, so the deferred-tools declaration is honest. Default true. */
  readonly toolsearch?: boolean
  /** Optional append-only diagnostic log of dialect synchronization decisions; omitted disables logging. */
  readonly initLogPath?: string
}

/** Runtime Config schema: exposes the row knobs (reporting depth included) as real switches in the DSH plugin manager. */
export const Config = Schema.object({
  persona: Schema.union(PERSONA_LEVELS.map(level => Schema.const(level.id))).default('balanced').description('Reporting-depth standing preference for the persona slider.'),
  tier: Schema.union(['coding-plan', 'start-plan'].map(value => Schema.const(value))).default('coding-plan').description('Tier: coding-plan (localized ledger) or start-plan (verbatim official mirror).'),
  env: (() => { const env = Schema.object({
    cwd: Schema.string().required().description('Working directory shown in the Environment section.'),
    platform: Schema.string().required(),
    shell: Schema.string().required(),
    osVersion: Schema.string().required(),
    isGitRepository: Schema.boolean().required(),
    additionalDirectories: Schema.array(Schema.string()),
    modelLine: Schema.string(),
  }); delete (env.meta as { default?: unknown }).default; return env })().description('Host facts for the Environment section; omitted skips the section.'),
  skills: Schema.boolean().default(false).description('Whether user-invocable skills exist (adds the skills note).'),
  toolsearch: Schema.boolean().default(true).description('Whether the toolsearch row ships, keeping the deferred-tools declaration honest.'),
  initLogPath: Schema.string().description('Optional append-only diagnostic log path; omitted disables logging.'),
})

/** Order of the harness identity section this row shadows (SECTION_ORDERS.HARNESS_IDENTITY). */
const HARNESS_IDENTITY_ORDER = -1000

/** Provider id this dialect row activates on. */
const GLM_PROVIDER = 'glm'

function isGlm(selection: ModelSelection | undefined): boolean {
  // Some harness builds omit `provider` on the agent route (desktop rc builds
  // keep only `model`), so the model name is the fallback signal.
  return selection?.provider === GLM_PROVIDER || (selection?.model?.startsWith('glm') ?? false)
}

/** Sections the dialect adds beyond the shadowed identity. Tier selects the localization ledger (03 §10). */
export function dialectSections(outputStyleActive = false, persona: PersonaLevel = 'balanced', config: GlmPromptConfig = {}): Array<{ name: string, order: number, text: string }> {
  const codingTier = (config.tier ?? 'coding-plan') === 'coding-plan'
  const sections: Array<{ name: string, order: number, text: string }> = [
    { name: 'glm:cli-prefix', order: -1001, text: CLI_PREFIX },
    // Same name as the DSH identity section: a scoped same-name registration
    // shadows the global one; a fresh name would only stack beside it.
    { name: 'harness:identity', order: HARNESS_IDENTITY_ORDER, text: buildIdentitySection(outputStyleActive, codingTier ? 'user' : 'official', codingTier ? 'dsh' : 'verbatim') },
    ...(codingTier && config.env !== undefined
      ? [{ name: 'glm:environment', order: -900, text: buildEnvInfoSection(config.env) }]
      : []),
    personaSection(persona),
    ...(codingTier
      ? [
          { name: 'glm:session-guidance', order: 2300, text: config.skills === true ? [SESSION_GUIDANCE_DSH, SKILLS_NOTE_DSH].join('\n') : SESSION_GUIDANCE_DSH },
          { name: 'glm:memory', order: 2350, text: MEMORY_SECTION_DSH },
          { name: 'glm:context-management', order: 2400, text: CONTEXT_MANAGEMENT_DSH },
        ]
      : []),
    ...((config.toolsearch ?? true) === true
      ? [{ name: 'glm:deferred-tools', order: 2500, text: DEFERRED_DECLARATION }]
      : []),
  ]
  return sections
}

/** ZCode TodoWrite alias delegating to the DSH todo_write executor (via ctx at init). */
export function todoWriteAliasTool(delegate: (args: { todos: Array<{ content: string, status: string }> }, exec: unknown) => Promise<unknown>, nativeOutput?: ToolDefinitionLike['output']): ToolDefinitionLike {
  return {
    name: 'TodoWrite',
    description: zcodeTodoWriteDescription,
    parameters: zcodeTodoWriteSchema,
    output: nativeOutput ?? {
      schema: { type: 'object', properties: { todos: { type: 'array' } } },
      render: () => [{ type: 'text', text: 'todo list updated' }],
    },
    async execute(args, exec) {
      return delegate(mapTodoWriteToDsh(args as import('./json.ts').JsonValue), exec)
    },
  }
}

/** Native tool names the dialect hides once its aliases cover them. */
export const dialectHiddenNatives: readonly string[] = hiddenNatives

/**
 * Register the per-agent assembly rewrite: a prepend-registered
 * `system-prompt/assemble` listener rewrites the final sections from the
 * route-bearing variables (the rc.3 model seam; see assembly.ts). Prepend
 * keeps this listener outermost so the model-selection listener has already
 * injected `variables.provider`/`variables.model` when the awaited `next()`
 * returns.
 */
export function installAssemblyRewrite(agent: AgentLike, config: GlmPromptConfig = {}, onRoute?: (glm: boolean) => void): () => void {
  const sections = dialectSections(false, config.persona ?? 'balanced', config)
  return agent.ctx.on('system-prompt/assemble', async (_assembly: AssemblePayload, _context: unknown, next: () => Promise<AssemblePayload>) => {
    const assembled = await next()
    const glm = isGlmAssembly(assembled)
    onRoute?.(glm)
    return rewriteDialectAssembly(assembled, sections)
  }, { prepend: true })
}

/**
 * Scoped tool-face dialect for one agent. rc.3 builds take `register(definition)`
 * with no per-request gate, so the alias registrations and the native
 * restriction follow the resolved route: mounted while glm, unmounted when the
 * route switches away (the assembly rewrite and the agent hooks both drive
 * `syncRoute`). Native executors are captured before the restriction hides
 * them, so alias delegation keeps working after the native name leaves the
 * model's view.
 */
export function initDialectScope(agent: AgentLike, aliasTools: ToolDefinitionLike[], config: GlmPromptConfig = {}, options: { installPrompt?: boolean, onRoute?: (glm: boolean) => void } = {}): { dispose: () => void, restrict: () => void, liftRestriction: () => void, syncRoute: (glm: boolean) => void } {
  const disposers: Array<() => void> = []
  if (options.installPrompt ?? true) disposers.push(installAssemblyRewrite(agent, config, options.onRoute))
  let aliasDispose: (() => void) | undefined
  let restriction: (() => void) | undefined
  const mountAliases = () => {
    if (aliasDispose === undefined) {
      const registered = aliasTools.map(tool => agent.ctx.tools.register(tool))
      aliasDispose = () => { for (const dispose of registered) dispose() }
    }
  }
  const unmountAliases = () => { aliasDispose?.(); aliasDispose = undefined }
  return {
    dispose: () => { unmountAliases(); restriction?.(); restriction = undefined; for (const dispose of disposers) dispose() },
    restrict: () => { restriction ??= agent.ctx.tools.restrict({ deny: [...dialectHiddenNatives] }) },
    liftRestriction: () => { restriction?.(); restriction = undefined },
    syncRoute: (glm: boolean) => {
      if (glm) { mountAliases(); restriction ??= agent.ctx.tools.restrict({ deny: [...dialectHiddenNatives] }) }
      else { unmountAliases(); restriction?.(); restriction = undefined }
    },
  }
}

/** Extract the ZCode-facing todo list from a TodoWrite alias call, when present. */
function todosFromCall(args: unknown): Array<{ content: string, status: string }> | undefined {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return undefined
  const todos = (args as Record<string, unknown>).todos
  if (!Array.isArray(todos)) return undefined
  return todos.filter((todo): todo is { content: string, status: string } =>
    typeof todo === 'object' && todo !== null
    && typeof (todo as Record<string, unknown>).content === 'string'
    && typeof (todo as Record<string, unknown>).status === 'string')
}

/** Per-agent dialect state: the scope handle carrying prompt rewrite and tool face. */
interface AgentScope {
  promptInstalled: boolean
  dialect?: ReturnType<typeof initDialectScope>
  isGlmAgent: () => boolean
}

/** cordis plugin identity. */
export const name = 'dsh-glm-hourness/glm-prompt'

/** cordis plugin entry. */
export function apply(ctx: PluginContext, config: GlmPromptConfig = {}): void {
  const scopes = new WeakMap<AgentLike, AgentScope>()
  const watched = new WeakSet<AgentLike>()
  const reminderStates = new WeakMap<AgentLike, ReminderState>()

  const log = config.initLogPath === undefined
    ? (_event: string, _selection: ModelSelection | undefined, _outcome: string): void => {}
    : (event: string, selection: ModelSelection | undefined, outcome: string): void => {
        import('node:fs/promises').then(({ appendFile }) =>
          appendFile(config.initLogPath!, `${JSON.stringify({ at: new Date().toISOString(), event, provider: selection?.provider, model: selection?.model, outcome })}\n`),
        ).catch(() => {})
      }

  const syncAgent = (agent: AgentLike, selection: ModelSelection | undefined, event: string): void => {
    let scope = scopes.get(agent)
    if (scope === undefined) {
      scope = { promptInstalled: false, isGlmAgent: () => isGlm(agent.model?.current()) }
      scopes.set(agent, scope)
    }
    try {
      if (scope.dialect === undefined) {
        // Alias definitions are built once, before any restriction hides the
        // natives: each alias captures its native executor up front.
        const aliases: ToolDefinitionLike[] = []
        for (const spec of aliasSpecs) {
          const native = agent.ctx.tools.executable(spec.nativeName)
          if (native !== undefined) aliases.push(buildAlias(spec, (args, exec) => native.execute(args, exec) as Promise<unknown>, native.output))
        }
        const nativeTodo = agent.ctx.tools.executable('todo_write')
        if (nativeTodo !== undefined) {
          aliases.push(todoWriteAliasTool((args, exec) => nativeTodo.execute(args, exec) as Promise<unknown>, nativeTodo.output))
        }
        scope.dialect = initDialectScope(agent, aliases, config, {
          installPrompt: true,
          // rc.3 resolves the route per assembly; every assembly flips the
          // alias mounts and the native restriction to match.
          onRoute: glm => { scope.dialect?.syncRoute(glm); log('system-prompt/assemble', undefined, glm ? 'glm' : 'passthrough') },
        })
        scope.promptInstalled = true
      }
      // Builds that still carry the route on the agent hooks sync here; rc.3
      // builds leave these signals empty and the assembly callback drives.
      const glm = isGlm(selection) || scope.isGlmAgent()
      if (glm || selection !== undefined) scope.dialect.syncRoute(glm)
      log(event, selection, glm ? 'glm' : 'passthrough')
    }
    catch (error) {
      // One agent's synchronization must never break its event waterfall;
      // flags only advance on success, so the next pre-step retries.
      log(event, selection, `error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Dialect synchronization at agent creation; `agent/created` is awaited
  // serially before creation resolves (dsh-agent Events contract). When the
  // desktop binds the model after creation, the pre-step retry below catches
  // the first glm-routed step instead (still before assembly).
  const watchPreStep = (agent: AgentLike): void => {
    if (watched.has(agent)) return
    watched.add(agent)
    const dispose = agent.ctx.on('agent/pre-step', (payload, next) => {
      syncAgent(agent, (payload as { modelSelection?: ModelSelection }).modelSelection, 'agent/pre-step:scoped')
      return next()
    })
    void dispose
  }

  ctx.on('agent/created', ({ agent }) => {
    watchPreStep(agent)
    syncAgent(agent, agent.model?.current(), 'agent/created')
  })

  // Lazy retry: pre-step runs before every request's tool resolution and
  // prompt assembly, carrying the resolved modelSelection directly, and it
  // re-syncs the restriction whenever the route changes mid-session. The
  // event is agent-scoped in DSH (`this: Scoped<Agent>`); the global listener
  // stays for runtimes that deliver it globally. Both are idempotent.
  ctx.on('agent/pre-step', (payload, next) => {
    const agent = (payload as { agent?: AgentLike }).agent
    if (agent !== undefined) {
      syncAgent(agent, (payload as { modelSelection?: ModelSelection }).modelSelection, 'agent/pre-step:global')
    }
    return next()
  })

  // Todo reminder loop (ZCode 10/10): observe completed calls, deliver the
  // verbatim nudge as a labeled synthetic notice riding the next request.
  ctx.on('tools/post-execute', (exec, _result, next) => {
    const agent = exec.agent
    if (agent === undefined || exec.nested === true || !isGlm(agent.model?.current())) return next()
    let state = reminderStates.get(agent)
    if (state === undefined) {
      state = initialReminderState()
      reminderStates.set(agent, state)
    }
    const observed = observeToolCall(state, exec.name, todosFromCall(exec.arguments))
    reminderStates.set(agent, observed.state)
    if (observed.reminder === undefined) return next()
    const notice: UserNotice = createUserNotice('glm-todo-reminder', 'todo reminder', observed.reminder)
    return next().then(downstream => ({
      ...downstream,
      additionalContexts: [notice, ...(downstream.additionalContexts ?? [])],
    }))
  })
}
