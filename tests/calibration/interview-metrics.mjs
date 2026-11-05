/**
 * What step 12(a) of the M3 plan counts in a run of an interview task
 * (design-addendum 0.6 "第 12 步（a）：标定"; docs/ORCHESTRATION.md §10.5.1),
 * beyond the pass or fail of the acceptance script: how often the person is
 * disturbed, whether the main agent showed what the harness returned, the shape
 * and the weight of the questions (the numbers the d-ask-three-gates trial is
 * judged by), copied worked examples, the two-level loop, the records of the
 * person's words, the denials of the main agent's rules and the git snapshots.
 *
 * The design row hands its events to the metrics journal too (src/design/
 * metrics.ts); until this reader moves to it, the numbers are read back from
 * what a run leaves in its directory: the --json event stream (events.jsonl, with the arrival time
 * of each line in event-times.json), what the simulated human did (human.jsonl),
 * the violation journal (home/audit/violations.jsonl), the snapshot journal
 * (ws/.llm/snapshots.jsonl) and the project graph of the workspace. The
 * acceptance script of each interview task prints the result as `metrics` next
 * to its checks; the runner copies it into result.json. A count is a plain
 * number; where a file or an event is missing the number is 0 (or null for a
 * median), never a guess.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dist = file => import(pathToFileURL(join(import.meta.dirname, '..', '..', 'packages', 'hourness', 'dist', file)).href)
const { askOf } = await dist('graph/proposal.js')
const { PLAIN_QUESTION_EXAMPLES, plainWordsIn } = await dist('graph/plain-question.js')
const { DELEGATED, DELEGATIONS_ID, isPlainYes } = await dist('shared/answer-marks.js')
const { MAIN_AGENT_RULES } = await dist('guard/main-agent-rules.js')
const { PROPOSE_TO_HUMAN, RECORD_HUMAN_ANSWER } = await dist('shared/tool-names.js')

/** A record of the human's words shorter than this many code points is "a short word" (addendum §3.7). */
const SHORT_WORDS = 6
/** The mark of a main agent message that restates a short answer before recording it (src/design/talk.ts RESTATE_MARK). */
const RESTATE_MARK = '我记成'
/** A line that starts like an item of a list of ways: "1.", "2)", "A." and the like. */
const OPTION_LINE = /^[ \t]*(?:[1-9][0-9]?|[A-Da-d])[.)、）]\s*\S/mu
/** More question marks than this in one message is the "too many questions in one message" count. */
const MANY_MARKS = 3

const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value)
const parseJson = (text) => {
  try {
    return JSON.parse(text)
  }
  catch {
    return undefined
  }
}
const points = text => [...text].length
const marksIn = text => (text.match(/[?？]/gu) ?? []).length
const tally = (counts, key) => {
  counts[key] = (counts[key] ?? 0) + 1
}
const sortedKeys = counts => Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
const round = (value, places = 2) => Math.round(value * 10 ** places) / 10 ** places
/** Median, maximum and count of numbers; null for the first two when there are none. */
function spread(values) {
  if (values.length === 0) return { count: 0, median: null, max: null }
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length >> 1
  return { count: sorted.length, median: sorted.length % 2 === 1 ? sorted[middle] : round((sorted[middle - 1] + sorted[middle]) / 2, 1), max: sorted.at(-1) }
}

/** The structured error a tool came back with ("Error: {json}" or the json itself), or undefined. */
function errorOf(result) {
  const start = typeof result === 'string' ? result.indexOf('{') : -1
  return start < 0 ? undefined : parseJson(result.slice(start))
}

/** The `text` of a result that was cut at the event stream's string bound: what can be read of it. */
function textPrefix(result) {
  const at = result.indexOf('"text":"')
  if (at < 0) return undefined
  let body = result.slice(at + '"text":"'.length)
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '\\') i++
    else if (body[i] === '"') {
      body = body.slice(0, i)
      break
    }
  }
  for (let cut = 0; cut < 8 && body.length >= cut; cut++) {
    const parsed = parseJson(`"${body.slice(0, body.length - cut)}"`)
    if (typeof parsed === 'string') return parsed
  }
  return undefined
}

/** What propose_to_human returned: its output, and whether only the start of the text could be read. */
function shownOf(result) {
  const whole = parseJson(result)
  if (isRecord(whole) && typeof whole.text === 'string') return { shown: whole, partial: false }
  const prefix = textPrefix(result)
  return prefix === undefined ? undefined : { shown: { text: prefix }, partial: true }
}

/** The reason code of a refused propose_to_human, as the table of addendum §3.12 names them where the error shows it. */
export function proposeReason(error) {
  if (!isRecord(error)) return 'unparsed'
  const { code, message = '', field, hint = '' } = error
  if (code === 'too_many') return 'too_many'
  if (code !== 'invalid') return String(code)
  if (/which the human has not learned/u.test(message)) return 'plain-word'
  if (/is not in text word for word/u.test(message)) return 'not-in-text'
  if (field === 'text') return hint.startsWith('shorten') ? 'text-too-long' : 'text-shape'
  return field === undefined ? 'invalid' : `invalid:${field}`
}

/** The reason code of a refused record_human_answer. */
export function recordReason(error) {
  if (!isRecord(error)) return 'unparsed'
  const { code, message = '', field } = error
  if (code !== 'invalid') return String(code)
  if (field === 'words') {
    if (/^words must be|^the quotes are longer/u.test(message)) return 'words-invalid'
    if (/not as a whole phrase/u.test(message)) return 'words-off-boundary'
    if (/not in any message the human sent/u.test(message)) return 'words-not-found'
  }
  return field === undefined ? 'invalid' : `invalid:${field}`
}

/** The code of the refusal behind a git-snapshot denial, read from the correction the journal keeps; the three retry codes share one text. */
export function snapshotRefusalCode(correction) {
  const text = String(correction)
  const known = [
    ['snapshots-off-machine', /off this machine/u],
    ['ignored-files', /delete ignored files the snapshot does not keep/u],
    ['nested-repos', /delete nested repositories/u],
    ['unreadable', /could not check what .* sends away/su],
    ['too-big', /Narrow the command/u],
    ['remote-unreachable', /when the remote is reachable/u],
    ['cd-unknown', /Run git with -C/u],
    ['ignored-in-way', /Tell the human which ignored files are in the way/u],
    ['git-failed|timeout|list-mismatch', /Retry; if it fails again/u],
  ]
  return known.find(([, pattern]) => pattern.test(text))?.[0] ?? 'other'
}

/** The run's event stream as an ordered log: the turns, the messages of the main agent and the tool calls with their results. */
function logOf(events, times) {
  const turns = [{ index: 0, startedAt: undefined, texts: [] }]
  const texts = []
  const calls = new Map()
  events.forEach((event, at) => {
    const now = typeof times[at] === 'number' ? times[at] : undefined
    const turn = turns.at(-1)
    if (event.type === 'status' && event.phase === 'turn_start') turns.push({ index: turns.length, startedAt: now, texts: [] })
    else if (event.type === 'text' && typeof event.text === 'string') {
      texts.push({ text: event.text, turn: turn.index })
      turn.texts.push(event.text)
    }
    else if (event.type === 'tool_call' && typeof event.callId === 'string') {
      calls.set(event.callId, { tool: event.tool, input: isRecord(event.input) ? event.input : {}, turn: turn.index, previousText: turns[turn.index - 1]?.texts.at(-1), at: now })
    }
    else if (event.type === 'tool_result' && calls.has(event.callId)) {
      Object.assign(calls.get(event.callId), { ok: event.status === 'completed', result: typeof event.result === 'string' ? event.result : '', resultAt: now })
    }
  })
  return { turns, texts, calls: [...calls.values()] }
}

/**
 * The numbers of one run. `run`: `events` (the parsed --json stream), `times`
 * (arrival time in milliseconds of each event, same order, may be missing),
 * `human` (the records of human.jsonl), `violations`, `snapshots` (journal
 * lines) and `graph` (the workspace's project graph, for the kinds of nodes and
 * the form of the questions answered).
 */
export function interviewMetrics({ events = [], times = [], human = [], violations = [], snapshots = [], graph } = {}) {
  const { turns, texts, calls } = logOf(events, times)
  const proposals = calls.filter(call => call.tool === PROPOSE_TO_HUMAN)
  const records = calls.filter(call => call.tool === RECORD_HUMAN_ANSWER)
  const failed = list => list.filter(call => call.ok === false)
  const succeeded = list => list.filter(call => call.ok === true)
  const node = id => typeof id === 'string' ? graph?.nodes.get(id) : undefined

  // What the harness returned to the main agent to show the person.
  const showings = []
  let unreadable = 0
  for (const call of succeeded(proposals)) {
    const read = shownOf(call.result)
    if (read === undefined) unreadable += 1
    else showings.push({ call, ...read, kind: read.shown.kind ?? call.input.kind, form: read.shown.form ?? call.input.form })
  }
  const askedBy = showing => showing.kind === 'question' ? (showing.form ?? 'question') : showing.kind
  const byForm = {}
  for (const showing of showings) tally(byForm, askedBy(showing))
  const whole = showings.filter(showing => !showing.partial)
  // A result cut at the stream's string bound is compared by the start of its text that can be read.
  const notVerbatim = showings.filter((showing) => {
    const last = turns[showing.call.turn]?.texts.at(-1) ?? ''
    return !last.includes(showing.shown.text)
  }).length
  const waitMs = showings.flatMap((showing) => {
    const replied = turns[showing.call.turn + 1]?.startedAt
    return typeof replied === 'number' && typeof showing.call.resultAt === 'number' ? [replied - showing.call.resultAt] : []
  })
  const chooseTexts = showings.filter(showing => askedBy(showing) === 'choose').map(showing => showing.shown.text)
  const plainWords = {}
  let plainHits = 0
  for (const { text } of texts) {
    for (const word of plainWordsIn(text)) {
      plainHits += 1
      tally(plainWords, word)
    }
  }
  const firstConfirm = showings.find(showing => showing.kind === 'confirm')?.call.turn
  const interviewMessages = texts.filter(message => firstConfirm === undefined || message.turn < firstConfirm)

  // What the person said back, as the main agent recorded it.
  const recorded = succeeded(records).map(call => ({ call, outcome: parseJson(call.result)?.outcome }))
  const delegatedOf = ({ call }) => call.input.kind !== 'delegation' && typeof call.input.recordedAs === 'string' && call.input.recordedAs.startsWith(DELEGATED)
  const answers = recorded.filter(({ call }) => call.input.kind === 'question' && !delegatedOf({ call }))
  const followed = { answers: 0, agreed: 0, followed: 0 }
  for (const { call } of answers) {
    const question = node(call.input.question)
    if (question?.form !== 'recommend' && question?.form !== 'choose') continue
    followed.answers += 1
    if (call.input.answer !== 'agree') continue
    followed.agreed += 1
    if (question.form === 'recommend' || call.input.way === question.ways?.length) followed.followed += 1
  }
  const shortWords = recorded.filter(({ call }) => {
    if (!Array.isArray(call.input.words)) return false
    const words = call.input.words.filter(piece => typeof piece === 'string')
    return points(words.join('')) < SHORT_WORDS && !words.every(isPlainYes) && !(call.previousText ?? '').includes(RESTATE_MARK)
  }).length
  const recordFailures = {}
  for (const call of failed(records)) tally(recordFailures, recordReason(errorOf(call.result)))
  const proposalFailures = {}
  for (const call of failed(proposals)) tally(proposalFailures, proposeReason(errorOf(call.result)))
  const gateUnmet = [...failed(proposals), ...failed(records)].filter(call => errorOf(call.result)?.code === 'gate_unmet').length

  // The worked examples of the tool description (d-agent-examples) must not come back as questions.
  const examples = Object.values(PLAIN_QUESTION_EXAMPLES).flatMap(example => [example.text, askOf(example.text)])
  const copies = list => list.filter(text => examples.some(example => text.includes(example))).length

  // The two-level loop.
  const releaseShown = showings.filter(showing => showing.kind === 'release')
  const moduleReleases = {}
  for (const showing of releaseShown) if (typeof showing.shown.module === 'string') tally(moduleReleases, showing.shown.module)
  const returned = { goal: 0, module: 0, other: 0 }
  for (const call of succeeded(calls.filter(entry => entry.tool === 'graph_edit'))) {
    if (!isRecord(call.input.set) || call.input.set.stage !== 'design') continue
    const type = node(call.input.id)?.type
    tally(returned, type === 'goal' ? 'goal' : type === 'feature' ? 'module' : 'other')
  }

  // The rules, the gate and the snapshots.
  const denials = Object.fromEntries(MAIN_AGENT_RULES.map(rule => [rule.id, 0]))
  const otherRules = {}
  for (const record of violations.filter(entry => entry.mode !== 'shadow')) {
    if (record.rule in denials) denials[record.rule] += 1
    else tally(otherRules, String(record.rule))
  }
  const refusedSnapshots = {}
  for (const record of violations.filter(entry => entry.mode !== 'shadow' && entry.rule === 'git-snapshot')) tally(refusedSnapshots, snapshotRefusalCode(record.correction))

  return {
    disturbed: {
      humanReplies: human.filter(entry => entry.kind === 'reply').length,
      releaseRounds: releaseShown.length,
      unexpectedQuestionCards: human.filter(entry => entry.kind === 'unexpected-question').length,
    },
    shown: {
      proposals: showings.length,
      notVerbatim,
      partialResults: showings.length - whole.length,
      unreadableResults: unreadable,
    },
    questions: {
      byForm: sortedKeys(byForm),
      points: spread(whole.map(showing => points(showing.shown.text))),
      waitMs: spread(waitMs),
      messagesOverMarkLimit: texts.filter(({ text }) => marksIn(text) > MANY_MARKS).length,
      optionLinesOutsideChoose: texts.filter(({ text }) => OPTION_LINE.test(text) && !chooseTexts.some(choose => text.includes(choose))).length,
      plainWords: { hits: plainHits, words: sortedKeys(plainWords) },
      toldSentences: texts.reduce((sum, { text }) => sum + (text.match(/我定了[：:]/gu) ?? []).length, 0),
      delegationsSaved: graph?.nodes.get(DELEGATIONS_ID)?.acceptance?.length ?? 0,
      delegationCalls: recorded.filter(({ call }) => call.input.kind === 'delegation').length,
      delegatedAnswers: recorded.filter(delegatedOf).length,
      follow: { ...followed, rate: followed.answers === 0 ? null : round(followed.followed / followed.answers) },
      refused: { total: failed(proposals).length, byReason: sortedKeys(proposalFailures) },
      interviewMarks: { messages: interviewMessages.length, ...spread(interviewMessages.map(({ text }) => marksIn(text))) },
    },
    copiedExamples: { messages: copies(texts.map(({ text }) => text)), proposals: copies(proposals.flatMap(call => typeof call.input.text === 'string' ? [call.input.text] : [])) },
    loops: {
      goalReleasesShown: releaseShown.filter(showing => showing.shown.module === undefined).length,
      moduleReleasesShown: sortedKeys(moduleReleases),
      releasesRecorded: sortedKeys(recorded.filter(({ call }) => call.input.kind === 'release').reduce((counts, { call, outcome }) => {
        tally(counts, `${typeof call.input.module === 'string' ? 'module' : 'goal'}:${outcome ?? 'unknown'}`)
        return counts
      }, {})),
      pageRefused: failed(proposals).filter(call => errorOf(call.result)?.code === 'invalid' && errorOf(call.result)?.field === 'page').length,
      releaseNotShown: failed(records).filter(call => errorOf(call.result)?.code === 'not_shown' && call.input.kind === 'release').length,
      subagentWritesDeniedBeforeRelease: denials['design-before-release'] ?? 0,
      returnedToDesign: returned,
    },
    records: {
      recorded: recorded.length,
      refused: { total: failed(records).length, byReason: sortedKeys(recordFailures) },
      shortWordsWithoutRestating: shortWords,
      gateUnmet,
    },
    rules: { denials, other: sortedKeys(otherRules) },
    snapshots: {
      saved: snapshots.filter(entry => entry.skipped === undefined).length,
      skippedWhole: snapshots.filter(entry => entry.skipped !== undefined).length,
      refused: { total: Object.values(refusedSnapshots).reduce((sum, count) => sum + count, 0), byCode: sortedKeys(refusedSnapshots) },
    },
  }
}

/** What a run directory holds that the numbers are read from; a file that is missing reads as empty. */
export function readRun(dir) {
  const lines = (...parts) => {
    const file = join(dir, ...parts)
    return existsSync(file) ? readFileSync(file, 'utf8').split('\n') : []
  }
  const records = (...parts) => lines(...parts).flatMap((line) => {
    const value = line.trim() === '' ? undefined : parseJson(line)
    return value === undefined ? [] : [value]
  })
  const timesFile = join(dir, 'event-times.json')
  const times = existsSync(timesFile) ? parseJson(readFileSync(timesFile, 'utf8')) : undefined
  return {
    events: records('events.jsonl'),
    times: Array.isArray(times) ? times : [],
    human: records('human.jsonl'),
    violations: records('home', 'audit', 'violations.jsonl'),
    snapshots: records('ws', '.llm', 'snapshots.jsonl'),
  }
}
