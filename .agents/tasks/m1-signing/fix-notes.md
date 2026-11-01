# m1-signing fix notes

## Pass 1 (review of 9050e32: review-9050e32.json / review-9050e32.md, CHANGES_REQUESTED, 1 blocking + 6 low)

Branch `m1-signing`, worktree `.worktrees/m1-signing`. All seven findings are resolved in commit
`fce6f0442608eeaa0eae487dfe5f7f099f666c21` (fce6f04, `fix(glm-llm): keep credentials and server text out of signing notices (review of 9050e32)`;
files `src/glm-llm/signing.ts`, `tests/glm-signing.spec.ts`, `docs/DESIGN.md`, `docs/FACTS.md`). No further code change was needed in this pass;
the gates were re-run on fce6f04 (below). The three recorded decisions (60 s handshake failure cooldown, raw-credential JWT handshake
Authorization, permanent bypass) are unchanged. No network request was sent; no credential file was read; test credentials are dummies
(`id.secret`, `other.secret`, `id.sec\nret`).

| Finding | Resolution |
| --- | --- |
| 1 (blocking) Credential can reach the signing notice | Fixed in fce6f04. Signer-raised failures are a private `SigningFailure` whose message is a fixed code-owned kind (`handshake_http_<status>`, `handshake_server_500`, `handshake_rejected`, `handshake_omitted_privateCipher`, `invalid base64`, `privateCipher is too short`, `signing key changed during handshake`, `Unable to solve client request proof of work`). `failureReason()` returns that kind, or only `error.name` for any other error. Both the handshake notice and the `signing failed` notice use it; no notice interpolates `error.message`, a header value or credential material. `handshake_rejected` carries the server `msg` only when it matches `^HANDSHAKE_[A-Z_]+$` (3.16.3 `N1r`). L2 test `handshake notices carry failure kinds and error names, never the credential or server text`: LF-bearing dummy credential through a fetch double running `new Headers(init.headers)` (asserted first to produce a TypeError whose message quotes the credential) yields exactly `(TypeError)`; a rejection whose `msg` echoes the credential yields `(handshake_rejected)`; `HANDSHAKE_SIGNATURE_INVALID` and a 404 yield their kinds. Red on 9050e32 signing.ts (`red-notices.log`, 1 of 16 fails). |
| 2 Mint during handshake cooldown undocumented | Fixed in fce6f04. DESIGN 4.3 deviation 1 and the code comment above the `failedUntil` check state that the cooldown gates the handshake only; the project-token mint is gated only by `MINT_FAILURE_COOLDOWN_MS`, can run during a handshake cooldown, and a successful mint ends it. Behaviour unchanged. |
| 3 Fail-open deviation list incomplete | Fixed in fce6f04. DESIGN 4.3 失败梯 names all four cases where 3.16.3 throws and this package fails open (unparseable credential, missing `x-session-id`, PoW/Ed25519 failure, state invalidated during the handshake). FACTS gains the 3.16.3 `failOpenEligible` row. |
| 4 Path-based unsigned gate unreachable | Fixed in fce6f04. `UNSIGNED_PATHS` and `isUnsignedPath` deleted with the `zcode-plan` assertion in the skip test, the header-comment clause and the DESIGN sentence; the 档位门 bullet now says the signer gates by plan only because it always receives the provider URL. No behaviour change (only caller signs the constant provider URL). |
| 5 Stale-handshake epoch guard untested | Fixed in fce6f04. Test `a handshake overtaken by invalidation starts no cooldown when it fails`: deferred handshake, `invalidate()` while in flight, then 404; the next sign handshakes at once (2 handshakes). Mutation check with the `state.epoch === epoch` condition removed fails this test (`red-epoch-guard.log`). |
| 6 DESIGN cites unversioned report | Fixed in fce6f04. DESIGN 4.3 points to FACTS; FACTS defines `@N` (UTF-8 character offset in the pristine 3.16.3 copy) and carries the offsets of `ZUs`, `GUs`, `Pgn`, `Xut`, `resolveSigner`, `bypassSigning`, `getKeyOrSendUnsigned`, `ensurePrivateKey`, `performHandshake`, `N1r`, `QUs`, `protectTransport`, `createFactory`, checked offline against the pristine bundle. |
| 7 Superseded remark in FACTS 官方原文权威源 | Fixed in fce6f04. Remark removed; the row is rewritten whole. |

### Gates (pass 1, on fce6f04, worktree clean before and after)

| Gate | Command (from PowerShell, cwd = worktree) | Exit | Result |
| --- | --- | --- | --- |
| build | `cmd /c "npm run build > ...\.agents\tasks\m1-signing\build.log 2>&1"` | 0 | tsc root + ui clean, `build-ui: wrote ui/client.js`, no warnings |
| preflight | `cmd /c "npm run preflight > ...\preflight.log 2>&1"` | 0 | `preflight: OK (13 exports, 1 patch, client half absent; ui bundle client half built)` |
| test | `cmd /c "npm test > ...\test.log 2>&1"` | 0 | check-verbatim `397 verbatim, 0 known deviations`; eslint `315 suppressed`; knip `31 in the baseline`; jscpd `7 clone(s), 75 duplicated lines`; 35 spec files, 475 tests, 475 pass, 0 fail, 0 skipped, 0 cancelled; graph:smoke ok |

`npm test` environment: `ZCODE_BUNDLE=C:/Users/29596/Desktop/Project/Zcode/zcode-patch/pristine-3163/zcode.cjs.pristine`, and
`reference/zcode-api/src/proxy/zcode_system.json` copied from the main checkout for `glm-startplan.spec`, removed after the run
(`git status --short` empty afterwards).

Baselines: the branch forks at f98afa4, whose baselines are 315/31/7 (eslint suppressed / knip / jscpd clones). Main has since shrunk its
baseline files to 303/22/3 in commits after the fork; this branch does not touch `eslint-suppressions.json`, `knip-baseline.json` or
`.jscpd-baseline.json` (`git diff --stat f98afa4 HEAD` on them is empty), and the checkers pass against the unchanged branch
baseline, so the branch's numbers do not grow. Not verified here: the gate result against main's 303/22/3 after a rebase onto main
(rebasing is out of scope for this step).
