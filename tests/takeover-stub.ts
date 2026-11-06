/**
 * A scripted takeover service for the specs of the design row's two seams
 * (tests/design-mode.spec.ts, tests/design-stage-notice.spec.ts): it has the
 * members M3 calls (`WishSeam`, src/bootstrap/service.ts), says what each
 * spec tells it to, and keeps what it was asked. The takeover itself is
 * tested on the real service in tests/bootstrap-row.spec.ts.
 */
import { BOOTSTRAP_SERVICE, type PrepareRequest, type PrepareResult, type WishSeam } from '../src/bootstrap/service.ts'
import type { DesignInvocationLike } from '../src/shared/dsh-min.ts'
import type { DesignHost } from './design-host.ts'

interface TakeoverStub extends WishSeam {
  /** What `wants` answers; an Error is thrown. */
  wanted: boolean | Error
  /** What `prepare` answers; an Error is thrown. */
  result: PrepareResult | Error
  /** What `prepare` does before it answers (the real one makes the graph directory). */
  onPrepare: (invocation: DesignInvocationLike) => void
  /** The goals `holds` says yes to; `holdsError` makes it throw instead. */
  readonly holding: Set<string>
  holdsError: Error | undefined
  readonly asked: { readonly wants: string[], readonly prepare: PrepareRequest[], readonly holds: Array<{ readonly cwd: string, readonly goalId: string }> }
}

function takeoverStub(): TakeoverStub {
  const stub: TakeoverStub = {
    wanted: true,
    result: { ok: true, text: '开了接管 tk-stub0001（已有项目）', holdWish: false },
    onPrepare: () => undefined,
    holding: new Set(),
    holdsError: undefined,
    asked: { wants: [], prepare: [], holds: [] },
    wants(cwd) {
      stub.asked.wants.push(cwd)
      if (stub.wanted instanceof Error) return Promise.reject(stub.wanted)
      return Promise.resolve(stub.wanted)
    },
    prepare(invocation, request) {
      stub.asked.prepare.push(request)
      stub.onPrepare(invocation)
      if (stub.result instanceof Error) return Promise.reject(stub.result)
      return Promise.resolve(stub.result)
    },
    holds(cwd, goalId) {
      stub.asked.holds.push({ cwd, goalId })
      if (stub.holdsError !== undefined) throw stub.holdsError
      return stub.holding.has(goalId)
    },
  }
  return stub
}

/** Put a stub into the host's store as the takeover row would. */
export function provideTakeover(host: DesignHost): TakeoverStub {
  const stub = takeoverStub()
  host.services.set(BOOTSTRAP_SERVICE, stub)
  return stub
}
