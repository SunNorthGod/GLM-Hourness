# M5 design 0.7 amendment: independent review, pass 3

Reviewed: `design.md` (0.7 after the pass-2 fixes), `design-0.6.md`, `onepage.md`, `onepage-done.md`, `mockup-lessons.svg`, all in `.worktrees/m5/.agents/tasks/m5/`. Line numbers are lines of the worktree `design.md`. This is a revision review: the seven pass-2 findings are re-checked first, then what the pass-2 fixes changed, then the whole amendment once more against the Step 0 brief.

Checked against: the Step 0 brief and the person's words (`m5` comments of 2026-10-31T13:15Z, 13:26Z, 14:35Z, 15:02Z); `amend-review-1.md`, `amend-review-2.md`, `amend-review.json`; the M3 addendum 0.5 in the main checkout (`.agents/tasks/m3/design-addendum.md` line 800, `personSaid`); the worktree code (`src/graph/proposal.ts`, `src/graph/plain-question.ts`, `src/design/talk.ts`, `src/graph/engine.ts`); `reference/dsh-desktop-0.2.1-rc.3/dsh-session/lib/index.js` in the main checkout; the released 0.6 onepage files in the main checkout.

Verdict: APPROVED. No HIGH or MEDIUM findings. Seven NIT findings (N16 to N22). All seven pass-2 findings are closed.

## Pass-2 findings: status

| ID | Status | Evidence in the current files |
| --- | --- | --- |
| F6 count on the person's page | Closed | `onepage.md` line 35 now reads 47 items: 46 in §11, 1 at the end of §12. A script count of top-level `- ` bullets between `## 11.` and `## 12.` gives 46 in `design.md` (line 1341 to 1396) and 37 in `design-0.6.md`. §12 ends with one item (D2). The F7 rule was merged into the existing §11 bullet "同名条目更新时 `type` 必须相同…", so the count did not move. |
| F7 update fold for `origin`, `confirmed`, `relayChecked`, `learnedFrom`, `relay` | Closed | §3.1 has the fold paragraph (keeps `created`, `origin`, `confirmed`, `learnedFrom`; replaces `description`, `body`, `source`, `value`, `relay`, `relayChecked`; `forgotten` plus `store` is a new entry). §3.2 step 5 returns `unavailable` when a `confirmed` habit is updated with an unchecked `relay`. §3.4 and §3.8 rule 4 judge the same-session exception on `origin` and exclude entries with `confirmed`. §3.8.2 makes a `store` with `data.ask` on an active name a bad row. The panel line for changed content is in §3.1 and §4.7. Tests: m5-1 #9, m5-4 #6 (confirm, update through `memory_store`, `memory_forget` without `relay` still gives `preference_owner`) and #7 (`unavailable` on update); §7.4 row, §7.5, §7.6, B1 and H1 rows are aligned. The remaining gap (a model can still rewrite the content by quoting the latest message) is stated in §3.8.5. |
| F8 timing of the `relay` check in the person-facing text | Closed | `onepage-done.md` item 1 now says the check waits for M3's check of the person's words and is not done before that ("一律标「原话未核对」"). `onepage.md` 现状 says both the habit question and the check of the person's words wait for M3. Both agree with §1.2 m5-1 #3, §3.2 (the "H1 之前不核对" paragraph) and the H1 row. |
| N12 §3.6 count wording | Closed | §3.6 last paragraph: "M5 的 `ask` 把 M3 已交给人的提议和自己的问话一起数…条件是问话排在提议之后（§3.8.5）", same as §0 and §8.4. |
| N13 unrelated sub-item in the 0.7 record | Closed | The 0.7 record has no such sub-item; the pass-2 record lists only "N13：删去 0.7 记录里一条与本次主题无关的子条目", which names nothing. No hardware or instability wording in `design.md`, `onepage.md`, `onepage-done.md` or `mockup-lessons.svg` (searched for the words the person asked to keep out). |
| N14 sketch vs panel text | Closed | `mockup-lessons.svg` has the line "要记的：重命名时保留拍摄日期" under the question line; canvas height 1084, inner frame ends at 1064, last text at y=1044; the file parses as XML. |
| N15 closing sentence of the `applyRecord` paragraph | Closed | §3.8.2 now limits the guarantee to entries with `confirmed` and points to §3.8.5 for preferences without it. |

The 16 pass-1 findings were not reopened. I re-read the places the pass-2 edits touched (§3.2 step 5, §3.4, §3.8 rules 1 to 5, §3.8.1, §3.8.2, §3.8.5, §7.4 to §7.6) and found no conflict with the pass-1 fixes.

## Step 0 coverage

| Brief requirement | Where | Result |
| --- | --- | --- |
| Ask once, short, plain words, in conversation | §3.8 rule 2; §3.8.1 `question` 10 to 90 code points, one line, ends with `？` or `?`; `plainWordsIn` on `question` and `description`; the worked example is 33 code points and uses none of the `PLAIN_WORDS` forms | Met |
| Batched with other questions, at most three per batch | `ask` step 7 counts M3 `shown` after the last person message plus this session's `ask` records, `too_many` above three; order guidance in the `message`, the tool description and the digest text; the one-sided count is disclosed in §3.8.5 and asked of M3 in §13 item 11 | Met, with the disclosed gap |
| Nothing stored until the person says yes in their own next message, verified like M3 | `confirm` steps 3 to 8: first person message after the ask, `personSaid` on a one-message copy, per-segment `looksSecret`, fail closed when the person's messages cannot be read. `personSaid` takes `time > afterMs` and boundary-checked segments (M3 addendum line 800), which matches how `said` uses it | Met on the `memory_habit` path. The `memory_store` path is bounded to the latest message and disclosed in §3.8.5, `onepage-done.md` item 4 and `onepage.md` 现状 |
| A no is remembered, interval chosen and stated | 28 days (`HABIT_DECLINE_DAYS`) for a recorded no, a revoked confirmed habit and an unanswered ask; 7-day answer window (`HABIT_ANSWER_DAYS`); reasons in §3.8.4 and §11; stated to the person in `onepage.md` and `onepage-done.md` | Met |
| Author decides what a confirmed habit becomes and records it | A non-fading preference whose `relay` is the person's reply, with `confirmed.question` kept; only the person can revoke; §3.8.4, §11, §15; stated in `onepage.md` | Met |
| `onepage-done.md` item 1 and the 「推测」 sentences in `onepage.md` | The released 0.6 files had six such sentences (`onepage.md` lines 14, 17, 27; `onepage-done.md` lines 7, 14, 23). All six are rewritten; the only 推测 left is the history clause in `onepage.md` 现状. Length of `onepage.md`: 1,142 CJK characters (limit used in `finish-1031-review.md`: 1,500); the four-line block in 要你定的 still meets the earlier limits (疑问 line 22 code points, one bold span of 5) | Met |
| Keep 0.6 as `design-0.6.md` | SHA-256 `3758F0C1…E627` for both `design-0.6.md` and the main-checkout `design.md` | Met |
| Consistency across `design.md` | Searched for 推测, inferred, 14 天不用, 淡忘, 悄悄 and 半衰期. Live sections only use them for project facts, which still fade. The rest are in the §15 history. No section or acceptance still describes storing an inferred habit without asking | Met |

## Findings

All findings below are NIT. None blocks.

### N16 (NIT): "也是替你定的" can be read as 49 items

Where: `onepage.md` 替你定了的方向: "另有 47 件小事替你定了…。习惯这一块有两件也是替你定的：…".

Problem: the two habit decisions (confirmed habit becomes a non-fading preference; 28 days) are two of the 46 bullets in §11, so they are already inside the 47. "也" reads as an addition.

Fix: "其中习惯这一块有两件要你特别看：你说可以的习惯存成跟你亲口说的偏好一样不淡忘的偏好；你说不用的，28 天内不再问同一条。"

### N17 (NIT): the page still says the design waits for release

Where: `onepage.md` 现状, last-but-one sentence: "…你放行后就可以开工。"; and 要你定的 ① ending "这份设计可以放行开工吗？".

Problem: §12 status and §13 item 1 say the person released the nine items on 2026-10-31 and that 0.7 needs no second question. The page presents release as pending. The ① block is the D1 text "as handed over" (§12), so only the 现状 sentence needs to change.

Fix: replace "你放行后就可以开工" with "你 10 月 31 日已放行九件活，0.7 只补了习惯先问这一处，不用再放行一次".

### N18 (NIT): m5-1 #9 lists fewer replaced fields than §3.1

Where: §1.2 m5-1 #9: "`description`、`body`、`relay`、`relayChecked` 换成新记录的"; §3.1 also replaces `source` and `value`.

Fix: use the §3.1 list in #9: "`description`、`body`、`source`、`value`、`relay`、`relayChecked`", so the L2 test for the fold covers all six.

### N19 (NIT): "总出自人" is stronger than the delete check

Where: §3.4 ("所以这一次「不用」总出自人，不会是 agent 替人记下的"), §3.8 rule 4 ("所以每一次撤销都出自人"), §3.8.2 last paragraph ("只会因人的撤销而记下").

Problem: what is enforced is a non-empty `relay` or a `human` actor. The `relay` of a delete is recorded, not checked (§2.3, §7.5, §11 bullet on deletes). An agent that passes an invented `relay` still triggers a deletion and a 28-day block. The cost is low (snapshot, restore, a 28-day pause on one question), but the sentences read as a harness guarantee.

Fix: in the three places add "（带人的原话或来自 `human`；删除的原话不核对，§2.3）", and keep the claim to "没有原话的删除成立不了".

### N20 (NIT): "28 天内问过" in the `learned` count does not match the block length

Where: §3.6 step 2 (`learned` includes "这个组键下 28 天内问过没有结果的问话（没回的与「不用」）"); §1.2 m5-4 #8.

Problem: the block for a recorded no ends at `until` (decline time plus 28 days), and the block for an unanswered ask ends at ask time plus 28 days. "28 天内问过" counts from the ask time. A no recorded on day 6 blocks `ask` until day 34 but stops counting as landed on day 28, so `learning_signals` and `ask` disagree for six days.

Fix: "已落点：生效的偏好，`until` 未到的「不用」，写下不满 28 天的无结果问话", in §3.6 and m5-4 #8.

### N21 (NIT): the 28-day argument holds only for the default `since`

Where: §3.8.4 first bullet; §11 bullet on 28 days.

Problem: "到期时窗口里只剩「不用」之后的新纠正" is true when `learning_signals` runs with the default `since` of 28 days. A call with a longer `since` brings the old evidence back after the block ends. This costs only the extra condition; the brief asks for "not asked again for a while", which the block gives.

Fix: add "（`since` 取缺省时）" to the sentence in both places.

### N22 (NIT): group keys in `learnedFrom` have a count limit and no shape limit

Where: §3.2 `learnedFrom` row ("至多 5 个组键"); §3.8.1 `learnedFrom` row.

Problem: keys are compared by exact string in `ask` step 7 and stored in every `ask` and `store` record. Length and characters are not bounded.

Fix: "每个键 1 至 80 个字符，不含换行与首尾空白，形如 `edit:goal.stage`；不合得 `invalid`，`field: learnedFrom`".

## Verified assumptions

- `design-0.6.md` is the released 0.6: SHA-256 `3758F0C17239A1ED58E41BE1F921031DDF115D97CFF9BB1663291F30E2EFE627` equals the main-checkout `design.md`.
- §11 holds 46 top-level bullets in `design.md` and 37 in `design-0.6.md` (script count); §12 ends with D2 only.
- `CIRCLED` is a non-exported constant at `src/graph/proposal.ts:23`; `PROPOSAL_LIMITS` does not exist in that file; `src/design/talk.ts` exports only `TALK_GUIDE`, `ProposalKind` and `HIDDEN_FROM_MAIN_AGENT`. The H1 dependency text in §3.8.1 step 8, §3.8.3 and §9.1 is accurate.
- `PLAIN_WORDS` is exported (`src/graph/plain-question.ts:23`); the avoided forms are 验收, 标定, 门禁, 投影, 补遗, 附录 and their English forms. The worked `ask` example and the sketch's question text use none of them. Neither `onepage.md` nor `onepage-done.md` contains one.
- `personSaid` (M3 addendum line 800): NFKC and whitespace folding, each segment must lie in a message with `time > afterMs`, start and end on whitespace or `\p{P}`. `said` in §3.8.3 passes a one-message copy, so `afterMs = lastPersonAt() - 1` selects the latest message and `afterMs = Date.parse(ask.at)` selects the first message after the ask. The same-millisecond edge is named in §3.8.3.
- Session event times are `Date.now()`: `reference/dsh-desktop-0.2.1-rc.3/dsh-session/lib/index.js` lines 1531 and 1555 (main checkout; the worktree has no `reference/` copy).
- `src/graph/engine.ts:150, 154`: `comment` drops `relay`; a non-`comment` write with `relay` or a `human` actor is privileged. This matches the §3.6 and §8.4 statements the amendment relies on.
- The 28-day interval equals the default `learning_signals` window and the §4.6 recurrence window. With the default `since`, a no recorded at time t expires when the window starts at or after t, so the old evidence is out of the window.
- `.agents/` is ignored by git (`.gitignore:7`), so the two older files that still carry the excluded wording (`design-0.6.md` and earlier versions) are local files, not repository content. Keeping `design-0.6.md` verbatim is required by the brief; deleting or rewriting the older versions is for the orchestrator.
- `mockup-lessons.svg` parses as XML; no persona or tone words in any of the four files.

## Unverified or wrong assumptions

- Unverified, flagged by the author as U21 and U22: that M3's `hournessTalk` projection is readable from the memory row and that `personSaid`, `TALK_PROJECTION` and `TalkState` keep the shape the design assumes. M3 step 6 (`m3-5`) has not merged. The design fails closed (`unavailable`) and puts all of it in `answers.ts`.
- Unverified, U25: that the `ask` time (`new Date()`) and the session event times are the same wall clock. Both are host-process values by the lines above; the fallback is written down.
- Unverified, U23 and U24: model behaviour (shows `text`, orders `ask` after the proposals, picks `confirm` or `decline` as the person meant) and whether three questions a week is the right amount. The design states both as L4 measurements.
- Wrong as worded (NIT only): "总出自人" (N19); the 49-item reading of the page (N16); "放行后" on the page (N17).
