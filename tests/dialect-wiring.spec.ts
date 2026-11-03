import assert from 'node:assert/strict'
import test from 'node:test'
import { fileToolsOnly, judge, NATIVE_FACE, renderCorrection, workspaceContainment } from '../src/guard/rules.ts'
import { apply as glmPromptApply, dialectSections, installDialect } from '../src/glm-prompt/index.ts'
import { REPORTING_DEPTH_SECTION } from '../src/glm-prompt/reporting-depth.ts'
import { DYNAMIC_BEHAVIOR } from '../src/glm-prompt/verbatim.ts'
import { isGlmModel } from '../src/shared/route.ts'
import { fakeRuntime } from './fake-rc3.ts'

const rule = workspaceContainment(['C:\\ws\\proj'])
// Rules judge DSH native names; the guard rows map ZCode aliases (Write, Bash) first (src/shared/dialect.ts).
const write = (path: string) => ({ name: 'write', arguments: { file_path: path } })

test('containment allows writes inside the workspace (case and separator insensitive)', () => {
  assert.equal(rule.detect(write('C:\\WS\\PROJ\\src\\a.ts')).kind, 'allow')
  assert.equal(rule.detect(write('C:/ws/proj/.llm/memory/a.md')).kind, 'allow')
})

test('containment denies writes outside the workspace with a four-part correction', () => {
  const verdict = rule.detect(write('C:\\Windows\\system32\\evil.dll'))
  assert.equal(verdict.kind, 'deny')
  if (verdict.kind === 'deny') {
    assert.ok(verdict.correction.fact.includes('evil.dll'))
    assert.ok(verdict.correction.rightPath.includes('.llm'))
    assert.ok(verdict.correction.exception.includes('tell the human'))
    const text = renderCorrection(verdict.correction)
    assert.ok(text.startsWith('You tried to write'))
    assert.match(text, /Boundary: /)
    assert.match(text, /Right path: /)
    assert.match(text, /Exception: /)
  }
})

test('both exceptions name no request channel; containment still sends the model to the human (file-tools-only is not requestable, design 0.6-finish2 §5.2)', () => {
  const [containment, shellWrite] = [rule.detect(write('C:\\Windows\\system32\\evil.dll')), fileToolsOnly.detect({ name: 'pwsh', arguments: { command: 'echo x > out.txt' } }, NATIVE_FACE)]
  for (const verdict of [containment, shellWrite]) {
    assert.equal(verdict.kind, 'deny')
    if (verdict.kind !== 'deny') continue
    // No tool or channel takes a filed request until the M4 decision card exists (G4).
    assert.doesNotMatch(verdict.correction.exception, /file a request|application protocol|approves each request/i)
  }
  // Containment still sends the model to the human; file-tools-only governs habit, so its G1 exception
  // names the build-and-git allowance instead of the human sentence.
  assert.ok(containment.kind === 'deny' && containment.correction.exception.endsWith('tell the human what you need, where and why; only the human can allow it.'))
  assert.ok(shellWrite.kind === 'deny' && shellWrite.correction.exception.startsWith('Build, test and git commands that write files as a side effect are allowed'))
})

test('containment ignores sibling prefixes like proj-evil', () => {
  assert.equal(rule.detect(write('C:\\ws\\proj-evil\\a.ts')).kind, 'deny')
})

const bash = (command: string) => ({ name: 'pwsh', arguments: { command } })

test('file-tools-only denies shell write patterns inside the workspace too', () => {
  for (const command of ['sed -i s/a/b/ f.txt', 'Set-Content f.txt hi', 'echo x > out.txt', 'ls >> log.txt']) {
    assert.equal(fileToolsOnly.detect(bash(command), NATIVE_FACE).kind, 'deny', command)
  }
})

test('file-tools-only allows execution-style shell commands, quoted arrows and git subcommands', () => {
  for (const command of ['npm test', 'git status', 'ls -la', 'node server.js &', 'git commit -m "a -> b => c"', 'git rm old.ts', 'npm test 2>&1']) {
    assert.equal(fileToolsOnly.detect(bash(command), NATIVE_FACE).kind, 'allow', command)
  }
})

test('a throwing detector fails open: the broken rule does not deny, the healthy one still does', () => {
  const broken = { id: 'broken', declare: '', detect(): never { throw new Error('boom') } }
  const verdict = judge([broken, rule], write('C:\\Windows\\x'))
  assert.deepEqual([verdict.denies.length, verdict.errors], [1, ['broken']])
})


test('dialect sections mirror order anchors and carry verbatim content', () => {
  const sections = dialectSections()
  assert.deepEqual(sections.map(section => section.name), [
    'glm:cli-prefix',
    'harness:identity',
    'glm:dynamic-behavior', // 3.17.1 Dynamic Behavior, verbatim
    REPORTING_DEPTH_SECTION,
    'glm:session-guidance', // ledger ②⑤: coding-plan guidance
    'glm:memory', // ledger ⑧: memory home is .llm
    'glm:context-management', // ledger ⑦
  ])
  assert.equal(sections[1].order, -1000)
  assert.ok(sections[1].text.includes('reverse-engineering')) // coding-plan default carries the user notice
  assert.ok(sections[1].text.includes('DeepSeek Harness Web GUI')) // ledger ①: host-fact rewrite
  assert.equal(sections[2]?.text, DYNAMIC_BEHAVIOR)
  assert.equal(DYNAMIC_BEHAVIOR.split('\n').length, 3)
  // ZCode announces deferred names in <system-reminder> notices; its system prompt has no deferred section.
  assert.ok(!sections.some(section => section.text.includes('deferred')))
})

test('start-plan tier keeps the byte-identical official mirror', () => {
  const sections = dialectSections(false, 'balanced', { tier: 'start-plan' })
  assert.deepEqual(sections.map(section => section.name), ['glm:cli-prefix', 'harness:identity', REPORTING_DEPTH_SECTION])
  assert.ok(sections[1]!.text.includes('IMPORTANT: Assist with authorized security testing'))
  assert.ok(sections[1]!.text.includes('in a terminal')) // verbatim harness line, not the DSH rewrite
})

test('environment section joins only when host facts are provided', () => {
  const withEnv = dialectSections(false, 'balanced', { env: { cwd: 'C:\\ws', platform: 'win32', shell: 'pwsh', osVersion: '10.0', isGitRepository: true } })
  const env = withEnv.find(section => section.name === 'glm:environment')
  assert.ok(env!.text.includes('- Primary working directory: C:\\ws'))
  assert.ok(env!.text.includes('\n - Is a git repository: true\n'))
  assert.equal(dialectSections().some(section => section.name === 'glm:environment'), false)
})

test('the environment section names the session\'s own working directory; the configured one only stands in for a session without one', async () => {
  const env = { cwd: 'C:\\ws', platform: 'win32', shell: 'pwsh', osVersion: '10.0', isGitRepository: true }
  const environment = async (cwd?: string) => {
    const rt = fakeRuntime(cwd === undefined ? {} : { cwd })
    installDialect(rt.agent, { env })
    return (await rt.assemble({ model: 'glm-5.3' })).sections.find(section => section.name === 'glm:environment')!.text
  }
  const elsewhere = await environment('D:\\other\\project')
  assert.ok(elsewhere.includes('- Primary working directory: D:\\other\\project'), elsewhere)
  assert.ok(!elsewhere.includes('C:\\ws'), elsewhere)
  assert.ok(elsewhere.includes('- Platform: win32')) // the other host facts stay as configured
  assert.ok((await environment()).includes('- Primary working directory: C:\\ws'))
})


test('skills note appends to session guidance when skills exist', () => {
  const withSkills = dialectSections(false, 'balanced', { skills: true })
  const guidance = withSkills.find(section => section.name === 'glm:session-guidance')!
  assert.ok(guidance.text.includes('skill loader'))
  assert.ok(guidance.text.includes('only use skills it lists'))
})


// rc.3 wiring (docs/DESIGN.md §2.4a, §3): the route reaches the row only
// through the assembly variables; the tool face is rewritten per request.

const ZCODE_FACE = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'TodoWrite']
const RESIDENT_FACE = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash']
const CONTROLS = ['LocalToolSearch', 'DeferredToolCall']
const COVERED = ['read', 'write', 'edit', 'glob', 'grep', 'pwsh', 'todo_write']

test('the dialect follows the model family, case-insensitively', () => {
  assert.equal(isGlmModel('glm-5.3'), true)
  assert.equal(isGlmModel('GLM-5.3-Flash'), true)
  assert.equal(isGlmModel('deepseek-flash'), false)
  assert.equal(isGlmModel(undefined), false)
})

test('installDialect registers the aliases and search controls in scope and one prepend assemble rewrite', () => {
  const rt = fakeRuntime()
  installDialect(rt.agent)
  assert.deepEqual(rt.scoped.map(tool => tool.name), [...ZCODE_FACE, ...CONTROLS])
  const assemble = rt.listeners.filter(entry => entry.event === 'system-prompt/assemble')
  assert.equal(assemble.length, 1)
  assert.deepEqual(assemble[0].options, { prepend: true })
})

test('toolSearchMode off registers the aliases only and leaves deferrable tools in the face', async () => {
  const rt = fakeRuntime()
  installDialect(rt.agent, { toolSearchMode: 'off' })
  assert.deepEqual(rt.scoped.map(tool => tool.name), ZCODE_FACE)
  const names = (await rt.assemble({ model: 'glm-5.3' })).tools.map(tool => tool.name)
  assert.ok(names.includes('TodoWrite') && names.includes('web_fetch'))
  assert.equal(rt.listeners.filter(entry => entry.event === 'agent/pre-step').length, 2) // the todo and peak reminders; no announcement
})

test('a GLM request gets the ZCode identity and resident face; deferred tools and covered natives leave it', async () => {
  const rt = fakeRuntime()
  installDialect(rt.agent)
  const assembled = await rt.assemble({ provider: 'glm-zcode', model: 'glm-5.3' })
  assert.equal(assembled.sections[0].name, 'glm:cli-prefix')
  assert.equal(assembled.sections[0]?.text, 'You are ZCode, an interactive agent')
  assert.equal(assembled.sections[1].name, 'harness:identity')
  // The 3.17.1 identity names no product; ZCode is in the CLI prefix only.
  assert.ok(assembled.sections[1].text.startsWith('You are an agent working with the user toward their goals'))
  assert.ok(!assembled.sections.some(section => section.text.includes('powered by DeepSeek Harness')))
  const names = assembled.tools.map(tool => tool.name)
  assert.deepEqual(names, [...RESIDENT_FACE, ...CONTROLS])
  for (const name of COVERED) assert.ok(!names.includes(name), name)
})

test('a non-GLM request keeps the DSH prompt and natives and never sees the aliases or search controls', async () => {
  const rt = fakeRuntime()
  installDialect(rt.agent)
  const assembled = await rt.assemble({ provider: 'deepseek-official', model: 'deepseek-flash' })
  assert.deepEqual(assembled.sections.map(section => section.name), ['harness:identity'])
  assert.ok(assembled.sections[0].text.includes('powered by DeepSeek Harness'))
  const names = assembled.tools.map(tool => tool.name)
  for (const name of [...ZCODE_FACE, ...CONTROLS]) assert.ok(!names.includes(name), name)
  for (const name of [...COVERED, 'web_fetch']) assert.ok(names.includes(name), name)
})

test('a route switch mid-session changes the next request only, with no registration churn', async () => {
  const rt = fakeRuntime()
  installDialect(rt.agent)
  const before = rt.scoped.length
  assert.ok((await rt.assemble({ model: 'glm-5.3' })).tools.some(tool => tool.name === 'Read'))
  assert.ok((await rt.assemble({ model: 'deepseek-flash' })).tools.some(tool => tool.name === 'read'))
  assert.ok((await rt.assemble({ model: 'glm-5.3-flash' })).tools.some(tool => tool.name === 'Read'))
  assert.equal(rt.scoped.length, before)
})

test('a provider id alone does not light the dialect (model family decides)', async () => {
  const rt = fakeRuntime()
  installDialect(rt.agent)
  const assembled = await rt.assemble({ provider: 'glm' })
  assert.ok(assembled.sections[0].text.includes('powered by DeepSeek Harness'))
})

test('aliases execute the captured natives with mapped arguments', async () => {
  const calls: Array<{ name: string, args: unknown }> = []
  const rt = fakeRuntime({ calls })
  installDialect(rt.agent)
  await rt.execute('Read', { file_path: 'C:/ws/a.ts', offset: 2 })
  await rt.execute('Bash', { command: 'npm test', description: 'run tests', timeout: 30_000 })
  await rt.execute('Bash', { command: 'git status\ngit log -1' }) // ZCode description is optional; pwsh requires one
  await rt.execute('TodoWrite', { todos: [{ content: 'a', status: 'pending', priority: 'high' }] })
  assert.deepEqual(calls, [
    { name: 'read', args: { file_path: 'C:/ws/a.ts', offset: 2 } },
    { name: 'pwsh', args: { command: 'npm test', description: 'run tests', timeoutMs: 30_000 } },
    { name: 'pwsh', args: { command: 'git status\ngit log -1', description: 'git status' } },
    { name: 'todo_write', args: { todos: [{ content: 'a', status: 'pending' }] } },
  ])
})

test('an alias whose native is absent is skipped, and its name is not hidden', async () => {
  const rt = fakeRuntime({ natives: ['read', 'web_fetch'] })
  installDialect(rt.agent, { toolSearchMode: 'off' })
  assert.deepEqual(rt.scoped.map(tool => tool.name), ['Read'])
  const names = (await rt.assemble({ model: 'glm-5.3' })).tools.map(tool => tool.name)
  assert.deepEqual(names.sort(), ['Read', 'web_fetch'])
})

test('apply installs once per agent and never throws out of agent creation', async () => {
  const rt = fakeRuntime()
  glmPromptApply(rt.ctx)
  await rt.create()
  await rt.create()
  assert.equal(rt.listeners.filter(entry => entry.event === 'system-prompt/assemble').length, 1)
  const broken = fakeRuntime()
  ;(broken.ctx.tools as { get: unknown }).get = () => { throw new Error('registry gone') }
  glmPromptApply(broken.ctx)
  await broken.create() // fail-open: logged, not thrown
  assert.equal(broken.scoped.length, 0)
})