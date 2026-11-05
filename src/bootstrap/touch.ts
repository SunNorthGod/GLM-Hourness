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

/** The most paths one rule's `filter.writes.paths` takes (the loop board's `pathsRefusal`, which the rules board's check uses). */
const RULE_PATH_LIMIT = 20
/** The most paths the rule's title names. */
const TITLE_PATHS = 6

/** The arguments of `rules_propose` for the repository paths of `不许碰：` (§5.4 step 1); the rules board's check reads `{...body, reason}`. */
export interface RuleDraft {
  readonly kind: 'rule'
  readonly body: {
    readonly id: string
    readonly title: string
    readonly scope: 'project'
    readonly when: { readonly kind: 'event', readonly events: readonly ['gate.tool-call'] }
    readonly filter: { readonly writes: { readonly paths: readonly string[] } }
    readonly action: { readonly kind: 'block' }
    readonly lifetime: { readonly kind: 'until-lifted' }
    readonly source: 'norm-decision-tiers'
  }
  readonly reason: string
}

/**
 * The rule draft of one takeover over the repository paths of `不许碰：`
 * (touchPaths' `inside`). A path is written as the board writes paths
 * (forward slashes, `*` and `**` only); a path the board would refuse (a
 * backslash, `?`, brackets, braces) and the paths past twenty are left out
 * and listed in `left`, for the main agent to put to the human by hand.
 */
export function ruleDraft(takeoverId: string, inside: readonly string[]): { readonly draft?: RuleDraft, readonly left: readonly string[] } {
  const sound = (path: string): boolean => path !== '' && !/[\\?[\]{}]/.test(path) && !path.startsWith('/') && !/^[A-Za-z]:/.test(path) && !path.split('/').includes('..')
  const paths = [...new Set(inside)].filter(sound).slice(0, RULE_PATH_LIMIT)
  const left = inside.filter(path => !paths.includes(path))
  if (paths.length === 0) return { left }
  const named = paths.slice(0, TITLE_PATHS).join('、')
  const title = `不许改这些地方：${named}${paths.length > TITLE_PATHS ? ` 等 ${paths.length} 处` : ''}`
  return {
    draft: {
      kind: 'rule',
      body: {
        id: `r-no-touch-${takeoverId}`,
        title: [...title].length > 120 ? `${[...title].slice(0, 119).join('')}…` : title,
        scope: 'project',
        when: { kind: 'event', events: ['gate.tool-call'] },
        filter: { writes: { paths } },
        action: { kind: 'block' },
        lifetime: { kind: 'until-lifted' },
        source: 'norm-decision-tiers',
      },
      reason: `接管 ${takeoverId} 时你说这些地方不许碰（norm-decision-tiers 的「不许碰」）`,
    },
    left,
  }
}
