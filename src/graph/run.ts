/**
 * Run controls on project graph nodes (docs/ORCHESTRATION.md §2.10
 * 运行控制, m2-9): the rules the panel (ui/src/graph/NodeDetail.tsx) and the
 * host command /graph-run (run-control.ts) share, so a button shows only
 * when the command accepts it. No Node built-ins: the panel imports it.
 */
import { STATUS_LABELS, TYPE_LABELS } from './labels.ts'
import type { FieldChange, GraphNode, HistoryEntry } from './schema.ts'

/** The host command of the run controls, registered by the graph-panel row. */
export const RUN_COMMAND = 'graph-run'

const RUN_ACTIONS = ['start', 'stop', 'redo'] as const
export type RunAction = typeof RUN_ACTIONS[number]

export function isRunAction(value: string): value is RunAction {
  return (RUN_ACTIONS as readonly string[]).includes(value)
}

/** The button of each control, also named in outcomes, history entries and messages. */
export const RUN_LABELS: Readonly<Record<RunAction, string>> = {
  start: '从这里开始做',
  stop: '暂停',
  // True for both cases the button shows in: a done task, and one whose acceptance changed since it was started.
  redo: '按现在的验收条件重做',
}

/** The start of the history entry a control writes on its node as the human. */
export function runNote(action: RunAction): string {
  return `人在面板里点了「${RUN_LABELS[action]}」`
}

/** The redo note under the label used until 2026-10-29; history in existing graphs (m2-9, m2-9-l4) still carries it. */
const EARLIER_REDO_NOTE = '人在面板里点了「改了验收条件后重做」'

/**
 * Why the action cannot run on this node, or undefined. Only tasks have run
 * controls; start needs open work that is not done, redo also takes a done
 * task. Whether an agent stands on the node (stop) only the live view
 * knows.
 */
export function nodeRefusal(node: GraphNode, action: RunAction): string | undefined {
  if (node.type !== 'task') return `${node.id} 是${TYPE_LABELS[node.type]}，运行控制只用于任务`
  if (action === 'stop') return undefined
  if (node.status === 'proposed') return `「${node.title}」还是提议，先批准`
  if (node.status === 'dropped' || node.status === 'superseded') return `「${node.title}」已${STATUS_LABELS[node.status]}`
  if (action === 'start' && node.status === 'done') return `「${node.title}」已经完成；要再做一遍，用「${RUN_LABELS.redo}」`
  return undefined
}

/** A start or redo the panel sent: the human entry it wrote begins with the note (a redo of a done task writes it as the status reason). */
function isRunEntry(entry: HistoryEntry): boolean {
  if (entry.actor !== 'human') return false
  const text = entry.op === 'comment' ? entry.text : entry.op === 'status' ? entry.reason : undefined
  return text !== undefined && [runNote('start'), runNote('redo'), EARLIER_REDO_NOTE].some(note => text.startsWith(note))
}

/** The acceptance change since the latest start or redo from the panel: the old value of the first edit, the new value of the last. */
export function acceptanceChange(node: GraphNode): FieldChange | undefined {
  const edits: FieldChange[] = []
  for (let index = node.history.length - 1; index >= 0; index--) {
    const entry = node.history[index]
    if (isRunEntry(entry)) break
    const change = entry.changes?.acceptance
    if (change !== undefined) edits.unshift(change)
  }
  const first = edits[0]
  const last = edits.at(-1)
  return first === undefined || last === undefined ? undefined : { from: first.from, to: last.to }
}

/** The panel offers a redo on a done task, and on one in progress whose acceptance changed since it was last started. */
export function offersRedo(node: GraphNode): boolean {
  if (nodeRefusal(node, 'redo') !== undefined) return false
  return node.status === 'done' || (node.status === 'doing' && acceptanceChange(node) !== undefined)
}
