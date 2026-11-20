import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, CODING_PLAN_PROVIDER, Config, imageServices, sessionHeaders, START_PLAN_PROVIDER } from '../src/glm-llm/index.ts'
import { forgetGlmOnboarding, glmOnboardingDone, noteSessionSeen, recordGlmOnboardingDone, seenSessions, writeSeenSessions } from '../ui/src/channel-model.ts'
import { ZcodeAdapter } from '../src/glm-llm/zcode.ts'
import { START_PLAN_SERVICE, type StartPlanStatusService } from '../src/shared/start-plan-status.ts'

test('apply registers both Coding Plan and Start Plan peer routes by default', async () => {
  const registered: Array<{ providers: readonly string[], adapter: ZcodeAdapter }> = []
  const dispose = apply({
    registerAdapter: (providers, adapter) => { registered.push({ providers, adapter }); return () => {} },
  }, { home: 'C:/ws/.llm' })
  assert.deepEqual(registered[0].providers, [CODING_PLAN_PROVIDER, START_PLAN_PROVIDER])
  assert.ok(registered[0].adapter instanceof ZcodeAdapter)
  assert.deepEqual(registered[0].adapter.providerInfo(CODING_PLAN_PROVIDER), { id: CODING_PLAN_PROVIDER, name: 'GLM · 个人套餐（Coding Plan）' })
  assert.deepEqual(registered[0].adapter.providerInfo(START_PLAN_PROVIDER), { id: START_PLAN_PROVIDER, name: 'GLM · 免费套餐（Start Plan）' })
  const codingModels = (await registered[0].adapter.listModels(CODING_PLAN_PROVIDER)).map(m => m.id)
  const startModels = (await registered[0].adapter.listModels(START_PLAN_PROVIDER)).map(m => m.id)
  assert.deepEqual(codingModels, ['glm-5.3', 'glm-5.3-flash'])
  assert.deepEqual(startModels, ['glm-5.3', 'glm-5.3-flash'])
  assert.equal((await registered[0].adapter.resolveModel(START_PLAN_PROVIDER, 'glm-5.3')).context?.contextWindow, 512_000)
  assert.equal(typeof dispose, 'function')
  dispose?.()
})

test('apply provides START_PLAN_SERVICE, withdraws on dispose, and fails open if provide rejects', () => {
  const services = new Map<string, unknown>()
  const dispose = apply({
    registerAdapter: () => () => {},
    provide: (name: string, value: unknown) => {
      services.set(name, value)
      return () => { services.delete(name) }
    },
  }, { home: 'C:/ws/.llm' })
  const statusSvc = services.get(START_PLAN_SERVICE) as StartPlanStatusService | undefined
  assert.ok(statusSvc !== undefined)
  assert.equal(statusSvc.status().available, true)
  dispose?.()
  assert.equal(services.get(START_PLAN_SERVICE), undefined)

  const warnings: string[] = []
  const origWarn = console.warn
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')) }
  try {
    const disposeBad = apply({
      registerAdapter: () => () => {},
      provide: (name: string) => {
        if (name === START_PLAN_SERVICE) throw new Error('duplicate service')
        return () => {}
      },
    }, { home: 'C:/ws/.llm' })
    assert.ok(warnings.some(line => line.includes(START_PLAN_SERVICE)))
    disposeBad?.()
  }
  finally {
    console.warn = origWarn
  }
})

test('apply honors empty or equal startPlanProvider and legacy plan: start-plan override', () => {
  const registered: Array<{ providers: readonly string[], adapter: ZcodeAdapter }> = []
  apply({ registerAdapter: (providers, adapter) => { registered.push({ providers, adapter }); return () => {} } }, { home: 'C:/ws/.llm', provider: 'glm', plan: 'start-plan' })
  assert.deepEqual(registered[0].providers, ['glm'])
  assert.equal(registered[0].adapter.resolvePlan('glm'), 'start-plan')

  apply({ registerAdapter: (providers, adapter) => { registered.push({ providers, adapter }); return () => {} } }, { home: 'C:/ws/.llm', startPlanProvider: '' })
  assert.deepEqual(registered[1].providers, ['glm-zcode'])

  apply({ registerAdapter: (providers, adapter) => { registered.push({ providers, adapter }); return () => {} } }, { home: 'C:/ws/.llm', provider: 'glm', startPlanProvider: 'glm' })
  assert.deepEqual(registered[2].providers, ['glm'])
  assert.equal(registered[2].adapter.resolvePlan('glm'), 'coding-plan')
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

test('session headers come from the agents service lazily; without it every session reads as main', () => {
  const header = { id: 'session-child', parentSession: 'session-parent', origin: 'subagent' as const }
  const agents = { get: (id: string) => id === 'session-child' ? { session: { header } } : undefined }
  const lookup = sessionHeaders({ get: name => name === 'agents' ? agents : undefined })
  assert.equal(lookup('session-child'), header)
  assert.equal(lookup('session-other'), undefined)
  assert.equal(sessionHeaders({}).call(undefined, 'session-child'), undefined)
  assert.equal(sessionHeaders({ get: () => ({ unrelated: true }) })('session-child'), undefined)
})

test('without a home both peer routes still register (the credential directory defaults to the user-level directory)', () => {
  const registered: string[][] = []
  const dispose = apply({ registerAdapter: providers => { registered.push([...providers]); return () => {} } }, {})
  assert.deepEqual(registered, [['glm-zcode', 'glm-start-plan']])
  assert.equal(typeof dispose, 'function')
  dispose?.()
})

test('Config schema exposes home/plan/provider/startPlanProvider with coding-plan default', () => {
  assert.equal(typeof Config, 'function') // a Schemastery schema object is callable
  const json = JSON.stringify(Config)
  assert.ok(json.includes('glm-zcode'))
  assert.ok(json.includes('glm-start-plan'))
  assert.ok(json.includes('coding-plan'))
  assert.ok(json.includes('start-plan'))
  assert.ok(json.includes('<DSH home>/glm-hourness'))
})

test('Config contextWindow: default 512000; the Loader\'s validation passes any value through, so the row decides', () => {
  const validate = (config: unknown): unknown => Config['~standard'].validate(config)
  assert.deepEqual(validate({}), { value: { plan: 'coding-plan', provider: 'glm-zcode', startPlanProvider: 'glm-start-plan', contextWindow: 512_000 } })
  assert.deepEqual(validate({ contextWindow: 600_000 }), { value: { plan: 'coding-plan', provider: 'glm-zcode', startPlanProvider: 'glm-start-plan', contextWindow: 600_000 } })
  // An out-of-range or non-integer value reaches apply (it falls back there, with the row health saying so) instead of the Loader refusing the row.
  for (const contextWindow of [5, 2_000_000, 600_000.5, '512k']) {
    assert.deepEqual(validate({ contextWindow }), { value: { plan: 'coding-plan', provider: 'glm-zcode', startPlanProvider: 'glm-start-plan', contextWindow } }, String(contextWindow))
  }
  const json = JSON.stringify(Config)
  assert.ok(json.includes('default 512000'))
  assert.ok(json.includes('An integer from 128000 to 1000000'))
})

test('上手记录 (channel-model): done、seen 三个会话与清掉，本机记录坏了安静', () => {
  const backing = new Map<string, string>()
  const storage = { getItem: (key: string) => backing.get(key) ?? null, setItem: (key: string, value: string) => { backing.set(key, value) }, removeItem: (key: string) => { backing.delete(key) } } as Storage
  assert.equal(glmOnboardingDone(storage), undefined)
  recordGlmOnboardingDone(storage, '2026-11-04T00:00:00.000Z')
  assert.equal(glmOnboardingDone(storage), '2026-11-04T00:00:00.000Z')
  assert.equal(glmOnboardingDone(undefined), undefined, 'no storage behaves like no record')
  forgetGlmOnboarding(storage)
  assert.equal(glmOnboardingDone(storage), undefined)

  const first = noteSessionSeen(storage, 's-1')
  assert.deepEqual([first.seen, first.done], [['s-1'], false])
  writeSeenSessions(storage, first.seen)
  noteSessionSeen(storage, 's-1') // 同一会话重复出现不去重出第三次
  writeSeenSessions(storage, noteSessionSeen(storage, 's-2').seen)
  const third = noteSessionSeen(storage, 's-3')
  assert.deepEqual([third.seen, third.done], [['s-1', 's-2', 's-3'], true], '第 3 个不同的会话之后自动收起')
  writeSeenSessions(storage, third.seen)
  const fourth = noteSessionSeen(storage, 's-4')
  assert.deepEqual([fourth.seen, fourth.done], [['s-1', 's-2', 's-3'], true], '封顶三个：新的会话不进列表，同样算到点')
  assert.deepEqual(seenSessions(storage), ['s-1', 's-2', 's-3'])
  assert.deepEqual(seenSessions(undefined), [], 'no storage: empty list')
  const broken = { getItem: () => { throw new Error('full') }, setItem: () => { throw new Error('full') }, removeItem: () => { throw new Error('full') } } as unknown as Storage
  assert.deepEqual(seenSessions(broken), [], 'a broken read is an empty list')
  writeSeenSessions(broken, ['s-1'])
  recordGlmOnboardingDone(broken, 'x')
  forgetGlmOnboarding(broken)
})
