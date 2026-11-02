/**
 * Acceptance for interview-expense-log (prompt.md): from one sentence of the
 * wish to the released design, all of it on the project graph of the
 * workspace (docs/graph/), every step taken with the words of the simulated
 * human (task.json `human`) recorded by record_human_answer. The goal is
 * small ("one file is enough"), so it is released in one go, without
 * modules; the two-level release is checked by interview-expense-log-modules.
 * Usage: see tests/calibration/lib.mjs. The checks both interview tasks share
 * are in ./interview-lib.mjs.
 */
import { checkerArgs, report } from '../lib.mjs'
import { checks, humanWords, metricsOf, need, readInterview, stageEdit } from '../interview-lib.mjs'

const interview = await readInterview(checkerArgs().workspace)
const { goal, nodes } = interview

await report([
  checks.valid(interview),
  checks.goal(interview),
  ['the goal has no feature directly under it: a small tool is released once, not module by module', () => {
    const features = nodes.filter(node => node.type === 'feature' && node.parent === goal?.id)
    return need(goal !== undefined && features.length === 0, features.map(node => node.id).join(','))
  }],
  checks.risk(interview),
  checks.question(interview),
  checks.decision(interview),
  checks.settled(interview),
  ['the goal\'s history has the confirmation and the release with the human\'s words, and the note of what they added', () => {
    const history = goal?.history ?? []
    const approved = history.some(entry => entry.op === 'approve' && humanWords(entry))
    const design = history.some(entry => stageEdit('design', entry) && humanWords(entry))
    const release = history.some(entry => stageEdit('release', entry) && humanWords(entry))
    const added = history.some(entry => entry.op === 'comment' && (entry.text ?? '').startsWith('人在对话里补充：'))
    return need(approved && design && release && added, `approve ${approved}, stage design ${design}, stage release ${release}, note ${added}`)
  }],
  checks.outside(interview),
], { metrics: metricsOf(interview) })