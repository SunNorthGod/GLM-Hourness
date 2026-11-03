/**
 * The library entry for one-shot processes (metrics design §5.2, acceptance
 * 13): `appendEvents` locates the project of `dir`, writes and closes; a
 * real subprocess calling it lands exactly one `rules.check` in the
 * project's journal before it exits; outside any project it writes nothing
 * and says `no-project`.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { appendEvents } from '../src/metrics/library.ts'
import { readLog } from '../src/metrics/read.ts'

const run = promisify(execFile)

/** A git repository whose info/exclude can take the ignore line (src/data/project-root.ts finds the root from `.git`). */
function repository(): string {
  const root = mkdtempSync(join(tmpdir(), 'metrics-library-'))
  mkdirSync(join(root, '.git', 'info'), { recursive: true })
  return root
}

/** A valid `rules.check` carrying the current instant, so the close-time stop sorts after it. */
const CHECK = (): { readonly k: 'rules.check', readonly by: 'rules', readonly at: string, readonly body: { readonly effect: 'allow', readonly exitCode: 0, readonly rules: readonly string[], readonly peakMode: { readonly level: string, readonly origin: string }, readonly glmPeakSource: string, readonly unknownSignals: readonly string[], readonly caller: 'library' } } => ({
  k: 'rules.check', by: 'rules', at: new Date().toISOString(),
  body: { effect: 'allow', exitCode: 0, rules: ['r1'], peakMode: { level: 'none', origin: 'default' }, glmPeakSource: 'absent', unknownSignals: [], caller: 'library' },
})

test('appendEvents writes the events of the project of dir, and the journal reads them back', async () => {
  const root = repository()
  try {
    const result = await appendEvents(join(root, 'src', 'deep'), [CHECK()])
    assert.deepEqual(result, { written: 3, rejected: 0 }, 'start, the event and the close-time stop')
    const reading = await readLog(root)
    const kinds = reading.events.map(event => event.k)
    assert.deepEqual(kinds.slice().sort(), ['rules.check', 'start', 'stop'], 'one writer, three lines; the read order is by instant')
    const check = reading.events.find(event => event.k === 'rules.check')!
    assert.equal(check.body.effect, 'allow')
    assert.equal(check.body.caller, 'library')
    assert.match(String(check.w), /^[0-9a-f]{8}$/)
    const exclude = readFileSync(join(root, '.git', 'info', 'exclude'), 'utf8')
    assert.ok(exclude.includes('.llm/'))
    assert.equal(readFileSync(join(root, '.llm', 'metrics', '.gitignore'), 'utf8'), '*\n')
    const manifest = readFileSync(join(root, '.llm', 'metrics-manifest.jsonl'), 'utf8')
    const manifestEntry = manifest.split('\n').filter(line => line !== '').map(line => JSON.parse(line) as { readonly file: string })[0]
    assert.equal(manifestEntry.file, `events-${String(check.at).slice(0, 10)}.jsonl`)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('outside any project appendEvents writes nothing and answers no-project', async () => {
  const root = mkdtempSync(join(tmpdir(), 'metrics-library-'))
  try {
    const result = await appendEvents(join(root, 'plain'), [CHECK()])
    assert.deepEqual(result, { written: 0, rejected: 0, error: 'no-project' })
    assert.ok(!existsSync(join(root, '.llm')), 'not even a directory was created')
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a rejected event is counted, not written', async () => {
  const root = repository()
  try {
    const bad = { k: 'rules.check', by: 'rules', at: new Date().toISOString(), body: { effect: 'allow', exitCode: 0, rules: 'r1', peakMode: { level: 'none', origin: 'default' }, glmPeakSource: 'absent', unknownSignals: [], caller: 'library' } }
    const result = await appendEvents(root, [bad as unknown as Parameters<typeof appendEvents>[1][number]])
    assert.equal(result.rejected, 1)
    assert.equal(result.written, 3, 'start, the reject line and the close-time stop')
    const reading = await readLog(root)
    assert.deepEqual(reading.events.map(event => event.k).sort(), ['reject', 'start', 'stop'])
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a second one-shot run on the same project prepares fine: the guard file is already there', async () => {
  const root = repository()
  try {
    assert.deepEqual(await appendEvents(root, [CHECK()]), { written: 3, rejected: 0 })
    assert.deepEqual(await appendEvents(join(root, 'src'), [CHECK()]), { written: 3, rejected: 0 }, 'the wx race on .gitignore is not an error')
    const reading = await readLog(root)
    assert.equal(reading.events.filter(event => event.k === 'rules.check').length, 2)
    assert.deepEqual(reading.problems, [])
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a batch larger than the queue limit lands whole: the run drains between chunks (acceptance 12, one writer)', { timeout: 60_000 }, async () => {
  const root = repository()
  try {
    const at = new Date().toISOString()
    const events = Array.from({ length: 2500 }, (_, i) => ({ k: 'count', by: 'guard', at, body: { what: `w-${i}`, value: i } })) as unknown as Parameters<typeof appendEvents>[1]
    const result = await appendEvents(root, events)
    assert.deepEqual(result, { written: 2502, rejected: 0 }, '2500 events plus start and stop; nothing dropped')
    const reading = await readLog(root)
    assert.equal(reading.events.length, 2502)
    assert.deepEqual(reading.problems, [])
    const values = reading.events.filter(event => event.k === 'count').map(event => (event.body as { readonly value: number }).value)
    assert.equal(values.length, 2500)
    assert.deepEqual([values[0], values.at(-1)], [0, 2499], 'the head the queue would have dropped is in the file')
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a real subprocess records one rules.check and exits before the microtask flush would run', { timeout: 60_000 }, async () => {
  const root = repository()
  try {
    const library = pathToFileURL(resolve(import.meta.dirname, '..', 'src', 'metrics', 'library.ts')).href
    const script = [
      `const { appendEvents } = await import(${JSON.stringify(library)})`,
      `const result = await appendEvents(process.argv[1], [{ k: 'rules.check', by: 'rules', body: { effect: 'allow', exitCode: 0, rules: ['r1'], peakMode: { level: 'none', origin: 'default' }, glmPeakSource: 'absent', unknownSignals: [], caller: 'library' } }])`,
      'if (result.written !== 3) process.exit(3)',
    ].join('\n')
    const file = join(root, 'child.mjs')
    writeFileSync(file, script)
    await run(process.execPath, ['--experimental-strip-types', '--no-warnings', file, root])
    const reading = await readLog(root)
    assert.deepEqual(reading.events.map(event => event.k).sort(), ['rules.check', 'start', 'stop'], 'the event survived the process exit')
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})
