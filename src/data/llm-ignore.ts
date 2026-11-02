/**
 * Keep a project's `.llm/` out of git before the harness writes anything
 * into it (M4 design §7.3): the line `.llm/` goes to the clone's
 * `info/exclude` (never committed), and `git check-ignore` verifies it took
 * effect — a negation pattern in a tracked `.gitignore` wins over
 * `info/exclude`, and only the check sees that. The work runs once per
 * process and repository; the caller turns the outcome into its row health
 * and writes its records all the same.
 */
import { execFile } from 'node:child_process'
import { statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureIgnored, gitDirOf } from './project-root.ts'

/** What one ensure run came to. */
export type LlmIgnoreOutcome =
  | { readonly kind: 'ignored', readonly appended: boolean }
  | { readonly kind: 'no-git' }
  /** The append or the check could not run (permissions, no git, too slow). */
  | { readonly kind: 'unwritable', readonly reason: string }
  /** The line is in place but the path is still visible to git. */
  | { readonly kind: 'visible', readonly reason: string }

/** The path `git check-ignore` is run against; it need not exist. */
const LLM_IGNORE_PROBE = '.llm/scratch/x'

/** How long one git check may take. */
const CHECK_MS = 5000

function git(root: string, args: readonly string[]): Promise<{ readonly code: number, readonly out: string, readonly err: string }> {
  return new Promise((resolve) => {
    execFile('git', ['-C', root, ...args], { timeout: CHECK_MS }, (error, stdout, stderr) => {
      // execFile hands null on a zero exit and an Error with a numeric code otherwise.
      const code = error === null ? 0 : typeof error.code === 'number' ? error.code : -1
      resolve({ code, out: String(stdout), err: String(stderr) })
    })
  })
}

async function once(root: string): Promise<LlmIgnoreOutcome> {
  const gitDir = gitDirOf(root)
  if (gitDir === undefined) return { kind: 'no-git' }
  try {
    if (!statSync(gitDir).isDirectory()) return { kind: 'no-git' }
  }
  catch {
    return { kind: 'no-git' }
  }
  let appended: boolean
  try {
    appended = await ensureIgnored(root, '.llm')
  }
  catch (error) {
    return { kind: 'unwritable', reason: error instanceof Error ? error.message : String(error) }
  }
  // The check runs against the scratch area: what has to be invisible is the
  // directory the harness writes into, not the name alone.
  const checked = await git(root, ['check-ignore', '-q', LLM_IGNORE_PROBE])
  if (checked.code === 0) return { kind: 'ignored', appended }
  return { kind: 'visible', reason: await visibleReason(root, checked) }
}

/**
 * Why the path is still visible: `git check-ignore -v` names the matching
 * pattern when there is one; a negation (`!/.llm/` in a tracked .gitignore)
 * leaves no final match and prints nothing, so the lines that mention `.llm`
 * name themselves instead.
 */
async function visibleReason(root: string, checked: { readonly code: number }): Promise<string> {
  const why = await git(root, ['check-ignore', '-v', '--no-index', LLM_IGNORE_PROBE])
  if (why.out.trim() !== '') return why.out.trim()
  if (why.code !== 0 && why.code !== 1) return `git check-ignore failed: ${why.err.trim() !== '' ? why.err.trim() : `exit ${why.code}`}`
  const mentions: string[] = []
  for (const file of ['.gitignore', '.git/info/exclude']) {
    let text: string
    try {
      text = await readFile(join(root, ...file.split('/')), 'utf8')
    }
    catch {
      continue
    }
    text.split(/\r?\n/).forEach((line, index) => {
      if (line.includes('.llm')) mentions.push(`${file}:${index + 1}:${line.trim()}`)
    })
  }
  return mentions.length > 0 ? mentions.join('; ') : `git check-ignore -q exited ${checked.code}`
}

const done = new Map<string, Promise<LlmIgnoreOutcome>>()

/**
 * Make `<root>`'s `.llm/` git-ignored, once per process and repository:
 * every call for the same root waits for (or reuses) the first run's
 * outcome. Never rejects.
 */
export function ensureLlmIgnored(root: string): Promise<LlmIgnoreOutcome> {
  const key = root.replace(/[\\/]+$/, '')
  const known = done.get(key)
  if (known !== undefined) return known
  const run = once(root).catch((error: unknown): LlmIgnoreOutcome => ({ kind: 'unwritable', reason: error instanceof Error ? error.message : String(error) }))
  done.set(key, run)
  return run
}
