# polish lane

Lane off main e98bfbca, worktree `.worktrees/polish`, branch `polish`.

## Reading (before any code)

### Item 1 — lifts.jsonl ENOENT noise (confirmed, root located)

Verified still undone on e98bfbca. Symptom: morning report 例外 on a fresh
project renders `- lifts.jsonl 读不出（ENOENT），这一次没有对账`
(`.agents/tasks/desktop-l4-w2/progress.md:77`).

The read of the record file happens at TWO sites, both map every read error
to `{ error: code }`:

1. `src/workflow/morning-report.ts:380-385` (async, feeds the report's 例外
   via `liftLines`).
2. `src/guard/index.ts:367-373` (sync, feeds the status-hub entries
   `rules/lifts` — the faces `src/report/four-answers.ts:324` and weekly
   render).

The renderer is `src/guard/status.ts:112-115` (`- lifts.jsonl 读不出
（…）`). The gate itself already defines absent-file semantics:
`src/guard/lift.ts:120-123` — "The file absent equals no lift (design
§3.5); only an error of another kind is the degraded read." So ENOENT is
not a degraded read; mapping it to an error-shaped line contradicts the
gate's own reading.

Fix at the readers (both): ENOENT → `{ text: '' }`, same as an empty file;
every other code keeps `{ error }` (genuine corruption/EACCES stays the
error-shaped line). With `{ text: '' }`:

- fresh project (empty journal too): no lift lines at all — the section's
  existing empty idiom is "no line" (`liftLines` returns [] on empty file +
  empty journal; the status entry's text still answers 「撤下的规则：无」).
- journal has lift records but the file is absent: the reconciliation now
  reports the divergence truthfully (`文件里没有这条规则的行`) instead of
  skipping it — matches the gate (absent file lifts nothing).

Tests pinned on the old behavior, to rewrite whole:

- `tests/guard-status.spec.ts:175-192` ("a journal that is not there yet")
  asserts `detail: ['- lifts.jsonl 读不出（ENOENT）…']` → becomes no detail.
- `tests/rules-view.spec.ts:184` uses the line only as a pass-through
  fixture (items are carried verbatim); unaffected.

New L2: reportFromFiles on a fresh repo (root set, no record file, no
journal) renders no `lifts.jsonl` line and no 未提交 line; liftLines with
absent file + journal lift records renders the mismatch; EACCES case stays
(existing `tests/guard-lift.spec.ts:382`).

### Item 2 — /glm-status output card (confirmed, host-side; record only)

Verified still undone (no card on the desktop build the L4 ran). The L4
wave-2 record: `command/done` seq 4 carries the full table in the session
log, "the output card was not visible in the conversation DOM/screenshot"
(`.agents/tasks/desktop-l4-w2/progress.md:48-49`, `:167-171`; /loops'
evidence likewise came from the session log only, `:107-108`).

The surface chain is host-owned end to end:

1. A plugin command's only return channel is `{ kind, text }`
   (`src/shared/dsh-min.ts:1088-1092`); the host executor appends it to the
   session log as `command/done` with the full text
   (`reference/deepseek-harness/packages/interaction/commands/src/index.ts:379-388`).
   Our handler does exactly this (`src/glm-llm/login-row.ts:155-162`) and
   the L4 verified the log side works.
2. The chat card is the desktop conversation UI's fold of `command/run` +
   `command/done` into a `command` node rendered by `GenericCommandCard`
   (`reference/deepseek-harness/packages/client/ui-chat/src/client/
   conversation-nodes/command.ts`, `.../chat/GenericCommandCard.tsx`;
   visibility excludes only `permission`). The 0.2.1-rc.3 client bundle in
   `reference/dsh-desktop-0.2.1-rc.3/dsh-client-ui-chat/lib/client.js`
   contains the same fold.
3. The installed desktop the L4 ran (0.2.2-rc.1) did not fold command
   lifecycle events into visible cards for ANY command (/glm-status and
   /loops alike); the updater offered 0.2.2-rc.3 (upgrading is the host
   side's fix). Nothing a bundle registers can change the conversation
   view.

So: no plugin-side change; forcing one would be a no-op. The data surface
that IS ours already exists — the composer's GLM pill runs `/glm-status`
via `ctx.remote.commands.execute` and parses the reply into its dialog
(`ui/src/channel.js:9-10`, `:468`; `ui/src/channel-model.ts`), which
DESIGN.md §4.7/§332 records as the designed face (卡片视图属于 M8).
Record this verdict here; no code.

## Changes

### Stage 1 — lifts.jsonl absent-file reads as empty (fix + L2)

- `src/workflow/morning-report.ts` (async reader) and `src/guard/index.ts`
  (sync reader): ENOENT on `docs/guard/lifts.jsonl` now yields
  `{ text: '' }` — the gate's own absent-lifts reading (lift.ts, design
  §3.5); other error codes keep the `{ error }` degraded-read shape, so
  EACCES and the like still render `- lifts.jsonl 读不出（…）`.
- `src/guard/status.ts`: the `LiftsInput.file` contract comment and the
  `liftLines` header now state the absent-file reading; renderer untouched.
- Tests: `tests/guard-status.spec.ts` bare-project case rewritten (detail
  is now undefined, no 读不出 wording anywhere in the entries);
  `tests/guard-lift.spec.ts` gains the reportFromFiles fresh-repo case
  (no `lifts.jsonl` line at all). The `{ text: '' }` + journal-lift
  mismatch was already pinned (guard-lift F15 ⑪) and still passes; EACCES
  pins unchanged.
- Local spec runs: guard-lift 18/18, guard-status 9/9, workflow 31,
  hourness 32, status 20, rules-view 13, guard-new-rules 11 — all green.

### Stage 2 — /glm-status card verdict (record only, no code)

See the Reading section: the chat card is the desktop conversation UI's
fold of `command/run`/`command/done`; our handler already returns the
standard `{ kind, text }` and the L4 verified the log side works. The
desktop build tested (0.2.2-rc.1) folded no command events into visible
cards for any command; the rc.3-era harness client has the fold
(GenericCommandCard), so the surface arrives with the desktop upgrade.
The data face that is ours already exists (the GLM pill dialog parses the
same reply). Nothing to change in the bundles; recorded honestly instead
of forcing a no-op.
