# Provider-origin handshake, start-plan gate and 60 s handshake cooldown for the native GLM signer

Reviewed: `git diff 9050e32^..m1-signing` in `.worktrees/m1-signing` (one commit, 9050e32; no later fix commits). Judged against `.agents/tasks/m1-signing/report.md` §4, with §0, §3, §5 as context.

The commit fixes the handshake address. The adapter used to give the signer the routed `zcode.z.ai/api/v1/ultra/...` URL, so every handshake went to `https://zcode.z.ai/api/paas/c1f3a7e2/v2/client` and got a 404. The signer now receives the provider URL `https://open.bigmodel.cn/api/anthropic/v1/messages`, and `send` posts to the routed URL with the routing headers after the signature block. The handshake goes through endpoint routing via a new `handshakeFetch`. Start-plan gets no signer. A failed handshake starts a 60 s per-(origin, credential) cooldown. The JWT-form handshake `Authorization` is now the raw token. Every item of report §4.1–§4.5 is present and the three recorded decisions are implemented as recorded. The `verify.md` evidence covers build, preflight and test (all green), plus red runs of the 10 new tests on the old sources.

Watch for: the new handshake notice copies raw `error.message` into the `onEvent` text. On Node 22 a fetch header-validation error quotes the header value, which here is the raw credential. A server `msg` also passes through unfiltered (confirmed, blocking; latent today because no production constructor wires `onEvent`). A project-token mint can still go out during a handshake cooldown, and the docs do not say so. The path-based unsigned gate is now unreachable from production.

**Verdict**: NEEDS_CHANGES

## High-level view

URL handling matches 3.16.3. The signer derives its state key and handshake origin from the provider URL, and `send` posts to `routed.url`. The header order is: original pairs, the seven signature headers, then routing headers such as `X-ZCode-Authorization`. `routedHandshake` resolves the handshake through the same `EndpointRoutingService`. Without a mapping it goes unchanged to `https://open.bigmodel.cn/api/paas/c1f3a7e2/v2/client`. The mint stays on the plain `fetchImpl`.

The cooldown follows the brief. Only an epoch-matching rejection sets `failedUntil`. An overtaken success throws from the success handler and sets nothing. Invalidation, bypass, a fresh mint and a successful handshake all clear it, and while cooling no handshake goes out. The cooldown is checked after credential resolution so that a newly minted token ends it. As a result, a mint, bounded by its own 60 s cooldown, can still run during the window, and DESIGN §4.3 does not mention this.

Start-plan is unsigned in both codebases. The adapter passes a `null` signer for `plan === 'start-plan'`. In the pristine 3.16.3 bundle, read offline only, `QUs` at @3832832 returns `false` first for `zhipu-account` with mode `start-plan`, `off-peak` or `highspeed`, and `protectTransport` at @3833810 then returns the routing transport or the access-mode unsigned fetch. The new assembly test pins this; on the old code it saw one handshake.

The blocking problem is the notice text. Before this commit the handshake notice was a fixed string. Now it embeds `error.message`, which can carry the raw credential or arbitrary server text. 3.16.3 logs only `errorKind`, `httpStatus`, `businessCode` and a `reason` restricted to `^HANDSHAKE_[A-Z_]+$`. Nothing leaks today because production wires no `onEvent`, but the planned signing-visibility work (DESIGN §4.3, clause 7) would wire that sink.

The tests would fail on the pre-9050e32 code, including the start-plan test. The repo rules hold: no parameter properties or enums, optional fields are typed `| undefined`, and adapter construction cannot throw. The new dead code is the path gate (issue 4). Not tested: the epoch guard on the rejection path, and the content of any notice.

The docs match the code on the URL rule, the assembly, the gate and both recorded deviations, and contain no persona or tone words. Gaps: the fail-open list misses two of the four 3.16.3 fail-closed cases, DESIGN cites a gitignored report for its offsets, and one FACTS row keeps superseded text.

<details>
<summary>Issues (7)</summary>

1. **Credential can reach the signing notice (blocking)** (`src/glm-llm/signing.ts` 250–252, 459): stop putting raw `error.message` and server `msg` into the `onEvent` text. Emit only the code's own `handshake_*` kinds, a server reason matching `^HANDSHAKE_[A-Z_]+$` (as 3.16.3 does), and `error.name` for anything else. Add a test where a failing handshake with a credential containing a newline produces a notice without the credential.
2. **Mint during the handshake cooldown undocumented** (`signing.ts` 243–244, DESIGN.md §4.3 deviation 1): add a clause saying that a project-token mint, gated by its own 60 s cooldown, can still go out during a handshake cooldown, and that a successful mint ends the cooldown.
3. **Fail-open deviation list incomplete** (DESIGN.md §4.3 失败梯, ~line 260): 3.16.3 also fails closed on PoW/Ed25519 signing failure and on an epoch change during the handshake; this package fails open on both. Name all four cases or mark the list as non-exhaustive.
4. **Path-based unsigned gate now unreachable** (`signing.ts` 43–47, 174–178, 227): the only caller passes the constant provider URL, so `UNSIGNED_PATHS` cannot match in production. Delete the gate with its test case and doc sentence, or record why it stays (repo rule: no dead code).
5. **Stale-handshake epoch guard untested** (`signing.ts` 430; `tests/glm-signing.spec.ts`): add a test where a handshake is invalidated mid-flight and then fails, and assert that the next request handshakes immediately. This pins that the overtaken failure starts no cooldown.
6. **Design doc cites an unversioned report** (DESIGN.md §4.3, line 255): `.agents/` is gitignored. Mark the reference as not versioned, or move the key bundle offsets (`QUs` @3832832, `GUs` @3823630, `protectTransport` @3833810, `performHandshake` @3829991) into FACTS.md.
7. **Superseded text kept in FACTS** (FACTS.md row 「官方原文权威源」): remove 「此前本行写作「3.16.3 pristine 副本本地没有」，有误」. AGENTS.md says superseded clauses are rewritten whole and the old text stays in git history.

</details>

<details>
<summary>Details</summary>

### Raw error text in the handshake notice

```ts
const reason = error instanceof Error ? error.message : String(error)
this.noteOnce(`${stateKey}\nhandshake`, `signing handshake failed (${reason}) — sending unsigned; no new handshake for ${HANDSHAKE_FAILURE_COOLDOWN_MS / 1000} s`)
```

`error` is whatever `performHandshake` rejected with. Two of its sources are outside the signer's control (confirmed).

The first is fetch. `performHandshake` hands `{ Authorization: authValue, ... }` to `handshakeFetch` → `routedHandshake` → `fetchImpl`, and `authValue` is the raw `{apiKeyId}.{secret}` or the project JWT. If that value contains an embedded CR, LF or NUL, Node 22's fetch rejects the header before any network I/O, and the message quotes the value. Spot-check on v22.20.0 with a dummy value and no network:

```
TypeError: Headers.append: "dummyid.dummy
secret" is an invalid header value.
```

`parseSigningCredentialForm` accepts such a credential, because it only checks for one dot and non-empty trimmed halves, so the whole credential would land in the notice. `verify.md` lists "fetch error messages" as safe notice content, and for this case that claim is wrong.

The second is the server. `handshake_rejected: ${String(envelope.msg)}` (line 459) passes the server `msg` through verbatim. 3.16.3 records `msg` as a reason only when it matches `^HANDSHAKE_[A-Z_]+$` (report §1.4, §2.1), so a server that echoes request content would get into our notice but not into ZCode's log.

Neither `index.ts` (line 56) nor `login-row.ts` (line 36) passes `onEvent` to `ZcodeAdapter`, so there is no production leak today. `onEvent` is still the designated sink for these notices, and DESIGN §4.3 clause 7 plans to surface signing state through it. Fix: map the error to a fixed vocabulary before `noteOnce`. Allowed values are the signer's own `handshake_http_<status>`, `handshake_server_500` and `handshake_omitted_privateCipher`; `handshake_rejected` with a reason only when it matches the 3.16.3 pattern; and `error.name` (`TypeError`, `AbortError`, `OperationError`) for everything else. The other credential-bearing strings in the signer, the `stateKey` and notice keys, only serve as Map/Set keys and are never emitted. The pre-existing `signing failed (...)` notice carries WebCrypto/PoW messages only.

### Cooldown ordering versus the project-token mint

```
signWithStatus
  bypass? ── yes → unsigned
  resolveParsedCredential ── may mint (getCustomerInfo + access_tokens on bigmodel.cn)
  credential / x-session-id checks
  failedUntil in future? ── yes → unsigned        ← handshake cooldown
  ensurePrivateKey → handshake via routedHandshake
```

A successful mint calls `invalidateState`, which clears `failedUntil`, so a new project token gets an immediate handshake. This is why the check sits after credential resolution. As a consequence, a credential with `oauthAccessToken` and no cached project token sends a mint pair whenever `MINT_FAILURE_COOLDOWN_MS` has lapsed, even during a handshake cooldown (confirmed). In the steady failing state that is at most one mint pair per minute on the request's critical path. DESIGN §4.3 deviation 1 says "期间的请求直接无签发送" and that a fresh mint ends the cooldown, but it does not say the mint keeps running during the window. The brief's "no network call while cooling" holds for the handshake only.

### 3.16.3 parity of the fail-open list

The rewritten 失败梯 bullet names two cases where this package fails open and 3.16.3 throws: an unparseable credential and a missing `x-session-id`. Report §2.1 lists two more non-fail-open kinds in 3.16.3: PoW/Ed25519 `cryptography` failures, and `disposed` (an epoch change during the handshake). Here `buildSignedPairs` returns `null` on a PoW/sign failure, and `signWithStatus` catches "signing key changed during handshake"; both send unsigned (confirmed). The behavior is pre-existing, but the sentence is new and reads as the complete list.

### Unreachable path gate

The only call site, `ZcodeAdapter.stream`, passes `url: upstreamBase`, the constant `https://open.bigmodel.cn/api/anthropic/v1/messages` (confirmed by grep over `src/` and `scripts/`). Before the commit the signer received the routed URL, which a server mapping could point at `/api/v1/zcode-plan/...`. Now `isUnsignedPath` can never match. The file header ("the zcode-plan/off-peak paths are never signed") and the DESIGN 档位门 bullet still describe it as live behavior. 3.16.3 has no path list; its gate is `QUs` by access mode, which the new `plan === 'start-plan'` check now mirrors.

### Test coverage

The "VERIFY invalidation ends the cooldown" test fails on the old code only in its setup helper (`managerInCooldown` expects one handshake). It still pins the clear in `invalidateState`, because removing that line would leave the next sign in cooldown.

Not tested: the epoch guard in the rejection handler (line 430). No test has an in-flight handshake that is overtaken by invalidation and then fails, so dropping the `state.epoch === epoch` condition would likely leave every spec green and let a stale failure put the fresh epoch into cooldown. Also not tested: any `onEvent` message content or the per-cause notice keys, which is where issue 1 sits, and the 10 s handshake timeout.

### Documentation traceability

DESIGN §4.3 points readers to `.agents/tasks/m1-signing/report.md` for evidence and offsets, but `.gitignore:7` ignores `.agents/`. FACTS names the original symbols, so the facts can be reproduced by searching the bundle; the offsets, however, exist only in the untracked report, which conflicts with the charter's audit-trail clause (b8c8926). The FACTS row for the 3.16.3 pristine copy ends with "此前本行写作「3.16.3 pristine 副本本地没有」，有误", which keeps superseded text in the document. The brief also places the `QUs` location in `docs/reference/zcode-verbatim.md`, but that file does not record it. It is in report §1.2, and FACTS cites it by original name.

</details>

<details>
<summary>File map</summary>

- `src/glm-llm/signing.ts`: header comment rewritten (provider URL, start-plan gate, two deviations); `HANDSHAKE_FAILURE_COOLDOWN_MS`; `failedUntil` on `SignerState`, set by epoch-matching failures, cleared by invalidation and success; `handshakeFetch` option; raw JWT `Authorization`; per-cause notice keys; catch no longer invalidates.
- `src/glm-llm/zcode.ts`: signs on `upstreamBase`, sends to `routed.url` with routing pairs appended; `null` signer for start-plan; `routedHandshake` resolves the handshake through `EndpointRoutingService`.
- `tests/glm-signing.spec.ts`: exact handshake URL/method/headers; cooldown window, concurrency, VERIFY clear, per-pair isolation, `handshakeFetch` split, JWT-form raw `Authorization`.
- `tests/glm-zcode.spec.ts`: gateway double; provider-origin handshake with routed send and key reuse, one handshake across failures, start-plan unsigned, routing headers after the signature block with a mapped handshake.
- `docs/DESIGN.md`: §4.3 rewritten; §4.5b capture sentence updated.
- `docs/HANDOFF.md`: §5 item 5 rewritten (address fix, deviations, L4 open).
- `docs/FACTS.md`: 3.16.3 signing facts; pristine 3.16.3 row corrected; open-item row reworded.
- `docs/DEVELOPMENT.md`: incident row for the routed-URL handshake.

Full diff: `git -C .worktrees/m1-signing diff 9050e32^..m1-signing`.

</details>
