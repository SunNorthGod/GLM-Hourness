/**
 * Find the files a shell command line writes through output redirections
 * (see README.md for the conventions).
 */
const OPERATOR = /([1-6*])?(>>?)(?!&)\s*("[^"]*"|'[^']*'|[^\s;|&]+)/g
const DISCARDS = new Set(['nul', '$null', '/dev/null'])

const unquote = word => (word.startsWith('"') || word.startsWith('\'')) && word.length >= 2 ? word.slice(1, -1) : word

/** The redirection targets of `command`, in the order they appear. */
export function redirectTargets(command) {
  if (typeof command !== 'string') throw new TypeError('command must be a string')
  const targets = []
  for (const match of command.matchAll(OPERATOR)) {
    const target = unquote(match[3])
    if (target.length === 0 || DISCARDS.has(target.toLowerCase())) continue
    targets.push(target)
  }
  return targets
}

/** Whether `command` writes any file through a redirection. */
export function writesFiles(command) {
  return redirectTargets(command).length > 0
}
