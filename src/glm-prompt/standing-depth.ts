/**
 * The person's standing reporting depth for the `glm:persona` section (M5
 * design §3.7): the memory row's service `glmHournessMemory` keeps the depth
 * the person last asked for (the preference `reporting-depth`), and the
 * dialect reads it through the shared contract (src/shared/memory-service.ts)
 * without importing the row. The read happens once, when the dialect is
 * installed on a session's agent, so the system prompt of that session does
 * not change when the person later says how long reports should be; the
 * next session starts from the new depth.
 *
 * Without the memory row, or when the person has set nothing, there is no
 * standing depth and the section uses the configured one. A service that
 * answers with something the dialect cannot use does the same, and says so:
 * once on the console per reason, and in the row health of the session.
 */
import { sessionIdOf } from '../shared/health.ts'
import { MEMORY_SERVICE, memoryService } from '../shared/memory-service.ts'
import type { AgentLike, ServiceLookup } from '../shared/dsh-min.ts'
import { isPersonaLevel, type PersonaLevel } from './persona.ts'

/** What the memory service said about the standing depth: the level, or why there is none to apply. Neither field: nothing to apply, nothing wrong. */
export interface StandingDepth {
  readonly level?: PersonaLevel
  /** In words for the row health. */
  readonly problem?: string
}

const CONFIG_STANDS_IN = 'the reporting depth comes from the row configuration'

/**
 * Read the standing depth of the session `agent` runs, from the service as
 * cordis finds it now (the memory row may come and go). Never throws.
 * `warn` hears a problem with a reason key and the console text; it decides
 * how often the console hears it.
 */
export function standingDepthReader(ctx: ServiceLookup, agent: AgentLike, warn: (reason: string, message: string) => void): () => StandingDepth {
  const unusable = (reason: string, message: string, why: string): StandingDepth => {
    warn(reason, message)
    return { problem: `汇报细度：${why}，这个会话用配置的档` }
  }
  return () => {
    let shape: string | undefined
    const service = memoryService(ctx, (message) => { shape = message })
    if (service === undefined) return shape === undefined ? {} : unusable('service-shape', shape, '记忆服务的形状不对')
    const sessionId = sessionIdOf(agent)
    if (sessionId === undefined) return {}
    let answer: unknown
    try {
      answer = service.depth(sessionId)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return unusable('depth-threw', `${MEMORY_SERVICE} depth threw: ${message}; ${CONFIG_STANDS_IN}`, `记忆服务读不出（${message}）`)
    }
    if (answer === undefined) return {}
    if (isPersonaLevel(answer)) return { level: answer }
    const shown = typeof answer === 'string' ? `"${answer.slice(0, 40)}"` : `a ${typeof answer}`
    return unusable('depth-value', `${MEMORY_SERVICE} gave a reporting depth the dialect does not define (${shown}); ${CONFIG_STANDS_IN}`, '记忆服务给了一个不认识的档')
  }
}
