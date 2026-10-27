import assert from 'node:assert/strict'
import test from 'node:test'
import { renderFunctionsBlock, searchTools, type DeferredToolEntry } from '../src/toolsearch/search.ts'
import { apply, buildCatalog } from '../src/toolsearch/index.ts'
import type { AgentLike, PluginContext, ToolDefinitionLike } from '../src/shared/dsh-min.ts'

const catalog: DeferredToolEntry[] = [
  { name: 'web_search', description: 'Search the web for current information', parameters: { type: 'object' } },
  { name: 'web_fetch', description: 'Fetch one HTTP(S) URL', parameters: { type: 'object' } },
  { name: 'spawn_teammate', description: 'Create a durable teammate', parameters: { type: 'object' } },
]

test('select: picks exact names and ignores unknown ones', () => {
  const outcome = searchTools(catalog, { query: 'select:web_search,missing' })
  assert.deepEqual(outcome.matches.map(match => match.name), ['web_search'])
  assert.equal(outcome.total, 3)
})

test('keyword search ranks name hits over description hits and caps results', () => {
  const outcome = searchTools(catalog, { query: 'web search' })
  assert.equal(outcome.matches[0]!.name, 'web_search')
  const capped = searchTools(catalog, { query: 'web' })
  assert.deepEqual(capped.matches.map(match => match.name), ['web_search', 'web_fetch'])
  assert.equal(searchTools(catalog, { query: 'nothing-matches' }).matches.length, 0)
})

test('functions block renders one verbatim line per match', () => {
  const block = renderFunctionsBlock([catalog[0]!])
  assert.equal(block.split('\n')[0], '<functions>')
  assert.ok(block.includes('<function>{"description":"Search the web for current information","name":"web_search","parameters":{"type":"object"}}</function>'))
  assert.equal(block.split('\n').at(-1), '</functions>')
})

function fakeAgent(natives: Record<string, ToolDefinitionLike>): { agent: AgentLike; state: ReturnType<typeof track> } {
  const track = () => ({
    sections: [] as string[],
    registered: [] as ToolDefinitionLike[],
    restricted: [] as Array<{ deny?: string[] }>,
  })
  const t = track()
  const ctx: PluginContext = {
    systemPrompt: { section: spec => { t.sections.push(spec.name); return () => {} } },
    tools: {
      register: def => { t.registered.push(def); return () => {} },
      restrict: filter => { t.restricted.push(filter); return () => {} },
      schemas: () => Object.keys(natives).map(name => ({ name })),
      get: name => natives[name],
    },
    on: () => () => {},
  }
  const native = (name: string): ToolDefinitionLike => ({ name, description: `native ${name}`, parameters: { type: 'object' }, output: { schema: {}, render: () => [{ type: 'text', text: 'ok' }] }, execute: async args => ({ echoed: name, args }) })
  const agent: AgentLike = {
    id: 'a1',
    ctx,
    model: { current: () => ({ provider: 'glm' }) },
  }
  return { agent, state: t }
}

test('buildCatalog defers every non-resident native', () => {
  const { agent } = fakeAgent({
    read: {} as ToolDefinitionLike,
    pwsh: {} as ToolDefinitionLike,
    todo_write: {} as ToolDefinitionLike,
    web_search: {} as ToolDefinitionLike,
  })
  const { catalog: built } = buildCatalog(agent)
  assert.deepEqual(built.map(entry => entry.name), ['web_search'])
})

test('ToolSearch execution activates matches and renders the block', async () => {
  const listeners: Array<(payload: { agent: AgentLike }) => unknown> = []
  const registrations: ToolDefinitionLike[] = []
  const nativeWeb: ToolDefinitionLike = {
    name: 'web_search',
    description: 'Search the web for current information',
    parameters: { type: 'object' },
    output: { schema: {}, render: () => [{ type: 'text', text: 'ok' }] },
    execute: async args => ({ ran: true, args }),
  }
  const ctx = {
    systemPrompt: { section: () => () => {} },
    tools: {
      register: (def: ToolDefinitionLike) => { registrations.push(def); return () => {} },
      restrict: () => () => {},
      schemas: () => [{ name: 'web_search' }],
      get: (name: string) => name === 'web_search' ? nativeWeb : undefined,
    },
    on: (event: string, listener: unknown) => {
      if (event === 'agent/created') listeners.push(listener as typeof listeners[number])
      return () => {}
    },
  } as unknown as PluginContext
  const agent: AgentLike = { id: 'a1', ctx, model: { current: () => ({ provider: 'glm' }) } }
  apply(ctx)
  await listeners[0]!({ agent })

  const toolSearch = registrations.find(def => def.name === 'ToolSearch')!
  assert.ok(toolSearch !== undefined)
  const result = await toolSearch.execute({ query: 'select:web_search', max_results: 5 }, { agent }) as { matches: string[], block: string }
  assert.deepEqual(result.matches, ['web_search'])
  assert.ok(result.block.includes('<function>'))
  // activation registered a scoped same-name wrapper with deferLoading
  const wrapper = registrations.find(def => def.name === 'web_search')!
  assert.equal(wrapper.deferLoading, true)
  const delegated = await wrapper.execute({ q: 1 }, undefined) as { ran: boolean }
  assert.equal(delegated.ran, true)
  const rendered = toolSearch.output.render(undefined, result)
  assert.ok(rendered[0]!.text!.startsWith('<functions>'))
})
