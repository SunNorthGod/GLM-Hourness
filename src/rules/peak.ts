/**
 * What the rules row hands out about the peak mode (docs/ORCHESTRATION.md
 * §16): the level of a project from its state, the clock of the GLM plan from
 * the pricing service, and the `glmHournessPeakMode` service built from the
 * two. Every member answers from memory and the pricing service, never
 * throws, and never writes: a reader that finds the files out of step
 * replays the journal in memory and leaves the files to a writer.
 *
 * The cap on concurrent GLM subagents is the one number this module adds to
 * the level: `peakModeState` (src/shared/peak-mode.ts) fills it only in a
 * peak under `reduce`, and the dispatch tool counts against it.
 */
import { statSync } from 'node:fs'
import { projectOf } from '../data/project-root.ts'
import type { ServiceLookup } from '../shared/dsh-min.ts'
import { peakHoldOf, peakModeState, type PeakModeService, type PeakModeState } from '../shared/peak-mode.ts'
import { nextPeakChange, pricingService } from '../shared/pricing.ts'
import { effectivePeakMode } from './model.ts'
import { readProject, type ProjectRead } from './repo.ts'
import { rulesPaths, type RulesPaths } from './store.ts'

/** Whether it is peak now and until when, or why that cannot be read. */
export interface PeakReading {
  readonly peak: boolean | undefined
  /** ISO 8601: the end of this peak, or the start of the next one. */
  readonly until?: string
  /** Why `peak` is undefined. */
  readonly why?: string
}

const NO_PRICING = '没有计价服务（GLM 通道包未装，或它的 glm-login 行未启用）'

/**
 * A reader of the GLM plan's clock. The pricing service is read on every
 * call (it comes and goes with the glm-login row); a service of the wrong
 * shape, or a `peak` that throws, makes the answer unknown and is warned
 * about once per process.
 */
export function peakReader(ctx: ServiceLookup, now: () => number, warn: (message: string) => void = message => { console.warn(`dsh-glm-hourness/rules: ${message}`) }): () => PeakReading {
  const warned = new Set<string>()
  const warnOnce = (message: string): void => {
    if (warned.has(message)) return
    warned.add(message)
    warn(message)
  }
  return () => {
    let shapeProblem = false
    const pricing = pricingService(ctx, message => {
      shapeProblem = true
      warnOnce(message)
    })
    if (pricing === undefined) return { peak: undefined, why: shapeProblem ? '计价服务的形状不对' : NO_PRICING }
    const at = now()
    try {
      const peak: unknown = pricing.peak(at)
      if (typeof peak !== 'boolean') return { peak: undefined, why: '计价服务的 peak 没有返回是或否' }
      const next = nextPeakChange(atMs => pricing.peak(atMs), at)
      return { peak, ...(next === undefined ? {} : { until: new Date(next).toISOString() }) }
    }
    catch (error) {
      const text = (error instanceof Error ? error.message : String(error)).slice(0, 80)
      warnOnce(`the pricing service's peak threw: ${text}`)
      return { peak: undefined, why: `计价服务的 peak 出错：${text}` }
    }
  }
}

/** A project as the row reads it: where its files are and what they hold. */
export interface ProjectView {
  readonly paths: RulesPaths
  readonly read: ProjectRead
}

const WATCHED = (paths: RulesPaths): readonly string[] => [paths.state, paths.pending, paths.journal, paths.rulesFile, paths.repoWritten]

function statKey(paths: RulesPaths): string {
  return WATCHED(paths).map((file) => {
    try {
      const info = statSync(file)
      return `${info.mtimeMs}:${info.size}`
    }
    catch {
      return '-'
    }
  }).join('|')
}

/**
 * Read projects by working directory, remembering each project's read until
 * one of its files changes (their modification time and size), so a call
 * costs a few `stat`s. Undefined for a directory that is not in a project.
 */
export function projectReader(rulesDir: string | undefined): (cwd: string) => ProjectView | undefined {
  const remembered = new Map<string, { readonly key: string, readonly view: ProjectView }>()
  return (cwd) => {
    const project = projectOf(cwd)
    if (project === undefined) return undefined
    const paths = rulesPaths(project.root, rulesDir)
    const key = statKey(paths)
    const known = remembered.get(project.root)
    if (known?.key === key) return known.view
    const view: ProjectView = { paths, read: readProject(paths) }
    remembered.set(project.root, { key, view })
    return view
  }
}

/** The state a reader gets, from the level in the project's state and a reading of the clock. */
export function stateOf(read: ProjectRead, reading: PeakReading): PeakModeState {
  const effective = effectivePeakMode(read.state)
  return peakModeState({
    level: effective.level,
    origin: effective.origin,
    ...(effective.at === undefined ? {} : { at: effective.at }),
    peak: reading.peak,
    ...(reading.peak === undefined || reading.until === undefined ? {} : { until: reading.until }),
  })
}

export interface PeakServiceSources {
  /** The working directory of a session this host knows. */
  readonly cwdOf: (sessionId: string) => string | undefined
  readonly project: (cwd: string) => ProjectView | undefined
  readonly peak: () => PeakReading
}

/** The `glmHournessPeakMode` service. Every member answers undefined rather than throw. */
export function peakModeServiceFor(sources: PeakServiceSources): PeakModeService {
  const stateForProject = (cwd: string): PeakModeState | undefined => {
    try {
      const view = sources.project(cwd)
      return view === undefined ? undefined : stateOf(view.read, sources.peak())
    }
    catch {
      return undefined
    }
  }
  const stateFor = (sessionId: string): PeakModeState | undefined => {
    try {
      const cwd = sources.cwdOf(sessionId)
      return cwd === undefined ? undefined : stateForProject(cwd)
    }
    catch {
      return undefined
    }
  }
  return {
    stateFor,
    stateForProject,
    peakHoldFor: (sessionId) => {
      const state = stateFor(sessionId)
      return state === undefined ? undefined : peakHoldOf(state)
    },
  }
}
