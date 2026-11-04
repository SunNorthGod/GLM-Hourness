/**
 * The execution-boundary rules of the dispatched chain (M7 design 0.6 §3.2,
 * §12.1). Four of the five gates are judged here, by the execute row's one
 * `tools/pre-execute` listener, prepended so a write gets this correction
 * rather than another row's: worker-scope (§3.2.1), worker-graph-readonly
 * (§3.2.3), worker-git (§3.2.4) and worker-message-live-only (§3.2.5). The
 * fifth, dispatch-chain-readonly (§3.2.2), is the change to M3's
 * design-before-release (src/guard/design-release.ts): the execute row's
 * service tells that judge who a dispatch carries, and the released stage
 * stops being a pass for everyone else. The ids and first-day modes of all
 * eight code gates are EXECUTE_RULES, the constant table the full rules
 * board maps into its code-rules catalog (§12.1, like M3's
 * MAIN_AGENT_RULES); trunk-advance-checked, completion-gate and stopped are
 * rows of the table from here, their rules arrive with E7, E8 and E6.
 *
 * Every call of a dispatched chain — the registered workers and reviewers,
 * and the subagents they started — that is a shell call or a file-tool call
 * appends one line to the task's command record (§3.8.5), the input the
 * must-review floor reads at handback; a call this listener refuses is
 * recorded with `verdict: 'refused'`. Every denial goes to the violation
 * journal in the guard's record shape. A nested transport call (a `parent`
 * token) passes, as in the guard. A caller outside a main-agent chain — the
 * main agent itself, an ordinary session — is judged only by
 * worker-message-live-only, whose subject is the main agent's own calls.
 *
 * Judging is fail-open where the role cannot be read (the row health says
 * so); the write-scope check of a registered worker fails closed when the
 * project graph has never been read (§3.2.1: refuse rather than guess).
 */
import { isAbsolute, resolve } from 'node:path'
import type { LoadedGraph } from '../graph/parse.ts'
import { releaseOf, type ReleaseResult } from '../graph/execute-stage.ts'
import { projectOf } from '../data/project-root.ts'
import type { PreExecuteDecision, PreExecuteHost, PreExecuteListener, ServiceLookup, SessionLike } from '../shared/dsh-min.ts'
import type { JsonValue } from '../shared/json.ts'
import { dialectService, dialectWarner, toNativeTool } from '../shared/dialect.ts'
import type { HealthState } from '../shared/health.ts'
import { repoRelative, within } from '../execute/scope.ts'
import type { Attempt } from '../execute/attempts.ts'
import { takeSnapshot, gitInvocations, gitRisk, snapshotCorrection, type GitInvocation, type GitRisk, type SnapshotEnvironment, type SnapshotWho } from './git-snapshot.ts'
import { commandName, shellWrites, simpleCommands, type ShellDialect } from './shell.ts'
import { fileToolTargetOf, isFileWrite, renderCorrection, shellCommandOf, type Correction, type ToolCall } from './rules.ts'
import type { ViolationRecord } from './index.ts'

/** The eight code gates with their first-day modes (§12.1): data for the rules board's catalog; the rules themselves are the four below, M3's changed judge, and the later steps' gates. */
export const EXECUTE_RULES: readonly { readonly id: string, readonly title: string, readonly mode: 'enforce' }[] = [
  { id: 'worker-scope', title: 'worker 只写自己工作树里的写入范围：越界写被拒', mode: 'enforce' },
  { id: 'dispatch-chain-readonly', title: '派发链里不在登记表的 agent 只读：原生 subagent 派出的只读', mode: 'enforce' },
  { id: 'worker-graph-readonly', title: 'worker 对项目图只读与批注：图的写工具按名调用被拒', mode: 'enforce' },
  { id: 'worker-git', title: 'worker 只碰自己的分支，危险命令先存快照', mode: 'enforce' },
  { id: 'worker-message-live-only', title: '主 Agent 只给活着的派发发消息：给已结束的 worker 发消息被拒', mode: 'enforce' },
  { id: 'stopped', title: '停下标记之后、人回话之前，不再派这件活与它的审查', mode: 'enforce' },
  { id: 'trunk-advance-checked', title: '主干只能前进到跑过合入前检查的提交', mode: 'enforce' },
  { id: 'completion-gate', title: '目标完成要 harness 的核对和证据', mode: 'enforce' },
]

/** The graph write tools, by DSH native name (§3.2.3). */
const GRAPH_WRITE_NAMES: ReadonlySet<string> = new Set([
  'graph_propose', 'graph_status', 'graph_edit', 'graph_link', 'graph_unlink', 'graph_verify', 'graph_decide', 'graph_approve', 'graph_reject',
])

const MESSAGE_TOOLS: ReadonlySet<string> = new Set(['send_message', 'interrupt_agent'])

/** The file tools whose calls are recorded and scope-checked. */
const FILE_TOOLS: ReadonlySet<string> = new Set(['write', 'edit', 'str_replace_editor', 'read', 'glob', 'grep'])

// ---- worker-scope (§3.2.1) ----

interface ScopeFacts {
  readonly task: string
  /** The caller's worktree, absolute; reviewers' is their working checkout. */
  readonly worktree: string
  /** The target in scope notation: '' the worktree root itself, undefined outside the worktree or in its `.git`. */
  readonly target: string | undefined
  /** Reviewers and checks write only their `.hourness/` report. */
  readonly reviewer: boolean
  readonly scope: readonly string[]
  /** `releaseOf` of the task on the current graph; undefined when the row has read no graph at all. */
  readonly release: ReleaseResult | undefined
  /** The approved plan's paths union, when the attempt carries one. */
  readonly planPaths: readonly string[] | undefined
  /** Whether the task's dispatch required a plan. */
  readonly needsPlan: boolean
}

/** Whether a target in scope notation is the `.hourness/` report area of the worktree root. */
function isReportPath(target: string): boolean {
  return target === '.hourness' || target.startsWith('.hourness/')
}

/** The worker-scope verdict (§3.2.1): the correction when the write must be refused, undefined when it may go on. Pure. */
function workerScopeVerdict(facts: ScopeFacts): Correction | undefined {
  const report = (violation: string, rightPath: string, exception = 'If the task needs another file, ask the main agent with ask_main; it can widen the write scope.'): Correction => ({
    fact: facts.target === undefined ? `You tried to write outside your worktree ${facts.worktree}.` : `You tried to write "${facts.target}".`,
    violation,
    rightPath,
    exception,
  })
  // Reviewers and checks: nothing but the report under .hourness/ (§3.2.1 step 4).
  if (facts.reviewer) {
    if (facts.target !== undefined && isReportPath(facts.target)) return undefined
    return report('A reviewer writes nothing but its report under .hourness/.', 'Write the report under .hourness/ in your working directory and hand back.')
  }
  // Inside the worktree, never in its `.git` (repoRelative answers undefined for both).
  if (facts.target === undefined) {
    return report(`You are the worker for task ${facts.task}; you write only inside your worktree ${facts.worktree}.`, 'Write inside the worktree the task was dispatched with.')
  }
  // The report area is allowed before every other check (§3.2.1 step 3).
  if (isReportPath(facts.target)) return undefined
  // The graph: a project whose graph was never read refuses; one whose readers fail refuses the released check (R5-F3).
  if (facts.release === undefined) {
    return report('The project graph could not be read, so the harness cannot tell what your write scope is.', 'Stop writing and ask the main agent with ask_main; the harness refuses writes until it can read the graph again.')
  }
  if (!facts.release.ok) {
    if (facts.release.reason === 'unreadable') {
      return report(
        'The module structure could not be read, so the harness cannot tell whether the design you belong to is released.',
        'Stop writing, hand back with status blocked and say so in the summary.',
      )
    }
    const node = facts.release.level === 'module' ? `module ${facts.release.node}` : `goal ${facts.release.node}`
    return report(
      `The design this task belongs to was sent back (${node}).`,
      'Stop writing, hand back with status blocked and say so in the summary; the main agent dispatches the task again after the person releases the design.',
    )
  }
  // A task that needs a plan refuses every write until one is approved; afterwards only the approved paths (§3.2.1 step 3).
  if (facts.needsPlan && facts.planPaths === undefined) {
    return report('This task needs an approved plan before any write.', 'Submit your plan with submit_plan and wait for approval before writing.')
  }
  const allowed = facts.planPaths ?? facts.scope
  if (!within(allowed, facts.target)) {
    return report(
      `"${facts.target}" is outside the write scope of task ${facts.task} [${facts.scope.join(', ')}].`,
      'If the task needs this file, ask the main agent with ask_main; it can widen the write scope, then resubmit your plan.',
      'If the file belongs to another task, report it in your handback under questions.',
    )
  }
  return undefined
}

// ---- worker-git (§3.2.4) ----

/** The subcommands a reviewer or a read-only subagent may run (§3.2.4 step 1). */
const GIT_READ_ONLY: ReadonlySet<string> = new Set([
  'status', 'log', 'diff', 'show', 'blame', 'grep', 'rev-parse', 'ls-files', 'describe', 'shortlog',
  'show-ref', 'for-each-ref', 'merge-base', 'cat-file', 'name-rev', 'check-ignore', 'version', 'help', 'var',
])

const REWRITE_FLAGS = new Set(['-d', '-D', '-m', '-M', '-f', '--delete', '--move', '--force', '--edit'])

const CONFIG_READS = new Set(['--get', '--get-all', '--get-regexp', '--list', '-l'])

/** The flags of `git checkout` and `git switch` that create or move a branch (§3.2.4 step 3). */
const BRANCH_CREATE = new Set(['-b', '-B', '-c', '-C', '--branch', '--force-create', '--copy', '--force-copy'])

const HOME_MARKERS = /^[~]|^\$HOME|^%USERPROFILE%|^\$env:USERPROFILE/i

const FOLD_CASE = process.platform === 'win32' || process.platform === 'darwin'
const sameDir = (a: string, b: string): boolean => {
  const left = resolve(a)
  const right = resolve(b)
  return FOLD_CASE ? left.toLowerCase() === right.toLowerCase() : left === right
}
const insideDir = (parent: string, child: string): boolean => {
  const base = resolve(parent)
  const full = resolve(child)
  const folded = (path: string): string => FOLD_CASE ? path.toLowerCase() : path
  return sameDir(base, full) || folded(full).startsWith(`${folded(base)}/`)
}

interface GitFacts {
  readonly role: 'worker' | 'reviewer'
  readonly task: string
  /** The worker's own branch, `hz/<task id>`; reviewers have none. */
  readonly branch: string | undefined
  /** The checkout the caller's git calls must stay in (the worktree, or the reviewer's working checkout). */
  readonly root: string
  readonly invocations: readonly GitInvocation[]
}

/** One git call's judgment (§3.2.4): the correction, the snapshot the call needs first, or undefined to let it pass. Pure. */
function judgeGitCall(facts: GitFacts, invocation: GitInvocation): Correction | { readonly snapshot: GitRisk } | undefined {
  // A global option this reader does not know hides the subcommand: the heuristic lets it pass, the trunk's post-execute comparison catches the damage (§3.2.4's last note).
  if (invocation.unknownGlobal) return undefined
  const deny = (what: string): Correction => ({
    fact: `You ran git ${invocation.sub}${invocation.args.length > 0 ? ` ${invocation.args.join(' ')}` : ''}${what === '' ? '' : ` (${what})`}.`,
    violation: facts.role === 'worker'
      ? `You are the worker for task ${facts.task}: use git only on your branch ${facts.branch} in your worktree; the main agent integrates, pushes and manages other branches.`
      : 'Only reads are yours here; the main agent and its workers change the repository.',
    rightPath: facts.role === 'worker' ? 'Commit on your branch; the main agent integrates, pushes and manages other branches.' : 'Read, search and report back; put what the work needs in your handback.',
    exception: 'If the task needs another branch, ask the main agent with ask_main.',
  })
  // The options that move git elsewhere refuse, the directory must be the caller's own checkout (§3.2.4 step 1).
  for (const option of invocation.repoOptions) {
    const value = option.slice(option.indexOf('=') + 1)
    if (value === '' || !insideDir(facts.root, value)) return deny('--git-dir/--work-tree points outside your worktree')
  }
  if (invocation.dir === undefined) return deny('the directory the command runs in is not in the command text')
  if (!insideDir(facts.root, invocation.dir)) return deny('it runs in another checkout')
  const { sub, args } = invocation
  if (sub === '') return undefined
  if (facts.role !== 'worker') {
    const listsOnly = sub === 'branch' || sub === 'tag'
    if (GIT_READ_ONLY.has(sub) && !(listsOnly && (args.some(arg => !arg.startsWith('-')) || args.some(arg => REWRITE_FLAGS.has(arg))))) return undefined
    return deny('it is not a read')
  }
  // The worker's refusals (§3.2.4 step 3); the allowed work on its own branch is what remains (step 2).
  const positional = args.filter(arg => !arg.startsWith('-'))
  const hasFlag = (...names: string[]): boolean => args.some(arg => names.includes(arg))
  switch (sub) {
    case 'push': case 'pull': case 'worktree': case 'update-ref': case 'symbolic-ref':
    case 'filter-branch': case 'filter-repo': case 'replace': case 'prune':
      return deny('')
    case 'gc':
      return hasFlag('--prune', '--auto') ? deny('it prunes objects') : undefined
    case 'reflog':
      return args[0] === 'expire' || args[0] === 'delete' ? deny('it rewrites the reflog') : undefined
    case 'config':
      return args.length > 0 && !CONFIG_READS.has(args[0] ?? '') ? deny('it writes configuration') : undefined
    case 'fetch':
      return args.some(arg => arg.includes('refs/heads/') || arg.includes('refs/remotes/')) ? deny('its refspec writes refs') : undefined
    case 'branch': case 'tag':
      return positional.length > 0 || args.some(arg => REWRITE_FLAGS.has(arg)) ? deny('it changes refs') : undefined
    case 'checkout': case 'switch': {
      if (args.some(arg => BRANCH_CREATE.has(arg))) return deny('it creates a branch')
      if (positional.length === 0) return sub === 'checkout' ? undefined : deny('it names no branch')
      if (positional[0] === '--') return sub === 'checkout' ? undefined : deny('it is not a branch')
      return positional[0] === facts.branch ? undefined : deny('it moves off your branch')
    }
    default:
      break
  }
  // What can discard or rewrite history first gets its snapshot (§3.2.4 step 4).
  const risk = gitRisk(sub, args)
  return risk !== undefined ? { snapshot: risk } : undefined
}

/** The git verdict over one shell call: the first refusing call wins, the first risky call names the snapshot. Pure. */
function workerGitVerdict(facts: GitFacts): Correction | { readonly snapshot: GitInvocation, readonly risk: GitRisk } | undefined {
  for (const invocation of facts.invocations) {
    const verdict = judgeGitCall(facts, invocation)
    if (verdict === undefined) continue
    if ('snapshot' in verdict) return { snapshot: invocation, risk: verdict.snapshot }
    return verdict
  }
  return undefined
}

// ---- worker-message-live-only (§3.2.5) ----

/** The message verdict for a `send_message`/`interrupt_agent` call (§3.2.5). Pure. */
function messageVerdict(
  call: ToolCall,
  facts: { readonly register: (agentId: string) => Attempt | undefined, readonly live: (agentId: string) => boolean },
): Correction | undefined {
  if (!MESSAGE_TOOLS.has(call.name) || typeof call.arguments !== 'object' || call.arguments === null) return undefined
  const target = (call.arguments as Record<string, JsonValue>).agent_id
  if (typeof target !== 'string' || !target.startsWith('hz-')) return undefined
  const denial = (): Correction => ({
    fact: `You sent ${call.name} to ${target}.`,
    violation: 'That worker has ended; a message would cold-resume it without the structured handback, so its work would never reach review or the merge check.',
    rightPath: 'That worker has ended; dispatch the task again with dispatch_task (the new attempt carries the earlier findings).',
    exception: 'interrupt_agent on an ended id has nothing to cancel either.',
  })
  const attempt = facts.register(target)
  if (attempt === undefined) return denial()
  if (!facts.live(target)) return denial()
  // A live check takes no follow-ups either; interrupting it is fine (§3.2.5).
  if (call.name === 'send_message' && attempt.role === 'check') return denial()
  return undefined
}

// ---- worker-graph-readonly (§3.2.3) ----

/** The graph verdict for a dispatched chain's call (§3.2.3). Pure. */
function graphVerdict(call: ToolCall): Correction | undefined {
  if (!GRAPH_WRITE_NAMES.has(call.name)) return undefined
  return {
    fact: `You called ${call.name}.`,
    violation: 'A dispatched agent reads the project graph and annotates it; only the main agent and the harness write it.',
    rightPath: 'Report it in your handback (questions, assumptions, lessons); the main agent updates the graph.',
    exception: 'none',
  }
}

// ---- the command record (§3.8.5) ----

/** One line of `<exec>/tasks/<task>/<childId>.commands.jsonl`: words and paths, never output. */
export interface CommandRecordLine {
  readonly at: string
  readonly agent: string
  readonly tool: string
  readonly simple: readonly (readonly string[])[] | null
  readonly git: readonly { readonly sub: string, readonly args: readonly string[] }[]
  readonly paths: readonly string[]
  readonly writes: boolean
  readonly verdict: 'allowed' | 'refused'
}

/** The path-shaped words of a shell text: absolute literals resolved, home markers kept as written, redirect targets. */
function shellPaths(command: string, dialect: ShellDialect, base: string | undefined): string[] {
  const found: string[] = []
  for (const words of simpleCommands(command, dialect)) {
    for (const word of words) {
      if (HOME_MARKERS.test(word) || (isAbsolute(word) && /[\\/]/.test(word))) found.push(word)
    }
  }
  for (const write of shellWrites(command, dialect)) {
    if (write.kind === 'redirect' && write.target !== '' && write.target !== '/dev/null') found.push(write.target)
  }
  return [...new Set(found.map(path => HOME_MARKERS.test(path) ? path : base === undefined ? resolve(path) : resolve(base, path)))]
}

/** The absolute paths a file tool call names, resolved against the caller's working directory. */
function toolPaths(call: ToolCall, base: string | undefined): string[] {
  const args = typeof call.arguments === 'object' && call.arguments !== null && !Array.isArray(call.arguments) ? call.arguments as Record<string, JsonValue> : undefined
  const raw: string[] = []
  for (const key of ['file_path', 'path']) {
    const value = args?.[key]
    if (typeof value === 'string' && value !== '') raw.push(value)
  }
  return raw.map(path => base === undefined ? resolve(path) : resolve(base, path))
}

/** The record line for one call, before the verdict is known (§3.8.5). Pure. */
function commandRecordOf(input: {
  readonly at: string
  readonly agent: string
  readonly call: ToolCall
  readonly dialects: readonly ShellDialect[]
  /** The caller's working directory, for relative targets. */
  readonly base: string | undefined
}): Omit<CommandRecordLine, 'verdict'> {
  const shell = shellCommandOf(input.call)
  let simple: readonly (readonly string[])[] | null = null
  let git: CommandRecordLine['git'] = []
  if (shell !== undefined) {
    const dialect = shell.dialects[0]
    try {
      simple = simpleCommands(shell.command, dialect).map(words => [commandName(words[0] ?? ''), ...words.slice(1)])
      git = gitInvocations(shell.command, dialect, input.base).map(({ sub, args }) => ({ sub, args }))
    }
    catch {
      simple = null
    }
  }
  const paths = shell === undefined
    ? toolPaths(input.call, input.base)
    : shell.dialects.flatMap(dialect => shellPaths(shell.command, dialect, input.base))
  const writes = isFileWrite(input.call) || (shell !== undefined && shell.dialects.some(dialect => shellWrites(shell.command, dialect).length > 0))
  return { at: input.at, agent: input.agent, tool: input.call.name, simple, git, paths, writes }
}

// ---- the listener ----

/** What the installer needs from the execute row; every service read may fail, and the call then passes with the health saying why. */
export interface ExecuteRulesDeps {
  readonly lookup: ServiceLookup
  /** The register entry of an agent id. */
  readonly register: (agentId: string) => Attempt | undefined
  /** The register entry of the dispatch a delegated caller works under, following the chain up; undefined when none of its ancestors is registered. */
  readonly owning: (caller: { readonly id: string, readonly session: { readonly id: string, readonly header: { readonly parentSession?: string, readonly origin?: 'subagent' } } }) => Attempt | undefined
  /** Whether the host still has the agent of a child id. */
  readonly live: (agentId: string) => boolean
  /** The row's revision-cached graph of a project, loaded by the dispatches; undefined when none was read yet. */
  readonly graphOf: (projectRoot: string) => LoadedGraph | undefined
  /** Write one denial to the violation journal; never rejects into the call. */
  readonly journal: (record: ViolationRecord) => void
  /** Report the row health of the caller's session. */
  readonly report: (agentId: string | undefined, state: HealthState, reason: string) => void
  /** Append one line to a task's command record; false when the write failed (the attempt's handback then reviews at full depth, §3.7.1). */
  readonly record: (task: string, childId: string, line: CommandRecordLine) => Promise<boolean>
  /** The caller's effective working directory (rc.3 `workingDirectory.get`): a subagent's session header keeps its parent's, and the write targets and the git commands resolve against this one. */
  readonly effectiveDir: (session: SessionLike) => string | undefined
  /** Count one allowed `send_message` delivery to a live dispatch; the handback's communication counts read it (§3.4.4). */
  readonly recordIncoming?: (childId: string) => void
  /** The machine the snapshot runs on; tests replace the parts they control. */
  readonly snapshots?: SnapshotEnvironment
}

/** Install the four rules on `tools/pre-execute`, prepended. Returns the uninstall function. */
export function installExecuteRules(ctx: PreExecuteHost, deps: ExecuteRulesDeps): () => void {
  const warn = dialectWarner('execute')
  const listener: PreExecuteListener = async (payload, next) => {
    if (payload.parent !== undefined) return next()
    const agent = payload.agent
    if (agent?.session === undefined) return next()
    const dialect = dialectService(deps.lookup, warn)
    const call: ToolCall = { name: toNativeTool(dialect, payload.name, warn), arguments: (payload.arguments ?? {}) as JsonValue }
    const session = agent.session

    // worker-message-live-only (§3.2.5): the main agent's messages to the dispatched chain.
    const message = messageVerdict(call, { register: deps.register, live: deps.live })
    if (message !== undefined) return refuse('worker-message-live-only', message, payload, agent.id, session.id, deps)
    // An allowed delivery to a live dispatch is a communication fact the handback's counts read (§3.4.4).
    const args = call.arguments
    const target = typeof args === 'object' && args !== null && !Array.isArray(args) && typeof (args as Record<string, unknown>).agent_id === 'string' ? (args as Record<string, unknown>).agent_id as string : undefined
    if (call.name === 'send_message' && target !== undefined && deps.register(target) !== undefined && deps.live(target)) {
      deps.recordIncoming?.(target)
    }

    const attempt = deps.register(agent.id)
    const delegated = attempt === undefined && session.header.origin === 'subagent'
    if (attempt === undefined && !delegated) return next()

    // The session's effective directory: a subagent's header keeps its
    // parent's, so the rc.3 service is what the file tools resolve against.
    const cwd = deps.effectiveDir(session) ?? session.header.cwd

    const owner = attempt ?? deps.owning({ id: agent.id, session })
    const record = async (verdict: 'allowed' | 'refused'): Promise<void> => {
      if (owner === undefined) return
      if (!MESSAGE_TOOLS.has(call.name) && (call.name === 'pwsh' || call.name === 'bash' || call.name === 'terminal_send' || FILE_TOOLS.has(call.name))) {
        const line = commandRecordOf({ at: new Date().toISOString(), agent: agent.id, call, dialects: shellCommandOf(call)?.dialects ?? [], base: cwd })
        if (!(await deps.record(owner.node, owner.childId, { ...line, verdict }))) {
          deps.report(agent.id, 'degraded', `命令记录写不进（任务 ${owner.node}），这次派发的审查按全审判`)
        }
      }
    }

    // worker-graph-readonly (§3.2.3): a dispatched chain's graph write by name.
    const graph = graphVerdict(call)
    if (graph !== undefined) { await record('refused'); return refuse('worker-graph-readonly', graph, payload, agent.id, session.id, deps) }

    // worker-scope (§3.2.1): a registered caller's file write.
    if (attempt !== undefined && isFileWrite(call)) {
      const root = attempt.worktree ?? cwd ?? '.'
      const project = projectOf(root)?.root
      const graph = project === undefined ? undefined : deps.graphOf(project)
      const node = graph?.nodes.get(attempt.node)
      const refusal = workerScopeVerdict({
        task: attempt.node,
        worktree: root,
        target: fileToolTargetOf(call) === undefined ? undefined : repoRelative(root, cwd ?? root, fileToolTargetOf(call)!),
        reviewer: attempt.role !== 'worker',
        scope: node?.writeScope ?? [],
        release: graph !== undefined && node !== undefined ? releaseOf(graph, node) : undefined,
        planPaths: attempt.plan === 'approved' ? attempt.planPaths ?? [] : undefined,
        needsPlan: attempt.role === 'worker' && attempt.plan !== 'skipped',
      })
      if (refusal !== undefined) { await record('refused'); return refuse('worker-scope', refusal, payload, agent.id, session.id, deps) }
    }

    // worker-git (§3.2.4): the shell calls of the dispatched chain.
    const shell = shellCommandOf(call)
    if (shell !== undefined && owner !== undefined) {
      const role = attempt !== undefined && attempt.role === 'worker' ? 'worker' as const : 'reviewer' as const
      const verdict = workerGitVerdict({
        role,
        task: owner.node,
        branch: role === 'worker' ? `hz/${owner.node}` : undefined,
        root: attempt?.worktree ?? cwd ?? '.',
        invocations: shell.dialects.flatMap(d => gitInvocations(shell.command, d, cwd)),
      })
      if (verdict !== undefined && !('snapshot' in verdict)) { await record('refused'); return refuse('worker-git', verdict, payload, agent.id, session.id, deps) }
      if (verdict !== undefined && 'snapshot' in verdict) {
        const who: SnapshotWho = { command: shell.command, ...(cwd === undefined ? {} : { sessionDir: cwd }), sessionId: session.id, agentId: agent.id }
        const outcome = await takeSnapshot(verdict.snapshot.dir ?? cwd ?? '.', verdict.snapshot, verdict.risk, who, deps.snapshots)
        if (outcome.kind === 'refused') { await record('refused'); return refuse('worker-git', snapshotCorrection(shell.command, outcome.refusal), payload, agent.id, session.id, deps) }
        if (outcome.kind === 'git-missing') deps.report(agent.id, 'degraded', 'git 不在，快照没有存，命令放行了')
      }
    }

    await record('allowed')
    return next()
  }
  return ctx.on('tools/pre-execute', listener, { prepend: true })
}

/** Deny with the rendered correction, journaled; the optional record runs first with `refused`. */
function refuse(
  rule: string,
  correction: Correction,
  payload: { name: string },
  agentId: string,
  sessionId: string,
  deps: Pick<ExecuteRulesDeps, 'journal'>,
): PreExecuteDecision {
  const reason = renderCorrection(correction)
  deps.journal({ at: new Date().toISOString(), rule, tool: payload.name, agentId, sessionId, correction: reason })
  return { kind: 'deny', reason }
}
