/**
 * The shape of a ZCode deferred tool call and the one unwrapper the follow-up
 * recorder (src/guard/followup.ts) and the changed-file detection (m4-checks)
 * share. ZCode 3.17.1 wraps a deferred tool in `DeferredToolCall {name,
 * input}`: the wrapper itself is a root call without `parent` that passes
 * `tools/pre-execute` first, and the target then runs as a second root call
 * whose id is `<callId>:deferred` (src/toolsearch/index.ts:155–175, the file
 * header calls this intentional). Readers that care about what the model was
 * actually reaching for unwrap the wrapper before comparing: ZCode's
 * `DeferredToolCallInputSchema` is strict — exactly a non-empty `name` and an
 * object `input` (tests/fake-rc3.ts parseDeferredInput mirrors it).
 */
import type { JsonValue } from './json.ts'
import { DEFERRED_TOOL_CALL_NAME } from './zcode-notice.ts'

/** What a wrapped call was reaching for: the target tool's own name and arguments. */
export interface DeferredTarget {
  readonly name: string
  readonly arguments: JsonValue
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The target of a `DeferredToolCall` wrapper, or undefined when the call is
 * not one: the name differs, an argument field is missing or extra, or
 * `input` is not an object. The wrapper itself is never a target.
 */
export function unwrapDeferredCall(name: string, args: unknown): DeferredTarget | undefined {
  if (name !== DEFERRED_TOOL_CALL_NAME || !isRecord(args)) return undefined
  if (Object.keys(args).some(key => key !== 'name' && key !== 'input')) return undefined
  const { name: target, input } = args
  if (typeof target !== 'string' || target.length === 0 || !isRecord(input)) return undefined
  return { name: target, arguments: input as JsonValue }
}
