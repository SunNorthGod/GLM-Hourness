/**
 * The check backend `hourness-gate` (M7 design 0.6 §3.8.2): a merge check
 * runs as an external activation of the `subagents` service, so the driver
 * waits for it, the person's stop or `interrupt_agent` ends it, and the main
 * agent's turn is not held while the commands run. The provider registered
 * here takes no model, preset, schema or depth (every capability is false)
 * and does not see the parent's context; it reads the job id from the
 * prompt `hourness-gate job <id>`, runs that job of this process and settles
 * with a one-line verdict. Its result never rejects: a job that throws
 * settles as `error`, a stopped one as `aborted`.
 *
 * `createGateLauncher()` keeps the jobs and starts each one through
 * `subagents.startActivation` with `delivery: 'caller'`, the harness being
 * the only reader of the result (the verdict itself goes to the main agent
 * as the check notice). Without a registered provider, or when the start
 * throws, the launcher runs the job inside the call instead (the design's
 * fallback for U2) and says so; nothing else changes for the caller.
 *
 * The types follow rc.3 `SubagentProvider`, `ResolvedSubagentStartRequest`
 * and `SubagentRun` (dsh-subagent src/types.ts) as src/shared/dsh-min.ts
 * holds them.
 */
import type { AgentLike, LiveAgentLike, SubagentsService } from '../shared/dsh-min.ts'

/** The provider name the merge check activations run on. */
export const GATE_PROVIDER = 'hourness-gate'

type GateProvider = Parameters<SubagentsService['registerProvider']>[0]
type GateRequest = Parameters<GateProvider['start']>[0]
type GateRun = Awaited<ReturnType<GateProvider['start']>>

/** How a job ended, as the activation's result reports it. */
export interface GateVerdict {
  /** One line: what the check found. */
  readonly text: string
  readonly stopReason: 'completed' | 'error' | 'aborted'
}

/** One merge check to run: its id, the label the activation shows, the project directory, and the work itself. */
interface GateJob {
  readonly id: string
  readonly label: string
  readonly cwd: string
  readonly run: (signal: AbortSignal) => Promise<GateVerdict>
}

export interface GateLauncher {
  /** The provider the row registers with the `subagents` service. */
  readonly provider: GateProvider
  /** Register the provider with `subagents`; the returned function unregisters it. Throws what the registration throws. */
  attach(subagents: Pick<SubagentsService, 'registerProvider' | 'startActivation'>): () => void
  /** Start a job: as an activation when the provider is registered and the start succeeds, otherwise in this call, awaited. */
  start(job: GateJob, parent: AgentLike, signal: AbortSignal): Promise<'activation' | 'sync'>
}

const PROMPT = /^hourness-gate job (\S+)$/

/** A job's verdict that never rejects: a throw is an `error` verdict. */
function settle(job: GateJob, signal: AbortSignal): Promise<GateVerdict> {
  return Promise.resolve()
    .then(() => job.run(signal))
    .catch((error: unknown) => ({ text: `the check did not finish: ${error instanceof Error ? error.message : String(error)}`, stopReason: 'error' as const }))
}

export function createGateLauncher(): GateLauncher {
  const jobs = new Map<string, GateJob>()
  let service: Pick<SubagentsService, 'registerProvider' | 'startActivation'> | undefined

  const provider: GateProvider = {
    name: GATE_PROVIDER,
    capabilities: { agentOptions: false, agentPreset: false, outputSchema: false, depthLimit: false },
    inheritsParentContext: false,
    start(request: GateRequest): Promise<GateRun> {
      const first = request.prompt[0] as { readonly type?: unknown, readonly text?: unknown } | undefined
      const id = first?.type === 'text' && typeof first.text === 'string' ? PROMPT.exec(first.text.trim())?.[1] : undefined
      const job = id === undefined ? undefined : jobs.get(id)
      if (id === undefined || job === undefined) return Promise.reject(new Error(`${GATE_PROVIDER} has no job for this prompt`))
      if (request.signal.aborted) return Promise.reject(new Error('the check was stopped before it started'))
      jobs.delete(id)
      const controller = new AbortController()
      const stop = (): void => { controller.abort() }
      request.signal.addEventListener('abort', stop, { once: true })
      const result = settle(job, controller.signal).then((verdict) => {
        request.signal.removeEventListener('abort', stop)
        return { output: [{ type: 'text', text: verdict.text }], stopReason: verdict.stopReason }
      })
      return Promise.resolve({
        id: `hz-gate-${id}`,
        result,
        async dispose() {
          controller.abort()
          await result
        },
      })
    },
  }

  return {
    provider,
    attach(subagents) {
      const undo = subagents.registerProvider(provider)
      service = subagents
      return () => {
        service = undefined
        undo()
      }
    },
    async start(job, parent, signal) {
      jobs.set(job.id, job)
      if (service !== undefined) {
        try {
          const activation = await service.startActivation({
            provider: GATE_PROVIDER,
            label: job.label,
            request: { prompt: [{ type: 'text', text: `hourness-gate job ${job.id}` }], parent: parent as unknown as LiveAgentLike, cwd: job.cwd },
            signal,
            delivery: 'caller',
          })
          void activation.result.catch(() => undefined)
          return 'activation'
        }
        catch {
          // The provider took the job before the start failed: the run belongs to that activation, which settles it.
          if (!jobs.has(job.id)) return 'activation'
        }
      }
      jobs.delete(job.id)
      await settle(job, signal)
      return 'sync'
    },
  }
}
