# handback-paths 车道进度（hback-paths）

Worktree `.worktrees/hback-paths`，分支 `hback-paths`，基线 main `cd43ec57`（2026-11-17）。
任务：给任务交回/前进记录一份改动文件路径的耐久记录，让底线加类提议（`floorProposals`）
在真实数据上能真的开火——分组逻辑完整、L2 直测，但接线侧传不出路径（m7-8 车道记录的缺口，
ORCHESTRATION §12 1392 行、M7 设计 §19.4 第六次修订 ②⑥ 都记着）。

## 契约判定（编码前写下）

### 路径落在哪里：交回批注新字段（图上的耐久记录）

三个候选，按根上取舍：

1. **交回批注（`HandbackComment`，`src/execute/attempts.ts`）加可选 `paths` 字段**——选定。
   理由：
   - 交回批注本来就是任务改动的耐久记录（§3.6.2 第 4 步，幂等标记），已携带同类的
     「内容型」事实：`docs` 行、`floorHit` 的清单行原文、`report` 路径。路径与它们同类。
   - `floorTasks`（`src/report/floor-proposals.ts`）今天只读图（签名收 `LoadedGraph`），
     有效深浅、进主干时刻都从任务的历史批注读回；路径从同一条交回批注读回，读法同源。
   - 降档组（轻审/不审）必然走过 done 交回，done 流程里 `changedFiles(worktree, baseSha, head)`
     已经算过这份 diff（底线判定与文档缺口共用），拿来记下即可，不加新的 git 读数。
2. `advances.jsonl` 加字段——不取。前进记录一次覆盖多件活（`tasks` 数组），不携带每件活
   自己的 diff；在前进写入处为每件活补 git diff 是新的读数面，且周报的 `floorTasks` 读不到
   它（要加 `<exec>` 读数与按任务归属的展开）。
3. `<exec>/tasks/<task>/<childId>.files.jsonl` 新文件类——不取。要新的文件类、忽略表、读者，
   而图批注已经承载交回事实（M7 §3.16 的事实存放表点名 dispatch comments），一份记录两处放。

### 隐私边界：路径不进指标，进图

M7 §3.16 的隐私规则（`src/execute/metrics.ts` 头注）：指标事件只带 harness 记的计数与引用，
绝会话文本、绝模型自报。所以 `execute.handback` 指标事件不动（仍是 `files` 个数）；
路径进图批注——图是项目自己的记录，`docs` 行、`floorHit` 原文已在同样的位置。

### 路径的来源：harness 自己的 git diff，不是 worker 自报

done 流程里 `deps.git.changedFiles(worktree, attempt.baseSha, head)`（派发基线=merge base）
是 harness 读的，符合「数字由 harness 算」；worker 结构化交回的 `files` 列表是自报，
只作个数（`文件 N 个`），不进耐久记录。diff 读数失败（git 不答）或没有 base/head 时
不写字段——记录缺席 = 未知，与旧批注同形；这不是空列表（实践上 done 且有 head 而
diff 为空不可达）。

### 批注格式与读回

- 渲染：depth 行之后的独立一行（第 5 行位；depth 缺席时是 tail 第一行），
  `` 改动 `src/a.ts` `src/b.ts` `` ——路径用反引号段，与底线清单 `files` 判定的写法同约定
  （`src/execute/floor.ts` 的 trailingSegments 读法）；空列表不渲染。
- 解析：`parseHandbackComment` 按 `改动 ` 前缀在 tail 里取反引号段，得 `paths?: readonly string[]`。
  前三行与 depth 行的位置不动，旧批注与旧读者不受影响；没有这一行的批注解析出 `paths: undefined`。
- 读回口径（`floorTasks`）：任务历史里最新一条带 `paths` 行的交回批注的路径；没有 → `[]`
  （旧记录回退，分组无从做起，与今天同形）。取「最新一条带的」与取「最新一条 done 的」
  在多轮交回的边角上不同（后一轮 done 但 git 失败时前者回退到上一轮的路径），取前者：
  口径是「最近一次记下的这份活改了什么」。

### 不做的

- 不改 `execute.handback` 指标事件与 `文件 N 个` 行的口径。
- 不加路径上限截断：记录要忠实，个数已在 `文件 N 个`；几千文件的病态改动靠写范围挡，
  不在记录层发明阈值。
- 不补 M7 §19.4 ⑥ 答应的「floor-add 在升降之前排序的 L2」——那要整份周报夹具与违规流水，
  属 weekly 排序用例，本车道只接路径来源；缺口注记里写清它仍在等。

## 批次（每批一个提交）

1. 批 1：`src/execute/attempts.ts`（`HandbackComment.paths` 渲染/解析）、
   `src/execute/handback.ts`（done 流程记 paths）、`src/report/floor-proposals.ts`
   （`floorTasks` 读回）、L2（往返、写入、端到端、旧记录回退、排序）、
   docs（ORCHESTRATION §12 缺口段、M7 §19.4 ②⑥ 注记、HANDOFF M7 行）。
2. 批 2：车道进度归档。

## 实施记录（2026-11-17）

- 按契约判定落地，格式与判定一致：渲染 `` 改动 `p1` `p2` `` 一行、紧跟 depth 行之后，
  解析在 tail 里按 `改动 ` 前缀取反引号段（`changedPaths`，attempts.ts）；
  done 流程的 `changedFiles` 读数同时喂底线、文档缺口与耐久记录（handback.ts 的 `changedPaths`）；
  `floorTasks` 的 `recordedPaths` 取最新一条带该行的交回批注。
- L2 四处：`tests/execute-attempts.spec.ts`（行位与往返、skip 无 depth 行、旧批注与空列表不解析）、
  `tests/execute-handback.spec.ts`（真仓库 done 交回记下 diff 读数、skip 也记）、
  `tests/report-ladder.spec.ts`（端到端：两件降档共用顶层目录、底线只盖 docs/ → 提议开火；
  混合新旧形状不产生提议；「最新一条带的」两条），
  `tests/weekly.spec.ts`（排序 L2：floor-add 在升降之前，M7 §19.4 ⑥ 答应的用例）。
- 设计文档 §19.4 ②⑥ 各加落地注记；HANDOFF M7 行的缺口句改为已落地形态。
- 排查记录：初次全量 test 挂 3 例，是 lessons-seed.spec 的检出自备文件
  `.agents/tasks/m5/lessons-seed.json`（不入库）缺失，从主检出复制后全绿——与改动无关。
- 门禁：build 绿；preflight 绿；test 全绿（235 个 spec 全 `# fail 0`；ratchet 持平：
  eslint 73 suppressed、knip 18 in baseline、jscpd 1 clone；check-secrets 无泄漏）。
- 环境注记：worktree 依赖用 pnpm 装（`pnpm install --store-dir <主检出>/.pnpm-store`）；
  `npm ci` 在本仓库不可用（无 package-lock.json，且会先删掉 worktree 已链好的 node_modules 再失败）。
- 探针：`probe-lock` 被 walk-review 车道持有（2026-11-16T16:40:16Z 起），按纪律等待，未动锁。

## 探针与落地记录（2026-11-17）

- rebase 到 main `943f5559`（sgate 车道落地）后重跑快门禁：build、preflight、test 全绿，
  ratchet 持平（eslint 73 suppressed、knip 18、jscpd 1）。车道提交变 `4fee0a00`。
- 探针插曲一：18:35Z 取到锁开跑，18:44Z walk-review 把 `owner.txt` 覆写成自己的
  （「re-run after rebase」）——两个探针在同一槽位并发，正是 §7 记的 2026-11-05 事故模式。
  本车道按纪律让出：停掉自己的探针（日志 `.llm/logs/hbp-probe.log` 只到启动头，
  无残留进程与运行目录），续写循环按「核对不是自己的就不动文件」停止，锁归 walk-review。
- 探针插曲二：walk-review 释放后本车道重取锁（19:07Z），重跑探针，
  `probe: 611/611 passed`（exit 0，日志 `.llm/logs/hbp-probe-2.log`）；
  续写循环先停、核对 owner.txt 仍写自己后删锁，槽位交还。
- 门禁终值：build 绿 → preflight 绿 → test 绿（235 个 spec 全 fail 0）→ probe 611/611。
- 探针插曲三：基线又动（walk-review 落地 93873eda，main 到 133907d5），rebase 后重跑
  build/preflight/test 全绿（与我的文件无重叠），再按门禁清单在组合树上重跑探针：
  `probe: 611/611 passed`（exit 0，日志 `.llm/logs/hbp-probe-3.log`，19:46Z 取锁、20:20Z 前释放）。
- 落地状态：`cd49ac34`（改动路径批）+ `25bf1750`（本进度归档），基线 main `133907d5`。
