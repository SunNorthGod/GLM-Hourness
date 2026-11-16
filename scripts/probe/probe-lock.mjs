/**
 * The probe lock (docs/DEVELOPMENT.md §1.1 L3 row; the hardening after the
 * 2026-11-05 and 2026-11-17 overwrite collisions): the probe runner takes
 * its slot itself, through the repository's one file lock
 * (packages/hourness/dist/data/lock.js, built from src/data/lock.ts), before
 * the first scenario boots. Until this module the whole protocol was lane
 * discipline — create the slot directory, write `owner.txt`, heartbeat
 * rewrite, a hand-judged staleness — and nothing in code refused a fresh
 * claim, so a lane that skipped the check or judged it wrong overwrote a
 * running probe's owner and two probes shared the slot (2026-11-17: the
 * walk-review lane's re-run over the hback-paths lane's nine-minute-old
 * claim; one killed run, two forced re-runs; §7).
 *
 * The documented path shape stays: the slot directory `.llm/probe-lock` (or
 * `-2`) of the MAIN checkout — lanes run probes from worktrees, the slots
 * live in the main checkout's `.llm` — with the claim in `owner.txt`. The
 * claim itself is the lock module's JSON (`{pid, startedAt, at, token,
 * holder}`); the pid anchors liveness and the stamp is judged against a
 * bound beyond the longest probe run, so a live run is never taken over
 * mid-flight and a crashed one is takeover-able at once — the gate lock's
 * sizing (src/execute/gate-lock.ts), no heartbeat anywhere in the runner.
 *
 * A claim written as anything else — the text `owner.txt` the lanes wrote
 * under the old convention, and every non-runner hold to come — is refused
 * while its file was last written within the documented stale window (a
 * rewrite is the heartbeat) and taken over once it is older. A takeover
 * renames the displaced claim to `owner.txt.stale-<ms>` and logs its text,
 * which makes the report duty (§1.1: 写明删了谁的锁) automatic. Refusal
 * waits: the acquirer re-judges both slots until one frees, goes stale, or
 * the wait is spent, and names the holders it saw when it gives up.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acquireLock, realLockEnvironment } from '../../packages/hourness/dist/data/lock.js'

/** The two slots, in the order the convention prefers them. */
export const PROBE_LOCK_SLOTS = ['probe-lock', 'probe-lock-2']
/** The claim file inside a slot directory; the path shape the lanes wrote. */
export const PROBE_LOCK_CLAIM = 'owner.txt'
/** A text claim whose file was last written this long ago is stale (§1.1: 超过 30 分钟没有重写才算残留). */
const PROBE_LOCK_STALE_MS = 30 * 60_000
/** A JSON claim whose stamp is this old is stale even while its holder lives: longer than the longest probe run (the gate lock's sizing). */
const PROBE_LOCK_HOLD_MS = 3 * 60 * 60_000
/** A claim whose boot stamp differs from the current boot by more than this is stale; the tolerance absorbs rounding between two boot-time computations (the gate lock's value). */
const PROBE_LOCK_BOOT_TOLERANCE_MS = 120_000
/** How long the acquirer waits across both slots before it gives up: one other full probe plus margin. */
const PROBE_LOCK_WAIT_MS = 90 * 60_000
/** Pause between re-judgments of both slots. */
const PROBE_LOCK_POLL_MS = 30_000
/** One acquire attempt's wait: long enough to watch out a stale text claim's grace, short enough not to pin a slot that a freed one would serve better. */
const ATTEMPT_WAIT_MS = 5 * 60_000
/** How long content that parses to nothing (a foreign text claim, or a creator between creating the file and writing it) is watched unchanged before it is taken over. */
const UNREADABLE_GRACE_MS = 2 * 60_000
const RETRY_MS = 15_000

/**
 * The checkout whose `.llm` holds the slots: `git rev-parse
 * --git-common-dir` names the main repository's `.git` — from a worktree the
 * main checkout's, from the main checkout its own — so its parent is the
 * main checkout's root whichever checkout the probe runs from.
 */
export function mainCheckoutRoot() {
  const cwd = resolve(fileURLToPath(new URL('../..', import.meta.url)))
  const result = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd, encoding: 'utf8' })
  const dir = result.stdout.trim()
  if (result.status !== 0 || dir === '') throw new Error(`probe: cannot find the main checkout's .git from ${cwd}: ${result.stderr.trim() || `exit ${result.status}`}`)
  return resolve(dir, '..')
}

/**
 * What a slot's claim file says: `absent` (nothing to judge), `fresh` (a
 * claim something lives behind — refuse it, whoever wrote it), or `dead`
 * (nothing lives behind it; the next acquire takes it over). A JSON claim is
 * judged by its holder's liveness, its stamp and its boot; any other content
 * is the lanes' text claim, judged by the file's mtime — a rewrite is the
 * heartbeat. `holder` is what the logs name.
 */
export function judgeClaim(file, environment = realLockEnvironment) {
  let text
  let mtimeMs
  try {
    text = readFileSync(file, 'utf8')
    mtimeMs = statSync(file).mtimeMs
  }
  catch {
    return { verdict: 'absent', holder: '' }
  }
  const claim = parseClaim(text)
  if (claim !== undefined) {
    const holder = typeof claim.holder === 'string' && claim.holder !== '' ? claim.holder : typeof claim.pid === 'number' ? `unnamed claim (pid ${claim.pid})` : 'unnamed claim'
    if (typeof claim.pid === 'number' && !environment.isAlive(claim.pid)) return { verdict: 'dead', holder: `${holder}, pid gone` }
    const boot = environment.bootTime?.()
    if (typeof claim.boot === 'number' && typeof boot === 'number' && Math.abs(claim.boot - boot) > PROBE_LOCK_BOOT_TOLERANCE_MS) return { verdict: 'dead', holder: `${holder}, written before the last boot` }
    if (typeof claim.at === 'number' && environment.now() - claim.at > PROBE_LOCK_HOLD_MS) return { verdict: 'dead', holder: `${holder}, stamp ${Math.round((environment.now() - claim.at) / 60_000)} min old` }
    return { verdict: 'fresh', holder: typeof claim.pid === 'number' ? `${holder} (pid ${claim.pid})` : holder }
  }
  const holder = text.trim() !== '' ? text.trim().split('\n')[0] : '(empty claim file; a writer may be between creating it and writing it)'
  if (environment.now() - mtimeMs > PROBE_LOCK_STALE_MS) return { verdict: 'dead', holder: `${holder} (last write ${Math.round((environment.now() - mtimeMs) / 60_000)} min ago)` }
  return { verdict: 'fresh', holder }
}

function parseClaim(text) {
  try {
    const parsed = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : undefined
  }
  catch {
    return undefined
  }
}

/**
 * Take a probe slot for this run — the first of the two whose claim is
 * absent or dead — or `'busy'` when both slots stayed held by fresh claims
 * for the whole wait. A fresh claim is never touched; the loop re-judges
 * both slots every poll. A takeover renames the displaced claim (kept next
 * to `owner.txt`) and logs its holder before the attempt. `setup` replaces
 * the environment, the root directory (tests pass a temporary one), the
 * holder name, the whole wait, the pacing and where the lines go.
 */
export async function acquireProbeLock(setup = {}) {
  const environment = setup.environment ?? realLockEnvironment
  const root = setup.root ?? mainCheckoutRoot()
  const holder = setup.holder ?? process.env.PROBE_LOCK_HOLDER ?? 'probe-runner'
  const waitMs = setup.waitMs ?? PROBE_LOCK_WAIT_MS
  const pollMs = setup.pollMs ?? PROBE_LOCK_POLL_MS
  const attemptMs = setup.attemptMs ?? ATTEMPT_WAIT_MS
  const log = setup.log ?? (() => {})
  const deadline = environment.now() + waitMs
  const refused = new Map()
  for (;;) {
    for (const slot of PROBE_LOCK_SLOTS) {
      const dir = join(root, '.llm', slot)
      const judged = judgeClaim(join(dir, PROBE_LOCK_CLAIM), environment)
      if (judged.verdict === 'fresh') {
        refused.set(slot, judged.holder)
        log(`probe: ${dir} held by ${judged.holder} — waiting`)
        continue
      }
      mkdirSync(dir, { recursive: true })
      const lock = await acquireLock(join(dir, PROBE_LOCK_CLAIM), environment, {
        holder,
        retryMs: setup.retryMs ?? RETRY_MS,
        waitMs: attemptMs,
        staleMs: PROBE_LOCK_HOLD_MS,
        bootToleranceMs: PROBE_LOCK_BOOT_TOLERANCE_MS,
        unreadableGraceMs: setup.graceMs ?? UNREADABLE_GRACE_MS,
        keepStale: true,
      })
      if (lock !== 'busy') {
        if (judged.verdict === 'dead') log(`probe: ${dir} taken over from ${judged.holder}; the old claim is kept as ${PROBE_LOCK_CLAIM}.stale-* next to the new one`)
        else log(`probe: ${dir} claimed for ${holder} (pid ${environment.pid})`)
        return {
          holder,
          release: () => lock.release(),
        }
      }
      // Someone won the slot between the judgment and the attempt; the next pass re-judges.
      refused.set(slot, 'a claim written while this acquirer was trying')
    }
    if (environment.now() >= deadline) {
      log(`probe: both lock slots stayed held for ${Math.round(waitMs / 60_000)} min — ${PROBE_LOCK_SLOTS.map(slot => `${slot}: ${refused.get(slot) ?? 'free'}`).join('; ')}`)
      return 'busy'
    }
    await environment.sleep(pollMs)
  }
}
