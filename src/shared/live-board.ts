/**
 * Shared client/host contract for `<project>/.llm/execute/live-board.json`.
 * Kept free of Node built-ins so browser UI bundles and host modules type-check
 * against the same shape without duplication.
 */

type LiveDispatchStatus = 'running' | 'completed' | 'error' | 'aborted' | 'max-tokens' | 'refusal' | 'lost'

interface LiveDispatchEntry {
  readonly childId: string
  readonly task: string
  readonly role: 'worker' | 'review' | 'acceptance-review' | 'check'
  readonly attempt: number
  readonly status: LiveDispatchStatus
  readonly startedAt: number
  readonly settledAt?: number
  readonly parentSession?: string
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
  readonly why?: string
  readonly worktree?: string
  readonly branch?: string
  readonly review?: 'full' | 'light' | 'skip'
  readonly depth?: 'full' | 'light'
  readonly plan: 'required' | 'approved' | 'skipped' | 'none'
  readonly handbackDone?: boolean
}

interface LiveRequestEntry {
  readonly id: string
  readonly kind: 'plan' | 'question'
  readonly childId: string
  readonly task: string
  readonly attempt: number
  readonly since: number
  readonly version?: number
  readonly question?: string
  readonly assumption?: string
}

type LiveExternalJobKind = 'gate' | 'walk'
type LiveExternalJobStatus = 'running' | 'completed' | 'error' | 'aborted'

interface LiveExternalJob {
  readonly id: string
  readonly kind: LiveExternalJobKind
  readonly label: string
  readonly status: LiveExternalJobStatus
  readonly startedAt: number
  readonly endedAt?: number
  readonly goalId?: string
  readonly tasks?: readonly string[]
  readonly flows?: readonly string[]
  readonly mode?: 'activation' | 'sync'
  readonly summary?: string
}

export interface ExecuteLiveBoard {
  readonly version: 1
  readonly updatedAt: number
  readonly projectRoot: string
  readonly dispatchMode?: 'eco' | 'adaptive' | 'burn'
  readonly slots: {
    readonly max: number
    readonly activeWorkers: number
    readonly glmWorkers: number
    readonly peakCap?: number
  }
  readonly drive: {
    readonly goalId?: string
    readonly phase?: string
    readonly blockedCode?: string
    readonly stateLine?: string
    readonly counters: {
      readonly idle: number
      readonly peak: number
    }
  }
  readonly peak?: {
    readonly peak: boolean
    readonly level: string
    readonly until?: string
  }
  readonly dispatches: readonly LiveDispatchEntry[]
  readonly requests: readonly LiveRequestEntry[]
  readonly jobs: readonly LiveExternalJob[]
}
