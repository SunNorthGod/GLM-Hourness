/**
 * The holder record of a project's main agent (docs/ORCHESTRATION.md §3.1;
 * decision d-one-main-agent) on a real temporary directory: the project key,
 * the record file, reading with its cache, the claim that only one session
 * wins, replacing and releasing.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { claimHolder, holderFile, holderFileOf, holderHome, mainAgentOf, projectKey, readHolder, releaseHolder, replaceHolder, type HolderRecord } from '../src/graph/main-agent-holder.ts'
import { DATA_SERVICE, userDataHome } from '../src/shared/data-home.ts'

const run = promisify(execFile)

const record = (sessionId: string, extra: Partial<HolderRecord> = {}): HolderRecord => ({ version: 1, sessionId, graphDir: 'C:/ws/docs/graph', since: '2026-10-30T09:00:00.000Z', commandId: `cmd-${sessionId}`, ...extra })

function scratch(): { readonly root: string, readonly file: string } {
  const root = mkdtempSync(join(tmpdir(), 'holder-'))
  return { root, file: join(root, 'main-agent', 'abc.json') }
}

test('projectKey: separators, trailing slash and, on Windows, case do not make a second project', () => {
  const { root } = scratch()
  const dir = join(root, 'Proj', 'docs', 'graph')
  mkdirSync(dir, { recursive: true })
  const key = projectKey(dir)
  assert.ok(!key.includes('\\') && !key.endsWith('/'))
  assert.equal(projectKey(`${dir}/`), key)
  assert.equal(projectKey(dir.replaceAll('\\', '/')), key)
  assert.equal(projectKey(join(dir, '..', 'graph')), key)
  if (process.platform === 'win32') assert.equal(projectKey(dir.replace('Proj', 'PROJ')), key, 'win32 paths are case-insensitive')
  else assert.notEqual(projectKey(dir.replace('Proj', 'PROJ')), key, 'POSIX paths are case-sensitive')
})

test('projectKey: a link (a junction on Windows) to the same directory has the same key; a directory that does not exist falls back to its absolute path', () => {
  const { root } = scratch()
  const real = join(root, 'real', 'docs', 'graph')
  mkdirSync(real, { recursive: true })
  const link = join(root, 'link')
  symlinkSync(join(root, 'real'), link, 'junction')
  assert.equal(projectKey(join(link, 'docs', 'graph')), projectKey(real))
  const missing = join(root, 'not', 'there')
  const key = projectKey(missing)
  assert.equal(key, process.platform === 'win32' ? resolve(missing).replaceAll('\\', '/').toLowerCase() : resolve(missing))
})

test('holderFile: one file per project key, 16 hex characters, under main-agent in the user directory', () => {
  const file = holderFile('C:/home/glm-hourness', 'c:/ws/docs/graph')
  assert.match(file.replaceAll('\\', '/'), /^C:\/home\/glm-hourness\/main-agent\/[0-9a-f]{16}\.json$/)
  assert.equal(holderFile('C:/home/glm-hourness', 'c:/ws/docs/graph'), file)
  assert.notEqual(holderFile('C:/home/glm-hourness', 'c:/ws2/docs/graph'), file)
})

test('holderFileOf(userHome, dir) is holderFile(userHome, projectKey(dir))', () => {
  const { root } = scratch()
  const dir = join(root, 'docs', 'graph')
  mkdirSync(dir, { recursive: true })
  assert.equal(holderFileOf('C:/home', dir), holderFile('C:/home', projectKey(dir)))
})

test('holderHome: the data service\'s user directory, else the default under the DSH home', () => {
  assert.equal(holderHome({ get: name => name === DATA_SERVICE ? { userHome: 'C:/from-data-row' } : undefined }), 'C:/from-data-row')
  assert.equal(holderHome({ get: () => undefined }), userDataHome())
  assert.equal(holderHome({ get: () => ({ userHome: 7 }) }), userDataHome(), 'a malformed service counts as absent')
})

test('readHolder: none for a missing file, held for a record, unreadable with a reason for anything else', () => {
  const { file } = scratch()
  assert.deepEqual(readHolder(file), { kind: 'none' })
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, `${JSON.stringify(record('s1'))}\n`)
  assert.deepEqual(readHolder(file), { kind: 'held', record: record('s1') })
  writeFileSync(file, '{not json')
  const broken = readHolder(file)
  assert.equal(broken.kind, 'unreadable')
  writeFileSync(file, JSON.stringify({ version: 2, sessionId: 's1' }))
  assert.deepEqual(readHolder(file), { kind: 'unreadable', reason: '记录的内容不是主 Agent 记录' })
  writeFileSync(file, JSON.stringify({ ...record('s1'), sessionId: '' }))
  assert.equal(readHolder(file).kind, 'unreadable', 'an empty session id is no record')
  writeFileSync(file, 'null')
  assert.equal(readHolder(file).kind, 'unreadable')
})

test('readHolder: a changed file is read again (the cache keys on modification time and size), a deleted one is none', () => {
  const { file } = scratch()
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, JSON.stringify(record('s1')))
  assert.equal(readHolder(file).kind, 'held')
  assert.equal(readHolder(file).kind, 'held', 'the second read comes from the cache')
  writeFileSync(file, JSON.stringify(record('a-longer-session-id')))
  const changed = readHolder(file)
  assert.equal(changed.kind === 'held' && changed.record.sessionId, 'a-longer-session-id')
  rmSync(file)
  assert.deepEqual(readHolder(file), { kind: 'none' })
})

test('claimHolder: the first claim writes the record and leaves no temporary file, the second loses and changes nothing', () => {
  const { file } = scratch()
  assert.equal(claimHolder(file, record('s1')), true)
  assert.equal(claimHolder(file, record('s2')), false)
  assert.deepEqual(readHolder(file), { kind: 'held', record: record('s1') })
  assert.deepEqual(readdirSync(join(file, '..')), ['abc.json'])
  assert.ok(readFileSync(file, 'utf8').endsWith('\n'))
})

test('claimHolder: of several processes claiming one project at the same moment exactly one wins', async () => {
  const { file } = scratch()
  const holder = pathToFileURL(resolve(import.meta.dirname, '..', 'src', 'graph', 'main-agent-holder.ts')).href
  const script = `const { claimHolder } = await import(${JSON.stringify(holder)}); const won = claimHolder(${JSON.stringify(file)}, { version: 1, sessionId: process.argv[1], graphDir: 'g', since: 't', commandId: 'c' }); process.exit(won ? 0 : 3)`
  const outcomes = await Promise.all(['p1', 'p2', 'p3', 'p4'].map(async (id) => {
    try {
      await run(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', script, id])
      return 'won'
    }
    catch (error) {
      return (error as { code?: number }).code === 3 ? 'lost' : `failed: ${String(error)}`
    }
  }))
  assert.equal(outcomes.filter(outcome => outcome === 'won').length, 1, outcomes.join(', '))
  assert.equal(outcomes.filter(outcome => outcome === 'lost').length, 3, outcomes.join(', '))
  assert.deepEqual(readdirSync(join(file, '..')), ['abc.json'], 'no temporary file is left')
})

test('replaceHolder: puts the new record over whatever is there, a broken file included', () => {
  const { file } = scratch()
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, '{not json')
  replaceHolder(file, record('s2'))
  assert.deepEqual(readHolder(file), { kind: 'held', record: record('s2') })
  replaceHolder(file, record('s3'))
  assert.deepEqual(readHolder(file), { kind: 'held', record: record('s3') })
  assert.deepEqual(readdirSync(join(file, '..')), ['abc.json'])
})

test('a write that cannot happen throws, so the caller can tell the person', () => {
  const { root } = scratch()
  const blocked = join(root, 'main-agent')
  writeFileSync(blocked, 'a file where the directory should be')
  assert.throws(() => claimHolder(join(blocked, 'abc.json'), record('s1')))
  assert.throws(() => replaceHolder(join(blocked, 'abc.json'), record('s1')))
  assert.equal(existsSync(join(blocked, 'abc.json')), false)
})

test('releaseHolder: deletes the record only while it still names the session', () => {
  const { file } = scratch()
  assert.equal(releaseHolder(file, 's1'), false, 'no record')
  claimHolder(file, record('s1'))
  assert.equal(releaseHolder(file, 's2'), false, 'another session holds it')
  assert.equal(readHolder(file).kind, 'held')
  assert.equal(releaseHolder(file, 's1'), true)
  assert.deepEqual(readHolder(file), { kind: 'none' })
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, '{not json')
  assert.equal(releaseHolder(file, 's1'), false, 'a broken record is not deleted by a session that cannot show it is the holder')
  assert.equal(existsSync(file), true)
})

test('mainAgentOf: the holder record of the project whose graph directory is given, else undefined', () => {
  const { root } = scratch()
  const dir = join(root, 'docs', 'graph')
  mkdirSync(dir, { recursive: true })
  assert.equal(mainAgentOf(root, dir), undefined)
  claimHolder(holderFileOf(root, dir), record('s1', { graphDir: dir }))
  assert.equal(mainAgentOf(root, dir)?.sessionId, 's1')
  assert.equal(mainAgentOf(root, join(root, 'other', 'docs', 'graph')), undefined, 'another project has no main agent')
  writeFileSync(holderFileOf(root, dir), '{not json')
  assert.equal(mainAgentOf(root, dir), undefined, 'an unreadable record names nobody')
})
