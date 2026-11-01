# Code review, zcode-3171-follow, pass 1

Scope: `git diff main...HEAD` on branch `zcode-3171` (merge base 9904f71, 14 commits 9acdb07..eaed98d) against the task brief, `plan.md` (steps 1-9 and the orchestrator decisions D-1, D-2, D-3) and `diff.md`. Blocking standard: docs/DEVELOPMENT.md §1.1 (acceptance not met; irreversible loss without prevention; failure that cannot be detected, recovered or traced). Plan step 10 (graph), the L3 probe, the sandbox real request and L4 are out of scope for this pass.

blockingCount: 0

## Evidence

Gate results, read from the commit messages (suites not rerun): every commit records `npm run build` ok, `npm run preflight` ok, `npm test` ok. Final two commits: check-verbatim OK against `reference 3.17.1`, 489 items, 0 known deviations, 292 lines; eslint, knip, jscpd, check-secrets, 661 spec cases, 0 fail, graph smoke. Worktree clean at eaed98d.

Texts checked against `reference/zcode-3.17.1/zcode.cjs` (read directly, not via the gate):

- CLI prefix `uBa`, identity openings, Harness `SDn(e=!0)` with the two system-turn branches and the ` Hooks may intercept ...` tail, identity join `fBa`: match `verbatim.ts`, `zcode-harness-text.ts` and the start-plan `stableSections[0]` (leading newline, mid branch).
- Dynamic Behavior `TBo` (`[y3a,v3a,b3a].join("\n")`, no heading) and Context management `IBo` (`[S3a,w3a].join("\n")`): match `DYNAMIC_BEHAVIOR`, `CONTEXT_MANAGEMENT_DSH` and the sidecar dynamic sections, single-newline joins included.
- Section order in `ContextBuilder.build`: identity, desktop context, `TBo`, session guidance, memory, env/model, `IBo`; `T3a` puts stable before dynamic. `glm:dynamic-behavior` right after `harness:identity` and ahead of session guidance matches that position (D-2).
- Environment `hSo`: invoked line with trailing space, ` - ` bullets, raw boolean git flag, `Additional working directories` after the git line, untrusted-files bullet last. Matches `buildEnvInfoSection`.
- Read partial view `E0a`/`sSo`/`aSo`/`cSo` and `M_t` (notice, one `\n`, body): matches `readPartialViewNotice` and `renderReadWindow`; the coder's correction of diff.md (one newline, not two) is right.
- Tool-search announcement `G_t`: MCP/session split for re-added names; removed order MCP gone (summary above 30), session gone (always listed), hidden (summary above 30), then `v_a`; paragraphs joined by `\n`. Matches `renderToolSearchAnnouncement`. Hidden names use `agent.ctx.tools.get(name, agent)`, the same lookup DeferredToolCall already uses.
- Todo counting `nUa`: skips an assistant message whose content is all reasoning and has no tool calls; DSH tool calls are content blocks, so `reasoningOnly` is equivalent.
- Project-token `KAr`, `j2`, `WG`, `Zht` request function and the resolve catch: codes, transient/HTTP split, invalid-JSON mapping and catch precedence match `project-token.ts`. No consumer of the old `http_<status>` message exists.
- Session features `Uft`/`GXs` (pattern `^[a-z0-9_]{1,64}$`, cap 256, sorted unique, between query source and session id), `pP` values, `yTo` (step exposure, local mode gives `tool_search_local`), `vTo`/`bTo` (successful tool-search result gives `tool_search_called`): match `headers.ts`. Flags without a trigger on this channel are never set; in-process persistence, title-before-first-step and start-plan without the header are recorded in DESIGN.md §4.8 (D-1).

Requirements:

- SECURITY_NOTICE_USER: byte-identical between main and HEAD (1655 chars); coding-plan still selects it.
- Gate: `loadReferences()` reads only `<referenceDir()>/zcode-3.17.1/zcode.cjs`; `ZCODE_BUNDLE`, the install path and `collectSource` are gone; no other reader of the install directory or `reference/ZCode` remains in scripts, tests or src. `systemTurnPieces` splits only the two rendered system-turn lines into branch and tail, both of which are bundle substrings; no other line is relaxed.
- D-3: compact section 6 sentence, Bash ` for a foreground command` (line and schema), field-prompt sentence, todo reasoning-only skip, project-token codes, env and session-guidance bullets are in; `BASH_COMMAND_OUTPUT_LINE` is mirrored (gate-checked) but filtered out of `bashDescription`, recorded in DESIGN.md §5.4 and HANDOFF §5.9.
- Start-plan sidecar in the main checkout changed together with `ZCODE_SYSTEM_TEXT`; the 3.16.3 original is backed up at `.agents/tasks/zcode-3171/zcode_system.3.16.3.json`, so the change is reversible.
- Docs listed in diff.md §9 (AGENTS.md baseline clause, zcode-verbatim.md, DESIGN.md, FACTS.md, DEVELOPMENT.md, CHARTER.md, README.md, ROADMAP.md, HANDOFF.md) and the package description and locale titles state 3.17.1; superseded clauses are rewritten.

## Blocking findings

None.

## Non-blocking

1. plan.md has no added step for D-1 as the decision text asks; the substance (own commit 070c09d, L2 tests in glm-transport and glm-zcode) is there, and the sandbox header-order check belongs to the later real-request step.
2. `scripts/probe/run-probe.mjs:873` still labels its check "ZCode 3.16.3 descriptions"; the asserted prefix is unchanged in 3.17.1, so only the label is stale.
3. The branch is 9 graph-only commits behind main (172136c); no code overlap, a rebase is needed before merge. Per graph comment of 2026-10-29T20:36, main's `tests/glm-startplan.spec.ts` compares against the already-updated sidecar and stays red until this branch merges.
