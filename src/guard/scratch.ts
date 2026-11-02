/**
 * The scratch area for one-off scripts (M4 design §7.3): a fixed directory
 * under the workspace's private `.llm/`, git-ignored (src/shared/
 * llm-ignore.ts). A script that should stay is not written here but into the
 * project's source tree with a graph node; `scratchLeftovers` lists what is
 * left behind, for the merge gate that refuses to merge a workspace whose
 * scratch area is not empty.
 */
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** The scratch area, relative to the workspace root (or a worker's work tree root). */
export const SCRATCH_DIR = '.llm/scratch'

/** At most this many file paths are listed; `total` says how many there are. */
const SCRATCH_LIST_LIMIT = 200

export interface ScratchLeftovers {
  /** Files under the scratch area, slash-separated, relative to `root`; at most `SCRATCH_LIST_LIMIT` of them. */
  readonly files: readonly string[]
  /** How many files the area holds in all. */
  readonly total: number
}

/** List the files left in `<root>/.llm/scratch/`, shallower paths first; a missing directory is empty. Never rejects. */
export async function scratchLeftovers(root: string, limit: number = SCRATCH_LIST_LIMIT): Promise<ScratchLeftovers> {
  const files: string[] = []
  const walk = async (dir: string, prefix: string): Promise<void> => {
    let names: string[]
    try {
      names = (await readdir(dir)).sort()
    }
    catch {
      return
    }
    for (const name of names) {
      const path = `${prefix}${name}`
      const full = join(dir, name)
      let directory: boolean
      try {
        directory = (await stat(full)).isDirectory()
      }
      catch {
        continue
      }
      if (directory) await walk(full, `${path}/`)
      else files.push(path)
    }
  }
  await walk(join(root, ...SCRATCH_DIR.split('/')), '')
  return { files: files.slice(0, Math.max(0, limit)), total: files.length }
}
