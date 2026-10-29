import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { referenceDir } from '../scripts/reference-dir.mjs'
import { buildStartPlanSystem, buildContextPrefixMessage, buildEnvironmentSection, buildDesktopContextSection, customSystemText, providerLabel } from '../src/glm-llm/start-plan.ts'
import { ZCODE_SYSTEM } from '../src/glm-llm/zcode-system.ts'

const env = { cwd: 'C:/ws/proj', platform: 'win32', shell: 'pwsh', osVersion: 'win32 10.0.26100 x64', isGitRepository: true }

test('vendored texts parse with every expected section', () => {
  assert.equal(ZCODE_SYSTEM.cliPrefix, 'You are ZCode, an interactive coding agent')
  assert.ok(ZCODE_SYSTEM.stableSections[0]!.includes('# Harness'))
  assert.ok(ZCODE_SYSTEM.dynamicSections.beforeEnvironment.includes('# Communicating with the user'))
  assert.ok(ZCODE_SYSTEM.dynamicSections.afterEnvironment.includes('# Context management'))
  assert.ok(ZCODE_SYSTEM.contextPrefix.currentDateLine.includes('{date}'))
})

test('vendored texts stay byte-identical to the reference sidecar', async () => {
  const { readFile } = await import('node:fs/promises')
  const reference = JSON.parse(await readFile(join(referenceDir(), 'zcode-api/src/proxy/zcode_system.json'), 'utf8')) as Record<string, unknown>
  const { ZCODE_SYSTEM_TEXT } = await import('../src/glm-llm/zcode-system.ts')
  for (const key of Object.keys(reference)) {
    assert.deepEqual(JSON.parse(ZCODE_SYSTEM_TEXT)[key], reference[key], `section ${key} diverged from the reference sidecar`)
  }
})

test('start-plan system is exactly 3 blocks with the gateway-fingerprinted shapes', () => {
  const blocks = buildStartPlanSystem('my own guidance', env, 'bigmodel', 'glm-5.3', 'C:/viz/dir')
  assert.equal(blocks.length, 3)
  assert.equal(blocks[0]!.text, ZCODE_SYSTEM.cliPrefix)
  assert.equal(blocks[0]!.cache_control, undefined) // no cache_control since 3.15.1
  assert.ok(blocks[1]!.text.includes('# Harness'))
  assert.ok(blocks[1]!.text.includes('my own guidance')) // custom text appends to stable
  assert.ok(blocks[1]!.cache_control !== undefined)
  assert.ok(blocks[2]!.text.startsWith('\n\n')) // dynamic block carries the explicit prefix
  assert.ok(blocks[2]!.text.includes('- Primary working directory: C:/ws/proj'))
  assert.ok(blocks[2]!.text.includes('- You are powered by the model named bigmodel-api/glm-5.3.'))
  assert.ok(blocks[2]!.cache_control !== undefined)
})

test('environment section reflects runtime values; provider label maps', () => {
  const section = buildEnvironmentSection({ ...env, isGitRepository: false }, 'zai', 'glm-5.3')
  assert.ok(section.includes('- Is a git repository: no'))
  assert.ok(section.includes('- Shell: pwsh'))
  assert.ok(section.includes('zai-api/glm-5.3'))
  assert.equal(providerLabel('bigmodel'), 'bigmodel-api')
})

test('desktop context: viz directory line is JSON-stringified; fallback without one', () => {
  const withDir = buildDesktopContextSection('C:/viz/dir')
  assert.ok(withDir.includes('C:\\\\viz\\\\dir'.replace(/\\\\/g, '\\\\')) || withDir.includes(JSON.stringify('C:/viz/dir')))
  const fallback = buildDesktopContextSection(undefined)
  assert.ok(fallback.includes('No visualization output directory'))
  assert.ok(!fallback.includes('Gen UI:'))
})

test('custom system text: strings, block arrays, and noise handling', () => {
  assert.equal(customSystemText('  hello  '), 'hello')
  assert.equal(customSystemText('   '), undefined)
  assert.equal(customSystemText([{ type: 'text', text: 'a' }, 'b' ]), 'a\n\nb')
  assert.equal(customSystemText([{ type: 'text', text: 'a', cache_control: { type: 'ephemeral' } }]), 'a') // cache_control dropped
  assert.equal(customSystemText(42), undefined)
  assert.equal(customSystemText([{ type: 'image', text: 'x' }]), undefined)
})

test('context prefix wraps the currentDate block in system-reminder tags', () => {
  const message = buildContextPrefixMessage(new Date('2026-10-27T09:00:00+08:00'))
  assert.equal(message.role, 'user')
  const text = message.content[0]!.text
  assert.ok(text.startsWith('<system-reminder>'))
  assert.ok(text.endsWith('</system-reminder>'))
  assert.ok(text.includes('# currentDate\nToday\u0027s date is 2026-10-27.'.replace('\\u0027', '\u0027')) || text.includes("Today's date is 2026-10-27."))
  assert.ok(text.includes('IMPORTANT: this context may or may not be relevant'))
})
