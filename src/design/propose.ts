/**
 * propose_to_human (docs/ORCHESTRATION.md §3.5; decision d-ask-three-gates, a
 * trial the person watches): the main agent puts one matter to the human. The
 * record and the words are given apart. The record (form, title, proposal,
 * reason, cost, ways, notTaken) is kept on the graph as a question in the
 * proposal shape, and the harness checks that it is complete and within the
 * rules (src/graph/proposal.ts). The words are `text`, one sentence the main
 * agent writes itself, held to a few hard limits and to the record; the tool
 * returns the text to show, with only the ways of a `choose` and a sample laid
 * out by the harness (renderAsk). Three kinds exist: `question` (a matter only
 * the human can decide), and `confirm` and `release`, which put the
 * requirements and the design to the human; those two are refused until the
 * steps that open them.
 */
import { openEngine, type ApplyResult } from '../graph/engine.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import { PLAIN_QUESTION_GUIDE, PLAIN_WORDS, plainWordsIn } from '../graph/plain-question.ts'
import { OPEN_STATUSES } from '../graph/projection.ts'
import { ASK_FORMS, PROPOSAL_LIMITS, askOf, askTextRefusal, codePointCount, proposalRecordRefusal, renderAsk, textCoversRecord, type AskForm } from '../graph/proposal.ts'
import type { GraphNode } from '../graph/schema.ts'
import { goalOf } from '../graph/stage.ts'
import type { AgentLike, ServiceLookup, ToolDefinitionLike } from '../shared/dsh-min.ts'
import type { HealthState } from '../shared/health.ts'
import { PROPOSE_TO_HUMAN, type ShownProposal } from '../shared/tool-names.ts'
import { askBoard, attachBody, boardOfBody, resolveAttach, type AttachBoard, type AttachDetail, type Attachment } from './attach.ts'
import { emitMetric } from './metrics.ts'
import { TALK_SHAPES, type TalkState } from './talk.ts'
import { isRecord, mainAgentCall, readGraph, refuse, refuseWith, toolShell } from './tool-support.ts'

/** What the design row lets the tools know. */
export interface DesignToolDeps {
  readonly boards: readonly AttachBoard[]
  readonly lookup: ServiceLookup
  /** Whether the agent is its project's main agent now. May throw: the call is then refused. */
  readonly isMainAgent: (agent: AgentLike) => boolean
  /** The graph directory of the agent's project (it exists), the session's working directory and what the session has in focus; undefined when the project has no graph here. */
  readonly graph: (agent: AgentLike) => { readonly dir: string, readonly cwd: string | undefined, readonly focus: string | undefined } | undefined
  /** The talk state of the agent's session; undefined when it cannot be read at all. */
  readonly talk: (agent: AgentLike) => TalkState | undefined
  readonly report: (agent: AgentLike, state: HealthState, reason: string) => void
}

type Kind = ShownProposal['kind']
const KINDS: readonly Kind[] = ['question', 'confirm', 'release']

const DESCRIPTION = [
  'Put one matter to the human: one question they can answer in a few words. The harness checks it, keeps it on the graph when the human decides it, and returns the text to show.',
  'kind question: a matter only the human can decide. kind confirm: the interview is over, put the requirements to the human. kind release: the design is done, put it to the human to release; for a goal split into modules the first release covers the framework, the module list and the directions, and each module is released again, with module and a one-page release note.',
  TALK_SHAPES,
  PLAIN_QUESTION_GUIDE,
].join('\n')

const SAMPLE_LIMIT = 6000

const PARAMETERS = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: [...KINDS] },
    text: { type: 'string', description: 'The question as the human reads it: your own sentence, one line, exactly one question mark, plain words (limits in the description).' },
    form: { type: 'string', enum: [...ASK_FORMS], description: 'kind question: the way of asking. It is set once; a revision keeps it.' },
    title: { type: 'string', description: 'kind question: the name of the matter, one line, at most 40 characters.' },
    proposal: { type: 'string', description: 'kind question: what you recommend, guess or show, one short line; leave it out for choose (the last way is taken).' },
    reason: { type: 'string', description: 'kind question, recommend and choose: why, one short line, word for word in text.' },
    cost: { type: 'string', description: 'kind question, recommend: the real cost, one short line, word for word in text; leave it out when there is none.' },
    ways: { type: 'array', items: { type: 'string' }, description: 'kind question, choose: two or three ways, each one line saying what the human would see, your pick last.' },
    notTaken: { type: 'string', description: 'kind question, recommend and choose: the way you did not take, kept for the record.' },
    sample: { type: 'string', description: 'form look (and later confirm, release): text the human must see, such as a sketch; the harness shows it as drawn under your question.' },
    goal: { type: 'string', description: 'kind confirm or release: the goal id.' },
    module: { type: 'string', description: 'kind release: the module to release; leave out for the goal itself.' },
    page: { type: 'string', description: 'kind release of a goal split into modules: the one-page release note.' },
    parent: { type: 'string', description: 'kind question, new: the node it hangs under; the goal in your focus when left out.' },
    question: { type: 'string', description: 'kind question: the id of a question you already put, to revise it after the human added to it or turned it down (with form, title and the record), or to show it once more (with text alone).' },
    sources: { type: 'array', items: { type: 'string' }, description: 'kind question, new: nodes it exists because of.' },
    attach: { type: 'string', description: 'kind question, recommend: a proposal another component recorded (rules:p-… or loops:lp-…) that the human agrees to with this question.' },
  },
  required: ['kind', 'text'],
  additionalProperties: false,
} as const

const OUTPUT = {
  type: 'object',
  properties: {
    tool: { type: 'string', const: PROPOSE_TO_HUMAN },
    kind: { type: 'string', enum: [...KINDS] },
    form: { type: 'string', enum: [...ASK_FORMS] },
    goal: { type: 'string' },
    module: { type: 'string' },
    question: { type: 'string' },
    number: { type: 'integer' },
    text: { type: 'string' },
    releaseSet: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, rev: { type: 'string' } }, required: ['id', 'rev'] } },
    attach: { type: 'string' },
    message: { type: 'string' },
  },
  required: ['tool', 'kind', 'number', 'text', 'message'],
} as const

const SHOW_MESSAGE = 'Show text to the human exactly as given; it is Markdown. Put it after your report, together with the other questions of this reply, then end your turn. When they answer, restate a short answer about something that cannot be taken back in one line and wait; then call record_human_answer with kind question and their exact words.'
const DETAIL_MESSAGE = 'The last paragraph is the exact text the human must see before agreeing: keep it verbatim in your reply.'
const CALL_FIELDS = new Set(['kind', 'text', 'form', 'title', 'proposal', 'reason', 'cost', 'ways', 'notTaken', 'sample', 'goal', 'module', 'page', 'parent', 'question', 'sources', 'attach'])
const RECORD_FIELDS = ['form', 'title', 'proposal', 'reason', 'cost', 'ways', 'notTaken'] as const

interface Args {
  readonly text: string
  readonly form?: AskForm
  readonly title?: string
  readonly proposal?: string
  readonly reason?: string
  readonly cost?: string
  readonly ways?: readonly string[]
  readonly notTaken?: string
  readonly sample?: string
  readonly parent?: string
  readonly question?: string
  readonly sources: readonly string[]
  readonly attach?: string
}

/** Why a call was refused, for the metrics: the reason code of design.proposal-refused. */
class Refused extends Error {
  reasonCode: string
  field: string | undefined

  constructor(message: string, reasonCode: string, field?: string) {
    super(message)
    this.reasonCode = reasonCode
    this.field = field
  }
}

function stringField(args: Record<string, unknown>, field: string): string | undefined {
  const value = args[field]
  if (value === undefined) return undefined
  if (typeof value !== 'string') refuse('invalid', `${field} must be a string`, `pass ${field} as text`, field)
  return value
}

/** The arguments, shape-checked: what goes with what. The rules of the words and of the record are checked after the graph is read. */
function parseArgs(raw: unknown): Args {
  if (!isRecord(raw)) refuse('invalid', 'the arguments must be a JSON object', 'pass {kind, text, ...} as described in the tool description')
  const extra = Object.keys(raw).find(key => !CALL_FIELDS.has(key))
  if (extra !== undefined) refuse('invalid', `${extra} is not a field of ${PROPOSE_TO_HUMAN}`, `${PROPOSE_TO_HUMAN} takes ${[...CALL_FIELDS].join(', ')}`, extra)
  const kind = raw.kind
  if (typeof kind !== 'string' || !(KINDS as readonly string[]).includes(kind)) refuse('invalid', `kind must be one of ${KINDS.join(', ')}`, 'pass kind question to put a matter to the human', 'kind')
  if (kind !== 'question') {
    refuse('invalid', `kind ${kind} is not open yet`, 'not yet: only kind question works for now; ask the human in your reply and carry on with what you can', 'kind')
  }
  const text = raw.text
  if (typeof text !== 'string') refuse('invalid', 'text is required: the question as the human reads it', 'pass your own sentence as text', 'text')
  for (const field of ['goal', 'module', 'page'] as const) {
    if (raw[field] !== undefined) refuse('invalid', `${field} belongs to kind confirm and release`, `leave ${field} out for kind question`, field)
  }
  const form = raw.form
  if (form !== undefined && (typeof form !== 'string' || !(ASK_FORMS as readonly string[]).includes(form))) refuse('invalid', `form must be one of ${ASK_FORMS.join(', ')}`, 'pick the way of asking: recommend, choose, want or look', 'form')
  const strings: Partial<Record<'title' | 'proposal' | 'reason' | 'cost' | 'notTaken' | 'sample' | 'parent' | 'question' | 'attach', string>> = {}
  for (const field of ['title', 'proposal', 'reason', 'cost', 'notTaken', 'sample', 'parent', 'question', 'attach'] as const) {
    const value = stringField(raw, field)
    if (value !== undefined) strings[field] = value
  }
  const { ways, sources } = raw
  if (ways !== undefined && (!Array.isArray(ways) || ways.some(way => typeof way !== 'string'))) refuse('invalid', 'ways must be an array of lines', 'pass the two or three ways, each one line, your pick last', 'ways')
  if (sources !== undefined && (!Array.isArray(sources) || sources.some(entry => typeof entry !== 'string'))) refuse('invalid', 'sources must be an array of node ids', 'pass the ids of the nodes the question exists because of', 'sources')
  const { question, parent, attach, sample } = strings
  if (parent !== undefined && question !== undefined) refuse('invalid', 'parent and question exclude each other', 'parent is for a new question, question for one already put', 'question')
  if (sample !== undefined && (sample.length === 0 || codePointCount(sample) > SAMPLE_LIMIT)) refuse('invalid', `sample must be 1 to ${SAMPLE_LIMIT} characters`, 'pass the text the human must see, shortened if need be', 'sample')
  if (sample !== undefined && attach !== undefined) refuse('invalid', 'sample and attach exclude each other', 'a proposal of a board brings its own original text', 'sample')
  const recordGiven = RECORD_FIELDS.some(field => raw[field] !== undefined)
  if (question === undefined && !recordGiven) refuse('invalid', 'a new question needs form, title and its record', 'give form, title, proposal and what the way of asking needs, or question to show one already put', 'form')
  if (question === undefined && form === undefined) refuse('invalid', 'a new question needs its form', 'pick the way of asking: recommend, choose, want or look', 'form')
  if (question !== undefined && recordGiven && (form === undefined || strings.title === undefined)) refuse('invalid', 'a revision gives form and title together with the record', 'give form (the same as before), title and the record; or text alone to show the question once more', form === undefined ? 'form' : 'title')
  if (question !== undefined && sources !== undefined) refuse('invalid', 'sources is for a new question', 'the sources of a question already put stay as they are', 'sources')
  if (attach !== undefined && form !== undefined && form !== 'recommend') refuse('invalid', 'attach is taken only by form recommend', 'the human agrees to the one proposal a board recorded, not to a choice between ways', 'attach')
  if (question !== undefined && !recordGiven && attach !== undefined) refuse('invalid', 'attach is not taken when a question is shown once more', 'show it again with question and text alone', 'attach')
  if (question === undefined && sample !== undefined && form !== 'look') refuse('invalid', 'sample is taken by form look', 'put the sketch in a look question; other questions show their words only', 'sample')
  return {
    text,
    ...form === undefined ? {} : { form: form as AskForm },
    ...strings.title === undefined ? {} : { title: strings.title },
    ...strings.proposal === undefined ? {} : { proposal: strings.proposal },
    ...strings.reason === undefined ? {} : { reason: strings.reason },
    ...strings.cost === undefined ? {} : { cost: strings.cost },
    ...ways === undefined ? {} : { ways: ways as string[] },
    ...strings.notTaken === undefined ? {} : { notTaken: strings.notTaken },
    ...sample === undefined ? {} : { sample },
    ...parent === undefined ? {} : { parent },
    ...question === undefined ? {} : { question },
    sources: (sources as string[] | undefined) ?? [],
    ...attach === undefined ? {} : { attach },
  }
}

/** The hard limits of the words (askTextRefusal, the plain-words list) and, with the record, the record's rules and its place in the words. Throws `Refused` with the reason code of the metrics. */
function checkWords(form: AskForm, args: Args, record: Parameters<typeof proposalRecordRefusal>[0]): void {
  const limit = askTextRefusal(form, args.text)
  if (limit !== undefined) throw new Refused(JSON.stringify({ code: 'invalid', message: limit.message, field: 'text', hint: limit.hint }), limit.hint.startsWith('shorten') ? 'text-too-long' : 'text-shape', 'text')
  for (const [field, value] of [['text', args.text], ['title', record.title], ['proposal', record.proposal], ['reason', record.reason], ['cost', record.cost], ['notTaken', record.notTaken], ...(record.ways ?? []).map(way => ['ways', way] as const)] as const) {
    const hit = typeof value === 'string' ? plainWordsIn(value)[0] : undefined
    if (hit === undefined) continue
    const say = PLAIN_WORDS.find(entry => entry.avoid.includes(hit))?.say ?? 'a plainer word'
    throw new Refused(JSON.stringify({ code: 'invalid', message: `${field} uses the word ${hit}, which the human has not learned`, field, hint: `say ${say} instead of ${hit}` }), 'plain-word', field)
  }
  const bad = proposalRecordRefusal(record)
  if (bad !== undefined) throw new Refused(JSON.stringify({ code: 'invalid', message: bad.message, field: bad.field, hint: bad.hint }), 'record', bad.field)
  const missing = textCoversRecord(args.text, record, form)
  if (missing !== undefined) {
    throw new Refused(JSON.stringify({ code: 'invalid', message: `${missing.field} is not in text word for word`, field: 'text', hint: `put the ${missing.field} of the record word for word ${missing.within === 'ask' ? 'in the sentence that ends with the question mark' : 'in text'}: what the human agrees to must be what is kept` }), 'not-in-text', 'text')
  }
}

/** How many questions this reply has put to the human, counting the one now: the ones shown since the human's last message, plus one. */
function numberOf(state: TalkState | undefined): 1 | 2 | 3 {
  if (state === undefined) return 1
  const since = state.people.at(-1)?.seq ?? -1
  const n = state.shown.filter(entry => entry.seq > since).length + 1
  if (n > PROPOSAL_LIMITS.perReply) throw new Refused(JSON.stringify({ code: 'too_many', message: `this reply has put ${n - 1} questions to the human already`, hint: 'at most three questions in one reply: end this reply with the questions you have and wait' }), 'too_many')
  return n as 1 | 2 | 3
}

/** A question in the proposal shape that still waits for the human, found by its id. */
function openProposal(graph: LoadedGraph, id: string): GraphNode {
  const node = graph.nodes.get(id)
  if (node === undefined) refuse('not_found', `no node "${id}"`, 'pass the id of a question you put with this tool', 'question')
  if (node.type !== 'question' || node.options !== undefined) refuse('invalid', `"${id}" is not a question in the proposal shape`, 'pass the id of a question you put with this tool', 'question')
  if (node.status !== 'approved' && node.status !== 'doing') refuse('invalid', `"${id}" is ${node.status}`, node.status === 'done' ? 'decided; propose a new question' : 'it is closed; propose a new question', 'question')
  return node
}

/** What a call put to the human: the question as it is now, the original text it carries and the name of the board proposal it carries, when it has them. */
interface Shown {
  readonly question: GraphNode
  readonly detail?: AttachDetail
  readonly attach?: string
  readonly sample?: string
}

export function proposeTool(deps: DesignToolDeps): ToolDefinitionLike {
  return {
    ...toolShell(PROPOSE_TO_HUMAN, DESCRIPTION, PARAMETERS, OUTPUT),
    async execute(raw, exec) {
      const { context, agent } = mainAgentCall(deps.isMainAgent, exec, { message: `${PROPOSE_TO_HUMAN} is for the main agent`, hint: 'only the main agent puts matters to the human; the human turns main agent mode on with /wish' })
      const args = parseArgs(raw)
      const where = deps.graph(agent)
      if (where === undefined) refuse('not_found', 'the project graph is not here', 'the graph row is off or the graph directory does not exist; tell the human')
      try {
        const state = deps.talk(agent)
        if (state === undefined) deps.report(agent, 'degraded', '读不到会话里人的消息和给人看过的东西，编号只按第 1 件算')
        else if (state.unparsed > 0) deps.report(agent, 'degraded', `有 ${state.unparsed} 次 propose_to_human 的结果读不出来，没算作给人看过`)
        const graph = await readGraph(where.dir)
        const engine = openEngine(where.dir)
        const call = context.callId
        const node = args.question === undefined ? undefined : openProposal(graph, args.question)
        const again = node !== undefined && args.title === undefined
        const form = args.form ?? node?.form
        if (form === undefined) refuse('invalid', 'the question has no way of asking', 'propose a new question', 'question')
        if (node !== undefined && !again && node.form !== form) {
          throw new Refused(JSON.stringify({ code: 'invalid', message: `"${node.id}" was put as ${node.form ?? 'a question with options'}, so it cannot be revised as ${form}`, field: 'form', hint: 'the form of a question cannot change: if the human\'s answer calls for another way of asking, drop this question with graph_status (status dropped, the human\'s exact words in relay) and put a new one with propose_to_human' }), 'record', 'form')
        }
        // The words and the record are checked first, then the count of questions, and only then is anything written.
        const record = node !== undefined && again ? recordOfNode(node, args, form) : recordOf(args, form)
        checkWords(form, args, record)
        const number = numberOf(state)
        const shown = node !== undefined && again
          ? await showAgain(deps, node, where.cwd, args, form)
          : node === undefined ? await putNew(deps, engine, graph, where, args, record, call) : await revise(deps, engine, where, args, record, call)
        const goal = goalOf(await readGraph(where.dir), shown.question.id)?.id
        const exact = shown.detail?.markdown ?? shown.sample
        const text = renderAsk(args.text, number, shown.question.form === 'choose' ? shown.question.ways : undefined, exact, shown.sample !== undefined)
        emitMetric({ event: 'design.proposal-shown', kind: 'question', form, number, goal, question: shown.question.id, attach: shown.attach?.split(':')[0], codePoints: codePointCount(args.text), points: codePointCount(text), sample: shown.sample !== undefined, again })
        return {
          tool: PROPOSE_TO_HUMAN,
          kind: 'question',
          form,
          ...goal === undefined ? {} : { goal },
          question: shown.question.id,
          number,
          text,
          ...shown.attach === undefined ? {} : { attach: shown.attach },
          message: exact === undefined ? SHOW_MESSAGE : `${SHOW_MESSAGE} ${DETAIL_MESSAGE}`,
        }
      }
      catch (error) {
        if (error instanceof Refused) {
          emitMetric({ event: 'design.proposal-refused', kind: 'question', form: args.form, reason: error.reasonCode, field: error.field, attach: args.attach?.split(':')[0] })
          throw new Error(error.message, { cause: error })
        }
        throw error
      }
    },
  }
}

const REASON = (verb: string, call: string): string => `主 Agent 在对话里${verb}（${PROPOSE_TO_HUMAN} ${call}）`

async function applied(result: Promise<ApplyResult>): Promise<Extract<ApplyResult, { ok: true }>> {
  const done = await result
  return done.ok ? done : refuseWith(done)
}

/** The record of the call as the graph keeps it: the question is the text up to its question mark, a `choose` takes its last way as the proposal. */
function recordOf(args: Args, form: AskForm): Parameters<typeof proposalRecordRefusal>[0] {
  const ways = args.ways
  const proposal = form === 'choose' && ways !== undefined && ways.length > 0 ? (args.proposal === undefined ? ways.at(-1)! : args.proposal) : args.proposal
  return {
    title: args.title!,
    ask: askOf(args.text),
    form,
    ...proposal === undefined ? {} : { proposal },
    ...args.reason === undefined ? {} : { reason: args.reason },
    ...args.cost === undefined ? {} : { cost: args.cost },
    ...ways === undefined ? {} : { ways },
    ...args.notTaken === undefined ? {} : { notTaken: args.notTaken },
  }
}

/** What a call put to the human, with the original text and the name of the proposal of a board when the call carried them. */
function shownOf(question: GraphNode, attachment: Attachment | undefined, attach: string | undefined, sample: string | undefined): Shown {
  const attached = attachment?.ok === true && attach !== undefined
  return {
    question,
    ...attached && attachment.detail !== undefined ? { detail: attachment.detail } : {},
    ...attached ? { attach } : {},
    ...sample === undefined ? {} : { sample },
  }
}

/** The record of a question already on the graph: what the words of a second showing are held to. */
function recordOfNode(node: GraphNode, args: Args, form: AskForm): Parameters<typeof proposalRecordRefusal>[0] {
  return {
    title: node.title,
    ask: askOf(args.text),
    form,
    ...node.proposal === undefined ? {} : { proposal: node.proposal },
    ...node.reason === undefined ? {} : { reason: node.reason },
    ...node.cost === undefined ? {} : { cost: node.cost },
    ...node.ways === undefined ? {} : { ways: node.ways },
    ...node.notTaken === undefined ? {} : { notTaken: node.notTaken },
  }
}

async function putNew(deps: DesignToolDeps, engine: ReturnType<typeof openEngine>, graph: LoadedGraph, where: { readonly cwd: string | undefined, readonly focus: string | undefined }, args: Args, record: Parameters<typeof proposalRecordRefusal>[0], call: string): Promise<Shown> {
  const focusGoal = where.focus === undefined ? undefined : goalOf(graph, where.focus)?.id
  const parentId = args.parent ?? focusGoal
  if (parentId === undefined) refuse('invalid', 'no goal is in your focus, so the question has no place', 'pass parent, or graph_focus the goal first', 'parent')
  const parent = graph.nodes.get(parentId)
  if (parent === undefined) refuse('invalid', `no node "${parentId}"`, 'pass the id of an open node of the graph', 'parent')
  if (!OPEN_STATUSES.has(parent.status)) refuse('invalid', `"${parentId}" is ${parent.status}, so a question cannot hang under it`, 'hang the question under an open node', 'parent')
  const attachment = args.attach === undefined ? undefined : await resolveAttach(deps.boards, deps.lookup, args.attach, where.cwd)
  if (attachment !== undefined && !attachment.ok) refuse('invalid', attachment.message, 'record the proposal with its board first, or leave attach out', 'attach')
  const result = await applied(engine.apply('llm', {
    op: 'propose',
    reason: REASON('把这件事交给人', call),
    node: {
      type: 'question',
      parent: parentId,
      ...record,
      ...attachment === undefined ? {} : { body: attachBody(attachment) },
      ...args.sources.length === 0 ? {} : { edges: args.sources.map(to => ({ type: 'source', to })) },
    },
  }))
  return shownOf(result.node, attachment, args.attach, args.sample)
}

async function revise(deps: DesignToolDeps, engine: ReturnType<typeof openEngine>, where: { readonly dir: string, readonly cwd: string | undefined }, args: Args, record: Parameters<typeof proposalRecordRefusal>[0], call: string): Promise<Shown> {
  let latest: ApplyResult | undefined
  let attachment: Attachment | undefined
  for (let attempt = 0; attempt < 2; attempt++) {
    const graph = await readGraph(where.dir)
    const node = openProposal(graph, args.question!)
    // A question that carries a board's proposal is revised together with a new one: the board records it first.
    if (attempt === 0 && boardOfBody(deps.boards, node.body) !== undefined && args.attach === undefined) {
      refuse('invalid', `"${node.id}" carries a proposal of ${boardOfBody(deps.boards, node.body)!.board.board}`, 'record the revised proposal with the board first and pass its new attach', 'attach')
    }
    if (attempt === 0 && args.attach !== undefined) {
      attachment = await resolveAttach(deps.boards, deps.lookup, args.attach, where.cwd)
      if (!attachment.ok) refuse('invalid', attachment.message, 'record the proposal with its board first, or leave attach out', 'attach')
    }
    latest = await engine.apply('llm', {
      op: 'edit',
      id: node.id,
      rev: graph.revisions.get(node.id)!,
      reason: REASON('改了交给人的方案', call),
      set: {
        title: record.title,
        ask: record.ask,
        proposal: record.proposal,
        reason: record.reason ?? null,
        cost: record.cost ?? null,
        ways: record.ways ?? null,
        notTaken: record.notTaken ?? null,
        ...attachment?.ok === true ? { body: attachBody(attachment) } : {},
      },
    })
    if (latest.ok || latest.error.code !== 'stale_revision') break
  }
  const final = latest!
  const result = final.ok ? final : refuseWith(final)
  return shownOf(result.node, attachment, args.attach, args.sample)
}

async function showAgain(deps: DesignToolDeps, node: GraphNode, cwd: string | undefined, args: Args, form: AskForm): Promise<Shown> {
  // The words may differ from the first time; they were held to the same limits and to the record on the graph.
  if (args.sample !== undefined && form !== 'look') refuse('invalid', 'sample is taken by form look', 'only a look question carries a sketch', 'sample')
  const found = boardOfBody(deps.boards, node.body)
  if (found === undefined) return { question: node, ...args.sample === undefined ? {} : { sample: args.sample } }
  const service = found.board.service(deps.lookup)
  if (service === undefined) refuse('invalid', `${found.board.board} is not running here`, 'tell the human; the proposal cannot be shown without its original text', 'attach')
  const answer = await askBoard(service, cwd, found.id)
  if (!answer.ok) refuse('invalid', `${found.board.board} refused it: ${answer.message}`, 'tell the human', 'attach')
  return { question: node, ...answer.detail === undefined ? {} : { detail: answer.detail }, attach: `${found.board.prefix}${found.id}` }
}
