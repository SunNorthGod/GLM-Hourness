/**
 * Verbatim gate (docs/DESIGN.md §5.9): every dialect text that claims to
 * mirror ZCode must occur line for line in the ZCode baseline release.
 *
 * The one reference is the pristine 3.17.1 release bundle copied under
 * reference/ (reference/zcode-3.17.1/zcode.cjs; a git worktree has no
 * reference/ and reads the main checkout's, scripts/reference-dir.mjs).
 * Neither the installed desktop bundle (it follows auto-updates and user
 * patches) nor the 3.16.2 source tree under reference/ZCode is read: either
 * would let a line pass that the baseline no longer has.
 *
 * Known deviations form a ratchet: they are reported, never fail the gate,
 * and may only shrink. A known deviation that starts matching fails until it
 * is removed from KNOWN_DEVIATIONS, so the list cannot go stale. Without the
 * reference copy the text check skips (machines without the audit sources);
 * the import rules below run anyway.
 *
 * Imports of a mirror file: a mirror file may open (after its header
 * comment) with single-line import statements, its import block. Only those
 * lines are removed before the literals are cut, so module paths are not
 * verbatim claims and no text after the block is ever dropped. Value imports
 * may come only from other mirror files and `import type` only from
 * src/shared/, so an import brings no unchecked text into a mirror file. An
 * import or re-export statement after the block fails (a multi-line import
 * ends the block at its first line, so it fails too); it is found in the
 * file's code with comments removed and literal contents blanked, so text
 * inside a literal is never taken for a statement.
 *
 * The functions are exported for tests/check-verbatim.spec.ts; importing
 * this file runs nothing.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { referenceDir } from './reference-dir.mjs'

/** The baseline release bundle, under the reference directory. */
const REFERENCE_BUNDLE = ['zcode-3.17.1', 'zcode.cjs']

/** Items still awaiting a source rebuild. Shrink only; empty since the M1.1 tool rebuild. */
const KNOWN_DEVIATIONS = new Set([])

/**
 * Verbatim mirror files: every string and template-literal chunk they
 * contain is a verbatim claim, so templates are checked piece by piece
 * between their interpolations. The scanner skips comments and does not
 * parse regex literals or division, which these files must not contain.
 */
export const MIRROR_FILES = ['src/toolsearch/zcode-text.ts', 'src/glm-prompt/zcode-tool-text.ts', 'src/glm-prompt/zcode-harness-text.ts', 'src/glm-prompt/zcode-memory-text.ts', 'src/glm-prompt/zcode-compact-text.ts', 'src/glm-llm/zcode-wire.ts', 'src/shared/zcode-notice.ts']

/** Minimum line length checked; shorter fragments are structural (headings, blank joints). */
const MIN_LINE = 13

const BACKSLASH = String.fromCharCode(92)
const UNICODE_ESCAPE = new RegExp(`${BACKSLASH}${BACKSLASH}u([0-9a-fA-F]{4})`, 'g')

/** One single-line import statement: `import … from '…'`, `import '…'`, or `export … from '…'`. */
const IMPORT_LINE = /^\s*(?:import\s+(?:type\s+)?[^'"]*?\s*from\s*|import\s*|export\s+(?:type\s+)?(?:\*|\{[^}]*\})(?:\s+as\s+\w+)?\s*from\s*)(['"])([^'"]+)\1\s*;?\s*$/
const TYPE_ONLY = /^\s*(?:import|export)\s+type\s/
/** A statement-start import (not `import(` or `import.meta`) or a re-export, in code text. */
const LATE_IMPORT = /(?:^|[\n;])[ \t]*(?:import\b(?![ \t]*[(.])|export\s+(?:type\s+)?(?:\*|\{[^}]*\})(?:\s+as\s+\w+)?\s*from\b)/

/**
 * A rendered Harness system-turn bullet → the pieces the bundle holds.
 * 3.17.1 builds that bullet from a ternary branch and a tail around the
 * template's interpolation point (src/glm-prompt/zcode-harness-text.ts), so
 * the rendered line (in the start-plan stable section) is no bundle
 * substring; the text check compares its two pieces instead.
 * @returns {Promise<Map<string, string[]>>}
 */
async function systemTurnPieces() {
  const { HARNESS_SYSTEM_TURN_BRANCHES, harnessSystemTurnLine } = await import('../src/glm-prompt/zcode-harness-text.ts')
  return new Map([true, false].map((mid) => {
    const branch = mid ? HARNESS_SYSTEM_TURN_BRANCHES.mid : HARNESS_SYSTEM_TURN_BRANCHES.reminder
    const line = harnessSystemTurnLine(mid)
    return [line, [branch, line.slice(line.indexOf(branch) + branch.length)]]
  }))
}

/** Undo JS string escaping so source and bundle text compare as rendered text. */
function unescapeJs(text) {
  return text
    .replace(UNICODE_ESCAPE, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .split(`${BACKSLASH}n`).join('\n')
    .split(`${BACKSLASH}"`).join('"')
    .split(`${BACKSLASH}'`).join("'")
    .split(`${BACKSLASH}${BACKSLASH}`).join(BACKSLASH)
}

/**
 * The import block of a source: the single-line import statements before
 * its first line that is neither one of them, a comment nor blank.
 * @param {string} source
 * @returns {{ line: number, specifier: string, typeOnly: boolean }[]} zero-based line numbers
 */
export function importBlock(source) {
  const statements = []
  let inComment = false
  const lines = source.split('\n')
  for (let line = 0; line < lines.length; line += 1) {
    const text = lines[line]
    const trimmed = text.trim()
    if (inComment) {
      inComment = !trimmed.includes('*/')
      continue
    }
    if (trimmed === '' || trimmed.startsWith('//')) continue
    if (trimmed.startsWith('/*')) {
      const end = trimmed.indexOf('*/', 2)
      if (end < 0) {
        inComment = true
        continue
      }
      if (trimmed.slice(end + 2).trim() === '') continue
      break
    }
    const match = IMPORT_LINE.exec(text)
    if (match === null) break
    statements.push({ line, specifier: match[2], typeOnly: TYPE_ONLY.test(text) })
  }
  return statements
}

/** The source with its import block's statement lines emptied (line numbers kept). @param {string} source */
function withoutImportBlock(source) {
  const lines = source.split('\n')
  for (const { line } of importBlock(source)) lines[line] = ''
  return lines.join('\n')
}

/**
 * Raw (still escaped) text of every string literal and template-literal
 * chunk in a TypeScript source, including literals nested in `${}`; and the
 * source's code with comments and literal contents blanked (newlines kept).
 * @param {string} source
 * @returns {{ chunks: string[], code: string }}
 */
function scanSource(source) {
  const chunks = []
  let code = ''
  let i = 0
  const blank = text => text.replace(/[^\n]/g, ' ')
  const quoted = (quote) => {
    const start = i
    let text = ''
    for (i += 1; i < source.length && source[i] !== quote; i += 1) {
      if (source[i] === BACKSLASH) { text += source.slice(i, i + 2); i += 1 }
      else text += source[i]
    }
    i += 1
    chunks.push(text)
    code += `${quote}${blank(source.slice(start + 1, i - 1))}${quote}`
  }
  const template = () => {
    let text = ''
    code += '`'
    for (i += 1; i < source.length && source[i] !== '`'; i += 1) {
      if (source[i] === BACKSLASH) { text += source.slice(i, i + 2); code += blank(source.slice(i, i + 2)); i += 1 }
      else if (source[i] === '$' && source[i + 1] === '{') {
        chunks.push(text)
        text = ''
        code += '${'
        i += 2
        scanCode('}')
        code += '}'
      }
      else { text += source[i]; code += blank(source[i]) }
    }
    i += 1
    chunks.push(text)
    code += '`'
  }
  // Scan code until the closing brace of an interpolation (or end of file).
  const scanCode = (until) => {
    let depth = 0
    while (i < source.length) {
      const char = source[i]
      if (char === '/' && (source[i + 1] === '/' || source[i + 1] === '*')) {
        const end = source[i + 1] === '/' ? source.indexOf('\n', i) : source.indexOf('*/', i + 2)
        const stop = end < 0 ? source.length : source[i + 1] === '/' ? end : end + 2
        code += blank(source.slice(i, stop))
        i = stop
        continue
      }
      if (char === '\'' || char === '"') { quoted(char); continue }
      if (char === '`') { template(); continue }
      if (char === '{') depth += 1
      if (char === '}') {
        if (depth === 0 && until === '}') return
        depth -= 1
      }
      code += char
      i += 1
    }
  }
  scanCode(undefined)
  return { chunks, code }
}

/** The verbatim chunks of a mirror file: its literals, the import block excluded. @param {string} source */
export function mirrorChunks(source) {
  return scanSource(withoutImportBlock(source)).chunks
}

/**
 * Import rule violations of the mirror file `file` (repository-relative,
 * forward slashes) with text `source`.
 * @param {string} file
 * @param {string} source
 * @param {readonly string[]} [mirrorFiles]
 * @returns {string[]}
 */
export function importProblems(file, source, mirrorFiles = MIRROR_FILES) {
  const problems = []
  for (const { line, specifier, typeOnly } of importBlock(source)) {
    const target = posix.normalize(posix.join(posix.dirname(file), specifier))
    if (typeOnly && !target.startsWith('src/shared/')) problems.push(`${file}:${line + 1}: import type ${specifier}: type imports only from src/shared/`)
    if (!typeOnly && !mirrorFiles.includes(target)) problems.push(`${file}:${line + 1}: import ${specifier}: value imports only from mirror files`)
  }
  const { code } = scanSource(withoutImportBlock(source))
  const late = LATE_IMPORT.exec(code)
  if (late !== null) {
    const at = late.index + late[0].search(/\S/)
    problems.push(`${file}:${code.slice(0, at).split('\n').length}: import statement after the import block (imports open the file, one statement per line)`)
  }
  return problems
}

/** The reference the text check reads: the baseline bundle copy, when this machine has it. */
function loadReferences() {
  const bundle = join(referenceDir(), ...REFERENCE_BUNDLE)
  return existsSync(bundle) ? [{ name: 'reference 3.17.1', text: unescapeJs(readFileSync(bundle, 'utf8')) }] : []
}

/** Every verbatim claim the text check compares, by item name. @returns {Promise<Record<string, string>>} */
export async function loadItems() {
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
    DYNAMIC_BEHAVIOR: verbatim.DYNAMIC_BEHAVIOR,
    TODO_REMINDER_BODY: verbatim.TODO_REMINDER_BODY,
    TODO_REMINDER_ECHO_HEADER: verbatim.TODO_REMINDER_ECHO_HEADER,
    'compact prompt': compact.buildCompactPrompt(undefined),
    CONTEXT_MANAGEMENT_DSH: localize.CONTEXT_MANAGEMENT_DSH,
    'start-plan cliPrefix': system.ZCODE_SYSTEM.cliPrefix,
    ...Object.fromEntries(system.ZCODE_SYSTEM.stableSections.map((text, index) => [`start-plan stable section ${index + 1}`, text])),
    // Dynamic Behavior (before the environment) and Context management (after it).
    ...Object.fromEntries(Object.entries(system.ZCODE_SYSTEM.dynamicSections).map(([key, text]) => [`start-plan dynamic section ${key}`, text])),
  }
  // Localized aliases (Grep, Bash; DESIGN.md §5.3 ⑥, §5.4) compose their
  // descriptions from mirror-file lines minus or rewriting what DSH cannot
  // honor, so they are not verbatim claims as a whole. Read is not an alias
  // spec and composes its description the same way (read-alias.ts
  // readDescription); TodoWrite's description is a mirror-file constant. The
  // mirror check below covers every verbatim piece.
  for (const spec of aliases.aliasSpecs) if (spec.localized !== true) items[`${spec.zcodeName} description`] = spec.description
  for (const file of MIRROR_FILES) {
    mirrorChunks(readFileSync(file, 'utf8')).forEach((chunk, index) => { items[`${file} literal ${index + 1}`] = unescapeJs(chunk) })
  }
  return items
}

async function main() {
  const importFailures = MIRROR_FILES.flatMap(file => importProblems(file, readFileSync(file, 'utf8')))
  for (const line of importFailures) console.error(`check-verbatim: FAIL — ${line}`)
  const references = loadReferences()
  if (references.length === 0) {
    console.log('check-verbatim: text check skipped (no reference/zcode-3.17.1/zcode.cjs on this machine)')
    process.exit(importFailures.length === 0 ? 0 : 1)
  }
  const items = await loadItems()
  const pieces = await systemTurnPieces()
  const failures = []
  const deviations = []
  let checkedLines = 0
  for (const name of KNOWN_DEVIATIONS) {
    if (!(name in items)) failures.push(`${name}: listed in KNOWN_DEVIATIONS but no longer checked; remove it`)
  }
  for (const [name, text] of Object.entries(items)) {
    const lines = String(text).split('\n').flatMap(line => pieces.get(line) ?? [line]).map(line => line.trim()).filter(line => line.length >= MIN_LINE)
    checkedLines += lines.length
    const missing = lines.filter(line => !references.some(ref => ref.text.includes(line)))
    const known = KNOWN_DEVIATIONS.has(name)
    if (missing.length > 0 && known) deviations.push(`${name}: ${missing.length}/${lines.length} lines unmatched`)
    else if (missing.length > 0) failures.push(`${name}: ${missing.length}/${lines.length} lines unmatched, first: ${missing[0].slice(0, 100)}`)
    else if (known) failures.push(`${name}: now matches the reference; remove it from KNOWN_DEVIATIONS`)
  }
  const label = references.map(ref => ref.name).join(' + ')
  for (const line of deviations) console.log(`check-verbatim: known deviation — ${line}`)
  if (failures.length > 0 || importFailures.length > 0) {
    for (const line of failures) console.error(`check-verbatim: FAIL — ${line}`)
    process.exit(1)
  }
  console.log(`check-verbatim: OK against ${label} (${Object.keys(items).length - deviations.length} verbatim, ${deviations.length} known deviations, ${checkedLines} lines checked)`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
