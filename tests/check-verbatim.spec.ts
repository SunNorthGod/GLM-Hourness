import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { importBlock, importProblems, loadItems, MIRROR_FILES, mirrorChunks } from '../scripts/check-verbatim.mjs'
import { ZCODE_SYSTEM } from '../src/glm-llm/zcode-system.ts'

const REPO = join(import.meta.dirname, '..')
const FILE = 'src/toolsearch/zcode-text.ts'
const HEADER = '/**\n * Mirror file header.\n */\n'

test('every mirror file keeps the import rules', () => {
  for (const file of MIRROR_FILES) assert.deepEqual(importProblems(file, readFileSync(join(REPO, file), 'utf8')), [], file)
})

test('the text check covers every start-plan system text: the prefix, the stable and the dynamic sections', async () => {
  const texts = Object.values(await loadItems())
  const startPlan = [ZCODE_SYSTEM.cliPrefix, ...ZCODE_SYSTEM.stableSections, ...Object.values(ZCODE_SYSTEM.dynamicSections)]
  assert.ok(Object.keys(ZCODE_SYSTEM.dynamicSections).length >= 2) // Dynamic Behavior and Context management
  for (const text of startPlan) assert.ok(texts.includes(text), text.slice(0, 60))
})

test('value imports in the block may come only from mirror files', () => {
  assert.deepEqual(importProblems(FILE, `${HEADER}import { DEFERRED_TOOL_CALL_NAME } from '../shared/zcode-notice.ts'\nexport const A = 'x'\n`), [])
  assert.deepEqual(importProblems(FILE, `${HEADER}import { isGlmModel } from '../shared/route.ts'\n`), [
    'src/toolsearch/zcode-text.ts:4: import ../shared/route.ts: value imports only from mirror files',
  ])
  assert.equal(importProblems(FILE, `${HEADER}import './side-effect.ts'\n`).length, 1)
  assert.equal(importProblems(FILE, `${HEADER}export { wrapSystemReminder } from '../glm-prompt/aliases.ts'\n`).length, 1)
})

test('import type may come only from src/shared/', () => {
  assert.deepEqual(importProblems(FILE, `${HEADER}import type { JsonRecord } from '../shared/json.ts'\n`), [])
  assert.deepEqual(importProblems(FILE, `${HEADER}import type { AliasSpec } from '../glm-prompt/aliases.ts'\n`), [
    'src/toolsearch/zcode-text.ts:4: import type ../glm-prompt/aliases.ts: type imports only from src/shared/',
  ])
})

test('a multi-line import, or any import after the block, fails', () => {
  assert.deepEqual(importProblems(FILE, `${HEADER}import {\n  DEFERRED_TOOL_CALL_NAME,\n} from '../shared/zcode-notice.ts'\n`), [
    'src/toolsearch/zcode-text.ts:4: import statement after the import block (imports open the file, one statement per line)',
  ])
  assert.deepEqual(importProblems(FILE, `${HEADER}export const A = 'x'\nimport { B } from '../shared/zcode-notice.ts'\n`), [
    'src/toolsearch/zcode-text.ts:5: import statement after the import block (imports open the file, one statement per line)',
  ])
  assert.equal(importProblems(FILE, `${HEADER}export const A = 'x'\nexport * from '../shared/zcode-notice.ts'\n`).length, 1)
})

test('the import block is not verbatim text; everything after it is, text that looks like an import included', () => {
  const source = `${HEADER}import type { JsonRecord } from '../shared/json.ts'\nimport { X } from '../shared/zcode-notice.ts'\n\nexport const T = \`first line\nimport this line from the reference\`\nexport const BASH_WORKDIR_LINE = "The working directory is initialized from the user's profile."\n`
  assert.deepEqual(importBlock(source).map(statement => statement.specifier), ['../shared/json.ts', '../shared/zcode-notice.ts'])
  assert.deepEqual(mirrorChunks(source), ['first line\nimport this line from the reference', 'The working directory is initialized from the user\'s profile.'])
  assert.deepEqual(importProblems(FILE, source), [])
})

test('comments and interpolations are code, literals inside interpolations are chunks', () => {
  const source = `${HEADER}// import { Z } from 'elsewhere'\nexport const T = \`a \${'b'} c\`\n/* import { Y } from 'elsewhere' */\n`
  assert.deepEqual(mirrorChunks(source), ['a ', 'b', ' c'])
  assert.deepEqual(importProblems(FILE, source), [])
})
