/**
 * L3 behavior probe (docs/DEVELOPMENT.md §3, ROADMAP M1.7): boots the real
 * desktop DSH runtime headless on the glmsandbox profile with the probe
 * provider (scripts/probe/probe-llm.mjs), runs scripted tasks, and checks
 * what the GLM-Hourness rows actually did to the model-visible request.
 *
 * Scenarios: a GLM route must get the ZCode dialect; a non-GLM route through
 * the same provider must stay untouched (no cross-route pollution).
 *
 * Usage: node scripts/probe/run-probe.mjs
 * Requires the desktop install (DSH_DESKTOP_DIR overrides the location) and
 * the glmsandbox profile linked to this repository. Each run writes its
 * overlays, request dumps and logs under .llm/probe-runs/<timestamp>/
 * (gitignored).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

const repo = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const desktop = process.env.DSH_DESKTOP_DIR ?? join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DeepSeek Harness')
const exe = join(desktop, 'DeepSeek Harness.exe')
const bin = join(desktop, 'resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
if (!existsSync(exe)) {
  console.error(`probe: desktop runtime not found at ${exe} (set DSH_DESKTOP_DIR)`)
  process.exit(2)
}

const runDir = join(repo, '.llm', 'probe-runs', new Date().toISOString().replace(/[:.]/g, '-'))
const slash = path => path.replaceAll('\\', '/')

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

/** Overlay lines that keep the attachment store of a scenario inside its own directory. */
const attachmentsIn = dir => ['- id: attachment-local', `  config: { dshHome: ${JSON.stringify(slash(join(dir, 'dsh-home')))} }`]

/**
 * Boot one headless task on `model` with a scripted reply sequence and return
 * the main agent's step requests plus the compaction requests (the
 * session-title request carries no tools). `overlay` adds patch lines.
 */
function runScenario(name, model, script, task, overlay = []) {
  const dir = join(runDir, name)
  const home = join(dir, 'home')
  mkdirSync(home, { recursive: true })
  const dump = join(dir, 'requests.jsonl')
  writeFileSync(dump, '')
  // The overlay is generated per run with literal values: the loader validates
  // a row's `name` before `!!js` expressions evaluate, so paths cannot be
  // computed inside the patch. JSON strings are valid YAML scalars.
  const patch = join(dir, 'probe.patch.yml')
  writeFileSync(patch, [
    '- id: agent-default-model',
    `  config: { provider: glm-probe, model: ${JSON.stringify(model)} }`,
    ...['memory', 'workflow', 'hourness'].flatMap(row => [`- id: glm-hourness/${row}`, `  config: { home: ${JSON.stringify(slash(home))} }`]),
    '- insert:',
    '    - id: glm-hourness-probe/llm',
    `      name: ${JSON.stringify(slash(join(repo, 'scripts', 'probe', 'probe-llm.mjs')))}`,
    '      inject: [llm]',
    `      config: { dump: ${JSON.stringify(slash(dump))}, script: ${JSON.stringify(JSON.stringify(script))} }`,
    ...overlay,
    '',
  ].join('\n'))
  const result = spawnSync(exe, [bin, '--profile', 'glmsandbox', '--patch', patch, task], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 180_000,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  writeFileSync(join(dir, 'stdout.txt'), result.stdout ?? '')
  writeFileSync(join(dir, 'stderr.txt'), result.stderr ?? '')
  const requests = readFileSync(dump, 'utf8').split('\n').filter(line => line.length > 0).map(line => JSON.parse(line))
  return {
    status: result.status,
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
// PNG (GLM-5.3 is text-only, so read_image refuses), finish.
// The scratch files live in the scenario directory inside the workspace.
const glmDir = join(runDir, 'glm')
mkdirSync(glmDir, { recursive: true })
const scratch = join(glmDir, 'scratch.txt')
const unread = join(glmDir, 'unread.txt')
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
  { text: 'done' },
], 'Load TodoWrite, record one todo, read package.json, write, edit and re-read a scratch file, list, search, run a command, read an image, then reply done.', attachmentsIn(glmDir))
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

// GLM compaction: a low pressure threshold makes compaction-basic compact
// at the second step boundary (sandbox overlay only).
const compacted = runScenario('glm-compact', 'glm-5.3', [
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } } },
  { text: 'done' },
], 'Read package.json and reply done.', [
  '- id: compaction-basic',
  '  config: { thresholdRatio: 0.02, retainTokens: 0 }',
])
const plain = runScenario('non-glm', 'deepseek-probe', [{ text: 'done' }], 'Reply done.')
const plainFirst = plain.steps[0]
const plainTools = names(plainFirst)

const compactRequest = compacted.compactions[0]
const compactInstruction = compactRequest?.messages.at(-1)
const checkpoint = compacted.steps.at(-1)?.messages.find(message => message.source === 'compact-checkpoint')



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
  ['glm compact: the summarization request ends with the ZCode compact prompt', compactInstruction?.role === 'user' && compactInstruction.text.startsWith('CRITICAL: Respond with TEXT ONLY.'), compactRequest === undefined ? `no compaction request (exit ${compacted.status})` : compactInstruction?.text.slice(0, 60).replace(/\n/g, ' ')],
  ['glm compact: the checkpoint carries the formatted summary', checkpoint !== undefined && checkpoint.text.includes('Summary:\nprobe summary') && !checkpoint.text.includes('<analysis>'), checkpoint === undefined ? 'no checkpoint in the next request' : checkpoint.text.slice(0, 80).replace(/\n/g, ' ')],
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
