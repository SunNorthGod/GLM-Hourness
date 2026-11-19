# guard-sig-canonical lane: the request release signature is canonical JSON

Branch `guard-sig` (worktree `.worktrees/guard-sig`, base main `3542fcfb`).
Task brief: `.agents/tasks/guard-sig-canonical/brief.md`; desktop L4 defect 1
(desktop evidence r-6jzanzjf approved via chat, reordered retry r-o3ri536p
booked as a new ask).

## Root-cause reading (all key-order-sensitive surfaces)

- `src/guard/request.ts` `signatureOf` — the defect. The doc comment and the
  m4 design (`.agents/tasks/m4-reqcard/design.md` row 3) both said canonical
  JSON; the body spread the args record (insertion order preserved) and
  stringified, so the same values in another key order hashed differently
  and the grant was not consumed. The spread is shallow, so nested objects
  were order-sensitive too. Every consumer reads the one function:
  `registerDenied` (`src/guard/request-service.ts:352`, the refusal's
  signature the plan and grant carry), the guard row's grant match
  (`src/guard/index.ts:450`, `grants.find(signatureOf(call.name,
  call.arguments, base), root)` then markInUse/consume/release), and
  `peekGrant` (`src/guard/request-service.ts:639`, the worker seam). The
  approval note and `requests/<ref>.call.json` (`request-service.ts:524,532`)
  stringify the args for display only; field order fixed by the literal.
- `src/rules/model.ts` `canonicalJson` — the canonical form the repo already
  had (keys in code point order recursively, undefined fields dropped, no
  whitespace): the rules channel's ticket signature (`src/rules/tickets.ts`
  `signatureOf`), the loops rev/clock/bind digests, and the rules store and
  repo file all go through it. The request channel was the one serializer
  that did not. It moved to `src/shared/json.ts` (the sanctioned share point;
  the eslint package rule says share through src/shared/) with no re-export
  shim; import sites updated (rules store/plan/tickets/model, loops
  clock/registry/bind, `tests/rules-model.spec.ts`).
- `src/guard/followup.ts` `canonical` — already key-sorted for its
  verbatim-retry comparison; no defect, left alone. Its sort is UTF-16 order
  where `compareCodePoints` is code point order; the two differ only for
  key names with surrogate pairs, which wire JSON tool arguments do not
  carry. Converging it is a possible follow-up, not this defect.
- `src/guard/records.ts` `recordKey`/`keyOf` — journal line identity over
  the JSON text as written; writers build records in a fixed order in one
  process and the CLI recomputes over the parsed line (JSON.parse preserves
  order), so keys are stable. Bookkeeping only, never authorization.
- `src/guard/git-snapshot.ts:1387` — git-invocation dedup over arrays
  (command-line arguments, order semantic) parsed from one shell text in
  one process; the set is call-local. No cross-process comparison.

## Fix

- `signatureOf` digests `canonicalJson([native, normalized])`: key order
  (top level and nested) does not count, one changed value is another call.
  The doc comment states the semantics and that the books are process
  memory (design §5.6) — a restart drops every grant, so stored signatures
  need no migration.
- `.agents/tasks/m4-reqcard/design.md` row 3 names the canonical form and
  the key-order semantics, with the 2026-11-20 root-fix note.

## L2 (tests/guard-request.spec.ts, 19/19)

- `signatureOf` unit: top-level reorder and nested reorder give one
  signature; an added field is another call; the resolved-target clause is
  unchanged.
- Desk flow: deny → file → the client's 可以 grants → a retry spelled in
  another key order matches the grant and consumes it once; different
  arguments match nothing and the fresh denial carries a new ref and a
  different signature. The first run exposed that `GrantBook.find` reads
  the real clock while the desk's clock is movable; the test puts the desk
  clock on the real one.

## Gates

- Logs in the main checkout's `.llm/logs/`, direct exit codes:
  `gs-build.log` BUILD_EXIT=0, `gs-preflight.log` PREFLIGHT_EXIT=0,
  `gs-test.log` TEST_EXIT=0 (3993 pass / 0 fail), `gs-lint.log` LINT_EXIT=0
  with the ratchets exactly eslint 57 / knip 18 / jscpd 1, `gs-probe.log`
  PROBE_EXIT=0.
- Full probe 626/626 passed (`gs-probe.log`; the runner claimed the probe
  lock itself, GIT_CONFIG_COUNT/GIT_CONFIG_KEY_0/GIT_CONFIG_VALUE_0 cleared
  before the run).
- The first full-test run failed only `tests/lessons-seed.spec.ts` setup
  (3): `.agents/tasks/m5/lessons-seed.json` stays out of git by design, and
  a fresh worktree does not have it; copied from the main checkout, the
  chain is green on the rerun.
- node_modules is a junction to the main checkout's node_modules (to be
  unlinked at teardown).
