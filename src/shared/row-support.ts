/**
 * What the memory row and the lessons row do alike when they start and while
 * they run: warn on the console once per reason, keep the notes each
 * session's health is built from, and take the services that may arrive after
 * activation (the commands and the session projections; cordis `ctx.inject`,
 * cordis:1600). A row works all the same without those services; its health
 * says what is not registered while one is absent, and goes back to normal
 * when the service comes (and again says it when the service leaves).
 */
import type { InjectHost, InjectableServices, SessionLike, SessionProjectionDefinition, SessionProjectionHandle, SessionProjectionsService } from './dsh-min.ts'
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

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  (typeof value === 'object' || typeof value === 'function') && value !== null && typeof (value as { then?: unknown }).then === 'function'

/** Handle returned by `registerSessionProjection`: synchronous disposer plus `stateOf` using the resolved `rc.1` handle when available. */
export interface ProjectionRegistration<S = unknown> {
  readonly ok: boolean
  readonly dispose: () => void
  readonly stateOf: (session: SessionLike) => S | undefined
}

/** Options for `registerSessionProjection`. */
export interface RegisterProjectionOptions {
  readonly rowName?: string
  readonly label?: string
  readonly health?: Pick<RowHealth, 'report'> & Partial<Pick<RowHealth, 'reactivate'>>
  readonly sessionId?: string
  readonly onError?: (error: unknown) => void
}

/**
 * Register a session projection against either legacy sync `() => void` or
 * `0.2.2-rc.1` callable-thenable `sessionProjections.register`, observing the
 * promise so async rejections degrade health and warn instead of triggering
 * `rc.1`'s unobserved logger error.
 */
export function registerSessionProjection<S = unknown>(
  projections: Pick<SessionProjectionsService, 'register'> & Partial<Pick<SessionProjectionsService, 'stateOf'>>,
  definition: SessionProjectionDefinition,
  options: RegisterProjectionOptions = {},
): ProjectionRegistration<S> {
  let resolved: SessionProjectionHandle<S> | undefined
  let failed = false
  let disposed = false
  let rawDispose: (() => void | Promise<void>) | undefined

  const fail = (error: unknown): void => {
    if (disposed || failed) return
    failed = true
    const reason = `${options.label ?? definition.key}没注册上：${messageOf(error)}`
    if (options.onError !== undefined) {
      options.onError(error)
    }
    else if (options.rowName !== undefined) {
      console.warn(`${options.rowName}: ${options.label ?? definition.key} is off: ${messageOf(error)}`)
    }
    if (options.health !== undefined) {
      if (options.sessionId !== undefined) options.health.report(options.sessionId, 'degraded', reason)
      else if (options.onError === undefined) options.health.reactivate?.('degraded', reason)
    }
  }

  try {
    const registration = projections.register(definition)
    rawDispose = registration
    if (isThenable(registration)) {
      void registration.then(
        (handle) => {
          const typed = handle as SessionProjectionHandle<S> | undefined
          if (disposed) {
            if (typed !== undefined && typeof typed.dispose === 'function') void Promise.resolve(typed.dispose()).catch(() => {})
            return
          }
          if (typed !== undefined && typeof typed.stateOf === 'function') resolved = typed
        },
        (error: unknown) => {
          fail(error)
        },
      )
    }
  }
  catch (error) {
    fail(error)
    return {
      ok: false,
      dispose: () => { disposed = true },
      stateOf: () => undefined,
    }
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    const target = resolved !== undefined ? () => resolved!.dispose() : rawDispose
    if (target === undefined) return
    try {
      const outcome = target()
      if (isThenable(outcome)) void outcome.then(undefined, () => {})
    }
    catch {
      // ignore disposal failure
    }
  }

  const stateOf = (session: SessionLike): S | undefined => {
    if (failed || disposed) return undefined
    if (resolved !== undefined) return resolved.stateOf(session)
    return projections.stateOf?.(session, definition.key) as S | undefined
  }

  return { ok: true, dispose, stateOf }
}

/**
 * Run `install` once `service` is present and undo it when it leaves.
 * `slot` is the entry of `row.waiting` for it, `waitingText` what it says
 * while the service is absent, `label` what it is called in a warning.
 */
export function whenPresent<K extends keyof InjectableServices>(
  row: OptionalServicesRow,
  service: K,
  slot: string,
  waitingText: string,
  label: string,
  install: (services: Pick<InjectableServices, K>) => (() => void | Promise<void>) | ProjectionRegistration<unknown>,
): void {
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
      let active = true
      try {
        const outcome = install(services)
        if (typeof outcome === 'object' && outcome !== null && 'ok' in outcome) {
          if (!outcome.ok) return undefined
          row.waiting[slot] = undefined
          row.health.reactivate(...row.activation())
          return () => {
            active = false
            outcome.dispose()
            row.waiting[slot] = waitingText
            row.health.reactivate(...row.activation())
          }
        }
        if (isThenable(outcome)) {
          void outcome.then(undefined, (error: unknown) => {
            if (active) off(error)
          })
        }
        row.waiting[slot] = undefined
        row.health.reactivate(...row.activation())
        return () => {
          active = false
          const res = outcome()
          if (isThenable(res)) void res.then(undefined, () => {})
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

/** Register an optional session projection through `whenPresent`, handling both sync throws and async rejections. */
export function whenSessionProjection<S = unknown>(
  row: OptionalServicesRow,
  slot: string,
  waitingText: string,
  label: string,
  definition: SessionProjectionDefinition,
): void {
  whenPresent(row, 'sessionProjections', slot, waitingText, label, ({ sessionProjections }) => {
    let active = true
    const reg = registerSessionProjection<S>(sessionProjections, definition, {
      onError: (error) => {
        if (!active) return
        console.warn(`${row.name}: ${label} is off: ${messageOf(error)}`)
        row.waiting[slot] = `${label}没注册上：${messageOf(error)}`
        row.health.reactivate(...row.activation())
      },
    })
    return {
      ok: reg.ok,
      dispose: () => {
        active = false
        reg.dispose()
      },
      stateOf: reg.stateOf,
    }
  })
}
