import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluate, fileToolsOnly, renderCorrection, workspaceContainment } from '../src/guard/rules.ts'
import { apply as glmPromptApply, dialectSections, initDialectScope } from '../src/glm-prompt/index.ts'
import type { AgentLike, PluginContext, PreStepPayload, ToolDefinitionLike } from '../src/shared/dsh-min.ts'

const rule = workspaceContainment(['C:\\ws\\proj'])
const write = (path: string) => ({ name: 'Write', arguments: { file_path: path } })

test('containment allows writes inside the workspace (case and separator insensitive)', () => {
  assert.equal(evaluate([rule], write('C:\\WS\\PROJ\\src\\a.ts')).kind, 'allow')
  assert.equal(evaluate([rule], write('C:/ws/proj/.llm/memory/a.md')).kind, 'allow')
})

test('containment denies writes outside the workspace with a four-part correction', () => {
  const verdict = evaluate([rule], write('C:\\Windows\\system32\\evil.dll'))
  assert.equal(verdict.kind, 'deny')
  if (verdict.kind === 'deny') {
    assert.ok(verdict.correction.fact.includes('evil.dll'))
    assert.ok(verdict.correction.rightPath.includes('.llm'))
    assert.ok(verdict.correction.exception.includes('reversibility'))
    const text = renderCorrection(verdict.correction)
    assert.ok(text.startsWith('You tried to write'))
    assert.match(text, /Boundary: /)
    assert.match(text, /Right path: /)
    assert.match(text, /Exception: /)
  }
})

test('containment ignores sibling prefixes like proj-evil', () => {
  assert.equal(evaluate([rule], write('C:\\ws\\proj-evil\\a.ts')).kind, 'deny')
})

const bash = (command: string) => ({ name: 'Bash', arguments: { command } })

test('file-tools-only denies shell write patterns inside the workspace too', () => {
  for (const command of ['sed -i s/a/b/ f.txt', 'Set-Content f.txt hi', 'echo x > out.txt', 'ls >> log.txt']) {
    assert.equal(evaluate([fileToolsOnly], bash(command)).kind, 'deny', command)
  }
})

test('file-tools-only allows execution-style shell commands', () => {
  for (const command of ['npm test', 'git status', 'ls -la', 'node server.js &']) {
    assert.equal(evaluate([fileToolsOnly], bash(command)).kind, 'allow', command)
  }
})

test('a throwing detector fails open', () => {
  const broken = { id: 'broken', declare: '', detect(): never { throw new Error('boom') } }
  assert.equal(evaluate([broken, rule], write('C:\\Windows\\x')).kind, 'deny')
})

function fakeAgent(): { agent: AgentLike, sections: Array<{ name: string, order: number, text: string }>, tools: Array<{ def: ToolDefinitionLike, when?: unknown }>, restricted: Array<{ allow?: string[], deny?: string[] }>, listeners: Record<string, { listener: (...args: never[]) => Promise<unknown>, options?: { prepend?: boolean } }>, registrations: Record<string, number> } {
  const state = { sections: [] as Array<{ name: string, order: number, text: string }>, tools: [] as Array<{ def: ToolDefinitionLike, when?: unknown }>, restricted: [] as Array<{ allow?: string[], deny?: string[] }>, listeners: {} as Record<string, { listener: (...args: never[]) => Promise<unknown>, options?: { prepend?: boolean } }>, registrations: {} as Record<string, number> }
  const ctx: PluginContext = {
    systemPrompt: {
      section: spec => { state.sections.push(spec); return () => {} },
      context: spec => { state.sections.push(spec as { name: string, order: number, text: string }); return () => {} },
    },
    tools: {
      register: (def, options) => { state.tools.push({ def, options }); return () => {} },
      restrict: filter => { state.restricted.push(filter); return () => {} },
      schemas: () => [],
      executable: () => undefined,
    },
    on: ((event: string, listener: (...args: never[]) => Promise<unknown>, options?: { prepend?: boolean }) => {
      state.listeners[event] = { listener, options }
      state.registrations[event] = (state.registrations[event] ?? 0) + 1
      return () => {}
    }) as PluginContext['on'],
  }
  return { agent: { id: 'a1', ctx }, ...state }
}

/** Run the registered assemble rewrite over one minimal assembly. */
async function runRewrite(f: ReturnType<typeof fakeAgent>, variables: Record<string, unknown>): Promise<{ sections: Array<{ name: string, text: string }> }> {
  const registered = f.listeners['system-prompt/assemble']
  assert.ok(registered, 'assemble listener registered')
  const assembly = { sections: [{ name: 'harness:identity', text: 'You are an AI agent powered by DeepSeek Harness.' }], contexts: [], tools: [], variables }
  const rewritten = await registered.listener(assembly as never, undefined, async () => assembly) as typeof assembly
  return rewritten
}

test('initDialectScope registers a prepend assemble rewrite that resolves per model route', async () => {
  const f = fakeAgent()
  const alias = { name: 'TodoWrite', description: 'd', parameters: {}, output: { schema: {}, render: () => [{ type: 'text', text: '' }] }, execute: async () => ({}) }
  initDialectScope(f.agent, [alias])
  assert.deepEqual(f.listeners['system-prompt/assemble']!.options, { prepend: true })
  // glm route: identity replaced with the ZCode mirror, CLI prefix prepended.
  const glm = await runRewrite(f, { provider: 'glm', model: 'glm-5.3' })
  assert.equal(glm.sections[0]!.name, 'glm:cli-prefix')
  assert.equal(glm.sections[1]!.name, 'harness:identity')
  assert.ok(glm.sections[1]!.text.includes('ZCode'))
  assert.ok(!glm.sections[1]!.text.includes('DeepSeek Harness.'))
  // Other routes pass through untouched.
  const other = await runRewrite(f, { provider: 'deepseek', model: 'deepseek-flash' })
  assert.equal(other.sections.length, 1)
  assert.ok(other.sections[0]!.text.includes('DeepSeek Harness.'))
  // Model-only signal (provider omitted) still lights the dialect.
  const modelOnly = await runRewrite(f, { model: 'glm-5.3-flash' })
  assert.ok(modelOnly.sections[0]!.name === 'glm:cli-prefix')
})

test('dialect sections mirror order anchors and carry verbatim content', () => {
  const sections = dialectSections()
  assert.deepEqual(sections.map(section => section.name), [
    'glm:cli-prefix',
    'harness:identity',
    'glm:persona',
    'glm:session-guidance', // ledger ②⑤: coding-plan guidance
    'glm:memory', // ledger ⑧: memory home is .llm
    'glm:context-management', // ledger ⑦
    'glm:deferred-tools',
  ])
  assert.equal(sections[1]!.order, -1000)
  assert.ok(sections[1]!.text.includes('reverse-engineering')) // coding-plan default carries the user notice
  assert.ok(sections[1]!.text.includes('DeepSeek Harness Web GUI')) // ledger ①: host-fact rewrite
  assert.ok(sections.at(-1)!.text.includes('Some tools are deferred'))
})

test('start-plan tier keeps the byte-identical official mirror', () => {
  const sections = dialectSections(false, 'balanced', { tier: 'start-plan' })
  assert.deepEqual(sections.map(section => section.name), ['glm:cli-prefix', 'harness:identity', 'glm:persona', 'glm:deferred-tools'])
  assert.ok(sections[1]!.text.includes('IMPORTANT: Assist with authorized security testing'))
  assert.ok(sections[1]!.text.includes('in a terminal')) // verbatim harness line, not the DSH rewrite
})

test('environment section joins only when host facts are provided', () => {
  const withEnv = dialectSections(false, 'balanced', { env: { cwd: 'C:\\ws', platform: 'win32', shell: 'pwsh', osVersion: '10.0', isGitRepository: true } })
  const env = withEnv.find(section => section.name === 'glm:environment')
  assert.ok(env!.text.includes('- Primary working directory: C:\\ws'))
  assert.ok(env!.text.includes('- Is a git repository: yes'))
  assert.equal(dialectSections().some(section => section.name === 'glm:environment'), false)
})

test('skills note appends to session guidance when skills exist', () => {
  const withSkills = dialectSections(false, 'balanced', { skills: true })
  const guidance = withSkills.find(section => section.name === 'glm:session-guidance')!
  assert.ok(guidance.text.includes('skill loader'))
  assert.ok(guidance.text.includes('only use skills it lists'))
})

test('initDialectScope shadows identity, mounts aliases on glm routes, and hides natives', async () => {
  const f = fakeAgent()
  const alias = { name: 'TodoWrite', description: 'd', parameters: {}, output: { schema: {}, render: () => [{ type: 'text', text: '' }] }, execute: async () => ({}) }
  const scope = initDialectScope(f.agent, [alias]) // default: assembly rewrite + tool face
  const glm = await runRewrite(f, { provider: 'glm' })
  assert.equal(glm.sections[1]!.name, 'harness:identity') // shadowed by rewrite, not stacked
  assert.deepEqual(f.restricted, []) // restriction follows the route, not construction
  assert.equal(f.tools.length, 0) // aliases mount only on a glm route
  scope.syncRoute(true)
  assert.deepEqual(f.restricted, [{ deny: ['read', 'write', 'edit', 'glob', 'grep', 'pwsh', 'todo_write'] }])
  assert.equal(f.tools.length, 1)
  assert.equal(f.tools[0]!.def.name, 'TodoWrite')
  scope.syncRoute(false) // switched away: aliases unmount, the deny lifts
  assert.equal(f.restricted.length, 1)
  assert.equal(f.tools.length, 1)
  scope.syncRoute(true) // back on glm: remounted and re-restricted
  assert.equal(f.restricted.length, 2)
  assert.equal(f.tools.length, 2)
})

test('apply lifts and re-applies the restriction as the route switches mid-session', async () => {
  const listeners: Record<string, (payload: unknown, next: () => Promise<void>) => unknown> = {}
  const ctx: PluginContext = {
    systemPrompt: { section: () => () => {} },
    tools: { register: () => () => {}, restrict: () => () => {}, schemas: () => [], executable: () => undefined },
    on: (event, listener) => {
      listeners[event] = listener as typeof listeners[string]
      return () => {}
    },
  }
  glmPromptApply(ctx)
  const f = fakeAgent()
  let provider: string | undefined
  ;(f.agent as { model?: unknown }).model = { current: () => ({ provider }) }
  const step = (nextProvider: string | undefined) => {
    provider = nextProvider
    return listeners['agent/pre-step']!({ agent: f.agent, modelSelection: { provider: nextProvider } }, async () => {}) as Promise<void>
  }
  await step('glm')
  assert.equal(f.restricted.length, 1)
  await step('deepseek')
  assert.equal(f.restricted.length, 1) // switched away: no re-restriction, the deny is lifted
  await step('deepseek')
  assert.equal(f.restricted.length, 1)
  await step('glm')
  assert.equal(f.restricted.length, 2) // back on glm: the native deny re-applies
})

test('apply initializes a glm agent exactly once at creation and passes others through', async () => {
  const listeners: Record<string, (payload: unknown) => unknown> = {}
  const ctx: PluginContext = {
    systemPrompt: { section: () => () => {} },
    tools: { register: () => () => {}, restrict: () => () => {}, schemas: () => [], executable: () => undefined },
    on: (event, listener) => {
      listeners[event] = listener as typeof listeners[string]
      return () => {}
    },
  }
  glmPromptApply(ctx)
  const f = fakeAgent()
  let provider: string | undefined
  ;(f.agent as { model?: unknown }).model = { current: () => ({ provider }) }
  const create = (nextProvider?: string) => {
    provider = nextProvider
    return listeners['agent/created']!({ agent: f.agent }) as Promise<void> | undefined
  }
  await create('glm'); await create('glm'); await create('deepseek')
  assert.equal(f.registrations['system-prompt/assemble'], 1) // one rewrite registration despite repeated creations
})

test('apply retries initialization at pre-step when creation ran before the model was bound', async () => {
  const listeners: Record<string, (payload: unknown, next: () => Promise<void>) => unknown> = {}
  const ctx: PluginContext = {
    systemPrompt: { section: () => () => {}, context: () => () => {} },
    tools: { register: () => () => {}, restrict: () => () => {}, schemas: () => [], executable: () => undefined },
    on: (event, listener) => {
      listeners[event] = listener as typeof listeners[string]
      return () => {}
    },
  }
  glmPromptApply(ctx)
  const f = fakeAgent()
  // The scoped retry registers on the agent's own context at creation.
  const scopedListeners: Array<(payload: unknown, next: () => Promise<void>) => Promise<void>> = []
  const origAgentOn = f.agent.ctx.on.bind(f.agent.ctx)
  f.agent.ctx.on = ((event: string, listener: unknown) => {
    if (event === 'agent/pre-step') scopedListeners.push(listener as typeof scopedListeners[number])
    return origAgentOn(event, listener as never)
  }) as typeof f.agent.ctx.on
  let provider: string | undefined
  ;(f.agent as { model?: unknown }).model = { current: () => ({ provider }) }

  // Creation with no model bound yet: the assemble rewrite lands unconditionally.
  provider = undefined
  await listeners['agent/created']!({ agent: f.agent }) as Promise<void>
  assert.equal(f.registrations['system-prompt/assemble'], 1) // rewrite registered at creation
  assert.equal(scopedListeners.length, 1)

  // First scoped pre-step carries the resolved glm route: tool face lands.
  let delegated = false
  await scopedListeners[0]!({ modelSelection: { provider: 'glm', model: 'glm-5.3' } }, async () => { delegated = true })
  assert.equal(delegated, true)
  assert.equal(f.restricted.length, 1) // natives hidden once glm is confirmed
  assert.equal(f.tools.length, 0) // no natives captured in this fake, so no aliases

  // Later pre-steps (scoped or global) do not re-initialize.
  await scopedListeners[0]!({ modelSelection: { provider: 'glm' } }, async () => {})
  await listeners['agent/pre-step']!({ agent: f.agent, modelSelection: { provider: 'glm' } }, async () => {})
  assert.equal(f.restricted.length, 1)
})
