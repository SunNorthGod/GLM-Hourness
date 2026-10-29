import assert from 'node:assert/strict'
import { sep } from 'node:path'
import test from 'node:test'
import { aliasSpecs, bashDescription, bashSchema, buildAlias, buildAliases, semanticBoolean, semanticNumber } from '../src/glm-prompt/aliases.ts'
import { buildReadAlias, fileExtension, mapReadArgs, readDescription, renderReadWindow } from '../src/glm-prompt/read-alias.ts'
import { globResultText, GREP_DESCRIPTION, GREP_SCHEMA, grepNativeCalls, grepResultText, splitGlobPatterns, typeGlobPattern, zcodeDisplayPath } from '../src/glm-prompt/search-alias.ts'
import { READ_IMAGE_LINE, READ_INPUT_SCHEMA, READ_VIDEO_LINE, readPartialViewNotice, TODO_WRITE_DESCRIPTION, TODO_WRITE_INPUT_SCHEMA } from '../src/glm-prompt/zcode-tool-text.ts'
import { installDialect } from '../src/glm-prompt/index.ts'
import type { ToolDefinitionLike } from '../src/shared/dsh-min.ts'
import { fakeRuntime, NATIVE_NAMES } from './fake-rc3.ts'

const spec = (name: string) => aliasSpecs.find(candidate => candidate.zcodeName === name)!

/**
 * rc.3-shaped natives (dsh-tool-fs output values and escalation fields).
 * `calls` records the arguments each native body receives; `metaArgs` the
 * arguments presentationMeta receives.
 */
interface Recorder { calls: Array<{ name: string, args: unknown }>, metaArgs: unknown[] }
const recorder = (): Recorder => ({ calls: [], metaArgs: [] })
const ESCALATION = {
  sandbox_permissions: { type: 'string', description: 'The narrowest wider sandbox mode for a one-shot retry of the exact operation the sandbox just denied; the retry asks the user for approval.', enum: ['workspace-write', 'danger-full-access'] },
  justification: { type: 'string', description: 'Required with sandbox_permissions: one sentence for the user explaining why this exact file operation needs the wider access.' },
}
function native(name: string, rec: Recorder, value: (args: unknown) => unknown, options: { escalation?: boolean, schema?: Record<string, unknown>, properties?: Record<string, unknown> } = {}): ToolDefinitionLike {
  return {
    name,
    description: `native ${name}`,
    parameters: { type: 'object', properties: { file_path: { type: 'string' }, ...options.properties, ...(options.escalation === true ? ESCALATION : {}) }, required: ['file_path'] },
    output: {
      schema: options.schema ?? { type: 'object' },
      render: (args, result) => [{ type: 'text', text: `native ${name} ${JSON.stringify(args)} ${JSON.stringify(result)}` }],
      presentationMeta: (args) => { rec.metaArgs.push(args); return { from: name } },
    },
    async execute(args) { rec.calls.push({ name, args }); return value(args) },
  }
}
const READ_SCHEMA = { type: 'object', properties: { path: { type: 'string' }, offset: { type: 'integer' }, lines: { type: 'array' }, totalLines: { type: 'integer' } }, required: ['path', 'offset', 'lines', 'totalLines'], additionalProperties: false }
const IMAGE_SCHEMA = { type: 'object', properties: { path: { type: 'string' }, image: { type: 'object' } }, required: ['path', 'image'], additionalProperties: false }
const readNative = (rec: Recorder) => native('read', rec, args => ({ path: 'C:/ws/a.json', offset: (args as { offset?: number }).offset ?? 1, lines: [{ number: 1, text: '{' }, { number: 2, text: '}' }], totalLines: 2 }), { schema: READ_SCHEMA })
const imageNative = (rec: Recorder) => native('read_image', rec, args => ({ path: (args as { file_path: string }).file_path, image: { attachmentId: 'a1', mediaType: 'image/png', bytes: 1, width: 1, height: 1 } }), { schema: IMAGE_SCHEMA })

test('Write, Edit, Glob, Grep and Bash are single-native aliases; Read is built over read and read_image', () => {
  assert.deepEqual(aliasSpecs.map(candidate => candidate.zcodeName), ['Write', 'Edit', 'Glob', 'Grep', 'Bash'])
})

// ZCode 3.16.3 provider forms: the descriptions from the tool entries and the
// toToolJsonSchema output of the contract input objects (zod-to-json-schema 3.25.2).

test('Read, Write and Edit carry the 3.17.1 descriptions and schemas', () => {
  assert.equal(readDescription(true), [
    'Reads a file from the local filesystem.',
    '',
    '- `file_path` must be an absolute path.',
    '- Reads up to 2000 lines by default.',
    '- When you already know which part of the file you need, only read that part. This can be important for larger files.',
    '- Results are returned using cat -n format, with line numbers starting at 1',
    '- Reads images (PNG, JPG, \u2026) and presents them visually.',
    '- Reading a directory, a missing file, or an empty file returns an error or system reminder rather than content.',
    '- Do NOT re-read a file you just edited to verify \u2014 Edit/Write would have errored if the change failed, and the harness tracks file state for you.',
  ].join('\n'))
  assert.equal(JSON.stringify(READ_INPUT_SCHEMA), '{"type":"object","properties":{"file_path":{"type":"string","description":"The absolute path to the file to read"},"offset":{"type":"integer","minimum":0,"maximum":9007199254740991,"description":"The line number to start reading from. Only provide if the file is too large to read at once"},"limit":{"type":"integer","exclusiveMinimum":0,"maximum":9007199254740991,"description":"The number of lines to read. Only provide if the file is too large to read at once."}},"required":["file_path"],"additionalProperties":false,"$schema":"https://json-schema.org/draft/2020-12/schema"}')
  assert.equal(spec('Write').description, "Writes a file to the local filesystem, overwriting if one exists.\n\nWhen to use: creating a new file, or fully replacing one you've already Read. Overwriting an existing file you haven't Read will fail. For partial changes, use Edit instead.")
  assert.equal(JSON.stringify(spec('Write').schema), '{"type":"object","properties":{"file_path":{"type":"string","description":"The absolute path to the file to write (must be absolute, not relative)"},"content":{"type":"string","description":"The content to write to the file"}},"required":["file_path","content"],"additionalProperties":false,"$schema":"https://json-schema.org/draft/2020-12/schema"}')
  assert.equal(spec('Edit').description, 'Performs exact string replacement in a file.\n\n- You must Read the file in this conversation before editing, or the call will fail.\n- `old_string` must match the file exactly, including indentation, and be unique \u2014 the edit fails otherwise. Strip the Read line prefix (line number + tab) before matching.\n- `replace_all: true` replaces every occurrence instead.')
  assert.equal(JSON.stringify(spec('Edit').schema), '{"type":"object","properties":{"file_path":{"type":"string","description":"The absolute path to the file to modify"},"old_string":{"type":"string","description":"The text to replace"},"new_string":{"type":"string","description":"The text to replace it with (must be different from old_string)"},"replace_all":{"type":"boolean","default":false,"description":"Replace all occurrences of old_string (default false)"}},"required":["file_path","old_string","new_string"],"additionalProperties":false,"$schema":"https://json-schema.org/draft/2020-12/schema"}')
})

test('the Read description drops what DSH cannot honor: video always, images without read_image', () => {
  assert.ok(!readDescription(true).includes(READ_VIDEO_LINE))
  assert.ok(readDescription(true).includes(READ_IMAGE_LINE))
  assert.ok(!readDescription(false).includes(READ_IMAGE_LINE))
  const rec = recorder()
  assert.equal(buildReadAlias(readNative(rec), undefined).description, readDescription(false))
  assert.equal(buildReadAlias(readNative(rec), imageNative(rec)).description, readDescription(true))
})

test('Glob and TodoWrite carry the 3.16.3 descriptions and schemas', () => {
  assert.equal(spec('Glob').description, 'Fast file pattern matching. Supports glob patterns like "**/*.js" or "src/**/*.ts". Returns matching file paths sorted by modification time.')
  assert.equal(JSON.stringify(spec('Glob').schema), '{"type":"object","properties":{"pattern":{"type":"string","description":"The glob pattern to match files against"},"path":{"type":"string","description":"The directory to search in. If not specified, the current working directory will be used. IMPORTANT: Omit this field to use the default directory. DO NOT enter \\"undefined\\" or \\"null\\" - simply omit it for the default behavior. Must be a valid directory path if provided."}},"required":["pattern"],"additionalProperties":false,"$schema":"https://json-schema.org/draft/2020-12/schema"}')
  assert.equal(TODO_WRITE_DESCRIPTION, 'Create and update a task list for the current session. The list is rendered to the user as your working plan.\n\n- Each todo has `content`, `status` ("pending" | "in_progress" | "completed"), and `priority` ("high" | "medium" | "low").\n- Send the full list each call; it replaces the previous one.\n- Keep one item `in_progress` at a time and mark it `completed` when done.')
  assert.equal(JSON.stringify(TODO_WRITE_INPUT_SCHEMA), '{"type":"object","properties":{"todos":{"type":"array","items":{"type":"object","properties":{"content":{"type":"string","minLength":1,"description":"Brief description of the task"},"status":{"type":"string","enum":["pending","in_progress","completed"],"description":"Current status of the task"},"priority":{"type":"string","enum":["high","medium","low"],"description":"Priority level of the task"}},"required":["content","status","priority"],"additionalProperties":false},"description":"The complete updated todo list. At most one item may be in_progress at a time."}},"required":["todos"],"additionalProperties":false,"$schema":"https://json-schema.org/draft/2020-12/schema"}')
})

test('Grep is the 3.16.3 description and schema without what the native cannot honor', () => {
  assert.equal(spec('Grep').localized, true)
  assert.equal(GREP_DESCRIPTION, 'Content search built on ripgrep. Prefer this over `grep`/`rg` via Bash \u2014 results integrate with the permission UI and file links.\n\n- Full regex syntax (e.g. "log.*Error", "function\\s+\\w+"). Ripgrep, not grep \u2014 escape literal braces (`interface\\{\\}`).\n- Filter with `glob` (e.g. "**/*.tsx") or `type` (e.g. "js", "py", "rust").\n- `output_mode`: "content" (matching lines), "files_with_matches" (paths only, default), or "count".')
  assert.equal(JSON.stringify(GREP_SCHEMA), '{"type":"object","properties":{"pattern":{"type":"string","description":"The regular expression pattern to search for in file contents"},"path":{"type":"string","description":"File or directory to search in (rg PATH). Defaults to current working directory."},"glob":{"type":"string","description":"Glob pattern to filter files (e.g. \\"*.js\\", \\"*.{ts,tsx}\\") - maps to rg --glob"},"output_mode":{"type":"string","enum":["content","files_with_matches","count"],"description":"Output mode: \\"content\\" shows matching lines (supports -n line numbers, head_limit), \\"files_with_matches\\" shows file paths (supports head_limit), \\"count\\" shows match counts (supports head_limit). Defaults to \\"files_with_matches\\"."},"-n":{"type":"boolean","description":"Show line numbers in output (rg -n). Requires output_mode: \\"content\\", ignored otherwise. Defaults to true."},"-i":{"type":"boolean","description":"Case insensitive search (rg -i)"},"type":{"type":"string","description":"File type to search (rg --type). Common types: js, py, rust, go, java, etc. More efficient than include for standard file types."},"head_limit":{"type":"number","description":"Limit output to first N lines/entries, equivalent to \\"| head -N\\". Works across all output modes: content (limits output lines), files_with_matches (limits file paths), count (limits count entries). Defaults to 250 when unspecified. Pass 0 for unlimited (use sparingly \u2014 large result sets waste context)."},"offset":{"type":"number","description":"Skip first N lines/entries before applying head_limit, equivalent to \\"| tail -n +N | head -N\\". Works across all output modes. Defaults to 0."}},"required":["pattern"],"additionalProperties":false,"$schema":"https://json-schema.org/draft/2020-12/schema"}')
  assert.equal(spec('Grep').schema, GREP_SCHEMA)
})

test('Bash is the ZCode description and schema with only the pwsh localizations', () => {
  assert.equal(bashDescription(true), [
    'Executes a PowerShell command and returns its output.',
    '',
    "- Working directory does not persist between calls: each call starts a fresh process in the session working directory, so prefer absolute paths. Shell state (env vars, functions) does not persist; the shell starts without the user's profile.",
    '- IMPORTANT: Avoid using this tool to run `find`, `grep`, `cat`, `head`, `tail`, `sed`, `awk`, or `echo` commands, unless explicitly instructed or after you have verified that a dedicated tool cannot accomplish your task. Instead, use the appropriate dedicated tool as this will provide a much better experience for the user.',
    '- `timeout` is in milliseconds: default 120000, max 600000.',
    '- `run_in_background` runs the command detached: it keeps running across turns and re-invokes you when it exits. No `&` needed.',
    '',
    '# Git',
    '- Interactive flags (`-i`, e.g. `git rebase -i`, `git add -i`) are not supported in this environment.',
    '- Use the `gh` CLI for GitHub operations (PRs, issues, API).',
    '- Commit or push only when the user asks. If on the default branch, branch first.',
  ].join('\n'))
  assert.ok(!bashDescription(false).includes('run_in_background'))
  const field = 'Clear, concise description of what this command does in active voice. Never use words like \\"complex\\" or \\"risk\\" in the description - just describe what it does.\\n\\nFor simple commands (git, npm, standard CLI tools), keep it brief (5-10 words):\\n- ls \u2192 \\"List files in current directory\\"\\n- git status \u2192 \\"Show working tree status\\"\\n- npm install \u2192 \\"Install package dependencies\\"\\n\\nFor commands that are harder to parse at a glance (piped commands, obscure flags, etc.), add enough context to clarify what it does:\\n- find . -name \\"*.tmp\\" -exec rm {} \\\\; \u2192 \\"Find and delete all .tmp files recursively\\"\\n- git reset --hard origin/main \u2192 \\"Discard all local changes and match remote main\\"\\n- curl -s url | jq \'.data[]\' \u2192 \\"Fetch JSON from URL and extract data array elements\\"'
  assert.equal(JSON.stringify(bashSchema(true)), `{"type":"object","properties":{"command":{"type":"string","description":"The command to execute"},"timeout":{"type":"number","description":"Optional timeout in milliseconds (max 600000)"},"description":{"type":"string","description":"${field}"},"run_in_background":{"type":"boolean","description":"Set to true to run this command in the background."}},"required":["command"],"additionalProperties":false,"$schema":"https://json-schema.org/draft/2020-12/schema"}`)
  assert.deepEqual(Object.keys(bashSchema(false).properties as object), ['command', 'timeout', 'description'])
})

test('Bash follows the native: background line and field only when pwsh offers background runs, escalation fields appended', () => {
  const rec = recorder()
  const background = { run_in_background: { type: 'boolean' } }
  const full = buildAlias(spec('Bash'), native('pwsh', rec, () => ({}), { escalation: true, properties: background }))
  assert.equal(full.description, bashDescription(true))
  assert.deepEqual(Object.keys(full.parameters.properties as object), ['command', 'timeout', 'description', 'run_in_background', 'sandbox_permissions', 'justification'])
  const bare = buildAlias(spec('Bash'), native('pwsh', rec, () => ({})))
  assert.equal(bare.description, bashDescription(false))
  assert.deepEqual(bare.parameters, bashSchema(false))
})

test('Bash maps ZCode milliseconds and semantic values onto pwsh; description is derived when absent', async () => {
  const rec = recorder()
  const alias = buildAlias(spec('Bash'), native('pwsh', rec, () => ({}), { escalation: true }))
  await alias.execute({ command: 'npm test', timeout: 30000, description: 'Run tests', run_in_background: 'yes', dangerouslyDisableSandbox: true, sandbox_permissions: 'workspace-write', justification: 'needed' }, undefined)
  await alias.execute({ command: 'git status\ngit log -1', timeout: ' 45000 ' }, undefined)
  await alias.execute({ command: 'Get-ChildItem', timeout: 0, run_in_background: false }, undefined)
  await alias.execute({ command: 'x', timeout: 'soon' }, undefined)
  assert.deepEqual(rec.calls.map(call => call.args), [
    { command: 'npm test', description: 'Run tests', timeoutMs: 30000, run_in_background: true, sandbox_permissions: 'workspace-write', justification: 'needed' },
    { command: 'git status\ngit log -1', description: 'git status', timeoutMs: 45000 },
    // ZCode reads timeout 0 as the default; pwsh rejects 0, so the shim omits it.
    { command: 'Get-ChildItem', description: 'Get-ChildItem', run_in_background: false },
    // Not a number: passed on for the native to reject, as ZCode's schema would.
    { command: 'x', description: 'x', timeoutMs: 'soon' },
  ])
  assert.deepEqual([' 12 ', '', 'x', 7, null].map(value => semanticNumber(value)), [12, '', 'x', 7, null])
})

test('Glob maps pattern (trimmed) and path, and renders ZCode\'s list: newest first, display paths, at most 100', async () => {
  const rec = recorder()
  const alias = buildAlias(spec('Glob'), native('glob', rec, () => ({ root: '.', paths: [['src', 'old.ts'].join(sep), ['src', 'new.ts'].join(sep)] })))
  const value = await alias.execute({ pattern: ' **/*.ts ', path: 'src', ip: '.git' }, undefined)
  assert.deepEqual(rec.calls[0]!.args, { pattern: '**/*.ts', path: 'src' })
  assert.deepEqual(alias.output.render({ pattern: '**/*.ts' }, value), [{ type: 'text', text: 'src/new.ts\nsrc/old.ts' }])
  assert.equal(globResultText([]), 'No files found')
  const many = Array.from({ length: 101 }, (_, index) => `f${index}.ts`)
  const lines = globResultText(many).split('\n')
  assert.equal(lines.length, 101)
  assert.equal(lines[0], 'f100.ts')
  assert.equal(lines.at(-1), '(Results are truncated. Consider using a more specific path or pattern.)')
  assert.equal(zcodeDisplayPath('C:\\ws\\outside.ts'), 'C:\\ws\\outside.ts')
  alias.output.presentationMeta!({ pattern: ' a ' }, value)
  assert.deepEqual(rec.metaArgs, [{ pattern: 'a' }])
})

test('Grep turns -i, glob and type into native calls the way ZCode builds its ripgrep filters', () => {
  assert.deepEqual(grepNativeCalls({ pattern: '  todo  ', path: 'src', output_mode: 'content', '-n': false }), [{ pattern: 'todo', path: 'src' }])
  assert.deepEqual(grepNativeCalls({ pattern: 'todo', '-i': true }), [{ pattern: '(?i)todo' }])
  assert.deepEqual(grepNativeCalls({ pattern: ' ', '-i': true }), [{ pattern: '' }])
  assert.deepEqual(grepNativeCalls({ pattern: 'x', glob: '*.{ts,tsx}' }), [{ pattern: 'x', include: '*.{ts,tsx}' }])
  assert.deepEqual(grepNativeCalls({ pattern: 'x', glob: '*.ts,*.js  !dist/**', type: 'py' }).map(call => call.include), ['*.ts', '*.js', '!dist/**', '*.py'])
  assert.deepEqual(splitGlobPatterns(' a,b  {c,d} '), ['a', 'b', '{c,d}'])
  assert.deepEqual(['js', '.TS', 'go', 'vue', 'c#', ''].map(typeGlobPattern), ['*{.js,.jsx,.mjs,.cjs}', '*{.ts,.tsx,.mts,.cts}', '*.go', '*.vue', undefined, undefined])
})

test('Grep runs one native call per filter and merges the matches', async () => {
  const rec = recorder()
  const byInclude: Record<string, unknown> = {
    '*.ts': { matches: [{ path: 'a.ts', lineNumber: 1, line: 'x' }, { path: 'b.ts', lineNumber: 2, line: 'x' }] },
    '*.py': { matches: [{ path: 'c.py', lineNumber: 3, line: 'x' }, { path: 'a.ts', lineNumber: 1, line: 'x' }] },
  }
  const alias = buildAlias(spec('Grep'), native('grep', rec, args => byInclude[(args as { include: string }).include]))
  const value = await alias.execute({ pattern: 'x', glob: '*.ts', type: 'py', output_mode: 'content' }, undefined)
  assert.deepEqual(rec.calls.map(call => call.args), [{ pattern: 'x', include: '*.ts' }, { pattern: 'x', include: '*.py' }])
  assert.deepEqual(value, { matches: [{ path: 'a.ts', lineNumber: 1, line: 'x' }, { path: 'b.ts', lineNumber: 2, line: 'x' }, { path: 'c.py', lineNumber: 3, line: 'x' }] })
  assert.deepEqual(alias.output.render({ pattern: 'x', output_mode: 'content' }, value), [{ type: 'text', text: 'a.ts:1:x\nb.ts:2:x\nc.py:3:x' }])
  // One filter (or none): the native value comes back as it is.
  const single = buildAlias(spec('Grep'), native('grep', rec, () => ({ matches: [] })))
  assert.deepEqual(await single.execute({ pattern: 'x' }, undefined), { matches: [] })
})

test('Grep renders ZCode\'s output modes and pagination over the native matches', () => {
  const at = (path: string, lineNumber: number, line = 'hit') => ({ path: ['src', path].join(sep), lineNumber, line })
  const value = { matches: [at('a.ts', 1), at('a.ts', 5, 'hit again'), at('b.ts', 2), at('c.ts', 9)] }
  assert.equal(grepResultText({ pattern: 'hit' }, value), 'Found 3 files\nsrc/a.ts\nsrc/b.ts\nsrc/c.ts')
  assert.equal(grepResultText({ pattern: 'hit', head_limit: 2 }, value), 'Found 2 files limit: 2\nsrc/a.ts\nsrc/b.ts')
  assert.equal(grepResultText({ pattern: 'hit', head_limit: 2, offset: 2 }, value), 'Found 1 file offset: 2\nsrc/c.ts')
  assert.equal(grepResultText({ pattern: 'hit', offset: 5 }, value), 'No files found')
  assert.equal(grepResultText({ pattern: 'hit', output_mode: 'content' }, value), 'src/a.ts:1:hit\nsrc/a.ts:5:hit again\nsrc/b.ts:2:hit\nsrc/c.ts:9:hit')
  assert.equal(grepResultText({ pattern: 'hit', output_mode: 'content', '-n': false, head_limit: 1, offset: 1 }, value), 'src/a.ts:hit again\n[Showing results with pagination = limit: 1, offset: 1]')
  assert.equal(grepResultText({ pattern: 'hit', output_mode: 'content', head_limit: 0, offset: 3 }, value), 'src/c.ts:9:hit\n[Showing results with pagination = offset: 3]')
  assert.equal(grepResultText({ pattern: 'hit', output_mode: 'count' }, value), 'src/a.ts:2\nsrc/b.ts:1\nsrc/c.ts:1\nFound 4 total occurrences across 3 files.')
  assert.equal(grepResultText({ pattern: 'hit', output_mode: 'count', head_limit: 1 }, value), 'src/a.ts:2\nFound 4 total occurrences across 3 files. with pagination = limit: 1')
  assert.equal(grepResultText({ pattern: 'none', output_mode: 'content' }, { matches: [] }), 'No matches found')
  assert.equal(grepResultText({ pattern: 'none', output_mode: 'count' }, { matches: [] }), 'No matches found\nFound 0 total occurrences across 0 files.')
  assert.equal(grepResultText({ pattern: 'x' }, { other: true }), undefined)
  const many = { matches: Array.from({ length: 300 }, (_, index) => at(`f${index}.ts`, 1)) }
  assert.match(grepResultText({ pattern: 'hit' }, many)!, /^Found 250 files limit: 250\n/)
})

test('Write maps file_path and content and drops everything else when the native has no escalation fields', async () => {
  const rec = recorder()
  const alias = buildAlias(spec('Write'), native('write', rec, () => ({})))
  assert.equal(alias.parameters, spec('Write').schema)
  await alias.execute({ file_path: 'C:/ws/a.ts', content: '', extra: 1, sandbox_permissions: 'workspace-write' }, undefined)
  assert.deepEqual(rec.calls[0]!.args, { file_path: 'C:/ws/a.ts', content: '' })
})

test('Write and Edit declare and forward the native\'s sandbox escalation fields', async () => {
  for (const name of ['Write', 'Edit']) {
    const rec = recorder()
    const alias = buildAlias(spec(name), native(name.toLowerCase(), rec, () => ({}), { escalation: true }))
    const properties = alias.parameters.properties as Record<string, unknown>
    assert.deepEqual(Object.keys(properties).slice(-2), ['sandbox_permissions', 'justification'], name)
    assert.deepEqual(properties.sandbox_permissions, ESCALATION.sandbox_permissions)
    assert.deepEqual((alias.parameters as { required: unknown }).required, (spec(name).schema as { required: unknown }).required)
    await alias.execute({ file_path: 'f', content: 'x', old_string: 'a', new_string: 'b', sandbox_permissions: 'workspace-write', justification: 'needed' }, undefined)
    const args = rec.calls[0]!.args as Record<string, unknown>
    assert.equal(args.sandbox_permissions, 'workspace-write', name)
    assert.equal(args.justification, 'needed', name)
  }
})

test('Edit maps its fields and reads replace_all as ZCode\'s semantic boolean', async () => {
  const rec = recorder()
  const alias = buildAlias(spec('Edit'), native('edit', rec, () => ({})))
  await alias.execute({ file_path: 'f', old_string: 'a', new_string: 'b' }, undefined)
  await alias.execute({ file_path: 'f', old_string: 'a', new_string: 'b', replace_all: ' Yes ', expected_replacements: 2 }, undefined)
  assert.deepEqual(rec.calls.map(call => call.args), [
    { file_path: 'f', old_string: 'a', new_string: 'b' },
    { file_path: 'f', old_string: 'a', new_string: 'b', replace_all: true },
  ])
  assert.deepEqual([true, false, 1, 0, 'on', 'OFF', 'n', 'maybe', 2].map(value => semanticBoolean(value)), [true, false, true, false, true, false, false, 'maybe', 2])
})

test('Write and Edit results use ZCode\'s texts; presentationMeta sees the mapped call', () => {
  const rec = recorder()
  const write = buildAlias(spec('Write'), native('write', rec, () => ({})))
  const suffix = ' (file state is current in your context \u2014 no need to Read it back)'
  assert.deepEqual(write.output.render({ file_path: 'C:/ws/a.ts', content: 'x' }, { path: 'C:\\ws\\a.ts', operation: 'create', before: null, after: 'x' }), [{ type: 'text', text: `File created successfully at: C:/ws/a.ts${suffix}` }])
  assert.deepEqual(write.output.render({ file_path: 'C:/ws/a.ts', content: 'x' }, { path: 'C:\\ws\\a.ts', operation: 'update', before: 'y', after: 'x' }), [{ type: 'text', text: `The file C:/ws/a.ts has been updated successfully.${suffix}` }])
  const edit = buildAlias(spec('Edit'), native('edit', rec, () => ({})))
  const value = { path: 'C:\\ws\\a.ts', before: 'a', after: 'b' }
  assert.deepEqual(edit.output.render({ file_path: 'C:/ws/a.ts', old_string: 'a', new_string: 'b' }, value), [{ type: 'text', text: `The file C:/ws/a.ts has been updated successfully.${suffix}` }])
  assert.deepEqual(edit.output.render({ file_path: 'C:/ws/a.ts', old_string: 'a', new_string: 'b', replace_all: 'true' }, value), [{ type: 'text', text: `The file C:/ws/a.ts has been updated. All occurrences were successfully replaced.${suffix}` }])
  edit.output.presentationMeta!({ file_path: 'f', old_string: 'a', new_string: 'b', replace_all: 'no' }, value)
  assert.deepEqual(rec.metaArgs, [{ file_path: 'f', old_string: 'a', new_string: 'b', replace_all: false }])
  // A value of an unexpected shape falls back to the native render with the mapped call.
  assert.match(write.output.render({ file_path: 'f', content: 'x', extra: 1 }, { path: 'f' })[0]!.text!, /^native write \{"file_path":"f","content":"x"\}/)
})

// Read over the rc.3 natives `read` and `read_image`.

test('Read maps offset 0 to the first line, clamps limit to the native window and drops unknown fields', () => {
  assert.deepEqual(mapReadArgs({ file_path: 'a', offset: 0, limit: 5000, pages: '1-2' }), { file_path: 'a', offset: 1, limit: 2000 })
  assert.deepEqual(mapReadArgs({ file_path: 'a', offset: 10, limit: 5 }), { file_path: 'a', offset: 10, limit: 5 })
  assert.deepEqual(mapReadArgs({ file_path: 'a' }), { file_path: 'a' })
})

test('Read renders ZCode\'s cat -n form and its empty-file reminder', () => {
  assert.equal(renderReadWindow({ file_path: 'f', offset: 3 }, { path: 'f', offset: 3, lines: [{ number: 3, text: 'a' }, { number: 4, text: '' }], totalLines: 4 }), '3\ta\n4\t')
  assert.equal(renderReadWindow({ file_path: 'f' }, { path: 'f', offset: 1, lines: [], totalLines: 0 }), '<system-reminder>Warning: the file exists but the contents are empty.</system-reminder>')
})

test('Read opens with ZCode\'s partial-view notice, minus its token clause, only when the native window, not the model\'s limit, cut the file', () => {
  const lines = [{ number: 1, text: 'x' }, { number: 2, text: 'y' }]
  assert.equal(renderReadWindow({ file_path: 'f' }, { path: 'C:/ws/f.ts', offset: 1, lines, totalLines: 9000 }), '<system-reminder>[Truncated: PARTIAL view \u2014 C:/ws/f.ts: showing lines 1-2 of 9000 total. Call Read with offset=3 limit=2 for the next page, or Grep to find a specific section. Do NOT answer from this page alone if the answer may be further in the file.]</system-reminder>\n1\tx\n2\ty')
  assert.equal(renderReadWindow({ file_path: 'f', limit: 5000 }, { path: 'f', offset: 1, lines, totalLines: 9000 }).startsWith('<system-reminder>[Truncated: PARTIAL view \u2014 f: showing lines 1-2 of 9000 total. Call Read with offset=3 limit=2 '), true)
  // With ZCode's clause the notice is the 3.17.1 text (createTokenCapPartialView).
  assert.equal(readPartialViewNotice('f', 1, 2, 9000, 2, ' (30000 tokens, cap 25000)'), '[Truncated: PARTIAL view \u2014 f: showing lines 1-2 of 9000 total (30000 tokens, cap 25000). Call Read with offset=3 limit=2 for the next page, or Grep to find a specific section. Do NOT answer from this page alone if the answer may be further in the file.]')
  assert.equal(renderReadWindow({ file_path: 'f', limit: 2 }, { path: 'f', offset: 1, lines, totalLines: 9000 }), '1\tx\n2\ty')
})

test('Read sends image paths to read_image and text paths to read, and projects through the native that answered', async () => {
  const rec = recorder()
  const alias = buildReadAlias(readNative(rec), imageNative(rec))
  assert.deepEqual(alias.output.schema, { oneOf: [READ_SCHEMA, IMAGE_SCHEMA] })
  const image = await alias.execute({ file_path: 'C:/ws/Shot.PNG', offset: 4 }, undefined)
  const text = await alias.execute({ file_path: 'C:/ws/a.json', offset: 0 }, undefined)
  assert.deepEqual(rec.calls, [
    { name: 'read_image', args: { file_path: 'C:/ws/Shot.PNG' } },
    { name: 'read', args: { file_path: 'C:/ws/a.json', offset: 1 } },
  ])
  assert.match(alias.output.render({ file_path: 'C:/ws/Shot.PNG', offset: 4 }, image)[0]!.text!, /^native read_image \{"file_path":"C:\/ws\/Shot.PNG"\}/)
  assert.deepEqual(alias.output.render({ file_path: 'C:/ws/a.json', offset: 0 }, text), [{ type: 'text', text: '1\t{\n2\t}' }])
  assert.deepEqual(alias.output.presentationMeta!({ file_path: 'C:/ws/Shot.PNG' }, image), { from: 'read_image' })
  assert.deepEqual(alias.output.presentationMeta!({ file_path: 'C:/ws/a.json', offset: 0 }, text), { from: 'read' })
  assert.deepEqual(rec.metaArgs, [{ file_path: 'C:/ws/Shot.PNG' }, { file_path: 'C:/ws/a.json', offset: 1 }])
})

test('Read refuses ZCode\'s binary extensions and videos, and images without read_image, with ZCode\'s binary message', async () => {
  const rec = recorder()
  const withImages = buildReadAlias(readNative(rec), imageNative(rec))
  const textOnly = buildReadAlias(readNative(rec), undefined)
  const message = (extension: string) => `This tool cannot read binary files. The file appears to be a binary ${extension} file. Please use appropriate tools for binary file analysis.`
  await assert.rejects(withImages.execute({ file_path: 'C:/ws/app.EXE' }, undefined), { message: message('.exe') })
  await assert.rejects(withImages.execute({ file_path: 'C:/ws/demo.mp4' }, undefined), { message: message('.mp4') })
  await assert.rejects(textOnly.execute({ file_path: 'C:/ws/shot.png' }, undefined), { message: message('.png') })
  assert.equal(textOnly.output.schema, READ_SCHEMA)
  await textOnly.execute({ file_path: 'C:/ws/.gitignore' }, undefined)
  assert.deepEqual(rec.calls, [{ name: 'read', args: { file_path: 'C:/ws/.gitignore' } }])
  assert.deepEqual(['a.tar.gz', 'dir.v2/file', '.zip', 'C:\\x\\y.Zip'].map(fileExtension), ['.gz', undefined, undefined, '.zip'])
})

test('aliases cover only the natives they were built over', () => {
  const rec = recorder()
  const natives = new Map([['read', readNative(rec)], ['read_image', imageNative(rec)], ['edit', native('edit', rec, () => ({}))]])
  assert.deepEqual(buildAliases(name => natives.get(name)).map(alias => [alias.tool.name, alias.covers]), [['Read', ['read', 'read_image']], ['Edit', ['edit']]])
  natives.delete('read')
  assert.deepEqual(buildAliases(name => natives.get(name)).map(alias => alias.tool.name), ['Edit'])
})

test('a GLM request does not see read_image once Read stands in for it; a non-GLM request still does', async () => {
  const rt = fakeRuntime({ natives: [...NATIVE_NAMES, 'read_image'] })
  installDialect(rt.agent, { toolSearchMode: 'off' })
  const glm = (await rt.assemble({ model: 'glm-5.3' })).tools.map(tool => tool.name)
  const plain = (await rt.assemble({ model: 'deepseek-flash' })).tools.map(tool => tool.name)
  assert.ok(glm.includes('Read') && !glm.includes('read_image') && !glm.includes('read'))
  assert.ok(plain.includes('read_image') && plain.includes('read') && !plain.includes('Read'))
  const imageOnly = fakeRuntime({ natives: ['read_image'] })
  installDialect(imageOnly.agent, { toolSearchMode: 'off' })
  assert.deepEqual((await imageOnly.assemble({ model: 'glm-5.3' })).tools.map(tool => tool.name), ['read_image'])
})
