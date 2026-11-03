/**
 * The plan and communication tools (M7 design 0.6 §3.3, §3.4) over a preset
 * project: the failing check returns to the worker with nobody notified and
 * the fourth in a row must hand back; a passing plan lands on the task body,
 * notifies the current holder, and the approval flips the section, writes the
 * approval comment and gives the registered dispatch the path union; the
 * approval re-check refuses brief_stale and plan_invalid without moving the
 * worker's held call; ask_main returns the answer inside the same call and
 * times out into the stated assumption; answer_worker is the main agent's
 * only. The dispatch half of the carried plan — the path union a later
 * dispatch registers — runs against the real dispatch tool.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openEngine } from '../src/graph/engine.ts'
import { claimHolder, holderFileOf, type HolderRecord } from '../src/graph/main-agent-holder.ts'
import { parsePins, pinsOf, renderPins } from '../src/graph/pins.ts'
import type { AgentLike, ServiceLookup, ToolExecutionContext, UserNotice } from '../src/shared/dsh-min.ts'
import { createGraphCache, dispatchTool, type DispatchDeps } from '../src/execute/dispatch.ts'
import { answerWorkerTool, askMainTool, oldestPending, submitPlanTool, type RequestsDeps } from '../src/execute/requests.ts'
import { forgetAttempt, registerAttempt, registeredAttempt } from '../src/execute/attempts.ts'
import { parseApprovalComment, readPlanSection, renderApprovalComment } from '../src/execute/plan.ts'
import { sha256Hex } from '../src/execute/digest.ts'
import { gitSeed } from './execute-helpers.ts'

// ---- fixtures ----

interface Project {
  readonly root: string
  readonly graphDir: string
}

const GOOD_PLAN = {
  steps: [{ title: 'Write the feed builder', paths: ['site/feed/index.js'], acceptance: ['it renders'], covers: [0, 1], verify: 'L2', commands: ['node --test'] }],
}

const BAD_PLAN = {
  steps: [{ title: 'Write the feed builder', paths: ['site/feed/index.js'], acceptance: ['it renders'], covers: [], verify: 'L1', commands: [] }],
}

const PLAN_TIMEOUT = { status: 'timeout', version: 1, hint: 'No review within 30 minutes; hand back with status plan-pending.' }
const ASK_TIMEOUT = { status: 'timeout', hint: 'No answer within 20 minutes; continue on your stated assumption and list it under assumptions in your handback.' }

/** A git repository with a committed README and a released goal over one task. */
async function presetProject(): Promise<Project> {
  const root = mkdtempSync(join(tmpdir(), 'glm-hourness-requests-'))
  mkdirSync(join(root, 'docs', 'graph'), { recursive: true })
  const graphDir = join(root, 'docs', 'graph')
  const engine = openEngine(graphDir)
  for (const seed of [
    { type: 'goal', id: 'goal-1', title: 'Static blog', stage: 'release', acceptance: ['the blog builds'] },
    { type: 'task', id: 'task-1', title: 'Add the feed', parent: 'goal-1', kind: 'implement', writeScope: ['site/'], acceptance: ['the feed builds', 'every item has a title'], worktree: true },
  ]) {
    const seeded = await engine.apply('human', { op: 'propose', reason: 'test seed', node: seed })
    if (!seeded.ok) throw new Error(`seeding ${String(seed.id)} failed: ${JSON.stringify(seeded.error)}`)
  }
  gitSeed(root)
  return { root, graphDir }
}

/** The holder record, the agent registry a notice goes through, and the subagents stub a dispatch needs; sent notices are captured. */
function noticeHost(project: Project): { readonly lookup: ServiceLookup, readonly sent: UserNotice[] } {
  const home = join(project.root, 'dsh-home')
  mkdirSync(home, { recursive: true })
  const record: HolderRecord = { version: 1, sessionId: 'main-1', graphDir: project.graphDir, since: '2026-11-04T08:00:00.000Z', commandId: 'cmd-1' }
  claimHolder(holderFileOf(home, project.graphDir), record)
  const sent: UserNotice[] = []
  const deliver = (notice: UserNotice): void => { sent.push(notice) }
  const mainAgent = { id: 'main-1', status: 'idle', followup: deliver, steer: deliver }
  const agents = { get: (id: string): unknown => id === 'main-1' ? mainAgent : undefined }
  const subagents = {
    startActivation: (spec: Record<string, unknown>) => ({ childId: spec.childId, result: Promise.resolve({ output: [], stopReason: 'completed' }), dispose: async () => {} }),
    resolveMaxDepth: () => 1,
  }
  const lookup: ServiceLookup = {
    get: (name: string) => name === 'agents' ? agents : name === 'glmHournessData' ? { userHome: home } : name === 'subagents' ? subagents : undefined,
  }
  return { lookup, sent }
}

type Exec = (args: unknown, exec: ToolExecutionContext) => Promise<unknown>

interface Rig {
  readonly project: Project
  readonly deps: RequestsDeps
  readonly dispatchDeps: DispatchDeps
  readonly sent: UserNotice[]
  readonly submit: Exec
  readonly ask: Exec
  readonly answer: Exec
  readonly childExec: ToolExecutionContext
  readonly mainExec: ToolExecutionContext
  readonly childId: string
  readonly done: () => void
}

const settled = (ms = 80): Promise<void> => new Promise(done => { setTimeout(done, ms) })

/** A project, a registered worker dispatch, the three tools over them. */
async function rig(over: Partial<RequestsDeps> = {}, childId = 'hz-task-1-a1-aaaaaa'): Promise<Rig> {
  const project = await presetProject()
  const { lookup, sent } = noticeHost(project)
  const cache = createGraphCache(() => {})
  const deps: RequestsDeps = {
    lookup,
    graphDir: () => project.graphDir,
    cache,
    isMainAgent: agent => agent.id === 'main-1',
    designPresent: () => true,
    report: () => {},
    ...over,
  }
  const dispatchDeps: DispatchDeps = {
    lookup,
    graphDir: () => project.graphDir,
    cache,
    isMainAgent: agent => agent.id === 'main-1',
    designPresent: () => true,
    slots: 3,
    execDir: root => join(root, '.llm', 'execute'),
    report: () => {},
  }
  const worktree = join(project.root, '.worktrees', 'hz-task-1')
  const graph = await cache.load(project.graphDir)
  const task = graph.nodes.get('task-1')!
  const pins = renderPins(pinsOf(graph, task, sha256Hex))
  assert.ok(parsePins(pins) !== undefined, 'the fixture pins line must parse')
  registerAttempt({ childId, role: 'worker', node: 'task-1', attempt: 1, worktree, branch: 'hz/task-1', provider: 'probe', model: 'probe-model', why: 'one directory', plan: 'required', pins })
  const child: AgentLike = { id: childId, ctx: {} as never, session: { id: childId, header: { id: childId, cwd: worktree } } }
  const main: AgentLike = { id: 'main-1', ctx: {} as never, session: { id: 'main-1', header: { id: 'main-1', cwd: project.root }, requestHeader: () => ({ config: { provider: 'probe', model: 'probe-main' } }) } }
  const execOf = (agent: AgentLike, callId: string): ToolExecutionContext => ({ callId, signal: new AbortController().signal, agent, deferContext: () => {}, concludeTurn: () => {} })
  return {
    project,
    deps,
    dispatchDeps,
    sent,
    submit: (args, exec) => submitPlanTool(deps).execute(args, exec),
    ask: (args, exec) => askMainTool(deps).execute(args, exec),
    answer: (args, exec) => answerWorkerTool(deps).execute(args, exec),
    childExec: execOf(child, 'call-worker'),
    mainExec: execOf(main, 'call-main'),
    childId,
    done: () => forgetAttempt(childId),
  }
}

/** Run a test body over a rig; the register entry and the project directory go away afterwards. */
async function withRig(over: Partial<RequestsDeps>, run: (rig1: Rig) => Promise<void>, childId?: string): Promise<void> {
  const rig1 = await rig(over, childId)
  try {
    await run(rig1)
  }
  finally {
    rig1.done()
    rmSync(rig1.project.root, { recursive: true, force: true })
  }
}

/** Submit the passing plan, let the body write settle, and return the open request with the held call. */
async function submitGood(rig1: Rig): Promise<{ readonly held: Promise<unknown>, readonly request: Exclude<ReturnType<typeof oldestPending>, undefined> }> {
  const held = rig1.submit(GOOD_PLAN, rig1.childExec)
  await settled()
  const request = oldestPending('plan', rig1.project.graphDir, 'task-1')
  assert.ok(request !== undefined, 'the submit registered no request')
  return { held, request }
}

/** One harness edit on a node; the fixture asserts it went through. */
async function editNode(project: Project, id: string, set: Record<string, unknown>, reason: string): Promise<void> {
  const engine = openEngine(project.graphDir)
  const current = await engine.load()
  const moved = await engine.apply('harness', { op: 'edit', id, rev: current.revisions.get(id)!, set, reason })
  assert.ok(moved.ok, `the fixture edit failed: ${JSON.stringify(moved.ok ? {} : moved.error)}`)
}

async function refusedOf(run: () => Promise<unknown>): Promise<{ code: string, message: string, hint: string, field?: string }> {
  try {
    await run()
  }
  catch (error) {
    return JSON.parse(error instanceof Error ? error.message : String(error)) as { code: string, message: string, hint: string, field?: string }
  }
  throw new Error('the call was expected to refuse')
}

function factsOf(notice: UserNotice): { event: string, task: string, attempt: number, childId: string, request: string } {
  const facts: unknown = notice.source.hournessExecute
  assert.ok(typeof facts === 'object' && facts !== null, 'the notice carries no request facts')
  return facts as { event: string, task: string, attempt: number, childId: string, request: string }
}

// ---- submit_plan ----

test('a failing plan check comes back to the worker at once, nobody is notified, and the fourth in a row must hand back', async () => {
  await withRig({}, async (rig1) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const refusal = await refusedOf(() => rig1.submit(BAD_PLAN, rig1.childExec))
      assert.equal(refusal.code, 'invalid')
      assert.match(refusal.message, /not covered by any step/)
      assert.match(refusal.message, /the plan does not pass the checks/)
    }
    assert.equal(rig1.sent.length, 0, 'a failed check notified the main agent')
    assert.equal(oldestPending('plan', rig1.project.graphDir), undefined, 'a failed check registered nothing')
    const fourth = await refusedOf(() => rig1.submit(BAD_PLAN, rig1.childExec))
    assert.equal(fourth.code, 'plan_rejected')
    assert.equal(fourth.message, 'plan rejected 4 times; hand back with status blocked')
    // The counter is spent by the blocked answer; a next dispatch of the same worker starts fresh.
    const fifth = await refusedOf(() => rig1.submit(BAD_PLAN, rig1.childExec))
    assert.equal(fifth.code, 'invalid')
  })
})

test('a passing plan lands on the task body, the holder is notified, and the approval flips the section, comments and the register', async () => {
  await withRig({ planWaitMs: 4000 }, async (rig1) => {
    const { held, request } = await submitGood(rig1)
    assert.equal(request.version, 1)
    const notice = rig1.sent.at(-1)
    assert.ok(notice !== undefined, 'the main agent got no notice')
    const facts = factsOf(notice)
    assert.equal(notice.source.kind, 'glm-hourness-execute')
    assert.equal(facts.event, 'plan')
    assert.equal(facts.task, 'task-1')
    assert.equal(facts.childId, rig1.childId)
    assert.equal(facts.request, request.id)
    assert.match(notice.content[0].text, /第 1 版 · 等主 Agent 审 · 摘要 [0-9a-f]{12}/)
    assert.match(notice.content[0].text, new RegExp(request.id))
    const graph = await rig1.deps.cache.load(rig1.project.graphDir)
    const section = readPlanSection(graph.nodes.get('task-1')!.body)
    assert.ok(section !== undefined && section.state === 'pending' && section.version === 1, 'the plan section is not on the task body')
    assert.equal(section.digest, request.digest)
    // A non-main agent cannot answer; a malformed id is invalid; an unknown one is not found.
    const stranger = await refusedOf(() => rig1.answer({ request: request.id, verdict: 'approve' }, rig1.childExec))
    assert.equal(stranger.code, 'forbidden')
    const malformed = await refusedOf(() => rig1.answer({ request: 'no-such-id', verdict: 'approve' }, rig1.mainExec))
    assert.equal(malformed.code, 'invalid')
    const unknown = await refusedOf(() => rig1.answer({ request: 'R-zzzzzz', verdict: 'approve' }, rig1.mainExec))
    assert.equal(unknown.code, 'not_found')
    const delivered = await rig1.answer({ request: request.id, verdict: 'approve' }, rig1.mainExec)
    assert.deepEqual(delivered, { delivered: true })
    assert.deepEqual(await held, { status: 'approved', version: 1 })
    const after = await rig1.deps.cache.load(rig1.project.graphDir)
    const task = after.nodes.get('task-1')!
    const approved = readPlanSection(task.body)
    assert.ok(approved !== undefined && approved.state === 'approved' && approved.version === 1, 'the section was not marked approved')
    const approval = task.history.flatMap(entry => entry.op === 'comment' && entry.actor === 'harness' && typeof entry.text === 'string' ? [parseApprovalComment(entry.text)] : []).at(-1)
    assert.deepEqual(approval, { version: 1, digest: request.digest, childId: rig1.childId, callId: 'call-main' })
    const attempt = registeredAttempt(rig1.childId)
    assert.ok(attempt !== undefined && attempt.plan === 'approved', 'the dispatch did not carry the approval')
    assert.deepEqual(attempt.planPaths, ['site/feed/index.js'])
    assert.equal(oldestPending('plan', rig1.project.graphDir), undefined, 'the answered request is still open')
  })
})

test('the approval re-check refuses a stale dispatch without moving the worker\u2019s call; revise passes the text verbatim', async () => {
  await withRig({ planWaitMs: 4000 }, async (rig1) => {
    const { held, request } = await submitGood(rig1)
    // The intent under the task moved: the pins no longer match. The kind is
    // a dispatch attribute, so the harness may move it — and it is in the
    // pins digest (§3.5.3).
    await editNode(rig1.project, 'task-1', { kind: 'docs' }, 'test: the task moved under the dispatch')
    const stale = await refusedOf(() => rig1.answer({ request: request.id, verdict: 'approve' }, rig1.mainExec))
    assert.equal(stale.code, 'brief_stale')
    assert.ok(oldestPending('plan', rig1.project.graphDir) !== undefined, 'the worker\u2019s call did not stay open')
    const revise = await refusedOf(() => rig1.answer({ request: request.id, verdict: 'revise' }, rig1.mainExec))
    assert.equal(revise.code, 'invalid', 'a revise without text is invalid')
    const delivered = await rig1.answer({ request: request.id, verdict: 'revise', text: 'redo the acceptance mapping' }, rig1.mainExec)
    assert.deepEqual(delivered, { delivered: true })
    assert.deepEqual(await held, { status: 'revise', version: 1, text: 'redo the acceptance mapping' })
    assert.equal(registeredAttempt(rig1.childId)?.plan, 'required', 'a revise marked the dispatch approved')
  })
})

test('a body edited between submit and approve refuses plan_invalid', async () => {
  await withRig({ planWaitMs: 4000 }, async (rig1) => {
    void rig1.submit(GOOD_PLAN, rig1.childExec)
    await settled()
    const request = oldestPending('plan', rig1.project.graphDir, 'task-1')
    assert.ok(request !== undefined)
    await editNode(rig1.project, 'task-1', { body: '## 计划\nsomeone rewrote this' }, 'test: the person touched the body')
    const invalid = await refusedOf(() => rig1.answer({ request: request.id, verdict: 'approve' }, rig1.mainExec))
    assert.equal(invalid.code, 'plan_invalid')
    assert.ok(oldestPending('plan', rig1.project.graphDir) !== undefined, 'the worker\u2019s call did not stay open')
    // Drain the held call: a revise needs no body check.
    await rig1.answer({ request: request.id, verdict: 'revise', text: 'submit again' }, rig1.mainExec)
  })
})

test('a plan nobody answers within the wait times out with the plan-pending hint', async () => {
  await withRig({ planWaitMs: 40 }, async (rig1) => {
    const held = rig1.submit(GOOD_PLAN, rig1.childExec)
    assert.deepEqual(await held, PLAN_TIMEOUT)
    assert.equal(oldestPending('plan', rig1.project.graphDir), undefined)
  })
})

// ---- ask_main ----

test('ask_main: the answer returns inside the same call; the shapes are checked', async () => {
  await withRig({ askWaitMs: 4000 }, async (rig1) => {
    const held = rig1.ask({ question: 'RSS or Atom?', assumption: 'Ship RSS.', options: ['rss', 'atom'] }, rig1.childExec)
    await settled()
    const request = oldestPending('question', rig1.project.graphDir, 'task-1')
    assert.ok(request !== undefined && request.question === 'RSS or Atom?' && request.assumption === 'Ship RSS.')
    const notice = rig1.sent.at(-1)
    assert.ok(notice !== undefined)
    const facts = factsOf(notice)
    assert.equal(facts.event, 'question')
    assert.equal(facts.request, request.id)
    assert.match(notice.content[0].text, /RSS or Atom\?/)
    assert.match(notice.content[0].text, /Ship RSS\./)
    assert.match(notice.content[0].text, /Options the worker sees: rss \| atom/)
    const stranger = await refusedOf(() => rig1.answer({ request: request.id, text: 'atom' }, rig1.childExec))
    assert.equal(stranger.code, 'forbidden')
    const withVerdict = await refusedOf(() => rig1.answer({ request: request.id, verdict: 'approve', text: 'x' }, rig1.mainExec))
    assert.equal(withVerdict.code, 'invalid')
    const delivered = await rig1.answer({ request: request.id, text: 'atom, please' }, rig1.mainExec)
    assert.deepEqual(delivered, { delivered: true })
    assert.deepEqual(await held, { status: 'answered', text: 'atom, please' })
    const noAssumption = await refusedOf(() => rig1.ask({ question: 'One more?' }, rig1.childExec))
    assert.equal(noAssumption.code, 'invalid')
    const multiline = await refusedOf(() => rig1.ask({ question: 'two\nlines', assumption: 'x' }, rig1.childExec))
    assert.equal(multiline.code, 'invalid')
  })
})

test('a question nobody answers within the wait times out into the stated assumption', async () => {
  await withRig({ askWaitMs: 40 }, async (rig1) => {
    const held = rig1.ask({ question: 'And now?', assumption: 'Ship as is.' }, rig1.childExec)
    assert.deepEqual(await held, ASK_TIMEOUT)
    assert.equal(oldestPending('question', rig1.project.graphDir), undefined)
  })
})

// ---- the carried plan's path union on a later dispatch ----

test('a dispatch of a task whose plan was approved carries the section\u2019s path union in the register', async () => {
  await withRig({}, async (rig1) => {
    // The approval of an earlier attempt: the section on the body plus the approval comment (§3.3.4).
    const section = '## 计划\n第 1 版 · 主 Agent 已批 · 摘要 abcabcabcabc\n1. Write the feed builder\n   路径：site/feed/index.js · 验证：L2'
    await editNode(rig1.project, 'task-1', { body: section }, 'test seed: an approved plan')
    const engine = openEngine(rig1.project.graphDir)
    const comment = await engine.apply('harness', { op: 'comment', id: 'task-1', text: renderApprovalComment(1, 'abcabcabcabc', rig1.childId, 'call-0') })
    assert.ok(comment.ok, 'the fixture approval comment failed')
    // The rig's running dispatch would trip the busy gate; this test only
    // needs the project and the tool deps.
    rig1.done()
    const tool = dispatchTool(rig1.dispatchDeps)
    const summary = await tool.execute({ id: 'task-1', model: 'probe-model', why: 'the plan is approved already' }, rig1.mainExec) as { childId: string, plan: string }
    assert.equal(summary.plan, 'approved', 'the dispatch did not read the carried plan')
    const attempt = registeredAttempt(summary.childId)
    assert.ok(attempt !== undefined && attempt.plan === 'approved')
    assert.deepEqual(attempt.planPaths, ['site/feed/index.js'])
    forgetAttempt(summary.childId)
  })
})
