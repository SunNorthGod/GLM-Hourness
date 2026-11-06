# 评审：m4-reanchor-violations（第 4 轮）

范围：`git diff origin/main...HEAD`，HEAD 42c8823（合入 origin/main 3cc7408）之上的实现提交 9d40df5。fetch 后 origin/main 为 38d3a9d，只多图提交，不影响本 diff。对照节点 `m4-reanchor-violations` 的 2 条验收与任务书 4 项。

## 证据

- 任务 1（压缩后一次注入、无拦截不加、平时不加、缓存不变）：`src/graph/reminder.ts` `projectionNotice` 只在 `reason === 'compaction'` 时调 `reanchorExtra`；`digest` 仍取 `digestOf(body)`（投影正文），附加行不进摘要，下一步 `changeReason` 得 undefined，不再注入；其余理由的 notice 文本与改动前逐字相同。`src/graph/reanchor.ts` `sessionDenials` 按 `sessionId` 过滤后走 `ruleStats`（`src/guard/measure.ts`，denial 与 late-denial 计数；followup、deferral、rule-record、gap 不计），`reanchorLines` 在 `rules.length === 0` 时不写这一段。L2 三条用例钉住有拦截（逐字文本与顺序、他会话与非拦截记录不计、下一步为空、目标轮只带投影）、无拦截（流水不存在与存在两种）、读不到。
- 任务 2（非目标评估）：ORCHESTRATION.md §2.5「重锚附带」第 1 段与「非目标的评估结论」写明做、只在重锚带、理由与不带目标验收的理由。
- 任务 3（读不到降级 + 行健康）：ENOENT 算无拦截；无项目目录或其他读错返回 `problem`，只省去第二段，投影照常；`src/graph/index.ts` 的 `told` 用 `health.note(sessionId, 'graph-reanchor', …)` 挂备注（默认 degrades），读成功时传 undefined 撤下。`health.note` 每会话上限 4 个键，图行现有 `graph-loop-entry`、`graph-timing`、`graph-reanchor` 三个，不会被丢。L2 用目录占位制造 EISDIR，核对状态 degraded、原因文本、无告警、投影仍注入、恢复后撤下。
- 任务 4（文档同批、L2/L3）：文档与行为在同一提交 9d40df5。L3 `glm-graph-compact` 首步写节点文件被 graph-files-only 拦下，新增两条检查：重锚 notice 带 `- graph-files-only: 1` 与焦点所在目标的非目标；非重锚 notice 不带拦截段。
- 门禁（读提交说明，未重跑）：合入提交上 build、preflight、npm test（183 spec，0 失败）全绿；lint 棘轮 eslint 73 / knip 18 / jscpd 1 未上升；L3 probe 在 9d40df5 上 422/422，合入只带 main 已过门禁的改动，不在重锚路径上。
- 规矩：diff 不含 docs/graph、不碰 ~/.dsh；`installProjection` 的 `onRead` 默认值去掉、`reanchor` 改必填，唯一调用方 `src/graph/index.ts` 已传，没有兼容分支或重复实现。

## 挡路发现

无。

## 不挡路

- 9d40df5 的提交说明仍是 wip 文案（「full npm test… not yet run」），门禁结果写在合入提交里。合入步决定是否整理成单提交。
- 「改动在 main 上」属于合入步，本轮不评。
