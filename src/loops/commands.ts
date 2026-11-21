/**
 * The `/loops` command (docs/ORCHESTRATION.md §18.7; loop board design §7.2): the
 * person's way to see every entry of the project, to delete one of their
 * entries, to get one back, to acknowledge a damaged change record, and to
 * decide a proposal that was made while the project graph was not there
 * (`accept`, `reject`; a proposal with text takes two accepts, the first one
 * shows it whole, §7.1 end). Typed in the input box, so the identity is the
 * person's (a slash command is never the model's, §2.10); every change goes
 * through the store's `apply`, which checks it again. A change is answered in
 * one line of plain Chinese; the list is the view the page shows (view.ts),
 * as lines.
 */
import type { CommandResultLike } from '../shared/dsh-min.ts'
import type { LoopProposal } from './journal.ts'
import type { PersonEntry } from './model.ts'
import type { ApplyResult, BoardEntry, LoopStore } from './store.ts'
import { nextOccurrence } from './trigger.ts'
import { momentText, runLine, type LoopsView, type ViewEntry } from './view.ts'

export const LOOPS_HINT = '不带参数：列出全部 | delete <名字或 id> | restore <id> | ack | accept <提议> | reject <提议>'
export const NOT_A_PROJECT = '这个会话不在一个 git 项目里，没有循环板'

const USAGE = '用法：/loops（列出全部）、/loops delete <名字或 id>、/loops restore <id>、/loops ack、/loops accept <lp-id>、/loops reject <lp-id>'

const PROPOSAL_ID = /^lp-[0-9a-f]{8}$/

/** How long the text the first `/loops accept` showed counts (design §7.1 end). */
const SHOWN_VALID_MS = 30 * 60_000

const PERSON_ID = /^u-[0-9a-f]{8}$/
/** The shape of an id a plugin hands over: `<namespace>.<name>` or `<channel>:<name>`. */
const PLUGIN_ID = /^[a-z][a-z0-9-]{0,15}[.:][a-z0-9-]{1,48}$/

const error = (text: string): CommandResultLike => ({ kind: 'error', text })

export interface LoopsCommandDeps {
  readonly store: LoopStore
  /** The ids of the entries the plugins handed over: they can be looked at and not deleted. */
  readonly pluginIds: () => ReadonlySet<string>
  readonly now: () => number
  /** Settle the project's files and make its view, as the page gets it; undefined when the files cannot be read. */
  readonly view: () => Promise<LoopsView | undefined>
}

/** A proposal as the command reads it, with the write the person's decision asks for. */
export interface ProposalDeps {
  /** The proposals the record holds, by id. */
  readonly proposals: () => ReadonlyMap<string, LoopProposal>
  /** One decision of the person's, through the store's `apply`. */
  readonly decide: (mutation: { readonly op: 'proposal-show' | 'proposal-accept' | 'proposal-reject', readonly id: string, readonly by: 'human', readonly reason?: string }) => Promise<ApplyResult>
}

/** `/loops accept <lp-id>`: the person's word that a board proposal be so. A proposal with text to read (a script or a check) is shown whole the first time and takes effect on the second `accept` within 30 minutes: the person sees the text in the command's own reply, not in what an agent said about it (design §7.1 end). */
async function acceptProposal(id: string, held: LoopProposal, deps: LoopsCommandDeps & ProposalDeps): Promise<CommandResultLike> {
  if (held.image.via !== 'board') return error('这条提议在项目图上交给人：在对话里同意就行，不用打命令')
  const shown = held.image.shownAt === undefined ? Number.NaN : Date.parse(held.image.shownAt)
  if (held.image.detail !== undefined && !(deps.now() - shown <= SHOWN_VALID_MS)) {
    const showing = await deps.decide({ op: 'proposal-show', id, by: 'human' })
    if (!showing.ok) return error(showing.message)
    return { kind: 'success', text: `${held.image.describe}\n\n${held.image.detail.markdown}\n\n这条提议还没有生效。看过了，30 分钟内再打一次 /loops accept ${id} 才生效；不要就打 /loops reject ${id}。` }
  }
  const done = await deps.decide({ op: 'proposal-accept', id, by: 'human' })
  if (!done.ok) return error(done.message)
  if (done.changed === false) return { kind: 'success', text: `提议 ${id} 已经生效过了，没有改动。` }
  if (held.image.kind === 'delete') return { kind: 'success', text: `已删掉提议里的 ${held.image.entries?.length ?? 0} 项${fileNote(done)}` }
  return { kind: 'success', text: `已加上「${done.title ?? id}」${nextSuffix(done, deps)}${fileNote(done)}` }
}

/** `/loops reject <lp-id>`: the person's word that a board proposal not be. */
async function rejectProposal(id: string, held: LoopProposal, deps: LoopsCommandDeps & ProposalDeps): Promise<CommandResultLike> {
  if (held.image.via !== 'board') return error('这条提议在项目图上交给人：在对话里说不要就行，不用打命令')
  const done = await deps.decide({ op: 'proposal-reject', id, by: 'human', reason: `人用 /loops reject 否掉了提议 ${id}` })
  if (!done.ok) return error(done.message)
  return { kind: 'success', text: '这条提议不加了。' }
}

/** 下次 <时刻>, from the entry an accept wrote (a delete has none). */
function nextSuffix(result: Extract<ApplyResult, { ok: true }>, deps: { readonly now: () => number }): string {
  return result.entry === undefined ? '' : nextText(result.entry, deps.now())
}

/** The entry a name or an id points at among the person's own: an id first, then a title that is the same after the ends are trimmed. */
function resolve(entries: readonly BoardEntry[], argument: string, pluginIds: ReadonlySet<string>): { readonly id: string } | { readonly text: string } {
  const mine = entries.filter(entry => entry.status.kind !== 'deleted')
  const byId = entries.find(entry => entry.id === argument)
  if (byId !== undefined) return { id: byId.id }
  const named = mine.filter(entry => entry.title.trim() === argument)
  if (named.length === 1 && named[0] !== undefined) return { id: named[0].id }
  if (named.length > 1) return { text: `有 ${named.length} 项叫「${argument}」，先不删。它们的 id：${named.map(entry => entry.id).join('、')}；按 id 再打一次` }
  if (pluginIds.has(argument) || PLUGIN_ID.test(argument)) return { text: '插件带来的条目只能看，删不掉' }
  return { text: PERSON_ID.test(argument) ? `这个项目里没有「${argument}」这一项` : `这个项目里没有叫「${argument}」的一项（只找你自己加的）` }
}

/** What the person is told about the files, besides what was done. */
function fileNote(result: Extract<ApplyResult, { ok: true }>): string {
  if (result.file === 'deferred') return '（git 正在合并、变基或占着索引，文件等它做完再写）'
  if (result.file === 'failed') return '（文件这次没写成，下一次读时会补上）'
  return ''
}

function nextText(entry: PersonEntry | undefined, now: number): string {
  if (entry === undefined) return ''
  const next = nextOccurrence(entry.when, new Date(now), Intl.DateTimeFormat().resolvedOptions().timeZone)
  return next === undefined ? '' : `，下次 ${momentText(next)}`
}

/** One entry as a line of the list (design §7.2): 名字 · 什么时候 · 上次 · 下次, and why it does not run when it does not. */
function entryLine(entry: ViewEntry): string {
  const stopped = entry.state === 'waiting' || (entry.source === 'person' && entry.state !== 'ok') ? ' · 现在不跑' : ''
  return `· ${entry.title} · ${entry.when} · ${runLine(entry)}${stopped}`
}

/**
 * The whole board as lines (design §7.2): the plugins' entries, then the
 * person's with how to change and delete them, the ones deleted in the last
 * 7 days with how to get them back, how many things wait, and the quota
 * judgment with the moment it was read at (task-7). A title never carries
 * its id: ids appear only where a command needs one, in the line of the
 * person's ids and in the restore line of a deleted entry.
 */
function listText(view: LoopsView): string {
  const plugin = view.entries.filter(entry => entry.source === 'plugin')
  const person = view.entries.filter(entry => entry.source === 'person' && entry.state !== 'deleted')
  const deleted = view.entries.filter(entry => entry.source === 'person' && entry.state === 'deleted' && entry.note !== undefined)
  const lines = [`插件带来的（${plugin.length} 项，只能看）：`, ...plugin.map(entryLine), `你自己加的（${person.length} 项）：`]
  if (person.length === 0) lines.push('还没有你加的。要加：跟主 Agent 说「每 30 分钟查一下服务器，挂了告诉我」')
  else {
    lines.push(...person.map(entryLine))
    lines.push('要改：跟主 Agent 说「把<名字>改成……」；要删：在输入框打 /loops delete <名字或 id>')
    lines.push(`你加的各项的 id：${person.map(entry => `${entry.id}「${entry.title}」`).join('、')}`)
  }
  for (const entry of deleted) lines.push(`7 天内删掉的「${entry.title}」：打 /loops restore ${entry.id} 能恢复`)
  lines.push(`在等的 ${view.waiting} 件`)
  if (view.quota !== undefined && view.quota.lines.length > 0) lines.push(`额度判定（读于 ${momentText(view.quota.at)}）：`, ...view.quota.lines)
  return lines.join('\n')
}

/** Run one `/loops` line. */
export async function runLoopsCommand(input: string, deps: LoopsCommandDeps & Partial<ProposalDeps>): Promise<CommandResultLike> {
  const line = input.trim()
  const word = /^\S*/.exec(line)?.[0] ?? ''
  const argument = line.slice(word.length).trim()
  if (line === '') {
    const view = await deps.view()
    return view === undefined ? error('循环板的文件这次读不出，原因在循环板这一行的状态里') : { kind: 'success', text: listText(view) }
  }
  if (word === 'ack' && argument === '') {
    const done = await deps.store.apply('human', { op: 'ack' })
    return done.ok ? { kind: 'success', text: '好，这条提示不再显示' } : error(done.message)
  }
  if (word === 'delete' && argument !== '' && [...argument].length <= 60) {
    const found = resolve(deps.store.read().entries, argument, deps.pluginIds())
    if ('text' in found) return error(found.text)
    const done = await deps.store.apply('human', { op: 'delete', entry: found.id })
    return done.ok ? { kind: 'success', text: `已删「${done.title ?? found.id}」；7 天内打 /loops restore ${found.id} 能恢复${fileNote(done)}` } : error(done.message)
  }
  if (word === 'restore' && PERSON_ID.test(argument)) {
    const done = await deps.store.apply('human', { op: 'restore', entry: argument })
    return done.ok ? { kind: 'success', text: `已恢复「${done.title ?? argument}」${nextText(done.entry, deps.now())}${fileNote(done)}` } : error(done.message)
  }
  if ((word === 'accept' || word === 'reject') && PROPOSAL_ID.test(argument)) {
    if (deps.proposals === undefined || deps.decide === undefined) return error('这条提议的拍板这条路还没装上：跟主 Agent 说')
    const held = deps.proposals().get(argument)
    if (held === undefined) return error(`没有提议 ${argument}（可能已经处理过了）。`)
    if (held.image.status !== 'open') return error(`提议 ${argument} 已经 ${held.image.status}，不用再拍板。`)
    return word === 'accept' ? acceptProposal(argument, held, deps as LoopsCommandDeps & ProposalDeps) : rejectProposal(argument, held, deps as LoopsCommandDeps & ProposalDeps)
  }
  return error(USAGE)
}
