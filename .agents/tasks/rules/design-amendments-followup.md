# Amendments to .agents/tasks/rules/design.md (0.10) from the slice follow-up

The design file is not in git and lives only in the main checkout, outside the
worktree this follow-up works in, so the amendments below are written here as
replacements for the orchestrator to apply to `.agents/tasks/rules/design.md`
(then bump or annotate the version as it sees fit). Each item gives the section,
a unique excerpt of the old text, and the new text. Nothing here is a new
decision: items 1 to 3 and 5 apply the rulings in `.agents/tasks/design-context.md`
("Rules thin slice: orchestrator rulings after its review"); item 4 corrects the
wrong version number in the same ruling; item 6 records what the follow-up built
where the design names the file.

Code that already matches: `src/rules/model.ts` (`withoutEmptyCollections`,
optional `unresolved`), `src/rules/store.ts` (`stateDigest`, `applyRecord`),
`src/data/project-root.ts`, `src/data/lock.ts`; documentation in
`docs/ORCHESTRATION.md` §16.

## 1. §7.2, the `ProjectState` and `RepoRules` types

In the `ProjectState` interface every collection field becomes optional, and
`version` keeps 2.

Old (the fields to change, one line each):

```
  readonly root: string
  readonly rules: Readonly<Record<string, Rule>>
  readonly proposals: Readonly<Record<string, Proposal>>
  readonly signals: Readonly<Record<string, SignalState>>
  readonly detectors: Readonly<Record<string, Detector>>
  readonly tickets: Readonly<Record<string, Ticket>>
  readonly nextTicket: number
  ...
  readonly scripts: Readonly<Record<string, { ... }>>
  ...
  readonly notices: Readonly<Record<string, { ... }>>
  readonly recovered?: ...
  readonly unresolved: Readonly<Record<string, SkippedRecord>>
```

New:

```
  // root 删去：摘要要是覆盖项目路径，文件夹改名或搬家之后所有记录都对不上
  readonly rules?: Readonly<Record<string, Rule>>
  readonly proposals?: Readonly<Record<string, Proposal>>
  readonly signals?: Readonly<Record<string, SignalState>>
  readonly detectors?: Readonly<Record<string, Detector>>
  readonly tickets?: Readonly<Record<string, Ticket>>
  readonly nextTicket?: number                // 没有等待单之前不存，开第一张单的那条记录才设上（起始值设计原文没写，由 R3 定）
  ...
  readonly scripts?: Readonly<Record<string, { ... }>>
  ...
  readonly notices?: Readonly<Record<string, { ... }>>
  readonly recovered?: ...
  readonly unresolved?: Readonly<Record<string, SkippedRecord>>
```

with this comment above the collections (new): `/** 集合为空时不存（§7.2 末段）：读的一方把没有读作空 */`.

The `version` comment keeps its text ("0.9 起 2 ... 没有版本 1 的存档要迁移 ...").

In the `RepoRules` interface the four collections become optional the same way:

```
  readonly rules?: Readonly<Record<string, Rule>>
  readonly detectors?: Readonly<Record<string, Detector>>
  readonly signals?: Readonly<Record<string, Omit<SignalState, 'detected'>>>
  readonly peakMode?: ProjectState['peakMode']
  readonly scripts?: ProjectState['scripts']
```

`nextTicket` is a counter and not a collection, so the ruling's wording does not
cover it. It is listed above as absent until the first ticket so that a state
without tickets digests like the slice's; the design should confirm or choose the
other reading when R3 defines the tickets.

## 2. §7.2, the paragraph on collections and the digest

Old (the paragraph that starts "集合一律按 id 存成对象"): ends with
"……人同意之后引擎按提议写出规则、开关、检测器、解除或档位，提议转 `accepted`。"

Add after it (new paragraph):

> 集合为空时不存（0.10 评审后的裁定，最小一片的跟进）：状态里、`base` 与 `recovered` 记录的 `state` 里、快照文件里、每条记录的 `snapshot` 所摘要的内容里和 `rules.json` 里，值是空对象的顶层集合一律不出现；`applyRecord` 删掉集合里最后一项时，整个字段随之去掉。读的一方把没有读作空。这样整块规则板在最小一片写下的流水之后才加上 `rules`、`tickets`、`scripts` 这些集合时，它们还空着，状态的摘要就与最小一片写下的相同：最小一片写下的流水逐条核对得上，重放不需要知道形状在哪一条记录之后变过，也不需要版本号加一再写一条迁移用的 `base`（那会与 0.10 的「没有版本 1 的存档要迁移」相抵，所以没有选）。`stateDigest` 因此先去掉空集合再取摘要，`repoJson` 同样去掉；读到带空集合的状态（`unresolved: {}`）不算错，摘要按没有算。

And change the digest sentence (old: "摘要 `stateDigest(state)` 在 `src/rules/store.ts`（用 `node:crypto`），是 `canonicalJson` 的 UTF-8 字节的 SHA-256 前 16 位十六进制。") to:

> 摘要 `stateDigest(state)` 在 `src/rules/store.ts`（用 `node:crypto`），是去掉空集合之后的 `canonicalJson` 的 UTF-8 字节的 SHA-256 前 16 位十六进制。

## 3. §7.1, the paragraph on the project root and project directory

Old (excerpt): "项目根按 §7.3 从会话头的 `cwd` 算（工作树回到主检出），与 M5 的 `src/data/project-root.ts` 是同一个函数，谁先实现谁建；"

New (replace that clause): "项目根按 §7.3 从会话头的 `cwd` 算（工作树回到主检出），函数是 `src/data/project-root.ts` 的 `projectOf`（最小一片先建了它，M5 与其他板块复用，不再写第二份）；`projectDirOf` 里「追加进 `.git/info/exclude`」那一步就是同一个文件里的 `ensureIgnored(root, '.llm')`（读不到条目才追加，已有 `.llm`、`.llm/`、`/.llm`、`/.llm/` 之一不重复；不在 git 仓库里不加）；最小一片在第一次建 `.llm/rules/` 之前自己调它（`ensureRuntimeDir`），因为那时还没有 `projectDirOf`。"

## 4. §7.5, the first sentence

Old: "读不取锁。快照有效的条件：能解析，`version` 为 1，流水里有序号等于快照 `seq` 的记录，且 `stateDigest(快照)` 等于那条记录的 `snapshot`。"

New: "读不取锁。快照有效的条件：能解析，`version` 为 2，流水里有序号等于快照 `seq` 的记录，且 `stateDigest(快照)` 等于那条记录的 `snapshot`。"

(`ProjectState.version` is 2 from the first version of the board, §7.2; the 1 here
was a leftover. The rest of §7.5 needs no change for the stored shape: the digest
check in "其余情形" and in steps 3 and 5 uses `stateDigest`, which now ignores
empty collections.)

## 5. §16.1, the list of what the thin slice contains

Old (first bullet): "档位本身：`src/shared/peak-mode.ts` 的 `PeakLevel`、`PEAK_REDUCE_GLM_WORKERS`（1）、`PeakModeState`、`PeakHold`、`PeakModeService`、`peakModeIntro`、`PEAK_LEVEL_WORDS`（R1 的公共库部分）；`src/rules/model.ts` 的 `effectivePeakMode`、`DEFAULT_PEAK_LEVEL`（默认少做）与 `builtin.ts` 的默认规则 `GLM_PEAK_PRICING` 及按档位启用的附属条目（R1）。"

New: "档位本身：`src/shared/peak-mode.ts` 的 `PeakLevel`、`PEAK_REDUCE_GLM_WORKERS`（1）、`PeakModeState`、`PeakHold`、`PeakModeService`、`peakModeIntro`、`PEAK_LEVEL_WORDS`（R1 的公共库部分，少做那一句里的数由 `PEAK_REDUCE_GLM_WORKERS` 算出）；`src/rules/model.ts` 的 `effectivePeakMode`、`DEFAULT_PEAK_LEVEL`（默认少做）（R1）。`builtin.ts` 的默认规则 `GLM_PEAK_PRICING` 及按档位启用的附属条目不在这一片里：没有 judge、规则页或门，它们没有调用方，而这一片不留没有调用方的壳子（编排方 2026-10-30 的裁定）；它们随整块规则板的 R1 之后合入。"

In the paragraph "不在这一片里：" add at the start of its list: "默认规则与它的附属条目（`builtin.ts`）、`openRulesBoard` 的 `projectDir` 参数（没有调用方给它值：数据目录服务还没有 `projectDirOf`；最小一片的运行时目录固定为 `<项目根>/.llm/rules/`，M5 合入后与 `.llm/` 的忽略条目一起改）、"

Add at the end of the last paragraph of §16.1 (the one that begins "这一片是整块设计的严格子集"), before "这一片按本稿（0.10）的定稿写":

> 存下来的形状也是子集：为空的集合不存（§7.2），所以最小一片写下的流水与 `rules.json` 在整块规则板添上自己的集合之后照样核对得上，不需要迁移。最小一片另外建了两个共用模块，放在 `src/data/`：`project-root.ts`（`projectOf`、`gitDirOf`、`ensureIgnored`）和 `lock.ts`（写锁）；M7 的 E3 与 M5 直接用它们，不再写第二份。

## 6. §7.4, step 2 (the lock) and the opening line

Old (step 2, last sentence): "做法照 DSH 的 `withFileLock`（atomic-write:189–219，split 附录 G10 已核对），在 `src/rules/lock.ts` 里重写并注明出处：运行时包不能从本仓库解析（`docs/DESIGN.md` §2.4 的同一个理由）。"

New: "做法照 DSH 的 `withFileLock`（atomic-write:189–219，split 附录 G10 已核对），在 `src/data/lock.ts` 里重写并注明出处：运行时包不能从本仓库解析（`docs/DESIGN.md` §2.4 的同一个理由）。这是仓库里唯一的文件锁，规则板、M7 的 E3 与 M5 共用，不再各写一份。"

Old (opening line): "写只有一个入口：`openRulesBoard({projectRoot, projectDir, rulesDir}).apply(actor, mutation)`"

Keep as is for the full board. Add one sentence after the opening line's parenthesis: "（最小一片的 `openRulesBoard` 只收 `projectRoot`、`rulesDir`、`io`、`lock`：`projectDir` 没有调用方，随 `projectDirOf` 一起加。）"
