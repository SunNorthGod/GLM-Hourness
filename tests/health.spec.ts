import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveCredential, type StoreFs } from '../src/glm-llm/auth/store.ts'
import { collectHealth, healthServiceName, HEALTH_ROWS, provideRowHealth, renderHealthTable, sessionIdOf, type HealthRow, type RowHealthView } from '../src/shared/health.ts'
import { apply as dataApply } from '../src/data/index.ts'
import { apply as llmApply } from '../src/glm-llm/index.ts'
import { apply as loginApply } from '../src/glm-llm/login-row.ts'
import { apply as promptApply, dialectHealth } from '../src/glm-prompt/index.ts'
import { apply as compactApply } from '../src/glm-prompt/compact-row.ts'
import { apply as guardApply } from '../src/guard/index.ts'
import { apply as memoryApply } from '../src/memory/index.ts'
import { apply as workflowApply } from '../src/workflow/index.ts'
import { apply as hournessApply } from '../src/ui/index.ts'
import { fakeRuntime, serviceStore } from './fake-rc3.ts'
import type { AgentLike, CommandDefinitionLike, LlmStreamOptions, PreExecuteDecision, ToolExecutionPayload } from '../src/shared/dsh-min.ts'
import type { StreamChunk } from '../src/shared/lm-min.ts'

type Store = ReturnType<typeof serviceStore>

const view = (store: Store, row: HealthRow): RowHealthView => store.get(healthServiceName(row)) as RowHealthView
const activation = (store: Store, row: HealthRow) => (({ state, reason }) => ({ state, reason }))(view(store, row).activation())
const inSession = (store: Store, row: HealthRow, sessionId: string) => {
  const report = view(store, row).session(sessionId)
  return report === undefined ? undefined : { state: report.state, reason: report.reason }
}

/** An rc.3 agent as tool executions and command invocations carry it: its id equals its session's id; its latest request ran `model` on `provider`. */
function agentIn(sessionId: string, cwd?: string, provider = 'glm-zcode', model = 'glm-5.3'): AgentLike {
  return { id: sessionId, ctx: {} as AgentLike['ctx'], session: { id: sessionId, header: { id: sessionId, ...(cwd === undefined ? {} : { cwd }) }, deriveMessages: () => [], requestHeader: () => ({ config: { provider, model } }) } }
}

/** Silence the warnings of rows configured without a home, until `run` (or the promise it returns) settles. */
function quietly<T>(run: () => T): T {
  const warn = console.warn
  console.warn = () => {}
  let result: T
  try {
    result = run()
  }
  catch (error) {
    console.warn = warn
    throw error
  }
  if (result instanceof Promise) return result.finally(() => { console.warn = warn }) as T
  console.warn = warn
  return result
}

test('a row provides its health view and withdraws it on dispose', () => {
  const store = serviceStore()
  const health = provideRowHealth(store, 'guard', 'active', 'loaded')
  assert.deepEqual([...store.services.keys()], ['glmHournessHealth/guard'])
  assert.deepEqual(activation(store, 'guard'), { state: 'active', reason: 'loaded' })
  health.dispose()
  assert.equal(store.services.size, 0)
})

test('a session report is stored the first time and on change only; reports without a session are dropped', () => {
  const store = serviceStore()
  let clock = 0
  const health = provideRowHealth(store, 'guard', 'active', 'loaded', () => new Date(Date.UTC(2026, 9, 28, 0, 0, clock++)))
  health.report(undefined, 'inactive', 'no session')
  health.report('', 'inactive', 'no session')
  health.report('s1', 'active', 'in effect')
  const first = view(store, 'guard').session('s1')
  health.report('s1', 'active', 'in effect')
  assert.equal(view(store, 'guard').session('s1'), first) // unchanged status keeps the first report
  health.report('s1', 'degraded', 'partly')
  assert.deepEqual(inSession(store, 'guard', 's1'), { state: 'degraded', reason: 'partly' })
  assert.notEqual(view(store, 'guard').session('s1')!.at, first!.at)
})

test('a row remembers the 64 most recent sessions', () => {
  const store = serviceStore()
  const health = provideRowHealth(store, 'memory', 'active', 'loaded')
  for (let index = 0; index < 65; index += 1) health.report(`s${index}`, 'active', 'x')
  assert.equal(view(store, 'memory').session('s0'), undefined)
  assert.notEqual(view(store, 'memory').session('s1'), undefined)
  assert.notEqual(view(store, 'memory').session('s64'), undefined)
})

test('a second instance of a row or a context without provide never fails activation', () => {
  const store = serviceStore()
  provideRowHealth(store, 'guard', 'active', 'first')
  const warnings: string[] = []
  const warn = console.warn
  console.warn = (message: string) => { warnings.push(message) }
  try {
    const second = provideRowHealth(store, 'guard', 'active', 'second')
    second.report('s1', 'active', 'x')
    second.dispose()
  }
  finally {
    console.warn = warn
  }
  assert.equal(warnings.length, 1)
  assert.ok(warnings[0]!.startsWith('dsh-glm-hourness/guard: row health not provided'))
  assert.deepEqual(activation(store, 'guard'), { state: 'active', reason: 'first' }) // the first view stays
  const local = provideRowHealth({}, 'guard', 'active', 'no provide')
  local.report('s1', 'active', 'x')
  local.dispose()
})

test('the table: absent rows, inactive activation wins, activation-only rows, session reports, idle rows', () => {
  const store = serviceStore()
  provideRowHealth(store, 'data', 'active', '目录已解析').report('s1', 'inactive', 'ignored: data does not act per session')
  provideRowHealth(store, 'glm-llm', 'inactive', 'home 未配置').report('s1', 'active', 'ignored: the row cannot act')
  provideRowHealth(store, 'guard', 'active', '已加载').report('s1', 'degraded', '圈禁规则跳过')
  provideRowHealth(store, 'memory', 'degraded', 'home 未配置，记忆工具关闭')
  provideRowHealth(store, 'workflow', 'active', '已加载')
  const entries = collectHealth(store, 's1')
  assert.deepEqual(entries.map(entry => entry.row), [...HEALTH_ROWS])
  const byRow = Object.fromEntries(entries.map(entry => [entry.row, [entry.status, entry.reason]]))
  assert.deepEqual(byRow['glm-login'], ['absent', '行未启用，或激活未完成'])
  assert.deepEqual(byRow['data'], ['active', '目录已解析'])
  assert.deepEqual(byRow['glm-llm'], ['inactive', 'home 未配置'])
  assert.deepEqual(byRow['guard'], ['degraded', '圈禁规则跳过'])
  assert.deepEqual(byRow['memory'], ['degraded', 'home 未配置，记忆工具关闭'])
  assert.deepEqual(byRow['workflow'], ['idle', '已加载'])
  assert.equal(collectHealth(store, undefined).find(entry => entry.row === 'guard')!.status, 'idle') // no session to read
  assert.equal(collectHealth({ get: () => ({ unrelated: true }) }, 's1')[0]!.status, 'absent') // a foreign value is not a view
})

test('the rendered table names the session, labels each status and escapes cells', () => {
  const text = renderHealthTable([
    { row: 'glm-prompt', status: 'active', reason: 'GLM 路由 a|b' },
    { row: 'glm-compact', status: 'idle', reason: '已加载\n只作用于压缩请求' },
    { row: 'glm-llm', status: 'absent', reason: '行未启用，或激活未完成' },
  ], 'session-1')
  assert.equal(text, [
    '## 行健康（会话 session-1）',
    '',
    '| 行 | 状态 | 说明 |',
    '| --- | --- | --- |',
    '| glm-prompt | 生效 | GLM 路由 a\\|b |',
    '| glm-compact | 已加载，本会话未触发 | 已加载 只作用于压缩请求 |',
    '| glm-llm | 未加载 | 行未启用，或激活未完成 |',
  ].join('\n'))
  assert.ok(renderHealthTable([], undefined).startsWith('## 行健康\n'))
  assert.equal(sessionIdOf(agentIn('s9')), 's9')
  assert.equal(sessionIdOf({ id: 'a1' }), 'a1')
  assert.equal(sessionIdOf(undefined), undefined)
})

test('data: active with both directories, degraded without the project directory, inactive when the service cannot be provided', () => {
  const store = serviceStore()
  dataApply(store, { dshHome: '/scratch', projectHome: 'C:/ws/.llm' })
  assert.equal(activation(store, 'data').state, 'active')
  assert.ok(activation(store, 'data').reason.endsWith('项目目录 C:/ws/.llm'))
  const bare = serviceStore()
  quietly(() => dataApply(bare, { dshHome: '/scratch' }))
  assert.equal(activation(bare, 'data').state, 'degraded')
  assert.ok(activation(bare, 'data').reason.includes('项目目录未配置'))
  const taken = serviceStore()
  taken.provide('glmHournessData', { userHome: '/elsewhere' })
  quietly(() => dataApply(taken, { dshHome: '/scratch', projectHome: 'C:/ws/.llm' }))
  assert.equal(activation(taken, 'data').state, 'inactive')
  assert.ok(activation(taken, 'data').reason.startsWith('数据目录服务未提供'))
})

/** Run with `$DSH_HOME` pointed at a directory that does not exist, so no test reads the real credential store. */
async function withMissingDshHome<T>(run: (dshHome: string) => T | Promise<T>): Promise<T> {
  const previous = process.env.DSH_HOME
  const dshHome = join(tmpdir(), 'glm-hourness-health-missing-dsh-home')
  process.env.DSH_HOME = dshHome
  try {
    return await run(dshHome)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  }
}

test('glm-llm: the registered route and the credential directory at activation; without a home the user-level directory', async () => {
  const store = serviceStore()
  llmApply({ registerAdapter: () => () => {}, ...store }, { home: 'C:/ws/.llm' })
  assert.deepEqual(activation(store, 'glm-llm'), { state: 'active', reason: '已注册路由 glm-zcode（套餐 coding-plan，凭证目录 C:/ws/.llm）' })
  await withMissingDshHome(dshHome => {
    const bare = serviceStore()
    llmApply({ registerAdapter: () => () => {}, ...bare }, {})
    assert.deepEqual(activation(bare, 'glm-llm'), { state: 'active', reason: `已注册路由 glm-zcode（套餐 coding-plan，凭证目录 ${join(dshHome, 'glm-hourness')}）` })
  })
})

test('glm-llm: a request without a credential reports the session inactive with the login instruction', async () => {
  const store = serviceStore()
  const adapters: Array<{ stream(options: unknown): AsyncIterable<unknown> }> = []
  llmApply({ registerAdapter: (_providers, adapter) => { adapters.push(adapter as never); return () => {} }, ...store }, { home: 'C:/definitely-missing-glm-hourness-health-home' })
  await assert.rejects(async () => { for await (const chunk of adapters[0]!.stream({ provider: 'glm-zcode', model: 'glm-5.3', sessionId: 's1', messages: [] })) void chunk }, /\/glm-login/)
  assert.deepEqual(inSession(store, 'glm-llm', 's1'), { state: 'inactive', reason: '未登录：凭证为空，运行 /glm-login' })
})

test('glm-llm: a coding-plan request without a project access token reports the 3.16.3 reason and sends nothing', async () => {
  // A stored login without an OAuth token cannot mint the project token; 3.16.3 fails such a request closed.
  const home = mkdtempSync(join(tmpdir(), 'glmh-health-'))
  try {
    const fs: StoreFs = { readFile: path => readFile(path, 'utf8'), writeFile: (path, data) => writeFile(path, data), rename }
    await saveCredential(fs, join(home, 'credentials.json'), { apiKey: 'fake-key', provider: 'bigmodel' })
    const store = serviceStore()
    const adapters: Array<{ stream(options: unknown): AsyncIterable<unknown> }> = []
    llmApply({ registerAdapter: (_providers, adapter) => { adapters.push(adapter); return () => {} }, ...store }, { home })
    const [adapter] = adapters
    await assert.rejects(async () => { for await (const chunk of adapter.stream({ provider: 'glm-zcode', model: 'glm-5.3', sessionId: 's1', messages: [] })) void chunk }, /project access token unavailable .*\/glm-login/)
    assert.deepEqual(inSession(store, 'glm-llm', 's1'), { state: 'inactive', reason: '未拿到项目令牌（Account request credential is unavailable: bigmodel），按 3.16.3 不发送；运行 /glm-login' })
  }
  finally {
    rmSync(home, { recursive: true, force: true })
  }
})

type Command = Pick<CommandDefinitionLike, 'name' | 'handler'>

function loginRow(config: { home?: string }) {
  const store = serviceStore()
  const commands: Command[] = []
  const dispose = loginApply({ commands: { register: definition => { commands.push(definition); return () => {} } }, ...store }, config)
  const run = (name: string, sessionId: string) => commands.find(command => command.name === name)!.handler({ agent: agentIn(sessionId), rawInput: '' })
  return { store, commands, dispose, run }
}

test('/glm-status prints the credential line, then the health table of the invoking session', async () => {
  const { store, run } = loginRow({ home: 'C:/definitely-missing-glm-hourness-health-home' })
  provideRowHealth(store, 'guard', 'active', '已加载').report('s1', 'active', '门禁生效')
  const result = await run('glm-status', 's1')
  assert.equal(result.kind, 'success')
  const credential = result.text.slice(0, result.text.indexOf('\n\n'))
  const table = result.text.slice(credential.length + 2)
  assert.equal(credential, 'glm-zcode：未登录（套餐 coding-plan）。运行 /glm-login 开始登录')
  assert.ok(table!.startsWith('## 行健康（会话 s1）\n\n| 行 | 状态 | 说明 |'))
  assert.deepEqual(table!.split('\n').slice(4).map(line => line.split(' | ')[0]), HEALTH_ROWS.map(row => `| ${row}`)) // one line per row, in patch order
  assert.ok(table!.includes('| glm-login | 生效 | /glm-login、/glm-status、/glm-logout 已注册 |'))
  assert.ok(table!.includes('| guard | 生效 | 门禁生效 |'))
  assert.ok(table!.includes('| glm-prompt | 未加载 | 行未启用，或激活未完成 |'))
  const other = await run('glm-status', 's2')
  assert.ok(other.text.includes('| guard | 已加载，本会话未触发 | 已加载 |')) // another session: the guard has not acted there
})

test('/glm-status reports a stored login coding-plan cannot use as not logged in, with the 3.16.3 reason', async () => {
  // Every coding-plan request fails closed on such a login; the status line must not call it logged in.
  const home = mkdtempSync(join(tmpdir(), 'glmh-status-'))
  try {
    const fs: StoreFs = { readFile: path => readFile(path, 'utf8'), writeFile: (path, data) => writeFile(path, data), rename }
    const statusLine = async (): Promise<string> => {
      const { run } = loginRow({ home })
      const result = await run('glm-status', 's1')
      return result.text.slice(0, result.text.indexOf('\n\n'))
    }
    await saveCredential(fs, join(home, 'credentials.json'), { version: 2, provider: 'bigmodel', userId: 'user-1' })
    assert.equal(await statusLine(), 'glm-zcode：未登录（套餐 coding-plan，登录不完整：Account request credential is unavailable: bigmodel）。运行 /glm-login 开始登录')
    await saveCredential(fs, join(home, 'credentials.json'), { version: 2, provider: 'bigmodel', oauthAccessToken: 'fake-oauth' })
    assert.equal(await statusLine(), 'glm-zcode：未登录（套餐 coding-plan，登录不完整：Account request credential is unavailable: account:bigmodel-individual-coding-plan）。运行 /glm-login 开始登录')
    await saveCredential(fs, join(home, 'credentials.json'), { version: 2, provider: 'bigmodel', oauthAccessToken: 'fake-oauth', userId: 'user-1' })
    assert.equal(await statusLine(), 'glm-zcode：已登录（套餐 coding-plan，Key unresolved，账号 user-1）')
  }
  finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('without a home the login row uses the user-level directory: all three commands, status reads the store there', async () => {
  await withMissingDshHome(async () => {
    const { commands, run } = loginRow({})
    assert.deepEqual(commands.map(command => command.name).sort(), ['glm-login', 'glm-logout', 'glm-status'])
    const result = await run('glm-status', 's1')
    assert.ok(result.text.startsWith('glm-zcode：未登录（套餐 coding-plan）。运行 /glm-login 开始登录\n\n## 行健康（会话 s1）'))
    assert.ok(result.text.includes('| glm-login | 生效 | /glm-login、/glm-status、/glm-logout 已注册 |'))
  })
})

test('glm-prompt: GLM steps report the dialect in effect, other routes report why not, a failed install says so', async () => {
  const runtime = fakeRuntime()
  promptApply(runtime.ctx)
  const store = runtime.ctx as unknown as Store
  assert.deepEqual(activation(store, 'glm-prompt'), { state: 'active', reason: '已加载（工具检索 local）' })
  await runtime.create()
  await runtime.assemble({ provider: 'glm-zcode', model: 'glm-5.3' })
  assert.deepEqual(inSession(store, 'glm-prompt', 'agent-1'), { state: 'active', reason: 'GLM 路由 glm-zcode/glm-5.3：ZCode 提示词与工具面，工具检索 local' })
  await runtime.assemble({ provider: 'deepseek', model: 'deepseek-flash' })
  assert.deepEqual(inSession(store, 'glm-prompt', 'agent-1'), { state: 'inactive', reason: '非 GLM 路由 deepseek/deepseek-flash，保持 DSH 原文与原生工具' })

  const off = fakeRuntime()
  promptApply(off.ctx, { toolSearchMode: 'off' })
  await off.create()
  await off.assemble({ provider: 'glm-zcode', model: 'glm-5.3' })
  assert.equal(inSession(off.ctx as unknown as Store, 'glm-prompt', 'agent-1')!.reason, 'GLM 路由 glm-zcode/glm-5.3：ZCode 提示词与工具面，工具检索关闭（toolSearchMode: off）')
  assert.deepEqual(dialectHealth({ provider: 'glm-zcode', model: 'glm-5.3' }, true, 'missing'), ['degraded', 'GLM 路由 glm-zcode/glm-5.3：ZCode 提示词与工具面；工具检索未安装（会话历史不可读）'])

  const broken = fakeRuntime()
  promptApply(broken.ctx)
  ;(broken.ctx.tools as { register: unknown }).register = () => { throw new Error('register refused') }
  await quietly(() => broken.create())
  assert.deepEqual(inSession(broken.ctx as unknown as Store, 'glm-prompt', 'agent-1'), { state: 'inactive', reason: '方言未安装：register refused' })
})

test('glm-compact: compaction requests report mirrored, non-GLM or unrecognized; other requests do not report', async () => {
  const store = serviceStore()
  let listener: ((options: LlmStreamOptions, next: () => AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>) | undefined
  compactApply({ llm: { stream: () => (async function* () {})() }, on: (_event, registered) => { listener = registered; return () => {} }, ...store })
  assert.equal(activation(store, 'glm-compact').state, 'active')
  const none = () => (async function* (): AsyncIterable<StreamChunk> {})()
  const instruction = { role: 'user', content: [{ type: 'text', text: 'You are now acting as a compaction engine for this AI coding assistant.' }] }
  listener!({ provider: 'glm-zcode', model: 'glm-5.3', sessionId: 's0', messages: [instruction] }, none)
  assert.equal(view(store, 'glm-compact').session('s0'), undefined) // not a compaction request
  listener!({ provider: 'glm-zcode', model: 'glm-5.3', sessionId: 's1', purpose: 'compaction', messages: [instruction] }, none)
  assert.deepEqual(inSession(store, 'glm-compact', 's1'), { state: 'active', reason: 'GLM 压缩请求改用 ZCode 指令与摘要格式（glm-zcode/glm-5.3）' })
  listener!({ provider: 'deepseek', model: 'deepseek-flash', sessionId: 's2', purpose: 'compaction', messages: [instruction] }, none)
  assert.deepEqual(inSession(store, 'glm-compact', 's2'), { state: 'inactive', reason: '非 GLM 路由 deepseek/deepseek-flash，压缩请求原样放行' })
  listener!({ provider: 'glm-zcode', model: 'glm-5.3', sessionId: 's3', purpose: 'compaction', messages: [{ role: 'user', content: [{ type: 'text', text: 'custom summarizer' }] }] }, none)
  assert.equal(inSession(store, 'glm-compact', 's3')!.state, 'inactive')
})

function preExecuteRow(applyRow: (ctx: never, config: never) => () => void, config: Record<string, unknown>, data?: unknown) {
  const store = serviceStore()
  let listener: ((payload: ToolExecutionPayload, next: () => Promise<PreExecuteDecision>) => Promise<PreExecuteDecision>) | undefined
  const ctx = { on: (event: string, registered: typeof listener) => { if (event === 'tools/pre-execute') listener = registered; return () => {} }, ...store, get: (name: string) => name === 'glmHournessData' ? data : store.get(name) }
  applyRow(ctx as never, config as never)
  return { store, call: (payload: ToolExecutionPayload) => listener!(payload, async () => ({ kind: 'allow' })) }
}

const memoryFs = { mkdir: async () => undefined, appendFile: async () => {} }

test('guard: in effect with a session directory and a project directory, degraded with the gap named', async () => {
  const { store, call } = preExecuteRow(guardApply as never, { fs: memoryFs }, { userHome: 'C:/u/glm-hourness', projectHome: 'C:/ws/.llm' })
  await call({ name: 'Read', arguments: { file_path: 'C:\\ws\\a.ts' }, agent: agentIn('s1', 'C:\\ws') })
  assert.deepEqual(inSession(store, 'guard', 's1'), { state: 'active', reason: '门禁生效（file-tools-only，圈禁根 C:\\ws）；违规记入 C:/ws/.llm；影子兜底未启用（组合里没有 workspace-changes）' })
  await call({ name: 'Read', arguments: {}, agent: agentIn('s2') })
  assert.deepEqual(inSession(store, 'guard', 's2'), { state: 'degraded', reason: '门禁生效（file-tools-only）；会话没有工作目录，圈禁规则跳过；影子兜底未启用（组合里没有 workspace-changes）' })
  store.services.set('workspaceChanges', { summary: () => undefined })
  await call({ name: 'Read', arguments: {}, agent: agentIn('s4', 'C:\\ws') })
  assert.ok(inSession(store, 'guard', 's4')!.reason.endsWith('；影子兜底：工作区变更记录'))
  await call({ name: 'Read', arguments: {}, agent: agentIn('s3'), parent: 'token' })
  assert.equal(view(store, 'guard').session('s3'), undefined) // transport sub-calls are not the row acting
  await call({ name: 'Read', arguments: {}, agent: agentIn('s5', 'C:\\ws', 'deepseek-account', 'deepseek-flash') })
  assert.deepEqual(inSession(store, 'guard', 's5'), { state: 'inactive', reason: '非 GLM 路由 deepseek-account/deepseek-flash，门禁不介入' })
  const bare = preExecuteRow(guardApply as never, { fs: memoryFs })
  await bare.call({ name: 'Read', arguments: {}, agent: agentIn('s1', 'C:\\ws') })
  assert.ok(inSession(bare.store, 'guard', 's1')!.reason.includes('；无项目目录，违规不落盘；'))
})

test('workflow: in effect with a project directory, inactive without one', async () => {
  const { store, call } = preExecuteRow(workflowApply as never, { fs: memoryFs }, { userHome: 'C:/u/glm-hourness', projectHome: 'C:/ws/.llm' })
  assert.equal(activation(store, 'workflow').state, 'active')
  await call({ name: 'Read', arguments: {}, agent: agentIn('s1') })
  assert.deepEqual(inSession(store, 'workflow', 's1'), { state: 'active', reason: '派遣决策记入 C:/ws/.llm' })
  const bare = preExecuteRow(workflowApply as never, { fs: memoryFs })
  await bare.call({ name: 'subagent', arguments: {}, agent: agentIn('s1') })
  assert.equal(inSession(bare.store, 'workflow', 's1')!.state, 'inactive')
})

test('memory: each model call reports the usage journal and the memory tools of its session', () => {
  const run = (config: Record<string, unknown>, data: unknown) => {
    const store = serviceStore()
    let listener: ((options: LlmStreamOptions, next: () => AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>) | undefined
    quietly(() => memoryApply({
      on: (_event, registered) => { listener = registered; return () => {} },
      tools: { register: () => () => {} },
      ...store,
      get: (name: string) => name === 'glmHournessData' ? data : store.get(name),
    }, { ...config, fs: memoryFs }))
    listener!({ provider: 'glm-zcode', model: 'glm-5.3', sessionId: 's1', messages: [] }, () => (async function* (): AsyncIterable<StreamChunk> {})())
    return { activation: activation(store, 'memory'), session: inSession(store, 'memory', 's1') }
  }
  const full = run({ home: 'C:/ws/.llm' }, { userHome: 'C:/u/glm-hourness' })
  assert.deepEqual(full.activation, { state: 'active', reason: '记忆工具已注册（C:/ws/.llm）' })
  assert.deepEqual(full.session, { state: 'active', reason: '用量记入 C:/u/glm-hourness；记忆工具可用' })
  assert.deepEqual(run({ home: 'C:/ws/.llm' }, undefined).session, { state: 'degraded', reason: '数据目录行未启用，用量不记录；记忆工具可用' })
  const noHome = run({}, { userHome: 'C:/u/glm-hourness' })
  assert.equal(noHome.activation.state, 'degraded')
  assert.deepEqual(noHome.session, { state: 'degraded', reason: '用量记入 C:/u/glm-hourness；home 未配置，记忆工具关闭' })
  assert.equal(run({}, undefined).session!.state, 'inactive')
})

test('hourness: an invocation reports which journals the report can read', async () => {
  const run = async (config: { home?: string }, data: unknown) => {
    const store = serviceStore()
    const commands: Command[] = []
    hournessApply({ commands: { register: definition => { commands.push(definition); return () => {} } }, ...store, get: (name: string) => name === 'glmHournessData' ? data : store.get(name) }, config)
    await commands[0]!.handler({ agent: agentIn('s1'), rawInput: '' })
    return inSession(store, 'hourness', 's1')
  }
  assert.deepEqual(await run({ home: 'C:/definitely-empty-hourness-home' }, { userHome: 'C:/definitely-empty-hourness-user' }), { state: 'active', reason: '报告读取项目目录与用户级目录' })
  assert.deepEqual(await run({ home: 'C:/definitely-empty-hourness-home' }, undefined), { state: 'degraded', reason: '用户级目录不可用，用量读不到' })
  assert.equal((await run({}, undefined))!.state, 'inactive')
})
