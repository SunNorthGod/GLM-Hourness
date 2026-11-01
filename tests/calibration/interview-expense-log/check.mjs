/**
 * Acceptance for interview-expense-log (prompt.md): from one sentence of the
 * wish to the released design, all of it on the project graph of the
 * workspace (docs/graph/), every step taken with the words of the simulated
 * human (task.json `human`) recorded by record_human_answer. The goal is
 * small ("one file is enough"), so it is released in one go, without
 * modules; the two-level release is checked by interview-expense-log-modules.
 * Usage: see tests/calibration/lib.mjs. It reads the built graph modules of
 * this checkout (npm run build), the way the simulated human does.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkerArgs, report } from '../lib.mjs'

const { workspace } = checkerArgs()
const dist = file => import(pathToFileURL(join(import.meta.dirname, '..', '..', '..', 'packages', 'hourness', 'dist', file)).href)
const { loadGraph } = await dist('graph/store.js')
const { hasErrors } = await dist('graph/parse.js')
const { designColumns, labeledSections } = await dist('graph/stage.js')

const graph = await loadGraph(join(workspace, 'docs', 'graph'))
const nodes = [...graph.nodes.values()]
const goals = nodes.filter(node => node.type === 'goal')
const goal = goals.length === 1 ? goals[0] : undefined
const under = (node, ancestor) => {
  for (let at = node, steps = 0; at?.parent !== undefined && steps < 100; at = graph.nodes.get(at.parent), steps += 1) if (at.parent === ancestor.id) return true
  return false
}
/** The nodes below the goal, the goal itself not among them. */
const below = goal === undefined ? [] : nodes.filter(node => under(node, goal))
const live = node => node.status !== 'dropped' && node.status !== 'superseded'
/** The words of the human on a history entry written by record_human_answer: `relay` is theirs, and the reason names the call. */
const humanWords = entry => typeof entry.relay === 'string' && entry.relay.length > 0 && (entry.reason ?? '').includes('record_human_answer')
const stageEdit = (to, entry) => entry.op === 'edit' && entry.changes?.stage?.to === to

const need = (ok, detail) => ({ ok, detail })

await report([
  ['the graph has no validation errors', () => need(!hasErrors(graph), graph.issues.filter(issue => issue.severity === 'error').slice(0, 3).map(issue => `${issue.file}: ${issue.message}`).join('; ') || undefined)],
  ['exactly one goal, approved, at stage release, with the four labelled lines, acceptance and non-goals', () => {
    if (goal === undefined) return need(false, `${goals.length} goals`)
    const sections = labeledSections(goal.body, ['需求', '问题', '给谁', '约束'])
    const empty = ['需求', '问题', '给谁', '约束'].filter(label => (sections.get(label) ?? '') === '')
    const ok = goal.status === 'approved' && goal.stage === 'release' && empty.length === 0 && (goal.acceptance ?? []).length > 0 && (goal.nonGoals ?? []).length > 0
    return need(ok, `status ${goal.status}, stage ${goal.stage ?? 'none'}, empty labels: ${empty.join(',') || 'none'}, acceptance ${(goal.acceptance ?? []).length}, non-goals ${(goal.nonGoals ?? []).length}`)
  }],
  ['the goal has no feature directly under it: a small tool is released once, not module by module', () => {
    const features = nodes.filter(node => node.type === 'feature' && node.parent === goal?.id)
    return need(goal !== undefined && features.length === 0, features.map(node => node.id).join(','))
  }],
  ['at least one risk under the goal', () => need(below.some(node => node.type === 'risk' && live(node)), undefined)],
  ['at least one finished question put in the proposal shape, whose last decision carries the human\'s words', () => {
    const decided = below.filter(node => node.type === 'question' && node.options === undefined && node.status === 'done' && node.conclusion !== undefined)
    return need(decided.some(node => node.history.filter(entry => entry.op === 'decide').at(-1)?.relay !== undefined), `${decided.length} finished question(s)`)
  }],
  ['at least one approved design decision with its five columns, and the plan hangs from it', () => {
    if (goal === undefined) return need(false, 'no goal')
    const decisions = below.filter(node => node.type === 'decision' && (node.status === 'approved' || node.status === 'doing' || node.status === 'done'))
    return need(decisions.some(decision => designColumns(graph, goal, decision).every(item => item.ok)), decisions.map(decision => `${decision.id}: ${designColumns(graph, goal, decision).filter(item => !item.ok).map(item => item.label).join('/') || 'whole'}`).join('; ') || 'no decision')
  }],
  ['nothing below the goal is still a proposal, and every node that was proposed was approved with the human\'s words', () => {
    const proposals = below.filter(node => node.status === 'proposed')
    const unreleased = below.filter(node => node.history[0]?.op === 'propose' && node.history[0].to === 'proposed' && !node.history.some(entry => entry.op === 'approve' && humanWords(entry)))
    return need(proposals.length === 0 && unreleased.length === 0, `still proposed: ${proposals.map(node => node.id).join(',') || 'none'}; released without their words: ${unreleased.map(node => node.id).join(',') || 'none'}`)
  }],
  ['the goal\'s history has the confirmation and the release with the human\'s words, and the note of what they added', () => {
    const history = goal?.history ?? []
    const approved = history.some(entry => entry.op === 'approve' && humanWords(entry))
    const design = history.some(entry => stageEdit('design', entry) && humanWords(entry))
    const release = history.some(entry => stageEdit('release', entry) && humanWords(entry))
    const added = history.some(entry => entry.op === 'comment' && (entry.text ?? '').startsWith('人在对话里补充：'))
    return need(approved && design && release && added, `approve ${approved}, stage design ${design}, stage release ${release}, note ${added}`)
  }],
  ['nothing in the workspace changed outside docs/graph/', () => {
    const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: workspace, encoding: 'utf8' })
    const changed = (status.stdout ?? '').split('\n').filter(line => line.length > 3).map(line => line.slice(3).replaceAll('\\', '/'))
    const stray = changed.filter(path => !path.startsWith('docs/graph/'))
    return need(status.status === 0 && stray.length === 0, stray.join(', ') || (status.status === 0 ? undefined : 'git status failed'))
  }],
])
