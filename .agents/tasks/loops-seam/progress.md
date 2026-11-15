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
