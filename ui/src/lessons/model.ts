/**
 * The view model of the lessons page (M5 design §4.7, lessons-3): what the
 * folded journals of lessons and memory become as rows, collapsed groups,
 * the 要改 line of every item, the 原话未核对 tag, and the one
 * reporting-depth line. Pure functions over the states the page source
 * folds, with the clock injected; no React, no DOM, no Node built-ins, so
 * the spec runs them directly. The page carries no write path: every 要改
 * line tells the person what to say to the main agent or which person's
 * command to type (/lessons, /memory), and the page itself never writes.
 */
import { SESSION_WINDOW_DAYS } from '../../../src/lessons/match.ts'
import { emptyLessons, type Lesson, type LessonsState, type Situation } from '../../../src/lessons/model.ts'
import { strength, type MemoryEntry, type MemoryState } from '../../../src/memory/model.ts'
import { timeAgo } from '../graph/model.ts'

const DAY_MS = 86_400_000

/** One lesson on the page: the title, how it stands, where it came from, and how to change it. */
export interface LessonRow {
  readonly id: string
  /** The pitfall. */
  readonly title: string
  /** The fix, when it was last confirmed, and the sessions it hit lately. */
  readonly stateLine: string
  /** The situation as small tags: 文件, 工具, 命令, 报错. */
  readonly situation: readonly string[]
  /** The evidence as written (§5.7 forms). */
  readonly evidence: readonly string[]
  /** The grey line of where it came from. */
  readonly originLine: string
  readonly changeLine: string
}

/** A group of lessons the page folds by default: retired by an agent, or deleted by the person. */
interface LessonGroup {
  readonly title: string
  readonly rows: readonly LessonRow[]
}

/** One preference of the 关于你 section. */
export interface PreferenceRow {
  readonly name: string
  readonly description: string
  /** What the person said, and when; 存入 when no words were quoted. */
  readonly saidLine: string
  /** The words were not checked against the person's messages. */
  readonly unchecked: boolean
  /** A habit the agent asked about and the person confirmed (§3.8.4): the question, the content as asked, and a changed-content line when an update rewrote it. */
  readonly habit?: { readonly questionLine: string, readonly memorizeLine: string, readonly changedLine?: string }
  readonly changeLine: string
}

/** One fact of the 项目里的线索 section. */
export interface FactRow {
  readonly name: string
  readonly description: string
  /** Where the fact lives; null when it has no source (migrated ones). */
  readonly sourceLine: string | null
  readonly noSource: boolean
  readonly strengthText: string
  readonly changeLine: string
}

/** A habit the person said no to, in the folded 你说过不用记的习惯 section (§3.8.4). */
export interface DeclinedRow {
  readonly name: string
  readonly description: string
  readonly questionLine: string
  readonly saidLine: string
  readonly untilLine: string
  readonly changeLine: string
}

export interface MemoryRows {
  readonly preferences: readonly PreferenceRow[]
  readonly facts: readonly FactRow[]
  /** The habits the person declined, folded by default; empty rows make no section. */
  readonly declinedHabits: { readonly title: string, readonly rows: readonly DeclinedRow[] }
  /** The one line about how long reports should be; null when the person has not set one. */
  readonly depth: { readonly line: string, readonly changeLine: string } | null
}

export interface LessonsPageModel {
  readonly topLine: string
  readonly rows: readonly LessonRow[]
  readonly retired: LessonGroup
  readonly deleted: LessonGroup
  readonly memory: MemoryRows
}

const clip = (text: string, max: number): string => (text.length <= max ? text : `${text.slice(0, max - 1)}…`)

/** `10-29` out of an ISO time, for 你 10-29 说过. */
const dayOf = (at: string): string => (/^\d{4}-\d{2}-\d{2}/.test(at) ? at.slice(5, 10) : at.slice(0, 10))

const situationTags = (situation: Situation): readonly string[] => [
  ...situation.files.map(file => `文件 ${file}`),
  ...situation.tools.map(tool => `工具 ${tool}`),
  ...situation.commands.map(command => `命令 ${command}`),
  ...situation.errors.map(error => `报错 "${clip(error, 60)}"`),
]

const originLineOf = (lesson: Lesson): string => {
  const who = lesson.origin.actor === 'human' ? '你写的' : '主 Agent 写的'
  return lesson.mergedFrom.length === 0 ? who : `${who}，并入 ${lesson.mergedFrom.length} 条候选`
}

/** The distinct sessions a lesson touched within the recurrence window. */
const sessionsLately = (state: LessonsState, lesson: Lesson, nowMs: number): number =>
  new Set((state.touches.get(lesson.id) ?? [])
    .filter(touch => nowMs - Date.parse(touch.at) <= SESSION_WINDOW_DAYS * DAY_MS)
    .map(touch => touch.session)).size

const byRecency = (a: Lesson, b: Lesson): number => Date.parse(b.lastConfirmed) - Date.parse(a.lastConfirmed) || (a.id < b.id ? -1 : 1)

function lessonRowOf(state: LessonsState, lesson: Lesson, nowMs: number): LessonRow {
  const sessions = sessionsLately(state, lesson, nowMs)
  return {
    id: lesson.id,
    title: lesson.pitfall,
    stateLine: `${lesson.fix} · ${timeAgo(lesson.lastConfirmed, nowMs)}确认${sessions === 0 ? '' : ` · ${SESSION_WINDOW_DAYS} 天里 ${sessions} 个会话碰到`}`,
    situation: situationTags(lesson.situation),
    evidence: [...lesson.evidence],
    originLine: originLineOf(lesson),
    changeLine: `要改：跟主 Agent 说「删掉经验 ${lesson.id}」，或在输入框打 /lessons delete ${lesson.id}`,
  }
}

/** The active lessons, the one confirmed most recently first. */
function lessonsRows(state: LessonsState, nowMs: number): readonly LessonRow[] {
  return [...state.lessons.values()]
    .filter(lesson => lesson.status === 'active')
    .sort(byRecency)
    .map(lesson => lessonRowOf(state, lesson, nowMs))
}

/** The lessons an agent retired, or the person deleted, as a group the page folds by default. */
function lessonsGroup(state: LessonsState, status: 'retired' | 'deleted', nowMs: number): LessonGroup {
  const rows = [...state.lessons.values()]
    .filter(lesson => lesson.status === status)
    .sort(byRecency)
    .map((lesson) => ({
      ...lessonRowOf(state, lesson, nowMs),
      changeLine: `要恢复：跟主 Agent 说「把 ${lesson.id} 找回来」，或打 /lessons restore ${lesson.id}`,
    }))
  return { title: status === 'retired' ? `agent 收起的（${rows.length}）` : `你删掉的（${rows.length}）`, rows }
}

const forgetLine = (name: string): string => `要改：跟主 Agent 说「忘掉 ${name}」，或在输入框打 /memory forget ${name}`

/** The habit lines of a confirmed entry (lessons-3): what the person was asked, what was to be remembered, and what changed since. */
const habitOf = (entry: MemoryEntry): PreferenceRow['habit'] => {
  const confirmed = entry.confirmed
  if (confirmed === undefined) return undefined
  return {
    questionLine: `当时问你的是：「${confirmed.question}」`,
    memorizeLine: `要记的：${entry.description}`,
    ...(confirmed.body !== entry.body ? { changedLine: `内容在你确认之后改过，依据是你 ${dayOf(entry.lastReviewed)} 说过「${entry.relay ?? ''}」` } : {}),
  }
}

const preferenceRowOf = (entry: MemoryEntry): PreferenceRow => {
  const habit = habitOf(entry)
  return {
    name: entry.name,
    description: entry.description,
    // The date of the words the row quotes: the latest write that set them.
    saidLine: entry.relay === undefined ? `你 ${dayOf(entry.created)} 存入` : `你 ${dayOf(entry.lastReviewed)} 说过「${entry.relay}」`,
    unchecked: entry.relayChecked === false,
    ...(habit === undefined ? {} : { habit }),
    changeLine: forgetLine(entry.name),
  }
}

const factRowOf = (entry: MemoryEntry, nowMs: number): FactRow => ({
  name: entry.name,
  description: entry.description,
  sourceLine: entry.source.length === 0 ? null : `出处：${entry.source.join(' · ')}`,
  noSource: entry.source.length === 0,
  strengthText: `强度 ${Math.round(strength(entry, new Date(nowMs).toISOString()) * 100)}%`,
  changeLine: forgetLine(entry.name),
})

/** The three depths as the persona section names them (src/glm-prompt/persona.ts). */
const DEPTH_LABELS: Readonly<Record<string, string>> = { concise: '简洁', balanced: '适中', detailed: '详细' }
const REPORTING_DEPTH = 'reporting-depth'

/** The rows of the memory half of the page: the person's preferences (confirmed habits among them), the project's facts, the declined habits, the reporting depth. */
export function memoryRows(project: MemoryState | null, user: MemoryState | null, nowMs: number): MemoryRows {
  const all = [...(user?.entries.values() ?? []), ...(project?.entries.values() ?? [])].filter(entry => entry.status === 'active')
  const byCreated = (a: MemoryEntry, b: MemoryEntry): number => Date.parse(b.created) - Date.parse(a.created) || (a.name < b.name ? -1 : 1)
  const preferences = all
    .filter(entry => entry.kind === 'preference' && entry.name !== REPORTING_DEPTH)
    .sort(byCreated)
    .map(preferenceRowOf)
  const facts = all
    .filter(entry => entry.kind === 'fact')
    .sort((a, b) => Date.parse(b.lastReviewed) - Date.parse(a.lastReviewed) || (a.name < b.name ? -1 : 1))
    .map(entry => factRowOf(entry, nowMs))
  const declined = [...(user?.declined.values() ?? []), ...(project?.declined.values() ?? [])]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || (a.name < b.name ? -1 : 1))
    .map((no) => ({
      name: no.name,
      description: no.description,
      questionLine: `当时问你的是：「${no.question}」`,
      saidLine: `你 ${dayOf(no.at)} 说过「${no.relay}」`,
      untilLine: `${dayOf(no.until)} 之前不再问`,
      changeLine: `要改：${dayOf(no.until)} 之后想记回来，跟主 Agent 再说一次`,
    }))
  const depthEntry = all.find(entry => entry.name === REPORTING_DEPTH)
  const depth = depthEntry === undefined
    ? null
    : ((): { readonly line: string, readonly changeLine: string } => {
        const row = preferenceRowOf(depthEntry)
        const label = DEPTH_LABELS[depthEntry.value ?? 'balanced'] ?? depthEntry.value
        return {
          line: `汇报细度：${label} · ${row.saidLine}${row.unchecked ? ' · 原话未核对' : ''}`,
          changeLine: forgetLine(depthEntry.name),
        }
      })()
  return { preferences, facts, declinedHabits: { title: `你说过不用记的习惯（${declined.length}）`, rows: declined }, depth }
}

/** The whole page model from the folded lessons journal and the memory rows. */
export function buildLessonsPage(lessons: LessonsState | null, memory: MemoryRows, nowMs: number): LessonsPageModel {
  const state = lessons ?? emptyLessons()
  const rows = lessonsRows(state, nowMs)
  const candidates = [...state.candidates.values()].filter(candidate => candidate.status === 'open').length
  const topLine = rows.length === 0
    ? '这个项目还没有经验'
    : `本项目 ${rows.length} 条经验${candidates === 0 ? '' : ` · ${candidates} 条候选等主 Agent 合并`}`
  return { topLine, rows, retired: lessonsGroup(state, 'retired', nowMs), deleted: lessonsGroup(state, 'deleted', nowMs), memory }
}
