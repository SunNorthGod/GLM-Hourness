/**
 * The `.llm/` git ignore (src/shared/llm-ignore.ts) and the scratch area
 * (src/guard/scratch.ts), on real temporary git repositories: the exclude
 * line lands once, check-ignore verifies it, a negation in .gitignore keeps
 * the directory visible and says so, and the leftovers list what the scratch
 * area holds.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ensureLlmIgnored } from '../src/data/llm-ignore.ts'
import { SCRATCH_DIR, scratchLeftovers } from '../src/guard/scratch.ts'

function git(dir: string, args: readonly string[]): string {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@localhost', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' })
}

async function repo(body?: (dir: string) => Promise<void>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'env-ignore-'))
  git(dir, ['init'])
  git(dir, ['config', 'core.autocrlf', 'false'])
  await body?.(dir)
  return dir
}

test('a project that does not ignore .llm/ gets one line in info/exclude, verified by check-ignore', async () => {
  const dir = await repo()
  try {
    const outcome = await ensureLlmIgnored(dir)
    assert.deepEqual([outcome.kind, outcome.kind === 'ignored' && outcome.appended], ['ignored', true])
    const exclude = await readFile(join(dir, '.git', 'info', 'exclude'), 'utf8')
    assert.equal(exclude.split('\n').filter(line => line.trim() === '.llm/').length, 1)
    // rc.3 reads the exit code of check-ignore; spawn it the same way: a zero exit throws nothing.
    execFileSync('git', ['-C', dir, 'check-ignore', '-q', '.llm/scratch/x'], { stdio: 'ignore' })
    // Every further run for the same repository reuses the first outcome (once per process).
    for (let index = 0; index < 2; index++) {
      const again = await ensureLlmIgnored(dir)
      assert.equal(again.kind, 'ignored')
    }
    assert.equal((await readFile(join(dir, '.git', 'info', 'exclude'), 'utf8')).split('\n').filter(line => line.trim() === '.llm/').length, 1)
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a negation in .gitignore keeps .llm/ visible: the outcome says so with the matching line', async () => {
  const dir = await repo(async dir => {
    await writeFile(join(dir, '.gitignore'), '!/.llm/\n')
    git(dir, ['add', '.gitignore'])
  })
  try {
    const outcome = await ensureLlmIgnored(dir)
    assert.equal(outcome.kind, 'visible')
    if (outcome.kind === 'visible') assert.ok(outcome.reason.includes('.gitignore'), outcome.reason)
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('outside a git repository there is nothing to do, and that is not kept: after git init the next run appends', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'env-ignore-nogit-'))
  try {
    assert.equal((await ensureLlmIgnored(dir)).kind, 'no-git')
    git(dir, ['init'])
    const outcome = await ensureLlmIgnored(dir)
    assert.deepEqual([outcome.kind, outcome.kind === 'ignored' && outcome.appended], ['ignored', true])
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('an exclude line already present (any of the four spellings) is not repeated', async () => {
  for (const line of ['.llm', '.llm/', '/.llm', '/.llm/']) {
    const dir = await repo(async dir => {
      await writeFile(join(dir, '.git', 'info', 'exclude'), `# comment\n${line}\n`)
    })
    try {
      const outcome = await ensureLlmIgnored(dir)
      assert.equal(outcome.kind, 'ignored')
      assert.equal(outcome.kind === 'ignored' && outcome.appended, false)
      const text = await readFile(join(dir, '.git', 'info', 'exclude'), 'utf8')
      const spellings = ['.llm', '.llm/', '/.llm', '/.llm/']
      assert.equal(text.split('\n').filter(entry => spellings.includes(entry.trim())).length, 1, text)
    }
    finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

test('scratchLeftovers lists the files of .llm/scratch shallow-first, relative, capped', async () => {
  const dir = await repo()
  try {
    assert.deepEqual(await scratchLeftovers(dir), { files: [], total: 0 })
    const scratch = join(dir, ...SCRATCH_DIR.split('/'))
    await mkdir(join(scratch, 'nested'), { recursive: true })
    await writeFile(join(scratch, 'fix.py'), 'print(1)')
    await writeFile(join(scratch, 'nested', 'deep.js'), '// x')
    await writeFile(join(dir, 'src.ts'), 'export {}')
    const left = await scratchLeftovers(dir)
    assert.deepEqual(left, { files: ['fix.py', 'nested/deep.js'], total: 2 })
    const one = await scratchLeftovers(dir, 1)
    assert.deepEqual([one.files, one.total], [['fix.py'], 2])
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
})
