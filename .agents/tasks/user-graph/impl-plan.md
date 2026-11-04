# 项目用户图：实施批次图

依据：决策 `d-user-graph-released`（设计 0.4.1 放行，人三问已答：每个新项目都画、每条流程走一遍走通才算做完、接受新旧构建不能混用同一张图）、`d-user-graph-one-graph`（一张图两面）、`.agents/tasks/user-graph/design.md` 0.4.1 与第 5 轮独立评审（`design-review-5.md`，APPROVED，LOW 5 条不挡路，修法可在实现时带上）。基座：`user-graph` 分支，基于 origin/main `adef28e`（M3 全量已合入：`src/design/propose.ts`、`record.ts`、`talk.ts`、`stage-notice.ts`、`src/graph/modules.ts`、`stage.ts` 的放行门禁；M7 骨架 E1b/E2 已合入：`src/execute/brief.ts`（`briefGate`、`renderBrief`）、`gate-lock.ts`、`plain-view.ts` 的 `needsOf`/`remainingOf`；M7 的 `dispatch.ts`、`drive.ts`、`faces.ts`、`notice.ts`、`tiers.ts`、`src/report/four-answers.ts`、`src/guard/execute-rules.ts`（`worker-graph-readonly`）不在 main）。

工作树门禁（每批串行，退出码不吞，日志写 `.llm/logs/ug-*.log`）：
`npm run build` → `npm run preflight` → `npm test` → `npm run -s probe`。
棘轮按本树基点实测（基线见下），只降不升。主干合并后立即补全量门禁。

## 批次

| 批 | 内容 | 设计步 | 验收（§1.4） |
| --- | --- | --- | --- |
| UG0 | 本计划 | — | — |
| UG1 | 数据格式：`schema.ts` 加 `role`/`flow`/`step`、`USER_TYPES`、`serves`/`next`、`GraphEdge.when`、`walk` 证据种类、`USER_LIMITS`、`USER_STATUSES`、`WALK_REF_PATTERN`/`WALK_NOTE_PATTERN`、`isPassingEvidence` 对 `walk` 返回假；`format.ts` 的 V2/V5/V7/V8（edge 的 `when` 检查器、canonical 写出带 `when`）；`validate.ts` 的 V1/V3/V4/V6；`labels.ts` 补编译要的表（TYPE_LABELS +3、EVIDENCE_LABELS +walk）；`ui/src/graph/model.ts` 的 `EDGE_LABELS` +2（编译耦合）；新建 `src/graph/walk-spec.ts`（`WALK_KINDS`、`parseWalkLine`、`walkCommandsOf`）、`src/graph/user-live.ts`（`liveOf`）；新 `tests/graph-user-format.spec.ts`；黄金测试进 `tests/graph-store.spec.ts` | U1 | 1–8 |
| UG2 | 引擎与工具：`OPS` 加 `walk`/`relink`；`mutation.ts` 的 `OP_FIELDS`、`link` 的 `type` 枚举与 `when`、`relink` 的 `next` 列表检查、`walk` 的 `evidence` 必填、按操作分的可选字段表；`engine.ts` 用户节点权限（planEdit 限制、planStatus 对 `doing`/`done` 的 `bad_transition`、废弃/恢复要转述）、`planWalk`（W4）、`planRelink`（一次换一个节点的出边，历史记真实 `unlink`/`link`）、W1 至 W5 只查本次新增或改动的部分；`tools.ts` 的 `graph_link`/`graph_unlink` 枚举与 `when`、`graph_propose` edges 枚举、新工具 `graph_relink`/`graph_walk`（含 §3.5 示范，示范过真实转述核对的 L2 用假会话投影）；`src/shared/tool-names.ts` 两份名单 +2；新 `tests/graph-user-engine.spec.ts`；`tests/contracts.spec.ts` 钉 `GRAPH_TOOL_NAMES`/`ORCHESTRATION_RESIDENT_TOOLS`（M7 名单对照顺延，见下） | U2 | 9–15（15 的 M7 名单与 L3 工具面断言顺延） |
| UG3 | 推导与缺口：新建 `src/graph/user-graph.ts`（`liveOf` 复用 `user-live.ts`；`serversOf`/`leavesOf`/`stepStateOf`/`flowStateOf`/`gapsOf`/`userGraphOf`/`stepsServedBy`/`renderUserGraph`/`userReleaseItems`/`userCompletionItems`；`Gap.reason` 按评审 5 发现 1）；`projection.ts` 的 `gatesOf`（`serving`/`steps` 门）与 `projectNode`（`serves`/`servedBy`/`next`/`previous`）；`stage.ts` 的 `releaseSet`/`bigLoopSet`/`moduleSet` 过滤不 `live` 的用户节点；`tools.ts` 的 `graph_open` 过滤 `items.proposals`；`plain-view.ts` 的 `needsOf` 不数本身或祖先不 `live` 的用户提议（面板 1.1 已合入，设计 §3.7 的临时过滤不再需要，见差异表）；`reminder.ts` 的行；`layout.ts`/`render.ts` 排除用户节点与两种连线；`ui/src/graph/model.ts` 的 `visibleGraph`/`statusText`；`tests/graph-user-state.spec.ts`、`tests/graph-user-render.spec.ts`（夹具构建函数放 `tests/graph-user-helpers.ts` 共用，按评审 5 发现 2）；`tests/execute-brief.spec.ts` 钉用户节点 `bad_task`；`tests/graph-stage.spec.ts` 加「用户节点的 `source` 不让规划栏成立」；`tests/graph-store.spec.ts` 钉进度数不变 | U3 | 16–26（26 的面板部分按 needsOf 落地） |
| UG4 | M3 一侧：`stage.ts` 需求卡第 9 项 `flows` 与 `userReleaseItems` 接进三处放行门禁（大循环六项、单次五项、模块 `module:serves`）；`propose.ts` 的 `confirm`/`release` 附 `userPage: {stable, state}`（结果正文），`flows:page` 超限 `gate_unmet`；`record.ts` 的 `confirm`/`release` 核对「给人看过」（stable+state 整段）与「只重新渲染比较稳定部分」（「页在给你看之后变了」→ `not_shown`）；`talk.ts` 的 `Shown` 多记 `userPage`；`stage-notice.ts` 三处阶段提醒带用户图一句与缺口行；`tests/graph-stage.spec.ts`、`tests/design-mode.spec.ts` 加用例 | U4 | 27–31 |
| UG5 | 简报的步骤段：`src/execute/brief.ts` 的 Context 加「这件活服务的步骤」（流程名 › 步骤名，取 `stepsServedBy`）；`tests/execute-brief.spec.ts` 加用例。走一遍约定段等 `walk.ts`（顺延） | U5a 之一半 | 32 的前半 |
| UG6 | 面板：新建 `ui/src/graph/user-view.ts`（视图模型纯函数）与 `UserView.tsx`（渲染），Panel 接「用户怎么用」页，首页对 `present` 的目标先写流程进度；NodeDetail 对步骤写「谁在做它」；GraphCanvas 不画用户节点；`tests/graph-user-view.spec.ts` | U6 | 41–43（44 的 needsOf 部分已在 UG3） |
| UG7 | 文档收尾：`docs/HANDOFF.md`、`docs/ROADMAP.md`（如涉及）；探针场景顺延部分记录 | U7 之一部分 | 46 的一半 |

每批一个提交，`docs/ORCHESTRATION.md` 受影响的节随批同改（UG1：§2.2、§2.3、§2.6；UG2：§2.7、§2.9、§2.10；UG3：§2.5、§2.12；UG4：§4.2、§4.3、§4.8；UG6：§2.10 面板）；绿色后推 `origin/user-graph`。

## 顺延（本线不做、原因写明）

| 项 | 顺延原因 | 等谁 |
| --- | --- | --- |
| U2 的 M7 名单（`src/execute/faces.ts`、`src/guard/execute-rules.ts` 的 `worker-graph-readonly` 九变十一）与两处测试、`glm-exec-dispatch` L3 断言十一个 | 文件不在 main（M7 E6+ 未合入）；`tests/contracts.spec.ts` 的「图写工具 ⊆ M7 名单」对照同样等名单存在后加 | M7 E6+ 合入 |
| U5b 全部（`src/execute/walk.ts`、走一遍作业、`walk-review`、`walkSpecOf` 接进派发、`userCompletionItems` 接进 `goalCompletion`、`hourness.walk-done`、`gate-norm.ts` 认 `walk` 行、连续三次停下） | 派发/驱动/检查链在 M7 E6+；设计自己把它排在 M7 之后 | M7 E6+ 合入 |
| U5a 的走一遍约定段（简报）、派发状态提醒缺口行、三档判断提示、晨报按流程写 | `notice.ts`、`tiers.ts`、`src/report/four-answers.ts` 不在 main | M7 E3+/E6+ 合入 |
| U7 的探针场景 `glm-user-graph` 整条链、`glm-exec-walk` | 派发链在 M7 E6+；假模型脚本要走 dispatch | M7 E6+ 合入后 |
| U8（搬 `user-journey`） | 设计 §14：不是代码，是主 Agent 和人在对话里做的一次；第一个自举项目之后 | 编排者安排 |
| §11 对其他设计的批注写入 | 由编排者在自举后写图，本线不改 `docs/graph/` | 编排者 |
| A6 两项核实（模型图片输入标注、读文件工具交图片）与 L3 放真实小图 | 走一遍作业本身顺延 | U5b |

## 评审 5 的 5 条 LOW 在实现里的落点

| 发现 | 落点 |
| --- | --- |
| 1 `Gap` 缺孤儿原因字段 | UG3：`Gap` 加 `reason?: 'never-served' | 'steps-dropped'`（只对 `work:orphan` 设置）；视图与（顺延的）晨报按字段取字；第 21 条用例断言它 |
| 2 U2 验收引用 U3 才造的夹具 | UG2 的引擎用例按 §2.9 节点形状直接造小图；UG3 把夹具构建放进 `tests/graph-user-helpers.ts`，UG2、UG3 共用 |
| 3 测试任务连法引导与 `flow:no-test` 的 hint | UG3：`flow:no-test` 的 hint 写全文（放进负责这些步骤的模块，或连到它覆盖的步骤）；「收窄只发生在测试任务是服务该步骤的特性的后代」写进 `leavesOf` 的注释与第 16 条用例（b）的外模块一例 |
| 4 占锁界与复核中止手段 | 走一遍作业顺延；`walk.ts` 落地时按此写（界 = max(45 分钟, 准备加第一条预算) 加本机文件操作余量；复核用 `signal` 在剩余时限到时中止） |
| 5 带 `服务：无` 的模块下的任务 | UG3：`work:orphan` 判定第 4 条加「祖先中有带合格 `服务：无` 的模块时，下面没有 `serves` 的任务不标」，第 21 条加一款用例 |

## 设计与落地的差异（如实记）

- 临时过滤不再需要：设计 §3.7/§6.6 让 U3 在 `NeedsYou.tsx`/`Panel.tsx` 做按阶段的临时过滤、U6 换 `needsOf`。落地时面板 1.1 的 P2 已合入 main，`needsOf`（`src/graph/plain-view.ts`）已有按阶段的过滤（`inDesignPhase`），所以 UG3 直接在 `needsOf` 里加「本身或祖先不 `live` 的用户提议不算等批准」一条（不临时的那半），按阶段的临时过滤整段跳过。U6 相应只做新页。
- U1/U2 的边界按编译耦合调整：`OPS` 加 `walk`/`relink` 会强迫 `mutation.ts` 的 `OP_FIELDS`、`labels.ts` 的 `OP_LABELS` 和 `engine.ts` 的 `planChange` 同批可编译，所以操作与历史条目的格式检查放 UG1/UG2 如上表；UG1 不含 `OPS`（黄金测试不需要它），`walk` 历史条目的校验用例随 UG2。
- `walk` 证据的 `exit` 字段：读入时 `exit` 必填（V7），写出的 canonical 顺序沿用 `canonicalEvidence`（kind、ref、exit、note）。
- 面板 1.1 的页签与 `trail` 已在 main（面板线 P4 合入），UG6 直接用现有第 2 层页机制，不等面板 1.1。
- UG3：`UserGraph` 多带一个字段 `graph`（读出它的那张图）。`renderUserGraph` 保持 §3.6 的签名 `(ug, level, module?)`，而 `serves` 一级要找服务者的最近特性祖先、模块的子树，只靠 `UserGraph` 里的视图做不到（交接清单第 3 条的两个选项取后者）。
- UG3：`flows:modules` 只在分了模块的目标上出现（§5.2「只对分了模块的目标出现」、验收第 29 条「没分模块的目标的单次放行没有 `flows:modules`」）；分了模块时恒在，没有不服务的模块时为真。交接清单第 8 条写的「恒在，六项门面齐」与设计不符，按设计。
- UG3：投影里流程的入口放在 `next` 字段（§3.7 的四个字段之一，「流程上是入口」），没有另设验收第 24 条字面上的 `entry` 字段；每步投影的提醒把流程的这一项写成「Starts at」。
- UG3：`截图` 走法在目录里没有支持图片输入的模型时判为 `flow:no-walk`，这一条没有做：§3.6 的 `userGraphOf(graph, goal)` 不带模型目录，判据要等 A6 核实与 U5b 一起落。
- UG3：缺口的次序取 §2.6 表的次序，同一种按角色、流程、步骤的显示顺序，孤儿按目标子树的广度优先次序；§2.9 预期表里缺口的列法不是排序规则。
- UG3：「连着的活动过」里 `serves` 增删的例外对集合 X(S) 里的每个节点都适用（叶子任务给别的流程的步骤连线同样不算），不只对服务者。
- UG3：面板 `visibleGraph` 对用户节点既不保留、也不数进被藏的已关闭子节点（图上从来不画它们）；`statusText(node, graph?)` 带图时对用户节点写 §6.5 的状态字，不 `live` 的写它自己或带走它的祖先的「废弃」「被取代」，不带图时（「需要你」卡片，只会遇到提议中的用户节点）照提议写。
- UG3：`layout.ts`、`render.ts` 的排除在 UG1 已经落地，UG3 不再改代码，只补 `docs/ORCHESTRATION.md` §2.12 与 `tests/graph-store.spec.ts` 的钉子。`graph_open` 过滤的用例放在 `tests/graph-user-state.spec.ts`（用同一份夹具），不在 `tests/graph-tools.spec.ts`。
- UG3：大循环页的超时上限一律写「都是预计的 3 倍，还没有跑过」：实测值来自 `walk-limits.jsonl`，随 U5b 顺延。
- UG6：面板 1.1 的页签与 `trail` 已在 main，「用户怎么用」是现有第 2 层页机制里的一页（`Panel.tsx` 的 `PageId` 加 `user`），从首页那一行、目标与用户节点的节点页、页脚进入。U6 只做新页：按阶段的临时过滤从没落过（见第一条），`needsOf` 认祖先不 `live` 的那一半已在 UG3，`NeedsYou.tsx` 不改；「需要你」卡片不写类型名，`TYPE_LABELS` 的三个新名字在 UG1 已有，没有可改的地方。
- UG6：`GraphCanvas.tsx` 不改代码：用户节点在 `layout.ts`（UG1）与 `visibleGraph`（UG3）里已排除，UG6 在 `tests/graph-user-view.spec.ts` 对三种筛选钉住「不画用户节点」。
- UG6：概览带的缺口次序取 §6.2 正文（「概览带的缺口就是这个次序的前三条」：所在流程走不通、没人负责、做完了要重走，其余在后，同档按 §2.6 表的次序），不取 §6.2 示意图的排法（示意图里没人负责排在走不通之前）。
- UG6：§6.4「目标没有用户图：页面不出现入口」与「`用户流程：无`：页面写这个目标没有终端用户」合起来读：没有角色也没有合格 `用户流程：无，<原因>` 的目标不出现入口；有这一行的目标首页不变（第 43 条），节点页有入口，页上只写那一行。页脚的入口只开第一个有用户页的未关闭目标。
- UG6：流程下的走法写「超时上限 N 秒（预计的 3 倍，还没有跑过）」：实测上限来自 `walk-limits.jsonl`，随 U5b 顺延；「上次走一遍」一行取这条流程各步最近一条走一遍记录里最晚的那一次。
- UG6：§6.1「上次看之后」多的三种行（某流程走通了、走不通、新加一步还没人负责）与「上次看之后」的改动不在本批：批次表 UG6 行与验收第 41–44 条都没有它，`changesSince`（`src/graph/plain-view.ts`）不改；放到哪一批由编排方定。
- UG6：选中的高亮用边框加字（「选中」「相连」），另一边其余的行变淡；选中流程或角色时，相连的是它下面各步的服务者与叶子（概览带的缺口可能点名流程）。L4（真实面板，第 41 条）按设计 §10.2 与 U7 的 L4 攒成一个桌面版批次，不在本批；本批只有 L2。
- UG7：设计 U7 的三样里只做文档。探针场景 `glm-user-graph`（第 45 条整条）与 `glm-exec-walk` 照顺延表等 M7 E6+；A5 的「U7 的探针用真实的跑一遍」随 `glm-user-graph` 顺延（L2 第 13 条已用假会话投影过真实的 `main-agent-graph-relay`）；批次 L4 照 UG6 一条攒成桌面版批次。第 46 条列的 `docs/ORCHESTRATION.md` 各节已随实现同批改过（§2.2、§2.3、§2.6 随 UG1，§2.9 随 UG2，§4.2、§4.3、§4.8 随 UG4），本批只改 `docs/HANDOFF.md`（§8 用户图一行：分支状态、已实现、L2/L3 覆盖、兼容、还缺什么与各等谁）。
- UG7：`docs/ROADMAP.md` 没有用户图的里程碑，进度只记在图上，里程碑与验收条件都没变；涉及的只有借用组件核实清单，A6 的两项（provider 目录看不看得出图片输入、读文件工具交不交得了图片）补成第 18、19 项，状态待核实，随 `glm-exec-walk`。

## 暂停交接 2026-11-04（用户指令暂停；UG3 进行中，未提交）

分支 `user-graph`，tip `bddbd05`（UG2），三个提交全部已推 `origin/user-graph`：`03d9213`（UG0 批次图）、`af530c9`（UG1）、`bddbd05`（UG2）。UG2 收官门禁全绿：build/preflight/test exit 0（0 not-ok），ratchet 恰在基线（eslint 76 / knip 19 / jscpd 1），probe 347/347 exit 0。分支对 `origin/main` behind 1（其他车道新落点，恢复后按计划先合并再继续，合并后跑全量门禁）。暂停时无任何命令在跑。

### 未提交的工作

仅一个未跟踪文件：`src/graph/user-graph.ts`（UG3 核心推导的初稿，未过任何门禁）。写完后已核对过真实签名，与初稿不符或初稿有占位错误，恢复时先修这份文件再写测试：

- 已核对无误的 API：`projection.ts` 导出 `childrenIndex(graph)`、`ancestorsOf(graph, node)`、`subtreeOf(index, node)`（index 是 childrenIndex 的返回）；`stage.ts` 导出 `labeledSections(body, labels): ReadonlyMap<string,string>`、`GateItem`；`modules.ts` 导出 `moduleCandidatesOf(graph, goal)`；`schema.ts` 的 `HistoryEntry` 带 `edge?`（link/unlink/supersede 的实际边）与 `evidence?`；`walk-spec.ts` 导出 `WALK_KINDS`/`WalkKind`/`parseWalkLine`/`walkCommandsOf`/`WALK_SECONDS_LIMIT`；`format.ts` 导出 `compareText(a, b)`。
- 初稿待修清单（按行修，不重写）：
  1. 本地 `interface GraphEdge` 遮蔽 schema 的 `GraphEdge`——删本地定义，节点边直接用 `node.edges`（元素类型即 schema `GraphEdge`）；随之删掉死助手 `nextOf`/`servesFromEdges`。
  2. `confirmFlowLines` 有运算符优先级错误：`step.step.acceptance?.length ?? 0 > 0` 必须加括号；同函数里那处 `.replace(\`： ${...}\`, '')` 的补丁写法整行重写成直接拼。
  3. `renderUserGraph` 的 `'serves'` 层有一段占位垃圾（`ancestorsOf({ nodes: ug.goal ? ... })`）：重写为 `ancestorsOf`（需传 LoadedGraph——UserGraph 里存 goal 引用不够，考虑让 renderUserGraph 接收 graph 或在 UserGraph 里带 index/祖先查找；实现时定，但接口要贴设计 §3.6 签名）。`void module` 占位同理：带 `module` 时按设计 §3.6 列该模块服务的步骤。
  4. `outdatedSince` 里 `void leaves` 残留删除；其 `liveSteps` 参数应传流程全部 live 步骤（含 proposed），调用点 `flowViewOf` 现在传的是 approved——改。
  5. `gapsOf` 以私有 `Index` 类型出现在导出签名上——按设计 §3.6 把 `gapsOf` 收为模块内私有（userGraphOf 内部调用）。
  6. `step:failed` 缺口必须镜像 failed 状态：加「!outdatedSince」条件（现在只看 last.ok）。
  7. `stepStateOf` 的嵌套三元重写为平铺 if。
  8. `userReleaseItems` 的 `flows:modules` 项改为恒在（无候选时 vacuous ok），六项门面齐。
  9. `USER_LIMITS.appended` 未核实存在（schema.ts 只读到 `branches` 行）——用前先查；没有就补字段或用设计值 8000 并在 schema 注明出处。
  10. `walkRecordsOf` 依赖历史条目带 `evidence`——确认 engine 的 walk 落历史路径确实写 evidence（UG2 实现过，读 `engine.ts` planWalk/commit 处再定）。

恢复后的处理（UG3 提交）：分支先合入 origin/main（含 `bc25baa` fix(audit)），合并提交单独。10 条清单逐条处理：1 删本地 `GraphEdge` 与两个死助手；2 样稿一行整段重写（`stepsLine`）；3 `UserGraph` 带 `graph`，`serves` 一级按服务者的最近特性祖先、带模块时按模块子树；4 `outdatedSince` 的步骤集取全部 `live` 步骤，残留删除；5 `gapsOf` 收为模块内私有；6 `step:failed` 取自 `failed` 状态；7 平铺 if；8 按设计（见上面差异）；9 `USER_LIMITS.appended` 已在 `schema.ts`（8000）；10 `planWalk` 的历史条目带 `evidence`，已核实。清单之外按设计改正：孤儿第 4 条看祖先自己的 `serves`、孤儿只在目标子树里找、`服务：无` 的模块与它下面没有 `serves` 的活不标（评审 5 发现 5）、`flow:no-test` 对全部 `live` 步骤判、`featureLeaves` 只数 `live` 的活。

### 恢复后的确切下一步（impl-plan UG3 行 + 验收 16–26）

1. 按上面清单修 `src/graph/user-graph.ts`；导出面贴设计 §3.6：`isUserNode`/`userGraphOf`/`stepsServedBy`/`renderUserGraph`/`userReleaseItems`/`userCompletionItems`（+内部 `stepStateOf`/`flowStateOf` 折叠/`gapsOf`/`walkSpecOf`/`estimatedTimeoutMs`）。
2. 新建 `tests/graph-user-helpers.ts`：按设计 §2.9 节点表造库夹具（含 feat-legacy/task-15/task-16 非 live 例、指定时刻的 walk 历史、norm-merge-gate 的 acceptance walk 行）。
3. 新建 `tests/graph-user-state.spec.ts`、`tests/graph-user-render.spec.ts`，对 §2.9 期望输出逐条断言（gaps 恰为 step:unserved(step-11)、step:failed(step-21)、work:orphan(feat-export)、flow:no-test(flow-2, flow-4)；各状态/counts/显示顺序）。
4. 接线四处小改：`projection.ts`（gatesOf 的 serving/steps 门、projectNode 的 serves/servedBy/next/previous）、`stage.ts`（releaseSet/bigLoopSet/moduleSet 滤非 live 用户节点）、`tools.ts`（graph_open 的 items.proposals 过 liveOf）、`plain-view.ts`（needsOf 滤「本身或祖先不 live 的用户提议」）、`reminder.ts`（行文）。
5. 既有测试小钉：`tests/execute-brief.spec.ts` 钉用户节点 bad_task；`tests/graph-stage.spec.ts` 加「用户节点 source 不让规划列过」；`tests/graph-store.spec.ts` 钉 dev-graph 计数不变。
6. 文档 §2.5、§2.12 同批；门禁串行、日志 `.llm/logs/ug-u3-*.log`、退出码不吞；绿后一个提交推送，提交信息形如 `feat(user-graph): states, gaps and the user pages derive from the graph (U3)`。
