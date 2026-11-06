/**
 * Text that looks like a secret (M5 design §5.6): the check that keeps
 * tokens out of memory entries, lessons and the evidence beside them, which
 * reach briefs, handbacks and, through a fallback comment, a pushed graph.
 * The same table redacts the loop board's script output
 * (src/loops/run.ts) and the session transcript export
 * (src/data/transcript.ts, docs/DESIGN.md §2.4).
 *
 * Pure functions, no Node built-ins: the orchestration package's handback
 * code imports them too. The classes are judged in the order of
 * `SECRET_CLASSES`, the first match wins, and the same table drives
 * `redactSecrets`, so a text is left alone by one exactly when the other
 * finds nothing.
 *
 * The token class is a token shape, not "32 base64 characters": a plain
 * path (`cli/packages/core/src/context/sections/memory`) and a long
 * camel-case identifier (`buildProviderEndpointRoutingHeaders`) must pass,
 * because rejecting them would bring back the "a path cannot be stored"
 * failure that this check replaces. `/` and `.` cut a string into short
 * runs, an identifier has no digit or no capital, and a random token has
 * all three kinds of character.
 */

import { refuse, type Refusal } from './refusal.ts'

/** What a secret looked like. */
export type SecretClass = 'prefix' | 'bearer' | 'pem' | 'token' | 'hex'

interface ClassSpec {
  readonly name: SecretClass
  /** Global pattern; the whole match is the span to hide. */
  readonly pattern: RegExp
  /** Whether a match counts (the token class needs all three kinds of character). */
  readonly accepts?: (match: string) => boolean
  /** The rejection text for a match. */
  readonly message: (match: string) => string
}

const REMOVE = 'remove it'
const looksLike = (detail: string): string => `looks like a secret (${detail}); ${REMOVE}`

const NAMED_PREFIX = /^(?:sk-|ghp_|gho_|ghs_|github_pat_|xoxb-|xoxp-|AKIA)/

const SECRET_CLASSES: readonly ClassSpec[] = [
  {
    name: 'prefix',
    // A named prefix at the start or after a character that cannot continue a word (`task-3` holds `sk-` after a letter), then 16 more; or an AWS access key id.
    pattern: /(?<![A-Za-z0-9_])(?:sk-|ghp_|gho_|ghs_|github_pat_|xoxb-|xoxp-)[A-Za-z0-9_-]{16,}|AKIA[A-Z0-9]{16}/g,
    message: match => looksLike(`prefix: ${NAMED_PREFIX.exec(match)?.[0] ?? match.slice(0, 4)}`),
  },
  {
    name: 'bearer',
    pattern: /Bearer [A-Za-z0-9._~+/=-]{20,}/g,
    message: () => looksLike('bearer: Bearer'),
  },
  {
    name: 'pem',
    // The header, and the key body up to its END line when the text has one (RFC 7468), so redaction hides the body too; the body's base64 lines are cut by `/` into runs the token class can miss.
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----(?:[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----)?/g,
    message: () => looksLike('pem: PEM header'),
  },
  {
    name: 'token',
    // `/` and `.` are left out of the run on purpose (see the file comment).
    pattern: /[A-Za-z0-9+=_-]{32,}/g,
    accepts: match => /\d/.test(match) && /[A-Z]/.test(match) && /[a-z]/.test(match),
    message: () => looksLike('token shape: 32+ letters and digits mixing upper and lower case'),
  },
  {
    name: 'hex',
    pattern: /(?<![A-Za-z0-9])[0-9a-fA-F]{32,}(?![A-Za-z0-9])/g,
    message: () => `${looksLike('hex: 32+ hex digits')}, or write a short commit id instead of a full one`,
  },
]

/** A secret-like text: its class and the rejection text for the person or model that wrote it (never the secret itself). */
export interface SecretFinding {
  readonly secretClass: SecretClass
  readonly message: string
}

function matchesOf(spec: ClassSpec, text: string): string[] {
  return [...text.matchAll(spec.pattern)].map(match => match[0]).filter(match => spec.accepts?.(match) ?? true)
}

/** The first class that matches `text`, in table order, leaving out the classes in `skip`; undefined when none does. */
export function findSecret(text: string, skip: readonly SecretClass[] = []): SecretFinding | undefined {
  for (const spec of SECRET_CLASSES) {
    if (skip.includes(spec.name)) continue
    const [match] = matchesOf(spec, text)
    if (match !== undefined) return { secretClass: spec.name, message: spec.message(match) }
  }
  return undefined
}

/**
 * The class of the first secret shape in `text`, or undefined. `skip` is for
 * the evidence check (src/data/evidence.ts), which knows that identifiers
 * issued by the host are not typed in from a report; other callers pass none.
 */
export function looksSecret(text: string, skip?: readonly SecretClass[]): SecretClass | undefined {
  return findSecret(text, skip)?.secretClass
}

/** The refusal for the first of the named texts (field name, value) that looks like a secret; values that are not text are not looked at. */
export function secretRefusal(fields: ReadonlyArray<readonly [string, unknown]>): Refusal<'secret_like'> | undefined {
  for (const [field, text] of fields) {
    const found = typeof text === 'string' ? findSecret(text) : undefined
    if (found !== undefined) return refuse('secret_like', found.message, field)
  }
  return undefined
}

/** What takes the place of a run that matches a class. */
export const REDACTED = '[redacted]'

/**
 * `text` with every run that matches a class (not in `skip`) replaced by
 * REDACTED, and how many runs were replaced. Throws what the pattern engine
 * throws: on Node 22 a single run of several million token characters
 * overflows V8's regular-expression backtrack stack (RangeError).
 */
export function redactSecretsCounted(text: string, skip: readonly SecretClass[] = []): { readonly text: string, readonly replaced: number } {
  let result = text
  let replaced = 0
  for (const spec of SECRET_CLASSES) {
    if (skip.includes(spec.name)) continue
    result = result.replace(spec.pattern, (match) => {
      if (!(spec.accepts?.(match) ?? true)) return match
      replaced += 1
      return REDACTED
    })
  }
  return { text: result, replaced }
}

/** `text` with every run that matches a class (not in `skip`) replaced by `[redacted]`. */
export function redactSecrets(text: string, skip: readonly SecretClass[] = []): string {
  return redactSecretsCounted(text, skip).text
}
