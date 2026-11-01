# Git executor, gate lock and LockOptions (M7 step E3)

E3 (commit d8c1541 on `m7`, the only commit ahead of `main`) adds `src/execute/git.ts`, the executor for every git process the harness starts for itself, `src/execute/gate-lock.ts`, the lock around the gate worktree, and `LockOptions` on the shared `src/data/lock.ts`. Nothing calls any of it yet; E4 and E7 are the first callers. The executor has no operation that moves the local trunk or the remote-tracking reference, starts no network command except a read-only `ls-remote` limited to remote names, and puts `--no-replace-objects` on every process through one funnel. The gate worktree's three destructive commands run only after a snapshot is saved, and a failed or throwing saver stops them. The shared lock gave identical results to the old one in every default-option scenario I ran against both.

Watch for: the gate-worktree guard lets two states through that it exists to stop, a `.git` file redirected to the main checkout's git directory and a clean detached HEAD whose commits no ref holds (both confirmed by running them; non-blocking because no caller exists before E7 and the harm is bounded); `LockEnvironment.bootTime` is now required and called on every acquire (confirmed; no in-repo caller affected); and the pre-execute table in design §3.8.4 omits five routes that move the local trunk to an unchecked commit (confirmed by running git; scheduled to E1b and E7).

**Verdict**: APPROVED

Method: design 0.6 §3.1.2 step 4, §3.2.4, §3.8.3, §3.8.4, §6.3, §8.1 (E3 row) and R5-N6; the `design-context.md` rulings on the lock; the diff `main...HEAD`; the coder's recorded results in the commit message (build, preflight, 890 tests, lint baselines), none re-run. Where a claim needed evidence I ran the module in throwaway repositories under the system temp directory and removed them afterwards. Not checked: L3 or L4 behaviour, the real `takeSnapshot` (M3 is not in `main`), non-Windows behaviour. No code, graph or `.worktrees/m3*` file was touched.

## High-level view

The executor is a closed set of named, argument-checked operations over one process funnel. The only subcommands that change anything are `worktree add/remove`, `branch --move` on `hz/<task>`, and the gate worktree's `checkout --detach --force`, `reset --hard` and `clean -fd`; none writes `refs/heads/<trunk>` or the remote-tracking reference. The one gap in that closure is `run`, exported on the returned object with no callers.

The gate worktree is the only place that discards work. Snapshots are saved first, one per kind of change, and any failure refuses before a command runs. The guard that decides whether the directory is really the harness's gate worktree holds for every state the tests name and for a junction replacing the directory, and fails for two other states.

Rework is judged by ancestry as the design says. The remote-tracking reference and its reflog are read with the command §3.8.4 gives; deciding what a change means is E1b and E7. The shared lock keeps its old behaviour for the rules board, and its takeover step is not atomic, which matters more for a lock held for minutes than for one held for milliseconds.

<details>
<summary>Issues (11)</summary>

1. **Redirected `.git` file passes the gate guard** (confirmed, non-blocking) — with the gate worktree's `.git` rewritten to `gitdir: <main>/.git`, `prepareGateWorktree` ran its destructive commands against the main checkout's repository and left that checkout's HEAD detached. Require `rev-parse --git-dir` to differ from `--git-common-dir` in `prepareGateWorktree`; fix before E7 calls it.
2. **Abandoned detached-HEAD commits are not snapshotted** (confirmed, non-blocking) — a commit made in a clean gate worktree is dropped from every ref by the next `checkout --detach --force`; only the worktree reflog keeps it. Refuse, or save a ref, when no ref contains HEAD, or compare with the last-left commit from E7's records; fix before E7 calls it.
3. **Unrestricted `run` on the executor** (confirmed, non-blocking) — `git.ts:639` exports it, nothing uses it, and it accepts any arguments, including `merge`, `push` and `update-ref`. Remove it from the returned object; E7 adds named methods for what it needs.
4. **Branch name from `symbolic-ref --short` is ambiguous when a tag has the same name** (confirmed, non-blocking) — `ensureWorktree` creates the worktree and branch, then refuses with `cannot read the tip of heads/main`, and does so on every later call. Read `symbolic-ref --quiet HEAD` and strip `refs/heads/`.
5. **`LockEnvironment.bootTime` is required and always called** (confirmed, non-blocking) — an environment object without it makes every `acquireLock` throw a `TypeError`, even with no options. Make it optional or call it only when `bootToleranceMs` is set. The header comment of `lock.ts` still lists the old four content fields.
6. **Harness git calls run the repository's hooks** (confirmed mechanism, non-blocking, needs a decision) — a `core.hooksPath` `post-checkout` script ran during the gate worktree's `worktree add` and `checkout --detach`. The design files a trunk move caused this way under "outside advance" (no evidence, no violation). Decide whether harness calls pass `-c core.hooksPath=` and `-c core.fsmonitor=false`.
7. **`origin` fallback ignores a differently named only remote** (confirmed, non-blocking) — a repository whose only remote is `upstream`, with no configured upstream for the trunk, gets `refs/remotes/origin/main`, a reference that never exists, so pushes to the real remote are unwatched. The design says "otherwise `origin`"; prefer the only remote when there is exactly one.
8. **Lock takeover is not atomic** (likely, non-blocking) — an empty file (creator between `open` and `writeFile`) reads as unparsable and is taken over at once, and the re-read-then-rename step can move a successor's fresh lock aside. The gate holder must call `held()` before it writes the check record; scheduled to E7.
9. **Trunk-moving routes missing from the §3.8.4 table** (confirmed, scheduled to E1b and E7) — `git push . <rev>:<trunk>`, `git branch -M <x> <trunk>`, `git worktree add -B <trunk> …`, `git pull . <src>:<trunk>` and `git symbolic-ref refs/heads/<trunk> …` each moved the local trunk to an unchecked commit when the main checkout was on another branch; `git push . <rev>:refs/remotes/<up>/<trunk>` writes the tracking reference. Add them to the classifier and to E7's must-fail list.
10. **Contract items E7 must supply or handle** (confirmed, scheduled to E7) — the default-branch lookup through `refs/remotes/origin/HEAD` and `git remote get-url` are not in E3; `reflogSubject` returns `undefined` when the reflog is gone, and that has to count as push-class; a push to `.` writes the subject `push`, which `reflogKind` returns as `unknown`.
11. **Bind the snapshot seam to `refs/hourness/snapshots/` and test the refusal with the real function** (likely, scheduled to E7) — E3 types the saver only, and M3's refusal of snapshot-ref pushes is in M3's design, not in `main`. E7's independent review should check that gate snapshots land in that namespace and that a failing `takeSnapshot` refuses.

</details>

<details>
<summary>Details</summary>

### Snapshot before every discard in the gate worktree

The only commands in E3 that destroy anything are `checkout --detach --force`, `reset --hard` and `clean -fd` in `prepareGateWorktree` (`git.ts:582`). Before them, `uncleanFiles` runs `status --porcelain -z --untracked-files=normal --no-renames`, so `status.showUntrackedFiles` and rename settings cannot change what it sees. Then `saveSnapshot(path, {sub:'reset', args:['--hard']}, 'discard')` runs if any tracked file differs and `{sub:'clean', args:['-fd']}` if any non-ignored untracked file exists (`git.ts:574-581`). The second call goes beyond §3.8.3, which names only the `reset` snapshot; the coder's reason is that M3's `reset` snapshot keeps only untracked files that block the reset, so `clean -fd` would delete the rest unrecorded.

A saver that returns `{ok:false}` or throws gives `gate_snapshot_failed` before any command runs. `tests/execute-git.spec.ts` pins both, checks that HEAD, a tracked edit and an untracked file survive each refusal, and that the saver sees the files still on disk. All snapshots are saved in one loop and all three commands run in a second, so a later snapshot failing cannot follow a command that already ran.

Two kinds of loss carry no snapshot. Ignored files go when a task worktree is removed: `worktree remove` without `--force` refuses an unclean tree but deletes `node_modules`; §6.3 accepts that, and M3's addendum only logs ignored paths for the main agent's own removal. The other is the abandoned-commit case in the guard section, which is a real gap.

### Snapshots stay on the machine

E3 contains no `push`, `fetch`, `pull`, `update-ref` or `merge`. The subcommands the module can start are `branch`, `check-ignore`, `checkout`, `clean`, `diff`, `for-each-ref`, `log`, `ls-remote`, `ls-tree`, `merge-base`, `reflog`, `remote`, `reset`, `rev-parse`, `status`, `symbolic-ref` and `worktree`. The one command that contacts a remote is `ls-remote`, and `lsRemote` accepts only a name matching `^[A-Za-z0-9][A-Za-z0-9._-]*$`; the test rejects `--upload-pack=x`, `ext::sh` and an `https://` URL before any process starts, and an unconfigured plain name made `ls-remote` fail locally with exit 128. The snapshot seam returns only `{ok}` or a reason and takes no remote.

The snapshot refs sit in the repository and could be pushed by a shell command. The current M3 addendum (§2.5) refuses `push --mirror`, `push --tags` and any refspec that pushes snapshot refs for the main agent, and §3.2.4 item 3 refuses worker `push` outright. Neither is in `main` yet, so the property cannot be tested end to end today (finding 11).

### What can move the trunk

Through E3's own code, nothing. `branch --move` takes `hz/<task>` and an archive name built from it, and a task id matches `^[a-z][a-z0-9-]{0,47}$`; `worktree add -b` creates a new branch; the destructive three run only in a detached gate worktree that passed the guard.

An alias cannot reach it. I set `alias.status` and `alias.reset` to shell commands and ran `prepareGateWorktree` twice; neither alias ran, because git ignores aliases named like built-ins and all 17 subcommands above are built-ins. A hook script does run. With `core.hooksPath` pointing at a `post-checkout` script, the script ran during the creating `worktree add` and during `checkout --detach`, so anything the repository's configuration can execute executes inside harness git calls (finding 6). A trunk move made by such a script happens outside any agent shell call; §3.8.4 classes it as an outside advance, with no evidence, no violation, and a full trunk check afterwards.

Refspecs that write the tracking reference, `pull` on the trunk, and scripted git are classified by E1b's `pushOk` and `advanceOk` and by E7's pre- and post-execute listeners; E3 has no part in them. I tested what the design's table leaves out, because the table decides what E1b writes. With the main checkout on a feature branch, each of these moved `refs/heads/main` to the feature commit: `git push . feature:main`, `git branch -M feature main`, `git worktree add -B main ../wt feature`, `git pull . feature:main`, `git symbolic-ref refs/heads/main refs/heads/feature`. The `pull` row covers only a checked-out trunk and the refspec row names only `fetch`. The post-execute comparison still catches all five afterwards through its "not established" branch, so the gap is in prevention. `git push . feature:refs/remotes/origin/main` moved the tracking reference while `ls-remote` still showed the real remote unchanged, which is the case `lsRemote` exists for; its reflog subject was `push`, so the "everything but fetch is a push" rule also catches it afterwards (finding 9).

### The no-replace-objects flag

Every process goes through `run` in `createGit` (`git.ts:302`), which prepends `--no-replace-objects`, and `execFile` at `git.ts:61` is the only spawn in the file; `ensureIgnored` and `projectOf` read files without git. The test records the arguments of 25 or more processes from every method except `run` and asserts the first argument of each. A second test replaces a commit's tree with another's: plain `git diff` is blind to the change while `changedFiles`, `entryAt` and `sameContent` see it. `realGitRunner` and `execRunner` are exported, so a caller who invokes them directly skips the flag; nothing does. `run` itself is finding 3.

### Rework judged by ancestry

`lastTaskCommit` finds the newest commit on the base branch whose trailer block names the task, by whole id so `m7-1` ignores `m7-10`. `ensureWorktree` asks `merge-base --is-ancestor M refs/heads/hz/<task>`: ancestor, or no `M`, reuses the branch; otherwise it removes a clean old worktree without `--force`, renames the branch to the first free `hz/<task>@<n>` and creates a new branch and worktree from the base. An unclean old worktree gives `worktree_dirty` with the file list and changes nothing. The spec runs a squash merge (renamed, reused within the same rework, renamed to `@2` after a second squash) and a fast-forward (reused). A fast-forward or ordinary merge keeps the branch's own trailer commit in the trunk's history, so such a branch is reused; that is the rule as the design writes it. The base comes from `symbolic-ref --short`, which returns `heads/main` when a tag `main` exists; I ran that case and `ensureWorktree` created the worktree, then failed to read the tip and refused (finding 4).

### The tracking reference and its reflog

`trunkUpstream` takes the remote of the trunk's configured upstream, else `origin`, and returns `undefined` with no remote. `trunkRefs` reads L and T in one `for-each-ref` call, so they are one consistent pair. `reflogSubject` runs `reflog show --format=%gs -n 1 <T> --`, the command in §3.8.4, and `reflogKind` maps `fetch…` and `pull…` to `fetch`, `update by push…` to `push`, and the rest to `unknown`. Against a bare remote: after `git push -u` the subject was `update by push`; with the reflog directory deleted the value was `undefined`; after `git push . feature:refs/remotes/origin/main` the subject was `push`, kind `unknown`. A spoofed `update-ref -m "fetch …"` reads as a fetch, which the `reflogKind` comment records and which is why §3.8.4 also requires a `fetch` or `pull` of the upstream in the same call; that corroboration is E7's. With only a remote named `upstream` and no configured upstream, `trunkUpstream` returned `origin` (finding 7).

### The gate-worktree guard

The guard demands that git lists the path, that the directory exists, that the head is detached, that `rev-parse --show-toplevel` from the path equals the path, and that the target resolves to a commit. The spec covers a branch checked out in the worktree, its `.git` file deleted, the directory deleted while git still lists it, an unknown directory of that name, and an unresolvable commit; each refuses and changes nothing. I added a junction from `.worktrees/hz-gate` to the main checkout: refused with `gate_worktree_invalid`, the main checkout's file and HEAD untouched.

Two states pass. With the `.git` file rewritten to `gitdir: <main>/.git`, `rev-parse --show-toplevel` still returns the gate path and the listing still reports the stale detached record. The saver was called once (`reset --hard`), the three commands ran against the main checkout's repository, the `main` branch ref did not move, and the main checkout's HEAD went from `refs/heads/main` to detached (finding 1). The actor needs write access to a hidden file inside a harness directory, and a check command that runs worker-authored code in that directory can already do more, so I rate this a hardening gap. The second state is a commit made on the gate worktree's detached head. With a clean tree `prepareGateWorktree` made zero saver calls and moved HEAD, and `for-each-ref --contains` then listed no ref for the commit; the object and the worktree reflog still held it (finding 2). §3.8.3 says that if the main agent has touched the directory, refuse. The implementation checks two ways it could have been touched, and it has no recorded last-left commit to compare against until E7.

Both are non-blocking. `prepareGateWorktree` has no caller before E7, so no destructive command can run from `main` today, and E7 is itself on the independent-review list. Both fixes belong in E3's file and are a few lines each; they should land before E7 wires the call.

### The shared lock after LockOptions

Defaults are unchanged. I ran the previous `lock.ts` (from `main`) and the new one through the same script with the rules board's call shape (no options, a fake clock): a dead holder is taken over, a live fresh holder gives `busy` after exactly 2000 ms in 80 sleeps of 25 ms, release removes the file, a live holder older than `STALE_LOCK_MS` is taken over, unparsable content is taken over, a taken-over holder sees `held()` false and does not delete its successor's lock, and no `.stale` file appears. All nine results were identical. The one visible difference is two extra keys in the lock file, `boot` and `holder`; nothing in `src` reads the lock's content except `lock.ts`. The two in-repo callers (`rules/engine.ts`, `rules/repo.ts`) pass no options, and the test helper `impatientLock` spreads `realLockEnvironment`, so it inherits `bootTime`. The type change is finding 5: an environment object written for the old interface throws `environment.bootTime is not a function` on every acquire, because `boot` is written whether or not it is ever compared. No such object exists in the repository.

R5-N6 asks for retry interval, maximum wait, staleness age and boot tolerance as options, each tested with the gate's values and M5's. All four are options and `tests/execute-gate-lock.spec.ts` runs each once with 5 s, 60 min, 6 h, 120 s and once with 50 ms, 2 s, 30 s, 120 s. Staleness uses the `at` stamp the holder wrote instead of the file's modification time; the file is never rewritten, so the two agree, and the injected clock keeps the tests off the file system. On this machine `Date.now() - os.uptime() * 1000` was within 0.3 s of Windows' `LastBootUpTime` and did not drift over two seconds.

`gate-lock.ts` calls `acquireLock`, so it is not a second file lock. It adds an in-process queue (a promise chain keyed by lock path) so holders in one process take turns and hand over without waiting for the next 5 s poll. Exclusion still comes from the file, so the ruling that `src/data/lock.ts` is the repository's only lock holds. The queue is mechanism the design did not ask for; it is small and tested.

The takeover step is where the gate's use differs from the rules board's. The rules board holds the lock for milliseconds and checks `held()` and a revision before it writes. `tryCreate` opens with `wx` and writes in a second step, and `isAbandoned` treats content that does not parse as abandoned, so a waiter that reads between the two takes over a lock whose creator is alive. The re-read-then-`rename` can also move a successor's fresh lock aside if the successor creates it between the waiter's re-read and its rename. Both windows are microseconds and come from the rules board's code; the rename follows the same pattern as the old `unlink`. For a lock held for up to an hour the cost of losing is two checks sharing the gate worktree. Design §6.3 already requires E7 to compare the worktree HEAD before it writes a result, and `held()` is on the returned lock; E7 should call both (finding 8). I did not reproduce the race.

</details>

<details>
<summary>File map</summary>

- `src/execute/git.ts` (new): process funnel, parsers, worktrees, gate worktree guard and snapshot-first reset, change list, content comparison, trailers, trunk and reflog reads, `ls-remote`, watched-file digest.
- `src/execute/gate-lock.ts` (new): gate lock values, self-ignoring `<exec>` directory, in-process queue.
- `src/data/lock.ts`: `LockOptions`, `bootTime`, `boot` and `holder` in the file, `keepStale`.
- `tests/execute-git.spec.ts`, `tests/execute-gate-lock.spec.ts` (new): real repositories with a bare remote; lock options once with the gate's values and once with M5's.
- `package.json`: both specs added to `npm test`.
- `docs/ORCHESTRATION.md` (§16.3, §17 heading, new §17.5 and §17.6) and `docs/HANDOFF.md` (lock pointer): documentation of the above.

Full diff: `git -C .worktrees/m7 diff main...HEAD`.

</details>
