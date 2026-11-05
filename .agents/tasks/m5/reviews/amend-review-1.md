# M5 design 0.7 amendment: independent review, pass 1

Reviewed: `design.md` (0.7, 999 lines), `design-0.6.md`, `onepage.md`, `onepage-done.md`, `mockup-lessons.svg`, all in `.worktrees/m5/.agents/tasks/m5/`. Line numbers below are lines of the worktree `design.md` unless a file is named.

Checked against: the Step 0 brief; the graph (`m5` comment 2026-10-31T13:26Z, `d-plain-questions`, `m3-5`); the M3 addendum 0.5 in the main checkout (`.agents/tasks/m3/design-addendum.md` §3.2 TalkState and fold rules, §3.4 step 4 count, §3.6 `personSaid`, step 6 file list); the code in the worktree (`src/design/talk.ts`, `src/graph/proposal.ts`, `src/graph/plain-question.ts`); `reference/dsh-desktop-0.2.1-rc.3/dsh-session-projection/lib/index.js` (`stateOf`).

Verdict: CHANGES_REQUESTED. Five MEDIUM findings, no HIGH. The mechanism is sound on the `memory_habit` path. The problems are around it: a second path that stores without the question, a window before H1 where the model is told to ask on its own, an identity check for "the same habit" that the model controls, one-way counting of the three-per-reply limit, and a missing secret check.

## Step 0 coverage

| Brief requirement | Where | Result |
| --- | --- | --- |
| Ask once, in conversation, short, plain words | §3.8.1 `question` 10–90 code points, one line, ends with a question mark, `plainWordsIn` | Met. `once` is weakened by F4. |
| Batched with other questions, at most three per batch | §3.8 rule 2, `ask` steps 7–8, `message` | Partly. Counted on the M5 side only (F1). Batching itself is guidance, not enforced; the design states why (§11), which is acceptable. |
| Nothing stored until a yes in the person's own next message, verified like M3, not the model's retelling | §3.8 rule 3, `confirm`/`decline` steps 4–8 | Met on the `memory_habit` path. Not met on the `memory_store` path (F2) or before H1 (F2, F3). |
| A no is remembered; interval chosen and stated | §3.8.4 (28 days), §11, §1.3, onepage, onepage-done | Interval stated everywhere and consistent (28 days; 7 days to answer). Identity of "the same habit" is weak (F4). |
| Author decides what a confirmed habit becomes and records it | §3.8.4, §11, §15, onepage "替你定了的方向" | Met: preference with the person's reply and the question asked, no fading. |
| `onepage-done.md` item 1 and the 「推测」 sentences in `onepage.md` | onepage-done items 1, 4, 8; onepage items 2, 5, 疑问, 现状, count | Met. Items 4 and 8 also changed, correctly. The live sections of `design.md` have no remaining storing-without-asking text; the `推测` hits left are §15 history (L1459, L1498) and sentences that describe the old behaviour. |
| Keep 0.6 as `design-0.6.md` | file | Met. SHA-256 equals the main-checkout `design.md` (0.6), `3758F0C1…E627`. |
| Consistency with the rest of `design.md` | whole file | Mostly. See F1–F5 and N3. |

## Findings

### F1 (MEDIUM): The three-per-reply limit is counted on one side only; the numbers collide when the habit question comes first

Where: §3.8.1 `ask` step 7 (L486) and step 8 (L487); §8.4 (M5 "不往 M3 的投影里写任何东西，不要求 M3 改什么"); m5-4 #4 (L62); the `ask` `message` (L487) and the digest text (§3.6).

Problem: `ask` counts the proposals M3 has shown plus the habit questions it has recorded itself, so it refuses the fourth item. M3 does not count in the other direction. M3 addendum §3.4 step 4 sets `n` = the number of `Shown` entries after the last person message + 1 and refuses at `n > 3`; `Shown` is appended only for `propose_to_human` results (§3.2 fold rule). So when `memory_habit ask` is called first it gets ①, and a `propose_to_human` called after it is also numbered ①; three proposals after one habit question make four items. "Together, counting propose_to_human" is true only for the order proposals first, habit question last, and neither the `message`, the tool description nor the digest text says to use that order. The only test (m5-4 #4) covers that one order.

Fix:
1. Add to the `ask` `message`, to the `memory_habit` tool description, and to the H1 digest sentence: "Call memory_habit ask after the propose_to_human calls of the same reply, never before them."
2. Add a bullet to §3.8.5: "M3's propose_to_human does not count habit questions, so a proposal made after a habit question is numbered as if the question were absent (a second ①, up to four items). The harness does not stop this. L4 counts replies with more than three items (U23)."
3. Extend §13 item 11 with a request recorded on `m3-5`, to be done after the bootstrap (`d-freeze-until-dogfood`): fold a successful `memory_habit ask` result into the same count, so both sides count the same set.

### F2 (MEDIUM): "没问过的猜测存不进" is written as a harness guarantee, but `memory_store` with a `relay` is a second path that is not tied to any question

Where: §3.8 rule 1 (L455) and the lead-in "规则，都由 harness 执行，不靠提示词"; §0 L18; §3.8.3 last paragraph (L546); §3.2 relay check (L270); §7.4 row (L1083); §7.5 row (L1114); §9.2 (L1287); `onepage.md` 现状 last sentence (L38); `onepage-done.md` item 1 (L7).

Problem: `confirm` is strict: the first person message after the question, same session, within 7 days. The `relay` check on `memory_store` (L270) is not: `said(words, afterMs 0, nextOnly false)` accepts any message the person sent in the session, at any time, and accepts any string at all before H1 or whenever `hournessTalk` cannot be read (`relayChecked: false`). The `ask` `message` also sends the model to `memory_store` for a conditional answer. Consequences:
- A guessed habit plus any earlier genuine quote (or any string, in the unchecked cases) is stored as a non-fading preference without a question.
- A real yes that arrives in a second message, which `confirm` refuses with `words_not_found`, is stored through `memory_store` anyway.
M3's own `relay` check on graph edits is anchored in time (`afterMs` = the node's last change, M3 addendum §3.8); this one is not. The person is told on `onepage.md` that "没问过你的习惯一条也记不进去" and in `onepage-done.md` item 1 that "agent 拿不出你的原话就存不进". Neither is what the harness enforces.

Fix:
1. For `llm` writes of `user`/`feedback` through `memory_store`, require the quote to be in the person's latest message: the port's `said(words, lastPersonAt() - 1, true)` (the port already has `lastPersonAt()`). A quote from an earlier message gets `relay_not_said`, hint "quote the person's words from their latest message; if they said it earlier, ask them to say it again". Add an L2 case (earlier message refused, latest accepted) to m5-4 #7 and §7.6.
2. Reword the claims at the eight places above to what is enforced: "an entry about the person cannot be stored without words the person really said in their latest message (checked once the session's messages can be read). Whether the person was asked first is checked only on the memory_habit path."
3. Add the remaining gap to §3.8.5: a model can still cite the latest message for a habit it never asked about; before H1 and when the projection is unreadable the quote is not checked at all.
4. In the H1 row, make the panel and `/memory show` mark entries with `relayChecked: false` as 「原话未核对」.

### F3 (MEDIUM): Until H1, the `ask_first` hint tells the model to ask in free chat, which contradicts "the system simply does not ask yet" and bypasses every ask rule

Where: §3.2 step 2 hint (L248, "ask them first and store it only after they say yes in their own words"); the M1 variant of the `relay` description (L243: "ask them in plain words first and store it only after they say yes in their own words"); against §3.8.3 (L546), §9.2 (L1287), §15 (0.7 "实施" line) and `onepage.md` L38, all of which say that before H1 the system "只是还不会问人".

Problem: M1 merges and runs on the desktop (first L4 batch) well before H1, which waits on `m3-5` (status `doing`). In that window the model is instructed to ask on its own. There is no weekly cap, no batching, no `ask`/`decline` record, so a declined habit can be asked again in every session; the person's yes is then stored through `memory_store` with an unchecked `relay`. That is the behaviour the person asked to avoid.

Fix: M1 wording becomes "Only the user's own words make a preference. Do not store a habit you only guessed from their edits, and do not ask about it yet. If it is a fact the repo already records, store it as a project memory with its source." and the M1 `relay` description ends "If you only guessed a habit from their edits, do not store it." H1 replaces both with the `memory_habit` wording. Update the m5-1 #3 description of the `hint` and the §15 line to match. Then the statements in §3.8.3, §9.2 and the page are true.

### F4 (MEDIUM): "The same habit" is a text match on names and descriptions that the model writes; the group key is not used

Where: §3.8.1 `ask` step 7 (L486: `sameHabit` = same name, or Jaccard ≥ 0.6 on the word sets of `name` and `description`); `learnedFrom` row (L473, optional); §3.6 `learning_signals` `asked` (only for groups named in `learnedFrom`); m5-4 #8.

Problem: the digest hands the same group to a new session; the model derives the habit again, picks another kebab-case name and words the description differently, and the Jaccard falls below 0.6. The question is asked again inside the 28 days. `learning_signals` returns `asked` only for groups whose earlier `ask` carried `learnedFrom`, so when it was omitted the model also gets no sign that the group was refused. The brief says a no is remembered so "the same habit" is not asked again; here the identity is whatever the model chooses to write.

Fix: in step 7, before the text match: if the call's `learnedFrom` shares a group key with an `ask` record from the last 28 days (open, declined, or confirmed) or with the `learnedFrom` of a live or recently forgotten confirmed entry, return that record's outcome (`asked_recently`, `declined_recently`, `known`). Keep the text match as the fallback for asks without a group key. Say in the tool description and the `message` that `learnedFrom` must carry the key shown by `learning_signals`. Add an L2 case: a second `ask` with another name, another wording, the same `learnedFrom` gets `declined_recently`.

### F5 (MEDIUM): `confirm` and `decline` write the person's words into the journal without the secret-shape check

Where: §3.8.1 `confirm`/`decline` steps (L489 on): step 2 is a field check only. `ask` step 3 runs `looksSecret` on `name`, `description`, `body`, `question`; `memory_store` step 3 runs it on `relay` (L249); §7.3 and the §7.4 input table state that secret-like text is refused before any write (§5.6).

Problem: `words` becomes `relay` of the `store` and `decline` records. It is kept in `memory.jsonl`, shown on the lessons page and returned by `memory_query`. A model that quotes the whole message of a person who pasted a token next to the yes writes the token into a user-level journal that is shared across projects.

Fix: after the field check in `confirm` and `decline`, run `looksSecret` on every `words` segment; on a hit return `secret_like` with `field: words`, record nothing, and leave the ask open. Add the case to the L2 list for H1 (§7.6) and the `memory_habit` row of the §7.4 table.

### N1 (NIT): `words` total of 500 can produce a 502-character `relay`

Where: §3.8.1 `words` row (L475), §5.2 `JournalRecord.relay` ("至多 500 字符"). `personSaid` joins segments with a newline, so three segments of total length 500 give 502. Fix: "合计（含连接用的换行）至多 500 字符".

### N2 (NIT): Constant names differ between the H1 row and §3.8.4 / §11

Where: H1 row (L1274) lists `HABIT_UNANSWERED_DAYS`; §3.8.4 and §11 name `HABIT_DECLINE_DAYS` (28, also for unanswered asks) and `HABIT_ANSWER_DAYS` (7). Fix: replace `HABIT_UNANSWERED_DAYS` with `HABIT_ANSWER_DAYS` in the H1 row.

### N3 (NIT): Two statements of what counts as a preference credential

Where: `classify` paragraph (L219): credential = non-empty `relay` or a `human` writer. §1.2 m5-1 #3, §5.2 (L875), B1 row (L1264) and §3.8 rule 1: a `user`/`feedback` entry "没有原话" is a bad line, with no `human` exception. No command writes a preference as `human` today, so the case is empty, but the texts differ. Fix: write "没有凭据（`relay`，或写入者是 `human`）" in all four places.

### N4 (NIT): Placement of the `memory_habit` name constant is left to implementation

Where: §2.3 table row for `memory_habit` (L176): "工具名常量归哪一组，在实现时与 R5-02 的处理一并定". Fix: decide now: export `MEMORY_HABIT` next to `LEARNING_SIGNALS` in the deferred group, outside `MEMORY_TOOL_NAMES`, which is what the same row already requires of the Memory-section condition.

### N5 (NIT): `onepage.md` names a file the page rule does not allow

Where: `onepage.md` 现状 (L38): "0.6 另存为 design-0.6.md". The earlier page review allowed only `design.md`, `onepage-done.md` and the sketch file name (`finish-1031-review.md`, "无函数名、字段名、文件路径"). Fix: "0.6 另存留档".

### N6 (NIT): The weekly cap and the 7-day answer window are described to the person more broadly than they are implemented, and the late-answer rule is missing from the person-facing text

Where: `ask` step 7 counts `ask` records in the project journal plus the user-level journal, so the cap of three is per project (plus shared ones), while `onepage.md` L27 and `onepage-done.md` say "每周至多三条". `confirm` step 5 refuses `other_session` and `lapsed`, and §3.8.4 blocks the same habit for 28 days after an unanswered ask, but `onepage-done.md` item 4 says only "问了没回的，同样 28 天内不重问". A yes given after a week, or in a new session, is silently not recorded. The cap and the window were not in the brief (disclosed as author decisions, U24). Fix: say "每个项目每周至多三条"; add to `onepage-done.md` item 4 "过了一周、或换了会话才回，系统不再认这次问话，同一条 28 天内也不再问".

### N7 (NIT): The same-session delete exception lets the agent revoke a person-confirmed habit and record a "no" for the person

Where: §3.4 (L319): preferences can be deleted without `relay` if "同一会话里同一个 agent 刚写的"; §3.4 added sentence (L319, L527): revoking a confirmed habit counts as a "no" for 28 days; §3.8 rule 4. Fix: the exception does not apply to entries that have `confirmed`; the 28-day block applies only to forgets that carry `relay` or come from `human`.

### N8 (NIT): The person sees a 90-character question; what is stored is a description and a body of up to 4000 characters

Where: §3.8.1 `question`, `body` rows; §3.8.4 "人答的是他看到的那句话". Nothing ties the question to the stored text. Fix: have the harness render `text` as the question plus a second line `要记的：<description>` (description is at most 200 characters), and let the L2 example assert that `text` contains the description. The panel already shows both.

### N9 (NIT): §3.8.1 step 8 says `CIRCLED` and `PROPOSAL_LIMITS.perReply` are already in `src/graph/proposal.ts`

Where: L487. Today `CIRCLED` is an unexported constant (`src/graph/proposal.ts:23`) and `PROPOSAL_LIMITS` does not exist; both arrive with `m3-5` (M3 addendum §3.3 and step 6). The H1 row has the dependency. Fix: write "（M3 第 6 步合入后；H1 的依赖已列）".

### N10 (NIT): `plainWordsIn` returns the matched forms only

Where: §3.8.1 `ask` step 4 ("`message` 列出词和该说的话"). `plainWordsIn(text)` (`src/graph/plain-question.ts:41`) returns `string[]` of matched avoid-forms. Fix: state that `habit.ts` maps each hit to its `say` through `PLAIN_WORDS`.

### N11 (NIT): The clock domain of `afterMs` is not stated

Where: §3.8.1 `confirm` step 7, §3.8.3. `afterMs` is the `ask` record's `at`; `TalkState.people[].time` and `Shown.time` are session event times (integer milliseconds). Fix: one sentence in §3.8.3 that both are the host's wall clock in milliseconds, and an L3 assertion in `glm-memory-habit` that the first answer after an `ask` is accepted.

## Verified assumptions

- `design-0.6.md` is byte-identical to the released 0.6 (hash equals main-checkout `design.md`).
- The count on `onepage.md` L35 is right: 45 list items in §11 of `design.md` (37 in 0.6, plus 8 new agent decisions) plus the D2 line in §12 = 46. 0.6 said 38 = 37 + 1.
- `onepage.md` is 1,109 Chinese characters including headings, under the 1,500 limit used in `finish-1031-review.md`. The 疑问 line is 25 code points with one bold span of 5.
- None of `design.md`, `onepage.md`, `onepage-done.md`, `mockup-lessons.svg` contains a persona word. The live `design.md` no longer contains the word the person asked to keep out of the project; the archived copies (`design-0.3` to `design-0.6`, `design-review.md`, `onepage-0.5.md`) still do, and `design-0.6.md` must stay verbatim.
- `m3-5` exists on the graph, status `doing`; the M3 addendum places `src/design/talk.ts` (`personSaid`, `talkApply`, `TALK_PROJECTION`) and `src/graph/proposal.ts` (`PROPOSAL_LIMITS`, exported `CIRCLED`) in that same step 6, as the H1 row says.
- `src/design/talk.ts` today exports only `TALK_GUIDE`, `HIDDEN_FROM_MAIN_AGENT` and `ProposalKind`, as §3.8.3 says.
- `sessionProjections.stateOf(session, key)` returns the live state of any registered key and must not be mutated (`dsh-session-projection/lib/index.js:118–131`); the design's copy-with-one-message approach to `personSaid` does not mutate it.
- `personSaid(state, quotes, afterMs)` is pure, uses `time > afterMs` and punctuation/space boundaries, and accepts segments from different messages (M3 addendum §3.6); `people` keeps 200,000 code points, `shown` the last 64 entries.
- The 28-day interval fits the default 28-day window of `learning_signals`: when a no expires, the window contains only events after the no, so the same evidence cannot re-trigger the question (§3.8.4).
- The legacy migration (§5.4) writes migrated entries as `type: project`, so the new "preferences need a credential" rule drops none of them.
- The graph comment of 2026-10-31T13:26Z has the person's words and the instruction the amendment implements.

## Unverified or wrong assumptions

- Wrong: M3 counts the combined set of proposals and habit questions (F1). M3 counts only `Shown`.
- Wrong: before H1 "the system only does not ask yet" (F3). The M1 hint tells the model to ask.
- Wrong as a guarantee: unasked habits cannot be stored (F2).
- Unverified: that a model passes `learnedFrom` on `ask`, and that a refused group is surfaced to it (F4).
- Unverified: `hournessTalk` is registered for every root session when the design row is enabled (M3 addendum §3.2 says so; not implemented yet). The design handles the other case with `unavailable` and U21.
- Unverified, flagged by the author as U23/U24: that the model puts the question into the reply and chooses `confirm` or `decline` as the person meant. The harness checks that the words were said, not what they mean (§3.8.5, acceptable and documented).
