# ZCode baseline drift audit: installed bundle vs pristine 3.17.1

2026-11-11, lane `zcode-drift` (branch off main 78d01651, worktree clean at start). Read-only audit of the installed ZCode bundle; the pristine copy `reference/zcode-3.17.1/zcode.cjs` stays authoritative pending a person's decision.

## 1. What the desktop actually runs

- The ZCode desktop app (`C:\Program Files\ZCode\`, publisher 智谱华章) is the harness that ships and runs the bundle. Its bundled skills live in `resources\glm\packages\` and the running agent loads them from there (observed in the live session's skill paths). App version: **3.18.0** (`resources\app.asar` → `package.json`, `"name": "@zcode/desktop", "version": "3.18.0"`).
- The agent bundle it runs: **`C:\Program Files\ZCode\resources\glm\zcode.cjs`** — 15,670,610 B, MD5 `09a364f6b2ff132ad39bb6cabc3c372f`, mtime 2026-11-11 01:23. The bundle itself carries no version constant (it reads the host-injected `__ZCODE_VERSION__` global, default `"0.0.0-dev"`), so the effective version is the desktop's 3.18.0.
- Auto-update trail on disk (user keeps `.bak` of each upstream copy before patching): `zcode.cjs.orig-3163.bak` (Oct 26) → `orig-3171.bak` (Oct 29, 15,405,921 B — same size as our pristine copy) → `orig-3172.bak` (Nov 2) → `orig-3180.bak` (Nov 10 21:15, 15,664,893 B, MD5 `572c763b983d274eee60164b60776a19`). The auto-update moved the baseline **3.17.1 → 3.18.0** on 2026-11-10.
- The current `zcode.cjs` is the upstream 3.18.0 copy **plus a user functional patch** (+5,717 B, 11 hunks — see §4). So there are two deltas to attribute: upstream (3.17.1→3.18.0, `orig-3180.bak` vs pristine) and user patch (installed vs `orig-3180.bak`).
- The DeepSeek Harness desktop (`%LOCALAPPDATA%\Programs\DeepSeek Harness\`, DSH 0.2.2-rc.1, hostProtocolVersion 4, updater channel `nightly`, feed `download.deepseek.com/dsh-desk/feeds/win-x64/`) ships **no** ZCode bundle: its `app.asar` (22,102 entries) has zero `zcode`/`glm` paths, and `app.asar.unpacked\dsh\node_modules\@deepseek-ai\` holds only `dsh-session-log-export` and `libreoffice-kit`. `dsh/desktop-runtime.json` references no zcode provider either.

## 2. Method

Ran the repo's own verbatim item set — `scripts/check-verbatim.mjs` `loadItems()` (502 items: mirror-file literals from `zcode-text.ts`/`zcode-tool-text.ts`/`zcode-harness-text.ts`/`zcode-memory-text.ts`/`zcode-compact-text.ts`/`zcode-notice.ts`/`zcode-wire.ts`, plus `verbatim.ts` constants, `compact.buildCompactPrompt`, `CONTEXT_MANAGEMENT_DSH`, alias descriptions, start-plan stable/dynamic sections) — line by line (MIN_LINE 13, rendered Harness bullet split into its two bundle pieces, JS escapes unescaped) against three bundles:

1. `reference/zcode-3.17.1/zcode.cjs` (pristine pin; MD5 verified `331AB13D0CB2E9504EA25420FF9AE663`)
2. `zcode.cjs.orig-3180.bak` (upstream 3.18.0 as auto-updated)
3. `zcode.cjs` (installed, user-patched — what actually runs)

The repo gate itself still passes on this worktree: `node scripts/check-verbatim.mjs` → OK, 502 verbatim, 0 known deviations, 301 lines checked (sanity that the audit harness equals the gate).

Result: **500/502 items unchanged in all three bundles; 2 items moved upstream; 0 items touched by the user patch.**

## 3. Per-section results

| Section (DESIGN.md §5.9 / zcode-verbatim.md) | Result | Evidence (installed line = pristine line) |
| --- | --- | --- |
| CLI prefix (`You are ZCode, an interactive agent`) | unchanged | installed:14360 = pristine:14277 |
| Identity openings (style/plain, bundle `aGa`/`sGa`, 3.17.1 `pBa`/`dBa`) | unchanged | installed:14363 = pristine:14280 |
| Security notice OFFICIAL (3.17.1 `nBo`) | unchanged | installed:14363 = pristine:14280 |
| Harness block (3.17.1 `SDn`, both system-turn branches, ` - ` bullets) | unchanged | installed:14360 (`P4n`) = pristine:14277 |
| Identity assembly `[["",opening,"",notice].join("\n"),"",harness].join("\n")` (3.17.1 `fBa`/`wDn`) | unchanged, same shape | installed:14363 (`cGa`) |
| Context management (3.17.1 `IBo`) | unchanged | installed:14443 = pristine:14368 |
| Dynamic Behavior (3.17.1 `TBo`) | unchanged | installed:14443 = pristine:14368 |
| Memory section lines (`buildMemoryContent` mirror) | unchanged | (mirror items, present in all three) |
| ToolSearch / LocalToolSearch description, query forms, announcements, loaded/already-loaded/no-match reminders, DeferredToolCall description | **moved (2 literals, example text only)** — see below | installed:2358–2374 vs pristine:2251–2265 |
| Todo reminder body + echo header | unchanged | installed:14666/14667 = pristine:14587/14588 |
| Compact prompt (63 lines incl. closing REMINDER) | unchanged | installed:14473–14476 = pristine:14401 |
| Compact continuation `Bxt` (opening sentence, transcriptPath sentence, options) | unchanged | installed:14455 (`eEt`) = pristine:14380 (`Bxt`) |
| `formatCompactSummary` (`<analysis>` strip, `Summary:` rewrite, blank-run collapse) | unchanged, byte-identical logic | installed:14452 (`Q1t`) = pristine:14377 (`jxt`) |
| Read/Write/Edit/Glob/Grep/Bash/TodoWrite descriptions & schemas (mirror lines) | unchanged | (mirror items, present in all three) |

### The two upstream moves (both cosmetic example swaps inside the LocalToolSearch description)

1. Query-form example line (pristine:2251 → installed:2360):
   - 3.17.1: `- "select:TodoWrite,mcp__byob__browser_navigate" — fetch these exact deferred tools by name`
   - 3.18.0: `- "select:TaskStop,mcp__byob__browser_navigate" — fetch these exact deferred tools by name`
2. Trailing example block (pristine:2265 → installed:2374):
   - 3.17.1: `Example (TodoWrite is deferred and already loaded):` + `<example>` + `DeferredToolCall({"name":"TodoWrite","input":{"todos":[{"content":"Inspect the implementation","status":"in_progress","priority":"high"}]}})` + `</example>`
   - 3.18.0: `Example (TaskStop is deferred and already loaded):` + `<example>` + `DeferredToolCall({"name":"TaskStop","input":{"task_id":"<task_id returned when the task started>"}})` + `</example>`

Everything around them is byte-identical: the shared description template (opening, deferred-tools paragraph, result format, query forms, regex disclaimer, `+slack send` line), local added/available-again/removed announcements, loaded and already-loaded reminders, no-match text, DeferredToolCall description. The swap of the "deferred and already loaded" example from TodoWrite to TaskStop suggests upstream reclassified TodoWrite out of the deferred set (inference — not verified against a tool registry in the bundle).

## 4. The user patch on the installed copy (11 hunks, +5,717 B, all functional)

- Agent tool input schema gains a `model` param (subagent model selection resolved against the live model catalog) and the launch path resolves it (`__zcodePatchCallModel`), plus model-override plumbing.
- Security-notice runtime swap: `v9o()` returns `globalThis.__ZC_DECL` (the user engineering-environment declaration, same text as our SECURITY_NOTICE_USER) instead of the official `y9o` whenever `__ZC_PID` (set to `model.providerId`) does not contain `start-plan`; start-plan products keep the official notice and additionally get an "Engineering Environment Notice" section appended (hunk 5). The official text stays in the bundle unchanged — our start-plan/coding-plan two-tier design is unaffected.
- MCP server-list revision sync (`__zcodeMcpSync`).
- Transient-error retry classifier extended: Chinese provider-busy messages, rate-limit/overloaded strings, `providerCode` field.
- A non-claude model check in one selection path.

None of these touch any audited verbatim section (the audit's third column confirms: all 502 items present in the installed copy).

## 5. Verdict

**The 3.17.1 pristine pin remains valid; no re-baseline follow is warranted now.** Upstream 3.17.1→3.18.0 moved exactly two example literals in the LocalToolSearch description — an illustration-tool swap (TodoWrite→TaskStop), no structural or functional text change; every section our dialect sends (identity header, context management, dynamic behavior, tool-face announcement/reminder text, todo reminder, all three compact texts, memory lines, tool descriptions) is byte-identical between what 3.17.1 pins and what the desktop actually runs.

Recommendation (person decides; this is advisory): keep `reference/zcode-3.17.1/zcode.cjs` as the authoritative pin and gate reference. Optionally schedule a low-priority follow (precedent `zcode-3171-follow`) to update the two example literals in `src/toolsearch/zcode-text.ts` to the 3.18.0 wording when convenient — it is cosmetic and affects only the description's illustrative examples, so it does not justify re-pinning the whole baseline. Re-check again if the desktop updates past 3.18.x into a release that touches the sections in §3.

Caveats:

- The installed copy is user-patched; per repo rules it stays a mechanism reference only, never a verbatim source. This audit used the user's own upstream snapshot (`orig-3180.bak`) to attribute deltas cleanly.
- Version string: the bundle has no embedded version; "3.18.0" is the desktop app version (`app.asar` `package.json`) corroborated by the `.bak` naming series. The `orig-3171.bak` equals our pristine copy's size, tying the series to 3.17.1.
- Not audited here (out of the audited set): the deferred/resident tool registry contents, tool schemas re-derived from zod, and workflow actor identity (`kDn`) — the first two are covered indirectly by the unchanged mirror items, the third is not sent by this project.
