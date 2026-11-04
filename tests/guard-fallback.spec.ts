/**
 * The workspace-change fallback's post-hoc correction (m4-gate G3, design
 * §3.4): a late denial lands in the journal (`mode: 'late'`, `via:
 * 'turn-end'`) and one correction per turn is queued for the agent's next
 * step — at most eight queued, oldest first, at most ten files and three
 * commands (each cut to 80 characters) in the text, within 600 characters.
 * The tool names follow the face: without a claimed dialect the correction
 * names the natives. The pending store is module-level, so delivery is
 * `takeCorrection` — the step notice calls it, and delivering clears the
 * queue. Each test uses its own session id, the store being module-level.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { correctionBody, takeCorrection, workspaceFallback } from '../src/guard/fallback.ts'
import type { LateRecord } from '../src/guard/records.ts'
import type { CallOrigin } from '../src/guard/origin.ts'

const origin: CallOrigin = { scope: 'dialect' }
const callId = `call-${Math.random().toString(36).slice(2, 8)}`
const payload = (name: string, arguments_: Record<string, unknown>, sessionId: string): Parameters<ReturnType<typeof workspaceFallback>['observe']>[0] =>
  ({ name, arguments: arguments_, callId, agent: { id: `a-${sessionId}`, session: { id: sessionId, header: { id: sessionId, cwd: 'C:\\ws' }, deriveMessages: () => [], requestHeader: () => undefined } } } as never)

const sessionOf = (payload: unknown): { id: string } => (payload as { agent: { session: { id: string } } }).agent.session

/** A fallback over a fake workspaceChanges service, with the journaled records in hand. */
function fixture(summary: { turn: number, cwd: string, files: readonly { path: string, display: string }[], total: number } | undefined) {
  const records: LateRecord[] = []
  const fallback = workspaceFallback({ get: (name: string): unknown => name === 'workspaceChanges' ? (summary === undefined ? undefined : { summary: () => summary }) : undefined }, (record, cwd) => {
    assert.equal(cwd, 'C:\\ws')
    records.push(record)
  }, () => new Date('2026-11-04T09:00:00Z'))
  return { fallback, records }
}

const settled = async (): Promise<void> => new Promise(resolve => setImmediate(resolve))

/** One turn: the model issues one shell call over `sessionId` and the workspace summary lands. */
const runTurn = (fallback: ReturnType<typeof fixture>['fallback'], sessionId: string, command: unknown, turn: number): void => {
  const call = payload('Bash', { command }, sessionId)
  const session = sessionOf(call)
  fallback.event(session as never, { type: 'turn/start', seq: turn, data: { turn } })
  fallback.observe(call, origin)
  fallback.event(session as never, { type: 'workspace/changes', seq: turn * 3, data: { turn } })
}

test('a turn whose shell writes no file tool targeted leaves one late denial and one queued correction', async () => {
  const { fallback, records } = fixture({ turn: 1, cwd: 'C:\\ws', files: [{ path: 'gen.txt', display: 'gen.txt' }], total: 1 })
  runTurn(fallback, 'fb-1', '[IO.File]::WriteAllText(\'C:/ws/gen.txt\', \'x\')', 1)
  await settled()
  assert.equal(records.length, 1)
  assert.deepEqual([records[0].mode, records[0].via, records[0].turn, records[0].paths], ['late', 'turn-end', 1, ['gen.txt']])
  // The correction went to the queue once, delivered once, then gone.
  const first = takeCorrection('fb-1')
  assert.ok(first?.startsWith('file-tools-only: in your last turn, shell commands changed files that no file tool wrote: gen.txt (Bash "'))
  assert.ok(first?.includes('Those writes already happened. Check that the files are what you meant.'))
  assert.ok(first?.includes('write files with write or edit'), 'the native face names the tools')
  assert.equal(takeCorrection('fb-1'), undefined)
  await settled()
})

test('correctionBody lists at most ten files and three commands, each command cut to 80 characters, within 600 characters', () => {
  const paths = ['a.txt', 'b.txt', 'c.txt', 'd.txt', 'e.txt', 'f.txt', 'g.txt', 'h.txt', 'i.txt', 'j.txt', 'k.txt', 'l.txt']
  const long = 'x'.repeat(120)
  const calls = Array.from({ length: 5 }, (_, index) => ({ tool: 'Bash', command: `cmd${index} ${long}` }))
  const text = correctionBody(paths, calls, name => name)
  assert.ok(text.startsWith('file-tools-only: in your last turn'))
  for (const line of [...text.matchAll(/"([^"]*)"/g)]) assert.ok(line[1].length <= 80, 'each shown command is cut to 80 characters')
  assert.ok([...text].length <= 600, 'the whole within 600 characters')
  assert.ok(text.includes('write files with write or edit'))
  // With short content the caps are maxima, not a forced trim: ten files and three commands all show.
  const shortCalls = Array.from({ length: 5 }, (_, index) => ({ tool: 'pwsh', command: `cmd${index} short` }))
  const roomy = correctionBody(paths, shortCalls, name => name)
  for (const name of ['a.txt', 'j.txt']) assert.ok(roomy.includes(name), name)
  assert.ok(!roomy.includes('k.txt'), 'the eleventh file is not listed')
  assert.ok(roomy.includes('2 more.'))
  assert.ok(!roomy.includes('cmd0') && roomy.includes('cmd4'), 'the last three commands are the ones shown')
  assert.ok(roomy.includes('write files with write or edit'))
})

test('the queue holds at most eight corrections per session, oldest first', async () => {
  const { fallback } = fixture({ turn: 1, cwd: 'C:\\ws', files: [{ path: 'gen.txt', display: 'gen.txt' }], total: 1 })
  for (let turn = 1; turn <= 10; turn++) runTurn(fallback, 'fb-4', `[IO.File]::WriteAllText('C:/ws/gen${turn}.txt', 'x')`, turn)
  await settled()
  const first = takeCorrection('fb-4')
  assert.ok(first?.includes('gen3.txt') ?? false, 'ten turns queued eight: the first three left, turn 3 is at the head')
  for (let index = 0; index < 7; index++) assert.ok(takeCorrection('fb-4') !== undefined)
  assert.equal(takeCorrection('fb-4'), undefined, 'eight were queued, eight are gone')
})

test('a disposed session drops its queue', async () => {
  const { fallback } = fixture({ turn: 1, cwd: 'C:\\ws', files: [{ path: 'gen.txt', display: 'gen.txt' }], total: 1 })
  const session = sessionOf(payload('Bash', { command: '[IO.File]::WriteAllText(\'C:/ws/gen.txt\', \'x\')' }, 'fb-5'))
  runTurn(fallback, 'fb-5', '[IO.File]::WriteAllText(\'C:/ws/gen.txt\', \'x\')', 1)
  await settled()
  assert.ok(takeCorrection('fb-5') !== undefined)
  fallback.disposed(session as never)
  assert.equal(takeCorrection('fb-5'), undefined)
})
