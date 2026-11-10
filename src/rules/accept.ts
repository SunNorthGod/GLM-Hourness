/**
 * The rules board's end of the person's agreement in the chat (docs/ORCHESTRATION.md
 * §16.15; design §9.3 steps 2 to 5): what `propose_to_human` asks before a proposal is
 * put to the human (`attachable`), what the main agent is told once the human agreed
 * (`acceptProposal`), and the reconciliation that settles what the graph says and the
 * board did not hear (`reconcile`).
 *
 * The person's word is on the graph: a question whose body ends with the board's line
 * (`proposalLine`), decided by the human, or by the main agent with the human's words as
 * `relay` and the mark that the human was shown the text of what runs ("· 已给人看原文
 * <digest>", written by M3's `record_human_answer`). The board writes nothing it has not
 * checked there: the question is done and ends with the proposal's id (the version the
 * human saw, not an older one), the last decision is the person's, and for a proposal that
 * runs or removes something the mark carries the digest of exactly the text the board
 * would show now. What is written is `proposal-accept` of the engine, as the person.
 */
import { projectOf } from '../data/project-root.ts'
import { attachDigest } from '../design/attach.ts'
import type { GraphNode } from '../graph/schema.ts'
import { loadGraph } from '../graph/store.ts'
import { ANSWER_MARKS } from '../shared/answer-marks.ts'
import { openRulesBoard, type RulesBoard } from './engine.ts'
import type { AttachService } from '../shared/attach.ts'
import type { Proposal, ProjectState, RulesActor } from './model.ts'
import { proposalDetail } from './proposal.ts'
import { readProject } from './repo.ts'
import { proposalIdOf, proposalLine } from './service.ts'
import { rulesPaths, type StoreIo } from './store.ts'

export interface AcceptDeps {
  /** The rules directory in the repository, relative to the project root unless absolute. */
  readonly rulesDir: string
  readonly io?: StoreIo
  readonly now: () => number
}

/** The proposals nobody put to the human lapse after this. */
const EXPIRES_AFTER_MS = 7 * 24 * 3_600_000

const SEEN = '已给人看原文 '

/** How the human agreed on the graph, or why what the graph says is not their agreement. */
type Agreement = { readonly ok: true, readonly by: 'human' | 'llm', readonly relay?: string, readonly reason: string } | { readonly ok: false, readonly message: string }

/**
 * The agreement a question holds: it is `done` and its last decision is the human's own, or the main agent's with the
 * human's words as `relay` and a reason that starts as a recorded agreement does (`ANSWER_MARKS.agree`). Nothing else
 * is an agreement, whatever the question's text says.
 */
function agreementOf(node: GraphNode): Agreement {
  if (node.status !== 'done') return { ok: false, message: `the question ${node.id} is ${node.status}, not decided` }
  const decision = [...node.history].reverse().find(entry => entry.op === 'decide')
  if (decision === undefined) return { ok: false, message: `the question ${node.id} has no decision` }
  const reason = decision.reason ?? ''
  if (decision.actor === 'human') return { ok: true, by: 'human', ...(decision.relay === undefined ? {} : { relay: decision.relay }), reason }
  if (decision.actor === 'llm' && decision.relay !== undefined && decision.relay.trim() !== '' && reason.startsWith(ANSWER_MARKS.agree)) return { ok: true, by: 'llm', relay: decision.relay, reason }
  return { ok: false, message: `the decision on ${node.id} is not the human's: it carries no words of theirs` }
}

/** Whether the mark in the decision's reason says the human was shown exactly the text the board shows now. */
function seenExactly(proposal: Proposal, reason: string): boolean {
  const detail = proposalDetail(proposal)
  return detail === undefined || reason.includes(`${SEEN}${attachDigest(detail)}`)
}

function projectBoard(deps: AcceptDeps, cwd: string | undefined): { readonly board: RulesBoard, readonly root: string } | undefined {
  const project = cwd === undefined ? undefined : projectOf(cwd)
  return project === undefined ? undefined : { board: openRulesBoard({ projectRoot: project.root, rulesDir: deps.rulesDir, ...(deps.io === undefined ? {} : { io: deps.io }) }), root: project.root }
}

function whatTookEffect(proposal: Proposal): string {
  const body = proposal.body as Record<string, unknown>
  switch (proposal.kind) {
    case 'rule': return `rule ${String(body.id)}`
    case 'lift': return `rule ${String(body.id)} lifted`
    case 'switch': return `switch ${String(body.name)}`
    case 'peak-mode': return `peak mode ${String(body.level)}`
    case 'remove': return `${(proposal.body as readonly unknown[]).length} rule(s) removed`
    case 'repin': return `the script of rule ${String(body.id)} approved`
  }
}

type Applied = Awaited<ReturnType<RulesBoard['apply']>>

/** What the main agent is told about the result of agreeing; the graph's decision has been made either way, this line is only about the board. */
function lineFor(id: string, proposal: Proposal | undefined, result: Applied): string {
  if (result.ok) return `Rules board: proposal ${id} took effect (${proposal === undefined ? 'applied' : whatTookEffect(proposal)}).`
  const { code, message } = result.error
  if (code === 'busy') return 'Rules board was busy; it applies this decision within a minute from the graph.'
  if (code === 'io') return `Rules board could not write (${message.slice(0, 120)}); it tries again within a minute from the graph. If it does not take effect, tell the human.`
  if (code === 'invalid') return `Rules board rejected the proposal content now: ${message.slice(0, 80)}. Tell the human; propose again if still needed.`
  if (code === 'forbidden') return `Rules board: this decision cannot write rules (${message.slice(0, 80)}).`
  return `Rules board has no open proposal ${id} for this question; nothing took effect. Propose again with rules_propose and put the new one to the human.`
}

/** The rules row's service: the members M3 calls for `attach: 'rules:<proposal>'`. Nothing in it throws. */
export function createRulesService(deps: AcceptDeps): AttachService {
  return {
    attachable({ cwd, proposal }) {
      try {
        const project = cwd === undefined ? undefined : projectOf(cwd)
        if (project === undefined) return { ok: false, message: 'this session has no project: the rules board has nowhere to keep a proposal' }
        const held = readProject(rulesPaths(project.root, deps.rulesDir)).state.proposals?.[proposal]
        if (held === undefined) return { ok: false, message: `this project has no proposal ${proposal}: record it with rules_propose first` }
        if (held.status !== 'open') return { ok: false, message: `proposal ${proposal} is ${held.status}, not open: propose again with rules_propose` }
        if (held.via !== 'graph') return { ok: false, message: `proposal ${proposal} was made while the project graph was not available: the human types /rules accept ${proposal} or /rules reject ${proposal}` }
        const detail = proposalDetail(held)
        return detail === undefined ? { ok: true } : { ok: true, detail }
      }
      catch (error) {
        return { ok: false, message: `the rules board could not be read: ${error instanceof Error ? error.message : String(error)}` }
      }
    },
    proposalLine,
    async acceptProposal({ questionId, graphDir, cwd }) {
      try {
        const found = projectBoard(deps, cwd)
        if (found === undefined) return 'Rules board: this session is in no project; nothing took effect.'
        const graph = await loadGraph(graphDir)
        const node = graph.nodes.get(questionId)
        const id = node?.body === undefined ? undefined : proposalIdOf(node.body)
        if (node === undefined || id === undefined) return `Rules board has no open proposal for question ${questionId}; nothing took effect. Propose again with rules_propose and put the new one to the human.`
        const agreement = agreementOf(node)
        if (!agreement.ok) return `Rules board: this decision cannot write rules (${agreement.message}).`
        const settled = await found.board.settle()
        const state = settled === 'busy' ? readProject(found.board.paths).state : settled.state
        const proposal = state.proposals?.[id]
        if (proposal !== undefined && !seenExactly(proposal, agreement.reason)) {
          return 'Rules board rejected the proposal content now: the agreement carries no mark that the human saw the exact text. Tell the human; put it to them again with propose_to_human.'
        }
        const result = await found.board.apply('human', { op: 'proposal-accept', id, by: agreement.by, ...(agreement.relay === undefined ? {} : { relay: agreement.relay }), question: questionId })
        return lineFor(id, proposal, result)
      }
      catch (error) {
        return `Rules board could not settle this decision (${error instanceof Error ? error.message : String(error)}); it tries again within a minute from the graph.`
      }
    },
  }
}

// ---------------------------------------------------------------- reconciliation

/** What a pass of the reconciliation did, by proposal id. */
export interface Reconciled {
  readonly accepted: readonly string[]
  readonly rejected: readonly string[]
  readonly expired: readonly string[]
}

/** The question on the graph that names each proposal (the newest, by id order, when several do). */
function questionsByProposal(nodes: ReadonlyMap<string, GraphNode>): Map<string, GraphNode> {
  const found = new Map<string, GraphNode>()
  for (const node of nodes.values()) {
    const id = node.type === 'question' && node.body !== undefined ? proposalIdOf(node.body) : undefined
    if (id !== undefined) found.set(id, node)
  }
  return found
}

const openOnGraph = (state: ProjectState): Proposal[] => Object.values(state.proposals ?? {}).filter(proposal => proposal.status === 'open' && proposal.via === 'graph')

/**
 * Settle what the graph says against the board (design §9.3 step 5), for the project of `cwd`: an open proposal whose
 * question is decided by the human is accepted as if the decision had just come, one whose question the human let drop
 * is rejected, and one no question named for 7 days lapses. The graph is the person's word and the board only carries
 * it out, so what is written is the same operation with the same checks; the identity is the host's. Never throws.
 */
export async function reconcile(deps: AcceptDeps, cwd: string, graphDir: string): Promise<Reconciled> {
  const done: { accepted: string[], rejected: string[], expired: string[] } = { accepted: [], rejected: [], expired: [] }
  try {
    const found = projectBoard(deps, cwd)
    if (found === undefined) return done
    const read = readProject(found.board.paths)
    const open = openOnGraph(read.state)
    if (open.length === 0) return done
    const questions = questionsByProposal((await loadGraph(graphDir)).nodes)
    const asHost: RulesActor = 'harness'
    for (const proposal of open) {
      const node = questions.get(proposal.id)
      if (node === undefined) {
        if (deps.now() - Date.parse(proposal.at) > EXPIRES_AFTER_MS && (await found.board.apply(asHost, { op: 'proposal-expire', id: proposal.id })).ok) done.expired.push(proposal.id)
        continue
      }
      if (node.status === 'dropped') {
        const dropping = [...node.history].reverse().find(entry => entry.to === 'dropped')
        const relay = dropping?.relay
        if ((await found.board.apply(asHost, { op: 'proposal-reject', id: proposal.id, by: dropping?.actor === 'human' ? 'human' : 'llm', ...(relay === undefined ? {} : { relay }) })).ok) done.rejected.push(proposal.id)
        continue
      }
      const agreement = agreementOf(node)
      if (!agreement.ok || !seenExactly(proposal, agreement.reason)) continue
      const result = await found.board.apply(asHost, { op: 'proposal-accept', id: proposal.id, by: agreement.by, ...(agreement.relay === undefined ? {} : { relay: agreement.relay }), question: node.id })
      if (result.ok && result.changed) done.accepted.push(proposal.id)
    }
  }
  catch {
    // The next pass reads the same files again; a failure here leaves the board as it was.
  }
  return done
}
