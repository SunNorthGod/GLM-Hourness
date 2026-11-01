# coding-plan requests at code-level parity with ZCode 3.16.3 (m1-parity, review pass 3)

The branch (`main...m1-parity`, 20 commits 60d59aa..de6c171) makes every part of a coding-plan request that the bundle controls follow ZCode 3.16.3 account mode. This pass covers the fix commits for the four pass-2 findings (097bfda, 529fe76, 798361f, and the squash a598f4c) and de6c171, which replaces the read-only deviceMid of 23292da with a full port of 3.16.3 `ensureCliDeviceMid`, as the user decided on graph question-9 ("照 ZCode 做：生成并写回 ~/.zcode"). All four pass-2 findings are resolved. The item 9 port matches the pristine bundle function by function. One new gap remains, and it does not block: a DSH manual compaction on an idle session sends the previous turn's `x-query-id`, while 3.16.3 runs `/compact` as its own turn with its own query id, and DESIGN does not list the difference.

Watch for: manual idle-session compaction reuses the last turn's `x-query-id`, and the difference is undocumented (NON-BLOCKING, confirmed).

**Verdict**: APPROVED

## High-level view

Items 1 to 5 and 8 have had no code change since pass 2 and are still identical to 3.16.3. The squash a598f4c leaves the tree byte-identical to the pass-2 tip, so the credential-store migration is the one pass 2 reviewed.

In item 7, auxiliary requests no longer take a turn key. The session title and the compaction both reuse the session's current query id, and only a title-opened id is adopted by the next step. Pressure and context-overflow compactions run inside a turn in both products, so they now keep the turn's id as 3.16.3 does. DSH can also compact an idle session on a user command. 3.16.3 runs that command as a new turn, but the DSH request carries nothing that tells the two cases apart, so the channel sends the last turn's id. DESIGN §4.5b says auxiliary requests run inside the current turn, and §4.8 does not list this case.

In item 6, compaction now carries the reasoning level of the session's latest main step instead of a fixed `high`, the closest available stand-in for 3.16.3's session selection. §4.8 lists the fallback for a session with no main step in this process.

Item 9 now writes the deviceMid back exactly as 3.16.3 does, including the lock, the stale-lock rule, the atomic rename and the silent fallback to the generated id. The routing `X-Device-Mid` stays read-only. Tests reach the state file only through mkdtemp directories. DESIGN, FACTS, HANDOFF and CHARTER were rewritten in place, and no text still calls item 9 a deviation.

<details>
<summary>Issues (1)</summary>

1. **Manual compaction query id undocumented** (NON-BLOCKING, confirmed; `docs/DESIGN.md` §4.5b and §4.8, behaviour in `src/glm-llm/headers.ts` `RequestAttributionTracker.attribute`) — a DSH manual idle-session compaction goes out with the previous turn's `x-query-id`, while 3.16.3 runs `/compact` as its own turn with its own query id. List the case in §4.5b and §4.8 as a DSH-only difference; if the bundle can observe that no DSH turn is open, give such a compaction a fresh query id instead.

</details>

<details>
<summary>Details</summary>

### Item-by-item identity against 3.16.3

Offsets are character offsets in `pristine-3163/zcode.cjs.pristine`; `+N` are byte offsets inside the named file of `pristine-3163/app.asar`. Every offset cited for items 6, 7 and 9 was re-read for this pass. For items 1 to 5 and 8 the code paths have not changed since bac18b4 (`git diff bac18b4 HEAD` touches only the `headers.ts` attribution, the `zcode.ts` compaction effort and deviceMid, `device-mid.ts`, `identity.ts`, `anthropic.ts` `metadataUserId`, doc strings and docs), so the pass-2 readings stand.

1. Identical. PAT as the provider `apiKey` (`x5s` @3843063, after `PQr` @3841940), `Authorization: Bearer` (`T5s` @3843231), `x-api-key` from `createAnthropic` (`sgn` @3569529, use site @3570073), signer on the same credential (`protectTransport` @3833810).
2. Identical in behaviour. `ModelRequestAuthMissing` (@4193871 vicinity), `xpt` @4146619, `wie` @4147581; desktop `AccountRequestCredentialUnavailableError` (`index.js` +1200329). No API key is stored, so no fallback exists; row health and `/glm-status` name the reason.
3. Identical. `FGs` @4196232, `jGs` @4196407, `NGs` @4199110, `Frn` @968479, `P5r` @2827718; no `api_keys/copy` or `secretKey` in the CLI bundle or desktop sources. `git diff bac18b4 a598f4c -- tests/glm-auth.spec.ts` and `git diff bac18b4 b446209` are empty, so the store and its migration are unchanged from pass 2.
4. Identical. `Suc` @14422777, `kuc` @14423244, routing port `sourceTitle:"electron"` @15096557.
5. Identical where DSH supplies the inputs. `aUo` @13215830, `p3a` @13395552, `PP` @7759001, estimator as in pass 2; gaps in DESIGN §4.6 and §4.8.
6. Identical, compaction included. `c3a` @13387356 builds the compaction model with `jT(this,{selection:this.getSessionModelSelection()})` (`jT` @12830530); `codingPlanWire` now takes the latest main step's level for compaction. The bundle declares `defaultEffort: 'high'` (`zcode.ts` `listModels`), and dsh-llm `resolveCallWithInfo` fills it into every request without an explicit level, so each GLM main step updates the stored level and a compaction request's filled-in `high` does not override it. The remaining approximation (no main step yet in this process) is in §4.8.
7. Identical for main steps, the title and in-turn compactions; not identical for a manual idle-session compaction (next section). The User-Agent construction is unchanged (`$ut` @3509781, `y4s` @3510098, `Y2` @3510311, `Rh` @3505152, `SZr` @3540427). The trace id is per session (`vT` @1421911, `Lw` @1422054), and the in-turn compaction context is `nS(t,{attributes:{...,querySource:"compact"}})` near @13389086, with `nS` @12816000 keeping `t.queryId`.
8. Identical. `O1r` @1088463, `zrt` @1089207, seven `set` of `sendSigned` @3827896 (@3828487), `f5s` @3840311.
9. Identical to 3.16.3 `ensureCliDeviceMid`, read side by side with `src/glm-llm/device-mid.ts`: `Qro` @4062043 (promise per state file in `Xro`, lazy `getGeneratedDeviceMid`, `EWs(...).catch(()=>a())`), `CWs` @4062252, `EWs` @4062442, `AWs` @4062638, `eoo` @4062679, `too` @4062778, `PWs` @4062889, `RWs` @4063231, `DWs` @4063741, `OWs` @4063923, `MWs` @4064119, `NWs` @4064238, `roo` @4064491, `kWs=10,xWs=200,TWs=300*1e3` @4064703, `tG` @1013439, `ZWs` @4073127, `Ydt` @4073238 (calls @4155898 and @4167304, after `xpt`), `Juc` @14468783, `Kuc` @14468898. The port leaves out `CWs`'s `baseDir` (the only model-request caller passes `{env}`) and `tG`'s `getRandomValues` / `Math.random` fallbacks (Node 22 always has `crypto.randomUUID`). Its `OWs` keeps only `pid`, and the result type adds `temporary`. None of these changes a written byte or a sent value. Pass 2 called the read-only variant "identical to the decided read-only variant (graph question-9, A)". That was wrong: question-9 A is the write-back, and de6c171 corrects it.
10. Met, except for the manual compaction case. DESIGN §2.4, §2.5, §4.5b (device id rewritten as the write-back port), §4.8 (device id moved to "已一致", its approximation bullet removed), FACTS §1 (deviceMid row with re-read offsets; the second writer `jrc` @14089436 with its two-attempt `Urc` is described accurately), HANDOFF §2, §3, §6 and CHARTER §9 replace the old text. A grep of `docs/` and `src/` finds no remaining read-only or `device-mid.txt` claim for the request path.

### Pass-2 findings

All four are resolved. **compaction-rekeys-turn** (BLOCKING) is fixed in 097bfda. `attribute` returns the session's query id for any `purpose`, opens one only when the session has none, and marks it `titleOpened` only for the title. A main step adopts an existing id only when it is title-opened and no turn key exists yet. The new tracker test and adapter test use the DSH shape `[system, earlier typed message, instruction]` between two steps of the same turn, and the verification record has both failing on the previous tracker. DESIGN §4.5b states the rule. **compaction-effort-high** is fixed in code by 529fe76, not only documented; see item 6. **fixup-commit** is resolved by the squash a598f4c (2bfbeef plus bac18b4). The rewrite changed no tree, and a598f4c adds no non-null assertion. **facts-shared-offsets** is fixed in 798361f: `Lw` @1422054, `nS` @12816000 and `f5s` @3840311 re-read and cited in FACTS, DESIGN §4.3 and §4.5b, and the two code comments.

### Manual compaction sends the previous turn's query id

Confirmed in both sources. In 3.16.3 a manual `/compact` is an input of its own. `zzo` @13357726 derives `b=n?.queryId??n?.inputId??hae()` and `x=o?.traceContext??nS(n?.traceContext??this.rootTraceContext,{queryId:b,...})`, then hands `x` to `this.executeManualCompact(e,f,_,x,z,n?.inputId,sn)` (@13361998). `czo` @13308966 opens a turn (`beginActiveTurn(n,o,"compact",!1)`, a `TurnStarted` event with the command's `inputId`) and calls `compactActiveConversation(t,o,...)` with that context. The compaction request therefore carries the command's own query id.

DSH runs the user command through `compactNow` (rc.3 `dsh-compaction-basic/lib/index.js` around line 985, idle agent only, `selectCompactableRange(..., 0)`), and `summarizeWithLlm` (line 292) sends only `purpose: "compaction"` and `sessionId`, the same request as a pressure compaction. Since 097bfda, `RequestAttributionTracker.attribute` returns `state.queryId` for every compaction on a session it has seen, so the manual compaction goes out with the id of the turn that finished before it:

```
3.16.3:  turn A (QA) ... idle ... /compact (QC, own turn)   next input (QN)
channel: turn A (QA) ... idle ... compaction (QA)           next input (QN)
```

Only the compaction request differs; the next input opens a new id in both. The channel cannot tell the two triggers apart from the request. The pre-097bfda tracker gave the same result, because a manual span with no retained tail ends at the session's turn key, so this is not a regression. DESIGN §4.5b says auxiliary requests "在当前回合里发出", which is not true for this case, and §4.8's turn-boundary bullet lists goal rounds and follow-ups without a typed message but not manual compaction. Action: list the case in §4.5b and §4.8 as a DSH-only difference. If the bundle can see whether a DSH turn is open (for example from the per-step hook the prompt row already uses; not traced), an idle-session compaction could open a fresh query id instead.

### deviceMid write-back safety

The temp file sits beside the state file and is renamed over it, the state is re-read under the lock with its other keys kept, and the lock is closed and removed in `finally`. The stale rule follows `DWs`: a fresh lock stays while its owner record is unreadable or its owner answers `kill(pid, 0)` (or `EPERM`), and a failed `stat` means wait rather than delete. One failure mode is inherited from 3.16.3: a state file that exists but does not parse as a JSON record reads as `{}`, and the write-back replaces it with `{deviceMid}`, dropping whatever else it held. It applies only when the file has no readable deviceMid; the machine's state file has one, so the lock-free read returns it and nothing is written.

A failed lock or write yields the generated id with `temporary: true`, cached for the process as `Xro` caches it. The row-health success reason gets "设备 ID 未能写入 ZCode 状态文件，本进程用临时 ID" without the value, and the config request has no `X-Device-Mid`, as with `Kuc`.

### Evidence, credential handling and coverage

verification.md records on de6c171: build and preflight exit 0; `npm test` exit 0 with 39 spec files, 552 passing, 0 failing; check-verbatim 443 verbatim and 0 known deviations; ESLint 250 suppressed (down from 256), knip 21, jscpd 2; gitleaks clean. Against the read-only code, 6 of 8 glm-device-mid tests fail (through a shim mapping the new export to the old read; the path rule and the lock-free read pass on both), the two new glm-zcode deviceMid tests fail, and the pass-3 fixes fail on their pre-fix code (`f1-old-*`, `f2-old-zcode`). No suite was re-run for this review; the spot checks were offset reads in the pristine bundle and reads of the rc.3 compaction-basic and dsh-llm sources.

Every adapter in the specs that gets past the credential and PAT checks receives `isolatedEnv()` or `zcodeDataDir()`, both mkdtemp under `os.tmpdir()`; the adapters without `env` only list models, report status or fail closed before the deviceMid step, as do health.spec's two stream tests. The coder also ran the seven deviceMid-reaching specs with `USERPROFILE` and `HOME` on an empty directory, and no `.zcode` appeared there. The `~/.zcode/v2` timestamp moved during the full gate window, which verification.md attributes to the running ZCode desktop app (it also moved while no test ran); the redirected-home run is the stronger evidence.

The new tests use fake ids, no health note, error or log line carries a device id, and `ensureDeviceMid` with the adapter's deviceMid cache is removed completely.

Not tested:

- a manual idle-session compaction (its request has the same shape as a pressure compaction);
- store writers in two processes (carried over);
- `decodeMessage` with a `tool_use` block against the rc.3 assembler (carried over);
- the runtime User-Agent segment on the DSH desktop host (carried over; plan step 12 records it);
- the 200-attempt lock timeout path (the failed-write test covers the same fallback).

The sandbox network run (plan step 12) and the L4 restart are pending by design.

</details>

<details>
<summary>File map</summary>

- `src/glm-llm/device-mid.ts`: full `ensureCliDeviceMid` port (lock-free read, locked re-read, generate, atomic write-back, stale lock, fallback with `temporary`); `Kuc` read unchanged.
- `src/glm-llm/zcode.ts`: `ensureCliDeviceMid` per request, temporary-id health note, routing `X-Device-Mid` from `readRoutingDeviceMid` only; compaction effort from the session's latest step; earlier PAT, fail-closed, 401, wire and status changes.
- `src/glm-llm/headers.ts`: `RequestAttributionTracker` auxiliary rule (`titleOpened`), `stepEffort` / `stepEffortOf`; earlier UA and header ports.
- `src/glm-llm/identity.ts`: `ensureDeviceMid` and `device-mid.txt` handling removed.
- `src/glm-llm/anthropic.ts`: `metadataUserId(deviceMid: string, ...)`; earlier `WireShape` body.
- `src/glm-llm/index.ts`, `login-row.ts`, `src/shared/data-home.ts`: doc strings without the bundle deviceMid.
- `src/glm-llm/auth/*`, `signing.ts`, `endpoint-routing.ts`, `token-budget.ts`, `models.ts`, `zcode-wire.ts`: unchanged since pass 2.
- `tests/glm-device-mid.spec.ts`: write-back, concurrency, lock wait, stale and orphan lock, failed write, `Kuc` after a write.
- `tests/glm-zcode.spec.ts`, `tests/glm-transport.spec.ts`: deviceMid generated and failed-write tests, DSH-shape compaction and adoption tests, compaction-effort test; `ensureDeviceMid` test removed.
- `docs/DESIGN.md`, `docs/FACTS.md`, `docs/HANDOFF.md`, `docs/CHARTER.md`: item 9 rewritten as the write-back, attribution and effort rules, offsets.
- `eslint-suppressions.json`: 256 to 250.

Full diff: `git -C C:/Users/29596/Desktop/Project/GLM-Hourness/.worktrees/m1-parity diff main...m1-parity`.

</details>
