# G15 设计补记：drive 的配额耗尽停等（2026-11-20）

定案（图 m7-3 批注 2026-11-20T15:14Z，人原话「全按你推荐的来」）：GLM 配额耗尽时自动推进停下、把重置时间告诉人、到点自动接着跑（不等发话）。形态对齐 M7 设计 0.6 §3.9.5 的 `hourness-peak-wait` 一档（验收第 5 条），触发与恢复源不同。现状：额度投影机器在 `src/shared/quota.ts` 与 glm-llm 的读数、日志与投影（`quota-parse.ts`、`quota-projection.ts`、`quota-journal.ts`），drive（`src/execute/drive.ts`）只有轮次上限与等人两路停等加高峰一路，没有配额路。

## 触发信号：两路结合，都取自计价服务的额度视图

drive 每逢目标轮的第一步（计数器挪动的那一步，D7 位置）经 `pricingService(deps.lookup)` 的 `quota` 成员读一次额度视图，参数 `{waitMs: 0, read: false}`：只用缓存与额度日志拼视图，不在模型步路径上发起网络读、不产生 `glm.quota-read` 事件（读数仍由循环板的 `channel.quota-low` 与面板命令按它们自己的节奏发起）。判定收敛为 `src/shared/quota.ts` 的纯函数 `quotaWaitOf(view, now)`，两条确认路径：

1. **上游限额流水**（适配器侧）：`view.limited` 非空——glm-zcode 适配器对模型请求收到 429 且正文带 BigModel 限额码（`account-signals.ts` 的 `upstreamLimitOf`，1308/1310/1316-1321），`until` 是服务端报文里读出的恢复时刻。这是服务端对「配额没了」的确认。
2. **读数投影**（服务端读数侧）：最近一次读数里 5 小时或每周窗口已用完（`projection.kind === 'spent'` 或 `usedPercent >= 100`）。MCP 窗口与无名窗口不算（与 `quotaLowOf` 同一 exclusion：MCP 用完不影响模型请求）。

**不用预估触发**：投影的 `exhausts`（预计何时用完）不停车。预估按两次读数的速度外推，可能错报；定案写的是「耗尽时」，且提前停会把还有额度的时间也停掉。提前预警已有循环板的 `channel.quota-low` 条目管（它可以用 `exhaustsWithinMinutes` 参数），drive 只在确认耗尽后停。

**重置时刻**：`limited.until` 优先（服务端报文给的最准），否则已用完窗口的 `resetAt`（5 小时与每周都在时取较早重置的那个，通常是 5 小时窗）。两条路都拿不到重置时刻时**不停**：定案的形状是「停、告知重置时刻、到点接着跑」，没有时刻三件都做不到；此时派活的失败与空转计数仍走原路，下一次读到带时刻的信号再停。重置时刻已过（读数过期、窗口其实已重置）也不算等待。

## 停等形态与恢复：照 `hourness-peak-wait` 的形状

- 停：`goals.block` 原因码 **`hourness-quota-wait`**，消息带重置时刻（宿主时区 `HH:MM`，与高峰同一 `clockOf`），`ROW_CODES` 收编（行自己停的不写图批注）；`drive.jsonl` 记 `{op: 'quota-wait', goal, until, code?}`；指标 `execute.goal {op:'block', code}`。blocked 期间空转与高峰计数都不动；主 Agent 不受影响，人随时能说话，也可 `update_goal resume` 提前续（消息尾句与高峰同款）。
- 人的告知面：goal 的 blocked 消息（面板 goal 条与派发状态提醒的 state 行）带重置时刻，同高峰的告知面；停的当下不发新通知（与高峰一致），`/glm-status`、`/hourness` 的额度节与循环板 `channel.quota-low` 照旧是人对账户自己看的面。
- 接：三路。① drive 自己的定时器，`until + 5 分钟` 宽限（与高峰的宽限同值：盖服务端与宿主钟差和秒级边界），到点 `goals.resume`，`drive.jsonl` 记 `resume`（reason `quota-end`），指标 `execute.goal {op:'resume', resumeWhy:'quota-end'}`，并向持有者发一条通知叫主 Agent 接着做（同 `peakTimer` 的形状；配额没有循环板条目接应，定时器就是主路，所以不发 `execute.loop-fallback`、不记接管行健康）。② 步路径兜底：blocked 状态下每步从 `drive.jsonl` 读回 `until`，过了就恢复（reason 走同一动作；重启后定时器丢了靠这条接上，与高峰的 `peakOver` 同形）。③ 人说继续，`update_goal resume`。
- 恢复后若服务端实际没重置：请求再吃 429，适配器再写 upstream-limit，drive 下一个目标轮再停——自愈环，不需要恢复前再读一次额度确认。

## 接缝与验证

- `src/shared/quota.ts`：`QuotaWait` 类型 + `quotaWaitOf` 纯函数；不 import Node 内建，两包可用。
- `src/execute/drive.ts`：读视图、`quotaBlock`/`quotaTimer`/`resumeAfterQuota`、`driveDecision` 加 `quotaOver` 输入与 blocked 行、`holdLine` 加 `quota-waiting` 档、`DriveLine` 加 `quota-wait` 与 `code`、`SessionState.cancelQuota`；`execute.resume-drive` 保持高峰专用（循环板没有配额结束条目）。
- L2：`tests/quota.spec.ts` 钉 `quotaWaitOf` 的判定分支（两路触发、时刻取舍、无时刻不停、已过不停、MCP 不算）；`tests/execute-quota.spec.ts`（drive rig 注入假 `glmHournessPricing.quota`）钉停等形状：首轮耗尽即停、消息带时刻、空转不计、定时器宽限后接上、重启后步路径接上、提前续不归它管。
- L3 探针 `glm-exec-quota`：场景 home 种进额度日志（一条读数，5 小时窗 100%，`resetAt` 约三分钟后），`/wish` → 放行 → 目标轮第一步停 `hourness-quota-wait`，goal 的消息带重置时刻，主 Agent 后续步不受影响，干净退出；定时器恢复在 L2 钉（headless 不等分钟级，与高峰的分工一致）。
- docs：ORCHESTRATION 的停等记录（§4.6 与 §17.13）与 M7 设计 §3.9 的出入记进修订记录，同批提交。
