/**
 * L3 behavior probe (docs/DEVELOPMENT.md §3, ROADMAP M1.7): boots the real
 * desktop DSH runtime headless on the glmsandbox profile with the probe
 * provider (scripts/probe/probe-llm.mjs), runs scripted tasks, and checks
 * what the GLM-Hourness rows actually did to the model-visible request.
 *
 * Scenarios: a GLM route must get the ZCode dialect; a non-GLM route through
 * the same provider must stay untouched (no cross-route pollution). The
 * guard's shadow scenario runs in a scratch git repository under the run
 * directory with dsh-workspace-changes mounted through the overlay. Two
 * scenarios check the calibration run bounds (scripts/calibrate/limits.mjs).
 *
 * Usage: node scripts/probe/run-probe.mjs
 * Requires the desktop install (DSH_DESKTOP_DIR overrides the location) and
 * the glmsandbox profile linked to this repository. Each run writes its
 * overlays, request dumps and logs under .llm/probe-runs/<timestamp>/
 * (gitignored).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import { DISPATCH_TOOLS } from '../../dist/workflow/index.js'
import { userDataHome } from '../../dist/shared/data-home.js'
import { HEALTH_ROWS } from '../../dist/shared/health.js'
import { attachmentsIn, dataRows, initRepo, limitsRow, repo, requireDesktop, sandboxCommand, slash, workspaceChangesRow } from '../sandbox.mjs'

requireDesktop('probe')

const runDir = join(repo, '.llm', 'probe-runs', new Date().toISOString().replace(/[:.]/g, '-'))

/** A solid red 8x8 RGB PNG, built byte by byte so the fixture needs no binary file. */
function redPng(size = 8) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const out = Buffer.alloc(body.length + 8)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc32(body), body.length + 4)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth; colour type 2 (truecolour), default compression, filter, interlace
  header[9] = 2
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, Buffer.from([255, 0, 0]))])
  const pixels = deflateSync(Buffer.concat(Array.from({ length: size }, () => row)))
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', pixels), chunk('IEND', Buffer.alloc(0))])
}

// The real user-level directory (<DSH home>/glm-hourness) must not change
// during a run: every scenario points the data row at its own DSH home.
const realUsage = join(userDataHome(), 'audit', 'usage.jsonl')
const usageStamp = () => existsSync(realUsage) ? (({ size, mtimeMs }) => `${size}/${mtimeMs}`)(statSync(realUsage)) : 'absent'
const realUsageBefore = usageStamp()

/**
 * Boot one headless task on `model` with a scripted reply sequence and return
 * the main agent's step requests plus the compaction requests (the
 * session-title request carries no tools), the exit status and the wall
 * time. `overlay` adds patch lines. The scenario keeps its data in its own
 * directory (scripts/sandbox.mjs dataRows: project directory `<dir>/home`,
 * DSH home `<dir>/dsh-home`).
 */
function runScenario(name, model, script, task, overlay = [], cwd = repo) {
  const dir = join(runDir, name)
  const home = join(dir, 'home')
  mkdirSync(home, { recursive: true })
  const dump = join(dir, 'requests.jsonl')
  writeFileSync(dump, '')
  const patch = join(dir, 'probe.patch.yml')
  writeFileSync(patch, [
    '- id: agent-default-model',
    `  config: { provider: glm-probe, model: ${JSON.stringify(model)} }`,
    ...dataRows(dir),
    // /glm-status reads the credential store under the glm-login home; the
    // scenario home has none, so the probe never reads the real store.
    '- id: glm-hourness/glm-login',
    `  config: { home: ${JSON.stringify(slash(home))} }`,
    '- insert:',
    '    - id: glm-hourness-probe/llm',
    `      name: ${JSON.stringify(slash(join(repo, 'scripts', 'probe', 'probe-llm.mjs')))}`,
    '      inject: [llm]',
    `      config: { dump: ${JSON.stringify(slash(dump))}, script: ${JSON.stringify(JSON.stringify(script))} }`,
    ...overlay,
    '',
  ].join('\n'))
  const { exe, args, env } = sandboxCommand(patch, [task])
  const started = Date.now()
  const result = spawnSync(exe, args, { cwd, encoding: 'utf8', timeout: 180_000, env })
  const elapsedMs = Date.now() - started
  writeFileSync(join(dir, 'stdout.txt'), result.stdout ?? '')
  writeFileSync(join(dir, 'stderr.txt'), result.stderr ?? '')
  const requests = readFileSync(dump, 'utf8').split('\n').filter(line => line.length > 0).map(line => JSON.parse(line))
  return {
    status: result.status,
    elapsedMs,
    steps: requests.filter(request => request.tools.length > 0 && request.purpose !== 'compaction'),
    compactions: requests.filter(request => request.purpose === 'compaction'),
  }
}

const zcodeFace = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash']
// read_image is covered by the Read alias (image paths route to it).
const nativeFace = ['read', 'write', 'edit', 'glob', 'grep', 'pwsh', 'read_image']
const searchControls = ['LocalToolSearch', 'DeferredToolCall']
const names = step => new Set((step?.tools ?? []).map(tool => tool.name))
const lastToolResult = step => step?.messages.filter(message => message.role === 'tool').at(-1)
const announcements = step => (step?.messages ?? []).filter(message => message.role === 'user' && message.source === 'glm-tool-search')

// GLM steps: load TodoWrite through local tool search, call it through
// DeferredToolCall, read a file through the Read alias, create a file with
// Write, edit it with Edit (replace_all as a ZCode semantic-boolean string),
// read it back, try to overwrite an existing file that was never read (the
// Write description promises that fails), list both scratch files with Glob
// (newest first), search package.json with Grep (content mode, -i), run a
// command through Bash (timeout in milliseconds, no description), read a
// PNG (GLM-5.3 is text-only, so read_image refuses), write a file through
// the shell (the guard denies it and journals the violation), finish.
// The scratch files live in the scenario directory inside the workspace.
const glmDir = join(runDir, 'glm')
mkdirSync(glmDir, { recursive: true })
const scratch = join(glmDir, 'scratch.txt')
const unread = join(glmDir, 'unread.txt')
const blocked = join(glmDir, 'blocked.txt')
writeFileSync(unread, 'existing\n')
const png = join(runDir, 'red.png')
writeFileSync(png, redPng())
const glm = runScenario('glm', 'glm-5.3', [
  { tool: { name: 'LocalToolSearch', arguments: { query: 'select:TodoWrite', max_results: 5 } } },
  { tool: { name: 'DeferredToolCall', arguments: { name: 'TodoWrite', input: { todos: [{ content: 'probe', status: 'in_progress', priority: 'high' }] } } } },
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } } },
  { tool: { name: 'Write', arguments: { file_path: scratch, content: 'alpha beta alpha\n' } } },
  { tool: { name: 'Edit', arguments: { file_path: scratch, old_string: 'alpha', new_string: 'gamma', replace_all: 'true' } } },
  { tool: { name: 'Read', arguments: { file_path: scratch, offset: 0 } } },
  { tool: { name: 'Write', arguments: { file_path: unread, content: 'clobbered\n' } } },
  { tool: { name: 'Glob', arguments: { pattern: '{scratch,unread}.txt', path: glmDir } } },
  { tool: { name: 'Grep', arguments: { 'pattern': 'DSH-GLM-HOURNESS', 'path': join(repo, 'package.json'), 'output_mode': 'content', '-i': true } } },
  { tool: { name: 'Bash', arguments: { command: 'Write-Output probe-bash', timeout: 30000 } } },
  { tool: { name: 'Read', arguments: { file_path: png } } },
  { tool: { name: 'Bash', arguments: { command: `Set-Content -Path '${blocked}' -Value probe` } } },
  { text: 'done', status: true },
], 'Load TodoWrite, record one todo, read package.json, write, edit and re-read a scratch file, list, search, run a command, read an image, write a file through the shell, then reply done.', attachmentsIn(glmDir))
const glmFirst = glm.steps[0]
const glmTools = names(glmFirst)
const glmTool = name => (glmFirst?.tools ?? []).find(tool => tool.name === name)
const plainToolOf = (step, name) => (step?.tools ?? []).find(tool => tool.name === name)
const searchResult = lastToolResult(glm.steps[1])
const deferredResult = lastToolResult(glm.steps[2])
const readResult = lastToolResult(glm.steps[3])
const writeResult = lastToolResult(glm.steps[4])
const editResult = lastToolResult(glm.steps[5])
const rereadResult = lastToolResult(glm.steps[6])
const overwriteResult = lastToolResult(glm.steps[7])
const globResult = lastToolResult(glm.steps[8])
const grepResult = lastToolResult(glm.steps[9])
const bashResult = lastToolResult(glm.steps[10])
const imageRefusal = lastToolResult(glm.steps[11])
const blockedResult = lastToolResult(glm.steps[12])
const READ_IMAGE_LINE = '- Reads images (PNG, JPG, …) and presents them visually.'
const imageFree = steps => steps.every(step => step.messages.every(message => message.images === undefined) && step.wire?.images?.length === 0)

// GLM-5.3-Flash declares image input: Read of the PNG goes through
// read_image, the image block reaches the adapter, and the glm-zcode encoder
// places it inside tool_result as a base64 image block.
const flashDir = join(runDir, 'glm-flash')
const flash = runScenario('glm-flash', 'glm-5.3-flash', [
  { tool: { name: 'Read', arguments: { file_path: png } } },
  { text: 'done' },
], 'Read the image and reply done.', attachmentsIn(flashDir))
const flashRead = lastToolResult(flash.steps[1])
const flashWire = flash.steps[1]?.wire
const properties = tool => Object.keys(tool?.parameters.properties ?? {})
const firstAnnouncement = announcements(glmFirst)[0]
const zcodeSchema = 'https://json-schema.org/draft/2020-12/schema'

// GLM todo reminder (ZCode 10/10 over assistant turns): record one todo,
// then ten assistant turns of two parallel Read calls each. Counting per
// assistant turn opens the gate exactly before the twelfth request; counting
// per tool call would have fired around the sixth.
const todo = runScenario('glm-todo', 'glm-5.3', [
  { tool: { name: 'DeferredToolCall', arguments: { name: 'TodoWrite', input: { todos: [{ content: 'probe todo', status: 'in_progress', priority: 'high' }] } } } },
  ...Array.from({ length: 10 }, () => ({ tools: [0, 1].map(() => ({ name: 'Read', arguments: { file_path: join(repo, 'package.json') } })) })),
  { text: 'done' },
], 'Record one todo, read package.json twice per turn ten times, then reply done.')
const todoReminders = step => (step?.messages ?? []).filter(message => message.role === 'user' && message.source === 'glm-todo-reminder')
const todoReminderSteps = todo.steps.flatMap((step, index) => todoReminders(step).length > 0 ? [index + 1] : [])
const todoFinal = todo.steps[11]
const todoNotice = todoReminders(todoFinal)[0]
const todoNoticeIndex = todoFinal?.messages.findIndex(message => message === todoNotice) ?? -1
const todoLastResult = todoFinal?.messages.findLastIndex(message => message.role === 'tool') ?? -1
const todoParallel = todo.steps[2]?.messages.findLast(message => message.role === 'assistant')?.toolCalls

// GLM compaction: a low pressure threshold makes compaction-basic compact
// at the second step boundary (sandbox overlay only).
const compacted = runScenario('glm-compact', 'glm-5.3', [
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } } },
  { text: 'done', status: true },
], 'Read package.json and reply done.', [
  '- id: compaction-basic',
  '  config: { thresholdRatio: 0.02, retainTokens: 0 }',
])
// Guard, quote-aware reading and the workspace-change fallback (shadow
// mode): the session runs in a scratch git repository with
// dsh-workspace-changes mounted (the desktop profile has it through
// dsh-web-app; the sandbox template does not). Quoted arrows and a git
// subcommand run; a .NET file write the reader cannot see runs too and must
// leave one shadow record naming that file, not the file Write created.
const shadowDir = join(runDir, 'glm-shadow')
const shadowWs = join(shadowDir, 'ws')
mkdirSync(shadowWs, { recursive: true })
writeFileSync(join(shadowWs, 'README.md'), 'probe workspace\n')
const gitReady = initRepo(shadowWs)
const shadowFile = join(shadowWs, 'shadow.txt')
const toolFile = join(shadowWs, 'tool.txt')
const dotnetWrite = `[System.IO.File]::WriteAllText('${slash(shadowFile)}', 'probe')`
const shadow = runScenario('glm-shadow', 'glm-5.3', [
  { tool: { name: 'Bash', arguments: { command: 'Write-Output \'a => b -> c >>> d\'' } } },
  { tool: { name: 'Bash', arguments: { command: 'git log -1 --format="%s => %h"' } } },
  { tool: { name: 'Bash', arguments: { command: dotnetWrite } } },
  { tool: { name: 'Write', arguments: { file_path: toolFile, content: 'tool\n' } } },
  { text: 'done', status: true },
], 'Run three commands, write a file, then reply done.', workspaceChangesRow('glm-hourness-probe/workspace-changes'), shadowWs)
const arrowsResult = lastToolResult(shadow.steps[1])
const gitResult = lastToolResult(shadow.steps[2])
const dotnetResult = lastToolResult(shadow.steps[3])

const plain = runScenario('non-glm', 'deepseek-probe', [{ text: 'done', status: true }], 'Reply done.')
const plainFirst = plain.steps[0]
const plainTools = names(plainFirst)

// Calibration run bounds (scripts/calibrate/limits.mjs, ROADMAP M1.7). The
// step limit rejects the third step of a script that would read forever;
// the time limit cancels the agent five seconds after its creation, in the
// middle of a 60-second shell command, and rejects every later step.
const limitsRecord = scenario => join(runDir, scenario, 'limits.jsonl')
const stepLimited = runScenario('limits-steps', 'glm-5.3', [
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } } },
], 'Read package.json until stopped.', limitsRow({ maxSteps: 2, record: slash(limitsRecord('limits-steps')) }))
const timeLimited = runScenario('limits-time', 'glm-5.3', [
  { tool: { name: 'Bash', arguments: { command: 'Start-Sleep -Seconds 60; Write-Output slept', timeout: 120000 } } },
  { text: 'done' },
], 'Sleep, then reply done.', limitsRow({ timeLimitMs: 5000, record: slash(limitsRecord('limits-time')) }))

const compactRequest = compacted.compactions[0]
const compactInstruction = compactRequest?.messages.at(-1)
const checkpoint = compacted.steps.at(-1)?.messages.find(message => message.source === 'compact-checkpoint')

// The memory row journals one usage record per model call from the
// llm/stream request fields (rc.3 GenerateOptions: provider, model,
// sessionId, purpose) into the user-level directory the data row provides
// (<DSH home>/glm-hourness, the scenario's dsh-home); the guard journals
// each denial into the project directory it reads from the data service.
const jsonl = file => existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(line => line.length > 0).map(line => JSON.parse(line)) : []
const usageOf = scenario => jsonl(join(runDir, scenario, 'dsh-home', 'glm-hourness', 'audit', 'usage.jsonl'))
const glmUsage = usageOf('glm').filter(record => record.purpose === undefined)
const compactUsage = usageOf('glm-compact').filter(record => record.purpose === 'compaction')
const projectUsage = ['glm', 'glm-flash', 'glm-todo', 'glm-compact', 'glm-shadow', 'non-glm', 'limits-steps', 'limits-time'].filter(scenario => existsSync(join(runDir, scenario, 'home', 'audit', 'usage.jsonl')))
const glmViolations = jsonl(join(glmDir, 'home', 'audit', 'violations.jsonl'))
const stepLimits = jsonl(limitsRecord('limits-steps'))
const timeLimits = jsonl(limitsRecord('limits-time'))
const realUsageAfter = usageStamp()
// The workflow row journals dispatch calls by tool name; the names must be
// the ones the rc.3 composition registers.
const plainSubagentTools = [...plainTools].filter(name => name === 'subagent' || name === 'subagent_fork')

// Row health: the probe provider ran the bundle's /glm-status handler for
// the session at the last scripted step of a scenario. Each table line is
// `| row | status | reason |`.
const statusStep = scenario => scenario.steps.findLast(step => step.status !== undefined)
const healthOf = (scenario) => {
  const step = statusStep(scenario)
  const lines = (step?.status ?? '').split('\n').filter(line => HEALTH_ROWS.some(row => line.startsWith(`| ${row} | `)))
  return Object.fromEntries(lines.map((line) => {
    const [row, status, ...reason] = line.slice(2, -2).split(' | ')
    return [row, { status, reason: reason.join(' | ') }]
  }))
}
const glmHealth = healthOf(glm)
const plainHealth = healthOf(plain)
const compactHealth = healthOf(compacted)
const shadowHealth = healthOf(shadow)
const shadowRecords = jsonl(join(shadowDir, 'home', 'audit', 'violations.jsonl'))
const GUARD_SECTION = '# Workspace rules\nThe harness checks every tool call against these rules before it runs;'
const glmStatusText = statusStep(glm)?.status ?? ''
const healthLine = (health, row) => health[row] === undefined ? `${row}: missing` : `${row}: ${health[row].status}`
const ACTED = '生效'
const IDLE = '已加载，本会话未触发'
const conversationTexts = [glm, plain, compacted, shadow].flatMap(scenario => scenario.steps.flatMap(step => [step.system, ...step.messages.map(message => message.text)]))


const checks = [
  ['glm boot: the runtime reached the probe provider', glmFirst !== undefined, `exit ${glm.status}, ${glm.steps.length} step(s)`],
  ['glm prompt: ZCode CLI prefix in the system prompt', glmFirst?.system.includes('You are ZCode, an interactive coding agent') === true, glmFirst === undefined ? 'no request' : glmFirst.system.slice(0, 80).replace(/\n/g, ' ')],
  ['glm prompt: DSH identity replaced', glmFirst !== undefined && !glmFirst.system.includes('powered by DeepSeek Harness'), ''],
  ['glm tools: ZCode-facing aliases present', zcodeFace.every(name => glmTools.has(name)), zcodeFace.filter(name => !glmTools.has(name)).join(', ') || 'all present'],
  ['glm tools: covered natives hidden', nativeFace.every(name => !glmTools.has(name)), nativeFace.filter(name => glmTools.has(name)).join(', ') || 'none visible'],
  ['glm tools: search controls present, deferred tools out of the face', searchControls.every(name => glmTools.has(name)) && !glmTools.has('TodoWrite') && !glmTools.has('web_fetch'), [...glmTools].filter(name => ['TodoWrite', 'web_fetch'].includes(name)).join(', ') || `${glmTools.size} tools`],
  ['glm announcement: deferred names announced in the first request', firstAnnouncement?.text.includes('available via LocalToolSearch') === true && firstAnnouncement.text.includes('\nTodoWrite\n'), firstAnnouncement === undefined ? 'no notice' : firstAnnouncement.text.slice(0, 80).replace(/\n/g, ' ')],
  ['glm announcement: not repeated on later steps', announcements(glm.steps.at(-1)).length === 1, `${announcements(glm.steps.at(-1)).length} notice(s) in the last request`],
  ['glm search: LocalToolSearch returned the definition and the loaded reminder', searchResult !== undefined && searchResult.isError !== true && searchResult.text.includes('<functions>\n<function>{"description":') && searchResult.text.includes('Loaded: TodoWrite. Call it now with DeferredToolCall'), searchResult === undefined ? 'no tool result' : searchResult.text.slice(0, 80).replace(/\n/g, ' ')],
  ['glm deferred call: DeferredToolCall ran TodoWrite', deferredResult !== undefined && deferredResult.isError !== true && deferredResult.text.length > 0, deferredResult === undefined ? 'no tool result' : deferredResult.text.slice(0, 80).replace(/\n/g, ' ')],
  ['glm tools: Read, Write and Edit carry the ZCode 3.16.3 descriptions and schemas', glmTool('Read')?.description.startsWith('Reads a file from the local filesystem.\n\n- `file_path` must be an absolute path.') === true && !glmTool('Read').description.includes('Reads videos') && glmTool('Write')?.description.startsWith('Writes a file to the local filesystem, overwriting if one exists.') === true && glmTool('Edit')?.description.startsWith('Performs exact string replacement in a file.') === true && ['Read', 'Write', 'Edit'].every(name => glmTool(name)?.parameters.$schema === zcodeSchema), ['Read', 'Write', 'Edit'].map(name => `${name}: ${(glmTool(name)?.description ?? 'missing').slice(0, 30)}`).join('; ')],
  ['glm tools: Write and Edit declare the native sandbox escalation fields exactly when the natives do', ['write', 'edit'].every((nativeName) => {
    const nativeHas = plainToolOf(plainFirst, nativeName)?.parameters.properties?.sandbox_permissions !== undefined
    const aliasHas = glmTool(nativeName === 'write' ? 'Write' : 'Edit')?.parameters.properties?.sandbox_permissions !== undefined
    return plainFirst !== undefined && nativeHas === aliasHas
  }), `native write escalation: ${plainToolOf(plainFirst, 'write')?.parameters.properties?.sandbox_permissions !== undefined}`],
  ['glm execution: Read alias returned the file in cat -n form', readResult !== undefined && readResult.isError !== true && readResult.text.startsWith('1\t{\n') && readResult.text.includes('\t  "name": "dsh-glm-hourness",'), readResult === undefined ? 'no tool result' : readResult.text.slice(0, 80).replace(/\n/g, ' ')],
  ['glm execution: Write alias created the file with the ZCode result text', writeResult !== undefined && writeResult.isError !== true && writeResult.text.startsWith('File created successfully at: ') && writeResult.text.endsWith('no need to Read it back)'), writeResult === undefined ? 'no tool result' : writeResult.text.slice(0, 80).replace(/\n/g, ' ')],
  ['glm execution: Edit alias replaced all occurrences (replace_all "true")', editResult !== undefined && editResult.isError !== true && editResult.text.includes('has been updated. All occurrences were successfully replaced.'), editResult === undefined ? 'no tool result' : editResult.text.slice(0, 100).replace(/\n/g, ' ')],
  ['glm execution: Read alias shows the edited file (offset 0 reads from line 1)', rereadResult !== undefined && rereadResult.isError !== true && rereadResult.text === '1\tgamma beta gamma', rereadResult === undefined ? 'no tool result' : rereadResult.text.slice(0, 80).replace(/\n/g, ' ')],
  ['glm execution: Write over an existing file that was never read fails and leaves it intact', overwriteResult?.isError === true && readFileSync(unread, 'utf8') === 'existing\n', overwriteResult === undefined ? 'no tool result' : overwriteResult.text.slice(0, 100).replace(/\n/g, ' ')],
  ['glm tools: Glob, Grep, Bash and TodoWrite carry the 3.16.3 texts with the documented localizations', glmTool('Glob')?.description.startsWith('Fast file pattern matching. Supports glob patterns like') === true
    && glmTool('Grep')?.description.startsWith('Content search built on ripgrep.') === true && !glmTool('Grep').description.includes('multiline')
    && properties(glmTool('Grep')).includes('-i') && properties(glmTool('Grep')).includes('type') && !properties(glmTool('Grep')).some(key => ['-A', '-B', '-C', 'context', '-o', 'multiline'].includes(key))
    && glmTool('Bash')?.description.startsWith('Executes a PowerShell command and returns its output.') === true && properties(glmTool('Bash')).includes('timeout') && !properties(glmTool('Bash')).includes('dangerouslyDisableSandbox')
    && ['Glob', 'Grep', 'Bash'].every(name => glmTool(name)?.parameters.$schema === zcodeSchema)
    && searchResult?.text.includes('Create and update a task list for the current session.') === true, ['Glob', 'Grep', 'Bash'].map(name => `${name}: ${(glmTool(name)?.description ?? 'missing').slice(0, 30)}`).join('; ')],
  ['glm tools: Bash declares run_in_background and the escalation fields exactly when pwsh does', ['run_in_background', 'sandbox_permissions', 'justification'].every(field => plainFirst !== undefined && properties(plainToolOf(plainFirst, 'pwsh')).includes(field) === properties(glmTool('Bash')).includes(field)), `Bash: ${properties(glmTool('Bash')).join(', ')}`],
  ['glm execution: Glob lists both scratch files newest first with ZCode display paths', globResult !== undefined && globResult.isError !== true && /\/glm\/scratch\.txt\n.*\/glm\/unread\.txt$/.test(globResult.text) && !globResult.text.includes('\\'), globResult === undefined ? 'no tool result' : globResult.text.slice(0, 160).replace(/\n/g, ' | ')],
  ['glm execution: Grep -i in content mode returns the package name line', grepResult !== undefined && grepResult.isError !== true && grepResult.text === 'package.json:2:  "name": "dsh-glm-hourness",', grepResult === undefined ? 'no tool result' : grepResult.text.slice(0, 100).replace(/\n/g, ' | ')],
  ['glm execution: Bash ran the command through pwsh without a description', bashResult !== undefined && bashResult.isError !== true && bashResult.text.includes('probe-bash'), bashResult === undefined ? 'no tool result' : bashResult.text.slice(0, 100).replace(/\n/g, ' | ')],
  ['glm image: Read keeps the ZCode image line on both models (ZCode does not condition it on image input)', glmTool('Read')?.description.includes(READ_IMAGE_LINE) === true && (flash.steps[0]?.tools ?? []).find(tool => tool.name === 'Read')?.description.includes(READ_IMAGE_LINE) === true, `flash steps: ${flash.steps.length}`],
  ['glm image: on text-only GLM-5.3 read_image refuses the PNG and no image reaches the request', imageRefusal?.isError === true && imageRefusal.text.includes('does not declare image input') && imageFree(glm.steps), imageRefusal === undefined ? 'no tool result' : imageRefusal.text.slice(0, 120).replace(/\n/g, ' ')],
  ['glm-flash image: Read returns the read_image envelope with one image block', flashRead !== undefined && flashRead.isError !== true && flashRead.images === 1 && flashRead.text.includes('<type>image</type>'), flashRead === undefined ? `no tool result (exit ${flash.status})` : `${flashRead.images ?? 0} image(s): ${flashRead.text.slice(0, 80).replace(/\n/g, ' ')}`],
  ['glm-flash wire: the glm-zcode encoder sends the PNG inside tool_result as a base64 image block', flashWire?.images?.length === 1 && flashWire.images[0].where === 'tool_result' && flashWire.images[0].mediaType === 'image/png' && flashWire.images[0].png === true && flashWire.images[0].base64Length > 0, JSON.stringify(flashWire ?? null)],
  ['glm todo: a scripted turn carries two parallel tool calls', todoParallel?.length === 2, `steps: ${todo.steps.length}, calls in the first Read turn: ${todoParallel?.join(', ') ?? 'none'}`],
  ['glm todo: the reminder fires once, before the twelfth request (10 assistant turns after TodoWrite)', todo.steps.length === 12 && todoReminderSteps.length === 1 && todoReminderSteps[0] === 12, `reminder in request(s): ${todoReminderSteps.join(', ') || 'none'} of ${todo.steps.length}`],
  ['glm todo: the reminder is the wrapped ZCode text with the todo echo, after the last tool results', todoNotice !== undefined && todoNotice.text.startsWith("<system-reminder>\nThe TodoWrite tool hasn't been used recently.") && todoNotice.text.endsWith('[1. [in_progress] probe todo]\n</system-reminder>') && todoNoticeIndex > todoLastResult, todoNotice === undefined ? 'no notice' : `${todoNotice.text.slice(-60).replace(/\n/g, ' ')} (at ${todoNoticeIndex}, last tool result at ${todoLastResult})`],
  ['glm compact: the summarization request ends with the ZCode compact prompt', compactInstruction?.role === 'user' && compactInstruction.text.startsWith('CRITICAL: Respond with TEXT ONLY.'), compactRequest === undefined ? `no compaction request (exit ${compacted.status})` : compactInstruction?.text.slice(0, 60).replace(/\n/g, ' ')],
  ['glm compact: the checkpoint carries the formatted summary', checkpoint !== undefined && checkpoint.text.includes('Summary:\nprobe summary') && !checkpoint.text.includes('<analysis>'), checkpoint === undefined ? 'no checkpoint in the next request' : checkpoint.text.slice(0, 80).replace(/\n/g, ' ')],
  ['memory usage: one record per GLM step with the request provider, model and session id', glmUsage.length === glm.steps.length && glmUsage.every(record => record.provider === 'glm-probe' && record.model === 'glm-5.3' && typeof record.sessionId === 'string' && record.sessionId.length > 0), `${glmUsage.length} record(s) for ${glm.steps.length} step(s); first: ${JSON.stringify(glmUsage[0] ?? null).slice(0, 120)}`],
  ['memory usage: the compaction call is recorded with purpose compaction', compactUsage.length === compacted.compactions.length && compactUsage.length > 0, `${compactUsage.length} compaction record(s) for ${compacted.compactions.length} request(s)`],
  ['data: usage lands only in the user-level directory, never in a project directory or the real one', projectUsage.length === 0 && realUsageBefore === realUsageAfter, `project usage files: ${projectUsage.join(', ') || 'none'}; real ${realUsage}: ${realUsageBefore} -> ${realUsageAfter}`],
  ['guard: a shell write is denied with the four-part correction and the file is not created', blockedResult?.isError === true && blockedResult.text.includes('Shell file writes are not permitted') && !existsSync(blocked), blockedResult === undefined ? 'no tool result' : blockedResult.text.slice(0, 100).replace(/\n/g, ' ')],
  ['guard: the denial is journaled in the scenario project directory with rule, tool and the calling agent ids', glmViolations.length === 1 && glmViolations[0].rule === 'file-tools-only' && glmViolations[0].tool === 'Bash' && typeof glmViolations[0].agentId === 'string' && glmViolations[0].agentId.length > 0 && glmViolations[0].sessionId === glmUsage[0]?.sessionId, `${glmViolations.length} record(s); first: ${JSON.stringify(glmViolations[0] ?? null).slice(0, 140)}`],
  ['guard: the GLM system prompt declares the active rules (containment and file-tools-only) after the dialect sections; the non-GLM prompt does not', glmFirst?.system.includes(GUARD_SECTION) === true && glmFirst.system.includes('\n- You may only create and modify files inside the user\'s workspace.') && glmFirst.system.includes('\n- Modify files and code only with the dedicated Write/Edit tools.') && glmFirst.system.indexOf(GUARD_SECTION) > glmFirst.system.indexOf('# Context management') && plainFirst !== undefined && !plainFirst.system.includes('# Workspace rules'), glmFirst === undefined ? 'no request' : `section at ${glmFirst.system.indexOf(GUARD_SECTION)} of ${glmFirst.system.length}`],
  ['guard: quoted =>, -> and >>> and a git subcommand with a quoted arrow run through Bash', arrowsResult !== undefined && arrowsResult.isError !== true && arrowsResult.text.includes('a => b -> c >>> d') && gitResult !== undefined && gitResult.isError !== true && gitResult.text.includes('init => '), `${(arrowsResult?.text ?? 'no tool result').slice(0, 60).replace(/\n/g, ' ')} | ${(gitResult?.text ?? 'no tool result').slice(0, 60).replace(/\n/g, ' ')}`],
  ['guard shadow: a .NET file write the reader cannot see runs, and Write creates its file (shadow mode never blocks)', gitReady && dotnetResult !== undefined && dotnetResult.isError !== true && existsSync(shadowFile) && existsSync(toolFile), `git repo: ${gitReady}; ${(dotnetResult?.text ?? 'no tool result').slice(0, 80).replace(/\n/g, ' ')}`],
  ['guard shadow: one shadow record names the shell-written file, not the Write target, with the turn, the session and the three shell calls', shadowRecords.length === 1 && shadowRecords[0].mode === 'shadow' && shadowRecords[0].rule === 'file-tools-only' && JSON.stringify(shadowRecords[0].paths) === '["shadow.txt"]' && typeof shadowRecords[0].turn === 'number' && shadowRecords[0].calls?.length === 3 && shadowRecords[0].calls.some(call => call.tool === 'Bash' && call.command === dotnetWrite) && shadowRecords[0].sessionId === statusStep(shadow)?.sessionId, `${shadowRecords.length} record(s); first: ${JSON.stringify(shadowRecords[0] ?? null).slice(0, 200)}`],
  ['health: the guard names the shadow fallback: on with workspace-changes mounted, off without it', shadowHealth.guard?.status === ACTED && shadowHealth.guard.reason.endsWith('影子兜底：工作区变更记录') && glmHealth.guard?.reason.endsWith('影子兜底未启用（组合里没有 workspace-changes）') === true, `${JSON.stringify(shadowHealth.guard ?? null)} | ${JSON.stringify(glmHealth.guard ?? null)}`],
  ['workflow: the runtime subagent tools are journaled dispatch names', plainSubagentTools.length === 2 && plainSubagentTools.every(name => DISPATCH_TOOLS.includes(name)), `runtime subagent tools: ${plainSubagentTools.join(', ') || 'none'}`],
  ['health: /glm-status prints the credential line and the health table of the session, one line per bundle row', glmStatusText.startsWith('glm-zcode：未登录（套餐 coding-plan）') && glmStatusText.includes(`## 行健康（会话 ${statusStep(glm)?.sessionId}）`) && HEALTH_ROWS.every(row => glmHealth[row] !== undefined) && Object.keys(glmHealth).length === HEALTH_ROWS.length, `${Object.keys(glmHealth).length} row(s); ${glmStatusText.split('\n')[0]}`],
  ['health: on the GLM route glm-prompt, guard, memory, workflow, data and glm-login report in effect; glm-compact and hourness have not acted', glmHealth['glm-prompt']?.status === ACTED && glmHealth['glm-prompt'].reason.startsWith('GLM 路由 glm-probe/glm-5.3：') && ['guard', 'memory', 'workflow', 'data', 'glm-login'].every(row => glmHealth[row]?.status === ACTED) && ['glm-compact', 'hourness'].every(row => glmHealth[row]?.status === IDLE), HEALTH_ROWS.map(row => healthLine(glmHealth, row)).join('; ')],
  ['health: on the non-GLM route glm-prompt reports why it is not in effect', plainHealth['glm-prompt']?.status === '未生效' && plainHealth['glm-prompt'].reason.startsWith('非 GLM 路由 glm-probe/deepseek-probe'), JSON.stringify(plainHealth['glm-prompt'] ?? null)],
  ['health: after a GLM compaction glm-compact reports the mirror in effect', compactHealth['glm-compact']?.status === ACTED && compactHealth['glm-compact'].reason.startsWith('GLM 压缩请求改用 ZCode 指令'), JSON.stringify(compactHealth['glm-compact'] ?? null)],
  ['health: the reports stay out of the model-visible conversation', conversationTexts.length > 0 && conversationTexts.every(text => !text.includes('行健康') && !text.includes('glmHournessHealth')), `${conversationTexts.length} text(s) checked`],
  ['calibration limits: the step past maxSteps is rejected, the turn ends blocked and the run exits non-zero', stepLimited.steps.length === 2 && stepLimits.length === 1 && stepLimits[0].kind === 'step-limit' && stepLimited.status !== 0, `exit ${stepLimited.status}, ${stepLimited.steps.length} step(s), record: ${JSON.stringify(stepLimits)}`],
  ['calibration limits: the time limit cancels a running 60-second shell command and no later step runs', timeLimited.steps.length === 1 && timeLimits.length === 1 && timeLimits[0].kind === 'time-limit' && timeLimited.elapsedMs < 45_000 && timeLimited.status !== 0, `exit ${timeLimited.status} after ${Math.round(timeLimited.elapsedMs / 1000)} s, ${timeLimited.steps.length} step(s), record: ${JSON.stringify(timeLimits)}`],
  ['non-glm boot: the runtime reached the probe provider', plainFirst !== undefined, `exit ${plain.status}, ${plain.steps.length} step(s)`],
  ['non-glm prompt: DSH identity untouched', plainFirst?.system.includes('powered by DeepSeek Harness') === true && !plainFirst.system.includes('You are ZCode'), ''],
  ['non-glm tools: natives present, no aliases', plainFirst !== undefined && nativeFace.every(name => plainTools.has(name)) && zcodeFace.every(name => !plainTools.has(name)), zcodeFace.filter(name => plainTools.has(name)).join(', ') || ''],
  ['non-glm tools: no search controls, no announcement', plainFirst !== undefined && searchControls.every(name => !plainTools.has(name)) && announcements(plainFirst).length === 0, ''],
]

let failed = 0
for (const [label, ok, detail] of checks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}
console.log(`probe: ${checks.length - failed}/${checks.length} passed; run artifacts in ${runDir}`)
process.exit(failed === 0 ? 0 : 1)
