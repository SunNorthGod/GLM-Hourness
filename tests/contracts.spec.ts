import assert from 'node:assert/strict'
import test from 'node:test'
import { aliasSpecs } from '../src/glm-prompt/aliases.ts'
import { apply as glmPromptApply, dialectServiceFor } from '../src/glm-prompt/index.ts'
import { READ_IMAGE_NATIVE, READ_NAME, READ_NATIVE } from '../src/glm-prompt/read-alias.ts'
import { TODO_NATIVE, TODO_WRITE_NAME } from '../src/glm-prompt/todo-reminder.ts'
import { graphTools } from '../src/graph/tools.ts'
import { apply as guardApply } from '../src/guard/index.ts'
import { memoryTools, storeIo } from '../src/memory/tools.ts'
import { DIALECT_SERVICE, dialectNames, dialectService, toNativeTool, ZCODE_ALIAS_NATIVES, type DialectService } from '../src/shared/dialect.ts'
import type { AgentLike, ToolFinalResult } from '../src/shared/dsh-min.ts'
import { GRAPH_TOOL_NAMES, MEMORY_TOOL_NAMES, ORCHESTRATION_RESIDENT_TOOLS } from '../src/shared/tool-names.ts'
import { RESIDENT_TOOLS } from '../src/toolsearch/exposure.ts'
import { fakeRuntime, serviceStore, type FakeRuntime } from './fake-rc3.ts'

// Contracts between the GLM channel package and the orchestration package
// (docs/DESIGN.md §8): strings and service shapes no import rule sees.

const GLM = { provider: 'glm-zcode', model: 'glm-5.3' }

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
