# Review: transcript-enable (ship `glm-hourness/transcript` enabled)

Worktree `.worktrees/transcript-enable`, branch `transcript-enable`, HEAD `54a40775`. The change under review is the uncommitted working-tree diff against HEAD (9 files: `docs/DESIGN.md`, `docs/DEVELOPMENT.md`, `docs/HANDOFF.md`, `packages/hourness/README.md`, `packages/hourness/cordis.patch.yml`, `scripts/probe/run-probe.mjs`, `src/data/transcript-row.ts`, `src/shared/transcript.ts`, `tests/data-transcript.spec.ts`). Read-only review: nothing was built, tested or probed here.

Decision under implementation: the person's 「那就开」 (2026-11-06) after the trade-off in `.agents/tasks/compact-recall/l4.md` 观察 1. Precedent: `bad85a49` (lessons row shipped enabled).

Verdict: CHANGES_REQUESTED, 2 blocking findings.

## Gates recorded by the author (not re-run)

- `npm run build`: exit 0
- `npm run preflight`: exit 0
- `npm test`: exit 0, 3279/3279; lint ratchet eslint 73 suppressed, knip 18, jscpd 1 clone (no rise); gitleaks no leaks
- `npm run probe`: running at review time, result not available to this review

## Checklist

| Item | Result | Evidence |
| --- | --- | --- |
| Drop `disabled: true` from the row, rewrite the row comment | Met | `packages/hourness/cordis.patch.yml:185-202`: no `disabled` key, `config: {}`; comment names the date, the person's word, L3 `glm-compact-transcript`, desktop L4 on an isolated instance, and the shape-based redaction limit with a pointer to DESIGN §2.4 |
| L2 test that the row ships enabled (no `disabled:` key) | Met | `tests/data-transcript.spec.ts:358-366`, same block-slicing shape as `tests/lessons-row.spec.ts:312-321`; `readFileSync` was already imported (`:14`). Omitting the lessons test's `inject` assertion is correct: the transcript row declares no `inject` |
| Probe check: boot scenarios without overlay list the row on both routes | Not met (B1) | `scripts/probe/run-probe.mjs:3542` compares to `ACTED` (「生效」); the boot scenarios will report 「已加载，本会话未触发」 (`IDLE`). See B1 |
| `glmHealth` / `plainHealth` come from boot scenarios without a transcript overlay | Met | `run-probe.mjs:2473-2474` read `glm` (`:385-401`, overlay `attachmentsIn(glmDir)` only) and `non-glm` (`:578`, overlay `clockRow(PEAK_AT)` only); `dataRows` (`scripts/sandbox.mjs:165-172`) has no transcript line |
| (a) `glm-compact` keeps the "disabled row leaves the summary unchanged" check by disabling the row in its overlay | Met | `run-probe.mjs:452-464` adds `- id: glm-hourness/transcript` / `disabled: true` with a comment saying why; check kept and renamed at `:3404`. `:3459` (glm-compact health in that scenario) is unaffected |
| (b) DESIGN records the L4 观察 1 limit and the person's decision | Met | `docs/DESIGN.md:141` (new bullet 「启用与已知边界」: the trade-off as told, the `memory_store` rewrite of the key, shape-based limit in `src/data/secret-shape.ts`, no semantic check added); also `:63`, `:134`, `:807`, `docs/HANDOFF.md:61` |
| (c) `glm-compact-transcript` keeps pinning the row on with its scenario `home` | Met | `run-probe.mjs:481-486` (`disabled: false`, `config: { home: <scenario>/home }`); comment `:465-472` says it pins the row on and points it at the scenario home |
| DESIGN §2.2 row table | Met | `docs/DESIGN.md:63` |
| Other DESIGN places that said disabled by default | Met, except one wrong status phrase (B1) | `:134` (§2.4 heading), `:762` (§5.6), `:807` (§5.8 item 21). `:762` says the boot scenarios list the row 「生效」; see B1 |
| HANDOFF row/status lines | Met | `docs/HANDOFF.md:61` |
| DEVELOPMENT probe description | Met, except one wrong status phrase (B1) | `docs/DEVELOPMENT.md:79`; its last clause says the boot scenarios list the row 「生效」; see B1 |
| ORCHESTRATION.md | Not applicable | `git grep -i transcript -- docs/ORCHESTRATION.md` has no mention of the row or its default |
| `packages/hourness/README.md` row table | Met | `packages/hourness/README.md:46` (the row was missing from the table before; added as `enabled`) |
| No stale "ships disabled" statements in tracked files | Not met (B2) | `packages/hourness/locale/transcript/zh.json:4` 「默认关闭。」 and `packages/hourness/locale/transcript/en.json:4` "Off by default." Remaining hits of `git grep -n -i transcript` that say 停用/disabled are dated records (`.agents/tasks/l4-batch-2026-11-05/l4.md`, `.agents/tasks/m5/l4-2026-11-05.md`, `.agents/tasks/panel/l4-merge-2026-11-05.md`, `docs/graph/nodes/compact-recall*.json`, `docs/graph/nodes/orch.json`) and are correct for their dates |
| Source comments factual | Met | `src/data/transcript-row.ts:14-17`, `src/shared/transcript.ts:7-9`; `src/shared/transcript.ts:26` ("undefined while the transcript row is disabled or not active yet") still holds |
| No dead code | Met | Only comments, one overlay pair, one check and one test were added; nothing removed left orphans |
| Plain technical language, no persona | Met | All added prose in the nine files |
| TypeScript strict style | Met | `src/` changes are comments only; the test uses the file's existing imports and idiom |

## Blocking findings

### B1. The new probe check expects 「生效」 but the boot scenarios will report 「已加载，本会话未触发」

`scripts/probe/run-probe.mjs:3542` passes only if `glmHealth.transcript?.status === ACTED && plainHealth.transcript?.status === ACTED` (`ACTED = '生效'`, `:2491`).

The row's activation state is `'active'` (`src/data/transcript-row.ts:45`), but the table does not show the activation state for this row. `/glm-status` and `/hourness-status` render `collectHealth(ctx, sessionId)` (`src/glm-llm/login-row.ts:60`, `src/report/index.ts:189`). In `collectHealth` (`src/shared/health.ts:235-245`), a row outside `ACTIVATION_ONLY` (`:45`, which is `glm-login`, `data`, `graph-panel`, `loops`) with no report for the session is shown as `idle` when its activation is `active` (`:243`), and `idle` renders as 「已加载，本会话未触发」 (`:252`). `tests/health.spec.ts:174-175,182` pins that mapping. The transcript row reports a session only from `exportBeforeCompaction` (`transcript-row.ts:48-50`), which only runs on a GLM compaction. Neither boot scenario compacts. `run-probe.mjs:3452` already requires `glm-compact` to be `IDLE` in `glmHealth`, and `non-glm` is not a GLM route. So both lookups will read 「已加载，本会话未触发」 and the check fails. The probe is a required gate for this change (AGENTS.md, DEVELOPMENT.md §1.1 L3), so the acceptance condition is not met.

This is the same situation as the `design` row (`run-probe.mjs:2941` expects 「已加载，本会话未触发」 on both routes). The `loops` check can use `ACTED` because `loops` is in `ACTIVATION_ONLY`. `lessons` sidesteps it with `!== '未加载'`.

Change:
- `run-probe.mjs:3542`: expect `IDLE` (defined at `:2492`) on both routes, and optionally that the reason starts with the activation reason 「已加载；GLM 压缩时」 (`transcript-row.ts:45`). Reword the label to match, for example "without the overlay /glm-status lists it loaded but not triggered in this session on both routes".
- `docs/DEVELOPMENT.md:79`, last clause 「不带覆盖层的启动场景在两条路由上都列出 transcript 行生效」, and `docs/DESIGN.md:762` 「探针另核对不带覆盖层的启动场景在两条路由上都列出这一行生效」: say 「已加载，本会话未触发」 instead of 生效.

### B2. The shipped plugin-manager description still says the row is off by default

`packages/hourness/locale/transcript/zh.json:4` ends 「默认关闭。」 and `packages/hourness/locale/transcript/en.json:4` ends "Off by default." `locale` is in the package's published `files` (`packages/hourness/package.json`). Per `cordis.patch.yml:9-11`, `locale/<row>/` is the row's settings-page text. After this change the plugin manager tells the person the row is off while it writes plain-text session copies. That copy is exactly the trade-off the decision was about. The task's acceptance includes updating "other places that say the row is disabled by default" in the same batch (precedent `bad85a49`, AGENTS.md 「文档与行为改动同一批提交」), and these two strings were missed. Nothing pins them in tests (`git grep` over `tests`, `scripts`, `src` has no hit), so the gates could not catch it.

Change: drop the last sentence in both files, as the lessons locale does (it has no default-state sentence). Alternatively, replace it with a statement that is true, such as 「默认开启。」 / "On by default.".

## Non-blocking findings

- N1. `.agents/tasks/compact-recall/l4.md` is cited as evidence in `cordis.patch.yml:198`, `docs/DESIGN.md:63`, `:141`, `:762` and `docs/HANDOFF.md:61`, but `.agents/tasks/compact-recall/` is untracked in the main checkout (`git status` shows `??`) and absent from the worktree. Other L4 records are tracked (for example `.agents/tasks/m5/l4-2026-11-05.md`, `.agents/tasks/l4-batch-2026-11-05/l4.md`). Commit `l4.md` in the same batch or just before, or the five citations point at nothing. DESIGN §2.4 restates 观察 1 inline, so the decision record stands on its own either way.
- N2. Other compaction scenarios now run with the row on (no overlay, no `home`): `glm-graph-compact` (`run-probe.mjs:1685-1691`, workspace `<run>/glm-graph/ws`), `glm-compact-instructions` (`:1735-1741`, `<run>/glm-compact-instructions/ws`, main session and possibly the dispatched child), `glm-memory-compact` (`:1904-1909`, its scenario directory) and `glm-design-stage-compact` (`:2166-2171`, `<run>/glm-design-stage-compact/ws`). Each GLM compaction there now appends the transcript sentence to the checkpoint, writes `<workspace>/.llm/transcripts/<session>.txt`, and has `ensureLlmIgnored` append `.llm/` to that workspace's `.git/info/exclude`. All four workspaces are scratch repositories under the run directory (`scripts/sandbox.mjs:233-239`, `run-probe.mjs:1397`), so nothing reaches the main checkout. Their checks (`:3023`, `:2704`, `:3323-3344`) read projection notices, instruction messages, memory index notices and the scenario-home journals. None compares checkpoint text exactly or lists the workspace `.llm/`. The only checkpoint-text check, `:3398`, uses `includes` and runs in `glm-compact`, where the row is now disabled. The `metrics` check that lists `.llm/` (`:3185-3186`) filters names starting with `metrics` and runs in non-compacting scenarios. `quiet()` (`:2645`) is applied only to non-compacting scenarios, and the row writes to stderr only when `ctx.provide` fails. No breakage expected. Optionally add one sentence to `docs/DEVELOPMENT.md` §3 saying that the other compaction scenarios export into their own scratch repository's `.llm/transcripts/`.
- N3. The new L2 test does not pin the shipped `config: {}`. A shipped `home` would send every session's export to one fixed directory. When that directory's base name is not `.llm`, `exportTranscript` also skips `ensureLlmIgnored` (`src/data/transcript.ts:172-176`). Asserting `/^ {6}config: \{\}$/m` in the same block costs one line.
- N4. `packages/hourness/README.md:49`: "Rows with `disabled` ship off until you enable them." no longer applies to any row of this package, because no row in `packages/hourness/cordis.patch.yml` carries `disabled` now. The table also lacks `glm-hourness/metrics` and `glm-hourness/env` (pre-existing).
- N5. DESIGN §2.5 row-health table (`docs/DESIGN.md:285-300`) and §7 failure table (`:874-895`) have no `transcript` line (pre-existing). The lessons precedent kept its failure-table line current. With the row on by default, a line in each would keep the tables complete. The content already exists in §2.4 and §5.6 (skip reasons, degraded health, summary unchanged without the service).
- N6. `run-probe.mjs:465-469`: the edited comment leaves a short line ("scenario home, and the model reads") before "that file with Read ..."; reflow.
- N7. `origin/main` has moved from the worktree base `54a40775` to `e4680b5b` (`graph: d-no-run-cap supersedes d-five-runs`, touching only `docs/graph/graph.svg`, `docs/graph/nodes/d-five-runs.json` and `docs/graph/nodes/d-no-run-cap.json`). There is no overlap with the nine files.

## Verdict

CHANGES_REQUESTED. B1 makes the probe gate fail as written. B2 leaves the shipped plugin-manager text contradicting the shipped default. Both are small edits: one check expression and two doc clauses for B1, two locale strings for B2. After them, re-run `npm run build`, `npm run preflight` and `npm test`, then the probe. The probe run in progress at review time contains B1.

## Round 2

Worktree HEAD is now `e4680b5b` (graph-only advance from `54a40775`). The change is still the uncommitted working-tree diff against HEAD, now 11 files: the nine above plus `packages/hourness/locale/transcript/zh.json` and `en.json`. Read-only review again: nothing was built, tested or probed here.

Round 2 verdict: APPROVED. It supersedes the round-1 verdict above. Both blocking findings are resolved and nothing new blocks.

### Gates recorded by the author on this tree (logs read, not re-run)

- `g2-build.log`: `build-info: dsh-glm-zcode, dsh-hourness e4680b5 dirty`, no errors.
- `g2-preflight.log`: `preflight: OK (... dsh-hourness 15 rows; 20 rows composed ...)`.
- `g2-test.log`: the `# tests` lines sum to 3279 and the `# fail` lines to 0. `eslint: ok (73 suppressed)`, `knip: ok (18 in the baseline)`, `jscpd: ok (1 clone(s) in the baseline)`, `check-secrets: ok (gitleaks 8.30.1: 1112 commits on HEAD, staged and unstaged changes, no leaks)`. The new L2 test is `ok 15 - the row ships enabled in the orchestration patch (no disabled key) with an empty config`.
- `g2-probe.log`: `probe: 438/438 passed`.
- `g1-probe.log` (the round-1 diff): `probe: 434/438 passed`. It has four FAILs. The first is `transcript: the row ships enabled ... in effect on both routes (transcript: 已加载，本会话未触发; transcript: 已加载，本会话未触发)`, which is the round-1 B1 failure as predicted. The other three are `guard: quoted =>, -> and >>> ...`, `design main (GLM): git status ...` and `design main (non-GLM): git status ...`, with stderr `error: missing config key GIT_CONFIG_KEY_0`. Those three come from the agent shell's environment, not from this diff (R2-N2).

### Blocking findings, re-checked

- B1: resolved. `scripts/probe/run-probe.mjs:3542` now requires `[glmHealth, plainHealth].every(health => health.transcript?.status === IDLE && health.transcript.reason.startsWith('已加载；GLM 压缩时'))`. `IDLE` is `'已加载，本会话未触发'` (`:2492`). The reason prefix is the start of the activation reason in `src/data/transcript-row.ts:45`. The label says the row acts on a GLM compaction only. `docs/DEVELOPMENT.md:79` and `docs/DESIGN.md:762` now say the boot scenarios list the row 「已加载，本会话未触发」, and DESIGN cites §2.5, where `:283` defines that state. `g2-probe.log` shows `PASS transcript: ... (transcript: 已加载，本会话未触发; transcript: 已加载，本会话未触发)`.
- B2: resolved. `packages/hourness/locale/transcript/zh.json:4` ends 「默认启用。」 and `en.json:4` ends "On by default.". The `design`, `env`, `loops`, `metrics` and `rules` locales end the same way (`lessons` carries no default sentence).

### Non-blocking findings from round 1

- N1: moot, with a correction to the stated reason. `4eb29f4d` (on `origin/main`) tracks `.agents/tasks/compact-recall/l4.md` (and this review). The five citations resolve once the branch lands on top of `origin/main`. Task documents are not git-ignored: `.gitignore` ignores `.agents/tasks/**/*` but re-includes `!.agents/tasks/**/*.md` ("只有文稿入库").
- N2: confirmed by `g2-probe.log`. These checks pass with the row on by default in the other compaction scenarios: `graph row: after a compaction checkpoint ...` (8 compactions), both `host instructions` checks (8 compactions), `memory compaction: ...` and `design stage (compact): ...` (6 compactions).
- N3: done (`tests/data-transcript.spec.ts:358-367` asserts `config: {}` with the reason).
- N4: the sentence is removed. The table still lacks `metrics` and `env`, which is pre-existing.
- N5, N7: left as is; fine.
- N6: reflowed. One short line remains at `run-probe.mjs:469` ("scripts/probe/probe-llm.mjs). The task"); cosmetic, no action needed.

### New, non-blocking

- R2-N1 (landing). `origin/main` is `08d1e9a7` and local `main` is `db160034`, ahead of the worktree HEAD `e4680b5b`. The commits in between (`d3d766bf`, `4eb29f4d`, `08d1e9a7`: `.gitignore` and `.agents/tasks/**`; `db160034`: `docs/graph/**`) do not touch the 11 files, so the rebase is trivial. The gates have to run again on the landed tree. The secret gate (`scripts/check-secrets.mjs`, gitleaks over HEAD history) will then also scan `l4.md`, which quotes the two planted fake strings (`Bearer l4fake…`, `sk-l4fake…`) verbatim, and `.gitleaks.toml` has no entry for them. By reading, gitleaks' default rules do not match them, but this was not verified here: the g2 scan predates `4eb29f4d`.
- R2-N2. The `GIT_CONFIG_COUNT` / `GIT_CONFIG_KEY_0` / `GIT_CONFIG_VALUE_0` environment pitfall behind the three g1 git failures is not recorded anywhere. `git grep GIT_CONFIG` finds only the 2026-10-31 `GIT_CONFIG_GLOBAL` note at `docs/HANDOFF.md:139`. Record it next to that note or in `docs/DEVELOPMENT.md` §7. Alternatively, have the probe runner drop `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_*` and `GIT_CONFIG_VALUE_*` from the environment it spawns. Either is a separate change.
- R2-N3. Stale "ships disabled" comments remain on rows that already ship enabled. They are pre-existing and not about this row: `src/design/index.ts:34`, `src/lessons/index.ts:23`, `src/loops/index.ts:57`, `src/rules/index.ts:55`, and `scripts/probe/run-probe.mjs:3094` (metrics). Clean them up separately.

### Verdict

APPROVED. No remaining blocking finding.
