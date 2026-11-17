/**
 * What the main agent proposes to the loop board and how it is made ready for
 * the human (docs/ORCHESTRATION.md §18; loop board design 0.6 §7.1 step 1,
 * §12): `prepareProposal` checks the input of `loop_propose` against the
 * board's state with the same checks an entry file passes (`validateEntry`,
 * the script's length and secret checks), resolves what the board fills in
 * itself — the entry id it draws, the script's file and hash, a check's
 * command read from the environment tool node — and returns the proposal as
 * it will be stored: one line of plain words (`describe`), the `cautions`,
 * and, for a script or a check, the `detail` the human is shown whole with
 * its digest. The content is computed here and only here: what is stored is
 * what every later reader hands back (design §7.1 step 1, review F37). The
 * proposal has no effect; the person's word writes it (accept.ts).
 *
 * Pure but for the reads the caller hands over: a check's command from the
 * environment row's service (propose and repin), a script's text as the file
 * stands now (repin).
 */
import { attachDigest } from '../design/attach.ts'
import type { AttachDetail } from '../shared/attach.ts'
import { commandText } from './command-text.ts'
import type { LoopEntryDefinition } from './model.ts'
import { validateEntry } from './model.ts'
import type { LoopProposalImage } from './journal.ts'
import { scriptDetail, scriptTextProblem, type ScriptDetail } from './script-detail.ts'
import { scriptSha256 } from './script.ts'
import type { LoopEventDeclaration, ScriptLang } from './trigger.ts'

type ProposalKind = 'add' | 'edit' | 'delete' | 'repin'

/** A proposal's script file suffix by language, as the executor and the store read it. */
const SUFFIX: Readonly<Record<ScriptLang, string>> = { pwsh: 'ps1', node: 'mjs', python: 'py', bash: 'sh' }

const KINDS: readonly ProposalKind[] = ['add', 'edit', 'delete', 'repin']
/** A delete names at most three entries (the weekly report's removal, §6.11). */
const MOST_DELETED = 3
/** The person's entries of one project, at most (design §9.2). */
const MAX_PERSON_ENTRIES = 50
/** The open proposals of one project, at most (design §9.2). */
export const MAX_OPEN = 20
const REASON_MAX = 400
const DESCRIBE_MAX = 40
const CAUTION_MAX = 7
const CAUTION_WIDTH = 40
/** The timeout an entry without one runs with: the executor's default of one minute (command-text.ts). */
const DEFAULT_SECONDS = 60

/** The board's state a proposal is checked against. */
export interface PrepareContext {
  /** The events the board knows now. */
  readonly table: ReadonlyMap<string, LoopEventDeclaration>
  /** The person's entries as the store reads them, by id. */
  readonly entries: ReadonlyMap<string, { readonly status: string, readonly entry: LoopEntryDefinition | undefined }>
  /** The plugin entries in force, which no proposal may touch. */
  readonly pluginIds: ReadonlySet<string>
  /** The proposals the record holds, by id, for `replaces` and the open cap. */
  readonly proposals: ReadonlyMap<string, { readonly status: string }>
  /** How many of the person's entries stand now, for the limit of design §9.2. */
  readonly personCount: number
  readonly now: Date
  readonly via: 'graph' | 'board'
  /** The id the caller drew (`u-<8 hex>`); a taken one is drawn again by the caller. */
  readonly id: string
  /** A check's command from the environment tool node, read now; undefined when the node has none. */
  readonly checkCommand: (tool: string, check?: string) => Promise<readonly string[] | undefined>
  /** A script file's text as the repository holds it now, for a repin. */
  readonly readScript: (file: string) => string | undefined
}

export type Prepared =
  | { readonly ok: true, readonly id: string, readonly image: Omit<LoopProposalImage, 'status'> }
  | { readonly ok: false, readonly field: string, readonly message: string }

type Rec = Readonly<Record<string, unknown>>

const isRecord = (value: unknown): value is Rec => typeof value === 'object' && value !== null && !Array.isArray(value)
const points = (value: string): number => [...value].length
const cut = (value: string, max: number): string => points(value) <= max ? value : `${[...value].slice(0, max - 1).join('')}…`

const invalid = (field: string, message: string): Prepared => ({ ok: false, field, message })

const INPUT_FIELDS = ['kind', 'entry', 'entries', 'body', 'script', 'reason', 'replaces']
/** The fields of a proposed entry the main agent writes; the id is the board's, and joins for an edit. */
const BODY_FIELDS = ['id', 'title', 'why', 'when', 'filter', 'action', 'limits', 'quiet']

/** The path-like tokens a script's text names (design §7.1 step 1): a relative path with a separator, or a name of the kinds scripts and configs have. */
const PATH_LIKE = /(?:[\\/]\S+)|(?:\S+\.(?:ps1|sh|js|mjs|cjs|ts|py|cmd|bat)\b)/

// ----------------------------------------------------------------- words for the human

const WEEKDAY_WORDS = ['日', '一', '二', '三', '四', '五', '六'] as const

/** 什么时候, in the words of the design's example: 每 30 分钟 / 每天 09:00 / 每周五 17:00 / <时刻> 那一刻 / <事件的标题>时. */
function whenWords(when: unknown, table: ReadonlyMap<string, LoopEventDeclaration>): string {
  if (!isRecord(when)) return '到点'
  const time = (value: unknown): string => typeof value === 'string' ? value : ''
  switch (when.kind) {
    case 'every': return typeof when.seconds === 'number' ? `每 ${when.seconds} 秒` : '按间隔'
    case 'daily': return `每天 ${time(when.time)}`
    case 'weekly': {
      const days = Array.isArray(when.weekdays)
        ? when.weekdays.map(day => `周${WEEKDAY_WORDS[typeof day === 'number' && day >= 0 && day <= 6 ? day : 0] ?? '?'}`).join('、')
        : '每周'
      return `${days} ${time(when.time)}`
    }
    case 'once': return `${time(when.at)} 那一刻`
    case 'cron': return '按计划'
    case 'event': {
      const events = Array.isArray(when.events) ? when.events.filter((event): event is string => typeof event === 'string') : []
      const words = events.map(event => table.get(event)?.title ?? event)
      return `${words.slice(0, 2).join('或')}${events.length > 2 ? '等' : ''}发生时`
    }
    case 'command': return '在命令行里'
    default: return '到点'
  }
}

const REPORT_WORDS: Readonly<Record<string, string>> = {
  always: '每次都告诉主 Agent',
  'on-failure': '没过时告诉主 Agent',
  'on-change': '有变化时告诉主 Agent',
}

/** 做什么: 告诉主 Agent / 跑一段脚本 / 跑「工具」的检查, with what becomes of the result. */
function actionWords(action: unknown): string {
  if (!isRecord(action)) return '做事'
  if (action.kind === 'tell-main') return '告诉主 Agent'
  const report = typeof action.report === 'string' ? REPORT_WORDS[action.report] ?? '结果告诉主 Agent' : '结果告诉主 Agent'
  if (action.kind === 'script') return `跑一段脚本，${report}`
  if (action.kind === 'check') return `跑「${typeof action.tool === 'string' ? action.tool : '工具'}」的检查，${report}`
  return `${String(action.kind)}，${report}`
}

/** 一行说什么(§7.1 的 describe):「每 30 分钟跑「<名字>」，没过时告诉主 Agent」;名字放不下就去掉名字。 */
function describeOf(entry: { readonly title: string, readonly when: unknown, readonly action: unknown }, table: ReadonlyMap<string, LoopEventDeclaration>): string {
  const when = whenWords(entry.when, table)
  const action = actionWords(entry.action)
  const verb = isRecord(entry.action) && entry.action.kind === 'tell-main' ? '提醒主 Agent：' : '跑'
  const named = `${when}${verb}「${entry.title}」，${action}`
  const plain = `${when}${verb === '跑' ? `跑一段${isRecord(entry.action) && entry.action.kind === 'check' ? '检查' : '脚本'}，${action}` : action}`
  return cut(points(named) <= DESCRIBE_MAX ? named : plain, DESCRIBE_MAX)
}

/** The {title, when, action} a describe is built from, out of a body that is still a loose record. */
const describeParts = (body: Rec): { readonly title: string, readonly when: unknown, readonly action: unknown } => ({
  title: typeof body.title === 'string' ? body.title : '',
  when: body.when,
  action: body.action,
})

/** The timeout an entry runs with, as the cautions name it. */
const secondsOf = (action: unknown): number => {
  const seconds = isRecord(action) ? action.timeoutSeconds : undefined
  return typeof seconds === 'number' ? seconds : DEFAULT_SECONDS
}

/** An entry that tells the main agent wakes it about this often in a day (design §8.2's arithmetic), or undefined when it does not repeat. */
function wakesPerDay(when: unknown): number | undefined {
  if (!isRecord(when)) return undefined
  if (when.kind === 'every' && typeof when.seconds === 'number' && when.seconds > 0) return Math.round(86_400 / when.seconds)
  if (when.kind === 'daily') return 1
  if (when.kind === 'weekly') return (Array.isArray(when.weekdays) ? when.weekdays.length : 1) / 7
  return undefined
}

/** The cautions of a script or check proposal: the five the design fixes, plus the content-based ones (design §7.1 step 1). */
function cautionsOf(kind: 'script' | 'check', seconds: number, text: string | undefined, wakeCaution: string | undefined): readonly string[] {
  const fixed = kind === 'script'
    ? [
        '这段脚本会在你的电脑上、项目目录里按时运行',
        '它拿不到 DSH 的凭证和 GLM 的 Key',
        '它改过一个字就不再跑，要你再同意',
        `超过 ${seconds} 秒算没跑完，会告诉主 Agent`,
        'DSH 崩溃之后它可能被重跑一次',
      ]
    : [
        '这条命令会在你的电脑上、改动所在的检出里运行',
        '它拿不到 DSH 的凭证和 GLM 的 Key',
        '项目图上的命令改过就不再跑，要你再同意',
        `超过 ${seconds} 秒算没跑完，会告诉主 Agent`,
        '它调用的程序与配置文件不在这次同意里',
      ]
  const extra = [
    ...(text !== undefined && PATH_LIKE.test(text) ? ['它读写、调用的别的文件不在这次同意里'] : []),
    ...(wakeCaution === undefined ? [] : [wakeCaution]),
  ]
  return [...fixed, ...extra].map(line => cut(line, CAUTION_WIDTH)).slice(0, CAUTION_MAX)
}

/**
 * The text the human is shown whole: a script through the shared
 * `scriptDetail`, a check as the same three paragraphs with the command line
 * in the code block (design §7.1 step 1).
 */
function detailOf(kind: 'script' | 'check', input: { readonly lang?: ScriptLang, readonly text?: string, readonly argv?: readonly string[], readonly cautions: readonly string[] }): ScriptDetail | undefined {
  if (kind === 'script' && input.lang !== undefined && input.text !== undefined) {
    return scriptDetail({ lang: input.lang, text: input.text, cautions: input.cautions })
  }
  if (kind === 'check' && input.argv !== undefined && input.argv.length > 0) {
    const line = commandText(input.argv)
    const markdown = [
      '检查的命令（项目图上工具节点的命令，在改动所在的检出里跑）：',
      `\`\`\`\n${line}\n\`\`\``,
      `注意：${input.cautions.join('；')}`,
    ].join('\n')
    return { markdown, mustShow: [line, ...input.cautions] }
  }
  return undefined
}

// ----------------------------------------------------------------- the kinds

/** What the body's action runs, as the proposal kinds see it. */
function runsWhat(action: unknown): 'script' | 'check' | undefined {
  if (!isRecord(action)) return undefined
  return action.kind === 'script' ? 'script' : action.kind === 'check' ? 'check' : undefined
}

/** The body with the board's own fields in: the drawn id, the resolved script reference or command line. */
function resolveAction(body: Rec, script: Rec | undefined, argv: readonly string[] | undefined): { readonly body: Rec, readonly lang?: ScriptLang, readonly text?: string } | undefined {
  const action = body.action
  if (!isRecord(action)) return { body }
  if (action.kind === 'script') {
    if (script === undefined) return undefined
    const lang = typeof script.lang === 'string' && Object.hasOwn(SUFFIX, script.lang) ? script.lang as ScriptLang : undefined
    if (lang === undefined) return undefined
    const text = typeof script.text === 'string' ? script.text : undefined
    if (text === undefined) return undefined
    const resolved = { ...action, script: { file: `docs/loops/scripts/${String(body.id)}.${SUFFIX[lang]}`, sha256: scriptSha256(Buffer.from(text, 'utf8')), lang } }
    return { body: { ...body, action: resolved }, lang, text }
  }
  if (action.kind === 'check') {
    if (argv === undefined) return undefined
    return { body: { ...body, action: { ...action, argv } } }
  }
  return { body }
}

async function addProposal(input: Rec, context: PrepareContext, personCount: number): Promise<Prepared> {
  const body = input.body
  if (!isRecord(body)) return invalid('body', 'body is the entry: {title, why?, when, filter?, action, limits?, quiet?}')
  const extra = Object.keys(body).find(key => !BODY_FIELDS.includes(key))
  if (extra !== undefined) return invalid(`body.${extra}`, `${extra} is not a field of a proposed entry`)
  if (personCount + 1 > MAX_PERSON_ENTRIES) {
    return invalid('body', `这个项目你加的已经有 ${MAX_PERSON_ENTRIES} 项了，先删掉不用的`)
  }
  const script = isRecord(input.script) ? input.script : undefined
  const runs = runsWhat(body.action)
  if (runs === 'script' && script === undefined) return invalid('script', 'a script entry carries script: {lang, text}: the text a sub-agent wrote, passed as is')
  if (runs !== 'script' && script !== undefined) return invalid('script', 'script belongs to a proposal whose action runs a script')
  let argv: readonly string[] | undefined
  if (runs === 'check') {
    const action = body.action
    const tool = isRecord(action) && typeof action.tool === 'string' ? action.tool : ''
    const named = isRecord(action) && typeof action.check === 'string' ? action.check : undefined
    argv = await context.checkCommand(tool, named)
    if (argv === undefined) return invalid('body.action.tool', '项目图上没有这个工具节点，或它没有可跑的检查')
  }
  // An add carries no id: the board's drawn one goes in. An edit's body already names its entry.
  const withId = typeof body.id === 'string' && body.id !== '' ? body : { ...body, id: context.id }
  const resolved = resolveAction(withId, script, argv)
  if (resolved === undefined) return invalid('script', 'script is {lang, text}: the language and the text of the script')
  if (resolved.text !== undefined) {
    const problem = scriptTextProblem(resolved.text)
    if (problem !== undefined) return invalid('script.text', problem)
  }
  const issues = validateEntry(resolved.body, 'person', { table: context.table, now: context.now })
  const first = issues[0]
  if (first !== undefined) return invalid(`body.${first.path}`, first.message)
  const bodyResolved = resolved.body as unknown as LoopEntryDefinition
  const seconds = secondsOf(resolved.body.action)
  let cautions: readonly string[]
  let detail: AttachDetail | undefined
  if (runs === 'script' && resolved.text !== undefined && resolved.lang !== undefined) {
    cautions = cautionsOf('script', seconds, resolved.text, undefined)
    detail = detailOf('script', { lang: resolved.lang, text: resolved.text, cautions })
  }
  else if (runs === 'check') {
    cautions = cautionsOf('check', seconds, undefined, undefined)
    const argvResolved = isRecord(resolved.body.action) && Array.isArray(resolved.body.action.argv) ? resolved.body.action.argv as readonly string[] : []
    detail = detailOf('check', { argv: argvResolved, cautions })
  }
  else {
    const perDay = wakesPerDay(resolved.body.when)
    cautions = perDay !== undefined && perDay >= 2 ? [`每天大约叫醒主 Agent ${perDay} 次`] : []
  }
  return composed('add', context, { body: bodyResolved, ...(resolved.text === undefined ? {} : { scriptText: resolved.text }), describe: describeOf(describeParts(resolved.body), context.table), cautions, ...(detail === undefined ? {} : { detail }) })
}

/** The ids a delete or an edit names, or why they are not usable. */
function targetOf(input: Rec): Prepared | string {
  const entry = input.entry
  const list = input.entries
  if (entry !== undefined) {
    if (typeof entry !== 'string' || entry === '') return invalid('entry', 'entry is the id of one of the person\'s entries')
    return entry
  }
  if (!Array.isArray(list) || list.length < 1 || list.length > MOST_DELETED) return invalid('entries', `entries is a list of 1 to ${MOST_DELETED} ids of the person's entries`)
  const ids: string[] = []
  for (const [index, id] of list.entries()) {
    if (typeof id !== 'string' || ids.includes(id)) return invalid(`entries[${index}]`, '每一项是一个人的条目的 id，且不重复')
    ids.push(id)
  }
  return ids.join(',')
}

/** One field path of a delete's target list. */
const targetField = (single: boolean, index: number): string => single ? 'entry' : `entries[${index}]`

function deleteProposal(input: Rec, context: PrepareContext): Prepared {
  const single = input.entry !== undefined
  const target = targetOf(input)
  if (typeof target !== 'string') return target
  const ids = single ? [target] : target.split(',')
  const lines: string[] = []
  for (const [index, id] of ids.entries()) {
    if (context.pluginIds.has(id)) return invalid(targetField(single, index), '插件带来的条目暂时只能看')
    const found = context.entries.get(id)
    if (found === undefined) return invalid(targetField(single, index), '这个项目里没有这一项')
    if (found.status === 'deleted') return invalid(targetField(single, index), `「${found.entry?.title ?? id}」已经删过了`)
    lines.push(`「${found.entry?.title ?? id}」`)
  }
  const describe = cut(`删掉 ${ids.length} 项：${lines.join('、')}`, DESCRIBE_MAX)
  return { ok: true, id: context.id, image: { kind: 'delete', via: context.via, at: context.now.toISOString(), reason: '', entries: ids, describe, cautions: [] } }
}

/** The definition and script text a repin carries: the entry as the repository holds it now. */
function repinContent(id: string, context: PrepareContext): { readonly entry: LoopEntryDefinition, readonly scriptText?: string } | undefined {
  const entry = context.entries.get(id)?.entry
  if (entry === undefined) return undefined
  if (entry.action.kind === 'script') {
    const text = context.readScript(entry.action.script.file)
    if (text === undefined || text === '') return undefined
    return { entry, scriptText: text }
  }
  return { entry }
}

async function repinProposal(input: Rec, context: PrepareContext): Promise<Prepared> {
  const id = input.entry
  if (typeof id !== 'string' || id === '') return invalid('entry', 'entry is the id of the entry the human has to read again')
  if (context.pluginIds.has(id)) return invalid('entry', '插件带来的条目暂时只能看')
  const found = context.entries.get(id)
  if (found === undefined) return invalid('entry', '这个项目里没有这一项')
  if (found.status === 'deleted') return invalid('entry', '这一项已经删掉了，不用再同意')
  const content = repinContent(id, context)
  if (content === undefined) return invalid('entry', '这一项的条目文件或脚本读不出，钉不住：先让主 Agent 查看文件，或用 /loops restore 恢复')
  const entry = content.entry
  const runs = runsWhat(entry.action)
  // A check's command is read from the tool node again: the pin is the command as it stands, which is what the human sees.
  const checkAction = entry.action.kind === 'check' ? entry.action : undefined
  const argv = checkAction === undefined ? undefined : await context.checkCommand(checkAction.tool, checkAction.check)
  if (checkAction !== undefined && argv === undefined) return invalid('entry', '项目图上读不出这条检查的命令了，钉不住：不要它就提 delete')
  // Nothing moved: the entry file is as agreed, a check's command as pinned and the script bytes the ones agreed to, so there is nothing to approve again.
  const commandMoved = checkAction !== undefined && argv !== undefined && argv.join('\u0000') !== checkAction.argv.join('\u0000')
  const scriptMoved = entry.action.kind === 'script' && content.scriptText !== undefined && scriptSha256(Buffer.from(content.scriptText, 'utf8')) !== entry.action.script.sha256
  if (found.status === 'ok' && !commandMoved && !scriptMoved) {
    return invalid('entry', '这一项就是你同意的那一版，不用再同意')
  }
  const seconds = secondsOf(entry.action)
  let body: LoopEntryDefinition = entry
  let scriptText: string | undefined
  let cautions: readonly string[]
  let detail: AttachDetail | undefined
  if (runs === 'script' && content.scriptText !== undefined && entry.action.kind === 'script') {
    scriptText = content.scriptText
    // The pin is the text as it stands: the entry's hash follows the bytes the human is about to see.
    body = { ...entry, action: { ...entry.action, script: { ...entry.action.script, sha256: scriptSha256(Buffer.from(scriptText, 'utf8')) } } }
    cautions = cautionsOf('script', seconds, scriptText, undefined)
    detail = detailOf('script', { lang: entry.action.script.lang, text: scriptText, cautions })
  }
  else if (runs === 'check' && argv !== undefined) {
    body = { ...entry, action: { ...entry.action, argv } } as LoopEntryDefinition
    cautions = cautionsOf('check', seconds, undefined, undefined)
    detail = detailOf('check', { argv, cautions })
  }
  else {
    cautions = []
  }
  // The definition is checked as a writer's; the board writes the source again at accept.
  const { source, ...definition } = body as LoopEntryDefinition & { readonly source?: unknown }
  void source
  const issues = validateEntry(definition, 'person', { table: context.table, now: context.now })
  const first = issues[0]
  if (first !== undefined) return invalid('entry', `这一项现在的文件不合格（${first.path}：${first.message}），不能照它钉住`)
  return composed('repin', context, { body, ...(scriptText === undefined ? {} : { scriptText }), entry: id, describe: describeOf(body, context.table), cautions, ...(detail === undefined ? {} : { detail }) })
}

/** Assemble the stored image once the content is settled. */
function composed(kind: ProposalKind, context: PrepareContext, parts: {
  readonly body?: LoopEntryDefinition
  readonly scriptText?: string
  readonly entry?: string
  readonly entries?: readonly string[]
  readonly describe: string
  readonly cautions: readonly string[]
  readonly detail?: AttachDetail | undefined
}): Prepared {
  const { detail } = parts
  return {
    ok: true,
    id: context.id,
    image: {
      kind,
      via: context.via,
      at: context.now.toISOString(),
      reason: '',
      ...(parts.body === undefined ? {} : { body: parts.body }),
      ...(parts.scriptText === undefined ? {} : { scriptText: parts.scriptText }),
      ...(parts.entry === undefined ? {} : { entry: parts.entry }),
      ...(parts.entries === undefined ? {} : { entries: parts.entries }),
      describe: parts.describe,
      cautions: parts.cautions,
      ...(detail === undefined ? {} : { detail, digest: attachDigest(detail) }),
    },
  }
}

async function editProposal(input: Rec, context: PrepareContext): Promise<Prepared> {
  const single = targetOf(input)
  if (typeof single !== 'string') return single
  if (single.includes(',')) return invalid('entry', 'entry is one id: to remove several, propose a delete with entries')
  const id = single
  if (context.pluginIds.has(id)) return invalid('entry', '插件带来的条目暂时只能看')
  const found = context.entries.get(id)
  if (found === undefined) return invalid('entry', '这个项目里没有这一项')
  if (found.status === 'deleted') return invalid('entry', '这一项已经删掉了；要用回来先打 /loops restore')
  const body = input.body
  if (!isRecord(body)) return invalid('body', 'body is the entry as it becomes: {title, why?, when, filter?, action, limits?, quiet?}')
  // An edit does not add an entry: the limit of design §9.2 counts adds only.
  const made = await addProposal({ ...input, body: { ...body, id } }, context, 0)
  if (!made.ok) return made
  return { ok: true, id: made.id, image: { ...made.image, kind: 'edit', entry: id } }
}

/**
 * Check what the main agent gave `loop_propose` and make the proposal of it
 * (design §7.1 step 1). `input` is `{kind, entry?, entries?, body?, script?,
 * reason, replaces?}`; a check's command and a repin's text are read through
 * the context. What is proposed does nothing until the person agrees.
 */
export async function prepareProposal(input: unknown, context: PrepareContext): Promise<Prepared> {
  if (!isRecord(input)) return invalid('input', 'loop_propose takes {kind, entry?, entries?, body?, script?, reason, replaces?}')
  const extra = Object.keys(input).find(key => !INPUT_FIELDS.includes(key))
  if (extra !== undefined) {
    return invalid(extra, ['summary', 'background', 'crux', 'skip', 'set', 'why', 'ifSet', 'ifSkip', 'counter'].includes(extra)
      ? 'put the question to the human with propose_to_human (attach); loop_propose takes only the content of the proposal'
      : `${extra} is not a field of loop_propose: {kind, entry?, entries?, body?, script?, reason, replaces?}`)
  }
  const { kind, reason, replaces } = input
  if (typeof kind !== 'string' || !KINDS.includes(kind as ProposalKind)) return invalid('kind', `kind is one of ${KINDS.join(', ')}`)
  if (typeof reason !== 'string' || reason.trim() === '' || points(reason) > REASON_MAX) return invalid('reason', `reason is why you propose it, 1 to ${REASON_MAX} characters`)
  const open = [...context.proposals.values()].filter(proposal => proposal.status === 'open')
  if (replaces !== undefined) {
    if (typeof replaces !== 'string' || context.proposals.get(replaces)?.status !== 'open') return invalid('replaces', 'replaces is the id of an open proposal (lp-…)')
  }
  else if (open.length >= MAX_OPEN) return invalid('input', `${open.length} proposals are open: the human has not decided them; do not add more`)
  const made = kind === 'add' ? await addProposal(input, context, context.personCount)
    : kind === 'edit' ? await editProposal(input, context)
    : kind === 'delete' ? deleteProposal(input, context)
    : await repinProposal(input, context)
  if (!made.ok) return made
  return { ok: true, id: made.id, image: { ...made.image, reason, ...(replaces === undefined ? {} : { replaces }) } }
}
