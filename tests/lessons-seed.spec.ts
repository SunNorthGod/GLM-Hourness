/**
 * The first lessons (src/lessons/cli.ts, M5 design §4.8, node lessons-4):
 * the operations file .agents/tasks/m5/lessons-seed.json carries the 21 seed
 * lessons and is not kept in git (the orchestrator writes it from the
 * design), so a missing file is a setup error of the checkout and fails this
 * spec instead of passing over it. Every entry must pass the checks the
 * command line applies; two of the entries (the PowerShell one and the
 * worker-writes-the-graph one, which the pinned queries name) go through the
 * real command line into a temporary git project of its own, a second apply
 * adds nothing, and the two pinned queries of lessons-4 return the pinned
 * lessons there.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { realLockEnvironment } from '../src/data/lock.ts'
import { runCli } from '../src/lessons/cli.ts'
import { checkMerge, type MergeRequest } from '../src/lessons/merge.ts'
import { checkLessonFields } from '../src/lessons/model.ts'
import { lessonsRowService } from '../src/lessons/service.ts'
import type { LessonsEnv } from '../src/lessons/storage.ts'
import { lessonsTools } from '../src/lessons/tools.ts'
import type { SessionLike } from '../src/shared/dsh-min.ts'
import { agentOf, runTool } from './memory-helpers.ts'

const SEED = join(import.meta.dirname, '..', '.agents', 'tasks', 'm5', 'lessons-seed.json')
const NOW = new Date('2026-11-01T12:00:00Z')
const POWERSHELL = 'Windows PowerShell 5.1 reads and writes the ANSI code page'
const WORKER_GRAPH = 'A worker committed a graph comment on local main'

/** The entries of the operations file; its absence is reported as the setup error it is. */
function seedEntries(): readonly unknown[] {
  assert.ok(
    existsSync(SEED),
    `setup error: ${SEED} does not exist. The operations file is written from design.md §4.8 and stays out of git; write it into this checkout before running this spec.`,
  )
  const parsed: unknown = JSON.parse(readFileSync(SEED, 'utf8'))
  assert.ok(Array.isArray(parsed), 'the operations file must be a JSON list of lessons_merge requests')
  return parsed as readonly unknown[]
}

/** The project the spec works in: a folder of its own with a .git, like a real project. */
async function inRepository(seed: readonly unknown[], indexes: readonly number[], body: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'lessons-seed-'))
  try {
    mkdirSync(join(root, '.git', 'info'), { recursive: true })
    const file = join(root, 'seed.json')
    writeFileSync(file, JSON.stringify(indexes.map(index => seed[index])))
    const result = await runCli(['apply', '--file', file], { cwd: root, stdin: () => Promise.resolve('') })
    assert.equal(result.exitCode, 0, result.text)
    await body(root)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
}

/** The lessons environment over the project the command line wrote. */
function envOf(root: string): LessonsEnv {
  let drawn = 0x300000
  return {
    dirOf: () => join(root, '.llm'),
    now: () => NOW,
    random: () => drawn++,
    ignoreCase: false,
    native: tool => tool,
    note: () => {},
    counters: { rejected: new Map(), failed: new Set() },
    append: { lock: { ...realLockEnvironment, now: () => NOW.getTime() } },
  }
}

test('the operations file holds 21 entries and every entry passes the checks the apply path applies', () => {
  const entries = seedEntries()
  assert.equal(entries.length, 21, 'design.md §4.8 has 21 lessons')
  entries.forEach((entry, index) => {
    const request = checkMerge(entry)
    assert.ok(
      !('code' in request),
      `entry ${index + 1} is not a lessons_merge request: ${'code' in request ? `${request.code} ${request.message}` : ''}`,
    )
    const named: MergeRequest = request
    assert.equal(named.action, 'new', `entry ${index + 1} must write a lesson of its own`)
    assert.ok(named.reason.startsWith('seed from '), `entry ${index + 1} must say where it is seeded from`)
    const fields = checkLessonFields(named.content)
    assert.ok(
      !('code' in fields),
      `entry ${index + 1} does not hold as a lesson: ${'code' in fields ? `${fields.code} ${fields.field ?? ''} ${fields.message}` : ''}`,
    )
  })
  const seventh = checkMerge(entries[6])
  assert.ok(!('code' in seventh) && typeof seventh.content.fix === 'string')
  const seventhFix = ('code' in seventh ? '' : String(seventh.content.fix))
  assert.ok(!/shadow/i.test(seventhFix), 'entry 7 must not teach a shadow phase (d-code-rules-enforce)')
  assert.ok(seventhFix.includes('quote-aware'), 'entry 7 must fix the parsing with quote-aware shell text parsing')
  const fifteenth = checkMerge(entries[14])
  const fifteenthFix = 'code' in fifteenth ? '' : String(fifteenth.content.fix)
  assert.ok(!/lease/i.test(fifteenthFix), 'entry 15 must not mention the rules board lease (question-36 B)')
})

test('the two sample entries go through the command line into a project of their own, and a second apply adds nothing', async () => {
  const entries = seedEntries()
  await inRepository(entries, [0, 18], async (root) => {
    const file = join(root, 'seed.json')
    const second = await runCli(['apply', '--file', file], { cwd: root, stdin: () => Promise.resolve('') })
    assert.equal(second.exitCode, 0, second.text)
    const again = JSON.parse(second.text) as { applied: unknown[], skipped: unknown[], failed: unknown[] }
    assert.deepEqual([again.applied.length, again.skipped.length, again.failed.length], [0, 2, 0])
    const lines = readFileSync(join(root, '.llm', 'lessons.jsonl'), 'utf8').split('\n').filter(line => line !== '')
    assert.equal(lines.length, 2, 'the second apply wrote nothing: the same signatures are skipped')
  })
})

test('the pinned queries return the pinned lessons: lessons_query by keywords, relevant by write scope and by a path under it', async () => {
  const entries = seedEntries()
  await inRepository(entries, [0, 18], async (root) => {
    const env = envOf(root)
    const agent = agentOf('query-session', { cwd: root })
    const found = await runTool(new Map(lessonsTools(env).map(tool => [tool.name, tool])), 'lessons_query', { text: 'PowerShell encoding' }, agent)
    const lessons = found.lessons as Array<{ pitfall: string, score: number }>
    assert.ok(lessons.length >= 1, `the pinned keywords must find a lesson, got ${JSON.stringify(found)}`)
    assert.ok(lessons[0].pitfall.startsWith(POWERSHELL), `the pinned keywords must rank the PowerShell lesson first, got: ${lessons[0].pitfall}`)
    const service = lessonsRowService(env)
    const session = agent.session as SessionLike
    for (const wanted of [['docs/graph/**'], ['docs/graph/nodes/x.json']]) {
      const brief = await service.relevant({ session, paths: wanted, tools: [], commands: [] })
      assert.deepEqual(
        brief.map(entry => entry.problem.startsWith(WORKER_GRAPH)),
        [true],
        `relevant for ${wanted[0]} must return exactly the worker-graph lesson, got: ${JSON.stringify(brief)}`,
      )
    }
  })
})
