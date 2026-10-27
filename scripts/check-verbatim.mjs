/**
 * Verbatim gate (docs/DESIGN.md §5.9): every dialect text that claims to
 * mirror ZCode must occur line for line in a ZCode reference.
 *
 * References, any of which may satisfy a line:
 * - the 3.16.3 release bundle: $ZCODE_BUNDLE, else the installed desktop copy
 *   (user-patched only in the security notice, which the source satisfies);
 * - the ZCode source tree under reference/ZCode (apps/ and packages/).
 *
 * Known deviations form a ratchet: they are reported, never fail the gate,
 * and may only shrink. A known deviation that starts matching fails until it
 * is removed from KNOWN_DEVIATIONS, so the list cannot go stale. Without any
 * reference present the gate skips (machines without the audit sources).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Items still awaiting a source rebuild. Shrink only; empty since the M1.1 tool rebuild. */
const KNOWN_DEVIATIONS = new Set([])

/**
 * Verbatim mirror files: every string and template-literal chunk they
 * contain is a verbatim claim, so templates are checked piece by piece
 * between their interpolations. The scanner skips comments and does not
 * parse regex literals or division, which these files must not contain.
 */
const MIRROR_FILES = ['src/toolsearch/zcode-text.ts', 'src/glm-prompt/zcode-tool-text.ts']

/** Minimum line length checked; shorter fragments are structural (headings, blank joints). */
const MIN_LINE = 13

const BACKSLASH = String.fromCharCode(92)
const UNICODE_ESCAPE = new RegExp(`${BACKSLASH}${BACKSLASH}u([0-9a-fA-F]{4})`, 'g')

/** Undo JS string escaping so source and bundle text compare as rendered text. */
function unescapeJs(text) {
  return text
    .replace(UNICODE_ESCAPE, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .split(`${BACKSLASH}n`).join('\n')
    .split(`${BACKSLASH}"`).join('"')
    .split(`${BACKSLASH}'`).join("'")
    .split(`${BACKSLASH}${BACKSLASH}`).join(BACKSLASH)
}

function collectSource(root) {
  const out = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
      const path = join(dir, name)
      const stat = statSync(path)
      if (stat.isDirectory()) walk(path)
      else if (/\.(ts|tsx|json)$/.test(name) && !/\.(test|spec)\./.test(name) && stat.size < 2_000_000) out.push(unescapeJs(readFileSync(path, 'utf8')))
    }
  }
  for (const sub of ['apps', 'packages']) if (existsSync(join(root, sub))) walk(join(root, sub))
  return out.join('\n')
}

/**
 * Raw (still escaped) text of every string literal and template-literal
 * chunk in a TypeScript source, including literals nested in `${}`.
 */
function literalChunks(source) {
  const chunks = []
  let i = 0
  const quoted = (quote) => {
    let text = ''
    for (i += 1; i < source.length && source[i] !== quote; i += 1) {
      if (source[i] === BACKSLASH) { text += source.slice(i, i + 2); i += 1 }
      else text += source[i]
    }
    i += 1
    chunks.push(text)
  }
  const template = () => {
    let text = ''
    for (i += 1; i < source.length && source[i] !== '`'; i += 1) {
      if (source[i] === BACKSLASH) { text += source.slice(i, i + 2); i += 1 }
      else if (source[i] === '$' && source[i + 1] === '{') {
        chunks.push(text)
        text = ''
        i += 2
        code('}')
      }
      else text += source[i]
    }
    i += 1
    chunks.push(text)
  }
  // Scan code until the closing brace of an interpolation (or end of file).
  const code = (until) => {
    let depth = 0
    while (i < source.length) {
      const char = source[i]
      if (char === '/' && source[i + 1] === '/') { i = source.indexOf('\n', i); if (i < 0) i = source.length; continue }
      if (char === '/' && source[i + 1] === '*') { i = source.indexOf('*/', i + 2) + 2; if (i < 2) i = source.length; continue }
      if (char === '\'' || char === '"') { quoted(char); continue }
      if (char === '`') { template(); continue }
      if (char === '{') depth += 1
      if (char === '}') {
        if (depth === 0 && until === '}') return
        depth -= 1
      }
      i += 1
    }
  }
  code(undefined)
  return chunks
}

function loadReferences() {
  const refs = []
  const bundle = process.env.ZCODE_BUNDLE ?? 'C:/Program Files/ZCode/resources/glm/zcode.cjs'
  if (existsSync(bundle)) refs.push({ name: 'bundle', text: unescapeJs(readFileSync(bundle, 'utf8')) })
  if (existsSync('reference/ZCode')) refs.push({ name: 'source', text: collectSource('reference/ZCode') })
  return refs
}

async function loadItems() {
  const verbatim = await import('../src/glm-prompt/verbatim.ts')
  const compact = await import('../src/glm-prompt/compact.ts')
  const localize = await import('../src/glm-prompt/localize.ts')
  const aliases = await import('../src/glm-prompt/aliases.ts')
  const system = await import('../src/glm-llm/zcode-system.ts')
  const items = {
    CLI_PREFIX: verbatim.CLI_PREFIX,
    IDENTITY_OPENING_WITH_STYLE: verbatim.IDENTITY_OPENING_WITH_STYLE,
    IDENTITY_OPENING_PLAIN: verbatim.IDENTITY_OPENING_PLAIN,
    SECURITY_NOTICE_OFFICIAL: verbatim.SECURITY_NOTICE_OFFICIAL,
    HARNESS_BLOCK: verbatim.HARNESS_BLOCK,
    TODO_REMINDER_BODY: verbatim.TODO_REMINDER_BODY,
    TODO_REMINDER_ECHO_HEADER: verbatim.TODO_REMINDER_ECHO_HEADER,
    'compact prompt': compact.buildCompactPrompt(undefined),
    CONTEXT_MANAGEMENT_DSH: localize.CONTEXT_MANAGEMENT_DSH,
    'start-plan cliPrefix': system.ZCODE_SYSTEM.cliPrefix,
    ...Object.fromEntries(system.ZCODE_SYSTEM.stableSections.map((text, index) => [`start-plan stable section ${index + 1}`, text])),
  }
  // Localized aliases (Grep, Bash; DESIGN.md §5.3 ⑥, §5.4) compose their
  // descriptions from mirror-file lines minus or rewriting what DSH cannot
  // honor, so they are not verbatim claims as a whole. Read is not an alias
  // spec and composes its description the same way (read-alias.ts
  // readDescription); TodoWrite's description is a mirror-file constant. The
  // mirror check below covers every verbatim piece.
  for (const spec of aliases.aliasSpecs) if (spec.localized !== true) items[`${spec.zcodeName} description`] = spec.description
  for (const file of MIRROR_FILES) {
    literalChunks(readFileSync(file, 'utf8')).forEach((chunk, index) => { items[`${file} literal ${index + 1}`] = unescapeJs(chunk) })
  }
  return items
}

const references = loadReferences()
if (references.length === 0) {
  console.log('check-verbatim: skipped (no ZCode bundle or reference/ZCode source on this machine)')
  process.exit(0)
}
const items = await loadItems()
const failures = []
const deviations = []
for (const name of KNOWN_DEVIATIONS) {
  if (!(name in items)) failures.push(`${name}: listed in KNOWN_DEVIATIONS but no longer checked; remove it`)
}
for (const [name, text] of Object.entries(items)) {
  const lines = String(text).split('\n').map(line => line.trim()).filter(line => line.length >= MIN_LINE)
  const missing = lines.filter(line => !references.some(ref => ref.text.includes(line)))
  const known = KNOWN_DEVIATIONS.has(name)
  if (missing.length > 0 && known) deviations.push(`${name}: ${missing.length}/${lines.length} lines unmatched`)
  else if (missing.length > 0) failures.push(`${name}: ${missing.length}/${lines.length} lines unmatched, first: ${missing[0].slice(0, 100)}`)
  else if (known) failures.push(`${name}: now matches the reference; remove it from KNOWN_DEVIATIONS`)
}
const label = references.map(ref => ref.name).join(' + ')
for (const line of deviations) console.log(`check-verbatim: known deviation — ${line}`)
if (failures.length > 0) {
  for (const line of failures) console.error(`check-verbatim: FAIL — ${line}`)
  process.exit(1)
}
console.log(`check-verbatim: OK against ${label} (${Object.keys(items).length - deviations.length} verbatim, ${deviations.length} known deviations)`)
