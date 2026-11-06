import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import test from 'node:test'
import { apply } from '../src/glm-prompt/index.ts'
import { descendantDirs, MAX_BATCH_BYTES, renderBatch, SUBDIR_INSTRUCTIONS_SOURCE, touchedPaths, type InstructionFile } from '../src/glm-prompt/subdir-instructions.ts'
import type { DerivedMessage, PreStepDecision, UserNotice } from '../src/shared/dsh-min.ts'
import { fakeRuntime } from './fake-rc3.ts'

/** A real project on disk (the host reads real files): `.git` marks the root, `pkg/`, `pkg/sub/` and `other/` carry instruction files. */
function project(): { readonly root: string, readonly cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'glm-subdir-'))
  const put = (path: string, text: string): void => {
    mkdirSync(resolve(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  mkdirSync(join(root, '.git'))
  put('AGENTS.md', 'ROOT-MARK\n')
  put('pkg/AGENTS.md', 'PKG-MARK\n')
  put('pkg/AGENTS.local.md', 'PKG-LOCAL-MARK\n')
  put('pkg/sub/AGENTS.md', 'SUB-MARK\n')
  put('pkg/sub/file.txt', 'data\n')
  put('pkg/plain/file.txt', 'data\n')
  put('other/CLAUDE.md', 'OTHER-MARK\n')
  put('twin/AGENTS.md', 'TWIN-MARK\n')
  put('twin/CLAUDE.md', 'TWIN-MARK\n\n')
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

let ids = 0
/** One assistant message (rc.3 shape) with its tool calls, and the results; `failed` names the calls that errored. */
function turn(calls: ReadonlyArray<{ name: string, args?: unknown, failed?: boolean }>, model = 'glm-5.3'): DerivedMessage[] {
  const blocks = calls.map(call => ({ type: 'tool-call', id: `call-${++ids}`, name: call.name, arguments: JSON.stringify(call.args ?? {}) }))
  return [
    { role: 'assistant', content: blocks, source: { kind: 'model', provider: 'glm-zcode', model } },
    ...blocks.map((block, index) => ({ role: 'tool', toolCallId: block.id, isError: calls[index]?.failed === true, content: [{ type: 'text', text: 'ok' }] })),
  ]
}

const subdirNotices = (decision: PreStepDecision): UserNotice[] =>
  decision.kind === 'enter' ? decision.messages.filter((message): message is UserNotice => (message as UserNotice).source?.kind === SUBDIR_INSTRUCTIONS_SOURCE) : []

/** The dialect row applied, an agent created in `cwd`, and one GLM step assembled over `history`. */
async function step(cwd: string, history: readonly DerivedMessage[], options: { model?: string, config?: Parameters<typeof apply>[1], messages?: readonly unknown[] } = {}) {
  const rt = fakeRuntime({ cwd })
  apply(rt.ctx, options.config ?? {}, () => Date.parse('2026-10-28T10:00:00+08:00'))
  await rt.create()
  rt.history.push(...history)
  await rt.assemble({ model: options.model ?? 'glm-5.3' })
  const decision = await rt.preStep({ step: 2, ...(options.messages === undefined ? {} : { messages: options.messages }) })
  return { rt, decision }
}

test('an alias Read below the working directory brings the instruction files of the directories in between, shallow to deep', async () => {
  const { root, cleanup } = project()
  try {
    const { decision } = await step(root, turn([{ name: 'Read', args: { file_path: join(root, 'pkg', 'sub', 'file.txt') } }]))
    const [notice, extra] = subdirNotices(decision)
    assert.ok(notice !== undefined && extra === undefined)
    const text = notice.content[0].text
    assert.ok(text.startsWith('<system-reminder>\nAdditional instructions from: pkg'))
    assert.ok(text.endsWith('</system-reminder>'))
    const marks = ['PKG-MARK', 'PKG-LOCAL-MARK', 'SUB-MARK'].map(mark => text.indexOf(mark))
    assert.ok(marks.every(index => index > 0) && marks[0] < marks[1] && marks[1] < marks[2])
    assert.ok(!text.includes('ROOT-MARK')) // the working directory and above are the host's baseline, not this notice
    assert.ok(text.includes(`These instructions apply to work under \`${join('pkg', 'sub')}\`.`))
    assert.deepEqual(notice.source.files, [join('pkg', 'AGENTS.md'), join('pkg', 'AGENTS.local.md'), join('pkg', 'sub', 'AGENTS.md')])
    assert.deepEqual(notice.source.dirs, [join(root, 'pkg'), join(root, 'pkg', 'sub')])
    assert.equal(notice.role, 'user')
    assert.ok(Object.isFrozen(notice))
  }
  finally { cleanup() }
})

test('Write and Edit reach directories too; a failed call, a native-named call and a path outside the working directory do not', async () => {
  const { root, cleanup } = project()
  try {
    const write = await step(root, turn([{ name: 'Write', args: { file_path: join(root, 'other', 'new.txt'), content: 'x' } }]))
    assert.match(subdirNotices(write.decision)[0]?.content[0].text ?? '', /OTHER-MARK/)
    const edit = await step(root, turn([{ name: 'Edit', args: { file_path: join(root, 'pkg', 'sub', 'file.txt'), old_string: 'a', new_string: 'b' } }]))
    assert.match(subdirNotices(edit.decision)[0]?.content[0].text ?? '', /SUB-MARK/)
    const failed = await step(root, turn([{ name: 'Read', args: { file_path: join(root, 'pkg', 'sub', 'file.txt') }, failed: true }]))
    assert.deepEqual(subdirNotices(failed.decision), [])
    const native = await step(root, turn([{ name: 'read', args: { file_path: join(root, 'pkg', 'sub', 'file.txt') } }]))
    assert.deepEqual(subdirNotices(native.decision), [])
    const other = await step(join(root, 'pkg'), turn([{ name: 'Read', args: { file_path: join(root, 'other', 'x.txt') } }]))
    assert.deepEqual(subdirNotices(other.decision), [])
    const grep = await step(root, turn([{ name: 'Grep', args: { pattern: 'x', path: join(root, 'pkg') } }, { name: 'Bash', args: { command: 'cat pkg/sub/file.txt' } }]))
    assert.deepEqual(subdirNotices(grep.decision), [])
  }
  finally { cleanup() }
})

test('a relative file_path resolves against the working directory; a working directory in a subdirectory bounds the walk', async () => {
  const { root, cleanup } = project()
  try {
    const relativePath = await step(root, turn([{ name: 'Read', args: { file_path: 'pkg/sub/file.txt' } }]))
    assert.match(subdirNotices(relativePath.decision)[0]?.content[0].text ?? '', /SUB-MARK/)
    const inner = await step(join(root, 'pkg'), turn([{ name: 'Read', args: { file_path: join(root, 'pkg', 'sub', 'file.txt') } }]))
    const text = subdirNotices(inner.decision)[0]?.content[0].text ?? ''
    assert.match(text, /SUB-MARK/)
    assert.ok(!text.includes('PKG-MARK') && !text.includes('PKG-LOCAL-MARK')) // pkg is the working directory: baseline, not this notice
  }
  finally { cleanup() }
})

test('a delivered notice persists in history: the next step sends nothing again; a new directory sends only itself', async () => {
  const { root, cleanup } = project()
  try {
    const first = await step(root, turn([{ name: 'Read', args: { file_path: join(root, 'pkg', 'sub', 'file.txt') } }]))
    const [notice] = subdirNotices(first.decision)
    assert.ok(notice !== undefined)
    first.rt.history.push(notice, ...turn([{ name: 'Read', args: { file_path: join(root, 'pkg', 'sub', 'file.txt') } }]))
    await first.rt.assemble({ model: 'glm-5.3' })
    assert.deepEqual(subdirNotices(await first.rt.preStep({ step: 3 })), [])
    first.rt.history.push(...turn([{ name: 'Read', args: { file_path: join(root, 'other', 'x.txt') } }]))
    await first.rt.assemble({ model: 'glm-5.3' })
    const [next, extra] = subdirNotices(await first.rt.preStep({ step: 4 }))
    assert.ok(next !== undefined && extra === undefined)
    assert.deepEqual(next.source.dirs, [join(root, 'other')])
    assert.ok(!next.content[0].text.includes('PKG-MARK'))
  }
  finally { cleanup() }
})

test('without the notice in history (compacted away) the touched directory is sent again', async () => {
  const { root, cleanup } = project()
  try {
    const call = turn([{ name: 'Read', args: { file_path: join(root, 'pkg', 'sub', 'file.txt') } }])
    const first = await step(root, call)
    assert.equal(subdirNotices(first.decision).length, 1)
    // Compaction rebuilt the history from the same visible tail without the notice.
    await first.rt.assemble({ model: 'glm-5.3' })
    assert.equal(subdirNotices(await first.rt.preStep({ step: 3 })).length, 1)
  }
  finally { cleanup() }
})

test('a directory the host already delivered (its agent-instructions message names the file) is not sent again', async () => {
  const { root, cleanup } = project()
  try {
    const hostMessage: DerivedMessage = {
      role: 'user',
      content: [{ type: 'text', text: '<system-reminder>\nAdditional instructions from: pkg\\AGENTS.md\n</system-reminder>' }],
      source: { kind: 'agent-instructions', form: 'instructions', changes: [{ action: 'set', scope: 'pkg\0AGENTS.md', path: join('pkg', 'AGENTS.md') }] },
    }
    const { decision } = await step(root, [hostMessage, ...turn([{ name: 'Read', args: { file_path: join(root, 'pkg', 'sub', 'file.txt') } }])])
    const [notice] = subdirNotices(decision)
    assert.ok(notice !== undefined)
    assert.deepEqual(notice.source.dirs, [join(root, 'pkg', 'sub')])
    assert.ok(!notice.content[0].text.includes('PKG-MARK'))
  }
  finally { cleanup() }
})

test('identical candidates of one directory are sent once; directories without files send nothing', async () => {
  const { root, cleanup } = project()
  try {
    const twin = await step(root, turn([{ name: 'Read', args: { file_path: join(root, 'twin', 'x.txt') } }]))
    const text = subdirNotices(twin.decision)[0]?.content[0].text ?? ''
    assert.equal(text.split('TWIN-MARK').length - 1, 1)
    assert.ok(text.includes(`Additional instructions from: ${join('twin', 'AGENTS.md')}`) && !text.includes('CLAUDE.md'))
    const none = await step(root, turn([{ name: 'Read', args: { file_path: join(root, 'pkg', 'plain', 'file.txt') } }]))
    assert.deepEqual(subdirNotices(none.decision).map(notice => notice.source.dirs), [[join(root, 'pkg')]]) // pkg has files, pkg/plain has none
  }
  finally { cleanup() }
})

test('non-GLM routes and the off switch get no notice; the request is otherwise untouched', async () => {
  const { root, cleanup } = project()
  try {
    const history = turn([{ name: 'Read', args: { file_path: join(root, 'pkg', 'sub', 'file.txt') } }])
    assert.deepEqual(subdirNotices((await step(root, history, { model: 'deepseek-flash' })).decision), [])
    const off = await step(root, history, { config: { subdirInstructions: false } })
    assert.deepEqual(subdirNotices(off.decision), [])
    // Nothing below the working directory was touched: the decision is what the row decides without the notice.
    const untouched = turn([{ name: 'Read', args: { file_path: join(root, 'AGENTS.md') } }])
    const on = await step(root, untouched)
    const without = await step(root, untouched, { config: { subdirInstructions: false } })
    assert.deepEqual(subdirNotices(on.decision), [])
    assert.deepEqual(on.decision.kind === 'enter' ? on.decision.messages.map(message => (message as UserNotice).source.kind) : [], without.decision.kind === 'enter' ? without.decision.messages.map(message => (message as UserNotice).source.kind) : ['unexpected'])
  }
  finally { cleanup() }
})

test('the notice follows the admitted messages and precedes the later reminders', async () => {
  const { root, cleanup } = project()
  try {
    const userInput = { id: 'u1', role: 'user', content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } }
    const todos = Array.from({ length: 10 }, () => turn([{ name: 'Read', args: { file_path: join(root, 'pkg', 'sub', 'file.txt') } }])).flat()
    const { decision } = await step(root, todos, { messages: [userInput] })
    assert.ok(decision.kind === 'enter')
    const kinds = decision.messages.map(message => (message as UserNotice).source.kind)
    assert.deepEqual(kinds, ['user', SUBDIR_INSTRUCTIONS_SOURCE, 'glm-todo-reminder', 'glm-tool-search'])
  }
  finally { cleanup() }
})

test('touchedPaths and descendantDirs', () => {
  const cwd = resolve('/work/proj')
  const history = [...turn([{ name: 'Read', args: { file_path: 'a/b.txt' } }, { name: 'Write', args: { file_path: '/work/proj/c/d.txt' } }, { name: 'Edit', args: { file_path: '  ' } }, { name: 'Read', args: {} }])]
  assert.deepEqual(touchedPaths(history, cwd), [resolve(cwd, 'a/b.txt'), resolve('/work/proj/c/d.txt')])
  assert.deepEqual(descendantDirs(cwd, resolve(cwd, 'a/x/y.txt')), [resolve(cwd, 'a'), resolve(cwd, 'a/x')])
  assert.deepEqual(descendantDirs(cwd, resolve(cwd, 'y.txt')), [])
  assert.deepEqual(descendantDirs(cwd, resolve('/work/other/y.txt')), [])
  assert.deepEqual(descendantDirs(cwd, resolve('/work/proj/..x/y.txt')), [resolve('/work/proj/..x')])
})

test('renderBatch keeps everything within the budget; over it the shallow files go first, then the deepest is cut', () => {
  const file = (directory: string, content: string): InstructionFile => ({ directory, displayPath: join(relative('/r', directory), 'AGENTS.md'), content })
  const small = [file('/r/a', 'A'), file('/r/a/b', 'B')]
  assert.equal(renderBatch(small).included.length, 2)
  const big = [file('/r/a', 'a'.repeat(300)), file('/r/a/b', 'b'.repeat(300))]
  const dropped = renderBatch(big, 700)
  assert.deepEqual(dropped.included.map(item => item.directory), ['/r/a/b'])
  assert.ok(dropped.text.includes(`Workspace instruction budget 700 bytes: omitted ${join('a', 'AGENTS.md')}`))
  assert.ok(Buffer.byteLength(dropped.text) <= 700)
  const cut = renderBatch([file('/r/a', 'é'.repeat(2000))], 800)
  assert.ok(Buffer.byteLength(cut.text) <= 800 && cut.text.includes('truncated'))
  assert.ok(!cut.text.includes('\ufffd')) // never splits a character
  assert.equal(MAX_BATCH_BYTES, 65536)
})
