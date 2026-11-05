/**
 * Which lines of a file count as changed for the checks notice (M4 design
 * §6.4): in a git checkout the new-side lines of `git diff -U0 HEAD` (so
 * earlier uncommitted edits of the session count too), and the whole file
 * when git does not track it or the checkout has no HEAD yet; outside git
 * the places the session's `edit` calls put their new text, and the whole
 * file for any other write. Findings on these lines are marked `[changed]`,
 * the rest `[elsewhere in file]`. git runs through src/data/git-process.ts
 * (no shell, five seconds).
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runGit, type GitRun } from '../data/git-process.ts'

/** What the session's calls wrote into one file: a whole write, or the new text of edits (`all` for replace_all). */
export interface EditMarks {
  readonly whole: boolean
  readonly inserts: ReadonlyArray<{ readonly text: string, readonly all: boolean }>
}

/** Every line, or these line numbers (1-based). */
export type ChangedLines = 'all' | ReadonlySet<number>

/** The new-side line numbers of a `git diff -U0` text. Pure. */
export function diffLines(diff: string): ReadonlySet<number> {
  const lines = new Set<number>()
  for (const match of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(match[1])
    const count = match[2] === undefined ? 1 : Number(match[2])
    for (let line = start; line < start + count; line++) lines.add(line)
  }
  return lines
}

/** The lines the inserted texts cover in the file's text now: the first place of each, every place for replace_all. Pure. */
export function insertedLines(text: string, marks: EditMarks): ChangedLines {
  if (marks.whole || marks.inserts.length === 0) return 'all'
  const lines = new Set<number>()
  const lineAt = (offset: number): number => text.slice(0, offset).split('\n').length
  for (const insert of marks.inserts) {
    if (insert.text === '') continue
    let from = 0
    for (;;) {
      const at = text.indexOf(insert.text, from)
      if (at < 0) break
      const first = lineAt(at)
      const last = lineAt(at + insert.text.length - (insert.text.endsWith('\n') ? 1 : 0))
      for (let line = first; line <= last; line++) lines.add(line)
      if (!insert.all) break
      from = at + insert.text.length
    }
  }
  return lines
}

/**
 * The changed lines of one file of a checkout (`file` relative to `root`,
 * forward slashes). A git failure inside a checkout counts the whole file;
 * only a root git does not know falls back to the edit marks. Never rejects.
 */
export async function changedLines(root: string, file: string, marks: EditMarks | undefined, git: (root: string, args: readonly string[]) => Promise<GitRun> = runGit): Promise<ChangedLines> {
  try {
    const listed = await git(root, ['ls-files', '--', file])
    if (listed.code === 0) {
      if (listed.out.trim() === '') return 'all'
      const diff = await git(root, ['diff', '-U0', '--no-color', 'HEAD', '--', file])
      return diff.code === 0 ? diffLines(diff.out) : 'all'
    }
    const probe = await git(root, ['rev-parse', '--git-dir'])
    if (probe.code === 0 || marks === undefined) return 'all'
    return insertedLines(await readFile(join(root, file), 'utf8'), marks)
  }
  catch {
    return 'all'
  }
}
