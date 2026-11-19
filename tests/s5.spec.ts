import assert from 'node:assert/strict'
import test from 'node:test'
import { isReportingDepth, REPORTING_DEPTH_SECTION, REPORTING_DEPTHS } from '../src/glm-prompt/reporting-depth.ts'
import { dialectSections } from '../src/glm-prompt/index.ts'

test('reporting depth keeps three levels and injects as a dialect section', () => {
  assert.deepEqual(REPORTING_DEPTHS.map(level => level.id), ['concise', 'balanced', 'detailed'])
  assert.equal(isReportingDepth('balanced'), true)
  assert.equal(isReportingDepth('loud'), false)
  const sections = dialectSections(false, 'concise', { tier: 'start-plan' })
  const depth = sections.find(section => section.name === REPORTING_DEPTH_SECTION)
  assert.ok(depth!.text.includes('# Reporting Depth'))
  assert.ok(depth!.text.includes('简洁（concise）'))
  assert.ok(depth!.text.includes('start there and adjust per task'))
  assert.deepEqual(sections.map(section => section.name), ['glm:cli-prefix', 'harness:identity', REPORTING_DEPTH_SECTION])
})
