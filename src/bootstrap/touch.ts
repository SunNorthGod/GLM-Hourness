/**
 * The paths in the value of the label `不许碰：` (takeover design 0.6 §5.4,
 * §12). Pure. The value is cut at `、`, `，`, `,`, `；`, `;` and white
 * space. A word that starts with `~`, `/`, `\`, `%`, `$` or a drive letter,
 * or holds `..`, is a path outside the repository (the guard's workspace
 * confinement already stops writes there; it only goes into the norm's
 * text). A path followed by 「只写进规范」 — as the next word, in brackets
 * after it, or joined to its end — is skipped: the person does not want a
 * rule for it. Any other word with `/`, `.` or `*` is a path inside the
 * repository, at most 40 of them; the rest are words of the description,
 * listed so the full text can show what was not read as a path. The value
 * `无` has no paths.
 */

/** The marker after a path that the person wants in the norm only, without a rule (§5.4 step 3). */
const NORM_ONLY = '只写进规范'
/** The most repository paths one rule draft takes (§12). */
const TOUCH_PATH_LIMIT = 40

interface TouchPaths {
  /** Repository paths, as written: the rule draft's `filter.writes.paths`. */
  readonly inside: readonly string[]
  /** Paths outside the repository: the norm's text only. */
  readonly outside: readonly string[]
  /** Paths the person marked 「只写进规范」. */
  readonly normOnly: readonly string[]
  /** Words that are not paths, and repository paths beyond the limit. */
  readonly unrecognized: readonly string[]
}

const OUTSIDE = /^(?:[~/\\%$]|[A-Za-z]:)/
const MARKER = new RegExp(`^[（(]?${NORM_ONLY}[）)]?$`)
const MARKED = new RegExp(`^(.+?)[（(]?${NORM_ONLY}[）)]?$`)
/** A bracketed note at the end of a word: `generated/（生成的）`. */
const NOTE = /^(.+?)[（(][^）)]*[）)]$/

export function touchPaths(value: string): TouchPaths {
  const inside: string[] = []
  const outside: string[] = []
  const normOnly: string[] = []
  const unrecognized: string[] = []
  const trimmed = value.trim()
  if (trimmed === '无' || trimmed.length === 0) return { inside, outside, normOnly, unrecognized }
  const words = trimmed.split(/[、，,；;\s]+/).filter(word => word.length > 0)
  for (const [index, raw] of words.entries()) {
    if (MARKER.test(raw)) continue
    const marked = MARKED.exec(raw)
    let word = marked?.[1] ?? raw
    word = NOTE.exec(word)?.[1] ?? word
    const skipped = marked !== null || MARKER.test(words[index + 1] ?? '')
    const isPath = OUTSIDE.test(word) || word.includes('..') || /[/.*]/.test(word)
    if (!isPath) {
      unrecognized.push(raw)
      continue
    }
    if (skipped) normOnly.push(word)
    else if (OUTSIDE.test(word) || word.includes('..')) outside.push(word)
    else if (inside.length < TOUCH_PATH_LIMIT) inside.push(word)
    else unrecognized.push(word)
  }
  return { inside, outside, normOnly, unrecognized }
}
