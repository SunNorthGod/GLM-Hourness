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
import type { ToolDefinitionLike } from '../shared/dsh-min.ts'
import { createHash } from 'node:crypto'
import { join, relative, resolve } from 'node:path'
import { projectOf } from '../data/project-root.ts'
import type { Attachable, AttachService } from '../design/attach.ts'
import { openEngine } from '../graph/engine.ts'
import { GATE_LINE_FORMS, parseGateNorm } from '../execute/gate-norm.ts'
import { parseCheckOutput } from '../env/parsers.ts'
import type { CheckFormat } from '../env/check-entry.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import { loadGraph } from '../graph/store.ts'
import { validateRule } from '../rules/model.ts'
import type { AgentLike, DerivedMessage, SessionLike, UserNotice } from '../shared/dsh-min.ts'
import type { HealthState } from '../shared/health.ts'
import { defaultsMarkdown, testsMissing } from './defaults.ts'
import { floorDraft, floorMarkdown } from './floor.ts'
import { anchorOf, gapsOf, proposedSince, proposedSinceOpen } from './gaps.ts'
import { BOOTSTRAP_SOURCE, startNotice, stepReminder, THING_LABELS, type ReminderFacts } from './notice.ts'
import { createUserNotice } from '../shared/dsh-min.ts'
import { wrapSystemReminder } from '../shared/zcode-notice.ts'
import { listFull, questionsDraft, questionsMarkdown, type Thing } from './present.ts'
import { writeScan, type ScanResult } from './scan.ts'
import { hasProjectGraph } from './path.ts'
import { listConclusion } from './review.ts'
import { applyAgreement, appliedMessage, baselineComment, baselineOf, bootstrapReviewTool, formatOf, questionStatus, trackedGraphFiles, type ApplyDeps, type ReviewDeps, type RulesLookup, type TrialFacts } from './review.ts'
import { ATTACH_PATTERN, TAKEOVER_ATTACH_PREFIX, takeoverAttachLine, takeoverAttachOf, type WishSeam } from './service.ts'
import { settleWorkspace } from './setup.ts'
import { appendClosed, appendTakeover, closedTakeoverOf, openTakeover, openTakeoverOf, recordAsked, takeoverDir, type OpenTakeover, type TakeoverPath, type TakeoverRecord } from './takeover.ts'
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
  /** Whether the agent is its project's main agent (§7.2 item 1). */
  readonly isMain: (agent: AgentLike) => boolean
  /** Whether the rules board can take a rule through the human's agreement (its service has `attachable` and `acceptProposal`). */
  readonly rulesWhole: () => boolean
  /** How the rules board answers about one of its proposals right now (§7.7). */
  readonly rules: RulesLookup
  /** `git merge-base --is-ancestor <sha> HEAD` in a project (§7.2 item 6, §7.4 step 3). */
  readonly ancestor: (root: string, sha: string) => Promise<boolean>
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
  /** A bootstrap_review round or the agreement's write is running (§9.4: one at a time). */
  busy: boolean
  /** The checkers whose baseline the row already wrote on their tool node (§5.6 item 3). */
  baselined: Set<string>
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

/** The answers to M3 of acceptProposal, and the agreement it was handed (§7.4's `resultMessage`, the rows of the two things and of the list). */
const RESULT = {
  noted: (id: string, thing: Thing, rulesWhole: boolean): string => {
    const { label, norm } = THING_LABELS[thing]
    const head = `Takeover ${id}: write the human's answer into the label ${label} of ${norm} now (graph_edit body, their words as relay).`
    if (thing === 'cost') return head
    return rulesWhole ? `${head} Paths inside the repository then get one rule: the next reminder gives the draft.` : `${head} No rule can block paths in this composition: they only go into the norm.`
  },
  missing: 'No open takeover matches this question; nothing was written. /hourness-init status shows the takeover.',
  forbidden: 'This decision does not carry the human\'s words; nothing was written. Ask the human and record their words with record_human_answer.',
  unseen: 'The agreement carries no mark that the human saw the exact commands; nothing was written. Show the text from propose_to_human again, verbatim, and ask again; then call record_human_answer.',
  busy: 'The takeover is being written by another call; it finishes from the graph before your next step.',
  io: (why: string): string => `The takeover journal could not be written (${why}); nothing was written. Tell the human; /hourness-init status shows it.`,
  stale: (round: number, current: number): string => `Round ${round} is not the current list (${current}); nothing was written. Call bootstrap_review and put the new round to the human as a new question.`,
  changed: (why: string): string => `The question differs from the round the harness wrote (${why}); nothing was written. Put a new round to the human exactly as bootstrap_review returns it, and record with recordedAs exactly as given.`,
  already: (id: string, round: number): string => `Takeover ${id} was already written for round ${round}; nothing more to do.`,
} as const

export interface BootstrapRuntime {
  readonly service: BootstrapService
  /** The bootstrap_review tool, registered globally; the wire-face source keeps it out of the faces it does not belong in (§7.2, face-migration design 0.1 §6 D). */
  readonly tool: ToolDefinitionLike
  /** Whether the session's wire face keeps bootstrap_review, as the last step of this session judged it (the main agent of a project with an open takeover); undefined when no step judged it yet. The wire layer reads this synchronously, per request, so the step flow records it here. */
  faceKeeps(sessionId: string): boolean | undefined
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
    // The baselines the harness wrote on the tool nodes of the red checkers (§5.6 item 3), and the change lines the gate already carries.
    const gate = parseGateNorm(graph.nodes.get('norm-merge-gate'))
    const changed = gate.commands.filter(command => command.changed !== undefined).length
    const baselined = (red?.failed ?? []).map((command) => {
      const format = formatOf(graph, command)
      const baseline = baselineOf(graph, command)
      return format !== undefined && baseline !== undefined ? { command, format, count: baseline.count } : undefined
    }).filter((line): line is { readonly command: string, readonly format: CheckFormat, readonly count: number } => line !== undefined)
    return {
      ...red === undefined || (red.failed.length === 0 && red.limited.length === 0) ? {} : { red },
      ...(baselined.length > 0 ? { ratchet: { forms: GATE_LINE_FORMS, lines: baselined } } : {}),
      ...(changed > 0 ? { changed } : {}),
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
      stage: takeover.stage,
      ...(takeover.round > 0 ? { round: takeover.round } : {}),
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

  /**
   * The baseline annotation of a checker the whole-project trial run found
   * red and whose output a format reads (§5.6 item 3): one harness comment
   * per command, `基线：<n> 条（<sha 前 7 位>，<日期>）`, on the tool node.
   * Written once; the graph check and the per-process set keep a restart
   * quiet.
   */
  const writeBaselines = async (root: string, takeover: OpenTakeover, graph: LoadedGraph, agent: AgentLike): Promise<void> => {
    const file = readTrialFile(root, takeover.id)
    if (file === undefined) return
    const known = live.get(root)
    const records: TakeoverRecord[] = []
    for (const result of file.results) {
      if (result.kind !== 'baseline' || (result.outcome !== 'failed' && result.outcome !== 'denied')) continue
      if (known?.baselined.has(result.text) === true) continue
      const node = graph.nodes.get(result.node)
      if (node === undefined) continue
      const format = formatOf(graph, result.text)
      if (format === undefined) continue
      known?.baselined.add(result.text)
      if (baselineOf(graph, result.text) !== undefined) continue
      const log = result.log === undefined ? '' : await readFile(join(root, ...result.log.split('/')), 'utf8').catch(() => '')
      const count = parseCheckOutput(format, { stdout: log, stderr: '', exitCode: result.exit ?? 1 }).length
      const text = baselineComment(count, file.head, file.startedAt.slice(0, 10))
      if ((node.history ?? []).some(entry => entry.op === 'comment' && entry.actor === 'harness' && entry.text === text)) continue
      const written = await openEngine(takeover.graphDir).apply('harness', { op: 'comment', id: node.id, text })
      if (written.ok) records.push({ op: 'setup', data: { item: `baseline:${node.id}`, action: 'created', detail: text.slice(0, 120) } })
      else deps.report(agent, 'degraded', `基线批注写不进 ${node.id}（${written.error.code}）`)
    }
    if (records.length > 0) await appendTakeover(root, takeover.id, records).catch(() => undefined)
  }

  /** Start a trial round in the background when one is due (§6.3); a scan that cannot be read starts none. */
  const startRound = async (root: string, takeover: OpenTakeover, graph: LoadedGraph, known: Live, agent: AgentLike | undefined): Promise<void> => {
    const trial = deps.trial
    if (trial === undefined) return
    try {
      const scan = JSON.parse(await readFile(join(takeoverDir(root, takeover.id), 'scan.json'), 'utf8')) as ScanResult
      // The round runs in the background; it never rejects (runTrial settles every failure as an outcome).
      void maybeStartRound({ root, takeover, graph, scan, files: known.scan?.files ?? [] }, { ...trial, notify: (notice) => { if (agent !== undefined) trial.notify(agent, notice) } })
    }
    catch (error) {
      if (agent !== undefined) deps.report(agent, 'degraded', `试跑没能开始：${message(error)}`)
    }
  }

  /** What an attach names after `bootstrap:`: one of the two things, or a list round. */
  type AttachName = { readonly id: string, readonly kind: 'thing', readonly thing: Thing } | { readonly id: string, readonly kind: 'list', readonly round: number }

  /** The takeover and the thing an attach names, after `bootstrap:`; undefined when it is not a takeover attach. */
  const parseAttach = (proposal: string): AttachName | undefined => {
    const attach = `${TAKEOVER_ATTACH_PREFIX}${proposal}`
    if (!ATTACH_PATTERN.test(attach)) return undefined
    const [id = '', thing] = proposal.split(':')
    const round = /^list-([1-9][0-9]{0,3})$/.exec(thing ?? '')?.[1]
    if (round !== undefined) return { id, kind: 'list', round: Number(round) }
    return { id, kind: 'thing', thing: thing as Thing }
  }

  /** The trial facts of a takeover, as the round's texts read them (§6.3). */
  const trialFactsOf = (root: string, takeover: OpenTakeover): TrialFacts | undefined => {
    const file = readTrialFile(root, takeover.id)
    if (file === undefined) return undefined
    return {
      done: file.done,
      results: file.results.map(result => ({
        text: result.text,
        kind: result.kind,
        outcome: result.outcome,
        ...(result.ms === undefined ? {} : { ms: result.ms }),
        ...(result.afterSetupFailure === undefined ? {} : { afterSetupFailure: result.afterSetupFailure }),
        ...(result.outcome === 'not-run' && result.reason !== undefined ? { refused: result.reason } : {}),
      })),
    }
  }

  /** The root project of a takeover: its own record first, else found from the graph directory (§7.4). */
  const rootOf = (takeover: OpenTakeover): string | undefined => takeover.projectRoot ?? projectOf(takeover.graphDir, deps.home())?.root

  /** The open takeover of the caller's project, or undefined (§7.2). */
  const openOf = async (agent: AgentLike | undefined): Promise<OpenTakeover | undefined> => {
    const cwd = agent?.session?.header.cwd
    if (typeof cwd !== 'string') return undefined
    const root = projectOf(cwd, deps.home())?.root
    return root === undefined ? undefined : openTakeoverOf(root)
  }

  /** The runtime side of bootstrap_review (§7.2). */
  const reviewDeps: ReviewDeps = {
    isMain: agent => agent !== undefined && deps.isMain(agent),
    open: openOf,
    graph: takeover => loadGraph(takeover.graphDir),
    ancestor: (takeover, sha) => deps.ancestor(rootOf(takeover) ?? takeover.graphDir, sha),
    testsMissing: async (takeover) => {
      try {
        const scan = JSON.parse(await readFile(join(takeoverDir(rootOf(takeover) ?? '', takeover.id), 'scan.json'), 'utf8')) as ScanResult
        return testsMissing(scan)
      }
      catch {
        return false
      }
    },
    pathBasis: () => Promise.resolve('判路依据见 scan.json'),
    trial: takeover => trialFactsOf(rootOf(takeover) ?? '', takeover),
    rulesWhole: () => deps.rulesWhole(),
    rules: (cwd, proposal) => deps.rules(cwd, proposal),
    startTrial: (takeover, agent) => {
      const root = rootOf(takeover)
      if (root === undefined) return
      void (async () => {
        try {
          const graph = await loadGraph(takeover.graphDir)
          const known = live.get(root)
          await startRound(root, takeover, graph, known ?? { takeover, goals: new Set(), anchorSteps: 0, asked: false, busy: false, baselined: new Set() }, agent)
        }
        catch {
          // The trial is a background convenience; review-<n>.md says what it found.
        }
      })()
    },
    openRound: async (takeover, round, view, detail, digest, snapshot, callId) => {
      const root = rootOf(takeover)
      if (root === undefined) throw new Error('the project root of the takeover is gone')
      const file = readTrialFile(root, takeover.id)
      const trial = file === undefined ? undefined : { done: file.done, total: file.results.length }
      await writeDraft(root, takeover.id, `review-${round}.md`, listFull({ ...view, summary: view.summary ?? '' }))
      const detailDigest = createHash('sha256').update(`${detail.markdown}\n${detail.mustShow.join('\n')}`).digest('hex').slice(0, 12)
      const written = await appendTakeover(root, takeover.id, [{
        op: 'review-open',
        data: {
          callId, round, attach: `bootstrap:${takeover.id}:list-${round}`, askDigest: digest,
          detail: detail.markdown, detailShow: [...detail.mustShow], detailDigest,
          snapshot: snapshot.map(entry => ({ id: entry.id, rev: entry.rev })),
          ...(trial === undefined ? {} : { trial }),
        },
      }])
      if (!written) throw new Error('the journal refused the round record')
    },
    round: takeover => takeover.round,
    busy: (agent) => {
      const cwd = agent?.session?.header.cwd
      const root = typeof cwd === 'string' ? projectOf(cwd, deps.home())?.root : undefined
      return root !== undefined && (live.get(root)?.busy ?? false)
    },
    setBusy: (agent, value) => {
      const cwd = agent?.session?.header.cwd
      const root = typeof cwd === 'string' ? projectOf(cwd, deps.home())?.root : undefined
      const known = root === undefined ? undefined : live.get(root)
      if (known !== undefined) known.busy = value
    },
    cwd: agent => typeof agent?.session?.header.cwd === 'string' ? agent.session.header.cwd : undefined,
  }

  /** The apply of one agreement (§7.4) through the journal's shapes. */
  const applyDeps = (root: string): ApplyDeps => ({
    ancestor: sha => deps.ancestor(root, sha),
    journal: async (t, records) => appendTakeover(root, t.id, records.map(record => ({ op: record.op as TakeoverRecord['op'], data: record.data as TakeoverRecord['data'] }))),
  })

  /** The question on the graph this round's list attach names, once propose_to_human made it (§7.1). */
  const listQuestionOf = async (takeover: OpenTakeover, stored: NonNullable<OpenTakeover['list']>): Promise<string | undefined> => {
    const graph = await loadGraph(takeover.graphDir)
    return [...graph.nodes.values()].find(node => node.type === 'question' && takeoverAttachOf(node.body) === stored.attach)?.id
  }

  /**
   * The write, or its resume (§9.2): M3 handed the decision back (or the
   * journal holds an apply-start from a host that died). Verifies against the
   * stored round, runs the six steps, and answers with the message M3 hands
   * the main agent; a refusal leaves the takeover in review and says why.
   */
  const writeAgreement = async (root: string, takeover: OpenTakeover, questionId: string): Promise<string> => {
    const stored = takeover.list
    if (stored === undefined) return RESULT.missing
    const known = live.get(root)
    if (known?.busy === true) return RESULT.busy
    if (known !== undefined) known.busy = true
    try {
      if (takeover.stage !== 'apply') {
        const started = await appendTakeover(root, takeover.id, [{ op: 'apply-start', data: { questionId, round: takeover.round, relayDigest: createHash('sha256').update('see the graph for the words').digest('hex').slice(0, 12) } }])
        if (!started) return RESULT.missing
      }
      const fresh = (await openTakeoverOf(root)) ?? takeover
      const outcome = await applyAgreement(applyDeps(root), fresh, stored, questionId, async (records) => appendTakeover(root, fresh.id, records.map(record => ({ op: record.op as TakeoverRecord['op'], data: record.data as TakeoverRecord['data'] }))))
      if (!outcome.ok) {
        await appendTakeover(root, fresh.id, [{ op: 'accept-refused', data: { questionId, code: outcome.code, why: outcome.why } }]).catch(() => false)
        return outcome.code === 'stale' ? RESULT.stale(takeover.round, takeover.round) : outcome.code === 'changed' ? RESULT.changed(outcome.why) : outcome.code === 'unseen' ? RESULT.unseen : outcome.code === 'busy' ? RESULT.busy : RESULT.io(outcome.why)
      }
      const graph = await loadGraph(fresh.graphDir)
      const statuses = await questionStatus(graph, fresh, deps.rules, undefined)
      return appliedMessage({ id: fresh.id, round: fresh.round }, outcome.totals, statuses, fresh.graphDir, outcome.wish)
    }
    finally {
      const known = live.get(root)
      if (known !== undefined) known.busy = false
    }
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
        await writeDraft(root, takeover.id, 'defaults.md', defaultsMarkdown(scan.scan, scan.files, takeover.path === 'new', process.platform, relative(root, graphDir)))
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
      live.set(root, { takeover, goals: new Set(), anchorSteps: 0, asked: false, busy: false, baselined: new Set(), scan: scanFacts })
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
        if (named.kind === 'list') {
          const stored = takeover.list
          if (stored === undefined || takeover.stage !== 'review' || named.round !== takeover.round) {
            return { ok: false, message: `round ${named.round} is not the current list (${takeover.round}); call bootstrap_review` }
          }
          return { ok: true, detail: { markdown: stored.detail, mustShow: stored.detailShow } }
        }
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
        const proposal = node !== undefined && node.type === 'question' && node.form === 'recommend' && node.ask !== undefined && node.proposal !== undefined && node.reason !== undefined && node.ways === undefined
        if (!proposal || node.status !== 'done' || node.conclusion === undefined || named === undefined) return RESULT.missing
        // The decision is record_human_answer's: the llm with the human's words (F36: no human-actor branch has a writer).
        const decided = [...node.history].reverse().find(entry => entry.op === 'decide')
        if (decided?.actor !== 'llm' || (decided.relay ?? '').trim() === '' || by.relay.trim() === '') return RESULT.forbidden
        const root = projectOf(cwd ?? graphDir, deps.home())?.root
        if (root === undefined) return RESULT.missing
        if (named.kind === 'list') {
          const takeover = await openTakeoverOf(root)
          if (takeover === undefined) {
            const closed = await closedTakeoverOf(root)
            return closed?.id === named.id ? RESULT.already(named.id, named.round) : RESULT.missing
          }
          if (takeover.id !== named.id || !sameDir(takeover.graphDir, graphDir)) return RESULT.missing
          if (takeover.stage === 'apply') return RESULT.busy
          if (takeover.stage !== 'review' || takeover.list === undefined || named.round !== takeover.round) return RESULT.stale(named.round, takeover.round)
          const conclusion = (node.conclusion ?? '').trim()
          if (conclusion !== listConclusion(named.round)) return RESULT.changed('the conclusion is not the one the harness fixed')
          return await writeAgreement(root, takeover, questionId)
        }
        const takeover = await openTakeoverOf(root)
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

  /** The one-line reminder that the graph is not under git yet (§7.6, at most two turns). */
  const graphCheck = async (root: string, agent: AgentLike): Promise<UserNotice | undefined> => {
    const closed = await closedTakeoverOf(root).catch(() => undefined)
    if (closed === undefined || closed.graphTracked) return undefined
    const tracked = await trackedGraphFiles(root, closed.graphDir)
    if (tracked === undefined) return undefined
    if (tracked.length > 0) {
      await appendClosed(root, closed.id, [{ op: 'graph-tracked', data: {} }]).catch(() => false)
      return undefined
    }
    const rel = closed.graphDir.toLowerCase().startsWith(root.toLowerCase()) ? closed.graphDir.slice(root.length).replaceAll('\\', '/').replace(/^\//, '') : closed.graphDir
    if (closed.graphReminders >= 2) {
      deps.report(agent, 'degraded', `项目图还没进 git：${rel}`)
      return undefined
    }
    await appendClosed(root, closed.id, [{ op: 'graph-reminder', data: { turn: closed.graphReminders + 1 } }]).catch(() => false)
    // §7.6, the empty-graph-commit finding: the reminder names the closing's unverified claim and gives the two calls the trunk guard lets through, plus the way through when the commit is refused.
    const text = `The project graph (${rel}) is still not tracked by git${closed.graphReminders === 0 ? ' — if the takeover closing said it was committed, that claim did not hold' : ''}. Call 1 (one call): git add -- ${rel}. Call 2 (another call): git commit -m "Add the project graph (hourness bootstrap ${closed.id})" -- ${rel}. If call 2 is refused by the trunk gate, the staging from call 1 stands: build the commit off the trunk (a worktree, or git write-tree and git commit-tree), run check_commit <commit>, then git merge --ff-only <commit>. Verify with git ls-files -- ${rel}/nodes before telling the human the graph is in git.`
    return createUserNotice(BOOTSTRAP_SOURCE, `takeover ${closed.id} asks for the graph commit`, wrapSystemReminder(text), { bootstrap: { takeover: closed.id } })
  }

  // Whether the session's wire face keeps bootstrap_review, as this session's last reminder step judged it (§7.2). The step flow records it, the wire-face source reads it synchronously (face-migration design 0.1 §6 D).
  const faceBySession = new Map<string, boolean>()

  return {
    service,
    tool: bootstrapReviewTool(reviewDeps),
    faceKeeps: sessionId => faceBySession.get(sessionId),
    forget: (root) => { live.delete(root) },
    async step(agent, history, admitted, session) {
      const cwd = session.header.cwd
      const root = typeof cwd === 'string' ? projectOf(cwd, deps.home())?.root : undefined
      if (root === undefined) {
        faceBySession.set(session.id, false)
        return undefined
      }
      let takeover: OpenTakeover | undefined
      try {
        takeover = await openTakeoverOf(root)
      }
      catch (error) {
        deps.report(agent, 'degraded', `接管流水读不出：${message(error)}`)
        faceBySession.set(session.id, false)
        return undefined
      }
      if (takeover === undefined) {
        live.delete(root)
        faceBySession.set(session.id, false)
        return await graphCheck(root, agent).catch(() => undefined)
      }
      faceBySession.set(session.id, true)
      // §9.2: a decided list question the write never saw, or an apply a host left half-done, finishes before the reminder.
      if (takeover.list !== undefined && (takeover.stage === 'apply' || takeover.stage === 'review')) {
        const questionId = takeover.listQuestion ?? await listQuestionOf(takeover, takeover.list).catch(() => undefined)
        if (questionId !== undefined) {
          const decided = (await loadGraph(takeover.graphDir)).nodes.get(questionId)?.status === 'done'
          if (takeover.stage === 'apply' || decided) {
            const resultText = await writeAgreement(root, takeover, questionId).catch((error: unknown) => RESULT.io(message(error)))
            live.delete(root)
            return createUserNotice(BOOTSTRAP_SOURCE, `takeover ${takeover.id} write finished`, wrapSystemReminder(`Takeover ${takeover.id}: ${resultText}`), { bootstrap: { takeover: takeover.id } })
          }
        }
      }
      let graph = await loadGraph(takeover.graphDir)
      const anchor = anchorOf(graph, takeover.openedAt)
      if (anchor !== undefined && await writeNorms(root, takeover, graph, anchor, agent)) graph = await loadGraph(takeover.graphDir)
      const goals = new Set([...graph.nodes.values()].filter(node => node.type === 'goal' && proposedSinceOpen(graph, node.id, takeover.openedAt)).map(node => node.id))
      const previous = live.get(root)
      const known: Live = previous?.takeover.id === takeover.id ? Object.assign(previous, { takeover, goals }) : { takeover, goals, anchorSteps: 0, asked: false, busy: false, baselined: new Set() }
      known.scan ??= await scanFactsOf(root, takeover)
      live.set(root, known)
      if (anchor !== undefined && takeover.path !== 'new') known.anchorSteps += 1
      if (known.anchorSteps >= STAGE_NOTE_STEPS && !known.asked && !takeover.noted.includes(STAGE_NOTE.code)) {
        await appendTakeover(root, takeover.id, [{ op: 'note', data: { ...STAGE_NOTE } }]).catch((error: unknown) => { deps.report(agent, 'degraded', `接管流水的记录写不进：${message(error)}`) })
      }
      const facts = await factsOf(root, takeover, graph, known.scan)
      await writeTouchDrafts(root, known, facts.touchInside, agent)
      await startRound(root, takeover, graph, known, agent)
      await writeBaselines(root, takeover, graph, agent).catch((error: unknown) => { deps.report(agent, 'degraded', `基线批注没写成：${message(error)}`) })
      return stepReminder(history, admitted, facts)
    },
  }
}
