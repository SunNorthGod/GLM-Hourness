/**
 * glm-hourness/rules row entry (docs/ORCHESTRATION.md §16): the rules board. A
 * project has rules its person set, kept in the repository (`docs/rules/rules.json`,
 * with the journal and snapshot in the project's `.llm/rules/`), and a peak
 * mode: 无影响 (inform), 少做 (reduce, the default) or 不做 (stop).
 *
 * What the row does:
 * - the tool-call gate (gate.ts): registered outermost on `tools/pre-execute`,
 *   it keeps the board's own files to the board (`rules:files-only`) and
 *   judges every call that the gates inside it let through against the rules:
 *   a blocking rule refuses the call with the reason, a recording rule leaves a
 *   line in the violation journal, rules that only inform change nothing;
 * - `rules_show` (tool.ts): the tool an agent reads the rules that hold it with;
 * - `/rules` (commands.ts): the person looks at the rules and changes what they
 *   may: the peak mode, a rule's lifting or deletion, a switch, a waiting call;
 * - the service `glmHournessPeakMode`: the dispatch tool counts running GLM
 *   subagents against `glmWorkerCap` (at most 1 under `reduce` during a peak),
 *   and asks `peakHoldFor` whether the peak holds a session's work back;
 * - the service `glmHournessRules`, whose one member is the line the guard adds
 *   to its prompt section while this row is on.
 *
 * The main agent is never held by a peak level, and rules that queue are not
 * carried out yet (no waiting tickets): the board refuses and records, nothing
 * else. Nothing a rule says can be written by an agent; only the person's
 * `/rules`, as the human, changes rules.
 *
 * Activation never throws. A failed registration or provision warns once and
 * degrades the row's health with the reason; a gate that cannot be installed
 * makes the row inactive; a problem the storage finds is reported per session
 * (row-health.ts). The row ships disabled (packages/hourness/cordis.patch.yml).
 */
import { basename } from 'node:path'
import { projectOf } from '../data/project-root.ts'
import { rowJournal } from '../memory/audit.ts'
import { dataHomes } from '../shared/data-home.ts'
import type { AgentCommandInvocationLike, AgentLike, AgentsService, CommandDefinitionLike, CommandResultLike, CommandsHost, PreExecuteListener, ProvideHost, ServiceLookup, SessionLike, ToolsLike } from '../shared/dsh-min.ts'
import { provideRowHealth, sessionIdOf, type HealthState, type RowHealth } from '../shared/health.ts'
import { PEAK_MODE_SERVICE } from '../shared/peak-mode.ts'
import { RULES_TOOL_NAMES } from '../shared/tool-names.ts'
import { NOT_A_PROJECT, RULES_HINT, runRulesCommand } from './commands.ts'
import { openRulesBoard } from './engine.ts'
import { installRulesGate } from './gate.ts'
import { peakModeServiceFor, peakReader, projectReader, type ProjectView } from './peak.ts'
import { gitOperationIn, readProject } from './repo.ts'
import { projectHealth } from './row-health.ts'
import { RULES_DECLARATION, RULES_SERVICE, type RulesService } from './service.ts'
import { DEFAULT_RULES_DIR, type StoreIo } from './store.ts'
import { rulesShowTool } from './tool.ts'

export { clockText } from './commands.ts'

export interface RulesConfig {
  /** The rules directory in the repository: relative to the project root, or absolute (the probe and tests). Default docs/rules. */
  readonly dir?: string
  /** The project directory (workspace `.llm`) for the violation journal; defaults to the data service's. */
  readonly home?: string
  /** The clock, for tests; default `Date.now`. */
  readonly now?: () => number
  /** The storage's file operations that tests replace (a rename that fails). */
  readonly io?: StoreIo
}

/** cordis plugin identity: needs the tools and commands services. */
export const name = 'dsh-glm-hourness/rules'
export const inject = ['tools', 'commands']

/** The command name; its definition id is `dsh-glm-hourness/rules`. */
export const RULES_COMMAND = 'rules'

/** The row's context: the tools and commands services, the tool-call gate, the agent lifecycle and session end events, optional service provision and lookup. */
export interface RulesContext extends CommandsHost<AgentCommandInvocationLike>, ServiceLookup, Partial<ProvideHost> {
  readonly tools: ToolsLike
  on(event: 'agent/created', listener: (payload: { agent: AgentLike }) => Promise<void> | void): () => void
  on(event: 'session/disposed', listener: (session: SessionLike) => void): () => void
  on(event: 'tools/pre-execute', listener: PreExecuteListener, options?: { prepend?: boolean }): () => void
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** cordis plugin entry: register /rules and rules_show, install the gate, provide the services and the row health. Activation never throws. */
export function apply(ctx: RulesContext, config: RulesConfig = {}): () => void {
  const configured: unknown = config.dir ?? DEFAULT_RULES_DIR
  if (typeof configured !== 'string' || configured.trim().length === 0) {
    console.warn(`${name}: config.dir must be a non-empty path; the rules row stays off`)
    const off = provideRowHealth(ctx, 'rules', 'inactive', 'config.dir 不是非空路径，规则板未启用')
    return () => { off.dispose() }
  }
  const rulesDir: string = configured
  const now = config.now ?? ((): number => Date.now())
  const sessions = new Map<string, string>()
  const reading = peakReader(ctx, now)
  const read = projectReader(rulesDir)
  const disposers: Array<() => void> = []
  const problems: string[] = []
  let gateInstalled = false

  // A session this host has not seen is looked up in the host's agent registry, so a row enabled mid-run still answers.
  const cwdOf = (sessionId: string): string | undefined => {
    const known = sessions.get(sessionId)
    if (known !== undefined) return known
    const agents = typeof ctx.get === 'function' ? ctx.get('agents') as AgentsService | undefined : undefined
    return typeof agents?.get === 'function' ? agents.get(sessionId)?.session.header.cwd : undefined
  }

  const activation = (): readonly [HealthState, string] => [
    !gateInstalled ? 'inactive' : problems.length === 0 ? 'active' : 'degraded',
    [`命令 /${RULES_COMMAND}、工具 ${RULES_TOOL_NAMES.join('、')} 与高峰模式服务 ${PEAK_MODE_SERVICE} 已就绪`, ...problems].join('；'),
  ]
  const health: RowHealth = provideRowHealth(ctx, 'rules', ...activation())
  disposers.push(() => { health.dispose() })

  /** Persist what the project's files need (a recovery, the start from the rules file, an owed write), then report the session's health. Never throws. */
  async function settle(sessionId: string | undefined, cwd: string | undefined): Promise<ProjectView | undefined> {
    try {
      const project = cwd === undefined ? undefined : projectOf(cwd)
      if (project === undefined) {
        if (sessionId !== undefined) health.report(sessionId, 'degraded', NOT_A_PROJECT)
        return undefined
      }
      const board = openRulesBoard({ projectRoot: project.root, rulesDir, ...(config.io === undefined ? {} : { io: config.io }) })
      const settled = await board.settle()
      const view: ProjectView = { paths: board.paths, read: settled === 'busy' ? readProject(board.paths) : settled }
      if (sessionId !== undefined) health.report(sessionId, ...projectHealth(basename(project.root), view.read, reading(), gitOperationIn(project.root)))
      return view
    }
    catch (error) {
      if (sessionId !== undefined) health.report(sessionId, 'degraded', `读规则板的状态失败：${message(error)}`)
      return undefined
    }
  }

  function rulesCommand(invocation: AgentCommandInvocationLike): Promise<CommandResultLike> {
    const cwd = invocation.agent.session.header.cwd
    const sessionId = invocation.agent.id
    if (cwd !== undefined) sessions.set(sessionId, cwd)
    return runRulesCommand(invocation.rawInput, cwd === undefined ? undefined : projectOf(cwd), {
      rulesDir,
      ...(config.io === undefined ? {} : { io: config.io }),
      now,
      peak: reading,
      settle: () => settle(sessionId, cwd),
    })
  }

  const definition: CommandDefinitionLike<AgentCommandInvocationLike> = {
    definitionId: name,
    name: RULES_COMMAND,
    description: '规则板：看规则，改高峰模式，处理你定的规则、开关和等待单',
    input: { hint: RULES_HINT },
    handler: rulesCommand,
  }
  try {
    disposers.push(ctx.commands.register(definition))
  }
  catch (error) {
    console.warn(`${name}: registering /${RULES_COMMAND} failed, the level cannot be changed: ${message(error)}`)
    problems.push(`/${RULES_COMMAND} 注册失败，档位改不了：${message(error)}`)
  }

  try {
    disposers.push(ctx.tools.register(rulesShowTool({ ctx, now, project: read, peak: reading })))
  }
  catch (error) {
    console.warn(`${name}: registering ${RULES_TOOL_NAMES.join(', ')} failed, agents cannot read the rules: ${message(error)}`)
    problems.push(`工具 ${RULES_TOOL_NAMES.join('、')} 没注册上：${message(error)}`)
  }

  try {
    disposers.push(installRulesGate({ ctx, rulesDir, now, project: read, peak: reading, journal: rowJournal(name, () => dataHomes(ctx, config.home)), health }))
    gateInstalled = true
  }
  catch (error) {
    console.warn(`${name}: the tool-call gate is not installed, the row executes no rule: ${message(error)}`)
    problems.push(`工具调用的门没装上，这一行不执行任何规则：${message(error)}`)
  }

  if (typeof ctx.provide === 'function') {
    try {
      disposers.push(ctx.provide(PEAK_MODE_SERVICE, peakModeServiceFor({ cwdOf, project: read, peak: reading })))
    }
    catch (error) {
      console.warn(`${name}: ${PEAK_MODE_SERVICE} is not provided (dispatch keeps its own slots, the GLM reminder keeps today's text): ${message(error)}`)
      problems.push(`服务 ${PEAK_MODE_SERVICE} 没提供上：${message(error)}（派活照原来的槽位，GLM 提醒照原文）`)
    }
    try {
      const service: RulesService = { declaration: RULES_DECLARATION }
      disposers.push(ctx.provide(RULES_SERVICE, service))
    }
    catch (error) {
      console.warn(`${name}: ${RULES_SERVICE} is not provided (the guard declares no rules board): ${message(error)}`)
      problems.push(`服务 ${RULES_SERVICE} 没提供上：${message(error)}（guard 的提示词里不写规则板那一行）`)
    }
  }
  else problems.push(`宿主没有 provide，服务 ${PEAK_MODE_SERVICE} 与 ${RULES_SERVICE} 没提供`)

  try {
    disposers.push(ctx.on('agent/created', async ({ agent }) => {
      const sessionId = sessionIdOf(agent)
      const cwd = agent.session?.header.cwd
      if (sessionId !== undefined && cwd !== undefined) sessions.set(sessionId, cwd)
      await settle(sessionId, cwd)
    }))
    disposers.push(ctx.on('session/disposed', (session) => { sessions.delete(session.id) }))
  }
  catch (error) {
    console.warn(`${name}: the session listeners are not registered, the row answers only for sessions it finds in the agent registry: ${message(error)}`)
    problems.push(`会话事件没注册上：${message(error)}`)
  }

  health.reactivate(...activation())
  return () => {
    for (const dispose of disposers.splice(0).reverse()) dispose()
  }
}
