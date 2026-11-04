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

## 追加：m4-rules R1（第三次修复问人）与 m4-rest 收尾，2026-11-04

分支 `m4-rest`（worktree `.worktrees/m4`，起点 main@4ee9d11）。本批先核实了两条线的完成度，再落地 R1：

- **E4 已在 main**（`e85daf0`，第一批 m4-suppressions）：标记表、每日计数、晨报一行、`suppression-reason` 的数据、`tests/env-suppressions.spec.ts`、ORCHESTRATION §7.6 实现注逐件核对在场。指标计数事件仍按 §3.11「服务不在则什么都不做」（main 上只有 G2 的占位 `METRICS_SERVICE`，指标设计的行未落地）。status-hub 批 4 在 origin/status-hub-2 上的 `src/env/status.ts` 读取的正是这份计数，本批不重复实现。
- **C1 已在 main**（`154ecaa`，第一批 m4-cleanup）：主检出 `.llm/docs/` 只剩 `_bigmodel_md/`，digest 的附逐字列了三个脚本的字面量与重抓办法，ORCHESTRATION §7.4 末句已改写。
- **R1 本批落地**：`src/graph/reopen.ts`（`REOPEN_LIMIT`、`reopenCount`/`reopensAfter`、`thirdReworkState`（认法：首条历史是 harness 的 propose 且 `reason` 恰为 `第三次修复：<节点 id>`，正文被改照样认得；`since` 取最近一张已关闭待决的最后一条状态历史时刻）、`reopenQuestion`（题目与四行逐字照 §4.6，附里三次重开的时刻（UTC+8）与理由截 40 码点并转义，F18 退路写法）、三种 notice）；`src/graph/tools.ts`（`graph_status` 的 done→doing 且未带 relay 的重开之后走钩子：数满 3、节点下无未关闭的这类待决才提；`harness` 身份 propose，stale_revision 重试一次；输出 schema 加可选 `notice`；`graphTools` 加 `ThirdReworkReport`（loops 读取器 + 行健康 problem））；`src/graph/loop-entry.ts`（`graph.third-reopen` 事件（listedOnly，不 emit）与 `graph.third-rework` 条目（self），ownRules 一行由常量拼；`installLoopEntry`：有 inject 走 inject（回调返回 dispose 作撤回），否则每 agent/created 重交，问题告警一次并行健康）；`src/graph/index.ts` 接线；`src/graph/plan-text.ts` 导出 `escapeText`（附行与路径共用同一份转义）。
- 测试：`tests/graph-reopen.spec.ts`（8：计数与认法、since 重置、逐字钉题目与四行、F12 真实引擎提一次、附的转义与截断、F18 三个标题（plain-ui 第二阶段未合入，`M<数字>` 例按 plainWordsIn 走题目路径并在测试里写明）、notice 三种）、`tests/graph-loop-entry.spec.ts`（10：validateContribution 契约、ownRules 一行由常量拼、工具路径的第三次重开交 notice 与 recordRun、relay 不问、决定后重数、子 agent 短 notice、板不在照常问、contribute 拒绝告警一次并行健康、recordRun 抛错是行健康 note、inject 路径交接）。两个 spec 进 `package.json` 的 test:1。
- 文档：ORCHESTRATION §2.4 第三次修复一条整句改写（数法、问法、认法、实现注）、§2.9 异步行把第三次修复移出卡队列、§6.4 目录行的「走决策卡」改「问人」并补实现状态。

### 与设计的偏差（agent 定，可逆）

1. **记录的字段落在今天的引擎形状上**：§4.6 的表列 `background`/`doubt` 字段，但 M3 附录 0.6 已把这两个图字段取消（G4 的偏差 1 同源）；今天引擎的 proposal 形状是 `form/ask/proposal/reason/cost/ways/notTaken`。四行内容按 §16 的 N22 裁定（「M4 只给记录的字段，版式在 M3」）落在 `reason`（背景）/`proposal`（推荐）/`cost`（疑问）/`notTaken`（不做），每行仍过 `proposalLineRefusal` 的加粗与行长规则；`ask` 是问话「先停下查原因，可以吗？」。与 G4 的 plan-text.ts（四行格式）一致。
2. **showText 与 notice**：今天的 `propose_to_human` 必带 agent 自己的 `text` 且 `textCoversRecord` 要求推荐与理由逐字在句子里（带加粗记号），所以 notice 给出由四行拼成的一句 showText 让主 Agent 原样传给工具；设计 §4.6 的「M3 原样渲染、不带题目与四行」是按 0.5 渲染器写的，今天的渲染器正是「不带四行」的那种。
3. `since` 的「最后一条状态历史」取该待决历史里最后一条带 `to` 的记录（propose/approve/reject/status/decide），edit 与 comment 不算。
4. 附的重开时刻按 UTC+8 格式化（与压制计数的日键同一时区惯例），设计只给了 `10-29 14:02` 的样子；计满超过 3 次（上一次提问失败）时引用窗口内最近三次、序号按窗口内的位次。
5. `graphTools` 的第三参 `ThirdReworkReport` 是本批加的接口（loops 读取器与行健康 problem），不传时提问照常、只是不报板上。
6. graph 行的 agent/created 监听器注册顺序：installLoopEntry 的 fallback 排在投影监听器之后（graph-reminder.spec 取第一个监听器的既有约定）。

### 门禁（最终树）

- `npm run build` exit 0；`npm run preflight` exit 0（2 包、15 src、18 行）。
- `npm test` exit 0（2673 测试，0 败）；棘轮 eslint 76 suppressed、knip 19、jscpd 1，与基线持平，零新增。
- `npm run -s probe` exit 0，349/349（比 G4 的 344 多 5 条来自 main 侧合并带进的其他批次的检查，非本批新增场景；现有图场景照旧通过）。

### E3（m4-checks）仍然 BLOCKED，等循环板

等的是：循环板里 M4 要导入的几样合入——`src/loops/script.ts`（共用执行器：`runCommand` 的 `queue: 'direct'`、`resolveProgram`；循环板 S1/S3）。main 上没有这个模块，`src/loops/run.ts` 明确写着脚本与检查条目一律 refused（`unadopted`/`check-missing`），共用执行器与同意路径「not built」。其余依赖（`src/loops/trigger.ts` 的 `matchesFilter`、`model.ts`、`service.ts` 的 contribute/emit/listens/recordRun）已在 main。不为 M4 另写第二套执行器（设计 §2.2「不加的东西」）。E3 合入时同时补 `src/env/loop-entry.ts` 与 env 侧的循环板契约测试（§6.8 由后合入的一方加）。

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

## 追加：m4-gate G3（三条规则、撤下与事后纠正），2026-11-04

### 落地内容

- 判定上下文（§4.1）：`src/guard/context.ts` 的 `prepareContext`（`RuleContext`、`ContextIo`、5 秒总限、1 MiB 内容上限、tracked 60 秒缓存、图按修订缓存且失败回退上次好读的一份；未知事实规则放行）；`src/guard/mention.ts` 抽出 `pathKey`/`mentionsPath`；`src/data/project-root.ts` 加 `checkoutRootOf`（最近 `.git`，不跟 commidr，N23：工作树答自己的检出）。
- 三条规则：`src/guard/suppression.ts`（`suppressionOnly`，压制注释逐标记计数、节点 id 对图核、§4.3 纠偏原文）、`src/guard/checker-config.ts`（`checkerConfigOnly`，内建清单 + 图上 env 工具节点的 config 行按检出相对路径比对、纠偏带 `request_exception` 编号）、`src/guard/scratch.ts` 扩展（`scratchOnly`，脚本扩展名清单、`.llm/scratch/` 下放行、同扩展名已跟踪文件所在目录放行）。
- 撤下（§3.5）：`src/guard/lift.ts`（`liftStatesOf` 共享解析、`liftedRulesOf`/`liftedRules` 按 stat 缓存、`appendLift`、原话词表与否定读取、`guardLift` 七步与拒绝码）、`src/guard/lift-service.ts`（`glmHournessLifts`：`resolveLiftRule` 先精确 id 再剥一层 `<row>:`、`setLifted`、`lifted`）、`src/guard/lift-files.ts`（规则 `lift-files-only`，`liftVia: 'board'`，主检出与 `git worktree` 工作树里那份都拦）、`guard_lift` 工具（严格三字段，`GUARD_TOOL_NAMES` 常量与 contracts 钉住）。
- 事后纠正（§3.4）：`src/guard/shadow.ts` `git mv` 为 `src/guard/fallback.ts`，晚到的拦下（`mode: 'late'`、`via: 'turn-end'`）加每回合一条排队纠正（至多 8 条、FIFO、会话卸载即弃），`src/guard/index.ts` 的 `agent/created` 给根 agent 装第二条 step notice（来源 `hourness-guard`，system-reminder 包裹，至多 10 文件/3 命令（各 80 字符）/600 字符）。
- 晨报（§3.10 G3 部分）：「撤下的规则」一行（对话与规则板两种写法）与 `lifts.jsonl` 对账（终态 + 逐行按 at/rule/action，换电脑的合并行，未提交一行）；`ReportOptions.root` 与 `RenderOptions.root`，`/hourness` 用 `projectOf(cwd)?.root` 填，没有 root 不对账不抛错。
- 目录与文档：`src/guard/catalog.ts` +4 条；`docs/ORCHESTRATION.md` §6.4 表加「在哪实现/状态」两列、§6.5 撤下一条改「已实现」、§6.5.2 整节改写（兜底=晚到的拦下+下一步纠正）、§14 借用表该行更名。
- 测试：`tests/guard-new-rules.spec.ts`（11）、`tests/guard-lift.spec.ts`（16）、`tests/guard-fallback.spec.ts`（4，真实临时仓库与工作树）；contracts 钉 `GUARD_TOOL_NAMES` 与注册、rules-builtin 目录计数 +4、hourness 加 root 对账、guard-audit/health 措辞与 fixture 更新。
- 探针：新场景 `guard-new-rules`（GLM 与 deepseek-probe 各一）、`guard-lift`（GLM）、`guard-fallback`（GLM）；`scripts/probe/probe-lift.mjs` 覆盖插件扮演人与规则板；`glm-shadow` 的影子记录期望改为晚到拦下；共 337 检查。

### 探针揭出的两个真问题（都在本批修掉）

1. guard 行没有声明 `inject: [tools]`：G3 之前行不注册工具，`ctx.tools` 的访问在 cordis 里抛「cannot get property without inject」，整行激活失败——探针第一跑每个场景都报「1 entry did not activate」。修：`packages/hourness/cordis.patch.yml` guard 行加 `inject: [tools]`，模块导出 `inject`。G1/G2 的探针绿不暴露它（行没碰过 tools 面）。
2. `scratchOnly` 在 tracked 清单未知时误拦（实现把未知当「没有同扩展名文件」），违背 §4.1「事实未知放行」——graph-guard 的临时目录 fixture 抓到。修：tracked 未知或目标不在任何检出里都放行；guard-new-rules 加显式用例钉住。

### 探针扮演人的机制注记（G4 的 `guard-request` 直接复用）

turn/end 之后 `agent.followup` 打不进去：模型最后一次文本回复后宿主同拍拆掉 agentLoop，inbox 投影注销，followup 抛「cannot read inbox state: its projection registration is not active」。probe-lift 改为注册两个探针工具，让脚本化的模型在回合中调用：`probe_say {text, rpcId?}`（`agent.followup` 排队下一条人的消息，回合结束即开新回合，`guard_lift` 从它读原话）与 `probe_restore {rule}`（经 `glmHournessLifts.setLifted` 走规则板那一路再排队板子的话）。G4 的申报场景按同一形状扮演人。

### 与设计的偏差（agent 定，可逆）

1. 契约测试的第三条断言（图上每个带「规则：」标签的规范节点 ↔ 目录一条）没有加：五条规范节点不带「规则：」标签，节点是编排人的泳道（§18 第 3 条）——保持单向测试（目录每条都能对上实装的规则），本文件记录在案。
2. 探针检查断言的是「三规则的拒绝都在流水里、没有别的规则、scope 全对」，不是设计行文的「恰好三条拒绝」：`judge` 保留全部拒绝（G1 定案），一次 bare 压制注释同时留下 suppression-reason 与 scratch-only 两条拒绝记录；设计行文按每调用一条写。
3. 撤下场景的流水断言不钉「拒绝与其跟进」的相邻行序（G2 已确立跨实例行序不钉），改为计数与因果断言：两条 lift 记录（chat 带原话、board 带命令）、lift-files-only 拒绝恰两条（工作树那份的 F14 证据）、工作树写伴随一条圈禁拒绝、每条拒绝有跟进结算。
4. guard-fallback 的「再下一步没有」按「不再新增」断言：纠正一经投递就进会话历史，后续请求按历史重放它，不是消失。
5. `guard-rules.spec.ts` 的事故表没有为三条新规则加种子：它们的表驱动用例（应拦与相邻不该拦，§3.7）整表落在 `tests/guard-new-rules.spec.ts`，真实临时仓库跑 tracked 清单与图读取。
6. `probe-lift` 的 restore 走 `guard:scratch-only`（带行前缀），顺带钉住服务的一层剥前缀解析。

### 门禁（最终树，2026-11-04）

- `npm run build` exit 0；`npm run preflight` exit 0（2 包、15 src、18 行）。
- `npm test` exit 0（2554 测试全过）；棘轮 eslint 76 suppressed、knip 19、jscpd 1，与基线持平，零新增。
- `npm run -s probe` exit 0，337/337（G2 时 327；净增来自三个新场景与 glm-shadow/health 期望更新）。探针口径同 G2：分支自己的基（rules/loops 行仍出厂禁用），行经 overlay 启用。

### G4 的依赖核对（用户要求在 G3 末尾做）

设计 §5 依赖的 M3 件已全部在树上：`src/guard/main-agent.ts`（`installMainAgentRules`）、`src/guard/git-snapshot.ts`、派发链的根 `dispatchRoot` 在 `src/guard/design-release.ts`（沿 `parentSession` 上溯，`origin: 'subagent'` 链，M3 §3.3.3 的实现）；`plain-question.ts`、`proposal.ts` 的渲染也在。结论：G4 不必等，随 G3 合入后即可开工。

## 追加：m4-gate G4（申报通道 `m4-request-card`），2026-11-04

### 落地内容

- 申报通道的内存与常量（§5.2-§5.3）：`src/guard/request.ts`（`REQUESTABLE` 三规则、`APPROVAL_WORDS`/`DECLINE_WORDS` 整句词表、`exceptionOf` 三种调用方的例外句（根/子/worker，§5.2 表）、`signatureOf`（SHA-256 前 16 位，目标按 `normalizePath(resolve(base,…))` 换算）、`normalizeShown`/`normalizeWords`、`GrantBook`（`find` 跳过使用中与过期、`markInUse`/`consume`/`release`、`void`）、`RefusalBook`（64 条 FIFO）、`REQUEST_EXAMPLE` + `REQUEST_DESCRIPTION`（§5.3 逐字，F20）、`GRANT_TTL_MS`/`REQUEST_TTL_MS`/`REFUSAL_LIMIT`、`GrantEntry`（带可变 `backupPath`）。
- 申报台（§5.3-§5.6、§5.9）：`src/guard/request-service.ts` 的 `createRequestDesk`——`registerDenied`（编号可外部给入，拒绝表 + 被拒 agent 记忆）、`requestException`（§5.3 检查顺序：subagent forbidden → 四字段 strict → 拒绝表/派发链根/2 小时 → 未用放行直接 `approved`（带工具与参数与 `expires`）→ 本会话忙/同编号重放 → 5a `propose_to_human` 已出示则 busy → 目标事实（ENOENT 记不存在，其余 `unavailable` 带错误码）→ `buildPlan`（抛错降级 `unavailable`，F18，行健康 note））、`buildPlan`（§5.4 表逐处换事实：存在/大小/mtime、备份可得性、edit 的改动前后、规则各自的题目与疑问行、三句原话加引号转义、内容预览、2000 字符先截预览再截原话；`lines` 带 `title` 给面板）、`readReply`（§5.5：时钟过期→关；客户端消息（kind user + rpcId）→ 展示核对（末条助手消息无工具调用块、文本规范化后以 tail 结尾、中间无人话）→ 词表判定（放行写 `GrantEntry` + 说明带被拒调用逐字参数、4 KiB 以上写 `requests/<ref>.call.json`；不放行词 declined；其余 unclear，tail 换确认句、第三次关闭）→ not-client / 首步 still-waits / not-shown）、2 小时 `unref` 定时器 + 时钟兜底、`lapseOrphans`（每 agent 一次扫描 ask 结果，F15）、`prepareGrant`（使用时核对：事实变→`void`；一致→`copyFile` 备份到 `requests/<ref>.before`，失败 `backup-failed` 不作废）、`service`（`outsideDenial` F19 按项目判：目标与调用方同项目或在行配置圈内→undefined；否则登记编号、给 worker 句）、`peekGrant`、`openRequests`、`requestsService` 读取器（形状不对报一次）。
- 接线：`src/guard/rules.ts` 的 `workspaceContainment(roots, base, exception?, ref?)`（拒绝带 `ref`，例外句按调用方；带编号时 rightPath = 下一次是 `request_exception`）；`checker-config.ts`/`scratch.ts` 的拒绝带 `ref`；`src/guard/gate.ts` 加 `registerRequestableDenial` 与 `grants` 钩子（匹配→使用时核对→`carried` 去掉该规则拒绝、`markInUse`/`consume`/`release`、`void`/`backup-failed` 各按 §5.6 的英文拒绝句，`GrantRecord`/`GrantVoidRecord` 记流水）；`src/guard/index.ts` 建 books + desk、`rules()` 每调用预生成编号并按调用方给例外句、`request_exception` 工具（逐字描述 + 示范、严格四字段、输出 `{outcome, ref, text?, lines?, tool?, arguments?, expires?, message}`）、根 agent 的 `hourness-request` 步 notice（`lapseOrphans` + `readReply`，首步仍等）、`ctx.provide(REQUESTS_SERVICE)`；`src/shared/step-notice.ts` 的 builder 参数加 `step`；`src/shared/tool-names.ts` 的 `GUARD_TOOL_NAMES` 加 `request_exception`；`src/guard/design-release.ts` 导出 `dispatchRoot`；`src/guard/records.ts` 导出三个申报记录类型。
- 四行规则的落点（§5.4 与 M3 附录 0.6 的裁定）：`src/graph/plan-text.ts`（`PROPOSAL_LABELS`、`splitBold`、`proposalLineRefusal`、`displayPath`、`personTitle`、`renderPlan`——只查 harness 常量，路径与焦点标题经转换后原样进文，F18；`schema.ts` 的 `PLAIN_LIMITS` 加 `background: 60`，上限归 plain-ui）。
- 晨报（§5.8）：「申报 n 次：放行 a（已用 u、作废 v）、不放行 d、没答 q」一行，数字取 `classifyRecord` 分出的 request/grant/grant-void 三类。
- 测试：`tests/plan-text.spec.ts`（7）、`tests/guard-request.spec.ts`（18：检查顺序逐码、六种申报文字变体、回话各认法、放行一次性、备份、`outsideDenial` F19、`peekGrant`、lapsed、F20 示范过真检查、晨报一行）；`tests/contracts.spec.ts` 的 `GUARD_TOOL_NAMES` 钉两个名字。
- 探针：`scripts/probe/probe-llm.mjs` 加 `{ref}` 替换（会话里最近命名的一个编号）与 `echoToolText` 步（true=以申报文字收尾；字符串=文字后再补一句，not-shown 用）；`scripts/probe/run-probe.mjs` 加场景 `guard-request`（GLM 与 deepseek-probe 各一）、`guard-request-refuse`（四个回合：无 rpcId 的 可以→not-client、可以吗→unclear+确认句、确认句后 可以→approved 且写入、文字后再补一句→not-shown 仍拒）、`guard-request-goal`（probe_goal_run 的目标 agent 是第二根 agent，goal 驱动下每回合首步无人的消息有 still-waits、放行后写入、F15 配对）；共 7 条新检查。
- 文档：`docs/ORCHESTRATION.md` §5 加申报通道段（同步卡行的出工作区写入改指申报通道）、§6.1 头一行与现状段改写（申报已接通、圈禁补 str_replace_editor、file-tools-only 不可申报）、§6.4 圈禁行状态补两笔。

### 探针的第二处环境事实（不改代码，写进断言）

1. 探针宿主跑在 rc.3 的 workspace-write 沙箱下：放行后的写入过了 guard 门的核对与备份（`GrantRecord` 落流水、`requests/<ref>.before` 落盘、放行簿用掉），真正写文件那一下被 rc.3 自己的沙箱拒（`[sandbox: file access denied under workspace-write mode]`）。这不是门的缺陷——设计 §5.1 第 6 步的「写执行」在无沙箱的会话里成立；探针断言改为「放行的调用越过门禁、错误是沙箱而非圈禁、第三次同调用被新编号拒绝」，文件落地交给无沙箱环境。

2. 探针的步表与场景请求错一位（首个自举请求不在步表里）：检查的下标以实跑步表为准；`guard-request`/`guard-request-refuse` 不再先 `LocalToolSearch`——`DeferredToolCall` 不要求先检索（设计 §5.3），删去后拒绝的跟进恰好按 §5.1 结算为 `right-path`。
### 门禁（最终树）

- `npm run build` exit 0；`npm run preflight` exit 0（2 包、15 src、18 行）；`npm test` exit 0（2579 测试，136 套 TAP）；棘轮 eslint 76 suppressed、knip 19、jscpd 1，与基线持平，零新增（spec 文件经 package.json 的 test 脚本进 knip 入口）。
- `npm run -s probe` exit 0，344/344（G3 时 337；净增 7 条来自四个新场景）。跑到全绿共七跑：第一跑 337/344（{ref} 替换拿到示范编号）、二跑 337/344（检查下标与实跑步表错一位）、三跑 339/344（放行后的写入被探针宿主的 workspace-write 沙箱拦下）、四跑 342/344（refuse 的第三次人的话误用确认句本身——只有「可以」算数，正是设计的行为）、五跑 343/344、六跑 343/344（批准说明里的工具名是原生 `write`，检查误期 `Write`）、七跑全绿。前两跑是探针自身的问题，后五跑每一条都是真实行为与断言对齐的过程；探针宿主沙箱的限制已写进断言（见上节）。

### 探针揭出的一个真问题（本批修掉）

1. `{ref}` 替换的第一版取「会话里最后一个 r-xxxxxxxx」：`request_exception` 的工具描述里带着 F20 示范自己的编号 `r-3k9d2m7q`，检索结果又紧跟在拒绝错误之后——第一次申报拿到的是示范编号，工具答 `not_found`（第一跑 337/344，七条新检查全红的根因）。修：锚定拒绝句的两种拼法（圈禁的 `request_exception {"ref": "r-…"}` 与新规则的 `call request_exception with ref "r-…"`），只从工具结果消息里取。
### 与设计的偏差（agent 定，可逆）

1. 四行规则与标签落在 `src/graph/plan-text.ts`，不在设计的 `proposal.ts`：M3 附录 0.6 已把 proposal.ts 的四行机制整段取消（`PROPOSAL_FIELDS` 名被占），0.6-finish2 §18 让 M4 自建；格式与上限逐字照 §5.4 与附录 §3.3，M3 侧后续改成从这里导入。
2. 申报推荐行的「改 1 处」是每调用一处（edit/str_replace 一次一处；str_replace 的 replace_all 不数），设计 §5.4 表写「改 <n> 处」；不读目标内容，n 无法在申报时求真，取 1。
3. `readReply` 的批准说明第二行（普通子 agent 句）写死在申报台：设计 §5.5 表的三种第二行里，worker 句按 §5.2 表的句子（无任务 id——M7 未合入，`RefusalEntry` 不带 task 字段；M7 合入时由它的 `OutsideCall.task` 补）。
4. `expireDue` 留在申报台 API 上（定时器丢失时按下一步时刻兜底的入口），guard 行的步 notice 路径由 `readReply` 的时钟检查覆盖；M7 的停等读 `openRequests`，不经它。
5. 探针的 `guard-request-goal` 用 `probe_goal_run` 的第二根 agent 扮演带 goal 的申报者：DSH 里人自己 `/goal` 是主 agent 的 goal，探针没有 `/goal` 通道；goal 驱动的轮次时机（§5.9 F14 的停等属 M7）不在此场景覆盖。
6. `guard-request` 与 `guard-request-plain` 共用一个工作区与目标文件（guard-new-rules 两场景的既有做法），断言只看各自场景的流水与最终内容。
