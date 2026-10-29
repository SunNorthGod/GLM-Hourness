/**
 * The two ZCode 3.16.3 texts both packages use, mirrored from the release
 * bundle (resources/glm/zcode.cjs): the name of the deferred-call wrapper
 * and the <system-reminder> wrapping every harness notice uses on every
 * route (docs/DESIGN.md §5.9, §6). Verbatim mirror file: every string and
 * template-literal chunk below must occur in a ZCode reference, which
 * scripts/check-verbatim.mjs enforces chunk by chunk. Keep this file free
 * of regex literals and division: the gate's scanner does not parse them.
 */

export const DEFERRED_TOOL_CALL_NAME = 'DeferredToolCall'

const NESTED_SYSTEM_REMINDER_TAG = new RegExp('<\\/?system-reminder\\b', 'gi')

/** Neutralize nested tags, then wrap (bundle `kP` for a provider-visible source without trailing newline). */
export function wrapSystemReminder(body: string): string {
  const content = body.replace(NESTED_SYSTEM_REMINDER_TAG, tag => `&lt;${tag.slice(1)}`)
  return ['<system-reminder>', content, '</system-reminder>'].join(`
`)
}
