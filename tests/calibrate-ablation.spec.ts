/**
 * The ablation switch of a calibration run (scripts/calibrate/ablation.mjs):
 * each arm changes exactly its one piece of the system prompt, by whole
 * paragraphs, in the leading system messages and in a one-shot `system`; a
 * request it changes nothing in gets no copy. A3 lists the graph and memory
 * tools it defers. A2's text is the production sentence since the arm was
 * adopted (DESIGN.md §5.2a), so on an adopted prompt the arm rewrites
 * nothing. Reads the build output (npm run build first).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error The script is plain JavaScript without a declaration file.
import { ARMS, DEFERRED_BY_A3, paragraphRule, rewriteRequest, rewriteText, WORKSPACE_RULES_SHORT } from '../scripts/calibrate/ablation.mjs'
import { WORKSPACE_RULES_TEXT } from '../src/guard/sections.ts'
import { DYNAMIC_BEHAVIOR } from '../src/glm-prompt/verbatim.ts'
import { GRAPH_TOOL_NAMES, MEMORY_TOOL_NAMES } from '../src/shared/tool-names.ts'

type Rule = (text: string) => string | null | undefined
interface Rewritten { readonly text: string, readonly removed: number, readonly replaced: number }
interface Request { readonly system?: string, readonly messages: ReadonlyArray<{ role: string, content: Array<{ type: string, text: string }> }> }
const rule = paragraphRule as (arm: string) => Rule | undefined
const rewrite = rewriteText as (text: string, rule: Rule) => Rewritten
const request = rewriteRequest as (options: Request, rule: Rule) => { copy: Request | undefined, counts: { removed: number, replaced: number } }

const DEPTH = '# Reporting Depth\nFor each user-facing reply, choose one reporting depth yourself.'
const RULES = '# Workspace rules\nThe harness checks every tool call against these rules before it runs.\n- You may only create and modify files inside the user\'s workspace.'
const FILE_TOOLS = [
  'Use the read tool — not shell commands like cat — to inspect text files.',
  'Read an existing file before overwriting it with write (the default fs-observation-policy requires it).',
  'Read a file before editing it (the default fs-observation-policy requires it).',
  'Use the glob tool — not shell find — to discover files by path pattern.',
  'Use the grep tool — not shell grep or rg — to search file contents.',
]
const PWSH = 'Non-zero exits are reported as `[exit code: N]` markers; investigate failures before moving on.'
const PROMPT = ['You are ZCode, an interactive agent', '# Harness\n - a line', DYNAMIC_BEHAVIOR, DEPTH, PWSH, ...FILE_TOOLS, RULES].join('\n\n')
const paragraphs = (text: string): string[] => text.split('\n\n')

test('the arms are A0 to A5', () => {
  assert.deepEqual(ARMS, ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'])
  assert.equal(rule('A0'), undefined)
  assert.equal(rule('A3'), undefined)
})

test('A1 drops the reporting depth section and nothing else', () => {
  const out = rewrite(PROMPT, rule('A1')!)
  assert.deepEqual([out.removed, out.replaced], [1, 0])
  assert.deepEqual(paragraphs(out.text), paragraphs(PROMPT).filter(text => text !== DEPTH))
})

test('A2 replaces the workspace rules with the one sentence and nothing else', () => {
  const out = rewrite(PROMPT, rule('A2')!)
  assert.deepEqual([out.removed, out.replaced], [0, 1])
  assert.deepEqual(paragraphs(out.text), paragraphs(PROMPT).map(text => text === RULES ? WORKSPACE_RULES_SHORT : text))
  assert.equal(rewrite(out.text, rule('A2')!).replaced, 0)
})

test('A2 leaves the production sentence: on an adopted prompt the arm rewrites nothing', () => {
  assert.equal(WORKSPACE_RULES_SHORT, WORKSPACE_RULES_TEXT)
})

test('A4 drops Dynamic Behavior and nothing else', () => {
  const out = rewrite(PROMPT, rule('A4')!)
  assert.deepEqual([out.removed, out.replaced], [1, 0])
  assert.deepEqual(paragraphs(out.text), paragraphs(PROMPT).filter(text => text !== DYNAMIC_BEHAVIOR))
})

test('A5 drops the five file tool sections and keeps the shell one', () => {
  const out = rewrite(PROMPT, rule('A5')!)
  assert.deepEqual([out.removed, out.replaced], [5, 0])
  assert.deepEqual(paragraphs(out.text), paragraphs(PROMPT).filter(text => !FILE_TOOLS.includes(text)))
  assert.ok(paragraphs(out.text).includes(PWSH))
})

test('the leading system messages and a one-shot system text are rewritten; other messages are not', () => {
  const user = { role: 'user', content: [{ type: 'text', text: DEPTH }] }
  const { copy, counts } = request({ system: DEPTH, messages: [{ role: 'system', content: [{ type: 'text', text: PROMPT }] }, user] }, rule('A1')!)
  assert.deepEqual(counts, { removed: 2, replaced: 0 })
  assert.equal(copy?.system, '')
  assert.equal(copy?.messages[0]?.content[0]?.text, paragraphs(PROMPT).filter(text => text !== DEPTH).join('\n\n'))
  assert.deepEqual(copy?.messages[1], user)
})

test('a request the arm changes nothing in gets no copy', () => {
  const { copy, counts } = request({ messages: [{ role: 'system', content: [{ type: 'text', text: 'You are ZCode\n\n# Harness' }] }] }, rule('A4')!)
  assert.equal(copy, undefined)
  assert.deepEqual(counts, { removed: 0, replaced: 0 })
})

test('A3 defers the 15 graph tools and the 3 memory tools', () => {
  assert.deepEqual(DEFERRED_BY_A3, [...GRAPH_TOOL_NAMES, ...MEMORY_TOOL_NAMES])
  assert.equal(DEFERRED_BY_A3.length, 18)
})
