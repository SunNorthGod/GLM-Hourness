# data-journal-lock-flake: verification report

Outcome: GREEN_NO_CHANGE. No code change; the fix already on main (829236b0) holds.

## Cause

Product lock race, not the test fixture. `appendJournal` passed no `unreadableGraceMs`, so the shared lock (`src/data/lock.ts`) took over a lock file without content at once. A live writer between `open(wx)` and writing its content was read as an empty file and its lock was renamed to `.lock.stale-<ms>`; the two-process case then failed on "no lock is left behind". Fix in 829236b0: M5's lock options take `unreadableGraceMs` 500 (shorter than the 2 s wait, so an empty file left by a crashed creator is still taken over within one append).

## Run under load

Tree: branch `data-journal-lock-flake` at 41471aed (parent 829236b0). `node --experimental-strip-types tests/data-journal.spec.ts` run 20 times, exit code read from `$LASTEXITCODE` after each run, while one full `npm test` ran in the background in the same worktree (started 2026-11-06T17:06:12+08:00; still running after every one of the 20 runs; it later exited 0).

Exit codes in run order: 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.

No `j.jsonl.lock.stale-*` file was left in any scratch directory created during the runs. Event log: `loop/events.log`.

## L2

`tests/data-journal.spec.ts`:

- "M5's lock options: an empty lock file (its creator between creating and writing it) is taken over only after it stayed empty for 500 ms, and not when its creator writes it meanwhile": an empty lock is taken over after 500 to 600 ms and kept as `.stale-`; when the creator writes its lock during the grace, the append ends `{ status: 'busy', lockLost: false }`, the lock file still holds the creator's token, nothing is written.
- "M5's lock options: a lock older than 30 seconds is taken over and kept as .stale-, a younger one is waited for for 2 seconds": a 1 s old lock of a live pid is waited for 2 s and not taken over.

Together these pin that a lock held by a live owner (written, or still being written within the grace) is not taken over.

## Docs

- `docs/DESIGN.md`, M5 storage paragraph on `src/data/journal.ts`: lock options include "读不出内容的锁连续看到 500 毫秒才接手" with the 2026-11-06 cause.
- `docs/ORCHESTRATION.md` §17.6, take-over bullet: "M5 的流水取 500 毫秒，小于 2 秒的等待，2026-11-06 加".
