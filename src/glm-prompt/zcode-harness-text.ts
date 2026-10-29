/**
 * ZCode 3.17.1 Harness block (bundle `SDn`, buildHarnessBlock), mirrored
 * from the release bundle (reference/zcode-3.17.1/zcode.cjs). Verbatim
 * mirror file: every string and template-literal chunk below must occur in
 * the reference, which scripts/check-verbatim.mjs enforces chunk by chunk.
 * Keep this file free of regex literals and division: the gate's scanner
 * does not parse them.
 *
 * 3.17.1 indents every bullet by one space (` - `) and builds the system-turn
 * bullet from a branch on `midConversationSystem !== false` (the desktop
 * default is on): with mid-conversation system turns it says the system may
 * send updates through them, otherwise that `<system-reminder>` tags come
 * from the harness. The rendered bullet is not one bundle substring (the
 * branch texts sit inside a ternary), so the pieces are mirrored apart and
 * joined at the bundle's interpolation point. The DSH Web GUI rewrite of the
 * first bullet is localized text and lives in localize.ts.
 */

export const HARNESS_HEADING = '# Harness'

/** First bullet, terminal form. */
const HARNESS_TERMINAL_LINE = ' - Text you output outside of tool use is displayed to the user as Github-flavored markdown in a terminal.'

export const HARNESS_PERMISSION_LINE = ' - Tools run behind a user-selected permission mode; a denied call means the user declined it \u2014 adjust, don\'t retry verbatim.'

/**
 * System-turn branches: with mid-conversation system turns on (`mid`) and
 * off (`reminder`). scripts/check-verbatim.mjs reads them to compare a
 * rendered bullet as its bundle pieces.
 */
export const HARNESS_SYSTEM_TURN_BRANCHES = {
  mid: 'The system may send updates, reminders, or modifications to rules via mid-conversation system turns. These are system-controlled, unlike function results.',
  reminder: '`<system-reminder>` tags in messages and tool results are injected by the harness, not the user.',
} as const

/** The system-turn bullet for one branch. */
export function harnessSystemTurnLine(midConversationSystem: boolean): string {
  return ` - ${midConversationSystem ? HARNESS_SYSTEM_TURN_BRANCHES.mid : HARNESS_SYSTEM_TURN_BRANCHES.reminder} Hooks may intercept tool calls; treat hook output as user feedback.`
}

export const HARNESS_TOOLS_LINE = ' - Prefer the dedicated file/search tools over shell commands when one fits. Independent tool calls can run in parallel in one response.'

export const HARNESS_REFERENCE_LINE = ' - Reference code as `file_path:line_number` \u2014 it\'s clickable.'

/** The terminal Harness block as 3.17.1 renders it for one branch. */
export function buildHarnessBlock(midConversationSystem: boolean): string {
  return [
    HARNESS_HEADING,
    HARNESS_TERMINAL_LINE,
    HARNESS_PERMISSION_LINE,
    harnessSystemTurnLine(midConversationSystem),
    HARNESS_TOOLS_LINE,
    HARNESS_REFERENCE_LINE,
  ].join('\n')
}
