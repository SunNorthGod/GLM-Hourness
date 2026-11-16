# loops-tails 车道进度（循环线小尾巴收口）

Worktree `.worktrees/loops-tails`，分支 `loops-tails`，基线 main `e98bfbca`（2026-11-17）。
任务：HANDOFF/panel 记录里循环线三件候选尾的核验与收口（循环板 homeLine、周报三件上限分配、同意路径的秒数/超时来历）。
探针锁纪律：主检出 `.llm/probe-lock` / `probe-lock-2`，先查后占、只删自己持有的；日志主检出 `.llm/logs/`，前缀 `lpt-`。

## 核验结论（2026-11-17，编码前逐条对源）

### 候选 1：循环板 homeLine 同源化 — 未做，本线做（部分按设计、缺数的三行记档）

- 现状：`ui/src/loops/board.ts` 的 `stateOf` 恒交 `homeLine: null`（`NOTHING_YET` 与 available 两支都是）；`tests/loops-panel-model.spec.ts` 两处深等断言钉住 null。ORCHESTRATION §18.7 页面一条与 §18 头都写「还没有：首页一行」。
- 设计：循环板 design 0.6 §8.3 给了首页一行的阶梯（按顺序取第一个成立的）：holder 归档/找不到/另一窗口超 5 分钟/看不清四句 → GLM 登录失效 → 脚本改过先不跑 → 连着 3 次没过 → DSH 提醒被改过已改回（当天）→ 插件交来的 N 项读不懂；都不成立为 null。状态板块 design 0.3 §3.4/§12 循环板行：「homeLine 保持可诊断：反映某条状态条目时取该条目的 text（同源）」，循环板首页行是诊断行（M1 豁免，不进逐字断言）；loops-seam 进度把「homeLine 的诊断行同源化」记为 status-hub §12 循环板行的另一半。
- 「同源」的落点：首页一行与板页读同一份 `view.json`（一处算，规则板 `rulesHomeLine(view)` 同型），不另算一路。
- 数据可得性（实读 view.json 现有字段）：
  - holder 四句：`LoopsView.holder.line` 已有（`holderViewOf`/`holderLine`，schedules 0.6 §6.4 的表），但 view 只有 line，没有 state 种类，ui 分不出「该上首页的四种」与「不该上的 ok/none/交接中三句」→ host 侧 `HolderView` 加 `state` 种类（boards.ts `holderViewOf` 已持有 known.state，零新 IO）。
  - 脚本改过：`buildView` 已为人的脚本条目算 `scriptStandingOf`（`agreed/changed/missing/too-large`），只喂了 `workLines` 措辞，没有机器可读的形状上 view → `ViewEntry` 加可选 `scriptStanding`（同一计算的直接产出，零新 IO）。
  - 提醒被改过已改回：`view.recent` 的 `loop-task-delete {why:'repair', deleted:true}` 当天记录可判。
  - 三行缺数，随各自的路：GLM 登录失效（机器一级，ORCHESTRATION §18.10 2057 行写明「首页一行整块还没有」）；连着 3 次没过（view 只有每条 `last` 一跑与最近 20 条记录，无连败计数）；插件交来的 N 项读不懂（registry 只 `say` 不落 view）。这三行不在本线造数，记进 ORCHESTRATION 与代码注释，数据到再补。
- 实施：host 两字段（`HolderView.state`、`ViewEntry.scriptStanding`，可选、view 版本 1 不动，`signatureOf` 整体 stringify 自动带上）；ui `ui/src/loops/model.ts` 加 `loopsHomeLine(view)` 纯函数（§8.3 顺序的已落地子集、60 码点截断照 `cutLine`）；`ui/src/loops/board.ts` 的 `stateOf` 交它。L2：`tests/loops-panel-model.spec.ts` 阶梯次序、60 截断、null 分支、view 旧形（无新字段）不炸。

### 候选 2：周报三件上限分配 — 设计已覆盖、实现已一致，只补混合竞争的 L2

- 实现现状：`src/report/weekly.ts` `proposalsLines`——底线加类在前、阶梯在后，`.slice(0, 3)`；文档 ORCHESTRATION §1392 行写明「底线加类在前、升降在后，合计至多 3 件（R4-F5 的排序）」。
- 设计依据：M7 design 0.6 §18.2 R4-F5 的处置「写定优先序（建议：修脚本 > 加类 > 升降 > 删规则 > 删循环板条目；合计至多 3 件）」——平铺优先序加总量帽，两类竞争时加类先占位，设计已覆盖；修脚本/删规则/删循环板条目三类候选等规则板与循环板，今天不存在。
- loops-seam 的「不做」记的「总量分配（m7-8 的编排）」已被 m7-8 落地（weekly.ts 头注 m7-8；HANDOFF M7 行 2026-11-16 记载）。
- 缺口：L2 只钉了纯阶梯溢出（weekly.spec「three matters at most」4 规范出 3 件）与「加类在前」（1 加类 + 1 升降，未溢出）；两类同时溢出（加类吃掉帽位、升降被截）没有例。本线补一例（2 加类 + 2 升降 → 3 件、加类在前、升降占末位），不改行为代码。

### 候选 3：同意路径的秒数/超时来历 — 未做且不是小尾巴，记档不实施

- 同意路径没有落：`loop_propose`/`loop_show`/`loop_note` 三个工具一个都没注册（`src/loops/index.ts:55`「It registers no tool yet」）；HANDOFF §3 loops 行「还没有的：让人同意新条目的工具」；ORCHESTRATION §18 头同样记载。这是循环板 design 0.6 的 S5（提议通道 `loop_propose`、`attachable`/`acceptProposal` 服务成员、`/loops` 的接受/拒绝），一个整块特性，不是小尾巴。
- 展示件已经在等数据：`ui/src/loops/timeouts.ts`（四种来源、held、3 倍核对、调高一行、7 天次数、来历、最近 5 次超时，形状不对写「没有记录：<原因>」并告警一次）与 `workLines`（同意的那一版、超时一行）都已落地（面板 8-1/8-2，status-hub-3）；人的条目今天缺的只是 `agent-estimate` 的估秒、来历与超时记录三样数据——要等 `loop_propose` 带来估计、人同意后真跑过才有（HANDOFF §3 面板行原话、impl-plan-3 §2 (c) 行同记）。插件条目（M4 检查器）的那一格已在真数据上工作。
- 处置：本线不动。留给同意路径的车道（S5），届时展示件零改动接上；「已在 open 提议里不列」的 stale 过滤与 `loop_propose` 后缀句（`src/loops/status.ts` 两处注释）同批。

## 批次

1. 候选 2 的 L2（weekly.spec 一例）+ 无行为改动。
2. homeLine：host 两字段 + ui 阶梯 + L2 + ORCHESTRATION §18/§18.7 改写「还没有的」清单 + HANDOFF 相应行。
3. 合前全量门禁（build → preflight → test，棘轮 73/18/1 平）→ 探针 611/611 → 合 main → 推双远端。

## 记录

- [2026-11-17] 开线。worktree 建在 main tip `e98bfbca`（与 origin/main 同点），干净。node_modules 靠主检出父目录解析（工作树目录为其子目录，Node 上溯命中），无 junction。两把探针锁空闲。核验判读如上（候选 1/3 未做、候选 2 只缺 L2）。
