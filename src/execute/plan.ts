/**
 * Plans (M7 design 0.6 §3.3): the check a worker's plan must pass before the
 * main agent sees it, the plan section the harness keeps in the task body,
 * its digest, and the approval comment that makes an approved plan carry
 * over to later dispatches of the same task. Pure functions.
 *
 * `checkPlan` takes the tool argument as `unknown`: the runtime does not
 * validate the arguments of a tool registered as it is (§6.4), the tool body
 * does.
 */
import type { GraphNode } from '../graph/schema.ts'
import { digest12 } from './digest.ts'
import { isScopePath, within } from './scope.ts'

const PLAN_VERIFY_LEVELS = ['L1', 'L2', 'L3', 'L4-batch'] as const
type PlanVerify = typeof PLAN_VERIFY_LEVELS[number]

const PLAN_LIMITS = { minSteps: 1, maxSteps: 12, notes: 2000 } as const

interface PlanStep {
  readonly title: string
  readonly paths: readonly string[]
  readonly acceptance: readonly string[]
  /** Which acceptance items of the task the step covers, counted from 0. */
  readonly covers: readonly number[]
  readonly verify: PlanVerify
  readonly commands: readonly string[]
}

export interface Plan {
  readonly steps: readonly PlanStep[]
  readonly notes?: string
}

export type PlanCheck =
  | { readonly ok: true, readonly plan: Plan }
  | { readonly ok: false, readonly problems: readonly string[] }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function stringList(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every(entry => typeof entry === 'string') ? value : undefined
}

function checkStep(value: unknown, number: number, task: Pick<GraphNode, 'acceptance' | 'writeScope'>, problems: string[]): PlanStep | undefined {
  const at = `step ${number}`
  if (!isRecord(value)) {
    problems.push(`${at}: must be an object`)
    return undefined
  }
  const before = problems.length
  const { title, paths, acceptance, covers, verify, commands } = value
  if (typeof title !== 'string' || title.trim() === '' || /[\r\n]/.test(title)) problems.push(`${at}: title must be one non-empty line`)
  const pathList = stringList(paths)
  if (pathList === undefined) problems.push(`${at}: paths must be a list of strings`)
  const scope = task.writeScope ?? []
  for (const entry of pathList ?? []) {
    if (!isScopePath(entry)) problems.push(`${at}: path "${entry}" is not a repository-relative path with / separators`)
    else if (!within(scope, entry)) problems.push(`${at}: path "${entry}" is outside the write scope [${scope.join(', ')}]`)
  }
  const acceptanceList = stringList(acceptance)
  if (acceptanceList === undefined || acceptanceList.length === 0 || acceptanceList.some(entry => entry.trim() === '')) problems.push(`${at}: acceptance needs at least one non-empty item`)
  const taskCount = (task.acceptance ?? []).length
  const coverList = Array.isArray(covers) && covers.every(entry => Number.isInteger(entry)) ? covers as number[] : undefined
  if (coverList === undefined) problems.push(`${at}: covers must be a list of integers`)
  for (const index of coverList ?? []) {
    if (index < 0 || index >= taskCount) problems.push(`${at}: covers index ${index} is out of range (the task has ${taskCount} acceptance item${taskCount === 1 ? '' : 's'})`)
  }
  const level = PLAN_VERIFY_LEVELS.find(entry => entry === verify)
  if (level === undefined) problems.push(`${at}: verify must be one of ${PLAN_VERIFY_LEVELS.join(', ')}`)
  const commandList = stringList(commands)
  if (commandList === undefined) problems.push(`${at}: commands must be a list of strings`)
  if (level === 'L4-batch' && (commandList?.length ?? 0) > 0) problems.push(`${at}: an L4-batch step carries no commands (desktop checks are batched)`)
  if ((level === 'L2' || level === 'L3') && commandList?.length === 0) problems.push(`${at}: a ${level} step needs at least one command`)
  if (problems.length > before) return undefined
  return { title: (title as string).trim(), paths: pathList!, acceptance: acceptanceList!, covers: coverList!, verify: level!, commands: commandList! }
}

/**
 * The plan checks of §3.3.2, all of which must hold: 1–12 steps; every step
 * has a one-line title, at least one acceptance item, a valid `verify`, and
 * commands when it is L2 or L3 (none when it is L4-batch); every step path
 * lies inside the task's current write scope; every `covers` index points at
 * an acceptance item of the task; every acceptance item of the task is
 * covered by some step. The problems are one line each, for the worker.
 */
export function checkPlan(task: Pick<GraphNode, 'acceptance' | 'writeScope'>, raw: unknown): PlanCheck {
  const problems: string[] = []
  if (!isRecord(raw) || !Array.isArray(raw.steps)) return { ok: false, problems: ['steps must be a list'] }
  const notes = raw.notes
  if (notes !== undefined && (typeof notes !== 'string' || notes.length > PLAN_LIMITS.notes)) problems.push(`notes must be a string of at most ${PLAN_LIMITS.notes} characters`)
  if (raw.steps.length < PLAN_LIMITS.minSteps || raw.steps.length > PLAN_LIMITS.maxSteps) {
    problems.push(`a plan has ${PLAN_LIMITS.minSteps} to ${PLAN_LIMITS.maxSteps} steps, this one has ${raw.steps.length}`)
  }
  const steps = raw.steps.slice(0, PLAN_LIMITS.maxSteps).map((entry: unknown, index) => checkStep(entry, index + 1, task, problems))
  const covered = new Set(steps.flatMap(step => step?.covers ?? []))
  // Coverage is reported once every step is sound: a step that failed its own checks would otherwise add uncovered items that are only its shadow.
  if (problems.length === 0) {
    (task.acceptance ?? []).forEach((item, index) => {
      if (!covered.has(index)) problems.push(`acceptance item ${index + 1} ("${item}") is not covered by any step`)
    })
  }
  if (problems.length > 0) return { ok: false, problems }
  return { ok: true, plan: { steps: steps as PlanStep[], ...(notes === undefined ? {} : { notes: notes as string }) } }
}

/** Digest of the steps: what the main agent approves. Notes are prose for the reader and stay out. */
export function planDigest(plan: Plan): string {
  return digest12(JSON.stringify(plan.steps.map(step => ({
    title: step.title, paths: step.paths, acceptance: step.acceptance, covers: step.covers, verify: step.verify, commands: step.commands,
  }))))
}

export type PlanState = 'pending' | 'approved'

const SECTION_TITLE = '## 计划'
const STATE_WORDS = { pending: '等主 Agent 审', approved: '主 Agent 已批' } as const
const HEADER_PATTERN = /^第 (\d+) 版 · (等主 Agent 审|主 Agent 已批) · 摘要 ([0-9a-f]{12})$/

/**
 * The plan section of the task body: the title line, a header line with the
 * version, the state and the digest, then one line of title and one of paths
 * and verification level per step.
 */
export function renderPlanSection(plan: Plan, version: number, state: PlanState): string {
  const lines = [SECTION_TITLE, `第 ${version} 版 · ${STATE_WORDS[state]} · 摘要 ${planDigest(plan)}`]
  plan.steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step.title}`, `   路径：${step.paths.length === 0 ? '无' : step.paths.join('、')} · 验证：${step.verify}`)
  })
  return lines.join('\n')
}

function sectionBounds(lines: readonly string[]): { start: number, end: number } | undefined {
  const start = lines.findIndex(line => line.trimEnd() === SECTION_TITLE)
  if (start < 0) return undefined
  const next = lines.findIndex((line, index) => index > start && line.startsWith('## '))
  return { start, end: next < 0 ? lines.length : next }
}

/** The body with its plan section replaced by `section`, or with the section appended when it has none. */
export function withPlanSection(body: string | undefined, section: string): string {
  const lines = (body ?? '').split(/\r?\n/)
  const bounds = sectionBounds(lines)
  if (bounds === undefined) return (body ?? '').trim() === '' ? section : `${(body ?? '').trimEnd()}\n\n${section}`
  const after = lines.slice(bounds.end)
  return [...lines.slice(0, bounds.start), ...section.split('\n'), ...(after.length > 0 ? ['', ...after] : [])].join('\n')
}

export interface PlanSection {
  readonly version: number
  readonly state: PlanState
  readonly digest: string
  /** The step lines, without the title and header lines: what a later brief carries. */
  readonly steps: string
}

/** The plan section of a body, or undefined when there is none or its header line is not the one `renderPlanSection` writes. */
export function readPlanSection(body: string | undefined): PlanSection | undefined {
  const lines = (body ?? '').split(/\r?\n/)
  const bounds = sectionBounds(lines)
  if (bounds === undefined) return undefined
  const header = HEADER_PATTERN.exec(lines[bounds.start + 1] ?? '')
  if (header === null) return undefined
  return {
    version: Number(header[1]),
    state: header[2] === STATE_WORDS.approved ? 'approved' : 'pending',
    digest: header[3],
    steps: lines.slice(bounds.start + 2, bounds.end).join('\n').trim(),
  }
}

/** The body with the plan section marked approved; undefined when the body has no readable plan section. */
export function approvePlanSection(body: string | undefined): string | undefined {
  const section = readPlanSection(body)
  if (section === undefined) return undefined
  const lines = (body ?? '').split(/\r?\n/)
  const bounds = sectionBounds(lines)!
  lines[bounds.start + 1] = `第 ${section.version} 版 · ${STATE_WORDS.approved} · 摘要 ${section.digest}`
  return lines.join('\n')
}

const APPROVAL_PATTERN = /^计划第 (\d+) 版已批 · 摘要 ([0-9a-f]{12}) · (\S+) · (\S+)$/

/** The comment written on the task when the main agent approves a plan version. */
export function renderApprovalComment(version: number, digest: string, childId: string, callId: string): string {
  return `计划第 ${version} 版已批 · 摘要 ${digest} · ${childId} · ${callId}`
}

export interface PlanApproval {
  readonly version: number
  readonly digest: string
  readonly childId: string
  readonly callId: string
}

export function parseApprovalComment(text: string): PlanApproval | undefined {
  const match = APPROVAL_PATTERN.exec(text.trim())
  return match === null ? undefined : { version: Number(match[1]), digest: match[2], childId: match[3], callId: match[4] }
}

/**
 * The approved plan a new dispatch of the task carries over (§3.3.4): the
 * latest approval comment of the harness, whose digest equals the digest of
 * the plan section now in the body, a section that is marked approved. A body
 * a person or the model has changed (the digest no longer matches) loses the
 * approval; whether the graph moved under the task since is the pins' check,
 * not this function's.
 */
export function carriedPlan(task: GraphNode): PlanApproval | undefined {
  const approval = task.history.flatMap(entry => {
    const parsed = entry.op === 'comment' && entry.actor === 'harness' && entry.text !== undefined ? parseApprovalComment(entry.text) : undefined
    return parsed === undefined ? [] : [parsed]
  }).at(-1)
  const section = readPlanSection(task.body)
  return approval !== undefined && section !== undefined && section.state === 'approved' && section.digest === approval.digest ? approval : undefined
}
