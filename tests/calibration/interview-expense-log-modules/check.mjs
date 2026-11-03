/**
 * Acceptance for interview-expense-log-modules (prompt.md): the same small
 * tool and the same wish as interview-expense-log, but the answers say the
 * work is two parts done one after the other, so the goal is split into two
 * modules and released in two levels (docs/ORCHESTRATION.md §4.9): the
 * framework, the module list and the directions once, then each module with
 * its own one-page note. All of it is on the project graph of the workspace
 * (docs/graph/), every step taken with the words of the simulated human
 * (task.json `human`) recorded by record_human_answer. A baseline, not a
 * condition to pass: the run counts how often each model gets it right.
 * Usage: see tests/calibration/lib.mjs. The checks both interview tasks share
 * are in ./interview-lib.mjs.
 */
import { checkerArgs, report } from '../lib.mjs'
import { checks, humanWords, metricsOf, need, readInterview, stageEdit } from '../interview-lib.mjs'

const interview = await readInterview(checkerArgs().workspace)
const { goal, graph, nodes } = interview

/** The modules of the goal: its direct features that carry a stage. */
const modules = nodes.filter(node => node.type === 'feature' && node.parent === goal?.id && node.stage !== undefined)
/** The last write that set the stage of a node to release, with the human's words, or undefined. */
const releaseOf = node => node?.history.filter(entry => stageEdit('release', entry) && humanWords(entry)).at(-1)
/** The page of a release is named by the digest at the end of the reason: the first 8 hexadecimal characters of its hash. */
const digested = entry => / · 一页放行稿 [0-9a-f]{8}$/.test(entry?.reason ?? '')
const approvedAt = node => node.history.filter(entry => entry.op === 'approve' && humanWords(entry)).map(entry => Date.parse(entry.at)).at(-1)

await report([
  checks.valid(interview),
  checks.goal(interview),
  ['the goal has two modules directly under it, approved and at stage release', () => need(modules.length === 2 && modules.every(module => module.status === 'approved' && module.stage === 'release'), modules.map(module => `${module.id}: ${module.status}, ${module.stage}`).join('; ') || 'no module')],
  checks.risk(interview),
  checks.question(interview),
  checks.decision(interview),
  checks.settled(interview),
  ['the goal\'s history has the confirmation and the release of the framework with the human\'s words, and the release carries the digest of the page', () => {
    const history = goal?.history ?? []
    const approved = history.some(entry => entry.op === 'approve' && humanWords(entry))
    const design = history.some(entry => stageEdit('design', entry) && humanWords(entry))
    const release = releaseOf(goal)
    return need(approved && design && release !== undefined && digested(release), `approve ${approved}, stage design ${design}, stage release ${release !== undefined}, digest ${digested(release)}`)
  }],
  ['the directions are approved, and hold at least one direction', () => {
    const directions = graph.nodes.get('norm-directions')
    return need(directions?.status === 'approved' && (directions.acceptance ?? []).length > 0, `${directions?.status ?? 'missing'}, ${(directions?.acceptance ?? []).length} direction(s)`)
  }],
  ['each module is released with the human\'s words and the digest of its page', () => need(modules.length > 0 && modules.every(module => digested(releaseOf(module))), modules.map(module => `${module.id}: ${releaseOf(module) === undefined ? 'no release' : digested(releaseOf(module)) ? 'released' : 'no digest'}`).join('; ') || 'no module')],
  ['the release of the framework comes before the release of any module', () => {
    const framework = Date.parse(releaseOf(goal)?.at ?? '')
    const first = Math.min(...modules.map(module => Date.parse(releaseOf(module)?.at ?? '')))
    return need(Number.isFinite(framework) && Number.isFinite(first) && framework <= first, `framework ${releaseOf(goal)?.at ?? 'none'}, first module ${Number.isFinite(first) ? new Date(first).toISOString() : 'none'}`)
  }],
  ['no module is released before its own design decisions are approved', () => {
    const late = modules.filter((module) => {
      const released = Date.parse(releaseOf(module)?.at ?? '')
      const decisions = nodes.filter(node => node.type === 'decision' && node.parent === module.id)
      return !Number.isFinite(released) || decisions.length === 0 || decisions.some(decision => !(approvedAt(decision) <= released))
    })
    return need(modules.length > 0 && late.length === 0, late.map(module => module.id).join(',') || (modules.length === 0 ? 'no module' : undefined))
  }],
  checks.outside(interview),
], { metrics: metricsOf(interview) })