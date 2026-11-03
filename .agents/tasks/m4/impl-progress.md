# M4 实施进度（2026-11-02，第一批）

分支 `m4`（worktree `.worktrees/m4`，起点 main@1dd4c80）。设计：`.agents/tasks/m4/design.md`（0.6，含 fix3 修订，即人放行的版本）；验收：`docs/graph/nodes/m4-*.json` 七节点 35 条（人 2026-11-01 定，未改一条）。

## 已完成（3 / 7 个任务节点）

### m4-cleanup — done，commit `154ecaa`（已推）

- 删除主检出 `.llm/docs/` 下 `_crawl_bigmodel.py`、`_fetch_bigmodel.py`、`_fetch_extra.py` 与 `__pycache__/`；`_bigmodel_md/`（47 页）不动。
- 删除前把三个脚本的地址与路径字面量逐字抄进 `docs/reference/bigmodel-guide-digest.md` 的附（重新抓取办法一并写明），与设计 §8 的清单逐条核对一致；ORCHESTRATION §7.4 末句改写。
- 提交信息记下三个脚本的 SHA-256 与大小（156f11dd…/387db36a…/f38069b1…，1710/829/845 字节）。
- 门禁：build OK；preflight OK；test fail 0。docs-only，未跑 probe。

### m4-env — done，commit `0855155`（已推）

- 新行 `glm-hourness/env`（`dsh-hourness/env`，`disabled: true`，排在 loops 之后、ui 之前）：`src/env/index.ts`（行健康 `env`、agent/created 装提醒与一次性仓库工作）、`src/env/branch.ts`（`envBranch`：`env` 特性的 tool 子节点、`config` 行语法、提议计数、读不懂的行带「<节点 id> 第 n 条 config 行读不懂」）、`src/env/notice.ts`（来源 `hourness-env`，first/changed/compaction 三种理由，做法同图投影；检查一行在 m4-checks 之前固定为「No checks run after edits in this project yet.」）。
- `src/data/llm-ignore.ts`（`ensureLlmIgnored`：`ensureIgnored` 追加 + `git check-ignore -q .llm/scratch/x` 复核，反向模式命中的原因从 `check-ignore -v --no-index` 取，没有输出时列出提到 `.llm` 的行；每进程每仓库一次）；`ensureIgnored` 改为返回是否追加过。
- `src/guard/scratch.ts`（`SCRATCH_DIR`、`scratchLeftovers`：相对路径、至多 200 个、另报总数）。
- 登记：packages.mjs、cordis.patch.yml、package.json（`./env`、`./env/locale/*.json`）、locale/env/{en,zh}.json（Dev environment／开发环境）、tsconfig、`HOURNESS_ROWS`、contracts 与 health 的行清单。
- 测试：`tests/env-branch.spec.ts`（6）、`tests/env-notice.spec.ts`（6，fake runtime 走 preStep）、`tests/env-ignore.spec.ts`（5，真实临时 git 仓库）；全部进 `npm test` 脚本。探针场景 `env-notice`：第一个请求末尾是包裹的环境提醒（工具行、无检查行、草稿区行）、第二个请求不重复、`.llm/` 进 `.git/info/exclude` 且 check-ignore 复核为忽略。
- 文档：DESIGN §2.2 行表、§7 降级表、组合顺序两句；ORCHESTRATION §7.1 实现注、§7.4 草稿区位置。
- 门禁：build OK；preflight OK（14 src dirs、17 rows）；test fail 0（eslint 244 suppressed、knip 21 baseline、jscpd 2 baseline）。

### m4-suppressions — done，commit `e85daf0`（已推；后续 `d879c8f` 只清理误入的 package-lock.json）

- `src/shared/suppression-markers.ts`（16 个标记，G3/E4 共用的那一份；G3 未做，本步先建）。
- `src/env/suppressions.ts`：`git ls-files -z` 遍历已跟踪文件（>1 MiB 与二进制跳过），按标记计数（最长标记先数并从文本移除，`eslint-disable-next-line` 不会同时算 `eslint-disable`）；每仓库每 UTC+8 天至多一条 `{at, repo, total, byMarker}` 追加进 `<根>/.llm/audit/suppressions.jsonl`（进程内 memo + 读流水末行双保险）；后台跑，失败只报行健康。指标计数事件未交（指标服务的行还没有；设计 §3.11「服务不在时什么都不做」）。
- 晨报例外节之后一行「压制注释 N 处（本期 +a / −b）」：a/b 按当期逐日记录的增量累加，同一天多条按序取；无记录不出行。`auditPaths` 加 `suppressions`。
- `src/data/git-process.ts`：两处内联的 execFile git 包装合并（jscpd 克隆因此消除）；`readJsonl`/`inPeriod` 改泛型，晨报的四处 `as X[]` 断言删除，eslint-suppressions.json 缩小 8 条（249→244，棘轮向下）。
- 测试：`tests/env-suppressions.spec.ts`（5）。文档：ORCHESTRATION §7.6 实现注。
- 门禁：build OK；preflight OK；test fail 0。

## 探针

`npm run probe` 在批内最终运行时树（`07f0a4c`，含 env 行与压制计数与两笔探针检查修正）上跑：**213/213 通过，exit 0**（工件在 worktree `.llm/probe-runs/2026-11-02T11-04-03-595Z`）。中途两轮失败都在探针检查自身的写法，不在被测行为：真实宿主把 skills 提醒排在步末尾，检查改为按来源 `hourness-env` 找提醒；`execFileSync` 在 `stdio: 'ignore'` 下返回 null，改为 `spawnSync` 的 status。两处修正各一个提交（`9149286`、`07f0a4c`）。

## 追加：m4-gate 的第一片（G1 地基），commit `d012455`（已推）

- `src/guard/records.ts`：流水记录类型（ViolationRecord 带未来的 `call`/`ref` 字段、RecordedCall、ShadowRecord）、唯一的 `classifyRecord`（设计 §3.2 的分类表逐条实现：denial、规则板四种、旧名 shadow 带 paths 记 late-denial、其余 unknown）、`recordKey`/`keyOf`（行文本 SHA-256 前 12 位）、`subjectOf`（shell 文本截 8 KiB 或文件目标）。guard/index.ts 改为从 records.ts 再导出；晨报的 violations 输入收窄为今天读的三种（G1 的过滤改用它时换 classifyRecord）。
- 测试 `tests/guard-records.spec.ts`（4）：分类表逐例、键、subject 提取；已进 npm test 脚本。
- 有意不进本提交的：followup/request/grant/grant-void/lift/gap 六种记录类型——写入方（G1 的门、G2-G4）不在，留着就是死代码（knip 也拦）；G1 的门提交随写入方一起加，设计 G1 一行本来就是这么做的。
- 门禁：build OK；preflight OK；test fail 0（eslint 244、knip 21、jscpd 2）。类型搬移与新增纯函数，不碰探针覆盖的运行时行为。

## 未完成（留下一批）与跳过（带原因）

### m4-gate — G1 完成（`d012455` 地基 + `362e66a` 安装函数，详见 gate-progress.md），G2 完成（`52a36f6`），G3/G4 留下

G1 的安装函数与旧 `evaluate` 路径的删除已完成并推送（commit `362e66a`，记录在 `.agents/tasks/m4/gate-progress.md`，该文件在 .agents/ 里不入 git）。G2 于 2026-11-04 完成，见下节。G3（撤下：`guard_lift` 工具、`glmHournessLifts` 服务、`lift-files-only`、三条新规则 `suppression-reason`/`checker-config`/`scratch-only`、判定上下文 `context.ts`、`mention.ts` 抽出、`shadow.ts` 改名 `fallback.ts` 与事后纠正、晨报撤下行与 lifts.jsonl 对账、§6.4 表改写、ORCHESTRATION §6.4 每行写明实现与状态〔m4-rules 验收第 3 条〕）不等别的设计，可随时开工。G4 等 M3 第 4 步（`dispatchRoot`）——注意分支经主检合并后 `src/guard/main-agent.ts` 与 `src/guard/git-snapshot.ts` 已可见，G4 开工前按设计 §5 重新核对依赖到位，跳过理由（本文件下方 m4-request-card 节）可能已过时。开工前重读 §3 全节、`src/guard/lift.ts`（G1 已建）与规则板判定路径。

### m4-rules — 部分跳过

- 三条新规则（`suppression-reason`、`checker-config`、`scratch-only`）在 G3 里，随 m4-gate 留下。标记表已就位（本批 `src/shared/suppression-markers.ts`）。
- 验收第 2 条（第三次修复问人，R1）**跳过**：依赖 M3 第 6 步（提议式待决、`record_human_answer` 的 question 一种、不带四行的 `propose_to_human`），这些都不在 main——`src/graph/proposal.ts` 今天只有 `renderProposal`，`src/graph/tools.ts` 没有 `propose_to_human`。
- 验收第 3 条（ORCHESTRATION §6.4 每行写明实现与状态）随 G3 一起做。

### m4-checks — 跳过

E3 等循环板的共用执行器：设计点名要导入 `runCommand({queue: 'direct'})` 与 `resolveProgram`（`src/loops/script.ts`，循环板 S1/S3）。main 上没有这个模块，`src/loops/run.ts:564-567` 明确写着脚本与检查条目一律 refused（`unadopted`/`check-missing`），共用执行器与同意路径「not built」。其余依赖（service 的 contribute/emit/listens/recordRun、`matchesFilter`）都已在 main。不为 M4 另写第二套执行器（设计 §2.2「不加的东西」），等循环板合入后做。

### m4-request-card — 跳过

G4 等 M3 第 4 步：`src/guard/main-agent.ts` 的 `dispatchRoot` 与两条写入规则、`git-snapshot.ts`——都不在 main（src/guard/ 下没有 main-agent.ts）。`plain-question.ts`、`proposal.ts` 的渲染已在（M3 第 1-3 步合入过），但派发链的根没有，申报的子 agent 路由无从谈起。

## 与设计的偏差（agent 定、 reversible，§13.5 第一档）

1. `ensureLlmIgnored` 放在 `src/data/llm-ignore.ts`，不是设计构件表的 `src/shared/llm-ignore.ts`：eslint 边界规则禁止 `src/shared/` 导入包内目录（`src/data/project-root.ts` 的 `ensureIgnored` 是唯一实现），同包放置保住「仓库里只有一份追加实现」。G1 的 guard 行导入时同样从 `src/data/` 取。
2. `scratchLeftovers` 返回 `{files, total}`，不是设计签名的 `Promise<readonly string[]>`——「另报总数」没有着落处；M7 接入时用它拼拒绝文案。
3. 晨报的 +a/−b 按当期逐日增量累加（设计只说「取本期第一条与最后一条」）：净零但有涨跌的期间也能看出来；无涨跌写「压制注释 N 处」不带括号。
4. 探针在批次最终树上跑一次，不是每个提交各跑一次（runner 的最低要求「end of the run」）；每个提交的树都过了 build/preflight/test。
5. m4-env 的 E1+E2 合成一个提交（runner 口径「one commit per task」）；设计步表的 G1/E1/E2 拆分留给 m4-gate 那批。
6. `package-lock.json` 是本 worktree `npm install` 的产物，误入两个提交后以 `d879c8f` 移出并加进 `.gitignore`（仓库只留 pnpm-lock.yaml）。
7. 失败优先（failing-first）没有逐字执行：这三个任务的代码都是纯新增（不改既有行为），新 spec 在父提交上的失败形态是「模块不存在」，没有信息量；设计步表的「今天必败」栏与探针场景承担了这个角色（env-notice 场景在父提交上不存在、注册清单测试在父提交上少一行）。m4-gate 的 G1 改既有行为，那批要按设计做真正的失败优先。

## 探针结果

213/213 通过（exit 0），运行时树 `07f0a4c`；其后两笔提交（d012455 类型搬移、纯函数新增）不碰探针覆盖的运行时行为。

## 追加：m4-gate G2（跟进记录器批次），commit `52a36f6`（已推，2026-11-04）

### 接手与 WIP 处置

前任 agent 在模型配额耗尽时留下未提交的 G2 WIP（14 改 + 8 新文件）。接手后先原样捕获：`.agents/tasks/m4/g2-wip-dead-agent.patch`（647 行）与同目录 untracked tarball，处置记录随之保留。审计结论：整体连贯、按设计形状落码，大部分保留；五处修补、一处补齐后提交。逐字契约核对过三处：`ToolExecutionPayload.callId` 对 rc.3 实源（dsh-tools `lib/index.js:3230` createExecution）、`tool/call` 事件数据形状对 dsh-agent-loop `appendToolCall`（:681–686）、`:deferred` 后缀对 `src/toolsearch/index.ts` execute 与 ZCode 3.17.1 的 `DeferredToolCall` schema。

### 修补（对 WIP 的改动）

1. 探针场景 `guard-followup` 按设计 §14.1 重写（最大一处）：WIP 版本只测 guard 行（两次 shell 拒绝 + none），测不出设计点名要它证的「图行与 guard 行共用一个记录器」（§3.3，F5）；设计版是图副本 + 图行 overlay，三次拒绝三次跟进 `repeat`（图行结算）/`other`/`right-path`。检查断言放宽为因果形状（跟进序列 `graph-files-only:repeat,graph-files-only:other,file-tools-only:right-path` + 图拒绝 ×2 + Bash 拒绝存在 + 文件断言），不钉跨行行序：图行与 guard 行的 journal 是两个实例并发追加同一文件，实测一次 Bash 拒绝行（at .168）晚于它的跟进（at .198）落盘——guard 行 journal 实例首写冷启动所致；跟进记录引用的 `denial` 键与拒绝行的 `keyOf` 精确匹配（实测 `72b67e621922`），因果无损。
2. 晨报每规则一行的「原样重试 n 次」并回同一行（设计 §3.10 示例格式 `- 拦下 <规则> × n（最近一次：…） · 拦截后下一步走对 x/y · 原样重试 k 次`），删去 WIP 的「另写一行」写法与 ORCHESTRATION.md §6.5 里相应的错描。
3. 晨报汇总行的比例覆盖所有有分母的规则（含拒绝全部在当期之外的规则——它的跟进在当期结算）；WIP 版本这类规则只把 `none` 计入「停下来」、其余跟进丢弃，一半进一半不进。
4. `src/guard/cli.ts` stats 去掉 `since` 二次过滤：CLI 已用自己的时钟截断流水，ruleStats 再按相对天数截一次会跟列表用的界不一致。
5. `scripts/guard/cli.mjs` 头注 DEVELOPMENT 引用 §4→§15。
6. 补齐设计 §3.3 点名、且 G2 探针场景必需的 rightPath：`fileToolsOnly`（下一次调用为文件工具写入，`fileToolTargetOf` 判）与 `graphFilesOnly`（图的写工具，纠偏文本点名的八个）；requestable 三规则（圈禁、checker-config、scratch-only）的 rightPath 随申报通道在 G4。L2 加一条真实规则测试钉住（graph 读取工具不算走对）。

### 落地内容（承接 WIP 保留部分）

- `src/guard/followup.ts`：模块级记录器（§3.3 逐条——observe 结算、`tool/call` 事件判模型发出、同 turn+step 跳过（N16）、DeferredToolCall 拆包结算并双 id 记账（F9）、`turn/end` 与 `session/disposed` 记 none（N15）、经 `tools.execute` 的非模型调用不结算）；内存上限 256 待判 / 512 已结算 id / 每会话 512 事件 / 64 会话。
- `src/guard/gate.ts`：监听器第一步 observe（F5，最外层结算一次）、`hookJournal` 把结算记录经行 journal 落盘（丢盘按 §3.1 第 7 步计数）、每个拒绝经 `noteDenial` 待判并桥接规则的 rightPath、拒绝与跟进各交一条指标事件。
- `src/rules/gate.ts`：规则板工具门接同一记录器——第一步 observe，拦下与开单拒绝 `noteDenial`（无 rightPath，`key` 是它写下的拒绝记录 `keyOf`）；晚到拦下不调（§3.3 跨行）。
- `src/guard/measure.ts` `ruleStats`（§3.3/§3.10）：每规则按 scope 的拒绝数、跟进四类、最近一次的样子（60 字符）；全流水缺口合计 `unrecorded`。晨报、命令行、（G3 的）规则页共用。
- `src/guard/metrics.ts` `emitGuardMetric`（§3.11）：服务名 `glmHournessMetrics` 为占位，指标设计定稿前服务不在则什么都不做。
- `src/guard/cli.ts` + `scripts/guard/cli.mjs` + 根 `package.json` 的 `guard` 脚本（§3.9）：只读 `records [--since] [--rule] [--show] [--home]` / `stats`，退出码 0/2，用法见 `DEVELOPMENT.md` §15。
- 晨报（§3.10 G2 部分）：每被拦规则一行 + 「拦截后下一步走对」汇总行（分母不含 none，N30；另有 n 次停下来交给人或上级）。
- `tests/fake-rc3.ts`：根调用 `tool/call` 事件先于 pre-execute、`turn/end`、`session/disposed`、`progress`（turn/step）。
- 测试：`tests/guard-followup.spec.ts`（14）、`tests/guard-measure.spec.ts`（5）、`tests/workflow.spec.ts` +3；全部进 npm test 脚本。
- 文档：`docs/DEVELOPMENT.md` §15（拦截命令行）、`docs/ORCHESTRATION.md` §6.3 度量句与 §6.5 误拦看得见一行。

### 门禁（最终树 `52a36f6`）

- `npm run build` exit 0；`npm run preflight` exit 0（2 包、15 src 目录、18 行——数字比 G1 记录的 14/17 高，是两次 main 合并带来的，不是本批）。
- `npm test` exit 0（136 套 TAP、2552 测试、0 败）；棘轮 eslint 76 suppressed、knip 19、jscpd 1，全部不高于现行基线（main 合并后基线本身已从 G1 时的 244/21/2 降下来；本批零新增压制）。
- `npm run -s probe` exit 0，327/327（含新场景 guard-followup）。口径注记：探针在分支自己的基（4c315a9 合并，rules/loops 行仍 `disabled: true`）上跑，行经 overlay 启用；main 已越过本分支合并点（e35c422 起），本批按指示不再合并，探针期望不依赖行的 shipped 状态。

### 与设计的偏差（agent 定，可逆）

1. 探针检查不钉跨行拒绝行序（见修补 1 的实测记录）；设计 §14.1 的「第一次图写入之后 repeat」按因果读，不按文件行序读。
2. `followupOf` 的参数摘要按键排序的 canonical JSON 比较（设计只说「参数摘要相同」）；测试钉住同参异序算 repeat。
3. 规则板开单拒绝（`effect: 'queue'` 的 deferral 拒绝）也调 `noteDenial`：设计说「拦下与开单拒绝时」，按文面执行。
4. 指标服务名 `glmHournessMetrics` 是占位常量，指标设计的行落地时对齐（§3.11「服务名与信封由指标设计定」）。
5. G2 步表未列 rules.ts/graph-files.ts，rightPath 两函数随本批落地：G2 的 L3 场景（设计的 §14.1）必须它们在场才能过，且无 G3/G4 依赖。
