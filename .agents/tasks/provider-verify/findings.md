# provider-verify: Gemini via zero-plugin pi-ai declared route + community plugin fact-check

Date: 2026-11-10 · Lane: research-and-verify · Installed runtime: DeepSeek Harness desktop 0.2.1-rc.3 (`resources/runtime/primary-runtime/runtime.json` → `desktopVersion: "0.2.1-rc.3"`)

Question: can the main agent run on Gemini with the user's own API key without any plugin, and if a community provider plugin is wanted instead, which candidates are trustworthy?

Answer in one line: **the zero-plugin route works on the installed rc.3 and was verified empirically end to end (composition, catalog resolution, wire dispatch); no community plugin is needed for "Gemini via own API key", and among the community candidates only dsh-vertex-argon is both rc.3-compatible and actively maintained.**

## 1. Installed rc.3 pi-ai adapter surface (read-only, from the desktop install)

The desktop ships the plugin inside the asar archive. All citations below are from read-only extraction of
`%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\app.asar` (read-only; nothing under `~/.dsh` was touched, no desktop process launched, no file on disk modified).

- Package: `app.asar!dsh/node_modules/@deepseek-ai/dsh-llm-pi-ai/package.json` — `@deepseek-ai/dsh-llm-pi-ai` version `0.2.1-rc.3`, runtime dep `@earendil-works/pi-ai: ^1.1.0`.
- In-package README (`.../dsh-llm-pi-ai/README.md`): config surface is a `providers` dict keyed by route name; worked example uses `api: openai-completions` (README "Configure provider routes" section); field table lists `apiKeyEnv`, `displayName`, `api`, `baseURL`, `models`, `modelOverrides`, `compat`, `defaultContextWindow` (262144), `defaultMaxTokens` (32768), image budgets, `retryPolicy`.

### Protocol table (the decisive fact)

`.../dsh-llm-pi-ai/lib/index.js` (extracted copy, line numbers exact):

- L10-12: imports `anthropicMessagesApi`, `openAICompletionsApi`, `openAIResponsesApi` from `@earendil-works/pi-ai/api/*.lazy`.
- L834-838:
  ```js
  const PROTOCOLS = {
      "openai-completions": openAICompletionsApi,
      "openai-responses": openAIResponsesApi,
      "anthropic-messages": anthropicMessagesApi
  };
  ```
- L845-849: `supportedProtocols()` returns those three keys, "most-reached first" — `openai-completions` is the default presented by configuration surfaces.
- L930: a route naming any other `api` throws `... names api "<x>", which this build cannot serve; supported protocols are openai-completions, openai-responses, anthropic-messages`.
- L2240-2245: `LISTABLE_PROTOCOLS` — the same three; model discovery for OpenAI protocols is `GET {baseURL}/models` with bearer auth (L2269-2283).
- L2397: discovery defaults `api ?? "openai-completions"`.

There is **no `openai` or `openai-compat` protocol name** — the OpenAI Chat Completions wire protocol is spelled `openai-completions`. Gemini's OpenAI-compatible endpoint (`https://generativelanguage.googleapis.com/v1beta/openai/`) speaks Chat Completions, so it fits `openai-completions` directly. (Gemini also has a native `google-generative-ai` protocol in pi-ai, but the rc.3 hand-declared table deliberately excludes it — L819-833 comment: only protocols "a profile can completely describe with a key, an endpoint, and headers"; Vertex/Bedrock/Azure/Codex are absent for credential-flow reasons.)

### Hand-declared route requirements

`lib/index.js`:

- L678: a route the installed catalog does not ship must not resolve to zero models: `"resolves no models; the installed catalog does not describe this route, so its models must be listed in configuration"`.
- L690: per-model `"needs an api; the installed catalog does not describe it, so set the route's api to the wire protocol its endpoint speaks"`.
- L692: per-model `"needs a baseURL; the installed catalog does not describe this route"`.
- L1037-1043: `modelFields` schema — `name`, `contextWindow` (positive int), `maxTokens`, `input` (modality array), `reasoningEfforts` (`false` | level→wire-spelling dict), `compat`; `modelProfile` requires `id` (L1044-1047).
- L1049-1076: route profile schema — `apiKeyEnv` (credential-ref), `displayName`, `api` (union of the three protocols), `baseURL`, `models` (array), `modelOverrides`, `compat`, `defaultContextWindow` (default 262144), `defaultMaxTokens` (default 32768), `defaultInput`, `headers` (string dict), `reasoning`, `thinkingBudgets`, `cacheRetention`, `transport`, timeouts, image budgets, `retryPolicy`.
- L932-944: `buildProvider` — a catalog route without `api` override reuses the installed provider; anything else builds via `createProvider` with the protocol-table factory.
- L852-878: a hand-declared route gets harness-owned api-key auth, "configured-but-keyless" reported; the protocol decides whether a key is required.

### Auth: a keyless OpenAI-compat route still refuses

- README "Known Limitations": "pi-ai's OpenAI-compatible implementation still requires an API key or an `Authorization` header, so a keyless local server needs a placeholder credential referenced by `apiKeyEnv` or an `Authorization` entry in `headers`."
- Confirmed in pi-ai: `app.asar!dsh/node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js` L34-41 — `getClientApiKey` throws `No API key for provider: <name>` when neither `apiKey` nor an `authorization` header is present.
- L531-560 same file: `createClient` builds an official **OpenAI SDK client** with `baseURL: model.baseUrl` — so the profile's `baseURL` must be the API root **without** `/chat/completions`; the SDK appends it. `model.headers` merge, then options headers override (L535-556).

### Reasoning over the OpenAI-compat wire (relevant for Gemini thinking levels)

`openai-completions.js`:

- L1216-1286 `detectCompat`: unknown hosts (generativelanguage.googleapis.com is not in the detection list) default to `supportsReasoningEffort: true`, `thinkingFormat: "openai"`, `maxTokensField: "max_completion_tokens"`.
- L714-715: with the openai thinking format the request carries `params.reasoning_effort = model.thinkingLevelMap?.[effort] ?? effort` — i.e. the `reasoningEfforts` **values declared in the profile entry are the wire spellings** sent as `reasoning_effort`.

### How the route reaches the picker / dispatch

- `app.asar!.../dsh-base/cordis.patch.yml` L128-136: `dsh-base` mounts `llm-pi-ai` **dormant by default** ("zero routes ... until a `llm-pi-ai:` settings section supplies provider profiles — then those routes register live ... Supplying those profiles is exactly what the web Models page does").
- L90-96: `agent-default-model` row (provider `deepseek-official`, model `deepseek-flash`) — override by id to point the default selection at a declared route.
- `app.asar!.../dsh-agent-default-model/lib/index.js` L21-24: config is `{ provider: string required volatile, model: string required volatile, reasoningEffort? }`.
- `app.asar!.../dsh-headless/README.md`: headless credential order for API-key routes is launch environment → `<cwd>/.env` → `$DSH_HOME/.env`.
- `app.asar!.../dsh-home-paths/lib/*.js` L15, L101-110: `DSH_HOME` env overrides the harness home (highest precedence after an explicit configured path) — this is what keeps every scratch run away from `~/.dsh`.

## 2. Empirical verification on the installed rc.3 (scratch homes only)

Method: scratch DSH homes under `%TEMP%\prov-verify-home-*` built with the `scripts/sandbox.mjs` `generateProfile` pattern, **zero checkout packages** (bundles = `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-headless`, resolved from the installation's own node_modules — no junctions into any checkout), profile `cordis.patch.yml` overriding the `llm-pi-ai` and `agent-default-model` base rows by id. Boot: `DeepSeek Harness.exe <desktop>\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js --profile prov-verify ...` with `ELECTRON_RUN_AS_NODE=1` and `DSH_HOME=<scratch>` (no desktop processes, no `~/.dsh` access; dummy env key `DSH_PROV_SCRATCH_KEY=dsh-scratch-dummy` only). Every scratch home was removed junction-first after its run (no junctions existed).

### Run A — declared route, unreachable endpoint (the proof)

Route: `gemini-scratch`, `api: openai-completions`, `baseURL: http://127.0.0.1:9/v1beta/openai` (port 9, refused by design), `apiKeyEnv: DSH_PROV_SCRATCH_KEY`, one declared model `gemini-2.5-pro`.

1. `dsh --profile prov-verify --dump-config` → **exit 0**, composed tree shows the `llm-pi-ai` row "patched by ...prov-verify\cordis.patch.yml" carrying the declared route verbatim. No loader warnings, no schema rejection: **the profile composes and the arbitrary OpenAI-compatible endpoint is accepted without any plugin.**
2. `dsh --profile prov-verify headless --json "Reply with exactly one word."` → JSON event stream: `session` → `turn_start` → `step_start` → `step_end` (0 tokens) → `turn_end` with `reason: {"kind":"error","error":{"message":"Connection error.","code":"TRANSPORT"}}` → `final`; exit 1, stderr `dsh: TRANSPORT: Connection error.`

   Reading: the default-model selection (`gemini-scratch` / `gemini-2.5-pro`) resolved through the declared catalog — no `UNKNOWN_MODEL`, no `MISSING_CREDENTIAL`, no config error — the dummy key passed the credential seam, and the request went out to the wire, failing with a clean **connect** error at the unreachable endpoint. Per the README contract ("unresolved models fail before network I/O"), reaching the transport layer is itself the proof that the model is in the route's catalog.

### Run B — negative control: unsupported protocol name

Same scratch shape with `api: openai-chat`: boot prints `dsh: warning: 1 entry did not activate` and
`llm-pi-ai (@deepseek-ai/dsh-llm-pi-ai): ValidationError: invalid config: $.providers.gemini-scratch.api expected "openai-completions" | "openai-responses" | "anthropic-messages" but got "openai-chat"` — the protocol enum rejected verbatim, plugin fails loud (afterwards the run falls back to `deepseek-official` and fails with `MISSING_CREDENTIAL`, the expected default-route behavior). Contrast with Run A is exactly "config error at validation" vs "clean connect error at dispatch".

### Run C — contrast: undeclared model id

Route declared only `gemini-2.5-pro`, default model set to `gemini-2.5-flash`:
`dsh: UNKNOWN_MODEL: pi-ai provider "gemini-scratch" has no configured model "gemini-2.5-flash"` — the declared `models` list is the catalog boundary, and resolution failures name route and model. This is the negative image of Run A's dispatch success.

**Verdict (a): YES — the zero-plugin path works on installed rc.3.** A route key with no catalog entry, an arbitrary OpenAI-compatible baseURL, and an env-referenced credential compose, appear in the model-selection path, dispatch, and fail with `TRANSPORT: Connection error.` at an unreachable endpoint rather than any configuration error.

## 3. The profile snippet for Gemini (zero-plugin)

```yaml
# ~/.dsh/profiles/<name>/cordis.patch.yml — patch rows override the dsh-base rows by id.
# A patch row replaces the targeted row's whole `config` (do not add a second llm-pi-ai row).
- id: llm-pi-ai
  config:
    providers:
      gemini:
        displayName: Gemini (API key)
        api: openai-completions        # verified: rc.3 protocol-table enum (Run B)
        baseURL: https://generativelanguage.googleapis.com/v1beta/openai
        # no /chat/completions suffix — the OpenAI SDK client appends it (pi-ai openai-completions.js L559)
        apiKeyEnv: GEMINI_API_KEY      # resolved per request; headless order: launch env -> cwd/.env -> $DSH_HOME/.env
        models:
          - id: gemini-2.5-pro
            name: Gemini 2.5 Pro
            contextWindow: 1048576
            maxTokens: 65536
          - id: gemini-2.5-flash
            name: Gemini 2.5 Flash
            contextWindow: 1048576
            maxTokens: 65536
- id: agent-default-model
  config:
    provider: gemini                   # selects the route above as the default model
    model: gemini-2.5-pro
```

Verification status of each field:

- **Verified on rc.3**: row ids (`llm-pi-ai`, `agent-default-model`), patch-by-id semantics, `api: openai-completions` enum, `baseURL` as an arbitrary endpoint (Run A reached the wire), `apiKeyEnv` resolution from the launch environment (Run A: dummy env key accepted, no `MISSING_CREDENTIAL`), `models` list as the catalog boundary (Run C: `UNKNOWN_MODEL`), `id` required per model entry, `name`/`contextWindow`/`maxTokens` accepted per schema (Run A composed with them).
- **Verified from schema but not exercised in a run**: `reasoningEfforts` (level→wire spelling dict; for this protocol the value is sent as `reasoning_effort` verbatim), `compat` overrides, `headers` (e.g. an `Authorization: Bearer ...` workaround when no credential reference is wanted), `defaultContextWindow`/`defaultMaxTokens` fallbacks (262144/32768).
- **Inferred (external, not probed here — no real key, no call to Google)**: the Gemini OpenAI-compat root `https://generativelanguage.googleapis.com/v1beta/openai` and the `reasoning_effort` spellings Gemini's compat layer accepts. Google documents an OpenAI-compatible surface at that root (chat/completions + models listing, so `GET {baseURL}/models` discovery also lines up); the task's no-real-key rule means the live call was intentionally not made. Everything structural about the route (protocol name, field names, auth seam) is rc.3-verified; only the remote endpoint's exact answers remain to be seen on first real use.
- Model ids/capacities in the snippet are placeholders to correct per Google's current catalog; the declared list is the whole catalog (nothing auto-fetched at request time; the Models-page discovery `GET {baseURL}/models` is available for drafting, rc.3 lib/index.js L2240-2283).

## 4. Community candidates (npm registry metadata only — no install, no code execution)

Named candidates plus what registry search turned up under dsh provider keywords (searches: `keywords:deepseek-harness`, `dsh gemini`, `dsh vertex`, `dsh antigravity`, `dsh provider llm`, `keywords:dsh-provider`, `dsh openrouter`, `dsh openai-compatible`). Downloads = npm last-month at 2026-11-10.

### Deep dives (the four named)

| | dsh-gemini-subscription | dsh-vertex-argon | dsh-gemini-argon | dsh-gateway-provider |
|---|---|---|---|---|
| latest / last publish | 0.1.5 · 2026-08-24 (2.5 months stale) | 1.6.4 · 2026-11-04 (active, 16 releases since 2026-10-13) | 0.7.0 · 2026-10-19 (3 releases, all in one hour) | 1.1.4 · 2026-11-05 (18 releases since 2026-08-15) |
| repo | LeonMinGod/dsh-gemini-subscription — **0 stars, no license, untouched since publish day** | github.com/higekibaka/dsh-vertex-argon — 6 stars, MIT | github.com/zh-plus/dsh-gemini-argon — 1 star, MIT | github.com/Luck9Star/dsh-gateway-provider — 7 stars, MIT, gitleaks CI |
| DSH compat vs installed rc.3 | peer `^0.1.1-rc.2` — **does not satisfy 0.2.1-rc.3** | peer `>=0.2.0-rc.2`, engines `dsh >=0.2.0-rc.2` — **fits** | peer/engines **exact-pinned `0.2.1-rc.2`** — one rc behind | peer `>=0.2.1-rc.2 <0.3.0-0` — **fits** |
| what it registers | route `gemini-subscription` ("Antigravity（AGY 订阅）") over Antigravity `v1internal:streamGenerateContent` (daily→prod cloudcode-pa endpoints); own UI settings page | routes under provider `google-vertex-argon`: Vertex AI (`gemini-4-argon`), Gemini Developer API (`gemini-4-argon-google`), optional Antigravity proxy; GenerateContent + Interactions protocols, long-decode checkpointing, inspector | route `gemini-argon` over Vertex native `streamGenerateContent` for `gemini-4-argon`; handles global-region routing + `thoughtSignature` replay in multi-turn tool loops | route `llm-newapi` + `gateway:<id>` routes; mounts any OpenAI-compatible gateway (newapi/LiteLLM/Higress), auto-discovers models, enriches from models.dev, per-model protocol incl. gemini |
| credentials | Google **subscription OAuth** (Authorization Code + PKCE, loopback :51121, Google's public Antigravity client creds) | `GOOGLE_API_KEY`/`GEMINI_API_KEY` or Vertex ADC/Express (`GOOGLE_CLOUD_API_KEY`); DSH credentials → launch env → process.env, fail-loud | Express API key or service-account JSON; DSH credentials service + env | gateway key under `apiKeyEnv` (default `NEWAPI_API_KEY`); `~/.dsh/.credentials.yaml` or env |
| subscription OAuth required? | **yes** (not an API-key path) | no (API key / ADC) | no (API key / SA JSON) | no (gateway key) |
| touches ~/.dsh | **yes — mirrors OAuth token to `~/.dsh/gemini-subscription-token.json`** | no home writes found; diagnostics in DSH storage, bounded (200 requests / 20 responses / 64 MiB, opt-in capture) | writes only through the profile patch via settings (standard DSH flow) | documents `~/.dsh/.credentials.yaml` (the sanctioned credentials file) |
| downloads/month | 539 | 4554 | 329 | 1928 |
| notable risk | stale + unlicensed + version skew + ToS-gray subscription reuse | models pinned to the `gemini-4-argon` family ids (not an arbitrary Gemini catalog); docs unusually rigorous about what is/isn't cloud-verified | exact rc.2 pins may conflict on rc.3 hosts; young one-author project | bundles its own `@earendil-works/pi-ai` **0.84.4** (old, vs host ^1.1.0) — a second protocol stack; designed for gateways, not direct Gemini |

### Other Gemini-capable candidates surfaced by search (metadata)

| package | latest / last publish | role | downloads/mo | notes |
|---|---|---|---|---|
| dsh-agy-link | 0.6.13 · 2026-11-09 | streams agy CLI subscriptions (Gemini/Claude/GPT-OSS) into DSH; multi-account pool | 16734 | requires the external `agy` CLI (v0.5.1) and Node >= 24; 110 releases; peer deps `*` |
| dsh-plugin-subscriptions | 0.9.12 · 2026-10-29 | ChatGPT/Claude/Grok/Copilot/**Antigravity** subscriptions as providers | 13205 | OAuth per provider; tokens at `~/.dsh/plugins/subscriptions/auth.json` (0600); peer `>=0.2.0-rc.2 \|\| >=0.2.1-0` fits rc.3 |
| dsh-tool-antigravity | 0.5.3 · 2026-11-05 | Antigravity capability bundle: `google-antigravity` route, multi-account rotation, image gen | 4182 | depends on third-party `@cortexkit/antigravity-auth-core` 3.0.14 |
| dsh-antigravity-auth | 0.1.5 · 2026-11-06 | `google-antigravity` LLM route + web search/image/video from Antigravity OAuth | 2096 | dev baseline DSH **0.2.1-rc.5** (ahead of installed rc.3); third-party auth-core dep; self-described "非官方通道——仅限个人开发" |
| dsh-openrouter-live | 0.2.2 · 2026-09-23 | OpenRouter route with live model list (serves Gemini via OpenRouter + OpenRouter key) | 2099 | peer pins `0.1.6/0.1.7` era — stale vs rc.3 |
| dsh-antigravity | 0.0.9 · 2026-09-29 | Antigravity / Cloud Code Assist provider route, OAuth in DSH home | 1273 | peer `^0.1.5-rc.1` with compatibility map listing 0.2.0-rc.1; older rc line |
| dsh-vertex-patch | 0.2.1 · 2026-10-20 | load-time fix: `module.registerHooks` rewrites pi-ai `google-shared.js` regex (in-memory) so native google-protocol routes accept Gemini 4 thinking levels | 297 | no repo field; single-purpose, transparent; **only affects pi-ai's native google protocol — the `openai-completions` zero-plugin route never touches that code** |
| @dsh-ai-providers/openai-compatible | 0.7.0 · 2026-11-09 | protocol library for provider authors, not a DSH plugin | — | out of scope as an installable route |

Non-provider matches excluded after reading descriptions: dsh-gemini-multimodal / -tool-schema / -quota / -kitten-widget / -cat-theme (tools, UI, themes), dsh-connect-workbuddy, dsh-oh-my-claude, dsh-zcode-cli (CLI-as-provider for other backends), dsh-openrouter-* panels (routing/spend dashboards around the built-in openrouter route), dsh-vertex / dsh-google-ai / dsh-openrouter / dsh-openai-compatible (0.0.1 "name reserved" placeholders).

## 5. Verdict

**(a) Zero-plugin route on installed rc.3: WORKS.** Evidence: Run A (composition via `--dump-config` exit 0 with the declared route visible; headless dispatch reaching the wire and failing with `TRANSPORT: Connection error.`), Run B (protocol enum rejected with the exact three-name list), Run C (`UNKNOWN_MODEL` for an undeclared id — the declared list is the catalog). Static evidence: protocol table at `lib/index.js` L834-838, hand-declared requirements L678-692, schema L1049-1076, dormant mount in `dsh-base` L128-136, `DSH_HOME`-scoped scratch runs.

**(b) Snippet: §3 above.** Verified vs inferred split stated inline. The two rc-side caveats that matter in practice: the `baseURL` must be the compat root without `/chat/completions`, and a keyless route refuses (placeholder credential or `Authorization` header needed) — both verified from rc.3 code.

**(c) Community table: §4.** Ranking for trust: dsh-vertex-argon (active, rc.3-compatible, fail-loud credentials, unusually honest verification ledger) > dsh-gateway-provider (active, fits rc.3, but gateway-oriented and carries an old bundled pi-ai) > dsh-gemini-argon (informed, young, exact rc.2 pins) > the Antigravity-subscription family (OAuth on gray private endpoints, several `~/.dsh` writes, mixed compat) with dsh-gemini-subscription last (stale, unlicensed, incompatible peer range, 0-star repo).

**(d) Recommendation.** For "main agent on Gemini via own API key": **use the zero-plugin declared route (§3). It is composition-verified on the installed rc.3, needs no third-party code in the trust path, and the credential rides the harness seam.** Keep dsh-vertex-argon as the known fallback if native-protocol behavior turns out to matter: its README documents the two concrete gaps of the OpenAI-compat layer for Gemini — region routing (Express keys get pinned to a default region; some models live only in `global`) and `thoughtSignature` replay in multi-turn tool loops (the compat layer cannot carry it, so second-round tool requests can 400 on models that enforce signatures). If the person's target is Gemini 2.5-era models through the OpenAI-compat surface, neither gap applies; if they move to models that enforce signatures under native protocols, dsh-vertex-argon with `GOOGLE_API_KEY` is the first candidate — installed via `dsh plugin --profile <name> add dsh-vertex-argon` after the standard verify cycle, not before.

## Appendix: run hygiene record

- Scratch homes: `%TEMP%\prov-verify-home-*`, `%TEMP%\prov-verify-neg-*`, `%TEMP%\prov-verify-unk-*` — created via `generateProfile(dshHome, 'prov-verify', [])` (zero checkout packages → zero junctions), removed junction-first with `unlinkProfile` + recursive delete after each run; all confirmed gone.
- `DSH_HOME` override on every run; `~/.dsh` never read or written; no desktop processes (all boots `ELECTRON_RUN_AS_NODE=1` against the CLI `bin.js`); only credential value used: `DSH_PROV_SCRATCH_KEY=dsh-scratch-dummy`.
- `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_0`/`GIT_CONFIG_VALUE_0` unset in the run shells.
- Extracted asar copies for reading live under the temp dir only (`%TEMP%\prov-verify\asar-out`); the repo gained no extracted artifacts.
