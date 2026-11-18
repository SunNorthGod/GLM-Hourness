# loops-accept-msg lane progress

Defect 1 of the desktop-l4-rc3 batch (its check 2): `MESSAGES.board`
(src/loops/tools.ts) taught `/loops accept u-…` (the entry id) while the
command parses only `lp-…` (src/loops/commands.ts), so typing what the board
message says got the usage error. Repo main at `2818d130`, branch
`loops-accmsg`.

## Root cause

Born with the feature, commit `e0dc0a06` (2026-11-17, "feat(loops):
loop_show, loop_propose and loop_note, /loops accept and reject"). That
commit drew two ids in `loop_propose` — `proposalId = newProposalId()`
(`lp-<8 hex>`, the proposal record) and the entry id (`u-<8 hex>`) the
proposed body takes — and wired `MESSAGES.board(made.id)`, the entry id,
while the same commit's commands.ts parses
`PROPOSAL_ID = /^lp-[0-9a-f]{8}$/` and looks the argument up in
`store.proposals()`, keyed by the proposal record id. The command side never
changed since (git log commands.ts: only `e0dc0a06` touched the
accept/reject parse; USAGE has said `<lp-id>` all along), so the message
side is the one that diverged.

The proposal record id is the one the person should type: it is the
command's parse shape and lookup key, the two-step window books it
(`shownAt` recorded on the proposal image, `proposal-show` /
`proposal-accept` in store.ts), the attach is `loops:<lp-…>`, and
accept.ts:82's board-path message already names it. The rules board's
analog is correct and pinned (src/rules/propose-tool.ts:130 passes
`proposal.id`; tests/rules-accept.spec.ts:232 pins `/rules accept p-…`). The
entry id is the id the entry carries once accepted; it is not a proposal
key. The two-step window books only by proposal id, so no dual-id tolerance
parsing was added (per brief: none unless the window already booked both
ids — it does not).

## Fix

- src/loops/tools.ts: `MESSAGES.board(made.id)` →
  `MESSAGES.board(proposalId)`; the parameter renamed `id` → `proposal`
  with a doc line naming it the proposal record id. The message text is
  otherwise unchanged.
- L2 pin, tests/loops-consent.spec.ts, new test "the board message teaches
  the id the command parses": extracts every id the board message names
  after `/loops accept|reject`, asserts each is the tool's returned
  `proposal` and matches `/^lp-[0-9a-f]{8}$/`, then walks it through the
  real `runLoopsCommand` two-step accept over a script proposal (first
  accept shows the text, second within 30 minutes takes effect, the entry
  written with via `board`).
- Docs check, no change needed: ORCHESTRATION §18.7 documents
  `accept <lp-id>` / `reject <lp-id>`; §18.14 already distinguishes 提议 id
  `lp-<8 位十六进制>` from 条目 id `u-<8 位十六进制>`. No other surface teaches
  the id form (accept.ts:82 names the proposal id; LOOPS_HINT is generic;
  tests/loops-row.spec.ts pins USAGE with `<lp-id>`).

## Gates and probe

Logs go to the main checkout `.llm/logs/lam-*.log`, exit codes appended.

- build: exit 0 — lam-build.log
- preflight: exit 0 — lam-preflight.log
- npm test: exit 0 — lam-test.log (first run had 3 failures in
  tests/lessons-seed.spec.ts only: the out-of-git
  `.agents/tasks/m5/lessons-seed.json` was missing from the fresh worktree;
  copied from the main checkout, still git-ignored, rerun green)
- lint ratchets unchanged: eslint 69 suppressed / knip 18 / jscpd 1
- probe: `probe: 620/620 passed`, exit 0 — lam-probe.log; the slot was taken
  by the runner itself (probe-lock.mjs, waited out two live claims from other
  lanes before claiming probe-lock), no manual lock work

## Commits

- 4a761086 fix(loops): the board message teaches the proposal id the command parses
- (this commit) docs(tasks): the loops-accept-msg lane progress
