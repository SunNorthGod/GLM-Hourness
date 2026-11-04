/**
 * One git command run for its output and exit code, without a shell
 * (execFile): the pieces of src/data that need git (the `.llm/` ignore
 * check, the tracked-file listing) share it. Resolves with the exit code
 * (negative when git could not be run at all) and both output streams;
 * never rejects.
 */
import { execFile } from 'node:child_process'

export interface GitRun {
  readonly code: number
  readonly out: string
  readonly err: string
}

/** How long one git command may take. */
export const GIT_TIMEOUT_MS = 5000

export function runGit(root: string, args: readonly string[], timeout = GIT_TIMEOUT_MS): Promise<GitRun> {
  return new Promise((resolve) => {
    execFile('git', ['-C', root, ...args], { timeout, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      // execFile hands null on a zero exit and an Error with a numeric code otherwise.
      const code = error === null ? 0 : typeof error.code === 'number' ? error.code : -1
      resolve({ code, out: String(stdout), err: String(stderr) })
    })
  })
}
