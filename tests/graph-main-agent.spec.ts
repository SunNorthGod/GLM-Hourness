import assert from 'node:assert/strict'
import test from 'node:test'
import { MAIN_AGENT_KEY, mainAgentActive, type MainAgentView } from '../src/graph/main-agent.ts'

test('mainAgentActive reads the hournessMainAgent view: missing, malformed, on and off', () => {
  const on: MainAgentView = { active: true }
  const off: MainAgentView = { active: false }
  assert.equal(MAIN_AGENT_KEY, 'hournessMainAgent')
  assert.equal(mainAgentActive(undefined), false, 'no projection values')
  assert.equal(mainAgentActive({}), false, 'the projection is not registered')
  assert.equal(mainAgentActive({ graphLive: { focus: 'task-1' } }), false, 'other projections only')
  for (const malformed of [null, true, 'active', [], { active: 'true' }, { active: 1 }, { on: true }]) {
    assert.equal(mainAgentActive({ [MAIN_AGENT_KEY]: malformed }), false, JSON.stringify(malformed))
  }
  assert.equal(mainAgentActive({ [MAIN_AGENT_KEY]: on }), true)
  assert.equal(mainAgentActive({ [MAIN_AGENT_KEY]: off }), false)
})
