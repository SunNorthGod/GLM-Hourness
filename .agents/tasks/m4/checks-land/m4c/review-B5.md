# B5 审查：上限被截住时只告诉主 Agent，`check_limit` 调高与撤回

提交 `f1b518f`（本地，未推；`origin/m4-checks..HEAD` 只有这一个，没有另外的文档提交）。对照 `checks-plan.md` 第 5 批、设计 §6.3.1「调高上限」、§7.2、§6.8 `details`、§14.1 `env-checks-timeout` 末句、§14.2 决定三 ⑥ 与 F12、N9、N10、N16、N17 ③、P13-01、F20。

结论：APPROVED，无阻塞项。

## 核对过的要求

- `check_limit`（`src/env/limit-tool.ts`）：检查顺序 forbidden → invalid（多余字段、`check`、`action`、`seconds` 对现行上限、`reason` 1–300 且 `plainWordsIn` 为空）→ unknown_check（`hint` 列出可调的键）→ not_held → unavailable，与 §6.3.1 五步一致；`reset` 无设置时 `noop` 不写；成功返回 `{outcome, check, capS, previousCapS, message}`。描述与 §6.3.1 原文逐字相同，数与例子由 `CHECK_TIMEOUT_CAP_MS`、`CHECK_TIMEOUT_RAISED_MAX_MS`、`CHECK_LIMIT_HELD_MS`、`CHECK_LIMIT_EXAMPLE` 生成。
- `heldForRaise` 只数晚于这一项 `limits.jsonl` 最后一行的记录：最近一条 `value` 带 `capped`，或 7 天内 `limitMs` 等于现行上限的 `timeout`（N9）。`heldAtCeiling` 判出的集合包含于 `heldForRaise`，提醒里给的键与秒数下界交给工具时不会得到 `unknown_check` 或 `not_held`（N16）。
- `limits.jsonl`：每项最后一行为准，坏行跳过计数，读不出按没有设置；`check_limit` 不写 `timing.jsonl`（测试比对文件全文）。
- `timeout.ts`：`nextValue` 以设置为 `capMs`，`ValueLine.cap` 记 `{by: 'setting', capS, at, reason}`；超时句的「at its ceiling」按现行上限判（差异 37）。
- `runner.ts`：`CHECK_RAISED_SLOTS = 1`，`raised` 按 `capMs > CHECK_TIMEOUT_CAP_MS`（§6.3 规矩 1 的字面）；`pump` 跳过被占满的调高项、保留原位、后面的普通项照常开始；`finally` 里同步减计数再 `pump`。一步等待仍是 `min(最长超时 + 1.5 s, stepDeadlineMs)`，调高不让一步等得更久。
- 环境提醒：held 行只在循环板在、会话头不带 `origin: 'subagent'` 时加，在正文里，状态一变正文摘要就变、重新注入；子 agent 不收（L2 与探针各钉一次）。
- 明细与晨报「上限已调高」只读 `limits.jsonl` 最后一行，不读 `ValueLine.cap`；`reset` 之后不跑检查两处即消失（`env-checks.spec`、`workflow.spec` 都用 `cap: {by: 'setting'}` 的值行反证）。晨报那句与设计逐字一致。
- 注册：`inject = ['tools']` 与补丁行 `inject: [tools]` 同批，`ENV_TOOL_NAMES = ['check_limit']` 不常驻，`tests/contracts.spec.ts` 钉注册、延迟与补丁行；env 行仍 `disabled: true`。
- 文档同批：ORCHESTRATION §7.5、DESIGN §2.2 env 行与 §7 降级表、计划勾选与差异 30–38。

## 门禁证据（读日志，未重跑）

`.llm/logs/m4c-B5-{build,preflight,test,probe}.log`：build、preflight 正常结束；test 日志 eslint 76 suppressed、knip 19、jscpd 1，无 `not ok`，新 spec `env-limit.spec.ts` 已登记进 `test:1`，各新例 `ok`；probe `366/366 passed`，含 `env-checks-ceiling` 四条。与提交信息一致。

## 非阻塞的观察（不要求本批改）

1. 计划差异 35 写「没有项目目录时 `check_limit` 返回 `unavailable`」。按代码，`home` 为 `undefined` 时 `raise` 读不到账、先在第 4 步得 `not_held`，`reset` 读不到设置得 `noop`，`unavailable` 的那条分支到不了（它留着给类型收窄）。这种情况下提醒本来就不出 held 行（`heldLines` 在没有 `home` 时返回空），所以对模型没有矛盾。差异 35 的措辞与行为不符，写最终报告时按实际行为说即可。
2. 已调到 600 秒仍被截住时，held 行写「seconds (601 to 600)」。设计没给这种情形的写法；工具会返回 `invalid`，句子后半「改检查行要人批准」仍成立。
3. held 行每条约 430 字符，算在环境提醒 1500 字符的整体上限里；工具行多时先被挤掉的是工具行，3 条以上 held 行时正文会超过 1500。1500 作用于整条正文是 E2 起的既有做法，设计 §7.2 对 held 行没有给长度预算。
4. 设计 §2.2 文件表里 `limit-tool.ts` 一行写了「追加与整理」，§6.3.1 只写「只追加」，没有给保留条数；计划与本批都没做整理。
