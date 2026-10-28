/**
 * Authorized real-network smoke: one full native-channel request through the
 * assembled chain (store → deviceMid → routing → headers → signing → SSE).
 * Prerequisite: /glm-login completed (`credentials.json` present in the
 * user-level directory `<DSH home>/glm-hourness`, docs/DESIGN.md §2.4).
 * Reading the store migrates a version-1 record (docs/DESIGN.md §4.1): do
 * not run this while the desktop still runs a pre-m1-parity build.
 * Run: node --experimental-strip-types scripts/smoke-zcode-authorized.mjs
 */
import { ZcodeAdapter } from '../src/glm-llm/zcode.ts'
import { credentialHome } from '../src/shared/data-home.ts'

const home = credentialHome(undefined)
const adapter = new ZcodeAdapter({ home, onEvent: message => console.log(`[signing] ${message}`) })

const status = await adapter.status()
console.log(`status: ${JSON.stringify(status)}`)
if (!status.logged) {
  console.log('NOT LOGGED IN — run /glm-login in any session first.')
  process.exit(1)
}

let text = ''
let usage
let finish
for await (const chunk of adapter.stream({
  provider: 'glm-zcode',
  model: 'glm-5.3',
  system: 'Answer with one word only.',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with exactly: pong' }] }],
  maxTokens: 256,
})) {
  if (chunk.type === 'block-end' && chunk.block.type === 'text') text += chunk.block.text
  if (chunk.type === 'usage') usage = chunk.usage
  if (chunk.type === 'finish') finish = chunk.reason.kind
}
console.log(`text: ${JSON.stringify(text.trim())}`)
console.log(`usage: ${JSON.stringify(usage)}`)
console.log(`finish: ${finish}`)
console.log(finish === 'stop' && text.length > 0 ? 'SMOKE OK — native channel live.' : 'SMOKE INCOMPLETE')
