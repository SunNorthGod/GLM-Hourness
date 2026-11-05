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
 * records the reply to a matter; kind confirm records the reply to the
 * requirement of a goal, and agreeing moves the goal from the interview into
 * the design (the only way a goal leaves it: the graph tools refuse, rule
 * main-agent-graph-stage); kind delegation records "this kind is yours to
 * decide" in the node norm-delegations, the only way that node is written.
 * Kind release records the reply to a design put to the human: agreeing
 * approves what the human was shown (the revisions recorded when it was shown)
 * and moves the goal, or one module of it, to release, in the order of
 * releaseWrites.
 */
import { createHash } from 'node:crypto'
import { openEngine, type ApplyResult, type GraphEngine } from '../graph/engine.ts'
import { isSplit } from '../graph/modules.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import { plainWordsIn } from '../graph/plain-question.ts'
import { PROPOSAL_LIMITS, codePointCount, normalizeText } from '../graph/proposal.ts'
import type { GraphNode } from '../graph/schema.ts'
import { bigLoopSet, goalOf, moduleSet, releaseSet } from '../graph/stage.ts'
import { releaseUserPage, renderUserGraph, userGraphOf, type UserPage } from '../graph/user-graph.ts'
import { ANSWER_MARKS, DELEGATED, DELEGATIONS_ID, DELEGATION_LIMIT, DELEGATION_REASON, DELEGATION_SUFFIX, answerCallMark, delegationKindOf, type AnswerKind } from '../shared/answer-marks.ts'
import type { ToolDefinitionLike } from '../shared/dsh-min.ts'
import { RECORD_HUMAN_ANSWER } from '../shared/tool-names.ts'
import { askBoard, attachDigest, boardOfBody, piecesNotShown } from './attach.ts'
import { toMetricsId } from '../shared/metrics.ts'
import { emitDesign, msOf, optionalId, type DesignMetricEvent } from './metrics.ts'
import type { DesignToolDeps } from './propose.ts'
import { normalizeTalk, personSaid, quotedMessage, type Shown, type TalkState } from './talk.ts'
import { confirmGate, errorText, isRecord, mainAgentCall, moduleOfGoal, openGoal, readGraph, refuse, refuseWith, releaseReady, toolShell } from './tool-support.ts'

const ANSWERS = ['agree', 'add', 'reject'] as const satisfies readonly AnswerKind[]
const KINDS = ['question', 'confirm', 'release', 'delegation'] as const
const CALL_FIELDS = new Set(['kind', 'goal', 'module', 'question', 'answer', 'way', 'words', 'recordedAs', 'scope', 'undo'])
const DELEGATION_FIELDS = new Set(['kind', 'scope', 'undo', 'words'])
const WORDS_LIMITS = { pieces: 3, piece: 500, whole: 2000 } as const
const SCOPE_LIMIT = 60

const DESCRIPTION = 'Record what the human said back to a matter you put to them with propose_to_human. Quote their own words exactly, from a message they sent after you showed it (words: 1 to 3 quotes, each a whole phrase); recordedAs is one line of what you take them to have said: the conclusion when they agree, your restatement when they add or reject. For a choose question they agree to, way is the number of the way they picked. The harness checks the quotes against their messages before it writes anything. Agree decides the question; add and reject note it and leave it open: revise the matter and show it again. kind confirm: the reply to the requirement you put to them with propose_to_human (kind confirm); pass goal instead of question. Agree approves the goal and moves it from the interview into the design (the harness checks the requirement card again first, and that the user page shown with it is whole in your reply and has not changed since; when it has, put it to them again); add and reject note the goal and move nothing: change the goal and put the requirement to them again. kind release: the reply to the design you put to them with propose_to_human (kind release); pass goal, and module when it was a module. Agree approves what they were shown and moves the goal, or the module, to release (the harness checks the design again first, and the user page as for a confirm; for a goal split into modules the framework release makes the candidates modules, each in design, and the goal is released); add and reject note the goal or the module and move nothing: change the design and put it to them again. kind delegation: when the human says a whole kind of matter is yours to decide, pass scope (the kind, in their words) and their words from the latest message they sent; undo: true takes a kind back.'

const PARAMETERS = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: [...KINDS] },
    goal: { type: 'string', description: 'kind confirm or release: the goal id.' },
    module: { type: 'string', description: 'kind release: the module released; leave out for the goal itself (the framework of a goal split into modules).' },
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
const PAGE_CHANGED = 'nothing was recorded: put it to the human again with propose_to_human, show the new text verbatim and ask again'
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

interface ConfirmArgs extends Words {
  readonly goal: string
  readonly answer: AnswerKind
  readonly recordedAs: string
}

interface ReleaseArgs extends ConfirmArgs {
  readonly module?: string
}

interface DelegationArgs extends Words {
  readonly scope: string
  readonly undo: boolean
}

type Args = { readonly kind: 'question' } & QuestionArgs | { readonly kind: 'confirm' } & ConfirmArgs | { readonly kind: 'release' } & ReleaseArgs | { readonly kind: 'delegation' } & DelegationArgs

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
  if (kind !== 'question' && kind !== 'confirm' && kind !== 'release') {
    refuse('invalid', `kind ${typeof kind === 'string' ? kind : JSON.stringify(kind)} is not one of ${KINDS.join(', ')}`, 'pass kind question, confirm, release or delegation', 'kind')
  }
  for (const field of kind === 'question' ? ['goal', 'module', 'scope', 'undo'] as const : kind === 'confirm' ? ['question', 'way', 'module', 'scope', 'undo'] as const : ['question', 'way', 'scope', 'undo'] as const) {
    if (raw[field] !== undefined) refuse('invalid', `${field} does not go with kind ${kind}`, `leave ${field} out for kind ${kind}`, field)
  }
  const { question, answer, way, recordedAs, goal, module } = raw
  if (kind !== 'question' && (typeof goal !== 'string' || goal.length === 0)) refuse('invalid', `goal must be the id of the goal whose ${kind === 'confirm' ? 'requirement' : 'design'} you put to the human`, 'pass the goal id propose_to_human returned', 'goal')
  if (module !== undefined && (typeof module !== 'string' || module.length === 0)) refuse('invalid', 'module must be the id of the module you put to the human', 'pass the module id propose_to_human returned, or leave module out for the goal itself', 'module')
  if (kind === 'question' && (typeof question !== 'string' || question.length === 0)) refuse('invalid', 'question must be the id of the question', 'pass the id propose_to_human returned', 'question')
  if (typeof answer !== 'string' || !(ANSWERS as readonly string[]).includes(answer)) refuse('invalid', `answer must be one of ${ANSWERS.join(', ')}`, 'agree when they accept, add when they want something added, reject when they turn it down', 'answer')
  if (way !== undefined && (typeof way !== 'number' || !Number.isInteger(way) || way < 1)) refuse('invalid', 'way must be a whole number from 1', 'pass the number of the way the human picked', 'way')
  const quotes = parseWords(raw.words)
  if (typeof recordedAs !== 'string' || recordedAs.trim().length === 0 || /[\r\n]/.test(recordedAs) || codePointCount(recordedAs.trim()) > PROPOSAL_LIMITS.conclusion) {
    refuse('invalid', `recordedAs must be one line of 1 to ${PROPOSAL_LIMITS.conclusion} characters`, 'write what you take the human to have said in one line', 'recordedAs')
  }
  if (kind === 'confirm') return { kind, goal: goal as string, answer: answer as AnswerKind, words: quotes, recordedAs: recordedAs.trim() }
  if (kind === 'release') return { kind, goal: goal as string, ...module === undefined ? {} : { module }, answer: answer as AnswerKind, words: quotes, recordedAs: recordedAs.trim() }
  return { kind, question: question as string, answer: answer as AnswerKind, ...way === undefined ? {} : { way }, words: quotes, recordedAs: recordedAs.trim() }
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
      const emit: Emit = (event) => { emitDesign(deps.lookup, agent, event) }
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
          emit({ k: 'design.answer-refused', body: { kind, code: said.offBoundary ? 'words-off-boundary' : 'words-not-found' } })
          emitted = true
          return refuse('invalid', said.reason, said.offBoundary ? `${WORDS_HINT}; ${BOUNDARY_HINT}${extra}` : `${WORDS_HINT}${extra}`, 'words')
        }
        if (args.kind === 'delegation') return await delegate(where, graph, state, args, context.callId, refusedWords, emit)
        if (args.kind === 'confirm') return await confirm(where, graph, state, args, context.callId, refusedWords, emit)
        if (args.kind === 'release') return await release(where, graph, state, args, context.callId, refusedWords, emit)
        return await answer(deps, where, graph, state, args, context.callId, refusedWords, emit)
      }
      catch (error) {
        if (!emitted) emit({ k: 'design.answer-refused', body: { kind, code: toMetricsId(codeOf(error)) } })
        throw error
      }
    },
  }
}

type Where = NonNullable<ReturnType<DesignToolDeps['graph']>>
type Refuse = (said: Extract<ReturnType<typeof personSaid>, { ok: false }>, extra: string) => never
type Emit = (event: DesignMetricEvent) => void

/** The wait and `noted` of a recorded answer: from the showing to the message the first quote is in, and whether the main agent's message before it restated the answer. */
function replyOf(state: TalkState, words: readonly string[], since: number): { readonly ms: number, readonly noted: boolean } {
  const reply = quotedMessage(state, words[0] ?? '', since)
  return { ms: reply === undefined ? 0 : msOf(reply.time - since), noted: reply?.restated ?? false }
}

async function answer(deps: DesignToolDeps, where: Where, graph: LoadedGraph, state: TalkState, args: QuestionArgs, call: string, refusedWords: Refuse, emit: Emit): Promise<Record<string, unknown>> {
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
  emit({
    k: 'design.answer-recorded',
    body: {
      kind: 'question',
      ...optionalId('form', node.form),
      answer: args.answer,
      outcome,
      goal: toMetricsId(goalOf(graph, node.id)?.id),
      pending: toMetricsId(node.id),
      ...replyOf(state, args.words, start),
      units: codePointCount(said.ok ? said.relay : ''),
      delegated,
      ...node.form === 'choose' && args.answer === 'agree' && !delegated ? { pickedRecommended: args.way === node.ways?.length } : {},
    },
  })
  return { outcome, message: messageOf(outcome, node.id), ...handedBack === undefined ? {} : { handedBack } }
}

/**
 * kind confirm: the reply to the requirement that propose_to_human put to the
 * human. Their words must come after the last time it was shown in this
 * session, and a sample shown with it must have been whole in what the main
 * agent said. Agreeing writes the goal from the interview into the design: the
 * requirement card is checked again (the graph may have changed since it was
 * shown), then its stage is set to design and the goal is approved if it still
 * is a proposal (confirmWrites), both with the human's words as relay. Adding and rejecting
 * note the goal and move nothing. Nothing is kept of `recordedAs` when the
 * human agrees: the goal's state is the record.
 */
async function confirm(where: Where, graph: LoadedGraph, state: TalkState, args: ConfirmArgs, call: string, refusedWords: Refuse, emit: Emit): Promise<Record<string, unknown>> {
  const goal = openGoal(graph, args.goal)
  const shown = state.shown.filter(entry => entry.kind === 'confirm' && entry.goal === goal.id && entry.module === undefined).at(-1)
  if (shown === undefined) refuse('not_shown', `the requirement of "${goal.id}" was not put to the human in this session`, 'show it with propose_to_human first, in this session', 'goal')
  const said = personSaid(state, args.words, shown.time)
  if (!said.ok) refusedWords(said, '')
  const relay = said.ok ? said.relay : ''
  if (args.answer === 'agree') {
    sampleSeen([shown])
    userPageSeen(shown, renderUserGraph(userGraphOf(graph, goal), 'confirm'))
  }
  const mark = answerCallMark(call)
  if (args.answer === 'agree') await confirmWrites(where.dir, graph, goal.id, relay, `${ANSWER_MARKS.agree}${mark}`)
  else {
    const noted = await openEngine(where.dir).apply('llm', { op: 'comment', id: goal.id, text: `${ANSWER_MARKS[args.answer]}「${relay}」；主 Agent 记成：${args.recordedAs}${mark}` })
    if (!noted.ok) refuseWith(noted)
  }
  const outcome = args.answer === 'agree' ? 'confirmed' : args.answer === 'add' ? 'added' : 'rejected'
  emit({ k: 'design.answer-recorded', body: { kind: 'confirm', answer: args.answer, outcome, goal: toMetricsId(goal.id), pending: toMetricsId(goal.id), ...replyOf(state, args.words, shown.time), units: codePointCount(relay) } })
  return { outcome, message: confirmMessage(outcome, goal.id), ...outcome === 'confirmed' ? { stage: 'design' } : {} }
}

function confirmMessage(outcome: 'confirmed' | 'added' | 'rejected', goal: string): string {
  if (outcome === 'confirmed') return `Recorded: the human confirmed the requirements. ${goal} is approved and in stage design. Start on the design: decisions with their five columns, and the plan under the goal.`
  if (outcome === 'added') return `Recorded: the human added to the requirements. Work it into ${goal} (its body, acceptance or non-goals), then put the requirement to them again with propose_to_human (kind confirm).`
  return `Recorded: the human turned the requirements down. Find out what they want different, change ${goal}, then put the requirement to them again with propose_to_human (kind confirm).`
}

/**
 * The first 8 hexadecimal characters of the SHA-256 of a release page, as
 * texts are compared (NFKC, white space as one space). The write that moves
 * a goal or a module to release names it, so that the page the human saw can
 * be found in the session log by the call and checked against the digest.
 */
export function pageDigest(page: string): string {
  return createHash('sha256').update(normalizeText(page)).digest('hex').slice(0, 8)
}

/** What the writes of an agreement to a release did: the nodes approved, those skipped and why, those still proposed in its scope, the candidates that became modules, and whether the stage was moved. */
interface Released {
  readonly approved: readonly string[]
  readonly skipped: ReadonlyArray<{ readonly id: string, readonly code: string }>
  readonly left: readonly string[]
  readonly modules: readonly string[]
  readonly complete: boolean
}

/** The outcome of one write: the engine's, or a disk that would not take it. */
type Written = ApplyResult | { readonly ok: false, readonly error: { readonly code: string, readonly message: string, readonly field?: string } }

/**
 * The writes of an agreement to a release, all as the llm with the human's
 * words as relay, each with the revision the human was shown (nodes that
 * changed since are skipped, the human agreed to the version they saw; nodes
 * that are no longer proposals are done already and are passed over, so the
 * same words finish what a stop left). The release gate is checked again
 * first. A goal that is not split: the proposals of the goal are approved,
 * then, if none is left, the goal's stage is set to release. A module: the
 * same with the proposals below it, then its stage. A goal split into modules,
 * the framework release, in this order (§3.14.2): the module candidates get
 * the stage design while they are still proposals, so that a stop at any point
 * leaves a goal that is split; then the set is approved; then, if none is left,
 * the goal's stage is set to release. A stop (a disk that will not take the
 * write) refuses with what is on the graph and the words, and recording the
 * same words finishes it.
 */
async function releaseWrites(dir: string, first: LoadedGraph, goal: GraphNode, module: GraphNode | undefined, shown: Shown, relay: string, mark: string): Promise<Released> {
  const ready = releaseReady(first, goal, module)
  if (shown.releaseSet === undefined) refuse('not_shown', 'what the release approves was not recorded when it was put to the human', 'show it with propose_to_human again, in this session', module === undefined ? 'goal' : 'module')
  const engine = openEngine(dir)
  const agree = `${ANSWER_MARKS.agree}${mark}`
  const written: string[] = []
  const skipped: Array<{ readonly id: string, readonly code: string }> = []
  const send = async (mutation: Record<string, unknown>): Promise<Written> => {
    try {
      return await engine.apply('llm', { ...mutation, relay })
    }
    catch (error) {
      return { ok: false, error: { code: 'unavailable', message: `the graph could not be written: ${errorText(error)}` } }
    }
  }
  const stop = (error: { readonly code: string, readonly message: string, readonly field?: string }): never => {
    const left = written.length === 0 ? 'nothing more was recorded' : `already on the graph: ${written.join('; ')}`
    return refuse(error.code, error.message, `${left}; record the same words again to finish it; the human said: ${relay}`, error.field)
  }
  /** A write that the engine refused: the node is skipped, except when the disk failed, which stops everything. */
  const settle = (id: string, result: Extract<Written, { ok: false }>): void => {
    if (result.error.code === 'unavailable') stop(result.error)
    skipped.push({ id, code: result.error.code })
  }
  const recorded = new Map(shown.releaseSet.map(entry => [entry.id, entry.rev]))
  const revs = new Map(recorded)
  const isCandidate = (node: GraphNode): boolean => module === undefined && ready.split && node.type === 'feature' && node.parent === goal.id
  const approved: string[] = []
  const modules: string[] = []
  const members = shown.releaseSet.flatMap((entry) => {
    const node = first.nodes.get(entry.id)
    return node !== undefined && node.status === 'proposed' ? [node] : []
  })
  /** One write to a node, with the revision it has now (a candidate's moved with its stage); a node that changed since the human saw it is skipped. */
  const write = async (node: GraphNode, mutation: Record<string, unknown>, done: (rev: string) => void): Promise<void> => {
    if (first.revisions.get(node.id) !== recorded.get(node.id)) {
      skipped.push({ id: node.id, code: 'stale_revision' })
      return
    }
    const result = await send({ ...mutation, id: node.id, rev: revs.get(node.id), reason: agree })
    if (result.ok) done(result.rev)
    else settle(node.id, result)
  }
  for (const node of members.filter(isCandidate)) {
    if (node.stage !== 'design') {
      await write(node, { op: 'edit', set: { stage: 'design' } }, (rev) => {
        revs.set(node.id, rev)
        written.push(`${node.id} has the stage design`)
      })
    }
  }
  for (const node of members) {
    if (skipped.some(entry => entry.id === node.id)) continue
    await write(node, { op: 'approve' }, () => {
      approved.push(node.id)
      written.push(`${node.id} is approved`)
      if (isCandidate(node)) modules.push(node.id)
    })
  }
  let graph = await readGraph(dir)
  const left = (module !== undefined ? moduleSet(graph, module) : ready.split ? bigLoopSet(graph, goal) : releaseSet(graph, goal)).map(node => node.id)
  const complete = skipped.length === 0 && left.length === 0
  if (complete) {
    const target = module ?? goal
    const reason = `${agree}${ready.split && shown.exact !== undefined ? ` · 一页放行稿 ${pageDigest(shown.exact)}` : ''}`
    for (let attempt = 0; ; attempt++) {
      const result = await send({ op: 'edit', id: target.id, rev: graph.revisions.get(target.id), set: { stage: 'release' }, reason })
      if (result.ok) break
      if (result.error.code === 'stale_revision' && attempt === 0) {
        graph = await readGraph(dir)
        continue
      }
      stop(result.error)
    }
  }
  return { approved, skipped, left, modules, complete }
}

function releaseMessage(outcome: 'released' | 'partial' | 'added' | 'rejected', goal: string, module: string | undefined, split: boolean, released: Released | undefined): string {
  const what = module === undefined ? goal : `module ${module} of ${goal}`
  const again = module === undefined ? 'propose_to_human (kind release)' : `propose_to_human (kind release, module ${module})`
  if (outcome === 'added') return `Recorded: the human added to the design of ${what}. Work it into the design, then put it to them again with ${again}.`
  if (outcome === 'rejected') return `Recorded: the human turned the design of ${what} down. Find out what they want different, change the design, then put it to them again with ${again}.`
  if (outcome === 'partial') {
    const skipped = released?.skipped.map(entry => `${entry.id} (${entry.code})`) ?? []
    return `Recorded, but the stage of ${what} did not move: the human agreed to the design as they saw it, and ${skipped.length === 0 ? '' : `these changed since: ${skipped.join(', ')}; `}${released?.left.length ?? 0} proposal(s) are still waiting (${(released?.left ?? []).join(', ')}). Read them again, fix the design and put it to them again with ${again}.`
  }
  if (module !== undefined) return `Recorded: the human released module ${module} of ${goal}. Tell the human in one line; decomposition and dispatch of this module come next.`
  if (split) return `Recorded: the human released the framework, the module list and the directions of ${goal}. ${(released?.modules ?? []).join(', ')} ${(released?.modules.length ?? 0) === 1 ? 'is a module' : 'are modules'} now, each in design: write its decisions and plan under it and put it to the human with propose_to_human (kind release, module, page). Nothing under a module is built before that module is released.`
  return `Recorded: the human released the design of ${goal}, and ${goal} is at stage release. Tell the human in one line; decomposition and dispatch come next.`
}

/**
 * kind release: the reply to the design that propose_to_human put to the
 * human, for a goal or for one of its modules. Their words must come after
 * the last time that release was shown in this session (a module's release
 * and the goal's are two matters), and a page or sample shown with it must
 * have been whole in what the main agent said. Agreeing is releaseWrites;
 * adding and rejecting note the goal or the module and move nothing.
 */
async function release(where: Where, graph: LoadedGraph, state: TalkState, args: ReleaseArgs, call: string, refusedWords: Refuse, emit: Emit): Promise<Record<string, unknown>> {
  const goal = openGoal(graph, args.goal)
  const module = args.module === undefined ? undefined : moduleOfGoal(graph, goal, args.module)
  const target = module ?? goal
  const shown = state.shown.filter(entry => entry.kind === 'release' && entry.goal === goal.id && entry.module === module?.id).at(-1)
  if (shown === undefined) {
    refuse('not_shown', `the release of ${module === undefined ? `"${goal.id}"` : `module "${module.id}"`} was not put to the human in this session`, 'show it with propose_to_human first, in this session', module === undefined ? 'goal' : 'module')
  }
  const said = personSaid(state, args.words, shown.time)
  if (!said.ok) refusedWords(said, '')
  const relay = said.ok ? said.relay : ''
  const mark = answerCallMark(call)
  let released: Released | undefined
  if (args.answer === 'agree') {
    sampleSeen([shown])
    userPageSeen(shown, releaseUserPage(userGraphOf(graph, goal), module))
    released = await releaseWrites(where.dir, graph, goal, module, shown, relay, mark)
  }
  else {
    const noted = await openEngine(where.dir).apply('llm', { op: 'comment', id: target.id, text: `${ANSWER_MARKS[args.answer]}「${relay}」；主 Agent 记成：${args.recordedAs}${mark}` })
    if (!noted.ok) refuseWith(noted)
  }
  const outcome = released === undefined ? args.answer === 'add' ? 'added' : 'rejected' : released.complete ? 'released' : 'partial'
  emit({ k: 'design.answer-recorded', body: { kind: 'release', answer: args.answer, outcome, goal: toMetricsId(goal.id), ...optionalId('module', module?.id), pending: toMetricsId(module?.id ?? goal.id), ...replyOf(state, args.words, shown.time), units: codePointCount(relay) } })
  const split = module !== undefined || isSplit(graph, goal)
  return {
    outcome,
    message: releaseMessage(outcome, goal.id, module?.id, split, released),
    ...outcome === 'released' ? { stage: 'release' } : {},
    ...module === undefined ? {} : { module: module.id },
    ...released === undefined || released.modules.length === 0 ? {} : { modules: released.modules },
    ...released === undefined ? {} : { approved: released.approved },
    ...released === undefined || released.skipped.length === 0 ? {} : { skipped: released.skipped },
  }
}

/** Why the writes of an agreement stopped, and whether the stage was set to design when they did. */
interface Stopped {
  readonly error: { readonly code: string, readonly message: string, readonly field?: string }
  readonly stageSet: boolean
}

/**
 * The two writes of an agreement, each with the revision just read and the
 * human's words as relay: the stage is set to design (unless it is), then the
 * goal is approved (if it still is a proposal). In that order, so that a stop
 * between them leaves a proposal: its effective stage stays wish or interview
 * whatever stage it names, the gates of the interview still hold for it, and
 * the same words finish it. The other order leaves an approved goal with no
 * stage, which the gates read as outside the design loop. What the engine
 * refuses and what it throws (a disk that will not take the file) stop the
 * writes alike.
 */
async function writeAgreement(engine: GraphEngine, goal: GraphNode, rev: string, relay: string, reason: string): Promise<Stopped | undefined> {
  let stageSet = goal.stage === 'design'
  try {
    if (!stageSet) {
      const done = await engine.apply('llm', { op: 'edit', id: goal.id, rev, set: { stage: 'design' }, reason, relay })
      if (!done.ok) return { error: done.error, stageSet }
      rev = done.rev
      stageSet = true
    }
    if (goal.status === 'proposed') {
      const done = await engine.apply('llm', { op: 'approve', id: goal.id, rev, reason, relay })
      if (!done.ok) return { error: done.error, stageSet }
    }
    return undefined
  }
  catch (error) {
    return { error: { code: 'unavailable', message: `the graph could not be written: ${errorText(error)}` }, stageSet }
  }
}

/**
 * The writes of an agreement to the requirement (writeAgreement), the
 * requirement card checked again before each try. Once more when the goal
 * moved under a write. When they stop, the error says what was written: a
 * goal whose stage is set but which is not approved yet is told so, and
 * recording the same words again finishes it.
 */
async function confirmWrites(dir: string, first: LoadedGraph, id: string, relay: string, reason: string): Promise<void> {
  const engine = openEngine(dir)
  let graph = first
  for (let attempt = 0; ; attempt++) {
    const goal = confirmGate(graph, openGoal(graph, id))
    const stopped = await writeAgreement(engine, goal, graph.revisions.get(id)!, relay, reason)
    if (stopped === undefined) return
    if (stopped.error.code === 'stale_revision' && attempt === 0) {
      graph = await readGraph(dir)
      continue
    }
    const left = stopped.stageSet ? `${id} has its stage set to design and waits for its approval, and it is still a proposal: record the same words again to finish it; ` : 'nothing more was recorded; '
    refuse(stopped.error.code, stopped.error.message, `${left}the human said: ${relay}`, stopped.error.field)
  }
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
  if (!normalizeTalk(last.after).includes(normalizeTalk(last.exact))) refuse('not_shown', 'The human has not seen the whole page or sample they must see before agreeing', SAMPLE_NOT_SHOWN)
}

/**
 * The two checks of the user page a confirm or a release appended (user graph
 * design 0.4.1 §5.2, last paragraph). Shown: its stable and its state part are
 * each whole in what the main agent said after it, as the human reads it.
 * Unchanged: the stable part rendered from the graph now is the one shown,
 * both normalised; the state part is not rendered again, so that other
 * modules moving on do not undo the agreement. A showing without a page
 * compares as an empty one, so a page that appeared since is a change too.
 */
function userPageSeen(shown: Shown, now: UserPage): void {
  const page = shown.userPage
  const after = normalizeTalk(shown.after)
  if (page !== undefined && [page.stable, page.state].some(part => part.length > 0 && !after.includes(normalizeTalk(part)))) {
    refuse('not_shown', 'The human has not seen the whole user page they must see before agreeing', SAMPLE_NOT_SHOWN)
  }
  if (normalizeTalk(page?.stable ?? '') !== normalizeTalk(now.stable)) refuse('not_shown', '页在给你看之后变了: the user graph on the page changed after it was shown to the human', PAGE_CHANGED)
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
async function delegate(where: Where, graph: LoadedGraph, state: TalkState, args: DelegationArgs, call: string, refusedWords: Refuse, emit: Emit): Promise<Record<string, unknown>> {
  // The words are a record made on the spot, not an old message turned into a new authorisation.
  const said = personSaid(state, args.words, state.people.at(-2)?.time ?? 0)
  if (!said.ok) refusedWords(said, `; ${LATEST_HINT}`)
  const relay = said.ok ? said.relay : ''
  const engine = openEngine(where.dir)
  const mark = answerCallMark(call)
  const reason = `${args.undo ? REVOKE_REASON : DELEGATION_REASON}${args.scope}${mark}`
  const result = await delegation(engine, where, graph, args, relay, reason)
  emit({ k: 'design.delegation', body: { action: result.action, count: result.scopes.length, scopeUnits: codePointCount(args.scope), where: 'graph' } })
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
