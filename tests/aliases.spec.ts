import assert from 'node:assert/strict'
import test from 'node:test'
import { aliasSpecs, buildAlias, buildAliases, semanticBoolean } from '../src/glm-prompt/aliases.ts'
import { buildReadAlias, fileExtension, mapReadArgs, readDescription, renderReadWindow } from '../src/glm-prompt/read-alias.ts'
import { READ_IMAGE_LINE, READ_INPUT_SCHEMA, READ_VIDEO_LINE } from '../src/glm-prompt/zcode-tool-text.ts'
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
function native(name: string, rec: Recorder, value: (args: unknown) => unknown, options: { escalation?: boolean, schema?: Record<string, unknown> } = {}): ToolDefinitionLike {
  return {
    name,
    description: `native ${name}`,
    parameters: { type: 'object', properties: { file_path: { type: 'string' }, ...(options.escalation === true ? ESCALATION : {}) }, required: ['file_path'] },
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

test('Read, Write and Edit carry the 3.16.3 descriptions and schemas', () => {
  assert.equal(readDescription(true), [
    'Reads a file from the local filesystem.',
    '',
    '- `file_path` must be an absolute path.',
    '- Reads up to 2000 lines by default.',
    "- You can optionally specify a line offset and limit (especially handy for long files), but it's recommended to read the whole file by not providing these parameters",
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

test('Bash maps seconds to timeoutMs and working_dir to workdir; shell is dropped', async () => {
  const rec = recorder()
  const alias = buildAlias(spec('Bash'), native('pwsh', rec, () => ({})))
  await alias.execute({ command: 'npm test', timeout: 30, working_dir: 'C:/ws', shell: 'bash' }, undefined)
  // description is optional in ZCode but required by pwsh: the shim derives it from the command.
  assert.deepEqual(rec.calls[0]!.args, { command: 'npm test', description: 'npm test', timeoutMs: 30000, workdir: 'C:/ws' })
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

test('Read opens with ZCode\'s partial-view sentences only when the native window, not the model\'s limit, cut the file', () => {
  const lines = [{ number: 1, text: 'x' }, { number: 2, text: 'y' }]
  assert.equal(renderReadWindow({ file_path: 'f' }, { path: 'f', offset: 1, lines, totalLines: 9000 }), '<system-reminder>Showing a partial view of lines 1-2 of 9000. Use Read with offset 3 and limit 2000 to continue, or use a search tool to find a specific section.</system-reminder>\n1\tx\n2\ty')
  assert.equal(renderReadWindow({ file_path: 'f', limit: 5000 }, { path: 'f', offset: 1, lines, totalLines: 9000 }).startsWith('<system-reminder>Showing a partial view of lines 1-2 of 9000.'), true)
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
