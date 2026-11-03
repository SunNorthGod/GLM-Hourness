import assert from 'node:assert/strict'
import test from 'node:test'
import { isReportingDepth, REPORTING_DEPTH_SECTION, REPORTING_DEPTHS } from '../src/glm-prompt/reporting-depth.ts'
import { dialectSections } from '../src/glm-prompt/index.ts'
import { dispatchPanel, parseJsonl } from '../src/report/panel.ts'

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

test('dispatch panel lists newest decisions first with a cap, without a level; a line written with one still reads', () => {
  const decisions = Array.from({ length: 30 }, (_, i) => JSON.stringify({ at: `t${i}`, ...i < 5 ? { level: 'L1' } : {}, kind: 'dispatch:spawn', subject: `agent-${i}` })).join('\n')
  const rows = dispatchPanel(decisions, 10)
  assert.equal(rows.length, 10)
  assert.equal(rows[0]!.subject, 'agent-29')
  assert.equal(rows[9]!.subject, 'agent-20')
  assert.deepEqual(rows[0], { at: 't29', kind: 'dispatch:spawn', subject: 'agent-29' })
  assert.deepEqual(dispatchPanel(decisions, 30).at(-1), { at: 't0', kind: 'dispatch:spawn', subject: 'agent-0' }) // the old line keeps no level
  assert.deepEqual(parseJsonl<{ at: string }>('{bad\n'), [])
})
