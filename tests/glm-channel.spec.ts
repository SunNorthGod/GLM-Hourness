import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, Config } from '../src/glm-llm/index.ts'
import { ZcodeAdapter } from '../src/glm-llm/zcode.ts'

test('apply registers the native adapter under the configured provider route', () => {
  const registered: Array<{ providers: readonly string[], adapter: ZcodeAdapter }> = []
  const dispose = apply({
    registerAdapter: (providers, adapter) => { registered.push({ providers, adapter }); return () => {} },
  }, { home: 'C:/ws/.llm' })
  assert.deepEqual(registered[0]!.providers, ['glm-zcode'])
  assert.ok(registered[0]!.adapter instanceof ZcodeAdapter)
  assert.equal(typeof dispose, 'function')
  dispose()
})

test('apply honors a custom provider id and plan', () => {
  const registered: Array<{ providers: readonly string[] }> = []
  apply({ registerAdapter: (providers, adapter) => { registered.push({ providers }); void adapter; return () => {} } }, { home: 'C:/ws/.llm', provider: 'glm', plan: 'start-plan' })
  assert.deepEqual(registered[0]!.providers, ['glm'])
})

test('a missing home degrades to a no-op instead of failing activation', () => {
  const dispose = apply({ registerAdapter: () => () => {} }, {})
  assert.equal(typeof dispose, 'function')
  dispose()
})

test('Config schema exposes home/plan/provider with coding-plan default', () => {
  assert.equal(typeof Config, 'function') // a Schemastery schema object is callable
  const json = JSON.stringify(Config)
  assert.ok(json.includes('glm-zcode'))
  assert.ok(json.includes('coding-plan'))
  assert.ok(json.includes('start-plan'))
  assert.ok(json.includes('.llm'))
})
