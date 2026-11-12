/**
 * Pieces of the row specs that the memory row and the lessons row share, on
 * the fake rc.3 host (tests/fake-rc3.ts): the optional services the host
 * brings (commands, session projections), one step of the main agent with the
 * notices it gets kept in the history, a delegated child created the way the
 * host creates one, a tool registration that fails, the run of a spec body
 * over a row and its clean-up, and the health a row reports for a session.
 */
import { rmSync } from 'node:fs'
import type { AgentCommandInvocationLike, AgentLike, CommandDefinitionLike, DerivedMessage, SessionProjectionsService, UserNotice } from '../src/shared/dsh-min.ts'
import { facePolicyRegistry } from '../src/glm-llm/face-wire.ts'
import { collectHealth } from '../src/shared/health.ts'
import type { FacePolicyRegistry } from '../src/shared/face-policy.ts'
import { fakeInjector, type FakeRuntime } from './fake-rc3.ts'

const USER_MESSAGE = { role: 'user', content: [{ type: 'text', text: 'Please start.' }] }

export interface OptionalServices {
  readonly commands: Map<string, CommandDefinitionLike<AgentCommandInvocationLike>>
  readonly projections: Array<Parameters<SessionProjectionsService['register']>[0]>
  /** The face-policy registry the glm-llm row provides; the rows register their wire-face sources in it (face-migration design 0.1 §4.1). */
  readonly faces: FacePolicyRegistry
  /** The services as the host brings them: `provide` registers them, `remove` takes them away. */
  readonly services: { provide(): void, remove(): void }
  /** The context a row is given: with `inject` unless the host has none (`bare`). */
  readonly ctx: FakeRuntime['ctx']
}

/** The commands, session projections and face-policy registry of the fake host; present from the start unless `late`. */
export function optionalServices(runtime: FakeRuntime, options: { readonly late?: boolean, readonly bare?: boolean } = {}): OptionalServices {
  const commands = new Map<string, CommandDefinitionLike<AgentCommandInvocationLike>>()
  const projections: OptionalServices['projections'] = []
  const faces = facePolicyRegistry()
  const injector = fakeInjector()
  // The live-agent registry (`agents`, agent:596) the rows' wire-face sources read is seeded with the host's own agent; `createChild` adds the children.
  liveAgentsOf(runtime)
  const services = {
    provide() {
      injector.provide('commands', { register: (definition) => { commands.set(definition.name, definition); return () => { commands.delete(definition.name) } } })
      injector.provide('sessionProjections', { register: (definition) => { projections.push(definition); return () => { projections.splice(projections.indexOf(definition), 1) } } } as SessionProjectionsService)
      injector.provide('glmHournessFaces', faces)
    },
    remove() {
      injector.remove('commands')
      injector.remove('sessionProjections')
      injector.remove('glmHournessFaces')
    },
  }
  if (options.late !== true) services.provide()
  return { commands, projections, faces, services, ctx: options.bare === true ? runtime.ctx : { ...runtime.ctx, inject: injector.inject } as FakeRuntime['ctx'] }
}

/** One step of the main agent; the notices the rows add persist in the history like real ones. */
export async function stepOf(runtime: FakeRuntime): Promise<readonly UserNotice[]> {
  const decision = await runtime.preStep({ messages: [USER_MESSAGE] })
  const notices = decision.kind === 'enter' ? decision.messages.slice(1) as UserNotice[] : []
  for (const notice of notices) runtime.history.push({ role: 'user', content: notice.content, source: notice.source } satisfies DerivedMessage)
  return notices
}

/** The live-agent registry of a fake runtime, with the host's own agent in it: the `agents` service the rows' wire-face sources read. */
const liveAgents = new WeakMap<FakeRuntime, Map<string, AgentLike>>()

function liveAgentsOf(runtime: FakeRuntime): Map<string, AgentLike> {
  let live = liveAgents.get(runtime)
  if (live === undefined) {
    live = new Map([[runtime.agent.id, runtime.agent]])
    liveAgents.set(runtime, live)
    runtime.services.set('agents', { get: (id: string) => live.get(id) })
  }
  return live
}

/** The agent's delegated child, created through `agent/created` as the host creates it; how many step listeners that added (a root agent gets some, a child none). The child is a session of its own, so it has its own id and the live-agent registry has it. */
export async function createChild(runtime: FakeRuntime): Promise<{ readonly child: AgentLike, readonly stepListenersAdded: number }> {
  const { agent } = runtime
  const child: AgentLike = { ...agent, id: `${agent.id}-child`, session: { ...agent.session!, id: `${agent.id}-child`, header: { ...agent.session!.header, origin: 'subagent' } } }
  liveAgentsOf(runtime).set(child.id, child)
  const created = runtime.listeners.find(entry => entry.event === 'agent/created')!.listener as (payload: { agent: AgentLike }) => unknown
  const count = (): number => runtime.listeners.filter(entry => entry.event === 'agent/pre-step').length
  const before = count()
  await created({ agent: child })
  return { child, stepListenersAdded: count() - before }
}

/** Make the `nth` tool registration of the host throw. */
export function failRegistration(runtime: FakeRuntime, nth: number, message: string): void {
  const real = runtime.ctx.tools.register.bind(runtime.ctx.tools)
  let count = 0
  runtime.ctx.tools.register = (definition) => {
    count += 1
    if (count === nth) throw new Error(message)
    return real(definition)
  }
}

/** Create the agent of the fake host, run body over the row, and afterwards withdraw the row and remove the temporary folder root. */
export async function runRow<Row>(runtime: FakeRuntime, row: Row, dispose: () => void, root: string, body: (row: Row) => Promise<void> | void): Promise<void> {
  try {
    await runtime.create()
    await body(row)
  }
  finally {
    dispose()
    rmSync(root, { recursive: true, force: true })
  }
}

/** The health the named row reports for a session of the fake host. */
export const healthOf = (runtime: FakeRuntime, rowName: string, sessionId = 'agent-1') => collectHealth(runtime.ctx, sessionId).find(entry => entry.row === rowName)!
