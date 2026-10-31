/**
 * A spec that needs a folder outside any git repository makes it under the
 * temporary directory, and both project discovery (src/data/project-root.ts)
 * and git look for a repository by walking up from that folder. When the
 * temporary directory itself lies inside a repository (TEMP pointed into a
 * checkout by a render tool or a work tree), every folder made under it is
 * inside that repository too and the answer the case expects cannot arise.
 * Such a case is skipped with the reason instead of failing on a fixture that
 * is not what it claims to be; the cases that build their own `.git` do not
 * depend on where the temporary directory is and are not skipped.
 */
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/** The nearest directory at or above `dir` that holds a `.git` (a directory, or the file of a work tree); undefined when none does. */
function enclosingRepository(dir: string): string | undefined {
  for (let current = resolve(dir); ; current = dirname(current)) {
    if (existsSync(join(current, '.git'))) return current
    if (dirname(current) === current) return undefined
  }
}

/** The `skip` option of a case that needs a folder outside git: the reason when the temporary directory is inside a repository, otherwise false. */
export function skipIfTempInsideGit(): string | false {
  const repository = enclosingRepository(tmpdir())
  return repository === undefined ? false : `the temporary directory ${tmpdir()} is inside the git repository at ${repository}, so no folder made under it is outside git`
}
