/**
 * Read-only structure of a DSH profile (docs/DEVELOPMENT.md §3, §5): the
 * probe guard and the batch L4 compare profiles by this shape, never by file
 * bytes, and never print a value.
 *
 * A shape holds, from package.json, the bundle list (`dsh.profile.bundles`),
 * the dependency names, and every other manifest key (top-level keys, keys
 * under `dsh`, keys under `dsh.profile`), each dependency and key with a
 * SHA-256 digest of its value; from cordis.patch.yml, one item per top-level
 * entry (a line starting with `-` opens one): its `id`, the paths of its
 * keys, and a SHA-256 digest of its normalized text. Normalizing drops
 * trailing whitespace, blank lines and whole-line comments, and takes paired
 * quotes off scalar values; `!!js` is not evaluated and no YAML parser is
 * needed. Lines deeper than a key with an inline value (continuations, block
 * scalars, multi-line flow collections) are part of that value, so no value
 * text is ever read as a key.
 *
 *   node scripts/profile-shape.mjs snapshot <profile> <file>   write the shape
 *   node scripts/profile-shape.mjs compare <profile> <file>    list the differences
 *
 * The profile is $DSH_HOME/profiles/<profile> (~/.dsh when DSH_HOME is unset
 * or blank); the name must match [A-Za-z0-9_-]+. Exit 0: written, or no
 * difference; 1: differences; 2: wrong arguments, or the profile or the
 * snapshot cannot be read. Output and snapshot files carry ids, key names,
 * package names, digests and difference kinds only.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * @typedef {{ key: string, id?: string, keys: string[], digest: string }} EntryShape
 * @typedef {{ name: string, digest: string }} NamedDigest
 * @typedef {{ bundles: string[], dependencies: NamedDigest[], manifest: NamedDigest[], entries: EntryShape[] }} ProfileShape
 * @typedef {{ area: 'bundles' | 'dependencies' | 'manifest' | 'patch', change: 'added' | 'removed' | 'order' | 'changed' | 'keys' | 'digest', name?: string }} ShapeDifference
 */

/** Row ids of this project start with it; overrides of these rows are the project's part of a profile. */
const PROJECT_ROW_PREFIX = 'glm-hourness/'
const PROFILE_NAME = /^[A-Za-z0-9_-]+$/
const KEY = /^([A-Za-z_$@][\w$@./-]*|"[^"]*"|'[^']*')[ \t]*:(?:[ \t]+(.*))?$/
const QUOTED_SCALAR = /^(\s*(?:-\s+)*(?:[^\s'"#][^:]*:\s+)?)(["'])(.*)\2$/

/** @param {string} text */
const sha256 = text => createHash('sha256').update(text).digest('hex')

/** @param {string} value */
const unquote = value => /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value

/** A scalar written after `key:`: quotes taken off, an inline comment dropped. @param {string} value */
const scalar = (value) => {
  const trimmed = value.trim()
  return /^(["']).*\1$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed.replace(/\s+#.*$/, '')
}

/** @param {string} line */
const isNoise = line => line.trim().length === 0 || /^\s*#/.test(line)

/**
 * Key paths of one entry (dot-joined, `[]` for a sequence item) and its top-level `id`.
 * @param {string[]} lines
 * @returns {{ keys: string[], id?: string }}
 */
function entryKeys(lines) {
  const keys = new Set()
  /** @type {{ indent: number, key: string }[]} */
  const stack = []
  /** @type {string | undefined} */
  let id
  let skipDeeperThan = -1
  lines.forEach((raw, index) => {
    const line = raw.replace(/\s+$/, '')
    if (isNoise(line)) return
    let indent = line.length - line.trimStart().length
    if (skipDeeperThan >= 0 && indent > skipDeeperThan) return
    skipDeeperThan = -1
    let rest = line.slice(indent)
    let marker = -1
    while (rest === '-' || rest.startsWith('- ')) {
      marker = indent
      // The entry's own dash at column 0 opens the entry; deeper dashes open sequence items.
      if (index > 0 || indent > 0) {
        while (stack.length > 0 && stack[stack.length - 1].indent > indent) stack.pop()
        stack.push({ indent: indent + 1, key: '[]' })
      }
      const after = rest.slice(1)
      indent += 1 + after.length - after.trimStart().length
      rest = after.trimStart()
    }
    if (rest.length === 0) return
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop()
    const match = KEY.exec(rest)
    if (match === null) {
      // A scalar sequence item; its continuation lines are deeper than its dash.
      if (marker >= 0) skipDeeperThan = marker
      return
    }
    const key = unquote(match[1])
    const path = [...stack.map(frame => frame.key), key].reduce((joined, part) => part === '[]' ? `${joined}[]` : joined === '' ? part : `${joined}.${part}`, '')
    keys.add(path)
    const value = match[2] ?? ''
    if (path === 'id' && id === undefined) id = scalar(value)
    if (value.length > 0 && !value.startsWith('#')) skipDeeperThan = indent
    stack.push({ indent, key })
  })
  return { keys: [...keys].sort(), ...(id === undefined ? {} : { id }) }
}

/**
 * Normalized text of one entry: trailing whitespace, blank lines and
 * whole-line comments removed, paired quotes taken off scalar values.
 * @param {string[]} lines
 */
function normalizeEntry(lines) {
  return lines
    .map(line => line.replace(/\s+$/, ''))
    .filter(line => !isNoise(line))
    .map(line => line.replace(QUOTED_SCALAR, '$1$3'))
    .join('\n')
}

/**
 * The top-level entries of a cordis patch text, keyed by id (a repeated id
 * gets `#2`, `#3` …; an entry without one is `#<position>`).
 * @param {string} text
 * @returns {EntryShape[]}
 */
export function patchShape(text) {
  /** @type {string[][]} */
  const blocks = []
  /** @type {string[] | undefined} */
  let current
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^-(?:\s|$)/.test(line)) {
      current = [line]
      blocks.push(current)
    }
    else if (/^[^\s#]/.test(line)) current = undefined // a top-level line that is not an entry (`[]`)
    else if (current !== undefined) current.push(line)
  }
  /** @type {Map<string, number>} */
  const seen = new Map()
  return blocks.map((block, index) => {
    const { keys, id } = entryKeys(block)
    const base = id ?? `#${index + 1}`
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return { key: count === 1 ? base : `${base}#${count}`, ...(id === undefined ? {} : { id }), keys, digest: sha256(normalizeEntry(block)) }
  })
}

/**
 * Manifest keys other than the bundle list and the dependencies, with value digests.
 * @param {Record<string, unknown>} manifest
 * @returns {NamedDigest[]}
 */
function manifestKeys(manifest) {
  /** @type {NamedDigest[]} */
  const out = []
  /** @param {unknown} value @param {string} prefix @param {readonly string[]} skip */
  const add = (value, prefix, skip) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return
    for (const [key, inner] of Object.entries(value)) {
      if (!skip.includes(key)) out.push({ name: `${prefix}${key}`, digest: sha256(JSON.stringify(inner) ?? '') })
    }
  }
  add(manifest, '', ['dsh', 'dependencies'])
  const dsh = manifest.dsh
  add(dsh, 'dsh.', ['profile'])
  if (typeof dsh === 'object' && dsh !== null) add(/** @type {Record<string, unknown>} */ (dsh).profile, 'dsh.profile.', ['bundles'])
  return out
}

/**
 * Read a profile directory's shape; throws when package.json is missing or
 * not a JSON object. A missing cordis.patch.yml has no entries.
 * @param {string} dir
 * @returns {ProfileShape}
 */
export function profileShape(dir) {
  /** @type {unknown} */
  const parsed = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new TypeError('package.json is not a JSON object')
  const manifest = /** @type {Record<string, unknown>} */ (parsed)
  const dsh = /** @type {{ profile?: { bundles?: unknown } } | undefined} */ (manifest.dsh)
  const bundles = Array.isArray(dsh?.profile?.bundles) ? dsh.profile.bundles.map(String) : []
  const dependencies = typeof manifest.dependencies === 'object' && manifest.dependencies !== null
    ? Object.entries(manifest.dependencies).map(([name, spec]) => ({ name, digest: sha256(String(spec)) }))
    : []
  const patchPath = join(dir, 'cordis.patch.yml')
  return { bundles, dependencies, manifest: manifestKeys(manifest), entries: existsSync(patchPath) ? patchShape(readFileSync(patchPath, 'utf8')) : [] }
}

/**
 * Additions, removals and changes of a named list.
 * @param {ShapeDifference['area']} area
 * @param {{ name: string, digest?: string }[]} before
 * @param {{ name: string, digest?: string }[]} after
 * @param {boolean} ordered
 * @returns {ShapeDifference[]}
 */
function listDifferences(area, before, after, ordered) {
  const was = new Map(before.map(item => [item.name, item.digest]))
  const now = new Map(after.map(item => [item.name, item.digest]))
  /** @type {ShapeDifference[]} */
  const out = []
  for (const [name, digest] of now) {
    if (!was.has(name)) out.push({ area, change: 'added', name })
    else if (was.get(name) !== digest) out.push({ area, change: 'changed', name })
  }
  for (const name of was.keys()) if (!now.has(name)) out.push({ area, change: 'removed', name })
  const common = item => was.has(item.name) && now.has(item.name)
  if (ordered && before.filter(common).map(item => item.name).join('\n') !== after.filter(common).map(item => item.name).join('\n')) out.push({ area, change: 'order' })
  return out
}

/**
 * Differences between two shapes: bundles and dependencies added, removed
 * or reordered (and dependencies changed); other manifest keys added,
 * removed or changed; patch entries added or removed by key, with changed
 * key paths, or with a changed digest under the same key paths.
 * @param {ProfileShape} before
 * @param {ProfileShape} after
 * @returns {ShapeDifference[]}
 */
export function compareShapes(before, after) {
  const named = names => names.map(name => ({ name }))
  /** @type {ShapeDifference[]} */
  const out = [
    ...listDifferences('bundles', named(before.bundles), named(after.bundles), true),
    ...listDifferences('dependencies', before.dependencies, after.dependencies, true),
    ...listDifferences('manifest', before.manifest, after.manifest, false),
  ]
  const was = new Map(before.entries.map(entry => [entry.key, entry]))
  const now = new Map(after.entries.map(entry => [entry.key, entry]))
  for (const [key, entry] of now) {
    const old = was.get(key)
    if (old === undefined) out.push({ area: 'patch', change: 'added', name: key })
    else if (old.keys.join('\n') !== entry.keys.join('\n')) out.push({ area: 'patch', change: 'keys', name: key })
    else if (old.digest !== entry.digest) out.push({ area: 'patch', change: 'digest', name: key })
  }
  for (const key of was.keys()) if (!now.has(key)) out.push({ area: 'patch', change: 'removed', name: key })
  return out
}

/**
 * Whether a difference touches this project's part of a profile: the bundle
 * list, the dependencies, or an override of a `glm-hourness/` row.
 * @param {ShapeDifference} difference
 */
export function isProjectDifference(difference) {
  if (difference.area === 'bundles' || difference.area === 'dependencies') return true
  return difference.area === 'patch' && (difference.name ?? '').startsWith(PROJECT_ROW_PREFIX)
}

/** @param {ShapeDifference} difference */
export const describeDifference = difference => `${difference.area} ${difference.change}${difference.name === undefined ? '' : ` ${difference.name}`}`

/** An error's code or class, never its message (a JSON parse message quotes the text). @param {unknown} error */
const reason = error => (error instanceof Error && 'code' in error && typeof error.code === 'string') ? error.code : error instanceof SyntaxError ? 'invalid JSON' : error instanceof Error ? error.name : 'unreadable'

function main(argv) {
  const [command, name, file] = argv
  if (!['snapshot', 'compare'].includes(command) || name === undefined || file === undefined || argv.length !== 3) {
    console.error('usage: node scripts/profile-shape.mjs snapshot|compare <profile> <file>')
    return 2
  }
  if (!PROFILE_NAME.test(name)) {
    console.error(`profile-shape: invalid profile name (expected [A-Za-z0-9_-]+)`)
    return 2
  }
  const fromEnv = process.env.DSH_HOME
  const home = fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv.replace(/^~(?=$|[\\/])/, homedir()) : join(homedir(), '.dsh')
  const dir = join(resolve(home), 'profiles', name)
  /** @type {ProfileShape} */
  let shape
  try {
    shape = profileShape(dir)
  }
  catch (error) {
    console.error(`profile-shape: cannot read profile ${name} at ${dir} (${reason(error)})`)
    return 2
  }
  if (command === 'snapshot') {
    mkdirSync(dirname(resolve(file)), { recursive: true })
    writeFileSync(file, `${JSON.stringify({ profile: name, shape }, null, 2)}\n`)
    console.log(`profile-shape: wrote ${file} (${shape.bundles.length} bundle(s), ${shape.dependencies.length} dependency(ies), ${shape.manifest.length} other manifest key(s), ${shape.entries.length} patch entry(ies))`)
    return 0
  }
  /** @type {ProfileShape} */
  let before
  try {
    before = /** @type {{ shape: ProfileShape }} */ (JSON.parse(readFileSync(file, 'utf8'))).shape
  }
  catch (error) {
    console.error(`profile-shape: cannot read snapshot ${file} (${reason(error)})`)
    return 2
  }
  const differences = compareShapes(before, shape)
  for (const difference of differences) console.log(`profile-shape: ${name}: ${describeDifference(difference)}`)
  console.log(`profile-shape: ${name}: ${differences.length === 0 ? 'no differences' : `${differences.length} difference(s)`} against ${file}`)
  return differences.length === 0 ? 0 : 1
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2))
