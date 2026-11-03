import assert from 'node:assert/strict'
import test from 'node:test'
import { mcpPresentation, searchTools, type ToolSearchCandidate } from '../src/toolsearch/search.ts'
import { announcementDelta, announcementHistory, buildToolExposure, loadedDefinitions, projectSearchResult } from '../src/toolsearch/exposure.ts'
import {
  LOCAL_TOOL_SEARCH_DESCRIPTION,
  NO_MATCHING_DEFERRED_TOOLS,
  TOOL_REFERENCES_REMOVED,
  renderToolSearchAnnouncement,
  summarizeToolNames,
} from '../src/toolsearch/zcode-text.ts'
import { wrapSystemReminder } from '../src/shared/zcode-notice.ts'
import { apply as glmPromptApply } from '../src/glm-prompt/index.ts'
import type { AssembledTool, DerivedMessage, PreStepDecision, UserNotice } from '../src/shared/dsh-min.ts'
import { fakeRuntime } from './fake-rc3.ts'

const tool = (name: string, description = `native ${name}`): AssembledTool => ({ name, description, parameters: { type: 'object', properties: {} } })
const CONTROLS = [tool('LocalToolSearch'), tool('DeferredToolCall')]

// --- search (ZCode searchTools) ---

const candidates: ToolSearchCandidate[] = [
  { name: 'Read', deferred: false },
  { name: 'web_fetch', description: 'Fetch one HTTP(S) URL and return its content', deferred: true },
  { name: 'web_search', description: 'Search the web for current information', deferred: true },
  { name: 'TodoWrite', description: 'Update the todo list', deferred: true },
  { name: 'ToolSearch', aliases: ['LocalToolSearch'], deferred: false },
  ...['browser_navigate', 'browser_click', 'browser_type'].map(raw => ({ name: `mcp__byob__${raw}`, mcp: mcpPresentation(`mcp__byob__${raw}`)!, description: `Browser ${raw.split('_')[1]}`, deferred: true })),
  { name: 'mcp__slack__send_message', mcp: mcpPresentation('mcp__slack__send_message')!, description: 'Send a Slack message', deferred: true },
]

test('select resolves exact names and aliases across the catalog, uncapped, ignoring unknown names', () => {
  assert.deepEqual(searchTools('select:TodoWrite,web_fetch,missing', candidates, 1), ['TodoWrite', 'web_fetch'])
  assert.deepEqual(searchTools('select:Read', candidates), ['Read']) // resident tools are selectable
  assert.deepEqual(searchTools('select:LocalToolSearch', candidates), ['ToolSearch'])
  assert.deepEqual(searchTools('SELECT:browser_click', candidates), ['mcp__byob__browser_click']) // MCP raw tool name
})

test('an exact name query returns that tool; an mcp__ prefix lists the server tools capped', () => {
  assert.deepEqual(searchTools('todowrite', candidates), ['TodoWrite'])
  assert.deepEqual(searchTools('mcp__byob__', candidates, 2), ['mcp__byob__browser_navigate', 'mcp__byob__browser_click'])
})

test('keyword search scores name parts over descriptions and honors +required terms', () => {
  assert.equal(searchTools('web fetch', candidates)[0], 'web_fetch')
  assert.deepEqual(searchTools('+slack send', candidates), ['mcp__slack__send_message'])
  assert.deepEqual(searchTools('current information', candidates), ['web_search']) // description words, word-bounded
  assert.deepEqual(searchTools('nothing-matches', candidates), [])
})

// --- exposure (ZCode buildToolExposure) ---

/** The 28-tool GLM face the desktop runtime assembled in the L3 probe (2026-10-27), after the alias rewrite. */
const PROBE_FACE = ['Bash', 'Edit', 'Glob', 'Grep', 'Read', 'TodoWrite', 'Write', 'create_goal', 'exit_plan_mode', 'get_goal', 'interrupt_agent', 'job_kill', 'job_list', 'job_output', 'list_agents', 'memory_forget', 'memory_query', 'memory_store', 'read_image', 'send_message', 'skill', 'subagent', 'subagent_fork', 'update_goal', 'web_fetch', 'web_search', 'workflow', 'working_directory']

test('the probe face splits into ZCode-resident tools and deferred DSH extras', () => {
  const exposure = buildToolExposure([...PROBE_FACE.map(name => tool(name)), ...CONTROLS])
  assert.equal(exposure.enabled, true)
  assert.deepEqual([...exposure.deferred].sort(), ['TodoWrite', 'create_goal', 'exit_plan_mode', 'interrupt_agent', 'job_kill', 'job_list', 'job_output', 'list_agents', 'send_message', 'update_goal', 'web_fetch', 'web_search', 'working_directory'])
  assert.deepEqual(exposure.tools.map(entry => entry.name), ['Bash', 'Edit', 'Glob', 'Grep', 'Read', 'Write', 'get_goal', 'memory_forget', 'memory_query', 'memory_store', 'read_image', 'skill', 'subagent', 'subagent_fork', 'workflow', 'LocalToolSearch', 'DeferredToolCall'])
  const search = exposure.catalog.find(entry => entry.name === 'ToolSearch')!
  assert.deepEqual(search.aliases, ['LocalToolSearch'])
})

test('without deferred tools or without the controls, search is off and the controls leave the face', () => {
  const resident = buildToolExposure([tool('Read'), ...CONTROLS])
  assert.equal(resident.enabled, false)
  assert.deepEqual(resident.tools.map(entry => entry.name), ['Read'])
  const noControls = buildToolExposure([tool('Read'), tool('web_fetch')])
  assert.equal(noControls.enabled, false)
  assert.deepEqual(noControls.tools.map(entry => entry.name), ['Read', 'web_fetch'])
})

test('the face drops deferLoading outside native mode', () => {
  const exposure = buildToolExposure([{ ...tool('Read'), deferLoading: true }, tool('web_fetch'), ...CONTROLS])
  assert.equal(exposure.tools[0]!.deferLoading, undefined)
})

// --- announcement (ZCode buildToolSearchAnnouncement / renderToolSearchAnnouncement) ---

test('the first announcement lists every deferred name, sorted, under the local notice', () => {
  const exposure = buildToolExposure([tool('Read'), tool('web_fetch'), tool('TodoWrite'), ...CONTROLS])
  const delta = announcementDelta([], exposure)!
  assert.deepEqual(delta, { addedNames: ['TodoWrite', 'web_fetch'], removedNames: [], readdedNames: [] })
  assert.equal(wrapSystemReminder(renderToolSearchAnnouncement(delta)), [
    '<system-reminder>',
    'The following deferred tools are available via LocalToolSearch. Use query "select:<name>[,<name>...]" to load their complete schemas, then call them through DeferredToolCall with {name, input}. Call resident tools directly:',
    'TodoWrite',
    'web_fetch',
    '</system-reminder>',
  ].join('\n'))
  assert.equal(announcementDelta([delta], exposure), undefined)
})

test('removed and re-added names follow the persisted deltas', () => {
  const full = buildToolExposure([tool('Read'), tool('web_fetch'), tool('web_search'), ...CONTROLS])
  const first = announcementDelta([], full)!
  const shrunk = buildToolExposure([tool('Read'), tool('web_fetch'), ...CONTROLS])
  const removal = announcementDelta([first], shrunk)!
  assert.deepEqual(removal, { addedNames: [], removedNames: ['web_search'], readdedNames: [] })
  // 3.17.1: a name the registry no longer holds left the session; paragraphs join with one newline.
  assert.equal(renderToolSearchAnnouncement(removal), [
    'The following deferred tools are no longer available in this session. Do not search for them \u2014 LocalToolSearch will return no match:',
    'web_search',
    'This is ambient context \u2014 do not narrate it to the user unless they ask or it is directly relevant to their request.',
  ].join('\n'))
  const back = announcementDelta([first, removal], full)!
  assert.deepEqual(back, { addedNames: ['web_search'], removedNames: [], readdedNames: ['web_search'] })
  assert.equal(renderToolSearchAnnouncement(back), '1 deferred tool is available again in this session (announced earlier in this conversation): web_search. Load via LocalToolSearch as before.')
})

test('large removals summarize MCP names per server', () => {
  const names = Array.from({ length: 31 }, (_, index) => `mcp__srv__t${index}`)
  assert.equal(summarizeToolNames([...names, 'web_fetch']), 'mcp__srv__* (31), web_fetch')
  const text = renderToolSearchAnnouncement({ addedNames: [], removedNames: names, readdedNames: [] })
  assert.ok(text.startsWith('31 deferred tools are no longer available (MCP server disconnected): mcp__srv__* (31). Do not search for them \u2014 LocalToolSearch will return no match.\n'))
  const hidden = renderToolSearchAnnouncement({ addedNames: [], removedNames: names, readdedNames: [] }, names)
  assert.ok(hidden.startsWith('31 deferred tools are no longer available: mcp__srv__* (31). Do not search for them \u2014 LocalToolSearch will return no match.\n'))
})

test('announcement facts are read back only from this row\'s notices', () => {
  const facts = { addedNames: ['web_fetch'], removedNames: [], readdedNames: [] }
  const history: DerivedMessage[] = [
    { role: 'user', source: { kind: 'glm-tool-search', toolSearchAnnouncement: facts } },
    { role: 'user', source: { kind: 'user' } },
    { role: 'user', source: { kind: 'glm-tool-search', toolSearchAnnouncement: { addedNames: [], removedNames: [], readdedNames: ['x'] } } }, // readded outside added: rejected
  ]
  assert.deepEqual(announcementHistory(history), [facts])
})

// --- search result projection (ZCode projectToolReferences, local mode) ---

const projectionExposure = buildToolExposure([tool('Read'), tool('web_fetch', 'Fetch a URL'), tool('TodoWrite', 'Update todos'), ...CONTROLS])

test('a search renders definitions with the loaded reminder; resident picks render without it', () => {
  const [block, reminder] = projectSearchResult(['web_fetch'], projectionExposure, new Set())
  assert.equal(block, '<functions>\n<function>{"description":"Fetch a URL","name":"web_fetch","parameters":{"type":"object","properties":{}}}</function>\n</functions>')
  assert.equal(reminder, '<system-reminder>\nLoaded: web_fetch. Call it now with DeferredToolCall {"name":"<tool name>","input":{...}}, using the exact tool name and filling input according to its schema above. No additional LocalToolSearch is needed before calling these tools.\n</system-reminder>')
  assert.ok(projectSearchResult(['web_fetch', 'TodoWrite'], projectionExposure, new Set())[1]!.includes('Loaded: web_fetch, TodoWrite. Call them now with'))
  assert.deepEqual(projectSearchResult(['Read'], projectionExposure, new Set()).length, 1)
  assert.ok(projectSearchResult(['ToolSearch'], projectionExposure, new Set())[0]!.includes('"name":"LocalToolSearch"'))
})

test('definitions the model already holds come back as the already-loaded reminder', () => {
  const blocks = projectSearchResult(['web_fetch'], projectionExposure, new Set(['web_fetch']))
  assert.deepEqual(blocks, ['<system-reminder>\nTool definitions already available in this conversation: web_fetch. Use DeferredToolCall with {name, input} to execute these tools. Searching again does not execute them.\n</system-reminder>'])
})

test('no match and vanished references have their own texts', () => {
  assert.deepEqual(projectSearchResult([], projectionExposure, new Set()), [NO_MATCHING_DEFERRED_TOOLS])
  assert.deepEqual(projectSearchResult(['gone'], projectionExposure, new Set()), [TOOL_REFERENCES_REMOVED])
})

test('loaded definitions count only search results before the latest assistant message', () => {
  const definitions = projectSearchResult(['web_fetch'], projectionExposure, new Set()).map(text => ({ type: 'text', text }))
  const searchCall = (id: string): DerivedMessage => ({ role: 'assistant', content: [{ type: 'tool-call', id, name: 'LocalToolSearch' }] })
  const result = (id: string): DerivedMessage => ({ role: 'tool', toolCallId: id, content: definitions })
  assert.deepEqual([...loadedDefinitions([searchCall('c1'), result('c1'), { role: 'assistant', content: [] }])], ['web_fetch'])
  // Same batch: the result follows the latest assistant message, so the model has not seen it yet.
  assert.deepEqual([...loadedDefinitions([searchCall('c1'), result('c1')])], [])
  assert.deepEqual([...loadedDefinitions([searchCall('c1'), { ...result('c1'), isError: true }, { role: 'assistant' }])], [])
})

test('3.17.1 splits re-added and removed names by origin: MCP server, this session, hidden from this request', () => {
  const ambient = 'This is ambient context \u2014 do not narrate it to the user unless they ask or it is directly relevant to their request.'
  const readded = renderToolSearchAnnouncement({ addedNames: ['mcp__srv__a', 'mcp__srv__b', 'web_fetch'], removedNames: [], readdedNames: ['mcp__srv__a', 'mcp__srv__b', 'web_fetch'] })
  assert.equal(readded, [
    '2 deferred tools are available again (MCP server reconnected \u2014 names announced earlier in this conversation): mcp__srv__* (2). Load via LocalToolSearch as before.',
    '1 deferred tool is available again in this session (announced earlier in this conversation): web_fetch. Load via LocalToolSearch as before.',
  ].join('\n'))
  const removed = renderToolSearchAnnouncement({ addedNames: [], removedNames: ['mcp__srv__a', 'todo_write', 'web_search'], readdedNames: [] }, ['todo_write'])
  assert.equal(removed, [
    'The following deferred tools are no longer available (their MCP server disconnected). Do not search for them \u2014 LocalToolSearch will return no match:',
    'mcp__srv__a',
    'The following deferred tools are no longer available in this session. Do not search for them \u2014 LocalToolSearch will return no match:',
    'web_search',
    'The following deferred tools are no longer available. Do not search for them \u2014 LocalToolSearch will return no match:',
    'todo_write',
    ambient,
  ].join('\n'))
})

test('the LocalToolSearch description is the 3.17.1 local text', () => {
  assert.ok(LOCAL_TOOL_SEARCH_DESCRIPTION.startsWith('Fetches full schema definitions for deferred tools so they can be called using DeferredToolCall.\n\nDeferred tools appear by name'))
  assert.ok(LOCAL_TOOL_SEARCH_DESCRIPTION.includes('Query forms:\nRegular expressions are not supported.'))
  assert.ok(LOCAL_TOOL_SEARCH_DESCRIPTION.endsWith('"status":"in_progress","priority":"high"}]}})\n</example>'))
})

// --- wiring on the rc.3 double (glm-prompt row) ---

async function glmAgent(model = 'glm-5.3') {
  const rt = fakeRuntime()
  glmPromptApply(rt.ctx)
  await rt.create()
  const assembled = await rt.assemble({ model })
  return { rt, assembled }
}

const userInput = { id: 'u1', role: 'user', content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } }
const noticesOf = (decision: PreStepDecision): UserNotice[] =>
  decision.kind === 'enter' ? decision.messages.filter((message): message is UserNotice => (message as UserNotice).source?.kind === 'glm-tool-search') : []

test('a GLM step gets one announcement notice whose delta persists in its source', async () => {
  const { rt } = await glmAgent()
  const decision = await rt.preStep({ messages: [userInput] })
  const [notice] = noticesOf(decision)
  assert.ok(notice !== undefined)
  assert.equal(notice.role, 'user')
  assert.equal(typeof notice.id, 'string')
  assert.deepEqual(notice.source.toolSearchAnnouncement, { addedNames: ['TodoWrite', 'web_fetch'], removedNames: [], readdedNames: [] })
  assert.ok(notice.content[0]!.text.startsWith('<system-reminder>\nThe following deferred tools are available via LocalToolSearch.'))
  rt.history.push(userInput, notice)
  await rt.assemble({ model: 'glm-5.3' })
  assert.deepEqual(noticesOf(await rt.preStep({ step: 2 })), [])
})

test('a removed name the agent can still resolve is announced as hidden and recorded in toolSearchHiddenNames', async () => {
  const { rt } = await glmAgent()
  // todo_write is registered but faced by TodoWrite, so it is off the GLM face; gone_tool is registered nowhere.
  const earlier = { id: 'n0', role: 'user', content: [{ type: 'text', text: 'earlier' }], source: { kind: 'glm-tool-search', toolSearchAnnouncement: { addedNames: ['TodoWrite', 'gone_tool', 'todo_write', 'web_fetch'], removedNames: [], readdedNames: [] } } }
  rt.history.push(userInput, earlier)
  const [notice] = noticesOf(await rt.preStep({ step: 2 }))
  assert.ok(notice !== undefined)
  assert.deepEqual(notice.source.toolSearchAnnouncement, { addedNames: [], removedNames: ['gone_tool', 'todo_write'], readdedNames: [] })
  assert.deepEqual(notice.source.toolSearchHiddenNames, ['todo_write'])
  assert.ok(notice.content[0]?.text.includes('no longer available in this session. Do not search for them \u2014 LocalToolSearch will return no match:\ngone_tool\nThe following deferred tools are no longer available. Do not search'))
})

test('no announcement for an empty first step or a non-GLM request', async () => {
  const { rt } = await glmAgent()
  assert.deepEqual(noticesOf(await rt.preStep({ messages: [] })), [])
  const plain = await glmAgent('deepseek-flash')
  assert.deepEqual(noticesOf(await plain.rt.preStep({ messages: [userInput] })), [])
  await assert.rejects(plain.rt.execute('LocalToolSearch', { query: 'select:web_fetch', max_results: 5 }), /ToolSearch is not enabled for this request\./)
})

test('LocalToolSearch returns the projected content and renders it as text blocks', async () => {
  const { rt } = await glmAgent()
  const search = rt.scoped.find(entry => entry.name === 'LocalToolSearch')!
  const value = await rt.execute('LocalToolSearch', { query: 'select:web_fetch', max_results: 5 }) as { matches: string[], total_deferred_tools: number, content: string[] }
  assert.deepEqual(value.matches, ['web_fetch'])
  assert.equal(value.total_deferred_tools, 2)
  const rendered = search.output.render({}, value)
  assert.equal(rendered.length, 2)
  assert.ok(rendered[0]!.text!.startsWith('<functions>\n<function>{"description":"native web_fetch","name":"web_fetch"'))
  const none = await rt.execute('LocalToolSearch', { query: 'zzz' }) as { content: string[] }
  assert.deepEqual(none.content, [NO_MATCHING_DEFERRED_TOOLS])
})

/** A GLM runtime that logs the calls its tools receive. */
async function loggingGlmRuntime(calls: Array<{ name: string, args: unknown }>) {
  const rt = fakeRuntime({ calls })
  glmPromptApply(rt.ctx)
  await rt.create()
  await rt.assemble({ model: 'glm-5.3' })
  return rt
}

test('DeferredToolCall runs the deferred target through the tool pipeline as a call of its own', async () => {
  const calls: Array<{ name: string, args: unknown }> = []
  const rt = await loggingGlmRuntime(calls)
  const value = await rt.execute('DeferredToolCall', { name: 'TodoWrite', input: { todos: [{ content: 'a', status: 'pending', priority: 'high' }] } }) as { name: string, content: unknown[] }
  assert.equal(value.name, 'TodoWrite')
  assert.deepEqual(value.content, [{ type: 'text', text: 'todo_write' }]) // the target's own rendering
  assert.deepEqual(calls, [{ name: 'todo_write', args: { todos: [{ content: 'a', status: 'pending' }] } }])
  assert.equal(rt.executed.length, 1)
  assert.equal(rt.executed[0]!.parent, undefined) // not a transport sub-dispatch: listeners see TodoWrite
  assert.equal(rt.executed[0]!.callId, 'call-1:deferred')
})

test('DeferredToolCall is no way round the write tools: Write is resident on GLM, so the call fails and nothing is written (the main agent relies on it, addendum 2.1)', async () => {
  const calls: Array<{ name: string, args: unknown }> = []
  const rt = await loggingGlmRuntime(calls)
  await assert.rejects(rt.execute('DeferredToolCall', { name: 'Write', input: { file_path: 'a.txt', content: 'x' } }), /^Error: (Call Write directly using its normal tool call; DeferredToolCall only accepts deferred tools\.|Tool not available in this request: Write)$/)
  assert.deepEqual(calls, [])
})

test('DeferredToolCall rejects resident, control, unknown and malformed calls with the ZCode texts', async () => {
  const { rt } = await glmAgent()
  await assert.rejects(rt.execute('DeferredToolCall', { name: 'Read', input: {} }), { message: 'Call Read directly using its normal tool call; DeferredToolCall only accepts deferred tools.' })
  await assert.rejects(rt.execute('DeferredToolCall', { name: 'ToolSearch', input: {} }), { message: 'Call ToolSearch directly using its normal tool call; DeferredToolCall only accepts deferred tools.' })
  await assert.rejects(rt.execute('DeferredToolCall', { name: 'LocalToolSearch', input: {} }), { message: 'Tool not available in this request: LocalToolSearch' })
  await assert.rejects(rt.execute('DeferredToolCall', { name: 'nope', input: {} }), { message: 'Tool not available in this request: nope' })
  await assert.rejects(rt.execute('DeferredToolCall', { name: 'web_fetch' }), { message: 'Invalid DeferredToolCall input.' })
  await assert.rejects(rt.execute('DeferredToolCall', { name: 'web_fetch', input: {}, extra: 1 }), { message: 'Invalid DeferredToolCall input.' })
  await rt.assemble({ model: 'deepseek-flash' })
  await assert.rejects(rt.execute('DeferredToolCall', { name: 'web_fetch', input: {} }), { message: 'DeferredToolCall is not available for this request.' })
})
