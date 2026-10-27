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

/** Items still awaiting the source rebuild (ROADMAP M1.1). Shrink only. */
const KNOWN_DEVIATIONS = new Set([
  'DEFERRED_DECLARATION',
  'TOOLSEARCH_DESCRIPTION',
  'TodoWrite description',
  'Read description',
  'Write description',
  'Edit description',
  'Glob description',
  'Grep description',
])

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
  const toolsearch = await import('../src/toolsearch/index.ts')
  const todowrite = await import('../src/glm-prompt/todowrite.ts')
  const aliases = await import('../src/glm-prompt/aliases.ts')
  const system = await import('../src/glm-llm/zcode-system.ts')
  const items = {
    CLI_PREFIX: verbatim.CLI_PREFIX,
    IDENTITY_OPENING_WITH_STYLE: verbatim.IDENTITY_OPENING_WITH_STYLE,
    IDENTITY_OPENING_PLAIN: verbatim.IDENTITY_OPENING_PLAIN,
    SECURITY_NOTICE_OFFICIAL: verbatim.SECURITY_NOTICE_OFFICIAL,
    HARNESS_BLOCK: verbatim.HARNESS_BLOCK,
    DEFERRED_DECLARATION: verbatim.DEFERRED_DECLARATION,
    TODO_REMINDER_BODY: verbatim.TODO_REMINDER_BODY,
    TODO_REMINDER_ECHO_HEADER: verbatim.TODO_REMINDER_ECHO_HEADER,
    'compact prompt': compact.buildCompactPrompt(undefined),
    CONTEXT_MANAGEMENT_DSH: localize.CONTEXT_MANAGEMENT_DSH,
    TOOLSEARCH_DESCRIPTION: toolsearch.TOOLSEARCH_DESCRIPTION,
    'TodoWrite description': todowrite.zcodeTodoWriteDescription,
    'start-plan cliPrefix': system.ZCODE_SYSTEM.cliPrefix,
    ...Object.fromEntries(system.ZCODE_SYSTEM.stableSections.map((text, index) => [`start-plan stable section ${index + 1}`, text])),
  }
  // Bash is a localized rewrite (DESIGN.md §5.3 ⑥), not a verbatim claim.
  for (const spec of aliases.aliasSpecs) if (spec.zcodeName !== 'Bash') items[`${spec.zcodeName} description`] = spec.description
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
