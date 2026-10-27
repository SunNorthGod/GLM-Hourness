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
 * cover, with ZCode's local tool search applied on top (src/toolsearch/);
 * any other request sees the natives and not the aliases or the search
 * controls. Nothing is restricted or unmounted, so a mid-session route
 * switch takes effect on the next step. The ZCode todo reminder rides the
 * same step: its `agent/pre-step` listener reads what this step's rewrite
 * decided. Each assembled request reports the row health of its session
 * (src/shared/health.ts). Activation never throws; one agent's failure
 * leaves the others.
 */
import { buildIdentitySection } from './identity.ts'
import { buildAliases, type BuiltAlias } from './aliases.ts'
import { CLI_PREFIX } from './verbatim.ts'
import { personaSection, PERSONA_LEVELS, type PersonaLevel } from './persona.ts'
import { buildEnvInfoSection, CONTEXT_MANAGEMENT_DSH, MEMORY_SECTION_DSH, SESSION_GUIDANCE_DSH, SKILLS_NOTE_DSH } from './localize.ts'
import { isGlmAssembly, rewriteDialectSections, rewriteToolFace } from './assembly.ts'
import { mapTodoWriteToDsh } from './todowrite.ts'
import { TODO_WRITE_DESCRIPTION, TODO_WRITE_INPUT_SCHEMA } from './zcode-tool-text.ts'
import { installTodoReminder, TODO_NATIVE, TODO_WRITE_NAME } from './todo-reminder.ts'
import { installToolSearch } from '../toolsearch/index.ts'
import { provideRowHealth, sessionIdOf, type HealthState, type RowHealth } from '../shared/health.ts'
import { assemblyRoute, type Route } from '../shared/route.ts'
import type { AgentLike, AssemblePayload, PluginContext, ProvideHost, ToolDefinitionLike } from '../shared/dsh-min.ts'
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
  /** ZCode tool search for GLM requests: `local` (default, DESIGN.md §5.10) or `off` (every tool loads directly). */
  readonly toolSearchMode?: 'local' | 'off'
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
  toolSearchMode: Schema.union(['local', 'off'].map(value => Schema.const(value))).default('local').description('ZCode tool search for GLM requests: local defers tools behind LocalToolSearch and DeferredToolCall; off loads every tool directly.'),
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
  ]
}

/** ZCode TodoWrite alias delegating to the DSH todo_write executor. */
export function todoWriteAliasTool(delegate: (args: { todos: Array<{ content: string, status: string }> }, exec: unknown) => Promise<unknown>, nativeOutput?: ToolDefinitionLike['output']): ToolDefinitionLike {
  return {
    name: TODO_WRITE_NAME,
    description: TODO_WRITE_DESCRIPTION,
    parameters: TODO_WRITE_INPUT_SCHEMA,
    output: nativeOutput ?? {
      schema: { type: 'object', properties: { todos: { type: 'array' } } },
      render: () => [{ type: 'text', text: 'todo list updated' }],
    },
    async execute(args, exec) {
      return delegate(mapTodoWriteToDsh(args as JsonValue), exec)
    },
  }
}

/**
 * Build the ZCode-facing aliases over the natives this agent sees, each with
 * the natives it covers. An alias whose native is absent in this composition
 * is skipped and covers nothing.
 */
export function buildAgentAliases(agent: AgentLike): BuiltAlias[] {
  const lookup = (name: string): ToolDefinitionLike | undefined => agent.ctx.tools.get(name, agent)
  const aliases = buildAliases(lookup)
  const todo = lookup(TODO_NATIVE)
  if (todo !== undefined) aliases.push({ tool: todoWriteAliasTool((args, exec) => todo.execute(args, exec), todo.output), covers: [TODO_NATIVE] })
  return aliases
}

/**
 * Install the dialect on one agent: scoped alias registrations, tool search
 * (unless `toolSearchMode` is `off`), the per-request rewrite and the todo
 * reminder. Tool search runs on the alias face, so its resident/deferred
 * split sees ZCode names. The reminder reads this step's rewrite: GLM route
 * and TodoWrite on the face before tool search defers it (ZCode checks the
 * turn tools, not the request's resident face).
 */
export function installDialect(agent: AgentLike, config: GlmPromptConfig = {}, health?: Pick<RowHealth, 'report'>): () => void {
  const sections = dialectSections(false, config.persona ?? 'balanced', config)
  const aliases = buildAgentAliases(agent)
  const aliasNames = new Set(aliases.map(alias => alias.tool.name))
  const coveredNatives = new Set(aliases.flatMap(alias => alias.covers))
  const disposers = aliases.map(alias => agent.ctx.tools.register(alias.tool))
  const searchMode = config.toolSearchMode ?? 'local'
  const toolSearch = searchMode === 'local' ? installToolSearch(agent) : undefined
  if (toolSearch !== undefined) disposers.push(() => toolSearch.dispose())
  let todoReminderEligible = false
  disposers.push(agent.ctx.on('system-prompt/assemble', async (_assembly: AssemblePayload, _context: unknown, next: () => Promise<AssemblePayload>) => {
    const assembled = await next()
    const glm = isGlmAssembly(assembled)
    health?.report(sessionIdOf(agent), ...dialectHealth(assemblyRoute(assembled), glm, searchMode === 'off' ? 'off' : toolSearch === undefined ? 'missing' : 'local'))
    const withSections = glm ? rewriteDialectSections(assembled, sections) : assembled
    const face = rewriteToolFace(withSections.tools, glm, aliasNames, coveredNatives)
    todoReminderEligible = glm && face.some(tool => tool.name === TODO_WRITE_NAME)
    const tools = toolSearch === undefined ? face : glm ? toolSearch.expose(face) : toolSearch.hide(face)
    return { ...withSections, tools }
  }, { prepend: true }))
  // Registered after tool search's pre-step listener, so it runs inside it
  // and the reminder precedes the deferred-tools announcement, the order in
  // which ZCode collects the two attachments.
  const todoReminder = installTodoReminder(agent, () => todoReminderEligible)
  if (todoReminder !== undefined) disposers.push(todoReminder)
  return () => { for (const dispose of disposers.splice(0)) dispose() }
}

/** The dialect's status for one assembled request (row health). */
export function dialectHealth(route: Route, glm: boolean, search: 'local' | 'off' | 'missing'): [HealthState, string] {
  const routeText = `${route.provider ?? '?'}/${route.model ?? '?'}`
  if (!glm) return ['inactive', `非 GLM 路由 ${routeText}，保持 DSH 原文与原生工具`]
  if (search === 'missing') return ['degraded', `GLM 路由 ${routeText}：ZCode 提示词与工具面；工具检索未安装（会话历史不可读）`]
  return ['active', `GLM 路由 ${routeText}：ZCode 提示词与工具面，${search === 'off' ? '工具检索关闭（toolSearchMode: off）' : '工具检索 local'}`]
}

/** cordis plugin identity. */
export const name = 'dsh-glm-hourness/glm-prompt'

/** cordis plugin entry. */
export function apply(ctx: PluginContext & Partial<ProvideHost>, config: GlmPromptConfig = {}): () => void {
  const installed = new WeakSet<AgentLike>()
  const health = provideRowHealth(ctx, 'glm-prompt', 'active', `已加载（工具检索 ${config.toolSearchMode ?? 'local'}）`)
  const disposers: Array<() => void> = [() => health.dispose()]

  disposers.push(ctx.on('agent/created', ({ agent }) => {
    if (installed.has(agent)) return
    installed.add(agent)
    try {
      disposers.push(installDialect(agent, config, health))
    }
    catch (error) {
      // One agent's dialect must never break agent creation (activation-time
      // fail-open); the agent runs with the native face.
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`dsh-glm-hourness/glm-prompt: dialect not installed for agent ${agent.id}: ${message}`)
      health.report(sessionIdOf(agent), 'inactive', `方言未安装：${message}`)
    }
  }))

  return () => { for (const dispose of disposers.splice(0)) dispose() }
}
