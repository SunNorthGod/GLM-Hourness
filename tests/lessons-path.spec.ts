/**
 * The reminder at a file on the fake rc.3 host (src/lessons/path.ts;
 * docs-at-hand design 0.3 §5): what a successful read, write or edit carries
 * — the lessons for the path, the component's decisions and open work from
 * the graph, the component's AGENTS.md when the host does not deliver it — and
 * what it leaves alone: failed calls, nested calls, other tools, what the
 * session was told. The project is a real temporary directory with a `.git`
 * entry; the lessons journal and the graph are real files.
 */
import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { FAILURE_SOURCE, PATH_SOURCE } from '../src/lessons/failure.ts'
import type { AgentLike, ToolExecuteInput, ToolFinalResult, UserNotice } from '../src/shared/dsh-min.ts'
import { agentOf } from './memory-helpers.ts'
import { seedAsHuman } from './graph-helpers.ts'
import { fakeTool as tool, rowHealth, withRow, WORK, type Row, type RowOptions } from './lessons-row-host.ts'

const COMPONENT_DOC = [
  '# Loops',
  'The loop board of a project.',
  '## Constraints',
  '- Entries are data, not code.',
  '## Decisions',
  '- decision-1',
  '- decision-9: an id the graph does not have',
  '## Flow',
  '```mermaid',
  'flowchart LR',
  '```',
].join('\n')

/** The project the host's session works in: a `.git` entry, a component with its document, a file outside any component. */
function makeProject(options: { readonly doc?: string } = {}): void {
  rmSync(WORK, { recursive: true, force: true })
  mkdirSync(join(WORK, '.git'), { recursive: true })
  mkdirSync(join(WORK, 'src', 'loops', 'inner'), { recursive: true })
  mkdirSync(join(WORK, 'src', 'plain'), { recursive: true })
  writeFileSync(join(WORK, 'AGENTS.md'), 'The root rules.\n')
  writeFileSync(join(WORK, 'src', 'loops', 'AGENTS.md'), options.doc ?? COMPONENT_DOC)
  writeFileSync(join(WORK, 'src', 'loops', 'run.ts'), '// run\n')
  writeFileSync(join(WORK, 'src', 'loops', 'inner', 'deep.ts'), '// deep\n')
  writeFileSync(join(WORK, 'src', 'plain', 'a.ts'), '// a\n')
}

/** A graph in the project with one goal, a decision and a task under the component that has the decision as its source. */
async function seedGraph(row: Row): Promise<string> {
  const dir = join(WORK, 'docs', 'graph')
  await seedAsHuman(dir, [
    { type: 'goal', title: 'A goal' },
    { type: 'decision', title: 'Entries are data', parent: 'goal-1' },
    { type: 'decision', title: 'The task decision', parent: 'goal-1' },
    { type: 'task', title: 'Write the runner', parent: 'goal-1', kind: 'implement', writeScope: ['src/loops/'], edges: [{ type: 'source', to: 'decision-2' }] },
    { type: 'task', title: 'Something else', parent: 'goal-1', kind: 'implement', writeScope: ['src/other/'] },
  ])
  row.runtime.services.set('glmHournessGraph', { dirFor: () => dir, isGraphTool: () => false })
  return dir
}

const LESSON = {
  action: 'new',
  reason: 'seed for the spec',
  situation: { files: ['src/loops/**'] },
  pitfall: 'The loop runner reads the inbox twice when two beats overlap, told in a sentence of its own.',
  fix: 'Chain the beats.',
  evidence: ['docs/DEVELOPMENT.md §3'],
}

let counter = 0
async function call(row: Row, agent: AgentLike | undefined, name: string, file: string | undefined, extra: Partial<ToolExecuteInput> = {}): Promise<ToolFinalResult> {
  return await row.runtime.ctx.tools.execute({ callId: `call-${++counter}`, name, arguments: file === undefined ? {} : { file_path: file }, signal: new AbortController().signal, ...(agent === undefined ? {} : { agent }), ...extra })
}

const noticeOf = (result: ToolFinalResult): UserNotice => {
  assert.equal(result.additionalContexts?.length, 1, 'one reminder')
  const [notice] = result.additionalContexts as UserNotice[]
  assert.equal(notice?.source.kind, PATH_SOURCE)
  return notice
}
const textOf = (notice: UserNotice): string => notice.content[0].text
const noneOf = (result: ToolFinalResult): void => { assert.equal(result.additionalContexts, undefined) }
const HOST_BASELINE = { role: 'user', content: [{ type: 'text', text: 'Instructions from: AGENTS.md' }], source: { kind: 'agent-instructions', form: 'notice' } }

const inRow = (body: (row: Row) => Promise<void>, options: RowOptions = {}): Promise<void> => withRow(async (row) => {
  makeProject()
  try {
    for (const name of ['read', 'write', 'edit', 'Read', 'Write', 'pwsh']) tool(row, name)
    await body(row)
  }
  finally {
    rmSync(WORK, { recursive: true, force: true })
  }
}, { natives: ['read', 'write', 'edit', 'pwsh'], ...options })

const SESSION_AGENT = (row: Row): AgentLike => row.runtime.agent

/** A row whose project has the graph and the lesson of the spec. */
const inSeededRow = (body: (row: Row) => Promise<void>): Promise<void> => inRow(async (row) => {
  await seedGraph(row)
  await row.tool('lessons_merge', LESSON)
  await body(row)
})

test('a successful read of a file in a component carries the document, the decisions with what the graph says now, the open work and the lessons, in one reminder', async () => {
  await inSeededRow(async (row) => {
    const result = await call(row, SESSION_AGENT(row), 'Read', 'src/loops/run.ts')
    const text = textOf(noticeOf(result))
    assert.match(text, /^<system-reminder>\nDocs and lessons at hand for src\/loops\/run\.ts \(component src\/loops\):\nsrc\/loops\/AGENTS\.md:\n# Loops\n/)
    assert.match(text, /\n- decision-9: an id the graph does not have\n/, 'the whole document, its flow section too, for a call the host does not deliver')
    assert.match(text, /\nDecisions on this path \(project graph\): decision-1 "Entries are data" \(\w+\); decision-9 \(not in the graph\); decision-2 "The task decision" \(\w+\)\n/)
    assert.match(text, /\nOpen work on this path: task-1 "Write the runner" \(\w+\)\n/)
    assert.match(text, /\nLessons for this path \(advice, not rules\): L-\w+: when files src\/loops\/\*\* → /)
    assert.doesNotMatch(text, /Keep the component doc true/, 'a read changes nothing')
    assert.equal(result.isError, false)
    assert.deepEqual(result.content, [{ type: 'text', text: 'output' }], 'the call itself is as it was')
  })
})

test('what the session was told is not told again: not in a second call, not when the history says so; a write adds the keep-true sentence once, and a changed document is sent again', async () => {
  await inSeededRow(async (row) => {
    const agent = SESSION_AGENT(row)
    const first = noticeOf(await call(row, agent, 'Read', 'src/loops/run.ts'))
    noneOf(await call(row, agent, 'Read', 'src/loops/run.ts'))
    noneOf(await call(row, agent, 'Read', 'src/loops/inner/deep.ts'))
    const write = textOf(noticeOf(await call(row, agent, 'Write', 'src/loops/run.ts')))
    assert.equal(write, '<system-reminder>\nDocs and lessons at hand for src/loops/run.ts (component src/loops):\nKeep the component doc true: if your change alters what src/loops/AGENTS.md says, update it in the same commit.\n</system-reminder>')
    noneOf(await call(row, agent, 'Write', 'src/loops/run.ts'))
    // The document changed in the session: the next touch of the component brings the new one.
    writeFileSync(join(WORK, 'src', 'loops', 'AGENTS.md'), `${COMPONENT_DOC}\n## Cases\nA new case.\n`)
    assert.match(textOf(noticeOf(await call(row, agent, 'Read', 'src/loops/run.ts'))), /A new case\./)
    assert.ok((first.source.keys as string[]).length > 0, 'the reminder names what it told, for the history')
    const other = agentOf('session-2', { cwd: WORK })
    assert.ok(textOf(noticeOf(await call(row, other, 'Read', 'src/loops/run.ts'))).includes('Loops'), 'another session is told afresh')
  })
})

test('a push is on its way only while the history has not moved: once it has, what is not in it was taken out by a compaction and is told again', async () => {
  await inSeededRow(async (row) => {
    const agent = SESSION_AGENT(row)
    const first = noticeOf(await call(row, agent, 'Read', 'src/loops/run.ts'))
    noneOf(await call(row, agent, 'Read', 'src/loops/inner/deep.ts'))
    // The step ended and the history moved on, with the notice in it: still told.
    row.runtime.history.push({ role: 'user', content: first.content, source: first.source })
    noneOf(await call(row, agent, 'Read', 'src/loops/inner/deep.ts'))
    // A compaction replaced the history with a summary that has no notice in it.
    row.runtime.history.splice(0, row.runtime.history.length, { role: 'user', content: [{ type: 'text', text: 'summary' }], source: { kind: 'compaction', form: 'notice' } })
    const again = textOf(noticeOf(await call(row, agent, 'Read', 'src/loops/run.ts')))
    assert.match(again, /src\/loops\/AGENTS\.md:\n# Loops/)
    assert.match(again, /Lessons for this path/)
  })
})

test('the history of the session tells what it was told, the failure matching\'s notices included', async () => {
  await inRow(async (row) => {
    await row.tool('lessons_merge', LESSON)
    const agent = SESSION_AGENT(row)
    row.runtime.history.push({ role: 'user', content: [{ type: 'text', text: 'x' }], source: { kind: FAILURE_SOURCE, form: 'notice', summary: 'lesson match', lessons: ['L-100000'] } })
    row.runtime.history.push({ role: 'user', content: [{ type: 'text', text: 'y' }], source: { kind: PATH_SOURCE, form: 'notice', summary: 'x', keys: ['keep:src/loops'] } })
    const text = textOf(noticeOf(await call(row, agent, 'Write', 'src/loops/run.ts')))
    assert.doesNotMatch(text, /Lessons for this path/, 'the failure matching already told the lesson')
    assert.doesNotMatch(text, /Keep the component doc true/, 'an earlier reminder already said it')
    assert.match(text, /src\/loops\/AGENTS\.md:/)
  })
})

test('the host\'s own delivery decides whether the document is sent: a native tool under the working directory with the host\'s message in the history is not sent, an alias or a missing message is', async () => {
  await inRow(async (row) => {
    const agent = SESSION_AGENT(row)
    // The component is below the working directory (the project root), and the native tool is the one the host's table reads.
    row.runtime.history.push(HOST_BASELINE)
    const native = await call(row, agent, 'read', 'src/loops/run.ts')
    noneOf(native)
    // An alias carries a name the host's table does not know: the host does not deliver, so the document comes here.
    const alias = textOf(noticeOf(await call(row, agent, 'Read', 'src/loops/inner/deep.ts')))
    assert.match(alias, /src\/loops\/AGENTS\.md:\n# Loops/)
    // The host's table reads write and edit as well: a native write of another file of the component is delivered by the host too.
    const write = await call(row, agent, 'write', 'src/loops/inner/new.ts')
    assert.doesNotMatch((write.additionalContexts as UserNotice[] | undefined)?.map(textOf).join('\n') ?? '', /src\/loops\/AGENTS\.md:/)
    const edit = await call(row, agent, 'edit', 'src/loops/inner/deep.ts')
    assert.doesNotMatch((edit.additionalContexts as UserNotice[] | undefined)?.map(textOf).join('\n') ?? '', /src\/loops\/AGENTS\.md:/)
  }, { natives: ['read', 'write', 'edit', 'pwsh'] })
  await inRow(async (row) => {
    // The host's row is not there (no instructions message in the history): the native call brings the document too.
    assert.match(textOf(noticeOf(await call(row, SESSION_AGENT(row), 'read', 'src/loops/run.ts'))), /src\/loops\/AGENTS\.md:\n# Loops/)
  })
})

test('a component that is the working directory or above it is in the host\'s opening baseline whatever the tool; the document read itself is not sent; a path outside every component has only lessons and the graph', async () => {
  await inRow(async (row) => {
    row.runtime.history.push(HOST_BASELINE)
    // A session that works inside the component: the component is its working directory's ancestor, so the baseline holds it.
    const inside = { ...SESSION_AGENT(row), session: { ...SESSION_AGENT(row).session!, header: { id: 'agent-1', cwd: join(WORK, 'src', 'loops', 'inner') } } }
    noneOf(await call(row, inside, 'Read', 'deep.ts'))
    const doc = await call(row, SESSION_AGENT(row), 'read', 'src/loops/AGENTS.md')
    noneOf(doc)
    await row.tool('lessons_merge', { ...LESSON, situation: { files: ['src/plain/**'] } })
    const plain = textOf(noticeOf(await call(row, SESSION_AGENT(row), 'read', 'src/plain/a.ts')))
    assert.match(plain, /^<system-reminder>\nDocs and lessons at hand for src\/plain\/a\.ts:\nLessons for this path/)
  })
})

test('one call carries one reminder: a failed call only the failure matching\'s, a nested call or another tool or a path outside the checkouts nothing of this', async () => {
  await inRow(async (row) => {
    await row.tool('lessons_merge', LESSON)
    const agent = SESSION_AGENT(row)
    await row.tool('lessons_merge', { ...LESSON, situation: { files: ['src/loops/**'], errors: ['old_string not found'] } })
    tool(row, 'Edit', () => new Error('old_string not found'))
    const failed = await call(row, agent, 'Edit', 'src/loops/run.ts')
    assert.equal(failed.isError, true)
    assert.deepEqual((failed.additionalContexts as UserNotice[]).map(notice => notice.source.kind), [FAILURE_SOURCE], 'the failure matching speaks and the reminder at a file does not')
    noneOf(await call(row, agent, 'Read', 'src/loops/run.ts', { parent: 'run_code' }))
    noneOf(await call(row, agent, 'pwsh', 'src/loops/run.ts'))
    noneOf(await call(row, undefined, 'Read', 'src/loops/run.ts'))
    noneOf(await call(row, agent, 'Read', undefined))
    noneOf(await call(row, agent, 'Read', join(WORK, '..', '..', 'nowhere', 'a.ts')))
    // After all of that the first successful touch still brings the whole reminder.
    assert.ok(textOf(noticeOf(await call(row, agent, 'Read', 'src/loops/run.ts'))).includes('src/loops/AGENTS.md'))
  })
})

test('two calls of one step that touch the same component send the document once', async () => {
  await inRow(async (row) => {
    const agent = SESSION_AGENT(row)
    const [one, two] = await Promise.all([call(row, agent, 'Read', 'src/loops/run.ts'), call(row, agent, 'Read', 'src/loops/inner/deep.ts')])
    const bodies = [one, two].filter(result => (result.additionalContexts?.length ?? 0) > 0)
    assert.equal(bodies.length, 1)
  })
})

test('what cannot be read costs that part and nothing else: a graph that does not load, a document that is too large; the health says which', async () => {
  await inRow(async (row) => {
    const agent = SESSION_AGENT(row)
    const dir = join(WORK, 'docs', 'graph')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'nodes'), 'a file where the nodes directory should be')
    row.runtime.services.set('glmHournessGraph', { dirFor: () => dir, isGraphTool: () => false })
    const text = textOf(noticeOf(await call(row, agent, 'Read', 'src/loops/run.ts')))
    assert.match(text, /src\/loops\/AGENTS\.md:/, 'the document is still sent')
    assert.doesNotMatch(text, /Decisions on this path/)
    assert.match(JSON.stringify(rowHealth(row, agent.session?.id)), /路径提醒有一部分没送/)
    writeFileSync(join(WORK, 'src', 'plain', 'AGENTS.md'), 'x'.repeat(70 * 1024))
    noneOf(await call(row, agent, 'Read', 'src/plain/a.ts'))
    assert.match(JSON.stringify(rowHealth(row, agent.session?.id)), /larger than/)
  })
})

test('the row off, the reminder is off with it', async () => {
  await inRow(async (row) => {
    row.dispose()
    noneOf(await call(row, SESSION_AGENT(row), 'Read', 'src/loops/run.ts'))
  })
})
