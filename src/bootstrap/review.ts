/**
 * bootstrap_review, the list round and the write that follows the human's
 * agreement (takeover design 0.6 §7.1–§7.4, §7.7, §9.2): the takeover set
 * and its questions read off the graph, the tool that opens a round after
 * ten checks, the question the harness writes (src/bootstrap/present.ts),
 * the attach round `list-<n>`, the six-step write that runs on the graph's
 * decision, and the state of every question the takeover asked (§7.7). The
 * graph is the facts: the journal only keeps the trail, and a half-written
 * apply is repeated from the graph until nothing is missing (§9.2).
 *
 * The write calls the engine directly (openEngine().apply), not the graph
 * tools, so M3's stage and relay rules do not stand in the way of an
 * agreement the design row already verified (relay, words, shown detail).
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { openEngine } from '../graph/engine.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import type { GraphNode } from '../graph/schema.ts'
import { askOf, normalizeText } from '../graph/proposal.ts'
import { parseGateNorm, unreadableOnlyLines } from '../execute/gate-norm.ts'
import { isEnvTool, nodeChecks } from '../env/branch.ts'
import type { CheckEntry } from '../env/check-entry.ts'
import { refuse, toolShell } from '../design/tool-support.ts'
import type { ToolDefinitionLike, ToolExecutionContext } from '../shared/dsh-min.ts'
import { BOOTSTRAP_REVIEW_EXAMPLE } from './example.ts'
import { proposedSinceOpen } from './gaps.ts'
import { commandsDetail, listAsk, resultMessage, type DetailCommand, type FullView } from './present.ts'
import { proposalIdOf } from '../rules/service.ts'
import { TAKEOVER_ATTACH_PREFIX, takeoverAttachOf } from './service.ts'
import type { OpenTakeover } from './takeover.ts'

const NORM_IDS = ['norm-decision-tiers', 'norm-audit-trail', 'norm-verify-tiers'] as const
const MERGE_GATE_ID = 'norm-merge-gate'
const ENV_ID = 'env'
const FLOOR_ID = 'norm-review-floor'
const EVIDENCE_LABEL = '完成证据：'

/** The exact conclusion of the list question (§7.2). */
export const listConclusion = (round: number): string => `照第 ${round} 版清单接管`

/** The marker M3 writes into the decide reason when the detail was shown (M3 appendix §3.5 step 5a). */
export const SHOWN_MARK = '已给人看原文'

/** What the runtime keeps of one opened round (§7.2, the `review-open` journal record's fold). */
export interface RoundRecord {
  readonly attach: string
  readonly askDigest: string
  /** The command detail exactly as it was shown (§7.4 compares the digest, it never recomputes). */
  readonly detail: string
  readonly detailDigest: string
  readonly snapshot: readonly { readonly id: string, readonly rev: string }[]
}

/** A digest of the question's record fields (§7.2), as acceptProposal recomputes it from the graph. */
export function askDigestOf(ask: { readonly title: string, readonly text: string, readonly proposal: string, readonly reason: string, readonly cost?: string, readonly notTaken?: string }): string {
  const text = [ask.title, askOf(ask.text), ask.proposal, ask.reason, ask.cost ?? '', ask.notTaken ?? ''].map(entry => entry.trim()).join('\n')
  return createHash('sha256').update(text).digest('hex').slice(0, 12)
}

/** The takeover attach after `bootstrap:`: the takeover id and the round, when it is a list round. */
export function listAttachOf(attach: string | undefined): { readonly id: string, readonly round: number } | undefined {
  if (attach === undefined) return undefined
  const round = /^tk-[0-9a-z]{8}:list-([1-9][0-9]{0,3})$/.exec(attach)?.[1]
  return round === undefined ? undefined : { id: attach.slice(0, attach.indexOf(':')), round: Number(round) }
}

/** The nodes this takeover proposed that are still open proposals (§7.1), parents before children. */
export function takeoverSet(graph: LoadedGraph, takeover: Pick<OpenTakeover, 'openedAt'>): readonly GraphNode[] {
  const nodes = [...graph.nodes.values()].filter((node) => {
    const first = node.history[0]
    return node.status === 'proposed' && first?.op === 'propose' && first.at >= takeover.openedAt
  })
  const depthOf = (node: GraphNode): number => {
    let depth = 0
    const seen = new Set<string>()
    for (let current: GraphNode | undefined = node; current?.parent !== undefined && !seen.has(current.id); current = graph.nodes.get(current.parent)) {
      depth += 1
      seen.add(current.id)
    }
    return depth
  }
  const createdAt = (node: GraphNode): string => node.history[0]?.at ?? ''
  return nodes.sort((a, b) => depthOf(a) - depthOf(b) || createdAt(a).localeCompare(createdAt(b)) || a.id.localeCompare(b.id))
}

/** One duplicate pair of the set: same type, same parent, same title (NFKC, whitespace folded). The later one is rejected on agreement (§7.1). */
export function duplicatesOf(set: readonly GraphNode[]): readonly { readonly keep: GraphNode, readonly later: GraphNode }[] {
  const seen = new Map<string, GraphNode>()
  const duplicates: { keep: GraphNode, later: GraphNode }[] = []
  for (const node of set) {
    const key = `${node.type}|${node.parent ?? ''}|${normalizeText(node.title)}`
    const earlier = seen.get(key)
    if (earlier === undefined) seen.set(key, node)
    else duplicates.push({ keep: earlier, later: node })
  }
  return duplicates
}

/** One question the takeover handed to the human (§7.1), named by its body's last line. */
export interface TakeoverQuestion {
  readonly id: string
  readonly title: string
  readonly kind: 'cost' | 'touch' | 'list' | 'rule'
  /** The whole attach: `bootstrap:tk-…:…` or the rules board's `rules:p-…`. */
  readonly attach: string
  readonly decided: boolean
  readonly dropped: boolean
}

/** The questions of this takeover (§7.1): first history at or after `openedAt`, last body line a takeover attach or a rules proposal. */
export function takeoverQuestions(graph: LoadedGraph, takeover: Pick<OpenTakeover, 'id' | 'openedAt'>): readonly TakeoverQuestion[] {
  const questions = [...graph.nodes.values()].filter((node) => {
    if (node.type !== 'question') return false
    const first = node.history[0]
    if (first === undefined || first.at < takeover.openedAt) return false
    return takeoverAttachOf(node.body) !== undefined || proposalIdOf(node.body ?? '') !== undefined
  })
  return questions.map((node) => {
    const attach = takeoverAttachOf(node.body)
    const rules = proposalIdOf(node.body ?? '')
    const suffix = attach?.split(':')[2] ?? ''
    const kind: TakeoverQuestion['kind'] = attach !== undefined ? suffix === 'cost' ? 'cost' : suffix === 'touch' ? 'touch' : 'list' : 'rule'
    const decided = node.status === 'done' && node.conclusion !== undefined
    return { id: node.id, title: node.title, kind, attach: attach ?? `rules:${rules ?? ''}`, decided, dropped: node.status === 'dropped' }
  })
}

/** How the rules board answers about one of its proposals right now; undefined while it is not here or cannot be asked (U11). */
export type RulesLookup = (cwd: string | undefined, proposal: string) => Promise<boolean | undefined>

/** One line per question in the human's words (§7.7), for status, the full list and the applied result. */
export async function questionStatus(graph: LoadedGraph, takeover: Pick<OpenTakeover, 'id' | 'openedAt'>, rules: RulesLookup | undefined, cwd: string | undefined): Promise<readonly string[]> {
  const lines: string[] = []
  for (const question of takeoverQuestions(graph, takeover)) {
    if (question.kind === 'cost' || question.kind === 'touch') {
      lines.push(question.decided ? `${question.kind === 'cost' ? '花钱或独占' : '不许碰'}：你说了，主 Agent 还没记进规范` : `${question.kind === 'cost' ? '花钱或独占' : '不许碰'}：在等你回话`)
      continue
    }
    if (question.kind === 'list') {
      lines.push(question.decided ? '清单：你同意了' : '清单：在等你回话')
      continue
    }
    const head = `规则「${question.title}」：`
    if (rules === undefined) {
      lines.push(`${head}规则板没装，系统不会拦`)
      continue
    }
    if (question.dropped) {
      lines.push(`${head}你说不要了`)
      continue
    }
    const open = await rules(cwd, question.attach.slice('rules:'.length))
    if (question.decided) lines.push(head + (open === true ? '你同意了，规则板还没写上；一分钟内会按图补上，还不行就看规则页的恢复一节' : '已生效'))
    else lines.push(head + (open === true ? '在等你回话' : open === false ? '规则板里没有这条提议了（过期或被换掉），要的话让主 Agent 重新提' : '规则板没装，系统不会拦'))
  }
  return lines
}

// ---------------------------------------------------------------------------
// The view of one round (§7.3)

/** What the runtime hands the round about the trial (§6.3's `trial.json`, as far as the texts read it). */
export interface TrialFacts {
  readonly done: boolean
  readonly results: readonly {
    readonly text: string
    readonly kind: string
    readonly outcome: string
    readonly ms?: number
    readonly afterSetupFailure?: boolean
    readonly refused?: string
  }[]
}

/** The usable trial result of one command text (§6.3): passed, or failed with a time, and not after a failed setup. */
function usableOf(trial: TrialFacts | undefined, text: string): { readonly ms: number } | undefined {
  const hit = (trial?.results ?? []).find(result => result.text === text && result.outcome !== 'running' && result.afterSetupFailure !== true)
  if (hit === undefined) return undefined
  if (hit.outcome === 'passed') return { ms: hit.ms ?? 0 }
  if (hit.outcome === 'failed' && typeof hit.ms === 'number') return { ms: hit.ms }
  return undefined
}

/** The commands of the detail (§7.3) and the change lines among them (§5.6), from the graph as the round sees it. */
function detailCommands(graph: LoadedGraph, set: readonly GraphNode[], trial: TrialFacts | undefined): { readonly commands: readonly DetailCommand[], readonly changed: number } {
  const commands: DetailCommand[] = []
  let changed = 0
  for (const command of parseGateNorm(graph.nodes.get(MERGE_GATE_ID)).commands) {
    if (command.changed !== undefined) changed += 1
    const usable = usableOf(trial, command.command)
    commands.push({
      cls: command.kind === 'patrol' ? 'patrol' : 'gate',
      text: command.command,
      ...(command.kind === 'patrol' ? { scope: [] as readonly string[] } : command.when === undefined ? {} : { scope: command.when }),
      ...(usable === undefined ? {} : { ranSec: Math.max(1, Math.ceil(usable.ms / 1000)) }),
    })
  }
  for (const node of set) {
    if (!isEnvTool(node)) continue
    for (const { entry } of nodeChecks(node)) {
      if (entry.paths === undefined) continue
      commands.push({ cls: 'check', text: entry.argv.join(' '), ...(entry.estimateSeconds === undefined ? {} : { estimateSec: entry.estimateSeconds }) })
    }
  }
  return { commands, changed }
}

/** The title of a node as the human reads it: no `*`, at most 16 code points (15 and 「…」 when longer). */
const readerTitle = (title: string): string => {
  const bare = title.replaceAll('*', '').trim()
  const points = [...bare]
  return points.length > 16 ? `${points.slice(0, 15).join('')}…` : bare
}

/** The whole view of one round, as present.ts reads it (§7.3). */
function viewOf(input: {
  readonly takeover: OpenTakeover
  readonly round: number
  readonly graph: LoadedGraph
  readonly summary: string
  readonly pathBasis: string
  readonly testsMissing: boolean
  readonly trial: TrialFacts | undefined
  readonly statuses: readonly string[]
}): FullView {
  const { takeover, graph, trial } = input
  const set = takeoverSet(graph, takeover)
  const duplicates = duplicatesOf(set)
  const anchor = set.find(node => node.type === 'goal')
  const detail = detailCommands(graph, set, trial)
  const tasks = set.filter(node => node.type === 'task')
  const done = tasks.filter(node => (node.body ?? '').includes(EVIDENCE_LABEL)).length
  const results = trial?.results ?? []
  const gateCommands = parseGateNorm(graph.nodes.get(MERGE_GATE_ID)).commands
  const gateFailed = gateCommands.find(command => results.some(result => result.text === command.command && result.outcome === 'failed'))
  const limited = results.filter(result => result.outcome === 'confinement-limited' || result.outcome === 'timed-out')
  const running = results.filter(result => result.outcome === 'running')
  const untried = results.filter(result => result.refused !== undefined)
  const questions = takeoverQuestions(graph, takeover)
  const pendingRule = questions.find(question => question.kind === 'rule' && !question.decided && !question.dropped)
  const others = [...graph.nodes.values()].filter(node => node.type === 'question' && node.status !== 'done' && node.status !== 'dropped' && node.status !== 'superseded' && proposedSinceOpen(graph, node.id, takeover.openedAt))
  return {
    takeover: { id: takeover.id, path: takeover.path },
    anchor: anchor?.id ?? '',
    anchorTitle: readerTitle(anchor?.title ?? ''),
    round: input.round,
    goals: set.filter(node => node.type === 'goal').length,
    tasks: tasks.length,
    done,
    missing: [],
    commands: detail.commands,
    changed: detail.changed,
    costs: {
      ...(gateFailed === undefined ? {} : { gateFailed: gateFailed.command }),
      hasGateCommand: gateCommands.length > 0,
      testsMissing: input.testsMissing,
      limitedCount: limited.length,
      ...(limited.length === 1 && limited[0]?.kind === 'gate' ? { limitedSingle: limited[0]?.text } : {}),
      runningCount: running.length,
      untriedCount: untried.length,
      ...(pendingRule === undefined ? {} : { rulePending: pendingRule.title }),
    },
    notTaken: {
      changed: detail.changed,
      pending: tasks.length - done,
    },
    summary: input.summary,
    nodes: set.map(node => ({ id: node.id, title: node.title, type: node.type, ...(node.parent === undefined ? {} : { parent: node.parent }), ...(node.acceptance === undefined ? {} : { acceptance: node.acceptance }), ...(duplicates.some(pair => pair.later.id === node.id) ? { duplicate: true } : {}) })),
    runs: Object.fromEntries(detail.commands.map((command) => {
      const result = results.find(entry => entry.text === command.text)
      if (result === undefined) return [command.text, {}]
      return [command.text, {
        outcome: result.outcome,
        ...(result.ms === undefined ? {} : { ms: result.ms }),
        ...(result.afterSetupFailure === true ? { notRun: '准备没过，这一条的结果可能因此失败' } : {}),
      }]
    })),
    statuses: input.statuses,
    othersPending: others.length,
    pathBasis: input.pathBasis,
    warnings: [],
  }
}

export interface ReviewDeps {
  /** Whether the caller is its project's main agent (§7.2 item 1). */
  readonly isMain: (agent: ToolExecutionContext['agent']) => boolean
  /** The open takeover of the caller's project, or undefined. */
  readonly open: (agent: ToolExecutionContext['agent']) => Promise<OpenTakeover | undefined>
  readonly graph: (takeover: OpenTakeover) => Promise<LoadedGraph>
  /** `git merge-base --is-ancestor <sha> HEAD` in the takeover's project (§7.2 item 6). */
  readonly ancestor: (takeover: OpenTakeover, sha: string) => Promise<boolean>
  readonly testsMissing: (takeover: OpenTakeover) => Promise<boolean>
  readonly pathBasis: (takeover: OpenTakeover) => Promise<string>
  readonly trial: (takeover: OpenTakeover) => TrialFacts | undefined
  readonly rulesWhole: () => boolean
  readonly rules: RulesLookup
  /** Start the trial round in the background when one is due (§6.3: the first review starts it too). */
  readonly startTrial: (takeover: OpenTakeover, agent: ToolExecutionContext['agent']) => void
  /** Open the round: review-<n>.md, the journal record, the stage (§7.2). */
  readonly openRound: (takeover: OpenTakeover, round: number, view: FullView, detail: { readonly markdown: string, readonly mustShow: readonly string[] }, digest: string, snapshot: readonly { readonly id: string, readonly rev: string }[], callId: string) => Promise<void>
  readonly round: (takeover: OpenTakeover) => number
  /** Whether a round or the write is running in the caller's project (§9.4). */
  readonly busy: (agent: ToolExecutionContext['agent']) => boolean
  readonly setBusy: (agent: ToolExecutionContext['agent'], value: boolean) => void
  readonly cwd: (agent: ToolExecutionContext['agent']) => string | undefined
}

/** Whether an env tool node is this takeover's proposal (§7.2 item 10 checks only those). */
const ownTool = (graph: LoadedGraph, node: GraphNode, openedAt: string): boolean => isEnvTool(node) && proposedSinceOpen(graph, node.id, openedAt)

/** The ten checks (§7.2), in order; the round's view when they all hold. */
export async function checkRound(deps: Pick<ReviewDeps, 'ancestor' | 'rulesWhole' | 'trial'>, takeover: OpenTakeover, graph: LoadedGraph, summary: string): Promise<{ readonly ok: true, readonly view: FullView } | { readonly ok: false, readonly code: 'gate_unmet', readonly message: string }> {
  const set = takeoverSet(graph, takeover)
  const anchor = set.find(node => node.type === 'goal')
  const missing: string[] = []
  if (anchor === undefined) missing.push('the anchor goal')
  for (const id of NORM_IDS) if (!graph.nodes.has(id)) missing.push(id)
  const gate = parseGateNorm(graph.nodes.get(MERGE_GATE_ID))
  if (!graph.nodes.has(ENV_ID)) missing.push(ENV_ID)
  if (!graph.nodes.has(FLOOR_ID)) missing.push(FLOOR_ID)
  if (gate.commands.length === 0) missing.push(`${MERGE_GATE_ID} with at least one \`$ <command>\` line`)
  if (missing.length > 0) return { ok: false, code: 'gate_unmet', message: `not on the graph yet: ${missing.join(', ')}` }
  // §7.6's empty-graph-commit finding: an only line the gate cannot read leaves gate.only empty, and the trunk guard then refuses the graph-directory commit the closing hands over. Send the line back before the round opens.
  const unreadable = unreadableOnlyLines(graph.nodes.get(MERGE_GATE_ID))
  if (unreadable.length > 0) {
    return {
      ok: false,
      code: 'gate_unmet',
      message: `${MERGE_GATE_ID} has only line(s) the gate cannot read: ${unreadable.join(' | ')} — write each as one whole-line backticked acceptance with forward-slash paths, like \`only docs/graph/\`; without it the trunk guard refuses the graph-directory commit`,
    }
  }
  const goals = set.filter(node => node.type === 'goal')
  const withoutAcceptance = goals.filter(goal => (goal.acceptance ?? []).length === 0)
  if (goals.length === 0 || withoutAcceptance.length > 0) {
    return { ok: false, code: 'gate_unmet', message: goals.length === 0 ? 'propose at least one goal first' : `these goals have no acceptance yet: ${withoutAcceptance.map(goal => goal.id).join(', ')}` }
  }
  const unwritten: string[] = []
  for (const id of ['norm-decision-tiers', 'norm-verify-tiers'] as const) {
    const node = graph.nodes.get(id)
    if (node === undefined || !proposedSinceOpen(graph, id, takeover.openedAt)) continue
    for (const label of id === 'norm-decision-tiers' ? ['不许碰：'] : ['花钱或独占：']) {
      const value = (node.body ?? '').split('\n').find(entry => entry.startsWith(label))?.slice(label.length).trim() ?? ''
      if (value === '' || value.startsWith('（接管时问人')) unwritten.push(`${id} ${label}`)
    }
  }
  const questions = takeoverQuestions(graph, takeover)
  for (const thing of ['cost', 'touch'] as const) {
    const question = questions.find(entry => entry.kind === thing)
    if (question === undefined || !question.decided) unwritten.push(`the ${thing} question is not decided`)
  }
  if (unwritten.length > 0) return { ok: false, code: 'gate_unmet', message: `put the two things to the human first (questions.md), then write their answers into the labels: ${unwritten.join('; ')}` }
  const badShas: string[] = []
  for (const node of set.filter(node => node.type === 'task')) {
    const line = (node.body ?? '').split('\n').find(entry => entry.includes(EVIDENCE_LABEL))
    if (line === undefined) continue
    for (const sha of line.slice(line.indexOf(EVIDENCE_LABEL) + EVIDENCE_LABEL.length).split(/[,，\s]+/).filter(entry => entry !== '')) {
      const lower = sha.toLowerCase()
      if (!/^[0-9a-f]{7,40}$/.test(lower)) badShas.push(`${node.id}: ${sha} is not 7-40 hex digits`)
      else if (!await deps.ancestor(takeover, lower)) badShas.push(`${node.id}: ${sha} is not an ancestor of HEAD`)
    }
  }
  if (badShas.length > 0) return { ok: false, code: 'gate_unmet', message: `these 完成证据 entries do not hold: ${badShas.join('; ')}` }
  if (deps.rulesWhole()) {
    // Every repository path in 不许碰 needs a rule question, unless its line marks it 只写进规范 (§7.2 item 7).
    const unguarded = (graph.nodes.get('norm-decision-tiers')?.body ?? '').split('\n')
      .filter(line => line.startsWith('不许碰：') && !line.includes('只写进规范'))
      .map(line => line.slice('不许碰：'.length))
      .join('　')
    const inside = /(?:^|[\s，、\u3000])((?:src|docs|scripts|packages|tests|ui|vendor|reference|app|lib)\/[^\s，、；\u3000]*)/.exec(unguarded)?.[1]
    if (inside !== undefined && !questions.some(question => question.kind === 'rule' && !question.dropped)) {
      return { ok: false, code: 'gate_unmet', message: `propose the rule for ${inside} (rule-draft.json) and put it to the human, or write 只写进规范 after a path` }
    }
  }
  const trial = deps.trial(takeover)
  const view = viewOf({ takeover, round: 0, graph, summary, pathBasis: '', testsMissing: false, trial, statuses: [] })
  const shown = commandsDetail(view)
  if ([...shown.markdown].length > 5000) {
    return { ok: false, code: 'gate_unmet', message: 'the commands that will run do not fit in one reply: shorten the longest ones, or leave the long-running ones out of norm-merge-gate' }
  }
  const wrongLines: string[] = []
  for (const node of set.filter(node => ownTool(graph, node, takeover.openedAt))) {
    for (const { line, entry } of nodeChecks(node)) {
      if (entry.paths === undefined) continue
      const measured = usableOf(trial, entry.argv.join(' '))
      const seconds = measured === undefined ? undefined : Math.max(1, Math.ceil(measured.ms / 1000))
      if (entry.estimateSeconds !== seconds) {
        const name = /^`?check\s+(\S+)/.exec(line ?? '')?.[1] ?? entry.name
        wrongLines.push(seconds === undefined
          ? `remove the estimate from this line, the trial has no usable result for it (node ${node.id}, check ${name})`
          : `rewrite this check line exactly as given; the estimate is the trial's measured time and the harness checks it: \`check ${name} ${entry.format} ${seconds}s $ ${entry.argv.join(' ')}\` when ${entry.paths.join(', ')} (node ${node.id}, edit your own proposal with graph_edit)`)
      }
    }
  }
  if (wrongLines.length > 0) return { ok: false, code: 'gate_unmet', message: wrongLines.join('\n') }
  return { ok: true, view }
}

const PARAMETERS = {
  type: 'object',
  properties: { summary: { type: 'string', description: 'What you read of the project, in your own words, 1-1500 characters; open forks only the human can decide go here, to be asked when the work reaches them.' } },
  required: ['summary'],
  additionalProperties: false,
} as const

const OUTPUT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', description: 'Whether a round was opened.' },
    round: { type: 'number', description: 'The round number.' },
    parent: { type: 'string', description: 'The anchor goal the question hangs under.' },
    question: { type: 'string', description: 'The open list question of an earlier round, to revise instead of proposing a new one.' },
    form: { type: 'string', description: 'The way of asking; always recommend.' },
    title: { type: 'string' },
    text: { type: 'string', description: 'The question, word for word.' },
    proposal: { type: 'string' },
    reason: { type: 'string' },
    cost: { type: 'string' },
    notTaken: { type: 'string' },
    attach: { type: 'string', description: 'The takeover attach of this round.' },
    args: { type: 'string', description: 'The exact arguments of the propose_to_human call, as one JSON object; pass them verbatim.' },
    recordedAs: { type: 'string', description: 'The exact conclusion to record.' },
    listFile: { type: 'string', description: 'The full list on disk, for 讲细点.' },
    trial: { type: 'object', description: 'How much of the trial round has results.' },
    message: { type: 'string', description: 'What to do with the fields.' },
  },
  required: ['ok'],
} as const

const DESCRIPTION = [
  'Open a list round of the takeover of this project: the harness checks what you proposed (the goals with acceptance, the merge gate, env with its tool nodes, the floor, the two answers), writes review-<n>.md, and returns the one question to put to the human with propose_to_human, word for word. Main agent only.',
  '',
  BOOTSTRAP_REVIEW_EXAMPLE,
].join('\n')

/** The tool's name: index.ts registers it and keeps it out of non-main agents' faces. */
export const REVIEW_TOOL = 'bootstrap_review'

/** The tool. Registered globally; the row's face filter keeps it for the main agent of a project with an open takeover, and the body checks its caller too (§7.2). */
export function bootstrapReviewTool(deps: ReviewDeps): ToolDefinitionLike {
  return {
    ...toolShell(REVIEW_TOOL, DESCRIPTION, PARAMETERS, OUTPUT),
    async execute(raw: unknown, exec: ToolExecutionContext): Promise<Record<string, unknown>> {
      const summary = (raw as { summary?: unknown })?.summary
      if (typeof summary !== 'string' || summary.trim().length < 1 || summary.trim().length > 1500) {
        refuse('invalid', 'summary is 1 to 1500 characters: what you read of the project', 'write or shorten it, then call again', 'summary')
      }
      const agent = exec.agent
      const cwd = deps.cwd(agent)
      if (!deps.isMain(agent)) refuse('forbidden', 'only the main agent of the takeover opens a list round', 'the takeover runs in the main agent session of the project (it opens with /wish)')
      const takeover = await deps.open(agent)
      if (takeover === undefined || takeover.path === 'new') {
        refuse('not_ready', takeover === undefined ? 'no open takeover in this project' : 'new projects are agreed with the release; no list here', takeover === undefined ? '/hourness-init opens the takeover of an existing project' : 'agree the takeover with the big release and the env module release')
      }
      if (takeover.stage === 'apply') {
        refuse('not_ready', 'the takeover is being written from the human\'s agreement; it finishes before your next step', 'wait one step; the write reads the graph, not the chat')
      }
      if (deps.busy(agent)) refuse('busy', 'another round is being opened', 'call again at your next step')
      const graph = await deps.graph(takeover)
      const checked = await checkRound(deps, takeover, graph, summary.trim())
      if (!checked.ok) refuse(checked.code, checked.message, 'fix what the message names, then call bootstrap_review again')
      const round = deps.round(takeover) + 1
      const statuses = await questionStatus(graph, takeover, deps.rules, cwd)
      const view: FullView = { ...checked.view, round, statuses, pathBasis: await deps.pathBasis(takeover) }
      const ask = listAsk(view)
      const detail = commandsDetail(view)
      const attach = `bootstrap:${takeover.id}:list-${round}`
      const digest = askDigestOf(ask)
      const snapshot = takeoverSet(graph, takeover).map(node => ({ id: node.id, rev: graph.revisions.get(node.id) ?? '' }))
      const decided = takeoverQuestions(graph, takeover).find(question => question.kind === 'list' && !question.decided && !question.dropped)
      deps.setBusy(agent, true)
      try {
        deps.startTrial(takeover, agent)
        await deps.openRound(takeover, round, { ...view, summary }, detail, digest, snapshot, exec.callId)
      }
      finally {
        deps.setBusy(agent, false)
      }
      const trial = deps.trial(takeover)
      // The consent seam (§7.4): the round's digests are over exactly these words, so the mechanical quote records and any rewording is refused.
      const fields = { title: ask.title, text: ask.text, proposal: ask.proposal, reason: ask.reason, ...(ask.cost === undefined ? {} : { cost: ask.cost }), ...(ask.notTaken === undefined ? {} : { notTaken: ask.notTaken }) }
      return {
        ok: true,
        round,
        parent: view.anchor,
        ...(decided === undefined ? {} : { question: decided.id }),
        form: 'recommend',
        ...fields,
        attach,
        args: JSON.stringify({ kind: 'question', form: 'recommend', parent: view.anchor, ...fields, attach }),
        recordedAs: listConclusion(round),
        listFile: `.llm/bootstrap/${takeover.id}/review-${round}.md`,
        trial: { done: trial?.done === true, total: trial?.results.length ?? 0 },
        message: `Call propose_to_human with args exactly as given: pass the JSON object verbatim, every field word for word — the harness refuses the record when any field differs${decided === undefined ? '' : ` (or replace parent with question ${decided.id} to revise the open list question instead of proposing a new one)`}. When they agree, call record_human_answer with answer agree, their words, and recordedAs exactly as given; the harness then writes the takeover. If they correct something, change the nodes and call bootstrap_review again.`,
      }
    },
  }
}

// ---------------------------------------------------------------------------
// The write (§7.4) and the resume (§9.2)

export type AcceptCode = 'missing' | 'stale' | 'changed' | 'unseen' | 'busy' | 'io'

export interface ApplyDeps {
  /** `git merge-base --is-ancestor`, again before a task is closed (§7.4 step 3). */
  readonly ancestor: (sha: string) => Promise<boolean>
  /** The journal writers; they answer false when the takeover closed meanwhile. */
  readonly journal: (takeover: OpenTakeover, records: readonly { readonly op: string, readonly data: Readonly<Record<string, unknown>> }[]) => Promise<boolean>
  /** The engine of the graph directory. */
  readonly engine?: (dir: string) => ReturnType<typeof openEngine>
}

/** The totals the anchor comment and the result report (§7.4 step 4), read off the graph after the steps. */
export interface ApplyTotals {
  readonly approved: number
  readonly skipped: number
  readonly rejected: number
  readonly done: number
}

/** The decide history the takeover acts on: the last one, by an llm carrying the human's words (§7.4 check 2). */
function decideOf(node: GraphNode): { readonly relay: string, readonly reason: string } | undefined {
  const decided = [...node.history].reverse().find(entry => entry.op === 'decide')
  if (decided === undefined || decided.actor !== 'llm' || (decided.relay ?? '').trim() === '') return undefined
  return { relay: decided.relay ?? '', reason: decided.reason ?? '' }
}

/** Verify the graph's decision against the stored round (§7.4's checks 1–5a); why it does not hold, or the decide. */
function verifyDecision(node: GraphNode | undefined, takeover: OpenTakeover, stored: RoundRecord): { readonly ok: true, readonly decide: { readonly relay: string, readonly reason: string } } | { readonly ok: false, readonly code: AcceptCode, readonly why: string } {
  const proposal = node !== undefined && node.type === 'question' && node.form === 'recommend' && node.ask !== undefined && node.proposal !== undefined && node.reason !== undefined && node.ways === undefined
  if (!proposal || node.status !== 'done' || node.conclusion === undefined) return { ok: false, code: 'missing', why: 'the question is not a decided proposal question' }
  const attachLine = takeoverAttachOf(node.body ?? '')
  const attach = listAttachOf(attachLine === undefined ? undefined : attachLine.slice(TAKEOVER_ATTACH_PREFIX.length))
  if (attach === undefined || attach.id !== takeover.id) return { ok: false, code: 'missing', why: 'the question does not name this takeover\'s list' }
  if (attach.round !== takeover.round) return { ok: false, code: 'stale', why: `round ${attach.round} is not the current list (${takeover.round})` }
  const decide = decideOf(node)
  if (decide === undefined) return { ok: false, code: 'unseen', why: 'the decision does not carry the human\'s words' }
  const digest = askDigestOf({ title: node.title, text: node.ask ?? '', proposal: node.proposal ?? '', reason: node.reason ?? '', ...(node.cost === undefined ? {} : { cost: node.cost }), ...(node.notTaken === undefined ? {} : { notTaken: node.notTaken }) })
  if (digest !== stored.askDigest) return { ok: false, code: 'changed', why: 'the question on the graph differs from the round the harness wrote' }
  if ((node.conclusion ?? '').trim() !== listConclusion(attach.round)) return { ok: false, code: 'changed', why: 'the conclusion is not the one the harness fixed' }
  if (!decide.reason.includes(`${SHOWN_MARK} ${stored.detailDigest}`)) return { ok: false, code: 'unseen', why: 'the agreement carries no mark that the human saw the exact commands' }
  return { ok: true, decide }
}

/** The totals over the snapshot, as the graph holds them now (§7.4 step 4's numbers). */
function totalsOf(graph: LoadedGraph, stored: RoundRecord): ApplyTotals {
  let approved = 0
  let skipped = 0
  let rejected = 0
  let done = 0
  for (const entry of stored.snapshot) {
    const node = graph.nodes.get(entry.id)
    if (node === undefined) continue
    if (node.type === 'task' && node.status === 'done') done += 1
    else if (node.status === 'proposed') skipped += 1
    else if (node.status === 'dropped') rejected += 1
    else approved += 1
  }
  return { approved, skipped, rejected, done }
}

/**
 * The six steps (§7.4), each judged against the graph before it writes, so a
 * repeat after a crash writes nothing twice (§9.2). The caller wrote
 * `apply-start` and moved the stage to `apply` first; this runs the approves,
 * the duplicate rejects, the done tasks, the anchor comment, the wish
 * hand-back and the close.
 */
export async function applyAgreement(deps: ApplyDeps, takeover: OpenTakeover, stored: RoundRecord, questionId: string, journal: (records: readonly { readonly op: string, readonly data: Readonly<Record<string, unknown>> }[]) => Promise<boolean>): Promise<{ readonly ok: true, readonly totals: ApplyTotals, readonly wish?: string } | { readonly ok: false, readonly code: AcceptCode, readonly why: string }> {
  const dir = takeover.graphDir
  const engine = deps.engine?.(dir) ?? openEngine(dir)
  let graph = await engine.load()
  const verified = verifyDecision(graph.nodes.get(questionId), takeover, stored)
  if (!verified.ok) return verified
  const relay = verified.decide.relay
  const mark = `（待决 ${questionId}）`
  const write = async (mutation: Record<string, unknown>): Promise<boolean> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await engine.apply('llm', mutation)
      if (result.ok) return true
      if (result.error.code === 'stale_revision') {
        graph = await engine.load()
        const fresh = graph.revisions.get(String(mutation.id))
        if (fresh !== undefined && fresh !== mutation.rev) mutation = { ...mutation, rev: fresh }
        continue
      }
      if (result.error.code === 'conflict' || result.error.code === 'bad_transition') return false
      return false
    }
    return false
  }
  // The round's nodes as the graph holds them now: the snapshot's ids, whatever their status (steps 1–3 moved most).
  const roundNodes = (current: LoadedGraph): readonly GraphNode[] => stored.snapshot.map(entry => current.nodes.get(entry.id)).filter((node): node is GraphNode => node !== undefined)
  // The later of each duplicate pair: step 1 leaves it out, step 2 rejects it (§7.4 steps 1–2; an approved duplicate could not be rejected any more).
  const laterOf = new Set(duplicatesOf(roundNodes(graph)).map(pair => pair.later.id))
  // Step 1: approve the snapshot's nodes that are still proposals at their snapshot revision; the changed ones and the later duplicates are skipped (§7.4 step 1).
  for (const entry of stored.snapshot) {
    if (laterOf.has(entry.id)) continue
    const current = graph.nodes.get(entry.id)
    if (current === undefined || current.status !== 'proposed') continue
    if (graph.revisions.get(entry.id) !== entry.rev) continue
    if (await write({ op: 'approve', id: entry.id, rev: entry.rev, reason: `接管清单第 ${takeover.round} 版：人在对话里同意${mark}`, relay })) graph = await engine.load()
  }
  // Step 2: reject the later of each duplicate pair, still proposed (§7.4 step 2).
  for (const later of roundNodes(graph).filter(node => node.status === 'proposed' && laterOf.has(node.id))) {
    const rev = graph.revisions.get(later.id)
    if (rev === undefined) continue
    if (await write({ op: 'reject', id: later.id, rev, reason: `接管清单第 ${takeover.round} 版上列为重复`, relay })) graph = await engine.load()
  }
  // Step 3: the tasks that carry 完成证据 become done with their commit evidence, by the harness (§7.4 step 3).
  for (const task of roundNodes(graph).filter(node => node.type === 'task' && node.status === 'approved' && (node.body ?? '').includes(EVIDENCE_LABEL))) {
    const line = (task.body ?? '').split('\n').find(entry => entry.includes(EVIDENCE_LABEL))
    const shas = (line ?? '').slice((line ?? '').indexOf(EVIDENCE_LABEL) + EVIDENCE_LABEL.length).split(/[,，\s]+/).filter(entry => entry !== '').map(sha => sha.toLowerCase())
    const alive: { readonly kind: 'commit', readonly ref: string }[] = []
    for (const sha of shas) if (await deps.ancestor(sha)) alive.push({ kind: 'commit', ref: sha })
    if (alive.length === 0) continue
    const rev = graph.revisions.get(task.id)
    if (rev === undefined) continue
    const done = await engine.apply('harness', { op: 'status', id: task.id, rev, to: 'done', evidence: alive, reason: '接管：已有的提交' })
    if (done.ok) graph = await engine.load()
  }
  const totals = totalsOf(graph, stored)
  // Step 4: the anchor comment, once per question (§7.4 step 4).
  const anchor = roundNodes(graph).find(node => node.type === 'goal')?.id ?? graph.nodes.get(questionId)?.parent ?? ''
  const said = relay.length > 200 ? `${[...relay].slice(0, 200).join('')}…` : relay
  const comment = `接管完成（待决 ${questionId}）：批准 ${totals.approved}，跳过 ${totals.skipped}，拒掉 ${totals.rejected}，关掉 ${totals.done}；人在对话里说：「${said}」${takeover.wish === undefined ? '' : `；入口时许的愿：「${takeover.wish}」`}`
  const anchorNode = graph.nodes.get(anchor)
  if (anchorNode !== undefined && !(anchorNode.history ?? []).some(entry => entry.op === 'comment' && entry.actor === 'harness' && entry.text === comment)) {
    const written = await engine.apply('harness', { op: 'comment', id: anchor, text: comment })
    if (written.ok) graph = await engine.load()
  }
  // Step 5: the wish goes back to the main agent with the result, once (§7.4 step 5).
  let wish: string | undefined
  if (takeover.wish !== undefined && !takeover.wishDone) {
    if (!await journal([{ op: 'apply', data: { questionId, step: 'wish', outcome: 'done' } }])) return { ok: false, code: 'io', why: 'the journal refused the wish record' }
    wish = takeover.wish
  }
  // Step 6: close (§7.4 step 6).
  if (!await journal([{ op: 'takeover-closed', data: { reason: 'approved', counts: totals } }])) return { ok: false, code: 'io', why: 'the journal refused the close' }
  void mark
  return { ok: true, totals, ...(wish === undefined ? {} : { wish }) }
}

/** The result message M3 puts into record_human_answer's result (§7.4). */
export function appliedMessage(takeover: Pick<OpenTakeover, 'id' | 'round'>, totals: ApplyTotals, statuses: readonly string[], graphDir: string, wish: string | undefined): string {
  return resultMessage('applied', takeover.id, takeover.round, {
    counts: totals,
    rules: statuses.filter(line => line.startsWith('规则「')),
    rulesLive: statuses.some(line => line.includes('已生效')),
    ...(wish === undefined ? {} : { wish }),
    graphDir,
  })
}

// ---------------------------------------------------------------------------
// The project graph in git (§7.6)

/** The node files of the graph directory git tracks; undefined when git cannot say (the 5 s cap). */
export function trackedGraphFiles(root: string, graphDir: string): Promise<readonly string[] | undefined> {
  const rel = graphDir.toLowerCase().startsWith(root.toLowerCase()) ? graphDir.slice(root.length).replaceAll('\\', '/').replace(/^\//, '') : graphDir
  return new Promise((resolve) => {
    const child = execFile('git', ['-c', 'core.fsmonitor=false', '-c', 'core.quotepath=false', 'ls-files', '--', `${rel}/nodes`], { cwd: root, timeout: 5000, windowsHide: true }, (error, stdout) => {
      resolve(error === null ? stdout.split('\n').filter(line => line !== '') : undefined)
    })
    child.on('error', () => resolve(undefined))
  })
}

/** The harness comment that records a baseline on a tool node (§5.6 item 3). */
export const baselineComment = (count: number, sha: string, date: string): string => `基线：${count} 条（${sha.slice(0, 7)}，${date}）`

/** Whether one check-line entry's command is the checker command, with or without the {files} placeholder (§5.6 item 3). */
function checkCommandIs(entry: CheckEntry, command: string): boolean {
  const bare = command.replace(/ \{files\}/, '')
  const plain = entry.argv.filter(item => item !== '{files}').join(' ')
  return entry.argv.join(' ') === command || plain === command || entry.argv.join(' ') === bare
}

/** The env tool nodes' check lines whose command matches the checker command, with or without {files}, in graph order (§5.6 item 3). */
function matchingChecks(graph: LoadedGraph, command: string): ReadonlyArray<{ readonly node: GraphNode, readonly entry: CheckEntry }> {
  const matched: { readonly node: GraphNode, readonly entry: CheckEntry }[] = []
  for (const node of graph.nodes.values()) {
    if (!isEnvTool(node)) continue
    for (const { entry } of nodeChecks(node)) {
      if (entry.paths !== undefined && checkCommandIs(entry, command)) matched.push({ node, entry })
    }
  }
  return matched
}

/** The check-line format a checker command reads in, from the env tool nodes (§5.6 item 3: a gate checker pairs with a tool-node check line by its text). */
export function formatOf(graph: LoadedGraph, command: string): 'eslint-json' | 'tsc' | 'lines' | undefined {
  return matchingChecks(graph, command)[0]?.entry.format
}

/** The baseline a tool node carries for one checker command, from the harness comments (§5.6 item 3, read by the gate's `changed` lines). */
export function baselineOf(graph: LoadedGraph, command: string): { readonly count: number, readonly commit: string } | undefined {
  for (const { node } of matchingChecks(graph, command)) {
    const comment = [...node.history].reverse().find(item => item.op === 'comment' && item.actor === 'harness' && (item.text ?? '').startsWith('基线：'))
    const read = /^基线：(\d+) 条（([0-9a-f]{7,40})，/.exec(comment?.text ?? '')
    if (read !== null) return { count: Number(read[1]), commit: read[2] ?? '' }
  }
  return undefined
}
