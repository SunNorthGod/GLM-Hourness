# Provider-origin signing handshake, 60 s failure cooldown and notice hygiene (m1-signing, pass 2)

Scope: the full branch diff `git diff f98afa4..m1-signing` in `.worktrees/m1-signing` (`f98afa4` is the merge-base with main; commits `9050e32` and `fce6f04`), judged against `report.md` §4 (context §0, §3, §5), the pass-1 review `review-9050e32.md`/`.json` and `fix-notes.md`. No earlier `review-fix-loop.md` existed.

The branch fixes the handshake address. The signer now receives the provider URL `https://open.bigmodel.cn/api/anthropic/v1/messages` instead of the routed `zcode.z.ai/api/v1/ultra/...` URL, so the handshake goes to `https://open.bigmodel.cn/api/paas/c1f3a7e2/v2/client` through the endpoint-routing transport, as in ZCode 3.16.3. Start-plan gets no signer. A failed handshake starts a 60 s cooldown per (origin, credential), and the JWT-form handshake `Authorization` is the raw token; both are settled decisions. `fce6f04` closes the pass-1 blocker: handshake and sign notices carry only signer-owned failure kinds or `error.name`, a server `msg` survives only when it matches `^HANDSHAKE_[A-Z_]+$`, and an L2 test runs an LF-bearing credential through real `Headers` validation and asserts the notice is exactly `(TypeError)`. The gates recorded on `fce6f04` are green (build, preflight, 475/475 tests, baselines unchanged), and red runs exist for both new tests.

Watch for: the handshake notice always announces "no new handshake for 60 s", but the two overtaken-handshake paths start no cooldown, and the once-per-pair notice key then suppresses the notice for a later real cooldown (confirmed; latent, production wires no `onEvent`). The mint notice still interpolates an unvalidated server `code`, although the new header comment and DESIGN say notices carry only code-owned kinds (interpolation confirmed; a leak needs a non-numeric server code, possible). DESIGN overstates the bypass lifetime, and the docs file the pending real-network signing check under L4, which main's `norm-verify-tiers` (added after the fork) no longer allows. None of these blocks.

**Verdict**: APPROVED

## High-level view

The wiring meets the expected 3.16.3 behaviour. The signer keys state and derives the handshake origin from `upstreamBase`, `send` posts to `routed.url` with `X-ZCode-Authorization` after the seven signature headers, and the handshake goes through `routedHandshake` on the same `EndpointRoutingService`. The mint stays on the plain `fetchImpl`. The start-plan `null` signer covers every non-signing mode this package has, because `PlanId` is only `coding-plan | start-plan`.

The cooldown and its epoch guard match report §4.2, and the mint running during the window is now documented. The handshake notice is the weak spot. Its cooldown suffix is unconditional, so in the overtaken cases it describes a cooldown that does not exist, and its once-per-pair key can then hide the accurate notice. Separately, the pre-existing `pt-mint` notice prints a server field the new vocabulary claim does not allow for.

All seven pass-1 findings are resolved in `fce6f04`: the notice vocabulary with its L2 test, the mint clause, the four fail-open cases, the deleted path gate, the epoch-guard test, the FACTS offsets, and the superseded FACTS remark. All 13 FACTS offsets were spot-read against the pristine 3.16.3 bundle and land on the named declarations.

The docs match the code and stay clean of persona or tone words. Three items lag: DESIGN says the bypass lasts until process restart, but it lives on the adapter that each row activation rebuilds; the graph node `risk-signing` still states the disproved attribution; and the pending real-network checks are labelled L4.

Main moved after the fork (baselines 303/22/3, `@eslint/js` recommended rules, the TypeScript pin, gitleaks in `npm test`, `norm-verify-tiers`). The recorded gates use the fork baselines only, and `fce6f04`'s subject lacks the node id that main's subjects carry.

<details>
<summary>Issues (7)</summary>

1. **Cooldown suffix on overtaken-handshake notices** (`src/glm-llm/signing.ts` 251, with 423 and 430): the notice always says "no new handshake for 60 s", but an overtaken success or failure starts no cooldown, and the once-per-pair key then hides the notice for a later genuine cooldown. Append the cooldown clause only when `state.failedUntil` is in the future after the catch, or word the overtaken case separately.
2. **Unvalidated server `code` in the mint notice** (`signing.ts` 398; DESIGN §4.3 通知): `pt.code` is typed `number` by assertion only and is printed verbatim. Guard it with `typeof pt.code === 'number'` (else print the HTTP status), and note in DESIGN that the mint notices are process-wide, one per cause, not per (origin, credential).
3. **`routedHandshake` typed wider than its caller** (`src/glm-llm/zcode.ts` 166–172): the `URL`/`Request` branches never run, and the `init.headers` cast would silently drop `Headers` or array headers. Narrow `handshakeFetch` to `(url: string, init: RequestInit & { headers: Record<string, string> }) => Promise<Response>` and drop the normalization and the cast.
4. **Bypass lifetime overstated** (DESIGN §4.3 deviation 2): "直到进程重启" is inexact, since a row re-activation builds a new adapter and signer and ends the bypass. Reword to "直到该行重新激活或进程重启".
5. **Stale `risk-signing` node** (`docs/graph/nodes/risk-signing.json`): the body still says "签名握手对当前凭证失败". Update it through the graph tools when `m1-signing` closes, not by hand.
6. **Real-network check labelled L4** (DESIGN §4.3 "待 L4", HANDOFF §5 item 5, FACTS open-item row): main's DEVELOPMENT §1.1 says real-network verification of credentials and signing is not L4 and is done with the change. Relabel on merge, and run the sandbox real-request check before closing `m1-signing`.
7. **Merge gates and node id** (`fce6f04`, merge onto main): re-run build, preflight and `npm test` after merging main (303/22/3 baselines, `@eslint/js` recommended, gitleaks), run L3 as §1.1 requires for runtime code, and carry `m1-signing` in the merge commit message.

</details>

<details>
<summary>Details</summary>

### Cooldown wording in the overtaken-handshake notice

```ts
catch (error) {
  this.noteOnce(`${stateKey}\nhandshake`, `signing handshake failed (${failureReason(error)}) — sending unsigned; no new handshake for ${HANDSHAKE_FAILURE_COOLDOWN_MS / 1000} s`)
  return { pairs, signed: false }
}
```

`ensurePrivateKey` rejects in three ways, and only one of them starts a cooldown. A failure with a current epoch sets `failedUntil`, so the suffix is true. In the other two, a VERIFY invalidation or a newly minted project token has overtaken the in-flight handshake. If that handshake then succeeds, the fulfilment handler throws `signing key changed during handshake`; if it fails, the rejection handler skips the cooldown because the epoch moved. In both cases the next request handshakes at once, yet the notice says otherwise (confirmed, `signing.ts` 251, 423, 430). The key `${stateKey}\nhandshake` fires once per pair, so when the first handshake notice for a pair comes from an overtaken case, a later genuine cooldown produces no notice. Production wires no `onEvent` today, so this is latent, but this notice is the fail-open signal DESIGN clause 7 plans to surface.

### Notice vocabulary outside the handshake

The new header comment says notices name failures "by code-owned kinds and error names only". DESIGN §4.3 通知 says notices carry only the package's own failure kinds and error names, one per (origin, credential) per cause. `mintProjectJwt` still emits `project token mint rejected (code=${pt.code ?? ptResp.status})`. `pt.code` comes from the server's JSON and is typed `number` only by an assertion, so a string `code` is printed verbatim (confirmed). A credential leak through it would need the server to echo request material in `code` (possible). The line predates the branch, but the claim is new. The mint notices are also keyed process-wide (`pt-key`, `pt-project`, `pt-mint`, `pt-network`, `pt-parse`), not per (origin, credential).

### routedHandshake input handling

`handshakeFetch` is typed `typeof fetch`, so `routedHandshake` normalizes `URL` and `Request` inputs and casts `init.headers` to `Record<string, string>`. The only caller, `performHandshake`, passes a template string and a plain header object, so the `URL`/`Request` branches never run (confirmed). The cast carries more risk. If a later caller passes a `Headers` instance or an entry array, the spread yields no entries, and a mapped handshake would go out without `Authorization` and `Content-Type`, failing open with no error. A narrowed option type still accepts `typeof fetch` values, including the test doubles.

### Docs against code and against main

DESIGN §4.3 deviation 2 says the bypass lasts "直到进程重启". The state lives on the `ClientSigningManager` owned by each `ZcodeAdapter`, and `index.ts` `apply` builds a new adapter on every activation. A row re-apply without a process restart therefore also ends the bypass (likely; it depends on DSH re-applying rows in-process, which the `application: applied` flow in AGENTS.md implies). The real behaviour is less strict than documented, which is the safer direction, but the sentence is new and inexact.

`docs/graph/nodes/risk-signing.json` still has the body "签名握手对当前凭证失败，按设计无签发送", which this branch's DESIGN, HANDOFF and DEVELOPMENT entries now call disproved (confirmed). Graph nodes change only through the graph tools, so this falls to whoever closes `m1-signing`.

DESIGN §4.3 "待 L4", HANDOFF §5 item 5 ("L4 未做") and the FACTS open-item row ("L4 截包") all file the real-network signing checks under L4. Main's DEVELOPMENT §1.1 (`7f2b7b8`, after the fork) says real-network verification of credentials and signing "不算 L4，随改动做" (confirmed against `main:docs/DEVELOPMENT.md`). If the L4 label survives the merge, the sandbox real-request check for the settled raw-JWT decision and the handshake address slides to the milestone batch.

### Test coverage

The signer specs cover the exact handshake request, the cooldown boundary (59 999 / 60 001 ms), concurrency, VERIFY clearing, per-pair isolation, the overtaken-failure guard, the mint/handshake transport split, the raw JWT `Authorization` and the closed notice vocabulary. The adapter specs cover the provider-origin handshake with routed send and key reuse, one handshake across failures, the start-plan gate, and header order with a mapped handshake URL.

Not tested: the overtaken-success path (`signing key changed during handshake`) and the notice text in either overtaken case; the `signing failed` notice on a PoW/Ed25519 failure (it shares `failureReason`, so the risk is low); the 10 s handshake timeout; a `Headers`-typed `init.headers` reaching `routedHandshake`.

### Merge onto main

The fixer recorded gates against the fork baselines (eslint 315, knip 31, jscpd 7) and ran gitleaks separately. `fix-notes.md` says the result after merging main is not verified. Main has since shrunk those baselines to 303/22/3, adopted `@eslint/js` recommended rules, pinned TypeScript 5.9.3 and added the secret scan to `npm test`, so new lint findings in the added code can surface only after the merge. `fce6f04`'s subject reads "(review of 9050e32)" without `m1-signing`, while main's subjects carry the node id (ORCHESTRATION §2.6: 提交信息带节点 id). Main's §1.1 also requires L3 before merging a branch that touches DSH runtime code, and the adapter is runtime code.

</details>

<details>
<summary>File map</summary>

- `src/glm-llm/signing.ts`: header comment rewritten (provider URL, start-plan gate, notice rule, two deviations); `HANDSHAKE_FAILURE_COOLDOWN_MS`; `failedUntil` set by epoch-current failures and cleared by invalidation and success; `handshakeFetch` option; raw JWT `Authorization`; `SigningFailure` and `failureReason` for notice-safe reasons; `HANDSHAKE_REJECTION_REASON` filter; per-cause notice keys; path gate removed.
- `src/glm-llm/zcode.ts`: signs `upstreamBase`, sends to `routed.url` with routing pairs appended; `null` signer for start-plan; `routedHandshake` routes the handshake through `EndpointRoutingService`.
- `tests/glm-signing.spec.ts`: exact handshake URL, method and headers; cooldown, concurrency, VERIFY clear, isolation, overtaken-failure epoch guard, notice vocabulary, `handshakeFetch` split, raw JWT `Authorization`; path-gate assertion removed.
- `tests/glm-zcode.spec.ts`: gateway double; provider-origin handshake with routed send and key reuse; one handshake across failures; start-plan unsigned; routing headers after the signature block with a mapped handshake.
- `docs/DESIGN.md`: §4.3 rewritten (URL rule, assembly, plan gate, fail-open list, notices, cache, two deviations, defect history, pending checks); §4.5b capture sentence updated.
- `docs/FACTS.md`: pristine 3.16.3 copy row with the `@N` definition; 3.16.3 handshake, cache, fail-open, bypass and plan-gate rows with offsets; open-item row rewritten.
- `docs/HANDOFF.md`: §5 item 5 rewritten.
- `docs/DEVELOPMENT.md`: incident row for the routed-URL handshake.

Full diff: `git -C .worktrees/m1-signing diff f98afa4..m1-signing`.

</details>
