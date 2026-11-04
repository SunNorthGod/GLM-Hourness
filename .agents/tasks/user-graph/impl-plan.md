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
