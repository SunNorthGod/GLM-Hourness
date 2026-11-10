/**
 * Where the two things only the human can say stand (takeover design 0.6
 * §5.4, §7.7), read off the graph. Pure. A takeover asks a thing when its
 * norm is not on the graph yet or was first proposed since the takeover
 * opened (a gaps takeover asks only for the norms it fills). The question
 * of a thing is a proposal question whose body ends with the takeover's
 * attach line (src/bootstrap/service.ts); the answer is written into the
 * norm's label, so a label that no longer holds the template's placeholder
 * is the answer, whoever wrote it (the relay rule checked their words).
 */
import type { LoadedGraph } from '../graph/parse.ts'
import type { GraphNode } from '../graph/schema.ts'
import { labeledSections } from '../graph/stage.ts'
import { proposedSinceOpen } from './gaps.ts'
import { THING_LABELS, type ThingState } from './notice.ts'
import type { Thing } from './present.ts'
import { takeoverAttachOf } from './service.ts'
import type { OpenTakeover } from './takeover.ts'
import { NORM_TEMPLATES, PLACEHOLDERS } from './templates.ts'
import { touchPaths } from './touch.ts'

const THINGS: readonly Thing[] = ['cost', 'touch']

/** The labels of a norm template's body (a line that starts with a name and a full-width colon): a label's value runs to the next of them. */
const TEMPLATE_LABELS: ReadonlyMap<string, readonly string[]> = new Map(NORM_TEMPLATES.map(template => [
  template.id,
  template.body.split('\n').flatMap(line => /^([^：\n]+)：/.exec(line)?.[1] ?? []),
]))

/** The attach of one thing of one takeover, as propose_to_human takes it. */
const thingAttach = (takeoverId: string, thing: Thing): string => `bootstrap:${takeoverId}:${thing}`

/** The value of a thing's label in its norm, up to the next label of the template; undefined when the norm or the label is not there. */
function labelValue(graph: LoadedGraph, thing: Thing): string | undefined {
  const { label, norm } = THING_LABELS[thing]
  return labeledSections(graph.nodes.get(norm)?.body, TEMPLATE_LABELS.get(norm) ?? [label]).get(label)
}

/** Whether the label holds an answer: there, not empty, and not the template's placeholder. */
const answered = (value: string | undefined, thing: Thing): boolean => value !== undefined && value.trim() !== '' && value.trim() !== PLACEHOLDERS[thing]

/** The things a takeover asks: those whose norm is missing or was proposed since it opened. */
export function thingsAsked(graph: LoadedGraph, takeover: Pick<OpenTakeover, 'openedAt'>): Thing[] {
  return THINGS.filter((thing) => {
    const norm = THING_LABELS[thing].norm
    return !graph.nodes.has(norm) || proposedSinceOpen(graph, norm, takeover.openedAt)
  })
}

/** The questions on the graph that carry one thing of the takeover, not dropped or superseded. */
function questionsOf(graph: LoadedGraph, takeoverId: string, thing: Thing): GraphNode[] {
  const attach = thingAttach(takeoverId, thing)
  return [...graph.nodes.values()].filter(node => node.type === 'question' && node.status !== 'dropped' && node.status !== 'superseded' && takeoverAttachOf(node.body) === attach)
}

/** Where one thing stands (notice.ts ThingState). */
function thingState(graph: LoadedGraph, takeoverId: string, thing: Thing): ThingState {
  if (!graph.nodes.has(THING_LABELS[thing].norm)) return 'wait'
  if (answered(labelValue(graph, thing), thing)) return 'done'
  const questions = questionsOf(graph, takeoverId, thing)
  if (questions.some(node => node.status === 'done')) return 'write'
  return questions.length > 0 ? 'pending' : 'ask'
}

/** Where every thing the takeover asks stands. */
export function thingStates(graph: LoadedGraph, takeover: Pick<OpenTakeover, 'id' | 'openedAt'>): Partial<Record<Thing, ThingState>> {
  return Object.fromEntries(thingsAsked(graph, takeover).map(thing => [thing, thingState(graph, takeover.id, thing)]))
}

/** The repository paths of 不许碰 once the human's answer is written there; none before. */
export function touchInside(graph: LoadedGraph): readonly string[] {
  const value = labelValue(graph, 'touch')
  return answered(value, 'touch') ? touchPaths(value ?? '').inside : []
}

const STATE_WORDS: Readonly<Record<ThingState, string>> = {
  wait: '规范还没上图，下一步问你',
  ask: '还没问你',
  pending: '在等你回话',
  write: '你说了，主 Agent 还没记进规范',
  done: '你说了，已记进规范',
}

/** One line per thing for `/hourness-init status` (§7.7, the rows of the two things). */
export function thingLines(states: Partial<Readonly<Record<Thing, ThingState>>>): string[] {
  return THINGS.flatMap(thing => states[thing] === undefined ? [] : [`${THING_LABELS[thing].label}：${STATE_WORDS[states[thing]]}`])
}
