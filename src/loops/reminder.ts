/**
 * What the board adds to a step of the main agent (docs/ORCHESTRATION.md
 * §18.10; loop board design 0.6 §6.1, §6.4 last paragraph): the reminders of
 * the time entries are delivered by DSH itself, so the only thing the row does
 * at the step that takes one is to say which entry it belongs to, and to leave
 * two notes that the rest of the board reads.
 *
 * The line: a step whose admitted messages carry a message of the schedule
 * service (source `schedule`, schedule:1594) naming a task the board bound
 * (schedule:1386–1418 writes the id as `schedule_id_json`, or the ids of a
 * batch in `reminders_json`) gets one line after `next()`. The reconciliation
 * runs first, so the run named is the run the records carry.
 *
 * The two notes, written by whichever process sees the step (design §6.1):
 *
 * - `<project>/.llm/loops/main-step.json`: that the main agent's session took a
 *   step, which the peak entries read to tell whether it worked during a peak.
 *   At most once a minute, except at the step that crosses into or out of a
 *   peak, which is written at once so the first step of every peak is kept;
 * - `<userHome>/loops/machine/last-step.json`: which project the main agent
 *   last worked in, which the account-level entries use to decide whose inbox
 *   their events go to.
 *
 * Nothing here throws into a step: a note that cannot be written is left for
 * the next step, and a reading that fails leaves the line out.
 */
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { writeAtomic, type StoreIo } from '../rules/store.ts'
import { createUserNotice, type AgentLike, type UserNotice } from '../shared/dsh-min.ts'
import { installStepNotice } from '../shared/step-notice.ts'
import { wrapSystemReminder } from '../shared/zcode-notice.ts'

/** The source kind of the line the board adds at a step that took a reminder. */
export const LOOP_STEP_SOURCE = 'glm-hourness-loop-step'

/** At most one note of a walk per minute, unless the peak changed (design §6.1). */
export const STEP_NOTE_MS = 60_000

/** One note of a step: who walked and when. */
export interface StepNote {
  readonly session: string
  readonly at: string
}

/** The note of the machine: the project the main agent last walked in (design §6.1). */
export interface MachineStepNote extends StepNote {
  readonly projectKey: string
  readonly project: string
}

export interface StepNoticeDeps {
  /** The project root this session works in. */
  readonly project: string
  readonly projectKey: string
  /** `<project>/.llm/loops/main-step.json`. */
  readonly mainStep: string
  /** `<userHome>/loops/machine/last-step.json`, when this process has a user directory. */
  readonly lastStep?: string
  readonly io: StoreIo
  readonly now: () => number
  /** Whether this session is the main agent of the project, asked at every step (the holder record moves with `/wish here`). */
  readonly isHolder: (sessionId: string) => boolean
  /** Reconcile the reminders before the line is written, so the run it names is the run of the records. */
  readonly settle: () => Promise<void>
  /** The run of the last delivery of this entry, as the records have it. */
  readonly runOf: (entry: string) => string | undefined
  /** The entry one of the board's reminders belongs to, by schedule id. */
  readonly entryOf: (scheduleId: string) => string | undefined
  /** Whether the moment is inside a GLM peak, while a pricing service is there; the note of a step that crossed a boundary is written at once. */
  readonly peak?: (atMs: number) => boolean | undefined
  readonly warn: (text: string) => void
}

/** The schedule ids a step's admitted messages name (schedule:1386–1418: one `schedule_id_json`, or a batch in `reminders_json`). */
export function scheduleIdsOf(admitted: readonly unknown[]): readonly string[] {
  const ids: string[] = []
  for (const message of admitted) {
    const source = (message as { readonly source?: { readonly kind?: unknown } } | undefined)?.source
    if (source?.kind !== 'schedule') continue
    const text = ((message as { readonly content?: ReadonlyArray<{ readonly text?: unknown }> }).content ?? [])
      .map(part => typeof part.text === 'string' ? part.text : '').join('\n')
    for (const match of text.matchAll(/schedule_id_json: "([^"]+)"/g)) ids.push(match[1])
    const batch = /reminders_json: (\[.*)$/m.exec(text)
    if (batch !== null) {
      try {
        for (const item of JSON.parse(batch[1]) as ReadonlyArray<{ readonly schedule_id?: unknown }>) {
          if (typeof item.schedule_id === 'string') ids.push(item.schedule_id)
        }
      }
      catch {
        // A batch the board cannot read names no task of its own: the step gets no line.
      }
    }
  }
  return [...new Set(ids)]
}

/** The line a step that took one of the board's reminders ends with (design §6.2 "after the due time"). */
export function stepLine(runs: readonly { readonly entry: string, readonly run?: string }[]): string {
  return runs.map(item => item.run === undefined ? `Loop board reminder for ${item.entry}.` : `Loop run ${item.run} for ${item.entry}.`).join('\n')
}

/** Write one note of a walk, through a temporary file and a rename; a failure is left for the next step. */
async function note(file: string, value: StepNote | MachineStepNote, io: StoreIo): Promise<void> {
  await mkdir(dirname(file), { recursive: true }).catch(() => {})
  await writeAtomic(file, `${JSON.stringify(value, null, 2)}\n`, io)
}

/**
 * Install the board's step notice on one agent; undefined when the agent has no
 * history to derive from. The disposer takes the listener out.
 */
export function installLoopStepNotice(agent: AgentLike, deps: StepNoticeDeps): (() => void) | undefined {
  /** When the notes were last written, and the peak reading of that moment. */
  let wrote: { at: number, peak: boolean | undefined } | undefined
  const session = agent.session
  if (session === undefined) return undefined
  return installStepNotice(agent, 'loop board step line', () => deps.isHolder(session.id), async (_history, step): Promise<UserNotice | undefined> => {
    try {
      const now = deps.now()
      const peak = deps.peak?.(now)
      const crossed = wrote !== undefined && peak !== undefined && wrote.peak !== peak
      if (wrote === undefined || crossed || now - wrote.at >= STEP_NOTE_MS) {
        wrote = { at: now, peak }
        const at = new Date(now).toISOString()
        await note(deps.mainStep, { session: session.id, at }, deps.io)
        if (deps.lastStep !== undefined) await note(deps.lastStep, { session: session.id, at, projectKey: deps.projectKey, project: deps.project }, deps.io)
      }
      const ids = scheduleIdsOf(step.admitted)
      const mine = ids.map(id => deps.entryOf(id)).filter((entry): entry is string => entry !== undefined)
      if (mine.length === 0) return undefined
      // The reminder has been delivered: the reconciliation turns it into a run before the line names it.
      await deps.settle()
      const runs = mine.map(entry => ({ entry, ...(deps.runOf(entry) === undefined ? {} : { run: deps.runOf(entry)! }) }))
      return createUserNotice(LOOP_STEP_SOURCE, `loop board: ${mine.join(', ')}`, wrapSystemReminder(stepLine(runs)), { hournessLoopStep: { entries: mine } })
    }
    catch (error) {
      deps.warn(`the loop board's step line was skipped for agent ${agent.id}: ${error instanceof Error ? error.message : String(error)}`)
      return undefined
    }
  }, 'loops')
}

/** `<userHome>/loops/machine/last-step.json` (design §6.1). */
export const machineStepFile = (userHome: string): string => join(userHome, 'loops', 'machine', 'last-step.json')
