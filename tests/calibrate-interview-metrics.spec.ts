/**
 * The numbers step 12(a) of the M3 plan counts in an interview calibration run
 * (tests/calibration/interview-metrics.mjs; design-addendum 0.6 "第 12 步（a）";
 * docs/ORCHESTRATION.md §10.5.1): read from the event stream, the simulated
 * human's record, the violation journal, the snapshot journal and the graph of
 * a run. The module reads the built modules of this checkout, so this runs after
 * `npm run build`, like the gates do. The classifiers that read a refusal from
 * its text are pinned against the code that writes the text.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { personSaid, talkInit } from '../src/design/talk.ts'
import { snapshotCorrection } from '../src/guard/git-snapshot.ts'
import { renderCorrection } from '../src/guard/rules.ts'
import { MAIN_AGENT_RULES } from '../src/guard/main-agent-rules.ts'
import { PLAIN_QUESTION_EXAMPLES } from '../src/graph/plain-question.ts'
import { askTextRefusal, renderAsk } from '../src/graph/proposal.ts'
import { DELEGATED, DELEGATIONS_ID } from '../src/shared/answer-marks.ts'
// @ts-expect-error The module is plain JavaScript without a declaration file.
import { interviewMetrics, proposeReason, readRun, recordReason, snapshotRefusalCode } from './calibration/interview-metrics.mjs'

type Event = Record<string, unknown>
type Timed = readonly [Event, number]

/** The numbers of a run, and one value of them by its path. */
const metricsOf = (run: Record<string, unknown>): unknown => interviewMetrics(run)
const pick = (value: unknown, ...path: string[]): unknown => path.reduce((at, key) => (at as Record<string, unknown>)[key], value)

const turn = (n: number): Event => ({ type: 'status', phase: 'turn_start', turn: n })
const say = (text: string): Event => ({ type: 'text', text })
const call = (callId: string, tool: string, input: Record<string, unknown>): Event => ({ type: 'tool_call', callId, tool, input })
const done = (callId: string, result: unknown): Event => ({ type: 'tool_result', callId, status: 'completed', result: typeof result === 'string' ? result : JSON.stringify(result) })
const refused = (callId: string, error: Record<string, unknown>): Event => ({ type: 'tool_result', callId, status: 'error', result: `Error: ${JSON.stringify(error)}` })
const shown = (text: string, form: string): Record<string, unknown> => ({ tool: 'propose_to_human', kind: 'question', form, number: 1, text, message: 'Show it.' })
const at = (ms: number, ...events: Event[]): Timed[] => events.map(event => [event, ms] as const)

/** Events with the time each arrived, split into the two lists a run holds. */
function stream(items: readonly Timed[]): { readonly events: Event[], readonly times: number[] } {
  return { events: items.map(([event]) => event), times: items.map(([, ms]) => ms) }
}

const points = (text: string): number => [...text].length

test('with nothing to read every number is zero or empty, and nothing throws', () => {
  const metrics = metricsOf({})
  assert.deepEqual(pick(metrics, 'disturbed'), { humanReplies: 0, releaseRounds: 0, unexpectedQuestionCards: 0 })
  assert.deepEqual(pick(metrics, 'shown'), { proposals: 0, notVerbatim: 0, partialResults: 0, unreadableResults: 0 })
  assert.deepEqual(pick(metrics, 'questions', 'points'), { count: 0, median: null, max: null })
  assert.equal(pick(metrics, 'questions', 'follow', 'rate'), null)
  const denials = pick(metrics, 'rules', 'denials') as Record<string, number>
  assert.deepEqual(Object.keys(denials), MAIN_AGENT_RULES.map(rule => rule.id), 'every rule of the table is listed, denied or not')
  assert.ok(Object.values(denials).every(count => count === 0))
})

test('what the main agent showed: a question the last message of its turn leaves out is counted, and so are the forms, the weight and the wait', () => {
  const first = renderAsk('我建议只存在本机，因为一个文件就够，可以吗？', 1)
  const ways = ['只记金额：最省事', '金额加类别：月底才看得出钱花在哪']
  const second = renderAsk('月底的汇总怎么排？我推荐按类别，因为你要看钱花在哪。', 1, ways)
  const third = renderAsk('以后要手机版吗？', 1)
  const { events, times } = stream([
    ...at(0, turn(1)),
    ...at(10, say('先问几件事？你自己用吗？要联网吗？存本机吗？还要别的吗？')),
    ...at(20, call('c1', 'propose_to_human', { kind: 'question', form: 'recommend', text: '我建议只存在本机，因为一个文件就够，可以吗？' })),
    ...at(100, done('c1', shown(first, 'recommend'))),
    ...at(120, say(`这是我的方案。\n${first}\n1. 甲\n2. 乙`)),
    ...at(500, turn(2)),
    ...at(510, call('c2', 'propose_to_human', { kind: 'question', form: 'choose', text: second })),
    ...at(600, done('c2', shown(second, 'choose'))),
    ...at(620, say(`${second}\n\n1. ${ways[0]}\n2. ${ways[1]}（推荐）`)),
    ...at(900, turn(3)),
    ...at(910, call('c3', 'propose_to_human', { kind: 'question', form: 'want', text: third })),
    ...at(950, done('c3', shown(third, 'want'))),
    ...at(960, say('我定了：一个文件。按验收来。')),
  ])
  const metrics = metricsOf({ events, times, human: [{ kind: 'reply' }, { kind: 'reply' }, { kind: 'silent' }, { kind: 'unexpected-question' }] })
  assert.deepEqual(pick(metrics, 'shown'), { proposals: 3, notVerbatim: 1, partialResults: 0, unreadableResults: 0 })
  assert.deepEqual(pick(metrics, 'questions', 'byForm'), { choose: 1, recommend: 1, want: 1 })
  const sizes = [points(first), points(second), points(third)].sort((a, b) => a - b)
  assert.deepEqual(pick(metrics, 'questions', 'points'), { count: 3, median: sizes[1], max: sizes[2] })
  assert.deepEqual(pick(metrics, 'questions', 'waitMs'), { count: 2, median: 350, max: 400 }, 'from the result of the call to the start of the next turn; the last turn has no answer')
  assert.equal(pick(metrics, 'questions', 'messagesOverMarkLimit'), 1)
  assert.equal(pick(metrics, 'questions', 'optionLinesOutsideChoose'), 1, 'the list of the choose question is the harness\'s, the other list is not')
  assert.deepEqual(pick(metrics, 'questions', 'plainWords'), { hits: 1, words: { 验收: 1 } })
  assert.equal(pick(metrics, 'questions', 'toldSentences'), 1)
  assert.deepEqual(pick(metrics, 'disturbed'), { humanReplies: 2, releaseRounds: 0, unexpectedQuestionCards: 1 })
  assert.deepEqual(pick(metrics, 'questions', 'interviewMarks'), { messages: 4, count: 4, median: 1, max: 5 }, 'without a confirm every message belongs to the interview')
})

test('a result cut at the stream\'s string bound is compared by the start of its text that can be read', () => {
  const text = renderAsk('以后要手机版吗？', 1)
  const cut = `{"tool":"propose_to_human","kind":"question","form":"want","number":1,"text":${JSON.stringify(text)},"message":"Show it."}`.slice(0, 85)
  const { events, times } = stream([
    ...at(0, turn(1)),
    ...at(1, call('c1', 'propose_to_human', { kind: 'question', form: 'want' })),
    ...at(2, { type: 'tool_result', callId: 'c1', status: 'completed', result: cut, truncated: true }),
    ...at(3, say(text)),
    ...at(4, call('c2', 'propose_to_human', { kind: 'question', form: 'want' })),
    ...at(5, { type: 'tool_result', callId: 'c2', status: 'completed', result: 'nothing like a result' }),
  ])
  const metrics = metricsOf({ events, times })
  assert.deepEqual(pick(metrics, 'shown'), { proposals: 1, notVerbatim: 0, partialResults: 1, unreadableResults: 1 })
  assert.deepEqual(pick(metrics, 'questions', 'points'), { count: 0, median: null, max: null }, 'a cut text says nothing of the weight')
})

test('copied worked examples are counted in the messages and in the calls', () => {
  const example = PLAIN_QUESTION_EXAMPLES.recommend.text
  const { events } = stream([
    ...at(0, turn(1)),
    ...at(1, say(`顺便问一下：${example}`)),
    ...at(2, call('c1', 'propose_to_human', { kind: 'question', form: 'recommend', text: example })),
    ...at(3, say('这是另一件事，要不要先写记账命令？')),
  ])
  assert.deepEqual(pick(metricsOf({ events }), 'copiedExamples'), { messages: 1, proposals: 1 })
})

test('the answers: follow rate leaves out what was handed over, a short word restated before is not counted, the kinds saved come from the graph', () => {
  const graph = {
    nodes: new Map<string, Record<string, unknown>>([
      ['q1', { id: 'q1', type: 'question', form: 'recommend' }],
      ['q2', { id: 'q2', type: 'question', form: 'choose', ways: ['甲', '乙'] }],
      ['q3', { id: 'q3', type: 'question', form: 'choose', ways: ['甲', '乙'] }],
      ['q4', { id: 'q4', type: 'question', form: 'want' }],
      [DELEGATIONS_ID, { id: DELEGATIONS_ID, type: 'norm', acceptance: ['逾期怎么提醒：主 Agent 定，只告知', '新书怎么上架：主 Agent 定，只告知'] }],
    ]),
  }
  const record = (ms: number, callId: string, input: Record<string, unknown>, outcome = 'decided'): Timed[] => at(ms, call(callId, 'record_human_answer', input), done(callId, { outcome, message: 'ok' }))
  const { events } = stream([
    ...at(0, turn(1)),
    ...at(1, say('那我记成：先不做手机版。')),
    ...at(2, turn(2)),
    ...record(3, 'r1', { kind: 'question', question: 'q1', answer: 'agree', words: ['嗯'], recordedAs: '先不做手机版' }),
    ...at(4, say('下一件？')),
    ...at(5, turn(3)),
    ...record(6, 'r2', { kind: 'question', question: 'q2', answer: 'agree', way: 1, words: ['嗯'], recordedAs: '甲' }),
    ...record(7, 'r3', { kind: 'question', question: 'q3', answer: 'agree', way: 2, words: ['可以'], recordedAs: '乙' }),
    ...record(8, 'r4', { kind: 'question', question: 'q4', answer: 'agree', words: ['你定'], recordedAs: `${DELEGATED}一个文件` }),
    ...record(9, 'r5', { kind: 'delegation', scope: '逾期怎么提醒', words: ['这类你定'] }, 'delegated'),
    ...at(10, call('r6', 'record_human_answer', { kind: 'question', question: 'q1', answer: 'agree', words: ['瞎编的'], recordedAs: 'x' })),
    ...at(11, refused('r6', { code: 'invalid', message: 'quote 1 is not in any message the human sent after the matter was put to them', field: 'words', hint: 'quote the human\'s own words exactly' })),
  ])
  const metrics = metricsOf({ events, graph })
  assert.deepEqual(pick(metrics, 'questions', 'follow'), { answers: 3, agreed: 3, followed: 2, rate: 0.67 }, 'q1 followed, q2 took the first way of two, q3 the last; r4 was handed over')
  assert.equal(pick(metrics, 'questions', 'delegatedAnswers'), 1)
  assert.equal(pick(metrics, 'questions', 'delegationCalls'), 1)
  assert.equal(pick(metrics, 'questions', 'delegationsSaved'), 2)
  assert.equal(pick(metrics, 'records', 'recorded'), 5)
  assert.equal(pick(metrics, 'records', 'shortWordsWithoutRestating'), 3, 'r1 came after a restatement and r3 is a plain yes; r2 (嗯), r4 (你定) and r5 (这类你定) are short and nothing was restated')
  assert.deepEqual(pick(metrics, 'records', 'refused'), { total: 1, byReason: { 'words-not-found': 1 } })
})

test('the two-level loop: releases shown and recorded, the page that was refused, the way back to design', () => {
  const graph = { nodes: new Map<string, Record<string, unknown>>([['goal-1', { id: 'goal-1', type: 'goal' }], ['mod-a', { id: 'mod-a', type: 'feature' }]]) }
  const release = (ms: number, callId: string, extra: Record<string, unknown>): Timed[] => at(ms, call(callId, 'propose_to_human', { kind: 'release', ...extra }), done(callId, { tool: 'propose_to_human', kind: 'release', number: 1, text: '① 放行可以吗？', message: 'Show it.', ...extra }))
  const { events } = stream([
    ...at(0, turn(1)),
    ...release(1, 'p1', { goal: 'goal-1' }),
    ...at(2, call('p2', 'propose_to_human', { kind: 'release', goal: 'goal-1', page: '' })),
    ...at(3, refused('p2', { code: 'invalid', message: 'the page does not name module A', field: 'page', hint: 'name every module' })),
    ...release(4, 'p3', { goal: 'goal-1', module: 'mod-a' }),
    ...at(5, call('r1', 'record_human_answer', { kind: 'release', goal: 'goal-1', answer: 'agree', words: ['可以，放行'], recordedAs: '放行' })),
    ...at(6, done('r1', { outcome: 'released', message: 'ok' })),
    ...at(7, call('r2', 'record_human_answer', { kind: 'release', goal: 'goal-1', module: 'mod-a', answer: 'agree', words: ['可以，放行这个模块'], recordedAs: '放行' })),
    ...at(8, refused('r2', { code: 'not_shown', message: 'the release was not put to the human', hint: 'show it first', field: 'module' })),
    ...at(9, call('e1', 'graph_edit', { id: 'mod-a', set: { stage: 'design' } }), done('e1', {})),
    ...at(11, call('e2', 'graph_edit', { id: 'goal-1', set: { stage: 'design' } }), done('e2', {})),
    ...at(13, call('e3', 'graph_edit', { id: 'goal-1', set: { title: 'x' } }), done('e3', {})),
  ])
  const violations = [{ rule: 'design-before-release', mode: 'enforce' }, { rule: 'design-before-release' }, { rule: 'design-before-release', mode: 'shadow' }]
  const loops = pick(metricsOf({ events, graph, violations }), 'loops')
  assert.equal(pick(loops, 'goalReleasesShown'), 1)
  assert.deepEqual(pick(loops, 'moduleReleasesShown'), { 'mod-a': 1 })
  assert.deepEqual(pick(loops, 'releasesRecorded'), { 'goal:released': 1 })
  assert.equal(pick(loops, 'pageRefused'), 1)
  assert.equal(pick(loops, 'releaseNotShown'), 1)
  assert.equal(pick(loops, 'subagentWritesDeniedBeforeRelease'), 2, 'a shadow record is not a denial')
  assert.deepEqual(pick(loops, 'returnedToDesign'), { goal: 1, module: 1, other: 0 })
})

test('the rules, the gate and the snapshots: each rule of the table has its count, shadow records do not count, other rules are listed, a refused snapshot is told by its code', () => {
  const retry = renderCorrection(snapshotCorrection('git reset --hard', { code: 'git-failed', reason: 'git stash failed' }))
  const offMachine = renderCorrection(snapshotCorrection('git push origin refs/hourness/snapshots/x', { code: 'snapshots-off-machine', reason: '' }))
  const { events } = stream([
    ...at(0, turn(1)),
    ...at(1, call('p1', 'propose_to_human', { kind: 'confirm', goal: 'goal-1', text: '这样可以吗？' })),
    ...at(2, refused('p1', { code: 'gate_unmet', message: 'the requirement card is not complete', hint: 'fill it' })),
    ...at(3, call('r1', 'record_human_answer', { kind: 'confirm', goal: 'goal-1', answer: 'agree', words: ['对'], recordedAs: 'x' })),
    ...at(4, refused('r1', { code: 'gate_unmet', message: 'the card changed', hint: 'ask again' })),
  ])
  const violations = [
    { rule: 'main-agent-no-write', mode: 'enforce' },
    { rule: 'main-agent-no-write' },
    { rule: 'main-agent-graph-stage', mode: 'shadow' },
    { rule: 'file-tools-only' },
    { rule: 'git-snapshot', correction: retry },
    { rule: 'git-snapshot', correction: offMachine },
  ]
  const snapshots = [{ id: 's1' }, { id: 's2' }, { id: 's3', skipped: 'nothing-to-keep' }]
  const metrics = metricsOf({ events, violations, snapshots })
  assert.equal(pick(metrics, 'rules', 'denials', 'main-agent-no-write'), 2)
  assert.equal(pick(metrics, 'rules', 'denials', 'main-agent-graph-stage'), 0)
  assert.equal(pick(metrics, 'rules', 'denials', 'git-snapshot'), 2)
  assert.deepEqual(pick(metrics, 'rules', 'other'), { 'file-tools-only': 1 })
  assert.equal(pick(metrics, 'records', 'gateUnmet'), 2)
  assert.deepEqual(pick(metrics, 'questions', 'refused'), { total: 1, byReason: { gate_unmet: 1 } })
  assert.deepEqual(pick(metrics, 'snapshots'), { saved: 2, skippedWhole: 1, refused: { total: 2, byCode: { 'git-failed|timeout|list-mismatch': 1, 'snapshots-off-machine': 1 } } })
})

test('the refusal classifiers agree with the code that writes the refusals', () => {
  // propose_to_human: the limits of the text (src/graph/proposal.ts), and the sentences of src/design/propose.ts that mark the plain-word and the not-in-text refusals.
  const tooLong = askTextRefusal('recommend', `${'长'.repeat(170)}？`)!
  const twoMarks = askTextRefusal('recommend', '一个？两个？')!
  const refusal = (field: string, found: { readonly message: string, readonly hint: string }): Record<string, unknown> => ({ code: 'invalid', message: found.message, field, hint: found.hint })
  assert.equal(proposeReason(refusal('text', tooLong)), 'text-too-long')
  assert.equal(proposeReason(refusal('text', twoMarks)), 'text-shape')
  assert.equal(proposeReason({ code: 'too_many', message: 'x', hint: 'y' }), 'too_many')
  assert.equal(proposeReason({ code: 'gate_unmet', message: 'x', hint: 'y' }), 'gate_unmet')
  assert.equal(proposeReason({ code: 'invalid', message: 'x', field: 'page', hint: 'y' }), 'invalid:page')
  assert.equal(proposeReason(undefined), 'unparsed')
  const propose = readFileSync(join(import.meta.dirname, '..', 'src', 'design', 'propose.ts'), 'utf8')
  const plain = /uses the word \$\{hit\}, (which the human has not learned)/u.exec(propose)?.[1]
  const missing = /\$\{missing\.field\} (is not in text word for word)/u.exec(propose)?.[1]
  assert.equal(proposeReason({ code: 'invalid', message: `title uses the word 验收, ${plain}`, field: 'title', hint: 'y' }), 'plain-word')
  assert.equal(proposeReason({ code: 'invalid', message: `reason ${missing}`, field: 'text', hint: 'y' }), 'not-in-text')

  // record_human_answer: the reasons personSaid gives (src/design/talk.ts) and the shape messages of src/design/record.ts.
  const state = { ...talkInit({}, 0), people: [{ seq: 1, time: 10, text: '不可以，换一个', restated: false }] }
  const inside = personSaid(state, ['可以'], 0)
  const absent = personSaid(state, ['随便'], 0)
  assert.ok(!inside.ok && !absent.ok)
  const words = (reason: string): Record<string, unknown> => ({ code: 'invalid', message: reason, field: 'words', hint: 'z' })
  assert.equal(recordReason(words((inside as { reason: string }).reason)), 'words-off-boundary')
  assert.equal(recordReason(words((absent as { reason: string }).reason)), 'words-not-found')
  const record = readFileSync(join(import.meta.dirname, '..', 'src', 'design', 'record.ts'), 'utf8')
  assert.ok(record.includes('`words must be 1 to ${') && record.includes('`the quotes are longer than'), 'the two messages recordReason reads as a bad shape of words')
  assert.equal(recordReason(words('words must be 1 to 6 quotes of 1 to 400 characters')), 'words-invalid')
  assert.equal(recordReason(words('the quotes are longer than 800 characters together')), 'words-invalid')
  assert.equal(recordReason({ code: 'not_shown', message: 'x', hint: 'y' }), 'not_shown')

  // git-snapshot: every code the guard can refuse with has its own reading, the three retry codes share one.
  const codes = ['git-failed', 'timeout', 'list-mismatch', 'too-big', 'remote-unreachable', 'cd-unknown', 'ignored-in-way', 'snapshots-off-machine', 'ignored-files', 'nested-repos', 'unreadable'] as const
  const read = Object.fromEntries(codes.map(code => [code, snapshotRefusalCode(renderCorrection(snapshotCorrection('git clean -fdx', { code, reason: 'because', paths: ['a.txt'] })))]))
  const retry = 'git-failed|timeout|list-mismatch'
  assert.deepEqual(read, {
    'git-failed': retry,
    'timeout': retry,
    'list-mismatch': retry,
    'too-big': 'too-big',
    'remote-unreachable': 'remote-unreachable',
    'cd-unknown': 'cd-unknown',
    'ignored-in-way': 'ignored-in-way',
    'snapshots-off-machine': 'snapshots-off-machine',
    'ignored-files': 'ignored-files',
    'nested-repos': 'nested-repos',
    'unreadable': 'unreadable',
  })
  assert.equal(snapshotRefusalCode('something else'), 'other')
})

test('readRun reads the files a run directory holds, and a missing file reads as empty', () => {
  const empty = readRun(mkdtempSync(join(tmpdir(), 'interview-metrics-')))
  assert.deepEqual(empty, { events: [], times: [], human: [], violations: [], snapshots: [] })
  const dir = mkdtempSync(join(tmpdir(), 'interview-metrics-'))
  mkdirSync(join(dir, 'home', 'audit'), { recursive: true })
  mkdirSync(join(dir, 'ws', '.llm'), { recursive: true })
  writeFileSync(join(dir, 'events.jsonl'), `${JSON.stringify({ type: 'session' })}\nnot json\n\n${JSON.stringify({ type: 'text', text: '好' })}\n`)
  writeFileSync(join(dir, 'event-times.json'), JSON.stringify([5, 6]))
  writeFileSync(join(dir, 'human.jsonl'), `${JSON.stringify({ kind: 'reply' })}\n`)
  writeFileSync(join(dir, 'home', 'audit', 'violations.jsonl'), `${JSON.stringify({ rule: 'main-agent-ask' })}\n`)
  writeFileSync(join(dir, 'ws', '.llm', 'snapshots.jsonl'), `${JSON.stringify({ id: 's1' })}\n`)
  const run = readRun(dir) as Record<string, unknown[]>
  assert.deepEqual(run.events, [{ type: 'session' }, { type: 'text', text: '好' }], 'the lines that are not events are skipped, as the runner skips them, so the times stay in step')
  assert.deepEqual(run.times, [5, 6])
  assert.deepEqual([run.human.length, run.violations.length, run.snapshots.length], [1, 1, 1])
})
