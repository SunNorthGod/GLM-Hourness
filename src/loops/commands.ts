/**
 * The `/loops` command (docs/ORCHESTRATION.md §18.7; loop board design §7.2): the
 * person's way to see every entry of the project, to delete one of their
 * entries, to get one back and to acknowledge a damaged change record. Typed
 * in the input box, so the identity is the person's (a slash command is never
 * the model's, §2.10); every change goes through the store's `apply`, which
 * checks it again. A change is answered in one line of plain Chinese; the
 * list is the view the page shows (view.ts), as lines.
 *
 * Built so far: the list, `delete`, `restore` and `ack`. `accept` and
 * `reject` arrive with the proposal path; until then the usage line names
 * what there is.
 */
import type { CommandResultLike } from '../shared/dsh-min.ts'
import type { PersonEntry } from './model.ts'
import type { ApplyResult, BoardEntry, LoopStore } from './store.ts'
import { nextOccurrence } from './trigger.ts'
import { momentText, runLine, type LoopsView, type ViewEntry } from './view.ts'

export const LOOPS_HINT = '不带参数：列出全部 | delete <名字或 id> | restore <id> | ack'
export const NOT_A_PROJECT = '这个会话不在一个 git 项目里，没有循环板'

const USAGE = '用法：/loops（列出全部）、/loops delete <名字或 id>、/loops restore <id>、/loops ack'

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
 * 7 days with how to get them back, and how many things wait. A title never
 * carries its id: ids appear only where a command needs one, in the line of
 * the person's ids and in the restore line of a deleted entry.
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
  return lines.join('\n')
}

/** Run one `/loops` line. */
export async function runLoopsCommand(input: string, deps: LoopsCommandDeps): Promise<CommandResultLike> {
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
  return error(USAGE)
}
