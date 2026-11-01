/**
 * Watching the files entries wait for (src/loops/file-watch.ts; loop board design
 * 0.6 §4.1): one change counts once the file has been still for 60 seconds,
 * `fs.watch` only makes it prompt and the beat is the backstop, a file this
 * host has no state for is not a change, and a file that is gone keys with
 * `gone` so a delete, a write and a delete again are three occurrences.
 *
 * The clock, the timer and the reading are injected, so no case waits a minute
 * and none depends on what the platform's `fs.watch` does. One case uses the
 * real `fs.watch` and the real reading over a temporary file, to see that a
 * change of a real file reaches the same judgment.
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileChangedKey } from '../src/loops/events.ts'
import { QUIET_MS, watchPaths, type FileState } from '../src/loops/file-watch.ts'

interface Fake {
  readonly changes: Array<{ path: string, state: FileState }>
  readonly timers: Array<{ ms: number, run: () => void }>
  readonly now: () => number
  readonly move: (ms: number) => void
  /** Fire every timer that is armed; a timer re-armed by the run is left for the next call. */
  readonly fire: () => void
  readonly set: (path: string, state: FileState) => void
}

function fakeWorld(at: number): Fake {
  let clock = at
  const timers: Fake['timers'] = []
  const states = new Map<string, FileState>()
  return {
    changes: [],
    timers,
    now: () => clock,
    move: (ms) => { clock += ms },
    fire: () => { for (const timer of timers.splice(0)) timer.run() },
    set: (path, state) => { states.set(path, state) },
  }
}

/** The world above with the reading and the timer the watcher takes. */
function worldOf(at: number): { readonly fake: Fake, readonly deps: Parameters<typeof watchPaths>[2], readonly states: Map<string, FileState> } {
  const fake = fakeWorld(at)
  const states = new Map<string, FileState>()
  return {
    fake,
    states,
    deps: {
      now: fake.now,
      read: (path, previous) => Promise.resolve(states.get(path) ?? { size: 'gone', mtimeMs: previous?.mtimeMs ?? 0 }),
      watch: () => undefined,
      delay: (run, ms) => {
        const timer = { ms, run }
        fake.timers.push(timer)
        return () => {
          const index = fake.timers.indexOf(timer)
          if (index >= 0) fake.timers.splice(index, 1)
        }
      },
    },
  }
}

const AT = Date.parse('2026-11-02T03:00:00.000Z')

test('a file this host has no state for is not a change, and a change counts once it has been still for 60 seconds', async () => {
  const world = worldOf(AT)
  const changes: Array<{ path: string, state: FileState }> = []
  world.states.set('/p/a.json', { size: 10, mtimeMs: AT - 1000 })
  const watched = watchPaths(['/p/a.json'], (path, state) => { changes.push({ path, state }) }, world.deps)
  await watched.beat()
  assert.deepEqual(changes, [], 'what is there at the start is not a change')
  assert.deepEqual([...watched.states()], [['/p/a.json', { size: 10, mtimeMs: AT - 1000 }]])
  world.states.set('/p/a.json', { size: 20, mtimeMs: AT + 1 })
  await watched.beat()
  assert.deepEqual(changes, [], 'a file that just changed is not still yet')
  world.fake.move(QUIET_MS)
  await watched.beat()
  assert.equal(changes.length, 1)
  assert.deepEqual(changes[0]?.state, { size: 20, mtimeMs: AT + 1 })
  await watched.beat()
  assert.equal(changes.length, 1, 'the same state is not a second change')
  watched.dispose()
})

test('a file written again and again inside the window is one change, of the state it settled on', async () => {
  const world = worldOf(AT)
  const changes: FileState[] = []
  world.states.set('/p/b.log', { size: 1, mtimeMs: AT })
  const watched = watchPaths(['/p/b.log'], (_path, state) => { changes.push(state) }, { ...world.deps, known: new Map([['/p/b.log', { size: 1, mtimeMs: AT }]]) })
  for (const size of [2, 3, 4]) {
    world.states.set('/p/b.log', { size, mtimeMs: world.fake.now() })
    world.fake.move(20_000)
    await watched.beat()
    assert.deepEqual(changes, [], 'a build that keeps writing has not settled')
  }
  world.fake.move(QUIET_MS)
  await watched.beat()
  assert.deepEqual(changes, [{ size: 4, mtimeMs: AT + 40_000 }], 'one change, the state it came to rest in')
  watched.dispose()
})

test('a file that is gone settles too, and its key says gone with the time of the version last seen', async () => {
  const world = worldOf(AT)
  const changes: FileState[] = []
  const known = new Map([['/p/c.json', { size: 5, mtimeMs: AT - 10 }]])
  const watched = watchPaths(['/p/c.json'], (_path, state) => { changes.push(state) }, { ...world.deps, known })
  await watched.beat()
  world.fake.move(QUIET_MS)
  await watched.beat()
  assert.deepEqual(changes, [{ size: 'gone', mtimeMs: AT - 10 }], 'the file is not there any more')
  assert.equal(fileChangedKey('/p/c.json', changes[0].size, changes[0].mtimeMs), `file-changed:/p/c.json:gone-${AT - 10}`)
  world.states.set('/p/c.json', { size: 7, mtimeMs: AT + 5 })
  world.fake.move(QUIET_MS)
  await watched.beat()
  world.fake.move(QUIET_MS)
  await watched.beat()
  assert.equal(changes.length, 2, 'written again is another change')
  assert.notEqual(fileChangedKey('/p/c.json', changes[1].size, changes[1].mtimeMs), fileChangedKey('/p/c.json', changes[0].size, changes[0].mtimeMs))
  watched.dispose()
})

test('a platform that refuses to watch a path leaves the beat as the finder, and the watched set follows the entries', async () => {
  const world = worldOf(AT)
  const changes: string[] = []
  let watchCalls = 0
  const deps = { ...world.deps, watch: (): undefined => { watchCalls++; return undefined } }
  world.states.set('/p/d.json', { size: 1, mtimeMs: AT })
  const watched = watchPaths(['/p/d.json'], path => { changes.push(path) }, deps)
  await watched.beat()
  assert.equal(watchCalls, 1)
  world.states.set('/p/d.json', { size: 2, mtimeMs: AT + 1 })
  await watched.beat()
  world.fake.move(QUIET_MS)
  await watched.beat()
  assert.deepEqual(changes, ['/p/d.json'])
  watched.follow(['/p/e.json'])
  world.states.set('/p/d.json', { size: 3, mtimeMs: AT + 2 })
  world.fake.move(QUIET_MS)
  await watched.beat()
  assert.deepEqual(changes, ['/p/d.json'], 'a path no entry waits for any more is forgotten')
  watched.dispose()
})

test('the real watch and the real reading of a file agree with the same judgment', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'loops-watch-'))
  try {
    const file = join(dir, 'watched.txt')
    await writeFile(file, 'one')
    let clock = AT
    const changes: FileState[] = []
    const watched = watchPaths([file], (_path, state) => { changes.push(state) }, { now: () => clock, delay: () => () => {}, quietMs: 0 })
    await watched.beat()
    assert.deepEqual(changes, [], 'the file as it is at the start is not a change')
    await writeFile(file, 'one and two')
    clock += QUIET_MS
    // The first beat sees it changed, the next one sees it still: with no wait asked for, that is the two readings.
    await watched.beat()
    await watched.beat()
    assert.equal(changes.length, 1, 'the beat found the real change')
    assert.equal(changes[0]?.size, 11)
    await unlink(file)
    clock += QUIET_MS
    await watched.beat()
    await watched.beat()
    assert.equal(changes[1]?.size, 'gone')
    watched.dispose()
  }
  finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 5 })
  }
})
