# M7 step E3 follow-up: status

Iteration 3 (fix iteration for `review-e3-followup.json`, second pass, verdict CHANGES_REQUESTED: FU-4 blocking, FU-2 and FU-5 non-blocking). Date 2026-10-31. Worktree `.worktrees/m7`, branch `m7`, based on `main` 97d04ca; `main` has since moved (now b719074, graph commits only), the rebase step handles that. Graph node m7-5. No graph changes applied (brief).

## Review findings of this iteration

| Finding | Status | Commit | Test |
| --- | --- | --- | --- |
| FU-4 (blocking) hooks defined in git configuration still ran inside the executor's calls | fixed, failing-first. `GLOBAL_OPTIONS` in `src/execute/git.ts` now also carries `-c hook.post-checkout.enabled=false`, `-c hook.reference-transaction.enabled=false`, `-c hook.post-index-change.enabled=false` (built from `SWITCHED_OFF_HOOK_EVENTS`). The per-event switch turns off every hook of that event whatever its friendly name (git-hook documentation: `hook.<event>.enabled`; the friendly name may not be an event name). Header, ORCHESTRATION 17.5, design 6.5 row and 19.4 third "0.6 修订" bullet updated. | 2020868 | `tests/execute-git.spec.ts`: "hooks defined in git configuration do not run inside the executor's git calls (E3 follow-up review, FU-4)": 17 configuration hooks (the three events plus 14 sentinels), control 1 (plain git runs the three; no hook at all means the git does not read configuration hooks, skip with reason), control 2 (the three switches stop them on plain git; otherwise skip with reason), then the executor calls shared with the directory-hook case. The all-processes case also asserts the three new pairs. Run against the code before the change: 2 of 40 failed (this case, all-processes), 38 passed; the marker listed `reference-transaction`, `post-index-change`, `post-checkout`. Removing any one of the three events by hand fails both. With control 2's switches replaced by an unrelated option the case reports `# SKIP`, not pass. |
| FU-5 (non-blocking) "the only reference the executor writes" is inaccurate | fixed, wording only | 2020868 | none (comments, docs); the spec comments at the all-processes case and the gate-head case now say "with update-ref" / "under refs/hourness" |
| FU-2 (non-blocking) six commit messages end with `@@GATES@@` | left for the rebase step, as the review says (branch local only). Commits 10f7132, 72956a8, 5efa295, 5df10d8, 196fae9, 2d763c2. Before the merge `git log main..m7 --grep='@@GATES@@'` must print nothing. | none | none |

### One limit found while fixing FU-4 (needs a ruling, not a blocker)

The review's fix relies on `hook.<event>.enabled`. The git-hook documentation lists it from 2.55 (checked at git-scm.com/docs/git-hook/2.55.0); the 2.54.0 page lists only `hook.<friendly-name>.enabled`. Configuration hooks themselves are from 2.54 (released 2026-04-20; 2.55.0 on 2026-06-29). So on exactly git 2.54.x the three options would not stop configured hooks. This is read from documentation, not run on a 2.54 (only 2.55.0.windows.3 is installed). Direction of failure is the safe one: a trunk move by such a hook is classed as an outside advance (design 3.8.4). Not closed in code: the alternative is `git config --get-regexp '^hook\..*\.event$'` before each call and one `-c hook.<name>.enabled=false` per name, one more process per call (or a cached version probe) for one minor version. Stated in the git.ts header, ORCHESTRATION 17.5, design 6.5 and 19.4; the new case skips with the reason on such a git. If the independent reviewer or the person wants it closed, that is a separate change.

## The eight E3-own findings

"Failing-first" for E3-1..E3-5, E3-7, E3-8 was checked in iteration 1 by running the fix commit's test file against the source of the commit's parent: the named test fails there and passes on the fix. E3-6 failing-first: iteration 2 (3 of 39 failed) and iteration 3 (2 of 40 failed).

| Finding | Status | Commit | Test (file `tests/execute-git.spec.ts` unless noted) |
| --- | --- | --- | --- |
| E3-1 redirected `.git` file passes the gate guard | fixed, failing-first. `foreignGitDir` demands the same common dir, a git dir under `<common>/worktrees/`, and a `gitdir` back-pointer to this directory's `.git`; any git failure refuses (failure injection: 1857f9a). | 10f7132 | "a gate worktree whose .git file names another git directory is refused, whichever one it names, and nothing is reset (E3 review, E3-1)": the main checkout's `.git` (the review's case), another task worktree's record, another repository. |
| E3-2 commit made on the gate worktree's detached HEAD is abandoned | fixed, failing-first. Refuses with `gate_worktree_invalid` when no reference contains HEAD; the executor records the commit it leaves the worktree on in `refs/hourness/gate-head`; failure to read or record refuses (failure injection: 1857f9a). | 72956a8 | "a commit made in the gate worktree is not abandoned: the move is refused until a reference holds it (E3 review, E3-2)" (the review's case); "the commit the harness left the gate worktree on is held by a reference of its own...". |
| E3-3 unrestricted `run` exported | fixed, failing-first | 5efa295 | "the executor is a closed set of named operations..." |
| E3-4 `symbolic-ref --short` with a same-named tag | fixed, failing-first | 5df10d8 | "a tag named like the trunk does not hide the branch..." |
| E3-5 `LockEnvironment.bootTime` required | fixed, failing-first | 2d763c2 | `tests/execute-gate-lock.spec.ts` "an environment without bootTime still locks..." |
| E3-6 harness git calls run the repository's hooks | fixed. Hooks directory and fsmonitor: 6135e6d. Hooks defined in configuration: 2020868 (FU-4), with the 2.54.x limit above. | 6135e6d, 2020868 | the directory-hook case, the fsmonitor case, the configuration-hook case, the all-processes case |
| E3-7 `origin` fallback ignores a differently named only remote | fixed, failing-first | 196fae9 | "a repository whose only remote has another name publishes the trunk there..." |
| E3-8 lock takeover not atomic | first window fixed with `unreadableGraceMs` (default 0, rules board unchanged); second window left with reason (microseconds, not closable at file level; E7 calls `held()` before writing a check record and compares the gate worktree HEAD, design 6.3; ORCHESTRATION 17.6 says so) | 43662c6 | `tests/execute-gate-lock.spec.ts`: four cases on the grace, including the restart case |

Review findings E3-9, E3-10, E3-11 are not E3-own (E1b and E7).

## Decision on the uncommitted draft (iteration 1, unchanged)

Committed as its own concern, not discarded: 43662c6 `fix(lock): a file without content is taken over only after a grace for the gate lock (E3-8, m7-5)`. It implements the review's optional action for E3-8, defaults to 0 so the rules board keeps its behaviour, its tests fail without it, and it uses `src/data/lock.ts` (no second lock). Two changes to the draft: the grace timer restarts whenever the content tells something, the file vanishes or is taken over (new test); the stale test count in its doc line was fixed in a319e9a.

## Design

- 3.8.4 correction (five routes with verdicts, origin paragraph, E1b/E7 pointers, 19.4 record answering E3-9): was missing, written in iteration 1.
- 6.5 (iteration 2, authorised for the fix iteration): new row for the harness's own git calls and hooks; gate-worktree row mentions the E3-1 and E3-2 guards and `refs/hourness/gate-head`.
- 6.5 (this iteration, as FU-4 action 4 and FU-5 require): the hooks row now covers hooks from the hooks directory and from configuration, lists the five options, the events, the version boundary; the gate-worktree row says "the only reference written with `update-ref`" and that `ensureWorktree` creates and renames `hz/<task>`. 19.4 got a third "0.6 修订" bullet. Version number unchanged. `.agents/` is git-ignored, so none of this has a commit.
- Informational, not done: design 3.8.4 still reads "otherwise `origin`" where E3-7 changed the code; ORCHESTRATION 17.5 records the departure.

## Commits on m7 ahead of main (11)

```
2020868 fix(execute): the executor's git calls also run with the hooks defined in git configuration off (FU-4, FU-5, m7-5)
6135e6d fix(execute): the executor's git calls run with the repository's hooks and fsmonitor off (E3-6, m7-5)
1857f9a test(execute): pin that a git failure in the gate guard's reads and writes refuses the move (FU-3, m7-5)
43662c6 fix(lock): a file without content is taken over only after a grace for the gate lock (E3-8, m7-5)
a319e9a docs(execute): ORCHESTRATION 17.5 counts the 35 cases of tests/execute-git.spec.ts (m7-5)
2d763c2 fix(lock): LockEnvironment.bootTime is optional (E3-5, m7-5)
196fae9 fix(execute): trunkUpstream prefers the only remote over a made-up origin (E3-7, m7-5)
5df10d8 fix(execute): read the base branch as a full reference so a tag with the trunk's name cannot hide it (E3-4, m7-5)
5efa295 fix(execute): the git executor no longer exports its unrestricted run (E3-3, m7-5)
72956a8 fix(execute): gate worktree keeps a holder for the commit it was left on and refuses to abandon a commit made in it (E3-2, m7-5)
10f7132 fix(execute): gate-worktree guard refuses a .git file that names another git directory (E3-1, m7-5)
```

Working tree clean at 2020868.

## Branch gates, latest (tree = 2020868, run on the final tree before the commit)

| Gate | Result |
| --- | --- |
| `npm run build` | exit 0; no error or warning lines |
| `npm run preflight` | exit 0 (2 packages, 14 rows composed) |
| `npm test` | exit 0; 906 tests (sum of the per-file `# tests` lines; 905 before plus the one new case), 906 pass, 0 fail, 0 cancelled, 0 skipped, no `not ok` line; check-verbatim OK against 3.17.1; eslint ok (250 suppressed); knip ok (21 in baseline); jscpd ok (2 clones, 16 lines); check-secrets ok; `eslint-suppressions.json`, `knip-baseline.json`, `.jscpd-baseline.json` unmodified |
| `npm run probe` | exit 0; 128/128 passed |

No new compiler or checker warnings. `tests/execute-git.spec.ts` 40/40 (39 before), `tests/execute-gate-lock.spec.ts` unchanged at 24/24.

## Process notes

- A first mutation check of `git.ts` (PowerShell `Get-Content -Raw` then `WriteAllText`) re-encoded the file and turned every `§` in comments into `搂`. It was found by reading `git diff --stat` (69 lines for a 30-line change), repaired by replacing `搂` back to `§` (all four edited files scanned for `搂` and U+FFFD: none; first bytes match no BOM), and the four gates were re-run on the repaired tree. The committed diff of `git.ts` is 43 lines and contains only the intended changes.
- Several shell calls returned empty output while their child kept running; results were then read from log files. Gate logs were kept outside the repository (system temp directory) and are not part of any commit.
- Hand mutations of `git.ts` and the spec (event removed, switches replaced) were applied by script and reverted; none is in the commit.

## Not done / for the next step

- FU-2: reword the six `@@GATES@@` messages in the rebase step before the merge; `main` has moved since (b719074), so a rebase is needed anyway.
- The 2.54.x limit above: a ruling is wanted from the reviewer or the person (accept and keep documented, or add the per-name lookup).
- E3-10, E3-11 and the code for E3-9 are E1b/E7 work.
- Rebase and merge are for the later step; `.worktrees/m3*` untouched; `.worktrees/m7` left in place; nothing pushed.
