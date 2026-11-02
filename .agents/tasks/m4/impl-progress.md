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

### m4-gate — 完成第一片（records 地基，`d012455`），其余留下一批

设计上 G1–G3 都不等别的设计。G1 的剩余部分一次要删 `evaluate`，而它今天被 guard 行、`graph-files.ts`、`loops/guard.ts` 两道门使用，同一次提交必须把四处全部改经 `installRuleGate` 并改晨报过滤（换 classifyRecord）、按项目写流水（projectHomeFor/projectJournal/gap）、`RowHealth.note`、`GUARD_RULES` 目录扩充与全部 guard 探针期望（glm、non-glm-guard、hourness-only 的纠偏逐字断言）——按设计是一整步（约 15+ 文件、6+ 测试文件）。地基已就位：records.ts 的类型与分类器、记录键、subjectOf 都按 §3.2 落好并有测试钉住；下一批从 `installRuleGate`（gate.ts）开始，先做失败优先的 spec（这次的 slice 是纯新增，失败优先没有意义，G1 的门不是）。开工前重读 §3 全节、`src/loops/guard.ts` 与规则板 `src/rules/gate.ts` 的判定路径。

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
