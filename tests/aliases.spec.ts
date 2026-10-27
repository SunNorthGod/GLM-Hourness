import assert from 'node:assert/strict'
import test from 'node:test'
import { aliasSpecs, buildAlias, hiddenNatives } from '../src/glm-prompt/aliases.ts'

test('six aliases ship in S1 (ToolSearch lands with the toolsearch row)', () => {
  assert.deepEqual(aliasSpecs.map(spec => spec.zcodeName), ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'])
  assert.ok(!hiddenNatives.includes('toolsearch'))
})

test('every alias keeps its verbatim required fields', () => {
  const byName = new Map(aliasSpecs.map(spec => [spec.zcodeName, spec]))
  assert.deepEqual((byName.get('Read')!.schema.properties as any).offset.description, 'Starting line number (1-based, for pagination)')
  assert.deepEqual((byName.get('Write')!.schema as any).required, ['file_path', 'content'])
  assert.deepEqual((byName.get('Edit')!.schema as any).required, ['file_path', 'old_string', 'new_string'])
  assert.deepEqual((byName.get('Grep')!.schema as any).required, ['pattern'])
  assert.deepEqual((byName.get('Bash')!.schema as any).required, ['command'])
})

test('Bash maps seconds to timeoutMs and working_dir to workdir; shell is dropped', async () => {
  const spec = aliasSpecs.find(s => s.zcodeName === 'Bash')!
  const calls: unknown[] = []
  const alias = buildAlias(spec, async args => { calls.push(args); return {} })
  await alias.execute({ command: 'npm test', timeout: 30, working_dir: 'C:/ws', shell: 'bash' }, undefined)
  // description is optional in ZCode but required by pwsh: the shim derives it from the command.
  assert.deepEqual(calls[0], { command: 'npm test', description: 'npm test', timeoutMs: 30000, workdir: 'C:/ws' })
})

test('Read passes only the native fields through', async () => {
  const spec = aliasSpecs.find(s => s.zcodeName === 'Read')!
  const calls: unknown[] = []
  const alias = buildAlias(spec, async args => { calls.push(args); return {} })
  await alias.execute({ file_path: 'a.ts', offset: 10, limit: 5 }, undefined)
  assert.deepEqual(calls[0], { file_path: 'a.ts', offset: 10, limit: 5 })
})
