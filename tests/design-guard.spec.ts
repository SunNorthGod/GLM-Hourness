/**
 * The execution-boundary rules of the main agent on the fake rc.3 host
 * (docs/ORCHESTRATION.md §3.1, §6.1; decisions d-main-agent-shell and
 * d-chat-not-cards): no file written by the main agent whatever the tool
 * is called, no question card, and a git command that can lose work only
 * after a snapshot. The rules judge the `tools/pre-execute` calls of the
 * session that is its project's main agent and nobody else's.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { apply } from '../src/design/index.ts'
import { SNAPSHOT_NOTICE_KIND } from '../src/guard/git-snapshot.ts'
import { ASK_RULE, GIT_SNAPSHOT_RULE, NO_WRITE_RULE } from '../src/guard/main-agent-rules.ts'
import type { PreExecuteDecision } from '../src/shared/dsh-min.ts'
import { healthServiceName, type RowHealthView } from '../src/shared/health.ts'
import { designHost, type DesignHost, type FakeAgent } from './design-host.ts'
import { sh } from './git-fixture.ts'
import { captureWarnings } from './graph-helpers.ts'

/** What the GLM dialect row says about ZCode names. */
const DIALECT = { claims: () => true, nativeOf: (name: string) => ({ Write: 'write', Edit: 'edit', Bash: 'pwsh', AskUserQuestion: 'ask_user_question' } as Record<string, string>)[name], faceName: (native: string) => ({ write: 'Write', edit: 'Edit', pwsh: 'Bash', ask_user_question: 'AskUserQuestion' } as Record<string, string>)[native] ?? native }

const tick = (): Promise<void> => new Promise(resolve => { setImmediate(resolve) })
const sleep = (ms: number): Promise<void> => new Promise(resolve => { setTimeout(resolve, ms) })

async function mainAgent(options: Parameters<typeof designHost>[0] = {}): Promise<{ readonly host: DesignHost, readonly agent: FakeAgent }> {
  const host = designHost(options)
  apply(host.ctx)
  const agent = host.addAgent('s1')
  assert.equal((await host.execute(agent, '/wish'))?.result.kind, 'success')
  return { host, agent }
}

function denied(decision: PreExecuteDecision): string {
  assert.equal(decision.kind, 'deny', JSON.stringify(decision))
  return (decision as { reason: string }).reason
}

/** The lines of the violation journal once there are `count` of them (the row writes them without waiting). */
async function journaled(host: DesignHost, count: number): Promise<Array<Record<string, unknown>>> {
  const file = join(host.projectHome, 'audit', 'violations.jsonl')
  for (let attempt = 0; attempt < 200; attempt++) {
    const rows = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(line => line !== '').map(line => JSON.parse(line) as Record<string, unknown>) : []
    if (rows.length >= count) return rows
    await sleep(10)
  }
  assert.fail(`the violation journal never reached ${count} lines`)
}

/** What was put before the agent's next step by the snapshot (the /wish notices are not these). */
const snapshotNotices = (agent: FakeAgent): FakeAgent['sent'] => agent.sent.filter(sent => sent.message.source?.kind === SNAPSHOT_NOTICE_KIND)

const healthOf = (host: DesignHost, agent: FakeAgent): { readonly state: string, readonly reason: string } | undefined => {
  const report = (host.services.get(healthServiceName('design')) as RowHealthView).session(agent.id)
  return report === undefined ? undefined : { state: report.state, reason: report.reason }
}

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

test('an ordinary session, a delegated child and a nested call are not judged', async () => {
  const { host } = await mainAgent()
  const plain = host.addAgent('plain', { workspace: 'other' })
  const sibling = host.addAgent('sibling')
  const child = host.addAgent('child', { origin: 'subagent', parentSession: 's1' })
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

