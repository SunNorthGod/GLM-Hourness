/**
 * The `/loops` command (docs/ORCHESTRATION.md §18.7; loop board design §7.2): the
 * person's way to delete one of their entries, to get one back and to
 * acknowledge a damaged change record. Typed in the input box, so the identity
 * is the person's (a slash command is never the model's, §2.10); every change
 * goes through the store's `apply`, which checks it again. The reply is one
 * line of plain Chinese.
 *
 * Built so far: `delete`, `restore` and `ack`. The list of all entries (with
 * last and next run) arrives with the runner, `accept` and `reject` with the
 * proposal path; until then the usage line names what there is.
 */
import type { CommandResultLike } from '../shared/dsh-min.ts'
import type { PersonEntry } from './model.ts'
import type { ApplyResult, BoardEntry, LoopStore } from './store.ts'
import { nextOccurrence } from './trigger.ts'

export const LOOPS_HINT = 'delete <名字或 id> | restore <id> | ack'
export const NOT_A_PROJECT = '这个会话不在一个 git 项目里，没有循环板'

const USAGE = '用法：/loops delete <名字或 id>、/loops restore <id>、/loops ack'

const PERSON_ID = /^u-[0-9a-f]{8}$/
/** The shape of an id a plugin hands over: `<namespace>.<name>` or `<channel>:<name>`. */
const PLUGIN_ID = /^[a-z][a-z0-9-]{0,15}[.:][a-z0-9-]{1,48}$/

const error = (text: string): CommandResultLike => ({ kind: 'error', text })

export interface LoopsCommandDeps {
  readonly store: LoopStore
  /** The ids of the entries the plugins handed over: they can be looked at and not deleted. */
  readonly pluginIds: () => ReadonlySet<string>
  readonly now: () => number
}

/** `10月31日 08:30` on the clock of this machine. */
function momentText(at: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${at.getMonth() + 1}月${at.getDate()}日 ${pad(at.getHours())}:${pad(at.getMinutes())}`
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

/** Run one `/loops` line. */
export async function runLoopsCommand(input: string, deps: LoopsCommandDeps): Promise<CommandResultLike> {
  const line = input.trim()
  const word = /^\S*/.exec(line)?.[0] ?? ''
  const argument = line.slice(word.length).trim()
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
