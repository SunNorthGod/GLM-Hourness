# Review: docs commit cd257a7 (decision d-code-rules-enforce)

Verdict: APPROVED. No blockers.

## Scope and form
- `git rev-list --count origin/main..HEAD` is 1. HEAD cd257a7 sits on main, parent is origin/main bd5e017.
- Files touched: docs/CHARTER.md, docs/DEVELOPMENT.md, docs/HANDOFF.md, docs/ORCHESTRATION.md, docs/ROADMAP.md. Nothing outside docs/. docs/graph untouched.
- Working tree has only untracked files (.kiro/, msg-refdir-gate.txt, package-lock.json); none are in the commit.
- Not yet pushed (origin/main is still bd5e017). The push is the step after this review.

## Gates
The commit message records, for the final tree: `npm run build` 0, `npm run preflight` 0, `npm test` 0. All three required gates are present with exit codes. Not re-run, per instructions.

## Requirement check
- CHARTER header: version 0.8 (2026-10-31); the 0.8 change line quotes the person verbatim (「试运行规则啥的直接拦就行了，这样反而有问题好发现」) and names `d-code-rules-enforce`. The 0.7 entry is rewritten without the shadow-then-block clause.
- CHARTER §3.2 item 3: the sentence 「写在代码里的门禁不在此列，照旧先影子后拦截……」 is gone. Replacement states: every rule blocks from the day its plugin row is enabled; no shadow or trial period; no sample-count or day-count step from record-only to blocking; each block recorded with rule id and shown on the rules page and morning report; lift by one sentence to the main agent or one command; new plugin rows default to disabled (AGENTS.md), stated as about rows, not rules; after-the-fact checks cannot block and M4 decides what they become. All six kept points of the decision are present.
- CHARTER §6 bullet on rule levels: shadow-first sentence and the "four safeguards replace the shadow period" sentence rewritten whole.
- ORCHESTRATION §6.5 retitled and rewritten to the same content, with each item tagged 已实现 or 规划. Verified against code and docs:
  - Violation records carry rule id, `scope`, `route`; `src/workflow/morning-report.ts` lists them per rule and labels `scope: other` as 「（其他路由）」. Claim is accurate.
  - Rules page: ORCHESTRATION §16 (§16.6) confirms there is no rules page yet. Tagged 规划. Accurate.
  - Per-rule lift: `src/guard/index.ts` has no per-rule switch, so "only by disabling the plugin row" is accurate.
  - Cross-reference "宪章 §7.1 条款 11" is the 处处留痕 clause.
- Superseded text is rewritten, not struck through (no `~~` or strike markers in added lines).

## Search for remaining clauses (docs/ outside docs/graph, all .md)
Patterns covered: 影子, shadow, 试运行, 只记录, record-only, 转为拦截, 误伤率, 晋升/promot, 观察期, 灰度, 样本数, 天数, 先记/先看/先告警, 新门禁/新规矩/新规则, 再生效, 测出, 转正, 毕业.
- No remaining clause states shadow-then-enforce for code rules in CHARTER, ORCHESTRATION, DESIGN, DEVELOPMENT, HANDOFF, ROADMAP, FACTS, or docs/reference/.
- Remaining 影子 hits describe the implemented component `src/guard/shadow.ts` (DESIGN.md §2.4a, §2.5 rows, probe scenario in DEVELOPMENT.md, ORCHESTRATION §6.5.2, §2.7, §6.1, §6.2, §10, §16 metrics). They are current-state descriptions of a record-only fallback; §6.5.2 labels it as unable to block and defers its fate to M4, as the decision text says.
- ORCHESTRATION §9.2 升降级阶梯 (记忆 → 提示词 → 阶段提醒 → 门禁) is the norm-level ladder, not a shadow-to-enforce ladder. CHARTER §6 keeps it. Not in conflict with the decision.
- HANDOFF.md and ORCHESTRATION lines about 「在其他模型上的误伤率还没有数据」 describe monitoring of an enforced rule, not a precondition for enforcing.

## Persona and tone
Added lines scanned for 喵, 本喵, 主人, 呐, 诶, 唔, 啦, 嘛, 哦, 呢, ~, ～, 好耶, 啊这, 呜, exclamation marks. Zero hits. Whole-file count of 喵 in the five changed files: 0.

## Non-blocking observations (not findings)
1. The commit also writes decision `d-timeout-measured` (how timeout values are set) into CHARTER §3.2 item 3 and the 0.8 change line. That decision is approved in docs/graph/nodes/d-timeout-measured.json, the quote matches its relay text, and the 3x-slowest-recent-run and ceiling rules match its body. It goes beyond the task text for this item, but the content is faithful and sourced, and the commit message lists it.
2. CHARTER §6 keeps the sentence that the person may choose record-only for a board entry. The commit message flags it. d-code-rules-enforce names only the code-rule half of 0.7 as superseded, so this is not a contradiction of the decision. The person can confirm later whether it should go too.
3. Pushing is still to do: pull --rebase then push to origin main, up to five tries 30 s apart, no force.
