/**
 * The worked example at the end of `dispatch_task`'s description (M7 design
 * 0.6 §3.1.5, decision d-agent-examples): one task node with its dispatch
 * attributes, one call, and the summary the harness returns, over a subject
 * no exercise touches (a static blog's subscription feed; the model id is
 * made up — no orchestration file names a real model). Every claim the
 * example makes is something already decided: the main agent names the model
 * and says why, the review depth is declared at dispatch with a reason when
 * it is not full, the write scope is directories so a plan is required, and
 * the fields of the returned summary are §3.1.1's. It says nothing about how
 * the main agent should judge which model fits which task. The example
 * satisfies the same checks as a real call, so an outdated example fails
 * tests/execute-examples.spec.ts.
 */
import { digest12 } from './digest.ts'

/** The task node of the example, as the graph holds it (§3.1.5's first block). */
export interface ExampleTask {
  readonly id: 'task-12'
  readonly kind: 'implement'
  readonly writeScope: readonly ['site/feed/']
  readonly acceptance: readonly [
    'site/feed/rss.xml lists the 20 newest posts, newest first',
    'every item has a title, a link and a publication date',
  ]
  readonly nonGoals: readonly ['no Atom feed']
}

/** The `dispatch_task` arguments of the example, as the call carries them. */
export interface ExampleCall {
  readonly id: 'task-12'
  readonly model: 'example-model-large'
  readonly why: 'touches one directory and has a check that can be run'
  readonly review: { readonly depth: 'light', readonly why: 'adds one new file and changes no existing behaviour' }
  readonly context: 'The post list is built in site/build.mjs; reuse its date helper.'
}

/** The example's task node. */
export const EXAMPLE_TASK: ExampleTask = {
  id: 'task-12',
  kind: 'implement',
  writeScope: ['site/feed/'],
  acceptance: [
    'site/feed/rss.xml lists the 20 newest posts, newest first',
    'every item has a title, a link and a publication date',
  ],
  nonGoals: ['no Atom feed'],
}

/** The example's call. */
export const EXAMPLE_CALL: ExampleCall = {
  id: 'task-12',
  model: 'example-model-large',
  why: 'touches one directory and has a check that can be run',
  review: { depth: 'light', why: 'adds one new file and changes no existing behaviour' },
  context: 'The post list is built in site/build.mjs; reuse its date helper.',
}

/** The first line names the subject and the made-up model id. */
const EXAMPLE_HEADING = 'Example (a static blog; the model id is made up, take yours from the model list in the dispatch notice).'

/** The sentence beside the example: the reason shows its size, not a choice. */
export const EXAMPLE_WHY_NOTE = 'The reason is yours to write; this one only shows its size.'

/** The cap on the example block inside the description (§3.1.5), counted in characters. */
export const EXAMPLE_LIMIT = 1400

/** The child id, attempt, brief digest and plan of the example's returned summary: one fixed dispatch. */
const EXAMPLE_SUMMARY = {
  task: EXAMPLE_CALL.id,
  attempt: 1,
  childId: 'hz-task-12-a1-k3x9ab',
  role: 'worker',
  worktree: '.worktrees/hz-task-12',
  branch: 'hz/task-12',
  provider: 'example',
  model: EXAMPLE_CALL.model,
  review: EXAMPLE_CALL.review.depth,
  brief: digest12(`${EXAMPLE_TASK.id} ${EXAMPLE_CALL.id}`),
  plan: 'required',
}

/**
 * The example block: heading, the task node in one sentence, the call as
 * JSON, the returned summary as JSON, and the note beside it. Building it
 * from the three parts above keeps the JSON, the node and the summary one
 * source; the digest is the real digest rule over a fixed text.
 */
export const DISPATCH_EXAMPLE: string = [
  EXAMPLE_HEADING,
  `Task ${EXAMPLE_TASK.id} is approved: kind "${EXAMPLE_TASK.kind}", writeScope [${EXAMPLE_TASK.writeScope.map(path => `"${path}"`).join(', ')}], acceptance [${EXAMPLE_TASK.acceptance.map(item => `"${item}"`).join(', ')}], nonGoals [${EXAMPLE_TASK.nonGoals.map(item => `"${item}"`).join(', ')}]. Its goal is released and nothing it depends on is open.`,
  `dispatch_task ${JSON.stringify(EXAMPLE_CALL)}`,
  `Returns ${JSON.stringify(EXAMPLE_SUMMARY)}`,
  EXAMPLE_WHY_NOTE,
].join('\n')

/**
 * The description of `dispatch_task`: what the tool does and refuses, then
 * the worked example. The row and the spec both build the text through this
 * function, so a change to one without the other fails the spec.
 */
export function dispatchDescription(): string {
  if ([...DISPATCH_EXAMPLE].length > EXAMPLE_LIMIT) {
    throw new Error(`the dispatch example is ${[...DISPATCH_EXAMPLE].length} characters, over the ${EXAMPLE_LIMIT} limit`)
  }
  return [
    'Dispatch one task of the project graph to a subagent that does it: a write task, a review task, or the design review of a module (pass the module id). The harness checks the call against the graph, builds the worktree and the brief, starts the subagent on the model you name, and returns the child id. You must say which model and why: there is no default. Review depth is declared here for a write task (full by default; light and skip need a reason). A task that needs the person first refuses; fix what the reason names and send it again.',
    DISPATCH_EXAMPLE,
  ].join('\n')
}
