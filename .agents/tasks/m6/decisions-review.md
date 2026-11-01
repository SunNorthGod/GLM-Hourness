# Review: M6 design 0.6 (decisions of 2026-10-31), round 3

Reviewed revision: `.agents/tasks/m6/design.md`, 291,042 bytes, 1,339 lines, MD5 `D7139CDBF2C83106695CED2AF1D17480`, written 2026-10-31 20:57:56. Companion file read: `.agents/tasks/m6/graph-ops-decisions.json` (20:59:21). Round 2 reviewed the 272,887-byte state (MD5 `BDC0E2FB3E73CA3F569379BE77E93A9B`) and returned CHANGES_REQUESTED (MEDIUM 1, NIT 3). The version number is still 0.6.

Verdict: APPROVED (HIGH 0, MEDIUM 0, NIT 4).

Line numbers below are the ones the editor's search tool reports. A bullet is also named so it can be found when a count differs by one.

Cross-checked against: `src/memory/audit.ts`, `src/data/project-root.ts`, `src/guard/index.ts`, `src/workflow/morning-report.ts`, `packages/hourness/cordis.patch.yml`, the built `packages/hourness/dist/`, `.agents/tasks/rules/design.md` (0.10, §9.4 `CheckResult`, §10.5 record shape), `.agents/tasks/m4/design.md` (0.6), `.agents/tasks/m6/impl-plan.md`, and graph nodes `d-code-rules-enforce` and `d-timeout-measured` (read as JSON under `docs/graph/nodes/`).

## Round 2 findings, re-checked

| Round 2 | Status | Evidence |
| --- | --- | --- |
| F7 MEDIUM: block record location open, mechanism not delivered | Closed | Section "F7 against the block-record ruling" below. |
| F8 NIT: "§9.4 末段" cites the wrong paragraph | Closed | The phrase survives once, in change-table row E11 (L1327), where it quotes the old wording. Live text cites "rules:§9.4「不写规则板的文件」一段" (§7.2 看得见, §18 row 1) and the `rules` element of the JSON uses the same wording. The rules text at that paragraph (rules design L1726 "不写规则板的文件") is the source of the `hits.json` statement. |
| F9 NIT: 10 s / 30 s conflict sits in the wrong place | Closed | §7.2 timeout sub-bullet "做法" now ends: defaults and maximum come from the rules-board side (10 s default, 30 s maximum, citing the comment on node `d-timeout-measured`), "超时先放行、脚本在后台接着跑到 10 分钟、晚到的拦下告诉主 Agent", "M6 不写这些数，`gateOnRules` 的代码与测试也不写". The node carries these figures in its comment of 2026-10-31T07:04:52Z. The JSON to-do two is now a statement that the ruling settled it. |
| F10 NIT: "还没有再评审" would become false | Closed | L3 and the version row in §21 now name round 1 (269,711 bytes, MEDIUM 1, NIT 5), round 2 (272,887 bytes, MD5, MEDIUM 1, NIT 3) and say the round 3 outcome is whatever `decisions-review.json` `verdict` holds. "还没有再评审" is gone (searched). |

Round 1 findings F1 to F6 stay closed. Rechecked on this revision: F3 pointers on rows C3, C4 and item 6 are present (hunk H27/H28); F4 the §12 row cites items 15, 16, 24; F5 L5 is one sentence pointing at `design-0.5.md` line 3; F6 sentence is replaced by the F9 wording; F2 unchanged (`d-timeout-measured` is `approved`).

## F7 against the block-record ruling

Ruling: every block by a rule written in code goes to the project's violation journal (the one the guard already writes under the project's `.llm/`) with rule id, time, what was blocked and why, so the rules page and the morning report can count it.

| Ruling element | Design 0.6 | Checked |
| --- | --- | --- |
| Journal named | `<项目根>/.llm/audit/violations.jsonl`, "guard 已在写的那一份" (§7.2 拦下记录, summary L49, §0.1 L69, §12, §13, §14.1, §18) | `src/memory/audit.ts` `auditPaths({projectHome})` yields `<projectHome>/audit/violations.jsonl`; `packages/hourness/cordis.patch.yml` L21 pins `projectHome` to `<USERPROFILE>/Desktop/Project/GLM-Hourness/.llm`. Same file for this repo. |
| Rule id | `rule: 'rules:<规则 id>'`, example `rules:builtin:glm-peak-reduce` | Matches the record shape in rules design §10.5 (L1781) and the ids in §10.1. |
| Time | `at`, ISO 8601 from the injected clock | Matches `ViolationRecord.at`. |
| What was blocked | `command` (the text given to `checkCall`), `tool: 'pwsh'`, `effect: 'block' or 'queue'`, `peakMode`, `signals` | `command` and `peakMode` are declared as M6 additions; extra keys are harmless to JS readers. |
| Why | `correction` = `CheckResult.text`, empty string when absent | `CheckResult.text?` exists (rules design L1694). |
| Matched rules | `CheckResult.rules` entries with `effect` equal to `CheckResult.effect` and `when` not `'false'` | Fields `id`, `effect`, `when` exist in `CheckResult.rules` (rules design L1693). The design tells R3 to re-check this against the real result. |
| Mechanism feasible | Project root from `projectOf(<仓库根>)?.root`; path from `auditPaths`; append from `auditJournal(append, paths).violation(record)` over `fsAppender({mkdir, appendFile})`; `ensureIgnored(root, '.llm')` first when `.llm` is missing; modules imported dynamically from `packages/hourness/dist/memory/audit.js` and `dist/data/project-root.js` | All five functions exist with the signatures the design uses. Both dist files exist in the current build. `ensureIgnored` throws when `info/exclude` is unwritable and does not create the directory, matching "它抛错就不建目录、算追加失败". `nodeAuditFs` is not exported, so the script builds its own `AuditFs` from `node:fs/promises`, which the design says. |
| Failure | Append failure: one stderr line "rules gate: violation journal not written (…)", once per process, exit code unchanged, no retry, no extra blocking | Stated in §7.2, §13 (new row), acceptance 26. |
| Order | stderr first, then awaited append, then `process.exit`; with `--wait` the first queue judgement is recorded before sleeping | Stated in §7.2 结果 and 顺序与失败. |
| Count | One line per matched rule; same (rule id, effect) once per run, so `--wait` re-judgements do not write one line per 60 s | A design choice within "every block"; one run is one blocked start. Acceptance 26 pins the cases. |
| Test | Acceptance 26 (L2, `tests/rules-gate.spec.ts`): exit 4, two rules, exit 5 with `--wait`, exit 0, append failure, not-a-project, worktree root, one real-filesystem case | Present at L159 to L166. |
| Readers | Morning report (rules design §10.5 R7, M7 0.6 被拦次数), `ruleStats` after M4 `classifyRecord` (M4 0.6 §2.3); rules page 7-day count still reads `hits.json`, filed as a non-blocking request in §18 | See F11 about how the morning-report statement is worded. |
| Behavior change declared | L3 "唯一的行为改动是…拦下记录"; E1, E2, E6, E10 | Yes. |
| S2 unblocked | §16 S2 row states the append and its two test injections; the `m6-script-gate` element in the JSON tells the running implementation the location and shape | Node `m6-script-gate` exists in `docs/graph/nodes/`. `impl-plan.md` L69 waits for exactly "修订稿指定位置". |

F7 is closed.

## Other rulings

Timeout (`d-timeout-measured`). §7.2 matches the ruling item by item: the writing agent estimates the run time; timeout is always 3 times the run time, first from the estimate, then from the slowest recent run; never above the maximum; no estimate means the default; board gating scripts default 10 s, maximum 30 s; a timeout passes the call and the script runs on to 10 minutes; a late block goes to the main agent; the person sees the timeout with the estimate it came from; graceful failure (no crash, no lost work, the entry's stated outcome, a message naming entry, limit, elapsed time, next step); traceability (value source, time, previous value; each timeout recorded with entry, limit, elapsed, outcome; visible on the rules page, the loops page and the morning report); above the maximum keep the maximum and tell the main agent. The M4 (60 s and 20 s) and M7 (30 min) figures are not written in M6, which is correct since M6 owns no such timeout. The difference with released rules 0.10 and loops 0.6 is recorded as an after-dogfood request ("0.6：没有改的" row 3) and does not block. M6's own 15 s quota request timeout, 3 s command wait and 8 h `--wait` are excluded correctly.

Lift (`d-one-lift-path`). The design adds no M6 command and cites the ruling. See F14.

## Behavior other than F7

`git diff --no-index` of `design-0.5.md` against the current file: 86 insertions and 28 deletions in 29 hunks (round 2 saw 54 and 19). Every hunk maps to a row of the "0.6：改动表" E1 to E13: version text (E1, E10, E13), basis line (E5), summary (E1, E4, E10), §0.1 rows (E1, E3, E4), acceptance 24 (E4) and 26 (E10), §3.3 interface row (E10), §7.2 (E10, E4, E12, E1, E2, E6), §12 to §14.1 rows (E3, E2, E10), §15 (E10), §16 S2 (E10), §18 (E10), §19 and §20 (E1, E3, E4), §21 (E7, E10 to E13). The only behavior change is the append on exit codes 4 and 5, plus the test-only `appendLine` parameter, both declared. No change to `src/`, to the acceptance verdicts of items 1 to 25 (item 24 gains a clause that already existed in round 2), or to the step count. No copy of the exact 272,887-byte state exists on disk, so this comparison runs against 0.5 and my round 2 notes, not against that state. The hunks that round 2 verified (L54 "两处", the §19 row count of 30, the C3/C4 pointers, the one-sentence 0.5 note) are all still in place.

`graph-ops-decisions.json`: parses with Node `JSON.parse`; no BOM; three elements, each with exactly `op` ("comment"), `id`, `text`; ids `m6`, `rules`, `m6-script-gate` all exist as nodes. The `rules` element now asks only for the rules-page 7-day count. No persona or tone words in either file (searched).

## Findings

### F11 (NIT): the morning-report count is stated as a fact in five places, but §7.2 says today's report ignores these lines

Where: summary L49 ("晨报按这份流水数"), §0.1 row L69 (same), §7.2 启用即拦 L749 ("晨报按它数"), §12 row L975 ("不加这一行晨报就数不到脚本自查的拦下"), §18 row 1 L1160 ("晨报按违规流水数不受影响"). Against §7.2 看得见 L747: "今天的 `src/workflow/morning-report.ts` 只把没有 `mode` 的行算拒绝，`mode: 'enforce'` 的行要等 R7 或 `classifyRecord` 接上才数".

Problem: I confirmed the §7.2 statement in `src/workflow/morning-report.ts` L38 (`denials = violations.filter(v => !('mode' in v))`) and L39 (`shadows` needs `mode === 'shadow'`). A `mode: 'enforce'` row is counted by neither. The ruling says the pages "can count" the record, and the design does deliver a record the released reader designs expect, so this is not a missing mechanism. The five shorter statements read as if M6's append makes the morning report show the count by itself. The one-page sheet is written from this design and would inherit the shorter reading.

Fix: add the same qualifier to each of the five places, for example "晨报在 R7 或 `classifyRecord` 接上之后按这份流水数（见 §7.2 看得见）". In §12 L975 write "不加这一行，R7 与 `classifyRecord` 接上之后晨报也数不到脚本自查的拦下".

### F12 (NIT): acceptance 26 compares a path string that will not match on Windows

Where: acceptance 26, first sub-bullet (L160): "路径是 `<临时仓库>/.llm/audit/violations.jsonl`".

Problem: `projectOf` returns `resolve()`d paths (backslashes on Windows) and `auditPaths` strips trailing separators and appends `/audit/violations.jsonl`, so the produced string is `C:\…\repo/.llm/audit/violations.jsonl`. The repository is developed on Windows. A literal string comparison fails there.

Fix: write the assertion as "路径经 `path.normalize` 后等于 `join(<临时仓库>, '.llm', 'audit', 'violations.jsonl')`", and apply the same to the worktree case at L165.

### F13 (NIT): "profile" is the wrong name for what pins the guard's journal to the repository

Where: §7.2 拦下记录 · 文件 ("本仓库今天 profile 把 guard 的 `projectHome` 钉在仓库的 `.llm`", L740), §18 row 2, the `m6` and `m6-script-gate` elements of the JSON.

Problem: the pin is the `data` row config in `packages/hourness/cordis.patch.yml` L20–21 (`projectHome: process.env.USERPROFILE + '/Desktop/Project/GLM-Hourness/.llm'`). `AGENTS.md` separates the bundle's patch file from the user's `~/.dsh` profile. The sentence is the only evidence that the guard's file and M6's file are the same file, and it is true only while that patch is the loaded config.

Fix: replace "profile" with "`packages/hourness/cordis.patch.yml` 的 `data` 行配置（固定为这台机器上的仓库路径）" in those places.

### F14 (NIT): §7.2 lists `/rules peak` as a lift route next to a sentence that says there is one route

Where: §7.2 看得见 L747 ("默认规则的附属条目随档位走、不能删，改档位用 `/rules peak 无影响`，对主 Agent 说一句也行 … 人撤规则只有一条路，对主 Agent 说，或 `/rules lift <id>`") and the §12 row L974.

Problem: the ruling `d-one-lift-path` says the person lifts any rule by telling the main agent or by `/rules lift <id>`, that the rules board hands a code rule's lift to the row that owns it, and that built-in code rules being liftable is an exception to `d-defaults-readonly`. The design cites that ruling and also describes a third route, `/rules peak`, and says the default entries cannot be removed. Today that is accurate: the node comment of 2026-10-31T07:04:52Z says the running rules-board implementation lets `rule-lift` act on board entries only. A reader still sees two different statements.

Fix: after the sentence about `/rules peak`, add: "按 `d-one-lift-path`，规则板会把代码规则的撤下交给拥有它的那一行，之后 `/rules lift builtin:glm-peak-reduce` 也行（自举之后的请求，规则板 0.10 未写）；`/rules peak` 是 d-peak-mode 的选档命令，不是第二条撤规则的路". Leave the code and tests alone: `CheckResult.text` already carries the rules board's wording.

## Verified assumptions

- Round 2 findings F7 to F10 are fixed as stated in the table above; each was checked against the file, not against the change table.
- `auditPaths`, `auditJournal`, `fsAppender`, `AppendLine`, `projectOf`, `ensureIgnored`, `gitDirOf` exist with the signatures §7.2 uses (`src/memory/audit.ts`, `src/data/project-root.ts`).
- `packages/hourness/dist/memory/audit.js`, `dist/data/project-root.js` and the `dist/rules/` directory exist; `dist/memory/audit.js` is absent from `packages/glm/dist`, and the design imports from the hourness package.
- `projectOf` follows a `.git` file to `commondir` (worktree to main checkout) and returns `undefined` for the home directory, a drive root, or a non-git folder without `.llm`, which is what acceptance 26 relies on.
- `ensureIgnored` appends `.llm/` to `info/exclude` once and throws on write failure.
- `CheckResult` has `effect`, `exitCode`, `rules[{id,title,effect,when}]`, `text?`, `signals[{name,value?,unknown?,source}]`, `peakMode`.
- `d-timeout-measured` and `d-code-rules-enforce` node text and comments match the design's wording of the timeout and lift rulings.
- `calibrate` and `smoke:authorized` take no secret-bearing arguments (`smoke-zcode-authorized.mjs` takes none; `run-calibrate.mjs` flags are task and run selectors), so `command` in the journal line does not carry credentials.
- The section 19 row count (30) and the acceptance numbering (26 items) are consistent across §0, §1.4, §19, §21.

## Unverified or not checked

- Not run: build and tests. This is a design review; `tests/rules-gate.spec.ts` does not exist yet.
- Not checked: that M4's future `classifyRecord` and `recordKey` accept the extra keys `command` and `peakMode`. M4 0.6 is a design and its code is not in the tree.
- Not checked: that `CheckResult.rules` in the real R3 returns `when: 'unknown'` for the cases where the design's selector would include it. The design delegates this to R3 ("以规则板的为准").
- Not checkable here: the exact 272,887-byte state of round 2 (no copy on disk).
- Side observation, outside the design: in this checkout `npm run -s graph -- show <id>` fails at load with `SyntaxError: The requested module './proposal.ts' does not provide an export named 'PROPOSAL_FIELDS'` (from `src/graph/format.ts`), so graph nodes had to be read as JSON files. This looks like a half-finished change in the working tree of some other run and is not a finding on this design.
- Not done by this step: no change to `docs/graph`, to git, or to any module, as the step forbids. A graph sync of this round's outcome is left to the orchestrator.
