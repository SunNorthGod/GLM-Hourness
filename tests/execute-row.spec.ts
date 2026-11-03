import assert from 'node:assert/strict'
import test from 'node:test'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openEngine } from '../src/graph/engine.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import { EXECUTE_TOOL_NAMES, GRAPH_TOOL_NAMES, WORKER_TOOL_NAMES } from '../src/shared/tool-names.ts'
import { PEAK_MODE_SERVICE, peakModeService, type PeakModeService } from '../src/shared/peak-mode.ts'
import { EXECUTE_SERVICE, type ExecuteService } from '../src/shared/execute-service.ts'
import { EXECUTE_RULES, installExecuteRules, type CommandRecordLine } from '../src/guard/execute-rules.ts'
import type { AgentLike, AssembledTool, InjectableServices, ServiceLookup, SessionLike, ToolDefinitionLike } from '../src/shared/dsh-min.ts'
import { faceOfRole } from '../src/execute/faces.ts'
import { dispatchTool, createGraphCache, type DispatchDeps } from '../src/execute/dispatch.ts'
import { dispatchDescription } from '../src/execute/examples.ts'
import { forgetAttempt, registeredAttempt, type Attempt } from '../src/execute/attempts.ts'
import { REVIEW_SCHEMA } from '../src/execute/schemas.ts'
import { apply as executeApply } from '../src/execute/index.ts'
import { designHost, denied } from './design-host.ts'
import { execTool, fakeInjector, fakeRuntime, schemaViolations, type FakeRuntime } from './fake-rc3.ts'
import { gitSeed } from './execute-helpers.ts'
import { apply as designApply } from '../src/design/index.ts'

// ---- fixtures ----

interface Project {
  readonly root: string
  readonly graphDir: string
}

const WORK_TASK = { type: 'task' as const, parent: 'goal-1', title: 'Add the feed', kind: 'implement' as const, writeScope: ['site/'], acceptance: ['the feed builds'], worktree: true }

/** A git repository with a committed README and a preset graph: a released goal over the given nodes. */
async function presetProject(nodes: readonly Partial<GraphNode>[]): Promise<Project> {
  const root = mkdtempSync(join(tmpdir(), 'glm-hourness-execute-'))
  mkdirSync(join(root, 'docs', 'graph'), { recursive: true })
  const graphDir = join(root, 'docs', 'graph')
  const engine = openEngine(graphDir)
  const seeds = [['goal-1', { type: 'goal', title: 'Static blog', stage: 'release', acceptance: ['the blog builds'] }] as const, ...nodes.map(entry => [String(entry.id), entry] as const)]
  for (const [id, node] of seeds) {
    const seeded = await engine.apply('human', { op: 'propose', reason: 'test seed', node: { ...node, ...(id === 'goal-1' ? {} : {}) } })
    if (!seeded.ok) throw new Error(`seeding ${String(node.id ?? id)} failed: ${JSON.stringify(seeded.error)}`)
  }
  gitSeed(root)
  return { root, graphDir }
}

function dispose(project: Project): void {
  rmSync(project.root, { recursive: true, force: true })
}

/** A fake `subagents` service: records the started activations, answers an accepted one. */
function fakeSubagents(): { readonly service: InjectableServices['subagents'], readonly started: Array<Record<string, unknown>> } {
  const started: Array<Record<string, unknown>> = []
  const service = {
    interrupt(): void {},
    startActivation(spec: Record<string, unknown>) {
      started.push(spec)
      return { childId: spec.childId, result: Promise.resolve({ output: [], stopReason: 'completed' }), dispose: async () => {} }
    },
    resolveMaxDepth(): number | undefined {
      return 1
    },
    registerProvider(): () => void {},
    waitForChildren(): Promise<boolean> {
      return Promise.resolve(false)
    },
    sendMessage(): Promise<string> {
      return Promise.resolve('m')
    },
    listChildren(): Promise<readonly unknown[]> {
      return Promise.resolve([])
    },
  }
  return { service: service as unknown as InjectableServices['subagents'], started }
}

/** The fake peak service, typed after the real contract (R4-F6): a fixed reduce state with the given cap. */
function fakePeak(cap: number): PeakModeService {
  const state = { level: 'reduce' as const, origin: 'human' as const, peak: true, until: '2030-01-01T10:00:00.000Z', glmWorkerCap: cap }
  return {
    stateFor: () => state,
    stateForProject: () => state,
    peakHoldFor: () => ({ level: 'reduce', until: state.until }),
  }
}

function lookupWith(subagents: InjectableServices['subagents'], extra: Partial<Record<string, unknown>> = {}): ServiceLookup {
  const services = new Map<string, unknown>([['subagents', subagents], ...Object.entries(extra)])
  return { get: (name: string) => services.get(name) }
}

/** DispatchDeps over a preset project; the returned hook drops a child id from the module register. */
function depsFor(project: Project, subagents: InjectableServices['subagents'], over: Partial<DispatchDeps> = {}): { readonly deps: DispatchDeps, readonly cleanup: (childId: string) => void } {
  return {
    deps: {
      lookup: lookupWith(subagents),
      graphDir: () => project.graphDir,
      cache: createGraphCache(() => {}),
      isMainAgent: () => true,
      designPresent: () => true,
      slots: 3,
      execDir: root => join(root, '.llm', 'execute'),
      report: () => {},
      ...over,
    },
    cleanup: childId => forgetAttempt(childId),
  }
}

function mainAgent(cwd: string): AgentLike {
  return {
    id: 'main-1',
    ctx: {} as never,
    session: { id: 'main-1', header: { id: 'main-1', cwd }, requestHeader: () => ({ config: { provider: 'probe', model: 'glm-5.3' } }) },
  }
}

/** One dispatch through the tool; the caller reads the summary or catches the thrown refusal. */
async function dispatch(deps: DispatchDeps, cwd: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const tool = dispatchTool(deps)
  return await tool.execute(args, { callId: 'call-1', signal: new AbortController().signal, agent: mainAgent(cwd), deferContext: () => {}, concludeTurn: () => {} }) as Record<string, unknown>
}

async function refusedOf(run: () => Promise<unknown>): Promise<{ code: string, message: string, hint: string }> {
  try {
    await run()
  }
  catch (error) {
    return JSON.parse(error instanceof Error ? error.message : String(error)) as { code: string, message: string, hint: string }
  }
  throw new Error('the call was expected to refuse')
}

/** A child agent as a gate sees one: its session is the worktree, its header a delegated child of the main session. */
function childAgent(childId: string, cwd: string, parentSession: string): AgentLike {
  const session: SessionLike = { id: childId, header: { id: childId, cwd, origin: 'subagent', parentSession }, deriveMessages: () => [] }
  return { id: childId, ctx: {} as never, session }
}

/** The four rules over a test project, with journal and command records under the project's `.llm`. */
function rulesOver(project: Project, cache: ReturnType<typeof createGraphCache>): (runtime: FakeRuntime) => void {
  return (runtime) => {
    installExecuteRules(runtime.ctx, {
      lookup: runtime.ctx,
      register: registeredAttempt,
      owning: () => undefined,
      live: () => false,
      graphOf: projectRoot => cache.get(join(projectRoot, 'docs', 'graph')),
      journal: violation => {
        mkdirSync(join(project.root, '.llm', 'audit'), { recursive: true })
        appendFileSync(join(project.root, '.llm', 'audit', 'violations.jsonl'), `${JSON.stringify(violation)}\n`, 'utf8')
      },
      report: () => {},
      effectiveDir: session => session.header.cwd,
      record: (task, childId, line: CommandRecordLine) => {
        try {
          mkdirSync(join(project.root, '.llm', 'execute', 'tasks', task), { recursive: true })
          appendFileSync(join(project.root, '.llm', 'execute', 'tasks', task, `${childId}.commands.jsonl`), `${JSON.stringify(line)}\n`, 'utf8')
          return Promise.resolve(true)
        }
        catch {
          return Promise.resolve(false)
        }
      },
    })
  }
}

// ---- the row wiring ----

test('the execute row registers dispatch_task, its description is the example constant\u2019s text, and glmHournessExecute is provided', () => {
  const runtime = fakeRuntime({ natives: [] })
  // The host's tools service, as inject would hand it over.
  runtime.ctx.provide('tools', {
    get: (toolName: string) => runtime.scoped.find(tool => tool.name === toolName),
    register: (definition: ToolDefinitionLike) => {
      const violations = schemaViolations(definition.output.schema)
      assert.deepEqual(violations, [], `dispatch_task's output schema is outside the subset: ${violations.join('; ')}`)
      runtime.scoped.push(definition)
      return () => { runtime.scoped.splice(runtime.scoped.indexOf(definition), 1) }
    },
  })
  ;(runtime.ctx as { inject?: unknown }).inject = fakeInjector({ tools: runtime.ctx.get('tools') }, runtime.ctx).inject
  executeApply(runtime.ctx, {})
  const registered = runtime.scoped.find<ToolDefinitionLike>(tool => tool.name === 'dispatch_task')
  assert.ok(registered !== undefined, 'the row did not register dispatch_task')
  assert.equal(registered.description, dispatchDescription())
  const service = runtime.ctx.get(EXECUTE_SERVICE) as ExecuteService | undefined
  assert.ok(service !== undefined && service.isWorker('nobody') === false, 'glmHournessExecute.isWorker is provided')
})

test('EXECUTE_RULES carries the eight code gates, all enforce on day one (§12.1)', () => {
  const ids = new Set(EXECUTE_RULES.map(rule => rule.id))
  for (const wanted of ['worker-scope', 'dispatch-chain-readonly', 'worker-graph-readonly', 'worker-git', 'worker-message-live-only', 'stopped', 'trunk-advance-checked', 'completion-gate']) {
    assert.ok(ids.has(wanted), `${wanted} is not in EXECUTE_RULES`)
  }
})

// ---- the dispatched chain's rules on the fake host ----

test('a registered worker writes inside its file scope and its .hourness/; outside, the worktree and a git push are refused and journaled; reset --hard runs after its snapshot', async () => {
  const task = { ...WORK_TASK, id: 'task-1', writeScope: ['site/index.md'] }
  const project = await presetProject([task])
  try {
    const { deps, cleanup } = depsFor(project, fakeSubagents().service)
    const cache = deps.cache
    const runtime = fakeRuntime({ natives: ['write', 'pwsh'] })
    rulesOver(project, cache)(runtime)
    const summary = await dispatch(deps, project.root, { id: 'task-1', model: 'probe-model', why: 'one file, no plan needed', quick: true }) as { childId: string, worktree: string }
    const childId = summary.childId
    const worktree = join(project.root, '.worktrees', `hz-task-1`)
    assert.equal(summary.worktree.replaceAll('\\', '/'), '.worktrees/hz-task-1')
    const child = childAgent(childId, worktree, 'main-1')
    const exec = execTool(runtime)
    // Inside the file scope: runs.
    const inside = await exec('write', { file_path: join(worktree, 'site', 'index.md'), content: '# feed\n' }, { agent: child })
    assert.ok(!inside.isError, `the in-scope write was refused: ${inside.content.map(part => part.text ?? '').join('')}`)
    // The report area: runs.
    const report = await exec('write', { file_path: join(worktree, '.hourness', `${childId}.md`), content: 'report\n' }, { agent: child })
    assert.ok(!report.isError, `the .hourness report was refused: ${report.content.map(part => part.text ?? '').join('')}`)
    // Out of the scope, inside the worktree: refused, nothing written.
    const outside = await exec('write', { file_path: join(worktree, 'docs', 'escaped.md'), content: 'no\n' }, { agent: child })
    assert.ok(outside.isError && outside.content.map(part => part.text ?? '').join('').includes('outside the write scope'), `out-of-scope write ran: ${outside.content.map(part => part.text ?? '').join('')}`)
    assert.ok(!existsSync(join(worktree, 'docs', 'escaped.md')), 'a refused write must not exist')
    // Outside the worktree: refused.
    const elsewhere = await exec('write', { file_path: join(project.root, 'escaped.txt'), content: 'no\n' }, { agent: child })
    assert.ok(elsewhere.isError && elsewhere.content.map(part => part.text ?? '').join('').includes('you write only inside your worktree'), `out-of-worktree write ran: ${elsewhere.content.map(part => part.text ?? '').join('')}`)
    // A git push is refused; reset --hard runs after its snapshot.
    const push = await exec('pwsh', { command: 'git push origin main' }, { agent: child }) as { isError: boolean, content: { text?: string }[] }
    assert.ok(push.isError && push.content.map(part => part.text ?? '').join('').includes('use git only on your branch'), `git push ran: ${push.content.map(part => part.text ?? '').join('')}`)
    const reset = await exec('pwsh', { command: 'git reset --hard' }, { agent: child }) as { isError: boolean, content: { text?: string }[] }
    assert.ok(!reset.isError, `git reset --hard was refused: ${reset.content.map(part => part.text ?? '').join('')}`)
    assert.ok(existsSync(join(project.root, '.llm', 'snapshots.jsonl')), 'the snapshot before reset --hard left no journal')
    // The graph write tools by name are refused for the chain; graph_comment is not one of them and reaches its own (absent) body.
    const graphWrite = await exec('graph_status', { id: 'goal-1' }, { agent: child }) as { isError: boolean }
    assert.ok(graphWrite.isError, 'graph_status by name ran in the chain')
    // The violations are in the journal.
    const violations = readFileSync(join(project.root, '.llm', 'audit', 'violations.jsonl'), 'utf8')
    assert.ok(violations.includes('worker-scope'), 'the worker-scope denial is not in the violation journal')
    assert.ok(violations.includes('worker-git'), 'the worker-git denial is not in the violation journal')
    // The command record carries the allowed and the refused calls (§3.8.5).
    const records = readFileSync(join(project.root, '.llm', 'execute', 'tasks', 'task-1', `${childId}.commands.jsonl`), 'utf8')
    assert.ok(records.includes('"verdict":"refused"') && records.includes('"verdict":"allowed"'), `the command record is missing verdicts: ${records.slice(0, 200)}`)
    cleanup(childId)
  }
  finally {
    dispose(project)
  }
})

test('a dispatch without model or why is invalid with the catalog hint; the goal review and the task review refuse until their steps land', async () => {
  const project = await presetProject([WORK_TASK])
  try {
    const { deps, cleanup } = depsFor(project, fakeSubagents().service)
    const missing = await refusedOf(() => dispatch(deps, project.root, { id: 'task-1', why: 'x' }))
    assert.equal(missing.code, 'invalid')
    assert.match(missing.message, /model is required/)
    const goal = await refusedOf(() => dispatch(deps, project.root, { id: 'goal-1', model: 'probe-model', why: 'x' }))
    assert.match(goal.message, /acceptance review of a goal/)
    const reviewTask = { ...WORK_TASK, id: 'review-1', kind: 'review' as const, writeScope: [], acceptance: ['the review'] }
    const withReview = await presetProject([reviewTask])
    try {
      const other = depsFor(withReview, fakeSubagents().service)
      const refusal = await refusedOf(() => dispatch(other.deps, withReview.root, { id: 'review-1', model: 'probe-model', why: 'x' }))
      assert.ok(refusal.code === 'nothing_to_review' || refusal.message.includes('handback step'), 'a review task dispatched anyway: ' + JSON.stringify(refusal))
      other.cleanup('unused')
    }
    finally {
      dispose(withReview)
    }
    cleanup('unused')
  }
  finally {
    dispose(project)
  }
})

test('a task under an unreleased module is refused not_released; the design review of the module is dispatched with the review schema and the directions (E4 items, R5-F4)', async () => {
  const module = { type: 'feature' as const, id: 'module-b', title: 'Reports', parent: 'goal-1', stage: 'design' as const, acceptance: ['reports work'] }
  const decision = { type: 'decision' as const, id: 'decision-b', title: 'One report format', parent: 'module-b' }
  const taskB = { ...WORK_TASK, id: 'task-b', parent: 'module-b' }
  const directions = { type: 'norm' as const, id: 'norm-directions', title: 'Directions', parent: 'goal-1', acceptance: ['direction one', 'direction two'] }
  const project = await presetProject([module, decision, taskB, directions])
  try {
    const subagents = fakeSubagents()
    const { deps, cleanup } = depsFor(project, subagents.service)
    const refused = await refusedOf(() => dispatch(deps, project.root, { id: 'task-b', model: 'probe-model', why: 'x' }))
    assert.equal(refused.code, 'not_released')
    assert.match(refused.hint, /module module-b/)
    const review = await dispatch(deps, project.root, { id: 'module-b', model: 'probe-model', why: 'the design is done' }) as { childId: string, role: string }
    assert.equal(review.role, 'review')
    const spec = subagents.started.at(-1) as { request: { outputSchema?: unknown, prompt?: readonly { text?: string }[] } }
    assert.deepEqual(spec.request.outputSchema, REVIEW_SCHEMA)
    const brief = (spec.request.prompt as readonly { text?: string }[])[0]?.text ?? ''
    assert.match(brief, /Review the design of module module-b "Reports" against the direction list/)
    assert.match(brief, /direction:0 direction one/)
    assert.match(brief, /direction:1 direction two/)
    cleanup(String(review.childId))
  }
  finally {
    dispose(project)
  }
})

test('the GLM peak cap limits a second GLM dispatch to slots_full; a non-GLM model passes (E4 item)', async () => {
  const project = await presetProject([{ ...WORK_TASK, writeScope: ['site/a/'] }, { ...WORK_TASK, id: 'task-7', title: 'Second', writeScope: ['site/b/'] }, { ...WORK_TASK, id: 'task-8', title: 'Third', writeScope: ['site/c/'] }])
  try {
    const subagents = fakeSubagents()
    const peak = fakePeak(1)
    const { deps, cleanup } = depsFor(project, subagents.service, { lookup: lookupWith(subagents.service, { [PEAK_MODE_SERVICE]: peak }) })
    assert.ok(peakModeService(deps.lookup) !== undefined, 'the fake must satisfy the real contract reader')
    const first = await dispatch(deps, project.root, { id: 'task-1', model: 'glm-5.3', why: 'peak or not' }) as { childId: string }
    const second = await refusedOf(() => dispatch(deps, project.root, { id: 'task-7', model: 'glm-5.3', why: 'x' }))
    assert.equal(second.code, 'slots_full')
    assert.match(second.message, /GLM peak, reduce/)
    assert.match(second.hint, /A non-GLM model is not limited/)
    const third = await dispatch(deps, project.root, { id: 'task-8', model: 'probe-model', why: 'not a glm model' }) as { childId: string }
    cleanup(String(first.childId))
    cleanup(String(third.childId))
  }
  finally {
    dispose(project)
  }
})

// ---- the design row with the execute row on (F18) ----

test('with the execute service on, the main agent\u2019s no-write denial points at dispatch_task; without it, at the subagent tool', async () => {
  const withExecute = designHost()
  ;withExecute.services.set(EXECUTE_SERVICE, { isWorker: () => false } satisfies ExecuteService)
  designApply(withExecute.ctx)
  const agent = withExecute.addAgent('s1')
  assert.equal((await withExecute.execute(agent, '/wish'))?.result.kind, 'success')
  const on = denied(await withExecute.preExecute(agent, 'write', { file_path: 'a.txt', content: 'x' }))
  assert.match(on, /dispatch_task/)
  assert.match(on, /subagents started with the subagent tool only read/)
  const without = designHost()
  designApply(without.ctx)
  const plain = without.addAgent('s2')
  assert.equal((await without.execute(plain, '/wish'))?.result.kind, 'success')
  const off = denied(await without.preExecute(plain, 'write', { file_path: 'a.txt', content: 'x' }))
  assert.doesNotMatch(off, /dispatch_task/)
  assert.match(off, /hand it to a subagent with the subagent tool/)
})

// ---- the face filter (§2.3.2) ----

const FACE_TOOLS: readonly AssembledTool[] = [...GRAPH_TOOL_NAMES, ...EXECUTE_TOOL_NAMES, ...WORKER_TOOL_NAMES, 'read'].map(name => ({ name, description: name, parameters: { type: 'object', properties: {} } }))

test('faceOfRole: the main agent keeps everything; a non-main agent loses the execute and operate tools; a worker keeps the worker tools; a reviewer loses submit_plan; a dispatched chain loses the nine graph writes', () => {
  const names = (tools: readonly AssembledTool[]): readonly string[] => tools.map(tool => tool.name)
  const attempt = (role: Attempt['role']): Attempt => ({
    childId: `hz-task-1-a1-000000`, role, node: 'task-1', attempt: 1, provider: 'p', model: 'm', why: 'w', plan: 'required', pins: 'pins: x',
  })
  const main = names(faceOfRole(FACE_TOOLS, { main: true, dispatched: false }))
  assert.deepEqual(EXECUTE_TOOL_NAMES.filter(name => main.includes(name)), EXECUTE_TOOL_NAMES)
  assert.deepEqual(WORKER_TOOL_NAMES.filter(name => main.includes(name)), [], 'the main agent is no worker: its face has none of the worker tools')
  const plain = names(faceOfRole(FACE_TOOLS, { main: false, dispatched: false }))
  for (const name of EXECUTE_TOOL_NAMES) assert.ok(!plain.includes(name), `a non-main agent kept ${name}`)
  const worker = names(faceOfRole(FACE_TOOLS, { main: false, attempt: attempt('worker'), dispatched: true }))
  assert.deepEqual(WORKER_TOOL_NAMES.filter(name => worker.includes(name)), WORKER_TOOL_NAMES)
  assert.ok(!worker.includes('graph_status') && worker.includes('graph_comment'), `the worker's graph face is wrong: ${worker.join(', ')}`)
  const reviewer = names(faceOfRole(FACE_TOOLS, { main: false, attempt: attempt('review'), dispatched: true }))
  assert.ok(!reviewer.includes('submit_plan') && reviewer.includes('ask_main'), `the reviewer's face is wrong: ${reviewer.join(', ')}`)
  const child = names(faceOfRole(FACE_TOOLS, { main: false, dispatched: true }))
  for (const name of WORKER_TOOL_NAMES) assert.ok(!child.includes(name), `a read-only child kept ${name}`)
  assert.ok(!child.includes('graph_edit') && child.includes('graph_show'), `a read-only child's graph face is wrong: ${child.join(', ')}`)
})
