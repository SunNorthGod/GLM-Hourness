/**
 * `loops:files-only`, the loop row's gate on its own files (docs/ORCHESTRATION.md
 * §18.8; loop board design §2.4 row 16a, §13, §15 L2) on the fake rc.3 host:
 * a file tool or a shell command that writes into `docs/loops/` or `.llm/loops/`
 * of any checkout of the repository is denied with the four-part text, for a
 * direct call and for the call of a `run_code` program alike; reads pass; the
 * denial is a line of the project's violation journal; the gate works from the day
 * the row is enabled and not before or after; and the board's own writes, which
 * are not tool calls, are not in its way.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { GUARD_RULES } from '../src/guard/catalog.ts'
import { LOOPS_FILES_ONLY } from '../src/loops/guard.ts'
import { entryFileText } from '../src/loops/model.ts'
import { openLoopStore } from '../src/loops/store.ts'
import { git, quickIo, seedAgreed, tellEntry } from './loops-helpers.ts'
import { textOf, withLoopsRow } from './loops-host.ts'

const ENTRY = 'u-0a1b2c3d'
const shell = (command: string): unknown => ({ command })
const reasonOf = (result: Parameters<typeof textOf>[0]): string => textOf(result).replace(/^Error: /, '')

const rowTest = (title: string, body: Parameters<typeof withLoopsRow>[0], options: Parameters<typeof withLoopsRow>[1] = {}): void => {
  test(title, () => withLoopsRow(body, options))
}

rowTest('a file tool writing into docs/loops/ or .llm/loops/ is denied with the four-part text, never runs, and is a line of the violation journal', async ({ root, exec, calls, violations }) => {
  const targets = [
    ['write', { file_path: join(root, 'docs', 'loops', 'entries', `${ENTRY}.json`), content: '{}' }],
    ['write', { file_path: 'docs/loops/scripts/u-4e5f6a7b.mjs', content: 'x' }],
    ['edit', { file_path: join(root, 'docs', 'loops', 'entries', `${ENTRY}.json`), old_string: 'a', new_string: 'b' }],
    ['write', { file_path: join(root, '.llm', 'loops', 'journal.jsonl'), content: '' }],
    ['str_replace_editor', { command: 'create', path: join(root, '.llm', 'loops', 'state.json'), file_text: '{}' }],
    ['str_replace_editor', { command: 'str_replace', path: 'docs/loops/entries/x.json', old_str: 'a', new_str: 'b' }],
  ] as const
  const reasons: string[] = []
  for (const [tool, args] of targets) {
    const result = await exec(tool, args)
    assert.equal(result.isError, true, JSON.stringify(args))
    assert.match(reasonOf(result), /^You tried to write ".+"\.\nBoundary: Rule loops:files-only blocks writes under the loop board's files \(docs\/loops\/ in the repository and \.llm\/loops\/\); only the loop board writes there\.\nRight path: .+\nException: .+/)
    reasons.push(reasonOf(result))
  }
  assert.deepEqual(calls, [], 'no call ran')
  // The journal is written without the call waiting for it, so the lines are in no fixed order.
  const records = await violations(targets.length)
  assert.equal(records.length, targets.length)
  assert.deepEqual(records.map(record => record.correction).sort(), [...reasons].sort())
  assert.ok(records.every(record => record.rule === LOOPS_FILES_ONLY && record.mode === 'enforce' && record.agentId === 'agent-1' && record.sessionId === 'agent-1' && /^\d{4}-\d\d-\d\dT/.test(String(record.at))))
  assert.deepEqual(records.map(record => record.tool).sort(), targets.map(([tool]) => tool).sort())
})
rowTest('a shell command that file-tools-only counts as a write and that names the board\'s files is denied; a read of them, and a write elsewhere, run', async ({ exec, calls }) => {
  for (const command of [
    'Set-Content docs/loops/entries/u-0a1b2c3d.json "{}"',
    'Add-Content .llm/loops/journal.jsonl x',
    'echo x > .llm/loops/view.json',
    'Remove-Item docs/loops/scripts/u-4e5f6a7b.mjs',
    'Move-Item docs/loops/entries/a.json docs/other.json',
  ]) {
    const result = await exec('pwsh', shell(command))
    assert.equal(result.isError, true, command)
    assert.match(reasonOf(result), /^You tried to change the loop board's files through the shell: ".+"\.\nBoundary: Rule loops:files-only /)
  }
  assert.deepEqual(calls, [])
  for (const command of ['Get-Content docs/loops/entries/u-0a1b2c3d.json', 'git status docs/loops', 'Set-Content docs/other.md x', 'Get-ChildItem .llm/loops']) {
    assert.equal((await exec('pwsh', shell(command))).isError, false, command)
  }
  assert.equal(calls.length, 4)
})

rowTest('reads and writes elsewhere run: a read of the board\'s files, a view in the editor, names that only start like the board\'s directories', async ({ root, exec, calls }) => {
  assert.equal((await exec('read', { file_path: join(root, 'docs', 'loops', 'entries', `${ENTRY}.json`) })).isError, false)
  assert.equal((await exec('str_replace_editor', { command: 'view', path: 'docs/loops/entries/x.json' })).isError, false)
  for (const path of ['docs/loops-notes/a.md', 'docs/loops.md', 'docs/other/loops/a.md', '.llm/loops-old/a.json', '.llm/audit/violations.jsonl', 'src/docs/loops/a.ts']) {
    assert.equal((await exec('write', { file_path: path, content: 'x' })).isError, false, path)
  }
  assert.equal(calls.length, 8)
})

rowTest('a call made from inside another (a run_code program\'s tool call, which carries parent) is judged like a direct one', async ({ root, exec, calls, violations }) => {
  const nested = await exec('write', { file_path: join(root, 'docs', 'loops', 'entries', 'x.json'), content: '{}' }, { parent: { callId: 'outer' } })
  assert.equal(nested.isError, true)
  assert.match(reasonOf(nested), /Rule loops:files-only/)
  assert.equal((await exec('write', { file_path: 'docs/notes.md', content: 'x' }, { parent: { callId: 'outer' } })).isError, false)
  assert.equal(calls.length, 1)
  assert.equal((await violations(1)).length, 1)
})

rowTest('another checkout of the repository is the board\'s too: a work tree\'s docs/loops/ and .llm/loops/ from the main session, and the same relative path from a session in the work tree', async ({ root, exec, agentIn, calls }) => {
  const tree = join(`${root}-tree`)
  git(root, 'worktree', 'add', '--quiet', '-b', 'other', tree)
  try {
    for (const path of [join(tree, 'docs', 'loops', 'entries', 'x.json'), join(tree, '.llm', 'loops', 'journal.jsonl')]) {
      assert.equal((await exec('write', { file_path: path, content: '{}' })).isError, true, path)
    }
    const inTree = agentIn(tree)
    for (const path of ['docs/loops/entries/x.json', '.llm/loops/view.json']) {
      assert.equal((await exec('write', { file_path: path, content: '{}' }, { agent: inTree })).isError, true, `${path} from the work tree`)
    }
    assert.equal((await exec('write', { file_path: 'docs/notes.md', content: 'x' }, { agent: inTree })).isError, false)
    assert.equal(calls.length, 1)
  }
  finally {
    git(root, 'worktree', 'remove', '--force', tree)
  }
})

test('the list of work trees is kept for a minute: a tree made after the gate looked is covered a minute later', async () => {
  const clock = { now: Date.parse('2026-11-02T01:00:00.000Z') }
  await withLoopsRow(async ({ root, exec }) => {
    const first = join(`${root}-first`)
    const second = join(`${root}-second`)
    git(root, 'worktree', 'add', '--quiet', '-b', 'first', first)
    try {
      assert.equal((await exec('write', { file_path: join(first, 'docs', 'loops', 'a.json'), content: '{}' })).isError, true)
      git(root, 'worktree', 'add', '--quiet', '-b', 'second', second)
      const target = { file_path: join(second, 'docs', 'loops', 'a.json'), content: '{}' }
      assert.equal((await exec('write', target)).isError, false, 'not seen yet: the list is from the first call')
      clock.now += 61_000
      assert.equal((await exec('write', target)).isError, true)
    }
    finally {
      git(root, 'worktree', 'remove', '--force', first)
      git(root, 'worktree', 'remove', '--force', second)
    }
  }, { now: () => clock.now })
})

test('the gate works from the day the row is enabled, and only while it is: before the row there is no gate, and nothing is left when it goes', async () => {
  await withLoopsRow(async ({ root, exec, start }) => {
    const target = { file_path: join(root, 'docs', 'loops', 'entries', 'x.json'), content: '{}' }
    assert.equal((await exec('write', target)).isError, false, 'the row is not applied')
    const stop = start()
    assert.equal((await exec('write', target)).isError, true)
    stop()
    assert.equal((await exec('write', target)).isError, false)
  }, { start: false })
})

test('a session whose directory is in no project has no board to keep', async () => {
  const outside = await mkdtemp(join(tmpdir(), 'loops-outside-'))
  try {
    await withLoopsRow(async ({ exec, calls }) => {
      assert.equal((await exec('write', { file_path: join(outside, 'docs', 'loops', 'x.json'), content: '{}' })).isError, false)
      assert.equal(calls.length, 1)
    }, { cwd: outside })
    await withLoopsRow(async ({ exec }) => {
      assert.equal((await exec('write', { file_path: 'docs/loops/x.json', content: '{}' })).isError, false, 'a session with no directory')
    }, { cwd: null })
  }
  finally {
    await rm(outside, { recursive: true, force: true })
  }
})

rowTest('the board\'s own writes are not tool calls: /loops restore changes docs/loops/ while the gate is on, and the journal has no line of it', async ({ root, run, violations }) => {
  const entry = tellEntry(ENTRY)
  const store = openLoopStore(root, { io: quickIo() })
  await seedAgreed({ root, store }, entry)
  await writeFile(join(root, 'docs', 'loops', 'entries', `${ENTRY}.json`), '')
  const result = await run(`restore ${ENTRY}`)
  assert.equal(result.kind, 'success')
  assert.equal(await readFile(join(root, 'docs', 'loops', 'entries', `${ENTRY}.json`), 'utf8'), entryFileText(entry))
  assert.deepEqual(await violations(), [])
})

test('the rule is listed in the guard framework\'s catalog as enforced, and nothing under src/loops/ has a mode that only records', () => {
  assert.deepEqual(GUARD_RULES.filter(rule => rule.row === 'loops').map(rule => [rule.id, rule.mode]), [['files-only', 'enforce']])
  const dir = new URL('../src/loops/', import.meta.url)
  for (const file of readdirSync(dir).filter(name => name.endsWith('.ts'))) {
    assert.doesNotMatch(readFileSync(new URL(file, dir), 'utf8'), /shadow/i, `${file} has a shadow mode`)
  }
})
