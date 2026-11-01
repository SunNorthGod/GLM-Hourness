# onepage.md review — metrics design 0.7

Reviewed file: `.agents/tasks/metrics/onepage.md` (the one-page release note for metrics design 0.7).
Source of truth: `.agents/tasks/metrics/design.md` 0.7 (second pass), graph node `d-metrics-ratios-person-only`, and `.agents/tasks/design-context.md` one-page-note rules.

## Pass 1 (2026-11-01)

Fresh review; no prior pass exists.

### Findings

1. MEDIUM — Stale item count in `替你定的`. The note states "替你定了 39 件事，列在设计第 15 节". Design 0.7 §15 ("由 agent 定、人可推翻的事项") has 42 numbered items (1 through 42; 0.7 added items 40, 41, 42 — the ratio-board decisions). The note carries the 0.6 count. This contradicts design.md 0.7 and fails the step's "nothing contradicts design.md 0.7" requirement; the person is explicitly pointed to §15 to see the items and would find 42, not 39.
   - Fix: change "替你定了 39 件事" to "替你定了 42 件事".

### Verified Assumptions

- `25 条检查` is correct, not a defect. Design 0.7 §1.4 has exactly 25 acceptance conditions (counted items 1–25); design §16 body states 「25 条」是 §1.4 现在的条数（0.7 加了第 25 条指标板）, and §15 item 38 states 0.6 时 24 条、0.7 加了第 25 条，所以现在 25 条. The step prompt's parenthetical "24 system-run checks" is the stale 0.6 number; writing 24 would itself contradict design.md 0.7 §1.4 and §16. The note's 25 is the correct, self-consistent choice.
- ② handled as the person's already-made 2026-11-01 decision, under `你定过的（11 月 1 日）`. Verified against graph node `d-metrics-ratios-person-only` (approved): the person's verbatim words 「都按你说的来就行…要么做成UI要么就在新手教程里写明白」 match the node's `history[0].relay`; the four relayed 减负数字 (每周问你几次 / 每次读多少字 / 你等了多久 / 因你的决定返工几次) match the node body and design §16 ②; other ratios are person-only; both the UI board and the tutorial line are reported done. The note does not re-ask ②.
- ① kept as the single open question in the d-ask-three-gates shape (a): one yes/no question with recommendation and reason inside, ending 可以吗, 「可以」 accepts. Wording matches design §16 ① nearly verbatim. The checks are not listed inline; the note says they are in design §1.4 and the main agent gives them on request, matching design §16 and §15 item 38.
- The ratio board is mentioned in the opening scenario (「点开『指标』板」 / 「面板『指标』板里」).
- Fact/score split in the scenario matches design §7.6.4 and §7.3: facts (派出/做完/等你/检查没过, 额度, 覆盖行) are shown under `/hourness`（主 Agent 转述）; ratios (原样同意、跟了推荐、问法分布、按模型比较) are shown only under the board（主 Agent 不转述）. The pass-rate score is not leaked into the relayed facts; only the failed-check count (a fact) is relayed.
- d-code-rules-enforce quote in `替你定的` matches design: 「试运行规则啥的直接拦就行了，这样反而有问题好发现」; the told-decision content (指标记录先启用、防误写的规则晚一步装、要等管拦截的那一块先合入) matches design §15 item 35.
- Ten implementation steps: matches design §16 ①.

One-page-note hard limits (all pass):
- At most 5 change bullets: exactly 5 under `对你有什么变化`.
- At most 3 decision items in d-ask-three-gates shapes: 1 (① only, in `要你定的`).
- At most 1,500 characters: 1,308 including newlines (1,268 excluding).
- Forbidden words 验收 / 标定 / 门禁 / 影子: 0 occurrences each.
- Clean zone, UTF-8 without BOM, LF: no BOM; 0 CRLF, 40 LF; no persona markers.

### Unverified / Wrong Assumptions

- WRONG: "替你定了 39 件事" — the design §15 count is 42, not 39 (Finding 1).

### Verdict

CHANGES_REQUESTED — 1 MEDIUM, 0 HIGH.

## Pass 2 (revision, 2026-11-01)

Re-review after the author's correction. The note was re-read in full against design.md 0.7 (second pass), graph node `d-metrics-ratios-person-only`, and the one-page-note rules in design-context.md.

### Prior findings

1. (Pass 1 MEDIUM, stale item count) — CLOSED. The note now reads "替你定了 42 件事，列在设计第 15 节，都能推翻". Verified against design.md 0.7 §15 ("由 agent 定、人可推翻的事项"), which is numbered 1 through 42 (items 40–42 are the 0.7 ratio-board decisions). The count the person is pointed to now agrees with §15.

### Findings

None.

### Verified Assumptions

- Item count `42`: design §15 numbers items 1–42; item 42 is the last before §16. Matches the note.
- Check count `25`: design §1.4 has exactly 25 acceptance conditions (items 1–25, item 25 being 指标板); design §16 body and §15 item 38 both state the current count is 25 (0.6 was 24). The note's `25 条检查` in both the prose and the ① question is correct and self-consistent; the step prompt's "24" is the stale 0.6 figure.
- ② is a told decision, not re-asked, under `你定过的（11 月 1 日）`. The person's verbatim words 「都按你说的来就行…要么做成UI要么就在新手教程里写明白」 match `d-metrics-ratios-person-only` `history[0].relay`. The four relayed 减负数字 (每周问你几次 / 每次读多少字 / 你等了多久 / 因你的决定返工几次) and the "UI + 新手教程两样都做" outcome match the node body and design §16 ②, §7.6.
- ① is the single open question in d-ask-three-gates shape (a): one yes/no question (可以吗), recommendation and reason inside, no cost sentence (design §16 ① specifies 没有代价句). Wording matches design §16 ① almost verbatim; the 25 checks are referenced to §1.4, not listed inline (design §15 item 38, §16).
- Ratio board named in the opening scenario (「点开『指标』板」, 「面板『指标』板里」) and the `summary` command-line fallback named (「命令行 npm run metrics -- summary … 是后备」).
- Fact/score split in the scenario matches design §7.3 and §7.6.4: `/hourness`（主 Agent 转述）carries only facts (派出/做完/等你/检查没过, 额度, 覆盖行); the panel board（主 Agent 不转述）carries the ratios (原样同意、跟了推荐、问法分布、按模型比较). No score (pass rate, agree rate) leaks into the relayed facts; only the failed-check count, a fact, is relayed.
- Five change bullets all trace to design: 数都由系统记 (§0, F6/F8), 新问法试行的效果有数 (§7.2 问人, refusal codes text-too-long/plain-word/too_many in §4.2), 记录放在项目里 (§5.5, d-rules-in-repo/d-memory-scope), 只有你能删 (§3.4 metrics-files-only, d-one-lift-path), 出了问题会说 (§5.1, §6.4 self-check, coverage line).
- `替你定的` told-decision matches design §15 item 35 / §3.4: metrics row enabled first (step 6), metrics-files-only installed one step later (step 7) because it waits for M4's gate to merge; the in-between gap is caught only after the fact. The person's words 「试运行规则啥的直接拦就行了，这样反而有问题好发现」 match d-code-rules-enforce.

One-page-note hard limits (all pass):
- At most 5 change bullets: exactly 5 under `对你有什么变化`.
- At most 3 decision items in d-ask-three-gates shapes: 1 (① only).
- At most 1,500 characters: 1,308 including the trailing newline (1,307 excluding it); well under the cap.
- Forbidden words 验收 / 标定 / 门禁 / 影子: 0 occurrences each (grep).
- Clean zone, UTF-8 without BOM, LF only: no BOM, 0 CRLF; no persona markers.

### Unverified / Wrong Assumptions

None. The Pass 1 wrong count (39) is corrected to 42.

### Verdict

APPROVED — 0 HIGH, 0 MEDIUM. Pass 1's single MEDIUM is closed; no new findings.
