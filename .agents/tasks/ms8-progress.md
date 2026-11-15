# metrics step 8 (practice-exercise runner) progress

Lane: metrics-s8, worktree .worktrees/metrics-s8, base origin/main e09a269e.
Task: metrics design §12 step 8 — each calibrate run's result.json gains a
`metrics` section computed with the pipeline's own formulas (calc.ts);
acceptance (§13): section vs runner's own scoring agree on steps, tool
calls, credits. L2 for the pure part; one real run, two tasks two model
tiers (credits pre-authorized, norm-decision-tiers).

## Stage 0 — reading (done 2026-11-14 08:50 +08:00)

- Spec read: design.md §12 step 8 (row), §2 标定结果 row (line 155: journal
  lands in ws/.llm/metrics, section uses the same formulas), §3 line 214,
  §13 练习题 line. HANDOFF §8 指标 row「还缺什么」= 「第 8 步练习题运行器」.
- Graph: m7-10 acceptance is M7's fence/set/collection list; its
  2026-11-12 comment says 练习题运行器即 metrics 第 8 步. question-37 is the
  person-rewritten acceptance (option A). This lane implements the metrics
  step; the graph comment at merge time reports it.
- Key facts verified in code:
  - Sandbox: glmsandbox profile links main checkout packages; the bundle
    patch enables glm-hourness/metrics by default (no disable in the
    profile patch), so run events land in <ws>/.llm/metrics/.
  - src/metrics/observe.ts: `llm` events carry (turn, step), credits
    (plan.charged = chargedCredits, 4dp), peak; `tool` one event per call.
  - credits formula shared: creditPricing.charged === chargedCredits; the
    runner's creditsOf uses the same, so cross-check diffs only from the
    `at` instant and rounding order.
  - Node 22.20 imports src/*.ts from .mjs without flags (verified live).
  - scripts/smoke-zcode.mjs precedent for scripts importing src .ts.
- Decisions:
  - Section shape: { basis, steps, toolCalls, credits } — the three
    acceptance numbers plus the F8 basis line. No rendered score groups in
    result.json (result.json is machine-consumed; acceptance names three
    numbers; recorded as an interpretation note).
  - New export runTotals in src/metrics/calc.ts (same filters as the score
    table: llm with step and no purpose; tool count; credits sum 4dp).
    CALC_VERSION unchanged (no accounting rule change).
  - Glue in new scripts/calibrate/metrics.mjs (readLog + checkLog + window
    + runTotals + compare) — run-calibrate.mjs has import-time side effects
    (rules gate), so the testable glue lives in its own module. Deviation
    from §12's file list (adds scripts/calibrate/metrics.mjs) recorded.
  - Harness artifacts (.llm/metrics/, .llm/metrics-key) excluded from the
    runner's changedFiles so strayFiles stays meaningful.
  - Cross-check mismatch => stderr warning, not a run failure (a pipeline
    finding, not a model result).
- Locks: probe-lock held by control-probe lane (08:36 +08:00, fresh);
  probe-lock-2 free. No build until both free per DEVELOPMENT §5 rule 10.

## Stage 1 — code written, L2 green pre-build (done 09:05 +08:00)

- src/metrics/calc.ts: new export runTotals(input) — the section's three
  totals with the score table's own filters + basisLine. CALC_VERSION
  unchanged (no accounting rule change).
- scripts/calibrate/metrics.mjs (new): metricsSection(ws) = readLog +
  checkLog + window [first.at, last.at+1ms] + tz +08:00 + runTotals;
  compareMetrics(section, own) — steps/calls exact, credits within a cent.
- scripts/calibrate/run-calibrate.mjs: computes the section per run after
  the checker, result key `metrics` after `peakCalls`, mismatch = stderr
  warning (not a failure); changedFiles filters harness artifacts
  (.llm/metrics/, .llm/metrics-key) so strayFiles stays meaningful.
- tests/metrics-calc.spec.ts: +1 test (fixture counted independently,
  purpose-call exclusion, determinism, basis line, out-of-window). 18/18.
- tests/calibrate-metrics.spec.ts (new): journal-level, writer host
  'headless' with real kinds tables: section totals 2/3/2.625, basis names
  the file, empty journal = zeros + one-line mismatch, per-field diffs,
  cent tolerance. 2/2.
- package.json: tests/calibrate-metrics.spec.ts registered in test:2 after
  calibrate-fence.
- Lint: my five files clean; knip 18 ok, jscpd 1 ok (ratchets hold). ESLint
  over the whole worktree fails on tests/calibrate-ablation.spec.ts with
  `Unsafe return of a value of type error` — ROOT-CAUSED: ablation.mjs
  imports packages/*/dist (lines 39-42); the worktree has no dist yet (build
  waits on the probe lock); main's dist is built so main passes. Verified
  not my regression: clean baseline tree (git stash -u) in the worktree
  shows the same error. Self-heals after npm run build.
- Also fixed: my new spec's @ts-expect-error was unused (metrics.mjs
  resolves under allowJs — tsc TS2578); imports it directly now, spec still
  green.
- node_modules: pnpm install from the shared store first, then replaced by
  a junction to main's node_modules (the house pattern per HANDOFF line
  195) — lint behavior identical either way; junction kept.

## Stage 2 — gates green in the worktree (done 09:44 +08:00)

- Waited on probe-lock (control-probe lane 08:36–09:35). Build 09:35:42
  (13 s), preflight OK, npm test exit 0 — eslint 73 / knip 18 / jscpd 1,
  ratchets hold. The ablation-spec lint error self-healed with dist built,
  as root-caused in stage 1.
- lessons-seed fixture gap: .agents/tasks/m5/lessons-seed.json is
  gitignored and absent in a worktree (documented in glm-subdir-instructions
  and lessons-4 reports); copied from the main checkout, SHA256 verified
  identical (e10a3247…), spec 3/3, full chain re-ran green.

## Stage 3 — real run (in progress 12:05 +08:00)

- Temp profile per DEVELOPMENT §3: generateProfile worktree junctions,
  DSH_HOME=%TEMP%\glm-hourness-ms8-ifNkum, profile ms8-sandbox,
  credentials copied in; bootstrap script at .llm/scratch/ms8-profile.cjs
  (gitignored scratch, one-off).
- Batch 1 (rehearsal) started 11:35:14 after BOTH probe locks freed
  (design-relay-fix and m7-p3 lanes had held them): bugfix-csv-quotes +
  bugfix-shell-redirect × glm-5.3 + glm-5.3-flash.
- Finding from run 1 (the cross-check doing its job): steps and tool calls
  matched exactly (6/6, 7/7); credits differed, 12.9003 vs 12.96. Root
  cause verified in the journal: the session-title call is a purpose call
  — the score table's credits total scopes to steps, while the runner's
  own credits count every call the usage journal holds. Journal facts for
  run 1: llm 7 = steps 6 + purpose 1; step credits 12.9003; all credits
  12.9616 ≈ runner 12.96; tool events 7 = calls 7; usage records 7 = llm 7
  (verify's per-session reconciliation passes).
- Decision: the section's credits follow the design's credits row source
  (§7.2 积分: `llm` 的 `credits`, no step filter) and count every llm
  event's credits in the window — §13 expects the section to agree with
  the runner's own scoring, which bills the title call too. runTotals
  updated; steps keep the score-table filter; the score table itself is
  untouched (no CALC_VERSION bump, no accounting change to shipped rows).
  Both specs updated and green (18/18, 2/2).
- Batch 1 runs under the loaded pre-fix code (its result.json sections
  carry steps-only credits and warn) — rehearsal artifact only. After it
  closes: rebuild + full gates on the fixed code, then batch 2 = the
  acceptance run on the final code; expecting four clean cross-checks.

## Stage 4 — restart audit (done 2026-11-15 by the resuming instance)

- lessons-seed.json verdict (the coordinator brief named it as the only
  uncommitted change): NO git-visible diff exists — the file is ignored by
  `.gitignore:11` (`.agents/tasks/**/*`), and its mtime 2026-11-14 09:42 is
  Stage 2's documented copy from the main checkout. SHA256 of both copies
  is identical (e10a3247bba0dd…). Nothing to keep or drop; the brief's
  premise was a misread of the worktree.
- The real uncommitted state is the lane's own work from stages 1–3, all
  audited line by line and kept: modified package.json (test:2 registers
  calibrate-metrics after calibrate-fence), scripts/calibrate/run-calibrate.mjs,
  src/metrics/calc.ts (runTotals, credits = every llm event per §7.2 +
  stage-3 decision), tests/metrics-calc.spec.ts (+runTotals test, 18/18);
  new scripts/calibrate/metrics.mjs, tests/calibrate-metrics.spec.ts (2/2),
  .agents/tasks/ms8-progress.md (this file).
- Batch 1 (rehearsal, run dir .llm/calibration-runs/2026-11-14T03-35-23-634Z)
  closed 4/4 PASS at e09a269e (dirty); the four cross-check warnings are
  credits-only (12.9003!=12.96, 42.584!=42.66, 4.6915!=4.72, 16.0086!=16.04),
  steps and tool calls agreed in all four — exactly the stage-3 finding.
- Spec re-read: metrics design.md §12 step 8 (line 1021: L2 for the pure
  part; run once, two tasks two tiers, credits pre-authorized) and §13
  (line 1032: the section agrees with the runner's own scoring on steps,
  tool calls, credits). The lane plan is the metrics design's step 8, not
  m5/impl-plan.md (that is the memory lane's plan; design-0.6.md there is
  the memory design — the coordinator brief's pointer was imprecise).
- Residual defect found and fixed in the dead instance's edit: the new
  block in scripts/calibrate/run-calibrate.mjs (lines 323–331) had lost
  its function-body indentation (column 0). Restored to two spaces.
- Both probe locks (.llm/probe-lock, .llm/probe-lock-2 in the main
  checkout) are free at restart.

## Stage 5 — synced with main, lane work committed (2026-11-15)

- Sync choice: rebase-by-ff — the branch carried no commits, so the
  uncommitted lane work was stashed (`-u`), the branch fast-forwarded
  e09a269e → a8db4928 (origin/main), and the stash popped back.
- Conflict: package.json only (main split lessons specs out of test:2
  into a new test:3; the lane had added calibrate-metrics to the old
  test:2). Resolved = main's scripts verbatim + calibrate-metrics
  registered once in test:3 between calibrate-fence and calibrate-ablation
  (the calibrate specs' new home). Stash dropped after resolution.
- Main defect found during resolution, fixed separately: test:3 ran
  four-answers, weekly, operate-row twice (m7-p3 merge double-append) and
  subdir-instructions twice (pre-existing). Commit 66f38c96.
- Indentation defect of the dead instance's edit fixed first (run-calibrate
  lines 323–331 back to function-body indentation).
- Worktree git identity set locally (北方帝国@NorthGod
  <2959635203@qq.com>, matching history; no global identity exists).
- Commits on metrics-s8 (base = origin/main a8db4928):
  - 9f23fdf6 feat(calibrate): the metrics section (runTotals + metrics.mjs
    glue + runner wiring + both specs).
  - 66f38c96 test: each spec runs once in test:3.
- Both lane specs green on the merged tree pre-build: 18/18, 2/2.

## Stage 6 — gates green on the merged tree (2026-11-15)

- Both probe locks free; build 66f38c9 (dirty: progress file untracked at
  build time), preflight OK (2 packages, 18 source dirs, dsh-glm-zcode
  5 rows, dsh-hourness 18 rows), npm test exit 0 — eslint 73 / knip 18 /
  jscpd 1, ratchets hold; 231 spec files, every one "# fail 0".
- Batch 2 (the §13 acceptance run) launched on the fixed code: same two
  tasks × glm-5.3 + glm-5.3-flash, temp home
  %TEMP%\glm-hourness-ms8-ifNkum, profile ms8-sandbox (junctions point at
  this worktree's packages — the fixed runTotals is what loads), env
  DSH_HOME + DSH_SANDBOX_PROFILE, GIT_CONFIG_* unset in the shell. Log
  $TEMP/ms8-calibrate2.log.

## Stage 7 — batch 2: the §13 acceptance run, four clean cross-checks (2026-11-15)

- Run dir .llm/calibration-runs/2026-11-15T15-56-46-781Z, 4/4 PASS at
  66f38c96, ~12 min wall, credits spent (charged, pre-authorized):
  11.69 + 58.38 + 4.81 + 15.74 = 90.62.
- Zero cross-check warnings in the whole log (batch 1 had four).
- Section vs runner's own scoring, all four runs: steps and tool calls
  exact (5/8, 6/8, 17/18, 13/15); credits within the cent tolerance
  (11.6901 vs 11.69, 4.8065 vs 4.81, 58.3801 vs 58.38, 15.7386 vs 15.74
  — journal 4dp vs runner 2dp rounding order, the known half-cent).
  strayFiles empty in all four (the harness-artifact filter holds).

## Stage 8 — resumed for landing (2026-11-16)

- Restart audit: branch = a8db4928 + 9f23fdf6 + 66f38c96 + 4215ca47, tree
  clean, stages 0–7 match. origin/main fetched: a5296ba0 (the read-tree
  lane's 2f314a87 + a5296ba0), so the branch is behind 2 — rebase before
  the ff merge. The m7-7 lane has not landed yet (main checkout clean).
- .llm/probe-lock-2 found held with owner.txt "metrics-s8 lane probe gate
  (L3 floor), 2026-11-15T16:16:08Z" — the dead instance's claim, taken
  after the stage-7 commit; no probe process or run artifacts exist.
  Adopted as this lane's own stale claim: owner.txt refreshed
  (2026-11-15T17:06Z), renewal every 5 min while the probe runs,
  stop-then-delete on release. probe-lock free.
- Probe decision: no green full-probe record exists for this tree, so the
  probe runs at the 608/608 floor (m7-p3's post-merge run proved 608/608
  reachable at 3c8d425b; the read-tree lane re-met the floor at a5296ba0).
- m5/impl-plan.md re-checked per the brief: it is the memory lane's plan;
  stage 4's finding stands, no s8 wrap-up items in it. This lane's
  remaining wrap-up per stage 0 + DEVELOPMENT §8: the m7-10 landing
  comment at merge time, graph:render in the same commit.
- Landing plan: this commit → rebase onto a5296ba0 → build → preflight →
  npm test (ratchets 73/18/1) → probe → ff-merge in the main checkout →
  main-checkout build (merge-step duty, build-info commit = HEAD) → push
  origin/main then github main → m7-10 comment + render + this file's
  landing record → push again → release the lock.

## Stage 9 — landed (2026-11-16)

- Rebase onto a5296ba0 clean (no conflicts). Final branch commits, content
  identical to the pre-rebase tree the §13 acceptance ran on (66f38c96):
  45b4cc94 (feat), 728e4513 (test), 4104b657 (docs record), f128edb4
  (landing plan).
- Gates on the rebased tree: build OK (build-info f128edb), preflight OK
  (2 packages, 18 source dirs, 5+18 rows, 23 rows composed), npm test
  exit 0 — eslint 73 / knip 18 / jscpd 1, ratchets flat, 231 spec files
  every "# fail 0".
- Probe: 608/608 passed, exit 0, ~22 min, log copied to the main checkout
  .llm/logs/ms8land-probe.log, run dir auto-cleaned on the full pass.
- First launch mistake, fixed and recorded: the launcher one-liner
  backgrounded the whole `cd && nohup` chain, so probe #1 ran in the MAIN
  checkout (wrong tree — its run dir junctions pointed at main's
  packages). Killed by PID with the process tree (both probe-lock slots
  were this lane's to use; slot 1 free, slot 2 mine), the run dir deleted
  junction-first with target verification, and the dead instance's aborted
  run dir (2026-11-15T16-12Z, worktree junctions) cleaned the same way.
  The relaunch runs from a launcher script that asserts the checkout path
  and the junction targets before the result counts.
- Lock: probe-lock-2 adopted from the dead instance, renewed every 30 s
  while probing, stop file set by the launcher on exit; owner frozen at
  17:42:23Z before the release, dir deleted after landing.
- Landing: ff-merge a5296ba0 → f128edb4 in the main checkout (strict
  superset, no merge commit), main-checkout build OK, build-info commit =
  f128edb = HEAD, tracked porcelain clean. Pushed origin (Gitee)
  a5296ba0..f128edb4 and the github mirror, same range.
- Wrap-up: m7-10 landing comment through the graph CLI + graph:render
  (commit ba078d7a), this record next, second push of both remotes, then
  worktree .worktrees/metrics-s8 and branch metrics-s8 deleted (house
  pattern; probe log kept in the main checkout).
- Nothing left for the person from this lane. The metrics section is L2/L3
  verified; its desktop pickup rides the next batch L4 per DEVELOPMENT
  §1.1 (no new rows, no bundle-layout change, the score table untouched).
