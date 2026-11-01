/**
 * record_human_answer (docs/ORCHESTRATION.md §3.5; decision d-chat-not-cards):
 * the main agent records what the human said back to a matter it put to them.
 * The human has no button to press: what they said is in the session log, the
 * main agent quotes it, and the harness checks that every quote is a whole
 * phrase of a message the human sent after the matter was put to them
 * (personSaid, src/design/talk.ts). Only then is anything written to the
 * graph, as the llm with the human's words as relay, which gives the write the
 * human's authority. The three replies, agreeing, adding and rejecting, are
 * written in the words fixed in src/shared/answer-marks.ts. Kind question
 * records the reply to a matter; kind delegation records "this kind is yours
 * to decide" in the node norm-delegations, the only way that node is written.
 * The replies to confirm and release come with the steps that open those kinds.
 */
import { openEngine, type ApplyResult } from '../graph/engine.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import { plainWordsIn } from '../graph/plain-question.ts'
import { PROPOSAL_LIMITS, codePointCount, normalizeText } from '../graph/proposal.ts'
import type { GraphNode } from '../graph/schema.ts'
import { goalOf } from '../graph/stage.ts'
import { ANSWER_MARKS, DELEGATED, DELEGATIONS_ID, DELEGATION_LIMIT, DELEGATION_REASON, DELEGATION_SUFFIX, answerCallMark, delegationKindOf, type AnswerKind } from '../shared/answer-marks.ts'
import type { ToolDefinitionLike } from '../shared/dsh-min.ts'
import { RECORD_HUMAN_ANSWER } from '../shared/tool-names.ts'
import { askBoard, attachDigest, boardOfBody, piecesNotShown } from './attach.ts'
import { emitMetric } from './metrics.ts'
import type { DesignToolDeps } from './propose.ts'
import { normalizeTalk, personSaid, type Shown, type TalkState } from './talk.ts'
import { errorText, isRecord, mainAgentCall, readGraph, refuse, refuseWith, toolShell } from './tool-support.ts'

const ANSWERS = ['agree', 'add', 'reject'] as const satisfies readonly AnswerKind[]
const KINDS = ['question', 'confirm', 'release', 'delegation'] as const
const CALL_FIELDS = new Set(['kind', 'goal', 'module', 'question', 'answer', 'way', 'words', 'recordedAs', 'scope', 'undo'])
const DELEGATION_FIELDS = new Set(['kind', 'scope', 'undo', 'words'])
const WORDS_LIMITS = { pieces: 3, piece: 500, whole: 2000 } as const
const SCOPE_LIMIT = 60

const DESCRIPTION = 'Record what the human said back to a matter you put to them with propose_to_human. Quote their own words exactly, from a message they sent after you showed it (words: 1 to 3 quotes, each a whole phrase); recordedAs is one line of what you take them to have said: the conclusion when they agree, your restatement when they add or reject. For a choose question they agree to, way is the number of the way they picked. The harness checks the quotes against their messages before it writes anything. Agree decides the question; add and reject note it and leave it open: revise the matter and show it again. kind delegation: when the human says a whole kind of matter is yours to decide, pass scope (the kind, in their words) and their words from the latest message they sent; undo: true takes a kind back.'

const PARAMETERS = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: [...KINDS] },
    goal: { type: 'string', description: 'kind confirm or release: the goal id.' },
    module: { type: 'string', description: 'kind release: the module released; leave out for the goal itself.' },
    question: { type: 'string', description: 'kind question: the id of the question you put.' },
    answer: { type: 'string', enum: [...ANSWERS], description: 'agree: they accept; add: they want something added; reject: they turn it down.' },
    way: { type: 'integer', description: 'kind question, a choose question they agree to: the number of the way they picked, from 1. Leave it out when they hand the whole matter to you (recordedAs begins with 交给主 Agent 定：).' },
    words: { type: 'array', items: { type: 'string' }, description: 'The human\'s own words, 1 to 3 quotes of at most 500 characters, each a whole phrase of a message they sent.' },
    recordedAs: { type: 'string', description: 'One line, at most 120 characters: the conclusion when they agree, your restatement of what they said when they add or reject.' },
    scope: { type: 'string', description: 'kind delegation: the kind of matter, in the human\'s words, one line, at most 60 characters.' },
    undo: { type: 'boolean', description: 'kind delegation: the human takes the kind back.' },
  },
  required: ['kind', 'words'],
  additionalProperties: false,
} as const

const OUTPUT = {
  type: 'object',
  properties: {
    outcome: { type: 'string', enum: ['decided', 'confirmed', 'released', 'partial', 'added', 'rejected', 'delegated', 'revoked', 'unchanged'] },
    message: { type: 'string' },
    stage: { type: 'string' },
    module: { type: 'string' },
    modules: { type: 'array', items: { type: 'string' } },
    approved: { type: 'array', items: { type: 'string' } },
    skipped: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, code: { type: 'string' } }, required: ['id', 'code'] } },
    handedBack: { type: 'string' },
    scopes: { type: 'array', items: { type: 'string' } },
  },
  required: ['outcome', 'message'],
} as const

const NOT_SHOWN_HINT = 'The human has not seen the exact command text and cautions; show the text from propose_to_human again, verbatim, and ask again'
const SAMPLE_NOT_SHOWN = 'The human has not seen the whole page or sample they must see before agreeing; show the text from propose_to_human again, verbatim, and ask again'
const WORDS_HINT = 'quote the human\'s own words exactly, from a message they sent after you showed the proposal; if they have not answered yet, end your turn and wait'
const BOUNDARY_HINT = 'quote whole phrases, from one punctuation mark or line break to the next'
const LATEST_HINT = 'the words must be in the latest message the human sent; if they said it earlier, ask them to say it again'
const REVOKE_REASON = '人在对话里把这一类收回去：'

interface Words {
  readonly words: readonly string[]
}

interface QuestionArgs extends Words {
  readonly question: string
  readonly answer: AnswerKind
  readonly way?: number
  readonly recordedAs: string
}

interface DelegationArgs extends Words {
  readonly scope: string
  readonly undo: boolean
}

type Args = { readonly kind: 'question' } & QuestionArgs | { readonly kind: 'delegation' } & DelegationArgs

function parseWords(words: unknown): readonly string[] {
  if (!Array.isArray(words) || words.length < 1 || words.length > WORDS_LIMITS.pieces || words.some(piece => typeof piece !== 'string' || piece.trim().length === 0 || codePointCount(piece.trim()) > WORDS_LIMITS.piece)) {
    refuse('invalid', `words must be 1 to ${WORDS_LIMITS.pieces} quotes of 1 to ${WORDS_LIMITS.piece} characters`, WORDS_HINT, 'words')
  }
  const quotes = (words as string[]).map(piece => piece.trim())
  if (quotes.join('\n').length > WORDS_LIMITS.whole) refuse('invalid', `the quotes are longer than ${WORDS_LIMITS.whole} characters together`, 'quote the sentences that answer, not the whole conversation', 'words')
  return quotes
}

/** Compared and written the way the quotes of the human are: NFKC, one space for a run of white space. */
function scopeOf(value: unknown): string {
  if (typeof value !== 'string') refuse('invalid', 'scope is required: the kind of matter, in the human\'s words', 'pass the kind the human handed over, one line', 'scope')
  const scope = normalizeText(value)
  if (scope.length === 0 || /[\r\n]/.test(value.trim()) || codePointCount(scope) > SCOPE_LIMIT) refuse('invalid', `scope must be one line of 1 to ${SCOPE_LIMIT} characters`, 'name the kind in a few words, as the human said it', 'scope')
  const hit = plainWordsIn(scope)[0]
  if (hit !== undefined) refuse('invalid', `scope uses the word ${hit}, which the human has not learned`, 'say the kind in plain words', 'scope')
  return scope
}

function parseArgs(raw: unknown): Args {
  if (!isRecord(raw)) refuse('invalid', 'the arguments must be a JSON object', 'pass {kind, question, answer, words, recordedAs} or {kind: delegation, scope, words}')
  const extra = Object.keys(raw).find(key => !CALL_FIELDS.has(key))
  if (extra !== undefined) refuse('invalid', `${extra} is not a field of ${RECORD_HUMAN_ANSWER}`, `${RECORD_HUMAN_ANSWER} takes ${[...CALL_FIELDS].join(', ')}`, extra)
  const { kind } = raw
  if (kind === 'delegation') {
    const stray = Object.keys(raw).find(key => !DELEGATION_FIELDS.has(key))
    if (stray !== undefined) refuse('invalid', `${stray} does not go with kind delegation`, 'kind delegation takes kind, scope, undo and words', stray)
    if (raw.undo !== undefined && typeof raw.undo !== 'boolean') refuse('invalid', 'undo must be true or false', 'pass undo: true to take a kind back', 'undo')
    return { kind, scope: scopeOf(raw.scope), undo: raw.undo === true, words: parseWords(raw.words) }
  }
  if (kind !== 'question') {
    refuse('invalid', `kind ${typeof kind === 'string' ? kind : JSON.stringify(kind)} is not open yet`, 'not yet: only kind question and kind delegation work for now', 'kind')
  }
  for (const field of ['goal', 'module', 'scope', 'undo'] as const) {
    if (raw[field] !== undefined) refuse('invalid', `${field} does not go with kind question`, `leave ${field} out for kind question`, field)
  }
  const { question, answer, way, recordedAs } = raw
  if (typeof question !== 'string' || question.length === 0) refuse('invalid', 'question must be the id of the question', 'pass the id propose_to_human returned', 'question')
  if (typeof answer !== 'string' || !(ANSWERS as readonly string[]).includes(answer)) refuse('invalid', `answer must be one of ${ANSWERS.join(', ')}`, 'agree when they accept, add when they want something added, reject when they turn it down', 'answer')
  if (way !== undefined && (typeof way !== 'number' || !Number.isInteger(way) || way < 1)) refuse('invalid', 'way must be a whole number from 1', 'pass the number of the way the human picked', 'way')
  const quotes = parseWords(raw.words)
  if (typeof recordedAs !== 'string' || recordedAs.trim().length === 0 || /[\r\n]/.test(recordedAs) || codePointCount(recordedAs.trim()) > PROPOSAL_LIMITS.conclusion) {
    refuse('invalid', `recordedAs must be one line of 1 to ${PROPOSAL_LIMITS.conclusion} characters`, 'write what you take the human to have said in one line', 'recordedAs')
  }
  return { kind, question, answer: answer as AnswerKind, ...way === undefined ? {} : { way }, words: quotes, recordedAs: recordedAs.trim() }
}

/** The time after which the human's words count: the question's last proposal, edit or decision. A question decided once can be decided again, but only by what the human says after that. */
function startOf(node: GraphNode): number {
  const last = node.history.filter(entry => entry.op === 'propose' || entry.op === 'edit' || entry.op === 'decide').at(-1)
  return last === undefined ? 0 : Date.parse(last.at)
}

/** The reason code a refusal carries, for the metrics. */
function codeOf(error: unknown): string {
  try {
    const parsed: unknown = JSON.parse(errorText(error))
    return isRecord(parsed) && typeof parsed.code === 'string' ? parsed.code : 'invalid'
  }
  catch {
    return 'invalid'
  }
}

export function recordTool(deps: DesignToolDeps): ToolDefinitionLike {
  return {
    ...toolShell(RECORD_HUMAN_ANSWER, DESCRIPTION, PARAMETERS, OUTPUT),
    async execute(raw, exec) {
      const { context, agent } = mainAgentCall(deps.isMainAgent, exec, { message: `${RECORD_HUMAN_ANSWER} is for the main agent`, hint: 'only the main agent records the human\'s words; the human turns main agent mode on with /wish' })
      let emitted = false
      let kind = 'question'
      try {
        const args = parseArgs(raw)
        kind = args.kind
        const where = deps.graph(agent)
        if (where === undefined) refuse('not_found', 'the project graph is not here', 'the graph row is off or the graph directory does not exist; tell the human')
        const graph = await readGraph(where.dir)
        const state = deps.talk(agent)
        if (state === undefined) {
          deps.report(agent, 'degraded', '读不到会话里人的消息，没有记下人的回话')
          refuse('unavailable', 'the harness cannot read this session\'s messages, so nothing was recorded', 'tell the human that their reply could not be recorded')
        }
        const refusedWords = (said: Extract<ReturnType<typeof personSaid>, { ok: false }>, extra: string): never => {
          emitMetric({ event: 'design.answer-refused', kind, reason: said.offBoundary ? 'words-off-boundary' : 'words-not-found' })
          emitted = true
          return refuse('invalid', said.reason, said.offBoundary ? `${WORDS_HINT}; ${BOUNDARY_HINT}${extra}` : `${WORDS_HINT}${extra}`, 'words')
        }
        if (args.kind === 'delegation') return await delegate(where, graph, state, args, context.callId, refusedWords)
        return await answer(deps, where, graph, state, args, context.callId, refusedWords)
      }
      catch (error) {
        if (!emitted) emitMetric({ event: 'design.answer-refused', kind, reason: codeOf(error) })
        throw error
      }
    },
  }
}

type Where = NonNullable<ReturnType<DesignToolDeps['graph']>>
type Refuse = (said: Extract<ReturnType<typeof personSaid>, { ok: false }>, extra: string) => never

async function answer(deps: DesignToolDeps, where: Where, graph: LoadedGraph, state: TalkState, args: QuestionArgs, call: string, refusedWords: Refuse): Promise<Record<string, unknown>> {
  const node = graph.nodes.get(args.question)
  if (node === undefined) refuse('not_found', `no node "${args.question}"`, 'pass the id propose_to_human returned', 'question')
  if (node.type !== 'question' || node.options !== undefined) refuse('invalid', `"${node.id}" is not a question in the proposal shape`, 'pass the id of a question you put with propose_to_human', 'question')
  if (node.status !== 'approved' && node.status !== 'doing' && node.status !== 'done') refuse('invalid', `"${node.id}" is ${node.status}`, 'it is closed; put a new question', 'question')
  const delegated = args.recordedAs.startsWith(DELEGATED)
  checkWay(node, args, delegated)

  const start = startOf(node)
  const said = personSaid(state, args.words, start)
  if (!said.ok) refusedWords(said, '')
  const shown = state.shown.filter(entry => entry.question === node.id && entry.time >= start)
  const tail = args.answer === 'agree' ? await proof(deps, where.cwd, node, shown.at(-1)) : ''
  if (args.answer === 'agree') sampleSeen(shown)

  await write(where.dir, graph, node, args, said.ok ? said.relay : '', call, tail)
  const handedBack = args.answer === 'agree' ? await handBack(deps, where, node, said.ok ? said.relay : '') : undefined
  const outcome = args.answer === 'agree' ? 'decided' : args.answer === 'add' ? 'added' : 'rejected'
  const firstReply = state.people.find(message => message.time > start)
  emitMetric({
    event: 'design.answer-recorded',
    kind: 'question',
    form: node.form,
    answer: args.answer,
    outcome,
    goal: goalOf(graph, node.id)?.id,
    question: node.id,
    delayMs: firstReply === undefined ? undefined : firstReply.time - start,
    codePoints: codePointCount(said.ok ? said.relay : ''),
    restated: firstReply?.restated,
    delegated,
    pickedRecommended: node.form === 'choose' && args.answer === 'agree' && !delegated ? args.way === node.ways?.length : undefined,
  })
  return { outcome, message: messageOf(outcome, node.id), ...handedBack === undefined ? {} : { handedBack } }
}

/** Which way the human picked: given for the agreement to a choose question, unless they handed the whole matter over; refused anywhere else. */
function checkWay(node: GraphNode, args: QuestionArgs, delegated: boolean): void {
  const count = node.ways?.length ?? 0
  if (args.way !== undefined) {
    if (args.answer !== 'agree' || node.form !== 'choose') refuse('invalid', 'way is for the agreement to a choose question', 'leave way out; it says which of the ways the human picked', 'way')
    if (delegated) refuse('invalid', 'way is not given when the human hands the whole matter to you', 'leave way out when recordedAs begins with 交给主 Agent 定：', 'way')
    if (args.way > count) refuse('invalid', `way ${args.way} is beyond the ${count} ways of "${node.id}"`, `pass a number from 1 to ${count}: the way the human picked`, 'way')
    return
  }
  if (args.answer === 'agree' && node.form === 'choose' && !delegated) {
    refuse('invalid', `way is required: "${node.id}" is a choose question`, `pass the number of the way the human picked, from 1 to ${count}; if they left it to you, begin recordedAs with 交给主 Agent 定：`, 'way')
  }
}

function messageOf(outcome: 'decided' | 'added' | 'rejected', id: string): string {
  if (outcome === 'decided') return `Recorded: the human agreed, and ${id} is decided. Carry on from the conclusion.`
  if (outcome === 'added') return `Recorded: the human added to ${id}. Work it into the plan, revise the matter with propose_to_human (question ${id}) and show it again.`
  return `Recorded: the human turned ${id} down. Plan another way and put it to them the same way; if what they want is that it need not be decided at all, or another way of asking, set the question to dropped with graph_status and their words as relay, and put a new one with propose_to_human.`
}

/**
 * The part of the reason that proves the human was shown the original text:
 * when the question carries a proposal of a board that has one, the board is
 * asked again, and every piece it says the human must see has to be in what
 * the main agent said after putting the question. Empty for a question
 * without such a proposal, and when the board is not running here (it then
 * does not act on the agreement either; the human agrees again once it is).
 */
async function proof(deps: DesignToolDeps, cwd: string | undefined, node: GraphNode, shown: Shown | undefined): Promise<string> {
  const found = boardOfBody(deps.boards, node.body)
  if (found === undefined) return ''
  const service = found.board.service(deps.lookup)
  if (service === undefined) return ''
  const reply = await askBoard(service, cwd, found.id)
  if (!reply.ok) refuse('invalid', `${found.board.board} refused it: ${reply.message}`, 'tell the human; nothing was recorded', 'attach')
  if (reply.detail === undefined) return ''
  if (piecesNotShown(reply.detail, shown?.after ?? '').length > 0) {
    refuse('not_shown', 'The human has not seen the exact command text and cautions of the proposal', NOT_SHOWN_HINT)
  }
  return ` · 已给人看原文 ${attachDigest(reply.detail)}`
}

/** A sample the question was shown with must be whole in what the main agent said after it, as the human reads it. */
function sampleSeen(shown: readonly Shown[]): void {
  const last = shown.filter(entry => entry.exact !== undefined).at(-1)
  if (last?.exact === undefined) return
  if (!normalizeTalk(last.after).includes(normalizeTalk(last.exact))) refuse('not_shown', 'The human has not seen the whole sample they must see before agreeing', SAMPLE_NOT_SHOWN)
}

/** The writes of one reply: the decision with the human's words as relay, or a note on the question. One retry when the node moved under the write. */
async function write(dir: string, graph: LoadedGraph, node: GraphNode, args: QuestionArgs, relay: string, call: string, tail: string): Promise<void> {
  const engine = openEngine(dir)
  const mark = answerCallMark(call)
  let current = graph
  let latest: ApplyResult | undefined
  for (let attempt = 0; attempt < 2; attempt++) {
    latest = args.answer === 'agree'
      ? await engine.apply('llm', { op: 'decide', id: node.id, rev: current.revisions.get(node.id)!, conclusion: args.recordedAs, reason: `${ANSWER_MARKS.agree}${mark}${tail}`, relay })
      : await engine.apply('llm', { op: 'comment', id: node.id, text: `${ANSWER_MARKS[args.answer]}「${relay}」；主 Agent 记成：${args.recordedAs}${mark}` })
    if (latest.ok || latest.error.code !== 'stale_revision') break
    current = await readGraph(dir)
  }
  const final = latest!
  if (final.ok) return
  refuseWith(final.error.code === 'stale_revision' ? { ok: false, error: { ...final.error, hint: `nothing more was recorded; the human said: ${relay}` } } : final)
}

/** After a decision: the board whose proposal the question carries is told, and its answer is what the main agent reads. */
async function handBack(deps: DesignToolDeps, where: { readonly dir: string, readonly cwd: string | undefined }, node: GraphNode, relay: string): Promise<string | undefined> {
  const found = boardOfBody(deps.boards, node.body)
  if (found === undefined) return undefined
  const service = found.board.service(deps.lookup)
  if (service === undefined) return undefined
  try {
    return await service.acceptProposal({ questionId: node.id, graphDir: where.dir, cwd: where.cwd, by: { actor: 'llm', relay } })
  }
  catch (error) {
    return `could not hand back to ${found.board.board}: ${errorText(error)}; it reconciles from the graph within a minute`
  }
}

/** The kind an acceptance item of norm-delegations stands for: the item without its ending, normalised the way a scope is. */
function kindOfItem(item: string): string {
  return normalizeText(delegationKindOf(item))
}

/**
 * "This kind is yours" (and its undo): the only way norm-delegations is
 * written. The graph tools refuse that node (guard rule
 * main-agent-graph-delegations) because they cannot check whose words a
 * lasting authorisation rests on; here the words are checked against the
 * latest message the human sent, then the node is written with them as relay.
 */
async function delegate(where: Where, graph: LoadedGraph, state: TalkState, args: DelegationArgs, call: string, refusedWords: Refuse): Promise<Record<string, unknown>> {
  // The words are a record made on the spot, not an old message turned into a new authorisation.
  const said = personSaid(state, args.words, state.people.at(-2)?.time ?? 0)
  if (!said.ok) refusedWords(said, `; ${LATEST_HINT}`)
  const relay = said.ok ? said.relay : ''
  const engine = openEngine(where.dir)
  const mark = answerCallMark(call)
  const reason = `${args.undo ? REVOKE_REASON : DELEGATION_REASON}${args.scope}${mark}`
  const result = await delegation(engine, where, graph, args, relay, reason)
  emitMetric({ event: 'design.delegation', action: result.action, count: result.scopes.length, codePoints: codePointCount(args.scope), store: 'graph' })
  const told = args.undo ? '这类我以后还是先问你' : `以后「${args.scope}」这类我定，只在下一批里告诉你，不对就说`
  const message = result.outcome === 'unchanged'
    ? `Nothing changed: "${args.scope}" is already a kind you decide.`
    : `Recorded. Tell the human now, in one sentence: ${told}.`
  return { outcome: result.outcome, message, scopes: result.scopes }
}

interface Delegated {
  readonly outcome: 'delegated' | 'revoked' | 'unchanged'
  readonly action: 'add' | 'remove' | 'unchanged'
  readonly scopes: readonly string[]
}

async function delegation(engine: ReturnType<typeof openEngine>, where: Where, graph: LoadedGraph, args: DelegationArgs, relay: string, reason: string): Promise<Delegated> {
  const node = graph.nodes.get(DELEGATIONS_ID)
  if (node !== undefined && node.type !== 'norm') refuse('invalid', `"${DELEGATIONS_ID}" is not a norm`, 'tell the human; the node needs their attention', 'scope')
  if (node !== undefined && (node.status === 'dropped' || node.status === 'superseded')) refuse('invalid', `"${DELEGATIONS_ID}" is ${node.status}`, 'tell the human; the node needs their attention', 'scope')
  const items = node?.acceptance ?? []
  const kinds = items.map(kindOfItem)
  if (args.undo) {
    const at = kinds.indexOf(args.scope)
    if (node === undefined || at < 0) refuse('invalid', `"${args.scope}" is not a kind you decide`, kinds.length === 0 ? 'no kind is handed over to you' : `the kinds handed over: ${kinds.join('；')}`, 'scope')
    const rest = items.filter((_, index) => index !== at)
    await edit(engine, where.dir, graph, node, rest, relay, reason)
    return { outcome: 'revoked', action: 'remove', scopes: rest.map(kindOfItem) }
  }
  const item = `${args.scope}${DELEGATION_SUFFIX}`
  if (node === undefined) {
    const goal = where.focus === undefined ? undefined : goalOf(graph, where.focus)?.id
    if (goal === undefined) refuse('invalid', 'no goal is in your focus, so the kinds have no place to be kept', 'graph_focus the goal first', 'scope')
    const done = await engine.apply('llm', { op: 'propose', reason, relay, node: { id: DELEGATIONS_ID, type: 'norm', title: '交给主 Agent 定的几类事', parent: goal, acceptance: [item] } })
    if (!done.ok) refuseWith(done)
    return { outcome: 'delegated', action: 'add', scopes: [args.scope] }
  }
  if (kinds.includes(args.scope)) return { outcome: 'unchanged', action: 'unchanged', scopes: kinds }
  if (items.length >= DELEGATION_LIMIT) refuse('invalid', `${DELEGATIONS_ID} holds ${DELEGATION_LIMIT} kinds already`, 'ask the human which kinds to take back first', 'scope')
  await edit(engine, where.dir, graph, node, [...items, item], relay, reason)
  return { outcome: 'delegated', action: 'add', scopes: [...kinds, args.scope] }
}

/** Sets the acceptance items of the node, once more on a node that moved under the write. */
async function edit(engine: ReturnType<typeof openEngine>, dir: string, graph: LoadedGraph, node: GraphNode, acceptance: readonly string[], relay: string, reason: string): Promise<void> {
  let current = graph
  let latest: ApplyResult | undefined
  for (let attempt = 0; attempt < 2; attempt++) {
    latest = await engine.apply('llm', { op: 'edit', id: node.id, rev: current.revisions.get(node.id)!, reason, relay, set: { acceptance } })
    if (latest.ok || latest.error.code !== 'stale_revision') break
    current = await readGraph(dir)
  }
  if (!latest!.ok) refuseWith(latest!)
}
