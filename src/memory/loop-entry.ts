/**
 * What the memory row hands the loop board (dreaming design §3.1, §3.6;
 * `.agents/tasks/dream/design.md`): the nightly consolidation pass as a
 * plugin entry, `memory.dream-nightly` — a `daily` entry whose harness
 * action `memory.dream` this row runs, the way the loop row runs
 * `loops.peak-end` (src/loops/peak.ts) and the env row runs its checker. The
 * pass reads the session transcripts the transcript row exports
 * (src/data/transcript.ts) and appends the person's recurring requests to
 * the project's memory journal as `propose` records — candidates the person
 * confirms with `memory_store` or drops with `memory_forget`
 * (src/memory/model.ts); until then they are not entries and recall never
 * shows them.
 *
 * No script runs here and no model is called: the extraction is
 * deterministic (src/memory/dream.ts), so the entry ships with the row the
 * way the loop board's own defaults and the graph row's third-rework entry
 * do; the person's adoption gate stays where it belongs, on the entries that
 * run external commands (design §3.4).
 *
 * The hand-over goes through `installContribution` at activation (inject
 * when the host has it, once per agent/created otherwise); a refused
 * hand-over is warned once and kept off the row health's active line.
 */
import { readFileSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { parseRecord, type NewRecord } from '../data/record.ts'
import { projectDirOf } from '../data/project-root.ts'
import { TRANSCRIPTS_DIR } from '../data/transcript.ts'
import { dataService } from '../shared/data-home.ts'
import type { ServiceLookup } from '../shared/dsh-min.ts'
import type { AppendOptions } from '../data/journal.ts'
import { extractCandidates, DREAM_WINDOW_MS, type DreamInput } from './dream.ts'
import { memoryFold, proposeRecord, type MemoryState } from './model.ts'
import type { Contribution, ContributionHost, ContributionSource, HarnessResult, LoopEventRecord } from '../loops/service.ts'
import { installContribution } from '../loops/service.ts'
import type { LoopEntryDefinition } from '../loops/model.ts'
import { journalFile, writeScope } from './storage.ts'

/** The source line of the memory row's hand-over (the graph and env rows' table's shape). */
export const MEMORY_ROW_SOURCE: ContributionSource = { plugin: 'dsh-hourness', row: 'glm-hourness/memory' }

/** The board's id of the nightly consolidation entry. */
export const DREAM_ENTRY_ID = 'memory.dream-nightly'

/** The one harness action the memory row runs for the board. */
export const DREAM_ACTION = 'memory.dream'

/** The words to the main agent when the action's own `tell` is missing (the run always gives one on `done`). */
const FALLBACK_TELL = 'The nightly consolidation ran; see the loop board entry memory.dream-nightly for what it proposed.'

/**
 * The entry the board lists. 18:35 sits after the GLM peak (14:00–18:00) and
 * after the end-of-day check (18:05); the delivery does not wake the main
 * agent (`wake: false` — the result's `tell` rides the action's own wake),
 * so a night of candidates never pulls the person back.
 */
export function dreamEntry(): LoopEntryDefinition {
  return {
    id: DREAM_ENTRY_ID,
    title: '每晚把会话日志整理成记忆候选',
    why: '要求散在会话里隔天就没，这一项夜里把多个会话里说过的同类要求整理成候选，你确认后才进记忆',
    when: { kind: 'daily', time: '18:35' },
    action: { kind: 'harness', action: DREAM_ACTION, tell: { text: FALLBACK_TELL, wake: false } },
  }
}

// --- The pass ---------------------------------------------------------------

/** An export is named `<session id>.txt`; the same name the transcript row writes and cleans. */
const TRANSCRIPT_FILE = /^[A-Za-z0-9_-]{1,128}\.txt$/

/** The file reads of one pass; tests replace them. */
interface DreamIo {
  readdir(path: string): Promise<readonly string[]>
  stat(path: string): Promise<{ readonly mtimeMs: number }>
  readFile(path: string): Promise<string>
}

const nodeIo: DreamIo = {
  readdir: path => readdir(path),
  stat: path => stat(path),
  readFile: path => readFile(path, 'utf8'),
}

/** What one pass needs; the row's context provides it, tests point `io` at fixtures. */
export interface DreamDeps {
  readonly ctx: ServiceLookup
  readonly now: () => Date
  /** The lock environment and flush of the journal writes; the row's config hands them through. */
  readonly append?: Pick<AppendOptions, 'lock' | 'sync'>
  readonly io?: DreamIo
}

/** The project's data directory of a project root, the way the row's own places resolve it. */
function dreamDataDir(ctx: ServiceLookup, projectRoot: string): string | undefined {
  const data = dataService(ctx)
  return data?.projectDirOf !== undefined ? data.projectDirOf(projectRoot) : projectDirOf(projectRoot)
}

const TELL_ADDED = (added: number, merged: number, seen: number): string =>
  `The nightly consolidation pass read ${seen} session transcript(s) of the last two days and put ${added} new memory proposal(s)${merged > 0 ? ` (and refreshed ${merged} known one(s))` : ''} into the project's memory journal as harness proposals. They are not memories: recall and the index never show them until the person confirms. See the loop board entry memory.dream-nightly for the list; confirm one with memory_store (the person's own words in relay) or drop it with memory_forget.`

/**
 * One pass (dreaming design §3.6): read the window's transcripts, extract,
 * append what is new under the journal's lock. Skips are `no-project`,
 * `no-transcripts`, `no-candidates` and `settled` (everything already known,
 * nothing new); every failure is a `failed` result, never a throw.
 */
export async function runDream(deps: DreamDeps, action: string, event: LoopEventRecord): Promise<HarnessResult> {
  if (action !== DREAM_ACTION) return { outcome: 'failed', reason: 'action-missing' }
  try {
    const dir = dreamDataDir(deps.ctx, event.project)
    if (dir === undefined) return { outcome: 'skipped', reason: 'no-project' }
    const io = deps.io ?? nodeIo
    const folder = join(dir, TRANSCRIPTS_DIR)
    let names: readonly string[]
    try {
      names = await io.readdir(folder)
    }
    catch {
      return { outcome: 'skipped', reason: 'no-transcripts' }
    }
    const now = deps.now()
    const floor = now.getTime() - DREAM_WINDOW_MS
    const inputs: DreamInput[] = []
    for (const name of names) {
      if (!TRANSCRIPT_FILE.test(name)) continue
      const path = join(folder, name)
      const mtimeMs = (await io.stat(path)).mtimeMs
      if (mtimeMs < floor) continue
      inputs.push({ session: name.slice(0, -4), file: `${TRANSCRIPTS_DIR}/${name}`, text: await io.readFile(path), mtimeMs })
    }
    if (inputs.length === 0) return { outcome: 'skipped', reason: 'no-transcripts' }
    const candidates = extractCandidates(inputs, now.getTime())
    if (candidates.length === 0) return { outcome: 'skipped', reason: 'no-candidates' }
    let added = 0
    let merged = 0
    const result = await writeScope('project', dir, (state) => {
      const records: NewRecord[] = []
      for (const candidate of candidates) {
        // A name the person decided about once (any status) does not come back as a proposal.
        if (state.entries.has(candidate.name)) continue
        const open = state.proposals.get(candidate.name)
        if (open !== undefined) {
          const fresh = candidate.evidence.filter(item => !open.evidence.includes(item))
          if (open.description === candidate.description && open.body === candidate.body && fresh.length === 0) continue
          merged += 1
        }
        else added += 1
        const record = proposeRecord(
          { name: candidate.name, type: candidate.type, scope: candidate.scope, description: candidate.description, body: candidate.body },
          candidate.evidence,
          { tool: 'dream' },
        )
        if (!('invalid' in record)) records.push(record)
      }
      // The write refuses instead of appending an empty batch.
      return records.length === 0 ? { refused: 'settled' as const } : { records }
    }, deps.append)
    if (result.status === 'refused') return { outcome: 'skipped', reason: 'settled' }
    if (result.status === 'busy') return { outcome: 'failed', reason: 'the journal write was busy' }
    if (result.status === 'io') return { outcome: 'failed', reason: `io (${result.stage}): ${result.message.slice(0, 100)}` }
    if (result.status === 'legacy') return { outcome: 'failed', reason: `the legacy memory.json is unreadable: ${result.reason.slice(0, 100)}` }
    return { outcome: 'done', tell: TELL_ADDED(added, merged, inputs.length) }
  }
  catch (error) {
    return { outcome: 'failed', reason: (error instanceof Error ? error.message : String(error)).slice(0, 120) }
  }
}

// --- The page ---------------------------------------------------------------

/** The proposals of one project as the page shows them, folded synchronously; a journal not written yet holds none, anything unreadable is no lines, not a throw. */
function proposalsOfSync(dir: string): readonly { readonly name: string, readonly description: string, readonly sessions: number, readonly lastAt: string }[] {
  let text: string
  try {
    text = readFileSync(journalFile(dir), 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') return []
    return []
  }
  const fold = memoryFold('project')
  let state: MemoryState = fold.empty()
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    const record = parseRecord(line)
    if (typeof record === 'string') continue
    const step = fold.apply(state, record)
    if ('state' in step) state = step.state
  }
  return [...state.proposals.values()]
    .map(proposal => ({ name: proposal.name, description: proposal.description, sessions: proposal.evidence.length, lastAt: proposal.lastAt }))
    .sort((left, right) => Date.parse(right.lastAt) - Date.parse(left.lastAt))
}

const PAGE_LIMIT = 18

/** The opened entry's lines (loop board design §3.1): each open candidate with its evidence, then how the person decides. */
export function dreamDetails(deps: Pick<DreamDeps, 'ctx'>, project: string): readonly string[] {
  try {
    const dir = dreamDataDir(deps.ctx, project)
    if (dir === undefined) return []
    const proposals = proposalsOfSync(dir)
    if (proposals.length === 0) return ['现在没有开着的记忆候选。']
    const day = (at: string): string => Number.isNaN(Date.parse(at)) ? '?' : at.slice(0, 10)
    return [
      ...proposals.slice(0, PAGE_LIMIT).map(proposal =>
        `${proposal.name}（${proposal.sessions} 个会话，最近 ${day(proposal.lastAt)}）：${proposal.description.slice(0, 80)}`),
      ...(proposals.length > PAGE_LIMIT ? [`…还有 ${proposals.length - PAGE_LIMIT} 条`] : []),
      '收下一条：跟主 Agent 说，它带你的原话调 memory_store；不要一条：说一声，或 /memory forget ' + proposals[0]?.name,
    ]
  }
  catch {
    return []
  }
}

// --- The hand-over ----------------------------------------------------------

/** The memory row's whole hand-over: one entry, one action, the pass as the runner. */
export function dreamContribution(deps: DreamDeps): Contribution {
  return {
    entries: [dreamEntry()],
    actions: [{ id: DREAM_ACTION, title: '夜里把会话日志整理成记忆候选' }],
    run: (action: string, event: LoopEventRecord) => runDream(deps, action, event),
    details: (entry: string, project: string) => entry === DREAM_ENTRY_ID ? dreamDetails(deps, project) : [],
  }
}

/** What the wiring needs of the row's context: the hand-over's host with the pass's deps already bound. */
export type DreamEntryHost = ContributionHost

/**
 * Install the hand-over (src/loops/service.ts `installContribution`), with
 * the empty state shared by the fold's checks: the pass and the page read
 * `emptyMemory('project')`'s shape through the same fold the journal uses.
 */
export function installDreamEntry(ctx: DreamEntryHost, deps: Omit<DreamDeps, 'ctx'>, report: (message: string) => void): () => void {
  return installContribution(ctx, MEMORY_ROW_SOURCE, () => dreamContribution({ ...deps, ctx }), DREAM_ENTRY_ID, report)
}
