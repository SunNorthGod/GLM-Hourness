# Licence files and third-party notices

Graph node: `d-license-polyform` (approved 2026-11-01). Decision: PolyForm Noncommercial License 1.0.0, all noncommercial use granted, commercial use by separate licence from the licensor. Run on `main` in the main checkout, no worktree.

## Files written

| File | Content |
| --- | --- |
| `LICENSE` (new) | PolyForm Noncommercial License 1.0.0 verbatim, under a header that names the licensor and the commercial contact |
| `THIRD-PARTY-NOTICES.md` (new) | third-party inventory with each licence, the dependency survey, and the material that is not distributed |
| `package.json` | `license` MIT -> `PolyForm-Noncommercial-1.0.0` |
| `video/package.json` | `license` UNLICENSED -> `PolyForm-Noncommercial-1.0.0` |
| `packages/glm/package.json` | `license` MIT -> `PolyForm-Noncommercial-1.0.0` |
| `packages/hourness/package.json` | `license` MIT -> `PolyForm-Noncommercial-1.0.0` |
| `README.md` | the 许可 section states the licence, the licensor and the commercial contact, and points at `THIRD-PARTY-NOTICES.md` |
| `docs/FACTS.md` section 4 | the stale claim "本包许可为 MIT；若对外发布需复核" now names the actual licence and the notices file |

No source code changed. No behaviour changed.

### Licensor and contact

Both values came from the person during the run: licensor `NorthGod`, commercial contact `northgod@qq.com`. No placeholder is left in any file; `<LICENSOR NAME>` and `<CONTACT>` do not occur.

### Verbatim licence text

Downloaded from the canonical source behind https://polyformproject.org/licenses/noncommercial/1.0.0 (`polyformproject/polyform-licenses`, `PolyForm-Noncommercial-1.0.0.md`): 4563 bytes, LF only, no BOM, sha256 `c0ea4a896d2c8c394b29f9427589996db826cd501c512279ff0ed3ef48fabbe5`. The same bytes are what SPDX redistributes as `text/PolyForm-Noncommercial-1.0.0.txt` (same content, wrapped differently).

Checked against the official page by fetching https://polyformproject.org/licenses/noncommercial/1.0.0, stripping the markup and comparing every sentence of 25 characters or more: one item did not match, the heading line joined to the URL line, which the page renders as a heading and a link rather than one line. Every clause matched.

The file is the header (14 lines) plus the upstream text appended byte for byte; the header is above a rule and alters no clause. `LICENSE` keeps the upstream LF endings and has no BOM.

### File name

`THIRD-PARTY-NOTICES.md`, not `NOTICE`. Apache-2.0 section 4(4) gives a file named `NOTICE` an operative role in redistribution; this repository is not under Apache-2.0, and the content is an informational inventory, so the explicit name states what it is and `.md` matches the repository's other documentation.

## SPDX finding

SPDX does have an identifier: `PolyForm-Noncommercial-1.0.0`, name "PolyForm Noncommercial License 1.0.0", `isDeprecatedLicenseId: false`, `isOsiApproved: false`.

Verified by reading the official list data `spdx/license-list-data` `json/licenses.json` (list version `8791eda`) and filtering `licenseId` for `PolyForm*`, which returns `PolyForm-Noncommercial-1.0.0` and `PolyForm-Small-Business-1.0.0`. So the `license` field carries the identifier, not `SEE LICENSE IN LICENSE`.

## Dependency licence survey

### Root workspace

Command: `pnpm licenses list --json` (pnpm 8.6.10) in the repository root. It reads `pnpm-lock.yaml` and covers the whole installed tree, dev dependencies included.

Output summary: 131 packages. MIT 101, Apache-2.0 12, ISC 9, BSD-2-Clause 6, BSD-3-Clause 2, BlueOak-1.0.0 1.

No copyleft (GPL, LGPL, AGPL, MPL) and no unknown licence in this tree.

### video/

`video/` is a separate npm project: it has `package-lock.json` and no `pnpm-lock.yaml`, so `pnpm licenses list --json` there fails with `ERR_PNPM_LICENSES_NO_LOCKFILE`. The survey instead read the `license` field of every `package.json` under `video/node_modules/`, walking nested `node_modules` too.

Output summary: 351 packages. MIT 269, ISC 22, Apache-2.0 20, BSD-2-Clause 13, BSD-3-Clause 7, `SEE LICENSE IN LICENSE.md` 6, MPL-2.0 4, no `license` field 2, `Remotion License` 2, Unlicense 2, Python-2.0 1, CC-BY-4.0 1, BlueOak-1.0.0 1, 0BSD 1.

Flagged, all in `video/` only:

- MPL-2.0 (file-level copyleft): `mediabunny` 1.62.0, `@mediabunny/aac-encoder` 1.62.0, `@mediabunny/flac-encoder` 1.62.0, `@mediabunny/mp3-encoder` 1.62.0, reached through `@remotion/media`.
- No `license` field: `@remotion/compositor-win32-x64-msvc` 4.0.539, `@remotion/media` 4.0.539. Both name the Remotion monorepo as their repository.
- Remotion License, not an OSI-approved licence and tiered by entity size: `remotion`, `@remotion/cli`, `@remotion/bundler`, `@remotion/player`, `@remotion/renderer`, `@remotion/web-renderer` declare `SEE LICENSE IN LICENSE.md`; `@remotion/sdk`, `@remotion/studio-protocol` declare `Remotion License`. Free for individuals, for-profit organizations up to 3 employees, non-profits and evaluation; a company licence above that size.
- Data and other non-MIT terms: CC-BY-4.0 `caniuse-lite`, Python-2.0 `argparse`, Unlicense `fs-monkey` and `memfs`, BlueOak-1.0.0 `minimatch`, 0BSD `tslib`.

### ZCode verbatim entry

`THIRD-PARTY-NOTICES.md` section 1 records, as a fact and without advice, that the dialect reproduces ZCode 3.17.1 prompt text word for word, that rights in it belong to its publisher, and that it is not covered by this repository's licence. It names the mirror files, the gate `scripts/check-verbatim.mjs`, the archive `docs/reference/zcode-verbatim.md`, and that the gate's one reference `reference/zcode-3.17.1/zcode.cjs` is not distributed.

Publisher: the entry names **Z.ai** (formerly Zhipu AI). The brief for this run said ByteDance. The repository's own evidence disagrees: `docs/FACTS.md` section 4 records the upstream as `zai-org/ZCode` (Apache-2.0), the channel talks to `zcode.z.ai` and `open.bigmodel.cn` (BigModel is Z.ai's platform), and the vendor's own documentation at `zcode.z.ai` presents ZCode as Z.ai's. The notices file therefore names Z.ai. If the person wants a different rights holder named, that is a one-line change in section 1.

## Bundle manifests

Both `packages/glm/package.json` and `packages/hourness/package.json` already carried `"license": "MIT"`, so both were updated. Left at MIT they would have granted MIT over the same code the root licence restricts.

## Gates

Run one at a time, in order, on the committed tree.

| Gate | Exit code |
| --- | --- |
| `npm run build` | 0 |
| `npm run preflight` | 0 |
| `npm test` | 0 |

`npm test` includes the verbatim gate, the checker gates and the secret scan; all passed with the new files in place.

One earlier `npm test` run exited 1 on `tests/graph-render.spec.ts` ("docs/graph/graph.svg is stale"). Cause: the parent session wrote `docs/graph/nodes/schedules.json` and re-rendered `graph.svg` while the suite was running. Not related to these files; the spec passes on its own and in the full suite afterwards, and `docs/graph/` was not written by this run.

## Commits

| SHA | Subject |
| --- | --- |
| `15dc9e2246233280c9058c25ee74541d731bd343` | docs: PolyForm Noncommercial 1.0.0 and the third-party notices |
| `252680883f54a576c6db6e5eb0513e2cfb50c716` | chore: the license field is PolyForm-Noncommercial-1.0.0 in every manifest |

Pushed to Gitee `origin/main`, `08f3db2..2526808`, fast-forward, no force.

## Still for the person

1. Confirm the rights holder named in `THIRD-PARTY-NOTICES.md` section 1 for the ZCode text (written as Z.ai; the brief said ByteDance).
2. Decide whether `video/package.json` should carry the repository licence at all. It is a private, unpublished project and previously declared `UNLICENSED`; it now declares `PolyForm-Noncommercial-1.0.0` for consistency with the rest of the repository.
3. If outside contributions are ever accepted, a DCO or CLA is needed before the licence can be changed again (recorded on `d-license-polyform`).
4. `msg-refdir-gate.txt` and a root `package-lock.json` are untracked in the working tree and were left alone; the repository uses pnpm.
