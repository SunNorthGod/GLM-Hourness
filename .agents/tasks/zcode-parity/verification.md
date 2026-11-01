# m1-parity verification (item 9 write-back port, after fix pass 3)

Branch `m1-parity` in `.worktrees/m1-parity`. This step corrects item 9 to the user's decision on graph question-9 (A, "照 ZCode 做：生成并写回 ~/.zcode"): 23292da had ported only the read side of 3.16.3 `ensureCliDeviceMid` and called the rest a "decided deviation, item 9"; that was wrong, and both review passes accepted it. No real network request was sent; `npm run probe` was not run (finalize step). docs/graph was not edited (step constraint); main was not touched; nothing was pushed; review.md and review.json (review pass 2) were left for review pass 3.

## Commits on the branch (main..m1-parity, oldest first)

Implementation pass: 60d59aa, 23292da, 59722e3, 926c1d0, 0f507cf, 8c92d84, 01f128f, 7a5dd3e, 738c1df, 28a0604.

Earlier fix passes: 2386f6e, 168b443, a598f4c, 53baff9, d4a740e, b446209; then 097bfda, 529fe76, 798361f (record below).

Item 9 correction (this step):

| Commit | Subject |
| --- | --- |
| de6c171 | feat(glm-llm): write the ZCode deviceMid back as 3.16.3 ensureCliDeviceMid does (m1-parity) |

The commit message states that it supersedes the read-only "decided deviation, item 9" of 23292da.

## Item 9: the write-back port

### What changed (de6c171)

- `src/glm-llm/device-mid.ts`: function-by-function port of `Qro` @4062043 (`ensureCliDeviceMid`), `CWs` @4062252, `NWs` @4064238, `EWs` @4062442, `AWs` @4062638 (inlined), `eoo` @4062679, `too` @4062778, `roo` @4064491, `noo`, `PWs` @4062889, `RWs` @4063231, `DWs` @4063741, `OWs` @4063923, `MWs` @4064119, `LWs` (as `node:timers/promises` setTimeout), constants `kWs=10, xWs=200, TWs=300*1e3` @4064703, `tG` @1013439. `Kuc` @14468898 / `Juc` @14468783 unchanged (read-only, as in 3.16.3). `ensureCliDeviceMid({env, createId?})` returns `{value, temporary}`; `temporary` is true exactly on the 3.16.3 `.catch(() => getGeneratedDeviceMid())` path.
- `src/glm-llm/zcode.ts`: `metadata.user_id` uses `ensureCliDeviceMid({env})` on every request (3.16.3 `Ydt` @4073238 calls it per attempt; the per-file promise cache makes it one generation per process). The routing service reads `X-Device-Mid` with `readRoutingDeviceMid` only. The adapter's own deviceMid cache and the `device-mid.txt` fallback are gone. When `temporary`, the glm-llm row health success reason gets the suffix `；设备 ID 未能写入 ZCode 状态文件，本进程用临时 ID` (state stays active).
- `src/glm-llm/identity.ts`: `ensureDeviceMid` (the `<home>/device-mid.txt` reader and writer) removed. An existing `device-mid.txt` is not deleted (user data) and is no longer used.
- `src/glm-llm/anthropic.ts`: `metadataUserId(deviceMid: string, ...)`; the deviceMid can no longer be missing.
- Doc strings in `index.ts` (Config `home` description), `login-row.ts`, `src/shared/data-home.ts` no longer say the deviceMid lives in the credential directory.
- Docs: DESIGN 2.4 (table row and the credential/deviceMid paragraph), 2.5 (glm-llm row), 4.5b (device-id paragraph rewritten as the write-back port), 4.8 (moved to "已一致", the item 9 approximation bullet removed); FACTS 1 deviceMid row rewritten with the re-read offsets; HANDOFF 2, 3, 6; CHARTER 9. No text in DESIGN, FACTS, HANDOFF or the code still calls item 9 a deviation.
- `eslint-suppressions.json` via `npm run lint:update`: 256 -> 250 (three `unbound-method` in zcode.ts and three `require-await` in glm-transport.spec.ts went with the removed code).

### Plan vs bundle (the bundle wins; every detail re-read in the pristine 3.16.3 CLI bundle by offset)

1. `too` / `roo`: plan item 9 says a parse failure or a non-object reads as `{}`. The bundle's `isRecord` (`roo` @4064491) also rejects arrays (`!Array.isArray(e)`), so `[1]` reads as `{}` and the write-back produces `{"deviceMid": ...}`. Ported as the bundle; pinned by the glm-device-mid write-back test.
2. `DWs` @4063741: plan says a lock under 300 s is not stale when its owner is alive, otherwise it is removed. The bundle keeps a fresh lock also when its owner record cannot be read or lacks numeric `pid` / `createdAt` (`if(!o||MWs(o.pid))return!1`), and when `stat` itself fails it returns false, so the caller sleeps 10 ms rather than retrying at once. Ported as the bundle; the unreadable-owner case is pinned by the lock-wait test.
3. `tG` @1013439: plan names `crypto.randomUUID()` with a `getRandomValues` fallback; the bundle has a third `Math.random` fallback. Both fallbacks cannot run on Node 22 (`globalThis.crypto.randomUUID` always exists), so only `randomUUID` is ported (no dead branches); recorded in the code comment.
4. `CWs` takes `e.baseDir` in the plan's description; the only model-request caller (`Ydt` @4073238, call sites @4155898 and @4167304) passes `{env}` only, so `baseDir` is not ported.
5. Not in the plan: the bundle has a second writer of the same state file, `resolveStandaloneDeviceMid` (`jrc` @14089436, with its own `withTelemetryStateLock` `Urc`: 2 attempts, liveness by `ESRCH`, temp file `<file>.<pid>.<uuid>.tmp`), used only by the OTLP agent telemetry runtime (`sri`, when an OTLP endpoint is configured). It is not on the model-request path and is not ported; FACTS 1 notes it.
6. FACTS (not the plan) cited the constants at @4064600, which is the module initializer; the constants are at @4064703 as the plan says. FACTS corrected.

Everything else in plan item 9 and implementation step 2 matches the bundle: lock-free read then locked re-read and generate; `mkdir -p`, temp file `.${basename}.${pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`, `JSON.stringify(state, null, 2)`, `rename`, unlink the temp file on failure; `telemetry-state.lock` via `open(..., "wx")` holding `{createdAt, pid}`, closed and unlinked in `finally`; `EEXIST` -> stale check -> 10 ms sleep, 200 attempts, `CLI telemetry state lock timeout`; `process.kill(pid, 0)` with `EPERM` as alive; any failure returns the generated id; one promise per state file; `Kuc` read-only.

### Tests and fail-on-old-code evidence

Method: the new tests were written first and run against the read-only code (src at 798361f, unchanged): `tests/glm-zcode.spec.ts` directly, `tests/glm-device-mid.spec.ts` through a scratch copy whose `ensureCliDeviceMid` maps to the old `readCliDeviceMid` (`{value: <old read>, temporary: false}`), so each test fails on behaviour, not on a missing export (`dm-old-shim.mjs`, `dm-old-run.ps1`; logs `dm-old-device-mid.log`, `dm-old-zcode.log`). Every state file is in a mkdtemp directory reached through `ZCODE_DATA_BASE_DIR`.

glm-device-mid on the old code: 2 pass, 6 fail.

| Test | Old code |
| --- | --- |
| without a deviceMid one is generated and written back: other keys kept, two-space JSON, no temp file or lock left (EWs, PWs, RWs) | fail: `assert.match` got `undefined` for the value |
| concurrent calls on one state file generate and write one id (Xro) | fail: deepStrictEqual, actual `value: undefined`, expected the generated id |
| a lock held by a live process, or a fresh lock without a readable owner, is waited for and the state re-read under it (RWs, DWs) | fail: deepStrictEqual, actual `value: undefined` (the old read returned at once without waiting) |
| a lock older than 300 s, or a fresh lock whose owner is not running, is removed and the id written (DWs, MWs) | fail: deepStrictEqual, actual `value: undefined` |
| a failed write still returns the generated id, marked temporary, and leaves no temp file or lock (Qro fallback) | fail: deepStrictEqual, actual `{value: undefined, temporary: false}`, expected `{value: <id>, temporary: true}` |
| the routing read (Kuc) never generates, trims, requires printable ASCII, and caches only a success | fail at the last assertion: after `ensureCliDeviceMid` the routing read returned `undefined` (nothing was written) |
| the state file path follows resolveCliTelemetryStateFile | pass (unchanged path rule) |
| an existing deviceMid is used as-is: nothing generated, no lock taken, the state file untouched (EWs lock-free read) | pass (pins the lock-free read path, which the read-only code already had) |

glm-zcode on the old code: 38 pass, 2 fail.

| Test | Old code |
| --- | --- |
| without a ZCode deviceMid one is generated and written to the state file, and both planes carry it | fail: `assert.match` on the state file's `deviceMid`, actual `''` (nothing written) |
| when the state file cannot be written the generated id is still sent and kept, the config request has no X-Device-Mid, and the row health says the id is temporary | fail: strictEqual on the config request's `X-Device-Mid`, actual the bundle's fallback id instead of `undefined` |

Removed with the code: glm-zcode "without a ZCode deviceMid the bundle's own one is sent on both planes ..." (replaced by the two above) and glm-transport "deviceMid persists once and is reused across reads" (`ensureDeviceMid`), plus the `metadataUserId(undefined, ...)` assertion.

On the new code: glm-device-mid 8 / 0, glm-zcode 40 / 0, glm-transport 36 / 0, glm-routing 6 / 0, health 19 / 0, glm-channel 6 / 0 (`dm-new-*.log`).

### No spec reaches the real ~/.zcode

- Code audit: every adapter in the specs that gets past the credential and project-token steps has `env` with a mkdtemp `ZCODE_DATA_BASE_DIR`; the adapters without `env` only call `listModels`, `status`, or fail closed before the deviceMid step (glm-zcode missing credential, health missing credential and missing OAuth token). Every direct `ensureCliDeviceMid` / `readRoutingDeviceMid` call in glm-device-mid passes a temp `env`; `telemetryStateFile({})` is a pure path computation.
- Run check (`home-guard.ps1`): glm-device-mid, glm-zcode, glm-transport, glm-routing, glm-auth, glm-channel and health run with `USERPROFILE` and `HOME` pointed at an empty temp directory: all pass (8, 40, 36, 6, 15, 6, 19; 0 failing) and no `.zcode` was created in that directory, so no spec resolved the state file to the home directory.
- `scripts/smoke-zcode-authorized.mjs` uses the production paths by design (real credential directory, real `~/.zcode`); it was not run, and DESIGN 4.1 already says not to run it before the desktop restart.

### %USERPROFILE%\.zcode\v2 modification time (directory metadata only; the state file was not read)

| When | LastWriteTime |
| --- | --- |
| Before any test in this step | 2026-10-29T08:51:10.0852723+08:00 |
| After the full gate run (`npm test`) | 2026-10-29T09:06:40.2103924+08:00 (changed) |
| Start of `home-guard.ps1`, no test running since the previous check | 2026-10-29T09:07:40.2067761+08:00 (changed again while nothing of ours ran) |
| End of `home-guard.ps1` (seven device-id specs) | 2026-10-29T09:07:40.2067761+08:00 (unchanged across the run) |
| After the commit, no test running | 2026-10-29T09:09:05.9861206+08:00 (changed again while nothing of ours ran) |

The directory is not unchanged overall, and the cause is not this step's code: the ZCode desktop app is running on this machine (36 `ZCode` processes, the first started 08:14:14, new ones at 08:48–08:49 and 09:04:54), and the directory changed at 09:07:40 and 09:09:05 while none of our tests or scripts were running. Across the controlled run of the device-id specs the timestamp did not move, and the redirected-home run shows no spec resolves to the home directory. Even if one did, the real state file has a deviceMid, so the code takes the lock-free read and writes nothing. The step did not start, stop or drive ZCode.

## Gates (final, on de6c171's tree)

Run in the worktree with `ZCODE_BUNDLE` = the 3.16.3 pristine bundle and `reference/zcode-api/src/proxy/zcode_system.json` copied in temporarily for `tests/glm-startplan.spec.ts` (removed afterwards; `git status` clean) (`gates.ps1`).

- `npm run build` exit 0 (`build.log`).
- `npm run preflight` exit 0: `preflight: OK (13 exports, 1 patch, client half absent; ui bundle client half built)` (`preflight.log`).
- `npm test` exit 0 (`test.log`): 39 spec files, 552 passing, 0 failing (548 before: +4 glm-device-mid, +1 glm-zcode net, -1 glm-transport); graph smoke ok.
- check-verbatim: OK against bundle, 443 verbatim, 0 known deviations.
- Checker baselines: ESLint 250 suppressed (was 256; pruned, not grown), knip 21, jscpd 2 clones (16 duplicated lines).
- gitleaks: `check-secrets: ok (gitleaks 8.30.1: 122 commits on HEAD, staged and unstaged changes, no leaks)` (run before the commit, on the staged-to-be changes).

## Per item 1-10

Unchanged from the earlier passes except item 9.

1. PAT in both auth headers (report 5.1): `auth/project-token.ts` ports `ProjectAccessTokenClient` / `ProjectAccessTokenCache` (`sge` @1082916, `Urt` @1080367); `buildModelRequestHeaders` puts the PAT in `authorization: Bearer` and `x-api-key`; the signer signs with it; a non-security 401 refreshes once (rejected body cancelled). Tests: glm-zcode full chain, PAT mint, signed request, 401 refresh; glm-project-token; glm-signing.
2. Fail closed (question-6 B): nothing is sent, error and row health carry the 3.16.3 reason and /glm-login; no apiKey fallback; `/glm-status` reports an unusable login as not logged in. Tests: glm-zcode fail-closed and status tests; health PAT-reason and `/glm-status` tests.
3. agent/configs and the secret (report 5.2): `FGs` header set with `x-api-key-id`, no `x-api-key`; secret removed everywhere; record v2 with lossless, serialized migration. Tests: glm-routing FGs order, glm-zcode config/migration/login-race, glm-auth migration and write-queue tests.
4. X-Title `Z Code@electron` (question-8 B). Tests: glm-transport identity tests, glm-routing FGs test.
5. max_tokens (question-7 B): `token-budget.ts` ports `aUo`/`VZ`/`p3a`/`PP` and the estimator. Tests: glm-transport budget and estimator tests; glm-zcode max_tokens test.
6. Body (report 5.3): official casing, `getArgs` key order with `tool_choice` auto, r33 option map (thinking enabled, output_config effort from DSH low/high/max, default high), title non-streaming at the catalog's first level, compaction at the session's level. Tests: glm-transport wire-shape tests; glm-zcode body, title and compaction-effort tests.
7. User-Agent and attribution (report 5.4): `Y2`/`y4s`/`Rh`/`$ut` ports; trace id per session, query id per user turn, kept by both auxiliary requests; query source and session type mapping; subagent from the `agents` session header. Tests: glm-transport UA/attribution tests; glm-zcode UA, trace/query, auxiliary, DSH-shape compaction and subagent tests; glm-channel session headers.
8. Header names and wire order: `Headers` chain as 3.16.3 (`zrt` + seven `set`, routing copy + `set`). Tests: glm-zcode loopback wire-order test (signed and unsigned); glm-routing; glm-signing.
9. device_id (question-9 A, de6c171, supersedes the read-only 23292da variant): full `ensureCliDeviceMid` port, lock-free read, locked re-read, generate, atomic write-back under `telemetry-state.lock` with the stale-lock rule; a failed write still sends the generated id, kept for the process, with the row-health note; `Kuc` stays read-only for `X-Device-Mid`; `device-mid.txt` no longer read or written. Tests: glm-device-mid (8), glm-zcode deviceMid present / generated / failed write.
10. DSH-only differences documented in DESIGN 4.8.

Fail-on-old-code evidence of the ten items (against cc677af) is in `old-code-results.txt`; that of fix pass 1 in `fix-old-run.log` and `fix-old-auth.log`; that of the review-pass-2 fixes in `f1-old-*.log`, `f2-old-zcode.log`; that of the item 9 correction in `dm-old-device-mid.log`, `dm-old-zcode.log`.

## Gaps and closest faithful versions (items 5 and 7)

Item 5 (unchanged): the usage baseline comes from the decoder's replay envelope (`response.usage`) because DSH requests carry no per-response usage; history from other routes or before m1-parity is estimated whole; ZCode aligns session entries with messages, DSH has one list; tool calls and results are mapped onto DSH blocks; the window is the catalog's 1,000,000 while DSH compacts at its declared 512,000, so steps send 128000; the active 3.16.3 catalog comes from the desktop shell, open-source revision 33 is assumed.

Item 7: a turn opens at a new `source.kind: 'user'` message of a main step (DSH has no turn id); auxiliary requests never open a turn; `workflow_child` is not mapped (no DSH marker); subagent detection needs the live `agents` service, otherwise main; trace ids, query ids and the session's step effort are kept for 256 sessions in memory; a compaction or title on a session with no state in this process opens a query id, and only a title-opened one is adopted by the next step.

Item 9 has no remaining gap against 3.16.3 on the model-request path. The row-health note on a temporary id is this bundle's own reporting (3.16.3 is silent); it changes no request.

## Record: fix pass resolving review pass 2 (097bfda..798361f)

`review.json` then had verdict CHANGES_REQUESTED and four findings (review pass 2).

| Commit | Subject |
| --- | --- |
| 097bfda | fix(glm-llm): compaction keeps the turn's x-query-id (m1-parity review) |
| 529fe76 | fix(glm-llm): compaction uses the session's reasoning effort (m1-parity review) |
| 798361f | docs: give Lw, nS and f5s their own 3.16.3 offsets (m1-parity review) |

1. compaction-rekeys-turn (BLOCKING), commit 097bfda. `RequestAttributionTracker.attribute` (`src/glm-llm/headers.ts`): any auxiliary request (`purpose` session-title or compaction) takes no turn key and returns the session's current query id; if the session has none it opens one and marks it `titleOpened` only when the opener is the session title. A main step adopts an existing query id only when the session has no turn key yet and the id was title-opened; otherwise a new turn key mints a new UUID. So a compaction on an unseen session (manual compaction after a restart) does not hand its id to the next user input. Tests: glm-transport "attribution: a compaction whose span ends before the current turn keeps the turn's query id (3.16.3 c3a derives it with nS)" (DSH shape `[system, earlier typed message p, instruction]` between two steps of turn c; asserts compaction and the next step both carry the step's query id); glm-transport "attribution: only a title-opened query id is adopted; a compaction on an unseen session does not hand its id to the next turn"; glm-zcode "a DSH pressure compaction (system head, earlier span, instruction) and the rest of the turn share the turn's x-query-id" (same shape on the wire through the adapter). DESIGN 4.5b `x-query-id` bullet rewritten with the rule, the 3.16.3 basis (`c3a` @13387356, `nS` @12816000) and the rc.3 compaction-basic request shape.
2. compaction-effort-high (NON-BLOCKING), commit 529fe76. Implemented rather than only documented: the tracker also records the `reasoningEffort` of each session's latest main step (`stepEffortOf`), and `codingPlanWire` uses it for compaction requests; before the session's first main step in this process the compaction request's own effort applies (default high). Basis re-read in the pristine bundle: `c3a` @13387356 `u=o.model??jT(this,{selection:this.getSessionModelSelection()})`, `jT` @12830530. Wire effect: compaction `output_config.effort` follows the session's level instead of always `high`; steps and the title are unchanged. This is item 6 ("auxiliary requests per 3.16.3"), so no product decision was needed. Test: glm-zcode "compaction carries the effort of the session's latest main step (3.16.3 compacts with the session selection), not DSH's route default" (fresh session high; sessions at max and low compact at max and low even when the compaction request says high; a later step at low moves the session to low). DESIGN 4.5 thinking/output_config bullet, 4.8 approximation list (session without a main step in this process) and the 5.8 table row 16 updated; FACTS 1 compaction row gains the selection fact with `jT` @12830530.
3. fixup-commit (NON-BLOCKING), branch rewrite. 2bfbeef and bac18b4 squashed into a598f4c (detached at 168b443, `cherry-pick -n 2bfbeef bac18b4`, commit reusing the 2bfbeef message, then the three later fix commits cherry-picked; branch reset to the result). `git diff bac18b4 <new tip before that pass's commits>` was empty, so the tree is unchanged. `tests/glm-auth.spec.ts` at a598f4c is the bac18b4 version (no later commit touches it), so the commit no longer carries the non-null assertion that the suppression ratchet rejected. The branch was local and unpushed.
4. facts-shared-offsets (NON-BLOCKING), commit 798361f. Re-read: `Lw` @1422054, `nS` @12816000, `f5s` @3840311 (and `vT` @1421911, `hae` @12815948, `Ngn` @3839971). FACTS 1 attribution row now lists `vT` @1421911, `Lw` @1422054, `hae` @12815948, `nS` @12816000; header-chain row `f5s` @3840311, `Ngn` @3839971. DESIGN 4.3 (`f5s` @3840311) and 4.5b (`Lw` @1422054), and the comments in `headers.ts` and `zcode.ts` carry the same offsets.

Fail-on-pre-fix-code evidence of that pass: with `src/glm-llm/headers.ts` as of b446209, glm-transport 36 / 1 and glm-zcode 37 / 1, the failures being the new compaction tests (`f1-old-transport.log`, `f1-old-zcode.log`); with `headers.ts` and `zcode.ts` at 097bfda, glm-zcode 38 / 1, the failure being the compaction-effort test (`f2-old-zcode.log`). Findings 3 and 4 changed no behaviour.

Gates of that pass (on 798361f): build exit 0; preflight exit 0; `npm test` exit 0, 39 spec files, 548 passing, 0 failing; check-verbatim 443 verbatim, 0 known deviations; ESLint 256 suppressed, knip 21, jscpd 2 clones; gitleaks 122 commits, no leaks.

## Not done in this step

Sandbox real-network run (plan step 12), `npm run probe` (finalize step), desktop restart (batch L4; the first read by new code migrates the real credential record), project graph update (docs/graph is outside this step: the item 9 correction and de6c171 are for the orchestrator to record on `m1-parity` / `question-9`).
