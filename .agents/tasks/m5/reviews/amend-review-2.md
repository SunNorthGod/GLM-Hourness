# M5 design 0.7 amendment: independent review, pass 2

Reviewed: `design.md` (0.7 after the pass-1 fixes, 1,008 lines), `design-0.6.md`, `onepage.md`, `onepage-done.md`, `mockup-lessons.svg`, all in `.worktrees/m5/.agents/tasks/m5/`. Line numbers are lines of the worktree `design.md` unless a file is named. This is a revision review: every pass-1 finding is re-checked first, then what the fixes changed.

Checked against: the Step 0 brief; the pass-1 review (`amend-review-1.md`, `amend-review.json`); the graph (`m5` comments of 2026-10-31T13:26Z and 14:35Z, `d-plain-questions`, `m3-5` status `doing`); the M3 addendum 0.5 (`.agents/tasks/m3/design-addendum.md` §3.2, §3.4 step 4, §3.6); the code in the worktree (`src/shared/tool-names.ts`, `src/graph/plain-question.ts`); `reference/dsh-desktop-0.2.1-rc.3/dsh-session/lib/index.js` lines 1525–1560.

Verdict: CHANGES_REQUESTED. Three MEDIUM findings (F6–F8), four NIT (N12–N15), no HIGH. All 16 pass-1 findings are closed. The three new MEDIUM findings are small and local: a count on the person's page that the F4 fix made stale, an update rule that the new `confirmed` field needs, and a timing statement in the person-facing text.

## Pass-1 findings: status

| ID | Status | Evidence in the current files |
| --- | --- | --- |
| F1 three-per-reply counted on one side | Closed | `ask` `message`, the tool-description list (§3.8.1) and the digest text (§3.6) all say ask after `propose_to_human`; §3.8.5 states that M3 counts `shown` only and a habit question first gives a second ① (up to four items); §13 item 11 holds the post-bootstrap request to M3; m5-4 #4 and U23 cover it. Wording residue is N12. |
| F2 `memory_store` is a second path | Closed | `relay` must come from the latest person message (`said(words, lastPersonAt() - 1)`, `relay_not_said`); `relayChecked` on the entry; panel, `/memory show`, `memory_query` mark 「原话未核对」; the remaining gap is written in §3.8.5. The claims at §0, §3.8, §3.8.3, §7.3, §7.5, §9.2 now match what is enforced. The person-facing text is not yet aligned on timing: F8. |
| F3 M1 told the model to ask | Closed | M1 `hint` and `relay` description say "do not ask about it yet" / "do not store it" (L249, L244); H1 swaps in the `memory_habit` wording; §3.8.3, §9.2 and `onepage.md` agree that nothing asks before H1. |
| F4 "same habit" controlled by the model | Closed | `ask` step 7 checks `learnedFrom` group keys first, then `sameHabit`; the no-key gap is in §3.8.5 and `onepage-done.md` item 4; L2 case added (m5-4 #4, §7.6). |
| F5 no secret check on `words` | Closed | `confirm`/`decline` step 2 runs `looksSecret` per segment, `secret_like` with `field: words`, ask stays open; §7.4 row and L2 list updated. |
| N1 502 characters | Closed | `words` row: total includes joining newlines. |
| N2 constant name | Closed | `HABIT_ANSWER_DAYS` in §2.2. |
| N3 credential phrase | Closed | "没有凭据（`relay` 为空，且写入者不是 `human`）" defined at §3.1 and reused in §1.2, §3.8, §5.2, §7.3, §7.5, §7.6, B1. |
| N4 constant placement | Closed | `LEARNING_TOOL_NAMES` built by G1, H1 adds `memory_habit`, outside `MEMORY_TOOL_NAMES` (§2.3, G1/H1 file lists). `src/shared/tool-names.ts:17` has only `MEMORY_TOOL_NAMES` today, so G1 creating the second constant is consistent. |
| N5 file name on the page | Closed | `onepage.md` 现状: "0.6 另存留档". |
| N6 cap per project; late answer | Closed | "每个项目每周至多三条" in `onepage.md` and `onepage-done.md`; item 4 carries the one-week / new-session rule. |
| N7 same-session delete exception | Closed in the text; see F7 for a hole in how the exception is judged | §3.4, §3.8 rule 4, §3.8.2. |
| N8 question vs stored text | Closed | `text` second line `要记的：` + `description`; `description` goes through the word list; `body` gap in §3.8.5. |
| N9 `CIRCLED` / `PROPOSAL_LIMITS` | Closed | §3.8.1 step 8 says both arrive with `m3-5`. |
| N10 `plainWordsIn` | Closed | step 4: `habit.ts` maps hits to `say` through `PLAIN_WORDS`. `PLAIN_WORDS` is exported at `src/graph/plain-question.ts:23`, `plainWordsIn` returns matched forms at line 41. |
| N11 clock domain | Closed | §3.8.3 clock paragraph, U25, L3 assertion. Verified below. |

## Step 0 coverage

| Brief requirement | Where | Result |
| --- | --- | --- |
| Ask once, short, plain words, in conversation | §3.8 rule 2; `question` 10–90 code points, one line, `?` ending, `plainWordsIn` on `question` and `description` | Met |
| Batched with other questions, at most three | `ask` step 7 counts M3 `shown` after the last person message plus this session's `ask` records; order guidance; one-sided count disclosed in §3.8.5 | Met, with the disclosed gap |
| Nothing stored until the person says yes in their own next message, verified like M3 | `confirm` step 6–7: first person message after the ask, `personSaid` on a one-message copy; unreadable messages: `unavailable`, nothing asked or stored | Met on the `memory_habit` path. The `memory_store` path is bounded (latest message) and disclosed (§3.8.5). Semantics of the reply (yes vs no) stay with the model, as in M3. |
| A no is remembered; interval chosen and stated | 28 days (`HABIT_DECLINE_DAYS`), also for asks with no outcome; 7-day answer window; reasons in §3.8.4 and §11 | Met |
| Author decides what a confirmed habit becomes, records it | Non-fading preference with the person's reply and the question asked (`confirmed`), only the person can revoke; §3.8.4, §11, §15 | Met. The update rule for this entry is missing: F7. |
| `onepage-done.md` item 1, the 「推测」 sentences in `onepage.md` | Both rewritten; no 「推测」 left in either file except the history sentence in `onepage.md` 现状 | Met on content. Count and timing problems: F6, F8. |
| Keep 0.6 as `design-0.6.md` | SHA-256 `3758F0C1…E627`, equal to the main-checkout `design.md` | Met |
| Consistency across `design.md` | `grep` for 推测 / inferred / 淡忘 / 14 天: live sections clean; remaining hits are §15 history (R1-08, R4-10, 0.7 record) | Met, with N12, N15 |

## Findings

### F6 (MEDIUM): `onepage.md` gives a count of decided items that the F4 fix made wrong

Where: `onepage.md` line 35: "另有 46 件小事替你定了……45 件列在 design.md 第 11 节，1 件……在第 12 节末尾". §11 of `design.md` (lines 1344–1389).

Problem: §11 now has 46 list items. `design-0.6.md` §11 has 37; 0.7 adds nine (preference credential and habit replace two existing lines, then: confirmed habit becomes a preference, 28 days, same-habit by group key, question limits, content recorded at ask time, verify with `personSaid`, creation-time `relay` check, `memory_habit` as one tool, same `type` on update). Pass 1 counted 45 because the "same habit by group key" item (added by the F4 fix) did not exist yet. With the §12 line the total is 47, and the page says 46 and 45. The page is what the person reads; an earlier review gated this count.

Fix: `onepage.md` line 35: "另有 47 件小事替你定了，每件都能推翻：46 件列在 design.md 第 11 节，1 件（记忆里还存不存项目事实）在第 12 节末尾。" Recount after any further §11 edit.

### F7 (MEDIUM): The update fold for `memory_store` on an existing entry is not specified for the fields this amendment added, and the gap lets an agent strip `confirmed` and then delete the habit alone

Where: §3.2 step 5 (L252, "同名条目已存在：这是更新……算一次复审，`created` 不变"); §3.1 `MemoryEntry` (`origin`, `confirmed`, `relayChecked`, `learnedFrom`, `relay`); §3.4 (L320) the same-session exception and its `confirmed` carve-out; §3.8 rule 4; §3.8.2 last paragraph.

Problem: step 5 says only that `created` stays. Nothing says what a later `store` record does to `origin`, `confirmed`, `relayChecked`, `learnedFrom` and `relay`. Three consequences:
1. If the fold takes the fields of the latest `store`, `confirmed` is dropped on any update (for example, the person says "改成只在周报里", the model calls `memory_store` with that relay). The next `memory_forget` without `relay`, in the same session, by the same agent, passes the "刚写的" exception because the entry no longer has `confirmed` and (if `origin` is replaced) was written by this agent in this session. The agent revokes a habit the person had confirmed, with no words from the person and no 28-day "no" recorded. §3.4 and §3.8 rule 4 say "每一次撤销都出自人"; this path breaks that.
2. If the fold merges instead (keeps `confirmed`), the panel shows 「agent 先猜、你确认的」 with the old question beside changed content.
3. `relayChecked`: an entry first stored unchecked (M1) and updated with a checked `relay` (H1), or the reverse, has no stated result.

Fix: add one rule to §3.2 step 5 and mirror it in §3.1:
"A `store` that updates an existing entry keeps `created`, `origin`, `confirmed` and `learnedFrom`; it replaces `description`, `body`, `source`, `value`, `relay` and `relayChecked` with the new record's. An entry that has `confirmed` can only have `relay` replaced by a new checked relay; the panel shows the question asked at confirmation and, when `body` differs from the confirmed `body`, the line 「内容在你确认之后改过，依据是你 <日期> 说的……」." The same-session exception in §3.4 is judged on `origin` and on `confirmed`, so an update cannot reset either. Add an L2 case: confirm a habit, update it with `memory_store`, then `memory_forget` without `relay` in the same session gets `preference_owner`.

### F8 (MEDIUM): The person-facing text says only the habit question waits for M3; the `relay` check described in `onepage-done.md` item 1 also waits for H1

Where: `onepage-done.md` item 1 ("系统对着你在这个会话里发的最近一条消息核对这句原话，对不上就不存，读不到你的消息时照收"); `onepage.md` 现状 last sentence ("只有习惯先问这一支要等 M3 核对你原话的那一块做好……其余照常开工"); against §1.2 m5-1 #3 ("H1 之前不核对原话"), §3.2 (L271 "H1 之前不核对，M1 起每条 `llm` 写入……`relayChecked: false`"), §9.1 H1 row.

Problem: item 1 is the acceptance text for `m5-1`, which M1 delivers. The design's `m5-1` acceptance says that before H1 the `relay` is not checked, and puts the check in `m5-4` #7. The person is told that item 1 includes the check and that only the question waits. After M1 the model can store any string as `relay` (marked 「原话未核对」), which is not what the person reads in item 1. The brief names item 1 and asks that it match the amendment.

Fix:
- `onepage-done.md` item 1: after "读不到你的消息时照收，页面上标「原话未核对」" add "；这一步核对要等 M3 核对你原话的那一块做好，在那之前不核对，一律标「原话未核对」".
- `onepage.md` 现状: "只有习惯先问，和对你原话的核对，这两处要等 M3 核对你原话的那一块做好；在那之前系统还不会问你，也不核对原话，只是告诉主 Agent 别存猜出来的习惯，这一点系统管不住，其余照常开工。"

### N12 (NIT): Two places still describe one shared count without the order condition

Where: §3.6 last paragraph (L435: "harness 把它和 M3 的提议数进同一个每回复至多三件"); §8.4 (L1239, the 提议与记录 bullet: "件数由 M5 的 `ask` 与 M3 已交出的提议一起数进每回复至多三件，问话排在提议之后") and §0 L19 are correct; §3.6 is not. §3.8.5 says M3 does not count habit questions.

Fix: in §3.6 write "M5 的 `ask` 把 M3 已交给人的提议和自己的问话一起数进每回复至多三件，条件是问话排在提议之后（§3.8.5）".

### N13 (NIT): The revision record carries an unrelated change and points at what was removed

Where: §15, the 0.7 entry, the sub-item beginning 「顺带一处」 (L1533): "顺带一处与本次主题无关的改正：……事故描述改成不点名原因的写法……证据去掉已经不在图上的批注".

Problem: the change is outside Step 0 (scope), and the sentence tells a reader that a cause was taken out. The person asked that the project keep no trace of it.

Fix: delete the sub-item from the 0.7 record. The edited text in §0 and §4.8 row 21 stands on its own.

### N14 (NIT): The sketch shows less of a confirmed habit than the panel text promises

Where: `mockup-lessons.svg` (the habit block under 「关于你」: 「当时问你的是：「……记下来吗？」」); §4.7 and lessons-3 #1 (the panel lists the question and the 「要记的」 line).

Fix: add a text line 「要记的：重命名时保留拍摄日期」 under the question line in the sketch, or reduce the §4.7 text to the question only.

### N15 (NIT): §3.8.2's closing sentence claims more than the fold rules give

Where: §3.8.2 end of the `applyRecord` paragraph (L535): "于是不管谁写文件，一条确认过的习惯在流水里总有一条内容相同的问话在前，不会出现没问过的习惯".

Problem: it holds for entries that carry `confirmed`. A preference stored through `memory_store` has no ask before it (that is the disclosed gap in §3.8.5), and a hand-written file can contain both an `ask` and a matching `store`.

Fix: "于是带 `confirmed` 的条目在流水里总有一条内容相同、更早的问话；没有 `confirmed` 的偏好不带这个保证（§3.8.5）".

## Verified assumptions

- `design-0.6.md` equals the released 0.6: SHA-256 `3758F0C17239A1ED58E41BE1F921031DDF115D97CFF9BB1663291F30E2EFE627` for both the main-checkout `design.md` and the worktree `design-0.6.md`.
- Session event times are host wall-clock milliseconds: `reference/dsh-desktop-0.2.1-rc.3/dsh-session/lib/index.js` line 1531 (`time: Date.now()` in the event append) and line 1555 (same in the plugin record append). N11 and U25 cite these correctly.
- `PLAIN_WORDS` is exported (`src/graph/plain-question.ts:23`); `plainWordsIn(text)` returns `string[]` of matched forms (line 41). The mapping step in `ask` step 4 is needed and is stated.
- `MEMORY_TOOL_NAMES` exists in `src/shared/tool-names.ts:17`; `LEARNING_TOOL_NAMES` does not, so G1 creating it is consistent. `looksSecret` has no export in `src/` today; the design lists it as new work (§5.6).
- M3 counts only `shown` entries (M3 addendum §3.4 step 4: `shown` after the last person message, plus one, refused above three), and appends `Shown` only for `propose_to_human` results (§3.2). The one-sided count and the order requirement are therefore needed and correctly described in §3.8.5.
- The 28-day interval fits the default 28-day `learning_signals` window; the argument in §3.8.4 holds for the default `since`.
- `onepage.md` is 1,128 CJK characters including headings (limit 1,500 used in `finish-1031-review.md`). The 疑问 line "疑问：最没把握的是**问你的次数**，习惯每周至多问三条。" is 25 code points with one bold span.
- None of `design.md`, `onepage.md`, `onepage-done.md`, `mockup-lessons.svg` contains a persona word or the word the person asked to keep out of the project. The pages contain no 「推测」 except the history clause in `onepage.md` 现状.
- Graph: the `m5` comment of 2026-10-31T13:26Z holds the person's words; the comment of 14:35Z fixes the loop at three passes. `m3-5` exists with status `doing`, as the H1 row assumes.
- §11 bullet count: 37 in `design-0.6.md`, 46 in `design.md`.

## Unverified or wrong assumptions

- Wrong: "46 件小事 … 45 件列在第 11 节" (F6). The file has 46 in §11.
- Wrong as written: "每一次撤销都出自人" holds only if updates keep `confirmed` and `origin` (F7).
- Wrong as timed: item 1 of `onepage-done.md` presents the `relay` check as part of the M1 deliverable (F8).
- Unverified: `hournessTalk` is registered for every root session once M3 step 6 merges (M3 addendum §3.2 says so; `src/design/talk.ts` has no `TalkState` yet). The design handles the other case with `unavailable` and U21.
- Unverified: that a person message queued while the agent is still working gets an event time after the `ask` record's `at`; the design names the boundary (§3.8.5, last-but-one bullet) and does not depend on it for safety.
- Unverified, flagged by the author as U23/U24: that the model shows `text` in the reply, orders `ask` after the proposals, and picks `confirm` or `decline` as the person meant.
