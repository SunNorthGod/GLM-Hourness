/**
 * dsh-glm-prompt — dialect row: in GLM-routed requests the model-visible
 * prompt and tool face mirror the ZCode training distribution.
 *
 * Seam (rc.3 runtime, docs/DESIGN.md §2.4a and §3): every step runs the
 * agent-scoped `system-prompt/assemble` waterfall before `agent/pre-step`,
 * and the request carries exactly the assembled `tools`. At agent creation
 * this row registers the ZCode-facing aliases in the agent scope (so they can
 * execute) and one prepend `system-prompt/assemble` listener. After `next()`
 * that listener reads the route the model-selection listener injected and,
 * for that request alone, rewrites the sections and the tool face: a GLM
 * request sees the ZCode identity and aliases instead of the natives they
 * cover; any other request sees the natives and not the aliases. Nothing is
 * restricted or unmounted, so a mid-session route switch takes effect on the
 * next step. Activation never throws; one agent's failure leaves the others.
 */
import { buildIdentitySection } from './identity.ts'
import { aliasSpecs, buildAlias, hiddenNatives } from './aliases.ts'
import { CLI_PREFIX, DEFERRED_DECLARATION } from './verbatim.ts'
import { personaSection, PERSONA_LEVELS, type PersonaLevel } from './persona.ts'
import { buildEnvInfoSection, CONTEXT_MANAGEMENT_DSH, MEMORY_SECTION_DSH, SESSION_GUIDANCE_DSH, SKILLS_NOTE_DSH } from './localize.ts'
import { isGlmAssembly, rewriteDialectSections, rewriteToolFace } from './assembly.ts'
import { mapTodoWriteToDsh, zcodeTodoWriteDescription, zcodeTodoWriteSchema } from './todowrite.ts'
import { initialReminderState, observeToolCall, type ReminderState } from './todo-reminder.ts'
import { assemblyRoute, createRouteTracker } from '../shared/route.ts'
import { createUserNotice, type AgentLike, type AssemblePayload, type PluginContext, type ToolDefinitionLike, type UserNotice } from '../shared/dsh-min.ts'
import Schema from '../shared/schemastery.ts'
import type { JsonValue } from './json.ts'

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
})

/** Order of the harness identity section this row shadows (SECTION_ORDERS.HARNESS_IDENTITY). */
const HARNESS_IDENTITY_ORDER = -1000

/** Sections the dialect adds beyond the shadowed identity. Tier selects the localization ledger (DESIGN.md §5.3). */
export function dialectSections(outputStyleActive = false, persona: PersonaLevel = 'balanced', config: GlmPromptConfig = {}): Array<{ name: string, order: number, text: string }> {
  const codingTier = (config.tier ?? 'coding-plan') === 'coding-plan'
  return [
    { name: 'glm:cli-prefix', order: -1001, text: CLI_PREFIX },
    // Same name as the DSH identity section, so the rewrite replaces it in place.
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
}

/** ZCode TodoWrite alias delegating to the DSH todo_write executor. */
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
      return delegate(mapTodoWriteToDsh(args as JsonValue), exec)
    },
  }
}

/** Native names the TodoWrite alias covers in addition to the eight-pack aliases. */
const TODO_NATIVE = 'todo_write'

/**
 * Build the ZCode-facing aliases over the natives this agent sees. An alias
 * whose native is absent in this composition is skipped (its native stays
 * hidden from nothing, since it does not exist).
 */
export function buildAgentAliases(agent: AgentLike): ToolDefinitionLike[] {
  const aliases: ToolDefinitionLike[] = []
  for (const spec of aliasSpecs) {
    const native = agent.ctx.tools.get(spec.nativeName, agent)
    if (native !== undefined) aliases.push(buildAlias(spec, (args, exec) => native.execute(args, exec), native.output))
  }
  const todo = agent.ctx.tools.get(TODO_NATIVE, agent)
  if (todo !== undefined) aliases.push(todoWriteAliasTool((args, exec) => todo.execute(args, exec), todo.output))
  return aliases
}

/**
 * Install the dialect on one agent: scoped alias registrations plus the
 * per-request rewrite. `onRoute` observes every assembled route (the todo
 * reminder reads it back within the same step).
 */
export function installDialect(agent: AgentLike, config: GlmPromptConfig = {}, onRoute?: (route: ReturnType<typeof assemblyRoute>) => void): () => void {
  const sections = dialectSections(false, config.persona ?? 'balanced', config)
  const aliases = buildAgentAliases(agent)
  const aliasNames = new Set(aliases.map(alias => alias.name))
  const coveredNatives = new Set([...hiddenNatives].filter(name => agent.ctx.tools.get(name, agent) !== undefined))
  const disposers = aliases.map(alias => agent.ctx.tools.register(alias))
  disposers.push(agent.ctx.on('system-prompt/assemble', async (_assembly: AssemblePayload, _context: unknown, next: () => Promise<AssemblePayload>) => {
    const assembled = await next()
    onRoute?.(assemblyRoute(assembled))
    const glm = isGlmAssembly(assembled)
    const withSections = glm ? rewriteDialectSections(assembled, sections) : assembled
    return { ...withSections, tools: rewriteToolFace(withSections.tools, glm, aliasNames, coveredNatives) }
  }, { prepend: true }))
  return () => { for (const dispose of disposers.splice(0)) dispose() }
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

/** cordis plugin identity. */
export const name = 'dsh-glm-hourness/glm-prompt'

/** cordis plugin entry. */
export function apply(ctx: PluginContext, config: GlmPromptConfig = {}): () => void {
  const routes = createRouteTracker<AgentLike>()
  const installed = new WeakSet<AgentLike>()
  const reminderStates = new WeakMap<AgentLike, ReminderState>()
  const disposers: Array<() => void> = []

  disposers.push(ctx.on('agent/created', ({ agent }) => {
    if (installed.has(agent)) return
    installed.add(agent)
    try {
      disposers.push(installDialect(agent, config, route => routes.record(agent, route)))
    }
    catch (error) {
      // One agent's dialect must never break agent creation (activation-time
      // fail-open); the agent runs with the native face.
      console.warn(`dsh-glm-hourness/glm-prompt: dialect not installed for agent ${agent.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }))

  // Todo reminder loop (ZCode 10/10): observe completed calls in GLM-routed
  // steps, deliver the verbatim nudge as a labeled notice riding the result.
  disposers.push(ctx.on('tools/post-execute', (exec, _result, next) => {
    const agent = exec.agent
    if (agent === undefined || exec.parent !== undefined || !routes.isGlm(agent)) return next()
    const observed = observeToolCall(reminderStates.get(agent) ?? initialReminderState(), exec.name, todosFromCall(exec.arguments))
    reminderStates.set(agent, observed.state)
    if (observed.reminder === undefined) return next()
    const notice: UserNotice = createUserNotice('glm-todo-reminder', 'todo reminder', observed.reminder)
    return next().then(downstream => ({
      ...downstream,
      additionalContexts: [notice, ...(downstream.additionalContexts ?? [])],
    }))
  }))

  return () => { for (const dispose of disposers.splice(0)) dispose() }
}
