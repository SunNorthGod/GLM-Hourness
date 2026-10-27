# Desktop dialect triage handoff (2026-10-27 15:10)

## Symptom

Desktop DSH (0.2.1-rc.3, Electron) loads all six GLM-Hourness rows from
`~/.dsh/profiles/desktop/cordis.patch.yml`, but glm sessions keep the stock
DSH identity ("You are an AI agent powered by DeepSeek Harness...") instead
of the ZCode dialect. Headless (`node --import tsx/esm apps\cli\src\bin.ts
headless --patch .llm/dsh-trial/hourness-rows.yml "..."` from
reference/deepseek-harness, GLM_API_KEY from ~/.dsh/.credentials.yaml) shows
the dialect correctly in every run.

## What is proven working (do not re-litigate)

1. Rows load and activate on desktop. Evidence: usage metering
   (.llm/audit/usage.jsonl) records every desktop glm call since 14:11;
   dialect-init log (.llm/audit/dialect-init.jsonl) shows agent/created and
   agent/pre-step events from the desktop process; no activation errors.
2. `systemPrompt.context` dynamic registration does not throw on desktop
   (no error lines in the log; catch would record `error: ...`).
3. Upstream (reference repo) semantics: `agent/pre-step` is agent-scoped,
   payload carries `modelSelection`; upstream assembles the system prompt
   AFTER pre-step. The desktop rc build differs — see root cause.

## Root cause (narrowed, final step pending)

The desktop rc build hands plugins EMPTY model-route info at every hook we
can see:

- `agent.model?.current()` → `{}` (no provider, no model) at created and pre-step.
- `agent/pre-step` payload `modelSelection` → also empty for the main chat
  agent (session-title agents DO carry provider=glm; they initialize fine).

Yet the desktop's own assembled system message (8684 chars, session files
confirm) contains "You are a coding agent powered by the glm-5.3 model" —
the desktop KNOWS the model at assembly time and reads it from some field we
have not found yet. Note the assembled text also lacks the upstream
`# Harness` section, so the rc build's assembly is its own variant; the
team:policy/team:identity scoped sections DO appear in it, so scoped
section/context registration is honored.

Consequence: our dynamic contexts register fine but their `text()` gate
`isGlm(route)` always sees an empty route → resolves to '' → dialect never
appears. This explains everything, including why headless (route populated)
always works.

## Current dist state (all tests 98/98, tsc 0)

src/glm-prompt/index.ts carries, in order of importance for this triage:

- `installPromptContexts` — dynamic `systemPrompt.context` per section with
  `text: () => isGlmAgent() ? section.text : ''`; falls back to static
  `section()` when `context` is unavailable.
- `initAgent`/`initAgentInner` — created + pre-step:scoped (per-agent
  `agent.ctx.on`) + pre-step:global triple coverage, idempotent via
  `initialized`/`promptInstalled` WeakSets, whole thing wrapped in try/catch.
- `isGlm` — accepts `provider === 'glm'` OR `model` starting with 'glm'.
- **Diagnostic dump just added, one round of data pending**: every log line
  now carries `agent: {...}` — all own enumerable fields of the agent object
  whose key matches model/route/provider/option/preset (plus non-object
  values). Log path default is absolute:
  `C:/Users/29596/Desktop/Project/GLM-Hourness/.llm/audit/dialect-init.jsonl`.
  dist was rebuilt at ~15:06 with this dump.

## Next step (single decision point)

1. Have the desktop fully restarted and one glm message sent, then read the
   last lines of `.llm/audit/dialect-init.jsonl`. The `agent` dump will show
   where the rc build keeps the model/route (candidates: `options`,
   `preset`, some `route` field).
2. Wire `isGlmAgent`/`initAgent`'s route source to that field. If the field
   is also empty at created/pre-step but only filled at assembly, the
   remaining seam is making the dynamic `text()` read the same source the
   rc identity section reads (find it in the desktop's bundled
   implementation; the app is Electron with most dsh packages inside
   `resources/app.asar` — only 3 packages are in app.asar.unpacked; reading
   asar requires extracting or string-searching the asar file).
3. After the dialect lights up: remove the diagnostic default log path
   (config.initLogPath stays as the supported knob), the agent dump, and
   reconsider whether the absolute-path default belongs in the row.

## Key files

- Package: C:\Users\29596\Desktop\Project\GLM-Hourness (rows:
  dist/glm-prompt, dist/toolsearch, dist/guard, dist/memory, dist/workflow,
  dist/ui)
- Profile: ~/.dsh/profiles/desktop/cordis.patch.yml (six insert entries,
  absolute dist paths)
- Trial patch (headless): .llm/dsh-trial/hourness-rows.yml
- Logs: .llm/audit/dialect-init.jsonl (init decisions + agent dump),
  .llm/audit/usage.jsonl (metering, healthy)
- Session inspector scripts: scripts/check-system-message.cjs (takes session
  id prefixes), scripts/inspect-session-types.cjs
- Progress ledger: .llm/docs/s1-progress.md (Rounds 1-21; Round 21 describes
  the earlier pre-step timing theory — superseded by the empty-route root
  cause above; update the ledger when resolved)

## Environmental notes

- Desktop sessions live in ~/.dsh/sessions/<workspace-slug>/<session>/ as
  session.v4.jsonl.zstd; multi-frame zstd, decompress by scanning magic
  28 B5 2F FD (see scripts). system/message events DO contain the full
  assembled system prompt — this is how the 8684-char text was verified.
- Host shell guard blocks redirections/pipes/$env: writes outside the
  workspace; bare commands and the write/edit tools work. Writing outside
  the workspace requires a per-request human approval (auto-rejected here).
- Desktop restarts load fresh dist (confirmed: dist edits after a restart
  appear only after the next full restart; reopening windows is not enough).
