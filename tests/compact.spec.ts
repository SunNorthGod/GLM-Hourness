import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCompactPrompt, formatCompactSummary } from '../src/glm-prompt/compact.ts'

test('compact prompt keeps the official structure: preamble, 9 sections, example, reminder', () => {
  const prompt = buildCompactPrompt(undefined)
  assert.ok(prompt.startsWith('CRITICAL: Respond with TEXT ONLY.'))
  assert.ok(prompt.includes('wrap your analysis in <analysis> tags'))
  assert.ok(prompt.includes('9. Optional Next Step'))
  assert.ok(prompt.includes('These MUST be preserved verbatim in the summary'))
  assert.ok(prompt.includes('<example>'))
  assert.ok(prompt.endsWith('Tool calls will be rejected and you will fail the task.'))
  assert.ok(!prompt.includes('Additional Instructions:'))
})

test('custom instructions append as the official block', () => {
  const prompt = buildCompactPrompt('focus on test output')
  const anchor = prompt.indexOf('Additional Instructions:')
  assert.ok(anchor > 0)
  assert.ok(prompt.slice(anchor).includes('focus on test output'))
  assert.ok(prompt.endsWith('Tool calls will be rejected and you will fail the task.'))
})

test('summary post-processing strips analysis and rewrites the summary tag', () => {
  const raw = `<analysis>thinking</analysis>
<summary>
1. Primary Request and Intent: build it
</summary>`
  assert.equal(formatCompactSummary(raw), 'Summary:\n1. Primary Request and Intent: build it')
  assert.equal(formatCompactSummary('  \n\n'), '')
})
