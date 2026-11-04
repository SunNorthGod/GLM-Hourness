/**
 * The scratch area for one-off scripts (M4 design §7.3) and the
 * scratch-only rule over it (m4-gate G3, design §4.5): a fixed directory
 * under the workspace's private `.llm/`, git-ignored (src/shared/
 * llm-ignore.ts). A script that should stay is not written here but into the
 * project's source tree with a graph node; `scratchLeftovers` lists what is
 * left behind, for the merge gate that refuses to merge a workspace whose
 * scratch area is not empty.
 *
 * The rule denies a file tool CREATING a script file (`write` of a target
 * that did not exist, or `str_replace_editor create`) outside the scratch
 * area, unless the target directory already holds tracked files of the same
 * extension — a new module among its own kind is source, not a one-off
 * (design §4.5). The tracked list is the judgment context's; an unknown
 * passes the call (design §4.1). Requestable: a real new module in a new
 * place goes through the request channel (the tool arrives with G4; the
 * correction already names it with this call's ref).
 */
import { readdir, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { checkoutRootOf } from '../data/project-root.ts'
import { fileToolTargetOf, type Correction, type GuardRule, type RuleVerdict, type ToolCall } from './rules.ts'
import { pathKey } from './mention.ts'
import type { RuleContext } from './context.ts'

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

/** The script extensions the rule judges (design §4.5), with the leading dot. */
const SCRIPT_EXTENSIONS: ReadonlySet<string> = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.py', '.ps1', '.psm1', '.sh', '.bash', '.bat', '.cmd', '.rb', '.pl',
])

const ALLOW: RuleVerdict = { kind: 'allow' }

const correctionOf = (path: string, ref: string): Correction => ({
  fact: `You created the script \`${path}\` outside the scratch area.`,
  violation: 'One-off scripts live in .llm/scratch/ (git-ignored); a script that stays becomes part of the project.',
  rightPath: 'Write it under .llm/scratch/ if it is a one-off; if it should stay, create it with the write tool in scripts/ (or the project\'s source tree) next to files of its kind, give it a graph node and say what it is for.',
  exception: `A new module in a directory that already holds files of its kind is not a one-off script. If this really is a new module in a new place, call request_exception with ref "${ref}" and say what the file is for.`,
})

/** Whether the call creates a file: a `write`, or a `str_replace_editor create`. */
function createsFile(call: ToolCall): boolean {
  if (call.name === 'write') return true
  if (call.name === 'str_replace_editor') {
    const args = typeof call.arguments === 'object' && call.arguments !== null && !Array.isArray(call.arguments) ? call.arguments as Record<string, unknown> : undefined
    return args?.command === 'create'
  }
  return false
}

/** The rule over one call's prepared context; `roots` are the workspace roots the scratch areas hang under, `ref` the call's request ref (design §5.2). */
export function scratchOnly(roots: readonly string[], context: RuleContext, ref: string): GuardRule {
  const scratchPrefixes = roots.map(root => pathKey(resolve(root, ...SCRATCH_DIR.split('/'))))
  const underScratch = (target: string): boolean => scratchPrefixes.some(prefix => {
    const keyed = pathKey(target)
    return keyed === prefix || keyed.startsWith(`${prefix}/`)
  })
  return {
    id: 'scratch-only',
    declare: 'New one-off scripts go in .llm/scratch/.',
    detect(call) {
      const target = fileToolTargetOf(call)
      if (target === undefined || !createsFile(call)) return ALLOW
      // "The target did not exist before" is a fact from the context; unknown
      // passes (design §4.1). A `str_replace_editor create` on an existing
      // target is refused by the tool itself before the body would run.
      if (context.target === undefined || context.target.exists !== false) return ALLOW
      if (!SCRIPT_EXTENSIONS.has(extname(basename(target)).toLowerCase())) return ALLOW
      if (underScratch(target)) return ALLOW
      // A directory that already holds tracked files of the same extension is
      // a source tree: the file is a module among its own kind (design §4.5).
      // An unknown tracked list — no checkout above the target, or `git
      // ls-files` failed — is an unknown fact: the call passes (design §4.1).
      const tracked = context.tracked
      const root = tracked === undefined ? undefined : checkoutRootOf(target)
      if (tracked === undefined || root === undefined) return ALLOW
      const dir = pathKey(relative(root, dirname(resolve(target))))
      const extension = extname(basename(target)).toLowerCase()
      const sameKind = tracked.some(file => {
        const keyed = pathKey(file)
        return keyed.startsWith(`${dir === '' ? '' : `${dir}/`}`) && keyed.endsWith(extension)
      })
      if (sameKind) return ALLOW
      return { kind: 'deny', rule: 'scratch-only', correction: correctionOf(target, ref), ref }
    },
  }
}
