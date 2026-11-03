/**
 * The command line of the lessons board (src/lessons/cli.ts,
 * scripts/lessons/cli.ts; M5 design §4.8, §7.4): putting lessons into the
 * journal of the project a folder belongs to from outside a session. Each
 * case works in a folder of its own under the temporary directory that has
 * its own `.git`, so nothing is written into this checkout's `.llm`.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { runCli, type CliIo, type CliResult } from '../src/lessons/cli.ts'
import { LESSON } from './lessons-helpers.ts'
import { skipIfTempInsideGit } from './temp-outside-git.ts'

const TOKEN = ['ghp', 'x'.repeat(36)].join('_')
const SECOND = { ...LESSON, reason: 'seed from docs/DEVELOPMENT.md', situation: { commands: ['npm run probe'] }, pitfall: 'A probe and a calibration run started together disturb each other.', fix: 'Run one at a time.', evidence: ['docs/HANDOFF.md §6'] }

interface Folder {
  readonly root: string
  readonly cwd: string
  readonly lessons: string
  readonly file: (name: string, content: unknown) => string
  readonly run: (args: string[], io?: Partial<CliIo>) => Promise<CliResult & { readonly json: Record<string, unknown> }>
}

async function inRepository(body: (folder: Folder) => Promise<void> | void): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'lessons-cli-'))
  mkdirSync(join(root, '.git', 'info'), { recursive: true })
  const folder: Folder = {
    root,
    cwd: root,
    lessons: join(root, '.llm', 'lessons.jsonl'),
    file(name, content) {
      const path = join(root, name)
      writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content))
      return path
    },
    async run(args, io = {}) {
      const result = await runCli(args, { cwd: root, stdin: () => Promise.resolve(''), ...io })
      return { ...result, json: JSON.parse(result.text) as Record<string, unknown> }
    },
  }
  try {
    await body(folder)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const records = (folder: Folder): Array<{ op: string, actor: string, id: string, by?: Record<string, string> }> =>
  readFileSync(folder.lessons, 'utf8').split('\n').filter(line => line !== '').map(line => JSON.parse(line) as { op: string, actor: string, id: string })

test('apply writes each request as a lesson by the llm, names them, adds .llm/ to the exclude file of the repository, and skips what is there already when it runs again', async () => {
  await inRepository(async (folder) => {
    const file = folder.file('seed.json', [LESSON, SECOND, { ...LESSON, reason: 'again, told another way', pitfall: 'The same signature as the first.' }])
    const first = await folder.run(['apply', '--file', file])
    assert.equal(first.exitCode, 0, first.text)
    assert.equal(first.json.ok, true)
    assert.deepEqual((first.json.applied as Array<{ index: number, detail: { lesson: string } }>).map(item => [item.index, item.detail.lesson.length]), [[0, 8], [1, 8]])
    assert.deepEqual((first.json.skipped as Array<{ index: number, detail: { code: string, hint: string } }>).map(item => [item.index, item.detail.code, item.detail.hint.startsWith('use action into with lesson L-')]), [[2, 'duplicate', true]])
    assert.deepEqual(first.json.failed, [])
    assert.deepEqual(records(folder).map(record => [record.op, record.actor, record.by?.tool]), [['new', 'llm', 'lessons-cli'], ['new', 'llm', 'lessons-cli']])
    assert.ok(readFileSync(join(folder.root, '.git', 'info', 'exclude'), 'utf8').includes('.llm/'))
    const second = await folder.run(['apply', '--file', file])
    assert.equal(second.exitCode, 0)
    assert.deepEqual([(second.json.applied as unknown[]).length, (second.json.skipped as unknown[]).length], [0, 3])
    assert.equal(records(folder).length, 2, 'nothing new was written')
  })
})

test('apply lists the requests that do not hold with the reason and writes the others; the exit code says some failed', async () => {
  await inRepository(async (folder) => {
    const file = folder.file('seed.json', [LESSON, { action: 'retire', reason: 'x', lesson: 'L-ffffff' }, { ...SECOND, pitfall: `Use ${TOKEN} to log in.` }, 'not a request'])
    const result = await folder.run(['apply', '--file', file])
    assert.equal(result.exitCode, 1)
    assert.equal(result.json.ok, false)
    assert.deepEqual((result.json.applied as unknown[]).length, 1)
    assert.deepEqual((result.json.failed as Array<{ index: number, detail: { code: string, field?: string } }>).map(item => [item.index, item.detail.code, item.detail.field]), [[1, 'not_found', 'lesson'], [2, 'secret_like', 'pitfall'], [3, 'invalid', undefined]])
    assert.equal(records(folder).length, 1)
    assert.ok(!readFileSync(folder.lessons, 'utf8').includes(TOKEN))
  })
})

test('apply reads standard input without --file, and a byte order mark in the file does not matter', async () => {
  await inRepository(async (folder) => {
    const fromStdin = await folder.run(['apply'], { stdin: () => Promise.resolve(JSON.stringify([LESSON])) })
    assert.equal(fromStdin.exitCode, 0, fromStdin.text)
    const file = folder.file('bom.json', `\uFEFF${JSON.stringify([SECOND])}`)
    assert.equal((await folder.run(['apply', '--file', file])).exitCode, 0)
    assert.equal(records(folder).length, 2)
  })
})

test('show lists the lessons that are in force and the candidates waiting', async () => {
  await inRepository(async (folder) => {
    await folder.run(['apply', '--file', folder.file('seed.json', [LESSON, SECOND])])
    const shown = await folder.run(['show'])
    assert.equal(shown.exitCode, 0)
    assert.deepEqual((shown.json.lessons as Array<{ id: string, pitfall: string }>).map(lesson => lesson.pitfall), [LESSON.pitfall, SECOND.pitfall])
    assert.deepEqual([shown.json.candidates, shown.json.unreadableLines], [[], 0])
    assert.equal(shown.json.dir, join(folder.root, '.llm'))
    assert.equal((await folder.run(['show', '--cwd', join(folder.root, '.git')])).json.dir, join(folder.root, '.llm'), '--cwd names any folder of the repository')
  })
})

test('a bad command line, bad input or no project is exit code 2 with the usage, and nothing is written', async () => {
  await inRepository(async (folder) => {
    const usage = async (args: string[], io?: Partial<CliIo>): Promise<string> => {
      const result = await folder.run(args, io)
      assert.equal(result.exitCode, 2, `${args.join(' ')}: ${result.text}`)
      assert.equal((result.json.error as { hint: string }).hint.startsWith('npm run -s lessons -- '), true)
      return (result.json.error as { message: string }).message
    }
    assert.equal(await usage([]), 'missing command')
    assert.equal(await usage(['sort']), 'unknown command "sort"')
    assert.equal(await usage(['show', 'now']), 'show takes no arguments')
    assert.equal(await usage(['show', '--file', 'x']), 'show takes no --file')
    assert.ok((await usage(['apply', '--nonsense'])).includes('--nonsense'))
    assert.equal(await usage(['apply']), 'no request: pass a JSON list with --file or on stdin')
    assert.ok((await usage(['apply', '--file', join(folder.root, 'missing.json')])).startsWith('cannot read --file '))
    assert.ok((await usage(['apply', '--file', folder.file('bad.json', '{nope')])).startsWith('the input is not valid JSON'))
    assert.equal(await usage(['apply', '--file', folder.file('object.json', { action: 'new' })]), 'the input must be a JSON list of lessons_merge requests')
    assert.throws(() => readFileSync(folder.lessons), /ENOENT/)
  })
})

test('a folder that is no project is exit code 2 and no .llm is made', { skip: skipIfTempInsideGit() }, async () => {
  const bare = mkdtempSync(join(tmpdir(), 'lessons-cli-bare-'))
  try {
    const result = await runCli(['apply', '--file', join(bare, 'x.json')], { cwd: bare, stdin: () => Promise.resolve('') })
    assert.equal(result.exitCode, 2)
    assert.ok(result.text.includes('no project at '), result.text)
    assert.throws(() => readFileSync(join(bare, '.llm')), /ENOENT|EISDIR/)
  }
  finally {
    rmSync(bare, { recursive: true, force: true })
  }
})

test('the script runs under Node as npm run -s lessons does: JSON on stdout and the exit code of the result', async () => {
  await inRepository((folder) => {
    const run = (args: string[]) => spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(import.meta.dirname, '..', 'scripts', 'lessons', 'cli.ts'), ...args], { cwd: folder.root, encoding: 'utf8', env: { ...process.env, INIT_CWD: folder.root } })
    const applied = run(['apply', '--file', folder.file('seed.json', [LESSON])])
    assert.equal(applied.status, 0, applied.stderr)
    assert.equal((JSON.parse(applied.stdout) as { ok: boolean }).ok, true)
    const refused = run(['apply', '--file', folder.file('retire.json', [{ action: 'retire', reason: 'x', lesson: 'L-ffffff' }])])
    assert.equal(refused.status, 1)
    assert.equal(run(['bogus']).status, 2)
  })
})
