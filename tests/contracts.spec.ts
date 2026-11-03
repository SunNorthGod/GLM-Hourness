import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chargedCredits, creditPricing, creditRate } from '../src/glm-llm/credits.ts'
import { apply as loginApply } from '../src/glm-llm/login-row.ts'
import { aliasSpecs } from '../src/glm-prompt/aliases.ts'
import { apply as glmPromptApply, dialectServiceFor } from '../src/glm-prompt/index.ts'
import { READ_IMAGE_NATIVE, READ_NAME, READ_NATIVE } from '../src/glm-prompt/read-alias.ts'
import { TODO_NATIVE, TODO_WRITE_NAME } from '../src/glm-prompt/todo-reminder.ts'
import { graphTools } from '../src/graph/tools.ts'
import { openEngine } from '../src/graph/engine.ts'
import { apply as designApply } from '../src/design/index.ts'
import { plainWordsIn } from '../src/graph/plain-question.ts'
import { GUARD_RULES } from '../src/guard/catalog.ts'
import { graphFilesOnly } from '../src/guard/graph-files.ts'
import { activeRules, apply as guardApply } from '../src/guard/index.ts'
import { MAIN_AGENT_RULES } from '../src/guard/main-agent-rules.ts'
import { loopDefaultsOf, type ChannelLoopDefault } from '../src/shared/channel-loop.ts'
import { CATALOG } from '../src/rules/builtin.ts'
import { RULES_FILES_ONLY } from '../src/rules/gate.ts'
import { apply as rulesApply, type RulesContext } from '../src/rules/index.ts'
import { RULES_DECLARATION, RULES_SERVICE, rulesService } from '../src/rules/service.ts'
import { loopsFilesOnly, loopsScheduleTools, LOOPS_FILES_ONLY } from '../src/loops/guard.ts'
import { LOOPS_DECLARATION, LOOPS_SERVICE, loopsService } from '../src/loops/service.ts'
import { DECLARATION_SECTION } from '../src/guard/sections.ts'
import { DIALECT_SERVICE, dialectNames, dialectService, toNativeTool, ZCODE_ALIAS_NATIVES, type DialectService } from '../src/shared/dialect.ts'
import type { AgentLike, CommandDefinitionLike, ToolFinalResult } from '../src/shared/dsh-min.ts'
import { healthServiceName, type HealthRow, type HealthState, type RowHealthView } from '../src/shared/health.ts'
import { MEMORY_SERVICE, memoryService } from '../src/shared/memory-service.ts'
import { OUTPUT_STYLE_SECTION } from '../src/shared/output-style.ts'
import { PRICING_SERVICE, peakHoursOf, pricingService, quotaOf, type UsagePricing } from '../src/shared/pricing.ts'
import type { QuotaView } from '../src/shared/quota.ts'
import { DESIGN_TOOL_NAMES, DISPATCH_TOOL_NAMES, GRAPH_TOOL_NAMES, LEARNING_TOOL_NAMES, LESSONS_MERGE_TOOL, LESSONS_QUERY_TOOL, LESSONS_TOOL_NAMES, MEMORY_TOOL_NAMES, ORCHESTRATION_RESIDENT_TOOLS, RULES_TOOL_NAMES } from '../src/shared/tool-names.ts'
import { RESIDENT_TOOLS } from '../src/toolsearch/exposure.ts'
import { apply as hournessApply } from '../src/report/index.ts'
import { DISPATCH_TOOLS } from '../src/workflow/index.ts'
import { PACKAGES } from '../scripts/packages.mjs'
import { designHost } from './design-host.ts'
import { fakeRuntime, serviceStore, type FakeRuntime } from './fake-rc3.ts'
import { lessonsFixture } from './lessons-helpers.ts'
import { memoryFixture } from './memory-helpers.ts'

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
  'glm-hourness/lessons',
  'glm-hourness/workflow',
  'glm-hourness/hourness',
  'glm-hourness/graph',
  'glm-hourness/graph-panel',
  'glm-hourness/rules',
  'glm-hourness/design',
  'glm-hourness/loops',
  'glm-hourness/ui',
]

test('row ids: each package\'s host rows and its client row are the fixed list', () => {
  assert.deepEqual(PACKAGES.flatMap(pkg => [...pkg.rows.map(row => row.id), pkg.client.row]), ROW_IDS)
})

test('tool names: the graph, memory (with its learning tool) and lessons rows register exactly the contract names', () => {
  assert.deepEqual(graphTools('docs/graph', new Map()).map(tool => tool.name), GRAPH_TOOL_NAMES)
  const memory = memoryFixture()
  const lessons = lessonsFixture()
  try {
    assert.deepEqual([...memory.tools.keys()], [...MEMORY_TOOL_NAMES, ...LEARNING_TOOL_NAMES])
    assert.deepEqual([...lessons.tools.keys()], LESSONS_TOOL_NAMES)
  }
  finally {
    memory.dispose()
    lessons.dispose()
  }
})

test('memory service readers: absent and malformed services read as none; a wider one still reads', () => {
  const problems: string[] = []
  const problem = (message: string) => { problems.push(message) }
  const store = serviceStore()
  assert.equal(memoryService(store, problem), undefined)
  assert.equal(memoryService({}, problem), undefined) // a context without get
  assert.deepEqual(problems, [])
  store.provide(MEMORY_SERVICE, { stats: () => ({}) })
  assert.equal(memoryService(store, problem), undefined)
  assert.equal(problems.length, 1)
  const wider = { depth: () => 'concise' as const, stats: () => ({}), hygiene: () => [] }
  const store2 = serviceStore()
  store2.provide(MEMORY_SERVICE, wider)
  assert.equal(memoryService(store2, problem), wider)
  assert.equal(problems.length, 1)
})

test('tool names: the rules row registers exactly the contract names, and the dispatch names are tools the workflow row records', () => {
  assert.ok(DISPATCH_TOOL_NAMES.length > 0)
  for (const name of DISPATCH_TOOL_NAMES) assert.ok((DISPATCH_TOOLS as readonly string[]).includes(name), `${name} is not a dispatch tool the workflow row knows`)
  const rt = fakeRuntime({ natives: [] })
  const stop = rulesApply({ ...rt.ctx, commands: { register: () => () => {} } } as unknown as RulesContext, {})
  assert.deepEqual(rt.scoped.map(tool => tool.name), [...RULES_TOOL_NAMES])
  void stop()
})

test('rules catalog: the rules board\'s gate on its own files is listed under the id the gate carries', () => {
  const entry = CATALOG.find(candidate => candidate.id === RULES_FILES_ONLY)
  assert.deepEqual([entry?.row, entry?.effect, entry?.plugin], ['rules', 'block', 'dsh-hourness'])
})

test('rules catalog: the loop board\'s gate on its own files is listed under the id the gate carries, and the rule denies under that id', () => {
  const entry = CATALOG.find(candidate => candidate.id === LOOPS_FILES_ONLY)
  assert.deepEqual([entry?.row, entry?.effect, entry?.plugin], ['loops', 'block', 'dsh-hourness'])
  assert.equal(LOOPS_FILES_ONLY, 'loops:files-only')
  const verdict = loopsFilesOnly(['C:/work/app'], 'C:/work/app').detect({ name: 'write', arguments: { file_path: 'C:/work/app/docs/loops/entries/u-0a1b2c3d.json' } }, native => native)
  assert.equal(verdict.kind === 'deny' && verdict.rule, LOOPS_FILES_ONLY)
})

test('rules service: absent and malformed values read as none and say so; a wider one still reads', () => {
  const problems: string[] = []
  const problem = (message: string) => { problems.push(message) }
  const store = serviceStore()
  assert.equal(rulesService(store, problem), undefined)
  assert.equal(rulesService({}, problem), undefined) // a context without get
  assert.deepEqual(problems, [])
  store.provide(RULES_SERVICE, { declaration: '' })
  assert.equal(rulesService(store, problem), undefined)
  assert.equal(problems.length, 1)
  const wider = { declaration: RULES_DECLARATION, acceptProposal: () => 1 }
  const store2 = serviceStore()
  store2.provide(RULES_SERVICE, wider)
  assert.equal(rulesService(store2, problem), wider)
  assert.equal(problems.length, 1)
})

test('loops service: absent reads as none without a word, a wrong shape reads as none and says so, a wider service still reads', () => {
  assert.equal(LOOPS_SERVICE, 'glmHournessLoops')
  const problems: string[] = []
  const problem = (message: string) => { problems.push(message) }
  assert.equal(loopsService(serviceStore(), problem), undefined)
  assert.equal(loopsService({}, problem), undefined) // a context without get
  assert.equal(problems.length, 0)
  const runtime = { emit: () => 1, listens: () => true, recordRun: () => undefined }
  for (const [count, value] of [[1, { ...runtime, contribute: 'yes', declaration: LOOPS_DECLARATION }], [2, 42], [3, {}], [4, { ...runtime, contribute: () => ({ ok: false, reason: 'x' }) }], [5, { ...runtime, contribute: () => ({ ok: false, reason: 'x' }), declaration: '' }], [6, { contribute: () => ({ ok: false, reason: 'x' }), declaration: LOOPS_DECLARATION }]] as const) {
    const store = serviceStore()
    store.provide(LOOPS_SERVICE, value)
    assert.equal(loopsService(store, problem), undefined)
    assert.equal(problems.length, count)
    assert.ok(problems[count - 1]?.includes(LOOPS_SERVICE))
  }
  const wider = { ...runtime, contribute: () => ({ ok: false, reason: 'x' }), declaration: LOOPS_DECLARATION, staleEntries: () => [] }
  const store2 = serviceStore()
  store2.provide(LOOPS_SERVICE, wider)
  assert.equal(loopsService(store2, problem), wider)
  assert.equal(problems.length, 6)
  const wrong = serviceStore()
  wrong.provide(LOOPS_SERVICE, 0)
  assert.equal(loopsService(wrong), undefined, 'the callback is optional')
})

/**
 * The lines of the glm:guard section the guard row declares on a GLM route,
 * with the rules service as given (none when undefined) and the loop row in
 * the activation state given (not loaded when undefined): the loop board's gate
 * is in every host process while its service is only in the one that can reach
 * a session, so its line follows the row's health (loops design §6.1, §11.1).
 */
async function guardDeclaration(rules: unknown, loops?: HealthState): Promise<{ lines: string[], warnings: string[] }> {
  const rt = fakeRuntime({ route: GLM })
  if (rules !== undefined) rt.services.set(RULES_SERVICE, rules)
  if (loops !== undefined) rt.services.set(healthServiceName('loops'), { row: 'loops', activation: () => ({ state: loops, reason: '循环板', at: new Date() }), session: () => undefined } satisfies RowHealthView)
  guardApply(rt.ctx as never, { home: 'C:/ws/.llm', fs: { mkdir: () => Promise.resolve(undefined), appendFile: () => Promise.resolve() } })
  const { warnings } = await quietly(() => rt.create())
  const assembled = await quietly(() => rt.assemble(GLM))
  const section = assembled.value.sections.find(candidate => candidate.name === DECLARATION_SECTION)
  assert.ok(section !== undefined)
  return { lines: section.text.split('\n'), warnings: [...warnings, ...assembled.warnings] }
}

test('guard declaration: the glm:guard section gets exactly one extra line when the rules service is present, and none when it is absent or malformed', async () => {
  const without = await guardDeclaration(undefined)
  const present = await guardDeclaration({ declaration: RULES_DECLARATION })
  assert.equal(present.lines.length, without.lines.length + 1)
  assert.deepEqual(present.lines.slice(0, -1), without.lines)
  assert.equal(present.lines.at(-1), `- ${RULES_DECLARATION}`)
  const malformed = await guardDeclaration({ declaration: 42 })
  assert.deepEqual(malformed.lines, without.lines)
  assert.equal(malformed.warnings.filter(warning => warning.includes(RULES_SERVICE)).length, 1, 'a service of the wrong shape is warned about once')
})
test('guard declaration: the loop board\'s line follows its row, not its service, so a process that runs no entry still declares the gate', async () => {
  const without = await guardDeclaration(undefined)
  const both = await guardDeclaration({ declaration: RULES_DECLARATION }, 'active')
  assert.equal(both.lines.length, without.lines.length + 2)
  assert.deepEqual(both.lines.slice(-2), [`- ${RULES_DECLARATION}`, `- ${LOOPS_DECLARATION}`])
  assert.equal((await guardDeclaration(undefined, 'degraded')).lines.at(-1), `- ${LOOPS_DECLARATION}`, 'a row that is partly in effect still has its gate')
  assert.deepEqual((await guardDeclaration(undefined, 'inactive')).lines, without.lines, 'a row that cannot act declares nothing')
  assert.deepEqual(without.lines.filter(line => line.includes(LOOPS_DECLARATION)), [], 'and neither does one that is not loaded')
})

test('guard catalog: each listed rule is the id of a rule object its row installs, and nothing the row installs is missing', () => {
  // The guard row installs what activeRules gives with a containment root; the graph row installs graphFilesOnly.
  const installed = {
    guard: activeRules({ workspaceRoots: ['C:/work/app'], base: 'C:/work/app' }).map(rule => rule.id),
    graph: [graphFilesOnly('C:/work/app/docs/graph', 'C:/work/app').id],
    loops: [loopsFilesOnly(['C:/work/app'], 'C:/work/app').id, loopsScheduleTools(true).id],
  }
  const listed = (row: string): string[] => GUARD_RULES.filter(rule => rule.row === row).map(rule => rule.id)
  assert.deepEqual(listed('guard').sort(), [...installed.guard].sort())
  assert.deepEqual(listed('graph'), installed.graph)
  assert.deepEqual(listed('loops'), installed.loops)
  assert.deepEqual([...new Set(GUARD_RULES.map(rule => rule.row))].sort(), ['graph', 'guard', 'loops'], 'only rows that exist on main')
  assert.ok(GUARD_RULES.every(rule => rule.mode === 'enforce'), 'a rule that is in the catalog denies: there is no shadow mode')
})

test('tool names: the design row registers exactly the contract names, and withdraws them when the tools service leaves', () => {
  const host = designHost()
  designApply(host.ctx)
  assert.deepEqual([...host.tools.keys()], DESIGN_TOOL_NAMES)
  host.injector.remove('tools')
  assert.deepEqual([...host.tools.keys()], [])
})

test('tool names: every orchestration tool kept resident exists, and GLM tool search keeps it resident', () => {
  const known = new Set([...GRAPH_TOOL_NAMES, ...MEMORY_TOOL_NAMES, ...DESIGN_TOOL_NAMES, ...LESSONS_TOOL_NAMES])
  for (const name of ORCHESTRATION_RESIDENT_TOOLS) {
    assert.ok(known.has(name), `${name} is resident but no orchestration row registers it`)
    assert.ok(RESIDENT_TOOLS.has(name), name)
  }
})

test('persona section: the name the design row adds and the dialect places is one string in the products of both packages', async () => {
  const names = await Promise.all(PACKAGES.map(async pkg => ((await import(`../${pkg.dir}/dist/shared/output-style.js`)) as { OUTPUT_STYLE_SECTION: string }).OUTPUT_STYLE_SECTION))
  assert.deepEqual(names, PACKAGES.map(() => 'hourness:output-style'))
  assert.equal(OUTPUT_STYLE_SECTION, 'hourness:output-style')
})

test('tool names: the learning tool is the main agent\'s read-only view and stays deferred in the GLM face; the memory tools stay resident', () => {
  for (const name of LEARNING_TOOL_NAMES) assert.ok(!ORCHESTRATION_RESIDENT_TOOLS.has(name) && !RESIDENT_TOOLS.has(name), name)
  for (const name of MEMORY_TOOL_NAMES) assert.ok(ORCHESTRATION_RESIDENT_TOOLS.has(name) && RESIDENT_TOOLS.has(name), name)
})

test('tool names: the lookup of the lessons board is resident for every agent in the GLM face, the merge tool is the main agent\'s and stays deferred', () => {
  assert.ok(ORCHESTRATION_RESIDENT_TOOLS.has(LESSONS_QUERY_TOOL) && RESIDENT_TOOLS.has(LESSONS_QUERY_TOOL))
  assert.ok(!ORCHESTRATION_RESIDENT_TOOLS.has(LESSONS_MERGE_TOOL) && !RESIDENT_TOOLS.has(LESSONS_MERGE_TOOL))
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

/** The lines of the `## <title>` section of /hourness, without the title and the blank lines. */
function sectionLines(text: string, title: string): string[] {
  const lines = text.split('\n')
  const rest = lines.slice(lines.indexOf(`## ${title}`) + 1)
  const end = rest.findIndex(line => line.startsWith('## '))
  return (end < 0 ? rest : rest.slice(0, end)).filter(line => line.length > 0)
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
    // The service is the plan with the two members glm-login adds: the plan's own members are the constant's.
    const service = pricingService(store)
    assert.deepEqual([service?.basis, service?.plan, service?.peakHours], [creditPricing.basis, creditPricing.plan, creditPricing.peakHours])
    assert.equal(service?.charged('GLM-5.3', usage, Date.parse(PEAK)), creditPricing.charged('GLM-5.3', usage, Date.parse(PEAK)))
    assert.equal(service?.peak(Date.parse(PEAK)), true)
    assert.deepEqual([typeof service?.quota, Array.isArray(service?.loopDefaults)], ['function', true])
    assert.equal(health(store, 'glm-login').activation().state, 'active')
    const report = reportRow(store)
    const priced = await report()
    // The panel opens with the peak line (of the clock now), says what it read, then gives the numbers; the quota section follows it.
    const panel = sectionLines(priced.text, '面板')
    assert.ok(panel[0]?.startsWith('- 高峰：') && panel[0].endsWith('（GLM 积分套餐）'), priced.text)
    assert.ok(panel[2]?.startsWith('- 范围：2 条用量记录，最早 ') && panel[2].endsWith('；只含经 DSH 发出的请求，ZCode 等其他客户端的消耗不在内'), priced.text)
    assert.deepEqual([panel[1], ...panel.slice(3)], [
      '- 全部用量记录；高峰为工作日 14:00–18:00（UTC+8），其余时段按 50% 计积分；高峰占比按积分计',
      '- 合计：积分 2.57 · 高峰 100% · 缓存命中 80%',
      '- glm-5.3：1 次 · 积分 2.57 · 高峰 100% · 缓存命中 80%',
      '- 不计积分（不在 GLM 积分套餐内）：deepseek-flash 1 次',
    ])
    assert.deepEqual(sectionLines(priced.text, '额度'), ['额度：未登录 GLM（/glm-login）'])
    assert.deepEqual([priced.state, priced.reason], ['active', '报告读取项目目录与用户级目录；积分口径：已提供；额度：已提供'])

    withdraw()
    assert.equal(pricingService(store), undefined)
    const plain = await report()
    assert.ok(plain.text.includes('## 面板\n- 没有计价服务（GLM 通道包的 glm-login 行提供积分口径），只列调用与 token\n- 范围：2 条用量记录，最早 '), plain.text)
    assert.ok(!plain.text.includes('积分 2.57') && !plain.text.includes('## 额度') && !plain.text.includes('高峰：'), plain.text)
    assert.deepEqual([plain.state, plain.reason], ['active', '报告读取项目目录与用户级目录；积分口径：未提供，按 token 列；额度：未提供'])
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

// The three members M6 adds to the pricing service (docs/ORCHESTRATION.md §11.3):
// each is optional and each is read on its own, so a newer or a broken one never
// takes the credits away from the panel.

const PEAK_HOURS = { en: 'weekdays 14:00-18:00 UTC+8', zh: '工作日 14:00–18:00（UTC+8）' }
const LOOP_ENTRY: ChannelLoopDefault = { id: 'glm:peak-reminder', title: '标题', why: '原因', when: { kind: 'peak-start' }, runBy: 'channel' }
const EMPTY_VIEW: QuotaView = { login: { state: 'ok' }, pending: false }

test('pricing members of the quota contract: a service with all three, and one without them, both read; the members read from the same value', async () => {
  const problems: string[] = []
  const problem = (message: string): void => { problems.push(message) }
  const wide: UsagePricing = { ...creditPricing, peakHours: PEAK_HOURS, quota: () => Promise.resolve(EMPTY_VIEW), loopDefaults: [LOOP_ENTRY] }
  const store = serviceStore()
  store.provide(PRICING_SERVICE, wide)
  assert.equal(pricingService(store, problem), wide)
  assert.deepEqual(peakHoursOf(wide, problem), PEAK_HOURS)
  assert.equal(await quotaOf(wide, problem)?.({ waitMs: 3000 }), EMPTY_VIEW)
  assert.deepEqual(loopDefaultsOf(wide, problem), [LOOP_ENTRY])

  const old = serviceStore()
  old.provide(PRICING_SERVICE, creditPricing)
  const oldService = pricingService(old, problem)
  assert.equal(oldService, creditPricing)
  assert.equal(quotaOf(creditPricing, problem), undefined)
  assert.deepEqual(loopDefaultsOf(creditPricing, problem), [])
  assert.deepEqual(problems, [], 'an older channel package reports nothing')
})

test('pricing members of the quota contract: a member of the wrong shape drops only itself and is reported once; the rest of the service still reads', () => {
  const problems: string[] = []
  const problem = (message: string): void => { problems.push(message) }
  const usage = { inputTokens: 1000, cacheReadTokens: 4000, outputTokens: 500 }
  const bent = { ...creditPricing, peakHours: 'weekdays', quota: 'later', loopDefaults: 'glm:a' } as unknown as UsagePricing
  const store = serviceStore()
  store.provide(PRICING_SERVICE, bent)
  assert.equal(pricingService(store, problem), bent, 'the four old members decide whether the service reads')
  assert.equal(bent.charged('glm-5.3', usage, Date.parse(PEAK)), creditPricing.charged('glm-5.3', usage, Date.parse(PEAK)))
  assert.equal(peakHoursOf(bent, problem), undefined)
  assert.equal(quotaOf(bent, problem), undefined)
  assert.deepEqual(loopDefaultsOf(bent, problem), [])
  assert.equal(problems.length, 3)

  const onlyQuota = { ...creditPricing, peakHours: PEAK_HOURS, quota: 5, loopDefaults: [LOOP_ENTRY] } as unknown as UsagePricing
  assert.equal(quotaOf(onlyQuota, problem), undefined)
  assert.deepEqual(peakHoursOf(onlyQuota, problem), PEAK_HOURS, 'a wrong quota leaves the peak hours')
  assert.deepEqual(loopDefaultsOf(onlyQuota, problem), [LOOP_ENTRY], 'a wrong quota leaves the entries')
  assert.equal(problems.length, 4)
})

test('pricing members of the quota contract: a quota that rejects leaves the pricing readable and priced', async () => {
  const problems: string[] = []
  const rejecting: UsagePricing = { ...creditPricing, quota: () => Promise.reject(new Error('quota gone')) }
  const store = serviceStore()
  store.provide(PRICING_SERVICE, rejecting)
  const service = pricingService(store, message => { problems.push(message) })
  assert.equal(service, rejecting)
  assert.deepEqual([service?.peak(Date.parse(PEAK)), service?.plan], [true, creditPricing.plan])
  const read = quotaOf(rejecting)
  assert.ok(read !== undefined)
  await assert.rejects(read(), /quota gone/)
  assert.deepEqual(problems, [])
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
    assert.ok(fromMalformed.value.every(run => run.text.includes('## 面板\n- 没有计价服务') && run.reason?.endsWith('积分口径：未提供，按 token 列；额度：未提供') === true))
    assert.equal(fromMalformed.warnings.length, 1)
    assert.ok(fromMalformed.warnings[0]?.startsWith(`dsh-glm-hourness/hourness: ${PRICING_SERVICE} has the wrong shape`), fromMalformed.warnings[0])

    const throwing: UsagePricing = { basis: '口径', plan: '套餐', charged: () => { throw new Error('rate table gone') }, peak: () => false }
    throwingStore.store.provide(PRICING_SERVICE, throwing)
    const fromThrowing = await quietly(async () => {
      const report = reportRow(throwingStore.store)
      return [await report(), await report()]
    })
    for (const run of fromThrowing.value) {
      assert.ok(run.text.includes('## 面板\n- 高峰：不是高峰（套餐）\n- 口径\n- 范围：2 条用量记录，最早 '), run.text)
      assert.ok(run.text.includes('\n- 合计：积分 0.00\n- 无法计价的记录 2 条（计价服务出错），未计入'), run.text)
      assert.deepEqual(sectionLines(run.text, '额度'), ['额度：GLM 通道包没有提供额度数据'])
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

// The interceptions M3 puts on the main agent are a table the rules board reads (decisions d-rules-visible, d-defaults-readonly; addendum 3.11).
// Each step adds its rows and its triggers here; the step of a row is the last step merged that may hold it.
const MERGED_STEP = 8
const TRIGGERS: Readonly<Record<string, (host: ReturnType<typeof designHost>, agent: AgentLike) => Promise<void>>> = {
  'main-agent-no-write': async (host, agent) => { await host.preExecute(agent, 'write', { file_path: 'a.txt', content: 'x' }) },
  'main-agent-ask': async (host, agent) => { await host.preExecute(agent, 'ask_user_question', {}) },
  'git-snapshot': async (host, agent) => { await host.preExecute(agent, 'pwsh', { command: 'git clean -fdx' }) },
  // A write by a subagent of the main agent, which has no goal in focus.
  'design-before-release': async (host, agent) => { await host.preExecute(host.addAgent('delegated', { origin: 'subagent', parentSession: agent.id }), 'write', { file_path: 'a.txt', content: 'x' }) },
  // A subagent sends the human's words with a graph write; the main agent proposes a question with options or touches the delegations.
  'main-agent-graph-relay': async (host, agent) => { await host.preExecute(host.addAgent('relaying', { origin: 'subagent', parentSession: agent.id }), 'graph_edit', { id: 'goal-1', rev: 'r', set: { stage: 'release' }, reason: 'x', relay: '可以，放行' }) },
  'main-agent-graph-options': async (host, agent) => { await host.preExecute(agent, 'graph_propose', { node: { type: 'question', title: '放哪', parent: 'goal-1', options: [{ key: 'A', label: 'a', gain: 'g', cost: 'c' }, { key: 'B', label: 'b', gain: 'g', cost: 'c' }], recommend: 'B' }, reason: 'x' }) },
  // Any session writes the node of what the human handed over for good with a graph tool.
  'main-agent-graph-delegations': async (host, agent) => { await host.preExecute(agent, 'graph_edit', { id: 'norm-delegations', rev: 'r', set: { acceptance: ['代码风格：主 Agent 定，只告知'] }, reason: 'x' }) },
  // Any session approves the goal of an interview with a graph tool: only the human's agreement, recorded by record_human_answer, moves it on.
  'main-agent-graph-stage': async (host, agent) => {
    await openEngine(join(host.workspace('ws'), 'docs', 'graph')).apply('human', { op: 'propose', reason: '立项', node: { type: 'goal', title: '记账小工具', stage: 'interview' } })
    await host.preExecute(agent, 'graph_approve', { id: 'goal-1', rev: 'r', reason: 'x' })
  },
  // Any session runs the graph's command line to write.
  'main-agent-graph-cli': async (host, agent) => { await host.preExecute(agent, 'pwsh', { command: 'npm run -s graph -- approve \'{"id":"goal-1"}\'' }) },
}

test('main agent rules: ids are unique, titles are one short plain line, every rule steps no later than the merged step', () => {
  const ids = MAIN_AGENT_RULES.map(rule => rule.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const rule of MAIN_AGENT_RULES) {
    assert.equal(rule.title, rule.title.trim())
    assert.notEqual(rule.title, '')
    assert.equal(rule.title.includes('\n'), false, rule.id)
    assert.ok([...rule.title].length <= 40, rule.id)
    assert.deepEqual(plainWordsIn(rule.title), [], rule.id)
    assert.ok(rule.step <= MERGED_STEP, `${rule.id} is a step ${rule.step} rule`)
  }
  assert.deepEqual(ids, Object.keys(TRIGGERS), 'the table lists exactly the rules that have a trigger here')
})

test('main agent rules: every rule of the table denies once on the fake host, and every denial names a rule of the table', async () => {
  const host = designHost()
  designApply(host.ctx)
  const agent = host.addAgent('s1')
  await host.execute(agent, '/wish')
  for (const rule of MAIN_AGENT_RULES) {
    const trigger = TRIGGERS[rule.id]
    assert.ok(trigger !== undefined, rule.id)
    await trigger(host, agent)
  }
  const file = join(host.projectHome, 'audit', 'violations.jsonl')
  for (let attempt = 0; attempt < 200 && (!existsSync(file) || readFileSync(file, 'utf8').split('\n').filter(line => line !== '').length < MAIN_AGENT_RULES.length); attempt++) await new Promise(resolve => setTimeout(resolve, 10))
  const rules = readFileSync(file, 'utf8').split('\n').filter(line => line !== '').map(line => (JSON.parse(line) as { rule: string }).rule)
  assert.deepEqual([...new Set(rules)].sort(), MAIN_AGENT_RULES.map(rule => rule.id).sort())
})
