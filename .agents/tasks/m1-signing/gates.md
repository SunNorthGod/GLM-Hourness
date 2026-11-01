# m1-signing: rebase onto main and gates (2026-10-28)

## Rebase

- `git fetch origin`: origin/main and local main both at `e3305a67617324aa0304e36f842c154c9192eb87`; ahead/behind 0/0. The user's checkout (main) was not touched.
- Rebase base: `e3305a6` (local main). Old base `f98afa4`; main added 9 commits (`e22d38e` .. `e3305a6`).
- Head before: `fce6f04`. Head after: `6af6c517559bc25286aadc7348361c8c7d19a720`.
  - `b6367d3` fix(glm-llm): sign on the provider URL so the handshake reaches open.bigmodel.cn (m1-signing) (was `9050e32`, applied cleanly)
  - `6af6c51` fix(glm-llm): keep credentials and server text out of signing notices (review of 9050e32) (was `fce6f04`)
- Conflicts: one, `src/glm-llm/signing.ts` `base64ToBytes`, in `fce6f04`. Main (`2c957ff`, TypeScript 5.9.3 pin) changed the return type to `Uint8Array<ArrayBuffer>`; the branch changed `throw new Error('invalid base64')` to `throw new SigningFailure('invalid base64')`. Resolved by keeping both: `Uint8Array<ArrayBuffer>` return type and `SigningFailure`.
- Auto-merged without conflict: `docs/DESIGN.md`, `docs/DEVELOPMENT.md`, `docs/FACTS.md`, `docs/HANDOFF.md`. Reviewed the branch's doc diff against main: no superseded clause left, main's additions (gitleaks gate, risk-tiered verification) unaffected. `package.json` was not touched by the branch; the test script is main's (all specs, `check-secrets.mjs` right after `check-lint.mjs`).
- No fix commit was needed.

## Environment notes (not code problems)

- The worktree's `node_modules` predated main's dependency changes (TypeScript 5.7.2, no `@eslint/js`). First `npm test` failed in ESLint: `tests/glm-signing.spec.ts` 47:71 `no-unsafe-argument` (the Ed25519 `generateKey` error type under 5.7, which 5.9.3 fixes and whose suppression `2c957ff` pruned). Fixed by `pnpm install --frozen-lockfile --offline` (local store only, lockfile unchanged); `npx tsc --version` then 5.9.3.
- The worktree has no `reference/` (gitignored). Without `reference/ZCode`, check-verbatim against the installed user-patched bundle fails on the security notice (`SECURITY_NOTICE_OFFICIAL`, `start-plan stable section 1`); the main checkout passes against bundle + source. Gates ran with `ZCODE_BUNDLE=C:/Users/29596/Desktop/Project/Zcode/zcode-patch/pristine-3163/zcode.cjs.pristine` and `reference/zcode-api/src/proxy/zcode_system.json` copied from the main checkout (for `glm-startplan.spec`), as in fix-notes.md; the copy was removed after the probe. `git status --short` empty.

## Gates (final run)

| gate | exit | result |
| --- | --- | --- |
| `npm run build` | 0 | tsc (root, ui) + build-ui wrote ui/client.js (`rebase-build.log`) |
| `npm run preflight` | 0 | `preflight: OK (13 exports, 1 patch, client half absent; ui bundle client half built)` (`rebase-preflight.log`) |
| `npm test` | 0 | check-verbatim OK (397 verbatim, 0 known deviations); 36 spec files, 483 tests, 483 pass, 0 fail; graph:smoke ok (`rebase-test.log`) |

- ESLint: ok, 303 suppressed (baseline 303).
- knip: ok, 22 in the baseline (baseline 22).
- jscpd: ok, 3 clones in the baseline, 26 duplicated lines (baseline 3).
- Secrets: `check-secrets: ok (gitleaks 8.30.1: 95 commits on HEAD, staged and unstaged changes, no leaks)`.

## Probe

- `npm run probe` (offline L3, shared glmsandbox profile, not edited): exit 0, `probe: 89/89 passed` (`probe.log`). Run artifacts in the worktree's `.llm/probe-runs/2026-10-28T11-47-36-974Z`.

## Merge and push

- User checkout before merge: branch main, up to date with origin/main, working tree clean. `main` is an ancestor of `m1-signing` (fast-forward possible).
- main before: `e3305a67617324aa0304e36f842c154c9192eb87`.
- `git merge --ff-only m1-signing`: exit 0, `Updating e3305a6..6af6c51`, fast-forward, 8 files changed, 417 insertions, 67 deletions.
- main after: `6af6c517559bc25286aadc7348361c8c7d19a720`.
- `git push origin main` (GCM_INTERACTIVE=never, GIT_TERMINAL_PROMPT=0): exit 0, `e3305a6..6af6c51  main -> main`. No force push.
- After `git fetch origin`: origin/main `6af6c517559bc25286aadc7348361c8c7d19a720`, equal to local main; `git status -sb` shows `main...origin/main` with no ahead/behind.
- Commits brought in by m1-signing:
  - `b6367d30827b73d30a53f44a13144d06579af88b` fix(glm-llm): sign on the provider URL so the handshake reaches open.bigmodel.cn (m1-signing)
  - `6af6c517559bc25286aadc7348361c8c7d19a720` fix(glm-llm): keep credentials and server text out of signing notices (review of 9050e32)
- The m1-signing worktree and branch were kept. `.worktrees/m2-9` and branch m2-9 were not touched.
