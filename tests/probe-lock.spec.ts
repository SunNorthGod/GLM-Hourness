/**
 * The probe lock's acquisition gate (scripts/probe/probe-lock.mjs, the §1.1
 * L3 hardening after the 2026-11-17 slot-sharing collision): a fresh claim —
 * a JSON claim of the lock module or the lanes' heartbeated text owner.txt —
 * is refused untouched no matter who wrote it, and the other slot is taken
 * instead (the rotation the lanes did by hand); a dead claim (pid gone,
 * stamp past the hold bound, written before the last boot, or a text claim
 * not rewritten for the stale window) is taken over with its content renamed
 * and logged; two concurrent acquires on one free slot produce exactly one
 * winner. Files are real, in temporary directories; time is the real clock,
 * claims are backdated with file times, and the waits are tightened so no
 * test spends a second on politeness.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { acquireLock, type LockEnvironment } from '../src/data/lock.ts'
import { acquireProbeLock, judgeClaim, mainCheckoutRoot, PROBE_LOCK_CLAIM, PROBE_LOCK_SLOTS } from '../scripts/probe/probe-lock.mjs'

const MIN = 60_000
const SLOT_A = PROBE_LOCK_SLOTS[0]
const SLOT_B = PROBE_LOCK_SLOTS[1]

/** The slots' claim verdicts, as the spec sees them (the module is plain JavaScript). */
type ClaimJudgment = { verdict: 'fresh' | 'dead' | 'absent', holder: string }
const judged = (file: string, environment?: LockEnvironment): ClaimJudgment => judgeClaim(file, environment) as ClaimJudgment

/** A taken slot, as the spec sees it: the holder it claimed for and the token-checked release. */
type ProbeLock = { holder: string, release: () => Promise<void> }
type ProbeLockSetup = {
  waitMs?: number
  pollMs?: number
  attemptMs?: number
  retryMs?: number
  graceMs?: number
  root: string
  holder: string
  environment: LockEnvironment
  log: (line: string) => void
}
const take = async (setup: ProbeLockSetup): Promise<ProbeLock | 'busy'> => {
  const result = await acquireProbeLock(setup)
  assert.ok(result !== undefined)
  return result
}

/** Tight pacing: every wait is a real duration, but a short one. */
const TIGHT = { waitMs: 400, pollMs: 20, attemptMs: 300, retryMs: 5, graceMs: 50 }

function withRoot(body: (root: string) => void | Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'probe-lock-'))
  return Promise.resolve()
    .then(() => body(root))
    .finally(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 20 }))
}

/** A real-clock environment whose sleeps are instant; every process counts as alive unless `over` says otherwise. */
function instantEnvironment(over: Partial<LockEnvironment> = {}): LockEnvironment {
  return {
    now: () => Date.now(),
    sleep: () => Promise.resolve(),
    pid: process.pid,
    isAlive: () => true,
    ...over,
  }
}

function claimFile(root: string, slot: string = SLOT_A): string {
  return join(root, '.llm', slot, PROBE_LOCK_CLAIM)
}

function writeTextClaim(root: string, text: string, lastWriteBefore: number, slot: string = SLOT_A): void {
  mkdirSync(join(root, '.llm', slot), { recursive: true })
  writeFileSync(claimFile(root, slot), text)
  if (lastWriteBefore !== 0) utimesSync(claimFile(root, slot), new Date(Date.now() - lastWriteBefore), new Date(Date.now() - lastWriteBefore))
}

function writeJsonClaim(root: string, claim: Record<string, unknown>, slot: string = SLOT_A): void {
  mkdirSync(join(root, '.llm', slot), { recursive: true })
  writeFileSync(claimFile(root, slot), JSON.stringify(claim))
}

function staleArchives(root: string, slot: string = SLOT_A): string[] {
  return readdirSync(join(root, '.llm', slot)).filter(name => name.startsWith(`${PROBE_LOCK_CLAIM}.stale-`))
}

test('both slots held by fresh claims are refused untouched, whoever wrote them, and the acquirer gives up naming the holders', async () => {
  await withRoot(async (root) => {
    const lines: string[] = []
    writeTextClaim(root, 'wf_other lane 2026-11-17T10:00:00Z\n', 0, SLOT_A)
    writeTextClaim(root, 'wf_third lane 2026-11-17T10:05:00Z\n', 0, SLOT_B)
    const before = readFileSync(claimFile(root), 'utf8')

    const result = await take({ ...TIGHT, root, holder: 'wf_mine land', environment: instantEnvironment(), log: (line: string) => lines.push(line) })

    assert.equal(result, 'busy')
    assert.equal(readFileSync(claimFile(root), 'utf8'), before)
    assert.equal(staleArchives(root).length, 0)
    assert.ok(lines.some(line => line.includes('probe-lock') && !line.includes('probe-lock-2') && line.includes('waiting') && line.includes('wf_other lane')))
    assert.ok(lines.some(line => line.includes('probe-lock-2') && line.includes('waiting') && line.includes('wf_third lane')))
    assert.ok(lines.at(-1)?.includes('probe-lock: wf_other lane') === true && lines.at(-1)?.includes('probe-lock-2: wf_third lane') === true)
  })
})

test('a fresh claim in the first slot does not block the run: the free or dead second slot is taken, the fresh one untouched', async () => {
  await withRoot(async (root) => {
    const lines: string[] = []
    writeTextClaim(root, 'wf_running lane heartbeat\n', 5 * MIN, SLOT_A)
    writeTextClaim(root, 'wf_dead land 2026-11-17T08:00:00Z\n', 40 * MIN, SLOT_B)

    const lock = await take({ ...TIGHT, root, holder: 'wf_mine land', environment: instantEnvironment(), log: (line: string) => lines.push(line) })
    assert.notEqual(lock, 'busy', 'the stale slot is taken over while the live one is waited out')
    if (lock === 'busy') return

    assert.equal(readFileSync(claimFile(root, SLOT_A), 'utf8'), 'wf_running lane heartbeat\n', 'the fresh claim is untouched')
    assert.equal((JSON.parse(readFileSync(claimFile(root, SLOT_B), 'utf8')) as { holder: string }).holder, 'wf_mine land')
    const archives = staleArchives(root, SLOT_B)
    assert.equal(archives.length, 1)
    assert.equal(readFileSync(join(root, '.llm', SLOT_B, String(archives[0])), 'utf8'), 'wf_dead land 2026-11-17T08:00:00Z\n')
    assert.ok(lines.some(line => line.includes('taken over') && line.includes('wf_dead land')))
    assert.ok(lines.some(line => line.includes('probe-lock') && !line.includes('probe-lock-2') && line.includes('waiting') && line.includes('wf_running lane')))
    await lock.release()
    assert.ok(!readdirSync(join(root, '.llm', SLOT_B)).includes(PROBE_LOCK_CLAIM))
    assert.equal(staleArchives(root, SLOT_B).length, 1, 'the evidence of the takeover outlives the release')
  })
})

test('the claim classification: a JSON claim dies with its pid, its stamp or its boot; a text claim dies with its mtime', async () => {
  await withRoot((root) => {
    const environment = instantEnvironment({ bootTime: () => 5_000_000_000 })
    writeJsonClaim(root, { pid: process.pid, startedAt: Date.now(), at: Date.now(), token: 't', holder: 'wf_live land' })
    assert.equal(judged(claimFile(root), environment).verdict, 'fresh')
    assert.ok(judged(claimFile(root), environment).holder.includes('wf_live land'))

    writeJsonClaim(root, { pid: 999_999_999, startedAt: Date.now(), at: Date.now(), token: 't', holder: 'wf_gone land' })
    const gone = judged(claimFile(root), instantEnvironment({ isAlive: pid => pid !== 999_999_999 }))
    assert.equal(gone.verdict, 'dead')
    assert.ok(gone.holder.includes('wf_gone land'))

    writeJsonClaim(root, { pid: process.pid, startedAt: Date.now() - 4 * 60 * MIN, at: Date.now() - 4 * 60 * MIN, token: 't', holder: 'wf_squatting land' })
    assert.equal(judged(claimFile(root), environment).verdict, 'dead', 'a stamp past the hold bound is stale even while the pid lives')

    writeJsonClaim(root, { pid: process.pid, startedAt: Date.now(), at: Date.now(), token: 't', holder: 'wf_preboot land', boot: 5_000_000_000 - 10 * MIN })
    assert.equal(judged(claimFile(root), environment).verdict, 'dead', 'a claim written before the last boot is stale')

    writeTextClaim(root, 'wf_hb lane\n', 31 * MIN)
    assert.equal(judged(claimFile(root), environment).verdict, 'dead', 'a text claim past the stale window is dead')
    assert.equal(judged(claimFile(root), instantEnvironment({ now: () => Date.now() - 5 * MIN })).verdict, 'fresh', 'judged five minutes ago it was still fresh')
  })
})

test('a dead JSON claim is taken over at once, named in the log', async () => {
  await withRoot(async (root) => {
    const lines: string[] = []
    writeJsonClaim(root, { pid: 999_999_999, startedAt: Date.now(), at: Date.now(), token: 't', holder: 'wf_crashed probe' }, SLOT_B)
    writeTextClaim(root, 'wf_running lane heartbeat\n', 5 * MIN)

    const lock = await take({ ...TIGHT, root, holder: 'wf_mine land', environment: instantEnvironment({ isAlive: pid => pid !== 999_999_999 }), log: (line: string) => lines.push(line) })
    assert.notEqual(lock, 'busy', 'the crashed claim goes; the live one is waited out')
    if (lock === 'busy') return
    assert.equal(readFileSync(claimFile(root), 'utf8'), 'wf_running lane heartbeat\n', 'the fresh claim of the other slot is untouched')
    assert.equal((JSON.parse(readFileSync(claimFile(root, SLOT_B), 'utf8')) as { holder: string }).holder, 'wf_mine land')
    assert.ok(lines.some(line => line.includes('taken over') && line.includes('wf_crashed probe')))
    await lock.release()
  })
})

test('a live text claim stays refused across heartbeats and is taken over only after the stale window of silence', async () => {
  await withRoot(async (root) => {
    const lines: string[] = []
    writeTextClaim(root, 'wf_hb lane heartbeat\n', 20 * MIN)
    writeTextClaim(root, 'wf_other lane heartbeat\n', 20 * MIN, SLOT_B)
    const options = { ...TIGHT, root, holder: 'wf_mine land', environment: instantEnvironment(), log: (line: string) => lines.push(line) }

    assert.equal(await take(options), 'busy', 'claims rewritten 20 minutes ago are fresh in both slots')

    writeTextClaim(root, 'wf_hb lane heartbeat\n', 40 * MIN)
    const lock = await take(options)
    assert.notEqual(lock, 'busy', '40 minutes without a rewrite is the documented stale rule')
    if (lock === 'busy') return
    assert.equal(readFileSync(claimFile(root, SLOT_B), 'utf8'), 'wf_other lane heartbeat\n', 'the still-heartbeated claim of the other slot is untouched')
    assert.equal(staleArchives(root).length, 1)
    await lock.release()
  })
})

test('two concurrent acquires on one free slot leave exactly one winner; the loser names the winner and a later acquirer wins after the release', async () => {
  await withRoot(async (root) => {
    const aLines: string[] = []
    const bLines: string[] = []
    // The second slot is held by a live claim, so both acquirers contend for the first one only.
    writeTextClaim(root, 'wf_running lane heartbeat\n', 5 * MIN, SLOT_B)
    const options = (holder: string, log: (line: string) => void) => ({
      ...TIGHT, waitMs: 1500, root, holder, environment: instantEnvironment(), log,
    })
    const firstPromise = take(options('wf_a land', line => aLines.push(line)))
    // A head start so the winner's create-to-write gap (milliseconds under the real pacing) is closed before the loser first judges: the loser must refuse a claim it can name, not an empty file.
    await new Promise(resolveSleep => setTimeout(resolveSleep, 50))
    const secondPromise = take(options('wf_b land', line => bLines.push(line)))
    const [first, second] = await Promise.all([firstPromise, secondPromise])

    const winner = first === 'busy' ? second : first
    const loser = first === 'busy' ? first : second
    assert.notEqual(winner, 'busy')
    assert.equal(loser, 'busy', 'one claim file, one winner')
    if (winner === 'busy') return
    const claim = JSON.parse(readFileSync(claimFile(root), 'utf8')) as { holder: string }
    assert.equal(claim.holder, winner.holder)
    const loserLines = first === 'busy' ? aLines : bLines
    assert.ok(loserLines.some(line => line.includes('waiting') && line.includes(winner.holder)), 'the loser refuses the winner by name')

    await winner.release()
    const third = await take({ ...TIGHT, root, holder: 'wf_c land', environment: instantEnvironment(), log: () => {} })
    assert.notEqual(third, 'busy', 'the released slot is free for the next acquirer')
    if (third !== 'busy') await third.release()
  })
})

test('the slots default to the main checkout, whichever checkout the probe runs from', () => {
  const root = mainCheckoutRoot()
  const commonDir = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' })
  assert.equal(commonDir.status, 0)
  const commonPath: string = String(commonDir.stdout).trim()
  assert.equal(resolve(commonPath), resolve(join(root, '.git')), 'the resolved root names the checkout whose .git is the common dir, so the slots are shared across worktrees')
})

test('an active unreadable/text lock whose mtimeMs advances with identical content resets the grace timer and is never broken early', async () => {
  await withRoot(async (root) => {
    const file = claimFile(root)
    mkdirSync(join(root, '.llm', SLOT_A), { recursive: true })
    const hbText = 'wf_hb lane identical heartbeat\n'
    let clock = 1_700_000_000_000
    writeFileSync(file, hbText)
    utimesSync(file, new Date(clock), new Date(clock))

    let sleeps = 0
    const env: LockEnvironment = {
      now: () => clock,
      sleep: (ms) => {
        clock += ms
        sleeps += 1
        // Heartbeat rewrites identical text every poll for 4 iterations (4s > 2s grace), advancing mtimeMs each time.
        if (sleeps <= 4) {
          writeFileSync(file, hbText)
          utimesSync(file, new Date(clock), new Date(clock))
        }
        return Promise.resolve()
      },
      pid: process.pid,
      isAlive: () => true,
    }
    const busy = await acquireLock(file, env, { retryMs: 1_000, waitMs: 4_500, unreadableGraceMs: 2_000, keepStale: true })
    assert.equal(busy, 'busy', 'identical-text heartbeat rewrites keep resetting the unreadable grace timer')
    assert.equal(staleArchives(root).length, 0)

    // Once heartbeats stop advancing mtimeMs, the stale timer expires after unreadableGraceMs.
    const taken = await acquireLock(file, { ...env, sleep: (ms) => { clock += ms; return Promise.resolve() } }, { retryMs: 1_000, waitMs: 5_000, unreadableGraceMs: 2_000, keepStale: true })
    assert.notEqual(taken, 'busy')
    if (taken !== 'busy') await taken.release()
  })
})

test('concurrent stale takeover produces exactly one winner and never unlinks another contender\'s newly created lock', async () => {
  for (const keepStale of [true, false] as const) {
    await withRoot(async (root) => {
      const file = claimFile(root)
      mkdirSync(join(root, '.llm', SLOT_A), { recursive: true })
      const now = Date.now()
      writeFileSync(file, JSON.stringify({ pid: 999_999_999, startedAt: now - 60_000, at: now - 60_000, token: 'expired', holder: 'dead-holder' }))
      const env = instantEnvironment({ isAlive: pid => pid !== 999_999_999 })
      const contenders = Array.from({ length: 6 }, (_, index) =>
        acquireLock(file, env, { retryMs: 20, waitMs: 80, staleMs: 10_000, keepStale, holder: `contender-${index}` }),
      )
      const results = await Promise.all(contenders)
      const winners = results.filter(result => result !== 'busy')
      assert.equal(winners.length, 1, `exactly one winner when keepStale=${String(keepStale)}`)
      const winner = winners[0]
      assert.ok(winner !== undefined)
      assert.equal(await winner.held(), true, 'newly created lock survives losing contenders\' stale cleanup')
      await winner.release()
    })
  }
})

test('acquireProbeLock probes all candidate slots immediately so an occupied slot 1 does not stall acquisition when slot 2 is free', async () => {
  await withRoot(async (root) => {
    // Slot 1 holds an empty/in-progress file with a long grace/attempt wait; slot 2 is free.
    writeTextClaim(root, '', 0, SLOT_A)
    const started = Date.now()
    const lock = await take({
      waitMs: 3_000,
      pollMs: 50,
      attemptMs: 2_500,
      retryMs: 20,
      graceMs: 2_000,
      root,
      holder: 'wf_fast land',
      environment: instantEnvironment(),
      log: () => {},
    })
    const elapsed = Date.now() - started
    assert.notEqual(lock, 'busy')
    assert.ok(elapsed < 1_000, `expected immediate failover to slot 2 without waiting attemptMs, took ${elapsed}ms`)
    assert.equal((JSON.parse(readFileSync(claimFile(root, SLOT_B), 'utf8')) as { holder: string }).holder, 'wf_fast land')
    if (lock !== 'busy') await lock.release()
  })
})
