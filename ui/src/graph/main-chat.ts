/**
 * Where the main agent's conversation is: the pure half of MainChat.tsx
 * (plain-ui 1.3 §4.9) - the choice between the three results and the
 * fallback, and the working-directory key the fallback normalizes by. The
 * record's shape and its parser live in src/shared/holder-record.ts, the
 * one source the host and the client both parse with. No React, no Node
 * built-ins: the client bundle inlines it and the L2 tests import it
 * directly.
 */

/**
 * A working directory normalized the way M3's projectKey does it: `\`
 * to `/`, no trailing `/`, lower case on Windows. The client has no
 * process.platform, so the caller says whether this is Windows.
 */
export function cwdKeyOf(path: string, windows: boolean): string {
  const slashed = path.replaceAll('\\', '/').replace(/\/+$/, '')
  return windows ? slashed.toLowerCase() : slashed
}

/** What the read of the holder record came to, as far as the choice needs to know. */
export type HolderReading =
  | { readonly kind: 'held', readonly sessionId: string }
  | { readonly kind: 'absent' }
  | { readonly kind: 'unreadable', readonly reason: string }

/** The three results of §4.9 step 3, plus the unreadable fallback of step 4. */
export type MainChat =
  | { readonly kind: 'here' }
  | { readonly kind: 'there', readonly sessionId: string, readonly guessed: boolean }
  | { readonly kind: 'absent' }
  | { readonly kind: 'lost', readonly reason: string }

/**
 * The choice, pure so the tests can table it: a held record decides by
 * itself; an absent one says there is no main agent (the fallback is not
 * consulted - the record was readable and names nobody); an unreadable
 * one falls back to the sessions in main-agent mode with the same
 * working directory, exactly one wins and is marked as guessed, none or
 * several lose with the reason.
 */
export function mainChatOf(reading: HolderReading, sessionId: string, fallback: readonly string[]): MainChat {
  if (reading.kind === 'held') {
    return reading.sessionId === sessionId ? { kind: 'here' } : { kind: 'there', sessionId: reading.sessionId, guessed: false }
  }
  if (reading.kind === 'absent') return { kind: 'absent' }
  const found = [...new Set(fallback)]
  if (found.length === 1) {
    return found[0] === sessionId ? { kind: 'here' } : { kind: 'there', sessionId: found[0], guessed: true }
  }
  const where = found.length === 0 ? '本工作区的会话里没有哪个对话在主 Agent 模式' : `本工作区的会话里有 ${found.length} 个对话在主 Agent 模式`
  return { kind: 'lost', reason: `主 Agent 记录读不出来（${reading.reason}），${where}` }
}
