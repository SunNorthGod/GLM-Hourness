/**
 * Pieces of the row specs that the memory row and the lessons row share, on
 * the fake rc.3 host (tests/fake-rc3.ts): the optional services the host
 * brings (commands, session projections), one step of the main agent with the
 * notices it gets kept in the history, a delegated child created the way the
 * host creates one, and a tool registration that fails.
 */
import type { AgentCommandInvocationLike, AgentLike, CommandDefinitionLike, DerivedMessage, SessionProjectionsService, UserNotice } from '../src/shared/dsh-min.ts'
import { fakeInjector, type FakeRuntime } from './fake-rc3.ts'

const USER_MESSAGE = { role: 'user', content: [{ type: 'text', text: 'Please start.' }] }

export interface OptionalServices {
  readonly commands: Map<string, CommandDefinitionLike<AgentCommandInvocationLike>>
  readonly projections: Array<Parameters<SessionProjectionsService['register']>[0]>
  /** The services as the host brings them: `provide` registers them, `remove` takes them away. */
  readonly services: { provide(): void, remove(): void }
  /** The context a row is given: with `inject` unless the host has none (`bare`). */
  readonly ctx: FakeRuntime['ctx']
}

/** The commands and session projections of the fake host; present from the start unless `late`. */
export function optionalServices(runtime: FakeRuntime, options: { readonly late?: boolean, readonly bare?: boolean } = {}): OptionalServices {
  const commands = new Map<string, CommandDefinitionLike<AgentCommandInvocationLike>>()
  const projections: OptionalServices['projections'] = []
  const injector = fakeInjector()
  const services = {
    provide() {
      injector.provide('commands', { register: (definition) => { commands.set(definition.name, definition); return () => { commands.delete(definition.name) } } })
      injector.provide('sessionProjections', { register: (definition) => { projections.push(definition); return () => { projections.splice(projections.indexOf(definition), 1) } } } as SessionProjectionsService)
    },
    remove() {
      injector.remove('commands')
      injector.remove('sessionProjections')
    },
  }
  if (options.late !== true) services.provide()
  return { commands, projections, services, ctx: options.bare === true ? runtime.ctx : { ...runtime.ctx, inject: injector.inject } as FakeRuntime['ctx'] }
}

/** One step of the main agent; the notices the rows add persist in the history like real ones. */
export async function stepOf(runtime: FakeRuntime): Promise<readonly UserNotice[]> {
  const decision = await runtime.preStep({ messages: [USER_MESSAGE] })
  const notices = decision.kind === 'enter' ? decision.messages.slice(1) as UserNotice[] : []
  for (const notice of notices) runtime.history.push({ role: 'user', content: notice.content, source: notice.source } satisfies DerivedMessage)
  return notices
}

/** The agent's delegated child, created through `agent/created` as the host creates it; how many step listeners that added (a root agent gets some, a child none). */
export async function createChild(runtime: FakeRuntime): Promise<{ readonly child: AgentLike, readonly stepListenersAdded: number }> {
  const { agent } = runtime
  const child: AgentLike = { ...agent, session: { ...agent.session!, header: { ...agent.session!.header, origin: 'subagent' } } }
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
