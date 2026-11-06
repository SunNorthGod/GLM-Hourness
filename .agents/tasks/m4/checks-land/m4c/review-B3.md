# B3 审查第 1 轮：人批准工具节点时看到的超时（m4-checks）

审查对象：`7f9697b`（B3，未推送；`origin/m4-checks..HEAD` 只有这一个提交，父提交 `9af4567` 为已推的 B2）。工作树干净。对照：`checks-plan.md` 第 3 项（含差异 13–15）、设计 §6.3.1 第 1–3 条、§6.3.1 的 `EstimateLine`、§15 失败表「估计的来源：写 `EstimateLine`」一行、§14.2 决定三 ①②③ 与 N12。

## 验收逐条

- checks #8「批准时每条检查行旁边一句超时、写明从哪个估计算出、没有估计写明用上限」与「第一次的超时按估计」：`src/env/timeout.ts` 的 `checkTimeout` 按估计或最近 10 次最慢一次乘 3、下限 5 秒、上限 60 秒，超过上限时带 `capped.wantedMs`，无估计无实测取上限；`timeoutText` 由常量拼出 §6.3.1 第 3 条的四句，与设计例句逐字一致（`tests/env-timeout.spec.ts` 逐字断言四句）。成立。
- `graph_propose`、`graph_edit` 的 `timeouts`：`src/graph/tools.ts` 的 `envTimeoutsAfter` 只对这两个操作、只对 `parent === 'env'` 且 `type === 'tool'` 的节点附 `[{check, text}]`，每条读得懂的检查行一项；`WRITE_OUTPUT` 加了可选字段；两个工具的描述末尾都有要主 Agent 把 `text` 原样放在方案里检查行旁边的一句。成立。
- `EstimateLine`：形状与设计 §6.3.1 的接口逐字段一致；`actor`、`historyAt` 取引擎刚写的最后一条历史（引擎的 `edit` 与 `propose` 都只追加一条，`engine.ts:236`、`:474`、`:710`，所以 `history.at(-1)` 就是这次写入）；`session` 取调用方会话 id；propose 记全部带预计的行，edit 只记旧验收条件里没有的整行（旧值为 `null` 时全算新）。写入目录是 `projectHomeFor(ctx, undefined, cwd)`，写前 `ensureLlmIgnored`，与计划差异 2、15 一致。
- 失败路径：写不进时工具结果与 `timeouts` 照常返回，图行行健康记一条并控制台警告一次（测试用一个占住目录位置的文件触发）。`sink` 在 `health` 声明之前定义，但只在工具调用之后异步执行，不会读到未初始化的绑定。
- L2：决定三 ①（1/3/25 秒、无估计、实测 24 秒）、②（四句逐字、≤ 40 码点、过 `proposalLineRefusal`、`plainWordsIn` 为空、数与 `checkTimeout` 一致）、③（env 工具节点带、任务节点与 env 外的工具不带、comment 不带，各写一条带会话、`actor`、`historyAt` 的行）、N12 都有对应用例；新 spec 已登记进 `test:1`。
- L3：场景 `env-checks-timeout` 第一段两条检查：`timeouts` 为「超时 5 秒（估 1 秒，乘 3 不足 5 秒）」；工作区 `.llm/env-checks/timing.jsonl` 恰一条 `estimate`，`session` 等于该请求的会话、`actor` 为 `llm`、`historyAt` 等于引擎写的 propose 历史时刻。
- 文档：`docs/ORCHESTRATION.md` §7.5 实现注同批改写；计划勾选 B3 并补差异 13–15。env 行仍为 `disabled: true`。

计划里列的 `CHECK_STEP_DEADLINE_MS`、`CHECK_TIMEOUT_RAISED_MAX_MS`、`CHECK_QUEUE_WAIT_MS` 没有在本批加入，计划差异 13 已写明理由（无调用方的导出会被 knip 报出）；描述长度测试上限 600 → 700 由差异 14 写明理由。两者都是已记录的取舍。

## 门禁证据（读日志，未重跑）

日志 `.llm/logs/m4c-B3-*.log`：

- build：四个 tsc 工程与 build-ui 无错。
- preflight：`OK (… dsh-hourness 13 rows; 18 rows composed …)`。
- npm test：各段 `# tests` 合计 2784，`# fail` 合计 0，没有 `not ok` 行；eslint 76 suppressed、knip 19、jscpd 1，都没升。提交信息写明第一次因新 spec 的两处 lint 失败、修后整链重跑。
- probe：`353/353 passed`；`env-checks-timeout` 两条、`env-check-command` 四条、`env-notice` 三条全过。

## 推送闸门

`status.json` 记 `mainMerged: true`、合并提交 `4516ec6`，其第二父在 origin/main 上且含 loops-runner 的合并；B3 推送不受闸门阻挡。

## 结论

APPROVED：没有阻塞项。

## 非阻塞记录

- 设计 §15 失败表这一行写的行健康文字是「估计的来源没记上：<原因>」，代码与测试用的是「检查的估计没记下：<原因>」。意思相同，B4 接「会话未记」那半句时可以顺手对齐设计措辞，或在计划差异里记一笔。
- 调用没有会话 id 时 `health.note` 不记，只剩控制台警告；工具调用总有会话，实际走不到。
