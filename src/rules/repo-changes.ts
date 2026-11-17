/**
 * The rules board's uncommitted-changes check (docs/ORCHESTRATION.md §16.16;
 * design §6.4): the board has written the rules directory of the repository,
 * and the person has not committed what it wrote — the main agent is to carry
 * those files in its next commit, and its reminder says so until a `git diff
 * --quiet HEAD -- <rules directory>` comes out clean again. The host with the
 * row looks once a minute after a write, stops asking when the diff is clean,
 * and starts again when the board writes once more (the `at` of
 * `.llm/rules/repo-written.json` changes). The git call goes through the
 * shared git executor (§17.5: harness-run git starts there and nowhere else);
 * this module starts no process of its own.
 */
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, relative, sep } from 'node:path'
import { createGit } from '../execute/git.ts'

/** How often a host looks, after a write of the rules directory (design §6.4). */
export const REPO_CHECK_MS = 60_000

export interface RepoChangesDeps {
  readonly warn: (message: string) => void
}

export interface RepoChanges {
  /** Look at one project once. `rulesDir` is the row's configured rules directory, absolute or relative to the project root. */
  check(root: string, rulesDir: string): Promise<void>
  /** The reminder line for the project, or `undefined` when there is nothing to carry (or the board never wrote the rules directory there). */
  line(root: string): string | undefined
}

/** What one project's last look left: the write the check answered, what it found, and whether it stopped asking. */
interface Watch {
  /** The `at` of the `repo-written.json` this watch last saw; a new write restarts the asking. */
  at: string | undefined
  /** The rules directory as the repository names it, when it is one under the root. */
  path: string | undefined
  differs: boolean
  stopped: boolean
}

const LINE = (path: string): string => `Rules board: ${path} has changes the human made that are not committed yet; include them in your next commit.`

export function watchRepoChanges(deps: RepoChangesDeps): RepoChanges {
  const git = createGit()
  const watched = new Map<string, Watch>()
  const warned = new Set<string>()

  const stateOf = (root: string): Watch => {
    let watch = watched.get(root)
    if (watch === undefined) {
      watch = { at: undefined, path: undefined, differs: false, stopped: false }
      watched.set(root, watch)
    }
    return watch
  }

  async function check(root: string, rulesDir: string): Promise<void> {
    const watch = stateOf(root)
    const under = relative(root, isAbsolute(rulesDir) ? rulesDir : root + sep + rulesDir.replaceAll('\\', '/'))
    watch.path = under === '' || under.startsWith('..') || isAbsolute(under) ? undefined : under.replaceAll(sep, '/')
    const file = root + sep + '.llm' + sep + 'rules' + sep + 'repo-written.json'
    if (watch.path === undefined || !existsSync(file)) {
      watch.differs = false
      watch.stopped = false
      watch.at = undefined
      return
    }
    let at: string | undefined
    try {
      const written: unknown = JSON.parse(readFileSync(file, 'utf8'))
      at = typeof (written as { at?: unknown })?.at === 'string' ? (written as { at: string }).at : undefined
    }
    catch {
      // A record that cannot be read says nothing; the previous answer stands.
      return
    }
    if (watch.at !== at) {
      watch.at = at
      watch.stopped = false
    }
    if (watch.stopped) return
    const clean = await git.diffQuiet(root, watch.path)
    if (!clean.ok) {
      if (!warned.has(root)) {
        warned.add(root)
        deps.warn(`the uncommitted-changes check of ${root} could not read git: ${clean.reason}`)
      }
      return
    }
    warned.delete(root)
    watch.differs = !clean.value
    if (clean.value) watch.stopped = true
  }

  function line(root: string): string | undefined {
    const watch = watched.get(root)
    return watch !== undefined && watch.differs && watch.path !== undefined ? LINE(watch.path) : undefined
  }

  return { check, line }
}
