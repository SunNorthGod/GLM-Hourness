# Third-party notices

This file inventories the third-party material GLM-Hourness carries or depends on, with the license each one is under. The repository's own source is licensed separately; see `LICENSE` (PolyForm Noncommercial License 1.0.0, licensor NorthGod). The PolyForm license covers the repository's own code only. Nothing in this file grants any license to the material listed here, and nothing here narrows the licenses that material already carries.

The file is named `THIRD-PARTY-NOTICES.md` rather than `NOTICE`: Apache-2.0 section 4(4) gives a file named `NOTICE` an operative role in redistribution, this repository is not under Apache-2.0, and the content here is an inventory, so the name states what it is and the `.md` extension matches the repository's other documentation.

Material under `reference/` is **not distributed**: `/reference/` is in `.gitignore`, so no commit of this repository contains it. Where an entry below names a path under `reference/`, that path exists only in a local checkout on a machine that has the audit sources.

Survey date: 2026-11-01. Versions are the installed ones at that date.

## 1. ZCode 3.17.1 prompt text reproduced verbatim in this source

The GLM dialect of `dsh-glm-zcode` reproduces prompt and tool-surface text from ZCode 3.17.1 word for word. This is a statement of fact about the source, recorded here because the reproduced text is not the licensor's work.

- ZCode is published by Z.ai (formerly Zhipu AI). Rights in the reproduced text belong to its publisher.
- The reproduced text is **not covered by the PolyForm Noncommercial License in `LICENSE`**. That license is granted by NorthGod over NorthGod's own code and cannot and does not grant anything over this text.
- The text appears in the mirror files `src/toolsearch/zcode-text.ts`, `src/glm-prompt/zcode-tool-text.ts`, `src/glm-prompt/zcode-harness-text.ts`, `src/glm-llm/zcode-wire.ts`, `src/shared/zcode-notice.ts`, in the verbatim constants of `src/glm-prompt/verbatim.ts`, and in the static system-prompt texts inlined in `src/glm-llm/zcode-system.ts`.
- `scripts/check-verbatim.mjs` is a gate that requires every such string to occur line for line in the ZCode 3.17.1 release bundle. Its one reference is `reference/zcode-3.17.1/zcode.cjs` (not distributed). `docs/reference/zcode-verbatim.md` records the archived passages and the grading of the evidence sources.
- The release bundle the gate reads is the ZCode desktop distribution, not the Apache-2.0 source tree at `zai-org/ZCode`. `docs/FACTS.md` section 4 records the `zai-org/ZCode` tree as Apache-2.0 and as the source of facts for prompt and tool schema mirroring; the pristine bundle carries the distribution's own terms.

## 2. Code ported from TriDefender/zcode-api

`docs/FACTS.md` section 4 records the upstream `TriDefender/zcode-api` (local copy `reference/zcode-api`, not distributed) under **CC BY-NC-SA**, and records a user ruling of 2026-10-27 that the project is not bound by it. The modules whose headers name it as the source of the port:

| File | Ported part |
| --- | --- |
| `src/glm-llm/endpoint-routing.ts` | provider endpoint routing |
| `src/glm-llm/identity.ts` | client identity headers |
| `src/glm-llm/headers.ts` | start-plan header set |
| `src/glm-llm/signing.ts` | Client Request Signing V4 |
| `src/glm-llm/start-plan.ts` | start-plan gateway prompt assembly |
| `src/glm-llm/zcode-system.ts` | static system-prompt texts, vendored via the upstream sidecar |
| `src/glm-llm/auth/oauth.ts` | OAuth login flows |
| `src/glm-llm/auth/jwt.ts` | JWT age inspection |
| `src/glm-llm/auth/store.ts` | encrypted credential store |
| `src/glm-llm/auth/types.ts` | credential types |

## 3. Vendored source

| Source | License | Use here |
| --- | --- | --- |
| DeepSeek Harness `vendor/schemastery` @ 3.18.5 (upstream https://github.com/deepseek-ai/deepseek-harness, `vendor/schemastery/src/index.ts`) | MIT | `src/shared/schemastery.ts` is a copy; the two local divergences are listed in `README.md` |

## 4. DSH host packages this repository builds against

Declared in the root `package.json` as peer or dev dependencies and in the bundle manifests as peer dependencies. All MIT; versions as installed.

| Package | Version | License |
| --- | --- | --- |
| `@deepseek-ai/cordis` | 4.0.5 | MIT |
| `@deepseek-ai/cosmokit` | 1.8.6 | MIT |
| `@deepseek-ai/dsh-attachment` | 0.2.1-rc.3 | MIT |
| `@deepseek-ai/dsh-llm` | 0.2.1-rc.3 | MIT |
| `@deepseek-ai/dsh-brand` | 0.2.1-rc.3 | MIT |
| `@deepseek-ai/dsh-timeout` | 0.2.1-rc.3 | MIT |
| `@deepseek-ai/dsh-typert-protocol` | 0.2.1-rc.3 | MIT |
| `@deepseek-ai/dsh-util-crypto` | 0.2.1-rc.3 | MIT |
| `@deepseek-ai/dsh-util-values` | 0.2.1-rc.3 | MIT |
| `@deepseek-ai/schemastery` | 3.18.5 | MIT |
| `@standard-schema/spec` | 1.1.0 | MIT |

The DSH client module table (`scripts/ui-modules.mjs`) names modules the host provides at run time; the client halves `require` them and do not bundle them. The desktop runtime packages extracted from `app.asar` under `reference/dsh-desktop-0.2.1-rc.3` and the main-branch tree under `reference/deepseek-harness` are read as type and surface references only and are not distributed.

## 5. Root workspace dependencies

Surveyed with `pnpm licenses list --json` (pnpm 8.6.10) in the repository root, which reads `pnpm-lock.yaml` and covers the whole installed tree, dev dependencies included: **131 packages**.

| License | Packages |
| --- | --- |
| MIT | 101 |
| Apache-2.0 | 12 |
| ISC | 9 |
| BSD-2-Clause | 6 |
| BSD-3-Clause | 2 |
| BlueOak-1.0.0 | 1 |

No copyleft license (GPL, LGPL, AGPL, MPL) and no package without a license appears in this tree.

Declared dependencies:

| Package | Version | License | Kind |
| --- | --- | --- | --- |
| `@types/node` | 26.6.5 | MIT | dependency |
| `@deepseek-ai/cordis` | 4.0.5 | MIT | dev, peer |
| `@deepseek-ai/dsh-attachment` | 0.2.1-rc.3 | MIT | dev |
| `@deepseek-ai/dsh-llm` | 0.2.1-rc.3 | MIT | dev |
| `@eslint/js` | 10.0.1 | MIT | dev |
| `@types/react` | 18.3.31 | MIT | dev |
| `esbuild` | 0.28.2 | MIT | dev |
| `eslint` | 10.13.0 | MIT | dev |
| `jscpd` | 5.4.2 | MIT | dev |
| `knip` | 6.43.0 | ISC | dev |
| `typescript` | 5.9.3 | Apache-2.0 | dev |
| `typescript-eslint` | 8.72.1 | MIT | dev |
| `@deepseek-ai/cosmokit` | 1.8.6 | MIT | peer |
| `@standard-schema/spec` | 1.1.0 | MIT | peer |

The notable non-MIT ones in the transitive tree: `typescript` and the `@eslint/*`, `@humanfs/*` and `@humanwhocodes/*` packages are Apache-2.0; `esquery` and `smol-toml` are BSD-3-Clause; the `espree`, `eslint-scope`, `esrecurse`, `estraverse`, `esutils`, `uri-js` group is BSD-2-Clause; `minimatch` 10.2.6 is BlueOak-1.0.0.

## 6. `video/` dependencies

`video/` is a separate, private npm project (it has `package-lock.json`, no `pnpm-lock.yaml`) that renders the promo video. `pnpm licenses list` refuses it (`ERR_PNPM_LICENSES_NO_LOCKFILE`), so the survey read the `license` field of every `package.json` under `video/node_modules/`: **351 packages**.

| License | Packages |
| --- | --- |
| MIT | 269 |
| ISC | 22 |
| Apache-2.0 | 20 |
| BSD-2-Clause | 13 |
| BSD-3-Clause | 7 |
| `SEE LICENSE IN LICENSE.md` (Remotion License) | 6 |
| MPL-2.0 | 4 |
| no `license` field | 2 |
| `Remotion License` | 2 |
| Unlicense | 2 |
| Python-2.0 | 1 |
| CC-BY-4.0 | 1 |
| BlueOak-1.0.0 | 1 |
| 0BSD | 1 |

Declared dependencies:

| Package | Version | License | Kind |
| --- | --- | --- | --- |
| `@remotion/cli` | 4.0.539 | Remotion License (`SEE LICENSE IN LICENSE.md`) | dependency |
| `@remotion/media` | 4.0.539 | no `license` field | dependency |
| `react` | 19.2.3 | MIT | dependency |
| `react-dom` | 19.2.3 | MIT | dependency |
| `remotion` | 4.0.539 | Remotion License (`SEE LICENSE IN LICENSE.md`) | dependency |
| `spessasynth_core` | 4.4.3 | Apache-2.0 | dependency |
| `@remotion/eslint-config-flat` | 4.0.539 | ISC | dev |
| `@types/react` | 19.2.7 | MIT | dev |
| `@types/web` | 0.0.166 | Apache-2.0 | dev |
| `eslint` | 10.12.0 | MIT | dev |
| `prettier` | 3.8.1 | MIT | dev |
| `typescript` | 5.9.3 | Apache-2.0 | dev |

The entries that are not a plain permissive license:

- **Remotion License**, a two-tier license that is not an OSI-approved open-source license: `remotion`, `@remotion/cli`, `@remotion/bundler`, `@remotion/player`, `@remotion/renderer`, `@remotion/web-renderer` (all 4.0.539) declare `SEE LICENSE IN LICENSE.md` and ship that file; `@remotion/sdk` and `@remotion/studio-protocol` (4.0.539) declare `Remotion License`. Per `video/node_modules/remotion/LICENSE.md`, use is free for individuals, for-profit organizations with up to 3 employees, non-profits, and evaluation; a company license is required for for-profit organizations above that size.
- **MPL-2.0**: `mediabunny` 1.62.0 and `@mediabunny/aac-encoder`, `@mediabunny/flac-encoder`, `@mediabunny/mp3-encoder` 1.62.0, reached through `@remotion/media`. MPL-2.0 is a file-level copyleft license.
- **No `license` field**: `@remotion/compositor-win32-x64-msvc` 4.0.539 and `@remotion/media` 4.0.539. Both name the Remotion monorepo as their repository.
- **CC-BY-4.0**: `caniuse-lite` 1.0.30001820 (a data package). **Python-2.0**: `argparse` 2.0.1. **Unlicense**: `fs-monkey` 1.0.3, `memfs` 3.4.3. **BlueOak-1.0.0**: `minimatch` 10.2.6. **0BSD**: `tslib` 2.8.1.

## 7. Material the repository does not distribute

Each path below is in a `.gitignore`, so no commit contains it.

| Path | Content | License |
| --- | --- | --- |
| `reference/zcode-3.17.1/`, `reference/zcode-3.16.3/` | pristine ZCode release bundles, read by the verbatim gate and as evidence | the ZCode distribution's own terms |
| `reference/ZCode/` | ZCode 3.16.2 source tree, read as a mechanism reference | Apache-2.0 (`docs/FACTS.md` section 4) |
| `reference/zcode-api/`, `reference/zcode-plugins/` | upstream of the port in section 2 | CC BY-NC-SA (`docs/FACTS.md` section 4) |
| `reference/dsh-desktop-0.2.1-rc.3/`, `reference/deepseek-harness/` | DSH runtime packages and source tree, read as a contract reference | MIT |
| `video/assets/` | GeneralUser GS SoundFont by S. Christian Collins (https://github.com/mrbumpy409/GeneralUser-GS), downloaded with its `LICENSE.txt` by `video/scripts/get-soundbank.mjs` | GeneralUser GS license, which permits use without restriction for the user's own music creation, private or commercial |
| `video/public/music/*.wav`, `*.mid` | generated by `video/scripts/make-music.mjs` and `make-score.mjs` from the soundbank above | — |

## 8. Commercial use

The PolyForm Noncommercial License in `LICENSE` permits noncommercial purposes. For a commercial license to this repository's own code, contact NorthGod at northgod@qq.com. The third-party terms listed above are not NorthGod's to grant and apply independently.
