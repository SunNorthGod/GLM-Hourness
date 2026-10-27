/**
 * Real-network smoke probes for the native ZCode channel (keyless parts):
 *   1. agent/configs fetch — endpoint-routing snapshot + captcha switch
 *   2. oauth/cli/init — the OAuth plane answers with a flow (not completed)
 *   3. unsigned upstream request — expect 401/403 (no credential yet)
 * Run: node scripts/smoke-zcode.mjs
 */
import { EndpointRoutingService } from '../src/glm-llm/endpoint-routing.ts'
import { PollOAuthClient } from '../src/glm-llm/auth/oauth.ts'
import { DEFAULT_IDENTITY } from '../src/glm-llm/identity.ts'

const results = []

// 1. agent/configs
try {
  const routing = new EndpointRoutingService({ identity: DEFAULT_IDENTITY })
  const config = await routing.getRequestVerificationConfig()
  const routed = await routing.resolve('https://open.bigmodel.cn/api/anthropic/v1/messages')
  results.push(`1. agent/configs: OK, captcha=${JSON.stringify(config)}, anthropic endpoint routed=${routed.routed}${routed.routed ? ` -> ${routed.url}` : ''}`)
}
catch (error) {
  results.push(`1. agent/configs: FAIL ${error instanceof Error ? error.message : String(error)}`)
}

// 2. oauth/cli/init (started, never completed)
try {
  const client = new PollOAuthClient()
  const started = await client.start()
  results.push(`2. oauth/cli/init: OK flow opened, authorize_url host=${new URL(started.authorizeUrl).host}${new URL(started.authorizeUrl).searchParams.has('redirect') ? ', interstitial attached' : ''}`)
}
catch (error) {
  results.push(`2. oauth/cli/init: FAIL ${error instanceof Error ? error.message : String(error)}`)
}

// 3. unsigned upstream probe
try {
  const response = await fetch('https://open.bigmodel.cn/api/anthropic/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': 'probe.invalid', authorization: 'Bearer probe.invalid', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'glm-5.3', max_tokens: 8, stream: true, messages: [{ role: 'user', content: 'ping' }] }),
  })
  results.push(`3. unsigned upstream: status=${response.status} (expected 401 without a real credential)`)
}
catch (error) {
  results.push(`3. unsigned upstream: FAIL ${error instanceof Error ? error.message : String(error)}`)
}

for (const line of results) console.log(line)
