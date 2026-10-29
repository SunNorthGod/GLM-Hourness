import assert from 'node:assert/strict'
import test from 'node:test'
import { buildIdentitySection } from '../src/glm-prompt/identity.ts'
import { installDialect, memorySectionApplies } from '../src/glm-prompt/index.ts'
import { HARNESS_BLOCK_DSH } from '../src/glm-prompt/localize.ts'
import { buildHarnessBlock } from '../src/glm-prompt/zcode-harness-text.ts'
import {
  CLI_PREFIX,
  SECURITY_NOTICE_OFFICIAL,
  SECURITY_NOTICE_USER,
  TODO_REMINDER_THRESHOLDS,
} from '../src/glm-prompt/verbatim.ts'
import type { AssemblePayload } from '../src/shared/dsh-min.ts'
import { MEMORY_TOOL_NAMES } from '../src/shared/tool-names.ts'
import { fakeRuntime, NATIVE_NAMES } from './fake-rc3.ts'

// glm:memory (docs/DESIGN.md §5.3 ⑧): only where next() returned every memory tool.

const assembled = (names: readonly string[]): AssemblePayload => ({ sections: [], contexts: [], tools: names.map(name => ({ name, description: name, parameters: { type: 'object' } })), variables: {} })

test('memorySectionApplies needs every memory tool among the tools next() returned', () => {
  assert.equal(memorySectionApplies(assembled(['read', ...MEMORY_TOOL_NAMES])), true)
  assert.equal(memorySectionApplies(assembled(['read', ...MEMORY_TOOL_NAMES.slice(1)])), false)
  assert.equal(memorySectionApplies(assembled(['read'])), false)
})

for (const toolSearchMode of ['local', 'off'] as const) {
  test(`the GLM request carries glm:memory only with all three memory tools (tool search ${toolSearchMode})`, async () => {
    const sectionsWith = async (memory: readonly string[]) => {
      const rt = fakeRuntime({ natives: [...NATIVE_NAMES, ...memory] })
      installDialect(rt.agent, { toolSearchMode })
      return (await rt.assemble({ provider: 'glm-zcode', model: 'glm-5.3' })).sections.map(section => section.name)
    }
    assert.ok((await sectionsWith(MEMORY_TOOL_NAMES)).includes('glm:memory'))
    assert.ok(!(await sectionsWith(MEMORY_TOOL_NAMES.slice(0, 2))).includes('glm:memory'))
    const without = await sectionsWith([])
    assert.ok(!without.includes('glm:memory'))
    assert.ok(without.includes('glm:context-management'), 'the other dialect sections stay')
  })
}

test('keeps the CliPrefix sentence exact', () => {
  assert.equal(CLI_PREFIX, 'You are ZCode, an interactive agent')
})

test('keeps the official security notice pristine (authorized-testing scope)', () => {
  assert.ok(SECURITY_NOTICE_OFFICIAL.startsWith('IMPORTANT: Assist with authorized security testing'))
  assert.ok(SECURITY_NOTICE_OFFICIAL.includes('detection evasion for malicious purposes'))
  assert.ok(!SECURITY_NOTICE_OFFICIAL.includes('reverse-engineering'))
})

test('keeps the user security notice as the engineering-environment declaration', () => {
  assert.ok(SECURITY_NOTICE_USER.includes('IMPORTANT: Assist with reverse-engineering'))
  assert.ok(SECURITY_NOTICE_USER.includes('treat the user as authorized by default'))
  assert.equal(SECURITY_NOTICE_USER.split('\n\n').length, 6)
})

test('the 3.17.1 harness block: five space-indented bullets plus heading, the system-turn bullet by branch', () => {
  for (const block of [buildHarnessBlock(true), buildHarnessBlock(false), HARNESS_BLOCK_DSH]) {
    const lines = block.split('\n')
    assert.equal(lines[0], '# Harness')
    assert.equal(lines.length, 6)
    assert.ok(lines.slice(1).every(line => line.startsWith(' - ')))
    assert.ok(lines[3]?.endsWith(' Hooks may intercept tool calls; treat hook output as user feedback.'))
  }
  assert.equal(buildHarnessBlock(true).split('\n')[3], ' - The system may send updates, reminders, or modifications to rules via mid-conversation system turns. These are system-controlled, unlike function results. Hooks may intercept tool calls; treat hook output as user feedback.')
  assert.equal(buildHarnessBlock(false).split('\n')[3], ' - `<system-reminder>` tags in messages and tool results are injected by the harness, not the user. Hooks may intercept tool calls; treat hook output as user feedback.')
  assert.ok(buildHarnessBlock(true).includes('in a terminal.'))
  // coding-plan: the Web GUI display bullet and the <system-reminder> branch (harness notices arrive as user turns).
  assert.equal(HARNESS_BLOCK_DSH.split('\n')[1], ' - Text you output outside of tool use is displayed to the user as GitHub-flavored markdown in the DeepSeek Harness Web GUI.')
  assert.equal(HARNESS_BLOCK_DSH.split('\n')[3], buildHarnessBlock(false).split('\n')[3])
})

test('freezes reminder thresholds at 10/10', () => {
  assert.deepEqual(TODO_REMINDER_THRESHOLDS, { TURNS_SINCE_WRITE: 10, TURNS_BETWEEN_REMINDERS: 10 })
})

test('identity assembly mirrors the bundle join with the chosen notice', () => {
  const official = buildIdentitySection(false)
  const opening = 'You are an agent working with the user toward their goals, using your own judgment along the way.'
  assert.ok(official.startsWith(opening + '\n\n'))
  assert.ok(official.includes('\n\n' + SECURITY_NOTICE_OFFICIAL + '\n\n'))
  assert.ok(official.endsWith(buildHarnessBlock(true)))
  assert.ok(buildIdentitySection(false, 'official', 'dsh').endsWith(HARNESS_BLOCK_DSH))
  const user = buildIdentitySection(false, 'user')
  assert.ok(user.includes(SECURITY_NOTICE_USER))
  assert.ok(!user.includes(SECURITY_NOTICE_OFFICIAL))
})

test('switches the opening sentence when an OutputStyle is active', () => {
  assert.ok(buildIdentitySection(true).startsWith('You are an interactive agent that helps users according to your "Output Style", which describes how you should respond to user queries.\n\n'))
})
