/**
 * The loop board's three agent tools (docs/ORCHESTRATION.md §18; loop board
 * design 0.6 §7.3, §7.1):
 *
 * - `loop_show`, any agent: the project's whole board — the plugins' entries
 *   and the person's, each with its last and next run, what waits, and the
 *   last ten runs; nothing is cut short. It reads the same view the page and
 *   `/loops` read, and adds the ids.
 * - `loop_propose`, the main agent's: it records what the human asked for as a
 *   proposal on the board and changes nothing. The main agent puts it to them
 *   with `propose_to_human` (`attach` = the "attach" of the result) and
 *   records their words with `record_human_answer`; the board then writes the
 *   entry as theirs (accept.ts).
 * - `loop_note`, the main agent's: one line of conclusion on the run an entry
 *   just delivered, for the entry's own small print on the page (notes.ts).
 *
 * `LOOP_TOOL_NAMES` (src/shared/tool-names.ts) pins the names; the tools sit
 * behind GLM tool search like any orchestration tool, not resident (design
 * §7.3: loop_note's use is written in the entry's own text, so the model meets
 * it when a message names it).
 */
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectOf } from '../data/project-root.ts'
import { execAgent, textRender, toolShell } from '../design/tool-support.ts'
import { graphService } from '../graph/service.ts'
import type { AgentLike, ServiceLookup, ToolDefinitionLike } from '../shared/dsh-min.ts'
import { emitMetric } from '../shared/metrics.ts'
import { refuse } from '../shared/tool-refusal.ts'
import { callerOf } from '../rules/caller.ts'
import { addNote } from './notes.ts'
import type { LoopEntryDefinition } from './model.ts'
import { prepareProposal, type PrepareContext } from './proposal.ts'
import type { LoopsRegistry } from './registry.ts'
import type { LoopChecks } from './run.ts'
import type { LoopStore } from './store.ts'
import type { StoreIo } from '../rules/store.ts'
import { momentText, runLine, type LoopsView } from './view.ts'

/** The id a proposal carries (`lp-<8 hex digits>`), drawn until it is free. */
const newProposalId = (): string => `lp-${randomBytes(4).toString('hex')}`
/** The id the proposed entry takes (`u-<8 hex digits>`), drawn with the proposal. */
const newEntryId = (): string => `u-${randomBytes(4).toString('hex')}`
const TRIES = 3

// ------------------------------------------------------------------ loop_show

export interface ShowToolDeps {
  /** The project's view as the boards write it, settled first; undefined when the files cannot be read. */
  readonly view: (cwd: string) => Promise<LoopsView | undefined>
}

/** The board as lines for an agent: the view's entries with their ids, what waits, and the last ten runs. */
function showText(view: LoopsView): string {
  const lines: string[] = []
  const plugin = view.entries.filter(entry => entry.source === 'plugin')
  const person = view.entries.filter(entry => entry.source === 'person' && entry.state !== 'deleted')
  const deleted = view.entries.filter(entry => entry.source === 'person' && entry.state === 'deleted' && entry.note !== undefined)
  lines.push(`插件带来的（${plugin.length} 项，只能看）：`, ...plugin.map(entry => `· ${entry.title} · ${entry.when} · ${entry.does} · ${runLine(entry)} · id ${entry.id}`))
  lines.push(`你自己加的（${person.length} 项）：`, ...person.map(entry => `· ${entry.title} · ${entry.when} · ${entry.does} · ${runLine(entry)}${entry.state !== 'ok' ? ` · ${entry.note ?? entry.state}` : ''} · id ${entry.id}`))
  for (const entry of deleted) lines.push(`7 天内删掉的「${entry.title}」：/loops restore ${entry.id} 能恢复 · id ${entry.id}`)
  lines.push(`在等的 ${view.waiting} 件`)
  if (view.recent.length > 0) lines.push('最近 10 次运行：', ...view.recent.slice(0, 10).map(run => `· ${momentText(run.at)} · ${run.title} · ${run.text}`))
  return lines.join('\n')
}

const SHOW_PARAMETERS = { type: 'object', properties: {}, required: [], additionalProperties: false }
const TEXT_SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' }, text: { type: 'string' } }, required: ['ok', 'text'], additionalProperties: false }

/** The tool, to register on the host. */
export function loopShowTool(deps: ShowToolDeps): ToolDefinitionLike {
  return {
    name: 'loop_show',
    description: 'Read this project\'s loop board: every entry, the plugins\' and the human\'s, each with what starts it, what it does, its last and next run, what waits, and the last ten runs. Nothing is left out. The board runs entries when their time comes or their event happens; you cannot add one from here: propose it with loop_propose.',
    parameters: SHOW_PARAMETERS,
    output: {
      schema: TEXT_SCHEMA,
      render: textRender,
    },
    execute: (_args, exec) => {
      const agent = execAgent(exec)
      const caller = agent?.session?.header.cwd
      if (typeof caller !== 'string' || caller === '' || projectOf(caller) === undefined) {
        return Promise.resolve({ ok: true, text: '这个会话不在一个 git 项目里，没有循环板' })
      }
      return deps.view(caller).then(view => ({ ok: true, text: view === undefined ? '循环板的文件这次读不出，原因在循环板这一行的状态里' : showText(view) }))
    },
  }
}

// ------------------------------------------------------------------ loop_propose

/**
 * The two examples `loop_propose` carries in its description (design §7.3,
 * `d-agent-examples`): a time entry that tells the main agent, and an event
 * entry whose action is a script, with what the script receives on standard
 * input and what its output does. The domain is a small code project, not the
 * calibration exercises' expense log; both examples pass the real proposal
 * checks (L2 pins it), so the tables of design §4 and §12 they name are the
 * ones in force.
 */
export const LOOP_PROPOSE_EXAMPLES = [
  'Example 1, time trigger, tell the main agent:',
  '{"kind": "add", "reason": "The human asked for a Friday reminder about old unmerged branches.", "body": {"title": "每周五看一眼没合入的分支", "when": {"kind": "weekly", "time": "17:00", "weekdays": [5], "timeZone": "Asia/Shanghai"}, "action": {"kind": "tell-main", "wake": true, "text": "Weekly: list the branches not merged into main and older than 7 days, then ask the human in one line which to drop."}}}',
  'Example 2, event trigger with a filter, the action is a script (a subagent wrote the script; pass its text as is):',
  '{"kind": "add", "reason": "The human asked to hear about broken links in docs after each merge.", "body": {"title": "合进主干之后查文档里的坏链接", "when": {"kind": "event", "events": ["hourness.trunk-advanced"]}, "filter": {"files": {"paths": ["docs/**/*.md"]}}, "action": {"kind": "script", "report": "on-failure", "timeoutSeconds": 30, "note": "Broken links in docs after a merge. Fix them in a small task; do not ask the human."}}, "script": {"lang": "node", "text": "import { readFileSync, existsSync } from \'node:fs\'\\nimport { dirname, join } from \'node:path\'\\nconst event = JSON.parse(readFileSync(0, \'utf8\'))\\nconst broken = []\\nfor (const file of event.payload.files.filter(f => f.endsWith(\'.md\'))) {\\n  if (!existsSync(file)) continue\\n  for (const [, target] of readFileSync(file, \'utf8\').matchAll(/\\\\]\\\\((?!https?:|#)([^)#\\\\s]+)/g)) {\\n    if (!existsSync(join(dirname(file), target))) broken.push(`${file}: ${target}`)\\n  }\\n}\\nif (broken.length > 0) { console.log(broken.join(\'\\\\n\')); process.exit(1) }\\n"}}',
  'The script (docs/loops/scripts/<id>.mjs after the human agrees; it runs in the project root) gets one JSON object on stdin: {"version": 1, "board": "loops", "entry": "u-3f9a1c2e", "run": "lr-...", "event": "hourness.trunk-advanced", "at": "...", "project": "...", "key": "trunk-advanced:<sha>:<at>", "payload": {"from": "...", "to": "...", "tasks": ["t-12"], "files": ["docs/setup.md", "src/app.ts"], "truncated": false}, "merged": []}.',
  'What its output does: exit 0 means passed, nothing is sent (report on-failure). Exit 1 means not passed: the main agent gets one message with the note, the exit code and the last lines it printed (here, the broken links). Past the timeout it is stopped and the main agent is told it did not finish. If the file is changed after the human agrees, it does not run until they agree again.',
].join('\n')

const DESCRIPTION = [
  'Propose an entry of this project\'s loop board: something that runs when its time comes or when an event happens — telling the main agent, running a script, or running a check from the project graph. It records the proposal and changes nothing: only the human can add an entry.',
  'Call it when the human asks for one. Then put the proposal to the human with propose_to_human (kind question, attach = the "attach" in the result): one plan in four lines; the recommendation line says what describe says.',
  'The human reads describe through your propose_to_human lines; write those lines in plain words as propose_to_human\'s guide says. For a script, propose_to_human adds the exact script text and the cautions after your lines; show them as given.',
  'Arguments: kind (add | edit | delete | repin), entry (one id, for edit/delete/repin), entries (1 to 3 ids, for a delete), body (add or edit: the entry {title, why?, when, filter?, action, limits?, quiet?}), script ({lang, text} when the action runs a script; the text a sub-agent wrote, passed as is), reason (why, 1 to 400 characters), replaces (an open proposal this one replaces, after the human added to it or turned it down). A check action is {kind: "check", tool, check?, report, timeoutSeconds?, note?, to?, glmSpend?}: the command comes from the project graph\'s tool node, the board reads it now.',
  LOOP_PROPOSE_EXAMPLES,
].join('\n')

const PROPOSE_PARAMETERS = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['add', 'edit', 'delete', 'repin'] },
    entry: { type: 'string' },
    entries: { type: 'array', items: { type: 'string' } },
    body: { type: 'object' },
    script: { type: 'object' },
    reason: { type: 'string' },
    replaces: { type: 'string' },
  },
  required: ['kind', 'reason'],
  additionalProperties: false,
}

const PROPOSE_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    proposal: { type: 'string' },
    describe: { type: 'string' },
    cautions: { type: 'array', items: { type: 'string' } },
    attach: { type: 'string' },
    detail: { type: 'object', properties: { markdown: { type: 'string' }, mustShow: { type: 'array', items: { type: 'string' } } }, required: ['markdown', 'mustShow'], additionalProperties: false },
    message: { type: 'string' },
  },
  required: ['ok', 'proposal', 'describe', 'cautions', 'attach', 'message'],
  additionalProperties: false,
}

/** The lines the result tells the main agent (design §7.1 step 1); a script or a check rides the detail through propose_to_human. */
const MESSAGES = {
  graph: (attach: string): string => `Put it to the human with propose_to_human (kind question, attach ${attach}): one plan in four lines; the recommendation line says what describe says. For a script or a check, propose_to_human puts the exact script text or command line and every caution after your four lines: show its text to the human exactly as given, that part included, or their agreement will not count. It runs as soon as the human agrees; there is no trial run. It takes effect only when the human agrees and you record their words with record_human_answer.`,
  board: (id: string): string => `The project graph is not available: tell the human this proposal in four lines, then quote detail.markdown exactly as given, and tell them they can type /loops accept ${id} or /loops reject ${id}.`,
}

export interface ProposeToolDeps {
  readonly ctx: ServiceLookup
  readonly now: () => number
  /** The store of the project a working directory is in, as the row holds it. */
  readonly storeFor: (cwd: string | undefined) => LoopStore | undefined
  /** The entries and events in force, for the checks and the plugin ids a proposal may not touch. */
  readonly registry: LoopsRegistry
  /** The environment row's seam for a check's command; absent while that row is off. */
  readonly checks: () => LoopChecks | undefined
}

/** The tool, to register on the host. */
export function loopProposeTool(deps: ProposeToolDeps): ToolDefinitionLike {
  async function propose(args: unknown, agent: AgentLike | undefined): Promise<Record<string, unknown>> {
    const caller = callerOf(deps.ctx, agent)
    const project = caller.cwd === undefined ? undefined : projectOf(caller.cwd)
    if (caller.cwd === undefined || project === undefined) refuse('invalid', 'this session has no working directory in a project: the loop board has nowhere to keep a proposal', 'work in the project the entry is for')
    if (caller.role !== 'main-agent') refuse('forbidden', 'loop_propose is the main agent\'s tool', 'ask the main agent to propose it')
    const store = deps.storeFor(caller.cwd)
    if (store === undefined) refuse('busy', 'the loop board is not running here', 'nothing was recorded; tell the human the board is off')
    const read = store.read()
    const entries = new Map(read.entries.map((entry): [string, { readonly status: string, readonly entry: LoopEntryDefinition | undefined }] => [entry.id, { status: entry.status.kind, entry: entry.entry }]))
    const proposals = new Map([...store.proposals()].map(([id, proposal]): [string, { readonly status: string }] => [id, { status: proposal.image.status }]))
    const personCount = read.entries.filter(entry => entry.status.kind !== 'deleted').length
    const via = graphService(deps.ctx)?.dirFor(caller.cwd) === undefined ? 'board' as const : 'graph' as const
    const context: Omit<PrepareContext, 'id'> = {
      table: deps.registry.events(),
      entries,
      pluginIds: new Set(deps.registry.entries().map(item => item.entry.id)),
      proposals,
      personCount,
      now: new Date(deps.now()),
      via,
      checkCommand: async (tool, check) => {
        const seam = deps.checks()
        if (seam === undefined) return undefined
        const command = await seam.commandOf(caller.cwd!, tool, check)
        return command?.argv
      },
      readScript: (file) => {
        try {
          return readFileSync(join(project.root, ...file.split('/')), 'utf8')
        }
        catch {
          return undefined
        }
      },
    }
    for (let attempt = 0; attempt < TRIES; attempt++) {
      const proposalId = newProposalId()
      const made = await prepareProposal(args, { ...context, id: newEntryId() })
      if (!made.ok) refuse('invalid', made.message, `correct ${made.field} and call loop_propose again; nothing was recorded`, made.field)
      const written = await store.apply('llm', { op: 'propose', id: proposalId, image: made.image })
      if (!written.ok) {
        // A taken id is drawn again; anything else is the board's refusal as it is.
        if (written.code === 'invalid' && written.message.includes('提议编号')) continue
        refuse(written.code, written.message, 'nothing was recorded; try again in a moment if the board was busy')
      }
      const attach = `loops:${proposalId}`
      return {
        ok: true,
        proposal: proposalId,
        describe: made.image.describe,
        cautions: made.image.cautions,
        attach,
        ...(via === 'board' && made.image.detail !== undefined ? { detail: made.image.detail } : {}),
        message: via === 'graph' ? MESSAGES.graph(attach) : MESSAGES.board(made.id),
      }
    }
    return refuse('busy', 'the board could not give the proposal an id', 'call loop_propose again')
  }

  return {
    ...toolShell('loop_propose', DESCRIPTION, PROPOSE_PARAMETERS, PROPOSE_SCHEMA),
    execute: (args, exec) => propose(args, execAgent(exec)),
  }
}

// ------------------------------------------------------------------ loop_note

export interface NoteToolDeps {
  readonly ctx: ServiceLookup
  readonly io: StoreIo
  readonly now: () => number
  readonly storeFor: (cwd: string | undefined) => LoopStore | undefined
  /** The run of the entry's last delivery to the main agent, as the runtime has it; undefined when none was delivered. */
  readonly runOf: (root: string, entry: string) => string | undefined
}

const NOTE_PARAMETERS = {
  type: 'object',
  properties: {
    entry: { type: 'string' },
    text: { type: 'string' },
  },
  required: ['entry', 'text'],
  additionalProperties: false,
}

const NOTE_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    entry: { type: 'string' },
    run: { type: 'string' },
  },
  required: ['ok', 'entry', 'run'],
  additionalProperties: false,
}

/** The tool, to register on the host. */
export function loopNoteTool(deps: NoteToolDeps): ToolDefinitionLike {
  async function note(args: unknown, agent: AgentLike | undefined): Promise<Record<string, unknown>> {
    const caller = callerOf(deps.ctx, agent)
    const project = caller.cwd === undefined ? undefined : projectOf(caller.cwd)
    if (caller.cwd === undefined || project === undefined) refuse('invalid', 'this session has no working directory in a project: the loop board keeps notes in the project', 'work in the project the entry runs in')
    if (caller.role !== 'main-agent') refuse('forbidden', 'loop_note is the main agent\'s tool', 'ask the main agent to record the conclusion')
    const input = args as { entry?: unknown, text?: unknown }
    const entry = typeof input.entry === 'string' ? input.entry : undefined
    const text = typeof input.text === 'string' ? input.text : undefined
    if (entry === undefined || entry === '') refuse('invalid', 'entry is the id of the entry the run belongs to', 'loop_show lists the ids', 'entry')
    if (text === undefined || [...text].length < 1 || [...text].length > 500) refuse('invalid', 'text is the conclusion, 1 to 500 characters', 'one line of what the run concluded', 'text')
    const run = deps.runOf(project.root, entry)
    if (run === undefined) refuse('invalid', '这一项还没有交给你的运行', 'wait for its next run, or record the conclusion where the entry\'s text says', 'entry')
    const store = deps.storeFor(caller.cwd)
    if (store === undefined) refuse('busy', 'the loop board is not running here', 'nothing was recorded; tell the human the board is off')
    const done = await store.locked(async () => addNote(store.paths, deps.io, { entry, run, at: new Date(deps.now()).toISOString(), text }))
    if (done === 'busy') refuse('busy', 'the loop board was busy', 'call loop_note again in a moment')
    emitMetric(deps.ctx, { k: 'loop-note', by: 'loops', body: { entry, run, chars: [...text].length } }, { dir: project.root })
    return { ok: true, entry, run }
  }

  return {
    ...toolShell('loop_note', 'Record one line of conclusion on the run of a loop board entry that was just delivered to you ({entry, text}, 1 to 500 characters). The line hangs on that run and shows when the entry is opened on the board\'s page. The entry\'s own text tells you when to call this; without a run of that entry delivered to you the call fails.', NOTE_PARAMETERS, NOTE_SCHEMA),
    execute: (args, exec) => note(args, execAgent(exec)),
  }
}
