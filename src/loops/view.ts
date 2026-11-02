/**
 * What the loop board shows of a project (docs/ORCHESTRATION.md §18.7; loop board
 * design §8.4, §9.3): one `view.json` in the project's `.llm/loops/`, written by
 * the host that runs the board, so the page (and `/loops`) shows the same
 * thing the board judges by. It lists every entry, the plugins' and the
 * person's, with the state the board holds it in, and the things a person is to
 * look at, each as the sentence the page shows.
 *
 * Only types and pure functions; no Node built-in, so the page can import it.
 * The runtime parts that come with the runner (last and next run, what waits,
 * recent runs) are added to the view when the runner exists; none is guessed here.
 */
import type { LoopsRegistry } from './registry.ts'
import type { BoardEntry, BoardRead } from './store.ts'

interface ViewEntry {
  readonly id: string
  readonly title: string
  readonly source: 'plugin' | 'person'
  /** A plugin's: `active` or `waiting`; a person's: the state the board holds the entry file in (`ok`, `owed`, `outside`, `not-in-checkout`, `unreadable`, `unadopted`, `deleted`). */
  readonly state: string
  /** The sentence to show beside the state, when there is one. */
  readonly note?: string
}

/**
 * What the view says about the GLM peak (design §8.2 item 3, §6.9 item 3):
 * whether it is peak now and when it turns, from the pricing service the
 * board reads its channel events from, and the level, from the rules board's
 * service (`stateForProject`) — never from the rules board's files. A level
 * the rules board cannot read for this project says where to look instead.
 */
export interface PeakView {
  /** Whether it is peak now; undefined when the clock cannot be read. */
  readonly now: boolean | undefined
  /** ISO 8601: the end of this peak, or the start of the next one. */
  readonly until?: string
  /** The level's name (无影响/少做/不做), or 「档位在规则板上看」. */
  readonly level: string
  /** `default`: the factory level stands, the project never chose; `human`: the person chose it. Undefined with the fallback level. */
  readonly origin?: 'default' | 'human'
  /** The reduce level's cap line, while it is peak. */
  readonly cap?: string
}

export interface LoopsView {
  readonly version: 1
  /** ISO time the view was made. */
  readonly at: string
  /** The project's key (src/graph/main-agent-holder.ts projectKey). */
  readonly project: string
  readonly entries: readonly ViewEntry[]
  /** What the person is to look at, one sentence each. */
  readonly attention: readonly string[]
  /** The GLM peak as it stands; absent while this host has no pricing service at all (no peak to show, design §5.2). */
  readonly peak?: PeakView
}

/** One thing the person is to look at; `degrades` says it also degrades the row's health, since it stops an entry or the record from being trusted. */
interface Attention {
  readonly text: string
  readonly degrades: boolean
}

function restoreHint(entry: BoardEntry): string {
  return entry.restorable ? `：打 /loops restore ${entry.id}` : `：跟主 Agent 说「从 git 里恢复 docs/loops/entries/${entry.id}.json」`
}

/** The sentence about one entry, when its state needs the person's eye (design §9.3 last column). */
function noteOf(entry: BoardEntry, git: string | undefined): Attention | undefined {
  const quoted = `「${entry.title}」`
  switch (entry.status.kind) {
    case 'outside': return { text: `${quoted}的条目文件在循环板之外被改过，先不跑`, degrades: true }
    case 'not-in-checkout': return { text: `${quoted}在当前检出里没有（切了分支、回退或被 git 删了）：要接着用，在输入框打 /loops restore ${entry.id}`, degrades: false }
    case 'unreadable': return { text: `${quoted}的条目文件读不出，先不跑${restoreHint(entry)}`, degrades: true }
    case 'unadopted': return { text: `${quoted}在这台电脑上没有你同意的记录，先不跑`, degrades: false }
    case 'owed': return { text: git === undefined ? `${quoted}的条目文件待写回` : `${quoted}的条目文件待写回（git 正在合并或变基）`, degrades: false }
    default: return undefined
  }
}

/** Everything about a project's board that the person is to look at. */
export function attentionOf(board: BoardRead): readonly Attention[] {
  const notes = board.entries.flatMap(entry => noteOf(entry, board.git) ?? [])
  const lines = board.journal.unacknowledged
  return lines.length === 0
    ? notes
    : [...notes, { text: `变更记录第 ${lines.join('、')} 行读不出，已跳过；涉及的那一项按之后的记录显示。知道了就在输入框打 /loops ack`, degrades: true }]
}

/** The view of a project. `board` is undefined when the project's files could not be read; `peak` is absent while the host has no pricing service. */
export function buildView(input: { readonly at: string, readonly project: string, readonly plugin: ReturnType<LoopsRegistry['entries']>, readonly board: BoardRead | undefined, readonly peak?: PeakView }): LoopsView {
  const plugin = input.plugin.map((item): ViewEntry => ({
    id: item.entry.id,
    title: item.entry.title,
    source: 'plugin',
    state: item.state,
    ...(item.reason === undefined ? {} : { note: item.reason }),
  }))
  const person = (input.board?.entries ?? []).map((entry): ViewEntry => {
    const note = entry.status.kind === 'deleted' && entry.restorable ? `要恢复：在输入框打 /loops restore ${entry.id}` : undefined
    return { id: entry.id, title: entry.title, source: 'person', state: entry.status.kind, ...(note === undefined ? {} : { note }) }
  })
  return {
    version: 1,
    at: input.at,
    project: input.project,
    entries: [...plugin, ...person],
    attention: input.board === undefined ? [] : attentionOf(input.board).map(item => item.text),
    ...(input.peak === undefined ? {} : { peak: input.peak }),
  }
}
