/**
 * The takeover service `glmHournessBootstrap` and the row's per-step work
 * (takeover design 0.6 §3.1, §4, §5.1, §5.4, §7.4). `prepare` opens a
 * takeover (or hands back the open one) after the deterministic part and
 * writes the drafts the main agent reads (`defaults.md`, `questions.md`,
 * `floor.md`); `holds` tells M3's stage reminder that a goal is the
 * takeover's to steer; `wants` tells M3's `/wish` whether to call
 * `prepare` at all (§3.1); `attachable`, `proposalLine` and
 * `acceptProposal` are the takeover's row of M3's attach table
 * (src/design/attach.ts) for the two things only the human can say. On
 * every step of the main agent with an open takeover the row reads the
 * journal and the graph, proposes the three norm templates under the anchor
 * as `harness` (§4.2), writes the rule draft once 不许碰 holds repository
 * paths, notes when M3 never asked `holds` (F44), and builds the reminder.
 * The takeover opens from `/wish` (M3 calls `wants`, `prepare`, `holds`) or
 * from `/hourness-init`, which is also the way in when `/wish` did not
 * (§3.1, last part).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { projectOf } from '../data/project-root.ts'
import type { Attachable, AttachService } from '../design/attach.ts'
import { openEngine } from '../graph/engine.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import { loadGraph } from '../graph/store.ts'
import { validateRule } from '../rules/model.ts'
import type { AgentLike, DerivedMessage, SessionLike, UserNotice } from '../shared/dsh-min.ts'
import type { HealthState } from '../shared/health.ts'
import { defaultsMarkdown, testsMissing } from './defaults.ts'
import { floorDraft, floorMarkdown } from './floor.ts'
import { anchorOf, gapsOf, proposedSince, proposedSinceOpen } from './gaps.ts'
import { startNotice, stepReminder, THING_LABELS, type ReminderFacts } from './notice.ts'
import { questionsDraft, questionsMarkdown, type Thing } from './present.ts'
import { writeScan, type ScanResult } from './scan.ts'
import { hasProjectGraph } from './path.ts'
import { ATTACH_PATTERN, TAKEOVER_ATTACH_PREFIX, takeoverAttachLine, takeoverAttachOf, type WishSeam } from './service.ts'
import { settleWorkspace } from './setup.ts'
import { appendTakeover, openTakeover, openTakeoverOf, recordAsked, takeoverDir, type OpenTakeover, type TakeoverPath, type TakeoverRecord } from './takeover.ts'
import { NORM_TEMPLATES } from './templates.ts'
import { thingsAsked, thingStates, touchInside } from './things.ts'
import { ruleDraft } from './touch.ts'
import { maybeStartRound, redCheckers, type RoundDeps } from './trial-round.ts'
import { readTrialFile } from './trial.ts'

/**
 * The takeover's members: those M3's `/wish` and stage reminder call
 * (src/bootstrap/service.ts `WishSeam`) and those M3's attach table calls
 * (src/design/attach.ts AttachService: `attachable` takes the attach after
 * `bootstrap:` and never rejects here, `acceptProposal` resolves to the line
 * the main agent is told).
 */
interface BootstrapService extends AttachService, WishSeam {
  attachable(input: Parameters<AttachService['attachable']>[0]): Promise<Attachable>
}

/** The labels of the three paths in the person's words. */
export const PATH_LABELS: Readonly<Record<TakeoverPath, string>> = { new: '新项目', existing: '已有项目', gaps: '补缺' }

/** The note when M3's stage reminder never asked `holds` (§9.1, F44). */
export const STAGE_NOTE = { code: 'stage-reminder-not-yielded', text: 'M3 does not yet yield its stage reminder to the takeover; expected on the transition path' } as const

/** Steps with an anchor after which a takeover that was never asked `holds` gets the note. */
const STAGE_NOTE_STEPS = 3

/** Failed proposals of one norm after which the row stops trying (§4.2). */
const NORM_ATTEMPTS = 3

export interface BootstrapDeps {
  /** The graph row's `dirFor`; undefined while the graph row is off. */
  readonly graphDir: (cwd: string | undefined) => string | undefined
  /** The user's home directory (never a project). */
  readonly home: () => string
  /** Install the row's per-agent listeners; nothing when they are installed already. */
  readonly install: (agent: AgentLike) => void
  readonly report: (agent: AgentLike, state: HealthState, reason: string) => void
  /** Whether the rules board can take a rule through the human's agreement (its service has `attachable` and `acceptProposal`). */
  readonly rulesWhole: () => boolean
  /** The trial round's host side (src/bootstrap/trial-round.ts); absent, no round starts. `notify` hands the end-of-round notice to the agent. */
  readonly trial?: Omit<RoundDeps, 'notify'> & { readonly notify: (agent: AgentLike, notice: UserNotice) => void }
}

/** What the scan says that the reminders keep needing: the tracked files and whether tests were found. */
interface ScanFacts {
  readonly files: readonly string[]
  readonly testsMissing: boolean
}

/** What the row knows of one project between steps. */
interface Live {
  takeover: OpenTakeover
  goals: ReadonlySet<string>
  anchorSteps: number
  asked: boolean
  scan?: ScanFacts
  /** The 不许碰 paths the rule draft and the floor were last written for. */
  touchWritten?: string
}

const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

const sameDir = (a: string, b: string): boolean => process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b)

/** How many commits `history.tsv` lists; 0 when it is not there. */
async function historyLines(root: string, id: string): Promise<number> {
  try {
    return (await readFile(join(takeoverDir(root, id), 'history.tsv'), 'utf8')).split('\n').filter(line => line !== '').length
  }
  catch {
    return 0
  }
}

/** The scan facts of a takeover read back from its files (after a restart); empty when they cannot be read. */
async function scanFactsOf(root: string, takeover: OpenTakeover): Promise<ScanFacts> {
  const dir = takeoverDir(root, takeover.id)
  const files = await readFile(join(dir, 'files.txt'), 'utf8').then(text => text.split('\n').filter(line => line !== ''), () => [])
  const missing = takeover.path !== 'new' && await readFile(join(dir, 'scan.json'), 'utf8').then(text => testsMissing(JSON.parse(text) as ScanResult), () => false)
  return { files, testsMissing: missing }
}

/** Write one draft file of the takeover. */
async function writeDraft(root: string, id: string, name: string, text: string): Promise<void> {
  const dir = takeoverDir(root, id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, name), text)
}

/** The answers to M3 of acceptProposal, and the agreement it was handed (§7.4's `resultMessage`, the rows of the two things). */
const RESULT = {
  noted: (id: string, thing: Thing, rulesWhole: boolean): string => {
    const { label, norm } = THING_LABELS[thing]
    const head = `Takeover ${id}: write the human's answer into the label ${label} of ${norm} now (graph_edit body, their words as relay).`
    if (thing === 'cost') return head
    return rulesWhole ? `${head} Paths inside the repository then get one rule: the next reminder gives the draft.` : `${head} No rule can block paths in this composition: they only go into the norm.`
  },
  missing: 'No open takeover matches this question; nothing was written. /hourness-init status shows the takeover.',
  forbidden: 'This decision does not carry the human\'s words; nothing was written. Ask the human and record their words with record_human_answer.',
  busy: 'The takeover is being written by another call; it finishes from the graph before your next step.',
  io: (why: string): string => `The takeover journal could not be written (${why}); nothing was written. Tell the human; /hourness-init status shows it.`,
} as const

export interface BootstrapRuntime {
  readonly service: BootstrapService
  /** The step builder of one agent's reminder (src/shared/step-notice.ts). */
  step(agent: AgentLike, history: readonly DerivedMessage[], admitted: readonly unknown[], session: SessionLike): Promise<UserNotice | undefined>
  /** Forget a project's takeover (it was closed by /hourness-init off). */
  forget(root: string): void
}

export function bootstrapRuntime(deps: BootstrapDeps): BootstrapRuntime {
  const live = new Map<string, Live>()
  const failures = new Map<string, number>()

  /** The facts of a reminder for the takeover as the graph is now. */
  const factsOf = async (root: string, takeover: OpenTakeover, graph: LoadedGraph, scan: ScanFacts): Promise<ReminderFacts> => {
    const anchor = anchorOf(graph, takeover.openedAt)
    const gaps = takeover.path === 'gaps' ? gapsOf(graph, scan.files) : undefined
    const red = takeover.path === 'new' ? undefined : redCheckers(readTrialFile(root, takeover.id))
    return {
      ...red === undefined || (red.failed.length === 0 && red.limited.length === 0) ? {} : { red },
      takeover: { id: takeover.id, path: takeover.path },
      history: await historyLines(root, takeover.id),
      ...anchor === undefined ? {} : { anchor },
      proposed: proposedSince(graph, takeover.openedAt),
      missing: gaps?.missing.map(gap => gap.id) ?? [],
      unchecked: gaps?.unchecked ?? [],
      things: thingStates(graph, takeover),
      touchInside: touchInside(graph),
      rulesWhole: deps.rulesWhole(),
      testsMissing: scan.testsMissing,
    }
  }

  /** Propose the norm templates missing under the anchor as the harness; whether any was written. */
  const writeNorms = async (root: string, takeover: OpenTakeover, graph: LoadedGraph, anchor: string, agent: AgentLike): Promise<boolean> => {
    const records: TakeoverRecord[] = []
    let wrote = false
    for (const template of NORM_TEMPLATES) {
      if (graph.nodes.has(template.id)) continue
      const key = `${root}\n${template.id}`
      if ((failures.get(key) ?? 0) >= NORM_ATTEMPTS) continue
      const result = await openEngine(takeover.graphDir).apply('harness', { op: 'propose', reason: `接管 ${takeover.id}：规范模板 ${template.id}`, node: { type: 'norm', id: template.id, title: template.title, parent: anchor, body: template.body } })
      if (result.ok) {
        wrote = true
        records.push({ op: 'setup', data: { item: `norm:${template.id}`, action: 'created' } })
        continue
      }
      if (result.error.code === 'conflict') continue
      const count = (failures.get(key) ?? 0) + 1
      failures.set(key, count)
      records.push({ op: 'setup', data: { item: `norm:${template.id}`, action: 'failed', detail: `${result.error.code}: ${result.error.message}`.slice(0, 300) } })
      if (count >= NORM_ATTEMPTS) deps.report(agent, 'degraded', `规范模板 ${template.id} 连续 ${count} 次没写上（${result.error.code}），不再试`)
    }
    await appendTakeover(root, takeover.id, records).catch((error: unknown) => { deps.report(agent, 'degraded', `接管流水的记录写不进：${message(error)}`) })
    return wrote
  }

  /**
   * Once 不许碰 holds repository paths: the rule draft (§5.4 step 1,
   * checked with the rules board's own check) and the floor draft with the
   * class of those paths (§5.7), written again only when the paths change.
   */
  const writeTouchDrafts = async (root: string, known: Live, paths: readonly string[], agent: AgentLike): Promise<void> => {
    const key = paths.join('\n')
    if (paths.length === 0 || known.touchWritten === key) return
    known.touchWritten = key
    const { id } = known.takeover
    try {
      const { draft, left } = ruleDraft(id, paths)
      if (draft !== undefined) {
        const issues = validateRule({ ...draft.body, reason: draft.reason }, { now: new Date(), signals: new Map(), existing: [] })
        if (issues.length > 0) deps.report(agent, 'degraded', `规则草稿过不了规则板的检查：${issues.map(issue => `${issue.path} ${issue.message}`).join('；').slice(0, 300)}`)
        else await writeDraft(root, id, 'rule-draft.json', `${JSON.stringify({ ...draft, ...left.length === 0 ? {} : { left } }, null, 2)}\n`)
      }
      const scan = JSON.parse(await readFile(join(takeoverDir(root, id), 'scan.json'), 'utf8')) as ScanResult
      await writeDraft(root, id, 'floor.md', floorMarkdown(floorDraft(scan, known.scan?.files ?? [], { touch: paths })))
    }
    catch (error) {
      deps.report(agent, 'degraded', `不许碰的草稿写不进：${message(error)}`)
    }
  }

  /** Start a trial round in the background when one is due (§6.3); a scan that cannot be read starts none. */
  const startRound = async (root: string, takeover: OpenTakeover, graph: LoadedGraph, known: Live, agent: AgentLike): Promise<void> => {
    const trial = deps.trial
    if (trial === undefined) return
    try {
      const scan = JSON.parse(await readFile(join(takeoverDir(root, takeover.id), 'scan.json'), 'utf8')) as ScanResult
      // The round runs in the background; it never rejects (runTrial settles every failure as an outcome).
      void maybeStartRound({ root, takeover, graph, scan, files: known.scan?.files ?? [] }, { ...trial, notify: (notice) => { trial.notify(agent, notice) } })
    }
    catch (error) {
      deps.report(agent, 'degraded', `试跑没能开始：${message(error)}`)
    }
  }

  /** The takeover and the thing an attach names, after `bootstrap:`; undefined when it is not a takeover attach. */
  const parseAttach = (proposal: string): { readonly id: string, readonly thing: Thing } | undefined => {
    const attach = `${TAKEOVER_ATTACH_PREFIX}${proposal}`
    if (!ATTACH_PATTERN.test(attach)) return undefined
    const [id = '', thing] = proposal.split(':')
    return { id, thing: thing as Thing }
  }

  const service: BootstrapService = {
    async prepare(invocation, request) {
      const session = invocation.agent.session
      const cwd = session.header.cwd
      if (typeof cwd !== 'string') return { ok: false, text: '这个会话没有工作目录' }
      const graphDir = deps.graphDir(cwd)
      if (graphDir === undefined) return { ok: false, text: '项目图行 glm-hourness/graph 没有启用' }
      const settled = await settleWorkspace(cwd, graphDir, deps.home())
      if (!settled.ok) return settled
      const { root, scan, decision } = settled
      const path: TakeoverPath = decision.path === 'gaps' ? 'gaps' : request.path ?? decision.path
      const because = decision.note === undefined ? decision.reason : `${decision.reason}；${decision.note}`
      const by = { session: session.id, commandId: invocation.commandId }
      const head = scan.scan.git.state === 'repo' ? scan.scan.git.head : undefined
      const opened = await openTakeover(root, { path, because, trigger: request.trigger, projectRoot: root, graphDir, ...head === undefined ? {} : { head }, ...request.wish === undefined ? {} : { wish: request.wish }, by })
      if (opened.kind === 'io') return { ok: false, text: `接管流水写不进（${opened.message}）：接管没有开` }
      const { takeover } = opened
      // The wish stays with the takeover on the paths that do not interview (an existing project, the gaps); on the new-project path it is M3's interview step 1.
      const holdWish = takeover.path !== 'new'
      const warnings = [...settled.warnings]
      if (opened.kind === 'resumed' && holdWish && request.wish !== undefined) {
        await appendTakeover(root, takeover.id, [{ op: 'takeover-wish', data: { text: request.wish, commandId: invocation.commandId } }], by).catch((error: unknown) => { warnings.push(`新许的愿没记进接管流水：${message(error)}`) })
      }
      const graph = await loadGraph(graphDir)
      const scanFacts: ScanFacts = { files: scan.files, testsMissing: takeover.path !== 'new' && testsMissing(scan.scan) }
      try {
        const dir = takeoverDir(root, takeover.id)
        await writeScan(dir, scan)
        await writeDraft(root, takeover.id, 'defaults.md', defaultsMarkdown(scan.scan, scan.files, takeover.path === 'new'))
        await writeDraft(root, takeover.id, 'questions.md', questionsMarkdown(questionsDraft(scan.scan, scan.files, deps.rulesWhole(), thingsAsked(graph, takeover)), takeover.id))
        await writeDraft(root, takeover.id, 'floor.md', floorMarkdown(floorDraft(scan.scan, scan.files)))
        await appendTakeover(root, takeover.id, [...settled.setup, { op: 'scan', data: { files: scan.files.length, truncated: [...scan.scan.truncated], ms: scan.scan.ms } }], by)
      }
      catch (error) {
        warnings.push(`扫描结果、草稿或接管流水写不进：${message(error)}`)
      }
      deps.report(invocation.agent, warnings.length > 0 ? 'degraded' : 'active', warnings.length > 0 ? warnings.join('；') : `接管 ${takeover.id} 开着（${PATH_LABELS[takeover.path]}）`)
      deps.install(invocation.agent)
      const facts = await factsOf(root, takeover, graph, scanFacts)
      const gaps = takeover.path === 'gaps' ? gapsOf(graph, scan.files) : undefined
      const lines = [
        `${opened.kind === 'resumed' ? '接着做开着的接管' : '开了接管'} ${takeover.id}（${PATH_LABELS[takeover.path]}）：${opened.kind === 'resumed' ? '' : `${because}。`}`,
        ...settled.done.length === 0 ? [] : [`做了：${settled.done.join('，')}。`],
        ...gaps === undefined
          ? []
          : [
              `缺：${gaps.missing.map(gap => gap.id).join('、') || '没有'}。`,
              ...gaps.unchecked.length === 0 ? [] : [`改这些文件时没有检查：${gaps.unchecked.map(extension => `*${extension}`).join('、')}（主 Agent 补检查行）。`],
              ...gaps.rejected.map(node => `你拒过 ${node.title}（${node.id}）：要的话在面板里恢复它。`),
              ...gaps.wrongType.map(node => `${node.id} 是一个 ${node.type}，不是接管要的类型：没有动它。`),
            ],
        ...warnings,
        ...holdWish && request.wish !== undefined ? ['你许的愿记在接管流水里，清单同意之后交给主 Agent。'] : [],
        ...takeover.path === 'new' ? request.wish === undefined ? ['说一句你想做成什么，主 Agent 从这里开始问你。'] : [] : ['主 Agent 开始读这个项目，读完先问你两件事。'],
      ]
      live.set(root, { takeover, goals: new Set(), anchorSteps: 0, asked: false, scan: scanFacts })
      return { ok: true, text: lines.join('\n'), holdWish, ...takeover.path === 'new' ? {} : { notice: startNotice(facts) } }
    },
    async wants(cwd) {
      const graphDir = deps.graphDir(cwd)
      if (graphDir === undefined) return false
      if (!hasProjectGraph(graphDir)) return true
      const root = projectOf(cwd, deps.home())?.root
      if (root === undefined) return false
      try {
        return await openTakeoverOf(root) !== undefined
      }
      catch (error) {
        // An ordinary /wish goes on; the takeover's step reminder reports the journal it cannot read.
        console.warn(`dsh-glm-hourness/bootstrap: the takeover journal of ${root} cannot be read, /wish goes on without the takeover: ${message(error)}`)
        return false
      }
    },
    holds(cwd, goalId) {
      const root = projectOf(cwd, deps.home())?.root
      const known = root === undefined ? undefined : live.get(root)
      if (known === undefined) return false
      known.asked = true
      return known.takeover.path !== 'new' && known.goals.has(goalId)
    },
    async attachable({ cwd, proposal }) {
      const named = parseAttach(proposal)
      if (named === undefined) return { ok: false, message: 'not a takeover attach' }
      try {
        const root = cwd === undefined ? undefined : projectOf(cwd, deps.home())?.root
        const takeover = root === undefined ? undefined : await openTakeoverOf(root)
        if (takeover?.id !== named.id) return { ok: false, message: `no open takeover ${named.id} in this project` }
        const norm = THING_LABELS[named.thing].norm
        if (!(await loadGraph(takeover.graphDir)).nodes.has(norm)) return { ok: false, message: `${norm} is not on the graph yet: the harness puts it there at your next step, put the question after that` }
        return { ok: true }
      }
      catch (error) {
        return { ok: false, message: `the takeover could not be read: ${message(error)}` }
      }
    },
    proposalLine: id => takeoverAttachLine(`${TAKEOVER_ATTACH_PREFIX}${id}`),
    async acceptProposal({ questionId, graphDir, cwd, by }) {
      try {
        const node = (await loadGraph(graphDir)).nodes.get(questionId)
        const attach = takeoverAttachOf(node?.body)
        const named = attach === undefined ? undefined : parseAttach(attach.slice(TAKEOVER_ATTACH_PREFIX.length))
        // A proposal question (M3 appendix 0.6 §3.3), decided, that carries a takeover attach.
        const proposal = node !== undefined && node.type === 'question' && node.form === 'recommend' && node.ask !== undefined && node.proposal !== undefined && node.reason !== undefined && node.options === undefined
        if (!proposal || node.status !== 'done' || node.conclusion === undefined || named === undefined) return RESULT.missing
        // The decision is record_human_answer's: the llm with the human's words (F36: no human-actor branch has a writer).
        const decided = [...node.history].reverse().find(entry => entry.op === 'decide')
        if (decided?.actor !== 'llm' || (decided.relay ?? '').trim() === '' || by.relay.trim() === '') return RESULT.forbidden
        const root = projectOf(cwd ?? graphDir, deps.home())?.root
        const takeover = root === undefined ? undefined : await openTakeoverOf(root)
        if (root === undefined || takeover?.id !== named.id || !sameDir(takeover.graphDir, graphDir)) return RESULT.missing
        const written = await recordAsked(root, takeover.id, named.thing, questionId)
        if (written.kind === 'closed') return RESULT.missing
        if (written.kind === 'busy') return RESULT.busy
        if (written.kind === 'io') return RESULT.io(written.message)
        return RESULT.noted(takeover.id, named.thing, deps.rulesWhole())
      }
      catch (error) {
        return RESULT.io(message(error))
      }
    },
  }

  return {
    service,
    forget: (root) => { live.delete(root) },
    async step(agent, history, admitted, session) {
      const cwd = session.header.cwd
      const root = typeof cwd === 'string' ? projectOf(cwd, deps.home())?.root : undefined
      if (root === undefined) return undefined
      let takeover: OpenTakeover | undefined
      try {
        takeover = await openTakeoverOf(root)
      }
      catch (error) {
        deps.report(agent, 'degraded', `接管流水读不出：${message(error)}`)
        return undefined
      }
      if (takeover === undefined) {
        live.delete(root)
        return undefined
      }
      let graph = await loadGraph(takeover.graphDir)
      const anchor = anchorOf(graph, takeover.openedAt)
      if (anchor !== undefined && await writeNorms(root, takeover, graph, anchor, agent)) graph = await loadGraph(takeover.graphDir)
      const goals = new Set([...graph.nodes.values()].filter(node => node.type === 'goal' && proposedSinceOpen(graph, node.id, takeover.openedAt)).map(node => node.id))
      const previous = live.get(root)
      const known: Live = previous?.takeover.id === takeover.id ? Object.assign(previous, { takeover, goals }) : { takeover, goals, anchorSteps: 0, asked: false }
      known.scan ??= await scanFactsOf(root, takeover)
      live.set(root, known)
      if (anchor !== undefined && takeover.path !== 'new') known.anchorSteps += 1
      if (known.anchorSteps >= STAGE_NOTE_STEPS && !known.asked && !takeover.noted.includes(STAGE_NOTE.code)) {
        await appendTakeover(root, takeover.id, [{ op: 'note', data: { ...STAGE_NOTE } }]).catch((error: unknown) => { deps.report(agent, 'degraded', `接管流水的记录写不进：${message(error)}`) })
      }
      const facts = await factsOf(root, takeover, graph, known.scan)
      await writeTouchDrafts(root, known, facts.touchInside, agent)
      await startRound(root, takeover, graph, known, agent)
      return stepReminder(history, admitted, facts)
    },
  }
}
