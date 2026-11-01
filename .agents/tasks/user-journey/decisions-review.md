# Review: user journey 0.6, third round (re-review of the decisions)

Reviewed: `.agents/tasks/user-journey/journey.md` (0.6, 750 lines, 155,869 bytes, written 2026-10-31 20:56:12, MD5 `D080D22E4A52F9CCE68583D880352B55`) and `.agents/tasks/user-journey/graph-ops-decisions.json` (written 20:55:01, 8 comment ops). This file replaces the second-round review (`decisions-review.json` 16:11, `decisions-review.md` 16:10), which I read first together with `align-stop-report.md`.

Checked against: the brief's orchestrator rulings (timeout under `d-timeout-measured`, `d-one-lift-path`, block records), the graph nodes `d-timeout-measured`, `d-code-rules-enforce`, `user-journey`, the designs as they are on disk now (M4 0.6 written 20:59, bootstrap 0.6 written 20:50, rules 0.10, loops 0.6, M7 0.6), CHARTER 0.8, and `src/memory/audit.ts`, `src/guard/index.ts` for the violation journal.

Verdict: APPROVED (HIGH 0, MEDIUM 0, NIT 5). The five NITs are listed below; none blocks.

## Status of the second-round findings

| Round-2 finding | Result | Evidence |
| --- | --- | --- |
| R1 (MEDIUM) first number means two things | Closed | See "R1 in detail" below |
| R2 (NIT) stale "still being written" notes, closed `/guard lift` item, "各一条" | Closed | §0 M4 row and bootstrap row now describe M4 0.6 (15:11) and bootstrap 0.6 (16:26) as written; no hit for 「正文还在写」 or 「13:47」 outside the revision log (L11, L682). G26 says `/guard lift` and `unlock-shell` are deleted (M4 §3.5, bootstrap review F2). §6.3 M4 bullet says the two items are no longer requests. Comment 2 now reads 「给 M4 0.6 的改稿步一条（接管项目已改完）」, which matches the single combined §6.3 bullet. Current M4 §3.5 and bootstrap §0, §8.2 (re-read on disk now) say the same |
| R3 (NIT) numbers repeated outside S7 | Closed | S7 last sub-bullet (L303) now names G28 and §6.3 as gap and request records that carry numbers only where a request needs them. G28 row says 「数见 S7」. §6.3 rules, loops and M7 ⑤ bullets carry no timeout figures. S8 and S9 carry none. A grep of S8, S9, §6.3, §7 for seconds and minutes finds only the page example 「超时 60 秒」 and the M4 5 s floor, both inside request text |
| R4 (NIT) 「三处」 referent | Closed | S7 L293 now reads 「三处：规则板 0.10、M3 的八条、M7 的门，见 §6.1 G26」; `unlock-shell` is gone from that sentence |
| R5 (NIT) lifting a board entry vs a code rule | Closed | S7 用户做什么 lift bullet (L270) now separates the two: code rule on the person's own words (M4 §3.5, `guard_lift` step 4 checks the last user message), board entry through a four-line confirmation (rules 0.10 §2.5, `rules_propose` kind `lift`, then `propose_to_human`; read at `rules/design.md` L337) |
| R6 (NIT) CHARTER 0.7 vs 0.8 | Closed | S7 L292 cites `docs/CHARTER.md` 0.8 §3.2 item 3 and §6; the §1 CHARTER row (L67) says 0.8 and that §3.2 item 3, §6, §9 were reread. The remaining 「宪章 0.7 §6」 at L731 is inside the 0.5 revision record (§8.3), which the document keeps verbatim |
| R7 (NIT) G28 tags in the picture | Closed | G28 row stage cell reads 「S4、S7（S8、S9 只指向 S7）」. `journey-overview.svg` parses as XML and tags G28 on S4 (「G1 G28」) and S7 (「G21 G26 G28」) only, S8 shows G26, S9 shows G11. The footnote lists G1 to G28 and the same open set as §6 |
| R8 (NIT) §6.2 relabelling without a recorded request | Closed | Header item 5 now says 「该项不在三个决定和 ②③ 的回答之内，图上没有对应的请求记录，是作者的取舍，编排方可以撤回」 and describes how to revert. §6.2 has 11 rows (counted) |
| R9 (NIT) `onepage.md` still 0.5 text | Unchanged, by design | `onepage.md` last written 2026-10-31 05:45:44. Header and status line assign the rewrite to a later step (`d-onepage-concrete`). Carried as a NIT below so the later step does not inherit stale text |

## R1 in detail (reviewer's option A against the brief's ruling)

Each point of the ruling and where `journey.md` carries it:

| Ruling | Where in the document | Result |
| --- | --- | --- |
| Writing agent estimates the expected run time | S7 「超时怎么定」 sub-bullet 「怎么算」; header item 3; §6.4; §7 row for `d-timeout-measured`; G28 | Present |
| Timeout is always 3 times the run time; first from the estimate, after real runs from the slowest recent run | Same sub-bullet: 「超时一律是预计用时的 3 倍。第一次用它的估计；真跑过之后 … 最近几次里最慢一次」; the worked example 「超过 12 秒算没跑完（写脚本的 agent 估计跑一次 4 秒）」 removes the reading "timeout = estimate" | Present |
| Never above the design's maximum; no estimate means the default | Sub-bullet 「最长值与缺省」: 「3 倍超过最长值时保持最长值，并告诉主 Agent 一次，不自己抬高最长值」; 「没有估计时用下面各处的缺省值」 | Present |
| Gating scripts default 10 s, maximum 30 s | Same sub-bullet: 「缺省 10 秒、最长 30 秒（规则板 0.10 §1.3 与 §6.7、循环板 0.6 §6.6 的 `GATE_TIMEOUT_MS`、`GATE_TIMEOUT_MAX_MS`）」. Matches `schedules/design.md` L950–951 (10_000, 30_000) | Present, verified |
| Timeout passes the call through, script keeps running up to 10 minutes, late block reported to the main agent | S7 bullet on gating scripts and the 「优雅失败」 sub-bullet; `GATE_HARD_CAP_MS = 600_000` at `schedules/design.md` L953; trunk-advance default is block (`gateOnErrorDefault: 'block'`, `schedules/design.md` L1710), which the document states as the exception | Present, verified |
| M4 checks after an edit: 60 s each, 20 s per step | Same sub-bullet: 「每个最长 60 秒、一步最多等 20 秒，没有估计时取最长值」. Current M4 §6.3.1 items 2 and 3: `CHECK_TIMEOUT_CAP_MS` 60 s, `CHECK_STEP_DEADLINE_MS` 20 s, no estimate gives the cap | Present, verified |
| M7 merge-gate checks 30 min each | 「合入前的检查每条最长 30 分钟，没有估计时取 30 分钟（M7 §3.8.1）」 | Present |
| Non-gating scripts | 「缺省 60 秒、最长 1800 秒」; `WORK_TIMEOUT_MS` 60_000 and `WORK_TIMEOUT_MAX_MS` 1_800_000 at `schedules/design.md` L957–958 | Present, verified |
| The person sees the timeout at approval, with the estimate it came from | 「你看到什么」 sub-bullet; the four-line notes bullet (L316): 「超过几秒算没跑完并在旁边写它依据的预计用时」; S4 trial bullet | Present |
| Graceful failure: no crash, no lost work, the entry's stated outcome, a message naming entry, limit, elapsed time and next step | 「出了岔子不崩（优雅失败）」 sub-bullet: 「不让行崩、不丢已做的工作，结局照条目自己写明的办法走 … 写明是哪一条、限了多少秒、已经跑了多久、下一步怎么办。估错的数只影响下一次的值」 | Present |
| Traceability: source, time, previous value for each value; each timeout event (entry, limit, elapsed, outcome); visible on pages and in the morning report | 「看得出来历」 sub-bullet; matches M4 §6.3.1 `ValueLine`, `TimeoutLine` | Present (see N2 for the morning-report wording elsewhere) |
| Above the maximum: keep the maximum and tell the main agent | In the 「最长值与缺省」 sub-bullet | Present |
| Released designs still say the first number is the timeout; that is a request for after dogfood, not a block | G28 item one and the S7 closing sub-bullet; §6.3 rules ③, loops, M7 ⑤; the three graph-ops comments say 「不是现在的阻塞」 and cite `d-freeze-until-dogfood` | Present |

Leftover wording check: no remaining use of the old meaning. 「首个值取试跑实测」, 「从上限起步」, 「写脚本的 agent 没给估计就是 10 秒」, 「先估一个超时」 are gone. The surviving hits for 「第一个数就是超时本身」 (L303, L523, L557, L589, L590) all describe the released designs, which is accurate. Header item 3, S4, S7 (three places), G28, §6.3, §6.4, §7 and §8.0 now agree with each other.

Agreement with the designs the document says already follow the rule:
- M4 0.6 §6.3.1 (on disk now): estimate treated as the slowest run before any real run, so the first timeout is 3 times the estimate; floor 5 s, cap 60 s, step deadline 20 s; over the cap the value is held and the main agent is told. Matches S7 and G28.
- M4 §6.1.1 still shows `<预计>` seconds only; §18 item ⑩ still says the loops executor takes the estimate as the first value. G28 item one reports both as differences to be aligned in the M4 revision step. Both statements are true on disk.
- Bootstrap 0.6 §2.5 and §6.3: estimate taken from the trial run, 「没预计」 plus the class default marked 「（默认）」 when there is no trial result, trial caps (10 min each, 45 min total) fixed and outside the 3 times rule. Matches S4 and S7.

## graph-ops-decisions.json against option A

- Parses: UTF-8, JSON array, 8 objects, each with exactly `op`, `id`, `text`; `op` is `"comment"` throughout; the target nodes `user-journey`, `rules`, `schedules`, `m7` exist under `docs/graph/nodes/`. Shape equals `{ op: 'comment', id, text }` at `src/graph/mutation.ts` L74.
- Comment 0 (`user-journey`) states option A: the estimate is the expected run time, timeout always 3 times it, first from the estimate, then the slowest recent run, held at the maximum with the main agent told, no estimate takes the default; gating 10 s default and 30 s maximum, 10 minute background run unchanged; non-gating 60 s / 1800 s; checks after an edit 60 s each and 20 s per step (no estimate: 60 s, M4 floor 5 s); merge gate 30 min; values, sources and each timeout visible on the rules page, the loops page and the morning report; takeover commands take the trial run as the estimate; trial caps fixed.
- Comment `rules` (released rules 0.10): timeout rewritten as estimate times 3 with the figures unchanged, pass-through and 10 minute background run unchanged, source/time/previous value and per-timeout record, graceful-failure message; lift extended to code rules through the owning row (`glmHournessLifts`) with the §1.4 item 12 sentence withdrawn and the group marked 「可以撤下，不能改」; block records per rule id from the guard's violation journal. Marked as post-dogfood and non-blocking.
- Comment `schedules` (released loops 0.6): §6.6 rewritten the same way, `GATE_TIMEOUT_MS`, `GATE_TIMEOUT_MAX_MS`, `WORK_TIMEOUT_MS`, `WORK_TIMEOUT_MAX_MS` unchanged, page shows the timeout with its estimate, history and each timeout; `loops:schedule-tools` and `loops:files-only` change from shadow listing to enforce on enable. Marked non-blocking.
- Comment `m7` (released M7 0.6): §3.8.1 rewritten, no estimate keeps today's 30 min behaviour, timeout counts as not passed, morning report shows it.
- Comment 2 counts equal §6.3: M3 4, M7 6, rules 3, loops 1, orchestrator 6, M4 1; §6.2 has 11 rows; §7 has 40 rows; G1 to G28 are all present (each counted).

## Items ② and ③ recorded as decided by the person

- The brief's message 6 contains both answers; message 7 is 「都没问题」.
- Graph: `user-journey` comments of 2026-10-31T05:37:43Z record ② 「额度重置后自动接上」 as decided and ③ 「至于目标的话。。做完一点汇报一点，或者等收菜」 with the orchestrator's reading pending; the comment at 05:51:16Z records the person's 「都没问题」 and says 「这一件定案」, and says ② was decided the same day.
- Journey: header item 4; §5.2 (「你 2026-10-31 定：「额度重置后自动接上」」); S10 (「人定，2026-10-31；你答：「做完一点汇报一点，或者等收菜」，编排方把它读成下面三句，你回：「都没问题」」); G15 and G18 (「人 2026-10-31 已定」, the design gaps stay open because the released designs say nothing); §6.4 titles 「（人定）」 for both; §7 rows quote both sentences and say 「2026-10-31 人定」.
- The reading of ③ is labelled as the orchestrator's reading and the confirmation is quoted. The §7 node column says 「图上节点待编排方记」, which is accurate: no standalone decision node exists yet, only the comments above.
- `graph-ops-decisions.json` comment 1 repeats both decisions with the same quotes and states the §7 follow-up for when the orchestrator records nodes.

## d-one-lift-path and block records

- One path, no module command: S7 (L293), S8 (命令 line), G26, §6.3 rules ①, §7 row, header items 6 and 7, comment 2 and the `rules` comment all say: tell the main agent, or `/rules lift <规则 id>`; the rules board hands a code rule to the owning row; no `/guard lift`, no `/hourness-init unlock-shell`. M4 §3.5 and bootstrap §0, §8.2 on disk agree.
- Exception to `d-defaults-readonly`: stated in S7 (L293), S8 (「可以撤下，不能改」), §7 row for `d-defaults-readonly`, G26, §6.3 orchestrator ⑤ (the node must record it) and comment 2.
- Block records: S7 (L293) says every block by a code rule is written to the guard's violation journal under the project's `.llm/` with rule id, time, what was blocked and why, counted per rule id on the rules page and in the morning report. Verified in code: `src/memory/audit.ts` writes `<projectHome>/audit/violations.jsonl`, and `src/guard/index.ts` documents that every denial is journaled there. M4 §3.2 and the acceptance row 1 require one record per denial with rule id, tool, call, scope and route.

## Findings (all open items are NITs)

### N1 [NIT] A ruling recorded one second after the draft is not in the document

Where: `journey.md` G28 item three (「裁定与其余设计都没有；要不要有，留给规则板、循环板、M7 的改稿定」), S7 「最长值与缺省」 (「M4 另有 5 秒的下限，别的设计没有」), §6.3 M4 bullet (「要不要写进别处与规则板、循环板、M7 一起定」); `graph-ops-decisions.json` comments `rules`, `schedules`, `m7`.

Problem: `d-timeout-measured` carries a comment at 2026-10-31T12:56:13Z (20:56:13 local) from the orchestrator that settles the floor question: timeout is not below a floor and not above the maximum, and each design writes its floor beside its maximum (M4's 5 s stays); the requests to loops, rules and M7 are worded 「第一次超时 = 3 倍估计」; when 3 times the slowest run exceeds the maximum, the main agent handles it (shrink or narrow the check, or raise the maximum as a revocable setting with a stated reason) and does not ask the person. `journey.md` was written at 20:56:12, so it could not include this. The brief does not list it, and the document's statements were true against the rulings the brief lists, so this is not a block. Left alone, the three post-dogfood requests carry no floor, G28 item three stays open although the graph answers it, and S7 says only 「告诉主 Agent 一次」 about the over-maximum case.

Fix: in G28 item three and the §6.3 M4 bullet, replace 「留给 … 一起定」 with the 12:56Z ruling (each design states a floor beside its maximum; M4 keeps 5 s). Add one clause to each of the `rules`, `schedules`, `m7` comments and the matching §6.3 bullets: 「不低于下限、不高于上限，下限写在上限旁边」. In S7 「最长值与缺省」 add: the main agent decides what to do and does not ask the person. Or leave all of it for the next touch and say so in the status line.

### N2 [NIT] Morning-report visibility is promised in S7 and not carried everywhere

Where: S9 morning-report bullets (「例外（违规按规则 id 计 …）」) and S9 weekly-report bullet; §6.3 M7 ⑤ (「超时有说明、有来历与历史（G28）」) and the loops bullet; `graph-ops-decisions.json` comment `schedules`.

Problem: S7 says timeout values, sources and each timeout are visible on the rules page, the loops page and the morning report, and S9 is meant to point to S7. S9's morning-report list names block counts per rule id but no timeout section, and S9 mentions timeouts only in the weekly report (3 or more in 7 days). The `rules` and `m7` graph comments name the morning report; §6.3 M7 ⑤ and the loops request and the `schedules` comment do not. M4 §3.10 already adds a 「检查的超时」 section to the morning report, so the design side exists for M4 only.

Fix: add to S9 「用户看到什么」 morning-report bullet: 「检查与脚本的超时（当前值、来历、近 7 天超时几次）见 S7「超时怎么定」」. Add 「晨报看得到」 to the §6.3 M7 ⑤ text and to the loops bullet and `schedules` comment (for scripts and checks the morning report is produced by M7, so the M7 request is the one that must carry it).

### N3 [NIT] The `rules` comment says it equals the three §6.3 bullets, and it does not

Where: `graph-ops-decisions.json`, `rules` comment, last sentence (「journey.md §6.3 给规则板的三条是同一批请求」); `journey.md` §6.3 rules bullets ①, ②, ③.

Problem: §6.3 rules ① is lift plus block records, ② is F82 (code-gate shadow-first text becomes enforce on enable), ③ is the timeout. The comment contains the timeout, the lift and the block records, and has no F82 sentence.

Fix: add one sentence to the comment, for example 「规则板 0.10 的 F82 一段（代码里的门禁照旧先影子）改成启用即拦」, or reword the closing to 「§6.3 给规则板的 ① 与 ③ 是这批请求，② 另见 comment 2」.

### N4 [NIT] `d-one-lift-path` is cited like a node, and there is no node with that id

Where: `journey.md` S7 L293 (「编排方裁定 `d-one-lift-path`」), G26, §7 row for `d-defaults-readonly`, header items 6 and 7; `graph-ops-decisions.json` comments 0 and 2.

Problem: `docs/graph/nodes/d-one-lift-path.json` does not exist. The ruling is the comment at 07:04:52Z on node `d-code-rules-enforce`, refined at 12:56:13Z. §1's graph row lists `d-code-rules-enforce` as read but never says the ruling lives there, so a reader who searches for the id finds nothing. (`d-timeout-measured` is cited with the comment times, which is the right form.)

Fix: at the first use in S7 and in the §1 graph row write 「`d-one-lift-path`（`d-code-rules-enforce` 节点 2026-10-31T07:04Z 的批注）」, and in G26 the same parenthesis.

### R9 [NIT, carried] `onepage.md` still holds the 0.5 text

Where: `.agents/tasks/user-journey/onepage.md` (05:45:44), still saying code rules run in trial first, items ② and ③ open, asking the person to release 0.5.

Problem: unchanged since round two and assigned by the document to the later step.

Fix for the later step: rewrite per `d-onepage-concrete` with enforce on enable, the one lift path, ② and ③ as decided, no 0.5 release request; search the new file for 「先试运行」 and 「只记下」 before it is shown to the person.

## Verified assumptions

- Prior finding states in the table above, each checked against the current text of `journey.md` and against the designs on disk (M4 was rewritten at 20:59 and bootstrap at 20:50, after the dates `journey.md` cites, 15:11 and 16:26; the passages the document relies on, M4 §3.5, §6.1.1, §6.3.1, §18 ⑩ and bootstrap §0, §2.5, §6.3, §8.2, still say what the document says).
- Figures in S7 against `schedules/design.md` L950 to L958 and L1710, M4 §6.3.1 constants (`CHECK_TIMEOUT_FACTOR` 3, `CHECK_TIMEOUT_FLOOR_MS` 5_000, `CHECK_TIMEOUT_CAP_MS` 60_000, `CHECK_STEP_DEADLINE_MS` 20_000), and `d-timeout-measured` body and its 07:04Z and 08:17Z comments.
- CHARTER 0.8 (`cd257a7`): §3.2 item 3 and §6 state enforce on enable, lift by sentence or command, and the timeout rule as the document describes it (first estimate by the writing agent, then 3 times the slowest recent run, held at the maximum with the main agent told).
- Counts: §7 has 40 rows, §6.2 has 11 rows, §6.1 has 28 G rows.
- `journey.md` and `graph-ops-decisions.json` contain no persona or tone words (searched for sentence-final particles, self-reference words and tildes: none).
- `journey-0.6-round2.md` (143,991 bytes, the 15:53 text) is kept beside the revised file, as the status line says.

## Unverified or not checked

- Whether the running rules-board and loops-board implementations already follow `d-code-rules-enforce` (G26 states they do, as an orchestrator exception). Taken from the graph, not from code.
- Whether M3's eight rules and M7's gate write to the violation journal today. The document says every code-rule block is journaled; M4 §3 and its acceptance row cover rules installed through `installRuleGate`, and M3 and M7 move onto it only after their own revisions (G26).
- M5, M6, plain-ui and metrics designs were not reread for this round; the document says the same in §8.0.1.

## Scope notes

Files written by this review: `decisions-review.md` and `decisions-review.json` only. `docs/graph`, git and other modules were not touched, as the step requires. The project-graph sync reminder in this session cannot be followed inside this step; the orchestrator records the outcome (N1 to N4 and the verdict) on the graph.
