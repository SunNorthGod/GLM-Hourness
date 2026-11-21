import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { referenceDir } from '../scripts/reference-dir.mjs'
import { buildStartPlanSystem, buildContextPrefixMessage, buildEnvironmentSection, buildDesktopContextSection, customSystemText, providerLabel, stripZcodeIdentityPrefix } from '../src/glm-llm/start-plan.ts'
import { classifyStartPlanFailover } from '../src/glm-llm/account-signals.ts'
import { createStartPlanBalanceReader, formatStartPlanBalanceLine, parseStartPlanBalanceBody, START_PLAN_BALANCE_TIMEOUT_MS } from '../src/glm-llm/start-plan-balance.ts'
import { dialectSections } from '../src/glm-prompt/index.ts'
import { ZCODE_SYSTEM } from '../src/glm-llm/zcode-system.ts'

const env = { cwd: 'C:/ws/proj', platform: 'win32', shell: 'pwsh', osVersion: 'win32 10.0.26100 x64', isGitRepository: true }

test('vendored texts parse with every expected section', () => {
  assert.equal(ZCODE_SYSTEM.cliPrefix, 'You are ZCode, an interactive agent')
  assert.ok(ZCODE_SYSTEM.stableSections[0].includes('# Harness'))
  assert.ok(ZCODE_SYSTEM.stableSections[0]?.includes(' - The system may send updates')) // the desktop default branch
  assert.ok(ZCODE_SYSTEM.dynamicSections.beforeEnvironment.startsWith('Write code that reads like the surrounding code')) // 3.17.1 Dynamic Behavior, no heading
  assert.ok(ZCODE_SYSTEM.dynamicSections.afterEnvironment.includes('# Context management'))
  assert.ok(ZCODE_SYSTEM.contextPrefix.currentDateLine.includes('{date}'))
})

test('vendored texts stay byte-identical to the reference sidecar', async () => {
  const { readFile } = await import('node:fs/promises')
  const reference = JSON.parse(await readFile(join(referenceDir(), 'zcode-api/src/proxy/zcode_system.json'), 'utf8')) as Record<string, unknown>
  const { ZCODE_SYSTEM_TEXT } = await import('../src/glm-llm/zcode-system.ts')
  for (const key of Object.keys(reference)) {
    assert.deepEqual(JSON.parse(ZCODE_SYSTEM_TEXT)[key], reference[key], `section ${key} diverged from the reference sidecar`)
  }
})

test('start-plan system is exactly 3 blocks with the gateway-fingerprinted shapes', () => {
  const blocks = buildStartPlanSystem('my own guidance', env, 'bigmodel', 'glm-5.3', 'C:/viz/dir')
  assert.equal(blocks.length, 3)
  assert.equal(blocks[0].text, ZCODE_SYSTEM.cliPrefix)
  assert.equal(blocks[0].cache_control, undefined) // no cache_control since 3.15.1
  assert.ok(blocks[1].text.includes('# Harness'))
  assert.ok(blocks[1].text.includes('my own guidance')) // custom text appends to stable
  assert.ok(blocks[1].cache_control !== undefined)
  assert.ok(blocks[2].text.startsWith('\n\n')) // dynamic block carries the explicit prefix
  assert.ok(blocks[2].text.includes('- Primary working directory: C:/ws/proj'))
  assert.ok(blocks[2].text.includes('- You are powered by the model named bigmodel-api/glm-5.3.'))
  assert.ok(blocks[2].cache_control !== undefined)
})

test('environment section reflects runtime values; provider label maps', () => {
  const section = buildEnvironmentSection({ ...env, isGitRepository: false }, 'zai', 'glm-5.3')
  assert.ok(section.includes('- Is a git repository: no'))
  assert.ok(section.includes('- Shell: pwsh'))
  assert.ok(section.includes('zai-api/glm-5.3'))
  assert.equal(providerLabel('bigmodel'), 'bigmodel-api')
})

test('desktop context: viz directory line is JSON-stringified; fallback without one', () => {
  const withDir = buildDesktopContextSection('C:/viz/dir')
  assert.ok(withDir.includes('C:\\\\viz\\\\dir'.replace(/\\\\/g, '\\\\')) || withDir.includes(JSON.stringify('C:/viz/dir')))
  const fallback = buildDesktopContextSection(undefined)
  assert.ok(fallback.includes('No visualization output directory'))
  assert.ok(!fallback.includes('Gen UI:'))
})

test('custom system text: strings, block arrays, and noise handling', () => {
  assert.equal(customSystemText('  hello  '), 'hello')
  assert.equal(customSystemText('   '), undefined)
  assert.equal(customSystemText([{ type: 'text', text: 'a' }, 'b' ]), 'a\n\nb')
  assert.equal(customSystemText([{ type: 'text', text: 'a', cache_control: { type: 'ephemeral' } }]), 'a') // cache_control dropped
  assert.equal(customSystemText(42), undefined)
  assert.equal(customSystemText([{ type: 'image', text: 'x' }]), undefined)
})

test('context prefix wraps the currentDate block in system-reminder tags', () => {
  const message = buildContextPrefixMessage(new Date('2026-10-27T09:00:00+08:00'))
  assert.equal(message.role, 'user')
  const text = message.content[0].text
  assert.ok(text.startsWith('<system-reminder>'))
  assert.ok(text.endsWith('</system-reminder>'))
  assert.ok(text.includes('# currentDate\nToday\u0027s date is 2026-10-27.'.replace('\\u0027', '\u0027')) || text.includes("Today's date is 2026-10-27."))
  assert.ok(text.includes('IMPORTANT: this context may or may not be relevant'))
})

test('start-plan system strips duplicate cliPrefix and Identity/Security/Harness assembled by glm-prompt', () => {
  const assembled = dialectSections(false, 'balanced', { tier: 'start-plan' }).map(s => s.text).join('\n\n')
  assert.equal(stripZcodeIdentityPrefix(assembled).startsWith('# Reporting Depth'), true)
  const blocks = buildStartPlanSystem(`${assembled}\n\n# Workspace Rules\nkeep clean`, env, 'bigmodel', 'GLM-5.3-Flash')
  assert.equal(blocks.length, 3)
  assert.equal(blocks[0].text, ZCODE_SYSTEM.cliPrefix)
  // No duplicate cliPrefix, Agent Identity, Security Notice, or # Harness in block 1.
  assert.equal(blocks[1].text.includes(ZCODE_SYSTEM.cliPrefix), false)
  assert.equal(blocks[1].text.split('# Harness').length - 1, 1)
  assert.equal(blocks[1].text.split('IMPORTANT: Assist with authorized security testing').length - 1, 1)
  assert.ok(blocks[1].text.includes('# Reporting Depth'))
  assert.ok(blocks[1].text.includes('# Workspace Rules'))
})

test('start-plan balance reader fetches with Bearer JWT, caches for 60s, handles expired plans, and fails open', async () => {
  assert.equal(START_PLAN_BALANCE_TIMEOUT_MS, 15_000)
  let clock = 1_000_000
  const calls: Array<{ url: string, auth: string | null }> = []
  let mode: 'active' | 'expired' | 'error' = 'active'
  const reader = createStartPlanBalanceReader({
    now: () => clock,
    fetchImpl: ((input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const headers = new Headers(init?.headers)
      calls.push({ url, auth: headers.get('authorization') })
      if (mode === 'error') return Promise.reject(new Error('network down'))
      if (mode === 'expired') {
        return Promise.resolve(Response.json({
          code: 0,
          success: true,
          data: {
            server_time: 2000,
            plans: [{ plan_id: 'p1', name: 'Free Start', ends_at: 2000 }],
            balances: [{ plan_id: 'p1', show_name: 'Start Quota', remaining: 100, total: 100 }],
          },
        }))
      }
      return Promise.resolve(Response.json({
        code: 200,
        success: true,
        data: {
          server_time: 1000,
          plans: [{ plan_id: 'p1', user_plan_id: 'up1', name: 'Free Start', status: 'active', ends_at: 5000, entitlements: [{ effective_at: 900 }] }],
          balances: [{ plan_id: 'p1', user_plan_id: 'up1', show_name: 'Starter', capabilities: ['model:glm-5.3-flash', 'model:glm-5.2'], remaining: 80, total: 100 }],
        },
      }))
    }),
  })

  const first = await reader.read('jwt-alpha')
  assert.equal(first.ok, true)
  if (first.ok) {
    assert.equal(first.active, true)
    assert.equal(first.expired, false)
    assert.deepEqual(first.balances[0]?.models, ['glm-5.3-flash', 'glm-5.2'])
  }
  assert.match(formatStartPlanBalanceLine(first), /Starter 剩余 80\/100 \[glm-5\.3-flash, glm-5\.2\]/)
  assert.equal(calls.length, 1)
  assert.ok(calls[0]?.url.startsWith('https://zcode.z.ai/api/v1/zcode-plan/billing/balance?app_version='))
  assert.equal(calls[0]?.auth, 'Bearer jwt-alpha')

  // Cached for 60s for the same JWT.
  clock += 30_000
  await reader.read('jwt-alpha')
  assert.equal(calls.length, 1)

  // New JWT invalidates cache immediately.
  mode = 'expired'
  const second = await reader.read('jwt-beta')
  assert.equal(calls.length, 2)
  assert.equal(second.ok, true)
  if (second.ok) {
    assert.equal(second.expired, true)
    assert.equal(second.active, false)
  }
  assert.equal(formatStartPlanBalanceLine(second), '免费套餐余额：已过期（Free Start）')

  // Fails open without throwing.
  clock += 61_000
  mode = 'error'
  const failed = await reader.read('jwt-beta')
  assert.deepEqual(failed, { ok: false, at: clock, reason: 'network' })
  assert.equal(formatStartPlanBalanceLine(failed), '免费套餐余额：暂不可读（network）')
  assert.equal(parseStartPlanBalanceBody('not json', 1).ok, false)
})

test('classifyStartPlanFailover distinguishes login rejections, expired, empty, concurrency, unentitled, and non-failover errors', () => {
  // Login rejections never fail over silently.
  assert.equal(classifyStartPlanFailover(401, JSON.stringify({ error: { message: 'insufficient balance' } })), undefined)
  assert.equal(classifyStartPlanFailover(403, JSON.stringify({ code: 3012, msg: 'unusual activity' })), undefined)
  assert.equal(classifyStartPlanFailover(402, JSON.stringify({ error: { code: '3012', message: 'quota exhausted' } })), undefined)

  // Expired takes precedence when present.
  assert.equal(classifyStartPlanFailover(403, JSON.stringify({ msg: 'Start plan has expired' })), 'expired')
  assert.equal(classifyStartPlanFailover(402, '套餐已过期'), 'expired')

  // Empty balance / quota exhaustion.
  assert.equal(classifyStartPlanFailover(402, '{}'), 'empty')
  for (const code of ['1113', 1308, '1309', 1310]) {
    assert.equal(classifyStartPlanFailover(429, JSON.stringify({ error: { code, message: 'limit' } })), 'empty')
  }
  assert.equal(classifyStartPlanFailover(403, JSON.stringify({ data: { message: '余额不足，请充值' } })), 'empty')
  assert.equal(classifyStartPlanFailover(400, JSON.stringify({ message: 'quota exhausted' })), 'empty')

  // Concurrency / 429 rate limiting.
  assert.equal(classifyStartPlanFailover(429, JSON.stringify({ error: { code: '1302', message: 'too fast' } })), 'concurrency')
  assert.equal(classifyStartPlanFailover(429, JSON.stringify({ code: 1305, msg: 'concurrent requests' })), 'concurrency')
  assert.equal(classifyStartPlanFailover(429, 'rate limited'), 'concurrency')

  // Model not entitled on Start Plan.
  assert.equal(classifyStartPlanFailover(403, JSON.stringify({ error: { message: 'Model not supported on start plan' } })), 'unentitled')
  assert.equal(classifyStartPlanFailover(404, JSON.stringify({ msg: '套餐不支持该模型' })), 'unentitled')
  assert.equal(classifyStartPlanFailover(400, JSON.stringify({ error: { reason: 'no entitlement' } })), 'unentitled')

  // Generic 5xx / validation 400 / oversized non-402/429 errors do not fail over.
  assert.equal(classifyStartPlanFailover(500, JSON.stringify({ error: { message: 'internal error' } })), undefined)
  assert.equal(classifyStartPlanFailover(400, JSON.stringify({ error: { message: 'invalid tool schema' } })), undefined)
  assert.equal(classifyStartPlanFailover(429, 'x'.repeat(70_000)), 'concurrency')
  assert.equal(classifyStartPlanFailover(502, 'x'.repeat(70_000)), undefined)
  // Real Start Plan HTTP 200 JSON error envelopes fail over as expected.
  assert.equal(classifyStartPlanFailover(200, JSON.stringify({ code: 1005, msg: 'exceed quota limit' })), 'empty')
  assert.equal(classifyStartPlanFailover(200, JSON.stringify({ code: 403, msg: '套餐不支持该模型' })), 'unentitled')
})

test('start-plan balance reader sends X-Device-Mid and parses 3.19.1 remaining_units/total_units/unit_type fields', async () => {
  const seenHeaders: Array<{ auth: string | null, mid: string | null }> = []
  const reader = createStartPlanBalanceReader({
    deviceMid: () => 'mid-test-1234',
    fetchImpl: ((_input, init) => {
      const headers = new Headers(init?.headers)
      seenHeaders.push({ auth: headers.get('authorization'), mid: headers.get('x-device-mid') })
      return Promise.resolve(Response.json({
        code: 0,
        msg: '',
        data: {
          server_time: 1795220175,
          plans: [{ plan_id: 'zcode-v3-start-plan-wk-1120', user_plan_id: 'upl_1', name: 'ZCODE WEEKEND BUILD', status: 'active', ends_at: 1795395600 }],
          balances: [{
            plan_id: 'zcode-v3-start-plan-wk-1120',
            user_plan_id: 'upl_1',
            show_name: 'GLM-5.3-Flash',
            unit_type: 'token',
            capabilities: ['model:glm-5.3-flash'],
            total_units: 500_000_000,
            used_units: 451_379_864,
            remaining_units: 48_620_136,
            available_units: 48_620_136,
          }],
        },
      }))
    }),
  })
  const read = await reader.read('jwt-real')
  assert.equal(read.ok, true)
  assert.deepEqual(seenHeaders, [{ auth: 'Bearer jwt-real', mid: 'mid-test-1234' }])
  if (read.ok) {
    assert.equal(read.balances[0]?.remaining, 48_620_136)
    assert.equal(read.balances[0]?.total, 500_000_000)
    assert.equal(read.balances[0]?.used, 451_379_864)
    assert.equal(read.balances[0]?.unit, 'token')
  }
  assert.match(formatStartPlanBalanceLine(read), /GLM-5\.3-Flash 剩余 48\.6M\/500M token \[glm-5\.3-flash\]/)
})
