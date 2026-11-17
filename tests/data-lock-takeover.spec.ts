/**
 * The `.takeover` mutex of the stale-lock takeover (`withTakeoverLock`,
 * src/data/lock.ts): two contenders that both observe the same stale
 * `.takeover` leftover must not both enter the takeover section — the F1
 * interleaving, where the second contender's evicting unlink deletes the
 * fresh file the first contender just created. The race is replayed
 * deterministically by parking the first unlink of the mutex path (the fs
 * patch is the one data-journal.spec.ts uses: assign on `fs.promises` and
 * `syncBuiltinESMExports`, restore after). Also pinned: a fresh `.takeover`
 * is respected untouched, a stale one is evicted with no residue, and the
 * mutex frees for the next contender after a release.
 */
import assert from 'node:assert/strict'
import { promises as fsPromises, existsSync, mkdtempSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { syncBuiltinESMExports } from 'node:module'
import test from 'node:test'
import { withTakeoverLock } from '../src/data/lock.ts'

const scratch = (): string => mkdtempSync(join(tmpdir(), 'lock-takeover-'))

const dropScratch = (root: string): void => {
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 20 })
}

/** A leftover `.takeover` whose mtime is far past the stale bound. */
function staleTakeover(file: string): string {
  const takeoverFile = `${file}.takeover`
  writeFileSync(takeoverFile, '')
  const stale = new Date(Date.now() - 10_000)
  utimesSync(takeoverFile, stale, stale)
  return takeoverFile
}

/**
 * Parks the first unlink of the mutex path itself: the contender that has
 * already judged the file stale stops right before removing it, and every
 * later unlink of that path (the second contender's evict, everyone's
 * release) runs at once. Without the park the second contender is just
 * another waiter on a healthy mutex; with it, the parked contender's unlink
 * lands on whatever file the path carries by then.
 */
function parkFirstUnlinkOf(target: string): { reached: Promise<void>, release: () => Promise<void>, restore: () => void } {
  const real = fsPromises.unlink.bind(fsPromises)
  let releaseParked: (() => void) | undefined
  let parked = false
  let resolveReached: (() => void) | undefined
  const reached = new Promise<void>(resolve => { resolveReached = resolve })
  fsPromises.unlink = async (path: Parameters<typeof real>[0]) => {
    if (String(path) === target && !parked) {
      parked = true
      resolveReached?.()
      await new Promise<void>(resolveRelease => { releaseParked = resolveRelease })
      return real(path)
    }
    return real(path)
  }
  syncBuiltinESMExports()
  return {
    reached,
    release: async () => {
      for (let waited = 0; releaseParked === undefined && waited < 100; waited += 1) {
        await new Promise(resolveSleep => setTimeout(resolveSleep, 10))
      }
      releaseParked?.()
    },
    restore: () => {
      fsPromises.unlink = real
      syncBuiltinESMExports()
    },
  }
}

test('two contenders that both observe the same stale `.takeover` — exactly one enters the takeover section', { timeout: 15_000 }, async () => {
  const root = scratch()
  try {
    const file = join(root, 'rules.lock')
    const takeoverFile = staleTakeover(file)

    const park = parkFirstUnlinkOf(takeoverFile)
    try {
      let inside = 0
      let maxInside = 0
      const entered: string[] = []
      const releases: Array<() => void> = []
      const action = (label: 'x' | 'y', onEnter: () => void) => async () => {
        inside += 1
        maxInside = Math.max(maxInside, inside)
        entered.push(label)
        onEnter()
        await new Promise<void>(resolve => { releases.push(resolve) })
        inside -= 1
      }

      // Y first: it judges the leftover stale and stops right before removing
      // it (the old unlink eviction) or takes the mutex outright.
      let enterY: (() => void) | undefined
      const yEntered = new Promise<void>(resolve => { enterY = resolve })
      const runningY = withTakeoverLock(file, action('y', () => enterY?.()))
      await Promise.race([park.reached, yEntered])

      // X starts once Y has either parked or taken the mutex.
      let enterX: (() => void) | undefined
      const xEntered = new Promise<void>(resolve => { enterX = resolve })
      const runningX = withTakeoverLock(file, action('x', () => enterX?.()))
      await Promise.race([xEntered, runningX])

      // Old: free Y's unlink — it now really deletes X's fresh file, and Y
      // takes the mutex too. New: nothing is parked; Y already returned
      // refused, so this settles at once.
      await park.release()
      await Promise.race([yEntered, runningY])

      for (const release of releases) release()
      // The new implementation parks the release unlink of the winner here;
      // free it so both calls settle.
      await park.release()
      const [yResult, xResult] = await Promise.all([runningY, runningX])

      assert.equal(entered.length, 1, `exactly one contender enters the takeover section, got: ${entered.join(',') || 'none'}`)
      assert.equal(maxInside, 1, 'the takeover section is never held by two contenders at once')
      assert.equal(yResult.acquired, true, 'the first contender, whose observation matched, holds the mutex')
      assert.equal(xResult.acquired, false, 'the contender whose stale observation no longer matches waits')
    } finally {
      await park.release()
      park.restore()
    }
  } finally {
    dropScratch(root)
  }
})

test('a fresh `.takeover` is respected untouched', async () => {
  const root = scratch()
  try {
    const file = join(root, 'rules.lock')
    const takeoverFile = `${file}.takeover`
    writeFileSync(takeoverFile, '')
    utimesSync(takeoverFile, new Date(), new Date())
    const before = statSync(takeoverFile)

    const result = await withTakeoverLock(file, () => Promise.resolve('ran'))

    assert.equal(result.acquired, false)
    const after = statSync(takeoverFile)
    assert.equal(after.mtimeMs, before.mtimeMs, 'the fresh mutex file is left alone')
    assert.equal(after.size, 0)
  } finally {
    dropScratch(root)
  }
})

test('a stale `.takeover` is evicted, the mutex works, and release leaves no residue', async () => {
  const root = scratch()
  try {
    const file = join(root, 'rules.lock')
    staleTakeover(file)

    let seenDuring = false
    const first = await withTakeoverLock(file, () => {
      seenDuring = existsSync(`${file}.takeover`)
      return Promise.resolve('first')
    })
    assert.equal(first.acquired, true)
    if (first.acquired) assert.equal(first.value, 'first')
    assert.equal(seenDuring, true, 'the mutex file exists while the section runs')
    assert.equal(existsSync(`${file}.takeover`), false, 'release removes the mutex')
    assert.deepEqual(readdirSync(root).filter(name => name.includes('.trash-')), [], 'eviction leaves no trash behind')

    const second = await withTakeoverLock(file, () => Promise.resolve('second'))
    assert.equal(second.acquired, true, 'the freed mutex is taken by the next contender')
  } finally {
    dropScratch(root)
  }
})
