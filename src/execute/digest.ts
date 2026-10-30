/**
 * The digest the execution layer writes into briefs, plans and comments:
 * the first 12 hex digits of the SHA-256 of a text. The pure graph module
 * src/graph/pins.ts takes the full-length function as a parameter instead
 * of importing node:crypto, so the DSH client can import it too.
 */
import { createHash } from 'node:crypto'

/** SHA-256 of the UTF-8 text, 64 lowercase hex digits. */
function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** The short form the brief footer, plan header and comments carry. */
export function digest12(text: string): string {
  return sha256Hex(text).slice(0, 12)
}
