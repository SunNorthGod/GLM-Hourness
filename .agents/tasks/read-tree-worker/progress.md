# read-tree-worker lane progress

Branch `read-tree-worker` off main `3f756378`. Worktree `.worktrees/read-tree-worker`.

## Stage 1 — investigation (2026-11-14)

### What the gap was

A dispatched worker's `git read-tree` (also `update-index`, `git apply --cached`/`--index`) writes the
index directly. The index is not under the worktree directory, so §3.2.4 step 1's directory bound
(`src/guard/execute-rules.ts` `judgeGitCall`: repo options and `dir` confined to `facts.root`) did not
restrain it. Judgment paths before the fix:

- worker **with** a worktree: `judgeGitCall` had no read-tree case; it fell through to `gitRisk`
  (src/guard/git-snapshot.ts:213 — only `-u` classifies as `discard`), so plain `git read-tree <tree>`
  passed with no §3.2.4 judgment, and `--index-output` could point the write at any index, including
  the main checkout's.
- dispatch **without** a worktree: the calls resolve to the main checkout's index — the state the main
  agent and the merge checks read — and only `read-tree -u` was snapshot-gated there.
- reviewer / dispatched-chain read-only subagent: already denied (`it is not a read`, GIT_READ_ONLY list).
- non-dispatched sessions (main agent, ordinary): not §3.2.4's subject; the main agent's git is governed
  by M3's snapshot rule (m7 design.md §3.2.4 preamble), plain read-tree is not snapshot-gated there by design.

### Person-approved semantics (HANDOFF §10 item 1④, approved 2026-11-13)

The only index a worker may write is its own worktree's. Concretely, in `judgeGitCall`:

- read-tree, update-index, and `apply --cached`/`--index` are index writes;
- a dispatch without a registered worktree has none of its own → every such call is denied
  (`it writes the index of the main checkout`);
- with a worktree, `--index-output` is the one argument that can still point the write outside →
  absolute, relative and unreadable spellings denied; in-worktree plain index writes pass;
- `read-tree -u` keeps the existing snapshot gate (gitRisk `discard` → takeSnapshot first).

### Already landed

The change is in main: commit `5a3c5d53` "worker-git: deny index-writing plumbing aimed at the main
checkout" (2026-11-13 02:40 +0800, smallfixes lane), ancestor of `3f756378`. It added
`INDEX_WRITE_SUBS` (execute-rules.ts:193), the judgment block (:264-278), synced docs in the same
commit (ORCHESTRATION.md §17 worker-git entry, dated 2026-11-13; HANDOFF §10 item 1④ moved to fixed),
and L2 in tests/execute-row.spec.ts:285 (in-worktree pass, `--index-output` absolute/relative,
no-worktree denial, `apply --cached`). Gates recorded there: build 0, preflight 0, npm test 0 (3746),
ratchets 73/18/1. Probe 605/605 is the post-fix baseline, as the brief states.

Guard-internal read-tree (git-snapshot.ts:1261 `read-tree HEAD` conflict fallback, :1292
`read-tree --empty` untracked-tree save) are `execFile` subprocesses from the plugin process; they
never traverse `tools/pre-execute`, so no listener judgment can catch them. The landed change did not
touch git-snapshot.ts. The :1292 path is exercised by tests/git-snapshot.spec.ts:211 (clean -fd
untracked save); the :1261 conflict fallback has no direct L2 — pre-existing M3 residual
(m3 design-addendum §10), unchanged by this work.

### Remaining for this lane

The brief's L2 list has two cases the landed test does not pin:

1. a reviewer's read-tree is denied (`it is not a read`);
2. a session outside the dispatched chain is not worker-git's subject (its read-tree passes the row).

Add both as assertions in the existing index-write test (same subject, same seam). No behavior change;
docs already describe the landed behavior, so no doc edits. Then the full gate chain before anything
lands on main: build → preflight → test → probe 605/605, ratchets flat (73/18/1).

## Stage 2 — tests added (2026-11-14)

tests/execute-row.spec.ts, the index-write judgment test (:285): added the reviewer case
(role `review`, `git read-tree HEAD` denied with `it is not a read`) and the outside-the-chain case
(an unregistered session without `origin: 'subagent'` passes — not §3.2.4's subject). Title updated.
No src change; the behavior itself is 5a3c5d53's.

Next: gates once the probe lock frees (m7-p3 lane holds it), then one commit
`test(execute): the index-write judgment pins the reviewer and the outside-the-chain case`,
ff-merge to main, push origin + github mirror.


## Stage 3 — resumed after ZCode restart (2026-11-15)

Re-read progress; confirmed branch state: the test commit was intact. Rebased the branch onto
main `a8db4928` (only a docs commit above the old merge-base `3c8d425b`; `1a4311e5` was already
an ancestor, so the waterfall composition was already handled when the tests were written).
Rebase needed an explicit git identity via env vars (no user.email/user.name configured anywhere);
new tip `2f314a87`, linear on main. Probe locks were free at check time. Now running gates:
build → preflight → test → lint ratchets (73/18/1) → probe 608/608.

### Gates on 2f314a87 (2026-11-15)

- build: 0 (dtree2-build.log). Note: the worktree node_modules is a pnpm install; the earlier
  `ls node_modules/.package-lock.json` probe was an npm-ism and short-circuited the first attempt,
  build itself was never run then.
- preflight: 0 (dtree2-preflight.log; 23 rows composed, both clients built).
- npm test: 0 — 234 segments, all `# fail 0` (dtree2-test.log).
- lint ratchets: 0 — eslint 73 suppressed, knip 18, jscpd 1 (7 duplicated lines), flat (dtree2-lint.log).
- probe: running under `.llm/probe-lock` (owner.txt dtree2 heartbeat every 5 min, unset
  GIT_CONFIG_COUNT/GIT_CONFIG_KEY_0/GIT_CONFIG_VALUE_0), floor 608/608. Log dtree2-probe.log.

- probe: 608/608 passed (dtree2-probe.log, exit 0, floor met). Lock released after stopping the
  heartbeat; owner.txt verified as dtree2's before removal.

## Stage 4 — landed (2026-11-16)

- ff-merge to main in the main checkout: a8db4928..2f314a87 (only tests/execute-row.spec.ts,
  +11 lines -1). porcelain --untracked-files=no empty before and after the land build; land build
  exit 0, packages/*/dist/build-info.json commit = 2f314a8 = HEAD (log in $TEMP/dtree2-land-build.log,
  outside the repo).
- Pushed origin (Gitee) main a8db4928..2f314a87. The github push first failed on the Git Credential
  Manager token; retried with an inline gh credential helper (git -c credential.helper=
  -c credential.helper='!gh auth git-credential' push github main — no config files changed):
  a8db4928..2f314a87 landed on the mirror too.
- Lane done: the two L2 scope cases are pinned on top of 5a3c5d53's behavior; no src change in
  this lane; branch left for the orchestrator to delete.
