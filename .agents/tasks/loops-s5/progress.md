# loops-s5 progress

Branch `loops-s5` from main `0c5ebd21`, worktree `.worktrees/loops-s5`.
Scope: the loops consent path (loop board design 0.6 §S5) — `loop_propose` /
`loop_show` / `loop_note`, the proposal store and the accept/reject wiring,
the `/loops accept` two-step, the reconciliation, and the two `status.ts`
filters that wait on it. `staleEntries`/`timeoutEntries` themselves already
landed (loops-seam, 2026-11-16); S5's copy of them in design §16 is done.

## §S5 reading (written before coding)

### The path of a person's agreement (design 0.6 §7.1, steps 1–5)

1. **`loop_propose`** (main agent only, `isMainAgent`; input
   `{kind: 'add'|'edit'|'delete'|'repin', entry?, entries?, body?, script?,
   reason, replaces?}`):
   - `add`: `body` = one entry's `{title, why?, when, filter?, action,
     limits?, quiet?}`. A `script` action also carries `script: {lang, text}`:
     the text is written by a sub-agent and passed as is; the board decides the
     file path (`docs/loops/scripts/<entry id>.<suffix>`), language and hash
     (SHA-256 of the UTF-8 bytes, `\n` line ends). A `check` action carries
     `{kind:'check', tool, check?, report, timeoutSeconds?, note?, to?,
     glmSpend?}` without `argv`: the board reads the command from the
     environment tool node through the env seam (`checksSeam` → `commandOf`)
     at propose time and stores it as the proposal's content; unreadable →
     `invalid`. Plugin ids → `forbidden` (插件带来的条目暂时只能看).
   - `edit`: `entry` + the new `body` (new `script` when the script changes).
     `delete`: `entry`, or `entries` (at most 3, the weekly report's removal).
     `repin`: `entry` only — the board reads the entry and script as they are
     in the repository now (a check: the command on the tool node now) and
     makes them the proposal's content, so the human re-agrees to what is there.
   - Validation per design §12 through the same `validateEntry` /
     `validateWhen` / script length limits a real entry passes; nothing is
     recorded on `invalid`.
   - The board draws the entry id (`u-<8hex>`) at propose time and puts it in
     the stored `body`, so the script path and the eventual entry file are
     pinned by the proposal. Proposal id `lp-<8hex>`; recorded `open` in the
     store by `llm` (the only thing `llm` may write). `via` = has the session
     a graph dir (`graphService(ctx)?.dirFor(cwd)`) → `graph`, else `board`.
     With `replaces`, the same write turns the old proposal `superseded`.
     At most 20 open proposals.
   - Returns `{proposal, describe, cautions, attach: 'loops:<id>', message,
     detail?}`: `describe` ≤ 40 code points, no script text; `cautions` ≤ 7
     sentences of ≤ 40 code points from a fixed table (five always for a
     script entry, five for a check entry, plus content-based ones);
     `detail` (script/check add, script/check-changing edit, repin) built by
     the shared `scriptDetail` (script) / `commandDetail` (check):
     `{markdown, mustShow}`. **F37**: `detail`, `attachDigest(detail)`,
     `describe`, `cautions` and the script text are computed once at propose
     and stored in the journal's `propose` line; every later reader
     (`attachable`, `acceptProposal`, `/loops accept`) uses the stored copy —
     nothing is ever recomputed from the file system.
   - `message` (model-facing English) per `via`; `board` adds `detail`.

2. **`propose_to_human` with `attach: 'loops:<id>'`** (M3): asks
   `attachable({cwd, proposal})` first — the proposal must be `open` and
   `via: 'graph'` in this project — then appends `detail.markdown` verbatim
   after the main agent's four lines and ends the body with
   `loopProposalLine(id)` = 「循环板提议 `lp-<id>`」. M3 side is generic over
   `ATTACH_BOARDS` (src/design/attach.ts): adding the loops board is one row
   there ({prefix 'loops:', format /^loops:lp-[0-9a-f]{8}$/, service, idOf}).

3. **The human's words are on the graph** (M3 `record_human_answer`): checks
   the relay words (`personSaid`), asks `attachable` again, checks every
   `mustShow` piece is in what the main agent showed after the question
   (`not_shown` otherwise), then decides with `reason` ending
   「· 已给人看原文 <digest>」 (`attachDigest` = SHA-256 of
   `markdown\ncode points of mustShow joined by \n`, first 12 hex) and calls
   `acceptProposal({questionId, graphDir, cwd, by: {actor:'llm', relay}})`,
   putting the returned line into the result. Landed M3 contract
   (src/shared/attach.ts `AttachService`) has `acceptProposal` resolve to the
   **line string**; the landed rules service (src/rules/accept.ts) implements
   exactly that. Decision: the loops service follows the landed AttachService
   contract (the §7.1 result table's lines are those strings), not the design
   sketch's `AcceptResult` object — same as the rules board landed.

4. **`acceptProposal` checks and write**: the question in `graphDir` is
   `done` and its body ends with *this* proposal's id (the human agreed to the
   newest version); the last `decide` is `human`, or `llm` with a `relay`;
   a proposal with `detail` needs 「已给人看原文 <stored digest>」 in that
   decision's reason (no mark, wrong mark → `invalid`, nothing written — this
   is what keeps a `graph_decide` with the human's words from working);
   already `accepted` → `ok` again without writing. Then the board writes as
   `harness`: the entry file and script bytes are exactly the proposal's
   stored text, `source` = `{kind:'person', via:'chat', at, relay, question,
   proposal}`, and the proposal turns `accepted` in the same write. **Consent
   pinning**: the script's `sha256` is pinned at accept; the executor
   re-checks the bytes against it on every run (`script-changed` refusal) and
   a check entry's `argv` is compared against the tool node each run
   (`check-changed`); a changed file only runs again after a human re-agrees
   through `repin`.

5. **对照与补写 (reconcile)**: when the loop row starts a project and on every
   beat, for each `via:'graph'` `open` proposal, find on the graph the
   question whose body ends with its id: decided by the human → the same
   checks as step 4, then write (`via: 'chat'`); dropped with the human's
   words → `rejected`; no question named it for 7 days → `expired`. The
   immediate hook is only on `record_human_answer`; `graph_decide` is not
   hooked. `busy`/`io` are retried by the reconcile; `missing`/`invalid`/
   `forbidden` are not.

### Board path (design §7.1 end, §7.2)

`via:'board'` proposals (no project graph) are decided by the person's
commands: `/loops accept <lp-id>` / `/loops reject <lp-id>`. A proposal with
`detail` takes two accepts: the first shows `detail.markdown` plus
「看过了就再打一次 /loops accept <id>」 and records `shownAt` (journal op
`show`); the second within 30 minutes takes effect; past 30 minutes it starts
over. The person reads the text in the command's own reply, so the chat-log
check does not apply here.

### Storage (design §9.2 step 4, §13)

The journal is the proposal store: ops `propose`, `supersede`, `show`,
`accept`, `reject`, `expire` name the proposal in `id` (`lp-…`), and each
line's `after` carries the whole proposal state (body, reason, via, status,
describe, cautions, detail?, digest?, script text) again, so replay needs no
previous line. Actors (§13): `human` decides a board proposal; `harness`
writes only what a graph decision of the human says; `llm` only records an
`open` proposal. The present `journal.ts` reader already tolerates these ops
(`AGREED` covers entry ops only; the header even names the proposal ops).
Entry writes at accept reuse the store's journal-first file machinery
(`change()`), generalized to take the actor and `via`.

### The three tools (design §7.3)

- `loop_show`: any agent; the project's whole board — plugin and person
  entries, each with last and next, the waiting (held, deferred) and the last
  10 runs; not truncated.
- `loop_propose`: main agent only; `forbidden` with hint
  「ask the main agent to propose it」 otherwise.
- `loop_note`: main agent only; `{entry, text}` (1–500 code points) →
  `{entry, run}`; no run of this entry was delivered to the main agent →
  `invalid` (「这一项还没有交给你的运行」). The note hangs on that run and is
  stored in `.llm/loops/notes.jsonl`, at most 20 per entry (design §6.10);
  metrics record the word count only.
- Names in `src/shared/tool-names.ts` as `LOOP_TOOL_NAMES`
  (`['loop_show', 'loop_propose', 'loop_note']`); contracts test pins the
  row's registrations to it. Deferred on the GLM route like the rules tools —
  **not** in `ORCHESTRATION_RESIDENT_TOOLS`.

### The two status.ts filters

- `staleEntriesOf` must not list an entry that already sits in an open
  `delete` proposal (the comment at the file head); the selector gains the
  set of entry ids named by open delete proposals, fed from the store's
  proposals by boards.ts.
- `staleItems`/`timeoutItems` gain the §17 M7 item 8 suffix lines: the stale
  list adds `Propose removing them in one proposal: loop_propose {kind:
  "delete", entries: [...]}, then propose_to_human.`; the timeouts list adds
  `Propose fixing the script (dispatch a subagent, then loop_propose kind
  "edit").` for a person's entry, keeping 请插件的作者修 (no removal) for a
  plugin's.

### Landed pieces this builds on (all read)

- M3: `src/shared/attach.ts` (AttachDetail/Attachable/AttachService),
  `src/design/attach.ts` (`ATTACH_BOARDS`, `askBoard`, `attachDigest`,
  `piecesNotShown`, `boardOfBody`), `src/design/record.ts` (`proof`,
  `handBack` — generic, no M3 change needed).
- Rules precedent: `src/rules/propose-tool.ts` (tool shape, examples,
  refuse mapping, id retries), `src/rules/accept.ts`
  (`attachable`/`acceptProposal`/`reconcile`, agreement checks, digest mark),
  `src/rules/commands.ts` (`/rules accept` two-step, `shownAt`, 30 min),
  `src/rules/proposal.ts` (`prepareProposal`, describe/cautions, detail),
  `src/rules/caller.ts` (`callerOf` for the main-agent check).
- Loops: store.ts (journal-first writes, `change()`, lock), journal.ts
  (record reader), model.ts (`validateEntry`, `validatePersonEntry`,
  `entryFileText`, PersonSource), script-detail.ts (`scriptDetail`,
  `scriptTextProblem`), command-text.ts (`commandText`, WORK_TIMEOUT_MS),
  service.ts (LoopsService handed out inside sessionController inject),
  boards.ts (`storeOf`, `computeLists` for the weekly lists), registry.ts,
  view.ts (`ViewEntry`), run.ts (`binding()` gives the last delivered run),
  records.ts (`runEvents`), index.ts (row wiring, command, no tools yet).

### Decisions

- One service `glmHournessLoops` gains the three attach members
  (`attachable`, `proposalLine`, `acceptProposal`) beside the existing ones;
  `loopsService()` keeps its present four-member check (existing narrower
  fakes keep reading), and a new reader `loopsAttachService()` checks the
  three attach members for M3's `ATTACH_BOARDS` row.
- The proposal's stored `body` carries the entry id the board drew, so the
  accepted entry file, the script path and the digest are all fixed at
  propose time; accept writes exactly the stored bytes.
- `loop_note` rides the runtime's `binding()`/`state.last` knowledge through
  the row (the run delivered to the main agent); notes.jsonl is appended and
  trimmed under the store's write lock; the view lists a person's entry notes
  in its 讲细点 details lines (host side; the page reads `details` already).

## Implementation log

(appended per stage below)

## Implementation log

2026-11-17 (branch loops-s5):

- journal.ts: proposal records (`proposalAfter` carrying the whole state), the
  relay/question/proposal fields of an entry write an agreed proposal caused,
  `proposalsOf` fold, `LoopProposal`/`LoopProposalImage`.
- store.ts: mutations `propose`/`proposal-show`/`proposal-accept`/
  `proposal-reject`/`proposal-expire`; `change()` generalized to actor/via/
  relay/question/proposal; `writeAgreed` writes the accepted entry
  (add/edit/repin images built from the proposal's stored body and script
  bytes, delete batch through the same delete path); two-step guard on the
  board path (30 minutes); `notes` path; `proposals()` read.
- proposal.ts: `prepareProposal` — the input check, the board's own fills
  (entry id draw, script file+sha256, check command through the seam),
  validateEntry, describe/cautions/detail/digest computed once. Kinds:
  add/edit/delete (batch ≤ 3)/repin (entry file as it stands, script bytes as
  they stand, check command re-read from the tool node; nothing-moved is
  refused).
- accept.ts: `createLoopsAccept` — `attachable`, `acceptProposal` (the
  agreement checks + seenExactly against the stored digest, harness write,
  §7.1 line table), `reconcile` (accepted/rejected/expired).
- service.ts: `loopProposalLine`/`loopProposalIdOf`, `loopsAttachService`
  reader, the three optional attach members on `LoopsService`.
- design/attach.ts: the LOOPS_BOARD row (prefix `loops:`).
- tools.ts: `loop_show` (the view as lines with ids, last 10 runs),
  `loop_propose` (main agent only, via detection, id retries, examples verbatim
  from design §7.3), `loop_note` (run-of delivery, notes.jsonl ≤ 20/entry,
  `loop-note` metric with the word count only).
- index.ts: inject `tools`, the three registrations, the attach members on the
  provided service, `reconcileProject` every beat, `/loops` gains
  proposals/decide deps.
- commands.ts: `accept` (two-step) / `reject` for board proposals.
- status.ts + boards.ts + view.ts: the open-delete filter, the §17 M7 suffix
  lines, the notes lines in a person entry's details.
- tool-names.ts: `LOOP_TOOL_NAMES`; loops-row.spec pins the registration.

L2: tests/loops-consent.spec.ts (13), loops-status.spec (+1), loops-row.spec
(updated). Bugs found by the specs while building: the proposal id (lp-) and
the drawn entry id (u-) were conflated in the tool; an edit's body id was
overwritten by the drawn one; a repin did not update the entry's script hash
to the bytes as they stand (the pin would have failed at the next run); the
store's harness accept wrongly required by='llm' when the graph's decision was
the human's own (reconcile), and required a relay where a human's own graph
decision has none (fallback wording recorded instead).

Docs: ORCHESTRATION §18 header, §18.7 accept/reject sentence, new §18.14;
HANDOFF §3 loops row.

## 2026-11-18 解冻后:rebase、门禁与两笔收尾

- rebase 到 4a9750af(answer-race 修复 + 两笔 docs),干净重放,7 个提交;
  worktree 无 node_modules,junction 到主工作区的 node_modules 后 lint 可跑。
- rebase 后 build 暴露三处 strip-types 不查的 strict 错(spec 的 source 解构、
  seam 字段可写),已在 f21c030e。
- eslint:6 处报错在根上修(createLoopsAccept 返回改箭头属性、whenWords 的
  Array.isArray 收窄、去无用 as/赋值),回到 69 suppressed;连同 propose spec
  进 test:1,一笔 25e74b5a。
- knip:test 文件的"被用"来自 package.json test 脚本的显式点名,
  loops-consent.spec.ts 进 test:1 即消失;NOTES_PER_ENTRY、
  MAX_PERSON_ENTRIES、ProposalKind(loops)、showText 收回模块内。
- jscpd 6 处新克隆,一并去重(e9e6c46e):
  - agreementOf/Agreement/SEEN/EXPIRES 与 reconcile 的单条定夺收进
    src/design/agreement.ts(settleQuestion,apply 作参数),两板 accept 各留
    seenExactly(摘要来源不同:F37 存的 vs 现算的);
  - loop_show/rules_show 的 textOutput + agent 提取用 tool-support 新导出的
    textRender/execAgent;loop_propose/rules_propose/loop_note 走已有
    toolShell;
  - 两个 spec 的 putAndAgree 抽进 tests/design-tools-helpers.ts。
  门禁:eslint 69 / knip 18 / jscpd 1 全部回基线;preflight OK;
  loops-consent 13/13、rules-accept 9/9 复跑绿。
