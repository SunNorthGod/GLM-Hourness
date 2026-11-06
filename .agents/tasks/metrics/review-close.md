# 指标线收尾评审（第 1 轮）

结论：APPROVED，无阻断项。

## 范围

- (a) 合并提交 `2dc368e` 带进的循环板读侧：`src/loops/records.ts`（`recentRecords`）、`src/loops/metrics.ts`（`loop-done` 映射 `exits`）、`src/loops/boards.ts`、`tests/loops-run.spec.ts`、`tests/loops-row.spec.ts`。对照 `a9adca8`（main 侧）逐文件看了合并解决的 diff。
- (b) `49449b4..HEAD` 里本分支自己的提交：`c1be407`（原因码修正、S7R4-1、S7R4-2）。`442e6f3` 只合进 main 的 docs/graph，不评。
- 对照：循环板设计 0.6 §6.10（`loop-done` 字段与 `outcome`/`reason` 取值）、§8.2 第 7 条、§8.5；指标设计 0.7 F33、§4.4；编排方裁定；`review-s7.json` 的 S7R4-1、S7R4-2。

## 核对结果

读侧（2dc368e）
- `recentRecords(root, nowMs, limit)` 按 UTC 日逐天调 `readLog(journal, {from: day, to: day+1})`，最多 28 天，凑够 `limit` 即停；每天内按 `(at, w, n)` 排序，跨天 `unshift`，返回最旧在前、至多 `limit` 条；`view.ts` `recentRuns` 再反转为最新在前、至多 20 条，合 §8.2 第 7 条。只认 `loop-done`、`loop-duplicate`、`loop-task-delete` 三种，字段缺失的跳过。读失败停止回看、不抛。合 F33（经 `readLog`、28 天窗口、不另写解析）。
- 读与写的项目根一致：读侧 `projectOf(root)?.root`，写侧 `src/metrics/index.ts` `projectOfWhere` 同样取 `projectOf(where.dir).root`，`run.ts` 的 `record` 以 `deps.root` 作 `dir`。
- `metrics.ts` 的 `loop-done` 带 `exits`，`kinds/loops.ts` 字段表有 `exits: int[]`，`view.ts` `passedOf` 按它判过没过。
- 夹具：`loops-row.spec` 改用 `appendEvents` 写真流水并断言 `rejected === 0`；`loops-run.spec` 从假指标服务读记录。

原因码修正（c1be407）
- `DoneRecord.reason` 类型为 `RunReason`（`RUN_REASONS` 闭表或 `r-…`/`builtin:…` 规则 id）。逐个查了写 `loop-done` 的 11 处：`run.ts`（rerunPeakEnd 两处、recordPeakStart、rerunDeferred 的 finish、execute、recordRun）、`inbox.ts`（undeclared、stale、told）、`bind.ts`（DSH 投递、补投）。都经类型约束，`src/loops` 下没有绕过类型的 `as` 写入；`reasonCode`、`ruleReason` 先校验再收窄。外来文字（harness 动作、`recordRun`）落为 `plugin-reason`；超时只写 `timeout`，用时在 `durationMs`。
- 闭表 51 个码都合 `ID_PATTERN`（`^[A-Za-z0-9_.:@+/-]{1,120}$`），规则 id 正则与 `src/rules/model.ts` 的 `RULE_ID`、`BUILTIN_ID` 一致（至多 48、49 字符）。`recordPeakStart` 的档位 `inform`/`reduce`/`stop` 也在表里。
- L2：`tests/loops-records.spec.ts` 钉住每个码合 id 形状且不重复，13 种 `outcome` × 全部码、两种规则 id 都被流水收下，文字被整条拒收；已登进 `package.json` 的 test 脚本。「每种出 loop-done 的路径都能落进流水」由两层合起来保证：写入点的类型只允许闭表与规则 id，表里每个值都被收下。另外 bind、inbox、run、peak 四个 spec 的假流水按写入器同一套 `checkEvent` 过滤，`peak-rerun-expired`（loops-peak 第 438 行，两条结局）、`rules-queue-expired`、`undeclared-event`、`event-stale`、`plugin-reason`、`timeout`、`peak-no-holder` 有路径级断言。
- 页面字：`outcomeText` 修正前后都只把 `refused` 的码与 `self-loop` 翻成人话，其余按 §8.5 写结局的人话；修正前的中文原因在页面、`/loops` 与 UI 上都没有显示过（只进了记录与 `state.last`），所以改成码不丢任何可见文字，也不需要新的映射表。裁定写的是「页面需要人话时」再映射，当前没有这种需要。给主 Agent 的文字（`tell`）和行健康（`deps.report`）照旧保留原话。
- 文档同提交：`docs/ORCHESTRATION.md` §18.9 原因码表、§18.12 高峰结束各行的码、§10.6；`docs/HANDOFF.md`。

S7R4-1、S7R4-2（`src/metrics/rules.ts` `CMD_ACTION`）
- 左边界去掉 `/`，另起一支「非空白字符后的 `/` + 动作词，词后不跟 `/`」：`findstr /ni`、`/mi`、`/ri`（`/` 前是空格）与 `C:\Users\mi\…`、`D:\cp\…`（词两侧都是 `/`）不再算动作；`del/q`（词后跟 `/`）、`C:\Git\usr\bin\rm`（`/` 前是 `n`）仍拦。两支都允许可选的 `.exe`，`rm.exe -rf` 带不带引号都拦。测试补了 5 条拒绝、5 条放行，含 S7R4-1 要求的 `findstr /ni`。
- `Start-Process cmd` 与 `@rd` 记进 §10.6 认不出的写法（第 1225 行）。

门禁（取自 c1be407 提交说明与 `.worktrees/metrics/.llm/logs/metrics-close-*.log`，未重跑）
- build 0、preflight 0（2 包、19 行）、npm test 0（159 套件、2854 用例、2853 过、0 失败、1 跳过）、probe 0（376/376）。棘轮 eslint 73 suppressed、knip 18、jscpd 1 clone，未上升。
- 探针跑在一次只改注释的编辑之前，之后重跑了 build、preflight、npm test；日志时间与提交说明一致。全量里一次 `guard-audit.spec` 失败，该文件未改动，单独重跑 3/3 通过。

## 未列为阻断的观察

- `recentRecords` 在 28 天里不足 20 条循环板记录时，每次刷新视图都会把窗口内每天的流水整份读一遍。主检出今天的流水是 4.3 MB、15008 行、0 条 `loop-*`，所以合入后初期会出现这种情况。读法是 F33 定的，规模目前可以接受。第 5 步桌面核对时留意一下宿主 CPU。
