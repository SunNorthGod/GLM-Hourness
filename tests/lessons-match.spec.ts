/**
 * Finding the lessons that fit and the text they become (M5 design §4.3 to
 * §4.6): globs and how two paths meet, commands at the command position,
 * the lessons a brief carries (at least two points, a tool alone is noise),
 * the lessons a failure matches (normalised fragments, the longest first,
 * two at most, none shown twice), what `lessons_query` returns, the lessons
 * that keep coming back (three sessions in 28 days, two reminders a week),
 * and the lines, notices and limits of the text. The clock is a parameter;
 * states are built directly so that these tests do not depend on the fold.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BRIEF_MIN_SCORE, RECUR_WEEKLY_CAP, commandMatches, dueRecurrences, globMatch, literalPrefix, matchFailure, normalizeFailure, pathsMeet, queryLessons, recentSessions, relevant,
} from '../src/lessons/match.ts'
import { emptyLessons, type Candidate, type Lesson, type LessonsState, type Situation, type Touch } from '../src/lessons/model.ts'
import { BRIEF_LINE_MAX, FAILURE_LINE_MAX, briefEntry, briefLine, candidateNotice, failureNotice, recurNotice, whenOf } from '../src/lessons/render.ts'

/** A Wednesday: the calendar week of the reminders began on Monday 2026-11-02. */
const NOW = '2026-11-04T10:00:00.000Z'
const day = (days: number): string => new Date(Date.parse(NOW) + days * 86_400_000).toISOString()

// --- Building states ----------------------------------------------------------------------

interface LessonSpec {
  readonly id: string
  readonly situation?: Partial<Situation>
  readonly pitfall?: string
  readonly fix?: string
  readonly status?: Lesson['status']
  readonly lastConfirmed?: string
}

const lessonOf = (spec: LessonSpec): Lesson => ({
  id: spec.id,
  status: spec.status ?? 'active',
  situation: { files: [], tools: [], commands: [], errors: [], ...spec.situation },
  pitfall: spec.pitfall ?? `Pitfall of ${spec.id}`,
  fix: spec.fix ?? `Fix of ${spec.id}`,
  evidence: ['docs/DEVELOPMENT.md §7'],
  created: day(-60),
  lastConfirmed: spec.lastConfirmed ?? day(-10),
  confirmations: 1,
  origin: { actor: 'llm' },
  mergedFrom: [],
})

interface CandidateSpec {
  readonly id: string
  readonly situation?: Partial<Situation>
  readonly pitfall?: string
  readonly fix?: string
  readonly evidence?: readonly string[]
  readonly at?: string
  readonly status?: Candidate['status']
}

const candidateOf = (spec: CandidateSpec): Candidate => ({
  id: spec.id,
  situation: { files: [], tools: [], commands: [], errors: [], ...spec.situation },
  pitfall: spec.pitfall ?? `Candidate pitfall of ${spec.id}`,
  fix: spec.fix ?? `Candidate fix of ${spec.id}`,
  evidence: spec.evidence ?? ['task:task-3', 'session:child-1'],
  at: spec.at ?? day(-1),
  status: spec.status ?? 'open',
  signature: spec.id,
})

interface Extras {
  readonly candidates?: readonly Candidate[]
  /** Per lesson id, the sessions it touched and how many days ago. */
  readonly touches?: Readonly<Record<string, ReadonlyArray<readonly [session: string, daysAgo: number, kind?: Touch['kind']]>>>
  /** Per lesson id, the days ago a recurrence reminder was recorded. */
  readonly recurrences?: Readonly<Record<string, readonly number[]>>
}

function stateOf(lessons: readonly Lesson[], extras: Extras = {}): LessonsState {
  return {
    ...emptyLessons(),
    lessons: new Map(lessons.map(lesson => [lesson.id, lesson])),
    candidates: new Map((extras.candidates ?? []).map(candidate => [candidate.id, candidate])),
    touches: new Map(Object.entries(extras.touches ?? {}).map(([id, list]) => [id, list.map(([session, ago, kind]) => ({ at: day(-ago), session, kind: kind ?? 'hit' }))])),
    recurrences: new Map(Object.entries(extras.recurrences ?? {}).map(([id, list]) => [id, list.map(ago => day(-ago))])),
  }
}

// --- Globs and paths ----------------------------------------------------------------------------

test('a glob: * stays inside a directory, ** crosses directories, **/ may be no directory at all, ? is one character, the rest is literal', () => {
  const cases: ReadonlyArray<readonly [string, string, boolean]> = [
    ['docs/graph/**', 'docs/graph/x.json', true],
    ['docs/graph/**', 'docs/graph/nodes/x.json', true],
    ['docs/graph/**', 'docs/graph', false],
    ['docs/graph/**', 'docs/graphs/x.json', false],
    ['*.ts', 'a.ts', true],
    ['*.ts', 'src/a.ts', false],
    ['src/*/index.ts', 'src/memory/index.ts', true],
    ['src/*/index.ts', 'src/a/b/index.ts', false],
    ['**/*state*.json', 'state.json', true],
    ['**/*state*.json', 'a/b/my-state-1.json', true],
    ['**/*state*.json', 'a/b/other.json', false],
    ['src/**/x.ts', 'src/x.ts', true],
    ['src/**/x.ts', 'src/a/b/x.ts', true],
    ['src/**/x.ts', 'src/ax.ts', false],
    ['a?c', 'abc', true],
    ['a?c', 'a/c', false],
    ['a?c', 'ac', false],
    ['a.b+c(1)', 'a.b+c(1)', true],
    ['a.b', 'axb', false],
    ['**', 'a/b/c', true],
    ['**', '', true],
    ['a***b', 'a/x/b', true],
    ['', '', true],
    ['', 'a', false],
  ]
  for (const [pattern, path, expected] of cases) assert.equal(globMatch(pattern, path), expected, `${pattern} on ${path}`)
})

test('a glob is case sensitive unless asked; a path past 1024 characters meets nothing; a pattern of many stars cannot make the matcher run away', () => {
  assert.equal(globMatch('Docs/Graph/**', 'docs/graph/x.json'), false)
  assert.equal(globMatch('Docs/Graph/**', 'docs/graph/x.json', true), true)
  assert.equal(globMatch('**', 'a'.repeat(1025)), false)
  assert.equal(globMatch('**', 'a'.repeat(1024)), true)
  const started = Date.now()
  assert.equal(globMatch('*a*a*a*a*a*a*a*a*a*a*a*a*b', 'a'.repeat(900)), false)
  assert.equal(globMatch('**/**/**/**/**/**/**/**/*a*a*a*a*a*b', `${'a/'.repeat(300)}a`), false)
  assert.ok(Date.now() - started < 3000, 'finished in a few seconds')
})

test('the literal prefix is what comes before the first wildcard, or the whole path', () => {
  assert.equal(literalPrefix('docs/graph/**'), 'docs/graph/')
  assert.equal(literalPrefix('src/*/index.ts'), 'src/')
  assert.equal(literalPrefix('**/*state*.json'), '')
  assert.equal(literalPrefix('src/a?.ts'), 'src/a')
  assert.equal(literalPrefix('src/a.ts'), 'src/a.ts')
})

test('two paths meet by the three rules of the design, for a pattern against a path or against another wildcard path', () => {
  const cases: ReadonlyArray<readonly [string, string, boolean, string]> = [
    ['docs/graph/**', 'docs/graph/**', true, 'rule 3: both prefixes are docs/graph/'],
    ['docs/graph/**', 'docs/graph/nodes/x.json', true, 'rule 1'],
    ['docs/graph/**', 'docs/graph/nodes/**', true, 'rule 2: the pattern matches the prefix docs/graph/nodes/'],
    ['src/*/index.ts', 'src/memory/**', true, 'rule 3: src/ starts src/memory/'],
    ['**/*state*.json', 'src/**', false, 'a pattern with no prefix meets only what it matches'],
    ['**/*state*.json', '.agents/tasks/x/state.json', true, 'rule 1'],
    ['**/*state*.json', '**', false, 'an empty prefix on the task side is not everything either'],
    ['docs/graphs/**', 'docs/graph/**', false, 'no prefix relation'],
    ['docs/graph/*.json', 'docs/graph/nodes/x.json', false, 'a literal task path is not met by prefix'],
    ['src/a.ts', 'src/a.tsx', false, 'two literal paths are the same or they are not'],
    ['src/a.ts', 'src/a.ts', true, 'the same file'],
    ['src/a.ts', 'src/**', true, 'a literal pattern inside a task scope'],
    ['src/a', 'src/a/**', true, 'a directory named by a pattern, written in the scope below it'],
    ['src/gu*', 'src/guard/**', true, 'the wildcard follows the other prefix'],
    ['docs/*', 'docs/graph/**', true, 'rule 3: docs/ starts docs/graph/'],
    ['.\\docs\\graph\\**', 'docs/graph/x.json', true, 'a pattern is read with forward slashes'],
    ['docs/graph/**', '.\\docs\\graph\\x.json', true, 'a task path too, without the leading .\\'],
  ]
  for (const [pattern, path, expected, why] of cases) assert.equal(pathsMeet(pattern, path), expected, `${pattern} and ${path}: ${why}`)
  assert.equal(pathsMeet('Docs/Graph/**', 'docs/graph/x.json'), false)
  assert.equal(pathsMeet('Docs/Graph/**', 'docs/graph/x.json', true), true)
  assert.equal(pathsMeet('Src/*/Index.ts', 'src/memory/**'), false)
  assert.equal(pathsMeet('Src/*/Index.ts', 'src/memory/**', true), true, 'rule 3 folds the case too')
})

// --- Commands --------------------------------------------------------------------------------------

test('a lesson\'s command matches at the command position, by whole words, in any case', () => {
  const cases: ReadonlyArray<readonly [string, string, boolean]> = [
    ['Get-Content', 'Get-Content f.json', true],
    ['Get-Content', 'get-content f.json | Select-Object -First 1', true],
    ['Get-Content', 'dir | Get-Content x', true],
    ['Get-Content', 'cd src; Get-Content x', true],
    ['Get-Content', 'build && Get-Content x', true],
    ['Get-Content', 'build || Get-Content x', true],
    ['Get-Content', '(Get-Content x).Length', true],
    ['Get-Content', 'ForEach-Object { Get-Content $_ }', true],
    ['Get-Content', 'line one\nGet-Content x', true],
    ['Get-Content', '& "Get-Content" x', true],
    ['Get-Content', 'echo Get-Content', false],
    ['Get-Content', 'Get-ContentX f', false],
    ['Get-Content', 'echo "a; Get-Content x"', false],
    ['Get-Content', 'echo \'a | Get-Content x\'', false],
    ['npm run probe', 'npm run probe -- --scenario glm', true],
    ['npm run probe', 'npm  run   probe', true],
    ['npm run probe', 'npm run probe2', false],
    ['npm run probe', 'npm run', false],
    ['npm run probe', 'cd .. && npm run probe', true],
    ['npm', 'npm test', true],
    ['git commit', 'git commit -m "fix"', true],
    ['git commit', 'git status && git commit -m x', true],
    ['git commit', 'git add . ; git push', false],
  ]
  for (const [lesson, line, expected] of cases) assert.equal(commandMatches(lesson, line), expected, `${lesson} in ${JSON.stringify(line)}`)
})

// --- A brief ------------------------------------------------------------------------------------------

const BRIEF_LESSONS = [
  lessonOf({ id: 'L-000001', situation: { files: ['docs/graph/**'] }, lastConfirmed: day(-10) }),
  lessonOf({ id: 'L-000002', situation: { commands: ['Get-Content'] } }),
  lessonOf({ id: 'L-000003', situation: { tools: ['pwsh'] } }),
  lessonOf({ id: 'L-000004', situation: { tools: ['pwsh'], commands: ['npm run probe'] }, lastConfirmed: day(-1) }),
  lessonOf({ id: 'L-000005', situation: { files: ['src/**'], commands: ['Get-Content'] } }),
  lessonOf({ id: 'L-000006', situation: { files: ['docs/graph/**'] }, status: 'retired' }),
  lessonOf({ id: 'L-000007', situation: { files: ['docs/graph/**'] }, status: 'deleted' }),
]
const BRIEF_STATE = stateOf(BRIEF_LESSONS, {
  touches: { 'L-000005': [['s1', 2], ['s2', 5]], 'L-000002': [['s1', 40], ['s2', 41], ['s3', 42]] },
})
const TASK = { paths: ['docs/graph/**'], tools: ['pwsh'], commands: ['Get-Content a.json | Select-Object -First 1', 'npm run probe'] }

test('a brief carries active lessons that score at least 2: a file is 3, a command 2, a tool 1; a tool alone is left out', () => {
  assert.equal(BRIEF_MIN_SCORE, 2)
  const scored = relevant(BRIEF_STATE, TASK, NOW)
  assert.deepEqual(scored.map(item => [item.lesson.id, item.score]), [['L-000004', 3], ['L-000001', 3], ['L-000005', 2], ['L-000002', 2]])
  assert.deepEqual(relevant(BRIEF_STATE, { paths: [], tools: ['pwsh'], commands: [] }, NOW), [], 'one point is not enough')
  assert.deepEqual(relevant(BRIEF_STATE, { paths: [], tools: ['PWSH'], commands: ['npm run probe'] }, NOW).map(item => [item.lesson.id, item.score]), [['L-000004', 3]], 'a tool is matched in any case')
  assert.deepEqual(relevant(BRIEF_STATE, { paths: [], tools: [], commands: ['Get-Content x'] }, NOW).map(item => item.lesson.id), ['L-000005', 'L-000002'], 'a command alone is exactly 2; L-000005 matched in two sessions lately')
  assert.deepEqual(relevant(emptyLessons(), TASK, NOW), [])
})

test('equal scores go to the lesson that matched in more sessions in the last 28 days, then to the one confirmed last', () => {
  const scored = relevant(BRIEF_STATE, TASK, NOW)
  assert.deepEqual(scored.map(item => item.lesson.id), ['L-000004', 'L-000001', 'L-000005', 'L-000002'])
  assert.deepEqual(scored.map(item => item.sessions), [0, 0, 2, 0], 'the sessions of L-000002 are 40 days old')
  assert.equal(recentSessions(BRIEF_STATE, 'L-000002', NOW), 0)
  assert.equal(recentSessions(BRIEF_STATE, 'L-000005', NOW), 2)
  assert.equal(recentSessions(BRIEF_STATE, 'L-000001', NOW), 0)
})

test('the limit is clamped to 1 to 10 and is 5 when absent; the query lists are cut at 50 items', () => {
  const many = stateOf(Array.from({ length: 12 }, (_, index) => lessonOf({ id: `L-0000${(index + 10).toString(16).padStart(2, '0')}`, situation: { files: ['src/**'] } })))
  const task = { paths: ['src/a.ts'], tools: [], commands: [] }
  assert.equal(relevant(many, task, NOW).length, 5)
  assert.equal(relevant(many, { ...task, limit: 0 }, NOW).length, 1)
  assert.equal(relevant(many, { ...task, limit: 99 }, NOW).length, 10)
  assert.equal(relevant(many, { ...task, limit: 3.9 }, NOW).length, 3)
  assert.equal(relevant(many, { ...task, limit: Number.NaN }, NOW).length, 5)
  const late = { paths: [...Array.from({ length: 50 }, (_, index) => `other/${index}.ts`), 'src/a.ts'], tools: [], commands: [] }
  assert.deepEqual(relevant(many, late, NOW), [], 'the 51st path is not looked at')
})

test('a brief line is the id, the situation, the pitfall and the fix; it never passes 300 characters and the fix is cut first, then the situation, then the pitfall', () => {
  const short = lessonOf({ id: 'L-3f9a2c', situation: { files: ['src/guard/**'], commands: ['Get-Content'] }, pitfall: 'Get-Content garbles Chinese text', fix: 'Pass -Encoding utf8.' })
  assert.equal(briefLine(short), 'L-3f9a2c: when files src/guard/**; commands Get-Content → Get-Content garbles Chinese text → Pass -Encoding utf8.')
  assert.deepEqual(briefEntry(short), { id: 'L-3f9a2c', when: 'files src/guard/**; commands Get-Content', problem: 'Get-Content garbles Chinese text', fix: 'Pass -Encoding utf8.', line: briefLine(short) })

  const longFix = lessonOf({ id: 'L-3f9a2c', situation: { files: ['src/guard/**'] }, pitfall: 'A'.repeat(100), fix: 'f'.repeat(600) })
  const cutFix = briefLine(longFix)
  assert.equal(cutFix.length, BRIEF_LINE_MAX)
  assert.ok(cutFix.includes('A'.repeat(100)) && cutFix.includes('when files src/guard/**'), 'the pitfall and the situation are whole')
  assert.ok(cutFix.endsWith('…'))

  const longWhen = lessonOf({ id: 'L-3f9a2c', situation: { files: Array.from({ length: 20 }, (_, index) => `packages/long/directory/name-${index}/**`) }, pitfall: 'B'.repeat(200), fix: 'f'.repeat(600) })
  const cutWhen = briefLine(longWhen)
  assert.equal(cutWhen.length, BRIEF_LINE_MAX)
  assert.ok(cutWhen.includes('B'.repeat(200)), 'the pitfall is whole')
  assert.ok(cutWhen.endsWith(' → …'), 'the fix is gone and only its mark is left')

  const longPitfall = lessonOf({ id: 'L-3f9a2c', situation: { files: Array.from({ length: 20 }, (_, index) => `packages/long/directory/name-${index}/**`) }, pitfall: 'C'.repeat(300), fix: 'f'.repeat(600) })
  const cutPitfall = briefLine(longPitfall)
  assert.ok(cutPitfall.length <= BRIEF_LINE_MAX)
  assert.ok(cutPitfall.startsWith('L-3f9a2c: when '))
  assert.ok(cutPitfall.includes(' → '))

  const lines = lessonOf({ id: 'L-3f9a2c', situation: { commands: ['x'] }, pitfall: 'p', fix: 'first line\n\n  second   line' })
  assert.equal(briefLine(lines), 'L-3f9a2c: when commands x → p → first line second line', 'a fix of several lines is one line')
})

test('cutting a line does not leave half of a surrogate pair', () => {
  const emoji = '😀'
  const lesson = lessonOf({ id: 'L-3f9a2c', situation: { commands: ['x'] }, pitfall: 'p', fix: emoji.repeat(400) })
  const line = briefLine(lesson)
  assert.ok(line.length <= BRIEF_LINE_MAX)
  assert.ok(!/[\uD800-\uDBFF]…$/.test(line))
  assert.ok(!/[\uD800-\uDBFF]$/.test(line))
})

test('the situation reads as files, tools, commands and errors in that order, an error in quotes', () => {
  assert.equal(whenOf({ files: ['a/**', 'b.ts'], tools: ['pwsh'], commands: ['npm test'], errors: ['EMFILE: too many open files', 'ENOSPC: no space'] }), 'files a/**, b.ts; tools pwsh; commands npm test; errors "EMFILE: too many open files", "ENOSPC: no space"')
  assert.equal(whenOf({ files: [], tools: [], commands: ['x'], errors: [] }), 'commands x')
})

// --- A failure ----------------------------------------------------------------------------------------------

const ESC = String.fromCharCode(27)
const FAILURE_LESSONS = [
  lessonOf({ id: 'L-0000a1', situation: { errors: ['EMFILE: too many open files'] }, pitfall: 'resize-batch opens every source image at once', fix: 'Run it with --chunk 200' }),
  lessonOf({ id: 'L-0000b2', situation: { commands: ['Get-Content'] }, pitfall: 'Get-Content without -Encoding garbled the Chinese text', fix: 'Pass -Encoding utf8 with Windows PowerShell 5.1' }),
  lessonOf({ id: 'L-0000c3', situation: { errors: ['dsh : The term \'dsh\' is not recognized'] }, pitfall: 'dsh is not on PATH on the desktop install', fix: 'Run DSH through the Electron node mode' }),
]
const FAILURE_STATE = stateOf(FAILURE_LESSONS, { candidates: [candidateOf({ id: 'C-aaaaaa', situation: { errors: ['EMFILE: too many open files'] } })] })

test('the failure text is read without colour codes, in lower case, with its white space folded', () => {
  assert.equal(normalizeFailure(`${ESC}[31;1mEMFILE:${ESC}[0m   Too\n  Many\topen FILES`), 'emfile: too many open files')
  assert.equal(normalizeFailure(`${ESC}]0;window title${String.fromCharCode(7)}ok`), 'ok')
  assert.equal(normalizeFailure(`${ESC}]8;;http://x${ESC}\\link${ESC}]8;;${ESC}\\`), 'link')
})

test('a failure matches the lessons whose error fragment it contains, after normalising both', () => {
  const matches = matchFailure(FAILURE_STATE, `${ESC}[31;1mdsh : The term${ESC}[0m 'dsh' is not recognized as the name of a cmdlet`)
  assert.deepEqual(matches.map(match => [match.lesson.id, match.fragment]), [['L-0000c3', 'dsh : The term \'dsh\' is not recognized']])
  assert.deepEqual(matchFailure(FAILURE_STATE, 'Error: EMFILE:  TOO many\nopen files, open "a.png"').map(match => match.lesson.id), ['L-0000a1'])
  assert.deepEqual(matchFailure(FAILURE_STATE, 'Get-Content : encoding error'), [], 'a command is not an error fragment, and a candidate never matches')
  assert.deepEqual(matchFailure(FAILURE_STATE, 'everything went fine'), [])
  assert.deepEqual(matchFailure(emptyLessons(), 'EMFILE: too many open files'), [])
})

test('a retired or deleted lesson does not match; the longest fragment goes first, then the one confirmed last', () => {
  const state = stateOf([
    lessonOf({ id: 'L-000001', situation: { errors: ['cannot find module'] }, lastConfirmed: day(-5) }),
    lessonOf({ id: 'L-000002', situation: { errors: ['cannot find module \'left-pad\''] }, lastConfirmed: day(-9) }),
    lessonOf({ id: 'L-000003', situation: { errors: ['cannot find module'] }, lastConfirmed: day(-2) }),
    lessonOf({ id: 'L-000004', situation: { errors: ['cannot find module'] }, status: 'retired' }),
    lessonOf({ id: 'L-000005', situation: { errors: ['cannot find module'] }, status: 'deleted' }),
    lessonOf({ id: 'L-000006', situation: { errors: ['no such file or directory', 'cannot find module'] } }),
  ])
  const failure = 'Error: Cannot find module \'left-pad\' (also: no such file or directory)'
  assert.deepEqual(matchFailure(state, failure, { limit: 10 }).map(match => match.lesson.id), ['L-000002', 'L-000006', 'L-000003', 'L-000001'])
  assert.deepEqual(matchFailure(state, failure, { limit: 10 }).map(match => match.fragment.toLowerCase())[1], 'no such file or directory', 'a lesson with two fragments is judged by its longest match')
})

test('a fragment counts by its length with the colour codes read away: eight characters or more, or it matches nothing', () => {
  const marked = `${ESC}[31mfoo${ESC}[0m`
  assert.ok(marked.length >= 8, 'the write check sees twelve characters')
  const short = stateOf([lessonOf({ id: 'L-000001', situation: { errors: [marked] } })])
  assert.deepEqual(matchFailure(short, 'a foo happened'), [])
  assert.deepEqual(queryLessons(short, { error: 'a foo happened' }, NOW).lessons, [])
  const enough = stateOf([lessonOf({ id: 'L-000002', situation: { errors: [`${ESC}[31mfoo barz${ESC}[0m`] } })])
  assert.deepEqual(matchFailure(enough, 'a foo barz happened').map(match => match.lesson.id), ['L-000002'])
})

test('at most two lessons are returned; those already shown to the session are left out before the cut', () => {
  const state = stateOf(['L-000001', 'L-000002', 'L-000003', 'L-000004'].map((id, index) => lessonOf({ id, situation: { errors: [`${'x'.repeat(index)}shared failure text`] } })))
  const failure = 'xxxshared failure text'
  assert.deepEqual(matchFailure(state, failure).map(match => match.lesson.id), ['L-000004', 'L-000003'])
  assert.deepEqual(matchFailure(state, failure, { skip: new Set(['L-000004']) }).map(match => match.lesson.id), ['L-000003', 'L-000002'])
  assert.deepEqual(matchFailure(state, failure, { skip: new Set(['L-000004', 'L-000003', 'L-000002', 'L-000001']) }), [])
  assert.deepEqual(matchFailure(state, failure, { limit: 1 }).map(match => match.lesson.id), ['L-000004'])
})

test('the notice after a failure lists the lessons with the matched fragment, 400 characters a line, 1200 in all', () => {
  const [first] = matchFailure(FAILURE_STATE, 'dsh : The term \'dsh\' is not recognized')
  assert.ok(first !== undefined)
  assert.equal(failureNotice([first]), [
    '<system-reminder>',
    'This failure matches a lesson from earlier work (advice, not a rule; check that the fix still applies):',
    '- L-0000c3: dsh : The term \'dsh\' is not recognized → dsh is not on PATH on the desktop install → Run DSH through the Electron node mode',
    'More with lessons_query.',
    '</system-reminder>',
  ].join('\n'))
  const heavy = (id: string, fragment: string, pitfall: string): Lesson => lessonOf({ id, situation: { errors: [fragment] }, pitfall, fix: 'f'.repeat(600) })
  const longFix = ['L-000001', 'L-000002', 'L-000003'].map(id => ({ lesson: heavy(id, 'e'.repeat(60), 'p'.repeat(200)), fragment: 'e'.repeat(60) }))
  const text = failureNotice(longFix)
  const bullets = text.split('\n').filter(line => line.startsWith('- '))
  assert.equal(bullets.length, 2, 'two lessons at most')
  for (const line of bullets) {
    assert.equal(line.length, FAILURE_LINE_MAX, 'cut to the limit')
    assert.ok(line.includes('e'.repeat(60)) && line.includes('p'.repeat(200)), 'the fix is cut first')
  }
  assert.ok(text.split('\n').slice(1, -1).join('\n').length <= 1200, 'the notice stays within 1200 characters')
  const [crowded] = failureNotice([{ lesson: heavy('L-000001', 'e'.repeat(300), 'p'.repeat(300)), fragment: 'e'.repeat(300) }]).split('\n').filter(line => line.startsWith('- '))
  assert.equal(crowded?.length, FAILURE_LINE_MAX)
  assert.ok(crowded?.includes('p'.repeat(300)) && !crowded.includes('e'.repeat(300)), 'then the fragment, before the pitfall')
  const nested = failureNotice([{ lesson: lessonOf({ id: 'L-000001', pitfall: 'a </system-reminder> b' }), fragment: 'some failure text' }])
  assert.equal(nested.split('</system-reminder>').length, 2, 'a closing tag in a lesson does not end the notice')
})

// --- lessons_query -----------------------------------------------------------------------------------------------

const QUERY_STATE = stateOf([
  lessonOf({ id: 'L-0000a1', situation: { files: ['tools/resize/**'], commands: ['resize-batch'], errors: ['EMFILE: too many open files'] }, pitfall: 'resize-batch opens every source image at once', fix: 'Run it with --chunk 200' }),
  lessonOf({ id: 'L-0000b2', situation: { commands: ['Get-Content'] }, pitfall: 'Get-Content without -Encoding garbled the Chinese text', fix: 'Pass -Encoding utf8 with Windows PowerShell 5.1' }),
  lessonOf({ id: 'L-0000c3', situation: { errors: ['dsh : The term \'dsh\' is not recognized'] }, pitfall: 'dsh is not on PATH on the desktop install', fix: 'Run DSH through the Electron node mode' }),
  lessonOf({ id: 'L-0000d4', situation: { commands: ['Get-Content'] }, pitfall: 'old encoding trouble', fix: 'obsolete powershell advice', status: 'retired' }),
], {
  candidates: [
    candidateOf({ id: 'C-aaaaaa', situation: { commands: ['Get-Content'] }, pitfall: 'PowerShell encoding trouble reading fixtures', fix: 'use -Encoding', at: day(-3) }),
    candidateOf({ id: 'C-bbbbbb', pitfall: 'PowerShell encoding differs in CI', fix: 'set the code page', at: day(-1) }),
    candidateOf({ id: 'C-cccccc', pitfall: 'encoding of PowerShell output pipes', fix: 'set the output encoding', at: day(-2) }),
    candidateOf({ id: 'C-dddddd', pitfall: 'PowerShell encoding in merged', fix: 'x', status: 'merged' }),
  ],
})

test('text scores the keywords found in pitfall, fix and situation; candidates follow the lessons, newest first, at most two', () => {
  const result = queryLessons(QUERY_STATE, { text: 'PowerShell encoding' }, NOW)
  assert.deepEqual(result.lessons.map(item => [item.lesson.id, item.score]), [['L-0000b2', 2]])
  assert.deepEqual(result.candidates.map(item => [item.candidate.id, item.score]), [['C-bbbbbb', 2], ['C-cccccc', 2]])
  assert.equal(result.more, 1, 'the third candidate is left out')
  assert.deepEqual(queryLessons(QUERY_STATE, { text: 'PowerShell encoding', includeCandidates: false }, NOW).candidates, [])
  assert.equal(queryLessons(QUERY_STATE, { text: 'PowerShell encoding', includeCandidates: false }, NOW).more, 0)
  assert.deepEqual(queryLessons(QUERY_STATE, { text: 'obsolete' }, NOW).lessons, [], 'a retired lesson is out of reach')
  assert.deepEqual(queryLessons(QUERY_STATE, { text: 'merged' }, NOW).candidates, [], 'so is a candidate that is no longer open')
})

test('error scores a contained fragment 4 and, for two or more words shared with the pitfall, up to 3 more', () => {
  const exact = queryLessons(QUERY_STATE, { error: 'Error: EMFILE: too many open files, open \'x.png\'' }, NOW)
  assert.deepEqual(exact.lessons.map(item => [item.lesson.id, item.score]), [['L-0000a1', 4]])
  const coloured = queryLessons(QUERY_STATE, { error: `${ESC}[31mEMFILE: TOO MANY OPEN FILES${ESC}[0m` }, NOW)
  assert.deepEqual(coloured.lessons.map(item => item.lesson.id), ['L-0000a1'])
  const words = queryLessons(QUERY_STATE, { error: 'dsh is not recognized on the path' }, NOW)
  assert.deepEqual(words.lessons.map(item => [item.lesson.id, item.score]), [['L-0000c3', 3]], 'dsh, not, the, path are shared; three points at most')
  assert.deepEqual(queryLessons(QUERY_STATE, { error: 'dsh is gone' }, NOW).lessons, [], 'one shared word is not enough')
  assert.deepEqual(queryLessons(QUERY_STATE, { error: 'a quiet day' }, NOW).lessons, [])
})

test('file and command score as in a brief, and the conditions given add up', () => {
  assert.deepEqual(queryLessons(QUERY_STATE, { file: 'tools/resize/x.png' }, NOW).lessons.map(item => [item.lesson.id, item.score]), [['L-0000a1', 3]])
  assert.deepEqual(queryLessons(QUERY_STATE, { command: 'resize-batch --in photos' }, NOW).lessons.map(item => [item.lesson.id, item.score]), [['L-0000a1', 2]])
  assert.deepEqual(queryLessons(QUERY_STATE, { command: 'Get-Content x.json' }, NOW).candidates.map(item => item.candidate.id), ['C-aaaaaa'])
  const all = queryLessons(QUERY_STATE, { file: 'tools/resize/x.png', command: 'resize-batch', error: 'EMFILE: too many open files', text: 'resize' }, NOW)
  assert.deepEqual(all.lessons.map(item => [item.lesson.id, item.score]), [['L-0000a1', 3 + 2 + 4 + 1]])
  assert.deepEqual(queryLessons(QUERY_STATE, { file: 'TOOLS/resize/x.png' }, NOW).lessons, [], 'case matters unless asked')
  assert.equal(queryLessons(QUERY_STATE, { file: 'TOOLS/resize/x.png', ignoreCase: true }, NOW).lessons.length, 1)
  assert.deepEqual(queryLessons(QUERY_STATE, {}, NOW), { lessons: [], candidates: [], more: 0 }, 'no condition, no result')
})

test('the limit cuts the lessons and counts what it left out', () => {
  const state = stateOf(Array.from({ length: 4 }, (_, index) => lessonOf({ id: `L-00000${index}`, pitfall: 'shared keyword here' })))
  const result = queryLessons(state, { text: 'keyword', limit: 3 }, NOW)
  assert.deepEqual(result.lessons.map(item => item.lesson.id), ['L-000000', 'L-000001', 'L-000002'])
  assert.equal(result.more, 1)
  assert.equal(queryLessons(state, { text: 'keyword' }, NOW).more, 0)
  assert.equal(queryLessons(state, { text: 'keyword', limit: 0 }, NOW).lessons.length, 1)
})

// --- Lessons that keep coming back ----------------------------------------------------------------------------------

const RECUR_LESSONS = ['L-000001', 'L-000002', 'L-000003', 'L-000004'].map(id => lessonOf({ id }))

test('a lesson that touched three different sessions in the last 28 days is due; two sessions, one session three times, or old sessions are not', () => {
  const due = (touches: Extras['touches'], extras: Omit<Extras, 'touches'> = {}) => dueRecurrences(stateOf(RECUR_LESSONS, { ...extras, ...(touches === undefined ? {} : { touches }) }), NOW).map(item => [item.lesson.id, item.sessions])
  assert.deepEqual(due({ 'L-000001': [['a', 1], ['b', 2], ['c', 3]] }), [['L-000001', 3]])
  assert.deepEqual(due({ 'L-000001': [['a', 1], ['b', 2]] }), [])
  assert.deepEqual(due({ 'L-000001': [['a', 1], ['a', 2], ['a', 3]] }), [])
  assert.deepEqual(due({ 'L-000001': [['a', 1], ['b', 2], ['c', 29]] }), [], 'the third session is 29 days old')
  assert.deepEqual(due({ 'L-000001': [['a', 1], ['b', 2], ['c', 27]] }), [['L-000001', 3]], 'and at 27 days it counts')
  assert.deepEqual(due({ 'L-000001': [['a', 1, 'hit'], ['b', 2, 'into'], ['c', 3, 'hit'], ['b', 4, 'hit']] }), [['L-000001', 3]], 'a merge counts as a session, a session counts once')
  assert.deepEqual(due({ 'L-000001': [['a', 1], ['b', 2], ['c', 3]], 'L-000002': [['a', 1], ['b', 2], ['c', 3], ['d', 4]] }), [['L-000002', 4], ['L-000001', 3]], 'most sessions first')
})

test('a reminder in the last 28 days keeps a lesson quiet; one 29 days ago does not; a retired or deleted lesson is never due', () => {
  const touches = { 'L-000001': [['a', 1], ['b', 2], ['c', 3]] } as const
  const state = (recurrences: Extras['recurrences']) => stateOf(RECUR_LESSONS, { touches, ...(recurrences === undefined ? {} : { recurrences }) })
  assert.equal(dueRecurrences(state({ 'L-000001': [27] }), NOW).length, 0)
  assert.equal(dueRecurrences(state({ 'L-000001': [29] }), NOW).length, 1)
  assert.equal(dueRecurrences(state({ 'L-000001': [29, 10] }), NOW).length, 0)
  const away = stateOf([lessonOf({ id: 'L-000001', status: 'retired' }), lessonOf({ id: 'L-000002', status: 'deleted' })], { touches: { 'L-000001': [['a', 1], ['b', 2], ['c', 3]], 'L-000002': [['a', 1], ['b', 2], ['c', 3]] } })
  assert.deepEqual(dueRecurrences(away, NOW), [])
})

test('at most two reminders are recorded in a calendar week, Monday to Sunday UTC, counting every lesson', () => {
  assert.equal(RECUR_WEEKLY_CAP, 2)
  const touches = Object.fromEntries(RECUR_LESSONS.map(lesson => [lesson.id, [['a', 1], ['b', 2], ['c', 3]]] as const))
  const state = (recurrences: Extras['recurrences']) => stateOf(RECUR_LESSONS, { touches, ...(recurrences === undefined ? {} : { recurrences }) })
  assert.deepEqual(dueRecurrences(state(undefined), NOW).map(item => item.lesson.id), ['L-000001', 'L-000002'], 'four are due, two are allowed')
  // NOW is Wednesday 10:00; Tuesday 10:00 is one day ago, Sunday 10:00 is three days ago (the week before).
  assert.deepEqual(dueRecurrences(state({ 'L-000003': [1] }), NOW).map(item => item.lesson.id), ['L-000001'], 'one reminder this week leaves one')
  assert.deepEqual(dueRecurrences(state({ 'L-000003': [1], 'L-000004': [0.4] }), NOW), [], 'two this week leave none')
  assert.deepEqual(dueRecurrences(state({ 'L-000003': [3], 'L-000004': [3.5] }), NOW).map(item => item.lesson.id), ['L-000001', 'L-000002'], 'reminders of last week do not count')
  const quiet = state({ 'L-000003': [1], 'L-000004': [0.4] })
  assert.deepEqual(dueRecurrences(quiet, '2026-11-08T23:30:00.000Z'), [], 'still the same week at 23:30 on Sunday')
  assert.equal(dueRecurrences(quiet, '2026-11-09T00:30:00.000Z').length, 2, 'a new week begins at midnight on Monday')
})

// --- The notices --------------------------------------------------------------------------------------------------------

test('the reminder that a lesson keeps coming back names it and the number of sessions, and says it stays advice', () => {
  assert.equal(recurNotice(lessonOf({ id: 'L-6c1d02' }), 3), [
    '<system-reminder>',
    'Lesson L-6c1d02 matched failures in 3 sessions in the last 28 days. Lessons stay advice. If the harness should enforce it, record a rule proposal with rules_propose and put it to the user with propose_to_human; if you do not have rules_propose, put the point to the user in plain words with propose_to_human.',
    '</system-reminder>',
  ].join('\n'))
})

test('the candidate notice lists the open candidates, oldest first, with where each came from and a lesson it looks like; five at most', () => {
  assert.equal(candidateNotice(emptyLessons()), undefined)
  assert.equal(candidateNotice(stateOf([], { candidates: [candidateOf({ id: 'C-1a2b3c', status: 'merged' }), candidateOf({ id: 'C-77e0d1', status: 'dropped' })] })), undefined)
  const existing = lessonOf({ id: 'L-0f12aa', situation: { commands: ['Get-Content'] }, pitfall: 'Get-Content without -Encoding garbled the Chinese text in a fixture', fix: 'Pass -Encoding utf8' })
  const state = stateOf([existing], {
    candidates: [
      candidateOf({ id: 'C-77e0d1', pitfall: 'npm run probe failed while a calibration run held the sandbox', evidence: ['task:task-5@2026-10-30T09:15', 'session:child-2'], at: day(-2) }),
      candidateOf({ id: 'C-1a2b3c', pitfall: 'Get-Content without -Encoding garbled the Chinese text in a fixture', fix: 'Pass -Encoding utf8', situation: { commands: ['Get-Content'] }, evidence: ['task:task-3', 'session:child-1'], at: day(-3) }),
      candidateOf({ id: 'C-9b3f20', pitfall: 'The sandbox cleanup\nleaves a lock file', evidence: ['session:child-3'], at: day(-1) }),
    ],
  })
  assert.equal(candidateNotice(state), [
    '<system-reminder>',
    'Lesson candidates waiting for you to merge (3):',
    '- C-1a2b3c from task-3: Get-Content without -Encoding garbled the Chinese text in a fixture (likely duplicate of L-0f12aa)',
    '- C-77e0d1 from task-5: npm run probe failed while a calibration run held the sandbox',
    '- C-9b3f20: The sandbox cleanup leaves a lock file',
    'Merge each with lessons_merge: new, into <lesson>, or drop. Lessons are advice, not rules.',
    '</system-reminder>',
  ].join('\n'))
  const seven = stateOf([], { candidates: Array.from({ length: 7 }, (_, index) => candidateOf({ id: `C-00000${index}`, at: day(-10 + index) })) })
  const lines = (candidateNotice(seven) ?? '').split('\n')
  assert.equal(lines.filter(line => line.startsWith('- ')).length, 5)
  assert.ok(lines.includes('and 2 more'))
  assert.ok(lines.includes('Lesson candidates waiting for you to merge (7):'))
  assert.ok((lines.find(line => line.startsWith('- ')) ?? '').startsWith('- C-000000'), 'oldest first')
})
