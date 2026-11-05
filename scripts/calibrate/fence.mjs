/**
 * Read fence of a calibration run (docs/ORCHESTRATION.md §10.5.1, risk
 * `risk-calib-read`): an overlay-only plugin row that
 * scripts/calibrate/run-calibrate.mjs inserts for each run. The batch already
 * runs in the system temporary directory (scripts/calibrate/run-dir.mjs), but
 * the model under test can still name any path: the repository with the
 * acceptance checkers, the other runs of the batch, the DSH homes. This row
 * judges every tool call (nested calls included) at `tools/pre-execute`,
 * outermost, and denies one that names a fenced path:
 *
 * - inside the run's workspace: allowed, whatever else holds;
 * - inside, or an ancestor of, one of the `fenced` roots (the repository, the
 *   DSH homes): denied;
 * - the temporary root or one of its ancestors: denied;
 * - inside a directory of the temporary root whose name starts with
 *   `glm-hourness-calib-` (the batch, the runs, the calibration DSH home):
 *   denied.
 *
 * Paths come from the call's arguments (pathsOf): the whole value of a path
 * argument, and in every other string argument each word that is absolute,
 * starts with `~` or has a `..` segment, after `$env:X`, `${env:X}`, `%X%`,
 * `$X` and `${X}` are expanded from the environment; `GetTempPath` and
 * `tmpdir()` stand for the temporary root. File contents (`content`,
 * `old_string`, `new_string`) are not read. A denial says only that the path
 * is outside the workspace, and is one JSON line in `record`.
 *
 * `pathsOf` and `fenceOf` are exported for the scan of a run's event stream
 * after it ended. Not part of the bundle.
 */
import { appendFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, parse, resolve, sep } from 'node:path'

export const name = 'glm-hourness-calibrate/fence'

/** The name every calibration directory in the temporary root starts with (scripts/calibrate/run-dir.mjs). */
const CALIB_PREFIX = 'glm-hourness-calib-'
/** Arguments whose whole value is a path. */
const PATH_KEYS = new Set(['file_path', 'path', 'paths', 'cwd', 'directory', 'dir', 'notebook_path'])
/** Arguments that are file contents, not paths. */
const CONTENT_KEYS = new Set(['content', 'old_string', 'new_string', 'todos'])
const WINDOWS = process.platform === 'win32'

const norm = path => {
  const full = resolve(path)
  return WINDOWS ? full.toLowerCase() : full
}
/** Whether `path` is `root` or inside it (both normalized). */
const within = (path, root) => path === root || path.startsWith(root.endsWith(sep) ? root : `${root}${sep}`)

/** Expand environment references in shell text. */
function expand(text, env) {
  const lookup = (key) => {
    const found = Object.keys(env).find(name => WINDOWS ? name.toLowerCase() === key.toLowerCase() : name === key)
    return found === undefined ? undefined : env[found]
  }
  const value = (match, key) => lookup(key) ?? match
  return text
    .replace(/\$\{env:([\w]+)\}/giu, value)
    .replace(/\$env:([\w]+)/giu, value)
    .replace(/%([\w]+)%/gu, value)
    .replace(/\$\{([A-Za-z_]\w*)\}/gu, value)
    .replace(/\$([A-Za-z_]\w*)/gu, (match, key) => key.toLowerCase() === 'home' ? homedir() : value(match, key))
}

/** Words of shell text that may name a path. */
const wordsOf = text => text.split(/[\s"'`;|&<>(),=]+/u).filter(word => word.length > 0)
/** A word that may name a path; a lone separator (`a / b` in a script) is not one. */
const looksLikePath = word => /[^\\/]/u.test(word) && (isAbsolute(word) || /^[A-Za-z]:/u.test(word) || word.startsWith('~') || word.split(/[\\/]/u).includes('..'))

/**
 * The paths one call names, resolved against `workspace` (absolute). `places`
 * is `{workspace, tmp, env}`; `env` defaults to the process environment.
 */
export function pathsOf(args, places) {
  const env = places.env ?? process.env
  const found = []
  const add = (word) => {
    const home = word === '~' || word.startsWith('~/') || word.startsWith('~\\') ? `${homedir()}${word.slice(1)}` : word
    found.push(resolve(places.workspace, home))
  }
  const visit = (value, key) => {
    if (typeof value === 'string') {
      if (CONTENT_KEYS.has(key)) return
      const text = expand(value, env)
      if (/GetTempPath|tmpdir\s*\(/iu.test(text)) found.push(resolve(places.tmp))
      if (PATH_KEYS.has(key) && text.trim().length > 0) add(text.trim())
      for (const word of wordsOf(text)) if (looksLikePath(word)) add(word.replace(/[\\/]+$/u, '') || word)
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, key)
      return
    }
    if (typeof value === 'object' && value !== null) {
      for (const [inner, item] of Object.entries(value)) visit(item, CONTENT_KEYS.has(key) ? key : inner)
    }
  }
  visit(args, '')
  return [...new Set(found)]
}

/**
 * Why `path` is outside the fence, or undefined when it may be used.
 * `places` is `{workspace, fenced: [roots], tmp}`.
 */
export function fenceOf(path, places) {
  const target = norm(path)
  if (within(target, norm(places.workspace))) return undefined
  for (const root of places.fenced ?? []) {
    const fenced = norm(root)
    if (within(target, fenced) || within(fenced, target)) return 'fenced'
  }
  const tmp = norm(places.tmp)
  if (within(tmp, target)) return 'temporary-root'
  if (within(target, tmp) && target !== tmp) {
    const first = target.slice(tmp.length).split(sep).find(part => part.length > 0) ?? ''
    if (first.startsWith(CALIB_PREFIX)) return 'calibration'
  }
  // A drive root is the ancestor of everything fenced.
  if (target === norm(parse(target).root)) return 'temporary-root'
  return undefined
}

/** The call's first path outside the fence, with the reason; undefined when there is none. */
export function fencedPathOf(args, places) {
  for (const path of pathsOf(args, places)) {
    const why = fenceOf(path, places)
    if (why !== undefined) return { path, why }
  }
  return undefined
}

export function apply(ctx, config = {}) {
  if (typeof config.workspace !== 'string' || typeof config.tmp !== 'string') {
    console.warn('calibrate fence: no workspace or temporary root configured; the row does nothing')
    return () => {}
  }
  const places = { workspace: config.workspace, fenced: config.fenced ?? [], tmp: config.tmp }
  const note = (entry) => {
    if (typeof config.record === 'string') appendFileSync(config.record, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`)
  }
  const dispose = ctx.on('tools/pre-execute', (payload, next) => {
    const hit = fencedPathOf(payload.arguments, places)
    if (hit === undefined) return next()
    note({ kind: 'denied', tool: payload.name, path: hit.path, why: hit.why, nested: payload.parent !== undefined })
    return Promise.resolve({ kind: 'deny', reason: `${hit.path} is outside the workspace ${places.workspace} and cannot be used. Work only with files inside the workspace.` })
  }, { prepend: true })
  return dispose
}
