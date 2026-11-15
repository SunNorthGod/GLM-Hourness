# loops-seam 车道进度（循环板 staleEntries/timeoutEntries 接缝）

Worktree `.worktrees/loops-seam`，分支 `loops-seam`，基线 main `a5296ba0`（2026-11-16）。
任务：循环板两条周清单与循环板 items 要循环板服务的 `staleEntries`/`timeoutEntries`
（HANDOFF §10 状态板块行「还缺什么」；status-hub impl-plan-3 §1；loops-runner impl-plan「Sequenced-later」第 5 条）。
前两个实例先后死于配额与 ZCode 重启：第一个落了判读（主检出 `.agents/tasks/loops-seam/progress.md`，未跟踪），没建 worktree 环境；第二个建好 worktree、建了一个 typescript junction，死在环境搭建。本实例接续：worktree 审计通过（干净、在 main tip），node_modules 十个 junction 照 m7-7 的样子重建。

## 审计结论（2026-11-16）

- worktree 分支 `loops-seam` 在 `a5296ba0`（= 当时 main tip），working tree clean，无半截提交 → 保留继续，不重建。
- node_modules 只有一个 typescript junction（指向 .pnpm store，与 m7-7 的顶层 junction 目标不同）→ 按耻辱簿记法照 m7-7 模式重建十个 junction（@esbuild/@eslint/@types/@typescript-eslint/esbuild/eslint/jscpd/knip/typescript/typescript-eslint），`.cache` 是 jiti 运行时缓存，自建不接。
- 探针锁：`.llm/probe-lock-2` 由 metrics-s8 车道持有（每 5 分钟续写）→ 本车道门禁期间等锁，用 `probe-lock` 主名，前缀 `lsm-`。

## 接缝判读（本实例逐条对源复核，2026-11-16）

### 服务成员契约（schedules 设计 0.6 §3.1，逐字，实读核对）

```ts
staleEntries(project: string, now: Date): readonly StaleEntry[] | undefined
timeoutEntries(project: string, now: Date): readonly { readonly id: string, readonly title: string, readonly timeouts7d: number, readonly lastTimeoutAt: string }[] | undefined

interface StaleEntry {
  id: string            // u-<8 位十六进制>
  title: string
  addedAt: string
  lastResultAt?: string // 最近一次结局为 delivered、ran 或 reported 的时刻；从没有过时不写
  runs28d: number       // 最近 28 天的运行次数（所有结局）
  why: 'never-triggered' | 'no-result'  // 28 天里一次都没触发；触发过，但没有一次跑出结果
}
```

- `staleEntries`：人加的（`u-` 开头）、已满 28 天、最近 28 天没有一次结局是 `delivered`/`ran`/`reported`，至多 3 项，上一次有结果最早的在前（没有结果的排最前）。验收第 34 条的四例：30 天前加、28 天内全是 skipped/suppressed/failed/refused → 列；10 天前有过一次 ran → 不列；插件条目一律不列；20 天前才加 → 不列。
- `timeoutEntries`：最近 7 天结局为 `unfinished` 至少 3 次的条目，人的与插件的都列，至多 3 项，次数多的在前（平次按 lastTimeoutAt 最早的在前，本线推导补的确定性）。
- 「已在一条 open 的删除提议里的不列」：`loop_propose`（同意的路，S5）没建，今天不存在任何提议 → 本线空过，随提议通道补。
- 服务门：项目不在本进程跑（`running` 无此根）→ `undefined`（契约原文；`running` 只在 sessionController 注入后积累，与服务存在条件一致）。

### 取数纪律（实读 ORCHESTRATION §10.6 第 6 步原文后维持前实例的推导）

- 原文（F33）：「读侧的页面「上次」缓存、state.json 重建、staleEntries、timeoutEntries 还没建，建时按 F33 从 `readLog(root, {from, to})` 取自己的种类，28 天窗口」。不加 state.json 字段、不建重建路。
- 读一次 `readLog(journal, {from, to})` 覆盖整窗（read.ts 的 from/to 是文件级 UTC 日期过滤，事件按时刻有序，实读核过），`from` = min(各条目 addedAt, now−28d)，之后按时刻归类：`lastResultAt` 用条目自己的 `addedAt` 起算（流水不裁剪，全量在），`runs28d`/`timeouts7d` 用 28 天/7 天窗。
- `runs28d` 数 `loop-fired`（每次运行恰一条，被抑制的运行也写这对，records.ts 头注原文）。
- `addedAt` 从 `.llm/loops/journal.jsonl` 折：每条目最早一条 `add` 记录的 `at`（journal.ts 的 `parseJournal`/`recordOf`；没有 `add` 记录的条目取它最早的记录时刻，一条记录都没有的不列进 stale——时间无凭）。删过再恢复的条目仍取最早 `add`（条目自己的开头；验收没覆盖恢复情形，推导记档）。
- 条目与标题：人的条目从 store 的 `read()`（`BoardRead.entries`，非 deleted）；插件的从 `registry.entries()`（只有 timeout 要插件条目）。文件位置 `store.paths.journal`。
- 读者放 `records.ts`（runFacts，按条目归堆的运行事实），与 recentRecords 不共用日历步进——新读者一次 readLog 读整窗，不需要逐日步进，也就没有新克隆（jscpd 棘轮 1 保持平）。

### 消费方两侧（status-hub 0.3 §4.2、§12 循环板行；impl-plan-3 §1，逐条实读核对）

1. **周报两张单子（报告路）**：`src/loops/status.ts`（新，照 `src/env/status.ts` 的「事实 + 措辞一份算」）把两张单子措辞成两条 hub 条目 `loops/stale` 与 `loops/timeouts`（`audience: 'agent'`），行 apply 顶层 `provideRowStatus(ctx, 'loops', …)`（sessions 映射 `agent/created`，照 env 行 190-221 的样子）；`STATUS_ROWS` 已含 `loops`（= HEALTH_ROWS，实读）；周报 `weekly.ts` 的 `loopsLines` 已按 `owner === 'loops'` 渲染且只在有条目时出「## 两张单子」节（weekly.spec 已钉），报告函数零改动。
2. **循环板 items（板块路）**：`LoopsView` 加 `items`（本行状态条目原样，同 `src/rules/view-build.ts` 的 `items: input.items`）；`boards.ts` 的 `show()` 经 `statusViewOf(ctx, 'loops')` 只取本行的源（不跑整本收集——show 每拍每项目跑）；签名对比把 `at` 与 items 的 `asOf` 归零（照 `src/rules/view-writer.ts` contentOf，防每拍重写）。UI：`ui/src/loops/board.ts` 从 `projectionBoard` 改成 `rulesBoard` 形（持 `holdLoopsSource`，`stateOf` 带 `items: view.items`）；`ui/src/loops/source.ts` 的 build 改传原 view（照 rules source，板要原样的 items，页在组件里 buildLoopsPage）；页面模型与页面加 items 一组（照规则页 head 下的 status 块）。

### 措辞的推导（设计没钉到字，本线定）

- §17 M7 第 8 条的两节标题定 text 首行：「4 周没跑出过结果的、你加的循环板条目 N 件」「最近 7 天反复超时的循环板条目 N 件」，detail 每条目一行（标题 + 数字 + 时刻）。
- 两句 propose 后缀（`loop_propose …`、`loop_propose kind "edit"`）随 S5 落地再加——今天让模型调一个不存在的工具是错的；同一批带「已在 open 提议里不列」的过滤。
- `source` 填 `<项目根>/.llm/loops`（板运行目录，追溯用，不上脸）。

### 服务在哪个进程

`LoopsService` 只在有会话控制器的进程提供（index.ts 663 的 `ctx.inject(['sessionController'])`，实读）；行 apply 顶层 `provideRowStatus`（读盘读流水，不依赖注入期）。headless/探针里行启用但服务不在 → 提供了状态视图但 items 按会话的项目算，探针会话不在跑的项目 → 无条目 → 收集器 absent 或空 → 周报省节，现探针不受影响。

### 批次（每批一个提交，门禁 build → preflight → npm test，探针最后）

1. 读侧：`service.ts` 契约（`StaleEntry`、两成员、头注改）+ `records.ts` 读者（runFacts）+ `src/loops/status.ts` 选择器（staleEntriesOf/timeoutEntriesOf）+ `index.ts` 服务两成员 + L2（验收第 34 条四例、timeout 三例、cap、排序、读者夹具、服务门）。
2. 报告路：`src/loops/status.ts` 两条目措辞 + `index.ts` 行接线（sessions 映射 + provideRowStatus）+ status.spec 同源断言。
3. 板块路：`view.ts`/`boards.ts` items + `ui/src/loops/{source,board,model,LoopsPage}` + L2（panel-model、board）。
4. 文档随各批走（ORCHESTRATION §18.4/§18.7/§18 尾、metrics.ts/weekly.ts/board.ts 头注、HANDOFF §10）+ 本进度 + 合 main 全量门禁 + 探针。

### 不做（留缝，各有归属）

- `loop_propose`/`attachable`/`acceptProposal`（同意的路，S5）；「open 提议里不列」的过滤随它。
- 周报 propose 后缀句随 S5。
- 循环板 `homeLine` 的诊断行同源化（status-hub §12 循环板行的另一半）。
- 周报「一次至多三件要人定的事」的总量分配（m7-8 的编排）。
- `src/operate/entries.ts` 是 m7-7 车道的，本线不碰。

## 记录

- [2026-11-16] 开线。worktree 审计过、junction 重建。设计读毕并逐条对源：schedules 0.6 §3.1/§6.11/验收 34/§17 M7 8、status-hub 0.3 §4.2/§12、impl-plan-3 §1、m7p3-progress、ORCHESTRATION §10.6 第 6 步（F33 原文）/§18、weekly.spec、contracts.spec（wider 服务照样读，加成员不破）。实读：`src/loops/{service,metrics,records,inbox?,boards,store,view,journal,index}.ts`、`src/rules/{status,view-build,view-writer,index}.ts`、`src/env/{status,index}.ts`、`src/report/{status,weekly}.ts`、`src/shared/{status,status-host}.ts`、`src/metrics/read.ts`、`ui/src/loops/{board,model,source,LoopsPage}`、`ui/src/rules/{board,model,source,RulesPage}`、`ui/src/graph/boards.ts`。判读如上，与前一实例判读的差异：LoopsSource 的 build 要改传原 view（板要原样 StatusItem）；staleEntries 排序补「没有结果的排最前」；timeout 平次补 lastTimeoutAt 定序。

- [2026-11-16] 批 1 提交 `466515a0`：service.ts 契约（StaleEntry/TimeoutEntry、两成员、头注）、records.ts runEvents（一次 readLog 读整窗）、status.ts 选择器（staleEntriesOf/timeoutEntriesOf，纯）、boards.ts show() 随视图算双清单（listsOf 缓存，时钟用行的 io.now）、index.ts 服务两成员（门：running 有此根；facts 未算到时给空表）+ tests/loops-status.spec.ts 7 例全绿（验收 34 四例、cap、排序、never/no-result、读者夹具、服务门、无控制器）。register 进 package.json test:1。tsc 净；lint 只剩 calibrate-ablation 一项（worktree 未 build 的 dist 缺失，main 同）+ 已修掉我的 await-thenable 与 require-await。踩坑记：quickIo() 的时钟钉在 NOW=2026-11-02（夹具时钟即行的时钟），测试里的事件时刻必须落在夹具时间轴上；appendEvents 的 randomId 必须 8 位十六进制（否则写不进且 reject 自递归爆栈）。
- 探针锁等待中：metrics-s8 持 .llm/probe-lock-2（每 5 分钟续写，01:39 仍在续）→ build/preflight/全量 test 延到锁空闲；tsc、单 spec、lint 照 m7-p3 先例照常跑。批 2/3 先行编码。
- [2026-11-16] 批 2 提交：status.ts 两措辞器（staleItems/timeoutItems，headline 为 text、每条目一行 detail、插件条目「请插件的作者修」、loop_propose 后缀句随 S5）+ index.ts 行接线（apply 顶层 provideRowStatus('loops')，sessions 映射 agent/created，读 boards 缓存，照 env 行）+ tests/loops-status.spec.ts 措辞例 8/8 + status.spec 同源断言（真实措辞器 → collectStatus → weekly「## 两张单子」逐字；空表省节）。踩坑记：status 块必须放 disposers 声明之后（TDZ）。tsc 净、lint 只剩 dist 缺失一项、knip/jscpd 平。
- [2026-11-16] 批 3 提交：view.ts `LoopsView.items`（必填字段，buildView 输入可选）+ boards.ts `itemsOf` 依赖与签名归零（`at` 与 items 的 `asOf`，照 rules view-writer）+ index.ts `loopsStatusItemsOf(root)` 一份计算喂两路（boards deps 与 provideRowStatus）+ UI 三件：source 的 build 改传原 view（板要原样 items，页在组件里 buildLoopsPage）、board.ts 与 rules/board.ts 合并成 `ui/src/graph/boards.ts` 的 `viewBoard` 工厂（jscpd 报 6 个克隆后的根因修法：两块带视图文件的板一个工厂，`projectionBoard` 留给经验板）、页面加「两张单子」一组（text 下 detail 折讲细点）。L2：loops-panel-model 30 例（板交 view.items 原样、不变重算保持同一对象、页面组、静态无写入）、rules-panel-model 16 例、loops-row 27 例（view.json 的 items 与 statusViewOf 深等，同钟下逐字）。构建后 typed-lint 抓出三处 strip-types 看不见的：readonly 数组过 Array.isArray 收窄成 any[]（去掉容错，字段必填 `?? []` 足够）、测试里未 await 的 fake.write、未用的解构——随批修（bffc2005）。
- [2026-11-16] 批 4 文档：ORCHESTRATION §18 头、§18.4（服务成员与口径）、§18.7（items 与「两张单子」、viewBoard 一处）、§10.6、§12 M7 行；HANDOFF 状态板块行把接缝从「还缺」挪到「已落地」；weekly.ts / metrics.ts 头注不再把读者写成将来时（59810a8c）。
- [2026-11-16] 合前门禁（rebase 后）：build 0、preflight 0（18 行 dsh-hourness）、npm test 0 败（3831 ok；eslint 73 / knip 18 / jscpd 1 全平）。lessons-seed.json 照 impl-plan-3 的先例从主检出拷入（SHA-256 E10A3247…41910 相同）。
- [2026-11-16] rebase 到 origin/main `0490e3a9`（metrics 第 8 步落地动了 HANDOFF 的指标与状态板块两行）：HANDOFF 冲突一次，解法 = 以 main 的两行为底、重放我的状态板块行编辑。踩坑记：解冲突的脚本在 subprocess 参数上炸了而 `git add + rebase --continue` 照跑，把冲突标记提交了进去——amend 修回（cf444655 → 6ba122da）。教训：`rebase --continue` 前必须先 grep 冲突标记。
- [2026-11-16] 探针锁取主检出 `.llm/probe-lock`（两把锁都空），续写循环每 4 分钟核对 owner.txt 首行仍是自己；探针在工作树跑（`npm run -s probe`，日志 `.llm/logs/lsm-probe.log`），地板 608/608。等探针期间不在本检出 build。
- [2026-11-16] 探针：第 1 跑在 probe-lock 被 m7-9 车道 3 分钟后抢走（我续写窗口内）——按事故 179 的先例停跑让位（两探针共写 usage 流水会互相打死），换 probe-lock-2 重跑。第 2 跑 608/608 全绿（`.llm/logs/lsm-probe2.log`，地板达标），锁核对后停续写、删 probe-lock-2，m7-9 的 probe-lock 没动。
- [2026-11-16] 落地序列：m7-9 在本地 main 落了 operate.dora（47782092）并推 origin/main（07b7cbbb）→ 本线再 rebase 到 07b7cbbb（无冲突），重跑门禁全绿（build 0、preflight 0、npm test 0 败、棘轮 73/18/1 平），并集树探针再跑 608/608 全绿（`.llm/logs/lsm-probe3.log`，probe-lock-2 持有、用毕停续写再删）。主检出 ff 合并到 fa9f0bbd，推 origin（Gitee）07b7cbbb..fa9f0bbd，推 github 镜像同区间（`git -c credential.helper= -c credential.helper='!gh auth git-credential' push github main`）。
- 待办移交：主检出的桌面 build（§5.4）等探针锁空闲——m7-7 在跑第二批探针（probe-lock），probe-lock-2 也被占；锁一空就在主检出补 `npm run build`（只刷 dist，桌面下次加载生效）。
