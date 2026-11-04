import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../src/graph/panel-row.ts'
import type { CommandDefinitionLike } from '../src/shared/dsh-min.ts'
import { captureWarnings, fixtureTest } from './graph-helpers.ts'

interface Fixture {
  /** The fixture's temporary directory (the helper cleans it). */
  readonly dir: string
  /** The row's one command, /graph-run. */
  readonly command: CommandDefinitionLike
}

/** Register the row on a commands host that keeps the definition. */
function register(config: Record<string, unknown> = {}): CommandDefinitionLike[] {
  const registered: CommandDefinitionLike[] = []
  apply({ commands: { register: definition => { registered.push(definition); return () => {} } } }, config)
  return registered
}

const panelTest = fixtureTest(async (): Promise<Fixture> => {
  const dir = await mkdtemp(join(tmpdir(), 'graph-panel-'))
  const [command] = register()
  assert.ok(command !== undefined)
  return { dir, command }
})

panelTest('the row registers /graph-run, the human\'s one command; its short input stays on the record', ({ command }) => {
  assert.equal(command.name, 'graph-run')
  assert.equal(command.definitionId, 'dsh-glm-hourness/graph-run')
  assert.equal(command.recordInput, undefined, 'command/run keeps the raw input (dsh-commands default)')
  assert.deepEqual(command.input, { hint: 'start|stop|redo <节点 id>' })
  return Promise.resolve()
})

panelTest('the command is described for the human; the panel itself sends nothing (plain-ui)', () => {
  const [runCommand] = register()
  assert.equal(runCommand?.description, '开始、暂停或重做一个任务（人用）')
  return Promise.resolve()
})

panelTest('activation never throws: a bad dir or a failed registration warns and registers nothing', async () => {
  const bad = await captureWarnings(() => register({ dir: ' ' }))
  assert.deepEqual(bad.result, [])
  assert.match(bad.warnings.join('\n'), /config\.dir must be a non-empty path/)
  const failing = await captureWarnings(() => apply({ commands: { register: () => { throw new Error('command "graph-run" is already registered') } } }))
  assert.equal(typeof failing.result, 'function')
  assert.match(failing.warnings.join('\n'), /registering \/graph-run failed/)
})
