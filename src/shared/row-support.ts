/**
 * What the memory row and the lessons row do alike when they start and while
 * they run: warn on the console once per reason, keep the notes each
 * session's health is built from, and take the services that may arrive after
 * activation (the commands and the session projections; cordis `ctx.inject`,
 * cordis:1600). A row works all the same without those services; its health
 * says what is not registered while one is absent, and goes back to normal
 * when the service comes (and again says it when the service leaves).
 */
import type { InjectHost, InjectableServices } from './dsh-min.ts'
import type { HealthState, RowHealth } from './health.ts'

/** A console warning of the row `name` that is given once per key. */
export function warnOnceFor(name: string): (key: string, text: string) => void {
  const warned = new Set<string>()
  return (key, text) => {
    if (warned.has(key)) return
    warned.add(key)
    console.warn(`${name}: ${text}`)
  }
}

/** A row's list of undo hooks: the row pushes what it registers, `drain` runs them last registered first (the cordis dispose order). */
export function disposerList(): { readonly list: Array<() => void>, readonly drain: () => void } {
  const list: Array<() => void> = []
  return { list, drain: () => { for (const undo of list.splice(0).reverse()) undo() } }
}

/** What is wrong with each session, by kind: a later success under the same kind clears it (`text` undefined). */
export interface SessionNotebook<Key extends string> {
  readonly note: (sessionId: string | undefined, key: Key, text: string | undefined) => void
  readonly notesOf: (sessionId: string) => ReadonlyMap<Key, string> | undefined
}

export function sessionNotebook<Key extends string>(): SessionNotebook<Key> {
  const sessions = new Map<string, Map<Key, string>>()
  return {
    note: (sessionId, key, text) => {
      if (sessionId === undefined) return
      const notes = sessions.get(sessionId) ?? new Map<Key, string>()
      if (text === undefined) notes.delete(key)
      else notes.set(key, text)
      sessions.set(sessionId, notes)
    },
    notesOf: sessionId => sessions.get(sessionId),
  }
}

/** What `whenPresent` needs of the row it works for. */
export interface OptionalServicesRow {
  /** The cordis plugin name, for the warning. */
  readonly name: string
  readonly ctx: Partial<InjectHost>
  /** What each slot is waiting for, or `undefined` when it is registered; the row's activation text is built from the slots. */
  readonly waiting: Record<string, string | undefined>
  readonly health: Pick<RowHealth, 'reactivate'>
  readonly activation: () => [HealthState, string]
}

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error)

/**
 * Run `install` once `service` is present and undo it when it leaves.
 * `slot` is the entry of `row.waiting` for it, `waitingText` what it says
 * while the service is absent, `label` what it is called in a warning.
 */
export function whenPresent<K extends keyof InjectableServices>(row: OptionalServicesRow, service: K, slot: string, waitingText: string, label: string, install: (services: Pick<InjectableServices, K>) => () => void): void {
  if (typeof row.ctx.inject !== 'function') {
    row.waiting[slot] = `宿主没有 inject，没有注册${label}`
    return
  }
  const off = (error: unknown): void => {
    console.warn(`${row.name}: ${label} is off: ${messageOf(error)}`)
    row.waiting[slot] = `${label}没注册上：${messageOf(error)}`
    row.health.reactivate(...row.activation())
  }
  try {
    row.ctx.inject([service], (services) => {
      try {
        const dispose = install(services)
        row.waiting[slot] = undefined
        row.health.reactivate(...row.activation())
        return () => {
          dispose()
          row.waiting[slot] = waitingText
          row.health.reactivate(...row.activation())
        }
      }
      catch (error) {
        off(error)
        return undefined
      }
    })
  }
  catch (error) {
    off(error)
  }
}
