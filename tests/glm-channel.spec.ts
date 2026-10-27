import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, Config, imageServices } from '../src/glm-llm/index.ts'
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

test('image services come from ctx.get lazily and are absent without the services', () => {
  const store = { readImageRequest: async () => ({ data: new Uint8Array(), mediaType: 'image/png' }), imageHostPath: () => 'C:/host/a.png' }
  const services = imageServices({
    get: name => name === 'attachments' ? store : name === 'fs' ? { processPathFromHostPath: (path: string) => path.replace('C:/host', '/world') } : undefined,
  })
  assert.equal(services.resolveAttachments(), store)
  assert.equal(services.mapHostPath('C:/host/a.png'), '/world/a.png')
  // A context without the services (or with a foreign object) yields nothing.
  const none = imageServices({ get: name => name === 'attachments' ? { unrelated: true } : undefined })
  assert.equal(none.resolveAttachments(), undefined)
  assert.equal(none.mapHostPath('C:/host/a.png'), undefined)
  assert.equal(imageServices({}).resolveAttachments(), undefined)
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
