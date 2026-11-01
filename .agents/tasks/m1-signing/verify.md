# m1-signing verification, iteration 2

- Branch: `m1-signing`, worktree `.worktrees/m1-signing`
- HEAD: `fce6f0442608eeaa0eae487dfe5f7f099f666c21` (fix(glm-llm): keep credentials and server text out of signing notices (review of 9050e32))
- Commits added this iteration: `fce6f04` (one commit, 4 files: `src/glm-llm/signing.ts`, `tests/glm-signing.spec.ts`, `docs/DESIGN.md`, `docs/FACTS.md`)
- Previous HEAD: `9050e32`; base of the branch: `f98afa4`
- Input: `review-9050e32.json` (verdict CHANGES_REQUESTED, 7 findings) and `review-9050e32.md`.
- No network requests were made (fetch doubles only; bundle offsets read from the local pristine file). No credential file was read; the only credential-like values in tests are dummies (`id.secret`, `id.sec\nret`).
- The three recorded decisions (60 s handshake cooldown, raw-credential JWT handshake Authorization, permanent bypass) are unchanged.

## Findings

| # | Finding | Resolution | Evidence |
| --- | --- | --- | --- |
| 1 (blocking) | Credential can reach the signing notice | Signer-raised failures are a private `SigningFailure` class whose message is a fixed code-owned kind: `handshake_http_<status>`, `handshake_server_500`, `handshake_rejected`, `handshake_rejected: <HANDSHAKE_*>`, `handshake_omitted_privateCipher`, `invalid base64`, `privateCipher is too short`, `signing key changed during handshake`, `Unable to solve client request proof of work`. `failureReason()` returns that kind, or `error.name` for any other error (`TypeError`, `AbortError`, `OperationError`, ...). Both the handshake notice and the `signing failed` notice use it. A business rejection keeps `msg` only when it matches `^HANDSHAKE_[A-Z_]+$` (3.16.3 `N1r` @1089432, read offline: `typeof e=="string"&&/^HANDSHAKE_[A-Z_]+$/.test(e)?e:void 0`). No remaining notice interpolates an error message or server text; the other notices are fixed strings or `code=${pt.code ?? ptResp.status}`. | New test `handshake notices carry failure kinds and error names, never the credential or server text`: LF-bearing credential `id.sec\nret` through a fetch double that runs `new Headers(init.headers)` (same validation as Node 22 fetch; the test first asserts that the raw TypeError message contains the credential) yields exactly `... (TypeError) ...`; a rejection with `msg: 'unknown apiKey id.secret'` yields `(handshake_rejected)`; `msg: 'HANDSHAKE_SIGNATURE_INVALID'` yields `(handshake_rejected: HANDSHAKE_SIGNATURE_INVALID)`; a 404 yields `(handshake_http_404)`. With `signing.ts` restored to `9050e32` this test fails (`red-notices.log`: 16 tests, 15 pass, 1 fail, test 11). Node v22.20.0 offline spot-check reproduced the reviewer's message: `TypeError "Headers.append: \"dummyid.dummy\nsecret\" is an invalid header value."` |
| 2 | Mint during the handshake cooldown undocumented | DESIGN 4.3 deviation 1 now says the cooldown gates the handshake only; with an OAuth token and no cached project token the mint is gated only by `MINT_FAILURE_COOLDOWN_MS`, still goes out during a handshake cooldown, and a successful mint ends the cooldown. The code comment at the cooldown check says the same. Behavior unchanged. | `docs/DESIGN.md` 4.3 item 1; `signing.ts` comment above the `failedUntil` check |
| 3 | Fail-open deviation list incomplete | The 失败梯 bullet names all four cases where 3.16.3 throws and this package fails open: unparseable credential and missing `x-session-id` (signing skipped), PoW/Ed25519 failure and signing state invalidated during the handshake (sent unsigned). FACTS gains a row for the 3.16.3 `failOpenEligible` split (`invalid-config`, `cryptography`, `disposed` fail closed). | `docs/DESIGN.md` 4.3 失败梯; `docs/FACTS.md` new row citing `getKeyOrSendUnsigned` @3827749 |
| 4 | Path-based unsigned gate unreachable | Deleted `UNSIGNED_PATHS` and `isUnsignedPath`, the `zcode-plan` assertion in the skip test (test renamed `signing skips http, already-signed pairs, and separator-less credentials`), the header-comment clause and the DESIGN sentence. The 档位门 bullet now says the signer gates by plan only, because it always receives the provider URL. Grep over `src/`, `scripts/`, `tests/` finds no other reference. No behavior change: the only caller (`ZcodeAdapter.stream`) passes the constant `https://open.bigmodel.cn/api/anthropic/v1/messages`. | knip 31 (unchanged), build clean |
| 5 | Stale-handshake epoch guard untested | New test `a handshake overtaken by invalidation starts no cooldown when it fails`: the first handshake is held by a deferred fetch double, `invalidate()` runs while it is in flight, then it answers 404; the overtaken sign returns unsigned and the next sign handshakes at once (2 handshakes). Mutation check: with `if (state.epoch === epoch)` removed from the rejection handler, this test fails (`red-epoch-guard.log`: 16 tests, 15 pass, 1 fail, test 10); file restored with `git checkout HEAD`, `git status --short` empty. Notice content is covered by the finding 1 test. The 10 s timeout is not tested (unchanged code, not requested as an action). | `tests/glm-signing.spec.ts` |
| 6 | DESIGN cites an unversioned report | DESIGN 4.3 now points to FACTS for symbols and offsets. FACTS defines `@N` as the UTF-8 character offset in the pristine 3.16.3 copy (pristine-copy row) and cites `ZUs` @3823123, `GUs` @3823630, `Pgn` @3825391, `protectTransport` @3833810, `createFactory` @3851919, `performHandshake` @3829991, `N1r` @1089432, `ensurePrivateKey` @3829024, `getKeyOrSendUnsigned` @3827749, `Xut` @3824083, `bypassSigning` @3827229, `resolveSigner` @3825013, `QUs` @3832832. Checked offline with a throwaway script against `zcode-patch/pristine-3163/zcode.cjs.pristine` (deleted after use): `GUs`, `Pgn`, `protectTransport`, `createFactory`, `resolveSigner` start exactly at the offset; the others start within 4 to 10 characters (the offset points at the declaration, e.g. `function ZUs(` @3823123, `async performHandshake(` @3829991). | `docs/FACTS.md`, `docs/DESIGN.md` 4.3 intro |
| 7 | Superseded text kept in FACTS | Removed 「此前本行写作「3.16.3 pristine 副本本地没有」，有误」 from the pristine-copy row. | `docs/FACTS.md` |

Docs stay in the clean zone (no persona or tone words). HANDOFF and DEVELOPMENT needed no change: neither mentions the path gate, the notice text or the report path in a way these fixes affect.

## Gates

Run in the worktree on the working tree that was then committed unchanged as `fce6f04` (no edits between the gate runs and the commit; the later mutation check was reverted). Environment for `npm test` as in iteration 1: `ZCODE_BUNDLE=C:/Users/29596/Desktop/Project/Zcode/zcode-patch/pristine-3163/zcode.cjs.pristine`, and `reference/zcode-api/src/proxy/zcode_system.json` copied from the main checkout for `glm-startplan.spec`, removed after the run.

| Gate | Command | Exit | Summary | Log |
| --- | --- | --- | --- | --- |
| build | `cmd /c "npm run build > gate-build.log 2>&1"` | 0 | tsc (root and ui) clean, `build-ui: wrote ui/client.js` | `gate-build.log` |
| preflight | `cmd /c "npm run preflight > gate-preflight.log 2>&1"` | 0 | `preflight: OK (13 exports, 1 patch, client half absent; ui bundle client half built)` | `gate-preflight.log` |
| test | `cmd /c "npm test > gate-test.log 2>&1"` | 0 | see below | `gate-test.log` |

`npm test` contents:

- preflight: OK (same line as above)
- check-verbatim: `OK against bundle (397 verbatim, 0 known deviations)`
- eslint: `ok (315 suppressed)`
- knip: `ok (31 in the baseline)`
- jscpd: `ok (7 clone(s) in the baseline, 75 duplicated lines)`
- 35 spec files: 475 tests, 475 pass, 0 fail, 0 skipped (473 in iteration 1; `glm-signing.spec` 14 -> 16).
- graph:smoke: `ok (revision db4040594b13, comment, open, show and render)`

Baselines did not grow: `git diff --stat 9050e32 HEAD -- eslint-suppressions.json knip-baseline.json .jscpd-baseline.json` is empty, and the counts equal iteration 1.

### Secret scan

As in iteration 1, this branch forks before the gitleaks step entered main's `npm test`, so it was run separately with the flags of main's `scripts/check-secrets.mjs` (gitleaks 8.30.1, default rules, no `.gitleaks.toml` in the worktree, `GITLEAKS_CONFIG*` unset, `--redact --ignore-gitleaks-allow`), after the commit:

| Scan | Flags | Exit | Result |
| --- | --- | --- | --- |
| history | `--log-opts=HEAD` | 0 | 86 commits scanned, no leaks, report `[]` |
| staged | `--staged` | 0 | no leaks, report `[]` |
| unstaged | `--pre-commit` | 0 | no leaks, report `[]` |

Logs: `gitleaks-{history,staged,unstaged}.{json,err}` (overwritten this iteration).

## Not verified here

L4 items in report.md section 5 (handshake 200 with `privateCipher` at open.bigmodel.cn, ultra gateway acceptance of signed requests, raw JWT Authorization acceptance, project-token mint, server mapping of the handshake URL, effect on coding-plan usage) need real requests and were not attempted. Production still wires no `onEvent`, so the notice change has no user-visible effect today.
