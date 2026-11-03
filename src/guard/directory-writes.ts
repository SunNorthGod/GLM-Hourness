/**
 * Whether a tool call writes into one of some directories
 * (docs/ORCHESTRATION.md §2.7, §16.11): the reading shared by the rules that
 * keep a directory to its one writer, graph-files-only and the rules board's
 * rules:files-only. A file tool counts when the path it writes (`write` and
 * `edit` take `file_path`; `str_replace_editor` writes on every command but
 * `view`) resolves into a directory. A shell command counts when file-tools-only
 * counts it as a write (src/guard/rules.ts, quote-aware) and the command names a
 * directory, by its absolute path or by its path from the session directory.
 * Paths are compared as strings (forward slashes, lower case), with no file
 * system access. Reads never count.
 */
import { isAbsolute, relative, resolve } from 'node:path'
import { fileToolsOnly, fileWriteTarget, NATIVE_FACE, shellCommandOf, type ToolCall } from './rules.ts'

/** What the call writes: the path a file tool names, or the shell text. */
export type DirectoryWrite =
  | { readonly kind: 'file', readonly target: string }
  | { readonly kind: 'shell', readonly command: string }

/** Comparable form of a path: forward slashes, no trailing slash, lower case (Windows file systems ignore case). */
function pathKey(path: string): string {
  return path.replaceAll('\\', '/').replace(/\/+/g, '/').replace(/\/$/, '').toLowerCase()
}

/** After a mention: a path-name character would make it a longer name (docs/graph.svg, docs/graphs). */
const NAME_AFTER = String.raw`[\p{L}\p{N}_.\-]`
/** Before a mention: a path-name character or a separator would make it part of a longer path (x/docs/graph). */
const NAME_BEFORE = String.raw`[\p{L}\p{N}_.\-/:]`

/** Matches a mention of a normalized directory spelling in a normalized command; ./ may precede it. */
function mention(spelling: string): RegExp {
  const escaped = spelling.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<!${NAME_BEFORE})(?:\\./)?${escaped}(?!${NAME_AFTER})`, 'u')
}

/**
 * The reading for some absolute directories: `cwd` is the calling session's
 * working directory, against which relative targets resolve; without it a
 * relative target cannot be judged and passes. The result is undefined for a
 * call that writes into none of them.
 */
export function writesInto(dirs: readonly string[], cwd: string | undefined): (call: ToolCall) => DirectoryWrite | undefined {
  const roots = dirs.map(dir => pathKey(resolve(dir)))
  const inside = (target: string): boolean => {
    if (!isAbsolute(target) && cwd === undefined) return false
    const key = pathKey(cwd === undefined ? resolve(target) : resolve(cwd, target))
    return roots.some(root => key === root || key.startsWith(`${root}/`))
  }
  const mentions = dirs.flatMap((dir, index) => {
    const fromCwd = cwd === undefined ? undefined : pathKey(relative(resolve(cwd), resolve(dir)))
    return [roots[index], ...(fromCwd === undefined || fromCwd.length === 0 || fromCwd.startsWith('..') || isAbsolute(fromCwd) ? [] : [fromCwd])]
  }).map(mention)
  return (call) => {
    const target = fileWriteTarget(call)
    if (target !== undefined) return inside(target) ? { kind: 'file', target } : undefined
    // The shell text as file-tools-only reads it (terminal_send carries it in `text`).
    const text = shellCommandOf(call)
    if (text === undefined || fileToolsOnly.detect(call, NATIVE_FACE).kind !== 'deny') return undefined
    const normalized = pathKey(text.command)
    return mentions.some(pattern => pattern.test(normalized)) ? { kind: 'shell', command: text.command } : undefined
  }
}
