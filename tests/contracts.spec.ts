import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chargedCredits, creditPricing, creditRate } from '../src/glm-llm/credits.ts'
import { apply as loginApply } from '../src/glm-llm/login-row.ts'
import { aliasSpecs } from '../src/glm-prompt/aliases.ts'
import { apply as glmPromptApply, dialectServiceFor } from '../src/glm-prompt/index.ts'
import { READ_IMAGE_NATIVE, READ_NAME, READ_NATIVE } from '../src/glm-prompt/read-alias.ts'
import { TODO_NATIVE, TODO_WRITE_NAME } from '../src/glm-prompt/todo-reminder.ts'
import { graphTools } from '../src/graph/tools.ts'
import { apply as guardApply } from '../src/guard/index.ts'
import { memoryTools, storeIo } from '../src/memory/tools.ts'
import { DIALECT_SERVICE, dialectNames, dialectService, toNativeTool, ZCODE_ALIAS_NATIVES, type DialectService } from '../src/shared/dialect.ts'
import type { AgentLike, CommandDefinitionLike, ToolFinalResult } from '../src/shared/dsh-min.ts'
import { healthServiceName, type HealthRow, type RowHealthView } from '../src/shared/health.ts'
import { PRICING_SERVICE, pricingService, type UsagePricing } from '../src/shared/pricing.ts'
import { GRAPH_TOOL_NAMES, MEMORY_TOOL_NAMES, ORCHESTRATION_RESIDENT_TOOLS } from '../src/shared/tool-names.ts'
import { RESIDENT_TOOLS } from '../src/toolsearch/exposure.ts'
import { apply as hournessApply } from '../src/report/index.ts'
import { PACKAGES } from '../scripts/packages.mjs'
import { fakeRuntime, serviceStore, type FakeRuntime } from './fake-rc3.ts'

// Contracts between the GLM channel package and the orchestration package
// (docs/DESIGN.md §8): strings and service shapes no import rule sees.

const GLM = { provider: 'glm-zcode', model: 'glm-5.3' }

// Row ids are what profile overrides match (docs/DESIGN.md §2.3): written
// out here, apart from the directory table, so a rename of a row in the
// table and its patch together still fails here and shows in review. A new
// row is added to this list in the same change.
const ROW_IDS = [
  'glm-hourness/glm-llm',
  'glm-hourness/glm-login',
  'glm-hourness/glm-prompt',
  'glm-hourness/glm-compact',
  'glm-hourness/glm-ui',
  'glm-hourness/data',
  'glm-hourness/guard',
  'glm-hourness/memory',
  'glm-hourness/workflow',
  'glm-hourness/hourness',
  'glm-hourness/graph',
  'glm-hourness/graph-panel',
  'glm-hourness/rules',
  'glm-hourness/design',
  'glm-hourness/ui',
]

test('row ids: each package\'s host rows and its client row are the fixed list', () => {
  assert.deepEqual(PACKAGES.flatMap(pkg => [...pkg.rows.map(row => row.id), pkg.client.row]), ROW_IDS)
})

test('tool names: the graph and memory rows register exactly the contract names', () => {
  assert.deepEqual(graphTools('docs/graph', new Map()).map(tool => tool.name), GRAPH_TOOL_NAMES)
  const io = storeIo({ readFile: () => Promise.resolve(''), writeFile: () => Promise.resolve(), rename: () => Promise.resolve() }, 'C:/ws/.llm')
  assert.deepEqual(memoryTools(io).map(tool => tool.name), MEMORY_TOOL_NAMES)
})

test('tool names: every orchestration tool kept resident exists, and GLM tool search keeps it resident', () => {
  const known = new Set([...GRAPH_TOOL_NAMES, ...MEMORY_TOOL_NAMES])
  for (const name of ORCHESTRATION_RESIDENT_TOOLS) {
    assert.ok(known.has(name), `${name} is resident but no orchestration row registers it`)
    assert.ok(RESIDENT_TOOLS.has(name), name)
  }
})

test('dialect: the static alias table is the dialect\'s own alias definitions plus Read and TodoWrite', () => {
  const own = new Map([...aliasSpecs.map(spec => [spec.zcodeName, spec.nativeName] as const), [READ_NAME, READ_NATIVE], [TODO_WRITE_NAME, TODO_NATIVE]])
  assert.deepEqual([...ZCODE_ALIAS_NATIVES].sort(), [...own].sort())
})

test('dialect: the service maps every alias as the table does, nothing else, and names each native back', () => {
  const service = dialectServiceFor(new WeakSet())
  for (const [alias, native] of ZCODE_ALIAS_NATIVES) {
    assert.equal(service.nativeOf(alias), native, alias)
    assert.equal(service.faceName(native), alias, native)
    // Without a service the static table gives the same native.
    assert.equal(toNativeTool(undefined, alias), toNativeTool(service, alias), alias)
  }
  assert.equal(service.faceName(READ_IMAGE_NATIVE), READ_NAME)
  for (const name of ['write', 'pwsh', 'bash', 'str_replace_editor', 'graph_show', 'LocalToolSearch']) {
    assert.equal(service.nativeOf(name), undefined, name)
    assert.equal(toNativeTool(service, name), name, name)
  }
  assert.equal(service.faceName('str_replace_editor'), 'str_replace_editor')
})

async function quietly<T>(body: () => Promise<T>): Promise<{ value: T, warnings: string[] }> {
  const warnings: string[] = []
  const warn = console.warn
  console.warn = (message: string) => { warnings.push(message) }
  try {
    return { value: await body(), warnings }
  }
  finally {
    console.warn = warn
  }
}

/** A GLM runtime with the glm-prompt and guard rows; `broken` makes the dialect install fail. */
async function rows(broken = false): Promise<FakeRuntime> {
  const rt = fakeRuntime({ route: GLM })
  if (broken) (rt.ctx.tools as { get: unknown }).get = () => { throw new Error('registry gone') }
  glmPromptApply(rt.ctx)
  guardApply(rt.ctx as never, { home: 'C:/ws/.llm', fs: { mkdir: () => Promise.resolve(undefined), appendFile: () => Promise.resolve() } })
  await quietly(() => rt.create())
  return rt
}

const shellWrite = (rt: FakeRuntime): Promise<ToolFinalResult> => rt.ctx.tools.execute({ callId: 'c1', name: 'Bash', arguments: { command: 'Set-Content f.txt x' }, agent: rt.agent, signal: new AbortController().signal })

test('dialect: glm-prompt provides the service; it claims an agent it installed on, on GLM routes only', async () => {
  const rt = await rows()
  const service = dialectService(rt.ctx)
  assert.ok(service !== undefined)
  assert.equal(service.claims(rt.agent, GLM), true)
  assert.equal(service.claims(rt.agent, { provider: 'deepseek', model: 'deepseek-flash' }), false)
  assert.equal(service.claims(rt.agent, undefined), false)
  const other: AgentLike = { ...rt.agent, id: 'agent-2' }
  assert.equal(service.claims(other, GLM), false)
  // The guard reads it: a GLM Bash shell write is denied and corrected in the dialect's names.
  const denied = await shellWrite(rt)
  assert.ok(denied.content[0]?.text?.includes('Right path: Read the target with Read, then apply the change with Write or Edit.'), denied.content[0]?.text)
})

test('dialect: an agent whose dialect install failed is not claimed; the guard still denies, in native names', async () => {
  const rt = await rows(true)
  const service = dialectService(rt.ctx)
  assert.equal(service?.claims(rt.agent, GLM), false)
  const denied = await shellWrite(rt)
  assert.ok(denied.content[0]?.text?.includes('Right path: Read the target with read, then apply the change with write or edit.'), denied.content[0]?.text)
})

test('dialect readers: absent and malformed services read as none; a throwing method counts as absent for that call', () => {
  const problems: string[] = []
  const problem = (message: string) => { problems.push(message) }
  const store = serviceStore()
  assert.equal(dialectService(store, problem), undefined)
  assert.equal(dialectService({}, problem), undefined) // a context without get
  assert.deepEqual(problems, [])
  store.provide(DIALECT_SERVICE, { claims: () => true, nativeOf: () => undefined })
  assert.equal(dialectService(store, problem), undefined)
  assert.equal(problems.length, 1)
  const throwing: DialectService = { claims: () => { throw new Error('a') }, nativeOf: () => { throw new Error('b') }, faceName: () => { throw new Error('c') } }
  assert.equal(toNativeTool(throwing, 'Bash', problem), 'pwsh')
  assert.equal(dialectNames(throwing, { id: 'x', ctx: {} as AgentLike['ctx'] }, GLM, problem), undefined)
  const naming: DialectService = { claims: () => true, nativeOf: () => undefined, faceName: () => { throw new Error('c') } }
  assert.equal(dialectNames(naming, { id: 'x', ctx: {} as AgentLike['ctx'] }, GLM, problem)?.('write'), 'write')
  assert.equal(problems.length, 4)
  // A wider service (a newer GLM package) still reads: only the three members used are checked.
  const wider = { ...dialectServiceFor(new WeakSet()), extra: () => 1 }
  const store2 = serviceStore()
  store2.provide(DIALECT_SERVICE, wider)
  assert.equal(dialectService(store2, problem), wider)
})

// The pricing service (docs/ORCHESTRATION.md §11.3): glm-login provides the
// GLM credit plan, the hourness row's usage panel reads it per invocation.

type Store = ReturnType<typeof serviceStore>
type Command = Pick<CommandDefinitionLike, 'name' | 'handler'>

const health = (store: Store, row: HealthRow): RowHealthView => store.get(healthServiceName(row)) as RowHealthView
const PEAK = '2026-10-28T15:00:00+08:00' // a Wednesday afternoon

/** A scratch DSH store whose data service points at a user-level directory with one peak glm-5.3 call and one deepseek-flash call. */
function pricingStore(): { store: Store, home: string } {
  const home = mkdtempSync(join(tmpdir(), 'glmh-pricing-'))
  mkdirSync(join(home, 'audit'))
  writeFileSync(join(home, 'audit', 'usage.jsonl'), [
    { at: PEAK, provider: 'glm-zcode', model: 'glm-5.3', usage: { inputTokens: 1000, cacheReadTokens: 4000, outputTokens: 500, totalTokens: 5500 } },
    { at: PEAK, provider: 'deepseek-account', model: 'deepseek-flash', usage: { inputTokens: 50, outputTokens: 5, totalTokens: 55 } },
  ].map(record => JSON.stringify(record)).join('\n'))
  const store = serviceStore()
  store.provide('glmHournessData', { userHome: home })
  return { store, home }
}

/** The hourness row on `store`: each call runs /hourness for session s1 and returns its text and the row's report for s1. */
function reportRow(store: Store): () => Promise<{ text: string, state?: string, reason?: string }> {
  const commands: Command[] = []
  hournessApply({ commands: { register: (definition) => { commands.push(definition); return () => {} } }, ...store }, { home: join(tmpdir(), 'glmh-pricing-no-project') })
  const hourness = commands.find(command => command.name === 'hourness')
  assert.ok(hourness !== undefined)
  return async () => {
    const result = await hourness.handler({ agent: { id: 's1' }, rawInput: '' })
    const report = health(store, 'hourness').session('s1')
    return { text: result.text ?? '', ...(report === undefined ? {} : { state: report.state, reason: report.reason }) }
  }
}

const loginRow = (store: Store, home: string, commands: Command[] = []): () => void =>
  loginApply({ commands: { register: (definition) => { commands.push(definition); return () => {} } }, ...store }, { home: join(home, 'credentials') })

test('pricing: glm-login provides the credit plan and the report row prices with it; without it the panel lists tokens and the status stays', async () => {
  const { store, home } = pricingStore()
  try {
    const usage = { inputTokens: 1000, cacheReadTokens: 4000, outputTokens: 500 }
    const glm = creditRate('glm-5.3')
    assert.ok(glm !== undefined)
    assert.equal(creditPricing.charged('GLM-5.3', usage, Date.parse(PEAK)), chargedCredits(glm, usage, Date.parse(PEAK)))
    assert.equal(creditPricing.charged('deepseek-flash', usage, Date.parse(PEAK)), undefined)
    assert.deepEqual([creditPricing.peak(Date.parse(PEAK)), creditPricing.peak(Date.parse('2026-10-28T10:00:00+08:00'))], [true, false])

    const withdraw = loginRow(store, home)
    assert.equal(pricingService(store), creditPricing)
    assert.equal(health(store, 'glm-login').activation().state, 'active')
    const report = reportRow(store)
    const priced = await report()
    assert.ok(priced.text.includes([
      '## 面板',
      '- 全部用量记录；高峰为工作日 14:00–18:00（UTC+8），其余时段按 50% 计积分；高峰占比按积分计',
      '- 合计：积分 2.57 · 高峰 100% · 缓存命中 80%',
      '- glm-5.3：1 次 · 积分 2.57 · 高峰 100% · 缓存命中 80%',
      '- 不计积分（不在 GLM 积分套餐内）：deepseek-flash 1 次',
    ].join('\n')), priced.text)
    assert.deepEqual([priced.state, priced.reason], ['active', '报告读取项目目录与用户级目录；积分口径：已提供'])

    withdraw()
    assert.equal(pricingService(store), undefined)
    const plain = await report()
    assert.ok(plain.text.includes('## 面板\n- 没有计价服务（GLM 通道包的 glm-login 行提供积分口径），只列调用与 token\n- 合计：2 次 · '), plain.text)
    assert.ok(!plain.text.includes('积分 2.57'))
    assert.deepEqual([plain.state, plain.reason], ['active', '报告读取项目目录与用户级目录；积分口径：未提供，按 token 列'])
  }
  finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('pricing: when glm-login cannot provide the service its commands still register; it reports degraded with the reason and warns once', async () => {
  const { store, home } = pricingStore()
  try {
    store.provide(PRICING_SERVICE, creditPricing) // a second glm-login instance
    const commands: Command[] = []
    const { warnings } = await quietly(() => Promise.resolve(loginRow(store, home, commands)))
    assert.deepEqual(commands.map(command => command.name).sort(), ['glm-login', 'glm-logout', 'glm-status'])
    assert.equal(health(store, 'glm-login').activation().state, 'degraded')
    assert.equal(health(store, 'glm-login').activation().reason, `/glm-login、/glm-status、/glm-logout 已注册；积分口径未提供：service "${PRICING_SERVICE}" has been registered`)
    assert.equal(warnings.length, 1)
    assert.ok(warnings[0]?.startsWith(`dsh-glm-hourness/glm-login: ${PRICING_SERVICE} not provided`), warnings[0])
  }
  finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('pricing readers: absent and malformed services read as none; a wider one still reads', () => {
  const problems: string[] = []
  const problem = (message: string) => { problems.push(message) }
  const store = serviceStore()
  assert.equal(pricingService(store, problem), undefined)
  assert.equal(pricingService({}, problem), undefined) // a context without get
  assert.deepEqual(problems, [])
  store.provide(PRICING_SERVICE, { basis: '口径', plan: '套餐', charged: () => 1 })
  assert.equal(pricingService(store, problem), undefined)
  assert.equal(problems.length, 1)
  const wider = { ...creditPricing, window: () => 0 }
  const store2 = serviceStore()
  store2.provide(PRICING_SERVICE, wider)
  assert.equal(pricingService(store2, problem), wider)
  assert.equal(problems.length, 1)
})

test('pricing through the report row: a malformed service lists tokens; a throwing one leaves its calls out of every number; each row warns once', async () => {
  const malformed = pricingStore()
  const throwingStore = pricingStore()
  try {
    malformed.store.provide(PRICING_SERVICE, { basis: '口径', plan: '套餐' })
    const fromMalformed = await quietly(async () => {
      const report = reportRow(malformed.store)
      return [await report(), await report()]
    })
    assert.ok(fromMalformed.value.every(run => run.text.includes('## 面板\n- 没有计价服务') && run.reason?.endsWith('积分口径：未提供，按 token 列') === true))
    assert.equal(fromMalformed.warnings.length, 1)
    assert.ok(fromMalformed.warnings[0]?.startsWith(`dsh-glm-hourness/hourness: ${PRICING_SERVICE} has the wrong shape`), fromMalformed.warnings[0])

    const throwing: UsagePricing = { basis: '口径', plan: '套餐', charged: () => { throw new Error('rate table gone') }, peak: () => false }
    throwingStore.store.provide(PRICING_SERVICE, throwing)
    const fromThrowing = await quietly(async () => {
      const report = reportRow(throwingStore.store)
      return [await report(), await report()]
    })
    for (const run of fromThrowing.value) {
      assert.ok(run.text.includes('## 面板\n- 口径\n- 合计：积分 0.00\n- 无法计价的记录 2 条（计价服务出错），未计入'), run.text)
      assert.equal(run.state, 'active')
    }
    assert.equal(fromThrowing.warnings.length, 1)
    assert.ok(fromThrowing.warnings[0]?.includes('rate table gone'), fromThrowing.warnings[0])
  }
  finally {
    rmSync(malformed.home, { recursive: true, force: true })
    rmSync(throwingStore.home, { recursive: true, force: true })
  }
})
