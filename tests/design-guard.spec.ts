/**
 * The execution-boundary rules of the main agent on the fake rc.3 host
 * (docs/ORCHESTRATION.md §3.1, §6.1; decisions d-main-agent-shell and
 * d-chat-not-cards): no file written by the main agent whatever the tool
 * is called, no question card, and a git command that can lose work only
 * after a snapshot. The rules judge the `tools/pre-execute` calls of the
 * session that is its project's main agent and nobody else's.
 */
import assert from 'node:assert/strict'
import { existsSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { apply } from '../src/design/index.ts'
import { SNAPSHOT_NOTICE_KIND } from '../src/guard/git-snapshot.ts'
import { openEngine } from '../src/graph/engine.ts'
import type { Actor } from '../src/graph/schema.ts'
import { loadGraph } from '../src/graph/store.ts'
import { releaseVerdict } from '../src/guard/design-release.ts'
import { ASK_RULE, DESIGN_RELEASE_RULE, GIT_SNAPSHOT_RULE, NO_WRITE_RULE } from '../src/guard/main-agent-rules.ts'
import type { PreExecuteDecision } from '../src/shared/dsh-min.ts'
import { denied, designHost, healthOf, journaled, type DesignHost, type FakeAgent } from './design-host.ts'
import { sh } from './git-fixture.ts'
import { captureWarnings } from './graph-helpers.ts'
import { graphOf, node } from './graph-memory.ts'

/** What the GLM dialect row says about ZCode names. */
const DIALECT = { claims: () => true, nativeOf: (name: string) => ({ Write: 'write', Edit: 'edit', Bash: 'pwsh', AskUserQuestion: 'ask_user_question' } as Record<string, string>)[name], faceName: (native: string) => ({ write: 'Write', edit: 'Edit', pwsh: 'Bash', ask_user_question: 'AskUserQuestion' } as Record<string, string>)[native] ?? native }

const tick = (): Promise<void> => new Promise(resolve => { setImmediate(resolve) })

async function mainAgent(options: Parameters<typeof designHost>[0] = {}): Promise<{ readonly host: DesignHost, readonly agent: FakeAgent }> {
  const host = designHost(options)
  apply(host.ctx)
  const agent = host.addAgent('s1')
  assert.equal((await host.execute(agent, '/wish'))?.result.kind, 'success')
  return { host, agent }
}

/** What was put before the agent's next step by the snapshot (the /wish notices are not these). */
const snapshotNotices = (agent: FakeAgent): FakeAgent['sent'] => agent.sent.filter(sent => sent.message.source?.kind === SNAPSHOT_NOTICE_KIND)

const FILE_TOOLS: ReadonlyArray<readonly [string, unknown]> = [
  ['write', { file_path: 'a.txt', content: 'x' }],
  ['Write', { file_path: 'a.txt', content: 'x' }],
  ['edit', { file_path: 'a.txt', old_string: 'a', new_string: 'b' }],
  ['Edit', { file_path: 'a.txt', old_string: 'a', new_string: 'b' }],
  ['str_replace_editor', { command: 'create', path: 'a.txt', file_text: 'x' }],
  ['str_replace_editor', { command: 'str_replace', path: 'a.txt', old_str: 'a', new_str: 'b' }],
  ['str_replace_editor', { command: 'insert', path: 'a.txt', insert_line: 1, new_str: 'b' }],
]

// ---------------------------------------------------------------- main-agent-no-write

test('the main agent\'s file tools are denied by name, with and without the dialect service', async () => {
  for (const dialect of [undefined, DIALECT]) {
    const { host, agent } = await mainAgent(dialect === undefined ? {} : { dialect })
    for (const [name, args] of FILE_TOOLS) {
      const reason = denied(await host.preExecute(agent, name, args))
      assert.match(reason, /^You tried to write "a\.txt"\./, name)
      assert.ok(reason.includes('Boundary: You are the main agent of this session (/wish)'), name)
      assert.ok(reason.includes('Right path: Record designs and decisions on the project graph with the graph tools.'), name)
      assert.ok(reason.includes('Exception: If the human wants this session to edit files directly, they leave main-agent mode with /wish off.'), name)
    }
    assert.equal((await host.preExecute(agent, 'str_replace_editor', { command: 'view', path: 'a.txt' })).kind, 'allow')
  }
})

test('a file tool that carries no path is still a write', async () => {
  const { host, agent } = await mainAgent()
  assert.match(denied(await host.preExecute(agent, 'write', {})), /^You called write, which writes files\./)
  assert.match(denied(await host.preExecute(agent, 'str_replace_editor', { command: 'create' })), /^You called str_replace_editor, which writes files\./)
})

test('the main agent\'s shell may not write files, and its git and its tests are not writes', async () => {
  for (const dialect of [undefined, DIALECT]) {
    const { host, agent } = await mainAgent(dialect === undefined ? {} : { dialect })
    for (const [name, command] of [['pwsh', 'Set-Content a.txt x'], ['Bash', 'Out-File -FilePath a.txt'], ['bash', 'echo x > a.txt'], ['bash', 'cat <<EOF | tee a.txt'], ['pwsh', 'sed -i s/a/b/ a.txt']] as const) {
      const reason = denied(await host.preExecute(agent, name, { command }))
      assert.match(reason, /^You tried to change files through the shell: /, command)
      assert.ok(reason.includes('Boundary: You are the main agent'), command)
    }
    for (const command of ['git commit -m x', 'git status', 'git log --oneline', 'npm test', 'ls', 'cat README.md', 'echo "a > b"']) {
      assert.equal((await host.preExecute(agent, 'Bash', { command })).kind, 'allow', command)
    }
    assert.deepEqual(snapshotNotices(agent), [])
  }
})

test('reading, the graph tools and delegation are not writes', async () => {
  const { host, agent } = await mainAgent()
  for (const name of ['read', 'Read', 'glob', 'grep', 'graph_show', 'graph_propose', 'subagent', 'todo_write', 'web_fetch']) {
    assert.equal((await host.preExecute(agent, name, {})).kind, 'allow', name)
  }
})

test('an ordinary session, a session of another project and a nested call are not judged by the main agent rules; the subagents of a main agent are judged by design-before-release below', async () => {
  const { host } = await mainAgent()
  const plain = host.addAgent('plain', { workspace: 'other' })
  const sibling = host.addAgent('sibling')
  const child = host.addAgent('child', { origin: 'subagent', parentSession: 'plain' })
  const main = host.agents.get('s1')!
  for (const agent of [plain, sibling, child]) {
    assert.equal((await host.preExecute(agent, 'Write', { file_path: 'a.txt', content: 'x' })).kind, 'allow', agent.id)
    assert.equal((await host.preExecute(agent, 'ask_user_question', {})).kind, 'allow', agent.id)
    assert.equal((await host.preExecute(agent, 'Bash', { command: 'echo x > a.txt' })).kind, 'allow', agent.id)
  }
  assert.equal((await host.preExecute(main, 'Write', { file_path: 'a.txt', content: 'x' }, {})).kind, 'allow', 'a transport call with a parent token passes')
})

test('after /wish off the session writes again, and while /wish is still settling it is already the main agent', async () => {
  const { host, agent } = await mainAgent()
  denied(await host.preExecute(agent, 'Write', { file_path: 'a.txt', content: 'x' }))
  assert.equal((await host.execute(agent, '/wish off'))?.result.kind, 'success')
  assert.equal((await host.preExecute(agent, 'Write', { file_path: 'a.txt', content: 'x' })).kind, 'allow')
  assert.equal((await host.preExecute(agent, 'ask_user_question', {})).kind, 'allow')

  // The handler of /wish has returned, command/done has not yet been written.
  let release: () => void = () => undefined
  const held = new Promise<void>((resolve) => { release = resolve })
  const typing = host.execute(agent, '/wish', held)
  await tick()
  await tick()
  denied(await host.preExecute(agent, 'Write', { file_path: 'a.txt', content: 'x' }))
  release()
  await typing
  denied(await host.preExecute(agent, 'Write', { file_path: 'a.txt', content: 'x' }))
})

test('a denial is written to the violation journal in the guard\'s record shape, with the call\'s name and origin', async () => {
  const { host, agent } = await mainAgent({ dialect: DIALECT })
  denied(await host.preExecute(agent, 'Write', { file_path: 'a.txt', content: 'x' }))
  denied(await host.preExecute(agent, 'AskUserQuestion', {}))
  // The two lines are written without waiting for each other, so their order in the file is not the order of the calls.
  const lines = await journaled(host, 2)
  const write = lines.find(line => line.rule === NO_WRITE_RULE)
  const ask = lines.find(line => line.rule === ASK_RULE)
  assert.equal(write?.rule, NO_WRITE_RULE)
  assert.equal(write?.tool, 'Write')
  assert.equal(write?.agentId, 's1')
  assert.equal(write?.sessionId, 's1')
  assert.equal(write?.scope, 'dialect')
  assert.match(String(write?.correction), /^You tried to write "a\.txt"\./)
  assert.equal(ask?.rule, ASK_RULE)
  assert.equal(ask?.tool, 'AskUserQuestion')
})

test('the rules fail open when the main agent state cannot be read, and the row health says so', async () => {
  const { host, agent } = await mainAgent()
  denied(await host.preExecute(agent, 'Write', { file_path: 'a.txt', content: 'x' }))
  host.projections.stateOf = () => { throw new Error('projection down') }
  const { warnings } = await captureWarnings(async () => {
    assert.equal((await host.preExecute(agent, 'Write', { file_path: 'a.txt', content: 'x' })).kind, 'allow')
  })
  assert.ok(warnings.length >= 0)
  assert.equal(healthOf(host, agent)?.state, 'degraded')

  // The record of who holds the role throws: the listener itself catches it.
  const other = await mainAgent()
  other.host.services.set('glmHournessGraph', { dirFor: () => { throw new Error('graph row broke') }, isGraphTool: () => false })
  const caught = await captureWarnings(async () => (await other.host.preExecute(other.agent, 'Write', { file_path: 'a.txt', content: 'x' })).kind)
  assert.equal(caught.result, 'allow')
  assert.equal(healthOf(other.host, other.agent)?.state, 'degraded')
})

// ---------------------------------------------------------------- main-agent-ask

test('asking through a card is denied by name; the tool is the same for everyone else', async () => {
  const { host, agent } = await mainAgent({ dialect: DIALECT })
  const reason = denied(await host.preExecute(agent, 'AskUserQuestion', { questions: [] }))
  assert.equal(reason, [
    'You called AskUserQuestion.',
    'Boundary: As the main agent you talk with the human in plain chat, without option cards.',
    'Right path: Ask in your reply in plain words, or put a plan to them with propose_to_human.',
    'Exception: none',
  ].join('\n'))
  const plain = await mainAgent()
  assert.match(denied(await plain.host.preExecute(plain.agent, 'ask_user_question', {})), /^You called ask_user_question\./)
  assert.equal((await plain.host.preExecute(plain.host.addAgent('other', { workspace: 'else' }), 'ask_user_question', {})).kind, 'allow')
})

// ---------------------------------------------------------------- git-snapshot through the rules

/** A main agent whose workspace is a repository with `a.txt` committed. */
async function inRepository(): Promise<{ readonly host: DesignHost, readonly agent: FakeAgent, readonly dir: string }> {
  const host = designHost()
  apply(host.ctx)
  const dir = host.workspace('ws')
  sh(dir, 'init', '--quiet', '-b', 'main')
  const agent = host.addAgent('s1')
  await host.execute(agent, '/wish')
  return { host, agent, dir }
}

test('a git command that can lose work is allowed after a snapshot, and the main agent is told how to get the work back', async () => {
  const { host, agent, dir } = await inRepository()
  const write = (text: string): void => { writeFileSync(join(dir, 'a.txt'), text) }
  write('one\n')
  sh(dir, 'add', 'a.txt')
  sh(dir, 'commit', '--quiet', '-m', 'first')
  assert.equal((await host.preExecute(agent, 'Bash', { command: 'git status' })).kind, 'allow')
  assert.deepEqual(snapshotNotices(agent), [])
  write('precious\n')
  assert.equal((await host.preExecute(agent, 'Bash', { command: 'git checkout -- a.txt' })).kind, 'allow')
  const notices = snapshotNotices(agent)
  assert.equal(notices.length, 1)
  assert.equal(notices[0]?.via, 'inject')
  const text = notices[0]?.message.content[0]?.text ?? ''
  assert.match(text, /^\[git 快照\] 执行「git checkout -- a\.txt」之前存了快照 /)
  assert.match(text, /git stash apply [0-9a-f]{40}/)
  assert.equal(existsSync(join(dir, '.llm', 'snapshots.jsonl')), true)
})

test('a git command that cannot be saved first is denied, and so is one that would send the snapshots away', async () => {
  const { host, agent, dir } = await inRepository()
  writeFileSync(join(dir, 'a.txt'), 'one\n')
  sh(dir, 'add', 'a.txt')
  sh(dir, 'commit', '--quiet', '-m', 'first')
  const reason = denied(await host.preExecute(agent, 'Bash', { command: 'git clean -fdx' }))
  assert.equal(reason.split('\n')[0], '"git clean -fdx" would delete ignored files the snapshot does not keep.')
  assert.ok(reason.includes('Right path: Run git clean without -x or -X; ignored files stay.'))
  // The shell reader finds git where a search of the raw text would not.
  denied(await host.preExecute(agent, 'Bash', { command: '"g"it clean -fdx' }))
  denied(await host.preExecute(agent, 'Bash', { command: 'git push --mirror' }))
  denied(await host.preExecute(agent, 'Bash', { command: 'cd $WHERE; git reset --hard' }))
  const lines = await journaled(host, 4)
  assert.deepEqual(lines.map(line => line.rule), [GIT_SNAPSHOT_RULE, GIT_SNAPSHOT_RULE, GIT_SNAPSHOT_RULE, GIT_SNAPSHOT_RULE])
  // Not the main agent: nothing is judged.
  const plain = host.addAgent('plain')
  assert.equal((await host.preExecute(plain, 'Bash', { command: 'git clean -fdx' })).kind, 'allow')
})

test('a write in a shell line is denied before git is looked at', async () => {
  const { host, agent } = await inRepository()
  const reason = denied(await host.preExecute(agent, 'Bash', { command: 'git checkout -- a.txt && echo x > b.txt' }))
  assert.match(reason, /^You tried to change files through the shell: /)
  assert.deepEqual(snapshotNotices(agent), [])
})

// ---------------------------------------------------------------- design-before-release

const DIALECT_WRITE = { Write: { file_path: 'x.txt', content: 'x' } }

interface World {
  readonly host: DesignHost
  readonly main: FakeAgent
  readonly child: FakeAgent
  readonly grandchild: FakeAgent
  readonly graphDir: string
  /** Write to the graph as `actor`; the revision is read first. */
  readonly act: (actor: Actor, mutation: Record<string, unknown>) => Promise<void>
  /** Move a node's stage as the human. */
  readonly stage: (id: string, stage: string) => Promise<void>
  /** The agent's `Write`, judged. */
  readonly write: (agent: FakeAgent) => Promise<PreExecuteDecision>
}

/** A main agent s1 whose workspace has an empty graph, a subagent of it and a subagent of that. */
async function world(options: Parameters<typeof designHost>[0] = {}): Promise<World> {
  const { host, agent } = await mainAgent(options)
  const graphDir = join(host.workspace('ws'), 'docs', 'graph')
  const child = host.addAgent('child', { origin: 'subagent', parentSession: 's1' })
  const grandchild = host.addAgent('grandchild', { origin: 'subagent', parentSession: 'child' })
  const act: World['act'] = async (actor, mutation) => {
    const id = mutation.id as string | undefined
    const rev = id === undefined ? undefined : (await loadGraph(graphDir)).revisions.get(id)
    const result = await openEngine(graphDir).apply(actor, { ...mutation, ...rev === undefined ? {} : { rev }, reason: 'test' })
    assert.ok(result.ok, JSON.stringify(result))
  }
  return {
    host, main: agent, child, grandchild, graphDir, act,
    stage: (id, stage) => act('human', { op: 'edit', id, set: { stage } }),
    write: agent => host.preExecute(agent, 'Write', DIALECT_WRITE.Write),
  }
}

const propose = (nodes: readonly Record<string, unknown>[]) => async (w: World, actor: Actor = 'human'): Promise<void> => {
  for (const node of nodes) await w.act(actor, { op: 'propose', node })
}

test('design-before-release: with no goal in focus, nothing the main agent plans is released, and the subagent\'s write is denied', async () => {
  const w = await world()
  const reason = denied(await w.write(w.child))
  assert.match(reason, /^You tried to write "x\.txt"\./)
  assert.ok(reason.includes('Boundary: You were dispatched (directly or through other subagents) by the main agent, and it has no open goal in focus, so nothing it plans is released yet.'), reason)
  assert.ok(reason.includes('Right path: Read, search and report back; do not hand the write to another subagent, the same rule covers every agent the main agent\'s dispatch chain reaches. The main agent puts the design to the human with propose_to_human; once what it works on (the goal, or its module) is released, the work can be dispatched again. If the main agent has no goal in focus, it focuses the goal or task this work belongs to first.'), reason)
  assert.ok(reason.endsWith('Exception: If a write is needed to answer a design question (a spike), report back and let the main agent put the question to the human.'), reason)
  // A focus that is not in the graph is the same state.
  w.host.focuses.set('s1', 'goal-9')
  assert.ok(denied(await w.write(w.child)).includes('no open goal in focus'))
})

test('releaseVerdict: a focus with no goal above it (a graph the engine would not have written) and a closed goal are the state with no open goal', () => {
  const orphan = graphOf([node({ id: 'task-9', type: 'task' }), node({ id: 'goal-1', type: 'goal', status: 'done', stage: 'release' }, 0, 'human'), node({ id: 'task-1', type: 'task', parent: 'goal-1' })])
  for (const focus of [undefined, 'missing-1', 'task-9', 'goal-1', 'task-1']) {
    const verdict = releaseVerdict(orphan, focus)
    assert.equal(verdict.kind, 'deny', String(focus))
    assert.match((verdict as { violation: string }).violation, /it has no open goal in focus/, String(focus))
  }
})

test('design-before-release: the goal in wish, interview or design denies, whatever stage a proposed goal names; release and later allow; a goal without a stage allows', async () => {
  const w = await world()
  await propose([{ type: 'goal', title: '记账' }])(w, 'llm')
  w.host.focuses.set('s1', 'goal-1')
  assert.match(denied(await w.write(w.child)), /of a design loop at stage wish \(goal goal-1\): nothing is built before the human releases the design\./)
  await w.act('llm', { op: 'edit', id: 'goal-1', set: { stage: 'design' } })
  const lying = denied(await w.write(w.child))
  assert.match(lying, /at stage interview \(goal goal-1\)/, 'a goal the human did not approve is in the interview, whatever stage it names')
  await w.act('human', { op: 'approve', id: 'goal-1' })
  assert.match(denied(await w.write(w.child)), /at stage design \(goal goal-1\)/)
  await w.stage('goal-1', 'interview')
  assert.match(denied(await w.write(w.child)), /at stage interview \(goal goal-1\)/)
  for (const stage of ['release', 'decompose', 'execute', 'merge', 'operate']) {
    await w.stage('goal-1', stage)
    assert.equal((await w.write(w.child)).kind, 'allow', stage)
  }
  await propose([{ type: 'goal', title: '不走设计循环' }])(w)
  w.host.focuses.set('s1', 'goal-2')
  assert.equal((await w.write(w.child)).kind, 'allow', 'an approved goal that names no stage')
})

test('design-before-release: a closed goal denies; the focus on a task below the goal is judged by the goal', async () => {
  const w = await world()
  await propose([{ type: 'goal', title: '记账', stage: 'release' }, { type: 'task', title: '写', id: 'task-1', parent: 'goal-1' }])(w)
  w.host.focuses.set('s1', 'task-1')
  assert.equal((await w.write(w.child)).kind, 'allow')
  await w.stage('goal-1', 'design')
  assert.match(denied(await w.write(w.child)), /at stage design \(goal goal-1\)/)
  await w.stage('goal-1', 'release')
  await w.act('human', { op: 'status', id: 'task-1', to: 'dropped' })
  await w.act('human', { op: 'status', id: 'goal-1', to: 'dropped' })
  assert.ok(denied(await w.write(w.child)).includes('no open goal in focus'), 'a dropped goal has nothing released')
})

test('design-before-release: a grandchild is judged like a child, whatever the depth setting; the main agent\'s own writes are still the no-write rule', async () => {
  const w = await world()
  await propose([{ type: 'goal', title: '记账', stage: 'design' }])(w)
  w.host.focuses.set('s1', 'goal-1')
  denied(await w.write(w.grandchild))
  denied(await w.write(w.child))
  assert.match(denied(await w.write(w.main)), /^You tried to write "x\.txt"\.\nBoundary: You are the main agent of this session/)
  await w.stage('goal-1', 'release')
  assert.equal((await w.write(w.grandchild)).kind, 'allow')
  assert.equal((await w.write(w.child)).kind, 'allow')
  denied(await w.write(w.main))
})

test('design-before-release: shell writes and file tools by any name are writes; reading, git and the graph tools are not', async () => {
  const w = await world({ dialect: DIALECT })
  await propose([{ type: 'goal', title: '记账', stage: 'design' }])(w)
  w.host.focuses.set('s1', 'goal-1')
  for (const [name, args] of FILE_TOOLS) denied(await w.host.preExecute(w.child, name, args))
  for (const command of ['Set-Content a.txt x', 'echo x > a.txt', 'sed -i s/a/b/ a.txt']) {
    const reason = denied(await w.host.preExecute(w.grandchild, 'Bash', { command }))
    assert.match(reason, /^You tried to change files through the shell: /, command)
    assert.ok(reason.includes('Boundary: You were dispatched'), command)
  }
  for (const [name, args] of [['Read', { file_path: 'a.txt' }], ['str_replace_editor', { command: 'view', path: 'a.txt' }], ['Bash', { command: 'git commit -m x' }], ['Bash', { command: 'ls' }], ['graph_show', { id: 'goal-1' }], ['subagent', {}]] as const) {
    assert.equal((await w.host.preExecute(w.child, name, args)).kind, 'allow', name)
  }
})

test('design-before-release: only a main agent roots a judged chain; a nested call, a fork and a chain under an ordinary session are not judged', async () => {
  const w = await world()
  await propose([{ type: 'goal', title: '记账', stage: 'design' }])(w)
  w.host.focuses.set('s1', 'goal-1')
  denied(await w.write(w.child))
  assert.equal((await w.host.preExecute(w.child, 'Write', DIALECT_WRITE.Write, {})).kind, 'allow', 'a transport call with a parent token passes')
  const plain = w.host.addAgent('plain', { workspace: 'other' })
  const underPlain = w.host.addAgent('under-plain', { workspace: 'other', origin: 'subagent', parentSession: 'plain' })
  w.host.focuses.set('plain', 'goal-1')
  assert.equal((await w.write(underPlain)).kind, 'allow')
  assert.equal((await w.write(plain)).kind, 'allow')
  await w.host.execute(w.main, '/wish off')
  assert.equal((await w.write(w.child)).kind, 'allow', 'after /wish off the session is no main agent and its subagents write')
})

test('design-before-release: the violation journal has the rule, the subagent and the name the call used', async () => {
  const w = await world({ dialect: DIALECT })
  await propose([{ type: 'goal', title: '记账', stage: 'design' }])(w)
  w.host.focuses.set('s1', 'goal-1')
  denied(await w.write(w.child))
  const [line] = await journaled(w.host, 1)
  assert.deepEqual([line?.rule, line?.tool, line?.agentId, line?.sessionId, line?.scope], [DESIGN_RELEASE_RULE, 'Write', 'child', 'child', 'dialect'])
  assert.match(String(line?.correction), /Boundary: You were dispatched .* at stage design \(goal goal-1\)/)
})

test('design-before-release: what it cannot judge it lets through and says why, in the health of the subagent and of the main agent', async () => {
  const unjudged = async (w: World, caller: FakeAgent, why: RegExp): Promise<void> => {
    const { result } = await captureWarnings(() => w.write(caller))
    assert.equal(result.kind, 'allow')
    for (const agent of [caller, w.main]) {
      const health = healthOf(w.host, agent)
      if (agent === w.main && !why.test(health?.reason ?? '')) continue
      assert.equal(health?.state, 'degraded', agent.id)
      assert.match(health?.reason ?? '', /派出去的 agent 的写入没有按放行状态判/)
      assert.match(health?.reason ?? '', why)
    }
  }
  // The graph row is gone.
  const noGraph = await world()
  noGraph.host.services.delete('glmHournessGraph')
  await unjudged(noGraph, noGraph.child, /the graph row does not say where the project graph is/)
  // The agents registry is gone.
  const noAgents = await world()
  noAgents.host.services.delete('agents')
  await unjudged(noAgents, noAgents.child, /the agents service is not there/)
  // The chain loses its link: no parentSession, a parent that is not live, a loop.
  const broken = await world()
  const orphan = broken.host.addAgent('orphan', { origin: 'subagent' })
  await unjudged(broken, orphan, /has no parentSession/)
  const gone = broken.host.addAgent('gone', { origin: 'subagent', parentSession: 'nobody' })
  await unjudged(broken, gone, /nobody on the dispatch chain is not a live agent/)
  const a = broken.host.addAgent('loop-a', { origin: 'subagent', parentSession: 'loop-b' })
  broken.host.addAgent('loop-b', { origin: 'subagent', parentSession: 'loop-a' })
  await unjudged(broken, a, /the dispatch chain loops back to loop-a/)
  // The graph cannot be read: its nodes directory is a file.
  const unreadable = await world()
  await mkdir(join(unreadable.graphDir), { recursive: true })
  writeFileSync(join(unreadable.graphDir, 'nodes'), 'not a directory')
  unreadable.host.focuses.set('s1', 'goal-1')
  await unjudged(unreadable, unreadable.child, /ENOTDIR|ENOENT|EEXIST|not a directory/)
})

test('design-before-release: a read of the main agent\'s role that throws lets the call through and the health says so', async () => {
  const w = await world()
  await propose([{ type: 'goal', title: '记账', stage: 'design' }])(w)
  w.host.focuses.set('s1', 'goal-1')
  denied(await w.write(w.child))
  w.host.projections.stateOf = () => { throw new Error('projection down') }
  const { result } = await captureWarnings(() => w.write(w.child))
  assert.equal(result.kind, 'allow')
  assert.equal(healthOf(w.host, w.main)?.state, 'degraded')
  assert.match(healthOf(w.host, w.main)?.reason ?? '', /projection down/)
})

// ---------------------------------------------------------------- design-before-release, by module

/**
 * goal-1 at release, split into module-a (released), module-b (design) and a candidate;
 * tasks below each, and a task directly under the goal.
 */
async function splitWorld(): Promise<World> {
  const w = await world()
  await propose([
    { type: 'goal', title: '记账', stage: 'release' },
    { type: 'feature', id: 'module-a', title: '模块甲', parent: 'goal-1', stage: 'release' },
    { type: 'feature', id: 'module-b', title: '模块乙', parent: 'goal-1', stage: 'design' },
    { type: 'task', id: 'task-a', title: '甲的活', parent: 'module-a' },
    { type: 'task', id: 'task-b', title: '乙的活', parent: 'module-b' },
    { type: 'task', id: 'task-loose', title: '目标下的活', parent: 'goal-1' },
  ])(w)
  await propose([{ type: 'feature', id: 'candidate-c', title: '候选丙', parent: 'goal-1', stage: 'design' }])(w, 'llm')
  await propose([{ type: 'task', id: 'task-c', title: '丙的活', parent: 'candidate-c' }])(w, 'llm')
  return w
}

test('design-before-release by module: a released module\'s work is allowed, an unreleased module\'s and a candidate\'s is denied with the module named', async () => {
  const w = await splitWorld()
  const judged = async (focus: string): Promise<PreExecuteDecision> => {
    w.host.focuses.set('s1', focus)
    return w.write(w.child)
  }
  assert.equal((await judged('module-a')).kind, 'allow')
  assert.equal((await judged('task-a')).kind, 'allow')
  for (const [focus, id, title] of [['module-b', 'module-b', '模块乙'], ['task-b', 'module-b', '模块乙'], ['candidate-c', 'candidate-c', '候选丙'], ['task-c', 'candidate-c', '候选丙']] as const) {
    const reason = denied(await judged(focus))
    assert.ok(reason.includes(`Boundary: You were dispatched (directly or through other subagents) by the main agent, whose focus is in module ${id} (${title}) of goal goal-1, and the human has not released that module yet: nothing in a module is built before its release.`), `${focus}: ${reason}`)
    assert.ok(reason.includes(`The main agent puts the module to the human with propose_to_human (kind release, module ${id}); once the module is released, the work can be dispatched again.`), `${focus}: ${reason}`)
    assert.ok(reason.includes('Right path: Read, search and report back;'))
  }
})

test('design-before-release by module: the focus at the goal level, or on a node in no module, is allowed once the goal is released (the known remainder)', async () => {
  const w = await splitWorld()
  for (const focus of ['goal-1', 'task-loose']) {
    w.host.focuses.set('s1', focus)
    assert.equal((await w.write(w.child)).kind, 'allow', focus)
  }
})

test('design-before-release by module: the goal back in design (the framework is being changed) denies under the whole goal, a released module included', async () => {
  const w = await splitWorld()
  await w.stage('goal-1', 'design')
  for (const focus of ['module-a', 'task-a', 'module-b', 'goal-1']) {
    w.host.focuses.set('s1', focus)
    assert.match(denied(await w.write(w.child)), /at stage design \(goal goal-1\)/, focus)
  }
})

test('design-before-release by module: a module sent back to design is denied again, and released again it is allowed', async () => {
  const w = await splitWorld()
  w.host.focuses.set('s1', 'task-a')
  assert.equal((await w.write(w.child)).kind, 'allow')
  await w.stage('module-a', 'design')
  assert.ok(denied(await w.write(w.child)).includes('module module-a (模块甲)'))
  await w.stage('module-a', 'release')
  assert.equal((await w.write(w.grandchild)).kind, 'allow')
})

test('design-before-release by module: a module done at release still lets rework below it be written', async () => {
  const w = await splitWorld()
  w.host.focuses.set('s1', 'task-a')
  await w.act('human', { op: 'status', id: 'module-a', to: 'doing' })
  assert.equal((await w.write(w.child)).kind, 'allow')
  await w.act('human', { op: 'status', id: 'task-a', to: 'done', evidence: [{ kind: 'commit', ref: 'e1c4c15' }] })
  await w.act('human', { op: 'status', id: 'module-a', to: 'done', evidence: [{ kind: 'commit', ref: 'e1c4c15' }] })
  assert.equal((await w.write(w.child)).kind, 'allow')
})