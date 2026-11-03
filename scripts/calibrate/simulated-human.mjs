/**
 * Simulated human (docs/DEVELOPMENT.md §3, docs/ORCHESTRATION.md §3.1, §3.5): an
 * overlay-only row for the L3 probe and the calibration runs, standing in for
 * the person where a run has none. It types `/wish` the way the person does,
 * answers the main agent in the conversation, and refuses the question cards the
 * main agent must never raise. Not part of the bundle: scripts/sandbox.mjs
 * passes its path to the DSH Loader.
 *
 * - `wish`: when `true`, the first root agent gets `/wish` as the person's
 *   first command; a string is typed after it (`/wish <string>`). A person
 *   has one first session: root agents the run creates later are not typed
 *   for. The command runs in the serial `agent/created` listener, so its
 *   events come before the task message the headless runner sends. A command
 *   that cannot run (the design row is off) is recorded as `wish-failed`.
 * - Replies: when the config names `replies` or `answers`, the person answers
 *   in the conversation when a turn of a root session ends (its last message
 *   calls no tool), as a message of the user (`source: {kind: 'user'}`, the shape of a headless task
 *   message), so the harness takes it as the human's words. What is said is
 *   chosen by `simulatedReply`, a pure function of the turn. Without those two
 *   keys it never speaks, so the runs that only need `/wish` do not change.
 * - Stop: when the config names `stop` (a sentence), the person says it once
 *   at the end of the turn after the goal's release card was answered with
 *   its approval (the last sentence configured for `release`, said for a
 *   release of the goal, not of a module), and from then on never speaks
 *   again - no replies, no silents, nothing more is recorded. A task whose
 *   design ends at the release says it there, so that the run measures
 *   whether the main agent stops when the human says so.
 * - Question cards: every agent gets a `user-questions/request` listener that
 *   cancels the request (`ASK_CANCELLED`, the shape the client rejects with)
 *   and records `unexpected-question` with the question ids: the main agent
 *   has no ask_user_question, so any card is a violation to count.
 *
 * Everything the row did is appended to `config.record` (one JSON object per
 * line, `human.jsonl` in the run directory): `wish`, `wish-failed`,
 * `unexpected-question`, and `{kind: 'reply' | 'silent', rule, text?, shown}`
 * for each turn it considered.
 */
import { appendFileSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const name = 'glm-hourness-calibrate/simulated-human'
export const inject = ['commands']

const KINDS = ['question', 'confirm', 'release', 'module']
const DEFAULTS = { question: '可以，就按推荐的来', confirm: '对，就这样', release: '可以，放行', module: '可以，放行这个模块' }
const KNOWN = new Set(['record', 'wish', 'answers', 'replies', 'restateReply', 'fallback', 'maxReplies', 'stop'])

/** The error the client rejects a question with when the person closes the card; the user-questions service restores it by name and code. */
function cancelled() {
  return Object.assign(new Error('the user cancelled ask_user_question'), { name: 'UserQuestionError', code: 'ASK_CANCELLED' })
}

const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = value => typeof value === 'string' && value.trim().length > 0

/** The config, checked: unknown fields and items of the wrong shape are reported through `warn` and left out. */
export function readConfig(raw, warn = () => {}) {
  const config = isRecord(raw) ? raw : {}
  for (const key of Object.keys(config)) if (!KNOWN.has(key)) warn(`unknown field "${key}" is ignored`)
  const out = { restateReply: '对', fallback: '你按经验定吧', maxReplies: 24, replies: {}, answers: {}, enabled: false }
  if (config.restateReply !== undefined) isText(config.restateReply) ? out.restateReply = config.restateReply : warn('restateReply must be a non-empty string')
  if (config.fallback !== undefined) isText(config.fallback) ? out.fallback = config.fallback : warn('fallback must be a non-empty string')
  if (config.maxReplies !== undefined) Number.isInteger(config.maxReplies) && config.maxReplies >= 0 ? out.maxReplies = config.maxReplies : warn('maxReplies must be a whole number from 0')
  if (config.stop !== undefined) isText(config.stop) ? out.stop = config.stop : warn('stop must be a non-empty string')
  if (config.replies !== undefined) {
    if (!isRecord(config.replies)) warn('replies must be an object of kind to a list of sentences')
    else {
      out.enabled = true
      for (const [kind, list] of Object.entries(config.replies)) {
        if (!KINDS.includes(kind)) warn(`replies.${kind} is not a kind of matter (${KINDS.join(', ')})`)
        else if (!Array.isArray(list) || list.length === 0 || !list.every(isText)) warn(`replies.${kind} must be a non-empty list of sentences`)
        else out.replies[kind] = list
      }
    }
  }
  if (config.answers !== undefined) {
    if (!isRecord(config.answers)) warn('answers must be an object of requirement item key to a sentence')
    else {
      out.enabled = true
      for (const [key, text] of Object.entries(config.answers)) isText(text) ? out.answers[key] = text : warn(`answers.${key} must be a non-empty string`)
    }
  }
  return out
}

/**
 * What the person says at the end of a turn (docs/ORCHESTRATION.md §3.5), the
 * first rule that holds:
 *   1. `maxReplies` replies were given: nothing.
 *   2. The last message of the main agent says it will record the answer
 *      ("我记成"): `restateReply`.
 *   3. The main agent put matters to the human this turn: for each, in order,
 *      the next sentence of `replies[kind]` (the last one again when they run
 *      out; `module` for a release of a module), joined by line breaks, said
 *      once. Without a configured sentence: the defaults above. When
 *      `config.stop` is set and one of the matters was the release of the
 *      goal answered with the last sentence of its list, the release was
 *      approved and the result carries `armed: true`: the caller says the
 *      stop sentence at the end of the next turn and goes silent after it.
 *   4. The goal in focus has a requirement item missing: `answers[key]` of the
 *      first item in the order the interview asks them, else `fallback`.
 *   5. The goal is not released, or a module of it is still in design: `fallback`.
 *   6. Otherwise nothing (the run ends).
 * `context`: `config` (readConfig), `replied`, `lastAssistant`, `shown`
 * ({kind, number, form?, module?} of the matters put this turn; module is kept in the record of what was put), `used` (the sentences
 * taken so far per kind), `missing` (key of the first missing item of the
 * requirement card, or undefined), `unreleased` (the goal in focus is not
 * released or has a module in design). Returns `{kind: 'reply' | 'silent',
 * rule, text?, shown, used, armed?}`.
 */
export function simulatedReply(context) {
  const { config, replied, lastAssistant = '', shown = [], used = {} } = context
  const summary = shown.map(({ kind, number, form, module }) => ({ kind, number, ...form === undefined ? {} : { form }, ...module === undefined ? {} : { module } }))
  const silent = rule => ({ kind: 'silent', rule, shown: summary, used })
  if (replied >= config.maxReplies) return silent(1)
  if (lastAssistant.includes('我记成')) return { kind: 'reply', rule: 2, text: config.restateReply, shown: summary, used }
  if (shown.length > 0) {
    const taken = { ...used }
    let approved = false
    const lines = shown.map((entry) => {
      const kind = entry.kind === 'release' && entry.module !== undefined ? 'module' : entry.kind
      const list = config.replies[kind] ?? [DEFAULTS[kind]]
      const at = Math.min(taken[kind] ?? 0, list.length - 1)
      const line = list[at]
      taken[kind] = (taken[kind] ?? 0) + 1
      if (config.stop !== undefined && entry.kind === 'release' && entry.module === undefined && at === list.length - 1) approved = true
      return line
    })
    return { kind: 'reply', rule: 3, text: lines.join('\n'), shown: summary, used: taken, ...approved ? { armed: true } : {} }
  }
  if (context.missing !== undefined) return { kind: 'reply', rule: 4, text: config.answers[context.missing] ?? config.fallback, shown: summary, used }
  if (context.unreleased === true) return { kind: 'reply', rule: 5, text: config.fallback, shown: summary, used }
  return silent(6)
}

const distOf = file => import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'packages', 'hourness', 'dist', file)).href)

export function apply(ctx, rawConfig = {}) {
  const note = (entry) => {
    if (typeof rawConfig.record === 'string') appendFileSync(rawConfig.record, `${JSON.stringify(entry)}\n`)
  }
  const config = readConfig(rawConfig, text => console.warn(`${name}: ${text}`))
  const wishLine = rawConfig.wish === true ? '/wish' : typeof rawConfig.wish === 'string' ? `/wish ${rawConfig.wish}` : undefined
  let typed = false
  let talk
  let modules
  /** The talk fold, the graph reading and the interview order of the built package, loaded on first use. */
  const load = async () => {
    talk ??= await distOf('design/talk.js')
    modules ??= { store: await distOf('graph/store.js'), parse: await distOf('graph/parse.js'), stage: await distOf('graph/stage.js'), notice: await distOf('design/stage-notice.js'), release: await distOf('graph/modules.js') }
  }
  /**
   * The graph as `loadGraph` reads it (src/graph/store.ts), read synchronously
   * from the same pure parts. The reply has to be sent within the tick the
   * turn ends in: a read that waits for the file system comes back after the
   * headless runner has seen an idle agent and ended the run.
   */
  const loadGraphSync = (dir) => {
    const nodesDir = join(dir, modules.parse.NODES_DIR)
    let names = []
    try {
      names = modules.parse.nodeFileNames(readdirSync(nodesDir, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => entry.name))
    }
    catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    const files = []
    const revisions = new Map()
    for (const name of names) {
      const bytes = readFileSync(join(nodesDir, name))
      const revision = modules.store.revisionOf(bytes)
      files.push({ name, text: bytes.toString('utf8'), revision })
      revisions.set(name.slice(0, -'.json'.length), revision)
    }
    return modules.parse.parseGraph(files, modules.store.graphRevision(revisions))
  }
  const sessions = new Map()
  const stateOf = (session) => {
    let state = sessions.get(session.id)
    if (state === undefined) {
      state = { talk: talk.talkInit(session.header, 0), assistant: '', replied: 0, used: {}, handled: -1, stopArmed: false, stopped: false }
      sessions.set(session.id, state)
    }
    return state
  }
  /** The first missing item of the focus goal's requirement card, and whether the goal still has to be released. */
  const goalNeeds = (agentSession) => {
    const service = ctx.get('glmHournessGraph')
    const dir = service?.dirFor?.(agentSession.header.cwd)
    const focus = service?.focusOf?.(agentSession)
    if (dir === undefined || focus === undefined) return {}
    const graph = loadGraphSync(dir)
    const goal = modules.stage.goalOf(graph, focus)
    if (goal === undefined) return {}
    const status = modules.stage.stageStatus(graph, goal)
    if (status.stage === 'wish' || status.stage === 'interview') {
      const next = modules.notice.nextInterviewItem(status.items.filter(item => !item.ok))
      if (next !== undefined) return { missing: next.item.key }
    }
    const released = status.stage === 'release'
    const inDesign = released && modules.release.isSplit(graph, goal) && modules.release.modulesOf(graph, goal).some(module => modules.stage.effectiveStage(module) === 'design')
    return { unreleased: !released || inDesign }
  }
  /** What the goal in focus needs, or nothing when the graph cannot be read (the person then says nothing about the goal). */
  const readNeeds = (session) => {
    try {
      return goalNeeds(session)
    }
    catch (error) {
      note({ kind: 'reply-failed', reason: `the graph could not be read: ${error instanceof Error ? error.message : String(error)}` })
      return {}
    }
  }
  const answer = async (session, state) => {
    const agent = ctx.get('agents')?.get(session.id)
    if (agent === undefined) return
    // After the stop the person is gone: no replies, no silents, nothing recorded.
    if (state.stopped) return
    /** The turn after the release was approved: one stop sentence, then silence. */
    const saying = state.stopArmed && typeof config.stop === 'string' ? config.stop : undefined
    if (saying !== undefined) {
      state.stopped = true
      state.replied += 1
      note({ kind: 'reply', rule: 7, text: saying, shown: [] })
      await Promise.resolve()
      agent.followup({ id: `simulated-human-${session.id}-${state.replied}`, role: 'user', content: [{ type: 'text', text: saying }], source: { kind: 'user' } })
      return
    }
    const lastPerson = state.talk.people.at(-1)?.seq ?? -1
    const shown = state.talk.shown.filter(entry => entry.seq > lastPerson && entry.seq > state.handled)
    const needs = shown.length === 0 ? readNeeds(session) : {}
    const result = simulatedReply({ config, replied: state.replied, lastAssistant: state.assistant, shown, used: state.used, ...needs })
    note({ kind: result.kind, rule: result.rule, ...result.text === undefined ? {} : { text: result.text }, shown: result.shown })
    if (result.kind !== 'reply') return
    state.replied += 1
    state.used = result.used
    if (result.armed === true) state.stopArmed = true
    if (shown.length > 0) state.handled = shown.at(-1).seq
    // The session log cannot take the reply while it is publishing the event that brought us here, but one microtask later it can, and the agent is still finishing the turn, so the run goes on with the reply as the next turn. Any later (a timer) and the headless runner has already decided the run is over.
    await Promise.resolve()
    agent.followup({ id: `simulated-human-${session.id}-${state.replied}`, role: 'user', content: [{ type: 'text', text: result.text }], source: { kind: 'user' } })
  }
  const listeners = []
  if (config.enabled) {
    listeners.push(ctx.on('session/event', (session, event) => {
      if (session.header?.origin !== undefined || talk === undefined) return
      const state = stateOf(session)
      state.talk = talk.talkApply(state.talk, event)
      if (event.type === 'assistant/message') {
        const blocks = event.data?.message?.content ?? []
        const text = blocks.filter(block => block.type === 'text').map(block => block.text).join('\n')
        if (text.length > 0) state.assistant = text
        // A message that calls no tool ends the turn: the person answers while the agent is still finishing it, so that the reply is taken as the next turn of the same run.
        if (!blocks.some(block => block.type === 'tool-call')) answer(session, state).catch(error => note({ kind: 'reply-failed', reason: error instanceof Error ? error.message : String(error) }))
      }
      else if (event.type === 'turn/start') state.assistant = ''
    }))
  }
  const stop = ctx.on('agent/created', async ({ agent }) => {
    agent.ctx.on('user-questions/request', (request) => {
      note({ kind: 'unexpected-question', id: (request.questions ?? []).map(question => question.id) })
      return Promise.reject(cancelled())
    })
    if (config.enabled) await load().catch(error => note({ kind: 'reply-failed', reason: `the built package could not be loaded: ${error instanceof Error ? error.message : String(error)}` }))
    // Only a root agent has a person to type for it; a delegated child carries `origin` in its session header.
    if (wishLine === undefined || typed || agent.session?.header?.origin !== undefined) return
    typed = true
    try {
      const run = await ctx.get('commands').execute(agent, wishLine, [], new AbortController().signal)
      if (run === undefined) note({ kind: 'wish-failed', reason: `${wishLine.split(' ')[0]} is not registered` })
      else note({ kind: 'wish', line: wishLine, result: run.result.kind, text: run.result.text })
    }
    catch (error) {
      note({ kind: 'wish-failed', reason: error instanceof Error ? error.message : String(error) })
    }
  })
  return () => {
    stop()
    for (const off of listeners) off()
  }
}
