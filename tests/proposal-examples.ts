/**
 * The four worked examples of a question (src/graph/plain-question.ts) in the
 * two shapes the specs need: the fields of the node the graph keeps, and the
 * arguments of a propose_to_human call. The examples are known to pass every
 * rule, so a spec that needs a valid question starts from one.
 */
import { PLAIN_QUESTION_EXAMPLES } from '../src/graph/plain-question.ts'
import { askOf, type AskForm } from '../src/graph/proposal.ts'

/** The fields of a question node in the proposal shape (what propose puts in `node`, besides type and parent). */
export function exampleRecord(form: AskForm): Record<string, unknown> {
  const example = PLAIN_QUESTION_EXAMPLES[form]
  return {
    title: example.title,
    ask: askOf(example.text),
    form,
    proposal: example.proposal ?? example.ways?.at(-1),
    ...example.reason === undefined ? {} : { reason: example.reason },
    ...example.cost === undefined ? {} : { cost: example.cost },
    ...example.ways === undefined ? {} : { ways: example.ways },
    ...example.notTaken === undefined ? {} : { notTaken: example.notTaken },
  }
}

/** The arguments of a propose_to_human call (kind question) for an example. */
export function exampleArgs(form: AskForm): Record<string, unknown> {
  const { title, text, proposal, reason, cost, ways, notTaken, sample } = PLAIN_QUESTION_EXAMPLES[form]
  return {
    kind: 'question',
    form,
    text,
    title,
    ...proposal === undefined ? {} : { proposal },
    ...reason === undefined ? {} : { reason },
    ...cost === undefined ? {} : { cost },
    ...ways === undefined ? {} : { ways },
    ...notTaken === undefined ? {} : { notTaken },
    ...sample === undefined ? {} : { sample },
  }
}
