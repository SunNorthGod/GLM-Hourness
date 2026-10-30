import assert from 'node:assert/strict'
import test from 'node:test'
import { CATALOG_UNCHECKED_NOTE, MODEL_LIMITS, agentOptionsOf, catalogHint, checkModelChoice, oneLine, parseModelArgs } from '../src/execute/models.ts'

const catalog = [{ id: 'model-a', name: 'A' }, { id: 'model-b' }, { id: 'model-c' }]

test('checkModelChoice: a model in the catalog passes', () => {
  assert.deepEqual(checkModelChoice({ provider: 'p', model: 'model-b' }, catalog, undefined), { ok: true })
})

test('checkModelChoice: a model missing from a non-empty catalog is unknown_model and the hint lists the first ten', () => {
  const big = Array.from({ length: 14 }, (_, index) => ({ id: `m-${index}` }))
  const result = checkModelChoice({ provider: 'p', model: 'nope' }, big, undefined)
  assert.equal(result.ok, false)
  assert.ok(!result.ok)
  assert.equal(result.code, 'unknown_model')
  assert.match(result.message, /"nope".*"p"/)
  assert.equal(result.hint, `Models on this provider: ${big.slice(0, 10).map(entry => entry.id).join(', ')}, …`)
})

test('checkModelChoice: an unreadable or empty catalog lets the model through with a note', () => {
  assert.deepEqual(checkModelChoice({ provider: 'p', model: 'anything' }, undefined, undefined), { ok: true, note: CATALOG_UNCHECKED_NOTE })
  assert.deepEqual(checkModelChoice({ provider: 'p', model: 'anything' }, [], undefined), { ok: true, note: CATALOG_UNCHECKED_NOTE })
  assert.equal(CATALOG_UNCHECKED_NOTE, '模型目录读不到，没有核对')
})

test('checkModelChoice: a reasoning effort must be one the model lists, when the list could be read', () => {
  const choice = { provider: 'p', model: 'model-a', reasoningEffort: 'ultra' }
  const refused = checkModelChoice(choice, catalog, ['low', 'high'])
  assert.ok(!refused.ok)
  assert.equal(refused.code, 'invalid')
  assert.match(refused.hint, /low, high/)
  assert.deepEqual(checkModelChoice({ ...choice, reasoningEffort: 'high' }, catalog, ['low', 'high']), { ok: true })
  assert.deepEqual(checkModelChoice(choice, catalog, undefined), { ok: true }, 'an unreadable list lets it through')
  const none = checkModelChoice(choice, catalog, [])
  assert.ok(!none.ok)
  assert.match(none.hint, /no reasoning effort levels/)
  assert.deepEqual(checkModelChoice({ provider: 'p', model: 'model-a' }, catalog, ['low']), { ok: true }, 'no effort asked, none checked')
})

test('checkModelChoice: the model check comes before the effort check, and a note survives an effort that is fine', () => {
  const both = checkModelChoice({ provider: 'p', model: 'nope', reasoningEffort: 'ultra' }, catalog, ['low'])
  assert.ok(!both.ok)
  assert.equal(both.code, 'unknown_model')
  assert.deepEqual(checkModelChoice({ provider: 'p', model: 'x', reasoningEffort: 'low' }, undefined, ['low']), { ok: true, note: CATALOG_UNCHECKED_NOTE })
})

test('catalogHint: ten ids at most, and an honest line when there is no catalog', () => {
  assert.equal(catalogHint(catalog), 'Models on this provider: model-a, model-b, model-c')
  assert.match(catalogHint(undefined), /could not be read/)
  assert.match(catalogHint([]), /could not be read/)
})

test('agentOptionsOf builds exactly the options DSH merges over the parent route', () => {
  assert.deepEqual(agentOptionsOf({ provider: 'p', model: 'm' }), { provider: 'p', model: 'm' })
  assert.deepEqual(agentOptionsOf({ provider: 'p', model: 'm', reasoningEffort: 'high' }), { provider: 'p', model: 'm', reasoningEffort: 'high' })
  assert.equal('reasoningEffort' in agentOptionsOf({ provider: 'p', model: 'm' }), false)
})

test('oneLine collapses whitespace runs into one space and trims', () => {
  assert.equal(oneLine('  a\n\tb   c \r\n'), 'a b c')
  assert.equal(oneLine('\n  '), '')
})

test('parseModelArgs: model and why are required, the limits are the ones of §6.4', () => {
  assert.deepEqual(parseModelArgs({ model: 'm', why: 'because' }), { ok: true, args: { model: 'm', why: 'because' } })
  assert.deepEqual(parseModelArgs({ model: 'm', why: ' two\nlines ', provider: 'p', reasoningEffort: 'high' }), { ok: true, args: { model: 'm', why: 'two lines', provider: 'p', reasoningEffort: 'high' } })
  const refused = (raw: Record<string, unknown>) => {
    const result = parseModelArgs(raw)
    assert.equal(result.ok, false, JSON.stringify(raw))
    return result.ok ? '' : result.message
  }
  assert.match(refused({ why: 'w' }), /^model is required/)
  assert.match(refused({ model: '', why: 'w' }), /^model is required/)
  assert.match(refused({ model: 'a b', why: 'w' }), /^model is required/)
  assert.match(refused({ model: 'a\tb', why: 'w' }), /^model is required/)
  assert.match(refused({ model: 3, why: 'w' }), /^model is required/)
  assert.match(refused({ model: 'x'.repeat(MODEL_LIMITS.model + 1), why: 'w' }), /^model is required/)
  assert.match(refused({ model: 'm' }), /^why is required/)
  assert.match(refused({ model: 'm', why: '  \n ' }), /^why is required/)
  assert.match(refused({ model: 'm', why: 'x'.repeat(MODEL_LIMITS.why + 1) }), /^why is required/)
  assert.match(refused({ model: 'm', why: 4 }), /^why is required/)
  assert.match(refused({ model: 'm', why: 'w', provider: '' }), /^provider/)
  assert.match(refused({ model: 'm', why: 'w', provider: 5 }), /^provider/)
  assert.match(refused({ model: 'm', why: 'w', reasoningEffort: '' }), /^reasoningEffort/)
  assert.match(refused({ model: 'm', why: 'w', reasoningEffort: 'x'.repeat(MODEL_LIMITS.effort + 1) }), /^reasoningEffort/)
  // The limits are inclusive.
  assert.equal(parseModelArgs({ model: 'x'.repeat(MODEL_LIMITS.model), why: 'y'.repeat(MODEL_LIMITS.why) }).ok, true)
})
