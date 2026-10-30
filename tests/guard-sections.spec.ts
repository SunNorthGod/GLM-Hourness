/**
 * Where an orchestration row puts its system prompt section (docs/DESIGN.md
 * §5.2, split design B5): before the guard's declaration when there is one,
 * else last, replacing a section of the same name where it stands.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { DECLARATION_SECTION, insertHournessSection } from '../src/guard/sections.ts'
import type { AssembledSection } from '../src/shared/dsh-min.ts'

const identity: AssembledSection = { name: 'harness:identity', text: 'identity' }
const memory: AssembledSection = { name: 'glm:memory', text: 'memory' }
const guard: AssembledSection = { name: DECLARATION_SECTION, text: 'rules' }
const mine: AssembledSection = { name: 'hourness:main-agent', text: 'main agent', interpolate: false }

const names = (sections: readonly AssembledSection[]): string[] => sections.map(section => section.name)

test('the guard declaration section is named glm:guard', () => {
  assert.equal(DECLARATION_SECTION, 'glm:guard')
})

test('a section goes before the guard declaration, whatever follows it', () => {
  assert.deepEqual(names(insertHournessSection([identity, memory, guard], mine)), ['harness:identity', 'glm:memory', 'hourness:main-agent', 'glm:guard'])
  assert.deepEqual(names(insertHournessSection([identity, guard, memory], mine)), ['harness:identity', 'hourness:main-agent', 'glm:guard', 'glm:memory'])
  assert.deepEqual(names(insertHournessSection([guard], mine)), ['hourness:main-agent', 'glm:guard'])
})

test('without a guard declaration the section goes last', () => {
  assert.deepEqual(names(insertHournessSection([identity, memory], mine)), ['harness:identity', 'glm:memory', 'hourness:main-agent'])
  assert.deepEqual(names(insertHournessSection([], mine)), ['hourness:main-agent'])
})

test('a section of the same name is replaced where it stands, so installing twice never doubles it', () => {
  const once = insertHournessSection([identity, guard], mine)
  const again = insertHournessSection([identity, mine, guard, memory], { ...mine, text: 'changed' })
  assert.deepEqual(names(again), ['harness:identity', 'hourness:main-agent', 'glm:guard', 'glm:memory'])
  assert.equal(again[1]?.text, 'changed')
  assert.deepEqual(names(insertHournessSection(once, mine)), names(once))
})

test('the input list is not changed', () => {
  const input = [identity, guard]
  insertHournessSection(input, mine)
  assert.deepEqual(names(input), ['harness:identity', 'glm:guard'])
})
