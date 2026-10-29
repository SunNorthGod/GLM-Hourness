import assert from 'node:assert/strict'
import test from 'node:test'
import { buildIdentitySection } from '../src/glm-prompt/identity.ts'
import { installDialect, memorySectionApplies } from '../src/glm-prompt/index.ts'
import {
  CLI_PREFIX,
  HARNESS_BLOCK,
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
  assert.equal(CLI_PREFIX, 'You are ZCode, an interactive coding agent')
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

test('keeps the harness block at five bullets plus heading', () => {
  assert.ok(HARNESS_BLOCK.startsWith('# Harness\n'))
  assert.equal(HARNESS_BLOCK.split('\n').length, 6)
})

test('freezes reminder thresholds at 10/10', () => {
  assert.deepEqual(TODO_REMINDER_THRESHOLDS, { TURNS_SINCE_WRITE: 10, TURNS_BETWEEN_REMINDERS: 10 })
})

test('identity assembly mirrors the bundle join with the chosen notice', () => {
  const official = buildIdentitySection(false)
  const opening = 'You are an interactive ZCode agent that helps users with software engineering tasks.'
  assert.ok(official.startsWith(opening + '\n\n'))
  assert.ok(official.includes('\n\n' + SECURITY_NOTICE_OFFICIAL + '\n\n'))
  assert.ok(official.endsWith(HARNESS_BLOCK))
  const user = buildIdentitySection(false, 'user')
  assert.ok(user.includes(SECURITY_NOTICE_USER))
  assert.ok(!user.includes(SECURITY_NOTICE_OFFICIAL))
})

test('switches the opening sentence when an OutputStyle is active', () => {
  assert.ok(buildIdentitySection(true).includes('according to the active Output Style below'))
})
