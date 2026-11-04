/**
 * Path matching over tool-call spellings (m4-gate G3, design §2.2, §3.5):
 * the one normalizer a rule compares paths through, and the matcher that
 * decides whether a shell command's text names a repository-relative path
 * under any prefix. Rules that keep a board's files to the board share these,
 * so two rules cannot grow two opinions about what "the same path" means.
 */
import { normalizePath } from './rules.ts'

/**
 * The comparison key of a path: forward slashes, lower case (design §3.5,
 * review finish2 round 2 N27 — the checkout roots of a work tree and a
 * session's cwd can differ in drive case and slash direction on Windows).
 */
export function pathKey(path: string): string {
  return normalizePath(path)
}

/** Characters that continue a file name: the boundary check of mentionsPath. */
const NAME_CHAR = /[A-Za-z0-9._-]/

/**
 * Whether `text` (a shell command, one spelling) names the
 * repository-relative `relative` path under any prefix: `./docs/guard/x`,
 * `../guard/x`, `c:\repo\docs\guard\x` all match, while `x-docs/guard/x` and
 * `docs/guard/x.bak` do not (the character hugging the match is a name
 * character). Backslashes, slash direction and case are unified before the
 * comparison (design §3.5 item 2).
 */
export function mentionsPath(text: string, relative: string): boolean {
  const haystack = pathKey(text)
  const needle = pathKey(relative)
  if (needle.length === 0) return false
  let at = haystack.indexOf(needle)
  while (at >= 0) {
    const before = at === 0 ? '' : haystack[at - 1]
    const after = at + needle.length >= haystack.length ? '' : haystack[at + needle.length]
    if (!(before !== '' && NAME_CHAR.test(before)) && !(after !== '' && NAME_CHAR.test(after))) return true
    at = haystack.indexOf(needle, at + 1)
  }
  return false
}
