/**
 * The loop board's end of the person's agreement in the chat (docs/ORCHESTRATION.md
 * §18; loop board design 0.6 §7.1 steps 2 to 5): what `propose_to_human` asks
 * before a proposal is put to the human (`attachable`), what the main agent is
 * told once the human agreed (`acceptProposal`), and the reconciliation that
 * settles what the graph says and the board did not hear (`reconcile`). The
 * shape follows the rules board's end of the same path (src/rules/accept.ts);
 * the two boards share `propose_to_human`, `record_human_answer` and the
 * detail the human must see, and differ in what an agreement writes (an entry
 * of the board, not a rule).
 *
 * The person's word is on the graph: a question whose body ends with the
 * board's line (`loopProposalLine`), decided by the human, or by the main
 * agent with the human's words as `relay` and the mark that the human was
 * shown the text of what runs (「· 已给人看原文 <digest>」, written by M3's
 * `record_human_answer`). The board writes nothing it has not checked there:
 * the question is `done` and ends with the proposal's id (the version the
 * human saw, not an older one), the last decision is the person's, and for a
 * proposal that runs something the mark carries the digest of exactly the text
 * stored when it was proposed — never recomputed (review F37).
 */
import { projectOf } from '../data/project-root.ts'
import type { GraphNode } from '../graph/schema.ts'
import { loadGraph } from '../graph/store.ts'
import { ANSWER_MARKS } from '../shared/answer-marks.ts'
import type { Attachable, AttachDetail } from '../shared/attach.ts'
import type { LoopActor, LoopProposal } from './journal.ts'
import type { LoopStore } from './store.ts'
import { loopProposalIdOf } from './service.ts'

export interface AcceptDeps {
  /** The store of the project `cwd` is in, as the row holds it; undefined outside a project. */
  readonly storeFor: (cwd: string | undefined) => LoopStore | undefined
  /** Who the graph sees as having decided: the reconciliation writes as `harness`, an `acceptProposal` as it is. */
  readonly now?: () => number
}

/** How long a proposal nobody put to the human lapses (design §7.1 step 5). */
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

/** Whether the mark in the decision's reason says the human was shown exactly the text the proposal stores (never recomputed, review F37). */
function seenExactly(proposal: LoopProposal, reason: string): boolean {
  const { digest } = proposal.image
  return digest === undefined || reason.includes(`${SEEN}${digest}`)
}

/** The id of the person's entry a proposal writes, for the line that says what took effect. */
function whatTookEffect(proposal: LoopProposal): string {
  if (proposal.image.kind === 'delete') return `${proposal.image.entries?.length ?? 0} entr(y/ies) removed`
  const id = proposal.image.body?.id
  return id === undefined ? 'applied' : `entry ${id}`
}

/** What the main agent is told about the result of agreeing (design §7.1's table); the graph's decision stands either way. */
function lineFor(id: string, proposal: LoopProposal | undefined, result: { readonly ok: true, readonly file: string, readonly title?: string } | { readonly ok: false, readonly code: string, readonly message: string }): string {
  if (result.ok) return `Loop board: proposal ${id} took effect (${proposal === undefined ? 'applied' : whatTookEffect(proposal)}). Commit the changed paths under docs/loops/ with git when you next commit.`
  const { code, message } = result
  if (code === 'busy') return 'Loop board was busy; it applies this decision within a minute from the graph.'
  if (code === 'io') return 'Loop board could not write; the decision is listed on the loop board page. Tell the human.'
  if (code === 'invalid') return `Loop board rejected the proposal content now: ${message.slice(0, 120)}. Tell the human; propose again if still needed.`
  if (code === 'forbidden') return `Loop board: this decision cannot write entries (${message.slice(0, 120)}).`
  return `Loop board has no open proposal ${id} for this question; nothing took effect. Propose again with loop_propose and put the new one to the human.`
}

/** The proposal a question names, read from the store of the project, settled first. */
async function heldProposal(store: LoopStore, id: string): Promise<LoopProposal | undefined> {
  await store.settle()
  return store.proposals().get(id)
}

/** The members of the loop row's service the design row calls for `attach: 'loops:<proposal>'`. Nothing in it throws. */
export function createLoopsAccept(deps: AcceptDeps): {
  attachable: (input: { readonly cwd: string | undefined, readonly proposal: string }) => Attachable
  acceptProposal: (input: { readonly questionId: string, readonly graphDir: string, readonly cwd: string | undefined, readonly by: { readonly actor: 'human' | 'llm', readonly relay?: string } }) => Promise<string>
  reconcile: (cwd: string, graphDir: string) => Promise<{ readonly accepted: readonly string[], readonly rejected: readonly string[], readonly expired: readonly string[] }>
} {
  return {
    attachable: ({ cwd, proposal }) => {
      try {
        const store = deps.storeFor(cwd)
        if (store === undefined) return { ok: false, message: 'this session has no project: the loop board has nowhere to keep a proposal' }
        const held = store.proposals().get(proposal)
        if (held === undefined) return { ok: false, message: `this project has no proposal ${proposal}: record it with loop_propose first` }
        if (held.image.status !== 'open') return { ok: false, message: `proposal ${proposal} is ${held.image.status}, not open: propose again with loop_propose` }
        if (held.image.via !== 'graph') return { ok: false, message: `proposal ${proposal} was made while the project graph was not available: the human types /loops accept ${proposal} or /loops reject ${proposal}` }
        const detail: AttachDetail | undefined = held.image.detail
        return detail === undefined ? { ok: true } : { ok: true, detail }
      }
      catch (error) {
        return { ok: false, message: `the loop board could not be read: ${error instanceof Error ? error.message : String(error)}` }
      }
    },
    acceptProposal: async ({ questionId, graphDir, cwd }) => {
      try {
        const store = deps.storeFor(cwd)
        if (store === undefined) return 'Loop board: this session is in no project; nothing took effect.'
        const graph = await loadGraph(graphDir)
        const node = graph.nodes.get(questionId)
        const id = node?.body === undefined ? undefined : loopProposalIdOf(node.body)
        if (node === undefined || id === undefined) return `Loop board has no open proposal for question ${questionId}; nothing took effect. Propose again with loop_propose and put the new one to the human.`
        const agreement = agreementOf(node)
        if (!agreement.ok) return `Loop board: this decision cannot write entries (${agreement.message}).`
        const proposal = await heldProposal(store, id)
        if (proposal !== undefined && !seenExactly(proposal, agreement.reason)) {
          return 'Loop board rejected the proposal content now: the agreement carries no mark that the human saw the exact text. Tell the human; put it to them again with propose_to_human.'
        }
        const result = await store.apply('harness', { op: 'proposal-accept', id, by: agreement.by, ...(agreement.relay === undefined ? {} : { relay: agreement.relay }), question: questionId })
        return lineFor(id, proposal, result.ok ? { ok: true, file: result.file, ...(result.title === undefined ? {} : { title: result.title }) } : { ok: false, code: result.code, message: result.message })
      }
      catch (error) {
        return `Loop board could not settle this decision (${error instanceof Error ? error.message : String(error)}); it tries again within a minute from the graph.`
      }
    },
    reconcile: async (cwd, graphDir) => {
      const done: { accepted: string[], rejected: string[], expired: string[] } = { accepted: [], rejected: [], expired: [] }
      try {
        const store = deps.storeFor(cwd)
        if (store === undefined) return done
        const root = projectOf(cwd)?.root
        if (root === undefined) return done
        await store.settle()
        const now = deps.now?.() ?? Date.now()
        const open = [...store.proposals().values()].filter(proposal => proposal.image.status === 'open' && proposal.image.via === 'graph')
        if (open.length === 0) return done
        const graph = await loadGraph(graphDir)
        const questions = new Map<string, GraphNode>()
        for (const node of graph.nodes.values()) {
          const id = node.type === 'question' && node.body !== undefined ? loopProposalIdOf(node.body) : undefined
          if (id !== undefined) questions.set(id, node)
        }
        const asHost: LoopActor = 'harness'
        for (const proposal of open) {
          const node = questions.get(proposal.id)
          if (node === undefined) {
            if (now - Date.parse(proposal.image.at) > EXPIRES_AFTER_MS && (await store.apply(asHost, { op: 'proposal-expire', id: proposal.id })).ok) done.expired.push(proposal.id)
            continue
          }
          if (node.status === 'dropped') {
            const dropping = [...node.history].reverse().find(entry => entry.to === 'dropped')
            const relay = dropping?.relay
            if ((await store.apply(asHost, { op: 'proposal-reject', id: proposal.id, by: dropping?.actor === 'human' ? 'human' : 'llm', ...(relay === undefined ? {} : { relay }) })).ok) done.rejected.push(proposal.id)
            continue
          }
          const agreement = agreementOf(node)
          if (!agreement.ok || !seenExactly(proposal, agreement.reason)) continue
          const result = await store.apply(asHost, { op: 'proposal-accept', id: proposal.id, by: agreement.by, ...(agreement.relay === undefined ? {} : { relay: agreement.relay }), question: node.id })
          if (result.ok && result.changed === true) done.accepted.push(proposal.id)
        }
      }
      catch {
        // The next pass reads the same files again; a failure here leaves the board as it was.
      }
      return done
    },
  }
}
