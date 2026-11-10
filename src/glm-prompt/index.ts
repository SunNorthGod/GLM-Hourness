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
 * decided. So does the peak-hour reminder (docs/ORCHESTRATION.md §11.4), a
 * harness notice of this project, not a ZCode text. Each assembled request
 * reports the row health of its session (src/shared/health.ts). Activation
 * never throws; one agent's failure leaves the others.
 *
 * The row provides the dialect service (src/shared/dialect.ts,
 * `glmHournessDialect`): which agents and routes it rewrites, and how its
 * aliases map to natives. The guard rows read it per call to name tools in
 * corrections as the model sees them; they judge calls with or without it.
 */
import { buildIdentitySection } from './identity.ts'
import { aliasSpecs, buildAliases, type BuiltAlias } from './aliases.ts'
import { READ_IMAGE_NATIVE, READ_NAME, READ_NATIVE } from './read-alias.ts'
import { CLI_PREFIX, DYNAMIC_BEHAVIOR } from './verbatim.ts'
import { readReportingDepth, reportingDepthSection, REPORTING_DEPTHS, type ReportingDepth } from './reporting-depth.ts'
import { standingDepthReader, type StandingDepth } from './standing-depth.ts'
import { buildEnvInfoSection, buildMemorySectionDsh, CONTEXT_MANAGEMENT_DSH, SESSION_GUIDANCE_DSH, SKILLS_NOTE_DSH } from './localize.ts'
import { CONTEXT_MANAGEMENT_SECTION, hasOutputStyle, isGlmAssembly, rewriteDialectSections, rewriteToolFace } from './assembly.ts'
import { mapTodoWriteToDsh } from './todowrite.ts'
import { TODO_WRITE_DESCRIPTION, TODO_WRITE_INPUT_SCHEMA } from './zcode-tool-text.ts'
import { installTodoReminder, TODO_NATIVE, TODO_WRITE_NAME } from './todo-reminder.ts'
import { installPeakReminder, readPeakMode, type PeakModeRead } from './peak-reminder.ts'
import { installSubdirInstructions, sessionWorkingDirectory } from './subdir-instructions.ts'
import { glmMetricSink, type GlmMetricSink } from '../glm-llm/metrics.ts'
import { installToolSearch } from '../toolsearch/index.ts'
import { DIALECT_SERVICE, type DialectService } from '../shared/dialect.ts'
import { peakModeService } from '../shared/peak-mode.ts'
import { provideRowHealth, sessionIdOf, type HealthState, type RowHealth } from '../shared/health.ts'
import { assemblyRoute, isGlmModel, type Route } from '../shared/route.ts'
import { LESSONS_QUERY_TOOL, MEMORY_TOOL_NAMES } from '../shared/tool-names.ts'
import type { AgentLike, AssemblePayload, PluginContext, ProvideHost, ServiceLookup, ToolDefinitionLike } from '../shared/dsh-min.ts'
import Schema from '../shared/schemastery.ts'
import type { JsonValue } from '../shared/json.ts'

/** Row config. */
export interface GlmPromptConfig {
  /** Reporting-depth standing preference; the depth the person set through the memory row wins (standing-depth.ts); `balanced` when neither this nor the old key is written. */
  readonly reportingDepth?: ReportingDepth
  /** The old name of `reportingDepth`, read only when `reportingDepth` is absent. Not the person's persona (src/design/persona.ts). */
  readonly persona?: ReportingDepth
  /** Tier: coding-plan (localized, default) or start-plan (byte-identical official mirror). */
  readonly tier?: 'coding-plan' | 'start-plan'
  /** Host facts for the Environment section (ledger ③); omitted skips the section. `cwd` stands in only for a session that records no working directory (sessionEnv). */
  readonly env?: { cwd: string, platform: string, shell: string, osVersion: string, isGitRepository: boolean, additionalDirectories?: readonly string[], modelLine?: string }
  /** Whether user-invocable skills exist (ledger ⑤ adds the skills note). */
  readonly skills?: boolean
  /** ZCode tool search for GLM requests: `local` (default, DESIGN.md §5.10) or `off` (every tool loads directly). */
  readonly toolSearchMode?: 'local' | 'off'
  /** Deliver the AGENTS.md / CLAUDE.md files of the directories an alias Read, Write or Edit reaches below the working directory, as the host does for the natives (subdir-instructions.ts); off by default (ZCode 3.17.1 does not load subdirectory instructions, so the default request is unchanged), on only with `true` (DESIGN.md §5.11). */
  readonly subdirInstructions?: boolean
}

/** Runtime Config schema: exposes the row knobs (reporting depth included) as real switches in the DSH plugin manager. */
export const Config = Schema.object({
  // Neither depth key has a default: the keys present after the loader normalizes the config are the keys the person wrote, which readReportingDepth needs to tell the old key from the new.
  reportingDepth: Schema.union(REPORTING_DEPTHS.map(level => Schema.const(level.id))).description('汇报细度的常设偏好：concise、balanced 或 detailed。缺省为 balanced。记忆行里本人说过的细度优先（standing-depth）。'),
  persona: Schema.union(REPORTING_DEPTHS.map(level => Schema.const(level.id))).description('已改名为 reportingDepth，只为读旧配置。'),
  tier: Schema.union(['coding-plan', 'start-plan'].map(value => Schema.const(value))).default('coding-plan').description('Tier: coding-plan (localized ledger) or start-plan (verbatim official mirror).'),
  env: (() => { const env = Schema.object({
    cwd: Schema.string().required().description('Working directory shown in the Environment section when the session records none; a session\'s own directory wins.'),
    platform: Schema.string().required(),
    shell: Schema.string().required(),
    osVersion: Schema.string().required(),
    isGitRepository: Schema.boolean().required(),
    additionalDirectories: Schema.array(Schema.string()),
    modelLine: Schema.string(),
  }); delete (env.meta as { default?: unknown }).default; return env })().description('Host facts for the Environment section; omitted skips the section.'),
  skills: Schema.boolean().default(false).description('Whether user-invocable skills exist (adds the skills note).'),
  toolSearchMode: Schema.union(['local', 'off'].map(value => Schema.const(value))).default('local').description('ZCode tool search for GLM requests: local defers tools behind LocalToolSearch and DeferredToolCall; off loads every tool directly.'),
  subdirInstructions: Schema.boolean().default(false).description('Deliver the AGENTS.md and CLAUDE.md files of the subdirectories a Read, Write or Edit reaches, as DSH does for its native file tools. Off by default: ZCode 3.17.1 does not load subdirectory instructions, so a default profile\'s request is unchanged (DESIGN.md §5.11); set true to enable.'),
})

/** Order of the harness identity section this row shadows (SECTION_ORDERS.HARNESS_IDENTITY). */
const HARNESS_IDENTITY_ORDER = -1000

/** The section that teaches the memory tools; only in requests that have them (memorySectionApplies). */
const MEMORY_SECTION = 'glm:memory'

/**
 * Sections the dialect adds beyond the shadowed identity. Tier selects the
 * localization ledger (DESIGN.md §5.3). `outputStyleActive` picks the opening
 * sentence of the identity: the one of an active output style when the
 * assembly carries the person's persona for the main agent. The memory
 * section is the one without the lessons sentence; installDialect swaps in
 * the one with it for a request that has `lessons_query`.
 */
export function dialectSections(outputStyleActive = false, reportingDepth: ReportingDepth = 'balanced', config: GlmPromptConfig = {}): Array<{ name: string, order: number, text: string }> {
  const codingTier = (config.tier ?? 'coding-plan') === 'coding-plan'
  return [
    { name: 'glm:cli-prefix', order: -1001, text: CLI_PREFIX },
    // Same name as the DSH identity section, so the rewrite replaces it in place.
    { name: 'harness:identity', order: HARNESS_IDENTITY_ORDER, text: buildIdentitySection(outputStyleActive, codingTier ? 'user' : 'official', codingTier ? 'dsh' : 'verbatim') },
    // 3.17.1 places Dynamic Behavior right after the identity (and the desktop
    // context, which DSH has no counterpart for), ahead of session guidance.
    ...(codingTier ? [{ name: 'glm:dynamic-behavior', order: -950, text: DYNAMIC_BEHAVIOR }] : []),
    ...(codingTier && config.env !== undefined
      ? [{ name: 'glm:environment', order: -900, text: buildEnvInfoSection(config.env) }]
      : []),
    reportingDepthSection(reportingDepth),
    ...(codingTier
      ? [
          { name: 'glm:session-guidance', order: 2300, text: config.skills === true ? [SESSION_GUIDANCE_DSH, SKILLS_NOTE_DSH].join('\n') : SESSION_GUIDANCE_DSH },
          { name: MEMORY_SECTION, order: 2350, text: buildMemorySectionDsh(false) },
          { name: CONTEXT_MANAGEMENT_SECTION, order: 2400, text: CONTEXT_MANAGEMENT_DSH },
        ]
      : []),
  ]
}

/**
 * Whether the glm:memory section belongs in this request: every memory
 * tool is in the tools the assembly's `next()` returned. Without the
 * orchestration package, or with the memory row disabled or without a home
 * (it then registers no tools), GLM is not taught tools that are not there.
 * The argument is `next()`'s result itself, read before the alias rewrite
 * and before tool search, so a memory tool that tool search would defer
 * still counts (it stays loadable). Memory tools are resident today
 * (src/shared/tool-names.ts); the change that defers them adds an
 * end-to-end case through tool search.
 */
export function memorySectionApplies(assembled: AssemblePayload): boolean {
  // A payload without a tool face (the installed 0.2.2-rc.1 runtime composes one without, docs/DESIGN.md §2.4a) carries no memory tools: the section does not apply.
  const tools = assembled.tools
  return tools !== undefined && MEMORY_TOOL_NAMES.every(name => tools.some(tool => tool.name === name))
}

/**
 * The Environment host facts for one agent: the configured ones, with the
 * working directory of the agent's own session. The session header is
 * immutable creation metadata (the guard takes its containment root from
 * the same field), and rc.3 sets an agent's session at construction, before
 * `agent/created`; so the section is fixed per session and the prompt stays
 * stable step to step. The configured `cwd` stands in only when the session
 * records no directory.
 */
function sessionEnv(env: GlmPromptConfig['env'], agent: AgentLike): GlmPromptConfig['env'] {
  const cwd = agent.session?.header.cwd
  return env === undefined || typeof cwd !== 'string' || cwd.length === 0 ? env : { ...env, cwd }
}

/** ZCode alias → the DSH native it delegates to: this dialect's own alias definitions (aliasSpecs, Read, TodoWrite). */
const DIALECT_NATIVES: ReadonlyMap<string, string> = new Map([
  ...aliasSpecs.map(spec => [spec.zcodeName, spec.nativeName] as const),
  [READ_NAME, READ_NATIVE],
  [TODO_WRITE_NAME, TODO_NATIVE],
])

/** Native → the alias that faces it; read_image is faced by Read too. */
const DIALECT_FACES: ReadonlyMap<string, string> = new Map([...[...DIALECT_NATIVES].map(([alias, native]) => [native, alias] as const), [READ_IMAGE_NATIVE, READ_NAME]])

/**
 * The dialect service (src/shared/dialect.ts) over the agents in `active`:
 * those the dialect was installed on without error. It claims an agent's
 * route when the agent is one of them and the route serves the GLM model
 * family, the judgment the dialect's own rewrite makes per assembly.
 */
export function dialectServiceFor(active: WeakSet<AgentLike>): DialectService {
  return Object.freeze({
    claims: (agent: AgentLike, route: Route | undefined) => active.has(agent) && isGlmModel(route?.model),
    nativeOf: (tool: string) => DIALECT_NATIVES.get(tool),
    faceName: (native: string) => DIALECT_FACES.get(native) ?? native,
  })
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
 * turn tools, not the request's resident face). The peak-hour reminder
 * reads the GLM route of the step and the wall clock `now`, and words itself
 * by the peak mode `peakMode` reads (once per notice sent); without a reader
 * it sends the M6.1 text. The identity section comes in two forms, with and
 * without the opening sentence of an active output style, both computed
 * here; a step uses the one that matches whether its assembly carries the
 * persona section of the main agent. The reporting depth of the session is
 * read once here: `standingDepth` gives the depth the person set
 * (src/glm-prompt/standing-depth.ts), which wins over the configured one; a
 * reading that could not be used is part of the row health of every GLM step.
 */
export function installDialect(agent: AgentLike, config: GlmPromptConfig = {}, health?: Pick<RowHealth, 'report'>, now: () => number = () => Date.now(), peakMode?: () => PeakModeRead, standingDepth?: () => StandingDepth, metric?: GlmMetricSink, workingDirectory?: () => string | undefined): () => void {
  const env = sessionEnv(config.env, agent)
  const standing = standingDepth?.() ?? {}
  const depth = standing.level ?? readReportingDepth(config).depth
  const sectionSets = (outputStyleActive: boolean): { readonly all: ReturnType<typeof dialectSections>, readonly withoutMemory: ReturnType<typeof dialectSections>, readonly withLessons: ReturnType<typeof dialectSections> } => {
    const all = dialectSections(outputStyleActive, depth, env === undefined ? config : { ...config, env })
    return {
      all,
      withoutMemory: all.filter(section => section.name !== MEMORY_SECTION),
      withLessons: all.map(section => section.name === MEMORY_SECTION ? { ...section, text: buildMemorySectionDsh(true) } : section),
    }
  }
  const plain = sectionSets(false)
  const styled = sectionSets(true)
  const aliases = buildAgentAliases(agent)
  const aliasNames = new Set(aliases.map(alias => alias.tool.name))
  const coveredNatives = new Set(aliases.flatMap(alias => alias.covers))
  const disposers = aliases.map(alias => agent.ctx.tools.register(alias.tool))
  const searchMode = config.toolSearchMode ?? 'local'
  const toolSearch = searchMode === 'local' ? installToolSearch(agent) : undefined
  if (toolSearch !== undefined) disposers.push(() => toolSearch.dispose())
  let todoReminderEligible = false
  let glmStep = false
  disposers.push(agent.ctx.on('system-prompt/assemble', async (_assembly: AssemblePayload, _context: unknown, next: () => Promise<AssemblePayload>) => {
    const assembled = await next()
    const glm = isGlmAssembly(assembled)
    glmStep = glm
    health?.report(sessionIdOf(agent), ...withDepthProblem(dialectHealth(assemblyRoute(assembled), glm, searchMode === 'off' ? 'off' : toolSearch === undefined ? 'missing' : 'local'), standing.problem))
    // Judged on next()'s tools, before the face rewrite and tool search (memorySectionApplies); the lessons sentence follows the same tools.
    const set = hasOutputStyle(assembled) ? styled : plain
    const wanted = !memorySectionApplies(assembled) ? set.withoutMemory : assembled.tools?.some(tool => tool.name === LESSONS_QUERY_TOOL) === true ? set.withLessons : set.all
    const withSections = glm ? rewriteDialectSections(assembled, wanted) : assembled
    // A payload without a tool face (the installed 0.2.2-rc.1 runtime composes one without, docs/DESIGN.md §2.4a) keeps the dialect sections and skips the face rewrite and tool search: the runtime's collected tools serve the request.
    if (withSections.tools === undefined) return withSections
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
  // Registered last, so it runs innermost: its notice precedes the ZCode
  // notices, which keep their collection order after it.
  const peakReminder = installPeakReminder(agent, () => glmStep, now, peakMode, metric)
  if (peakReminder !== undefined) disposers.push(peakReminder)
  // Registered after the peak reminder, so it runs innermost and its notice comes first after the admitted messages, where the host puts its own instruction messages.
  const subdir = config.subdirInstructions !== true || workingDirectory === undefined ? undefined : installSubdirInstructions(agent, () => glmStep, workingDirectory)
  if (subdir !== undefined) disposers.push(subdir)
  return () => { for (const dispose of disposers.splice(0)) dispose() }
}

/** The dialect's status for one assembled request (row health). */
export function dialectHealth(route: Route, glm: boolean, search: 'local' | 'off' | 'missing'): [HealthState, string] {
  const routeText = `${route.provider ?? '?'}/${route.model ?? '?'}`
  if (!glm) return ['inactive', `非 GLM 路由 ${routeText}，保持 DSH 原文与原生工具`]
  if (search === 'missing') return ['degraded', `GLM 路由 ${routeText}：ZCode 提示词与工具面；工具检索未安装（会话历史不可读）`]
  return ['active', `GLM 路由 ${routeText}：ZCode 提示词与工具面，${search === 'off' ? '工具检索关闭（toolSearchMode: off）' : '工具检索 local'}`]
}

/** A dialect status that also says the standing reporting depth could not be used: degraded, unless the dialect is off for the request anyway. */
function withDepthProblem([state, reason]: [HealthState, string], problem: string | undefined): [HealthState, string] {
  return problem === undefined || state === 'inactive' ? [state, reason] : ['degraded', `${reason}；${problem}`]
}

/** cordis plugin identity. */
export const name = 'dsh-glm-hourness/glm-prompt'

/** The row health note while the dialect service is not provided: the guard reads tool names from its static table and corrects in native names. */
const DIALECT_SERVICE_MISSING = '方言服务未提供：guard 的纠偏与规则声明用原生工具名'

/** Provide the dialect service: its disposer, or (warned) why the context could not take it. */
function provideDialect(ctx: Partial<ProvideHost>, active: WeakSet<AgentLike>): { readonly withdraw?: () => void, readonly failure?: string } {
  try {
    if (typeof ctx.provide !== 'function') throw new Error('the context has no provide')
    return { withdraw: ctx.provide(DIALECT_SERVICE, dialectServiceFor(active)) }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`dsh-glm-hourness/glm-prompt: ${DIALECT_SERVICE} not provided; the guard maps tool names through its static alias table and corrects in native names: ${message}`)
    return { failure: message }
  }
}

/** Where a bad answer of the peak mode service is reported; one function for the process, so each reason is said once (readPeakMode). */
const warnPeakMode = (message: string): void => console.warn(`dsh-glm-hourness/glm-prompt: ${message}`)

/**
 * The peak mode of the session `agent` runs, read when the reminder is sent:
 * the rules row's service as cordis finds it now (the row may come and go),
 * then the state it holds for the session.
 */
function peakModeReader(ctx: ServiceLookup, agent: AgentLike): () => PeakModeRead {
  return () => {
    let shapeProblem = false
    const service = peakModeService(ctx, () => { shapeProblem = true })
    return readPeakMode(service, shapeProblem, sessionIdOf(agent), warnPeakMode)
  }
}

/** cordis plugin entry (cordis passes `ctx` and `config`; `now` is the wall clock, injectable for tests). */
export function apply(ctx: PluginContext & Partial<ProvideHost> & ServiceLookup, config: GlmPromptConfig = {}, now: () => number = () => Date.now()): () => void {
  const installed = new WeakSet<AgentLike>()
  // Each peak reminder sent is one glm.peak-reminder for the metrics journal (M6 design §14.2); nothing without the metrics row.
  const metric = glmMetricSink(ctx)
  // The console hears each way the memory service can fail to give a depth once per row; every session's health says it.
  const warnedDepth = new Set<string>()
  const warnDepth = (reason: string, message: string): void => {
    if (warnedDepth.has(reason)) return
    warnedDepth.add(reason)
    console.warn(`${name}: ${message}`)
  }
  // Agents whose dialect installed without error: the ones the service claims.
  const active = new WeakSet<AgentLike>()
  // The old key `persona` of the reporting depth: told once, and kept in the row health for as long as it decides or differs.
  const depthKeys = readReportingDepth(config)
  if (depthKeys.warn && depthKeys.note !== undefined) console.warn(`dsh-glm-hourness/glm-prompt: ${depthKeys.note}`)
  const remark = (reason: string): string => depthKeys.note === undefined ? reason : `${reason}；${depthKeys.note}`
  const health = provideRowHealth(ctx, 'glm-prompt', 'active', remark(`已加载（工具检索 ${config.toolSearchMode ?? 'local'}）`))
  const disposers: Array<() => void> = [() => health.dispose()]
  const dialect = provideDialect(ctx, active)
  if (dialect.withdraw !== undefined) disposers.push(dialect.withdraw)
  else health.reactivate('degraded', remark(`${DIALECT_SERVICE_MISSING}（${dialect.failure ?? ''}）`))
  // A session's report replaces the activation text, so the remark rides on each report the dialect makes (a non-GLM route does not use the depth).
  // While the service is missing, a GLM step the dialect rewrote reports degraded, saying why.
  const reporter: Pick<RowHealth, 'report'> = {
    report: (sessionId, state, reason) => {
      if (state === 'inactive') health.report(sessionId, state, reason)
      else if (dialect.withdraw !== undefined) health.report(sessionId, state, remark(reason))
      else health.report(sessionId, 'degraded', remark(`${reason}；${DIALECT_SERVICE_MISSING}`))
    },
  }

  disposers.push(ctx.on('agent/created', ({ agent }) => {
    if (installed.has(agent)) return
    installed.add(agent)
    try {
      disposers.push(installDialect(agent, config, reporter, now, peakModeReader(ctx, agent), standingDepthReader(ctx, agent, warnDepth), metric, () => sessionWorkingDirectory(ctx, agent.session)))
      active.add(agent)
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
