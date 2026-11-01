import assert from 'node:assert/strict'
import test from 'node:test'
import { isPersonaLevel, PERSONA_LEVELS } from '../src/glm-prompt/persona.ts'
import { dialectSections } from '../src/glm-prompt/index.ts'
import { dispatchPanel, parseJsonl } from '../src/report/panel.ts'

test('persona slider keeps three levels and injects as a dialect section', () => {
  assert.deepEqual(PERSONA_LEVELS.map(level => level.id), ['concise', 'balanced', 'detailed'])
  assert.equal(isPersonaLevel('balanced'), true)
  assert.equal(isPersonaLevel('loud'), false)
  const sections = dialectSections(false, 'concise', { tier: 'start-plan' })
  const persona = sections.find(section => section.name === 'glm:persona')
  assert.ok(persona!.text.includes('# Reporting Depth'))
  assert.ok(persona!.text.includes('简洁（concise）'))
  assert.ok(persona!.text.includes('start there and adjust per task'))
  assert.deepEqual(sections.map(section => section.name), ['glm:cli-prefix', 'harness:identity', 'glm:persona'])
})

test('dispatch panel lists newest decisions first with a cap', () => {
  const decisions = Array.from({ length: 30 }, (_, i) => JSON.stringify({ at: `t${i}`, level: 'L1', kind: 'dispatch:spawn', subject: `agent-${i}` })).join('\n')
  const rows = dispatchPanel(decisions, 10)
  assert.equal(rows.length, 10)
  assert.equal(rows[0]!.subject, 'agent-29')
  assert.equal(rows[9]!.subject, 'agent-20')
  assert.deepEqual(parseJsonl<{ at: string }>('{bad\n'), [])
})
