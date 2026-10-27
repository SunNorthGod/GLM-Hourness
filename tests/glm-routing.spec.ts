import assert from 'node:assert/strict'
import test from 'node:test'
import { EndpointRoutingService, requiresClaimCaptcha } from '../src/glm-llm/endpoint-routing.ts'
import { DEFAULT_IDENTITY } from '../src/glm-llm/identity.ts'

function jsonRespond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const mappingBody = {
  code: 0,
  data: {
    proxyEndpoint: {
      mapping: [
        { from: 'https://open.bigmodel.cn/api/anthropic/v1/messages', to: 'https://zcode.z.ai/api/v1/ultra/v1/messages' },
      ],
    },
    configs: { captcha: { enabled: false, skip_model_request: true } },
  },
}

function makeService(fetchImpl: typeof fetch, now: () => number = Date.now): EndpointRoutingService {
  return new EndpointRoutingService({ identity: DEFAULT_IDENTITY, fetchImpl, now })
}

test('resolve rewrites mapped URLs and preserves the query string', async () => {
  const service = makeService((async () => jsonRespond(200, mappingBody)) as typeof fetch)
  const routed = await service.resolve('https://open.bigmodel.cn/api/anthropic/v1/messages?beta=1')
  assert.equal(routed.routed, true)
  assert.equal(routed.url, 'https://zcode.z.ai/api/v1/ultra/v1/messages?beta=1')
  assert.equal(routed.headers, undefined)
  const unmapped = await service.resolve('https://open.bigmodel.cn/api/other')
  assert.equal(unmapped.routed, false)
})

test('snapshot TTL and failure cooldown keep requests fail-open', async () => {
  let time = 1_000_000
  let fail = false
  let fetches = 0
  const service = makeService((async () => {
    fetches += 1
    if (fail) return jsonRespond(500, {})
    return jsonRespond(200, mappingBody)
  }), () => time)
  await service.resolve('https://open.bigmodel.cn/api/anthropic/v1/messages')
  assert.equal(fetches, 1)
  await service.resolve('https://open.bigmodel.cn/api/anthropic/v1/messages') // snapshot cached
  assert.equal(fetches, 1)
  time += 301_000 // past TTL
  fail = true
  const afterFail = await service.resolve('https://open.bigmodel.cn/api/anthropic/v1/messages') // refresh fails: the previous snapshot keeps serving
  assert.equal(fetches, 2)
  assert.equal(afterFail.routed, true) // fail-open: the stale mapping still routes
  await service.resolve('https://open.bigmodel.cn/api/anthropic/v1/messages') // cooldown: no fetch
  assert.equal(fetches, 2)
})

test('request-verification switch parses from the same snapshot', async () => {
  const service = makeService((async () => jsonRespond(200, mappingBody)) as typeof fetch)
  const config = await service.getRequestVerificationConfig()
  assert.deepEqual(config, { enabled: false, skipModelRequest: true })
  assert.equal(requiresClaimCaptcha(config), false)
  assert.equal(requiresClaimCaptcha(null), true) // absent config: required
})

test('unsafe zcode-authorization targets reject the whole snapshot (fail-closed on config)', async () => {
  const service = makeService((async () => jsonRespond(200, {
    code: 0,
    data: { proxyEndpoint: { mapping: [{ from: 'https://open.bigmodel.cn/api/anthropic/v1/messages', to: 'https://evil.example/v1/messages', zcodeAuthorizationHeader: 'X-ZCode-Authorization' }] } },
  })) as typeof fetch)
  const routed = await service.resolve('https://open.bigmodel.cn/api/anthropic/v1/messages')
  assert.equal(routed.routed, false) // snapshot rejected: no routing
})

test('flagged ultra targets inject the X-ZCode-Authorization bearer', async () => {
  const service = makeService((async () => jsonRespond(200, {
    code: 0,
    data: { proxyEndpoint: { mapping: [{ from: 'https://open.bigmodel.cn/api/anthropic/v1/messages', to: 'https://zcode.z.ai/api/v1/ultra/v1/messages', zcodeAuthorizationHeader: 'X-ZCode-Authorization' }] } },
  })) as typeof fetch)
  const routed = await service.resolve('https://open.bigmodel.cn/api/anthropic/v1/messages', undefined, 'raw-jwt')
  assert.equal(routed.routed, true)
  assert.deepEqual(routed.headers, { 'X-ZCode-Authorization': 'Bearer raw-jwt' })
})
