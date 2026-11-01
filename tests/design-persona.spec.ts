/**
 * The person's persona for the main agent (docs/ORCHESTRATION.md §3.1; task
 * m3-main-persona, addendum §2.7): the design row's `persona` setting becomes
 * one system prompt section, for the main agent only; the dialect of the GLM
 * package places it and gives the identity the opening sentence of an active
 * output style. The host is the one in design-host.ts; the dialect is the real
 * installDialect on the same agent, installed before and after the design row.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { apply, Config, MAIN_AGENT_ACTIVE, type DesignConfig } from '../src/design/index.ts'
import { MAIN_AGENT_SECTION } from '../src/design/identity.ts'
import { DEFAULT_PERSONA_NAME, PERSONA_NAME_LIMIT, PERSONA_SCOPE, PERSONA_TEXT_LIMIT, PERSONA_TOO_LONG, readPersona } from '../src/design/persona.ts'
import { buildIdentitySection } from '../src/glm-prompt/identity.ts'
import { installDialect, type GlmPromptConfig } from '../src/glm-prompt/index.ts'
import { IDENTITY_OPENING_PLAIN, IDENTITY_OPENING_WITH_STYLE } from '../src/glm-prompt/verbatim.ts'
import type { AssemblePayload, AssembledTool } from '../src/shared/dsh-min.ts'
import { healthServiceName, type RowHealthView } from '../src/shared/health.ts'
import { OUTPUT_STYLE_SECTION } from '../src/shared/output-style.ts'
import { MEMORY_TOOL_NAMES } from '../src/shared/tool-names.ts'
import { designHost, type DesignHost, type FakeAgent } from './design-host.ts'
import { captureWarnings } from './graph-helpers.ts'

// The pinned words of the section; the constants of persona.ts are compared against them, not the other way round.
const SCOPE = 'This style applies to your replies to the human only. Text you put into tool calls (graph nodes, briefs for subagents) and anything written to files stays plain.'
const PERSONA = { name: 'PM', text: 'End every reply to the human with 「（PM-MARK）」.' }
const GLM = { provider: 'glm-zcode', model: 'glm-5.3' }
const OTHER = { provider: 'deepseek-official', model: 'deepseek-flash' }
const DSH_SECTIONS = [{ name: 'harness:identity', text: 'dsh identity' }, { name: 'tool:read', text: 'read guidance' }]

test('the contract: the section name, the scope sentence and the limits are the ones the addendum names', () => {
  assert.equal(OUTPUT_STYLE_SECTION, 'hourness:output-style')
  assert.equal(PERSONA_SCOPE, SCOPE)
  assert.equal(DEFAULT_PERSONA_NAME, '主 Agent')
  assert.equal(PERSONA_NAME_LIMIT, 40)
  assert.equal(PERSONA_TEXT_LIMIT, 4000)
  assert.equal(PERSONA_TOO_LONG, '人设超过 4000 字符，没有加')
})

function open(config: DesignConfig, options: Parameters<typeof designHost>[0] = {}): DesignHost {
  const host = designHost(options)
  apply(host.ctx, config)
  return host
}

/** Type a /wish line as the person and require it to succeed. */
async function wish(host: DesignHost, agent: FakeAgent, line = '/wish'): Promise<void> {
  const run = await host.execute(agent, line)
  assert.ok(run !== undefined, `${line} is registered`)
  assert.equal(run.result.kind, 'success', run.result.text)
}

const styleOf = (assembled: AssemblePayload): { readonly name: string, readonly text: string, readonly interpolate?: boolean } | undefined => assembled.sections.find(section => section.name === OUTPUT_STYLE_SECTION)
const namesOf = (assembled: AssemblePayload): string[] => assembled.sections.map(section => section.name)
const health = (host: DesignHost): RowHealthView => host.services.get(healthServiceName('design')) as RowHealthView

/** A main agent with a persona configured, assembled once. */
async function assembledAsMain(config: DesignConfig): Promise<AssemblePayload> {
  const host = open(config)
  const agent = host.addAgent('s1')
  await wish(host, agent)
  return agent.assemble()
}

// ---------------------------------------------------------------- the section

test('the main agent gets the persona as one section: the heading ZCode gives an output style, the person\'s text without its surrounding whitespace, a blank line, the scope sentence; interpolation is off', async () => {
  const section = styleOf(await assembledAsMain({ persona: { name: 'PM', text: '\n  Speak briefly.\n\nAlways call me boss.  \n' } }))
  // No blank line between the heading and the text (ZCode's n8o); the person's own blank line stays.
  assert.deepEqual(section, { name: 'hourness:output-style', text: `# Output Style: PM\nSpeak briefly.\n\nAlways call me boss.\n\n${SCOPE}`, interpolate: false })
})

test('the section is the only addition: the identity section of the main agent stays, after it', async () => {
  const assembled = await assembledAsMain({ persona: PERSONA })
  assert.deepEqual(namesOf(assembled), ['harness:identity', OUTPUT_STYLE_SECTION, MAIN_AGENT_SECTION])
})

test('no text, a text of whitespace only, no persona at all and no config add nothing', async () => {
  for (const config of [{ persona: { name: 'PM', text: '' } }, { persona: { name: 'PM', text: ' \n\t ' } }, { persona: { name: 'PM' } }, { persona: {} }, {}] as const) {
    assert.equal(styleOf(await assembledAsMain(config)), undefined, JSON.stringify(config))
  }
  const host = designHost()
  apply(host.ctx)
  const agent = host.addAgent('s1')
  await wish(host, agent)
  assert.equal(styleOf(await agent.assemble()), undefined, 'the row applied without a config')
})

test('only the main agent: an ordinary session, a subagent of the main agent, the session that lost the role, and the same session after /wish off have no section', async () => {
  const host = open({ persona: PERSONA })
  const first = host.addAgent('s1')
  const second = host.addAgent('s2')
  const child = host.addAgent('child', { origin: 'subagent', parentSession: 's1' })
  for (const agent of [first, second, child]) await host.created(agent)
  for (const agent of [first, second, child]) assert.equal(styleOf(await agent.assemble()), undefined, `${agent.id} before any /wish`)
  await wish(host, first)
  assert.notEqual(styleOf(await first.assemble()), undefined)
  assert.equal(styleOf(await second.assemble()), undefined, 'a second session of the same project')
  assert.equal(styleOf(await child.assemble()), undefined, 'the delegated child of the main agent')
  assert.deepEqual(namesOf(await child.assemble()), ['harness:identity'])
  // The role moves: the row ran /wish off for the first session, which is an ordinary session again.
  await wish(host, second, '/wish here')
  assert.equal(styleOf(await first.assemble()), undefined, 'the session that lost the role')
  assert.notEqual(styleOf(await second.assemble()), undefined, 'the session that took it')
  await wish(host, second, '/wish off')
  assert.equal(styleOf(await second.assemble()), undefined, 'the step after /wish off')
})

// ---------------------------------------------------------------- limits, name, health

test('a text of exactly 4,000 code points is added, 4,001 is not and the row says so; the count is in code points, not UTF-16 units', async () => {
  const full = '😀'.repeat(PERSONA_TEXT_LIMIT)
  assert.equal(styleOf(await assembledAsMain({ persona: { text: full } }))?.text, `# Output Style: 主 Agent\n${full}\n\n${SCOPE}`)
  const { result, warnings } = await captureWarnings(async () => {
    const host = open({ persona: { name: 'PM', text: '😀'.repeat(PERSONA_TEXT_LIMIT + 1) } })
    const agent = host.addAgent('s1')
    await wish(host, agent)
    await agent.assemble()
    return { host, agent }
  })
  assert.equal(warnings.length, 1, warnings.join(' | '))
  assert.match(warnings[0], /persona\.text is longer than 4000 characters/)
  assert.equal(styleOf(await result.agent.assemble()), undefined)
  assert.equal(health(result.host).activation().state, 'degraded')
  assert.match(health(result.host).activation().reason, /人设超过 4000 字符，没有加/)
  // The main agent's own report is degraded too, instead of "in effect".
  const report = health(result.host).session(result.agent.id)
  assert.equal(report?.state, 'degraded')
  assert.match(report?.reason ?? '', /人设超过 4000 字符，没有加/)
})

test('the length is measured on the text without its surrounding whitespace', async () => {
  const padded = `   ${'a'.repeat(PERSONA_TEXT_LIMIT)}\n\n  `
  assert.equal(styleOf(await assembledAsMain({ persona: { text: padded } }))?.text.startsWith(`# Output Style: 主 Agent\n${'a'.repeat(PERSONA_TEXT_LIMIT)}\n\n`), true)
})

test('the name: whitespace runs and line breaks become one space, a name over 40 code points is cut and warned once, a name of nothing is the default', async () => {
  const nameOf = async (name: string | undefined): Promise<{ readonly heading: string, readonly warnings: string[] }> => {
    const { result, warnings } = await captureWarnings(async () => {
      const host = open({ persona: { ...name === undefined ? {} : { name }, text: 'x' } })
      const agent = host.addAgent('s1')
      await wish(host, agent)
      await agent.assemble()
      return (await agent.assemble()).sections.find(section => section.name === OUTPUT_STYLE_SECTION)!.text.split('\n')[0]
    })
    return { heading: result, warnings }
  }
  assert.deepEqual(await nameOf('  PM \n\n  assistant\t\tone  '), { heading: '# Output Style: PM assistant one', warnings: [] })
  assert.deepEqual(await nameOf('a'.repeat(40)), { heading: `# Output Style: ${'a'.repeat(40)}`, warnings: [] })
  const cut = await nameOf('a'.repeat(41))
  assert.equal(cut.heading, `# Output Style: ${'a'.repeat(40)}`)
  assert.equal(cut.warnings.length, 1, 'warned once, although the session assembled twice')
  assert.match(cut.warnings[0], /persona\.name is longer than 40 characters/)
  assert.equal((await nameOf('😀'.repeat(41))).heading, `# Output Style: ${'😀'.repeat(40)}`, 'cut at 40 code points')
  for (const empty of ['', '   ', '\n\t', undefined]) assert.deepEqual(await nameOf(empty), { heading: '# Output Style: 主 Agent', warnings: [] }, JSON.stringify(empty))
})

test('a persona that is fine leaves the main agent\'s health as it was', async () => {
  const host = open({ persona: PERSONA })
  const agent = host.addAgent('s1')
  await wish(host, agent)
  await agent.assemble()
  assert.deepEqual(health(host).session(agent.id)?.reason, MAIN_AGENT_ACTIVE)
  assert.equal(health(host).session(agent.id)?.state, 'active')
  assert.equal(health(host).activation().state, 'active')
})

test('a setting that cannot be read adds no persona, warns once and degrades the row; activation does not throw', async () => {
  for (const [config, warning, note] of [
    [{ persona: 'be nice' }, /persona is not an object/, /不是 \{name, text\} 的形状/],
    [{ persona: { text: 5 } }, /persona\.text is not a string/, /text 不是文字/],
  ] as const) {
    const { result, warnings } = await captureWarnings(() => {
      const host = designHost()
      apply(host.ctx, config as unknown as DesignConfig)
      return host
    })
    assert.equal(warnings.length, 1, warnings.join(' | '))
    assert.match(warnings[0], warning)
    assert.equal(health(result).activation().state, 'degraded')
    assert.match(health(result).activation().reason, note)
    const agent = result.addAgent('s1')
    await wish(result, agent)
    assert.equal(styleOf(await agent.assemble()), undefined)
  }
  assert.deepEqual(readPersona({ persona: { name: 7, text: 'x' } }).warnings, [`persona.name is not a string; the name ${DEFAULT_PERSONA_NAME} is used`])
  assert.equal(readPersona({ persona: { name: 7, text: 'x' } }).section?.text, `# Output Style: 主 Agent\nx\n\n${SCOPE}`)
})

// ---------------------------------------------------------------- the schema

test('the Config schema fills the defaults the addendum names: name 「主 Agent」, empty text; the text is a multi-line box', () => {
  assert.deepEqual(Config({}), { persona: { name: '主 Agent', text: '' } })
  assert.deepEqual(Config({ persona: { text: 'x' } }), { persona: { name: '主 Agent', text: 'x' } })
  assert.deepEqual(Config({ persona: PERSONA }), { persona: PERSONA })
  assert.throws(() => Config({ persona: { text: 5 } }))
  const persona = Config.dict?.persona
  assert.equal(persona?.dict?.text?.meta.role, 'textarea')
  assert.equal(persona?.dict?.name?.meta.role, undefined)
  for (const schema of [persona, persona?.dict?.name, persona?.dict?.text]) assert.equal(typeof schema?.meta.description, 'string')
})

test('a config the loader normalized through Config goes to apply as it is', async () => {
  const host = designHost()
  apply(host.ctx, Config({ persona: PERSONA }))
  const agent = host.addAgent('s1')
  await wish(host, agent)
  assert.equal(styleOf(await agent.assemble())?.text, `# Output Style: PM\n${PERSONA.text}\n\n${SCOPE}`)
  const empty = designHost()
  apply(empty.ctx, Config({}))
  const other = empty.addAgent('s1')
  await wish(empty, other)
  assert.equal(styleOf(await other.assemble()), undefined)
})

// ---------------------------------------------------------------- with the dialect of the GLM package

/** The real dialect on the fake agent: it has no natives, so no alias is registered, and no tool search. */
function withDialect(agent: FakeAgent, config: GlmPromptConfig = {}): () => void {
  Object.assign(agent.ctx, { tools: { get: () => undefined, register: () => () => undefined } })
  return installDialect(agent, { toolSearchMode: 'off', ...config })
}

type Order = 'dialect first' | 'design first'

/** The guard row's declaration listener (src/guard/index.ts): prepended, it appends `glm:guard` last. */
function withGuard(agent: FakeAgent): void {
  type Listener = (assembly: unknown, context: unknown, next: () => Promise<AssemblePayload>) => Promise<AssemblePayload>
  const append: Listener = async (_assembly, _context, next) => {
    const out = await next()
    return { ...out, sections: [...out.sections, { name: 'glm:guard', text: 'rules' }] }
  }
  ;(agent.ctx as unknown as { on(event: string, listener: Listener, options: { prepend: boolean }): void }).on('system-prompt/assemble', append, { prepend: true })
}

/**
 * A main agent (or an ordinary session) with the dialect installed before or
 * after the design row's hooks, and the guard's listener, when asked for,
 * before or after both.
 */
async function session(order: Order, persona: DesignConfig, options: { readonly main?: boolean, readonly dialect?: GlmPromptConfig, readonly guard?: 'before' | 'after' } = {}): Promise<FakeAgent> {
  const host = open(persona)
  const agent = host.addAgent('s1')
  if (options.guard === 'before') withGuard(agent)
  if (order === 'dialect first') withDialect(agent, options.dialect)
  if (options.main !== false) await wish(host, agent)
  else await host.created(agent)
  if (order === 'design first') withDialect(agent, options.dialect)
  if (options.guard === 'after') withGuard(agent)
  return agent
}

const identityOf = (assembled: AssemblePayload): string => assembled.sections.find(section => section.name === 'harness:identity')!.text
const WITH_PERSONA = ['glm:cli-prefix', 'harness:identity', 'glm:dynamic-behavior', 'glm:reporting-depth', 'glm:session-guidance', OUTPUT_STYLE_SECTION, 'glm:context-management', 'tool:read', MAIN_AGENT_SECTION]
const WITHOUT_PERSONA = WITH_PERSONA.filter(name => name !== OUTPUT_STYLE_SECTION)
const memoryTools: AssembledTool[] = MEMORY_TOOL_NAMES.map(name => ({ name, description: name, parameters: { type: 'object', properties: {} } }))

for (const order of ['dialect first', 'design first'] as const) {
  test(`GLM route (${order}): the identity opens with the sentence of an active output style and the persona sits in front of the context management section`, async () => {
    const agent = await session(order, { persona: PERSONA })
    const assembled = await agent.assemble({ sections: DSH_SECTIONS, variables: GLM })
    assert.deepEqual(namesOf(assembled), WITH_PERSONA)
    assert.equal(identityOf(assembled), buildIdentitySection(true, 'user', 'dsh'))
    assert.ok(identityOf(assembled).startsWith(IDENTITY_OPENING_WITH_STYLE))
    assert.deepEqual(styleOf(assembled), { name: 'hourness:output-style', text: `# Output Style: PM\n${PERSONA.text}\n\n${SCOPE}`, interpolate: false })
  })

  test(`GLM route (${order}): without a persona the assembly is the dialect's own, with the plain opening, for the main agent and for an ordinary session`, async () => {
    for (const [label, agent] of [['main agent, empty persona', await session(order, { persona: { name: 'PM', text: '' } })], ['ordinary session, persona set', await session(order, { persona: PERSONA }, { main: false })]] as const) {
      const assembled = await agent.assemble({ sections: DSH_SECTIONS, variables: GLM })
      assert.deepEqual(namesOf(assembled), label.startsWith('main') ? WITHOUT_PERSONA : WITHOUT_PERSONA.filter(name => name !== MAIN_AGENT_SECTION), label)
      assert.equal(identityOf(assembled), buildIdentitySection(false, 'user', 'dsh'), label)
      assert.ok(identityOf(assembled).startsWith(IDENTITY_OPENING_PLAIN), label)
      assert.equal(JSON.stringify(assembled).includes('Output Style'), false, label)
    }
  })

  test(`GLM route (${order}): with the memory tools the persona follows the memory section; the start-plan tier, which has no context management section, puts it after the last dialect section`, async () => {
    const memory = await (await session(order, { persona: PERSONA })).assemble({ sections: DSH_SECTIONS, variables: GLM, tools: memoryTools })
    assert.deepEqual(namesOf(memory), ['glm:cli-prefix', 'harness:identity', 'glm:dynamic-behavior', 'glm:reporting-depth', 'glm:session-guidance', 'glm:memory', OUTPUT_STYLE_SECTION, 'glm:context-management', 'tool:read', MAIN_AGENT_SECTION])
    const start = await (await session(order, { persona: PERSONA }, { dialect: { tier: 'start-plan' } })).assemble({ sections: DSH_SECTIONS, variables: GLM })
    assert.deepEqual(namesOf(start), ['glm:cli-prefix', 'harness:identity', 'glm:reporting-depth', OUTPUT_STYLE_SECTION, 'tool:read', MAIN_AGENT_SECTION])
    assert.equal(identityOf(start), buildIdentitySection(true, 'official', 'verbatim'))
  })

  test(`GLM route (${order}): a persona with interpolation markers stays as the person wrote it`, async () => {
    const agent = await session(order, { persona: { name: 'PM', text: 'Call me {{user}}.' } })
    const section = styleOf(await agent.assemble({ sections: DSH_SECTIONS, variables: GLM }))
    assert.equal(section?.interpolate, false)
    assert.ok(section?.text.includes('Call me {{user}}.'))
  })

  test(`placement with the main agent section and the guard declaration (${order}): on another route the section stays ahead of both and the DSH identity is untouched; on the GLM route the dialect moves it and both still come last`, async () => {
    const assembled = await (await session(order, { persona: PERSONA })).assemble({ sections: DSH_SECTIONS, variables: OTHER })
    assert.deepEqual(namesOf(assembled), ['harness:identity', 'tool:read', OUTPUT_STYLE_SECTION, MAIN_AGENT_SECTION])
    assert.equal(identityOf(assembled), 'dsh identity')
    // A base assembly that already carries the declaration: the persona goes in front of it, as the main agent section does.
    const declared = await (await session(order, { persona: PERSONA })).assemble({ sections: [{ name: 'harness:identity', text: 'dsh identity' }, { name: 'glm:guard', text: 'rules' }, { name: 'tool:read', text: 'read guidance' }], variables: OTHER })
    assert.deepEqual(namesOf(declared), ['harness:identity', OUTPUT_STYLE_SECTION, MAIN_AGENT_SECTION, 'glm:guard', 'tool:read'])
    // The guard's listener on either side of the design row's hooks: the same order, the declaration last.
    for (const guard of ['before', 'after'] as const) {
      const guarded = await (await session(order, { persona: PERSONA }, { guard })).assemble({ sections: DSH_SECTIONS, variables: OTHER })
      assert.deepEqual(namesOf(guarded), ['harness:identity', 'tool:read', OUTPUT_STYLE_SECTION, MAIN_AGENT_SECTION, 'glm:guard'], `guard ${guard}`)
    }
    // On the GLM route the dialect moves the persona; the main agent section and the declaration still come last, in that order.
    for (const guard of ['before', 'after'] as const) {
      const guarded = await (await session(order, { persona: PERSONA }, { guard })).assemble({ sections: DSH_SECTIONS, variables: GLM })
      assert.deepEqual(namesOf(guarded), [...WITH_PERSONA, 'glm:guard'], `GLM, guard ${guard}`)
    }
  })
}

test('the two installation orders give the same assembly, byte for byte, on the GLM route and on another', async () => {
  for (const route of [GLM, OTHER]) {
    const first = await (await session('dialect first', { persona: PERSONA })).assemble({ sections: DSH_SECTIONS, variables: route })
    const second = await (await session('design first', { persona: PERSONA })).assemble({ sections: DSH_SECTIONS, variables: route })
    assert.deepEqual(first, second, JSON.stringify(route))
  }
})

test('no reminder of the style is added each turn (ZCode\'s output-style-is-active notice is not followed): no section, no message, no step notice says so', async () => {
  for (const route of [GLM, OTHER]) {
    const agent = await session('dialect first', { persona: PERSONA })
    const assembled = await agent.assemble({ sections: DSH_SECTIONS, variables: route })
    const decision = await agent.step()
    const everything = JSON.stringify([assembled, decision, agent.sent])
    assert.equal(everything.includes('output style is active'), false, JSON.stringify(route))
    assert.equal(everything.includes('Remember to follow the specific guidelines'), false, JSON.stringify(route))
  }
})

// ---------------------------------------------------------------- the file that records where this project leaves 3.17.1

test('docs/reference/zcode-verbatim.md has the section 「不跟 3.17.1 的地方」 with the three deviations, each with its reason', () => {
  const text = readFileSync(new URL('../docs/reference/zcode-verbatim.md', import.meta.url), 'utf8').replaceAll('\r\n', '\n')
  const start = text.search(/^## \d+\. 不跟 3\.17\.1 的地方$/m)
  assert.ok(start >= 0, 'the section heading is there')
  const body = text.slice(start).split(/^## /m)[1] ?? ''
  const entry = (n: number): string => body.split('\n').find(line => line.startsWith(`- (${n}) `)) ?? ''
  assert.match(entry(1), /output_style_instructions/)
  assert.match(entry(1), /理由/)
  assert.match(entry(2), /r8o/)
  assert.match(entry(2), /理由/)
  assert.ok(entry(3).includes(SCOPE))
  assert.match(entry(3), /理由/)
})
