# Implementation plan: compact-recall (option C, read the original after compaction)

Worktree: `C:\Users\29596\Desktop\Project\GLM-Hourness\.worktrees\compact-recall`, branch `feat/compact-recall` from `main` at `09ec733`. Every path below is relative to the worktree unless it starts with a drive letter. Relative paths in shell commands must be run with the worktree as the working directory; otherwise they land in the user's checkout.

Input: `.agents/tasks/compaction-recall/report.md` (sections 6 C, 7, 8). Decision taken by the person: option C, sentence verbatim from ZCode 3.17.1, plaintext export under the project's `.llm/`, read with Read, no new tool, no other sessions, no official session-search bundle, shipped disabled.

## 0. Decisions

| Item | Decision | Reason |
| --- | --- | --- |
| Row or switch | New host row `glm-hourness/transcript` in the orchestration package `dsh-hourness` (module `data/transcript-row`), `disabled: true` in `packages/hourness/cordis.patch.yml`. It provides the cordis service `glmHournessTranscript`. The existing `glm-compact` row reads that service lazily with `ctx.get` and appends the sentence only when the service exists and reports a written file. | The export needs the project root and the `.llm/` ignore guarantee, which live in `src/data/project-root.ts`, `src/data/project-home.ts` and `src/data/llm-ignore.ts` (orchestration package). The package boundary (eslint.config.js:39-41, generated from scripts/packages.mjs) forbids `src/glm-prompt/` importing `src/data/`. Cross-package contracts go in `src/shared/` (DESIGN.md §8: tool-names, dialect, pricing). A config switch on `glm-compact` would need that code in the GLM package: either moving project-root into `src/shared/` (a refactor against project-home.ts's stated placement) or duplicating it (jscpd). |
| Shipped behaviour | With the row disabled the service is absent; `glm-compact` output is byte-identical to today. A GLM-only install (`probe-glm`) never gets the sentence. | Off by default (AGENTS.md rule 4); fail-open by absence. |
| Session read | `ctx.sessionQuery.filterEvents(sessionId, [])`, read through `ctx.get('sessionQuery')` at export time, no `inject`. | Official API kept by the trim proposal (report §3); one log load returns every event's first-party semantic text in seq order; live-preferred, so no flush. `readSession`/`listEvents` are proposed for deletion, `snapshotEvents` is deprecated, incremental `session/event` writing would copy every GLM session to disk even without compaction and miss events from before a restart. |
| Which session | Only `options.sessionId` of the GLM compaction request (compaction-basic sets it to `agent.session.id`). | "Do not read other sessions." |
| Export path | `<project data dir>/transcripts/<sessionId>.txt`, absolute, OS separators. Project data dir = `projectHomeFor(ctx, config.home, cwd)` (src/data/project-home.ts): row `home` > `<project root>/.llm` of the session cwd > data service `projectHome`. cwd = `agents.get(sessionId)?.session.header.cwd`. Session id must match `/^[A-Za-z0-9_-]{1,128}$/`, else skipped. | Same resolution the journal readers use; row `home` lets the probe point it at the scenario directory. The id check prevents path traversal. |
| Ignore guarantee | When the data dir's basename is `.llm`, call `ensureLlmIgnored(dirname(dir))` first; write only when the outcome is `ignored` or `no-git`, otherwise skip with the outcome's reason. An explicit `home` not named `.llm` (probe, tests) is only created. | Same guarantee every `.llm` writer has (info/exclude + `git check-ignore`); a visible plaintext copy is never written. This repo's own `.gitignore:3` is `.llm/`. |
| Format | Plain UTF-8 text, LF. Four header lines, then one entry per document: a heading line `=== #<seq> <kind> <ISO time>`, the document text, one empty line. Lines longer than 1000 code points are split into lines of at most 1000 code points (no surrogate pair split). Kinds: `user/message` → `user`, `assistant/message` → `assistant`, `tool/call` → `tool call`, `tool/result` → `tool result`, `todo/write` → `todo`, `turn/end` → `turn end`, any other type → the type string. All documents kept, no de-duplication. | Read pages by line (`offset`/`limit`, native window 2000 lines and 50 KB, lines over 2000 UTF-16 units are truncated: rc.3 dsh-tool-fs lib/index.js:17, :19, :28-29, :212). Bounded lines lose nothing to truncation; the byte cap ends a window with the partial-view notice and the next offset (read-alias.ts header). Headings are greppable by seq and kind. Keeping every document avoids relying on an unverified relation between `tool/call` events and assistant tool-call blocks. |
| Header lines (exact) | `Transcript of session <sessionId>, exported <ISO time> when the conversation was compacted.` / `Entries are the session's messages, tool calls and tool results up to that point, oldest first, as plain text; reasoning and images are left out.` / `Each entry starts with a line "=== #<seq> <kind> <time>". Lines longer than 1000 characters continue on the next line.` / empty line | Project text, not a ZCode claim. |
| Overwrite | One file per session; each compaction rewrites it with the full log up to that moment (`writeFile`). | A later export contains every earlier one. |
| Cleanup rule | After each successful write, the row deletes files in the same `transcripts/` directory whose name matches `/^[A-Za-z0-9_-]{1,128}\.txt$/`, other than the file just written, whose mtime is more than 14 days old (`TRANSCRIPT_KEEP_DAYS = 14`). Other names are never touched. Failures are counted into the row health reason. | Bounded by activity, no new hook. A session idle for 14 days loses its file; if it resumes, Read reports a missing file and the next compaction writes it again (discoverable, recoverable). |
| Sentence | Appended by `formatSummaryStream` after the formatted summary, only when that summary is non-empty: `summary + transcriptNote(path)`. Lands inside DSH's `<compacted-summary>` frame. | Decided placement; empty summary still fails loud. |
| Contract pin | No new dependency. Structural types in `src/shared/dsh-min.ts` with evidence in DESIGN.md §2.4a; the L3 probe exercises the real rc.3 runtime. | DEVELOPMENT.md §11 rule 4 and DESIGN.md §8: a new dev dependency (the official `@deepseek-ai/dsh-session-query` types) needs the person's approval. Optional follow-up, see Unverified. |

## Section 7 answers

1. **Can the model read other sessions of the same workspace?** No, by construction. The export reads one session: `filterEvents` is called with the compaction request's `sessionId`, which compaction-basic sets to the compacting agent's own session (`reference/deepseek-harness/packages/compaction/compaction-basic/src/summarizer.ts:159` `sessionId: agent.session.id`, `:160` `purpose: 'compaction'`); `glm-compact` only acts on GLM compaction copies (`src/glm-prompt/compact-row.ts` `withZcodeInstruction`, `options.purpose !== 'compaction' || !isGlmModel(options.model)`). No tool is registered and the official session-search bundle is not used. A fork's own log contains its inherited prefix (`SessionLogSnapshot.inheritedEventCount`, session-query types.d.ts:40), which that session's model already saw. Residual: export files of other sessions of the same project sit in the same `.llm/transcripts/` directory, so the model's ordinary file tools can reach them like any other project file (listed under Unverified/risks; no code reads them).
2. **Is one more plaintext copy of the session on disk acceptable?** Accepted by the decision, with the conditions met in code: the DSH original is zstd-compressed JSONL (`reference/deepseek-harness/packages/session/session-persistence-jsonl/src/index.ts:69` `DEFAULT_COMPRESSION = 'zstd'`, report §2.6), so the export is the only plaintext copy. It is written only under a git-ignored `.llm/`: this repository's `.gitignore:3` is `.llm/`; for any project `ensureLlmIgnored` (`src/data/llm-ignore.ts:84`) appends `.llm/` to `<git dir>/info/exclude` and verifies with `git check-ignore -q .llm/scratch/x` (`src/data/llm-ignore.ts`, function `once`, constant `LLM_IGNORE_PROBE`), and the export is skipped unless the outcome is `ignored` or `no-git`. Cleanup: 14-day rule above. Content includes tool output (file contents, possible secrets) exactly as the session log does.
3. **Should recall stay inside the ZCode 3.17.1 tool face and text?** Yes. The sentence is the 3.17.1 continuation text (`reference/zcode-3.17.1/zcode.cjs:14384`, inside `Bxt` at `:14380-14389`), checked by the verbatim gate from a mirror file; the reading tool is Read, the ZCode name over the rc.3 native `read` (`src/glm-prompt/read-alias.ts` header). Two known differences: the sentence sits inside DSH's `<compacted-summary>` frame (`summarizer.ts:188` `frameSummary`; `compact-row.ts` header: "the checkpoint framing stay[s] with compaction-basic"), not in ZCode's "This session is being continued…" message; and 3.17.1's production call `Bxt(Oe,{preservedMessagesKept:k.length>0,suppressFollowup:!0})` (`zcode.cjs:14730`, report §5) never passes `transcriptPath`, so the text is verbatim but not observed in ZCode production traffic.
4. **Is the human side already served?** Yes; this task is model-side only. Shadowed rows stay in the chat view (`reference/deepseek-harness/packages/client/ui-chat/src/client/chat/CompactionItem.tsx:1-2`); `Copy Session as Markdown`, `Download session log` and `/export` read the raw log (`@deepseek-ai/dsh-session-log-export`, mounted at `reference/dsh-desktop-0.2.1-rc.3/dsh-web-app/cordis.patch.yml:75-76`). Desktop presence is inferred (report §1.3, §8), not checked in this run (desktop not used).

No question needs the person.

## DSH contract

| Interface / field | Used for | Official `.d.ts` (rc.3) | rc.3 runtime |
| --- | --- | --- | --- |
| `Context.sessionQuery: SessionQueryEngine` | service read with `ctx.get('sessionQuery')` | `@deepseek-ai/dsh-session-query@0.2.1-rc.3` `lib/types/index.d.ts:23-25` (module augmentation), class `:35` | `reference/dsh-desktop-0.2.1-rc.3/dsh-session-query/lib/index.js:1048` `super(ctx, "sessionQuery")`; base profile mounts the SQLite subclass `dsh-base/cordis.patch.yml:157-158`, `dsh-session-query-sqlite/lib/index.js:476` `class extends SessionQueryEngine`; `openAt: never` only guards search (`:590-597` `_assertSearchEnabled`), `filterEvents` is not overridden |
| `filterEvents(sessionId: SessionId, filters: readonly SessionEventResultFilter[]): Promise<SessionEventSearchDocument[]>` | the whole log's semantic documents; called with `[]` | `index.d.ts:118` | `lib/index.js:1152-1155`, `:1161-1163` (`buildSessionEventSearchDocuments(sessionId, (await this._corpus.load(sessionId)).events)`); empty filter array keeps every document (`filterSessionEventDocuments(documents, filters = [])`, `:669`); materialize accepts an empty array (`assertArray`, then `map`) |
| `SessionEventSearchDocument extends SessionEventRecord { text: string }` | rendered entries | `types.d.ts:210-212` | `lib/index.js:614-631`: one document per event with non-empty text, ascending seq |
| `SessionEventRecord.sessionId`, `.seq: SessionSeq`, `.type: SessionEventType`, `.time: number` (epoch ms), `.surface: SessionEventSurface` | heading `#<seq> <kind> <time>`; `surface` not rendered | `types.d.ts:45-55`; `SessionEventSurface = 'current' \| 'shadowed' \| 'log-only'` `:12` | same object literal `:620-627` |
| Text extraction per type | what the export contains | `extractSessionEventText` exported, `index.d.ts:18` | `lib/index.js:545-565`: `user/message` content text, `assistant/message` text and tool-call blocks (name + arguments, reasoning excluded), `tool/call` name + arguments, `tool/result` content text + error name/code, `todo/write`, `turn/end`; structural and unknown types give `''` and are dropped |
| `SessionId` (branded string), `SessionSeq` (branded number), `SessionEventType = keyof SessionEventMap` | structural types use `string` / `number` / `string` | `@deepseek-ai/dsh-session@0.2.1-rc.3` `lib/types/types.d.ts:6`, `:14`, `:256`, `:436`; event data `:295` user/message, `:331` assistant/message, `:355` tool/call, `:375` tool/result | — |
| `LlmStreamOptions.sessionId` on the `llm/stream` request | which session to export | pinned by `LlmStreamOptionsContractCheck` against installed `@deepseek-ai/dsh-llm` `GenerateOptions` (`src/shared/dsh-min.ts`) | compaction-basic sets it (`summarizer.ts:159`) |
| `agents.get(id)?.session.header.cwd` | session working directory | none installed | `AgentsService.get` (agent:596) and `SessionLike.header.cwd` already in `src/shared/dsh-min.ts`; same read as `sessionHeaders` in `src/glm-llm/index.ts:78-83` |
| `ctx.get(name)` / `ctx.provide(name, value)` | lazy service reads, provide `glmHournessTranscript` | cordis 4.0.5 (installed) | `ServiceLookup`, `ProvideHost` in `src/shared/dsh-min.ts`; DESIGN.md §2.4a row for `ctx.get` |

Official `.d.ts` files were read from `npm pack @deepseek-ai/dsh-session-query@0.2.1-rc.3` and `npm pack @deepseek-ai/dsh-session@0.2.1-rc.3` (extracted to `%TEMP%\sq-types-check`, not installed in the repository). Structural type to add in `src/shared/dsh-min.ts`:

```ts
/** One semantic event document (dsh-session-query SessionEventSearchDocument, types.d.ts:45-55, 210-212). */
export interface SessionEventDocumentLike {
  readonly seq: number
  readonly type: string
  readonly time: number
  readonly surface: 'current' | 'shadowed' | 'log-only'
  readonly text: string
}
/** The `sessionQuery` member the transcript row calls (index.d.ts:118; rc.3 dsh-session-query lib/index.js:1152). */
export interface SessionQueryLike {
  filterEvents(sessionId: string, filters: readonly []): Promise<readonly SessionEventDocumentLike[]>
}
```

## ZCode 3.17.1 sentence

Source `reference/zcode-3.17.1/zcode.cjs` (pristine, no CR characters), function `Bxt` at line 14380; the transcript branch spans 14382-14384:

```
14382	${e}`;return t.transcriptPath&&(n+=`
14383	
14384	If you need specific details from before compaction (like exact code snippets, error messages, or content you generated), read the full transcript at: ${t.transcriptPath}`),t.replStateCleared&&(n+=`
```

The appended text is the template literal content: two newlines, then

```
If you need specific details from before compaction (like exact code snippets, error messages, or content you generated), read the full transcript at: ${t.transcriptPath}
```

with `${t.transcriptPath}` replaced by the absolute export path. Mirror file (new, item 2):

```ts
export function transcriptNote(transcriptPath: string): string {
  return `

If you need specific details from before compaction (like exact code snippets, error messages, or content you generated), read the full transcript at: ${transcriptPath}`
}
```

## Commits (in order; each leaves build and tests green)

- [ ] 1. `feat(data): transcript export row for GLM compactions, disabled by default`
      Add the service contract, the export and the row; ship the row disabled.
      Files:
      - `src/shared/dsh-min.ts`: add `SessionEventDocumentLike`, `SessionQueryLike` (above).
      - `src/shared/transcript.ts` (new): `TRANSCRIPT_SERVICE = 'glmHournessTranscript'`; `type TranscriptExport = { kind: 'written', path: string, entries: number } | { kind: 'skipped', reason: string }`; `interface TranscriptService { exportBeforeCompaction(sessionId: string): Promise<TranscriptExport> }` (documented: never rejects); `transcriptService(ctx: ServiceLookup): TranscriptService | undefined`, validating `typeof value.exportBeforeCompaction === 'function'` like `dataService` in `src/shared/data-home.ts:96-100`.
      - `src/shared/health.ts`: append `'transcript'` to `HOURNESS_ROWS` (line 26); not activation-only.
      - `src/data/transcript.ts` (new): constants `TRANSCRIPTS_DIR = 'transcripts'`, `TRANSCRIPT_LINE_MAX = 1000`, `TRANSCRIPT_KEEP_DAYS = 14`, `SESSION_FILE = /^[A-Za-z0-9_-]{1,128}$/`; pure `renderTranscript(sessionId, documents, exportedAt: Date): string` (format in §0); `cleanTranscripts(dir, keepName, nowMs): Promise<{ removed: number, failed: number }>`; `exportTranscript(ctx, config, sessionId, nowMs): Promise<TranscriptExport>` doing, in order: id check; `ctx.get('sessionQuery')` with `typeof filterEvents === 'function'`; cwd from `ctx.get('agents')`; `projectHomeFor(ctx, config.home, cwd)`; `ensureLlmIgnored(dirname(dir))` when `basename(dir) === '.llm'`; `filterEvents(sessionId, [])` (rejection → skipped with the message); render; `mkdir(join(dir, TRANSCRIPTS_DIR), { recursive: true })`; `writeFile`; `cleanTranscripts`. Every failure returns `skipped` with a reason; nothing throws.
      - `src/data/transcript-row.ts` (new): `name = 'dsh-glm-hourness/transcript'` (pattern `src/data/index.ts:33`), config `{ home?: string }` declared the way `src/data/index.ts` / `src/memory/index.ts:53` declare theirs; `apply` provides row health `transcript` (`provideRowHealth(ctx, 'transcript', 'active', …)`) and the service through `ctx.provide`; each call reports per-session health: `active` with path and entry count (and cleanup counts), `degraded` with the skip reason. Activation never throws.
      - `scripts/packages.mjs`: hourness `rows` gets `{ id: 'glm-hourness/transcript', module: 'data/transcript-row' }` after `env`.
      - `packages/hourness/cordis.patch.yml`: new row after `glm-hourness/env`, `name: dsh-hourness/transcript`, `disabled: true`, `config: {}`, comment: what it writes, where, the cleanup rule, and "ships disabled until L3 and L4 (AGENTS.md rule 4)".
      - `packages/hourness/package.json`: exports `"./transcript": "./dist/data/transcript-row.js"` and `"./transcript/locale/*.json": "./locale/transcript/*.json"`.
      - `packages/hourness/locale/transcript/en.json`, `zh.json`: `meta.title` / `meta.description` (pattern `locale/data/*.json`).
      - `tests/data-transcript.spec.ts` (new) and `package.json` `test:2` (append `node --experimental-strip-types tests/data-transcript.spec.ts`). Cases: header lines exact; entries in seq order with `=== #<seq> <kind> <ISO>` headings and the kind mapping; multi-line text kept; a 2500-code-point line becomes 1000/1000/500 and joins back to the original; an astral character at the split point is not split; no output line exceeds 1000 code points; path is `<repo>/.llm/transcripts/<id>.txt` for a cwd inside a temp git repo (tests/git-fixture.ts) and `git check-ignore -q <path>` exits 0; a tracked `.gitignore` with `!/.llm/` gives `skipped` and writes nothing; no project (temp dir outside git without `.llm`, tests/temp-outside-git.ts) gives `skipped`; an id with `..` or `/` gives `skipped`; absent `sessionQuery` and a rejecting `filterEvents` give `skipped` with reasons and the call resolves; a second export rewrites the file; cleanup removes a matching file 15 days old (`utimesSync`), keeps one 13 days old, keeps `notes.md` 30 days old, keeps the file just written; row `apply` provides `glmHournessTranscript` and reports health. Fakes: `sessionQuery` returning documents shaped like rc.3 `buildSessionEventSearchDocuments` output, `agents.get` returning a session header; real temp directories and real git.
      - `tests/contracts.spec.ts`: `ROW_IDS` gets `'glm-hourness/transcript'` after `'glm-hourness/env'`. Any other test that enumerates host rows (for example `tests/status.spec.ts`, `tests/health.spec.ts`, `tests/preflight.spec.ts`) is updated where `npm test` shows it.
      - `docs/DESIGN.md`: §2.2 row table (new row, disabled, what it does); §2.4 data directories (`.llm/transcripts/<session id>.txt`, ignore guarantee, 14-day cleanup); §2.4a interface table (`sessionQuery.filterEvents` with the evidence above; `ctx.get` row adds transcript reading `sessionQuery`, `agents`, `glmHournessData`); §2.5 if it lists rows; §8 public-library list adds `transcript.ts`.
      - `docs/FACTS.md` §3 DSH: `filterEvents` facts (live-preferred, one document per event with non-empty text, extraction per type, unaffected by `openAt: never`); rc.3 native `read` caps (2000 lines, 2000 characters per line with truncation marker, 50 KB) if not already recorded.
      Docs in Chinese in the existing style, no persona.
      Verify: `npm run build` exit 0; `node --experimental-strip-types tests/data-transcript.spec.ts` all pass; `npm run preflight` exit 0; `npm test` exit 0.

- [ ] 2. `feat(glm-compact): end GLM compaction summaries with the ZCode transcript sentence` (depends on 1)
      Files:
      - `src/glm-prompt/zcode-compact-text.ts` (new mirror file): header comment naming the source (`zcode.cjs:14382-14384`, `Bxt` transcriptPath branch) and `transcriptNote` (above). No imports, no regex.
      - `scripts/check-verbatim.mjs`: add `'src/glm-prompt/zcode-compact-text.ts'` to `MIRROR_FILES` (line 49).
      - `src/glm-prompt/compact-row.ts`: `formatSummaryStream(stream, transcript?: () => Promise<string | undefined>)`: after `formatCompactSummary`, when the result is non-empty and `transcript` is given, await it and append `transcriptNote(path)` when a path comes back; an empty result never calls `transcript`. `apply(ctx: CompactRowContext & Partial<ProvideHost> & ServiceLookup)`: in the `copies.has(options)` branch pass `transcriptFor(options.sessionId)`, which returns undefined when `transcriptService(ctx)` is undefined or there is no session id, else a function calling `exportBeforeCompaction` and returning the path only for `kind: 'written'`; a rejection (contract break) reports `degraded` on the `glm-compact` row health for that session and appends nothing. Header comment: the sentence, its source, and that it appears only while the transcript row is enabled.
      - `tests/compact-row.spec.ts`: (a) read `join(referenceDir(), 'zcode-3.17.1', 'zcode.cjs')` (pattern `tests/glm-startplan.spec.ts:4,21`), extract with ``/return t\.transcriptPath&&\(n\+=`([^`]*)\$\{t\.transcriptPath\}`\)/`` and assert `transcriptNote(p) === match[1] + p`; (b) `formatSummaryStream` with a transcript function returning `p` lands exactly `'Summary:\nkept' + transcriptNote(p)` in one text block; (c) analysis-only reply with a transcript function lands no text and never calls it; (d) `apply` with `get('glmHournessTranscript')` returning a fake service: the service receives the request's `sessionId`, the landed text ends with `transcriptNote(<returned path>)`; `skipped` appends nothing; non-GLM compaction never calls the service; without `get` the existing tests stay unchanged.
      - `tests/contracts.spec.ts`: one cross-package test: real `glm-hourness/transcript` row (`src/data/transcript-row.ts`, `home` = temp dir) and real `glm-compact` row on one fake host whose `get` returns the provided service, a fake `sessionQuery` and `agents`; a GLM compaction lands a summary ending with `transcriptNote(path)` where `path` is inside `<home>/transcripts/` and `readFileSync(path)` equals `renderTranscript` of the fake documents.
      - `docs/reference/zcode-verbatim.md`: new section for the sentence (source lines, production call without `transcriptPath` at `:14730`, the mirror file, placement inside `<compacted-summary>`).
      - `docs/DESIGN.md`: §5.6 (seam addition, depends on the transcript row), §5.8 difference table (placement), §5.9 mirror-file list if it enumerates files.
      - `docs/FACTS.md` §1 ZCode: `Bxt` options and the production call site.
      Verify: `npm run build` exit 0; `npm run check:verbatim` reports OK with the new mirror file; `node --experimental-strip-types tests/compact-row.spec.ts` and `node --experimental-strip-types tests/contracts.spec.ts` pass; `npm test` exit 0.

- [ ] 3. `test(probe): GLM compaction transcript scenario` (depends on 2)
      Files:
      - `scripts/probe/probe-llm.mjs`: `withTranscript(request, call)` next to `withRevisions` (line 77) and applied in the same map (line 549): a scripted argument string `{transcript}` becomes the text after `read the full transcript at: ` up to the end of that line, taken from the last request message whose text contains it; left as is when none does. Document it in the file header next to `{rev:…}` (line 29).
      - `scripts/probe/run-probe.mjs`: scenario `glm-compact-transcript` on `probe-full`, modelled on `glm-compact` (line 375): script `Read package.json` → `Read {transcript}` → text `done` with `status: true`; overlay: `compaction-basic` `{ thresholdRatio: 0.02, retainTokens: 0 }` and `- id: glm-hourness/transcript` / `disabled: false` / `config: { home: '<runDir>/glm-compact-transcript/home' }` (forward slashes via `slash`). Checks (in `checks`, line 2539): (1) a checkpoint message after the first compaction contains `'Summary:\nprobe summary' + transcriptNote(path)` immediately followed by the closing frame, `transcriptNote` imported from `packages/glm/dist/glm-prompt/zcode-compact-text.js`; (2) `path` is under the scenario `home/transcripts/` and the file starts with the header line for that session; (3) a recorded request (step or compaction) carries a tool result of the `Read {transcript}` call whose text includes `Transcript of session`; (4) no line of the file exceeds 1000 characters and the `package.json` `test:1` script line appears split; (5) on the existing `glm-compact` scenario (row disabled, shipped default) no checkpoint text contains `read the full transcript at:`; `/glm-status` of the new scenario lists the transcript row as active.
      - `docs/DEVELOPMENT.md` §3: probe paragraph gains the scenario and the `{transcript}` substitution.
      - `docs/HANDOFF.md` §3 component state: transcript row shipped disabled, L3 passed, L4 in the next desktop batch.
      Verify: `npm run build` exit 0, then the probe under the lock (procedure below) exits 0 with the five new checks passing.

## L3 sandbox procedure

The probe is the L3 for this change: it generates temporary profiles under the run directory (never `~/.dsh/profiles`), boots the real rc.3 desktop runtime headless, and enables the new row only through the per-scenario override patch (DEVELOPMENT.md §3 "探针的 profile"). Logs go to `C:\Users\29596\Desktop\Project\GLM-Hourness\.agents\tasks\compact-recall\runs\` (git-ignored by `.agents/tasks/**/runs/`).

1. In the worktree: `npm run build > C:\Users\29596\Desktop\Project\GLM-Hourness\.agents\tasks\compact-recall\runs\build.log 2>&1; "build exit $LASTEXITCODE"`; must be 0. Do not rebuild while the probe runs (DEVELOPMENT.md §5.10).
2. Take a probe lock in the user's checkout: `New-Item -ItemType Directory C:\Users\29596\Desktop\Project\GLM-Hourness\.llm\probe-lock` (on failure try `.llm\probe-lock-2`), then write `owner.txt` (workflow `wf_9e0ca88a3e82813a`, step name, ISO time) with `[IO.File]::WriteAllText` and `UTF8Encoding($false)`. A lock whose `owner.txt` was last written more than 45 minutes ago is stale: delete it, take it, and name the deleted owner in the step report. If both locks are live, wait and retry.
3. Run `npm run probe > C:\Users\29596\Desktop\Project\GLM-Hourness\.agents\tasks\compact-recall\runs\probe.log 2>&1; "probe exit $LASTEXITCODE"` from the worktree, in the background; poll, and rewrite `owner.txt` at least every 10 minutes while it runs. Exit code must be 0; exit 2 is a guard failure (existing `probe-*` profile or changed desktop/glmsandbox shape), not a verdict.
4. Evidence for done-criterion 3: from `.llm/probe-runs/<timestamp>/glm-compact-transcript/` in the worktree, quote the checkpoint text ending in the sentence and the Read tool result head into the step report.
5. Delete the lock directory. Before any later deletion under the worktree's `.llm/probe-runs/`, list reparse points (`Get-ChildItem -Recurse -Attributes ReparsePoint`); the probe removes its junctions on exit, and any left behind are removed as links (`[IO.Directory]::Delete(<link>)`, not recursive) after checking their target.

No desktop app use; L4 goes into the next desktop batch.

## Gates and landing

1. Commit 1, 2, 3 locally on `feat/compact-recall` (commit messages technical, no persona, written without BOM, check the first character after committing; DEVELOPMENT.md §7 2026-10-31).
2. Latest main: `git -C C:\Users\29596\Desktop\Project\GLM-Hourness fetch origin`; if `origin/main` is ahead of local `main`, `git -C C:\Users\29596\Desktop\Project\GLM-Hourness merge --ff-only origin/main` (stop and report if it is not a fast-forward or the checkout has conflicting changes). In the worktree: `git rebase main`.
3. On the rebased tree, each gate with its own log and exit code, no pipes: `npm run build > runs\build-final.log 2>&1`, `npm run preflight > runs\preflight-final.log 2>&1`, `npm test > runs\test-final.log 2>&1`, then the probe per the L3 procedure (`runs\probe-final.log`). Record the four exit codes and the test totals.
4. Before merging into the user's checkout (the desktop app's load source; a new patch row is a bundle-layout change, DEVELOPMENT.md §5.4): check read-only for a running desktop instance, `Get-CimInstance Win32_Process -Filter "Name='DeepSeek Harness.exe'"`, ignoring processes whose command line contains `bin.js` (probes). If one runs, do not stop it: pause and ask.
5. `git -C C:\Users\29596\Desktop\Project\GLM-Hourness merge --ff-only feat/compact-recall`; `git -C … push origin main`; `git -C … push github main`; no force. Verify `git -C … ls-remote origin refs/heads/main` and `git -C … ls-remote github refs/heads/main` both equal `git -C … rev-parse main`.
6. Do not build in the user's checkout (another lane may be probing it); report that its `dist/` needs `npm run build` before the next desktop start.
7. Cleanup: check the worktree for reparse points pointing outside it (step 5 of the L3 procedure; also under `node_modules`), remove such links as links, then `git -C C:\Users\29596\Desktop\Project\GLM-Hourness worktree remove .worktrees/compact-recall` and `git -C … branch -d feat/compact-recall`.
8. Do not edit `docs/graph`; the orchestrator records graph state.

## Unverified

- Desktop behaviour of the whole path (L4, next desktop batch): the sentence in a real GLM session, whether GLM actually follows it, Read permission prompts for the export path, and the session-log export menu (report §8).
- A session whose cwd is a git worktree resolves to the main checkout's `.llm/` (`projectOf` follows `commondir`), so the export lies outside that session's cwd; whether Read asks for permission there is not checked.
- Residual exposure: other sessions' export files in the same `.llm/transcripts/` are reachable by ordinary file tools; cleanup bounds them to 14 days.
- Whether every `tool/call` has a matching tool-call block in its assistant message (the reason all documents are kept); the export therefore repeats tool arguments.
- A second compaction's export contains the first checkpoint as a `user` entry (the document carries no `source`); not labelled.
- Session id format: the runtime directory is `session-<uuid>`; whether `header.id` includes the prefix is not checked (both forms pass the id pattern).
- No compile-time pin of `sessionQuery` against the official `.d.ts`: adding `@deepseek-ai/dsh-session-query@0.2.1-rc.3` as a dev dependency needs the person's approval (DEVELOPMENT.md §11 rule 4); the L3 probe covers the runtime.
- Export size and time for very long sessions (one full log load and one file write per compaction) are not measured.
- Report §8 items not needed by this design stay unverified: the experimental bundle on the GLM route, raw JSONL row structure, projection cache.

## Digest

- `src/glm-prompt/compact-row.ts` — `formatSummaryStream(stream)` (collect chunks, `formatCompactSummary(joined)`, re-emit one text block at the first text position, empty → no text) and `apply(ctx)` (`copies.has(options)` → `formatSummaryStream(next())`; else `withZcodeInstruction`, health report, `ctx.llm.stream(copy)`; listener `{ global: true, prepend: true }`). Covered by `tests/compact-row.spec.ts` (5 tests, 5 pass today, run in this step).
- `src/glm-prompt/compact.ts` — unchanged; `formatCompactSummary` strips `<analysis>`, rewrites `<summary>` to `Summary:\n…`.
- `src/glm-prompt/zcode-compact-text.ts` — new mirror file; gate `scripts/check-verbatim.mjs` (`MIRROR_FILES` line 49, literal chunks split by line, trimmed, length ≥ 13 must occur in the bundle; mirror files hold no regex; value imports only from mirror files). `tests/check-verbatim.spec.ts:13` runs import rules over every mirror file.
- `src/shared/dsh-min.ts` — add the two structural types near `SessionPersistenceLike`; existing `ServiceLookup`, `ProvideHost`, `AgentsService`, `LlmStreamOptions.sessionId`, `LlmStreamOptionsContractCheck` (line 724).
- `src/shared/transcript.ts` — new; reader pattern `dataService` (`src/shared/data-home.ts:96-100`).
- `src/shared/health.ts` — `HOURNESS_ROWS` line 26; `HEALTH_ROWS`/`HealthRow` derive from it; `ACTIVATION_ONLY` line 45 unchanged.
- `src/data/transcript.ts`, `src/data/transcript-row.ts` — new; reuse `projectHomeFor` (`src/data/project-home.ts`), `ensureLlmIgnored` (`src/data/llm-ignore.ts:84`, outcomes `ignored` / `no-git` / `unwritable` / `visible`), `provideRowHealth` (`src/shared/health.ts:117`). Tests `tests/data-transcript.spec.ts` (new), helpers `tests/git-fixture.ts`, `tests/temp-outside-git.ts`.
- `scripts/packages.mjs` — hourness `rows` array; drives eslint boundaries, knip entries, clean-dist, sandbox profiles and preflight.
- `packages/hourness/cordis.patch.yml`, `packages/hourness/package.json` (exports pattern `./env`, `./env/locale/*.json`), `packages/hourness/locale/transcript/`.
- `tests/contracts.spec.ts` — `ROW_IDS` (lines 55-74); cross-package test added in commit 2.
- `scripts/probe/probe-llm.mjs` — `withRevisions` line 77, applied line 549, `COMPACTION_REPLY` line 60 (`<analysis>probe analysis</analysis>\n\n<summary>probe summary</summary>`).
- `scripts/probe/run-probe.mjs` — `runScenario(name, model, script, task, overlay, cwd, others, on)` line 237; `glm-compact` scenario line 375; `compactRequest`/`checkpoint` lines 1951-1953; `checks` line 2539; overlay row enabling pattern `['- id: glm-hourness/rules', '  disabled: false']` line 496.
- Docs: `docs/DESIGN.md` §2.2 (line 41), §2.4 (78), §2.4a (136), §2.5 (255), §5.6 (721), §5.8 (753), §5.9 (779), §8 (866); `docs/FACTS.md` §1 (7), §3 (142); `docs/reference/zcode-verbatim.md`; `docs/DEVELOPMENT.md` §3; `docs/HANDOFF.md` §3 (42).
- Verified in this step: `npm run build` on the worktree base completed without errors (`.agents/tasks/compact-recall/setup-build.log`); `node --experimental-strip-types tests/compact-row.spec.ts` exit 0, 5/5 pass (`plan-compact-row.log`). The full `npm test` and the probe were not run in this step.
