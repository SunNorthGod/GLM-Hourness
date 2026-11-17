/**
 * The rules board's timing journal (docs/ORCHESTRATION.md §16.16, decision
 * d-timeout-measured): the seconds a run counts for, the recent runs a value
 * is computed from, the value line per source class (estimate with its
 * session, the named runs, the ceiling), both clamps, the timeout record of
 * what the call was treated as, the tidy, and the batch landing
 * (`recordScriptRuns`): runs in, value only when it changed, a measured value
 * held at the ceiling told to the main agent once, a pinned timeout never
 * maintained. A journal that cannot be read never changes a verdict and
 * never throws.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadState } from '../src/rules/store.ts'
import { parseTiming, recentRunsOf, recordEstimate, recordScriptRuns, runSecondsOf, tidiedTimingLines, timingOf, valueLineFor, type EstimateLine, type ScriptTimingLine, type ValueLine } from '../src/rules/timing.ts'
import { clockedTest, type ClockedProject } from './rules-helpers.ts'

const AT = '2026-11-18T08:00:00.000Z'

test('a run counts whole seconds, rounded up; junk counts none', () => {
  assert.deepEqual([0, 4000, 4500, 1, Number.NaN, -5].map(runSecondsOf), [0, 4, 5, 1, 0, 0])
})

test('the recent runs of one rule are its own, the last ten, oldest first', () => {
  const lines: ScriptTimingLine[] = [
    { kind: 'run', at: AT, rule: 'r-a', run: 'rr-1', ms: 1200, outcome: 'allow' },
    { kind: 'run', at: AT, rule: 'r-b', run: 'rr-2', ms: 3000, outcome: 'allow' },
    ...Array.from({ length: 12 }, (_, index): ScriptTimingLine => ({ kind: 'run', at: AT, rule: 'r-a', run: `rr-${index + 3}`, ms: 1000 * (index + 1), outcome: 'allow' })),
  ]
  const runs = recentRunsOf(lines, 'r-a')
  assert.equal(runs.length, 10)
  assert.deepEqual(runs[0], { runId: 'rr-5', seconds: 3 })
  assert.deepEqual(runs[9], { runId: 'rr-14', seconds: 12 })
  assert.equal(recentRunsOf(lines, 'r-elsewhere').length, 0)
})

test('the value line of an estimate: three times it, the proposing session in the source, the old value along', () => {
  const estimates: ScriptTimingLine[] = [{ kind: 'estimate', at: AT, rule: 'r-a', seconds: 4, session: 's-writer' }]
  const made = valueLineFor({ rule: 'r-a', estimate: 4, recent: [], last: undefined, estimates, at: AT })
  assert.deepEqual(made.decision, { seconds: 12, source: 'estimate', capped: false })
  assert.deepEqual(made.line, { kind: 'value', at: AT, rule: 'r-a', seconds: 12, source: { by: 'estimate', estimateS: 4, session: 's-writer' } })
  const next = valueLineFor({ rule: 'r-a', estimate: 4, recent: [], last: made.line, estimates, at: AT })
  assert.equal(next.line, undefined, 'an unchanged value writes no line')
  const changed = valueLineFor({ rule: 'r-a', estimate: 6, recent: [], last: made.line, estimates: [], at: AT })
  assert.deepEqual(changed.line, { kind: 'value', at: AT, rule: 'r-a', seconds: 18, previousSeconds: 12, source: { by: 'estimate', estimateS: 6 } })
})

test('the value line of runs: the named runs, the slowest, the factor; the floor and the ceiling both hold', () => {
  const made = valueLineFor({ rule: 'r-a', recent: [{ runId: 'rr-1', seconds: 3 }, { runId: 'rr-2', seconds: 5 }], last: undefined, estimates: [], at: AT })
  assert.deepEqual(made.line?.source, { by: 'runs', runIds: ['rr-1', 'rr-2'], seconds: 5, factor: 3 })
  assert.equal(made.line?.seconds, 15)
  const floored = valueLineFor({ rule: 'r-a', recent: [{ runId: 'rr-1', seconds: 0.2 }], last: undefined, estimates: [], at: AT })
  assert.equal(floored.line?.seconds, 1, 'three times a fifth of a second is under the floor, which is 1 second on a gate')
  assert.equal(floored.line?.capped, undefined)
  const capped = valueLineFor({ rule: 'r-a', recent: [{ runId: 'rr-1', seconds: 11 }], last: { kind: 'value', at: AT, rule: 'r-a', seconds: 12, source: { by: 'estimate', estimateS: 4 } }, estimates: [], at: AT })
  assert.deepEqual(capped.line, {
    kind: 'value', at: AT, rule: 'r-a', seconds: 30, previousSeconds: 12,
    capped: { wantedSeconds: 33 }, source: { by: 'runs', runIds: ['rr-1'], seconds: 11, factor: 3 },
  })
  const ceiling = valueLineFor({ rule: 'r-a', recent: [], last: undefined, estimates: [], at: AT })
  assert.deepEqual(ceiling.line, { kind: 'value', at: AT, rule: 'r-a', seconds: 30, source: { by: 'ceiling' } })
})

test('the tidy keeps, per rule, the last runs, values, timeouts and estimates', () => {
  const run = (rule: string, runId: string): ScriptTimingLine => ({ kind: 'run', at: AT, rule, run: runId, ms: 1000, outcome: 'allow' })
  const lines: ScriptTimingLine[] = [
    ...Array.from({ length: 12 }, (_, index) => run('r-a', `rr-${index}`)),
    run('r-b', 'rr-x'),
    { kind: 'value', at: AT, rule: 'r-a', seconds: 3, source: { by: 'ceiling' } },
  ]
  const tidy = tidiedTimingLines(lines)
  assert.equal(tidy.filter(line => line.kind === 'run' && line.rule === 'r-a').length, 10)
  assert.equal(tidy.filter(line => line.kind === 'run' && line.rule === 'r-b').length, 1)
  assert.equal(tidy.filter(line => line.kind === 'value').length, 1)
})

test('a journal of unreadable lines is counted and skipped, and its kind of line is still parsed', () => {
  const book = parseTiming(`${JSON.stringify({ kind: 'estimate', at: AT, rule: 'r-a', seconds: 4 })}\nnot json\n{"kind":"nope"}\n`)
  assert.equal(book.lines.length, 1)
  assert.equal(book.bad, 2)
})

const factsOf = (over: Record<string, { readonly estimate?: number, readonly pinned?: boolean }> = {}) =>
  (rule: string): { readonly pinned: boolean, readonly estimate?: number } | undefined => {
    const fact = over[rule]
    if (fact === undefined) return undefined
    return { pinned: fact.pinned === true, ...(fact.estimate === undefined ? {} : { estimate: fact.estimate }) }
  }

const journalOf = async (project: ClockedProject): Promise<ScriptTimingLine[]> => {
  const text = await readFile(join(project.root, '.llm', 'rules', 'timing.jsonl'), 'utf8').catch(() => '')
  return text.split('\n').filter(line => line !== '').map(line => JSON.parse(line) as ScriptTimingLine)
}

clockedTest('a batch lands its runs, the timeout records, and value lines only for unpinned rules that ran', async (project) => {
  const now = new Date(project.clock.now())
  const problems = await recordScriptRuns({
    root: project.root,
    facts: factsOf({ 'r-a': { estimate: 4 }, 'r-b': { pinned: true } }),
    runs: [
      { rule: 'r-a', run: 'rr-1', outcome: 'allow', ms: 4000, limitSeconds: 12 },
      { rule: 'r-a', run: 'rr-2', outcome: 'timeout', ms: 5000, limitSeconds: 5, onError: 'allow' },
      { rule: 'r-b', run: 'rr-3', outcome: 'allow', ms: 100, limitSeconds: 5 },
    ],
    now,
  })
  assert.deepEqual(problems, [])
  let lines = await journalOf(project)
  assert.deepEqual(lines.filter(line => line.kind === 'run').map(line => (line as { run: string }).run), ['rr-1', 'rr-2', 'rr-3'])
  const timeout = lines.find((line): line is Extract<ScriptTimingLine, { kind: 'timeout' }> => line.kind === 'timeout')
  assert.deepEqual(timeout, { kind: 'timeout', at: now.toISOString(), rule: 'r-a', limitSeconds: 5, elapsedSeconds: 5, outcome: 'allowed' })
  let values = lines.filter((line): line is ValueLine => line.kind === 'value')
  assert.deepEqual(values.map(line => line.rule), ['r-a'], 'a pinned rule keeps its own timeout: no value line')
  assert.deepEqual(values[0]?.source, { by: 'runs', runIds: ['rr-1', 'rr-2'], seconds: 5, factor: 3 })
  assert.equal(values[0]?.seconds, 15)

  // A second batch whose slowest run is the same: the value stands, no line.
  const again = await recordScriptRuns({
    root: project.root,
    facts: factsOf({ 'r-a': { estimate: 4 } }),
    runs: [{ rule: 'r-a', run: 'rr-4', outcome: 'allow', ms: 3000, limitSeconds: 15 }],
    now,
  })
  assert.deepEqual(again, [])
  lines = await journalOf(project)
  assert.equal(lines.filter(line => line.kind === 'value').length, 1)
})

clockedTest('a measured value held at the ceiling writes the capped line and tells the main agent once', async (project) => {
  await recordEstimate(project.root, { at: project.clock.iso(), rule: 'r-slow', seconds: 4, session: 's-writer' })
  const now = new Date(project.clock.now())
  await recordScriptRuns({
    root: project.root,
    facts: factsOf({ 'r-slow': { estimate: 4 } }),
    runs: [{ rule: 'r-slow', run: 'rr-1', outcome: 'allow', ms: 11000, limitSeconds: 12 }],
    now,
  })
  const lines = await journalOf(project)
  const value = lines.find((line): line is ValueLine => line.kind === 'value')
  assert.deepEqual(value, {
    kind: 'value', at: now.toISOString(), rule: 'r-slow', seconds: 30, capped: { wantedSeconds: 33 },
    source: { by: 'runs', runIds: ['rr-1'], seconds: 11, factor: 3 },
  }, 'the estimate yielded to the measured run, and the ceiling held the value')
  const state = loadState(project.paths).state
  const notices = Object.values(state.notices ?? {})
  assert.equal(notices.length, 1)
  assert.equal(notices[0]?.kind, 'timeout-capped')
  assert.match(notices[0]?.text ?? '', /Rule r-slow's script ran its slowest of the last 1 recorded runs in 11 s/)
  assert.match(notices[0]?.text ?? '', /stays at 30 s/)
})

clockedTest('an estimate line rides with the value it seeds, and a corrupt journal still lands the batch', async (project) => {
  const problem = await recordEstimate(project.root, { at: project.clock.iso(), rule: 'r-a', seconds: 4, session: 's-9abc' })
  assert.equal(problem, undefined)
  // A line nothing could read sits in the file; the batch goes on all the same.
  await mkdir(join(project.root, '.llm', 'rules'), { recursive: true })
  await appendFile(join(project.root, '.llm', 'rules', 'timing.jsonl'), 'not a line\n', 'utf8')
  const problems = await recordScriptRuns({
    root: project.root,
    facts: factsOf({ 'r-a': { estimate: 4 } }),
    runs: [{ rule: 'r-a', run: 'rr-1', outcome: 'allow', ms: 4000, limitSeconds: 12 }],
    now: new Date(project.clock.now()),
  })
  assert.deepEqual(problems, [])
  const lines = await journalOf(project)
  assert.equal(lines.some(line => line.kind === 'run'), true)
  const value = lines.find((line): line is ValueLine => line.kind === 'value')
  assert.deepEqual(value?.source, { by: 'runs', runIds: ['rr-1'], seconds: 4, factor: 3 })
})

test('the journal reads into the map the judge fills timeouts from', async () => {
  const root = await mkdtemp(join(tmpdir(), 'timing-'))
  try {
    const file = join(root, '.llm', 'rules', 'timing.jsonl')
    await mkdir(join(root, '.llm', 'rules'), { recursive: true })
    const estimate: EstimateLine = { kind: 'estimate', at: AT, rule: 'r-a', seconds: 4, session: 's-writer' }
    await writeFile(file, [
      JSON.stringify(estimate),
      ...Array.from({ length: 12 }, (_, index) => JSON.stringify({ kind: 'run', at: AT, rule: 'r-a', run: `rr-${index}`, ms: 1000 + index, outcome: 'allow' })),
      'garbage',
      '',
    ].join('\n'), 'utf8')
    const timing = timingOf(root)
    assert.equal(timing.get('r-a')?.length, 10)
    assert.deepEqual(timing.get('r-a')?.[0], { runId: 'rr-2', seconds: 2 })
    assert.equal(timing.get('r-elsewhere'), undefined)
    assert.equal(timingOf(join(root, 'nowhere')).size, 0, 'a journal that cannot be read is an empty map')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})
