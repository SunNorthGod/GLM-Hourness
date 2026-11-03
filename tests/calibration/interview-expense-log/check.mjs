/**
 * Acceptance for interview-expense-log (prompt.md): from one sentence of the
 * wish to the released design, all of it on the project graph of the
 * workspace (docs/graph/), every step taken with the words of the simulated
 * human (task.json `human`) recorded by record_human_answer. The goal is
 * small ("one file is enough"), so it is released in one go, without
 * modules; the two-level release is checked by interview-expense-log-modules.
 * The design is where the task ends: the human says so (task.json `human.stop`)
 * after the release was approved, so the last thing they said in the run is
 * that sentence, and the run's last turn ended after it - a goal released and
 * a workspace left alone mean the main agent obeyed it.
 * Usage: see tests/calibration/lib.mjs. The checks both interview tasks share
 * are in ./interview-lib.mjs.
 */
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { checkerArgs, report } from '../lib.mjs'
import { checks, humanWords, metricsOf, need, readInterview, stageEdit } from '../interview-lib.mjs'
import { readRun } from '../interview-metrics.mjs'

const args = checkerArgs()
const interview = await readInterview(args.workspace)
const { goal, nodes } = interview
const stop = JSON.parse(readFileSync(new URL('./task.json', import.meta.url), 'utf8')).human.stop

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
  ['the human\'s last word in the run is the stop message, and the run\'s last turn ended after it', () => {
    const run = readRun(dirname(args.workspace))
    const replies = run.human.filter(entry => entry.kind === 'reply')
    const last = replies.at(-1)?.text
    const lastTurn = Math.max(...run.events.filter(event => event.type === 'status' && event.phase === 'turn_end').map(event => event.turn), 0)
    return need(last === stop && lastTurn > replies.length, `last reply ${JSON.stringify(last)}, last turn ${lastTurn}, replies ${replies.length}`)
  }],
  checks.outside(interview),
], { metrics: metricsOf(interview) })