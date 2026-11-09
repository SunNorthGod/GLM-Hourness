# B4 审查第 2 轮：M4 自带的检查器（m4-checks）

审查对象：`010d85c`（B4，未推送；`origin/m4-checks..HEAD` 只有这一个提交，父提交 `7f9697b` 为已推的 B3）。第 1 轮审的是 `91e6315`，本轮按 `git diff 91e6315 010d85c`（11 个文件，+128/−41）核对 F1、F2 的修法与受修法影响的路径。工作树干净。

## 门禁证据（读日志，未重跑）

日志 `.llm/logs/m4c-B4-*.log` 写于 06:52–07:07，晚于第 1 轮审查（06:42），早于提交（07:10），提交后工作树无改动。

- build：tsc 四个工程与 build-ui 无错。
- preflight：`OK (… dsh-hourness 13 rows; 18 rows composed …)`。
- npm test：各段 `# tests` 合计 2808，没有 `not ok`、没有 `# fail` 非 0；eslint 76 suppressed、knip 19、jscpd 1，均未升。修法新增与改写的用例都在日志里且通过：`health.spec`「a remark (degrades false) …」、`env-checks.spec`「every failure is on the row health and degrades it …」、`env-timeout.spec`「nextValue: the source of each value …」、`workflow.spec`「the checks' timeouts: one line per check …」。
- probe：`m4c-B4-probe.exit` 为 0，`probe: 362/362 passed`。

env 行仍 `disabled: true`；`src/loops/` 未改；`status.json` 记 `mainMerged: true`（`4516ec6`），推送闸门成立。

## F1（行健康）复核：已修

- `src/env/runner.ts` 的 `failed()`：每次跑不起来、被执行器拒绝、输出读不懂都写 `checks-failed`（检查键加原因第一行），降级；第 3 次改写为「本会话不再跑」并保留 `skipped` 流程。`crashed` 与 `refused` 走同一个 `else` 分支进 `failed()`，输出读不懂的分支也进 `failed()`。
- 超时分支写 `checks-timeout`（上限与实际耗时），`degrades: false`；同一项下一次读得出的运行同时撤回两条。
- `src/shared/health.ts`：`note` 加可选 `degrades`（默认 `true`，其他行的调用不变）；`compose` 只在有降级的说明时升到 `degraded`，`inactive` 保持，备注只加文字。`health.spec` 覆盖只有备注、备注加降级、撤回降级三种状态。
- L2：单次 crash、单次输出读不懂、执行器 `refused`（`outside-project`）、超时的行健康断言与撤回断言都在 `env-checks.spec`。
- 文档：`docs/DESIGN.md` §7 env 一行改回每次进行健康、超时不降级；§2.5 补了 `note` 与不降级备注的说明；ORCHESTRATION §7.5 同批改。

受影响路径：env 行的说明键从 4 个（`files-edited`、`checks`、`check-lines`、`checks-board`）变成 6 个，`NOTE_LIMIT` 是每会话 4 条。`checks-board` 只在循环板不在时出现，那时检查不跑；`files-edited` 在下一次事件交上后撤回。要 5 条同时在场，需要事件交不上、检查行读不懂、超时账出错、某项失败、某项超时同时成立，属于推测性的组合，不列为阻塞。

## F2（晨报来源）复核：已修

- `src/env/timeout.ts` 的 `valueSourceText(line, session)`：`session` 为真（晨报）时先写来源再接「想要 x 秒，被上限截在 y 秒」；为假（循环板明细，`runner.ts` 的 `details`）时仍只写截住那句，与 §6.8 一致。
- `src/workflow/morning-report.ts:230` 以 `session = true` 调用。`workflow.spec` 的 `tool-2/eslint` 期望改为带来源，新增 `tool-4/vitest`（人估、rc.3 会话 id）一例；`env-timeout.spec` 两种写法各一条断言。
- 附带改动：会话 id 去掉 rc.3 的 `session-` 前缀后取前 8 位。只影响晨报显示，非 rc.3 的 id 不变（`sess-1` 的断言照过）。

## 结论

第 1 轮的 F1、F2 都已修，修法没有引入新的可达错误，门禁四道退出码 0、探针 362/362。没有剩余阻塞项：APPROVED。
